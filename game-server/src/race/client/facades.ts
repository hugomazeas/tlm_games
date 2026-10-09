import type { Arcade, Fins } from '../map/format.ts'

/**
 * Wall detail that windows painted on a texture can't give: concrete fins
 * standing out of the wall, a ground floor of arches set back into it, and
 * parapets round flat roofs. All real geometry, so it catches the light and
 * shifts as the camera moves.
 *
 * Fins and arches line up on a grid along each wall's line rather than from
 * its ends, so where a part's wall runs over the building's, theirs fall on
 * the same spots instead of doubling up.
 */

export type Point3 = [number, number, number]

/** Triangles, with texture coordinates when they're walls. */
export class Geometry {
    readonly positions: number[] = []
    readonly uvs: number[] = []

    /** One triangle; each corner is [x, y, z] and optionally its [u, v]. */
    triangle(corners: Point3[], uvs?: [number, number][]): void {
        for (const corner of corners) {
            this.positions.push(...corner)
        }
        // Untextured surfaces still need coordinates to share a mesh format with the walls.
        this.uvs.push(...(uvs ?? []).flat(), ...new Array(uvs ? 0 : 6).fill(0))
    }

    quad(a: Point3, b: Point3, c: Point3, d: Point3): void {
        this.triangle([a, b, c])
        this.triangle([a, c, d])
    }
}

/** One edge of a ring: where it starts, which way it runs, how long it is, and which way is out. */
export interface Edge {
    index: number
    x: number
    z: number
    ux: number
    uz: number
    length: number
    nx: number
    nz: number
}

/** A ring's edges, each with its outward normal; degenerate edges are left out. */
export function edgesOf(ring: number[], isHole = false): Edge[] {
    const count = ring.length / 2
    let area = 0
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        area += ring[i * 2]! * ring[j * 2 + 1]! - ring[j * 2]! * ring[i * 2 + 1]!
    }
    // A courtyard's outside is the building's inside.
    const side = (area > 0 ? 1 : -1) * (isHole ? -1 : 1)

    const edges: Edge[] = []
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count
        const x = ring[i * 2]!
        const z = ring[i * 2 + 1]!
        const dx = ring[j * 2]! - x
        const dz = ring[j * 2 + 1]! - z
        const length = Math.hypot(dx, dz)
        if (length < 1e-6) continue
        const ux = dx / length
        const uz = dz / length
        edges.push({ index: i, x, z, ux, uz, length, nx: uz * side, nz: -ux * side })
    }

    return edges
}

/** A point on an edge: `along` it from its start, `out` of the wall, at height `y`. */
function at(edge: Edge, along: number, out: number, y: number): Point3 {
    return [edge.x + edge.ux * along + edge.nx * out, y, edge.z + edge.uz * along + edge.nz * out]
}

/**
 * Where on an edge (metres from its start) the grid lines every `spacing`
 * metres fall, keeping `margin` clear of both ends. The grid is anchored to
 * the edge's line, not its ends, and is the same whichever way the edge runs.
 */
export function gridOnEdge(
    edge: Pick<Edge, 'x' | 'z' | 'ux' | 'uz' | 'length'>,
    spacing: number,
    margin = 0
): number[] {
    const start = edge.x * edge.ux + edge.z * edge.uz
    const first = Math.ceil((start + margin - 1e-6) / spacing)
    const positions: number[] = []
    for (let k = first; k * spacing - start <= edge.length - margin + 1e-6; k++) {
        positions.push(k * spacing - start)
    }

    return positions
}

/** A box against an edge: `along` and `out` ranges in the edge's frame, from `bottom` to `top`. */
export function addBox(
    geometry: Geometry,
    edge: Edge,
    [a0, a1]: [number, number],
    [o0, o1]: [number, number],
    bottom: number,
    top: number
): void {
    const corner = (a: number, o: number, y: number) => at(edge, a, o, y)
    const ring: [number, number][] = [
        [a0, o0],
        [a1, o0],
        [a1, o1],
        [a0, o1],
    ]
    for (let i = 0; i < 4; i++) {
        const [a, o] = ring[i]!
        const [b, p] = ring[(i + 1) % 4]!
        geometry.quad(corner(a, o, bottom), corner(b, p, bottom), corner(b, p, top), corner(a, o, top))
    }
    geometry.quad(corner(a0, o0, top), corner(a1, o0, top), corner(a1, o1, top), corner(a0, o1, top))
    geometry.quad(corner(a0, o0, bottom), corner(a1, o0, bottom), corner(a1, o1, bottom), corner(a0, o1, bottom))
}

/** Fins up every edge of a ring, from `bottom` (or the top of an arcade) to `top`. */
export function addFins(
    geometry: Geometry,
    ring: number[],
    bottom: number,
    top: number,
    fins: Fins,
    arcade?: Arcade
): void {
    for (const edge of edgesOf(ring)) {
        const start = arcade?.edges.includes(edge.index) ? Math.max(arcade.top, bottom) : bottom
        if (start >= top) continue
        for (const centre of gridOnEdge(edge, fins.spacing, fins.width / 2)) {
            addBox(geometry, edge, [centre - fins.width / 2, centre + fins.width / 2], [0, fins.depth], start, top)
        }
    }
}

/** Arch openings are drawn with this many segments. */
const ARCH_SEGMENTS = 8
/** Solid wall kept between an arch's crown and the floor above. */
const CROWN_BAND = 0.5

/**
 * The arcade's ground floor on its edges: the wall face with an arched
 * opening every `spacing` metres, each opening `depth` deep with a dark
 * back (`recess`). Leftover bits at the ends of an edge stay solid.
 */
export function addArcade(solid: Geometry, recess: Geometry, ring: number[], bottom: number, arcade: Arcade): void {
    const top = arcade.top
    const pier = Math.max(0.6, arcade.spacing * 0.2)
    const half = (arcade.spacing - pier) / 2
    const rise = Math.min(half, arcade.height * 0.4)
    const spring = top - CROWN_BAND - rise

    for (const edge of edgesOf(ring)) {
        if (!arcade.edges.includes(edge.index)) continue
        const lines = gridOnEdge(edge, arcade.spacing)
        const front = (a: number, b: number, y0: number, y1: number) =>
            solid.quad(at(edge, a, 0, y0), at(edge, b, 0, y0), at(edge, b, 0, y1), at(edge, a, 0, y1))

        if (lines.length < 2) {
            front(0, edge.length, bottom, top)
            continue
        }
        front(0, lines[0]!, bottom, top)
        front(lines.at(-1)!, edge.length, bottom, top)

        for (let k = 0; k < lines.length - 1; k++) {
            const left = lines[k]! + pier / 2
            const right = lines[k + 1]! - pier / 2
            const centre = (left + right) / 2
            // The piers either side, as wall face.
            front(lines[k]!, left, bottom, top)
            front(right, lines[k + 1]!, bottom, top)

            // The jambs, up to where the arch springs.
            for (const side of [left, right]) {
                solid.quad(
                    at(edge, side, 0, bottom),
                    at(edge, side, -arcade.depth, bottom),
                    at(edge, side, -arcade.depth, spring),
                    at(edge, side, 0, spring)
                )
            }

            // The arch: the wall above it, its underside, and the dark back of the opening.
            const arc: [number, number][] = []
            for (let s = 0; s <= ARCH_SEGMENTS; s++) {
                const angle = Math.PI - (s / ARCH_SEGMENTS) * Math.PI
                arc.push([centre + (Math.cos(angle) * (right - left)) / 2, spring + Math.sin(angle) * rise])
            }
            for (let s = 0; s < ARCH_SEGMENTS; s++) {
                const [a, ya] = arc[s]!
                const [b, yb] = arc[s + 1]!
                solid.quad(at(edge, a, 0, ya), at(edge, b, 0, yb), at(edge, b, 0, top), at(edge, a, 0, top))
                solid.quad(
                    at(edge, a, 0, ya),
                    at(edge, b, 0, yb),
                    at(edge, b, -arcade.depth, yb),
                    at(edge, a, -arcade.depth, ya)
                )
                recess.triangle([
                    at(edge, centre, -arcade.depth, bottom),
                    at(edge, a, -arcade.depth, ya),
                    at(edge, b, -arcade.depth, yb),
                ])
            }
            recess.quad(
                at(edge, left, -arcade.depth, bottom),
                at(edge, right, -arcade.depth, bottom),
                at(edge, right, -arcade.depth, spring),
                at(edge, left, -arcade.depth, spring)
            )
        }
    }
}

/** How thick a parapet's wall is. */
const PARAPET_THICKNESS = 0.4

/** A low wall round the edges of a flat roof at `roofTop`, `height` metres high. */
export function addParapet(
    geometry: Geometry,
    rings: { ring: number[]; isHole: boolean }[],
    roofTop: number,
    height: number
): void {
    const top = roofTop + height
    for (const { ring, isHole } of rings) {
        for (const edge of edgesOf(ring, isHole)) {
            const outer = (a: number) => at(edge, a, 0, top)
            const inner = (a: number) => at(edge, a, -PARAPET_THICKNESS, top)
            solid(geometry, edge, roofTop, top)
            // Inside face, and the cap; the inner face runs the full edge, which overlaps a little at corners.
            geometry.quad(
                at(edge, 0, -PARAPET_THICKNESS, roofTop),
                at(edge, edge.length, -PARAPET_THICKNESS, roofTop),
                inner(edge.length),
                inner(0)
            )
            geometry.quad(outer(0), outer(edge.length), inner(edge.length), inner(0))
        }
    }
}

/** The outside face of an edge between two heights. */
function solid(geometry: Geometry, edge: Edge, bottom: number, top: number): void {
    geometry.quad(
        at(edge, 0, 0, bottom),
        at(edge, edge.length, 0, bottom),
        at(edge, edge.length, 0, top),
        at(edge, 0, 0, top)
    )
}
