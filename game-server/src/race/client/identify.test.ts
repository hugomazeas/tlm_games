import { describe, expect, test } from 'bun:test'
import type { Building } from '../map/format.ts'
import { identifyByRanges } from './identify.ts'

const building = (id: number): Building => ({ id, base: 0, top: 10, outline: [] })

describe('identifyByRanges', () => {
    // Three buildings merged: vertices 0–35, 36–47 and 48 onwards.
    const identify = identifyByRanges([building(1), building(2), building(3)], [0, 36, 48])

    test('finds the building a triangle came from', () => {
        expect(identify(0)?.id).toBe(1)
        expect(identify(11)?.id).toBe(1) // vertices 33–35
        expect(identify(12)?.id).toBe(2) // vertices 36–38
        expect(identify(15)?.id).toBe(2)
        expect(identify(16)?.id).toBe(3)
        expect(identify(999)?.id).toBe(3)
    })
})
