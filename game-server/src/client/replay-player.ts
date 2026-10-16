import type { ServerMessage } from '../protocol.ts'
import type { Replay, ReplayMessage } from '../replay.ts'

type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>
type ResultsMessage = Extract<ServerMessage, { type: 'results' }>

export const SPEEDS = [0.5, 1, 2] as const
export type Speed = (typeof SPEEDS)[number]
/** Playback opens this long before the first snapshot: the last seconds of the countdown. */
export const LEAD_IN_MS = 3000

/** Where a seek lands: the state to draw there, since snapshots are full state. */
export interface SeekState {
    snapshot: Snapshot | null
    results: ResultsMessage | null
}

/**
 * A replay's clock, with no DOM and no timer of its own: the page calls
 * `advance` every frame with the real time elapsed, and draws what comes back.
 * Times are the recording's (ms since the countdown).
 */
export class ReplayPlayer {
    readonly startMs: number
    readonly endMs: number
    /** When play began: the first snapshot. */
    readonly playStartMs: number
    currentMs: number
    playing = false
    speed: Speed = 1
    private cursor = 0

    constructor(readonly replay: Replay) {
        const frames = replay.frames
        const firstSnapshot = frames.find(([, m]) => m.type === 'snapshot')?.[0] ?? 0
        this.playStartMs = firstSnapshot
        this.startMs = Math.max(0, firstSnapshot - LEAD_IN_MS)
        this.endMs = frames.at(-1)?.[0] ?? 0
        this.currentMs = this.startMs
        this.cursor = this.indexAfter(this.startMs)
    }

    get countdown(): Extract<ServerMessage, { type: 'countdown' }> | null {
        const frame = this.replay.frames.find(([, m]) => m.type === 'countdown')
        return frame && frame[1].type === 'countdown' ? frame[1] : null
    }

    get ended(): boolean {
        return this.currentMs >= this.endMs
    }

    /** Every elimination, for the scrub bar's ticks and the jump list. */
    get booms(): Array<{ atMs: number; playerId: number }> {
        return this.replay.frames.flatMap(([atMs, m]) => (m.type === 'boom' ? [{ atMs, playerId: m.playerId }] : []))
    }

    play() {
        if (this.ended) this.seek(this.startMs)
        this.playing = true
    }

    pause() {
        this.playing = false
    }

    /** Moves the clock on by `realMs` × speed; returns the messages due on the way, in order. */
    advance(realMs: number): ReplayMessage[] {
        if (!this.playing || realMs <= 0) return []

        const target = Math.min(this.endMs, this.currentMs + realMs * this.speed)
        const due: ReplayMessage[] = []
        const frames = this.replay.frames
        while (this.cursor < frames.length && (frames[this.cursor]?.[0] ?? Infinity) <= target) {
            const frame = frames[this.cursor++]
            if (frame) due.push(frame[1])
        }
        this.currentMs = target
        if (this.ended) this.playing = false

        return due
    }

    /**
     * Jumps to `ms` without replaying what lies between: only the newest snapshot
     * (and the results, past the end) at or before it. Bursts, banners and booms
     * along the way never fire.
     */
    seek(ms: number): SeekState {
        this.currentMs = Math.min(this.endMs, Math.max(this.startMs, ms))
        this.cursor = this.indexAfter(this.currentMs)

        let snapshot: Snapshot | null = null
        let results: ResultsMessage | null = null
        for (let i = this.cursor - 1; i >= 0 && !snapshot; i--) {
            const message = this.replay.frames[i]?.[1]
            if (message?.type === 'snapshot') snapshot = message
            if (message?.type === 'results') results = message
        }

        return { snapshot, results }
    }

    /** The first frame strictly after `ms`. */
    private indexAfter(ms: number): number {
        const frames = this.replay.frames
        let low = 0
        let high = frames.length
        while (low < high) {
            const mid = (low + high) >> 1
            if ((frames[mid]?.[0] ?? Infinity) <= ms) low = mid + 1
            else high = mid
        }
        return low
    }
}
