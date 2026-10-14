import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Decor, Shape } from '../map/format.ts'

/**
 * The decor's shapes (fountains, statues, hedges, fences, lamps, flowerbeds…)
 * as a handful of meshes: every shape of one colour merged into one, water
 * see-through. A few thousand blocks cost a few dozen draw calls.
 */

export function buildDecor(decor: Decor): THREE.Group {
    const group = new THREE.Group()
    const batches = new Map<string, THREE.BufferGeometry[]>()

    for (const shape of decor.shapes) {
        const geometry = shapeGeometry(shape)
        if (!geometry) continue
        const key = `${shape.colour}|${shape.water ? 'water' : 'solid'}`
        const batch = batches.get(key)
        if (batch) batch.push(geometry)
        else batches.set(key, [geometry])
    }

    for (const [key, geometries] of batches) {
        const [colour, kind] = key.split('|') as [string, string]
        const merged = mergeGeometries(geometries)
        for (const geometry of geometries) geometry.dispose()
        if (!merged) continue
        const material =
            kind === 'water'
                ? new THREE.MeshLambertMaterial({ color: colour, transparent: true, opacity: 0.55, depthWrite: false })
                : new THREE.MeshLambertMaterial({ color: colour })
        group.add(new THREE.Mesh(merged, material))
    }

    return group
}

/** One shape's triangles in map coordinates, positions and normals only so they all merge. */
export function shapeGeometry(shape: Shape): THREE.BufferGeometry | null {
    const { width, depth, height } = shape
    let geometry: THREE.BufferGeometry

    switch (shape.shape) {
        case 'box':
            geometry = new THREE.BoxGeometry(width, height, depth).translate(0, height / 2, 0)
            break
        case 'cylinder':
        case 'cone': {
            const bottom = width / 2
            const top = shape.shape === 'cone' ? 0 : bottom * (shape.taper ?? 1)
            const segments = Math.max(width, depth) > 6 ? 28 : Math.max(width, depth) > 1 ? 16 : 8
            geometry = new THREE.CylinderGeometry(top, bottom, height, segments)
                .translate(0, height / 2, 0)
                .scale(1, 1, width > 0 ? depth / width : 1)
            break
        }
        case 'sphere':
            geometry = new THREE.SphereGeometry(0.5, 12, 8).scale(width, height, depth).translate(0, height / 2, 0)
            break
        case 'pyramid':
            geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
                .rotateY(Math.PI / 4)
                .scale(width, height, depth)
                .translate(0, height / 2, 0)
            break
        case 'prism': {
            const outline = shape.outline ?? []
            if (outline.length < 6) return null
            const points: THREE.Vector2[] = []
            for (let i = 0; i < outline.length; i += 2) points.push(new THREE.Vector2(outline[i]!, -outline[i + 1]!))
            geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: height, bevelEnabled: false })
            // Drawn in (x, -z) and extruded along +z; tipped so it rises from its base.
            geometry.rotateX(-Math.PI / 2).translate(0, shape.y, 0)
            return plain(geometry)
        }
    }

    geometry.rotateY(shape.turn).translate(shape.x, shape.y, shape.z)

    return plain(geometry)
}

/** Unindexed, with positions and normals only. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    for (const name of Object.keys(flat.attributes)) {
        if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
    }
    if (!flat.attributes.normal) flat.computeVertexNormals()

    return flat
}
