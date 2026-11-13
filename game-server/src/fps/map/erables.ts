import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MeshBVH } from 'three-mesh-bvh'
import {
    BASKETBALL_HOOP,
    BIN,
    BBQ,
    BOAT,
    BUNGALOW,
    CAR,
    CARPORT,
    CLOTHESLINE,
    COMPOST_BIN,
    EXCAVATOR,
    FB,
    FENCE,
    FIRE_PIT,
    GARAGE,
    GRAVEL_PILE,
    HEDGE,
    HOARDING,
    HOCKEY_NET,
    HYDRANT,
    JERSEY_BARRIER,
    LEAF_BAG,
    LEAF_PILE,
    LIGHT_TOWER,
    MAILBOXES,
    PATIO_SET,
    PERGOLA,
    PIPE_STACK,
    place,
    POOL,
    PORTA_POTTY,
    PUMPKIN,
    RAISED_BED,
    ROAD_CLOSED_SIGN,
    RV,
    S1F,
    S2F0,
    S2F2,
    SHED,
    SHRUB,
    SITE_FENCE,
    SPLIT_LEVEL,
    STONE_PALLET,
    STREET_SIGN,
    SWING_SET,
    TEMPO,
    TRAFFIC_CONE,
    TRAMPOLINE,
    TREE,
    UTILITY_POLE,
    WOODPILE,
} from '../assets/library.ts'
import type { Movement } from '../sim/movement.ts'
import { type MapPlaces, PICKUP_WEIGHTS, type PickupSpot, type SiegeSpot, SPOT_SIDE, type Zone } from '../sim/places.ts'
import {
    Builder,
    ERABLES_MATERIALS,
    type ErablesMaterial,
    type ErablesMaterials,
    type TreeSpot,
} from './erables-kit.ts'
import { type CollisionMesh, type OfficeCollision, type SpawnPoint, type Surface, SURFACES } from './office.js'

/**
 * Rue des Érables: a short suburban street in Québec in October. A brick bungalow with its
 * detached garage and a Tempo shelter on the north side, a split-level with a carport on the
 * south, the street between them (a stalled car, a parked minivan and pickup, leaf bags, a
 * street-hockey net), the backyards behind (a closed pool, a deck, trampolines, a boat, an RV,
 * woodpiles) and the road closed for works at both ends, where the spawns are. Every object is an
 * asset from the FPS asset library (`../assets/`), placed here; the map itself is the ground, the
 * street's paving, the wires and its bounds.
 *
 * Built in real metres for people 1.8 m tall, then shrunk as a whole to the minis' size
 * (ERABLES_SCALE): a mini stands as tall next to these houses as a person would, and every
 * size in the game (walls, guns, pickups, the troopers) stays as it is. Movement on this map
 * is scaled to match (ERABLES_MOVEMENT): lengths, speeds and gravity alike, so a fall or a jump
 * takes the time it would at full size.
 *
 * Three lanes from spawn to spawn: the north yards (pool, deck, garage, woodpiles), the street,
 * the south yards (boat, patio, trampoline, RV); both houses can be walked through, and the
 * split-level's upstairs window and the carport roof (its terrace) look over the street.
 */

/** The map is built in real metres and shrunk by this (a 1.8 m person to a 40 cm mini). */
export const ERABLES_SCALE = 0.4 / 1.8
const S = ERABLES_SCALE

/** The lawns' height over the street (the curbs). */
export const LAWN = 0.15
/** The playable area's half sizes and the lid (real m): invisible walls there. */
export const BOUNDS = { x: 27, z: 27, lid: 12 } as const

/**
 * How bodies move here: a person's pace (4.6 m/s walking, a 55 cm jump), the trampolines' throw
 * onto the carport and garage roofs, a rocket's shove at a person's scale; no jetpack, no dodge.
 * All shrunk by the map's scale, gravity too.
 */
export const ERABLES_MOVEMENT: Movement = {
    walk: 4.6 * S,
    crawl: 1.3 * S,
    jump: Math.sqrt(2 * 9.8 * 0.55) * S,
    gravity: -9.8 * S,
    jetpack: false,
    dodge: false,
    padLaunch: Math.sqrt(2 * 9.8 * 5.0) * S,
    knockback: S,
    moving: 2.8 * S,
}

/** Real metres to the map's (the minis') metres. */
const at = (x: number, z: number) => ({ x: x * S, z: z * S })

/** Where the pickups lie (on the floor they're on: the houses' floors are raised). */
export const ERABLES_PICKUPS: readonly PickupSpot[] = [
    { ...at(-6.4, -14.3), y: FB * S, room: 'the bungalow kitchen' },
    { ...at(-12.9, -16.9), y: FB * S, room: 'the bungalow bedroom' },
    { ...at(4.6, -14.2), y: S2F0 * S, room: 'the garage' },
    { ...at(-5.4, -21.4), y: FB * S, room: 'the deck' },
    { ...at(-19.2, -13.0), y: LAWN * S, room: 'the north-west yard' },
    { ...at(13.0, -17.0), y: LAWN * S, room: "the neighbours' garden", roomy: true },
    { ...at(-7.5, 16.3), y: S1F * S, room: 'the split-level kitchen' },
    { ...at(-8.6, 11.6), y: S1F * S, room: 'the split-level living room' },
    { ...at(14.5, 23.5), y: LAWN * S, room: 'the south-east yard', roomy: true },
    { ...at(-19.0, 19.0), y: LAWN * S, room: 'the south-west yard', roomy: true },
    { ...at(-2.6, -1.8), room: 'the street', roomy: true },
    { ...at(-4.5, 22.2), y: LAWN * S, room: 'the patio', roomy: true },
]

/** No jetpack here, so no jetpack extender. */
export const ERABLES_PICKUP_WEIGHTS = { ...PICKUP_WEIGHTS, jetpack: 0 }

/** The two trampolines: jump pads (one onto the carport's roof, one onto the garage's). */
export const TRAMPOLINES = [
    { x: 10.3, z: 19.9, r: 1.5 },
    { x: 2.8, z: -21.0, r: 1.2 },
] as const

const ZONE_R = 3.6 * S
export const ERABLES_ZONES: readonly Zone[] = [
    { name: 'The street', ...at(3.0, 0), radius: ZONE_R },
    { name: 'The bungalow', ...at(-6.4, -15.0), radius: ZONE_R },
    { name: 'The carport', ...at(5.8, 13.4), radius: ZONE_R },
    { name: 'The pool', ...at(-8.6, -22.4), radius: ZONE_R },
]

const WEST_DOME = at(-24.2, 0)
const EAST_DOME = at(24.2, 0)
export const ERABLES_SIEGE_SPOTS: readonly SiegeSpot[] = [
    { name: 'The garage', ...at(3.25, -15.5), y: S2F0 * S, half: SPOT_SIDE / 2, dome: WEST_DOME },
    { name: 'The bungalow', ...at(-6.4, -15.0), y: FB * S, half: SPOT_SIDE / 2, dome: EAST_DOME },
    { name: 'The carport', ...at(5.8, 13.4), y: (LAWN + 0.03) * S, half: SPOT_SIDE / 2, dome: WEST_DOME },
    { name: 'The street', ...at(-2.0, 0), half: SPOT_SIDE / 2, dome: EAST_DOME },
]

export const ERABLES_PLACES: MapPlaces = {
    pickups: ERABLES_PICKUPS,
    pickupWeights: ERABLES_PICKUP_WEIGHTS,
    pads: TRAMPOLINES.map(t => at(t.x, t.z)),
    portals: [
        { ...at(-24.5, -19.0), out: [1, 0], room: 'the north-west yard' },
        { ...at(24.0, 20.0), out: [-1, 0], room: 'the south-east yard' },
    ],
    zones: ERABLES_ZONES,
    zoneHeight: 6 * S,
    siegeSpots: ERABLES_SIEGE_SPOTS,
    move: ERABLES_MOVEMENT,
    unit: 1 / S,
}

/** Facing the middle of the street from (x, z). */
const facing = (x: number, z: number) => Math.atan2(x, z)
const spawn = (name: string, x: number, y: number, z: number): SpawnPoint => ({
    name,
    position: [x * S, y * S, z * S],
    yaw: facing(x, z),
})

/**
 * Behind the site hoardings at each end of the street, and in the backyards behind the houses, the
 * garage, the sheds and the tall cedars: none in sight of the street, the upstairs window, the
 * terrace or the houses' front windows (`erables.test.ts` checks), so nobody is shot as they appear.
 */
export const ERABLES_SPAWNS: readonly SpawnPoint[] = [
    spawn('west road works', -24.5, 0, -3.0),
    spawn('west road works', -24.0, 0, -0.8),
    spawn('east road works', 24.0, 0, 1.0),
    spawn('east road works', 24.5, 0, 3.5),
    spawn('north-west yard', -20.0, LAWN, -24.0),
    spawn('behind the deck', -9.5, LAWN, -26.0),
    spawn('behind the garage', 1.0, LAWN, -24.5),
    spawn('behind the garage, east', 5.5, LAWN, -26.0),
    spawn('behind the split-level', -12.5, LAWN, 24.5),
    spawn('the patio', -6.5, LAWN, 24.5),
    spawn('behind the den', -1.2, LAWN, 20.5),
    spawn('behind the cabanon', 25.6, LAWN, 24.5),
]

/** Where the street's strong positions see from (real metres, eyes): spawns must be out of their sight. */
export const VANTAGE_POINTS: ReadonlyArray<{ name: string; at: [number, number, number] }> = [
    { name: 'the upstairs window', at: [-0.5, S2F2 + 1.53, 9.6] },
    { name: 'the terrace, front', at: [6.0, S2F2 + 1.55, 9.2] },
    { name: 'the terrace, side', at: [8.3, S2F2 + 1.55, 12] },
    { name: 'the garage roof', at: [3.2, 3.1 + 1.53, -12.3] },
    { name: 'the bungalow window', at: [-13.5, FB + 1.53, -10.9] },
    { name: 'the split-level window', at: [-11.3, S1F + 1.53, 9.4] },
    ...[-18, -14, -8, 0, 8, 14, 18].map(x => ({
        name: `the street at ${x} m`,
        at: [x, 1.53, x % 4 === 0 ? 0 : 2] as [number, number, number],
    })),
]

/** What each material is, for what flies off a shot (the office's SURFACES). */
const SURFACE_OF: Partial<Record<ErablesMaterial, Surface>> = {
    grass: 'plant',
    soil: 'plant',
    mulch: 'plant',
    hedge: 'plant',
    hay: 'plant',
    bark: 'wood',
    deck: 'wood',
    cedar: 'wood',
    wood: 'wood',
    trim: 'wood',
    doorWood: 'wood',
    doorRed: 'wood',
    doorGreen: 'wood',
    cabinetWood: 'wood',
    floorOak: 'wood',
    firewood: 'wood',
    sidingCream: 'plastic',
    sidingSage: 'plastic',
    sidingGrey: 'plastic',
    garageDoor: 'metal',
    binBlue: 'plastic',
    binBrown: 'plastic',
    binGrey: 'plastic',
    cone: 'plastic',
    tarp: 'plastic',
    poolWall: 'metal',
    poolCover: 'plastic',
    canvas: 'fabric',
    leafBag: 'fabric',
    net: 'fabric',
    steel: 'metal',
    chrome: 'metal',
    metalDark: 'metal',
    machine: 'metal',
    paintRed: 'metal',
    paintBlue: 'metal',
    paintSilver: 'metal',
    paintWhite: 'metal',
    paintGreen: 'metal',
    signBlue: 'metal',
    signRed: 'metal',
    signRoad: 'metal',
    rubber: 'plastic',
    carpet: 'fabric',
    sofa: 'fabric',
    sofaGreen: 'fabric',
    bedding: 'fabric',
    floorTile: 'tile',
    counter: 'tile',
    cabinetWhite: 'desk',
    carGlass: 'screen',
    tintedGlass: 'screen',
    screen: 'screen',
    lamp: 'screen',
}

/** The server's materials: plain, one per name (the browser paints its own). */
export function plainErablesMaterials(): ErablesMaterials {
    return Object.fromEntries(
        ERABLES_MATERIALS.map(name => [name, new MeshBasicMaterial()])
    ) as unknown as ErablesMaterials
}

export interface ErablesGeometry {
    /** Shrunk to the minis' size: holds `drawn` (real metres inside) and the collision-only solids (hidden). */
    root: Group
    drawn: Group
    collision: OfficeCollision | null
    spawnPoints: SpawnPoint[]
    trees: TreeSpot[]
    piles: Array<{ x: number; y: number; z: number; r: number }>
    blinkers: Builder['blinkers']
}

export function buildErablesGeometry(
    opts: { materials?: ErablesMaterials; collision?: boolean; surfaces?: boolean } = {}
): ErablesGeometry {
    const b = new Builder(opts.materials ?? plainErablesMaterials())
    ground(b)
    street(b)
    houses(b)
    northYards(b)
    southYards(b)
    roadWorks(b)
    bounds(b)

    const root = new Group()
    root.name = 'rue-des-erables'
    root.scale.setScalar(S)
    b.solidOnly.visible = false
    root.add(b.drawn, b.solidOnly)
    root.updateMatrixWorld(true)

    return {
        root,
        drawn: b.drawn,
        collision: opts.collision === false ? null : collisionOf(b, opts.surfaces ?? false),
        spawnPoints: ERABLES_SPAWNS.map(s => ({ ...s, position: [...s.position] as [number, number, number] })),
        trees: b.trees,
        piles: b.piles,
        blinkers: b.blinkers,
    }
}

/** Every solid triangle (shrunk), with its BVH, and what each is made of; the glass mesh is empty (glass is drawn only). */
function collisionOf(b: Builder, surfaces: boolean): OfficeCollision {
    const parts: BufferGeometry[] = []
    const kinds: number[] = []
    const skipped = (o: { parent: unknown; userData: Record<string, unknown> }): boolean => {
        for (let p: any = o; p; p = p.parent) if (p.userData?.noCollide) return true
        return false
    }
    const plaster = SURFACES.indexOf('plaster')
    for (const group of [b.drawn, b.solidOnly]) {
        group.traverse(o => {
            if (!('isMesh' in o) || !o.isMesh || skipped(o)) return
            const mesh = o as unknown as {
                geometry: BufferGeometry
                matrixWorld: import('three').Matrix4
                userData: { mat?: ErablesMaterial }
            }
            const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
            const g = new BufferGeometry()
            g.setAttribute('position', source.attributes.position!.clone())
            g.applyMatrix4(mesh.matrixWorld)
            parts.push(g)
            if (surfaces) {
                const mat = mesh.userData.mat
                const kind = mat ? SURFACES.indexOf(SURFACE_OF[mat] ?? 'plaster') : plaster
                for (let t = 0; t < g.attributes.position!.count / 3; t++) kinds.push(kind)
            }
        })
    }
    const solidGeometry = mergeGeometries(parts) as BufferGeometry & { boundsTree: MeshBVH }
    solidGeometry.boundsTree = new MeshBVH(solidGeometry)
    const solid = collisionMesh(solidGeometry)
    if (surfaces) {
        // The BVH reorders the triangles (an index over the original, unshared vertices): find each one's.
        const index = solidGeometry.index!
        const ordered = new Uint8Array(index.count / 3)
        for (let t = 0; t < ordered.length; t++) ordered[t] = kinds[Math.floor(index.getX(t * 3) / 3)] ?? plaster
        solid.userData.surfaces = ordered
    }
    // Glass is drawn only (you see and shoot through windows): an empty stand-in far below, for the world's shape.
    const glassGeometry = new BufferGeometry() as BufferGeometry & { boundsTree: MeshBVH }
    glassGeometry.setAttribute('position', new Float32BufferAttribute([0, -500, 0, 0.01, -500, 0, 0, -500, 0.01], 3))
    glassGeometry.boundsTree = new MeshBVH(glassGeometry)
    return { solid, glass: collisionMesh(glassGeometry) }
}

function collisionMesh(geometry: BufferGeometry & { boundsTree: MeshBVH }): CollisionMesh {
    return new Mesh(geometry) as unknown as CollisionMesh
}

/** A hedge filling the box x0..x1, z0..z1 (its length along the longer side). */
function hedgeBox(b: Builder, x0: number, z0: number, x1: number, z1: number, height: number): void {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0)
    const [length, depth] = alongX ? [Math.abs(x1 - x0), Math.abs(z1 - z0)] : [Math.abs(z1 - z0), Math.abs(x1 - x0)]
    place(
        b,
        HEDGE,
        { length, depth, height },
        { x: (x0 + x1) / 2, y: LAWN, z: (z0 + z1) / 2, ry: alongX ? 0 : Math.PI / 2 }
    )
}

/** A fence from (x0, z0) to (x1, z1). */
function fenceLine(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
    const length = Math.hypot(x1 - x0, z1 - z0)
    place(b, FENCE, { length }, { x: (x0 + x1) / 2, y: LAWN, z: (z0 + z1) / 2, ry: -Math.atan2(z1 - z0, x1 - x0) })
}

/** A tree on the lawn at x, z. */
function tree(
    b: Builder,
    x: number,
    z: number,
    height: number,
    crown: number,
    kind: TreeSpot['kind'],
    tint: TreeSpot['tint']
): void {
    place(b, TREE, { kind, tint, height, crown }, { x, y: LAWN, z })
}

// --- The ground ------------------------------------------------------------------------------

function ground(b: Builder): void {
    // Lawns either side, the sidewalk on the north side (its curb included), the curb on the south.
    b.box('grass', -BOUNDS.x, -0.3, -BOUNDS.z, BOUNDS.x, LAWN, -6.25, { cast: false })
    b.box('sidewalk', -BOUNDS.x, -0.3, -6.25, BOUNDS.x, LAWN + 0.01, -4.5, { cast: false })
    b.box('concrete', -BOUNDS.x, -0.3, 4.5, BOUNDS.x, LAWN, 4.75, { cast: false })
    b.box('grass', -BOUNDS.x, -0.3, 4.75, BOUNDS.x, LAWN, BOUNDS.z, { cast: false })
    // Driveways, walks, the carport's slab and the split-level's patio.
    b.box('driveway', 0.6, LAWN, -12, 6.0, LAWN + 0.012, -6.25, { cast: false })
    b.box('driveway', 3.6, LAWN, 4.75, 8.3, LAWN + 0.012, 8.6, { cast: false })
    b.box('concrete', 3.0, LAWN, 8.6, 8.6, LAWN + 0.03, 18.6, { cast: false })
    b.box('sidewalk', -8.7, LAWN, -7.8, -7.2, LAWN + 0.012, -6.25, { cast: false })
    b.box('sidewalk', -7.7, LAWN, 4.75, -6.2, LAWN + 0.012, 6.4, { cast: false })
    b.box('sidewalk', -13.0, LAWN, 19.0, -7.0, LAWN + 0.012, 23.6, { cast: false })
    b.box('sidewalk', -2.45, LAWN, -11.7, -1.7, LAWN + 0.012, -10.4, { cast: false })
    // Flower beds along the houses' fronts, mulched, shrubs and pumpkins in them.
    b.box('mulch', -16.8, LAWN, -10.5, -9.5, LAWN + 0.03, -9.6, { cast: false })
    b.box('mulch', -6.4, LAWN, -10.5, -3.2, LAWN + 0.03, -9.6, { cast: false })
    b.box('mulch', -13.8, LAWN, 8.1, -8.4, LAWN + 0.03, 9.0, { cast: false })
    for (const x of [-16.2, -14.8, -10.2, -5.6, -4.0]) place(b, SHRUB, { radius: 0.42 }, { x, y: LAWN, z: -10.05 })
    for (const x of [-13.2, -11.6, -10.0, -8.9]) place(b, SHRUB, { radius: 0.4 }, { x, y: LAWN, z: 8.55 })
    for (const [x, z] of [
        [-15.5, -9.9],
        [-11.0, -9.85],
        [-12.6, 8.4],
        [-9.4, 8.35],
    ] as const)
        place(b, PUMPKIN, { radius: 0.13 }, { x, y: LAWN + 0.03, z })
}

// --- The street --------------------------------------------------------------------------------

function street(b: Builder): void {
    b.box('asphalt', -BOUNDS.x, -0.3, -4.5, BOUNDS.x, 0, 4.5, { cast: false })
    // Gutters, manholes and storm drains.
    b.box('concrete', -BOUNDS.x, -0.29, -4.5, BOUNDS.x, 0.004, -4.2, { cast: false })
    b.box('concrete', -BOUNDS.x, -0.29, 4.2, BOUNDS.x, 0.004, 4.5, { cast: false })
    for (const [x, z] of [
        [-9, 0.6],
        [12, -0.8],
    ] as const)
        b.cyl('metalDark', 0.36, 0.36, 0.012, x, 0, z, 18, { collide: false, cast: false })
    for (const [x, z] of [
        [-3, -4.35],
        [8, 4.35],
        [-16, 4.35],
        [19, -4.35],
    ] as const)
        b.box('metalDark', x - 0.35, 0, z - 0.15, x + 0.35, 0.008, z + 0.15, { collide: false, cast: false })

    // Parked along the curbs: a minivan on the north side, a pickup on the south; stalled in the middle, hazards on.
    place(b, CAR, { kind: 'minivan', paint: 'paintSilver' }, { x: -12.5, z: -3.25, ry: Math.PI / 2 })
    place(b, CAR, { kind: 'pickup', paint: 'paintRed' }, { x: 11.5, z: 3.3, ry: -Math.PI / 2 })
    place(b, CAR, { kind: 'sedan', paint: 'paintGreen', hazards: true }, { x: 3.0, z: -0.2, ry: 0.25 + Math.PI / 2 })
    place(b, HOCKEY_NET, {}, { x: -6.5, z: 1.5, ry: -Math.PI / 2 })

    // Bins out at the curbs (it's Tuesday), the leaves bagged and raked into the gutter.
    for (const [kind, x, z, ry, y] of [
        ['recycling', -10.6, -5.55, 0, LAWN + 0.01],
        ['compost', -11.4, -5.55, 0.1, LAWN + 0.01],
        ['garbage', -12.2, -5.5, -0.05, LAWN + 0.01],
        ['recycling', 2.4, 5.4, Math.PI, LAWN],
        ['compost', 1.6, 5.45, Math.PI + 0.15, LAWN],
    ] as const)
        place(b, BIN, { kind }, { x, y, z, ry })
    for (const [x, z, ry, y] of [
        [-2.2, -5.3, 0.1, LAWN + 0.01],
        [-1.7, -5.45, -0.3, LAWN + 0.01],
        [-1.2, -5.25, 0.4, LAWN + 0.01],
        [-1.8, -5.0, 1.2, LAWN + 0.01],
        [-4.5, 5.4, 0.2, LAWN],
        [-4.0, 5.55, -0.2, LAWN],
        [-3.4, 5.35, 0.5, LAWN],
        [14.3, 5.4, 0, LAWN],
        [14.9, 5.55, 0.6, LAWN],
    ] as const)
        place(b, LEAF_BAG, {}, { x, y, z, ry })
    place(b, LEAF_PILE, { radius: 1.0 }, { x: -5.5, z: -3.7 })
    place(b, LEAF_PILE, { radius: 1.1 }, { x: 6.2, z: 3.8 })

    // Utility poles on the north side, wires between them and to the houses, street lights over the road.
    const poles = [-45, -14.5, 11, 40]
    for (const x of poles) place(b, UTILITY_POLE, {}, { x, y: LAWN, z: -6.6 })
    const tops = poles.map(x => new Vector3(x, LAWN + 9.75, -6.6))
    for (let i = 0; i + 1 < tops.length; i++) {
        for (const dx of [-0.9, 0, 0.9]) {
            b.wire(tops[i]!.clone().setX(tops[i]!.x + dx), tops[i + 1]!.clone().setX(tops[i + 1]!.x + dx), 0.7)
        }
    }
    b.wire(new Vector3(-14.5, 9.2, -6.6), new Vector3(-12.0, 3.4, -10.6), 0.3)
    b.wire(new Vector3(-14.5, 9.2, -6.6), new Vector3(1.2, 4.6, 9.1), 0.9)
    b.wire(new Vector3(11, 9.2, -6.6), new Vector3(3.2, 2.7, -12.1), 0.4)

    // A fire hydrant, the street's sign and a stop sign at the end, the community mailboxes.
    place(b, HYDRANT, {}, { x: -4.0, y: LAWN, z: -6.75 })
    place(b, STREET_SIGN, { sign: 'name' }, { x: -19.4, y: LAWN, z: 5.4, ry: Math.PI })
    place(b, STREET_SIGN, { sign: 'stop' }, { x: 19.4, y: LAWN, z: -7.0 })
    place(b, MAILBOXES, {}, { x: 21.5, y: LAWN, z: -7.0 })
}

// --- The houses ---------------------------------------------------------------------------------

function houses(b: Builder): void {
    place(b, BUNGALOW, {}, { x: -10, z: -15 })
    place(b, GARAGE, {}, { x: 3.25, z: -15.5 })
    place(b, TEMPO, {}, { x: 3.3, y: LAWN, z: -9.3 })
    place(b, CAR, { kind: 'sedan', paint: 'paintBlue' }, { x: 3.3, y: LAWN + 0.012, z: -9.4 })
    place(b, SPLIT_LEVEL, {}, { x: -5.5, z: 14 })
    place(b, CARPORT, {}, { x: 5.8, z: 13.6 })
    place(b, CAR, { kind: 'hatch', paint: 'paintWhite' }, { x: 5.8, y: LAWN + 0.03, z: 14.5, ry: Math.PI })
}

// --- North: the bungalow's backyard, the neighbours' garden ---------------------------------

function northYards(b: Builder): void {
    place(b, POOL, { radius: 2.4 }, { x: -13.2, y: LAWN, z: -23.8 })
    place(b, SHED, { siding: 'sidingSage', width: 3.2, depth: 3.4 }, { x: -23.5, y: LAWN, z: -25.0, ry: Math.PI / 2 })
    fenceLine(b, -27, -26.95, 27, -26.95)
    fenceLine(b, -26.95, -26.95, -26.95, -7)
    fenceLine(b, 26.95, -26.95, 26.95, -7)
    place(b, TRAMPOLINE, { radius: TRAMPOLINES[1].r }, { x: TRAMPOLINES[1].x, y: LAWN, z: TRAMPOLINES[1].z })
    // The hedge between the lots, with a way through in the middle and at the front.
    hedgeBox(b, 8.2, -26.9, 9.0, -20.5, 2.6)
    hedgeBox(b, 8.2, -16.5, 9.0, -9.0, 2.2)
    place(b, FIRE_PIT, {}, { x: -22.0, y: LAWN, z: -15.0 })
    place(b, STONE_PALLET, {}, { x: -19.5, y: LAWN, z: -17.2 })
    // The neighbours: a pergola with a picnic table, woodpiles, raised beds, a swing set, the compost.
    place(b, PERGOLA, {}, { x: 18, y: LAWN, z: -14 })
    place(b, WOODPILE, { length: 5 }, { x: 14.5, y: LAWN, z: -24.6 })
    place(b, WOODPILE, { length: 4 }, { x: 23.2, y: LAWN, z: -19.0, ry: Math.PI / 2 })
    for (const x of [20.8, 24.3]) place(b, RAISED_BED, { crop: 'plants' }, { x, y: LAWN, z: -25.2 })
    place(b, SWING_SET, {}, { x: 12.6, y: LAWN, z: -12.4 })
    place(b, COMPOST_BIN, {}, { x: 11.0, y: LAWN, z: -25.6 })
    tree(b, -12.5, -8.2, 10, 3.8, 'maple', 'orange')
    tree(b, 14.0, -9.0, 11, 4.2, 'maple', 'red')
    tree(b, -20.0, -21.0, 12, 4.4, 'oak', 'rust')
    tree(b, 24.0, -11.0, 9, 2.6, 'birch', 'yellow')
    tree(b, -22.5, -9.5, 9, 3.4, 'maple', 'yellow')
    tree(b, -5.0, -25.6, 8, 2.5, 'cedar', 'green')
    for (const [x, z, r] of [
        [-16.0, -7.8, 1.2],
        [11.5, -8.4, 1.4],
        [19.0, -9.2, 1.0],
    ] as const)
        place(b, LEAF_PILE, { radius: r }, { x, y: LAWN, z })
    for (const [x, z, ry] of [
        [-14.3, -7.4, 0.3],
        [-13.8, -7.1, -0.4],
        [10.0, -7.6, 0.1],
    ] as const)
        place(b, LEAF_BAG, {}, { x, y: LAWN, z, ry })
}

// --- South: the boat, the patio, the trampoline, the RV -----------------------------------------

function southYards(b: Builder): void {
    fenceLine(b, -27, 26.95, 27, 26.95)
    fenceLine(b, -26.95, 7, -26.95, 26.95)
    fenceLine(b, 26.95, 7, 26.95, 26.95)
    place(b, BOAT, {}, { x: -20.5, z: 12.5, ry: Math.PI })
    place(b, SHED, { siding: 'sidingGrey', width: 3.5, depth: 3.8 }, { x: -23.75, y: LAWN, z: 23.9, ry: Math.PI })
    place(b, CLOTHESLINE, { length: 8 }, { x: -20, y: LAWN, z: 17 })
    place(b, RAISED_BED, { crop: 'pumpkins' }, { x: -20.7, y: LAWN, z: 21.5 })
    place(b, RAISED_BED, { crop: 'soil' }, { x: -18.3, y: LAWN, z: 21.5 })
    // The patio: the barbecue and a table set; a fire pit behind the den.
    place(b, BBQ, {}, { x: -8.0, y: LAWN, z: 20.8 })
    place(b, PATIO_SET, { finish: 'metalDark', size: 1.0, chairs: 3 }, { x: -11.8, y: LAWN, z: 22.4 })
    place(b, FIRE_PIT, {}, { x: -1.0, y: LAWN, z: 23.6 })
    place(b, TRAMPOLINE, { radius: TRAMPOLINES[0].r }, { x: TRAMPOLINES[0].x, y: LAWN, z: TRAMPOLINES[0].z })
    place(b, RV, {}, { x: 17.5, z: 13.5 })
    place(b, SHED, { siding: 'sidingCream', width: 3.4, depth: 3.2 }, { x: 22.8, y: LAWN, z: 23.9, ry: -Math.PI / 2 })
    place(b, WOODPILE, { length: 3.5 }, { x: 25.8, y: LAWN, z: 15.5, ry: Math.PI / 2 })
    hedgeBox(b, 9.0, 23.0, 9.8, 26.9, 2.0)
    place(b, BASKETBALL_HOOP, {}, { x: 9.0, y: LAWN, z: 5.4, ry: Math.PI })
    tree(b, 14.0, 8.0, 11, 4.4, 'maple', 'red')
    tree(b, 2.0, 24.6, 13, 4.6, 'oak', 'rust')
    tree(b, -23.0, 7.5, 10, 3.6, 'maple', 'orange')
    tree(b, 20.4, 9.8, 9, 2.6, 'birch', 'yellow')
    tree(b, -14.0, 25.6, 8, 2.4, 'cedar', 'green')
    for (const [x, z, r] of [
        [16.5, 7.2, 1.3],
        [-22.0, 9.2, 1.0],
        [4.0, 22.5, 1.2],
    ] as const)
        place(b, LEAF_PILE, { radius: r }, { x, y: LAWN, z })
}

// --- The road works at both ends --------------------------------------------------------------

function roadWorks(b: Builder): void {
    for (const end of [-1, 1]) {
        const x = end * 19.4
        // The closure: two barriers across with a gap, a third in front of the gap; cones; signs.
        place(b, JERSEY_BARRIER, {}, { x, z: end < 0 ? -3.0 : -2.6 })
        place(b, JERSEY_BARRIER, {}, { x, z: end < 0 ? 2.6 : 3.0 })
        place(b, JERSEY_BARRIER, {}, { x: end * 17.2, z: end < 0 ? -0.1 : 0.2 })
        place(b, ROAD_CLOSED_SIGN, { height: 0.82 }, { x, z: end < 0 ? -3.0 : 3.0, ry: Math.PI / 2 })
        for (const [dx, z] of [
            [1.4, -3.6],
            [1.2, -1.6],
            [1.3, 1.4],
            [1.5, 3.5],
            [-1.0, 4.1],
            [-2.6, -4.0],
        ] as const)
            place(b, TRAFFIC_CONE, {}, { x: x + end * dx, z })
        // The site fence across the street at the edge (where the invisible wall is).
        place(b, SITE_FENCE, { length: 9 }, { x: end * 26.8, ry: Math.PI / 2 })
        // The plywood hoarding, 2.4 m: the spawns behind it can't be seen from the street, the
        // upstairs window or the terrace. One way round it, by a curb.
        const [z0, z1] = end < 0 ? [-6.25, 1.8] : [-1.8, 6.25]
        place(b, HOARDING, { length: z1 - z0 }, { x: end * 21.2, z: (z0 + z1) / 2, ry: Math.PI / 2 })
        place(
            b,
            ROAD_CLOSED_SIGN,
            { height: 1.0 },
            { x: end * 21.2 - end * 0.065, z: end < 0 ? -2 : 2, ry: (-end * Math.PI) / 2 }
        )
    }
    // Their yards closed off from the street by cedar hedges (a way through by each house).
    hedgeBox(b, -26.95, -7.4, -19.5, -6.6, 2.4)
    hedgeBox(b, -26.95, 6.2, -19.0, 7.0, 2.4)
    hedgeBox(b, 19.5, -8.4, 26.95, -7.6, 2.4)
    hedgeBox(b, 19.0, 6.2, 26.95, 7.0, 2.4)
    // The neighbours' garden behind a tall row of cedars (they grow them high here), open at its ends.
    hedgeBox(b, 10.2, -10.4, 18.6, -9.6, 3.6)
    // Past the site fences (out of reach): a mini excavator, a gravel pile, pipes, a toilet, a light tower.
    place(b, EXCAVATOR, {}, { x: -30.5, z: -2.0, ry: 0.3 })
    place(b, GRAVEL_PILE, { radius: 1.7 }, { x: -31.0, z: 2.6 })
    place(b, PIPE_STACK, {}, { x: 30.1, z: -2.6 })
    place(b, PORTA_POTTY, {}, { x: 29.6, z: 3.0 })
    place(b, LIGHT_TOWER, {}, { x: 31.4, z: 2.6 })
}

/** The invisible walls round the playable area, and the lid. */
function bounds(b: Builder): void {
    const { x, z, lid } = BOUNDS
    b.solid(new BoxGeometry(1, lid + 2, 2 * z + 2), { x: -x - 0.5, y: lid / 2 - 1 })
    b.solid(new BoxGeometry(1, lid + 2, 2 * z + 2), { x: x + 0.5, y: lid / 2 - 1 })
    b.solid(new BoxGeometry(2 * x + 2, lid + 2, 1), { z: -z - 0.5, y: lid / 2 - 1 })
    b.solid(new BoxGeometry(2 * x + 2, lid + 2, 1), { z: z + 0.5, y: lid / 2 - 1 })
    b.solid(new BoxGeometry(2 * x + 2, 1, 2 * z + 2), { y: lid + 0.5 })
}
