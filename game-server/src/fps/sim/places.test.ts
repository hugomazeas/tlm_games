import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { PLAYER } from './movement.ts'
import { inZone, PICKUP_SPOTS, ZONES } from './places.ts'
import { collideCapsule, officeWorld, rayDistance } from './world.ts'

/** Straight down from just under the ceiling: where the first thing below is (y). */
function below(x: number, z: number): number {
    return 2.5 - rayDistance(officeWorld(), new Vector3(x, 2.5, z), new Vector3(0, -1, 0), 20)
}

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
