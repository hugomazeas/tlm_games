import { describe, expect, test } from 'bun:test'
import type { InputFrame, PlayerState } from '../protocol.ts'
import { BUTTON } from '../protocol.ts'
import { bodyAt, STEP_MS, stepBody } from '../sim/movement.ts'
import { testWorld } from '../sim/testing.ts'
import { moveOf, Prediction } from './prediction.ts'
import { INTERP_STEPS, Interpolator, ServerClock } from './timeline.ts'

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
