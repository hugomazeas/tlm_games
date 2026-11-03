import type { Rng } from '../../sim/rng.ts'
import {
    type BuffKind,
    BUTTON,
    type GameEvent,
    type InputFrame,
    type PlayerState,
    type SelfState,
    type Team,
    type Weapon,
} from '../protocol.ts'
import { HEALTH_PACK, MAGAZINE_FACTOR, PICKUP_HEIGHT, PICKUP_REACH, PICKUPS } from './places.ts'
import {
    aimDirection,
    eyeOf,
    fireShot,
    MAX_HEALTH,
    STAPLER,
    SWITCH_MS,
    swingStapler,
    type Target,
    WEAPON,
} from './combat.ts'
import { type Body, bodyAt, isJetting, moveOf, STEP_MS, stepBody } from './movement.ts'
import type { FpsWorld } from './world.ts'

/**
 * The game itself, one 60 Hz step at a time: bodies, inputs, the blaster and the stapler, deaths and respawns.
 * Pure (seeded random, no clock): the lobby around it decides what a kill is worth.
 */

const steps = (ms: number): number => Math.round(ms / STEP_MS)

export const RESPAWN_STEPS = steps(3000)
export const SHIELD_STEPS = steps(1500)
/** How far back a shot may be judged (200 ms): further, and the shooter's lag is their problem. */
export const MAX_REWIND_STEPS = steps(200)
/** Inputs waiting per player (half a second); a flood drops the oldest. */
const MAX_QUEUED = 30
/**
 * Frames a player may have used ahead of the clock: a late batch (network jitter, a slow
 * browser frame, a server hiccup) is caught up at once, but nobody moves faster than real time
 * for longer than this.
 */
export const MAX_BURST = 30
/** No frames for this long (a frozen tab): gravity takes over until they're back. */
const STARVED_STEPS = steps(500)
const SHOT_STEPS = steps(WEAPON.intervalMs)
const RELOAD_STEPS = steps(WEAPON.reloadMs)
const SWING_STEPS = steps(STAPLER.intervalMs)
const SWITCH_STEPS = steps(SWITCH_MS)
const IDLE: InputFrame = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0 }
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
    /**
     * Frames of theirs used so far: their own clock. The blaster's timings count in it, so a
     * batch caught up in one server step fires exactly as it did in their browser.
     */
    clock: number
    /** In hand, and usable from this frame of theirs (switching takes a moment). */
    weapon: Weapon
    readyAt: number
    nextShotAt: number
    nextSwingAt: number
    /** Reloading until this frame of theirs (0: not). */
    reloadUntil: number
    queue: InputFrame[]
    /** The last frame queued (seq), and the last one used. */
    queuedSeq: number
    ackSeq: number
    /** Frames they may still use ahead of the clock (one more each step, up to MAX_BURST). */
    budget: number
    /** Steps since their last frame. */
    starved: number
    /** Their side in team deathmatch (teammates can't hurt each other), null otherwise. */
    team: Team | null
    /** Kills since they last went down. */
    lifeKills: number
    /** Powers from pickups, until these steps (0: none); all lost going down. The jetpack's lives in the body. */
    magazineUntil: number
    headshotUntil: number
}

export type ArenaEvent = GameEvent | { type: 'damage'; by: string; target: string; amount: number; headshot: boolean }

export class Arena {
    /** Steps run so far. */
    step = 0
    private readonly fighters = new Map<string, Fighter>()
    /** Everyone's feet at each of the last steps, for rewinding shots. */
    private readonly history: Array<{ step: number; at: Map<string, Target> }> = []
    /** Each pickup spot: there to take from this step on. */
    private readonly pickupAt: number[]

    constructor(
        private readonly world: FpsWorld,
        private readonly random: Rng
    ) {
        this.pickupAt = world.pickups.map(() => 0)
    }

    has(id: string): boolean {
        return this.fighters.has(id)
    }

    ids(): string[] {
        return [...this.fighters.keys()]
    }

    /** In (on a side, in team deathmatch), at the spawn point furthest from the enemy. */
    add(id: string, team: Team | null = null): ArenaEvent[] {
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
            clock: 0,
            weapon: 'blaster',
            readyAt: 0,
            nextShotAt: 0,
            nextSwingAt: 0,
            reloadUntil: 0,
            queue: [],
            queuedSeq: 0,
            ackSeq: 0,
            budget: 0,
            starved: 0,
            team,
            lifeKills: 0,
            magazineUntil: 0,
            headshotUntil: 0,
        }
        this.fighters.set(id, fighter)

        return [this.spawn(fighter)]
    }

    remove(id: string): void {
        this.fighters.delete(id)
    }

    /** Puts someone on a side (team deathmatch), or on none. */
    setTeam(id: string, team: Team | null): void {
        const fighter = this.fighters.get(id)
        if (fighter) fighter.team = team
    }

    teamOf(id: string): Team | null {
        return this.fighters.get(id)?.team ?? null
    }

    /** Everyone back at a spawn, fresh, and every pickup back: a new match. */
    respawnAll(): ArenaEvent[] {
        const events: ArenaEvent[] = []
        this.pickupAt.fill(0)
        for (const fighter of this.fighters.values()) fighter.alive = false
        for (const fighter of this.fighters.values()) events.push(this.spawn(fighter))

        return events
    }

    /** Which pickups are there to take, by spot. */
    pickups(): boolean[] {
        return this.pickupAt.map(at => this.step >= at)
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

    /**
     * One step: each player uses every frame of theirs that has arrived (within their budget),
     * each one exactly as their browser did, so the server lands where they predicted and
     * nothing waits in a queue. Then the dead come back.
     */
    advance(): ArenaEvent[] {
        this.step++
        const events: ArenaEvent[] = []
        for (const fighter of this.fighters.values()) {
            fighter.budget = Math.min(MAX_BURST, fighter.budget + 1)
            let used = 0
            while (fighter.queue.length > 0 && fighter.budget >= 1) {
                const frame = fighter.queue.shift()!
                fighter.budget--
                fighter.ackSeq = frame.seq
                this.play(fighter, frame, events)
                used++
            }
            fighter.starved = used > 0 ? 0 : fighter.starved + 1
            // A frozen tab: they don't hang in the air forever. Their frames, when they come back, carry on from here.
            if (fighter.starved > STARVED_STEPS && fighter.alive) {
                fighter.body = stepBody(this.world, fighter.body, moveOf({ ...IDLE, yaw: fighter.yaw }))
                fighter.jetting = false
            }
            if (fighter.alive) this.collect(fighter, events)
            // A big magazine running out: back to the usual size.
            if (fighter.magazineUntil > 0 && this.step >= fighter.magazineUntil) {
                fighter.magazineUntil = 0
                fighter.ammo = Math.min(fighter.ammo, WEAPON.magazine)
            }
        }
        for (const fighter of this.fighters.values()) {
            if (!fighter.alive && this.step >= fighter.respawnAt) events.push(this.spawn(fighter))
        }
        this.remember()

        return events
    }

    /**
     * Steps the server skipped (it stalled): everyone may catch up that much more, since their
     * browsers kept making frames meanwhile.
     */
    grant(steps: number): void {
        for (const fighter of this.fighters.values()) fighter.budget = Math.min(MAX_BURST, fighter.budget + steps)
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
            health: f.alive ? f.health : 0,
            jet: f.alive && f.jetting,
            shielded: this.shielded(f),
            weapon: f.weapon,
            team: f.team,
            buffs: f.alive ? this.buffsOf(f).map(b => b.kind) : [],
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
            reloading: f.reloadUntil > f.clock,
            reloadLeftMs: f.reloadUntil > f.clock ? Math.round((f.reloadUntil - f.clock) * STEP_MS) : null,
            shielded: this.shielded(f),
            weapon: f.weapon,
            respawnInMs: f.alive ? null : Math.max(0, Math.round((f.respawnAt - this.step) * STEP_MS)),
            magazine: this.magazineOf(f),
            buffs: f.alive ? this.buffsOf(f) : [],
        }
    }

    /** Their powers and what's left of each. */
    private buffsOf(f: Fighter): Array<{ kind: BuffKind; leftMs: number }> {
        const buffs: Array<{ kind: BuffKind; leftMs: number }> = []
        const left = (until: number) => Math.round((until - this.step) * STEP_MS)
        if (f.magazineUntil > this.step) buffs.push({ kind: 'magazine', leftMs: left(f.magazineUntil) })
        if (f.body.jetBoost > 0) buffs.push({ kind: 'jetpack', leftMs: Math.round(f.body.jetBoost * STEP_MS) })
        if (f.headshotUntil > this.step) buffs.push({ kind: 'headshot', leftMs: left(f.headshotUntil) })
        return buffs
    }

    private magazineOf(f: Fighter): number {
        return f.magazineUntil > this.step ? Math.round(WEAPON.magazine * MAGAZINE_FACTOR) : WEAPON.magazine
    }

    /** Takes any pickup they're standing on (health only when hurt), and sets it to come back later. */
    private collect(f: Fighter, events: ArenaEvent[]): void {
        this.world.pickups.forEach((spot, index) => {
            if (this.step < this.pickupAt[index]!) return
            const near = Math.hypot(f.body.x - spot.x, f.body.z - spot.z) <= PICKUP_REACH
            if (!near || f.body.y > PICKUP_HEIGHT) return
            if (spot.kind === 'health' && f.health >= MAX_HEALTH) return

            const info = PICKUPS[spot.kind]
            const until = this.step + steps(info.durationMs ?? 0)
            if (spot.kind === 'health') f.health = Math.min(MAX_HEALTH, f.health + HEALTH_PACK)
            if (spot.kind === 'magazine') {
                f.magazineUntil = until
                f.ammo = this.magazineOf(f)
                f.reloadUntil = 0
            }
            if (spot.kind === 'jetpack') f.body = { ...f.body, jetBoost: steps(info.durationMs ?? 0), fuel: 1 }
            if (spot.kind === 'headshot') f.headshotUntil = until
            this.pickupAt[index] = this.step + steps(info.respawnMs)
            events.push({ type: 'pickup', by: f.id, spot: index })
        })
    }

    /** The last frame of theirs the server used. */
    ack(id: string): number {
        return this.fighters.get(id)?.ackSeq ?? 0
    }

    /** One of a player's frames: they turn, move and fire with it (frames from the dead only count). */
    private play(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        fighter.clock++
        if (!fighter.alive) return
        fighter.yaw = frame.yaw
        fighter.pitch = frame.pitch
        const input = moveOf(frame)
        fighter.jetting = isJetting(fighter.body, input)
        fighter.body = stepBody(this.world, fighter.body, input)
        if (fighter.body.y < LOST_BELOW) {
            events.push(this.spawn(fighter))
            return
        }
        // A different weapon in hand: it takes a moment before it can be used.
        const wanted = frame.weapon ?? 'blaster'
        if (wanted !== fighter.weapon) {
            fighter.weapon = wanted
            fighter.readyAt = fighter.clock + SWITCH_STEPS
            fighter.reloadUntil = 0
        }
        if (fighter.clock < fighter.readyAt) return
        if (fighter.weapon === 'stapler') this.stapler(fighter, frame, events)
        else this.blaster(fighter, frame, events)
    }

    private blaster(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        const now = fighter.clock
        const magazine = this.magazineOf(fighter)
        if (fighter.reloadUntil > 0 && now >= fighter.reloadUntil) {
            fighter.reloadUntil = 0
            fighter.ammo = magazine
        }
        // Empty (a reload cut short by a switch, say): it reloads by itself.
        if (fighter.ammo === 0 && fighter.reloadUntil === 0) fighter.reloadUntil = now + RELOAD_STEPS
        const reloading = fighter.reloadUntil > 0
        if (frame.buttons & BUTTON.reload && !reloading && fighter.ammo < magazine) {
            fighter.reloadUntil = now + RELOAD_STEPS
            return
        }
        if (!(frame.buttons & BUTTON.fire) || reloading || now < fighter.nextShotAt) return

        fighter.nextShotAt = now + SHOT_STEPS
        fighter.shieldUntil = 0
        fighter.ammo--
        if (fighter.ammo === 0) fighter.reloadUntil = now + RELOAD_STEPS

        const origin = eyeOf(fighter.body)
        const direction = aimDirection(frame.yaw, frame.pitch)
        const shot = fireShot(this.world, origin, direction, this.targetsAt(frame.view, fighter.id))
        const victim = shot.hit ? this.fighters.get(shot.hit.id) : undefined
        const headshot = shot.hit?.headshot ?? false
        // Headshot rounds: any headshot kills.
        const oneShot = headshot && fighter.headshotUntil > this.step
        const amount = this.hurts(victim)
            ? oneShot
                ? MAX_HEALTH
                : WEAPON.damage * (headshot ? WEAPON.headshot : 1)
            : 0
        events.push({
            type: 'shot',
            by: fighter.id,
            from: [round(origin.x, 3), round(origin.y, 3), round(origin.z, 3)],
            to: [round(shot.end.x, 3), round(shot.end.y, 3), round(shot.end.z, 3)],
            hit: victim?.id ?? null,
            headshot,
            damage: amount,
        })
        if (victim && amount > 0) {
            this.damage(fighter, victim, amount, { headshot, weapon: 'blaster', backstab: false }, events)
        }
    }

    private stapler(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        if (!(frame.buttons & BUTTON.fire) || fighter.clock < fighter.nextSwingAt) return
        fighter.nextSwingAt = fighter.clock + SWING_STEPS
        fighter.shieldUntil = 0

        const eye = eyeOf(fighter.body)
        const direction = aimDirection(frame.yaw, frame.pitch)
        const reached = swingStapler(this.world, eye, direction, this.targetsAt(frame.view, fighter.id))
        const victim = reached ? this.fighters.get(reached.id) : undefined
        const backstab = reached?.backstab ?? false
        const amount = this.hurts(victim) ? (backstab ? STAPLER.backstab : STAPLER.damage) : 0
        events.push({ type: 'swing', by: fighter.id, hit: victim?.id ?? null, damage: amount, backstab })
        if (victim && amount > 0) {
            this.damage(fighter, victim, amount, { headshot: false, weapon: 'stapler', backstab }, events)
        }
    }

    /** Can they be hurt now? Not when down, or still spawn-shielded. */
    private hurts(victim: Fighter | undefined): victim is Fighter {
        return victim !== undefined && victim.alive && !this.shielded(victim)
    }

    private damage(
        by: Fighter,
        victim: Fighter,
        amount: number,
        how: { headshot: boolean; weapon: Weapon; backstab: boolean },
        events: ArenaEvent[]
    ): void {
        victim.health = Math.max(0, victim.health - amount)
        events.push({ type: 'damage', by: by.id, target: victim.id, amount, headshot: how.headshot })
        if (victim.health > 0) return

        victim.alive = false
        victim.jetting = false
        victim.respawnAt = this.step + RESPAWN_STEPS
        // Their powers go with them (the jetpack's with their body, at the respawn).
        victim.magazineUntil = 0
        victim.headshotUntil = 0
        const victimStreak = victim.lifeKills
        victim.lifeKills = 0
        by.lifeKills++
        events.push({
            type: 'kill',
            killer: by.id,
            victim: victim.id,
            ...how,
            killerStreak: by.lifeKills,
            victimStreak,
        })
    }

    /**
     * The others where the shooter saw them: `view` steps back, at most MAX_REWIND_STEPS, alive then
     * and now. Teammates aren't targets: shots and swings go through them.
     */
    private targetsAt(view: number, shooter: string): Target[] {
        const wanted = Math.max(this.step - MAX_REWIND_STEPS, Math.min(this.step, Math.round(view)))
        const past = this.history.find(h => h.step === wanted)
        const team = this.fighters.get(shooter)?.team ?? null
        const targets: Target[] = []
        for (const fighter of this.fighters.values()) {
            if (fighter.id === shooter || !fighter.alive) continue
            if (team !== null && fighter.team === team) continue
            targets.push(past?.at.get(fighter.id) ?? { id: fighter.id, ...fighter.body })
        }

        return targets
    }

    private remember(): void {
        const at = new Map<string, Target>()
        for (const f of this.fighters.values()) {
            if (f.alive) at.set(f.id, { id: f.id, x: f.body.x, y: f.body.y, z: f.body.z, yaw: f.yaw })
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
        fighter.nextSwingAt = 0
        fighter.readyAt = 0
        fighter.lifeKills = 0
        fighter.magazineUntil = 0
        fighter.headshotUntil = 0

        return { type: 'spawn', id: fighter.id }
    }

    /** The spawn point furthest from the nearest living enemy (a random one when there's none). */
    private spawnPoint(id: string) {
        const points = this.world.spawnPoints
        const team = this.fighters.get(id)?.team ?? null
        const others = [...this.fighters.values()].filter(
            f => f.id !== id && f.alive && (team === null || f.team !== team)
        )
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

function round(value: number, decimals: number): number {
    const k = 10 ** decimals
    return Math.round(value * k) / k
}
