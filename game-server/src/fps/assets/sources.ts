import type { Object3D } from 'three'

/**
 * Where a merged mesh's triangles came from, for the asset view (Esc → Settings → Show assets):
 * runs of vertices, in merge order, each from one asset (`place` tags the asset's frame with its id;
 * nested ones read "outer › inner") or drawn by the map itself (`asset` null). Kept on the merged
 * mesh as `userData.sources`.
 */
export interface SourceRun {
    start: number
    count: number
    asset: string | null
}

/** The assets `o` sits in, outermost first ("trough-planter › potted-plant"), up to `root`; null if none. */
export function assetOf(o: Object3D, root: Object3D): string | null {
    const chain: string[] = []
    for (let p: Object3D | null = o; p && p !== root; p = p.parent) {
        if (typeof p.userData.asset === 'string') chain.unshift(p.userData.asset)
    }
    return chain.length ? chain.join(' › ') : null
}

/** Adds `count` vertices from `asset` after the runs so far (joined to the last run when the same). */
export function addSource(runs: SourceRun[], count: number, asset: string | null): void {
    const last = runs[runs.length - 1]
    const start = last ? last.start + last.count : 0
    if (last && last.asset === asset) last.count += count
    else runs.push({ start, count, asset })
}

/** The run holding vertex `vertex`, or undefined past the end. */
export function sourceAt(runs: readonly SourceRun[], vertex: number): SourceRun | undefined {
    let lo = 0
    let hi = runs.length - 1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const run = runs[mid]!
        if (vertex < run.start) hi = mid - 1
        else if (vertex >= run.start + run.count) lo = mid + 1
        else return run
    }
    return undefined
}
