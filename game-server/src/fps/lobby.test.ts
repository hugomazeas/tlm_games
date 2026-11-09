import { beforeEach, describe, expect, test } from 'bun:test'
import { createRng } from '../sim/rng.ts'
import { COUNTDOWN_MS, type Connection, FpsLobby, INTERMISSION_MS, type MatchResult } from './lobby.ts'
import {
    BUTTON,
    DEFAULT_RULES,
    encodeFrame,
    type InputFrame,
    MAX_PLAYERS,
    parseClientMessage,
    type Rules,
    type ServerMessage,
    ZONE_SECONDS_PER_POINT,
} from './protocol.ts'
import { RESPAWN_STEPS, SHIELD_STEPS } from './sim/arena.ts'
import { GUNS } from './sim/combat.ts'
import { PLAYER, STEP_MS } from './sim/movement.ts'
import { testWorld } from './sim/testing.ts'
import { ZONE_MS, ZONES } from './sim/places.ts'

/** Two spawn points 4 m apart in an open room: whoever is at one can shoot whoever is at the other. */
const world = testWorld([
    { name: 'north', position: [0, 0, -2], yaw: Math.PI },
    { name: 'south', position: [0, 0, 2], yaw: 0 },
])

const FRAG_LIMIT = DEFAULT_RULES.fragLimit
const MATCH_MS = DEFAULT_RULES.minutes * 60_000

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

/** Everyone joins; the first (the host) starts a match with the default rules. */
function startMatch(...clients: Client[]): void {
    for (const c of clients) lobby.join(c, { playerId: Number(c.id.replace(/\D/g, '')) || null, name: c.id })
    lobby.start(clients[0]!.id, DEFAULT_RULES)
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
    test('you warm up until the host (the first in) starts a match: a countdown, then the match', () => {
        const a = client('a1')
        lobby.join(a, { playerId: 1, name: 'Ann' })
        expect(a.last('welcome')!.match).toMatchObject({ phase: 'warmup', host: 'a1' })

        // Alone, there's no one to play.
        lobby.start(a.id, DEFAULT_RULES)
        expect(a.last('error')).toEqual({ type: 'error', code: 'NOT_ENOUGH' })

        const b = client('b2')
        lobby.join(b, { playerId: 2, name: 'Bob' })
        play(30_000)
        expect(a.last('match')!.match.phase).toBe('warmup')
        expect(a.last('roster')!.players.map(p => p.name)).toEqual(['Ann', 'Bob'])

        // Only the host starts.
        lobby.start(b.id, DEFAULT_RULES)
        expect(b.last('error')).toEqual({ type: 'error', code: 'NOT_HOST' })
        expect(a.last('match')!.match.phase).toBe('warmup')

        lobby.start(a.id, DEFAULT_RULES)
        expect(b.last('match')!.match.phase).toBe('countdown')
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

    test('after the scoreboard, everyone warms up again until the host starts the next', () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        kill(a, b)
        play(MATCH_MS)
        expect(a.last('match')!.match.phase).toBe('intermission')
        expect(results[0]!.players[0]!.kills).toBe(1)

        play(INTERMISSION_MS + 60_000)
        expect(a.last('match')!.match.phase).toBe('warmup')
        expect(results).toHaveLength(1)

        lobby.start(a.id, DEFAULT_RULES)
        play(COUNTDOWN_MS + STEP_MS)
        const match = a.last('match')!.match
        expect(match.phase).toBe('playing')
        expect(match.scores.every(s => s.kills === 0 && s.deaths === 0)).toBe(true)
    })

    test('the host picks the rules: a shorter kill limit ends it sooner, and the results say so', () => {
        const [a, b] = [client('a1'), client('b2')]
        lobby.join(a, { playerId: 1, name: 'a1' })
        lobby.join(b, { playerId: 2, name: 'b2' })
        lobby.start(a.id, { mode: 'ffa', fragLimit: 5, minutes: 10 })
        expect(b.last('match')!.match).toMatchObject({ phase: 'countdown', fragLimit: 5, minutes: 10 })
        play(COUNTDOWN_MS + STEP_MS + SHIELD_STEPS * STEP_MS + 100)

        for (let k = 0; k < 5; k++) {
            kill(a, b)
            if (k < 4) play((RESPAWN_STEPS + SHIELD_STEPS) * STEP_MS + 100)
        }
        expect(a.last('match')!.match.phase).toBe('intermission')
        expect(results[0]!.rules).toEqual({ mode: 'ffa', fragLimit: 5, minutes: 10 })
    })

    test('the host passes to the next longest seated when they leave', () => {
        const [a, b, c] = [client('a1'), client('b2'), client('c3')]
        for (const x of [a, b, c]) lobby.join(x, { playerId: Number(x.id.slice(1)), name: x.id })
        lobby.leave(a.id)

        expect(c.last('match')!.match.host).toBe('b2')
        lobby.start(b.id, DEFAULT_RULES)
        expect(c.last('match')!.match.phase).toBe('countdown')
    })

    test('warmup kills count for nothing', () => {
        const [a, b] = [client('a1'), client('b2')]
        lobby.join(a, { playerId: 1, name: 'a1' })
        lobby.join(b, { playerId: 2, name: 'b2' })
        play(SHIELD_STEPS * STEP_MS + 100)
        kill(a, b)

        lobby.start(a.id, DEFAULT_RULES)
        play(COUNTDOWN_MS + STEP_MS)
        expect(a.last('match')!.match.scores.every(s => s.kills === 0)).toBe(true)
    })

    test("a match's stats: shots, hits, streaks, time played, and every kill", () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        kill(a, b)
        play((RESPAWN_STEPS + SHIELD_STEPS) * STEP_MS + 100)
        kill(a, b)
        play(MATCH_MS)

        const [ann, bob] = results[0]!.players
        expect(ann).toMatchObject({ playerId: 1, kills: 2, deaths: 0, bestStreak: 2, meleeKills: 0 })
        expect(ann!.shots).toBeGreaterThanOrEqual(10)
        // Two kills with the rifle: about as many hits as it takes to bring 100 down, twice (fewer
        // when the spread lands one on a head).
        const perKill = Math.ceil(100 / GUNS.rifle.damage)
        expect(ann!.hits).toBeGreaterThanOrEqual(2 * perKill - 2)
        expect(ann!.hits).toBeLessThanOrEqual(2 * perKill)
        expect(ann!.damage).toBeGreaterThanOrEqual(200)
        expect(bob).toMatchObject({ playerId: 2, kills: 0, deaths: 2, shots: 0, hits: 0, bestStreak: 0 })
        // The whole match, give or take a step.
        expect(Math.abs(ann!.playedMs - MATCH_MS)).toBeLessThan(100)
        expect(results[0]!.playerCount).toBe(2)
        expect(results[0]!.kills).toEqual([
            expect.objectContaining({ killerId: 1, victimId: 2, weapon: 'rifle', backstab: false }),
            expect.objectContaining({ killerId: 1, victimId: 2, weapon: 'rifle' }),
        ])
        expect(results[0]!.kills[1]!.atMs).toBeGreaterThan(results[0]!.kills[0]!.atMs)
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
        lobby.start(a.id, DEFAULT_RULES)
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
        expect(lobby.summary()).toEqual({ phase: 'warmup', players: MAX_PLAYERS, watching: 2 })
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

describe('modes', () => {
    /** Everyone joins; the first (the host) starts a match with these rules. */
    function startWith(rules: Rules, ...clients: Client[]): void {
        for (const c of clients) lobby.join(c, { playerId: Number(c.id.replace(/\D/g, '')) || null, name: c.id })
        lobby.start(clients[0]!.id, rules)
        play(COUNTDOWN_MS + STEP_MS)
        play(SHIELD_STEPS * STEP_MS + 100)
    }
    const teamOf = (c: Client, id: string) => c.last('snap')!.players.find(p => p.id === id)!.team

    test('team deathmatch: two even sides, kills count for the side, the winning side all won', () => {
        const [a, b] = [client('a1'), client('b2')]
        startWith({ mode: 'tdm', fragLimit: 5, minutes: 10 }, a, b)
        expect(new Set([teamOf(a, 'a1'), teamOf(a, 'b2')])).toEqual(new Set(['red', 'blue']))

        for (let k = 0; k < 5; k++) {
            kill(a, b)
            if (k < 4) play((RESPAWN_STEPS + SHIELD_STEPS) * STEP_MS + 100)
        }
        const winner = teamOf(a, 'a1')!
        expect(a.last('match')!.match).toMatchObject({ phase: 'intermission', teams: { [winner]: 5 } })
        const [first, second] = results[0]!.players
        expect([first!.name, first!.won, first!.team]).toEqual(['a1', true, winner])
        expect([second!.name, second!.won]).toEqual(['b2', false])
        expect(results[0]!.rules.mode).toBe('tdm')
    })

    test('team deathmatch: a newcomer joins the smaller side', () => {
        const [a, b, c] = [client('a1'), client('b2'), client('c3')]
        startWith({ mode: 'tdm', fragLimit: 15, minutes: 10 }, a, b, c)
        const count = (team: string) => a.last('snap')!.players.filter(p => p.team === team).length
        const smaller = count('red') < count('blue') ? 'red' : 'blue'

        const d = client('d4')
        lobby.join(d, { playerId: 4, name: 'd4' })
        play(STEP_MS * 3)
        expect(teamOf(a, 'd4')).toBe(smaller)
        expect(count('red')).toBe(2)
        expect(count('blue')).toBe(2)
    })

    test('king of the meeting room: alone in the zone scores, two in it score nothing, and it moves', () => {
        const [a, b] = [client('a1'), client('b2')]
        startWith({ mode: 'koth', fragLimit: 5, minutes: 10 }, a, b)
        const zone = a.last('snap')!.zone!
        expect(zone.holder).toBeNull()
        const place = ZONES[zone.index]!

        // a walks into it and holds it 3 s.
        walkTo(a, place.x, place.z)
        play(3000, () => [[a, idle()]])
        expect(a.last('snap')!.zone).toMatchObject({ index: zone.index, holder: 'a1', contested: false })
        const held = a.last('match')!.match.scores.find(s => s.id === 'a1')!.points
        expect(held).toBeGreaterThanOrEqual(3)

        // b joins them: contested, nobody scores.
        walkTo(b, place.x, place.z, [a])
        play(2000, () => [
            [a, idle()],
            [b, idle()],
        ])
        expect(a.last('snap')!.zone).toMatchObject({ holder: null, contested: true })
        const still = a.last('match')!.match.scores.find(s => s.id === 'a1')!.points
        play(2000, () => [
            [a, idle()],
            [b, idle()],
        ])
        expect(a.last('match')!.match.scores.find(s => s.id === 'a1')!.points).toBe(still)

        // A minute in, the zone has moved on.
        play(ZONE_MS, () => [
            [a, idle()],
            [b, idle()],
        ])
        expect(a.last('snap')!.zone!.index).not.toBe(zone.index)
    })

    test('king of the meeting room: ten times the limit in seconds wins it', () => {
        const [a, b] = [client('a1'), client('b2')]
        startWith({ mode: 'koth', fragLimit: 5, minutes: 10 }, a, b)
        const place = ZONES[a.last('snap')!.zone!.index]!
        walkTo(a, place.x, place.z)
        play(5 * ZONE_SECONDS_PER_POINT * 1000 + 500, () => [[a, idle()]])

        expect(a.last('match')!.match.phase).toBe('intermission')
        const ann = results[0]!.players.find(p => p.playerId === 1)!
        expect([ann.place, ann.won]).toEqual([1, true])
        expect(ann.zoneMs).toBeGreaterThanOrEqual(5 * ZONE_SECONDS_PER_POINT * 1000)
        expect(a.last('match')!.match.awards![0]).toMatchObject({ title: 'MVP', name: 'a1' })
    })

    test('the first kill of a match is first blood; the scoreboard after it has awards', () => {
        const [a, b] = [client('a1'), client('b2')]
        startMatch(a, b)
        kill(a, b)
        play((RESPAWN_STEPS + SHIELD_STEPS) * STEP_MS + 100)
        kill(a, b)
        const kills = a.inbox.flatMap(m => (m.type === 'snap' ? m.events : [])).filter(e => e.type === 'kill')
        expect(kills.map(k => k.type === 'kill' && k.firstBlood === true)).toEqual([true, false])

        play(MATCH_MS)
        const awards = a.last('match')!.match.awards!
        expect(awards.map(w => w.title)).toContain('MVP')
        expect(awards.find(w => w.title === 'MVP')).toMatchObject({ name: 'a1', detail: '2 kills' })
        // Back to warmup, no awards left over.
        play(INTERMISSION_MS + STEP_MS)
        expect(a.last('match')!.match.awards).toBeNull()
    })
})

/** A frame that does nothing (keeps a browser's frames coming). */
function idle(): Omit<InputFrame, 'seq'> {
    return { forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0 }
}

/** Walks `c` to (x, z), step by step (the others sending idle frames meanwhile). */
function walkTo(c: Client, x: number, z: number, others: Client[] = []): void {
    for (let i = 0; i < 60 * 20; i++) {
        const me = where(c, c.id)
        const dx = x - me.x
        const dz = z - me.z
        if (Math.hypot(dx, dz) < 0.3) return
        play(STEP_MS, () => [
            [c, { ...idle(), forward: 1, yaw: Math.atan2(-dx, -dz) }],
            ...others.map((o): [Client, Omit<InputFrame, 'seq'>] => [o, idle()]),
        ])
    }
    throw new Error(`${c.id} never got to ${x}, ${z}`)
}

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
        play(200, () => [[b, { forward: 0, strafe: 1, yaw: 0, pitch: 0, buttons: 0, view: 0 }]])
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
            [b, { forward: 0, strafe: 1, yaw: 0, pitch: 0, buttons: 0, view: 0 }],
            [a, { ...aim, buttons: 0 }],
        ])
        from = a.inbox.length
        play(STEP_MS, step => [[a, { ...aim, view: step - 40 }]])
        play(STEP_MS * 3)
        expect(shotsAfter(from)).toEqual([expect.objectContaining({ by: 'a1', hit: null })])
    })
})

describe('building', () => {
    /** Halfway between the spawns: within reach (and the server's slack) of both. */
    const wall = { axis: 'x' as const, x: 0.3, y: 0.3, z: 0 }

    test('a wall goes up for everyone; a newcomer is welcomed with it; a new match wipes it', () => {
        const a = client('a1')
        const b = client('b2')
        lobby.join(a, { playerId: 1, name: 'Ann' })
        lobby.join(b, { playerId: 2, name: 'Bob' })
        play(100)
        lobby.build(a.id, wall)
        play(100)
        expect(b.inbox.flatMap(m => (m.type === 'snap' ? m.events : []))).toContainEqual({
            type: 'built',
            wall: expect.objectContaining({ ...wall, by: 'a1' }),
        })

        const c = client('c3')
        lobby.join(c, { playerId: 3, name: 'Cat' })
        expect(c.last('welcome')!.walls).toEqual([expect.objectContaining(wall)])

        lobby.start(a.id, DEFAULT_RULES)
        play(COUNTDOWN_MS + 100)
        expect(c.inbox.flatMap(m => (m.type === 'snap' ? m.events : []))).toContainEqual({ type: 'walls', walls: [] })
    })

    test('watchers and the scoreboard build nothing; the lobby keeps its walls to itself', () => {
        const a = client('a1')
        lobby.join(a, { playerId: 1, name: 'Ann' })
        play(100)
        lobby.build('nobody', wall)
        play(100)
        expect(world.walls.count).toBe(0)
        expect(a.inbox.flatMap(m => (m.type === 'snap' ? m.events : [])).some(e => e.type === 'built')).toBe(false)

        lobby.build(a.id, wall)
        play(100)
        // Built in the lobby's game, not in the world it was given.
        expect(world.walls.count).toBe(0)
        expect(a.inbox.flatMap(m => (m.type === 'snap' ? m.events : [])).some(e => e.type === 'built')).toBe(true)
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
            slot: 'melee' as const,
        }

        expect(parseClientMessage(JSON.stringify({ type: 'input', frames: [encodeFrame(frame)] }))).toEqual({
            type: 'input',
            frames: [frame],
        })
        // A 7-long frame (no slot) holds the primary.
        expect(parseClientMessage(JSON.stringify({ type: 'input', frames: [[1, 0, 0, 0, 0, 0, 0]] }))).toEqual({
            type: 'input',
            frames: [{ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, view: 0, slot: 'primary' }],
        })
    })

    test('a loadout names real guns in the right slots, or it is refused', () => {
        const parse = (loadout: unknown) => parseClientMessage(JSON.stringify({ type: 'loadout', loadout }))
        expect(parse({ primary: 'sniper', secondary: 'launcher' })).toEqual({
            type: 'loadout',
            loadout: { primary: 'sniper', secondary: 'launcher' },
        })
        expect(parse({ primary: 'launcher', secondary: 'pistol' })).toBeNull()
        expect(parse({ primary: 'bfg', secondary: 'pistol' })).toBeNull()
        // A hello with a bad one still joins, with the default guns.
        expect(
            parseClientMessage(JSON.stringify({ type: 'hello', playerId: null, loadout: { primary: 'bfg' } }))
        ).toEqual({ type: 'hello', playerId: null })
    })

    test("the host's start carries rules from the allowed lists only", () => {
        const start = (rules: unknown) => parseClientMessage(JSON.stringify({ type: 'start', rules }))

        const rules = { mode: 'koth' as const, fragLimit: 25, minutes: 10 }
        expect(start(rules)).toEqual({ type: 'start', rules })
        // No mode (an older tab): free for all. A made-up one: refused.
        expect(start({ fragLimit: 25, minutes: 10 })).toEqual({ type: 'start', rules: { ...rules, mode: 'ffa' } })
        expect(start({ ...rules, mode: 'battle royale' })).toBeNull()
        expect(start({ fragLimit: 7, minutes: 10 })).toBeNull()
        expect(start({ fragLimit: 25, minutes: 1 })).toBeNull()
        expect(start(null)).toBeNull()
    })

    test('a build names an axis and a centre; an unbuild a wall', () => {
        const parse = (message: unknown) => parseClientMessage(JSON.stringify(message))
        const wall = { axis: 'z' as const, x: 1.5, y: 0.3, z: -2 }

        expect(parse({ type: 'build', wall })).toEqual({ type: 'build', wall })
        expect(parse({ type: 'build', wall: { ...wall, axis: 'w' } })).toBeNull()
        expect(parse({ type: 'build', wall: { ...wall, y: 'up' } })).toBeNull()
        expect(parse({ type: 'build', wall: { ...wall, x: 1e9 } })).toBeNull()
        expect(parse({ type: 'build' })).toBeNull()
        expect(parse({ type: 'unbuild', id: 4 })).toEqual({ type: 'unbuild', id: 4 })
        expect(parse({ type: 'unbuild', id: 0 })).toBeNull()
        expect(parse({ type: 'reshape', id: 4, kind: 'window' })).toEqual({ type: 'reshape', id: 4, kind: 'window' })
        expect(parse({ type: 'reshape', id: 4, kind: 'wall' })).toBeNull()
        expect(parse({ type: 'door', id: 4 })).toEqual({ type: 'door', id: 4 })
        expect(parse({ type: 'door', id: 'x' })).toBeNull()
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
            { type: 'input', frames: [[1, 0, 0, 0, 0, 64, 0]] },
            { type: 'input', frames: [[1, 0, 0, null, 0, 0, 0]] },
            { type: 'input', frames: [[1, 0, 0, 0, 0, 0, 0, 3]] },
            { type: 'input', frames: [[1, 0, 0, 0, 0, 0, 0, 0, 0]] },
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
