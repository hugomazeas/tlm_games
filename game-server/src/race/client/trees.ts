import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { random, TREE_KINDS, type TreeKind } from '../map/trees.ts'
import type { HeightAt } from './strips.ts'

/**
 * The trees, each at its own size (map.json gives height and crown width):
 * round crowns for broadleaf trees, stacked cones for conifers, tall narrow
 * ones for columnar cultivars, small light ones for flowering trees, dark red
 * for purple-leaved maples. Leaves vary a little from tree to tree, and a few
 * have turned for the fall.
 *
 * Tens of thousands of trees: they are cut into tiles of the map, so a tile
 * out of view isn't drawn, and a tile far away uses rougher crowns.
 */

const TILE = 500
/** Tiles further than this from the camera switch to rough crowns: a quarter of the triangles. */
const ROUGH_FROM = 450

interface Shape {
    /** The crown in a unit tree: 1 m tall overall, 1 m wide. */
    crown: (detail: 0 | 1) => THREE.BufferGeometry
    /** Where the trunk stops, as a share of the height. */
    trunk: number
    leaves: number[]
}

const BROADLEAF_LEAVES = [0x4f8f46, 0x5a9a4a, 0x3f7d3a, 0x6aa352, 0x4a8a3f, 0x568c3c, 0x467f3e]
/** A few broadleaf trees have turned: muted orange, red and yellow. */
const FALL_LEAVES = [0xb07a3c, 0x9c4a35, 0x9a9a45]
const FALL_SHARE = 0.03

const SHAPES: Record<TreeKind, Shape> = {
    broadleaf: { crown: detail => blob(detail, 0.3, 1), trunk: 0.45, leaves: BROADLEAF_LEAVES },
    conifer: { crown: () => cones(), trunk: 0.2, leaves: [0x2f5e3a, 0x355f45, 0x2a5236, 0x3b6b48] },
    columnar: { crown: detail => blob(detail, 0.12, 1), trunk: 0.2, leaves: [0x4a8a46, 0x3d7a3c, 0x55924a] },
    ornamental: {
        crown: detail => blob(detail, 0.3, 1),
        trunk: 0.45,
        leaves: [0x6fae55, 0x7bb35c, 0x8fbf63, 0x86b95a],
    },
    purple: { crown: detail => blob(detail, 0.3, 1), trunk: 0.45, leaves: [0x5a2f3a, 0x6b3442, 0x4e2a33] },
}

/** A unit trunk: 1 m tall, tapering, about 6% of the crown's width across at the foot. */
const TRUNK = new THREE.CylinderGeometry(0.02, 0.028, 1, 5).translate(0, 0.5, 0)

export function buildTrees(trees: number[], heightAt: HeightAt): THREE.Group {
    const group = new THREE.Group()
    const tiles = new Map<string, number[]>()
    for (let i = 0; i + 4 < trees.length; i += 5) {
        const key = `${Math.floor(trees[i]! / TILE)},${Math.floor(trees[i + 1]! / TILE)}`
        const tile = tiles.get(key)
        if (tile) tile.push(i)
        else tiles.set(key, [i])
    }

    const bark = new THREE.MeshLambertMaterial({ color: 0x6b4f3a, flatShading: true })
    const leaves = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    const crowns = Object.fromEntries(
        TREE_KINDS.map(kind => [kind, [SHAPES[kind].crown(1), SHAPES[kind].crown(0)] as const])
    ) as Record<TreeKind, readonly [THREE.BufferGeometry, THREE.BufferGeometry]>

    for (const [key, indices] of tiles) {
        const [col, row] = key.split(',').map(Number) as [number, number]
        const centre = new THREE.Vector3((col + 0.5) * TILE, 0, (row + 0.5) * TILE)
        const lod = new THREE.LOD()
        lod.position.copy(centre)
        const near = new THREE.Group()
        const far = new THREE.Group()
        near.position.copy(centre).negate()
        far.position.copy(centre).negate()

        const dummy = new THREE.Object3D()
        const trunks = new THREE.InstancedMesh(TRUNK, bark, indices.length)
        const byKind = new Map<TreeKind, number[]>()
        indices.forEach((i, n) => {
            const [x, z, height, crown, kindIndex] = trees.slice(i, i + 5) as [number, number, number, number, number]
            const kind = TREE_KINDS[kindIndex] ?? 'broadleaf'
            dummy.position.set(x, heightAt(x, z), z)
            dummy.rotation.set(0, random(x, z, 7) * Math.PI * 2, 0)
            dummy.scale.set(crown, height * SHAPES[kind].trunk, crown)
            dummy.updateMatrix()
            trunks.setMatrixAt(n, dummy.matrix)
            const list = byKind.get(kind)
            if (list) list.push(i)
            else byKind.set(kind, [i])
        })
        trunks.computeBoundingSphere()
        // Far away, trunks are a pixel wide: only the crowns are drawn.
        near.add(trunks)

        for (const [kind, list] of byKind) {
            const [fine, rough] = crowns[kind]
            for (const [geometry, target] of [
                [fine, near],
                [rough, far],
            ] as const) {
                const mesh = new THREE.InstancedMesh(geometry, leaves, list.length)
                const colour = new THREE.Color()
                list.forEach((i, n) => {
                    const [x, z, height, crown] = trees.slice(i, i + 4) as [number, number, number, number]
                    dummy.position.set(x, heightAt(x, z), z)
                    dummy.rotation.set(0, random(x, z, 7) * Math.PI * 2, 0)
                    dummy.scale.set(crown, height, crown)
                    dummy.updateMatrix()
                    mesh.setMatrixAt(n, dummy.matrix)
                    mesh.setColorAt(n, leafColour(kind, x, z, colour))
                })
                mesh.computeBoundingSphere()
                target.add(mesh)
            }
        }

        lod.addLevel(near, 0)
        lod.addLevel(far, ROUGH_FROM)
        group.add(lod)
    }

    return group
}

function leafColour(kind: TreeKind, x: number, z: number, colour: THREE.Color): THREE.Color {
    const palette = SHAPES[kind].leaves
    const turned = kind === 'broadleaf' && random(x, z, 8) < FALL_SHARE
    const choices = turned ? FALL_LEAVES : palette
    colour.setHex(choices[Math.floor(random(x, z, 9) * choices.length)]!)

    return colour.multiplyScalar(0.9 + random(x, z, 10) * 0.2)
}

/** A rounded crown between `bottom` and `top` (shares of the height), a little lumpy so no two look machined. */
function blob(detail: 0 | 1, bottom: number, top: number): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(0.5, detail)
    const position = geometry.attributes.position!
    for (let i = 0; i < position.count; i++) {
        const bump = 1 + (random(position.getX(i) * 100, position.getZ(i) * 100, position.getY(i) * 100) - 0.5) * 0.18
        position.setXYZ(i, position.getX(i) * bump, position.getY(i) * bump, position.getZ(i) * bump)
    }
    geometry.scale(1, top - bottom, 1)
    geometry.translate(0, (top + bottom) / 2, 0)
    geometry.computeVertexNormals()

    return geometry
}

/** A conifer's crown: two stacked cones, wide at the foot. */
function cones(): THREE.BufferGeometry {
    const lower = new THREE.ConeGeometry(0.5, 0.65, 7).translate(0, 0.15 + 0.65 / 2, 0)
    const upper = new THREE.ConeGeometry(0.34, 0.55, 7).translate(0, 0.45 + 0.55 / 2, 0)
    const merged = mergeGeometries([lower.toNonIndexed(), upper.toNonIndexed()])!
    lower.dispose()
    upper.dispose()

    return merged
}
