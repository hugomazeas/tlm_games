import type { LatLon } from './convert.ts'
import type { Decor, Paint, Shape, ShapeKind } from './format.ts'
import { random, type Tree, TREE_KINDS, type TreeKind } from './trees.ts'

/**
 * Everything on the ground that isn't a building or a road: fountains,
 * statues, monuments, hedges, fences, lamp posts, flowerbeds, lawns and
 * paving, rows of trees, benches, café umbrellas, flags.
 *
 * Two sources. OSM's tags give the city-wide basics (a statue on a plinth at
 * each statue node, a round fountain at each fountain, every hedge, flowerbed
 * and row of trees). Decor files in maps/<map>/decor/ add the hand-made
 * detail for a place, item by item, each placed in latitude/longitude; a file
 * lists the OSM elements it replaces so they aren't drawn twice.
 *
 * Items expand here into plain shapes (boxes, cylinders, cones, spheres,
 * pyramids, prisms) in map metres, which the browser draws in a few merged
 * meshes and the karts bump into when they're solid.
 */

type Point = [number, number]
type Project = (point: LatLon) => Point
type Ground = (x: number, z: number) => number

export type PaintKind = 'lawn' | 'paving' | 'gravel' | 'water' | 'soil'
export type FigureKind = 'standing' | 'equestrian' | 'bust' | 'seated'
export type LampStyle = 'heritage' | 'globe' | 'modern'
export type FenceStyle = 'iron' | 'stone' | 'wood'

export interface Basin {
    /** Across the top of the basin. */
    diameter: number
    /** Its rim above the ground. */
    height: number
}

export interface FountainItem {
    kind: 'fountain'
    at: LatLon
    /** Bottom up: the pool on the ground first, then the bowls above it on a central stem. */
    basins: Basin[]
    /** A spout of water rising this far above the top bowl. */
    jet?: number
    /** Water falls from each bowl into the one below. */
    falls?: boolean
    /** An ornament on the top bowl, this many metres tall. */
    finial?: number
    stone?: string
    metal?: string
    water?: string
}

export interface StatueItem {
    kind: 'statue'
    at: LatLon
    /** Compass bearing the figure looks towards, in degrees (0 north, 90 east). */
    facing: number
    figure: FigureKind
    /** The figure from its feet (or the horse's hooves) to the top of its head. */
    height: number
    plinth: { width: number; depth: number; height: number; colour?: string }
    colour?: string
}

export interface Piece {
    shape: ShapeKind
    /** Metres to the item's right, and ahead of it (towards `facing`), from `at`. */
    right?: number
    ahead?: number
    /** Its base above the ground. */
    from?: number
    width: number
    depth: number
    height: number
    colour: string
    /** A cylinder's top as a share of its bottom: 0 a cone, above 1 a bowl. */
    taper?: number
    /** Extra turn in degrees, clockwise seen from above. */
    turn?: number
    solid?: boolean
    water?: boolean
}

export interface StructureItem {
    kind: 'structure'
    at: LatLon
    facing?: number
    pieces: Piece[]
}

export interface HedgeItem {
    kind: 'hedge'
    line: LatLon[]
    height?: number
    width?: number
    colour?: string
}

export interface FenceItem {
    kind: 'fence'
    line: LatLon[]
    style: FenceStyle
    height?: number
    colour?: string
}

export interface LampsItem {
    kind: 'lamps'
    style: LampStyle
    points?: LatLon[]
    /** Lamps every `spacing` metres along the line, ends included. */
    line?: LatLon[]
    spacing?: number
    height?: number
}

export interface TreesItem {
    kind: 'trees'
    tree: TreeKind
    height: number
    crown: number
    points?: LatLon[]
    line?: LatLon[]
    /** Fills the area, one tree every `spacing` metres, jittered. */
    area?: LatLon[]
    spacing?: number
}

export interface FlowerbedItem {
    kind: 'flowerbed'
    area: LatLon[]
    /** The flowers' colour; a mix of reds, pinks and yellows by default. */
    colour?: string
    height?: number
}

export interface PaintItem {
    kind: 'paint'
    surface: PaintKind
    area: LatLon[]
    colour?: string
}

export interface BenchesItem {
    kind: 'benches'
    points?: LatLon[]
    line?: LatLon[]
    spacing?: number
}

export interface UmbrellasItem {
    kind: 'umbrellas'
    points?: LatLon[]
    line?: LatLon[]
    spacing?: number
    colour?: string
    size?: number
}

export interface FlagsItem {
    kind: 'flags'
    points: LatLon[]
    height?: number
    colours?: string[]
}

export type DecorItem =
    | FountainItem
    | StatueItem
    | StructureItem
    | HedgeItem
    | FenceItem
    | LampsItem
    | TreesItem
    | FlowerbedItem
    | PaintItem
    | BenchesItem
    | UmbrellasItem
    | FlagsItem

export interface DecorFile {
    name: string
    notes?: string
    /** OSM elements this file draws itself, so their generic versions are left out ("node/123", "way/456"). */
    replaces?: string[]
    items: DecorItem[]
}

/** What the decor adds to the map: shapes and paint, plus trees and benches for the furniture. */
export interface DecorOutput extends Decor {
    trees: Tree[]
    benches: Point[]
}

const STONE = '#c9c3b5'
const BRONZE = '#4f5b4a'
const IRON = '#2b2d2f'
const WATER = '#6fb3d6'
const HEDGE = '#3f6e35'
const FLOWERS = ['#c4473f', '#cf7d9c', '#d9b64a', '#e6e1d6', '#8f6db5', '#d98a45']
const PAINT: Record<PaintKind, string> = {
    lawn: '#9cc97c',
    paving: '#d6cfc0',
    gravel: '#cdbd9b',
    water: '#7fb8dc',
    soil: '#7a5f45',
}

/** Turns decor items into shapes, paint, trees and benches, in map metres. */
export function expandDecor(items: DecorItem[], project: Project, ground: Ground): DecorOutput {
    const out: DecorOutput = { shapes: [], paint: [], trees: [], benches: [] }
    for (const item of items) expandItem(item, project, ground, out)

    return out
}

function expandItem(item: DecorItem, project: Project, ground: Ground, out: DecorOutput): void {
    switch (item.kind) {
        case 'fountain': {
            const [x, z] = project(item.at)
            out.shapes.push(...fountainShapes(x, z, ground(x, z), item))
            return
        }
        case 'statue': {
            const [x, z] = project(item.at)
            out.shapes.push(...statueShapes(x, z, ground(x, z), item))
            return
        }
        case 'structure': {
            const [x, z] = project(item.at)
            const y = ground(x, z)
            out.shapes.push(...item.pieces.map(piece => placePiece(x, z, y, item.facing ?? 0, piece)))
            return
        }
        case 'hedge':
            out.shapes.push(
                ...alongLine(item.line.map(project), ground, item.width ?? 1, item.height ?? 1.3, item.colour ?? HEDGE)
            )
            return
        case 'fence':
            out.shapes.push(...fenceShapes(item.line.map(project), ground, item))
            return
        case 'lamps':
            for (const [x, z] of spots(item, project)) out.shapes.push(...lampShapes(x, z, ground(x, z), item))
            return
        case 'trees':
            out.trees.push(...treesOf(item, project))
            return
        case 'flowerbed': {
            const outline = item.area.map(project)
            const colour = item.colour ?? FLOWERS[Math.floor(random(...outline[0]!, 11) * FLOWERS.length)]!
            out.paint.push({ colour: PAINT.soil, outline: flat(outline) })
            out.shapes.push(prism(outline, lowest(outline, ground), item.height ?? 0.35, colour))
            return
        }
        case 'paint':
            out.paint.push({ colour: item.colour ?? PAINT[item.surface], outline: flat(item.area.map(project)) })
            return
        case 'benches':
            out.benches.push(...spots(item, project))
            return
        case 'umbrellas':
            for (const [x, z] of spots(item, project)) {
                out.shapes.push(...umbrellaShapes(x, z, ground(x, z), item.size ?? 2.6, item.colour ?? '#efe6d2'))
            }
            return
        case 'flags':
            item.points.map(project).forEach(([x, z], i) => {
                const colours = item.colours ?? ['#1f4fa3']
                out.shapes.push(...flagShapes(x, z, ground(x, z), item.height ?? 10, colours[i % colours.length]!))
            })
            return
    }
}

/** A shape in an item's frame, placed on the map. */
function placePiece(x: number, z: number, y: number, facing: number, piece: Piece): Shape {
    const bearing = (facing * Math.PI) / 180
    // Facing a compass bearing b: ahead is (sin b, −cos b) on the map (z points south), right is (cos b, sin b).
    const right = piece.right ?? 0
    const ahead = piece.ahead ?? 0
    const px = x + Math.cos(bearing) * right + Math.sin(bearing) * ahead
    const pz = z + Math.sin(bearing) * right - Math.cos(bearing) * ahead

    return shape(piece.shape, px, y + (piece.from ?? 0), pz, piece.width, piece.depth, piece.height, {
        turn: -bearing - ((piece.turn ?? 0) * Math.PI) / 180,
        colour: piece.colour,
        ...(piece.taper !== undefined ? { taper: piece.taper } : {}),
        ...(piece.solid ? { solid: true } : {}),
        ...(piece.water ? { water: true } : {}),
    })
}

function shape(
    kind: ShapeKind,
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    extra: { turn?: number; colour: string; taper?: number; solid?: boolean; water?: boolean }
): Shape {
    return {
        shape: kind,
        x: round(x),
        y: round(y, 2),
        z: round(z),
        width: round(width, 2),
        depth: round(depth, 2),
        height: round(height, 2),
        turn: round(extra.turn ?? 0, 3),
        colour: extra.colour,
        ...(extra.taper !== undefined ? { taper: round(extra.taper, 2) } : {}),
        ...(extra.solid ? { solid: true as const } : {}),
        ...(extra.water ? { water: true as const } : {}),
    }
}

/**
 * A fountain: a stone pool, then bowls on a stem, each holding water, with
 * water falling from bowl to bowl and a jet on top.
 */
export function fountainShapes(x: number, z: number, y: number, fountain: Omit<FountainItem, 'kind' | 'at'>): Shape[] {
    const stone = fountain.stone ?? STONE
    const metal = fountain.metal ?? stone
    const water = fountain.water ?? WATER
    const shapes: Shape[] = []
    const [pool, ...bowls] = fountain.basins
    if (!pool) return shapes

    shapes.push(
        shape('cylinder', x, y - 0.2, z, pool.diameter, pool.diameter, pool.height + 0.2, {
            colour: stone,
            solid: true,
        })
    )
    const rim = Math.min(0.5, pool.diameter * 0.06)
    shapes.push(waterDisc(x, z, y + pool.height - 0.08, pool.diameter - rim * 2, water))

    let below = pool
    for (const bowl of bowls) {
        const depth = Math.min(0.6, bowl.diameter * 0.18)
        const stem = Math.max(0.3, bowl.diameter * 0.16)
        shapes.push(
            shape('cylinder', x, y + below.height - 0.1, z, stem, stem, bowl.height - depth - below.height + 0.1, {
                colour: metal,
                taper: 0.8,
            })
        )
        shapes.push(
            shape('cylinder', x, y + bowl.height - depth, z, bowl.diameter * 0.35, bowl.diameter * 0.35, depth, {
                colour: metal,
                taper: 1 / 0.35,
            })
        )
        shapes.push(waterDisc(x, z, y + bowl.height - 0.06, bowl.diameter * 0.9, water))
        if (fountain.falls) {
            const drop = bowl.height - depth - below.height
            if (drop > 0.3) {
                shapes.push(
                    shape('cylinder', x, y + below.height, z, bowl.diameter * 1.04, bowl.diameter * 1.04, drop, {
                        colour: water,
                        taper: 1 / 1.04,
                        water: true,
                    })
                )
            }
        }
        below = bowl
    }

    let top = below.height
    if (fountain.finial) {
        shapes.push(shape('cylinder', x, y + top - 0.05, z, 0.35, 0.35, fountain.finial, { colour: metal, taper: 0.3 }))
        top += fountain.finial
    }
    if (fountain.jet) {
        shapes.push(
            shape('cylinder', x, y + top, z, 0.25, 0.25, fountain.jet, { colour: water, taper: 0.4, water: true })
        )
    }

    return shapes
}

function waterDisc(x: number, z: number, y: number, diameter: number, colour: string): Shape {
    return shape('cylinder', x, y, z, diameter, diameter, 0.1, { colour })
}

/**
 * A statue on its plinth. The figure is a handful of blocks, bronze by
 * default: enough to read as a person, a rider or a bust from the street.
 */
export function statueShapes(x: number, z: number, y: number, statue: Omit<StatueItem, 'kind' | 'at'>): Shape[] {
    const { plinth, height: h } = statue
    const colour = statue.colour ?? BRONZE
    const stone = plinth.colour ?? STONE
    const base = plinth.height
    const piece = (p: Omit<Piece, 'colour'> & { colour?: string }) =>
        placePiece(x, z, y, statue.facing, { colour, ...p, from: base + (p.from ?? 0) })

    const shapes: Shape[] = [
        placePiece(x, z, y, statue.facing, {
            shape: 'box',
            width: plinth.width,
            depth: plinth.depth,
            height: base,
            colour: stone,
            solid: true,
        }),
    ]

    switch (statue.figure) {
        case 'standing':
            shapes.push(
                piece({ shape: 'box', width: 0.24 * h, depth: 0.16 * h, height: 0.46 * h }),
                piece({ shape: 'box', width: 0.3 * h, depth: 0.18 * h, from: 0.46 * h, height: 0.34 * h }),
                piece({
                    shape: 'box',
                    right: 0.19 * h,
                    width: 0.08 * h,
                    depth: 0.09 * h,
                    from: 0.5 * h,
                    height: 0.3 * h,
                }),
                piece({
                    shape: 'box',
                    right: -0.19 * h,
                    width: 0.08 * h,
                    depth: 0.09 * h,
                    from: 0.5 * h,
                    height: 0.3 * h,
                }),
                piece({ shape: 'sphere', width: 0.13 * h, depth: 0.14 * h, from: 0.8 * h, height: 0.18 * h })
            )
            break
        case 'seated':
            shapes.push(
                piece({ shape: 'box', width: 0.45 * h, depth: 0.5 * h, height: 0.4 * h, colour: stone }),
                piece({
                    shape: 'box',
                    ahead: 0.12 * h,
                    width: 0.34 * h,
                    depth: 0.42 * h,
                    from: 0.4 * h,
                    height: 0.12 * h,
                }),
                piece({
                    shape: 'box',
                    ahead: -0.08 * h,
                    width: 0.36 * h,
                    depth: 0.2 * h,
                    from: 0.4 * h,
                    height: 0.42 * h,
                }),
                piece({
                    shape: 'sphere',
                    ahead: -0.06 * h,
                    width: 0.16 * h,
                    depth: 0.17 * h,
                    from: 0.82 * h,
                    height: 0.18 * h,
                })
            )
            break
        case 'bust':
            shapes.push(
                piece({ shape: 'box', width: 0.62 * h, depth: 0.3 * h, height: 0.45 * h }),
                piece({ shape: 'cylinder', width: 0.18 * h, depth: 0.18 * h, from: 0.42 * h, height: 0.14 * h }),
                piece({ shape: 'sphere', width: 0.32 * h, depth: 0.36 * h, from: 0.52 * h, height: 0.46 * h })
            )
            break
        case 'equestrian':
            // The horse: legs, a long body, the neck rising forward and the head; then the rider, arm raised.
            for (const [right, ahead] of [
                [0.09, 0.2],
                [-0.09, 0.2],
                [0.09, -0.2],
                [-0.09, -0.2],
            ] as const) {
                shapes.push(
                    piece({
                        shape: 'cylinder',
                        right: right * h,
                        ahead: ahead * h,
                        width: 0.06 * h,
                        depth: 0.06 * h,
                        height: 0.34 * h,
                    })
                )
            }
            shapes.push(
                piece({ shape: 'sphere', width: 0.24 * h, depth: 0.62 * h, from: 0.28 * h, height: 0.26 * h }),
                piece({
                    shape: 'box',
                    ahead: 0.3 * h,
                    width: 0.12 * h,
                    depth: 0.14 * h,
                    from: 0.42 * h,
                    height: 0.26 * h,
                }),
                piece({
                    shape: 'box',
                    ahead: 0.38 * h,
                    width: 0.1 * h,
                    depth: 0.24 * h,
                    from: 0.6 * h,
                    height: 0.11 * h,
                }),
                piece({
                    shape: 'cylinder',
                    ahead: -0.33 * h,
                    width: 0.05 * h,
                    depth: 0.05 * h,
                    from: 0.18 * h,
                    height: 0.22 * h,
                }),
                piece({
                    shape: 'box',
                    ahead: -0.02 * h,
                    width: 0.22 * h,
                    depth: 0.14 * h,
                    from: 0.5 * h,
                    height: 0.3 * h,
                }),
                piece({
                    shape: 'sphere',
                    ahead: -0.02 * h,
                    width: 0.1 * h,
                    depth: 0.11 * h,
                    from: 0.8 * h,
                    height: 0.13 * h,
                }),
                piece({
                    shape: 'box',
                    right: 0.13 * h,
                    ahead: 0.02 * h,
                    width: 0.05 * h,
                    depth: 0.05 * h,
                    from: 0.62 * h,
                    height: 0.38 * h,
                })
            )
            break
    }

    return shapes
}

/** Boxes laid end to end along a line, each on the ground under its middle: a hedge, a low wall. */
function alongLine(
    points: Point[],
    ground: Ground,
    width: number,
    height: number,
    colour: string,
    extra: { solid?: boolean; from?: number } = {}
): Shape[] {
    const shapes: Shape[] = []
    for (let i = 0; i + 1 < points.length; i++) {
        const [ax, az] = points[i]!
        const [bx, bz] = points[i + 1]!
        const length = Math.hypot(bx - ax, bz - az)
        if (length < 0.05) continue
        const mx = (ax + bx) / 2
        const mz = (az + bz) / 2
        const y = Math.min(ground(ax, az), ground(bx, bz), ground(mx, mz)) + (extra.from ?? 0)
        shapes.push(
            shape('box', mx, y, mz, length + width, width, height, {
                turn: Math.atan2(-(bz - az), bx - ax),
                colour,
                ...(extra.solid ? { solid: true } : {}),
            })
        )
    }

    return shapes
}

/** An iron railing (posts and rails), a stone wall (solid), or a wooden fence. */
function fenceShapes(points: Point[], ground: Ground, fence: FenceItem): Shape[] {
    const height = fence.height ?? (fence.style === 'stone' ? 1 : 1.2)
    if (fence.style === 'stone') return alongLine(points, ground, 0.5, height, fence.colour ?? STONE, { solid: true })

    const colour = fence.colour ?? (fence.style === 'iron' ? IRON : '#8a6a48')
    const shapes = [
        ...alongLine(points, ground, 0.06, 0.06, colour, { from: height - 0.06 }),
        ...alongLine(points, ground, 0.06, 0.06, colour, { from: 0.15 }),
    ]
    for (const [x, z] of pointsAlong(points, fence.style === 'iron' ? 2 : 2.5)) {
        shapes.push(shape('box', x, ground(x, z), z, 0.09, 0.09, height, { colour }))
    }

    return shapes
}

/** A lamp post: heritage (black cast iron and a lantern), a white globe, or a modern arm over the street. */
function lampShapes(x: number, z: number, y: number, lamps: LampsItem): Shape[] {
    const height = lamps.height ?? (lamps.style === 'modern' ? 8 : 4.2)
    switch (lamps.style) {
        case 'heritage':
            return [
                shape('cylinder', x, y, z, 0.32, 0.32, 0.9, { colour: IRON, taper: 0.6 }),
                shape('cylinder', x, y + 0.9, z, 0.13, 0.13, height - 1.5, { colour: IRON, taper: 0.8 }),
                shape('cylinder', x, y + height - 0.65, z, 0.32, 0.32, 0.5, { colour: '#f3e7b0', taper: 1.25 }),
                shape('cone', x, y + height - 0.15, z, 0.5, 0.5, 0.35, { colour: IRON }),
            ]
        case 'globe':
            return [
                shape('cylinder', x, y, z, 0.14, 0.14, height - 0.4, { colour: IRON }),
                shape('sphere', x, y + height - 0.45, z, 0.45, 0.45, 0.45, { colour: '#f6f3e8' }),
            ]
        case 'modern':
            return [
                shape('cylinder', x, y, z, 0.18, 0.18, height, { colour: '#8b9096', taper: 0.6 }),
                shape('box', x, y + height - 0.1, z, 0.5, 0.25, 0.12, { colour: '#8b9096' }),
            ]
    }
}

function umbrellaShapes(x: number, z: number, y: number, size: number, colour: string): Shape[] {
    return [
        shape('cylinder', x, y, z, 0.06, 0.06, 2.3, { colour: '#d9d4c8' }),
        shape('pyramid', x, y + 2, z, size, size, 0.6, { colour }),
    ]
}

function flagShapes(x: number, z: number, y: number, height: number, colour: string): Shape[] {
    return [
        shape('cylinder', x, y, z, 0.14, 0.14, height, { colour: '#e8e8e4', taper: 0.5 }),
        shape('box', x + 0.95, y + height - 1.25, z, 1.8, 0.04, 1.1, { colour }),
    ]
}

/** A raised bed, or anything flat-topped following an outline. */
function prism(outline: Point[], y: number, height: number, colour: string): Shape {
    return {
        shape: 'prism',
        x: 0,
        y: round(y, 2),
        z: 0,
        width: 0,
        depth: 0,
        height: round(height, 2),
        turn: 0,
        colour,
        outline: flat(outline),
    }
}

function treesOf(item: TreesItem, project: Project): Tree[] {
    const at = (x: number, z: number): Tree => ({
        x: round(x),
        z: round(z),
        kind: item.tree,
        // A little variety, so a row isn't cloned.
        height: round(item.height * (0.92 + random(x, z, 12) * 0.16)),
        crown: round(item.crown * (0.9 + random(x, z, 13) * 0.2)),
    })
    if (item.area) {
        const ring = flat(item.area.map(project))
        const spacing = item.spacing ?? 8
        const xs = ring.filter((_, i) => i % 2 === 0)
        const zs = ring.filter((_, i) => i % 2 === 1)
        const trees: Tree[] = []
        for (let col = Math.floor(Math.min(...xs) / spacing); col * spacing <= Math.max(...xs); col++) {
            for (let row = Math.floor(Math.min(...zs) / spacing); row * spacing <= Math.max(...zs); row++) {
                const x = (col + 0.2 + random(col, row, 14) * 0.6) * spacing
                const z = (row + 0.2 + random(col, row, 15) * 0.6) * spacing
                if (insideRing(ring, x, z)) trees.push(at(x, z))
            }
        }
        return trees
    }

    return spots(item, project).map(([x, z]) => at(x, z))
}

/** The points an item lists, or points every `spacing` metres along its line. */
function spots(item: { points?: LatLon[]; line?: LatLon[]; spacing?: number }, project: Project): Point[] {
    if (item.points) return item.points.map(project)
    if (item.line) return pointsAlong(item.line.map(project), item.spacing ?? 10)

    return []
}

/** Points along a line every `spacing` metres, from its start, its end included. */
export function pointsAlong(points: Point[], spacing: number): Point[] {
    const out: Point[] = []
    let carried = 0
    for (let i = 0; i + 1 < points.length; i++) {
        const [ax, az] = points[i]!
        const [bx, bz] = points[i + 1]!
        const length = Math.hypot(bx - ax, bz - az)
        let t = i === 0 ? 0 : spacing - carried
        while (t <= length + 1e-6) {
            out.push([ax + ((bx - ax) * t) / length, az + ((bz - az) * t) / length])
            t += spacing
        }
        carried = length - (t - spacing)
    }
    const last = points.at(-1)
    if (last && out.length > 0) {
        const [lx, lz] = out.at(-1)!
        if (Math.hypot(lx - last[0], lz - last[1]) > spacing * 0.4) out.push(last)
    }

    return out.map(([x, z]) => [round(x), round(z)])
}

// ── OSM ─────────────────────────────────────────────────────────────────────────────────────────

export interface OsmPoint {
    key: string
    tags: Record<string, string>
    at: Point
}

export interface OsmLine {
    key: string
    tags: Record<string, string>
    points: Point[]
}

/** Statues people put up: OSM's memorials, monuments and artworks that are figures, not plaques, murals or houses. */
export function isStatue(tags: Record<string, string>): boolean {
    if (tags.building) return false
    if (['statue', 'bust'].includes(tags.memorial ?? '')) return true
    if (['statue', 'sculpture', 'bust'].includes(tags.artwork_type ?? '')) return true

    return (
        tags.historic === 'monument' &&
        /monument|statue/i.test(tags.name ?? '') &&
        !/maison|house/i.test(tags.name ?? '')
    )
}

/**
 * The city-wide basics from OSM: a statue on a plinth for each statue, turned
 * to face the nearest road; a round fountain at each fountain node and a
 * pool along each fountain's outline; every hedge, flowerbed and row of trees.
 */
export function osmDecor(
    points: OsmPoint[],
    lines: OsmLine[],
    ground: Ground,
    facingRoad: (x: number, z: number) => number | null
): DecorOutput {
    const out: DecorOutput = { shapes: [], paint: [], trees: [], benches: [] }

    for (const { tags, at } of points) {
        const [x, z] = at
        const y = ground(x, z)
        if (tags.amenity === 'fountain') {
            out.shapes.push(...fountainShapes(x, z, y, { basins: [{ diameter: 4, height: 0.5 }], jet: 1.5 }))
        } else if (isStatue(tags)) {
            const bust = tags.memorial === 'bust' || tags.artwork_type === 'bust'
            out.shapes.push(
                ...statueShapes(x, z, y, {
                    facing: facingRoad(x, z) ?? 0,
                    figure: bust ? 'bust' : 'standing',
                    height: bust ? 0.9 : 2.4,
                    plinth: bust ? { width: 0.7, depth: 0.7, height: 1.4 } : { width: 1.6, depth: 1.6, height: 2 },
                })
            )
        }
    }

    for (const { tags, points: line } of lines) {
        if (tags.barrier === 'hedge') {
            out.shapes.push(
                ...alongLine(
                    line,
                    ground,
                    parseFloat(tags.width ?? '') || 1,
                    parseFloat(tags.height ?? '') || 1.3,
                    HEDGE
                )
            )
        } else if (tags.natural === 'tree_row') {
            const kind: TreeKind = tags.leaf_type === 'needleleaved' ? 'conifer' : 'broadleaf'
            for (const [x, z] of pointsAlong(line, 9)) {
                out.trees.push({
                    x,
                    z,
                    kind,
                    height: round(14 + random(x, z, 16) * 6),
                    crown: round(9 + random(x, z, 17) * 4),
                })
            }
        } else if (tags.landuse === 'flowerbed' && closed(line)) {
            const outline = line.slice(0, -1)
            out.paint.push({ colour: PAINT.soil, outline: flat(outline) })
            out.shapes.push(
                prism(
                    outline,
                    lowest(outline, ground),
                    0.35,
                    FLOWERS[Math.floor(random(...outline[0]!, 11) * FLOWERS.length)]!
                )
            )
        } else if (tags.amenity === 'fountain' && closed(line)) {
            const outline = line.slice(0, -1)
            const y = lowest(outline, ground)
            out.shapes.push(prism(outline, y - 0.2, 0.7, STONE))
            out.shapes.push({ ...prism(insetToward(outline, 0.4), y + 0.42, 0.1, WATER) })
            const [cx, cz] = centre(outline)
            out.shapes.push(
                shape('cylinder', cx, y + 0.5, cz, 0.25, 0.25, 1.6, { colour: WATER, taper: 0.4, water: true })
            )
        }
    }

    return out
}

function closed(line: Point[]): boolean {
    const first = line[0]
    const last = line.at(-1)
    return line.length >= 4 && first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
}

/** A ring pulled `distance` metres towards its middle: good enough for the water inside a pool's rim. */
function insetToward(ring: Point[], distance: number): Point[] {
    const [cx, cz] = centre(ring)
    return ring.map(([x, z]) => {
        const d = Math.hypot(x - cx, z - cz)
        const k = d > distance ? (d - distance) / d : 0.5
        return [cx + (x - cx) * k, cz + (z - cz) * k]
    })
}

function centre(ring: Point[]): Point {
    return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
}

function lowest(ring: Point[], ground: Ground): number {
    return Math.min(...ring.map(([x, z]) => ground(x, z)))
}

function flat(points: Point[]): number[] {
    return points.flatMap(([x, z]) => [round(x), round(z)])
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

function round(value: number, decimals = 1): number {
    const scale = 10 ** decimals
    return Math.round(value * scale) / scale
}

/** Paint drawn from the decor, sorted so the biggest areas go down first. */
export function sortPaint(paint: Paint[]): Paint[] {
    const area = (ring: number[]) => {
        let sum = 0
        for (let i = 0; i < ring.length; i += 2) {
            const j = (i + 2) % ring.length
            sum += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!
        }
        return Math.abs(sum / 2)
    }
    return [...paint].sort((a, b) => area(b.outline) - area(a.outline))
}

// ── Decor files ─────────────────────────────────────────────────────────────────────────────────

export const DECOR_KEYS = ['$schema', 'name', 'notes', 'replaces', 'items']
/** The keys each kind of item takes, `kind` included. */
export const ITEM_KEYS: Record<DecorItem['kind'], string[]> = {
    fountain: ['kind', 'at', 'basins', 'jet', 'falls', 'finial', 'stone', 'metal', 'water'],
    statue: ['kind', 'at', 'facing', 'figure', 'height', 'plinth', 'colour'],
    structure: ['kind', 'at', 'facing', 'pieces'],
    hedge: ['kind', 'line', 'height', 'width', 'colour'],
    fence: ['kind', 'line', 'style', 'height', 'colour'],
    lamps: ['kind', 'style', 'points', 'line', 'spacing', 'height'],
    trees: ['kind', 'tree', 'height', 'crown', 'points', 'line', 'area', 'spacing'],
    flowerbed: ['kind', 'area', 'colour', 'height'],
    paint: ['kind', 'surface', 'area', 'colour'],
    benches: ['kind', 'points', 'line', 'spacing'],
    umbrellas: ['kind', 'points', 'line', 'spacing', 'colour', 'size'],
    flags: ['kind', 'points', 'height', 'colours'],
}
export const PIECE_KEYS = [
    'shape',
    'right',
    'ahead',
    'from',
    'width',
    'depth',
    'height',
    'colour',
    'taper',
    'turn',
    'solid',
    'water',
]
export const PLINTH_KEYS = ['width', 'depth', 'height', 'colour']
export const BASIN_KEYS = ['diameter', 'height']
const SHAPES: ShapeKind[] = ['box', 'cylinder', 'cone', 'sphere', 'pyramid']
const COLOUR = /^#[0-9a-fA-F]{6}$/

/**
 * Checks a decor file's contents and returns it typed, or throws listing
 * every problem. Unknown keys are errors, so a typo can't silently do nothing.
 */
export function parseDecor(value: unknown, file: string): DecorFile {
    const problems: string[] = []
    const fail = (path: string, message: string) => problems.push(`${path}: ${message}`)
    const record = (path: string, input: unknown, keys: string[]): Record<string, unknown> | null => {
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            fail(path, 'must be an object')
            return null
        }
        for (const key of Object.keys(input)) if (!keys.includes(key)) fail(path, `unknown key "${key}"`)
        return input as Record<string, unknown>
    }
    const number = (path: string, input: unknown, { min = -Infinity, max = Infinity, optional = false } = {}) => {
        if (input === undefined && optional) return
        if (typeof input !== 'number' || !Number.isFinite(input)) fail(path, 'must be a number')
        else if (input < min || input > max) fail(path, `must be between ${min} and ${max}`)
    }
    const colour = (path: string, input: unknown, optional = true) => {
        if (input === undefined && optional) return
        if (typeof input !== 'string' || !COLOUR.test(input)) fail(path, 'must be a colour like #a1b2c3')
    }
    const oneOf = (path: string, input: unknown, options: readonly string[], optional = false) => {
        if (input === undefined && optional) return
        if (!options.includes(input as string)) fail(path, `must be one of ${options.join(', ')}`)
    }
    const flag = (path: string, input: unknown) => {
        if (input !== undefined && typeof input !== 'boolean') fail(path, 'must be true or false')
    }
    const latLon = (path: string, input: unknown) => {
        const point = record(path, input, ['lat', 'lon'])
        if (!point) return
        number(`${path}.lat`, point.lat, { min: -90, max: 90 })
        number(`${path}.lon`, point.lon, { min: -180, max: 180 })
    }
    const latLons = (path: string, input: unknown, least: number, optional = false) => {
        if (input === undefined && optional) return
        if (!Array.isArray(input) || input.length < least) {
            fail(path, `must be a list of at least ${least} points`)
            return
        }
        input.forEach((point, i) => latLon(`${path}[${i}]`, point))
    }
    const placed = (path: string, item: Record<string, unknown>, needsLine: boolean) => {
        const ways = ['points', 'line'].filter(key => item[key] !== undefined)
        if (ways.length !== 1)
            fail(path, needsLine ? 'needs `points` or a `line`' : 'needs `points` or a `line`, not both')
        latLons(`${path}.points`, item.points, 1, true)
        latLons(`${path}.line`, item.line, 2, true)
        number(`${path}.spacing`, item.spacing, { min: 0.5, optional: true })
    }

    const decor = record(file, value, DECOR_KEYS)
    if (decor) {
        if (typeof decor.name !== 'string' || decor.name === '') fail('name', 'must be a name')
        if (decor.notes !== undefined && typeof decor.notes !== 'string') fail('notes', 'must be text')
        if (decor.replaces !== undefined) {
            if (!Array.isArray(decor.replaces)) fail('replaces', 'must be a list')
            else
                decor.replaces.forEach((key, i) => {
                    if (typeof key !== 'string' || !/^(node|way|relation)\/\d+$/.test(key)) {
                        fail(`replaces[${i}]`, 'must be like "node/123" or "way/456"')
                    }
                })
        }
        if (!Array.isArray(decor.items)) fail('items', 'must be a list')
        else
            decor.items.forEach((input, i) => {
                const path = `items[${i}]`
                const kind = (input as { kind?: unknown } | null)?.kind as DecorItem['kind']
                if (!(kind in ITEM_KEYS)) {
                    fail(`${path}.kind`, `must be one of ${Object.keys(ITEM_KEYS).join(', ')}`)
                    return
                }
                const item = record(path, input, ITEM_KEYS[kind])
                if (!item) return
                switch (kind) {
                    case 'fountain':
                        latLon(`${path}.at`, item.at)
                        if (!Array.isArray(item.basins) || item.basins.length === 0)
                            fail(`${path}.basins`, 'must list the pool at least')
                        else
                            item.basins.forEach((basin, k) => {
                                const b = record(`${path}.basins[${k}]`, basin, BASIN_KEYS)
                                if (!b) return
                                number(`${path}.basins[${k}].diameter`, b.diameter, { min: 0.3 })
                                number(`${path}.basins[${k}].height`, b.height, { min: 0.1 })
                            })
                        number(`${path}.jet`, item.jet, { min: 0, optional: true })
                        number(`${path}.finial`, item.finial, { min: 0, optional: true })
                        flag(`${path}.falls`, item.falls)
                        colour(`${path}.stone`, item.stone)
                        colour(`${path}.metal`, item.metal)
                        colour(`${path}.water`, item.water)
                        break
                    case 'statue': {
                        latLon(`${path}.at`, item.at)
                        number(`${path}.facing`, item.facing, { min: -360, max: 360 })
                        oneOf(`${path}.figure`, item.figure, ['standing', 'equestrian', 'bust', 'seated'])
                        number(`${path}.height`, item.height, { min: 0.3 })
                        colour(`${path}.colour`, item.colour)
                        const plinth = record(`${path}.plinth`, item.plinth, PLINTH_KEYS)
                        if (plinth) {
                            number(`${path}.plinth.width`, plinth.width, { min: 0.2 })
                            number(`${path}.plinth.depth`, plinth.depth, { min: 0.2 })
                            number(`${path}.plinth.height`, plinth.height, { min: 0 })
                            colour(`${path}.plinth.colour`, plinth.colour)
                        }
                        break
                    }
                    case 'structure':
                        latLon(`${path}.at`, item.at)
                        number(`${path}.facing`, item.facing, { min: -360, max: 360, optional: true })
                        if (!Array.isArray(item.pieces) || item.pieces.length === 0)
                            fail(`${path}.pieces`, 'must list pieces')
                        else
                            item.pieces.forEach((input, k) => {
                                const at = `${path}.pieces[${k}]`
                                const piece = record(at, input, PIECE_KEYS)
                                if (!piece) return
                                oneOf(`${at}.shape`, piece.shape, SHAPES)
                                for (const key of ['right', 'ahead', 'turn'])
                                    number(`${at}.${key}`, piece[key], { optional: true })
                                number(`${at}.from`, piece.from, { optional: true })
                                number(`${at}.width`, piece.width, { min: 0.02 })
                                number(`${at}.depth`, piece.depth, { min: 0.02 })
                                number(`${at}.height`, piece.height, { min: 0.02 })
                                number(`${at}.taper`, piece.taper, { min: 0, max: 5, optional: true })
                                colour(`${at}.colour`, piece.colour, false)
                                flag(`${at}.solid`, piece.solid)
                                flag(`${at}.water`, piece.water)
                            })
                        break
                    case 'hedge':
                        latLons(`${path}.line`, item.line, 2)
                        number(`${path}.height`, item.height, { min: 0.2, optional: true })
                        number(`${path}.width`, item.width, { min: 0.2, optional: true })
                        colour(`${path}.colour`, item.colour)
                        break
                    case 'fence':
                        latLons(`${path}.line`, item.line, 2)
                        oneOf(`${path}.style`, item.style, ['iron', 'stone', 'wood'])
                        number(`${path}.height`, item.height, { min: 0.2, optional: true })
                        colour(`${path}.colour`, item.colour)
                        break
                    case 'lamps':
                        oneOf(`${path}.style`, item.style, ['heritage', 'globe', 'modern'])
                        placed(path, item, true)
                        number(`${path}.height`, item.height, { min: 1, optional: true })
                        break
                    case 'trees': {
                        oneOf(`${path}.tree`, item.tree, TREE_KINDS)
                        number(`${path}.height`, item.height, { min: 1 })
                        number(`${path}.crown`, item.crown, { min: 0.5 })
                        const ways = ['points', 'line', 'area'].filter(key => item[key] !== undefined)
                        if (ways.length !== 1) fail(path, 'needs exactly one of `points`, `line` or `area`')
                        latLons(`${path}.points`, item.points, 1, true)
                        latLons(`${path}.line`, item.line, 2, true)
                        latLons(`${path}.area`, item.area, 3, true)
                        number(`${path}.spacing`, item.spacing, { min: 1, optional: true })
                        break
                    }
                    case 'flowerbed':
                        latLons(`${path}.area`, item.area, 3)
                        colour(`${path}.colour`, item.colour)
                        number(`${path}.height`, item.height, { min: 0.05, optional: true })
                        break
                    case 'paint':
                        oneOf(`${path}.surface`, item.surface, Object.keys(PAINT))
                        latLons(`${path}.area`, item.area, 3)
                        colour(`${path}.colour`, item.colour)
                        break
                    case 'benches':
                        placed(path, item, true)
                        break
                    case 'umbrellas':
                        placed(path, item, true)
                        colour(`${path}.colour`, item.colour)
                        number(`${path}.size`, item.size, { min: 0.5, optional: true })
                        break
                    case 'flags':
                        latLons(`${path}.points`, item.points, 1)
                        number(`${path}.height`, item.height, { min: 1, optional: true })
                        if (item.colours !== undefined) {
                            if (!Array.isArray(item.colours) || item.colours.length === 0)
                                fail(`${path}.colours`, 'must list colours')
                            else item.colours.forEach((c, k) => colour(`${path}.colours[${k}]`, c, false))
                        }
                        break
                }
            })
    }

    if (problems.length > 0) throw new Error(`${file} is not a valid decor file:\n  ${problems.join('\n  ')}`)

    const { $schema: _, ...typed } = value as DecorFile & { $schema?: string }
    return typed
}
