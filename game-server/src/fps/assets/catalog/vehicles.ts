import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    ExtrudeGeometry,
    Float32BufferAttribute,
    type Group,
    Shape,
    TorusGeometry,
    Vector3,
} from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Builder, ErablesMaterial } from '../kit.ts'
import { defineAsset } from '../types.ts'

const PAINTS = ['paintRed', 'paintBlue', 'paintSilver', 'paintWhite', 'paintGreen'] as const

type Pt = readonly [number, number]
interface CarSpec {
    length: number
    width: number
    /** Front and rear axles (x), the wheels' radius. */
    axles: readonly [number, number]
    wheel: number
    /** The body to the beltline, in side profile (x forward, y up). */
    body: readonly Pt[]
    /** The glasshouse over the beltline (its outline: windshield foot, its top, the roof's back, the rear glass's foot). */
    cabin: readonly [Pt, Pt, Pt, Pt]
    /** Where the doors' rear edges fall (x), and the B/C pillars (x along the glasshouse). */
    doors: readonly number[]
    pillars: readonly number[]
    /** Height of the lights' middle at the front and back. */
    lights: number
    /** An open box behind the cab (a pickup's), from x to x. */
    bed?: readonly [number, number]
}

const CARS: Record<'sedan' | 'hatch' | 'minivan' | 'pickup', CarSpec> = {
    sedan: {
        length: 4.75,
        width: 1.82,
        axles: [1.43, -1.38],
        wheel: 0.33,
        body: [
            [-2.37, 0.3],
            [2.28, 0.3],
            [2.38, 0.42],
            [2.4, 0.62],
            [2.3, 0.8],
            [1.02, 0.92],
            [-1.75, 0.95],
            [-2.3, 0.9],
            [-2.4, 0.7],
            [-2.4, 0.45],
        ],
        cabin: [
            [1.05, 0.9],
            [0.32, 1.4],
            [-0.95, 1.44],
            [-1.8, 0.93],
        ],
        doors: [1.0, -0.22, -1.3],
        pillars: [-0.24],
        lights: 0.7,
    },
    hatch: {
        length: 4.2,
        width: 1.78,
        axles: [1.3, -1.28],
        wheel: 0.32,
        body: [
            [-2.08, 0.3],
            [2.02, 0.3],
            [2.12, 0.45],
            [2.12, 0.62],
            [1.95, 0.82],
            [0.92, 0.92],
            [-2.02, 0.98],
            [-2.12, 0.8],
            [-2.12, 0.45],
        ],
        cabin: [
            [0.95, 0.9],
            [0.32, 1.42],
            [-1.62, 1.46],
            [-2.05, 0.98],
        ],
        doors: [0.92, -0.35, -1.45],
        pillars: [-0.36],
        lights: 0.72,
    },
    minivan: {
        length: 5.1,
        width: 1.98,
        axles: [1.6, -1.5],
        wheel: 0.35,
        body: [
            [-2.55, 0.32],
            [2.45, 0.32],
            [2.55, 0.5],
            [2.56, 0.75],
            [2.35, 0.97],
            [1.35, 1.08],
            [-2.48, 1.1],
            [-2.56, 0.92],
            [-2.56, 0.5],
        ],
        cabin: [
            [1.38, 1.06],
            [0.62, 1.7],
            [-2.32, 1.74],
            [-2.5, 1.08],
        ],
        doors: [1.3, 0.25, -1.1, -2.48],
        pillars: [0.2, -1.12],
        lights: 0.82,
    },
    pickup: {
        length: 5.6,
        width: 2.0,
        axles: [1.75, -1.75],
        wheel: 0.4,
        body: [
            [-2.8, 0.45],
            [2.7, 0.45],
            [2.82, 0.65],
            [2.83, 0.98],
            [2.62, 1.15],
            [1.25, 1.2],
            [-0.7, 1.22],
            [-2.8, 1.22],
            [-2.82, 0.95],
            [-2.82, 0.6],
        ],
        cabin: [
            [1.22, 1.18],
            [0.85, 1.86],
            [-0.5, 1.89],
            [-0.66, 1.2],
        ],
        doors: [1.18, -0.12],
        pillars: [],
        lights: 0.95,
        bed: [-2.75, -0.78],
    },
}

/**
 * A car, version 2: the body to the beltline and a narrower glasshouse over it (tumblehome), its
 * pillars and roof in the paint; black arches round the wheels; tyres with spoked rims and hubs;
 * a grille, headlights and tail lights, plates, bumpers, door seams and handles, mirrors, wipers.
 * Faces +x here (the asset turns it to +z).
 */
function carV2(b: Builder, kind: keyof typeof CARS, paint: ErablesMaterial, hazards: boolean): Group {
    const s = CARS[kind]
    const g = b.group(0, 0, 0, -Math.PI / 2)
    const W = s.width
    const half = W / 2
    const extrude = (points: readonly Pt[], width: number, mat: ErablesMaterial, bevel: number, collide = true) => {
        const shape = new Shape()
        shape.moveTo(points[0]![0], points[0]![1])
        for (const p of points.slice(1)) shape.lineTo(p[0], p[1])
        shape.closePath()
        const depth = Math.max(0.01, width - 2 * bevel)
        const geometry = new ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: bevel > 0,
            bevelSize: bevel,
            bevelThickness: bevel,
            bevelSegments: 3,
            curveSegments: 4,
        })
        geometry.translate(0, 0, -depth / 2)
        return b.put(geometry, mat, { parent: g, collide })
    }
    // Body, glasshouse (narrower: the sides lean in), roof over it.
    extrude(s.body, W - 0.16, paint, 0.08)
    const [foot, top, back, rear] = s.cabin
    extrude([foot, top, back, rear], W - 0.36, 'tintedGlass', 0.04)
    const roofIn = 0.04
    extrude(
        [
            [top[0] - 0.02, top[1] - 0.02],
            [back[0] + 0.02, back[1] - 0.02],
            [back[0] + 0.06, back[1] + 0.035],
            [top[0] - 0.08, top[1] + 0.03],
        ],
        W - 0.36 - roofIn,
        paint,
        0.03
    )
    // Pillars: A along the windshield's edge, B/C upright, the last along the rear glass.
    const cabinHalf = (W - 0.36) / 2 + 0.01
    for (const side of [-1, 1]) {
        const z = side * cabinHalf
        b.rod(paint, new Vector3(foot[0], foot[1], z), new Vector3(top[0], top[1], z), 0.04, {
            parent: g,
            collide: false,
        })
        b.rod(paint, new Vector3(back[0], back[1], z), new Vector3(rear[0], rear[1], z), 0.055, {
            parent: g,
            collide: false,
        })
        for (const x of s.pillars) {
            const roofY = top[1] + ((x - top[0]) / (back[0] - top[0])) * (back[1] - top[1])
            b.box(paint, x - 0.045, foot[1], z - 0.02, x + 0.045, roofY, z + 0.02, {
                parent: g,
                collide: false,
                cast: false,
            })
        }
        // The beltline's chrome strip.
        b.box(
            'metalDark',
            rear[0] + 0.05,
            foot[1] - 0.01,
            side * (half - 0.005) - 0.01,
            foot[0] - 0.05,
            foot[1] + 0.015,
            side * (half - 0.005) + 0.01,
            { parent: g, collide: false, cast: false }
        )
    }
    // Wheels: arches, tyres, rims with five spokes, hubs.
    const r = s.wheel
    for (const ax of s.axles) {
        for (const side of [-1, 1]) {
            const z = side * (half - 0.13)
            b.put(new TorusGeometry(r + 0.06, 0.05, 6, 18, Math.PI), 'rubber', {
                parent: g,
                x: ax,
                y: r,
                z: side * (half + 0.005),
                collide: false,
                cast: false,
            })
            b.box('rubber', ax - r - 0.05, r - 0.02, side * half - 0.12, ax + r + 0.05, r + 0.04, side * half, {
                parent: g,
                collide: false,
                cast: false,
            })
            b.put(new CylinderGeometry(r, r, 0.24, 22).rotateX(Math.PI / 2), 'rubber', { parent: g, x: ax, y: r, z })
            // An alloy rim: a dark disc behind five wide silver spokes, a silver lip and hub.
            const face = z + side * 0.121
            b.put(new CylinderGeometry(r * 0.7, r * 0.7, 0.012, 20).rotateX(Math.PI / 2), 'metalDark', {
                parent: g,
                x: ax,
                y: r,
                z: face,
                collide: false,
                cast: false,
            })
            for (let k = 0; k < 5; k++) {
                const a = (k / 5) * Math.PI * 2
                b.box('paintSilver', -0.045, 0, -0.01, 0.045, r * 0.66, 0.01, {
                    parent: g,
                    x: ax,
                    y: r,
                    z: face + side * 0.01,
                    rz: a,
                    collide: false,
                    cast: false,
                })
            }
            b.put(new CylinderGeometry(r * 0.2, r * 0.2, 0.04, 12).rotateX(Math.PI / 2), 'paintSilver', {
                parent: g,
                x: ax,
                y: r,
                z: face + side * 0.014,
                collide: false,
                cast: false,
            })
            b.put(new TorusGeometry(r * 0.68, 0.03, 4, 24), 'paintSilver', {
                parent: g,
                x: ax,
                y: r,
                z: face + side * 0.01,
                collide: false,
                cast: false,
            })
        }
    }
    // Front: grille, headlights, bumper, plate. Back: tail lights, bumper, plate.
    // The body's bevel stands 8 cm proud of its profile: the nose and tail are that much further out.
    const front = s.body.reduce((m, p) => Math.max(m, p[0]), -9) + 0.07
    const backX = s.body.reduce((m, p) => Math.min(m, p[0]), 9) - 0.07
    const L = s.lights
    // The grille, standing proud of the nose: a chrome surround, dark mesh, slats.
    b.box('chrome', front - 0.02, L - 0.22, -half * 0.44, front + 0.05, L, half * 0.44, {
        parent: g,
        collide: false,
        cast: false,
    })
    b.box('metalDark', front + 0.05, L - 0.2, -half * 0.41, front + 0.056, L - 0.02, half * 0.41, {
        parent: g,
        collide: false,
        cast: false,
    })
    for (let k = 0; k < 3; k++)
        b.box(
            'chrome',
            front + 0.056,
            L - 0.165 + k * 0.05,
            -half * 0.39,
            front + 0.064,
            L - 0.15 + k * 0.05,
            half * 0.39,
            { parent: g, collide: false, cast: false }
        )
    for (const side of [-1, 1]) {
        // Headlight units: a chrome reflector behind a clear lens, a running-light strip under it.
        b.box('chrome', front - 0.06, L - 0.06, side * half * 0.47, front + 0.04, L + 0.1, side * (half - 0.08), {
            parent: g,
            collide: false,
            cast: false,
        })
        b.box('glass', front + 0.04, L - 0.05, side * half * 0.48, front + 0.05, L + 0.09, side * (half - 0.09), {
            parent: g,
            collide: false,
            cast: false,
        })
        b.box('lamp', front + 0.04, L - 0.07, side * half * 0.5, front + 0.052, L - 0.05, side * (half - 0.1), {
            parent: g,
            collide: false,
            cast: false,
        })
        // A rocker panel along the sill, between the wheels.
        b.box(
            'metalDark',
            s.axles[1] + r + 0.06,
            s.body[0]![1] + 0.02,
            side * half - 0.03,
            s.axles[0] - r - 0.06,
            s.body[0]![1] + 0.14,
            side * (half + 0.012),
            { parent: g, collide: false, cast: false }
        )
        const tail = b.box(
            'signRed',
            backX - 0.02,
            L - 0.02,
            side * (half - 0.12),
            backX + 0.06,
            L + 0.11,
            side * half * 0.48,
            { parent: g, collide: false, cast: false }
        )
        if (hazards) b.blinkers.push(tail)
        if (hazards) {
            const corner = b.box(
                'hazard',
                front - 0.06,
                L - 0.13,
                side * (half - 0.16),
                front + 0.02,
                L - 0.07,
                side * (half - 0.04),
                { parent: g, collide: false, cast: false }
            )
            b.blinkers.push(corner)
        }
    }
    const lowY = s.body[0]![1] - 0.05
    b.box('metalDark', front - 0.05, lowY, -half + 0.05, front + 0.06, lowY + 0.16, half - 0.05, {
        parent: g,
        collide: false,
    })
    b.box('metalDark', backX - 0.06, lowY, -half + 0.05, backX + 0.05, lowY + 0.16, half - 0.05, {
        parent: g,
        collide: false,
    })
    b.box('paintWhite', front + 0.06, lowY + 0.17, -0.26, front + 0.075, lowY + 0.28, 0.26, {
        parent: g,
        collide: false,
        cast: false,
    })
    b.box('paintWhite', backX - 0.075, L - 0.22, -0.26, backX - 0.06, L - 0.11, 0.26, {
        parent: g,
        collide: false,
        cast: false,
    })
    // Doors: seams, handles; mirrors; wipers.
    for (const side of [-1, 1]) {
        const z = side * (half + 0.002)
        for (const x of s.doors)
            b.box('metalDark', x - 0.006, lowY + 0.12, z - 0.004, x + 0.006, foot[1] - 0.02, z + 0.004, {
                parent: g,
                collide: false,
                cast: false,
            })
        for (let k = 0; k + 1 < s.doors.length; k++) {
            const x = s.doors[k + 1]! + 0.18
            b.box('chrome', x - 0.09, foot[1] - 0.14, z - 0.01, x + 0.09, foot[1] - 0.1, z + side * 0.025, {
                parent: g,
                collide: false,
                cast: false,
            })
        }
        const mx = foot[0] - 0.12
        b.box(paint, mx - 0.12, foot[1] + 0.02, side * (half - 0.02), mx + 0.02, foot[1] + 0.16, side * (half + 0.16), {
            parent: g,
            collide: false,
        })
        b.box(
            'carGlass',
            mx + 0.02,
            foot[1] + 0.035,
            side * (half + 0.0),
            mx + 0.025,
            foot[1] + 0.145,
            side * (half + 0.14),
            { parent: g, collide: false, cast: false }
        )
    }
    for (const z of [-0.3, 0.35]) {
        b.rod(
            'metalDark',
            new Vector3(foot[0] - 0.02, foot[1] + 0.03, z - 0.25),
            new Vector3(foot[0] - 0.08, foot[1] + 0.08, z + 0.25),
            0.01,
            { parent: g, collide: false, cast: false }
        )
    }
    // A pickup's box: its floor, walls and tailgate (open on top).
    if (s.bed) {
        const [x0, x1] = s.bed
        const top = s.body[6]![1]
        b.box('metalDark', x0, top - 0.42, -half + 0.12, x1, top - 0.38, half - 0.12, {
            parent: g,
            collide: false,
            cast: false,
        })
        for (const side of [-1, 1])
            b.box(paint, x0, top, side * (half - 0.14) - 0.06, x1, top + 0.14, side * (half - 0.14) + 0.06, {
                parent: g,
            })
        b.box(paint, x0 - 0.02, top, -half + 0.08, x0 + 0.1, top + 0.14, half - 0.08, { parent: g })
        b.box('metalDark', x0 + 0.1, top - 0.02, -half + 0.2, x1 - 0.05, top + 0.01, half - 0.2, {
            parent: g,
            collide: false,
            cast: false,
        })
    }
    return g
}

/** A car from its side profile: sedan, hatchback, minivan or pickup, in a paint; its hazards on or not. */
export const CAR = defineAsset({
    id: 'car',
    name: 'Car',
    category: 'vehicles',
    defaults: { kind: 'sedan', paint: 'paintBlue', hazards: false },
    params: {
        kind: { label: 'Kind', options: ['sedan', 'hatch', 'minivan', 'pickup'] },
        paint: { label: 'Paint', options: PAINTS },
        hazards: { label: 'Hazards on', options: [false, true] },
    },
    variants: [
        { kind: 'sedan' },
        { kind: 'hatch', paint: 'paintWhite' },
        { kind: 'minivan', paint: 'paintSilver' },
        { kind: 'pickup', paint: 'paintRed' },
    ],
    size: [2.0, 1.9, 5.6],
    current: {
        version: 2,
        notes: 'A narrower glasshouse over the body (the sides lean in) in smoky glass, its pillars and roof in the paint; black wheel arches and rocker panels; tyres on silver five-spoke alloys; a chrome grille, headlight units with running lights, tail lights, bumpers, plates; door seams and handles, mirrors, wipers; a pickup box with its walls and tailgate. Three rounds.',
        build(b, p) {
            carV2(b, p.kind as keyof typeof CARS, p.paint as ErablesMaterial, p.hazards as boolean)
        },
    },
})

/**
 * A lofted mesh through cross-sections (each a list of points, all the same count), closed at
 * both ends with fans: hulls, covers, tracks.
 */
function loft(sections: ReadonlyArray<ReadonlyArray<Vector3>>, capStart = true, capEnd = true): BufferGeometry {
    const positions: number[] = []
    const push = (...vs: Vector3[]) => {
        for (const v of vs) positions.push(v.x, v.y, v.z)
    }
    for (let i = 0; i + 1 < sections.length; i++) {
        const a = sections[i]!
        const c = sections[i + 1]!
        for (let j = 0; j + 1 < a.length; j++) push(a[j]!, c[j]!, c[j + 1]!, a[j]!, c[j + 1]!, a[j + 1]!)
    }
    const fan = (s: ReadonlyArray<Vector3>, flip: boolean) => {
        const centre = s.reduce((m, v) => m.add(v), new Vector3()).divideScalar(s.length)
        for (let j = 0; j + 1 < s.length; j++) flip ? push(centre, s[j + 1]!, s[j]!) : push(centre, s[j]!, s[j + 1]!)
    }
    if (capStart) fan(sections[0]!, true)
    if (capEnd) fan(sections.at(-1)!, false)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    // Shared corners, so the normals average round the curve (smooth, not faceted).
    const smooth = mergeVertices(g, 1e-4)
    smooth.computeVertexNormals()
    return smooth
}

/**
 * The boat, version 2: a lofted runabout hull (a V that narrows and rises to the bow, the sheer
 * curving up) under a fitted tent of a cover with its straps, an outboard on the transom, on a
 * proper trailer: rails, cross members, the tongue and its coupler and jack, the winch post,
 * fenders over the wheels, tail lights.
 */
function boatV2(b: Builder, cover: ErablesMaterial): void {
    const N = 22
    const stern = -2.45
    const bow = 2.75
    const station = (t: number) => {
        const z = stern + (bow - stern) * t
        const beam = t < 0.55 ? 1.05 : 1.05 * Math.cos(((t - 0.55) / 0.45) * (Math.PI / 2)) + 0.03
        const deck = 1.4 + 0.22 * t * t
        const keel = 0.62 + 0.42 * Math.pow(Math.max(0, t - 0.4) / 0.6, 2)
        const chine = keel + 0.32 * (1 - t * 0.5)
        return { z, beam, deck, keel, chine }
    }
    const hull: Vector3[][] = []
    const tarp: Vector3[][] = []
    for (let i = 0; i <= N; i++) {
        const { z, beam, deck, keel, chine } = station(i / N)
        hull.push([
            new Vector3(-beam, deck, z),
            new Vector3(-beam * 0.92, chine, z),
            new Vector3(0, keel, z),
            new Vector3(beam * 0.92, chine, z),
            new Vector3(beam, deck, z),
        ])
        if (i <= N - 2) {
            const ridge = deck + 0.42 * Math.sin(Math.PI * Math.min(1, (i / N) * 1.25 + 0.15))
            // Left to right like the hull's, so its faces look out.
            tarp.push([
                new Vector3(-beam - 0.03, deck - 0.12, z),
                new Vector3(-beam * 0.75, deck + (ridge - deck) * 0.7, z),
                new Vector3(0, ridge, z),
                new Vector3(beam * 0.75, deck + (ridge - deck) * 0.7, z),
                new Vector3(beam + 0.03, deck - 0.12, z),
            ])
        }
    }
    b.put(loft(hull), 'paintWhite')
    b.put(loft(tarp), cover)
    // A rub rail along the sheer, the boot stripe's line just under it.
    for (const side of [-1, 1]) {
        for (let i = 0; i < N; i++) {
            const a = station(i / N)
            const c = station((i + 1) / N)
            b.rod(
                'metalDark',
                new Vector3(side * (a.beam + 0.01), a.deck - 0.02, a.z),
                new Vector3(side * (c.beam + 0.01), c.deck - 0.02, c.z),
                0.03,
                { collide: false, cast: false }
            )
            b.rod(
                'paintBlue',
                new Vector3(side * (a.beam * 0.97 + 0.005), a.deck - 0.2, a.z),
                new Vector3(side * (c.beam * 0.97 + 0.005), c.deck - 0.2, c.z),
                0.025,
                { collide: false, cast: false }
            )
        }
    }
    // Straps over the cover, down to the trailer.
    for (const z of [-1.6, -0.2, 1.1]) {
        const { beam, deck } = station((z - stern) / (bow - stern))
        b.rod('metalDark', new Vector3(-beam - 0.05, deck - 0.3, z), new Vector3(0, deck + 0.45, z), 0.012, {
            collide: false,
            cast: false,
        })
        b.rod('metalDark', new Vector3(0, deck + 0.45, z), new Vector3(beam + 0.05, deck - 0.3, z), 0.012, {
            collide: false,
            cast: false,
        })
    }
    // The outboard: its cowl, the leg down past the hull, the propeller's housing.
    b.box('metalDark', -0.24, 1.5, stern - 0.68, 0.24, 2.05, stern - 0.2)
    b.box('paintWhite', -0.25, 1.85, stern - 0.7, 0.25, 2.07, stern - 0.18, { collide: false, cast: false })
    b.box('metalDark', -0.07, 0.65, stern - 0.42, 0.07, 1.52, stern - 0.3, { collide: false })
    b.box('metalDark', -0.1, 0.62, stern - 0.6, 0.1, 0.74, stern - 0.2, { collide: false, cast: false })
    // The trailer: two rails and cross members under the keel, bunks, the tongue to its coupler.
    for (const side of [-1, 1])
        b.box('metalDark', side * 0.55 - 0.05, 0.45, stern + 0.1, side * 0.55 + 0.05, 0.57, bow - 0.6)
    for (const z of [-1.9, -0.4, 1.0]) b.box('metalDark', -0.6, 0.45, z - 0.04, 0.6, 0.55, z + 0.04, { collide: false })
    for (const side of [-1, 1])
        b.box('wood', side * 0.4 - 0.05, 0.57, stern + 0.4, side * 0.4 + 0.05, 0.66, bow - 1.2, {
            collide: false,
            cast: false,
        })
    b.box('metalDark', -0.06, 0.45, bow - 0.6, 0.06, 0.55, bow + 1.5)
    for (const side of [-1, 1])
        b.rod('metalDark', new Vector3(side * 0.55, 0.5, bow - 0.6), new Vector3(0, 0.5, bow + 0.6), 0.04, {
            collide: false,
        })
    b.box('chrome', -0.07, 0.42, bow + 1.45, 0.07, 0.56, bow + 1.65, { collide: false, cast: false })
    b.box('metalDark', -0.04, 0.55, bow + 0.15, 0.04, 1.35, bow + 0.25, { collide: false })
    b.cyl('chrome', 0.07, 0.07, 0.14, 0, 1.15, bow + 0.32, 10, { collide: false, cast: false })
    b.cyl('metalDark', 0.04, 0.04, 0.45, 0.1, 0, bow + 1.1, 8, { collide: false })
    b.cyl('rubber', 0.06, 0.06, 0.05, 0.1, 0, bow + 1.1, 10, { collide: false, cast: false })
    // Wheels under fenders.
    for (const side of [-1, 1]) {
        b.put(new CylinderGeometry(0.3, 0.3, 0.18, 18).rotateZ(Math.PI / 2), 'rubber', {
            x: side * 0.78,
            y: 0.3,
            z: -0.2,
        })
        b.put(new CylinderGeometry(0.17, 0.17, 0.19, 14).rotateZ(Math.PI / 2), 'paintSilver', {
            x: side * 0.78,
            y: 0.3,
            z: -0.2,
            collide: false,
            cast: false,
        })
        b.put(
            new CylinderGeometry(0.4, 0.4, 0.24, 16, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2),
            'metalDark',
            { x: side * 0.78, y: 0.3, z: -0.2, collide: false }
        )
        b.box('signRed', side * 0.55 - 0.08, 0.5, stern + 0.05, side * 0.55 + 0.08, 0.6, stern + 0.1, {
            collide: false,
            cast: false,
        })
    }
}

/** A boat on its trailer under a blue tarp, its bow toward +z. */
export const BOAT = defineAsset({
    id: 'boat-trailer',
    name: 'Boat on its trailer',
    category: 'vehicles',
    defaults: { cover: 'tarp' },
    params: { cover: { label: 'Cover', options: ['tarp', 'canvas', 'paintGreen'] } },
    variants: [{}, { cover: 'canvas' }],
    current: {
        version: 2,
        notes: 'A lofted runabout hull (a V narrowing and rising to the bow, the sheer curving up) with its rub rail and stripe, under a fitted tent cover held by straps; an outboard on the transom; a proper trailer: rails, cross members, bunks, the tongue with its coupler and jack, the winch post, wheels under fenders, tail lights. Two rounds.',
        build(b, p) {
            boatV2(b, p.cover as ErablesMaterial)
        },
    },
    size: [2.3, 2.0, 8.4],
})

/**
 * The travel trailer, version 2: a rounded body (bevelled profile) in white with two-tone side
 * stripes, framed windows (the front one wide and raked), a door with its window, grab handle and
 * steps, storage hatches, a rolled awning, the roof's air conditioner and vents, wheel wells over
 * two axles, stabiliser jacks, the A-frame tongue with its propane tanks, jack and coupler.
 */
function rvV2(b: Builder, stripe: ErablesMaterial): void {
    const side = new Shape()
    side.moveTo(-3.6, 0.5)
    side.lineTo(3.1, 0.5)
    side.quadraticCurveTo(3.6, 0.5, 3.62, 1.1)
    side.lineTo(3.62, 2.25)
    side.quadraticCurveTo(3.6, 2.95, 2.9, 3.0)
    side.lineTo(-3.25, 3.0)
    side.quadraticCurveTo(-3.62, 2.98, -3.62, 2.6)
    side.closePath()
    const half = 1.2
    b.put(
        new ExtrudeGeometry(side, {
            depth: 2 * half - 0.12,
            bevelEnabled: true,
            bevelSize: 0.06,
            bevelThickness: 0.06,
            bevelSegments: 3,
            curveSegments: 8,
        }).translate(0, 0, -half + 0.06),
        'paintWhite'
    )
    const out = half + 0.002
    for (const s of [-1, 1]) {
        const z = s * out
        // Two-tone stripes, and a dark skirt along the bottom.
        b.box(stripe, -3.55, 1.25, z - 0.004, 3.4, 1.42, z + 0.004, { collide: false, cast: false })
        b.box('paintSilver', -3.55, 1.47, z - 0.004, 3.3, 1.52, z + 0.004, { collide: false, cast: false })
        b.box('metalDark', -3.55, 0.5, z - 0.004, 3.3, 0.62, z + 0.004, { collide: false, cast: false })
        // Windows, framed.
        for (const [x0, x1] of [[-2.9, -1.9], [1.6, 2.7], ...(s > 0 ? [[-0.9, -0.1]] : [[-1.3, 0.4]])] as const) {
            b.box('trim', x0 - 0.05, 1.68, z - 0.006, x1 + 0.05, 2.47, z + s * 0.012, { collide: false, cast: false })
            b.box('tintedGlass', x0, 1.73, z + s * 0.012, x1, 2.42, z + s * 0.018, { collide: false, cast: false })
        }
        // Wheel wells over the two axles.
        for (const x of [-0.25, 0.55])
            b.put(new TorusGeometry(0.42, 0.04, 6, 18, Math.PI), 'metalDark', {
                x,
                y: 0.38,
                z: s * (half + 0.01),
                collide: false,
                cast: false,
            })
    }
    // The door (+z side): frame, its window, the handle, the grab bar, folding steps, the porch light.
    const z = out
    b.box('trim', 0.5, 0.62, z - 0.004, 1.25, 2.55, z + 0.02, { collide: false, cast: false })
    b.box('paintWhite', 0.55, 0.66, z + 0.02, 1.2, 2.5, z + 0.03, { collide: false, cast: false })
    b.box('tintedGlass', 0.68, 1.8, z + 0.03, 1.07, 2.3, z + 0.035, { collide: false, cast: false })
    b.box('chrome', 1.08, 1.45, z + 0.03, 1.15, 1.5, z + 0.06, { collide: false, cast: false })
    b.rod('chrome', new Vector3(0.4, 1.2, z + 0.08), new Vector3(0.4, 1.9, z + 0.08), 0.02, {
        collide: false,
        cast: false,
    })
    for (let k = 0; k < 2; k++)
        b.box('metalDark', 0.55, 0.22 + k * 0.2, z + 0.05 + k * 0.0, 1.2, 0.26 + k * 0.2, z + 0.42 - k * 0.2, {
            collide: false,
        })
    b.box('lamp', 1.3, 2.45, z, 1.42, 2.55, z + 0.06, { collide: false, cast: false })
    // Storage hatches low on the sides.
    for (const x of [-3.0, 2.2])
        b.box('trim', x, 0.75, z - 0.004, x + 0.7, 1.15, z + 0.01, { collide: false, cast: false })
    // The awning rolled along the top of the door side.
    b.put(new CylinderGeometry(0.09, 0.09, 5.2, 12).rotateZ(Math.PI / 2), 'paintSilver', {
        x: 0.1,
        y: 2.78,
        z: half + 0.12,
        collide: false,
    })
    b.put(new CylinderGeometry(0.095, 0.095, 5.0, 12).rotateZ(Math.PI / 2), stripe, {
        x: 0.1,
        y: 2.78,
        z: half + 0.12,
        collide: false,
        cast: false,
    })
    for (const x of [-2.5, 2.7])
        b.box('paintSilver', x - 0.03, 0.9, half, x + 0.03, 2.75, half + 0.1, { collide: false, cast: false })
    // The front window, wide and raked, and the back's lights.
    b.box('trim', 3.5, 1.55, -0.85, 3.66, 2.1, 0.85, { collide: false, cast: false })
    b.box('tintedGlass', 3.64, 1.6, -0.8, 3.68, 2.05, 0.8, { collide: false, cast: false })
    for (const s of [-1, 1])
        b.box('signRed', -3.69, 0.75, s * 0.85 - 0.12, -3.63, 0.95, s * 0.85 + 0.12, { collide: false, cast: false })
    // On the roof: the air conditioner, two vents.
    b.box('paintWhite', -0.6, 3.0, -0.4, 0.3, 3.32, 0.4)
    b.box('paintSilver', -0.55, 3.32, -0.35, 0.25, 3.36, 0.35, { collide: false, cast: false })
    for (const x of [-2.2, 1.9]) b.box('paintWhite', x - 0.25, 3.0, -0.25, x + 0.25, 3.12, 0.25, { collide: false })
    // Running gear: two axles' wheels with silver rims, the stabiliser jacks.
    for (const x of [-0.25, 0.55]) {
        for (const s of [-1, 1]) {
            b.put(new CylinderGeometry(0.36, 0.36, 0.22, 18).rotateX(Math.PI / 2), 'rubber', {
                x,
                y: 0.36,
                z: s * (half - 0.12),
            })
            b.put(new CylinderGeometry(0.2, 0.2, 0.01, 14).rotateX(Math.PI / 2), 'paintSilver', {
                x,
                y: 0.36,
                z: s * (half - 0.005),
                collide: false,
                cast: false,
            })
        }
    }
    for (const x of [-3.3, 3.2])
        for (const s of [-1, 1])
            b.rod(
                'metalDark',
                new Vector3(x, 0.5, s * 0.9),
                new Vector3(x + (x < 0 ? -0.2 : 0.2), 0.02, s * 0.95),
                0.03,
                { collide: false }
            )
    // The A-frame tongue, the propane tanks under their cover, the jack, the coupler.
    for (const s of [-1, 1]) b.rod('metalDark', new Vector3(3.5, 0.45, s * 0.7), new Vector3(4.8, 0.45, 0), 0.05)
    b.box('paintWhite', 3.75, 0.5, -0.35, 4.25, 1.15, 0.35)
    b.box('metalDark', 3.73, 1.15, -0.37, 4.27, 1.2, 0.37, { collide: false, cast: false })
    b.cyl('metalDark', 0.04, 0.04, 0.45, 4.5, 0, 0, 8, { collide: false })
    b.cyl('rubber', 0.07, 0.07, 0.05, 4.5, 0, 0, 10, { collide: false, cast: false })
    b.box('chrome', 4.75, 0.38, -0.07, 4.95, 0.52, 0.07, { collide: false, cast: false })
}

/** A travel trailer (roulotte) parked for the season, its hitch toward +x. */
export const RV = defineAsset({
    id: 'rv',
    name: 'Travel trailer',
    category: 'vehicles',
    defaults: { stripe: 'paintBlue' },
    params: { stripe: { label: 'Stripe', options: PAINTS } },
    variants: [{}, { stripe: 'paintRed' }],
    size: [8.6, 3.4, 2.6],
    current: {
        version: 2,
        notes: 'A rounded body in white with two-tone stripes and a dark skirt; framed windows (the front one wide), a door with its window, handle, grab bar, steps and porch light; storage hatches; a rolled awning; the roof air conditioner and vents; wheel wells over two axles, stabiliser jacks; the A-frame tongue with the propane cover, jack and coupler. One round.',
        build(b, p) {
            rvV2(b, p.stripe as ErablesMaterial)
        },
    },
})

/**
 * The mini excavator, version 2: rubber tracks round their idlers and rollers, the dozer blade; the
 * house with its rounded counterweight; a canopy cab (four posts, a roof, the seat and levers);
 * the boom and arm as bent plates with their hydraulic cylinders; a toothed bucket. Boom toward +x.
 */
function excavatorV2(b: Builder): void {
    // Tracks: a stadium shape extruded across, rubber, idlers showing at the ends.
    const track = new Shape()
    track.moveTo(-0.95, 0)
    track.lineTo(0.95, 0)
    track.absarc(0.95, 0.25, 0.25, -Math.PI / 2, Math.PI / 2, false)
    track.lineTo(-0.95, 0.5)
    track.absarc(-0.95, 0.25, 0.25, Math.PI / 2, (3 * Math.PI) / 2, false)
    for (const s of [-1, 1]) {
        b.put(
            new ExtrudeGeometry(track, { depth: 0.32, bevelEnabled: false, curveSegments: 8 }).translate(
                0,
                0,
                s > 0 ? 0.5 : -0.82
            ),
            'rubber'
        )
        for (const x of [-0.95, 0.95])
            b.put(new CylinderGeometry(0.2, 0.2, 0.34, 14).rotateX(Math.PI / 2), 'machine', {
                x,
                y: 0.25,
                z: s * 0.66,
                collide: false,
                cast: false,
            })
        for (const x of [-0.45, 0, 0.45])
            b.put(new CylinderGeometry(0.08, 0.08, 0.34, 10).rotateX(Math.PI / 2), 'metalDark', {
                x,
                y: 0.1,
                z: s * 0.66,
                collide: false,
                cast: false,
            })
    }
    b.box('metalDark', -0.8, 0.15, -0.5, 0.8, 0.45, 0.5)
    // The dozer blade in front, on its arms.
    b.box('machine', 1.25, 0.05, -0.85, 1.38, 0.45, 0.85)
    for (const s of [-1, 1])
        b.rod('machine', new Vector3(0.6, 0.3, s * 0.5), new Vector3(1.28, 0.3, s * 0.6), 0.05, { collide: false })
    // The house on its turntable, the counterweight rounded at the back.
    b.cyl('metalDark', 0.55, 0.55, 0.1, 0, 0.5, 0, 16, { collide: false })
    b.box('machine', -0.6, 0.6, -0.75, 0.75, 1.15, 0.75)
    b.put(new CylinderGeometry(0.75, 0.75, 0.55, 18, 1, false, Math.PI, Math.PI).translate(0, 0.875, 0), 'machine', {
        x: -0.6,
        rx: 0,
        ry: Math.PI / 2,
    })
    b.box('metalDark', -0.5, 0.72, 0.76, 0.3, 0.78, 0.765, { collide: false, cast: false })
    // The canopy: four posts, the roof, the seat, two levers.
    for (const [x, z] of [
        [-0.55, -0.65],
        [-0.55, 0.15],
        [0.35, -0.65],
        [0.35, 0.15],
    ] as const)
        b.box('metalDark', x - 0.04, 1.15, z - 0.04, x + 0.04, 2.3, z + 0.04)
    b.box('metalDark', -0.65, 2.3, -0.75, 0.45, 2.38, 0.25)
    b.box('rubber', -0.45, 1.15, -0.45, -0.05, 1.45, -0.05, { collide: false })
    b.box('rubber', -0.5, 1.45, -0.45, -0.42, 1.95, -0.05, { collide: false })
    for (const z of [-0.5, 0.0])
        b.rod('metalDark', new Vector3(0.1, 1.2, z), new Vector3(0.18, 1.6, z), 0.015, { collide: false, cast: false })
    b.box('tintedGlass', 0.33, 1.25, -0.6, 0.35, 2.25, 0.1, { collide: false, cast: false })
    // The boom: a bent plate up from the house's front, its cylinder under it; the arm down to the bucket.
    const plate = (points: Array<[number, number]>, width: number, z = 0) => {
        const shape = new Shape()
        shape.moveTo(points[0]![0], points[0]![1])
        for (const p of points.slice(1)) shape.lineTo(p[0], p[1])
        shape.closePath()
        b.put(
            new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(0, 0, z - width / 2),
            'machine'
        )
    }
    plate(
        [
            [0.6, 0.85],
            [0.8, 1.2],
            [1.6, 2.55],
            [2.2, 2.75],
            [2.3, 2.55],
            [1.75, 2.3],
            [0.95, 0.9],
        ],
        0.3,
        0.25
    )
    // An exhaust stack and an amber beacon on the canopy.
    b.cyl('metalDark', 0.04, 0.04, 0.45, -0.75, 1.15, 0.55, 8, { collide: false })
    b.cyl('cone', 0.07, 0.07, 0.12, -0.1, 2.38, -0.25, 10, { collide: false, cast: false })
    b.rod('metalDark', new Vector3(0.75, 0.75, 0.25), new Vector3(1.6, 2.1, 0.25), 0.06, { collide: false })
    b.rod('chrome', new Vector3(1.3, 1.6, 0.25), new Vector3(1.7, 2.25, 0.25), 0.03, { collide: false, cast: false })
    plate(
        [
            [2.15, 2.75],
            [2.35, 2.6],
            [2.85, 0.75],
            [2.65, 0.7],
        ],
        0.18,
        0.25
    )
    b.rod('metalDark', new Vector3(1.9, 2.6, 0.25), new Vector3(2.55, 2.95, 0.25), 0.05, { collide: false })
    // The bucket: a curled scoop with teeth.
    const bucket = new Shape()
    bucket.moveTo(2.6, 0.85)
    bucket.quadraticCurveTo(3.25, 0.85, 3.2, 0.3)
    bucket.lineTo(3.0, 0.15)
    bucket.quadraticCurveTo(2.8, 0.55, 2.65, 0.65)
    bucket.closePath()
    b.put(
        new ExtrudeGeometry(bucket, { depth: 0.5, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, 0.0),
        'metalDark'
    )
    for (let k = 0; k < 4; k++)
        b.box('steel', 2.95, 0.05, 0.05 + k * 0.12, 3.05, 0.18, 0.11 + k * 0.12, { collide: false, cast: false })
}

/** A mini excavator, its boom toward +x. */
export const EXCAVATOR = defineAsset({
    id: 'excavator',
    name: 'Mini excavator',
    category: 'vehicles',
    defaults: {},
    params: {},
    variants: [{}],
    size: [4.4, 2.8, 1.8],
    current: {
        version: 2,
        notes: 'Rubber tracks round their idlers and rollers, a dozer blade; the house on its turntable with a rounded counterweight; a canopy cab with its seat and levers; the boom and arm as bent plates with hydraulic cylinders; a curled bucket with teeth; an exhaust stack and a beacon. Two rounds.',
        build(b) {
            excavatorV2(b)
        },
    },
})
