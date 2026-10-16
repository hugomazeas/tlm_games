import { describe, expect, test } from 'bun:test'
import { freshness } from './freshness.ts'

describe('freshness', () => {
    test('the same build is fresh', () => {
        expect(freshness('b2', 'b2', null)).toBe('fresh')
        expect(freshness('b2', 'b2', 'b2')).toBe('fresh')
    })

    test('an older bundle reloads once for the new build', () => {
        expect(freshness('b2', 'b1', null)).toBe('reload')
        // It reloaded for an earlier deploy: this one still gets its reload.
        expect(freshness('b3', 'b1', 'b2')).toBe('reload')
    })

    test('still old after reloading for this build: stuck, never another reload', () => {
        expect(freshness('b2', 'b1', 'b2')).toBe('stuck')
    })
})
