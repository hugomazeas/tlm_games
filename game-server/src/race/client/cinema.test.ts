import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { buildWorld } from '../drive/world.ts'
import { testMap } from '../drive/fixtures.ts'
import { flyover } from './cinema.ts'

const route = {
    points: [0, 0, 200, 0, 200, 200, 0, 200, 0, 0],
    along: [0, 200, 400, 600, 800],
    length: 800,
    gateAlong: [0, 200, 400, 600],
}

test('the drone starts high over the start line and ends where the chase camera is', () => {
    const world = buildWorld(testMap())
    const camera = new THREE.PerspectiveCamera()
    const chase = new THREE.Vector3(3, 12, 4)

    camera.position.copy(chase)
    flyover(route, world, camera, 0)
    expect(camera.position.x).toBeCloseTo(0)
    expect(camera.position.z).toBeCloseTo(0)
    expect(camera.position.y).toBeCloseTo(10 + 45)

    // Halfway round the lap, still up high.
    camera.position.copy(chase)
    flyover(route, world, camera, 0.5)
    expect(camera.position.y).toBeGreaterThan(40)
    expect(Math.hypot(camera.position.x - 200, camera.position.z - 200)).toBeLessThan(1)

    camera.position.copy(chase)
    flyover(route, world, camera, 1)
    expect(camera.position.distanceTo(chase)).toBeLessThan(1e-6)
})
