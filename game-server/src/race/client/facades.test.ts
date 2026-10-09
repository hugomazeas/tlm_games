import { describe, expect, test } from 'bun:test'
import type { Arcade, Fins } from '../map/format.ts'
import { addArcade, addFins, addParapet, edgesOf, Geometry, gridOnEdge } from './facades.ts'

/** A 30 × 10 m block: its north wall (edge 0) runs east along z = 0. */
const BLOCK = [0, 0, 30, 0, 30, 10, 0, 10]
const FINS: Fins = { spacing: 1.5, width: 0.9, depth: 0.7, recess: '#444444' }

const ys = (geometry: Geometry) => geometry.positions.filter((_, i) => i % 3 === 1)
const zs = (geometry: Geometry) => geometry.positions.filter((_, i) => i % 3 === 2)

describe('edgesOf', () => {
    test('gives each edge its outward normal, whichever way the ring winds', () => {
        const [north] = edgesOf(BLOCK)
        expect([north!.nx, north!.nz]).toEqual([0, -1])
        const reversed = edgesOf([0, 10, 30, 10, 30, 0, 0, 0])
        // Now edge 2 runs west along z = 0; out is still north.
        expect(reversed[2]!.nz).toBe(-1)
    })

    test('a courtyard’s walls face into the courtyard', () => {
        const [north] = edgesOf(BLOCK, true)
        expect(north!.nz).toBe(1)
    })
})

describe('gridOnEdge', () => {
    test('falls on the same spots whichever way a wall runs, so overlapping walls line up', () => {
        const [east] = edgesOf([2, 0, 11, 0, 11, 5, 2, 5])
        const [west] = edgesOf([11, 0, 2, 0, 2, -5, 11, -5])
        const eastward = gridOnEdge(east!, 3).map(t => 2 + t)
        const westward = gridOnEdge(west!, 3).map(t => 11 - t)
        expect(eastward).toEqual([3, 6, 9])
        expect(westward.sort()).toEqual([3, 6, 9])
    })

    test('keeps a margin clear of the ends', () => {
        const [north] = edgesOf(BLOCK)
        expect(gridOnEdge(north!, 1.5, 0.45)).toEqual(Array.from({ length: 19 }, (_, k) => (k + 1) * 1.5))
    })
})

describe('addFins', () => {
    test('stands a box out of every wall at each grid line, base to top', () => {
        const geometry = new Geometry()
        addFins(geometry, BLOCK, 100, 120, FINS)
        // 19 along each long wall, 6 along each short one; 12 triangles a box.
        expect(geometry.positions.length / 9).toBe((19 * 2 + 6 * 2) * 12)
        expect(Math.min(...ys(geometry))).toBe(100)
        expect(Math.max(...ys(geometry))).toBe(120)
        // The north wall's fins stand out to the north.
        expect(Math.min(...zs(geometry))).toBeCloseTo(-0.7)
    })

    test('start above an arcade on its edges', () => {
        const arcade: Arcade = { height: 5, top: 106, depth: 2, spacing: 6, edges: [0] }
        const geometry = new Geometry()
        addFins(geometry, BLOCK, 100, 120, FINS, arcade)
        const north = geometry.positions.flatMap((_, i) =>
            i % 3 === 0 && geometry.positions[i + 2]! < 0 ? [geometry.positions[i + 1]!] : []
        )
        expect(Math.min(...north)).toBe(106)
    })
})

describe('addArcade', () => {
    const arcade: Arcade = { height: 5, top: 105, depth: 2, spacing: 6, edges: [0] }

    test('only on its edges, from the base to its top, set into the wall by its depth', () => {
        const solid = new Geometry()
        const recess = new Geometry()
        addArcade(solid, recess, BLOCK, 100, arcade)
        expect(Math.max(...ys(solid))).toBe(105)
        expect(Math.min(...ys(solid))).toBe(100)
        // Everything is at the north wall: nothing reaches the south one at z = 10.
        expect(Math.max(...zs(solid))).toBeCloseTo(2)
        // The dark backs of the openings sit at the arcade's depth.
        expect(new Set(zs(recess).map(z => z.toFixed(3)))).toEqual(new Set(['2.000']))
    })

    test('an edge shorter than two arches stays solid wall', () => {
        const solid = new Geometry()
        const recess = new Geometry()
        addArcade(solid, recess, [0, 0, 4, 0, 4, 4, 0, 4], 100, arcade)
        expect(recess.positions).toHaveLength(0)
        expect(solid.positions.length / 9).toBe(2)
    })
})

describe('addParapet', () => {
    test('a low wall round the roof, as high as asked', () => {
        const geometry = new Geometry()
        addParapet(geometry, [{ ring: BLOCK, isHole: false }], 120, 1)
        expect(Math.min(...ys(geometry))).toBe(120)
        expect(Math.max(...ys(geometry))).toBe(121)
        // Outer face, inner face and cap on each of four walls.
        expect(geometry.positions.length / 9).toBe(4 * 3 * 2)
    })
})
