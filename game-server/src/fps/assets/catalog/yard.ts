import { CylinderGeometry, TorusGeometry, Vector3 } from 'three'
import type { ErablesMaterial } from '../kit.ts'
import { place } from '../place.ts'
import { defineAsset } from '../types.ts'
import { LEAF_PILE, SHRUB } from './plants.ts'

const CHAIR_PAINTS = ['paintRed', 'paintBlue', 'paintGreen', 'paintWhite'] as const

/** An above-ground pool closed for the winter under its cover (you can stand on it), leaves on it. */
export const POOL = defineAsset({
    id: 'pool',
    name: 'Above-ground pool (closed)',
    category: 'yard',
    defaults: { radius: 2.4, leaves: true },
    params: {
        radius: { label: 'Radius', min: 1.8, max: 3.6, step: 0.1 },
        leaves: { label: 'Leaves on the cover', options: [true, false] },
    },
    variants: [{}, { radius: 3.2, leaves: false }],
    size: [4.8, 1.3, 4.8],
    current: {
        version: 1,
        notes: 'A corrugated wall, its cover, the top rail and twelve uprights.',
        build(b, p) {
            const r = p.radius as number
            b.put(new CylinderGeometry(r, r, 1.25, 40, 1, true).translate(0, 0.625, 0), 'poolWall')
            b.cyl('poolCover', r - 0.02, r - 0.02, 0.04, 0, 1.13, 0, 40)
            b.put(new TorusGeometry(r + 0.04, 0.07, 6, 40).rotateX(Math.PI / 2).scale(1, 0.5, 1), 'paintWhite', {
                y: 1.26,
                collide: false,
            })
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2
                const x = Math.cos(a) * (r + 0.03)
                const z = Math.sin(a) * (r + 0.03)
                b.box('paintWhite', x - 0.05, 0, z - 0.05, x + 0.05, 1.25, z + 0.05, { collide: false, cast: false })
            }
            if (p.leaves) place(b, LEAF_PILE, { radius: Math.min(0.9, r * 0.4) }, { x: 0.6, y: 1.14, z: 0.3 })
        },
    },
})

/** An in-ground trampoline, its mat flush with the lawn (a map makes it a jump pad). */
export const TRAMPOLINE = defineAsset({
    id: 'trampoline',
    name: 'In-ground trampoline',
    category: 'yard',
    defaults: { radius: 1.5 },
    params: { radius: { label: 'Radius', min: 1, max: 2.4, step: 0.05 } },
    variants: [{}, { radius: 1.2 }],
    size: [3.3, 0.2, 3.3],
    current: {
        version: 1,
        notes: 'A black mat, a blue padded rim.',
        build(b, p) {
            b.trampoline(0, 0, 0, p.radius as number)
        },
    },
})

export const SWING_SET = defineAsset({
    id: 'swing-set',
    name: 'Swing set',
    category: 'yard',
    defaults: { paint: 'paintGreen' },
    params: { paint: { label: 'Frame', options: CHAIR_PAINTS } },
    variants: [{}],
    size: [3.4, 2.3, 1.7],
    current: {
        version: 1,
        notes: 'Two A-frames, the top bar, two seats on chains.',
        build(b, p) {
            const paint = p.paint as ErablesMaterial
            for (const s of [-1, 1]) {
                b.rod(paint, new Vector3(s * 1.5, 0, -0.8), new Vector3(s * 1.5, 2.2, 0), 0.04)
                b.rod(paint, new Vector3(s * 1.5, 0, 0.8), new Vector3(s * 1.5, 2.2, 0), 0.04)
            }
            b.rod(paint, new Vector3(-1.6, 2.2, 0), new Vector3(1.6, 2.2, 0), 0.045, { collide: false })
            for (const sx of [-0.6, 0.6]) {
                for (const d of [-0.18, 0.18])
                    b.rod('metalDark', new Vector3(sx + d, 0.45, 0), new Vector3(sx + d, 2.2, 0), 0.008, {
                        collide: false,
                        cast: false,
                    })
                b.box('rubber', sx - 0.22, 0.42, -0.1, sx + 0.22, 0.46, 0.1, { collide: false })
            }
        },
    },
})

/** A cedar pergola over a picnic table. */
export const PERGOLA = defineAsset({
    id: 'pergola',
    name: 'Pergola with a picnic table',
    category: 'yard',
    defaults: {},
    params: {},
    variants: [{}],
    size: [4.2, 2.8, 4.0],
    current: {
        version: 1,
        notes: 'Four posts, two beams, nine slats; a picnic table with its benches.',
        build(b) {
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.block('wood', 0.14, 2.5, 0.14, sx * 1.7, 0, sz * 1.7)
            for (const sz of [-1, 1])
                b.box('wood', -2.1, 2.45, sz * 1.7 - 0.06, 2.1, 2.65, sz * 1.7 + 0.06, { collide: false })
            for (let i = 0; i < 9; i++)
                b.box('wood', -1.9 + i * 0.475 - 0.03, 2.65, -2.0, -1.9 + i * 0.475 + 0.03, 2.75, 2.0, {
                    collide: false,
                })
            const table = b.table(0, 0, 0, 1.8, 0.8, 0.75, 'wood')
            for (const s of [-1, 1])
                b.box('wood', -0.9, 0.42, s * 0.65 - 0.14, 0.9, 0.46, s * 0.65 + 0.14, { parent: table })
        },
    },
})

/** A stone fire pit and four Adirondack chairs round it. */
export const FIRE_PIT = defineAsset({
    id: 'fire-pit',
    name: 'Fire pit and Adirondack chairs',
    category: 'yard',
    defaults: { chairs: 4 },
    params: { chairs: { label: 'Chairs', min: 0, max: 4, step: 1 } },
    variants: [{}],
    size: [4.0, 1.0, 4.0],
    current: {
        version: 1,
        notes: 'A stone ring with ashes, painted chairs (seat, slanted back, arms).',
        build(b, p) {
            b.put(new TorusGeometry(0.55, 0.16, 6, 14).rotateX(Math.PI / 2), 'concrete', { y: 0.12 })
            b.cyl('soil', 0.42, 0.42, 0.05, 0, 0, 0, 12, { collide: false, cast: false })
            for (let i = 0; i < (p.chairs as number); i++) {
                const a = (i / 4) * Math.PI * 2 + 0.4
                const g = b.group(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, -a - Math.PI / 2)
                const mat = CHAIR_PAINTS[i % 4]!
                b.box(mat, -0.35, 0.3, -0.3, 0.35, 0.36, 0.35, { parent: g, rx: -0.12 })
                b.box(mat, -0.33, 0.35, 0.3, 0.33, 1.0, 0.36, { parent: g, rx: 0.3, collide: false })
                for (const s of [-1, 1])
                    b.box(mat, s * 0.38 - 0.05, 0.0, -0.35, s * 0.38 + 0.05, 0.6, 0.3, { parent: g, collide: false })
            }
        },
    },
})

/** A gas barbecue: its body and lid, a side shelf, the propane tank. */
export const BBQ = defineAsset({
    id: 'bbq',
    name: 'Barbecue',
    category: 'yard',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.5, 1.1, 0.6],
    current: {
        version: 1,
        notes: 'A box body, a lid, a shelf, a tank.',
        build(b) {
            b.box('metalDark', -0.55, 0.0, -0.25, 0.55, 0.85, 0.25)
            b.box('metalDark', -0.45, 0.85, -0.22, 0.45, 1.1, 0.22, { collide: false })
            b.box('steel', -0.85, 0.78, -0.22, -0.55, 0.82, 0.22, { collide: false, cast: false })
            b.cyl('paintWhite', 0.15, 0.15, 0.45, 0.3, 0.02, 0.0, 10, { collide: false, cast: false })
        },
    },
})

/** A patio table and its chairs, an umbrella or not. */
export const PATIO_SET = defineAsset({
    id: 'patio-set',
    name: 'Patio table and chairs',
    category: 'yard',
    defaults: { finish: 'metalDark', size: 1.0, chairs: 3, umbrella: false },
    params: {
        finish: { label: 'Finish', options: ['metalDark', 'paintWhite', 'wood'] },
        size: { label: 'Table', min: 0.8, max: 1.6, step: 0.1 },
        chairs: { label: 'Chairs', min: 0, max: 4, step: 1 },
        umbrella: { label: 'Umbrella', options: [false, true] },
    },
    variants: [{}, { finish: 'paintWhite', size: 1.2, umbrella: true }],
    size: [2.2, 2.2, 2.2],
    current: {
        version: 1,
        notes: 'A square table on four legs, simple slat chairs, a closed umbrella.',
        build(b, p) {
            const finish = p.finish as ErablesMaterial
            const s = p.size as number
            b.table(0, 0, 0, s, s, 0.73, finish)
            const seats: Array<[number, number, number]> = [
                [0, -(s / 2 + 0.2), 0],
                [0, s / 2 + 0.2, Math.PI],
                [-(s / 2 + 0.2), 0, Math.PI / 2],
                [s / 2 + 0.2, 0, -Math.PI / 2],
            ]
            for (const [x, z, ry] of seats.slice(0, p.chairs as number)) b.chair(x, 0, z, ry, finish)
            if (p.umbrella) {
                b.cyl('paintWhite', 0.025, 0.025, 2.2, 0, 0, 0, 6, { collide: false })
                b.cyl('canvas', 0.02, 0.14, 1.3, 0, 0.95, 0, 8, { collide: false })
            }
        },
    },
})

/** A corde of firewood under its tarp, along x. */
export const WOODPILE = defineAsset({
    id: 'woodpile',
    name: 'Woodpile',
    category: 'yard',
    defaults: { length: 4 },
    params: { length: { label: 'Length', min: 1.5, max: 6, step: 0.5 } },
    variants: [{}, { length: 2.5 }],
    size: [4, 1.4, 0.7],
    current: {
        version: 1,
        notes: 'A block of log ends on a pallet, a tarp on top.',
        build(b, p) {
            b.woodpile(0, 0, 0, p.length as number, 0)
        },
    },
})

/** A cedar raised bed: plants, pumpkins, or bare soil. */
export const RAISED_BED = defineAsset({
    id: 'raised-bed',
    name: 'Raised garden bed',
    category: 'yard',
    defaults: { crop: 'plants' },
    params: { crop: { label: 'In it', options: ['plants', 'pumpkins', 'soil'] } },
    variants: [{}, { crop: 'pumpkins' }],
    size: [2.4, 0.7, 1.0],
    current: {
        version: 1,
        notes: 'A cedar box, its soil, round plants or pumpkins.',
        build(b, p) {
            b.block('cedar', 2.4, 0.45, 1.0, 0, 0, 0)
            b.block('soil', 2.3, 0.04, 0.9, 0, 0.45, 0, { collide: false, cast: false })
            if (p.crop === 'plants')
                for (let i = 0; i < 4; i++) place(b, SHRUB, { radius: 0.18 }, { x: -0.9 + i * 0.6, y: 0.45 })
            if (p.crop === 'pumpkins') {
                b.pumpkin(-0.5, -0.2, 0.49, 0.26)
                b.pumpkin(0.3, -0.1, 0.49, 0.22)
                b.pumpkin(0.9, 0.2, 0.49, 0.18)
            }
        },
    },
})

/** A clothesline between two T-poles (along x), sheets drying on it. */
export const CLOTHESLINE = defineAsset({
    id: 'clothesline',
    name: 'Clothesline',
    category: 'yard',
    defaults: { length: 8, laundry: true },
    params: {
        length: { label: 'Length', min: 4, max: 12, step: 0.5 },
        laundry: { label: 'Laundry', options: [true, false] },
    },
    variants: [{}],
    size: [8, 2.1, 1.2],
    current: {
        version: 1,
        notes: 'Two T-poles, two sagging lines, three sheets.',
        build(b, p) {
            const half = (p.length as number) / 2
            for (const x of [-half, half]) {
                b.cyl('paintSilver', 0.04, 0.04, 2.1, x, 0, 0, 8)
                b.box('paintSilver', x - 0.03, 2.0, -0.6, x + 0.03, 2.06, 0.6, { collide: false })
            }
            for (const z of [-0.5, 0.5]) b.wire(new Vector3(-half, 2.03, z), new Vector3(half, 2.03, z), 0.25)
            if (!p.laundry) return
            for (const [x, w, mat] of [
                [-2.6, 1.4, 'paintWhite'],
                [-0.6, 1.1, 'sofaGreen'],
                [1.6, 1.5, 'bedding'],
            ] as const) {
                b.box(mat, x - w / 2, 0.75, -0.51, x + w / 2, 1.88, -0.49, { collide: false })
            }
        },
    },
})

export const COMPOST_BIN = defineAsset({
    id: 'compost-bin',
    name: 'Compost bin',
    category: 'yard',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1, 1, 1],
    current: {
        version: 1,
        notes: 'A brown plastic cube.',
        build: b => void b.block('binBrown', 1.0, 1.0, 1.0, 0, 0, 0),
    },
})

export const STONE_PALLET = defineAsset({
    id: 'stone-pallet',
    name: 'Pallet of patio stones',
    category: 'yard',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.1, 0.9, 1.1],
    current: {
        version: 1,
        notes: 'A pallet, a stack of stone on it.',
        build(b) {
            b.block('wood', 1.1, 0.15, 1.1, 0, 0, 0)
            b.block('concrete', 1.0, 0.75, 1.0, 0, 0.15, 0)
        },
    },
})

/** A cedar privacy fence along x, `length` long. */
export const FENCE = defineAsset({
    id: 'fence',
    name: 'Cedar fence',
    category: 'yard',
    defaults: { length: 6, height: 1.8 },
    params: {
        length: { label: 'Length', min: 1, max: 60, step: 0.5 },
        height: { label: 'Height', min: 0.9, max: 2.4, step: 0.1 },
    },
    variants: [{}, { height: 1.2, length: 4 }],
    size: [6, 1.9, 0.2],
    current: {
        version: 1,
        notes: 'One board panel, posts every 2.4 m, a cap rail.',
        build(b, p) {
            const half = (p.length as number) / 2
            b.fence(-half, 0, half, 0, 0, p.height as number)
        },
    },
})

/** A pumpkin. */
export const PUMPKIN = defineAsset({
    id: 'pumpkin',
    name: 'Pumpkin',
    category: 'yard',
    defaults: { radius: 0.16 },
    params: { radius: { label: 'Radius', min: 0.08, max: 0.35, step: 0.01 } },
    variants: [{ radius: 0.12 }, {}, { radius: 0.26 }],
    size: [0.5, 0.4, 0.5],
    current: {
        version: 1,
        notes: 'A squashed sphere and a stalk.',
        build: (b, p) => b.pumpkin(0, 0, 0, p.radius as number),
    },
})

/** Corn stalks tied by a door (autumn decor). */
export const CORN_STALKS = defineAsset({
    id: 'corn-stalks',
    name: 'Corn stalks',
    category: 'yard',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.4, 1.4, 0.4],
    current: {
        version: 1,
        notes: 'A tapered straw cone.',
        build: b => void b.cyl('hay', 0.12, 0.2, 1.4, 0, 0, 0, 7, { collide: false }),
    },
})
