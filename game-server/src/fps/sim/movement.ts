import { Line3, Vector3 } from 'three'
import { BUTTON } from '../protocol.ts'
import { collideCapsule, type FpsWorld } from './world.ts'

/**
 * A player's body, stepped at a fixed 60 Hz by the server and, for your own player, by your
 * browser ahead of it (prediction). Same body, same input, same world: same result, so the
 * browser only corrects when the server saw something it didn't.
 */

/** One step of the simulation. */
export const STEP_MS = 1000 / 60
const STEP_S = STEP_MS / 1000
/** Collision sub-steps per step (240 Hz): a fast mini can't tunnel through a desk's edge. */
const SUBSTEPS = 4

/** A 40 cm mini: what the office's collision was tuned for. Feet at the body's position. */
export const PLAYER = { radius: 0.12, height: 0.4, eye: 0.34 } as const

export const MOVE = {
    walk: 2.8,
    /** The dodge (Shift + a direction): a jetpack burst that way. */
    dashSpeed: 7,
    /** How long the burst carries you before the keys take over again. */
    dashSteps: 12,
    /** Steps before the next dodge (0.75 s), and the fuel each one burns. */
    dashCooldown: 45,
    dashFuel: 0.2,
    /** A little lift, so a dodge clears a cable or a chair leg. */
    dashLift: 1.2,
    /** How fast velocity follows the keys: snappy on the ground, floaty in the air. */
    groundResponse: 14,
    airResponse: 3,
    gravity: -9.8,
    /** Upward acceleration while the jetpack burns (m/s²), against gravity's 9.8. */
    thrust: 16,
    /** Fuel per second (the tank holds 1): about 3 s of flight, refilled in 4 s on the ground. */
    fuelUse: 0.35,
    fuelRegen: 0.25,
} as const

export interface Body {
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    onGround: boolean
    /** 0–1. */
    fuel: number
    /** Steps left of a dodge's burst (0: none). */
    dashLeft: number
    /** Steps until the next dodge is ready. */
    dashCooldown: number
}

export interface MoveInput {
    /** -1 back … 1 forward. */
    forward: number
    /** -1 left … 1 right. */
    strafe: number
    /** Radians around +Y; 0 looks toward -Z (three.js cameras). */
    yaw: number
    /** Dodge now (sent on the one frame Shift went down). */
    dash: boolean
    jet: boolean
}

/** An input frame's movement (the same on the server and in your browser). */
export function moveOf(frame: { forward: number; strafe: number; yaw: number; buttons: number }): MoveInput {
    return {
        forward: frame.forward,
        strafe: frame.strafe,
        yaw: frame.yaw,
        dash: (frame.buttons & BUTTON.dash) !== 0,
        jet: (frame.buttons & BUTTON.jet) !== 0,
    }
}

export function bodyAt(x: number, y: number, z: number): Body {
    return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, fuel: 1, dashLeft: 0, dashCooldown: 0 }
}

/** Is the jetpack burning this step? Held with fuel left, or in a dodge's burst. */
export function isJetting(body: Body, input: MoveInput): boolean {
    return (input.jet && body.fuel > 0) || body.dashLeft > 0
}

const seg = new Line3()
const before = new Vector3()
const pushed = new Vector3()

/** The body one step later. Pure: the input body is left as it was. */
export function stepBody(world: FpsWorld, body: Body, input: MoveInput): Body {
    const next = { ...body }

    // The keys' wish, in the world: forward is where the camera looks, flattened.
    const fx = -Math.sin(input.yaw)
    const fz = -Math.cos(input.yaw)
    let wx = fx * clampUnit(input.forward) - fz * clampUnit(input.strafe)
    let wz = fz * clampUnit(input.forward) + fx * clampUnit(input.strafe)
    const length = Math.hypot(wx, wz)
    // The dodge: a burst the keys' way (forward when none are held), if it's ready and there's fuel.
    next.dashCooldown = Math.max(0, body.dashCooldown - 1)
    next.dashLeft = Math.max(0, body.dashLeft - 1)
    if (input.dash && body.dashCooldown === 0 && body.fuel >= MOVE.dashFuel) {
        const [dx, dz] = length > 0 ? [wx / length, wz / length] : [fx, fz]
        next.vx = dx * MOVE.dashSpeed
        next.vz = dz * MOVE.dashSpeed
        next.vy = Math.max(next.vy, MOVE.dashLift)
        next.fuel -= MOVE.dashFuel
        next.dashLeft = MOVE.dashSteps
        next.dashCooldown = MOVE.dashCooldown
    } else if (body.dashLeft === 0) {
        // The keys steer, unless a dodge is carrying you.
        if (length > 0) {
            wx = (wx / length) * MOVE.walk
            wz = (wz / length) * MOVE.walk
        }
        const follow = 1 - Math.exp(-(body.onGround ? MOVE.groundResponse : MOVE.airResponse) * STEP_S)
        next.vx += (wx - next.vx) * follow
        next.vz += (wz - next.vz) * follow
    }

    const jetting = input.jet && next.fuel > 0
    const fuelRate = jetting ? -MOVE.fuelUse : body.onGround && next.dashLeft === 0 ? MOVE.fuelRegen : 0
    next.fuel = Math.max(0, Math.min(1, next.fuel + fuelRate * STEP_S))

    const h = STEP_S / SUBSTEPS
    next.onGround = false
    for (let s = 0; s < SUBSTEPS; s++) {
        next.vy += (MOVE.gravity + (jetting ? MOVE.thrust : 0)) * h
        next.x += next.vx * h
        next.y += next.vy * h
        next.z += next.vz * h
        seg.start.set(next.x, next.y + PLAYER.radius, next.z)
        seg.end.set(next.x, next.y + PLAYER.height - PLAYER.radius, next.z)
        before.copy(seg.start)
        if (!collideCapsule(world, seg, PLAYER.radius)) continue

        pushed.subVectors(seg.start, before)
        next.x += pushed.x
        next.y += pushed.y
        next.z += pushed.z
        const distance = pushed.length()
        if (distance <= 1e-9) continue
        pushed.divideScalar(distance)
        // Pushed up by something walkable: standing on it.
        if (pushed.y > 0.6) next.onGround = true
        // Cancel the motion into the surface.
        const into = next.vx * pushed.x + next.vy * pushed.y + next.vz * pushed.z
        if (into < 0) {
            next.vx -= pushed.x * into
            next.vy -= pushed.y * into
            next.vz -= pushed.z * into
        }
    }

    return next
}

function clampUnit(value: number): number {
    return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}
