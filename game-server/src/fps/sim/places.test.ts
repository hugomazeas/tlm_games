import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { PLAYER, sizeAt } from './movement.ts'
import { inZone, PADS, partnerOf, PICKUP_SPOTS, PORTAL, PORTALS, PROMOTION, ZONES } from './places.ts'
import { collideCapsule, officeWorld, rayDistance } from './world.ts'

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
    test('a giant fits where the Promotion and Overtime lie (you grow, or tank, right there)', () => {
        for (const spot of PICKUP_SPOTS.filter(s => s.kind === 'promotion' || s.kind === 'overtime')) {
            expect({ spot: spot.room, fits: fits(spot.x, spot.z, PROMOTION.scale) }).toEqual({
                spot: spot.room,
                fits: true,
            })
        }
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
        // The first pickups sit by their spawns on purpose (a heal or a jetpack on the way out).
        const FIRST = ['health', 'magazine', 'jetpack', 'headshot']
        const things = [
            ...PICKUP_SPOTS.map(s => ({ name: `${s.kind} pickup`, x: s.x, z: s.z, mine: !FIRST.includes(s.kind) })),
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
