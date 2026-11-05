import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { aimDirection, GUNS, rayCapsule, spreadDirection } from '../sim/combat.ts'
import { PLAYER } from '../sim/movement.ts'
import {
    aimPitch,
    coneOf,
    falloffCurve,
    gunMetrics,
    hitChance,
    meleeMetrics,
    roundsOf,
    type Situation,
} from './gun-debug.ts'

const STILL: Situation = { aiming: false, moving: false, air: false, distance: 6, aimAt: 'body' }

describe("the gun lab's debug numbers", () => {
    test("the cone adds up the way the server's spreadOf does", () => {
        expect(coneOf('rifle', STILL).total).toBeCloseTo(GUNS.rifle.spread.hip, 9)
        const all = coneOf('rifle', { ...STILL, moving: true, air: true })
        expect(all.total).toBeCloseTo(all.base + all.moving + all.air, 9)
        expect(all.total).toBeCloseTo(GUNS.rifle.spread.hip + GUNS.rifle.spread.moving + GUNS.rifle.spread.air, 9)
        expect(coneOf('sniper', { ...STILL, aiming: true }).total).toBe(0)
        expect(coneOf('launcher', { ...STILL, air: true }).total).toBe(0)
    })

    test('rounds go where the server sends them: same seeded directions, same hits', () => {
        const situation = { ...STILL, moving: true }
        const aim = aimDirection(0, aimPitch(situation))
        const rounds = roundsOf('shotgun', situation, 17)
        expect(rounds).toHaveLength(GUNS.shotgun.pellets)
        for (const [pellet, round] of rounds.entries()) {
            const direction = spreadDirection(aim, coneOf('shotgun', situation).total, 17, pellet)
            expect(round.direction.equals(direction)).toBe(true)
            const met = rayCapsule(new Vector3(0, PLAYER.eye, 0), direction, { x: 0, y: 0, z: -6 })
            expect(round.hit !== null).toBe(met !== null && met.distance <= GUNS.shotgun.range)
        }
    })

    test('aimed close in, everything lands; the head when aiming at it', () => {
        const near = { ...STILL, aiming: true, distance: 2 }
        expect(hitChance('rifle', near).miss).toBe(0)
        expect(hitChance('sniper', { ...near, aimAt: 'head' }).head).toBe(1)
        expect(hitChance('sniper', { ...near, aimAt: 'body' }).body).toBe(1)
        // From the hip, far away, a shotgun's pellets mostly miss.
        expect(hitChance('shotgun', { ...STILL, distance: 9 }).miss).toBeGreaterThan(0.5)
    })

    test('past its range a gun does nothing', () => {
        const far = { ...STILL, aiming: true, distance: GUNS.shotgun.range + 2 }
        expect(hitChance('shotgun', far).miss).toBe(1)
        const atRange = gunMetrics('shotgun', far).find(m => m.label.startsWith('At '))
        expect(atRange?.value).toBe('out of range')
    })

    test('kills: a sniper headshot is one pull, its body shot two', () => {
        const metrics = gunMetrics('sniper', { ...STILL, aiming: true, distance: 10 })
        expect(metrics.find(m => m.label === 'All head')?.value).toStartWith('1 pull ·')
        expect(metrics.find(m => m.label === 'All body')?.value).toStartWith('2 pulls ·')
    })

    test('the falloff graph runs from full damage to the floor of it', () => {
        const curve = falloffCurve('shotgun')
        expect(curve[0]).toEqual([0, GUNS.shotgun.damage * GUNS.shotgun.pellets])
        expect(curve.at(-1)![1]).toBeCloseTo(GUNS.shotgun.damage * GUNS.shotgun.pellets * GUNS.shotgun.falloff![2], 6)
        expect(falloffCurve('launcher')).toEqual([])
    })

    test('the stapler says when the target is in reach', () => {
        expect(meleeMetrics(0.5).at(-1)?.value).toBe('in reach')
        expect(meleeMetrics(3).at(-1)?.value).toContain('out of reach')
    })
})
