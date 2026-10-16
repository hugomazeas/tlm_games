import { describe, expect, test } from 'bun:test'
import type { Course } from '../map/format.ts'
import {
    advance,
    bestLap,
    crossGate,
    gridSlot,
    isWrongWay,
    type Progress,
    respawnPoint,
    startProgress,
} from './laps.ts'

/**
 * A square loop 200 m a side, driven clockwise seen from above (east along
 * the north side, then south, west, north): the start line in the middle of
 * the north side, one gate in the middle of each other side.
 */
const square: Course = {
    slug: 'square',
    name: 'Square',
    laps: 2,
    gates: [
        { x: 0, z: -100, dx: 1, dz: 0, width: 12 },
        { x: 100, z: 0, dx: 0, dz: 1, width: 12 },
        { x: 0, z: 100, dx: -1, dz: 0, width: 12 },
        { x: -100, z: 0, dx: 0, dz: -1, width: 12 },
    ],
}

/** Drives through gate `index` of the square, from 1 m before it to 1 m after, between clock `start` and `start + 1`. */
function through(progress: Progress, index: number, start: number, backwards = false): Progress {
    const gate = square.gates[index]!
    const sign = backwards ? -1 : 1
    const from = { x: gate.x - gate.dx * sign, z: gate.z - gate.dz * sign }
    const to = { x: gate.x + gate.dx * sign, z: gate.z + gate.dz * sign }

    return advance(square, progress, from, to, start, start + 1)
}

describe('crossGate', () => {
    const gate = square.gates[0]!

    test('forward, backward, or not at all', () => {
        expect(crossGate(gate, { x: -1, z: -100 }, { x: 3, z: -100 })).toEqual({ direction: 1, at: 0.25 })
        expect(crossGate(gate, { x: 1, z: -100 }, { x: -1, z: -100 }).direction).toBe(-1)
        expect(crossGate(gate, { x: -3, z: -100 }, { x: -1, z: -100 }).direction).toBe(0)
    })

    test('only within its width', () => {
        expect(crossGate(gate, { x: -1, z: -95 }, { x: 1, z: -95 }).direction).toBe(1)
        expect(crossGate(gate, { x: -1, z: -93 }, { x: 1, z: -93 }).direction).toBe(0)
    })
})

describe('advance', () => {
    test('the first crossing of the start line starts lap 1, then gates count in order', () => {
        let progress = through(startProgress(), 0, 2)
        expect(progress).toMatchObject({ lap: 1, next: 1, lastGate: 0, lapTimes: [] })
        progress = through(progress, 1, 20)
        expect(progress).toMatchObject({ next: 2, lastGate: 1 })
    })

    test('a lap completes at the start line, timed where the line was crossed', () => {
        let progress = startProgress()
        for (const [gate, time] of [
            [0, 2],
            [1, 20],
            [2, 40],
            [3, 60],
            [0, 80],
        ] as const)
            progress = through(progress, gate, time)
        expect(progress.lap).toBe(2)
        expect(progress.lapTimes).toEqual([80.5])
        expect(progress.lapStart).toBe(80.5)
    })

    test('finishes after the last lap, and stops counting', () => {
        let progress = startProgress()
        for (const [gate, time] of [
            [0, 2],
            [1, 20],
            [2, 40],
            [3, 60],
            [0, 80],
            [1, 100],
            [2, 120],
            [3, 140],
            [0, 150],
        ] as const) {
            progress = through(progress, gate, time)
        }
        expect(progress.finishedAt).toBe(150.5)
        expect(progress.lapTimes).toEqual([80.5, 70])
        expect(bestLap(progress)).toBe(70)
        expect(through(progress, 1, 160)).toBe(progress)
    })

    test('skipping a gate counts for nothing', () => {
        const started = through(startProgress(), 0, 2)
        expect(through(started, 2, 30)).toBe(started)
        // Cutting from gate 1 straight back over the start line doesn't complete a lap.
        expect(through(through(started, 1, 20), 0, 40)).toMatchObject({ lap: 1, next: 2 })
    })

    test('a checkpoint has no direction: crossing it either way counts, in order', () => {
        const started = through(startProgress(), 0, 2)
        expect(through(started, 1, 30, true)).toMatchObject({ next: 2, lastGate: 1 })
        // The start line too, the first time and to finish a lap.
        expect(through(startProgress(), 0, 2, true)).toMatchObject({ lap: 1, next: 1 })
        let progress = started
        for (const [gate, time] of [
            [1, 20],
            [2, 40],
            [3, 60],
        ] as const) {
            progress = through(progress, gate, time, true)
        }
        expect(through(progress, 0, 80, true)).toMatchObject({ lap: 2, lapTimes: [80.5] })
    })
})

describe('isWrongWay', () => {
    const started = through(startProgress(), 0, 2)
    const east = -Math.PI / 2
    const west = Math.PI / 2

    test('facing towards the next gate is fine, away from it is wrong', () => {
        expect(isWrongWay(square, started, { x: 30, z: -100 }, east)).toBe(false)
        expect(isWrongWay(square, started, { x: 30, z: -100 }, west)).toBe(true)
    })

    test('right at a gate, its direction decides', () => {
        const atGate1 = { x: 100, z: -5 }
        expect(isWrongWay(square, started, atGate1, Math.PI)).toBe(false)
        expect(isWrongWay(square, started, atGate1, 0)).toBe(true)
    })
})

describe('the grid and resets', () => {
    test('slots line up two abreast behind the start line, facing through it', () => {
        const [a, b, c] = [0, 1, 2].map(index => gridSlot(square, index))
        expect(a!.x).toBeCloseTo(-6)
        expect(b!.x).toBeCloseTo(-6)
        expect(Math.abs(a!.z - b!.z)).toBeCloseTo(6)
        expect(c!.x).toBeCloseTo(-13)
        expect(a!.heading).toBeCloseTo(-Math.PI / 2)
    })

    test('a reset puts you on your last gate, or the grid before any', () => {
        expect(respawnPoint(square, startProgress())).toEqual(gridSlot(square, 0))
        const atGate1 = respawnPoint(square, through(through(startProgress(), 0, 2), 1, 20))
        expect(atGate1).toMatchObject({ x: 100, z: 0 })
        expect(Math.abs(atGate1.heading)).toBeCloseTo(Math.PI)
    })
})
