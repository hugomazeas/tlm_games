import { describe, expect, test } from 'bun:test'
import { box, testMap } from './fixtures.ts'
import {
    BOOST_SPEED,
    createKart,
    forwardSpeed,
    type KartInput,
    type KartState,
    MINI_TURBO,
    NITRO_CHARGE,
    NITRO_KICK,
    OFFROAD_SPEED,
    PACE,
    resetKart,
    STEP,
    stepKart,
    TOP_SPEED,
} from './kart.ts'
import { GRIP } from './weather.ts'
import { buildWorld, type DriveWorld } from './world.ts'

const KMH = 3.6
const NORTH = 0
const EAST = -Math.PI / 2
const GAS: KartInput = { throttle: 1, steer: 0, drift: false }

/** A 2 km east–west back lane (no boost pads) through the middle of the test map, plus whatever else. */
function avenue(overrides: Parameters<typeof testMap>[0] = {}, height?: Parameters<typeof testMap>[1]): DriveWorld {
    return buildWorld(
        testMap({ roads: [{ kind: 'service', width: 20, points: [-1000, 0, 1000, 0] }], ...overrides }, height, 2000)
    )
}

function drive(
    world: DriveWorld,
    kart: KartState,
    seconds: number,
    input: KartInput | ((t: number) => KartInput)
): KartState {
    for (let t = 0; t < seconds; t += STEP) kart = stepKart(world, kart, typeof input === 'function' ? input(t) : input)

    return kart
}

describe('acceleration', () => {
    const world = avenue()

    test('quick off the line, slow to top speed, never past it', () => {
        const start = createKart(world, -480, 0, EAST)
        expect(forwardSpeed(drive(world, start, 3, GAS)) * KMH).toBeGreaterThan(60)
        expect(forwardSpeed(drive(world, start, 10, GAS)) * KMH).toBeLessThan(125)
        const long = drive(world, start, 25, GAS)
        expect(forwardSpeed(long) * KMH).toBeGreaterThan(145)
        expect(forwardSpeed(long)).toBeLessThanOrEqual(TOP_SPEED + 1e-9)
    })

    test('it takes most of a kilometre (in kart terms) to reach top speed', () => {
        let kart = createKart(world, -480, 0, EAST)
        while (forwardSpeed(kart) < TOP_SPEED - 0.01) kart = stepKart(world, kart, GAS)
        expect(kart.x + 480).toBeGreaterThan(600 * PACE)
    })

    test('braking stops you, then you reverse slowly', () => {
        const fast = drive(world, createKart(world, -480, 0, EAST), 5, GAS)
        const back = { throttle: -1, steer: 0, drift: false }
        const stopped = drive(world, fast, 1.5, back)
        expect(forwardSpeed(stopped)).toBeLessThan(1)
        expect(forwardSpeed(drive(world, stopped, 5, back))).toBeGreaterThan(-9.01)
    })

    test('letting go coasts to a stop', () => {
        const rolling = drive(world, createKart(world, -480, 0, EAST), 3, GAS)
        expect(forwardSpeed(drive(world, rolling, 15, { throttle: 0, steer: 0, drift: false }))).toBe(0)
    })

    test('same inputs, same kart', () => {
        const inputs = (t: number): KartInput => ({ throttle: 1, steer: Math.sin(t), drift: t > 2 && t < 4 })
        const a = drive(world, createKart(world, -480, 0, EAST), 6, inputs)
        const b = drive(world, createKart(world, -480, 0, EAST), 6, inputs)
        expect(a).toEqual(b)
    })
})

describe('surfaces', () => {
    test('grass holds you to offroad speed, and slows you down when you run onto it', () => {
        const world = avenue()
        const onGrass = drive(world, createKart(world, -480, 100, EAST), 10, GAS)
        expect(onGrass.surface).toBe('offroad')
        expect(forwardSpeed(onGrass)).toBeLessThanOrEqual(OFFROAD_SPEED + 1e-9)

        const fast = drive(world, createKart(world, -480, 0, EAST), 8, GAS)
        const offTheRoad = drive(world, { ...fast, z: 100 }, 1, GAS)
        expect(forwardSpeed(offTheRoad)).toBeLessThan(forwardSpeed(fast))
    })

    test('driving into water puts you back on a road', () => {
        const world = avenue({}, (x, z) => (z > 50 ? -5 : 10))
        const sunk = drive(world, createKart(world, 0, 100, EAST), 1.5, GAS)
        expect(sunk.z).toBeCloseTo(0)
    })
})

describe('steering', () => {
    const world = avenue()

    test('left turns left, and you can’t turn on the spot', () => {
        const moving = drive(world, createKart(world, -480, 0, EAST), 2, GAS)
        const turned = drive(world, moving, 0.5, { throttle: 1, steer: 1, drift: false })
        expect(turned.heading).toBeGreaterThan(moving.heading)

        const parked = createKart(world, 0, 0, NORTH)
        expect(drive(world, parked, 1, { throttle: 0, steer: 1, drift: false }).heading).toBe(NORTH)
    })

    test('reversing steers the other way', () => {
        const backing = drive(world, createKart(world, 0, 0, NORTH), 2, { throttle: -1, steer: 0, drift: false })
        expect(drive(world, backing, 0.5, { throttle: -1, steer: 1, drift: false }).heading).toBeLessThan(NORTH)
    })
})

describe('drifting', () => {
    const world = buildWorld(
        testMap({ areas: [{ kind: 'parking', outline: [-500, -500, 500, -500, 500, 500, -500, 500] }] })
    )
    const fast = () => drive(world, createKart(world, 0, 400, NORTH), 4, GAS)
    const drifting = { throttle: 1, steer: 1, drift: true }

    test('slides sideways and charges while held', () => {
        const kart = drive(world, fast(), 0.6, drifting)
        expect(kart.drift).toBe(1)
        expect(kart.charge).toBeGreaterThan(0.5)
    })

    test('a long enough drift releases into a boost past top speed', () => {
        const charged = drive(world, fast(), MINI_TURBO + 0.2, drifting)
        const released = stepKart(world, charged, GAS)
        expect(released.drift).toBe(0)
        expect(released.boost).toBeGreaterThan(0)

        const short = stepKart(world, drive(world, fast(), 0.3, drifting), GAS)
        expect(short.boost).toBe(0)
    })

    test('on snow, less grip: a drift slides further sideways', () => {
        const sideways = (kart: KartState) =>
            Math.abs(kart.vx * Math.cos(kart.heading) - kart.vz * Math.sin(kart.heading))
        const slide = (grip: number) => {
            let kart = fast()
            for (let t = 0; t < 1; t += STEP) kart = stepKart(world, kart, drifting, grip)

            return sideways(kart)
        }
        expect(slide(GRIP.snow)).toBeGreaterThan(slide(GRIP.clear) * 1.2)
    })

    test('needs speed and a direction to start', () => {
        expect(drive(world, createKart(world, 0, 400, NORTH), 0.3, drifting).drift).toBe(0)
        expect(drive(world, fast(), 0.3, { throttle: 1, steer: 0, drift: true }).drift).toBe(0)
    })
})

describe('nitro', () => {
    const world = avenue()
    const NITRO: KartInput = { ...GAS, nitro: true }
    /** Cruising at 80 km/h for `seconds`, then: */
    const cruising = (seconds: number) => {
        let kart = createKart(world, -480, 0, EAST)
        for (let t = 0; t < seconds; t += STEP) {
            const tooFast = forwardSpeed(kart) * KMH > 80
            kart = stepKart(world, kart, { throttle: tooFast ? 0 : 1, steer: 0, drift: false })
        }
        return kart
    }

    test('does nothing until it has charged for 15 seconds', () => {
        const early = cruising(NITRO_CHARGE - 1)
        expect(early.nitro).toBeLessThan(NITRO_CHARGE)
        expect(forwardSpeed(stepKart(world, early, NITRO)) - forwardSpeed(early)).toBeLessThan(1)
    })

    test('charged, E adds 20 km/h to the current speed, then the charge starts over', () => {
        const ready = cruising(NITRO_CHARGE + 0.1)
        const before = forwardSpeed(ready)
        const fired = stepKart(world, ready, NITRO)
        expect((forwardSpeed(fired) - before) * KMH).toBeGreaterThan(19)
        expect((forwardSpeed(fired) - before) * KMH).toBeLessThan(22)
        expect(fired.nitro).toBeLessThan(0.1)
        // Holding E doesn't fire it again.
        expect(forwardSpeed(stepKart(world, fired, NITRO))).toBeLessThan(forwardSpeed(fired) + 0.5)
    })

    test('works past top speed, holds the gain a moment, then bleeds back down', () => {
        let kart = drive(world, createKart(world, -480, 0, EAST), 25, GAS)
        kart = { ...kart, nitro: NITRO_CHARGE }
        const top = forwardSpeed(kart)
        kart = stepKart(world, kart, NITRO)
        expect((forwardSpeed(kart) - top) * KMH).toBeGreaterThan(19)
        expect((forwardSpeed(drive(world, kart, 1.5, GAS)) - top) * KMH).toBeGreaterThan(15)
        expect(forwardSpeed(drive(world, kart, 5, GAS))).toBeLessThanOrEqual(TOP_SPEED + 0.01)
    })

    test('stacks with a boost: past 185 km/h, whichever comes first', () => {
        const flat = drive(world, createKart(world, -480, 0, EAST), 25, GAS)
        const fastest = (kart: KartState) => {
            let top = 0
            for (let t = 0; t < 2; t += STEP) {
                kart = stepKart(world, kart, GAS)
                top = Math.max(top, forwardSpeed(kart))
            }
            return top * KMH
        }
        // Nitro on a boost…
        const boosted = { ...flat, boost: 2, nitro: NITRO_CHARGE }
        expect(fastest(stepKart(world, drive(world, boosted, 1, GAS), NITRO))).toBeGreaterThan(185)
        // …and a boost during a nitro.
        const surging = stepKart(world, { ...flat, nitro: NITRO_CHARGE }, NITRO)
        expect(fastest({ ...surging, boost: 2 })).toBeGreaterThan(185)
        expect(fastest({ ...surging, boost: 2 })).toBeLessThanOrEqual((BOOST_SPEED + NITRO_KICK) * KMH + 0.01)
    })

    test('on the grass it gives the 20 km/h, but no more than 20 over the grass limit', () => {
        const grass = buildWorld(testMap({}, undefined, 2000))
        let kart = drive(grass, createKart(grass, 0, 0, EAST), 5, GAS)
        kart = stepKart(grass, { ...kart, nitro: NITRO_CHARGE }, NITRO)
        expect(forwardSpeed(drive(grass, kart, 1, GAS))).toBeLessThanOrEqual(OFFROAD_SPEED + NITRO_KICK + 0.01)
    })
})

describe('boost', () => {
    test('a pad boosts you past top speed', () => {
        const world = buildWorld(
            testMap({ roads: [{ kind: 'major', width: 20, points: [-1000, 0, 1000, 0] }] }, undefined, 2000)
        )
        const pad = world.pads.at(-1)!
        let kart = drive(world, createKart(world, -480, 0, EAST), 25, GAS)
        kart = { ...kart, x: pad.x - 3, z: pad.z }
        kart = drive(world, kart, 0.5, GAS)
        expect(kart.boost).toBeGreaterThan(0)
        expect(forwardSpeed(kart)).toBeGreaterThan(TOP_SPEED)
        expect(forwardSpeed(kart)).toBeLessThanOrEqual(BOOST_SPEED + 1e-9)
    })
})

describe('collisions', () => {
    test('bounces off a building, slower, and never goes through it', () => {
        const world = avenue({ buildings: [box(1, 0, 0, 20)] })
        const fast = drive(world, createKart(world, -300, 0, EAST), 8, GAS)
        let kart = fast
        let slowest = Infinity
        for (let t = 0; t < 4; t += STEP) {
            kart = stepKart(world, kart, GAS)
            expect(kart.x).toBeLessThan(-20)
            slowest = Math.min(slowest, forwardSpeed(kart))
        }
        expect(slowest).toBeLessThan(0)
    })

    test('glancing off a wall keeps most of the speed', () => {
        const world = avenue({ walls: [{ points: [-500, 3, 500, 3], height: 6, thickness: 2 }] })
        const fast = drive(world, createKart(world, -480, 0, EAST), 6, GAS)
        const glancing = drive(world, { ...fast, heading: EAST - 0.1 }, 1, GAS)
        expect(glancing.z).toBeLessThan(3 - 1)
        expect(forwardSpeed(glancing)).toBeGreaterThan(forwardSpeed(fast) * 0.9)
    })

    test('drives under an arch that starts above it', () => {
        const world = avenue({ buildings: [box(1, 0, 0, 5, 16, 22)] })
        const through = drive(world, createKart(world, -100, 0, EAST), 10, GAS)
        expect(through.x).toBeGreaterThan(20)
    })
})

describe('jumps', () => {
    test('a crest at speed throws you into the air, and you land', () => {
        // A ramp up to x = 0, then a drop.
        const world = avenue({}, x => (x < -100 ? 10 : x < 0 ? 10 + (x + 100) * 0.15 : 10))
        // Up to speed just short of the ramp.
        let kart = drive(world, createKart(world, -480, 0, EAST), 10, GAS)
        let flew = false
        for (let t = 0; t < 5; t += STEP) {
            kart = stepKart(world, kart, GAS)
            if (kart.airborne && kart.y - world.ground(kart.x, kart.z) > 2) flew = true
        }
        expect(flew).toBe(true)
        expect(kart.airborne).toBe(false)
        expect(kart.y).toBeCloseTo(world.ground(kart.x, kart.z))
    })

    test('a gentle rise keeps you on the ground', () => {
        const world = avenue({}, x => 10 + Math.max(0, x + 300) * 0.02)
        let kart = createKart(world, -480, 0, EAST)
        for (let t = 0; t < 10; t += STEP) {
            kart = stepKart(world, kart, GAS)
            expect(kart.y - world.ground(kart.x, kart.z)).toBeLessThan(0.3)
        }
    })
})

test('a reset puts you on the nearest road, stopped, facing along it', () => {
    const world = avenue()
    const lost = { ...createKart(world, 50, 80, NORTH + 2), vx: 10 }
    const back = resetKart(world, lost)
    expect(back).toMatchObject({ x: 50, z: 0, vx: 0, vz: 0, airborne: false })
    expect(back.heading).toBeCloseTo(Math.PI / 2)
})
