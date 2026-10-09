/**
 * Geometry for things laid along a line on the ground: road surfaces, lane
 * lines, kerbs. Pure maths producing flat position and index arrays, so it's
 * testable without a browser; `streets.ts` turns them into meshes.
 */

export type HeightAt = (x: number, z: number) => number

/** A point along a line, and how far along the line it is. */
export interface Sample {
    x: number
    z: number
    distance: number
}

/** One vertex across a strip: how far right of the line (negative is left), and how far above the ground. */
export interface Column {
    offset: number
    lift: number
}

/** Collects triangles for one mesh. */
export class Builder {
    readonly positions: number[] = []
    readonly indices: number[] = []

    get vertexCount(): number {
        return this.positions.length / 3
    }

    vertex(x: number, y: number, z: number): number {
        this.positions.push(x, y, z)
        return this.vertexCount - 1
    }

    triangle(a: number, b: number, c: number): void {
        this.indices.push(a, b, c)
    }
}

/**
 * Points along a flat [x, z, …] line, at most `step` metres apart. The
 * line's own vertices are kept, so corners stay sharp.
 */
export function resample(flat: number[], step: number): Sample[] {
    const samples: Sample[] = []
    let distance = 0

    for (let i = 0; i + 1 < flat.length; i += 2) {
        const x = flat[i]!
        const z = flat[i + 1]!
        if (i === 0) {
            samples.push({ x, z, distance: 0 })
            continue
        }

        const previous = samples.at(-1)!
        const length = Math.hypot(x - previous.x, z - previous.z)
        if (length === 0) continue
        const pieces = Math.ceil(length / step)
        for (let p = 1; p <= pieces; p++) {
            const t = p / pieces
            samples.push({
                x: previous.x + (x - previous.x) * t,
                z: previous.z + (z - previous.z) * t,
                distance: distance + length * t,
            })
        }
        distance += length
    }

    return samples
}

/** The longest a corner may push a strip's edge out, as a multiple of its offset. */
const MAX_MITRE = 2

/**
 * At each sample, the direction to the line's right, scaled so a strip of
 * constant width keeps that width through corners (a mitre), within reason.
 */
export function rightNormals(samples: Sample[]): [number, number][] {
    const direction = (a: Sample, b: Sample): [number, number] => {
        const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
        return [(b.x - a.x) / length, (b.z - a.z) / length]
    }

    return samples.map((sample, i) => {
        const incoming = i > 0 ? direction(samples[i - 1]!, sample) : null
        const outgoing = i + 1 < samples.length ? direction(sample, samples[i + 1]!) : null
        const a = incoming ?? outgoing ?? [1, 0]
        const b = outgoing ?? incoming ?? [1, 0]

        let tx = a[0] + b[0]
        let tz = a[1] + b[1]
        const length = Math.hypot(tx, tz)
        // A full U-turn: fall back on the incoming direction.
        if (length < 1e-6) [tx, tz] = a
        else [tx, tz] = [tx / length, tz / length]

        // (-dz, dx) is to the right when x is east and z is south.
        const nx = -tz
        const nz = tx
        const cos = nx * -a[1] + nz * a[0]
        const scale = Math.min(1 / Math.max(cos, 1e-6), MAX_MITRE)

        return [nx * scale, nz * scale]
    })
}

/**
 * Lays a strip along the samples: one vertex per column at each sample, on
 * the ground plus the column's lift, and quads between neighbouring columns.
 */
export function addStrip(
    builder: Builder,
    samples: Sample[],
    normals: [number, number][],
    columns: Column[],
    heightAt: HeightAt
): void {
    if (samples.length < 2) return

    const first = builder.vertexCount
    samples.forEach((sample, i) => {
        const [nx, nz] = normals[i]!
        for (const column of columns) {
            const x = sample.x + nx * column.offset
            const z = sample.z + nz * column.offset
            builder.vertex(x, heightAt(x, z) + column.lift, z)
        }
    })

    const width = columns.length
    for (let i = 0; i + 1 < samples.length; i++) {
        for (let c = 0; c + 1 < width; c++) {
            // A doubled column (a hard edge) has nothing between its two copies.
            if (columns[c]!.offset === columns[c + 1]!.offset && columns[c]!.lift === columns[c + 1]!.lift) continue
            const a = first + i * width + c
            const b = a + 1
            const below = a + width
            builder.triangle(a, below, b)
            builder.triangle(b, below, below + 1)
        }
    }
}

/**
 * Splits the samples into the runs where `keep` holds, with their normals.
 * Runs shorter than two samples are dropped.
 */
export function spans(
    samples: Sample[],
    normals: [number, number][],
    keep: (sample: Sample) => boolean
): { samples: Sample[]; normals: [number, number][] }[] {
    const runs: { samples: Sample[]; normals: [number, number][] }[] = []
    let current: { samples: Sample[]; normals: [number, number][] } | null = null

    samples.forEach((sample, i) => {
        if (!keep(sample)) {
            current = null
            return
        }
        if (!current) {
            current = { samples: [], normals: [] }
            runs.push(current)
        }
        current.samples.push(sample)
        current.normals.push(normals[i]!)
    })

    return runs.filter(run => run.samples.length >= 2)
}

/** Lays a flat disc on the ground: rounds off road ends so turns have no gaps. */
export function addDisc(
    builder: Builder,
    x: number,
    z: number,
    radius: number,
    lift: number,
    heightAt: HeightAt
): void {
    const segments = 14
    const centre = builder.vertex(x, heightAt(x, z) + lift, z)
    const first = builder.vertexCount
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        const px = x + Math.cos(angle) * radius
        const pz = z + Math.sin(angle) * radius
        builder.vertex(px, heightAt(px, pz) + lift, pz)
    }
    for (let i = 0; i < segments; i++) builder.triangle(centre, first + i, first + ((i + 1) % segments))
}

/** Lays a rectangle on the ground, centred on (x, z), `length` along the unit direction (dx, dz) and `width` across it. */
export function addRect(
    builder: Builder,
    x: number,
    z: number,
    dx: number,
    dz: number,
    length: number,
    width: number,
    lift: number,
    heightAt: HeightAt
): void {
    const corners = [
        [-length / 2, -width / 2],
        [length / 2, -width / 2],
        [length / 2, width / 2],
        [-length / 2, width / 2],
    ].map(([along, across]) => {
        const px = x + dx * along! - dz * across!
        const pz = z + dz * along! + dx * across!
        return builder.vertex(px, heightAt(px, pz) + lift, pz)
    })
    builder.triangle(corners[0]!, corners[1]!, corners[2]!)
    builder.triangle(corners[0]!, corners[2]!, corners[3]!)
}

/** Answers "is this point inside a junction?" quickly, from flat [x, z, radius, …] triples. */
export class JunctionIndex {
    private readonly cells = new Map<string, number[]>()

    constructor(
        private readonly junctions: number[],
        private readonly cell = 40
    ) {
        for (let i = 0; i < junctions.length; i += 3) {
            const x = junctions[i]!
            const z = junctions[i + 1]!
            const radius = junctions[i + 2]!
            for (let col = Math.floor((x - radius) / cell); col <= Math.floor((x + radius) / cell); col++) {
                for (let row = Math.floor((z - radius) / cell); row <= Math.floor((z + radius) / cell); row++) {
                    const key = `${col},${row}`
                    const list = this.cells.get(key) ?? []
                    list.push(i)
                    this.cells.set(key, list)
                }
            }
        }
    }

    contains(x: number, z: number): boolean {
        const list = this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`) ?? []
        return list.some(i => {
            const radius = this.junctions[i + 2]!
            return Math.hypot(x - this.junctions[i]!, z - this.junctions[i + 1]!) < radius
        })
    }
}
