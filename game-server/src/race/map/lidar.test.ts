import { describe, expect, test } from 'bun:test'
import { projectionAt } from './convert.ts'
import {
    buildingMask,
    decodeHeight,
    encodeHeight,
    LIDAR_CELL,
    type LidarGrid,
    lidarAt,
    NO_DATA,
    resampleSurvey,
    surveyedHeight,
    surveyedShape,
    surveyedTrees,
    toMtm7,
} from './lidar.ts'
import { orientedBox } from './structures.ts'

/** A 100 m square map: 50 × 50 cells, x and z from −50 to 50. */
const SIZE = 100

function grid(height: (x: number, z: number) => number | null): LidarGrid {
    const cols = SIZE / LIDAR_CELL
    const heights = new Uint8Array(cols * cols)
    for (let row = 0; row < cols; row++) {
        for (let col = 0; col < cols; col++) {
            const h = height(-SIZE / 2 + (col + 0.5) * LIDAR_CELL, -SIZE / 2 + (row + 0.5) * LIDAR_CELL)
            heights[row * cols + col] = h === null ? NO_DATA : encodeHeight(h)
        }
    }
    return { cols, rows: cols, cell: LIDAR_CELL, heights }
}

const square = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1]

describe('toMtm7', () => {
    test('on the central meridian: the false easting, and the meridian arc scaled by 0.9999', () => {
        const [easting, northing] = toMtm7({ lat: 45, lon: -70.5 })
        expect(easting).toBeCloseTo(304800, 3)
        expect(northing).toBeCloseTo(4984944.378 * 0.9999, 0)
    })

    test('east of it is further east, and a degree north is about 111 km', () => {
        const [west] = toMtm7({ lat: 46.8, lon: -71.2 })
        const [east] = toMtm7({ lat: 46.8, lon: -71.1 })
        // The parallel's radius on the ellipsoid, not a sphere's: 0.1° of longitude is 7.63 km here.
        expect(east - west).toBeCloseTo(7633, -1)
        const [, south] = toMtm7({ lat: 46.8, lon: -71.2 })
        const [, north] = toMtm7({ lat: 46.9, lon: -71.2 })
        expect(north - south).toBeCloseTo(11120, -1)
    })
})

describe('encodeHeight', () => {
    test('half metres up to 100 m, metres up to 154 m, then it tops out', () => {
        expect(decodeHeight(encodeHeight(12.3))).toBe(12.5)
        expect(decodeHeight(encodeHeight(131.6))).toBe(132)
        expect(decodeHeight(encodeHeight(500))).toBe(154)
        expect(encodeHeight(-3)).toBe(0)
    })
})

describe('resampleSurvey', () => {
    test('puts the survey on the map grid, in half-metre steps, and marks what it misses', () => {
        const origin = { lat: 46.8, lon: -71.2 }
        const { unproject } = projectionAt(origin)
        const [e, n] = toMtm7(origin)
        // A survey patch round the west half of the map only, 12.3 m everywhere.
        const patch = {
            x0: Math.floor(e - 60),
            y0: Math.ceil(n + 60),
            cols: 61,
            rows: 121,
            values: new Float32Array(61 * 121).fill(12.3),
        }
        const resampled = resampleSurvey([patch], SIZE, SIZE, unproject)
        expect(resampled.cols).toBe(50)
        expect(lidarAt(resampled, SIZE, SIZE, -30, 0)).toBe(12.5)
        expect(lidarAt(resampled, SIZE, SIZE, 30, 0)).toBeNull()
    })
})

describe('surveyedHeight', () => {
    const block = square(-10, -10, 10, 10)

    test('the median over the footprint, away from the walls', () => {
        // A 15 m roof with a plant room in one corner; the ground round it at 0.
        const survey = grid((x, z) => (Math.abs(x) < 10 && Math.abs(z) < 10 ? (x > 5 && z > 5 ? 19 : 15) : 0))
        expect(surveyedHeight(survey, SIZE, SIZE, block)).toBe(15)
    })

    test('nothing when the survey misses most of it, or nothing stands there', () => {
        expect(
            surveyedHeight(
                grid(() => null),
                SIZE,
                SIZE,
                block
            )
        ).toBeNull()
        expect(
            surveyedHeight(
                grid(() => 0.5),
                SIZE,
                SIZE,
                block
            )
        ).toBeNull()
    })

    test('a courtyard’s ground doesn’t count', () => {
        const survey = grid((x, z) => (Math.abs(x) < 4 && Math.abs(z) < 4 ? 0 : 12))
        expect(surveyedHeight(survey, SIZE, SIZE, block, [square(-4, -4, 4, 4)])).toBe(12)
    })
})

describe('surveyedShape', () => {
    const house = square(-8, -5, 8, 5)

    test('a gable roof: eaves at 6 m, a ridge 4 m higher along the house’s length', () => {
        const survey = grid((x, z) => (Math.abs(x) < 8 && Math.abs(z) < 5 ? 6 + 4 * (1 - Math.abs(z) / 5) : 0))
        const shape = surveyedShape(survey, SIZE, SIZE, house, [], orientedBox(house))!
        expect(shape.roof?.shape).toBe('gable')
        expect(shape.walls).toBeCloseTo(6, 0)
        expect(shape.roof!.height).toBeCloseTo(4, 0)
    })

    test('a flat roof stays flat', () => {
        const survey = grid((x, z) => (Math.abs(x) < 8 && Math.abs(z) < 5 ? 9 : 0))
        expect(surveyedShape(survey, SIZE, SIZE, house, [], orientedBox(house))).toEqual({ walls: 9 })
    })
})

describe('surveyedTrees', () => {
    /** Two round crowns, 18 m and 10 m tall, and a 12 m building. */
    const crown = (x: number, z: number, cx: number, cz: number, h: number, r: number) =>
        Math.hypot(x - cx, z - cz) < r ? h * (1 - (Math.hypot(x - cx, z - cz) / r) ** 2 * 0.5) : 0
    const survey = grid((x, z) =>
        Math.abs(x - 30) < 8 && Math.abs(z) < 8
            ? 12
            : Math.max(crown(x, z, -20, -20, 18, 7), crown(x, z, 10, 25, 10, 4))
    )
    const mask = buildingMask(survey, SIZE, SIZE, [square(22, -8, 38, 8)])

    test('a tree at each crown’s top, with its height and spread; roofs aren’t crowns', () => {
        const trees = surveyedTrees(survey, SIZE, SIZE, mask, [])
        expect(trees).toHaveLength(2)
        const tall = trees.find(tree => tree.height > 15)!
        expect(Math.hypot(tall.x + 20, tall.z + 20)).toBeLessThan(2)
        expect(tall.crown).toBeGreaterThan(8)
        expect(tall.crown).toBeLessThan(16)
        expect(trees.every(tree => tree.x < 20)).toBe(true)
    })

    test('a pole (one cell standing up) isn’t a tree', () => {
        const pole = grid((x, z) => (Math.abs(x - 1) < 1 && Math.abs(z - 1) < 1 ? 8 : 0))
        expect(surveyedTrees(pole, SIZE, SIZE, new Uint8Array(50 * 50), [])).toEqual([])
    })

    test('a city tree under a crown keeps its species and place and takes the measured size', () => {
        const listed = { x: -19, z: -21, height: 9, crown: 6, kind: 'purple' as const }
        const trees = surveyedTrees(survey, SIZE, SIZE, mask, [listed])
        expect(trees).toHaveLength(2)
        expect(trees[0]).toMatchObject({ x: -19, z: -21, kind: 'purple' })
        expect(trees[0]!.height).toBeGreaterThan(15)
    })
})
