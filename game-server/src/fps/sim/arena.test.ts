import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { BUTTON, type InputFrame } from '../protocol.ts'
import { Arena, MAX_BURST, SHIELD_STEPS } from './arena.ts'
import { STAPLER, WEAPON } from './combat.ts'
import { type Body, bodyAt, MOVE, moveOf, stepBody } from './movement.ts'
import { testWorld } from './testing.ts'

const world = testWorld([{ name: 'middle', position: [0, 0, 0], yaw: 0 }])

function arena(): Arena {
    const a = new Arena(world, createRng(3))
    a.add('me')
    return a
}

function frames(from: number, n: number, buttons: number = 0): InputFrame[] {
    return Array.from({ length: n }, (_, i) => ({
        seq: from + i,
        forward: 1,
        strafe: (from + i) % 40 < 20 ? 0.5 : -0.5,
        yaw: (from + i) * 0.01,
        pitch: 0,
        buttons,
        view: 0,
    }))
}

describe('inputs are used as they arrive, never queued', () => {
    test('a late batch is caught up in one step, landing exactly where the browser predicted', () => {
        const a = arena()
        const start = a.self('me')!.body
        for (let i = 0; i < 10; i++) a.advance()

        const late = frames(1, 10)
        a.queue('me', late)
        a.advance()

        expect(a.ack('me')).toBe(10)
        const predicted = late.reduce((b: Body, f) => stepBody(world, b, moveOf(f)), start)
        expect(a.self('me')!.body).toEqual(predicted)
    })

    test('frames arriving one a step are used the step they arrive: nothing waits', () => {
        const a = arena()
        for (let seq = 1; seq <= 120; seq++) {
            a.queue('me', frames(seq, 1))
            a.advance()
            expect(a.ack('me')).toBe(seq)
        }
    })

    test('flooding frames moves nobody faster than real time (plus one burst)', () => {
        const a = arena()
        const start = a.self('me')!.body
        let seq = 1
        const steps = 120
        for (let i = 0; i < steps; i++) {
            a.queue('me', frames(seq, 3))
            seq += 3
            a.advance()
        }
        const end = a.self('me')!.body
        const allowed = (MOVE.walk * (steps + MAX_BURST)) / 60

        expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(allowed + 0.01)
    })

    test('a frozen tab falls instead of hanging in the air', () => {
        const a = arena()
        a.queue('me', frames(1, 40, BUTTON.jet))
        for (let i = 0; i < 40; i++) a.advance()
        const up = a.self('me')!.body.y
        expect(up).toBeGreaterThan(0.3)

        for (let i = 0; i < 20; i++) a.advance()
        expect(a.self('me')!.body.y).toBe(up)
        for (let i = 0; i < 120; i++) a.advance()
        expect(a.self('me')!.body.y).toBeLessThan(0.05)
    })

    test('a shot says what it did: nothing on a spawn shield, then the damage once it is down', () => {
        // Two spawns 4 m apart on the Z axis: whoever is at one can shoot the other.
        const pair = testWorld([
            { name: 'north', position: [0, 0, -2], yaw: Math.PI },
            { name: 'south', position: [0, 0, 2], yaw: 0 },
        ])
        const a = new Arena(pair, createRng(1))
        a.add('a')
        a.add('b')
        const me = a.self('a')!.body
        const them = a.states().find(s => s.id === 'b')!
        const dz = them.z - me.z
        // Aim at their chest.
        const aim = {
            forward: 0,
            strafe: 0,
            yaw: dz < 0 ? 0 : Math.PI,
            pitch: Math.atan2(0.2 - 0.34, Math.abs(dz)),
            buttons: BUTTON.fire,
            view: 0,
        }
        const fire = (seq: number) => {
            a.queue('a', [{ ...aim, seq, view: a.step }])
            return a.advance().find(e => e.type === 'shot')
        }

        expect(fire(1)).toMatchObject({ hit: 'b', damage: 0 })
        let seq = 2
        for (let i = 0; i < SHIELD_STEPS; i++) {
            a.queue('a', [{ ...aim, seq: seq++, buttons: 0 }])
            a.advance()
        }
        expect(fire(seq)).toMatchObject({ hit: 'b', damage: 20 })
        expect(a.states().find(s => s.id === 'b')!.health).toBe(80)
    })

    test("the blaster's cadence follows the player's frames, even caught up in one step", () => {
        const a = arena()
        for (let i = 0; i < 30; i++) a.advance()
        a.queue('me', frames(1, 28, BUTTON.fire))
        const shots = a.advance().filter(e => e.type === 'shot')

        // Frames 1, 10, 19 and 28: one every 150 ms of theirs.
        expect(shots).toHaveLength(4)
        expect(a.self('me')!.ammo).toBe(8)
    })
})

describe('reloading', () => {
    test('an empty magazine reloads by itself, counting down what is left, then refills', () => {
        const a = arena()
        for (let i = 0; i < 30; i++) a.advance()
        // Twelve shots, one every 9 frames, a frame a step: the last one empties it.
        for (let i = 0; i < 12 * 9 - 8; i++) {
            a.queue('me', frames(i + 1, 1, BUTTON.fire))
            a.advance()
        }

        const started = a.self('me')!
        expect(started.ammo).toBe(0)
        expect(started.reloading).toBe(true)
        expect(started.reloadLeftMs).toBeGreaterThan(WEAPON.reloadMs - 200)
        expect(started.reloadLeftMs).toBeLessThanOrEqual(WEAPON.reloadMs)

        // Half way through: about half left.
        let seq = 12 * 9 - 7
        const wait = (steps: number) => {
            for (let i = 0; i < steps; i++) {
                a.queue('me', frames(seq++, 1))
                a.advance()
            }
        }
        wait(36)
        expect(a.self('me')!.reloadLeftMs).toBeCloseTo(started.reloadLeftMs! - 600, -2)

        wait(40)
        const done = a.self('me')!
        expect([done.reloading, done.reloadLeftMs, done.ammo]).toEqual([false, null, WEAPON.magazine])
    })
})

describe('the stapler', () => {
    /**
     * Two minis `gap` apart on the Z axis, facing as given (yaw π faces +Z, 0 faces -Z). The one
     * at z = 0 swings at the one further along, aiming +Z at their chest.
     */
    function standOff(nearYaw: number, farYaw: number, gap = 0.5) {
        const a = new Arena(
            testWorld([
                { name: 'near', position: [0, 0, 0], yaw: nearYaw },
                { name: 'far', position: [0, 0, gap], yaw: farYaw },
            ]),
            createRng(2)
        )
        a.add('x')
        a.add('y')
        const near = a.self('x')!.body.z < gap / 2 ? 'x' : 'y'
        const far = near === 'x' ? 'y' : 'x'
        let seq = 0
        const frame = (buttons: number, weapon: 'blaster' | 'stapler' = 'stapler'): InputFrame => ({
            seq: ++seq,
            forward: 0,
            strafe: 0,
            yaw: Math.PI,
            pitch: Math.atan2(0.2 - 0.34, gap),
            buttons,
            view: a.step,
            weapon,
        })
        /** One step of the near one's frame; the events it gave. */
        const step = (buttons: number, weapon?: 'blaster' | 'stapler') => {
            a.queue(near, [frame(buttons, weapon)])
            return a.advance()
        }
        // Stapler out, past the spawn shields.
        for (let i = 0; i < SHIELD_STEPS + 1; i++) step(0)

        return { a, near, far, step }
    }

    test('face to face: half their health a swing, two swings down, and a cooldown in between', () => {
        const { a, near, far, step } = standOff(Math.PI, 0)
        expect(step(BUTTON.fire)).toContainEqual({
            type: 'swing',
            by: near,
            hit: far,
            damage: STAPLER.damage,
            backstab: false,
        })
        expect(a.states().find(s => s.id === far)!.health).toBe(100 - STAPLER.damage)

        // Again at once: still swinging.
        expect(step(BUTTON.fire).filter(e => e.type === 'swing')).toEqual([])
        let events: ReturnType<typeof step> = []
        for (let i = 0; i < 60 && !events.some(e => e.type === 'swing'); i++) events = step(BUTTON.fire)
        expect(events).toContainEqual(
            expect.objectContaining({ type: 'kill', killer: near, victim: far, weapon: 'stapler', backstab: false })
        )
    })

    test('from behind: a backstab, down in one', () => {
        const { near, far, step } = standOff(Math.PI, Math.PI)
        const events = step(BUTTON.fire)

        expect(events).toContainEqual({ type: 'swing', by: near, hit: far, damage: STAPLER.backstab, backstab: true })
        expect(events).toContainEqual(expect.objectContaining({ type: 'kill', weapon: 'stapler', backstab: true }))
    })

    test('out of reach: a swing at the air', () => {
        const { near, step } = standOff(Math.PI, 0, 1.2)
        expect(step(BUTTON.fire)).toContainEqual({ type: 'swing', by: near, hit: null, damage: 0, backstab: false })
    })

    test('switching weapons takes a moment before the new one works', () => {
        const { a, near, step } = standOff(Math.PI, 0)
        // To the blaster and fire at once: nothing yet.
        expect(step(BUTTON.fire, 'blaster').filter(e => e.type === 'shot')).toEqual([])
        expect(a.self(near)!.weapon).toBe('blaster')
        let fired = false
        let waited = 0
        for (; waited < 60 && !fired; waited++) fired = step(BUTTON.fire, 'blaster').some(e => e.type === 'shot')
        expect(fired).toBe(true)
        expect(waited).toBeGreaterThan(10)
        expect(a.states().find(s => s.id === near)!.weapon).toBe('blaster')
    })
})
