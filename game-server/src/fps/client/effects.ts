import {
    AdditiveBlending,
    BoxGeometry,
    type Camera,
    CylinderGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PointLight,
    Quaternion,
    type Scene,
    SphereGeometry,
    Vector3,
} from 'three'

/** Tracers, impact puffs, and your own blaster in front of the camera with its kick and flash. */

const UP = new Vector3(0, 1, 0)
const TRACER_MS = 110
const PUFF_MS = 250
const tracerGeometry = new CylinderGeometry(0.004, 0.004, 1, 6, 1, true)
tracerGeometry.translate(0, 0.5, 0)
const puffGeometry = new SphereGeometry(0.02, 8, 6)
const bitGeometry = new BoxGeometry(0.018, 0.018, 0.018)

interface Fading {
    mesh: Mesh
    material: MeshBasicMaterial
    born: number
    life: number
    grow: number
    /** Flying bits: their velocity (m/s), under gravity. */
    velocity?: Vector3
    at: number
}

export class Effects {
    private readonly fading: Fading[] = []

    constructor(private readonly scene: Scene) {}

    /** A beam from `from` to `to`, and a puff where it ended. */
    tracer(from: Vector3, to: Vector3, color: number, now: number, hit: boolean): void {
        const length = from.distanceTo(to)
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
            beam.scale.set(1, length, 1)
            this.add(beam, material, now, TRACER_MS, 0)
        }
        const material = new MeshBasicMaterial({
            color: hit ? 0xff5050 : 0xffe0a0,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        })
        const puff = new Mesh(puffGeometry, material)
        puff.position.copy(to)
        this.add(puff, material, now, PUFF_MS, 3)
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
            this.add(bit, material, now, 600, 0, new Vector3(Math.cos(a) * out, up, Math.sin(a) * out))
        }
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
            f.material.opacity = 0.9 * (1 - t)
            if (f.grow) f.mesh.scale.setScalar(1 + t * f.grow)
            if (f.velocity) {
                const dt = Math.min(0.05, (now - f.at) / 1000)
                f.velocity.y -= 9.8 * dt
                f.mesh.position.addScaledVector(f.velocity, dt)
                f.mesh.rotation.x += dt * 8
                f.at = now
            }
        }
    }

    private add(mesh: Mesh, material: MeshBasicMaterial, now: number, life: number, grow: number, v?: Vector3): void {
        this.scene.add(mesh)
        this.fading.push({ mesh, material, born: now, life, grow, velocity: v, at: now })
    }
}

/** Your blaster, held at the bottom right of the view. */
export class Viewmodel {
    private readonly root = new Group()
    private readonly flash: Mesh
    private readonly light = new PointLight(0xffc070, 0, 1.2)
    private kickAt = -1e9
    /** The muzzle, for tracers: in the camera's frame. */
    readonly muzzle = new Vector3(0.045, -0.035, -0.17)

    constructor(camera: Camera, color: string) {
        const metal = new MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.75 })
        const trim = new MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })
        const body = new Mesh(new BoxGeometry(0.03, 0.035, 0.12), metal)
        body.position.set(0.045, -0.045, -0.1)
        const stripe = new Mesh(new BoxGeometry(0.031, 0.008, 0.08), trim)
        stripe.position.set(0.045, -0.026, -0.1)
        const grip = new Mesh(new BoxGeometry(0.022, 0.05, 0.025), metal)
        grip.position.set(0.045, -0.075, -0.07)
        grip.rotation.x = -0.25
        const barrel = new Mesh(new CylinderGeometry(0.007, 0.007, 0.05, 10), metal)
        barrel.rotation.x = Math.PI / 2
        barrel.position.set(0.045, -0.035, -0.17)
        this.flash = new Mesh(
            new SphereGeometry(0.014, 8, 6),
            new MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: AdditiveBlending })
        )
        this.flash.position.copy(this.muzzle).add(new Vector3(0, 0, -0.02))
        this.flash.visible = false
        this.light.position.copy(this.muzzle)
        this.root.add(body, stripe, grip, barrel, this.flash, this.light)
        // Drawn over the world so it never sinks into a wall you hug.
        this.root.traverse(o => {
            if (o instanceof Mesh) {
                o.renderOrder = 10
                ;(o.material as MeshBasicMaterial).depthTest = false
            }
        })
        camera.add(this.root)
    }

    fire(now: number): void {
        this.kickAt = now
    }

    set visible(on: boolean) {
        this.root.visible = on
    }

    update(now: number, moving: boolean): void {
        const since = now - this.kickAt
        const kick = Math.max(0, 1 - since / 90)
        this.root.position.set(0, moving ? Math.sin(now * 0.012) * 0.003 : 0, kick * 0.02)
        this.root.rotation.x = kick * 0.12
        this.flash.visible = since < 45
        this.light.intensity = since < 45 ? 0.6 : 0
    }

    /** The muzzle in the world. */
    muzzleIn(camera: Camera): Vector3 {
        return camera.localToWorld(this.muzzle.clone())
    }
}
