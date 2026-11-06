import type { BufferGeometry, Group, Material, Mesh, Scene, Texture, WebGLRenderer } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'

/** Ceiling height (m); the floor is y = 0. */
export const H: number
/** Street level (m), two storeys below the office. */
export const GROUND: number
export function fromPlan(px: number, py: number): { x: number; z: number }

export interface TimeOfDay {
    name: string
    elev: number
    azim: number
    sun: number
    color: number
    turb: number
    ray: number
    hemi: number
}
export const TIMES: TimeOfDay[]

export interface SpawnPoint {
    name: string
    /** Feet on the floor: [x, 0, z]. */
    position: [number, number, number]
    /** Radians around +Y; 0 looks toward -Z. */
    yaw: number
}
export const SPAWN_POINTS: readonly SpawnPoint[]

/** A coarse oriented box, rotated `rotY` around +Y. */
export interface BoxCollider {
    center: [number, number, number]
    half: [number, number, number]
    rotY: number
    tag: string
}

export interface Door {
    name: string | null
    center: [number, number, number]
    width: number
    height: number
    rotY: number
    open: boolean
}

/** A triangle mesh whose geometry carries its BVH (`geometry.boundsTree`). */
export type CollisionMesh = Mesh<BufferGeometry & { boundsTree: MeshBVH }>

export interface OfficeCollision {
    solid: CollisionMesh
    glass: CollisionMesh
}

export interface OfficeMaterials {
    M: Record<string, Material>
    screenMats: Material[]
    artMats: Material[]
    texture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Texture | null
}

export interface OfficeGeometryOptions {
    materials?: OfficeMaterials
    /** false: no street or neighbourhood (nothing out there collides). */
    outside?: boolean
    /** false: no collision meshes. */
    collision?: boolean
    /** true: what each solid triangle is made of, in `collision.solid.userData.surfaces` (buildOffice does). */
    surfaces?: boolean
}

/** What a surface is made of: `collision.solid.userData.surfaces[faceIndex]` indexes this. */
export const SURFACES: readonly ['plaster', 'wood', 'desk', 'metal', 'fabric', 'plastic', 'tile', 'screen', 'plant']
export type Surface = (typeof SURFACES)[number]

export interface OfficeGeometry {
    root: Group
    interior: Group
    ceiling: Group
    outside: Group
    collision: OfficeCollision | null
    colliders: BoxCollider[]
    doors: Door[]
    spawnPoints: SpawnPoint[]
    bounds: { floorY: number; ceilingY: number; groundY: number }
    materials: Record<string, Material>
}

export function plainOfficeMaterials(): OfficeMaterials
export function createOfficeMaterials(renderer: WebGLRenderer): OfficeMaterials
export function buildOfficeGeometry(opts?: OfficeGeometryOptions): OfficeGeometry

export interface Office extends OfficeGeometry {
    sun: import('three').DirectionalLight
    setTime(i: number): void
    times: string[]
}
export function buildOffice(
    scene: Scene,
    renderer: WebGLRenderer,
    opts?: Omit<OfficeGeometryOptions, 'materials'> & { bake?: boolean }
): Office
export function makeColliderHelper(colliders: BoxCollider[]): import('three').LineSegments
