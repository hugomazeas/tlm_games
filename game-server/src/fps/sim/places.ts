/**
 * The fixed places of the office FPS, shared by the server and the browser: where the pickups
 * lie and what they give, the zones of King of the meeting room and the spots of Siege. Checked against the office's
 * collision in places.test.ts (open floor, inside the office).
 */
import { SIEGE, type Team } from '../protocol.ts'

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
    /** Always this one (a test room's); without it, each time one comes back it's rolled (`rollPickup`). */
    kind?: PickupKind
    /** A giant fits here (places.test.ts checks): the only spots a Promotion can be rolled on. */
    roomy?: boolean
    x: number
    z: number
    /** Where it is, for the kill feed ("in the kitchen"). */
    room: string
}

/** Spread out from the spawns, the zones and each other. What lies on each is rolled. */
export const PICKUP_SPOTS: readonly PickupSpot[] = [
    { x: -8.4, z: -1.4, room: 'the kitchen' },
    { x: 8.4, z: 1.4, room: 'office 1' },
    { x: -1.2, z: -3.0, room: 'the middle room', roomy: true },
    { x: 4.6, z: -0.6, room: 'the lounge' },
    { x: 1.6, z: -3.6, room: 'office 2' },
    { x: -1.0, z: 0.2, room: 'the corridor', roomy: true },
    { x: 7.2, z: 4.4, room: 'the south-east corner', roomy: true },
    { x: 1.0, z: -1.2, room: 'the open office', roomy: true },
    { x: -3.0, z: -1.0, room: 'the meeting area', roomy: true },
    { x: 10.2, z: 0.4, room: 'the east end', roomy: true },
    { x: 6.0, z: -4.0, room: 'office 2', roomy: true },
    { x: -5.8, z: 2.4, room: 'the south-west corner' },
]

/** How often each turns up, relatively: the basics often, the office powers now and then. */
export const PICKUP_WEIGHTS: Record<PickupKind, number> = {
    health: 4,
    magazine: 3,
    jetpack: 3,
    headshot: 1,
    overtime: 1,
    promotion: 1,
    firewall: 1.5,
    espresso: 1.5,
    intern: 1,
    bonus: 1,
    orgchart: 1,
}

/**
 * What comes back on `spot`: its own kind if it has one, else a weighted roll. A Promotion only
 * where a giant fits; a power already lying elsewhere (`out`) isn't rolled twice (the basics may be).
 */
export function rollPickup(random: () => number, spot: PickupSpot, out: readonly (PickupKind | null)[]): PickupKind {
    if (spot.kind) return spot.kind
    const basics: readonly PickupKind[] = ['health', 'magazine', 'jetpack']
    const choices = (Object.keys(PICKUP_WEIGHTS) as PickupKind[]).filter(
        kind => (kind !== 'promotion' || spot.roomy) && (basics.includes(kind) || !out.includes(kind))
    )
    const total = choices.reduce((sum, kind) => sum + PICKUP_WEIGHTS[kind], 0)
    let roll = random() * total
    for (const kind of choices) {
        roll -= PICKUP_WEIGHTS[kind]
        if (roll < 0) return kind
    }

    return choices.at(-1)!
}

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

/** Where a team spawns: feet on the floor, facing `yaw` (0 looks toward -Z). */
export interface SiegeSpawn {
    x: number
    z: number
    yaw: number
}

/**
 * A spot of Siege: the square the defenders hold (`half` a side from its middle, squared to the
 * office; a column, like a zone) and the dome the attackers start in (the open floor furthest from
 * it on foot: the far end of the office). The defenders come back anywhere in the square but its
 * middle (`spotSpawns`). Each match rolls one, played both halves.
 */
export interface SiegeSpot {
    name: string
    x: number
    z: number
    half: number
    dome: { x: number; z: number }
}

/** The side of a Siege spot (m). */
export const SPOT_SIDE = 1.5

/** In the spot: within its square on the floor plan. */
export function inSpot(spot: SiegeSpot, x: number, z: number): boolean {
    return Math.abs(x - spot.x) <= spot.half && Math.abs(z - spot.z) <= spot.half
}

/**
 * Where defenders may come back: the outer ring of a 5 × 5 grid over the square (its middle left
 * out), facing out of it. The arena picks one at random where a mini fits.
 */
export function spotSpawns(spot: SiegeSpot): SiegeSpawn[] {
    const step = (spot.half - 0.2) / 2
    const spawns: SiegeSpawn[] = []
    for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) < 2) continue
            spawns.push({ x: spot.x + i * step, z: spot.z + j * step, yaw: Math.atan2(-i, -j) })
        }
    }
    return spawns
}

/** The east end of the open office and the west end by the windows: the two far ends, clear of pickups, portals and pads. */
const EAST_DOME = { x: 8.7, z: 3.4 }
const WEST_DOME = { x: -8.0, z: 0.0 }

export const SIEGE_SPOTS: readonly SiegeSpot[] = [
    {
        // Enclosed, two doorways (14 m from the dome on foot).
        name: 'Middle room',
        x: -2.2,
        z: -3.2,
        half: SPOT_SIDE / 2,
        dome: EAST_DOME,
    },
    {
        // One way in, glass sides (17 m).
        name: 'Closed office',
        x: -3.3,
        z: 3.7,
        half: SPOT_SIDE / 2,
        dome: EAST_DOME,
    },
    {
        // Open, by the big windows: the defenders build the fort (18 m).
        name: 'Meeting room',
        x: -7.6,
        z: 0.0,
        half: SPOT_SIDE / 2,
        dome: EAST_DOME,
    },
    {
        // Open to the open office (15 m).
        name: 'Ping-pong lounge',
        x: 6.1,
        z: -1.9,
        half: SPOT_SIDE / 2,
        dome: WEST_DOME,
    },
]

/** The attackers' dome: a half sphere on the floor, solid both ways while it stands (nothing in or out, shots included). */
export interface Dome {
    x: number
    z: number
    radius: number
}

/** Where the attackers come in: round the middle of the spot's dome, facing the spot. */
export function domeSpawns(spot: SiegeSpot): SiegeSpawn[] {
    const facing = Math.atan2(-(spot.x - spot.dome.x), -(spot.z - spot.dome.z))
    return [0, 1, 2, 3, 4, 5].map(i => ({
        x: spot.dome.x + Math.cos((i * Math.PI) / 3) * 0.45,
        z: spot.dome.z + Math.sin((i * Math.PI) / 3) * 0.45,
        yaw: facing,
    }))
}

/** Siege's building rule: only the defenders build, and not within SIEGE.noBuild of the dome's edge (no walling the attackers in). */
export function siegeForbidsBuild(
    siege: { spot: number; attackers: Team },
    team: Team | null,
    x: number,
    z: number
): boolean {
    if (team === siege.attackers) return true
    const { dome } = SIEGE_SPOTS[siege.spot]!
    return Math.hypot(x - dome.x, z - dome.z) < SIEGE.domeRadius + SIEGE.noBuild
}

/** Who won a siege: the most points, then the faster to them; null when even (or nobody scored). */
export function siegeWinner(points: Record<Team, number>, times: Record<Team, number | null>): Team | null {
    if (points.red !== points.blue) return points.red > points.blue ? 'red' : 'blue'
    if (times.red === null || times.blue === null || times.red === times.blue) return null
    return times.red < times.blue ? 'red' : 'blue'
}
