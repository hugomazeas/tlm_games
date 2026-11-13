import { CylinderGeometry, TorusGeometry, Vector3 } from 'three'
import type { Builder, ErablesMaterial } from '../kit.ts'
import { defineAsset } from '../types.ts'
import { BBQ } from './yard.ts'
import { place } from '../place.ts'
import { SHRUB } from './plants.ts'

/**
 * Houses and outbuildings. Version 1 of the two houses is Rue des Érables' own, still in that
 * map's coordinates and moved to the asset's origin (its front toward -z for the bungalow's +z
 * street side; see each one); they'll be redrawn around their own origin as they're reworked.
 */

/** Lawn over the street (the houses' version 1 stand on a lawn this high). */
const LAWN = 0.15
/** The bungalow's floor; the split-level's west wing, its den and its upstairs. */
export const FB = 0.6
export const S1F = 0.75
export const S2F0 = 0.2
export const S2F2 = 2.95

const BRICKS = ['brick', 'brickBuff'] as const
const SIDINGS = ['sidingCream', 'sidingSage', 'sidingGrey'] as const
const DOORS = ['doorRed', 'doorGreen', 'doorWood'] as const

/**
 * A 1960s brick bungalow, furnished: living room, bedroom, kitchen and dining, a front stoop, a
 * side door, a back deck with its table and barbecue. 14 × 9 m, its front (the stoop) toward +z.
 */
export const BUNGALOW = defineAsset({
    id: 'bungalow',
    name: 'Bungalow',
    category: 'buildings',
    defaults: { brick: 'brick', door: 'doorRed', gables: 'sidingCream' },
    params: {
        brick: { label: 'Brick', options: BRICKS },
        door: { label: 'Front door', options: DOORS },
        gables: { label: 'Gables', options: SIDINGS },
    },
    variants: [{}],
    size: [14, 6.5, 16],
    current: {
        version: 1,
        notes: "Rue des Érables' bungalow as first built.",
        build(b, p) {
            b.place({ x: 10, z: 15 }, () =>
                bungalowV1(b, p.brick as ErablesMaterial, p.door as ErablesMaterial, p.gables as ErablesMaterial)
            )
        },
    },
    draft: {
        version: 2,
        notes: 'Your note: walls clipping through the roof. The ceiling hung from the wall tops inside the walls (it stood 12 cm above them out to the outer faces: the band through the roof along the eaves); the gable ends’ siding stops under the roof slab (it reached the shingles’ surface, the two flickering through each other) and the rake boards sit just outside the roof’s ends, flush with its top (they stood 2 cm proud, the white bands across the roof).',
        build(b, p) {
            b.place({ x: 10, z: 15 }, () =>
                bungalowV1(b, p.brick as ErablesMaterial, p.door as ErablesMaterial, p.gables as ErablesMaterial, true)
            )
        },
    },
})

function bungalowV1(
    b: Builder,
    brick: ErablesMaterial,
    door: ErablesMaterial,
    gables: ErablesMaterial,
    fitted = false
): void {
    const top = FB + 2.5
    const t = 0.25
    b.box('foundation', -17, 0, -19.5, -3, FB - 0.03, -10.5)
    b.box('floorOak', -16.75, FB - 0.03, -14.94, -9.56, FB, -10.75, { cast: false })
    b.box('carpet', -16.75, FB - 0.03, -19.25, -9.56, FB, -15.06, { cast: false })
    b.box('floorTile', -9.44, FB - 0.03, -19.25, -3.25, FB, -15.0, { cast: false })
    b.box('floorOak', -9.44, FB - 0.03, -15.0, -3.25, FB, -10.75, { cast: false })
    // The ceiling: fitted, it hangs from the wall tops inside the walls (it used to stand 12 cm
    // above them to the outer faces, through the roof along the eaves).
    if (fitted) b.box('plaster', -16.75, top - 0.14, -19.25, -3.25, top - 0.005, -10.75)
    else b.box('plaster', -17, top - 0.02, -19.5, -3, top + 0.12, -10.5)
    b.wall('x', -10.5, -17, -3, 0.5, top, t, -1, brick, 'plaster', [
        { a0: -15.5, a1: -11.5, y0: FB + 0.75, y1: FB + 2.1, kind: 'window', cross: true },
        { a0: -8.7, a1: -7.2, y0: FB, y1: FB + 2.1, kind: 'door', leaf: door },
        { a0: -6.0, a1: -4.3, y0: FB + 0.9, y1: FB + 2.0, kind: 'window', shutters: 'metalDark' },
    ])
    b.wall('x', -19.5, -17, -3, 0.5, top, t, 1, brick, 'plaster', [
        { a0: -14.6, a1: -12.6, y0: FB + 0.9, y1: FB + 2.0, kind: 'window' },
        { a0: -7.4, a1: -5.4, y0: FB, y1: FB + 2.1, kind: 'door' },
        { a0: -4.7, a1: -3.6, y0: FB + 1.1, y1: FB + 2.0, kind: 'window' },
    ])
    b.wall('z', -17, -19.25, -10.75, 0.5, top, t, 1, brick, 'plaster', [
        { a0: -13.8, a1: -12.2, y0: FB + 0.8, y1: FB + 2.0, kind: 'window' },
        { a0: -18.2, a1: -16.8, y0: FB + 0.9, y1: FB + 2.0, kind: 'window' },
    ])
    b.wall('z', -3, -19.25, -10.75, 0.5, top, t, -1, brick, 'plaster', [
        { a0: -14.5, a1: -13.0, y0: FB, y1: FB + 2.1, kind: 'door', leaf: 'doorWood' },
        { a0: -18.0, a1: -16.6, y0: FB + 0.95, y1: FB + 2.0, kind: 'window' },
    ])
    b.wall('z', -9.44, -19.25, -10.75, FB, top, 0.12, -1, 'plasterSage', 'plaster', [
        { a0: -12.5, a1: -11.0, y0: FB, y1: FB + 2.1, kind: 'open' },
        { a0: -18.3, a1: -16.9, y0: FB, y1: FB + 2.1, kind: 'open' },
    ])
    b.wall('x', -14.94, -16.75, -9.56, FB, top, 0.12, -1, 'plaster', 'plasterBlue', [
        { a0: -13.4, a1: -12.0, y0: FB, y1: FB + 2.1, kind: 'open' },
    ])
    b.gableRoof(-17, -3, -19.5, -10.5, top, 2.0, 'x', 0.45, 'shingle', gables, undefined, undefined, { fitted })
    b.chimney(-15, -13, top, 5.9)
    b.box('trim', -7.4, FB, -19.4, -6.4, FB + 2.1, -19.36, { collide: false, cast: false })
    b.box('glass', -7.35, FB + 0.05, -19.385, -6.45, FB + 2.05, -19.375, { collide: false, cast: false })
    b.box('number1', -9.35, FB + 1.3, -10.5, -8.85, FB + 1.55, -10.47, { collide: false, cast: false })

    b.box('concrete', -9.4, 0, -10.5, -6.5, FB, -9.0)
    b.stairs('concrete', -7.95, -9.0, FB, -7.95, -7.8, LAWN, 1.6)
    for (const x of [-8.8, -7.1]) {
        b.rod('metalDark', new Vector3(x, FB, -9.05), new Vector3(x, FB + 0.9, -9.05), 0.02, { collide: false })
        b.rod('metalDark', new Vector3(x, FB + 0.9, -9.05), new Vector3(x, LAWN + 0.9, -7.85), 0.02, { collide: false })
        b.rod('metalDark', new Vector3(x, LAWN, -7.85), new Vector3(x, LAWN + 0.9, -7.85), 0.02, { collide: false })
    }
    b.box('lamp', -9.05, FB + 1.75, -10.47, -8.85, FB + 2.0, -10.38, { collide: false, cast: false })
    b.pumpkin(-9.1, -9.35, FB, 0.18)
    b.pumpkin(-6.85, -9.4, FB, 0.15)
    b.pumpkin(-6.9, -9.85, FB, 0.11)
    for (const x of [-9.2, -6.7]) b.cyl('hay', 0.12, 0.2, 1.4, x, FB, -10.25, 7, { collide: false })
    b.box('concrete', -3, 0, -14.6, -1.7, FB, -12.9)
    b.stairs('concrete', -2.35, -12.9, FB, -2.35, -11.7, LAWN, 1.3)

    b.box('deck', -9, FB - 0.08, -23, -2.4, FB, -19.5)
    b.box('wood', -9, LAWN, -23, -2.4, FB - 0.08, -19.5, { cast: false })
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
        b.box(
            'deck',
            Math.min(x0, x1) - 0.04,
            FB + 0.86,
            Math.min(z0, z1) - 0.04,
            Math.max(x0, x1) + 0.04,
            FB + 0.92,
            Math.max(z0, z1) + 0.04
        )
        b.box(
            'deck',
            Math.min(x0, x1) - 0.03,
            FB + 0.06,
            Math.min(z0, z1) - 0.03,
            Math.max(x0, x1) + 0.03,
            FB + 0.1,
            Math.max(z0, z1) + 0.03,
            {
                collide: false,
                cast: false,
            }
        )
        const length = Math.hypot(x1 - x0, z1 - z0)
        const count = Math.round(length / 0.14)
        for (let i = 0; i <= count; i++) {
            const k = i / count
            const x = x0 + (x1 - x0) * k
            const z = z0 + (z1 - z0) * k
            b.box('deck', x - 0.022, FB, z - 0.022, x + 0.022, FB + 0.88, z + 0.022, { collide: false })
        }
    }
    rail(-9, -19.5, -9, -23)
    rail(-9, -23, -2.4, -23)
    rail(-2.4, -23, -2.4, -22.55)
    rail(-2.4, -21.25, -2.4, -19.5)
    b.stairs('deck', -2.4, -21.9, FB, -1.2, -21.9, LAWN, 1.3)
    b.table(-7.6, FB, -21.8, 1.2, 1.2, 0.74, 'paintWhite')
    for (const [x, z, ry] of [
        [-8.4, -21.8, Math.PI / 2],
        [-6.8, -21.8, -Math.PI / 2],
        [-7.6, -22.6, 0],
    ] as const)
        b.chair(x, FB, z, ry, 'paintWhite')
    b.cyl('paintWhite', 0.025, 0.025, 2.2, -7.6, FB, -21.8, 6, { collide: false })
    b.cyl('canvas', 0.02, 0.14, 1.3, -7.6, FB + 0.95, -21.8, 8, { collide: false })
    place(b, BBQ, {}, { x: -3.2, y: FB, z: -20.2, ry: Math.PI })

    b.sofa(-16.2, FB, -13.4, -Math.PI / 2)
    b.armchair(-13.6, FB, -11.35, Math.PI * 0.8)
    b.tv(-9.85, FB, -13.9, Math.PI / 2)
    b.table(-14.7, FB, -13.2, 0.6, 1.1, 0.42, 'cabinetWood')
    b.box('carpet', -15.6, FB, -14.4, -12.0, FB + 0.01, -11.6, { collide: false, cast: false })
    b.bookshelf(-16.4, FB, -11.4, -Math.PI / 2)
    b.lamp(-15.3, FB, -14.65)
    b.picture('z', -16.75, -13.0, FB + 1.6, 1.0, 0.7, 1)
    b.picture('x', -14.94 + 0.12, -15.3, FB + 1.5, 0.6, 0.8, 1)
    b.bed(-15.65, FB, -17.2, -Math.PI / 2)
    b.dresser(-11.6, FB, -18.95, Math.PI)
    b.picture('z', -16.75, -17.2, FB + 1.7, 0.9, 0.5, 1)
    b.kitchenRun(-5.3, -3.25, -19.25, 1, FB, false)
    b.stove(-8.2, FB, -18.9, Math.PI)
    b.fridge(-8.95, FB, -16.0, -Math.PI / 2)
    b.box('cabinetWhite', -7.35, FB, -16.88, -5.45, FB + 0.9, -15.92)
    b.box('counter', -7.45, FB + 0.9, -16.98, -5.35, FB + 0.94, -15.82, { collide: false })
    b.table(-6.0, FB, -12.6, 1.6, 0.9, 0.76, 'cabinetWood')
    for (const [x, z, ry] of [
        [-6.4, -13.3, 0],
        [-5.6, -13.3, 0],
        [-6.4, -11.9, Math.PI],
        [-5.6, -11.9, Math.PI],
    ] as const)
        b.chair(x, FB, z, ry, 'cabinetWood')
    b.picture('x', -10.75, -5.1, FB + 1.6, 0.9, 0.6, -1)
    for (const [x, z] of [
        [-13, -12.8],
        [-13, -17.2],
        [-6.3, -17.2],
        [-6.3, -12.8],
    ] as const)
        b.ceilingLight(x, top - 0.02, z)
}

/** A detached single garage with a flat roof you can stand on, its door rolled up, toward +z. 6.5 × 7 m. */
export const GARAGE = defineAsset({
    id: 'garage',
    name: 'Detached garage',
    category: 'buildings',
    defaults: { siding: 'sidingGrey' },
    params: { siding: { label: 'Siding', options: SIDINGS } },
    variants: [{}, { siding: 'sidingCream' }],
    size: [7, 3.3, 7.5],
    current: {
        version: 1,
        notes: "Rue des Érables' garage as first built: a workbench, shelves, the mower, winter tires.",
        build(b, p) {
            b.place({ x: -3.25, z: 15.5 }, () => garageV1(b, p.siding as ErablesMaterial))
        },
    },
})

function garageV1(b: Builder, siding: ErablesMaterial): void {
    const top = 2.9
    b.box('concrete', 0, 0, -19, 6.5, S2F0, -12, { cast: false })
    b.wall('x', -12, 0, 6.5, LAWN, top, 0.2, -1, siding, 'wood', [
        { a0: 0.5, a1: 6.0, y0: S2F0, y1: 2.45, kind: 'open' },
    ])
    b.wall('x', -19, 0, 6.5, LAWN, top, 0.2, 1, siding, 'wood', [
        { a0: 4.3, a1: 5.8, y0: S2F0, y1: S2F0 + 2.05, kind: 'door', leaf: 'doorWood' },
    ])
    b.wall('z', 0, -18.8, -12.2, LAWN, top, 0.2, 1, siding, 'wood', [
        { a0: -16.4, a1: -15.0, y0: 1.2, y1: 2.0, kind: 'window' },
    ])
    b.wall('z', 6.5, -18.8, -12.2, LAWN, top, 0.2, -1, siding, 'wood')
    b.box('shingleGrey', -0.25, top, -19.25, 6.75, top + 0.2, -11.75)
    for (const [x0, z0, x1, z1] of [
        [-0.25, -19.25, 6.75, -19.1],
        [-0.25, -11.9, 6.75, -11.75],
        [-0.25, -19.25, -0.1, -11.75],
        [6.6, -19.25, 6.75, -11.75],
    ] as const) {
        b.box('trim', x0, top + 0.2, z0, x1, top + 0.32, z1)
    }
    b.box('garageDoor', 0.55, 2.4, -12.25, 5.95, 2.46, -14.7, { collide: false })
    for (let i = 0; i < 4; i++)
        b.put(new TorusGeometry(0.3, 0.11, 8, 18).rotateX(Math.PI / 2), 'rubber', {
            x: 0.75,
            y: S2F0 + 0.11 + i * 0.22,
            z: -13.0,
        })
    b.box('wood', 5.6, S2F0, -18.6, 6.3, S2F0 + 0.9, -14.6)
    b.box('wood', 5.55, S2F0 + 0.9, -18.65, 6.3, S2F0 + 0.95, -14.55, { collide: false })
    b.box('cedar', 6.27, S2F0 + 1.1, -18.4, 6.3, S2F0 + 2.0, -14.8, { collide: false, cast: false })
    b.box('metalDark', 0.2, S2F0, -18.8, 0.7, S2F0 + 2.0, -17.3)
    for (const y of [0.5, 1.0, 1.5]) {
        b.box('binBlue', 0.25, S2F0 + y, -18.6, 0.65, S2F0 + y + 0.3, -18.1, { collide: false, cast: false })
        b.box('leafBag', 0.25, S2F0 + y, -17.9, 0.65, S2F0 + y + 0.25, -17.45, { collide: false, cast: false })
    }
    b.box('paintRed', 4.5, S2F0, -18.6, 5.1, S2F0 + 0.4, -18.0, { collide: false })
    b.ceilingLight(3.25, top - 0.02, -15.5)
}

/** A Tempo shelter: a canvas arch on steel hoops, open at both ends (along z). */
export const TEMPO = defineAsset({
    id: 'tempo',
    name: 'Tempo shelter',
    category: 'buildings',
    defaults: { length: 5.4 },
    params: { length: { label: 'Length', min: 3, max: 9, step: 0.3 } },
    variants: [{}],
    size: [5.6, 2.8, 5.4],
    current: {
        version: 1,
        notes: 'A half cylinder of canvas over four steel hoops.',
        build(b, p) {
            const length = p.length as number
            const shell = new CylinderGeometry(2.8, 2.8, length, 28, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2)
            b.put(shell, 'canvas')
            for (let i = 0; i < 4; i++) {
                const z = -length / 2 + 0.05 + ((length - 0.1) * i) / 3
                b.put(new TorusGeometry(2.78, 0.025, 6, 28, Math.PI), 'paintSilver', { z, collide: false, cast: false })
            }
        },
    },
})

/**
 * A split-level, furnished: a one-storey west wing (living room, kitchen) and a two-storey east
 * wing (a den at grade with a ping-pong table, two bedrooms up; the front one's window has no
 * glass), the stairs between. Its front (the stoop) toward -z. 17 × 10 m.
 */
export const SPLIT_LEVEL = defineAsset({
    id: 'split-level',
    name: 'Split-level',
    category: 'buildings',
    defaults: {},
    params: {},
    variants: [{}],
    size: [17, 9.6, 15],
    current: {
        version: 1,
        notes: "Rue des Érables' split-level as first built.",
        build(b) {
            b.place({ x: 5.5, z: -14 }, () => splitLevelV1(b))
        },
    },
    draft: {
        version: 2,
        notes: 'Your note: roofs clipping against the walls. Both ceilings hung from the wall tops inside the walls (they stood 12 cm above them, through the roofs along the eaves); both roofs fitted (the gable siding stops under the slab, the rake boards flush outside its ends), and the low wing’s roof pitched a little lower (its ridge at 4.8 m) so the tall wing’s eave, gutter and fascia clear it instead of cutting through it.',
        build(b) {
            b.place({ x: 5.5, z: -14 }, () => splitLevelV1(b, true))
        },
    },
})

function splitLevelV1(b: Builder, fitted = false): void {
    const top1 = S1F + 2.5
    const t = 0.25
    b.box('foundation', -14, 0, 9, -4, S1F - 0.03, 19)
    b.box('floorOak', -13.75, S1F - 0.03, 9.25, -4, S1F, 14, { cast: false })
    b.box('floorTile', -13.75, S1F - 0.03, 14, -4, S1F, 18.75, { cast: false })
    if (fitted) b.box('plaster', -13.75, top1 - 0.14, 9.25, -4, top1 - 0.005, 18.75)
    else b.box('plaster', -14, top1 - 0.02, 9, -4, top1 + 0.12, 19)
    b.wall('x', 9, -14, -4, 0.55, top1, t, 1, 'brickBuff', 'plaster', [
        { a0: -13.0, a1: -9.6, y0: S1F + 0.75, y1: S1F + 2.1, kind: 'window', cross: true, shutters: 'doorGreen' },
        { a0: -7.7, a1: -6.2, y0: S1F, y1: S1F + 2.1, kind: 'door', leaf: 'doorGreen' },
        { a0: -5.6, a1: -4.7, y0: S1F + 0.9, y1: S1F + 2.0, kind: 'window' },
    ])
    b.wall('x', 19, -14, -4, 0.55, top1, t, -1, 'sidingCream', 'plaster', [
        { a0: -11.3, a1: -9.8, y0: S1F, y1: S1F + 2.1, kind: 'door', leaf: 'doorWood' },
        { a0: -8.0, a1: -6.0, y0: S1F + 1.0, y1: S1F + 2.0, kind: 'window' },
    ])
    b.wall('z', -14, 9.25, 18.75, 0.55, top1, t, 1, 'sidingCream', 'plaster', [
        { a0: 12.0, a1: 13.8, y0: S1F + 0.85, y1: S1F + 2.0, kind: 'window' },
        { a0: 15.5, a1: 16.8, y0: S1F + 1.0, y1: S1F + 2.0, kind: 'window' },
    ])
    b.wall('x', 14.0, -13.75, -4.25, S1F, top1, 0.12, 1, 'plaster', 'plasterSage', [
        { a0: -10.5, a1: -7.5, y0: S1F, y1: S1F + 2.1, kind: 'open' },
    ])
    b.gableRoof(
        -14,
        -4,
        9,
        19,
        top1,
        fitted ? 1.55 : 1.8,
        'x',
        0.4,
        'shingle',
        'sidingCream',
        [0.4, 0],
        [true, false],
        { fitted }
    )

    const top2 = S2F2 + 2.4
    b.box('concrete', -4, 0, 9, 3, S2F0 - 0.03, 19)
    b.box('carpet', -3.75, S2F0 - 0.03, 9.25, 2.75, S2F0, 18.75, { cast: false })
    for (const [x0, z0, x1, z1] of [
        [-2.25, 9.25, 2.75, 18.75],
        [-3.75, 9.25, -2.25, 13.5],
    ] as const) {
        b.box('plaster', x0, S2F2 - 0.28, z0, x1, S2F2 - 0.03, z1)
        b.box('floorOak', x0, S2F2 - 0.03, z0, x1, S2F2, z1, { cast: false })
    }
    if (fitted) b.box('plaster', -3.75, top2 - 0.14, 9.25, 2.75, top2 - 0.005, 18.75)
    else b.box('plaster', -4, top2 - 0.02, 9, 3, top2 + 0.12, 19)
    b.wall('x', 9, -4, 3, 0.1, S2F2, t, 1, 'brickBuff', 'plaster', [
        { a0: -2.6, a1: 1.4, y0: S2F0 + 0.9, y1: S2F0 + 2.1, kind: 'window', cross: true },
    ])
    b.wall('x', 9, -4, 3, S2F2, top2, t, 1, 'sidingSage', 'plaster', [
        { a0: -2.0, a1: 1.0, y0: S2F2 + 0.75, y1: S2F2 + 1.95, kind: 'window', noGlass: true },
    ])
    b.box('trim', -4.05, S2F2 - 0.1, 8.9, 3.05, S2F2 + 0.06, 9.0, { collide: false, cast: false })
    b.wall('x', 19, -4, 3, 0.1, S2F2, t, -1, 'sidingSage', 'plaster', [
        { a0: 0.1, a1: 1.6, y0: S2F0, y1: S2F0 + 2.1, kind: 'door', leaf: 'doorWood' },
    ])
    b.wall('x', 19, -4, 3, S2F2, top2, t, -1, 'sidingSage', 'plaster', [
        { a0: -1.4, a1: 0.4, y0: S2F2 + 0.9, y1: S2F2 + 2.0, kind: 'window' },
    ])
    b.wall('z', 3, 9.25, 18.75, 0.1, S2F2, t, -1, 'sidingSage', 'plaster', [
        { a0: 11.9, a1: 13.4, y0: S2F0, y1: S2F0 + 2.1, kind: 'door', leaf: 'doorWood' },
    ])
    b.wall('z', 3, 9.25, 18.75, S2F2, top2, t, -1, 'sidingSage', 'plaster', [
        { a0: 10.9, a1: 12.4, y0: S2F2, y1: S2F2 + 2.1, kind: 'door', leaf: 'doorWood' },
    ])
    b.wall('z', -4, 9.25, 18.75, 0.1, top1, t, 1, 'plaster', 'plaster', [
        { a0: 10.0, a1: 11.4, y0: S1F, y1: S1F + 2.1, kind: 'open' },
    ])
    b.wall('z', -4, 9.25, 18.75, top1, top2, t, 1, 'sidingSage', 'plaster')
    b.wall('x', 13.5, -2.25, 2.75, S2F2, top2, 0.12, 1, 'plaster', 'plaster', [
        { a0: 0.4, a1: 1.8, y0: S2F2, y1: S2F2 + 2.1, kind: 'open' },
    ])
    b.box('plaster', -2.3, S2F2 - 0.28, 13.62, -2.2, S2F2 + 0.95, 18.75)
    b.box('trim', -2.33, S2F2 + 0.95, 13.62, -2.17, S2F2 + 1.0, 18.75, { collide: false, cast: false })
    b.gableRoof(-4, 3, 9, 19, top2, 2.0, 'z', 0.4, 'shingle', 'sidingSage', undefined, undefined, { fitted })
    b.stairs('floorOak', -3.75, 10.7, S1F, -2.25, 10.7, S2F0, 1.4)
    b.stairs('floorOak', -3.0, 18.4, S2F0, -3.0, 13.6, S2F2, 1.5)
    b.box('concrete', -8.3, 0, 7.6, -5.6, S1F, 9)
    b.stairs('concrete', -6.95, 7.6, S1F, -6.95, 6.4, LAWN, 1.6)
    b.box('lamp', -8.05, S1F + 1.75, 9.0, -7.85, S1F + 2.0, 8.92, { collide: false, cast: false })
    b.box('number2', -8.35, S1F + 1.3, 8.97, -7.85, S1F + 1.55, 9.0, { collide: false, cast: false })
    b.pumpkin(-8.0, 7.9, S1F, 0.17)
    b.pumpkin(-5.85, 7.95, S1F, 0.14)
    b.box('concrete', -11.6, 0, 19, -9.5, S1F, 20.2)
    b.stairs('concrete', -10.55, 20.2, S1F, -10.55, 21.4, LAWN, 1.5)
    b.sofa(-10.5, S1F, 13.4, 0)
    b.armchair(-13.0, S1F, 11.0, Math.PI / 2 + 0.3)
    b.tv(-8.2, S1F, 9.55, 0)
    b.table(-10.6, S1F, 11.6, 1.1, 0.6, 0.42, 'cabinetWood')
    b.box('carpet', -12.4, S1F, 10.4, -8.6, S1F + 0.01, 12.8, { collide: false, cast: false })
    b.bookshelf(-13.45, S1F, 13.3, Math.PI / 2)
    b.picture('x', 13.94, -11.0, S1F + 1.6, 1.2, 0.7, -1)
    b.kitchenRun(-8.9, -4.25, 18.75, -1, S1F, false)
    b.fridge(-13.3, S1F, 17.9, Math.PI / 2)
    b.table(-11.5, S1F, 16.0, 1.2, 0.9, 0.76, 'wood')
    for (const [x, z, ry] of [
        [-11.9, 15.3, 0],
        [-11.1, 15.3, 0],
        [-11.9, 16.7, Math.PI],
        [-11.1, 16.7, Math.PI],
    ] as const)
        b.chair(x, S1F, z, ry)
    for (const [x, z] of [
        [-10.5, 11.5],
        [-9.0, 16.4],
    ] as const)
        b.ceilingLight(x, top1 - 0.02, z)
    pingPongV1(b, 0.3, S2F0, 12.0)
    b.sofa(2.3, S2F0, 16.0, Math.PI / 2, 'sofaGreen')
    b.block('steel', 0.6, 0.85, 0.6, 2.3, S2F0, 9.7)
    b.picture('z', 2.75, 15.5, S2F0 + 1.5, 0.6, 0.6, -1)
    b.ceilingLight(0.3, S2F2 - 0.28, 12.0)
    b.bed(-1.0, S2F2, 12.4, 0)
    b.dresser(-3.45, S2F2, 10.4, -Math.PI / 2)
    b.bed(1.4, S2F2, 17.6, 0, 1.2)
    b.table(-0.9, S2F2, 15.0, 1.1, 0.6, 0.74, 'cabinetWhite')
    b.chair(-0.9, S2F2, 15.6, Math.PI)
    for (const [x, z] of [
        [0.3, 11.4],
        [0.3, 16.2],
    ] as const)
        b.ceilingLight(x, top2 - 0.02, z)
}

export function pingPongV1(b: Builder, x: number, y: number, z: number): void {
    const g = b.group(x, y, z)
    b.box('paintBlue', -1.37, 0.72, -0.76, 1.37, 0.76, 0.76, { parent: g })
    b.box('paintWhite', -1.37, 0.761, -0.012, 1.37, 0.762, 0.012, { parent: g, collide: false, cast: false })
    b.box('net', -0.01, 0.76, -0.84, 0.01, 0.92, 0.84, { parent: g, collide: false, cast: false })
    for (const sx of [-1, 1])
        for (const sz of [-1, 1])
            b.box('metalDark', sx * 1.1 - 0.03, 0, sz * 0.6 - 0.03, sx * 1.1 + 0.03, 0.72, sz * 0.6 + 0.03, {
                parent: g,
                collide: false,
            })
}

/**
 * A carport against a house's side (its wall along x = -2.8 locally): posts, a flat roof that's a
 * terrace with a railing (the upstairs door opens onto it), a planter and a chair up there. 5.6 × 10 m.
 */
export const CARPORT = defineAsset({
    id: 'carport',
    name: 'Carport with a roof terrace',
    category: 'buildings',
    defaults: {},
    params: {},
    variants: [{}],
    size: [5.8, 3.9, 10.2],
    current: {
        version: 1,
        notes: "Rue des Érables' carport as first built.",
        build(b) {
            b.place({ x: -5.8, z: -13.6 }, () => carportV1(b))
        },
    },
})

function carportV1(b: Builder): void {
    const roof = S2F2
    for (const z of [8.8, 13.7, 18.4]) b.block('trim', 0.16, roof - 0.2 - LAWN, 0.16, 8.4, LAWN, z)
    b.box('plaster', 3.0, roof - 0.2, 8.6, 8.6, roof, 18.6)
    b.box('deck', 3.0, roof, 8.6, 8.6, roof + 0.02, 18.6, { cast: false })
    b.box('trim', 2.95, roof - 0.26, 8.55, 8.65, roof - 0.18, 18.65, { collide: false, cast: false })
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
        b.box(
            'metalDark',
            Math.min(x0, x1) - 0.03,
            roof + 0.9,
            Math.min(z0, z1) - 0.03,
            Math.max(x0, x1) + 0.03,
            roof + 0.95,
            Math.max(z0, z1) + 0.03
        )
        const length = Math.hypot(x1 - x0, z1 - z0)
        const count = Math.round(length / 0.13)
        for (let i = 0; i <= count; i++) {
            const k = i / count
            b.box(
                'metalDark',
                x0 + (x1 - x0) * k - 0.012,
                roof,
                z0 + (z1 - z0) * k - 0.012,
                x0 + (x1 - x0) * k + 0.012,
                roof + 0.9,
                z0 + (z1 - z0) * k + 0.012,
                {
                    collide: false,
                    cast: false,
                }
            )
        }
    }
    rail(3.0, 8.62, 8.58, 8.62)
    rail(8.58, 8.62, 8.58, 18.58)
    rail(3.0, 18.58, 8.58, 18.58)
    b.block('cedar', 0.5, 0.45, 0.5, 3.5, roof, 9.1)
    place(b, SHRUB, { radius: 0.25 }, { x: 3.5, y: roof + 0.45, z: 9.1 })
    b.chair(7.6, roof, 17.6, 0.5, 'paintWhite')
}

/** A garden shed (cabanon): siding, a gable roof, its door left open toward +z. */
export const SHED = defineAsset({
    id: 'shed',
    name: 'Garden shed',
    category: 'buildings',
    defaults: { siding: 'sidingSage', width: 3.4, depth: 3.2 },
    params: {
        siding: { label: 'Siding', options: SIDINGS },
        width: { label: 'Width', min: 2.4, max: 5, step: 0.2 },
        depth: { label: 'Depth', min: 2.4, max: 5, step: 0.2 },
    },
    variants: [{}, { siding: 'sidingGrey', width: 3.5, depth: 3.8 }, { siding: 'sidingCream', width: 3.2, depth: 3.4 }],
    size: [3.6, 3.3, 3.4],
    current: {
        version: 1,
        notes: 'Four sided walls, a door opening with its leaf open, a shingled gable roof.',
        build(b, p) {
            const w = p.width as number
            const d = p.depth as number
            b.shed(-w / 2, -d / 2, w / 2, d / 2, 0, p.siding as ErablesMaterial, 'z1')
        },
    },
    draft: {
        version: 2,
        notes: 'Your note: clipping against the roof and walls. The roof is fitted: the gable siding stops under the slab and the rake boards sit flush outside its ends.',
        build(b, p) {
            const w = p.width as number
            const d = p.depth as number
            b.shed(-w / 2, -d / 2, w / 2, d / 2, 0, p.siding as ErablesMaterial, 'z1', true)
        },
    },
})
