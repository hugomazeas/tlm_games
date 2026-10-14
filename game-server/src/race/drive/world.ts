import { heightAt } from '../map/convert.ts'
import type { RaceMap, RoadKind } from '../map/format.ts'

/**
 * What a kart needs to know about the map, built once from it: the ground's
 * height, what it's driving on, what it bumps into, where the roads are and
 * where the boost pads lie. Pure and deterministic, so the server can build
 * the same world later.
 */

export type Surface = 'offroad' | 'road' | 'water'

/** A straight piece of something solid; the kart can't come closer to it than `radius` (plus its own). */
export interface Collider {
    x1: number
    z1: number
    x2: number
    z2: number
    radius: number
    /** Heights between which it's solid: the kart passes under an arch's stone. */
    bottom: number
    top: number
}

/** A boost pad lying along a road, centred at x, z, running along (dx, dz). */
export interface Pad {
    x: number
    z: number
    dx: number
    dz: number
    length: number
    width: number
}

/** A point on a road, the way along it, and the road's width there. */
export interface RoadPoint {
    x: number
    z: number
    heading: number
    width: number
}

/** A straight piece of something, reaching `radius` either side of its line. */
interface Segment {
    x1: number
    z1: number
    x2: number
    z2: number
    radius: number
}

interface RoadSegment extends Segment {
    width: number
}

export interface DriveWorld {
    ground(x: number, z: number): number
    surface(x: number, z: number): Surface
    /** Colliders that might touch a circle at x, z of radius `reach`. */
    collidersNear(x: number, z: number, reach: number): readonly Collider[]
    /** The closest point on a drivable road, facing whichever way along it is closer to `heading`. */
    nearestRoad(x: number, z: number, heading: number): RoadPoint | null
    pads: readonly Pad[]
    padAt(x: number, z: number): Pad | null
}

/** Kinds a car drives on at full speed. Paths and sidewalks count: they're paved, and kerbs shouldn't slow you down. */
const PAVED: readonly RoadKind[] = ['major', 'street', 'service', 'path', 'sidewalk']
/** Kinds a reset puts you back on. */
const DRIVABLE: readonly RoadKind[] = ['major', 'street', 'service']
/** Size of a surface cell, in metres. */
const SURFACE_CELL = 2
/** Size of a collision grid cell, in metres. */
const GRID_CELL = 16
/** A reset looks this far for a road. */
const RESET_REACH = 400

/** Straight runs at least this long get boost pads. */
const PAD_MIN_RUN = 160
/** A run's first pad is this far into it, the next ones this far apart. */
const PAD_LEAD = 40
const PAD_EVERY = 300
/** Segments within this many radians of the run's first one keep it straight. */
const PAD_STRAIGHT = (4 * Math.PI) / 180
/** No two pads closer than this. */
const PAD_GAP = 60
const PAD_LENGTH = 5
const PAD_MAX_WIDTH = 5

const SURFACES: Surface[] = ['offroad', 'road', 'water']

export function buildWorld(map: RaceMap): DriveWorld {
    const { width, depth, terrain } = map
    const ground = (x: number, z: number) => heightAt(terrain, width, depth, x, z)

    const surfaces = paintSurfaces(map)
    const cols = Math.ceil(width / SURFACE_CELL)
    const rows = Math.ceil(depth / SURFACE_CELL)

    const colliders = new SegmentGrid<Collider>(width, depth)
    for (const collider of buildColliders(map, ground)) colliders.add(collider)

    const roads = new SegmentGrid<RoadSegment>(width, depth)
    for (const road of map.roads) {
        if (!DRIVABLE.includes(road.kind)) continue
        for (let i = 0; i + 3 < road.points.length; i += 2) {
            const [x1, z1, x2, z2] = road.points.slice(i, i + 4) as [number, number, number, number]
            roads.add({ x1, z1, x2, z2, radius: 0, width: road.width })
        }
    }

    const pads = placePads(map)

    return {
        ground,
        surface(x, z) {
            if (ground(x, z) <= terrain.waterLevel) return 'water'
            const col = Math.floor((x + width / 2) / SURFACE_CELL)
            const row = Math.floor((z + depth / 2) / SURFACE_CELL)
            if (col < 0 || row < 0 || col >= cols || row >= rows) return 'offroad'

            return SURFACES[surfaces[row * cols + col]!]!
        },
        collidersNear: (x, z, reach) => colliders.near(x, z, reach),
        nearestRoad(x, z, heading) {
            let best: RoadPoint | null = null
            let bestDistance = Infinity
            for (const segment of roads.near(x, z, RESET_REACH)) {
                const [px, pz] = closestOnSegment(segment, x, z)
                const distance = Math.hypot(px - x, pz - z)
                if (distance >= bestDistance) continue
                bestDistance = distance
                const along = Math.atan2(-(segment.x2 - segment.x1), -(segment.z2 - segment.z1))
                const back = along + Math.PI
                best = {
                    x: px,
                    z: pz,
                    heading: angleBetween(along, heading) <= Math.PI / 2 ? along : back,
                    width: segment.width,
                }
            }

            return best && { ...best, heading: wrapAngle(best.heading) }
        },
        pads,
        padAt(x, z) {
            for (const pad of pads) {
                const along = (x - pad.x) * pad.dx + (z - pad.z) * pad.dz
                const across = (x - pad.x) * -pad.dz + (z - pad.z) * pad.dx
                if (Math.abs(along) <= pad.length / 2 && Math.abs(across) <= pad.width / 2) return pad
            }

            return null
        },
    }
}

/**
 * Buildings' edges, the fortifications, and the solid decor (fountain pools,
 * plinths, stone walls). A building only blocks between its base and top, so
 * a city gate's arch, which starts above the road, doesn't.
 */
export function buildColliders(map: RaceMap, ground: (x: number, z: number) => number): Collider[] {
    const colliders: Collider[] = []
    const ring = (flat: number[], bottom: number, top: number) => {
        for (let i = 0; i < flat.length; i += 2) {
            const j = (i + 2) % flat.length
            colliders.push({ x1: flat[i]!, z1: flat[i + 1]!, x2: flat[j]!, z2: flat[j + 1]!, radius: 0, bottom, top })
        }
    }
    for (const building of map.buildings) {
        ring(building.outline, building.base, building.top)
        for (const hole of building.holes ?? []) ring(hole, building.base, building.top)
    }
    for (const wall of map.walls) {
        for (let i = 0; i + 3 < wall.points.length; i += 2) {
            const [x1, z1, x2, z2] = wall.points.slice(i, i + 4) as [number, number, number, number]
            const low = Math.min(ground(x1, z1), ground(x2, z2))
            const high = Math.max(ground(x1, z1), ground(x2, z2))
            colliders.push({ x1, z1, x2, z2, radius: wall.thickness / 2, bottom: low - 1, top: high + wall.height })
        }
    }
    for (const shape of map.decor.shapes) {
        if (!shape.solid) continue
        const bottom = shape.y
        const top = shape.y + shape.height
        if (shape.shape === 'prism') {
            ring(shape.outline ?? [], bottom, top)
        } else if (shape.shape === 'box' || shape.shape === 'pyramid') {
            // Three.js turns local x (1, 0) onto (cos t, −sin t) and local z (0, 1) onto (sin t, cos t).
            const ux = Math.cos(shape.turn)
            const uz = -Math.sin(shape.turn)
            const corners = [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
            ].flatMap(([a, b]) => {
                const along = (a! * shape.width) / 2
                const across = (b! * shape.depth) / 2
                return [shape.x + ux * along - uz * across, shape.z + uz * along + ux * across]
            })
            ring(corners, bottom, top)
        } else {
            const radius = Math.max(shape.width, shape.depth) / 2
            colliders.push({ x1: shape.x, z1: shape.z, x2: shape.x, z2: shape.z, radius, bottom, top })
        }
    }

    return colliders
}

/** What each cell of the map is: 0 offroad, 1 road, 2 water (ponds; the river comes from the terrain). */
function paintSurfaces(map: RaceMap): Uint8Array {
    const cols = Math.ceil(map.width / SURFACE_CELL)
    const rows = Math.ceil(map.depth / SURFACE_CELL)
    const cells = new Uint8Array(cols * rows)
    const toCol = (x: number) => (x + map.width / 2) / SURFACE_CELL
    const toRow = (z: number) => (z + map.depth / 2) / SURFACE_CELL

    for (const area of map.areas) {
        if (area.kind !== 'parking' && area.kind !== 'water') continue
        fillPolygon(
            cells,
            cols,
            rows,
            area.outline.map((v, i) => (i % 2 === 0 ? toCol(v) : toRow(v))),
            area.kind === 'parking' ? 1 : 2
        )
    }

    for (const road of map.roads) {
        if (!PAVED.includes(road.kind)) continue
        const half = road.width / 2
        for (let i = 0; i + 3 < road.points.length; i += 2) {
            const segment = {
                x1: road.points[i]!,
                z1: road.points[i + 1]!,
                x2: road.points[i + 2]!,
                z2: road.points[i + 3]!,
            }
            const c0 = Math.max(0, Math.floor(toCol(Math.min(segment.x1, segment.x2) - half)))
            const c1 = Math.min(cols - 1, Math.floor(toCol(Math.max(segment.x1, segment.x2) + half)))
            const r0 = Math.max(0, Math.floor(toRow(Math.min(segment.z1, segment.z2) - half)))
            const r1 = Math.min(rows - 1, Math.floor(toRow(Math.max(segment.z1, segment.z2) + half)))
            for (let row = r0; row <= r1; row++) {
                for (let col = c0; col <= c1; col++) {
                    const x = (col + 0.5) * SURFACE_CELL - map.width / 2
                    const z = (row + 0.5) * SURFACE_CELL - map.depth / 2
                    const [px, pz] = closestOnSegment(segment, x, z)
                    if (Math.hypot(px - x, pz - z) <= half) cells[row * cols + col] = 1
                }
            }
        }
    }

    return cells
}

/** Fills the cells whose centres are inside a polygon given in cell units. */
function fillPolygon(cells: Uint8Array, cols: number, rows: number, polygon: number[], value: number): void {
    const count = polygon.length / 2
    let top = Infinity
    let bottom = -Infinity
    for (let i = 1; i < polygon.length; i += 2) {
        top = Math.min(top, polygon[i]!)
        bottom = Math.max(bottom, polygon[i]!)
    }
    for (let row = Math.max(0, Math.floor(top)); row <= Math.min(rows - 1, Math.ceil(bottom)); row++) {
        const y = row + 0.5
        const crossings: number[] = []
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count
            const [xa, ya, xb, yb] = [polygon[i * 2]!, polygon[i * 2 + 1]!, polygon[j * 2]!, polygon[j * 2 + 1]!]
            if (ya <= y !== yb <= y) crossings.push(xa + ((y - ya) / (yb - ya)) * (xb - xa))
        }
        crossings.sort((a, b) => a - b)
        for (let k = 0; k + 1 < crossings.length; k += 2) {
            const from = Math.max(0, Math.ceil(crossings[k]! - 0.5))
            const to = Math.min(cols - 1, Math.floor(crossings[k + 1]! - 0.5))
            for (let col = from; col <= to; col++) cells[row * cols + col] = value
        }
    }
}

/**
 * Boost pads on the long straight stretches of streets: the first a little
 * way into each run, then every few hundred metres, never two close together.
 */
export function placePads(map: Pick<RaceMap, 'roads'>): Pad[] {
    const pads: Pad[] = []
    const place = (x: number, z: number, dx: number, dz: number, roadWidth: number) => {
        if (pads.some(pad => Math.hypot(pad.x - x, pad.z - z) < PAD_GAP)) return
        pads.push({
            x: round(x),
            z: round(z),
            dx: round(dx, 4),
            dz: round(dz, 4),
            length: PAD_LENGTH,
            width: Math.min(PAD_MAX_WIDTH, roadWidth * 0.6),
        })
    }

    for (const road of map.roads) {
        if (road.kind !== 'major' && road.kind !== 'street') continue
        const points = road.points
        let start = 0
        while (start + 3 < points.length) {
            const direction = Math.atan2(points[start + 3]! - points[start + 1]!, points[start + 2]! - points[start]!)
            let end = start + 2
            while (end + 3 < points.length) {
                const next = Math.atan2(points[end + 3]! - points[end + 1]!, points[end + 2]! - points[end]!)
                if (angleBetween(next, direction) > PAD_STRAIGHT) break
                end += 2
            }
            const x0 = points[start]!
            const z0 = points[start + 1]!
            const length = Math.hypot(points[end]! - x0, points[end + 1]! - z0)
            if (length >= PAD_MIN_RUN) {
                const dx = (points[end]! - x0) / length
                const dz = (points[end + 1]! - z0) / length
                for (let along = PAD_LEAD; along <= length - PAD_LEAD; along += PAD_EVERY) {
                    place(x0 + dx * along, z0 + dz * along, dx, dz, road.width)
                }
            }
            start = end
        }
    }

    return pads
}

/** Segments bucketed by the grid cells their reach covers. */
class SegmentGrid<T extends Segment> {
    private readonly cells = new Map<number, T[]>()
    private readonly cols: number

    constructor(
        private readonly width: number,
        private readonly depth: number
    ) {
        this.cols = Math.ceil(width / GRID_CELL) + 1
    }

    add(collider: T): void {
        const [c0, r0] = this.cell(
            Math.min(collider.x1, collider.x2) - collider.radius,
            Math.min(collider.z1, collider.z2) - collider.radius
        )
        const [c1, r1] = this.cell(
            Math.max(collider.x1, collider.x2) + collider.radius,
            Math.max(collider.z1, collider.z2) + collider.radius
        )
        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                const key = row * this.cols + col
                const bucket = this.cells.get(key)
                if (bucket) bucket.push(collider)
                else this.cells.set(key, [collider])
            }
        }
    }

    near(x: number, z: number, reach: number): T[] {
        const [c0, r0] = this.cell(x - reach, z - reach)
        const [c1, r1] = this.cell(x + reach, z + reach)
        const found = new Set<T>()
        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                for (const collider of this.cells.get(row * this.cols + col) ?? []) found.add(collider)
            }
        }

        return [...found]
    }

    private cell(x: number, z: number): [number, number] {
        const col = Math.floor((Math.min(Math.max(x, -this.width / 2), this.width / 2) + this.width / 2) / GRID_CELL)
        const row = Math.floor((Math.min(Math.max(z, -this.depth / 2), this.depth / 2) + this.depth / 2) / GRID_CELL)

        return [col, row]
    }
}

/** The closest point to x, z on a segment, and how far along it that is (0–1). */
export function closestOnSegment(
    segment: Pick<Collider, 'x1' | 'z1' | 'x2' | 'z2'>,
    x: number,
    z: number
): [number, number, number] {
    const dx = segment.x2 - segment.x1
    const dz = segment.z2 - segment.z1
    const lengthSquared = dx * dx + dz * dz
    const t =
        lengthSquared === 0
            ? 0
            : Math.min(1, Math.max(0, ((x - segment.x1) * dx + (z - segment.z1) * dz) / lengthSquared))

    return [segment.x1 + dx * t, segment.z1 + dz * t, t]
}

/** An angle brought into (−π, π]. */
export function wrapAngle(angle: number): number {
    return angle - Math.ceil((angle - Math.PI) / (2 * Math.PI)) * 2 * Math.PI
}

function angleBetween(a: number, b: number): number {
    return Math.abs(wrapAngle(a - b))
}

function round(value: number, decimals = 2): number {
    const scale = 10 ** decimals

    return Math.round(value * scale) / scale
}
