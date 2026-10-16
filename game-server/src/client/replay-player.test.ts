import { describe, expect, test } from 'bun:test'
import type { ServerMessage } from '../protocol.ts'
import type { Replay, ReplayFrame } from '../replay.ts'
import { LEAD_IN_MS, ReplayPlayer } from './replay-player.ts'

const snapshot = (elapsedMs: number): ServerMessage & { type: 'snapshot' } => ({
    type: 'snapshot',
    elapsedMs,
    players: [],
    items: [],
    portals: [],
    holderId: 1,
    shake: 0,
})

const results: ServerMessage & { type: 'results' } = {
    type: 'results',
    results: { mode: 'survival', survivorIds: [2], eliminated: [{ id: 1, atMs: 100 }], stats: [] },
    endsInMs: 12_000,
}

/** A countdown at 0, snapshots every 50 ms from 6 s to 6.2 s, a boom at 6.1 s, results at 6.2 s. */
function replay(): Replay {
    const frames: ReplayFrame[] = [
        [
            0,
            {
                type: 'countdown',
                arena: {} as never,
                playerIds: [1, 2],
                durationMs: 60_000,
                startsInMs: 6000,
            },
        ],
        [6000, snapshot(0)],
        [6050, snapshot(50)],
        [6100, snapshot(100)],
        [6100, { type: 'boom', playerId: 1 }],
        [6150, snapshot(150)],
        [6200, snapshot(200)],
        [6200, results],
    ]
    return {
        version: 1,
        meta: { mode: 'survival', theme: 'open_space', durationMs: 60_000, roster: [] },
        frames,
    }
}

describe('ReplayPlayer', () => {
    test('opens just before play starts, and knows its end and its booms', () => {
        const player = new ReplayPlayer(replay())

        expect(player.startMs).toBe(6000 - LEAD_IN_MS)
        expect(player.currentMs).toBe(player.startMs)
        expect(player.endMs).toBe(6200)
        expect(player.booms).toEqual([{ atMs: 6100, playerId: 1 }])
        expect(player.countdown?.playerIds).toEqual([1, 2])
    })

    test('hands out what falls due, in order, only while playing', () => {
        const player = new ReplayPlayer(replay())
        expect(player.advance(LEAD_IN_MS)).toEqual([])

        player.play()
        expect(player.advance(LEAD_IN_MS)).toEqual([snapshot(0)])
        expect(player.advance(100).map(m => m.type)).toEqual(['snapshot', 'snapshot', 'boom'])
    })

    test('runs at half and double speed', () => {
        const half = new ReplayPlayer(replay())
        half.seek(6000)
        half.speed = 0.5
        half.play()
        half.advance(100)
        expect(half.currentMs).toBe(6050)

        const double = new ReplayPlayer(replay())
        double.seek(6000)
        double.speed = 2
        double.play()
        expect(double.advance(50).map(m => m.type)).toEqual(['snapshot', 'snapshot', 'boom'])
    })

    test('stops at the end, and playing again starts over', () => {
        const player = new ReplayPlayer(replay())
        player.play()
        const all = player.advance(60_000)

        expect(all.at(-1)).toEqual(results)
        expect(player.ended).toBe(true)
        expect(player.playing).toBe(false)

        player.play()
        expect(player.currentMs).toBe(player.startMs)
        expect(player.advance(LEAD_IN_MS)).toEqual([snapshot(0)])
    })

    test('seeking lands on the newest snapshot and skips what lies between', () => {
        const player = new ReplayPlayer(replay())

        expect(player.seek(6120)).toEqual({ snapshot: snapshot(100), results: null })
        player.play()
        // The boom at 6.1 s is behind us: it never fires.
        expect(player.advance(30).map(m => m.type)).toEqual(['snapshot'])

        expect(player.seek(5000)).toEqual({ snapshot: null, results: null })
        expect(player.seek(99_999)).toEqual({ snapshot: snapshot(200), results })
        expect(player.currentMs).toBe(6200)
        expect(player.seek(-5).snapshot).toBeNull()
        expect(player.currentMs).toBe(player.startMs)
    })
})
