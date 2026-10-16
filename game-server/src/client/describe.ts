import type { ChatEvent } from '../chat.ts'
import type { Results } from '../protocol.ts'
import { THEMES } from '../sim/themes.ts'
import type { GameMode } from '../sim/game.ts'
import { STRINGS } from './strings.ts'

/** The results card's rows and headline, shared by the live page and the replay page. */

export interface ResultsView {
    mode: GameMode
    headline: string
    rows: Array<{ id: number; name: string; place: string; survived: boolean; holdSeconds: number; passes: number }>
}

/** Who's who, from wherever the page knows the players. */
export interface Names {
    nameOf(id: number): string
    isHunter(id: number): boolean
}

export function describeResults(results: Results, names: Names): ResultsView {
    if (results.mode === 'king') return describeReign(results, names)

    const survivors = results.survivorIds.map(id => names.nameOf(id))
    const stats = new Map(results.stats.map(s => [s.id, s]))
    const ordered = [
        ...results.survivorIds.map(id => ({ id, survived: true })),
        ...results.eliminated.map(e => ({ id: e.id, survived: false })),
    ]
    // Killer Potato: the hunter is neither a survivor nor out; it comes last, or first if it caught everyone.
    if (results.mode === 'killer') {
        const hunter = results.stats.find(s => !ordered.some(row => row.id === s.id))
        if (hunter) {
            const row = { id: hunter.id, survived: false }
            if (survivors.length > 0) ordered.push(row)
            else ordered.unshift(row)
        }
    }
    const place = (row: { id: number; survived: boolean }, index: number) =>
        row.survived ? '🏆' : results.mode === 'killer' && names.isHunter(row.id) ? '🔪' : `#${index + 1}`

    return {
        mode: results.mode,
        headline:
            survivors.length > 0
                ? STRINGS.survivors(survivors)
                : results.mode === 'killer'
                  ? STRINGS.hunterWins
                  : STRINGS.nobody,
        rows: ordered.map((row, index) => ({
            id: row.id,
            name: names.nameOf(row.id),
            place: place(row, index),
            survived: row.survived,
            holdSeconds: Math.round((stats.get(row.id)?.holdMs ?? 0) / 1000),
            passes: stats.get(row.id)?.passes ?? 0,
        })),
    }
}

/** King of the Potato: longest reign first, ties sharing a place. */
function describeReign(results: Results, names: Names): ResultsView {
    const kings = new Set(results.survivorIds)
    const ranked = [...results.stats].sort((a, b) => b.holdMs - a.holdMs)
    const seconds = (ms: number) => Math.round(ms / 1000)
    const best = seconds(ranked[0]?.holdMs ?? 0)

    return {
        mode: results.mode,
        headline:
            kings.size > 0
                ? STRINGS.kings(
                      [...kings].map(id => names.nameOf(id)),
                      best
                  )
                : STRINGS.noKing,
        rows: ranked.map(row => ({
            id: row.id,
            name: names.nameOf(row.id),
            place: kings.has(row.id) ? '👑' : `#${ranked.filter(other => other.holdMs > row.holdMs).length + 1}`,
            survived: kings.has(row.id),
            holdSeconds: seconds(row.holdMs),
            passes: row.passes,
        })),
    }
}

/** A chat event line, in words. */
export function chatText(event: ChatEvent): string {
    switch (event.type) {
        case 'opened':
        case 'joined':
        case 'left':
        case 'botAdded':
        case 'botRemoved':
            return STRINGS.chat[event.type](event.name)
        case 'started': {
            const theme = THEMES[event.theme]
            return STRINGS.chat.started(
                STRINGS.modes[event.mode].label,
                theme ? STRINGS.intro.arena(theme.emoji, theme.name) : event.theme,
                event.players
            )
        }
        case 'boom':
            return event.mode === 'killer' ? STRINGS.caught(event.name) : STRINGS.boom(event.name)
        case 'steal':
            return STRINGS.chat.steal(event.from, event.to)
        case 'pickup':
            return STRINGS.pickup(event.name, event.item, event.effect, event.target)
        case 'results':
            if (event.winners.length === 0) return event.mode === 'killer' ? STRINGS.hunterWins : STRINGS.nobody
            return event.mode === 'king' ? STRINGS.chat.reign(event.winners) : STRINGS.survivors(event.winners)
        case 'replay':
            return STRINGS.chat.replay
    }
}
