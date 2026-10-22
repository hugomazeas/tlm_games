/**
 * What the racing game's browser tab and the game server's lobbies say to
 * each other over /games/racing/live/ws. One lobby per race track session:
 * up to MAX_RACERS drivers, the host starts the race, late joiners watch it
 * and race the next one.
 *
 * Movement is the client's: each tab steps its own kart and sends where it
 * is. The server owns the race: the countdown, gates passed in order (the
 * same drive/laps.ts, run over the positions each tab reports), standings,
 * the end of the race, and the results it posts to the Hub.
 */

import { MAX_DENSITY, type SnackKind, type SnackSpot } from './drive/snacks.ts'
import { type Sky, type TimeOfDay, TIMES_OF_DAY } from './drive/weather.ts'

export const MAX_RACERS = 8

/** waiting: free driving before the start. countdown, racing. finished: results up, free driving again. */
export type LobbyPhase = 'waiting' | 'countdown' | 'racing' | 'finished'

/** A driver as everyone sees them: their Hub name and garage colours, or a guest's. */
export interface DriverInfo {
    /** The connection's id in the lobby. */
    id: string
    /** The Hub player, null for a guest (guests race, but aren't recorded). */
    playerId: number | null
    name: string
    body: string
    accent: string
}

export interface ResultRow {
    id: string
    name: string
    position: number
    /** Seconds, null for a racer who didn't finish. */
    time: number | null
    bestLap: number | null
}

export interface LobbyView {
    id: string
    trackId: number
    trackName: string
    hostId: string
    phase: LobbyPhase
    /** Join order. `racing`: in the race under way (or just finished); the others watch it. */
    members: Array<DriverInfo & { racing: boolean }>
    /** The last race's results, while `finished`. */
    results: ResultRow[] | null
    /** The sky the next race (or the one under way) runs under. */
    sky: Sky
    /** The time of day the host picked for every race; null: a random one each race. */
    time: TimeOfDay | null
    /** How many snacks on the track, 0 (none: a clean race) to 10 (mayhem): the host's slider. */
    density: number
}

/** One row of the lobby list on the Hub's racing page. */
export interface LobbySummary {
    id: string
    trackId: number
    trackName: string
    host: string
    players: number
    max: number
    phase: LobbyPhase
}

/** Where a kart is and enough of its state to draw it: wheels, sparks, flame. */
export interface Pose {
    x: number
    y: number
    z: number
    heading: number
    /** Forward speed, m/s. */
    speed: number
    drift: number
    charge: number
    boost: boolean
    airborne: boolean
    steer: number
}

export interface Standing {
    id: string
    lap: number
    /** Race clock when they finished, seconds; null while racing. */
    finishedAt: number | null
}

export type ClientMessage =
    /** Join the lobby (`lobby`); when it's null or gone, one already on the track, or a new one. */
    | { type: 'hello'; trackId: number; lobby: string | null; playerId: number | null }
    /** The host starts the race (or the next one). */
    | { type: 'start' }
    /** The host closes the lobby for everyone. */
    | { type: 'close' }
    /** The host picks the time of day for the races (null: random each race), between races. */
    | { type: 'setTime'; time: TimeOfDay | null }
    /** The host sets how many snacks (0–10), between races. */
    | { type: 'setDensity'; density: number }
    /** I drove through snack `snack`. */
    | { type: 'eat'; snack: number }
    /**
     * The kart now, and, while racing, every physics step since the last
     * message as flat [x, z, t, …] (t: the tab's race clock, seconds).
     */
    | { type: 'pose'; pose: Pose; samples?: number[] }

export type ErrorCode =
    | 'BAD_MESSAGE'
    | 'HELLO_FIRST'
    | 'NO_TRACK'
    | 'UNKNOWN_PLAYER'
    | 'LOBBY_FULL'
    | 'NOT_HOST'
    | 'TOO_LATE'
    /** The same player opened the lobby in another tab. */
    | 'REPLACED'
    | 'UNAVAILABLE'

export type ServerMessage =
    | { type: 'welcome'; you: string; lobby: LobbyView }
    | { type: 'lobby'; lobby: LobbyView }
    /** Grid slots by driver id; the green light is `seconds` away. The race's snacks (none at density 0). */
    | { type: 'countdown'; slots: Record<string, number>; seconds: number; snacks: SnackSpot[] }
    /** Driver `by` ate snack `snack` (gone until `respawn`). */
    | { type: 'ate'; snack: number; kind: SnackKind; by: string }
    | { type: 'respawn'; snack: number }
    /** Your Chipwich: you're put here, just ahead of the kart that was in front of you, level with it in the race. */
    | { type: 'teleport'; x: number; z: number; heading: number; lap: number; next: number; lastGate: number }
    /** On joining mid-race: the snacks still there. */
    | { type: 'snacks'; snacks: SnackSpot[] }
    /** Every other kart, and while racing the standings, leader first. */
    | { type: 'karts'; karts: Array<{ id: string; pose: Pose }>; standings: Standing[] | null }
    /** The lobby was closed: by its host (their name), or from the Hub's lobby list (null). */
    | { type: 'closed'; by: string | null }
    | { type: 'error'; code: ErrorCode }

const POSE_KEYS = ['x', 'y', 'z', 'heading', 'speed', 'drift', 'charge'] as const

/** A client message, or null when it isn't one. */
export function parseClientMessage(raw: string): ClientMessage | null {
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof value !== 'object' || value === null) return null
    const message = value as Record<string, unknown>

    if (message.type === 'hello') {
        const { trackId, lobby, playerId } = message
        if (!Number.isInteger(trackId) || (trackId as number) < 1) return null
        if (lobby !== null && (typeof lobby !== 'string' || !/^[a-z0-9]{1,16}$/.test(lobby))) return null
        if (playerId !== null && (!Number.isInteger(playerId) || (playerId as number) < 1)) return null

        return { type: 'hello', trackId: trackId as number, lobby, playerId: playerId as number | null }
    }
    if (message.type === 'start') return { type: 'start' }
    if (message.type === 'close') return { type: 'close' }
    if (message.type === 'setTime') {
        const time = TIMES_OF_DAY.find(t => t === message.time) ?? null
        if (time === null && message.time !== null) return null

        return { type: 'setTime', time }
    }
    if (message.type === 'setDensity') {
        const { density } = message
        return Number.isInteger(density) && (density as number) >= 0 && (density as number) <= MAX_DENSITY
            ? { type: 'setDensity', density: density as number }
            : null
    }
    if (message.type === 'eat') {
        const { snack } = message
        return Number.isInteger(snack) && (snack as number) >= 0 && (snack as number) < 10_000
            ? { type: 'eat', snack: snack as number }
            : null
    }
    if (message.type === 'pose') {
        const pose = parsePose(message.pose)
        if (!pose) return null
        const { samples } = message
        if (samples === undefined) return { type: 'pose', pose }
        if (!Array.isArray(samples) || samples.length % 3 !== 0 || samples.length > 3 * 30) return null
        if (!samples.every(n => typeof n === 'number' && Number.isFinite(n))) return null

        return { type: 'pose', pose, samples: samples as number[] }
    }

    return null
}

function parsePose(value: unknown): Pose | null {
    if (typeof value !== 'object' || value === null) return null
    const pose = value as Record<string, unknown>
    for (const key of POSE_KEYS) {
        if (typeof pose[key] !== 'number' || !Number.isFinite(pose[key])) return null
    }
    if (typeof pose.boost !== 'boolean' || typeof pose.airborne !== 'boolean') return null
    if (typeof pose.steer !== 'number' || !Number.isFinite(pose.steer)) return null

    return {
        x: pose.x as number,
        y: pose.y as number,
        z: pose.z as number,
        heading: pose.heading as number,
        speed: pose.speed as number,
        drift: pose.drift as number,
        charge: pose.charge as number,
        boost: pose.boost,
        airborne: pose.airborne,
        steer: pose.steer,
    }
}
