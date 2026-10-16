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
import {
    createGame,
    type GameEvent,
    type GameMode,
    type GameState,
    type Input,
    removePlayer,
    shakeLevel,
    step,
    winnerIds,
} from './sim/game.ts'
import { createRng, pickOne, type Rng } from './sim/rng.ts'
import { botAvatarUrl, pickBotName } from './bots.ts'
import { randomLook } from './cosmetics.ts'
import { THEME_IDS, type ThemeId } from './sim/themes.ts'
import { TrainedPilot } from './ai/pilot.ts'
import type { TrainedPolicy } from './ai/policy.ts'
import { type ChatEvent, type ChatLine, ChatRooms, type UnsavedLine } from './chat.ts'
import { ReplayRecorder } from './replay.ts'

export const TICK_MS = 50
/** Three seconds to announce the mode and arena, then three to count down. */
export const COUNTDOWN_MS = 6000
/** Long enough to read the table and throw a few emotes. */
export const RESULTS_MS = 12_000
/** One emote per player this often, so a results screen doesn't turn into a wall of emoji. */
export const EMOTE_COOLDOWN_MS = 700
export const RECONNECT_GRACE_MS = 10_000
/** Killer Potato's AI hunter, as the room sees it. */
export const HUNTER_NAME = 'Killer Potato'
/** The hunter's robot sits on blood red. */
const HUNTER_BACKGROUND = '#991b1b'
/** A stalled event loop never makes the simulation jump further than this. */
const MAX_STEP_MS = 100

export interface Connection {
    id: string
    send(message: ServerMessage): void
}

export interface GameResult {
    mode: GameMode
    officeId: number
    seed: number
    theme: ThemeId
    durationSeconds: number
    startedAt: string
    endedAt: string
    players: Array<{
        playerId: number
        /** 1 for every survivor (King: the longest holders); then by how late you went out (King: time held). */
        position: number
        survived: boolean
        eliminatedAtMs: number | null
        holdMs: number
        passes: number
    }>
    /** The gzipped replay (JSON, see replay.ts); null when it outgrew its limit. */
    replay: Uint8Array<ArrayBuffer> | null
}

export interface SessionHooks {
    /** Identifies the browser bundle being served; sent to every tab in `welcome`. */
    build: string
    now(): number
    /** Randomness during play: potato hand-outs and fuses. */
    rng: Rng
    /** Seeds the arena of each game. */
    nextSeed(): number
    onOpened(officeId: number, hostPlayerId: number): void
    onResults(result: GameResult): void
    /** The policy AI seats play with; without one, `addBot` is refused. */
    botPolicy?: TrainedPolicy | null
    /** The policy a Killer Potato hunter plays; without one the hunter plays `botPolicy`. */
    hunterPolicy?: TrainedPolicy | null
    /** Picks AI seats' names and looks; kept apart from `rng` so neither shifts a game. Defaults to Math.random. */
    botNameRng?: Rng
    /** A lobby member changed their look in the Hub: fetch them again and hand them to `updatePlayer`. */
    refreshPlayer?(playerId: number): void
    /** An office's chat is used for the first time: fetch its saved lines and hand them to `chatHistoryLoaded`. */
    loadChat?(officeId: number): void
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
    /** When each player last sent an emote, for the cooldown. */
    emotedAt: Map<number, number>
    /** The id the next AI seat gets: -1, -2, … */
    nextBotId: number
    /** One per AI seat of the current game. */
    pilots: Map<number, TrainedPilot>
    /**
     * Killer Potato's AI hunter: an AI seat that plays only in that mode's games and is
     * never a lobby member. Made on the first such game, then kept.
     */
    hunter: PlayerInfo | null
    /** Records the current game's broadcast, from its countdown to its results. */
    recorder: ReplayRecorder | null
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
    private readonly chat = new ChatRooms()
    /** The watchers list each office last heard, so an unchanged one isn't sent again. */
    private readonly lastWatchers = new Map<number, string>()

    constructor(private readonly hooks: SessionHooks) {}

    connect(conn: Connection, officeId: number, player: PlayerInfo | null) {
        this.clients.set(conn.id, { conn, officeId, player })
        conn.send({ type: 'welcome', player, build: this.hooks.build })

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

        if (this.chat.open(officeId)) this.hooks.loadChat?.(officeId)
        conn.send({ type: 'chatHistory', lines: this.chat.lines(officeId) })
        conn.send(this.watchersMessage(officeId))
        this.broadcastWatchers(officeId)
    }

    disconnect(connId: string) {
        const client = this.clients.get(connId)
        this.clients.delete(connId)
        if (!client) return
        this.leaveSeat(client, connId)
        this.broadcastWatchers(client.officeId)
    }

    /** A closed tab gives its seat a few seconds to come back. */
    private leaveSeat(client: Client, connId: string) {
        if (!client.player) return

        const session = this.sessions.get(client.officeId)
        const member = session?.members.find(m => m.connId === connId)
        if (!session || !member) return

        member.connId = null
        member.awayUntil = this.hooks.now() + RECONNECT_GRACE_MS

        this.dropFromGame(session, member.player.id)

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
                    settings: { durationMin: 2, theme: 'random', mode: 'survival' },
                    phase: 'lobby',
                    phaseEndsAt: 0,
                    game: null,
                    gameMeta: null,
                    inputs: new Map(),
                    lastTickAt: this.hooks.now(),
                    emotedAt: new Map(),
                    nextBotId: -1,
                    pilots: new Map(),
                    hunter: null,
                    recorder: null,
                }
                this.sessions.set(client.officeId, created)
                this.narrate(client.officeId, { type: 'opened', name: player.name })
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
                    this.narrate(session.officeId, { type: 'joined', name: player.name })
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
                // Killer Potato is people against the AI hunter: one person is enough, and AIs sit out.
                // Infection is people only (no AI was trained for it): three of them, AIs sit out.
                const killer = message.mode === 'killer'
                const infection = message.mode === 'infection'
                if (killer && !this.hooks.botPolicy) return fail('NO_BOTS')
                const people = present.filter(m => !m.player.bot)
                const enough = killer
                    ? people.length > 0
                    : infection
                      ? people.length >= MIN_PLAYERS
                      : present.length >= MIN_PLAYERS
                if (!enough) return fail('NOT_ENOUGH_PLAYERS')

                session.settings = { durationMin: message.durationMin, theme: message.theme, mode: message.mode }
                this.startCountdown(
                    session,
                    killer
                        ? [...people.map(m => m.player.id), this.hunterOf(session).id]
                        : infection
                          ? people.map(m => m.player.id)
                          : present.map(m => m.player.id)
                )
                return
            }

            // The host's picks, as they change: the lobby sees what's coming, and nothing resets them.
            case 'settings': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                if (session.phase !== 'lobby') return fail('NOT_IN_LOBBY')
                session.settings = { durationMin: message.durationMin, theme: message.theme, mode: message.mode }
                this.broadcastOffice(session)
                return
            }

            case 'input': {
                if (session?.phase === 'playing' && session.game?.players.some(p => p.id === player.id && !p.out)) {
                    session.inputs.set(player.id, { dx: message.dx, dy: message.dy })
                }
                return
            }

            // Only the game's own players react, only on the results screen, and not too often.
            case 'emote': {
                if (session?.phase !== 'results' || !session.game?.players.some(p => p.id === player.id)) return
                const now = this.hooks.now()
                const last = session.emotedAt.get(player.id)
                if (last !== undefined && now - last < EMOTE_COOLDOWN_MS) return

                session.emotedAt.set(player.id, now)
                this.broadcast(session.officeId, { type: 'emote', playerId: player.id, emote: message.emote })
                return
            }

            case 'close': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                this.closeSession(session)
                return
            }

            // A tap racing the timer finds the lobby already back: nothing to do, nothing to report.
            case 'backToLobby': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                if (session.phase === 'results') this.endResults(session)
                return
            }

            case 'addBot': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                if (session.phase !== 'lobby') return fail('NOT_IN_LOBBY')
                if (!this.hooks.botPolicy) return fail('NO_BOTS')
                if (session.members.length >= MAX_PLAYERS) return fail('LOBBY_FULL')
                const id = session.nextBotId--
                const nameRng = this.hooks.botNameRng ?? Math.random
                const name = botName(session, nameRng)
                session.members.push({
                    player: { id, name, avatarUrl: botAvatarUrl(name), bot: true, look: randomLook(nameRng) },
                    connId: null,
                    awayUntil: null,
                })
                this.broadcastOffice(session)
                return
            }

            case 'chat': {
                const said = this.chat.say(client.officeId, player, message.body, this.hooks.now())
                if (said === 'SLOW_DOWN') return fail('SLOW_DOWN')
                if (said === 'EMPTY') return
                this.broadcast(client.officeId, { type: 'chat', line: said })
                return
            }

            case 'refreshLook': {
                if (session?.phase === 'lobby' && session.members.some(m => m.player.id === player.id)) {
                    this.hooks.refreshPlayer?.(player.id)
                }
                return
            }

            case 'removeBot': {
                if (!session) return fail('NO_SESSION')
                if (session.hostId !== player.id) return fail('NOT_HOST')
                if (session.phase !== 'lobby') return fail('NOT_IN_LOBBY')
                if (!session.members.some(m => m.player.bot && m.player.id === message.playerId))
                    return fail('BAD_MESSAGE')
                this.removeMember(session, message.playerId)
                return
            }
        }
    }

    /**
     * A player as Laravel has them now (after `refreshPlayer`). Their tabs pick it up; a lobby
     * they sit in shows it. A game already under way keeps the look it started with.
     */
    updatePlayer(player: PlayerInfo) {
        const offices = new Set<number>()
        for (const client of this.clients.values()) {
            if (client.player?.id !== player.id) continue
            client.player = player
            offices.add(client.officeId)
        }
        for (const officeId of offices) this.broadcastWatchers(officeId)
        for (const session of this.sessions.values()) {
            const member = session.members.find(m => m.player.id === player.id)
            if (!member || session.phase !== 'lobby') continue
            member.player = player
            this.broadcastOffice(session)
        }
    }

    /** The game just played was saved with its replay: the office's results screen can offer it. */
    replayReady(officeId: number, gameId: number) {
        this.broadcast(officeId, { type: 'replayReady', gameId })
        this.narrate(officeId, { type: 'replay', gameId })
    }

    /** An office's saved chat came back from the Hub: it goes before what was said since. */
    chatHistoryLoaded(officeId: number, history: Array<Omit<ChatLine, 'id'>>) {
        this.broadcast(officeId, { type: 'chatHistory', lines: this.chat.loaded(officeId, history) })
    }

    /** Chat lines not yet in the Hub; `requeueChat` them when saving fails. */
    takeUnsavedChat(): UnsavedLine[] {
        return this.chat.takeUnsaved()
    }

    requeueChat(lines: UnsavedLine[]) {
        this.chat.requeue(lines)
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
                if (dt > 0) {
                    this.steerBots(session, session.game)
                    this.applyEvents(session, step(session.game, session.inputs, dt, this.hooks.rng))
                }
                if (session.phase === 'playing') this.broadcastSnapshot(session)
            } else if (session.phase === 'results' && now >= session.phaseEndsAt) {
                this.endResults(session)
            }
        }
    }

    /** The results screen is over, by its timer or the host: everyone is back in the lobby. */
    private endResults(session: Session) {
        session.phase = 'lobby'
        session.game = null
        session.gameMeta = null
        session.recorder = null
        session.emotedAt.clear()
        this.broadcastOffice(session)
    }

    private startCountdown(session: Session, playerIds: number[]) {
        const seed = this.hooks.nextSeed()
        const themeRng = createRng(seed ^ 0x5bd1e995)
        const theme = session.settings.theme === 'random' ? pickOne(themeRng, THEME_IDS) : session.settings.theme
        const arena = generateArena(seed, theme, playerIds.length, { big: session.settings.mode === 'infection' })

        session.game = createGame(
            arena,
            playerIds,
            session.settings.durationMin * 60_000,
            this.hooks.rng,
            session.settings.mode,
            session.settings.mode === 'killer' ? this.hunterOf(session).id : null
        )
        session.gameMeta = { seed, theme, startedAt: this.hooks.now() }
        session.inputs.clear()
        session.pilots.clear()
        const policy = this.hooks.botPolicy
        if (policy) {
            const seats = [...session.members.map(m => m.player), ...(session.hunter ? [session.hunter] : [])]
            for (const seat of seats) {
                if (seat.bot && playerIds.includes(seat.id)) {
                    session.pilots.set(
                        seat.id,
                        new TrainedPilot(
                            seat.hunter ? (this.hooks.hunterPolicy ?? policy) : policy,
                            session.game,
                            seat.id
                        )
                    )
                }
            }
        }
        session.phase = 'countdown'
        session.phaseEndsAt = this.hooks.now() + COUNTDOWN_MS
        const seated = [...session.members.map(m => m.player), ...(session.hunter ? [session.hunter] : [])]
        session.recorder = new ReplayRecorder(
            {
                mode: session.settings.mode,
                theme,
                durationMs: session.game.durationMs,
                roster: playerIds.flatMap(id => seated.filter(p => p.id === id)),
            },
            this.hooks.now()
        )

        this.narrate(session.officeId, {
            type: 'started',
            mode: session.settings.mode,
            theme,
            players: playerIds.length,
        })
        this.broadcastOffice(session)
        this.broadcast(session.officeId, this.countdownMessage(session, arena))
    }

    /** Killer Potato's hunter, made once per session. */
    private hunterOf(session: Session): PlayerInfo {
        session.hunter ??= {
            id: session.nextBotId--,
            name: HUNTER_NAME,
            avatarUrl: botAvatarUrl(HUNTER_NAME, HUNTER_BACKGROUND),
            bot: true,
            hunter: true,
        }
        return session.hunter
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

    /** Every AI seat still in the game picks its steering for this tick, before the simulation steps. */
    private steerBots(session: Session, game: GameState) {
        for (const [id, pilot] of session.pilots) {
            if (game.players.some(p => p.id === id && !p.out)) session.inputs.set(id, pilot.steer(game))
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
            } else if (event.kind === 'infected') {
                this.broadcast(session.officeId, { type: 'infected', playerId: event.playerId, by: event.by })
            } else if (event.kind === 'teleport') {
                this.broadcast(session.officeId, {
                    type: 'teleport',
                    playerId: event.playerId,
                    portalId: event.portalId,
                })
            } else if (event.kind === 'pickup') {
                this.broadcast(session.officeId, {
                    type: 'pickup',
                    playerId: event.playerId,
                    item: event.item,
                    effect: event.effect,
                    ...(event.targetId === undefined ? {} : { targetId: event.targetId }),
                })
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
            mode: game.mode,
            survivorIds: winnerIds(game),
            eliminated:
                game.mode === 'infection'
                    ? caughtInOrder(game, players).map(p => ({
                          id: p.id,
                          atMs: p.infectedAtMs ?? p.eliminatedAtMs ?? 0,
                      }))
                    : game.players
                          .filter(p => p.out && p.eliminatedAtMs !== null)
                          .sort((a, b) => (b.eliminatedAtMs ?? 0) - (a.eliminatedAtMs ?? 0))
                          .map(p => ({ id: p.id, atMs: p.eliminatedAtMs ?? 0 })),
            stats: game.players.map(p => ({ id: p.id, holdMs: p.holdMs, passes: p.passes })),
        }

        session.phase = 'results'
        session.phaseEndsAt = this.hooks.now() + RESULTS_MS
        this.broadcast(session.officeId, { type: 'results', results, endsInMs: RESULTS_MS })
        this.narrate(session.officeId, {
            type: 'results',
            mode: game.mode,
            winners: results.survivorIds.map(id => nameIn(session, id)),
        })
        this.broadcastOffice(session)
        const replay = session.recorder?.finish() ?? null
        session.recorder = null

        // AI seats never reach the Hub: their places stay in the humans' positions, their rows don't.
        const humans = players.filter(p => p.playerId > 0)
        if (humans.length === 0) return
        this.hooks.onResults({
            mode: game.mode,
            officeId: session.officeId,
            seed: meta.seed,
            theme: meta.theme,
            durationSeconds: Math.round(game.durationMs / 1000),
            startedAt: new Date(meta.startedAt).toISOString(),
            endedAt: new Date(this.hooks.now()).toISOString(),
            players: humans,
            replay: replay ? Bun.gzipSync(JSON.stringify(replay)) : null,
        })
    }

    /**
     * A player leaves the game. Mid-play the sim decides what that means. In Killer Potato's
     * countdown nobody has played yet: a lone remaining person would win a round they never
     * played, so with too few left the game is called off and the lobby comes back.
     */
    private dropFromGame(session: Session, playerId: number) {
        const game = session.game
        if (!game || !inGame(session)) return

        if (session.phase === 'countdown' && game.mode === 'killer') {
            const prey = game.players.filter(p => p.id !== game.hunterId)
            const remaining = prey.filter(p => !p.out && p.id !== playerId).length
            if (remaining < (prey.length > 1 ? 2 : 1)) {
                session.phase = 'lobby'
                session.game = null
                session.gameMeta = null
                session.recorder = null
                session.inputs.clear()
                session.pilots.clear()
                return
            }
        }
        this.applyEvents(session, removePlayer(game, playerId, this.hooks.rng))
    }

    private removeMember(session: Session, playerId: number) {
        const leaving = session.members.find(m => m.player.id === playerId)
        session.members = session.members.filter(m => m.player.id !== playerId)
        // People only: AIs coming and going would only add noise.
        if (leaving && !leaving.player.bot) this.narrate(session.officeId, { type: 'left', name: leaving.player.name })

        this.dropFromGame(session, playerId)

        // AIs can't host: once the last person leaves, the game closes.
        const first = session.members.find(m => !m.player.bot)
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
        this.broadcastWatchers(session.officeId)
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
                shieldMs: p.shieldMs,
                speedMs: p.speedMs,
                slipMs: p.slipMs,
                ghostMs: p.ghostMs,
                reverseMs: p.reverseMs,
                magnetMs: p.magnetMs,
                tinyMs: p.tinyMs,
                launchMs: p.launchMs,
                holdMs: p.holdMs,
                safeMs: p.safeMs,
                infected: p.infectedAtMs !== null,
            })),
            items: game.items.map(item => ({
                id: item.id,
                kind: item.kind,
                x: round(item.x),
                y: round(item.y),
                expiresInMs: Math.max(0, item.expiresAtMs - game.elapsedMs),
            })),
            portals: game.portals.map(portal => ({
                id: portal.id,
                ax: round(portal.a.x),
                ay: round(portal.a.y),
                bx: round(portal.b.x),
                by: round(portal.b.y),
                expiresInMs: Math.max(0, portal.expiresAtMs - game.elapsedMs),
            })),
            holderId: game.holderId,
            shake: round(shakeLevel(game)),
        })
    }

    private broadcastOffice(session: Session) {
        this.broadcast(session.officeId, { type: 'office', session: view(session) })
        this.broadcastWatchers(session.officeId)
    }

    private narrate(officeId: number, event: ChatEvent) {
        this.broadcast(officeId, { type: 'chat', line: this.chat.narrate(officeId, event, this.hooks.now()) })
    }

    /**
     * Everyone on the office's page without a seat in its lobby or game: each named
     * player once however many tabs, "Just watching" tabs counted as guests.
     */
    private watchersMessage(officeId: number): ServerMessage {
        const session = this.sessions.get(officeId)
        const seated = new Set([
            ...(session?.members.map(m => m.player.id) ?? []),
            ...(session?.game && session.phase !== 'lobby' ? session.game.players.map(p => p.id) : []),
        ])
        const named = new Map<number, PlayerInfo>()
        let guests = 0
        for (const client of this.clients.values()) {
            if (client.officeId !== officeId) continue
            if (!client.player) guests++
            else if (!seated.has(client.player.id)) named.set(client.player.id, client.player)
        }
        return { type: 'watchers', named: [...named.values()], guests }
    }

    /** Tells the office who's watching, when that changed. */
    private broadcastWatchers(officeId: number) {
        const message = this.watchersMessage(officeId)
        const key = JSON.stringify(message)
        if (this.lastWatchers.get(officeId) === key) return
        this.lastWatchers.set(officeId, key)
        this.broadcast(officeId, message)
    }

    private broadcast(officeId: number, message: ServerMessage) {
        for (const client of this.clients.values()) {
            if (client.officeId === officeId) client.conn.send(message)
        }
        this.sessions.get(officeId)?.recorder?.record(message, this.hooks.now())
    }
}

function view(session: Session): SessionView {
    // The hunter shows from a Killer Potato game's countdown to the end of its results.
    const hunter = session.game?.mode === 'killer' && session.phase !== 'lobby' ? session.hunter : null
    return {
        hostId: session.hostId,
        phase: session.phase,
        settings: session.settings,
        players: [
            ...session.members.map(m => ({ ...m.player, away: m.awayUntil !== null })),
            ...(hunter ? [{ ...hunter, away: false }] : []),
        ],
    }
}

/** Survivors share first place; the rest rank by how late they went out, ties shared. */
function rankPlayers(game: GameState): GameResult['players'] {
    if (game.mode === 'king') return rankByReign(game)
    if (game.mode === 'killer') return rankAgainstHunter(game)
    if (game.mode === 'infection') return rankInfection(game)

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

/**
 * Killer Potato: the players rank as in survival, among themselves. The hunter is first
 * when it caught everyone, last otherwise; it never counts as a survivor (and never reaches the Hub).
 */
function rankAgainstHunter(game: GameState): GameResult['players'] {
    const prey = game.players.filter(p => p.id !== game.hunterId)
    const caughtEveryone = winnerIds(game).length === 0
    const outlasting = (atMs: number | null) =>
        prey.filter(other => !other.out || (atMs !== null && (other.eliminatedAtMs ?? 0) > atMs)).length

    return game.players.map(p => ({
        playerId: p.id,
        position:
            p.id === game.hunterId
                ? caughtEveryone
                    ? 1
                    : prey.length + 1
                : p.out
                  ? outlasting(p.eliminatedAtMs) + 1
                  : 1,
        survived: p.id !== game.hunterId && !p.out,
        eliminatedAtMs: p.id === game.hunterId ? null : p.eliminatedAtMs,
        holdMs: p.holdMs,
        passes: p.passes,
    }))
}

/**
 * Infection: the clean (the winners) share first; then the infected, the later caught the
 * better, patient zero last; whoever left ranks after everyone who stayed. `survived`: clean.
 */
function rankInfection(game: GameState): GameResult['players'] {
    const winners = new Set(winnerIds(game))
    // Later is better: a leaver counts as caught before the game began.
    const lasted = (p: GameState['players'][number]) =>
        winners.has(p.id)
            ? Number.POSITIVE_INFINITY
            : p.out
              ? -1 - (game.durationMs - (p.eliminatedAtMs ?? 0))
              : (p.infectedAtMs ?? 0)

    return game.players.map(p => ({
        playerId: p.id,
        position: game.players.filter(other => lasted(other) > lasted(p)).length + 1,
        survived: winners.has(p.id),
        eliminatedAtMs: winners.has(p.id) ? null : (p.infectedAtMs ?? p.eliminatedAtMs),
        holdMs: p.holdMs,
        passes: p.passes,
    }))
}

/** Infection's results card: everyone who didn't win, latest caught first (leavers last). */
function caughtInOrder(game: GameState, ranked: GameResult['players']): GameState['players'] {
    const position = new Map(ranked.map(r => [r.playerId, r.position]))
    const winners = new Set(winnerIds(game))
    return game.players
        .filter(p => !winners.has(p.id))
        .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))
}

/**
 * King of the Potato: ranked by time held, ties shared; whoever left mid-game
 * ranks after everyone who stayed. The winners count as "survived".
 */
function rankByReign(game: GameState): GameResult['players'] {
    const winners = new Set(winnerIds(game))
    const ahead = (p: GameState['players'][number]) =>
        game.players.filter(other => (other.out === p.out ? other.holdMs > p.holdMs : !other.out && p.out)).length

    return game.players.map(p => ({
        playerId: p.id,
        position: ahead(p) + 1,
        survived: winners.has(p.id),
        eliminatedAtMs: p.eliminatedAtMs,
        holdMs: p.holdMs,
        passes: p.passes,
    }))
}

/** A seat's name as the room knows it: members, then the hunter. */
function nameIn(session: Session, playerId: number): string {
    return (
        session.members.find(m => m.player.id === playerId)?.player.name ??
        (session.hunter?.id === playerId ? session.hunter.name : 'Someone')
    )
}

/** A random Québécois name no one in the lobby (person or AI) already has. */
function botName(session: Session, rng: Rng): string {
    return pickBotName(rng, new Set(session.members.map(m => m.player.name)))
}

function round(value: number): number {
    return Math.round(value * 100) / 100
}

/** The countdown already holds the game, so leaving then counts as leaving it. */
function inGame(session: Session): boolean {
    return session.phase === 'countdown' || session.phase === 'playing'
}
