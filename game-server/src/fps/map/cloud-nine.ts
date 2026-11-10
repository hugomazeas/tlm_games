import type { SpawnPoint } from './office.js'
import type { Pad, PickupSpot } from '../sim/places.ts'

/**
 * Cloud Nine: a chunk of rooftop torn loose and floating high over a city at night. A 14 × 6 m
 * deck with no railings (its top is y = 0, like the office's floor), a water tank in the middle
 * whose lid is the high ground (3 m), two platforms floating at 1.4 m (an ad drone's screen, a neon
 * sign), two server cabinets for cover and a vent by each end that throws you up. Fall past
 * `outBelow` and you're out.
 *
 * Pure data, no DOM: the game server collides with these blocks and the browser draws them (with
 * its screens and neon on top, `client/cloud-nine.ts`).
 */

/** What a block is, for the browser's drawing (the collision doesn't care). */
export type CloudNineLook =
    | 'deck'
    | 'underside'
    | 'leg'
    | 'tank'
    | 'cabinet'
    | 'drone'
    | 'sign'
    | 'ramp'
    | 'shelter'
    | 'crate'
    | 'walkway'
    | 'pillar'

export interface Block {
    min: [number, number, number]
    max: [number, number, number]
    look: CloudNineLook
    /** A ramp: its top rises from min.y to max.y toward this way (a wedge, walked up). */
    slope?: 'x+' | 'x-'
}

export const CLOUD_NINE = {
    /** The deck's half size along x and z (m). */
    halfX: 7,
    halfZ: 3,
    /** Below this (m), you've fallen off: out. */
    outBelow: -4,
    /** The jetpack takes nobody above this (m). */
    ceiling: 6,
    /** The tank's lid, the high ground. */
    lid: 3,
    /** The floating platforms' tops. */
    platform: 1.4,
} as const

const { halfX, halfZ, lid, platform } = CLOUD_NINE

/** The spawns' shelter walls (x0, z0, x1, z1), each between its spawn and the middle; how high. */
const SHELTER_HEIGHT = 0.5
const SHELTERS: ReadonlyArray<readonly [number, number, number, number]> = [
    // The four by the ends' corners: across x, in front of the spawn.
    [-5.95, -2.3, -5.85, -1.3],
    [-5.95, 1.3, -5.85, 2.3],
    [5.85, -2.3, 5.95, -1.3],
    [5.85, 1.3, 5.95, 2.3],
    // The four along the long sides: L-shaped, across z in front and along it on the side toward
    // the middle (a single wall would leave them in sight from along the edge).
    [-3.7, -2.1, -2.7, -2.0],
    [-2.75, -2.9, -2.65, -2.0],
    [0.7, -2.1, 1.7, -2.0],
    [0.65, -2.9, 0.75, -2.0],
    [-1.7, 2.0, -0.7, 2.1],
    [-0.75, 2.0, -0.65, 2.9],
    [2.7, 2.0, 3.7, 2.1],
    [2.65, 2.0, 2.75, 2.9],
]

export const CLOUD_NINE_BLOCKS: readonly Block[] = [
    { min: [-halfX, -0.3, -halfZ], max: [halfX, 0, halfZ], look: 'deck' },
    // The building it was torn from, under the deck (set in from its edges: a fall off one misses it).
    { min: [-6, -2.6, -2.2], max: [6, -0.3, 2.2], look: 'underside' },
    // The tank on its four legs (room to walk under it), its lid at 3 m.
    ...[-1, 1].flatMap(sx =>
        [-1, 1].map(
            (sz): Block => ({
                min: [sx * 0.65 - 0.05, 0, sz * 0.65 - 0.05],
                max: [sx * 0.65 + 0.05, 1.4, sz * 0.65 + 0.05],
                look: 'leg',
            })
        )
    ),
    { min: [-0.8, 1.4, -0.8], max: [0.8, lid, 0.8], look: 'tank' },
    // Server cabinets, two minis high: cover on the deck.
    { min: [2.0, 0, -2.4], max: [2.8, 0.8, -1.6], look: 'cabinet' },
    { min: [-2.8, 0, 1.2], max: [-2.0, 0.8, 2.0], look: 'cabinet' },
    // The floating platforms: thin slabs, solid from below too (a jetpack bumps its head).
    { min: [-4.8, platform - 0.12, -0.8], max: [-2.2, platform, 0.8], look: 'drone' },
    { min: [2.2, platform - 0.12, -0.8], max: [4.8, platform, 0.8], look: 'sign' },
    // Ramps up to them from the deck's ends (32°): the high ground on foot, a climb in the open.
    { min: [-halfX, 0, -0.45], max: [-4.8, platform, 0.45], look: 'ramp', slope: 'x+' },
    { min: [4.8, 0, -0.45], max: [halfX, platform, 0.45], look: 'ramp', slope: 'x-' },
    // The upper walkway behind the tank, joining the platforms, on two pillars (cover underneath).
    // (It runs on past the platforms' inner ends, a hair off their back edge: one floor, walked across.)
    { min: [-3.0, platform - 0.12, -1.45], max: [3.0, platform, -0.82], look: 'walkway' },
    { min: [-1.7, 0, -1.28], max: [-1.5, platform - 0.12, -1.08], look: 'pillar' },
    { min: [1.5, 0, -1.28], max: [1.7, platform - 0.12, -1.08], look: 'pillar' },
    // The spawns' shelters: a wall between each spawn and the middle, higher than a mini.
    ...SHELTERS.map(
        ([x0, z0, x1, z1]): Block => ({ min: [x0, 0, z0], max: [x1, SHELTER_HEIGHT, z1], look: 'shelter' })
    ),
    // Crates by the corners.
    { min: [-4.85, 0, -2.45], max: [-4.35, 0.45, -1.95], look: 'crate' },
    { min: [4.35, 0, 1.95], max: [4.85, 0.45, 2.45], look: 'crate' },
]

/** Facing the middle of the deck from (x, z). */
const facingMiddle = (x: number, z: number): number => Math.atan2(x, z)

const spawn = (name: string, x: number, z: number): SpawnPoint => ({
    name,
    position: [x, 0, z],
    yaw: facingMiddle(x, z),
})

/**
 * Each behind its shelter (nobody in the middle can see them), back from the ledges; the arena
 * picks the one furthest from the enemy.
 */
export const CLOUD_NINE_SPAWNS: readonly SpawnPoint[] = [
    spawn('north-west', -6.4, -1.8),
    spawn('south-west', -6.4, 1.8),
    spawn('north-east', 6.4, -1.8),
    spawn('south-east', 6.4, 1.8),
    spawn('north, west', -3.2, -2.55),
    spawn('north, east', 1.2, -2.55),
    spawn('south, west', -1.2, 2.55),
    spawn('south, east', 3.2, 2.55),
]

/** Two vents in opposite corners: up 2 m (a way back from the ledge, or onto a platform). */
export const CLOUD_NINE_VENTS: readonly Pad[] = [
    { x: -4.4, z: 2.3 },
    { x: 4.4, z: -2.3 },
]

/** Spawn-shielded on Cloud Nine this long (it's a small deck: longer than the office's). */
export const CLOUD_NINE_SHIELD_MS = 2_500

/**
 * The elevator up the tank's front: a little platform from the deck to the lid and down again,
 * every 9 s (a mover, like the gondola).
 */
export const ELEVATOR = {
    half: [0.35, 0.04, 0.3] as const,
    x: 0,
    z: 1.15,
    bottom: 0.03,
    top: lid,
    periodSteps: 9 * 60,
} as const

/** The elevator at step `step`: its middle (its top is `half[1]` above), still along x. */
export function elevatorAt(step: number): { x: number; y: number; z: number; vx: number } {
    // Down at 0, up at half a period, eased at both ends.
    const t = (1 - Math.cos((2 * Math.PI * step) / ELEVATOR.periodSteps)) / 2
    const top = ELEVATOR.bottom + (ELEVATOR.top - ELEVATOR.bottom) * t
    return { x: ELEVATOR.x, y: top - ELEVATOR.half[1], z: ELEVATOR.z, vx: 0 }
}

/**
 * The security laser: a magenta beam at ankle height sweeping round the deck from the tank's legs
 * to past the corners, once every 12 s. Whoever it meets standing on the deck is knocked flying,
 * toward the middle and a little along its way (jump it; on a ramp, a platform or in the air it
 * can't reach you).
 */
export const LASER = {
    inner: 1.0,
    outer: 7.7,
    /** Feet lower than this (m): it gets you. */
    height: 0.1,
    periodSteps: 12 * 60,
    /** A hop and a shove, not a launch: from a spawn by the edge it mustn't throw you off by itself. */
    knock: 1.8,
    lift: 2.8,
    percent: 5,
} as const

/** The laser's angle (rad, from +x toward +z) at step `step`. */
export function laserAngle(step: number): number {
    return ((2 * Math.PI * step) / LASER.periodSteps) % (2 * Math.PI)
}

/** The lid, each platform, and the deck either side of the tank. */
export const CLOUD_NINE_PICKUPS: readonly PickupSpot[] = [
    { x: 0, z: 0, y: lid, room: 'the tank lid', roomy: true },
    { x: -3.5, z: 0, y: platform, room: 'the drone screen', roomy: true },
    { x: 3.5, z: 0, y: platform, room: 'the neon sign', roomy: true },
    { x: 0, z: -2.2, room: 'the north side', roomy: true },
    { x: 0, z: 2.2, room: 'the south side', roomy: true },
]

/**
 * The window-washer's gondola: a platform hanging 1.45 m under the deck along its front edge,
 * swinging from end to end and past them (18 m) every 14 s. Stand on it and it carries you; fall
 * onto it and it saves you. Where it is follows from the step alone, so the server and every
 * browser agree.
 */
export const GONDOLA = {
    /** Its half size (m), and its top's height. */
    half: [0.8, 0.06, 0.4] as const,
    top: -1.45,
    /** Just out from the deck's front edge (z = 3): it catches who's knocked off that side. */
    z: 3.45,
    /** It swings ±reach m round x = 0, once there and back every `periodSteps`. */
    reach: 9,
    periodSteps: 14 * 60,
} as const

/** The gondola at step `step`: its middle, and its speed (m/s along x). */
export function gondolaAt(step: number): { x: number; y: number; z: number; vx: number } {
    const phase = (2 * Math.PI * step) / GONDOLA.periodSteps
    return {
        x: GONDOLA.reach * Math.sin(phase),
        y: GONDOLA.top - GONDOLA.half[1],
        z: GONDOLA.z,
        vx: ((GONDOLA.reach * 2 * Math.PI) / (GONDOLA.periodSteps / 60)) * Math.cos(phase),
    }
}

/** A block's triangles (all its sides; a ramp's top sloped), into `out` as x, y, z triples, wound outward. */
export function boxTriangles(block: Pick<Block, 'min' | 'max' | 'slope'>, out: number[]): void {
    const { min, max, slope } = block
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const quad = (a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d)
    const tri = (a: number[], b: number[], c: number[]) => out.push(...a, ...b, ...c)
    if (slope) {
        // A wedge: flat at the low end (x0 for x+, x1 for x-), its full height at the other.
        const [lo, hi] = slope === 'x+' ? [x0, x1] : [x1, x0]
        const s = slope === 'x+' ? 1 : -1
        // The slope, the high end's face, the floor, and the two sides (triangles).
        const slopeQuad = [
            [lo, y0, z0],
            [lo, y0, z1],
            [hi, y1, z1],
            [hi, y1, z0],
        ]
        if (s > 0) quad(slopeQuad[0]!, slopeQuad[1]!, slopeQuad[2]!, slopeQuad[3]!)
        else quad(slopeQuad[3]!, slopeQuad[2]!, slopeQuad[1]!, slopeQuad[0]!)
        quad([hi, y0, z0], [hi, y1, z0], [hi, y1, z1], [hi, y0, z1])
        quad([lo, y0, z0], [hi, y0, z0], [hi, y0, z1], [lo, y0, z1])
        tri([lo, y0, z0], [hi, y1, z0], [hi, y0, z0])
        tri([lo, y0, z1], [hi, y0, z1], [hi, y1, z1])
        return
    }
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0])
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1])
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0])
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
}
