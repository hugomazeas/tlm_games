import { describe, expect, test } from 'bun:test'
import { modsFor, pickKind, placeSnacks, SNACK_KINDS, SNACKS } from './snacks.ts'

const KMH = 1 / 3.6
const route = {
    points: [0, 0, 1000, 0, 1000, 1000, 0, 1000, 0, 0],
    along: [0, 1000, 2000, 3000, 4000],
    length: 4000,
    gateAlong: [0, 1000, 2000, 3000],
}
const none = { frost: false, crumbs: false, nuts: false }

/** A seeded stand-in for Math.random. */
function seeded(seed: number): () => number {
    let s = seed
    return () => {
        s = (s * 16807) % 2147483647
        return s / 2147483647
    }
}

describe('placing snacks', () => {
    test('density 10 is total mayhem (one every ~32 m), 1 is one every ~320 m, 0 is none', () => {
        expect(placeSnacks(route, seeded(7), 10).length).toBeGreaterThan(100)
        expect(placeSnacks(route, seeded(7), 10).length).toBeLessThan(140)
        expect(placeSnacks(route, seeded(7), 3).length).toBeGreaterThan(28)
        expect(placeSnacks(route, seeded(7), 3).length).toBeLessThan(50)
        expect(placeSnacks(route, seeded(7), 1).length).toBeLessThan(18)
        expect(placeSnacks(route, seeded(7), 0)).toEqual([])
    })

    test('none on the start line; anywhere across the street, kerbs included, not only the middle', () => {
        const spots = placeSnacks(route, seeded(7), 10)
        expect(spots.every(s => !(s.x < 40 && Math.abs(s.z) < 7))).toBe(true)
        // On the first side (z = 0): spread up to 6.5 m either way, and plenty well off the line.
        const first = spots.filter(s => s.x > 50 && s.x < 950 && Math.abs(s.z) < 50)
        expect(first.every(s => Math.abs(s.z) <= 6.5 + 1e-9)).toBe(true)
        expect(first.filter(s => Math.abs(s.z) > 4).length).toBeGreaterThan(first.length / 5)
        expect(new Set(spots.map(s => s.id)).size).toBe(spots.length)
    })

    test('every snack turns up, the common ones far more than the rare ones', () => {
        const random = seeded(3)
        const counts = new Map<string, number>()
        for (let i = 0; i < 20_000; i++) {
            const kind = pickKind(random())
            counts.set(kind, (counts.get(kind) ?? 0) + 1)
        }
        expect(SNACK_KINDS.every(kind => (counts.get(kind) ?? 0) > 0)).toBe(true)
        expect(counts.get('chocolate')!).toBeGreaterThan(counts.get('drumsticks')! * 5)
        expect(SNACKS.drumsticks.stock).toBe(1)
    })
})

describe('effects', () => {
    test('a Coke is a rush, then a crash', () => {
        expect(modsFor([{ kind: 'coke', age: 1 }], none).limit).toBeCloseTo(35 * KMH)
        expect(modsFor([{ kind: 'coke', age: 4 }], none).limit).toBeCloseTo(-15 * KMH)
    })

    test('they add up, and the ground matters', () => {
        const mods = modsFor(
            [
                { kind: 'bubly', age: 0 },
                { kind: 'chips', age: 0 },
                { kind: 'gokrisp', age: 0 },
                { kind: 'trailmix', age: 0 },
            ],
            { frost: true, crumbs: true, nuts: false }
        )
        expect(mods.limit).toBeCloseTo((10 - 15 - 10) * KMH)
        expect(mods.nitroRate).toBe(3)
        expect(mods.offroadAsRoad).toBe(true)
        expect(mods.grip).toBeCloseTo(0.3)
        expect(modsFor([{ kind: 'frozen', age: 0 }], none).frozen).toBe(true)
    })
})
