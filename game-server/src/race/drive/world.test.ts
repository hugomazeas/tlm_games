import { describe, expect, test } from 'bun:test'
import { box, testMap } from './fixtures.ts'
import { buildWorld, placePads, wrapAngle } from './world.ts'

describe('surfaces', () => {
    const world = buildWorld(
        testMap(
            {
                roads: [
                    { kind: 'street', width: 10, points: [-400, 0, 400, 0] },
                    { kind: 'path', width: 3, points: [0, -400, 0, -100] },
                ],
                areas: [
                    { kind: 'parking', outline: [100, 100, 150, 100, 150, 150, 100, 150] },
                    { kind: 'water', outline: [-150, 100, -100, 100, -100, 150, -150, 150] },
                ],
            },
            (x, z) => (x > 450 && z > 450 ? -5 : 10)
        )
    )

    test('streets and paths are road, out to their kerbs', () => {
        expect(world.surface(0, 0)).toBe('road')
        expect(world.surface(200, 4)).toBe('road')
        expect(world.surface(200, 8)).toBe('offroad')
        expect(world.surface(0, -200)).toBe('road')
    })

    test('a car park is road, a pond and the river are water, the rest is offroad', () => {
        expect(world.surface(125, 125)).toBe('road')
        expect(world.surface(-125, 125)).toBe('water')
        expect(world.surface(490, 490)).toBe('water')
        expect(world.surface(300, 300)).toBe('offroad')
    })
})

describe('colliders', () => {
    test('a building is solid only between its base and top', () => {
        const world = buildWorld(testMap({ buildings: [box(1, 0, 0, 10, 14, 20)] }))
        const near = world.collidersNear(11, 0, 2)
        expect(near.length).toBeGreaterThan(0)
        expect(near.every(collider => collider.bottom === 14 && collider.top === 20)).toBe(true)
    })

    test('far colliders are not returned', () => {
        const world = buildWorld(testMap({ buildings: [box(1, 0, 0, 10)] }))
        expect(world.collidersNear(200, 200, 3)).toEqual([])
    })

    test('a wall is as thick as it is mapped and as high as it stands', () => {
        const world = buildWorld(testMap({ walls: [{ points: [-50, 50, 50, 50], height: 6, thickness: 3 }] }))
        const [wall] = world.collidersNear(0, 50, 2)
        expect(wall).toMatchObject({ radius: 1.5, bottom: 9, top: 16 })
    })

    test('solid decor blocks, turned as it stands: a plinth’s edges, a pool’s round rim; a hedge doesn’t', () => {
        const shape = { y: 10, height: 2, colour: '#888888' }
        const world = buildWorld(
            testMap({
                decor: {
                    shapes: [
                        { ...shape, shape: 'box', x: 0, z: 0, width: 4, depth: 2, turn: Math.PI / 2, solid: true },
                        { ...shape, shape: 'cylinder', x: 100, z: 0, width: 10, depth: 10, turn: 0, solid: true },
                        { ...shape, shape: 'box', x: 200, z: 0, width: 20, depth: 1, turn: 0 },
                    ],
                    paint: [],
                },
            })
        )
        // Turned a quarter, the 4 m side runs north–south: its corners are 1 m east and west, 2 m north and south.
        const plinth = world.collidersNear(0, 0, 1)
        expect(plinth).toHaveLength(4)
        const xs = plinth.flatMap(c => [c.x1, c.x2])
        const zs = plinth.flatMap(c => [c.z1, c.z2])
        expect(Math.max(...xs)).toBeCloseTo(1)
        expect(Math.max(...zs)).toBeCloseTo(2)
        expect(world.collidersNear(100, 0, 1)).toEqual([
            { x1: 100, z1: 0, x2: 100, z2: 0, radius: 5, bottom: 10, top: 12 },
        ])
        expect(world.collidersNear(200, 0, 3)).toEqual([])
    })
})

describe('nearestRoad', () => {
    const world = buildWorld(testMap({ roads: [{ kind: 'street', width: 10, points: [-400, 0, 400, 0] }] }))

    test('lands on the road, facing the way along it closer to the heading', () => {
        const west = world.nearestRoad(50, 30, Math.PI / 2 - 0.3)!
        expect(west.x).toBeCloseTo(50)
        expect(west.z).toBeCloseTo(0)
        expect(west.heading).toBeCloseTo(Math.PI / 2)
        expect(west.width).toBe(10)

        const east = world.nearestRoad(50, 30, -Math.PI / 2 + 0.3)!
        expect(east.heading).toBeCloseTo(-Math.PI / 2)
    })

    test('ignores footpaths, and gives up beyond its reach', () => {
        const paths = buildWorld(testMap({ roads: [{ kind: 'path', width: 3, points: [-400, 0, 400, 0] }] }))
        expect(paths.nearestRoad(0, 10, 0)).toBeNull()
        expect(world.nearestRoad(0, -300, 0)).not.toBeNull()
        expect(world.nearestRoad(0, -450, 0)).toBeNull()
    })
})

describe('placePads', () => {
    test('a long straight gets pads every few hundred metres from a little way in', () => {
        const pads = placePads({ roads: [{ kind: 'major', width: 12, points: [0, 0, 400, 0, 800, 0] }] })
        expect(pads.map(pad => pad.x)).toEqual([40, 340, 640])
        expect(pads[0]).toMatchObject({ z: 0, dx: 1, dz: 0, width: 5 })
    })

    test('short or bending roads and back lanes get none', () => {
        expect(placePads({ roads: [{ kind: 'street', width: 8, points: [0, 0, 100, 0, 100, 100, 0, 100] }] })).toEqual(
            []
        )
        expect(placePads({ roads: [{ kind: 'service', width: 5, points: [0, 0, 800, 0] }] })).toEqual([])
    })

    test('never puts two pads close together', () => {
        const pads = placePads({
            roads: [
                { kind: 'major', width: 12, points: [0, 0, 400, 0] },
                { kind: 'major', width: 12, points: [0, 10, 400, 10] },
            ],
        })
        expect(pads).toHaveLength(2)
    })

    test('a pad is found anywhere on it, not beside it', () => {
        const world = buildWorld(testMap({ roads: [{ kind: 'major', width: 12, points: [-400, 0, 400, 0] }] }))
        const pad = world.pads[0]!
        expect(world.padAt(pad.x + 2, pad.z + 2)).toBe(pad)
        expect(world.padAt(pad.x + 4, pad.z)).toBeNull()
        expect(world.padAt(pad.x, pad.z + 3)).toBeNull()
    })
})

test('wrapAngle brings angles into (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5)
})
