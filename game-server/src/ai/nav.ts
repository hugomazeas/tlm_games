/**
 * Navigation field of an arena: a coarse grid, geodesic (walk-around-the-walls) distances and a
 * static "pocket depth" map. It exists because straight-line distance lies in front of a U-shaped
 * wall: the far side of a wall, or the bottom of a pocket, looks close (or far) in a straight line
 * while the real route is long (or a dead end).
 *
 * Grid: 0.5-unit cells. A cell is walkable when an avatar (radius 1) centred on it fits: inside the
 * arena and at least one radius away from every obstacle. Distances are 8-connected (no corner
 * cutting), stored as integers in tenths of a unit (5 per straight step, 7 per diagonal step).
 *
 * Moving obstacles are re-stamped on the grid by `refresh(timeMs)`; the pocket map ignores them
 * (it describes the fixed walls only).
 */
import { AVATAR_RADIUS } from '../sim/arena.ts'
import type { Arena } from '../sim/arena.ts'
import { contactWith, obstacleAt, sweptBox } from '../sim/geometry.ts'
import type { Obstacle } from '../sim/geometry.ts'
import type { GameState } from '../sim/game.ts'

export const CELL = 1
/** Distance units: tenths of an arena unit. */
export const UNIT = 10
export const UNREACHED = 32767
const STRAIGHT = Math.round(CELL * UNIT)
const DIAGONAL = Math.round(CELL * UNIT * Math.SQRT2)
/** Dial buckets: one more than the largest step cost. */
const BUCKETS = DIAGONAL + 1
/** Pocket map: a cell is "open" when at least this many of 16 rays of POCKET_RAY units are free. */
export const OPEN_RAYS = 12
export const POCKET_RAY = 4
/** Pocket depth is capped here (arena units); deeper cells all read the same. */
export const POCKET_CAP = 12

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, STRAIGHT],
    [-1, 0, STRAIGHT],
    [0, 1, STRAIGHT],
    [0, -1, STRAIGHT],
    [1, 1, DIAGONAL],
    [1, -1, DIAGONAL],
    [-1, 1, DIAGONAL],
    [-1, -1, DIAGONAL],
]

export interface Point {
    x: number
    y: number
}

export class NavGrid {
    readonly cols: number
    readonly rows: number
    readonly size: number
    /** Fixed walls only (arena edge and non-moving obstacles); 1 = an avatar does not fit. */
    private readonly fixedBlocked: Uint8Array
    /** Fixed walls plus the movers where they are now. */
    readonly blocked: Uint8Array
    /** Pocket depth in tenths of a unit: 0 on open floor, up to POCKET_CAP * UNIT deep in a dead end. */
    readonly exit: Int16Array
    /** Bumped every time the grid changes (movers re-stamped), so cached fields know they are stale. */
    version = 0
    private obstacleOnly = new Uint8Array(0)
    private readonly footprints: ReturnType<typeof uFootprints>
    private readonly movers: Obstacle[]
    private readonly scratch: Int16Array
    private readonly parent: Int32Array
    /** Index offsets of the eight neighbours (straight first), and of the two straight cells a diagonal cuts across. */
    private readonly steps: Int32Array
    private readonly sideA: Int32Array
    private readonly sideB: Int32Array
    private readonly buckets: Int32Array[]
    private readonly bucketLength = new Int32Array(BUCKETS)
    private fieldCache: {
        cell: number
        version: number
        dist: Int16Array
    } | null = null
    private readonly fieldBuffer: Int16Array
    /** A second field (obs spec 6): the seat's own distances, kept apart from the cached one. */
    private readonly ownBuffer: Int16Array
    private readonly extraBuffer: Int16Array

    constructor(readonly arena: Arena) {
        this.cols = Math.floor(arena.width / CELL)
        this.rows = Math.floor(arena.height / CELL)
        this.size = this.cols * this.rows
        const w = this.cols
        this.steps = Int32Array.of(1, -1, w, -w, 1 + w, 1 - w, -1 + w, -1 - w)
        this.sideA = Int32Array.of(1, 1, -1, -1)
        this.sideB = Int32Array.of(w, -w, w, -w)
        this.buckets = Array.from({ length: BUCKETS }, () => new Int32Array(this.cols * this.rows * 2))
        this.fixedBlocked = new Uint8Array(this.size)
        this.blocked = new Uint8Array(this.size)
        this.exit = new Int16Array(this.size)
        this.scratch = new Int16Array(this.size)
        this.parent = new Int32Array(this.size)
        this.fieldBuffer = new Int16Array(this.size)
        this.ownBuffer = new Int16Array(this.size)
        this.extraBuffer = new Int16Array(this.size)
        this.movers = arena.obstacles.filter(o => o.mover)
        this.footprints = uFootprints(arena)

        const r = AVATAR_RADIUS
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = (col + 0.5) * CELL
                const y = (row + 0.5) * CELL
                // One extra cell of margin keeps the two outermost rings blocked (see `flood`).
                if (x < r + CELL || y < r + CELL || x > arena.width - r - CELL || y > arena.height - r - CELL)
                    this.fixedBlocked[row * this.cols + col] = 1
            }
        }
        // Fixed obstacles alone (no arena-edge band) are what the pocket rays look at.
        this.obstacleOnly = new Uint8Array(this.size)
        for (const obstacle of arena.obstacles) if (!obstacle.mover) this.stamp(this.obstacleOnly, obstacle, 0)
        for (let cell = 0; cell < this.size; cell++) if (this.obstacleOnly[cell]) this.fixedBlocked[cell] = 1
        this.blocked.set(this.fixedBlocked)
        this.computePockets()
        this.refresh(0)
    }

    /** Re-stamps the movers for the given time. Cheap; a no-op on arenas without movers. */
    refresh(timeMs: number): void {
        if (this.movers.length === 0) return
        this.blocked.set(this.fixedBlocked)
        for (const mover of this.movers) this.stamp(this.blocked, mover, timeMs)
        this.version++
    }

    private stamp(grid: Uint8Array, obstacle: Obstacle, timeMs: number): void {
        // Only the part of the grid around where the obstacle is at this time.
        const o = { ...obstacleAt(obstacle, timeMs), mover: undefined }
        const box = sweptBox(o)
        const reach = AVATAR_RADIUS + CELL
        const col0 = Math.max(0, Math.floor((box.x - box.hw - reach) / CELL))
        const col1 = Math.min(this.cols - 1, Math.ceil((box.x + box.hw + reach) / CELL))
        const row0 = Math.max(0, Math.floor((box.y - box.hh - reach) / CELL))
        const row1 = Math.min(this.rows - 1, Math.ceil((box.y + box.hh + reach) / CELL))
        for (let row = row0; row <= row1; row++) {
            for (let col = col0; col <= col1; col++) {
                const point = { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL }
                if (contactWith(point, o, 0).distance < AVATAR_RADIUS) grid[row * this.cols + col] = 1
            }
        }
    }

    /** Index of the walkable cell nearest to a point (it may stand in a blocked cell), or -1. */
    cellOf(x: number, y: number): number {
        const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)))
        const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)))
        if (!this.blocked[row * this.cols + col]) return row * this.cols + col
        let best = -1
        let bestDistance = Infinity
        for (let dr = -3; dr <= 3; dr++) {
            for (let dc = -3; dc <= 3; dc++) {
                const c = col + dc
                const r = row + dr
                if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
                if (this.blocked[r * this.cols + c]) continue
                const distance = Math.hypot((c + 0.5) * CELL - x, (r + 0.5) * CELL - y)
                if (distance < bestDistance) {
                    bestDistance = distance
                    best = r * this.cols + c
                }
            }
        }
        return best
    }

    centre(cell: number): Point {
        const col = cell % this.cols
        return {
            x: (col + 0.5) * CELL,
            y: ((cell - col) / this.cols + 0.5) * CELL,
        }
    }

    private canStep(from: number, to: number, dc: number, dr: number): boolean {
        if (this.blocked[to]) return false
        if (dc !== 0 && dr !== 0) return !this.blocked[from + dc] && !this.blocked[from + dr * this.cols]
        return true
    }

    /**
     * Dijkstra over the walkable cells (Dial buckets, costs 5 and 7). Fills `dist` (UNREACHED where
     * the budget `maxDist` ran out) and `parent`. Stops early, returning the cell, as soon as
     * `isGoal` accepts a cell it settles; -1 when nothing was accepted.
     */
    private flood(
        sources: number[],
        maxDist: number,
        dist: Int16Array,
        isGoal: ((cell: number) => boolean) | null,
        blocked: Uint8Array = this.blocked
    ): number {
        dist.fill(UNREACHED)
        const { buckets, bucketLength: lengths, parent, steps, sideA, sideB } = this
        lengths.fill(0)
        let pending = 0
        for (const s of sources) {
            dist[s] = 0
            parent[s] = -1
            ;(buckets[0] as Int32Array)[lengths[0] as number] = s
            lengths[0] = (lengths[0] as number) + 1
            pending++
        }
        // Walkable cells are never in the outer two rings (the avatar does not fit there), so a walkable
        // cell's eight neighbours are always inside the grid: no bounds checks in this loop.
        for (let d = 0; pending > 0 && d <= maxDist; d++) {
            const slot = d % BUCKETS
            const bucket = buckets[slot] as Int32Array
            while ((lengths[slot] as number) > 0) {
                const cell = bucket[(lengths[slot] = (lengths[slot] as number) - 1)] as number
                pending--
                if (dist[cell] !== d) continue
                if (isGoal?.(cell)) return cell
                for (let k = 0; k < 8; k++) {
                    const next = cell + (steps[k] as number)
                    if (blocked[next] === 1) continue
                    const cost = k < 4 ? STRAIGHT : DIAGONAL
                    if (
                        k >= 4 &&
                        (blocked[cell + (sideA[k - 4] as number)] === 1 ||
                            blocked[cell + (sideB[k - 4] as number)] === 1)
                    )
                        continue
                    const nd = d + cost
                    if (nd > maxDist || nd >= (dist[next] as number)) continue
                    dist[next] = nd
                    parent[next] = cell
                    const into = nd % BUCKETS
                    ;(buckets[into] as Int32Array)[lengths[into] as number] = next
                    lengths[into] = (lengths[into] as number) + 1
                    pending++
                }
            }
        }
        return -1
    }

    /** Static pocket map: how far (geodesically) a cell is from floor that is open on most sides. */
    private computePockets(): void {
        const { cols, rows, fixedBlocked, obstacleOnly } = this
        const open: number[] = []
        const steps = Math.round(POCKET_RAY / CELL)
        const rays: Array<[number, number]> = Array.from({ length: 16 }, (_, i) => [
            Math.cos((i / 16) * Math.PI * 2),
            Math.sin((i / 16) * Math.PI * 2),
        ])
        // Summed-area table of the obstacles: cells with none within reach skip the rays.
        const stride = cols + 1
        const table = new Int32Array(stride * (rows + 1))
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++)
                table[(row + 1) * stride + col + 1] =
                    (obstacleOnly[row * cols + col] as number) +
                    (table[row * stride + col + 1] as number) +
                    (table[(row + 1) * stride + col] as number) -
                    (table[row * stride + col] as number)
        const around = (row: number, col: number) => {
            const c0 = Math.max(0, col - steps)
            const c1 = Math.min(cols, col + steps + 1)
            const r0 = Math.max(0, row - steps)
            const r1 = Math.min(rows, row + steps + 1)
            return (
                (table[r1 * stride + c1] as number) -
                (table[r0 * stride + c1] as number) -
                (table[r1 * stride + c0] as number) +
                (table[r0 * stride + c0] as number)
            )
        }
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cell = row * cols + col
                if (fixedBlocked[cell]) continue
                if (around(row, col) === 0) {
                    open.push(cell)
                    continue
                }
                let free = 0
                for (const [ux, uy] of rays) {
                    let clear = true
                    for (let k = 1; k <= steps; k++) {
                        const c = Math.floor(col + 0.5 + ux * k)
                        const r = Math.floor(row + 0.5 + uy * k)
                        // Beyond the arena edge counts as free: only obstacles make a pocket, not the border.
                        if (c < 0 || r < 0 || c >= cols || r >= rows) break
                        if (obstacleOnly[r * cols + c]) {
                            clear = false
                            break
                        }
                    }
                    if (clear) free++
                }
                if (free >= OPEN_RAYS) open.push(cell)
            }
        }
        const dist = this.scratch
        this.flood(open, POCKET_CAP * UNIT, dist, null, fixedBlocked)
        for (let cell = 0; cell < this.size; cell++)
            this.exit[cell] = fixedBlocked[cell] ? 0 : Math.min(dist[cell] as number, POCKET_CAP * UNIT)
    }

    /** Pocket depth under a point without snapping, in arena units (0 on open floor or in a wall). */
    pocketDepthAt(x: number, y: number): number {
        const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)))
        const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)))
        return (this.exit[row * this.cols + col] as number) / UNIT
    }

    /** Whether a point is inside the footprint (bounding box) of a U-shaped wall. */
    inU(x: number, y: number): boolean {
        return this.footprints.some(f => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1)
    }

    /** Pocket depth of the cell under a point, in arena units (0 on open floor). */
    pocketDepth(cell: number): number {
        return cell < 0 ? 0 : (this.exit[cell] as number) / UNIT
    }

    /** Number of walkable cells at least `depth` units deep in a pocket. */
    pocketCells(depth: number): number {
        let count = 0
        for (let cell = 0; cell < this.size; cell++)
            if (!this.fixedBlocked[cell] && (this.exit[cell] as number) >= depth * UNIT) count++
        return count
    }

    walkableCells(): number {
        let count = 0
        for (let cell = 0; cell < this.size; cell++) if (!this.fixedBlocked[cell]) count++
        return count
    }

    /** Unit vector from a cell to where steepest descent of `field` leads after `lookahead` units. */
    private descend(field: Int16Array, from: number, lookahead: number): { dx: number; dy: number } {
        let cell = from
        let travelled = 0
        const origin = this.centre(from)
        for (let guard = 0; guard < 64 && travelled < lookahead * UNIT; guard++) {
            const col = cell % this.cols
            const row = (cell - col) / this.cols
            let best = cell
            let bestValue = field[cell] as number
            let bestCost = 0
            for (const [dc, dr, cost] of NEIGHBOURS) {
                const c = col + dc
                const r = row + dr
                if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
                const next = r * this.cols + c
                if (!this.canStep(cell, next, dc, dr)) continue
                const value = field[next] as number
                if (value < bestValue) {
                    bestValue = value
                    best = next
                    bestCost = cost
                }
            }
            if (best === cell) break
            cell = best
            travelled += bestCost
        }
        return this.direction(origin, this.centre(cell))
    }

    private direction(from: Point, to: Point): { dx: number; dy: number } {
        const length = Math.hypot(to.x - from.x, to.y - from.y)
        return length < 1e-9 ? { dx: 0, dy: 0 } : { dx: (to.x - from.x) / length, dy: (to.y - from.y) / length }
    }

    /** Geodesic distance field from one cell, cached until the cell or the grid changes. */
    fieldFrom(cell: number, maxUnits: number): Int16Array {
        const cache = this.fieldCache
        if (cache && cache.cell === cell && cache.version === this.version) return cache.dist
        this.flood([cell], maxUnits * UNIT, this.fieldBuffer, null)
        this.fieldCache = { cell, version: this.version, dist: this.fieldBuffer }
        return this.fieldBuffer
    }

    /**
     * An uncached field from one cell into one of two spare buffers (`own`: the seat's own distances;
     * `extra`: a portal exit's). It overwrites the path tree: call `pathDirection` before it.
     */
    spareField(cell: number, maxUnits: number, which: 'own' | 'extra'): Int16Array {
        const buffer = which === 'own' ? this.ownBuffer : this.extraBuffer
        this.flood([cell], maxUnits * UNIT, buffer, null)
        return buffer
    }

    /**
     * Share of the floor the seat reaches before the threat (walking, both capped at the fields'
     * range): 1 when it owns every cell either of them reaches, 0 when the threat owns them all. Ties
     * split. The classic evader's measure: a corner leaves little floor that is yours.
     */
    territory(own: Int16Array, threat: Int16Array): number {
        let mine = 0
        let total = 0
        for (let cell = 0; cell < this.size; cell++) {
            const a = own[cell] as number
            const b = threat[cell] as number
            if (a >= UNREACHED && b >= UNREACHED) continue
            total++
            if (a < b) mine++
            else if (a === b) mine += 0.5
        }
        return total === 0 ? 0 : mine / total
    }

    /** Walkable cells within `units` of walking in a field, over the cells of a disc of that radius. */
    mobility(field: Int16Array, units: number): number {
        const limit = units * UNIT
        let count = 0
        for (let cell = 0; cell < this.size; cell++) if ((field[cell] as number) <= limit) count++
        return count / ((Math.PI * units * units) / (CELL * CELL))
    }

    /**
     * Unit vector along the first `lookahead` units of the shortest path from the source of the field
     * returned by the last `fieldFrom` call to `to` (zero when `to` was not reached).
     */
    pathDirection(source: Point, to: Point, lookahead = 3): { dx: number; dy: number } {
        const start = this.cellOf(source.x, source.y)
        let cell = this.cellOf(to.x, to.y)
        const field = this.fieldBuffer
        if (start < 0 || cell < 0 || (field[cell] as number) >= UNREACHED) return { dx: 0, dy: 0 }
        while ((this.parent[cell] as number) >= 0 && (field[this.parent[cell] as number] as number) >= lookahead * UNIT)
            cell = this.parent[cell] as number
        return this.direction(this.centre(start), this.centre(cell))
    }

    /** A field's value at a point, in arena units: bilinear between the four nearest cell centres. */
    sample(field: Int16Array, x: number, y: number): number {
        const gx = x / CELL - 0.5
        const gy = y / CELL - 0.5
        const c0 = Math.floor(gx)
        const r0 = Math.floor(gy)
        const tx = gx - c0
        const ty = gy - r0
        let sum = 0
        let weight = 0
        for (let dr = 0; dr <= 1; dr++) {
            for (let dc = 0; dc <= 1; dc++) {
                const c = c0 + dc
                const r = r0 + dr
                if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
                const value = field[r * this.cols + c] as number
                if (value >= UNREACHED) continue
                const w = (dc ? tx : 1 - tx) * (dr ? ty : 1 - ty)
                sum += w * value
                weight += w
            }
        }
        if (weight > 1e-9) return sum / weight / UNIT
        const cell = this.cellOf(x, y)
        const value = cell < 0 ? UNREACHED : (field[cell] as number)
        return value >= UNREACHED ? Infinity : value / UNIT
    }

    /** Geodesic distance (units) from `source` to a point, using the cached field of `source`. */
    distanceFrom(source: Point, to: Point, maxUnits: number): number {
        const a = this.cellOf(source.x, source.y)
        if (a < 0) return Infinity
        return this.sample(this.fieldFrom(a, maxUnits), to.x, to.y)
    }

    /** Direction of the first stretch of the shortest path from `from` toward the source of `field`. */
    towardSource(field: Int16Array, from: Point, lookahead = 3): { dx: number; dy: number } {
        const cell = this.cellOf(from.x, from.y)
        return cell < 0 ? { dx: 0, dy: 0 } : this.descend(field, cell, lookahead)
    }

    /**
     * Where to run to get away from a threat whose distance field is `threat`: steepest ascent of
     * `min(threat distance, 25) - 1.5 * pocket depth`, so a dead end that is far from the threat but
     * has no way out does not win. Zero when the current spot is already a local best.
     */
    escapeDirection(threat: Int16Array, from: Point, maxSteps = 16): { dx: number; dy: number } {
        const start = this.cellOf(from.x, from.y)
        if (start < 0) return { dx: 0, dy: 0 }
        const score = (cell: number) => {
            const t = threat[cell] as number
            return Math.min(t >= UNREACHED ? 25 * UNIT : t, 25 * UNIT) - 1.5 * (this.exit[cell] as number)
        }
        let cell = start
        for (let step = 0; step < maxSteps; step++) {
            const col = cell % this.cols
            const row = (cell - col) / this.cols
            let best = cell
            let bestScore = score(cell)
            for (const [dc, dr] of NEIGHBOURS) {
                const c = col + dc
                const r = row + dr
                if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
                const next = r * this.cols + c
                if (!this.canStep(cell, next, dc, dr)) continue
                const s = score(next)
                if (s > bestScore) {
                    bestScore = s
                    best = next
                }
            }
            if (best === cell) break
            cell = best
        }
        return this.direction(this.centre(start), this.centre(cell))
    }

    /** Direction out of a pocket: steepest descent of the pocket depth (zero on open floor). */
    exitDirection(from: Point, lookahead = 3): { dx: number; dy: number } {
        const cell = this.cellOf(from.x, from.y)
        if (cell < 0 || (this.exit[cell] as number) === 0) return { dx: 0, dy: 0 }
        return this.descend(this.exit, cell, lookahead)
    }
}

/** Bounding boxes of the U-shaped walls (three blocks of one group): the pocket and its arms. */
export function uFootprints(arena: Arena): Array<{ x0: number; y0: number; x1: number; y1: number }> {
    const groups = new Map<number, Obstacle[]>()
    for (const obstacle of arena.obstacles)
        if (obstacle.group !== undefined) groups.set(obstacle.group, [...(groups.get(obstacle.group) ?? []), obstacle])
    return [...groups.values()]
        .filter(blocks => blocks.length === 3)
        .map(blocks => {
            const boxes = blocks.map(b => sweptBox(b))
            return {
                x0: Math.min(...boxes.map(b => b.x - b.hw)),
                y0: Math.min(...boxes.map(b => b.y - b.hh)),
                x1: Math.max(...boxes.map(b => b.x + b.hw)),
                y1: Math.max(...boxes.map(b => b.y + b.hh)),
            }
        })
}

/** Walls made of three blocks (a U) in an arena. */
export function uWallCount(arena: Arena): number {
    const sizes = new Map<number, number>()
    for (const obstacle of arena.obstacles)
        if (obstacle.group !== undefined) sizes.set(obstacle.group, (sizes.get(obstacle.group) ?? 0) + 1)
    return [...sizes.values()].filter(count => count === 3).length
}

/** Furthest geodesic distance a query looks for a target (arena units). */
export const NAV_RANGE = 30
/** Obs spec 6: the floor within this walk of the seat is its "room to move". */
export const MOBILITY_RANGE = 6

/** What one seat's navigation queries say right now (all distances in arena units). */
export interface SeatNav {
    /** Walking distance to the target: the holder, or the nearest living player when holding. Null: no target. */
    targetDistance: number | null
    /** Straight-line distance to the same target. */
    targetEuclid: number
    /** First stretch of the shortest walk to the target (unit vector, zero when none). */
    pathDx: number
    pathDy: number
    /** Where to run to get away from the holder; zero when holding or already clear. */
    fleeDx: number
    fleeDy: number
    /** How deep in a concave pocket the seat stands, and the way out. */
    pocketDepth: number
    exitDx: number
    exitDy: number
    /** Obs spec 6: share of the floor reached before the holder (not holding; 0 otherwise). */
    territory: number
    /** Obs spec 6: walkable floor within MOBILITY_RANGE of walking, over a free disc of that radius. */
    mobility: number
    /** Obs spec 6: walking distance to the nearer end of the open portal (null: none, or out of range). */
    portalWalk: number | null
    /**
     * Obs spec 6: what going through the portal gains, in walking units (capped at the range):
     * not holding, how much farther from the holder its far end is than the seat; holding, how much
     * nearer the nearest player. Zero without a portal.
     */
    portalGain: number
}

const ZERO_NAV: SeatNav = {
    targetDistance: null,
    targetEuclid: 0,
    pathDx: 0,
    pathDy: 0,
    fleeDx: 0,
    fleeDy: 0,
    pocketDepth: 0,
    exitDx: 0,
    exitDy: 0,
    territory: 0,
    mobility: 0,
    portalWalk: null,
    portalGain: 0,
}

/** The open portal's end nearer to a point, and the other one; null when none is open. */
export function nearestPortal(
    game: GameState,
    x: number,
    y: number
): { near: Point; far: Point; expiresAtMs: number } | null {
    let best: { near: Point; far: Point; expiresAtMs: number } | null = null
    let bestDistance = Infinity
    for (const portal of game.portals ?? []) {
        for (const [near, far] of [
            [portal.a, portal.b],
            [portal.b, portal.a],
        ] as const) {
            const distance = Math.hypot(near.x - x, near.y - y)
            if (distance < bestDistance) {
                bestDistance = distance
                best = { near, far, expiresAtMs: portal.expiresAtMs }
            }
        }
    }
    return best
}

const capped = (units: number) => (Number.isFinite(units) ? Math.min(units, NAV_RANGE + 10) : NAV_RANGE + 10)

/** Obs spec 6 queries that need the seat's own field (call after the path queries). */
function ownQueries(
    grid: NavGrid,
    game: GameState,
    me: { x: number; y: number },
    nav: SeatNav,
    /** Not holding: the holder's field. Holding: the living others, for the portal gain. */
    threat: Int16Array | null,
    targets: ReadonlyArray<{ x: number; y: number }>
): void {
    const cell = grid.cellOf(me.x, me.y)
    if (cell < 0) return
    const own = grid.spareField(cell, NAV_RANGE + 10, 'own')
    nav.mobility = Math.min(1, grid.mobility(own, MOBILITY_RANGE))
    if (threat) nav.territory = grid.territory(own, threat)
    const portal = nearestPortal(game, me.x, me.y)
    if (!portal) return
    const walk = grid.sample(own, portal.near.x, portal.near.y)
    nav.portalWalk = Number.isFinite(walk) ? walk : null
    if (threat) {
        nav.portalGain =
            capped(grid.sample(threat, portal.far.x, portal.far.y)) - capped(grid.sample(threat, me.x, me.y))
        return
    }
    if (targets.length === 0) return
    const exitCell = grid.cellOf(portal.far.x, portal.far.y)
    if (exitCell < 0) return
    const exitField = grid.spareField(exitCell, NAV_RANGE + 10, 'extra')
    const fromHere = Math.min(...targets.map(t => capped(grid.sample(own, t.x, t.y))))
    const fromExit = Math.min(...targets.map(t => capped(grid.sample(exitField, t.x, t.y))))
    nav.portalGain = fromHere - fromExit
}

/** Runs this seat's navigation queries on the grid as it stands (call `refresh` first). */
export function computeSeatNav(grid: NavGrid, game: GameState, seat: number): SeatNav {
    // By id, not by index: in a live game the seats need not be 0..n-1.
    const me = game.players.find(p => p.id === seat)
    if (!me || me.out) return ZERO_NAV
    const exit = grid.exitDirection(me)
    const nav: SeatNav = {
        ...ZERO_NAV,
        pocketDepth: grid.pocketDepthAt(me.x, me.y),
        exitDx: exit.dx,
        exitDy: exit.dy,
    }
    if (game.holderId === null) {
        ownQueries(grid, game, me, nav, null, [])
        return nav
    }
    if (game.holderId === seat) {
        const targets = game.players.filter(p => p.id !== seat && !p.out)
        if (targets.length === 0) {
            ownQueries(grid, game, me, nav, null, [])
            return nav
        }
        nav.targetEuclid = Math.min(...targets.map(p => Math.hypot(p.x - me.x, p.y - me.y)))
        // Walk out from the holder's own cell and read the field at each target (smooth in the targets' moves).
        const source = grid.cellOf(me.x, me.y)
        if (source < 0) return nav
        const field = grid.fieldFrom(source, NAV_RANGE + 10)
        let nearest = targets[0] as (typeof targets)[number]
        nav.targetDistance = Infinity
        for (const target of targets) {
            const distance = grid.sample(field, target.x, target.y)
            if (distance < nav.targetDistance) {
                nav.targetDistance = distance
                nearest = target
            }
        }
        const path = grid.pathDirection(me, nearest)
        nav.pathDx = path.dx
        nav.pathDy = path.dy
        // The field starts at the centre of the holder's cell: undo the offset to first order, so the
        // distance moves smoothly with the holder instead of in half-unit jumps.
        const centre = grid.centre(source)
        nav.targetDistance = Math.max(
            0,
            nav.targetDistance - ((me.x - centre.x) * path.dx + (me.y - centre.y) * path.dy)
        )
        ownQueries(grid, game, me, nav, null, targets)
        return nav
    }
    const holder = game.players.find(p => p.id === game.holderId)
    const source = holder ? grid.cellOf(holder.x, holder.y) : -1
    if (!holder || source < 0) {
        ownQueries(grid, game, me, nav, null, [])
        return nav
    }
    const field = grid.fieldFrom(source, NAV_RANGE + 10)
    const distance = grid.distanceFrom(holder, me, NAV_RANGE + 10)
    const path = grid.towardSource(field, me)
    const flee = grid.escapeDirection(field, me)
    const centre = grid.centre(source)
    nav.targetDistance = Math.max(0, distance + ((holder.x - centre.x) * path.dx + (holder.y - centre.y) * path.dy))
    nav.targetEuclid = Math.hypot(holder.x - me.x, holder.y - me.y)
    nav.pathDx = path.dx
    nav.pathDy = path.dy
    nav.fleeDx = flee.dx
    nav.fleeDy = flee.dy
    ownQueries(grid, game, me, nav, field, [])
    return nav
}

/** Last N tick positions of one seat, for the "how far did I really get" features. */
export class MotionHistory {
    static readonly CAPACITY = 41
    private readonly xs: Float64Array
    private readonly ys: Float64Array
    private count = 0
    private head = 0
    constructor(
        x: number,
        y: number,
        readonly capacity = MotionHistory.CAPACITY
    ) {
        this.xs = new Float64Array(capacity)
        this.ys = new Float64Array(capacity)
        this.push(x, y)
    }

    push(x: number, y: number): void {
        this.head = (this.head + 1) % this.capacity
        this.xs[this.head] = x
        this.ys[this.head] = y
        this.count = Math.min(this.count + 1, this.capacity)
    }

    /** The position `ticks` ticks ago (the oldest known when the history is shorter). */
    ago(ticks: number): Point {
        const back = Math.min(ticks, this.count - 1)
        const i = (this.head - back + this.capacity) % this.capacity
        return { x: this.xs[i] as number, y: this.ys[i] as number }
    }

    /** Ticks of history available (at least 1). */
    get ticks(): number {
        return this.count - 1
    }

    /** Move since `ticks` ticks ago (since the oldest known position when the history is shorter). */
    displacement(ticks: number): { dx: number; dy: number } {
        const back = Math.min(ticks, this.count - 1)
        const then = (this.head - back + this.capacity) % this.capacity
        return {
            dx: (this.xs[this.head] as number) - (this.xs[then] as number),
            dy: (this.ys[this.head] as number) - (this.ys[then] as number),
        }
    }
}

/** Obs spec 6: ten seconds of positions, one per 50 ms tick (long motion memory). */
export const LONG_HISTORY_TICKS = 200

export function longHistory(x: number, y: number): MotionHistory {
    return new MotionHistory(x, y, LONG_HISTORY_TICKS + 1)
}

/**
 * Obs spec 6: when the seat last stood in each square of a coarse grid over the arena (VISIT_CELL
 * units), so a policy sees where it has just been and where it has not.
 */
export const VISIT_CELL = 4
export const VISIT_HALF_LIFE_MS = 10_000

export class VisitMap {
    readonly cols: number
    readonly rows: number
    private readonly last: Float64Array

    constructor(width: number, height: number) {
        this.cols = Math.max(1, Math.ceil(width / VISIT_CELL))
        this.rows = Math.max(1, Math.ceil(height / VISIT_CELL))
        this.last = new Float64Array(this.cols * this.rows).fill(-Infinity)
    }

    private index(col: number, row: number): number {
        return col < 0 || row < 0 || col >= this.cols || row >= this.rows ? -1 : row * this.cols + col
    }

    visit(x: number, y: number, timeMs: number): void {
        const i = this.index(Math.floor(x / VISIT_CELL), Math.floor(y / VISIT_CELL))
        if (i >= 0) this.last[i] = timeMs
    }

    /**
     * The 3 × 3 squares around the seat's own, row by row from the top left: 2^(−age / half-life) of
     * the last visit (1 = just now, 0 = never), −1 beyond the arena.
     */
    patch(x: number, y: number, timeMs: number): number[] {
        const col = Math.floor(x / VISIT_CELL)
        const row = Math.floor(y / VISIT_CELL)
        const out: number[] = []
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                const i = this.index(col + dc, row + dr)
                if (i < 0) out.push(-1)
                else {
                    const last = this.last[i] as number
                    out.push(last === -Infinity ? 0 : 2 ** (-Math.max(0, timeMs - last) / VISIT_HALF_LIFE_MS))
                }
            }
        return out
    }
}
