import {
    AdditiveBlending,
    BoxGeometry,
    CanvasTexture,
    type Camera,
    Color,
    DoubleSide,
    DynamicDrawUsage,
    Euler,
    InstancedBufferAttribute,
    InstancedMesh,
    type Material,
    Matrix4,
    MeshBasicMaterial,
    MeshLambertMaterial,
    PlaneGeometry,
    Quaternion,
    type Scene,
    Vector3,
} from 'three'
import type { Surface } from '../map/office.js'

/**
 * Where rounds land: a hole (a crack in glass, a scorch where a rocket went off) that stays, and
 * what flies off it, by what it's made of: plaster dust and chips, wood splinters, paper off a
 * desk, sparks off metal and screens, fibres off fabric, glittering shards off glass. Everything is
 * drawn from a few fixed pools (one instanced mesh each, a handful of draws however much shooting
 * there is); the oldest gives way when one runs out.
 */

export type ImpactSurface = Surface | 'glass'

/** Marks left behind (holes, cracks, scorches): this many of each, the oldest replaced first. */
const HOLES = 256
const CRACKS = 48
const SCORCHES = 24
/** Flying bits at once. */
const CHIPS = 512
const SPARKS = 256
const PUFFS = 128
const PAPERS = 48
/** Marks sit this far off their surface (m), so they don't flicker into it. */
const LIFT = 0.0015
const GRAVITY = -9.8

/** What each surface throws when hit. */
interface Look {
    /** The hole's tint (multiplies the dark hole texture). */
    hole: number
    chips: { count: number; colors: number[]; size: number; speed: number; long?: boolean }
    dust: { count: number; color: number; size: number } | null
    sparks: number
    paper?: number
    crack?: boolean
}

const LOOKS: Record<ImpactSurface, Look> = {
    plaster: {
        hole: 0x5a554e,
        chips: { count: 6, colors: [0xe2ded6, 0xcfcac1], size: 0.007, speed: 1.6 },
        dust: { count: 3, color: 0xe4e0d8, size: 0.09 },
        sparks: 0,
    },
    wood: {
        hole: 0x3b2a1c,
        chips: { count: 7, colors: [0x9a6b3f, 0xc79a6a], size: 0.008, speed: 1.8, long: true },
        dust: { count: 1, color: 0xb59a7a, size: 0.06 },
        sparks: 0,
    },
    desk: {
        hole: 0x4a463f,
        chips: { count: 6, colors: [0xd9d6cf, 0x8a7f70], size: 0.007, speed: 1.6, long: true },
        dust: { count: 1, color: 0xe3e1dc, size: 0.06 },
        sparks: 0,
        paper: 0.45,
    },
    metal: {
        hole: 0x9aa0a8,
        chips: { count: 2, colors: [0x3b4048], size: 0.005, speed: 2.4 },
        dust: { count: 1, color: 0x9a9a9a, size: 0.05 },
        sparks: 10,
    },
    fabric: {
        hole: 0x2a2c30,
        chips: { count: 5, colors: [0x55595e, 0x7d8d84], size: 0.005, speed: 0.9 },
        dust: { count: 2, color: 0x8a8d92, size: 0.07 },
        sparks: 0,
    },
    plastic: {
        hole: 0x2a2a2a,
        chips: { count: 6, colors: [0xeceae6, 0x18191c], size: 0.006, speed: 2 },
        dust: { count: 1, color: 0xd0d0d0, size: 0.05 },
        sparks: 0,
    },
    tile: {
        hole: 0x6a6a66,
        chips: { count: 8, colors: [0xf2f2ee, 0xdde8e4], size: 0.007, speed: 2.2 },
        dust: { count: 2, color: 0xf0efeb, size: 0.07 },
        sparks: 2,
    },
    screen: {
        hole: 0x111111,
        chips: { count: 5, colors: [0x0b2638, 0x88ccee], size: 0.005, speed: 1.8 },
        dust: null,
        sparks: 14,
        crack: true,
    },
    plant: {
        hole: 0x2c3a22,
        chips: { count: 7, colors: [0x3e7a3a, 0x2c5e2e, 0x3a2a1f], size: 0.008, speed: 1.2 },
        dust: { count: 1, color: 0x6b5a45, size: 0.05 },
        sparks: 0,
    },
    glass: {
        hole: 0xffffff,
        chips: { count: 10, colors: [0xdff1f8, 0xffffff, 0xaad8ee], size: 0.006, speed: 2.2 },
        dust: null,
        sparks: 0,
        crack: true,
    },
}

/** A flying bit: born at, lasting, from where at what speed, spinning, how big, its colour. */
interface Bit {
    born: number
    life: number
    at: Vector3
    velocity: Vector3
    spin: Vector3
    size: Vector3
    /** Air drag (1/s): dust and paper drift, chips barely slow. */
    drag: number
    gravity: number
    /** Lands and lies on the floor (y = 0) instead of falling through it. */
    lands: boolean
}

/** One instanced pool of bits: written every frame while any is alive. */
class Bits {
    readonly mesh: InstancedMesh
    private readonly bits: Array<Bit | null>
    private next = 0
    private alive = 0
    /** Per-instance opacity, where the material reads it (`fading`). */
    private readonly opacity: InstancedBufferAttribute | null

    constructor(
        scene: Scene,
        geometry: BoxGeometry | PlaneGeometry,
        material: Material,
        private readonly max: number,
        private readonly look: { fadeOut: boolean; billboard: boolean; grow: number }
    ) {
        this.mesh = new InstancedMesh(geometry, material, max)
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
        this.mesh.setColorAt(0, new Color())
        this.mesh.frustumCulled = false
        this.bits = Array.from({ length: max }, () => null)
        this.opacity = look.fadeOut ? new InstancedBufferAttribute(new Float32Array(max), 1) : null
        if (this.opacity) {
            this.opacity.setUsage(DynamicDrawUsage)
            geometry.setAttribute('instanceOpacity', this.opacity)
        }
        for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, HIDDEN)
        this.mesh.count = max
        scene.add(this.mesh)
    }

    add(bit: Bit, color: number): void {
        const i = this.next
        this.next = (this.next + 1) % this.max
        if (!this.bits[i]) this.alive++
        this.bits[i] = bit
        this.mesh.setColorAt(i, scratchColor.set(color))
        this.mesh.instanceColor!.needsUpdate = true
    }

    update(now: number, dt: number, camera: Camera): void {
        if (this.alive === 0) return
        for (let i = 0; i < this.max; i++) {
            const bit = this.bits[i]
            if (!bit) continue
            const t = (now - bit.born) / bit.life
            if (t >= 1) {
                this.bits[i] = null
                this.alive--
                this.mesh.setMatrixAt(i, HIDDEN)
                continue
            }
            bit.velocity.y += bit.gravity * dt
            bit.velocity.multiplyScalar(Math.max(0, 1 - bit.drag * dt))
            bit.at.addScaledVector(bit.velocity, dt)
            if (bit.lands && bit.at.y < 0.002) {
                bit.at.y = 0.002
                bit.velocity.set(bit.velocity.x * 0.3, 0, bit.velocity.z * 0.3)
                bit.spin.multiplyScalar(0.5)
            }
            if (this.look.billboard) scratchQuaternion.copy(camera.quaternion)
            else {
                const age = (now - bit.born) / 1000
                scratchEuler.set(bit.spin.x * age, bit.spin.y * age, bit.spin.z * age)
                scratchQuaternion.setFromEuler(scratchEuler)
            }
            // Fading bits fade; the others shrink away over their last fifth.
            const grow = 1 + this.look.grow * Math.sqrt(t)
            const shrink = this.look.fadeOut ? 1 : Math.min(1, (1 - t) * 5)
            scratchScale.copy(bit.size).multiplyScalar(grow * shrink)
            this.mesh.setMatrixAt(i, scratchMatrix.compose(bit.at, scratchQuaternion, scratchScale))
            if (this.opacity) this.opacity.setX(i, (1 - t) * (1 - t) * 0.7)
        }
        this.mesh.instanceMatrix.needsUpdate = true
        if (this.opacity) this.opacity.needsUpdate = true
    }
}

/** Marks that stay: holes, cracks, scorches, each pool replacing its oldest. */
class Marks {
    readonly mesh: InstancedMesh
    private next = 0

    constructor(
        scene: Scene,
        texture: CanvasTexture | null,
        private readonly max: number,
        blending = false
    ) {
        const material = new MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: DoubleSide,
            ...(blending ? { blending: AdditiveBlending } : {}),
        })
        this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, max)
        this.mesh.setColorAt(0, new Color())
        this.mesh.frustumCulled = false
        for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, HIDDEN)
        this.mesh.renderOrder = 1
        scene.add(this.mesh)
    }

    /** A mark `size` m across on the surface at `at` facing `normal`, turned at random about it. */
    add(at: Vector3, normal: Vector3, size: number, color: number): void {
        const i = this.next
        this.next = (this.next + 1) % this.max
        scratchQuaternion.setFromUnitVectors(FACING, normal)
        scratchQuaternion.multiply(spinAbout.setFromAxisAngle(FACING, Math.random() * Math.PI * 2))
        scratchVector.copy(at).addScaledVector(normal, LIFT)
        scratchScale.set(size, size, 1)
        this.mesh.setMatrixAt(i, scratchMatrix.compose(scratchVector, scratchQuaternion, scratchScale))
        this.mesh.setColorAt(i, scratchColor.set(color))
        this.mesh.instanceMatrix.needsUpdate = true
        this.mesh.instanceColor!.needsUpdate = true
    }
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const FACING = new Vector3(0, 0, 1)
const scratchMatrix = new Matrix4()
const scratchQuaternion = new Quaternion()
const spinAbout = new Quaternion()
const scratchScale = new Vector3()
const scratchVector = new Vector3()
const scratchColor = new Color()
const scratchEuler = new Euler()

export class Impacts {
    private readonly chips: Bits
    private readonly sparks: Bits
    private readonly puffs: Bits
    private readonly papers: Bits
    private readonly holes: Marks
    private readonly cracks: Marks
    private readonly scorches: Marks
    private last = 0

    constructor(scene: Scene) {
        this.chips = new Bits(scene, new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), CHIPS, {
            fadeOut: false,
            billboard: false,
            grow: 0,
        })
        this.sparks = new Bits(
            scene,
            new BoxGeometry(1, 1, 1),
            new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true, depthWrite: false }),
            SPARKS,
            { fadeOut: false, billboard: false, grow: 0 }
        )
        this.puffs = new Bits(scene, new PlaneGeometry(1, 1), fading(texture(drawPuff)), PUFFS, {
            fadeOut: true,
            billboard: true,
            grow: 2.2,
        })
        const paper = new MeshLambertMaterial({ side: DoubleSide })
        this.papers = new Bits(scene, new PlaneGeometry(1, 1), paper, PAPERS, {
            fadeOut: false,
            billboard: false,
            grow: 0,
        })
        this.holes = new Marks(scene, texture(drawHole), HOLES)
        this.cracks = new Marks(scene, texture(drawCrack), CRACKS)
        this.scorches = new Marks(scene, texture(drawScorch), SCORCHES)
    }

    /**
     * A round landed on `surface` at `at` (its face's `normal`, toward the shooter), having come
     * along `direction`: its mark, and what flies off it.
     */
    hit(at: Vector3, normal: Vector3, direction: Vector3, surface: ImpactSurface, now: number): void {
        const look = LOOKS[surface]
        if (look.crack) this.cracks.add(at, normal, surface === 'glass' ? 0.1 : 0.06, 0xffffff)
        else this.holes.add(at, normal, 0.022, look.hole)

        // Off the surface, mostly back along the normal, a little the way the round was going on.
        const bounce = direction.clone().reflect(normal)
        const out = () => {
            const jitter = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            return normal
                .clone()
                .multiplyScalar(0.8)
                .addScaledVector(bounce, 0.5)
                .addScaledVector(jitter, 0.9)
                .normalize()
        }

        const { chips } = look
        for (let i = 0; i < chips.count; i++) {
            const size = chips.size * (0.6 + Math.random() * 0.8)
            this.chips.add(
                {
                    born: now,
                    life: 700 + Math.random() * 500,
                    at: at.clone().addScaledVector(normal, 0.005),
                    velocity: out().multiplyScalar(chips.speed * (0.5 + Math.random())),
                    spin: randomSpin(25),
                    size: chips.long ? new Vector3(size * 0.5, size * 0.5, size * 2.5) : new Vector3(size, size, size),
                    drag: 1,
                    gravity: GRAVITY,
                    lands: true,
                },
                chips.colors[i % chips.colors.length]!
            )
        }
        if (look.dust) {
            for (let i = 0; i < look.dust.count; i++) {
                const size = look.dust.size * (0.6 + Math.random() * 0.6)
                this.puffs.add(
                    {
                        born: now,
                        life: 500 + Math.random() * 400,
                        at: at.clone().addScaledVector(normal, 0.02),
                        velocity: out().multiplyScalar(0.35 + Math.random() * 0.3),
                        spin: new Vector3(),
                        size: new Vector3(size, size, size),
                        drag: 4,
                        gravity: -0.15,
                        lands: false,
                    },
                    look.dust.color
                )
            }
        }
        for (let i = 0; i < look.sparks; i++) {
            const velocity = out().multiplyScalar(2.5 + Math.random() * 3)
            this.sparks.add(
                {
                    born: now,
                    life: 160 + Math.random() * 220,
                    at: at.clone().addScaledVector(normal, 0.004),
                    velocity,
                    spin: new Vector3(),
                    size: new Vector3(0.0018, 0.0018, 0.022),
                    drag: 2,
                    gravity: GRAVITY * 0.6,
                    lands: false,
                },
                i % 3 ? 0xffc35a : 0xfff4d0
            )
        }
        // A desk: now and then the papers on it go flying, and flutter down.
        if (look.paper && Math.random() < look.paper) {
            for (let i = 0; i < 2; i++) {
                this.papers.add(
                    {
                        born: now,
                        life: 2600 + Math.random() * 1400,
                        at: at.clone().addScaledVector(normal, 0.01),
                        velocity: out()
                            .multiplyScalar(0.8 + Math.random() * 0.6)
                            .add(new Vector3(0, 0.6, 0)),
                        spin: randomSpin(6),
                        size: new Vector3(0.045, 0.06, 1),
                        drag: 3.5,
                        gravity: GRAVITY * 0.35,
                        lands: true,
                    },
                    i ? 0xf4f2ec : 0xfffbe8
                )
            }
        }
    }

    /** A rocket went off at `at`: a scorch on what's nearest (`surface`, facing `normal`), debris thrown off it. */
    blast(at: Vector3, normal: Vector3, direction: Vector3, surface: ImpactSurface, now: number): void {
        this.scorches.add(at, normal, 0.5 + Math.random() * 0.15, 0xffffff)
        for (let i = 0; i < 4; i++) this.hit(at, normal, direction, surface, now)
    }

    /** Every frame: the flying bits move; the dust turns to face the camera. */
    update(now: number, camera: Camera): void {
        const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
        this.last = now
        for (const pool of [this.chips, this.sparks, this.puffs, this.papers]) pool.update(now, dt, camera)
    }
}

function randomSpin(rate: number): Vector3 {
    return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(rate * 2)
}

/** A see-through material whose instances each fade (`instanceOpacity`, 0–1). */
function fading(map: CanvasTexture | null): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false })
    material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
            .replace(
                'void main() {',
                'attribute float instanceOpacity;\nvarying float vInstanceOpacity;\nvoid main() {'
            )
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvInstanceOpacity = instanceOpacity;')
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'varying float vInstanceOpacity;\nvoid main() {')
            .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vInstanceOpacity;')
    }

    return material
}

/** A small square canvas drawn by `draw`, as a texture (null without a DOM: tests). */
function texture(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 64): CanvasTexture | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const g = canvas.getContext('2d')
    if (!g) return null
    draw(g, size)

    return new CanvasTexture(canvas)
}

/** A bullet hole: a dark core, a torn rim, a faint ring of lighter dust (white: tinted per surface). */
function drawHole(g: CanvasRenderingContext2D, s: number): void {
    const c = s / 2
    const dust = g.createRadialGradient(c, c, s * 0.12, c, c, s * 0.5)
    dust.addColorStop(0, 'rgba(255,255,255,0.55)')
    dust.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = dust
    g.fillRect(0, 0, s, s)
    g.fillStyle = 'rgba(0,0,0,0.95)'
    g.beginPath()
    for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const r = s * (0.13 + Math.random() * 0.05)
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
    }
    g.fill()
}

/** A crack in glass: lines out from the hole, a ring or two across them. */
function drawCrack(g: CanvasRenderingContext2D, s: number): void {
    const c = s / 2
    g.strokeStyle = 'rgba(235,248,255,0.9)'
    g.lineWidth = 1.2
    const rays = 9
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + Math.random() * 0.4
        g.beginPath()
        g.moveTo(c, c)
        let x = c
        let y = c
        for (let k = 1; k <= 4; k++) {
            const r = (s / 2) * (k / 4) * (0.8 + Math.random() * 0.25)
            const bend = a + (Math.random() - 0.5) * 0.35
            x = c + Math.cos(bend) * r
            y = c + Math.sin(bend) * r
            g.lineTo(x, y)
        }
        g.stroke()
    }
    g.lineWidth = 0.8
    for (const r of [0.16, 0.3]) {
        g.beginPath()
        g.arc(c, c, s * r, 0, Math.PI * 2)
        g.stroke()
    }
    g.fillStyle = 'rgba(20,30,40,0.85)'
    g.beginPath()
    g.arc(c, c, s * 0.05, 0, Math.PI * 2)
    g.fill()
}

/** A rocket's scorch: soot, darker in the middle, ragged at the edge. */
function drawScorch(g: CanvasRenderingContext2D, s: number): void {
    const c = s / 2
    const soot = g.createRadialGradient(c, c, 0, c, c, s / 2)
    soot.addColorStop(0, 'rgba(10,8,6,0.9)')
    soot.addColorStop(0.45, 'rgba(25,20,15,0.7)')
    soot.addColorStop(1, 'rgba(30,25,20,0)')
    g.fillStyle = soot
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2
        const r = s * (0.25 + Math.random() * 0.22)
        g.fillStyle = `rgba(15,12,10,${0.2 + Math.random() * 0.3})`
        g.beginPath()
        g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, s * (0.02 + Math.random() * 0.04), 0, Math.PI * 2)
        g.fill()
    }
}

/** A soft round puff (white: tinted per surface). */
function drawPuff(g: CanvasRenderingContext2D, s: number): void {
    const c = s / 2
    const puff = g.createRadialGradient(c, c, 0, c, c, s / 2)
    puff.addColorStop(0, 'rgba(255,255,255,0.9)')
    puff.addColorStop(0.6, 'rgba(255,255,255,0.35)')
    puff.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = puff
    g.fillRect(0, 0, s, s)
}
