import { beforeEach, describe, expect, test } from 'bun:test'
import { RESPAWN_MS } from './drive/snacks.ts'
import { FINISH_GRACE_MS, type LoadedTrack, LobbyManager, type RaceResult } from './lobbies.ts'
import type { Course } from './map/format.ts'
import { type LobbyView, MAX_RACERS, parseClientMessage, type Pose, type ServerMessage } from './protocol.ts'

/** The square loop from laps.test.ts: start line on the north side, a gate on each other side. */
const square: Course = {
    slug: 'square',
    name: 'Square',
    laps: 1,
    gates: [
        { x: 0, z: -100, dx: 1, dz: 0, width: 12 },
        { x: 100, z: 0, dx: 0, dz: 1, width: 12 },
        { x: 0, z: 100, dx: -1, dz: 0, width: 12 },
        { x: -100, z: 0, dx: 0, dz: -1, width: 12 },
    ],
}
const track: LoadedTrack = { id: 7, name: 'Square', course: square, route: null }

const POSE: Pose = {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    speed: 0,
    drift: 0,
    charge: 0,
    boost: false,
    airborne: false,
    steer: 0,
}

let now: number
let ids: number
let rolls: number
let results: RaceResult[]
let manager: LobbyManager
let inboxes: Map<string, ServerMessage[]>

function connect(id: string) {
    const inbox: ServerMessage[] = []
    inboxes.set(id, inbox)

    return { id, send: (message: ServerMessage) => inbox.push(message) }
}

function join(id: string, playerId: number | null, lobby: string | null = null, onTrack = track): void {
    manager.join(connect(id), { playerId, name: id, body: '#ff0000', accent: '#0000ff' }, onTrack, lobby)
}

function last<T extends ServerMessage['type']>(id: string, type: T): Extract<ServerMessage, { type: T }> | undefined {
    return inboxes
        .get(id)!
        .filter(message => message.type === type)
        .at(-1) as Extract<ServerMessage, { type: T }> | undefined
}

function lobbyOf(id: string): LobbyView {
    const message = last(id, 'lobby') ?? last(id, 'welcome')!

    return message.lobby
}

/** Through gate `index` of the square, 1 m either side, at race clock t (a step apart). */
function through(id: string, index: number, t: number): void {
    const gate = square.gates[index]!
    manager.pose(id, POSE, [gate.x - gate.dx, gate.z - gate.dz, t, gate.x + gate.dx, gate.z + gate.dz, t + 0.05])
}

/** A lap of the square from the grid: the start line, the three gates, the line again. */
function lap(id: string, startAt: number, finishAt: number): void {
    through(id, 0, startAt)
    through(id, 1, startAt + 10)
    through(id, 2, startAt + 20)
    through(id, 3, startAt + 30)
    through(id, 0, finishAt)
}

function startRace(host: string): void {
    manager.start(host)
    now += 3000
    manager.tick()
}

beforeEach(() => {
    now = 1_000_000
    ids = 0
    rolls = 0
    results = []
    inboxes = new Map()
    manager = new LobbyManager({
        now: () => now,
        newId: () => `lobby${++ids}`,
        random: () => (rolls++ * 0.37) % 1,
        onResults: result => results.push(result),
    })
})

describe('lobbies', () => {
    test('playing a track opens a lobby the driver hosts, and the list shows it', () => {
        join('a', 1)

        const welcome = last('a', 'welcome')!
        expect(welcome.you).toBe('a')
        expect(welcome.lobby).toMatchObject({ id: 'lobby1', trackId: 7, hostId: 'a', phase: 'waiting' })
        expect(manager.summaries()).toEqual([
            { id: 'lobby1', trackId: 7, trackName: 'Square', host: 'a', players: 1, max: MAX_RACERS, phase: 'waiting' },
        ])
    })

    test('joining a lobby seats you with the others, who hear about it', () => {
        join('a', 1)
        join('b', 2, 'lobby1')

        expect(lobbyOf('a').members.map(m => m.name)).toEqual(['a', 'b'])
        expect(lobbyOf('b').members.map(m => m.name)).toEqual(['a', 'b'])
        expect(manager.summaries()).toHaveLength(1)
    })

    test('a lobby that closed, or one on another track, opens a new one instead', () => {
        join('a', 1, 'gone')
        join('b', 2, 'lobby1', { ...track, id: 8 })

        expect(manager.summaries().map(s => s.id)).toEqual(['lobby1', 'lobby2'])
    })

    test('pressing Play on a track joins the lobby already on it', () => {
        join('a', 1)
        join('b', 2)
        join('c', null, 'gone')

        expect(manager.summaries()).toHaveLength(1)
        expect(lobbyOf('a').members.map(m => m.id)).toEqual(['a', 'b', 'c'])
    })

    test('Play watches a race when that is the only lobby on the track', () => {
        join('a', 1)
        startRace('a')
        join('b', 2)

        expect(lobbyOf('b').id).toBe('lobby1')
        expect(lobbyOf('b').members.find(m => m.id === 'b')!.racing).toBe(false)
    })

    test('Play prefers a lobby getting ready to one racing', () => {
        for (let i = 0; i < MAX_RACERS; i++) join(`p${i}`, null)
        join('second', null)
        manager.leave('p7')
        startRace('p0')

        join('new', null)
        expect(lobbyOf('new').id).toBe('lobby2')
    })

    test('Play opens a new lobby when the one on the track is full', () => {
        join('p0', null)
        for (let i = 1; i < MAX_RACERS; i++) join(`p${i}`, null)
        join('late', null)

        expect(manager.summaries().map(s => s.players)).toEqual([MAX_RACERS, 1])
    })

    test('the host closes the lobby for everyone; nobody else can', () => {
        join('a', 1)
        join('b', 2)
        manager.close('b')
        expect(last('b', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' })

        manager.close('a')
        expect(last('a', 'closed')).toEqual({ type: 'closed', by: 'a' })
        expect(last('b', 'closed')).toEqual({ type: 'closed', by: 'a' })
        expect(manager.summaries()).toEqual([])

        // They're out: their karts no longer go anywhere.
        manager.pose('b', POSE)
        manager.tick()
        expect(inboxes.get('a')!.filter(m => m.type === 'karts')).toEqual([])
    })

    test("a lobby can be closed from the Hub's list, even mid-race", () => {
        join('a', 1)
        startRace('a')

        expect(manager.closeLobby('lobby1')).toBe(true)
        expect(last('a', 'closed')).toEqual({ type: 'closed', by: null })
        expect(manager.closeLobby('lobby1')).toBe(false)
        expect(results).toEqual([])
    })

    test('a full lobby turns you away', () => {
        join('p0', null)
        for (let i = 1; i < MAX_RACERS; i++) join(`p${i}`, null, 'lobby1')
        join('late', null, 'lobby1')

        expect(last('late', 'error')).toEqual({ type: 'error', code: 'LOBBY_FULL' })
        expect(manager.summaries()[0]!.players).toBe(MAX_RACERS)
    })

    test('the same player in a second tab replaces the first', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        join('b2', 2, 'lobby1')

        expect(last('b', 'error')).toEqual({ type: 'error', code: 'REPLACED' })
        expect(lobbyOf('a').members.map(m => m.id)).toEqual(['a', 'b2'])
    })

    test('the host leaving hands the lobby on; the last one out closes it', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        manager.leave('a')
        expect(lobbyOf('b').hostId).toBe('b')

        manager.leave('b')
        expect(manager.summaries()).toEqual([])
    })

    test('karts in the lobby see each other, not themselves', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        manager.pose('a', { ...POSE, x: 5 })
        manager.tick()

        expect(last('b', 'karts')!.karts).toEqual([{ id: 'a', pose: { ...POSE, x: 5 } }])
        expect(last('a', 'karts')!.karts).toEqual([])
    })
})

describe('races', () => {
    test('only the host starts; everyone gets a grid slot in join order and a countdown', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        manager.start('b')
        expect(last('b', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' })

        manager.start('a')
        // The test track has no route: no snacks.
        expect(last('b', 'countdown')).toEqual({ type: 'countdown', slots: { a: 0, b: 1 }, seconds: 3, snacks: [] })
        expect(lobbyOf('b').phase).toBe('countdown')

        now += 3000
        manager.tick()
        expect(lobbyOf('b').phase).toBe('racing')
        expect(manager.summaries()[0]!.phase).toBe('racing')
    })

    test('everyone in a lobby sees the same sky, and a new one is rolled after each race', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        const before = lobbyOf('a').sky
        expect(lobbyOf('b').sky).toEqual(before)

        startRace('a')
        expect(lobbyOf('a').sky).toEqual(before)
        now += 60_000
        lap('a', 1, 45)
        lap('b', 1, 50)
        expect(lobbyOf('a').phase).toBe('finished')
        expect(rolls).toBe(4)
        expect(lobbyOf('b').sky).toEqual(lobbyOf('a').sky)
    })

    test('the host picks the time of day for every race, between races only; random again on null', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        manager.setTime('b', 'night')
        expect(last('b', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' })

        manager.setTime('a', 'night')
        expect(lobbyOf('b')).toMatchObject({ time: 'night', sky: { time: 'night' } })

        startRace('a')
        manager.setTime('a', 'noon')
        expect(lobbyOf('a').time).toBe('night')
        now += 60_000
        lap('a', 1, 45)
        lap('b', 1, 50)
        // The next race's sky is rolled at night too.
        expect(lobbyOf('a')).toMatchObject({ phase: 'finished', time: 'night', sky: { time: 'night' } })

        manager.setTime('a', null)
        expect(lobbyOf('b').time).toBeNull()
    })

    test('setDensity only takes a whole number from 0 to 10', () => {
        expect(parseClientMessage(JSON.stringify({ type: 'setDensity', density: 7 }))).toEqual({
            type: 'setDensity',
            density: 7,
        })
        for (const density of [-1, 11, 2.5, '3', null]) {
            expect(parseClientMessage(JSON.stringify({ type: 'setDensity', density }))).toBeNull()
        }
    })

    test('setTime only takes a time of day or null', () => {
        expect(parseClientMessage(JSON.stringify({ type: 'setTime', time: 'sunset' }))).toEqual({
            type: 'setTime',
            time: 'sunset',
        })
        expect(parseClientMessage(JSON.stringify({ type: 'setTime', time: null }))).toEqual({
            type: 'setTime',
            time: null,
        })
        expect(parseClientMessage(JSON.stringify({ type: 'setTime', time: 'midnight' }))).toBeNull()
        expect(parseClientMessage(JSON.stringify({ type: 'setTime' }))).toBeNull()
    })

    test('the race ends when everyone is in, with results to the Hub for players only', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        join('guest', null, 'lobby1')
        startRace('a')
        now += 60_000

        lap('b', 1, 50)
        lap('a', 1, 45)
        manager.tick()
        expect(lobbyOf('a').phase).toBe('racing')

        lap('guest', 1, 55)
        const lobby = lobbyOf('a')
        expect(lobby.phase).toBe('finished')
        expect(lobby.results!.map(r => [r.id, r.position, r.time])).toEqual([
            ['a', 1, 45.025],
            ['b', 2, 50.025],
            ['guest', 3, 55.025],
        ])
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            trackId: 7,
            racers: 3,
            rows: [
                { playerId: 1, position: 1, timeMs: 45_025, bestLapMs: 45_025 },
                { playerId: 2, position: 2, timeMs: 50_025, bestLapMs: 50_025 },
            ],
        })
    })

    test('once the winner is in, the rest have a grace period, then they DNF', () => {
        join('a', 1)
        join('b', 2, 'lobby1')
        startRace('a')
        now += 60_000
        lap('a', 1, 45)
        through('b', 0, 2)

        now += FINISH_GRACE_MS - 1
        manager.tick()
        expect(lobbyOf('a').phase).toBe('racing')
        now += 1
        manager.tick()

        expect(lobbyOf('a').results!.map(r => [r.id, r.time])).toEqual([
            ['a', 45.025],
            ['b', null],
        ])
        expect(results[0]!.rows[1]).toEqual({ playerId: 2, position: 2, timeMs: null, bestLapMs: null })
    })

    test('gates only count in order, at a believable speed, on a clock that keeps up with real time', () => {
        join('a', 1)
        startRace('a')
        now += 10_000

        // A jump across the map straight over gate 0 is a reset, not a crossing.
        const gate = square.gates[0]!
        manager.pose('a', POSE, [gate.x - 50, gate.z - 1, 1, gate.x, gate.z + 1, 1.05])
        // Far ahead of the server's clock: ignored.
        through('a', 0, 30)
        manager.tick()
        expect(last('a', 'karts')!.standings).toEqual([{ id: 'a', lap: 0, finishedAt: null }])

        through('a', 0, 2)
        manager.tick()
        expect(last('a', 'karts')!.standings).toEqual([{ id: 'a', lap: 1, finishedAt: null }])
    })

    test('a jump ahead to a gate is no way round the course; R back to the last checkpoint is fine', () => {
        join('a', 1)
        startRace('a')
        now += 60_000
        through('a', 0, 1)

        // Straight to gate 2, skipping gate 1's side of the square: not counted, and gate 2 still isn't next.
        through('a', 2, 5)
        through('a', 1, 6)
        manager.tick()
        expect(last('a', 'karts')!.standings).toEqual([{ id: 'a', lap: 1, finishedAt: null }])

        // R: back on the start line (the last gate crossed), then on through gate 1.
        manager.pose('a', POSE, [0, -100, 10])
        through('a', 1, 20)
        through('a', 2, 30)
        through('a', 3, 40)
        through('a', 0, 50)
        expect(lobbyOf('a').results![0]!.time).toBe(50.025)
    })

    test('late joiners watch: no kart until the race is over, then they race the next', () => {
        join('a', 1)
        startRace('a')
        join('b', 2, 'lobby1')
        manager.pose('b', POSE)
        manager.tick()

        expect(lobbyOf('b').members.find(m => m.id === 'b')!.racing).toBe(false)
        expect(last('a', 'karts')?.karts ?? []).toEqual([])

        now += 60_000
        lap('a', 1, 45)
        expect(lobbyOf('b').phase).toBe('finished')

        manager.start('a')
        expect(last('b', 'countdown')!.slots).toEqual({ a: 0, b: 1 })
    })

    test('when every racer leaves, the lobby goes back to waiting', () => {
        join('a', 1)
        startRace('a')
        join('b', 2, 'lobby1')
        manager.leave('a')

        expect(lobbyOf('b')).toMatchObject({ phase: 'waiting', hostId: 'b' })
        expect(results).toEqual([])
    })
})

/** The square with its route: round the outside, through each gate, 800 m. */
const corners = [0, -100, 100, -100, 100, 0, 100, 100, 0, 100, -100, 100, -100, 0, -100, -100, 0, -100]
const routed: LoadedTrack = {
    ...track,
    route: {
        points: corners,
        along: [0, 100, 200, 300, 400, 500, 600, 700, 800],
        length: 800,
        gateAlong: [0, 200, 400, 600],
    },
}

describe('snacks', () => {
    const at = (id: string, x: number, z: number) => manager.pose(id, { ...POSE, x, z })

    test('a race scatters snacks along the route, as many as the slider says; whoever drives through one first eats it', () => {
        join('a', 1, null, routed)
        join('b', 2, 'lobby1', routed)
        expect(lobbyOf('a').density).toBe(3)
        manager.setDensity('b', 10)
        expect(last('b', 'error')).toEqual({ type: 'error', code: 'NOT_HOST' })
        manager.setDensity('a', 10)
        expect(lobbyOf('b').density).toBe(10)
        startRace('a')
        const snacks = last('a', 'countdown')!.snacks
        expect(snacks.length).toBeGreaterThan(15)

        const snack = snacks[3]!
        at('b', snack.x + 40, snack.z)
        manager.eat('b', snack.id)
        expect(last('b', 'ate')).toBeUndefined()

        at('a', snack.x + 1, snack.z)
        manager.eat('a', snack.id)
        expect(last('b', 'ate')).toEqual({ type: 'ate', snack: snack.id, kind: snack.kind, by: 'a' })
        at('b', snack.x, snack.z)
        manager.eat('b', snack.id)
        expect(last('a', 'ate')!.by).toBe('a')

        now += RESPAWN_MS
        manager.tick()
        expect(last('b', 'respawn')).toEqual({ type: 'respawn', snack: snack.id })
    })

    test('density 0 is a clean race; a race with snacks keeps its times out of the records', () => {
        join('a', 1, null, routed)
        startRace('a')
        expect(last('a', 'countdown')!.snacks.length).toBeGreaterThan(3)
        now += 60_000
        lap('a', 1, 45)
        expect(lobbyOf('a').phase).toBe('finished')
        expect(results).toEqual([])

        manager.setDensity('a', 0)
        expect(lobbyOf('a').density).toBe(0)
        startRace('a')
        expect(last('a', 'countdown')!.snacks).toEqual([])
        now += 60_000
        lap('a', 1, 45)
        expect(results).toHaveLength(1)
    })

    test('a Chipwich puts you just ahead of the kart in front, level with it in the race', () => {
        // Rolls that land on the rarest end of the list: every snack is a Chipwich.
        rolls = 0
        manager = new LobbyManager({
            now: () => now,
            newId: () => `lobby${++ids}`,
            random: () => 0.9999,
            onResults: result => results.push(result),
        })
        join('a', 1, null, routed)
        join('b', 2, 'lobby1', routed)
        startRace('a')
        const snack = last('b', 'countdown')!.snacks[0]!
        expect(snack.kind).toBe('chipwich')
        now += 60_000

        // a is through gate 1 and on its way to gate 2; b is still before it.
        through('a', 0, 1)
        through('a', 1, 10)
        manager.pose('a', { ...POSE, x: 100, z: 50, heading: Math.PI })
        through('b', 0, 1.5)
        at('b', snack.x, snack.z)
        manager.eat('b', snack.id)

        const jump = last('b', 'teleport')!
        expect(jump).toMatchObject({ next: 2, lap: 1 })
        expect(jump.z).toBeCloseTo(60)
        // The jump there counts: b's next step from it is accepted.
        manager.pose('b', POSE, [jump.x, jump.z, 12, jump.x, jump.z + 1, 12.05])
        through('b', 2, 20)
        manager.tick()
        expect(last('b', 'karts')!.standings!.map(s => s.id)).toEqual(['b', 'a'])
    })
})
