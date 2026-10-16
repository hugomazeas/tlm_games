import { describe, expect, test } from 'bun:test'
import { COSMETICS, cosmeticValue, DEFAULT_LOOK, isValidLook, lookFrom, randomLook, SLOTS } from './cosmetics.ts'
import { createRng } from './sim/rng.ts'

describe('the cosmetics catalogue', () => {
    test('every slot has unique ids and exactly one default', () => {
        for (const slot of SLOTS) {
            const ids = COSMETICS[slot].map(c => c.id)
            expect(new Set(ids).size).toBe(ids.length)
            expect(COSMETICS[slot].filter(c => c.default)).toHaveLength(1)
        }
        expect(DEFAULT_LOOK).toEqual({ colour: 'auto', hat: 'none', trail: 'ghosts', boom: 'pie' })
    })

    test('colours are hex, the rest emoji or nothing', () => {
        for (const c of COSMETICS.colour) expect(c.value === null || /^#[0-9a-f]{6}$/.test(c.value)).toBe(true)
        expect(cosmeticValue('hat', 'top')).toBe('🎩')
        expect(cosmeticValue('hat', 'none')).toBeNull()
        expect(cosmeticValue('hat', undefined)).toBeNull()
    })

    test('a look must name a known choice in every slot', () => {
        expect(isValidLook(DEFAULT_LOOK)).toBe(true)
        expect(isValidLook({ ...DEFAULT_LOOK, hat: 'crown' })).toBe(false)
        expect(isValidLook({ colour: 'auto' })).toBe(false)
        expect(isValidLook(null)).toBe(false)
    })

    test('a look from Laravel falls back to the defaults for anything unknown', () => {
        expect(lookFrom(undefined)).toEqual(DEFAULT_LOOK)
        // A look saved with a skin (they're gone) just loses it.
        expect(lookFrom({ skin: 'pumpkin', hat: 'crown', trail: 'fire' })).toEqual({ ...DEFAULT_LOOK, trail: 'fire' })
    })

    test('AI seats get valid looks', () => {
        const rng = createRng(7)
        for (let i = 0; i < 50; i++) expect(isValidLook(randomLook(rng))).toBe(true)
    })
})
