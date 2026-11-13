import { describe, expect, test } from 'bun:test'
import { Box3, type Mesh } from 'three'
import { plainErablesMaterials } from '../map/erables.ts'
import { Builder } from './kit.ts'
import { readReviews } from './lab.ts'
import { ASSETS } from './library.ts'
import { place } from './place.ts'

/** Builds one copy (no DOM), as the server does: what's drawn, what collides, its box. */
function built(build: (b: Builder) => void) {
    const b = new Builder(plainErablesMaterials())
    build(b)
    b.drawn.updateMatrixWorld(true)
    let meshes = 0
    let solid = 0
    const box = new Box3()
    b.drawn.traverse(o => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        meshes++
        let ghost = false
        for (let p: typeof o | null = o; p; p = p.parent) if (p.userData.noCollide) ghost = true
        if (!ghost) solid++
        box.expandByObject(mesh)
    })
    // Collision-only solids (a hedge's box behind its lumpy look, the ramps under stairs) count too.
    b.solidOnly.traverse(o => {
        if ((o as Mesh).isMesh) solid++
    })
    return { meshes, solid, box }
}

describe('the FPS asset library', () => {
    test('every asset has a unique id, and a draft is always a newer version than the one in the maps', () => {
        const ids = ASSETS.map(a => a.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const a of ASSETS)
            if (a.draft)
                expect({ id: a.id, newer: a.draft.version > a.current.version }).toEqual({ id: a.id, newer: true })
    })

    test('every version builds every variant without a browser, roughly the size it says', () => {
        for (const asset of ASSETS) {
            for (const version of [asset.current, asset.draft].filter(v => v !== undefined)) {
                for (const variant of asset.variants.length ? asset.variants : [{}]) {
                    const { meshes, box } = built(b => place(b, asset, variant, {}, version))
                    const label = `${asset.id} v${version.version} ${JSON.stringify(variant)}`
                    expect({ label, drawn: meshes > 0 }).toEqual({ label, drawn: true })
                    // Within reason of its declared size (variants change sizes: a generous margin).
                    const size = box.getSize(box.min.clone())
                    const [w, h, d] = asset.size
                    const biggest = Math.max(size.x, size.z)
                    expect({ label, fits: biggest < Math.max(w, d) * 3 + 2 && size.y < h * 3 + 2 }).toEqual({
                        label,
                        fits: true,
                    })
                }
            }
        }
    })

    test('what you can bump into collides: every asset but the purely decorative has solid parts', () => {
        // Small things you'd only snag on (and shoot through): drawn only, on purpose.
        const decorative = new Set([
            'shrub',
            'leaf-pile',
            'corn-stalks',
            'picture',
            'ceiling-light',
            'rug',
            'floor-lamp',
            'site-fence',
            'road-closed-sign',
            'trampoline',
            'pumpkin',
            'traffic-cone',
            'chair',
        ])
        const ghosts: string[] = []
        for (const asset of ASSETS) {
            if (decorative.has(asset.id)) continue
            for (const version of [asset.current, asset.draft].filter(v => v !== undefined)) {
                if (built(b => place(b, asset, {}, {}, version)).solid === 0)
                    ghosts.push(`${asset.id} v${version.version}`)
            }
        }
        expect(ghosts).toEqual([])
    })

    test('the same asset in the same spot comes out the same (server and browser agree)', () => {
        for (const asset of ASSETS) {
            const count = () => {
                const b = new Builder(plainErablesMaterials())
                place(b, asset, {}, { x: 3, z: -2, ry: 0.4 })
                let positions = 0
                b.drawn.traverse(o => {
                    const mesh = o as Mesh
                    if (mesh.isMesh) positions += mesh.geometry.attributes.position!.count
                })
                return positions
            }
            expect({ id: asset.id, same: count() === count() }).toEqual({ id: asset.id, same: true })
        }
    })

    test('verdicts in reviews.json are about assets the library has', async () => {
        const ids = new Set(ASSETS.map(a => a.id))
        for (const id of Object.keys(await readReviews())) expect(ids.has(id)).toBe(true)
    })
})
