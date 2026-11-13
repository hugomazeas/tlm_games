import * as buildings from './catalog/buildings.ts'
import * as interior from './catalog/interior.ts'
import * as plants from './catalog/plants.ts'
import * as street from './catalog/street.ts'
import * as vehicles from './catalog/vehicles.ts'
import * as yard from './catalog/yard.ts'
import type { Asset } from './types.ts'

export { place, type At } from './place.ts'
export * from './catalog/buildings.ts'
export * from './catalog/interior.ts'
export * from './catalog/plants.ts'
export * from './catalog/street.ts'
export * from './catalog/vehicles.ts'
export * from './catalog/yard.ts'

const isAsset = (value: unknown): value is Asset =>
    typeof value === 'object' && value !== null && 'id' in value && 'current' in value && 'category' in value

/** Every asset in the library, by category then as declared. */
export const ASSETS: readonly Asset[] = [buildings, vehicles, yard, plants, street, interior].flatMap(module =>
    Object.values(module).filter(isAsset)
)

export function assetById(id: string): Asset | undefined {
    return ASSETS.find(a => a.id === id)
}
