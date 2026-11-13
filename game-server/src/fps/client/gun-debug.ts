import { Vector3 } from 'three'
import type { Gun } from '../protocol.ts'
import {
    aimDirection,
    damageAt,
    GUNS,
    type GunSpec,
    HIT_PARTS,
    HIT_RADIUS,
    LAUNCHER,
    MAX_HEALTH,
    magazineOf,
    rayBody,
    reloadMsOf,
    spreadDirection,
    STAPLER,
    spreadOf,
} from '../sim/combat.ts'
import { bodyAt, MOVE, PLAYER } from '../sim/movement.ts'

/**
 * The gun lab's debug numbers (pure): a gun's cone, damage, shots to kill and the chance its
 * rounds meet a mini at some distance, all from the same functions the server judges shots with.
 */

/** How the gun is being fired, and at whom. */
export interface Situation {
    aiming: boolean
    moving: boolean
    air: boolean
    /** To the target mini's feet, straight ahead (m). */
    distance: number
    /** The crosshair on their head (level: eye height) or the middle of their body. */
    aimAt: 'head' | 'body'
}

/** Where the crosshair sits on the target, above their feet (m). */
export function aimHeight(aimAt: Situation['aimAt']): number {
    // The middle of the head, or the chest (HIT_PARTS: the body as drawn).
    return aimAt === 'head' ? HIT_PARTS[0]!.a[1] : 0.27
}

/** The pitch that puts the crosshair there, from a standing mini's eyes. */
export function aimPitch(situation: Situation): number {
    return Math.atan2(aimHeight(situation.aimAt) - PLAYER.eye, situation.distance)
}

export interface Cone {
    /** Half-angle (rad) shots land in, as the server works it out. */
    total: number
    base: number
    moving: number
    air: number
}

/** The cone, and where it comes from (the launcher's rockets fly straight). */
export function coneOf(gun: Gun, situation: Situation): Cone {
    if (gun === 'launcher') return { total: 0, base: 0, moving: 0, air: 0 }
    const spec = GUNS[gun]
    const body = { ...bodyAt(0, 0, 0), vx: situation.moving ? MOVE.walk : 0, onGround: !situation.air }
    const base = situation.aiming ? spec.spread.aim : spec.spread.hip
    // spreadOf only counts moving above 1.2 m/s: walking (MOVE.walk) is.
    const moving = situation.moving && MOVE.walk > 1.2 ? spec.spread.moving : 0
    const air = situation.air ? spec.spread.air : 0

    return { total: spreadOf(spec, situation.aiming, body), base, moving, air }
}

/** Every round the server would send for frames 1 … `pulls`: hit, headshot or miss, and where it stopped. */
export interface Round {
    direction: Vector3
    hit: 'head' | 'body' | null
    /** Along the ray to the capsule, or to the plane of the target when it misses (m). */
    distance: number
}

const EYE = new Vector3(0, PLAYER.eye, 0)

/** The rounds of one trigger pull (frame `seq`), against a mini standing `distance` ahead. */
export function roundsOf(gun: Gun, situation: Situation, seq: number): Round[] {
    const aim = aimDirection(0, aimPitch(situation))
    const cone = coneOf(gun, situation).total
    const pellets = gun === 'launcher' ? 1 : GUNS[gun].pellets
    const feet = { x: 0, y: 0, z: -situation.distance }
    const rounds: Round[] = []
    for (let pellet = 0; pellet < pellets; pellet++) {
        const direction = gun === 'launcher' ? aim.clone() : spreadDirection(aim, cone, seq, pellet)
        const met = rayBody(EYE, direction, feet)
        const range = gun === 'launcher' ? Infinity : GUNS[gun].range
        if (met && met.distance <= range) {
            rounds.push({ direction, hit: met.head ? 'head' : 'body', distance: met.distance })
        } else {
            // On to the target's plane (or a long way, shooting up or down past it).
            const toPlane = direction.z < -1e-6 ? situation.distance / -direction.z : situation.distance
            rounds.push({ direction, hit: null, distance: Math.min(toPlane, range) })
        }
    }

    return rounds
}

/** Of every round fired over `samples` trigger pulls: the share on the head, the body, and missed. */
export function hitChance(gun: Gun, situation: Situation, samples = 300): { head: number; body: number; miss: number } {
    let head = 0
    let body = 0
    let total = 0
    for (let seq = 1; seq <= samples; seq++) {
        for (const round of roundsOf(gun, situation, seq)) {
            total++
            if (round.hit === 'head') head++
            else if (round.hit === 'body') body++
        }
    }

    return { head: head / total, body: body / total, miss: (total - head - body) / total }
}

export interface Metric {
    label: string
    value: string
    /** A heading line between groups. */
    group?: boolean
}

const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(2)}°`
const ms = (n: number) => `${Math.round(n)} ms`

/** Pulls to bring a full-health mini down with `perPull` damage each (∞ for none). */
function pullsToKill(perPull: number): number {
    return perPull > 0 ? Math.ceil(MAX_HEALTH / perPull - 1e-9) : Infinity
}

/** Time to kill with that many pulls, reloading when the magazine runs dry. */
function timeToKill(pulls: number, interval: number, magazine: number, reload: number): number {
    if (!Number.isFinite(pulls)) return Infinity
    const reloads = Math.floor((pulls - 1) / magazine)
    return (pulls - 1) * interval + reloads * reload
}

/** Every number worth seeing about a gun fired like this. */
export function gunMetrics(gun: Gun, situation: Situation): Metric[] {
    if (gun === 'launcher') return launcherMetrics(situation)
    const spec: GunSpec = GUNS[gun]
    const cone = coneOf(gun, situation)
    const d = situation.distance
    const atRange = d <= spec.range
    const body = atRange ? damageAt(spec, d) : 0
    const head = body * spec.headshot
    const chance = hitChance(gun, situation)
    const expected = spec.pellets * (chance.body * body + chance.head * head)
    const magazine = magazineOf(gun)
    const pulls = {
        body: pullsToKill(body * spec.pellets),
        head: pullsToKill(head * spec.pellets),
        expected: pullsToKill(expected),
    }
    const ttk = (n: number) => {
        const t = timeToKill(n, spec.intervalMs, magazine, spec.reloadMs)
        return Number.isFinite(t) ? ms(t) : '—'
    }
    const falloff = spec.falloff
        ? `full to ${spec.falloff[0]} m, ${Math.round(spec.falloff[2] * 100)}% from ${spec.falloff[1]} m`
        : 'none'

    return [
        { label: 'Spread', value: '', group: true },
        { label: 'Cone (half-angle)', value: `${deg(cone.total)}` },
        { label: '  base', value: `${deg(cone.base)} (${situation.aiming ? 'aimed' : 'hip'})` },
        { label: '  + moving', value: deg(cone.moving) },
        { label: '  + in the air', value: deg(cone.air) },
        { label: `Circle at ${d} m`, value: `${(2 * d * Math.tan(cone.total) * 100).toFixed(1)} cm wide` },
        { label: 'Hitbox', value: `the body: ${(HIT_RADIUS * 200).toFixed(0)} × ${PLAYER.height * 100} cm at most` },
        { label: 'Rounds landing', value: `${pct(chance.head)} head · ${pct(chance.body)} body` },
        { label: '  missing', value: pct(chance.miss) },
        { label: 'Damage', value: '', group: true },
        { label: 'Per round', value: `${spec.damage}${spec.pellets > 1 ? ` × ${spec.pellets} pellets` : ''}` },
        { label: `At ${d} m`, value: atRange ? `${body.toFixed(1)} body · ${head.toFixed(1)} head` : 'out of range' },
        { label: 'Falloff', value: falloff },
        { label: 'Headshot', value: `×${spec.headshot}` },
        { label: 'Expected a pull', value: expected.toFixed(1) },
        { label: 'To kill', value: '', group: true },
        { label: 'All body', value: `${count(pulls.body)} · ${ttk(pulls.body)}` },
        { label: 'All head', value: `${count(pulls.head)} · ${ttk(pulls.head)}` },
        { label: 'As it lands', value: `${count(pulls.expected)} · ${ttk(pulls.expected)}` },
        { label: 'Rate', value: '', group: true },
        { label: 'Interval', value: `${ms(spec.intervalMs)} (${Math.round(60_000 / spec.intervalMs)} rpm)` },
        { label: 'Trigger', value: spec.auto ? 'automatic' : 'a click a shot' },
        { label: 'DPS (all body)', value: (((body * spec.pellets) / spec.intervalMs) * 1000).toFixed(0) },
        { label: 'Magazine', value: `${magazine} (${Math.round(magazine * body * spec.pellets)} damage)` },
        { label: 'Reload', value: ms(reloadMsOf(gun)) },
        { label: 'Range', value: `${spec.range} m` },
        { label: 'Aim zoom', value: spec.aimFov ? `${spec.aimFov}°` : 'settings (×0.58)' },
    ]
}

function launcherMetrics(situation: Situation): Metric[] {
    const d = situation.distance
    return [
        { label: 'Rocket', value: '', group: true },
        { label: 'Cone', value: '0° (flies straight)' },
        { label: 'Speed', value: `${LAUNCHER.speed} m/s` },
        {
            label: `Flight to ${d} m`,
            value: d <= LAUNCHER.speed * (LAUNCHER.lifeMs / 1000) ? ms((d / LAUNCHER.speed) * 1000) : 'goes off first',
        },
        { label: 'Goes off after', value: `${ms(LAUNCHER.lifeMs)} (${LAUNCHER.speed * (LAUNCHER.lifeMs / 1000)} m)` },
        { label: 'Blast', value: '', group: true },
        { label: 'Damage', value: `${LAUNCHER.damage} at the centre, 0 at ${LAUNCHER.radius} m` },
        { label: 'Yourself', value: `×${LAUNCHER.selfFactor}` },
        { label: 'Knockback', value: `${LAUNCHER.knockback} m/s at the centre` },
        { label: 'Rate', value: '', group: true },
        { label: 'Magazine', value: String(LAUNCHER.magazine) },
        { label: 'Reload', value: ms(LAUNCHER.reloadMs) },
        { label: 'Aim zoom', value: `${LAUNCHER.aimFov}°` },
    ]
}

/** The stapler: reach and arc instead of a cone. */
export function meleeMetrics(distance: number): Metric[] {
    // From the eyes to the nearest point of a standing mini's axis, less their radius.
    const gap = Math.hypot(distance, PLAYER.eye - (PLAYER.height - PLAYER.radius)) - PLAYER.radius
    return [
        { label: 'Stapler', value: '', group: true },
        { label: 'Damage', value: `${STAPLER.damage} · ${STAPLER.backstab} from behind` },
        {
            label: 'Hits to kill',
            value: `${pullsToKill(STAPLER.damage)} · ${pullsToKill(STAPLER.backstab)} from behind`,
        },
        { label: 'Reach', value: `${STAPLER.reach * 100} cm past their capsule` },
        { label: 'Arc (half-angle)', value: deg(STAPLER.arc) },
        { label: 'Interval', value: ms(STAPLER.intervalMs) },
        {
            label: `Target at ${distance} m`,
            value: gap <= STAPLER.reach ? 'in reach' : `${gap.toFixed(2)} m: out of reach`,
        },
    ]
}

const pct = (share: number) => `${Math.round(share * 100)}%`
const count = (n: number) => (Number.isFinite(n) ? `${n} pull${n === 1 ? '' : 's'}` : 'never')

/** Damage over distance for the falloff graph: [distance, damage] from 0 to the gun's range. */
export function falloffCurve(gun: Gun, points = 60): Array<[number, number]> {
    if (gun === 'launcher') return []
    const spec = GUNS[gun]
    return Array.from({ length: points + 1 }, (_, i) => {
        const d = (spec.range * i) / points
        return [d, damageAt(spec, d) * spec.pellets]
    })
}
