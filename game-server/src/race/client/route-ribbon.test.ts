import { expect, test } from 'bun:test'
import { buildRouteRibbon } from './route-ribbon.ts'

const square = {
    points: [0, 0, 100, 0, 100, 100, 0, 100, 0, 0],
    along: [0, 100, 200, 300, 400],
    length: 400,
    gateAlong: [0, 100, 200, 300],
}

test('a ribbon the whole way round, lying on the ground, a few metres wide either side of the route', () => {
    const ribbon = buildRouteRibbon(square, () => 10)
    const position = ribbon.mesh.geometry.attributes.position!
    const along = ribbon.mesh.geometry.attributes.along!
    // Two edges every 2 m, start to finish.
    expect(position.count).toBe(2 * 201)
    expect(along.getX(position.count - 1)).toBe(400)
    for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(10.1)
    // Along the first side (z = 0): the edges sit 1.1 m off it.
    expect(Math.abs(position.getZ(20))).toBeCloseTo(1.1)
    expect(Math.abs(position.getZ(21))).toBeCloseTo(1.1)
})
