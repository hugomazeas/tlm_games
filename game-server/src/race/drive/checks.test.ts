import { expect, test } from 'bun:test'
import type { Course, Road } from '../map/format.ts'
import { courseProblems } from './checks.ts'
import { box, testMap } from './fixtures.ts'
import { buildWorld } from './world.ts'

/** A 400 m square block of streets, corners at (−200, −200) and (200, 200). */
const roads: Road[] = [
    { kind: 'street', width: 12, points: [-200, -200, 200, -200] },
    { kind: 'street', width: 12, points: [200, -200, 200, 200] },
    { kind: 'street', width: 12, points: [200, 200, -200, 200] },
    { kind: 'street', width: 12, points: [-200, 200, -200, -200] },
]

/** Clockwise round the block, the start halfway along the north side. */
const course: Course = {
    slug: 'block',
    name: 'Block',
    laps: 3,
    gates: [
        { x: 0, z: -200, dx: 1, dz: 0, width: 16 },
        { x: 200, z: 0, dx: 0, dz: 1, width: 16 },
        { x: 0, z: 200, dx: -1, dz: 0, width: 16 },
        { x: -200, z: 0, dx: 0, dz: -1, width: 16 },
    ],
}

test('a course on clear streets has no problems', () => {
    expect(courseProblems(course, buildWorld(testMap({ roads })), roads)).toEqual([])
})

test('a checkpoint off the streets, or with a building across it', () => {
    const world = buildWorld(testMap({ roads, buildings: [box(1, 200, 0, 3)] }))
    const offRoad: Course = {
        ...course,
        gates: [...course.gates.slice(0, 3), { x: -100, z: 0, dx: 0, dz: -1, width: 16 }],
    }
    expect(courseProblems(offRoad, world, roads)).toContain("checkpoint 4 isn't on a road")
    expect(courseProblems(course, world, roads)).toContain('a building stands in checkpoint 2')
})

test('a start line too close to a corner leaves no room for the grid', () => {
    const cramped: Course = { ...course, gates: [{ ...course.gates[0]!, x: -185 }, ...course.gates.slice(1)] }
    expect(courseProblems(cramped, buildWorld(testMap({ roads })), roads).join()).toMatch(/no room on the grid/)
})

test('checkpoints no street joins', () => {
    const island: Road = { kind: 'street', width: 12, points: [300, 300, 400, 300] }
    const cut: Course = { ...course, gates: [...course.gates, { x: 350, z: 300, dx: 1, dz: 0, width: 16 }] }
    expect(courseProblems(cut, buildWorld(testMap({ roads: [...roads, island] })), [...roads, island])).toContain(
        'no streets join all its checkpoints'
    )
})
