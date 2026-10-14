import type { Building, BuildingDetail, Roof, Wall } from './format.ts'
import type { NearestRoad } from './streets.ts'

/**
 * Things that aren't plain buildings: fortification walls, city gates the
 * road passes through, and buildings mapped in parts (towers, wings) with
 * their own heights and roofs, like the Château Frontenac.
 */

type Point = [number, number]

const WALL_HEIGHT = 6
/** OSM draws a rampart as a line; this is how thick it's built. */
const WALL_THICKNESS = 3
const STONE = '#b3aa98'
/** Headroom under a city gate's arch. */
const ARCH_CLEARANCE = 5.5
/** Stone above the arch. */
const ARCH_LINTEL = 3.5
/** A gate's pillars are at least this thick, even if its footprint is just the road's width. */
const MIN_PILLAR = 1.5
const FLOOR_HEIGHT = 3.2
const PART_WALL = '#cfc6b6'
const ROOF_COLOUR = '#8b9a96'

export function wallFrom(tags: Record<string, string>, points: number[]): Wall {
    const height = parseFloat(tags.height ?? '')
    const thickness = parseFloat(tags.width ?? '')

    return {
        ...(tags.name ? { name: tags.name } : {}),
        points,
        height: height > 0 ? height : WALL_HEIGHT,
        thickness: thickness > 0 ? thickness : WALL_THICKNESS,
    }
}

/**
 * A city gate the road runs through: two stone pillars either side of the
 * carriageway and a lintel over it, standing on the road. OSM maps the gate
 * as a solid footprint, which would stop every car dead.
 */
export function gateArch(gate: Building, road: NearestRoad, groundLevel: number): Building[] {
    const across = (p: Point) => (p[0] - road.x) * -road.dz + (p[1] - road.z) * road.dx
    const along = (p: Point) => (p[0] - road.x) * road.dx + (p[1] - road.z) * road.dz
    const corners = pairs(gate.outline)
    const alongMin = Math.min(...corners.map(along))
    const alongMax = Math.max(...corners.map(along))
    const half = road.width / 2 + 0.3
    const left = Math.min(...corners.map(across), -half - MIN_PILLAR)
    const right = Math.max(...corners.map(across), half + MIN_PILLAR)

    const rectangle = (from: number, to: number) =>
        [
            [alongMin, from],
            [alongMax, from],
            [alongMax, to],
            [alongMin, to],
        ].flatMap(([a, b]) => [
            round(road.x + road.dx * a! - road.dz * b!),
            round(road.z + road.dz * a! + road.dx * b!),
        ])

    const top = round(Math.max(gate.top, groundLevel + ARCH_CLEARANCE + ARCH_LINTEL))
    const stone = { id: gate.id, top, colour: STONE }

    return [
        { ...stone, base: gate.base, outline: rectangle(left, -half) },
        { ...stone, base: gate.base, outline: rectangle(half, right) },
        {
            ...stone,
            ...(gate.name ? { name: gate.name } : {}),
            base: round(groundLevel + ARCH_CLEARANCE),
            outline: rectangle(left, right),
        },
    ]
}

/**
 * A roof from OSM's `roof:*` tags, or none for a flat or untagged one.
 * Pointed shapes become pyramids, gabled ones gables, hipped ones hips; the
 * rest that slope all round (mansard, gambrel, round…) mansards. Without
 * `roof:height`, the height follows the footprint's size.
 */
export function roofFromTags(tags: Record<string, string>, area: number): Roof | undefined {
    const shape = tags['roof:shape'] ?? ''
    const tagged = parseFloat(tags['roof:height'] ?? '')
    const colour = tags['roof:colour'] ?? ROOF_COLOUR
    const size = Math.sqrt(Math.max(area, 1))
    const sloped = tagged > 0 ? tagged : clamp(size * 0.3, 2, 8)

    if (['pyramidal', 'dome', 'cone', 'onion'].includes(shape)) {
        return { shape: 'pyramid', height: tagged > 0 ? tagged : clamp(size * 0.9, 2, 16), colour }
    }
    if (['gabled', 'saltbox'].includes(shape)) return { shape: 'gable', height: sloped, colour }
    if (['hipped', 'half-hipped'].includes(shape)) return { shape: 'hip', height: sloped, colour }
    if (['mansard', 'gambrel', 'round'].includes(shape))
        return { shape: 'mansard', height: sloped, inset: sloped * 0.7, colour }

    return undefined
}

/** How a `building:part` stands, from its tags: from `min_height` (or its lowest level) up to `height` (or its levels). */
export function partHeights(tags: Record<string, string>): { from: number; to: number } {
    const minHeight = parseFloat(tags.min_height ?? '')
    const minLevel = parseFloat(tags['building:min_level'] ?? '')
    const height = parseFloat(tags.height ?? '')
    const levels = parseFloat(tags['building:levels'] ?? '')

    const from = minHeight > 0 ? minHeight : minLevel > 0 ? minLevel * FLOOR_HEIGHT : 0
    const to = height > 0 ? height : levels > 0 ? levels * FLOOR_HEIGHT : from + FLOOR_HEIGHT * 3

    return { from, to: Math.max(to, from + 1) }
}

export interface OsmPart {
    outline: number[]
    tags: Record<string, string>
    /** The ground under the part's highest corner. */
    ground: number
}

/**
 * Hangs each part on the building it stands in (the one whose footprint
 * holds its middle). A building with parts gets detail if it had none, so
 * it's drawn with its parts rising out of it in the same walls. A landmark
 * that places its own parts replaces OSM's: they'd describe the same volumes.
 */
export function attachParts(buildings: Building[], parts: OsmPart[]): Building[] {
    const byId = new Map<Building, OsmPart[]>()
    for (const part of parts) {
        const middle = centroid(part.outline)
        const owner = buildings.find(building => !building.colour && containsPoint(building.outline, middle))
        if (!owner) continue
        byId.set(owner, [...(byId.get(owner) ?? []), part])
    }

    return buildings.map(building => {
        const own = byId.get(building)
        if (!own) return building
        if (building.landmark && building.detail && building.detail.parts.length > 0) return building

        const detail: BuildingDetail = building.detail ?? {
            wall: PART_WALL,
            windows: { floor: 3.4, spacing: 3 },
            wallTop: building.top,
            roof: { shape: 'flat', height: 0, colour: ROOF_COLOUR },
            parts: [],
        }
        const added = own.map(part => {
            const { from, to } = partHeights(part.tags)
            const roof = roofFromTags(part.tags, Math.abs(ringArea(part.outline)))
            return {
                outline: part.outline,
                base: from > 0 ? round(part.ground + from) : building.base,
                wallTop: round(part.ground + to),
                roof: roof ?? { shape: 'flat' as const, height: 0, colour: ROOF_COLOUR },
            }
        })
        const top = Math.max(building.top, ...added.map(part => part.wallTop + (part.roof.height ?? 0)))

        return { ...building, top: round(top), detail: { ...detail, parts: [...detail.parts, ...added] } }
    })
}

/** The smallest rectangle round a ring, lined up with one of its edges: centre, long axis and half sizes. */
export function orientedBox(ring: number[]): {
    cx: number
    cz: number
    ux: number
    uz: number
    halfLong: number
    halfShort: number
} {
    const count = ring.length / 2
    let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, halfLong: 0, halfShort: 0 }
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        const dx = ring[j * 2]! - ring[i * 2]!
        const dz = ring[j * 2 + 1]! - ring[i * 2 + 1]!
        const length = Math.hypot(dx, dz)
        if (length < 1e-6) continue
        const ux = dx / length
        const uz = dz / length
        let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
        for (let k = 0; k < count; k++) {
            const x = ring[k * 2]!
            const z = ring[k * 2 + 1]!
            const u = x * ux + z * uz
            const v = -x * uz + z * ux
            minU = Math.min(minU, u)
            maxU = Math.max(maxU, u)
            minV = Math.min(minV, v)
            maxV = Math.max(maxV, v)
        }
        const area = (maxU - minU) * (maxV - minV)
        if (area >= best.area) continue
        const mu = (minU + maxU) / 2
        const mv = (minV + maxV) / 2
        const cx = mu * ux - mv * uz
        const cz = mu * uz + mv * ux
        const along = (maxU - minU) / 2
        const across = (maxV - minV) / 2
        // The long axis: along the edge if it's the longer side, else square to it.
        best =
            along >= across
                ? { area, cx, cz, ux, uz, halfLong: along, halfShort: across }
                : { area, cx, cz, ux: -uz, uz: ux, halfLong: across, halfShort: along }
    }

    return best
}

function pairs(flat: number[]): Point[] {
    const points: Point[] = []
    for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i]!, flat[i + 1]!])

    return points
}

function centroid(flat: number[]): Point {
    const points = pairs(flat)
    return [
        points.reduce((sum, p) => sum + p[0], 0) / points.length,
        points.reduce((sum, p) => sum + p[1], 0) / points.length,
    ]
}

function containsPoint(flat: number[], [x, z]: Point): boolean {
    const points = pairs(flat)
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, zi] = points[i]!
        const [xj, zj] = points[j]!
        if (zi > z !== zj > z && x < xi + ((z - zi) * (xj - xi)) / (zj - zi)) inside = !inside
    }

    return inside
}

function ringArea(flat: number[]): number {
    let area = 0
    const count = flat.length / 2
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        area += flat[i * 2]! * flat[j * 2 + 1]! - flat[j * 2]! * flat[i * 2 + 1]!
    }

    return area / 2
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}
