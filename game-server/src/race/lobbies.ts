import { advance, bestLap, type Point, type Progress, respawnPoint, startProgress } from './drive/laps.ts'
import { toGate, type Route } from './drive/route.ts'
import { standings } from './drive/standings.ts'
import { PACE } from './drive/kart.ts'
import { COUNTDOWN, FINAL_COUNT, introFor } from './drive/trial.ts'
import {
    DEFAULT_DENSITY,
    EAT_REACH,
    MAX_DENSITY,
    placeSnacks,
    RESPAWN_MS,
    SNACK_KINDS,
    type SnackKind,
    type SnackSpot,
} from './drive/snacks.ts'
import { rollSky, type Sky, type TimeOfDay } from './drive/weather.ts'
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
/** Faster than this between two steps isn't driving: a reset or a respawn. Boosted top speed is ~47 m/s, times PACE on the ground. */
const MAX_MOVE_SPEED = 80 * PACE
/** A jump landing this close to your last checkpoint is R putting you back on it. */
const RESPAWN_REACH = 20
/** Any other jump (out of the water onto a road) may bring you at most this much closer to your next gate. */
const JUMP_GAIN = 30
/** A kart can claim a snack this much further than EAT_REACH from where it last said it was (it moves between reports). */
const EAT_SLACK = 8
/** A Chipwich puts you this far ahead of the kart you pass, and allows the jump for this long. */
const SANDWICH_LEAD = 10
const TELEPORT_GRACE_MS = 3000

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
    /** 0 ≤ x < 1, for the sky of each race. */
    random(): number
    onResults(result: RaceResult): void
}

interface Racer {
    progress: Progress
    /** The last step reported: where, and when on the tab's race clock. */
    last: { x: number; z: number; t: number } | null
    /** A Chipwich moved this kart: until then, its jump is allowed. */
    teleportUntil: number
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
    /** Rolled when the lobby opens and after each race, for the next one. */
    sky: Sky
    /** The host's pick of time of day, kept for every race; null: random. */
    time: TimeOfDay | null
    /** How many snacks, 0–10 (the host's slider). A race with snacks isn't sent to the Hub's records. */
    density: number
    /** Which snacks (the host's checkboxes); none is a clean race. */
    kinds: SnackKind[]
    /** This race's snacks; `eatenAt` set while one is gone. */
    snacks: Array<SnackSpot & { eatenAt: number | null }>
    /** Whether the race under way (or just finished) had snacks. */
    raceChaos: boolean
    /** Seconds from Start to the green light for the race under way (countdownFor). */
    countdown: number
}

export class LobbyManager {
    private readonly lobbies = new Map<string, Lobby>()
    /** Connection id → lobby id. */
    private readonly memberships = new Map<string, string>()

    constructor(private readonly hooks: LobbyHooks) {}

    /**
     * Seats a driver: in lobby `lobbyId` when it's open on this track; else in
     * a lobby already on the track (one getting ready or done racing first,
     * else one racing, to watch), so everyone pressing Play on a track ends
     * up together; else in a new one they host.
     */
    join(conn: Connection, driver: Omit<DriverInfo, 'id'>, track: LoadedTrack, lobbyId: string | null): void {
        this.leave(conn.id)
        let lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined
        if (lobby && lobby.track.id !== track.id) lobby = undefined
        lobby ??= this.openLobbyOn(track.id, driver.playerId)

        if (lobby && driver.playerId !== null) {
            // The same player in a second tab takes over from the first.
            const previous = lobby.members.find(member => member.driver.playerId === driver.playerId)
            if (previous) {
                const id = lobby.id
                previous.conn.send({ type: 'error', code: 'REPLACED' })
                this.leave(previous.conn.id)
                lobby = this.lobbies.get(id)
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
                sky: rollSky(this.hooks.random),
                time: null,
                density: DEFAULT_DENSITY,
                kinds: [...SNACK_KINDS],
                snacks: [],
                raceChaos: false,
                countdown: COUNTDOWN,
            }
            this.lobbies.set(lobby.id, lobby)
        }

        lobby.members.push({ conn, driver: { ...driver, id: conn.id }, pose: null, racer: null })
        this.memberships.set(conn.id, lobby.id)
        conn.send({ type: 'welcome', you: conn.id, lobby: view(lobby) })
        // Watching a race under way: its snacks too.
        if (lobby.phase === 'countdown' || lobby.phase === 'racing')
            conn.send({ type: 'snacks', snacks: onTrack(lobby) })
        this.broadcastLobby(lobby, conn.id)
    }

    /** The host closes their lobby, for everyone in it. */
    close(connId: string): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        if (lobby.hostId !== connId) {
            return lobby.members.find(m => m.conn.id === connId)!.conn.send({ type: 'error', code: 'NOT_HOST' })
        }
        const host = lobby.members.find(m => m.conn.id === connId)!.driver.name
        this.closeLobby(lobby.id, host)
    }

    /** The host picks the time of day for the next race and the ones after (null: random each race). */
    setTime(connId: string, time: TimeOfDay | null): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        if (lobby.hostId !== connId) {
            return lobby.members.find(m => m.conn.id === connId)!.conn.send({ type: 'error', code: 'NOT_HOST' })
        }
        // Not mid-race: the sky would change under the karts.
        if (lobby.phase === 'countdown' || lobby.phase === 'racing') return
        lobby.time = time
        lobby.sky = { ...lobby.sky, time: time ?? rollSky(this.hooks.random).time }
        this.broadcastLobby(lobby)
    }

    /** The host sets how many snacks the next races have, 0 (none) to MAX_DENSITY. */
    setDensity(connId: string, density: number): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        if (lobby.hostId !== connId) {
            return lobby.members.find(m => m.conn.id === connId)!.conn.send({ type: 'error', code: 'NOT_HOST' })
        }
        if (lobby.phase === 'countdown' || lobby.phase === 'racing') return
        lobby.density = Math.max(0, Math.min(MAX_DENSITY, Math.round(density)))
        this.broadcastLobby(lobby)
    }

    /** The host picks which of the dépanneur's snacks the next races have (none ticked: a clean race). */
    setKinds(connId: string, kinds: readonly SnackKind[]): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby) return
        if (lobby.hostId !== connId) {
            return lobby.members.find(m => m.conn.id === connId)!.conn.send({ type: 'error', code: 'NOT_HOST' })
        }
        if (lobby.phase === 'countdown' || lobby.phase === 'racing') return
        lobby.kinds = SNACK_KINDS.filter(kind => kinds.includes(kind))
        this.broadcastLobby(lobby)
    }

    /**
     * A racer drove through a snack: if it's there and they're next to it, it's
     * theirs, and everyone hears who ate what (each tab applies what that does
     * to its own kart). A Chipwich is the server's to play: it knows the order.
     */
    eat(connId: string, snackId: number): void {
        const lobby = this.lobbyOf(connId)
        if (!lobby || lobby.phase !== 'racing') return
        const member = lobby.members.find(m => m.conn.id === connId)!
        const snack = lobby.snacks.find(s => s.id === snackId)
        if (!member.racer || member.racer.progress.finishedAt !== null || !snack || snack.eatenAt !== null) return
        const at = member.pose
        if (!at || Math.hypot(at.x - snack.x, at.z - snack.z) > EAT_REACH + EAT_SLACK) return

        snack.eatenAt = this.hooks.now()
        for (const m of lobby.members) m.conn.send({ type: 'ate', snack: snack.id, kind: snack.kind, by: connId })
        if (snack.kind === 'chipwich') this.sandwich(lobby, member)
    }

    /**
     * Chipwich: puts the racer just ahead of the kart in front of them (still
     * racing), level with it in the race. The leader gets nothing here: their
     * tab fills their nitro instead.
     */
    private sandwich(lobby: Lobby, member: Member): void {
        const order = this.ranked(lobby).filter(m => m.racer!.progress.finishedAt === null)
        const index = order.indexOf(member)
        const ahead = index > 0 ? order[index - 1]! : null
        const pose = ahead?.pose
        if (!ahead || !pose) return
        const racer = member.racer!
        const theirs = ahead.racer!.progress
        racer.progress = { ...racer.progress, lap: theirs.lap, next: theirs.next, lastGate: theirs.lastGate }
        racer.teleportUntil = this.hooks.now() + TELEPORT_GRACE_MS
        member.conn.send({
            type: 'teleport',
            x: pose.x - Math.sin(pose.heading) * SANDWICH_LEAD,
            z: pose.z - Math.cos(pose.heading) * SANDWICH_LEAD,
            heading: pose.heading,
            lap: theirs.lap,
            next: theirs.next,
            lastGate: theirs.lastGate,
        })
    }

    /**
     * Ends a lobby: everyone in it is told and dropped. From the host, or from
     * the Hub's lobby list (`by` null), so a forgotten lobby can be cleared.
     * False when there's no such lobby.
     */
    closeLobby(lobbyId: string, by: string | null = null): boolean {
        const lobby = this.lobbies.get(lobbyId)
        if (!lobby) return false
        this.lobbies.delete(lobbyId)
        for (const member of lobby.members) {
            this.memberships.delete(member.conn.id)
            member.conn.send({ type: 'closed', by })
        }

        return true
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
            m.racer = { progress: startProgress(), last: null, teleportUntil: 0 }
            m.pose = null
            slots[m.conn.id] = i
        })
        lobby.results = null
        lobby.firstFinishAt = null
        this.setPhase(lobby, 'countdown')
        lobby.raceChaos = lobby.density > 0 && lobby.kinds.length > 0 && lobby.track.route !== null
        lobby.snacks = lobby.raceChaos
            ? placeSnacks(lobby.track.route!, this.hooks.random, lobby.density, lobby.kinds).map(s => ({
                  ...s,
                  eatenAt: null,
              }))
            : []
        const snacks = onTrack(lobby)
        // The drone's flight takes as long as this lap needs, then 3, 2, 1.
        lobby.countdown = countdownFor(lobby.track)
        const seconds = lobby.countdown
        for (const m of lobby.members) m.conn.send({ type: 'countdown', slots, seconds, snacks })
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
                } else if (
                    this.hooks.now() > racer.teleportUntil &&
                    !this.isFairJump(lobby.track.course, racer.progress, last, point)
                ) {
                    // Teleporting ahead (and not a Chipwich): the kart stays where it was as far as the race goes.
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
            if (lobby.phase === 'countdown' && now >= lobby.phaseAt + lobby.countdown * 1000) {
                this.setPhase(lobby, 'racing', lobby.phaseAt + lobby.countdown * 1000)
                this.broadcastLobby(lobby)
            }
            this.checkFinish(lobby)
            for (const snack of lobby.snacks) {
                if (snack.eatenAt === null || now < snack.eatenAt + RESPAWN_MS) continue
                snack.eatenAt = null
                for (const m of lobby.members) m.conn.send({ type: 'respawn', snack: snack.id })
            }
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

    /** The lobby on this track a Play should land in: one with room, or one this player is already in (another tab). */
    private openLobbyOn(trackId: number, playerId: number | null): Lobby | undefined {
        const candidates = [...this.lobbies.values()].filter(
            lobby =>
                lobby.track.id === trackId &&
                (lobby.members.length < MAX_RACERS ||
                    (playerId !== null && lobby.members.some(m => m.driver.playerId === playerId)))
        )
        const ready = (lobby: Lobby) => lobby.phase === 'waiting' || lobby.phase === 'finished'

        return candidates.find(ready) ?? candidates[0]
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
        lobby.sky = rollSky(this.hooks.random, lobby.time)
        lobby.snacks = []
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
        // A race with snacks is for fun: its times don't go in the records.
        if (rows.length > 0 && !lobby.raceChaos) {
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

/** Start to green light: the drone over the whole lap (a fixed flight without a route), then 3, 2, 1. */
export function countdownFor(track: LoadedTrack): number {
    return track.route ? introFor(track.route.length) + FINAL_COUNT : COUNTDOWN
}

/** The snacks lying on the track now. */
function onTrack(lobby: Lobby): SnackSpot[] {
    return lobby.snacks.filter(s => s.eatenAt === null).map(({ id, kind, x, z }) => ({ id, kind, x, z }))
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
        sky: lobby.sky,
        time: lobby.time,
        density: lobby.density,
        kinds: [...lobby.kinds],
    }
}
