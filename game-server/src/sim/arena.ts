import { contactWith, gapBetween, type Obstacle, sweptBox, type Vec } from './geometry.ts'
import { createRng, pickOne, randomBetween, type Rng } from './rng.ts'
import { type ObstacleShape, THEMES, type Theme, type ThemeId, type WallKind } from './themes.ts'

export const AVATAR_RADIUS = 1
/** Narrowest passage anywhere: three avatar diameters, so nobody gets wedged. */
export const MIN_GAP = 6 * AVATAR_RADIUS
/** Floor kept between any obstacle and the arena walls: two avatars side by side. */
export const EDGE_GAP = 4 * AVATAR_RADIUS
/** No obstacle surface closer than this to a spawn point. */
export const SPAWN_CLEARANCE = 4

/** Boost pads: roll over one and it launches you its way. */
export const PAD_RADIUS = 1
/** Open floor a pad needs in front of it, so it never fires you straight into a wall. */
export const PAD_RUNWAY = 8
export const PAD_SPACING = 8
/** Pads keep this much floor around them, clear of obstacles and the arena walls. */
export const PAD_CLEARANCE = 2.5
const PAD_COUNT: [number, number] = [2, 4]

const ATTEMPTS_PER_OBSTACLE = 50
const GRID_STEP = 0.5

/** A boost pad on the floor; (dx, dy) is the unit direction it launches you in. */
export interface Pad {
    x: number
    y: number
    dx: number
    dy: number
}

export interface Arena {
    seed: number
    theme: ThemeId
    width: number
    height: number
    obstacles: Obstacle[]
    pads: Pad[]
    /** One per player, in join order. */
    spawns: Vec[]
}

interface Field {
    width: number
    height: number
}

/**
 * Builds a fresh, fair arena. Deterministic: the same inputs always give the
 * same arena, so the server only needs to pick a seed.
 *
 * The theme's walls (L, T and U shapes) and movers go down first, taking
 * turns, then its loose furniture, then the boost pads. Fairness comes from construction:
 * obstacles (a mover's whole sweep, each block of a wall) keep MIN_GAP from
 * each other and EDGE_GAP from the arena walls, and a U is at least MIN_GAP wide
 * inside, so every bit of floor stays reachable. Anything that cannot be
 * placed after ATTEMPTS_PER_OBSTACLE tries is dropped, which is how
 * generation always returns.
 */
export function generateArena(seed: number, themeId: ThemeId, playerCount: number): Arena {
    const theme = THEMES[themeId]
    const rng = createRng(seed)
    const scale = Math.min(1, Math.max(0, (playerCount - 3) / 9))
    const width = 40 + 24 * scale
    const height = Math.round(((width * 10) / 16) * 2) / 2
    const field = { width, height }
    const spawns = placeSpawns(rng, width, height, playerCount)
    const obstacles: Obstacle[] = []

    // Walls and movers take turns, so a big arena never spends all its room on one kind.
    const walls = scaled(theme.walls.count, scale)
    const movers = scaled(theme.movers.count, scale)
    for (let i = 0; i < Math.max(walls, movers); i++) {
        const mover = i < movers ? tryPlace(() => randomMover(rng, theme, field), obstacles, spawns, field) : null
        if (mover) obstacles.push(...mover)

        const wall = i < walls ? tryPlace(() => randomWall(rng, theme, field, i + 1), obstacles, spawns) : null
        if (wall) obstacles.push(...wall)
    }

    const furniture = Math.round((4 + 6 * scale) * theme.density)
    for (let i = 0; i < furniture; i++) {
        const placed = tryPlace(() => randomObstacle(rng, theme.shapes, field), obstacles, spawns)
        if (!placed) break
        obstacles.push(...placed)
    }

    const pads = placePads(rng, field, obstacles, spawns, scaled(PAD_COUNT, scale))

    return { seed, theme: themeId, width, height, obstacles, pads, spawns }
}

function scaled([min, max]: [number, number], scale: number): number {
    return Math.round(min + (max - min) * scale)
}

/** Even spacing on an ellipse at 70% of the field, from a random starting angle. */
function placeSpawns(rng: Rng, width: number, height: number, count: number): Vec[] {
    const start = rng() * Math.PI * 2

    return Array.from({ length: count }, (_, i) => {
        const angle = start + (i / count) * Math.PI * 2

        return {
            x: width / 2 + Math.cos(angle) * width * 0.35,
            y: height / 2 + Math.sin(angle) * height * 0.35,
        }
    })
}

/** One of the theme's movers, sliding on either axis, its whole sweep inside the arena. */
function randomMover(rng: Rng, theme: Theme, field: Field): Obstacle[] {
    const body: Obstacle = {
        ...sized(rng, theme.movers.shape),
        mover: {
            axis: rng() < 0.5 ? 'x' : 'y',
            amplitude: randomBetween(rng, 2.5, 4),
            periodMs: Math.round(randomBetween(rng, 5000, 9000)),
        },
    }

    return [within(rng, body, field)]
}

/**
 * Tries a candidate (one obstacle, or every block of a wall) until one fits
 * or the attempts run out.
 */
function tryPlace(
    make: () => Obstacle[] | null,
    placed: Obstacle[],
    spawns: Vec[],
    field: Field | null = null
): Obstacle[] | null {
    for (let attempt = 0; attempt < ATTEMPTS_PER_OBSTACLE; attempt++) {
        const candidate = make()
        if (!candidate) continue
        if (field && !candidate.every(o => inBounds(o, field))) continue
        if (fits(candidate, placed, spawns)) return candidate
    }

    return null
}

function randomObstacle(rng: Rng, shapes: ObstacleShape[], field: Field): Obstacle[] | null {
    const body: Obstacle = sized(rng, weightedShape(rng, shapes))
    const box = sweptBox(body)
    if (field.width - 2 * (EDGE_GAP + box.hw) < 0 || field.height - 2 * (EDGE_GAP + box.hh) < 0) return null

    return [within(rng, body, field)]
}

/** An obstacle of the given shape at a random size, positioned at the origin. */
function sized(rng: Rng, shape: ObstacleShape): Obstacle {
    if (shape.kind === 'circle') return { kind: 'circle', x: 0, y: 0, r: randomBetween(rng, shape.r[0], shape.r[1]) }

    let w = randomBetween(rng, shape.w[0], shape.w[1])
    let h = randomBetween(rng, shape.h[0], shape.h[1])
    if (shape.rotatable && rng() < 0.5) [w, h] = [h, w]

    return { kind: 'rect', x: 0, y: 0, w, h }
}

/** Moves an obstacle to a random spot whose whole sweep keeps EDGE_GAP from the arena walls. */
function within(rng: Rng, body: Obstacle, field: Field): Obstacle {
    const box = sweptBox(body)

    return {
        ...body,
        x: randomBetween(rng, EDGE_GAP + box.hw, field.width - EDGE_GAP - box.hw),
        y: randomBetween(rng, EDGE_GAP + box.hh, field.height - EDGE_GAP - box.hh),
    }
}

interface Block {
    x: number
    y: number
    w: number
    h: number
}

/**
 * An L, T or U wall: blocks that touch but never overlap, turned a random
 * quarter, with its whole outline EDGE_GAP inside the arena walls.
 */
function randomWall(rng: Rng, theme: Theme, field: Field, group: number): Obstacle[] | null {
    const kind = pickOne(rng, theme.walls.kinds)
    const turns = Math.floor(rng() * 4)
    const blocks = wallBlocks(kind, theme.walls.thickness, rng).map(block => turn(block, turns))

    const left = Math.min(...blocks.map(b => b.x - b.w / 2))
    const right = Math.max(...blocks.map(b => b.x + b.w / 2))
    const top = Math.min(...blocks.map(b => b.y - b.h / 2))
    const bottom = Math.max(...blocks.map(b => b.y + b.h / 2))
    const minX = EDGE_GAP - left
    const maxX = field.width - EDGE_GAP - right
    const minY = EDGE_GAP - top
    const maxY = field.height - EDGE_GAP - bottom
    if (minX > maxX || minY > maxY) return null

    const x = randomBetween(rng, minX, maxX)
    const y = randomBetween(rng, minY, maxY)

    return blocks.map(b => ({ kind: 'rect', x: b.x + x, y: b.y + y, w: b.w, h: b.h, group }))
}

/** A wall's blocks around its own origin, before turning. A U is always at least MIN_GAP wide inside. */
export function wallBlocks(kind: WallKind, thickness: number, rng: Rng): Block[] {
    const t = thickness
    const arm = randomBetween(rng, 2.5, 5)

    if (kind === 'U') {
        const base = randomBetween(rng, MIN_GAP + 2 * t + 0.5, MIN_GAP + 2 * t + 2)
        return [
            { x: 0, y: t / 2, w: base, h: t },
            { x: -base / 2 + t / 2, y: -arm / 2, w: t, h: arm },
            { x: base / 2 - t / 2, y: -arm / 2, w: t, h: arm },
        ]
    }

    const bar = randomBetween(rng, 6, 10)
    if (kind === 'T') {
        return [
            { x: 0, y: t / 2, w: bar, h: t },
            { x: 0, y: t + arm / 2, w: t, h: arm },
        ]
    }

    return [
        { x: 0, y: t / 2, w: bar, h: t },
        { x: -bar / 2 + t / 2, y: t + arm / 2, w: t, h: arm },
    ]
}

/** A quarter turn at a time about the origin; rectangles stay axis-aligned. */
function turn(block: Block, turns: number): Block {
    let b = block
    for (let i = 0; i < turns; i++) b = { x: -b.y, y: b.x, w: b.h, h: b.w }

    return b
}

function weightedShape(rng: Rng, shapes: ObstacleShape[]): ObstacleShape {
    const total = shapes.reduce((sum, s) => sum + s.weight, 0)
    let roll = rng() * total

    for (const shape of shapes) {
        roll -= shape.weight
        if (roll < 0) return shape
    }

    const last = shapes[shapes.length - 1]
    if (!last) throw new Error('A theme needs at least one obstacle shape')

    return last
}

/** Whether an obstacle's whole sweep keeps EDGE_GAP from the arena walls. */
function inBounds(o: Obstacle, field: Field): boolean {
    const box = sweptBox(o)

    return (
        box.x - box.hw >= EDGE_GAP - 1e-9 &&
        box.y - box.hh >= EDGE_GAP - 1e-9 &&
        box.x + box.hw <= field.width - EDGE_GAP + 1e-9 &&
        box.y + box.hh <= field.height - EDGE_GAP + 1e-9
    )
}

function fits(candidate: Obstacle[], placed: Obstacle[], spawns: Vec[]): boolean {
    return candidate.every(
        block =>
            placed.every(other => gapBetween(block, other) >= MIN_GAP) &&
            spawns.every(spawn => clearance(spawn, block) >= SPAWN_CLEARANCE)
    )
}

const DIAGONAL = Math.SQRT1_2
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [DIAGONAL, DIAGONAL],
    [DIAGONAL, -DIAGONAL],
    [-DIAGONAL, DIAGONAL],
    [-DIAGONAL, -DIAGONAL],
]

/**
 * Boost pads on open floor: clear of obstacles, spawns and each other, each
 * pointing down a runway of open floor so it never fires you into a wall.
 */
function placePads(rng: Rng, field: Field, obstacles: Obstacle[], spawns: Vec[], count: number): Pad[] {
    const pads: Pad[] = []
    const margin = PAD_CLEARANCE + PAD_RADIUS

    for (let attempt = 0; attempt < count * ATTEMPTS_PER_OBSTACLE && pads.length < count; attempt++) {
        const spot = {
            x: randomBetween(rng, margin, field.width - margin),
            y: randomBetween(rng, margin, field.height - margin),
        }
        if (obstacles.some(o => clearance(spot, o) < margin)) continue
        if (spawns.some(s => Math.hypot(s.x - spot.x, s.y - spot.y) < SPAWN_CLEARANCE + PAD_RADIUS)) continue
        if (pads.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < PAD_SPACING)) continue

        const open = DIRECTIONS.filter(([dx, dy]) => runwayIsClear(spot, dx, dy, field, obstacles))
        if (open.length === 0) continue

        const [dx, dy] = pickOne(rng, open)
        pads.push({ x: spot.x, y: spot.y, dx, dy })
    }

    return pads
}

/** The floor ahead of a pad: inside the walls and clear of every obstacle's sweep, all the way down. */
export function runwayIsClear(from: Vec, dx: number, dy: number, field: Field, obstacles: Obstacle[]): boolean {
    const r = AVATAR_RADIUS

    for (let d = 0.5; d <= PAD_RUNWAY; d += 0.5) {
        const point = { x: from.x + dx * d, y: from.y + dy * d }
        if (point.x < r || point.y < r || point.x > field.width - r || point.y > field.height - r) return false
        if (obstacles.some(o => clearance(point, o) < r + 0.5)) return false
    }

    return true
}

/** Distance from a point to everywhere the obstacle can ever be. */
export function clearance(point: Vec, obstacle: Obstacle): number {
    if (!obstacle.mover) return contactWith(point, obstacle, 0).distance

    const box = sweptBox(obstacle)

    return contactWith(point, { kind: 'rect', x: box.x, y: box.y, w: box.hw * 2, h: box.hh * 2 }, 0).distance
}

/**
 * Independent check that every bit of floor an avatar fits on can be reached
 * from every spawn, by flood-filling a grid. Used by tests, not at runtime:
 * the generator's spacing rules already guarantee it.
 */
export function isReachable(arena: Arena): boolean {
    const cols = Math.floor(arena.width / GRID_STEP)
    const rows = Math.floor(arena.height / GRID_STEP)
    const free = new Uint8Array(cols * rows)
    let freeCount = 0

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const point = { x: (col + 0.5) * GRID_STEP, y: (row + 0.5) * GRID_STEP }
            if (avatarFits(arena, point)) {
                free[row * cols + col] = 1
                freeCount++
            }
        }
    }

    const first = arena.spawns[0]
    if (!first) return true

    const startIndex = Math.floor(first.y / GRID_STEP) * cols + Math.floor(first.x / GRID_STEP)
    if (!free[startIndex]) return false

    const seen = new Uint8Array(cols * rows)
    const queue = [startIndex]
    seen[startIndex] = 1
    let reached = 0

    while (queue.length > 0) {
        const index = queue.pop() as number
        reached++
        const col = index % cols
        const row = (index - col) / cols

        for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ] as const) {
            const c = col + dc
            const r = row + dr
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue
            const next = r * cols + c
            if (free[next] && !seen[next]) {
                seen[next] = 1
                queue.push(next)
            }
        }
    }

    const spawnsReached = arena.spawns.every(spawn => {
        const index = Math.floor(spawn.y / GRID_STEP) * cols + Math.floor(spawn.x / GRID_STEP)
        return seen[index] === 1
    })

    return spawnsReached && reached === freeCount
}

function avatarFits(arena: Arena, point: Vec): boolean {
    const r = AVATAR_RADIUS
    if (point.x < r || point.y < r || point.x > arena.width - r || point.y > arena.height - r) return false

    return arena.obstacles.every(obstacle => clearance(point, obstacle) >= r)
}
