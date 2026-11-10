import { Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Line3, Mesh, Ray, Vector3 } from 'three'
import { type ExtendedTriangle, MeshBVH } from 'three-mesh-bvh'
import {
    boxTriangles,
    CLOUD_NINE,
    CLOUD_NINE_BLOCKS,
    CLOUD_NINE_PICKUPS,
    CLOUD_NINE_SPAWNS,
    CLOUD_NINE_SHIELD_MS,
    CLOUD_NINE_VENTS,
    ELEVATOR,
    elevatorAt,
    GONDOLA,
    gondolaAt,
} from '../map/cloud-nine.ts'
import {
    buildOfficeGeometry,
    type CollisionMesh,
    type OfficeCollision,
    type SpawnPoint,
    type Surface,
    SURFACES,
} from '../map/office.js'
import { type Dome, PADS, type Pad, PICKUP_SPOTS, type PickupSpot, type Portal, PORTALS } from './places.ts'
import { collideWalls, pushOut, rayWalls, type Wall, Walls } from './walls.ts'

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
    /** Siege's dome while it stands (each game its own, like the walls): nothing gets in or out. */
    dome?: Dome | null
    /** Fall below this (m) and you're out: a kill for whoever last hit you (Cloud Nine's ledges). None: the office. */
    outBelow?: number
    /** The jetpack takes nobody higher (m). None: the office's own ceiling does. */
    ceiling?: number
    /** Boxes that move on the step (Cloud Nine's gondola): bodies collide with them and ride them. */
    movers?: readonly Mover[]
    /** The step the movers are at: the arena's (the server), its estimate (the browser). Each world its own. */
    clock?: { step: number }
    /** Cloud Nine's security laser sweeps the deck (`LASER`). */
    laser?: boolean
    /** Spawn-shielded this long here (none: the usual 1.5 s). */
    shieldMs?: number
}

/** A moving box: its half size, and where it is (its middle) and how fast it goes along x at a step. */
export interface Mover {
    half: readonly [number, number, number]
    at(step: number): { x: number; y: number; z: number; vx: number }
}

const moverBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }

/** A mover's box now. */
export function moverBoxOf(world: FpsWorld, mover: Mover): typeof moverBox {
    const at = mover.at(world.clock?.step ?? 0)
    const [hx, hy, hz] = mover.half
    moverBox.minX = at.x - hx
    moverBox.maxX = at.x + hx
    moverBox.minY = at.y - hy
    moverBox.maxY = at.y + hy
    moverBox.minZ = at.z - hz
    moverBox.maxZ = at.z + hz
    return moverBox
}

let office: FpsWorld | null = null
let cloudNine: FpsWorld | null = null

/** Cloud Nine, built once (its few blocks) and shared, with walls of its own for each caller. */
export function cloudNineWorld(): FpsWorld {
    if (!cloudNine) {
        const positions: number[] = []
        for (const block of CLOUD_NINE_BLOCKS) boxTriangles(block, positions)
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
        const solid = new Mesh(geometry) as unknown as CollisionMesh
        solid.geometry.boundsTree = new MeshBVH(geometry)
        // What the impacts make of it: metal (the surfaces' index).
        solid.userData.surfaces = new Uint8Array(positions.length / 9).fill(SURFACES.indexOf('metal'))
        cloudNine = {
            meshes: [solid],
            spawnPoints: CLOUD_NINE_SPAWNS,
            pickups: CLOUD_NINE_PICKUPS,
            pads: CLOUD_NINE_VENTS,
            portals: [],
            walls: new Walls(),
            outBelow: CLOUD_NINE.outBelow,
            ceiling: CLOUD_NINE.ceiling,
            movers: [
                { half: GONDOLA.half, at: gondolaAt },
                { half: ELEVATOR.half, at: elevatorAt },
            ],
            laser: true,
            shieldMs: CLOUD_NINE_SHIELD_MS,
        }
    }

    return { ...cloudNine, walls: new Walls(), clock: { step: 0 } }
}

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
    for (const mover of world.movers ?? []) hit = pushOut(moverBoxOf(world, mover), seg, radius) || hit
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
    // The dome last: whoever is in stays in, whoever is out stays out, whatever pushed them.
    if (world.dome) hit = collideDome(world.dome, seg, radius) || hit

    return hit
}

/**
 * Keeps an upright capsule on its side of a dome (a half sphere on the floor): inside (its middle
 * is), all of it within the shell; outside, none of it. Moves `seg` in place; true when it pushed.
 */
export function collideDome(dome: Dome, seg: Line3, radius: number): boolean {
    const { start: s, end: e } = seg
    const midX = (s.x + e.x) / 2 - dome.x
    const midY = (s.y + e.y) / 2
    const midZ = (s.z + e.z) / 2 - dome.z
    if (Math.hypot(midX, midY, midZ) < dome.radius) {
        // In: neither end's sphere may poke through. Pushed in level (never into the floor), and down only off the top.
        const limit = dome.radius - radius
        let pushed = false
        for (const end of [e, s]) {
            if (end.y > limit) {
                const down = end.y - limit
                s.y -= down
                e.y -= down
                pushed = true
            }
            const room = Math.sqrt(Math.max(0, limit * limit - end.y * end.y))
            const dx = end.x - dome.x
            const dz = end.z - dome.z
            const out = Math.hypot(dx, dz)
            if (out <= room) continue
            const k = (out - room) / out
            s.x -= dx * k
            e.x -= dx * k
            s.z -= dz * k
            e.z -= dz * k
            pushed = true
        }
        return pushed
    }
    // Out: the segment's nearest point to the dome's centre (on the floor, so its lowest end) stays a radius off the shell.
    const low = s.y <= e.y ? s : e
    const dx = low.x - dome.x
    const dz = low.z - dome.z
    const distance = Math.hypot(dx, low.y, dz)
    const limit = dome.radius + radius
    if (distance >= limit) return false
    const [nx, ny, nz] = distance > 1e-6 ? [dx / distance, low.y / distance, dz / distance] : [1, 0, 0]
    const by = limit - distance
    s.x += nx * by
    e.x += nx * by
    s.y += ny * by
    e.y += ny * by
    s.z += nz * by
    e.z += nz * by

    return true
}

/**
 * Where a ray meets a dome's shell, from either side (within `far`, above the floor), or null:
 * the distance and the shell's normal facing the ray.
 */
export function rayDome(
    dome: Dome,
    origin: Vector3,
    direction: Vector3,
    far: number
): { distance: number; normal: Vector3 } | null {
    const ox = origin.x - dome.x
    const oy = origin.y
    const oz = origin.z - dome.z
    const b = ox * direction.x + oy * direction.y + oz * direction.z
    const c = ox * ox + oy * oy + oz * oz - dome.radius * dome.radius
    const disc = b * b - c
    if (disc < 0) return null
    const root = Math.sqrt(disc)
    // From inside, where it leaves; from outside, where it enters.
    const t = c < 0 ? -b + root : -b - root
    if (t <= 0 || t >= far) return null
    const y = oy + direction.y * t
    if (y < 0) return null
    const normal = new Vector3(ox + direction.x * t, y, oz + direction.z * t).divideScalar(dome.radius)
    if (normal.dot(direction) > 0) normal.negate()

    return { distance: t, normal }
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
    /** It's Siege's dome (gone in a moment: no mark on it). */
    dome: boolean
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
            dome: false,
        }
    }
    const shell = world.dome ? rayDome(world.dome, origin, direction, best?.distance ?? far) : null
    if (shell) {
        const point = origin.clone().addScaledVector(direction, shell.distance)
        best = { distance: shell.distance, point, normal: shell.normal, surface: 'plastic', wall: null, dome: true }
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
        best = { distance: hit.distance, point: hit.point.clone(), normal, surface, wall: null, dome: false }
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
    const shell = world.dome ? rayDome(world.dome, origin, direction, nearest) : null
    if (shell) nearest = shell.distance
    const built = world.walls.count > 0 ? rayWalls(world.walls, origin, direction, nearest) : null

    return built ? { distance: built.distance, wall: built.wall } : { distance: nearest, wall: null }
}

/** How far a ray from `origin` along the unit `direction` goes before it meets a wall, glass, furniture or a built wall (capped at `far`). */
export function rayDistance(world: FpsWorld, origin: Vector3, direction: Vector3, far: number): number {
    return rayStop(world, origin, direction, far).distance
}
