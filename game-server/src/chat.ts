import type { Look } from './cosmetics.ts'
import type { PlayerInfo } from './protocol.ts'
import type { GameMode } from './sim/game.ts'
import type { Effect, ItemKind } from './sim/items.ts'
import type { ThemeId } from './sim/themes.ts'

/**
 * Each office's chat room: what people say, and what the game narrates (event
 * lines, stored as data and worded by the page). Pure: no sockets, no clock, no
 * I/O. The session manager feeds it and broadcasts; the server saves its queue.
 */

/** Lines kept per office, in memory and for newcomers. */
export const CHAT_KEEP = 100
export const CHAT_MAX_BODY = 200
/** At most this many messages per player in CHAT_WINDOW_MS. */
export const CHAT_BURST = 5
export const CHAT_WINDOW_MS = 10_000
/** Lines waiting to be saved; past this the oldest go (Laravel has been down a long while). */
export const UNSAVED_CAP = 1000

/** What happened, with the names as they were then. */
export type ChatEvent =
    | { type: 'opened'; name: string }
    | { type: 'joined'; name: string }
    | { type: 'left'; name: string }
    | { type: 'botAdded'; name: string }
    | { type: 'botRemoved'; name: string }
    | { type: 'started'; mode: GameMode; theme: ThemeId; players: number }
    | { type: 'boom'; mode: GameMode; name: string }
    | { type: 'steal'; from: string; to: string }
    | { type: 'pickup'; name: string; item: ItemKind; effect: Effect; target?: string }
    | { type: 'results'; mode: GameMode; winners: string[] }
    | { type: 'replay'; gameId: number }

export interface ChatAuthor {
    id: number
    name: string
    avatarUrl: string | null
    look?: Look
}

export interface ChatLine {
    /** This server's own id, for the page's keys. */
    id: number
    /** Epoch ms. */
    at: number
    kind: 'message' | 'event'
    author?: ChatAuthor
    body?: string
    event?: ChatEvent
}

/** A line as Laravel stores it. */
export interface UnsavedLine {
    officeId: number
    at: number
    kind: ChatLine['kind']
    playerId: number | null
    body: string | null
    event: ChatEvent | null
}

interface Room {
    lines: ChatLine[]
}

export class ChatRooms {
    private readonly rooms = new Map<number, Room>()
    /** When each player last posted, for the rate limit. */
    private readonly posted = new Map<number, number[]>()
    private unsaved: UnsavedLine[] = []
    private nextId = 1

    /** True the first time an office is seen: its history is still to load. */
    open(officeId: number): boolean {
        if (this.rooms.has(officeId)) return false
        this.rooms.set(officeId, { lines: [] })
        return true
    }

    lines(officeId: number): ChatLine[] {
        return this.rooms.get(officeId)?.lines ?? []
    }

    /** A message from a named person; why not, otherwise. */
    say(officeId: number, author: PlayerInfo, raw: string, now: number): ChatLine | 'EMPTY' | 'SLOW_DOWN' {
        const body = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_BODY)
        if (body === '') return 'EMPTY'

        const recent = (this.posted.get(author.id) ?? []).filter(at => now - at < CHAT_WINDOW_MS)
        if (recent.length >= CHAT_BURST) return 'SLOW_DOWN'
        this.posted.set(author.id, [...recent, now])

        const { id, name, avatarUrl, look } = author
        return this.add(officeId, {
            at: now,
            kind: 'message',
            author: { id, name, avatarUrl, ...(look ? { look } : {}) },
            body,
        })
    }

    narrate(officeId: number, event: ChatEvent, now: number): ChatLine {
        return this.add(officeId, { at: now, kind: 'event', event })
    }

    /**
     * The office's saved history arrived. It goes before what was said since start-up,
     * minus anything already saved in between (the same line twice).
     */
    loaded(officeId: number, history: Array<Omit<ChatLine, 'id'>>): ChatLine[] {
        const room = this.rooms.get(officeId) ?? { lines: [] }
        const seen = new Set(room.lines.map(sameness))
        const older = history.filter(line => !seen.has(sameness(line))).map(line => ({ ...line, id: this.nextId++ }))
        room.lines = [...older, ...room.lines].slice(-CHAT_KEEP)
        this.rooms.set(officeId, room)
        return room.lines
    }

    /** Everything said since the last call, for Laravel. */
    takeUnsaved(): UnsavedLine[] {
        const lines = this.unsaved
        this.unsaved = []
        return lines
    }

    /** A save failed: those lines go back in front, to try again. */
    requeue(lines: UnsavedLine[]) {
        this.unsaved = [...lines, ...this.unsaved].slice(-UNSAVED_CAP)
    }

    private add(officeId: number, line: Omit<ChatLine, 'id'>): ChatLine {
        const room = this.rooms.get(officeId) ?? { lines: [] }
        const added = { id: this.nextId++, ...line }
        room.lines = [...room.lines, added].slice(-CHAT_KEEP)
        this.rooms.set(officeId, room)

        this.unsaved.push({
            officeId,
            at: line.at,
            kind: line.kind,
            playerId: line.author?.id ?? null,
            body: line.body ?? null,
            event: line.event ?? null,
        })
        if (this.unsaved.length > UNSAVED_CAP) this.unsaved.shift()

        return added
    }
}

function sameness(line: Omit<ChatLine, 'id'>): string {
    return JSON.stringify([line.at, line.kind, line.author?.id ?? null, line.body ?? null, line.event ?? null])
}
