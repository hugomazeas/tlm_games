import { Box3, DoubleSide, Line3, Ray, Vector3 } from 'three'
import { buildOfficeGeometry, type CollisionMesh, type OfficeCollision, type SpawnPoint } from '../map/office.js'
import { PADS, type Pad, PICKUP_SPOTS, type PickupSpot, type Portal, PORTALS } from './places.ts'

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
    /** Jump pads and portals (the office's; likewise none in a test room unless asked). */
    pads: readonly Pad[]
    portals: readonly Portal[]
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
        pads: PADS,
        portals: PORTALS,
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
            let touched = false
            mesh.geometry.boundsTree.shapecast({
                intersectsBounds: bounds => bounds.intersectsBox(box),
                intersectsTriangle: triangle => {
                    // Out of reach on one axis: further than the radius, so the exact test (most of a step's time) can't push.
                    if (beyondReach(triangle, seg, radius)) return
                    const distance = triangle.closestPointToSegment(seg, onTriangle, onSegment)
                    if (distance >= radius) return
                    if (distance > 1e-6) push.subVectors(onSegment, onTriangle).divideScalar(distance)
                    else triangle.getNormal(push)
                    seg.start.addScaledVector(push, radius - distance)
                    seg.end.addScaledVector(push, radius - distance)
                    touched = true
                },
            })
            hit ||= touched
            // Nothing moved the capsule: a second pass would find the same nothing.
            if (!touched) break
        }
    }

    return hit
}

/** The triangle's box and the segment's are further apart than `radius` on some axis. */
function beyondReach(t: { a: Vector3; b: Vector3; c: Vector3 }, seg: Line3, radius: number): boolean {
    const { start: s, end: e } = seg
    return (
        Math.min(t.a.x, t.b.x, t.c.x) > Math.max(s.x, e.x) + radius ||
        Math.max(t.a.x, t.b.x, t.c.x) < Math.min(s.x, e.x) - radius ||
        Math.min(t.a.y, t.b.y, t.c.y) > Math.max(s.y, e.y) + radius ||
        Math.max(t.a.y, t.b.y, t.c.y) < Math.min(s.y, e.y) - radius ||
        Math.min(t.a.z, t.b.z, t.c.z) > Math.max(s.z, e.z) + radius ||
        Math.max(t.a.z, t.b.z, t.c.z) < Math.min(s.z, e.z) - radius
    )
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
