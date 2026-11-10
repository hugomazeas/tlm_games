import {
    AdditiveBlending,
    BoxGeometry,
    type BufferGeometry,
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
    Vector3,
} from 'three'
import type { RocketState } from '../protocol.ts'
import { LAUNCHER } from '../sim/combat.ts'

/**
 * Tracers, impact puffs, rockets and their blasts. (Your own gun in your hands is `viewmodel.ts`.)
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
/** The rocket's materials: in flight, and in the launcher in your hands. */
export const rocketLook = {
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

    /** Shove's leaf blower running (`key`: whose): faint air puffs streaming out of the nozzle, a leaf now and then. */
    air(from: Vector3, toward: Vector3, now: number, key = ''): void {
        if (now - (this.lastAir.get(key) ?? 0) < 30) return
        this.lastAir.set(key, now)
        for (let i = 0; i < 2; i++) {
            const material = new MeshBasicMaterial({
                color: 0xe6f2f2,
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
            })
            const puff = new Mesh(puffGeometry, material)
            puff.position.copy(from)
            const velocity = jittered(toward, 0.25).multiplyScalar(3.5 + Math.random() * 2)
            this.add(puff, material, now, 320, { opacity: 0.3, scale: [0.5, 2.6], out: true, velocity, gravity: 0 })
        }
        if (Math.random() < 0.25) {
            const material = new MeshBasicMaterial({
                color: Math.random() < 0.5 ? 0x9a7b3a : 0x6f8f3a,
                transparent: true,
            })
            const leaf = new Mesh(bitGeometry, material)
            leaf.scale.set(0.8, 0.15, 0.6)
            leaf.position.copy(from)
            const velocity = jittered(toward, 0.35).multiplyScalar(3 + Math.random() * 2)
            this.add(leaf, material, now, 600, { velocity, gravity: 2 })
        }
    }

    /** Shove's fire extinguisher going off: a white cloud out of the horn, spreading as it goes. */
    spray(from: Vector3, toward: Vector3, now: number): void {
        for (let i = 0; i < 14; i++) {
            const material = new MeshBasicMaterial({
                color: 0xf4f6f8,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
            })
            const puff = new Mesh(puffGeometry, material)
            puff.position.copy(from)
            const velocity = jittered(toward, 0.45).multiplyScalar(2 + Math.random() * 4)
            this.add(puff, material, now, 650 + Math.random() * 250, {
                opacity: 0.7,
                scale: [1, 5 + Math.random() * 3],
                out: true,
                velocity,
                gravity: -0.4,
            })
        }
    }

    private readonly lastAir = new Map<string, number>()

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
                // Not disposed: three holds materials weakly, so it's collected anyway, and disposing the
                // last one alive deletes the shared shader, compiled again (a hitch) for the next shot.
                this.scene.remove(f.mesh)
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

/** A unit direction turned a random bit off `toward` (up to `spread`, in radians, roughly). */
function jittered(toward: Vector3, spread: number): Vector3 {
    return new Vector3(
        toward.x + (Math.random() - 0.5) * spread * 2,
        toward.y + (Math.random() - 0.5) * spread * 2,
        toward.z + (Math.random() - 0.5) * spread * 2
    ).normalize()
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
