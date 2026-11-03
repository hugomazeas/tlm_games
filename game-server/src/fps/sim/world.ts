import { Box3, DoubleSide, Line3, Ray, Vector3 } from 'three'
import { buildOfficeGeometry, type CollisionMesh, type OfficeCollision, type SpawnPoint } from '../map/office.js'
import { PICKUP_SPOTS, type PickupSpot } from './places.ts'

/**
 * What the game needs of the office: its exact collision triangles (with their BVH) and where
 * people spawn. The same build runs on the game server and in the browser, so both collide with
 * the triangles the browser draws.
 */
export interface FpsWorld {
    /** Solid first, then glass: both stop players and bullets. */
    meshes: readonly CollisionMesh[]
    spawnPoints: readonly SpawnPoint[]
    /** Where the pickups lie (the office's; none in a test room unless it says so). */
    pickups: readonly PickupSpot[]
}

let office: FpsWorld | null = null

/** The office, built once (about a second) and shared: it never changes. */
export function officeWorld(): FpsWorld {
    office ??= worldFrom(buildOfficeGeometry({ outside: false }))

    return office
}

/** The world of an office already built (the browser's, drawn and collided with alike). */
export function worldFrom(built: { collision: OfficeCollision | null; spawnPoints: readonly SpawnPoint[] }): FpsWorld {
    if (!built.collision) throw new Error('The office was built without its collision meshes')

    return {
        meshes: [built.collision.solid, built.collision.glass],
        spawnPoints: built.spawnPoints,
        pickups: PICKUP_SPOTS,
    }
}

const box = new Box3()
const onTriangle = new Vector3()
const onSegment = new Vector3()
const push = new Vector3()

/**
 * Pushes a capsule (the segment `seg`, world space, and its `radius`) out of the world's
 * triangles. Moves `seg` in place; true when it touched anything.
 */
export function collideCapsule(world: FpsWorld, seg: Line3, radius: number): boolean {
    let hit = false
    for (const mesh of world.meshes) {
        for (let pass = 0; pass < 2; pass++) {
            box.makeEmpty()
            box.expandByPoint(seg.start)
            box.expandByPoint(seg.end)
            box.min.addScalar(-radius)
            box.max.addScalar(radius)
            mesh.geometry.boundsTree.shapecast({
                intersectsBounds: bounds => bounds.intersectsBox(box),
                intersectsTriangle: triangle => {
                    const distance = triangle.closestPointToSegment(seg, onTriangle, onSegment)
                    if (distance >= radius) return
                    if (distance > 1e-6) push.subVectors(onSegment, onTriangle).divideScalar(distance)
                    else triangle.getNormal(push)
                    seg.start.addScaledVector(push, radius - distance)
                    seg.end.addScaledVector(push, radius - distance)
                    hit = true
                },
            })
        }
    }

    return hit
}

const ray = new Ray()

/** How far a ray from `origin` along the unit `direction` goes before it meets a wall, glass or furniture (capped at `far`). */
export function rayDistance(world: FpsWorld, origin: Vector3, direction: Vector3, far: number): number {
    ray.set(origin, direction)
    let nearest = far
    for (const mesh of world.meshes) {
        const hit = mesh.geometry.boundsTree.raycastFirst(ray, DoubleSide, 0, nearest)
        if (hit && hit.distance < nearest) nearest = hit.distance
    }

    return nearest
}
