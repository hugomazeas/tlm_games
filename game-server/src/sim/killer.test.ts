import { describe, expect, test } from 'bun:test'
import type { Arena } from './arena.ts'
import {
    createGame,
    type GameEvent,
    type GameState,
    HUNTER_HEAD_START_MS,
    type Input,
    removePlayer,
    shakeLevel,
    step,
    winnerIds,
} from './game.ts'
import { SHIELD_MS } from './items.ts'
import { createRng } from './rng.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()
const HUNTER = 9

/** A Killer Potato game: the hunter (9) on the left, `count` players in a row ten units apart. */
function setup(count = 3, durationMs = 60_000): GameState {
    const ids = [HUNTER, ...Array.from({ length: count }, (_, i) => i + 1)]
    const arena: Arena = {
        seed: 0,
        theme: 'open_space',
        width: 80,
        height: 40,
        obstacles: [],
        pads: [],
        spawns: ids.map((_, i) => ({ x: 6 + i * 10, y: 20 })),
    }
    const game = createGame(arena, ids, durationMs, createRng(1), 'killer', HUNTER)
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

/** Puts the hunter right next to `id`, awake. */
function hunterTouches(game: GameState, id: number) {
    const hunter = player(game, HUNTER)
    const prey = player(game, id)
    hunter.frozenMs = 0
    hunter.x = prey.x - 1.5
    hunter.y = prey.y
}

describe('Killer Potato', () => {
    test('the hunter holds the potato from the start, frozen for a head start', () => {
        const game = setup()

        expect(game.holderId).toBe(HUNTER)
        expect(game.hunterId).toBe(HUNTER)
        expect(player(game, HUNTER).frozenMs).toBe(HUNTER_HEAD_START_MS)
        expect(shakeLevel(game)).toBe(0)
    })

    test('it needs a hunter among the players', () => {
        const arena = setup().arena
        expect(() => createGame(arena, [1, 2], 60_000, createRng(1), 'killer')).toThrow('hunter')
        expect(() => createGame(arena, [1, 2], 60_000, createRng(1), 'killer', 7)).toThrow('hunter')
    })

    test('its touch knocks a player out, and it keeps the potato', () => {
        const game = setup()
        hunterTouches(game, 1)
        const events = run(game, TICK)

        expect(player(game, 1).out).toBe(true)
        expect(events).toContainEqual({ kind: 'boom', playerId: 1 })
        expect(events.some(e => e.kind === 'pass')).toBe(false)
        expect(game.holderId).toBe(HUNTER)
        expect(player(game, HUNTER).passes).toBe(1)
    })

    test('the potato never blows up: nobody is out without a touch', () => {
        const game = setup(3, 120_000)
        run(game, 60_000)

        expect(game.players.every(p => !p.out)).toBe(true)
        expect(game.holderId).toBe(HUNTER)
    })

    test('a shield holds, and a frozen hunter catches nobody', () => {
        const shielded = setup()
        player(shielded, 1).shieldMs = SHIELD_MS
        hunterTouches(shielded, 1)
        run(shielded, TICK)
        expect(player(shielded, 1).out).toBe(false)

        const frozen = setup()
        hunterTouches(frozen, 1)
        player(frozen, HUNTER).frozenMs = 1000
        run(frozen, TICK)
        expect(player(frozen, 1).out).toBe(false)
    })

    test('with several players, the last one standing wins and the round ends', () => {
        const game = setup(2)
        hunterTouches(game, 1)
        const events = run(game, TICK)

        expect(game.ended).toBe(true)
        expect(events.at(-1)).toEqual({ kind: 'ended', survivorIds: [2] })
        expect(winnerIds(game)).toEqual([2])
    })

    test('alone against the hunter, you play until caught or until the timer', () => {
        const caught = setup(1)
        run(caught, 1000)
        expect(caught.ended).toBe(false)
        hunterTouches(caught, 1)
        const events = run(caught, TICK)
        expect(caught.ended).toBe(true)
        expect(events.at(-1)).toEqual({ kind: 'ended', survivorIds: [] })

        const survived = setup(1, 2000)
        run(survived, 2000)
        expect(survived.ended).toBe(true)
        expect(winnerIds(survived)).toEqual([1])
    })

    test('at the timer, every player still standing wins, never the hunter', () => {
        const game = setup(3, 2000)
        hunterTouches(game, 1)
        run(game, 2000)

        expect(game.ended).toBe(true)
        expect(winnerIds(game)).toEqual([2, 3])
    })

    test('if the hunter leaves, someone left takes the knife, after the same head start', () => {
        const game = setup(3)
        run(game, 5000)
        const events = removePlayer(game, HUNTER, createRng(2))

        expect(game.ended).toBe(false)
        const next = game.hunterId
        expect([1, 2, 3]).toContain(next!)
        expect(game.holderId).toBe(next)
        expect(events).toEqual([{ kind: 'newHunter', playerId: next! }])
        expect(player(game, next!).frozenMs).toBe(HUNTER_HEAD_START_MS)
    })

    test('with only two left, nobody takes the knife and they win', () => {
        const game = setup(2)
        const events = removePlayer(game, HUNTER, createRng(2))

        expect(game.ended).toBe(true)
        expect(events.some(e => e.kind === 'newHunter')).toBe(false)
        expect(winnerIds(game)).toEqual([1, 2])
    })

    test('a player leaving is just out; the hunter keeps hunting', () => {
        const game = setup(3)
        removePlayer(game, 2, createRng(2))

        expect(game.ended).toBe(false)
        expect(game.holderId).toBe(HUNTER)
    })
})
