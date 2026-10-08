import { describe, expect, test } from 'bun:test'
import type { Arena } from './arena.ts'
import {
    createGame,
    type GameEvent,
    type GameState,
    type Input,
    removePlayer,
    shakeLevel,
    STEAL_SAFETY_MS,
    step,
    winnerIds,
} from './game.ts'
import { SHIELD_MS } from './items.ts'
import { createRng } from './rng.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

/** A King of the Potato game, players in a row ten units apart, player 1 crowned with no head start left. */
function setup(count = 3, durationMs = 60_000): GameState {
    const spawns = Array.from({ length: count }, (_, i) => ({ x: 6 + i * 10, y: 20 }))
    const arena: Arena = { seed: 0, theme: 'open_space', width: 60, height: 40, obstacles: [], pads: [], spawns }
    const game = createGame(
        arena,
        Array.from({ length: count }, (_, i) => i + 1),
        durationMs,
        createRng(1),
        'king'
    )
    game.holderId = 1
    for (const p of game.players) p.safeMs = 0
    game.nextItemAtMs = Number.POSITIVE_INFINITY

    return game
}

function run(game: GameState, ms: number, inputs = still): GameEvent[] {
    const events: GameEvent[] = []
    for (let t = 0; t < ms; t += TICK) events.push(...step(game, inputs, TICK, createRng(t + 3)))

    return events
}

function player(game: GameState, id: number) {
    const found = game.players.find(p => p.id === id)
    if (!found) throw new Error(`no player ${id}`)

    return found
}

function touchKing(game: GameState, thiefId: number) {
    const king = player(game, game.holderId ?? 0)
    const thief = player(game, thiefId)
    thief.x = king.x + 1.9
    thief.y = king.y
}

describe('King of the Potato', () => {
    test('the first king starts with a head start', () => {
        const arena: Arena = {
            seed: 0,
            theme: 'open_space',
            width: 60,
            height: 40,
            obstacles: [],
            pads: [],
            spawns: [
                { x: 10, y: 20 },
                { x: 30, y: 20 },
                { x: 50, y: 20 },
            ],
        }
        const game = createGame(arena, [1, 2, 3], 60_000, createRng(5), 'king')

        expect(game.mode).toBe('king')
        expect(player(game, game.holderId ?? 0).safeMs).toBe(STEAL_SAFETY_MS)
    })

    test('touching the king steals the crown; the old king is not frozen', () => {
        const game = setup()
        touchKing(game, 2)

        const events = run(game, TICK)

        expect(events).toContainEqual({ kind: 'pass', from: 1, to: 2 })
        expect(game.holderId).toBe(2)
        expect(player(game, 1).frozenMs).toBe(0)
        expect(player(game, 2).frozenMs).toBe(0)
        expect(player(game, 2).passes).toBe(1)
    })

    test('a new king cannot be robbed for 2 s, then can', () => {
        const game = setup()
        touchKing(game, 2)
        run(game, TICK)
        expect(game.holderId).toBe(2)

        // The old king clings on throughout the head start.
        for (let t = 0; t < STEAL_SAFETY_MS - 2 * TICK; t += TICK) {
            touchKing(game, 1)
            run(game, TICK)
            expect(game.holderId).toBe(2)
        }

        for (let t = 0; t < 4 * TICK && game.holderId === 2; t += TICK) {
            touchKing(game, 1)
            run(game, TICK)
        }
        expect(game.holderId).toBe(1)
    })

    test('a shielded king cannot be robbed', () => {
        const game = setup()
        player(game, 1).shieldMs = SHIELD_MS
        touchKing(game, 2)

        const events = run(game, TICK)

        expect(game.holderId).toBe(1)
        expect(events.filter(e => e.kind === 'pass')).toHaveLength(0)
    })

    test('the king is about 10% slower', () => {
        const game = setup(2)
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
        expect(ratio).toBeGreaterThan(0.87)
        expect(ratio).toBeLessThan(0.93)
    })

    test('holding the crown scores, and nothing ever blows up', () => {
        const game = setup()

        const events = run(game, 59_000)

        expect(player(game, 1).holdMs).toBe(59_000)
        expect(events.filter(e => e.kind === 'boom')).toHaveLength(0)
        expect(game.players.every(p => !p.out)).toBe(true)
        expect(shakeLevel(game)).toBe(0)
    })

    test('when time runs out the longest holder wins', () => {
        const game = setup(3, 10_000)
        player(game, 2).holdMs = 30_000

        const events = run(game, 10_000)

        expect(game.ended).toBe(true)
        expect(events.at(-1)).toEqual({ kind: 'ended', survivorIds: [2] })
    })

    test('a tie shares the crown', () => {
        const game = setup()
        player(game, 1).holdMs = 5000
        player(game, 3).holdMs = 5000

        expect(winnerIds(game)).toEqual([1, 3])
    })

    test('a king who leaves hands the crown to someone else, with a head start', () => {
        const game = setup(4)

        const events = removePlayer(game, 1, createRng(9))

        const heir = events.find(e => e.kind === 'newPotato')
        if (heir?.kind !== 'newPotato') throw new Error('no heir')
        expect([2, 3, 4]).toContain(heir.playerId)
        expect(game.holderId).toBe(heir.playerId)
        expect(player(game, heir.playerId).safeMs).toBe(STEAL_SAFETY_MS)
        expect(player(game, heir.playerId).frozenMs).toBe(0)
        expect(game.ended).toBe(false)
    })

    test('a survival game is unchanged by default', () => {
        const arena: Arena = {
            seed: 0,
            theme: 'open_space',
            width: 60,
            height: 40,
            obstacles: [],
            pads: [],
            spawns: [],
        }
        const game = createGame(arena, [1, 2, 3], 60_000, createRng(5))

        expect(game.mode).toBe('survival')
    })
})
