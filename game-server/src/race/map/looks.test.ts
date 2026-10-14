import { describe, expect, test } from 'bun:test'
import type { Building } from './format.ts'
import { applyLook, parseLooks } from './looks.ts'

const building: Building = { id: 7, base: 99, top: 120, outline: [0, 0, 10, 0, 10, 10, 0, 10] }

describe('parseLooks', () => {
    test('accepts colours and windows by OSM element, and drops $schema', () => {
        const looks = parseLooks(
            {
                $schema: '../../looks.schema.json',
                buildings: {
                    'way/7': { wall: '#a0522d', roof: '#8a8a86' },
                    'relation/9': { windows: { floor: 3.5, spacing: 2, style: 'curtain' }, glass: '#4a6c8c' },
                    'way/11': { windows: false },
                },
            },
            'looks.json'
        )
        expect(Object.keys(looks.buildings)).toEqual(['way/7', 'relation/9', 'way/11'])
        expect('$schema' in looks).toBe(false)
    })

    test('lists every problem', () => {
        let message = ''
        try {
            parseLooks(
                {
                    buildings: {
                        'node/1': {},
                        'way/2': { wall: 'red', height: 10, windows: { floor: 3, spacing: 2, style: 'gothic' } },
                    },
                },
                'looks.json'
            )
        } catch (error) {
            message = (error as Error).message
        }
        expect(message).toContain('node/1')
        expect(message).toContain('way/2.wall')
        expect(message).toContain('unknown key "height"')
        expect(message).toContain('way/2.windows.style')
    })
})

describe('applyLook', () => {
    test('colours the walls, and puts a flat roof of its colour on a building without one', () => {
        expect(applyLook(building, { wall: '#a0522d', roof: '#8a8a86' })).toMatchObject({
            colour: '#a0522d',
            roof: { shape: 'flat', height: 0, colour: '#8a8a86' },
        })
    })

    test('a measured pitched roof keeps its shape and takes the colour', () => {
        const house = { ...building, roof: { shape: 'gable' as const, height: 4, colour: '#5d5a57' } }
        expect(applyLook(house, { roof: '#3f4a52' }).roof).toEqual({ shape: 'gable', height: 4, colour: '#3f4a52' })
    })

    test('windows can be taken away; a landmark ignores its look', () => {
        expect(applyLook(building, { windows: false }).windows).toBe(false)
        const landmark = { ...building, landmark: true as const }
        expect(applyLook(landmark, { wall: '#ffffff' })).toBe(landmark)
    })
})
