import { Vector3 } from 'three'
import type { BuffKind, Gun } from '../protocol.ts'
import { type Body, PLAYER, type Powers, scaleOf, sizeAt } from './movement.ts'
import { INTERN, OVERTIME, PROMOTION } from './places.ts'
import { type FpsWorld, rayDistance } from './world.ts'

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

/** The cone shots land in, for how they're fired. */
export function spreadOf(spec: GunSpec, aiming: boolean, body: Body): number {
    const moving = Math.hypot(body.vx, body.vz) > 1.2
    return (
        (aiming ? spec.spread.aim : spec.spread.hip) +
        (moving ? spec.spread.moving : 0) +
        (body.onGround ? 0 : spec.spread.air)
    )
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

/** Hits on the capsule's top part (from here up, as a share of its height) are headshots. */
export const HEAD_FROM = 0.72

/** Where a player's eyes are, from their feet (higher on a Promotion, lower as an Intern). */
export function eyeOf(feet: { x: number; y: number; z: number; big?: number; small?: number }): Vector3 {
    return new Vector3(feet.x, feet.y + PLAYER.eye * scaleOf(feet), feet.z)
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
        const size = sizeAt(target.scale ?? 1)
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
    let nearest = rayDistance(world, origin, direction, range)
    let hit: ShotResult['hit'] = null
    for (const target of targets) {
        const met = rayCapsule(origin, direction, target)
        if (!met || met.distance >= nearest) continue
        nearest = met.distance
        hit = { id: target.id, headshot: met.along >= HEAD_FROM }
    }

    return { end: origin.clone().addScaledVector(direction, nearest), hit }
}

/**
 * Shots take a player as this much wider than they collide (as tall): a 24 cm mini on the move is
 * a small target, and a slightly generous hitbox doesn't show.
 */
export const HITBOX_SCALE = 1.25
export const HIT_RADIUS = PLAYER.radius * HITBOX_SCALE

/**
 * Where a ray meets a player's hit capsule (`HIT_RADIUS` wide, their height, both times their
 * `scale`): its distance along the ray, and how high up it (0 bottom … 1 top). Null when it passes
 * by or is behind the ray.
 */
export function rayCapsule(
    origin: Vector3,
    direction: Vector3,
    feet: { x: number; y: number; z: number; scale?: number }
): { distance: number; along: number } | null {
    const scale = feet.scale ?? 1
    const height = PLAYER.height * scale
    const r = HIT_RADIUS * scale
    const a = new Vector3(feet.x, feet.y + r, feet.z)
    const axis = new Vector3(0, height - 2 * r, 0)
    const axisLength = axis.length()
    axis.divideScalar(axisLength)

    // The closest points between the ray and the capsule's axis segment.
    const w = origin.clone().sub(a)
    const b = direction.dot(axis)
    const d = direction.dot(w)
    const e = axis.dot(w)
    const denominator = 1 - b * b
    let s = denominator > 1e-9 ? (b * e - d) / denominator : 0
    let t = denominator > 1e-9 ? (e - b * d) / denominator : e
    if (t < 0 || t > axisLength) {
        // Past an end of the axis: the end cap's sphere.
        t = Math.max(0, Math.min(axisLength, t))
        const centre = a.clone().addScaledVector(axis, t)
        s = centre.clone().sub(origin).dot(direction)
    }
    const onRay = origin.clone().addScaledVector(direction, s)
    const onAxis = a.clone().addScaledVector(axis, Math.max(0, Math.min(axisLength, t)))
    const gap = onRay.distanceTo(onAxis)
    if (gap > r) return null

    const distance = s - Math.sqrt(r * r - gap * gap)
    if (distance < 0) return null

    const hitY = origin.y + direction.y * distance

    return { distance, along: Math.max(0, Math.min(1, (hitY - feet.y) / height)) }
}
