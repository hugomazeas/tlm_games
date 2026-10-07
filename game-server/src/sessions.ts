import {
    type ClientMessage,
    type ErrorCode,
    MAX_PLAYERS,
    MIN_PLAYERS,
    type Phase,
    type PlayerInfo,
    type Results,
    type ServerMessage,
    type SessionView,
    type Settings,
} from './protocol.ts'
import { type Arena, generateArena } from './sim/arena.ts'
import { createGame, type GameEvent, type GameState, type Input, removePlayer, shakeLevel, step } from './sim/game.ts'
import { createRng, pickOne, type Rng } from './sim/rng.ts'
import { THEME_IDS, type ThemeId } from './sim/themes.ts'

export const TICK_MS = 50
export const COUNTDOWN_MS = 3000
export const RESULTS_MS = 8000
export const RECONNECT_GRACE_MS = 10_000
/** A stalled event loop never makes the simulation jump further than this. */
const MAX_STEP_MS = 100

export interface Connection {
    id: string
    send(message: ServerMessage): void
}

export interface GameResult {
    officeId: number
    seed: number
    theme: ThemeId
    durationSeconds: number
    startedAt: string
    endedAt: string
    players: Array<{
        playerId: number
        /** 1 for every survivor; then by how late you went out. */
        position: number
        survived: boolean
        eliminatedAtMs: number | null
        holdMs: number
        passes: number
    }>
}

export interface SessionHooks {
    now(): number
    /** Randomness during play: potato hand-outs and fuses. */
    rng: Rng
    /** Seeds the arena of each game. */
    nextSeed(): number
    onOpened(officeId: number, hostPlayerId: number): void
    onResults(result: GameResult): void
}

interface Member {
    player: PlayerInfo
    connId: string | null
    /** Set while the tab is gone; removed from the session after this time. */
    awayUntil: number | null
}

interface Session {
    officeId: number
    hostId: number
    members: Member[]
    settings: Settings
    phase: Phase
    /** When countdown or results ends. */
    phaseEndsAt: number
    game: GameState | null
    gameMeta: { seed: number; theme: ThemeId; startedAt: number } | null
    inputs: Map<number, Input>
    lastTickAt: number
}

interface Client {
    conn: Connection
    officeId: number
    player: PlayerInfo | null
}

/**
 * Every hot potato session, one per office, in memory.
 *
 * Synchronous on purpose: the WebSocket layer resolves players before calling
 * in, and time only moves through `tick()`, so tests drive it with a fake clock.
 */
export class SessionManager {
    private readonly clients = new Map<string, Client>()
    private readonly sessions = new Map<number, Session>()

    constructor(private readonly hooks: SessionHooks) {}

    connect(conn: Connection, officeId: number, player: PlayerInfo | null) {
        this.clients.set(conn.id, { conn, officeId, player })
        conn.send({ type: 'welcome', player })

        const session = this.sessions.get(officeId)
        const member = player && session?.members.find(m => m.player.id === player.id)

        // Coming back (or opening a second tab) reclaims your place.
        if (session && member) {
            member.connId = conn.id
            member.awayUntil = null
            this.broadcastOffice(session)
        } else {
            conn.send({ type: 'office', session: session ? view(session) : null })
        }

        if (session?.game && session.gameMeta && (session.phase === 'countdown' || session.phase === 'playing')) {
            conn.send(this.countdownMessage(session, session.game.arena))
        }
    }

    disconnect(connId: string) {
        const client = this.clients.get(connId)
        this.clients.delete(connId)
        if (!client?.player) return

        const session = this.sessions.get(client.officeId)
        const member = session?.members.find(m => m.connId === connId)
        if (!session || !member) return

        member.connId = null
        member.awayUntil = this.hooks.now() + RECONNECT_GRACE_MS

        if (session.game && inGame(session)) {
            this.applyEvents(session, removePlayer(session.game, member.player.id, this.hooks.rng))
        }

        this.broadcastOffice(session)
    }

    handle(connId: string, message: ClientMessage) {
        const client = this.clients.get(connId)
        if (!client) return

        const fail = (code: ErrorCode) => client.conn.send({ type: 'error', code })
        const session = this.sessions.get(client.officeId)

        if (message.type === 'hello') return fail('BAD_MESSAGE')

        const player = client.player
        if (!player) return fail('PICK_A_PLAYER')

        switch (message.type) {
            case 'open': {
                if (session) return fail('SESSION_EXISTS')
                const created: Session = {
                    officeId: client.officeId,
                    hostId: player.id,
                    members: [{ player, connId, awayUntil: null }],
                    settings: { durationMin: 2, theme: 'random' },
                    phase: 'lobby',
                    phaseEndsAt: 0,
                    game: null,
                    gameMeta: null,
                    inputs: new Map(),
                    lastTickAt: this.hooks.now(),
                }
                this.sessions.set(client.officeId, created)
                this.broadcastOffice(created)
                this.hooks.onOpened(client.officeId, player.id)
                return
            }

            case 'join': {
                if (!session) return fail('NO_SESSION')
                const existing = session.members.find(m => m.player.id === player.id)
                if (existing) {
                    existing.connId = connId
                    existing.awayUntil = null
                } else {
                    if (session.members.length >= MAX_PLAYERS) return fail('LOBBY_FULL')
                    session.members.push({ player, connId, awayUntil: null })
                }
                this.broadcastOffice(session)
                return
            }

            case 'leave': {
                if (!session) return fail('NO_SESSION')
                this.removeMember(session, player.id)
                return
            }

            case 'start': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                if (session.phase !== 'lobby') return fail('NOT_IN_LOBBY')
                const present = session.members.filter(m => m.awayUntil === null)
                if (present.length < MIN_PLAYERS) return fail('NOT_ENOUGH_PLAYERS')

                session.settings = { durationMin: message.durationMin, theme: message.theme }
                this.startCountdown(
                    session,
                    present.map(m => m.player.id)
                )
                return
            }

            case 'input': {
                if (session?.phase === 'playing' && session.game?.players.some(p => p.id === player.id && !p.out)) {
                    session.inputs.set(player.id, { dx: message.dx, dy: message.dy })
                }
                return
            }

            case 'close': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                this.closeSession(session)
                return
            }
        }
    }

    /** Called every TICK_MS by the server; advances every session. */
    tick() {
        const now = this.hooks.now()

        for (const session of [...this.sessions.values()]) {
            for (const member of [...session.members]) {
                if (member.awayUntil !== null && member.awayUntil <= now) this.removeMember(session, member.player.id)
            }
            if (!this.sessions.has(session.officeId)) continue

            if (session.phase === 'countdown' && now >= session.phaseEndsAt) {
                session.phase = 'playing'
                session.lastTickAt = now
                if (session.gameMeta) session.gameMeta.startedAt = now
                this.broadcastOffice(session)
            } else if (session.phase === 'playing' && session.game) {
                const dt = Math.min(MAX_STEP_MS, now - session.lastTickAt)
                session.lastTickAt = now
                if (dt > 0) this.applyEvents(session, step(session.game, session.inputs, dt, this.hooks.rng))
                if (session.phase === 'playing') this.broadcastSnapshot(session)
            } else if (session.phase === 'results' && now >= session.phaseEndsAt) {
                session.phase = 'lobby'
                session.game = null
                session.gameMeta = null
                this.broadcastOffice(session)
            }
        }
    }

    private startCountdown(session: Session, playerIds: number[]) {
        const seed = this.hooks.nextSeed()
        const themeRng = createRng(seed ^ 0x5bd1e995)
        const theme = session.settings.theme === 'random' ? pickOne(themeRng, THEME_IDS) : session.settings.theme
        const arena = generateArena(seed, theme, playerIds.length)

        session.game = createGame(arena, playerIds, session.settings.durationMin * 60_000, this.hooks.rng)
        session.gameMeta = { seed, theme, startedAt: this.hooks.now() }
        session.inputs.clear()
        session.phase = 'countdown'
        session.phaseEndsAt = this.hooks.now() + COUNTDOWN_MS

        this.broadcastOffice(session)
        this.broadcast(session.officeId, this.countdownMessage(session, arena))
    }

    private countdownMessage(session: Session, arena: Arena): ServerMessage {
        return {
            type: 'countdown',
            arena,
            playerIds: session.game?.players.map(p => p.id) ?? [],
            durationMs: session.game?.durationMs ?? 0,
            startsInMs: Math.max(0, session.phaseEndsAt - this.hooks.now()),
        }
    }

    private applyEvents(session: Session, events: GameEvent[]) {
        for (const event of events) {
            if (event.kind === 'ended') {
                this.finishGame(session)
            } else if (event.kind === 'pass') {
                this.broadcast(session.officeId, { type: 'pass', from: event.from, to: event.to })
            } else if (event.kind === 'boom') {
                this.broadcast(session.officeId, { type: 'boom', playerId: event.playerId })
            } else {
                this.broadcast(session.officeId, { type: 'newPotato', playerId: event.playerId })
            }
        }
    }

    private finishGame(session: Session) {
        const game = session.game
        const meta = session.gameMeta
        if (!game || !meta) return

        this.broadcastSnapshot(session)
        const players = rankPlayers(game)
        const results: Results = {
            survivorIds: game.players.filter(p => !p.out).map(p => p.id),
            eliminated: game.players
                .filter(p => p.out && p.eliminatedAtMs !== null)
                .sort((a, b) => (b.eliminatedAtMs ?? 0) - (a.eliminatedAtMs ?? 0))
                .map(p => ({ id: p.id, atMs: p.eliminatedAtMs ?? 0 })),
            stats: game.players.map(p => ({ id: p.id, holdMs: p.holdMs, passes: p.passes })),
        }

        session.phase = 'results'
        session.phaseEndsAt = this.hooks.now() + RESULTS_MS
        this.broadcast(session.officeId, { type: 'results', results })
        this.broadcastOffice(session)

        this.hooks.onResults({
            officeId: session.officeId,
            seed: meta.seed,
            theme: meta.theme,
            durationSeconds: Math.round(game.durationMs / 1000),
            startedAt: new Date(meta.startedAt).toISOString(),
            endedAt: new Date(this.hooks.now()).toISOString(),
            players,
        })
    }

    private removeMember(session: Session, playerId: number) {
        session.members = session.members.filter(m => m.player.id !== playerId)

        if (session.game && inGame(session)) {
            this.applyEvents(session, removePlayer(session.game, playerId, this.hooks.rng))
        }

        const first = session.members[0]
        if (!first) {
            this.closeSession(session)
            return
        }

        if (session.hostId === playerId) session.hostId = first.player.id
        this.broadcastOffice(session)
    }

    private closeSession(session: Session) {
        this.sessions.delete(session.officeId)
        this.broadcast(session.officeId, { type: 'office', session: null })
    }

    private broadcastSnapshot(session: Session) {
        const game = session.game
        if (!game) return

        this.broadcast(session.officeId, {
            type: 'snapshot',
            elapsedMs: game.elapsedMs,
            players: game.players.map(p => ({
                id: p.id,
                x: round(p.x),
                y: round(p.y),
                frozenMs: p.frozenMs,
                out: p.out,
            })),
            holderId: game.holderId,
            shake: round(shakeLevel(game)),
        })
    }

    private broadcastOffice(session: Session) {
        this.broadcast(session.officeId, { type: 'office', session: view(session) })
    }

    private broadcast(officeId: number, message: ServerMessage) {
        for (const client of this.clients.values()) {
            if (client.officeId === officeId) client.conn.send(message)
        }
    }
}

function view(session: Session): SessionView {
    return {
        hostId: session.hostId,
        phase: session.phase,
        settings: session.settings,
        players: session.members.map(m => ({ ...m.player, away: m.awayUntil !== null })),
    }
}

/** Survivors share first place; the rest rank by how late they went out, ties shared. */
function rankPlayers(game: GameState): GameResult['players'] {
    const outlasting = (atMs: number | null) =>
        game.players.filter(other => !other.out || (atMs !== null && (other.eliminatedAtMs ?? 0) > atMs)).length

    return game.players.map(p => ({
        playerId: p.id,
        position: p.out ? outlasting(p.eliminatedAtMs) + 1 : 1,
        survived: !p.out,
        eliminatedAtMs: p.eliminatedAtMs,
        holdMs: p.holdMs,
        passes: p.passes,
    }))
}

function round(value: number): number {
    return Math.round(value * 100) / 100
}

/** The countdown already holds the game, so leaving then counts as leaving it. */
function inGame(session: Session): boolean {
    return session.phase === 'countdown' || session.phase === 'playing'
}
