import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { PLAYER, sizeAt } from './movement.ts'
import { createRng } from '../../sim/rng.ts'
import {
    inZone,
    PADS,
    partnerOf,
    PICKUP_SPOTS,
    PICKUP_WEIGHTS,
    SHOVE_PICKUP_WEIGHTS,
    PORTAL,
    PORTALS,
    PROMOTION,
    rollPickup,
    domeSpawns,
    inSpot,
    SIEGE_SPOTS,
    SPOT_HEIGHT,
    spotSpawns,
    siegeForbidsBuild,
    siegeWinner,
    ZONES,
} from './places.ts'
import { SIEGE } from '../protocol.ts'
import { BUILD } from './walls.ts'
import { buildOfficeGeometry } from '../map/office.js'
import { collideCapsule, officeWorld, rayDistance, rayHit, worldFrom } from './world.ts'

/** Straight down from just under the ceiling: where the first thing below is (y). */
function below(x: number, z: number): number {
    return 2.5 - rayDistance(officeWorld(), new Vector3(x, 2.5, z), new Vector3(0, -1, 0), 20)
}

/** Does a mini of this size stand clear on the floor at x, z? */
function fits(x: number, z: number, scale = 1): boolean {
    const size = sizeAt(scale)
    const seg = new Line3(new Vector3(x, 0.02 + size.radius, z), new Vector3(x, 0.02 + size.height - size.radius, z))
    return !collideCapsule(officeWorld(), seg, size.radius)
}

describe('the pads, the portals and the big powers', () => {
    test('a giant fits on every roomy spot (a Promotion grows you right there), and only there is one rolled', () => {
        const roomy = PICKUP_SPOTS.filter(s => s.roomy)
        expect(roomy.length).toBeGreaterThan(3)
        for (const spot of roomy) {
            expect({ spot: spot.room, fits: fits(spot.x, spot.z, PROMOTION.scale) }).toEqual({
                spot: spot.room,
                fits: true,
            })
        }
    })

    test('what lies on a spot is rolled: anything, the basics most, a Promotion only where a giant fits, no power twice', () => {
        const random = createRng(7)
        const cramped = PICKUP_SPOTS.find(s => !s.roomy)!
        const roomy = PICKUP_SPOTS.find(s => s.roomy)!
        const seen = new Map<string, number>()
        for (let i = 0; i < 4000; i++) {
            const kind = rollPickup(random, roomy, [])
            seen.set(kind, (seen.get(kind) ?? 0) + 1)
            expect(rollPickup(random, cramped, [])).not.toBe('promotion')
        }
        // Every kind the guns' pool weighs (Shove's own aren't in it).
        const pooled = (weights: Record<string, number>) =>
            Object.keys(weights)
                .filter(k => weights[k]! > 0)
                .sort()
        expect([...seen.keys()].sort()).toEqual(pooled(PICKUP_WEIGHTS))
        expect(seen.get('health')!).toBeGreaterThan(seen.get('bonus')! * 2)
        // A Bonus already lying elsewhere: not a second one; a second health pack, yes.
        for (let i = 0; i < 500; i++) expect(rollPickup(random, roomy, ['bonus', 'health'])).not.toBe('bonus')
        // A spot with its own kind keeps it.
        expect(rollPickup(random, { ...cramped, kind: 'intern' }, [])).toBe('intern')

        // Shove's pool: no guns to feed, no health to heal.
        const shove = new Set<string>()
        for (let i = 0; i < 4000; i++) shove.add(rollPickup(random, roomy, [], SHOVE_PICKUP_WEIGHTS))
        expect([...shove].sort()).toEqual(pooled(SHOVE_PICKUP_WEIGHTS))
        expect(shove.has('health') || shove.has('magazine') || shove.has('headshot')).toBe(false)
    })

    test('pads lie on open floor with room overhead to fly up', () => {
        for (const pad of PADS) {
            expect(fits(pad.x, pad.z)).toBe(true)
            expect(Math.abs(below(pad.x, pad.z))).toBeLessThan(0.02)
            const overhead = rayDistance(officeWorld(), new Vector3(pad.x, 0.05, pad.z), new Vector3(0, 1, 0), 5)
            expect(overhead).toBeGreaterThan(2.4)
        }
    })

    test('portals come in pairs, on open floor, with a clear way out of each (even for a giant)', () => {
        expect(PORTALS.length % 2).toBe(0)
        for (const [i, portal] of PORTALS.entries()) {
            expect(PORTALS[partnerOf(i)]).toBeDefined()
            expect(Math.abs(below(portal.x, portal.z))).toBeLessThan(0.02)
            expect(Math.hypot(...portal.out)).toBeCloseTo(1, 6)
            const exit = { x: portal.x + portal.out[0] * PORTAL.exit, z: portal.z + portal.out[1] * PORTAL.exit }
            expect({
                portal: portal.room,
                mini: fits(exit.x, exit.z),
                giant: fits(exit.x, exit.z, PROMOTION.scale),
            }).toEqual({
                portal: portal.room,
                mini: true,
                giant: true,
            })
        }
        // One end of the office to the other.
        expect(Math.abs(PORTALS[0]!.x - PORTALS[1]!.x)).toBeGreaterThan(15)
    })

    test('the powers, pads and portals keep clear of everything else (spawns and the first pickups included)', () => {
        // The first five spots sit by spawns on purpose (something to grab on the way out).
        const things = [
            ...PICKUP_SPOTS.map((s, i) => ({ name: `pickup in ${s.room}`, x: s.x, z: s.z, mine: i >= 5 })),
            ...PADS.map((p, i) => ({ name: `pad ${i}`, x: p.x, z: p.z, mine: true })),
            ...PORTALS.map(p => ({ name: `portal in ${p.room}`, x: p.x, z: p.z, mine: true })),
            ...officeWorld().spawnPoints.map(s => ({
                name: `${s.name} spawn`,
                x: s.position[0],
                z: s.position[2],
                mine: false,
            })),
        ]
        for (const [i, a] of things.entries()) {
            for (const b of things.slice(i + 1)) {
                const apart = Math.hypot(a.x - b.x, a.z - b.z)
                if ((a.mine || b.mine) && apart < 0.7) expect({ a: a.name, b: b.name, apart }).toBeNull()
            }
        }
    })
})

describe('what the office is made of (for bullet impacts)', () => {
    const built = buildOfficeGeometry({ outside: false, surfaces: true })
    const world = worldFrom(built)

    test('the open office is carpeted, the kitchen tiled, the walls plaster, the glass glass', () => {
        const down = (x: number, z: number) => rayHit(world, new Vector3(x, 1.5, z), new Vector3(0, -1, 0), 5)!.surface
        expect(down(0, 0)).toBe('fabric')
        expect(down(-8.4, -1.4)).toBe('tile')
        expect(rayHit(world, new Vector3(0, 0.3, 0), new Vector3(1, 0, 0), 30)!.surface).toBe('plaster')
        // Somewhere along the length of the office there's glass, seen as glass.
        const kinds = new Set<string>()
        for (let z = -5; z <= 5; z += 0.5) {
            for (const x of [-1, 1]) {
                const hit = rayHit(world, new Vector3(0, 1.2, z), new Vector3(x, 0, 0), 30)
                if (hit) kinds.add(hit.surface)
            }
        }
        expect(kinds.has('glass')).toBe(true)
    })

    test('a hit faces the way it came from, at the distance the plain ray finds', () => {
        const from = new Vector3(0, 0.3, 0)
        const east = new Vector3(1, 0, 0)
        const hit = rayHit(world, from, east, 30)!
        expect(hit.normal.dot(east)).toBeLessThan(0)
        expect(hit.distance).toBeCloseTo(rayDistance(officeWorld(), from, east, 30), 6)
    })

    test("noting the surfaces leaves the collision exactly as it is (the server's has none)", () => {
        const plain = officeWorld().meshes[0]!.geometry
        const noted = world.meshes[0]!.geometry
        expect(noted.index!.count).toBe(plain.index!.count)
        expect(Bun.hash(noted.index!.array as Uint32Array)).toBe(Bun.hash(plain.index!.array as Uint32Array))
        expect(Bun.hash(noted.attributes.position!.array as Float32Array)).toBe(
            Bun.hash(plain.attributes.position!.array as Float32Array)
        )
        expect(officeWorld().meshes[0]!.userData.surfaces).toBeUndefined()
    })
})

describe('the places in the office', () => {
    test('every pickup lies on open floor inside the office, where a mini fits', () => {
        for (const spot of PICKUP_SPOTS) {
            const seg = new Line3(
                new Vector3(spot.x, 0.02 + PLAYER.radius, spot.z),
                new Vector3(spot.x, 0.02 + PLAYER.height - PLAYER.radius, spot.z)
            )
            expect({ spot: spot.room, blocked: collideCapsule(officeWorld(), seg, PLAYER.radius) }).toEqual({
                spot: spot.room,
                blocked: false,
            })
            expect(Math.abs(below(spot.x, spot.z))).toBeLessThan(0.02)
        }
    })

    test('every zone is inside the office, and no pickup is in one', () => {
        for (const zone of ZONES) {
            // Under the ceiling there's something (the floor or furniture), not the street 7 m down.
            expect(below(zone.x, zone.z)).toBeGreaterThan(-0.05)
            for (const spot of PICKUP_SPOTS) expect(inZone(zone, spot.x, spot.z)).toBe(false)
        }
    })

    test('in a zone is within its radius on the floor plan', () => {
        const zone = ZONES[0]!
        expect(inZone(zone, zone.x + zone.radius * 0.9, zone.z)).toBe(true)
        expect(inZone(zone, zone.x, zone.z + zone.radius * 1.1)).toBe(false)
    })
})

describe("siege's spots and domes", () => {
    test('every spot is in the office, no pickup in it, and its defenders have room to come back round its edge', () => {
        for (const spot of SIEGE_SPOTS) {
            expect(below(spot.x, spot.z)).toBeGreaterThan(-0.05)
            for (const pickup of PICKUP_SPOTS)
                expect({ spot: spot.name, in: inSpot(spot, pickup.x, pickup.z) }).toEqual({
                    spot: spot.name,
                    in: false,
                })
            // Furniture takes some; at least a few are open, all in the square and none in its middle.
            const spawns = spotSpawns(spot)
            const open = spawns.filter(at => fits(at.x, at.z))
            expect({ spot: spot.name, open: open.length >= 4 }).toEqual({ spot: spot.name, open: true })
            for (const at of spawns) {
                expect(inSpot(spot, at.x, at.z)).toBe(true)
                expect(Math.max(Math.abs(at.x - spot.x), Math.abs(at.z - spot.z))).toBeGreaterThan(0.3)
            }
        }
    })

    test('the spot is a square: its corner in, just past its side out', () => {
        const spot = SIEGE_SPOTS[0]!
        const h = spot.half
        expect(inSpot(spot, spot.x + h * 0.95, spot.z - h * 0.95)).toBe(true)
        expect(inSpot(spot, spot.x + h * 1.05, spot.z)).toBe(false)
        expect(inSpot(spot, spot.x, spot.z - h * 1.05)).toBe(false)
    })

    test('the spot goes two walls up, not to the ceiling: on a desk in it counts, flying over it does not', () => {
        const spot = SIEGE_SPOTS[0]!
        expect(SPOT_HEIGHT).toBeCloseTo(2 * BUILD.size, 5)
        expect(inSpot(spot, spot.x, spot.z, 0.76)).toBe(true)
        expect(inSpot(spot, spot.x, spot.z, SPOT_HEIGHT + 0.01)).toBe(false)
    })

    test('each dome is at the far end, a mini fits at every attacker spawn in it, and no pickup, pad or portal is in it', () => {
        for (const spot of SIEGE_SPOTS) {
            const { dome } = spot
            expect(Math.hypot(dome.x - spot.x, dome.z - spot.z)).toBeGreaterThan(8)
            for (const at of domeSpawns(spot)) {
                expect({ spot: spot.name, at, fits: fits(at.x, at.z) }).toEqual({ spot: spot.name, at, fits: true })
                // In the office (on the floor, maybe under a desk), not over the street.
                expect(below(at.x, at.z)).toBeGreaterThan(-0.05)
            }
            const clear = SIEGE.domeRadius + 0.3
            for (const p of [...PICKUP_SPOTS, ...PADS, ...PORTALS]) {
                expect(Math.hypot(p.x - dome.x, p.z - dome.z)).toBeGreaterThan(clear)
            }
        }
    })

    test('only the defenders build, and not by the dome', () => {
        const spot = SIEGE_SPOTS[0]!
        const siege = { spot: 0, attackers: 'red' as const }
        expect(siegeForbidsBuild(siege, 'red', spot.x, spot.z)).toBe(true)
        expect(siegeForbidsBuild(siege, 'blue', spot.x, spot.z)).toBe(false)
        expect(siegeForbidsBuild(siege, 'blue', spot.dome.x + SIEGE.domeRadius + 1, spot.dome.z)).toBe(true)
        expect(
            siegeForbidsBuild(siege, 'blue', spot.dome.x + SIEGE.domeRadius + SIEGE.noBuild + 0.1, spot.dome.z)
        ).toBe(false)
    })

    test('the most points wins; on a tie, the side that got there faster; else a draw', () => {
        expect(siegeWinner({ red: 3, blue: 2 }, { red: 200_000, blue: 10_000 })).toBe('red')
        expect(siegeWinner({ red: 2, blue: 2 }, { red: 200_000, blue: 100_000 })).toBe('blue')
        expect(siegeWinner({ red: 2, blue: 2 }, { red: 100_000, blue: 100_000 })).toBeNull()
        expect(siegeWinner({ red: 0, blue: 0 }, { red: null, blue: null })).toBeNull()
    })
})
