/**
 * A kart's livery, from the garage (the Hub's racing_karts): a race number on
 * its sides, a pattern painted in the accent colour, sponsor stickers and the
 * sponsor on the rear wing. `PATTERNS` must match RacingKart::PATTERNS, and
 * SPONSOR_LENGTH its validation.
 */

export const PATTERNS = ['none', 'stripes', 'flames', 'maple', 'checker', 'lightning'] as const
export type Pattern = (typeof PATTERNS)[number]

export const PATTERN_LABELS: Record<Pattern, string> = {
    none: 'Plain',
    stripes: 'Racing stripes',
    flames: 'Flames',
    maple: 'Maple leaf',
    checker: 'Checkered',
    lightning: 'Lightning',
}

/** The rear wing's sponsor is at most this many characters; without one it's the dépanneur's. */
export const SPONSOR_LENGTH = 10
export const DEFAULT_SPONSOR = 'DÉPANNEUR TLM'

export interface Livery {
    /** 0–99 on the sides and nose; null for none. */
    number: number | null
    pattern: Pattern
    stickers: boolean
    /** The rear wing's sponsor (1–10 characters); null for the dépanneur. */
    sponsor: string | null
}

export const PLAIN: Livery = { number: null, pattern: 'none', stickers: true, sponsor: null }

/** A sponsor as it can be painted: trimmed, at most SPONSOR_LENGTH characters; null when empty. */
export function sponsorFrom(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const text = [...value.trim()].slice(0, SPONSOR_LENGTH).join('').trimEnd()

    return text === '' ? null : text
}

/** A livery from what the Hub sent, anything odd falling back to plain. */
export function liveryFrom(value: Partial<Record<keyof Livery, unknown>> | null | undefined): Livery {
    const number = value?.number
    const pattern = PATTERNS.find(p => p === value?.pattern)

    return {
        number:
            Number.isInteger(number) && (number as number) >= 0 && (number as number) <= 99 ? (number as number) : null,
        pattern: pattern ?? 'none',
        stickers: typeof value?.stickers === 'boolean' ? value.stickers : true,
        sponsor: sponsorFrom(value?.sponsor),
    }
}
