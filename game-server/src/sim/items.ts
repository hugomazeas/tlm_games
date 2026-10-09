import { type Arena, AVATAR_RADIUS, clearance, PAD_RADIUS } from './arena.ts'
import type { Vec } from './geometry.ts'
import { pickOne, randomBetween, type Rng } from './rng.ts'

/** A mystery box turns into one of the others when someone takes it. */
export type ItemKind =
    | 'shield'
    | 'speed'
    | 'banana'
    | 'ghost'
    | 'swap'
    | 'reverse'
    | 'freeze'
    | 'magnet'
    | 'tiny'
    | 'mystery'
export type Effect = Exclude<ItemKind, 'mystery'>

export interface Item {
    id: number
    kind: ItemKind
    x: number
    y: number
    expiresAtMs: number
}

export const ITEM_RADIUS = 0.6
export const FIRST_ITEM_MS = 6000
export const ITEM_INTERVAL_MIN_MS = 7000
export const ITEM_INTERVAL_MAX_MS = 12_000
export const MAX_ITEMS = 4
/** An item nobody takes disappears after this long. */
export const ITEM_LIFETIME_MS = 15_000

/** While shielded, the holder can't hand you the potato, and nobody's freeze, magnet or swap reaches you. */
export const SHIELD_MS = 5000
export const SPEED_MS = 4000
/** Top speed and acceleration while boosted; multiplies the holder's own boost. */
export const SPEED_BOOST = 1.35
/** A banana takes your controls and your grip for this long. */
export const SLIP_MS = 1500
/** Walk through obstacles (never the arena walls) for this long. */
export const GHOST_MS = 3000
/** Your own keys are inverted for this long. */
export const REVERSE_MS = 4000
/** Everyone this close to whoever sets the freeze bomb off is frozen for FREEZE_BOMB_MS. */
export const FREEZE_RADIUS = 5
export const FREEZE_BOMB_MS = 1500
/** For MAGNET_MS, everyone within MAGNET_RADIUS is pulled toward you, harder the closer they are. */
export const MAGNET_MS = 4000
export const MAGNET_RADIUS = 8
export const MAGNET_PULL = 30
/** Shrunk to TINY_RADIUS for TINY_MS: harder to tag, and every gap gets wider. */
export const TINY_MS = 5000
export const TINY_RADIUS = 0.6

/** Items land on open floor, never hugging an obstacle, a wall, a pad or a player. */
export const OBSTACLE_CLEARANCE = 2
export const PLAYER_CLEARANCE = 3
export const PAD_ITEM_CLEARANCE = 1
const ITEM_SPACING = 2
const SPOT_ATTEMPTS = 30

export const EFFECTS: readonly Effect[] = [
    'shield',
    'speed',
    'banana',
    'ghost',
    'swap',
    'reverse',
    'freeze',
    'magnet',
    'tiny',
]
const WEIGHTS: ReadonlyArray<[ItemKind, number]> = [
    ['shield', 0.14],
    ['speed', 0.14],
    ['banana', 0.11],
    ['ghost', 0.09],
    ['swap', 0.08],
    ['reverse', 0.09],
    ['freeze', 0.09],
    ['magnet', 0.08],
    ['tiny', 0.08],
    ['mystery', 0.1],
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
 * clear of walls, obstacles (a mover's whole sweep), pads, players and other items.
 */
export function findItemSpot(arena: Arena, players: readonly Vec[], items: readonly Vec[], rng: Rng): Vec | null {
    const margin = OBSTACLE_CLEARANCE + ITEM_RADIUS

    for (let attempt = 0; attempt < SPOT_ATTEMPTS; attempt++) {
        const spot = {
            x: randomBetween(rng, margin, arena.width - margin),
            y: randomBetween(rng, margin, arena.height - margin),
        }

        if (arena.obstacles.some(o => clearance(spot, o) < margin)) continue
        if (
            arena.pads.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < PAD_RADIUS + PAD_ITEM_CLEARANCE + ITEM_RADIUS)
        )
            continue
        if (players.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < PLAYER_CLEARANCE + AVATAR_RADIUS)) continue
        if (items.some(i => Math.hypot(i.x - spot.x, i.y - spot.y) < ITEM_SPACING + 2 * ITEM_RADIUS)) continue

        return spot
    }

    return null
}
