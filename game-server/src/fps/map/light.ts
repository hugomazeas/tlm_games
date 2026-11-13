/**
 * The office's baked light: how much ambient light reaches each point of the office, and from
 * where, on a grid of 12.5 cm cells (`office-light.b64`, made by `bun run fps:light`).
 *
 * Each cell holds the light arriving from every direction, summed into a constant and a vector
 * (first-order spherical harmonics): what a surface facing `n` gets is `a + b · n`. It counts the
 * ceiling panels (with their shadows), the sky through the windows, and one bounce off what's
 * around (by what it's made of). So the floor under a desk, a corner, the wall behind a sofa and
 * the floor round a chair's feet come out darker, and the window side brighter. The browser
 * multiplies its ambient light by it (one 3D texture read a pixel); the office never moves, so it
 * never changes. The sun stays a real light with its shadow map.
 *
 * Pure: no DOM, no clock. The bake (`light-bake.ts`) runs it over the server's build of the office.
 */

import { type BufferGeometry, DoubleSide, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'

/** Cell size (m): across the floor, and up. */
export const CELL = { x: 0.125, y: 0.135, z: 0.125 } as const

/** What's read from the file, ready to sample. Cells run x fastest, then y, then z. */
export interface OfficeLight {
    /** Of the office's collision triangles when it was baked: a different office needs a new bake. */
    fingerprint: number
    size: [number, number, number]
    /** The first cell's corner (m). */
    origin: [number, number, number]
    cell: [number, number, number]
    /** `a` at full scale (the brightest cell). */
    max: number
    /** Four bytes a cell: sqrt(a / max), then b / 2a for x, y, z, as 0–255 for -1…1. */
    data: Uint8Array
}

const MAGIC = 0x314c464f // 'OFL1'
const HEADER_BYTES = 48

export function encodeLight(light: OfficeLight): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(HEADER_BYTES + light.data.length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, MAGIC, true)
    view.setUint32(4, light.fingerprint, true)
    light.size.forEach((n, i) => view.setUint32(8 + i * 4, n, true))
    light.origin.forEach((v, i) => view.setFloat32(20 + i * 4, v, true))
    light.cell.forEach((v, i) => view.setFloat32(32 + i * 4, v, true))
    view.setFloat32(44, light.max, true)
    // Each byte as the change from the same channel of the cell before: the light is smooth, so
    // these are mostly small numbers, which gzip packs several times tighter.
    for (let i = 0; i < light.data.length; i++) {
        bytes[HEADER_BYTES + i] = (light.data[i]! - (i >= 4 ? light.data[i - 4]! : 0)) & 0xff
    }
    return bytes
}

export function decodeLight(bytes: Uint8Array): OfficeLight {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint32(0, true) !== MAGIC) throw new Error('Not an office light file')
    const triple = (at: number, read: (offset: number) => number) =>
        [read(at), read(at + 4), read(at + 8)] as [number, number, number]
    const size = triple(8, o => view.getUint32(o, true))
    const data = bytes.slice(HEADER_BYTES)
    if (data.length !== size[0] * size[1] * size[2] * 4) throw new Error('The office light file is cut short')
    for (let i = 4; i < data.length; i++) data[i] = (data[i]! + data[i - 4]!) & 0xff
    return {
        fingerprint: view.getUint32(4, true),
        size,
        origin: triple(20, o => view.getFloat32(o, true)),
        cell: triple(32, o => view.getFloat32(o, true)),
        max: view.getFloat32(44, true),
        data,
    }
}

/** The file as committed: gzipped, then base64 (the bundler inlines text). */
export function packLight(light: OfficeLight, gzip: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): string {
    return Buffer.from(gzip(encodeLight(light))).toString('base64')
}

/**
 * The triangles' corners, to the millimetre, hashed (FNV-1a): moving, adding or removing anything
 * solid changes it.
 */
export function geometryFingerprint(geometry: BufferGeometry): number {
    const position = geometry.attributes.position!
    const index = geometry.index
    let hash = 0x811c9dc5
    const mix = (value: number) => {
        hash ^= value & 0xffff
        hash = Math.imul(hash, 0x01000193)
        hash ^= value >>> 16
        hash = Math.imul(hash, 0x01000193)
    }
    const count = index ? index.count : position.count
    mix(count)
    for (let i = 0; i < count; i++) {
        const v = index ? index.getX(i) : i
        mix(Math.round(position.getX(v) * 1000))
        mix(Math.round(position.getY(v) * 1000))
        mix(Math.round(position.getZ(v) * 1000))
    }
    return hash >>> 0
}

/**
 * The light reaching a surface at (x, y, z) facing (nx, ny, nz), as the browser reads it: sampled
 * half a cell out from the surface, between the 8 nearest cells. Outside the grid: 1.
 */
export function irradianceAt(light: OfficeLight, x: number, y: number, z: number, nx = 0, ny = 1, nz = 0): number {
    const p = [x + nx * light.cell[0] * 0.5, y + ny * light.cell[1] * 0.5, z + nz * light.cell[2] * 0.5]
    const f = [0, 0, 0]
    const i0 = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
        const u = (p[k]! - light.origin[k]!) / light.cell[k]! - 0.5
        if (u < -0.5 || u > light.size[k]! - 0.5) return 1
        const clamped = Math.min(Math.max(u, 0), light.size[k]! - 1)
        i0[k] = Math.min(Math.floor(clamped), light.size[k]! - 2)
        f[k] = clamped - i0[k]!
    }
    const texel = [0, 0, 0, 0]
    for (let corner = 0; corner < 8; corner++) {
        const d = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1]
        const w = d.reduce((acc, bit, k) => acc * (bit ? f[k]! : 1 - f[k]!), 1)
        const at = 4 * (i0[0]! + d[0]! + light.size[0] * (i0[1]! + d[1]! + light.size[1] * (i0[2]! + d[2]!)))
        for (let c = 0; c < 4; c++) texel[c]! += w * light.data[at + c]!
    }
    const root = texel[0]! / 255
    const a = root * root * light.max
    const b = [1, 2, 3].map(c => (texel[c]! / 255) * 2 - 1).map(r => r * 2 * a)
    return Math.max(a + b[0]! * nx + b[1]! * ny + b[2]! * nz, a * 0.15)
}

// --- The bake ------------------------------------------------------------------------------

/** A ceiling panel: its lit underside, a rectangle at height `y` facing down. */
export interface Panel {
    x: number
    z: number
    /** Half its size along x and z (they're squared to the office). */
    hx: number
    hz: number
    y: number
}

/** Light the bake counts (the browser scales the result; only the ratios matter). */
export const RADIANCE = {
    /** A ceiling panel's underside. */
    panel: 7,
    /** Sky seen through a window, above the horizon / the street and buildings below it. */
    sky: 1.6,
    street: 0.55,
    /** Lighting assumed on everything around, bounced back by what it's made of (its albedo). */
    bounce: 0.4,
}

/** Cells this close under the ceiling (m) leave the panels out (`finishLight`). */
const PANEL_CLEARANCE = 0.25

/** How much light each SURFACES kind sends back (plaster, wood, desk, metal, fabric, plastic, tile, screen, plant). */
export const ALBEDO = [0.75, 0.4, 0.65, 0.35, 0.22, 0.3, 0.7, 0.05, 0.2]

/** Directions spread evenly over the sphere (a Fibonacci lattice). */
export function sphereDirections(count: number): Vector3[] {
    const golden = Math.PI * (3 - Math.sqrt(5))
    return Array.from({ length: count }, (_, i) => {
        const y = 1 - ((i + 0.5) / count) * 2
        const r = Math.sqrt(1 - y * y)
        return new Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r)
    })
}

export interface BakeInput {
    bvh: MeshBVH
    /** What each solid triangle is made of (`collision.solid.userData.surfaces`), by face index. */
    surfaces: Uint8Array
    panels: Panel[]
    size: [number, number, number]
    origin: [number, number, number]
    /** Rays a cell for the sky and the bounce. */
    rays: number
}

/** The light's sources, summed apart (at a radiance of 1) so `finishLight` weighs them (`RADIANCE`). */
export const SOURCES = ['panel', 'sky', 'street', 'bounce'] as const
/** Where a cell's open-air flag and its share of escaping rays sit, after the sources' sums. */
const OPEN = SOURCES.length * 4
const ESCAPED = OPEN + 1
/**
 * Per cell, per source: ∫L and ∫L·ω (x, y, z); then 1 if the cell is open air (0: inside
 * something solid), and the share of rays that left the office (most, out past the façade).
 */
export const BAKED_FLOATS = ESCAPED + 1

/** Bakes the cells of layers z0 … z1 - 1 (all of x and y), `BAKED_FLOATS` a cell. */
export function bakeCells(input: BakeInput, z0: number, z1: number): Float32Array<ArrayBuffer> {
    const { bvh, surfaces, panels, size, origin, rays } = input
    const directions = sphereDirections(rays)
    const solidAngle = (4 * Math.PI) / rays
    const out = new Float32Array(size[0] * size[1] * (z1 - z0) * BAKED_FLOATS)
    const ray = new Ray()
    const p = new Vector3()
    const to = new Vector3()
    const dir = new Vector3()
    // Four points on each panel (a 2 × 2 grid), for soft shadows.
    const corners = [-0.5, 0.5].flatMap(a => [-0.5, 0.5].map(b => [a, b] as const))

    let at = 0
    for (let k = z0; k < z1; k++) {
        for (let j = 0; j < size[1]; j++) {
            for (let i = 0; i < size[0]; i++, at += BAKED_FLOATS) {
                p.set(origin[0] + (i + 0.5) * CELL.x, origin[1] + (j + 0.5) * CELL.y, origin[2] + (k + 0.5) * CELL.z)
                const add = (source: number, amount: number) => {
                    const s = at + source * 4
                    out[s]! += amount
                    out[s + 1]! += amount * dir.x
                    out[s + 2]! += amount * dir.y
                    out[s + 3]! += amount * dir.z
                }
                let backfaces = 0
                let escaped = 0
                // Turned a little per cell, so thin things don't line up into stripes.
                const turn = ((i * 7 + j * 13 + k * 29) % 31) * ((2 * Math.PI) / 31)
                const cos = Math.cos(turn)
                const sin = Math.sin(turn)
                for (const d of directions) {
                    dir.set(d.x * cos - d.z * sin, d.y, d.x * sin + d.z * cos)
                    ray.set(p, dir)
                    const hit = bvh.raycastFirst(ray, DoubleSide)
                    if (!hit) {
                        add(dir.y > 0 ? 1 : 2, solidAngle)
                        escaped++
                        continue
                    }
                    if (hit.face && hit.face.normal.dot(dir) > 0) backfaces++
                    // A panel is counted below, with its exact size: skip it here.
                    if (onPanel(panels, hit.point)) continue
                    const kind = hit.faceIndex == null ? 0 : (surfaces[hit.faceIndex] ?? 0)
                    add(3, (ALBEDO[kind] ?? 0.5) * solidAngle)
                }

                for (const panel of panels) {
                    if (panel.y <= p.y + 0.02) continue
                    const area = (panel.hx * 2 * panel.hz * 2) / corners.length
                    for (const [a, b] of corners) {
                        to.set(panel.x + a * panel.hx, panel.y, panel.z + b * panel.hz).sub(p)
                        const distance = to.length()
                        if (distance > 9) continue
                        dir.copy(to).divideScalar(distance)
                        ray.set(p, dir)
                        if (bvh.raycastFirst(ray, DoubleSide, 0, distance - 0.03)) continue
                        add(0, Math.min((area * dir.y) / (distance * distance), 1))
                    }
                }

                // Inside a wall or a desk, most rays leave through the back of what they meet.
                out[at + OPEN] = backfaces > rays * 0.25 ? 0 : 1
                out[at + ESCAPED] = escaped / rays
            }
        }
    }
    return out
}

function onPanel(panels: Panel[], point: Vector3): boolean {
    for (const panel of panels) {
        if (
            Math.abs(point.y - panel.y) < 0.03 &&
            Math.abs(point.x - panel.x) <= panel.hx + 0.01 &&
            Math.abs(point.z - panel.z) <= panel.hz + 0.01
        ) {
            return true
        }
    }
    return false
}

/**
 * The baked sums into the file's grid: cells inside something solid take their open neighbours'
 * light (so reading between cells never pulls in black from inside a wall), smoothed, then
 * scaled so the open floor at `openFloor` (x, z) comes to 1 (the median of them).
 */
export function finishLight(
    baked: Float32Array,
    size: [number, number, number],
    origin: [number, number, number],
    fingerprint: number,
    openFloor: ReadonlyArray<readonly [number, number]>
): OfficeLight {
    const cells = size[0] * size[1] * size[2]
    // a and b for a normal: a + b·n = (∫L)/4 + (∫L·ω)/2 · n, over π so an open sky is 1.
    const values = new Float32Array(cells * 4)
    const open = new Uint8Array(cells)
    const ceiling = size[1] * CELL.y
    for (let c = 0; c < cells; c++) {
        const s = c * BAKED_FLOATS
        // Right under the ceiling the panels shine sideways, which a + b·n can't keep off the
        // ceiling beside them (it would glow in patches round each one): no panels up there.
        const y = (Math.floor(c / size[0]) % size[1]) * CELL.y + CELL.y / 2
        const underCeiling = ceiling - y < PANEL_CLEARANCE
        for (const [source, name] of SOURCES.entries()) {
            if (name === 'panel' && underCeiling) continue
            const radiance = RADIANCE[name]
            values[c * 4]! += (baked[s + source * 4]! * radiance) / 4 / Math.PI
            for (let v = 1; v < 4; v++) values[c * 4 + v]! += (baked[s + source * 4 + v]! * radiance) / 2 / Math.PI
        }
        open[c] = baked[s + OPEN]!
    }

    const index = (i: number, j: number, k: number) => i + size[0] * (j + size[1] * k)
    for (let pass = 0; pass < 6; pass++) {
        const filled: number[] = []
        for (let k = 0; k < size[2]; k++) {
            for (let j = 0; j < size[1]; j++) {
                for (let i = 0; i < size[0]; i++) {
                    const c = index(i, j, k)
                    if (open[c]) continue
                    const sum = [0, 0, 0, 0]
                    let n = 0
                    for (let dk = -1; dk <= 1; dk++) {
                        for (let dj = -1; dj <= 1; dj++) {
                            for (let di = -1; di <= 1; di++) {
                                const [a, b, d] = [i + di, j + dj, k + dk]
                                if (a < 0 || b < 0 || d < 0 || a >= size[0] || b >= size[1] || d >= size[2]) continue
                                const o = index(a, b, d)
                                if (!open[o]) continue
                                for (let v = 0; v < 4; v++) sum[v]! += values[o * 4 + v]!
                                n++
                            }
                        }
                    }
                    if (n === 0) continue
                    for (let v = 0; v < 4; v++) values[c * 4 + v] = sum[v]! / n
                    filled.push(c)
                }
            }
        }
        for (const c of filled) open[c] = 1
    }

    // Smoothed a little along each axis ([1 2 1] / 4): the rays' noise goes, the shading stays.
    const strides = [1, size[0], size[0] * size[1]]
    for (let axis = 0; axis < 3; axis++) {
        const source = values.slice()
        const stride = strides[axis]!
        for (let c = 0; c < cells; c++) {
            const along = Math.floor(c / stride) % size[axis]!
            const before = along > 0 ? c - stride : c
            const after = along < size[axis]! - 1 ? c + stride : c
            for (let v = 0; v < 4; v++) {
                values[c * 4 + v] = (source[before * 4 + v]! + 2 * source[c * 4 + v]! + source[after * 4 + v]!) / 4
            }
        }
    }

    // The scale: the light on the floor at the `openFloor` points (the spawns: open floor in every
    // room), facing up, comes out at 1 in the middle of them.
    const floor = openFloor
        .map(([x, z]) => {
            const i = Math.min(Math.max(Math.floor((x - origin[0]) / CELL.x), 0), size[0] - 1)
            const k = Math.min(Math.max(Math.floor((z - origin[2]) / CELL.z), 0), size[2] - 1)
            const c = index(i, 0, k)
            return values[c * 4]! + values[c * 4 + 2]!
        })
        .sort((a, b) => a - b)
    const scale = 1 / Math.max(floor[Math.floor(floor.length / 2)] ?? 1, 1e-3)
    let max = 0
    for (let c = 0; c < cells * 4; c++) values[c]! *= scale
    for (let c = 0; c < cells; c++) max = Math.max(max, values[c * 4]!)
    max = Math.min(max, 4)

    const data = new Uint8Array(cells * 4)
    const byte = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 255)
    for (let c = 0; c < cells; c++) {
        const a = Math.min(values[c * 4]!, max)
        data[c * 4] = byte(Math.sqrt(a / max))
        for (let v = 1; v < 4; v++) data[c * 4 + v] = byte(a > 0 ? (values[c * 4 + v]! / (2 * a)) * 0.5 + 0.5 : 0.5)
    }
    return { fingerprint, size, origin, cell: [CELL.x, CELL.y, CELL.z], max, data }
}
