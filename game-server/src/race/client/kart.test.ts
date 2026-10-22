import { expect, test } from 'bun:test'
import * as THREE from 'three'
import type { KartState } from '../drive/kart.ts'
import { buildKartModel } from './kart.ts'

const colourOf = (root: THREE.Object3D, part: string) =>
    `#${((root.getObjectByName(part) as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHexString()}`

test('the body colour paints the chassis and nose, the accent the wing and suit; the helmet stays white', () => {
    const { root } = buildKartModel({ name: 'Ana', body: '#22c55e', accent: '#8b5cf6' }, false)
    expect(colourOf(root, 'chassis')).toBe('#22c55e')
    expect(colourOf(root, 'nose')).toBe('#22c55e')
    expect(colourOf(root, 'wing')).toBe('#8b5cf6')
    expect(colourOf(root, 'suit')).toBe('#8b5cf6')
    expect(colourOf(root, 'helmet')).toBe('#f2f2f2')
})

test('repainting changes both colours in place', () => {
    const kart = buildKartModel({ name: 'Ana', body: '#22c55e', accent: '#8b5cf6' }, false)
    kart.paint('#facc15', '#111827')
    expect(colourOf(kart.root, 'chassis')).toBe('#facc15')
    expect(colourOf(kart.root, 'suit')).toBe('#111827')
})

test('a landing pushes the body down on its springs, and it settles back', () => {
    const kart = buildKartModel({ name: 'Ana', body: '#22c55e', accent: '#8b5cf6' }, false)
    const body = kart.root.getObjectByName('chassis')!.parent!
    const state: KartState = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: -8,
        vz: -20,
        heading: 0,
        airborne: true,
        drift: 0,
        charge: 0,
        boost: 0,
        padCooldown: 0,
        sinking: 0,
        surface: 'road',
        nitro: 0,
        surge: 0,
    }
    const up = new THREE.Vector3(0, 1, 0)
    kart.pose(0, 0, 0, 0, up, state, 0, 1 / 60)
    kart.pose(0, 0, 0, 0, up, { ...state, airborne: false }, 0, 1 / 60)
    kart.pose(0, 0, 0, 0, up, { ...state, airborne: false }, 0, 1 / 60)
    expect(body.position.y).toBeLessThan(-0.02)

    for (let i = 0; i < 180; i++) kart.pose(0, 0, 0, 0, up, { ...state, airborne: false, vy: 0 }, 0, 1 / 60)
    expect(Math.abs(body.position.y)).toBeLessThan(0.005)
})

test('without a page to draw on, there is no name tag', () => {
    expect(
        buildKartModel({ name: 'Ana', body: '#22c55e', accent: '#8b5cf6' }, false).root.getObjectByName('name tag')
    ).toBeUndefined()
})
