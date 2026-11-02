import { describe, expect, test } from 'bun:test'
import { Line3, Vector3 } from 'three'
import { buildOfficeGeometry, plainOfficeMaterials } from '../map/office.js'
import { PLAYER } from './movement.ts'
import { collideCapsule, officeWorld, rayDistance } from './world.ts'

describe('the office on the game server', () => {
    test('builds without a DOM, with its collision, spawn points and doors', () => {
        const office = buildOfficeGeometry({ outside: false })

        expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
        expect(office.collision).not.toBeNull()
        // ~150k triangles: walls, floor, ceiling and the furniture down to the mugs.
        expect(office.collision!.solid.geometry.index!.count / 3).toBeGreaterThan(100_000)
        expect(office.collision!.glass.geometry.index!.count / 3).toBeGreaterThan(0)
        expect(office.spawnPoints).toHaveLength(9)
        expect(office.doors.map(d => d.name)).toContain('kitchen')
    })

    test('the street outside changes nothing that collides', () => {
        const without = buildOfficeGeometry({ outside: false, materials: plainOfficeMaterials() })
        const withIt = buildOfficeGeometry({ materials: plainOfficeMaterials() })

        expect(withIt.collision!.solid.geometry.index!.count).toBe(without.collision!.solid.geometry.index!.count)
        expect(withIt.outside.children.length).toBeGreaterThan(0)
        expect(without.outside.children).toHaveLength(0)
    })

    test('every spawn point leaves a mini room to stand', () => {
        const world = officeWorld()
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
        }
    })

    test('a ray stops at the first wall', () => {
        const world = officeWorld()
        // South from the open office's spawn at 0.6 m: the ottoman (0.44 m high) is in the way lower down.
        expect(1.0 + rayDistance(world, new Vector3(2.8, 0.3, 1.0), new Vector3(0, 0, 1), 30)).toBeCloseTo(2.51, 1)
        // Over it, under the TV desk, into the window's glass.
        const distance = rayDistance(world, new Vector3(2.8, 0.6, 1.0), new Vector3(0, 0, 1), 30)
        expect(1.0 + distance).toBeGreaterThan(4.9)
        expect(1.0 + distance).toBeLessThan(5.13)
    })

    test('nothing in reach is open sky: every direction from a spawn meets the office', () => {
        const world = officeWorld()
        const [x, , z] = world.spawnPoints[0]!.position
        for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2
            const direction = new Vector3(Math.cos(a), Math.sin(i * 0.7) * 0.6, Math.sin(a)).normalize()

            expect(rayDistance(world, new Vector3(x, PLAYER.eye, z), direction, 100)).toBeLessThan(100)
        }
    })
})
