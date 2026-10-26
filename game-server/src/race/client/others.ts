import * as THREE from 'three'
import type { KartState } from '../drive/kart.ts'
import type { DriveWorld } from '../drive/world.ts'
import type { DriverInfo, Pose } from '../protocol.ts'
import { groundNormal } from './drive.ts'
import type { Take } from './cinema.ts'
import type { Effects, KartEffects } from './effects.ts'
import { buildKartModel, type KartModel } from './kart.ts'
import type { MinimapKart } from './minimap.ts'

/**
 * Everyone else's karts, as the lobby reports them about 20 times a second:
 * each drawn in its driver's colours with their name over it, gliding from
 * the last reported pose to the newest one so the motion stays smooth.
 * While you watch a race instead of driving it, the camera follows one.
 */

/** Poses arrive this often; each one is reached this long after it came in. */
const REPORT_MS = 50
const FOLLOW = { distance: 8, height: 3.4, rate: 4 }

interface Other {
    model: KartModel
    fx: KartEffects | null
    look: DriverInfo
    from: Pose
    to: Pose
    receivedAt: number
    up: THREE.Vector3
    /** Where it's drawn now. */
    shown: Pose
}

export interface Others {
    /** The lobby's members; karts of those who left go away. */
    setDrivers(drivers: readonly DriverInfo[]): void
    /** The latest poses (karts missing from the report aren't on the track). */
    receive(karts: ReadonlyArray<{ id: string; pose: Pose }>): void
    update(dt: number): void
    minimapKarts(): MinimapKart[]
    /** Where kart `id` is drawn now; null when it isn't on the track. */
    positionOf(id: string): { x: number; y: number; z: number } | null
    /** Everyone else as drawn now, with their looks: for the replay's recording. */
    takes(): Take[]
    /** Hides (or shows again) everyone else's karts: the replay draws its own. */
    setVisible(visible: boolean): void
    /** Chips: kart `id` bulges out (or back). */
    setFat(id: string, fat: boolean): void
    /** Puts the camera behind kart `id`, easing towards it; false when it isn't on the track. */
    follow(id: string, camera: THREE.PerspectiveCamera, dt: number): boolean
}

export function createOthers(world: DriveWorld, scene: THREE.Scene, effects: Effects | null = null): Others {
    const others = new Map<string, Other>()
    let drivers = new Map<string, DriverInfo>()
    const chase = new THREE.Vector3()
    let following: string | null = null

    const remove = (id: string) => {
        const other = others.get(id)
        if (!other) return
        scene.remove(other.model.root)
        others.delete(id)
    }

    return {
        setDrivers(list) {
            drivers = new Map(list.map(driver => [driver.id, driver]))
            for (const id of [...others.keys()]) if (!drivers.has(id)) remove(id)
        },

        receive(karts) {
            const now = performance.now()
            const seen = new Set<string>()
            for (const { id, pose } of karts) {
                const look = drivers.get(id)
                if (!look) continue
                seen.add(id)
                const other = others.get(id)
                if (other) {
                    other.from = other.shown
                    other.to = pose
                    other.receivedAt = now
                    continue
                }
                const model = buildKartModel(look)
                scene.add(model.root)
                others.set(id, {
                    model,
                    fx: effects?.forKart() ?? null,
                    look,
                    from: pose,
                    to: pose,
                    receivedAt: now,
                    up: new THREE.Vector3(0, 1, 0),
                    shown: pose,
                })
            }
            for (const id of [...others.keys()]) if (!seen.has(id)) remove(id)
        },

        update(dt) {
            const now = performance.now()
            for (const other of others.values()) {
                const t = Math.min(1, (now - other.receivedAt) / REPORT_MS)
                const { from, to } = other
                const shown: Pose = {
                    ...to,
                    x: THREE.MathUtils.lerp(from.x, to.x, t),
                    y: THREE.MathUtils.lerp(from.y, to.y, t),
                    z: THREE.MathUtils.lerp(from.z, to.z, t),
                    heading: from.heading + wrap(to.heading - from.heading) * t,
                    speed: THREE.MathUtils.lerp(from.speed, to.speed, t),
                }
                other.shown = shown
                const target = shown.airborne ? new THREE.Vector3(0, 1, 0) : groundNormal(world, shown.x, shown.z)
                other.up.lerp(target, 1 - Math.exp(-8 * dt)).normalize()
                other.model.pose(shown.x, shown.y, shown.z, shown.heading, other.up, asKart(shown), shown.steer, dt)
                other.fx?.update({ ...shown, vy: 0, boosting: shown.boost }, dt)
            }
        },

        takes() {
            return [...others.entries()].map(([id, other]) => ({ id, look: other.look, pose: { ...other.shown } }))
        },

        setVisible(visible) {
            for (const other of others.values()) other.model.root.visible = visible
        },

        positionOf(id) {
            const shown = others.get(id)?.shown
            return shown ? { x: shown.x, y: shown.y, z: shown.z } : null
        },

        setFat(id, fat) {
            others.get(id)?.model.setFat(fat)
        },

        minimapKarts() {
            return [...others.values()].map(other => ({
                x: other.shown.x,
                z: other.shown.z,
                heading: other.shown.heading,
                isYou: false,
                colour: other.look.body,
            }))
        },

        follow(id, camera, dt) {
            const other = others.get(id)
            if (!other) return false
            const { x, y, z, heading } = other.shown
            const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
            const wanted = new THREE.Vector3(x, y, z).addScaledVector(forward, -FOLLOW.distance)
            wanted.y = Math.max(y, world.ground(wanted.x, wanted.z)) + FOLLOW.height
            if (following !== id) chase.copy(wanted)
            following = id
            chase.lerp(wanted, 1 - Math.exp(-FOLLOW.rate * dt))
            camera.position.copy(chase)
            camera.lookAt(x + forward.x * 4, y + 1.2, z + forward.z * 4)

            return true
        },
    }
}

/** Enough of a kart's state for its model to spin the wheels, show sparks and the flame. */
function asKart(pose: Pose): KartState {
    return {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        vx: -Math.sin(pose.heading) * pose.speed,
        vy: 0,
        vz: -Math.cos(pose.heading) * pose.speed,
        heading: pose.heading,
        airborne: pose.airborne,
        drift: pose.drift,
        charge: pose.charge,
        boost: pose.boost ? 1 : 0,
        padCooldown: 0,
        sinking: 0,
        surface: 'road',
        nitro: 0,
        surge: 0,
    }
}

function wrap(angle: number): number {
    return angle - Math.round(angle / (2 * Math.PI)) * 2 * Math.PI
}
