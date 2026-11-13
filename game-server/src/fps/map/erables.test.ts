import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { SIEGE } from '../protocol.ts'
import { type Body, bodyAt, type MoveInput, sizeAt, STEP_MS, stepBody } from '../sim/movement.ts'
import { domeSpawns, PROMOTION, rollPickup, spotSpawns } from '../sim/places.ts'
import { collideCapsule, erablesWorld, rayDistance } from '../sim/world.ts'
import { createRng } from '../../sim/rng.ts'
import { buildSlot } from '../sim/building.ts'
import { BUILD } from '../sim/walls.ts'
import {
    BOUNDS,
    buildErablesGeometry,
    ERABLES_PLACES,
    ERABLES_SCALE,
    LAWN,
    TRAMPOLINES,
    VANTAGE_POINTS,
} from './erables.ts'

const S = ERABLES_SCALE
const world = erablesWorld()

/** Does a mini of this size stand clear on the floor at x, z (floor height y)? */
function fits(x: number, z: number, y: number, scale = 1): boolean {
    const size = sizeAt(scale)
    const seg = new Line3(
        new Vector3(x, y + 0.02 + size.radius, z),
        new Vector3(x, y + 0.02 + size.height - size.radius, z)
    )
    return !collideCapsule(world, seg, size.radius)
}

/** The floor's height under x, z (from just under `from`). */
function floorAt(x: number, z: number, from = 2): number {
    return from - rayDistance(world, new Vector3(x, from, z), new Vector3(0, -1, 0), 10)
}

const idle: MoveInput = { forward: 0, strafe: 0, yaw: 0, dash: false, jet: false, prone: false }

/** Steps a body for `seconds` with this input (yaw 0 looks north, -z; -π/2 east, +x). */
function run(body: Body, input: Partial<MoveInput>, seconds: number): Body {
    let b = body
    for (let i = 0; i < (seconds * 1000) / STEP_MS; i++) b = stepBody(world, b, { ...idle, ...input })
    return b
}

/** A body standing at real-metre x, z on the floor at real height y. */
function standing(x: number, z: number, y: number): Body {
    return run(bodyAt(x * S, (y + 0.05) * S, z * S), {}, 0.5)
}

describe('Rue des Érables', () => {
    test('builds without a DOM; drawing it (its surfaces) changes nothing that collides', () => {
        const plain = buildErablesGeometry()
        const drawn = buildErablesGeometry({ surfaces: true })

        expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
        expect(plain.collision!.solid.geometry.index!.count).toBe(drawn.collision!.solid.geometry.index!.count)
        expect(drawn.collision!.solid.userData.surfaces).toHaveLength(drawn.collision!.solid.geometry.index!.count / 3)
        expect(plain.spawnPoints).toHaveLength(12)
        expect(plain.trees.length).toBeGreaterThan(8)
    })

    test('a mini stands a person tall here: 40 cm in the world, 1.8 m next to the houses', () => {
        expect(sizeAt(1).height / S).toBeCloseTo(1.8, 5)
        expect(ERABLES_PLACES.unit).toBeCloseTo(4.5, 5)
    })

    test("no spawn point is in sight of the street, the upstairs window, the terrace or the houses' windows", () => {
        for (const point of world.spawnPoints) {
            const [x, y, z] = point.position
            const seenFrom = VANTAGE_POINTS.filter(({ at: [vx, vy, vz] }) =>
                [1.1, 1.6].some(h => {
                    const from = new Vector3(vx * S, vy * S, vz * S)
                    const to = new Vector3(x, y + h * S, z).sub(from)
                    const length = to.length()
                    return rayDistance(world, from, to.normalize(), length) >= length - 0.01
                })
            ).map(v => v.name)
            expect({ spawn: point.name, seenFrom }).toEqual({ spawn: point.name, seenFrom: [] })
        }
    })

    test('walls go up on the lawn, on a house floor, upstairs and on the terrace', () => {
        const down = new Vector3(0, -0.6, -1).normalize()
        for (const [x, y, z] of [
            [-2.6, 0, -1.8],
            [-6.4, 0.6, -14.0],
            [1.0, 2.95, 12.4],
            [6.0, 2.97, 15.0],
        ] as const) {
            const eye = new Vector3(x * S, (y + 1.53) * S, z * S)
            const slot = buildSlot(world, eye, down, { flat: false, turned: false })
            expect({ at: [x, z], supported: slot.supported, taken: slot.taken }).toEqual({
                at: [x, z],
                supported: true,
                taken: false,
            })
            // On the floor it was aimed at, not floating over it.
            expect(slot.wall.y - BUILD.size / 2).toBeLessThan((y + 0.1) * S)
        }
    })

    test('every spawn point leaves room to stand, on the ground', () => {
        for (const point of world.spawnPoints) {
            const [x, y, z] = point.position
            expect({ spawn: point.name, fits: fits(x, z, y) }).toEqual({ spawn: point.name, fits: true })
            expect(Math.abs(floorAt(x, z) - y)).toBeLessThan(0.02)
        }
    })

    test('every pickup lies on its floor with room to take it; a giant fits on the roomy ones', () => {
        for (const spot of ERABLES_PLACES.pickups) {
            const y = spot.y ?? 0
            expect({ spot: spot.room, fits: fits(spot.x, spot.z, y) }).toEqual({ spot: spot.room, fits: true })
            expect({ spot: spot.room, floor: Math.abs(floorAt(spot.x, spot.z, y + 0.3) - y) < 0.03 }).toEqual({
                spot: spot.room,
                floor: true,
            })
            if (spot.roomy) {
                expect({ spot: spot.room, giant: fits(spot.x, spot.z, y, PROMOTION.scale) }).toEqual({
                    spot: spot.room,
                    giant: true,
                })
            }
        }
    })

    test('no jetpack extender is rolled here', () => {
        const random = createRng(3)
        for (let i = 0; i < 2000; i++) {
            expect(rollPickup(random, ERABLES_PLACES.pickups[10]!, [], ERABLES_PLACES.pickupWeights)).not.toBe(
                'jetpack'
            )
        }
    })

    test('portals and trampolines are on open ground, a clear way out of each portal', () => {
        for (const portal of ERABLES_PLACES.portals) {
            const y = floorAt(portal.x, portal.z)
            expect(fits(portal.x, portal.z, y)).toBe(true)
            expect(fits(portal.x + portal.out[0] * 0.45, portal.z + portal.out[1] * 0.45, y, PROMOTION.scale)).toBe(
                true
            )
        }
        for (const pad of ERABLES_PLACES.pads) expect(fits(pad.x, pad.z, LAWN * S)).toBe(true)
    })

    test("Siege: each spot has room for its defenders, each dome for its attackers, and the dome's end is open street", () => {
        for (const spot of ERABLES_PLACES.siegeSpots) {
            const open = spotSpawns(spot).filter(s => fits(s.x, s.z, s.y ?? 0))
            expect({ spot: spot.name, room: open.length >= 6 }).toEqual({ spot: spot.name, room: true })
            for (const s of domeSpawns(spot))
                expect({ spot: spot.name, dome: fits(s.x, s.z, 0) }).toEqual({ spot: spot.name, dome: true })
            // Nothing the dome would cut through stands up in it but the road works' own clutter.
            expect(Math.abs(spot.dome.x)).toBeGreaterThan(20 * S)
            expect(Math.abs(spot.dome.x) + SIEGE.domeRadius).toBeLessThan((BOUNDS.x + 3) * S)
        }
    })

    test('people walk at a person’s pace and jump about 55 cm (scaled with the map)', () => {
        const start = standing(-2.6, -1.8, 0)
        const after = run(start, { forward: 1, yaw: Math.PI / 2 }, 1)
        expect((start.x - after.x) / S).toBeGreaterThan(4.0)
        expect((start.x - after.x) / S).toBeLessThan(4.7)
        let b = run(start, { jet: true }, 1 / 60)
        let top = b.y
        for (let i = 0; i < 90; i++) {
            b = stepBody(world, b, { ...idle, jet: true })
            top = Math.max(top, b.y)
        }
        expect((top - start.y) / S).toBeGreaterThan(0.45)
        expect((top - start.y) / S).toBeLessThan(0.65)
        // Held Space in the air does nothing more: no jetpack here.
        expect(b.fuel).toBe(1)
    })

    test('up the bungalow’s front steps, through the door and into the dining room', () => {
        const start = standing(-7.95, -7.0, LAWN)
        const inside = run(start, { forward: 1, yaw: 0 }, 2.5)
        expect(inside.z / S).toBeLessThan(-11.5)
        expect(inside.y / S).toBeCloseTo(0.6, 1)
    })

    test('from the den up the stairs to the bedrooms, and onto the carport roof', () => {
        const den = standing(-3.0, 18.2, 0.2)
        const up = run(den, { forward: 1, yaw: 0 }, 2.0)
        expect(up.y / S).toBeGreaterThan(2.85)
        // Out of the stairwell into the front bedroom, then east through the terrace door.
        const bedroom = run(up, { forward: 1, yaw: 0 }, 0.8)
        expect(bedroom.z / S).toBeLessThan(13.0)
        const across = run(standing(1.0, 11.65, 2.95), { forward: 1, yaw: -Math.PI / 2 }, 1.5)
        expect(across.x / S).toBeGreaterThan(4.0)
        expect(across.y / S).toBeCloseTo(2.95, 1)
    })

    test('every outside door lets you through, even a little off its middle', () => {
        const NORTH = 0
        const SOUTH = Math.PI
        const WEST = Math.PI / 2
        // From outside (x, z, floor), walking `yaw` for `seconds`, through to past `past` on that axis.
        const doors: Array<{
            door: string
            from: [number, number, number]
            yaw: number
            seconds: number
            past: (b: Body) => boolean
        }> = [
            { door: 'bungalow front', from: [-7.8, -7.0, LAWN], yaw: NORTH, seconds: 2.5, past: b => b.z / S < -11.5 },
            { door: 'bungalow patio', from: [-6.25, -21.0, 0.6], yaw: SOUTH, seconds: 1.5, past: b => b.z / S > -18.5 },
            { door: 'garage back', from: [4.9, -21.0, LAWN], yaw: SOUTH, seconds: 1.5, past: b => b.z / S > -18.0 },
            { door: 'split-level front', from: [-6.8, 5.5, LAWN], yaw: SOUTH, seconds: 2.5, past: b => b.z / S > 10.0 },
            {
                door: 'split-level kitchen',
                from: [-10.4, 22.5, LAWN],
                yaw: NORTH,
                seconds: 2.5,
                past: b => b.z / S < 18.0,
            },
            { door: 'den back', from: [1.0, 21.0, LAWN], yaw: NORTH, seconds: 1.5, past: b => b.z / S < 17.8 },
            {
                door: 'den from the carport',
                from: [4.3, 12.8, LAWN + 0.03],
                yaw: WEST,
                seconds: 1.5,
                past: b => b.x / S < 1.8,
            },
        ]
        for (const { door, from, yaw, seconds, past } of doors) {
            const end = run(standing(...from), { forward: 1, yaw }, seconds)
            expect({ door, through: past(end) }).toEqual({ door, through: true })
        }
        // The bungalow's side door: up its steps toward the house, then in.
        const landing = run(standing(-2.2, -11.0, LAWN), { forward: 1, yaw: NORTH }, 0.65)
        expect(landing.z / S).toBeLessThan(-13.1)
        expect(landing.z / S).toBeGreaterThan(-14.4)
        const kitchen = run(landing, { forward: 1, yaw: WEST }, 1.5)
        expect(kitchen.x / S).toBeLessThan(-4.0)
    })

    test('the trampoline behind the garage throws you onto its roof', () => {
        const t = TRAMPOLINES[1]
        let b = standing(t.x, t.z, LAWN)
        b = run(b, {}, 0.1)
        b = run(b, { forward: 1, yaw: Math.PI }, 2.2)
        expect(b.y / S).toBeGreaterThan(3.0)
    })

    test('the trampoline behind the carport throws you onto its roof', () => {
        const t = TRAMPOLINES[0]
        let b = standing(t.x, t.z, LAWN)
        // Steer toward the carport (north-west) once in the air.
        b = run(b, {}, 0.1)
        b = run(b, { forward: 1, yaw: Math.atan2(-(5.8 - t.x), -(14 - t.z)) }, 2.2)
        expect(b.y / S).toBeGreaterThan(2.8)
    })

    test('nobody gets out: 30 s of wild running, jumping and bouncing stays in bounds', () => {
        const random = createRng(11)
        const starts = [
            ...world.spawnPoints.map(p => p.position),
            ...ERABLES_PLACES.pads.map(p => [p.x, LAWN * S, p.z] as const),
        ]
        for (const [sx, sy, sz] of starts) {
            let b = bodyAt(sx, sy + 0.02, sz)
            let input: MoveInput = { ...idle }
            for (let i = 0; i < 30 * 60; i++) {
                if (i % 30 === 0) {
                    input = {
                        ...idle,
                        forward: random() * 2 - 1,
                        strafe: random() * 2 - 1,
                        yaw: random() * Math.PI * 2,
                        jet: random() < 0.4,
                    }
                }
                // Now and then a rocket's shove.
                if (i % 240 === 120)
                    b = {
                        ...b,
                        vx: b.vx + (random() - 0.5) * 3,
                        vy: b.vy + random() * 2,
                        vz: b.vz + (random() - 0.5) * 3,
                    }
                b = stepBody(world, b, input)
                expect(Math.abs(b.x)).toBeLessThan(BOUNDS.x * S)
                expect(Math.abs(b.z)).toBeLessThan(BOUNDS.z * S)
                expect(b.y).toBeGreaterThan(-0.05)
                expect(b.y).toBeLessThan(BOUNDS.lid * S)
            }
        }
    })
})
