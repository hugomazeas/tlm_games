import type { Line3, Vector3 } from 'three'
import type { WallAxis, WallSpec, WallState } from '../protocol.ts'

/**
 * Walls players build: 0.6 m square panels, thin, squared to the office (its rooms run along x and
 * z), standing (facing x or z) or flat (a floor, a roof). They stop players, rounds and rockets
 * like the office does, and come down when shot enough. A standing one can become a door or a
 * window: then it's made of a few boxes (its `parts`), and what passes is what the boxes leave open.
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
    /** How far from the eyes a door opens, or a wall becomes a door or a window. */
    useReach: 1.5,
    /** Walls on the map at most: past it the builder's oldest (else the oldest) comes down. */
    max: 120,
    /** Steps between two walls by the same player (1 s; a ring by the crosshair fills meanwhile). */
    everySteps: 60,
} as const

/** A door: its frame's posts and lintel, and the opening they leave (0.52 × 0.54 m: a mini walks through). */
export const DOOR = { post: 0.04, lintel: 0.06, leaf: BUILD.thickness * 0.6 } as const
/** A window: a slit at a mini's eye height (from the panel's foot), too thin for anyone to get through. */
export const WINDOW = { from: 0.28, to: 0.4, post: 0.06 } as const

export interface Box {
    minX: number
    minY: number
    minZ: number
    maxX: number
    maxY: number
    maxZ: number
}

/** A piece of a wall: solid (it collides and stops rounds) or only drawn, and what it looks like. */
export interface WallPart extends Box {
    solid: boolean
    look: 'panel' | 'leaf'
}

/** A wall with its boxes, cached: around all of it (an open door's leaf too) and its parts (what collision and rays test). */
export interface Wall extends WallState, Box {
    parts: WallPart[]
}

/** A panel's half size along an axis: thin along its own, half a side along the others. */
export function halfExtent(axis: WallAxis, along: WallAxis): number {
    return axis === along ? BUILD.thickness / 2 : BUILD.size / 2
}

/** The whole panel's box. */
function panelOf(spec: WallSpec): Box {
    return {
        minX: spec.x - halfExtent(spec.axis, 'x'),
        maxX: spec.x + halfExtent(spec.axis, 'x'),
        minY: spec.y - halfExtent(spec.axis, 'y'),
        maxY: spec.y + halfExtent(spec.axis, 'y'),
        minZ: spec.z - halfExtent(spec.axis, 'z'),
        maxZ: spec.z + halfExtent(spec.axis, 'z'),
    }
}

/**
 * A wall's pieces. A plain wall (or a flat one) is its panel. A door is two posts and a lintel round
 * a leaf: shut, the leaf fills the opening; open, it stands swung out a quarter, as solid. A
 * window is the panel above and below a slit, and two posts at its ends.
 */
export function partsOf(state: WallState): WallPart[] {
    if (state.axis === 'y' || state.kind === 'wall') return [{ ...panelOf(state), solid: true, look: 'panel' }]
    const h = BUILD.size / 2
    const t = BUILD.thickness / 2
    // Across the panel (u), up it from its foot (v), and through it (n), around its centre.
    const u: WallAxis = state.axis === 'z' ? 'x' : 'z'
    const foot = state.y - h
    const part = (
        u0: number,
        u1: number,
        v0: number,
        v1: number,
        n0: number,
        n1: number,
        solid = true,
        look: WallPart['look'] = 'panel'
    ): WallPart => {
        const along = { x: [0, 0], z: [0, 0] } as Record<'x' | 'z', [number, number]>
        along[u as 'x' | 'z'] = [state[u] + u0, state[u] + u1]
        along[state.axis as 'x' | 'z'] = [state[state.axis] + n0, state[state.axis] + n1]
        return {
            minX: along.x[0],
            maxX: along.x[1],
            minY: foot + v0,
            maxY: foot + v1,
            minZ: along.z[0],
            maxZ: along.z[1],
            solid,
            look,
        }
    }
    const S = BUILD.size
    if (state.kind === 'window') {
        const { from, to, post } = WINDOW
        return [
            part(-h, h, 0, from, -t, t),
            part(-h, h, to, S, -t, t),
            part(-h, -h + post, from, to, -t, t),
            part(h - post, h, from, to, -t, t),
        ]
    }
    const { post, lintel, leaf } = DOOR
    const frame = [
        part(-h, -h + post, 0, S, -t, t),
        part(h - post, h, 0, S, -t, t),
        part(-h + post, h - post, S - lintel, S, -t, t),
    ]
    const shut = part(-h + post, h - post, 0, S - lintel, -leaf / 2, leaf / 2, true, 'leaf')
    // Swung out a quarter on its hinge (the first post), into the +n side: solid there, the doorway clear.
    const swung = part(-h + post, -h + post + leaf, 0, S - lintel, 0, S - 2 * post, true, 'leaf')

    return [...frame, state.open ? swung : shut]
}

/** The box round them all. */
function boundsOf(parts: readonly Box[]): Box {
    return {
        minX: Math.min(...parts.map(p => p.minX)),
        minY: Math.min(...parts.map(p => p.minY)),
        minZ: Math.min(...parts.map(p => p.minZ)),
        maxX: Math.max(...parts.map(p => p.maxX)),
        maxY: Math.max(...parts.map(p => p.maxY)),
        maxZ: Math.max(...parts.map(p => p.maxZ)),
    }
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

    /** A new wall at the end, or one already up as it is now (a door, a window, opened, shot), in its place. */
    add(state: WallState): Wall {
        const parts = partsOf(state)
        const wall: Wall = { ...state, ...boundsOf(parts), parts }
        const index = this.list.findIndex(w => w.id === state.id)
        if (index >= 0) this.list[index] = wall
        else this.list.push(wall)

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

/** A wall as it goes out (without its cached boxes). */
export function stateOf(wall: Wall): WallState {
    const { id, by, team, axis, x, y, z, health, kind, open } = wall
    return { id, by, team, axis, x, y, z, health, kind, open }
}

/**
 * Pushes an upright capsule (`seg` from its bottom sphere's centre to its top one's: a body's) out
 * of the walls' solid parts. Moves `seg` in place; true when it touched any. Allocation-free: it
 * runs every collision sub-step.
 */
export function collideWalls(walls: Walls, seg: Line3, radius: number): boolean {
    let touched = false
    for (let pass = 0; pass < 2; pass++) {
        let moved = false
        for (const w of walls.all) {
            if (!near(w, seg, radius)) continue
            for (const part of w.parts) {
                if (part.solid && pushOut(part, seg, radius)) moved = true
            }
        }
        touched ||= moved
        // Nothing moved it: a second pass would find the same nothing.
        if (!moved) break
    }

    return touched
}

/** Is the capsule within reach of the box at all? */
function near(b: Box, seg: Line3, radius: number): boolean {
    const x = seg.start.x
    const z = seg.start.z
    const y0 = Math.min(seg.start.y, seg.end.y)
    const y1 = Math.max(seg.start.y, seg.end.y)
    if (x < b.minX - radius || x > b.maxX + radius || z < b.minZ - radius || z > b.maxZ + radius) return false
    return y1 >= b.minY - radius && y0 <= b.maxY + radius
}

/** Pushes the upright capsule out of one box; true when it had to. */
function pushOut(b: Box, seg: Line3, radius: number): boolean {
    if (!near(b, seg, radius)) return false
    const x = seg.start.x
    const z = seg.start.z
    const y0 = Math.min(seg.start.y, seg.end.y)
    const y1 = Math.max(seg.start.y, seg.end.y)
    // The nearest points of the segment and the box.
    const dx = x - clamp(x, b.minX, b.maxX)
    const dz = z - clamp(z, b.minZ, b.maxZ)
    const dy = y1 < b.minY ? y1 - b.minY : y0 > b.maxY ? y0 - b.maxY : 0
    const distance = Math.hypot(dx, dy, dz)
    if (distance >= radius) return false
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
        const east = b.maxX - x + radius
        const west = x - b.minX + radius
        const south = b.maxZ - z + radius
        const north = z - b.minZ + radius
        const up = b.maxY - y0 + radius
        const down = y1 - b.minY + radius
        const least = Math.min(east, west, south, north, up, down)
        if (least === east) px = east
        else if (least === west) px = -west
        else if (least === south) pz = south
        else if (least === north) pz = -north
        else if (least === up) py = up
        else py = -down
    }
    seg.start.x += px
    seg.start.y += py
    seg.start.z += pz
    seg.end.x += px
    seg.end.y += py
    seg.end.z += pz

    return true
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
 * The first wall a ray from `origin` along the unit `direction` meets within `far` (its solid
 * parts: a window's slit and an open door let it by). A ray starting inside a part (eyes pressed
 * into one) goes through that one.
 */
export function rayWalls(walls: Walls, origin: Vector3, direction: Vector3, far: number): WallHit | null {
    let best: WallHit | null = null
    let nearest = far
    for (const w of walls.all) {
        if (rayBox(w, origin, direction, nearest) === null) continue
        for (const part of w.parts) {
            if (!part.solid) continue
            const met = rayBox(part, origin, direction, nearest)
            // Missed, or starting inside it (through it).
            if (met === null || met.axis === null) continue
            nearest = met.distance
            best = { wall: w, distance: met.distance, axis: met.axis, sign: direction[met.axis] > 0 ? -1 : 1 }
        }
    }

    return best
}

/** Where a ray enters a box within `far`, and through which face (axis null: it starts inside); null when it misses. */
function rayBox(
    b: Box,
    origin: Vector3,
    direction: Vector3,
    far: number
): { distance: number; axis: WallAxis | null } | null {
    let enter = 0
    let leave = far
    let entryAxis: WallAxis | null = null
    for (const a of AXES) {
        const o = origin[a]
        const d = direction[a]
        const min = a === 'x' ? b.minX : a === 'y' ? b.minY : b.minZ
        const max = a === 'x' ? b.maxX : a === 'y' ? b.maxY : b.maxZ
        if (Math.abs(d) < 1e-12) {
            if (o < min || o > max) return null
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
        if (enter > leave) return null
    }
    return { distance: enter, axis: entryAxis }
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value
}
