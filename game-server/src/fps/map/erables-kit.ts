import {
    BoxGeometry,
    type BufferGeometry,
    CatmullRomCurve3,
    ConeGeometry,
    CylinderGeometry,
    ExtrudeGeometry,
    Float32BufferAttribute,
    BufferGeometry as Geometry,
    Group,
    type Material,
    Mesh,
    type Object3D,
    Shape,
    SphereGeometry,
    TorusGeometry,
    TubeGeometry,
    Vector3,
} from 'three'

/**
 * The pieces Rue des Érables is built from, in real metres (the map is shrunk to the minis' size
 * afterwards, as a whole): walls with their windows and doors cut out, gable roofs, floors,
 * furniture, cars, fences, trees' trunks and the street's odds and ends. Pure (no DOM): the game
 * server builds the same meshes with plain materials and collides with their triangles, so what
 * stops you is what's drawn. A mesh flagged `noCollide` (glass, leaves, wires, small things) is
 * only drawn; one in `solidOnly` (ramps under stairs, the map's invisible bounds) only collides.
 */

/** Every material the map uses, by name: the browser paints them, the server makes them plain. */
export const ERABLES_MATERIALS = [
    'grass',
    'soil',
    'mulch',
    'asphalt',
    'driveway',
    'concrete',
    'sidewalk',
    'gravel',
    'brick',
    'brickBuff',
    'sidingCream',
    'sidingSage',
    'sidingGrey',
    'shingle',
    'shingleGrey',
    'trim',
    'soffit',
    'foundation',
    'glass',
    'doorRed',
    'doorGreen',
    'doorWood',
    'garageDoor',
    'deck',
    'cedar',
    'hedge',
    'bark',
    'barkFurrowed',
    'barkBirch',
    'cedarFoliage',
    'plaster',
    'plasterBlue',
    'plasterSage',
    'floorOak',
    'floorTile',
    'carpet',
    'cabinetWood',
    'cabinetWhite',
    'counter',
    'steel',
    'chrome',
    'rubber',
    'sofa',
    'sofaGreen',
    'bedding',
    'wood',
    'metalDark',
    'binBlue',
    'binBrown',
    'binGrey',
    'cone',
    'machine',
    'paintRed',
    'paintBlue',
    'paintSilver',
    'paintWhite',
    'paintGreen',
    'carGlass',
    'tintedGlass',
    'lamp',
    'tarp',
    'poolWall',
    'poolCover',
    'canvas',
    'pumpkin',
    'hay',
    'leafBag',
    'firewood',
    'net',
    'signBlue',
    'signRed',
    'signRoad',
    'stopSign',
    'leaves',
    'number1',
    'number2',
    'screen',
    'art',
    'hazard',
] as const
export type ErablesMaterial = (typeof ERABLES_MATERIALS)[number]
export type ErablesMaterials = Record<ErablesMaterial, Material>

/**
 * Painted with world-aligned UVs in the browser (a metre of brick is a metre of brick across every
 * wall, no seams); the others keep their own (signs, the screen, the cars' paint).
 */
export const WORLD_UV: ReadonlySet<ErablesMaterial> = new Set([
    'grass',
    'soil',
    'mulch',
    'asphalt',
    'driveway',
    'concrete',
    'sidewalk',
    'gravel',
    'brick',
    'brickBuff',
    'sidingCream',
    'sidingSage',
    'sidingGrey',
    'shingle',
    'shingleGrey',
    'soffit',
    'foundation',
    'garageDoor',
    'deck',
    'cedar',
    'hedge',
    'cedarFoliage',
    'plaster',
    'plasterBlue',
    'plasterSage',
    'floorOak',
    'floorTile',
    'carpet',
    'cabinetWood',
    'cabinetWhite',
    'counter',
    'wood',
    'tarp',
    'leaves',
    'poolWall',
    'poolCover',
    'canvas',
    'hay',
    'leafBag',
    'firewood',
])

/** A seeded random stream (the office's): server and browser place things identically. */
export function rng(seed: number): () => number {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export interface Put {
    x?: number
    y?: number
    z?: number
    rx?: number
    ry?: number
    rz?: number
    /** false: only drawn (shots and players go through). */
    collide?: boolean
    /** false: casts no shadow (small, or flat on the ground). */
    cast?: boolean
    parent?: Object3D
}

/** A tree for the browser to crown with leaves (its trunk is built here and collides). */
export interface TreeSpot {
    x: number
    z: number
    /** The ground under it. */
    y: number
    height: number
    /** The crown's radius. */
    crown: number
    kind: 'maple' | 'birch' | 'oak' | 'cedar'
    /** Its leaves' colour this week. */
    tint: 'red' | 'orange' | 'yellow' | 'green' | 'rust'
    /**
     * Where its leaves gather (x, y, z, radius; in the same frame as x, y, z): the branch tips'
     * clumps. Without, the browser crowns it with one ellipsoid.
     */
    clusters?: Array<[number, number, number, number]>
}

/** A wall's opening, along the wall from a0 to a1, from y0 (sill or floor) to y1 (head). */
export interface Opening {
    a0: number
    a1: number
    y0: number
    y1: number
    kind: 'window' | 'door' | 'open'
    /** A window with no glass in it (open, or its glass is gone): you see and shoot through either way. */
    noGlass?: boolean
    /** Muntins: a cross (true) or none. */
    cross?: boolean
    /** Shutters either side, in this material. */
    shutters?: ErablesMaterial
    /** A door's leaf, swung open into the room (true), or the opening left bare. */
    leaf?: ErablesMaterial
}

export class Builder {
    /** What's drawn (and, unless flagged, collided with). */
    readonly drawn = new Group()
    /** What only collides: ramps under stairs, the invisible bounds. */
    readonly solidOnly = new Group()
    readonly trees: TreeSpot[] = []
    readonly piles: Array<{ x: number; y: number; z: number; r: number }> = []
    /** The stalled car's hazard lights (they blink in the browser). */
    readonly blinkers: Mesh[] = []
    R = rng(1247)
    /** Where pieces go when no parent is given: the drawn group, or the asset being placed. */
    private target: Object3D = this.drawn
    private solidTarget: Object3D = this.solidOnly

    constructor(readonly M: ErablesMaterials) {}

    /**
     * Builds `build` in a frame of its own (an asset at its spot, turned `ry`): everything it puts,
     * drawn or collision only, and the trees it records, land there. Its own seeded randomness
     * (`seed`), so an asset looks the same wherever and in whatever order it's placed.
     */
    place(at: { x?: number; y?: number; z?: number; ry?: number }, build: () => void, seed?: number): Group {
        const frame = (parent: Object3D) => {
            const g = new Group()
            g.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0)
            g.rotation.y = at.ry ?? 0
            parent.add(g)
            return g
        }
        const [target, solidTarget, R] = [this.target, this.solidTarget, this.R]
        const drawn = frame(target)
        this.target = drawn
        this.solidTarget = frame(solidTarget)
        if (seed !== undefined) this.R = rng(seed)
        const trees = this.trees.length
        const piles = this.piles.length
        try {
            build()
        } finally {
            this.target = target
            this.solidTarget = solidTarget
            this.R = R
        }
        // What was recorded in the frame, into the map's coordinates (its parent's).
        drawn.updateMatrix()
        const toParent = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(drawn.matrix)
        for (const t of this.trees.slice(trees)) {
            Object.assign(t, ((p: Vector3) => ({ x: p.x, y: p.y, z: p.z }))(toParent(t.x, t.y, t.z)))
            t.clusters = t.clusters?.map(([x, y, z, r]) => {
                const p = toParent(x, y, z)
                return [p.x, p.y, p.z, r]
            })
        }
        for (const p of this.piles.slice(piles))
            Object.assign(p, ((v: Vector3) => ({ x: v.x, y: v.y, z: v.z }))(toParent(p.x, p.y, p.z)))
        return drawn
    }

    put(geometry: BufferGeometry, mat: ErablesMaterial, p: Put = {}): Mesh {
        const mesh = new Mesh(geometry, this.M[mat])
        mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
        mesh.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)
        mesh.castShadow = p.cast ?? true
        mesh.receiveShadow = true
        if (p.collide === false) mesh.userData.noCollide = true
        mesh.userData.mat = mat
        ;(p.parent ?? this.target).add(mesh)
        return mesh
    }

    /** An axis-aligned box from its corners (in its parent's frame). */
    box(
        mat: ErablesMaterial,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        p: Put = {}
    ): Mesh {
        const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0]
        const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0]
        const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0]
        return this.put(new BoxGeometry(bx - ax, by - ay, bz - az), mat, {
            ...p,
            x: (ax + bx) / 2,
            y: (ay + by) / 2,
            z: (az + bz) / 2,
        })
    }

    /** A box w × h × d standing on y, centred on x, z, turned `ry`. */
    block(mat: ErablesMaterial, w: number, h: number, d: number, x: number, y: number, z: number, p: Put = {}): Mesh {
        const geometry = new BoxGeometry(w, h, d).translate(0, h / 2, 0)
        return this.put(geometry, mat, { ...p, x, y, z })
    }

    /** A cylinder (or cone, r0 ≠ r1) standing on y. */
    cyl(
        mat: ErablesMaterial,
        rTop: number,
        rBottom: number,
        h: number,
        x: number,
        y: number,
        z: number,
        segments = 12,
        p: Put = {}
    ): Mesh {
        const geometry = new CylinderGeometry(rTop, rBottom, h, segments).translate(0, h / 2, 0)
        return this.put(geometry, mat, { ...p, x, y, z })
    }

    /** A rod from a to b (a pipe, a rail, a branch). */
    rod(mat: ErablesMaterial, a: Vector3, b: Vector3, r: number, p: Put = {}, segments = 8): Mesh {
        const along = b.clone().sub(a)
        const geometry = new CylinderGeometry(r, r, along.length(), segments).translate(0, along.length() / 2, 0)
        const mesh = this.put(geometry, mat, { ...p, x: a.x, y: a.y, z: a.z })
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), along.normalize())
        return mesh
    }

    group(x = 0, y = 0, z = 0, ry = 0, parent: Object3D = this.target): Group {
        const g = new Group()
        g.position.set(x, y, z)
        g.rotation.y = ry
        parent.add(g)
        return g
    }

    /** A collision-only solid (never drawn). */
    solid(geometry: BufferGeometry, p: Put = {}): Mesh {
        const mesh = new Mesh(geometry)
        mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
        mesh.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)
        ;(p.parent ?? this.solidTarget).add(mesh)
        return mesh
    }

    /**
     * A ramp to walk up stairs (collision only: the steps are drawn, the ramp is what you walk on),
     * a wedge from (x0, z0) at y0 to (x1, z1) at y1, `width` across, solid down to the lower end's
     * height. Runs along x or z.
     */
    ramp(x0: number, z0: number, y0: number, x1: number, z1: number, y1: number, width: number): void {
        const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
        const half = width / 2
        const low = Math.min(y0, y1) - 0.05
        // Corners: start (a) and end (b) across the run, top and bottom.
        const across = (x: number, z: number, side: number): [number, number] =>
            alongX ? [x, z + side * half] : [x + side * half, z]
        const top = [
            [...across(x0, z0, -1), y0],
            [...across(x0, z0, 1), y0],
            [...across(x1, z1, 1), y1],
            [...across(x1, z1, -1), y1],
        ] as Array<[number, number, number]>
        const bottom = top.map(([x, z]) => [x, z, low] as [number, number, number])
        const positions: number[] = []
        const v = ([x, z, y]: [number, number, number]) => positions.push(x, y, z)
        const quad = (
            a: [number, number, number],
            b: [number, number, number],
            c: [number, number, number],
            d: [number, number, number]
        ) => {
            ;(v(a), v(b), v(c), v(a), v(c), v(d))
        }
        quad(top[0]!, top[1]!, top[2]!, top[3]!)
        quad(bottom[0]!, bottom[3]!, bottom[2]!, bottom[1]!)
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4
            quad(top[i]!, bottom[i]!, bottom[j]!, top[j]!)
        }
        const geometry = new Geometry()
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
        this.solid(geometry)
    }

    /**
     * Steps drawn from (x0, z0, y0) to (x1, z1, y1), `width` across, each a block (concrete,
     * wood), with the ramp you actually walk on under them.
     */
    stairs(
        mat: ErablesMaterial,
        x0: number,
        z0: number,
        y0: number,
        x1: number,
        z1: number,
        y1: number,
        width: number,
        rise = 0.18
    ): void {
        const count = Math.max(1, Math.round(Math.abs(y1 - y0) / rise))
        const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
        const up = y1 > y0
        for (let i = 0; i < count; i++) {
            // Step i: from the low end, its top at the low end + (i + 1) × rise.
            const t0 = i / count
            const t1 = (i + 1) / count
            const [lx, lz, hx, hz, ly, hy] = up ? [x0, z0, x1, z1, y0, y1] : [x1, z1, x0, z0, y1, y0]
            const top = ly + (hy - ly) * t1
            const a = { x: lx + (hx - lx) * t0, z: lz + (hz - lz) * t0 }
            const b = { x: lx + (hx - lx) * t1, z: lz + (hz - lz) * t1 }
            if (alongX) this.box(mat, a.x, ly - 0.05, lz - width / 2, b.x, top, lz + width / 2, { collide: false })
            else this.box(mat, lx - width / 2, ly - 0.05, a.z, lx + width / 2, top, b.z, { collide: false })
        }
        this.ramp(x0, z0, y0, x1, z1, y1, width)
    }

    /**
     * A wall along x (axis 'x', its exterior face on the plane z = `at`) or along z (on x = `at`),
     * from a0 to a1, y0 to y1, `t` thick going inward (`inward`: -1 or 1 on the other axis), its
     * openings cut out and dressed: trim, sills, glass, muntins, shutters, a door's leaf. The outside
     * half in `outMat`, the inside half in `inMat`.
     */
    wall(
        axis: 'x' | 'z',
        at: number,
        a0: number,
        a1: number,
        y0: number,
        y1: number,
        t: number,
        inward: 1 | -1,
        outMat: ErablesMaterial,
        inMat: ErablesMaterial,
        openings: Opening[] = []
    ): void {
        const sorted = [...openings].sort((p, q) => p.a0 - q.a0)
        const rects: Array<[number, number, number, number]> = []
        let a = a0
        for (const o of sorted) {
            if (o.a0 > a) rects.push([a, o.a0, y0, y1])
            if (o.y0 > y0) rects.push([o.a0, o.a1, y0, o.y0])
            if (o.y1 < y1) rects.push([o.a0, o.a1, o.y1, y1])
            a = o.a1
        }
        if (a < a1) rects.push([a, a1, y0, y1])
        const outer = at
        const middle = at + (inward * t) / 2
        const inner = at + inward * t
        const slab = (mat: ErablesMaterial, b0: number, b1: number, r: [number, number, number, number]) => {
            if (axis === 'x') this.box(mat, r[0], r[2], b0, r[1], r[3], b1)
            else this.box(mat, b0, r[2], r[0], b1, r[3], r[1])
        }
        for (const r of rects) {
            if (outMat === inMat) slab(outMat, outer, inner, r)
            else {
                slab(outMat, outer, middle, r)
                slab(inMat, middle, inner, r)
            }
        }
        for (const o of sorted) this.dress(axis, at, t, inward, o)
    }

    /** An opening's trim, sill, glass, muntins, shutters and door leaf. */
    private dress(axis: 'x' | 'z', at: number, t: number, inward: 1 | -1, o: Opening): void {
        const out = -inward
        // A box in the wall's frame: along a, up y, across c (from the exterior face, + outward).
        const piece = (
            mat: ErablesMaterial,
            a0: number,
            a1: number,
            y0: number,
            y1: number,
            c0: number,
            c1: number,
            collide = false
        ) => {
            const p0 = at + out * c0
            const p1 = at + out * c1
            if (axis === 'x') this.box(mat, a0, y0, p0, a1, y1, p1, { collide, cast: false })
            else this.box(mat, p0, y0, a0, p1, y1, a1, { collide, cast: false })
        }
        const w = 0.09
        if (o.kind === 'open') {
            // Casing on both faces.
            for (const [c0, c1] of [
                [0, 0.02],
                [-t - 0.02, -t],
            ] as const) {
                piece('trim', o.a0 - w, o.a0, o.y0, o.y1 + w, c0, c1)
                piece('trim', o.a1, o.a1 + w, o.y0, o.y1 + w, c0, c1)
                piece('trim', o.a0 - w, o.a1 + w, o.y1, o.y1 + w, c0, c1)
            }
            return
        }
        // Exterior trim round it, standing proud of the wall.
        piece('trim', o.a0 - w, o.a0, o.y0 - (o.kind === 'window' ? 0.06 : 0), o.y1 + w, -0.01, 0.04)
        piece('trim', o.a1, o.a1 + w, o.y0 - (o.kind === 'window' ? 0.06 : 0), o.y1 + w, -0.01, 0.04)
        piece('trim', o.a0 - w, o.a1 + w, o.y1, o.y1 + w + 0.02, -0.01, 0.05)
        // Interior casing.
        piece('trim', o.a0 - 0.07, o.a0, o.y0, o.y1 + 0.07, -t - 0.015, -t)
        piece('trim', o.a1, o.a1 + 0.07, o.y0, o.y1 + 0.07, -t - 0.015, -t)
        piece('trim', o.a0 - 0.07, o.a1 + 0.07, o.y1, o.y1 + 0.07, -t - 0.015, -t)
        if (o.kind === 'window') {
            // The sill sticks out and slopes off; an inside stool.
            piece('trim', o.a0 - 0.12, o.a1 + 0.12, o.y0 - 0.05, o.y0, -0.02, 0.07)
            piece('trim', o.a0 - 0.05, o.a1 + 0.05, o.y0 - 0.03, o.y0, -t - 0.05, -t + 0.02)
            // The sash frame inside the opening, and its glass (drawn only: you see and shoot through).
            const c = t * 0.45
            piece('trim', o.a0, o.a1, o.y0, o.y0 + 0.05, c - 0.03, c + 0.03)
            piece('trim', o.a0, o.a1, o.y1 - 0.05, o.y1, c - 0.03, c + 0.03)
            piece('trim', o.a0, o.a0 + 0.05, o.y0, o.y1, c - 0.03, c + 0.03)
            piece('trim', o.a1 - 0.05, o.a1, o.y0, o.y1, c - 0.03, c + 0.03)
            if (!o.noGlass) {
                const mid = (o.y0 + o.y1) / 2
                // A sliding or hung window: the meeting rail across the middle.
                piece('trim', o.a0, o.a1, mid - 0.025, mid + 0.025, c - 0.035, c + 0.035)
                if (o.cross) {
                    const am = (o.a0 + o.a1) / 2
                    piece('trim', am - 0.018, am + 0.018, o.y0, o.y1, c - 0.02, c + 0.02)
                }
                piece('glass', o.a0 + 0.03, o.a1 - 0.03, o.y0 + 0.03, o.y1 - 0.03, c - 0.004, c + 0.004)
            }
            if (o.shutters) {
                const sw = Math.min(0.45, (o.a1 - o.a0) * 0.4)
                piece(o.shutters, o.a0 - w - sw - 0.02, o.a0 - w - 0.02, o.y0 - 0.04, o.y1 + 0.04, 0.0, 0.035)
                piece(o.shutters, o.a1 + w + 0.02, o.a1 + w + sw + 0.02, o.y0 - 0.04, o.y1 + 0.04, 0.0, 0.035)
            }
        } else if (o.leaf) {
            // The door, swung open against the inside of the wall, hinged at a0.
            const width = o.a1 - o.a0 - 0.04
            const c0 = -t - 0.05
            if (axis === 'x')
                this.box(
                    o.leaf,
                    o.a0 - 0.02,
                    o.y0 + 0.01,
                    at + out * c0,
                    o.a0 + 0.03,
                    o.y1 - 0.02,
                    at + out * (c0 - width),
                    { collide: false }
                )
            else
                this.box(
                    o.leaf,
                    at + out * c0,
                    o.y0 + 0.01,
                    o.a0 - 0.02,
                    at + out * (c0 - width),
                    o.y1 - 0.02,
                    o.a0 + 0.03,
                    { collide: false }
                )
            // Threshold.
            piece('trim', o.a0, o.a1, o.y0, o.y0 + 0.015, -t, 0.03)
        }
    }

    /**
     * A gable roof over x0..x1, z0..z1 from the eave height `eave`, rising `rise` to its ridge (along
     * x or z), overhanging by `over`: two shingled slabs, the gable ends walled in `endMat`, fascia,
     * soffits, gutters and downspouts.
     */
    gableRoof(
        x0: number,
        x1: number,
        z0: number,
        z1: number,
        eave: number,
        rise: number,
        along: 'x' | 'z',
        over: number,
        mat: ErablesMaterial,
        endMat: ErablesMaterial,
        /**
         * The overhang past each gable end (at x0 and x1 for a ridge along x; along z, at z1 and z0):
         * 0 where the roof meets a taller wall.
         */
        ends: [number, number] = [over, over],
        /** Walls in the gable ends (false where a taller wall already closes it). */
        gables: [boolean, boolean] = [true, true],
        /**
         * Fitted (newer assets): the gable's siding stops under the roof slab instead of reaching its
         * top (where the two flickered and the wall showed through the shingles), and the rake boards
         * sit outside the slab's end, flush with its top, instead of standing proud of it.
         */
        opts: { fitted?: boolean } = {}
    ): void {
        const g = this.group((x0 + x1) / 2, 0, (z0 + z1) / 2, along === 'x' ? 0 : Math.PI / 2)
        const length = along === 'x' ? x1 - x0 : z1 - z0
        const depth = along === 'x' ? z1 - z0 : x1 - x0
        const hd = depth / 2
        const angle = Math.atan2(rise, hd)
        const thick = 0.16
        const run = hd + over
        const slope = run / Math.cos(angle)
        const a0 = -length / 2 - ends[0]
        const a1 = length / 2 + ends[1]
        for (const s of [-1, 1]) {
            // Its top face from the eave edge to the ridge.
            const ez = s * run
            const ey = eave - over * Math.tan(angle)
            const cz = ez / 2
            const cy = (ey + eave + rise) / 2
            const geometry = new BoxGeometry(a1 - a0, thick, slope).translate((a0 + a1) / 2, -thick / 2, 0)
            this.put(geometry, mat, { parent: g, x: 0, y: cy, z: cz, rx: s * angle })
            // Fascia along the eave, a gutter on it, a soffit back to the wall.
            this.box('trim', a0, ey - 0.22, ez - s * 0.02, a1, ey, ez + s * 0.02, {
                parent: g,
                collide: false,
                cast: false,
            })
            this.box('paintWhite', a0, ey - 0.18, ez + s * 0.02, a1, ey - 0.06, ez + s * 0.12, {
                parent: g,
                collide: false,
                cast: false,
            })
            this.box('soffit', a0, ey - 0.2, s * hd, a1, ey - 0.18, ez, { parent: g, collide: false, cast: false })
            // Downspouts at the corners: down the wall from under the gutter.
            for (const end of [-1, 1]) {
                const dx = end * (length / 2 - 0.12)
                this.box('paintWhite', dx - 0.04, 0.2, s * (hd + 0.02), dx + 0.04, ey - 0.2, s * (hd + 0.1), {
                    parent: g,
                    collide: false,
                    cast: false,
                })
                this.box('paintWhite', dx - 0.04, ey - 0.2, s * (hd + 0.02), dx + 0.04, ey - 0.12, ez + s * 0.1, {
                    parent: g,
                    collide: false,
                    cast: false,
                })
            }
        }
        // Gable ends: a triangle of siding at each end, and rake boards up the slopes.
        const fitted = opts.fitted ?? false
        // Fitted: the triangle's sloped edges follow the slab's underside (a slab's thickness lower).
        const drop = fitted ? thick / Math.cos(angle) + 0.01 : 0
        const triangle = new Shape()
        triangle.moveTo(-(hd - drop / Math.tan(angle)), 0)
        triangle.lineTo(hd - drop / Math.tan(angle), 0)
        triangle.lineTo(0, rise - drop)
        triangle.closePath()
        for (const end of [-1, 1]) {
            if (!gables[end === -1 ? 0 : 1]) continue
            const geometry = new ExtrudeGeometry(triangle, { depth: 0.2, bevelEnabled: false })
            this.put(geometry, endMat, {
                parent: g,
                x: end === -1 ? -length / 2 : length / 2 - 0.2,
                y: eave,
                z: 0,
                ry: Math.PI / 2,
            })
            for (const s of [-1, 1]) {
                const rake = new BoxGeometry(0.06, 0.2, slope + 0.05)
                const mid = (eave - over * Math.tan(angle) + eave + rise) / 2
                this.put(rake, 'trim', {
                    parent: g,
                    // Fitted: just outside the slab's end, its top flush with the roof's (moved down its slope's normal).
                    x: fitted ? (end === -1 ? a0 - 0.03 : a1 + 0.03) : end === -1 ? a0 : a1,
                    y: fitted ? mid - 0.1 * Math.cos(angle) : mid - 0.08,
                    z: fitted ? (s * run) / 2 - s * 0.1 * Math.sin(angle) : (s * run) / 2,
                    rx: s * angle,
                    collide: false,
                    cast: false,
                })
            }
        }
    }

    /** A brick chimney through a roof. */
    chimney(x: number, z: number, from: number, to: number): void {
        this.block('brick', 0.9, to - from, 0.7, x, from, z)
        this.block('concrete', 1.0, 0.08, 0.8, x, to, z, { collide: false })
        this.cyl('metalDark', 0.1, 0.1, 0.35, x + 0.2, to + 0.08, z, 10, { collide: false })
    }

    // --- Furniture (all standing on y) ----------------------------------------------------------

    sofa(x: number, y: number, z: number, ry: number, mat: ErablesMaterial = 'sofa', seats = 3): void {
        const g = this.group(x, y, z, ry)
        const w = 0.75 * seats + 0.4
        this.box(mat, -w / 2, 0.08, -0.45, w / 2, 0.45, 0.45, { parent: g })
        this.box(mat, -w / 2, 0.45, 0.25, w / 2, 0.95, 0.45, { parent: g })
        for (const s of [-1, 1])
            this.box(mat, (s * w) / 2 - 0.2, 0.45, -0.45, (s * w) / 2, 0.68, 0.45, { parent: g, collide: false })
        for (let i = 0; i < seats; i++) {
            const cx = -w / 2 + 0.2 + 0.75 * i + 0.375
            this.box(mat, cx - 0.36, 0.45, -0.42, cx + 0.36, 0.56, 0.22, { parent: g, collide: false })
        }
        for (const s of [-1, 1])
            for (const t of [-1, 1])
                this.box(
                    'wood',
                    s * (w / 2 - 0.1) - 0.03,
                    0,
                    t * 0.35 - 0.03,
                    s * (w / 2 - 0.1) + 0.03,
                    0.08,
                    t * 0.35 + 0.03,
                    { parent: g, collide: false, cast: false }
                )
    }

    armchair(x: number, y: number, z: number, ry: number, mat: ErablesMaterial = 'sofaGreen'): void {
        const g = this.group(x, y, z, ry)
        this.box(mat, -0.45, 0.1, -0.42, 0.45, 0.45, 0.42, { parent: g })
        this.box(mat, -0.45, 0.45, 0.22, 0.45, 1.0, 0.42, { parent: g, collide: false })
        for (const s of [-1, 1])
            this.box(mat, s * 0.45 - (s > 0 ? 0.18 : -0.18), 0.45, -0.42, s * 0.45, 0.66, 0.42, {
                parent: g,
                collide: false,
            })
    }

    table(
        x: number,
        y: number,
        z: number,
        w: number,
        d: number,
        h: number,
        mat: ErablesMaterial = 'wood',
        ry = 0
    ): Group {
        const g = this.group(x, y, z, ry)
        this.box(mat, -w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, { parent: g })
        for (const s of [-1, 1])
            for (const t of [-1, 1])
                this.box(
                    mat,
                    s * (w / 2 - 0.07) - 0.03,
                    0,
                    t * (d / 2 - 0.07) - 0.03,
                    s * (w / 2 - 0.07) + 0.03,
                    h - 0.04,
                    t * (d / 2 - 0.07) + 0.03,
                    { parent: g, collide: false }
                )
        return g
    }

    chair(x: number, y: number, z: number, ry: number, mat: ErablesMaterial = 'wood'): void {
        const g = this.group(x, y, z, ry)
        this.box(mat, -0.21, 0.44, -0.2, 0.21, 0.48, 0.2, { parent: g, collide: false })
        this.box(mat, -0.21, 0.48, 0.17, 0.21, 0.92, 0.2, { parent: g, collide: false })
        for (const s of [-1, 1])
            for (const t of [-1, 1])
                this.box(mat, s * 0.18 - 0.02, 0, t * 0.17 - 0.02, s * 0.18 + 0.02, 0.44, t * 0.17 + 0.02, {
                    parent: g,
                    collide: false,
                    cast: false,
                })
    }

    bed(x: number, y: number, z: number, ry: number, w = 1.5): void {
        const g = this.group(x, y, z, ry)
        this.box('wood', -w / 2 - 0.05, 0, -1.05, w / 2 + 0.05, 0.3, 1.0, { parent: g })
        this.box('bedding', -w / 2, 0.3, -1.0, w / 2, 0.55, 0.95, { parent: g })
        this.box('wood', -w / 2 - 0.07, 0, 1.0, w / 2 + 0.07, 1.05, 1.08, { parent: g })
        for (const s of [-1, 1])
            this.box('paintWhite', (s * w) / 4 - 0.3, 0.55, 0.55, (s * w) / 4 + 0.3, 0.68, 0.85, {
                parent: g,
                collide: false,
            })
        this.box('sofaGreen', -w / 2 - 0.02, 0.4, -0.98, w / 2 + 0.02, 0.57, -0.2, { parent: g, collide: false })
    }

    dresser(x: number, y: number, z: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('cabinetWood', -0.6, 0, -0.25, 0.6, 0.85, 0.25, { parent: g })
        for (let i = 0; i < 3; i++)
            this.box('chrome', -0.1, 0.2 + i * 0.25, -0.27, 0.1, 0.22 + i * 0.25, -0.25, {
                parent: g,
                collide: false,
                cast: false,
            })
    }

    bookshelf(x: number, y: number, z: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('cabinetWhite', -0.45, 0, -0.17, 0.45, 1.9, 0.17, { parent: g })
        const R = this.R
        for (let shelf = 0; shelf < 4; shelf++) {
            let a = -0.4
            while (a < 0.38) {
                const bw = 0.03 + R() * 0.04
                const bh = 0.2 + R() * 0.12
                const mat = (['paintRed', 'paintBlue', 'paintGreen', 'paintWhite', 'doorRed'] as const)[
                    Math.floor(R() * 5)
                ]!
                this.box(mat, a, 0.08 + shelf * 0.45, -0.19, a + bw, 0.08 + shelf * 0.45 + bh, 0.05, {
                    parent: g,
                    collide: false,
                    cast: false,
                })
                a += bw + 0.005
            }
        }
    }

    tv(x: number, y: number, z: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('cabinetWood', -0.8, 0, -0.22, 0.8, 0.5, 0.22, { parent: g })
        this.box('metalDark', -0.62, 0.55, -0.03, 0.62, 1.28, 0.02, { parent: g, collide: false })
        this.box('screen', -0.6, 0.57, -0.035, 0.6, 1.26, -0.03, { parent: g, collide: false, cast: false })
        this.box('metalDark', -0.08, 0.5, -0.06, 0.08, 0.55, 0.06, { parent: g, collide: false })
    }

    /** A kitchen run along x from a0 to a1, backed on z = back (counter toward +front). */
    kitchenRun(a0: number, a1: number, back: number, front: 1 | -1, y: number, uppers = true): void {
        const deep = 0.62
        const z0 = back
        const z1 = back + front * deep
        this.box('cabinetWhite', a0, y + 0.1, z0, a1, y + 0.88, z1 - front * 0.02)
        this.box('wood', a0, y, z0, a1, y + 0.1, z1 - front * 0.06, { collide: false })
        this.box('counter', a0, y + 0.88, z0, a1, y + 0.92, z1 + front * 0.02, { collide: false })
        // Doors and their pulls.
        for (let a = a0; a + 0.45 <= a1 + 0.01; a += 0.6) {
            this.box('trim', a + 0.02, y + 0.14, z1 - front * 0.02, a + 0.58, y + 0.84, z1 - front * 0.005, {
                collide: false,
                cast: false,
            })
            this.box('chrome', a + 0.45, y + 0.7, z1, a + 0.48, y + 0.8, z1 + front * 0.02, {
                collide: false,
                cast: false,
            })
        }
        if (uppers) {
            this.box('cabinetWhite', a0, y + 1.45, z0, a1, y + 2.2, z0 + front * 0.35, { collide: false })
            this.box('counter', a0 + 0.02, y + 1.0, z0 + front * 0.004, a1 - 0.02, y + 1.45, z0 + front * 0.008, {
                collide: false,
                cast: false,
            })
        }
    }

    fridge(x: number, y: number, z: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('steel', -0.42, 0, -0.38, 0.42, 1.82, 0.38, { parent: g })
        this.box('chrome', -0.36, 0.9, -0.4, -0.33, 1.6, -0.38, { parent: g, collide: false, cast: false })
        this.box('metalDark', -0.42, 1.15, -0.385, 0.42, 1.165, -0.38, { parent: g, collide: false, cast: false })
    }

    stove(x: number, y: number, z: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('steel', -0.38, 0, -0.32, 0.38, 0.92, 0.32, { parent: g })
        this.box('metalDark', -0.36, 0.92, -0.3, 0.36, 0.94, 0.3, { parent: g, collide: false, cast: false })
        this.box('carGlass', -0.3, 0.25, -0.33, 0.3, 0.7, -0.32, { parent: g, collide: false, cast: false })
        this.box('steel', -0.38, 0.92, 0.25, 0.38, 1.12, 0.32, { parent: g, collide: false })
    }

    lamp(x: number, y: number, z: number): void {
        this.cyl('metalDark', 0.15, 0.15, 0.03, x, y, z, 12, { collide: false, cast: false })
        this.cyl('metalDark', 0.015, 0.015, 1.4, x, y, z, 6, { collide: false, cast: false })
        this.cyl('paintWhite', 0.14, 0.22, 0.28, x, y + 1.3, z, 16, { collide: false, cast: false })
    }

    /** A framed picture on a wall (its face toward +normal on x or z). */
    picture(axis: 'x' | 'z', at: number, a: number, y: number, w: number, h: number, facing: 1 | -1): void {
        if (axis === 'x') {
            this.box(
                'wood',
                a - w / 2 - 0.03,
                y - h / 2 - 0.03,
                at,
                a + w / 2 + 0.03,
                y + h / 2 + 0.03,
                at + facing * 0.025,
                { collide: false, cast: false }
            )
            this.box('art', a - w / 2, y - h / 2, at + facing * 0.025, a + w / 2, y + h / 2, at + facing * 0.03, {
                collide: false,
                cast: false,
            })
        } else {
            this.box(
                'wood',
                at,
                y - h / 2 - 0.03,
                a - w / 2 - 0.03,
                at + facing * 0.025,
                y + h / 2 + 0.03,
                a + w / 2 + 0.03,
                { collide: false, cast: false }
            )
            this.box('art', at + facing * 0.025, y - h / 2, a - w / 2, at + facing * 0.03, y + h / 2, a + w / 2, {
                collide: false,
                cast: false,
            })
        }
    }

    /** A ceiling light (a glowing dome; no light of its own). */
    ceilingLight(x: number, y: number, z: number): void {
        const geometry = new SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
        this.put(geometry, 'lamp', { x, y, z, collide: false, cast: false })
    }

    // --- Outside ---------------------------------------------------------------------------------

    /** A wheeled bin (recycling blue, compost brown, garbage grey) at the curb. */
    bin(mat: ErablesMaterial, x: number, z: number, ry: number, y: number): void {
        const g = this.group(x, y, z, ry)
        const body = new CylinderGeometry(0.36, 0.3, 0.95, 4, 1)
            .rotateY(Math.PI / 4)
            .scale(1, 1, 1.15)
            .translate(0, 0.5, 0)
        this.put(body, mat, { parent: g })
        this.box(mat, -0.32, 0.97, -0.38, 0.32, 1.03, 0.42, { parent: g, collide: false })
        for (const s of [-1, 1]) {
            const wheel = new CylinderGeometry(0.1, 0.1, 0.05, 10).rotateZ(Math.PI / 2)
            this.put(wheel, 'rubber', { parent: g, x: s * 0.25, y: 0.1, z: 0.35, collide: false, cast: false })
        }
    }

    leafBag(x: number, z: number, y: number, ry: number): void {
        this.block('leafBag', 0.42, 0.82, 0.3, x, y, z, { ry })
        this.block('leafBag', 0.4, 0.08, 0.28, x, y + 0.82, z, { ry: ry + 0.2, collide: false, cast: false })
    }

    pumpkin(x: number, z: number, y: number, r = 0.16): void {
        const geometry = new SphereGeometry(r, 12, 8).scale(1, 0.78, 1)
        this.put(geometry, 'pumpkin', { x, y: y + r * 0.75, z, collide: false, cast: false })
        this.cyl('paintGreen', 0.015, 0.02, 0.06, x, y + r * 1.45, z, 5, { collide: false, cast: false })
    }

    /** A cedar privacy fence from (x0, z0) to (x1, z1): posts every 2.4 m and a board panel between. */
    fence(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.8): void {
        const length = Math.hypot(x1 - x0, z1 - z0)
        const ry = -Math.atan2(z1 - z0, x1 - x0)
        const g = this.group(x0, y, z0, ry)
        this.box('cedar', 0, 0.05, -0.02, length, h, 0.02, { parent: g })
        const posts = Math.max(1, Math.round(length / 2.4))
        for (let i = 0; i <= posts; i++) {
            const a = (length * i) / posts
            this.box('cedar', a - 0.05, 0, -0.06, a + 0.05, h + 0.08, 0.06, { parent: g, collide: false })
        }
        this.box('cedar', 0, h - 0.04, -0.05, length, h + 0.02, 0.05, { parent: g, collide: false, cast: false })
    }

    /** A wooden utility pole with its crossarm, a transformer and a street light over the road. */
    pole(x: number, z: number, y: number, armToward: 1 | -1): Vector3 {
        this.cyl('bark', 0.13, 0.17, 10.5, x, y, z, 10)
        this.box('wood', x - 1.1, y + 9.6, z - 0.06, x + 1.1, y + 9.75, z + 0.06, { collide: false })
        for (const dx of [-0.9, 0, 0.9])
            this.cyl('paintWhite', 0.04, 0.05, 0.14, x + dx, y + 9.75, z, 6, { collide: false, cast: false })
        this.cyl('paintSilver', 0.28, 0.28, 0.85, x + 0.3, y + 8.2, z, 12, { collide: false })
        // The street light: an arm out over the street, a cobra head on it.
        const arm0 = new Vector3(x, y + 7.2, z)
        const arm1 = new Vector3(x, y + 7.6, z + armToward * 2.3)
        this.rod('paintSilver', arm0, arm1, 0.045, { collide: false, cast: false })
        this.box('paintSilver', x - 0.2, y + 7.42, z + armToward * 2.2, x + 0.2, y + 7.62, z + armToward * 2.85, {
            collide: false,
        })
        this.box('lamp', x - 0.16, y + 7.4, z + armToward * 2.25, x + 0.16, y + 7.43, z + armToward * 2.8, {
            collide: false,
            cast: false,
        })
        return new Vector3(x, y + 9.75, z)
    }

    /** A sagging wire from a to b (drawn only). */
    wire(a: Vector3, b: Vector3, sag = 0.5): void {
        const mid = a.clone().add(b).multiplyScalar(0.5)
        mid.y -= sag
        const curve = new CatmullRomCurve3([
            a,
            a
                .clone()
                .lerp(mid, 0.5)
                .setY(a.y - sag * 0.7),
            mid,
            b
                .clone()
                .lerp(mid, 0.5)
                .setY(b.y - sag * 0.7),
            b,
        ])
        this.put(new TubeGeometry(curve, 16, 0.012, 4), 'metalDark', { collide: false, cast: false })
    }

    /** A concrete jersey barrier, 3 m along its axis (x or z). */
    jersey(x: number, z: number, y: number, ry: number): void {
        const shape = new Shape()
        shape.moveTo(-0.3, 0)
        shape.lineTo(0.3, 0)
        shape.lineTo(0.18, 0.25)
        shape.lineTo(0.09, 0.82)
        shape.lineTo(-0.09, 0.82)
        shape.lineTo(-0.18, 0.25)
        shape.closePath()
        const geometry = new ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }).translate(0, 0, -1.5)
        this.put(geometry, 'concrete', { x, y, z, ry })
        // Its reflective stripe.
        const g = this.group(x, y, z, ry)
        for (const s of [-1, 1])
            this.box('hazard', s * 0.135 - 0.01, 0.4, -1.2, s * 0.135 + 0.01, 0.55, 1.2, {
                parent: g,
                collide: false,
                cast: false,
                rz: s * 0.08,
            })
    }

    cone(x: number, z: number, y: number): void {
        this.box('cone', x - 0.18, y, z - 0.18, x + 0.18, y + 0.03, z + 0.18, { collide: false, cast: false })
        this.put(new ConeGeometry(0.13, 0.62, 12).translate(0, 0.33, 0), 'cone', { x, y, z, collide: false })
        this.put(new CylinderGeometry(0.075, 0.095, 0.1, 12).translate(0, 0.33, 0), 'paintWhite', {
            x,
            y,
            z,
            collide: false,
            cast: false,
        })
    }

    /** An in-ground trampoline: its mat flush with the lawn (a jump pad: it throws you up), the blue pad round it. */
    trampoline(x: number, z: number, y: number, r: number): void {
        this.cyl('rubber', r, r, 0.06, x, y - 0.01, z, 32)
        const pad = new TorusGeometry(r + 0.12, 0.13, 6, 40).rotateX(Math.PI / 2).scale(1, 0.4, 1)
        this.put(pad, 'paintBlue', { x, y: y + 0.03, z, collide: false, cast: false })
    }

    /** A firewood stack (a corde), a tarp over it. */
    woodpile(x: number, z: number, y: number, length: number, ry: number): void {
        const g = this.group(x, y, z, ry)
        this.box('firewood', -length / 2, 0.1, -0.24, length / 2, 1.3, 0.24, { parent: g })
        this.box('wood', -length / 2, 0, -0.3, length / 2, 0.1, 0.3, { parent: g, collide: false })
        this.box('tarp', -length / 2 - 0.05, 1.3, -0.35, length / 2 + 0.05, 1.36, 0.35, { parent: g, collide: false })
    }

    /** A garden shed (cabanon): siding, a gable roof, a door left open toward `doorSide`. */
    shed(
        x0: number,
        z0: number,
        x1: number,
        z1: number,
        y: number,
        siding: ErablesMaterial,
        door: 'x0' | 'x1' | 'z0' | 'z1',
        /** The fitted roof (gables under the slab, rakes flush): newer versions. */
        fitted = false
    ): void {
        const top = y + 2.2
        const t = 0.12
        const mid = (a: number, b: number) => (a + b) / 2
        const doorOn = (side: string, a0: number, a1: number): Opening[] =>
            door === side
                ? [
                      {
                          a0: mid(a0, a1) - 0.6,
                          a1: mid(a0, a1) + 0.6,
                          y0: y + 0.05,
                          y1: y + 1.95,
                          kind: 'door',
                          leaf: 'doorGreen',
                      },
                  ]
                : []
        this.box('wood', x0, y - 0.1, z0, x1, y + 0.05, z1)
        this.wall('x', z0, x0, x1, y, top, t, 1, siding, 'wood', doorOn('z0', x0, x1))
        this.wall('x', z1, x0, x1, y, top, t, -1, siding, 'wood', doorOn('z1', x0, x1))
        this.wall('z', x0, z0 + t, z1 - t, y, top, t, 1, siding, 'wood', doorOn('x0', z0, z1))
        this.wall('z', x1, z0 + t, z1 - t, y, top, t, -1, siding, 'wood', doorOn('x1', z0, z1))
        this.gableRoof(
            x0,
            x1,
            z0,
            z1,
            top,
            1.0,
            Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z',
            0.25,
            'shingleGrey',
            siding,
            undefined,
            undefined,
            { fitted }
        )
    }
}
