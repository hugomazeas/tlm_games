import { describe, expect, test } from 'bun:test'
import { DoubleSide, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { buildOfficeGeometry, plainOfficeMaterials, SPAWN_POINTS } from './office.js'
import { decodeLight, encodeLight, geometryFingerprint, irradianceAt, type OfficeLight } from './light.ts'
import packed from './office-light.b64' with { type: 'text' }

const light = decodeLight(Bun.gunzipSync(Buffer.from(packed.trim(), 'base64')))
const office = buildOfficeGeometry({ materials: plainOfficeMaterials() })
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!

describe('the office light bake', () => {
    test('was baked from this office (change its shapes: run `bun run fps:light` and commit the file)', () => {
        expect(light.fingerprint).toBe(geometryFingerprint(office.collision!.solid.geometry))
    })

    test('covers the office, floor to ceiling', () => {
        office.interior.updateMatrixWorld(true)
        const [nx, ny, nz] = light.size
        expect(light.origin[0]).toBeLessThan(-10.8)
        expect(light.origin[0] + nx * light.cell[0]).toBeGreaterThan(10.9)
        expect(light.origin[2]).toBeLessThan(-5.1)
        expect(light.origin[2] + nz * light.cell[2]).toBeGreaterThan(5.4)
        expect(ny * light.cell[1]).toBeCloseTo(office.bounds.ceilingY, 1)
    })

    test('the open floor at the spawns is lit 1, the floor under desks and tables less', () => {
        const open = median(SPAWN_POINTS.map(s => irradianceAt(light, s.position[0], 0, s.position[2])))
        expect(open).toBeCloseTo(1, 1)

        // Every 25 cm over the office: the floor with a top 60–80 cm over it, and the floor open to the ceiling.
        const bvh = (office.collision!.solid.geometry as unknown as { boundsTree: MeshBVH }).boundsTree
        const ray = new Ray(new Vector3(), new Vector3(0, 1, 0))
        const covered: number[] = []
        const clear: number[] = []
        for (let x = -10.5; x < 10.5; x += 0.25) {
            for (let z = -5; z < 5.3; z += 0.25) {
                ray.origin.set(x, 0.02, z)
                const up = bvh.raycastFirst(ray, DoubleSide)
                if (!up) continue
                const level = irradianceAt(light, x, 0, z)
                if (up.distance > 0.6 && up.distance < 0.8) covered.push(level)
                if (up.distance > 2.6) clear.push(level)
            }
        }
        expect(covered.length).toBeGreaterThan(100)
        // Light still gets in from the sides: about a quarter less.
        expect(median(covered)).toBeLessThan(median(clear) * 0.8)
    })

    test('a ceiling faces less light than the floor under it; a wall facing the room gets some', () => {
        const [x, , z] = SPAWN_POINTS[0]!.position
        const floor = irradianceAt(light, x, 0, z, 0, 1, 0)
        const ceiling = irradianceAt(light, x, office.bounds.ceilingY, z, 0, -1, 0)
        expect(ceiling).toBeLessThan(floor)
        expect(ceiling).toBeGreaterThan(0)
    })

    test('outside the grid: 1, as the shader has it', () => {
        expect(irradianceAt(light, 0, -7, 0)).toBe(1)
        expect(irradianceAt(light, 40, 1, 0)).toBe(1)
    })

    test('the file format keeps every byte', () => {
        const data = Uint8Array.from({ length: 2 * 3 * 4 * 4 }, (_, i) => (i * 37) % 256)
        const small: OfficeLight = {
            fingerprint: 123,
            size: [2, 3, 4],
            origin: [-1, 0, 2],
            cell: [0.125, 0.135, 0.125],
            max: 2.5,
            data,
        }
        const back = decodeLight(encodeLight(small))
        expect(back.data).toEqual(data)
        expect(back.size).toEqual([2, 3, 4])
        expect(back.fingerprint).toBe(123)
        expect(back.max).toBeCloseTo(2.5, 6)
        expect(back.origin[2]).toBeCloseTo(2, 6)
    })
})
