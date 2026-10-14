import { describe, expect, test } from 'bun:test'
import type { Road } from './format.ts'
import {
    findCrossings,
    findJunctions,
    findStops,
    followTraffic,
    placeFurniture,
    RoadIndex,
    roadProfile,
} from './streets.ts'

/** A drivable road along flat [x, z, …] points. */
function road(points: number[], width = 8): Road {
    return { kind: 'street', width, points, lanes: 2 }
}

describe('roadProfile', () => {
    test('uses tagged lanes and width', () => {
        expect(roadProfile('major', { lanes: '3', width: '12' })).toMatchObject({ lanes: 3, width: 12 })
    })

    test('a street without lane tags gets two lanes plus parking, and sidewalks on both sides', () => {
        const profile = roadProfile('street', {})
        expect(profile.lanes).toBe(2)
        expect(profile.width).toBeCloseTo(2 * 3.3 + 2.2)
        expect(profile.sidewalks).toBe('both')
    })

    test('one-way roads have fewer lanes by default and say so', () => {
        expect(roadProfile('street', { oneway: 'yes' })).toMatchObject({ lanes: 1, oneway: true })
        expect(roadProfile('major', { oneway: 'yes' })).toMatchObject({ lanes: 2, oneway: true })
    })

    test('a service road has no sidewalks unless tagged, and a usable width', () => {
        const profile = roadProfile('service', {})
        expect(profile.sidewalks).toBeUndefined()
        expect(profile.width).toBeGreaterThanOrEqual(4.5)
    })

    test('reads every way OSM tags sidewalks', () => {
        expect(roadProfile('street', { sidewalk: 'left' }).sidewalks).toBe('left')
        expect(roadProfile('street', { sidewalk: 'separate' }).sidewalks).toBeUndefined()
        expect(roadProfile('street', { sidewalk: 'no' }).sidewalks).toBeUndefined()
        expect(roadProfile('street', { 'sidewalk:both': 'yes' }).sidewalks).toBe('both')
        expect(roadProfile('street', { 'sidewalk:both': 'separate' }).sidewalks).toBeUndefined()
        expect(roadProfile('street', { 'sidewalk:right': 'yes', 'sidewalk:left': 'no' }).sidewalks).toBe('right')
    })

    test('paints bike lanes only where the cycleway is a lane on the road', () => {
        expect(roadProfile('street', { 'cycleway:both': 'lane' }).bikeLanes).toBe('both')
        expect(roadProfile('street', { 'cycleway:right': 'lane' }).bikeLanes).toBe('right')
        expect(roadProfile('street', { cycleway: 'track' }).bikeLanes).toBeUndefined()
        expect(roadProfile('street', {}).bikeLanes).toBeUndefined()
    })

    test('paths and separate sidewalks are just a width', () => {
        expect(roadProfile('path', { lanes: '2' })).toEqual({ width: 2.5 })
        expect(roadProfile('sidewalk', {})).toEqual({ width: 2 })
    })
})

describe('followTraffic', () => {
    test('a oneway=-1 road is flipped to run with the traffic, sides included', () => {
        const tags = { oneway: '-1' }
        const { points, road } = followTraffic(
            [
                [0, 0],
                [10, 0],
            ],
            tags,
            { width: 4, sidewalks: 'left' }
        )
        expect(points).toEqual([
            [10, 0],
            [0, 0],
        ])
        expect(road.sidewalks).toBe('right')
    })

    test('other roads are left alone', () => {
        const points: [number, number][] = [
            [0, 0],
            [10, 0],
        ]
        expect(followTraffic(points, { oneway: 'yes' }, { width: 4 }).points).toBe(points)
    })
})

describe('findJunctions', () => {
    test('a crossroads and a T are junctions, a street split in two is not', () => {
        const roads = [
            road([-50, 0, 0, 0, 50, 0]), // through, east-west
            road([0, -50, 0, 0, 0, 50]), // through, north-south: crossroads at 0,0
            road([100, 0, 50, 0]), // continues the first road: 50,0 is a seam, not a junction
            road([100, 0, 100, 40], 12), // starts where the last one ends: two ends meet, still no junction
            road([25, 0, 25, 30]), // ends on the first road's segment, not a node: no junction
        ]

        const junctions = findJunctions(roads)
        const points = []
        for (let i = 0; i < junctions.length; i += 3) points.push([junctions[i], junctions[i + 1]])
        expect(points).toEqual([[0, 0]])
    })

    test('a road ending on another road’s node makes a T, sized by the widest road', () => {
        const junctions = findJunctions([road([-50, 0, 0, 0, 50, 0], 8), road([0, 0, 0, 40], 14)])
        expect(junctions).toEqual([0, 0, 14 / 2 + 1.5])
    })

    test('paths never make junctions', () => {
        const path: Road = { kind: 'path', width: 2.5, points: [0, -10, 0, 0, 0, 10] }
        expect(findJunctions([road([-50, 0, 0, 0, 50, 0]), path])).toEqual([])
    })
})

describe('RoadIndex', () => {
    const index = new RoadIndex([road([0, 0, 100, 0], 10)])

    test('finds the closest point and the road’s direction', () => {
        const nearest = index.nearest(30, 4, 20)!
        expect(nearest.distance).toBeCloseTo(4)
        expect(nearest.x).toBeCloseTo(30)
        expect(nearest.z).toBeCloseTo(0)
        expect([nearest.dx, nearest.dz]).toEqual([1, 0])
        expect(nearest.width).toBe(10)
    })

    test('nothing beyond the range', () => {
        expect(index.nearest(30, 40, 20)).toBeNull()
    })

    test('ignores paths', () => {
        const paths = new RoadIndex([{ kind: 'path', width: 2.5, points: [0, 0, 100, 0] }])
        expect(paths.nearest(30, 1, 20)).toBeNull()
    })
})

describe('findCrossings', () => {
    const index = new RoadIndex([road([0, 0, 100, 0], 10)])

    test('a mapped crossing way keeps its own line', () => {
        const crossings = findCrossings(
            [
                [
                    [50, -5],
                    [50, 5],
                ],
            ],
            [],
            index
        )
        expect(crossings).toEqual([50, 0, 0, 1, 10])
    })

    test('a crossing node runs square across the nearest road, its width long', () => {
        const crossings = findCrossings([], [[20, 1]], index)
        expect(crossings).toEqual([20, 0, -0, 1, 10])
    })

    test('a node beside a mapped crossing is the same crossing', () => {
        const way: [number, number][][] = [
            [
                [50, -5],
                [50, 5],
            ],
        ]
        expect(findCrossings(way, [[51, 0]], index)).toHaveLength(5)
    })

    test('a node far from any road is dropped', () => {
        expect(findCrossings([], [[20, 80]], index)).toEqual([])
    })
})

describe('placeFurniture', () => {
    const index = new RoadIndex([road([0, 0, 100, 0], 10)])
    const none = { trees: [], benches: [], signals: [], busStops: [] }

    test('drops trees standing in the carriageway, keeping the others with their size and kind', () => {
        const tree = (x: number, z: number) => ({ x, z, height: 12, crown: 8, kind: 'conifer' as const })
        const props = placeFurniture({ ...none, trees: [tree(10, 1), tree(10, 9)] }, index)
        expect(props.trees).toEqual([10, 9, 12, 8, 1])
    })

    test('moves a traffic light from the middle of the road to its right-hand kerb, its arm reaching back over the road', () => {
        const props = placeFurniture({ ...none, signals: [[40, 0]] }, index)
        // Heading east, the right is south (+z): half the width plus the set-back. The arm points north.
        expect(props.signals).toEqual([40, 6.2, 0, -1, 5.2])
    })

    test('a mast arm never reaches further than 9 m', () => {
        const wide = new RoadIndex([road([0, 0, 100, 0], 40)])
        const props = placeFurniture({ ...none, signals: [[40, 0]] }, wide)
        expect(props.signals[4]).toBe(9)
    })

    test('keeps a light on the side of the road it was mapped on', () => {
        const props = placeFurniture({ ...none, signals: [[40, -3]] }, index)
        expect(props.signals[1]).toBeCloseTo(-6.2)
    })

    test('furniture with no road nearby stays put or goes', () => {
        const props = placeFurniture({ ...none, benches: [[40, 70]], signals: [[40, 70]] }, index)
        expect(props.benches).toEqual([40, 70])
        expect(props.signals).toEqual([])
    })
})

describe('findStops', () => {
    const index = new RoadIndex([road([0, 0, 100, 0], 10)])

    test('faces the traffic heading for the nearest junction', () => {
        // A junction at the east end: traffic comes in heading east.
        expect(findStops([[90, 1]], [100, 0, 6.5], index)).toEqual([90, 0, 1, 0, 10])
        // At the west end: heading west.
        expect(findStops([[10, 1]], [0, 0, 6.5], index)).toEqual([10, 0, -1, -0, 10])
    })

    test('a stop sign with no junction close ahead is dropped', () => {
        expect(findStops([[50, 0]], [500, 0, 6.5], index)).toEqual([])
    })

    test('a stop sign off any road is dropped', () => {
        expect(findStops([[50, 60]], [100, 0, 6.5], index)).toEqual([])
    })
})
