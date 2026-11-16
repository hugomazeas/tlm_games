import {
    BoxGeometry,
    type BufferGeometry,
    CircleGeometry,
    CylinderGeometry,
    Euler,
    Float32BufferAttribute,
    IcosahedronGeometry,
    Matrix4,
    PlaneGeometry,
    Quaternion,
    Shape,
    ShapeGeometry,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type Builder, type Put, rng } from '../kit.ts'
import type { OfficeMaterial } from '../office-palette.ts'
import { place } from '../place.ts'
import { defineAsset } from '../types.ts'

/**
 * The office's things (3rd floor, and the street two storeys below), built with the office's own
 * materials (`palette: 'office'`). Real metres, standing on the floor at y = 0, front toward +z;
 * what hangs from the ceiling takes the ceiling's height as a parameter. Ported as they were drawn
 * in office.js, so the office kept its look and its collision (all but the street trees outside,
 * now seeded per tree).
 *
 * The office's coarse colliders (one box per placed thing, `userData.tag`) skip a part flagged
 * `userData.col = false`: a screen's cap, a pillar's skirting.
 */

type Mat = OfficeMaterial

// The office's own shapes: positioned by their centre (the kit's `block` / `cyl` stand on y).
const box = (b: Builder, w: number, h: number, d: number, mat: Mat, x: number, y: number, z: number, p: Put = {}) =>
    b.put(new BoxGeometry(w, h, d), mat, { ...p, x, y, z })
const rbox = (
    b: Builder,
    w: number,
    h: number,
    d: number,
    r: number,
    mat: Mat,
    x: number,
    y: number,
    z: number,
    p: Put = {}
) => b.put(new RoundedBoxGeometry(w, h, d, 3, r), mat, { ...p, x, y, z })
const cyl = (
    b: Builder,
    rt: number,
    rb: number,
    h: number,
    mat: Mat,
    x: number,
    y: number,
    z: number,
    segments = 24,
    p: Put = {}
) => b.put(new CylinderGeometry(rt, rb, h, segments), mat, { ...p, x, y, z })
const flat = (b: Builder, w: number, h: number, mat: Mat, x: number, y: number, z: number, p: Put = {}) =>
    b.put(new PlaneGeometry(w, h), mat, { cast: false, ...p, x, y, z })

/** Box UVs in metres, so a tiling texture keeps its real size on every face. */
function worldUV(geo: BufferGeometry, w: number, h: number, d: number): BufferGeometry {
    const uv = geo.attributes.uv!
    const n = geo.attributes.normal!
    for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(n.getX(i))
        const ny = Math.abs(n.getY(i))
        const su = nx > 0.5 ? d : w
        const sv = ny > 0.5 ? d : h
        uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    }
    return geo
}

const SCREENS = [0, 1, 2] as const
const screenOf = (n: number) => `screen${n}` as Mat
const DESK_TOPS = ['deskWhite', 'deskTop', 'oak'] as const
const FABRICS = ['chairFabric', 'sofaGrey', 'ottoman', 'leather'] as const

// ---------------------------------------------------------------------------------------------
// Desks and seats
// ---------------------------------------------------------------------------------------------

export const OFFICE_CHAIR = defineAsset({
    id: 'office-chair',
    name: 'Office chair',
    category: 'office',
    palette: 'office',
    defaults: { fabric: 'chairFabric' },
    params: { fabric: { label: 'Fabric', options: FABRICS } },
    variants: [{}, { fabric: 'sofaGrey' }],
    size: [0.6, 1.1, 0.6],
    current: {
        version: 1,
        notes: 'Five-star base on castors, a gas lift, a padded seat and tilted back, armrests.',
        build: (b, p) => {
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2
                box(b, 0.3, 0.03, 0.045, 'metalBlack', Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15, {
                    ry: a - Math.PI / 2,
                })
                b.put(new SphereGeometry(0.028, 12, 8), 'plastic', {
                    x: Math.sin(a) * 0.29,
                    y: 0.03,
                    z: Math.cos(a) * 0.29,
                })
            }
            cyl(b, 0.025, 0.025, 0.34, 'chrome', 0, 0.26, 0)
            cyl(b, 0.06, 0.06, 0.05, 'metalBlack', 0, 0.42, 0)
            const fabric = p.fabric as Mat
            rbox(b, 0.5, 0.08, 0.48, 0.035, fabric, 0, 0.47, 0.01)
            rbox(b, 0.46, 0.54, 0.06, 0.03, fabric, 0, 0.82, -0.25, { rx: -0.12 })
            box(b, 0.05, 0.32, 0.02, 'metalBlack', 0, 0.62, -0.27)
            for (const s of [-1, 1]) {
                box(b, 0.025, 0.2, 0.035, 'metalBlack', s * 0.25, 0.58, -0.03)
                rbox(b, 0.06, 0.03, 0.26, 0.012, 'plastic', s * 0.25, 0.69, -0.03)
            }
        },
    },
})

/** A desk on two sled frames joined by a beam; or (base `cabinet`) a closed cabinet with a top. */
export const OFFICE_DESK = defineAsset({
    id: 'office-desk',
    name: 'Office desk',
    category: 'office',
    palette: 'office',
    defaults: { width: 1.6, depth: 0.8, height: 0.74, top: 'deskTop', base: 'sled' },
    params: {
        width: { label: 'Width', min: 0.6, max: 2.4, step: 0.05 },
        depth: { label: 'Depth', min: 0.3, max: 1.2, step: 0.05 },
        height: { label: 'Height', min: 0.6, max: 1.1, step: 0.01 },
        top: { label: 'Top', options: DESK_TOPS },
        base: { label: 'Base', options: ['sled', 'cabinet'] },
    },
    variants: [{}, { width: 1.2, depth: 0.36, height: 0.75, top: 'oak', base: 'cabinet' }],
    size: [1.6, 0.8, 0.8],
    current: {
        version: 1,
        notes: 'Sled-frame desk (metal frames at both ends, a beam under the top), or a cabinet console.',
        build: (b, p) => {
            const [w, d, hh] = [p.width as number, p.depth as number, p.height as number]
            box(b, w, 0.03, d, p.top as Mat, 0, hh, 0)
            if (p.base === 'cabinet') {
                box(b, w - 0.02, hh - 0.02, d - 0.02, 'cabinetWhite', 0, hh / 2, 0)
                box(b, w - 0.03, 0.004, 0.01, 'plastic', 0, hh * 0.5, d / 2 - 0.005)
                return
            }
            const alongX = w >= d
            const L = alongX ? w : d
            const Wd = alongX ? d : w
            const put = (a: number, c: number, sx: number, sy: number, sz: number, y: number) =>
                alongX ? box(b, sx, sy, sz, 'metalBlack', a, y, c) : box(b, sz, sy, sx, 'metalBlack', c, y, a)
            for (const e of [-1, 1]) {
                const a = e * (L / 2 - 0.07)
                for (const s of [-1, 1]) put(a, s * (Wd / 2 - 0.07), 0.04, hh - 0.03, 0.04, (hh - 0.03) / 2)
                put(a, 0, 0.05, 0.025, Wd - 0.08, 0.0125)
                put(a, 0, 0.05, 0.03, Wd - 0.1, hh - 0.03)
            }
            put(0, -Wd / 2 + 0.15, L - 0.2, 0.05, 0.03, hh - 0.045)
        },
    },
})

/** A round (or oval: two radii) table on one pedestal, two when it's long. */
export const ROUND_TABLE = defineAsset({
    id: 'round-table',
    name: 'Round table',
    category: 'office',
    palette: 'office',
    defaults: { radiusX: 0.5, radiusZ: 0.5, top: 'oak' },
    params: {
        radiusX: { label: 'Radius (x)', min: 0.3, max: 1.6, step: 0.05 },
        radiusZ: { label: 'Radius (z)', min: 0.3, max: 1.0, step: 0.05 },
        top: { label: 'Top', options: DESK_TOPS },
    },
    variants: [{}, { radiusX: 1.15, radiusZ: 0.65 }],
    size: [1, 0.76, 1],
    current: {
        version: 1,
        notes: 'A round or oval top with a black edge, on a pedestal (two under an oval).',
        build: (b, p) => {
            const [rx, rz] = [p.radiusX as number, p.radiusZ as number]
            b.put(new CylinderGeometry(1, 1, 0.04, 64), p.top as Mat, { y: 0.74 }).scale.set(rx, 1, rz)
            b.put(new CylinderGeometry(1, 1, 0.01, 64), 'metalBlack', { y: 0.718 }).scale.set(rx + 0.004, 1, rz + 0.004)
            if (rx > 0.9) {
                for (const s of [-1, 1]) {
                    cyl(b, 0.05, 0.05, 0.7, 'metalBlack', s * rx * 0.5, 0.36, 0)
                    cyl(b, 0.22, 0.24, 0.02, 'metalBlack', s * rx * 0.5, 0.01, 0)
                }
            } else {
                cyl(b, 0.05, 0.05, 0.7, 'metalBlack', 0, 0.36, 0)
                cyl(b, 0.3, 0.32, 0.02, 'metalBlack', 0, 0.01, 0)
            }
        },
    },
})

/** One piece of a cluster's worktop (the L desks are laid out of these), at desk height. */
export const DESK_SLAB = defineAsset({
    id: 'desk-slab',
    name: 'Desk worktop',
    category: 'office',
    palette: 'office',
    defaults: { width: 1.4, depth: 0.7, height: 0.74 },
    params: {
        width: { label: 'Width', min: 0.3, max: 4, step: 0.01 },
        depth: { label: 'Depth', min: 0.3, max: 4, step: 0.01 },
        height: { label: 'Height', min: 0.6, max: 1.1, step: 0.01 },
    },
    variants: [{}, { width: 0.7, depth: 1.8 }],
    size: [1.4, 0.76, 0.7],
    current: {
        version: 1,
        notes: 'A white worktop (it stands on pedestals, end panels and the screen).',
        build: (b, p) => {
            box(b, p.width as number, 0.03, p.depth as number, 'deskWhite', 0, p.height as number, 0)
        },
    },
})

/** The white panel a worktop's free end stands on. */
export const DESK_END_PANEL = defineAsset({
    id: 'desk-end-panel',
    name: 'Desk end panel',
    category: 'office',
    palette: 'office',
    defaults: { width: 0.03, depth: 0.7, height: 0.74 },
    params: {
        width: { label: 'Width', min: 0.02, max: 1, step: 0.01 },
        depth: { label: 'Depth', min: 0.02, max: 1, step: 0.01 },
        height: { label: 'Desk height', min: 0.6, max: 1.1, step: 0.01 },
    },
    variants: [{}],
    size: [0.03, 0.74, 0.7],
    current: {
        version: 1,
        notes: 'A white leg panel under a worktop.',
        build: (b, p) => {
            const h = (p.height as number) - 0.015
            box(b, p.width as number, h, p.depth as number, 'deskWhite', 0, h / 2, 0)
        },
    },
})

/** A drawer pedestal under a desk, its drawers toward +z. */
export const PEDESTAL = defineAsset({
    id: 'pedestal',
    name: 'Drawer pedestal',
    category: 'office',
    palette: 'office',
    defaults: { height: 0.74 },
    params: { height: { label: 'Desk height', min: 0.6, max: 1.1, step: 0.01 } },
    variants: [{}],
    size: [0.42, 0.72, 0.55],
    current: {
        version: 1,
        notes: 'A dark wood drawer unit, two chrome handles, a key strip.',
        build: (b, p) => {
            const h = (p.height as number) - 0.03
            box(b, 0.42, h, 0.55, 'pedestal', 0, h / 2, 0)
            for (const y of [0.2, 0.48]) box(b, 0.26, 0.012, 0.015, 'chrome', 0, y, 0.283)
            box(b, 0.4, 0.006, 0.012, 'plastic', 0, 0.34, 0.278)
        },
    },
})

/** The grey fabric screen down a desk cluster's spine, standing on the worktops. */
export const PRIVACY_SCREEN = defineAsset({
    id: 'privacy-screen',
    name: 'Privacy screen',
    category: 'office',
    palette: 'office',
    defaults: { length: 3.3, axis: 'x', desk: 0.74 },
    params: {
        length: { label: 'Length', min: 0.6, max: 5, step: 0.05 },
        axis: { label: 'Runs along', options: ['x', 'z'] },
        desk: { label: 'Desk height', min: 0.6, max: 1.1, step: 0.01 },
    },
    variants: [{}],
    size: [3.3, 1.13, 0.04],
    current: {
        version: 1,
        notes: 'A 36 cm fabric panel on the worktops with a steel cap.',
        build: (b, p) => {
            const alongZ = p.axis === 'z'
            const [w, d] = alongZ ? [0.035, p.length as number] : [p.length as number, 0.035]
            const desk = p.desk as number
            box(b, w, 0.36, d, 'screenFabric', 0, desk + 0.195, 0)
            box(b, w + 0.01, 0.012, d + 0.01, 'steel', 0, desk + 0.38, 0).userData.col = false
        },
    },
})

/**
 * A long trough of trailing pothos (on a privacy screen's cap). `seed` picks how the leaves fall
 * (the office passes each its own, from where it stands).
 */
export const TROUGH_PLANTER = defineAsset({
    id: 'trough-planter',
    name: 'Trough planter',
    category: 'office',
    palette: 'office',
    defaults: { length: 1.8, axis: 'x', seed: 0 },
    params: {
        length: { label: 'Length', min: 0.5, max: 3, step: 0.05 },
        axis: { label: 'Runs along', options: ['x', 'z'] },
        seed: { label: 'Leaves', min: 0, max: 999, step: 1 },
    },
    variants: [{}],
    size: [1.8, 0.6, 0.16],
    current: {
        version: 1,
        notes: 'A dark trough with pothos every 40 cm, trailing over the sides.',
        build: (b, p) => {
            const alongZ = p.axis === 'z'
            const len = p.length as number
            box(b, alongZ ? 0.16 : len, 0.1, alongZ ? len : 0.16, 'potDark', 0, 0.05, 0)
            for (let t = -len / 2 + 0.2; t < len / 2 - 0.1; t += 0.4) {
                const at = alongZ ? { y: 0.02, z: t } : { x: t, y: 0.02 }
                place(b, POTTED_PLANT, { scale: 0.34, kind: 4, seed: (t * 977 + (p.seed as number)) | 0 }, at)
            }
        },
    },
})

export const MONITOR = defineAsset({
    id: 'monitor',
    name: 'Monitor',
    category: 'office',
    palette: 'office',
    defaults: { screen: 0, keyboard: true },
    params: { screen: { label: 'On screen', options: SCREENS }, keyboard: { label: 'Keyboard + mouse' } },
    variants: [{}, { screen: 1, keyboard: false }, { screen: 2 }],
    size: [0.66, 0.55, 0.5],
    current: {
        version: 1,
        notes: 'A 27" screen on a stand (code, a dashboard, a light dashboard), keyboard and mouse.',
        build: (b, p) => {
            box(b, 0.24, 0.012, 0.18, 'metalBlack', 0, 0.006, -0.02)
            box(b, 0.04, 0.34, 0.025, 'metalBlack', 0, 0.18, -0.07)
            rbox(b, 0.64, 0.38, 0.028, 0.008, 'plastic', 0, 0.36, -0.05)
            flat(b, 0.61, 0.35, screenOf(p.screen as number), 0, 0.36, -0.035, { receive: false })
            if (p.keyboard) {
                box(b, 0.44, 0.015, 0.14, 'plastic', 0, 0.008, 0.26)
                rbox(b, 0.06, 0.02, 0.1, 0.009, 'plastic', 0.3, 0.01, 0.26)
            }
        },
    },
})

export const LAPTOP = defineAsset({
    id: 'laptop',
    name: 'Laptop',
    category: 'office',
    palette: 'office',
    defaults: { screen: 0 },
    params: { screen: { label: 'On screen', options: SCREENS } },
    variants: [{}, { screen: 1 }],
    size: [0.32, 0.22, 0.25],
    current: {
        version: 1,
        notes: 'An aluminium laptop, lid open.',
        build: (b, p) => {
            box(b, 0.32, 0.015, 0.22, 'steel', 0, 0.008, 0)
            const lid = b.group(0, 0.015, -0.11)
            lid.rotation.x = -0.3
            box(b, 0.32, 0.21, 0.008, 'steel', 0, 0.105, -0.005, { parent: lid })
            flat(b, 0.29, 0.18, screenOf(p.screen as number), 0, 0.105, 0, { parent: lid, receive: false })
        },
    },
})

export const MUG = defineAsset({
    id: 'mug',
    name: 'Mug',
    category: 'office',
    palette: 'office',
    defaults: { colour: 'plasticWhite' },
    params: { colour: { label: 'Colour', options: ['plasticWhite', 'leather', 'cabinet'] } },
    variants: [{}, { colour: 'leather' }, { colour: 'cabinet' }],
    size: [0.08, 0.1, 0.08],
    current: {
        version: 1,
        notes: 'A plain mug.',
        build: (b, p) => {
            cyl(b, 0.04, 0.036, 0.095, p.colour as Mat, 0, 0.048, 0, 16)
        },
    },
})

export const WASTE_BIN = defineAsset({
    id: 'waste-bin',
    name: 'Waste bin',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.26, 0.3, 0.26],
    current: {
        version: 1,
        notes: 'A dark mesh bin under a desk.',
        build: b => {
            cyl(b, 0.13, 0.11, 0.3, 'bin', 0, 0.15, 0, 16)
        },
    },
})

/** A shelf on a desk (two uprights and a board) with a row of binders on it. */
export const DESK_HUTCH = defineAsset({
    id: 'desk-hutch',
    name: 'Desk shelf',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.3, 0.55, 0.8],
    current: {
        version: 1,
        notes: 'Two white uprights, a shelf, five binders on it.',
        build: b => {
            for (const s of [-1, 1]) box(b, 0.3, 0.42, 0.02, 'deskWhite', 0, 0.225, s * 0.38)
            box(b, 0.3, 0.02, 0.78, 'deskWhite', 0, 0.44, 0)
            for (let i = 0; i < 5; i++) cyl(b, 0.025, 0.025, 0.09, `book${i}` as Mat, 0, 0.5, -0.28 + i * 0.13, 10)
        },
    },
})

/** A sit-stand desk on two black legs (`width` wide). */
export const STANDING_DESK = defineAsset({
    id: 'standing-desk',
    name: 'Standing desk',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.3, 0.77, 0.62],
    current: {
        version: 1,
        notes: 'A white top on two black T legs.',
        build: b => {
            box(b, 1.3, 0.03, 0.62, 'deskWhite', 0, 0.75, 0)
            for (const s of [-1, 1]) {
                box(b, 0.07, 0.72, 0.07, 'metalBlack', s * 0.55, 0.36, 0)
                box(b, 0.07, 0.03, 0.58, 'metalBlack', s * 0.55, 0.015, 0)
            }
        },
    },
})

/** A big screen on a black-legged desk, its speakers either side. */
export const TV_DESK = defineAsset({
    id: 'tv-desk',
    name: 'TV on a desk',
    category: 'office',
    palette: 'office',
    defaults: { screen: 1 },
    params: { screen: { label: 'On screen', options: SCREENS } },
    variants: [{}],
    size: [1.6, 1.75, 0.7],
    current: {
        version: 1,
        notes: 'A 65" TV standing on a white desk on black legs, two speakers.',
        build: (b, p) => {
            box(b, 1.6, 0.03, 0.7, 'deskWhite', 0, 0.76, 0)
            for (const s of [-1, 1]) {
                box(b, 0.07, 0.74, 0.07, 'metalBlack', s * 0.68, 0.37, 0)
                box(b, 0.07, 0.03, 0.64, 'metalBlack', s * 0.68, 0.015, 0)
            }
            for (const s of [-1, 1]) box(b, 0.04, 0.1, 0.25, 'plastic', s * 0.5, 0.82, 0)
            rbox(b, 1.45, 0.84, 0.05, 0.01, 'plastic', 0, 1.31, 0)
            flat(b, 1.41, 0.8, screenOf(p.screen as number), 0, 1.31, 0.027)
        },
    },
})

// ---------------------------------------------------------------------------------------------
// Lounge
// ---------------------------------------------------------------------------------------------

export const LOUNGE_SOFA = defineAsset({
    id: 'lounge-sofa',
    name: 'Lounge sofa',
    category: 'office',
    palette: 'office',
    defaults: { length: 2.2, depth: 0.9, fabric: 'sofaGrey', pillows: false },
    params: {
        length: { label: 'Length', min: 1, max: 3, step: 0.05 },
        depth: { label: 'Depth', min: 0.7, max: 1.1, step: 0.01 },
        fabric: { label: 'Fabric', options: ['sofaGrey', 'sofa'] },
        pillows: { label: 'Pillows' },
    },
    variants: [{}, { length: 1.15, depth: 0.8 }, { fabric: 'sofa', pillows: true }],
    size: [2.2, 0.85, 0.9],
    current: {
        version: 1,
        notes: 'A low sofa: base, seat and back cushions (one or three), arms, oak feet, two pillows.',
        build: (b, p) => {
            const [L, D] = [p.length as number, p.depth as number]
            const mat = p.fabric as Mat
            const cushion: Mat = mat === 'sofa' ? 'sofaCushion' : 'sofaGreyCushion'
            rbox(b, L, 0.22, D, 0.04, mat, 0, 0.2, 0)
            for (let i = 0; i < 4; i++)
                b.put(new CylinderGeometry(0.02, 0.015, 0.09, 8), 'oak', {
                    x: (i % 2 ? 1 : -1) * (L / 2 - 0.08),
                    y: 0.045,
                    z: (i < 2 ? 1 : -1) * (D / 2 - 0.08),
                })
            const n = L > 1.2 ? 3 : 1
            const cw = (L - 0.36) / n
            for (let i = 0; i < n; i++) {
                rbox(b, cw - 0.02, 0.14, D - 0.26, 0.06, cushion, -L / 2 + 0.18 + cw * (i + 0.5), 0.37, 0.07)
                rbox(b, cw - 0.02, 0.42, 0.2, 0.08, cushion, -L / 2 + 0.18 + cw * (i + 0.5), 0.6, -D / 2 + 0.16, {
                    rx: -0.15,
                })
            }
            for (const s of [-1, 1]) rbox(b, 0.18, 0.38, D, 0.06, mat, s * (L / 2 - 0.09), 0.4, 0)
            rbox(b, 0.24, 0.66, 0.16, 0.04, mat, 0, 0.52, -D / 2 + 0.08).scale.set(L / 0.24 - 0.1, 1, 1)
            if (L > 1.2 && p.pillows) {
                rbox(b, 0.42, 0.42, 0.12, 0.06, 'pillowA', -L / 2 + 0.45, 0.62, -D / 2 + 0.32, {
                    rx: -0.25,
                    ry: 0.2,
                    rz: 0.1,
                })
                rbox(b, 0.4, 0.4, 0.12, 0.06, 'pillowB', L / 2 - 0.45, 0.62, -D / 2 + 0.32, {
                    rx: -0.25,
                    ry: -0.15,
                    rz: -0.08,
                })
            }
        },
    },
})

export const CLUB_ARMCHAIR = defineAsset({
    id: 'club-armchair',
    name: 'Club armchair',
    category: 'office',
    palette: 'office',
    defaults: { cover: 'leather' },
    params: { cover: { label: 'Cover', options: ['leather', 'sofaGrey', 'ottoman', 'sofa'] } },
    variants: [{}, { cover: 'sofaGrey' }],
    size: [0.9, 0.85, 0.8],
    current: {
        version: 1,
        notes: 'A leather club chair on splayed oak legs.',
        build: (b, p) => {
            const cover = p.cover as Mat
            rbox(b, 0.78, 0.2, 0.78, 0.05, cover, 0, 0.26, 0.02)
            rbox(b, 0.78, 0.5, 0.14, 0.06, cover, 0, 0.58, -0.34, { rx: -0.12 })
            for (const s of [-1, 1]) rbox(b, 0.12, 0.3, 0.7, 0.05, cover, s * 0.39, 0.45, 0)
            for (const sx of [-1, 1])
                for (const sz of [-1, 1])
                    cyl(b, 0.018, 0.012, 0.18, 'oak', sx * 0.33, 0.08, sz * 0.3, 8, { rz: sx * 0.12 })
        },
    },
})

export const OTTOMAN = defineAsset({
    id: 'ottoman',
    name: 'Ottoman',
    category: 'office',
    palette: 'office',
    defaults: { cover: 'ottoman' },
    params: { cover: { label: 'Cover', options: ['ottoman', 'sofaGrey', 'leather'] } },
    variants: [{}],
    size: [0.8, 0.45, 0.78],
    current: {
        version: 1,
        notes: 'A padded footstool on little feet, a remote on it.',
        build: (b, p) => {
            rbox(b, 0.8, 0.36, 0.78, 0.06, p.cover as Mat, 0, 0.26, 0)
            for (const sx of [-1, 1])
                for (const sz of [-1, 1]) cyl(b, 0.025, 0.02, 0.08, 'plastic', sx * 0.33, 0.04, sz * 0.32, 8)
            box(b, 0.16, 0.015, 0.04, 'plastic', 0.1, 0.45, -0.1)
        },
    },
})

export const BEAN_BAG = defineAsset({
    id: 'bean-bag',
    name: 'Bean bag',
    category: 'office',
    palette: 'office',
    defaults: { colour: 'beanPurple', size: 1 },
    params: {
        colour: { label: 'Colour', options: ['beanPurple', 'beanGrey'] },
        size: { label: 'Size', min: 0.7, max: 1.4, step: 0.05 },
    },
    variants: [{}, { colour: 'beanGrey', size: 1.1 }],
    size: [1.1, 0.6, 1.1],
    current: {
        version: 1,
        notes: 'A slumped vinyl bean bag.',
        build: (b, p) => {
            const s = p.size as number
            const geo = new SphereGeometry(0.5, 24, 16)
            const pos = geo.attributes.position!
            const v = new Vector3()
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i)
                const sag = v.y > 0 ? 1 - 0.35 * Math.sin(Math.atan2(v.z, v.x) * 3 + 1) * v.y : 1
                pos.setXYZ(
                    i,
                    v.x * (1 + 0.08 * Math.sin(v.y * 9)),
                    v.y * 0.6 * sag,
                    v.z * (1 + 0.06 * Math.cos(v.x * 7))
                )
            }
            geo.computeVertexNormals()
            b.put(geo, p.colour as Mat, { y: 0.27 * s }).scale.setScalar(s)
        },
    },
})

export const YOGA_MAT = defineAsset({
    id: 'yoga-mat',
    name: 'Yoga mat',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.56, 0.01, 0.58],
    current: {
        version: 1,
        notes: 'A navy mat on the floor.',
        build: b => {
            box(b, 1.56, 0.006, 0.58, 'yogaMat', 0, 0.006, 0)
        },
    },
})

export const DUMBBELL = defineAsset({
    id: 'dumbbell',
    name: 'Dumbbell',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.27, 0.12, 0.12],
    current: {
        version: 1,
        notes: 'Hex weights on a chrome bar.',
        build: b => {
            for (const s of [-1, 1])
                b.put(new CylinderGeometry(0.06, 0.06, 0.07, 6), 'plastic', { x: s * 0.1, y: 0.06, rz: Math.PI / 2 })
            cyl(b, 0.014, 0.014, 0.14, 'chrome', 0, 0.06, 0, 8, { rz: Math.PI / 2 })
        },
    },
})

/** Two bamboo tables pushed together, a clamp-on net, paddles and a ball. */
export const BAMBOO_PING_PONG = defineAsset({
    id: 'bamboo-ping-pong',
    name: 'Bamboo ping-pong table',
    category: 'office',
    palette: 'office',
    defaults: { paddles: true },
    params: { paddles: { label: 'Paddles and ball' } },
    variants: [{}, { paddles: false }],
    size: [1.3, 0.92, 2.78],
    current: {
        version: 1,
        notes: 'Two bamboo tops on steel legs, a clamp-on net, two paddles and a ball.',
        build: (b, p) => {
            for (const s of [-1, 1]) {
                rbox(b, 1.27, 0.025, 1.37, 0.01, 'bamboo', 0, 0.76, s * 0.695)
                for (const lx of [-0.56, 0.56])
                    for (const lz of [0.08, 1.3]) cyl(b, 0.022, 0.02, 0.75, 'steel', lx, 0.375, s * lz, 10)
            }
            for (const s of [-1, 1]) box(b, 0.03, 0.17, 0.05, 'plasticWhite', s * 0.65, 0.85, 0)
            flat(b, 1.3, 0.13, 'pingPongNet', 0, 0.84, 0)
            box(b, 1.3, 0.012, 0.012, 'plasticWhite', 0, 0.91, 0)
            if (!p.paddles) return
            for (const [x, z, r] of [
                [0.3, 0.7, 0.4],
                [-0.35, -0.8, 2.5],
            ] as const) {
                const pd = b.group(x, 0, z, r)
                cyl(b, 0.075, 0.075, 0.012, 'paddle', 0, 0.78, 0, 24, { parent: pd })
                box(b, 0.03, 0.012, 0.1, 'oak', 0, 0.78, 0.11, { parent: pd })
            }
            b.put(new SphereGeometry(0.02, 12, 8), 'plasticWhite', { x: -0.2, y: 0.79, z: 0.3 })
        },
    },
})

/** An archery target leaning on a wall (its back toward -z). */
export const ARCHERY_TARGET = defineAsset({
    id: 'archery-target',
    name: 'Archery target',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.75, 1.1, 0.35],
    current: {
        version: 1,
        notes: 'A foam boss with a printed face, leaning back.',
        build: b => {
            const tgt = b.group(0, 0.55, 0)
            tgt.rotation.x = -0.18
            box(b, 0.75, 1.05, 0.14, 'targetBoard', 0, 0, 0, { parent: tgt })
            flat(b, 0.66, 0.66, 'targetFace', 0, -0.1, 0.071, { parent: tgt })
        },
    },
})

// ---------------------------------------------------------------------------------------------
// Kitchen and bar
// ---------------------------------------------------------------------------------------------

/**
 * A kitchen along a wall: base cabinets with a sink, a backsplash, wall cabinets, a tall fridge at
 * the end, a coffee machine, a kettle and a fruit bowl. Its origin is the run's start against the
 * wall, the run going toward +x, the front toward +z; `sink` and `bowl` are along the run.
 */
export const KITCHENETTE = defineAsset({
    id: 'kitchenette',
    name: 'Kitchenette',
    category: 'office',
    palette: 'office',
    defaults: { length: 2.66, units: 6, sink: 1.4, fridge: 0.51, bowl: 2.2 },
    params: {
        length: { label: 'Run', min: 1.2, max: 4, step: 0.01 },
        units: { label: 'Cabinets', min: 2, max: 8, step: 1 },
        sink: { label: 'Sink at', min: 0.3, max: 3.7, step: 0.01 },
        fridge: { label: 'Fridge', min: 0.4, max: 0.9, step: 0.01 },
        bowl: { label: 'Fruit bowl at', min: 0.3, max: 3.7, step: 0.01 },
    },
    variants: [{}],
    size: [3.2, 2.2, 0.7],
    current: {
        version: 1,
        notes: 'Green base cabinets, white wall cabinets, subway tiles, a steel fridge.',
        build: (b, p) => {
            const run = p.length as number
            const n = p.units as number
            const cw = run / n
            const sx = p.sink as number
            box(b, run, 0.1, 0.55, 'baseboard', run / 2, 0.05, 0.3)
            for (let i = 0; i < n; i++) {
                const cx = cw * (i + 0.5)
                box(b, cw - 0.006, 0.76, 0.6, 'cabinet', cx, 0.48, 0.3)
                box(b, 0.012, 0.14, 0.02, 'chrome', cx + cw / 2 - 0.06, 0.78, 0.61)
            }
            box(b, run + 0.02, 0.04, 0.64, 'counter', run / 2, 0.88, 0.32)
            box(b, 0.56, 0.005, 0.42, 'steel', sx, 0.903, 0.33)
            box(b, 0.5, 0.006, 0.36, 'plastic', sx, 0.905, 0.33)
            cyl(b, 0.014, 0.018, 0.32, 'chrome', sx, 1.06, 0.1, 12)
            b.put(new TorusGeometry(0.09, 0.012, 8, 20, Math.PI), 'chrome', {
                x: sx,
                y: 1.22,
                z: 0.19,
                ry: Math.PI / 2,
            })
            flat(b, run, 0.56, 'subway', run / 2, 1.18, 0.005, { cast: true })
            for (let i = 0; i < n; i++) {
                const cx = cw * (i + 0.5)
                box(b, cw - 0.006, 0.72, 0.34, 'cabinetWhite', cx, 1.86, 0.17)
                box(b, cw - 0.1, 0.012, 0.02, 'chrome', cx, 1.53, 0.345)
            }
            box(b, run - 0.1, 0.01, 0.03, 'panel', run / 2, 1.49, 0.3, { cast: false })
            const fw = p.fridge as number
            const fx = run + fw / 2
            rbox(b, fw - 0.01, 1.9, 0.66, 0.02, 'steel', fx, 0.95, 0.34)
            box(b, 0.02, 0.6, 0.03, 'chrome', fx - fw / 2 + 0.08, 1.25, 0.68)
            box(b, 0.02, 0.4, 0.03, 'chrome', fx - fw / 2 + 0.08, 0.55, 0.68)
            box(b, fw - 0.03, 0.005, 0.01, 'plastic', fx, 1.0, 0.675)
            rbox(b, 0.24, 0.36, 0.34, 0.02, 'plastic', 0.4, 1.08, 0.25)
            cyl(b, 0.07, 0.08, 0.2, 'steel', 0.85, 1.0, 0.25, 20)
            b.put(new SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'plasticWhite', {
                x: p.bowl as number,
                y: 1.0,
                z: 0.35,
            })
        },
    },
})

/** A piece of fruit (in the kitchenette's bowl). */
export const FRUIT = defineAsset({
    id: 'fruit',
    name: 'Fruit',
    category: 'office',
    palette: 'office',
    defaults: { kind: 'fruitOrange' },
    params: { kind: { label: 'Kind', options: ['fruitOrange', 'fruitRed', 'fruitGreen'] } },
    variants: [{}, { kind: 'fruitRed' }, { kind: 'fruitGreen' }],
    size: [0.08, 0.08, 0.08],
    current: {
        version: 1,
        notes: 'An orange, an apple or a lime (centred on its origin).',
        build: (b, p) => {
            b.put(new SphereGeometry(0.04, 12, 8), p.kind as Mat)
        },
    },
})

export const SQUARE_ISLAND = defineAsset({
    id: 'square-island',
    name: 'Square island',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.78, 0.9, 0.78],
    current: {
        version: 1,
        notes: 'A small white island with a counter top and a towel bar.',
        build: b => {
            box(b, 0.72, 0.86, 0.72, 'cabinetWhite', 0, 0.43, 0)
            box(b, 0.78, 0.04, 0.78, 'counter', 0, 0.88, 0)
            box(b, 0.6, 0.02, 0.02, 'chrome', 0, 0.75, 0.4)
        },
    },
})

/** A counter-height bar along a wall: origin at its start against the wall, running toward +x. */
export const BAR_COUNTER = defineAsset({
    id: 'bar-counter',
    name: 'Bar counter',
    category: 'office',
    palette: 'office',
    defaults: { length: 1.72, depth: 0.32 },
    params: {
        length: { label: 'Length', min: 0.8, max: 4, step: 0.01 },
        depth: { label: 'Depth', min: 0.25, max: 0.7, step: 0.01 },
    },
    variants: [{}],
    size: [1.72, 1.26, 0.36],
    current: {
        version: 1,
        notes: 'White cabinets, a counter top, a coffee machine on it.',
        build: (b, p) => {
            const [L, d] = [p.length as number, p.depth as number]
            box(b, L, 0.86, d - 0.02, 'cabinetWhite', L / 2, 0.43, d / 2)
            box(b, L + 0.04, 0.04, d + 0.04, 'counter', L / 2, 0.88, d / 2 + 0.01)
            for (let i = 1; i < 4; i++) box(b, 0.006, 0.8, 0.01, 'plastic', (L * i) / 4, 0.43, d)
            rbox(b, 0.24, 0.36, 0.3, 0.02, 'plastic', 0.35, 1.08, 0.16)
        },
    },
})

export const PRINTER_CABINET = defineAsset({
    id: 'printer-cabinet',
    name: 'Printer on a cabinet',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.37, 0.94, 0.58],
    current: {
        version: 1,
        notes: 'A small white cabinet with a grey printer.',
        build: b => {
            box(b, 0.37, 0.72, 0.58, 'cabinetWhite', 0, 0.36, 0)
            rbox(b, 0.34, 0.22, 0.4, 0.02, 'printer', 0, 0.83, 0)
        },
    },
})

export const RECYCLING_BIN = defineAsset({
    id: 'recycling-bin',
    name: 'Recycling bin',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.46, 0.95, 0.46],
    current: {
        version: 1,
        notes: 'A green box with a white label.',
        build: b => {
            box(b, 0.46, 0.95, 0.46, 'greenBin', 0, 0.475, 0)
            box(b, 0.3, 0.3, 0.005, 'plasticWhite', 0, 0.62, 0.233)
        },
    },
})

/** Closet shelving between two uprights, cardboard boxes on the shelves. */
export const CLOSET_SHELVES = defineAsset({
    id: 'closet-shelves',
    name: 'Closet shelves',
    category: 'office',
    palette: 'office',
    defaults: { width: 1.84, boxes: 6 },
    params: {
        width: { label: 'Width', min: 0.8, max: 3, step: 0.01 },
        boxes: { label: 'Boxes', min: 0, max: 8, step: 1 },
    },
    variants: [{}],
    size: [1.84, 1.8, 0.4],
    current: {
        version: 1,
        notes: 'Four white shelves, cardboard boxes in three shades.',
        build: (b, p) => {
            const W = p.width as number
            for (let k = 0; k < 4; k++) box(b, W, 0.025, 0.4, 'cabinetWhite', 0, 0.4 + k * 0.45, 0)
            for (const s of [-1, 1]) box(b, 0.03, 1.8, 0.4, 'cabinetWhite', (s * W) / 2, 0.9, 0)
            // Every 25 cm from 56 cm left of the middle (the plan's 14 px steps).
            for (let k = 0; k < (p.boxes as number); k++)
                box(
                    b,
                    0.3,
                    0.25,
                    0.3,
                    `cardboard${k % 3}` as Mat,
                    (-32 + k * 14) * 0.017514,
                    0.4 + (k % 3) * 0.45 + 0.14,
                    0
                )
        },
    },
})

// ---------------------------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------------------------

/**
 * A potted plant. Kinds: 0/1 leafy floor plant (light / dark pot and leaves), 2 tall and bushy,
 * 3 small desk plant, 4 trailing pothos. `seed` picks how the leaves fall.
 */
export const POTTED_PLANT = defineAsset({
    id: 'potted-plant',
    name: 'Potted plant',
    category: 'office',
    palette: 'office',
    defaults: { scale: 1, kind: 0, seed: 1 },
    params: {
        scale: { label: 'Size', min: 0.2, max: 1.5, step: 0.01 },
        kind: { label: 'Kind', options: [0, 1, 2, 3, 4] },
        seed: { label: 'Leaves', min: 0, max: 9999, step: 1 },
    },
    variants: [{}, { kind: 1 }, { kind: 2, scale: 1.2 }, { kind: 3, scale: 0.3 }, { kind: 4, scale: 0.34 }],
    size: [0.6, 1.2, 0.6],
    current: {
        version: 1,
        notes: 'A pot, soil and a spray of leaf cards (leaves are only drawn: shots go through).',
        build: (b, p) => {
            const s = p.scale as number
            const kind = p.kind as number
            cyl(b, 0.2 * s, 0.15 * s, 0.42 * s, kind % 2 ? 'potDark' : 'pot', 0, 0.21 * s, 0)
            cyl(b, 0.19 * s, 0.19 * s, 0.01, 'soil', 0, 0.4 * s, 0)
            const leafShape = new Shape()
            if (kind === 4) {
                leafShape.moveTo(0, 0)
                leafShape.bezierCurveTo(0.1, 0.04, 0.08, 0.16, 0, 0.2)
                leafShape.bezierCurveTo(-0.08, 0.16, -0.1, 0.04, 0, 0)
            } else {
                leafShape.moveTo(0, 0)
                leafShape.quadraticCurveTo(0.09, 0.14, 0, 0.34)
                leafShape.quadraticCurveTo(-0.09, 0.14, 0, 0)
            }
            const base = new ShapeGeometry(leafShape, 6)
            // UVs across the leaf (its shape is in metres: ±9 cm wide, 34 cm long, a pothos 20 cm), for its veins.
            const length = kind === 4 ? 0.2 : 0.34
            const uvs = base.attributes.uv!
            for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) / 0.2 + 0.5, uvs.getY(i) / length)
            const geos: BufferGeometry[] = []
            const r = rng(p.seed as number)
            const count = ({ 2: 60, 3: 22, 4: 70 } as Record<number, number>)[kind] ?? 34
            for (let i = 0; i < count; i++) {
                const gq = base.clone()
                let h = (0.45 + r() * (kind === 2 ? 1.2 : 0.7)) * s
                const a = r() * Math.PI * 2
                let tilt = 0.5 + r() * 0.7
                let sc = (0.8 + r() * 0.7) * s
                let rad = 0.05
                if (kind === 3) {
                    h = (0.42 + r() * 0.25) * s
                    tilt = 0.3 + r() * 0.9
                }
                if (kind === 4) {
                    const k = r()
                    h = (0.42 - k * 1.1) * s
                    rad = (0.15 + k * 0.1) * s
                    tilt = 1.2 + r() * 1.2
                    sc = (0.7 + r() * 0.4) * s
                }
                gq.applyMatrix4(
                    new Matrix4().compose(
                        new Vector3(Math.cos(a) * rad, h, Math.sin(a) * rad),
                        new Quaternion().setFromEuler(new Euler(tilt, a, 0, 'YXZ')),
                        new Vector3(sc, sc, sc)
                    )
                )
                geos.push(gq)
                if (i % 3 === 0 && kind !== 4) {
                    const st = new CylinderGeometry(0.006, 0.008, h - 0.38 * s, 5)
                    st.translate(0, 0.4 * s + (h - 0.38 * s) / 2, 0)
                    // A stem takes the leaf's colour at its base, where the midrib starts.
                    const stemUV = st.attributes.uv!
                    for (let k = 0; k < stemUV.count; k++) stemUV.setXY(k, 0.5, 0.03)
                    geos.push(st)
                }
            }
            const leaves = geos.map(q => (q.index ? q.toNonIndexed() : q))
            for (const q of leaves) if (!q.attributes.normal) q.computeVertexNormals()
            // Pass-through: hundreds of tiny triangles would snag a small player.
            b.put(mergeGeometries(leaves), kind === 1 ? 'leafDark' : 'leaf', { collide: false })
        },
    },
})

// ---------------------------------------------------------------------------------------------
// On the walls and the ceiling
// ---------------------------------------------------------------------------------------------

/** A framed print on a wall (hung at `hang`, its centre), facing +z. */
export const FRAMED_ART = defineAsset({
    id: 'framed-art',
    name: 'Framed print',
    category: 'office',
    palette: 'office',
    defaults: { width: 0.7, height: 0.9, art: 0, hang: 1.55 },
    params: {
        width: { label: 'Width', min: 0.3, max: 1.5, step: 0.05 },
        height: { label: 'Height', min: 0.3, max: 1.5, step: 0.05 },
        art: { label: 'Print', options: [0, 1, 2, 3, 4] },
        hang: { label: 'Hung at', min: 1, max: 2, step: 0.05 },
    },
    variants: [{}, { width: 0.55, height: 0.7, art: 1, hang: 1.6 }, { width: 0.9, height: 1.1, art: 2 }],
    size: [0.75, 1.9, 0.03],
    current: {
        version: 1,
        notes: 'A thin black frame round an abstract print.',
        build: (b, p) => {
            const [w, h, y] = [p.width as number, p.height as number, p.hang as number]
            box(b, w + 0.05, h + 0.05, 0.03, 'metalBlack', 0, y, 0)
            flat(b, w, h, `art${p.art}` as Mat, 0, y, 0.017)
        },
    },
})

export const WHITEBOARD = defineAsset({
    id: 'whiteboard',
    name: 'Whiteboard',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.9, 2, 0.08],
    current: {
        version: 1,
        notes: 'A steel-framed whiteboard, a sprint drawn on it, a marker tray.',
        build: b => {
            box(b, 1.9, 1.1, 0.02, 'steel', 0, 1.45, 0)
            flat(b, 1.85, 1.05, 'whiteboard', 0, 1.45, 0.012)
            box(b, 1.6, 0.03, 0.06, 'steel', 0, 0.9, 0.03)
        },
    },
})

/** A sheet of paper pinned to a wall. */
export const NOTICE = defineAsset({
    id: 'notice',
    name: 'Notice',
    category: 'office',
    palette: 'office',
    defaults: { at: 1.65 },
    params: { at: { label: 'Height', min: 0.8, max: 2, step: 0.05 } },
    variants: [{}],
    size: [0.22, 1.8, 0.01],
    current: {
        version: 1,
        notes: 'A white A4 sheet.',
        build: (b, p) => {
            flat(b, 0.22, 0.28, 'plasticWhite', 0, p.at as number, 0)
        },
    },
})

/** A baseboard heater under a window (`length` long). */
export const BASEBOARD_HEATER = defineAsset({
    id: 'baseboard-heater',
    name: 'Baseboard heater',
    category: 'office',
    palette: 'office',
    defaults: { length: 1.5 },
    params: { length: { label: 'Length', min: 0.4, max: 2.4, step: 0.05 } },
    variants: [{}],
    size: [1.5, 0.3, 0.07],
    current: {
        version: 1,
        notes: 'A white convector box.',
        build: (b, p) => {
            box(b, p.length as number, 0.19, 0.07, 'heater', 0, 0.2, 0)
        },
    },
})

/**
 * Vertical blinds stacked at a window's end (both ends when `both`), with the head rail across
 * it. Origin: the window's sill at its start, the window going toward +x.
 */
export const VERTICAL_BLINDS = defineAsset({
    id: 'vertical-blinds',
    name: 'Vertical blinds',
    category: 'office',
    palette: 'office',
    defaults: { width: 2.5, height: 1.72, slats: 10, both: false },
    params: {
        width: { label: 'Window width', min: 0.5, max: 8, step: 0.05 },
        height: { label: 'Drop', min: 0.8, max: 2.4, step: 0.01 },
        slats: { label: 'Slats a stack', min: 2, max: 14, step: 1 },
        both: { label: 'Stacked at both ends' },
    },
    variants: [{}, { width: 4, both: true, slats: 14 }],
    size: [2.5, 1.8, 0.1],
    current: {
        version: 1,
        notes: 'White slats bunched to the side, a head rail.',
        build: (b, p) => {
            const [w, bh] = [p.width as number, p.height as number]
            const slats: BufferGeometry[] = []
            for (const end of p.both ? [0, w] : [w]) {
                const towardMid = end === 0 ? 1 : -1
                for (let k = 0; k < (p.slats as number); k++) {
                    const sl = new BoxGeometry(0.089, bh, 0.003)
                    sl.rotateY(1.35 + (k % 2) * 0.08)
                    sl.translate(end + towardMid * (0.07 + k * 0.014), bh / 2 - 0.04, 0)
                    slats.push(sl)
                }
            }
            b.put(mergeGeometries(slats), 'blind', { collide: false })
            box(b, w, 0.04, 0.05, 'heater', w / 2, bh - 0.05, 0)
        },
    },
})

/** A pendant lamp hanging `drop` from a ceiling `ceiling` high. */
export const PENDANT_LIGHT = defineAsset({
    id: 'pendant-light',
    name: 'Pendant light',
    category: 'office',
    palette: 'office',
    defaults: { drop: 1.1, ceiling: 2.7 },
    params: {
        drop: { label: 'Drop', min: 0.3, max: 2, step: 0.05 },
        ceiling: { label: 'Ceiling', min: 2.2, max: 4, step: 0.05 },
    },
    variants: [{}],
    size: [0.44, 2.7, 0.44],
    current: {
        version: 1,
        notes: 'A black cone shade on a cord, a warm bulb.',
        build: (b, p) => {
            const [drop, H] = [p.drop as number, p.ceiling as number]
            const y = H - drop
            cyl(b, 0.004, 0.004, drop, 'metalBlack', 0, H - drop / 2, 0, 6)
            b.put(new CylinderGeometry(0.05, 0.22, 0.22, 40, 1, true), 'pendantShade', { y })
            b.put(new SphereGeometry(0.045, 16, 12), 'bulb', { y: y - 0.08, cast: false })
        },
    },
})

export const BOWL_LAMP = defineAsset({
    id: 'bowl-lamp',
    name: 'Bowl floor lamp',
    category: 'office',
    palette: 'office',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.4, 1.86, 0.4],
    current: {
        version: 1,
        notes: 'A white uplighter: a disc base, a pole, a glowing bowl.',
        build: b => {
            cyl(b, 0.15, 0.15, 0.02, 'plasticWhite', 0, 0.01, 0, 24)
            cyl(b, 0.012, 0.012, 1.75, 'plasticWhite', 0, 0.89, 0, 8)
            b.put(new CylinderGeometry(0.2, 0.05, 0.12, 32, 1, true), 'lampBowl', { y: 1.8 })
            b.put(new CircleGeometry(0.18, 24), 'bulb', { y: 1.83, rx: -Math.PI / 2, cast: false })
        },
    },
})

/** A structural pillar, square (with skirting) or round. */
export const PILLAR = defineAsset({
    id: 'pillar',
    name: 'Pillar',
    category: 'office',
    palette: 'office',
    defaults: { shape: 'square', width: 0.44, depth: 0.31, height: 2.7 },
    params: {
        shape: { label: 'Shape', options: ['square', 'round'] },
        width: { label: 'Width', min: 0.1, max: 1, step: 0.01 },
        depth: { label: 'Depth', min: 0.1, max: 1, step: 0.01 },
        height: { label: 'Height', min: 2.2, max: 4, step: 0.05 },
    },
    variants: [{}, { shape: 'round', width: 0.12 }],
    size: [0.44, 2.7, 0.31],
    current: {
        version: 1,
        notes: 'A plastered column, skirting at its foot; or a thin round one (`width` across).',
        build: (b, p) => {
            const [w, d, H] = [p.width as number, p.depth as number, p.height as number]
            if (p.shape === 'round') {
                cyl(b, w / 2, w / 2, H, 'pillar', 0, H / 2, 0, 16)
                return
            }
            box(b, w, H, d, 'pillar', 0, H / 2, 0)
            box(b, w + 0.02, 0.09, d + 0.02, 'baseboard', 0, 0.045, 0).userData.col = false
        },
    },
})

/** A ceiling light panel in the tile grid (the ceiling `ceiling` high). */
export const CEILING_PANEL = defineAsset({
    id: 'ceiling-panel',
    name: 'Ceiling light panel',
    category: 'office',
    palette: 'office',
    defaults: { ceiling: 2.7 },
    params: { ceiling: { label: 'Ceiling', min: 2.2, max: 4, step: 0.05 } },
    variants: [{}],
    size: [0.62, 2.7, 1.22],
    current: {
        version: 1,
        notes: 'A 60 × 120 glowing panel in a white frame.',
        build: (b, p) => {
            const H = p.ceiling as number
            box(b, 0.58, 0.02, 1.18, 'panel', 0, H - 0.01, 0, { cast: false, receive: false })
            box(b, 0.62, 0.015, 1.22, 'plasticWhite', 0, H - 0.004, 0, { cast: false, receive: false })
        },
    },
})

export const AIR_DIFFUSER = defineAsset({
    id: 'air-diffuser',
    name: 'Air diffuser',
    category: 'office',
    palette: 'office',
    defaults: { ceiling: 2.7 },
    params: { ceiling: { label: 'Ceiling', min: 2.2, max: 4, step: 0.05 } },
    variants: [{}],
    size: [0.58, 2.7, 0.58],
    current: {
        version: 1,
        notes: 'A square louvred vent in a ceiling tile.',
        build: (b, p) => {
            box(b, 0.58, 0.015, 0.58, 'diffuser', 0, (p.ceiling as number) - 0.008, 0, { cast: false, receive: false })
        },
    },
})

export const SPRINKLER = defineAsset({
    id: 'sprinkler',
    name: 'Sprinkler head',
    category: 'office',
    palette: 'office',
    defaults: { ceiling: 2.7 },
    params: { ceiling: { label: 'Ceiling', min: 2.2, max: 4, step: 0.05 } },
    variants: [{}],
    size: [0.07, 2.7, 0.07],
    current: {
        version: 1,
        notes: 'A chrome pendant sprinkler.',
        build: (b, p) => {
            const H = p.ceiling as number
            cyl(b, 0.02, 0.02, 0.03, 'chrome', 0, H - 0.015, 0, 10)
            cyl(b, 0.035, 0.035, 0.006, 'chrome', 0, H - 0.036, 0, 12)
        },
    },
})

/** A strip of LED light along the ceiling, `length` long (centred). */
export const LED_STRIP = defineAsset({
    id: 'led-strip',
    name: 'LED strip',
    category: 'office',
    palette: 'office',
    defaults: { length: 1, ceiling: 2.7 },
    params: {
        length: { label: 'Length', min: 0.2, max: 4, step: 0.05 },
        ceiling: { label: 'Ceiling', min: 2.2, max: 4, step: 0.05 },
    },
    variants: [{}],
    size: [1, 2.7, 0.02],
    current: {
        version: 1,
        notes: 'A thin glowing bar.',
        build: (b, p) => {
            const H = p.ceiling as number
            box(b, p.length as number, 0.008, 0.014, 'panel', 0, H - 0.006, 0, { cast: false, receive: false })
        },
    },
})

/** A lit EXIT sign over a door (its centre `at` high), facing +z. */
export const EXIT_SIGN = defineAsset({
    id: 'exit-sign',
    name: 'Exit sign',
    category: 'office',
    palette: 'office',
    defaults: { at: 2.3 },
    params: { at: { label: 'Height', min: 1.8, max: 3, step: 0.05 } },
    variants: [{}],
    size: [0.34, 2.4, 0.04],
    current: {
        version: 1,
        notes: 'A white box with a green glowing face.',
        build: (b, p) => {
            const y = p.at as number
            box(b, 0.34, 0.14, 0.04, 'plasticWhite', 0, y, 0)
            flat(b, 0.3, 0.11, 'exitSign', 0, y, 0.021)
        },
    },
})

// ---------------------------------------------------------------------------------------------
// Outside, two storeys down
// ---------------------------------------------------------------------------------------------

/** Lumpy canopy: a subdivided sphere pushed around by layered sines, darker underneath. */
function canopy(r: number, seed: number): BufferGeometry {
    const geo = new IcosahedronGeometry(r, 2)
    const pos = geo.attributes.position!
    const col: number[] = []
    const v = new Vector3()
    const k = rng(seed)
    const a = k() * 10
    const c = k() * 10
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize()
        const d =
            1 +
            0.16 * Math.sin(v.x * 5 + a) * Math.sin(v.y * 6 + c) +
            0.08 * Math.sin(v.z * 13 + v.x * 9) +
            0.05 * Math.sin(v.y * 21 + a)
        pos.setXYZ(i, v.x * r * d, v.y * r * d * 0.85, v.z * r * d)
        const shade = 0.55 + 0.45 * (v.y * 0.5 + 0.5) * (d - 0.8)
        col.push(0.27 * shade, 0.45 * shade, 0.17 * shade)
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3))
    geo.computeVertexNormals()
    return geo
}

/** A street tree seen from the office windows: a trunk and three lumpy green clumps. */
export const STREET_TREE = defineAsset({
    id: 'street-tree',
    name: 'Street tree (summer)',
    category: 'office',
    palette: 'office',
    defaults: { height: 4.5 },
    params: { height: { label: 'Trunk', min: 2.5, max: 7, step: 0.1 } },
    variants: [{}, { height: 3.5 }, { height: 6 }],
    size: [4, 8, 4],
    current: {
        version: 1,
        notes: 'A bark trunk, three lumpy canopy clumps shaded darker underneath.',
        build: (b, p) => {
            const h = p.height as number
            cyl(b, 0.12, 0.18, h + 0.6, 'bark', 0, (h + 0.6) / 2, 0, 10)
            for (let k = 0; k < 3; k++) {
                const geo = canopy(1.6 + b.R() * 0.9, Math.floor(b.R() * 1e6))
                b.put(geo, 'canopy', {
                    x: (b.R() - 0.5) * 1.6,
                    y: h + 0.8 + k * 0.7 + b.R() * 0.5,
                    z: (b.R() - 0.5) * 1.6,
                })
            }
        },
    },
})

const FACADES = { brick: 'facadeBrick', brick2: 'facadeBrick2', beige: 'facadeBeige', office: 'facadeOffice' } as const

/**
 * A city building across the street, `floors` × 3 m: red-brick apartments with balconies, a beige
 * low-rise, or glass offices with green awnings. Its street side faces `front`; standing on its
 * ground at y = 0, centred.
 */
export const CITY_BUILDING = defineAsset({
    id: 'city-building',
    name: 'City building',
    category: 'office',
    palette: 'office',
    defaults: { width: 20, depth: 14, floors: 5, style: 'brick', front: 'n' },
    params: {
        width: { label: 'Width (x)', min: 6, max: 30, step: 1 },
        depth: { label: 'Depth (z)', min: 6, max: 30, step: 1 },
        floors: { label: 'Floors', min: 2, max: 8, step: 1 },
        style: { label: 'Style', options: ['brick', 'brick2', 'beige', 'office'] },
        front: { label: 'Street side', options: ['n', 's', 'e', 'w'] },
    },
    variants: [
        { front: 's' },
        { style: 'office', floors: 4, width: 19, front: 's' },
        { style: 'beige', width: 6, floors: 3, front: 's' },
    ],
    size: [20, 16, 14],
    current: {
        version: 1,
        notes: 'A textured block (3 m bays), a roof slab and plant room, balconies or awnings on the street side.',
        build: (b, p) => {
            const [w, d, floors] = [p.width as number, p.depth as number, p.floors as number]
            const style = p.style as keyof typeof FACADES
            const h = floors * 3
            b.put(worldUV(new BoxGeometry(w, h, d), w, h, d), FACADES[style], { y: h / 2, cast: false })
            box(b, w + 0.3, 0.4, d + 0.3, 'cityRoof', 0, h + 0.2, 0)
            box(b, w * 0.2, 1.2, d * 0.2, 'cityRoof', w * 0.15, h + 0.9, -d * 0.1)
            const front = p.front as 'n' | 's' | 'e' | 'w'
            const along = front === 'n' || front === 's' ? w : d
            const n = Math.floor(along / 3)
            const out = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[front] as [number, number]
            const faceX = (out[0] * w) / 2
            const faceZ = (out[1] * d) / 2
            for (let i = 0; i < n; i++) {
                const t = -along / 2 + (i + 0.5) * (along / n)
                const px = out[0] ? faceX : t
                const pz = out[0] ? t : faceZ
                if (style === 'office') {
                    const tilt = (out[0] || out[1]) * -0.25
                    box(
                        b,
                        out[0] ? 0.9 : 2.6,
                        0.08,
                        out[0] ? 2.6 : 0.9,
                        'awning',
                        px + out[0] * 0.45,
                        3.1,
                        pz + out[1] * 0.45,
                        {
                            ...(out[0] ? { rz: tilt } : { rx: tilt }),
                        }
                    )
                }
                if ((style !== 'brick' && style !== 'brick2') || i % 2) continue
                for (let f = 1; f < floors; f++) {
                    const y = f * 3
                    box(
                        b,
                        out[0] ? 0.9 : 2.2,
                        0.12,
                        out[0] ? 2.2 : 0.9,
                        'balconySlab',
                        px + out[0] * 0.45,
                        y,
                        pz + out[1] * 0.45
                    )
                    box(
                        b,
                        out[0] ? 0.04 : 2.2,
                        0.9,
                        out[0] ? 2.2 : 0.04,
                        'balconyRail',
                        px + out[0] * 0.88,
                        y + 0.5,
                        pz + out[1] * 0.88
                    )
                }
            }
        },
    },
})

/** A distant tower on the skyline: a box of windows (one of three window patterns). */
export const SKYLINE_TOWER = defineAsset({
    id: 'skyline-tower',
    name: 'Skyline tower',
    category: 'office',
    palette: 'office',
    defaults: { width: 18, depth: 18, height: 30, windows: 0 },
    params: {
        width: { label: 'Width', min: 8, max: 30, step: 1 },
        depth: { label: 'Depth', min: 8, max: 30, step: 1 },
        height: { label: 'Height', min: 6, max: 60, step: 1 },
        windows: { label: 'Windows', options: [0, 1, 2] },
    },
    variants: [{}, { height: 50, windows: 1 }, { height: 12, windows: 2 }],
    size: [18, 30, 18],
    current: {
        version: 1,
        notes: 'A plain block with lit and dark windows, 12 × 22 m a texture tile.',
        build: (b, p) => {
            const [w, h, d] = [p.width as number, p.height as number, p.depth as number]
            const geo = new BoxGeometry(w, h, d)
            const uv = geo.attributes.uv!
            for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 12, (uv.getY(i) * h) / 22)
            b.put(geo, `skyline${p.windows}` as Mat, { y: h / 2, cast: false, receive: false })
        },
    },
})
