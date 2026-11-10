import { Line3, Vector3 } from 'three'
import type { Rng } from '../../sim/rng.ts'
import {
    type BuffKind,
    BUTTON,
    DEFAULT_LOADOUT,
    type GameEvent,
    type Gun,
    type InputFrame,
    isMelee,
    isTool,
    type KillRecap,
    type Loadout,
    type PlayerState,
    type RocketState,
    type SelfState,
    type Slot,
    type Team,
    type WallSpec,
    type WallState,
    type Weapon,
    weaponIn,
} from '../protocol.ts'
import { batHit, inCone, knockOf, SHOVE, stunOf } from './shove.ts'
import {
    ANVIL,
    BONUS,
    BUBBLE,
    FIREWALL,
    HEALTH_PACK,
    MAGAZINE_FACTOR,
    MAGNET,
    OVERTIME,
    PICKUP_HEIGHT,
    PICKUP_REACH,
    PICKUP_WEIGHTS,
    PICKUPS,
    type PickupKind,
    rollPickup,
    SHOVE_PICKUP_WEIGHTS,
    type SiegeSpawn,
} from './places.ts'
import {
    aimDirection,
    damageAt,
    eyeOf,
    fireShot,
    GUNS,
    LAUNCHER,
    magazineOf,
    MAX_HEALTH,
    maxHealthOf,
    rayCapsule,
    REGEN,
    reloadMsOf,
    spreadDirection,
    spreadOf,
    STAPLER,
    SWITCH_MS,
    swingStapler,
    type Target,
} from './combat.ts'
import { type Body, bodyAt, isJetting, moveOf, scaleOf, sizeAt, sizeOf, STEP_MS, stepBody } from './movement.ts'
import { supported } from './building.ts'
import { BUILD, stateOf, type Wall } from './walls.ts'
import { collideCapsule, type FpsWorld, rayDistance } from './world.ts'

const fitSeg = new Line3()

/**
 * The game itself, one 60 Hz step at a time: bodies, inputs, the guns, rockets and the stapler,
 * deaths and respawns. Pure (seeded random, no clock): the lobby around it decides what a kill is worth.
 */

const steps = (ms: number): number => Math.round(ms / STEP_MS)

export const RESPAWN_STEPS = steps(3000)
export const SHIELD_STEPS = steps(1500)
const REGEN_DELAY_STEPS = steps(REGEN.delayMs)
const REGEN_PER_STEP = (REGEN.perSecond * STEP_MS) / 1000
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
const SWING_STEPS = steps(STAPLER.intervalMs)
const SWITCH_STEPS = steps(SWITCH_MS)
const ROCKET_STEPS = steps(LAUNCHER.lifeMs)
/** A rocket can't hit whoever fired it for this long (it starts inside their reach). */
const ROCKET_ARMED_STEPS = steps(150)
const IDLE: InputFrame = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0 }
/** Under the floor (somehow): back to a spawn. */
const LOST_BELOW = -2
/** A ring-out counts for whoever last hit them this recently (5 s). */
export const RING_OUT_CREDIT_STEPS = steps(5000)

/** A gun's state: kept while it's holstered, so switching back finds its rounds. */
interface GunState {
    ammo: number
    /** Reloading until this frame of theirs (0: not). */
    reloadUntil: number
    nextShotAt: number
}

interface Rocket {
    id: number
    by: string
    team: Team | null
    position: Vector3
    velocity: Vector3
    born: number
}

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
    /**
     * Frames of theirs used so far: their own clock. The guns' timings count in it, so a
     * batch caught up in one server step fires exactly as it did in their browser.
     */
    clock: number
    /** What they carry, and what they'll carry from their next spawn. */
    loadout: Loadout
    nextLoadout: Loadout
    /** In hand, and usable from this frame of theirs (switching takes a moment). */
    slot: Slot
    readyAt: number
    guns: Record<'primary' | 'secondary', GunState>
    nextSwingAt: number
    /** Fire was held in their last frame (a click-a-shot gun waits for a new click). */
    wasFiring: boolean
    /** Aim was held in their last frame (the others see their gun come up). */
    aiming: boolean
    /** A click not yet used by a click-a-shot gun. */
    clicked: boolean
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
    /**
     * Powers from pickups, until these steps (0: none); all lost going down. Those that change how
     * you move (the jetpack's, Overtime, Espresso, Promotion, Intern) live in the body.
     */
    magazineUntil: number
    headshotUntil: number
    bonusUntil: number
    orgchartUntil: number
    /** The firewall: damage it still soaks, until it breaks or this step. */
    firewall: number
    firewallUntil: number
    /** The step their health last went down: it comes back REGEN.delayMs after. */
    hurtAt: number
    /** Who hurt them this life (for the death recap): hits, damage, headshots, the step of the first. */
    taken: Map<string, { hits: number; damage: number; headshots: number; since: number }>
    /** The last to hit them this life, with what and when (a ring-out is theirs for a while after). */
    lastHit: { by: string; weapon: Weapon; step: number } | null
    /** Shove: their damage % (every hit throws them further), back to 0 each life. */
    percent: number
    /** Shove: winding the bat up since this frame of theirs (null: not). */
    chargeFrom: number | null
    /** Shove: the extinguisher's next blast, from this frame of theirs. */
    nextSprayAt: number
    /** Shove: their blower ran this step. */
    blowing: boolean
    /** Shove: out of lives, down for the rest of the match. */
    out: boolean
    /** Shove's powers, until these steps: the anvil, the bubble (one save), the magnet. */
    anvilUntil: number
    bubbleUntil: number
    magnetUntil: number
    /** Their next wall can go up from this step. */
    nextBuildAt: number
}

/** A rocket's blast does this many times its damage to a built wall (a direct hit: ~535 of its 1050, two take one down). */
export const ROCKET_WALL_FACTOR = 5.5

export type ArenaEvent = GameEvent | { type: 'damage'; by: string; target: string; amount: number; headshot: boolean }

export class Arena {
    /** Steps run so far. */
    step = 0
    private readonly fighters = new Map<string, Fighter>()
    /** Everyone's feet at each of the last steps, for rewinding shots. */
    private readonly history: Array<{ step: number; at: Map<string, Target> }> = []
    private rockets: Rocket[] = []
    private nextRocketId = 1
    private nextWallId = 1
    /** What happened between steps or to the walls (a build, a leave, a shot wall): out with the next step's events. */
    private pending: ArenaEvent[] = []
    /** Each pickup spot: there to take from this step on, and what lies there (rolled when it comes back). */
    private pickupAt: number[]
    private readonly pickupKind: PickupKind[] = []
    /** Where each side spawns, when the match says (siege); null or an empty list: the usual, away from the enemy. */
    private spawnsOf: ((team: Team | null) => readonly SiegeSpawn[] | null) | null = null
    /** What everyone carries: the guns, or Shove's tools (no health, a damage %, no guns). */
    private kit: 'guns' | 'shove' = 'guns'
    /** A gust blowing now (m/s on the floor plan; zero: none). */
    private wind = { x: 0, z: 0 }

    /** Guns or Shove's tools, for everyone (a Shove match, or back to the guns). Everyone's % back to 0. */
    setKit(kit: 'guns' | 'shove'): void {
        this.kit = kit
        for (const f of this.fighters.values()) {
            f.percent = 0
            f.chargeFrom = null
            f.out = false
        }
        this.rollPickups()
    }

    get shove(): boolean {
        return this.kit === 'shove'
    }

    /** A gust (m/s; zero to stop it): everyone standing drifts with it. */
    setWind(x: number, z: number): void {
        this.wind = { x, z }
    }

    /** Shove: out of lives, they stay down for the rest of the match. */
    eliminate(id: string): void {
        const fighter = this.fighters.get(id)
        if (!fighter) return
        fighter.out = true
        fighter.alive = false
        fighter.jetting = false
        fighter.blowing = false
        fighter.respawnAt = Number.POSITIVE_INFINITY
    }

    constructor(
        private world: FpsWorld,
        private readonly random: Rng
    ) {
        this.pickupAt = world.pickups.map(() => 0)
        this.rollPickups()
    }

    /**
     * Everyone over to another map (a match on it, or back to the office): its pickups, nothing in
     * flight, no rewind across the move. Then `respawnAll` puts them on it.
     */
    setWorld(world: FpsWorld): void {
        if (world === this.world) return
        this.world = world
        this.pickupAt = world.pickups.map(() => 0)
        this.rollPickups()
        this.rockets = []
        this.history.length = 0
        this.pending = this.pending.filter(e => e.type !== 'built' && e.type !== 'wallHit' && e.type !== 'wallGone')
    }

    /** Fixed spawns per side (siege), or back to the usual (null). */
    setSpawns(spawnsOf: ((team: Team | null) => readonly SiegeSpawn[] | null) | null): void {
        this.spawnsOf = spawnsOf
    }

    /** Back to a spawn now, fresh (siege: a point scored sends the attacker back to the dome). */
    respawn(id: string): ArenaEvent[] {
        const fighter = this.fighters.get(id)
        return fighter?.alive ? [this.spawn(fighter)] : []
    }

    /** A fresh roll on every spot (a new arena, a new match). */
    private rollPickups(): void {
        this.pickupKind.length = 0
        for (const spot of this.world.pickups) {
            this.pickupKind.push(rollPickup(this.random, spot, this.pickupKind, this.pickupWeights))
        }
    }

    /** What may lie on the spots: the guns' pool, or Shove's. */
    private get pickupWeights(): Record<PickupKind, number> {
        return this.kit === 'shove' ? SHOVE_PICKUP_WEIGHTS : PICKUP_WEIGHTS
    }

    has(id: string): boolean {
        return this.fighters.has(id)
    }

    ids(): string[] {
        return [...this.fighters.keys()]
    }

    /** In (on a side, in team deathmatch), at the spawn point furthest from the enemy. */
    add(id: string, team: Team | null = null, loadout: Loadout = DEFAULT_LOADOUT): ArenaEvent[] {
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
            clock: 0,
            loadout,
            nextLoadout: loadout,
            slot: 'primary',
            readyAt: 0,
            guns: { primary: freshGun(0), secondary: freshGun(0) },
            nextSwingAt: 0,
            wasFiring: false,
            aiming: false,
            clicked: false,
            queue: [],
            queuedSeq: 0,
            ackSeq: 0,
            budget: 0,
            starved: 0,
            team,
            lifeKills: 0,
            magazineUntil: 0,
            headshotUntil: 0,
            bonusUntil: 0,
            orgchartUntil: 0,
            firewall: 0,
            firewallUntil: 0,
            hurtAt: 0,
            taken: new Map(),
            lastHit: null,
            nextBuildAt: 0,
            percent: 0,
            chargeFrom: null,
            nextSprayAt: 0,
            blowing: false,
            out: false,
            anvilUntil: 0,
            bubbleUntil: 0,
            magnetUntil: 0,
        }
        this.fighters.set(id, fighter)

        return [this.spawn(fighter)]
    }

    /** Out of the game. Their walls stay up, nobody's from now on: no one inherits them, their side included. */
    remove(id: string): void {
        this.fighters.delete(id)
        for (const wall of [...this.world.walls.all]) {
            if (wall.by === id) this.change(wall, { by: null, team: null })
        }
    }

    /**
     * A wall where their browser's build mode put it, if they're up, it's within reach of their eyes
     * (with slack for the snap and the lag), nothing's there yet, it touches something (never in mid
     * air: `supported`), and they haven't just built one. Past the map's
     * limit their oldest wall (else the oldest) comes down. True when it went up.
     */
    build(id: string, spec: WallSpec): boolean {
        const fighter = this.fighters.get(id)
        if (!fighter?.alive || this.step < fighter.nextBuildAt) return false
        const eye = eyeOf(fighter.body)
        const reach = BUILD.reach + BUILD.slack
        if (Math.hypot(spec.x - eye.x, spec.y - eye.y, spec.z - eye.z) > reach) return false
        const walls = this.world.walls
        if (walls.taken(spec) || !supported(this.world, spec)) return false
        while (walls.count >= BUILD.max) {
            const oldest = walls.all.find(w => w.by === id) ?? walls.all[0]!
            this.takeDown(oldest, false)
        }
        fighter.nextBuildAt = this.step + BUILD.everySteps
        const wall = walls.add({
            ...spec,
            id: this.nextWallId++,
            by: id,
            team: fighter.team,
            health: BUILD.health,
            kind: 'wall',
            open: false,
        })
        this.pending.push({ type: 'built', wall: stateOf(wall) })

        return true
    }

    /** A standing plain wall of their side's, in reach, into a door or a window (for good). */
    reshape(id: string, wallId: number, kind: 'door' | 'window'): boolean {
        const wall = this.usable(id, wallId, BUILD.reach)
        if (!wall || wall.kind !== 'wall' || wall.axis === 'y') return false
        this.change(wall, { kind })

        return true
    }

    /** Opens or shuts a door of their side's, in reach (shut on someone, it pushes them out). */
    door(id: string, wallId: number): boolean {
        const wall = this.usable(id, wallId, BUILD.doorReach)
        if (!wall || wall.kind !== 'door') return false
        this.change(wall, { open: !wall.open })

        return true
    }

    /** A wall they may change: up, theirs or their side's (team deathmatch), within `reach` of their eyes (to its nearest). */
    private usable(id: string, wallId: number, reach: number): Wall | null {
        const fighter = this.fighters.get(id)
        const wall = this.world.walls.get(wallId)
        if (!fighter?.alive || !wall) return null
        if (wall.by !== id && (wall.team === null || wall.team !== fighter.team)) return null
        const eye = eyeOf(fighter.body)
        const gap = Math.hypot(
            eye.x - Math.max(wall.minX, Math.min(wall.maxX, eye.x)),
            eye.y - Math.max(wall.minY, Math.min(wall.maxY, eye.y)),
            eye.z - Math.max(wall.minZ, Math.min(wall.maxZ, eye.z))
        )

        return gap <= reach + BUILD.useSlack ? wall : null
    }

    private change(wall: Wall, change: Partial<Pick<WallState, 'kind' | 'open' | 'by' | 'team'>>): void {
        const changed = this.world.walls.add({ ...stateOf(wall), ...change })
        this.pending.push({ type: 'wallChanged', wall: stateOf(changed) })
    }

    /** Takes back one of their own walls. */
    unbuild(id: string, wallId: number): boolean {
        const wall = this.world.walls.get(wallId)
        if (!wall || wall.by !== id) return false
        this.takeDown(wall, false)

        return true
    }

    /** The walls up now. */
    wallStates(): WallState[] {
        return this.world.walls.all.map(stateOf)
    }

    private takeDown(wall: Wall, broken: boolean): void {
        this.world.walls.remove(wall.id)
        this.pending.push({ type: 'wallGone', id: wall.id, broken })
    }

    /** Damage to a built wall; a teammate's (team deathmatch) can't be hurt by your side. */
    private hurtWall(wall: Wall, amount: number, by: Fighter | null): void {
        if (by && by.team !== null && wall.team === by.team && wall.by !== by.id) return
        if (amount <= 0 || !this.world.walls.get(wall.id)) return
        wall.health = Math.max(0, Math.round(wall.health - amount))
        if (wall.health <= 0) this.takeDown(wall, true)
        else this.pending.push({ type: 'wallHit', id: wall.id, health: wall.health })
    }

    /**
     * The guns for their next spawn; right away while they're still spawn-shielded (they've just
     * come in and haven't fired), so picking at the spawn doesn't cost a life.
     */
    setLoadout(id: string, loadout: Loadout): void {
        const fighter = this.fighters.get(id)
        if (!fighter) return
        fighter.nextLoadout = loadout
        if (this.shielded(fighter)) this.arm(fighter)
    }

    /** Rockets in flight. */
    rocketStates(): RocketState[] {
        return this.rockets.map(r => ({
            id: r.id,
            by: r.by,
            x: round(r.position.x, 3),
            y: round(r.position.y, 3),
            z: round(r.position.z, 3),
            vx: round(r.velocity.x, 3),
            vy: round(r.velocity.y, 3),
            vz: round(r.velocity.z, 3),
        }))
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
        this.rollPickups()
        this.rockets = []
        // A clean office for the match.
        this.world.walls.clear()
        this.pending = this.pending.filter(e => e.type !== 'built' && e.type !== 'wallHit' && e.type !== 'wallGone')
        events.push({ type: 'walls', walls: [] })
        for (const fighter of this.fighters.values()) fighter.alive = false
        for (const fighter of this.fighters.values()) events.push(this.spawn(fighter))

        return events
    }

    /** What lies on each spot to take, null where it's been taken and not back yet. */
    pickups(): Array<PickupKind | null> {
        return this.pickupAt.map((at, i) => (this.step >= at ? this.pickupKind[i]! : null))
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
        const events: ArenaEvent[] = this.pending
        this.pending = []
        for (const fighter of this.fighters.values()) {
            fighter.budget = Math.min(MAX_BURST, fighter.budget + 1)
            // A gust: in the body, so their browser drifts them with it too.
            if (fighter.body.windX !== this.wind.x || fighter.body.windZ !== this.wind.z) {
                fighter.body = { ...fighter.body, windX: this.wind.x, windZ: this.wind.z }
            }
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
                fighter.blowing = false
                this.fellOut(fighter, events)
            }
            if (fighter.alive) this.bubbleCatch(fighter)
            if (fighter.alive) this.collect(fighter, events)
            // A Promotion or Overtime running out: their health back down to what they can hold now.
            fighter.health = Math.min(fighter.health, maxHealthOf(fighter.body))
            if (fighter.alive) this.regenerate(fighter)
            if (fighter.firewallUntil > 0 && this.step >= fighter.firewallUntil) {
                fighter.firewall = 0
                fighter.firewallUntil = 0
            }
            // A big magazine running out: back to the usual size.
            if (fighter.magazineUntil > 0 && this.step >= fighter.magazineUntil) {
                fighter.magazineUntil = 0
                for (const slot of ['primary', 'secondary'] as const) {
                    const gun = fighter.guns[slot]
                    gun.ammo = Math.min(gun.ammo, magazineOf(gunIn(fighter, slot)))
                }
            }
        }
        this.flyRockets(events)
        this.magnets()
        for (const fighter of this.fighters.values()) {
            if (!fighter.alive && this.step >= fighter.respawnAt) events.push(this.spawn(fighter))
        }
        // Walls shot this step.
        events.push(...this.pending)
        this.pending = []
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
            health: f.alive ? Math.ceil(f.health) : 0,
            jet: f.alive && f.jetting,
            shielded: this.shielded(f),
            weapon: weaponIn(f.slot, f.loadout, this.shove),
            aiming: f.alive && f.aiming && f.slot !== 'melee' && !this.shove,
            prone: f.alive && f.body.prone,
            reload: f.alive && !this.shove ? reloadOf(f) : null,
            team: f.team,
            buffs: f.alive ? this.buffsOf(f).map(b => b.kind) : [],
            percent: this.shove ? Math.floor(f.percent) : null,
            blowing: f.alive && f.blowing,
        }))
    }

    /** One player, in full (null when they aren't in). */
    self(id: string): SelfState | null {
        const f = this.fighters.get(id)
        if (!f) return null
        // The gun in hand (the primary's numbers while holding the stapler).
        const slot = f.slot === 'melee' ? 'primary' : f.slot
        const gun = f.guns[slot]
        const other = f.slot === 'melee' ? null : f.guns[f.slot === 'primary' ? 'secondary' : 'primary']

        return {
            body: { ...f.body },
            alive: f.alive,
            // Regenerating, it climbs in fractions: whole points, rounded up (still alive shows at least 1).
            health: Math.ceil(f.health),
            ammo: gun.ammo,
            reloading: gun.reloadUntil > f.clock,
            reloadLeftMs: gun.reloadUntil > f.clock ? Math.round((gun.reloadUntil - f.clock) * STEP_MS) : null,
            shielded: this.shielded(f),
            weapon: weaponIn(f.slot, f.loadout, this.shove),
            loadout: f.loadout,
            nextLoadout: f.nextLoadout,
            otherAmmo: other?.ammo ?? null,
            // Out of lives (Shove): not coming back this match.
            respawnInMs: f.alive || f.out ? null : Math.max(0, Math.round((f.respawnAt - this.step) * STEP_MS)),
            magazine: this.magazineOf(f, gunIn(f, slot)),
            buffs: f.alive ? this.buffsOf(f) : [],
            percent: this.shove ? Math.floor(f.percent) : null,
            charge:
                this.shove && f.chargeFrom !== null
                    ? round(Math.min(1, (f.clock - f.chargeFrom) / steps(SHOVE.bat.chargeMs)), 2)
                    : null,
        }
    }

    /** Their powers and what's left of each. */
    private buffsOf(f: Fighter): Array<{ kind: BuffKind; leftMs: number; points?: number }> {
        const buffs: Array<{ kind: BuffKind; leftMs: number; points?: number }> = []
        const left = (until: number) => Math.round((until - this.step) * STEP_MS)
        const inBody = (kind: BuffKind, steps: number) => {
            if (steps > 0) buffs.push({ kind, leftMs: Math.round(steps * STEP_MS) })
        }
        const until = (kind: BuffKind, step: number) => {
            if (step > this.step) buffs.push({ kind, leftMs: left(step) })
        }
        until('magazine', f.magazineUntil)
        inBody('jetpack', f.body.jetBoost)
        until('headshot', f.headshotUntil)
        inBody('overtime', f.body.overtime)
        inBody('promotion', f.body.big)
        inBody('espresso', f.body.espresso)
        inBody('intern', f.body.small)
        if (f.firewall > 0 && f.firewallUntil > this.step) {
            buffs.push({ kind: 'firewall', leftMs: left(f.firewallUntil), points: Math.ceil(f.firewall) })
        }
        until('bonus', f.bonusUntil)
        until('orgchart', f.orgchartUntil)
        until('anvil', f.anvilUntil)
        until('bubble', f.bubbleUntil)
        until('magnet', f.magnetUntil)
        return buffs
    }

    private magazineOf(f: Fighter, gun: Gun): number {
        return magazineOf(gun, f.magazineUntil > this.step ? MAGAZINE_FACTOR : 1)
    }

    /** Left alone for REGEN.delayMs, health climbs back REGEN.perSecond, up to REGEN.upTo (or full, if less). */
    private regenerate(f: Fighter): void {
        const ceiling = Math.min(REGEN.upTo, maxHealthOf(f.body))
        if (f.health >= ceiling || this.step - f.hurtAt < REGEN_DELAY_STEPS) return
        f.health = Math.min(ceiling, f.health + REGEN_PER_STEP)
    }

    /** Takes any pickup they're standing on (health only when hurt), and sets it to come back later. */
    private collect(f: Fighter, events: ArenaEvent[]): void {
        this.world.pickups.forEach((spot, index) => {
            if (this.step < this.pickupAt[index]!) return
            const near = Math.hypot(f.body.x - spot.x, f.body.z - spot.z) <= PICKUP_REACH
            const floor = spot.y ?? 0
            if (!near || f.body.y < floor - 0.05 || f.body.y > floor + PICKUP_HEIGHT) return
            const kind = this.pickupKind[index]!
            if (kind === 'health' && f.health >= maxHealthOf(f.body)) return

            const info = PICKUPS[kind]
            const lasts = steps(info.durationMs ?? 0)
            const until = this.step + lasts
            const refill = () => {
                for (const slot of ['primary', 'secondary'] as const) {
                    f.guns[slot].ammo = this.magazineOf(f, gunIn(f, slot))
                    f.guns[slot].reloadUntil = 0
                }
            }
            switch (kind) {
                case 'health':
                    f.health = Math.min(maxHealthOf(f.body), f.health + HEALTH_PACK)
                    break
                case 'magazine':
                    f.magazineUntil = until
                    refill()
                    break
                case 'jetpack':
                    f.body = { ...f.body, jetBoost: lasts, fuel: 1 }
                    break
                case 'headshot':
                    f.headshotUntil = until
                    break
                // Overtime and Espresso are opposites, as are Promotion and Intern: one ends the other.
                case 'overtime':
                    f.body = { ...f.body, overtime: lasts, espresso: 0 }
                    f.health = Math.min(maxHealthOf(f.body), f.health + OVERTIME.health)
                    refill()
                    break
                case 'espresso':
                    f.body = { ...f.body, espresso: lasts, overtime: 0 }
                    break
                case 'promotion':
                    f.body = { ...f.body, big: lasts, small: 0 }
                    f.health = maxHealthOf(f.body)
                    break
                case 'intern':
                    f.body = { ...f.body, small: lasts, big: 0 }
                    break
                case 'firewall':
                    f.firewall = FIREWALL
                    f.firewallUntil = until
                    break
                case 'bonus':
                    f.bonusUntil = until
                    break
                case 'orgchart':
                    f.orgchartUntil = until
                    break
                case 'anvil':
                    f.anvilUntil = until
                    break
                case 'bubble':
                    f.bubbleUntil = until
                    break
                case 'magnet':
                    f.magnetUntil = until
                    break
            }
            f.health = Math.min(f.health, maxHealthOf(f.body))
            this.pickupAt[index] = this.step + steps(info.respawnMs)
            // What comes back here is rolled now (snapshots only show it once it's back), not
            // a power already lying elsewhere.
            this.pickupKind[index] = rollPickup(this.random, spot, this.pickups(), this.pickupWeights)
            events.push({ type: 'pickup', by: f.id, spot: index, kind })
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
        if (this.fellOut(fighter, events)) return
        // A different weapon in hand: it takes a moment before it can be used, and the one put
        // away stops reloading.
        const wanted = frame.slot ?? 'primary'
        if (wanted !== fighter.slot) {
            if (fighter.slot !== 'melee') fighter.guns[fighter.slot].reloadUntil = 0
            fighter.slot = wanted
            fighter.readyAt = fighter.clock + SWITCH_STEPS
        }
        // A click is kept until the gun can take it (still switching, between shots) or it's let go.
        const firing = Boolean(frame.buttons & BUTTON.fire)
        if (firing && !fighter.wasFiring) fighter.clicked = true
        if (!firing) fighter.clicked = false
        fighter.wasFiring = firing
        fighter.aiming = Boolean(frame.buttons & BUTTON.aim)
        fighter.blowing = false
        if (fighter.clock < fighter.readyAt) return
        if (this.shove) this.tool(fighter, frame, events)
        else if (fighter.slot === 'melee') this.stapler(fighter, frame, events)
        else this.gun(fighter, fighter.slot, frame, events)
    }

    private gun(fighter: Fighter, slot: 'primary' | 'secondary', frame: InputFrame, events: ArenaEvent[]): void {
        const now = fighter.clock
        const gun = gunIn(fighter, slot)
        const state = fighter.guns[slot]
        const magazine = this.magazineOf(fighter, gun)
        const reloadSteps = steps(reloadMsOf(gun))
        // Overtime: the magazine never runs down, so it's never reloaded.
        const endless = fighter.body.overtime > 0
        if (endless) {
            state.ammo = magazine
            state.reloadUntil = 0
        }
        if (state.reloadUntil > 0 && now >= state.reloadUntil) {
            state.reloadUntil = 0
            state.ammo = magazine
        }
        // Empty (a reload cut short by a switch, say): it reloads by itself.
        if (state.ammo === 0 && state.reloadUntil === 0) state.reloadUntil = now + reloadSteps
        const reloading = state.reloadUntil > 0
        if (frame.buttons & BUTTON.reload && !reloading && state.ammo < magazine) {
            state.reloadUntil = now + reloadSteps
            return
        }
        const auto = gun !== 'launcher' && GUNS[gun].auto
        const trigger = auto ? Boolean(frame.buttons & BUTTON.fire) : fighter.clicked
        if (!trigger || reloading || now < state.nextShotAt) return

        fighter.clicked = false
        const interval = gun === 'launcher' ? LAUNCHER.intervalMs : GUNS[gun].intervalMs
        state.nextShotAt = now + steps(interval)
        fighter.shieldUntil = 0
        if (!endless) state.ammo--
        if (state.ammo === 0) state.reloadUntil = now + reloadSteps

        if (gun === 'launcher') this.launch(fighter, frame, events)
        else this.fire(fighter, gun, frame, events)
    }

    /** A hitscan trigger pull: each pellet its own ray in the cone, the damage added up per victim. */
    private fire(fighter: Fighter, gun: Exclude<Gun, 'launcher'>, frame: InputFrame, events: ArenaEvent[]): void {
        const spec = GUNS[gun]
        const origin = eyeOf(fighter.body)
        const aim = aimDirection(frame.yaw, frame.pitch)
        const cone = spreadOf(spec, Boolean(frame.buttons & BUTTON.aim), fighter.body)
        const targets = this.targetsAt(frame.view, fighter.id)
        const dealt = new Map<string, { amount: number; headshot: boolean }>()
        const ends: Array<[number, number, number]> = []
        // Built walls hit, added up over the pellets and hurt after (a wall broken by the first doesn't let the rest through).
        const walls = new Map<Wall, number>()
        for (let pellet = 0; pellet < spec.pellets; pellet++) {
            const direction = spreadDirection(aim, cone, frame.seq, pellet)
            const shot = fireShot(this.world, origin, direction, targets, spec.range)
            ends.push([round(shot.end.x, 3), round(shot.end.y, 3), round(shot.end.z, 3)])
            if (shot.wall) {
                walls.set(shot.wall, (walls.get(shot.wall) ?? 0) + damageAt(spec, origin.distanceTo(shot.end)))
            }
            if (!shot.hit) continue
            const headshot = shot.hit.headshot
            const amount = damageAt(spec, origin.distanceTo(shot.end)) * (headshot ? spec.headshot : 1)
            const so = dealt.get(shot.hit.id) ?? { amount: 0, headshot: false }
            dealt.set(shot.hit.id, { amount: so.amount + amount, headshot: so.headshot || headshot })
        }

        // Who took the most: the shot's `hit`, for the marker and the damage number.
        let top: { id: string; amount: number; headshot: boolean } | null = null
        const hurt: Array<{ victim: Fighter; amount: number; headshot: boolean }> = []
        const bonus = this.bonusOf(fighter)
        for (const [id, { amount, headshot }] of dealt) {
            const victim = this.fighters.get(id)
            // Headshot rounds: any headshot kills, a Promotion's and through a firewall too.
            const oneShot = headshot && fighter.headshotUntil > this.step
            const whole = victim ? victim.health + victim.firewall : MAX_HEALTH
            const total = this.hurts(victim) ? (oneShot ? whole : Math.round(amount * bonus)) : 0
            if (victim && total > 0) hurt.push({ victim, amount: total, headshot })
            if (!top || total > top.amount) top = { id, amount: total, headshot }
        }
        events.push({
            type: 'shot',
            by: fighter.id,
            weapon: gun,
            from: [round(origin.x, 3), round(origin.y, 3), round(origin.z, 3)],
            to: ends,
            hit: top?.id ?? null,
            headshot: top?.headshot ?? false,
            damage: top?.amount ?? 0,
        })
        for (const { victim, amount, headshot } of hurt) {
            this.damage(fighter, victim, amount, { headshot, weapon: gun, backstab: false }, events)
        }
        for (const [wall, amount] of walls) this.hurtWall(wall, amount * bonus, fighter)
    }

    /** A rocket out of the launcher, from just in front of the eyes. */
    private launch(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        const direction = aimDirection(frame.yaw, frame.pitch)
        const position = eyeOf(fighter.body)
        const rocket: Rocket = {
            id: this.nextRocketId++,
            by: fighter.id,
            team: fighter.team,
            position,
            velocity: direction.multiplyScalar(LAUNCHER.speed),
            born: this.step,
        }
        this.rockets.push(rocket)
        events.push({
            type: 'launch',
            by: fighter.id,
            id: rocket.id,
            from: [round(position.x, 3), round(position.y, 3), round(position.z, 3)],
        })
    }

    /** Every rocket one step on: it goes off on a wall, a player, or at the end of its life. */
    private flyRockets(events: ArenaEvent[]): void {
        const dt = STEP_MS / 1000
        this.rockets = this.rockets.filter(rocket => {
            const length = rocket.velocity.length() * dt
            const direction = rocket.velocity.clone().normalize()
            let nearest = rayDistance(this.world, rocket.position, direction, length)
            let hitPlayer = false
            for (const f of this.fighters.values()) {
                if (!f.alive) continue
                if (f.id === rocket.by && this.step - rocket.born < ROCKET_ARMED_STEPS) continue
                if (rocket.team !== null && f.team === rocket.team && f.id !== rocket.by) continue
                if (this.apart(rocket.position, middleOf(f.body))) continue
                const met = rayCapsule(rocket.position, direction, this.targetOf(f))
                if (met && met.distance < nearest) {
                    nearest = met.distance
                    hitPlayer = true
                }
            }
            const expired = this.step - rocket.born >= ROCKET_STEPS
            if (nearest < length || hitPlayer || expired) {
                // Just short of the wall, so the blast isn't on the far side of it.
                const at = rocket.position
                    .clone()
                    .addScaledVector(direction, Math.max(0, Math.min(nearest, length) - 0.03))
                this.explode(rocket, at, events)
                return false
            }
            rocket.position.addScaledVector(direction, length)
            return true
        })
    }

    /** The blast: damage and a shove for everyone in reach with nothing in between, less further out. */
    private explode(rocket: Rocket, at: Vector3, events: ArenaEvent[]): void {
        const by = this.fighters.get(rocket.by) ?? null
        const hits: Array<{ id: string; damage: number }> = []
        const hurt: Array<{ victim: Fighter; amount: number }> = []
        for (const f of this.fighters.values()) {
            if (!f.alive) continue
            const self = f.id === rocket.by
            if (!self && rocket.team !== null && f.team === rocket.team) continue
            // The nearest point of their capsule's axis (their size's).
            const size = sizeOf(f.body)
            const axisY = Math.max(f.body.y + size.radius, Math.min(f.body.y + size.height - size.radius, at.y))
            const point = new Vector3(f.body.x, axisY, f.body.z)
            const to = point.clone().sub(at)
            const distance = Math.max(0, to.length() - size.radius)
            if (distance >= LAUNCHER.radius) continue
            const length = to.length()
            // Behind a wall from the blast: safe.
            const covered =
                length > 0.05 && rayDistance(this.world, at, to.clone().divideScalar(length), length) < length - 0.05
            if (covered) continue
            const share = 1 - distance / LAUNCHER.radius
            const push = to.lengthSq() > 1e-6 ? to.clone().normalize() : new Vector3(0, 1, 0)
            // A little lift, so a blast at your feet throws you up rather than into the floor.
            push.y = Math.max(push.y, 0.35)
            push.normalize().multiplyScalar(LAUNCHER.knockback * share)
            f.body = {
                ...f.body,
                vx: f.body.vx + push.x,
                vy: f.body.vy + push.y,
                vz: f.body.vz + push.z,
                onGround: false,
            }
            const factor = (self ? LAUNCHER.selfFactor : 1) * (by ? this.bonusOf(by) : 1)
            const amount = this.hurts(f) ? Math.round(LAUNCHER.damage * share * factor) : 0
            if (amount > 0) {
                hits.push({ id: f.id, damage: amount })
                hurt.push({ victim: f, amount })
            }
        }
        // Built walls in the blast (any part of them): the nearest the hardest, cover or not.
        for (const wall of [...this.world.walls.all]) {
            const dx = at.x - Math.max(wall.minX, Math.min(wall.maxX, at.x))
            const dy = at.y - Math.max(wall.minY, Math.min(wall.maxY, at.y))
            const dz = at.z - Math.max(wall.minZ, Math.min(wall.maxZ, at.z))
            const distance = Math.hypot(dx, dy, dz)
            if (distance >= LAUNCHER.radius) continue
            const share = 1 - distance / LAUNCHER.radius
            this.hurtWall(wall, LAUNCHER.damage * ROCKET_WALL_FACTOR * share * (by ? this.bonusOf(by) : 1), by)
        }
        events.push({
            type: 'explode',
            by: rocket.by,
            id: rocket.id,
            at: [round(at.x, 3), round(at.y, 3), round(at.z, 3)],
            hits,
        })
        for (const { victim, amount } of hurt) {
            this.damage(by, victim, amount, { headshot: false, weapon: 'launcher', backstab: false }, events)
        }
    }

    private stapler(fighter: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        if (!(frame.buttons & BUTTON.fire) || fighter.clock < fighter.nextSwingAt) return
        fighter.nextSwingAt = fighter.clock + SWING_STEPS
        fighter.shieldUntil = 0

        const eye = eyeOf(fighter.body)
        const direction = aimDirection(frame.yaw, frame.pitch)
        // A Promotion's arm reaches three times as far, an Intern's half.
        const reach = STAPLER.reach * scaleOf(fighter.body)
        const reached = swingStapler(this.world, eye, direction, this.targetsAt(frame.view, fighter.id), reach)
        const victim = reached ? this.fighters.get(reached.id) : undefined
        const backstab = reached?.backstab ?? false
        const base = backstab ? STAPLER.backstab : STAPLER.damage
        const amount = this.hurts(victim) ? base * this.bonusOf(fighter) : 0
        events.push({ type: 'swing', by: fighter.id, hit: victim?.id ?? null, damage: amount, backstab })
        if (victim && amount > 0) {
            this.damage(fighter, victim, amount, { headshot: false, weapon: 'stapler', backstab }, events)
        }
    }

    /**
     * Shove's tools, by slot: the leaf blower (held: a steady push on whoever is in its stream, and
     * aimed down in the air it holds you up), the fire extinguisher (a blast that throws whoever it
     * meets and kicks you back the other way, every SHOVE.extinguisher.cooldownMs), the bat (held to
     * wind it up, swung when let go; from behind it spikes them down).
     */
    private tool(f: Fighter, frame: InputFrame, events: ArenaEvent[]): void {
        const firing = Boolean(frame.buttons & BUTTON.fire)
        const eye = eyeOf(f.body)
        const aim = aimDirection(frame.yaw, frame.pitch)
        if (f.slot === 'primary') {
            if (!firing) return
            const { blower } = SHOVE
            const dt = STEP_MS / 1000
            f.blowing = true
            f.shieldUntil = 0
            const along = flat(aim)
            for (const v of this.inStream(f, eye, aim, blower.range, blower.cone)) {
                if (!this.hurts(v)) continue
                const push = knockOf(blower.push, v.percent, this.weightOf(v)) * dt
                const away = along ?? flat(new Vector3(v.body.x - f.body.x, 0, v.body.z - f.body.z))
                if (!away) continue
                v.body = { ...v.body, vx: v.body.vx + away.x * push, vz: v.body.vz + away.z * push }
                this.addPercent(f, v, blower.percentPerSecond * dt, 'blower', events)
            }
            // Pointed down in the air: a little lift, to slow a fall or reach the deck again.
            if (!f.body.onGround && frame.pitch < -0.9) {
                f.body = { ...f.body, vy: f.body.vy + blower.hover * dt }
            }
            return
        }
        if (f.slot === 'secondary') {
            const { extinguisher } = SHOVE
            if (!firing || f.clock < f.nextSprayAt) return
            f.nextSprayAt = f.clock + steps(extinguisher.cooldownMs)
            f.shieldUntil = 0
            const hits: Array<{ id: string; percent: number }> = []
            for (const v of this.inStream(f, eye, aim, extinguisher.range, extinguisher.cone)) {
                const added = this.throw(f, v, aim, extinguisher.knock, extinguisher.percent, 'extinguisher', events)
                if (added > 0) hits.push({ id: v.id, percent: added })
            }
            // The kick back: the way you came, if you aim at the deck behind you. Standing, your feet take most of it.
            const kick = extinguisher.recoil * (f.body.onGround ? extinguisher.groundRecoil : 1)
            f.body = {
                ...f.body,
                vx: f.body.vx - aim.x * kick,
                vy: f.body.vy - aim.y * kick,
                vz: f.body.vz - aim.z * kick,
                onGround: f.body.onGround && -aim.y * kick <= 0,
                stun: Math.max(f.body.stun, stunOf(kick)),
            }
            const to = eye.clone().addScaledVector(aim, extinguisher.range)
            events.push({
                type: 'spray',
                by: f.id,
                from: [round(eye.x, 3), round(eye.y, 3), round(eye.z, 3)],
                toward: [round(to.x, 3), round(to.y, 3), round(to.z, 3)],
                hits,
            })
            return
        }
        // The bat: wound up while held, swung when let go.
        if (firing) {
            if (f.chargeFrom === null && f.clock >= f.nextSwingAt) f.chargeFrom = f.clock
            return
        }
        if (f.chargeFrom === null) return
        const charge = Math.min(1, (f.clock - f.chargeFrom) / steps(SHOVE.bat.chargeMs))
        f.chargeFrom = null
        f.nextSwingAt = f.clock + steps(SHOVE.bat.intervalMs)
        f.shieldUntil = 0
        const reach = SHOVE.bat.reach * scaleOf(f.body)
        const reached = swingStapler(this.world, eye, aim, this.targetsAt(frame.view, f.id), reach)
        const victim = reached ? this.fighters.get(reached.id) : undefined
        const backstab = reached?.backstab ?? false
        const { percent, knock } = batHit(charge)
        const added = victim ? this.throw(f, victim, aim, knock, percent, 'bat', events, backstab) : 0
        events.push({
            type: 'swing',
            by: f.id,
            hit: victim?.id ?? null,
            damage: added,
            backstab,
            weapon: 'bat',
            charge: round(charge, 2),
        })
    }

    /** Whoever is in a stream from `eye` along `aim` (their middle within its cone and reach, nothing in between). */
    private inStream(f: Fighter, eye: Vector3, aim: Vector3, range: number, cone: number): Fighter[] {
        const found: Fighter[] = []
        for (const v of this.fighters.values()) {
            if (v === f || !v.alive || (f.team !== null && v.team === f.team)) continue
            const middle = middleOf(v.body)
            const dx = middle.x - eye.x
            const dy = middle.y - eye.y
            const dz = middle.z - eye.z
            // A giant's middle is far up: their reach counts from their capsule's edge.
            const edge = sizeOf(v.body).radius
            if (!inCone(dx, dy, dz, aim.x, aim.y, aim.z, range + edge, cone)) continue
            const distance = Math.hypot(dx, dy, dz)
            const to = new Vector3(dx, dy, dz).divideScalar(Math.max(distance, 1e-6))
            if (rayDistance(this.world, eye, to, distance) < distance - 0.05) continue
            found.push(v)
        }
        return found
    }

    /**
     * Shove's hit: % on them, then a throw along `aim` (flattened, with a lift; from behind with the
     * bat, down), as far as their % and their weight say, and their steering weak while it carries.
     * Returns the % added (0: they couldn't be hit).
     */
    private throw(
        by: Fighter,
        victim: Fighter,
        aim: Vector3,
        knock: number,
        percent: number,
        weapon: Weapon,
        events: ArenaEvent[],
        spike = false
    ): number {
        if (!this.hurts(victim)) return 0
        const added = this.addPercent(by, victim, percent, weapon, events)
        const speed = knockOf(knock, victim.percent, this.weightOf(victim))
        const along = flat(aim) ?? flat(new Vector3(victim.body.x - by.body.x, 0, victim.body.z - by.body.z))
        const [x, z] = along ? [along.x, along.z] : [0, 0]
        const body = victim.body
        victim.body = spike
            ? { ...body, vx: body.vx + x * speed * 0.3, vy: body.vy - speed, vz: body.vz + z * speed * 0.3 }
            : {
                  ...body,
                  vx: body.vx + x * speed,
                  vy: Math.max(body.vy, 0) + speed * SHOVE.lift + Math.max(0, aim.y) * speed * 0.5,
                  vz: body.vz + z * speed,
                  onGround: false,
              }
        victim.body.stun = Math.max(body.stun, stunOf(speed))

        return added
    }

    /** % on `victim` from `by` (an anvil and the Bonus count), remembered as their last hit. Returns what was added. */
    private addPercent(by: Fighter, victim: Fighter, amount: number, weapon: Weapon, events: ArenaEvent[]): number {
        const added = amount * (by.anvilUntil > this.step ? ANVIL.percent : 1) * this.bonusOf(by)
        const before = Math.floor(victim.percent)
        victim.percent = Math.min(SHOVE.maxPercent, victim.percent + added)
        victim.lastHit = { by: by.id, weapon, step: this.step }
        // Whole points, for the tallies (the blower adds fractions a step).
        const whole = Math.floor(victim.percent) - before
        if (whole > 0) events.push({ type: 'damage', by: by.id, target: victim.id, amount: whole, headshot: false })
        return Math.round(added)
    }

    /** How heavy they are: a giant and an anvil barely move, an intern flies. */
    private weightOf(f: Fighter): number {
        const size = f.body.big > 0 ? 2.5 : f.body.small > 0 ? 0.6 : 1
        return size * (f.anvilUntil > this.step ? ANVIL.weight : 1)
    }

    /** Shove's magnets: whoever holds one pulls everyone near them in. */
    private magnets(): void {
        const dt = STEP_MS / 1000
        for (const m of this.fighters.values()) {
            if (!m.alive || m.magnetUntil <= this.step) continue
            for (const v of this.fighters.values()) {
                if (v === m || !v.alive || (m.team !== null && v.team === m.team)) continue
                const dx = m.body.x - v.body.x
                const dz = m.body.z - v.body.z
                const distance = Math.hypot(dx, dz)
                if (distance > MAGNET.reach || distance < 0.2) continue
                const pull = (MAGNET.pull * dt) / this.weightOf(v)
                v.body = { ...v.body, vx: v.body.vx + (dx / distance) * pull, vz: v.body.vz + (dz / distance) * pull }
            }
        }
    }

    /** Shove's bubble: falling off the deck, it floats you back up once, toward the middle. */
    private bubbleCatch(f: Fighter): void {
        if (f.bubbleUntil <= this.step || this.world.outBelow === undefined || f.body.y > BUBBLE.catchBelow) return
        f.bubbleUntil = 0
        const out = Math.hypot(f.body.x, f.body.z)
        const [bx, bz] = out > 1e-6 ? [-f.body.x / out, -f.body.z / out] : [0, 0]
        f.body = { ...f.body, vx: bx * 3, vy: BUBBLE.lift, vz: bz * 3, stun: 0 }
    }

    /** Their damage multiplier: the Bonus doubles it. */
    private bonusOf(fighter: Fighter): number {
        return fighter.bonusUntil > this.step ? BONUS : 1
    }

    /** Can they be hurt now? Not when down, or still spawn-shielded. */
    private hurts(victim: Fighter | undefined): victim is Fighter {
        return victim !== undefined && victim.alive && !this.shielded(victim)
    }

    /** Hurts the victim; `by` null (they left) or the victim themselves (their own rocket) kills nobody's tally. */
    private damage(
        by: Fighter | null,
        victim: Fighter,
        amount: number,
        how: { headshot: boolean; weapon: Weapon; backstab: boolean },
        events: ArenaEvent[]
    ): void {
        if (!victim.alive) return
        // The firewall takes it first; what it soaks never reaches them.
        if (victim.firewall > 0) {
            const soaked = Math.min(victim.firewall, amount)
            victim.firewall -= soaked
            amount -= soaked
            if (victim.firewall <= 0) victim.firewallUntil = 0
            if (amount <= 0) return
        }
        const dealt = Math.min(victim.health, amount)
        victim.health = Math.max(0, victim.health - amount)
        victim.hurtAt = this.step
        if (by && by !== victim) {
            events.push({ type: 'damage', by: by.id, target: victim.id, amount, headshot: how.headshot })
            const tally = victim.taken.get(by.id) ?? { hits: 0, damage: 0, headshots: 0, since: this.step }
            tally.hits++
            tally.damage += dealt
            if (how.headshot) tally.headshots++
            victim.taken.set(by.id, tally)
            victim.lastHit = { by: by.id, weapon: how.weapon, step: this.step }
        }
        if (victim.health > 0) return
        this.down(by, victim, how, events)
    }

    /**
     * Off the map (Cloud Nine's ledges): out, a kill for whoever hit them last if that was within
     * RING_OUT_CREDIT_STEPS (with what they hit them with), else nobody's. In the office, falling
     * through the floor (somehow) only puts them back at a spawn. True when they're gone.
     */
    private fellOut(fighter: Fighter, events: ArenaEvent[]): boolean {
        const outBelow = this.world.outBelow
        if (!fighter.alive || fighter.body.y >= (outBelow ?? LOST_BELOW)) return false
        if (outBelow === undefined) {
            events.push(this.spawn(fighter))
            return true
        }
        const last = fighter.lastHit
        const recent = last && this.step - last.step <= RING_OUT_CREDIT_STEPS ? last : null
        const by = recent ? (this.fighters.get(recent.by) ?? null) : null
        const weapon = recent?.weapon ?? weaponIn(fighter.slot, fighter.loadout, this.shove)
        fighter.health = 0
        this.down(by, fighter, { headshot: false, weapon, backstab: false, fall: true }, events)

        return true
    }

    /** Down: the kill (for `by`, unless that's nobody or themselves), their powers gone, the respawn timer running. */
    private down(
        by: Fighter | null,
        victim: Fighter,
        how: { headshot: boolean; weapon: Weapon; backstab: boolean; fall?: boolean },
        events: ArenaEvent[]
    ): void {
        // Read before they lose their powers below (the killer's are theirs, but they may be the same).
        const recap = by && by !== victim ? this.recap(by, victim, how.weapon) : undefined
        victim.alive = false
        victim.jetting = false
        victim.respawnAt = this.step + RESPAWN_STEPS
        // Their powers go with them (those in their body at the respawn).
        this.losePowers(victim)
        const victimStreak = victim.lifeKills
        victim.lifeKills = 0
        const killer = by && by !== victim ? by : null
        if (killer) killer.lifeKills++
        events.push({
            type: 'kill',
            killer: killer?.id ?? null,
            victim: victim.id,
            ...how,
            killerStreak: killer?.lifeKills ?? 0,
            victimStreak,
            ...(recap ? { recap } : {}),
        })
    }

    /** How `killer` just killed `victim` with `weapon`, for the victim's death screen. */
    private recap(killer: Fighter, victim: Fighter, weapon: Weapon): KillRecap {
        // A gun's rounds left (not the stapler's, not Shove's tools).
        const slot =
            isMelee(weapon) || isTool(weapon) ? null : killer.loadout.primary === weapon ? 'primary' : 'secondary'
        const own = victim.taken.get(killer.id) ?? { hits: 0, damage: 0, headshots: 0, since: this.step }
        let othersDamage = 0
        for (const [id, tally] of victim.taken) if (id !== killer.id) othersDamage += tally.damage
        const a = killer.body
        const b = victim.body

        return {
            distance: round(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), 1),
            killerHealth: Math.ceil(killer.health),
            ammo: slot ? killer.guns[slot].ammo : null,
            magazine: slot ? this.magazineOf(killer, gunIn(killer, slot)) : null,
            buffs: this.buffsOf(killer).map(buff => buff.kind),
            hits: own.hits,
            damage: Math.round(own.damage),
            headshots: own.headshots,
            timeMs: Math.round((this.step - own.since) * STEP_MS),
            othersDamage: Math.round(othersDamage),
        }
    }

    /**
     * The others where the shooter saw them: `view` steps back, at most MAX_REWIND_STEPS, alive then
     * and now. Teammates aren't targets: shots and swings go through them.
     */
    private targetsAt(view: number, shooter: string): Target[] {
        const wanted = Math.max(this.step - MAX_REWIND_STEPS, Math.min(this.step, Math.round(view)))
        const past = this.history.find(h => h.step === wanted)
        const from = this.fighters.get(shooter)
        const team = from?.team ?? null
        const targets: Target[] = []
        for (const fighter of this.fighters.values()) {
            if (fighter.id === shooter || !fighter.alive) continue
            if (team !== null && fighter.team === team) continue
            if (from && this.apart(middleOf(from.body), middleOf(fighter.body))) continue
            targets.push(past?.at.get(fighter.id) ?? this.targetOf(fighter))
        }

        return targets
    }

    /**
     * Siege's dome stands between these two points (one in, one out): nothing gets across, not even
     * a hit box poking through the shell (it's wider than the body the shell holds in).
     */
    private apart(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
        const dome = this.world.dome
        if (!dome) return false
        const inside = (p: { x: number; y: number; z: number }) =>
            Math.hypot(p.x - dome.x, p.y, p.z - dome.z) < dome.radius
        return inside(a) !== inside(b)
    }

    /** Where a fighter stands as something to hit: feet, facing, size. */
    private targetOf(f: Fighter): Target {
        return {
            id: f.id,
            x: f.body.x,
            y: f.body.y,
            z: f.body.z,
            yaw: f.yaw,
            scale: scaleOf(f.body),
            prone: f.body.prone,
        }
    }

    private losePowers(f: Fighter): void {
        f.magazineUntil = 0
        f.headshotUntil = 0
        f.bonusUntil = 0
        f.orgchartUntil = 0
        f.firewall = 0
        f.firewallUntil = 0
        f.anvilUntil = 0
        f.bubbleUntil = 0
        f.magnetUntil = 0
    }

    private remember(): void {
        const at = new Map<string, Target>()
        for (const f of this.fighters.values()) {
            if (f.alive) at.set(f.id, this.targetOf(f))
        }
        this.history.push({ step: this.step, at })
        while (this.history.length > MAX_REWIND_STEPS + 1) this.history.shift()
    }

    private spawn(fighter: Fighter): ArenaEvent {
        // A side's own spawns (siege): a random one where a mini fits (furniture), else any of them.
        const fixed = this.spawnsOf?.(fighter.team)
        const open = fixed?.filter(p => this.fits(p.x, p.z))
        const choice = open?.length ? open : fixed
        const point = choice?.length
            ? choice[Math.floor(this.random() * choice.length)]!
            : (({ position, yaw }) => ({ x: position[0], z: position[2], yaw }))(this.spawnPoint(fighter.id))
        fighter.body = bodyAt(point.x, 0.02, point.z)
        fighter.yaw = point.yaw
        fighter.pitch = 0
        fighter.jetting = false
        fighter.health = MAX_HEALTH
        fighter.alive = true
        fighter.shieldUntil = this.step + SHIELD_STEPS
        fighter.nextSwingAt = 0
        fighter.readyAt = 0
        fighter.lifeKills = 0
        this.losePowers(fighter)
        fighter.taken.clear()
        fighter.lastHit = null
        fighter.percent = 0
        fighter.chargeFrom = null
        fighter.blowing = false
        fighter.body.windX = this.wind.x
        fighter.body.windZ = this.wind.z
        this.arm(fighter)

        return { type: 'spawn', id: fighter.id }
    }

    /** Does a standing mini fit on the floor at x, z (nothing of the office or a built wall in the way)? */
    private fits(x: number, z: number): boolean {
        const { radius, height } = sizeAt(1)
        fitSeg.start.set(x, 0.02 + radius, z)
        fitSeg.end.set(x, 0.02 + height - radius, z)
        return !collideCapsule(this.world, fitSeg, radius)
    }

    /** Their next loadout in hand, every gun full. */
    private arm(fighter: Fighter): void {
        fighter.loadout = fighter.nextLoadout
        fighter.guns = {
            primary: freshGun(magazineOf(fighter.loadout.primary)),
            secondary: freshGun(magazineOf(fighter.loadout.secondary)),
        }
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

/** A direction flattened onto the floor plan, as a unit vector (null when it points straight up or down). */
function flat(v: Vector3): Vector3 | null {
    const h = Math.hypot(v.x, v.z)
    return h > 1e-3 ? new Vector3(v.x / h, 0, v.z / h) : null
}

/** Halfway up a body (whichever side of a dome that is, the body is). */
function middleOf(body: Body): { x: number; y: number; z: number } {
    return { x: body.x, y: body.y + sizeOf(body).height / 2, z: body.z }
}

function freshGun(ammo: number): GunState {
    return { ammo, reloadUntil: 0, nextShotAt: 0 }
}

/** The gun in a slot of theirs. */
function gunIn(fighter: Fighter, slot: 'primary' | 'secondary'): Gun {
    return slot === 'primary' ? fighter.loadout.primary : fighter.loadout.secondary
}

/** How far through reloading the gun in hand (0–1, two decimals), null when not reloading. */
function reloadOf(fighter: Fighter): number | null {
    if (fighter.slot === 'melee') return null
    const until = fighter.guns[fighter.slot].reloadUntil
    if (until <= fighter.clock) return null
    const total = steps(reloadMsOf(gunIn(fighter, fighter.slot)))

    return round(Math.max(0, Math.min(1, 1 - (until - fighter.clock) / total)), 2)
}

function round(value: number, decimals: number): number {
    const k = 10 ** decimals
    return Math.round(value * k) / k
}
