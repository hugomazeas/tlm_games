import type { Body } from './sim/movement.ts'

/**
 * The office FPS's messages, over /games/office-fps/live/ws. There is one game: everyone who
 * connects is in it (up to MAX_PLAYERS seated, the rest watch until a seat frees).
 *
 * Players send their inputs, one frame per 60 Hz step, each as soon as it's made; the server uses
 * every frame that has arrived each step and sends a snapshot 30 times a second with the last frame it used of yours (`ack`),
 * so your browser can replay the ones after it on top of the server's body.
 */

export const MAX_PLAYERS = 12
/** Frames a message may carry (the socket takes 4 KB a message). */
export const MAX_FRAMES = 30

export type Phase = 'warmup' | 'countdown' | 'playing' | 'intermission'

/** Bits of an input frame's buttons. */
export const BUTTON = { run: 1, jet: 2, fire: 4, reload: 8 } as const

/** One step's input: what the keys and the mouse said, and which server step the shooter was looking at. */
export interface InputFrame {
    /** Counts up from 1, one per step. */
    seq: number
    forward: number
    strafe: number
    yaw: number
    pitch: number
    buttons: number
    /** The server step the other players were drawn at when this frame was taken (for the shot's rewind). */
    view: number
}

export interface PlayerInfo {
    /** The connection's id: the key of everything about this player in the other messages. */
    id: string
    name: string
    color: string
    playerId: number | null
    watching: boolean
}

/** Someone else, as everyone sees them. */
export interface PlayerState {
    id: string
    x: number
    y: number
    z: number
    yaw: number
    pitch: number
    alive: boolean
    jet: boolean
    /** Just spawned: can't be hurt until it runs out or they fire. */
    shielded: boolean
}

/** You, in full: your browser predicts from it. */
export interface SelfState {
    body: Body
    alive: boolean
    health: number
    ammo: number
    reloading: boolean
    shielded: boolean
    /** Until you're back (ms), while you're down. */
    respawnInMs: number | null
}

export type GameEvent =
    | {
          type: 'shot'
          by: string
          from: [number, number, number]
          to: [number, number, number]
          hit: string | null
          headshot: boolean
      }
    | { type: 'kill'; killer: string | null; victim: string; headshot: boolean }
    | { type: 'spawn'; id: string }

export interface Score {
    /** The connection's id while they're here, null once they left the match. */
    id: string | null
    name: string
    color: string
    kills: number
    deaths: number
}

export interface MatchView {
    phase: Phase
    /** Until the phase moves on (ms; null in warmup). */
    remainingMs: number | null
    fragLimit: number
    /** Best first. In warmup, nobody's counted. */
    scores: Score[]
}

export type ErrorCode = 'BAD_MESSAGE' | 'NOT_JOINED' | 'UNKNOWN_PLAYER' | 'UNAVAILABLE'

/** `hello` joins the game, as a Hub player or a guest (null); `input` sends frames. */
export type ClientMessage = { type: 'hello'; playerId: number | null } | { type: 'input'; frames: InputFrame[] }

export type ServerMessage =
    | { type: 'welcome'; you: string; step: number; players: PlayerInfo[]; match: MatchView }
    | { type: 'roster'; players: PlayerInfo[] }
    | { type: 'match'; match: MatchView }
    | { type: 'snap'; step: number; ack: number; you: SelfState | null; players: PlayerState[]; events: GameEvent[] }
    /** You joined from another tab; this one is closed. */
    | { type: 'replaced' }
    | { type: 'error'; code: ErrorCode }

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
        const { playerId } = message
        if (playerId !== null && (!Number.isInteger(playerId) || (playerId as number) < 1)) return null

        return { type: 'hello', playerId: playerId as number | null }
    }
    if (message.type === 'input') {
        const { frames } = message
        if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_FRAMES) return null
        const parsed: InputFrame[] = []
        for (const frame of frames) {
            const one = parseFrame(frame)
            if (!one) return null
            parsed.push(one)
        }

        return { type: 'input', frames: parsed }
    }

    return null
}

/** Frames travel as arrays to stay small: [seq, forward, strafe, yaw, pitch, buttons, view]. */
export function encodeFrame(frame: InputFrame): number[] {
    return [frame.seq, frame.forward, frame.strafe, frame.yaw, frame.pitch, frame.buttons, frame.view]
}

function parseFrame(value: unknown): InputFrame | null {
    if (!Array.isArray(value) || value.length !== 7) return null
    if (!value.every(n => typeof n === 'number' && Number.isFinite(n))) return null
    const [seq, forward, strafe, yaw, pitch, buttons, view] = value as number[]
    if (!Number.isInteger(seq) || seq! < 1 || !Number.isInteger(buttons) || buttons! < 0 || buttons! > 15) return null
    if (Math.abs(forward!) > 1 || Math.abs(strafe!) > 1 || Math.abs(pitch!) > Math.PI / 2) return null
    if (!Number.isInteger(view) || view! < 0) return null

    return { seq: seq!, forward: forward!, strafe: strafe!, yaw: yaw!, pitch: pitch!, buttons: buttons!, view: view! }
}
