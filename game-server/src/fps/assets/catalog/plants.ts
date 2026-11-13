import { BoxGeometry, type BufferGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, Vector3 } from 'three'
import type { Builder, ErablesMaterial, TreeSpot } from '../kit.ts'
import { defineAsset } from '../types.ts'

/** A smooth pseudo-random field in 3D (no state: the same everywhere it's built). */
function field(x: number, y: number, z: number): number {
    const s =
        Math.sin(x * 1.7 + y * 3.1 + z * 2.3) * 0.5 +
        Math.sin(x * 4.3 - z * 3.7 + y * 1.9) * 0.3 +
        Math.sin(z * 6.1 + x * 2.9 - y * 5.3) * 0.2
    return s * 0.5 + 0.5
}

/** Pushes each vertex along its direction from the middle by the field (lumpy foliage). */
function lumpy(g: BufferGeometry, amount: number, scale = 2): BufferGeometry {
    const p = g.attributes.position!
    const v = new Vector3()
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i)
        const n = v.clone().normalize()
        v.addScaledVector(n, (field(v.x * scale, v.y * scale, v.z * scale) - 0.5) * amount)
        p.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
}

/** A rod tapering from r0 at a to r1 at b. */
function limb(
    b: Builder,
    mat: ErablesMaterial,
    from: Vector3,
    to: Vector3,
    r0: number,
    r1: number,
    collide = false
): void {
    const along = to.clone().sub(from)
    const geometry = new CylinderGeometry(r1, r0, along.length(), 9).translate(0, along.length() / 2, 0)
    const mesh = b.put(geometry, mat, { x: from.x, y: from.y, z: from.z, collide, cast: true })
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), along.normalize())
}

const SPECIES = {
    // Where the trunk forks (share of the height), how many limbs, how steep (from upright), the clumps' size, inner fill.
    maple: { fork: 0.3, limbs: 6, tilt: [0.7, 1.0], clump: 0.44, girth: 1, fill: 5 },
    oak: { fork: 0.27, limbs: 7, tilt: [0.95, 1.25], clump: 0.46, girth: 1.3, fill: 6 },
    birch: { fork: 0.45, limbs: 4, tilt: [0.35, 0.6], clump: 0.46, girth: 0.6, fill: 3 },
} as const

/**
 * A tree, version 2: a leaning trunk forking into limbs and branches (tapered, the trunk solid),
 * its leaves gathered in clumps at the branch tips (recorded for the browser's leaf cards), the
 * whole fitted to the asked height and spread. Furrowed bark, or a birch's white; a cedar is
 * stacked uneven tiers of scaly green.
 */
function treeV2(b: Builder, kind: TreeSpot['kind'], tint: TreeSpot['tint'], height: number, crown: number): void {
    const R = b.R
    if (kind === 'cedar') {
        const trunkR = 0.1 + height * 0.012
        b.cyl('barkFurrowed', trunkR * 0.8, trunkR, 0.6, 0, 0, 0, 8)
        b.cyl('barkFurrowed', trunkR * 0.5, trunkR * 0.8, height * 0.6, 0, 0, 0, 8)
        // A thuya: a dense, lumpy column, widest a third of the way up, rounding to a soft point.
        const r = crown * 0.5
        const body = lumpy(new SphereGeometry(1, 22, 20), 0.34, 3.2)
        const pos = body.attributes.position!
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i)
            const t = (y + 1) / 2
            const taper = t < 0.35 ? 0.75 + t * 0.7 : 1 - Math.pow((t - 0.35) / 0.65, 1.6) * 0.8
            pos.setXYZ(i, pos.getX(i) * r * taper, t * (height - 0.3) + 0.25, pos.getZ(i) * r * taper)
        }
        body.computeVertexNormals()
        b.put(body, 'cedarFoliage', { collide: false, ry: R() * 6.28 })
        b.trees.push({ x: 0, z: 0, y: 0, height, crown, kind, tint, clusters: [] })
        return
    }
    const spec = SPECIES[kind]
    const bark: ErablesMaterial = kind === 'birch' ? 'barkBirch' : 'barkFurrowed'
    const r0 = (0.12 + height * 0.022) * spec.girth
    const lean = new Vector3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize()
    const forkY = height * spec.fork
    // Birches grow as two or three stems from the ground; the others as one trunk to a fork.
    const stems = kind === 'birch' ? 2 + Math.floor(R() * 2) : 1
    const forks: Array<{ at: Vector3; r: number }> = []
    for (let s = 0; s < stems; s++) {
        const away =
            stems > 1
                ? new Vector3(Math.cos((s / stems) * 6.28), 0, Math.sin((s / stems) * 6.28)).multiplyScalar(0.12)
                : new Vector3()
        const dir = lean.clone().add(away).normalize()
        const top = dir.clone().multiplyScalar(forkY / dir.y)
        const r = stems > 1 ? r0 * 0.75 : r0
        // The trunk in two bent pieces, solid; the flare at its foot.
        const mid = top
            .clone()
            .multiplyScalar(0.5)
            .add(new Vector3((R() - 0.5) * 0.15, 0, (R() - 0.5) * 0.15))
        limb(b, bark, away.clone().multiplyScalar(0.5), mid, r, r * 0.85, true)
        limb(b, bark, mid, top, r * 0.85, r * 0.7, true)
        b.cyl(bark, r, r * 1.55, 0.35, away.x * 0.5, 0, away.z * 0.5, 10, { collide: false })
        forks.push({ at: top, r: r * 0.7 })
    }
    // Limbs out of the fork(s), branches out of the limbs, a clump at each tip.
    const tips: Array<[Vector3, number]> = []
    const limbs = spec.limbs
    for (let i = 0; i < limbs; i++) {
        const fork = forks[i % forks.length]!
        const az = (i / limbs) * Math.PI * 2 + R() * 0.7
        const tilt = spec.tilt[0] + R() * (spec.tilt[1] - spec.tilt[0])
        const dir = new Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az))
        const length = crown * (0.75 + R() * 0.3)
        const end = fork.at.clone().addScaledVector(dir, length)
        limb(b, bark, fork.at, end, fork.r * 0.7, fork.r * 0.32)
        tips.push([end, spec.clump])
        for (let k = 0; k < 2; k++) {
            const from = fork.at.clone().lerp(end, 0.45 + k * 0.3)
            const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar((k ? 1 : -1) * (0.5 + R() * 0.4))
            const bdir = dir
                .clone()
                .add(side)
                .add(new Vector3(0, 0.45, 0))
                .normalize()
            const bend = from.clone().addScaledVector(bdir, length * (0.4 + R() * 0.2))
            limb(b, bark, from, bend, fork.r * 0.3, fork.r * 0.12)
            tips.push([bend, spec.clump * 0.85])
        }
    }
    // The leader: one more clump up the middle (maples and birches are taller than wide), and
    // clumps inside the crown so it reads full, with only a few gaps.
    const heart = forks[0]!.at.clone().add(new Vector3(0, crown * (kind === 'oak' ? 0.45 : 0.75), 0))
    tips.push([heart.clone().add(new Vector3(0, crown * 0.35, 0)), spec.clump * 1.1])
    for (let k = 0; k < spec.fill; k++) {
        const a = R() * Math.PI * 2
        const d = crown * (0.25 + R() * 0.35)
        tips.push([
            heart.clone().add(new Vector3(Math.cos(a) * d, (R() - 0.3) * crown * 0.5, Math.sin(a) * d)),
            spec.clump * (0.9 + R() * 0.3),
        ])
    }
    // Fitted: the clumps' top at the asked height.
    const top = Math.max(...tips.map(([p, k]) => p.y + crown * k))
    const stretch = (height - forkY) / Math.max(0.5, top - forkY)
    const clusters = tips.map(([p, k]): [number, number, number, number] => [
        p.x,
        forkY + (p.y - forkY) * stretch,
        p.z,
        crown * k,
    ])
    b.trees.push({ x: 0, z: 0, y: 0, height, crown, kind, tint, clusters })
}

/**
 * A tree: its trunk and limbs here (the trunk collides), its crown of leaves added by the browser
 * from the spot the kit records (`Builder.trees`). Maple, oak or birch in October colours, or a
 * cedar spire.
 */
export const TREE = defineAsset({
    id: 'tree',
    name: 'Tree',
    category: 'trees & plants',
    defaults: { kind: 'maple', tint: 'red', height: 10, crown: 3.8 },
    params: {
        kind: { label: 'Species', options: ['maple', 'oak', 'birch', 'cedar'] },
        tint: { label: 'Leaves', options: ['red', 'orange', 'yellow', 'rust', 'green'] },
        height: { label: 'Height', min: 4, max: 16, step: 0.5 },
        crown: { label: 'Crown radius', min: 1.5, max: 6, step: 0.1 },
    },
    variants: [
        {},
        { kind: 'maple', tint: 'orange' },
        { kind: 'oak', tint: 'rust', height: 12, crown: 4.4 },
        { kind: 'birch', tint: 'yellow', height: 9, crown: 2.6 },
        { kind: 'cedar', tint: 'green', height: 8, crown: 2.5 },
    ],
    size: [8, 11, 8],
    current: {
        version: 2,
        notes: 'A leaning trunk (solid) forking into limbs and branches, tapered, in furrowed bark or a birch’s white; the leaves in clumps at the branch tips, lighter on top, and more inside, so the crown reads full with lumps and a few gaps; birches as two or three white stems; a cedar (thuya) as a dense, lumpy column of scaly green. Three rounds.',
        build(b, p) {
            treeV2(b, p.kind as TreeSpot['kind'], p.tint as TreeSpot['tint'], p.height as number, p.crown as number)
        },
    },
})

/** A clipped cedar hedge (thuyas), `length` along x, `depth` across. */
export const HEDGE = defineAsset({
    id: 'hedge',
    name: 'Cedar hedge',
    category: 'trees & plants',
    defaults: { length: 6, depth: 0.8, height: 2.2 },
    params: {
        length: { label: 'Length', min: 1, max: 30, step: 0.5 },
        depth: { label: 'Depth', min: 0.5, max: 1.5, step: 0.1 },
        height: { label: 'Height', min: 0.8, max: 4, step: 0.1 },
    },
    variants: [{}, { height: 3.6, length: 8 }],
    size: [6, 2.4, 0.8],
    current: {
        version: 2,
        notes: 'A clipped hedge with a rounded top and soft, uneven faces (a subdivided block pushed in and out), in scaly cedar green, a little narrower at the foot; it still collides as its box. One round.',
        build(b, p) {
            const l = p.length as number
            const d = p.depth as number
            const h = p.height as number
            const g = new BoxGeometry(
                l,
                h,
                d,
                Math.max(4, Math.round(l / 0.3)),
                Math.max(3, Math.round(h / 0.3)),
                Math.max(2, Math.round(d / 0.25))
            )
            const pos = g.attributes.position!
            const v = new Vector3()
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i)
                const up = (v.y + h / 2) / h
                // Rounded shoulders: the top's edges pulled in and down.
                const edge = Math.abs(v.z) / (d / 2)
                if (up > 0.8) v.y -= Math.pow(edge, 4) * d * 0.25 * ((up - 0.8) / 0.2)
                const side = Math.abs(v.x) / (l / 2)
                if (up > 0.8 && side > 0.9) v.y -= ((side - 0.9) / 0.1) * d * 0.15
                // Narrower at the foot, uneven all over.
                v.z *= 0.88 + 0.12 * Math.min(1, up * 3)
                const n = (field(v.x * 2.2, v.y * 2.2, v.z * 2.2) - 0.5) * 0.12
                v.z += Math.sign(v.z || 1) * n
                if (up > 0.95) v.y += n * 0.6
                pos.setXYZ(i, v.x, v.y + h / 2, v.z)
            }
            g.computeVertexNormals()
            b.put(g, 'cedarFoliage', { collide: false })
            b.solid(new BoxGeometry(l, h, d).translate(0, h / 2, 0))
        },
    },
})

export const SHRUB = defineAsset({
    id: 'shrub',
    name: 'Shrub',
    category: 'trees & plants',
    defaults: { radius: 0.42 },
    params: { radius: { label: 'Radius', min: 0.15, max: 1.2, step: 0.05 } },
    variants: [{ radius: 0.25 }, {}, { radius: 0.8 }],
    size: [1, 0.8, 1],
    current: {
        version: 2,
        notes: 'A lumpy, slightly squat mound of scaly green (an icosahedron pushed in and out), sitting into the bed. One round.',
        build(b, p) {
            const r = p.radius as number
            const g = lumpy(new IcosahedronGeometry(r, 3), r * 0.35, 3 / r).scale(1, 0.78, 1)
            b.put(g, 'cedarFoliage', { y: r * 0.62, collide: false })
        },
    },
})

/** A mound of raked leaves (drawn only); the browser strews more on it. */
export const LEAF_PILE = defineAsset({
    id: 'leaf-pile',
    name: 'Leaf pile',
    category: 'trees & plants',
    defaults: { radius: 1.2 },
    params: { radius: { label: 'Radius', min: 0.4, max: 2.5, step: 0.1 } },
    variants: [{ radius: 0.8 }, {}],
    size: [2.4, 0.7, 2.4],
    current: {
        version: 2,
        notes: 'An uneven heap (lumps and a slumped side) under the leaves texture, the browser’s fallen leaves strewn over it. One round.',
        build(b, p) {
            const r = p.radius as number
            const g = lumpy(new SphereGeometry(r, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), r * 0.3, 2.5 / r).scale(
                1,
                0.5,
                1
            )
            const pos = g.attributes.position!
            for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0)
            g.computeVertexNormals()
            b.put(g, 'leaves', { collide: false })
            b.piles.push({ x: 0, y: 0, z: 0, r })
        },
    },
})
