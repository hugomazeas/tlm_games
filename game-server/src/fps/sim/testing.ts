import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { CollisionMesh, SpawnPoint } from '../map/office.js'
import type { PickupSpot } from './places.ts'
import type { FpsWorld } from './world.ts'

/**
 * A bare room for tests: a 40 × 40 m floor at y = 0, nothing else unless asked (`walls`: boxes
 * given by their min and max corners; `pickups`), and the spawn points given. Fast to build, easy
 * to aim in.
 */
export function testWorld(
    spawnPoints: SpawnPoint[],
    walls: Array<{ min: [number, number, number]; max: [number, number, number] }> = [],
    pickups: PickupSpot[] = []
): FpsWorld {
    const positions: number[] = []
    const quad = (a: number[], b: number[], c: number[], d: number[]) =>
        positions.push(...a, ...b, ...c, ...a, ...c, ...d)
    quad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20])
    for (const { min, max } of walls) {
        const [x0, y0, z0] = min
        const [x1, y1, z1] = max
        quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0])
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
        quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0])
        quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1])
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const solid = new Mesh(geometry) as unknown as CollisionMesh
    solid.geometry.boundsTree = new MeshBVH(geometry)

    return { meshes: [solid], spawnPoints, pickups }
}
