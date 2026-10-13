import { expect, test } from 'bun:test'
import type * as THREE from 'three'
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

test('without a page to draw on, there is no name tag', () => {
    expect(
        buildKartModel({ name: 'Ana', body: '#22c55e', accent: '#8b5cf6' }, false).root.getObjectByName('name tag')
    ).toBeUndefined()
})
