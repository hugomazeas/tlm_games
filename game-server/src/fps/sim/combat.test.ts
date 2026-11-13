import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import {
    aimDirection,
    damageAt,
    fireShot,
    GUNS,
    HEAD_FROM,
    HIT_RADIUS,
    magazineOf,
    rayBody,
    spreadDirection,
    spreadOf,
} from './combat.ts'
import { bodyAt, PLAYER } from './movement.ts'
import { testWorld } from './testing.ts'
import { officeWorld } from './world.ts'

const AT_ORIGIN = { x: 0, y: 0, z: 0 }

describe('shots', () => {
    test('a shot at the chest meets the body at its front, not a fat capsule round it', () => {
        const hit = rayBody(new Vector3(0, 0.27, -2), new Vector3(0, 0, 1), AT_ORIGIN)

        expect(hit!.distance).toBeGreaterThan(2 - 0.045)
        expect(hit!.distance).toBeLessThan(2 - 0.02)
        expect(hit!.head).toBe(false)
        expect(hit!.along).toBeCloseTo(0.27 / PLAYER.height, 3)
    })

    test('shots take a player as their drawn body: beside the chest, between the legs, over the shoulder miss', () => {
        expect(HIT_RADIUS).toBeLessThan(PLAYER.radius / 2)
        const ahead = new Vector3(0, 0, 1)
        const at = (x: number, y: number) => rayBody(new Vector3(x, y, -2), ahead, AT_ORIGIN)
        // The chest (11 cm across, turned a little behind the gun).
        expect(at(0.04, 0.27)).not.toBeNull()
        expect(at(0.06, 0.27)).toBeNull()
        // Where the old capsules took it: misses.
        expect(at(0.12, 0.2)).toBeNull()
        // The legs, with a gap between them.
        expect(at(0.03, 0.1)).not.toBeNull()
        expect(at(-0.03, 0.1)).not.toBeNull()
        expect(at(0, 0.1)).toBeNull()
        // Beside the neck, over a shoulder.
        expect(at(0.045, 0.34)).toBeNull()
        // Over the head.
        expect(at(0, PLAYER.height + 0.005)).toBeNull()
    })

    test('prone, the body lies face down along where they face: low, thin, its head the far end; it aims steadier', () => {
        // Facing -z (yaw 0): from the side (along x) the whole 40 cm length shows.
        const prone = { ...AT_ORIGIN, prone: true, yaw: 0 }
        const side = (z: number, height = 0.03) => rayBody(new Vector3(-2, height, z), new Vector3(1, 0, 0), prone)
        expect(side(0)).not.toBeNull()
        expect(side(-0.174)!.head).toBe(true) // the head
        expect(side(0.15)!.along).toBeLessThan(0.3) // the legs
        expect(side(0.25)).toBeNull()
        expect(side(0, 0.1)).toBeNull()
        // From the front: only its head end, a narrow target.
        expect(rayBody(new Vector3(0.06, 0.03, -2), new Vector3(0, 0, 1), prone)).toBeNull()

        const standing = { ...bodyAt(0, 0, 0), onGround: true }
        expect(spreadOf(GUNS.rifle, false, { ...standing, prone: true })).toBeLessThan(
            spreadOf(GUNS.rifle, false, standing)
        )
    })

    test('the head is the only headshot, the shoulders are body', () => {
        const head = rayBody(new Vector3(0, 0.375, -2), new Vector3(0, 0, 1), AT_ORIGIN)!
        expect(head.head).toBe(true)
        expect(head.along).toBeGreaterThanOrEqual(HEAD_FROM)
        const shoulders = rayBody(new Vector3(0, 0.31, -2), new Vector3(0, 0, 1), AT_ORIGIN)!
        expect(shoulders.head).toBe(false)
        expect(shoulders.along).toBeLessThan(HEAD_FROM)
        // Straight down onto the top of the head.
        const fromAbove = rayBody(new Vector3(0, 2, 0), new Vector3(0, -1, 0), AT_ORIGIN)!
        expect(fromAbove.head).toBe(true)
        expect(fromAbove.distance).toBeCloseTo(2 - 0.402, 3)
    })

    test('turned and grown with them: from behind, from the side, a Promotion', () => {
        const behind = rayBody(new Vector3(0, 0.27, 2), new Vector3(0, 0, -1), AT_ORIGIN)
        expect(behind).not.toBeNull()
        // Facing +x (yaw -π/2), a shot along x meets their narrow side: 6 cm deep, not 11 wide.
        const side = { ...AT_ORIGIN, yaw: -Math.PI / 2 }
        expect(rayBody(new Vector3(-2, 0.27, 0.04), new Vector3(1, 0, 0), side)).not.toBeNull()
        // Three times the size: three times as wide.
        expect(rayBody(new Vector3(0.12, 0.8, -2), new Vector3(0, 0, 1), { ...AT_ORIGIN, scale: 3 })).not.toBeNull()
    })

    test('misses: beside, over the head, behind the shooter', () => {
        expect(rayBody(new Vector3(0.2, 0.2, -2), new Vector3(0, 0, 1), AT_ORIGIN)).toBeNull()
        expect(rayBody(new Vector3(0, 0.45, -2), new Vector3(0, 0, 1), AT_ORIGIN)).toBeNull()
        expect(rayBody(new Vector3(0, 0.2, -2), new Vector3(0, 0, -1), AT_ORIGIN)).toBeNull()
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
        // A shot at their head is a headshot.
        const level = fireShot(world, new Vector3(2.8, 0.375, 1.0), south, [{ id: 'near', x: 2.8, y: 0, z: 2.0 }])
        expect(level.hit?.headshot).toBe(true)
    })

    test('the nearest of two in line takes it', () => {
        const world = officeWorld()
        const shot = fireShot(world, new Vector3(2.8, 0.27, 1.0), new Vector3(0, 0, 1), [
            { id: 'second', x: 2.8, y: 0, z: 2.2 },
            { id: 'first', x: 2.8, y: 0, z: 1.6 },
        ])

        expect(shot.hit?.id).toBe('first')
        // Stopped at the front of their chest.
        expect(shot.end.z).toBeGreaterThan(1.6 - 0.045)
        expect(shot.end.z).toBeLessThan(1.6 - 0.02)
    })

    test('a gun reaches its range, not further', () => {
        const open = testWorld([])
        const range = GUNS.shotgun.range
        const shoot = (z: number) =>
            fireShot(open, new Vector3(0, 0.2, 0), new Vector3(0, 0, 1), [{ id: 'them', x: 0, y: 0, z }], range)

        expect(shoot(range - 1).hit?.id).toBe('them')
        expect(shoot(range + 1).hit).toBeNull()
        expect(shoot(range + 1).end.z).toBeCloseTo(range, 6)
    })
})

describe('the guns', () => {
    test('spread is the same everywhere for a frame, inside its cone, and none at all aimed with the sniper', () => {
        const ahead = new Vector3(0, 0, -1)
        const one = spreadDirection(ahead, 0.1, 42, 3)
        expect(spreadDirection(ahead, 0.1, 42, 3).equals(one)).toBe(true)
        expect(spreadDirection(ahead, 0.1, 43, 3).equals(one)).toBe(false)
        for (let seq = 1; seq < 200; seq++) {
            expect(spreadDirection(ahead, 0.1, seq, 0).angleTo(ahead)).toBeLessThanOrEqual(0.1 + 1e-9)
        }
        const still = { ...bodyAt(0, 0, 0), onGround: true }
        expect(spreadOf(GUNS.sniper, true, still)).toBe(0)
        expect(spreadOf(GUNS.rifle, false, still)).toBeGreaterThan(spreadOf(GUNS.rifle, true, still))
        expect(spreadOf(GUNS.rifle, true, { ...still, onGround: false })).toBeGreaterThan(
            spreadOf(GUNS.rifle, true, still)
        )
    })

    test('falloff: full damage up close, the floor of it far away', () => {
        expect(damageAt(GUNS.shotgun, 1)).toBe(GUNS.shotgun.damage)
        expect(damageAt(GUNS.shotgun, 20)).toBeCloseTo(GUNS.shotgun.damage * GUNS.shotgun.falloff![2], 6)
        expect(damageAt(GUNS.sniper, 30)).toBe(GUNS.sniper.damage)
    })

    test('a big magazine gives every gun more, even the one-round launcher', () => {
        expect(magazineOf('rifle', 1.5)).toBe(45)
        expect(magazineOf('pistol', 1.5)).toBe(12)
        expect(magazineOf('launcher')).toBe(1)
        expect(magazineOf('launcher', 1.5)).toBe(2)
    })
})
