/**
 * The people in the office: a jointed office worker, 40 cm tall (the mini the server collides and
 * shoots: feet at 0, the crown at PLAYER.height), with an adult's proportions: a head an eighth of
 * the height, shoulders, a waist, hips, knees, elbows, hands.
 *
 * Rigid parts on joints, no skinning: the torso and head are fixed shapes (merged per material);
 * each limb is an upper and a lower segment that two-bone IK (`twoBone`) bends at the knee or elbow
 * to put the foot or the wrist where the trooper code wants it. `avatars.ts` does the posing (where
 * the feet go, where the gun puts the hands); this builds the body and says how it's jointed.
 *
 * Each person is dressed by `lookFor` from their id: skin, hair, a shirt and tie or a hoodie,
 * trousers, sneakers, and a lanyard badge, the tie or the hoodie in their colour (their team's in
 * the team modes). Built from plain shapes in code: no files, and tests run without a DOM.
 */

import {
    BoxGeometry,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Group,
    type Material,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { applyFinish } from './finish.ts'
import { mergeByMaterial } from './guns.ts'

// --- Proportions (m; feet at 0, facing -Z, their right at +X) -----------------------------------

export const BODY = {
    /** Hip joints: height, and each one's distance from the middle. */
    hipY: 0.195,
    hipX: 0.027,
    thigh: 0.092,
    shin: 0.087,
    /** The ankle above the floor, standing. */
    ankle: 0.016,
    /** Shoulder joints: height, and each one's distance from the middle. */
    shoulderY: 0.322,
    shoulderX: 0.055,
    upperArm: 0.072,
    forearm: 0.066,
    /** Where the chest turns on the pelvis. */
    waistY: 0.235,
    neckY: 0.338,
    /** The middle of the head (the eyes are on its line). */
    headY: 0.372,
} as const

/** The shoulder joints in the chest's frame: right (0), left (1). */
export const SHOULDERS: readonly [Vector3, Vector3] = [
    new Vector3(BODY.shoulderX, BODY.shoulderY - BODY.waistY, 0),
    new Vector3(-BODY.shoulderX, BODY.shoulderY - BODY.waistY, 0),
]

/** How far an arm reaches, shoulder to wrist. */
export const ARM_REACH = BODY.upperArm + BODY.forearm
/** How long a leg is, hip to ankle. */
export const LEG_LENGTH = BODY.thigh + BODY.shin

// --- Two-bone IK (pure: tested in client.test.ts) ----------------------------------------------

/**
 * A limb from `root` toward `target`: an upper bone of `upper`, a lower of `lower`, the middle
 * joint (knee, elbow) bent toward `pole`. Out of reach: straight toward the target. Writes the
 * middle joint and the end into `mid` and `end`.
 */
export function twoBone(
    root: Vector3,
    target: Vector3,
    upper: number,
    lower: number,
    pole: Vector3,
    mid: Vector3,
    end: Vector3
): void {
    const dir = end.subVectors(target, root)
    let d = dir.length()
    if (d < 1e-6) dir.set(0, -1, 0)
    else dir.divideScalar(d)
    d = Math.min(Math.max(d, Math.abs(upper - lower) + 1e-4), upper + lower - 1e-4)
    const along = (upper * upper - lower * lower + d * d) / (2 * d)
    const out = Math.sqrt(Math.max(0, upper * upper - along * along))
    // The pole, square to the limb.
    const bend = mid.copy(pole).addScaledVector(dir, -pole.dot(dir))
    if (bend.lengthSq() < 1e-10) bend.set(dir.y, -dir.x, 0)
    bend.normalize()
    const dx = dir.x
    const dy = dir.y
    const dz = dir.z
    mid.set(root.x + dx * along + bend.x * out, root.y + dy * along + bend.y * out, root.z + dz * along + bend.z * out)
    end.set(root.x + dx * d, root.y + dy * d, root.z + dz * d)
}

const basis = new Matrix4()
const ax = new Vector3()
const ay = new Vector3()
const az = new Vector3()

/**
 * Puts a segment (modelled down its -Y from its joint, its front at -Z) at `from`, running to `to`,
 * its front turned toward `facing`.
 */
export function orient(segment: Group, from: Vector3, to: Vector3, facing: Vector3): void {
    segment.position.copy(from)
    ay.subVectors(from, to)
    if (ay.lengthSq() < 1e-12) ay.set(0, 1, 0)
    ay.normalize()
    az.copy(facing).addScaledVector(ay, -facing.dot(ay))
    if (az.lengthSq() < 1e-10) az.set(0, 0, -1).addScaledVector(ay, ay.z)
    az.normalize().negate()
    ax.crossVectors(ay, az)
    segment.quaternion.setFromRotationMatrix(basis.makeBasis(ax, ay, az))
}

// --- Looks -------------------------------------------------------------------------------------

export interface Look {
    skin: string
    hair: string
    hairStyle: 'short' | 'long' | 'bun' | 'bald'
    top: 'shirt' | 'hoodie'
    shirt: string
    trousers: string
    shoes: string
    /** Shirt sleeves rolled up to the elbow. */
    rolled: boolean
    /** Theirs (or their team's): the tie or the hoodie, the badge. */
    accent: string
}

const SKINS = ['#f1c7a5', '#e3b08a', '#c98d66', '#9a6440', '#6b4128']
const HAIRS = ['#2a1c13', '#4a3020', '#7a5230', '#b8925a', '#161616', '#8b8b8b']
const SHIRTS = ['#f4f3ef', '#cfdfee', '#e9e2d3', '#dcd5e4', '#e4ece2']
const TROUSERS = ['#2b3442', '#3b3e44', '#6b5d48', '#1f2733', '#4a4f57']
const SHOES = ['#f2f2f0', '#1c1c1e', '#8c8f94', '#f2f2f0']

/** Their look, from their id (the same on every screen) and their colour. */
export function lookFor(id: string, accent: string): Look {
    let h = 2166136261
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    const pick = <T>(list: readonly T[], salt: number): T =>
        list[((h ^ Math.imul(salt, 2654435761)) >>> 0) % list.length]!
    const r = (salt: number) => (((h ^ Math.imul(salt, 0x9e3779b1)) >>> 0) % 1000) / 1000
    return {
        skin: pick(SKINS, 1),
        hair: pick(HAIRS, 2),
        hairStyle: pick(['short', 'short', 'long', 'bun', 'bald'] as const, 3),
        top: r(4) < 0.35 ? 'hoodie' : 'shirt',
        shirt: pick(SHIRTS, 5),
        trousers: pick(TROUSERS, 6),
        shoes: pick(SHOES, 7),
        rolled: r(8) < 0.5,
        accent,
    }
}

// --- The body ----------------------------------------------------------------------------------

/** One arm or leg: its two segments (posed by `orient`) and, for an arm, the hand's group. */
export interface Limb {
    upper: Group
    lower: Group
}

export interface Figure {
    /** The pelvis, at the hip joints' height; the chest turns on it. */
    torso: Group
    /** Waist up (shirt, neck, head, the pack), turning at the waist; the shoulders are on it (`SHOULDERS`). */
    chest: Group
    head: Group
    /** The backpack jetpack, on the torso. */
    pack: Group
    /** Right (0) and left (1). */
    arms: [Limb, Limb]
    legs: [Limb, Limb]
    feet: [Group, Group]
    /** Flashed white when they're hit. */
    cloth: MeshStandardMaterial[]
    /** Theirs alone (disposed with them): skin, hair, clothes. */
    materials: Material[]
    skin: MeshStandardMaterial
    accent: MeshStandardMaterial
}

const std = (color: string | number, roughness: number) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
/** The eyes and the pack's fittings: shared by everyone. */
const eyeMaterial = std(0x15110e, 0.3)
const soleMaterial = std(0xe8e6e0, 0.8)
const strapMaterial = std(0x26292e, 0.7)
const nozzleMaterial = new MeshStandardMaterial({ color: 0x41454c, roughness: 0.35, metalness: 0.8 })
applyFinish(strapMaterial, 'cloth')
applyFinish(nozzleMaterial, 'metal')
/** Shared by every figure: never disposed with one. */
export const SHARED_MATERIALS: readonly Material[] = [eyeMaterial, soleMaterial, strapMaterial, nozzleMaterial]

function at(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    return mesh
}

/** A segment's shape: a capsule from its joint (0) down to `length`, a little wider at the top. */
function limbShape(top: number, bottom: number, length: number): CylinderGeometry {
    return new CylinderGeometry(top, bottom, length, 10, 1).translate(0, -length / 2, 0)
}

/** A round cap over a joint (shoulder, elbow, knee) so a bend never shows a gap. */
function cap(radius: number): SphereGeometry {
    return new SphereGeometry(radius, 10, 8)
}

export function buildFigure(look: Look): Figure {
    const skin = std(look.skin, 0.62)
    const hair = std(look.hair, 0.75)
    const shirt = std(look.top === 'hoodie' ? look.accent : look.shirt, 0.8)
    if (look.top === 'hoodie') shirt.color.lerp(new Color(0x808080), 0.15)
    const trousers = std(look.trousers, 0.85)
    const accent = std(look.accent, 0.6)
    const shoes = std(look.shoes, 0.6)
    applyFinish(shirt, 'cloth')
    applyFinish(trousers, 'cloth')
    applyFinish(accent, 'cloth')
    applyFinish(shoes, 'rubber')
    const materials: Material[] = [skin, hair, shirt, trousers, accent, shoes]

    // The pelvis, at the hip joints: trousers to the belt, its buckle. It faces where the legs do.
    const torso = new Group()
    torso.position.y = BODY.hipY
    const hips: Mesh[] = [
        at(new Mesh(new RoundedBoxGeometry(0.086, 0.05, 0.052, 3, 0.017), trousers), 0, 0.008, 0.002),
        at(new Mesh(new BoxGeometry(0.087, 0.008, 0.053), strapMaterial), 0, 0.031, 0.002),
        at(new Mesh(new BoxGeometry(0.012, 0.008, 0.004), nozzleMaterial), 0, 0.031, -0.0255),
    ]
    for (const mesh of mergeByMaterial(hips)) torso.add(mesh)

    // The chest, turning at the waist (a shooter stands bladed): the shirt to the shoulders, the neck.
    const chestGroup = new Group()
    chestGroup.position.y = BODY.waistY - BODY.hipY
    torso.add(chestGroup)
    const y = (abs: number) => abs - BODY.waistY
    const chest = new CapsuleGeometry(0.03, 0.03, 4, 12).scale(1.7, 1, 0.94)
    const belly = new CapsuleGeometry(0.028, 0.024, 4, 12).scale(1.58, 1, 0.92)
    const parts: Mesh[] = [
        at(new Mesh(chest, shirt), 0, y(0.294), 0.001),
        at(new Mesh(belly, shirt), 0, y(0.256), 0),
        // Shoulders rounded off, the neck.
        at(new Mesh(cap(0.0155), shirt), BODY.shoulderX - 0.005, y(BODY.shoulderY), 0),
        at(new Mesh(cap(0.0155), shirt), -BODY.shoulderX + 0.005, y(BODY.shoulderY), 0),
        at(new Mesh(new CylinderGeometry(0.0105, 0.012, 0.022, 10), skin), 0, y(BODY.neckY + 0.006), 0.001),
    ]
    if (look.top === 'shirt') {
        // Collar points, the tie (knot and blade), in their colour.
        for (const side of [-1, 1]) {
            parts.push(
                at(
                    new Mesh(new BoxGeometry(0.012, 0.004, 0.009), shirt),
                    side * 0.007,
                    y(0.333),
                    -0.017,
                    0.6,
                    0,
                    side * 0.5
                )
            )
        }
        parts.push(at(new Mesh(new BoxGeometry(0.007, 0.007, 0.004), accent), 0, y(0.329), -0.026))
        parts.push(
            at(
                new Mesh(new CylinderGeometry(0.005, 0.003, 0.064, 4).rotateY(Math.PI / 4), accent),
                0,
                y(0.295),
                -0.0292,
                -0.06
            )
        )
    } else {
        // The hood bunched behind the neck, a front pocket, drawstrings.
        const hood = new TorusGeometry(0.019, 0.0085, 6, 14, Math.PI * 1.3).rotateX(Math.PI / 2).rotateZ(Math.PI * 0.85)
        parts.push(at(new Mesh(hood, shirt), 0, y(0.334), 0.005, 0.25))
        parts.push(at(new Mesh(new BoxGeometry(0.056, 0.022, 0.004), shirt), 0, y(0.256), -0.0262))
        for (const side of [-1, 1]) {
            parts.push(
                at(new Mesh(new BoxGeometry(0.0015, 0.02, 0.0015), soleMaterial), side * 0.007, y(0.318), -0.0285)
            )
        }
    }
    // The lanyard and its badge (white, a stripe of their colour).
    for (const side of [-1, 1]) {
        parts.push(
            at(
                new Mesh(new BoxGeometry(0.0024, 0.042, 0.0012), accent),
                side * 0.0095,
                y(0.317),
                -0.0278,
                0,
                0,
                side * -0.22
            )
        )
    }
    parts.push(at(new Mesh(new BoxGeometry(0.014, 0.018, 0.0016), soleMaterial), 0, y(0.292), -0.0298, -0.08))
    parts.push(at(new Mesh(new BoxGeometry(0.014, 0.004, 0.0018), accent), 0, y(0.2975), -0.03, -0.08))
    for (const mesh of mergeByMaterial(parts)) chestGroup.add(mesh)

    // The head, turning about the top of the neck.
    const head = new Group()
    head.position.y = y(BODY.neckY)
    const hy = BODY.headY - BODY.neckY
    const face: Mesh[] = [
        at(new Mesh(new SphereGeometry(0.025, 18, 14).scale(0.86, 1.02, 0.96), skin), 0, hy + 0.002, 0),
        // Jaw and chin.
        at(new Mesh(new SphereGeometry(0.0178, 14, 10).scale(1, 0.85, 1), skin), 0, hy - 0.011, -0.005),
        // Nose, ears.
        at(new Mesh(new ConeGeometry(0.0036, 0.008, 6).rotateX(-Math.PI / 2), skin), 0, hy - 0.002, -0.025, -0.25),
        at(new Mesh(new SphereGeometry(0.005, 8, 6).scale(0.5, 1, 0.8), skin), 0.0218, hy, 0.002),
        at(new Mesh(new SphereGeometry(0.005, 8, 6).scale(0.5, 1, 0.8), skin), -0.0218, hy, 0.002),
        // Eyes, brows.
        at(new Mesh(new SphereGeometry(0.0028, 8, 6), eyeMaterial), 0.009, hy + 0.004, -0.0207),
        at(new Mesh(new SphereGeometry(0.0028, 8, 6), eyeMaterial), -0.009, hy + 0.004, -0.0207),
        at(new Mesh(new BoxGeometry(0.009, 0.0018, 0.002), hair), 0.0093, hy + 0.0098, -0.0218, 0, 0, -0.08),
        at(new Mesh(new BoxGeometry(0.009, 0.0018, 0.002), hair), -0.0093, hy + 0.0098, -0.0218, 0, 0, 0.08),
    ]
    if (look.hairStyle !== 'bald') {
        // A cap of hair over the top and back, the forehead clear.
        const cap = new SphereGeometry(0.0268, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.88, 1.0, 0.99)
        face.push(at(new Mesh(cap, hair), 0, hy + 0.003, 0.0018, 0.38))
    }
    if (look.hairStyle === 'long') {
        face.push(at(new Mesh(new RoundedBoxGeometry(0.042, 0.04, 0.012, 2, 0.005), hair), 0, hy - 0.012, 0.017))
    }
    if (look.hairStyle === 'bun') face.push(at(new Mesh(new SphereGeometry(0.009, 10, 8), hair), 0, hy + 0.02, 0.019))
    for (const mesh of mergeByMaterial(face)) head.add(mesh)
    chestGroup.add(head)

    // The jetpack, worn as a backpack: straps over the shoulders, two nozzles under it.
    const pack = new Group()
    pack.position.set(0, y(0.288), 0.042)
    const packParts: Mesh[] = [
        at(new Mesh(new RoundedBoxGeometry(0.06, 0.075, 0.028, 2, 0.008), strapMaterial), 0, 0, 0),
        at(new Mesh(new RoundedBoxGeometry(0.04, 0.03, 0.01, 2, 0.004), strapMaterial), 0, -0.012, 0.016),
    ]
    for (const side of [-1, 1]) {
        packParts.push(
            at(new Mesh(new BoxGeometry(0.008, 0.06, 0.003), strapMaterial), side * 0.022, 0.012, -0.058, 0.12)
        )
        packParts.push(
            at(new Mesh(new CylinderGeometry(0.007, 0.01, 0.014, 10), nozzleMaterial), side * 0.018, -0.043, 0.002)
        )
    }
    for (const mesh of mergeByMaterial(packParts)) pack.add(mesh)
    chestGroup.add(pack)

    // Arms: the sleeve to the elbow, the forearm (sleeve or rolled up, skin).
    const arm = (): Limb => {
        const upper = new Group()
        upper.add(
            new Mesh(limbShape(0.0135, 0.011, BODY.upperArm), shirt),
            at(new Mesh(cap(0.011), shirt), 0, -BODY.upperArm, 0)
        )
        const lower = new Group()
        const sleeve = look.top === 'shirt' && look.rolled ? skin : shirt
        lower.add(new Mesh(limbShape(0.011, 0.0085, BODY.forearm), sleeve))
        if (sleeve === skin)
            lower.add(at(new Mesh(new CylinderGeometry(0.0122, 0.0122, 0.009, 10), shirt), 0, -0.004, 0))
        return { upper, lower }
    }
    // Legs: trousers to the ankle.
    const leg = (): Limb => {
        const upper = new Group()
        upper.add(
            new Mesh(limbShape(0.019, 0.0145, BODY.thigh), trousers),
            at(new Mesh(cap(0.0145), trousers), 0, -BODY.thigh, 0)
        )
        const lower = new Group()
        lower.add(new Mesh(limbShape(0.0145, 0.0105, BODY.shin), trousers))
        return { upper, lower }
    }
    // Sneakers from the ankle: the upper, a white sole, toes forward (-Z).
    const foot = (): Group => {
        const group = new Group()
        const shoe: Mesh[] = [
            at(new Mesh(new RoundedBoxGeometry(0.025, 0.015, 0.058, 2, 0.007), shoes), 0, -0.006, -0.012),
            at(new Mesh(new BoxGeometry(0.026, 0.0045, 0.06), soleMaterial), 0, -0.0135, -0.012),
        ]
        for (const mesh of mergeByMaterial(shoe)) group.add(mesh)
        return group
    }

    return {
        torso,
        chest: chestGroup,
        head,
        pack,
        arms: [arm(), arm()],
        legs: [leg(), leg()],
        feet: [foot(), foot()],
        cloth: [shirt, trousers],
        materials,
        skin,
        accent,
    }
}
