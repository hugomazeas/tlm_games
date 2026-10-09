import type { Arena } from './sim/arena.ts'
import type { GameMode } from './sim/game.ts'
import type { Effect, ItemKind } from './sim/items.ts'
import { isThemeId, type ThemeId } from './sim/themes.ts'

/** What a Hub player looks like to the game: fetched from Laravel, never trusted from a browser. */
export interface PlayerInfo {
    id: number
    name: string
    /** Root-relative profile photo, null for initials. */
    avatarUrl: string | null
}

export type Phase = 'lobby' | 'countdown' | 'playing' | 'results'

export interface Settings {
    durationMin: number
    theme: ThemeId | 'random'
    mode: GameMode
}

export interface SessionView {
    hostId: number
    phase: Phase
    settings: Settings
    /** Join order. `away` players dropped and have a few seconds to come back. */
    players: Array<PlayerInfo & { away: boolean }>
}

export interface SnapshotPlayer {
    id: number
    x: number
    y: number
    frozenMs: number
    out: boolean
    shieldMs: number
    speedMs: number
    slipMs: number
    ghostMs: number
    reverseMs: number
    magnetMs: number
    tinyMs: number
    /** Flying off a boost pad. */
    launchMs: number
    /** Time held so far: the score in King of the Potato. */
    holdMs: number
    /** A fresh king's head start; can't be robbed while it lasts. */
    safeMs: number
}

export interface SnapshotItem {
    id: number
    kind: ItemKind
    x: number
    y: number
    expiresInMs: number
}

export interface Results {
    mode: GameMode
    /** Survivors, or in King of the Potato the longest holders. */
    survivorIds: number[]
    /** Latest-out first. */
    eliminated: Array<{ id: number; atMs: number }>
    stats: Array<{ id: number; holdMs: number; passes: number }>
}

export type ClientMessage =
    | { type: 'hello'; officeId: number; playerId: number | null }
    | { type: 'open' }
    | { type: 'join' }
    | { type: 'leave' }
    | { type: 'start'; durationMin: number; theme: ThemeId | 'random'; mode: GameMode }
    | { type: 'input'; dx: number; dy: number }
    | { type: 'close' }
    | { type: 'emote'; emote: Emote }

/** End-of-game reactions: tap one on the results screen and it pops over your avatar. */
export const EMOTES = ['😂', '🔥', '👏', '😭', '🤬', '🥔', '💀', '🫡'] as const
export type Emote = (typeof EMOTES)[number]

export type ErrorCode =
    | 'BAD_MESSAGE'
    | 'HELLO_FIRST'
    | 'UNKNOWN_PLAYER'
    | 'PICK_A_PLAYER'
    | 'SESSION_EXISTS'
    | 'NO_SESSION'
    | 'NOT_HOST'
    | 'NOT_ENOUGH_PLAYERS'
    | 'LOBBY_FULL'
    | 'NOT_IN_LOBBY'
    | 'UNAVAILABLE'

export type ServerMessage =
    /** `build` identifies the browser bundle this server serves; a tab running another one reloads. */
    | { type: 'welcome'; player: PlayerInfo | null; build: string }
    | { type: 'office'; session: SessionView | null }
    | { type: 'countdown'; arena: Arena; playerIds: number[]; durationMs: number; startsInMs: number }
    | {
          type: 'snapshot'
          elapsedMs: number
          players: SnapshotPlayer[]
          items: SnapshotItem[]
          holderId: number | null
          shake: number
      }
    | { type: 'pass'; from: number; to: number }
    | { type: 'boom'; playerId: number }
    | { type: 'newPotato'; playerId: number }
    /** `targetId`: who a swap traded places with. */
    | { type: 'pickup'; playerId: number; item: ItemKind; effect: Effect; targetId?: number }
    | { type: 'emote'; playerId: number; emote: Emote }
    | { type: 'results'; results: Results }
    | { type: 'error'; code: ErrorCode }

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 12
export const DURATIONS_MIN = [1, 2, 3, 4, 5] as const
export const GAME_MODES: readonly GameMode[] = ['survival', 'king']

/** Validates one inbound frame. Anything unexpected is null, never a throw. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
    let data: unknown = raw
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw)
        } catch {
            return null
        }
    }

    if (typeof data !== 'object' || data === null) return null
    const message = data as Record<string, unknown>

    switch (message.type) {
        case 'hello':
            if (!isPositiveInt(message.officeId)) return null
            if (message.playerId !== null && !isPositiveInt(message.playerId)) return null
            return { type: 'hello', officeId: message.officeId, playerId: message.playerId }
        case 'open':
        case 'join':
        case 'leave':
        case 'close':
            return { type: message.type }
        case 'start':
            if (!(DURATIONS_MIN as readonly unknown[]).includes(message.durationMin)) return null
            if (message.theme !== 'random' && !isThemeId(message.theme)) return null
            // A page loaded before modes existed sends none: that's the classic game.
            if (message.mode !== undefined && !GAME_MODES.includes(message.mode as GameMode)) return null
            return {
                type: 'start',
                durationMin: message.durationMin as number,
                theme: message.theme,
                mode: (message.mode as GameMode | undefined) ?? 'survival',
            }
        case 'emote':
            if (!(EMOTES as readonly unknown[]).includes(message.emote)) return null
            return { type: 'emote', emote: message.emote as Emote }
        case 'input':
            if (!isUnitish(message.dx) || !isUnitish(message.dy)) return null
            return { type: 'input', dx: message.dx, dy: message.dy }
        default:
            return null
    }
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isUnitish(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1
}
