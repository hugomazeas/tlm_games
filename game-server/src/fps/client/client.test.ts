import { describe, expect, test } from 'bun:test'
import type { InputFrame, PlayerState } from '../protocol.ts'
import { BUTTON } from '../protocol.ts'
import { bodyAt, moveOf, STEP_MS, stepBody } from '../sim/movement.ts'
import { testWorld } from '../sim/testing.ts'
import { Prediction } from './prediction.ts'
import { INTERP_STEPS, Interpolator, ServerClock } from './timeline.ts'
import { aimFromCamera, THIRD_PERSON, thirdPersonCamera } from './view.ts'
import { targetUnderCrosshair } from './targeting.ts'
import { Viewmodel } from './effects.ts'
import { aimFov, DEFAULT_SETTINGS, LIMITS, parseSettings } from './settings.ts'
import { reloadProgress, spatial } from './sounds.ts'
import { announce, streakCallout, taunt } from './callouts.ts'
import type { GameEvent } from '../protocol.ts'
import { PerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { aimDirection, fireShot } from '../sim/combat.ts'

describe('the announcer', () => {
    const names: Record<string, string> = { me: 'Ann', bob: 'Bob', cat: 'Cat' }
    const name = (id: string | null) => (id ? (names[id] ?? '?') : '?')
    const kill = (over: Partial<Extract<GameEvent, { type: 'kill' }>> = {}): Extract<GameEvent, { type: 'kill' }> => ({
        type: 'kill',
        killer: 'me',
        victim: 'bob',
        headshot: false,
        weapon: 'blaster',
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
    })

    test('aiming zooms in to a bit over half the field of view', () => {
        expect(aimFov(78)).toBe(45)
        expect(aimFov(100)).toBe(58)
    })
})

describe('iron sights', () => {
    test('fully aimed, the front sight sits on the crosshair; at the hip, low and to the right', () => {
        const camera = new PerspectiveCamera(78, 1, 0.01, 100)
        const blaster = new Viewmodel(camera, '#e4572e')
        const tipInView = () => {
            camera.updateMatrixWorld(true)
            return camera.worldToLocal(blaster.sightTip.getWorldPosition(new Vector3()))
        }

        blaster.update(0, false, 1)
        const aimed = tipInView()
        expect(Math.abs(aimed.x)).toBeLessThan(1e-9)
        expect(Math.abs(aimed.y)).toBeLessThan(1e-9)
        expect(aimed.z).toBeLessThan(0)

        blaster.update(0, false, 0)
        const hip = tipInView()
        expect(hip.x).toBeGreaterThan(0.02)
        expect(hip.y).toBeLessThan(0)
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
        weapon: 'blaster',
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
})
