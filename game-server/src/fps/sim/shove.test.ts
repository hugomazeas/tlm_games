import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { BUTTON, type InputFrame, type Slot } from '../protocol.ts'
import { Arena, SHIELD_STEPS } from './arena.ts'
import { STEP_MS } from './movement.ts'
import { BOWLING } from './places.ts'
import { batHit, inCone, knockOf, SHOVE, stunOf } from './shove.ts'
import { testWorld } from './testing.ts'
import type { PickupSpot } from './places.ts'

describe("Shove's numbers", () => {
    test('a hit throws further the higher the %, less far the heavier', () => {
        expect(knockOf(3, 0)).toBe(3)
        expect(knockOf(3, 100)).toBeCloseTo(6)
        expect(knockOf(3, 200)).toBeCloseTo(9)
        expect(knockOf(3, 100, 4)).toBeCloseTo(1.5)
    })

    test('a throw stuns for a while by its speed, the blower’s nudges not at all', () => {
        expect(stunOf(1)).toBe(0)
        expect(stunOf(4)).toBe(24)
        expect(stunOf(100)).toBe(SHOVE.stunMax)
    })

    test('the bat: a tap and a full wind-up', () => {
        expect(batHit(0)).toEqual({ percent: SHOVE.bat.percent[0], knock: SHOVE.bat.knock[0] })
        expect(batHit(1)).toEqual({ percent: SHOVE.bat.percent[1], knock: SHOVE.bat.knock[1] })
        expect(batHit(5)).toEqual(batHit(1))
    })

    test('a cone: in front within reach, not beside, not behind, not too far', () => {
        expect(inCone(1, 0, 0, 1, 0, 0, 1.6, 0.4)).toBe(true)
        expect(inCone(1, 0.3, 0, 1, 0, 0, 1.6, 0.4)).toBe(true)
        expect(inCone(1, 1, 0, 1, 0, 0, 1.6, 0.4)).toBe(false)
        expect(inCone(-1, 0, 0, 1, 0, 0, 1.6, 0.4)).toBe(false)
        expect(inCone(2, 0, 0, 1, 0, 0, 1.6, 0.4)).toBe(false)
    })
})

/**
 * Two minis `apart` m apart facing each other, with Shove's kit, past their spawn shields; `wall`: a
 * wall 0.6 m behind the southern one (they stay in reach, however hard they're thrown).
 */
function face(apart = 1, wall = false, pickups: PickupSpot[] = []) {
    const room = testWorld(
        [
            { name: 'north', position: [0, 0, -apart / 2], yaw: Math.PI },
            { name: 'south', position: [0, 0, apart / 2], yaw: 0 },
        ],
        // One behind each: the thrown one, and the one the extinguisher kicks back.
        wall
            ? [
                  { min: [-3, 0, apart / 2 + 0.6], max: [3, 2, apart / 2 + 0.8] },
                  { min: [-3, 0, -apart / 2 - 0.5], max: [3, 2, -apart / 2 - 0.3] },
              ]
            : [],
        pickups
    )
    const a = new Arena(room, createRng(1))
    a.setKit('shove')
    a.add('a')
    a.add('b')
    const seqs = { a: 0, b: 0 }
    const north = a.self('a')!.body.z < 0 ? 'a' : 'b'
    const south = north === 'a' ? 'b' : 'a'
    const step = (inputs: Partial<Record<'a' | 'b', Partial<InputFrame> & { slot?: Slot }>> = {}) => {
        for (const id of ['a', 'b'] as const) {
            const yaw = id === north ? Math.PI : 0
            const frame = { forward: 0, strafe: 0, yaw, pitch: 0, buttons: 0, view: a.step, ...inputs[id] }
            a.queue(id, [{ ...frame, seq: ++seqs[id] }])
        }
        return a.advance()
    }
    for (let i = 0; i < SHIELD_STEPS + 2; i++) step()
    return { a, step, north: north as 'a' | 'b', south: south as 'a' | 'b' }
}

describe('Shove in the arena', () => {
    test('the kit is the tools, nobody has health to lose, everyone starts at 0%', () => {
        const { a, north } = face()
        expect(a.self(north)).toMatchObject({ weapon: 'blower', percent: 0, health: 100 })
        expect(a.states().find(s => s.id === north)).toMatchObject({ weapon: 'blower', percent: 0 })
    })

    test('the extinguisher throws them away and up, adds its %, kicks you back, and waits to fire again', () => {
        const { a, step, north, south } = face()
        // Switch to it (a moment), then fire.
        for (let i = 0; i < 30; i++) step({ [north]: { slot: 'secondary' } })
        const events = step({ [north]: { slot: 'secondary', buttons: BUTTON.fire } })
        const spray = events.find(e => e.type === 'spray')
        expect(spray).toMatchObject({ by: north, hits: [{ id: south, percent: SHOVE.extinguisher.percent }] })
        const them = a.self(south)!
        expect(them.percent).toBe(SHOVE.extinguisher.percent)
        // North faces +z (yaw π): they're thrown south, and up.
        expect(them.body.vz).toBeGreaterThan(2)
        expect(them.body.vy).toBeGreaterThan(0.5)
        expect(them.body.stun).toBeGreaterThan(0)
        // The kick back, north (standing: your feet take most of it).
        const kicked = a.self(north)!.body
        expect(kicked.vz).toBeCloseTo(-SHOVE.extinguisher.recoil * SHOVE.extinguisher.groundRecoil, 1)
        // Still cooling down: no second blast.
        expect(step({ [north]: { slot: 'secondary', buttons: BUTTON.fire } }).some(e => e.type === 'spray')).toBe(false)
        // A short slide, not a skate off the edge.
        for (let i = 0; i < 90; i++) step({ [north]: { slot: 'secondary' } })
        expect(kicked.z - a.self(north)!.body.z).toBeLessThan(0.8)
    })

    test('the blower pushes them steadily away and their % creeps up', () => {
        const { a, step, north, south } = face()
        const before = a.self(south)!.body.z
        for (let i = 0; i < 60; i++) step({ [north]: { buttons: BUTTON.fire } })
        const them = a.self(south)!
        expect(them.body.z - before).toBeGreaterThan(0.3)
        expect(them.percent).toBeGreaterThanOrEqual(SHOVE.blower.percentPerSecond - 1)
        expect(a.states().find(s => s.id === north)!.blowing).toBe(true)
    })

    test('the bat: wound up, it adds more and throws harder than a tap', () => {
        const swing = (hold: number) => {
            const { a, step, north, south } = face(0.5)
            for (let i = 0; i < 30; i++) step({ [north]: { slot: 'melee' } })
            for (let i = 0; i < hold; i++) step({ [north]: { slot: 'melee', buttons: BUTTON.fire } })
            const events = step({ [north]: { slot: 'melee' } })
            const hit = events.find(e => e.type === 'swing')
            return { hit, them: a.self(south)! }
        }
        const tap = swing(1)
        const full = swing(Math.ceil(SHOVE.bat.chargeMs / STEP_MS) + 5)
        expect(tap.hit).toMatchObject({ weapon: 'bat', damage: SHOVE.bat.percent[0] })
        expect(full.hit).toMatchObject({ weapon: 'bat', damage: SHOVE.bat.percent[1], charge: 1 })
        expect(full.them.body.vz).toBeGreaterThan(tap.them.body.vz * 1.5)
    })

    test('the higher their %, the harder the same blast throws them', () => {
        const thrownAt = (blasts: number) => {
            // A wall behind them keeps them in reach; the throw's lift says how hard it was.
            const { a, step, north, south } = face(1, true)
            for (let i = 0; i < 30; i++) step({ [north]: { slot: 'secondary' } })
            let lift = 0
            for (let n = 0; n < blasts; n++) {
                for (let i = 0; i < 80; i++) step({ [north]: { slot: 'secondary' } })
                step({ [north]: { slot: 'secondary', buttons: BUTTON.fire } })
                lift = a.self(south)!.body.vy
            }
            return { lift, percent: a.self(south)!.percent! }
        }
        const first = thrownAt(1)
        const later = thrownAt(6)
        expect(first.percent).toBe(SHOVE.extinguisher.percent)
        expect(later.percent).toBe(SHOVE.extinguisher.percent * 6)
        expect(later.lift).toBeGreaterThan(first.lift * 1.3)
    })

    test('grab (E) holds them up in front of you; a click throws them', () => {
        const { a, step, north, south } = face(0.5)
        expect(step({ [north]: { buttons: BUTTON.grab } }).find(e => e.type === 'grab')).toMatchObject({
            by: north,
            target: south,
        })
        expect(a.shoveThings().holds).toEqual([[north, south]])
        for (let i = 0; i < 10; i++) step({ [north]: { yaw: Math.PI + 0.5 } })
        // Carried in front of the holder, wherever they turn.
        const them = a.self(south)!.body
        const me = a.self(north)!.body
        expect(them.held).toBe(true)
        expect(Math.hypot(them.x - me.x, them.z - me.z)).toBeCloseTo(0.3, 1)

        step({ [north]: { buttons: BUTTON.fire } })
        expect(a.shoveThings().holds).toEqual([])
        expect(a.self(south)).toMatchObject({ percent: SHOVE.grab.percent })
        expect(a.self(south)!.body.held).toBe(false)
        expect(Math.hypot(a.self(south)!.body.vx, a.self(south)!.body.vz)).toBeGreaterThan(3)
    })

    test('held, enough presses of Space break free; else they drop after a while', () => {
        const { a, step, north, south } = face(0.5)
        step({ [north]: { buttons: BUTTON.grab } })
        for (let i = 0; i < SHOVE.grab.mash; i++) {
            step({ [south]: { buttons: BUTTON.jet } })
            step()
        }
        expect(a.shoveThings().holds).toEqual([])

        step()
        step({ [north]: { buttons: BUTTON.grab } })
        expect(a.shoveThings().holds).toHaveLength(1)
        for (let i = 0; i < Math.ceil(SHOVE.grab.holdMs / STEP_MS) + 2; i++) step()
        expect(a.shoveThings().holds).toEqual([])
    })

    test('a bowling ball rolls off the way you face and bowls them over', () => {
        // The pickup just behind the northern spawn: they back onto it, facing south.
        const { a, step, north, south } = face(1.2, false, [{ x: 0, z: -1.2, kind: 'bowling', room: 'here' }])
        let struck = false
        for (let i = 0; i < 120 && !struck; i++) {
            step({ [north]: { forward: a.shoveThings().balls.length ? 0 : -1 } })
            struck = (a.self(south)!.percent ?? 0) > 0
        }
        expect(a.self(south)!.percent).toBe(BOWLING.percent)
        expect(a.self(south)!.body.vz).toBeGreaterThan(2)
    })

    test('a spring trap (G) goes off under the next one to step on it, not its owner', () => {
        const { a, step, north, south } = face(1, false, [{ x: 0, z: -0.5, kind: 'spring', room: 'here' }])
        expect(a.self(north)!.buffs.map(b => b.kind)).toContain('spring')
        step({ [north]: { buttons: BUTTON.drop } })
        expect(a.shoveThings().traps).toHaveLength(1)
        // The owner steps off it; the other walks over it once it's armed.
        for (let i = 0; i < 40; i++) step({ [north]: { forward: -1 } })
        let sprung
        for (let i = 0; i < 120 && !sprung; i++) {
            sprung = step({ [south]: { forward: 1 } }).find(e => e.type === 'sprung')
        }
        expect(sprung).toMatchObject({ on: south })
        expect(a.self(south)!.body.vy).toBeGreaterThan(5)
        expect(a.shoveThings().traps).toEqual([])
    })

    test('a gust drifts whoever stands, not whoever lies prone', () => {
        const { a, step, north, south } = face()
        a.setWind(1.5, 0)
        const start = { n: a.self(north)!.body.x, s: a.self(south)!.body.x }
        for (let i = 0; i < 60; i++) step({ [south]: { buttons: BUTTON.prone } })
        expect(a.self(north)!.body.x - start.n).toBeGreaterThan(0.8)
        expect(Math.abs(a.self(south)!.body.x - start.s)).toBeLessThan(0.05)
    })
})
