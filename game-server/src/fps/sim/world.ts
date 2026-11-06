import { Box3, DoubleSide, Line3, Ray, Vector3 } from 'three'
import type { ExtendedTriangle } from 'three-mesh-bvh'
import {
    buildOfficeGeometry,
    type CollisionMesh,
    type OfficeCollision,
    type SpawnPoint,
    type Surface,
    SURFACES,
} from '../map/office.js'
import { PADS, type Pad, PICKUP_SPOTS, type PickupSpot, type Portal, PORTALS } from './places.ts'
import { collideWalls, rayWalls, type Wall, Walls } from './walls.ts'

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
    /** What the players built: this world's own (each game has its walls; the office is shared). */
    walls: Walls
}

let office: FpsWorld | null = null

/** The office, built once (about a second) and shared, with walls of its own for each caller (each game). */
export function officeWorld(): FpsWorld {
    office ??= worldFrom(buildOfficeGeometry({ outside: false }))

    return { ...office, walls: new Walls() }
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
        walls: new Walls(),
    }
}

const box = new Box3()
const onTriangle = new Vector3()
const onSegment = new Vector3()
const push = new Vector3()

/**
 * Pushes an upright capsule (the segment `seg`, world space, and its `radius`) out of the world's
 * triangles and the walls built in it. Moves `seg` in place; true when it touched anything.
 */
export function collideCapsule(world: FpsWorld, seg: Line3, radius: number): boolean {
    // The walls first: a wall placed on a player pushes them out of it, and the office then has the last word.
    let hit = world.walls.count > 0 && collideWalls(world.walls, seg, radius)
    cast.seg = seg
    cast.radius = radius
    for (const mesh of world.meshes) {
        for (let pass = 0; pass < 2; pass++) {
            box.makeEmpty()
            box.expandByPoint(seg.start)
            box.expandByPoint(seg.end)
            box.min.addScalar(-radius)
            box.max.addScalar(radius)
            cast.touched = false
            mesh.geometry.boundsTree.shapecast(capsuleCast)
            hit ||= cast.touched
            // Nothing moved the capsule: a second pass would find the same nothing.
            if (!cast.touched) break
        }
    }

    return hit
}

/** The capsule being pushed out, for `capsuleCast`: one shared set of callbacks, not new ones (garbage) per call. */
const cast = { seg: new Line3(), radius: 0, touched: false }
const capsuleCast = {
    intersectsBounds: (bounds: Box3) => bounds.intersectsBox(box),
    intersectsTriangle: (triangle: ExtendedTriangle): void => {
        const { seg, radius } = cast
        // Out of reach on one axis: further than the radius, so the exact test (most of a step's time) can't push.
        if (beyondReach(triangle, seg, radius)) return
        const distance = triangle.closestPointToSegment(seg, onTriangle, onSegment)
        if (distance >= radius) return
        if (distance > 1e-6) push.subVectors(onSegment, onTriangle).divideScalar(distance)
        else triangle.getNormal(push)
        seg.start.addScaledVector(push, radius - distance)
        seg.end.addScaledVector(push, radius - distance)
        cast.touched = true
    },
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

/**
 * Where a ray meets the office: the point, the face's normal (toward the ray), what it's made of,
 * and the built wall it is (null: the office's own).
 */
export interface RayHit {
    distance: number
    point: Vector3
    normal: Vector3
    surface: Surface | 'glass'
    wall: Wall | null
}

/** A built wall's panel: a fabric partition, like the office's cubicles. */
const WALL_SURFACE: Surface = 'fabric'

/**
 * The first wall, glass, furniture or built wall a ray from `origin` along the unit `direction`
 * meets within `far`, with what it's made of: plaster where the world wasn't built with its
 * surfaces (the server's).
 */
export function rayHit(world: FpsWorld, origin: Vector3, direction: Vector3, far: number): RayHit | null {
    ray.set(origin, direction)
    let best: RayHit | null = null
    const built = world.walls.count > 0 ? rayWalls(world.walls, origin, direction, far) : null
    if (built) {
        const normal = new Vector3()
        normal[built.axis] = built.sign
        best = {
            distance: built.distance,
            point: origin.clone().addScaledVector(direction, built.distance),
            normal,
            surface: WALL_SURFACE,
            wall: built.wall,
        }
    }
    for (const [i, mesh] of world.meshes.entries()) {
        const hit = mesh.geometry.boundsTree.raycastFirst(ray, DoubleSide, 0, best?.distance ?? far)
        if (!hit || hit.distance >= (best?.distance ?? far)) continue
        const normal = hit.face ? hit.face.normal.clone() : direction.clone().negate()
        // Hit from behind (a double-sided face): the side the ray came from.
        if (normal.dot(direction) > 0) normal.negate()
        const surfaces = mesh.userData.surfaces as Uint8Array | undefined
        const surface: Surface | 'glass' =
            i > 0 ? 'glass' : (SURFACES[surfaces?.[hit.faceIndex ?? -1] ?? 0] ?? 'plaster')
        best = { distance: hit.distance, point: hit.point.clone(), normal, surface, wall: null }
    }

    return best
}

/** How far a ray goes before something stops it (capped at `far`), and the built wall that did (null: the office or nothing). */
export function rayStop(
    world: FpsWorld,
    origin: Vector3,
    direction: Vector3,
    far: number
): { distance: number; wall: Wall | null } {
    ray.set(origin, direction)
    let nearest = far
    for (const mesh of world.meshes) {
        const hit = mesh.geometry.boundsTree.raycastFirst(ray, DoubleSide, 0, nearest)
        if (hit && hit.distance < nearest) nearest = hit.distance
    }
    const built = world.walls.count > 0 ? rayWalls(world.walls, origin, direction, nearest) : null

    return built ? { distance: built.distance, wall: built.wall } : { distance: nearest, wall: null }
}

/** How far a ray from `origin` along the unit `direction` goes before it meets a wall, glass, furniture or a built wall (capped at `far`). */
export function rayDistance(world: FpsWorld, origin: Vector3, direction: Vector3, far: number): number {
    return rayStop(world, origin, direction, far).distance
}
