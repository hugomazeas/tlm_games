import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { BUTTON, type InputFrame } from '../protocol.ts'
import { Arena, MAX_BURST, SHIELD_STEPS } from './arena.ts'
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
