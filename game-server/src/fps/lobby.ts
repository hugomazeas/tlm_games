import type { Rng } from '../sim/rng.ts'
import {
    type GameEvent,
    type InputFrame,
    MAX_PLAYERS,
    type MatchView,
    type Phase,
    type PlayerInfo,
    type Score,
    type ServerMessage,
} from './protocol.ts'
import { Arena, type ArenaEvent } from './sim/arena.ts'
import { STEP_MS } from './sim/movement.ts'
import type { FpsWorld } from './sim/world.ts'

/**
 * The office FPS's one game. Pure (clock and randomness come in through the hooks), like the
 * racing lobbies: the socket server feeds it connections and inputs and calls tick().
 *
 * There is only ever one game, always open. People join on the fly: in warmup, during the
 * countdown, mid-match (straight in, 0 kills, the safest spawn) or at the scoreboard. Once two
 * are in, a countdown starts the match: first to FRAG_LIMIT kills, or the most when the time runs
 * out. A scoreboard, then the next match starts by itself. Fewer than two left calls a match off.
 * Seats are capped at MAX_PLAYERS: later arrivals watch, and take the first seat that frees.
 */

export const MIN_PLAYERS = 2
export const FRAG_LIMIT = 15
export const MATCH_MS = 5 * 60_000
export const COUNTDOWN_MS = 5_000
export const INTERMISSION_MS = 10_000
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
const PHASE_MS: Record<Phase, number | null> = {
    warmup: null,
    countdown: COUNTDOWN_MS,
    playing: MATCH_MS,
    intermission: INTERMISSION_MS,
}

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

export interface MatchResult {
    startedAt: number
    endedAt: number
    /** Best first. People only (guests played but aren't recorded); everyone who played, including who left. */
    players: Array<{
        playerId: number
        name: string
        place: number
        kills: number
        deaths: number
        headshots: number
        damage: number
        left: boolean
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
    kills: number
    deaths: number
    headshots: number
    damage: number
}

export class FpsLobby {
    private readonly members = new Map<string, Member>()
    /** Watching for want of a seat, first come first seated. */
    private readonly waiting: string[] = []
    private readonly arena: Arena
    private phase: Phase = 'warmup'
    private phaseEndsAt: number | null = null
    private matchStartedAt = 0
    private tallies = new Map<string, Tally>()
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
        this.checkPlayers()
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
            if (tally) tally.connId = null
            this.seatNextWaiting()
        }
        this.broadcast({ type: 'roster', players: this.roster() })
        this.checkPlayers()
        this.broadcast({ type: 'match', match: this.view() })
    }

    input(connId: string, frames: readonly InputFrame[]): void {
        const member = this.members.get(connId)
        if (!member || member.info.watching) return
        this.arena.queue(connId, frames)
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
            if (this.phase === 'playing' && this.leaderKills() >= FRAG_LIMIT) this.endMatch()
            if (this.arena.step % SNAPSHOT_EVERY === 0) this.snapshot()
        }

        if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) {
            if (this.phase === 'countdown') this.startMatch()
            else if (this.phase === 'playing') this.endMatch()
            else if (this.phase === 'intermission') {
                if (this.seatedCount() >= MIN_PLAYERS) this.startMatch()
                else this.setPhase('warmup')
            }
        }
    }

    /** How many are seated, and how many watch: for the Hub's page. */
    summary(): { phase: Phase; players: number; watching: number } {
        return { phase: this.phase, players: this.seatedCount(), watching: this.waiting.length }
    }

    private seat(member: Member): void {
        member.info.watching = false
        this.record(this.arena.add(member.conn.id))
        const tally = this.tallies.get(member.key)
        // Back in the same match (a dropped connection, a reload): their score is still theirs.
        if (tally) tally.connId = member.conn.id
        else if (this.phase === 'playing') this.tallies.set(member.key, this.newTally(member))
    }

    private seatNextWaiting(): void {
        while (this.waiting.length > 0 && this.seatedCount() < MAX_PLAYERS) {
            const next = this.members.get(this.waiting.shift()!)
            if (next) this.seat(next)
        }
    }

    /** Enough people for a match? Count down to one; too few to go on, call it off. */
    private checkPlayers(): void {
        const enough = this.seatedCount() >= MIN_PLAYERS
        if (this.phase === 'warmup' && enough) this.setPhase('countdown')
        else if ((this.phase === 'countdown' || this.phase === 'playing') && !enough) this.setPhase('warmup')
    }

    private startMatch(): void {
        this.tallies = new Map()
        for (const member of this.seatedMembers()) this.tallies.set(member.key, this.newTally(member))
        this.matchStartedAt = this.hooks.now()
        this.record(this.arena.respawnAll())
        this.setPhase('playing')
    }

    private endMatch(): void {
        const ranked = this.ranked()
        const people = ranked.filter(t => t.playerId !== null)
        if (ranked.length >= MIN_PLAYERS && people.length > 0) {
            this.hooks.onResults({
                startedAt: this.matchStartedAt,
                endedAt: this.hooks.now(),
                players: people.map(t => ({
                    playerId: t.playerId!,
                    name: t.name,
                    place: ranked.indexOf(t) + 1,
                    kills: t.kills,
                    deaths: t.deaths,
                    headshots: t.headshots,
                    damage: t.damage,
                    left: t.connId === null,
                })),
            })
        }
        this.setPhase('intermission')
    }

    private setPhase(phase: Phase): void {
        this.phase = phase
        const length = PHASE_MS[phase]
        this.phaseEndsAt = length === null ? null : this.hooks.now() + length
        // Warmup and the countdown are for practice: nobody's counted.
        if (phase === 'warmup' || phase === 'countdown') this.tallies = new Map()
        this.broadcast({ type: 'match', match: this.view() })
    }

    /** Keeps the score (while it counts) and queues what everyone should see. */
    private record(events: readonly ArenaEvent[]): void {
        let scored = false
        for (const event of events) {
            if (this.phase === 'playing') {
                if (event.type === 'damage') {
                    const by = this.tallyOf(event.by)
                    if (by) by.damage += event.amount
                }
                if (event.type === 'kill') {
                    const victim = this.tallyOf(event.victim)
                    const killer = event.killer ? this.tallyOf(event.killer) : undefined
                    if (victim) victim.deaths++
                    if (killer) {
                        killer.kills++
                        if (event.headshot) killer.headshots++
                    }
                    scored = true
                }
            }
            if (event.type !== 'damage') this.events.push(event)
        }
        if (scored) this.broadcast({ type: 'match', match: this.view() })
    }

    private snapshot(): void {
        const players = this.arena.states()
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
            })
        }
    }

    private view(): MatchView {
        const now = this.hooks.now()

        return {
            phase: this.phase,
            remainingMs: this.phaseEndsAt === null ? null : Math.max(0, this.phaseEndsAt - now),
            fragLimit: FRAG_LIMIT,
            scores: this.ranked().map(
                (t): Score => ({ id: t.connId, name: t.name, color: t.color, kills: t.kills, deaths: t.deaths })
            ),
        }
    }

    /** Most kills first, then fewest deaths, then whoever got there first. */
    private ranked(): Tally[] {
        return [...this.tallies.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    }

    private leaderKills(): number {
        return Math.max(0, ...[...this.tallies.values()].map(t => t.kills))
    }

    private tallyOf(connId: string): Tally | undefined {
        const member = this.members.get(connId)
        return member ? this.tallies.get(member.key) : undefined
    }

    private newTally(member: Member): Tally {
        return {
            name: member.info.name,
            color: member.info.color,
            playerId: member.info.playerId,
            connId: member.conn.id,
            kills: 0,
            deaths: 0,
            headshots: 0,
            damage: 0,
        }
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

    private broadcast(message: ServerMessage, except?: string): void {
        for (const member of this.members.values()) {
            if (member.conn.id !== except) member.conn.send(message)
        }
    }
}
