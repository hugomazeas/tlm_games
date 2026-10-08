import { describe, expect, test } from 'bun:test'
import { type Arena, AVATAR_RADIUS, generateArena, PAD_RADIUS } from './arena.ts'
import {
    createGame,
    type GameEvent,
    type GameState,
    type Input,
    LAUNCH_MS,
    LAUNCH_SPEED,
    MAX_SPEED,
    PAD_COOLDOWN_MS,
    radiusOf,
    step,
} from './game.ts'
import { contactWith } from './geometry.ts'
import {
    findItemSpot,
    FREEZE_BOMB_MS,
    FREEZE_RADIUS,
    GHOST_MS,
    ITEM_LIFETIME_MS,
    ITEM_RADIUS,
    type ItemKind,
    MAGNET_MS,
    MAGNET_RADIUS,
    MAX_ITEMS,
    PAD_ITEM_CLEARANCE,
    REVERSE_MS,
    SHIELD_MS,
    TINY_MS,
    TINY_RADIUS,
} from './items.ts'
import { createRng } from './rng.ts'
import { THEME_IDS } from './themes.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

/** Players in a row along y = 20, ten units apart; player 1 holds a potato that won't blow. */
function setup(count = 3, arena: Partial<Arena> = {}): GameState {
    const base: Arena = {
        seed: 0,
        theme: 'open_space',
        width: 60,
        height: 40,
        obstacles: [],
        pads: [],
        spawns: Array.from({ length: count }, (_, i) => ({ x: 6 + i * 10, y: 20 })),
        ...arena,
    }
    const game = createGame(
        base,
        Array.from({ length: count }, (_, i) => i + 1),
        120_000,
        createRng(1)
    )
    game.holderId = 1
    game.fuseMs = 100_000
    game.nextItemAtMs = Number.POSITIVE_INFINITY

    return game
}

function run(game: GameState, ms: number, inputs = still): GameEvent[] {
    const events: GameEvent[] = []
    for (let t = 0; t < ms; t += TICK) events.push(...step(game, inputs, TICK, createRng(t + 7)))

    return events
}

function player(game: GameState, id: number) {
    const found = game.players.find(p => p.id === id)
    if (!found) throw new Error(`no player ${id}`)

    return found
}

function dropOn(game: GameState, id: number, kind: ItemKind) {
    const p = player(game, id)
    game.items.push({ id: game.nextItemId++, kind, x: p.x, y: p.y, expiresAtMs: game.elapsedMs + ITEM_LIFETIME_MS })
}

const right = (id: number) => new Map([[id, { dx: 1, dy: 0 }]])

/** A wall across the floor between x = 20 and x = 24, top to bottom. */
const wall = { kind: 'rect' as const, x: 22, y: 20, w: 4, h: 40 }

describe('ghost', () => {
    test('a ghost walks straight through an obstacle that stops everyone else', () => {
        const normal = setup(3, { obstacles: [wall] })
        run(normal, 3000, right(2))
        expect(player(normal, 2).x).toBeLessThan(wall.x - wall.w / 2)

        const haunted = setup(3, { obstacles: [wall] })
        dropOn(haunted, 2, 'ghost')
        run(haunted, 2500, right(2))
        expect(player(haunted, 2).x).toBeGreaterThan(wall.x + wall.w / 2)
    })

    test('the arena walls still hold a ghost', () => {
        const game = setup()
        dropOn(game, 3, 'ghost')
        run(game, GHOST_MS - TICK, right(3))

        expect(player(game, 3).x).toBeLessThanOrEqual(game.arena.width - AVATAR_RADIUS)
    })

    test('a ghost that wears off inside an obstacle comes out on open floor', () => {
        const game = setup(3, { obstacles: [wall] })
        const p = player(game, 2)
        p.x = wall.x
        p.y = 20
        p.ghostMs = TICK

        run(game, 2 * TICK)

        expect(contactWith(p, wall, game.elapsedMs).distance).toBeGreaterThanOrEqual(AVATAR_RADIUS - 1e-9)
        expect(Math.abs(p.x - wall.x)).toBeLessThan(wall.w / 2 + AVATAR_RADIUS + 0.6)
    })
})

describe('swap', () => {
    test('trading places with someone; the potato stays with whoever held it', () => {
        const game = setup()
        const before = { taker: { ...player(game, 2) }, others: [{ ...player(game, 1) }, { ...player(game, 3) }] }
        dropOn(game, 2, 'swap')

        const events = run(game, TICK)
        const pickup = events.find(e => e.kind === 'pickup')
        if (pickup?.kind !== 'pickup' || pickup.targetId === undefined) throw new Error('no swap')

        const target = before.others.find(o => o.id === pickup.targetId)
        if (!target) throw new Error('unknown target')
        expect(player(game, 2).x).toBeCloseTo(target.x, 1)
        expect(player(game, pickup.targetId).x).toBeCloseTo(before.taker.x, 1)
        expect(game.holderId).toBe(1)
    })

    test('shielded players are never swapped with', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = setup(4)
            player(game, 3).shieldMs = SHIELD_MS
            player(game, 4).shieldMs = SHIELD_MS
            dropOn(game, 2, 'swap')

            const pickup = step(game, still, TICK, createRng(seed)).find(e => e.kind === 'pickup')
            expect(pickup?.kind === 'pickup' && pickup.targetId).toBe(1)
        }
    })

    test('with nobody to swap with, the box is spent and nothing moves', () => {
        const game = setup()
        player(game, 1).shieldMs = SHIELD_MS
        player(game, 3).shieldMs = SHIELD_MS
        const x = player(game, 2).x
        dropOn(game, 2, 'swap')

        const events = run(game, TICK)

        expect(events).toContainEqual({ kind: 'pickup', playerId: 2, item: 'swap', effect: 'swap' })
        expect(player(game, 2).x).toBeCloseTo(x, 5)
    })
})

describe('reverse', () => {
    test('reversed controls send you the other way, until they wear off', () => {
        const game = setup()
        const p = player(game, 3)
        dropOn(game, 3, 'reverse')
        const start = p.x

        run(game, 1000, right(3))
        expect(p.x).toBeLessThan(start)

        run(game, REVERSE_MS, right(3))
        p.vx = 0
        const later = p.x
        run(game, 500, right(3))
        expect(p.x).toBeGreaterThan(later)
    })
})

describe('freeze bomb', () => {
    test('freezes everyone near the taker, but not the taker, the far away or the shielded', () => {
        const game = setup(5)
        const taker = player(game, 2)
        const near = player(game, 3)
        const shielded = player(game, 4)
        const far = player(game, 5)
        near.x = taker.x + FREEZE_RADIUS - 1
        shielded.x = taker.x - 2
        shielded.y = taker.y + 2.5
        shielded.shieldMs = SHIELD_MS
        far.x = taker.x + FREEZE_RADIUS + 3
        far.y = taker.y + 8
        dropOn(game, 2, 'freeze')

        run(game, TICK)

        expect(near.frozenMs).toBeGreaterThan(FREEZE_BOMB_MS - 2 * TICK)
        expect(taker.frozenMs).toBe(0)
        expect(shielded.frozenMs).toBe(0)
        expect(far.frozenMs).toBe(0)
    })

    test('a frozen holder cannot pass the potato until the freeze ends', () => {
        const game = setup()
        const holder = player(game, 1)
        player(game, 2).x = holder.x + 3
        holder.x = player(game, 2).x - 3
        dropOn(game, 2, 'freeze')
        run(game, TICK)
        expect(holder.frozenMs).toBeGreaterThan(0)

        player(game, 2).x = holder.x + 1.9
        expect(run(game, TICK).some(e => e.kind === 'pass')).toBe(false)
    })
})

describe('magnet', () => {
    test('pulls players in range toward its owner; not those out of range or shielded', () => {
        const game = setup(4)
        const magnet = player(game, 1)
        magnet.x = 30
        const pulled = player(game, 2)
        const shielded = player(game, 3)
        const distant = player(game, 4)
        pulled.x = 30 + MAGNET_RADIUS - 3
        shielded.x = 30 - (MAGNET_RADIUS - 3)
        shielded.shieldMs = SHIELD_MS
        distant.y = 20 + MAGNET_RADIUS + 5
        distant.x = 30
        dropOn(game, 1, 'magnet')
        game.holderId = null
        game.respawnMs = 100_000
        const start = { pulled: pulled.x, shielded: shielded.x, distant: distant.y }

        run(game, 600)

        expect(pulled.x).toBeLessThan(start.pulled - 0.5)
        expect(shielded.x).toBeCloseTo(start.shielded, 5)
        expect(distant.y).toBeCloseTo(start.distant, 5)
        expect(magnet.magnetMs).toBeLessThanOrEqual(MAGNET_MS)
    })
})

describe('tiny', () => {
    test('shrinks you, so the holder has to get closer to tag you', () => {
        const game = setup()
        dropOn(game, 2, 'tiny')
        run(game, TICK)
        const tiny = player(game, 2)
        expect(radiusOf(tiny)).toBe(TINY_RADIUS)
        expect(tiny.tinyMs).toBeGreaterThan(TINY_MS - 2 * TICK)

        // Close enough to tag a full-size player, not a tiny one.
        tiny.x = player(game, 1).x + 1.9
        expect(run(game, TICK).some(e => e.kind === 'pass')).toBe(false)

        tiny.x = player(game, 1).x + AVATAR_RADIUS + TINY_RADIUS
        expect(run(game, TICK)).toContainEqual({ kind: 'pass', from: 1, to: 2 })
    })

    test('you grow back when it wears off', () => {
        const game = setup()
        player(game, 3).tinyMs = TICK

        run(game, 2 * TICK)

        expect(radiusOf(player(game, 3))).toBe(AVATAR_RADIUS)
    })
})

describe('boost pads', () => {
    const pad = { x: 26, y: 20, dx: 0, dy: -1 }

    test('rolling over a pad launches you its way, faster than you can run', () => {
        const game = setup(3, { pads: [pad] })
        const p = player(game, 2)
        p.x = pad.x
        p.y = pad.y

        run(game, TICK)

        expect(p.vy).toBeLessThan(-MAX_SPEED)
        expect(Math.abs(p.vx)).toBeLessThan(1e-9)
        expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(LAUNCH_SPEED, 5)
    })

    test('no steering mid-launch, then the keys work again', () => {
        const game = setup(3, { pads: [pad] })
        const p = player(game, 2)
        p.x = pad.x
        p.y = pad.y

        run(game, LAUNCH_MS - TICK, right(2))
        expect(p.vx).toBeCloseTo(0, 5)

        run(game, 500, right(2))
        expect(p.vx).toBeGreaterThan(0)
    })

    test('a pad does not fire you again straight away', () => {
        const game = setup(3, { pads: [pad] })
        const p = player(game, 2)
        p.x = pad.x
        p.y = pad.y
        run(game, TICK)

        // Put back on the pad, standing still, within the cooldown.
        p.x = pad.x
        p.y = pad.y
        p.vx = 0
        p.vy = 0
        run(game, TICK)
        expect(p.vy).toBeGreaterThan(-1)

        run(game, PAD_COOLDOWN_MS + LAUNCH_MS)
        p.x = pad.x
        p.y = pad.y
        run(game, TICK)
        expect(p.vy).toBeLessThan(-MAX_SPEED)
    })

    test('a frozen player is not launched', () => {
        const game = setup(3, { pads: [pad] })
        const p = player(game, 2)
        p.x = pad.x
        p.y = pad.y
        p.frozenMs = 1000

        run(game, TICK)

        expect(p.vy).toBe(0)
    })

    test('items never land on a pad', () => {
        for (const theme of THEME_IDS) {
            for (let seed = 1; seed <= 40; seed++) {
                const arena = generateArena(seed, theme, 3 + (seed % 10))
                const rng = createRng(seed)
                const items: Array<{ x: number; y: number }> = []

                for (let n = 0; n < MAX_ITEMS * 3; n++) {
                    const spot = findItemSpot(arena, arena.spawns, items, rng)
                    if (!spot) continue
                    items.push(spot)
                    for (const p of arena.pads) {
                        expect(Math.hypot(p.x - spot.x, p.y - spot.y)).toBeGreaterThanOrEqual(
                            PAD_RADIUS + PAD_ITEM_CLEARANCE + ITEM_RADIUS
                        )
                    }
                }
            }
        }
    })
})
