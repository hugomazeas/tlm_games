import { type KartMods, NITRO_CHARGE, TOP_SPEED } from './kart.ts'
import { pointAt, type Route } from './route.ts'

/**
 * Snacks: the office dépanneur's real items, lying on the streets during a
 * race. Drive through one and you eat it, there and then: what it does
 * matches the food (a Coke is a sugar rush then a crash, chips make you fat
 * and slow, a Drumsticks gives everyone else brain freeze…). How often each
 * turns up follows the fridge's stock (`stock`, as `dep items` gave it on
 * 2026-10-22), square-rooted so a rare one still happens.
 *
 * Pure, like the rest of drive/: the server places them and says who ate
 * what; each tab applies the effects to its own kart (`modsFor`).
 */

export type SnackKind =
    | 'coke'
    | 'bubly'
    | 'chips'
    | 'montellier'
    | 'fuze'
    | 'chocolate'
    | 'kirkland'
    | 'gokrisp'
    | 'trailmix'
    | 'popcorn'
    | 'drumsticks'
    | 'chipwich'

export interface SnackInfo {
    /** As the dépanneur sells it. */
    name: string
    /** Cents, for the receipt. */
    price: number
    stock: number
    /** What it does, in a few words (the welcome screen and the eating banner). */
    effect: string
    /** The banner when you eat it. */
    shout: string
    /** Seconds it lasts on you (0: instant). */
    seconds: number
}

export const SNACKS: Record<SnackKind, SnackInfo> = {
    coke: {
        name: 'Coca-Cola',
        price: 150,
        stock: 5,
        effect: 'Sugar rush: +35 km/h for 3 s… then the crash, −15 km/h for 3 s.',
        shout: 'SUGAR RUSH!',
        seconds: 6,
    },
    bubly: {
        name: 'Bubly',
        price: 100,
        stock: 18,
        effect: 'Light and bubbly: +10 km/h for 10 s, floating on bubbles.',
        shout: 'Bubbly!',
        seconds: 10,
    },
    chips: {
        name: 'Petit sac de chips',
        price: 85,
        stock: 26,
        effect: 'You get fat: −15 km/h for 8 s, and you drop crumbs that slow whoever follows.',
        shout: 'Crunch… you feel heavier',
        seconds: 8,
    },
    montellier: {
        name: 'Eau pétillante Montellier',
        price: 125,
        stock: 21,
        effect: 'Hydrate: washes off every bad effect on you, with a sparkling little push.',
        shout: 'Refreshed!',
        seconds: 1.5,
    },
    fuze: {
        name: 'Thé Glacé Fuze',
        price: 150,
        stock: 19,
        effect: 'Iced: for 6 s you leave a frost trail. Anyone driving on it slides like on black ice.',
        shout: 'Ice ice baby',
        seconds: 6,
    },
    chocolate: {
        name: 'Petit chocolat',
        price: 50,
        stock: 97,
        effect: 'A little treat: +25% nitro charge.',
        shout: '+25% nitro',
        seconds: 0,
    },
    kirkland: {
        name: 'Barres tendres Kirkland',
        price: 50,
        stock: 29,
        effect: 'Slow-release energy: +5% top speed for 20 s. Boring, but it lasts.',
        shout: 'Slow energy',
        seconds: 20,
    },
    gokrisp: {
        name: 'Barres protéinées Go Krisp',
        price: 200,
        stock: 5,
        effect: 'Protein: your nitro recharges 3× faster for 15 s.',
        shout: 'GAINS! Nitro ×3',
        seconds: 15,
    },
    trailmix: {
        name: 'TrailMix',
        price: 175,
        stock: 16,
        effect: 'Hiking mode: full speed off-road for 8 s, and you scatter nuts that bounce whoever follows.',
        shout: 'Off-road mode',
        seconds: 8,
    },
    popcorn: {
        name: 'Sac de popcorn',
        price: 100,
        stock: 18,
        effect: "Movie time: everyone else's camera turns to watch you for 2.5 s.",
        shout: 'All eyes on you 🍿',
        seconds: 2.5,
    },
    drumsticks: {
        name: 'Drumsticks',
        price: 200,
        stock: 1,
        effect: 'Brain freeze: every other kart freezes for 2 s. The rarest snack in the fridge.',
        shout: 'BRAIN FREEZE (for everyone else)',
        seconds: 2,
    },
    chipwich: {
        name: 'Chipwich',
        price: 300,
        stock: 6,
        effect: 'Sandwich: you jump ahead of the kart in front of you. In the lead, a full nitro instead.',
        shout: 'Sandwiched in!',
        seconds: 0,
    },
}

export const SNACK_KINDS = Object.keys(SNACKS) as SnackKind[]

/** For banners, the effects bar and the receipt. */
export const SNACK_ICONS: Record<SnackKind, string> = {
    coke: '🥤',
    bubly: '🫧',
    chips: '🥔',
    montellier: '💧',
    fuze: '🧊',
    chocolate: '🍫',
    kirkland: '🌾',
    gokrisp: '💪',
    trailmix: '🥾',
    popcorn: '🍿',
    drumsticks: '🍦',
    chipwich: '🍪',
}

/** A snack lying on the track: an id within the race, what it is, where. */
export interface SnackSpot {
    id: number
    kind: SnackKind
    x: number
    z: number
}

/**
 * How many snacks, the host's slider: 0 none, MAX_DENSITY total mayhem (one
 * every 32 m of route); in between, one every 320 / density metres. Each lies
 * anywhere across the street, up to SPREAD off the route's line either way:
 * the middle, a lane, the kerb.
 */
export const MAX_DENSITY = 10
export const DEFAULT_DENSITY = 3
const SPACING_AT_ONE = 320
const SPREAD = 6.5
/** Not on the start line: the grid is busy enough. */
const CLEAR_START = 40
/** An eaten snack comes back after this long. */
export const RESPAWN_MS = 12_000
/** You eat a snack when your kart comes this close to it. */
export const EAT_REACH = 2.6

/** One race's snacks along its route at `density` (0–10), from `random` (0 ≤ x < 1). */
export function placeSnacks(
    route: Route,
    random: () => number,
    density: number,
    kinds: readonly SnackKind[] = SNACK_KINDS
): SnackSpot[] {
    const spots: SnackSpot[] = []
    if (density <= 0 || kinds.length === 0) return spots
    const spacing = SPACING_AT_ONE / Math.min(MAX_DENSITY, density)
    const first = CLEAR_START + random() * spacing
    for (let along = first; along < route.length - spacing / 3; along += spacing * (0.6 + random() * 0.8)) {
        const { x, z, heading } = pointAt(route, along)
        const side = (random() * 2 - 1) * SPREAD
        spots.push({
            id: spots.length,
            kind: pickKind(random(), kinds),
            x: x + Math.cos(heading) * side,
            z: z - Math.sin(heading) * side,
        })
    }

    return spots
}

/** A kind, as often as the fridge's stock says (square-rooted). */
export function pickKind(roll: number, kinds: readonly SnackKind[] = SNACK_KINDS): SnackKind {
    const weights = kinds.map(kind => Math.sqrt(SNACKS[kind].stock))
    let left = roll * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < kinds.length; i++) {
        left -= weights[i]!
        if (left < 0) return kinds[i]!
    }

    return kinds[kinds.length - 1]!
}

/** What is acting on your kart: snacks you ate, and what others did to you. */
export type Effect =
    | { kind: Exclude<SnackKind, 'popcorn' | 'drumsticks' | 'chipwich' | 'chocolate'>; age: number }
    /** Another kart's Drumsticks. */
    | { kind: 'frozen'; age: number }

/** On a trail someone left: frost (slide), crumbs (slow), nuts (bumps). */
export interface Underfoot {
    frost: boolean
    crumbs: boolean
    nuts: boolean
}

const KMH = 1 / 3.6
const FROZEN_SECONDS = 2
/** Effects that are bad for you: what a Montellier washes off. */
export const BAD: ReadonlySet<Effect['kind']> = new Set(['chips', 'frozen'])

/** How long an effect lasts, seconds. */
export function lasts(kind: Effect['kind']): number {
    return kind === 'frozen' ? FROZEN_SECONDS : SNACKS[kind].seconds
}

/** The physics tweaks from everything on you this step. */
export function modsFor(effects: readonly Effect[], underfoot: Underfoot): KartMods {
    const mods: Required<KartMods> = { limit: 0, accel: 0, offroadAsRoad: false, nitroRate: 1, grip: 1, frozen: false }
    for (const effect of effects) {
        switch (effect.kind) {
            case 'coke':
                // The rush, then the crash.
                if (effect.age < 3) {
                    mods.limit += 35 * KMH
                    mods.accel += 12
                } else {
                    mods.limit -= 15 * KMH
                }
                break
            case 'bubly':
                mods.limit += 10 * KMH
                mods.accel += 3
                break
            case 'chips':
                mods.limit -= 15 * KMH
                break
            case 'montellier':
                mods.limit += 8 * KMH
                mods.accel += 4
                break
            case 'fuze':
                mods.grip *= 1.3
                break
            case 'kirkland':
                mods.limit += TOP_SPEED * 0.05
                mods.accel += 1.5
                break
            case 'gokrisp':
                mods.nitroRate *= 3
                break
            case 'trailmix':
                mods.offroadAsRoad = true
                break
            case 'frozen':
                mods.frozen = true
                break
        }
    }
    if (underfoot.frost) mods.grip *= 0.3
    if (underfoot.crumbs) mods.limit -= 10 * KMH

    return mods
}

/** A chocolate's 25%: how much nitro charge it adds, seconds. */
export const CHOCOLATE_NITRO = NITRO_CHARGE * 0.25
