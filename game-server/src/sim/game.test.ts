import { describe, expect, test } from 'bun:test'
import type { Arena } from './arena.ts'
import {
    createGame,
    FREEZE_MS,
    type GameEvent,
    type GameState,
    type Input,
    removePlayer,
    RESPAWN_MS,
    shakeLevel,
    step,
} from './game.ts'
import { createRng } from './rng.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

function emptyArena(spawns: Array<{ x: number; y: number }>): Arena {
    return { seed: 0, theme: 'open_space', width: 60, height: 40, obstacles: [], spawns }
}

/** A game with players far apart and a chosen holder, fuse long enough not to matter. */
function setup(count: number, holder = 1, durationMs = 120_000): GameState {
    const spawns = Array.from({ length: count }, (_, i) => ({ x: 6 + i * 10, y: 20 }))
    const game = createGame(
        emptyArena(spawns),
        Array.from({ length: count }, (_, i) => i + 1),
        durationMs,
        createRng(1)
    )
    game.holderId = holder
    game.fuseMs = 60_000
    // These rules are tested without items; items.test.ts covers them.
    game.nextItemAtMs = Number.POSITIVE_INFINITY

    return game
}

function run(game: GameState, ms: number, inputs = still): GameEvent[] {
    const events: GameEvent[] = []
    for (let t = 0; t < ms; t += TICK) events.push(...step(game, inputs, TICK, createRng(t + 1)))

    return events
}

function player(game: GameState, id: number) {
    const found = game.players.find(p => p.id === id)
    if (!found) throw new Error(`no player ${id}`)

    return found
}

function touch(game: GameState, a: number, b: number) {
    const pa = player(game, a)
    const pb = player(game, b)
    pb.x = pa.x + 1.9
    pb.y = pa.y
}

describe('createGame', () => {
    test('puts each player on a spawn and gives the potato to one of them', () => {
        const game = createGame(
            emptyArena([
                { x: 10, y: 10 },
                { x: 30, y: 10 },
                { x: 50, y: 10 },
            ]),
            [7, 8, 9],
            60_000,
            createRng(3)
        )

        expect(game.players.map(p => [p.x, p.y])).toEqual([
            [10, 10],
            [30, 10],
            [50, 10],
        ])
        expect([7, 8, 9]).toContain(game.holderId as number)
        expect(game.fuseMs).toBeGreaterThanOrEqual(15_000)
        expect(game.fuseMs).toBeLessThanOrEqual(30_000)
        expect(game.ended).toBe(false)
    })
})

describe('passing the potato', () => {
    test('touching someone passes it and freezes the receiver for 2 s', () => {
        const game = setup(3)
        touch(game, 1, 2)

        const events = step(game, still, TICK, createRng(1))

        expect(events).toContainEqual({ kind: 'pass', from: 1, to: 2 })
        expect(game.holderId).toBe(2)
        expect(player(game, 2).frozenMs).toBeGreaterThan(FREEZE_MS - TICK)
        expect(player(game, 1).passes).toBe(1)
    })

    test('a frozen receiver ignores input until the freeze ends, then moves', () => {
        const game = setup(3)
        touch(game, 1, 2)
        step(game, still, TICK, createRng(1))
        // Get the passer out of the way so nothing pushes the receiver.
        player(game, 1).x = 50
        const right = new Map([[2, { dx: 1, dy: 0 }]])
        const startX = player(game, 2).x

        run(game, FREEZE_MS - 2 * TICK, right)
        expect(player(game, 2).x).toBeCloseTo(startX, 5)

        run(game, 500, right)
        expect(player(game, 2).x).toBeGreaterThan(startX + 1)
    })

    test('a frozen holder cannot pass it on', () => {
        const game = setup(3)
        player(game, 1).frozenMs = 1000
        touch(game, 1, 2)

        const events = step(game, still, TICK, createRng(1))

        expect(events.filter(e => e.kind === 'pass')).toEqual([])
        expect(game.holderId).toBe(1)
    })

    test('the receiver cannot hand it straight back while frozen', () => {
        const game = setup(3)
        touch(game, 1, 2)
        step(game, still, TICK, createRng(1))
        const events = run(game, 500)

        expect(events.filter(e => e.kind === 'pass')).toEqual([])
        expect(game.holderId).toBe(2)
    })

    test('the holder is about 10% faster', () => {
        const game = setup(2, 1)
        player(game, 1).y = 10
        player(game, 2).y = 30
        player(game, 1).x = 6
        player(game, 2).x = 6
        const right = new Map([
            [1, { dx: 1, dy: 0 }],
            [2, { dx: 1, dy: 0 }],
        ])

        run(game, 3000, right)

        const ratio = (player(game, 1).x - 6) / (player(game, 2).x - 6)
        expect(ratio).toBeGreaterThan(1.07)
        expect(ratio).toBeLessThan(1.13)
    })

    test('time holding the potato is counted', () => {
        const game = setup(3)
        run(game, 1000)

        expect(player(game, 1).holdMs).toBe(1000)
        expect(player(game, 2).holdMs).toBe(0)
    })
})

describe('the fuse', () => {
    test('a boom knocks the holder out, and a new potato follows 2 s later', () => {
        const game = setup(4)
        game.fuseMs = 40

        const boom = step(game, still, TICK, createRng(1))
        expect(boom).toContainEqual({ kind: 'boom', playerId: 1 })
        expect(player(game, 1).out).toBe(true)
        expect(player(game, 1).eliminatedAtMs).toBe(50)
        expect(game.holderId).toBeNull()

        const pause = run(game, RESPAWN_MS - TICK)
        expect(pause.filter(e => e.kind === 'newPotato')).toEqual([])

        const after = run(game, 2 * TICK)
        const fresh = after.find(e => e.kind === 'newPotato')
        expect(fresh).toBeDefined()
        if (fresh?.kind !== 'newPotato') return
        expect(fresh.playerId).not.toBe(1)
        expect(game.holderId).toBe(fresh.playerId)
        expect(player(game, fresh.playerId).frozenMs).toBeGreaterThan(0)
    })

    test('the shake level rises over the last seconds and never reveals more', () => {
        const game = setup(3)
        game.fuseMs = 20_000
        expect(shakeLevel(game)).toBe(0)

        game.fuseMs = 2_500
        expect(shakeLevel(game)).toBeCloseTo(0.5, 5)

        game.fuseMs = 0
        expect(shakeLevel(game)).toBe(1)
    })
})

describe('ending', () => {
    test('the last one standing wins early', () => {
        const game = setup(2)
        game.fuseMs = 40

        const events = step(game, still, TICK, createRng(1))

        expect(events).toContainEqual({ kind: 'ended', survivorIds: [2] })
        expect(game.ended).toBe(true)
    })

    test('when time runs out every survivor wins', () => {
        const game = setup(3, 1, 1000)
        const events = run(game, 1000)

        expect(events).toContainEqual({ kind: 'ended', survivorIds: [1, 2, 3] })
    })

    test('an ended game no longer changes', () => {
        const game = setup(3, 1, 1000)
        run(game, 1000)
        const before = structuredClone(game)

        expect(run(game, 500)).toEqual([])
        expect(game).toEqual(before)
    })
})

describe('leaving', () => {
    test('a player who leaves is out', () => {
        const game = setup(4)
        removePlayer(game, 3, createRng(1))

        expect(player(game, 3).out).toBe(true)
        expect(game.holderId).toBe(1)
    })

    test('a holder who leaves hands the potato to a survivor, frozen', () => {
        const game = setup(4)
        const events = removePlayer(game, 1, createRng(1))
        const fresh = events.find(e => e.kind === 'newPotato')

        expect(fresh).toBeDefined()
        if (fresh?.kind !== 'newPotato') return
        expect(fresh.playerId).not.toBe(1)
        expect(player(game, fresh.playerId).frozenMs).toBe(FREEZE_MS)
    })

    test('leaving down to one player ends the game', () => {
        const game = setup(2)
        const events = removePlayer(game, 2, createRng(1))

        expect(events).toContainEqual({ kind: 'ended', survivorIds: [1] })
    })
})

describe('the arena', () => {
    test('walls keep everyone inside', () => {
        const game = setup(3)
        const allLeft = new Map(game.players.map(p => [p.id, { dx: -1, dy: -1 }]))

        run(game, 5000, allLeft)

        for (const p of game.players) {
            expect(p.x).toBeGreaterThanOrEqual(1 - 1e-6)
            expect(p.y).toBeGreaterThanOrEqual(1 - 1e-6)
        }
    })

    test('players cannot pass through an obstacle', () => {
        const game = setup(3)
        game.arena.obstacles.push({ kind: 'rect', x: 30, y: 10, w: 4, h: 4 })
        const p = player(game, 2)
        p.x = 30
        p.y = 3
        const down = new Map([[2, { dx: 0, dy: 1 }]])

        run(game, 3000, down)

        expect(p.y).toBeLessThanOrEqual(8 - 1 + 1e-6)
    })
})
