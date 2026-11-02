import type { Rng } from '../../sim/rng.ts'
import { BUTTON, type GameEvent, type InputFrame, type PlayerState, type SelfState } from '../protocol.ts'
import { aimDirection, eyeOf, fireShot, MAX_HEALTH, type Target, WEAPON } from './combat.ts'
import { type Body, bodyAt, isJetting, type MoveInput, STEP_MS, stepBody } from './movement.ts'
import type { FpsWorld } from './world.ts'

/**
 * The game itself, one 60 Hz step at a time: bodies, inputs, the blaster, deaths and respawns.
 * Pure (seeded random, no clock): the lobby around it decides what a kill is worth.
 */

const steps = (ms: number): number => Math.round(ms / STEP_MS)

export const RESPAWN_STEPS = steps(3000)
export const SHIELD_STEPS = steps(1500)
/** How far back a shot may be judged (200 ms): further, and the shooter's lag is their problem. */
export const MAX_REWIND_STEPS = steps(200)
/** Inputs waiting per player (half a second); a flood drops the oldest. */
const MAX_QUEUED = 30
const SHOT_STEPS = steps(WEAPON.intervalMs)
const RELOAD_STEPS = steps(WEAPON.reloadMs)
/** Under the floor (somehow): back to a spawn. */
const LOST_BELOW = -2

interface Fighter {
    id: string
    body: Body
    yaw: number
    pitch: number
    jetting: boolean
    health: number
    alive: boolean
    /** Down until this step. */
    respawnAt: number
    shieldUntil: number
    ammo: number
    nextShotAt: number
    /** Reloading until this step (0: not). */
    reloadUntil: number
    queue: InputFrame[]
    /** The last frame queued (seq), and the last one used. */
    queuedSeq: number
    ackSeq: number
    last: InputFrame | null
}

export type ArenaEvent = GameEvent | { type: 'damage'; by: string; target: string; amount: number; headshot: boolean }

export class Arena {
    /** Steps run so far. */
    step = 0
    private readonly fighters = new Map<string, Fighter>()
    /** Everyone's feet at each of the last steps, for rewinding shots. */
    private readonly history: Array<{ step: number; at: Map<string, Target> }> = []

    constructor(
        private readonly world: FpsWorld,
        private readonly random: Rng
    ) {}

    has(id: string): boolean {
        return this.fighters.has(id)
    }

    ids(): string[] {
        return [...this.fighters.keys()]
    }

    /** In, at the spawn point furthest from everyone. */
    add(id: string): ArenaEvent[] {
        if (this.fighters.has(id)) return []
        const fighter: Fighter = {
            id,
            body: bodyAt(0, 0, 0),
            yaw: 0,
            pitch: 0,
            jetting: false,
            health: MAX_HEALTH,
            alive: false,
            respawnAt: 0,
            shieldUntil: 0,
            ammo: WEAPON.magazine,
            nextShotAt: 0,
            reloadUntil: 0,
            queue: [],
            queuedSeq: 0,
            ackSeq: 0,
            last: null,
        }
        this.fighters.set(id, fighter)

        return [this.spawn(fighter)]
    }

    remove(id: string): void {
        this.fighters.delete(id)
    }

    /** Everyone back at a spawn, fresh: a new match. */
    respawnAll(): ArenaEvent[] {
        const events: ArenaEvent[] = []
        for (const fighter of this.fighters.values()) fighter.alive = false
        for (const fighter of this.fighters.values()) events.push(this.spawn(fighter))

        return events
    }

    /** A player's frames, in order; old and repeated ones are dropped. */
    queue(id: string, frames: readonly InputFrame[]): void {
        const fighter = this.fighters.get(id)
        if (!fighter) return
        for (const frame of frames) {
            if (frame.seq <= fighter.queuedSeq) continue
            fighter.queue.push(frame)
            fighter.queuedSeq = frame.seq
        }
        if (fighter.queue.length > MAX_QUEUED) fighter.queue.splice(0, fighter.queue.length - MAX_QUEUED)
    }

    /** One step: each player uses one frame (or keeps moving on their last), then the dead come back. */
    advance(): ArenaEvent[] {
        this.step++
        const events: ArenaEvent[] = []
        for (const fighter of this.fighters.values()) {
            const fresh = fighter.queue.shift()
            if (fresh) fighter.ackSeq = fresh.seq
            // Nothing new from them this step: keep going the way they were, without firing again.
            const frame =
                fresh ??
                (fighter.last
                    ? { ...fighter.last, buttons: fighter.last.buttons & ~(BUTTON.fire | BUTTON.reload) }
                    : null)
            if (frame) fighter.last = frame
            if (!fighter.alive) continue
            if (frame) {
                fighter.yaw = frame.yaw
                fighter.pitch = frame.pitch
            }
            const input = moveInput(frame, fighter.yaw)
            fighter.jetting = isJetting(fighter.body, input)
            fighter.body = stepBody(this.world, fighter.body, input)
            if (fighter.body.y < LOST_BELOW) {
                events.push(this.spawn(fighter))
                continue
            }
            if (frame) this.weapon(fighter, frame, events)
        }
        for (const fighter of this.fighters.values()) {
            if (!fighter.alive && this.step >= fighter.respawnAt) events.push(this.spawn(fighter))
        }
        this.remember()

        return events
    }

    /** Everyone, as the others see them. */
    states(): PlayerState[] {
        return [...this.fighters.values()].map(f => ({
            id: f.id,
            x: round(f.body.x, 3),
            y: round(f.body.y, 3),
            z: round(f.body.z, 3),
            yaw: round(f.yaw, 3),
            pitch: round(f.pitch, 3),
            alive: f.alive,
            jet: f.alive && f.jetting,
            shielded: this.shielded(f),
        }))
    }

    /** One player, in full (null when they aren't in). */
    self(id: string): SelfState | null {
        const f = this.fighters.get(id)
        if (!f) return null

        return {
            body: { ...f.body },
            alive: f.alive,
            health: f.health,
            ammo: f.ammo,
            reloading: f.reloadUntil > this.step,
            shielded: this.shielded(f),
            respawnInMs: f.alive ? null : Math.max(0, Math.round((f.respawnAt - this.step) * STEP_MS)),
        }
    }

    /** The last frame of theirs the server used. */
    ack(id: string): number {
        return this.fighters.get(id)?.ackSeq ?? 0
    }

    private weapon(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        if (fighter.reloadUntil > 0 && this.step >= fighter.reloadUntil) {
            fighter.reloadUntil = 0
            fighter.ammo = WEAPON.magazine
        }
        const reloading = fighter.reloadUntil > 0
        if (frame.buttons & BUTTON.reload && !reloading && fighter.ammo < WEAPON.magazine) {
            fighter.reloadUntil = this.step + RELOAD_STEPS
            return
        }
        if (!(frame.buttons & BUTTON.fire) || reloading || this.step < fighter.nextShotAt) return

        fighter.nextShotAt = this.step + SHOT_STEPS
        fighter.shieldUntil = 0
        fighter.ammo--
        if (fighter.ammo === 0) fighter.reloadUntil = this.step + RELOAD_STEPS

        const origin = eyeOf(fighter.body)
        const direction = aimDirection(frame.yaw, frame.pitch)
        const shot = fireShot(this.world, origin, direction, this.targetsAt(frame.view, fighter.id))
        const victim = shot.hit ? this.fighters.get(shot.hit.id) : undefined
        const headshot = shot.hit?.headshot ?? false
        events.push({
            type: 'shot',
            by: fighter.id,
            from: [round(origin.x, 3), round(origin.y, 3), round(origin.z, 3)],
            to: [round(shot.end.x, 3), round(shot.end.y, 3), round(shot.end.z, 3)],
            hit: victim?.id ?? null,
            headshot,
        })
        if (!victim || !victim.alive || this.shielded(victim)) return

        const amount = WEAPON.damage * (headshot ? WEAPON.headshot : 1)
        victim.health = Math.max(0, victim.health - amount)
        events.push({ type: 'damage', by: fighter.id, target: victim.id, amount, headshot })
        if (victim.health > 0) return

        victim.alive = false
        victim.jetting = false
        victim.respawnAt = this.step + RESPAWN_STEPS
        events.push({ type: 'kill', killer: fighter.id, victim: victim.id, headshot })
    }

    /** The others where the shooter saw them: `view` steps back, at most MAX_REWIND_STEPS, alive then and now. */
    private targetsAt(view: number, shooter: string): Target[] {
        const wanted = Math.max(this.step - MAX_REWIND_STEPS, Math.min(this.step, Math.round(view)))
        const past = this.history.find(h => h.step === wanted)
        const targets: Target[] = []
        for (const fighter of this.fighters.values()) {
            if (fighter.id === shooter || !fighter.alive) continue
            targets.push(past?.at.get(fighter.id) ?? { id: fighter.id, ...fighter.body })
        }

        return targets
    }

    private remember(): void {
        const at = new Map<string, Target>()
        for (const f of this.fighters.values()) {
            if (f.alive) at.set(f.id, { id: f.id, x: f.body.x, y: f.body.y, z: f.body.z })
        }
        this.history.push({ step: this.step, at })
        while (this.history.length > MAX_REWIND_STEPS + 1) this.history.shift()
    }

    private spawn(fighter: Fighter): ArenaEvent {
        const point = this.spawnPoint(fighter.id)
        fighter.body = bodyAt(point.position[0], 0.02, point.position[2])
        fighter.yaw = point.yaw
        fighter.pitch = 0
        fighter.jetting = false
        fighter.health = MAX_HEALTH
        fighter.alive = true
        fighter.shieldUntil = this.step + SHIELD_STEPS
        fighter.ammo = WEAPON.magazine
        fighter.reloadUntil = 0
        fighter.nextShotAt = 0

        return { type: 'spawn', id: fighter.id }
    }

    /** The spawn point furthest from the nearest other living player (a random one when alone). */
    private spawnPoint(id: string) {
        const points = this.world.spawnPoints
        const others = [...this.fighters.values()].filter(f => f.id !== id && f.alive)
        if (others.length === 0) return points[Math.floor(this.random() * points.length)]!

        let best = points[0]!
        let bestDistance = -1
        for (const point of points) {
            const nearest = Math.min(
                ...others.map(o => Math.hypot(o.body.x - point.position[0], o.body.z - point.position[2]))
            )
            // A little random so two equally safe spots take turns.
            const score = nearest + this.random() * 0.5
            if (score > bestDistance) {
                best = point
                bestDistance = score
            }
        }

        return best
    }

    private shielded(fighter: Fighter): boolean {
        return fighter.alive && this.step < fighter.shieldUntil
    }
}

function moveInput(frame: InputFrame | null, yaw: number): MoveInput {
    if (!frame) return { forward: 0, strafe: 0, yaw, run: false, jet: false }

    return {
        forward: frame.forward,
        strafe: frame.strafe,
        yaw: frame.yaw,
        run: (frame.buttons & BUTTON.run) !== 0,
        jet: (frame.buttons & BUTTON.jet) !== 0,
    }
}

function round(value: number, decimals: number): number {
    const k = 10 ** decimals
    return Math.round(value * k) / k
}
