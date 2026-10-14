import { describe, expect, test } from 'bun:test'
import type { Building } from './format.ts'
import {
    applyLandmark,
    ellipse,
    facadeFrame,
    facingEdges,
    fingerprintOf,
    type Landmark,
    landmarkKey,
    parseLandmark,
    rectangle,
    reviewLandmarks,
    terraces,
} from './landmarks.ts'

/** A 100 × 100 m square building east and south of the origin; its north side runs along z = 0. */
const SQUARE: Building = { id: 1, base: 9, top: 20, outline: [0, 0, 100, 0, 100, 100, 0, 100] }

/** Map metres straight from "latitude/longitude", so tests can place a façade exactly. */
const identity = ({ lat, lon }: { lat: number; lon: number }): [number, number] => [lon, lat]

describe('facadeFrame', () => {
    test('runs along the façade and points out of the building', () => {
        const frame = facadeFrame([0, 0], [100, 0], SQUARE.outline)
        expect([frame.cx, frame.cz]).toEqual([50, 0])
        expect([frame.ux, frame.uz]).toEqual([1, 0])
        // The building lies to the south (+z), so out is north.
        expect(frame.nx).toBeCloseTo(0)
        expect(frame.nz).toBe(-1)
    })

    test('is the same whichever way round the façade is given, apart from its direction', () => {
        const frame = facadeFrame([100, 0], [0, 0], SQUARE.outline)
        expect(frame.nz).toBe(-1)
        expect(frame.ux).toBe(-1)
    })
})

describe('rectangle', () => {
    const frame = facadeFrame([0, 0], [100, 0], SQUARE.outline)

    test('places a part by its centre, along and out from the façade', () => {
        const ring = rectangle(frame, { along: 0, out: -10, width: 20, depth: 10 })
        const xs = ring.filter((_, i) => i % 2 === 0)
        const zs = ring.filter((_, i) => i % 2 === 1)
        expect([Math.min(...xs), Math.max(...xs)]).toEqual([40, 60])
        // 10 m into the building is +z here; 10 deep is 5 either side.
        expect([Math.min(...zs), Math.max(...zs)]).toEqual([5, 15])
    })

    test('a positive out stands in front of the building', () => {
        const zs = rectangle(frame, { along: 30, out: 4, width: 2, depth: 2 }).filter((_, i) => i % 2 === 1)
        expect(Math.max(...zs)).toBeLessThan(0)
    })
})

describe('applyLandmark', () => {
    const landmark: Landmark = {
        id: 1,
        osm: 'way',
        name: 'Test hall',
        wall: '#cccccc',
        windows: { floor: 4, spacing: 3 },
        height: 15,
        roof: { shape: 'mansard', height: 5, inset: 2, colour: '#888888' },
        facade: { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 100 } },
        parts: [
            { along: 0, out: -6, width: 12, depth: 12, height: 40 },
            { along: 0, out: -6, width: 4, depth: 4, from: 40, height: 44 },
        ],
    }

    test('a building without a landmark is left alone', () => {
        expect(applyLandmark(SQUARE, undefined, identity, 10)).toBe(SQUARE)
    })

    test('sets the walls and roof from the ground level, and the building’s top to the roof’s', () => {
        const building = applyLandmark(SQUARE, landmark, identity, 10)
        expect(building.detail?.wallTop).toBe(25)
        expect(building.top).toBe(30)
        expect(building.detail?.wall).toBe('#cccccc')
        expect(building.detail?.roof?.shape).toBe('mansard')
        expect(building.outline).toEqual(SQUARE.outline)
        expect(building.landmark).toBe(true)
    })

    test('parts stand on the building’s base, or start where they are raised to', () => {
        const [tower, lantern] = applyLandmark(SQUARE, landmark, identity, 10).detail!.parts
        expect(tower!.base).toBe(SQUARE.base)
        expect(tower!.wallTop).toBe(50)
        expect(lantern!.base).toBe(50)
        expect(lantern!.wallTop).toBe(54)
        expect(tower!.outline).toHaveLength(8)
    })

    test('no façade, no parts', () => {
        const { facade: _, ...withoutFacade } = landmark
        expect(applyLandmark(SQUARE, withoutFacade, identity, 10).detail?.parts).toEqual([])
    })
})

describe('looks', () => {
    const concrete: Landmark = {
        id: 1,
        osm: 'way',
        name: 'Concrete block',
        wall: '#cccccc',
        fins: { spacing: 1.5, width: 0.9, depth: 0.7 },
        arcade: { height: 5, depth: 2, spacing: 6 },
        height: 15,
        facade: { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 100 } },
        parts: [
            { along: 0, out: -10, width: 100, depth: 20, height: 20 },
            { along: 0, out: -50, width: 20, depth: 20, from: 20, height: 24 },
            { along: 30, out: -50, width: 20, depth: 20, height: 18, wall: '#aaaaaa', fins: false, arcade: false },
        ],
    }
    const built = applyLandmark(SQUARE, concrete, identity, 10)

    test('the building gets fins with a dark recess, and an arcade on the walls facing the street', () => {
        expect(built.detail?.fins).toEqual({ spacing: 1.5, width: 0.9, depth: 0.7, recess: '#3b4248' })
        // SQUARE's north wall (edge 0) is the façade; its arcade ends 5 m above the ground, not the base.
        expect(built.detail?.arcade).toEqual({ height: 5, top: 15, depth: 2, spacing: 6, edges: [0] })
    })

    test('a part takes the building’s look, with an arcade on its own street-facing edge', () => {
        const look = built.detail!.parts[0]!.look!
        expect(look.wall).toBe('#cccccc')
        expect(look.fins?.spacing).toBe(1.5)
        expect(look.arcade?.edges).toHaveLength(1)
    })

    test('a raised part never has an arcade', () => {
        expect(built.detail!.parts[1]!.look!.arcade).toBeUndefined()
        expect(built.detail!.parts[1]!.look!.fins).toBeDefined()
    })

    test('a part can change its colour and take fins or the arcade away', () => {
        const look = built.detail!.parts[2]!.look!
        expect(look).toEqual({ wall: '#aaaaaa' })
    })
})

describe('terraces', () => {
    test('a part without steps is itself', () => {
        const part = { along: 0, out: 0, width: 10, depth: 10, height: 30 }
        expect(terraces(part)).toEqual([part])
    })

    test('cuts a part into slices whose heights fall evenly toward the side it steps to', () => {
        const slices = terraces({
            along: 0,
            out: -10,
            width: 30,
            depth: 20,
            height: 70,
            steps: { count: 3, to: 10, toward: '-along' },
        })
        expect(slices.map(slice => [slice.along, slice.width, slice.height])).toEqual([
            [10, 10, 70],
            [0, 10, 40],
            [-10, 10, 10],
        ])
        expect(slices.every(slice => slice.depth === 20 && slice.out === -10 && !slice.steps)).toBe(true)
    })

    test('can step across the façade too', () => {
        const slices = terraces({
            along: 0,
            out: -10,
            width: 30,
            depth: 20,
            height: 30,
            steps: { count: 2, to: 20, toward: '+out' },
        })
        expect(slices.map(slice => [slice.out, slice.depth, slice.height])).toEqual([
            [-15, 10, 30],
            [-5, 10, 20],
        ])
    })
})

describe('ellipse', () => {
    test('a round part is a ring of points its width and depth across', () => {
        const frame = facadeFrame([0, 0], [100, 0], SQUARE.outline)
        const ring = ellipse(frame, { along: 0, out: -20, width: 20, depth: 10 })
        const xs = ring.filter((_, i) => i % 2 === 0)
        const zs = ring.filter((_, i) => i % 2 === 1)
        expect(ring).toHaveLength(48)
        expect([Math.min(...xs), Math.max(...xs)]).toEqual([40, 60])
        expect([Math.min(...zs), Math.max(...zs)]).toEqual([15, 25])
    })
})

describe('facingEdges', () => {
    test('picks the edges facing the façade’s way, within 45°', () => {
        // Out of SQUARE's north façade is -z: only edge 0 (along z = 0) faces it.
        expect(facingEdges(SQUARE.outline, { nx: 0, nz: -1 })).toEqual([0])
        // A diagonal 30° off still counts; one 60° off doesn't.
        expect(facingEdges(SQUARE.outline, { nx: Math.sin(Math.PI / 6), nz: -Math.cos(Math.PI / 6) })).toEqual([0])
        expect(facingEdges(SQUARE.outline, { nx: Math.sin(Math.PI / 3), nz: -Math.cos(Math.PI / 3) })).toEqual([1])
    })

    test('every edge without a frame', () => {
        expect(facingEdges(SQUARE.outline, null)).toEqual([0, 1, 2, 3])
    })
})

/** A valid landmark file's contents, to break one thing at a time. */
const VALID = {
    $schema: '../../landmark.schema.json',
    id: 42,
    osm: 'way',
    name: 'Hall',
    wall: '#aabbcc',
    height: 12,
    roof: { shape: 'mansard', height: 4, inset: 2, colour: '#112233' },
    facade: { from: { lat: 46.8, lon: -71.2 }, to: { lat: 46.8, lon: -71.199 } },
    parts: [{ along: 0, out: -5, width: 10, depth: 10, height: 30 }],
}

describe('parseLandmark', () => {
    test('accepts a valid file and drops its $schema', () => {
        const landmark = parseLandmark(VALID, 'hall.json')
        expect(landmark.id).toBe(42)
        expect('$schema' in landmark).toBe(false)
    })

    test('names every problem, so a typo is caught rather than silently ignored', () => {
        const broken = { ...VALID, wall: 'grey', hieght: 12, parts: [{ along: 0, out: 0, width: 10, depth: 10 }] }
        expect(() => parseLandmark(broken, 'hall.json')).toThrow(
            /hall\.json is not a valid landmark:[\s\S]*unknown key "hieght"[\s\S]*wall: must be a colour[\s\S]*parts\[0\]\.height: must be a number/
        )
    })

    test('parts need a façade to be placed against', () => {
        const { facade: _, ...withoutFacade } = VALID
        expect(() => parseLandmark(withoutFacade, 'hall.json')).toThrow(/parts: need a facade/)
    })

    test('a raised part must end above where it starts', () => {
        const parts = [{ along: 0, out: 0, width: 4, depth: 4, from: 40, height: 30 }]
        expect(() => parseLandmark({ ...VALID, parts }, 'hall.json')).toThrow(/must be above `from`/)
    })

    test('takes fins, an arcade and parapets, and parts can override or drop them', () => {
        const landmark = parseLandmark(
            {
                ...VALID,
                fins: { spacing: 1.5, width: 0.9, depth: 0.7, recess: '#454b50' },
                arcade: { height: 5, depth: 2.5, spacing: 6 },
                roof: { shape: 'flat', height: 0, colour: '#888888', parapet: 1 },
                parts: [
                    {
                        along: 0,
                        out: -5,
                        width: 10,
                        depth: 10,
                        height: 30,
                        wall: '#ffffff',
                        fins: false,
                        windows: false,
                    },
                ],
            },
            'hall.json'
        )
        expect(landmark.fins?.recess).toBe('#454b50')
        expect(landmark.parts?.[0]?.fins).toBe(false)
    })

    test('fins as wide as their spacing would be a solid wall', () => {
        expect(() => parseLandmark({ ...VALID, fins: { spacing: 1, width: 1, depth: 0.5 } }, 'hall.json')).toThrow(
            /fins\.width: must be less than `spacing`/
        )
    })

    test('an arcade facing the front needs a façade to know where the front is', () => {
        const { facade: _, parts: __, ...bare } = VALID
        expect(() => parseLandmark({ ...bare, arcade: { height: 5, depth: 2, spacing: 6 } }, 'hall.json')).toThrow(
            /arcade\.faces: facing the front needs a facade/
        )
        expect(
            parseLandmark({ ...bare, arcade: { height: 5, depth: 2, spacing: 6, faces: 'all' } }, 'hall.json')
        ).toBeDefined()
    })

    test('takes round and terraced parts, but not a round one that steps', () => {
        const round = { along: 0, out: -5, width: 10, depth: 10, height: 30, shape: 'round' }
        const terraced = { ...round, shape: 'box', steps: { count: 4, to: 10, toward: '-along' } }
        expect(parseLandmark({ ...VALID, parts: [round, terraced] }, 'hall.json').parts).toHaveLength(2)
        expect(() => parseLandmark({ ...VALID, parts: [{ ...terraced, shape: 'round' }] }, 'hall.json')).toThrow(
            /a round part can’t step/
        )
        expect(() =>
            parseLandmark(
                { ...VALID, parts: [{ ...terraced, steps: { count: 4, to: 40, toward: 'up' } }] },
                'hall.json'
            )
        ).toThrow(/steps\.to: must be below `height`[\s\S]*steps\.toward: must be/)
    })

    test('`false` only makes sense on a part', () => {
        expect(() => parseLandmark({ ...VALID, fins: false }, 'hall.json')).toThrow(/fins: leave it out instead/)
    })

    test('takes materials, glass, balconies, window styles and pitched roofs, and names what it doesn’t know', () => {
        const landmark = parseLandmark(
            {
                ...VALID,
                material: 'brick',
                glass: '#4a6c8c',
                windows: { floor: 3.2, spacing: 2.5, style: 'curtain' },
                bands: { floor: 3, depth: 1.4, colour: '#eeeeee' },
                roof: { shape: 'gable', height: 6, colour: '#555555' },
                parts: [
                    { along: 0, out: -5, width: 10, depth: 10, height: 30, bands: false, material: 'stone' },
                    {
                        along: 0,
                        out: -5,
                        width: 10,
                        depth: 10,
                        height: 30,
                        roof: { shape: 'hip', height: 4, colour: '#555555' },
                    },
                ],
            },
            'hall.json'
        )
        expect(landmark.material).toBe('brick')
        expect(landmark.parts?.[0]?.bands).toBe(false)
        expect(() =>
            parseLandmark(
                {
                    ...VALID,
                    material: 'marble',
                    windows: { floor: 3, spacing: 2, style: 'gothic' },
                    bands: { floor: 3, depth: 0, height: 0 },
                },
                'hall.json'
            )
        ).toThrow(/material: must be[\s\S]*bands\.depth: must be at least[\s\S]*windows\.style: must be/)
    })

    test('balconies start a floor up unless they say, and take the wall’s colour', () => {
        const built = applyLandmark(
            SQUARE,
            { ...VALID, bands: { floor: 3, depth: 1.2 }, parts: [] } as Landmark,
            identity,
            10
        )
        expect(built.detail?.bands).toEqual({ floor: 3, depth: 1.2, height: 0.25, first: 13 })
    })

    test('the OSM element type is required: ways and relations share numbers', () => {
        expect(() => parseLandmark({ ...VALID, osm: 'node' }, 'hall.json')).toThrow(/osm: must be "way" or "relation"/)
    })
})

describe('fingerprints and review', () => {
    // Metres are degrees here: east is longitude, south is minus latitude.
    const unproject = ([x, z]: [number, number]) => ({ lat: -z / 111_320, lon: x / 111_320 })
    const footprint = [0, 0, 20, 0, 20, 10, 0, 10]
    const stamped = (outline: number[]): Landmark => ({
        ...(parseLandmark(VALID, 'hall.json') as Landmark),
        fingerprint: fingerprintOf(outline, unproject),
    })
    const review = (landmark: Landmark, outline?: number[]) =>
        reviewLandmarks([landmark], new Map(outline ? [[landmarkKey('way', 42), outline]] : []), unproject)[0]!

    test('a fingerprint is the footprint’s middle, in latitude/longitude, and its area', () => {
        const print = fingerprintOf(footprint, unproject)
        expect(print.area).toBe(200)
        expect(print.lon).toBeCloseTo(10 / 111_320, 7)
    })

    test('an unchanged footprint is ok', () => {
        expect(review(stamped(footprint), footprint).status).toBe('ok')
    })

    test('a footprint gone from the data is orphaned', () => {
        expect(review(stamped(footprint)).status).toBe('orphaned')
    })

    test('a footprint that moved or changed size is stale, and says how', () => {
        const moved = footprint.map((v, i) => (i % 2 === 0 ? v + 8 : v))
        expect(review(stamped(footprint), moved)).toMatchObject({ status: 'stale', reason: 'footprint moved 8.0 m' })

        const bigger = [0, 0, 24, 0, 24, 10, 0, 10]
        expect(review(stamped(footprint), bigger)).toMatchObject({
            status: 'stale',
            reason: 'footprint area 200 → 240 m²',
        })
    })

    test('small redraws stay ok', () => {
        const nudged = footprint.map((v, i) => (i % 2 === 0 ? v + 1 : v))
        expect(review(stamped(footprint), nudged).status).toBe('ok')
    })

    test('a landmark never stamped says so, and offers the fingerprint to stamp', () => {
        const result = review(parseLandmark(VALID, 'hall.json'), footprint)
        expect(result.status).toBe('unstamped')
        expect(result.current?.area).toBe(200)
    })

    test('ways and relations with the same number are different buildings', () => {
        const asRelation = { ...stamped(footprint), osm: 'relation' as const }
        expect(review(asRelation, footprint).status).toBe('orphaned')
    })
})
