import { describe, expect, test } from 'bun:test'
import { generateArena } from './arena.ts'
import {
    createGame,
    FIRST_PORTAL_MS,
    type GameEvent,
    type GameState,
    type Input,
    PORTAL_COOLDOWN_MS,
    PORTAL_LIFETIME_MS,
    PORTAL_SPREAD,
    step,
} from './game.ts'
import { createRng } from './rng.ts'

const TICK = 50
const still: ReadonlyMap<number, Input> = new Map()

function setup(): GameState {
    const arena = generateArena(5, 'open_space', 4)
    // A long fuse: nobody blows up while the portals are watched.
    const game = createGame(arena, [1, 2, 3, 4], 120_000, createRng(2), 'king')
    game.nextItemAtMs = Number.POSITIVE_INFINITY

    return game
}

function run(game: GameState, ms: number, inputs = still): GameEvent[] {
    const events: GameEvent[] = []
    for (let t = 0; t < ms; t += TICK) events.push(...step(game, inputs, TICK, createRng(t + 7)))

    return events
}

describe('portals', () => {
    test('the first pair opens on time, far apart, and closes after its lifetime', () => {
        const game = setup()
        run(game, FIRST_PORTAL_MS - TICK)
        expect(game.portals).toEqual([])

        run(game, TICK)
        const [portal] = game.portals
        if (!portal) throw new Error('no portal')
        expect(Math.hypot(portal.a.x - portal.b.x, portal.a.y - portal.b.y)).toBeGreaterThanOrEqual(
            game.arena.width * PORTAL_SPREAD
        )
        expect(game.portals).toHaveLength(1)

        run(game, PORTAL_LIFETIME_MS)
        expect(game.portals).toEqual([])
    })

    test('stepping in one end puts you out of the other, keeping your speed, then they ignore you a moment', () => {
        const game = setup()
        // Bare floor: nothing to push the traveller off the exit.
        game.arena = { ...game.arena, obstacles: [], pads: [] }
        game.portals = [{ id: 1, a: { x: 8, y: 8 }, b: { x: 32, y: 18 }, expiresAtMs: 60_000 }]
        game.nextPortalAtMs = Number.POSITIVE_INFINITY
        const traveller = game.players[0]!
        traveller.frozenMs = 0
        Object.assign(traveller, { x: 8, y: 8, vx: 3, vy: 0 })

        const events = run(game, TICK)
        expect(events).toContainEqual({ kind: 'teleport', playerId: traveller.id, portalId: 1 })
        expect(Math.hypot(traveller.x - 32, traveller.y - 18)).toBeLessThan(1)
        expect(traveller.vx).toBeGreaterThan(0)
        expect(traveller.portalCooldownMs).toBeGreaterThan(PORTAL_COOLDOWN_MS - 2 * TICK)

        // Still standing on the exit: no bounce back until the cooldown runs out.
        Object.assign(traveller, { x: 32, y: 18, vx: 0, vy: 0 })
        expect(run(game, TICK).filter(e => e.kind === 'teleport')).toEqual([])
    })

    test('only one pair is open at a time', () => {
        const game = setup()
        run(game, 100_000)

        expect(game.portals.length).toBeLessThanOrEqual(1)
        expect(game.nextPortalId).toBeGreaterThan(2)
    })
})
