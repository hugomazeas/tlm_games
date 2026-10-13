/**
 * Drives one seat with a trained policy, the way the training environment did: every
 * `actionRepeat` ticks of 50 ms it refreshes the navigation grid, observes and picks an action,
 * and it holds that steering until the next decision. It also samples the seat's position every
 * 50 ms (the motion-memory features).
 *
 * Both run on game time, not on calls: the server's step length varies (a late timer gives a
 * longer step), and the policy was trained on a fixed 50 ms tick. With 50 ms steps this is
 * exactly the training environment's schedule.
 *
 * Call `steer` once per server tick, before the simulation steps. One pilot per seat and per game.
 */
import type { GameState, Input } from '../sim/game.ts'
import { computeSeatNav, MotionHistory, NavGrid } from './nav.ts'
import { observe } from './observation.ts'
import { actionInput, bestAction, policyLogits, type TrainedPolicy } from './policy.ts'

/** Ticks per decision when the policy does not say (the training runs used 4: one decision per 200 ms). */
export const DEFAULT_ACTION_REPEAT = 4
/** The training environment's tick. */
export const PILOT_TICK_MS = 50
/** Tolerance on game-time comparisons, should a step length ever be fractional. */
const EPS_MS = 1e-6

export class TrainedPilot {
    readonly actionRepeat: number
    private readonly nav: NavGrid
    private motion: MotionHistory | null = null
    /** Game time of the last motion sample and of the next decision. */
    private sampledAtMs = 0
    private nextDecisionMs = 0
    private input: Input = { dx: 0, dy: 0 }
    /** The observation of the last decision (tests compare it with the training environment's). */
    lastObservation: number[] | null = null
    lastAction = 0

    constructor(
        private readonly policy: TrainedPolicy,
        readonly game: GameState,
        readonly seat: number
    ) {
        this.actionRepeat = policy.config.action_repeat ?? DEFAULT_ACTION_REPEAT
        this.nav = new NavGrid(game.arena)
    }

    /** The steering for this tick. `game` must be the game the pilot was made for. */
    steer(game: GameState): Input {
        if (game !== this.game) throw new Error('A pilot drives one game only')
        const me = game.players.find(p => p.id === this.seat)
        if (!me) throw new Error(`Unknown seat ${this.seat}`)
        const t = game.elapsedMs
        if (!this.motion) {
            this.motion = new MotionHistory(me.x, me.y)
            this.sampledAtMs = t
            this.nextDecisionMs = t
        }
        // One sample per 50 ms of game time since the last one; a longer step repeats the position.
        while (this.sampledAtMs + PILOT_TICK_MS <= t + EPS_MS) {
            this.motion.push(me.x, me.y)
            this.sampledAtMs += PILOT_TICK_MS
        }
        if (t + EPS_MS >= this.nextDecisionMs) {
            const period = this.actionRepeat * PILOT_TICK_MS
            this.nextDecisionMs += period
            // After a long stall, restart the schedule from now instead of deciding on every call.
            if (this.nextDecisionMs <= t) this.nextDecisionMs = t + period
            this.nav.refresh(game.elapsedMs)
            const obs = observe(game, this.seat, {
                nav: computeSeatNav(this.nav, game, this.seat),
                motion: this.motion,
            })
            this.lastObservation = obs
            this.lastAction = bestAction(policyLogits(this.policy, obs))
            this.input = actionInput(this.lastAction)
        }
        return this.input
    }
}
