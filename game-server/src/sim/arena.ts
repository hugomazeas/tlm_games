import { contactWith, gapBetween, type Obstacle, sweptBox, type Vec } from './geometry.ts'
import { createRng, randomBetween, type Rng } from './rng.ts'
import { type ObstacleShape, THEMES, type ThemeId } from './themes.ts'

export const AVATAR_RADIUS = 1
/** Narrowest passage anywhere: three avatar diameters, so nobody gets wedged. */
export const MIN_GAP = 6 * AVATAR_RADIUS
/** No obstacle surface closer than this to a spawn point. */
export const SPAWN_CLEARANCE = 4

const ATTEMPTS_PER_OBSTACLE = 50
const GRID_STEP = 0.5

export interface Arena {
    seed: number
    theme: ThemeId
    width: number
    height: number
    obstacles: Obstacle[]
    /** One per player, in join order. */
    spawns: Vec[]
}

/**
 * Builds a fresh, fair arena. Deterministic: the same inputs always give the
 * same arena, so the server only needs to pick a seed.
 *
 * Fairness comes from construction: obstacles keep MIN_GAP from the walls and
 * from each other, and are convex, so the free floor is always one connected
 * piece. An obstacle that cannot be placed after ATTEMPTS_PER_OBSTACLE tries
 * is dropped, which is how generation always returns.
 */
export function generateArena(seed: number, themeId: ThemeId, playerCount: number): Arena {
    const theme = THEMES[themeId]
    const rng = createRng(seed)
    const scale = Math.min(1, Math.max(0, (playerCount - 3) / 9))
    const width = 40 + 24 * scale
    const height = Math.round(((width * 10) / 16) * 2) / 2
    const spawns = placeSpawns(rng, width, height, playerCount)
    const obstacles: Obstacle[] = []

    if (theme.mover) {
        obstacles.push(centreMover(rng, theme.shapes, width, height))
    }

    const target = Math.round((6 + 8 * scale) * theme.density)

    while (obstacles.length < target) {
        const placed = tryPlace(rng, theme.shapes, width, height, obstacles, spawns)
        if (!placed) break
        obstacles.push(placed)
    }

    return { seed, theme: themeId, width, height, obstacles, spawns }
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

/**
 * The drifting table sits in the middle and slides along the long axis, the
 * one place guaranteed to stay clear of the spawn ellipse.
 */
function centreMover(rng: Rng, shapes: ObstacleShape[], width: number, height: number): Obstacle {
    const shape = shapes.find(s => s.kind === 'rect')
    const w = shape?.kind === 'rect' ? shape.w[0] : 5
    const h = shape?.kind === 'rect' ? shape.h[0] : 2.8

    return {
        kind: 'rect',
        x: width / 2,
        y: height / 2,
        w,
        h,
        mover: { axis: 'x', amplitude: 5, periodMs: Math.round(randomBetween(rng, 6000, 9000)) },
    }
}

function tryPlace(
    rng: Rng,
    shapes: ObstacleShape[],
    width: number,
    height: number,
    placed: Obstacle[],
    spawns: Vec[]
): Obstacle | null {
    for (let attempt = 0; attempt < ATTEMPTS_PER_OBSTACLE; attempt++) {
        const candidate = randomObstacle(rng, shapes, width, height)
        if (candidate && fits(candidate, placed, spawns)) return candidate
    }

    return null
}

function randomObstacle(rng: Rng, shapes: ObstacleShape[], width: number, height: number): Obstacle | null {
    const shape = weightedShape(rng, shapes)
    let hw: number
    let hh: number
    let build: (x: number, y: number) => Obstacle

    if (shape.kind === 'circle') {
        const r = randomBetween(rng, shape.r[0], shape.r[1])
        hw = r
        hh = r
        build = (x, y) => ({ kind: 'circle', x, y, r })
    } else {
        let w = randomBetween(rng, shape.w[0], shape.w[1])
        let h = randomBetween(rng, shape.h[0], shape.h[1])
        if (shape.rotatable && rng() < 0.5) [w, h] = [h, w]
        hw = w / 2
        hh = h / 2
        build = (x, y) => ({ kind: 'rect', x, y, w, h })
    }

    const minX = MIN_GAP + hw
    const maxX = width - MIN_GAP - hw
    const minY = MIN_GAP + hh
    const maxY = height - MIN_GAP - hh
    if (minX > maxX || minY > maxY) return null

    return build(randomBetween(rng, minX, maxX), randomBetween(rng, minY, maxY))
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

function fits(candidate: Obstacle, placed: Obstacle[], spawns: Vec[]): boolean {
    if (placed.some(other => gapBetween(candidate, other) < MIN_GAP)) return false

    return spawns.every(spawn => clearance(spawn, candidate) >= SPAWN_CLEARANCE)
}

/** Distance from a point to everywhere the obstacle can ever be. */
function clearance(point: Vec, obstacle: Obstacle): number {
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
