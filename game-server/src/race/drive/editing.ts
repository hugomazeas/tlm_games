import type { CourseSpec, GateSpec } from '../map/courses.ts'
import type { LatLon } from '../map/convert.ts'
import type { Course, Gate } from '../map/format.ts'
import { locate, pointAt, type Route } from './route.ts'
import type { DriveWorld } from './world.ts'

/**
 * What the Hub's track editor does to a track: drop a checkpoint across the
 * street clicked, slot it into the loop where it was clicked, point every
 * checkpoint on towards the next, and write the track out in latitude/longitude.
 * A track is a circuit: the last checkpoint always leads back to the first.
 */

/** A gate reaches this far past each kerb, so a kart hugging the edge still counts. */
const GATE_MARGIN = 2
const MAX_GATE_WIDTH = 60

/** A gate across the nearest road to x, z, facing the way along it closer to `heading`. */
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
 * Each checkpoint turned to face along its road towards the next one; the
 * last towards the first once the loop is closed, else onwards from the
 * one before it. A lone checkpoint keeps its way.
 */
export function orientGates(world: DriveWorld, gates: readonly Gate[], closed: boolean): Gate[] {
    return gates.map((gate, i) => {
        const next = gates[i + 1] ?? (closed ? gates[0] : undefined)
        const previous = gates[i - 1]
        let bearing: number
        if (next && next !== gate) bearing = Math.atan2(-(next.x - gate.x), -(next.z - gate.z))
        else if (previous) bearing = Math.atan2(-(gate.x - previous.x), -(gate.z - previous.z))
        else return gate

        return gateAcrossRoad(world, gate.x, gate.z, bearing) ?? gate
    })
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
