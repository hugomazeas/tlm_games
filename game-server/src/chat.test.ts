import { describe, expect, test } from 'bun:test'
import { CHAT_BURST, CHAT_KEEP, CHAT_MAX_BODY, CHAT_WINDOW_MS, ChatRooms } from './chat.ts'

const alice = { id: 1, name: 'Alice', avatarUrl: null }

describe('ChatRooms', () => {
    test('an office opens once: the first time, its history is still to load', () => {
        const chat = new ChatRooms()
        expect(chat.open(1)).toBe(true)
        expect(chat.open(1)).toBe(false)
        expect(chat.open(2)).toBe(true)
    })

    test('a message is tidied, capped and signed', () => {
        const chat = new ChatRooms()
        chat.open(1)
        const line = chat.say(1, alice, '  hello \n  there  ', 1000)

        expect(line).toEqual({ id: 1, at: 1000, kind: 'message', author: alice, body: 'hello there' })
        const long = chat.say(1, { ...alice, id: 2 }, 'x'.repeat(500), 1000)
        expect(typeof long === 'object' && long.body?.length).toBe(CHAT_MAX_BODY)
        expect(chat.say(1, alice, '   ', 1000)).toBe('EMPTY')
    })

    test('five messages per ten seconds each', () => {
        const chat = new ChatRooms()
        for (let i = 0; i < CHAT_BURST; i++) expect(chat.say(1, alice, `hi ${i}`, 1000 + i)).not.toBe('SLOW_DOWN')

        expect(chat.say(1, alice, 'one more', 2000)).toBe('SLOW_DOWN')
        expect(chat.say(1, { ...alice, id: 2 }, 'someone else', 2000)).not.toBe('SLOW_DOWN')
        expect(chat.say(1, alice, 'later', 1000 + CHAT_WINDOW_MS)).not.toBe('SLOW_DOWN')
    })

    test('keeps the last hundred lines per office', () => {
        const chat = new ChatRooms()
        for (let i = 0; i < CHAT_KEEP + 5; i++) chat.narrate(1, { type: 'joined', name: `P${i}` }, i)
        chat.narrate(2, { type: 'opened', name: 'Bob' }, 0)

        expect(chat.lines(1)).toHaveLength(CHAT_KEEP)
        expect(chat.lines(1)[0]?.event).toEqual({ type: 'joined', name: 'P5' })
        expect(chat.lines(2)).toHaveLength(1)
    })

    test('saved history goes first, without what was already said since', () => {
        const chat = new ChatRooms()
        chat.open(1)
        const live = chat.say(1, alice, 'still here', 5000)
        if (typeof live !== 'object') throw new Error('not said')

        const lines = chat.loaded(1, [
            { at: 1000, kind: 'event', event: { type: 'opened', name: 'Alice' } },
            // Saved before the history came back: not twice.
            { at: 5000, kind: 'message', author: alice, body: 'still here' },
        ])
        expect(lines.map(l => l.body ?? l.event?.type)).toEqual(['opened', 'still here'])
        expect(new Set(lines.map(l => l.id)).size).toBe(2)
    })

    test('lines queue up for saving, and a failed save puts them back first', () => {
        const chat = new ChatRooms()
        chat.say(1, alice, 'hi', 1000)
        chat.narrate(1, { type: 'replay', gameId: 9 }, 2000)

        const batch = chat.takeUnsaved()
        expect(batch).toEqual([
            { officeId: 1, at: 1000, kind: 'message', playerId: 1, body: 'hi', event: null },
            { officeId: 1, at: 2000, kind: 'event', playerId: null, body: null, event: { type: 'replay', gameId: 9 } },
        ])
        expect(chat.takeUnsaved()).toEqual([])

        chat.narrate(1, { type: 'left', name: 'Alice' }, 3000)
        chat.requeue(batch)
        expect(chat.takeUnsaved().map(l => l.at)).toEqual([1000, 2000, 3000])
    })
})
