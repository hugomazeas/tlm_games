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
 * It also keeps every player's positions at the same 50 ms cadence and its own past actions (the
 * short-term memory features of obs spec 4).
 *
 * Call `steer` once per server tick, before the simulation steps. One pilot per seat and per game.
 */
import type { GameState, Input } from '../sim/game.ts'
import { computeSeatNav, longHistory, MotionHistory, NavGrid, VisitMap } from './nav.ts'
import { observe } from './observation.ts'
import { actionInput, createPolicyState, policyLogits, stickyAction, type TrainedPolicy } from './policy.ts'

/** Ticks per decision when the policy does not say (the training runs used 4: one decision per 200 ms). */
export const DEFAULT_ACTION_REPEAT = 4
/** The training environment's tick. */
export const PILOT_TICK_MS = 50
/** Tolerance on game-time comparisons, should a step length ever be fractional. */
const EPS_MS = 1e-6

export class TrainedPilot {
    actionRepeat: number
    private readonly nav: NavGrid
    private motion: MotionHistory | null = null
    /** Ten seconds of the seat's positions and its visit map (obs spec 6). */
    private long: MotionHistory | null = null
    private readonly visits: VisitMap
    private readonly trails = new Map<number, MotionHistory>()
    private readonly actions: number[] = []
    /** The policy's memory (GRU state) for this seat and game; null without one. */
    private state: Float64Array | null
    /** Game time of the last motion sample and of the next decision. */
    private sampledAtMs = 0
    private nextDecisionMs = 0
    private input: Input = { dx: 0, dy: 0 }
    /** The observation of the last decision (tests compare it with the training environment's). */
    lastObservation: number[] | null = null
    lastAction = 0

    constructor(
        public policy: TrainedPolicy,
        readonly game: GameState,
        readonly seat: number,
        /** Picks the action from an observation; the policy's (sticky) argmax unless a test replays recorded actions. */
        private readonly choose?: (obs: number[]) => number,
        /** Game time before the first decision: AI seats of one game spread their decisions over different ticks. */
        readonly startDelayMs = 0
    ) {
        this.actionRepeat = policy.config.action_repeat ?? DEFAULT_ACTION_REPEAT
        this.nav = new NavGrid(game.arena)
        this.visits = new VisitMap(game.arena.width, game.arena.height)
        this.state = createPolicyState(policy)
    }

    /**
     * Switches to another policy mid-game (a Killer hunter's role changing hands). The motion history,
     * visit map and past actions carry over; the policy's own memory starts afresh, and the next decision
     * comes on the new policy's cadence.
     */
    usePolicy(policy: TrainedPolicy): void {
        this.policy = policy
        this.state = createPolicyState(policy)
        this.actionRepeat = policy.config.action_repeat ?? DEFAULT_ACTION_REPEAT
    }

    /** The steering for this tick. `game` must be the game the pilot was made for. */
    steer(game: GameState): Input {
        if (game !== this.game) throw new Error('A pilot drives one game only')
        const me = game.players.find(p => p.id === this.seat)
        if (!me) throw new Error(`Unknown seat ${this.seat}`)
        const t = game.elapsedMs
        if (!this.motion) {
            this.motion = new MotionHistory(me.x, me.y)
            this.long = longHistory(me.x, me.y)
            this.visits.visit(me.x, me.y, t)
            for (const p of game.players) this.trails.set(p.id, new MotionHistory(p.x, p.y))
            this.sampledAtMs = t
            this.nextDecisionMs = t + this.startDelayMs
        }
        // One sample per 50 ms of game time since the last one; a longer step repeats the position.
        while (this.sampledAtMs + PILOT_TICK_MS <= t + EPS_MS) {
            this.motion.push(me.x, me.y)
            this.long?.push(me.x, me.y)
            for (const p of game.players) this.trails.get(p.id)?.push(p.x, p.y)
            this.sampledAtMs += PILOT_TICK_MS
            if (!me.out) this.visits.visit(me.x, me.y, this.sampledAtMs)
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
                trails: this.trails,
                actions: this.actions,
                long: this.long ?? undefined,
                visits: this.visits,
            })
            this.lastObservation = obs
            // The memory is updated at every decision, also when a test replays recorded actions.
            const logits = policyLogits(this.policy, obs, this.state)
            this.lastAction = this.choose
                ? this.choose(obs)
                : stickyAction(
                      logits,
                      this.actions.length > 0 ? this.lastAction : null,
                      this.policy.config.stickiness ?? 0
                  )
            this.actions.push(this.lastAction)
            // Only the last few are observed.
            if (this.actions.length > 8) this.actions.splice(0, this.actions.length - 8)
            this.input = actionInput(this.lastAction)
        }
        return this.input
    }
}
