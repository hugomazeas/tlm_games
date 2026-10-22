import * as THREE from 'three'
import {
    createKart,
    forwardSpeed,
    type KartInput,
    type KartMods,
    type KartState,
    resetKart,
    STEP,
    stepKart,
    TOP_SPEED,
} from '../drive/kart.ts'
import type { DriveWorld, Pad } from '../drive/world.ts'
import type { Effects } from './effects.ts'
import { buildKartModel, DEFAULT_LOOK, type KartLook } from './kart.ts'

/**
 * Driving in the viewer: the kart (kart.ts), a chase camera, the keyboard, and
 * the fixed-rate loop that steps the physics and draws in between steps.
 * W/S or ↑/↓ throttle and brake, A/D or ←/→ steer, Space or Shift drift, R reset.
 */

/** Keyboard steering eases in and out this fast (per second), so a tap isn't a jerk. */
const STEER_RATE = 6
/** The chase camera sits this far behind and above, pulling back a little with speed. */
const CHASE_DISTANCE = 4.6
const CHASE_HEIGHT = 1.9
/** How quickly the camera swings round behind the kart in a bend, per second. */
const CHASE_RATE = 5
const BASE_FOV = 70
/** The lens widens this many degrees per m/s, and more on a boost: speed you feel at the edges. */
const FOV_PER_SPEED = 0.4
const FOV_BOOST = 10
/** Near top speed the camera shakes, this much at most (metres). */
const SHAKE = 0.05
/** The welcome screen's camera: circling this far out and up, this many radians a second. */
const SHOWCASE = { radius: 5.2, height: 1.8, turn: 0.35 }
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
    /** The kart parked where it is with the camera circling it: the welcome screen's view. */
    showcase(dt: number): void
    /** Repaints your kart (the welcome screen's colour pickers). */
    paint(body: string, accent: string): void
    /** Held in place, ignoring the keys: on the grid before the green light. */
    frozen: boolean
    /** The tyres' grip under the race's weather (weather.ts GRIP): 1 when dry. */
    grip: number
    /** Called after every physics step, with the kart before and after it. */
    onStep: ((before: KartState, after: KartState) => void) | null
    /** What R does instead of the nearest road, when set: a race puts you back on your last gate. */
    onReset: (() => void) | null
    /** The snacks' physics tweaks for the next step (snacks.ts), when in a race with them. */
    mods: ((kart: KartState) => KartMods) | null
    /** Changes the kart's state on the spot: a chocolate's nitro, a Chipwich's jump, a nut's hop. */
    modify(change: (kart: KartState) => KartState): void
    /** Chips: a wider, heavier-looking kart. */
    setFat(fat: boolean): void
}

export function createDriver(
    world: DriveWorld,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    look: KartLook = DEFAULT_LOOK,
    effects: Effects | null = null
): Driver {
    // No name tag over your own kart: you know who you are, and it hides the road ahead.
    const model = buildKartModel(look, false)
    const fx = effects?.forKart() ?? null
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
    let orbit = Math.PI * 0.8

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
            nitro: held('KeyE'),
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
                current = driver.frozen
                    ? current
                    : stepKart(world, current, input, driver.grip, driver.mods?.(current) ?? {})
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
            fx?.update(
                {
                    x,
                    y,
                    z,
                    heading,
                    speed,
                    vy: current.vy,
                    drift: current.drift,
                    charge: current.charge,
                    boosting: current.boost > 0,
                    surging: current.surge > 0,
                    airborne: current.airborne,
                },
                dt
            )
            effects?.speedLines(speed, current.boost > 0 || current.surge > 0)
            const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
            const ahead = Math.max(0, speed)
            const back = CHASE_DISTANCE + ahead * 0.04
            // Where the camera wants to be, from the kart: only this swing is smoothed, so the camera
            // keeps up at any speed instead of trailing further behind the faster you go.
            const wanted = forward.clone().multiplyScalar(-back)
            const groundBehind = world.ground(x + wanted.x, z + wanted.z)
            wanted.y = Math.max(0, groundBehind - y) + CHASE_HEIGHT + ahead * 0.01
            if (!chaseReady) chase.copy(wanted)
            chase.lerp(wanted, 1 - Math.exp(-CHASE_RATE * dt))
            chaseReady = true
            const shake = SHAKE * Math.pow(Math.min(1, ahead / TOP_SPEED), 3) * (current.surface === 'road' ? 1 : 2.5)
            camera.position.set(
                x + chase.x + (Math.random() - 0.5) * shake,
                y + chase.y + (Math.random() - 0.5) * shake,
                z + chase.z
            )
            camera.position.y = Math.max(camera.position.y, world.ground(camera.position.x, camera.position.z) + 1)
            camera.lookAt(x + forward.x * 6, y + 1.0, z + forward.z * 6)
            camera.fov = THREE.MathUtils.lerp(
                camera.fov,
                BASE_FOV + ahead * FOV_PER_SPEED + (current.boost > 0 ? FOV_BOOST : 0),
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
        grip: 1,
        onStep: null,
        onReset: null,

        reset() {
            previous = current = resetKart(world, current)
            chaseReady = false
        },

        showcase(dt) {
            model.root.visible = true
            orbit += dt * SHOWCASE.turn
            const { x, y, z, heading } = current
            model.pose(x, y, z, heading, groundNormal(world, x, z), current, 0, dt)
            const angle = heading + orbit
            camera.position.set(
                x - Math.sin(angle) * SHOWCASE.radius,
                Math.max(y, world.ground(x, z)) + SHOWCASE.height,
                z - Math.cos(angle) * SHOWCASE.radius
            )
            camera.lookAt(x, y + 0.6, z)
            camera.fov = BASE_FOV
            camera.updateProjectionMatrix()
            chaseReady = false
        },

        paint(body, accent) {
            model.paint(body, accent)
        },

        mods: null,

        modify(change) {
            const before = current
            current = change(current)
            // A jump isn't drawn as a slide from where you were, and the camera cuts to it.
            if (Math.hypot(current.x - before.x, current.z - before.z) > 5) {
                previous = current
                chaseReady = false
            }
        },

        setFat(fat) {
            model.setFat(fat)
        },

        setActive(isActive) {
            // Leaving the wheel gives the camera its normal lens back (speed widens it).
            if (active && !isActive) {
                camera.fov = BASE_FOV
                camera.updateProjectionMatrix()
            }
            active = isActive
            model.root.visible = isActive
            if (!isActive) effects?.speedLines(0, false)
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
