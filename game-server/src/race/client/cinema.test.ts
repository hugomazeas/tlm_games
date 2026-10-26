import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { buildWorld } from '../drive/world.ts'
import { testMap } from '../drive/fixtures.ts'
import { introFor } from '../drive/trial.ts'
import { flyover } from './cinema.ts'

const route = {
    points: [0, 0, 200, 0, 200, 200, 0, 200, 0, 0],
    along: [0, 200, 400, 600, 800],
    length: 800,
    gateAlong: [0, 200, 400, 600],
}

describe('the drone flyover', () => {
    test('starts high over the start line, goes the whole lap round, ends where the chase camera is', () => {
        const world = buildWorld(testMap())
        const camera = new THREE.PerspectiveCamera()
        const chase = new THREE.Vector3(3, 12, 4)
        const at = (p: number) => {
            camera.position.copy(chase)
            flyover(route, world, camera, p, introFor(route.length))
            return camera.position.clone()
        }

        expect(at(0).x).toBeCloseTo(0)
        expect(at(0).z).toBeCloseTo(0)
        expect(at(0).y).toBeCloseTo(10 + 55)
        // Halfway round the lap (the far corner), then three quarters (the last side), still up high.
        expect(Math.hypot(at(0.5).x - 200, at(0.5).z - 200)).toBeLessThan(1)
        expect(at(0.75).x).toBeCloseTo(0, 0)
        expect(at(0.75).y).toBeGreaterThan(40)
        expect(at(1).distanceTo(chase)).toBeLessThan(1e-6)
    })

    test('a longer lap gets a longer flight and a higher drone, within limits', () => {
        expect(introFor(500)).toBe(6)
        expect(introFor(1400)).toBeCloseTo(10)
        expect(introFor(5000)).toBe(14)

        const world = buildWorld(testMap({}, undefined, 4000))
        const long = {
            points: [0, 0, 750, 0, 750, 750, 0, 750, 0, 0],
            along: [0, 750, 1500, 2250, 3000],
            length: 3000,
            gateAlong: [0, 750, 1500, 2250],
        }
        const camera = new THREE.PerspectiveCamera()
        flyover(long, world, camera, 0, introFor(long.length))
        expect(camera.position.y).toBeCloseTo(10 + 3000 / 25)
    })
})
