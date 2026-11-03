/**
 * The fixed places of the office FPS, shared by the server and the browser: where the pickups
 * lie and what they give, and the zones of King of the meeting room. Checked against the office's
 * collision in places.test.ts (open floor, inside the office).
 */

export type PickupKind = 'health' | 'magazine' | 'jetpack' | 'headshot'

export const PICKUPS: Record<PickupKind, { name: string; respawnMs: number; durationMs: number | null }> = {
    /** +50 health (only taken when hurt). */
    health: { name: 'Health pack', respawnMs: 20_000, durationMs: null },
    /** A 1.5× magazine (18 rounds), refilled on pickup. */
    magazine: { name: 'Big magazine', respawnMs: 30_000, durationMs: 60_000 },
    /** The jetpack's fuel lasts 4× as long. */
    jetpack: { name: 'Jetpack extender', respawnMs: 40_000, durationMs: 60_000 },
    /** Any headshot kills. */
    headshot: { name: 'Headshot rounds', respawnMs: 45_000, durationMs: 30_000 },
}

export const HEALTH_PACK = 50
export const MAGAZINE_FACTOR = 1.5
export const JETPACK_FACTOR = 4

export interface PickupSpot {
    kind: PickupKind
    x: number
    z: number
    /** Where it is, for the kill feed ("in the kitchen"). */
    room: string
}

export const PICKUP_SPOTS: readonly PickupSpot[] = [
    { kind: 'health', x: -8.4, z: -1.4, room: 'the kitchen' },
    { kind: 'health', x: 8.4, z: 1.4, room: 'office 1' },
    { kind: 'magazine', x: -1.2, z: -3.0, room: 'the middle room' },
    { kind: 'jetpack', x: 4.6, z: -0.6, room: 'the lounge' },
    { kind: 'headshot', x: 1.6, z: -3.6, room: 'office 2' },
]

/** How close (m, on the floor plan) a mini must come to take one, and how far above it still counts. */
export const PICKUP_REACH = 0.4
export const PICKUP_HEIGHT = 0.6

/** King of the meeting room's zones: a column from floor to ceiling over a circle. */
export interface Zone {
    name: string
    x: number
    z: number
    radius: number
}

export const ZONES: readonly Zone[] = [
    { name: 'Meeting room', x: -7.6, z: 0.0, radius: 1.4 },
    { name: 'Ping-pong lounge', x: 6.1, z: -1.9, radius: 1.4 },
    { name: 'Open office', x: 3.0, z: 2.2, radius: 1.3 },
    { name: 'Closed office', x: -3.4, z: 3.6, radius: 1.1 },
]

/** The active zone moves on this often. */
export const ZONE_MS = 60_000

export function inZone(zone: Zone, x: number, z: number): boolean {
    return Math.hypot(x - zone.x, z - zone.z) <= zone.radius
}
