import {
    AmbientLight,
    BackSide,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    CylinderGeometry,
    DirectionalLight,
    DoubleSide,
    Euler,
    Float32BufferAttribute,
    FogExp2,
    Group,
    HemisphereLight,
    InstancedMesh,
    type Material,
    MathUtils,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Object3D,
    type OrthographicCamera,
    PlaneGeometry,
    Quaternion,
    Ray,
    RepeatWrapping,
    type Scene,
    SphereGeometry,
    SRGBColorSpace,
    type Texture,
    Vector3,
    type WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TREE } from '../assets/catalog/plants.ts'
import { place } from '../assets/place.ts'
import { BOUNDS, buildErablesGeometry, ERABLES_PLACES, ERABLES_SCALE, LAWN } from '../map/erables.ts'
import {
    Builder,
    ERABLES_MATERIALS,
    type ErablesMaterial,
    type ErablesMaterials,
    rng,
    type TreeSpot,
    WORLD_UV,
} from '../map/erables-kit.ts'
import type { Office } from '../map/office.js'
import type { MapId } from '../protocol.ts'
import { type FpsWorld, worldFrom } from '../sim/world.ts'

/**
 * Rue des Érables as the browser draws it: the map's meshes (the ones the server collides with) in
 * painted materials (brick, siding, shingles, asphalt, lawns strewn with leaves, all on canvases,
 * no image files), merged per material; maples, oaks and birches crowned in October colours; leaves
 * on the ground, in piles and falling; and the neighbourhood past the fences and the road works. No
 * light of its own: switching maps retunes the office's sun, sky and fill (`erablesLooks`), so no
 * shader compiles mid-game, and the shadows are drawn once per switch.
 */

const S = ERABLES_SCALE

export interface ErablesScene {
    /** Shrunk to the minis' size, hidden until a match is played here. */
    group: Group
    world: FpsWorld
    /** Falling leaves, the stalled car's hazards. */
    update(now: number): void
}

// --- Painting ----------------------------------------------------------------------------------

type Rgbh = [number, number, number, number]

function canvasOf(w: number, h = w): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
}

function textureOf(c: HTMLCanvasElement, metres: number, srgb = true, anisotropy = 8): CanvasTexture {
    const t = new CanvasTexture(c)
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(1 / metres, 1 / metres)
    t.anisotropy = anisotropy
    if (srgb) t.colorSpace = SRGBColorSpace
    return t
}

/** Tileable value noise on a unit square. */
function noise(seed: number, period: number): (u: number, v: number) => number {
    const r = rng(seed)
    const g = Float32Array.from({ length: period * period }, r)
    const at = (i: number, j: number) =>
        g[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!
    return (u, v) => {
        const x = u * period
        const y = v * period
        const xi = Math.floor(x)
        const yi = Math.floor(y)
        let xf = x - xi
        let yf = y - yi
        xf = xf * xf * (3 - 2 * xf)
        yf = yf * yf * (3 - 2 * yf)
        const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf
        const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf
        return a + (b - a) * yf
    }
}

/** A hash of two integers to 0–1 (a brick's tone, a board's). */
function hash(a: number, b: number, seed = 0): number {
    let h = Math.imul(a * 374761393 + b * 668265263 + seed * 2246822519, 3266489917)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v))
const fract = (v: number) => v - Math.floor(v)

/**
 * Colour and height per pixel (`fn` fills [r, g, b, height]), then `post` draws on top (leaves,
 * cracks); the height becomes a normal map. Tiles every `metres`.
 */
function paint(
    n: number,
    metres: number,
    fn: (u: number, v: number, out: Rgbh) => void,
    normalStrength = 2,
    post?: (g: CanvasRenderingContext2D, n: number) => void
): { map: CanvasTexture; normalMap: CanvasTexture } {
    const c = canvasOf(n)
    const h = canvasOf(n)
    const ci = c.getContext('2d')!.createImageData(n, n)
    const hd = new Float32Array(n * n)
    const out: Rgbh = [0, 0, 0, 0]
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            fn(x / n, y / n, out)
            const i = y * n + x
            ci.data[i * 4] = clamp255(out[0])
            ci.data[i * 4 + 1] = clamp255(out[1])
            ci.data[i * 4 + 2] = clamp255(out[2])
            ci.data[i * 4 + 3] = 255
            hd[i] = out[3]
        }
    }
    c.getContext('2d')!.putImageData(ci, 0, 0)
    post?.(c.getContext('2d')!, n)
    const ni = h.getContext('2d')!.createImageData(n, n)
    const hh = (x: number, y: number) => hd[((y + n) % n) * n + ((x + n) % n)]!
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const dx = (hh(x + 1, y) - hh(x - 1, y)) * normalStrength
            const dy = (hh(x, y + 1) - hh(x, y - 1)) * normalStrength
            const l = Math.hypot(dx, dy, 1)
            const i = (y * n + x) * 4
            ni.data[i] = (-dx / l) * 127.5 + 127.5
            ni.data[i + 1] = (dy / l) * 127.5 + 127.5
            ni.data[i + 2] = (1 / l) * 127.5 + 127.5
            ni.data[i + 3] = 255
        }
    }
    h.getContext('2d')!.putImageData(ni, 0, 0)
    return { map: textureOf(c, metres), normalMap: textureOf(h, metres, false) }
}

const LEAF_COLORS = [
    '#b3261e',
    '#c8402a',
    '#d9572b',
    '#e07b24',
    '#f0a03a',
    '#e8b830',
    '#c9531c',
    '#9c5a2a',
    '#8f1d1a',
    '#d6a33c',
]

/** A maple leaf's outline, centred, `r` across, turned `a`. */
function leafPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
    g.beginPath()
    for (let i = 0; i <= 10; i++) {
        const t = a + (i / 10) * Math.PI * 2
        const k = i % 2 === 0 ? 1 : 0.45
        const lobe = i === 5 ? 0.3 : 1
        g.lineTo(x + Math.cos(t) * r * k * lobe, y + Math.sin(t) * r * k * lobe)
    }
    g.closePath()
}

/** Leaves strewn on a texture: `count`, `size` px across, tones from the palette. */
function strewLeaves(
    g: CanvasRenderingContext2D,
    n: number,
    count: number,
    size: number,
    seed: number,
    alpha = 1
): void {
    const R = rng(seed)
    for (let i = 0; i < count; i++) {
        const x = R() * n
        const y = R() * n
        const r = size * (0.6 + R() * 0.6)
        g.globalAlpha = alpha * (0.75 + R() * 0.25)
        g.fillStyle = LEAF_COLORS[Math.floor(R() * LEAF_COLORS.length)]!
        // Drawn on both sides of an edge too, so the texture tiles.
        for (const dx of [0, x > n - r ? -n : x < r ? n : 0])
            for (const dy of [0, y > n - r ? -n : y < r ? n : 0]) {
                leafPath(g, x + dx, y + dy, r, R() * 6.28)
                g.fill()
            }
    }
    g.globalAlpha = 1
}

/** Text centred on (x, y), its font shrunk until it fits `width`. */
function fitText(
    g: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    weight = 700
): void {
    let px = size
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    do {
        g.font = `${weight} ${px}px system-ui, sans-serif`
        px -= 2
    } while (px > 8 && g.measureText(text).width > width)
    g.fillText(text, x, y)
}

/** A texture drawn on a canvas, as it is (signs, doors, the TV). */
function drawn(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTexture {
    const c = canvasOf(w, h)
    draw(c.getContext('2d')!, w, h)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
}

function std(opts: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial {
    return new MeshStandardMaterial(opts)
}

/** Every material of the map, painted. The glass is the office's own (same shader, its reflections). */
export function paintMaterials(glass: Material): ErablesMaterials {
    const fine = noise(1, 128)
    const mid = noise(2, 32)
    const broad = noise(3, 8)
    const bladeNoise = noise(4, 256)
    const sidingGrain = noise(8, 64)
    const woodGrain = noise(9, 64)
    const leafy = noise(10, 64)
    const straw = noise(11, 64)
    const paper = noise(12, 32)

    const grass = paint(
        512,
        2.5,
        (u, v, o) => {
            const blades = bladeNoise(u, v)
            const patch = broad(u, v)
            const g = 0.55 + mid(u, v) * 0.25 + blades * 0.3
            o[0] = (70 + patch * 50) * g + 10
            o[1] = (98 + patch * 25) * g + 8
            o[2] = 40 * g
            o[3] = blades * 0.6
        },
        2.5,
        (g, n) => strewLeaves(g, n, 70, 7, 5, 0.95)
    )
    const leaves = paint(
        512,
        1.5,
        (u, v, o) => {
            const k = mid(u, v)
            o[0] = 70 + k * 30
            o[1] = 40 + k * 15
            o[2] = 20
            o[3] = fine(u, v)
        },
        3,
        (g, n) => strewLeaves(g, n, 900, 11, 6)
    )
    const asphalt = paint(
        512,
        4,
        (u, v, o) => {
            const grit = fine(u, v)
            const speck = hash(Math.floor(u * 512), Math.floor(v * 512), 9) > 0.93 ? 30 : 0
            const stain = broad(u, v) * 14 - mid(u, v) * 8
            const k = 62 + grit * 16 + speck + stain
            o[0] = k
            o[1] = k
            o[2] = k + 3
            o[3] = grit * 0.5 + speck / 60
        },
        2,
        (g, n) => {
            // Cracks and a patch.
            const R = rng(12)
            g.strokeStyle = 'rgba(20,20,22,.75)'
            g.lineWidth = 1.2
            for (let i = 0; i < 9; i++) {
                g.beginPath()
                let x = R() * n
                let y = R() * n
                g.moveTo(x, y)
                for (let j = 0; j < 9; j++) {
                    x += (R() - 0.5) * 40
                    y += (R() - 0.5) * 40
                    g.lineTo(x, y)
                }
                g.stroke()
            }
        }
    )
    const driveway = paint(256, 3, (u, v, o) => {
        const k = 44 + fine(u, v) * 12 + broad(u, v) * 8
        o[0] = k
        o[1] = k
        o[2] = k + 2
        o[3] = fine(u, v) * 0.3
    })
    const concreteFn = (base: number) => (u: number, v: number, o: Rgbh) => {
        const k = base + fine(u, v) * 14 + broad(u, v) * 16 - mid(u, v) * 10
        o[0] = k
        o[1] = k - 2
        o[2] = k - 6
        o[3] = fine(u, v) * 0.3
    }
    const concrete = paint(256, 2, concreteFn(158))
    const sidewalk = paint(
        512,
        1.5,
        (u, v, o) => {
            concreteFn(165)(u, v, o)
            const joint = u < 0.006 || v < 0.006
            if (joint) {
                o[0] -= 60
                o[1] -= 60
                o[2] -= 60
                o[3] = -1
            }
        },
        3,
        (g, n) => strewLeaves(g, n, 8, 9, 7)
    )
    const gravel = paint(
        256,
        1,
        (u, v, o) => {
            const cell = hash(Math.floor(u * 90), Math.floor(v * 90), 3)
            const k = 110 + cell * 70 + fine(u, v) * 20
            o[0] = k
            o[1] = k - 6
            o[2] = k - 12
            o[3] = cell
        },
        3
    )
    const brickFn =
        (palette: [number, number, number][], mortar: [number, number, number]) => (u: number, v: number, o: Rgbh) => {
            const courses = 16
            const row = Math.floor(v * courses)
            const fu = u * 6 + (row % 2 ? 0.5 : 0)
            const col = Math.floor(fu)
            const bu = fract(fu)
            const bv = fract(v * courses)
            const isMortar = bu < 0.045 || bv < 0.13
            if (isMortar) {
                const k = fine(u, v) * 18
                o[0] = mortar[0] + k
                o[1] = mortar[1] + k
                o[2] = mortar[2] + k
                o[3] = 0
                return
            }
            const tone = palette[Math.floor(hash(row, col, 4) * palette.length)]!
            const k = 0.82 + hash(row, col, 5) * 0.3 + (fine(u, v) - 0.5) * 0.25
            o[0] = tone[0] * k
            o[1] = tone[1] * k
            o[2] = tone[2] * k
            o[3] = 1 + fine(u, v) * 0.2
        }
    const brick = paint(
        512,
        1.2,
        brickFn(
            [
                [142, 58, 42],
                [124, 50, 38],
                [160, 72, 50],
                [110, 46, 36],
                [150, 66, 54],
            ],
            [168, 160, 150]
        ),
        4
    )
    const brickBuff = paint(
        512,
        1.2,
        brickFn(
            [
                [196, 164, 118],
                [182, 150, 104],
                [206, 176, 132],
                [170, 138, 98],
            ],
            [150, 140, 128]
        ),
        4
    )
    const sidingFn = (rgb: [number, number, number]) => (u: number, v: number, o: Rgbh) => {
        const t = fract(v * 5)
        const grain = sidingGrain(u * 0.25, v * 4) * 0.06
        const shade = (t > 0.9 ? 0.72 : 0.92 + t * 0.1) + grain
        o[0] = rgb[0] * shade
        o[1] = rgb[1] * shade
        o[2] = rgb[2] * shade
        o[3] = t * 1.2 + grain
    }
    const sidingCream = paint(256, 1, sidingFn([232, 222, 198]), 3)
    const sidingSage = paint(256, 1, sidingFn([143, 160, 138]), 3)
    const sidingGrey = paint(256, 1, sidingFn([150, 158, 164]), 3)
    const shingleFn = (rgb: [number, number, number]) => (u: number, v: number, o: Rgbh) => {
        const rows = 7
        const row = Math.floor(v * rows)
        const fu = u * 3 + (row % 2 ? 0.5 : 0)
        const tab = Math.floor(fu)
        const t = fract(v * rows)
        const cut = fract(fu) < 0.02 || t > 0.93
        const tone = 0.8 + hash(row, tab, 7) * 0.35
        const grit = hash(Math.floor(u * 512), Math.floor(v * 512), 8) * 0.3
        const k = (cut ? 0.45 : tone) * (0.85 + grit)
        o[0] = rgb[0] * k
        o[1] = rgb[1] * k
        o[2] = rgb[2] * k
        o[3] = cut ? 0 : 1 - t * 0.4 + grit * 0.4
    }
    const shingle = paint(512, 1, shingleFn([92, 70, 58]), 3)
    const shingleGrey = paint(512, 1, shingleFn([78, 80, 84]), 3)
    const foundation = paint(256, 1.5, concreteFn(140))
    const plasterFn = (rgb: [number, number, number]) => (u: number, v: number, o: Rgbh) => {
        const k = 0.97 + fine(u, v) * 0.04 - broad(u, v) * 0.03
        o[0] = rgb[0] * k
        o[1] = rgb[1] * k
        o[2] = rgb[2] * k
        o[3] = fine(u, v) * 0.15
    }
    const plaster = paint(128, 2, plasterFn([236, 230, 218]), 1)
    const plasterBlue = paint(128, 2, plasterFn([201, 214, 223]), 1)
    const plasterSage = paint(128, 2, plasterFn([206, 212, 188]), 1)
    const boards =
        (rgb: [number, number, number], width: number, along: 'u' | 'v', gap: number) =>
        (u: number, v: number, o: Rgbh) => {
            const [a, b] = along === 'u' ? [u, v] : [v, u]
            const lane = Math.floor(b / width)
            const lb = fract(b / width)
            const seam = fract(a * 0.7 + hash(lane, 1, 2))
            const joint = lb < gap || seam < 0.006
            const grain = woodGrain(a * 0.5, b * 8) * 0.18
            const tone = 0.82 + hash(lane, Math.floor(a * 0.7 + hash(lane, 1, 2)), 3) * 0.3 + grain
            o[0] = rgb[0] * (joint ? 0.35 : tone)
            o[1] = rgb[1] * (joint ? 0.35 : tone)
            o[2] = rgb[2] * (joint ? 0.35 : tone)
            o[3] = joint ? 0 : 1 + grain
        }
    const floorOak = paint(512, 2, boards([186, 140, 92], 0.0714, 'u', 0.03), 2)
    const deck = paint(256, 1, boards([138, 118, 96], 0.14, 'u', 0.08), 3)
    const cedar = paint(256, 1, boards([168, 106, 64], 0.14, 'v', 0.04), 3)
    const cabinetWood = paint(256, 1, boards([150, 104, 66], 0.25, 'v', 0.004), 1)
    const wood = paint(256, 1, boards([156, 116, 76], 0.2, 'u', 0.004), 1)
    const floorTile = paint(
        256,
        0.6,
        (u, v, o) => {
            const grout = fract(u * 2) < 0.02 || fract(v * 2) < 0.02
            const k = grout ? 150 : 214 + mid(u, v) * 18 - hash(Math.floor(u * 2), Math.floor(v * 2), 1) * 12
            o[0] = k
            o[1] = k - 8
            o[2] = k - 20
            o[3] = grout ? 0 : 1
        },
        3
    )
    const carpet = paint(
        256,
        1,
        (u, v, o) => {
            const k = 150 + fine(u, v) * 30 + hash(Math.floor(u * 256), Math.floor(v * 256), 2) * 20
            o[0] = k
            o[1] = k - 6
            o[2] = k - 14
            o[3] = fine(u, v)
        },
        1
    )
    const counter = paint(
        256,
        1,
        (u, v, o) => {
            const s = hash(Math.floor(u * 256), Math.floor(v * 256), 6)
            const k = 120 + s * 90 + mid(u, v) * 20
            o[0] = k
            o[1] = k - 6
            o[2] = k - 12
            o[3] = 0
        },
        0.5
    )
    const hedge = paint(
        256,
        1,
        (u, v, o) => {
            const k = leafy(u, v)
            const j = hash(Math.floor(u * 128), Math.floor(v * 128), 3)
            o[0] = 26 + k * 34 + j * 14
            o[1] = 52 + k * 56 + j * 18
            o[2] = 24 + k * 22
            o[3] = k * 1.5 + j * 0.5
        },
        4
    )
    const tarp = paint(
        128,
        0.4,
        (u, v, o) => {
            const weave = Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI) * 0.06
            const k = 0.9 + weave + broad(u, v) * 0.1
            o[0] = 34 * k
            o[1] = 92 * k
            o[2] = 170 * k
            o[3] = weave * 4 + broad(u, v)
        },
        2
    )
    const poolWall = paint(
        128,
        0.5,
        (u, v, o) => {
            const ridge = Math.sin(u * 16 * Math.PI * 2) * 0.5 + 0.5
            const k = 200 + ridge * 25
            o[0] = k - 40
            o[1] = k - 10
            o[2] = k
            o[3] = ridge
        },
        2
    )
    const poolCover = paint(
        256,
        2,
        (u, v, o) => {
            const puddle = broad(u, v) > 0.62
            const k = puddle ? 40 : 34 + fine(u, v) * 10
            o[0] = k * 0.7
            o[1] = k * 1.05
            o[2] = k * 0.75
            o[3] = puddle ? 0 : fine(u, v) * 0.4
        },
        1,
        (g, n) => strewLeaves(g, n, 50, 9, 13)
    )
    const canvasT = paint(
        128,
        0.5,
        (u, v, o) => {
            const k = 225 + Math.sin(u * 256) * Math.sin(v * 256) * 6 + broad(u, v) * 10
            o[0] = k
            o[1] = k
            o[2] = k - 6
            o[3] = 0
        },
        1
    )
    const hay = paint(
        128,
        0.5,
        (u, v, o) => {
            const s = straw(u * 0.3, v * 6)
            o[0] = 190 + s * 40
            o[1] = 160 + s * 35
            o[2] = 90 + s * 20
            o[3] = s
        },
        2
    )
    const leafBag = paint(
        128,
        0.6,
        (u, v, o) => {
            const crinkle = paper(u, v)
            o[0] = 168 + crinkle * 24
            o[1] = 130 + crinkle * 18
            o[2] = 88 + crinkle * 12
            o[3] = crinkle * 2
        },
        2
    )
    const firewood = paint(
        256,
        0.5,
        (u, v, o) => {
            // Log ends packed in rows: rings, bark round them.
            const cu = u * 4
            const cv = v * 4 + (Math.floor(u * 4) % 2) * 0.5
            const dx = fract(cu) - 0.5
            const dy = fract(cv) - 0.5
            const d = Math.hypot(dx, dy)
            const ring = Math.sin(d * 80) * 0.5 + 0.5
            if (d > 0.46) {
                o[0] = 40
                o[1] = 30
                o[2] = 22
                o[3] = -1
            } else if (d > 0.4) {
                o[0] = 90
                o[1] = 70
                o[2] = 52
                o[3] = 0.5
            } else {
                o[0] = 176 + ring * 30
                o[1] = 130 + ring * 24
                o[2] = 84 + ring * 14
                o[3] = 1
            }
        },
        3
    )

    // Bark on a trunk's own UVs (round it, up it): repeat set by hand.
    const furrowNoise = noise(13, 32)
    const furrowed = paint(
        256,
        1,
        (u, v, o) => {
            const ridge = Math.abs(Math.sin((u * 9 + furrowNoise(u, v * 0.3) * 1.6) * Math.PI))
            const k = 0.55 + ridge * 0.45 + (fine(u, v) - 0.5) * 0.2
            o[0] = 96 * k
            o[1] = 84 * k
            o[2] = 74 * k
            o[3] = ridge * 1.4 + fine(u, v) * 0.3
        },
        4
    )
    for (const t of [furrowed.map, furrowed.normalMap]) t.repeat.set(2, 3)
    const birch = paint(
        256,
        1,
        (u, v, o) => {
            const band = hash(Math.floor(v * 40), Math.floor(u * 6), 4)
            const mark = band > 0.86 && fract(u * 6) < 0.6 ? 1 : 0
            const k = 225 + fine(u, v) * 20 - mark * 175
            o[0] = k
            o[1] = k - 4
            o[2] = k - 10
            o[3] = -mark
        },
        2
    )
    for (const t of [birch.map, birch.normalMap]) t.repeat.set(1, 3)
    const cedarLeaves = paint(
        256,
        1.2,
        (u, v, o) => {
            const scale = leafy(u * 2, v * 2)
            const j = hash(Math.floor(u * 160), Math.floor(v * 160), 5)
            o[0] = 22 + scale * 26 + j * 10
            o[1] = 46 + scale * 46 + j * 14
            o[2] = 24 + scale * 16
            o[3] = scale * 2 + j * 0.6
        },
        5
    )
    const panelDoor = (color: string) =>
        drawn(128, 256, (g, w, h) => {
            g.fillStyle = color
            g.fillRect(0, 0, w, h)
            g.strokeStyle = 'rgba(0,0,0,.28)'
            g.lineWidth = 3
            for (const [x, y, pw, ph] of [
                [16, 18, 96, 70],
                [16, 104, 40, 130],
                [72, 104, 40, 130],
            ] as const)
                g.strokeRect(x, y, pw, ph)
            g.fillStyle = 'rgba(255,255,255,.12)'
            for (const [x, y, pw, ph] of [
                [18, 20, 92, 4],
                [18, 106, 36, 4],
                [74, 106, 36, 4],
            ] as const)
                g.fillRect(x, y, pw, ph)
            g.fillStyle = '#c9a54a'
            g.beginPath()
            g.arc(104, 150, 5, 0, Math.PI * 2)
            g.fill()
        })
    const garage = paint(
        128,
        0.55,
        (u, v, o) => {
            const seam = v > 0.94
            const k = seam ? 170 : 236 - fract(v) * 14
            o[0] = k
            o[1] = k
            o[2] = k - 2
            o[3] = seam ? 0 : 1 - v * 0.3
        },
        2
    )
    const sign = (text: string, bg: string, fg: string, w = 512, h = 128, size = 64) =>
        drawn(w, h, (g, cw, ch) => {
            g.fillStyle = bg
            g.fillRect(0, 0, cw, ch)
            g.strokeStyle = fg
            g.lineWidth = 6
            g.strokeRect(8, 8, cw - 16, ch - 16)
            g.fillStyle = fg
            fitText(g, text, cw / 2, ch / 2 + 4, cw - 40, size)
        })
    const stop = drawn(256, 256, (g, w) => {
        g.fillStyle = '#ffffff'
        g.beginPath()
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 8 + (i / 8) * Math.PI * 2
            g.lineTo(w / 2 + Math.cos(a) * w * 0.5, w / 2 + Math.sin(a) * w * 0.5)
        }
        g.fill()
        g.fillStyle = '#c4161c'
        g.beginPath()
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 8 + (i / 8) * Math.PI * 2
            g.lineTo(w / 2 + Math.cos(a) * w * 0.46, w / 2 + Math.sin(a) * w * 0.46)
        }
        g.fill()
        g.fillStyle = '#ffffff'
        fitText(g, 'ARRÊT', w / 2, w / 2 + 4, w * 0.72, 72, 800)
    })
    const roadClosed = drawn(256, 128, (g, w, h) => {
        for (let i = -4; i < 12; i++) {
            g.fillStyle = i % 2 ? '#ffffff' : '#f26a16'
            g.beginPath()
            g.moveTo(i * 32, 0)
            g.lineTo(i * 32 + 32, 0)
            g.lineTo(i * 32 + 32 + h, h)
            g.lineTo(i * 32 + h, h)
            g.fill()
        }
        g.fillStyle = '#ffffff'
        g.fillRect(16, 34, w - 32, 60)
        g.fillStyle = '#111111'
        fitText(g, 'RUE BARRÉE', w / 2, 66, w - 48, 40, 800)
    })
    const hockey = drawn(256, 144, (g, w, h) => {
        g.fillStyle = '#e9f0f4'
        g.fillRect(0, 0, w, h)
        g.strokeStyle = '#c4161c'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(w / 2, 0)
        g.lineTo(w / 2, h)
        g.stroke()
        g.strokeStyle = '#1f4fa8'
        for (const x of [w * 0.33, w * 0.67]) {
            g.beginPath()
            g.moveTo(x, 0)
            g.lineTo(x, h)
            g.stroke()
        }
        const R = rng(21)
        for (let i = 0; i < 10; i++) {
            g.fillStyle = i < 5 ? '#b5121b' : '#1d2f6f'
            g.beginPath()
            g.arc(R() * w, 20 + R() * (h - 40), 4, 0, Math.PI * 2)
            g.fill()
        }
        g.fillStyle = 'rgba(0,0,0,.75)'
        g.fillRect(8, h - 22, 92, 16)
        g.fillStyle = '#fff'
        g.font = '700 12px system-ui, sans-serif'
        g.fillText('MTL 2 · TOR 1  3rd', 12, h - 10)
    })
    const art = drawn(128, 96, (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, 0, h)
        sky.addColorStop(0, '#f2c58a')
        sky.addColorStop(1, '#e98a52')
        g.fillStyle = sky
        g.fillRect(0, 0, w, h)
        g.fillStyle = '#3b4a3a'
        g.beginPath()
        g.moveTo(0, h * 0.7)
        for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.55 + Math.sin(x * 0.07) * 0.08))
        g.lineTo(w, h)
        g.lineTo(0, h)
        g.fill()
        g.fillStyle = '#2a6f9a'
        g.fillRect(0, h * 0.82, w, h * 0.18)
    })
    const numberPlate = (text: string) => sign(text, '#1b1b1b', '#e8e2cf', 256, 128, 72)
    const netting = drawn(32, 32, (g, w) => {
        g.strokeStyle = '#f4f4f0'
        g.lineWidth = 3
        g.strokeRect(0, 0, w, w)
    })
    netting.wrapS = netting.wrapT = RepeatWrapping
    netting.repeat.set(9, 6)

    const mapped = (
        t: { map: Texture; normalMap: Texture },
        rough: number,
        extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}
    ) => std({ map: t.map, normalMap: t.normalMap, roughness: rough, ...extra })
    const plain = (color: number, roughness: number, metalness = 0) => std({ color, roughness, metalness })
    const glow = (color: number, intensity: number) =>
        std({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 })

    const M: Record<ErablesMaterial, Material> = {
        grass: mapped(grass, 1),
        soil: plain(0x4b3626, 1),
        mulch: plain(0x4a2e1f, 1),
        leaves: mapped(leaves, 0.95),
        asphalt: mapped(asphalt, 0.92),
        driveway: mapped(driveway, 0.8),
        concrete: mapped(concrete, 0.9),
        sidewalk: mapped(sidewalk, 0.9),
        gravel: mapped(gravel, 1),
        brick: mapped(brick, 0.9),
        brickBuff: mapped(brickBuff, 0.9),
        sidingCream: mapped(sidingCream, 0.6),
        sidingSage: mapped(sidingSage, 0.6),
        sidingGrey: mapped(sidingGrey, 0.6),
        shingle: mapped(shingle, 0.95),
        shingleGrey: mapped(shingleGrey, 0.95),
        trim: plain(0xf2f0ea, 0.55),
        soffit: plain(0xe9e6dd, 0.7),
        foundation: mapped(foundation, 0.95),
        glass,
        doorRed: std({ map: panelDoor('#8e1f22'), roughness: 0.5 }),
        doorGreen: std({ map: panelDoor('#2f4f3a'), roughness: 0.5 }),
        doorWood: std({ map: panelDoor('#8a5a34'), roughness: 0.6 }),
        garageDoor: mapped(garage, 0.5),
        deck: mapped(deck, 0.85),
        cedar: mapped(cedar, 0.85),
        hedge: mapped(hedge, 1),
        bark: std({ color: 0x5e5248, roughness: 1 }),
        barkFurrowed: mapped(furrowed, 1, { color: 0xffffff }),
        barkBirch: mapped(birch, 0.9),
        cedarFoliage: mapped(cedarLeaves, 1),
        plaster: mapped(plaster, 0.9),
        plasterBlue: mapped(plasterBlue, 0.9),
        plasterSage: mapped(plasterSage, 0.9),
        floorOak: mapped(floorOak, 0.5),
        floorTile: mapped(floorTile, 0.4),
        carpet: mapped(carpet, 1),
        cabinetWood: mapped(cabinetWood, 0.6),
        cabinetWhite: plain(0xf1efe9, 0.45),
        counter: mapped(counter, 0.3),
        steel: plain(0xb8bcc0, 0.35, 0.8),
        chrome: plain(0xdadde0, 0.15, 1),
        rubber: plain(0x1d1d1f, 0.9),
        sofa: plain(0xb9ab94, 0.95),
        sofaGreen: plain(0x6b7350, 0.95),
        bedding: plain(0xc8d0d8, 0.95),
        wood: mapped(wood, 0.6),
        metalDark: plain(0x2b2e33, 0.5, 0.5),
        binBlue: plain(0x1f5fae, 0.55),
        binBrown: plain(0x5a3b22, 0.6),
        binGrey: plain(0x3f4246, 0.6),
        cone: plain(0xff6a13, 0.5),
        machine: plain(0xe2a90c, 0.5, 0.2),
        paintRed: plain(0x9e1b1b, 0.35, 0.4),
        paintBlue: plain(0x1f3f7a, 0.35, 0.4),
        paintSilver: plain(0xaeb3b8, 0.35, 0.6),
        paintWhite: plain(0xe8e8e6, 0.4, 0.2),
        paintGreen: plain(0x2f5d3a, 0.35, 0.4),
        carGlass: plain(0x10161b, 0.1, 0.4),
        // A car's windows: smoky blue-grey and glossy, the sky's light sliding over them.
        tintedGlass: std({ color: 0x33424f, roughness: 0.08, metalness: 0.6, emissive: 0x0b1118 }),
        lamp: glow(0xfff1d0, 1.4),
        tarp: mapped(tarp, 0.7),
        poolWall: mapped(poolWall, 0.4, { metalness: 0.4 }),
        poolCover: mapped(poolCover, 0.5),
        canvas: mapped(canvasT, 0.9, { side: DoubleSide }),
        pumpkin: plain(0xe3741a, 0.6),
        hay: mapped(hay, 1),
        leafBag: mapped(leafBag, 0.9),
        firewood: mapped(firewood, 0.95),
        net: std({
            map: netting,
            roughness: 0.9,
            alphaTest: 0.5,
            side: DoubleSide,
        }),
        signBlue: std({ map: sign('RUE DES ÉRABLES', '#1d4f91', '#ffffff', 512, 128, 56), roughness: 0.4 }),
        signRed: plain(0xb3151c, 0.45),
        signRoad: std({ map: roadClosed, roughness: 0.5 }),
        stopSign: std({ map: stop, roughness: 0.4, alphaTest: 0.5 }),
        number1: std({ map: numberPlate('1247'), roughness: 0.5 }),
        number2: std({ map: numberPlate('1252'), roughness: 0.5 }),
        screen: std({
            color: 0x111111,
            emissive: 0xffffff,
            emissiveMap: hockey,
            emissiveIntensity: 0.9,
            roughness: 0.2,
        }),
        art: std({ map: art, roughness: 0.7 }),
        hazard: glow(0xff8a1a, 0.6),
    }
    return M as ErablesMaterials
}

// --- Merging per material ------------------------------------------------------------------------

/** World-aligned UVs (metres) by each face's main axis: seamless across every box of a material. */
function worldUvs(g: BufferGeometry): void {
    const p = g.attributes.position!
    const n = g.attributes.normal!
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i))
        const ny = Math.abs(n.getY(i))
        const nz = Math.abs(n.getZ(i))
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        let u: number
        let v: number
        if (ny >= nx && ny >= nz) [u, v] = nx > nz ? [z, x] : [x, z]
        else if (nx >= nz) [u, v] = [z, y]
        else [u, v] = [x, y]
        uv[i * 2] = u
        uv[i * 2 + 1] = v
    }
    g.setAttribute('uv', new BufferAttribute(uv, 2))
}

/** Everything under `group` merged per material (and shadow casting), in the group's own frame. */
export function bake(group: Group): void {
    group.updateMatrixWorld(true)
    const inverse = new Matrix4().copy(group.matrixWorld).invert()
    const buckets = new Map<
        string,
        { mat: Material; key: ErablesMaterial | null; cast: boolean; geos: BufferGeometry[] }
    >()
    const relative = new Matrix4()
    group.traverse(o => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const key = (mesh.userData.mat as ErablesMaterial | undefined) ?? null
        const material = mesh.material as Material
        const cast = mesh.castShadow
        const id = `${material.uuid}|${cast}`
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
        for (const name of Object.keys(g.attributes))
            if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name)
        if (!g.attributes.normal) g.computeVertexNormals()
        if (!g.attributes.uv)
            g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2))
        if (!g.attributes.color && (material as MeshStandardMaterial).vertexColors) return
        g.morphAttributes = {}
        g.clearGroups()
        relative.multiplyMatrices(inverse, mesh.matrixWorld)
        g.applyMatrix4(relative)
        if (!buckets.has(id)) buckets.set(id, { mat: material, key, cast, geos: [] })
        buckets.get(id)!.geos.push(g)
    })
    for (const c of [...group.children]) group.remove(c)
    for (const bucket of buckets.values()) {
        const merged = mergeGeometries(bucket.geos)
        if (!merged) continue
        if (bucket.key && WORLD_UV.has(bucket.key)) worldUvs(merged)
        const mesh = new Mesh(merged, bucket.mat)
        mesh.castShadow = bucket.cast
        mesh.receiveShadow = true
        if (bucket.key === 'glass') mesh.renderOrder = 2
        mesh.userData.mat = bucket.key
        group.add(mesh)
    }
    group.updateMatrixWorld(true)
    group.traverse(o => (o.matrixAutoUpdate = false))
}

// --- Leaves ----------------------------------------------------------------------------------------

const TINTS: Record<TreeSpot['tint'], string[]> = {
    red: ['#b3261e', '#c8402a', '#8f1d1a', '#d9572b', '#a52a1a', '#7a8a32'],
    orange: ['#e07b24', '#d65f1c', '#f0a03a', '#c9531c', '#e8902e', '#9a9a38'],
    yellow: ['#e8b830', '#f2cf4a', '#d9a21e', '#c9b24a', '#efc23c'],
    rust: ['#9c5a2a', '#b0703a', '#7d4a26', '#a8642c', '#8a6a2a'],
    green: ['#2f4a2a', '#3b5a33', '#26402a', '#35502c'],
}

/** A cluster of leaves on a card (white, so each card's colour tints it). */
function leafCard(): CanvasTexture {
    const t = drawn(256, 256, (g, w) => {
        const R = rng(31)
        g.strokeStyle = 'rgba(90,70,50,.9)'
        g.lineWidth = 3
        for (let i = 0; i < 6; i++) {
            g.beginPath()
            g.moveTo(w / 2, w / 2)
            g.lineTo(w / 2 + (R() - 0.5) * w * 0.8, w / 2 + (R() - 0.5) * w * 0.8)
            g.stroke()
        }
        for (let i = 0; i < 46; i++) {
            const a = R() * Math.PI * 2
            const d = Math.sqrt(R()) * w * 0.4
            const k = 170 + Math.floor(R() * 85)
            g.fillStyle = `rgb(${k},${k},${k})`
            leafPath(g, w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, 12 + R() * 10, R() * 6.28)
            g.fill()
        }
    })
    t.colorSpace = SRGBColorSpace
    return t
}

/** One fallen leaf. */
export function leafSprite(): CanvasTexture {
    return drawn(64, 64, g => {
        g.fillStyle = '#ffffff'
        leafPath(g, 32, 32, 28, -Math.PI / 2)
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,.25)'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(32, 60)
        g.lineTo(32, 8)
        g.stroke()
    })
}

/** A quad's four corners into the arrays, its normal and colour on each. */
function pushQuad(
    positions: number[],
    normals: number[],
    colors: number[],
    uvs: number[],
    corners: Vector3[],
    normal: Vector3,
    color: Color
): void {
    for (const i of [0, 1, 2, 0, 2, 3]) {
        const c = corners[i]!
        positions.push(c.x, c.y, c.z)
        normals.push(normal.x, normal.y, normal.z)
        colors.push(color.r, color.g, color.b)
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
}

function quadGeometry(positions: number[], normals: number[], colors: number[], uvs: number[]): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    return g
}

/**
 * Every tree's crown, one mesh: cards of leaves round each crown (a ball for maples and oaks, a
 * narrow one for birches, a cone for cedars), each card's normal pointing out of the crown so the
 * crown shades like a volume, tinted from its tree's palette.
 */
export function crowns(trees: readonly TreeSpot[], seed: number): Mesh {
    const R = rng(seed)
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const q = new Quaternion()
    const axis = new Vector3()
    const color = new Color()
    for (const tree of trees) {
        // Cedars are solid spires (the kit's): no cards.
        if (tree.kind === 'cedar') continue
        const palette = TINTS[tree.tint]
        // Clumps at the branch tips (a tree's newer versions say where): cards round each, their
        // normals out of the clump and of the whole crown, so it shades as one with its lumps.
        if (tree.clusters?.length) {
            const middle = new Vector3(tree.x, tree.y + tree.height * 0.65, tree.z)
            for (const [cx, cy, cz, cr] of tree.clusters) {
                const clump = new Vector3(cx, cy, cz)
                const n = Math.max(6, Math.round(26 * cr * cr))
                for (let i = 0; i < n; i++) {
                    const dir = new Vector3(R() * 2 - 1, R() * 1.6 - 0.6, R() * 2 - 1)
                    if (dir.lengthSq() > 1 || dir.lengthSq() < 0.02) {
                        i--
                        continue
                    }
                    dir.normalize()
                    const at = clump.clone().addScaledVector(dir, cr * (0.35 + Math.sqrt(R()) * 0.65))
                    const normal = dir
                        .clone()
                        .multiplyScalar(0.6)
                        .add(at.clone().sub(middle).normalize().multiplyScalar(0.4))
                    normal.y += 0.35
                    normal.normalize()
                    const size = 1.15 * (0.75 + R() * 0.5)
                    axis.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize()
                    q.setFromAxisAngle(axis, R() * Math.PI)
                    const corners = [
                        new Vector3(-size / 2, -size / 2, 0),
                        new Vector3(size / 2, -size / 2, 0),
                        new Vector3(size / 2, size / 2, 0),
                        new Vector3(-size / 2, size / 2, 0),
                    ].map(c => c.applyQuaternion(q).add(at))
                    // Lighter at the top of each clump, the inside darker.
                    const lift = 0.8 + (dir.y + 1) * 0.15 + R() * 0.15
                    color.set(palette[Math.floor(R() * palette.length)]!).multiplyScalar(lift)
                    pushQuad(positions, normals, colors, uvs, corners, normal, color)
                }
            }
            continue
        }
        const cedar = false
        const radius = tree.crown
        const count = Math.round((cedar ? 110 : tree.kind === 'birch' ? 150 : 210) * (radius / 3.5) ** 2)
        const centre = new Vector3(tree.x, tree.y + tree.height * (cedar ? 0.5 : 0.66), tree.z)
        for (let i = 0; i < count; i++) {
            let at: Vector3
            if (cedar) {
                const t = R()
                const a = R() * Math.PI * 2
                const r = radius * (1 - t) * (0.6 + R() * 0.4)
                at = new Vector3(
                    tree.x + Math.cos(a) * r,
                    tree.y + 0.6 + t * (tree.height - 0.6),
                    tree.z + Math.sin(a) * r
                )
            } else {
                const dir = new Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1)
                if (dir.lengthSq() > 1 || dir.lengthSq() < 0.01) {
                    i--
                    continue
                }
                dir.normalize()
                const shell = 0.5 + Math.sqrt(R()) * 0.5
                const height = tree.height * (tree.kind === 'birch' ? 0.36 : 0.3)
                at = new Vector3(
                    centre.x + dir.x * radius * shell,
                    centre.y + dir.y * height * shell,
                    centre.z + dir.z * radius * shell
                )
            }
            const normal = at.clone().sub(centre)
            normal.y = cedar ? 0.4 : normal.y + 0.6
            normal.normalize()
            const size = (cedar ? 1.1 : 1.7) * (0.7 + R() * 0.6)
            axis.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize()
            q.setFromAxisAngle(axis, R() * Math.PI)
            const corners = [
                new Vector3(-size / 2, -size / 2, 0),
                new Vector3(size / 2, -size / 2, 0),
                new Vector3(size / 2, size / 2, 0),
                new Vector3(-size / 2, size / 2, 0),
            ].map(c => c.applyQuaternion(q).add(at))
            color.set(palette[Math.floor(R() * palette.length)]!).multiplyScalar(0.85 + R() * 0.3)
            pushQuad(positions, normals, colors, uvs, corners, normal, color)
        }
    }
    const material = new MeshStandardMaterial({
        map: leafCard(),
        vertexColors: true,
        alphaTest: 0.5,
        side: DoubleSide,
        roughness: 0.85,
    })
    const mesh = new Mesh(quadGeometry(positions, normals, colors, uvs), material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
}

/** Fallen leaves lying on whatever is below each one (lawn, street, roofs, the pool cover). */
export function fallenLeaves(
    spots: Array<{ x: number; z: number; r: number; count: number; heap?: number }>,
    floorAt: (x: number, z: number) => number | null,
    material: Material,
    seed: number
): Mesh {
    const R = rng(seed)
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const uvs: number[] = []
    const up = new Vector3(0, 1, 0)
    const color = new Color()
    for (const spot of spots) {
        for (let i = 0; i < spot.count; i++) {
            const a = R() * Math.PI * 2
            const d = spot.r * Math.sqrt(R())
            const x = spot.x + Math.cos(a) * d
            const z = spot.z + Math.sin(a) * d
            const floor = floorAt(x, z)
            if (floor === null) continue
            const lift = spot.heap ? spot.heap * (1 - d / spot.r) : 0
            const y = floor + 0.012 + lift + R() * 0.01
            const size = 0.09 + R() * 0.07
            const turn = R() * Math.PI * 2
            const c = Math.cos(turn) * size
            const s = Math.sin(turn) * size
            const tilt = (R() - 0.5) * 0.03
            const corners = [
                new Vector3(x - c + s, y + tilt, z - s - c),
                new Vector3(x + c + s, y - tilt, z + s - c),
                new Vector3(x + c - s, y + tilt, z + s + c),
                new Vector3(x - c - s, y - tilt, z - s + c),
            ]
            color.set(LEAF_COLORS[Math.floor(R() * LEAF_COLORS.length)]!).multiplyScalar(0.75 + R() * 0.35)
            pushQuad(positions, normals, colors, uvs, corners, up, color)
        }
    }
    const mesh = new Mesh(quadGeometry(positions, normals, colors, uvs), material)
    mesh.receiveShadow = true
    return mesh
}

/** Leaves coming down from the crowns, swaying, round and round. */
class FallingLeaves {
    readonly mesh: InstancedMesh
    private readonly leaves: Array<{ x: number; y: number; z: number; phase: number; spin: number; floor: number }> = []
    private readonly m = new Matrix4()
    private readonly q = new Quaternion()
    private readonly e = new Vector3()
    private readonly s = new Vector3()
    private readonly turn = new Euler()
    private last = 0

    constructor(
        material: Material,
        private readonly trees: readonly TreeSpot[],
        private readonly R: () => number,
        count = 140
    ) {
        this.mesh = new InstancedMesh(new PlaneGeometry(0.15, 0.15), material, count)
        this.mesh.frustumCulled = false
        const color = new Color()
        for (let i = 0; i < count; i++) {
            this.leaves.push(this.fresh(true))
            color.set(LEAF_COLORS[Math.floor(R() * LEAF_COLORS.length)]!)
            this.mesh.setColorAt(i, color)
        }
    }

    private fresh(anywhere: boolean) {
        const R = this.R
        const deciduous = this.trees.filter(t => t.kind !== 'cedar')
        const tree = deciduous[Math.floor(R() * deciduous.length)]!
        const a = R() * Math.PI * 2
        const d = tree.crown * Math.sqrt(R()) * 0.9
        const top = tree.y + tree.height * 0.7
        return {
            x: tree.x + Math.cos(a) * d,
            y: anywhere ? tree.y + R() * (top - tree.y) : top,
            z: tree.z + Math.sin(a) * d,
            phase: R() * 10,
            spin: (R() - 0.5) * 4,
            floor: tree.y,
        }
    }

    update(now: number): void {
        const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0)
        this.last = now
        const t = now / 1000
        this.leaves.forEach((leaf, i) => {
            leaf.y -= (0.55 + Math.sin(t * 1.7 + leaf.phase) * 0.25) * dt
            leaf.x += (Math.sin(t * 1.1 + leaf.phase) * 0.45 + 0.25) * dt
            leaf.z += Math.cos(t * 0.9 + leaf.phase * 1.3) * 0.35 * dt
            if (leaf.y < leaf.floor + 0.02) this.leaves[i] = leaf = this.fresh(false)
            this.turn.set(Math.sin(t * 2 + leaf.phase) * 1.2, t * leaf.spin, Math.cos(t * 1.6 + leaf.phase))
            this.q.setFromEuler(this.turn)
            this.m.compose(this.e.set(leaf.x, leaf.y, leaf.z), this.q, this.s.set(1, 1, 1))
            this.mesh.setMatrixAt(i, this.m)
        })
        this.mesh.instanceMatrix.needsUpdate = true
    }
}

// --- The neighbourhood past the edges ----------------------------------------------------------------

/** Houses, lawns, the street going on, trees: drawn only, never reached. */
function neighbourhood(b: Builder): void {
    const R = rng(77)
    // The ground and the street beyond the map, a little under the map's own.
    b.box('grass', -110, -0.4, -110, 110, LAWN - 0.02, -4.75, { collide: false, cast: false })
    b.box('grass', -110, -0.4, 4.75, 110, LAWN - 0.02, 110, { collide: false, cast: false })
    for (const end of [-1, 1]) {
        const [x0, x1] = end < 0 ? [-110, -BOUNDS.x] : [BOUNDS.x, 110]
        b.box('asphalt', x0, -0.3, -4.5, x1, -0.01, 4.5, { collide: false, cast: false })
        b.box('sidewalk', x0, -0.3, -6.25, x1, LAWN, -4.5, { collide: false, cast: false })
        b.box('concrete', x0, -0.3, 4.5, x1, LAWN - 0.005, 4.75, { collide: false, cast: false })
    }
    const sidings: ErablesMaterial[] = ['sidingCream', 'sidingSage', 'sidingGrey', 'brick', 'brickBuff']
    const house = (cx: number, cz: number, w: number, d: number, facing: 1 | -1) => {
        const tall = R() < 0.4
        const top = LAWN + 0.5 + (tall ? 5.4 : 2.9)
        const mat = sidings[Math.floor(R() * sidings.length)]!
        const x0 = cx - w / 2
        const x1 = cx + w / 2
        const z0 = cz - d / 2
        const z1 = cz + d / 2
        b.box('foundation', x0, 0, z0, x1, LAWN + 0.5, z1, { collide: false })
        b.box(mat, x0, LAWN + 0.5, z0, x1, top, z1, { collide: false })
        b.gableRoof(
            x0,
            x1,
            z0,
            z1,
            top,
            1.8 + R() * 0.6,
            'x',
            0.4,
            R() < 0.5 ? 'shingle' : 'shingleGrey',
            mat === 'brick' || mat === 'brickBuff' ? 'sidingCream' : mat
        )
        // Windows on the side we see, and a door.
        const face = facing > 0 ? z1 : z0
        const floors = tall ? [LAWN + 1.4, LAWN + 4.2] : [LAWN + 1.4]
        for (const y of floors) {
            for (let x = x0 + 1.4; x < x1 - 1.2; x += 2.6) {
                if (R() < 0.25) continue
                b.box('trim', x - 0.08, y - 0.08, face - 0.02, x + 1.18, y + 1.38, face + facing * 0.04, {
                    collide: false,
                    cast: false,
                })
                b.box('carGlass', x, y, face + facing * 0.04, x + 1.1, y + 1.3, face + facing * 0.05, {
                    collide: false,
                    cast: false,
                })
            }
        }
        b.box('doorWood', cx - 0.5, LAWN + 0.5, face, cx + 0.5, LAWN + 2.6, face + facing * 0.05, {
            collide: false,
            cast: false,
        })
    }
    // Behind the back fences: the next streets' houses, their backyards toward us.
    for (let x = -52; x <= 52; x += 15) {
        house(x + (R() - 0.5) * 3, -38 - R() * 3, 11 + R() * 3, 8.5, 1)
        house(x + 7 + (R() - 0.5) * 3, 38 + R() * 3, 11 + R() * 3, 8.5, -1)
    }
    // Along the street past the road works, facing it.
    for (const end of [-1, 1]) {
        for (const [i, x] of [34, 49, 64, 80].entries()) {
            house(end * x, -14, 12, 9, 1)
            house(end * (x + 7), 14, 12, 9, -1)
            place(
                b,
                TREE,
                {
                    height: 9 + R() * 4,
                    crown: 3 + R() * 1.5,
                    kind: R() < 0.6 ? 'maple' : 'oak',
                    tint: (['red', 'orange', 'yellow', 'rust'] as const)[i % 4]!,
                },
                { x: end * (x + 6), y: LAWN, z: -8.0 }
            )
            place(
                b,
                TREE,
                {
                    height: 9 + R() * 4,
                    crown: 3 + R() * 1.5,
                    kind: 'maple',
                    tint: (['orange', 'yellow', 'red', 'rust'] as const)[i % 4]!,
                },
                { x: end * (x - 1), y: LAWN, z: 8.0 }
            )
        }
    }
    // Trees in the neighbours' yards, over the fences.
    for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1
        const x = -60 + R() * 120
        const z = side * (29.5 + R() * 4)
        const kinds = ['maple', 'maple', 'oak', 'birch', 'cedar'] as const
        const kind = kinds[Math.floor(R() * kinds.length)]!
        const tint = kind === 'cedar' ? 'green' : (['red', 'orange', 'yellow', 'rust'] as const)[Math.floor(R() * 4)]!
        const [height, crown] = [8 + R() * 6, kind === 'birch' ? 2.4 : 3 + R() * 1.6]
        place(b, TREE, { height, crown, kind, tint }, { x, y: LAWN, z })
    }
}

/** The woods and roofs far off all round: one band of painted treetops the haze softens (one draw). */
function treeline(): Mesh {
    // Far treetops: many small crowns in muted autumn tones, dark spruces among them, darker lower down.
    const muted = ['#8a4a34', '#9a6a3e', '#a7823f', '#7a5a3a', '#6f4030', '#8c7a48', '#4b5638', '#3d4a34']
    const texture = drawn(2048, 128, (g, w, h) => {
        const R = rng(55)
        for (let layer = 0; layer < 4; layer++) {
            for (let i = 0; i < 260; i++) {
                const x = R() * w
                const r = 5 + R() * 9
                const top = h * (0.12 + R() * 0.3) + layer * 10
                g.fillStyle = muted[Math.floor(R() * muted.length)]!
                for (const dx of [0, x < r ? w : x > w - r ? -w : 0]) {
                    g.beginPath()
                    if (R() < 0.15) {
                        g.moveTo(x + dx, top - r)
                        g.lineTo(x + dx + r * 0.7, top + r * 2)
                        g.lineTo(x + dx - r * 0.7, top + r * 2)
                    } else g.ellipse(x + dx, top + r, r, r * 1.1, 0, 0, Math.PI * 2)
                    g.fill()
                    g.fillRect(x + dx - r * 0.8, top + r, r * 1.6, h)
                }
            }
        }
        const shade = g.createLinearGradient(0, 0, 0, h)
        shade.addColorStop(0, 'rgba(0,0,0,0)')
        shade.addColorStop(1, 'rgba(20,18,14,.45)')
        g.globalCompositeOperation = 'source-atop'
        g.fillStyle = shade
        g.fillRect(0, 0, w, h)
        g.globalCompositeOperation = 'source-over'
    })
    texture.wrapS = RepeatWrapping
    texture.repeat.set(5, 1)
    const band = new Mesh(
        new CylinderGeometry(98, 98, 15, 72, 1, true).translate(0, 7.5 + LAWN, 0),
        new MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: BackSide, roughness: 1, color: 0xd8d0c4 })
    )
    return band
}

/** Fair-weather clouds on a high dome (drawn after the sky, faint). */
function clouds(): Mesh {
    const puff = noise(61, 16)
    const detail = noise(62, 64)
    const c = canvasOf(512, 256)
    const g = c.getContext('2d')!
    const image = g.createImageData(512, 256)
    for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 512; x++) {
            const u = x / 512
            const v = y / 256
            const k = puff(u, v * 0.5) * 0.7 + detail(u, v * 0.5) * 0.3
            const a = Math.max(0, (k - 0.55) / 0.3)
            const i = (y * 512 + x) * 4
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255
            image.data[i + 3] = Math.min(255, a * 255 * (1 - v * 0.6))
        }
    }
    g.putImageData(image, 0, 0)
    const texture = new CanvasTexture(c)
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.repeat.set(3, 1)
    const dome = new Mesh(
        new SphereGeometry(380, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
        new MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: BackSide,
            fog: false,
            opacity: 0.85,
        })
    )
    dome.renderOrder = 2
    return dome
}

// --- Building it --------------------------------------------------------------------------------------

export function buildErables(office: Office): ErablesScene {
    const M = paintMaterials(office.materials.glass!)
    const built = buildErablesGeometry({ materials: M, surfaces: true })
    const world = worldFrom(built, ERABLES_PLACES)
    const root = built.root

    // The stalled car's hazards blink on their own material (the barriers' stripes keep theirs).
    const hazard = (M.hazard as MeshStandardMaterial).clone()
    for (const blinker of built.blinkers) blinker.material = hazard

    // The neighbourhood: built with the same kit and materials, never collided with.
    const backdrop = new Builder(M)
    neighbourhood(backdrop)
    root.add(backdrop.drawn)
    root.updateMatrixWorld(true)

    // Leaves: crowns on every tree, fallen ones under them, in the piles, along the curbs, on the street.
    const ray = new Ray()
    const down = new Vector3(0, -1, 0)
    const solid = world.meshes[0]!
    const floorAt = (x: number, z: number): number | null => {
        if (Math.abs(x) > BOUNDS.x - 0.2 || Math.abs(z) > BOUNDS.z - 0.2) return LAWN
        ray.set(new Vector3(x * S, 11 * S, z * S), down)
        const hit = solid.geometry.boundsTree.raycastFirst(ray, DoubleSide, 0, 20)
        return hit ? hit.point.y / S : null
    }
    const sprite = leafSprite()
    const leafMaterial = new MeshStandardMaterial({
        map: sprite,
        vertexColors: true,
        alphaTest: 0.5,
        side: DoubleSide,
        roughness: 0.9,
    })
    const allTrees = [...built.trees, ...backdrop.trees]
    const spots: Array<{ x: number; z: number; r: number; count: number; heap?: number }> = [
        ...built.trees
            .filter(t => t.kind !== 'cedar')
            .map(t => ({ x: t.x, z: t.z, r: t.crown * 1.35, count: Math.round(t.crown * t.crown * 22) })),
        ...built.piles.map(p => ({ x: p.x, z: p.z, r: p.r, count: Math.round(p.r * p.r * 90), heap: p.r * 0.38 })),
    ]
    const R = rng(99)
    for (let i = 0; i < 70; i++) {
        spots.push({ x: -26 + R() * 52, z: (R() < 0.5 ? -1 : 1) * (3.9 + R() * 0.5), r: 0.6, count: 8 })
        spots.push({ x: -26 + R() * 52, z: -4 + R() * 8, r: 0.8, count: 2 })
    }
    const fallen = fallenLeaves(spots, floorAt, leafMaterial, 5)
    const backdropFallen = fallenLeaves(
        backdrop.trees.filter(t => t.kind !== 'cedar').map(t => ({ x: t.x, z: t.z, r: t.crown * 1.2, count: 90 })),
        () => LAWN - 0.02,
        leafMaterial,
        6
    )
    const leafCrowns = crowns(allTrees, 41)
    const falling = new FallingLeaves(leafMaterial.clone(), built.trees, rng(17))
    ;(falling.mesh.material as MeshStandardMaterial).vertexColors = false

    bake(built.drawn)
    bake(backdrop.drawn)
    built.drawn.add(leafCrowns, fallen, backdropFallen, falling.mesh, treeline(), clouds())
    root.visible = false

    return {
        group: root,
        world,
        update(now: number) {
            if (!root.visible) return
            falling.update(now)
            hazard.emissiveIntensity = Math.floor(now / 520) % 2 === 0 ? 2.2 : 0.05
        },
    }
}

/**
 * Switching between the office and Rue des Érables: what shows, and the office's own lights retuned
 * (an October afternoon outside: a low warm sun from the south-west, a blue sky, less ambient, a
 * thin haze) and back. The sun's shadow camera is fitted to the street, and the shadows drawn
 * again once.
 */
export function erablesLooks(
    scene: Scene,
    office: Office,
    erables: ErablesScene,
    officeExtras: Object3D[],
    erablesExtras: Object3D[],
    renderer: WebGLRenderer
) {
    const found: Object3D[] = []
    office.root.traverse(o => found.push(o))
    const hemi = found.find((o): o is HemisphereLight => o instanceof HemisphereLight) ?? null
    const ambient = found.find((o): o is AmbientLight => o instanceof AmbientLight) ?? null
    const fill = found.find((o): o is DirectionalLight => o instanceof DirectionalLight && o !== office.sun) ?? null
    const sky = found.find((o): o is Mesh => o instanceof Mesh && 'uniforms' in (o.material as object)) ?? null
    const uniforms = sky ? (sky.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms : null
    const sun = office.sun
    const shadowCamera = sun.shadow.camera as OrthographicCamera
    const saved = {
        lights: [sun, hemi, ambient, fill]
            .filter((l): l is DirectionalLight | HemisphereLight | AmbientLight => l !== null)
            .map(light => ({ light, color: light.color.clone(), intensity: light.intensity })),
        hemiGround: hemi?.groundColor.clone() ?? null,
        fillAt: fill?.position.clone() ?? null,
        sunAt: sun.position.clone(),
        fog: scene.fog instanceof FogExp2 ? { color: scene.fog.color.clone(), density: scene.fog.density } : null,
        shadow: {
            left: shadowCamera.left,
            right: shadowCamera.right,
            top: shadowCamera.top,
            bottom: shadowCamera.bottom,
            near: shadowCamera.near,
            far: shadowCamera.far,
        },
        bias: sun.shadow.bias,
        normalBias: sun.shadow.normalBias,
        sky: uniforms
            ? Object.fromEntries(
                  ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].map(k => [
                      k,
                      uniforms[k]?.value as number,
                  ])
              )
            : null,
        sunPosition: uniforms ? (uniforms.sunPosition?.value as Vector3).clone() : null,
    }

    return (map: MapId) => {
        const outside = map === 'erables'
        for (const part of [office.interior, office.ceiling, office.outside, ...officeExtras]) part.visible = !outside
        for (const part of erablesExtras) part.visible = outside
        erables.group.visible = outside
        if (!outside) {
            for (const { light, color, intensity } of saved.lights) {
                light.color.copy(color)
                light.intensity = intensity
            }
            if (hemi && saved.hemiGround) hemi.groundColor.copy(saved.hemiGround)
            if (fill && saved.fillAt) fill.position.copy(saved.fillAt)
            sun.position.copy(saved.sunAt)
            Object.assign(shadowCamera, saved.shadow)
            sun.shadow.bias = saved.bias
            sun.shadow.normalBias = saved.normalBias
            if (saved.fog && scene.fog instanceof FogExp2) {
                scene.fog.color.copy(saved.fog.color)
                scene.fog.density = saved.fog.density
            }
            if (uniforms && saved.sky && saved.sunPosition) {
                for (const [k, v] of Object.entries(saved.sky)) uniforms[k]!.value = v
                ;(uniforms.sunPosition!.value as Vector3).copy(saved.sunPosition)
            }
        } else {
            // 3 pm in October: the sun 28° up in the south-west.
            const dir = new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(90 - 28), MathUtils.degToRad(35))
            sun.color.set(0xffd9a8)
            sun.intensity = 3.2
            sun.position.copy(dir).multiplyScalar(14)
            Object.assign(shadowCamera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 })
            sun.shadow.bias = -0.0004
            sun.shadow.normalBias = 0.01
            if (hemi) {
                hemi.color.set(0xbfd6ee)
                hemi.groundColor.set(0x6b5a40)
                hemi.intensity = 1.35
            }
            if (ambient) {
                ambient.color.set(0xfff4e6)
                ambient.intensity = 1.1
            }
            if (fill) {
                // The sky's bounce from the other side.
                fill.color.set(0xa9c4e8)
                fill.intensity = 0.35
                fill.position.copy(dir).multiplyScalar(-10).setY(8)
            }
            if (scene.fog instanceof FogExp2) {
                scene.fog.color.set(0xb9c8d6)
                scene.fog.density = 0.03
            }
            if (uniforms) {
                uniforms.turbidity!.value = 1.0
                uniforms.rayleigh!.value = 3.4
                uniforms.mieCoefficient!.value = 0.002
                uniforms.mieDirectionalG!.value = 0.8
                ;(uniforms.sunPosition!.value as Vector3).copy(dir)
            }
        }
        shadowCamera.updateProjectionMatrix()
        sun.target.position.set(0, 0, 0)
        sun.target.updateMatrixWorld()
        renderer.shadowMap.needsUpdate = true
    }
}
