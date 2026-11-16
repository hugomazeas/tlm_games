import {
    CatmullRomCurve3,
    CylinderGeometry,
    ExtrudeGeometry,
    Shape,
    SphereGeometry,
    TorusGeometry,
    TubeGeometry,
    Vector3,
} from 'three'
import type { ErablesMaterial } from '../kit.ts'
import { place } from '../place.ts'
import { taperedBox } from '../shapes.ts'
import { defineAsset } from '../types.ts'
import { SHRUB } from './plants.ts'

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

/**
 * A ping-pong table, its length along x, the net across it at x = 0. Shared: the same table in
 * the office and in Rue des Érables' den.
 */
export const PING_PONG_TABLE = defineAsset({
    id: 'ping-pong-table',
    name: 'Ping-pong table',
    category: 'interior',
    palette: 'shared',
    defaults: { paddles: true },
    params: { paddles: { label: 'Paddles and ball', options: [true, false] } },
    variants: [{}, { paddles: false }],
    size: [2.8, 0.95, 1.9],
    current: {
        version: 3,
        notes: 'Your note on v2: the design was horrible, the net barely visible and floating with nothing holding it. Redrawn from your photo: a bright blue top on a black edge, white lines round it and down the middle, white guards on its four corners; at each end a black leg frame (two legs on a sledge foot arched in the middle); silver folding struts crossing under each half, the lower ones on casters; the net a dark blue mesh you can see from across the room, its white tape on top, held by two black posts clamped to the table’s sides. Paddles and a ball (a parameter).',
        build(b, p) {
            const L = 2.74
            const W = 1.525
            const H = 0.76
            const edge = H - 0.05
            const thin = { collide: false, cast: false }
            // The top: two halves (a hair apart under the net), a thin blue face on a black edge.
            for (const s of [-1, 1]) {
                b.box('pingPongFrame', s * 0.002, edge, -W / 2, (s * L) / 2, H - 0.006, W / 2)
                b.box('pingPongTop', s * 0.002, H - 0.006, -W / 2, (s * L) / 2, H, W / 2, { cast: false })
            }
            // Its white lines (1.5 mm proud): 2 cm round the edges, 3 mm down the middle.
            const line = (x0: number, z0: number, x1: number, z1: number) =>
                b.box('pingPongLines', x0, H, z0, x1, H + 0.0015, z1, thin)
            for (const s of [-1, 1]) {
                line(-L / 2, s * (W / 2 - 0.02), L / 2, (s * W) / 2)
                line(s * (L / 2 - 0.02), -W / 2, (s * L) / 2, W / 2)
                line(s * 0.002, -0.0015, (s * L) / 2, 0.0015)
            }
            // White guards on the corners: a triangle wrapping each, a little proud of the top and edge.
            const guard = new Shape()
            guard.moveTo(0, 0)
            guard.lineTo(0.1, 0)
            guard.lineTo(0, 0.1)
            guard.closePath()
            const wedge = new ExtrudeGeometry(guard, { depth: 0.058, bevelEnabled: false }).rotateX(Math.PI / 2)
            for (const [sx, sz, ry] of [
                [1, 1, Math.PI],
                [-1, 1, Math.PI / 2],
                [1, -1, -Math.PI / 2],
                [-1, -1, 0],
            ] as const)
                b.put(wedge.clone(), 'pingPongLines', {
                    x: sx * (L / 2 + 0.004),
                    y: H + 0.003,
                    z: sz * (W / 2 + 0.004),
                    ry,
                    ...thin,
                })
            // At each end, a black leg frame: two legs, a rail under the top between them, the sledge
            // foot arched in the middle. Under each half, silver struts on both sides: one from the
            // leg up under the middle, one from the leg down to a caster, an axle between the casters.
            const legX = L / 2 - 0.32
            const legZ = W / 2 - 0.1
            const wheelX = 0.55
            for (const s of [-1, 1]) {
                const x = s * legX
                for (const z of [-legZ, legZ]) b.box('pingPongFrame', x - 0.02, 0.1, z - 0.02, x + 0.02, edge, z + 0.02)
                b.box('pingPongFrame', x - 0.02, edge - 0.05, -legZ, x + 0.02, edge, legZ, thin)
                const foot = new CatmullRomCurve3(
                    [
                        [-legZ, 0.12],
                        [-legZ + 0.1, 0.024],
                        [0, 0.16],
                        [legZ - 0.1, 0.024],
                        [legZ, 0.12],
                    ].map(([z, y]) => new Vector3(x, y!, z!))
                )
                b.put(new TubeGeometry(foot, 48, 0.022, 8), 'pingPongFrame', { collide: false })
                for (const z of [-(legZ - 0.05), legZ - 0.05]) {
                    b.rod('pingPongStrut', new Vector3(x, 0.32, z), new Vector3(s * 0.16, edge - 0.01, z), 0.015, thin)
                    b.rod('pingPongStrut', new Vector3(x, 0.5, z), new Vector3(s * wheelX, 0.075, z), 0.015, thin)
                    b.box(
                        'pingPongStrut',
                        s * wheelX - 0.02,
                        0.055,
                        z - 0.022,
                        s * wheelX + 0.02,
                        0.085,
                        z + 0.022,
                        thin
                    )
                    b.put(new CylinderGeometry(0.035, 0.035, 0.028, 14).rotateX(Math.PI / 2), 'caster', {
                        x: s * wheelX,
                        y: 0.035,
                        z: z + (z > 0 ? 0.03 : -0.03),
                        ...thin,
                    })
                }
                b.rod(
                    'pingPongStrut',
                    new Vector3(s * wheelX, 0.075, -(legZ - 0.05)),
                    new Vector3(s * wheelX, 0.075, legZ - 0.05),
                    0.012,
                    thin
                )
            }
            // The net: a black post clamped to each side (a block under the edge, a jaw up its side,
            // the post on it, a knob to tighten it), the dark mesh between them, the white tape on top.
            const post = W / 2 + 0.035
            for (const t of [-1, 1]) {
                b.box('pingPongFrame', -0.025, edge - 0.03, t * (W / 2 - 0.07), 0.025, edge, t * (W / 2 + 0.055), thin)
                b.box(
                    'pingPongFrame',
                    -0.025,
                    edge - 0.03,
                    t * (W / 2 + 0.012),
                    0.025,
                    H + 0.012,
                    t * (W / 2 + 0.055),
                    thin
                )
                b.box('pingPongFrame', -0.022, H, t * (post - 0.018), 0.022, H + 0.1525, t * (post + 0.018), thin)
                b.put(new CylinderGeometry(0.014, 0.014, 0.03, 10).rotateX(Math.PI / 2), 'pingPongStrut', {
                    y: edge - 0.015,
                    z: t * (W / 2 + 0.07),
                    ...thin,
                })
            }
            b.box('pingPongMesh', -0.002, H + 0.004, -(post - 0.018), 0.002, H + 0.138, post - 0.018, thin)
            b.box('pingPongLines', -0.004, H + 0.138, -(post - 0.018), 0.004, H + 0.1525, post - 0.018, thin)
            if (!p.paddles) return
            // Two paddles on the table and the ball.
            for (const [x, z, ry] of [
                [0.75, 0.32, 0.5],
                [-0.95, -0.4, 2.6],
            ] as const) {
                const g = b.group(x, H + 0.002, z, ry)
                const blade = new CylinderGeometry(0.075, 0.075, 0.012, 24).scale(1, 1, 1.08)
                b.put(blade, 'paddleRubber', { parent: g, y: 0.006, ...thin })
                b.box('paddleHandle', -0.014, 0, 0.07, 0.014, 0.022, 0.17, { parent: g, ...thin })
            }
            b.put(new SphereGeometry(0.02, 12, 8), 'pingPongLines', { x: 0.35, y: H + 0.022, z: -0.25, ...thin })
        },
    },
})

/** A table lamp: a base, a stem, a lit shade. */
export const TABLE_LAMP = defineAsset({
    id: 'table-lamp',
    name: 'Table lamp',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.3, 0.5, 0.3],
    current: {
        version: 1,
        notes: 'A dark round base, a thin stem, a glowing drum shade.',
        build(b) {
            const thin = { collide: false, cast: false }
            b.cyl('metalDark', 0.07, 0.075, 0.025, 0, 0, 0, 14, thin)
            b.cyl('metalDark', 0.011, 0.011, 0.3, 0, 0.025, 0, 6, thin)
            b.cyl('lamp', 0.1, 0.14, 0.17, 0, 0.27, 0, 18, thin)
        },
    },
})

/** A side table or nightstand: a drawer, its pull, a lamp on it or not. */
export const SIDE_TABLE = defineAsset({
    id: 'side-table',
    name: 'Side table / nightstand',
    category: 'interior',
    defaults: { finish: 'cabinetWood', lamp: true },
    params: { finish: { label: 'Finish', options: WOODS }, lamp: { label: 'Lamp', options: [true, false] } },
    variants: [{}, { finish: 'cabinetWhite', lamp: false }],
    size: [0.46, 1.0, 0.4],
    current: {
        version: 1,
        notes: 'A small cabinet with a drawer and its pull, a table lamp on top.',
        build(b, p) {
            const finish = p.finish as ErablesMaterial
            const thin = { collide: false, cast: false }
            b.box(finish, -0.23, 0.04, -0.2, 0.23, 0.55, 0.2)
            for (const x of [-0.2, 0.2])
                for (const z of [-0.17, 0.17]) b.box(finish, x - 0.02, 0, z - 0.02, x + 0.02, 0.04, z + 0.02, thin)
            b.box('metalDark', -0.21, 0.36, 0.2, 0.21, 0.365, 0.203, thin)
            b.box('chrome', -0.05, 0.44, 0.2, 0.05, 0.455, 0.22, thin)
            if (p.lamp) place(b, TABLE_LAMP, {}, { y: 0.55, z: -0.03 })
        },
    },
})

/** A wardrobe against a wall at its back (z = 0 behind it), two doors toward +z. */
export const WARDROBE = defineAsset({
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'interior',
    defaults: { finish: 'cabinetWhite', width: 1.0 },
    params: { finish: { label: 'Finish', options: WOODS }, width: { label: 'Width', min: 0.6, max: 2, step: 0.1 } },
    variants: [{}, { finish: 'cabinetWood', width: 1.4 }],
    size: [1.0, 2.05, 0.6],
    current: {
        version: 1,
        notes: 'A tall cabinet on a plinth, two doors with long pulls, a cornice.',
        build(b, p) {
            const finish = p.finish as ErablesMaterial
            const w = (p.width as number) / 2
            const thin = { collide: false, cast: false }
            b.box(finish, -w, 0.06, -0.3, w, 1.98, 0.3)
            b.box('metalDark', -w + 0.02, 0, -0.27, w - 0.02, 0.06, 0.27, thin)
            b.box(finish, -w - 0.015, 1.98, -0.315, w + 0.015, 2.03, 0.315, { collide: false })
            b.box('metalDark', -0.003, 0.08, 0.3, 0.003, 1.96, 0.302, thin)
            for (const s of [-1, 1]) b.box('chrome', s * 0.05 - 0.008, 0.85, 0.3, s * 0.05 + 0.008, 1.25, 0.32, thin)
        },
    },
})

/** A sideboard (buffet): low cupboards on legs, against a wall at its back, its doors toward +z. */
export const SIDEBOARD = defineAsset({
    id: 'sideboard',
    name: 'Sideboard',
    category: 'interior',
    defaults: { finish: 'cabinetWood', length: 1.6 },
    params: {
        finish: { label: 'Finish', options: WOODS },
        length: { label: 'Length', min: 1, max: 2.4, step: 0.1 },
    },
    variants: [{}, { finish: 'cabinetWhite', length: 1.2 }],
    size: [1.6, 0.8, 0.45],
    current: {
        version: 1,
        notes: 'Three doors with round pulls over four tapered legs, the top a little proud.',
        build(b, p) {
            const finish = p.finish as ErablesMaterial
            const l = (p.length as number) / 2
            const thin = { collide: false, cast: false }
            for (const x of [-l + 0.06, l - 0.06])
                for (const z of [-0.16, 0.16]) b.cyl(finish, 0.02, 0.012, 0.16, x, 0, z, 6, thin)
            b.box(finish, -l, 0.16, -0.22, l, 0.76, 0.22)
            b.box(finish, -l - 0.01, 0.76, -0.23, l + 0.01, 0.79, 0.23, { collide: false })
            const door = (2 * l) / 3
            for (let i = 0; i < 3; i++) {
                const seam = -l + i * door
                if (i > 0) b.box('metalDark', seam - 0.002, 0.19, 0.22, seam + 0.002, 0.73, 0.222, thin)
                const pull = new CylinderGeometry(0.014, 0.014, 0.02, 8).rotateX(Math.PI / 2)
                b.put(pull, 'chrome', { x: seam + door / 2, y: 0.6, z: 0.23, ...thin })
            }
        },
    },
})

/** A bar stool (at a kitchen island): a round seat on four splayed legs, a footrest ring. */
export const BAR_STOOL = defineAsset({
    id: 'bar-stool',
    name: 'Bar stool',
    category: 'interior',
    defaults: { seat: 'wood' },
    params: { seat: { label: 'Seat', options: ['wood', 'sofa', 'metalDark'] } },
    variants: [{}, { seat: 'sofa' }],
    size: [0.4, 0.72, 0.4],
    current: {
        version: 1,
        notes: 'A round seat, four splayed black legs, a footrest ring.',
        build(b, p) {
            const thin = { collide: false, cast: false }
            b.cyl(p.seat as ErablesMaterial, 0.17, 0.16, 0.05, 0, 0.66, 0, 18)
            for (let i = 0; i < 4; i++) {
                const a = Math.PI / 4 + (i * Math.PI) / 2
                b.rod(
                    'metalDark',
                    new Vector3(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19),
                    new Vector3(Math.cos(a) * 0.11, 0.66, Math.sin(a) * 0.11),
                    0.012,
                    thin
                )
            }
            b.put(new TorusGeometry(0.155, 0.009, 6, 20).rotateX(Math.PI / 2), 'metalDark', { y: 0.26, ...thin })
        },
    },
})

/** A sink set in a counter whose top is at y = 0, its tap at the back (-z). */
export const KITCHEN_SINK = defineAsset({
    id: 'kitchen-sink',
    name: 'Kitchen sink',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.62, 0.35, 0.46],
    current: {
        version: 1,
        notes: 'A steel rim, the basin’s shadowed floor, a gooseneck tap and its lever.',
        build(b) {
            const thin = { collide: false, cast: false }
            b.box('steel', -0.31, 0, -0.22, 0.31, 0.006, 0.22, thin)
            b.box('metalDark', -0.27, 0.0062, -0.17, 0.27, 0.0068, 0.19, thin)
            b.cyl('chrome', 0.022, 0.026, 0.03, 0, 0.006, -0.2, 10, thin)
            b.rod('chrome', new Vector3(0, 0.03, -0.2), new Vector3(0, 0.3, -0.19), 0.012, thin)
            b.rod('chrome', new Vector3(0, 0.3, -0.19), new Vector3(0, 0.27, -0.03), 0.011, thin)
            b.box('chrome', 0.03, 0.08, -0.215, 0.13, 0.095, -0.2, thin)
        },
    },
})

/** A microwave on a counter, its door toward +z. */
export const MICROWAVE = defineAsset({
    id: 'microwave',
    name: 'Microwave',
    category: 'interior',
    defaults: {},
    params: {},
    variants: [{}],
    size: [0.5, 0.3, 0.38],
    current: {
        version: 1,
        notes: 'A white box, a dark window in its door, the keypad beside it.',
        build(b) {
            const thin = { collide: false, cast: false }
            b.box('paintWhite', -0.25, 0.01, -0.19, 0.25, 0.3, 0.19)
            b.box('carGlass', -0.22, 0.05, 0.19, 0.1, 0.26, 0.195, thin)
            b.box('metalDark', 0.13, 0.04, 0.19, 0.23, 0.27, 0.195, thin)
            for (const x of [-0.2, 0.2]) b.box('rubber', x - 0.02, 0, -0.15, x + 0.02, 0.01, 0.15, thin)
        },
    },
})

/** A houseplant in its pot: a leafy bush, or a tall one on a stem. */
export const HOUSEPLANT = defineAsset({
    id: 'houseplant',
    name: 'Houseplant',
    category: 'interior',
    defaults: { tall: false, pot: 'paintWhite' },
    params: {
        tall: { label: 'Tall', options: [false, true] },
        pot: { label: 'Pot', options: ['paintWhite', 'pumpkin', 'metalDark'] },
    },
    variants: [{}, { tall: true, pot: 'metalDark' }],
    size: [0.6, 1.4, 0.6],
    current: {
        version: 1,
        notes: 'A tapered pot with its soil, a round leafy bush (a second one up a stem when tall).',
        build(b, p) {
            b.cyl(p.pot as ErablesMaterial, 0.17, 0.13, 0.3, 0, 0, 0, 16)
            b.cyl('soil', 0.155, 0.155, 0.01, 0, 0.28, 0, 16, { collide: false, cast: false })
            if (p.tall) {
                b.cyl('bark', 0.018, 0.024, 0.75, 0, 0.29, 0, 6, { collide: false })
                place(b, SHRUB, { radius: 0.22 }, { y: 0.28 })
                place(b, SHRUB, { radius: 0.27 }, { y: 0.85 })
            } else place(b, SHRUB, { radius: 0.3 }, { y: 0.26 })
        },
    },
})

/** A front-loading washer or dryer against a wall, its door toward +z. */
export const WASHER = defineAsset({
    id: 'washer',
    name: 'Washer / dryer',
    category: 'interior',
    defaults: { kind: 'washer' },
    params: { kind: { label: 'Kind', options: ['washer', 'dryer'] } },
    variants: [{}, { kind: 'dryer' }],
    size: [0.6, 0.86, 0.62],
    current: {
        version: 1,
        notes: 'A white cabinet, the control strip on top with its dial, a round chrome-rimmed door (glass on the washer).',
        build(b, p) {
            const thin = { collide: false, cast: false }
            b.box('paintWhite', -0.3, 0.02, -0.3, 0.3, 0.86, 0.3)
            b.box('metalDark', -0.29, 0.72, 0.3, 0.29, 0.82, 0.303, thin)
            b.put(new CylinderGeometry(0.03, 0.03, 0.02, 14).rotateX(Math.PI / 2), 'chrome', {
                x: 0.18,
                y: 0.77,
                z: 0.31,
                ...thin,
            })
            b.put(new TorusGeometry(0.17, 0.022, 8, 28), 'chrome', { y: 0.38, z: 0.305, ...thin })
            const door = p.kind === 'washer' ? 'carGlass' : 'paintWhite'
            b.put(new CylinderGeometry(0.155, 0.155, 0.01, 28).rotateX(Math.PI / 2), door, {
                y: 0.38,
                z: 0.302,
                ...thin,
            })
            for (const x of [-0.25, 0.25]) b.box('rubber', x - 0.03, 0, -0.25, x + 0.03, 0.02, 0.25, thin)
        },
    },
})

/** A standing coat rack, coats and a scarf on its hooks. */
export const COAT_RACK = defineAsset({
    id: 'coat-rack',
    name: 'Coat rack',
    category: 'interior',
    defaults: { coats: 3 },
    params: { coats: { label: 'Coats', min: 0, max: 4, step: 1 } },
    variants: [{}, { coats: 1 }],
    size: [0.6, 1.8, 0.6],
    current: {
        version: 1,
        notes: 'A round base, a dark pole, hooks round its top, coats hanging from them.',
        build(b, p) {
            const thin = { collide: false, cast: false }
            b.cyl('metalDark', 0.2, 0.22, 0.03, 0, 0, 0, 16, { collide: false })
            b.cyl('metalDark', 0.016, 0.016, 1.72, 0, 0.03, 0, 8, { collide: false })
            const coats = ['sofaGreen', 'paintRed', 'bedding', 'paintBlue'] as const
            for (let i = 0; i < 4; i++) {
                const a = (i * Math.PI) / 2 + 0.4
                const [cx, cz] = [Math.cos(a), Math.sin(a)]
                b.rod('metalDark', new Vector3(0, 1.62, 0), new Vector3(cx * 0.14, 1.7, cz * 0.14), 0.008, thin)
                if (i >= (p.coats as number)) continue
                // A coat: hung by its collar, its body falling from the hook.
                const g = b.group(cx * 0.16, 0, cz * 0.16, -a + Math.PI / 2)
                b.put(taperedBox(0.36, 0.14, 0.3, 0.1, 0.72, 0.04, {}), coats[i]!, {
                    parent: g,
                    y: 0.78,
                    collide: false,
                })
                b.put(taperedBox(0.3, 0.1, 0.4, 0.13, 0.12, 0.05), coats[i]!, { parent: g, y: 1.5, ...thin })
            }
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
