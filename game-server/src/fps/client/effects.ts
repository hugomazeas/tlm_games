import {
    AdditiveBlending,
    BoxGeometry,
    type BufferGeometry,
    type Camera,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PointLight,
    Quaternion,
    RingGeometry,
    type Scene,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import type { Gun, RocketState, Weapon } from '../protocol.ts'
import { LAUNCHER, STAPLER, SWITCH_MS } from '../sim/combat.ts'

/**
 * Tracers, impact puffs, rockets and their blasts, and your own gun in front of the camera with
 * its kick, flash and reload.
 */

const UP = new Vector3(0, 1, 0)
const TRACER_MS = 110
const PUFF_MS = 250
const tracerGeometry = new CylinderGeometry(0.004, 0.004, 1, 6, 1, true)
tracerGeometry.translate(0, 0.5, 0)
const puffGeometry = new SphereGeometry(0.02, 8, 6)
const bitGeometry = new BoxGeometry(0.018, 0.018, 0.018)

// A rocket, built along +Y (its nose up): an olive body, a red nose, crossed fins, a glowing tail.
const rocketShape = {
    body: new CylinderGeometry(0.014, 0.014, 0.08, 10),
    nose: new ConeGeometry(0.014, 0.035, 10).translate(0, 0.0575, 0),
    band: new CylinderGeometry(0.0148, 0.0148, 0.01, 10).translate(0, 0.022, 0),
    finA: new BoxGeometry(0.05, 0.022, 0.003).translate(0, -0.03, 0),
    finB: new BoxGeometry(0.003, 0.022, 0.05).translate(0, -0.03, 0),
    glow: new SphereGeometry(0.016, 10, 8).translate(0, -0.045, 0),
    flame: new ConeGeometry(0.011, 0.07, 8).rotateX(Math.PI).translate(0, -0.075, 0),
}
const rocketLook = {
    body: new MeshStandardMaterial({ color: 0x5f6b3d, roughness: 0.55, metalness: 0.3 }),
    nose: new MeshStandardMaterial({ color: 0xc8372d, roughness: 0.45, metalness: 0.2 }),
    fins: new MeshStandardMaterial({ color: 0x1d2026, roughness: 0.5, metalness: 0.5 }),
    glow: new MeshBasicMaterial({ color: 0xfff0b0, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    flame: new MeshBasicMaterial({
        color: 0xff8a2a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
    }),
}
const SMOKE_EVERY_MS = 35
const smokeGeometry = new SphereGeometry(0.025, 8, 6)
// The blast: unit shapes, scaled as they grow.
const blastGeometry = new SphereGeometry(1, 20, 14)
const shockGeometry = new RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2)
const sparkGeometry = new BoxGeometry(0.014, 0.014, 0.03)
const BLAST_MS = 480
const BLAST_LIGHTS = 2

interface Fading {
    mesh: Mesh
    material: MeshBasicMaterial
    born: number
    life: number
    /** Its opacity at birth, fading to 0. */
    opacity: number
    /** Its scale from birth to the end (null: left alone), growing fast then slow when `out`. */
    scale: [number, number] | null
    out: boolean
    /** Flying bits: their velocity (m/s), pulled down by `gravity` (negative: smoke rises). */
    velocity?: Vector3
    gravity: number
    at: number
}

interface FadeLook {
    opacity?: number
    scale?: [number, number]
    out?: boolean
    velocity?: Vector3
    gravity?: number
}

interface Flying {
    group: Group
    flame: Mesh
    lastPuff: number
}

export class Effects {
    private readonly fading: Fading[] = []
    private readonly flying = new Map<number, Flying>()
    /** A few lights for blasts, always in the scene (adding lights recompiles every material). */
    private readonly lights: Array<{ light: PointLight; born: number }> = []
    private nextLight = 0

    constructor(private readonly scene: Scene) {
        for (let i = 0; i < BLAST_LIGHTS; i++) {
            const light = new PointLight(0xffa040, 0, 6, 2)
            scene.add(light)
            this.lights.push({ light, born: -1e9 })
        }
    }

    /**
     * A beam from `from` to `to`, and a puff where it ended. `style.width` thickens the beam (the
     * sniper's), `style.life` keeps it longer (ms).
     */
    tracer(
        from: Vector3,
        to: Vector3,
        color: number,
        now: number,
        hit: boolean,
        style: { width?: number; life?: number } = {}
    ): void {
        const length = from.distanceTo(to)
        const width = style.width ?? 1
        if (length > 0.01) {
            const material = new MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                blending: AdditiveBlending,
                depthWrite: false,
            })
            const beam = new Mesh(tracerGeometry, material)
            beam.position.copy(from)
            beam.quaternion.copy(new Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()))
            beam.scale.set(width, length, width)
            this.add(beam, material, now, style.life ?? TRACER_MS)
        }
        const material = new MeshBasicMaterial({
            color: hit ? 0xff5050 : 0xffe0a0,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        })
        const puff = new Mesh(puffGeometry, material)
        puff.position.copy(to)
        this.add(puff, material, now, PUFF_MS, { scale: [width, width * 4] })
    }

    /** Someone fragged: a burst of bits in their colour where they stood. */
    burst(at: { x: number; y: number; z: number }, color: string, now: number): void {
        for (let i = 0; i < 14; i++) {
            const material = new MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true, opacity: 0.9 })
            const bit = new Mesh(bitGeometry, material)
            bit.position.set(at.x, at.y, at.z)
            const a = Math.random() * Math.PI * 2
            const up = 0.6 + Math.random() * 1.2
            const out = 0.4 + Math.random() * 0.8
            this.add(bit, material, now, 600, { velocity: new Vector3(Math.cos(a) * out, up, Math.sin(a) * out) })
        }
    }

    /**
     * The rockets in flight, every frame (already where they should be drawn): each one along its
     * velocity, its tail burning, a smoke trail behind. The ones gone are taken away.
     */
    rockets(states: RocketState[], now: number): void {
        const seen = new Set<number>()
        const direction = new Vector3()
        for (const state of states) {
            seen.add(state.id)
            let rocket = this.flying.get(state.id)
            if (!rocket) {
                rocket = makeRocket(now)
                this.scene.add(rocket.group)
                this.flying.set(state.id, rocket)
            }
            const speed = Math.hypot(state.vx, state.vy, state.vz)
            if (speed > 1e-6) direction.set(state.vx, state.vy, state.vz).divideScalar(speed)
            else direction.copy(UP)
            rocket.group.position.set(state.x, state.y, state.z)
            rocket.group.quaternion.setFromUnitVectors(UP, direction)
            rocket.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1)
            if (now - rocket.lastPuff >= SMOKE_EVERY_MS) {
                rocket.lastPuff = now
                const material = new MeshBasicMaterial({
                    color: 0xc4c4c4,
                    transparent: true,
                    opacity: 0.45,
                    depthWrite: false,
                })
                const puff = new Mesh(smokeGeometry, material)
                puff.position.set(state.x, state.y, state.z).addScaledVector(direction, -0.08)
                puff.position.x += (Math.random() - 0.5) * 0.01
                puff.position.z += (Math.random() - 0.5) * 0.01
                this.add(puff, material, now, 650, {
                    opacity: 0.45,
                    scale: [0.6, 2.4],
                    out: true,
                    velocity: new Vector3(0, 0.05, 0),
                    gravity: -0.3,
                })
            }
        }
        for (const [id, rocket] of this.flying) {
            if (seen.has(id)) continue
            this.scene.remove(rocket.group)
            this.flying.delete(id)
        }
    }

    /** A rocket went off: a flash, a fireball and a shockwave out to the blast's radius, sparks, smoke, light. */
    explosion(at: { x: number; y: number; z: number }, now: number): void {
        const where = new Vector3(at.x, at.y, at.z)
        const glowing = (color: number) =>
            new MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: AdditiveBlending })
        const place = (geometry: BufferGeometry, material: MeshBasicMaterial) => {
            const mesh = new Mesh(geometry, material)
            mesh.position.copy(where)
            return mesh
        }
        const radius = LAUNCHER.radius

        // The flash, then the fireball with a hotter core, both rushing out and slowing.
        let material = glowing(0xfff6d8)
        this.add(place(blastGeometry, material), material, now, 140, { opacity: 1, scale: [0.15, 0.55], out: true })
        material = glowing(0xff7a1e)
        this.add(place(blastGeometry, material), material, now, BLAST_MS, {
            opacity: 0.85,
            scale: [0.1, radius],
            out: true,
        })
        material = glowing(0xffd27a)
        this.add(place(blastGeometry, material), material, now, BLAST_MS * 0.7, {
            opacity: 0.9,
            scale: [0.06, radius * 0.6],
            out: true,
        })
        // The shockwave: a flat ring along the floor, out to the edge of the blast.
        material = glowing(0xffe2b0)
        material.side = DoubleSide
        this.add(place(shockGeometry, material), material, now, BLAST_MS * 0.8, {
            opacity: 0.7,
            scale: [0.1, radius],
            out: true,
        })
        // Smoke, rising slowly.
        for (let i = 0; i < 6; i++) {
            const smoke = new MeshBasicMaterial({ color: 0x3b3936, transparent: true, depthWrite: false })
            const puff = place(blastGeometry, smoke)
            puff.position.add(
                new Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.3, (Math.random() - 0.5) * 0.5)
            )
            this.add(puff, smoke, now, 800 + Math.random() * 300, {
                opacity: 0.5,
                scale: [0.12, 0.4 + Math.random() * 0.2],
                out: true,
                velocity: new Vector3(0, 0.3 + Math.random() * 0.3, 0),
                gravity: -0.4,
            })
        }
        // Sparks, flung every way.
        for (let i = 0; i < 22; i++) {
            const spark = glowing(i % 3 ? 0xffb040 : 0xfff2c0)
            const a = Math.random() * Math.PI * 2
            const up = Math.random() * 2 - 0.4
            const speed = 2 + Math.random() * 3
            const velocity = new Vector3(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(speed)
            this.add(place(sparkGeometry, spark), spark, now, 350 + Math.random() * 250, {
                opacity: 1,
                velocity,
                gravity: 6,
            })
        }
        // A light from the pool.
        const slot = this.lights[this.nextLight]!
        this.nextLight = (this.nextLight + 1) % this.lights.length
        slot.light.position.copy(where)
        slot.born = now
    }

    update(now: number): void {
        for (let i = this.fading.length - 1; i >= 0; i--) {
            const f = this.fading[i]!
            const t = (now - f.born) / f.life
            if (t >= 1) {
                this.scene.remove(f.mesh)
                f.material.dispose()
                this.fading.splice(i, 1)
                continue
            }
            f.material.opacity = f.opacity * (1 - t)
            if (f.scale) {
                const [from, to] = f.scale
                const grown = f.out ? 1 - (1 - t) * (1 - t) : t
                f.mesh.scale.setScalar(from + (to - from) * grown)
            }
            if (f.velocity) {
                const dt = Math.min(0.05, (now - f.at) / 1000)
                f.velocity.y -= f.gravity * dt
                f.mesh.position.addScaledVector(f.velocity, dt)
                f.mesh.rotation.x += dt * 8
                f.at = now
            }
        }
        for (const slot of this.lights) {
            const t = (now - slot.born) / BLAST_MS
            slot.light.intensity = t >= 0 && t < 1 ? 6 * (1 - t) * (1 - t) : 0
        }
    }

    private add(mesh: Mesh, material: MeshBasicMaterial, now: number, life: number, look: FadeLook = {}): void {
        this.scene.add(mesh)
        this.fading.push({
            mesh,
            material,
            born: now,
            life,
            opacity: look.opacity ?? 0.9,
            scale: look.scale ?? null,
            out: look.out ?? false,
            velocity: look.velocity,
            gravity: look.gravity ?? 9.8,
            at: now,
        })
    }
}

function makeRocket(now: number): Flying {
    const group = new Group()
    const flame = new Mesh(rocketShape.flame, rocketLook.flame)
    group.add(
        new Mesh(rocketShape.body, rocketLook.body),
        new Mesh(rocketShape.nose, rocketLook.nose),
        new Mesh(rocketShape.band, rocketLook.nose),
        new Mesh(rocketShape.finA, rocketLook.fins),
        new Mesh(rocketShape.finB, rocketLook.fins),
        new Mesh(rocketShape.glow, rocketLook.glow),
        flame
    )

    return { group, flame, lastPuff: now }
}

/** Smooth in and out (0 … 1). */
function ease(t: number): number {
    return t * t * (3 - 2 * t)
}

/** 0 → 1 as `t` goes from `a` to `b` (smoothly), clamped. */
function between(t: number, a: number, b: number): number {
    return ease(Math.max(0, Math.min(1, (t - a) / (b - a))))
}

/** Out (0 → 1) over `a … b`, held, back (1 → 0) over `c … d`. */
function outAndBack(t: number, a: number, b: number, c: number, d: number): number {
    return between(t, a, b) * (1 - between(t, c, d))
}

type Triple = [number, number, number]

/**
 * One gun in your hands, in the camera's frame. Its parts are drawn over the world without depth,
 * so their `renderOrder` paints them back to front (10 + a layer: inner parts, then what's forward
 * and below, the body, what sits on it, the sights, the sight's glowing tip last).
 */
interface GunModel {
    group: Group
    /** The point aiming brings to the middle of the view. */
    sight: Vector3
    /** The glowing dot on that point. */
    tip: Mesh
    /** Where its rounds leave (the tracer starts there). */
    muzzle: Vector3
    /** Its kick: back (m) and up (rad) over `ms`; its flash's size. */
    kick: { back: number; rise: number; ms: number; flash: number }
    /** How it tips for a reload: roll and pitch (rad), pushed forward (m). */
    reloadPose: { roll: number; pitch: number; push: number }
    /** Poses its moving parts: how far through a reload (null: none), ms since its last shot, a rocket in it. */
    animate(reload: number | null, sinceShot: number, loaded: boolean): void
}

interface Kit {
    metal: MeshStandardMaterial
    dark: MeshStandardMaterial
    trim: MeshStandardMaterial
    chrome: MeshStandardMaterial
    dot: MeshBasicMaterial
    box(size: Triple, material: MeshStandardMaterial | MeshBasicMaterial, at: Triple, layer?: number): Mesh
    /** A cylinder along Z, `front` the radius at its -Z end. */
    tube(
        radius: number,
        length: number,
        material: MeshStandardMaterial | MeshBasicMaterial,
        at: Triple,
        layer?: number,
        front?: number
    ): Mesh
    sphere(radius: number, material: MeshStandardMaterial | MeshBasicMaterial, at: Triple, layer?: number): Mesh
}

function kitFor(color: string): Kit {
    const layered = (mesh: Mesh, at: Triple, layer: number) => {
        mesh.position.set(...at)
        mesh.renderOrder = 10 + layer

        return mesh
    }

    return {
        metal: new MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.75 }),
        dark: new MeshStandardMaterial({ color: 0x14161a, roughness: 0.6, metalness: 0.5 }),
        trim: new MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }),
        chrome: new MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.25, metalness: 0.9 }),
        dot: new MeshBasicMaterial({ color: 0x8dff6a }),
        box: (size, material, at, layer = 2) => layered(new Mesh(new BoxGeometry(...size), material), at, layer),
        tube: (radius, length, material, at, layer = 2, front = radius) => {
            const mesh = new Mesh(new CylinderGeometry(front, radius, length, 14), material)
            // The cylinder's top (+Y) turned to -Z.
            mesh.rotation.x = -Math.PI / 2

            return layered(mesh, at, layer)
        },
        sphere: (radius, material, at, layer = 6) =>
            layered(new Mesh(new SphereGeometry(radius, 8, 6), material), at, layer),
    }
}

/** Iron sights on a flat top at `top`: a notched rear at `rearZ`, a post at `frontZ` (standing on `frontBase`). */
function ironSights(kit: Kit, x: number, top: number, sightY: number, rearZ: number, frontZ: number, frontBase = top) {
    const rise = sightY - top - 0.004
    const middle = top + 0.004 + rise / 2
    const post = sightY - frontBase

    return [
        kit.box([0.018, 0.004, 0.012], kit.dark, [x, top + 0.002, rearZ], 4),
        kit.box([0.005, rise, 0.012], kit.dark, [x - 0.0055, middle, rearZ], 4.2),
        kit.box([0.005, rise, 0.012], kit.dark, [x + 0.0055, middle, rearZ], 4.2),
        kit.box([0.0025, post, 0.004], kit.dark, [x, frontBase + post / 2, frontZ], 3.8),
    ]
}

/** The assault rifle: a stock, a long receiver in your colour down the sides, a curved magazine, a handguard. */
function buildRifle(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.028
    const sightY = top + 0.013
    const group = new Group()
    const magazine = new Group()
    const magazineY = top - 0.03
    magazine.position.set(x, magazineY, -0.125)
    const lower = kit.box([0.016, 0.03, 0.022], kit.trim, [0, -0.037, -0.008], 1)
    lower.rotation.x = 0.35
    magazine.add(kit.box([0.016, 0.026, 0.022], kit.trim, [0, -0.012, 0], 1.1), lower)
    const grip = kit.box([0.02, 0.045, 0.024], kit.metal, [x, top - 0.045, -0.075], 1)
    grip.rotation.x = -0.25
    const tip = kit.sphere(0.0016, kit.dot, [x, sightY, -0.215])
    group.add(
        kit.box([0.02, 0.028, 0.05], kit.dark, [x, top - 0.02, -0.035], 3),
        kit.box([0.028, 0.03, 0.11], kit.metal, [x, top - 0.015, -0.115], 2),
        ...[-1, 1].map(side => kit.box([0.002, 0.008, 0.08], kit.trim, [x + side * 0.0145, top - 0.014, -0.115], 3)),
        grip,
        magazine,
        kit.box([0.024, 0.024, 0.06], kit.dark, [x, top - 0.016, -0.2], 1.5),
        kit.tube(0.005, 0.04, kit.metal, [x, top - 0.016, -0.25], 1),
        kit.tube(0.0075, 0.014, kit.dark, [x, top - 0.016, -0.276], 1.2),
        ...ironSights(kit, x, top, sightY, -0.07, -0.215, top - 0.004),
        tip
    )

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.016, -0.285),
        kick: { back: 0.012, rise: 0.05, ms: 70, flash: 1 },
        reloadPose: { roll: 0.35, pitch: 0.18, push: 0 },
        animate(reload) {
            // The magazine drops out, and slides back in.
            const drop = reload === null ? 0 : outAndBack(reload, 0.15, 0.45, 0.6, 0.85)
            magazine.position.y = magazineY - drop * 0.07
            magazine.visible = drop < 0.98
        },
    }
}

/** The pistol: a slide over a frame in your colour, a magazine in the grip. */
function buildPistol(kit: Kit): GunModel {
    const x = 0.04
    const top = -0.032
    const sightY = top + 0.007
    const group = new Group()
    const slide = new Group()
    slide.add(
        kit.box([0.02, 0.018, 0.085], kit.metal, [x, top - 0.009, -0.115], 2),
        kit.box([0.003, rise(top, sightY), 0.004], kit.dark, [x, (top + sightY) / 2, -0.152], 3.8),
        kit.box([0.005, rise(top, sightY), 0.006], kit.dark, [x - 0.0045, (top + sightY) / 2, -0.08], 4.2),
        kit.box([0.005, rise(top, sightY), 0.006], kit.dark, [x + 0.0045, (top + sightY) / 2, -0.08], 4.2)
    )
    const tip = kit.sphere(0.0014, kit.dot, [x, sightY, -0.152])
    slide.add(tip)
    // The grip, tilted back; the magazine slides out of its bottom along it.
    const well = new Group()
    well.position.set(x, top - 0.045, -0.085)
    well.rotation.x = -0.3
    const magazine = new Group()
    magazine.add(
        kit.box([0.014, 0.04, 0.018], kit.dark, [0, -0.002, 0], 0.5),
        kit.box([0.019, 0.006, 0.024], kit.trim, [0, -0.024, 0], 1.1)
    )
    well.add(kit.box([0.018, 0.042, 0.022], kit.metal, [0, 0, 0], 1), magazine)
    group.add(
        slide,
        kit.box([0.018, 0.01, 0.07], kit.trim, [x, top - 0.023, -0.12], 1.5),
        kit.tube(0.004, 0.006, kit.dark, [x, top - 0.01, -0.16], 1),
        well
    )

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.01, -0.165),
        kick: { back: 0.014, rise: 0.16, ms: 90, flash: 0.7 },
        reloadPose: { roll: 0.3, pitch: 0.25, push: 0 },
        animate(reload, sinceShot) {
            // The slide snaps back on a shot; it stays back through a reload and slams home at its end.
            const cycled = sinceShot < 60 ? 1 - sinceShot / 60 : 0
            const locked = reload === null ? 0 : outAndBack(reload, 0.05, 0.12, 0.85, 0.92)
            slide.position.z = Math.max(cycled, locked) * 0.014
            const drop = reload === null ? 0 : outAndBack(reload, 0.08, 0.3, 0.5, 0.75)
            magazine.position.y = -drop * 0.06
            magazine.visible = drop < 0.98
        },
    }
}

/** How tall a sight stands from `top` to `sightY`. */
function rise(top: number, sightY: number): number {
    return sightY - top
}

/** The shotgun: a wide barrel with a bead, a tube magazine and a pump under it, shells on the side. */
function buildShotgun(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.03
    const sightY = top + 0.0012
    const group = new Group()
    const red = new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 })
    const brass = new MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 0.8 })
    const pumpZ = -0.175
    const pump = new Group()
    pump.position.set(x, top - 0.027, pumpZ)
    pump.add(
        kit.box([0.026, 0.02, 0.05], kit.trim, [0, 0, 0], 1),
        ...[-0.015, 0, 0.015].map(z => kit.box([0.027, 0.003, 0.004], kit.dark, [0, -0.004, z], 1.05))
    )
    // Shells along the receiver's side, standing up: red hulls on brass heads.
    const saddle = [-0.07, -0.082, -0.094, -0.106].map(z => {
        const shell = new Group()
        shell.position.set(x - 0.0185, top - 0.016, z)
        const hull = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.022, 10), red)
        const head = new Mesh(new CylinderGeometry(0.0048, 0.0048, 0.006, 10), brass)
        head.position.y = -0.011
        hull.renderOrder = head.renderOrder = 13
        shell.add(hull, head)
        group.add(shell)
        return shell
    })
    // The shell being loaded: lying along the gun, pushed up into the port under the receiver.
    const loading = new Group()
    loading.add(kit.tube(0.0045, 0.022, red, [0, 0, 0], 0.8), kit.tube(0.0048, 0.006, brass, [0, 0, 0.012], 0.85))
    loading.visible = false
    const grip = kit.box([0.02, 0.042, 0.024], kit.dark, [x, top - 0.045, -0.06], 1)
    grip.rotation.x = -0.25
    const tip = kit.sphere(0.0022, new MeshBasicMaterial({ color: 0xffe08a }), [x, sightY, -0.272])
    group.add(
        kit.box([0.022, 0.03, 0.05], kit.dark, [x, top - 0.022, -0.035], 3),
        kit.box([0.03, 0.032, 0.085], kit.metal, [x, top - 0.016, -0.09], 2),
        grip,
        kit.tube(0.0085, 0.15, kit.metal, [x, top - 0.0095, -0.2075], 1.5),
        kit.tube(0.0095, 0.008, kit.dark, [x, top - 0.0095, -0.279], 1.6),
        kit.tube(0.0065, 0.12, kit.dark, [x, top - 0.027, -0.19], 0.5),
        pump,
        loading,
        tip
    )
    const SHELLS = saddle.length

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.0095, -0.29),
        kick: { back: 0.03, rise: 0.3, ms: 170, flash: 1.8 },
        reloadPose: { roll: 0.5, pitch: 0.1, push: 0 },
        animate(reload, sinceShot) {
            // After a shot, rack it: the pump back and forward.
            let racked = sinceShot >= 180 && sinceShot < 420 ? Math.sin(((sinceShot - 180) / 240) * Math.PI) : 0
            loading.visible = false
            for (const shell of saddle) shell.visible = true
            if (reload !== null) {
                // One shell after the other, from the side into the port and forward into the tube.
                const span = (reload - 0.08) / 0.72
                const k = Math.floor(span * SHELLS)
                if (span >= 0 && k < SHELLS) {
                    const u = span * SHELLS - k
                    const up = between(u, 0, 0.55)
                    const push = between(u, 0.55, 0.95)
                    loading.visible = true
                    loading.position.set(x + 0.006 * (1 - up), top - 0.07 + up * 0.04, -0.09 - push * 0.04)
                }
                for (const [i, shell] of saddle.entries()) shell.visible = span < 0 || i > k
                racked = Math.max(racked, outAndBack(reload, 0.82, 0.9, 0.9, 0.98))
            }
            pump.position.z = pumpZ + racked * 0.035
        },
    }
}

/** The sniper: a long barrel, a big scope on top (the red dot in its eyepiece), a bolt, a magazine. */
function buildSniper(kit: Kit): GunModel {
    const x = 0.045
    const top = -0.034
    const sightY = top + 0.026
    const group = new Group()
    const glass = new MeshStandardMaterial({
        color: 0x0d2a3a,
        roughness: 0.05,
        metalness: 0.9,
        emissive: 0x0a2030,
    })
    const magazine = new Group()
    const magazineY = top - 0.038
    magazine.position.set(x, magazineY, -0.13)
    magazine.add(kit.box([0.016, 0.024, 0.03], kit.trim, [0, 0, 0], 1))
    // The bolt: a handle out of the right side, lifted and pulled back to cycle.
    const boltZ = -0.075
    const bolt = new Group()
    bolt.position.set(x + 0.013, top - 0.008, boltZ)
    const handle = kit.box([0.018, 0.004, 0.004], kit.chrome, [0.009, 0, 0], 1.8)
    bolt.add(handle, kit.sphere(0.005, kit.dark, [0.019, 0, 0], 1.9))
    const grip = kit.box([0.02, 0.045, 0.024], kit.dark, [x, top - 0.045, -0.075], 1)
    grip.rotation.x = -0.3
    const tip = kit.sphere(0.0012, new MeshBasicMaterial({ color: 0xff3030 }), [x, sightY, -0.04])
    group.add(
        kit.box([0.022, 0.034, 0.06], kit.dark, [x, top - 0.022, -0.03], 3),
        kit.box([0.016, 0.008, 0.04], kit.trim, [x, top - 0.003, -0.03], 3.5),
        kit.box([0.026, 0.028, 0.12], kit.metal, [x, top - 0.014, -0.12], 2),
        ...[-1, 1].map(side => kit.box([0.002, 0.007, 0.09], kit.trim, [x + side * 0.0135, top - 0.014, -0.12], 3)),
        grip,
        magazine,
        bolt,
        kit.tube(0.0055, 0.17, kit.metal, [x, top - 0.014, -0.265], 1, 0.0045),
        kit.box([0.014, 0.01, 0.022], kit.dark, [x, top - 0.014, -0.36], 1.2),
        // The scope: two mounts, the tube, a wide front bell, the eyepiece and its lens.
        kit.box([0.01, 0.018, 0.008], kit.dark, [x, top + 0.009, -0.085], 3.5),
        kit.box([0.01, 0.018, 0.008], kit.dark, [x, top + 0.009, -0.145], 3.5),
        kit.tube(0.008, 0.1, kit.dark, [x, sightY, -0.115], 4),
        kit.tube(0.008, 0.025, kit.dark, [x, sightY, -0.1775], 3.8, 0.012),
        kit.tube(0.0095, 0.022, kit.metal, [x, sightY, -0.054], 4.5),
        kit.tube(0.0082, 0.002, glass, [x, sightY, -0.0425], 5),
        kit.box([0.007, 0.008, 0.007], kit.trim, [x, sightY + 0.011, -0.115], 4.6),
        tip
    )

    const boltAt = (lift: number, back: number) => {
        bolt.rotation.z = lift * 1.1
        bolt.position.z = boltZ + back * 0.03
    }

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, top - 0.014, -0.372),
        kick: { back: 0.035, rise: 0.26, ms: 230, flash: 1.5 },
        reloadPose: { roll: 0.25, pitch: 0.12, push: 0 },
        animate(reload, sinceShot) {
            let lift = 0
            let back = 0
            if (reload !== null) {
                // Bolt up and back, the magazine out and in, the bolt home.
                lift = outAndBack(reload, 0.03, 0.1, 0.9, 0.97)
                back = outAndBack(reload, 0.1, 0.2, 0.8, 0.9)
            } else if (sinceShot >= 350 && sinceShot < 1050) {
                // Cycled after a shot.
                const u = (sinceShot - 350) / 700
                lift = outAndBack(u, 0, 0.2, 0.75, 1)
                back = outAndBack(u, 0.2, 0.45, 0.45, 0.75)
            }
            boltAt(lift, back)
            const drop = reload === null ? 0 : outAndBack(reload, 0.22, 0.4, 0.55, 0.75)
            magazine.position.y = magazineY - drop * 0.06
            magazine.visible = drop < 0.98
        },
    }
}

/** The rocket launcher: a fat tube on the shoulder, ring sights, the rocket's nose out the front when loaded. */
function buildLauncher(kit: Kit): GunModel {
    const x = 0.07
    const c = -0.04
    const r = 0.022
    const sightY = c + r + 0.014
    const group = new Group()
    const olive = new MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.6, metalness: 0.25 })
    const ring = (radius: number, at: Triple, layer: number) => {
        const mesh = new Mesh(new TorusGeometry(radius, 0.0013, 6, 20), kit.dark)
        mesh.position.set(...at)
        mesh.renderOrder = 10 + layer
        return mesh
    }
    // The rocket: an olive body, a red nose, fins, as in flight (its own materials: these skip depth).
    const rocketBody = rocketLook.body.clone()
    const rocketFins = rocketLook.fins.clone()
    const rocketParts = [
        kit.tube(0.016, 0.16, rocketBody, [0, 0, -0.19], 0),
        kit.tube(0.016, 0.035, rocketLook.nose.clone(), [0, 0, -0.2875], 0.5, 0.0005),
        kit.box([0.042, 0.003, 0.02], rocketFins, [0, 0, -0.12], 0),
        kit.box([0.003, 0.042, 0.02], rocketFins, [0, 0, -0.12], 0),
    ]
    const layers = rocketParts.map(mesh => mesh.renderOrder)
    const rocket = new Group()
    rocket.position.set(x, c, 0)
    rocket.add(...rocketParts)
    const grip = kit.box([0.018, 0.04, 0.022], kit.dark, [x, c - 0.035, -0.11], 1)
    grip.rotation.x = -0.2
    const tip = kit.sphere(0.0013, kit.dot, [x, sightY, -0.25])
    group.add(
        rocket,
        kit.tube(r, 0.2, olive, [x, c, -0.17], 2),
        kit.tube(0.026, 0.02, kit.dark, [x, c, -0.06], 3, 0.022),
        kit.tube(0.0198, 0.003, kit.dark, [x, c, -0.0685], 3.5),
        kit.tube(0.024, 0.012, kit.dark, [x, c, -0.265], 1.5),
        kit.tube(0.0225, 0.02, kit.trim, [x, c, -0.15], 2.5),
        grip,
        kit.box([0.016, 0.035, 0.02], kit.dark, [x, c - 0.035, -0.19], 1),
        // Ring sights: a peep at the back, a wider ring at the front, both on posts.
        kit.box([0.004, 0.014, 0.004], kit.dark, [x, c + r + 0.003, -0.085], 4.3),
        ring(0.004, [x, sightY, -0.085], 4.5),
        kit.box([0.003, 0.01, 0.003], kit.dark, [x, c + r + 0.002, -0.25], 3.8),
        ring(0.009, [x, sightY, -0.25], 4),
        tip
    )

    return {
        group,
        sight: new Vector3(x, sightY, 0),
        tip,
        muzzle: new Vector3(x, c, -0.31),
        kick: { back: 0.04, rise: 0.12, ms: 200, flash: 2.2 },
        reloadPose: { roll: 0.2, pitch: -0.1, push: 0.07 },
        animate(reload, _sinceShot, loaded) {
            if (reload === null) {
                rocket.visible = loaded
                rocket.position.set(x, c, 0)
                rocketParts.forEach((mesh, i) => (mesh.renderOrder = layers[i]!))
                return
            }
            // A rocket comes up behind the tube, then slides into its back.
            const up = between(reload, 0.15, 0.45)
            const slid = between(reload, 0.45, 0.8)
            rocket.visible = reload >= 0.15
            rocket.position.set(x, c - (1 - up) * 0.09, (1 - slid) * 0.2)
            // Behind the tube it's drawn over it, inside it under it.
            const outside = slid < 0.05
            rocketParts.forEach((mesh, i) => (mesh.renderOrder = outside ? 13.5 : layers[i]!))
        },
    }
}

/** The stapler: a dark base, the top arm in your colour, a chrome hinge and strike plate; it pivots at its back. */
function buildStapler(kit: Kit): { group: Group; arm: Group } {
    const x = 0.045
    const top = -0.0275
    const group = new Group()
    const arm = new Group()
    arm.position.set(x, top - 0.02, -0.05)
    arm.add(
        kit.box([0.026, 0.01, 0.11], kit.dark, [0, -0.008, -0.05]),
        kit.box([0.022, 0.016, 0.1], kit.trim, [0, 0.006, -0.048], 3),
        kit.box([0.028, 0.004, 0.02], kit.chrome, [0, -0.0145, -0.098], 1)
    )
    const hinge = new Mesh(new CylinderGeometry(0.005, 0.005, 0.03, 10), kit.chrome)
    hinge.rotation.z = Math.PI / 2
    hinge.position.set(0, 0, 0.002)
    hinge.renderOrder = 13
    arm.add(hinge, kit.box([0.02, 0.03, 0.025], kit.metal, [0, -0.03, 0.005], 1))
    group.add(arm)

    return { group, arm }
}

/** Your gun (or stapler), held at the bottom right of the view. */
export class Viewmodel {
    private readonly root = new Group()
    private readonly guns: Record<Gun, GunModel>
    private readonly stapler: Group
    private readonly staplerArm: Group
    private held: Weapon = 'rifle'
    /** The last gun held: the stapler aims and fires from nothing, so its questions go there. */
    private lastGun: Gun = 'rifle'
    private isLoaded = true
    private switchAt = -1e9
    private swingAt = -1e9
    private readonly flash: Mesh
    private readonly light = new PointLight(0xffc070, 0, 1.2)
    private kickAt = -1e9

    constructor(camera: Camera, color: string) {
        const kit = kitFor(color)
        this.guns = {
            rifle: buildRifle(kit),
            sniper: buildSniper(kit),
            shotgun: buildShotgun(kit),
            pistol: buildPistol(kit),
            launcher: buildLauncher(kit),
        }
        const stapler = buildStapler(kit)
        this.stapler = stapler.group
        this.staplerArm = stapler.arm
        this.flash = new Mesh(
            new SphereGeometry(0.014, 8, 6),
            new MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: AdditiveBlending })
        )
        this.flash.renderOrder = 18
        this.flash.visible = false
        for (const gun of Object.values(this.guns)) {
            gun.group.visible = false
            this.root.add(gun.group)
        }
        this.root.add(this.stapler, this.flash, this.light)
        this.root.traverse(o => {
            if (o instanceof Mesh) {
                o.renderOrder = Math.max(o.renderOrder, 10)
                ;(o.material as MeshBasicMaterial).depthTest = false
            }
        })
        camera.add(this.root)
    }

    /** The sight's glowing tip (the gun in hand, or the last one): on the crosshair when fully aimed. */
    get sightTip(): Mesh {
        return this.guns[this.lastGun].tip
    }

    fire(now: number): void {
        this.kickAt = now
    }

    /** A stapler swing: a chop forward and down. */
    swing(now: number): void {
        this.swingAt = now
    }

    set visible(on: boolean) {
        this.root.visible = on
    }

    /** Whether the launcher has a rocket in it (its nose shows out of the tube). */
    set loaded(on: boolean) {
        this.isLoaded = on
    }

    /** The weapon in hand: the other one drops away and this one comes up. */
    set weapon(weapon: Weapon) {
        if (weapon === this.held) return
        this.held = weapon
        if (weapon !== 'stapler') this.lastGun = weapon
        this.switchAt = performance.now()
    }

    /**
     * `aim` 0–1: how far into aiming down the sights (the gun slides over so its sights sit on the
     * crosshair, and stops bobbing). `reload` 0–1: how far through a reload (null: none).
     */
    update(now: number, moving: boolean, aim = 0, reload: number | null = null): void {
        const holdingGun = this.held !== 'stapler'
        const gun = this.guns[this.lastGun]
        const since = now - this.kickAt
        const k = Math.max(0, 1 - since / gun.kick.ms)
        const kick = holdingGun ? k * k * (1 - aim * 0.6) : 0
        const bob = moving ? Math.sin(now * 0.012) * 0.003 * (1 - aim) : 0
        // Just switched: the new weapon rises from below.
        const raise = Math.min(1, (now - this.switchAt) / SWITCH_MS)
        const lowered = (1 - raise) * 0.07
        // A reload: the gun tips over to show its side while its parts move.
        const r = holdingGun ? reload : null
        const tilt = r === null ? 0 : ease(Math.min(1, r / 0.15)) * ease(Math.min(1, (1 - r) / 0.15))
        const pose = gun.reloadPose
        gun.animate(r, since, this.isLoaded)

        // Aimed, the sight's point runs through the middle of the view: the crosshair sits on it.
        const sight = holdingGun ? gun.sight : this.guns.rifle.sight
        this.root.position.set(
            -sight.x * aim,
            bob - sight.y * aim - lowered - tilt * 0.015,
            kick * gun.kick.back - tilt * pose.push
        )
        this.root.rotation.set(kick * gun.kick.rise + tilt * pose.pitch, 0, tilt * pose.roll)
        for (const [name, model] of Object.entries(this.guns)) model.group.visible = name === this.held
        this.stapler.visible = !holdingGun
        this.flash.visible = holdingGun && since < 45 + gun.kick.flash * 10
        if (this.flash.visible) {
            this.flash.scale.setScalar(gun.kick.flash)
            this.flash.position.copy(gun.muzzle).add(new Vector3(0, 0, -0.012 * gun.kick.flash))
            this.light.position.copy(gun.muzzle)
        }
        this.light.intensity = this.flash.visible ? 0.6 * Math.min(2, gun.kick.flash) : 0

        // The swing: back a little (wind-up), then a fast chop forward and down, then back.
        const t = (now - this.swingAt) / STAPLER.intervalMs
        let chop = 0
        if (t < 0.15) chop = (-t / 0.15) * 0.35
        else if (t < 0.35) chop = -0.35 + ((t - 0.15) / 0.2) * 1.45
        else if (t < 1) chop = 1.1 * (1 - (t - 0.35) / 0.65)
        this.staplerArm.rotation.x = -chop
        this.staplerArm.position.z = -0.05 - Math.max(0, chop) * 0.03
    }

    /** The muzzle of the gun in hand, in the world. */
    muzzleIn(camera: Camera): Vector3 {
        camera.updateMatrixWorld()
        // Through the gun's own frame: it slides over while aiming.
        return this.root.localToWorld(this.guns[this.lastGun].muzzle.clone())
    }
}
