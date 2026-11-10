import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { BUTTON } from '../protocol.ts'
import { type Body, bodyAt, moveOf, PLAYER, stepBody } from '../sim/movement.ts'
import { collideCapsule, cloudNineWorld } from '../sim/world.ts'
import { CLOUD_NINE } from './cloud-nine.ts'

const world = cloudNineWorld()
const idle = moveOf({ forward: 0, strafe: 0, yaw: 0, buttons: 0 })

function settle(body: Body, steps = 90, input = idle): Body {
    for (let i = 0; i < steps; i++) body = stepBody(world, body, input)
    return body
}

describe('Cloud Nine', () => {
    test('every spawn leaves a mini room to stand, on the deck', () => {
        for (const point of world.spawnPoints) {
            const [x, , z] = point.position
            const seg = new Line3(
                new Vector3(x, 0.02 + PLAYER.radius, z),
                new Vector3(x, 0.02 + PLAYER.height - PLAYER.radius, z)
            )
            expect({ spawn: point.name, blocked: collideCapsule(world, seg, PLAYER.radius) }).toEqual({
                spawn: point.name,
                blocked: false,
            })
            const stood = settle(bodyAt(x, 0.02, z))
            expect({ spawn: point.name, y: Math.abs(stood.y) < 0.01, ground: stood.onGround }).toEqual({
                spawn: point.name,
                y: true,
                ground: true,
            })
        }
    })

    test('every spawn faces the middle: two seconds walking straight on keeps you on the deck', () => {
        for (const point of world.spawnPoints) {
            const [x, , z] = point.position
            const walk = moveOf({ forward: 1, strafe: 0, yaw: point.yaw, buttons: 0 })
            const walked = settle(bodyAt(x, 0.02, z), 120, walk)
            expect({ spawn: point.name, onDeck: walked.y > -0.01 }).toEqual({ spawn: point.name, onDeck: true })
            expect(Math.hypot(walked.x, walked.z)).toBeLessThan(Math.hypot(x, z) + 0.5)
        }
    })

    test('every pickup lies on something: dropped over it, a mini comes to rest at its height', () => {
        for (const spot of world.pickups) {
            const floor = spot.y ?? 0
            const rested = settle(bodyAt(spot.x, floor + 0.3, spot.z))
            expect({ room: spot.room, y: Math.round(rested.y * 100) / 100 }).toEqual({ room: spot.room, y: floor })
        }
    })

    test('a vent throws you up, high enough for the floating platforms', () => {
        const vent = world.pads[0]!
        let body = settle(bodyAt(vent.x, 0.02, vent.z), 2)
        let top = body.y
        for (let i = 0; i < 90; i++) {
            body = stepBody(world, body, idle)
            top = Math.max(top, body.y)
        }
        expect(top).toBeGreaterThan(CLOUD_NINE.platform + 0.3)
    })

    test('the jetpack stops at the ceiling', () => {
        let body = bodyAt(0, CLOUD_NINE.lid + 0.02, 0)
        const up = moveOf({ forward: 0, strafe: 0, yaw: 0, buttons: BUTTON.jet })
        // A jetpack that never runs out.
        for (let i = 0; i < 600; i++) body = stepBody(world, { ...body, fuel: 1 }, up)
        expect(body.y).toBeLessThanOrEqual(CLOUD_NINE.ceiling)
        expect(body.y).toBeGreaterThan(CLOUD_NINE.ceiling - 0.1)
    })

    test('off the deck, nothing catches you: you fall past the line where you are out', () => {
        const off = settle(bodyAt(CLOUD_NINE.halfX + 0.5, 0.02, 0), 120)
        expect(off.y).toBeLessThan(CLOUD_NINE.outBelow)
    })
})
