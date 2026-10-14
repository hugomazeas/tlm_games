import { describe, expect, test } from 'bun:test'
import { projectionAt } from './convert.ts'
import {
    type DecorItem,
    expandDecor,
    fountainShapes,
    isStatue,
    osmDecor,
    parseDecor,
    pointsAlong,
    statueShapes,
} from './decor.ts'

const origin = { lat: 46.8, lon: -71.2 }
const { project, unproject } = projectionAt(origin)
const flat = () => 100
/** A lat/lon this many metres east and south of the origin. */
const at = (x: number, z: number) => unproject([x, z])

describe('parseDecor', () => {
    const valid = {
        $schema: '../../decor.schema.json',
        name: 'Place',
        replaces: ['node/1', 'way/2'],
        items: [
            {
                kind: 'statue',
                at: origin,
                facing: 90,
                figure: 'equestrian',
                height: 4,
                plinth: { width: 2, depth: 4, height: 3 },
            },
            { kind: 'hedge', line: [origin, at(10, 0)], height: 1 },
            { kind: 'trees', tree: 'conifer', height: 12, crown: 5, points: [origin] },
        ],
    }

    test('accepts a valid file and drops $schema', () => {
        const file = parseDecor(valid, 'decor/place.json')
        expect(file.name).toBe('Place')
        expect(file.items).toHaveLength(3)
        expect('$schema' in file).toBe(false)
    })

    test('lists every problem: unknown keys and kinds, missing fields, bad colours and references', () => {
        const broken = {
            name: 'Place',
            replaces: ['tree 12'],
            items: [
                {
                    kind: 'statue',
                    at: origin,
                    facing: 0,
                    figure: 'flying',
                    height: 2,
                    plinth: { width: 1, depth: 1, height: 1 },
                    size: 3,
                },
                { kind: 'gazebo', at: origin },
                { kind: 'hedge', line: [origin], colour: 'green' },
                { kind: 'trees', tree: 'broadleaf', height: 10, crown: 6, points: [origin], line: [origin, origin] },
            ],
        }
        let message = ''
        try {
            parseDecor(broken, 'decor/broken.json')
        } catch (error) {
            message = (error as Error).message
        }
        expect(message).toContain('replaces[0]')
        expect(message).toContain('unknown key "size"')
        expect(message).toContain('items[0].figure')
        expect(message).toContain('items[1].kind')
        expect(message).toContain('items[2].line')
        expect(message).toContain('items[2].colour')
        expect(message).toContain('exactly one of')
    })
})

describe('fountainShapes', () => {
    const shapes = fountainShapes(0, 0, 100, {
        basins: [
            { diameter: 12, height: 0.6 },
            { diameter: 5, height: 2.5 },
            { diameter: 2, height: 4 },
        ],
        jet: 1.5,
        falls: true,
        finial: 1,
    })

    test('a solid stone pool holding water, then bowls on stems, falls and a jet', () => {
        const pool = shapes[0]!
        expect(pool).toMatchObject({ shape: 'cylinder', width: 12, solid: true })
        expect(shapes.filter(s => s.solid)).toHaveLength(1)
        // Three water discs, one per basin, just under each rim.
        const discs = shapes.filter(s => s.height === 0.1)
        expect(discs).toHaveLength(3)
        expect(discs[0]!.y).toBeCloseTo(100.52)
        // Two falls and the jet are see-through.
        expect(shapes.filter(s => s.water)).toHaveLength(3)
        const top = Math.max(...shapes.map(s => s.y + s.height))
        expect(top).toBeCloseTo(106.5)
    })
})

describe('statueShapes', () => {
    test('stands on a solid plinth, turned to face its bearing', () => {
        const shapes = statueShapes(0, 0, 100, {
            facing: 90,
            figure: 'standing',
            height: 2.5,
            plinth: { width: 2, depth: 2, height: 3 },
        })
        const [plinth, ...figure] = shapes
        expect(plinth).toMatchObject({ shape: 'box', y: 100, height: 3, solid: true })
        // Facing east, the turn is a quarter turn clockwise.
        expect(plinth!.turn).toBeCloseTo(-Math.PI / 2)
        expect(figure.every(s => s.y >= 103 && !s.solid)).toBe(true)
        expect(Math.max(...figure.map(s => s.y + s.height))).toBeCloseTo(105.45, 1)
    })

    test('a rider sits on a horse that leans ahead of the plinth’s middle', () => {
        const shapes = statueShapes(0, 0, 0, {
            facing: 0,
            figure: 'equestrian',
            height: 4,
            plinth: { width: 2, depth: 5, height: 2 },
        })
        // Facing north, the horse's head is towards −z.
        const head = shapes.reduce((a, b) => (b.z < a.z ? b : a))
        expect(head.z).toBeLessThan(-1)
        expect(shapes.length).toBeGreaterThan(8)
    })
})

describe('pointsAlong', () => {
    test('a point every `spacing` metres from the start, across corners, the end kept when it is far enough', () => {
        expect(
            pointsAlong(
                [
                    [0, 0],
                    [10, 0],
                    [10, 8],
                ],
                5
            )
        ).toEqual([
            [0, 0],
            [5, 0],
            [10, 0],
            [10, 5],
            [10, 8],
        ])
        // An end a metre past the last point would crowd it: left out.
        expect(
            pointsAlong(
                [
                    [0, 0],
                    [11, 0],
                ],
                5
            )
        ).toEqual([
            [0, 0],
            [5, 0],
            [10, 0],
        ])
    })
})

describe('expandDecor', () => {
    test('a hedge is boxes along its line, turned with it', () => {
        const items: DecorItem[] = [{ kind: 'hedge', line: [at(0, 0), at(0, 20)], width: 1, height: 1.5 }]
        const { shapes } = expandDecor(items, project, flat)
        expect(shapes).toHaveLength(1)
        expect(shapes[0]).toMatchObject({ shape: 'box', height: 1.5, depth: 1 })
        expect(shapes[0]!.width).toBeCloseTo(21, 0)
        expect(Math.abs(shapes[0]!.turn)).toBeCloseTo(Math.PI / 2, 2)
    })

    test('a flowerbed paints its soil and raises its flowers', () => {
        const items: DecorItem[] = [{ kind: 'flowerbed', area: [at(0, 0), at(4, 0), at(4, 2)], colour: '#ff0000' }]
        const { shapes, paint } = expandDecor(items, project, flat)
        expect(paint).toHaveLength(1)
        expect(shapes[0]).toMatchObject({ shape: 'prism', colour: '#ff0000', y: 100 })
    })

    test('trees along a line, in an area, or at points, each a little different', () => {
        const line = expandDecor(
            [{ kind: 'trees', tree: 'broadleaf', height: 15, crown: 10, line: [at(0, 0), at(40, 0)], spacing: 10 }],
            project,
            flat
        )
        expect(line.trees).toHaveLength(5)
        expect(new Set(line.trees.map(t => t.height)).size).toBeGreaterThan(1)
        const grove = expandDecor(
            [
                {
                    kind: 'trees',
                    tree: 'conifer',
                    height: 15,
                    crown: 6,
                    area: [at(0, 0), at(40, 0), at(40, 40), at(0, 40)],
                    spacing: 10,
                },
            ],
            project,
            flat
        )
        expect(grove.trees.length).toBeGreaterThan(9)
        expect(grove.trees.every(t => t.kind === 'conifer')).toBe(true)
    })

    test('lamps, benches and umbrellas go where they are listed', () => {
        const out = expandDecor(
            [
                { kind: 'lamps', style: 'heritage', line: [at(0, 0), at(30, 0)], spacing: 15 },
                { kind: 'benches', points: [at(5, 5)] },
                { kind: 'umbrellas', points: [at(1, 1), at(4, 1)], colour: '#aa0000' },
            ],
            project,
            flat
        )
        // Three heritage lamps of four pieces, two umbrellas of two.
        expect(out.shapes).toHaveLength(3 * 4 + 2 * 2)
        expect(out.benches).toHaveLength(1)
    })
})

describe('OSM decor', () => {
    test('knows a statue from a plaque, a mural or a house', () => {
        expect(isStatue({ historic: 'memorial', memorial: 'statue' })).toBe(true)
        expect(isStatue({ tourism: 'artwork', artwork_type: 'sculpture' })).toBe(true)
        expect(isStatue({ historic: 'monument', name: 'Monument Wolfe' })).toBe(true)
        expect(isStatue({ historic: 'memorial', memorial: 'plaque' })).toBe(false)
        expect(isStatue({ tourism: 'artwork', artwork_type: 'mural' })).toBe(false)
        expect(isStatue({ historic: 'monument', name: 'Maison Krieghoff' })).toBe(false)
    })

    test('turns a statue to the nearest road, puts a fountain on its node, follows hedges', () => {
        const out = osmDecor(
            [
                { key: 'node/1', tags: { historic: 'memorial', memorial: 'statue' }, at: [0, 0] },
                { key: 'node/2', tags: { amenity: 'fountain' }, at: [50, 0] },
            ],
            [
                {
                    key: 'way/3',
                    tags: { barrier: 'hedge' },
                    points: [
                        [0, 10],
                        [10, 10],
                    ],
                },
            ],
            flat,
            () => 90
        )
        const plinth = out.shapes[0]!
        expect(plinth.solid).toBe(true)
        expect(plinth.turn).toBeCloseTo(-Math.PI / 2)
        expect(out.shapes.some(s => s.x === 50 && s.solid && s.shape === 'cylinder')).toBe(true)
        expect(out.shapes.some(s => s.colour === '#3f6e35')).toBe(true)
    })

    test('lines trees along a tree row', () => {
        const out = osmDecor(
            [],
            [
                {
                    key: 'way/4',
                    tags: { natural: 'tree_row' },
                    points: [
                        [0, 0],
                        [27, 0],
                    ],
                },
            ],
            flat,
            () => null
        )
        expect(out.trees).toHaveLength(4)
        expect(out.trees[0]!.height).toBeGreaterThan(13)
    })
})
