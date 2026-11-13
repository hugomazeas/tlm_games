import { TorusGeometry } from 'three'
import type { ErablesMaterial } from '../kit.ts'
import { defineAsset } from '../types.ts'

/**
 * Furniture and fittings, each facing +z (its front, its seat, its screen), its back toward -z,
 * standing on its floor at y = 0.
 */

const FABRICS = ['sofa', 'sofaGreen', 'bedding'] as const
const WOODS = ['wood', 'cabinetWood', 'cabinetWhite', 'paintWhite', 'metalDark'] as const

export const SOFA = defineAsset({
    id: 'sofa',
    name: 'Sofa',
    category: 'interior',
    defaults: { fabric: 'sofa', seats: 3 },
    params: { fabric: { label: 'Fabric', options: FABRICS }, seats: { label: 'Seats', min: 2, max: 4, step: 1 } },
    variants: [{}, { fabric: 'sofaGreen', seats: 2 }],
    size: [2.7, 1.0, 0.9],
    current: {
        version: 1,
        notes: 'A base, a back, arms, seat cushions, little legs.',
        build: (b, p) => b.sofa(0, 0, 0, Math.PI, p.fabric as ErablesMaterial, p.seats as number),
    },
})

export const ARMCHAIR = defineAsset({
    id: 'armchair',
    name: 'Armchair',
    category: 'interior',
    defaults: { fabric: 'sofaGreen' },
    params: { fabric: { label: 'Fabric', options: FABRICS } },
    variants: [{}, { fabric: 'sofa' }],
    size: [0.9, 1.0, 0.9],
    current: {
        version: 1,
        notes: 'A seat block, a back, two arms.',
        build: (b, p) => b.armchair(0, 0, 0, Math.PI, p.fabric as ErablesMaterial),
    },
})

/** A table: coffee table, dining table or desk, by its size. */
export const TABLE = defineAsset({
    id: 'table',
    name: 'Table',
    category: 'interior',
    defaults: { width: 1.6, depth: 0.9, height: 0.76, finish: 'cabinetWood' },
    params: {
        width: { label: 'Width', min: 0.5, max: 2.4, step: 0.05 },
        depth: { label: 'Depth', min: 0.4, max: 1.4, step: 0.05 },
        height: { label: 'Height', min: 0.35, max: 1.0, step: 0.01 },
        finish: { label: 'Finish', options: WOODS },
    },
    variants: [
        {},
        { width: 0.6, depth: 1.1, height: 0.42 },
        { width: 1.1, depth: 0.6, height: 0.74, finish: 'cabinetWhite' },
    ],
    size: [1.6, 0.8, 0.9],
    current: {
        version: 1,
        notes: 'A top on four square legs.',
        build: (b, p) =>
            void b.table(
                0,
                0,
                0,
                p.width as number,
                p.depth as number,
                p.height as number,
                p.finish as ErablesMaterial
            ),
    },
})

export const CHAIR = defineAsset({
    id: 'chair',
    name: 'Chair',
    category: 'interior',
    defaults: { finish: 'wood' },
    params: { finish: { label: 'Finish', options: WOODS } },
    variants: [{}, { finish: 'paintWhite' }, { finish: 'metalDark' }],
    size: [0.45, 0.95, 0.45],
    current: {
        version: 1,
        notes: 'A seat, a back, four legs.',
        build: (b, p) => b.chair(0, 0, 0, Math.PI, p.finish as ErablesMaterial),
    },
})

export const BED = defineAsset({
    id: 'bed',
    name: 'Bed',
    category: 'interior',
    defaults: { width: 1.5 },
    params: { width: { label: 'Width', min: 0.9, max: 2.0, step: 0.1 } },
    variants: [{}, { width: 1.2 }],
    size: [1.7, 1.1, 2.2],
    current: {
        version: 1,
        notes: 'A frame, a mattress, a headboard (toward -z), pillows, a folded blanket.',
        build: (b, p) => b.bed(0, 0, 0, Math.PI, p.width as number),
    },
})

export const DRESSER = defineAsset({
    id: 'dresser',
    name: 'Dresser',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.2, 0.85, 0.5],
    current: { version: 1, notes: 'A wooden box, three pulls.', build: b => b.dresser(0, 0, 0, Math.PI) },
})

export const BOOKSHELF = defineAsset({
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.9, 1.9, 0.35],
    current: {
        version: 1,
        notes: 'A white case, four shelves of coloured books.',
        build: b => b.bookshelf(0, 0, 0, Math.PI),
    },
})

export const TV_STAND = defineAsset({
    id: 'tv-stand',
    name: 'TV on its stand',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.6, 1.3, 0.45],
    current: {
        version: 1,
        notes: 'A low cabinet, a flat screen showing the hockey game.',
        build: b => b.tv(0, 0, 0, Math.PI),
    },
})

/** A run of base cabinets and its counter along x, against a wall at its back (z = 0, the counter toward +z). */
export const KITCHEN_CABINETS = defineAsset({
    id: 'kitchen-cabinets',
    name: 'Kitchen cabinets',
    category: 'interior',
    defaults: { length: 2.4, uppers: true },
    params: {
        length: { label: 'Length', min: 0.6, max: 6, step: 0.6 },
        uppers: { label: 'Upper cabinets', options: [true, false] },
    },
    variants: [{}, { length: 1.8, uppers: false }],
    size: [2.4, 2.2, 0.7],
    current: {
        version: 1,
        notes: 'Base cabinets with doors and pulls, a toe kick, the counter, uppers and a backsplash.',
        build(b, p) {
            const l = p.length as number
            b.kitchenRun(-l / 2, l / 2, 0, 1, 0, p.uppers as boolean)
        },
    },
})

export const FRIDGE = defineAsset({
    id: 'fridge',
    name: 'Fridge',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.85, 1.85, 0.8],
    current: { version: 1, notes: 'A steel box, a handle, the freezer line.', build: b => b.fridge(0, 0, 0, Math.PI) },
})

export const STOVE = defineAsset({
    id: 'stove',
    name: 'Stove',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.8, 1.15, 0.65],
    current: {
        version: 1,
        notes: 'A steel box, a dark top, the oven window, a back panel.',
        build: b => b.stove(0, 0, 0, Math.PI),
    },
})

export const KITCHEN_ISLAND = defineAsset({
    id: 'kitchen-island',
    name: 'Kitchen island',
    category: 'interior',
    defaults: { length: 1.9 },
    params: { length: { label: 'Length', min: 1, max: 3, step: 0.1 } },
    variants: [{}],
    size: [2.0, 0.95, 1.0],
    current: {
        version: 1,
        notes: 'A white box, a counter slab overhanging it.',
        build(b, p) {
            const l = (p.length as number) / 2
            b.box('cabinetWhite', -l, 0, -0.48, l, 0.9, 0.48)
            b.box('counter', -l - 0.1, 0.9, -0.58, l + 0.1, 0.94, 0.58, { collide: false })
        },
    },
})

export const FLOOR_LAMP = defineAsset({
    id: 'floor-lamp',
    name: 'Floor lamp',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.45, 1.6, 0.45],
    current: { version: 1, notes: 'A base, a stem, a shade.', build: b => b.lamp(0, 0, 0) },
})

/** A framed picture, on a wall at z = 0, its face toward +z, centred `height` up. */
export const PICTURE = defineAsset({
    id: 'picture',
    name: 'Framed picture',
    category: 'interior',
    defaults: { width: 0.9, height: 0.6, at: 1.6 },
    params: {
        width: { label: 'Width', min: 0.3, max: 1.6, step: 0.05 },
        height: { label: 'Height', min: 0.3, max: 1.2, step: 0.05 },
        at: { label: 'Centre height', min: 1, max: 2, step: 0.05 },
    },
    variants: [{}, { width: 0.6, height: 0.8 }],
    size: [0.9, 2, 0.1],
    current: {
        version: 1,
        notes: 'A wooden frame, a landscape in it.',
        build: (b, p) => b.picture('x', 0, 0, p.at as number, p.width as number, p.height as number, 1),
    },
})

/** A ceiling light (a glowing dome), hung from a ceiling at y = 0. */
export const CEILING_LIGHT = defineAsset({
    id: 'ceiling-light',
    name: 'Ceiling light',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.4, 0.2, 0.4],
    current: { version: 1, notes: 'A half sphere that glows.', build: b => b.ceilingLight(0, 0, 0) },
})

export const PING_PONG_TABLE = defineAsset({
    id: 'ping-pong-table',
    name: 'Ping-pong table',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [2.8, 0.95, 1.7],
    current: {
        version: 1,
        notes: 'A blue top with its centre line, a net, four legs.',
        build(b) {
            b.box('paintBlue', -1.37, 0.72, -0.76, 1.37, 0.76, 0.76)
            b.box('paintWhite', -1.37, 0.761, -0.012, 1.37, 0.762, 0.012, { collide: false, cast: false })
            b.box('net', -0.01, 0.76, -0.84, 0.01, 0.92, 0.84, { collide: false, cast: false })
            for (const sx of [-1, 1])
                for (const sz of [-1, 1])
                    b.box('metalDark', sx * 1.1 - 0.03, 0, sz * 0.6 - 0.03, sx * 1.1 + 0.03, 0.72, sz * 0.6 + 0.03, {
                        collide: false,
                    })
        },
    },
})

/** A rug, flat on the floor. */
export const RUG = defineAsset({
    id: 'rug',
    name: 'Rug',
    category: 'interior',
    defaults: { width: 3.6, depth: 2.8 },
    params: {
        width: { label: 'Width', min: 1, max: 5, step: 0.1 },
        depth: { label: 'Depth', min: 1, max: 4, step: 0.1 },
    },
    variants: [{}],
    size: [3.6, 0.02, 2.8],
    current: {
        version: 1,
        notes: 'A thin carpet slab.',
        build: (b, p) =>
            void b.box(
                'carpet',
                -(p.width as number) / 2,
                0,
                -(p.depth as number) / 2,
                (p.width as number) / 2,
                0.01,
                (p.depth as number) / 2,
                { collide: false, cast: false }
            ),
    },
})

export const WORKBENCH = defineAsset({
    id: 'workbench',
    name: 'Workbench and pegboard',
    category: 'interior',
    defaults: { length: 4 },
    params: { length: { label: 'Length', min: 1.5, max: 5, step: 0.5 } },
    variants: [{}],
    size: [4, 2.0, 0.75],
    current: {
        version: 1,
        notes: 'A solid bench, its top, a pegboard behind.',
        build(b, p) {
            const l = (p.length as number) / 2
            b.box('wood', -l, 0, -0.35, l, 0.9, 0.35)
            b.box('wood', -l - 0.05, 0.9, -0.4, l + 0.05, 0.95, 0.35, { collide: false })
            b.box('cedar', -l + 0.2, 1.1, -0.38, l - 0.2, 2.0, -0.35, { collide: false, cast: false })
        },
    },
})

export const STORAGE_SHELVES = defineAsset({
    id: 'storage-shelves',
    name: 'Storage shelves',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.5, 2.0, 0.5],
    current: {
        version: 1,
        notes: 'A dark metal rack, boxes and bags on three shelves.',
        build(b) {
            b.box('metalDark', -0.75, 0, -0.25, 0.75, 2.0, 0.25)
            for (const y of [0.5, 1.0, 1.5]) {
                b.box('binBlue', -0.6, y, -0.2, -0.1, y + 0.3, 0.2, { collide: false, cast: false })
                b.box('leafBag', 0.1, y, -0.2, 0.55, y + 0.25, 0.2, { collide: false, cast: false })
            }
        },
    },
})

/** A stack of winter tires. */
export const TIRE_STACK = defineAsset({
    id: 'tire-stack',
    name: 'Stack of tires',
    category: 'interior',
    defaults: { count: 4 },
    params: { count: { label: 'Tires', min: 1, max: 6, step: 1 } },
    variants: [{}],
    size: [0.8, 0.9, 0.8],
    current: {
        version: 1,
        notes: 'Tori, stacked.',
        build(b, p) {
            for (let i = 0; i < (p.count as number); i++)
                b.put(new TorusGeometry(0.3, 0.11, 8, 18).rotateX(Math.PI / 2), 'rubber', { y: 0.11 + i * 0.22 })
        },
    },
})
