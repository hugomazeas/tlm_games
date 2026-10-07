import { beforeEach, describe, expect, test } from 'bun:test'
import { parseClientMessage, type PlayerInfo, type ServerMessage } from './protocol.ts'
import { COUNTDOWN_MS, type GameResult, RECONNECT_GRACE_MS, RESULTS_MS, SessionManager, TICK_MS } from './sessions.ts'
import { FIRST_ITEM_MS } from './sim/items.ts'
import { createRng } from './sim/rng.ts'

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

const alice = { id: 1, name: 'Alice' }
const bob = { id: 2, name: 'Bob' }
const carol = { id: 3, name: 'Carol' }
const dave = { id: 4, name: 'Dave' }

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

describe('opening and joining', () => {
    test('opening makes you host and announces it once', () => {
        const a = connect(alice)
        const watcher = connect(null)
        send(a, { type: 'open' })

        expect(last(watcher, 'office')?.session).toMatchObject({ hostId: 1, phase: 'lobby', players: [{ id: 1 }] })
        expect(opened).toEqual([{ officeId: OFFICE, hostPlayerId: 1 }])
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
        const host = connect({ id: 100, name: 'Host' })
        send(host, { type: 'open' })
        for (let id = 101; id < 112; id++) send(connect({ id, name: `P${id}` }), { type: 'join' })
        const thirteenth = connect({ id: 200, name: 'Late' })
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
        expect(['shield', 'speed', 'banana', 'mystery']).toContain(item.kind)
        expect(item.expiresInMs).toBeGreaterThan(0)

        // Alice homes in on it.
        for (let t = 0; t < 12_000 && !last(b, 'pickup'); t += TICK_MS) {
            const me = last(a, 'snapshot')?.players.find(p => p.id === 1)
            const target = last(a, 'snapshot')?.items.find(i => i.id === item.id)
            if (!me || !target) break
            const dx = target.x - me.x
            const dy = target.y - me.y
            const length = Math.hypot(dx, dy) || 1
            send(a, { type: 'input', dx: dx / length, dy: dy / length })
            advance(TICK_MS)
        }

        const pickup = last(b, 'pickup')
        if (!pickup) throw new Error('nobody took the item')
        expect(pickup.item).toBe(item.kind)
        expect(['shield', 'speed', 'banana']).toContain(pickup.effect)
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
