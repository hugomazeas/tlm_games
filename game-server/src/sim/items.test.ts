import { describe, expect, test } from 'bun:test'
import { type Arena, AVATAR_RADIUS, generateArena } from './arena.ts'
import { createGame, FREEZE_MS, type GameEvent, type GameState, type Input, step } from './game.ts'
import { contactWith, sweptBox } from './geometry.ts'
import {
    FIRST_ITEM_MS,
    findItemSpot,
    ITEM_INTERVAL_MAX_MS,
    ITEM_INTERVAL_MIN_MS,
    ITEM_LIFETIME_MS,
    ITEM_RADIUS,
    type ItemKind,
    MAX_ITEMS,
    OBSTACLE_CLEARANCE,
    PLAYER_CLEARANCE,
    SHIELD_MS,
    SLIP_MS,
    SPEED_MS,
} from './items.ts'
import { createRng } from './rng.ts'
import { THEME_IDS } from './themes.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

function emptyArena(): Arena {
    return { seed: 0, theme: 'open_space', width: 60, height: 40, obstacles: [], spawns: [] }
}

/** Players in a row along y = 20, ten units apart; player 1 holds a potato that won't blow. */
function setup(count = 3, withItems = false): GameState {
    const arena = emptyArena()
    arena.spawns = Array.from({ length: count }, (_, i) => ({ x: 6 + i * 10, y: 20 }))
    const game = createGame(
        arena,
        Array.from({ length: count }, (_, i) => i + 1),
        120_000,
        createRng(1)
    )
    game.holderId = 1
    game.fuseMs = 100_000
    if (!withItems) game.nextItemAtMs = Number.POSITIVE_INFINITY

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

/** Drops an item right under a player, so the next step picks it up. */
function dropOn(game: GameState, id: number, kind: ItemKind) {
    const p = player(game, id)
    game.items.push({ id: game.nextItemId++, kind, x: p.x, y: p.y, expiresAtMs: game.elapsedMs + ITEM_LIFETIME_MS })
}

describe('spawning', () => {
    test('the first item drops 10 s in, then one every 12 to 20 s', () => {
        const game = setup(3, true)
        const drops: number[] = []
        let seen = 0

        for (let t = 0; t < 80_000; t += TICK) {
            step(game, still, TICK, createRng(t + 7))
            if (game.nextItemId - 1 > seen) {
                seen = game.nextItemId - 1
                drops.push(game.elapsedMs)
            }
        }

        expect(drops[0]).toBe(FIRST_ITEM_MS)
        for (const [i, at] of drops.slice(1).entries()) {
            const gap = at - (drops[i] ?? 0)
            expect(gap).toBeGreaterThanOrEqual(ITEM_INTERVAL_MIN_MS)
            expect(gap).toBeLessThanOrEqual(ITEM_INTERVAL_MAX_MS + TICK)
        }
    })

    test('never more than three items on the floor', () => {
        const game = setup(3, true)

        for (let t = 0; t < 120_000; t += TICK) {
            step(game, still, TICK, createRng(t + 7))
            expect(game.items.length).toBeLessThanOrEqual(MAX_ITEMS)
            // Nothing expires, so the floor fills up.
            for (const item of game.items) item.expiresAtMs = Number.POSITIVE_INFINITY
        }

        expect(game.items).toHaveLength(MAX_ITEMS)
    })

    test('an item nobody takes disappears after 15 s', () => {
        const game = setup()
        game.items.push({ id: 1, kind: 'speed', x: 30, y: 35, expiresAtMs: ITEM_LIFETIME_MS })

        run(game, ITEM_LIFETIME_MS - TICK)
        expect(game.items).toHaveLength(1)

        run(game, TICK)
        expect(game.items).toHaveLength(0)
    })

    test('items land on open floor in every theme, clear of walls, obstacles and players', () => {
        for (const theme of THEME_IDS) {
            for (let seed = 1; seed <= 60; seed++) {
                const players = 3 + (seed % 10)
                const arena = generateArena(seed, theme, players)
                const rng = createRng(seed)
                const items: Array<{ x: number; y: number }> = []

                for (let n = 0; n < MAX_ITEMS; n++) {
                    const spot = findItemSpot(arena, arena.spawns, items, rng)
                    if (!spot) continue
                    items.push(spot)

                    const margin = OBSTACLE_CLEARANCE + ITEM_RADIUS
                    expect(spot.x).toBeGreaterThanOrEqual(margin)
                    expect(spot.x).toBeLessThanOrEqual(arena.width - margin)
                    expect(spot.y).toBeGreaterThanOrEqual(margin)
                    expect(spot.y).toBeLessThanOrEqual(arena.height - margin)
                    for (const o of arena.obstacles) {
                        const box = sweptBox(o)
                        const sweep = { kind: 'rect' as const, x: box.x, y: box.y, w: box.hw * 2, h: box.hh * 2 }
                        expect(contactWith(spot, o.mover ? sweep : o, 0).distance).toBeGreaterThanOrEqual(margin)
                    }
                    for (const s of arena.spawns) {
                        expect(Math.hypot(s.x - spot.x, s.y - spot.y)).toBeGreaterThanOrEqual(
                            PLAYER_CLEARANCE + AVATAR_RADIUS
                        )
                    }
                }

                expect(items.length).toBeGreaterThan(0)
            }
        }
    })
})

describe('picking up', () => {
    test('touching an item takes it and says so', () => {
        const game = setup()
        dropOn(game, 2, 'shield')

        const events = run(game, TICK)

        expect(game.items).toHaveLength(0)
        expect(events).toContainEqual({ kind: 'pickup', playerId: 2, item: 'shield', effect: 'shield' })
        expect(player(game, 2).shieldMs).toBeGreaterThan(SHIELD_MS - 2 * TICK)
    })

    test('a player who is out cannot take one', () => {
        const game = setup(4)
        player(game, 2).out = true
        dropOn(game, 2, 'speed')

        const events = run(game, TICK)

        expect(game.items).toHaveLength(1)
        expect(events.filter(e => e.kind === 'pickup')).toHaveLength(0)
    })

    test('the potato holder can take items too', () => {
        const game = setup()
        dropOn(game, 1, 'speed')

        run(game, TICK)

        expect(player(game, 1).speedMs).toBeGreaterThan(0)
    })

    test('taking the same item again restarts its timer instead of adding up', () => {
        const game = setup()
        player(game, 2).shieldMs = 1000
        dropOn(game, 2, 'shield')

        run(game, TICK)

        expect(player(game, 2).shieldMs).toBeLessThanOrEqual(SHIELD_MS)
        expect(player(game, 2).shieldMs).toBeGreaterThan(SHIELD_MS - 2 * TICK)
    })

    test('a mystery box turns into one of the other items and applies it', () => {
        const seen = new Set<string>()

        for (let seed = 1; seed <= 40; seed++) {
            const game = setup()
            dropOn(game, 2, 'mystery')
            const events = step(game, still, TICK, createRng(seed))
            const pickup = events.find(e => e.kind === 'pickup')
            if (pickup?.kind !== 'pickup') throw new Error('no pickup')

            expect(pickup.item).toBe('mystery')
            expect(['shield', 'speed', 'banana']).toContain(pickup.effect)
            const p = player(game, 2)
            const applied = { shield: p.shieldMs, speed: p.speedMs, banana: p.slipMs }[pickup.effect]
            expect(applied).toBeGreaterThan(0)
            seen.add(pickup.effect)
        }

        expect(seen.size).toBe(3)
    })

    test('effects wear off', () => {
        const game = setup()
        Object.assign(player(game, 3), { shieldMs: SHIELD_MS, speedMs: SPEED_MS, slipMs: SLIP_MS })

        run(game, SHIELD_MS)

        expect(player(game, 3)).toMatchObject({ shieldMs: 0, speedMs: 0, slipMs: 0 })
    })
})

describe('shield', () => {
    test('the holder cannot pass to a shielded player; they just bump', () => {
        const game = setup()
        const shielded = player(game, 2)
        shielded.shieldMs = SHIELD_MS
        shielded.x = player(game, 1).x + 1.9

        const events = run(game, TICK)

        expect(game.holderId).toBe(1)
        expect(events.filter(e => e.kind === 'pass')).toHaveLength(0)
        expect(Math.hypot(shielded.x - player(game, 1).x, shielded.y - player(game, 1).y)).toBeGreaterThanOrEqual(
            2 * AVATAR_RADIUS - 1e-6
        )
    })

    test('once the shield runs out, the potato passes again', () => {
        const game = setup()
        const p2 = player(game, 2)
        p2.shieldMs = 200
        p2.x = player(game, 1).x + 1.9

        run(game, 100)
        expect(game.holderId).toBe(1)

        // Keep them touching until the shield is gone.
        for (let t = 0; t < 400 && game.holderId === 1; t += TICK) {
            p2.x = player(game, 1).x + 1.9
            p2.y = player(game, 1).y
            run(game, TICK)
        }
        expect(game.holderId).toBe(2)
    })

    test('a new potato skips shielded players', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = setup(4)
            player(game, 2).shieldMs = 60_000
            player(game, 3).shieldMs = 60_000
            game.holderId = null
            game.respawnMs = TICK

            step(game, still, TICK, createRng(seed))

            expect([1, 4]).toContain(game.holderId ?? -1)
        }
    })

    test('if everyone left is shielded, a new potato still goes to someone', () => {
        const game = setup(3)
        for (const p of game.players) p.shieldMs = 60_000
        game.holderId = null
        game.respawnMs = TICK

        step(game, still, TICK, createRng(3))

        expect([1, 2, 3]).toContain(game.holderId ?? -1)
    })
})

describe('speed boost', () => {
    test('a boosted player is about 35% faster, on top of the holder boost', () => {
        const game = setup(3)
        game.holderId = 3
        const lanes = [10, 20, 30]
        for (const [i, p] of game.players.entries()) {
            p.x = 6
            p.y = lanes[i] ?? 0
        }
        player(game, 2).speedMs = 60_000
        player(game, 3).speedMs = 60_000
        const right = new Map(game.players.map(p => [p.id, { dx: 1, dy: 0 }]))

        run(game, 3000, right)
        for (const p of game.players) p.speedMs = 0

        const plain = player(game, 1).x - 6
        const boosted = (player(game, 2).x - 6) / plain
        const boostedHolder = (player(game, 3).x - 6) / plain
        expect(boosted).toBeGreaterThan(1.3)
        expect(boosted).toBeLessThan(1.4)
        expect(boostedHolder).toBeGreaterThan(1.42)
        expect(boostedHolder).toBeLessThan(1.55)
    })
})

describe('banana', () => {
    test('a slipping player ignores the keys and keeps sliding', () => {
        const game = setup()
        const p = player(game, 3)
        p.vx = 6
        p.vy = 0
        p.slipMs = SLIP_MS
        const startX = p.x
        const left = new Map([[3, { dx: -1, dy: 0 }]])

        run(game, 500, left)

        expect(p.vx).toBeCloseTo(6, 5)
        expect(p.x - startX).toBeCloseTo(3, 1)
    })

    test('the keys work again once the slip is over', () => {
        const game = setup()
        const p = player(game, 3)
        p.vx = 6
        p.slipMs = 200
        const left = new Map([[3, { dx: -1, dy: 0 }]])

        run(game, 1000, left)

        expect(p.vx).toBeLessThan(0)
    })

    test('a slipping holder still passes the potato on contact', () => {
        const game = setup()
        const holder = player(game, 1)
        holder.slipMs = SLIP_MS
        holder.vx = 10
        player(game, 2).x = holder.x + 3

        const events = run(game, 500)

        expect(events).toContainEqual({ kind: 'pass', from: 1, to: 2 })
    })

    test('getting the potato stops a slide dead', () => {
        const game = setup()
        const receiver = player(game, 2)
        receiver.slipMs = SLIP_MS
        // Sliding into the holder.
        receiver.vx = -8
        receiver.x = player(game, 1).x + 1.9

        run(game, TICK)

        expect(game.holderId).toBe(2)
        expect(receiver.slipMs).toBe(0)
        expect(receiver.frozenMs).toBeGreaterThan(FREEZE_MS - 2 * TICK)
    })

    test('a frozen player who touches a banana uses it up without slipping', () => {
        const game = setup()
        const frozen = player(game, 2)
        frozen.frozenMs = FREEZE_MS
        dropOn(game, 2, 'banana')

        const events = run(game, TICK)

        expect(game.items).toHaveLength(0)
        expect(events).toContainEqual({ kind: 'pickup', playerId: 2, item: 'banana', effect: 'banana' })
        expect(frozen.slipMs).toBe(0)
    })
})
