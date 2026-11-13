/**
 * Bakes the office's light (`light.ts`) into `office-light.b64`, next to this file:
 *
 *   bun run fps:light
 *
 * Run it after changing the office's shapes (`light.test.ts` fails until you do), and commit the
 * file with the change. It spreads the cells over every core (~a minute).
 */

import { tmpdir } from 'node:os'
import { Box3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { buildOfficeGeometry, plainOfficeMaterials, SPAWN_POINTS } from './office.js'
import {
    BAKED_FLOATS,
    type BakeInput,
    bakeCells,
    CELL,
    finishLight,
    geometryFingerprint,
    packLight,
    type Panel,
} from './light.ts'

export const LIGHT_PATH = `${import.meta.dir}/office-light.b64`
/** Rays a cell for the sky and the bounce. */
const RAYS = 96

/** The server's build of the office, and what the bake needs from it. */
export function bakeSetup(rays = RAYS): BakeInput & { fingerprint: number } {
    const office = buildOfficeGeometry({ materials: plainOfficeMaterials(), surfaces: true })
    const solid = office.collision!.solid
    const panels: Panel[] = []
    office.ceiling.updateMatrixWorld(true)
    office.ceiling.traverse(o => {
        const mesh = o as typeof o & { isMesh?: boolean; material?: { name?: string } }
        if (!mesh.isMesh || mesh.material?.name !== 'panel') return
        const box = new Box3().setFromObject(o)
        const hx = (box.max.x - box.min.x) / 2
        const hz = (box.max.z - box.min.z) / 2
        // The LED strips are too thin to light much: only the panels.
        if (hx * hz * 4 < 0.1) return
        panels.push({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, hx, hz, y: box.min.y })
    })
    const bounds = new Box3().setFromObject(office.interior)
    const origin: [number, number, number] = [
        Math.floor(bounds.min.x / CELL.x) * CELL.x,
        0,
        Math.floor(bounds.min.z / CELL.z) * CELL.z,
    ]
    const size: [number, number, number] = [
        Math.ceil((bounds.max.x - origin[0]) / CELL.x),
        Math.round(office.bounds.ceilingY / CELL.y),
        Math.ceil((bounds.max.z - origin[2]) / CELL.z),
    ]
    return {
        bvh: (solid.geometry as typeof solid.geometry & { boundsTree: MeshBVH }).boundsTree,
        surfaces: solid.userData.surfaces as Uint8Array,
        panels,
        size,
        origin,
        rays,
        fingerprint: geometryFingerprint(solid.geometry),
    }
}

interface Job {
    z0: number
    z1: number
}

async function main(): Promise<void> {
    const started = performance.now()
    const setup = bakeSetup()
    const { size } = setup
    console.log(`${size.join(' × ')} cells, ${setup.panels.length} panels`)
    const baked = new Float32Array(size[0] * size[1] * size[2] * BAKED_FLOATS)
    // `--reuse`: the rays of the last bake of this same office (kept in the temp folder), to tune
    // what `finishLight` does with them without casting them again.
    const raw = `${tmpdir()}/office-light-${setup.fingerprint}-${setup.rays}.raw`
    if (process.argv.includes('--reuse') && (await Bun.file(raw).exists())) {
        baked.set(new Float32Array(await Bun.file(raw).arrayBuffer()))
        await write(setup, baked, started)
        return
    }
    const slab = size[0] * size[1] * BAKED_FLOATS
    const jobs: Job[] = Array.from({ length: size[2] }, (_, z) => ({ z0: z, z1: z + 1 }))
    const threads = Math.max(1, Math.min(navigator.hardwareConcurrency - 1, jobs.length))
    let done = 0
    await Promise.all(
        Array.from({ length: threads }, async () => {
            const worker = new Worker(import.meta.path)
            for (let job = jobs.shift(); job; job = jobs.shift()) {
                const current = job
                const cells = await new Promise<Float32Array>(resolve => {
                    worker.onmessage = event => resolve(event.data as Float32Array)
                    worker.postMessage(current)
                })
                baked.set(cells, current.z0 * slab)
                done++
                if (done % 10 === 0) console.log(`${done} / ${size[2]} rows`)
            }
            worker.terminate()
        })
    )
    await Bun.write(raw, baked)
    await write(setup, baked, started)
}

async function write(setup: ReturnType<typeof bakeSetup>, baked: Float32Array, started: number): Promise<void> {
    const openFloor = SPAWN_POINTS.map(s => [s.position[0], s.position[2]] as const)
    const light = finishLight(baked, setup.size, setup.origin, setup.fingerprint, openFloor)
    const packed = packLight(light, bytes => Bun.gzipSync(bytes, { level: 9 }))
    await Bun.write(LIGHT_PATH, packed)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(`${LIGHT_PATH}: ${(packed.length / 1024).toFixed(0)} KB, ${seconds} s`)
}

if (!Bun.isMainThread) {
    const setup = bakeSetup()
    self.onmessage = (event: MessageEvent<Job>) => {
        const cells = bakeCells(setup, event.data.z0, event.data.z1)
        postMessage(cells, [cells.buffer])
    }
} else if (import.meta.main) {
    await main()
}
