import { describe, expect, test } from 'bun:test'
import { parseCourse, projectCourse } from '../map/courses.ts'
import { projector } from '../map/convert.ts'
import type { Gate } from '../map/format.ts'
import { courseFile, gateAcrossRoad, insertionIndex, reversed } from './editing.ts'
import { courseRoute } from './route.ts'
import { testMap } from './fixtures.ts'
import { buildWorld } from './world.ts'

const gate = (x: number, z: number): Gate => ({ x, z, dx: 1, dz: 0, width: 10 })

describe('gateAcrossRoad', () => {
    const world = buildWorld(testMap({ roads: [{ kind: 'street', width: 10, points: [-400, 0, 400, 0] }] }))

    test('snaps onto the road, across it, a little wider than it', () => {
        const eastward = gateAcrossRoad(world, 30, 4, -Math.PI / 2 + 0.2)!
        expect(eastward).toMatchObject({ x: 30, z: 0, dx: 1, width: 14 })
        expect(eastward.dz).toBeCloseTo(0)
        expect(gateAcrossRoad(world, 30, 4, Math.PI / 2)!.dx).toBe(-1)
    })

    test('none without a road in reach', () => {
        expect(gateAcrossRoad(buildWorld(testMap()), 0, 0, 0)).toBeNull()
    })
})

describe('reversed', () => {
    const roads = [
        { kind: 'street' as const, width: 10, points: [0, 0, 200, 0] },
        { kind: 'street' as const, width: 10, points: [200, 0, 200, 200] },
        { kind: 'street' as const, width: 10, points: [200, 200, 0, 200] },
        { kind: 'street' as const, width: 10, points: [0, 200, 0, 0] },
    ]
    const gates = [gate(100, 0), gate(200, 100), gate(100, 200), gate(0, 100)]

    test('keeps the start line, and sends the race off from it the other way', () => {
        const back = reversed(gates)
        expect(back[0]).toBe(gates[0])
        expect(back.slice(1)).toEqual([gates[3]!, gates[2]!, gates[1]!])
        const course = (g: Gate[]) => ({ slug: 'block', name: 'Block', laps: 1, gates: g })
        // Clockwise heads east from the start (x grows); reversed, west.
        const east = courseRoute(course(gates), roads)!
        const west = courseRoute(course(back), roads)!
        expect(east.points[2]! - east.points[0]!).toBeGreaterThan(0)
        expect(west.points[2]! - west.points[0]!).toBeLessThan(0)
        expect(reversed(reversed(gates))).toEqual(gates)
    })
})

describe('insertionIndex', () => {
    const roads = [
        { kind: 'street' as const, width: 10, points: [0, 0, 200, 0] },
        { kind: 'street' as const, width: 10, points: [200, 0, 200, 200] },
        { kind: 'street' as const, width: 10, points: [200, 200, 0, 200] },
        { kind: 'street' as const, width: 10, points: [0, 200, 0, 0] },
    ]
    const gates = [gate(100, 0), gate(200, 100), gate(100, 200)]
    const route = courseRoute({ slug: 'block', name: 'Block', laps: 1, gates }, roads)

    test('a click on the route goes between the checkpoints either side of it', () => {
        expect(insertionIndex(route, gates, 200, 40, 15)).toBe(1)
        expect(insertionIndex(route, gates, 150, 197, 15)).toBe(2)
    })

    test('a click on the way back to the start goes last', () => {
        expect(insertionIndex(route, gates, 2, 100, 15)).toBe(3)
    })

    test('a click away from the route, or before there is one, goes last', () => {
        expect(insertionIndex(route, gates, 100, 100, 15)).toBe(3)
        expect(insertionIndex(null, gates.slice(0, 1), 0, 0, 15)).toBe(1)
    })
})

test('courseFile writes a course that reads back as the same gates', () => {
    const { project, unproject } = projector({ south: 46.79, west: -71.25, north: 46.82, east: -71.2 })
    const gates: Gate[] = [
        { x: 10, z: 20, dx: 1, dz: 0, width: 12 },
        { x: 210, z: 20, dx: 0, dz: 1, width: 14 },
        { x: 210, z: 220, dx: -0.6, dz: -0.8, width: 9 },
    ]
    const file = courseFile({ name: 'Round trip', laps: 2, gates }, unproject)
    const back = projectCourse('round-trip', parseCourse(file, 'round-trip.json'), project)
    back.gates.forEach((read, i) => {
        expect(read.x).toBeCloseTo(gates[i]!.x, 1)
        expect(read.z).toBeCloseTo(gates[i]!.z, 1)
        expect(read.dx).toBeCloseTo(gates[i]!.dx, 2)
        expect(read.dz).toBeCloseTo(gates[i]!.dz, 2)
        expect(read.width).toBe(gates[i]!.width)
    })
})
