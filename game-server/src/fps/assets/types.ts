import type { Builder } from './kit.ts'

/**
 * The FPS asset library: whole objects (a car, a maple, a bungalow, a sofa) built in real metres
 * at their own origin, standing on y = 0, their front toward +z unless said otherwise. A map
 * places them (`place` in library.ts); the server builds the same meshes as the browser and
 * collides with them, so each asset says what's solid (the kit's `collide: false` for what's only
 * drawn). Assets are parametric: colours, sizes and options in, one asset makes many looks.
 *
 * Each asset has the `current` version (what maps use) and, while it's being reworked, a `draft`
 * the asset lab shows beside it. A draft replaces the current version once it's approved in the
 * lab (reviews.json); then its code becomes `current` and every map using the asset gets it.
 */

export type ParamValue = string | number | boolean
export type Params = Record<string, ParamValue>
/** A defaults object's types, its true/false widened to boolean (so a variant may flip it). */
export type Widened<P> = { [K in keyof P]: P[K] extends boolean ? boolean : P[K] }

/** How the lab offers a parameter: a list to pick from, or a number in a range. */
export interface ParamSpec {
    label: string
    options?: readonly ParamValue[]
    min?: number
    max?: number
    step?: number
}

export type Category = 'vehicles' | 'buildings' | 'yard' | 'trees & plants' | 'street' | 'interior'

export const CATEGORIES: readonly Category[] = ['buildings', 'vehicles', 'yard', 'trees & plants', 'street', 'interior']

export interface AssetVersion<P extends Params> {
    version: number
    /** What this version is, or what changed from the last (shown in the lab). */
    notes: string
    build(b: Builder, p: P): void
}

export interface Asset<P extends Params = Params> {
    id: string
    name: string
    category: Category
    defaults: P
    params: { [K in keyof P]?: ParamSpec }
    /** Shown side by side in the lab (each over the defaults). */
    variants: ReadonlyArray<Partial<NoInfer<Widened<P>>>>
    /** Roughly how big it is at its defaults (w, h, d in m): the lab spaces variants and frames the camera by it. */
    size: readonly [number, number, number]
    /** In the maps. */
    current: AssetVersion<P>
    /** Being reworked: shown beside `current` in the lab until it's approved. */
    draft?: AssetVersion<P>
}

/** An asset with its parameters' types inferred from its defaults. */
export function defineAsset<P extends Params>(asset: Asset<P>): Asset<P> {
    return asset
}
