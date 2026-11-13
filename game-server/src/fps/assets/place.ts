import type { Builder } from './kit.ts'
import type { Asset, AssetVersion, Params, Widened } from './types.ts'

/** Where an asset goes in a map (or in another asset): its origin, and its turn about +y. */
export interface At {
    x?: number
    y?: number
    z?: number
    ry?: number
}

/** A seed from an asset's id and spot: the same asset in the same spot always comes out the same. */
function seedOf(id: string, at: At): number {
    let h = 2166136261
    for (const c of `${id}@${(at.x ?? 0).toFixed(2)},${(at.z ?? 0).toFixed(2)}`)
        h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    return h >>> 0
}

/**
 * Builds an asset (its current version: what maps use, or `version` when given, the lab's draft)
 * at a spot, its parameters over its defaults. Its own frame: everything it puts goes there.
 */
export function place<P extends Params>(
    b: Builder,
    asset: Asset<P>,
    params: Partial<Widened<P>>,
    at: At = {},
    version: AssetVersion<P> = asset.current
): void {
    const p = { ...asset.defaults, ...params } as P
    b.place(at, () => version.build(b, p), seedOf(asset.id, at))
}
