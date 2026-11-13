import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LaravelClient } from '../laravel.ts'
import type { MatchResult } from './lobby.ts'

/**
 * What the game server sends the Hub when an office FPS match ends: the request
 * OfficeFpsInternalController validates (tests/Feature/OfficeFpsStatsTest.php posts the same shape).
 */

let received: { path: string; secret: string | null; body: unknown } | null = null
let server: ReturnType<typeof Bun.serve>

beforeAll(() => {
    server = Bun.serve({
        port: 0,
        async fetch(request) {
            received = {
                path: new URL(request.url).pathname,
                secret: request.headers.get('X-Internal-Secret'),
                body: await request.json(),
            }
            return Response.json({ id: 1 }, { status: 201 })
        },
    })
})

afterAll(() => {
    server.stop(true)
})

const result: MatchResult = {
    startedAt: Date.UTC(2026, 10, 3, 10, 0, 0),
    endedAt: Date.UTC(2026, 10, 3, 10, 5, 0),
    rules: { map: 'office', mode: 'tdm', fragLimit: 15, minutes: 5 },
    playerCount: 3,
    players: [
        {
            playerId: 36,
            name: 'Ann',
            place: 1,
            won: true,
            team: 'blue',
            zoneMs: 4200,
            pickups: 2,
            kills: 3,
            deaths: 1,
            headshots: 1,
            damage: 340,
            shots: 40,
            hits: 17,
            meleeKills: 1,
            backstabs: 1,
            bestStreak: 2,
            playedMs: 299_999.6,
            left: false,
        },
    ],
    kills: [{ killerId: 36, victimId: null, weapon: 'stapler', headshot: false, backstab: true, atMs: 1234.4 }],
}

describe('saving a match in the Hub', () => {
    test('posts it in the shape the Hub validates, with the shared secret', async () => {
        await new LaravelClient(`http://127.0.0.1:${server.port}`, 'the-secret').postFpsResults(result)

        expect(received!.path).toBe('/internal/office-fps/results')
        expect(received!.secret).toBe('the-secret')
        expect(received!.body).toEqual({
            started_at: '2026-11-03T10:00:00.000Z',
            ended_at: '2026-11-03T10:05:00.000Z',
            mode: 'tdm',
            map: 'office',
            frag_limit: 15,
            minutes: 5,
            player_count: 3,
            players: [
                {
                    player_id: 36,
                    place: 1,
                    won: true,
                    team: 'blue',
                    zone_ms: 4200,
                    pickups: 2,
                    kills: 3,
                    deaths: 1,
                    headshots: 1,
                    damage: 340,
                    shots: 40,
                    hits: 17,
                    melee_kills: 1,
                    backstabs: 1,
                    best_streak: 2,
                    // Whole milliseconds: the Hub takes integers.
                    played_ms: 300_000,
                    left: false,
                },
            ],
            kills: [
                { killer_id: 36, victim_id: null, weapon: 'stapler', headshot: false, backstab: true, at_ms: 1234 },
            ],
        })
    })
})
