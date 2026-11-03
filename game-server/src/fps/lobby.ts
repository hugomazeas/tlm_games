import type { Rng } from '../sim/rng.ts'
import {
    type Award,
    DEFAULT_RULES,
    type ErrorCode,
    type GameEvent,
    type InputFrame,
    MAX_PLAYERS,
    type MatchView,
    type Mode,
    type Phase,
    type PlayerInfo,
    type Rules,
    type Score,
    type ServerMessage,
    type Team,
    TEAMS,
    type Weapon,
    ZONE_SECONDS_PER_POINT,
    type ZoneState,
} from './protocol.ts'
import { Arena, type ArenaEvent } from './sim/arena.ts'
import { STEP_MS } from './sim/movement.ts'
import { inZone, ZONE_MS, ZONES } from './sim/places.ts'
import type { FpsWorld } from './sim/world.ts'

/**
 * The office FPS's one game. Pure (clock and randomness come in through the hooks), like the
 * racing lobbies: the socket server feeds it connections and inputs and calls tick().
 *
 * There is only ever one game, always open, and people join on the fly: in warmup, during the
 * countdown, mid-match (straight in, 0 kills, the safest spawn; in team deathmatch onto the
 * smaller side) or at the scoreboard. Between matches everyone warms up (nothing counts) until the
 * host, the longest seated, picks the rules (a mode, a limit, a length) and starts one: a
 * countdown, then the match, then a scoreboard with its awards, then warmup again. Fewer than two
 * left calls a match off. Seats are capped at MAX_PLAYERS: later arrivals watch, and take the first
 * seat that frees.
 *
 * The modes: free for all (first to the kill limit); team deathmatch (red against blue, first side
 * to the kill limit; teammates can't hurt each other); king of the meeting room (the zone moves
 * around the office every ZONE_MS; holding it alone scores a second a second, first to ten times
 * the limit in seconds).
 */

export const MIN_PLAYERS = 2
export const COUNTDOWN_MS = 5_000
export const INTERMISSION_MS = 12_000
/** A snapshot every this many steps (30 Hz). */
export const SNAPSHOT_EVERY = 2
/** Behind by more than this many steps (the process stalled), skip ahead rather than catch up. */
const MAX_CATCH_UP = 10

const COLORS = [
    '#e4572e',
    '#29a3e0',
    '#7bc950',
    '#f2b134',
    '#a05fd6',
    '#e05aa8',
    '#2ec4b6',
    '#ff8c42',
    '#5c7cfa',
    '#c0ca33',
    '#8d6e63',
    '#ef476f',
]

export interface Connection {
    id: string
    send(message: ServerMessage): void
    close(): void
}

export interface Joiner {
    /** The Hub's player, or null for a guest. */
    playerId: number | null
    name: string
    color?: string
}

/** One person's match. */
export interface PlayerResult {
    playerId: number
    name: string
    place: number
    /** Their side won (team deathmatch), or they placed first. */
    won: boolean
    team: Team | null
    kills: number
    deaths: number
    headshots: number
    damage: number
    /** Blaster shots fired, and those that hurt someone. */
    shots: number
    hits: number
    meleeKills: number
    backstabs: number
    /** Most kills in one life. */
    bestStreak: number
    /** Time in the match (ms), across reconnects. */
    playedMs: number
    /** Time holding the zone alone (ms; king of the meeting room). */
    zoneMs: number
    pickups: number
    left: boolean
}

export interface MatchResult {
    startedAt: number
    endedAt: number
    rules: Rules
    /** Everyone who played, guests included (for the size of the match). */
    playerCount: number
    /** Best first. People only (guests played but aren't recorded); including who left. */
    players: PlayerResult[]
    /** Every kill, in order. A guest is null. */
    kills: Array<{
        killerId: number | null
        victimId: number | null
        weapon: Weapon
        headshot: boolean
        backstab: boolean
        /** Since the match started. */
        atMs: number
    }>
}

export interface LobbyHooks {
    now(): number
    random: Rng
    onResults(result: MatchResult): void
}

interface Member {
    conn: Connection
    info: PlayerInfo
    /** The key of their score: their Hub player, else this connection. */
    key: string
}

interface Tally {
    name: string
    color: string
    playerId: number | null
    connId: string | null
    team: Team | null
    kills: number
    deaths: number
    headshots: number
    damage: number
    shots: number
    hits: number
    meleeKills: number
    backstabs: number
    streak: number
    bestStreak: number
    playedMs: number
    zoneMs: number
    pickups: number
    /** In the match since (ms), while they're connected. */
    since: number | null
}

export class FpsLobby {
    private readonly members = new Map<string, Member>()
    /** Watching for want of a seat, first come first seated. */
    private readonly waiting: string[] = []
    private readonly arena: Arena
    private phase: Phase = 'warmup'
    private phaseEndsAt: number | null = null
    private rules: Rules = DEFAULT_RULES
    private matchStartedAt = 0
    private tallies = new Map<string, Tally>()
    private kills: MatchResult['kills'] = []
    private awards: Award[] | null = null
    /** King of the meeting room: the order the zones come in, and the one now. */
    private zoneOrder: number[] = []
    private zone: ZoneState | null = null
    /** The clock the steps run on: step n is due at clockStart + n × STEP_MS. */
    private clockStart: number
    private events: GameEvent[] = []

    constructor(
        world: FpsWorld,
        private readonly hooks: LobbyHooks
    ) {
        this.arena = new Arena(world, hooks.random)
        this.clockStart = hooks.now()
    }

    /** Someone opens the game. The same Hub player in a second tab takes over from the first. */
    join(conn: Connection, joiner: Joiner): void {
        if (this.members.has(conn.id)) return
        if (joiner.playerId !== null) {
            const earlier = [...this.members.values()].find(m => m.info.playerId === joiner.playerId)
            if (earlier) {
                earlier.conn.send({ type: 'replaced' })
                this.leave(earlier.conn.id)
                earlier.conn.close()
            }
        }

        const seated = this.seatedCount() < MAX_PLAYERS
        const info: PlayerInfo = {
            id: conn.id,
            name: joiner.name,
            color: joiner.color ?? this.freeColor(),
            playerId: joiner.playerId,
            watching: !seated,
        }
        const member: Member = { conn, info, key: joiner.playerId !== null ? `p${joiner.playerId}` : conn.id }
        this.members.set(conn.id, member)
        if (seated) this.seat(member)
        else this.waiting.push(conn.id)

        conn.send({ type: 'welcome', you: conn.id, step: this.arena.step, players: this.roster(), match: this.view() })
        this.broadcast({ type: 'roster', players: this.roster() }, conn.id)
        // The first one in becomes host, and a team needs counting: everyone's view says so.
        this.broadcast({ type: 'match', match: this.view() }, conn.id)
    }

    leave(connId: string): void {
        const member = this.members.get(connId)
        if (!member) return
        this.members.delete(connId)
        const queued = this.waiting.indexOf(connId)
        if (queued >= 0) this.waiting.splice(queued, 1)
        if (!member.info.watching) {
            this.arena.remove(connId)
            const tally = this.tallies.get(member.key)
            if (tally) {
                tally.connId = null
                this.clockOut(tally)
            }
            this.seatNextWaiting()
        }
        this.broadcast({ type: 'roster', players: this.roster() })
        // Too few to go on: called off.
        if ((this.phase === 'countdown' || this.phase === 'playing') && this.seatedCount() < MIN_PLAYERS) {
            this.setPhase('warmup')
        } else {
            this.broadcast({ type: 'match', match: this.view() })
        }
    }

    input(connId: string, frames: readonly InputFrame[]): void {
        const member = this.members.get(connId)
        if (!member || member.info.watching) return
        this.arena.queue(connId, frames)
    }

    /** The host starts a match with these rules (from warmup, with someone to play). */
    start(connId: string, rules: Rules): void {
        const member = this.members.get(connId)
        if (!member) return
        if (this.host() !== connId) return this.refuse(member, 'NOT_HOST')
        if (this.phase !== 'warmup') return
        if (this.seatedCount() < MIN_PLAYERS) return this.refuse(member, 'NOT_ENOUGH')
        this.rules = { ...rules }
        this.setPhase('countdown')
    }

    /** Runs the steps that are due, moves the phases on and sends the snapshots. Call it often (every few ms). */
    tick(): void {
        const now = this.hooks.now()
        let due = Math.floor((now - this.clockStart) / STEP_MS)
        if (due - this.arena.step > MAX_CATCH_UP) {
            const skipped = due - this.arena.step - MAX_CATCH_UP
            this.clockStart += skipped * STEP_MS
            due = this.arena.step + MAX_CATCH_UP
            // The browsers didn't stop: their frames for the skipped time are coming, and may all be used.
            this.arena.grant(skipped)
        }
        while (this.arena.step < due) {
            this.record(this.arena.advance())
            if (this.phase === 'playing' && this.rules.mode === 'koth') this.holdZone()
            if (this.phase === 'playing' && this.reachedLimit()) this.endMatch()
            if (this.arena.step % SNAPSHOT_EVERY === 0) this.snapshot()
        }

        if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) {
            if (this.phase === 'countdown') this.startMatch()
            else if (this.phase === 'playing') this.endMatch()
            else if (this.phase === 'intermission') this.setPhase('warmup')
        }
    }

    /** How many are seated, and how many watch: for the Hub's page. */
    summary(): { phase: Phase; players: number; watching: number } {
        return { phase: this.phase, players: this.seatedCount(), watching: this.waiting.length }
    }

    /** The longest seated: they start matches and pick the rules. */
    private host(): string | null {
        return this.seatedMembers()[0]?.conn.id ?? null
    }

    private seat(member: Member): void {
        member.info.watching = false
        const tally = this.tallies.get(member.key)
        // In a team match a newcomer joins the smaller side; someone back keeps theirs.
        const team = this.phase === 'playing' && this.rules.mode === 'tdm' ? (tally?.team ?? this.smallerTeam()) : null
        this.record(this.arena.add(member.conn.id, team))
        // Back in the same match (a dropped connection, a reload): their score is still theirs.
        if (tally) {
            tally.connId = member.conn.id
            tally.since = this.hooks.now()
        } else if (this.phase === 'playing') {
            this.tallies.set(member.key, this.newTally(member))
        }
    }

    private seatNextWaiting(): void {
        while (this.waiting.length > 0 && this.seatedCount() < MAX_PLAYERS) {
            const next = this.members.get(this.waiting.shift()!)
            if (next) this.seat(next)
        }
    }

    /** The side with fewer seated (a coin toss when even). */
    private smallerTeam(): Team {
        const count = (team: Team) => this.seatedMembers().filter(m => this.arena.teamOf(m.conn.id) === team).length
        const [red, blue] = [count('red'), count('blue')]
        if (red !== blue) return red < blue ? 'red' : 'blue'
        return this.hooks.random() < 0.5 ? 'red' : 'blue'
    }

    private startMatch(): void {
        this.tallies = new Map()
        this.kills = []
        this.awards = null
        const seated = this.shuffled(this.seatedMembers())
        seated.forEach((member, i) => {
            this.arena.setTeam(member.conn.id, this.rules.mode === 'tdm' ? TEAMS[i % 2]! : null)
        })
        for (const member of this.seatedMembers()) this.tallies.set(member.key, this.newTally(member))
        this.zoneOrder = this.shuffled(ZONES.map((_, i) => i))
        this.zone = null
        this.matchStartedAt = this.hooks.now()
        this.record(this.arena.respawnAll())
        this.setPhase('playing')
        if (this.rules.mode === 'koth') this.holdZone()
    }

    /** Has someone (or a side) reached the match's limit? */
    private reachedLimit(): boolean {
        const tallies = [...this.tallies.values()]
        if (this.rules.mode === 'koth') {
            const needed = this.rules.fragLimit * ZONE_SECONDS_PER_POINT * 1000
            return tallies.some(t => t.zoneMs >= needed)
        }
        if (this.rules.mode === 'tdm') return Math.max(...Object.values(this.teamKills())) >= this.rules.fragLimit
        return tallies.some(t => t.kills >= this.rules.fragLimit)
    }

    /**
     * King of the meeting room, one step: which zone is up, who's in it, and a step's worth of
     * time to whoever holds it alone (nobody when it's contested).
     */
    private holdZone(): void {
        const elapsed = this.hooks.now() - this.matchStartedAt
        const index = this.zoneOrder[Math.floor(elapsed / ZONE_MS) % this.zoneOrder.length]!
        const zone = ZONES[index]!
        const inside = this.arena.states().filter(s => s.alive && inZone(zone, s.x, s.z))
        const holder = inside.length === 1 ? inside[0]!.id : null
        if (holder) {
            const tally = this.tallyOf(holder)
            if (tally) {
                const before = Math.floor(tally.zoneMs / 1000)
                tally.zoneMs += STEP_MS
                // The scoreboard moves once a second, not every step.
                if (Math.floor(tally.zoneMs / 1000) !== before) this.broadcast({ type: 'match', match: this.view() })
            }
        }
        this.zone = { index, holder, contested: inside.length > 1, movesInMs: ZONE_MS - (elapsed % ZONE_MS) }
    }

    private endMatch(): void {
        for (const tally of this.tallies.values()) this.clockOut(tally)
        const ranked = this.ranked()
        const teams = this.teamKills()
        const winner: Team | null =
            this.rules.mode !== 'tdm' || teams.red === teams.blue ? null : teams.red > teams.blue ? 'red' : 'blue'
        const won = (t: Tally) => (this.rules.mode === 'tdm' ? t.team !== null && t.team === winner : ranked[0] === t)
        this.awards = this.awardsFor(ranked)
        const people = ranked.filter(t => t.playerId !== null)
        if (ranked.length >= MIN_PLAYERS && people.length > 0) {
            this.hooks.onResults({
                startedAt: this.matchStartedAt,
                endedAt: this.hooks.now(),
                rules: { ...this.rules },
                playerCount: ranked.length,
                players: people.map(t => ({
                    playerId: t.playerId!,
                    name: t.name,
                    place: ranked.indexOf(t) + 1,
                    won: won(t),
                    team: t.team,
                    kills: t.kills,
                    deaths: t.deaths,
                    headshots: t.headshots,
                    damage: t.damage,
                    shots: t.shots,
                    hits: t.hits,
                    meleeKills: t.meleeKills,
                    backstabs: t.backstabs,
                    bestStreak: t.bestStreak,
                    playedMs: t.playedMs,
                    zoneMs: Math.round(t.zoneMs),
                    pickups: t.pickups,
                    left: t.connId === null,
                })),
                kills: this.kills,
            })
        }
        this.setPhase('intermission')
    }

    /** The match's standouts, from its tallies (best first): each award to the top of its column. */
    private awardsFor(ranked: Tally[]): Award[] {
        const awards: Award[] = []
        const give = (title: string, value: (t: Tally) => number, detail: (v: number) => string, least = 1) => {
            let best: Tally | null = null
            for (const t of ranked) if (value(t) >= least && (!best || value(t) > value(best))) best = t
            if (best) awards.push({ title, detail: detail(value(best)), name: best.name, color: best.color })
        }
        const mvp = ranked[0]
        if (mvp) {
            const detail =
                this.rules.mode === 'koth' ? `${Math.floor(mvp.zoneMs / 1000)} s in the zone` : `${mvp.kills} kills`
            awards.push({ title: 'MVP', detail, name: mvp.name, color: mvp.color })
        }
        const accuracy = (t: Tally) => (t.shots >= 10 ? Math.round((t.hits / t.shots) * 100) : 0)
        give('Sharpshooter', accuracy, v => `${v}% accuracy`)
        give(
            'Headhunter',
            t => t.headshots,
            v => `${v} headshot${v > 1 ? 's' : ''}`
        )
        give(
            'Stapler master',
            t => t.meleeKills,
            v => `${v} stapler kill${v > 1 ? 's' : ''}`
        )
        give(
            'Unstoppable',
            t => t.bestStreak,
            v => `${v} kills in one life`,
            3
        )
        give(
            'Damage dealer',
            t => t.damage,
            v => `${v} damage`
        )
        give(
            'Scavenger',
            t => t.pickups,
            v => `${v} pickups`,
            2
        )
        give(
            'Punching bag',
            t => t.deaths,
            v => `went down ${v} times`,
            3
        )

        return awards
    }

    private setPhase(phase: Phase): void {
        this.phase = phase
        const length = {
            warmup: null,
            countdown: COUNTDOWN_MS,
            playing: this.rules.minutes * 60_000,
            intermission: INTERMISSION_MS,
        }[phase]
        this.phaseEndsAt = length === null ? null : this.hooks.now() + length
        if (phase === 'warmup' || phase === 'countdown') {
            // Warmup and the countdown are for practice: nobody's counted, and no sides.
            this.tallies = new Map()
            for (const member of this.seatedMembers()) this.arena.setTeam(member.conn.id, null)
            this.zone = null
        }
        if (phase !== 'intermission') this.awards = null
        this.broadcast({ type: 'match', match: this.view() })
    }

    /** Keeps the score (while it counts) and queues what everyone should see. */
    private record(events: readonly ArenaEvent[]): void {
        let scored = false
        for (const event of events) {
            if (this.phase === 'playing') {
                if (event.type === 'kill' && this.kills.length === 0) event.firstBlood = true
                scored = this.count(event) || scored
            }
            if (event.type !== 'damage') this.events.push(event)
        }
        if (scored) this.broadcast({ type: 'match', match: this.view() })
    }

    /** One event into the match's tallies. True when the scoreboard changed. */
    private count(event: ArenaEvent): boolean {
        if (event.type === 'damage') {
            const by = this.tallyOf(event.by)
            if (by) by.damage += event.amount
        }
        if (event.type === 'shot') {
            const by = this.tallyOf(event.by)
            if (by) {
                by.shots++
                if (event.damage > 0) by.hits++
            }
        }
        if (event.type === 'pickup') {
            const by = this.tallyOf(event.by)
            if (by) by.pickups++
        }
        if (event.type !== 'kill') return false

        const victim = this.tallyOf(event.victim)
        const killer = event.killer ? this.tallyOf(event.killer) : undefined
        if (victim) {
            victim.deaths++
            victim.streak = 0
        }
        if (killer) {
            killer.kills++
            killer.streak++
            killer.bestStreak = Math.max(killer.bestStreak, killer.streak)
            if (event.headshot) killer.headshots++
            if (event.weapon === 'stapler') killer.meleeKills++
            if (event.backstab) killer.backstabs++
        }
        this.kills.push({
            killerId: killer?.playerId ?? null,
            victimId: victim?.playerId ?? null,
            weapon: event.weapon,
            headshot: event.headshot,
            backstab: event.backstab,
            atMs: this.hooks.now() - this.matchStartedAt,
        })

        return true
    }

    private snapshot(): void {
        const players = this.arena.states()
        const pickups = this.arena.pickups()
        const zone = this.phase === 'playing' && this.rules.mode === 'koth' ? this.zone : null
        const events = this.events
        this.events = []
        for (const member of this.members.values()) {
            const id = member.conn.id
            member.conn.send({
                type: 'snap',
                step: this.arena.step,
                ack: this.arena.ack(id),
                you: this.arena.self(id),
                players,
                events,
                pickups,
                zone,
            })
        }
    }

    private view(): MatchView {
        const now = this.hooks.now()

        return {
            phase: this.phase,
            remainingMs: this.phaseEndsAt === null ? null : Math.max(0, this.phaseEndsAt - now),
            mode: this.rules.mode,
            fragLimit: this.rules.fragLimit,
            minutes: this.rules.minutes,
            host: this.host(),
            scores: this.ranked().map(
                (t): Score => ({
                    id: t.connId,
                    name: t.name,
                    color: t.color,
                    kills: t.kills,
                    deaths: t.deaths,
                    team: t.team,
                    points: Math.floor(t.zoneMs / 1000),
                })
            ),
            teams: this.rules.mode === 'tdm' && this.tallies.size > 0 ? this.teamKills() : null,
            awards: this.phase === 'intermission' ? this.awards : null,
        }
    }

    /** Each side's kills (team deathmatch), who left included. */
    private teamKills(): Record<Team, number> {
        const kills: Record<Team, number> = { red: 0, blue: 0 }
        for (const t of this.tallies.values()) if (t.team) kills[t.team] += t.kills
        return kills
    }

    /** Best first: in king of the meeting room the most zone time, else the most kills; then the fewest deaths. */
    private ranked(): Tally[] {
        const mode: Mode = this.rules.mode
        return [...this.tallies.values()].sort((a, b) =>
            mode === 'koth' ? b.zoneMs - a.zoneMs || b.kills - a.kills : b.kills - a.kills || a.deaths - b.deaths
        )
    }

    private tallyOf(connId: string): Tally | undefined {
        const member = this.members.get(connId)
        return member ? this.tallies.get(member.key) : undefined
    }

    /** Adds their time in the match since they (re)joined it. */
    private clockOut(tally: Tally): void {
        if (tally.since === null) return
        tally.playedMs += this.hooks.now() - tally.since
        tally.since = null
    }

    private newTally(member: Member): Tally {
        return {
            name: member.info.name,
            color: member.info.color,
            playerId: member.info.playerId,
            connId: member.conn.id,
            team: this.arena.teamOf(member.conn.id),
            kills: 0,
            deaths: 0,
            headshots: 0,
            damage: 0,
            shots: 0,
            hits: 0,
            meleeKills: 0,
            backstabs: 0,
            streak: 0,
            bestStreak: 0,
            playedMs: 0,
            zoneMs: 0,
            pickups: 0,
            since: this.hooks.now(),
        }
    }

    /** A copy in random order (the hooks' randomness, so tests can pin it). */
    private shuffled<T>(items: readonly T[]): T[] {
        const copy = [...items]
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(this.hooks.random() * (i + 1))
            ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
        }
        return copy
    }

    private roster(): PlayerInfo[] {
        return [...this.members.values()].map(m => ({ ...m.info }))
    }

    private seatedMembers(): Member[] {
        return [...this.members.values()].filter(m => !m.info.watching)
    }

    private seatedCount(): number {
        return this.seatedMembers().length
    }

    private freeColor(): string {
        const used = new Set([...this.members.values()].map(m => m.info.color))
        return COLORS.find(c => !used.has(c)) ?? COLORS[Math.floor(this.hooks.random() * COLORS.length)]!
    }

    private refuse(member: Member, code: ErrorCode): void {
        member.conn.send({ type: 'error', code })
    }

    private broadcast(message: ServerMessage, except?: string): void {
        for (const member of this.members.values()) {
            if (member.conn.id !== except) member.conn.send(message)
        }
    }
}
