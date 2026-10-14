import type { Area } from './format.ts'

/**
 * Trees and how big they are. They come from three places, most trusted first:
 *
 * - the city of Québec's inventory ("Arbres répertoriés", CC BY 4.0): the
 *   species and trunk diameter of every street and park tree it looks after;
 * - OpenStreetMap's tree nodes, mostly on land the city doesn't count (the
 *   Plains are federal), sized from their tags or as mature park trees;
 * - mapped woods, filled with trees about as densely as they stand, so a
 *   wood reads as a wood from the air rather than a green floor.
 *
 * Sizes follow the trunk: a sapling on a new street is 6 m tall, a century-old
 * elm on Grande Allée over 20 m with a crown as wide. Everything is
 * deterministic, so a rebuild makes the same forest.
 */

/** How a tree is drawn: its crown's shape and its leaves' colour. Stored in map.json as the index here. */
export const TREE_KINDS = ['broadleaf', 'conifer', 'columnar', 'ornamental', 'purple'] as const
export type TreeKind = (typeof TREE_KINDS)[number]

export interface Tree {
    x: number
    z: number
    /** Ground to the top of the crown, in metres. */
    height: number
    /** Width of the crown, in metres. */
    crown: number
    kind: TreeKind
}

/** A tree from the city's inventory, as the snapshot keeps it. */
export interface CityTree {
    lat: number
    lon: number
    /** The Latin name, cultivar included ("Acer platanoides 'Crimson King'"). */
    taxon: string
    conifer?: true
    /** Trunk diameter in centimetres, at breast height unless `stump`. */
    diameter?: number
    /** Measured at the stump (small trees and shrubs), which reads wider than at breast height. */
    stump?: true
}

const CONIFERS = [
    'Picea',
    'Pinus',
    'Larix',
    'Thuja',
    'Tsuga',
    'Abies',
    'Juniperus',
    'Taxus',
    'Pseudotsuga',
    'Chamaecyparis',
]
/** Small flowering trees: crabapples, lilacs, serviceberries, hawthorns. */
const ORNAMENTALS = [
    'Malus',
    'Syringa',
    'Amelanchier',
    'Crataegus',
    'Prunus',
    'Cercis',
    'Cornus',
    'Magnolia',
    'Rhus',
    'Elaeagnus',
    'Maackia',
    'Pyrus',
]
const COLUMNAR = /fastigiat|column|spire|sentry|upright|regal prince|armstrong|bowhall/i
const PURPLE = /crimson king|royal red|schwedleri|faassen|purpure|atropurpure|royalty|thundercloud/i

export function treeKind(taxon: string, conifer: boolean): TreeKind {
    const genus = taxon.trim().split(/\s+/)[0] ?? ''
    if (COLUMNAR.test(taxon) || genus === 'Thuja') return 'columnar'
    if (conifer || CONIFERS.includes(genus)) return 'conifer'
    if (PURPLE.test(taxon)) return 'purple'
    if (ORNAMENTALS.includes(genus)) return 'ornamental'

    return 'broadleaf'
}

/** How tall each kind grows at most (above a 2 m start), and how fast it gets there with the trunk's diameter. */
const GROWTH: Record<TreeKind, { tallest: number; rate: number }> = {
    broadleaf: { tallest: 24, rate: 35 },
    conifer: { tallest: 22, rate: 30 },
    columnar: { tallest: 18, rate: 30 },
    ornamental: { tallest: 7, rate: 20 },
    purple: { tallest: 18, rate: 35 },
}
/** A tree the inventory gives no diameter for: a typical one. */
const TYPICAL_DIAMETER = 20

/**
 * Height and crown from the trunk's diameter (cm at breast height): heights
 * level off as trees mature, crowns keep widening. Elms spread into vases.
 */
export function treeSize(kind: TreeKind, diameter: number | undefined, taxon = ''): { height: number; crown: number } {
    const d = diameter && diameter > 0 ? diameter : TYPICAL_DIAMETER
    const { tallest, rate } = GROWTH[kind]
    const height = 2 + tallest * (1 - Math.exp(-d / rate))

    let crown: number
    switch (kind) {
        case 'conifer':
            crown = clamp(height * 0.4, 1.5, 9)
            break
        case 'columnar':
            crown = clamp(height * 0.28, 1.2, 5)
            break
        case 'ornamental':
            crown = clamp(1 + d * 0.25, 1.5, 8)
            break
        default:
            crown = clamp(1.2 + d * 0.22, 1.5, 22) * (taxon.startsWith('Ulmus') ? 1.15 : 1)
    }

    return { height: round(height), crown: round(crown) }
}

/** A city tree at map position x, z. Stump diameters read about a fifth wider than at breast height. */
export function cityTree(tree: CityTree, x: number, z: number): Tree {
    const kind = treeKind(tree.taxon, tree.conifer === true)
    const diameter = tree.diameter && tree.stump ? tree.diameter * 0.8 : tree.diameter

    return { x, z, kind, ...treeSize(kind, diameter, tree.taxon) }
}

/**
 * An OSM tree: its tagged height and crown when it has them, otherwise a
 * mature park tree, 12–18 m, varied by where it stands.
 */
export function osmTree(tags: Record<string, string>, x: number, z: number): Tree {
    const kind: TreeKind = tags.leaf_type === 'needleleaved' ? 'conifer' : 'broadleaf'
    const taggedHeight = parseFloat(tags.height ?? '')
    const taggedCrown = parseFloat(tags.diameter_crown ?? '')
    const circumference = parseFloat(tags.circumference ?? '')
    const r = random(x, z, 1)

    const sized = treeSize(kind, circumference > 0 ? (circumference / Math.PI) * 100 : 45 + r * 30)
    const height = taggedHeight > 0 ? taggedHeight : sized.height
    const crown = taggedCrown > 0 ? taggedCrown : sized.crown

    return { x, z, kind, height: round(height), crown: round(crown) }
}

/** An OSM tree this close to a city tree is the same tree, mapped twice. */
export const SAME_TREE = 4

/** The city's trees, and the OSM trees that aren't already among them. */
export function mergeTrees(city: Tree[], osm: Tree[], same = SAME_TREE): Tree[] {
    const index = new PointIndex(same)
    for (const tree of city) index.add(tree.x, tree.z)

    return [...city, ...osm.filter(tree => !index.within(tree.x, tree.z, same))]
}

/** Trees in a wood stand about this far apart. */
const WOOD_SPACING = 7
/** …and never closer than this to a tree already there. */
const WOOD_CLEARANCE = 3.5
/** Share of conifers in a generated wood: Québec's mixed forest. */
const WOOD_CONIFERS = 0.3

/**
 * Fills the woods with trees: one per cell of a grid fixed to the map, jittered
 * so no rows show, skipping cells where `blocked` says something is (a road, a
 * path, a building, water) or a tree already stands.
 */
export function fillWoods(areas: Area[], blocked: (x: number, z: number) => boolean, existing: Tree[]): Tree[] {
    const index = new PointIndex(WOOD_SPACING)
    for (const tree of existing) index.add(tree.x, tree.z)
    const placed: Tree[] = []

    for (const area of areas) {
        if (area.kind !== 'wood') continue
        const ring = area.outline
        let minX = Infinity
        let minZ = Infinity
        let maxX = -Infinity
        let maxZ = -Infinity
        for (let i = 0; i < ring.length; i += 2) {
            minX = Math.min(minX, ring[i]!)
            maxX = Math.max(maxX, ring[i]!)
            minZ = Math.min(minZ, ring[i + 1]!)
            maxZ = Math.max(maxZ, ring[i + 1]!)
        }

        for (let col = Math.floor(minX / WOOD_SPACING); col * WOOD_SPACING <= maxX; col++) {
            for (let row = Math.floor(minZ / WOOD_SPACING); row * WOOD_SPACING <= maxZ; row++) {
                const x = round((col + 0.15 + random(col, row, 2) * 0.7) * WOOD_SPACING)
                const z = round((row + 0.15 + random(col, row, 3) * 0.7) * WOOD_SPACING)
                if (!insideRing(ring, x, z) || blocked(x, z) || index.within(x, z, WOOD_CLEARANCE)) continue

                const kind: TreeKind = random(col, row, 4) < WOOD_CONIFERS ? 'conifer' : 'broadleaf'
                placed.push({ x, z, kind, ...treeSize(kind, 30 + random(col, row, 5) * 40) })
                index.add(x, z)
            }
        }
    }

    return placed
}

/** A generated tree keeps this far from a road's or a path's edge. */
const ROAD_CLEARANCE = 1.5
/** Cells of the grid that says where a generated tree can't go, in metres. */
const BLOCK_CELL = 2

/**
 * Where generated trees can't stand: on a road or path (and a little either
 * side), inside a building, or in water. A grid over the whole map, filled once.
 */
export function blockedGround(
    width: number,
    depth: number,
    roads: { width: number; points: number[] }[],
    footprints: number[][],
    isWater: (x: number, z: number) => boolean
): (x: number, z: number) => boolean {
    const cols = Math.ceil(width / BLOCK_CELL)
    const rows = Math.ceil(depth / BLOCK_CELL)
    const cells = new Uint8Array(cols * rows)
    const toCol = (x: number) => (x + width / 2) / BLOCK_CELL
    const toRow = (z: number) => (z + depth / 2) / BLOCK_CELL

    for (const road of roads) {
        const half = road.width / 2 + ROAD_CLEARANCE
        for (let i = 0; i + 3 < road.points.length; i += 2) {
            const [x1, z1, x2, z2] = road.points.slice(i, i + 4) as [number, number, number, number]
            const c0 = Math.max(0, Math.floor(toCol(Math.min(x1, x2) - half)))
            const c1 = Math.min(cols - 1, Math.floor(toCol(Math.max(x1, x2) + half)))
            const r0 = Math.max(0, Math.floor(toRow(Math.min(z1, z2) - half)))
            const r1 = Math.min(rows - 1, Math.floor(toRow(Math.max(z1, z2) + half)))
            const lx = x2 - x1
            const lz = z2 - z1
            const lengthSquared = lx * lx + lz * lz || 1
            for (let row = r0; row <= r1; row++) {
                for (let col = c0; col <= c1; col++) {
                    const x = (col + 0.5) * BLOCK_CELL - width / 2
                    const z = (row + 0.5) * BLOCK_CELL - depth / 2
                    const t = Math.min(1, Math.max(0, ((x - x1) * lx + (z - z1) * lz) / lengthSquared))
                    if (Math.hypot(x - x1 - lx * t, z - z1 - lz * t) <= half) cells[row * cols + col] = 1
                }
            }
        }
    }

    for (const ring of footprints) {
        let minX = Infinity
        let minZ = Infinity
        let maxX = -Infinity
        let maxZ = -Infinity
        for (let i = 0; i < ring.length; i += 2) {
            minX = Math.min(minX, ring[i]!)
            maxX = Math.max(maxX, ring[i]!)
            minZ = Math.min(minZ, ring[i + 1]!)
            maxZ = Math.max(maxZ, ring[i + 1]!)
        }
        // The cells round the footprint's box whose centre falls inside it.
        for (
            let row = Math.max(0, Math.floor(toRow(minZ)) - 1);
            row <= Math.min(rows - 1, Math.ceil(toRow(maxZ)));
            row++
        ) {
            for (
                let col = Math.max(0, Math.floor(toCol(minX)) - 1);
                col <= Math.min(cols - 1, Math.ceil(toCol(maxX)));
                col++
            ) {
                const x = (col + 0.5) * BLOCK_CELL - width / 2
                const z = (row + 0.5) * BLOCK_CELL - depth / 2
                if (insideRing(ring, x, z)) cells[row * cols + col] = 1
            }
        }
    }

    return (x, z) => {
        const col = Math.floor(toCol(x))
        const row = Math.floor(toRow(z))
        if (col < 0 || row < 0 || col >= cols || row >= rows) return true

        return cells[row * cols + col] === 1 || isWater(x, z)
    }
}

/** Trees as map.json keeps them: [x, z, height, crown, kind, …], kind an index into TREE_KINDS. */
export function flattenTrees(trees: Tree[]): number[] {
    return trees.flatMap(tree => [round(tree.x), round(tree.z), tree.height, tree.crown, TREE_KINDS.indexOf(tree.kind)])
}

/** A repeatable number in [0, 1) for a place and a purpose (`salt`). */
export function random(a: number, b: number, salt: number): number {
    let h = Math.imul(Math.round(a * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(b * 10) | 0, 0x165667b1)
    h = Math.imul(h ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    h ^= h >>> 16

    return (h >>> 0) / 4294967296
}

/** Points in square buckets, to ask whether any lies within a distance of a spot. */
class PointIndex {
    private readonly cells = new Map<string, [number, number][]>()

    constructor(private readonly cell: number) {}

    add(x: number, z: number): void {
        const key = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
        const bucket = this.cells.get(key)
        if (bucket) bucket.push([x, z])
        else this.cells.set(key, [[x, z]])
    }

    within(x: number, z: number, distance: number): boolean {
        const reach = Math.ceil(distance / this.cell)
        const col = Math.floor(x / this.cell)
        const row = Math.floor(z / this.cell)
        for (let c = col - reach; c <= col + reach; c++) {
            for (let r = row - reach; r <= row + reach; r++) {
                for (const [px, pz] of this.cells.get(`${c},${r}`) ?? []) {
                    if (Math.hypot(px - x, pz - z) < distance) return true
                }
            }
        }

        return false
    }
}

function insideRing(ring: number[], x: number, z: number): boolean {
    let inside = false
    const count = ring.length / 2
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = ring[i * 2]!
        const zi = ring[i * 2 + 1]!
        const xj = ring[j * 2]!
        const zj = ring[j * 2 + 1]!
        if (zi > z !== zj > z && x < xi + ((z - zi) * (xj - xi)) / (zj - zi)) inside = !inside
    }

    return inside
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}
