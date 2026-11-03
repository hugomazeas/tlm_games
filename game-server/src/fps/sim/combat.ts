import { Vector3 } from 'three'
import { PLAYER } from './movement.ts'
import { type FpsWorld, rayDistance } from './world.ts'

/** The one weapon for now: a hitscan blaster. */
export const WEAPON = {
    damage: 20,
    /** Damage multiplier when the shot meets the top of the capsule. */
    headshot: 2,
    intervalMs: 150,
    /** Metres: the office is about 22 m end to end. */
    range: 30,
    magazine: 12,
    reloadMs: 1200,
} as const

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

/** Hits on the capsule's top part (from here up, as a share of its height) are headshots. */
const HEAD_FROM = 0.72

/** Where a player's eyes are, from their feet. */
export function eyeOf(feet: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(feet.x, feet.y + PLAYER.eye, feet.z)
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
}

/**
 * A stapler swing from `eye` along `direction`: the nearest target whose capsule is within reach
 * inside the swing's cone, with no wall in between. From behind it's a backstab.
 */
export function swingStapler(
    world: FpsWorld,
    eye: Vector3,
    direction: Vector3,
    targets: readonly Target[]
): { id: string; backstab: boolean } | null {
    let best: { id: string; backstab: boolean } | null = null
    let bestDistance = Infinity
    const to = new Vector3()
    for (const target of targets) {
        // The nearest point of their capsule's axis to the eyes.
        const axisY = Math.max(target.y + PLAYER.radius, Math.min(target.y + PLAYER.height - PLAYER.radius, eye.y))
        to.set(target.x - eye.x, axisY - eye.y, target.z - eye.z)
        const distance = to.length()
        if (distance - PLAYER.radius > STAPLER.reach || distance >= bestDistance) continue
        const toward = to.clone().normalize()
        // Right up against them, any aim counts; otherwise they must be in the cone.
        const angle = Math.acos(Math.max(-1, Math.min(1, toward.dot(direction))))
        if (distance > PLAYER.radius && angle > STAPLER.arc) continue
        const blocked = distance > 0.01 && rayDistance(world, eye, toward, distance) < distance - PLAYER.radius
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
export function fireShot(world: FpsWorld, origin: Vector3, direction: Vector3, targets: readonly Target[]): ShotResult {
    let nearest = rayDistance(world, origin, direction, WEAPON.range)
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
 * Where a ray meets a player's capsule: its distance along the ray, and how high up the capsule's
 * axis (0 bottom … 1 top). Null when it passes by or is behind the ray.
 */
export function rayCapsule(
    origin: Vector3,
    direction: Vector3,
    feet: { x: number; y: number; z: number }
): { distance: number; along: number } | null {
    const r = PLAYER.radius
    const a = new Vector3(feet.x, feet.y + r, feet.z)
    const axis = new Vector3(0, PLAYER.height - 2 * r, 0)
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

    return { distance, along: Math.max(0, Math.min(1, (hitY - feet.y) / PLAYER.height)) }
}
