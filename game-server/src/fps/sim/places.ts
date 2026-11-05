/**
 * The fixed places of the office FPS, shared by the server and the browser: where the pickups
 * lie and what they give, and the zones of King of the meeting room. Checked against the office's
 * collision in places.test.ts (open floor, inside the office).
 */

export type PickupKind =
    | 'health'
    | 'magazine'
    | 'jetpack'
    | 'headshot'
    | 'overtime'
    | 'promotion'
    | 'firewall'
    | 'espresso'
    | 'intern'
    | 'bonus'
    | 'orgchart'

export const PICKUPS: Record<PickupKind, { name: string; respawnMs: number; durationMs: number | null }> = {
    /** +50 health (only taken when hurt). */
    health: { name: 'Health pack', respawnMs: 20_000, durationMs: null },
    /** A 1.5× magazine (18 rounds), refilled on pickup. */
    magazine: { name: 'Big magazine', respawnMs: 30_000, durationMs: 60_000 },
    /** The jetpack's fuel lasts 4× as long. */
    jetpack: { name: 'Jetpack extender', respawnMs: 40_000, durationMs: 60_000 },
    /** Any headshot kills. */
    headshot: { name: 'Headshot rounds', respawnMs: 45_000, durationMs: 30_000 },
    /** The tank: slow, grounded (no jetpack, no dodge), +100 health, never reloads. */
    overtime: { name: 'Overtime', respawnMs: 90_000, durationMs: 30_000 },
    /** Three times the size, five times the health. */
    promotion: { name: 'Promotion', respawnMs: 90_000, durationMs: 20_000 },
    /** A bubble that soaks the next FIREWALL damage. */
    firewall: { name: 'Firewall', respawnMs: 40_000, durationMs: 30_000 },
    /** Faster, and the dodge comes back twice as soon. */
    espresso: { name: 'Espresso', respawnMs: 35_000, durationMs: 20_000 },
    /** Half the size (hard to hit), and only INTERN.health. */
    intern: { name: 'Intern', respawnMs: 45_000, durationMs: 30_000 },
    /** Double damage. */
    bonus: { name: 'Bonus', respawnMs: 60_000, durationMs: 15_000 },
    /** Everyone shows through the walls (to you). */
    orgchart: { name: 'Org chart', respawnMs: 45_000, durationMs: 15_000 },
}

export const HEALTH_PACK = 50
export const MAGAZINE_FACTOR = 1.5
export const JETPACK_FACTOR = 4
/** Overtime: walking pace, and health on top of your usual. */
export const OVERTIME = { walk: 0.6, health: 100 } as const
export const PROMOTION = { scale: 3, health: 500, walk: 0.8 } as const
export const INTERN = { scale: 0.5, health: 60 } as const
export const ESPRESSO = { walk: 1.6, dashCooldown: 0.5 } as const
/** Damage the firewall soaks before it breaks. */
export const FIREWALL = 75
/** Bonus: damage multiplier. */
export const BONUS = 2

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
    // On floor a giant fits (places.test.ts checks), spread out from the spawns, the zones and the rest.
    { kind: 'promotion', x: -1.0, z: 0.2, room: 'the corridor' },
    { kind: 'overtime', x: 7.2, z: 4.4, room: 'the south-east corner' },
    { kind: 'firewall', x: 1.0, z: -1.2, room: 'the open office' },
    { kind: 'espresso', x: -3.0, z: -1.0, room: 'the meeting area' },
    { kind: 'intern', x: 10.2, z: 0.4, room: 'the east end' },
    { kind: 'bonus', x: 6.0, z: -4.0, room: 'office 2' },
    { kind: 'orgchart', x: -5.8, z: 2.4, room: 'the south-west corner' },
]

/** How close (m, on the floor plan) a mini must come to take one, and how far above it still counts. */
export const PICKUP_REACH = 0.4
export const PICKUP_HEIGHT = 0.6

/** A jump pad: stand on it and it throws you up, no fuel used. */
export interface Pad {
    x: number
    z: number
}

export const PADS: readonly Pad[] = [
    { x: 2.8, z: -1.0 },
    { x: 4.4, z: -4.2 },
    { x: -1.6, z: 1.8 },
    { x: 1.4, z: 4.4 },
]

/** On a pad: feet this close to its middle (floor plan), at most this high; thrown up at `launch` m/s (about 2 m). */
export const PAD = { radius: 0.25, height: 0.1, launch: 6.5 } as const

/** A portal: step in and you come out of its partner (portals pair up in order: 0 with 1, 2 with 3 …). */
export interface Portal {
    x: number
    z: number
    /** The way out of it (a unit vector on the floor plan): you come out that side. */
    out: readonly [number, number]
    room: string
}

/** One end of the office to the other: the kitchen and the far end of office 2. */
export const PORTALS: readonly Portal[] = [
    { x: -9.6, z: -2.0, out: [1, 0], room: 'the kitchen' },
    { x: 9.5, z: -4.0, out: [-1, 0], room: 'office 2' },
]

/**
 * In a portal: feet this close to its middle and at most this high. You come out `exit` m along its
 * `out`, and no portal takes you again for `cooldownSteps` (1 s), so you don't bounce straight back.
 */
export const PORTAL = { radius: 0.3, height: 0.5, exit: 0.45, cooldownSteps: 60 } as const

/** The other end of portal `index`. */
export function partnerOf(index: number): number {
    return index % 2 === 0 ? index + 1 : index - 1
}

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
