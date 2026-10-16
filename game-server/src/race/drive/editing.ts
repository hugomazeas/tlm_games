import type { CourseSpec, GateSpec } from '../map/courses.ts'
import type { LatLon } from '../map/convert.ts'
import type { Course, Gate } from '../map/format.ts'
import { locate, pointAt, type Route } from './route.ts'
import type { DriveWorld } from './world.ts'

/**
 * What the Hub's track editor does to a track: drop a checkpoint across the
 * street clicked, slot it into the loop where it was clicked, and write the
 * track out in latitude/longitude. A track is a circuit: the last checkpoint
 * always leads back to the first. Checkpoints have no direction (crossing
 * either way counts); the route between them decides the way round.
 */

/** A gate reaches this far past each kerb, so a kart hugging the edge still counts. */
const GATE_MARGIN = 2
const MAX_GATE_WIDTH = 60

/**
 * A gate across the nearest road to x, z. Its line runs square across the
 * road; which way along the road it faces (the one closer to `heading`)
 * doesn't matter for racing, and only keeps a dragged gate from flipping.
 */
export function gateAcrossRoad(world: DriveWorld, x: number, z: number, heading: number): Gate | null {
    const road = world.nearestRoad(x, z, heading)
    if (!road) return null

    return {
        x: round(road.x),
        z: round(road.z),
        dx: round(-Math.sin(road.heading), 4),
        dz: round(-Math.cos(road.heading), 4),
        width: Math.min(MAX_GATE_WIDTH, Math.round(road.width + GATE_MARGIN * 2)),
    }
}

/**
 * Where a checkpoint clicked at x, z goes in the list: right after the one
 * starting the stretch of route it was clicked on, if it's within `reach`
 * metres of the route; else at the end, carrying the loop on.
 */
export function insertionIndex(
    route: Route | null,
    gates: readonly Gate[],
    x: number,
    z: number,
    reach: number
): number {
    if (!route || gates.length < 2) return gates.length
    const along = locate(route, x, z, 0, 0)
    const { x: px, z: pz } = pointAt(route, along)
    if (Math.hypot(px - x, pz - z) > reach) return gates.length
    let leg = 0
    route.gateAlong.forEach((start, i) => {
        if (start <= along) leg = i
    })

    return leg + 1
}

/** A course as a course file, in latitude/longitude. */
export function courseFile(course: Omit<Course, 'slug'>, unproject: (point: [number, number]) => LatLon): CourseSpec {
    return {
        name: course.name,
        laps: course.laps,
        gates: course.gates.map((gate): GateSpec => {
            const { lat, lon } = unproject([gate.x, gate.z])

            return {
                lat: round(lat, 7),
                lon: round(lon, 7),
                // Only the line's orientation across the road: a gate is crossed either way.
                heading: round((Math.atan2(-gate.dx, -gate.dz) * 180) / Math.PI, 1),
                width: gate.width,
            }
        }),
    }
}

function round(value: number, decimals = 2): number {
    const scale = 10 ** decimals

    return Math.round(value * scale) / scale
}
