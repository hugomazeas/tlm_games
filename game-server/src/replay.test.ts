import { describe, expect, test } from 'bun:test'
import type { ServerMessage } from './protocol.ts'
import { REPLAY_VERSION, ReplayRecorder, type ReplayMeta } from './replay.ts'

const META: ReplayMeta = {
    mode: 'survival',
    theme: 'open_space',
    durationMs: 60_000,
    roster: [
        { id: 1, name: 'Ana', avatarUrl: null },
        { id: -1, name: 'Gaétan', avatarUrl: '/bot.svg', bot: true },
    ],
}

const snapshot = (elapsedMs: number): Extract<ServerMessage, { type: 'snapshot' }> => ({
    type: 'snapshot',
    elapsedMs,
    players: [],
    items: [],
    holderId: 1,
    shake: 0,
})

describe('ReplayRecorder', () => {
    test('stamps game messages with the time since the countdown, and carries the meta', () => {
        const recorder = new ReplayRecorder(META, 1000)
        recorder.record({ type: 'pass', from: 1, to: -1 }, 7000)
        recorder.record(snapshot(50), 7050)

        expect(recorder.finish()).toEqual({
            version: REPLAY_VERSION,
            meta: META,
            frames: [
                [6000, { type: 'pass', from: 1, to: -1 }],
                [6050, snapshot(50)],
            ],
        })
    })

    test('leaves lobby and housekeeping messages out', () => {
        const recorder = new ReplayRecorder(META, 0)
        recorder.record({ type: 'office', session: null }, 10)
        recorder.record({ type: 'welcome', player: null, build: 'x' }, 10)
        recorder.record({ type: 'error', code: 'BAD_MESSAGE' }, 10)
        recorder.record({ type: 'emote', playerId: 1, emote: '🔥' }, 10)
        recorder.record({ type: 'replayReady', gameId: 3 }, 10)

        expect(recorder.finish()?.frames).toEqual([])
    })

    test('a recording past its size limit is dropped', () => {
        const recorder = new ReplayRecorder(META, 0, 200)
        recorder.record(snapshot(50), 50)
        expect(recorder.overflowed).toBe(false)
        for (let i = 0; i < 5; i++) recorder.record(snapshot(i), i)

        expect(recorder.overflowed).toBe(true)
        expect(recorder.finish()).toBeNull()
    })
})
