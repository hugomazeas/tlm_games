import { Vector3 } from 'three'
import type { BuffKind, Gun } from '../protocol.ts'
import { type Body, PLAYER, type Powers, PRONE, scaleOf, sizeAt, sizeOf } from './movement.ts'
import { INTERN, OVERTIME, PROMOTION } from './places.ts'
import type { Wall } from './walls.ts'
import { type FpsWorld, rayDistance, rayStop } from './world.ts'

/**
 * A gun. Distances are the office's metres (about 22 m end to end, players 40 cm tall); spreads
 * are the half-angle of the cone shots land in (rad).
 */
export interface GunSpec {
    /** Per round (a shotgun's per pellet). */
    damage: number
    /** Damage multiplier when a round meets the top of the capsule. */
    headshot: number
    intervalMs: number
    /** Held down fires on its own; otherwise a click a shot. */
    auto: boolean
    magazine: number
    reloadMs: number
    /** Rounds a trigger pull sends (a shotgun's pellets). */
    pellets: number
    range: number
    /** Full damage up to `falloff[0]` m, down to `falloff[2]` of it at `falloff[1]` m and beyond. */
    falloff: [number, number, number] | null
    /** The cone at the hip, aiming, and what moving or flying adds. */
    spread: { hip: number; aim: number; moving: number; air: number }
    /** Field of view aiming (degrees); null: the settings' usual zoom. */
    aimFov: number | null
}

export const GUNS: Record<Exclude<Gun, 'launcher'>, GunSpec> = {
    rifle: {
        damage: 14,
        headshot: 2,
        intervalMs: 100,
        auto: true,
        magazine: 30,
        reloadMs: 1800,
        pellets: 1,
        range: 30,
        falloff: [6, 16, 0.6],
        spread: { hip: 0.03, aim: 0.006, moving: 0.015, air: 0.03 },
        aimFov: null,
    },
    sniper: {
        damage: 80,
        // 160 on the head: one shot.
        headshot: 2,
        intervalMs: 1300,
        auto: false,
        magazine: 5,
        reloadMs: 2600,
        pellets: 1,
        range: 40,
        falloff: null,
        spread: { hip: 0.12, aim: 0, moving: 0.02, air: 0.06 },
        aimFov: 14,
    },
    shotgun: {
        damage: 13,
        headshot: 1.5,
        intervalMs: 850,
        auto: false,
        magazine: 6,
        reloadMs: 2200,
        pellets: 8,
        range: 10,
        falloff: [1.5, 5, 0.15],
        spread: { hip: 0.11, aim: 0.08, moving: 0, air: 0 },
        aimFov: 62,
    },
    pistol: {
        damage: 25,
        headshot: 2,
        intervalMs: 200,
        auto: false,
        magazine: 8,
        reloadMs: 1200,
        pellets: 1,
        range: 30,
        falloff: [5, 14, 0.7],
        spread: { hip: 0.015, aim: 0.004, moving: 0.01, air: 0.02 },
        aimFov: 55,
    },
}

/** The launcher: a rocket that flies, and goes off on whatever it meets. */
export const LAUNCHER = {
    magazine: 1,
    reloadMs: 7000,
    intervalMs: 500,
    /** m/s, straight (no drop). */
    speed: 9,
    /** Gone off by itself after this long. */
    lifeMs: 3000,
    /** Full damage at the blast's centre, none past `radius` (m). */
    damage: 100,
    radius: 1.1,
    /** Your own rocket hurts you this much less. */
    selfFactor: 0.5,
    /** m/s at the centre, falling off like the damage: a rocket jump, or a shove. */
    knockback: 7,
    aimFov: 60,
} as const

/** A gun's magazine (more with a big magazine pickup: `factor`). */
export function magazineOf(gun: Gun, factor = 1): number {
    const base = gun === 'launcher' ? LAUNCHER.magazine : GUNS[gun].magazine
    return Math.max(base + (factor > 1 ? 1 : 0), Math.round(base * factor))
}

export function reloadMsOf(gun: Gun): number {
    return gun === 'launcher' ? LAUNCHER.reloadMs : GUNS[gun].reloadMs
}

/** The cone shots land in, for how they're fired (`movingAbove`: the map's walking threshold, m/s). */
export function spreadOf(spec: GunSpec, aiming: boolean, body: Body, movingAbove = 1.2): number {
    const moving = Math.hypot(body.vx, body.vz) > movingAbove
    const cone =
        (aiming ? spec.spread.aim : spec.spread.hip) +
        (moving ? spec.spread.moving : 0) +
        (body.onGround ? 0 : spec.spread.air)
    // Prone: steadier.
    return body.prone ? cone * PRONE.steady : cone
}

/** Damage a round does at `distance`. */
export function damageAt(spec: GunSpec, distance: number): number {
    if (!spec.falloff) return spec.damage
    const [near, far, least] = spec.falloff
    const t = Math.max(0, Math.min(1, (distance - near) / (far - near)))
    return spec.damage * (1 - t * (1 - least))
}

/**
 * Where round `pellet` of the shot fired with frame `seq` goes: a direction inside the cone.
 * Seeded by the frame, so the browser draws its tracer where the server lands it.
 */
export function spreadDirection(direction: Vector3, cone: number, seq: number, pellet: number): Vector3 {
    if (cone <= 0) return direction.clone()
    const u = hash(seq * 31 + pellet * 7919 + 1)
    const v = hash(seq * 17 + pellet * 104_729 + 2)
    const angle = cone * Math.sqrt(u)
    const around = v * Math.PI * 2
    // Two directions across the aim.
    const side = Math.abs(direction.y) < 0.99 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    const a = side.cross(direction).normalize()
    const b = direction.clone().cross(a).normalize()
    const offset = a.multiplyScalar(Math.cos(around)).add(b.multiplyScalar(Math.sin(around)))

    return direction.clone().multiplyScalar(Math.cos(angle)).addScaledVector(offset, Math.sin(angle)).normalize()
}

/** 0–1 from an integer, the same everywhere. */
function hash(n: number): number {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
    x ^= x >>> 16
    return (x >>> 0) / 4_294_967_296
}

/** The melee weapon: a heavy-duty stapler, swung. */
export const STAPLER = {
    damage: 50,
    /** From behind (the victim's back within ~60° of you): twice the damage, one hit. */
    backstab: 100,
    /** Reach from the eyes to the target's capsule (m): a mini's arm and a stapler. */
    reach: 0.45,
    /** Half-angle of the swing's cone (rad, about 35°). */
    arc: 0.6,
    intervalMs: 550,
} as const

/** Changing weapons: the new one can't be used for this long. */
export const SWITCH_MS = 250

export const MAX_HEALTH = 100

/** Health comes back by itself: `delayMs` after it last went down, `perSecond`, up to `upTo` (never past full). */
export const REGEN = { delayMs: 3000, perSecond: 10, upTo: 80 } as const

/** Full health with these powers: a Promotion's or an Intern's instead of the usual, Overtime's on top. */
export function maxHealthOf(powers: Powers): number {
    const base = powers.big > 0 ? PROMOTION.health : powers.small > 0 ? INTERN.health : MAX_HEALTH
    return base + (powers.overtime > 0 ? OVERTIME.health : 0)
}

/** The powers that size someone, from the buffs everyone sees them with. */
export function powersOf(buffs: readonly BuffKind[]): Powers {
    return {
        overtime: buffs.includes('overtime') ? 1 : 0,
        big: buffs.includes('promotion') ? 1 : 0,
        small: buffs.includes('intern') ? 1 : 0,
    }
}

/** `rayBody`'s `along` for a hit on the head (from here up, as a share of their height): the chin up. */
export const HEAD_FROM = 0.85

/** Where a player's eyes are, from their feet (higher on a Promotion, lower as an Intern, low prone). */
export function eyeOf(feet: {
    x: number
    y: number
    z: number
    big?: number
    small?: number
    prone?: boolean
}): Vector3 {
    return new Vector3(feet.x, feet.y + sizeOf(feet).eye, feet.z)
}

/** The unit vector a camera with this yaw and pitch looks along (three.js 'YXZ' order). */
export function aimDirection(yaw: number, pitch: number): Vector3 {
    const cos = Math.cos(pitch)

    return new Vector3(-Math.sin(yaw) * cos, Math.sin(pitch), -Math.cos(yaw) * cos)
}

export interface Target {
    id: string
    /** Feet. */
    x: number
    y: number
    z: number
    /** Where they face (radians, 0 toward -Z), for a stapler from behind. */
    yaw?: number
    /** Their size (1 when absent): a Promotion is a big target, an Intern a small one. */
    scale?: number
    /** Lying prone: a low, small target. */
    prone?: boolean
}

/**
 * A stapler swing from `eye` along `direction`: the nearest target whose capsule is within `reach`
 * inside the swing's cone, with no wall in between. From behind it's a backstab.
 */
export function swingStapler(
    world: FpsWorld,
    eye: Vector3,
    direction: Vector3,
    targets: readonly Target[],
    reach: number = STAPLER.reach
): { id: string; backstab: boolean } | null {
    let best: { id: string; backstab: boolean } | null = null
    let bestDistance = Infinity
    const to = new Vector3()
    for (const target of targets) {
        const size = sizeAt(target.scale ?? 1, target.prone)
        // The nearest point of their capsule's axis to the eyes.
        const axisY = Math.max(target.y + size.radius, Math.min(target.y + size.height - size.radius, eye.y))
        to.set(target.x - eye.x, axisY - eye.y, target.z - eye.z)
        const distance = to.length()
        if (distance - size.radius > reach || distance >= bestDistance) continue
        const toward = to.clone().normalize()
        // Right up against them, any aim counts; otherwise they must be in the cone.
        const angle = Math.acos(Math.max(-1, Math.min(1, toward.dot(direction))))
        if (distance > size.radius && angle > STAPLER.arc) continue
        const blocked = distance > 0.01 && rayDistance(world, eye, toward, distance) < distance - size.radius
        if (blocked) continue
        best = { id: target.id, backstab: isBehind(target, eye) }
        bestDistance = distance
    }

    return best
}

/** Is `from` behind the target (within 60° of straight behind them)? */
function isBehind(target: Target, from: Vector3): boolean {
    if (target.yaw === undefined) return false
    const dx = from.x - target.x
    const dz = from.z - target.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) return false
    // Their facing is (-sin yaw, -cos yaw); behind means the attacker is the other way.
    const facing = (-Math.sin(target.yaw) * dx - Math.cos(target.yaw) * dz) / length
    return facing < -0.5
}

export interface ShotResult {
    /** Where the shot stops: the target it met, else the wall, else its range. */
    end: Vector3
    hit: { id: string; headshot: boolean } | null
    /** The built wall that stopped it (null: a player, the office, or nothing). */
    wall: Wall | null
}

/**
 * Fires from `origin` along the unit `direction`: the nearest of the world's triangles and the
 * targets' capsules takes it. Targets are where the shooter saw them (the caller rewinds them).
 */
export function fireShot(
    world: FpsWorld,
    origin: Vector3,
    direction: Vector3,
    targets: readonly Target[],
    range = 30
): ShotResult {
    const stop = rayStop(world, origin, direction, range)
    let nearest = stop.distance
    let hit: ShotResult['hit'] = null
    for (const target of targets) {
        const met = rayBody(origin, direction, target)
        if (!met || met.distance >= nearest) continue
        nearest = met.distance
        hit = { id: target.id, headshot: met.head }
    }

    return { end: origin.clone().addScaledVector(direction, nearest), hit, wall: hit ? null : stop.wall }
}

/**
 * One of a body's hit volumes, standing, facing -Z, feet at 0 (m): a capsule from `a` to `b` (a
 * blob when they're the same) whose section is `rx` across, `rz` front to back and whose ends
 * round off over `ry`; turned `turn` about their up (the chest, bladed behind a gun).
 */
export interface HitPart {
    a: readonly [number, number, number]
    b: readonly [number, number, number]
    rx: number
    ry: number
    rz: number
    turn: number
    head: boolean
}

/**
 * Shots take a player as the body that's drawn (client/figure.ts), not the 24 cm capsule they
 * collide with: the head (the only headshot), the torso from the hips to the shoulders (11 cm
 * across, 6 cm deep, turned as they stand behind a gun) and each leg, with nothing between them.
 * A round that visibly passes beside them, over a shoulder or between the legs misses. The arms
 * (out holding the gun) don't count. Prone it's the same body lying face down.
 */
export const HIT_PARTS: readonly HitPart[] = [
    { a: [0, 0.374, 0], b: [0, 0.374, 0], rx: 0.025, ry: 0.028, rz: 0.027, turn: 0, head: true },
    { a: [0, 0.212, 0.002], b: [0, 0.316, 0.002], rx: 0.055, ry: 0.031, rz: 0.031, turn: -0.45, head: false },
    { a: [0.028, 0.19, 0], b: [0.03, 0.03, -0.002], rx: 0.02, ry: 0.02, rz: 0.02, turn: 0, head: false },
    { a: [-0.028, 0.19, 0], b: [-0.03, 0.03, -0.002], rx: 0.02, ry: 0.02, rz: 0.02, turn: 0, head: false },
]
/** The widest the body is from its middle (the shoulders): the Org chart's outline. */
export const HIT_RADIUS = 0.055
/** Lying prone the body rests this high (its chest's depth), and its middle is over their feet. */
const PRONE_REST = { lift: 0.026, back: PLAYER.height / 2 }

// Scratch for rayBody.
const rayO = new Vector3()
const rayD = new Vector3()
const partO = new Vector3()
const partD = new Vector3()
const partA = new Vector3()
const partB = new Vector3()

/**
 * Where a ray meets a player's body (`HIT_PARTS`, at their facing and `scale`; prone, lying face
 * down along where they face): its distance along the ray, whether it's the head, and how far up
 * the body (0 their feet … 1 their head; headshots are at or past HEAD_FROM). Null when it passes
 * by or the body is behind the ray.
 */
export function rayBody(
    origin: Vector3,
    direction: Vector3,
    feet: { x: number; y: number; z: number; scale?: number; prone?: boolean; yaw?: number }
): { distance: number; along: number; head: boolean } | null {
    const scale = feet.scale ?? 1
    const yaw = feet.yaw ?? 0
    // Into their own frame: feet at 0, facing -Z, at the size of the standing parts. The world's
    // distance along the ray stays the ray's parameter (the direction just isn't unit length here).
    const cos = Math.cos(-yaw)
    const sin = Math.sin(-yaw)
    const ox = (origin.x - feet.x) / scale
    const oy = (origin.y - feet.y) / scale
    const oz = (origin.z - feet.z) / scale
    rayO.set(ox * cos + oz * sin, oy, -ox * sin + oz * cos)
    rayD.set(
        (direction.x * cos + direction.z * sin) / scale,
        direction.y / scale,
        (-direction.x * sin + direction.z * cos) / scale
    )
    if (feet.prone) {
        // Lying face down, head forward: back to how the same point sits on them standing.
        rayO.set(rayO.x, PRONE_REST.back - rayO.z, rayO.y - PRONE_REST.lift)
        rayD.set(rayD.x, -rayD.z, rayD.y)
    }

    let best: { distance: number; along: number; head: boolean } | null = null
    for (const part of HIT_PARTS) {
        // Turned and squashed so the part is a capsule of radius 1.
        const c = Math.cos(-part.turn)
        const s = Math.sin(-part.turn)
        const squash = (v: Vector3, x: number, y: number, z: number) =>
            v.set((x * c + z * s) / part.rx, y / part.ry, (-x * s + z * c) / part.rz)
        squash(partO, rayO.x, rayO.y, rayO.z)
        squash(partD, rayD.x, rayD.y, rayD.z)
        squash(partA, part.a[0], part.a[1], part.a[2])
        squash(partB, part.b[0], part.b[1], part.b[2])
        const speed = partD.length()
        partD.divideScalar(speed)
        const t = capsuleHit(partO, partD, partA, partB)
        if (t === null) continue
        const distance = t / speed
        if (best && distance >= best.distance) continue
        const standingY = rayO.y + rayD.y * distance
        best = {
            distance,
            head: part.head,
            along: part.head ? 1 : Math.max(0, Math.min(HEAD_FROM - 0.001, standingY / PLAYER.height)),
        }
    }

    return best
}

/** Where a unit ray first meets a capsule of radius 1 from `a` to `b` (≥ 0), or null. */
function capsuleHit(o: Vector3, d: Vector3, a: Vector3, b: Vector3): number | null {
    const bax = b.x - a.x
    const bay = b.y - a.y
    const baz = b.z - a.z
    const oax = o.x - a.x
    const oay = o.y - a.y
    const oaz = o.z - a.z
    const baba = bax * bax + bay * bay + baz * baz
    const bard = bax * d.x + bay * d.y + baz * d.z
    const baoa = bax * oax + bay * oay + baz * oaz
    const rdoa = d.x * oax + d.y * oay + d.z * oaz
    const oaoa = oax * oax + oay * oay + oaz * oaz
    if (baba > 1e-12) {
        // The side, between the ends.
        const qa = baba - bard * bard
        const qb = baba * rdoa - baoa * bard
        const qc = baba * oaoa - baoa * baoa - baba
        const h = qb * qb - qa * qc
        if (qa > 1e-12) {
            if (h < 0) return null
            const t = (-qb - Math.sqrt(h)) / qa
            const y = baoa + t * bard
            if (y > 0 && y < baba) return t >= 0 ? t : null
        }
    }
    // Past an end (or along the axis): the nearer round cap it meets.
    const capA = sphereHit(o, d, a)
    const capB = sphereHit(o, d, b)
    if (capA === null) return capB
    return capB === null ? capA : Math.min(capA, capB)
}

/** Where a unit ray first meets a sphere of radius 1 round `c` (≥ 0), or null. */
function sphereHit(o: Vector3, d: Vector3, c: Vector3): number | null {
    const cx = o.x - c.x
    const cy = o.y - c.y
    const cz = o.z - c.z
    const qb = d.x * cx + d.y * cy + d.z * cz
    const h = qb * qb - (cx * cx + cy * cy + cz * cz - 1)
    if (h < 0) return null
    const t = -qb - Math.sqrt(h)
    return t >= 0 ? t : null
}
