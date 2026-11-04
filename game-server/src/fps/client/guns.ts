import {
    AdditiveBlending,
    type BufferGeometry,
    BoxGeometry,
    CylinderGeometry,
    Euler,
    Group,
    type Material,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Quaternion,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Gun } from '../protocol.ts'

/**
 * The guns in your hands, in the camera's frame (x right, y up, -z ahead; metres), with the gloved
 * hands that hold them and their reloads, keyframed on the reload's 0–1 progress so the gun lab
 * (`bun run fps:guns`) can scrub through one. Drawn in their own pass over the world, with depth.
 */

export type Triple = [number, number, number]

/** Where a hand is and how it's turned, in the gun's frame. */
export interface Pose {
    at: Vector3
    q: Quaternion
}

/** What a gun's parts are doing this frame. */
export interface GunState {
    /** 0–1 through a reload, null when not reloading. */
    reload: number | null
    /** The reload's length (ms): falling magazines fall in real time. */
    reloadMs: number
    /** Since the last shot (ms). */
    sinceShot: number
    /** The launcher has a rocket in it. */
    loaded: boolean
}

/** Where its hands go (null: off screen). */
export interface HandPoses {
    left: Pose | null
    right: Pose | null
}

/** A spent case thrown out after a shot. */
export interface Ejection {
    /** From here (the port), along `toward` (m/s). */
    at: Triple
    toward: Triple
    /** After the shot (the shotgun's pump, the sniper's bolt). */
    delayMs: number
    kind: 'case' | 'long' | 'shell'
}

export interface GunModel {
    group: Group
    /** The point aiming brings to the middle of the view. */
    sight: Vector3
    /** The glowing dot on that point. */
    tip: Mesh
    /** Where its rounds leave (the tracer starts there). */
    muzzle: Vector3
    /** Its kick: back (m) and up (rad) over `ms`; its flash's size. */
    kick: { back: number; rise: number; ms: number; flash: number }
    /** How it turns for a reload: roll, pitch and yaw (rad, yaw turning the muzzle left), pushed forward (m). */
    reloadPose: { roll: number; pitch: number; yaw: number; push: number }
    eject: Ejection | null
    /** Poses its moving parts and says where the hands are. */
    animate(state: GunState): HandPoses
}

export interface Kit {
    metal: MeshStandardMaterial
    dark: MeshStandardMaterial
    polymer: MeshStandardMaterial
    trim: MeshStandardMaterial
    chrome: MeshStandardMaterial
    brass: MeshStandardMaterial
    rubber: MeshStandardMaterial
    black: MeshStandardMaterial
    red: MeshStandardMaterial
    olive: MeshStandardMaterial
    glove: MeshStandardMaterial
    sleeve: MeshStandardMaterial
    glass: MeshStandardMaterial
    dot: MeshBasicMaterial
}

export function kitFor(color: string): Kit {
    return {
        metal: new MeshStandardMaterial({ color: 0x343841, roughness: 0.32, metalness: 0.85 }),
        dark: new MeshStandardMaterial({ color: 0x17191d, roughness: 0.55, metalness: 0.55 }),
        polymer: new MeshStandardMaterial({ color: 0x24272d, roughness: 0.8, metalness: 0.05 }),
        trim: new MeshStandardMaterial({
            color,
            roughness: 0.45,
            metalness: 0.1,
            emissive: color,
            emissiveIntensity: 0.15,
        }),
        chrome: new MeshStandardMaterial({ color: 0xd5d9de, roughness: 0.18, metalness: 1 }),
        brass: new MeshStandardMaterial({ color: 0xd4a94e, roughness: 0.28, metalness: 0.95 }),
        rubber: new MeshStandardMaterial({ color: 0x0f1012, roughness: 0.95 }),
        black: new MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }),
        red: new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }),
        olive: new MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.65, metalness: 0.2 }),
        glove: new MeshStandardMaterial({ color: 0x1f2227, roughness: 0.85, metalness: 0.05 }),
        sleeve: new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 }),
        glass: new MeshStandardMaterial({
            color: 0x0b2638,
            roughness: 0.05,
            metalness: 0.9,
            emissive: 0x0a2a40,
            emissiveIntensity: 0.6,
        }),
        dot: new MeshBasicMaterial({ color: 0x8dff6a }),
    }
}

// --- Shapes -----------------------------------------------------------------------------------

function placed(mesh: Mesh, at: Triple, rot?: Triple): Mesh {
    mesh.position.set(...at)
    if (rot) mesh.rotation.set(...rot)

    return mesh
}

function box(size: Triple, material: Material, at: Triple, rot?: Triple): Mesh {
    return placed(new Mesh(new BoxGeometry(...size), material), at, rot)
}

/** A box with rounded edges (`radius` m). */
function rbox(size: Triple, material: Material, at: Triple, radius = 0.003, rot?: Triple): Mesh {
    const r = Math.min(radius, ...size.map(s => s / 2 - 1e-4))
    return placed(new Mesh(new RoundedBoxGeometry(...size, 2, r), material), at, rot)
}

/** A cylinder along Z, `front` its radius at the -Z end. */
function tube(radius: number, length: number, material: Material, at: Triple, front = radius, sides = 16): Mesh {
    const mesh = new Mesh(new CylinderGeometry(front, radius, length, sides), material)
    mesh.rotation.x = -Math.PI / 2

    return placed(mesh, at)
}

/** A cylinder along X. */
function across(radius: number, length: number, material: Material, at: Triple): Mesh {
    return placed(new Mesh(new CylinderGeometry(radius, radius, length, 12), material), at, [0, 0, Math.PI / 2])
}

/** A cylinder along Y. */
function upright(radius: number, length: number, material: Material, at: Triple, rot?: Triple): Mesh {
    return placed(new Mesh(new CylinderGeometry(radius, radius, length, 14), material), at, rot)
}

/** A ring around Z. */
function ring(radius: number, thickness: number, material: Material, at: Triple): Mesh {
    return placed(new Mesh(new TorusGeometry(radius, thickness, 8, 24), material), at)
}

function sphere(radius: number, material: Material, at: Triple): Mesh {
    return placed(new Mesh(new SphereGeometry(radius, 10, 8), material), at)
}

/** A rail's teeth along Z from `z0` to `z1` on a strip `width` wide at height `y`. */
function rail(kit: Kit, x: number, y: number, z0: number, z1: number, width = 0.014): Mesh[] {
    const parts = [box([width, 0.003, Math.abs(z1 - z0)], kit.dark, [x, y, (z0 + z1) / 2])]
    for (let z = Math.max(z0, z1) - 0.003; z > Math.min(z0, z1) + 0.002; z -= 0.0065) {
        parts.push(box([width + 0.002, 0.0026, 0.0032], kit.dark, [x, y + 0.0025, z]))
    }

    return parts
}

/**
 * The static parts as one mesh per material (a gun has dozens of parts: a draw call each would
 * add up). Moving parts stay their own groups.
 */
function merged(meshes: Mesh[]): Mesh[] {
    const byMaterial = new Map<Material, BufferGeometry[]>()
    for (const mesh of meshes) {
        mesh.updateMatrix()
        const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
            mesh.matrix
        )
        for (const name of Object.keys(geometry.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
        }
        const material = mesh.material as Material
        byMaterial.set(material, [...(byMaterial.get(material) ?? []), geometry])
    }

    return [...byMaterial].map(([material, geometries]) => new Mesh(mergeGeometries(geometries), material))
}

/** Iron sights on a flat top at `top`: a notched rear at `rearZ`, a post at `frontZ` (standing on `frontBase`). */
function ironSights(kit: Kit, x: number, top: number, sightY: number, rearZ: number, frontZ: number, frontBase = top) {
    const rise = sightY - top - 0.004
    const middle = top + 0.004 + rise / 2
    const post = sightY - frontBase

    return [
        box([0.018, 0.004, 0.012], kit.dark, [x, top + 0.002, rearZ]),
        box([0.005, rise, 0.012], kit.dark, [x - 0.0055, middle, rearZ]),
        box([0.005, rise, 0.012], kit.dark, [x + 0.0055, middle, rearZ]),
        box([0.0025, post, 0.004], kit.dark, [x, frontBase + post / 2, frontZ]),
        // The front sight's guard ears.
        box([0.0015, post * 0.8, 0.005], kit.dark, [x - 0.005, frontBase + post * 0.4, frontZ]),
        box([0.0015, post * 0.8, 0.005], kit.dark, [x + 0.005, frontBase + post * 0.4, frontZ]),
    ]
}

/** A trigger guard under `y` from `z0` (back) to `z1` (front), and the trigger in it. */
function triggerGroup(kit: Kit, x: number, y: number, z0: number, z1: number, frame = kit.metal): Mesh[] {
    const length = Math.abs(z1 - z0)
    return [
        box([0.004, 0.0028, length], frame, [x, y - 0.014, (z0 + z1) / 2]),
        box([0.004, 0.014, 0.003], frame, [x, y - 0.007, z1]),
        box([0.0028, 0.011, 0.0028], kit.chrome, [x, y - 0.006, z0 - length * 0.45], [0.3, 0, 0]),
    ]
}

// --- Timing -----------------------------------------------------------------------------------

/** Smooth in and out (0 … 1). */
export function ease(t: number): number {
    return t * t * (3 - 2 * t)
}

/** 0 → 1 as `t` goes from `a` to `b` (smoothly), clamped. */
export function between(t: number, a: number, b: number): number {
    return ease(Math.max(0, Math.min(1, (t - a) / (b - a))))
}

/** Out (0 → 1) over `a … b`, held, back (1 → 0) over `c … d`. */
export function outAndBack(t: number, a: number, b: number, c: number, d: number): number {
    return between(t, a, b) * (1 - between(t, c, d))
}

/** A pose at `at`, turned by `rot` (radians about X, Y, Z, in that order). */
export function pose(at: Triple, rot: Triple = [0, 0, 0]): Pose {
    return { at: new Vector3(...at), q: new Quaternion().setFromEuler(new Euler(...rot)) }
}

/** A pose turned so the hand's local x and y axes point along `x` and `y`. */
function turned(at: Triple, x: Triple, y: Triple, tilt: Triple = [0, 0, 0]): Pose {
    const ax = new Vector3(...x).normalize()
    const ay = new Vector3(...y).normalize()
    const base = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(ax, ay, ax.clone().cross(ay)))

    return { at: new Vector3(...at), q: base.multiply(pose([0, 0, 0], tilt).q) }
}

/** The left hand under a handguard: palm up, along the barrel, fingers round its right side. */
function cradle(at: Triple, tilt: Triple = [0, 0, 0]): Pose {
    return turned(at, [0, 1, 0], [0, 0, -1], tilt)
}

/** `p` moved by `by`. */
function shifted(p: Pose, by: Triple): Pose {
    return { at: p.at.clone().add(new Vector3(...by)), q: p.q }
}

/** Between two poses: positions eased along, turns slerped. */
function mix(a: Pose, b: Pose, s: number): Pose {
    return { at: a.at.clone().lerp(b.at, s), q: a.q.clone().slerp(b.q, s) }
}

/** The pose at `t` along keys (time, pose), eased between each pair; held before the first and after the last. */
export function keyed(t: number, keys: Array<[number, Pose]>): Pose {
    const first = keys[0]!
    if (t <= first[0]) return first[1]
    for (let i = 1; i < keys.length; i++) {
        const [t1, p1] = keys[i]!
        const [t0, p0] = keys[i - 1]!
        if (t <= t1) return mix(p0, p1, ease((t - t0) / Math.max(1e-6, t1 - t0)))
    }

    return keys[keys.length - 1]![1]
}

/**
 * A magazine let go of at `from` (reload progress) from `at`: it falls and tumbles away, in real
 * time (`ms` the reload's length). Hidden once gone.
 */
function falling(part: Group, t: number, from: number, at: Vector3, ms: number, spin = 4): void {
    const s = ((t - from) * ms) / 1000
    part.visible = s >= 0 && s < 0.6
    if (!part.visible) return
    part.position.set(at.x - 0.04 * s, at.y - 1.6 * s * s, at.z + 0.03 * s)
    part.rotation.set(spin * 0.4 * s, 0, spin * s)
}

// --- The guns ---------------------------------------------------------------------------------

/** The assault rifle: a stock, a railed receiver in your colour down the sides, a curved magazine, a handguard. */
function buildRifle(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.028
    const sightY = top + 0.013
    const group = new Group()
    const magazineAt = new Vector3(x, top - 0.03, -0.125)
    const magazine = () => {
        const mag = new Group()
        const lower = rbox([0.016, 0.03, 0.022], kit.trim, [0, -0.037, -0.008], 0.002, [0.35, 0, 0])
        mag.add(
            rbox([0.016, 0.028, 0.022], kit.trim, [0, -0.011, 0], 0.002),
            lower,
            ...[-0.006, -0.016].map(y => box([0.0168, 0.0022, 0.0225], kit.dark, [0, y, 0])),
            rbox([0.019, 0.006, 0.026], kit.dark, [0, -0.053, -0.015], 0.002, [0.35, 0, 0])
        )
        mag.position.copy(magazineAt)
        return mag
    }
    const inGun = magazine()
    const dropped = magazine()
    dropped.visible = false
    // The cocking lever: out of the handguard's left side, run back along its slot.
    const handleZ = -0.178
    const handle = new Group()
    handle.position.set(x - 0.014, top - 0.008, handleZ)
    handle.add(
        box([0.012, 0.004, 0.005], kit.metal, [-0.006, 0, 0]),
        rbox([0.004, 0.007, 0.009], kit.trim, [-0.012, 0, 0], 0.0015)
    )
    const carrier = box([0.001, 0.007, 0.018], kit.chrome, [x + 0.0137, top - 0.009, -0.1])
    const tip = sphere(0.0016, kit.dot, [x, sightY, -0.215])

    group.add(
        ...merged([
            // Stock, buffer tube, buttpad.
            rbox([0.02, 0.03, 0.06], kit.polymer, [x, top - 0.026, -0.02], 0.004),
            box([0.021, 0.004, 0.04], kit.trim, [x, top - 0.013, -0.018]),
            tube(0.0075, 0.04, kit.metal, [x, top - 0.012, -0.045]),
            // Upper and lower receiver, your colour down the sides.
            rbox([0.026, 0.02, 0.115], kit.metal, [x, top - 0.01, -0.12], 0.003),
            rbox([0.022, 0.022, 0.075], kit.dark, [x, top - 0.03, -0.105], 0.003),
            ...[-1, 1].map(side => box([0.002, 0.007, 0.08], kit.trim, [x + side * 0.0135, top - 0.016, -0.135])),
            // Ejection port, forward assist, mag release, the mag well's flare.
            box([0.0016, 0.009, 0.024], kit.black, [x + 0.0131, top - 0.009, -0.1]),
            box([0.0018, 0.0014, 0.028], kit.metal, [x + 0.0134, top - 0.0145, -0.1]),
            tube(0.003, 0.012, kit.metal, [x + 0.012, top - 0.004, -0.072]),
            box([0.002, 0.005, 0.005], kit.chrome, [x + 0.0115, top - 0.03, -0.122]),
            rbox([0.02, 0.008, 0.028], kit.metal, [x, top - 0.042, -0.125], 0.002),
            // Grip, trigger guard, trigger.
            rbox([0.02, 0.045, 0.024], kit.polymer, [x, top - 0.045, -0.075], 0.004, [-0.25, 0, 0]),
            ...triggerGroup(kit, x, top - 0.04, -0.09, -0.112),
            // The top rail and the handguard's, iron sights on them.
            ...rail(kit, x, top + 0.0015, -0.06, -0.178),
            rbox([0.026, 0.026, 0.085], kit.dark, [x, top - 0.016, -0.2], 0.005),
            ...[-1, 1].flatMap(side =>
                [-0.178, -0.2, -0.222].map(z =>
                    box([0.0012, 0.007, 0.014], kit.metal, [x + side * 0.013, top - 0.016, z])
                )
            ),
            box([0.012, 0.003, 0.08], kit.dark, [x, top - 0.0015, -0.2]),
            // The cocking lever's slot (and its tube over the barrel).
            box([0.0015, 0.0035, 0.042], kit.black, [x - 0.0131, top - 0.008, -0.17]),
            ...ironSights(kit, x, top + 0.005, sightY, -0.07, -0.215, top - 0.003),
            // Barrel and muzzle brake (slotted).
            tube(0.005, 0.03, kit.metal, [x, top - 0.016, -0.257]),
            tube(0.0072, 0.022, kit.dark, [x, top - 0.016, -0.283]),
            ...[-0.278, -0.284, -0.29].map(z => box([0.0152, 0.0026, 0.0026], kit.black, [x, top - 0.016, z])),
        ]),
        inGun,
        dropped,
        handle,
        carrier,
        tip
    )

    const right = pose([x + 0.006, top - 0.047, -0.074], [-0.25, 0, 0])
    const left = cradle([x - 0.001, top - 0.031, -0.205])
    // The left hand on the magazine (it hangs this far below the hand's centre).
    const onMag = pose([x - 0.004, top - 0.068, -0.13], [0.35, 0, 0])
    const magFromHand = magazineAt.clone().sub(onMag.at)
    const away = pose([x - 0.05, top - 0.22, -0.1], [0.6, 0, 0.4])
    const onHandle = pose([x - 0.034, top - 0.006, handleZ + 0.004], [0, 0, -0.5])
    const handleBack = shifted(onHandle, [0, 0, 0.035])

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.016, -0.296),
        kick: { back: 0.012, rise: 0.05, ms: 70, flash: 1 },
        reloadPose: { roll: 0.6, pitch: 0.12, yaw: 0.5, push: 0 },
        eject: { at: [x + 0.014, top - 0.009, -0.1], toward: [0.9, 0.6, 0.25], delayMs: 0, kind: 'case' },
        animate({ reload: t, reloadMs, sinceShot }) {
            carrier.position.z = -0.1 + (sinceShot < 40 ? 1 - sinceShot / 40 : 0) * 0.01
            dropped.visible = false
            inGun.position.copy(magazineAt)
            inGun.visible = true
            handle.position.z = handleZ
            if (t === null) return { left, right }

            // Out with the old magazine: the hand pulls it and lets it fall, goes for another, pushes it
            // home with a slap, then works the charging handle.
            const hand = keyed(t, [
                [0.06, left],
                [0.14, onMag],
                [0.2, shifted(onMag, [0, -0.03, 0.004])],
                [0.3, away],
                [0.42, away],
                [0.52, shifted(onMag, [0, -0.035, 0.006])],
                [0.6, onMag],
                [0.63, shifted(onMag, [0, 0.004, 0])],
                [0.66, onMag],
                [0.72, onHandle],
                [0.78, handleBack],
                [0.8, shifted(handleBack, [-0.01, 0.01, 0])],
                [0.92, left],
            ])
            const held = hand.at.clone().add(magFromHand)
            if (t >= 0.14 && t < 0.2) {
                inGun.position.copy(held)
            } else if (t >= 0.2) {
                falling(dropped, t, 0.2, magazineAt.clone().add(new Vector3(0, -0.03, 0.004)), reloadMs)
                inGun.visible = t >= 0.42
                if (t < 0.6) inGun.position.copy(held)
                if (t >= 0.6 && t < 0.66) inGun.position.copy(held)
            }
            handle.position.z = handleZ + outAndBack(t, 0.72, 0.78, 0.79, 0.81) * 0.035

            return { left: hand, right }
        },
    }
}

/** The pistol: a serrated slide over a frame in your colour, a magazine in the grip. */
function buildPistol(kit: Kit): GunModel {
    const x = 0.04
    const top = -0.032
    const sightY = top + 0.007
    const group = new Group()
    const slide = new Group()
    const tip = sphere(0.0014, kit.dot, [x, sightY, -0.152])
    slide.add(
        ...merged([
            rbox([0.02, 0.018, 0.088], kit.metal, [x, top - 0.009, -0.114], 0.0025),
            ...[-1, 1].flatMap(side =>
                [0, 1, 2, 3, 4, 5].map(i =>
                    box([0.0012, 0.012, 0.0016], kit.dark, [x + side * 0.0101, top - 0.009, -0.076 - i * 0.0028])
                )
            ),
            box([0.0095, 0.002, 0.021], kit.black, [x + 0.003, top, -0.11]),
            box([0.003, sightY - top, 0.004], kit.dark, [x, (top + sightY) / 2, -0.152]),
            box([0.005, sightY - top, 0.006], kit.dark, [x - 0.0045, (top + sightY) / 2, -0.08]),
            box([0.005, sightY - top, 0.006], kit.dark, [x + 0.0045, (top + sightY) / 2, -0.08]),
        ]),
        tip
    )
    // The barrel's hood in the port, showing as the slide moves back.
    const hood = box([0.007, 0.002, 0.016], kit.chrome, [x + 0.003, top + 0.0003, -0.11])
    // The grip's line: tilted back; magazines slide along it.
    const gripAt = new Vector3(x, top - 0.045, -0.085)
    const gripTilt = -0.3
    const down = new Vector3(0, -Math.cos(gripTilt), -Math.sin(gripTilt))
    const magazine = () => {
        const mag = new Group()
        mag.add(
            box([0.014, 0.04, 0.018], kit.dark, [0, -0.002, 0]),
            rbox([0.019, 0.006, 0.024], kit.trim, [0, -0.024, 0], 0.002)
        )
        mag.position.copy(gripAt)
        mag.rotation.x = gripTilt
        return mag
    }
    const inGun = magazine()
    const dropped = magazine()
    dropped.visible = false

    group.add(
        slide,
        hood,
        ...merged([
            // Frame in your colour, its rail, the barrel's muzzle.
            rbox([0.018, 0.011, 0.072], kit.trim, [x, top - 0.0235, -0.118], 0.002),
            box([0.014, 0.004, 0.028], kit.dark, [x, top - 0.031, -0.14]),
            ...[-0.13, -0.14, -0.15].map(z => box([0.0155, 0.003, 0.003], kit.dark, [x, top - 0.032, z])),
            tube(0.0042, 0.004, kit.dark, [x, top - 0.01, -0.1585]),
            tube(0.0024, 0.0045, kit.black, [x, top - 0.01, -0.1585]),
            ...triggerGroup(kit, x, top - 0.029, -0.096, -0.116, kit.trim),
            // Slide stop and takedown lever (left side), hammer and beavertail.
            box([0.0015, 0.003, 0.016], kit.dark, [x - 0.0097, top - 0.02, -0.105]),
            box([0.0015, 0.004, 0.004], kit.dark, [x - 0.0097, top - 0.023, -0.122]),
            rbox([0.006, 0.009, 0.005], kit.dark, [x, top - 0.012, -0.068], 0.0015, [-0.4, 0, 0]),
            rbox([0.016, 0.004, 0.014], kit.trim, [x, top - 0.027, -0.068], 0.0015),
            // The grip with its textured panels.
            rbox([0.018, 0.042, 0.022], kit.trim, gripAt.toArray() as Triple, 0.003, [gripTilt, 0, 0]),
            ...[-1, 1].map(side => {
                const panel = box([0.0012, 0.03, 0.016], kit.polymer, [0, 0, 0])
                panel.position.copy(gripAt).add(new Vector3(side * 0.0094, 0, 0))
                panel.rotation.x = gripTilt
                return panel
            }),
        ]),
        inGun,
        dropped
    )

    const right = pose([x + 0.006, top - 0.045, -0.083], [gripTilt, 0, 0])
    const left = pose([x - 0.01, top - 0.052, -0.09], [gripTilt, 0, 0.25])
    const under = pose([x - 0.002, top - 0.1, -0.075], [gripTilt, 0, 0])
    const away = pose([x - 0.05, top - 0.22, -0.06], [0.4, 0, 0.4])

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.01, -0.165),
        kick: { back: 0.014, rise: 0.16, ms: 90, flash: 0.7 },
        reloadPose: { roll: 0.5, pitch: 0.2, yaw: 0.45, push: 0 },
        eject: { at: [x + 0.004, top + 0.002, -0.11], toward: [0.8, 0.9, 0.2], delayMs: 0, kind: 'case' },
        animate({ reload: t, reloadMs, sinceShot }) {
            // The slide snaps back on a shot; it stays back through a reload and goes home at its end.
            const cycled = sinceShot < 60 ? 1 - sinceShot / 60 : 0
            // Locked back empty; the slide release sends it home once the new magazine is in.
            const locked = t === null ? 0 : outAndBack(t, 0.03, 0.08, 0.7, 0.73)
            slide.position.z = Math.max(cycled, locked) * 0.016
            hood.position.z = -0.11 + Math.max(cycled, locked) * 0.004
            dropped.visible = false
            inGun.visible = true
            inGun.position.copy(gripAt)
            if (t === null) return { left, right }

            // The magazine drops free, the hand brings a new one up the grip and slaps it home.
            const hand = keyed(t, [
                [0.06, left],
                [0.2, away],
                [0.36, away],
                [0.5, under],
                [0.62, shifted(under, [0, 0.032, -0.01])],
                [0.66, shifted(under, [0, 0.038, -0.012])],
                [0.69, shifted(under, [0, 0.03, -0.01])],
                [0.86, left],
            ])
            falling(dropped, t, 0.1, gripAt, reloadMs, 2)
            const pulled = 1 - between(t, 0.08, 0.14)
            // Down the grip's line to drop, then the new one from below.
            if (t < 0.36) inGun.visible = false
            else if (t < 0.62) inGun.position.copy(hand.at).add(new Vector3(0.002, 0.008, 0.002))
            else inGun.position.copy(gripAt).addScaledVector(down, (1 - between(t, 0.6, 0.64)) * 0.006)
            if (t < 0.1) inGun.position.copy(gripAt).addScaledVector(down, (1 - pulled) * 0.01)

            return { left: hand, right }
        },
    }
}

/** The shotgun: a wide barrel under a vented heat shield, a tube magazine and a pump, shells on the side. */
function buildShotgun(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.03
    const sightY = top + 0.0012
    const group = new Group()
    const pumpZ = -0.175
    const pump = new Group()
    pump.position.set(x, top - 0.027, pumpZ)
    pump.add(
        rbox([0.026, 0.02, 0.052], kit.trim, [0, 0, 0], 0.004),
        ...[-0.016, -0.008, 0, 0.008, 0.016].map(z => box([0.0272, 0.003, 0.0025], kit.dark, [0, -0.003, z]))
    )
    const shell = () => {
        const s = new Group()
        s.add(upright(0.0045, 0.022, kit.red, [0, 0, 0]), upright(0.0048, 0.006, kit.brass, [0, -0.011, 0]))
        return s
    }
    // Shells along the receiver's left side, standing up: red hulls on brass heads.
    const saddleAt = [-0.07, -0.082, -0.094, -0.106].map(z => new Vector3(x - 0.0185, top - 0.016, z))
    const saddle = saddleAt.map(at => {
        const s = shell()
        s.position.copy(at)
        group.add(s)
        return s
    })
    // The shell being loaded: in the hand, then lying along the gun, pushed up into the port underneath.
    const loading = shell()
    loading.visible = false
    const tip = sphere(0.0022, new MeshBasicMaterial({ color: 0xffe08a }), [x, sightY, -0.272])

    group.add(
        ...merged([
            // Stock with its comb and pad, the grip, the trigger.
            rbox([0.022, 0.032, 0.07], kit.polymer, [x, top - 0.026, -0.03], 0.005),
            rbox([0.018, 0.008, 0.05], kit.polymer, [x, top - 0.008, -0.03], 0.003),
            rbox([0.02, 0.045, 0.024], kit.polymer, [x, top - 0.047, -0.06], 0.004, [-0.25, 0, 0]),
            ...triggerGroup(kit, x, top - 0.036, -0.072, -0.096),
            across(0.0022, 0.024, kit.red, [x, top - 0.033, -0.082]),
            // The receiver: ejection port right, loading port under, the saddle plate left.
            rbox([0.03, 0.032, 0.085], kit.metal, [x, top - 0.016, -0.09], 0.004),
            box([0.0016, 0.012, 0.03], kit.black, [x + 0.0151, top - 0.012, -0.095]),
            box([0.014, 0.0016, 0.032], kit.black, [x, top - 0.0322, -0.105]),
            box([0.002, 0.018, 0.052], kit.dark, [x - 0.0158, top - 0.016, -0.088]),
            box([0.012, 0.0015, 0.08], kit.dark, [x, top + 0.0002, -0.09]),
            // Barrel, its vented heat shield, the bead's muzzle.
            tube(0.0085, 0.15, kit.metal, [x, top - 0.0095, -0.2075]),
            rbox([0.02, 0.008, 0.12], kit.dark, [x, top - 0.004, -0.205], 0.003),
            ...[-1, 1].flatMap(side =>
                [-0.16, -0.18, -0.2, -0.22, -0.24].map(z =>
                    box([0.0012, 0.0035, 0.009], kit.black, [x + side * 0.0101, top - 0.004, z])
                )
            ),
            tube(0.0095, 0.008, kit.dark, [x, top - 0.0095, -0.279]),
            tube(0.006, 0.0085, kit.black, [x, top - 0.0095, -0.2795]),
            // The magazine tube, its clamp and cap.
            tube(0.0065, 0.12, kit.dark, [x, top - 0.027, -0.19]),
            box([0.02, 0.03, 0.008], kit.dark, [x, top - 0.018, -0.246]),
            tube(0.0072, 0.01, kit.metal, [x, top - 0.027, -0.255]),
        ]),
        pump,
        loading,
        tip
    )
    const SHELLS = saddle.length

    const right = pose([x + 0.006, top - 0.048, -0.06], [-0.25, 0, 0])
    const left = cradle([x - 0.001, top - 0.033, pumpZ])
    // Picking a shell off the saddle (from above), and pushing one into the port (from below).
    const pick = (at: Vector3) => pose([at.x - 0.006, at.y + 0.02, at.z], [-0.3, 0, 0.9])
    const port = (z: number) => cradle([x - 0.002, top - 0.06, z], [0, 0, 0.4])

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.0095, -0.29),
        kick: { back: 0.03, rise: 0.3, ms: 170, flash: 1.8 },
        reloadPose: { roll: 0.7, pitch: 0.1, yaw: 0.45, push: 0 },
        eject: { at: [x + 0.016, top - 0.012, -0.095], toward: [0.9, 0.55, 0.2], delayMs: 250, kind: 'shell' },
        animate({ reload: t, sinceShot }) {
            // After a shot, rack it: the pump back and forward, the hand with it.
            let racked = sinceShot >= 180 && sinceShot < 420 ? Math.sin(((sinceShot - 180) / 240) * Math.PI) : 0
            loading.visible = false
            for (const s of saddle) s.visible = true
            let hand = left
            if (t !== null) {
                // One shell after the other: off the saddle, under the gun, up into the port and forward.
                const span = (t - 0.08) / 0.72
                const k = Math.floor(span * SHELLS)
                const back = (z: number) => shifted(left, [0, 0, z])
                if (span < 0) hand = mix(left, pick(saddleAt[0]!), between(t, 0, 0.08))
                else if (k < SHELLS) {
                    const u = span * SHELLS - k
                    const from = pick(saddleAt[k]!)
                    hand = keyed(u, [
                        [0, from],
                        [0.12, shifted(from, [0, 0.004, 0])],
                        [0.45, port(-0.12)],
                        [0.7, port(-0.105)],
                        [0.85, shifted(port(-0.105), [0, 0, -0.02])],
                        [1, k + 1 < SHELLS ? pick(saddleAt[k + 1]!) : back(0)],
                    ])
                    if (u >= 0.12 && u < 0.85) {
                        loading.visible = true
                        // In the fingers, then turned to lie along the gun as it goes in.
                        const lie = between(u, 0.3, 0.55)
                        loading.position.copy(hand.at).add(new Vector3(0.006 * (1 - lie), -0.006 + 0.022 * lie, 0))
                        loading.rotation.set(-(Math.PI / 2) * lie, 0, 0)
                        if (u >= 0.7) loading.position.z -= between(u, 0.7, 0.85) * 0.03
                    }
                } else hand = left
                // The shells still on the saddle: those not picked yet.
                const picking = span * SHELLS - k < 0.12
                for (const [i, s] of saddle.entries()) s.visible = span < 0 || i > k || (i === k && picking)
                racked = Math.max(racked, outAndBack(t, 0.84, 0.9, 0.9, 0.97))
            }
            pump.position.z = pumpZ + racked * 0.035

            return { left: shifted(hand, [0, 0, hand === left || t === null ? racked * 0.035 : 0]), right }
        },
    }
}

/** The sniper: a long fluted barrel with a brake, a big turreted scope, a bolt, a folded bipod. */
function buildSniper(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.034
    const sightY = top + 0.026
    const group = new Group()
    const magazineAt = new Vector3(x, top - 0.038, -0.13)
    const magazine = () => {
        const mag = new Group()
        mag.add(
            rbox([0.016, 0.024, 0.03], kit.trim, [0, 0, 0], 0.002),
            rbox([0.018, 0.005, 0.033], kit.dark, [0, -0.013, 0], 0.002)
        )
        mag.position.copy(magazineAt)
        return mag
    }
    const inGun = magazine()
    const dropped = magazine()
    dropped.visible = false
    // The bolt: a handle out of the right side with a big knob, lifted and pulled back to cycle.
    const boltZ = -0.075
    const bolt = new Group()
    bolt.position.set(x + 0.013, top - 0.008, boltZ)
    bolt.add(
        box([0.018, 0.004, 0.004], kit.chrome, [0.009, 0, 0]),
        sphere(0.0055, kit.dark, [0.019, 0, 0]),
        tube(0.0045, 0.03, kit.chrome, [-0.006, 0, 0.004])
    )
    const tip = sphere(0.0012, new MeshBasicMaterial({ color: 0xff3030 }), [x, sightY, -0.04])
    const turret = (at: Triple, axis: 'x' | 'y') => {
        const r: Triple = axis === 'y' ? [0, 0, 0] : [0, 0, Math.PI / 2]
        return [upright(0.0048, 0.008, kit.trim, at, r), upright(0.0052, 0.003, kit.dark, at, r)]
    }

    group.add(
        ...merged([
            // Stock: cheek riser in your colour with its knob, buttpad.
            rbox([0.022, 0.034, 0.075], kit.polymer, [x, top - 0.024, -0.03], 0.005),
            rbox([0.016, 0.008, 0.045], kit.trim, [x, top - 0.003, -0.032], 0.003),
            across(0.003, 0.026, kit.chrome, [x, top - 0.01, -0.048]),
            // Receiver, its rail, your colour down the sides.
            rbox([0.026, 0.028, 0.12], kit.metal, [x, top - 0.014, -0.12], 0.004),
            ...rail(kit, x, top + 0.0015, -0.07, -0.18),
            ...[-1, 1].map(side => box([0.002, 0.007, 0.09], kit.trim, [x + side * 0.0135, top - 0.018, -0.12])),
            box([0.0016, 0.008, 0.026], kit.black, [x + 0.0131, top - 0.008, -0.1]),
            // Grip, trigger guard, forend.
            rbox([0.02, 0.045, 0.024], kit.polymer, [x, top - 0.045, -0.075], 0.004, [-0.3, 0, 0]),
            ...triggerGroup(kit, x, top - 0.028, -0.09, -0.112),
            rbox([0.024, 0.022, 0.08], kit.polymer, [x, top - 0.019, -0.215], 0.005),
            // The folded bipod under the forend.
            box([0.016, 0.008, 0.01], kit.dark, [x, top - 0.033, -0.245]),
            ...[-1, 1].map(side => tube(0.0022, 0.075, kit.metal, [x + side * 0.0055, top - 0.035, -0.205])),
            ...[-1, 1].map(side => tube(0.003, 0.008, kit.rubber, [x + side * 0.0055, top - 0.035, -0.166])),
            // Fluted barrel, the brake and its ports.
            tube(0.0055, 0.17, kit.metal, [x, top - 0.014, -0.265], 0.0045),
            ...[0, 1, 2, 3].map(i => {
                const a = (i * Math.PI) / 2
                const at: Triple = [x + 0.005 * Math.cos(a), top - 0.014 + 0.005 * Math.sin(a), -0.29]
                return box([0.0014, 0.0014, 0.11], kit.dark, at)
            }),
            rbox([0.014, 0.01, 0.024], kit.dark, [x, top - 0.014, -0.36], 0.002),
            ...[-0.354, -0.36, -0.366].map(z => box([0.0145, 0.0042, 0.0028], kit.black, [x, top - 0.014, z])),
            // The scope: mounts and rings, the tube, a wide objective, the eyepiece, three turrets.
            ...[-0.085, -0.145].flatMap(z => [
                box([0.01, 0.018, 0.009], kit.dark, [x, top + 0.009, z]),
                ring(0.0088, 0.0016, kit.dark, [x, sightY, z]),
            ]),
            tube(0.008, 0.1, kit.dark, [x, sightY, -0.115]),
            tube(0.008, 0.025, kit.dark, [x, sightY, -0.1775], 0.012),
            tube(0.012, 0.012, kit.dark, [x, sightY, -0.196]),
            tube(0.0095, 0.022, kit.metal, [x, sightY, -0.054]),
            ring(0.0095, 0.0012, kit.trim, [x, sightY, -0.064]),
            ...turret([x, sightY + 0.011, -0.115], 'y'),
            ...turret([x + 0.011, sightY, -0.115], 'x'),
            across(0.004, 0.006, kit.metal, [x - 0.01, sightY, -0.115]),
        ]),
        // The lenses: the eyepiece's and the objective's, catching the light.
        tube(0.0082, 0.002, kit.glass, [x, sightY, -0.0425]),
        tube(0.0112, 0.002, kit.glass, [x, sightY, -0.2015]),
        inGun,
        dropped,
        bolt,
        tip
    )

    const boltAt = (lift: number, back: number) => {
        bolt.rotation.z = lift * 1.1
        bolt.position.z = boltZ + back * 0.03
    }
    const knob = () => {
        const a = bolt.rotation.z
        return new Vector3(x + 0.013 + 0.019 * Math.cos(a), top - 0.008 + 0.019 * Math.sin(a), bolt.position.z)
    }
    const right = pose([x + 0.006, top - 0.046, -0.074], [-0.3, 0, 0])
    const onKnob = () => {
        const k = knob()
        return pose([k.x + 0.006, k.y - 0.012, k.z + 0.006], [-0.5, 0, 0.5])
    }
    const left = cradle([x - 0.001, top - 0.034, -0.21])
    const onMag = pose([x - 0.004, top - 0.07, -0.132], [0.1, 0, 0])
    const magFromHand = magazineAt.clone().sub(onMag.at)
    const away = pose([x - 0.05, top - 0.22, -0.12], [0.6, 0, 0.4])

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.014, -0.372),
        kick: { back: 0.035, rise: 0.26, ms: 230, flash: 1.5 },
        reloadPose: { roll: 0.5, pitch: 0.1, yaw: 0.4, push: 0 },
        eject: { at: [x + 0.014, top - 0.008, -0.1], toward: [0.8, 0.8, 0.3], delayMs: 650, kind: 'long' },
        animate({ reload: t, reloadMs, sinceShot }) {
            let lift = 0
            let back = 0
            let reach = 0
            inGun.visible = true
            inGun.position.copy(magazineAt)
            dropped.visible = false
            if (t !== null) {
                // Bolt up and back, the magazine out and in, the bolt home.
                lift = outAndBack(t, 0.05, 0.1, 0.88, 0.94)
                back = outAndBack(t, 0.1, 0.18, 0.8, 0.88)
                reach = outAndBack(t, 0, 0.05, 0.94, 1)
            } else if (sinceShot >= 300 && sinceShot < 1150) {
                // Cycled after a shot.
                const u = (sinceShot - 350) / 700
                lift = outAndBack(u, 0, 0.2, 0.75, 1)
                back = outAndBack(u, 0.2, 0.45, 0.45, 0.75)
                reach = outAndBack((sinceShot - 300) / 850, 0, 0.06, 0.92, 1)
            }
            boltAt(lift, back)
            const rightHand = reach > 0 ? mix(right, onKnob(), reach) : right
            if (t === null) return { left, right: rightHand }

            const hand = keyed(t, [
                [0.16, left],
                [0.24, onMag],
                [0.3, shifted(onMag, [0, -0.03, 0])],
                [0.4, away],
                [0.5, away],
                [0.62, shifted(onMag, [0, -0.035, 0])],
                [0.7, onMag],
                [0.8, left],
            ])
            const held = hand.at.clone().add(magFromHand)
            if (t >= 0.24 && t < 0.3) inGun.position.copy(held)
            else if (t >= 0.3) {
                falling(dropped, t, 0.3, magazineAt.clone().add(new Vector3(0, -0.03, 0)), reloadMs)
                inGun.visible = t >= 0.5
                if (t < 0.7) inGun.position.copy(held)
            }

            return { left: hand, right: rightHand }
        },
    }
}

/** The rocket launcher: a fat tube on the shoulder, a flared back, ring sights and a side optic, the rocket. */
/** The rocket's materials (shared with the ones in flight). */
type RocketLook = { body: Material; nose: Material; fins: Material }

function buildLauncher(kit: Kit, rocketLook: RocketLook): GunModel {
    const x = 0.07
    const c = -0.04
    const r = 0.022
    const sightY = c + r + 0.014
    const group = new Group()
    const yellow = new MeshStandardMaterial({ color: 0xe8b928, roughness: 0.5 })
    // The rocket: an olive body, a red nose, fins.
    const rocket = new Group()
    rocket.add(
        tube(0.016, 0.16, rocketLook.body, [0, 0, -0.19]),
        tube(0.016, 0.035, rocketLook.nose, [0, 0, -0.2875], 0.0005),
        ring(0.0161, 0.0012, kit.dark, [0, 0, -0.25]),
        box([0.042, 0.003, 0.02], rocketLook.fins, [0, 0, -0.12]),
        box([0.003, 0.042, 0.02], rocketLook.fins, [0, 0, -0.12])
    )
    rocket.position.set(x, c, 0)
    const tip = sphere(0.0013, kit.dot, [x, sightY, -0.25])

    group.add(
        ...merged([
            // The tube, its seams and a band in your colour, the front shroud with warning stripes.
            tube(r, 0.2, kit.olive, [x, c, -0.17], r, 24),
            ...[-0.11, -0.205].map(z => ring(r, 0.0012, kit.dark, [x, c, z])),
            tube(0.0225, 0.02, kit.trim, [x, c, -0.15], 0.0225, 24),
            tube(0.024, 0.014, kit.dark, [x, c, -0.266], 0.024, 24),
            ...[-0.262, -0.27].map(z => ring(0.0242, 0.0014, yellow, [x, c, z])),
            // The flared back (venturi).
            tube(0.03, 0.03, kit.dark, [x, c, -0.055], 0.023, 24),
            tube(0.026, 0.004, kit.black, [x, c, -0.0425], 0.026, 24),
            // Grips and trigger, the shoulder pad.
            rbox([0.018, 0.042, 0.022], kit.polymer, [x, c - 0.036, -0.11], 0.004, [-0.2, 0, 0]),
            ...triggerGroup(kit, x, c - 0.022, -0.12, -0.142, kit.dark),
            rbox([0.016, 0.036, 0.02], kit.polymer, [x, c - 0.036, -0.19], 0.004),
            rbox([0.02, 0.012, 0.06], kit.rubber, [x, c - r - 0.004, -0.075], 0.004),
            // Ring sights on posts, and the optic box on its left with its lens.
            box([0.004, 0.014, 0.004], kit.dark, [x, c + r + 0.003, -0.085]),
            ring(0.004, 0.0013, kit.dark, [x, sightY, -0.085]),
            box([0.003, 0.01, 0.003], kit.dark, [x, c + r + 0.002, -0.25]),
            ring(0.009, 0.0013, kit.dark, [x, sightY, -0.25]),
            box([0.01, 0.008, 0.02], kit.dark, [x - 0.025, c + 0.006, -0.13]),
            rbox([0.014, 0.018, 0.034], kit.dark, [x - 0.033, c + 0.01, -0.13], 0.003),
            tube(0.006, 0.003, kit.glass, [x - 0.033, c + 0.012, -0.1475]),
            // Sling loops.
            ...[-0.09, -0.23].map(z =>
                placed(new Mesh(new TorusGeometry(0.005, 0.0012, 6, 12), kit.metal), [x - r, c, z], [0, Math.PI / 2, 0])
            ),
        ]),
        rocket,
        tip
    )

    const right = pose([x + 0.006, c - 0.037, -0.109], [-0.2, 0, 0])
    const left = pose([x - 0.004, c - 0.038, -0.19])
    const away = pose([x - 0.06, c - 0.22, -0.05], [0.4, 0, 0.5])
    // Holding the rocket from below by its body, `below` the tube's line.
    const holding = (z: number, below: number) => cradle([x - 0.002, c - below - 0.024, z])
    /** How far behind its place the rocket starts sliding in. */
    const ROCKET_BACK = 0.14

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, c, -0.31),
        kick: { back: 0.04, rise: 0.12, ms: 200, flash: 2.2 },
        reloadPose: { roll: 0.15, pitch: 0, yaw: 0.85, push: 0.1 },
        eject: null,
        animate({ reload: t, loaded }) {
            if (t === null) {
                rocket.visible = loaded
                rocket.position.set(x, c, 0)
                return { left, right }
            }
            // A rocket brought up from below, lifted behind the tube, slid into its back and pushed home.
            const up = between(t, 0.2, 0.42)
            const slid = between(t, 0.45, 0.78)
            const below = (1 - up) * 0.09
            const z = (1 - slid) * ROCKET_BACK
            rocket.visible = t >= 0.14
            rocket.position.set(x, c - below, z)
            const carrying = holding(z - 0.19, below)
            // The palm on its tail, stopping at the tube's back as the rocket goes in.
            const pushing = pose([x - 0.002, c - 0.004, Math.max(z - 0.095, -0.03)], [-Math.PI / 2, 0, 0.3])
            let hand: Pose
            if (t < 0.1) hand = mix(left, away, between(t, 0.03, 0.1))
            else if (t < 0.14) hand = mix(away, carrying, between(t, 0.1, 0.14))
            else if (t < 0.45) hand = carrying
            else if (t < 0.55) hand = mix(carrying, pushing, between(t, 0.45, 0.55))
            else if (t < 0.8) hand = pushing
            else if (t < 0.83) hand = shifted(pushing, [0, 0, 0.012 * between(t, 0.8, 0.83)])
            else hand = mix(shifted(pushing, [0, 0, 0.012]), left, between(t, 0.83, 0.95))

            return { left: hand, right }
        },
    }
}

/** The stapler: a dark base, the top arm in your colour, a chrome hinge and strike plate; it pivots at its back. */
export function buildStapler(kit: Kit): { group: Group; arm: Group; right: Pose } {
    const x = 0.045
    const top = -0.0275
    const group = new Group()
    const arm = new Group()
    arm.position.set(x, top - 0.02, -0.05)
    arm.add(
        rbox([0.026, 0.01, 0.11], kit.dark, [0, -0.008, -0.05], 0.003),
        rbox([0.022, 0.016, 0.1], kit.trim, [0, 0.006, -0.048], 0.005),
        box([0.023, 0.003, 0.03], kit.chrome, [0, 0.0145, -0.07]),
        box([0.028, 0.004, 0.02], kit.chrome, [0, -0.0145, -0.098]),
        across(0.005, 0.03, kit.chrome, [0, 0, 0.002]),
        rbox([0.02, 0.03, 0.025], kit.metal, [0, -0.03, 0.005], 0.004)
    )
    group.add(arm)

    return { group, arm, right: pose([x + 0.004, top - 0.046, -0.042], [-0.35, 0, 0]) }
}

export function buildGuns(kit: Kit, rocketLook: RocketLook): Record<Gun, GunModel> {
    return {
        rifle: buildRifle(kit),
        sniper: buildSniper(kit),
        shotgun: buildShotgun(kit),
        pistol: buildPistol(kit),
        launcher: buildLauncher(kit, rocketLook),
    }
}

// --- Hands ------------------------------------------------------------------------------------

/**
 * A gloved fist around a rod along its local Y (the hand's centre on the rod): the back of the hand
 * to +x, fingers wrapped round the front (-z), the thumb over the top; the right hand's index
 * finger along the trigger guard. The left hand is its mirror. Its sleeve runs from `wrist` to the
 * elbow, off screen.
 */
export interface Hand {
    group: Group
    /** The wrist, in the hand's frame. */
    wrist: Vector3
}

export function buildHand(kit: Kit, side: 'left' | 'right'): Hand {
    const group = new Group()
    const fist = new Group()
    fist.add(
        // Palm and back of the hand.
        rbox([0.016, 0.03, 0.026], kit.glove, [0.009, 0, 0.002], 0.006),
        // Fingers, curled round the front, one above the other.
        ...[0.0105, 0.0035, -0.0035, -0.0105].map((y, i) => {
            // The right hand's top finger is on the trigger: what's left of it curls in further back.
            const back = i === 0 && side === 'right' ? 0.01 : 0
            return rbox([0.026, 0.0062, 0.011], kit.glove, [0.001 - back, y, -0.0115], 0.0028)
        }),
        // Knuckle pad.
        rbox([0.006, 0.026, 0.012], kit.dark, [0.017, 0, -0.006], 0.0025),
        // The thumb, over the top and down the far side.
        rbox([0.0075, 0.0075, 0.02], kit.glove, [-0.008, 0.012, -0.004], 0.0034, [0.35, 0, 0]),
        // The cuff.
        upright(0.0125, 0.012, kit.dark, [0.008, -0.018, 0.012], [0.5, 0, 0])
    )
    if (side === 'right') {
        // The index finger along the trigger guard.
        fist.add(rbox([0.0062, 0.0062, 0.024], kit.glove, [-0.002, 0.0105, -0.022], 0.0028))
    } else fist.scale.x = -1
    group.add(fist)

    return { group, wrist: new Vector3(side === 'right' ? 0.01 : -0.01, -0.02, 0.016) }
}

/** A sleeve: a unit-long tapered cylinder from its base (y 0) to its top (y 1), stretched between two points. */
export function buildSleeve(kit: Kit): Mesh {
    const geometry = new CylinderGeometry(0.0105, 0.0135, 1, 14, 1, true)
    geometry.translate(0, 0.5, 0)
    const mesh = new Mesh(geometry, kit.sleeve)

    return mesh
}

/** The muzzle flash: a hot core and petals around it, along -Z. */
export function buildFlash(): { group: Group; petals: Group } {
    const material = new MeshBasicMaterial({
        color: 0xffc46a,
        transparent: true,
        opacity: 0.95,
        blending: AdditiveBlending,
        depthWrite: false,
    })
    const core = material.clone()
    core.color.set(0xfff3c8)
    core.opacity = 1
    const group = new Group()
    const petals = new Group()
    const length = new CylinderGeometry(0.0005, 0.007, 0.035, 6)
    length.translate(0, 0.0175, 0)
    for (let i = 0; i < 4; i++) {
        const petal = new Mesh(length, material)
        petal.rotation.set(-Math.PI / 2 + 0.9, 0, 0)
        const holder = new Group()
        holder.rotation.z = (i * Math.PI) / 2
        holder.add(petal)
        petals.add(holder)
    }
    const forward = new Mesh(length, material)
    forward.rotation.x = -Math.PI / 2
    forward.scale.set(1.4, 1.3, 1.4)
    group.add(petals, forward, new Mesh(new SphereGeometry(0.009, 10, 8), core))

    return { group, petals }
}

/** Spent cases: a rifle or pistol case, the sniper's long one, a shotgun hull. */
export function buildCase(kit: Kit, kind: Ejection['kind']): Group {
    const group = new Group()
    if (kind === 'shell') {
        group.add(tube(0.0045, 0.02, kit.red, [0, 0, 0]), tube(0.0048, 0.005, kit.brass, [0, 0, 0.0095]))
    } else {
        group.add(tube(0.0026, kind === 'long' ? 0.016 : 0.009, kit.brass, [0, 0, 0]))
    }

    return group
}
