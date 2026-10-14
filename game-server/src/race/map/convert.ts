import type { Area, AreaKind, Building, RaceMap, Road, RoadKind, Terrain, Wall } from './format.ts'
import { type DecorFile, expandDecor, type OsmLine, type OsmPoint, osmDecor, sortPaint } from './decor.ts'
import { applyLandmark, type Landmark, landmarkKey } from './landmarks.ts'
import { buildingMask, type LidarGrid, surveyed, surveyedShape, surveyedTrees } from './lidar.ts'
import { applyLook, type Look } from './looks.ts'
import {
    findCrossings,
    findJunctions,
    findStops,
    followTraffic,
    placeFurniture,
    RoadIndex,
    roadProfile,
} from './streets.ts'
import { attachParts, gateArch, orientedBox, type OsmPart, wallFrom } from './structures.ts'
import { blockedGround, type CityTree, cityTree, fillWoods, mergeTrees, osmTree } from './trees.ts'

/** A latitude/longitude box, as Overpass takes it. */
export interface Bounds {
    south: number
    west: number
    north: number
    east: number
}

export interface LatLon {
    lat: number
    lon: number
}

/** The subset of an Overpass `out geom` element the converter reads. Nodes carry their own position. */
export interface OsmElement {
    type: 'node' | 'way' | 'relation'
    id: number
    lat?: number
    lon?: number
    tags?: Record<string, string>
    geometry?: LatLon[]
    members?: { type: string; role: string; geometry?: LatLon[] }[]
}

/** Elevation samples on the map grid: `rows` lists of `cols` heights, the north row first. */
export type ElevationGrid = number[][]

const METRES_PER_DEGREE_LAT = 111_320
/** A floor of an office or apartment block, including the slab. */
const FLOOR_HEIGHT = 3.2
/** Room for a roof or a parapet above the top floor. */
const ROOF_ALLOWANCE = 1.5
/** Shingle and sheet-metal greys and browns for pitched roofs no one has coloured. */
const PITCHED_ROOFS = ['#5d5a57', '#6b5e55', '#4f5357', '#76695e', '#5a6060']
/** Elevation is sampled to the metre, so a height this close to sea level is the river. */
const WATER_LEVEL = 1
/** Water sits this far below its banks so the shore reads as an edge. */
const RIVERBED_DEPTH = 1.5

/**
 * Turns latitude/longitude into metres around the centre of the bounds. A
 * flat projection is plenty at the scale of a few kilometres.
 */
export function projector(bounds: Bounds): {
    origin: LatLon
    project: (point: LatLon) => [number, number]
    unproject: (point: [number, number]) => LatLon
} {
    return projectionAt({ lat: (bounds.south + bounds.north) / 2, lon: (bounds.west + bounds.east) / 2 })
}

/** The same projection, from the point at x = 0, z = 0: what a map's `origin` gives the browser. */
export function projectionAt(origin: LatLon): {
    origin: LatLon
    project: (point: LatLon) => [number, number]
    unproject: (point: [number, number]) => LatLon
} {
    const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180)

    return {
        origin,
        project: point => [
            (point.lon - origin.lon) * metresPerDegreeLon,
            -(point.lat - origin.lat) * METRES_PER_DEGREE_LAT,
        ],
        unproject: ([x, z]) => ({
            lat: origin.lat - z / METRES_PER_DEGREE_LAT,
            lon: origin.lon + x / metresPerDegreeLon,
        }),
    }
}

/**
 * Joins way segments end to end into closed rings. Multipolygon members are
 * often split into several ways; any that never close are dropped.
 */
export function stitchRings(segments: LatLon[][]): LatLon[][] {
    return stitchChains(segments).filter(chain => sameLatLon(chain[0]!, chain.at(-1)!) && chain.length >= 4)
}

/** Joins way segments that share an end into chains, open or closed, growing each from both ends. */
export function stitchChains(segments: LatLon[][]): LatLon[][] {
    const open = segments.filter(segment => segment.length > 1).map(segment => [...segment])
    const chains: LatLon[][] = []

    while (open.length > 0) {
        let chain = open.shift()!
        let grew = true

        while (!sameLatLon(chain[0]!, chain.at(-1)!) && grew) {
            grew = false
            for (let i = 0; i < open.length; i++) {
                const next = open[i]!
                const first = chain[0]!
                const last = chain.at(-1)!
                if (sameLatLon(next[0]!, last)) {
                    chain = [...chain, ...next.slice(1)]
                } else if (sameLatLon(next.at(-1)!, last)) {
                    chain = [...chain, ...next.slice(0, -1).reverse()]
                } else if (sameLatLon(next.at(-1)!, first)) {
                    chain = [...next.slice(0, -1), ...chain]
                } else if (sameLatLon(next[0]!, first)) {
                    chain = [...next.slice(1).reverse(), ...chain]
                } else {
                    continue
                }
                open.splice(i, 1)
                grew = true
                break
            }
        }

        chains.push(chain)
    }

    return chains
}

function sameLatLon(a: LatLon, b: LatLon): boolean {
    return a.lat === b.lat && a.lon === b.lon
}

/**
 * The river as a polygon inside the map, from the shoreline that crosses it.
 * The shore is closed around a box far bigger than the map, once each way
 * round; the closure that holds `sample`, a point known to be water, is the
 * river. Null when there is no shore or neither closure holds the sample.
 */
export function riverPolygon(
    shore: [number, number][],
    sample: [number, number],
    width: number,
    depth: number
): [number, number][] | null {
    if (shore.length < 2) return null

    const reach = Math.max(width, depth, ...shore.flat().map(Math.abs)) * 2
    const corners: [number, number][] = [
        [-reach, -reach],
        [reach, -reach],
        [reach, reach],
        [-reach, reach],
    ]
    const start = onBox(shore[0]!, reach)
    const end = onBox(shore.at(-1)!, reach)

    for (const direction of [1, -1]) {
        // Walk the box's perimeter (0–4, one unit per side) from the shore's end back to its start.
        const ring: [number, number][] = [...shore, end.point]
        let t = end.t
        for (let guard = 0; guard < 5; guard++) {
            const corner = direction > 0 ? Math.floor(t) + 1 : Math.ceil(t) - 1
            const remaining = direction > 0 ? (start.t - t + 4) % 4 : (t - start.t + 4) % 4
            if (Math.abs(corner - t) >= remaining) break
            ring.push(corners[(corner + 4) % 4]!)
            t = (corner + 4) % 4
        }
        ring.push(start.point)

        const clipped = clipToRect(ring, -width / 2, -depth / 2, width / 2, depth / 2)
        if (clipped.length >= 3 && containsPoint(clipped, sample)) return clipped
    }

    return null
}

/**
 * Pushes a point straight out to the nearest side of a square of half-size
 * `reach`, and says how far round its perimeter that is: 0 at the north-west
 * corner, 1 north-east, 2 south-east, 3 south-west.
 */
function onBox([x, z]: [number, number], reach: number): { point: [number, number]; t: number } {
    const toSide = [z + reach, reach - x, reach - z, x + reach]
    const side = toSide.indexOf(Math.min(...toSide))
    const along = (value: number) => (value + reach) / (2 * reach)

    switch (side) {
        case 0:
            return { point: [x, -reach], t: along(x) }
        case 1:
            return { point: [reach, z], t: 1 + along(z) }
        case 2:
            return { point: [x, reach], t: 2 + (1 - along(x)) }
        default:
            return { point: [-reach, z], t: 3 + (1 - along(z)) }
    }
}

/** Even-odd test: is the point inside the polygon? */
export function containsPoint(polygon: [number, number][], [x, z]: [number, number]): boolean {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i]!
        const [xj, zj] = polygon[j]!
        if (zi > z !== zj > z && x < xi + ((z - zi) * (xj - xi)) / (zj - zi)) inside = !inside
    }

    return inside
}

/**
 * Clips a polygon to an axis-aligned rectangle (Sutherland–Hodgman). Parks
 * and woods can run far outside the map; only the part inside is kept.
 */
export function clipToRect(
    points: [number, number][],
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number
): [number, number][] {
    const edges: {
        inside: (p: [number, number]) => boolean
        cut: (a: [number, number], b: [number, number]) => [number, number]
    }[] = [
        { inside: p => p[0] >= minX, cut: (a, b) => atX(a, b, minX) },
        { inside: p => p[0] <= maxX, cut: (a, b) => atX(a, b, maxX) },
        { inside: p => p[1] >= minZ, cut: (a, b) => atZ(a, b, minZ) },
        { inside: p => p[1] <= maxZ, cut: (a, b) => atZ(a, b, maxZ) },
    ]

    let output = points
    for (const edge of edges) {
        const input = output
        output = []
        for (let i = 0; i < input.length; i++) {
            const current = input[i]!
            const previous = input[(i + input.length - 1) % input.length]!
            if (edge.inside(current)) {
                if (!edge.inside(previous)) output.push(edge.cut(previous, current))
                output.push(current)
            } else if (edge.inside(previous)) {
                output.push(edge.cut(previous, current))
            }
        }
    }

    return output
}

function atX(a: [number, number], b: [number, number], x: number): [number, number] {
    return [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
}

function atZ(a: [number, number], b: [number, number], z: number): [number, number] {
    return [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z]
}

/**
 * How tall a building stands, in metres. OSM's `height` wins, then its floor
 * count; otherwise a guess from the kind of building, varied by id so a
 * street of untagged houses doesn't come out as one flat slab.
 */
export function buildingHeight(tags: Record<string, string>, id: number): number {
    const tagged = parseFloat(tags.height ?? '')
    if (tagged > 0) return tagged

    const levels = parseFloat(tags['building:levels'] ?? '')
    if (levels > 0) return levels * FLOOR_HEIGHT + ROOF_ALLOWANCE

    const variation = (id % 5) * 0.8
    switch (tags.building) {
        case 'garage':
        case 'garages':
        case 'shed':
        case 'roof':
            return 3 + variation / 2
        case 'house':
        case 'detached':
        case 'semidetached_house':
            return 7 + variation
        default:
            return 9 + variation
    }
}

/**
 * Ground height at a point, exactly on the terrain mesh: each grid cell is
 * two triangles split from its south-west to its north-east corner, the way
 * Three.js's PlaneGeometry splits them, so roads laid with this sit flush.
 * Outside the grid, the nearest edge.
 */
export function heightAt(terrain: Terrain, width: number, depth: number, x: number, z: number): number {
    const gx = Math.min(Math.max((x + width / 2) / terrain.cell, 0), terrain.cols - 1)
    const gz = Math.min(Math.max((z + depth / 2) / terrain.cell, 0), terrain.rows - 1)
    const x0 = Math.min(Math.floor(gx), terrain.cols - 2)
    const z0 = Math.min(Math.floor(gz), terrain.rows - 2)
    const tx = gx - x0
    const tz = gz - z0
    const at = (col: number, row: number) => terrain.heights[row * terrain.cols + col]!

    const northWest = at(x0, z0)
    const northEast = at(x0 + 1, z0)
    const southWest = at(x0, z0 + 1)
    const southEast = at(x0 + 1, z0 + 1)

    if (tx + tz <= 1) return northWest + (northEast - northWest) * tx + (southWest - northWest) * tz

    return southEast + (southWest - southEast) * (1 - tx) + (northEast - southEast) * (1 - tz)
}

/**
 * Elevation comes in whole metres, which shows up as terraces on gentle
 * slopes. A 3×3 average smooths them while keeping the cliff a cliff; the
 * river (near sea level, or wherever `isRiver` says) is pinned flat below its banks.
 */
export function smoothTerrain(
    grid: ElevationGrid,
    cell: number,
    isRiver: (row: number, col: number) => boolean = () => false
): Terrain {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    const heights: number[] = []
    const water = (row: number, col: number) => grid[row]![col]! <= WATER_LEVEL || isRiver(row, col)

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (water(row, col)) {
                heights.push(-RIVERBED_DEPTH)
                continue
            }

            let sum = 0
            let count = 0
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const sample = grid[row + dz]?.[col + dx]
                    if (sample === undefined || water(row + dz, col + dx)) continue
                    sum += sample
                    count++
                }
            }
            heights.push(round(sum / count))
        }
    }

    return { cols, rows, cell, heights, waterLevel: 0 }
}

/** Which kind of road a `highway` tag is, or null for things we don't draw (steps, corridors, planned roads). */
export function roadKind(highway: string): RoadKind | null {
    switch (highway) {
        case 'motorway':
        case 'trunk':
        case 'primary':
        case 'secondary':
        case 'motorway_link':
        case 'trunk_link':
        case 'primary_link':
        case 'secondary_link':
            return 'major'
        case 'tertiary':
        case 'tertiary_link':
        case 'residential':
        case 'unclassified':
        case 'living_street':
            return 'street'
        case 'service':
            return 'service'
        case 'footway':
        case 'path':
        case 'pedestrian':
        case 'cycleway':
            return 'path'
        default:
            return null
    }
}

export function areaKind(tags: Record<string, string>): AreaKind | null {
    if (tags.natural === 'water') return 'water'
    if (tags.natural === 'wood' || tags.landuse === 'forest') return 'wood'
    if (tags.amenity === 'parking') return 'parking'
    if (
        ['park', 'pitch', 'garden', 'golf_course'].includes(tags.leisure ?? '') ||
        ['grass', 'recreation_ground', 'cemetery', 'meadow'].includes(tags.landuse ?? '') ||
        ['scrub', 'grassland'].includes(tags.natural ?? '')
    ) {
        return 'park'
    }

    return null
}

/** The outer rings and holes of a closed way or a multipolygon relation. */
function polygonsOf(element: OsmElement): { outer: LatLon[]; holes: LatLon[][] }[] {
    if (element.type === 'way') {
        const ring = element.geometry ?? []
        return ring.length >= 4 ? [{ outer: ring, holes: [] }] : []
    }

    const members = element.members ?? []
    const outers = stitchRings(members.filter(m => m.role !== 'inner').map(m => m.geometry ?? []))
    const inners = stitchRings(members.filter(m => m.role === 'inner').map(m => m.geometry ?? []))

    // A hole belongs to the outer ring that contains its first point.
    return outers.map(outer => ({
        outer,
        holes: inners.filter(inner => containsLatLon(outer, inner[0]!)),
    }))
}

function containsLatLon(ring: LatLon[], point: LatLon): boolean {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!
        const b = ring[j]!
        if (a.lat > point.lat !== b.lat > point.lat) {
            const lon = a.lon + ((point.lat - a.lat) * (b.lon - a.lon)) / (b.lat - a.lat)
            if (point.lon < lon) inside = !inside
        }
    }

    return inside
}

/** Coordinates are kept to the decimetre: plenty for a game, and a third the size. */
function round(value: number): number {
    return Math.round(value * 10) / 10
}

/** A closed ring as a flat [x, z, …] list, without the repeated closing point. */
function flatRing(points: [number, number][]): number[] {
    const open = points.length > 1 && samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points
    return open.flatMap(([x, z]) => [round(x), round(z)])
}

function samePoint(a: [number, number], b: [number, number]): boolean {
    return a[0] === b[0] && a[1] === b[1]
}

/** A river whose surface the elevation model can't tell from its shore: the shoreline ways, and one point of water. */
export interface RiverInput {
    shore: LatLon[][]
    sample: LatLon
}

export interface MapExtras {
    river?: RiverInput
    /** Point features: trees, crossings, traffic lights, bus stops and benches. */
    nodes?: OsmElement[]
    /** The city's tree inventory: species and trunk sizes (see trees.ts). */
    cityTrees?: CityTree[]
    /** Heights above the ground from the lidar survey: buildings' heights and tree crowns (see lidar.ts). */
    lidar?: LidarGrid | null
    /** Hand-made detail for some buildings (see landmarks.ts). */
    landmarks?: Landmark[]
    /** Hand-made fountains, statues, gardens and the like (see decor.ts). */
    decor?: DecorFile[]
    /** Ordinary buildings' real colours and windows, by OSM key (see looks.ts). */
    looks?: Record<string, Look>
}

/** Assembles the map from raw OSM elements and an elevation grid sampled over the same bounds. */
export function convertMap(
    name: string,
    bounds: Bounds,
    elements: OsmElement[],
    elevation: ElevationGrid,
    cell: number,
    { river, nodes = [], cityTrees = [], lidar = null, landmarks = [], decor = [], looks = {} }: MapExtras = {}
): RaceMap {
    const landmarksByKey = new Map(landmarks.map(landmark => [landmarkKey(landmark.osm, landmark.id), landmark]))
    const { origin, project } = projector(bounds)
    const [west, north] = project({ lat: bounds.north, lon: bounds.west })
    const [east, south] = project({ lat: bounds.south, lon: bounds.east })
    const width = round(east - west)
    const depth = round(south - north)

    const shore = river ? (stitchChains(river.shore).sort((a, b) => b.length - a.length)[0] ?? []) : []
    const riverArea = river ? riverPolygon(shore.map(project), project(river.sample), width, depth) : null
    // The grid can overrun the map by a fraction of a cell; edge samples are tested just inside it.
    const clamp = (value: number, half: number) => Math.min(Math.max(value, -half + 0.01), half - 0.01)
    const terrain = smoothTerrain(
        elevation,
        cell,
        (row, col) =>
            riverArea !== null &&
            containsPoint(riverArea, [
                clamp(-width / 2 + col * cell, width / 2),
                clamp(-depth / 2 + row * cell, depth / 2),
            ])
    )
    const ground = (x: number, z: number) => heightAt(terrain, width, depth, x, z)
    const inside = ([x, z]: [number, number]) => Math.abs(x) <= width / 2 && Math.abs(z) <= depth / 2

    const buildings: Building[] = []
    const roads: Road[] = []
    const areas: Area[] = riverArea ? [{ kind: 'water', outline: flatRing(riverArea) }] : []
    const crossingWays: [number, number][][] = []
    const walls: Wall[] = []
    const gates: { building: Building; groundLevel: number }[] = []
    const parts: OsmPart[] = []
    const replaced = new Set(decor.flatMap(file => file.replaces ?? []))
    const decorLines: OsmLine[] = []

    for (const element of elements) {
        const tags = element.tags ?? {}

        if (tags['building:part'] && tags['building:part'] !== 'no') {
            for (const polygon of polygonsOf(element)) {
                const outer = polygon.outer.map(project)
                parts.push({ outline: flatRing(outer), tags, ground: Math.max(...outer.map(([x, z]) => ground(x, z))) })
            }
            continue
        }

        if (tags.barrier === 'city_wall' && element.type === 'way') {
            const points = (element.geometry ?? []).map(project)
            if (points.some(inside))
                walls.push(
                    wallFrom(
                        tags,
                        points.flatMap(([x, z]) => [round(x), round(z)])
                    )
                )
            continue
        }

        if (tags.building && tags.building !== 'no') {
            for (const polygon of polygonsOf(element)) {
                const outer = polygon.outer.map(project)
                const centre = outer.reduce(
                    (sum, p) => [sum[0] + p[0] / outer.length, sum[1] + p[1] / outer.length],
                    [0, 0]
                )
                if (!inside(centre as [number, number])) continue

                // Sat on the lowest corner and rising from the highest, so a building on a slope never floats;
                // measured by the lidar survey, its roof is that high above the ground under it.
                const grounds = outer.map(([x, z]) => ground(x, z))
                const holes = polygon.holes.map(hole => flatRing(hole.map(project)))
                const outline = flatRing(outer)
                const measured = lidar ? surveyedShape(lidar, width, depth, outline, holes, orientedBox(outline)) : null
                const level = grounds.reduce((sum, y) => sum + y, 0) / grounds.length
                const roofRise = measured?.roof?.height ?? 0
                const building: Building = {
                    id: element.id,
                    ...(element.type === 'relation' ? { relation: true } : {}),
                    ...(tags.name ? { name: tags.name } : {}),
                    base: round(Math.min(...grounds) - 1),
                    top: round(
                        measured
                            ? Math.max(level + measured.walls, Math.min(...grounds) + 2) + roofRise
                            : Math.max(...grounds) + buildingHeight(tags, element.id)
                    ),
                    outline,
                    ...(holes.length > 0 ? { holes } : {}),
                    ...(measured?.roof
                        ? {
                              roof: {
                                  ...measured.roof,
                                  colour: PITCHED_ROOFS[element.id % PITCHED_ROOFS.length]!,
                              },
                          }
                        : {}),
                }
                // Gates wait for the roads, to know which one runs through them.
                if (tags.historic === 'city_gate') gates.push({ building, groundLevel: Math.max(...grounds) })
                else {
                    const key = landmarkKey(element.type === 'relation' ? 'relation' : 'way', element.id)
                    buildings.push(applyLandmark(building, landmarksByKey.get(key), project, Math.max(...grounds)))
                }
            }
            continue
        }

        if (tags.highway && element.type === 'way') {
            const projected = (element.geometry ?? []).map(project)
            if (!projected.some(inside) || tags.tunnel === 'yes' || tags.area === 'yes') continue
            if (tags.footway === 'crossing') {
                crossingWays.push(projected)
                continue
            }

            const kind = tags.footway === 'sidewalk' ? 'sidewalk' : roadKind(tags.highway)
            if (!kind) continue
            const { points, road } = followTraffic(projected, tags, roadProfile(kind, tags))
            roads.push({ kind, ...road, points: points.flatMap(([x, z]) => [round(x), round(z)]) })
            continue
        }

        if (
            element.type === 'way' &&
            (tags.barrier === 'hedge' ||
                tags.natural === 'tree_row' ||
                tags.landuse === 'flowerbed' ||
                tags.amenity === 'fountain')
        ) {
            const key = `way/${element.id}`
            const points = (element.geometry ?? []).map(project)
            if (!replaced.has(key) && points.some(inside)) decorLines.push({ key, tags, points })
            continue
        }

        const kind = areaKind(tags)
        if (kind) {
            for (const polygon of polygonsOf(element)) {
                const clipped = clipToRect(polygon.outer.map(project), -width / 2, -depth / 2, width / 2, depth / 2)
                if (clipped.length >= 3) areas.push({ kind, outline: flatRing(clipped) })
            }
        }
    }

    // Big areas first, so a pitch inside a park is painted over the park.
    areas.sort((a, b) => Math.abs(ringArea(b.outline)) - Math.abs(ringArea(a.outline)))

    const index = new RoadIndex(roads)
    for (const { building, groundLevel } of gates) {
        const [cx, cz] = ringCentre(building.outline)
        const road = index.nearest(cx, cz, 15)
        buildings.push(...(road ? gateArch(building, road, groundLevel) : [{ ...building, colour: '#b3aa98' }]))
    }
    const junctions = findJunctions(roads)
    const pointsTagged = (match: (tags: Record<string, string>) => boolean) =>
        nodes
            .filter(node => node.lat !== undefined && node.lon !== undefined && match(node.tags ?? {}))
            .map(node => project({ lat: node.lat!, lon: node.lon! }))
            .filter(inside)
    const crossings = findCrossings(
        crossingWays,
        pointsTagged(tags => tags.highway === 'crossing'),
        index
    )
    const listed = cityTrees.flatMap(tree => {
        const [x, z] = project(tree)
        return inside([x, z]) ? [cityTree(tree, x, z)] : []
    })
    const mapped = nodes.flatMap(node => {
        if (node.lat === undefined || node.lon === undefined || node.tags?.natural !== 'tree') return []
        const [x, z] = project({ lat: node.lat, lon: node.lon })
        return inside([x, z]) ? [osmTree(node.tags, x, z)] : []
    })
    const decorPoints: OsmPoint[] = nodes.flatMap(node => {
        const key = `node/${node.id}`
        if (node.lat === undefined || node.lon === undefined || replaced.has(key)) return []
        const at = project({ lat: node.lat, lon: node.lon })
        return inside(at) ? [{ key, tags: node.tags ?? {}, at }] : []
    })
    const fromOsm = osmDecor(decorPoints, decorLines, ground, (x, z) => {
        const road = index.nearest(x, z, 80)
        return road ? (Math.atan2(road.x - x, -(road.z - z)) * 180) / Math.PI : null
    })
    const handMade = expandDecor(
        decor.flatMap(file => file.items),
        project,
        ground
    )
    // Where the lidar survey reaches, its crowns are the trees: the city's keep their species and take
    // the measured size, OSM's (placed by eye) give way. Elsewhere the city's and OSM's stand as mapped.
    const guessed = [...mapped, ...fromOsm.trees]
    const inSurvey = (tree: { x: number; z: number }) => lidar !== null && surveyed(lidar, width, depth, tree.x, tree.z)
    const measuredTrees = lidar
        ? surveyedTrees(
              lidar,
              width,
              depth,
              buildingMask(
                  lidar,
                  width,
                  depth,
                  buildings.map(building => building.outline),
                  (x, z) => ground(x, z) <= terrain.waterLevel + 0.5
              ),
              listed
          )
        : listed
    const standing = [
        ...mergeTrees(
            measuredTrees,
            guessed.filter(tree => !inSurvey(tree))
        ),
        ...handMade.trees,
    ]
    const blocked = blockedGround(
        width,
        depth,
        roads,
        [...buildings.map(building => building.outline), ...areas.filter(a => a.kind === 'water').map(a => a.outline)],
        (x, z) => ground(x, z) <= terrain.waterLevel + 0.5
    )
    const props = placeFurniture(
        {
            trees: [...standing, ...fillWoods(areas, (x, z) => blocked(x, z) || inSurvey({ x, z }), standing)],
            benches: [...pointsTagged(tags => tags.amenity === 'bench'), ...fromOsm.benches, ...handMade.benches],
            signals: pointsTagged(tags => tags.highway === 'traffic_signals'),
            busStops: pointsTagged(tags => tags.highway === 'bus_stop'),
        },
        index
    )

    return {
        name,
        attribution:
            '© OpenStreetMap contributors, elevation © Natural Resources Canada (CDEM), trees © Ville de Québec (CC BY 4.0)',
        origin,
        width,
        depth,
        terrain,
        // Looks colour buildings once their OSM parts are on them.
        buildings: attachParts(buildings, parts).map(building =>
            applyLook(building, looks[landmarkKey(building.relation ? 'relation' : 'way', building.id)])
        ),
        roads,
        areas,
        junctions,
        crossings,
        stops: findStops(
            pointsTagged(tags => tags.highway === 'stop'),
            junctions,
            index
        ),
        walls,
        props,
        decor: {
            shapes: [...fromOsm.shapes, ...handMade.shapes],
            paint: sortPaint([...fromOsm.paint, ...handMade.paint]),
        },
    }
}

function ringCentre(flat: number[]): [number, number] {
    let x = 0
    let z = 0
    const count = flat.length / 2
    for (let i = 0; i < count; i++) {
        x += flat[i * 2]! / count
        z += flat[i * 2 + 1]! / count
    }

    return [x, z]
}

/** Signed area of a flat [x, z, …] ring (shoelace formula). */
export function ringArea(flat: number[]): number {
    let area = 0
    const count = flat.length / 2
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        area += flat[i * 2]! * flat[j * 2 + 1]! - flat[j * 2]! * flat[i * 2 + 1]!
    }

    return area / 2
}
