import type { PlayerInfo, ServerMessage } from './protocol.ts'
import type { GameMode } from './sim/game.ts'
import type { ThemeId } from './sim/themes.ts'

/**
 * A replay is what the room saw: every game message the session broadcast,
 * stamped with its time since the countdown. Snapshots are full state, so
 * playing one back needs no simulation, and old replays survive sim changes.
 *
 * Pure (no Bun, no DOM): the server records with it, the browser reads its types.
 */

export const REPLAY_VERSION = 1
/** Serialised size past which a recording is dropped: a 5-minute, 12-player game is ~15 MB. */
export const MAX_REPLAY_CHARS = 40_000_000

const RECORDED = ['countdown', 'snapshot', 'pass', 'boom', 'newPotato', 'pickup', 'results'] as const

export type ReplayMessage = Extract<ServerMessage, { type: (typeof RECORDED)[number] }>
export type ReplayFrame = [atMs: number, message: ReplayMessage]

export interface ReplayMeta {
    mode: GameMode
    theme: ThemeId
    durationMs: number
    /** Everyone in the game as they were then, AIs and the hunter included. */
    roster: PlayerInfo[]
}

export interface Replay {
    version: typeof REPLAY_VERSION
    meta: ReplayMeta
    frames: ReplayFrame[]
}

export function isReplayMessage(message: ServerMessage): message is ReplayMessage {
    return (RECORDED as readonly string[]).includes(message.type)
}

export class ReplayRecorder {
    private readonly frames: ReplayFrame[] = []
    private chars = 0
    overflowed = false

    constructor(
        private readonly meta: ReplayMeta,
        private readonly startedAt: number,
        private readonly maxChars = MAX_REPLAY_CHARS
    ) {}

    record(message: ServerMessage, now: number) {
        if (this.overflowed || !isReplayMessage(message)) return

        const frame: ReplayFrame = [now - this.startedAt, message]
        this.chars += JSON.stringify(frame).length
        if (this.chars > this.maxChars) {
            this.overflowed = true
            this.frames.length = 0
            return
        }
        this.frames.push(frame)
    }

    /** The recording, or null when it outgrew its limit. */
    finish(): Replay | null {
        if (this.overflowed) return null
        return { version: REPLAY_VERSION, meta: this.meta, frames: this.frames }
    }
}
