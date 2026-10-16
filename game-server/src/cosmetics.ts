import catalogue from './cosmetics.json'
import { pickOne, type Rng } from './sim/rng.ts'

/**
 * How a player dresses up: their colour, hat, trail and boom. The potato is always a potato.
 * Cosmetic only: the simulation never sees it.
 *
 * The catalogue is `cosmetics.json`, which Laravel reads too (App\Games\HotPotato\Services\Cosmetics)
 * to validate what players pick, so the two never drift.
 */

export const SLOTS = ['colour', 'hat', 'trail', 'boom'] as const
export type Slot = (typeof SLOTS)[number]

export interface Cosmetic {
    id: string
    label: string
    /** A hex colour (colour) or an emoji; null for "auto" and "none". */
    value: string | null
    default?: boolean
}

/** One id per slot. */
export type Look = Record<Slot, string>

export const COSMETICS: Record<Slot, Cosmetic[]> = catalogue

export const DEFAULT_LOOK: Look = Object.fromEntries(
    SLOTS.map(slot => [slot, COSMETICS[slot].find(c => c.default)?.id ?? COSMETICS[slot][0]?.id ?? ''])
) as Look

export function isValidLook(look: unknown): look is Look {
    if (typeof look !== 'object' || look === null) return false
    const record = look as Record<string, unknown>
    return SLOTS.every(slot => COSMETICS[slot].some(c => c.id === record[slot]))
}

/** A look from Laravel, or the defaults for anything missing or unknown. */
export function lookFrom(raw: unknown): Look {
    const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    return Object.fromEntries(
        SLOTS.map(slot => {
            const id = record[slot]
            return [slot, COSMETICS[slot].some(c => c.id === id) ? id : DEFAULT_LOOK[slot]]
        })
    ) as Look
}

/** An AI seat's outfit: any choice in every slot. */
export function randomLook(rng: Rng): Look {
    return Object.fromEntries(SLOTS.map(slot => [slot, pickOne(rng, COSMETICS[slot]).id])) as Look
}

/** The value of a slot's choice: a colour or an emoji, null for "auto" and "none". */
export function cosmeticValue(slot: Slot, id: string | undefined): string | null {
    return COSMETICS[slot].find(c => c.id === id)?.value ?? null
}
