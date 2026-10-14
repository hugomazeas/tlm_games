import { describe, expect, test } from 'bun:test'
import { Geometry } from './facades.ts'
import { orientedBox } from '../map/structures.ts'
import { addBands, addGableRoof, insetRing } from './landmarks.ts'

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

describe('orientedBox', () => {
    test('finds a turned rectangle’s long axis and half sizes', () => {
        // 20 m long, 8 m wide, turned 30°.
        const c = Math.cos(Math.PI / 6)
        const s = Math.sin(Math.PI / 6)
        const corner = (u: number, v: number) => [u * c - v * s, u * s + v * c]
        const ring = [corner(-10, -4), corner(10, -4), corner(10, 4), corner(-10, 4)].flat()
        const box = orientedBox(ring)
        expect(box.halfLong).toBeCloseTo(10)
        expect(box.halfShort).toBeCloseTo(4)
        expect(Math.abs(box.ux * c + box.uz * s)).toBeCloseTo(1)
        expect(box.cx).toBeCloseTo(0)
        expect(box.cz).toBeCloseTo(0)
    })
})

describe('addGableRoof', () => {
    test('rises from the eaves to a ridge along the long side, and walls up the gable ends', () => {
        const geometry = new Geometry()
        addGableRoof(geometry, [0, 0, 20, 0, 20, 8, 0, 8], 10, 4)
        const points = [] as [number, number, number][]
        for (let i = 0; i < geometry.positions.length; i += 3) {
            points.push(geometry.positions.slice(i, i + 3) as [number, number, number])
        }
        const top = Math.max(...points.map(p => p[1]))
        expect(top).toBeCloseTo(14)
        // The ridge runs along z = 4, end to end.
        const ridge = points.filter(p => Math.abs(p[1] - 14) < 1e-6)
        expect(ridge.every(p => Math.abs(p[2] - 4) < 1e-6)).toBe(true)
        expect(Math.min(...ridge.map(p => p[0]))).toBeCloseTo(0)
        expect(Math.max(...ridge.map(p => p[0]))).toBeCloseTo(20)
        // Gable ends: walls in the planes x = 0 and x = 20 reaching the ridge.
        const ends = points.filter(p => (Math.abs(p[0]) < 1e-6 || Math.abs(p[0] - 20) < 1e-6) && p[1] > 13.9)
        expect(ends.length).toBeGreaterThan(0)
    })
})

describe('addBands', () => {
    test('a slab round the walls every floor, from the first up to just under the top', () => {
        const geometry = new Geometry()
        addBands(geometry, [0, 0, 10, 0, 10, 10, 0, 10], 100, 112, { floor: 3, depth: 1.2, height: 0.2, first: 103 })
        const ys = geometry.positions.filter((_, i) => i % 3 === 1)
        expect(Math.min(...ys)).toBeCloseTo(103)
        // 103, 106, 109; 112 is the top itself.
        expect(Math.max(...ys)).toBeCloseTo(109.2)
        const xs = geometry.positions.filter((_, i) => i % 3 === 0)
        expect(Math.max(...xs)).toBeCloseTo(11.2)
    })
})
