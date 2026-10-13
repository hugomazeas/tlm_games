import { describe, expect, test } from 'bun:test'
import { insetRing } from './landmarks.ts'

/** A 10 × 10 square, wound both ways. */
const CLOCKWISE = [0, 0, 10, 0, 10, 10, 0, 10]
const ANTICLOCKWISE = [0, 0, 0, 10, 10, 10, 10, 0]

function bounds(ring: number[]): number[] {
    const xs = ring.filter((_, i) => i % 2 === 0)
    const zs = ring.filter((_, i) => i % 2 === 1)
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map(v => Math.round(v * 1000) / 1000)
}

describe('insetRing', () => {
    test('shrinks an outline by the inset on every side, whichever way it winds', () => {
        expect(bounds(insetRing(CLOCKWISE, 2, false))).toEqual([2, 2, 8, 8])
        expect(bounds(insetRing(ANTICLOCKWISE, 2, false))).toEqual([2, 2, 8, 8])
    })

    test('grows a courtyard, since its roof slopes away from it', () => {
        expect(bounds(insetRing(CLOCKWISE, 1, true))).toEqual([-1, -1, 11, 11])
        expect(bounds(insetRing(ANTICLOCKWISE, 1, true))).toEqual([-1, -1, 11, 11])
    })

    test('keeps one point per corner', () => {
        expect(insetRing(CLOCKWISE, 2, false)).toHaveLength(8)
    })

    test('a sharp corner is pushed in no further than twice the inset', () => {
        const spike = [0, 0, 100, 1, 0, 2]
        const inset = insetRing(spike, 1, false)
        const moved = Math.hypot(inset[2]! - 100, inset[3]! - 1)
        expect(moved).toBeLessThanOrEqual(2 + 1e-9)
    })
})
