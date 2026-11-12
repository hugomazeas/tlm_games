import { describe, expect, test } from 'bun:test'
import type { InputFrame, PlayerState } from '../protocol.ts'
import { BUTTON } from '../protocol.ts'
import { bodyAt, moveOf, STEP_MS, stepBody } from '../sim/movement.ts'
import { testWorld } from '../sim/testing.ts'
import { Prediction } from './prediction.ts'
import { INTERP_STEPS, Interpolator, ServerClock } from './timeline.ts'
import { aimFromCamera, THIRD_PERSON, thirdPersonCamera } from './view.ts'
import { targetUnderCrosshair } from './targeting.ts'
import { Viewmodel } from './viewmodel.ts'
import { aimFov, DEFAULT_SETTINGS, LIMITS, parseSettings } from './settings.ts'
import { reloadProgress, spatial } from './sounds.ts'
import { announce, streakCallout, taunt } from './callouts.ts'
import type { GameEvent } from '../protocol.ts'
import { PerspectiveCamera, Scene } from 'three'
import { Avatars, fallAngle, hitRock, reloadStart } from './avatars.ts'
import { Vector3 } from 'three'
import { aimDirection, fireShot, reloadMsOf } from '../sim/combat.ts'
import { BLOOD, bloodCells, deathRecap } from './hud.ts'
import { MouseFilter } from './controls.ts'
import { bottleneck, FrameStats, HITCH_MS } from './perf.ts'

describe('the death recap', () => {
    const recap = {
        distance: 12.4,
        killerHealth: 37,
        ammo: 18,
        magazine: 30,
        buffs: [],
        hits: 4,
        damage: 100,
        headshots: 2,
        timeMs: 620,
        othersDamage: 0,
    }

    test('tells the gun, the range, what your killer had left and what it took them', () => {
        const html = deathRecap({ weapon: 'rifle', headshot: true, backstab: false, recap })
        const parts = ['Assault rifle', 'headshot', '12.4 m away', '37 / 100', '18 / 30', '4 for 100 damage']
        for (const part of [...parts, '2 to the head', '0.6 s']) expect(html).toContain(part)
        expect(html).not.toContain('From others')
        expect(html).not.toContain('Their powers')
    })

    test('an empty magazine, help from others, powers; the stapler has no magazine; one shot is one shot', () => {
        const empty = deathRecap({
            weapon: 'sniper',
            headshot: true,
            backstab: false,
            recap: { ...recap, ammo: 0, magazine: 5, hits: 1, othersDamage: 30, buffs: ['headshot'] },
        })
        expect(empty).toContain('empty')
        expect(empty).toContain('30 damage')
        expect(empty).toContain('One-shot headshots')
        expect(empty).toContain('one shot')

        const stapler = { ...recap, ammo: null, magazine: null }
        const stapled = deathRecap({ weapon: 'stapler', headshot: false, backstab: true, recap: stapler })
        expect(stapled).toContain('from behind')
        expect(stapled).not.toContain('Their magazine')
    })

    test('your own rocket: just the gun', () => {
        expect(deathRecap({ weapon: 'launcher', headshot: false, backstab: false })).toContain('Launcher')
    })
})

describe('the announcer', () => {
    const names: Record<string, string> = { me: 'Ann', bob: 'Bob', cat: 'Cat' }
    const name = (id: string | null) => (id ? (names[id] ?? '?') : '?')
    const kill = (over: Partial<Extract<GameEvent, { type: 'kill' }>> = {}): Extract<GameEvent, { type: 'kill' }> => ({
        type: 'kill',
        killer: 'me',
        victim: 'bob',
        headshot: false,
        weapon: 'rifle',
        backstab: false,
        killerStreak: 1,
        victimStreak: 0,
        ...over,
    })

    test('streaks are called at 2, 3, 5, 7, 10 and 15 kills in a life, and only then', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 10, 15].map(n => streakCallout(n)?.title ?? null)).toEqual([
            null,
            'DOUBLE KILL',
            'TRIPLE KILL',
            null,
            'RAMPAGE',
            null,
            'UNSTOPPABLE',
            'OFFICE TYRANT',
            'EXCEEDS EXPECTATIONS',
        ])
    })

    test('your streak is your banner; everyone reads it in the feed', () => {
        const yours = announce(kill({ killerStreak: 5 }), 'me', name)
        expect(yours.banner).toMatchObject({ title: 'RAMPAGE' })
        expect(yours.feed).toEqual(['🔥 Ann is on a rampage'])

        const theirs = announce(kill({ killerStreak: 5 }), 'cat', name)
        expect(theirs.banner).toBeNull()
        expect(theirs.feed).toEqual(['🔥 Ann is on a rampage'])
    })

    test('ending a streak of 3 or more is a shutdown; the first kill is first blood', () => {
        expect(announce(kill({ victimStreak: 4 }), 'me', name)).toEqual({
            banner: { title: 'SHUTDOWN', sub: 'Bob had 4 in a row', level: 3 },
            feed: ["🛑 Ann ended Bob's 4-kill streak"],
        })
        expect(announce(kill({ victimStreak: 2 }), 'me', name)).toEqual({ banner: null, feed: [] })
        expect(announce(kill({ firstBlood: true }), 'me', name).banner).toMatchObject({ title: 'FIRST BLOOD' })
    })

    test('the taunt fits how you went down', () => {
        const first = () => 0
        expect(taunt(kill({ weapon: 'stapler', backstab: true }), first)).toContain('back')
        expect(taunt(kill({ weapon: 'stapler' }), first)).toContain('Stapled')
        expect(taunt(kill({ headshot: true }), first)).toContain('quarterly')
        expect(typeof taunt(kill(), () => 0.999)).toBe('string')
    })
})

describe('sound placement and the reload ring', () => {
    // Looking toward -Z (yaw 0): +X is to the right.
    const me = { x: 0, z: 0, yaw: 0 }

    test('a sound to your right pans right, to your left pans left, ahead is centred', () => {
        expect(spatial(me, { x: 3, z: 0 }).pan).toBeCloseTo(1, 6)
        expect(spatial(me, { x: -3, z: 0 }).pan).toBeCloseTo(-1, 6)
        expect(spatial(me, { x: 0, z: -3 }).pan).toBeCloseTo(0, 6)
        // Turned to face +X (yaw -π/2), that sound is now ahead.
        expect(spatial({ ...me, yaw: -Math.PI / 2 }, { x: 3, z: 0 }).pan).toBeCloseTo(0, 6)
    })

    test('nearer is louder, never quite silent across the office', () => {
        const near = spatial(me, { x: 0.5, z: 0 }).gain
        const far = spatial(me, { x: 15, z: 0 }).gain
        expect(near).toBeGreaterThan(far)
        expect(spatial(me, { x: 0, z: 0 }).gain).toBe(1)
        expect(spatial(me, { x: 200, z: 0 }).gain).toBeGreaterThan(0)
    })

    test("the reload ring fills as what's left runs down", () => {
        expect(reloadProgress(null, 1200)).toBeNull()
        expect(reloadProgress(1200, 1200)).toBe(0)
        expect(reloadProgress(300, 1200)).toBeCloseTo(0.75, 6)
        expect(reloadProgress(0, 1200)).toBe(1)
    })
})

describe('settings', () => {
    test('read back as saved, the defaults for anything missing or broken, numbers clamped', () => {
        expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
        expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS)
        expect(parseSettings(JSON.stringify({ sensitivity: 2.5, invertY: true }))).toEqual({
            ...DEFAULT_SETTINGS,
            sensitivity: 2.5,
            invertY: true,
        })
        expect(parseSettings(JSON.stringify({ sensitivity: 99, fov: 10, aimSensitivity: 'x', invertY: 1 }))).toEqual({
            ...DEFAULT_SETTINGS,
            sensitivity: LIMITS.sensitivity.max,
            fov: LIMITS.fov.min,
        })
        // Older saves have neither: full resolution, no overlay; a resolution can't go below half.
        expect(parseSettings(JSON.stringify({ resolution: 0.1, perfOverlay: true, antialias: false }))).toEqual({
            ...DEFAULT_SETTINGS,
            resolution: LIMITS.resolution.min,
            perfOverlay: true,
            antialias: false,
        })
        expect(parseSettings(JSON.stringify({ antialias: 'off' })).antialias).toBe(true)
    })

    test('aiming zooms in to a bit over half the field of view', () => {
        expect(aimFov(78)).toBe(45)
        expect(aimFov(100)).toBe(58)
    })
})

describe('the blood (low health)', () => {
    const cols = 64
    const rows = 36
    const shown = (cells: Uint8Array) => cells.reduce((n, c) => n + (c > 0 ? 1 : 0), 0)

    test('none at full health; blocks creep in from the edges as it drops, never through the middle', () => {
        expect(shown(bloodCells(0, cols, rows))).toBe(0)
        const half = bloodCells(0.5, cols, rows)
        const full = bloodCells(1, cols, rows)
        expect(shown(half)).toBeGreaterThan(0)
        expect(shown(full)).toBeGreaterThan(shown(half) * 1.4)
        // The corners bleed; the crosshair's middle stays clear.
        expect(full[0]).toBeGreaterThan(0)
        expect(full[cols * rows - 1]).toBeGreaterThan(0)
        expect(full[(rows / 2) * cols + cols / 2]).toBe(0)
        // A block that shows keeps showing as it gets worse.
        for (let i = 0; i < half.length; i++) if (half[i]! > 0) expect(full[i]).toBeGreaterThan(0)
    })

    test('darkest at the edge, brightest at the rim, the same every time', () => {
        const full = bloodCells(1, cols, rows)
        expect(full[(rows / 2) * cols]).toBe(1)
        expect([...full].some(c => c === 3)).toBe(true)
        expect(bloodCells(1, cols, rows)).toEqual(full)
        expect(BLOOD.colors.length).toBe(4)
    })
})

describe('the mouse', () => {
    /** Everything a run of movements turns you by (px), 25 ms apart (40 fps: one movement a frame). */
    const turned = (filter: MouseFilter, moves: Array<[number, number]>, from = 0) => {
        const total = { dx: 0, dy: 0 }
        moves.forEach(([dx, dy], i) => {
            const move = filter.accept(dx, dy, from + i * 25)
            total.dx += move?.dx ?? 0
            total.dy += move?.dy ?? 0
        })
        return total
    }
    const steady = Array.from({ length: 10 }, (): [number, number] => [12, -3])

    test('a lone huge movement amid ordinary ones is thrown away (the half turn the mouse never made)', () => {
        const filter = new MouseFilter()
        turned(filter, steady)
        const spike: Array<[number, number]> = [
            [-1430, 4],
            [10, 0],
            [12, -3],
        ]
        expect(turned(filter, spike, 300)).toEqual({ dx: 22, dy: -3 })
        expect(filter.spikes).toBe(1)
        expect(filter.largestSpike).toBe(1430)
        // Thrown away going the same way too, when what follows is ordinary.
        const sameWay: Array<[number, number]> = [
            [1430, 0],
            [12, 0],
        ]
        expect(turned(filter, sameWay, 400)).toEqual({ dx: 12, dy: 0 })
        expect(filter.spikes).toBe(2)
    })

    test('a flick from a still aim turns you all the way, however sudden its start', () => {
        const filter = new MouseFilter()
        turned(filter, steady)
        const flick: Array<[number, number]> = [
            [30, 2],
            [30, 0],
            [400, 6],
            [450, 4],
            [200, -2],
            [20, 0],
        ]
        expect(turned(filter, flick, 300)).toEqual({ dx: 1130, dy: 10 })
        expect(filter.spikes).toBe(0)
        expect(filter.takePeak()).toBe(450)
    })

    test('a spike and one back the other way: neither turns you', () => {
        const filter = new MouseFilter()
        turned(filter, steady)
        const backAndForth: Array<[number, number]> = [
            [-900, 0],
            [900, 0],
            [10, 0],
        ]
        expect(turned(filter, backAndForth, 300)).toEqual({ dx: 10, dy: 0 })
        expect(filter.spikes).toBe(2)
    })

    test('right after the mouse is taken, anything sizeable is thrown away', () => {
        const filter = new MouseFilter()
        filter.locked(1000)
        expect(filter.accept(200, 0, 1010)).toBeNull()
        expect(filter.accept(5, 0, 1020)).toEqual({ dx: 5, dy: 0 })
        expect(filter.accept(200, 0, 1200)).toEqual({ dx: 200, dy: 0 })
    })
})

describe('the performance overlay', () => {
    const cpu = { sim: 1, scene: 2, hud: 0.5, render: 4 }

    test('frame rate, spread, the slowest frames and the hitches', () => {
        const stats = new FrameStats()
        let now = 0
        for (let i = 0; i < 120; i++) {
            now += i === 60 ? 80 : 20
            stats.record(now, cpu, i === 60)
        }
        const s = stats.summary(now)!
        // 50 frames a second over the last one (none slow in it), with one 80 ms stutter earlier.
        expect(s.fps).toBeCloseTo(50, 0)
        expect(s.worstMs).toBe(80)
        expect(s.p95Ms).toBe(20)
        expect(s.low1Fps).toBeCloseTo(12.5, 1)
        expect(s.cpuMs).toBeCloseTo(7.5, 6)
        expect(s.hitches).toBe(1)
        expect(s.compileHitches).toBe(1)
        expect(stats.summary(now + HITCH_MS * 400)!.hitches).toBe(0)
    })

    test('what holds the frames back', () => {
        // Seen on a Radeon 890M at 3200×1718: the game's code 1.8 ms, render 14.3 ms of waiting, the GPU 12.4 ms.
        expect(bottleneck(18.9, 1.8, 14.3, 12.4)).toBe('gpu')
        expect(bottleneck(25, 16, 4, 6)).toBe('cpu')
        expect(bottleneck(16.7, 2, 3, 6)).toBe('vsync')
        // The GPU's drawing quick, the frame still waiting in render: the browser's own GPU work.
        expect(bottleneck(25, 2, 18, 6)).toBe('likely-gpu')
        // No GPU timer: the game's code idle in a slow frame points at the GPU.
        expect(bottleneck(25, 2, 18, null)).toBe('likely-gpu')
        expect(bottleneck(25, 16, 2, null)).toBe('cpu')
        expect(bottleneck(16.7, 2, 3, null)).toBe('vsync')
    })
})

describe('iron sights', () => {
    test('fully aimed, every gun’s front sight sits on the crosshair; at the hip, low and to the right', () => {
        const camera = new PerspectiveCamera(78, 1, 0.01, 100)
        camera.position.set(3, 0.3, -2)
        camera.rotation.set(0.2, 1.1, 0, 'YXZ')
        const hands = new Viewmodel('#e4572e')
        hands.follow(camera)
        const tipInView = () => {
            camera.updateMatrixWorld(true)
            return camera.worldToLocal(hands.sightTip.getWorldPosition(new Vector3()))
        }

        for (const gun of ['rifle', 'sniper', 'shotgun', 'pistol', 'launcher'] as const) {
            hands.hold(gun, -1e6)
            hands.update(0, false, 1)
            const aimed = tipInView()
            expect(Math.abs(aimed.x)).toBeLessThan(1e-6)
            expect(Math.abs(aimed.y)).toBeLessThan(1e-6)
            expect(aimed.z).toBeLessThan(0)

            hands.update(0, false, 0)
            const hip = tipInView()
            expect(hip.x).toBeGreaterThan(0.02)
            expect(hip.y).toBeLessThan(0)
        }
    })

    test('every gun runs through its reload, its hands always somewhere sensible', () => {
        const hands = new Viewmodel('#e4572e')
        for (const gun of ['rifle', 'sniper', 'shotgun', 'pistol', 'launcher'] as const) {
            hands.hold(gun, -1e6)
            for (let t = 0; t <= 1; t += 0.01) hands.update(1000, false, 0, t)
            hands.update(1000, false, 0, null)
        }
        // Each hand stays within reach of the view (nothing NaN, nothing flung away).
        hands.scene.traverse(o => {
            expect(Number.isFinite(o.position.x + o.position.y + o.position.z)).toBe(true)
            expect(o.position.length()).toBeLessThan(5)
        })
    })
})

describe('who the crosshair is on', () => {
    // A wall across x = 2, nothing else.
    const room = testWorld([], [{ min: [2, 0, -5], max: [2.2, 3, 5] }])
    const eye = new Vector3(0, 0.34, 0)
    const at = (id: string, x: number, z: number, alive = true) => ({ id, x, y: 0, z, alive })
    // Looking toward -Z.
    const ahead = new Vector3(0, 0, -1)

    test('the player in the middle of the view, a little off-centre still counts', () => {
        expect(targetUnderCrosshair(room, eye, ahead, [at('a', 0, -3)])).toBe('a')
        expect(targetUnderCrosshair(room, eye, ahead, [at('a', 0.2, -3)])).toBe('a')
        expect(targetUnderCrosshair(room, eye, ahead, [at('a', 1, -3)])).toBeNull()
    })

    test('the nearest to the centre line wins; the dead and the far away do not count', () => {
        expect(targetUnderCrosshair(room, eye, ahead, [at('off', 0.15, -3), at('dead on', 0, -5)])).toBe('dead on')
        expect(targetUnderCrosshair(room, eye, ahead, [at('a', 0, -3, false)])).toBeNull()
        expect(targetUnderCrosshair(room, eye, ahead, [at('a', 0, -40)])).toBeNull()
    })

    test('not through a wall', () => {
        const east = new Vector3(1, 0, 0)
        expect(targetUnderCrosshair(room, eye, east, [at('behind', 4, 0)])).toBeNull()
        expect(targetUnderCrosshair(room, eye, east, [at('before', 1.5, 0)])).toBe('before')
    })
})

describe('third person', () => {
    // A wall 1 m behind (at z = +1), one 3 m ahead (at z = -3), looking toward -Z.
    const room = testWorld(
        [],
        [
            { min: [-5, 0, 1], max: [5, 3, 1.2] },
            { min: [-5, 0, -3.2], max: [5, 3, -3] },
        ]
    )
    const eye = new Vector3(0, 0.34, 0)

    test('sits behind and over the right shoulder', () => {
        const camera = thirdPersonCamera(room, eye, 0, 0)

        expect(camera.z).toBeCloseTo(THIRD_PERSON.back, 5)
        expect(camera.x).toBeCloseTo(THIRD_PERSON.shoulder, 5)
        expect(camera.y).toBeCloseTo(eye.y + THIRD_PERSON.up, 5)
    })

    test('pulls in before a wall behind, never through it', () => {
        const camera = thirdPersonCamera(room, new Vector3(0, 0.34, 0.6), 0, 0)

        expect(camera.z).toBeLessThan(1)
        expect(camera.z).toBeGreaterThan(0.6)
    })

    test('the shot from the eyes lands where the crosshair is', () => {
        const target = { id: 't', x: 0.14, y: 0, z: -2.5 }
        const camera = thirdPersonCamera(room, eye, 0, 0)
        // Looking down the camera's centre at the target's middle.
        const look = new Vector3(target.x, 0.2, target.z).sub(camera).normalize()
        const yaw = Math.atan2(-look.x, -look.z)
        const pitch = Math.asin(look.y)
        const aim = aimFromCamera(room, eye, camera, yaw, pitch)

        expect(fireShot(room, eye, aimDirection(aim.yaw, aim.pitch), [target]).hit?.id).toBe('t')
    })
})

const world = testWorld([{ name: 'here', position: [0, 0, 0], yaw: 0 }])

function frames(n: number): InputFrame[] {
    return Array.from({ length: n }, (_, i) => ({
        seq: i + 1,
        forward: 1,
        strafe: i % 20 < 10 ? 1 : -1,
        yaw: i * 0.01,
        pitch: 0,
        buttons: i % 30 < 12 ? BUTTON.jet : 0,
        view: 0,
    }))
}

describe('prediction', () => {
    test('replaying the frames the server has not used yet lands where the browser already was', () => {
        const all = frames(60)
        const prediction = new Prediction(world)
        prediction.body = bodyAt(0, 0, 0)
        for (const f of all) prediction.apply(f, true)
        const drawn = prediction.body!

        // The server is 40 frames behind, and agrees on everything so far.
        let server = bodyAt(0, 0, 0)
        for (const f of all.slice(0, 40)) server = stepBody(world, server, moveOf(f))
        const correction = prediction.reconcile(40, server, true)

        expect(Math.hypot(correction.x, correction.y, correction.z)).toBeLessThan(1e-9)
        expect(prediction.body).toEqual(drawn)
        expect(prediction.unacknowledged).toBe(20)
    })

    test('a snapshot that agrees replays nothing, however far behind the server is', () => {
        let collisions = 0
        const counted = {
            ...world,
            get meshes() {
                collisions++
                return world.meshes
            },
        }
        const all = frames(120)
        const prediction = new Prediction(counted)
        prediction.body = bodyAt(0, 0, 0)
        for (const f of all) prediction.apply(f, true)
        let server = bodyAt(0, 0, 0)
        for (const f of all.slice(0, 10)) server = stepBody(world, server, moveOf(f))

        collisions = 0
        prediction.reconcile(10, server, true)
        expect(collisions).toBe(0)
        // The server moved them (a rocket's push): the rest is replayed from there.
        prediction.reconcile(10, { ...server, vx: server.vx + 3 }, true)
        expect(collisions).toBeGreaterThan(0)
        expect(prediction.unacknowledged).toBe(110)
    })

    test('a power the server gave (a pickup) reaches the prediction, even where it agrees on the rest', () => {
        const all = frames(20)
        const prediction = new Prediction(world)
        prediction.body = bodyAt(0, 0, 0)
        for (const f of all) prediction.apply(f, true)
        let server = bodyAt(0, 0, 0)
        for (const f of all.slice(0, 10)) server = stepBody(world, server, moveOf(f))

        // A Promotion taken on frame 10: same place, same speed, but a giant from here on.
        prediction.reconcile(10, { ...server, big: 1200 }, true)
        expect(prediction.body!.big).toBe(1200 - 10)
    })

    test('when the server disagrees (a respawn), the browser follows it and says how far it jumped', () => {
        const prediction = new Prediction(world)
        prediction.body = bodyAt(0, 0, 0)
        for (const f of frames(10)) prediction.apply(f, true)
        const correction = prediction.reconcile(10, bodyAt(5, 0, 0), true)

        expect(prediction.body).toEqual(bodyAt(5, 0, 0))
        expect(correction.x).toBeLessThan(-4)
    })

    test('down, the frames are kept but nothing moves', () => {
        const prediction = new Prediction(world)
        prediction.body = bodyAt(1, 0, 1)
        for (const f of frames(5)) prediction.apply(f, false)

        expect(prediction.body).toEqual(bodyAt(1, 0, 1))
        expect(prediction.unacknowledged).toBe(5)
    })
})

describe('the server clock', () => {
    test('runs the server step forward between snapshots, and draws the others a bit behind', () => {
        const clock = new ServerClock()
        expect(clock.step(0)).toBeNull()
        clock.heard(300, 1000)

        expect(clock.step(1000 + 10 * STEP_MS)).toBeCloseTo(310, 6)
        expect(clock.renderStep(1000)).toBeCloseTo(300 - INTERP_STEPS, 6)
    })

    test('a late snapshot barely moves it; a big jump (a restart) resets it', () => {
        const clock = new ServerClock()
        clock.heard(300, 1000)
        clock.heard(300, 1000 + 4 * STEP_MS)
        expect(clock.step(1000)!).toBeGreaterThan(299.7)

        clock.heard(5, 2000)
        expect(clock.step(2000)).toBeCloseTo(5, 6)
    })
})

describe('drawing the others', () => {
    const at = (id: string, x: number, alive = true): PlayerState => ({
        id,
        x,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        alive,
        health: 100,
        weapon: 'rifle',
        aiming: false,
        prone: false,
        reload: null,
        team: null,
        buffs: [],
        jet: false,
        shielded: false,
    })

    test('between two snapshots, in proportion', () => {
        const timeline = new Interpolator()
        timeline.push(30, [at('a', 0)])
        timeline.push(33, [at('a', 0.3)])

        expect(timeline.sample(31).get('a')!.x).toBeCloseTo(0.1, 6)
        // Past the newest: held there.
        expect(timeline.sample(40).get('a')!.x).toBeCloseTo(0.3, 6)
    })

    test('a respawn or a newcomer appears where they are, without sliding', () => {
        const timeline = new Interpolator()
        timeline.push(30, [at('a', 0, false)])
        timeline.push(33, [at('a', 5), at('b', 2)])

        expect(timeline.sample(31).get('a')!.x).toBe(5)
        expect(timeline.sample(31).get('b')!.x).toBe(2)
    })

    test('turns the short way round', () => {
        const timeline = new Interpolator()
        timeline.push(30, [{ ...at('a', 0), yaw: 3.1 }])
        timeline.push(32, [{ ...at('a', 0), yaw: -3.1 }])

        expect(Math.abs(timeline.sample(31).get('a')!.yaw)).toBeGreaterThan(3.1)
    })

    describe('their troopers', () => {
        const roster = new Map([['a', { id: 'a', name: 'A', color: '#ff0000', playerId: null, watching: false }]])
        const posed = (state: Partial<PlayerState>) => {
            const s = { ...at('a', 0), ...state }
            return new Map([['a', { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, state: s }]])
        }
        const scene = () => new Scene()

        test('a reload plays smoothly from the reports, restarting only when they disagree', () => {
            // Reported 25% through a 2 s reload at 1000: it started at 500.
            expect(reloadStart(null, 0.25, 2000, 1000)).toBe(500)
            // A later report a little off: the smooth clock is kept.
            expect(reloadStart(500, 0.5, 2000, 1560)).toBe(500)
            // Far off (a new reload): restarted.
            expect(reloadStart(500, 0.1, 2000, 3000)).toBe(2800)
            expect(reloadStart(500, null, 2000, 3000)).toBeNull()
        })

        test('a hit rocks them and lets go; a fall speeds up to the floor and settles there', () => {
            expect(hitRock(-1)).toBe(0)
            expect(hitRock(50)).toBeCloseTo(1, 6)
            expect(hitRock(1000)).toBe(0)
            expect(fallAngle(0)).toBe(0)
            expect(fallAngle(100)).toBeLessThan(fallAngle(300) / 3)
            expect(fallAngle(3000)).toBeCloseTo(Math.PI / 2, 3)
        })

        test("others' tracers start at their gun's muzzle, ahead of them, at chest height", () => {
            const avatars = new Avatars(scene())
            avatars.update(posed({}), roster, null, 1000)
            const muzzle = avatars.muzzleOf('a')!
            // They face -Z: the muzzle is out in front, between the belt and the eyes.
            expect(muzzle.z).toBeLessThan(-0.2)
            expect(muzzle.y).toBeGreaterThan(0.15)
            expect(muzzle.y).toBeLessThan(0.34)

            // Aiming brings it up toward the eye.
            for (let now = 1016; now < 1600; now += 16) avatars.update(posed({ aiming: true }), roster, null, now)
            expect(avatars.muzzleOf('a')!.y).toBeGreaterThan(muzzle.y + 0.04)
            // The stapler has no muzzle.
            avatars.update(posed({ weapon: 'stapler' }), roster, null, 1700)
            expect(avatars.muzzleOf('a')).toBeNull()
        })

        test('killed, they stay to fall and lie a moment, then are gone until they are back', () => {
            const avatars = new Avatars(scene())
            avatars.update(posed({}), roster, null, 1000)
            avatars.hit('a', 1000, [0, 0.3, -3])
            avatars.update(posed({ alive: false }), roster, null, 1050)
            expect(avatars.centerOf('a')).not.toBeNull()
            expect(avatars.muzzleOf('a')).toBeNull()
            avatars.update(posed({ alive: false }), roster, null, 5000)
            expect(avatars.centerOf('a')).toBeNull()
            avatars.update(posed({ x: 2 }), roster, null, 6000)
            expect(avatars.centerOf('a')!.x).toBe(2)
            expect(avatars.muzzleOf('a')).not.toBeNull()
        })

        test('a reload is heard once, from its start (not when they come into view half way through)', () => {
            const heard: Array<[string, string, number]> = []
            const avatars = new Avatars(scene(), (id, gun, msLeft) => heard.push([id, gun, Math.round(msLeft)]))
            avatars.update(posed({ reload: 0.6 }), roster, null, 1000)
            avatars.update(posed({}), roster, null, 1100)
            avatars.update(posed({ reload: 0 }), roster, null, 1200)
            avatars.update(posed({ reload: 0.02 }), roster, null, 1240)
            expect(heard).toEqual([['a', 'rifle', reloadMsOf('rifle')]])
        })

        test('seen dead the first time, they are not drawn falling', () => {
            const avatars = new Avatars(scene())
            avatars.update(posed({ alive: false }), roster, null, 1000)
            expect(avatars.centerOf('a')).toBeNull()
        })
    })
})
