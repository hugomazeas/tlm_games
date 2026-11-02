import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { aimDirection, fireShot, rayCapsule, WEAPON } from './combat.ts'
import { PLAYER } from './movement.ts'
import { testWorld } from './testing.ts'
import { officeWorld } from './world.ts'

const AT_ORIGIN = { x: 0, y: 0, z: 0 }

describe('shots', () => {
    test('a shot at the body hits the capsule at its surface', () => {
        const hit = rayCapsule(new Vector3(0, 0.2, -2), new Vector3(0, 0, 1), AT_ORIGIN)

        expect(hit!.distance).toBeCloseTo(2 - PLAYER.radius, 5)
        expect(hit!.along).toBeCloseTo(0.5, 5)
    })

    test('the top of the capsule is the head', () => {
        expect(rayCapsule(new Vector3(0, 0.36, -2), new Vector3(0, 0, 1), AT_ORIGIN)!.along).toBeGreaterThan(0.72)
        // Straight down onto the cap.
        const fromAbove = rayCapsule(new Vector3(0, 2, 0), new Vector3(0, -1, 0), AT_ORIGIN)
        expect(fromAbove!.distance).toBeCloseTo(2 - PLAYER.height, 5)
    })

    test('misses: beside, over the head, behind the shooter', () => {
        expect(rayCapsule(new Vector3(0.2, 0.2, -2), new Vector3(0, 0, 1), AT_ORIGIN)).toBeNull()
        expect(rayCapsule(new Vector3(0, 0.45, -2), new Vector3(0, 0, 1), AT_ORIGIN)).toBeNull()
        expect(rayCapsule(new Vector3(0, 0.2, -2), new Vector3(0, 0, -1), AT_ORIGIN)).toBeNull()
    })

    test('aim follows the camera: yaw 0 looks toward -Z, pitch up looks up', () => {
        const ahead = aimDirection(0, 0)
        expect([ahead.x, ahead.y, ahead.z].map(n => Math.round(n * 1e6) / 1e6)).toEqual([-0, 0, -1])
        expect(aimDirection(Math.PI / 2, 0).x).toBeCloseTo(-1, 6)
        expect(aimDirection(0, 0.5).y).toBeCloseTo(Math.sin(0.5), 6)
    })

    test('the wall takes a shot at someone behind it', () => {
        const world = officeWorld()
        // Flying at 0.4 m in the open office, shooting south over the ottoman.
        const eye = new Vector3(2.8, 0.4 + 0.2, 1.0)
        const south = new Vector3(0, 0, 1)

        expect(fireShot(world, eye, south, [{ id: 'near', x: 2.8, y: 0.4, z: 2.0 }]).hit).toEqual({
            id: 'near',
            headshot: false,
        })
        // Outside, past the window.
        const blocked = fireShot(world, eye, south, [{ id: 'far', x: 2.8, y: 0.4, z: 6.0 }])
        expect(blocked.hit).toBeNull()
        expect(blocked.end.z).toBeLessThan(5.13)
        // A level shot from eye height meets a standing mini's head.
        const level = fireShot(world, new Vector3(2.8, PLAYER.eye, 1.0), south, [{ id: 'near', x: 2.8, y: 0, z: 2.0 }])
        expect(level.hit?.headshot).toBe(true)
    })

    test('the nearest of two in line takes it', () => {
        const world = officeWorld()
        const shot = fireShot(world, new Vector3(2.8, 0.2, 1.0), new Vector3(0, 0, 1), [
            { id: 'second', x: 2.8, y: 0, z: 2.2 },
            { id: 'first', x: 2.8, y: 0, z: 1.6 },
        ])

        expect(shot.hit?.id).toBe('first')
        expect(shot.end.z).toBeCloseTo(1.6 - PLAYER.radius, 4)
    })

    test('the blaster reaches across the office, not further', () => {
        const open = testWorld([])
        const shoot = (z: number) =>
            fireShot(open, new Vector3(0, 0.2, 0), new Vector3(0, 0, 1), [{ id: 'them', x: 0, y: 0, z }])

        expect(shoot(WEAPON.range - 1).hit?.id).toBe('them')
        expect(shoot(WEAPON.range + 1).hit).toBeNull()
        expect(shoot(WEAPON.range + 1).end.z).toBeCloseTo(WEAPON.range, 6)
    })
})
