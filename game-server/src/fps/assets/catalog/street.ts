import { CylinderGeometry, TorusGeometry, Vector3 } from 'three'
import type { ErablesMaterial } from '../kit.ts'
import { defineAsset } from '../types.ts'

/** A wooden utility pole: crossarm and insulators, a transformer, a street light reaching toward +z. */
export const UTILITY_POLE = defineAsset({
    id: 'utility-pole',
    name: 'Utility pole and street light',
    category: 'street',
    defaults: { light: true },
    params: { light: { label: 'Street light', options: [true, false] } },
    variants: [{}],
    size: [2.4, 10.6, 3.2],
    current: {
        version: 1,
        notes: 'A tapered pole, a crossarm with three insulators, a transformer drum, an arm with a cobra head.',
        build(b) {
            b.pole(0, 0, 0, 1)
        },
    },
})

/** A fire hydrant, red with a white cap. */
export const HYDRANT = defineAsset({
    id: 'hydrant',
    name: 'Fire hydrant',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.5, 0.8, 0.5],
    current: {
        version: 1,
        notes: 'A tapered body, a cap, a nozzle bar across.',
        build(b) {
            b.cyl('signRed', 0.13, 0.15, 0.62, 0, 0, 0, 12)
            b.cyl('paintWhite', 0.1, 0.13, 0.16, 0, 0.62, 0, 12, { collide: false })
            b.box('signRed', -0.2, 0.38, -0.05, 0.2, 0.46, 0.05, { collide: false, cast: false })
        },
    },
})

/** A sign on a post, facing +z: the street's name, a stop sign. */
export const STREET_SIGN = defineAsset({
    id: 'street-sign',
    name: 'Street sign',
    category: 'street',
    defaults: { sign: 'name' },
    params: { sign: { label: 'Sign', options: ['name', 'stop'] } },
    variants: [{}, { sign: 'stop' }],
    size: [1.3, 2.7, 0.2],
    current: {
        version: 1,
        notes: 'A round post, a flat board with its face painted.',
        build(b, p) {
            const [mat, w, h, top] =
                p.sign === 'stop' ? (['stopSign', 0.75, 0.75, 2.1] as const) : (['signBlue', 1.3, 0.3, 2.6] as const)
            b.cyl('paintSilver', 0.035, 0.035, top, 0, 0, 0, 8)
            b.box(mat, -w / 2, top - h, 0.04, w / 2, top, 0.07, { collide: false })
        },
    },
})

/** A community mailbox (boîtes postales communautaires), its doors toward +z. */
export const MAILBOXES = defineAsset({
    id: 'mailboxes',
    name: 'Community mailboxes',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.7, 1.45, 0.65],
    current: {
        version: 1,
        notes: 'A grey cabinet, four door outlines, a roof slab.',
        build(b) {
            b.block('paintSilver', 1.6, 1.35, 0.55, 0, 0, 0)
            for (let i = 0; i < 4; i++)
                b.box('metalDark', -0.65 + i * 0.4, 0.3, 0.27, -0.35 + i * 0.4, 1.2, 0.29, {
                    collide: false,
                    cast: false,
                })
            b.block('metalDark', 1.7, 0.08, 0.65, 0, 1.35, 0, { collide: false })
        },
    },
})

/** A concrete jersey barrier, 3 m along z. */
export const JERSEY_BARRIER = defineAsset({
    id: 'jersey-barrier',
    name: 'Jersey barrier',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.6, 0.85, 3],
    current: {
        version: 1,
        notes: 'An extruded profile with a reflective stripe each side.',
        build: b => b.jersey(0, 0, 0, 0),
    },
})

export const TRAFFIC_CONE = defineAsset({
    id: 'traffic-cone',
    name: 'Traffic cone',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.4, 0.65, 0.4],
    current: { version: 1, notes: 'A base, a cone, a white band.', build: b => b.cone(0, 0, 0) },
})

/** A "Rue barrée" board, facing +z (on a barrier, or the hoarding). */
export const ROAD_CLOSED_SIGN = defineAsset({
    id: 'road-closed-sign',
    name: 'Road closed sign',
    category: 'street',
    defaults: { height: 0.82 },
    params: { height: { label: 'Bottom at', min: 0, max: 1.5, step: 0.05 } },
    variants: [{}],
    size: [1.2, 1.5, 0.1],
    current: {
        version: 1,
        notes: 'A striped board.',
        build(b, p) {
            const y = p.height as number
            b.box('signRoad', -0.6, y, -0.03, 0.6, y + 0.6, 0.03, { collide: false })
        },
    },
})

/** A plywood site hoarding along x, 2.4 m high, posts on its +z side. */
export const HOARDING = defineAsset({
    id: 'hoarding',
    name: 'Site hoarding',
    category: 'street',
    defaults: { length: 8 },
    params: { length: { label: 'Length', min: 2, max: 20, step: 0.5 } },
    variants: [{}],
    size: [8, 2.5, 0.2],
    current: {
        version: 1,
        notes: 'A plywood wall and five posts.',
        build(b, p) {
            const l = p.length as number
            b.box('wood', -l / 2, 0, -0.05, l / 2, 2.4, 0.05)
            for (let i = 0; i <= 4; i++)
                b.box('trim', -l / 2 + (l * i) / 4 - 0.06, 0, -0.08, -l / 2 + (l * i) / 4 + 0.06, 2.5, 0.08, {
                    collide: false,
                })
        },
    },
})

/** The orange site fence across a closed street (drawn only: a map's invisible wall stops you there). */
export const SITE_FENCE = defineAsset({
    id: 'site-fence',
    name: 'Site fence',
    category: 'street',
    defaults: { length: 9 },
    params: { length: { label: 'Length', min: 2, max: 20, step: 0.5 } },
    variants: [{}],
    size: [9, 1.2, 0.3],
    current: {
        version: 1,
        notes: 'An orange panel on concrete feet.',
        build(b, p) {
            const l = p.length as number
            b.box('cone', -l / 2, 0, -0.02, l / 2, 1.2, 0.02, { collide: false, cast: false })
            for (let x = -l / 2; x <= l / 2 + 0.01; x += 1.5)
                b.block('concrete', 0.25, 0.15, 0.5, x, 0, 0, { collide: false })
        },
    },
})

/** A wheeled bin: recycling (blue), compost (brown), garbage (grey). Its wheels toward +z. */
export const BIN = defineAsset({
    id: 'bin',
    name: 'Wheeled bin',
    category: 'street',
    defaults: { kind: 'recycling' },
    params: { kind: { label: 'Kind', options: ['recycling', 'compost', 'garbage'] } },
    variants: [{}, { kind: 'compost' }, { kind: 'garbage' }],
    size: [0.75, 1.05, 0.85],
    current: {
        version: 1,
        notes: 'A tapered square body, a lid, two wheels.',
        build(b, p) {
            const mat = ({ recycling: 'binBlue', compost: 'binBrown', garbage: 'binGrey' } as const)[
                p.kind as 'recycling'
            ]
            b.bin(mat, 0, 0, 0, 0)
        },
    },
})

export const LEAF_BAG = defineAsset({
    id: 'leaf-bag',
    name: 'Leaf bag',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.45, 0.9, 0.35],
    current: { version: 1, notes: 'A kraft paper box, its top folded.', build: b => b.leafBag(0, 0, 0, 0) },
})

/** A street-hockey net, its mouth toward +z, a ball and a stick in front. */
export const HOCKEY_NET = defineAsset({
    id: 'hockey-net',
    name: 'Street-hockey net',
    category: 'street',
    defaults: { gear: true },
    params: { gear: { label: 'Ball and stick', options: [true, false] } },
    variants: [{}],
    size: [1.9, 1.25, 2.4],
    current: {
        version: 1,
        notes: 'Red tube posts and frame, a white net.',
        build(b, p) {
            for (const s of [-1, 1]) b.rod('paintRed', new Vector3(s * 0.9, 0, 0), new Vector3(s * 0.9, 1.2, 0), 0.035)
            b.rod('paintRed', new Vector3(-0.9, 1.2, 0), new Vector3(0.9, 1.2, 0), 0.035, { collide: false })
            b.rod('paintRed', new Vector3(-0.9, 0.02, -0.8), new Vector3(0.9, 0.02, -0.8), 0.03, { collide: false })
            for (const s of [-1, 1])
                b.rod('paintRed', new Vector3(s * 0.9, 1.2, 0), new Vector3(s * 0.9, 0.02, -0.8), 0.03, {
                    collide: false,
                })
            b.box('net', -0.9, 0.02, -0.8, 0.9, 1.2, -0.02, { collide: false, cast: false })
            if (!p.gear) return
            b.cyl('paintWhite', 0.035, 0.035, 0.07, 0.3, 0, 1.0, 10, { collide: false, cast: false })
            b.rod('wood', new Vector3(-0.6, 0.02, 1.4), new Vector3(0.4, 0.4, 2.2), 0.02, { collide: false })
        },
    },
})

/** A portable basketball hoop, its rim toward +z. */
export const BASKETBALL_HOOP = defineAsset({
    id: 'basketball-hoop',
    name: 'Portable basketball hoop',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.8, 4.1, 0.9],
    current: {
        version: 1,
        notes: 'A weighted base, a pole, a backboard, a rim.',
        build(b) {
            b.block('binGrey', 1.0, 0.5, 0.7, 0, 0, 0)
            b.cyl('metalDark', 0.06, 0.06, 3.0, 0, 0.5, -0.15, 8)
            b.box('paintWhite', -0.9, 2.9, -0.16, 0.9, 3.95, -0.1, { collide: false })
            b.put(new TorusGeometry(0.23, 0.015, 6, 18).rotateX(Math.PI / 2), 'signRed', {
                y: 3.05,
                z: 0.15,
                collide: false,
                cast: false,
            })
        },
    },
})

/** Concrete pipes stacked three and two, along z. */
export const PIPE_STACK = defineAsset({
    id: 'pipe-stack',
    name: 'Stack of concrete pipes',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [2.8, 1.7, 2.4],
    current: {
        version: 1,
        notes: 'Five cylinders.',
        build(b) {
            for (const [x, y] of [
                [-0.9, 0],
                [0, 0],
                [0.9, 0],
                [-0.45, 0.78],
                [0.45, 0.78],
            ] as const) {
                b.put(new CylinderGeometry(0.45, 0.45, 2.4, 16).rotateX(Math.PI / 2), 'concrete', { x, y: y + 0.45 })
            }
        },
    },
})

export const PORTA_POTTY = defineAsset({
    id: 'porta-potty',
    name: 'Portable toilet',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.1, 2.3, 1.1],
    current: { version: 1, notes: 'A blue box.', build: b => void b.block('binBlue', 1.1, 2.3, 1.1, 0, 0, 0) },
})

export const LIGHT_TOWER = defineAsset({
    id: 'light-tower',
    name: 'Light tower',
    category: 'street',
    defaults: {},
    params: {},
    variants: [{}],
    size: [1.4, 5.7, 2.0],
    current: {
        version: 1,
        notes: 'A trailer box, a mast, a lamp bar.',
        build(b) {
            b.block('machine', 1.2, 1.0, 2.0, 0, 0, 0)
            b.cyl('metalDark', 0.06, 0.06, 4.5, 0, 1.0, 0, 8, { collide: false })
            b.box('lamp', -0.7, 5.3, -0.1, 0.7, 5.7, 0.1, { collide: false })
        },
    },
})

export const GRAVEL_PILE = defineAsset({
    id: 'gravel-pile',
    name: 'Gravel pile',
    category: 'street',
    defaults: { radius: 1.7 },
    params: { radius: { label: 'Radius', min: 0.8, max: 3, step: 0.1 } },
    variants: [{}],
    size: [3.4, 1.2, 3.4],
    current: {
        version: 1,
        notes: 'A cone of gravel.',
        build(b, p) {
            const r = p.radius as number
            b.put(new CylinderGeometry(0.1, r, r * 0.7, 14).translate(0, r * 0.35, 0), 'gravel')
        },
    },
})

/** For the material type in other catalogues. */
export type { ErablesMaterial }
