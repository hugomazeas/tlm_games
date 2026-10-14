import type { RaceMap } from '../map/format.ts'

/**
 * A small made-up map for the driving tests: 1 km square, flat at 10 m
 * unless `height` says otherwise, with nothing on it but what a test adds.
 */
export function testMap(
    overrides: Partial<RaceMap> = {},
    height: (x: number, z: number) => number = () => 10
): RaceMap {
    const cell = 10
    const cols = 101
    const rows = 101
    const size = (cols - 1) * cell
    const heights: number[] = []
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) heights.push(height(col * cell - size / 2, row * cell - size / 2))
    }

    return {
        name: 'Test',
        attribution: '',
        origin: { lat: 0, lon: 0 },
        width: size,
        depth: size,
        terrain: { cols, rows, cell, heights, waterLevel: 0 },
        buildings: [],
        roads: [],
        areas: [],
        junctions: [],
        crossings: [],
        stops: [],
        walls: [],
        props: { trees: [], benches: [], signals: [], busStops: [] },
        decor: { shapes: [], paint: [] },
        ...overrides,
    }
}

/** A square building centred at x, z. */
export function box(id: number, x: number, z: number, half: number, base = 9, top = 30): RaceMap['buildings'][number] {
    return { id, base, top, outline: [x - half, z - half, x + half, z - half, x + half, z + half, x - half, z + half] }
}
