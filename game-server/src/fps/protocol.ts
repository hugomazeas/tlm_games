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
export const BUTTON = { dash: 1, jet: 2, fire: 4, reload: 8 } as const

/** The two weapon slots: 1 the blaster, 2 the stapler (melee). */
export const WEAPONS = ['blaster', 'stapler'] as const
export type Weapon = (typeof WEAPONS)[number]

/**
 * The modes: free for all, team deathmatch (red against blue), and king of the meeting room (hold
 * the active zone alone; the zone moves around the office).
 */
export const MODES = ['ffa', 'tdm', 'koth'] as const
export type Mode = (typeof MODES)[number]
export const MODE_NAMES: Record<Mode, string> = {
    ffa: 'Free for all',
    tdm: 'Team deathmatch',
    koth: 'King of the meeting room',
}
export const TEAMS = ['red', 'blue'] as const
export type Team = (typeof TEAMS)[number]
export const TEAM_COLORS: Record<Team, string> = { red: '#e4572e', blue: '#29a3e0' }

/**
 * What the host may pick for a match. `fragLimit` is kills in free for all, the team's kills in team
 * deathmatch, and in king of the meeting room ten times that in seconds holding the zone.
 */
export const FRAG_LIMITS = [5, 10, 15, 20, 25, 30, 50] as const
export const MATCH_MINUTES = [3, 5, 10, 15, 20] as const
export interface Rules {
    mode: Mode
    fragLimit: number
    minutes: number
}
export const DEFAULT_RULES: Rules = { mode: 'ffa', fragLimit: 15, minutes: 5 }
/** King of the meeting room: seconds in the zone to win, per point of the limit. */
export const ZONE_SECONDS_PER_POINT = 10

export type BuffKind = 'magazine' | 'jetpack' | 'headshot'

/** A standout of the match, on the scoreboard after it. */
export interface Award {
    title: string
    /** What earned it ("62% accuracy"). */
    detail: string
    name: string
    color: string
}

/** The active zone (king of the meeting room): which, who holds it alone (null: nobody), whether it's contested. */
export interface ZoneState {
    index: number
    holder: string | null
    contested: boolean
    /** Until it moves to the next one. */
    movesInMs: number
}

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
    /** The weapon in hand (switching takes a moment); the blaster when absent. */
    weapon?: Weapon
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
    /** 0–MAX_HEALTH, shown over them when someone's crosshair is on them. */
    health: number
    jet: boolean
    /** Just spawned: can't be hurt until it runs out or they fire. */
    shielded: boolean
    weapon: Weapon
    /** Their side in team deathmatch, null otherwise. */
    team: Team | null
    /** The pickups' powers they carry (everyone sees them). */
    buffs: BuffKind[]
}

/** You, in full: your browser predicts from it. */
export interface SelfState {
    body: Body
    alive: boolean
    health: number
    ammo: number
    reloading: boolean
    /** What's left of the reload (ms), for the ring by the crosshair; null when not reloading. */
    reloadLeftMs: number | null
    shielded: boolean
    weapon: Weapon
    /** Until you're back (ms), while you're down. */
    respawnInMs: number | null
    /** Rounds a full magazine holds (more with a big magazine). */
    magazine: number
    /** Your powers, with what's left of each (ms). */
    buffs: Array<{ kind: BuffKind; leftMs: number }>
}

export type GameEvent =
    | {
          type: 'shot'
          by: string
          from: [number, number, number]
          to: [number, number, number]
          hit: string | null
          headshot: boolean
          /** Health it took (0: a miss, or a spawn-shielded target). */
          damage: number
      }
    /** A stapler swing: who it hit (null: air), for how much, and whether it was from behind. */
    | { type: 'swing'; by: string; hit: string | null; damage: number; backstab: boolean }
    | {
          type: 'kill'
          killer: string | null
          victim: string
          headshot: boolean
          weapon: Weapon
          backstab: boolean
          /** The killer's kills this life (with this one), and what the victim's run was. */
          killerStreak: number
          victimStreak: number
          /** The match's first kill. */
          firstBlood?: boolean
      }
    | { type: 'spawn'; id: string }
    /** Someone took the pickup at `spot` (an index into PICKUP_SPOTS). */
    | { type: 'pickup'; by: string; spot: number }

export interface Score {
    /** The connection's id while they're here, null once they left the match. */
    id: string | null
    name: string
    color: string
    kills: number
    deaths: number
    team: Team | null
    /** Seconds holding the zone (king of the meeting room). */
    points: number
}

export interface MatchView {
    phase: Phase
    /** Until the phase moves on (ms; null in warmup). */
    remainingMs: number | null
    /** The match's rules: the one being played, or (in warmup) the last one's. */
    mode: Mode
    fragLimit: number
    minutes: number
    /** Who starts the next match and picks its rules (a connection id): the longest seated. */
    host: string | null
    /** Best first. In warmup, nobody's counted. */
    scores: Score[]
    /** Team deathmatch: each side's kills. */
    teams: Record<Team, number> | null
    /** After a match: its standouts. */
    awards: Award[] | null
}

export type ErrorCode = 'BAD_MESSAGE' | 'NOT_JOINED' | 'UNKNOWN_PLAYER' | 'UNAVAILABLE' | 'NOT_HOST' | 'NOT_ENOUGH'

/** `hello` joins the game, as a Hub player or a guest (null); `input` sends frames; the host `start`s a match. */
export type ClientMessage =
    | { type: 'hello'; playerId: number | null }
    | { type: 'input'; frames: InputFrame[] }
    | { type: 'start'; rules: Rules }

export type ServerMessage =
    | { type: 'welcome'; you: string; step: number; players: PlayerInfo[]; match: MatchView }
    | { type: 'roster'; players: PlayerInfo[] }
    | { type: 'match'; match: MatchView }
    | {
          type: 'snap'
          step: number
          ack: number
          you: SelfState | null
          players: PlayerState[]
          events: GameEvent[]
          /** Which pickups are there to take (by spot). */
          pickups: boolean[]
          /** King of the meeting room, while it's played. */
          zone: ZoneState | null
      }
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
    if (message.type === 'start') {
        const rules = message.rules as Record<string, unknown> | null | undefined
        const fragLimit = FRAG_LIMITS.find(n => n === rules?.fragLimit)
        const minutes = MATCH_MINUTES.find(n => n === rules?.minutes)
        // No mode (an older tab): free for all.
        const mode = rules?.mode === undefined ? 'ffa' : MODES.find(m => m === rules.mode)
        if (fragLimit === undefined || minutes === undefined || mode === undefined) return null

        return { type: 'start', rules: { mode, fragLimit, minutes } }
    }

    return null
}

/**
 * Frames travel as arrays to stay small: [seq, forward, strafe, yaw, pitch, buttons, view, weapon],
 * the weapon as its slot's index (a 7-long frame holds the blaster).
 */
export function encodeFrame(frame: InputFrame): number[] {
    const { seq, forward, strafe, yaw, pitch, buttons, view } = frame
    return [seq, forward, strafe, yaw, pitch, buttons, view, WEAPONS.indexOf(frame.weapon ?? 'blaster')]
}

function parseFrame(value: unknown): InputFrame | null {
    if (!Array.isArray(value) || (value.length !== 7 && value.length !== 8)) return null
    if (!value.every(n => typeof n === 'number' && Number.isFinite(n))) return null
    const [seq, forward, strafe, yaw, pitch, buttons, view, slot = 0] = value as number[]
    if (!Number.isInteger(seq) || seq! < 1 || !Number.isInteger(buttons) || buttons! < 0 || buttons! > 15) return null
    if (Math.abs(forward!) > 1 || Math.abs(strafe!) > 1 || Math.abs(pitch!) > Math.PI / 2) return null
    if (!Number.isInteger(view) || view! < 0) return null
    const weapon = WEAPONS[slot]
    if (!Number.isInteger(slot) || weapon === undefined) return null

    return {
        seq: seq!,
        forward: forward!,
        strafe: strafe!,
        yaw: yaw!,
        pitch: pitch!,
        buttons: buttons!,
        view: view!,
        weapon,
    }
}
