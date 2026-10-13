import { advance, bestLap, type Point, type Progress, respawnPoint, startProgress } from './drive/laps.ts'
import { toGate, type Route } from './drive/route.ts'
import { standings } from './drive/standings.ts'
import { COUNTDOWN } from './drive/trial.ts'
import type { Course } from './map/format.ts'
import {
    type DriverInfo,
    type ErrorCode,
    type LobbyPhase,
    type LobbySummary,
    type LobbyView,
    MAX_RACERS,
    type Pose,
    type ResultRow,
    type ServerMessage,
    type Standing,
} from './protocol.ts'

/**
 * The racing lobbies, all in memory: who's in each, the race under way, and
 * when it ends. No clock or I/O of its own (the hooks give the time and
 * take the results), so the tests drive it step by step.
 *
 * Each tab drives its own kart and reports every physics step while racing;
 * the server runs those positions through the same lap counter the tab does
 * (drive/laps.ts), timed by the tab's step-counted clock. It doesn't trust
 * the tab blindly: a move faster than any kart goes counts no gate, and is
 * only taken when the game could have made it (R back to the last
 * checkpoint, out of the water nearby); a clock running ahead of real time
 * is ignored.
 */

/** Once the winner is in, the others have this long to finish. */
export const FINISH_GRACE_MS = 30_000
/** A race nobody finishes ends after this. */
export const MAX_RACE_MS = 20 * 60_000
/** A tab's race clock may run this far ahead of the server's (it starts later, so it shouldn't at all). */
const CLOCK_LEAD = 1
/** Faster than this between two steps isn't driving: a reset or a respawn. Boosted top speed is ~47 m/s. */
const MAX_MOVE_SPEED = 80
/** A jump landing this close to your last checkpoint is R putting you back on it. */
const RESPAWN_REACH = 20
/** Any other jump (out of the water onto a road) may bring you at most this much closer to your next gate. */
const JUMP_GAIN = 30

export interface Connection {
    id: string
    send(message: ServerMessage): void
}

/** A track as a lobby races it: the course in map metres and its route along the streets. */
export interface LoadedTrack {
    id: number
    name: string
    course: Course
    route: Route | null
}

/** One race, for the Hub: only Hub players are in `rows`; `racers` counts guests too. */
export interface RaceResult {
    raceId: string
    trackId: number
    racers: number
    rows: Array<{ playerId: number; position: number; timeMs: number | null; bestLapMs: number | null }>
}

export interface LobbyHooks {
    now(): number
    /** A fresh lobby id: short, lowercase letters and digits. */
    newId(): string
    onResults(result: RaceResult): void
}

interface Racer {
    progress: Progress
    /** The last step reported: where, and when on the tab's race clock. */
    last: { x: number; z: number; t: number } | null
}

interface Member {
    conn: Connection
    driver: DriverInfo
    pose: Pose | null
    /** Set for the karts in the current race (or the one just finished). */
    racer: Racer | null
}

interface Lobby {
    id: string
    track: LoadedTrack
    hostId: string
    phase: LobbyPhase
    members: Member[]
    /** When the phase began; for `racing`, the green light. */
    phaseAt: number
    firstFinishAt: number | null
    results: ResultRow[] | null
    races: number
}

export class LobbyManager {
    private readonly lobbies = new Map<string, Lobby>()
    /** Connection id → lobby id. */
    private readonly memberships = new Map<string, string>()

    constructor(private readonly hooks: LobbyHooks) {}

    /**
     * Seats a driver: in lobby `lobbyId` when it's open on this track, or in a
     * new one they host (the lobby they were sent to may have closed meanwhile).
     */
    join(conn: Connection, driver: Omit<DriverInfo, 'id'>, track: LoadedTrack, lobbyId: string | null): void {
        this.leave(conn.id)
        let lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined
        if (lobby && lobby.track.id !== track.id) lobby = undefined

        if (lobby && driver.playerId !== null) {
            // The same player in a second tab takes over from the first.
            const previous = lobby.members.find(member => member.driver.playerId === driver.playerId)
            if (previous) {
                previous.conn.send({ type: 'error', code: 'REPLACED' })
                this.leave(previous.conn.id)
                lobby = this.lobbies.get(lobbyId!)
            }
        }
        if (lobby && lobby.members.length >= MAX_RACERS) return this.refuse(conn, 'LOBBY_FULL')

        if (!lobby) {
            lobby = {
                id: this.freshId(),
                track,
                hostId: conn.id,
                phase: 'waiting',
                members: [],
                phaseAt: this.hooks.now(),
                firstFinishAt: null,
                results: null,
                races: 0,
            }
            this.lobbies.set(lobby.id, lobby)
        }

        lobby.members.push({ conn, driver: { ...driver, id: conn.id }, pose: null, racer: null })
        this.memberships.set(conn.id, lobby.id)
        conn.send({ type: 'welcome', you: conn.id, lobby: view(lobby) })
        this.broadcastLobby(lobby, conn.id)
    }

    leave(connId: string): void {
        const lobby = this.lobbyOf(connId)
        this.memberships.delete(connId)
        if (!lobby) return

        lobby.members = lobby.members.filter(member => member.conn.id !== connId)
        if (lobby.members.length === 0) {
            this.lobbies.delete(lobby.id)
            return
        }
        if (lobby.hostId === connId) lobby.hostId = lobby.members[0]!.conn.id
        if ((lobby.phase === 'countdown' || lobby.phase === 'racing') && !lobby.members.some(m => m.racer)) {
            // Every racer left: nothing to finish.
            this.setPhase(lobby, 'waiting')
            for (const member of lobby.members) member.pose = null
        }
        this.broadcastLobby(lobby)
        this.checkFinish(lobby)
    }

    /** The host starts a race with everyone in the lobby on the grid, in join order. */
    start(connId: string): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        const member = lobby.members.find(m => m.conn.id === connId)!
        if (lobby.hostId !== connId) return member.conn.send({ type: 'error', code: 'NOT_HOST' })
        if (lobby.phase === 'countdown' || lobby.phase === 'racing') return

        const slots: Record<string, number> = {}
        lobby.members.forEach((m, i) => {
            m.racer = { progress: startProgress(), last: null }
            m.pose = null
            slots[m.conn.id] = i
        })
        lobby.results = null
        lobby.firstFinishAt = null
        this.setPhase(lobby, 'countdown')
        for (const m of lobby.members) m.conn.send({ type: 'countdown', slots, seconds: COUNTDOWN })
        this.broadcastLobby(lobby)
    }

    /** Where a kart is; while racing, with the steps since the last report. */
    pose(connId: string, pose: Pose, samples: readonly number[] = []): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        const member = lobby.members.find(m => m.conn.id === connId)!
        const live = lobby.phase === 'countdown' || lobby.phase === 'racing'
        // Watching a race: no kart on the track.
        if (live && !member.racer) return
        member.pose = pose

        if (lobby.phase !== 'racing' || !member.racer) return
        const racer = member.racer
        const elapsed = (this.hooks.now() - lobby.phaseAt) / 1000
        const wasFinished = racer.progress.finishedAt !== null
        for (let i = 0; i + 2 < samples.length; i += 3) {
            const point = { x: samples[i]!, z: samples[i + 1]!, t: samples[i + 2]! }
            if (point.t > elapsed + CLOCK_LEAD) break
            const last = racer.last
            if (last && point.t <= last.t) continue
            if (last) {
                const speed = Math.hypot(point.x - last.x, point.z - last.z) / (point.t - last.t)
                if (speed <= MAX_MOVE_SPEED) {
                    racer.progress = advance(lobby.track.course, racer.progress, last, point, last.t, point.t)
                } else if (!this.isFairJump(lobby.track.course, racer.progress, last, point)) {
                    // Teleporting ahead: the kart stays where it was as far as the race goes.
                    continue
                }
            }
            racer.last = point
        }
        if (!wasFinished && racer.progress.finishedAt !== null) {
            lobby.firstFinishAt ??= this.hooks.now()
            this.checkFinish(lobby)
        }
    }

    /** Called every server tick: the green light, the end of a race, and everyone's karts. */
    tick(): void {
        const now = this.hooks.now()
        for (const lobby of this.lobbies.values()) {
            if (lobby.phase === 'countdown' && now >= lobby.phaseAt + COUNTDOWN * 1000) {
                this.setPhase(lobby, 'racing', lobby.phaseAt + COUNTDOWN * 1000)
                this.broadcastLobby(lobby)
            }
            this.checkFinish(lobby)
            this.broadcastKarts(lobby)
        }
    }

    /** The lobby list for the Hub's racing page, oldest first. */
    summaries(): LobbySummary[] {
        return [...this.lobbies.values()].map(lobby => ({
            id: lobby.id,
            trackId: lobby.track.id,
            trackName: lobby.track.name,
            host: lobby.members.find(m => m.conn.id === lobby.hostId)?.driver.name ?? '',
            players: lobby.members.length,
            max: MAX_RACERS,
            phase: lobby.phase,
        }))
    }

    private checkFinish(lobby: Lobby): void {
        if (lobby.phase !== 'racing') return
        const racers = lobby.members.filter(m => m.racer)
        const now = this.hooks.now()
        const allIn = racers.every(m => m.racer!.progress.finishedAt !== null)
        const graceOver = lobby.firstFinishAt !== null && now >= lobby.firstFinishAt + FINISH_GRACE_MS
        if (allIn || graceOver || now >= lobby.phaseAt + MAX_RACE_MS) this.finish(lobby)
    }

    private finish(lobby: Lobby): void {
        const order = this.ranked(lobby)
        lobby.results = order.map((member, i) => ({
            id: member.conn.id,
            name: member.driver.name,
            position: i + 1,
            time: member.racer!.progress.finishedAt,
            bestLap: bestLap(member.racer!.progress),
        }))
        lobby.races += 1
        this.setPhase(lobby, 'finished')
        this.broadcastLobby(lobby)

        const rows = order.flatMap((member, i) => {
            const { playerId } = member.driver
            if (playerId === null) return []
            const progress = member.racer!.progress
            const lap = bestLap(progress)

            return [
                {
                    playerId,
                    position: i + 1,
                    timeMs: progress.finishedAt === null ? null : Math.round(progress.finishedAt * 1000),
                    bestLapMs: lap === null ? null : Math.round(lap * 1000),
                },
            ]
        })
        if (rows.length > 0) {
            this.hooks.onResults({
                raceId: `${lobby.id}-${this.hooks.now().toString(36)}`,
                trackId: lobby.track.id,
                racers: order.length,
                rows,
            })
        }
    }

    /** Whether a jump is one the game makes: R back to the last checkpoint, or out of the water nearby. */
    private isFairJump(course: Course, progress: Progress, from: Point, to: Point): boolean {
        const respawn = respawnPoint(course, progress)
        if (Math.hypot(to.x - respawn.x, to.z - respawn.z) <= RESPAWN_REACH) return true
        const gate = course.gates[progress.next]!
        const before = Math.hypot(gate.x - from.x, gate.z - from.z)
        const after = Math.hypot(gate.x - to.x, gate.z - to.z)

        return before - after <= JUMP_GAIN
    }

    /** The racers, leader first. */
    private ranked(lobby: Lobby): Member[] {
        const racers = lobby.members.filter(m => m.racer)
        const { course, route } = lobby.track
        const byId = new Map(racers.map(m => [m.conn.id, m]))
        const order = standings(
            racers.map(m => {
                const progress = m.racer!.progress
                const at = m.racer!.last ?? m.pose ?? { x: 0, z: 0 }
                const gate = course.gates[progress.next]!

                return {
                    id: m.conn.id,
                    name: m.driver.name,
                    progress,
                    toNextGate: route
                        ? toGate(route, progress.next, at.x, at.z)
                        : Math.hypot(gate.x - at.x, gate.z - at.z),
                }
            }),
            course.gates.length
        )

        return order.map(racer => byId.get(racer.id)!)
    }

    private broadcastKarts(lobby: Lobby): void {
        const karts = lobby.members.flatMap(m => (m.pose ? [{ id: m.conn.id, pose: m.pose }] : []))
        const racing = lobby.phase === 'racing' || lobby.phase === 'countdown'
        const order: Standing[] | null = racing
            ? this.ranked(lobby).map(m => ({
                  id: m.conn.id,
                  lap: m.racer!.progress.lap,
                  finishedAt: m.racer!.progress.finishedAt,
              }))
            : null
        if (karts.length === 0 && !order) return
        for (const member of lobby.members) {
            member.conn.send({
                type: 'karts',
                karts: karts.filter(kart => kart.id !== member.conn.id),
                standings: order,
            })
        }
    }

    private setPhase(lobby: Lobby, phase: LobbyPhase, at = this.hooks.now()): void {
        lobby.phase = phase
        lobby.phaseAt = at
        if (phase === 'waiting') {
            for (const member of lobby.members) member.racer = null
            lobby.results = null
        }
    }

    private broadcastLobby(lobby: Lobby, except?: string): void {
        const message: ServerMessage = { type: 'lobby', lobby: view(lobby) }
        for (const member of lobby.members) if (member.conn.id !== except) member.conn.send(message)
    }

    private lobbyOf(connId: string): Lobby | undefined {
        const id = this.memberships.get(connId)

        return id ? this.lobbies.get(id) : undefined
    }

    private refuse(conn: Connection, code: ErrorCode): void {
        conn.send({ type: 'error', code })
    }

    private freshId(): string {
        let id = this.hooks.newId()
        while (this.lobbies.has(id)) id = this.hooks.newId()

        return id
    }
}

function view(lobby: Lobby): LobbyView {
    return {
        id: lobby.id,
        trackId: lobby.track.id,
        trackName: lobby.track.name,
        hostId: lobby.hostId,
        phase: lobby.phase,
        members: lobby.members.map(m => ({ ...m.driver, racing: m.racer !== null })),
        results: lobby.results,
    }
}
