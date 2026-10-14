import type { LatLon } from './convert.ts'
import { random, type Tree } from './trees.ts'

/**
 * Heights measured from the air. Québec's lidar survey (MRNF, CC BY 4.0)
 * gives, every metre, how high the first thing the laser hit stands above
 * the ground: roofs, treetops, or 0 on open ground. The snapshot keeps it
 * on the map's own grid, 2 m a cell, a byte a cell; the build reads from it
 * how tall each building is, what roof it has and where every tree stands.
 */

/** Size of a cell of the snapshot's height grid, in metres. */
export const LIDAR_CELL = 2
/** Heights are stored in half-metre steps up to this height, in whole metres above it. */
const FINE_UP_TO = 100
/** A cell the survey didn't cover. */
export const NO_DATA = 255

/** A height as the snapshot stores it: half-metre steps to 100 m, then metres to 154 m. */
export function encodeHeight(height: number): number {
    const h = Math.max(0, height)
    return Math.min(NO_DATA - 1, h <= FINE_UP_TO ? Math.round(h * 2) : FINE_UP_TO * 2 + Math.round(h - FINE_UP_TO))
}

export function decodeHeight(value: number): number {
    return value <= FINE_UP_TO * 2 ? value / 2 : FINE_UP_TO + (value - FINE_UP_TO * 2)
}

/** Heights above the ground on the map's grid: rows from the north edge, each from west to east. */
export interface LidarGrid {
    cols: number
    rows: number
    cell: number
    /** One byte a cell: the height (encodeHeight), or NO_DATA. */
    heights: Uint8Array
}

export function lidarSize(width: number, depth: number): { cols: number; rows: number } {
    return { cols: Math.ceil(width / LIDAR_CELL), rows: Math.ceil(depth / LIDAR_CELL) }
}

/** The height above the ground at a map point, or null where the survey has nothing. */
export function lidarAt(grid: LidarGrid, width: number, depth: number, x: number, z: number): number | null {
    const col = Math.floor((x + width / 2) / grid.cell)
    const row = Math.floor((z + depth / 2) / grid.cell)
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
    const value = grid.heights[row * grid.cols + col]!

    return value === NO_DATA ? null : decodeHeight(value)
}

// ── NAD83(CSRS) / MTM zone 7 (EPSG:2949), the survey's projection ──────────────────────────────

const A = 6378137
const FLATTENING = 1 / 298.257222101
const E2 = FLATTENING * (2 - FLATTENING)
const EP2 = E2 / (1 - E2)
const K0 = 0.9999
const LON0 = (-70.5 * Math.PI) / 180
const FALSE_EASTING = 304800

function meridianArc(phi: number): number {
    const e4 = E2 * E2
    const e6 = e4 * E2
    return (
        A *
        ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
            ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
            ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
            ((35 * e6) / 3072) * Math.sin(6 * phi))
    )
}

/** A latitude/longitude in MTM zone 7 metres: easting and northing. */
export function toMtm7({ lat, lon }: LatLon): [number, number] {
    const phi = (lat * Math.PI) / 180
    const lam = (lon * Math.PI) / 180 - LON0
    const n = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2)
    const t = Math.tan(phi) ** 2
    const c = EP2 * Math.cos(phi) ** 2
    const a = Math.cos(phi) * lam
    const easting =
        FALSE_EASTING +
        K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120)
    const northing =
        K0 *
        (meridianArc(phi) +
            n *
                Math.tan(phi) *
                ((a * a) / 2 +
                    ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
                    ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720))

    return [easting, northing]
}

/** A part of the survey: one 1 m grid in MTM zone 7, `x0`, `y0` its north-west corner. */
export interface SurveyPatch {
    x0: number
    y0: number
    cols: number
    rows: number
    /** Heights in metres, row by row from the north; NaN (or below −100) where there's nothing. */
    values: Float32Array
}

/**
 * The survey on the map's grid: each map cell takes the highest of the four
 * survey pixels around its middle, so a roof or a crown keeps its full height.
 */
export function resampleSurvey(
    patches: SurveyPatch[],
    width: number,
    depth: number,
    unproject: (point: [number, number]) => LatLon
): LidarGrid {
    const { cols, rows } = lidarSize(width, depth)
    const heights = new Uint8Array(cols * rows).fill(NO_DATA)

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = -width / 2 + (col + 0.5) * LIDAR_CELL
            const z = -depth / 2 + (row + 0.5) * LIDAR_CELL
            const [easting, northing] = toMtm7(unproject([x, z]))
            let best = -Infinity
            for (const patch of patches) {
                const pc = Math.floor(easting - patch.x0 - 0.5)
                const pr = Math.floor(patch.y0 - northing - 0.5)
                for (let dr = 0; dr <= 1; dr++) {
                    for (let dc = 0; dc <= 1; dc++) {
                        const c = pc + dc
                        const r = pr + dr
                        if (c < 0 || r < 0 || c >= patch.cols || r >= patch.rows) continue
                        const value = patch.values[r * patch.cols + c]!
                        if (Number.isFinite(value) && value > -100) best = Math.max(best, value)
                    }
                }
            }
            if (best > -Infinity) heights[row * cols + col] = encodeHeight(best)
        }
    }

    return { cols, rows, cell: LIDAR_CELL, heights }
}

/** Cells of the grid whose middles fall inside a ring, as [col, row, distance to the ring's nearest edge]. */
function cellsInside(grid: LidarGrid, width: number, depth: number, ring: number[]): [number, number, number][] {
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < ring.length; i += 2) {
        minX = Math.min(minX, ring[i]!)
        maxX = Math.max(maxX, ring[i]!)
        minZ = Math.min(minZ, ring[i + 1]!)
        maxZ = Math.max(maxZ, ring[i + 1]!)
    }
    const cells: [number, number, number][] = []
    const c0 = Math.max(0, Math.floor((minX + width / 2) / grid.cell))
    const c1 = Math.min(grid.cols - 1, Math.floor((maxX + width / 2) / grid.cell))
    const r0 = Math.max(0, Math.floor((minZ + depth / 2) / grid.cell))
    const r1 = Math.min(grid.rows - 1, Math.floor((maxZ + depth / 2) / grid.cell))
    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
            const x = -width / 2 + (col + 0.5) * grid.cell
            const z = -depth / 2 + (row + 0.5) * grid.cell
            if (insideRing(ring, x, z)) cells.push([col, row, distanceToRing(ring, x, z)])
        }
    }

    return cells
}

/** Inner cells must be this far from the walls, so eaves and the ground beside don't count. */
const INNER = 1.5

/**
 * How tall a building stands by the survey: the median height over its
 * footprint, away from the walls (all of it when it's small). Null when the
 * survey has too little of it, or the median says nothing stands there.
 */
export function surveyedHeight(
    grid: LidarGrid,
    width: number,
    depth: number,
    outline: number[],
    holes: number[][] = []
): number | null {
    // A courtyard's ground isn't the building.
    const cells = cellsInside(grid, width, depth, outline).filter(([col, row]) => {
        const x = -width / 2 + (col + 0.5) * grid.cell
        const z = -depth / 2 + (row + 0.5) * grid.cell
        return !holes.some(hole => insideRing(hole, x, z))
    })
    const inner = cells.filter(([, , distance]) => distance >= INNER)
    const pick = inner.length >= 4 ? inner : cells
    const values = pick
        .map(([col, row]) => grid.heights[row * grid.cols + col]!)
        .filter(value => value !== NO_DATA)
        .sort((a, b) => a - b)
    if (values.length < 3 || values.length < pick.length * 0.6) return null
    const median = decodeHeight(values[Math.floor(values.length / 2)]!)

    return median >= 2 ? median : null
}

/** A building as the survey sees it: where its walls stop above the ground, and the pitched roof on them, if any. */
export interface SurveyedShape {
    walls: number
    roof?: { shape: 'gable' | 'hip'; height: number }
}

/** A pitched roof rises at least this much from the eaves to the ridge, or the roof counts as flat. */
const MIN_PITCH = 1.5
/** Roofs wider than this across aren't taken for pitched ones: big flat roofs with plant on them fool the fit. */
const MAX_PITCHED_SPAN = 30
/** Heights this far from a fit are chimneys, dormers or overhanging trees, not the roof. */
const OUTLIER = 3

/**
 * A building's walls and roof from the heights over its footprint. A flat
 * roof is its median height; a gable roof falls from a ridge along the
 * footprint's length to the eaves either side; a hip roof falls to every
 * side. The model that fits the heights best wins, a pitched one only when
 * it fits clearly better and the pitch is real. Null when the survey has too
 * little of the building.
 */
export function surveyedShape(
    grid: LidarGrid,
    width: number,
    depth: number,
    outline: number[],
    holes: number[][] = [],
    box?: { cx: number; cz: number; ux: number; uz: number; halfLong: number; halfShort: number }
): SurveyedShape | null {
    const flat = surveyedHeight(grid, width, depth, outline, holes)
    if (flat === null) return null
    if (holes.length > 0 || !box || box.halfShort * 2 > MAX_PITCHED_SPAN) return { walls: flat }

    // Every cell over the footprint, with how far it is from the ridge (0) to the eaves (1), and to the nearest side.
    const samples: { h: number; gable: number; hip: number }[] = []
    for (const [col, row] of cellsInside(grid, width, depth, outline)) {
        const value = grid.heights[row * grid.cols + col]!
        if (value === NO_DATA) continue
        const x = -width / 2 + (col + 0.5) * grid.cell - box.cx
        const z = -depth / 2 + (row + 0.5) * grid.cell - box.cz
        const along = Math.abs(x * box.ux + z * box.uz)
        const across = Math.abs(-x * box.uz + z * box.ux)
        const toEaves = Math.max(0, box.halfShort - across) / box.halfShort
        const toEnd = Math.max(0, box.halfLong - along) / box.halfShort
        samples.push({ h: decodeHeight(value), gable: toEaves, hip: Math.min(toEaves, toEnd, 1) })
    }
    if (samples.length < 8) return { walls: flat }

    // Least squares of h = eaves + rise × shape, ignoring the cells far off the flat roof's height.
    const kept = samples.filter(sample => Math.abs(sample.h - flat) < OUTLIER * 2)
    const fit = (shape: (s: (typeof samples)[number]) => number) => {
        const n = kept.length
        const sx = kept.reduce((sum, s) => sum + shape(s), 0)
        const sy = kept.reduce((sum, s) => sum + s.h, 0)
        const sxx = kept.reduce((sum, s) => sum + shape(s) ** 2, 0)
        const sxy = kept.reduce((sum, s) => sum + shape(s) * s.h, 0)
        const denominator = n * sxx - sx * sx
        const rise = denominator === 0 ? 0 : (n * sxy - sx * sy) / denominator
        const eaves = (sy - rise * sx) / n
        const error = Math.sqrt(kept.reduce((sum, s) => sum + (s.h - eaves - rise * shape(s)) ** 2, 0) / n)
        return { rise, eaves, error }
    }
    const level = Math.sqrt(kept.reduce((sum, s) => sum + (s.h - flat) ** 2, 0) / kept.length)
    const gable = fit(s => s.gable)
    const hip = fit(s => s.hip)
    const best = gable.error <= hip.error ? { ...gable, shape: 'gable' as const } : { ...hip, shape: 'hip' as const }
    if (best.rise < MIN_PITCH || best.error > level * 0.7 || best.eaves < 2) return { walls: flat }

    return { walls: round(best.eaves), roof: { shape: best.shape, height: round(best.rise) } }
}

/**
 * Which cells of the grid are buildings: those whose middle falls inside a
 * footprint, and a cell round them, so the edge of a roof isn't taken for a
 * crown.
 */
export function buildingMask(grid: LidarGrid, width: number, depth: number, footprints: number[][]): Uint8Array {
    const mask = new Uint8Array(grid.cols * grid.rows)
    for (const ring of footprints) {
        for (const [col, row] of cellsInside(grid, width, depth, ring)) mask[row * grid.cols + col] = 1
    }
    const grown = mask.slice()
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            if (!mask[row * grid.cols + col]) continue
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = row + dr
                    const c = col + dc
                    if (r >= 0 && c >= 0 && r < grid.rows && c < grid.cols) grown[r * grid.cols + c] = 1
                }
            }
        }
    }

    return grown
}

/** Canopy lower than this is shrubs, hedges or cars, not trees. */
const CANOPY = 3
/** A crown reaches at most this far from its top. */
const MAX_REACH = 10
/** Cells round a top, itself included, that a crown covers at least. */
const MIN_CROWN_CELLS = 4

/**
 * Tree crowns in the survey: tops (the highest point within a few metres,
 * further for taller trees) of canopy outside the buildings, each with its
 * height, and its crown as wide as the canopy around it stays over half its
 * height. Where a city tree stands under a top, it keeps its species and
 * place and takes the measured size.
 */
export function surveyedTrees(
    grid: LidarGrid,
    width: number,
    depth: number,
    buildings: Uint8Array,
    listed: Tree[]
): Tree[] {
    const { cols, rows, cell, heights } = grid
    const valueAt = (col: number, row: number) => {
        if (col < 0 || row < 0 || col >= cols || row >= rows) return 0
        const value = heights[row * cols + col]!
        return value === NO_DATA ? 0 : decodeHeight(value)
    }
    const centre = (col: number, row: number): [number, number] => [
        -width / 2 + (col + 0.5) * cell,
        -depth / 2 + (row + 0.5) * cell,
    ]

    // Canopy cells: tall enough, and not a roof (or right against one).
    const canopy = new Uint8Array(cols * rows)
    for (let i = 0; i < canopy.length; i++) {
        if (!buildings[i] && heights[i] !== NO_DATA && decodeHeight(heights[i]!) >= CANOPY) canopy[i] = 1
    }

    const tops: Tree[] = []
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (!canopy[row * cols + col]) continue
            const h = valueAt(col, row)
            const reach = Math.max(1, Math.round((1.5 + h * 0.1) / cell))
            let isTop = true
            for (let dr = -reach; dr <= reach && isTop; dr++) {
                for (let dc = -reach; dc <= reach; dc++) {
                    if ((dr === 0 && dc === 0) || dr * dr + dc * dc > reach * reach) continue
                    const other = canopy[(row + dr) * cols + col + dc] ? valueAt(col + dc, row + dr) : 0
                    // Ties go to the first cell in reading order, so a flat crown has one top.
                    if (other > h || (other === h && (dr < 0 || (dr === 0 && dc < 0)))) {
                        isTop = false
                        break
                    }
                }
            }
            if (!isTop) continue

            // A crown covers a few cells at over half its height; a lamp post or a pole is one.
            let crownCells = 0
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    if (canopy[(row + dr) * cols + col + dc] && valueAt(col + dc, row + dr) >= h * 0.5) crownCells++
                }
            }
            if (crownCells < MIN_CROWN_CELLS) continue

            // How far the crown spreads: along eight directions until it falls under half the height.
            let spread = 0
            for (let k = 0; k < 8; k++) {
                const angle = (k * Math.PI) / 4
                let r = 1
                while (r * cell < MAX_REACH) {
                    const c = col + Math.round(Math.cos(angle) * r)
                    const rr = row + Math.round(Math.sin(angle) * r)
                    if (!canopy[rr * cols + c] || valueAt(c, rr) < h * 0.5) break
                    r++
                }
                spread += (r - 0.5) * cell
            }
            const [x, z] = centre(col, row)
            const crown = round(Math.min(Math.max((spread / 8) * 2, 2.5), 20))
            const kind = crown < h * 0.3 ? 'conifer' : 'broadleaf'
            tops.push({ x, z, height: round(h), crown, kind })
        }
    }

    // City trees take the measured size of the top over them; tops without one become trees of their own.
    const used = new Set<number>()
    const index = new Map<string, number[]>()
    tops.forEach((top, i) => {
        const key = `${Math.floor(top.x / 10)},${Math.floor(top.z / 10)}`
        const bucket = index.get(key)
        if (bucket) bucket.push(i)
        else index.set(key, [i])
    })
    const nearestTop = (x: number, z: number, within: number) => {
        let best = -1
        let bestDistance = within
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (const i of index.get(`${Math.floor(x / 10) + dx},${Math.floor(z / 10) + dz}`) ?? []) {
                    const distance = Math.hypot(tops[i]!.x - x, tops[i]!.z - z)
                    if (!used.has(i) && distance < bestDistance) {
                        best = i
                        bestDistance = distance
                    }
                }
            }
        }
        return best
    }

    const trees: Tree[] = listed.map(tree => {
        const i = nearestTop(tree.x, tree.z, Math.max(3, tree.crown * 0.4))
        if (i < 0) return tree
        used.add(i)
        const top = tops[i]!
        return { ...tree, height: top.height, crown: round(Math.max(top.crown, Math.min(tree.crown, top.crown * 1.3))) }
    })
    tops.forEach((top, i) => {
        if (!used.has(i))
            trees.push(top.kind === 'broadleaf' && random(top.x, top.z, 18) < 0.12 ? { ...top, kind: 'conifer' } : top)
    })

    return trees
}

/** Whether the survey covers a map point. */
export function surveyed(grid: LidarGrid, width: number, depth: number, x: number, z: number): boolean {
    return lidarAt(grid, width, depth, x, z) !== null
}

function insideRing(ring: number[], x: number, z: number): boolean {
    let inside = false
    const count = ring.length / 2
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = ring[i * 2]!
        const zi = ring[i * 2 + 1]!
        const xj = ring[j * 2]!
        const zj = ring[j * 2 + 1]!
        if (zi > z !== zj > z && x < xi + ((z - zi) * (xj - xi)) / (zj - zi)) inside = !inside
    }

    return inside
}

function distanceToRing(ring: number[], x: number, z: number): number {
    let best = Infinity
    const count = ring.length / 2
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        const ax = ring[i * 2]!
        const az = ring[i * 2 + 1]!
        const lx = ring[j * 2]! - ax
        const lz = ring[j * 2 + 1]! - az
        const t = Math.min(1, Math.max(0, ((x - ax) * lx + (z - az) * lz) / (lx * lx + lz * lz || 1)))
        best = Math.min(best, Math.hypot(x - ax - lx * t, z - az - lz * t))
    }

    return best
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}
