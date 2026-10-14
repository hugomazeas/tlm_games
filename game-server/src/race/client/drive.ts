import * as THREE from 'three'
import { createKart, forwardSpeed, type KartInput, type KartState, resetKart, STEP, stepKart } from '../drive/kart.ts'
import type { DriveWorld, Pad } from '../drive/world.ts'
import { buildKartModel, DEFAULT_LOOK, type KartLook } from './kart.ts'

/**
 * Driving in the viewer: the kart (kart.ts), a chase camera, the keyboard, and
 * the fixed-rate loop that steps the physics and draws in between steps.
 * W/S or ↑/↓ throttle and brake, A/D or ←/→ steer, Space or Shift drift, R reset.
 */

/** Keyboard steering eases in and out this fast (per second), so a tap isn't a jerk. */
const STEER_RATE = 6
/** The chase camera sits this far behind and above, pulling back with speed. */
const CHASE_DISTANCE = 6
const CHASE_HEIGHT = 2.6
/** How quickly the camera catches up, per second. */
const CHASE_RATE = 5
const BASE_FOV = 70
const PAD_LIFT = 0.14

export interface Driver {
    kart: KartState
    /** The steering as eased in from the keys, −1 (right) to 1 (left). */
    readonly steer: number
    /** Steps the physics to catch up with `dt` seconds and poses the model and camera. */
    update(dt: number): void
    /** Puts the kart on the nearest road to x, z, facing about `heading`. */
    placeAt(x: number, z: number, heading: number): void
    /** Puts the kart exactly at x, z, stopped, facing `heading`. */
    place(x: number, z: number, heading: number): void
    reset(): void
    setActive(active: boolean): void
    /** Held in place, ignoring the keys: on the grid before the green light. */
    frozen: boolean
    /** Called after every physics step, with the kart before and after it. */
    onStep: ((before: KartState, after: KartState) => void) | null
    /** What R does instead of the nearest road, when set: a race puts you back on your last gate. */
    onReset: (() => void) | null
}

export function createDriver(
    world: DriveWorld,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    look: KartLook = DEFAULT_LOOK
): Driver {
    // No name tag over your own kart: you know who you are, and it hides the road ahead.
    const model = buildKartModel(look, false)
    scene.add(model.root)
    scene.add(buildPads(world))

    const keys = new Set<string>()
    let active = false
    let steer = 0
    let previous = createKart(world, 0, 0, 0)
    let current = previous
    let accumulator = 0
    const up = new THREE.Vector3(0, 1, 0)
    const chase = new THREE.Vector3()
    let chaseReady = false

    document.addEventListener('keydown', event => {
        if (!active) return
        keys.add(event.code)
        if (event.code === 'KeyR') {
            if (driver.onReset) driver.onReset()
            else driver.reset()
        }
    })
    document.addEventListener('keyup', event => keys.delete(event.code))
    window.addEventListener('blur', () => keys.clear())

    const held = (...codes: string[]) => codes.some(code => keys.has(code))

    const read = (dt: number): KartInput => {
        const wanted = (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0)
        steer += THREE.MathUtils.clamp(wanted - steer, -STEER_RATE * dt, STEER_RATE * dt)

        return {
            throttle: (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0),
            steer,
            drift: held('Space', 'ShiftLeft', 'ShiftRight'),
        }
    }

    const driver: Driver = {
        get kart() {
            return current
        },

        get steer() {
            return steer
        },

        update(dt) {
            if (!active) return
            accumulator = Math.min(accumulator + dt, 0.25)
            while (accumulator >= STEP) {
                const input = read(STEP)
                previous = current
                current = driver.frozen ? current : stepKart(world, current, input)
                driver.onStep?.(previous, current)
                accumulator -= STEP
            }
            const blend = accumulator / STEP
            const x = THREE.MathUtils.lerp(previous.x, current.x, blend)
            const y = THREE.MathUtils.lerp(previous.y, current.y, blend)
            const z = THREE.MathUtils.lerp(previous.z, current.z, blend)
            const heading = previous.heading + wrap(current.heading - previous.heading) * blend

            // Lean with the ground under you; in the air, slowly level out.
            const target = current.airborne ? new THREE.Vector3(0, 1, 0) : groundNormal(world, x, z)
            up.lerp(target, 1 - Math.exp(-(current.airborne ? 2 : 12) * dt)).normalize()
            model.pose(x, y, z, heading, up, current, steer, dt)

            const speed = forwardSpeed(current)
            const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
            const back = CHASE_DISTANCE + Math.max(0, speed) * 0.09
            const wanted = new THREE.Vector3(x, y, z).addScaledVector(forward, -back)
            wanted.y = Math.max(y, world.ground(wanted.x, wanted.z)) + CHASE_HEIGHT + Math.max(0, speed) * 0.025
            if (!chaseReady) chase.copy(wanted)
            chase.lerp(wanted, 1 - Math.exp(-CHASE_RATE * dt))
            chase.y = Math.max(chase.y, world.ground(chase.x, chase.z) + 1)
            chaseReady = true
            camera.position.copy(chase)
            camera.lookAt(x + forward.x * 4, y + 1.2, z + forward.z * 4)
            camera.fov = THREE.MathUtils.lerp(
                camera.fov,
                BASE_FOV + Math.max(0, speed) * 0.25 + (current.boost > 0 ? 8 : 0),
                1 - Math.exp(-4 * dt)
            )
            camera.updateProjectionMatrix()
        },

        placeAt(x, z, heading) {
            const road = world.nearestRoad(x, z, heading)
            previous = current = road
                ? createKart(world, road.x, road.z, road.heading)
                : createKart(world, x, z, heading)
            accumulator = 0
            chaseReady = false
        },

        place(x, z, heading) {
            previous = current = createKart(world, x, z, heading)
            accumulator = 0
            chaseReady = false
        },

        frozen: false,
        onStep: null,
        onReset: null,

        reset() {
            previous = current = resetKart(world, current)
            chaseReady = false
        },

        setActive(isActive) {
            // Leaving the wheel gives the camera its normal lens back (speed widens it).
            if (active && !isActive) {
                camera.fov = BASE_FOV
                camera.updateProjectionMatrix()
            }
            active = isActive
            model.root.visible = isActive
            keys.clear()
            steer = 0
        },
    }
    model.root.visible = false

    return driver
}

/** The ground's normal at a point, from its slope a metre either way. */
export function groundNormal(world: DriveWorld, x: number, z: number): THREE.Vector3 {
    const dx = world.ground(x + 1, z) - world.ground(x - 1, z)
    const dz = world.ground(x, z + 1) - world.ground(x, z - 1)

    return new THREE.Vector3(-dx, 2, -dz).normalize()
}

/** Every boost pad as one mesh: orange chevrons pointing along the road, laid on the ground and scrolling. */
function buildPads(world: DriveWorld): THREE.Mesh {
    const positions: number[] = []
    const uvs: number[] = []
    const corner = (pad: Pad, along: number, across: number) => {
        const x = pad.x + pad.dx * along - pad.dz * across
        const z = pad.z + pad.dz * along + pad.dx * across
        positions.push(x, world.ground(x, z) + PAD_LIFT, z)
    }
    for (const pad of world.pads) {
        const a = pad.length / 2
        const w = pad.width / 2
        corner(pad, -a, -w)
        corner(pad, a, -w)
        corner(pad, a, w)
        corner(pad, -a, -w)
        corner(pad, a, w)
        corner(pad, -a, w)
        uvs.push(0, 0, 0, 2, 1, 2, 0, 0, 1, 2, 1, 0)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

    const texture = new THREE.CanvasTexture(chevrons())
    texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
    mesh.onBeforeRender = () => {
        texture.offset.y = (performance.now() / 600) % 1
    }

    return mesh
}

/** One chevron pointing up the texture, on orange. */
function chevrons(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff7a1a'
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = '#ffe14d'
    context.beginPath()
    context.moveTo(32, 8)
    context.lineTo(60, 36)
    context.lineTo(60, 52)
    context.lineTo(32, 24)
    context.lineTo(4, 52)
    context.lineTo(4, 36)
    context.closePath()
    context.fill()

    return canvas
}

function wrap(angle: number): number {
    return angle - Math.round(angle / (2 * Math.PI)) * 2 * Math.PI
}
