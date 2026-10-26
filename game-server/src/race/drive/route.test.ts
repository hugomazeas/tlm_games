import { describe, expect, test } from 'bun:test'
import type { Course, Road } from '../map/format.ts'
import { courseRoute, locate, orientAlongRoute, pointAt, RoadGraph } from './route.ts'

/**
 * A 200 m square block of streets, corners at (0, 0) and (200, 200), with
 * a cul-de-sac off one side and a footpath cutting across the middle that
 * routes must not take.
 */
const roads: Road[] = [
    { kind: 'street', width: 10, points: [0, 0, 200, 0] },
    { kind: 'street', width: 10, points: [200, 0, 200, 200] },
    { kind: 'street', width: 10, points: [200, 200, 0, 200] },
    { kind: 'street', width: 10, points: [0, 200, 0, 0] },
    { kind: 'service', width: 5, points: [200, 100, 300, 100] },
    { kind: 'path', width: 3, points: [0, 100, 200, 100] },
]

/** Clockwise seen from above with north up: east along the top, south, west, north. */
const block: Course = {
    slug: 'block',
    name: 'Block',
    laps: 1,
    gates: [
        { x: 100, z: 0, dx: 1, dz: 0, width: 12 },
        { x: 200, z: 100, dx: 0, dz: 1, width: 12 },
        { x: 100, z: 200, dx: -1, dz: 0, width: 12 },
        { x: 0, z: 100, dx: 0, dz: -1, width: 12 },
    ],
}

describe('RoadGraph', () => {
    test('finds the shortest way along roads, never along footpaths', () => {
        const graph = new RoadGraph(roads)
        const from = graph.addGate({ x: 0, z: 100 })
        const to = graph.addGate({ x: 200, z: 100 })
        const path = graph.path(from, to)!
        const length = path.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - path[i]![0], z - path[i]![1]), 0)
        expect(length).toBeCloseTo(400)
    })

    test('two gates on one stretch of road both split it', () => {
        const graph = new RoadGraph(roads)
        const a = graph.addGate({ x: 50, z: 2 })
        const b = graph.addGate({ x: 150, z: -2 })
        expect(graph.path(a, b)).toEqual([
            [50, 0],
            [150, 0],
        ])
    })

    test('no way between roads that don’t meet', () => {
        const graph = new RoadGraph([
            { kind: 'street', width: 8, points: [0, 0, 10, 0] },
            { kind: 'street', width: 8, points: [50, 0, 60, 0] },
        ])
        expect(graph.path(graph.addGate({ x: 5, z: 0 }), graph.addGate({ x: 55, z: 0 }))).toBeNull()
    })
})

describe('courseRoute', () => {
    const route = courseRoute(block, roads)!

    test('goes round the block through every gate, ending where it started', () => {
        expect(route.length).toBeCloseTo(800)
        expect(route.gateAlong).toEqual([0, 200, 400, 600])
        expect(route.points.slice(0, 2)).toEqual([100, 0])
        expect(route.points.slice(-2)).toEqual([100, 0])
    })

    test('pointAt walks it and wraps round', () => {
        expect(pointAt(route, 50)).toMatchObject({ x: 150, z: 0 })
        expect(pointAt(route, 50).heading).toBeCloseTo(-Math.PI / 2)
        expect(pointAt(route, 850).x).toBeCloseTo(150)
    })

    test('locate keeps to the stretch it is told to look on', () => {
        expect(locate(route, 150, 5, 0, 200)).toBeCloseTo(50)
        // Near the start line, looking only at the last stretch, it's at the end of the lap, not the start.
        expect(locate(route, 60, 3, 600, 0)).toBeCloseTo(760)
    })

    test('none when a gate is cut off from the rest', () => {
        const island: Course = { ...block, gates: [...block.gates, { x: 1000, z: 1000, dx: 1, dz: 0, width: 10 }] }
        expect(
            courseRoute(island, [...roads, { kind: 'street', width: 8, points: [990, 1000, 1010, 1000] }])
        ).toBeNull()
    })
})

describe('orientAlongRoute', () => {
    const route = courseRoute(block, roads)!

    test('turns each gate to face the way the route goes through it', () => {
        // Every gate laid the other way round, as the editor may leave them: the route still goes clockwise.
        const reversed = { ...block, gates: block.gates.map(gate => ({ ...gate, dx: -gate.dx, dz: -gate.dz })) }
        expect(orientAlongRoute(reversed, route).gates).toEqual(block.gates)
    })

    test('a gate already facing the way through is left as it is, its line across the road too', () => {
        const oriented = orientAlongRoute(block, route)
        oriented.gates.forEach((gate, i) => expect(gate).toBe(block.gates[i]!))
    })

    test('a gate laid across another road (a path crossing the street) is turned square across the route', () => {
        // The first gate laid along the street, as if across a footpath meeting it there.
        const askew = { ...block, gates: [{ ...block.gates[0]!, dx: 0, dz: 1 }, ...block.gates.slice(1)] }
        const turned = orientAlongRoute(askew, route).gates[0]!
        expect(turned.dx).toBeCloseTo(block.gates[0]!.dx)
        expect(turned.dz).toBeCloseTo(block.gates[0]!.dz)
    })
})
