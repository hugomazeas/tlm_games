import { Vector3 } from 'three'
import type { WallAxis, WallSpec } from '../protocol.ts'
import { BUILD, halfExtent, type Wall } from './walls.ts'
import { type FpsWorld, rayHit } from './world.ts'

/**
 * Build mode's aim: where the next wall goes. Your browser works it out to draw the ghost and
 * sends it; the server only checks it's in reach and free.
 *
 * Aimed at a built wall, the new one locks on to it: on the edge nearest the crosshair, either in
 * line with it (wider, taller) or turned a quarter on your side of it (a corner, a roof), so
 * everything built off one wall stays on its cubes. Aimed anywhere else, it goes right there,
 * squared to the office and set against what the crosshair is on.
 */

/** Standing (facing you, or turned a quarter with R) or flat. */
export interface BuildStance {
    flat: boolean
    turned: boolean
}

export interface BuildSlot {
    wall: WallSpec
    /** The built wall it locks on to (null: placed freely). */
    on: number | null
    /** A wall is already there. */
    taken: boolean
}

/** The axis a new wall faces: flat faces up; standing faces you (along x or z, whichever you look more along), or across with R. */
export function axisFor(direction: Vector3, stance: BuildStance): WallAxis {
    if (stance.flat) return 'y'
    const facing: WallAxis = Math.abs(direction.x) > Math.abs(direction.z) ? 'x' : 'z'
    return stance.turned ? (facing === 'x' ? 'z' : 'x') : facing
}

/** Where a wall goes, aimed from `eye` along the unit `direction`. */
export function buildSlot(world: FpsWorld, eye: Vector3, direction: Vector3, stance: BuildStance): BuildSlot {
    const axis = axisFor(direction, stance)
    const hit = rayHit(world, eye, direction, BUILD.reach)
    let wall: WallSpec
    if (hit?.wall) {
        wall = besideWall(hit.wall, hit.point, eye, axis)
    } else if (hit) {
        // Against what's there: its face's main axis tells which way to set it out of it.
        const n = hit.normal
        const out = mainAxis(n)
        const centre = hit.point.clone()
        centre[out] += Math.sign(n[out]) * halfExtent(axis, out)
        wall = { axis, x: centre.x, y: centre.y, z: centre.z }
    } else {
        const centre = eye.clone().addScaledVector(direction, BUILD.reach)
        wall = { axis, x: centre.x, y: centre.y, z: centre.z }
    }
    wall = { axis: wall.axis, x: round(wall.x), y: round(wall.y), z: round(wall.z) }

    return { wall, on: hit?.wall?.id ?? null, taken: world.walls.taken(wall) }
}

/**
 * The slot next to a built wall, on the edge nearest where the crosshair is on it: in line with it
 * when the new one faces the same way, else turned a quarter on the side the builder stands.
 */
export function besideWall(wall: Wall, point: Vector3, eye: Vector3, axis: WallAxis): WallSpec {
    const centre = new Vector3(wall.x, wall.y, wall.z)
    const offset = point.clone().sub(centre)
    if (axis === wall.axis) {
        // In line: past the edge (left, right, top, bottom) the crosshair is nearest.
        const inPlane = (['x', 'y', 'z'] as const).filter(a => a !== wall.axis)
        const [u, v] = inPlane as [WallAxis, WallAxis]
        const along = Math.abs(offset[u]) >= Math.abs(offset[v]) ? u : v
        centre[along] += Math.sign(offset[along] || 1) * BUILD.size
    } else {
        // Turned: hinged on the edge across the new wall's axis, out on the builder's side.
        const edge = Math.sign(offset[axis] || 1)
        const side = Math.sign(eye[wall.axis] - wall[wall.axis] || 1)
        centre[axis] += (edge * BUILD.size) / 2
        centre[wall.axis] += (side * BUILD.size) / 2
    }

    return { axis, x: centre.x, y: centre.y, z: centre.z }
}

/** The axis a vector points most along. */
function mainAxis(v: Vector3): WallAxis {
    const [x, y, z] = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]
    if (y >= x && y >= z) return 'y'
    return x >= z ? 'x' : 'z'
}

/** Millimetres: what goes over the wire, so the browser's slot and the server's wall are the same numbers. */
function round(n: number): number {
    return Math.round(n * 1000) / 1000
}
