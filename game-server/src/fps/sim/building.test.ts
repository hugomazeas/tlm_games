import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { createRng } from '../../sim/rng.ts'
import { BUTTON, type InputFrame, type WallKind, type WallSpec } from '../protocol.ts'
import { Arena, type ArenaEvent } from './arena.ts'
import { buildSlot, supported } from './building.ts'
import { aimDirection, GUNS } from './combat.ts'
import { bodyAt, moveOf, PLAYER, stepBody } from './movement.ts'
import { testWorld } from './testing.ts'
import { BUILD } from './walls.ts'
import { rayHit } from './world.ts'

const S = BUILD.size
const T = BUILD.thickness

function room() {
    return testWorld([{ name: 'middle', position: [0, 0, 0], yaw: 0 }])
}

let nextId = 1
function put(world: ReturnType<typeof room>, spec: WallSpec, by = 'someone', kind: WallKind = 'wall', open = false) {
    return world.walls.add({ ...spec, id: nextId++, by, team: null, health: BUILD.health, kind, open })
}

const idle = (yaw = 0, forward = 0) => moveOf({ forward, strafe: 0, yaw, buttons: 0 })

describe('built walls are solid', () => {
    test('walking into a standing wall stops at it', () => {
        const world = room()
        put(world, { axis: 'z', x: 0, y: S / 2, z: -0.5 })
        let body = bodyAt(0, 0, 0)
        for (let i = 0; i < 120; i++) body = stepBody(world, body, idle(0, 1))

        expect(body.z).toBeGreaterThan(-0.5 + T / 2 + PLAYER.radius - 0.005)
    })

    test('a flat wall is a floor to stand on', () => {
        const world = room()
        put(world, { axis: 'y', x: 0, y: 0.3, z: 0 })
        let body = bodyAt(0, 0.5, 0)
        for (let i = 0; i < 60; i++) body = stepBody(world, body, idle())

        expect(body.y).toBeCloseTo(0.3 + T / 2, 2)
        expect(body.onGround).toBe(true)
    })

    test('a wall put down on a player pushes them out of it', () => {
        const world = room()
        put(world, { axis: 'z', x: 0, y: S / 2, z: 0.02 })
        const body = stepBody(world, bodyAt(0, 0, 0), idle())

        expect(Math.abs(body.z - 0.02)).toBeGreaterThanOrEqual(T / 2 + PLAYER.radius - 0.001)
    })

    test('a ray stops on it and says which wall, facing the ray', () => {
        const world = room()
        const wall = put(world, { axis: 'z', x: 0, y: S / 2, z: -2 })
        const hit = rayHit(world, new Vector3(0, 0.3, 0), new Vector3(0, 0, -1), 10)!

        expect(hit.wall?.id).toBe(wall.id)
        expect(hit.distance).toBeCloseTo(2 - T / 2, 5)
        expect(hit.normal.z).toBe(1)
    })
})

describe('build mode puts the next wall', () => {
    const eye = new Vector3(0, PLAYER.eye, 0)

    test('anywhere: standing on the floor where the crosshair is, facing you', () => {
        const world = room()
        // The floor within reach.
        const down = aimDirection(0, -0.6)
        const slot = buildSlot(world, eye, down, { flat: false, turned: false })

        expect(slot.wall.axis).toBe('z')
        expect(slot.wall.y).toBeCloseTo(S / 2, 3)
        expect(slot.on).toBeNull()
        // R turns it a quarter; the wheel lays it flat on the floor.
        expect(buildSlot(world, eye, down, { flat: false, turned: true }).wall.axis).toBe('x')
        const flat = buildSlot(world, eye, down, { flat: true, turned: false }).wall
        expect(flat.axis).toBe('y')
        expect(flat.y).toBeCloseTo(T / 2, 3)
    })

    test('aimed at a wall: in line with it, past the edge nearest the crosshair', () => {
        const world = room()
        const wall = put(world, { axis: 'z', x: 0, y: S / 2, z: -1 })
        const at = (x: number, y: number) => new Vector3(x, y, -1).sub(eye).normalize()
        const standing = { flat: false, turned: false }

        const right = buildSlot(world, eye, at(0.2, 0.3), standing)
        expect(right.on).toBe(wall.id)
        expect(right.wall).toEqual({ axis: 'z', x: S, y: S / 2, z: -1 })
        expect(buildSlot(world, eye, at(0.05, 0.55), standing).wall).toEqual({ axis: 'z', x: 0, y: 0.9, z: -1 })
    })

    test('turned or flat off a wall: hinged on its edge, on your side of it (a corner, a roof)', () => {
        const world = room()
        put(world, { axis: 'z', x: 0, y: S / 2, z: -1 })
        const at = (x: number, y: number) => new Vector3(x, y, -1).sub(eye).normalize()

        expect(buildSlot(world, eye, at(0.2, 0.3), { flat: false, turned: true }).wall).toEqual({
            axis: 'x',
            x: S / 2,
            y: S / 2,
            z: -1 + S / 2,
        })
        expect(buildSlot(world, eye, at(0, 0.5), { flat: true, turned: false }).wall).toEqual({
            axis: 'y',
            x: 0,
            y: S,
            z: -1 + S / 2,
        })
    })

    test('a slot already built is taken', () => {
        const world = room()
        put(world, { axis: 'z', x: 0, y: S / 2, z: -1 })
        put(world, { axis: 'z', x: S, y: S / 2, z: -1 })
        const slot = buildSlot(world, eye, new Vector3(0.2, 0.3, -1).sub(eye).normalize(), {
            flat: false,
            turned: false,
        })

        expect(slot.taken).toBe(true)
    })

    test('only touching something: the floor, the office, another wall; never in mid air', () => {
        const world = testWorld([], [{ min: [-2, 0, -1.5], max: [2, 2, -1.4] }])
        // On the floor, against the office's wall, snapped onto a built one: all fine.
        expect(supported(world, { axis: 'z', x: 0, y: S / 2, z: 0 })).toBe(true)
        expect(supported(world, { axis: 'z', x: 0, y: 1.2, z: -1.4 + T / 2 })).toBe(true)
        put(world, { axis: 'z', x: 0, y: S / 2, z: 0 })
        expect(supported(world, { axis: 'z', x: 0, y: S / 2 + S, z: 0 })).toBe(true)
        // In the air, a hand's width off anything: no.
        expect(supported(world, { axis: 'z', x: 0, y: S / 2 + 0.1, z: 1 })).toBe(false)
        expect(supported(world, { axis: 'z', x: 0, y: S * 2 + 0.1, z: 0 })).toBe(false)
        // Aimed at nothing within reach, the slot hangs in the air: not supported.
        const up = buildSlot(room(), eye, aimDirection(0, 0.3), { flat: false, turned: false })
        expect(up.supported).toBe(false)
    })
})

describe('the arena builds and breaks walls', () => {
    test('refuses a wall in mid air', () => {
        const arena = new Arena(room(), createRng(3))
        arena.add('me')
        expect(arena.build('me', { axis: 'z', x: 0, y: S / 2 + 0.2, z: -1 })).toBe(false)
        expect(arena.build('me', { axis: 'z', x: 0, y: S / 2, z: -1 })).toBe(true)
    })

    function game() {
        const world = room()
        const arena = new Arena(world, createRng(3))
        arena.add('me')
        return { world, arena }
    }
    const before: WallSpec = { axis: 'z', x: 0, y: S / 2, z: -1 }
    const all = (arena: Arena, steps = 1) => {
        const events: ArenaEvent[] = []
        for (let i = 0; i < steps; i++) events.push(...arena.advance())
        return events
    }
    /** Fire held for `n` steps, a frame a step (looking down -z). */
    const fire = (arena: Arena, n: number, frame: Partial<InputFrame> = {}) => {
        const events: ArenaEvent[] = []
        for (let seq = 1; seq <= n; seq++) {
            const base = { seq, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: BUTTON.fire, view: 0 }
            arena.queue('me', [{ ...base, ...frame }])
            events.push(...arena.advance())
        }
        return events
    }

    test('a wall within reach goes up, for everyone to see; out of reach, taken or too quick it does not', () => {
        const { arena } = game()
        expect(arena.build('me', before)).toBe(true)
        expect(all(arena)).toContainEqual({ type: 'built', wall: expect.objectContaining({ ...before, by: 'me' }) })
        expect(arena.build('me', { ...before, x: S })).toBe(false) // too quick
        all(arena, BUILD.everySteps)
        expect(arena.build('me', before)).toBe(false) // taken
        expect(arena.build('me', { ...before, z: -BUILD.reach - 2 })).toBe(false) // out of reach
        expect(arena.build('me', { ...before, x: S })).toBe(true)
        expect(arena.wallStates()).toHaveLength(2)
    })

    test('shots wear a wall down, then break it', () => {
        const { arena } = game()
        arena.build('me', before)
        all(arena)
        const events = fire(arena, RIFLE_FRAMES)

        expect(events.some(e => e.type === 'wallHit')).toBe(true)
        expect(events).toContainEqual({ type: 'wallGone', id: expect.any(Number), broken: true })
        expect(arena.wallStates()).toHaveLength(0)
    })

    test('rockets take one down: two of them', () => {
        const { arena } = game()
        arena.setLoadout('me', { primary: 'rifle', secondary: 'launcher' })
        arena.build('me', before)
        all(arena)
        // A click a rocket (the launcher fires on a click), until it's down (2 min at most: reloads included).
        const events: ArenaEvent[] = []
        for (let seq = 1; seq <= 7200 && arena.wallStates().length > 0; seq++) {
            const buttons = seq % 20 < 10 ? BUTTON.fire : 0
            arena.queue('me', [{ seq, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons, view: 0, slot: 'secondary' }])
            events.push(...arena.advance())
        }
        const hits = events.filter(e => e.type === 'wallHit')

        // A direct hit: about 535 of its 1050 (it goes off just short of it).
        const left = (hits[0] as { health: number }).health
        expect(BUILD.health - left).toBeGreaterThan(525)
        expect(BUILD.health - left).toBeLessThan(550)
        expect(events).toContainEqual({ type: 'wallGone', id: expect.any(Number), broken: true })
        expect(events.filter(e => e.type === 'launch')).toHaveLength(2)
    })

    test('a teammate cannot shoot down their side’s wall', () => {
        const { arena } = game()
        arena.add('mate', 'red')
        arena.setTeam('me', 'red')
        arena.build('mate', { ...before, z: -1.2 })
        all(arena)
        // The mate's wall right in front.
        fire(arena, RIFLE_FRAMES)

        expect(arena.wallStates()).toEqual([expect.objectContaining({ by: 'mate', health: BUILD.health })])
    })

    test('you take back only your own walls; a leaver’s stay up, nobody’s', () => {
        const { arena } = game()
        arena.add('other', 'red')
        arena.add('mate', 'red')
        arena.build('me', before)
        arena.build('other', { ...before, z: -0.5, axis: 'x' })
        all(arena)
        const mine = arena.wallStates().find(w => w.by === 'me')!
        const theirs = arena.wallStates().find(w => w.by === 'other')!
        arena.reshape('other', theirs.id, 'door')

        expect(arena.unbuild('me', theirs.id)).toBe(false)
        expect(arena.unbuild('me', mine.id)).toBe(true)
        arena.remove('other')
        const events = all(arena)
        expect(events.some(e => e.type === 'wallGone' && e.id === theirs.id)).toBe(false)
        expect(events).toContainEqual({
            type: 'wallChanged',
            wall: expect.objectContaining({ id: theirs.id, by: null, team: null, kind: 'door' }),
        })
        expect(arena.wallStates()).toEqual([expect.objectContaining({ id: theirs.id, by: null })])
        // Nobody inherits it: not their teammate, not the one who rejoins (a new connection).
        expect(arena.door('mate', theirs.id)).toBe(false)
        arena.add('other')
        expect(arena.door('other', theirs.id)).toBe(false)
        expect(arena.unbuild('other', theirs.id)).toBe(false)
    })

    test('a new match wipes them', () => {
        const { arena } = game()
        arena.build('me', before)
        all(arena)

        expect(arena.respawnAll()).toContainEqual({ type: 'walls', walls: [] })
        expect(arena.wallStates()).toHaveLength(0)
    })

    test('past the limit your oldest wall comes down', () => {
        const { world, arena } = game()
        for (let i = 0; i < BUILD.max; i++) {
            put(world, { axis: 'y', x: (i % 10) * S - 3, y: 0.01, z: Math.floor(i / 10) * S - 3 }, 'other')
        }
        const first = world.walls.all[0]!
        expect(arena.build('me', before)).toBe(true)

        expect(world.walls.count).toBe(BUILD.max)
        expect(world.walls.get(first.id)).toBeUndefined()
    })
})

describe('doors and windows', () => {
    /** A standing wall across the way at z = -0.5, its foot on the floor. */
    const across: WallSpec = { axis: 'z', x: 0, y: S / 2, z: -0.5 }
    const walkThrough = (world: ReturnType<typeof room>) => {
        let body = bodyAt(0, 0, 0)
        for (let i = 0; i < 90; i++) body = stepBody(world, body, idle(0, 1))
        return body.z
    }
    const rayAt = (world: ReturnType<typeof room>, height: number) =>
        rayHit(world, new Vector3(0, height, 0), new Vector3(0, 0, -1), 5)?.wall ?? null

    test('a window: rounds and eyes pass the slit at eye height, nobody gets through it', () => {
        const world = room()
        put(world, across, 'me', 'window')

        expect(rayAt(world, PLAYER.eye)).toBeNull()
        expect(rayAt(world, 0.1)).not.toBeNull()
        expect(rayAt(world, 0.5)).not.toBeNull()
        expect(walkThrough(world)).toBeGreaterThan(-0.5)
    })

    test('a door: shut it stops you and the rounds; open you walk through the doorway, not through its leaf', () => {
        const world = room()
        const door = put(world, across, 'me', 'door')
        expect(walkThrough(world)).toBeGreaterThan(-0.5)
        expect(rayAt(world, 0.2)).not.toBeNull()

        world.walls.add({ ...door, open: true })
        expect(rayAt(world, 0.2)).toBeNull()
        expect(walkThrough(world)).toBeLessThan(-0.8)
        // The leaf stands swung out on its hinge (the -x post), into +z: solid there.
        const hinge = -S / 2 + 0.04
        const intoLeaf = rayHit(world, new Vector3(hinge - 0.5, 0.2, -0.3), new Vector3(1, 0, 0), 1)
        expect(intoLeaf?.wall?.id).toBe(door.id)
    })

    function game() {
        const world = room()
        const arena = new Arena(world, createRng(3))
        arena.add('me')
        arena.add('mate')
        arena.add('enemy')
        arena.build('me', { axis: 'z', x: 0, y: S / 2, z: -0.7 })
        arena.advance()
        return { world, arena, id: arena.wallStates()[0]!.id }
    }

    test('your wall becomes a door you open and shut; a window for good; never a flat one', () => {
        const { arena, id } = game()
        expect(arena.door('me', id)).toBe(false) // not a door yet
        expect(arena.reshape('me', id, 'door')).toBe(true)
        expect(arena.door('me', id)).toBe(true)
        expect(arena.advance()).toContainEqual({
            type: 'wallChanged',
            wall: expect.objectContaining({ id, kind: 'door', open: true }),
        })
        expect(arena.reshape('me', id, 'window')).toBe(false) // a door stays a door

        const second = game()
        expect(second.arena.reshape('me', second.id, 'window')).toBe(true)
        expect(second.arena.reshape('me', second.id, 'door')).toBe(false)
        expect(second.arena.wallStates()[0]!.kind).toBe('window')

        const flat = game()
        flat.world.walls.add({ ...flat.world.walls.all[0]!, axis: 'y' })
        expect(flat.arena.reshape('me', flat.id, 'door')).toBe(false)
    })

    test('only its builder, or their side in team deathmatch, may change it', () => {
        const { arena, id } = game()
        expect(arena.reshape('enemy', id, 'door')).toBe(false)
        expect(arena.reshape('mate', id, 'door')).toBe(false) // no sides: theirs alone

        const teams = game()
        teams.arena.setTeam('me', 'red')
        teams.arena.setTeam('mate', 'red')
        teams.arena.setTeam('enemy', 'blue')
        teams.arena.build('me', { axis: 'z', x: S, y: S / 2, z: -0.7 })
        // Built after the sides were picked: it's red's.
        for (let i = 0; i < BUILD.everySteps; i++) teams.arena.advance()
        teams.arena.build('me', { axis: 'z', x: S, y: S / 2, z: -0.7 })
        const red = teams.arena.wallStates().find(w => w.team === 'red')!
        expect(teams.arena.reshape('enemy', red.id, 'door')).toBe(false)
        expect(teams.arena.reshape('mate', red.id, 'door')).toBe(true)
        expect(teams.arena.door('mate', red.id)).toBe(true)
        expect(teams.arena.door('enemy', red.id)).toBe(false)
    })
})

/** Rifle frames for enough rounds to break a wall (with some missing). */
const RIFLE_FRAMES = Math.ceil((BUILD.health / GUNS.rifle.damage) * 1.5) * ((GUNS.rifle.intervalMs * 60) / 1000)
