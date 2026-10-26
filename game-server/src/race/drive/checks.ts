import type { Course, Road } from '../map/format.ts'
import { KART_RADIUS } from './kart.ts'
import { gridSlot } from './laps.ts'
import { courseRoute, orientAlongRoute } from './route.ts'
import { closestOnSegment, type DriveWorld } from './world.ts'

/**
 * Whether a course can be raced: streets join all its gates, each gate is
 * on a road with nothing built across it, and a full grid of karts fits
 * behind the start line. The build's tests hold committed courses to this,
 * and the editor's save refuses a course that fails it.
 */

/** Karts a race takes, so every course needs that many clear grid slots. */
export const GRID_SIZE = 8
/** The middle of a gate, the carriageway, must be open; its ends may reach past the kerbs. */
const OPEN_SHARE = 0.7

/**
 * Room for a kart on the grid: not in the river, not against a building or a
 * wall, and a clear run to the start line (so not inside a building either).
 * A sidewalk or the grass will do: it drives off from there.
 */
export function gridFits(world: DriveWorld, start: { x: number; z: number }): (x: number, z: number) => boolean {
    return (x, z) =>
        world.surface(x, z) !== 'water' &&
        !blockedAt(world, x, z, KART_RADIUS * 0.8) &&
        !solidAcross(world, { x1: x, z1: z, x2: start.x, z2: start.z })
}

/** What's wrong with a course, one line each; empty when it's fine. */
export function courseProblems(course: Course, world: DriveWorld, roads: readonly Road[]): string[] {
    const problems: string[] = []
    const route = courseRoute(course, roads)
    if (!route) problems.push('no streets join all its checkpoints')
    // The grid lines up behind the start line the way the route leaves it.
    const raced = route ? orientAlongRoute(course, route) : course
    course.gates.forEach((gate, i) => {
        const label = i === 0 ? 'the start line' : `checkpoint ${i + 1}`
        if (world.surface(gate.x, gate.z) !== 'road') problems.push(`${label} isn't on a road`)
        const half = (gate.width / 2) * OPEN_SHARE
        const line = {
            x1: gate.x + gate.dz * half,
            z1: gate.z - gate.dx * half,
            x2: gate.x - gate.dz * half,
            z2: gate.z + gate.dx * half,
        }
        if (solidAcross(world, line)) problems.push(`a building stands in ${label}`)
    })
    if (course.gates.length > 0) {
        for (let slot = 0; slot < GRID_SIZE; slot++) {
            if (!gridSlot(raced, slot, gridFits(world, raced.gates[0]!)).fits) {
                problems.push(`no room on the grid for kart ${slot + 1}: move the start line further along a straight`)
                break
            }
        }
    }

    return problems
}

/** Whether something solid stands within `radius` of x, z at ground level. */
function blockedAt(world: DriveWorld, x: number, z: number, radius: number): boolean {
    const y = world.ground(x, z)

    return world.collidersNear(x, z, radius + 2).some(collider => {
        if (y + 1.5 <= collider.bottom || y >= collider.top) return false
        const [px, pz] = closestOnSegment(collider, x, z)

        return Math.hypot(px - x, pz - z) < radius + collider.radius
    })
}

/** Whether a wall or a building's edge at ground level crosses the line. */
function solidAcross(world: DriveWorld, line: { x1: number; z1: number; x2: number; z2: number }): boolean {
    const cx = (line.x1 + line.x2) / 2
    const cz = (line.z1 + line.z2) / 2
    const y = world.ground(cx, cz)
    const side = (ax: number, az: number, bx: number, bz: number, px: number, pz: number) =>
        Math.sign((bx - ax) * (pz - az) - (bz - az) * (px - ax))

    return world.collidersNear(cx, cz, Math.hypot(line.x2 - line.x1, line.z2 - line.z1)).some(collider => {
        if (y + 1.5 <= collider.bottom || y >= collider.top) return false

        return (
            side(line.x1, line.z1, line.x2, line.z2, collider.x1, collider.z1) !==
                side(line.x1, line.z1, line.x2, line.z2, collider.x2, collider.z2) &&
            side(collider.x1, collider.z1, collider.x2, collider.z2, line.x1, line.z1) !==
                side(collider.x1, collider.z1, collider.x2, collider.z2, line.x2, line.z2)
        )
    })
}
