import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { eyeOf } from './combat.ts'
import { type Body, bodyAt, MOVE, type MoveInput, PLAYER, PRONE, scaleOf, stepBody } from './movement.ts'
import { ESPRESSO, OVERTIME, PAD, PORTAL, PROMOTION } from './places.ts'
import { testWorld } from './testing.ts'
import { type FpsWorld, officeWorld } from './world.ts'

const IDLE: MoveInput = { forward: 0, strafe: 0, yaw: 0, dash: false, jet: false, prone: false }

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

        // Up to speed in about a quarter of a second, so the first half second covers a bit less.
        expect(start.x - end.x).toBeGreaterThan(MOVE.walk * 0.5 * 0.7)
        expect(start.x - end.x).toBeLessThan(MOVE.walk * 0.5 * 1.02)
        expect(Math.hypot(end.vx, end.vz)).toBeGreaterThan(MOVE.walk * 0.95)
        expect(Math.abs(end.z - start.z)).toBeLessThan(0.01)
    })

    test('a dodge bursts the way the keys say, burns fuel, and needs its cooldown', () => {
        const start = standing()
        // Yaw π/2 looks toward -X, so strafing right (D) goes toward -Z.
        const right = { ...IDLE, strafe: 1, yaw: Math.PI / 2 }
        const dodged = run(stepBody(officeWorld(), start, { ...right, dash: true }), right, 11)
        const walked = run(start, right, 12)

        // About a metre: two and a half body lengths, not a teleport.
        expect(start.z - dodged.z).toBeGreaterThan(0.8)
        expect(start.z - dodged.z).toBeLessThan(1.2)
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
        // 5 m/s for the 6 steps: 0.5 m.
        expect(start.x - forward.x).toBeGreaterThan(0.45)

        const empty = stepBody(officeWorld(), { ...start, fuel: MOVE.dashFuel / 2 }, { ...IDLE, dash: true })
        expect(empty.dashLeft).toBe(0)
        expect(Math.hypot(empty.vx, empty.vz)).toBeLessThan(0.1)
    })

    test('Space held from the floor: a jump, then past its top the jetpack lifts off, burns fuel and stops at the ceiling', () => {
        const start = standing()
        const second = run(start, { ...IDLE, jet: true }, 60)

        expect(second.y).toBeGreaterThan(0.5)
        // Burning only once the jump topped out (about a quarter second in).
        expect(1 - second.fuel).toBeGreaterThan(MOVE.fuelUse * 0.6)
        expect(1 - second.fuel).toBeLessThan(MOVE.fuelUse * 0.8)

        // Held on: it runs dry under the ceiling, falls, and (Space still held: no fresh press) stays down refuelling.
        let body = second
        let least = body.fuel
        let highest = body.y
        for (let i = 0; i < 240; i++) {
            body = stepBody(officeWorld(), body, { ...IDLE, jet: true })
            least = Math.min(least, body.fuel)
            highest = Math.max(highest, body.y)
        }
        expect(least).toBe(0)
        expect(highest + PLAYER.height).toBeLessThan(2.71)
        expect(body.onGround).toBe(true)
    })

    test('a tap of Space is a 35 cm jump, no fuel; held on landing it does not jump again', () => {
        const start = standing()
        let body = stepBody(officeWorld(), start, { ...IDLE, jet: true })
        let top = body.y
        for (let i = 0; i < 60; i++) {
            body = stepBody(officeWorld(), body, IDLE)
            top = Math.max(top, body.y)
        }

        expect(top - start.y).toBeGreaterThan(0.3)
        expect(top - start.y).toBeLessThan(0.4)
        expect(body.onGround).toBe(true)
        expect(body.fuel).toBe(1)
        // The jetpack on the way up from a jump: not yet.
        const rising = run(start, { ...IDLE, jet: true }, 8)
        expect(rising.jumped).toBe(true)
        expect(rising.fuel).toBe(1)
    })

    test('prone: low, slow, no jump, no jetpack; up again once C is let go', () => {
        const start = standing()
        const down = run(start, { ...IDLE, prone: true }, 2)
        expect(down.prone).toBe(true)
        expect(eyeOf(down).y - down.y).toBeCloseTo(PRONE.eye, 5)

        const crawled = run(down, { ...IDLE, prone: true, forward: 1 }, 60)
        expect(Math.hypot(crawled.x - down.x, crawled.z - down.z)).toBeLessThan(PRONE.crawl * 1.05)
        const tried = run(crawled, { ...IDLE, prone: true, jet: true, dash: true }, 30)
        expect(tried.y).toBeCloseTo(crawled.y, 3)
        expect(tried.fuel).toBe(1)

        expect(run(tried, IDLE, 1).prone).toBe(false)
    })

    test('prone under something low, you stay down until there is room to stand', () => {
        // A flat built panel 25 cm up: a prone mini fits under it, a standing one doesn't.
        const world = testWorld([])
        const panel = { by: null, team: null, health: 1, kind: 'wall', open: false } as const
        world.walls.add({ ...panel, id: 1, axis: 'y', x: 0, y: 0.28, z: 0 })
        const down = run(bodyAt(0, 0, 0), { ...IDLE, prone: true }, 3)
        const stuck = run(down, IDLE, 5)
        expect(stuck.prone).toBe(true)

        let body = stuck
        for (let i = 0; i < 300 && body.prone; i++) body = stepBody(world, body, { ...IDLE, forward: 1 })
        expect(body.prone).toBe(false)
        // Out from under it: past its edge (0.3 m) by a standing mini's radius.
        expect(Math.abs(body.z)).toBeGreaterThan(0.3 + PLAYER.radius - 0.01)

        function run(b: Body, input: MoveInput, steps: number): Body {
            for (let i = 0; i < steps; i++) b = stepBody(world, b, input)
            return b
        }
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
                prone: rng() < 0.2,
            })
        }
        const play = () => inputs.reduce((b, input) => stepBody(officeWorld(), b, input), standing())

        expect(play()).toEqual(play())
    })

    test('twenty seconds of wild flying never leaves the office, pads and portals and all', () => {
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
                        prone: rng() < 0.15,
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

/** Steps in a bare test room. */
function runIn(world: FpsWorld, body: Body, input: MoveInput, steps: number): Body {
    let b = body
    for (let i = 0; i < steps; i++) b = stepBody(world, b, input)
    return b
}

/** Settled on the floor of a test room at x, z. */
function settledIn(world: FpsWorld, x: number, z: number, powers: Partial<Body> = {}): Body {
    return runIn(world, { ...bodyAt(x, 0.02, z), ...powers }, IDLE, 20)
}

// Yaw -π/2 looks toward +X.
const EAST = -Math.PI / 2

describe('jump pads and portals', () => {
    test('a jump pad throws you about two metres up, with no fuel', () => {
        const world = testWorld([], [], [], { pads: [{ x: 0, z: 0 }] })
        let body = bodyAt(0, 0.02, 0)
        let highest = 0
        for (let i = 0; i < 90; i++) {
            body = stepBody(world, body, IDLE)
            highest = Math.max(highest, body.y)
        }
        expect(highest).toBeGreaterThan(1.8)
        expect(highest).toBeCloseTo((PAD.launch * PAD.launch) / (2 * -MOVE.gravity), 0)
        expect(body.fuel).toBe(1)
        // Beside it, nothing.
        const beside = runIn(world, bodyAt(PAD.radius + 0.1, 0.02, 0), IDLE, 90)
        expect(beside.y).toBeLessThan(0.02)
    })

    test('a portal puts you out of its partner, on its far side, and not straight back', () => {
        const portals = [
            { x: 0, z: 0, out: [1, 0] as const, room: 'west' },
            { x: 10, z: 0, out: [-1, 0] as const, room: 'east' },
        ]
        const world = testWorld([], [], [], { portals })
        /** Walks until a portal takes them: the body just after. */
        const walkInto = (from: Body, yaw: number) => {
            let body = from
            for (let i = 0; i < 120 && body.portalCooldown === 0; i++) {
                body = stepBody(world, body, { ...IDLE, forward: 1, yaw })
            }
            return body
        }
        // Walking east from a metre west of the first: out of the second, on its way-out side (west of it).
        const through = walkInto(settledIn(world, -1, 0), EAST)
        expect(through.portalCooldown).toBe(PORTAL.cooldownSteps)
        expect(through.x).toBeCloseTo(10 - PORTAL.exit, 1)
        expect(Math.abs(through.z)).toBeLessThan(0.01)
        // Still walking east, back over the second one: the cooldown keeps it from taking them again.
        const after = runIn(world, through, { ...IDLE, forward: 1, yaw: EAST }, 30)
        expect(after.x).toBeGreaterThan(10.3)

        // From east of the second, walking west into it: out of the first, east of it.
        const back = walkInto({ ...after, portalCooldown: 0 }, -EAST)
        expect(back.x).toBeCloseTo(PORTAL.exit, 1)
    })
})

describe('powers that change how you move', () => {
    const open = testWorld([])
    const walked = (powers: Partial<Body>) =>
        runIn(open, settledIn(open, 0, 0, powers), { ...IDLE, forward: 1, yaw: EAST }, 60)

    test('Overtime: slower, and grounded (no jetpack, no dodge)', () => {
        const usual = walked({})
        const tank = walked({ overtime: 600 })
        expect(Math.hypot(tank.vx, tank.vz)).toBeCloseTo(MOVE.walk * OVERTIME.walk, 1)
        expect(tank.x).toBeLessThan(usual.x * 0.7)

        const jet = runIn(open, settledIn(open, 0, 0, { overtime: 600 }), { ...IDLE, jet: true }, 60)
        expect(jet.y).toBeLessThan(0.02)
        expect(jet.fuel).toBe(1)
        const dodge = stepBody(open, settledIn(open, 0, 0, { overtime: 600 }), { ...IDLE, dash: true })
        expect(dodge.dashLeft).toBe(0)
    })

    test('Espresso: faster, and the dodge comes back twice as soon', () => {
        const fast = walked({ espresso: 600 })
        expect(Math.hypot(fast.vx, fast.vz)).toBeCloseTo(MOVE.walk * ESPRESSO.walk, 1)
        const dodged = stepBody(open, settledIn(open, 0, 0, { espresso: 600 }), { ...IDLE, dash: true })
        expect(dodged.dashCooldown).toBe(Math.round(MOVE.dashCooldown * ESPRESSO.dashCooldown))
    })

    test('powers run out with the steps, like the jetpack extender', () => {
        const body = runIn(open, settledIn(open, 0, 0, { overtime: 10, espresso: 10, big: 10 }), IDLE, 12)
        expect([body.overtime, body.espresso, body.big]).toEqual([0, 0, 0])
        expect(scaleOf(body)).toBe(1)
    })

    test('a Promotion is three times as big: it stands that tall and no longer fits under a shelf', () => {
        // A shelf from x 1 to 3, its underside 0.6 m up: a mini walks under, a giant can't.
        const shelf = testWorld([], [{ min: [1, 0.6, -2], max: [3, 0.7, 2] }])
        const east = { ...IDLE, forward: 1, yaw: EAST }
        const mini = runIn(shelf, settledIn(shelf, 0, 0), east, 120)
        const giant = runIn(shelf, settledIn(shelf, 0, 0, { big: 600 }), east, 120)
        expect(mini.x).toBeGreaterThan(3)
        expect(giant.x).toBeLessThan(1)
        expect(scaleOf(giant)).toBe(PROMOTION.scale)
        // Still standing on the floor (it didn't climb or sink).
        expect(Math.abs(giant.y)).toBeLessThan(0.02)
    })

    test('an Intern grows back only where a mini fits', () => {
        // A low shelf (0.3 m up) whose edge is 5 cm away: an intern (0.2 m) is clear of it, a mini's
        // head would be in it.
        const shelf = testWorld([], [{ min: [0.05, 0.3, -1], max: [2, 0.4, 1] }])
        const tucked = settledIn(shelf, 0, 0, { small: 1 })
        expect(tucked.small).toBe(1)
        // Walked away from it (west), they grow.
        const out = runIn(shelf, tucked, { ...IDLE, forward: 1, yaw: -EAST }, 30)
        expect(out.x).toBeLessThan(-0.2)
        expect(out.small).toBe(0)
    })
})
