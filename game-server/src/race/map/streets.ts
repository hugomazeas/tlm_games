import type { Props, Road, RoadKind, Sides } from './format.ts'
import { flattenTrees, type Tree } from './trees.ts'

/**
 * Street detail derived from OSM tags: how wide a road is and how many lanes
 * it has, which sides have sidewalks, where roads meet, where the zebra
 * crossings are, and where the street furniture stands.
 */

type Point = [number, number]

const LANE_WIDTH = 3.3
/** A city street without lane tags gets room for one row of parked cars too. */
const PARKING_WIDTH = 2.2
const SERVICE_WIDTH = 4.5
const PATH_WIDTH = 2.5
const SIDEWALK_WIDTH = 2
/** Lane lines and sidewalks stop this far past the edge of the widest road at a junction. */
const JUNCTION_MARGIN = 1.5
/** Furniture is set back this far from the kerb. */
const KERB_SETBACK = 1.2
/** A crossing node this close to a mapped crossing way is the same crossing. */
const SAME_CROSSING = 6
/** How far from a road a crossing node or a traffic light may be and still belong to it. */
const NEAR_ROAD = 12
/** A traffic light's mast arm stops short of reaching across a wide boulevard. */
const MAX_SIGNAL_REACH = 9
/** A stop sign guards a junction at most this far ahead. */
const STOP_REACH = 40

export function isDrivable(kind: RoadKind): boolean {
    return kind === 'major' || kind === 'street' || kind === 'service'
}

/**
 * A road's shape from its tags. Lanes and width fall back on defaults by
 * kind; a street without sidewalk tags is assumed to have both, as most city
 * streets do, unless its sidewalks are mapped on their own.
 */
export function roadProfile(kind: RoadKind, tags: Record<string, string>): Omit<Road, 'kind' | 'points'> {
    if (kind === 'path') return { width: PATH_WIDTH }
    if (kind === 'sidewalk') return { width: SIDEWALK_WIDTH }

    const oneway = ['yes', '1', 'true', '-1'].includes(tags.oneway ?? '')
    const taggedLanes = parseInt(tags.lanes ?? '', 10)
    const lanes =
        taggedLanes > 0 ? taggedLanes : kind === 'major' ? (oneway ? 2 : 4) : oneway || kind === 'service' ? 1 : 2

    const taggedWidth = parseFloat(tags.width ?? '')
    const width =
        taggedWidth > 0
            ? taggedWidth
            : kind === 'service'
              ? Math.max(SERVICE_WIDTH, lanes * LANE_WIDTH)
              : lanes * LANE_WIDTH + (kind === 'street' && !(taggedLanes > 0) ? PARKING_WIDTH : 0)

    const sidewalks = sides(tags, 'sidewalk', ['yes'], kind === 'service' ? undefined : 'both')
    const bikeLanes = sides(tags, 'cycleway', ['lane'], undefined)
    const name = tags.name?.trim()

    return {
        width,
        lanes,
        ...(oneway ? { oneway } : {}),
        ...(sidewalks ? { sidewalks } : {}),
        ...(bikeLanes ? { bikeLanes } : {}),
        ...(name ? { name } : {}),
    }
}

/**
 * Which sides have something, from OSM's `key`, `key:both`, `key:left` and
 * `key:right` tags. `present` lists the values meaning "yes, here".
 * Anything tagged but absent (`no`, `separate`…) means none drawn.
 */
function sides(
    tags: Record<string, string>,
    key: string,
    present: string[],
    fallback: Sides | undefined
): Sides | undefined {
    const main = tags[key]
    if (main === 'both' || main === 'left' || main === 'right') return main
    if (main !== undefined && present.includes(main)) return 'both'

    const both = tags[`${key}:both`]
    if (both !== undefined) return present.includes(both) ? 'both' : undefined

    const left = tags[`${key}:left`]
    const right = tags[`${key}:right`]
    const hasLeft = left !== undefined && present.includes(left)
    const hasRight = right !== undefined && present.includes(right)
    if (hasLeft && hasRight) return 'both'
    if (hasLeft) return 'left'
    if (hasRight) return 'right'
    if (main !== undefined || left !== undefined || right !== undefined) return undefined

    return fallback
}

/** A `oneway=-1` road runs against its points: flips them, and its sides with them. */
export function followTraffic(points: Point[], tags: Record<string, string>, road: Omit<Road, 'kind' | 'points'>) {
    if (tags.oneway !== '-1') return { points, road }

    const flip = (side: Sides | undefined): Sides | undefined =>
        side === 'left' ? 'right' : side === 'right' ? 'left' : side
    const sidewalks = flip(road.sidewalks)
    const bikeLanes = flip(road.bikeLanes)

    return {
        points: [...points].reverse(),
        road: { ...road, ...(sidewalks ? { sidewalks } : {}), ...(bikeLanes ? { bikeLanes } : {}) },
    }
}

/**
 * Where drivable roads meet. A point counts once for each road ending there
 * and twice for each road passing through, so two halves of one street
 * joined end to end (2) are not a junction, but a T (3) or a crossroads (4) are.
 */
export function findJunctions(roads: Road[]): number[] {
    const degree = new Map<string, { x: number; z: number; count: number; widest: number }>()

    for (const road of roads) {
        if (!isDrivable(road.kind)) continue
        const count = road.points.length / 2
        for (let i = 0; i < count; i++) {
            const x = road.points[i * 2]!
            const z = road.points[i * 2 + 1]!
            const key = `${x},${z}`
            const node = degree.get(key) ?? { x, z, count: 0, widest: 0 }
            node.count += i === 0 || i === count - 1 ? 1 : 2
            node.widest = Math.max(node.widest, road.width)
            degree.set(key, node)
        }
    }

    return [...degree.values()]
        .filter(node => node.count >= 3)
        .flatMap(node => [node.x, node.z, round(node.widest / 2 + JUNCTION_MARGIN)])
}

interface Segment {
    ax: number
    az: number
    bx: number
    bz: number
    width: number
}

export interface NearestRoad {
    distance: number
    /** The closest point on the road's centre line. */
    x: number
    z: number
    /** Unit direction of the road there. */
    dx: number
    dz: number
    width: number
}

/** Finds the nearest drivable road to a point, through a coarse grid of segments. */
export class RoadIndex {
    private readonly cells = new Map<string, Segment[]>()

    constructor(
        roads: Road[],
        private readonly cell = 50
    ) {
        for (const road of roads) {
            if (!isDrivable(road.kind)) continue
            for (let i = 0; i + 3 < road.points.length; i += 2) {
                const segment = {
                    ax: road.points[i]!,
                    az: road.points[i + 1]!,
                    bx: road.points[i + 2]!,
                    bz: road.points[i + 3]!,
                    width: road.width,
                }
                const [minCol, maxCol] = [segment.ax, segment.bx].map(v => Math.floor(v / cell)).sort((a, b) => a - b)
                const [minRow, maxRow] = [segment.az, segment.bz].map(v => Math.floor(v / cell)).sort((a, b) => a - b)
                for (let col = minCol!; col <= maxCol!; col++) {
                    for (let row = minRow!; row <= maxRow!; row++) {
                        const key = `${col},${row}`
                        const list = this.cells.get(key) ?? []
                        list.push(segment)
                        this.cells.set(key, list)
                    }
                }
            }
        }
    }

    /** The nearest road within `range` metres, or null. */
    nearest(x: number, z: number, range: number): NearestRoad | null {
        let best: NearestRoad | null = null
        const reach = Math.ceil(range / this.cell)
        const col = Math.floor(x / this.cell)
        const row = Math.floor(z / this.cell)

        for (let c = col - reach; c <= col + reach; c++) {
            for (let r = row - reach; r <= row + reach; r++) {
                for (const s of this.cells.get(`${c},${r}`) ?? []) {
                    const lx = s.bx - s.ax
                    const lz = s.bz - s.az
                    const length = Math.hypot(lx, lz)
                    if (length === 0) continue
                    const t = Math.min(Math.max(((x - s.ax) * lx + (z - s.az) * lz) / (length * length), 0), 1)
                    const px = s.ax + lx * t
                    const pz = s.az + lz * t
                    const distance = Math.hypot(x - px, z - pz)
                    if (distance <= range && (!best || distance < best.distance)) {
                        best = { distance, x: px, z: pz, dx: lx / length, dz: lz / length, width: s.width }
                    }
                }
            }
        }

        return best
    }
}

/**
 * Zebra crossings: the crossing ways mapped across a road, then crossing
 * nodes on a road that no mapped way already covers, which take the road's
 * width and run square across it.
 */
export function findCrossings(ways: Point[][], nodes: Point[], index: RoadIndex): number[] {
    const crossings: number[] = []
    const centres: Point[] = []

    for (const way of ways) {
        if (way.length < 2) continue
        const [ax, az] = way[0]!
        const [bx, bz] = way.at(-1)!
        const length = Math.hypot(bx - ax, bz - az)
        if (length < 2 || length > 40) continue
        const centre: Point = [(ax + bx) / 2, (az + bz) / 2]
        centres.push(centre)
        crossings.push(
            round(centre[0]),
            round(centre[1]),
            unit((bx - ax) / length),
            unit((bz - az) / length),
            round(length)
        )
    }

    for (const [x, z] of nodes) {
        if (centres.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < SAME_CROSSING)) continue
        const road = index.nearest(x, z, NEAR_ROAD)
        if (!road) continue
        // Across the road: its direction turned a quarter.
        crossings.push(round(road.x), round(road.z), unit(-road.dz), unit(road.dx), round(road.width))
    }

    return crossings
}

export interface FurnitureInput {
    trees: Tree[]
    benches: Point[]
    signals: Point[]
    busStops: Point[]
}

/**
 * Places the furniture. Trees standing in a carriageway (mapping slips) are
 * dropped. Traffic lights are usually mapped on the road itself, at the
 * junction: they move to the kerb, as do bus stops, both turned to face it.
 */
export function placeFurniture(input: FurnitureInput, index: RoadIndex): Props {
    const trees = input.trees.filter(({ x, z }) => {
        const road = index.nearest(x, z, 20)
        return !road || road.distance > road.width / 2 + 0.5
    })

    /** Moves each point to the kerb of its nearest road, keeping to its side (on the centre line, the right). */
    const atKerb = (points: Point[], setback: number) =>
        points.flatMap(([x, z]) => {
            const road = index.nearest(x, z, NEAR_ROAD)
            if (!road) return []
            // (-dz, dx) points to the road's right.
            const onRight = (x - road.x) * -road.dz + (z - road.z) * road.dx >= 0
            const side = road.distance < 0.5 || onRight ? 1 : -1
            const offset = road.width / 2 + setback
            return [{ x: road.x - road.dz * offset * side, z: road.z + road.dx * offset * side, road, side, offset }]
        })

    return {
        trees: flattenTrees(trees),
        benches: input.benches.flatMap(([x, z]) => [round(x), round(z)]),
        // The mast arm reaches back over the road, towards its centre line.
        signals: atKerb(input.signals, KERB_SETBACK).flatMap(({ x, z, road, side, offset }) => [
            round(x),
            round(z),
            unit(road.dz * side),
            unit(-road.dx * side),
            round(Math.min(Math.max(offset - 1, 2), MAX_SIGNAL_REACH)),
        ]),
        busStops: atKerb(input.busStops, KERB_SETBACK + 1).flatMap(({ x, z, road }) => [
            round(x),
            round(z),
            Math.round(Math.atan2(road.dz, road.dx) * 100) / 100,
        ]),
    }
}

/**
 * Stop signs. OSM puts the node on the road just before the junction it
 * guards, rarely saying which way it faces: traffic is taken to be heading
 * for the nearest junction. Signs with no junction close by are dropped.
 */
export function findStops(nodes: Point[], junctions: number[], index: RoadIndex): number[] {
    const stops: number[] = []

    for (const [x, z] of nodes) {
        const road = index.nearest(x, z, NEAR_ROAD)
        if (!road) continue

        let best: { x: number; z: number; distance: number } | null = null
        for (let i = 0; i < junctions.length; i += 3) {
            const distance = Math.hypot(junctions[i]! - road.x, junctions[i + 1]! - road.z)
            if (distance > 0.5 && distance < STOP_REACH && (!best || distance < best.distance)) {
                best = { x: junctions[i]!, z: junctions[i + 1]!, distance }
            }
        }
        if (!best) continue

        // Along the road, whichever way leads to the junction.
        const towards = (best.x - road.x) * road.dx + (best.z - road.z) * road.dz >= 0 ? 1 : -1
        stops.push(round(road.x), round(road.z), unit(road.dx * towards), unit(road.dz * towards), round(road.width))
    }

    return stops
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}

function unit(value: number): number {
    return Math.round(value * 1000) / 1000
}
