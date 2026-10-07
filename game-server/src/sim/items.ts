import { type Arena, AVATAR_RADIUS } from './arena.ts'
import { contactWith, type Obstacle, sweptBox, type Vec } from './geometry.ts'
import { pickOne, randomBetween, type Rng } from './rng.ts'

/** A mystery box turns into one of the others when someone takes it. */
export type ItemKind = 'shield' | 'speed' | 'banana' | 'mystery'
export type Effect = Exclude<ItemKind, 'mystery'>

export interface Item {
    id: number
    kind: ItemKind
    x: number
    y: number
    expiresAtMs: number
}

export const ITEM_RADIUS = 0.6
export const FIRST_ITEM_MS = 10_000
export const ITEM_INTERVAL_MIN_MS = 12_000
export const ITEM_INTERVAL_MAX_MS = 20_000
export const MAX_ITEMS = 3
/** An item nobody takes disappears after this long. */
export const ITEM_LIFETIME_MS = 15_000

/** While shielded, the holder can't hand you the potato. */
export const SHIELD_MS = 5000
export const SPEED_MS = 4000
/** Top speed and acceleration while boosted; multiplies the holder's own boost. */
export const SPEED_BOOST = 1.35
/** A banana takes your controls and your grip for this long. */
export const SLIP_MS = 1500

/** Items land on open floor, never hugging an obstacle, a wall or a player. */
export const OBSTACLE_CLEARANCE = 2
export const PLAYER_CLEARANCE = 3
const ITEM_SPACING = 2
const SPOT_ATTEMPTS = 30

const EFFECTS: readonly Effect[] = ['shield', 'speed', 'banana']
const WEIGHTS: ReadonlyArray<[ItemKind, number]> = [
    ['shield', 0.3],
    ['speed', 0.3],
    ['banana', 0.25],
    ['mystery', 0.15],
]

export function nextItemDelay(rng: Rng): number {
    return Math.round(randomBetween(rng, ITEM_INTERVAL_MIN_MS, ITEM_INTERVAL_MAX_MS))
}

export function pickKind(rng: Rng): ItemKind {
    let roll = rng()
    for (const [kind, weight] of WEIGHTS) {
        roll -= weight
        if (roll < 0) return kind
    }

    return 'shield'
}

/** What an item does once taken: itself, or a random one for a mystery box. */
export function reveal(kind: ItemKind, rng: Rng): Effect {
    return kind === 'mystery' ? pickOne(rng, EFFECTS) : kind
}

/**
 * A random spot of open floor for a new item, or null when none turned up:
 * clear of walls, obstacles (a mover's whole sweep), players and other items.
 */
export function findItemSpot(arena: Arena, players: readonly Vec[], items: readonly Vec[], rng: Rng): Vec | null {
    const margin = OBSTACLE_CLEARANCE + ITEM_RADIUS

    for (let attempt = 0; attempt < SPOT_ATTEMPTS; attempt++) {
        const spot = {
            x: randomBetween(rng, margin, arena.width - margin),
            y: randomBetween(rng, margin, arena.height - margin),
        }

        if (arena.obstacles.some(o => distanceToSweep(spot, o) < margin)) continue
        if (players.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < PLAYER_CLEARANCE + AVATAR_RADIUS)) continue
        if (items.some(i => Math.hypot(i.x - spot.x, i.y - spot.y) < ITEM_SPACING + 2 * ITEM_RADIUS)) continue

        return spot
    }

    return null
}

/** Distance to everywhere an obstacle can ever be, so a mover never sweeps over an item. */
function distanceToSweep(point: Vec, obstacle: Obstacle): number {
    if (!obstacle.mover) return contactWith(point, obstacle, 0).distance

    const box = sweptBox(obstacle)

    return contactWith(point, { kind: 'rect', x: box.x, y: box.y, w: box.hw * 2, h: box.hh * 2 }, 0).distance
}
