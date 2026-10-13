import * as THREE from 'three'
import type { Wall } from '../map/format.ts'
import { addStrip, Builder, type HeightAt, resample, rightNormals } from './strips.ts'

/**
 * Fortifications: each wall a stone rampart following the ground, its top
 * at the same height above the ground all along, sunk a little into the
 * ground so slopes never show a gap under it.
 */

const STONE = '#a99f8c'
const STEP = 3
const BURIED = -1.5

export function buildWalls(walls: Wall[], heightAt: HeightAt): THREE.Mesh {
    const builder = new Builder()

    for (const wall of walls) {
        const samples = resample(wall.points, STEP)
        const half = wall.thickness / 2
        // Doubled columns at the top corners give hard edges between the faces.
        addStrip(
            builder,
            samples,
            rightNormals(samples),
            [
                { offset: -half, lift: BURIED },
                { offset: -half, lift: wall.height },
                { offset: -half, lift: wall.height },
                { offset: half, lift: wall.height },
                { offset: half, lift: wall.height },
                { offset: half, lift: BURIED },
            ],
            heightAt
        )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3))
    geometry.setIndex(builder.indices)
    geometry.computeVertexNormals()

    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: STONE, side: THREE.DoubleSide }))
}
