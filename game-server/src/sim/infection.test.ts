import { describe, expect, test } from 'bun:test'
import type { Arena } from './arena.ts'
import {
    createGame,
    type GameEvent,
    type GameState,
    HUNTER_HEAD_START_MS,
    INFECTED_FREEZE_MS,
    type Input,
    MAX_SPEED,
    removePlayer,
    shakeLevel,
    step,
    winnerIds,
} from './game.ts'
import { SHIELD_MS } from './items.ts'
import { createRng } from './rng.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

/** An Infection game: players 1…count in a row ten units apart, no items or portals. */
function setup(count = 4, durationMs = 60_000): GameState {
    const ids = Array.from({ length: count }, (_, i) => i + 1)
    const arena: Arena = {
        seed: 0,
        theme: 'open_space',
        width: 80,
        height: 50,
        obstacles: [],
        pads: [],
        spawns: ids.map((_, i) => ({ x: 6 + i * 10, y: 25 })),
    }
    const game = createGame(arena, ids, durationMs, createRng(1), 'infection')
    game.nextItemAtMs = Number.POSITIVE_INFINITY
    game.nextPortalAtMs = Number.POSITIVE_INFINITY

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

const infected = (game: GameState) => game.players.filter(p => p.infectedAtMs !== null).map(p => p.id)

/** Makes `id` patient zero (awake), and everyone else clean. */
function patientZero(game: GameState, id: number) {
    for (const p of game.players) {
        p.infectedAtMs = p.id === id ? 0 : null
        p.frozenMs = 0
    }
}

/** Puts `carrier` right next to `prey`. */
function touch(game: GameState, carrier: number, prey: number) {
    const a = player(game, carrier)
    const b = player(game, prey)
    a.x = b.x - 1.5
    a.y = b.y
}

describe('Infection', () => {
    test('one patient zero starts infected and frozen, with no potato and no fuse, whatever the seed', () => {
        for (let seed = 0; seed < 50; seed++) {
            const ids = [1, 2, 3, 4, 5]
            const arena = { ...setup().arena, spawns: ids.map((_, i) => ({ x: 6 + i * 10, y: 25 })) }
            expect(infected(createGame(arena, ids, 60_000, createRng(seed), 'infection'))).toHaveLength(1)
        }

        const game = setup()
        expect(infected(game)).toHaveLength(1)
        const zero = player(game, infected(game)[0]!)
        expect(zero.infectedAtMs).toBe(0)
        expect(zero.frozenMs).toBe(HUNTER_HEAD_START_MS)
        expect(game.holderId).toBeNull()
        expect(shakeLevel(game)).toBe(0)
    })

    test('a touch infects; the newly infected stand still a moment; nobody is out', () => {
        const game = setup()
        patientZero(game, 1)
        touch(game, 1, 3)
        const events = run(game, TICK)

        expect(events).toContainEqual({ kind: 'infected', playerId: 3, by: 1 })
        expect(infected(game).sort()).toEqual([1, 3])
        expect(player(game, 3).frozenMs).toBeGreaterThan(INFECTED_FREEZE_MS - 2 * TICK)
        expect(player(game, 1).passes).toBe(1)
        expect(game.players.some(p => p.out)).toBe(false)
    })

    test('a catch goes off like a blast: everyone near is thrown clear, the carrier too', () => {
        const game = setup(5)
        patientZero(game, 1)
        const prey = player(game, 3)
        touch(game, 1, 3)
        // Two bystanders, one close, one far.
        Object.assign(player(game, 2), { x: prey.x + 3, y: prey.y, vx: 0, vy: 0 })
        Object.assign(player(game, 5), { x: prey.x, y: prey.y + 20, vx: 0, vy: 0 })
        const events = run(game, TICK)

        expect(events.filter(e => e.kind === 'infected')).toHaveLength(1)
        expect(player(game, 2).vx).toBeGreaterThan(10)
        expect(player(game, 1).vx).toBeLessThan(-10)
        expect(player(game, 5).vy).toBe(0)
        expect(Math.hypot(player(game, 3).vx, player(game, 3).vy)).toBe(0)
    })

    test('one person at a time: two touching the carrier at once, only one is caught', () => {
        const game = setup(4)
        patientZero(game, 1)
        const carrier = player(game, 1)
        Object.assign(player(game, 2), { x: carrier.x + 1.5, y: carrier.y })
        Object.assign(player(game, 3), { x: carrier.x - 1.5, y: carrier.y })
        const events = run(game, TICK)

        expect(events.filter(e => e.kind === 'infected')).toHaveLength(1)
        expect(infected(game)).toHaveLength(2)
        // Still flying from the blast: no second catch on the way.
        expect(run(game, 250).filter(e => e.kind === 'infected')).toEqual([])
    })

    test('a frozen carrier infects nobody, and a shield holds', () => {
        const game = setup()
        patientZero(game, 1)
        player(game, 1).frozenMs = 1000
        touch(game, 1, 2)
        run(game, TICK)
        expect(infected(game)).toEqual([1])

        player(game, 1).frozenMs = 0
        player(game, 2).shieldMs = SHIELD_MS
        touch(game, 1, 2)
        run(game, TICK)
        expect(infected(game)).toEqual([1])
    })

    test('the infected move faster than the clean', () => {
        const game = setup()
        patientZero(game, 1)
        const right: ReadonlyMap<number, Input> = new Map([
            [1, { dx: 0, dy: 1 }],
            [2, { dx: 0, dy: 1 }],
        ])
        run(game, 2000, right)

        expect(Math.hypot(player(game, 1).vx, player(game, 1).vy)).toBeGreaterThan(MAX_SPEED)
        expect(Math.hypot(player(game, 2).vx, player(game, 2).vy)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
    })

    test('ends when one clean player is left, and they win', () => {
        const game = setup(3)
        patientZero(game, 1)
        touch(game, 1, 2)
        const events = run(game, TICK)

        expect(game.ended).toBe(true)
        expect(events.at(-1)).toEqual({ kind: 'ended', survivorIds: [3] })
    })

    test('at the timer every clean player wins; time clean is counted', () => {
        const game = setup(4, 2000)
        patientZero(game, 1)
        run(game, 2000)

        expect(game.ended).toBe(true)
        expect(winnerIds(game).sort()).toEqual([2, 3, 4])
        expect(player(game, 2).holdMs).toBe(2000)
        expect(player(game, 1).holdMs).toBe(0)
    })

    test('if everyone is caught at once, the last caught win', () => {
        const game = setup(3)
        patientZero(game, 1)
        player(game, 2).infectedAtMs = 500
        player(game, 3).infectedAtMs = 500

        expect(winnerIds(game).sort()).toEqual([2, 3])
    })

    test('when every infected player leaves, the clean win', () => {
        const game = setup(4)
        patientZero(game, 1)
        const events = removePlayer(game, 1, createRng(1))

        expect(game.ended).toBe(true)
        expect(events.at(-1)).toEqual({ kind: 'ended', survivorIds: [2, 3, 4] })
    })
})
