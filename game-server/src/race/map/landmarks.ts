import type { LatLon } from './convert.ts'
import type {
    Arcade,
    Bands,
    Building,
    BuildingDetail,
    BuildingPart,
    Fins,
    Look,
    Roof,
    WallMaterial,
    WindowGrid,
} from './format.ts'

/**
 * Hand-made detail for landmarks. OSM gives a footprint and maybe a height;
 * a landmark adds what makes a building recognisable: its colours, its real
 * roof, its windows, and the pavilions and towers that stand out of it. Only
 * looks: the car still collides with the plain footprint.
 *
 * Each landmark is one JSON file in maps/<map>/landmarks/, keyed by its OSM
 * element (type and id), checked against maps/landmark.schema.json by editors
 * and by `parseLandmark` here. Extra volumes are placed in metres in the
 * façade's frame: `along` the façade from its centre (towards `to` is
 * positive) and `out` from it (positive in front of the building, negative
 * into it). Positions are latitude/longitude, never map metres, so a
 * landmark survives the map's bounds changing.
 *
 * `fingerprint` records the OSM footprint the landmark was made against.
 * When a refresh moves or reshapes that footprint, the build reports the
 * landmark as stale until someone looks at it and accepts it.
 */

/** Fins as written in a landmark file; the recess defaults to a dark slot. */
export type FinsSpec = Omit<Fins, 'recess'> & { recess?: string }

/** An arcade as written in a landmark file: on the walls facing the façade's way, or on all of them. */
export type ArcadeSpec = Omit<Arcade, 'edges' | 'top'> & { faces?: 'front' | 'all' }

/** Balconies or floor slabs as written in a landmark file: the first `from` metres above the ground (a floor up by default). */
export type BandsSpec = Omit<Bands, 'first' | 'height'> & { height?: number; from?: number }

/**
 * A part takes the building's look unless it says otherwise; `false`
 * takes windows, fins or an arcade away (a plant room on the roof).
 */
export interface LookOverrides {
    wall?: string
    material?: WallMaterial
    windows?: WindowGrid | false
    glass?: string
    fins?: FinsSpec | false
    arcade?: ArcadeSpec | false
    bands?: BandsSpec | false
}

/**
 * A terraced part: cut into `count` slices across it, their heights falling
 * evenly from `height` to `to` at the side it steps `toward`.
 */
export interface Steps {
    count: number
    to: number
    toward: '+along' | '-along' | '+out' | '-out'
}

export interface LandmarkPart extends LookOverrides {
    along: number
    out: number
    /** Along the façade; a round part's diameter that way. */
    width: number
    /** Square to the façade; a round part's diameter that way. */
    depth: number
    /** A box (the default) or round: a cylinder, or an elliptical one when width and depth differ. */
    shape?: 'box' | 'round'
    steps?: Steps
    /** Metres above the ground where the part starts; 0 by default. */
    from?: number
    /** Metres above the ground where its walls stop. */
    height: number
    roof?: Roof
}

/** Where the footprint's corners average out, and how big it is, when the landmark was made. */
export interface Fingerprint {
    lat: number
    lon: number
    area: number
}

export interface Landmark {
    id: number
    osm: 'way' | 'relation'
    name: string
    notes?: string
    wall: string
    material?: WallMaterial
    windows?: WindowGrid
    glass?: string
    fins?: FinsSpec
    arcade?: ArcadeSpec
    bands?: BandsSpec
    /** Wall height above the ground, replacing OSM's guess. */
    height: number
    roof?: Roof
    facade?: { from: LatLon; to: LatLon }
    parts?: LandmarkPart[]
    fingerprint?: Fingerprint
}

/** A landmark's key: OSM numbers ways and relations separately. */
export function landmarkKey(osm: 'way' | 'relation', id: number): string {
    return `${osm}/${id}`
}

/**
 * Gives a building its landmark detail, if it has one. `project` turns
 * latitude/longitude into map metres; `ground` is the ground level the
 * landmark's heights are measured from.
 */
export function applyLandmark(
    building: Building,
    landmark: Landmark | undefined,
    project: (point: LatLon) => [number, number],
    ground: number
): Building {
    if (!landmark) return building

    const frame = landmark.facade
        ? facadeFrame(project(landmark.facade.from), project(landmark.facade.to), building.outline)
        : null
    const parts: BuildingPart[] = []
    if (frame && landmark.parts) {
        for (const part of landmark.parts.flatMap(terraces)) {
            const outline = part.shape === 'round' ? ellipse(frame, part) : rectangle(frame, part)
            parts.push({
                outline,
                base: part.from ? round(ground + part.from) : building.base,
                wallTop: round(ground + part.height),
                ...(part.roof ? { roof: part.roof } : {}),
                look: resolveLook(landmark, part.from ? { ...part, arcade: false } : part, outline, frame, ground),
            })
        }
    }

    const roofHeight = landmark.roof?.height ?? 0
    const detail: BuildingDetail = {
        ...resolveLook(landmark, {}, building.outline, frame, ground),
        wallTop: round(ground + landmark.height),
        ...(landmark.roof ? { roof: landmark.roof } : {}),
        parts,
    }

    // The landmark's roof replaces any the survey measured.
    const { roof: _, ...plain } = building

    return { ...plain, top: round(ground + landmark.height + roofHeight), detail, landmark: true }
}

/** Fins without a recess colour get this: a dark window slot. */
const RECESS = '#3b4248'
/** Balconies and floor slabs are this thick unless a landmark says otherwise. */
const BAND_HEIGHT = 0.25

/** An edge counts as facing the façade's way when it turns less than this from it. */
const FRONT_ANGLE = Math.PI / 4

/** The look of one ring: the landmark's, overridden by a part's, with the arcade on the ring's own edges. */
function resolveLook(
    landmark: Landmark,
    overrides: LookOverrides,
    ring: number[],
    frame: Frame | null,
    ground: number
): Look {
    const pick = <T>(own: T | false | undefined, inherited: T | undefined) =>
        own === false ? undefined : (own ?? inherited)
    const windows = pick(overrides.windows, landmark.windows)
    const fins = pick(overrides.fins, landmark.fins)
    const arcade = pick(overrides.arcade, landmark.arcade)
    const bands = pick(overrides.bands, landmark.bands)
    const glass = overrides.glass ?? landmark.glass

    const look: Look = { wall: overrides.wall ?? landmark.wall }
    const material = overrides.material ?? landmark.material
    if (material && material !== 'plain') look.material = material
    if (windows) look.windows = windows
    if (glass) look.glass = glass
    if (bands) {
        look.bands = {
            floor: bands.floor,
            depth: bands.depth,
            height: bands.height ?? BAND_HEIGHT,
            first: round(ground + (bands.from ?? bands.floor)),
            ...(bands.colour ? { colour: bands.colour } : {}),
        }
    }
    if (fins) look.fins = { spacing: fins.spacing, width: fins.width, depth: fins.depth, recess: fins.recess ?? RECESS }
    if (arcade) {
        const edges = facingEdges(ring, arcade.faces === 'all' || !frame ? null : frame)
        if (edges.length > 0) {
            look.arcade = {
                height: arcade.height,
                top: round(ground + arcade.height),
                depth: arcade.depth,
                spacing: arcade.spacing,
                edges,
            }
        }
    }

    return look
}

/**
 * The edges of a ring (by the index of the point each starts at) whose
 * outside faces the way the façade does, within 45°; every edge without a
 * frame.
 */
export function facingEdges(ring: number[], frame: Pick<Frame, 'nx' | 'nz'> | null): number[] {
    const count = ring.length / 2
    let area = 0
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        area += ring[i * 2]! * ring[j * 2 + 1]! - ring[j * 2]! * ring[i * 2 + 1]!
    }

    const edges: number[] = []
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        const dx = ring[j * 2]! - ring[i * 2]!
        const dz = ring[j * 2 + 1]! - ring[i * 2 + 1]!
        const length = Math.hypot(dx, dz)
        if (length < 1e-6) continue
        if (!frame) {
            edges.push(i)
            continue
        }
        // With x east and z south, a ring of positive area winds so its outside is on the left of each edge.
        const side = area > 0 ? 1 : -1
        const nx = (dz / length) * side
        const nz = (-dx / length) * side
        if (nx * frame.nx + nz * frame.nz > Math.cos(FRONT_ANGLE)) edges.push(i)
    }

    return edges
}

interface Frame {
    /** The façade's centre. */
    cx: number
    cz: number
    /** Unit vector along the façade, from `from` to `to`. */
    ux: number
    uz: number
    /** Unit vector out of the building, square to the façade. */
    nx: number
    nz: number
}

/** The façade's frame. "Out" is whichever side of it the footprint isn't on. */
export function facadeFrame(from: [number, number], to: [number, number], outline: number[]): Frame {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const ux = (to[0] - from[0]) / length
    const uz = (to[1] - from[1]) / length
    const cx = (from[0] + to[0]) / 2
    const cz = (from[1] + to[1]) / 2

    let mx = 0
    let mz = 0
    const count = outline.length / 2
    for (let i = 0; i < count; i++) {
        mx += outline[i * 2]! / count
        mz += outline[i * 2 + 1]! / count
    }

    // Of the two square directions, the one pointing away from the footprint's middle.
    let nx = -uz
    let nz = ux
    if ((mx - cx) * nx + (mz - cz) * nz > 0) {
        nx = -nx
        nz = -nz
    }

    return { cx, cz, ux, uz, nx, nz }
}

/** A terraced part as its slices, each a plain box; any other part as itself. */
export function terraces(part: LandmarkPart): LandmarkPart[] {
    if (!part.steps) return [part]

    const { count, to, toward } = part.steps
    const alongAxis = toward.endsWith('along')
    const sign = toward.startsWith('+') ? 1 : -1
    const span = alongAxis ? part.width : part.depth
    const slice = span / count
    const { steps: _, ...plain } = part

    return Array.from({ length: count }, (_, k) => {
        // Slice 0 is the tall end, opposite the way it steps.
        const offset = sign * (-span / 2 + slice * (k + 0.5))
        const height = round(part.height - ((part.height - to) * k) / (count - 1))
        return alongAxis
            ? { ...plain, along: part.along + offset, width: slice, height }
            : { ...plain, out: part.out + offset, depth: slice, height }
    })
}

/** Corners of a round part's footprint. */
const ROUND_SEGMENTS = 24

/** A round part's footprint: an ellipse in the façade's frame, as a flat [x, z, …] ring. */
export function ellipse(frame: Frame, part: Pick<LandmarkPart, 'along' | 'out' | 'width' | 'depth'>): number[] {
    return Array.from({ length: ROUND_SEGMENTS }, (_, k) => {
        const angle = (k / ROUND_SEGMENTS) * Math.PI * 2
        const along = part.along + (Math.cos(angle) * part.width) / 2
        const out = part.out + (Math.sin(angle) * part.depth) / 2
        return [
            round(frame.cx + frame.ux * along + frame.nx * out),
            round(frame.cz + frame.uz * along + frame.nz * out),
        ]
    }).flat()
}

/** A part's footprint: a rectangle in the façade's frame, as a flat [x, z, …] ring. */
export function rectangle(frame: Frame, part: Pick<LandmarkPart, 'along' | 'out' | 'width' | 'depth'>): number[] {
    const corners = [
        [-part.width / 2, -part.depth / 2],
        [part.width / 2, -part.depth / 2],
        [part.width / 2, part.depth / 2],
        [-part.width / 2, part.depth / 2],
    ]

    return corners.flatMap(([a, o]) => {
        const along = part.along + a!
        const out = part.out + o!
        return [
            round(frame.cx + frame.ux * along + frame.nx * out),
            round(frame.cz + frame.uz * along + frame.nz * out),
        ]
    })
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}

/** A footprint drifting more than this from its fingerprint makes the landmark stale. */
const STALE_DISTANCE = 5
/** …or growing or shrinking by more than this share. */
const STALE_AREA = 0.1

export function fingerprintOf(outline: number[], unproject: (point: [number, number]) => LatLon): Fingerprint {
    let x = 0
    let z = 0
    let area = 0
    const count = outline.length / 2
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        x += outline[i * 2]! / count
        z += outline[i * 2 + 1]! / count
        area += outline[i * 2]! * outline[j * 2 + 1]! - outline[j * 2]! * outline[i * 2 + 1]!
    }
    const { lat, lon } = unproject([x, z])

    return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7, area: Math.round(Math.abs(area / 2)) }
}

export type ReviewStatus = 'ok' | 'stale' | 'orphaned' | 'unstamped'

export interface Review {
    landmark: Landmark
    status: ReviewStatus
    /** What the footprint looks like now; absent when it's gone. */
    current?: Fingerprint
    reason?: string
}

/**
 * Checks every landmark against the footprints in the new data. Orphaned:
 * its OSM element is gone (deleted, or redrawn under a new id). Stale: the
 * footprint moved or changed size since the landmark was made. Unstamped:
 * it has no fingerprint yet. Each needs a person to look before it's
 * trusted again.
 */
export function reviewLandmarks(
    landmarks: Landmark[],
    footprints: Map<string, number[]>,
    unproject: (point: [number, number]) => LatLon
): Review[] {
    return landmarks.map(landmark => {
        const outline = footprints.get(landmarkKey(landmark.osm, landmark.id))
        if (!outline)
            return { landmark, status: 'orphaned', reason: `${landmark.osm} ${landmark.id} is not in the data` }

        const current = fingerprintOf(outline, unproject)
        const before = landmark.fingerprint
        if (!before) return { landmark, status: 'unstamped', current }

        const moved = distanceMetres(before, current)
        const grew = Math.abs(current.area - before.area) / Math.max(before.area, 1)
        if (moved > STALE_DISTANCE) {
            return { landmark, status: 'stale', current, reason: `footprint moved ${moved.toFixed(1)} m` }
        }
        if (grew > STALE_AREA) {
            return { landmark, status: 'stale', current, reason: `footprint area ${before.area} → ${current.area} m²` }
        }

        return { landmark, status: 'ok', current }
    })
}

function distanceMetres(a: LatLon, b: LatLon): number {
    const metresPerDegreeLat = 111_320
    const metresPerDegreeLon = metresPerDegreeLat * Math.cos((a.lat * Math.PI) / 180)

    return Math.hypot((a.lat - b.lat) * metresPerDegreeLat, (a.lon - b.lon) * metresPerDegreeLon)
}

export const LANDMARK_KEYS = [
    '$schema',
    'id',
    'osm',
    'name',
    'notes',
    'wall',
    'material',
    'windows',
    'glass',
    'fins',
    'arcade',
    'bands',
    'height',
    'roof',
    'facade',
    'parts',
    'fingerprint',
]
export const PART_KEYS = [
    'along',
    'out',
    'width',
    'depth',
    'from',
    'height',
    'roof',
    'wall',
    'material',
    'windows',
    'glass',
    'fins',
    'arcade',
    'bands',
    'shape',
    'steps',
]
export const STEPS_KEYS = ['count', 'to', 'toward']
export const ROOF_KEYS = ['shape', 'height', 'inset', 'colour', 'parapet']
export const FINS_KEYS = ['spacing', 'width', 'depth', 'recess']
export const ARCADE_KEYS = ['height', 'depth', 'spacing', 'faces']
export const WINDOWS_KEYS = ['floor', 'spacing', 'style']
export const BANDS_KEYS = ['floor', 'depth', 'height', 'from', 'colour']
export const ROOF_SHAPES = ['mansard', 'pyramid', 'flat', 'gable', 'hip']
export const WINDOW_STYLES = ['punched', 'square', 'arched', 'ribbon', 'curtain']
export const WALL_MATERIALS = ['plain', 'brick', 'stone', 'concrete', 'siding']
const COLOUR = /^#[0-9a-fA-F]{6}$/

/**
 * Checks a landmark file's contents and returns it typed, or throws listing
 * every problem. Unknown keys are errors, so a typo can't silently do nothing.
 */
export function parseLandmark(value: unknown, file: string): Landmark {
    const problems: string[] = []
    const fail = (path: string, message: string) => problems.push(`${path}: ${message}`)
    const record = (path: string, input: unknown, keys: string[]): Record<string, unknown> | null => {
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            fail(path, 'must be an object')
            return null
        }
        for (const key of Object.keys(input)) {
            if (!keys.includes(key)) fail(path, `unknown key "${key}"`)
        }
        return input as Record<string, unknown>
    }
    const number = (path: string, input: unknown, { min = -Infinity, optional = false } = {}) => {
        if (input === undefined && optional) return
        if (typeof input !== 'number' || !Number.isFinite(input)) fail(path, 'must be a number')
        else if (input < min) fail(path, `must be at least ${min}`)
    }
    const colour = (path: string, input: unknown) => {
        if (typeof input !== 'string' || !COLOUR.test(input)) fail(path, 'must be a colour like #a1b2c3')
    }
    const latLon = (path: string, input: unknown) => {
        const point = record(path, input, ['lat', 'lon'])
        if (!point) return
        number(`${path}.lat`, point.lat, { min: -90 })
        number(`${path}.lon`, point.lon, { min: -180 })
    }
    const roof = (path: string, input: unknown) => {
        if (input === undefined) return
        const r = record(path, input, ROOF_KEYS)
        if (!r) return
        if (!ROOF_SHAPES.includes(r.shape as string)) fail(`${path}.shape`, `must be ${ROOF_SHAPES.join(', ')}`)
        number(`${path}.height`, r.height, { min: 0 })
        number(`${path}.inset`, r.inset, { min: 0, optional: true })
        number(`${path}.parapet`, r.parapet, { min: 0, optional: true })
        colour(`${path}.colour`, r.colour)
    }
    const windows = (path: string, input: unknown) => {
        if (input === undefined || input === false) return
        const w = record(path, input, WINDOWS_KEYS)
        if (!w) return
        number(`${path}.floor`, w.floor, { min: 1 })
        number(`${path}.spacing`, w.spacing, { min: 0.5 })
        if (w.style !== undefined && !WINDOW_STYLES.includes(w.style as string)) {
            fail(`${path}.style`, `must be ${WINDOW_STYLES.join(', ')}`)
        }
    }
    const material = (path: string, input: unknown) => {
        if (input !== undefined && !WALL_MATERIALS.includes(input as string)) {
            fail(path, `must be ${WALL_MATERIALS.join(', ')}`)
        }
    }
    const bands = (path: string, input: unknown) => {
        if (input === undefined || input === false) return
        const b = record(path, input, BANDS_KEYS)
        if (!b) return
        number(`${path}.floor`, b.floor, { min: 1 })
        number(`${path}.depth`, b.depth, { min: 0.05 })
        number(`${path}.height`, b.height, { min: 0.05, optional: true })
        number(`${path}.from`, b.from, { min: 0, optional: true })
        if (b.colour !== undefined) colour(`${path}.colour`, b.colour)
    }
    const fins = (path: string, input: unknown) => {
        if (input === undefined || input === false) return
        const f = record(path, input, FINS_KEYS)
        if (!f) return
        number(`${path}.spacing`, f.spacing, { min: 0.5 })
        number(`${path}.width`, f.width, { min: 0.05 })
        number(`${path}.depth`, f.depth, { min: 0.05 })
        if (typeof f.width === 'number' && typeof f.spacing === 'number' && f.width >= f.spacing) {
            fail(`${path}.width`, 'must be less than `spacing`, or the fins make a solid wall')
        }
        if (f.recess !== undefined) colour(`${path}.recess`, f.recess)
    }
    const arcade = (path: string, input: unknown, hasFacade: boolean) => {
        if (input === undefined || input === false) return
        const a = record(path, input, ARCADE_KEYS)
        if (!a) return
        number(`${path}.height`, a.height, { min: 2 })
        number(`${path}.depth`, a.depth, { min: 0.5 })
        number(`${path}.spacing`, a.spacing, { min: 1.5 })
        if (a.faces !== undefined && a.faces !== 'front' && a.faces !== 'all') {
            fail(`${path}.faces`, 'must be "front" or "all"')
        }
        if (a.faces !== 'all' && !hasFacade) fail(`${path}.faces`, 'facing the front needs a facade')
    }

    const landmark = record(file, value, LANDMARK_KEYS)
    if (landmark) {
        if (!Number.isInteger(landmark.id) || (landmark.id as number) <= 0) fail('id', 'must be an OSM id')
        if (landmark.osm !== 'way' && landmark.osm !== 'relation') fail('osm', 'must be "way" or "relation"')
        if (typeof landmark.name !== 'string' || landmark.name === '') fail('name', 'must be a name')
        if (landmark.notes !== undefined && typeof landmark.notes !== 'string') fail('notes', 'must be text')
        colour('wall', landmark.wall)
        material('material', landmark.material)
        if (landmark.glass !== undefined) colour('glass', landmark.glass)
        number('height', landmark.height, { min: 1 })
        if (landmark.bands === false) fail('bands', 'leave it out instead')
        bands('bands', landmark.bands)
        if (landmark.windows === false) fail('windows', 'leave it out instead')
        windows('windows', landmark.windows)
        if (landmark.fins === false) fail('fins', 'leave it out instead')
        fins('fins', landmark.fins)
        if (landmark.arcade === false) fail('arcade', 'leave it out instead')
        arcade('arcade', landmark.arcade, landmark.facade !== undefined)
        roof('roof', landmark.roof)
        if (landmark.facade !== undefined) {
            const facade = record('facade', landmark.facade, ['from', 'to'])
            if (facade) {
                latLon('facade.from', facade.from)
                latLon('facade.to', facade.to)
            }
        }
        if (landmark.parts !== undefined) {
            if (!Array.isArray(landmark.parts)) fail('parts', 'must be a list')
            else {
                if (landmark.facade === undefined) fail('parts', 'need a facade to be placed against')
                landmark.parts.forEach((input, i) => {
                    const part = record(`parts[${i}]`, input, PART_KEYS)
                    if (!part) return
                    number(`parts[${i}].along`, part.along)
                    number(`parts[${i}].out`, part.out)
                    number(`parts[${i}].width`, part.width, { min: 0.5 })
                    number(`parts[${i}].depth`, part.depth, { min: 0.5 })
                    number(`parts[${i}].from`, part.from, { min: 0, optional: true })
                    number(`parts[${i}].height`, part.height, { min: 1 })
                    if (typeof part.from === 'number' && typeof part.height === 'number' && part.height <= part.from) {
                        fail(`parts[${i}].height`, 'must be above `from`')
                    }
                    roof(`parts[${i}].roof`, part.roof)
                    if (part.shape !== undefined && part.shape !== 'box' && part.shape !== 'round') {
                        fail(`parts[${i}].shape`, 'must be "box" or "round"')
                    }
                    if (part.steps !== undefined) {
                        const steps = record(`parts[${i}].steps`, part.steps, STEPS_KEYS)
                        if (part.shape === 'round') fail(`parts[${i}].steps`, 'a round part can’t step')
                        if (steps) {
                            if (!Number.isInteger(steps.count) || (steps.count as number) < 2) {
                                fail(`parts[${i}].steps.count`, 'must be a whole number, at least 2')
                            }
                            number(`parts[${i}].steps.to`, steps.to, { min: 1 })
                            const floor = typeof part.from === 'number' ? part.from : 0
                            if (typeof steps.to === 'number' && typeof part.height === 'number') {
                                if (steps.to >= part.height || steps.to <= floor) {
                                    fail(`parts[${i}].steps.to`, 'must be below `height` and above `from`')
                                }
                            }
                            if (!['+along', '-along', '+out', '-out'].includes(steps.toward as string)) {
                                fail(`parts[${i}].steps.toward`, 'must be +along, -along, +out or -out')
                            }
                        }
                    }
                    if (part.wall !== undefined) colour(`parts[${i}].wall`, part.wall)
                    material(`parts[${i}].material`, part.material)
                    if (part.glass !== undefined) colour(`parts[${i}].glass`, part.glass)
                    bands(`parts[${i}].bands`, part.bands)
                    windows(`parts[${i}].windows`, part.windows)
                    fins(`parts[${i}].fins`, part.fins)
                    arcade(`parts[${i}].arcade`, part.arcade, true)
                })
            }
        }
        if (landmark.fingerprint !== undefined) {
            const print = record('fingerprint', landmark.fingerprint, ['lat', 'lon', 'area'])
            if (print) {
                number('fingerprint.lat', print.lat, { min: -90 })
                number('fingerprint.lon', print.lon, { min: -180 })
                number('fingerprint.area', print.area, { min: 0 })
            }
        }
    }

    if (problems.length > 0) throw new Error(`${file} is not a valid landmark:\n  ${problems.join('\n  ')}`)

    const { $schema: _, ...typed } = value as Landmark & { $schema?: string }
    return typed
}
