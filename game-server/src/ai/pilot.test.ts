import { describe, expect, test } from 'bun:test'
import { generateArena } from '../sim/arena.ts'
import { createGame, type GameMode, step } from '../sim/game.ts'
import { createRng } from '../sim/rng.ts'
import type { ThemeId } from '../sim/themes.ts'
import { OBS_SIZE } from './observation.ts'
import { TrainedPilot } from './pilot.ts'
import { ACTION_COUNT, actionInput, bestAction, checkPolicy, policyLogits, type TrainedPolicy } from './policy.ts'

const TICK_MS = 50

interface RecordedGame {
    seed: number
    theme: ThemeId
    mode: GameMode
    duration_ms: number
    players: number
    seat: number
    action_repeat: number
    /** Per tick, every seat's steering: [seat, dx, dy]. */
    inputs: Array<Array<[number, number, number]>>
    /** The training environment's observation of `seat` at each decision (every `action_repeat` ticks). */
    obs: number[][]
}

const fixture = async <T>(name: string): Promise<T> => Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).json()
const recorded = await fixture<RecordedGame[]>('training-observations.json')
const reference = await fixture<{ obs: number[][]; logits: number[][]; actions: number[] }>(
    'trained-policy-logits.json'
)
const policy = (await Bun.file(new URL('./trained-policy.json', import.meta.url)).json()) as TrainedPolicy

/** A policy with the right shape and all-zero weights: enough to drive a pilot's observations. */
function zeroPolicy(actionRepeat: number): TrainedPolicy {
    return {
        format: 'hot-potato-policy',
        version: 1,
        obs_spec_version: 2,
        action_spec_version: 1,
        obs_size: OBS_SIZE,
        action_count: ACTION_COUNT,
        activation: 'tanh',
        obs_norm: { mean: new Array(OBS_SIZE).fill(0), var: new Array(OBS_SIZE).fill(1), eps: 1e-8, clip: 10 },
        layers: [
            {
                weights: Array.from({ length: ACTION_COUNT }, () => new Array(OBS_SIZE).fill(0)),
                biases: new Array(ACTION_COUNT).fill(0),
            },
        ],
        trained_steps: 0,
        config: { action_repeat: actionRepeat },
    }
}

describe('trained pilot', () => {
    // Games recorded from the training environment: seat 0 played a fixed action sequence, the other seats
    // were heuristic bots (one game on an arena with a U-shaped wall, one with a second external seat).
    // Replaying their inputs, the pilot must see exactly what the policy saw in training, items included
    // (recorded with this game's item timing).
    test.each(recorded.map((game, i) => [i, game] as const))(
        'observes recorded game %i like the training environment',
        (_, recording) => {
            const rng = createRng(recording.seed)
            const arena = generateArena(recording.seed, recording.theme, recording.players)
            const game = createGame(
                arena,
                Array.from({ length: recording.players }, (_, i) => i),
                recording.duration_ms,
                rng,
                recording.mode
            )
            const pilot = new TrainedPilot(zeroPolicy(recording.action_repeat), game, recording.seat)
            const ticks = (recording.obs.length - 1) * recording.action_repeat
            for (let tick = 0; tick <= ticks; tick++) {
                pilot.steer(game)
                if (tick % recording.action_repeat === 0) {
                    const expected = recording.obs[tick / recording.action_repeat] as number[]
                    const seen = pilot.lastObservation as number[]
                    expect(seen).toHaveLength(OBS_SIZE)
                    for (let i = 0; i < OBS_SIZE; i++) expect(seen[i] as number).toBeCloseTo(expected[i] as number, 8)
                }
                if (tick === ticks) break
                const inputs = recording.inputs[tick] as Array<[number, number, number]>
                step(game, new Map(inputs.map(([seat, dx, dy]) => [seat, { dx, dy }])), TICK_MS, rng)
            }
        }
    )

    test('the recordings cover the item features', () => {
        // Slot k's "present" flag: after 16 own features and 7 x 8 for the other players.
        const seesItem = (obs: number[]) => Array.from({ length: 10 }, (_, k) => obs[72 + 3 * k + 2]).includes(1)
        for (const game of recorded) expect(game.obs.filter(seesItem).length).toBeGreaterThan(5)
    })

    test('decides on game time when the server step length varies', () => {
        const decisionTimes = (steps: number[]) => {
            const rng = createRng(9)
            const game = createGame(generateArena(9, 'open_space', 4), [1, 2, 3, 4], 90_000, rng)
            const pilot = new TrainedPilot(zeroPolicy(4), game, 1)
            const times: number[] = []
            let last: number[] | null = null
            for (const dt of steps) {
                pilot.steer(game)
                if (pilot.lastObservation !== last) times.push(game.elapsedMs)
                last = pilot.lastObservation
                step(game, new Map(), dt, rng)
            }
            return times
        }
        expect(decisionTimes(new Array(16).fill(50))).toEqual([0, 200, 400, 600])
        expect(decisionTimes(new Array(8).fill(100))).toEqual([0, 200, 400, 600])
        expect(decisionTimes([47, 53, 61, 39, 50, 70, 30, 50, 50, 50])).toEqual([0, 200, 400])
    })

    test('works with any player ids, negative ones included', () => {
        const rng = createRng(5)
        const game = createGame(generateArena(5, 'open_space', 3), [12, -1, -2], 90_000, rng)
        const biased = zeroPolicy(4)
        ;(biased.layers[0] as { biases: number[] }).biases[9] = 1 // action 9: left
        const pilot = new TrainedPilot(biased, game, -1)
        for (let tick = 0; tick < 8; tick++) {
            const input = pilot.steer(game)
            expect(input.dx).toBe(-1)
            step(game, new Map([[-1, input]]), TICK_MS, rng)
        }
        expect(() => pilot.steer(createGame(game.arena, [-1], 90_000, rng))).toThrow('one game')
    })
})

describe('bundled policy', () => {
    test('fits the observation layout and action table', () => {
        expect(() => checkPolicy(policy)).not.toThrow()
        expect(policy.config.action_repeat).toBe(4)
    })

    // Logits from the training tools' reference forward pass (numpy, float64) on recorded observations.
    test('reproduces the training tools logits and actions', () => {
        reference.obs.forEach((row, i) => {
            const out = policyLogits(policy, row)
            out.forEach((value, j) => expect(value).toBeCloseTo((reference.logits[i] as number[])[j] as number, 9))
            expect(bestAction(out)).toBe(reference.actions[i] as number)
        })
    })

    test('action table and layout check', () => {
        expect(actionInput(0)).toEqual({ dx: 0, dy: 0 })
        expect(actionInput(1).dx).toBeCloseTo(1)
        expect(actionInput(5).dy).toBeCloseTo(1)
        expect(actionInput(13).dy).toBeCloseTo(-1)
        expect(bestAction([0, 2, 2, 1])).toBe(1)
        expect(() => checkPolicy({ ...zeroPolicy(4), obs_size: 123 })).toThrow('does not match')
    })
})
