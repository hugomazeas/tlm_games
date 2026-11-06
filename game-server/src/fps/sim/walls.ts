import type { Line3, Vector3 } from 'three'
import type { WallAxis, WallSpec, WallState } from '../protocol.ts'

/**
 * Walls players build: 0.6 m square panels, thin, squared to the office (its rooms run along x and
 * z), standing (facing x or z) or flat (a floor, a roof). They stop players, rounds and rockets
 * like the office does, and come down when shot enough.
 */
const BUILD_SIDE = 0.6

export const BUILD = {
    /** A panel's side. */
    size: BUILD_SIDE,
    thickness: 0.06,
    health: 350,
    /** How far from the eyes a wall may go: right in front of you. */
    reach: 1,
    /** The server's slack on it: a snapped wall sits up to a side past the aim, and its eyes lag yours (a dodge). */
    slack: BUILD_SIDE + 0.5,
    /** Walls on the map at most: past it the builder's oldest (else the oldest) comes down. */
    max: 120,
    /** Steps between two walls by the same player (0.5 s). */
    everySteps: 30,
} as const

/** A wall with its box, cached: what collision and rays test. */
export interface Wall extends WallState {
    minX: number
    minY: number
    minZ: number
    maxX: number
    maxY: number
    maxZ: number
}

/** A panel's half size along an axis: thin along its own, half a side along the others. */
export function halfExtent(axis: WallAxis, along: WallAxis): number {
    return axis === along ? BUILD.thickness / 2 : BUILD.size / 2
}

/** The walls up in a world, oldest first. Changed only by the arena (server) or its events (browser). */
export class Walls {
    private readonly list: Wall[] = []

    get all(): readonly Wall[] {
        return this.list
    }

    get count(): number {
        return this.list.length
    }

    get(id: number): Wall | undefined {
        return this.list.find(w => w.id === id)
    }

    add(state: WallState): Wall {
        this.remove(state.id)
        const wall: Wall = {
            ...state,
            minX: state.x - halfExtent(state.axis, 'x'),
            maxX: state.x + halfExtent(state.axis, 'x'),
            minY: state.y - halfExtent(state.axis, 'y'),
            maxY: state.y + halfExtent(state.axis, 'y'),
            minZ: state.z - halfExtent(state.axis, 'z'),
            maxZ: state.z + halfExtent(state.axis, 'z'),
        }
        this.list.push(wall)

        return wall
    }

    remove(id: number): Wall | null {
        const index = this.list.findIndex(w => w.id === id)
        if (index < 0) return null

        return this.list.splice(index, 1)[0]!
    }

    clear(): void {
        this.list.length = 0
    }

    /** Is there already a wall (the same way round) overlapping this spot? */
    taken(spec: WallSpec): boolean {
        const side = BUILD.size - 0.01
        return this.list.some(w => {
            if (w.axis !== spec.axis) return false
            const apart = { x: Math.abs(w.x - spec.x), y: Math.abs(w.y - spec.y), z: Math.abs(w.z - spec.z) }
            return (['x', 'y', 'z'] as const).every(a => apart[a] < (a === spec.axis ? BUILD.thickness : side))
        })
    }
}

/** A wall as it goes out (without its cached box). */
export function stateOf(wall: Wall): WallState {
    const { id, by, team, axis, x, y, z, health } = wall
    return { id, by, team, axis, x, y, z, health }
}

/**
 * Pushes an upright capsule (`seg` from its bottom sphere's centre to its top one's: a body's) out
 * of the walls. Moves `seg` in place; true when it touched any. Allocation-free: it runs every
 * collision sub-step.
 */
export function collideWalls(walls: Walls, seg: Line3, radius: number): boolean {
    let touched = false
    for (let pass = 0; pass < 2; pass++) {
        let moved = false
        for (const w of walls.all) {
            const x = seg.start.x
            const z = seg.start.z
            const y0 = Math.min(seg.start.y, seg.end.y)
            const y1 = Math.max(seg.start.y, seg.end.y)
            if (x < w.minX - radius || x > w.maxX + radius || z < w.minZ - radius || z > w.maxZ + radius) continue
            if (y1 < w.minY - radius || y0 > w.maxY + radius) continue
            // The nearest points of the segment and the box.
            const dx = x - clamp(x, w.minX, w.maxX)
            const dz = z - clamp(z, w.minZ, w.maxZ)
            const dy = y1 < w.minY ? y1 - w.minY : y0 > w.maxY ? y0 - w.maxY : 0
            const distance = Math.hypot(dx, dy, dz)
            if (distance >= radius) continue
            let px = 0
            let py = 0
            let pz = 0
            if (distance > 1e-6) {
                const k = (radius - distance) / distance
                px = dx * k
                py = dy * k
                pz = dz * k
            } else {
                // The axis is inside the box: out the shortest way.
                const ways = [
                    w.maxX - x + radius,
                    x - w.minX + radius,
                    w.maxZ - z + radius,
                    z - w.minZ + radius,
                    w.maxY - y0 + radius,
                    y1 - w.minY + radius,
                ]
                let best = 0
                for (let i = 1; i < 6; i++) if (ways[i]! < ways[best]!) best = i
                const amount = ways[best]!
                if (best === 0) px = amount
                else if (best === 1) px = -amount
                else if (best === 2) pz = amount
                else if (best === 3) pz = -amount
                else if (best === 4) py = amount
                else py = -amount
            }
            seg.start.x += px
            seg.start.y += py
            seg.start.z += pz
            seg.end.x += px
            seg.end.y += py
            seg.end.z += pz
            moved = true
        }
        touched ||= moved
        // Nothing moved it: a second pass would find the same nothing.
        if (!moved) break
    }

    return touched
}

/** Where a ray first meets a wall: which, how far, and the face's normal axis and sign (toward the ray). */
export interface WallHit {
    wall: Wall
    distance: number
    axis: WallAxis
    sign: 1 | -1
}

const AXES = ['x', 'y', 'z'] as const

/**
 * The first wall a ray from `origin` along the unit `direction` meets within `far`. A ray starting
 * inside a wall (eyes pressed into one) goes through that one.
 */
export function rayWalls(walls: Walls, origin: Vector3, direction: Vector3, far: number): WallHit | null {
    let best: WallHit | null = null
    let nearest = far
    for (const w of walls.all) {
        let enter = 0
        let leave = nearest
        let entryAxis: WallAxis | null = null
        let missed = false
        for (const a of AXES) {
            const o = origin[a]
            const d = direction[a]
            const min = a === 'x' ? w.minX : a === 'y' ? w.minY : w.minZ
            const max = a === 'x' ? w.maxX : a === 'y' ? w.maxY : w.maxZ
            if (Math.abs(d) < 1e-12) {
                if (o < min || o > max) missed = true
                continue
            }
            let t1 = (min - o) / d
            let t2 = (max - o) / d
            if (t1 > t2) [t1, t2] = [t2, t1]
            if (t1 > enter) {
                enter = t1
                entryAxis = a
            }
            if (t2 < leave) leave = t2
            if (enter > leave) missed = true
            if (missed) break
        }
        if (missed || entryAxis === null) continue
        nearest = enter
        best = { wall: w, distance: enter, axis: entryAxis, sign: direction[entryAxis] > 0 ? -1 : 1 }
    }

    return best
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value
}
