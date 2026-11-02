import { beforeEach, describe, expect, test } from 'bun:test'
import { createRng } from '../sim/rng.ts'
import {
    COUNTDOWN_MS,
    type Connection,
    FpsLobby,
    FRAG_LIMIT,
    INTERMISSION_MS,
    MATCH_MS,
    type MatchResult,
} from './lobby.ts'
import {
    BUTTON,
    encodeFrame,
    type InputFrame,
    MAX_PLAYERS,
    parseClientMessage,
    type ServerMessage,
} from './protocol.ts'
import { RESPAWN_STEPS, SHIELD_STEPS } from './sim/arena.ts'
import { PLAYER, STEP_MS } from './sim/movement.ts'
import { testWorld } from './sim/testing.ts'

/** Two spawn points 4 m apart in an open room: whoever is at one can shoot whoever is at the other. */
const world = testWorld([
    { name: 'north', position: [0, 0, -2], yaw: Math.PI },
    { name: 'south', position: [0, 0, 2], yaw: 0 },
])

let now: number
let results: MatchResult[]
let lobby: FpsLobby

interface Client extends Connection {
    inbox: ServerMessage[]
    closed: boolean
    seq: number
    last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined
}

function client(id: string): Client {
    const c: Client = {
        id,
        inbox: [],
        closed: false,
        seq: 0,
        send: message => c.inbox.push(message),
        close: () => {
            c.closed = true
        },
        last: type => c.inbox.filter(m => m.type === type).at(-1) as never,
    }
    return c
}

/** Runs the game for `ms`, a step at a time; each client may send one frame per step. */
function play(ms: number, frames: (step: number) => Array<[Client, Omit<InputFrame, 'seq'>]> = () => []): void {
    const end = now + ms
    while (now < end) {
        now = Math.min(end, now + STEP_MS)
        const step = Math.floor(now / STEP_MS)
        for (const [c, frame] of frames(step)) lobby.input(c.id, [{ ...frame, seq: ++c.seq }])
        lobby.tick()
    }
}

/** Where everyone is, from a client's latest snapshot. */
function where(c: Client, id: string) {
    return c.last('snap')!.players.find(p => p.id === id)!
}

/** A frame that aims `shooter` at `target`'s chest (as `shooter` last saw them) and pulls the trigger. */
function shootAt(shooter: Client, target: Client, step: number): Omit<InputFrame, 'seq'> {
    const me = where(shooter, shooter.id)
    const them = where(shooter, target.id)
    const dx = them.x - me.x
    const dz = them.z - me.z
    const dy = them.y + PLAYER.height / 2 - (me.y + PLAYER.eye)

    return {
        forward: 0,
        strafe: 0,
        yaw: Math.atan2(-dx, -dz),
        pitch: Math.atan2(dy, Math.hypot(dx, dz)),
        buttons: BUTTON.fire,
        view: step - 1,
    }
}

/** `shooter` fires at `target` until they're down (shields off first). */
function kill(shooter: Client, target: Client): void {
    let down = false
    for (let i = 0; i < 300 && !down; i++) {
        play(STEP_MS, step => [[shooter, shootAt(shooter, target, step)]])
        down = where(shooter, target.id)?.alive === false
    }
    expect(down).toBe(true)
}

function startMatch(...clients: Client[]): void {
    for (const c of clients) lobby.join(c, { playerId: Number(c.id.replace(/\D/g, '')) || null, name: c.id })
    play(COUNTDOWN_MS + STEP_MS)
    expect(clients[0]!.last('match')!.match.phase).toBe('playing')
    // Past the spawn shields.
    play(SHIELD_STEPS * STEP_MS + 100)
}

beforeEach(() => {
    now = 0
    results = []
    lobby = new FpsLobby(world, { now: () => now, random: createRng(1), onResults: r => results.push(r) })
})

describe('one game, joined on the fly', () => {
    test('alone, you warm up; a second player starts the countdown, then the match', () => {
        const a = client('a1')
        lobby.join(a, { playerId: 1, name: 'Ann' })
        expect(a.last('welcome')!.match.phase).toBe('warmup')

        const b = client('b2')
        lobby.join(b, { playerId: 2, name: 'Bob' })
        expect(a.last('match')!.match.phase).toBe('countdown')
        expect(a.last('roster')!.players.map(p => p.name)).toEqual(['Ann', 'Bob'])

        play(COUNTDOWN_MS + STEP_MS)
        const match = b.last('match')!.match
        expect(match.phase).toBe('playing')
        expect(match.scores.map(s => [s.name, s.kills, s.deaths])).toEqual([
            ['Ann', 0, 0],
            ['Bob', 0, 0],
        ])
    })

    test('everyone is in the same game: a third player joins the match running, straight in', () => {
        const [a, b, c] = [client('a1'), client('b2'), client('c3')]
        startMatch(a, b)
        play(10_000)

        lobby.join(c, { playerId: 3, name: 'Cat' })
        const welcome = c.last('welcome')!
        expect(welcome.match.phase).toBe('playing')
        expect(welcome.players.map(p => p.id)).toEqual(['a1', 'b2', 'c3'])
        expect(welcome.players.every(p => !p.watching)).toBe(true)
        expect(welcome.match.scores.map(s => s.name)).toContain('Cat')

        play(STEP_MS * 3)
        const self = c.last('snap')!.you!
        expect(self.alive).toBe(true)
        expect(self.shielded).toBe(true)
        expect(a.last('snap')!.players.map(p => p.id)).toEqual(['a1', 'b2', 'c3'])
    })

    test('kills count in the match, and the first to the frag limit ends it', () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)

        for (let k = 0; k < FRAG_LIMIT; k++) {
            kill(a, b)
            if (k < FRAG_LIMIT - 1) play((RESPAWN_STEPS + SHIELD_STEPS) * STEP_MS + 100)
        }

        expect(a.last('match')!.match.phase).toBe('intermission')
        expect(results).toHaveLength(1)
        expect(results[0]!.players.map(p => [p.name, p.place, p.kills, p.deaths, p.left])).toEqual([
            ['a1', 1, FRAG_LIMIT, 0, false],
            ['b2', 2, 0, FRAG_LIMIT, false],
        ])
        expect(results[0]!.players[0]!.damage).toBeGreaterThanOrEqual(FRAG_LIMIT * 100)
        const feed = a.inbox.flatMap(m => (m.type === 'snap' ? m.events : [])).filter(e => e.type === 'kill')
        expect(feed).toHaveLength(FRAG_LIMIT)
    })

    test('after the scoreboard, the next match starts by itself with fresh scores', () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        kill(a, b)
        play(MATCH_MS)
        expect(a.last('match')!.match.phase).toBe('intermission')
        expect(results[0]!.players[0]!.kills).toBe(1)

        play(INTERMISSION_MS + STEP_MS)
        const match = a.last('match')!.match
        expect(match.phase).toBe('playing')
        expect(match.scores.every(s => s.kills === 0 && s.deaths === 0)).toBe(true)
    })

    test('warmup kills count for nothing', () => {
        const [a, b] = [client('a1'), client('b2')]
        lobby.join(a, { playerId: 1, name: 'a1' })
        lobby.join(b, { playerId: 2, name: 'b2' })
        play(SHIELD_STEPS * STEP_MS + 100)
        expect(a.last('match')!.match.phase).toBe('countdown')
        kill(a, b)

        play(COUNTDOWN_MS)
        expect(a.last('match')!.match.scores.every(s => s.kills === 0)).toBe(true)
    })

    test('fewer than two left calls the match off: no results', () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        kill(a, b)

        lobby.leave(b.id)
        expect(a.last('match')!.match.phase).toBe('warmup')
        play(MATCH_MS)
        expect(results).toEqual([])
    })

    test('who leaves mid-match keeps their kills in the results', () => {
        const [a, b, c] = [client('a1'), client('b2'), client('c3')]
        startMatch(a, b, c)
        kill(a, b)
        lobby.leave(a.id)

        play(MATCH_MS)
        const ann = results[0]!.players.find(p => p.playerId === 1)!
        expect([ann.kills, ann.left]).toEqual([1, true])
        expect(b.last('match')!.match.scores.find(s => s.name === 'a1')!.id).toBeNull()
    })

    test('coming back to the same match gets your score back', () => {
        const [a, b] = [client('a1'), client('b2')]
        const c = client('c3')
        startMatch(a, b, c)
        kill(a, b)
        lobby.leave(a.id)

        const again = client('a1-again')
        lobby.join(again, { playerId: 1, name: 'a1' })
        const ann = again.last('welcome')!.match.scores.find(s => s.name === 'a1')!
        expect([ann.id, ann.kills]).toEqual(['a1-again', 1])
    })

    test('the same player in a second tab takes over from the first', () => {
        const [first, other] = [client('a1'), client('b2')]
        lobby.join(first, { playerId: 1, name: 'Ann' })
        lobby.join(other, { playerId: 2, name: 'Bob' })

        const second = client('a1-tab2')
        lobby.join(second, { playerId: 1, name: 'Ann' })
        expect(first.last('replaced')).toBeDefined()
        expect(first.closed).toBe(true)
        expect(other.last('roster')!.players.map(p => p.id)).toEqual(['b2', 'a1-tab2'])
    })

    test('guests play but only people are recorded', () => {
        const [a, guest] = [client('a1'), client('guest')]
        lobby.join(a, { playerId: 1, name: 'Ann' })
        lobby.join(guest, { playerId: null, name: 'Guest' })
        play(COUNTDOWN_MS + STEP_MS)
        play(MATCH_MS)

        expect(results[0]!.players.map(p => p.name)).toEqual(['Ann'])
    })

    test('a full game seats later arrivals as watchers, and the first of them takes the next free seat', () => {
        const seated = Array.from({ length: MAX_PLAYERS }, (_, i) => client(`p${i + 1}`))
        for (const c of seated) lobby.join(c, { playerId: Number(c.id.slice(1)), name: c.id })
        const [late, later] = [client('p20'), client('p21')]
        lobby.join(late, { playerId: 20, name: 'late' })
        lobby.join(later, { playerId: 21, name: 'later' })

        expect(late.last('welcome')!.players.find(p => p.id === 'p20')!.watching).toBe(true)
        expect(lobby.summary()).toEqual({ phase: 'countdown', players: MAX_PLAYERS, watching: 2 })
        play(STEP_MS * 3)
        expect(late.last('snap')!.you).toBeNull()
        lobby.input(late.id, [{ seq: 1, forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0 }])

        lobby.leave('p3')
        const roster = later.last('roster')!.players
        expect(roster.find(p => p.id === 'p20')!.watching).toBe(false)
        expect(roster.find(p => p.id === 'p21')!.watching).toBe(true)
        play(STEP_MS * 3)
        expect(late.last('snap')!.you!.alive).toBe(true)
    })

    test('snapshots tell you the last input of yours the server used', () => {
        const a = client('a1')
        lobby.join(a, { playerId: 1, name: 'Ann' })
        play(STEP_MS * 30)
        const start = a.last('snap')!.you!.body
        play(STEP_MS * 30, () => [[a, { forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0 }]])

        const snap = a.last('snap')!
        expect(snap.ack).toBeGreaterThan(20)
        expect(snap.ack).toBeLessThanOrEqual(a.seq)
        // Forward with yaw 0 is toward -Z.
        expect(snap.you!.body.z).toBeLessThan(start.z - 0.5)
    })
})

describe('shots are judged where the shooter saw the target', () => {
    test('a target that has since moved away is still hit; one seen too long ago is not', () => {
        // a at north, b at south; b runs east out of a's line.
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        play(STEP_MS * 3)
        const step = Math.floor(now / STEP_MS)
        const aim = shootAt(a, b, step)
        const seenAt = a.last('snap')!.step

        // 200 ms: out of the line of fire (past the capsule's 12 cm), still within the rewind.
        play(200, () => [[b, { forward: 0, strafe: 1, yaw: 0, pitch: 0, buttons: BUTTON.run, view: 0 }]])
        expect(Math.abs(where(a, b.id).x)).toBeGreaterThan(0.2)

        const shotsAfter = (from: number) =>
            a.inbox
                .slice(from)
                .flatMap(m => (m.type === 'snap' ? m.events : []))
                .filter(e => e.type === 'shot')

        // Fired at the step it saw: rewound, hit.
        let from = a.inbox.length
        play(STEP_MS, () => [[a, { ...aim, view: seenAt }]])
        play(STEP_MS * 3)
        expect(shotsAfter(from)).toEqual([expect.objectContaining({ by: 'a1', hit: 'b2' })])

        // Long gone (more than 200 ms ago): judged where b is now, a miss.
        // The shooter's browser keeps sending frames (the blaster's cooldown counts them).
        play(400, () => [
            [b, { forward: 0, strafe: 1, yaw: 0, pitch: 0, buttons: BUTTON.run, view: 0 }],
            [a, { ...aim, buttons: 0 }],
        ])
        from = a.inbox.length
        play(STEP_MS, step => [[a, { ...aim, view: step - 40 }]])
        play(STEP_MS * 3)
        expect(shotsAfter(from)).toEqual([expect.objectContaining({ by: 'a1', hit: null })])
    })
})

describe('messages', () => {
    test('inputs travel as compact frames and come back the same', () => {
        const frame = {
            seq: 7,
            forward: 1,
            strafe: -1,
            yaw: 1.25,
            pitch: -0.3,
            buttons: BUTTON.fire | BUTTON.jet,
            view: 120,
        }

        expect(parseClientMessage(JSON.stringify({ type: 'input', frames: [encodeFrame(frame)] }))).toEqual({
            type: 'input',
            frames: [frame],
        })
    })

    test('bad messages are refused', () => {
        const frame = [1, 0, 0, 0, 0, 0, 0]
        for (const bad of [
            'not json',
            { type: 'input', frames: [] },
            { type: 'input', frames: Array(31).fill(frame) },
            { type: 'input', frames: [[1, 2, 0, 0, 0, 0, 0]] },
            { type: 'input', frames: [[0, 0, 0, 0, 0, 0, 0]] },
            { type: 'input', frames: [[1, 0, 0, 0, 2, 0, 0]] },
            { type: 'input', frames: [[1, 0, 0, 0, 0, 16, 0]] },
            { type: 'input', frames: [[1, 0, 0, null, 0, 0, 0]] },
            { type: 'hello', playerId: 0 },
            { type: 'hello', playerId: 'x' },
            { type: 'nope' },
        ]) {
            expect(parseClientMessage(typeof bad === 'string' ? bad : JSON.stringify(bad))).toBeNull()
        }
        expect(parseClientMessage(JSON.stringify({ type: 'hello', playerId: null }))).toEqual({
            type: 'hello',
            playerId: null,
        })
    })
})
