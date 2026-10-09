import { describe, expect, test } from 'bun:test'
import { addDisc, addRect, addStrip, Builder, JunctionIndex, resample, rightNormals, spans } from './strips.ts'

const flatGround = () => 10

describe('resample', () => {
    test('adds points so none are further apart than the step, keeping the corners', () => {
        const samples = resample([0, 0, 10, 0, 10, 5], 4)
        expect(samples.map(s => [s.x, s.z])).toContainEqual([10, 0])
        for (let i = 1; i < samples.length; i++) {
            const gap = Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z)
            expect(gap).toBeLessThanOrEqual(4)
        }
        expect(samples.at(-1)!.distance).toBeCloseTo(15)
    })

    test('skips repeated points', () => {
        expect(resample([0, 0, 0, 0, 3, 0], 10)).toHaveLength(2)
    })
})

describe('rightNormals', () => {
    test('point to the right of travel: heading east, that is south (+z)', () => {
        const normals = rightNormals(resample([0, 0, 10, 0], 10))
        for (const [nx, nz] of normals) {
            expect(nx).toBeCloseTo(0)
            expect(nz).toBeCloseTo(1)
        }
    })

    test('stretch at a right-angle corner so the strip keeps its width', () => {
        const normals = rightNormals(resample([0, 0, 10, 0, 10, 10], 10))
        const [nx, nz] = normals[1]!
        expect(Math.hypot(nx, nz)).toBeCloseTo(Math.SQRT2)
    })

    test('never stretch past the mitre limit at a hairpin', () => {
        const normals = rightNormals(resample([0, 0, 10, 0, 0, 0.5], 20))
        expect(Math.hypot(...normals[1]!)).toBeLessThanOrEqual(2 + 1e-9)
    })
})

describe('addStrip', () => {
    test('a flat strip: one vertex per column per sample, two triangles per quad, on the ground plus its lift', () => {
        const builder = new Builder()
        const samples = resample([0, 0, 10, 0], 5)
        addStrip(
            builder,
            samples,
            rightNormals(samples),
            [
                { offset: -2, lift: 0.1 },
                { offset: 2, lift: 0.1 },
            ],
            flatGround
        )

        expect(builder.vertexCount).toBe(3 * 2)
        expect(builder.indices.length).toBe(2 * 2 * 3)
        const ys = builder.positions.filter((_, i) => i % 3 === 1)
        expect(new Set(ys)).toEqual(new Set([10.1]))
        const zs = builder.positions.filter((_, i) => i % 3 === 2)
        expect(Math.min(...zs)).toBe(-2)
        expect(Math.max(...zs)).toBe(2)
    })

    test('doubled columns make a hard edge without any triangles between them', () => {
        const builder = new Builder()
        const samples = resample([0, 0, 10, 0], 10)
        addStrip(
            builder,
            samples,
            rightNormals(samples),
            [
                { offset: 0, lift: 0 },
                { offset: 0, lift: 0.2 },
                { offset: 0, lift: 0.2 },
                { offset: 2, lift: 0.2 },
            ],
            flatGround
        )
        // Four columns, but only two real faces: the kerb and the top.
        expect(builder.indices.length).toBe(2 * 2 * 3)
    })

    test('a single sample lays nothing', () => {
        const builder = new Builder()
        addStrip(builder, [{ x: 0, z: 0, distance: 0 }], [[0, 1]], [{ offset: 0, lift: 0 }], flatGround)
        expect(builder.vertexCount).toBe(0)
    })
})

describe('spans', () => {
    test('splits where the test fails and drops runs of a single sample', () => {
        const samples = resample([0, 0, 10, 0], 1)
        const runs = spans(samples, rightNormals(samples), s => s.x < 3 || s.x > 5.5)
        expect(runs.map(run => run.samples.map(s => s.x))).toEqual([
            [0, 1, 2],
            [6, 7, 8, 9, 10],
        ])
        expect(runs[0]!.normals).toHaveLength(3)
    })
})

describe('shapes', () => {
    test('a disc is a fan around its centre', () => {
        const builder = new Builder()
        addDisc(builder, 5, 5, 3, 0.1, flatGround)
        expect(builder.vertexCount).toBe(15)
        expect(builder.indices.length).toBe(14 * 3)
    })

    test('a rectangle runs its length along the direction given', () => {
        const builder = new Builder()
        addRect(builder, 0, 0, 0, 1, 4, 1, 0, flatGround)
        const xs = builder.positions.filter((_, i) => i % 3 === 0)
        const zs = builder.positions.filter((_, i) => i % 3 === 2)
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(4)
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    })
})

describe('JunctionIndex', () => {
    const index = new JunctionIndex([0, 0, 10, 100, 100, 5])

    test('inside a junction’s radius, and only there', () => {
        expect(index.contains(3, 4)).toBe(true)
        expect(index.contains(11, 0)).toBe(false)
        expect(index.contains(102, 102)).toBe(true)
        expect(index.contains(50, 50)).toBe(false)
    })

    test('works across grid cells', () => {
        expect(index.contains(-8, 0)).toBe(true)
    })
})
