import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { type Body, bodyAt, MOVE, type MoveInput, PLAYER, stepBody } from './movement.ts'
import { officeWorld } from './world.ts'

const IDLE: MoveInput = { forward: 0, strafe: 0, yaw: 0, dash: false, jet: false }

function run(body: Body, input: MoveInput, steps: number): Body {
    const world = officeWorld()
    let b = body
    for (let i = 0; i < steps; i++) b = stepBody(world, b, input)
    return b
}

/** The open office's spawn, settled on the carpet. */
function standing(): Body {
    return run(bodyAt(2.8, 0.02, 1.0), IDLE, 30)
}

describe('a mini in the office', () => {
    test('lands on the floor and stands there', () => {
        const body = standing()

        expect(body.onGround).toBe(true)
        expect(Math.abs(body.y)).toBeLessThan(0.02)
        expect(Math.abs(body.vy)).toBeLessThan(0.1)
    })

    test('walks at walking pace where the camera looks', () => {
        const start = standing()
        // Yaw π/2 looks toward -X.
        const end = run(start, { ...IDLE, forward: 1, yaw: Math.PI / 2 }, 30)

        expect(start.x - end.x).toBeGreaterThan(MOVE.walk * 0.5 * 0.85)
        expect(start.x - end.x).toBeLessThan(MOVE.walk * 0.5 * 1.02)
        expect(Math.abs(end.z - start.z)).toBeLessThan(0.01)
    })

    test('a dodge bursts the way the keys say, burns fuel, and needs its cooldown', () => {
        const start = standing()
        // Yaw π/2 looks toward -X, so strafing right (D) goes toward -Z.
        const right = { ...IDLE, strafe: 1, yaw: Math.PI / 2 }
        const dodged = run(stepBody(officeWorld(), start, { ...right, dash: true }), right, 11)
        const walked = run(start, right, 12)

        expect(start.z - dodged.z).toBeGreaterThan(1.1)
        expect(start.z - dodged.z).toBeGreaterThan(2 * (start.z - walked.z))
        expect(Math.abs(dodged.x - start.x)).toBeLessThan(0.05)
        expect(dodged.fuel).toBeCloseTo(1 - MOVE.dashFuel, 2)

        // Again at once: nothing, until the cooldown is over.
        const again = stepBody(officeWorld(), dodged, { ...right, dash: true })
        expect(again.fuel).toBeCloseTo(dodged.fuel, 2)
        const ready = run(dodged, right, MOVE.dashCooldown)
        expect(stepBody(officeWorld(), ready, { ...right, dash: true }).dashLeft).toBe(MOVE.dashSteps)
    })

    test('a dodge with no direction held goes forward; without fuel there is none', () => {
        const start = standing()
        const forward = run(stepBody(officeWorld(), start, { ...IDLE, yaw: Math.PI / 2, dash: true }), IDLE, 5)
        expect(start.x - forward.x).toBeGreaterThan(0.5)

        const empty = stepBody(officeWorld(), { ...start, fuel: MOVE.dashFuel / 2 }, { ...IDLE, dash: true })
        expect(empty.dashLeft).toBe(0)
        expect(Math.hypot(empty.vx, empty.vz)).toBeLessThan(0.1)
    })

    test('the jetpack lifts off, burns fuel and stops at the ceiling', () => {
        const start = standing()
        const second = run(start, { ...IDLE, jet: true }, 60)

        expect(second.y).toBeGreaterThan(0.5)
        expect(second.fuel).toBeCloseTo(1 - MOVE.fuelUse, 1)

        const empty = run(second, { ...IDLE, jet: true }, 180)
        expect(empty.fuel).toBe(0)
        expect(empty.y + PLAYER.height).toBeLessThan(2.71)
    })

    test('a jetpack extender makes the same fuel last four times as long, and runs out', () => {
        const start = standing()
        const plain = run(start, { ...IDLE, jet: true }, 60)
        const boosted = run({ ...start, jetBoost: 600 }, { ...IDLE, jet: true }, 60)

        expect(1 - boosted.fuel).toBeCloseTo((1 - plain.fuel) / 4, 3)
        expect(boosted.jetBoost).toBe(540)
        expect(run({ ...start, jetBoost: 10 }, IDLE, 20).jetBoost).toBe(0)
    })

    test('fuel only comes back on the ground', () => {
        const flying = run(standing(), { ...IDLE, jet: true }, 60)
        const falling = stepBody(officeWorld(), flying, IDLE)
        expect(falling.fuel).toBe(flying.fuel)

        const landed = run(flying, IDLE, 240)
        expect(landed.onGround).toBe(true)
        expect(landed.fuel).toBeGreaterThan(flying.fuel)
    })

    test('the same inputs give the same body (what prediction relies on)', () => {
        const inputs: MoveInput[] = []
        const rng = createRng(5)
        for (let i = 0; i < 240; i++) {
            inputs.push({
                forward: rng() * 2 - 1,
                strafe: rng() * 2 - 1,
                yaw: rng() * 6,
                dash: rng() < 0.05,
                jet: rng() < 0.3,
            })
        }
        const play = () => inputs.reduce((b, input) => stepBody(officeWorld(), b, input), standing())

        expect(play()).toEqual(play())
    })

    test('twenty seconds of wild flying never leaves the office', () => {
        const rng = createRng(11)
        const world = officeWorld()
        for (const spawn of world.spawnPoints) {
            let body = bodyAt(spawn.position[0], 0.02, spawn.position[2])
            let input: MoveInput = IDLE
            for (let i = 0; i < 20 * 60; i++) {
                if (i % 20 === 0) {
                    input = {
                        forward: rng() * 2 - 1,
                        strafe: rng() * 2 - 1,
                        yaw: rng() * 6.3,
                        dash: rng() < 0.3,
                        jet: rng() < 0.5,
                    }
                }
                body = stepBody(world, body, input)
                const inside =
                    body.x > -10.7 &&
                    body.x < 10.75 &&
                    body.z > -4.85 &&
                    body.z < 5.13 &&
                    body.y > -0.05 &&
                    body.y + PLAYER.height < 2.71

                if (!inside) expect({ spawn: spawn.name, step: i, body }).toBeNull()
            }
        }
    })
})
