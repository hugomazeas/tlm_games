import { Line3, Vector3 } from 'three'
import { BUTTON } from '../protocol.ts'
import { ESPRESSO, INTERN, JETPACK_FACTOR, OVERTIME, PAD, PORTAL, partnerOf, PROMOTION } from './places.ts'
import { collideCapsule, type FpsWorld, moverBoxOf } from './world.ts'

/**
 * A player's body, stepped at a fixed 60 Hz by the server and, for your own player, by your
 * browser ahead of it (prediction). Same body, same input, same world: same result, so the
 * browser only corrects when the server saw something it didn't.
 */

/** One step of the simulation. */
export const STEP_MS = 1000 / 60
const STEP_S = STEP_MS / 1000
/**
 * Collision sub-steps: as many as keep each move under this share of the body's radius, so a fast
 * mini can't tunnel through a desk's edge, up to `MAX_SUBSTEPS`. Walking takes one, a dodge two, a
 * fall or a rocket jump more: collision is most of the server's time, spent only where it's needed.
 */
const SUBSTEP_REACH = 0.4
const MAX_SUBSTEPS = 8

/** A 40 cm mini: what the office's collision was tuned for. Feet at the body's position. */
export const PLAYER = { radius: 0.12, height: 0.4, eye: 0.34 } as const

/**
 * Lying prone (hold C or Ctrl): 16 cm tall, its eyes 11 cm up, crawling, steadier aim. No dodge,
 * jump or jetpack; up again only where a standing mini fits.
 */
export const PRONE = { radius: 0.07, height: 0.16, eye: 0.11, crawl: 0.6, steady: 0.6 } as const

export const MOVE = {
    /** Slow enough to track: a mini is only 24 cm wide (at 2.8 they crossed 12 body widths a second). */
    walk: 2,
    /** The dodge (Shift + a direction): a jetpack burst that way. */
    dashSpeed: 5,
    /** How long the burst carries you before the keys take over again. */
    dashSteps: 12,
    /** Steps before the next dodge (1.5 s), and the fuel each one burns. */
    dashCooldown: 90,
    dashFuel: 0.2,
    /** A little lift, so a dodge clears a cable or a chair leg. */
    dashLift: 1.2,
    /**
     * How fast velocity follows the keys: firm on the ground (soft enough that a change of direction
     * shows before it happens, so strafing isn't twitchy), floaty in the air.
     */
    groundResponse: 8,
    airResponse: 3,
    gravity: -9.8,
    /** Upward acceleration while the jetpack burns (m/s²), against gravity's 9.8. */
    thrust: 16,
    /**
     * Space on the ground: a jump, 35 cm up (√(2 × 9.8 × 0.35)). Held past its top, the jetpack
     * takes over; pressed in the air (off a ledge, a pad), it burns at once.
     */
    jump: Math.sqrt(2 * 9.8 * 0.35),
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
    /** Steps left of a jetpack extender (0: none): flight burns its fuel JETPACK_FACTOR times slower. */
    jetBoost: number
    /**
     * Steps left of the pickups that change how you move (0: none), stepped here so your browser
     * predicts them: Overtime (slow, grounded), Espresso (fast), Promotion (big), Intern (small).
     */
    overtime: number
    espresso: number
    big: number
    small: number
    /** Steps until a portal takes you again. */
    portalCooldown: number
    /** Lying prone. */
    prone: boolean
    /** On the way up from a jump (the jetpack waits for its top). */
    jumped: boolean
    /** Space was held last step (a jump needs a fresh press). */
    spaceHeld: boolean
    /** Steps left of being thrown (Shove): the keys barely steer, so the throw carries (jetpack and dodge still work). */
    stun: number
    /** A gust (Shove on Cloud Nine): it drifts you this way (m/s), unless you lie prone. */
    windX: number
    windZ: number
    /** Grabbed (Shove): someone holds you up in front of them; you don't move by yourself. */
    held: boolean
}

/** Thrown, your steering in the air follows the keys this much as firmly as usual; on the ground, your grip is this much. */
export const STUN_STEER = 0.25
export const STUN_GRIP = 0.4

/** The powers that change a body's size and health (a body, or one rebuilt from a player's buffs). */
export interface Powers {
    overtime: number
    big: number
    small: number
}

/** How much bigger than a usual mini (Promotion 3, Intern ½). */
export function scaleOf(powers: { big?: number; small?: number }): number {
    if ((powers.big ?? 0) > 0) return PROMOTION.scale
    if ((powers.small ?? 0) > 0) return INTERN.scale
    return 1
}

/** A mini's capsule at a size, standing or prone: radius, height and eyes, from the feet. */
export function sizeAt(scale: number, prone = false): { radius: number; height: number; eye: number } {
    const shape = prone ? PRONE : PLAYER
    return { radius: shape.radius * scale, height: shape.height * scale, eye: shape.eye * scale }
}

/** A body's (or a target's) capsule now: its size, and whether it lies prone. */
export function sizeOf(feet: { big?: number; small?: number; prone?: boolean }): {
    radius: number
    height: number
    eye: number
} {
    return sizeAt(scaleOf(feet), feet.prone ?? false)
}

/** Walking pace, for the powers they have (crawling, prone). */
export function walkOf(body: Body): number {
    if (body.prone) return PRONE.crawl * (body.big > 0 ? PROMOTION.scale * PROMOTION.walk : 1)
    const pace = body.overtime > 0 ? OVERTIME.walk : body.espresso > 0 ? ESPRESSO.walk : 1
    return MOVE.walk * pace * (body.big > 0 ? PROMOTION.walk : 1)
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
    /** Space held: a jump on the ground (a fresh press), the jetpack in the air. */
    jet: boolean
    /** C or Ctrl held: lie prone. */
    prone: boolean
}

/** An input frame's movement (the same on the server and in your browser). */
export function moveOf(frame: { forward: number; strafe: number; yaw: number; buttons: number }): MoveInput {
    return {
        forward: frame.forward,
        strafe: frame.strafe,
        yaw: frame.yaw,
        dash: (frame.buttons & BUTTON.dash) !== 0,
        jet: (frame.buttons & BUTTON.jet) !== 0,
        prone: (frame.buttons & BUTTON.prone) !== 0,
    }
}

export function bodyAt(x: number, y: number, z: number): Body {
    return {
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: false,
        fuel: 1,
        dashLeft: 0,
        dashCooldown: 0,
        jetBoost: 0,
        overtime: 0,
        espresso: 0,
        big: 0,
        small: 0,
        portalCooldown: 0,
        prone: false,
        jumped: false,
        spaceHeld: false,
        stun: 0,
        windX: 0,
        windZ: 0,
        held: false,
    }
}

/**
 * Does Space burn the jetpack this step (from this body)? In the air, past a jump's top, with fuel
 * (not on Overtime, not prone). On the ground Space jumps instead.
 */
export function jetBurns(body: Body, input: MoveInput): boolean {
    return input.jet && body.fuel > 0 && body.overtime === 0 && !body.prone && !body.onGround && !body.jumped
}

/** Is the jetpack burning this step (its flame)? Space in the air, or a dodge's burst. */
export function isJetting(body: Body, input: MoveInput): boolean {
    return jetBurns(body, input) || body.dashLeft > 0
}

const seg = new Line3()
const before = new Vector3()
const pushed = new Vector3()

/** Does a capsule of this size (standing, or prone) stand clear at the body's feet? */
function fits(world: FpsWorld, body: Body, scale: number, prone = false): boolean {
    const size = sizeAt(scale, prone)
    seg.start.set(body.x, body.y + size.radius, body.z)
    seg.end.set(body.x, body.y + size.height - size.radius, body.z)
    return !collideCapsule(world, seg, size.radius)
}

/** The body one step later. Pure: the input body is left as it was. */
export function stepBody(world: FpsWorld, body: Body, input: MoveInput): Body {
    // Held up by someone (Shove): where they carry you, nothing of your own.
    if (body.held) return { ...body, spaceHeld: input.jet, vx: 0, vy: 0, vz: 0, onGround: false }
    const next = { ...body }
    next.overtime = Math.max(0, body.overtime - 1)
    next.espresso = Math.max(0, body.espresso - 1)
    next.big = Math.max(0, body.big - 1)
    next.small = Math.max(0, body.small - 1)
    next.portalCooldown = Math.max(0, body.portalCooldown - 1)
    next.stun = Math.max(0, body.stun - 1)
    // An intern grows back only where a mini fits (not under a chair): until then they stay small.
    // Prone: down while held (from the ground, or already down); up once let go, only where a standing mini fits.
    if (input.prone && (body.onGround || body.prone)) next.prone = true
    else if (body.prone && !input.prone && fits(world, body, scaleOf(body))) next.prone = false
    if (body.small === 1 && !fits(world, body, 1, next.prone)) next.small = 1
    const grounded = body.overtime > 0

    // The keys' wish, in the world: forward is where the camera looks, flattened.
    const fx = -Math.sin(input.yaw)
    const fz = -Math.cos(input.yaw)
    let wx = fx * clampUnit(input.forward) - fz * clampUnit(input.strafe)
    let wz = fz * clampUnit(input.forward) + fx * clampUnit(input.strafe)
    const length = Math.hypot(wx, wz)
    // The dodge: a burst the keys' way (forward when none are held), if it's ready and there's fuel.
    next.dashCooldown = Math.max(0, body.dashCooldown - 1)
    next.dashLeft = Math.max(0, body.dashLeft - 1)
    if (input.dash && !grounded && !next.prone && body.dashCooldown === 0 && body.fuel >= MOVE.dashFuel) {
        const [dx, dz] = length > 0 ? [wx / length, wz / length] : [fx, fz]
        next.vx = dx * MOVE.dashSpeed
        next.vz = dz * MOVE.dashSpeed
        next.vy = Math.max(next.vy, MOVE.dashLift)
        next.fuel -= MOVE.dashFuel
        next.dashLeft = MOVE.dashSteps
        next.dashCooldown = Math.round(MOVE.dashCooldown * (body.espresso > 0 ? ESPRESSO.dashCooldown : 1))
    } else if (body.dashLeft === 0) {
        // The keys steer, unless a dodge is carrying you.
        if (length > 0) {
            const walk = walkOf(body)
            wx = (wx / length) * walk
            wz = (wz / length) * walk
        }
        // A gust drifts you its way (not lying flat).
        if (!next.prone) {
            wx += body.windX
            wz += body.windZ
        }
        // Thrown: barely steering in the air; on the ground, some grip still (a slide, not a skate off the edge).
        const response = body.onGround
            ? MOVE.groundResponse * (body.stun > 0 ? STUN_GRIP : 1)
            : MOVE.airResponse * (body.stun > 0 ? STUN_STEER : 1)
        const follow = 1 - Math.exp(-response * STEP_S)
        next.vx += (wx - next.vx) * follow
        next.vz += (wz - next.vz) * follow
    }
    // A jump pad under your feet: thrown up, no fuel used.
    if (body.onGround && body.y <= PAD.height) {
        for (const pad of world.pads) {
            if (Math.hypot(body.x - pad.x, body.z - pad.z) <= PAD.radius) next.vy = Math.max(next.vy, PAD.launch)
        }
    }

    // Space: a fresh press on the ground jumps (not prone, not on Overtime); in the air it's the jetpack.
    if (input.jet && !body.spaceHeld && body.onGround && !next.prone && !grounded) {
        next.vy = Math.max(next.vy, MOVE.jump)
        next.jumped = true
    }
    next.spaceHeld = input.jet
    const jetting = jetBurns(body, input) && next.fuel > 0
    next.jetBoost = Math.max(0, body.jetBoost - 1)
    const burn = MOVE.fuelUse / (body.jetBoost > 0 ? JETPACK_FACTOR : 1)
    const fuelRate = jetting ? -burn : body.onGround && next.dashLeft === 0 ? MOVE.fuelRegen : 0
    next.fuel = Math.max(0, Math.min(1, next.fuel + fuelRate * STEP_S))

    const size = sizeAt(scaleOf(next), next.prone)
    // The furthest this step can carry it: its speed, plus what gravity or the jetpack add.
    const accel = Math.abs(MOVE.gravity + (jetting ? MOVE.thrust : 0))
    const reach = (Math.hypot(next.vx, next.vy, next.vz) + accel * STEP_S) * STEP_S
    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(reach / (size.radius * SUBSTEP_REACH))))
    const h = STEP_S / substeps
    next.onGround = false
    for (let s = 0; s < substeps; s++) {
        next.vy += (MOVE.gravity + (jetting ? MOVE.thrust : 0)) * h
        next.x += next.vx * h
        next.y += next.vy * h
        next.z += next.vz * h
        seg.start.set(next.x, next.y + size.radius, next.z)
        seg.end.set(next.x, next.y + size.height - size.radius, next.z)
        before.copy(seg.start)
        if (!collideCapsule(world, seg, size.radius)) continue

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
    // Standing on something moving (Cloud Nine's gondola): it carries you.
    if (next.onGround && world.movers) {
        for (const mover of world.movers) {
            const box = moverBoxOf(world, mover)
            const on =
                Math.abs(next.y - box.maxY) < 0.03 &&
                next.x > box.minX - size.radius &&
                next.x < box.maxX + size.radius &&
                next.z > box.minZ - size.radius &&
                next.z < box.maxZ + size.radius
            if (on) next.x += mover.at(world.clock?.step ?? 0).vx * STEP_S
        }
    }
    // An open sky's ceiling (Cloud Nine): the jetpack takes nobody higher.
    if (world.ceiling !== undefined && next.y > world.ceiling) {
        next.y = world.ceiling
        next.vy = Math.min(next.vy, 0)
    }
    // A jump's way up is over at its top, or on landing: from there Space held burns the jetpack.
    if (next.onGround || next.vy <= 0) next.jumped = false

    // Into a portal: out of its partner, on its far side, moving as you were.
    if (next.portalCooldown === 0) {
        world.portals.forEach((portal, index) => {
            if (next.portalCooldown > 0 || next.y > PORTAL.height) return
            if (Math.hypot(next.x - portal.x, next.z - portal.z) > PORTAL.radius) return
            const exit = world.portals[partnerOf(index)]
            if (!exit) return
            next.x = exit.x + exit.out[0] * PORTAL.exit
            next.z = exit.z + exit.out[1] * PORTAL.exit
            next.portalCooldown = PORTAL.cooldownSteps
        })
    }

    return next
}

function clampUnit(value: number): number {
    return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}
