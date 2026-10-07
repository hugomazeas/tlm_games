/** A seeded random source returning floats in [0, 1). */
export type Rng = () => number

/** mulberry32: tiny, fast and good enough for games. Same seed, same sequence. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0

    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function randomBetween(rng: Rng, min: number, max: number): number {
    return min + rng() * (max - min)
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
    const item = items[Math.floor(rng() * items.length)]
    if (item === undefined) throw new Error('pickOne called with no items')

    return item
}
