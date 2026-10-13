import type { Course, Gate } from '../map/format.ts'

/**
 * Where a kart is in a race: which lap, which gate it needs next, and its
 * lap times. Gates count only in order and only crossed the right way, so
 * cutting one or doubling back gains nothing. Pure, like the kart: the
 * server will run the same function over the positions karts report.
 *
 * The clock starts at the green light with the karts on the grid, just
 * behind the start line; crossing it the first time starts lap 1, every
 * time after completes one.
 */

export interface Progress {
    /** The lap being driven, from 1; 0 before first crossing the start line. */
    lap: number
    /** Index of the gate to cross next. */
    next: number
    /** The last gate crossed, where a reset puts you back; −1 before any. */
    lastGate: number
    /** Seconds on the race clock when the current lap started. */
    lapStart: number
    /** Each completed lap's time, in seconds. */
    lapTimes: number[]
    /** Race clock when the last lap was completed; null until then. */
    finishedAt: number | null
}

export interface Point {
    x: number
    z: number
}

/** Grid slots: two abreast, this far apart across the road and between rows. */
const GRID_ACROSS = 3
const GRID_ROW = 7
/** The front row's distance behind the start line. */
const GRID_LEAD = 6
/** How far off its next gate's direction a kart can point before it's going the wrong way. */
const WRONG_WAY = (110 * Math.PI) / 180

export function startProgress(): Progress {
    return { lap: 0, next: 0, lastGate: -1, lapStart: 0, lapTimes: [], finishedAt: null }
}

/**
 * Whether going from `from` to `to` crosses the gate's line: forward (1),
 * backward (−1), or not at all (0); with how far along the move it happens, 0–1.
 */
export function crossGate(gate: Gate, from: Point, to: Point): { direction: 1 | -1 | 0; at: number } {
    const before = (from.x - gate.x) * gate.dx + (from.z - gate.z) * gate.dz
    const after = (to.x - gate.x) * gate.dx + (to.z - gate.z) * gate.dz
    if (before < 0 === after < 0) return { direction: 0, at: 0 }

    const at = before / (before - after)
    const x = from.x + (to.x - from.x) * at
    const z = from.z + (to.z - from.z) * at
    const across = (x - gate.x) * -gate.dz + (z - gate.z) * gate.dx
    if (Math.abs(across) > gate.width / 2) return { direction: 0, at: 0 }

    return { direction: after >= 0 ? 1 : -1, at }
}

/**
 * Progress after a move from `from` (race clock `start`) to `to` (clock
 * `end`). A gate crossed between two steps is timed where the line falls
 * between them, so lap times don't round to the step.
 */
export function advance(
    course: Course,
    progress: Progress,
    from: Point,
    to: Point,
    start: number,
    end: number
): Progress {
    if (progress.finishedAt !== null) return progress
    const gate = course.gates[progress.next]!
    const { direction, at } = crossGate(gate, from, to)
    if (direction !== 1) return progress

    const time = start + (end - start) * at
    const next = { ...progress, lastGate: progress.next, next: (progress.next + 1) % course.gates.length }
    if (progress.next !== 0) return next
    if (progress.lap === 0) return { ...next, lap: 1 }

    const lapTimes = [...progress.lapTimes, time - progress.lapStart]
    if (progress.lap >= course.laps) return { ...next, lapTimes, finishedAt: time }

    return { ...next, lap: progress.lap + 1, lapStart: time, lapTimes }
}

/** Whether the kart faces away from the gate it needs next. */
export function isWrongWay(course: Course, progress: Progress, kart: Point, heading: number): boolean {
    if (progress.finishedAt !== null) return false
    const gate = course.gates[progress.next]!
    const toGate = Math.atan2(-(gate.x - kart.x), -(gate.z - kart.z))
    // Right at the gate, its own direction says more than the way to its centre.
    const target = Math.hypot(gate.x - kart.x, gate.z - kart.z) < gate.width ? Math.atan2(-gate.dx, -gate.dz) : toGate
    const off = Math.abs(((((heading - target) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)

    return off > WRONG_WAY
}

/** Grid slot `index` behind the start line, facing through it: two abreast, rows going back. */
export function gridSlot(course: Course, index: number): { x: number; z: number; heading: number } {
    const start = course.gates[0]!
    const row = Math.floor(index / 2)
    const side = index % 2 === 0 ? -1 : 1
    const back = GRID_LEAD + row * GRID_ROW
    const across = side * GRID_ACROSS

    return {
        x: start.x - start.dx * back - start.dz * across,
        z: start.z - start.dz * back + start.dx * across,
        heading: Math.atan2(-start.dx, -start.dz),
    }
}

/** Where a reset puts the kart: on the last gate it crossed, facing through it; on the grid before any. */
export function respawnPoint(course: Course, progress: Progress): { x: number; z: number; heading: number } {
    if (progress.lastGate < 0) return gridSlot(course, 0)
    const gate = course.gates[progress.lastGate]!

    return { x: gate.x, z: gate.z, heading: Math.atan2(-gate.dx, -gate.dz) }
}

/** The fastest completed lap, in seconds; null before one. */
export function bestLap(progress: Progress): number | null {
    return progress.lapTimes.length > 0 ? Math.min(...progress.lapTimes) : null
}
