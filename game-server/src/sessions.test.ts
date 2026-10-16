import { beforeEach, describe, expect, test } from 'bun:test'
import type { TrainedPolicy } from './ai/policy.ts'
import { BOT_NAMES, botAvatarUrl } from './bots.ts'
import { MAX_PLAYERS, parseClientMessage, type PlayerInfo, type ServerMessage } from './protocol.ts'
import {
    COUNTDOWN_MS,
    EMOTE_COOLDOWN_MS,
    type GameResult,
    RECONNECT_GRACE_MS,
    RESULTS_MS,
    SessionManager,
    TICK_MS,
} from './sessions.ts'
import { DEFAULT_LOOK, isValidLook } from './cosmetics.ts'
import { isReplayMessage, REPLAY_VERSION, type Replay } from './replay.ts'
import { EFFECTS, FIRST_ITEM_MS } from './sim/items.ts'
import { createRng } from './sim/rng.ts'

const policy = (await Bun.file(new URL('./ai/trained-policy.json', import.meta.url)).json()) as TrainedPolicy

const OFFICE = 1
const OTHER_OFFICE = 2

interface FakeConn {
    id: string
    inbox: ServerMessage[]
    send(message: ServerMessage): void
}

let now: number
let opened: Array<{ officeId: number; hostPlayerId: number }>
let results: GameResult[]
let manager: SessionManager
let connCount: number

beforeEach(() => {
    now = 1_000_000
    opened = []
    results = []
    connCount = 0
    manager = new SessionManager({
        build: 'build-1',
        now: () => now,
        rng: createRng(42),
        nextSeed: () => 1234,
        onOpened: (officeId, hostPlayerId) => opened.push({ officeId, hostPlayerId }),
        onResults: result => results.push(result),
    })
})

function connect(player: PlayerInfo | null, officeId = OFFICE): FakeConn {
    const conn: FakeConn = {
        id: `c${++connCount}`,
        inbox: [],
        send(message) {
            this.inbox.push(message)
        },
    }
    manager.connect(conn, officeId, player)

    return conn
}

const alice = { id: 1, name: 'Alice', avatarUrl: null }
const bob = { id: 2, name: 'Bob', avatarUrl: null }
const carol = { id: 3, name: 'Carol', avatarUrl: null }
const dave = { id: 4, name: 'Dave', avatarUrl: null }

function send(conn: FakeConn, raw: object) {
    const message = parseClientMessage(JSON.stringify(raw))
    if (!message) throw new Error(`invalid test message ${JSON.stringify(raw)}`)
    manager.handle(conn.id, message)
}

function advance(ms: number) {
    for (let t = 0; t < ms; t += TICK_MS) {
        now += TICK_MS
        manager.tick()
    }
}

function last<T extends ServerMessage['type']>(
    conn: FakeConn,
    type: T
): Extract<ServerMessage, { type: T }> | undefined {
    return conn.inbox.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1)
}

function errors(conn: FakeConn) {
    return conn.inbox.filter(m => m.type === 'error').map(m => (m.type === 'error' ? m.code : null))
}

/** Alice hosts, Bob and Carol join. */
function lobbyOfThree() {
    const a = connect(alice)
    const b = connect(bob)
    const c = connect(carol)
    send(a, { type: 'open' })
    send(b, { type: 'join' })
    send(c, { type: 'join' })

    return { a, b, c }
}

describe('connecting', () => {
    test('every tab is told which browser bundle is current, so an old one can reload', () => {
        expect(connect(alice).inbox[0]).toEqual({ type: 'welcome', player: alice, build: 'build-1' })
        expect(connect(null).inbox[0]).toEqual({ type: 'welcome', player: null, build: 'build-1' })
    })
})

describe('opening and joining', () => {
    test('opening makes you host and announces it once', () => {
        const a = connect(alice)
        const watcher = connect(null)
        send(a, { type: 'open' })

        expect(last(watcher, 'office')?.session).toMatchObject({ hostId: 1, phase: 'lobby', players: [{ id: 1 }] })
        expect(opened).toEqual([{ officeId: OFFICE, hostPlayerId: 1 }])
    })

    test('the lobby carries each player photo, so browsers can draw it', () => {
        const a = connect({ ...alice, avatarUrl: '/storage/avatars/1-abc.jpg' })
        const watcher = connect(null)
        send(a, { type: 'open' })

        expect(last(watcher, 'office')?.session?.players).toEqual([
            { id: 1, name: 'Alice', avatarUrl: '/storage/avatars/1-abc.jpg', away: false },
        ])
    })

    test('one session per office', () => {
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(b, { type: 'open' })

        expect(errors(b)).toEqual(['SESSION_EXISTS'])
    })

    test('another office is unaffected', () => {
        const a = connect(alice)
        const elsewhere = connect(bob, OTHER_OFFICE)
        send(a, { type: 'open' })

        expect(last(elsewhere, 'office')?.session).toBeNull()
        send(elsewhere, { type: 'open' })
        expect(errors(elsewhere)).toEqual([])
    })

    test('a watcher without a player cannot open or join', () => {
        const watcher = connect(null)
        send(watcher, { type: 'open' })

        expect(errors(watcher)).toEqual(['PICK_A_PLAYER'])
    })

    test('the lobby holds 12 players at most', () => {
        const host = connect({ id: 100, name: 'Host', avatarUrl: null })
        send(host, { type: 'open' })
        for (let id = 101; id < 112; id++) send(connect({ id, name: `P${id}`, avatarUrl: null }), { type: 'join' })
        const thirteenth = connect({ id: 200, name: 'Late', avatarUrl: null })
        send(thirteenth, { type: 'join' })

        expect(errors(thirteenth)).toEqual(['LOBBY_FULL'])
    })
})

describe('starting', () => {
    test('only the host can start', () => {
        const { b } = lobbyOfThree()
        send(b, { type: 'start', durationMin: 2, theme: 'random' })

        expect(errors(b)).toEqual(['NOT_HOST'])
    })

    test('it takes three players', () => {
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(b, { type: 'join' })
        send(a, { type: 'start', durationMin: 2, theme: 'random' })

        expect(errors(a)).toEqual(['NOT_ENOUGH_PLAYERS'])
    })

    test('start counts down, then plays and streams snapshots to everyone in the office', () => {
        const { a } = lobbyOfThree()
        const watcher = connect(null)
        send(a, { type: 'start', durationMin: 1, theme: 'ice_rink' })

        const countdown = last(watcher, 'countdown')
        expect(countdown?.arena.theme).toBe('ice_rink')
        expect(countdown?.playerIds).toEqual([1, 2, 3])
        expect(countdown?.durationMs).toBe(60_000)

        advance(COUNTDOWN_MS - TICK_MS)
        expect(last(watcher, 'snapshot')).toBeUndefined()

        advance(2 * TICK_MS)
        expect(last(watcher, 'office')?.session?.phase).toBe('playing')
        expect(last(watcher, 'snapshot')?.players).toHaveLength(3)
    })

    test('the fuse never leaves the server', () => {
        const { a } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        advance(COUNTDOWN_MS + 70_000)

        for (const message of a.inbox) {
            expect(JSON.stringify(message)).not.toMatch(/fuse/i)
        }
    })
})

describe('a whole game', () => {
    test('ends, reports results, and returns to the lobby for another round', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        advance(COUNTDOWN_MS + 60_000 + TICK_MS)

        // Two booms can end it early, so only "it ended by now" is certain.
        expect(last(b, 'results')).toBeDefined()
        expect(b.inbox.some(m => m.type === 'office' && m.session?.phase === 'results')).toBe(true)
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({ officeId: OFFICE, seed: 1234, durationSeconds: 60 })
        expect(results[0]?.players.map(p => p.playerId).sort()).toEqual([1, 2, 3])

        advance(RESULTS_MS)
        expect(last(b, 'office')?.session?.phase).toBe('lobby')

        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        expect(errors(a)).toEqual([])
        expect(last(b, 'office')?.session?.phase).toBe('countdown')
    })

    test('positions: survivors share first, then latest out', () => {
        const { a } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 5, theme: 'random' })
        advance(COUNTDOWN_MS)
        send(a, { type: 'leave' })
        advance(TICK_MS)
        advance(5 * 60_000)

        const result = results[0]
        expect(result).toBeDefined()
        const alicePos = result?.players.find(p => p.playerId === 1)
        expect(alicePos?.survived).toBe(false)
        const best = Math.min(...(result?.players.map(p => p.position) ?? []))
        expect(best).toBe(1)
        expect(alicePos?.position).toBeGreaterThan(1)
    })

    test('items show up in snapshots, and taking one is announced to the office', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 5, theme: 'open_space' })
        advance(COUNTDOWN_MS + FIRST_ITEM_MS + TICK_MS)

        const item = last(b, 'snapshot')?.items[0]
        if (!item) throw new Error('no item after the first drop')
        expect([...EFFECTS, 'mystery']).toContain(item.kind)
        expect(item.expiresInMs).toBeGreaterThan(0)

        // Alice homes in on it, sidestepping for a moment whenever a wall stops her getting closer.
        let best = Number.POSITIVE_INFINITY
        let stuckFor = 0
        let sidestep = 0
        for (let t = 0; t < 20_000 && !last(b, 'pickup'); t += TICK_MS) {
            const me = last(a, 'snapshot')?.players.find(p => p.id === 1)
            const target = last(a, 'snapshot')?.items.find(i => i.id === item.id)
            if (!me || !target) break
            const dx = target.x - me.x
            const dy = target.y - me.y
            const length = Math.hypot(dx, dy) || 1
            if (length < best - 0.05) {
                best = length
                stuckFor = 0
            } else if ((stuckFor += TICK_MS) >= 400) {
                sidestep = 600
                stuckFor = 0
            }
            if (sidestep > 0) {
                sidestep -= TICK_MS
                send(a, { type: 'input', dx: -dy / length, dy: dx / length })
            } else {
                send(a, { type: 'input', dx: dx / length, dy: dy / length })
            }
            advance(TICK_MS)
        }

        const pickup = last(b, 'pickup')
        if (!pickup) throw new Error('nobody took the item')
        expect(pickup.item).toBe(item.kind)
        expect(EFFECTS).toContain(pickup.effect)
        expect(last(b, 'snapshot')?.items.some(i => i.id === item.id)).toBe(false)
    })

    test('King of the Potato: scores stream live, and the longest reign wins', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'open_space', mode: 'king' })
        expect(last(b, 'office')?.session?.settings.mode).toBe('king')

        advance(COUNTDOWN_MS + 30_000)
        const snapshot = last(b, 'snapshot')
        if (!snapshot) throw new Error('no snapshot')
        expect(snapshot.shake).toBe(0)
        expect(snapshot.players.reduce((sum, p) => sum + p.holdMs, 0)).toBeGreaterThan(29_000)

        advance(30_000 + TICK_MS)
        const final = last(b, 'results')?.results
        if (!final) throw new Error('no results')
        expect(final.mode).toBe('king')
        expect(final.eliminated).toEqual([])
        const best = Math.max(...final.stats.map(s => s.holdMs))
        expect(final.survivorIds.length).toBeGreaterThan(0)
        for (const id of final.survivorIds) expect(final.stats.find(s => s.id === id)?.holdMs).toBe(best)

        const stored = results[0]
        expect(stored?.mode).toBe('king')
        const kings = stored?.players.filter(p => p.position === 1) ?? []
        expect(kings.map(p => p.playerId).sort()).toEqual([...final.survivorIds].sort())
        expect(kings.every(p => p.survived)).toBe(true)
        // Everyone else ranks by time held.
        const byPosition = [...(stored?.players ?? [])].sort((x, y) => x.position - y.position)
        for (const [i, p] of byPosition.slice(1).entries()) {
            expect(p.holdMs).toBeLessThanOrEqual(byPosition[i]?.holdMs ?? 0)
        }
    })

    test('a start without a mode plays the classic game', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random' })

        expect(last(b, 'office')?.session?.settings.mode).toBe('survival')
    })

    test('inputs steer your own avatar', () => {
        const { a } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 5, theme: 'open_space' })
        advance(COUNTDOWN_MS + TICK_MS)
        const before = last(a, 'snapshot')?.players.find(p => p.id === 1)
        send(a, { type: 'input', dx: 1, dy: 0 })
        advance(2500)
        const after = last(a, 'snapshot')?.players.find(p => p.id === 1)

        if (!before || !after) throw new Error('no snapshots')
        // A freeze lasts 2 s at most, so 2.5 s of input always gets you moving.
        expect(Math.abs(after.x - before.x)).toBeGreaterThan(0.1)
    })
})

describe('hosts and leaving', () => {
    test('the host leaving hands hosting to the next who joined', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'leave' })

        expect(last(b, 'office')?.session?.hostId).toBe(2)
    })

    test('only the host can close; closing ends the session', () => {
        const { a, b } = lobbyOfThree()
        send(b, { type: 'close' })
        expect(errors(b)).toEqual(['NOT_HOST'])

        send(a, { type: 'close' })
        expect(last(b, 'office')?.session).toBeNull()
    })

    test('the last player leaving closes the session', () => {
        const a = connect(alice)
        send(a, { type: 'open' })
        send(a, { type: 'leave' })

        expect(last(a, 'office')?.session).toBeNull()
    })

    test('a dropped tab has a few seconds to come back to the lobby', () => {
        const { b } = lobbyOfThree()
        manager.disconnect(b.id)
        const watcher = connect(null)
        expect(last(watcher, 'office')?.session?.players.find(p => p.id === 2)?.away).toBe(true)

        advance(RECONNECT_GRACE_MS - 1000)
        const back = connect(bob)
        expect(last(back, 'office')?.session?.players.find(p => p.id === 2)?.away).toBe(false)
    })

    test('a tab gone past the grace period is removed', () => {
        const { b } = lobbyOfThree()
        manager.disconnect(b.id)
        advance(RECONNECT_GRACE_MS + TICK_MS)
        const watcher = connect(null)

        expect(last(watcher, 'office')?.session?.players.map(p => p.id)).toEqual([1, 3])
    })

    test('leaving during the countdown knocks you out of that game', () => {
        const { a, b } = lobbyOfThree()
        const d = connect(dave)
        send(d, { type: 'join' })
        send(a, { type: 'start', durationMin: 5, theme: 'random' })
        send(b, { type: 'leave' })
        advance(COUNTDOWN_MS + TICK_MS)

        expect(last(a, 'snapshot')?.players.find(p => p.id === 2)?.out).toBe(true)
    })

    test('dropping mid-game knocks you out', () => {
        const { a, c } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 5, theme: 'random' })
        advance(COUNTDOWN_MS + TICK_MS)
        manager.disconnect(c.id)
        advance(TICK_MS)

        expect(last(a, 'snapshot')?.players.find(p => p.id === 3)?.out).toBe(true)
    })
})

describe('replays', () => {
    const unzip = (bytes: Uint8Array<ArrayBuffer> | null | undefined) =>
        JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bytes ?? new Uint8Array()))) as Replay

    test('a finished game hands its recording, gzipped, to the Hub with the results', () => {
        const { a, b } = lobbyOfThree()
        playToResults(a)

        const replay = unzip(results[0]?.replay)
        expect(replay.version).toBe(REPLAY_VERSION)
        expect(replay.meta).toMatchObject({ mode: 'survival', durationMs: 60_000 })
        expect(replay.meta.roster.map(p => p.name)).toEqual(['Alice', 'Bob', 'Carol'])

        const types = replay.frames.map(([, message]) => message.type)
        expect(types[0]).toBe('countdown')
        expect(types.at(-1)).toBe('results')
        expect(types).toContain('snapshot')
        expect(types).not.toContain('office')
        // Exactly what the room saw, in order, timed from the countdown.
        const seen: ServerMessage[] = b.inbox.filter(isReplayMessage)
        expect(replay.frames.map(([, message]): ServerMessage => message)).toEqual(seen.slice(-replay.frames.length))
        expect(replay.frames[0]?.[0]).toBe(0)
        expect(replay.frames.at(-1)?.[0]).toBeGreaterThan(COUNTDOWN_MS)
    })

    test('each game gets its own recording', () => {
        const { a } = lobbyOfThree()
        playToResults(a)
        advance(RESULTS_MS)
        playToResults(a)

        expect(results).toHaveLength(2)
        const second = unzip(results[1]?.replay)
        expect(second.frames.filter(([, m]) => m.type === 'countdown')).toHaveLength(1)
        expect(second.frames[0]?.[0]).toBe(0)
    })

    test('once saved, the office is told the replay is ready', () => {
        const { a, b } = lobbyOfThree()
        const watcher = connect(null)
        playToResults(a)
        manager.replayReady(OFFICE, 77)

        expect(last(b, 'replayReady')).toEqual({ type: 'replayReady', gameId: 77 })
        expect(last(watcher, 'replayReady')?.gameId).toBe(77)
    })
})

describe('looks', () => {
    let refreshed: number[]
    beforeEach(() => {
        refreshed = []
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: result => results.push(result),
            refreshPlayer: playerId => refreshed.push(playerId),
        })
    })

    const pumpkin = { ...DEFAULT_LOOK, trail: 'fire', hat: 'top' }

    test('a lobby member who changed their look gets fetched again, and the lobby shows it', () => {
        const { a, b } = lobbyOfThree()
        send(b, { type: 'refreshLook' })
        expect(refreshed).toEqual([2])

        manager.updatePlayer({ ...bob, look: pumpkin })
        expect(last(a, 'office')?.session?.players.find(p => p.id === 2)?.look).toEqual(pumpkin)
    })

    test('nobody outside the lobby, and nothing during a game, refreshes', () => {
        const { a, b } = lobbyOfThree()
        const outsider = connect(dave)
        send(outsider, { type: 'refreshLook' })
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        send(b, { type: 'refreshLook' })
        expect(refreshed).toEqual([])

        // A fetch that lands after the start leaves the game's look alone.
        manager.updatePlayer({ ...bob, look: pumpkin })
        expect(last(a, 'office')?.session?.players.find(p => p.id === 2)?.look).toBeUndefined()
    })

    test('a replay keeps everyone’s look', () => {
        const a = connect({ ...alice, look: pumpkin })
        const b = connect(bob)
        const c = connect(carol)
        send(a, { type: 'open' })
        send(b, { type: 'join' })
        send(c, { type: 'join' })
        playToResults(a)

        const replay = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(results[0]!.replay!))) as Replay
        expect(replay.meta.roster.find(p => p.id === 1)?.look).toEqual(pumpkin)
    })
})

describe('the host’s picks', () => {
    const picks = { durationMin: 4, theme: 'gym', mode: 'king' } as const

    test('reach the lobby as they change, and survive AIs, joins and leaves', () => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: () => {},
            botPolicy: policy,
        })
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(a, { type: 'settings', ...picks })
        expect(last(b, 'office')?.session?.settings).toEqual(picks)

        send(a, { type: 'addBot' })
        send(b, { type: 'join' })
        send(b, { type: 'leave' })
        expect(last(a, 'office')?.session?.settings).toEqual(picks)
    })

    test('are the host’s alone, and only in the lobby', () => {
        const { a, b } = lobbyOfThree()
        send(b, { type: 'settings', ...picks })
        expect(errors(b)).toEqual(['NOT_HOST'])

        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        send(a, { type: 'settings', ...picks })
        expect(errors(a)).toEqual(['NOT_IN_LOBBY'])
        expect(last(a, 'office')?.session?.settings.mode).toBe('survival')
    })
})

describe('watchers', () => {
    const watchers = (conn: FakeConn) => last(conn, 'watchers')

    test('whoever has no seat watches: named once each, guests counted', () => {
        const a = connect(alice)
        send(a, { type: 'open' })
        const guest1 = connect(null)
        connect(null)
        connect(bob)
        connect(bob)

        expect(watchers(guest1)).toEqual({ type: 'watchers', named: [bob], guests: 2 })
    })

    test('joining takes you off the list, leaving puts you back', () => {
        const a = connect(alice)
        send(a, { type: 'open' })
        const b = connect(bob)
        expect(watchers(a)?.named.map(p => p.id)).toEqual([2])

        send(b, { type: 'join' })
        expect(watchers(a)?.named).toEqual([])
        send(b, { type: 'leave' })
        expect(watchers(a)?.named.map(p => p.id)).toEqual([2])
    })

    test('a closed tab leaves the list, and each office has its own', () => {
        const a = connect(alice)
        const guest = connect(null)
        connect(null, OTHER_OFFICE)
        expect(watchers(a)?.guests).toBe(1)

        manager.disconnect(guest.id)
        // No lobby open: Alice has no seat, so she's watching too.
        expect(watchers(a)).toEqual({ type: 'watchers', named: [alice], guests: 0 })
    })
})

describe('chat', () => {
    const lines = (conn: FakeConn) => conn.inbox.flatMap(m => (m.type === 'chat' ? [m.line] : []))
    const events = (conn: FakeConn) => lines(conn).flatMap(l => (l.event ? [l.event] : []))

    test('named people talk to the whole office; guests are asked to pick a name', () => {
        const a = connect(alice)
        const guest = connect(null)
        const elsewhere = connect(carol, OTHER_OFFICE)
        send(a, { type: 'chat', body: '  gg everyone ' })

        expect(lines(guest).at(-1)).toMatchObject({
            kind: 'message',
            author: { id: 1, name: 'Alice' },
            body: 'gg everyone',
        })
        expect(lines(elsewhere)).toEqual([])

        send(guest, { type: 'chat', body: 'hi' })
        expect(errors(guest)).toEqual(['PICK_A_PLAYER'])
    })

    test('too many messages at once are refused', () => {
        const a = connect(alice)
        for (let i = 0; i < 6; i++) send(a, { type: 'chat', body: `spam ${i}` })

        expect(lines(a).filter(l => l.kind === 'message')).toHaveLength(5)
        expect(errors(a)).toEqual(['SLOW_DOWN'])
    })

    test('the lobby narrates itself', () => {
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(b, { type: 'join' })
        send(b, { type: 'leave' })

        expect(events(a)).toEqual([
            { type: 'opened', name: 'Alice' },
            { type: 'joined', name: 'Bob' },
            { type: 'left', name: 'Bob' },
        ])
    })

    test('a game narrates its start and its results, then the replay, and nothing in between', () => {
        const { a } = lobbyOfThree()
        playToResults(a)
        manager.replayReady(OFFICE, 12)

        expect(events(a).slice(-3)).toEqual([
            { type: 'started', mode: 'survival', theme: expect.any(String), players: 3 },
            { type: 'results', mode: 'survival', winners: expect.any(Array) },
            { type: 'replay', gameId: 12 },
        ])
    })

    test('AIs sit down and get up without a word', () => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: () => {},
            botPolicy: policy,
        })
        const a = connect(alice)
        send(a, { type: 'open' })
        send(a, { type: 'addBot' })
        send(a, { type: 'removeBot', playerId: -1 })

        expect(events(a)).toEqual([{ type: 'opened', name: 'Alice' }])
    })

    test('a newcomer gets the lines so far, and the saved history once it loads', () => {
        const loads: number[] = []
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: () => {},
            loadChat: officeId => loads.push(officeId),
        })
        const a = connect(alice)
        connect(bob)
        send(a, { type: 'chat', body: 'first!' })
        expect(loads).toEqual([OFFICE])

        const late = connect(carol)
        expect(last(late, 'chatHistory')?.lines.map(l => l.body)).toEqual(['first!'])

        manager.chatHistoryLoaded(OFFICE, [{ at: 1, kind: 'event', event: { type: 'opened', name: 'Dave' } }])
        expect(last(late, 'chatHistory')?.lines.map(l => l.body ?? l.event?.type)).toEqual(['opened', 'first!'])
    })

    test('lines wait to be saved; a failed save puts them back', () => {
        const a = connect(alice)
        send(a, { type: 'chat', body: 'saved?' })

        const batch = manager.takeUnsavedChat()
        expect(batch).toMatchObject([{ officeId: OFFICE, kind: 'message', playerId: 1, body: 'saved?' }])
        expect(manager.takeUnsavedChat()).toEqual([])
        manager.requeueChat(batch)
        expect(manager.takeUnsavedChat()).toHaveLength(1)
    })
})

describe('Infection', () => {
    beforeEach(() => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: result => results.push(result),
            botPolicy: policy,
            botNameRng: createRng(7),
        })
    })

    test('needs three people: AIs sit out and never count', () => {
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(b, { type: 'join' })
        send(a, { type: 'addBot' })
        send(a, { type: 'start', durationMin: 1, theme: 'random', mode: 'infection' })
        expect(errors(a)).toEqual(['NOT_ENOUGH_PLAYERS'])

        const c = connect(carol)
        send(c, { type: 'join' })
        send(a, { type: 'start', durationMin: 1, theme: 'gym', mode: 'infection' })
        const countdown = last(a, 'countdown')
        expect(countdown?.playerIds.sort()).toEqual([1, 2, 3])
        // Always the big arena, whatever the count.
        expect([countdown?.arena.width, countdown?.arena.height]).toEqual([80, 50])
    })

    test('patient zero dropping out hands the infection to someone, and the game goes on', () => {
        const { a, b, c } = lobbyOfThree()
        const d = connect(dave)
        send(d, { type: 'join' })
        send(a, { type: 'start', durationMin: 1, theme: 'random', mode: 'infection' })
        advance(COUNTDOWN_MS + TICK_MS)
        const zeroId = last(a, 'snapshot')?.players.find(p => p.infected)?.id
        const zeroConn = [a, b, c, d][(zeroId ?? 1) - 1]!
        manager.disconnect(zeroConn.id)
        advance(TICK_MS)

        const watcher = zeroConn === a ? b : a
        const handedTo = last(watcher, 'patientZero')?.playerId
        expect(handedTo).toBeDefined()
        expect(handedTo).not.toBe(zeroId)
        expect(last(watcher, 'office')?.session?.phase).toBe('playing')
        expect(last(watcher, 'snapshot')?.players.find(p => p.id === handedTo)?.infected).toBe(true)
    })

    test('snapshots say who is infected; the game is ranked clean first, patient zero last', () => {
        const { a } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random', mode: 'infection' })
        advance(COUNTDOWN_MS + TICK_MS)
        expect(last(a, 'snapshot')?.players.filter(p => p.infected)).toHaveLength(1)
        expect(last(a, 'snapshot')?.portals).toEqual([])

        playToResults(a)
        const result = results[0]
        expect(result?.mode).toBe('infection')
        const zero = result?.players.find(p => p.eliminatedAtMs === 0)
        expect(zero?.survived).toBe(false)
        expect(zero?.position).toBe(Math.max(...(result?.players.map(p => p.position) ?? [])))
        expect(result?.players.some(p => p.survived && p.position === 1)).toBe(true)
    })
})

/** Plays a one-minute game through to the results screen (two booms can end it early). */
function playToResults(conn: FakeConn) {
    send(conn, { type: 'start', durationMin: 1, theme: 'random' })
    for (let t = 0; t < COUNTDOWN_MS + 60_000 + TICK_MS; t += TICK_MS) {
        if (last(conn, 'office')?.session?.phase === 'results') break
        advance(TICK_MS)
    }
    expect(last(conn, 'office')?.session?.phase).toBe('results')
}

function toResults() {
    const players = lobbyOfThree()
    playToResults(players.a)

    return players
}

describe('back to the lobby', () => {
    test('the host ends the results screen for the whole office', () => {
        const { a, b } = toResults()
        const watcher = connect(null)

        send(a, { type: 'backToLobby' })

        expect(errors(a)).toEqual([])
        expect(last(b, 'office')?.session?.phase).toBe('lobby')
        expect(last(watcher, 'office')?.session?.phase).toBe('lobby')
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        expect(last(b, 'office')?.session?.phase).toBe('countdown')
    })

    test('nobody else can', () => {
        const { b } = toResults()

        send(b, { type: 'backToLobby' })

        expect(errors(b)).toEqual(['NOT_HOST'])
        expect(last(b, 'office')?.session?.phase).toBe('results')
    })

    test('does nothing outside the results screen', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        advance(COUNTDOWN_MS + TICK_MS)

        send(a, { type: 'backToLobby' })

        expect(errors(a)).toEqual([])
        expect(last(b, 'office')?.session?.phase).toBe('playing')
    })

    test('the timer still ends it when the host does not', () => {
        const { b } = toResults()
        expect(last(b, 'results')?.endsInMs).toBe(RESULTS_MS)
        advance(RESULTS_MS)

        expect(last(b, 'office')?.session?.phase).toBe('lobby')
    })

    test('parses', () => {
        expect(parseClientMessage(JSON.stringify({ type: 'backToLobby' }))).toEqual({ type: 'backToLobby' })
    })
})

describe('end-of-game emotes', () => {
    test('the countdown lasts six seconds and the results screen twelve', () => {
        expect(COUNTDOWN_MS).toBe(6000)
        expect(RESULTS_MS).toBe(12_000)
    })

    test('a player from the game reacts on the results screen, and the whole office sees it', () => {
        const { a, c } = toResults()
        const watcher = connect(null)

        send(c, { type: 'emote', emote: '🔥' })

        expect(last(watcher, 'emote')).toEqual({ type: 'emote', playerId: 3, emote: '🔥' })
        expect(last(a, 'emote')).toEqual({ type: 'emote', playerId: 3, emote: '🔥' })
    })

    test('one emote per player every 700 ms', () => {
        const { a, b } = toResults()

        send(a, { type: 'emote', emote: '😂' })
        send(a, { type: 'emote', emote: '💀' })
        send(b, { type: 'emote', emote: '👏' })
        expect(b.inbox.filter(m => m.type === 'emote')).toHaveLength(2)

        advance(EMOTE_COOLDOWN_MS)
        send(a, { type: 'emote', emote: '💀' })
        expect(last(b, 'emote')).toEqual({ type: 'emote', playerId: 1, emote: '💀' })
    })

    test('nobody outside the game, and nobody before the results, can emote', () => {
        const { a, b } = lobbyOfThree()
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        advance(COUNTDOWN_MS + TICK_MS)
        send(b, { type: 'emote', emote: '🥔' })

        advance(60_000)
        const late = connect(dave)
        send(late, { type: 'join' })
        send(late, { type: 'emote', emote: '🫡' })

        expect(a.inbox.filter(m => m.type === 'emote')).toEqual([])
    })

    test('every results screen takes emotes again', () => {
        const { a, b } = toResults()
        send(a, { type: 'emote', emote: '😭' })
        advance(RESULTS_MS)
        playToResults(a)

        send(a, { type: 'emote', emote: '🤬' })
        expect(last(b, 'emote')).toEqual({ type: 'emote', playerId: 1, emote: '🤬' })
    })

    test('only the eight emotes go through', () => {
        expect(parseClientMessage(JSON.stringify({ type: 'emote', emote: '🔥' }))).toEqual({
            type: 'emote',
            emote: '🔥',
        })
        expect(parseClientMessage(JSON.stringify({ type: 'emote', emote: '<script>' }))).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'emote' }))).toBeNull()
    })
})

describe('AI players', () => {
    beforeEach(() => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: (officeId, hostPlayerId) => opened.push({ officeId, hostPlayerId }),
            onResults: result => results.push(result),
            botPolicy: policy,
            botNameRng: createRng(7),
        })
    })

    /** Alice hosts alone, with `count` AIs. */
    function soloWith(count: number) {
        const a = connect(alice)
        send(a, { type: 'open' })
        for (let i = 0; i < count; i++) send(a, { type: 'addBot' })

        return a
    }

    test('the host seats AIs; they show in the lobby with negative ids, a Québécois name and a robot', () => {
        const a = soloWith(2)

        const players = last(a, 'office')?.session?.players ?? []
        expect(players[0]).toEqual({ ...alice, away: false })
        const bots = players.slice(1)
        expect(bots.map(p => [p.id, p.bot, p.away])).toEqual([
            [-1, true, false],
            [-2, true, false],
        ])
        for (const bot of bots) {
            expect(BOT_NAMES as readonly string[]).toContain(bot.name)
            expect(bot.avatarUrl).toBe(botAvatarUrl(bot.name))
            expect(isValidLook(bot.look)).toBe(true)
        }
        expect(bots[0]!.name).not.toBe(bots[1]!.name)
        expect(errors(a)).toEqual([])
    })

    test('a full lobby of AIs never repeats a name', () => {
        const a = soloWith(11)

        const names = (last(a, 'office')?.session?.players ?? []).map(p => p.name)
        expect(names).toHaveLength(12)
        expect(new Set(names).size).toBe(12)
    })

    test('the host takes an AI out; the next one comes in under a new id', () => {
        const a = soloWith(2)
        send(a, { type: 'removeBot', playerId: -1 })
        send(a, { type: 'addBot' })

        expect(last(a, 'office')?.session?.players.map(p => p.id)).toEqual([1, -2, -3])
    })

    test('only the host, only in the lobby, never a person', () => {
        const { a, b } = lobbyOfThree()
        send(b, { type: 'addBot' })
        send(a, { type: 'addBot' })
        send(b, { type: 'removeBot', playerId: -1 })
        send(a, { type: 'removeBot', playerId: -9 })
        expect(errors(b)).toEqual(['NOT_HOST', 'NOT_HOST'])
        expect(errors(a)).toEqual(['BAD_MESSAGE'])

        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        send(a, { type: 'addBot' })
        expect(errors(a)).toEqual(['BAD_MESSAGE', 'NOT_IN_LOBBY'])
        expect(parseClientMessage({ type: 'removeBot', playerId: 2 })).toBeNull()
    })

    test('AIs count toward the lobby limit', () => {
        const a = soloWith(MAX_PLAYERS - 1)
        send(a, { type: 'addBot' })

        expect(errors(a)).toEqual(['LOBBY_FULL'])
        expect(last(a, 'office')?.session?.players).toHaveLength(MAX_PLAYERS)
    })

    test('a server without a policy refuses AIs', () => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: () => {},
            onResults: () => {},
        })
        const a = soloWith(1)

        expect(errors(a)).toEqual(['NO_BOTS'])
    })

    test('one person and two AIs is enough to play, and the AIs move on their own', () => {
        const a = soloWith(2)
        send(a, { type: 'start', durationMin: 1, theme: 'open_space' })
        expect(errors(a)).toEqual([])
        expect(last(a, 'countdown')?.playerIds).toEqual([1, -1, -2])

        advance(COUNTDOWN_MS + TICK_MS)
        const start = last(a, 'snapshot')?.players.filter(p => p.id < 0)
        advance(2000)
        const later = last(a, 'snapshot')?.players.filter(p => p.id < 0)

        expect(start).toHaveLength(2)
        for (const bot of later ?? []) {
            const before = start?.find(p => p.id === bot.id)
            expect(Math.hypot(bot.x - (before?.x ?? 0), bot.y - (before?.y ?? 0))).toBeGreaterThan(1)
        }
    })

    test('results reach the Hub without the AIs, positions counting them', () => {
        const a = soloWith(3)
        send(a, { type: 'start', durationMin: 1, theme: 'random' })
        advance(COUNTDOWN_MS + 60_000 + TICK_MS)

        expect(
            last(a, 'results')
                ?.results.stats.map(s => s.id)
                .sort((x, y) => x - y)
        ).toEqual([-3, -2, -1, 1])
        expect(results).toHaveLength(1)
        expect(results[0]?.players.map(p => p.playerId)).toEqual([1])
        const alicePosition = results[0]?.players[0]?.position ?? 0
        expect(alicePosition).toBeGreaterThanOrEqual(1)
        expect(alicePosition).toBeLessThanOrEqual(4)
    })

    test('when the last person leaves, the AIs do not keep the game open', () => {
        const a = soloWith(2)
        const watcher = connect(null)
        send(a, { type: 'leave' })

        expect(last(watcher, 'office')?.session).toBeNull()
    })

    test('the host leaving hands hosting to a person, never an AI', () => {
        const a = connect(alice)
        const b = connect(bob)
        send(a, { type: 'open' })
        send(a, { type: 'addBot' })
        send(b, { type: 'join' })
        send(a, { type: 'leave' })

        expect(last(b, 'office')?.session?.hostId).toBe(2)
    })
})

/** The session table and pilots, which the manager keeps private. */
type Internals = { sessions: Map<number, { pilots: Map<number, { policy: TrainedPolicy }> }> }

describe('Killer Potato', () => {
    beforeEach(() => {
        manager = new SessionManager({
            build: 'build-1',
            now: () => now,
            rng: createRng(42),
            nextSeed: () => 1234,
            onOpened: (officeId, hostPlayerId) => opened.push({ officeId, hostPlayerId }),
            onResults: result => results.push(result),
            botPolicy: policy,
        })
    })

    const killer = { type: 'start', durationMin: 1, theme: 'open_space', mode: 'killer' }

    test('needs three seated, AIs counting; one of them hunts, with no extra seat', () => {
        const a = connect(alice)
        send(a, { type: 'open' })
        send(a, { type: 'addBot' })
        send(a, killer)
        expect(errors(a)).toEqual(['NOT_ENOUGH_PLAYERS'])

        send(a, { type: 'addBot' })
        send(a, killer)
        const seated = last(a, 'countdown')?.playerIds ?? []
        expect(seated.sort((x, y) => x - y)).toEqual([-2, -1, 1])
        const hunterId = last(a, 'office')?.session?.hunterId
        expect(seated).toContain(hunterId!)
        expect(last(a, 'office')?.session?.players).toHaveLength(3)
    })

    test('the hunter is picked at random: a person or an AI', () => {
        const hunters = new Set<number>()
        for (let seed = 1; seed <= 20; seed++) {
            manager = new SessionManager({
                build: 'build-1',
                now: () => now,
                rng: createRng(seed),
                nextSeed: () => 1234,
                onOpened: () => {},
                onResults: () => {},
                botPolicy: policy,
            })
            const a = connect(alice)
            send(a, { type: 'open' })
            send(a, { type: 'addBot' })
            send(a, { type: 'addBot' })
            send(a, killer)
            hunters.add(last(a, 'office')?.session?.hunterId ?? 0)
        }
        expect([...hunters].sort((x, y) => x - y)).toEqual([-2, -1, 1])
    })

    test('an AI hunter plays the hunter policy, AI prey the default one', () => {
        const hunterPolicy = { ...policy, config: { ...policy.config, stickiness: 123 } }
        for (let seed = 1; seed <= 20; seed++) {
            manager = new SessionManager({
                build: 'build-1',
                now: () => now,
                rng: createRng(seed),
                nextSeed: () => 1234,
                onOpened: () => {},
                onResults: () => {},
                botPolicy: policy,
                hunterPolicy,
            })
            const a = connect(alice)
            send(a, { type: 'open' })
            send(a, { type: 'addBot' })
            send(a, { type: 'addBot' })
            send(a, killer)
            const hunterId = last(a, 'office')?.session?.hunterId
            const pilots = (manager as unknown as Internals).sessions.values().next().value?.pilots
            for (const [id, pilot] of pilots?.entries() ?? []) {
                expect(pilot.policy).toBe(id === hunterId ? hunterPolicy : policy)
            }
        }
    })

    test('a person can hunt: everyone people reach the Hub, the hunter included, never as a survivor', () => {
        const { a } = lobbyOfThree()
        send(a, killer)
        const hunterId = last(a, 'office')?.session?.hunterId
        for (let t = 0; t < COUNTDOWN_MS + 61_000 && !last(a, 'results'); t += TICK_MS) advance(TICK_MS)

        const final = last(a, 'results')?.results
        expect(final?.mode).toBe('killer')
        expect(final?.hunterId).toBe(hunterId!)
        expect(final?.survivorIds).not.toContain(hunterId)
        expect(results[0]?.players.map(p => p.playerId).sort((x, y) => x - y)).toEqual([1, 2, 3])
        expect(results[0]?.players.find(p => p.playerId === hunterId)?.survived).toBe(false)

        advance(RESULTS_MS)
        expect(last(a, 'office')?.session?.hunterId).toBeNull()
    })

    test('the hunter dropping out hands the knife on, and the game goes on', () => {
        const { a, b, c } = lobbyOfThree()
        const d = connect(dave)
        send(d, { type: 'join' })
        send(a, killer)
        advance(COUNTDOWN_MS + TICK_MS)
        const hunterId = last(a, 'office')?.session?.hunterId
        const conns = [a, b, c, d]
        manager.disconnect(conns[(hunterId ?? 1) - 1]!.id)
        advance(TICK_MS)

        const watcher = conns.find((_, i) => i + 1 !== hunterId)!
        const next = last(watcher, 'newHunter')?.playerId
        expect(next).toBeDefined()
        expect(next).not.toBe(hunterId)
        expect(last(watcher, 'office')?.session?.hunterId).toBe(next!)
        expect(last(watcher, 'office')?.session?.phase).toBe('playing')
    })

    test('a leaver during the countdown that leaves fewer than three calls the game off', () => {
        const { a, b } = lobbyOfThree()
        send(a, killer)
        send(b, { type: 'leave' })
        advance(COUNTDOWN_MS + TICK_MS)

        expect(last(a, 'office')?.session?.phase).toBe('lobby')
        expect(last(a, 'results')).toBeUndefined()
        expect(results).toHaveLength(0)
    })
})

describe('parseClientMessage', () => {
    test('rejects junk without throwing', () => {
        expect(parseClientMessage('not json')).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'start', durationMin: 9, theme: 'random' }))).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'start', durationMin: 2, theme: 'moon' }))).toBeNull()
        expect(
            parseClientMessage(JSON.stringify({ type: 'start', durationMin: 2, theme: 'random', mode: 'tag' }))
        ).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'input', dx: 5, dy: 0 }))).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'hello', officeId: 'x', playerId: null }))).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'nope' }))).toBeNull()
    })
})
