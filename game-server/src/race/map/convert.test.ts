import { describe, expect, test } from 'bun:test'
import {
    areaKind,
    type Bounds,
    buildingHeight,
    clipToRect,
    containsPoint,
    convertMap,
    heightAt,
    type LatLon,
    type OsmElement,
    projector,
    ringArea,
    riverPolygon,
    roadKind,
    smoothTerrain,
    stitchChains,
    stitchRings,
} from './convert.ts'

const BOUNDS: Bounds = { south: 46.79, west: -71.25, north: 46.8, east: -71.23 }

/** A square way around a point, `size` degrees across. */
function square(lat: number, lon: number, size: number): LatLon[] {
    return [
        { lat, lon },
        { lat, lon: lon + size },
        { lat: lat + size, lon: lon + size },
        { lat: lat + size, lon },
        { lat, lon },
    ]
}

/** An elevation grid of the given size, every sample at `height`. */
function flatGrid(cols: number, rows: number, height: number): number[][] {
    return Array.from({ length: rows }, () => new Array(cols).fill(height))
}

describe('projector', () => {
    const { origin, project } = projector(BOUNDS)

    test('the centre of the bounds is the origin', () => {
        const [x, z] = project(origin)
        expect(x).toBeCloseTo(0)
        expect(z).toBeCloseTo(0)
    })

    test('east is +x and north is -z', () => {
        const [x, z] = project({ lat: origin.lat + 0.001, lon: origin.lon + 0.001 })
        expect(x).toBeGreaterThan(0)
        expect(z).toBeLessThan(0)
    })

    test('a degree of latitude is about 111 km, a degree of longitude shrinks with latitude', () => {
        const [, z] = project({ lat: origin.lat + 0.01, lon: origin.lon })
        const [x] = project({ lat: origin.lat, lon: origin.lon + 0.01 })
        expect(-z).toBeCloseTo(1113.2, 0)
        expect(x).toBeCloseTo(1113.2 * Math.cos((origin.lat * Math.PI) / 180), 0)
    })
})

describe('stitchRings', () => {
    test('joins split ways into one closed ring, whichever way they run', () => {
        const a = { lat: 0, lon: 0 }
        const b = { lat: 0, lon: 1 }
        const c = { lat: 1, lon: 1 }
        const d = { lat: 1, lon: 0 }

        const rings = stitchRings([
            [a, b],
            [d, c], // reversed
            [b, c],
            [d, a],
        ])

        expect(rings).toHaveLength(1)
        expect(rings[0]).toHaveLength(5)
        expect(rings[0]![0]).toEqual(rings[0]!.at(-1)!)
    })

    test('drops ways that never close', () => {
        expect(
            stitchRings([
                [
                    { lat: 0, lon: 0 },
                    { lat: 0, lon: 1 },
                ],
            ])
        ).toEqual([])
    })
})

describe('stitchChains', () => {
    test('grows an open chain from both ends', () => {
        const p = (lon: number) => ({ lat: 0, lon })
        const chains = stitchChains([
            [p(1), p(2)],
            [p(3), p(2)],
            [p(0), p(1)],
        ])

        expect(chains).toHaveLength(1)
        expect(chains[0]!.map(point => point.lon)).toEqual([0, 1, 2, 3])
    })
})

describe('riverPolygon', () => {
    // A shore running west to east across a 100 × 100 map, 20 m south of its centre.
    const shore: [number, number][] = [
        [-80, 20],
        [0, 25],
        [80, 20],
    ]

    test('takes the side of the shore that holds the water sample', () => {
        const south = riverPolygon(shore, [0, 45], 100, 100)!
        expect(containsPoint(south, [0, 45])).toBe(true)
        expect(containsPoint(south, [0, -30])).toBe(false)

        const north = riverPolygon(shore, [0, -30], 100, 100)!
        expect(containsPoint(north, [0, -30])).toBe(true)
        expect(containsPoint(north, [0, 45])).toBe(false)
    })

    test('stays inside the map', () => {
        const polygon = riverPolygon(shore, [0, 45], 100, 100)!
        for (const [x, z] of polygon) {
            expect(Math.abs(x)).toBeLessThanOrEqual(50)
            expect(Math.abs(z)).toBeLessThanOrEqual(50)
        }
        // Roughly the 100 × ~27 m strip south of the shore.
        expect(Math.abs(ringArea(polygon.flat()))).toBeGreaterThan(2400)
        expect(Math.abs(ringArea(polygon.flat()))).toBeLessThan(3200)
    })

    test('works for a shore that turns a corner of the map', () => {
        // Enters from the south, leaves by the east: the water is the south-east corner.
        const corner = riverPolygon(
            [
                [10, 90],
                [20, 20],
                [90, 10],
            ],
            [45, 45],
            100,
            100
        )!
        expect(containsPoint(corner, [45, 45])).toBe(true)
        expect(containsPoint(corner, [-40, -40])).toBe(false)
    })

    test('no shore, no river', () => {
        expect(riverPolygon([], [0, 0], 100, 100)).toBeNull()
    })
})

describe('clipToRect', () => {
    test('keeps a polygon already inside', () => {
        const inside: [number, number][] = [
            [1, 1],
            [2, 1],
            [2, 2],
        ]
        expect(clipToRect(inside, 0, 0, 10, 10)).toEqual(inside)
    })

    test('cuts a polygon down to the rectangle', () => {
        const big: [number, number][] = [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
        ]
        const clipped = clipToRect(big, 0, 0, 2, 3)
        expect(Math.abs(ringArea(clipped.flat()))).toBeCloseTo(6)
    })

    test('a polygon entirely outside disappears', () => {
        expect(
            clipToRect(
                [
                    [20, 20],
                    [21, 20],
                    [21, 21],
                ],
                0,
                0,
                10,
                10
            )
        ).toEqual([])
    })
})

describe('buildingHeight', () => {
    test('uses the height tag first', () => {
        expect(buildingHeight({ building: 'yes', height: '132', 'building:levels': '3' }, 1)).toBe(132)
    })

    test('falls back on the floor count', () => {
        expect(buildingHeight({ building: 'yes', 'building:levels': '10' }, 1)).toBeCloseTo(33.5)
    })

    test('guesses from the kind of building, varied by id', () => {
        const shed = buildingHeight({ building: 'shed' }, 1)
        const house = buildingHeight({ building: 'house' }, 1)
        const other = buildingHeight({ building: 'yes' }, 1)
        expect(shed).toBeLessThan(house)
        expect(house).toBeLessThan(other)
        expect(buildingHeight({ building: 'yes' }, 2)).not.toBe(other)
    })

    test('ignores nonsense heights', () => {
        expect(buildingHeight({ building: 'house', height: 'tall' }, 0)).toBe(7)
    })
})

describe('terrain', () => {
    test('smoothing leaves flat ground flat', () => {
        const terrain = smoothTerrain(flatGrid(4, 3, 50), 10)
        expect(terrain.cols).toBe(4)
        expect(terrain.rows).toBe(3)
        expect(new Set(terrain.heights)).toEqual(new Set([50]))
    })

    test('smoothing softens a one-metre step', () => {
        const grid = [
            [10, 10, 11, 11],
            [10, 10, 11, 11],
        ]
        const heights = smoothTerrain(grid, 10).heights
        expect(heights[1]).toBeGreaterThan(10)
        expect(heights[2]).toBeLessThan(11)
    })

    test('the river sits flat below the water line, and does not drag its banks down', () => {
        const grid = [[0, 0, 40, 40]]
        const terrain = smoothTerrain(grid, 10)
        expect(terrain.heights[0]).toBeLessThan(terrain.waterLevel)
        expect(terrain.heights[1]).toBeLessThan(terrain.waterLevel)
        expect(terrain.heights[2]).toBe(40)
    })

    test('cells the river covers sit below the water line whatever their elevation', () => {
        const terrain = smoothTerrain([[4, 4, 30]], 10, (_, col) => col === 0)
        expect(terrain.heights[0]).toBeLessThan(terrain.waterLevel)
        expect(terrain.heights[1]).toBeGreaterThan(terrain.waterLevel)
    })

    test('heightAt blends between samples and clamps at the edges', () => {
        const terrain = { cols: 2, rows: 2, cell: 10, heights: [0, 10, 0, 10], waterLevel: 0 }
        expect(heightAt(terrain, 10, 10, 0, 0)).toBeCloseTo(5)
        expect(heightAt(terrain, 10, 10, -5, -5)).toBe(0)
        expect(heightAt(terrain, 10, 10, 500, 0)).toBe(10)
    })
})

describe('tag classification', () => {
    test('roads', () => {
        expect(roadKind('primary')).toBe('major')
        expect(roadKind('residential')).toBe('street')
        expect(roadKind('service')).toBe('service')
        expect(roadKind('footway')).toBe('path')
        expect(roadKind('steps')).toBeNull()
    })

    test('areas', () => {
        expect(areaKind({ leisure: 'park' })).toBe('park')
        expect(areaKind({ natural: 'wood' })).toBe('wood')
        expect(areaKind({ natural: 'water' })).toBe('water')
        expect(areaKind({ amenity: 'parking' })).toBe('parking')
        expect(areaKind({ shop: 'bakery' })).toBeNull()
    })
})

describe('convertMap', () => {
    test('lowers the terrain under the river and paints it as water', () => {
        const { origin: centre } = projector(BOUNDS)
        const shore = [
            [
                { lat: centre.lat - 0.002, lon: BOUNDS.west - 0.01 },
                { lat: centre.lat - 0.002, lon: BOUNDS.east + 0.01 },
            ],
        ]
        const map = convertMap('Test', BOUNDS, [], flatGrid(5, 4, 4), 400, {
            river: {
                shore,
                sample: { lat: BOUNDS.south + 0.0005, lon: centre.lon },
            },
        })

        expect(map.areas.map(area => area.kind)).toEqual(['water'])
        const southRow = map.terrain.heights.slice(-5)
        const northRow = map.terrain.heights.slice(0, 5)
        expect(Math.max(...southRow)).toBeLessThan(map.terrain.waterLevel)
        expect(Math.min(...northRow)).toBe(4)
    })

    const { origin } = projector(BOUNDS)
    const grid = flatGrid(5, 4, 60)

    test('turns a building way into a footprint standing on the ground', () => {
        const elements: OsmElement[] = [
            {
                type: 'way',
                id: 7,
                tags: { building: 'yes', 'building:levels': '5', name: 'Tower' },
                geometry: square(origin.lat, origin.lon, 0.0002),
            },
        ]
        const map = convertMap('Test', BOUNDS, elements, grid, 400)

        expect(map.buildings).toHaveLength(1)
        const building = map.buildings[0]!
        expect(building.name).toBe('Tower')
        expect(building.outline).toHaveLength(8) // four corners, closing point dropped
        expect(building.base).toBeLessThan(60)
        expect(building.top).toBeCloseTo(60 + 5 * 3.2 + 1.5)
    })

    test('stitches a multipolygon building and keeps its courtyard as a hole', () => {
        const outer = square(origin.lat, origin.lon, 0.001)
        const elements: OsmElement[] = [
            {
                type: 'relation',
                id: 9,
                tags: { building: 'government', type: 'multipolygon' },
                members: [
                    { type: 'way', role: 'outer', geometry: outer.slice(0, 3) },
                    { type: 'way', role: 'outer', geometry: outer.slice(2) },
                    { type: 'way', role: 'inner', geometry: square(origin.lat + 0.0004, origin.lon + 0.0004, 0.0002) },
                ],
            },
        ]
        const map = convertMap('Test', BOUNDS, elements, grid, 400)

        expect(map.buildings).toHaveLength(1)
        expect(map.buildings[0]!.holes).toHaveLength(1)
    })

    test('leaves out buildings outside the bounds, tunnels and steps', () => {
        const elements: OsmElement[] = [
            { type: 'way', id: 1, tags: { building: 'yes' }, geometry: square(47.5, -71, 0.0002) },
            {
                type: 'way',
                id: 2,
                tags: { highway: 'primary', tunnel: 'yes' },
                geometry: [origin, { lat: origin.lat, lon: origin.lon + 0.001 }],
            },
            {
                type: 'way',
                id: 3,
                tags: { highway: 'steps' },
                geometry: [origin, { lat: origin.lat, lon: origin.lon + 0.001 }],
            },
            {
                type: 'way',
                id: 4,
                tags: { highway: 'residential' },
                geometry: [origin, { lat: origin.lat, lon: origin.lon + 0.001 }],
            },
        ]
        const map = convertMap('Test', BOUNDS, elements, grid, 400)

        expect(map.buildings).toHaveLength(0)
        expect(map.roads).toEqual([expect.objectContaining({ kind: 'street', lanes: 2, sidewalks: 'both' })])
    })

    test('clips a park to the map and paints big areas first', () => {
        const elements: OsmElement[] = [
            { type: 'way', id: 1, tags: { leisure: 'pitch' }, geometry: square(origin.lat, origin.lon, 0.0005) },
            { type: 'way', id: 2, tags: { leisure: 'park' }, geometry: square(46.7, -71.4, 0.3) },
        ]
        const map = convertMap('Test', BOUNDS, elements, grid, 400)

        // A pitch is painted as park too; the big one comes first.
        expect(map.areas.map(area => area.kind)).toEqual(['park', 'park'])
        const xs = map.areas[0]!.outline.filter((_, i) => i % 2 === 0)
        expect(Math.max(...xs)).toBeLessThanOrEqual(map.width / 2)
        expect(Math.abs(ringArea(map.areas[0]!.outline))).toBeGreaterThan(Math.abs(ringArea(map.areas[1]!.outline)))
    })
})
