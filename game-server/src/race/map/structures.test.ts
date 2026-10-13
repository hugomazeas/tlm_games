import { describe, expect, test } from 'bun:test'
import type { Building } from './format.ts'
import type { NearestRoad } from './streets.ts'
import { attachParts, gateArch, partHeights, roofFromTags, wallFrom } from './structures.ts'

function bounds(ring: number[]): number[] {
    const xs = ring.filter((_, i) => i % 2 === 0)
    const zs = ring.filter((_, i) => i % 2 === 1)
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}

describe('wallFrom', () => {
    test('uses the tagged height and width', () => {
        expect(wallFrom({ height: '8', width: '4', name: 'Bastion' }, [0, 0, 10, 0])).toEqual({
            name: 'Bastion',
            points: [0, 0, 10, 0],
            height: 8,
            thickness: 4,
        })
    })

    test('falls back on a 6 m rampart, 3 m thick', () => {
        expect(wallFrom({}, [0, 0, 10, 0])).toMatchObject({ height: 6, thickness: 3 })
    })
})

describe('gateArch', () => {
    // A road heading east along z = 0, 8 m wide, through a 10 × 14 m gate.
    const road: NearestRoad = { distance: 0, x: 50, z: 0, dx: 1, dz: 0, width: 8 }
    const gate: Building = {
        id: 3,
        name: 'Porte Saint-Louis',
        base: 99,
        top: 109,
        outline: [45, -7, 55, -7, 55, 7, 45, 7],
    }

    test('leaves the carriageway open under a lintel', () => {
        const [left, right, lintel] = gateArch(gate, road, 100)
        // Pillars stop short of the road's edge (4 m) either side.
        expect(bounds(left!.outline)).toEqual([45, -7, 55, -4.3])
        expect(bounds(right!.outline)).toEqual([45, 4.3, 55, 7])
        // The lintel spans the lot, 5.5 m above the road.
        expect(bounds(lintel!.outline)).toEqual([45, -7, 55, 7])
        expect(lintel!.base).toBe(105.5)
        expect(lintel!.name).toBe('Porte Saint-Louis')
    })

    test('is stone, and tall enough for its lintel', () => {
        const parts = gateArch({ ...gate, top: 101 }, road, 100)
        for (const part of parts) {
            expect(part.colour).toBeDefined()
            expect(part.top).toBe(109)
        }
    })

    test('a gate no wider than the road still gets pillars', () => {
        const narrow = { ...gate, outline: [45, -4, 55, -4, 55, 4, 45, 4] }
        const [left, right] = gateArch(narrow, road, 100)
        expect(bounds(left!.outline)[1]).toBeCloseTo(-5.8)
        expect(bounds(right!.outline)[3]).toBeCloseTo(5.8)
    })
})

describe('roofFromTags', () => {
    test('pointed shapes are pyramids, sized by the footprint unless tagged', () => {
        expect(roofFromTags({ 'roof:shape': 'pyramidal' }, 100)).toMatchObject({ shape: 'pyramid', height: 9 })
        expect(roofFromTags({ 'roof:shape': 'dome', 'roof:height': '4' }, 100)).toMatchObject({ height: 4 })
    })

    test('sloped-all-round shapes are mansards', () => {
        const roof = roofFromTags({ 'roof:shape': 'hipped', 'roof:colour': '#6C7965' }, 400)!
        expect(roof.shape).toBe('mansard')
        expect(roof.height).toBe(6)
        expect(roof.colour).toBe('#6C7965')
    })

    test('flat or untagged roofs are none', () => {
        expect(roofFromTags({ 'roof:shape': 'flat' }, 100)).toBeUndefined()
        expect(roofFromTags({}, 100)).toBeUndefined()
    })
})

describe('partHeights', () => {
    test('from min_height to height', () => {
        expect(partHeights({ min_height: '10', height: '30' })).toEqual({ from: 10, to: 30 })
    })

    test('from levels when heights are missing', () => {
        const { from, to } = partHeights({ 'building:min_level': '2', 'building:levels': '6' })
        expect(from).toBeCloseTo(6.4)
        expect(to).toBeCloseTo(19.2)
    })

    test('never upside down', () => {
        expect(partHeights({ min_height: '20', height: '10' }).to).toBe(21)
    })
})

describe('attachParts', () => {
    const hotel: Building = { id: 1, base: 49, top: 66, outline: [0, 0, 100, 0, 100, 100, 0, 100] }

    test('hangs each part on the building around it, with its own heights and roof', () => {
        const [building] = attachParts(
            [hotel],
            [
                {
                    outline: [40, 40, 60, 40, 60, 60, 40, 60],
                    tags: { 'building:levels': '14', 'roof:shape': 'pyramidal' },
                    ground: 50,
                },
            ]
        )
        const tower = building!.detail!.parts[0]!
        expect(tower.base).toBe(49)
        expect(tower.wallTop).toBeCloseTo(50 + 14 * 3.2)
        expect(tower.roof?.shape).toBe('pyramid')
        // The building now reaches the top of the tower's roof.
        expect(building!.top).toBeCloseTo(tower.wallTop + tower.roof!.height)
    })

    test('a building gaining parts gets walls and a flat roof drawn for it', () => {
        const [building] = attachParts([hotel], [{ outline: [40, 40, 60, 40, 60, 60, 40, 60], tags: {}, ground: 50 }])
        expect(building!.detail?.wallTop).toBe(66)
        expect(building!.detail?.roof?.shape).toBe('flat')
    })

    test('a landmark that places its own parts keeps them instead of OSM’s', () => {
        const landmark: Building = {
            ...hotel,
            landmark: true,
            detail: {
                wall: '#cccccc',
                wallTop: 66,
                parts: [{ outline: [0, 0, 10, 0, 10, 10], base: 49, wallTop: 90 }],
            },
        }
        const osmPart = { outline: [40, 40, 60, 40, 60, 60, 40, 60], tags: {}, ground: 50 }
        expect(attachParts([landmark], [osmPart])[0]).toBe(landmark)

        // One that only sets colours and roof still gets OSM's parts.
        const coloursOnly = { ...landmark, detail: { ...landmark.detail!, parts: [] } }
        expect(attachParts([coloursOnly], [osmPart])[0]!.detail!.parts).toHaveLength(1)
    })

    test('a part outside every building is dropped, and buildings without parts are untouched', () => {
        const result = attachParts([hotel], [{ outline: [200, 200, 210, 200, 210, 210], tags: {}, ground: 0 }])
        expect(result[0]).toBe(hotel)
    })
})
