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
export type CloudNineLook = 'deck' | 'underside' | 'leg' | 'tank' | 'cabinet' | 'drone' | 'sign'

export interface Block {
    min: [number, number, number]
    max: [number, number, number]
    look: CloudNineLook
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
]

/** Facing the middle of the deck from (x, z). */
const facingMiddle = (x: number, z: number): number => Math.atan2(x, z)

const spawn = (name: string, x: number, z: number): SpawnPoint => ({
    name,
    position: [x, 0, z],
    yaw: facingMiddle(x, z),
})

/** On the deck, back from the ledges. */
export const CLOUD_NINE_SPAWNS: readonly SpawnPoint[] = [
    spawn('north-west', -4.4, -1.8),
    spawn('south-west', -4.4, 1.8),
    spawn('west', -1.6, -0.2),
    spawn('east', 1.6, 0.2),
    spawn('north-east', 4.4, -1.8),
    spawn('south-east', 4.4, 1.8),
]

/** A vent by each end: up 2 m (a way back from the ledge, or onto a platform). */
export const CLOUD_NINE_VENTS: readonly Pad[] = [
    { x: -5.8, z: 0 },
    { x: 5.8, z: 0 },
]

/** The lid, each platform, and the deck either side of the tank. */
export const CLOUD_NINE_PICKUPS: readonly PickupSpot[] = [
    { x: 0, z: 0, y: lid, room: 'the tank lid', roomy: true },
    { x: -3.5, z: 0, y: platform, room: 'the drone screen', roomy: true },
    { x: 3.5, z: 0, y: platform, room: 'the neon sign', roomy: true },
    { x: 0, z: -2.2, room: 'the north side', roomy: true },
    { x: 0, z: 2.2, room: 'the south side', roomy: true },
]

/** A block's triangles (all six sides), into `out` as x, y, z triples. */
export function boxTriangles({ min, max }: Pick<Block, 'min' | 'max'>, out: number[]): void {
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const quad = (a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d)
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0])
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1])
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0])
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
}
