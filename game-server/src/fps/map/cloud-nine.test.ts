import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { BUTTON } from '../protocol.ts'
import { type Body, bodyAt, moveOf, PLAYER, stepBody } from '../sim/movement.ts'
import { collideCapsule, cloudNineWorld, rayDistance } from '../sim/world.ts'
import { CLOUD_NINE, CLOUD_NINE_SHIELD_MS, ELEVATOR, GONDOLA, gondolaAt, LASER } from './cloud-nine.ts'
import { Arena } from '../sim/arena.ts'
import { createRng } from '../../sim/rng.ts'
import { STEP_MS } from '../sim/movement.ts'

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

    test('no spawn can be seen from the middle of the deck: each is behind its shelter', () => {
        const middles = [
            [-1.5, 0],
            [1.5, 0],
            [0, -1.9],
            [0, 1.9],
            [-3.5, 0],
            [3.5, 0],
        ]
        for (const point of world.spawnPoints) {
            const [sx, , sz] = point.position
            const chest = new Vector3(sx, 0.2, sz)
            for (const [mx, mz] of middles) {
                const eye = new Vector3(mx!, PLAYER.eye, mz!)
                const to = chest.clone().sub(eye)
                const distance = to.length()
                const blocked = rayDistance(world, eye, to.normalize(), distance) < distance - 0.05
                expect({ spawn: point.name, from: [mx, mz], blocked }).toEqual({
                    spawn: point.name,
                    from: [mx, mz],
                    blocked: true,
                })
            }
        }
    })

    test('the ramps take you up to the platforms on foot, and the walkway joins them behind the tank', () => {
        const walk = (yaw: number) => moveOf({ forward: 1, strafe: 0, yaw, buttons: 0 })
        // West end, walking east (+x: yaw -π/2), up onto the drone's platform.
        const west = settle(bodyAt(-6.9, 0.02, 0), 150, walk(-Math.PI / 2))
        expect(west.y).toBeCloseTo(CLOUD_NINE.platform, 1)
        // From the drone's platform onto the walkway and along it (east) to the sign's platform.
        // On the drone's platform by its back edge, walking north onto the walkway, east along it, south onto the sign's.
        let body = settle(bodyAt(-2.6, CLOUD_NINE.platform + 0.02, -0.6), 10)
        body = settle(body, 20, walk(0))
        body = settle(body, 150, walk(-Math.PI / 2))
        expect(body.y).toBeCloseTo(CLOUD_NINE.platform, 1)
        expect(body.z).toBeLessThan(-0.82)
        body = settle(body, 40, walk(Math.PI))
        expect(body.y).toBeCloseTo(CLOUD_NINE.platform, 1)
        expect(body.x).toBeGreaterThan(2.3)
        expect(body.z).toBeGreaterThan(-0.8)
    })

    test('the elevator lifts whoever stands on it from the deck to the lid', () => {
        const clock = world.clock!
        clock.step = 0
        let body = bodyAt(ELEVATOR.x, ELEVATOR.bottom + 0.02, ELEVATOR.z)
        for (let i = 0; i <= ELEVATOR.periodSteps / 2; i++) {
            clock.step = i
            body = stepBody(world, body, idle)
        }
        expect(body.y).toBeGreaterThan(CLOUD_NINE.lid - 0.05)
        // And it steps off onto the lid.
        for (let i = 0; i < 60; i++) body = stepBody(world, body, moveOf({ forward: 1, strafe: 0, yaw: 0, buttons: 0 }))
        expect(body.y).toBeCloseTo(CLOUD_NINE.lid, 1)
    })

    test('the laser sweeps the deck: whoever stands on it is knocked flying, but not while spawn-shielded', () => {
        const arena = new Arena(cloudNineWorld(), createRng(2))
        arena.add('a')
        const shield = Math.round(CLOUD_NINE_SHIELD_MS / STEP_MS)
        const zaps: number[] = []
        for (let i = 1; i <= shield + LASER.periodSteps + 5; i++) {
            const events = arena.advance()
            if (events.some(e => e.type === 'zap' && e.on === 'a')) zaps.push(i)
            if (i === shield - 5) expect(arena.self('a')!.shielded).toBe(true)
        }
        // Once round after the shield, it found them (at their spawn, inside its reach).
        expect(zaps.length).toBeGreaterThan(0)
        expect(zaps[0]!).toBeGreaterThan(shield)
    })

    test('the laser alone never throws anyone off: standing still at any spawn, two turns of it later they are still on the deck', () => {
        for (const point of world.spawnPoints) {
            const arena = new Arena({ ...cloudNineWorld(), spawnPoints: [point] }, createRng(3))
            arena.add('a')
            let zapped = 0
            for (let i = 0; i < Math.round(CLOUD_NINE_SHIELD_MS / STEP_MS) + LASER.periodSteps * 2; i++) {
                zapped += arena.advance().filter(e => e.type === 'zap').length
            }
            // Once a pass (two passes: twice), and still up.
            expect({ spawn: point.name, zapped, alive: arena.self('a')!.alive }).toEqual({
                spawn: point.name,
                zapped: 2,
                alive: true,
            })
        }
    })

    test('the gondola swings end to end under the front edge, carries whoever stands on it, and catches a fall', () => {
        const clock = world.clock!
        const at = (step: number) => gondolaAt(step)
        expect(at(GONDOLA.periodSteps / 4).x).toBeCloseTo(GONDOLA.reach)
        expect(at((3 * GONDOLA.periodSteps) / 4).x).toBeCloseTo(-GONDOLA.reach)

        // Standing on it at its middle (fastest), a second later it has carried you along.
        clock.step = 0
        let body = bodyAt(0, GONDOLA.top + 0.02, GONDOLA.z)
        for (let i = 0; i < 60; i++) {
            clock.step = i
            body = stepBody(world, body, idle)
        }
        expect(body.y).toBeCloseTo(GONDOLA.top, 1)
        expect(body.x).toBeGreaterThan(2)
        expect(Math.abs(body.x - at(60).x)).toBeLessThan(0.4)

        // Off the front edge (nothing under you there but air), over where it will be when you get down: caught.
        expect(GONDOLA.z - GONDOLA.half[2]).toBeGreaterThan(CLOUD_NINE.halfZ)
        let falling = bodyAt(at(35).x, 0.2, GONDOLA.z)
        for (let i = 0; i < 90; i++) {
            clock.step = i
            falling = stepBody(world, falling, idle)
        }
        expect(falling.y).toBeGreaterThan(GONDOLA.top - 0.05)
        // Not where it isn't: off the edge at the far end of its swing, you fall past.
        let missed = bodyAt(-at(35).x, 0.2, GONDOLA.z)
        for (let i = 0; i < 90; i++) {
            clock.step = i
            missed = stepBody(world, missed, idle)
        }
        expect(missed.y).toBeLessThan(GONDOLA.top - 1)
    })

    test('off the deck, nothing catches you: you fall past the line where you are out', () => {
        const off = settle(bodyAt(CLOUD_NINE.halfX + 0.5, 0.02, 0), 120)
        expect(off.y).toBeLessThan(CLOUD_NINE.outBelow)
    })
})
