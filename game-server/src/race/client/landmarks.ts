import * as THREE from 'three'
import type { Bands, Building, BuildingDetail, Look, Roof, WallMaterial, WindowStyle } from '../map/format.ts'
import { orientedBox } from '../map/structures.ts'
import { addArcade, addBox, addFins, addParapet, edgesOf, Geometry } from './facades.ts'
import { identifyByRanges } from './identify.ts'

/**
 * Every building. Those with detail (landmark files, OSM building parts) get
 * walls with windows of a few styles (framed, square, arched, bands of glass,
 * curtain walls), concrete fins, arcades, balconies and parapets
 * (facades.ts), and mansard, hip, gable, pyramid or flat roofs on the
 * building and each of its parts. The rest are their footprint raised to
 * their height, with windows suited to it and the roof the survey measured.
 *
 * All of them share a handful of meshes: one per window style, its wall and
 * glass colours carried by each vertex, and one for everything solid (roofs,
 * fins, parapets, balconies): the whole city costs a few draw calls.
 */

/** A roof edge may be pushed in at most this many times the inset, so a sharp corner can't shoot a spike. */
const MAX_MITRE = 2
/** The back of an arcade's openings when the walls have no recess colour of their own. */
const ARCADE_RECESS = '#2f3438'
/** Glass unless a landmark says otherwise: a dark blue-grey reflecting the sky. */
const GLASS = '#3c4852'

type WallStyle = WindowStyle | 'plain'
const WALL_STYLES: WallStyle[] = ['plain', 'punched', 'square', 'arched', 'ribbon', 'curtain']

/** Materials as the wall shader numbers them. */
const MATERIALS: WallMaterial[] = ['plain', 'brick', 'stone', 'concrete', 'siding']

/**
 * Triangles of many buildings, with a colour per vertex and, for walls,
 * texture coordinates (in window bays), the glass colour, the place on the
 * wall in metres and the wall's material.
 */
class Batch {
    readonly positions: number[] = []
    readonly colours: number[] = []
    readonly uvs: number[] = []
    readonly glass: number[] = []
    readonly metres: number[] = []
    readonly materials: number[] = []
    readonly owners: Building[] = []
    readonly firstVertices: number[] = []

    /** Notes that the triangles added next belong to `building`. */
    own(building: Building): void {
        if (this.owners.at(-1) === building) return
        this.owners.push(building)
        this.firstVertices.push(this.positions.length / 3)
    }

    add(
        geometry: Geometry,
        colour: THREE.Color,
        wall?: { glass: THREE.Color; bay: [number, number]; material: WallMaterial }
    ): void {
        this.positions.push(...geometry.positions)
        const count = geometry.positions.length / 3
        const material = wall ? MATERIALS.indexOf(wall.material) : 0
        for (let i = 0; i < count; i++) {
            this.colours.push(colour.r, colour.g, colour.b)
            if (wall) {
                const u = geometry.uvs[i * 2]!
                const v = geometry.uvs[i * 2 + 1]!
                this.glass.push(wall.glass.r, wall.glass.g, wall.glass.b)
                this.uvs.push(u * wall.bay[0], v * wall.bay[1])
                this.metres.push(u, v)
                this.materials.push(material)
            }
        }
    }
}

/** Walls of buildings no one has coloured, by id. */
const WALL_COLOURS = ['#d8cfc0', '#c9b9a3', '#b7a58e', '#a9746a', '#9b6455', '#cfc9c2', '#b9bec4', '#e2d9c6']
/** Flat roofs: gravel and membrane greys. */
const FLAT_ROOFS = ['#8f8e89', '#9d9b94', '#80827f', '#a7a59d', '#767876']

export function buildBuildings(buildings: Building[]): THREE.Group {
    const walls = new Map(WALL_STYLES.map(style => [style, new Batch()]))
    const solids = new Batch()

    for (const building of buildings) {
        if (building.detail) addLandmark(building, building.detail, walls, solids)
        else addPlain(building, walls, solids)
    }

    const group = new THREE.Group()
    for (const [style, batch] of walls) {
        if (batch.positions.length === 0) continue
        const geometry = toGeometry(batch)
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2))
        geometry.setAttribute('glass', new THREE.Float32BufferAttribute(batch.glass, 3))
        geometry.setAttribute('metres', new THREE.Float32BufferAttribute(batch.metres, 2))
        geometry.setAttribute('material', new THREE.Float32BufferAttribute(batch.materials, 1))
        group.add(identified(new THREE.Mesh(geometry, wallMaterial(style)), batch))
    }
    if (solids.positions.length > 0) {
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
        })
        group.add(identified(new THREE.Mesh(toGeometry(solids), material), solids))
    }

    return group
}

/**
 * A building without detail: its footprint's walls with windows (rows of
 * small ones on houses, framed ones on taller blocks, none on a shed), then
 * its roof: the pitched one measured, or a flat one.
 */
function addPlain(building: Building, walls: Map<WallStyle, Batch>, solids: Batch): void {
    const roof: Roof = building.roof ?? {
        shape: 'flat',
        height: 0,
        colour: FLAT_ROOFS[building.id % FLAT_ROOFS.length]!,
    }
    const wallTop = building.top - roof.height
    const tall = wallTop - building.base
    const windows =
        building.windows === false
            ? undefined
            : (building.windows ??
              (tall < 5
                  ? undefined
                  : tall < 15
                    ? {
                          floor: 3,
                          spacing: 2.6 + (building.id % 3) * 0.3,
                          style: building.id % 4 === 0 ? 'punched' : 'square',
                      }
                    : { floor: 3.2, spacing: 3 + (building.id % 2) * 0.4, style: 'punched' }))
    const wall = building.colour ?? WALL_COLOURS[building.id % WALL_COLOURS.length]!
    const detail: BuildingDetail = {
        wall,
        material: building.material ?? guessMaterial(wall),
        ...(windows ? { windows: windows as BuildingDetail['windows'] } : {}),
        ...(building.glass ? { glass: building.glass } : {}),
        wallTop,
        roof,
        parts: [],
    }
    addLandmark(building, detail, walls, solids)
}

/** Red-brown walls are brick, unless a look says otherwise. */
function guessMaterial(wall: string): WallMaterial {
    const { h, s, l } = new THREE.Color(wall).getHSL({ h: 0, s: 0, l: 0 })
    return (h < 0.08 || h > 0.95) && s > 0.2 && l < 0.6 ? 'brick' : 'plain'
}

function addLandmark(building: Building, detail: BuildingDetail, walls: Map<WallStyle, Batch>, solids: Batch): void {
    const colour = (hex: string) => new THREE.Color(hex)
    const solid = (geometry: Geometry, hex: string) => {
        if (geometry.positions.length === 0) return
        solids.own(building)
        solids.add(geometry, colour(hex))
    }

    /** One ring's walls from `base` to `top`, in its look, with balconies and a parapet if its roof has one. */
    const addRing = (ring: number[], isHole: boolean, base: number, top: number, look: Look, roof?: Roof) => {
        const arcade = isHole ? undefined : look.arcade
        if (look.fins) {
            const recess = new Geometry()
            addWalls(recess, ring, base, top, arcade)
            solid(recess, look.fins.recess)
            if (!isHole) {
                const fins = new Geometry()
                const parapet = roof?.shape === 'flat' ? (roof.parapet ?? 0) + roof.height : 0
                addFins(fins, ring, base, top + parapet, look.fins, arcade)
                solid(fins, look.wall)
            }
        } else {
            const geometry = new Geometry()
            addWalls(geometry, ring, base, top, arcade)
            const style: WallStyle = look.windows ? (look.windows.style ?? 'punched') : 'plain'
            const batch = walls.get(style)!
            batch.own(building)
            batch.add(geometry, colour(look.wall), {
                glass: colour(look.glass ?? GLASS),
                bay: look.windows ? [1 / look.windows.spacing, 1 / look.windows.floor] : [1 / 3, 1 / 3],
                material: look.material ?? 'plain',
            })
        }
        if (arcade) {
            const front = new Geometry()
            const back = new Geometry()
            addArcade(front, back, ring, base, arcade)
            solid(front, look.wall)
            solid(back, look.fins?.recess ?? ARCADE_RECESS)
        }
        if (look.bands && !isHole) {
            const bands = new Geometry()
            addBands(bands, ring, base, top, look.bands)
            solid(bands, look.bands.colour ?? look.wall)
        }
    }

    const holes = building.holes ?? []
    addRing(building.outline, false, building.base, detail.wallTop, detail, detail.roof)
    for (const hole of holes) addRing(hole, true, building.base, detail.wallTop, detail, detail.roof)
    if (detail.roof) {
        const roof = new Geometry()
        addRoof(roof, building.outline, holes, detail.wallTop, detail.roof)
        solid(roof, detail.roof.colour)
    }
    const parapet = new Geometry()
    addParapetFor(
        parapet,
        [{ ring: building.outline, isHole: false }, ...holes.map(ring => ({ ring, isHole: true }))],
        detail.wallTop,
        detail.roof
    )
    solid(parapet, detail.wall)

    for (const part of detail.parts) {
        const look = part.look ?? detail
        addRing(part.outline, false, part.base, part.wallTop, look, part.roof)
        if (part.roof) {
            const roof = new Geometry()
            addRoof(roof, part.outline, [], part.wallTop, part.roof)
            solid(roof, part.roof.colour)
        }
        const partParapet = new Geometry()
        addParapetFor(partParapet, [{ ring: part.outline, isHole: false }], part.wallTop, part.roof)
        solid(partParapet, look.wall)
    }
}

function addParapetFor(
    geometry: Geometry,
    rings: { ring: number[]; isHole: boolean }[],
    wallTop: number,
    roof?: Roof
): void {
    if (roof?.shape === 'flat' && roof.parapet) addParapet(geometry, rings, wallTop + roof.height, roof.parapet)
}

/** Balconies or floor slabs round a ring's walls, every floor from the first band up to just under the top. */
export function addBands(geometry: Geometry, ring: number[], base: number, top: number, bands: Bands): void {
    for (let y = bands.first; y + bands.height < top - 0.3; y += bands.floor) {
        if (y < base) continue
        for (const edge of edgesOf(ring)) {
            addBox(geometry, edge, [0, edge.length], [0, bands.depth], y, y + bands.height)
        }
    }
}

function toGeometry(batch: Batch): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colours, 3))
    geometry.computeVertexNormals()

    return geometry
}

/** The viewer's identify tool: which building a triangle of the merged mesh belongs to. */
function identified(mesh: THREE.Mesh, batch: Batch): THREE.Mesh {
    mesh.userData.identify = identifyByRanges(batch.owners, batch.firstVertices)
    return mesh
}

/**
 * Vertical walls round a ring, from `base` to `top`; on an arcade's edges
 * they start above it. Texture coordinates run in metres (u along the wall,
 * v up it); each building scales them to its window grid.
 */
function addWalls(
    geometry: Geometry,
    ring: number[],
    base: number,
    top: number,
    arcade?: { edges: number[]; top: number }
): void {
    let along = 0
    const count = ring.length / 2
    for (let i = 0; i < count; i++) {
        const ax = ring[i * 2]!
        const az = ring[i * 2 + 1]!
        const bx = ring[((i + 1) % count) * 2]!
        const bz = ring[((i + 1) % count) * 2 + 1]!
        const length = Math.hypot(bx - ax, bz - az)
        const bottom = arcade?.edges.includes(i) ? Math.min(Math.max(arcade.top, base), top) : base

        const corners: [number, number, number][] = [
            [ax, bottom, az],
            [bx, bottom, bz],
            [bx, top, bz],
            [ax, top, az],
        ]
        const uvs: [number, number][] = [
            [along, bottom - base],
            [along + length, bottom - base],
            [along + length, top - base],
            [along, top - base],
        ]
        geometry.triangle([corners[0]!, corners[1]!, corners[2]!], [uvs[0]!, uvs[1]!, uvs[2]!])
        geometry.triangle([corners[0]!, corners[2]!, corners[3]!], [uvs[0]!, uvs[2]!, uvs[3]!])
        along += length
    }
}

/**
 * A roof on walls ending at `wallTop`. A mansard: each ring is pushed into
 * the building by the inset (outer rings shrink, courtyards grow) over the
 * roof's height, and the top is flat. A hip roof is a mansard pushed in until
 * its top is a ridge. A pyramid: every edge slopes to a point over the
 * middle. A gable roof: see addGableRoof. A flat roof is just the top.
 */
function addRoof(geometry: Geometry, outline: number[], holes: number[][], wallTop: number, roof: Roof): void {
    const top = wallTop + roof.height

    if (roof.shape === 'pyramid') {
        const [cx, cz] = centroid(outline)
        const count = outline.length / 2
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count
            geometry.triangle([
                [outline[i * 2]!, wallTop, outline[i * 2 + 1]!],
                [outline[j * 2]!, wallTop, outline[j * 2 + 1]!],
                [cx, top, cz],
            ])
        }
        return
    }
    if (roof.shape === 'gable') {
        addGableRoof(geometry, outline, wallTop, roof.height)
        return
    }

    const inset =
        roof.shape === 'flat'
            ? 0
            : roof.shape === 'hip'
              ? orientedBox(outline).halfShort * 0.999
              : (roof.inset ?? roof.height / 2)
    const rings = [
        { lower: outline, upper: insetRing(outline, inset, false) },
        ...(roof.shape === 'hip' ? [] : holes.map(hole => ({ lower: hole, upper: insetRing(hole, inset, true) }))),
    ]

    for (const { lower, upper } of roof.shape === 'flat' ? [] : rings) {
        const count = lower.length / 2
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count
            const a: [number, number, number] = [lower[i * 2]!, wallTop, lower[i * 2 + 1]!]
            const b: [number, number, number] = [lower[j * 2]!, wallTop, lower[j * 2 + 1]!]
            const c: [number, number, number] = [upper[j * 2]!, top, upper[j * 2 + 1]!]
            const d: [number, number, number] = [upper[i * 2]!, top, upper[i * 2 + 1]!]
            geometry.triangle([a, b, c])
            geometry.triangle([a, c, d])
        }
    }
    if (roof.shape === 'hip') return

    // The flat top, with the courtyards cut out of it.
    const contour = toVectors(rings[0]!.upper)
    const cutouts = rings.slice(1).map(ring => toVectors(ring.upper))
    const all = [contour, ...cutouts].flat()
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, cutouts)) {
        geometry.triangle([a!, b!, c!].map(index => [all[index]!.x, top, all[index]!.y] as [number, number, number]))
    }
}

/**
 * A gable roof over any footprint: a ridge runs along the middle of the
 * footprint's long side (its smallest enclosing rectangle) and the roof falls
 * evenly to the eaves either side. Where the walls rise into the roof, at the
 * gable ends, they're closed up to it.
 */
export function addGableRoof(geometry: Geometry, outline: number[], wallTop: number, height: number): void {
    const box = orientedBox(outline)
    const across = (x: number, z: number) => (x - box.cx) * -box.uz + (z - box.cz) * box.ux
    const roofAt = (x: number, z: number) => wallTop + height * Math.max(0, 1 - Math.abs(across(x, z)) / box.halfShort)
    const points = toVectors(outline)

    for (const side of [1, -1]) {
        const half = clipHalfPlane(points, p => across(p.x, p.y) * side)
        if (half.length < 3) continue
        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(half, [])) {
            geometry.triangle(
                [a!, b!, c!].map(index => {
                    const p = half[index]!
                    return [p.x, roofAt(p.x, p.y), p.y] as [number, number, number]
                })
            )
        }
    }

    // The gable ends: wall from the eaves' height up to the roof, split where an edge crosses the ridge.
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!
        const b = points[(i + 1) % points.length]!
        const da = across(a.x, a.y)
        const db = across(b.x, b.y)
        const run = [a]
        if (da * db < 0) run.push(a.clone().lerp(b, da / (da - db)))
        run.push(b)
        for (let k = 0; k + 1 < run.length; k++) {
            const p = run[k]!
            const q = run[k + 1]!
            const yp = roofAt(p.x, p.y)
            const yq = roofAt(q.x, q.y)
            if (yp - wallTop < 0.01 && yq - wallTop < 0.01) continue
            geometry.quad([p.x, wallTop, p.y], [q.x, wallTop, q.y], [q.x, yq, q.y], [p.x, yp, p.y])
        }
    }
}

/** The part of a polygon where `side(p) >= 0`, cut along the line where it is 0. */
function clipHalfPlane(points: THREE.Vector2[], side: (p: THREE.Vector2) => number): THREE.Vector2[] {
    const out: THREE.Vector2[] = []
    for (let i = 0; i < points.length; i++) {
        const current = points[i]!
        const previous = points[(i + points.length - 1) % points.length]!
        const sc = side(current)
        const sp = side(previous)
        if (sc >= 0) {
            if (sp < 0) out.push(previous.clone().lerp(current, sp / (sp - sc)))
            out.push(current)
        } else if (sp >= 0) {
            out.push(previous.clone().lerp(current, sp / (sp - sc)))
        }
    }

    return out
}

/**
 * A ring moved `inset` metres into the building, each corner along the
 * bisector of its two edges. Into the building means inwards for an outline
 * and outwards (into the walls around it) for a courtyard.
 */
export function insetRing(ring: number[], inset: number, isHole: boolean): number[] {
    const count = ring.length / 2
    const point = (i: number): [number, number] => {
        const k = ((i % count) + count) % count
        return [ring[k * 2]!, ring[k * 2 + 1]!]
    }

    // Which side of each edge the inside is on depends on which way the ring winds.
    let area = 0
    for (let i = 0; i < count; i++) {
        const [ax, az] = point(i)
        const [bx, bz] = point(i + 1)
        area += ax * bz - bx * az
    }
    const sign = (area > 0 ? 1 : -1) * (isHole ? -1 : 1)
    const inward = (from: [number, number], to: [number, number]): [number, number] => {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
        return [(-(to[1] - from[1]) / length) * sign, ((to[0] - from[0]) / length) * sign]
    }

    const result: number[] = []
    for (let i = 0; i < count; i++) {
        const previous = point(i - 1)
        const current = point(i)
        const next = point(i + 1)
        const n1 = inward(previous, current)
        const n2 = inward(current, next)
        let bx = n1[0] + n2[0]
        let bz = n1[1] + n2[1]
        const length = Math.hypot(bx, bz)
        if (length < 1e-6) [bx, bz] = n1
        else [bx, bz] = [bx / length, bz / length]
        const distance = Math.min(inset / Math.max(bx * n1[0] + bz * n1[1], 1e-6), inset * MAX_MITRE)
        result.push(current[0] + bx * distance, current[1] + bz * distance)
    }

    return result
}

function centroid(ring: number[]): [number, number] {
    let x = 0
    let z = 0
    const count = ring.length / 2
    for (let i = 0; i < count; i++) {
        x += ring[i * 2]! / count
        z += ring[i * 2 + 1]! / count
    }

    return [x, z]
}

function toVectors(ring: number[]): THREE.Vector2[] {
    const points: THREE.Vector2[] = []
    for (let i = 0; i < ring.length; i += 2) points.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
    return points
}

/**
 * The walls' material: each vertex brings its wall and glass colours, and a
 * texture of one window bay (one per style) says, pixel by pixel, which is
 * glass (red), how light the wall is there (green: surrounds, cornice
 * shadows) and how the glass catches the light (blue: mullions, reflections).
 */
function wallMaterial(style: WallStyle): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({
        map: bayTexture(style),
        vertexColors: true,
        side: THREE.DoubleSide,
    })
    material.onBeforeCompile = shader => {
        shader.uniforms.windowsLit = WINDOWS_LIT
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                attribute vec3 glass;
                attribute vec2 metres;
                attribute float material;
                varying vec3 vGlass;
                varying vec2 vMetres;
                varying float vMaterial;`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vGlass = glass;
                vMetres = metres;
                vMaterial = material;`
            )
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vGlass;
                varying vec2 vMetres;
                varying float vMaterial;
                uniform float windowsLit;
                ${MATERIAL_GLSL}`
            )
            .replace(
                '#include <map_fragment>',
                `vec4 bay = texture2D( map, vMapUv );
                vec3 wallColour = vColor.rgb * ( 0.5 + 0.6 * bay.g ) * wallPattern( vMetres, vMaterial );
                vec3 glassColour = vGlass * ( 0.6 + 0.8 * bay.b );
                diffuseColor.rgb = mix( wallColour, glassColour, bay.r );`
            )
            .replace('#include <color_fragment>', '')
            .replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
                // At night, about a third of the windows have the lights on, warm or cool.
                vec2 room = floor( vMetres / vec2( 3.0, 3.4 ) );
                float lit = step( 0.66, wallHash( room ) ) * bay.r * windowsLit;
                totalEmissiveRadiance += lit * mix( vec3( 1.1, 0.78, 0.4 ), vec3( 0.65, 0.72, 0.85 ), step( 0.9, wallHash( room + 7.0 ) ) );`
            )
    }

    return material
}

/** 0 by day, 1 at night: how many windows glow (the atmosphere sets it). Shared by every wall material. */
export const WINDOWS_LIT = { value: 0 }

/**
 * The walls' materials, drawn in metres: brick courses with lighter mortar
 * and a tone per brick, stone blocks with dark joints, concrete panels, wooden
 * boards casting a line of shadow. Each fades out where it would be finer than
 * a pixel, so distant walls don't shimmer.
 */
const MATERIAL_GLSL = `
float wallHash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float wallPattern( vec2 m, float material ) {
    if ( material < 0.5 ) return 1.0;
    float pattern = 1.0;
    vec2 cells;
    if ( material < 1.5 ) {
        cells = vec2( m.x / 0.24, m.y / 0.075 );
        cells.x += mod( floor( cells.y ), 2.0 ) * 0.5;
        vec2 f = fract( cells );
        float mortar = max( step( f.y, 0.14 ), step( f.x, 0.05 ) );
        pattern = mix( 0.9 + 0.16 * wallHash( floor( cells ) ), 1.18, mortar );
    } else if ( material < 2.5 ) {
        cells = vec2( m.x / 0.9, m.y / 0.42 );
        cells.x += mod( floor( cells.y ), 2.0 ) * 0.5;
        vec2 f = fract( cells );
        float joint = max( step( f.y, 0.05 ), step( f.x, 0.025 ) );
        pattern = mix( 0.93 + 0.1 * wallHash( floor( cells ) ), 0.8, joint );
    } else if ( material < 3.5 ) {
        cells = vec2( m.x / 1.5, m.y / 3.0 );
        vec2 f = fract( cells );
        float joint = max( step( f.y, 0.012 ), step( f.x, 0.01 ) );
        pattern = mix( 0.95 + 0.07 * wallHash( floor( cells ) ), 0.82, joint );
    } else {
        cells = vec2( m.x / 4.0, m.y / 0.2 );
        float f = fract( cells.y );
        pattern = 0.88 + 0.16 * f;
    }
    float fineness = max( fwidth( cells.x ), fwidth( cells.y ) );
    return mix( 1.0, pattern, clamp( 1.6 - fineness * 2.5, 0.0, 1.0 ) );
}
`

/** Mask values for the bay textures, 0–1 per channel. */
const WALL = { r: 0, g: 0.85, b: 0.5 }
const SURROUND = { r: 0, g: 1, b: 0.5 }
const SHADOW = { r: 0, g: 0.45, b: 0.5 }
const PANE = { r: 1, g: 0, b: 0.5 }
const MULLION = { r: 1, g: 0, b: 0.15 }
const SHEEN = { r: 1, g: 0, b: 0.68 }

/** One bay of wall, one floor high, for a window style; drawn on a canvas, (0, 0) its top left. */
function bayTexture(style: WallStyle): THREE.Texture {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')!
    const fill = (mask: { r: number; g: number; b: number }, x0: number, y0: number, x1: number, y1: number) => {
        context.fillStyle = `rgb(${mask.r * 255} ${mask.g * 255} ${mask.b * 255})`
        context.fillRect(x0 * size, y0 * size, (x1 - x0) * size, (y1 - y0) * size)
    }
    fill(WALL, 0, 0, 1, 1)

    switch (style) {
        case 'punched':
            fill(SHADOW, 0, 0, 1, 0.06)
            fill(SURROUND, 0.27, 0.2, 0.73, 0.84)
            fill(PANE, 0.32, 0.24, 0.68, 0.79)
            fill(SHEEN, 0.32, 0.24, 0.42, 0.5)
            fill(MULLION, 0.49, 0.24, 0.51, 0.79)
            break
        case 'square':
            fill(SHADOW, 0, 0, 1, 0.05)
            fill(SURROUND, 0.28, 0.3, 0.72, 0.72)
            fill(PANE, 0.32, 0.34, 0.68, 0.68)
            fill(SHEEN, 0.32, 0.34, 0.42, 0.5)
            fill(SHADOW, 0.26, 0.72, 0.74, 0.76)
            break
        case 'arched':
            fill(SHADOW, 0, 0, 1, 0.06)
            fill(SURROUND, 0.27, 0.3, 0.73, 0.84)
            fill(PANE, 0.32, 0.36, 0.68, 0.8)
            context.fillStyle = `rgb(${SURROUND.r * 255} ${SURROUND.g * 255} ${SURROUND.b * 255})`
            context.beginPath()
            context.arc(0.5 * size, 0.3 * size, 0.23 * size, Math.PI, 0)
            context.fill()
            context.fillStyle = `rgb(${PANE.r * 255} ${PANE.g * 255} ${PANE.b * 255})`
            context.beginPath()
            context.arc(0.5 * size, 0.36 * size, 0.18 * size, Math.PI, 0)
            context.fill()
            fill(MULLION, 0.49, 0.2, 0.51, 0.8)
            break
        case 'ribbon':
            fill(SHADOW, 0, 0.28, 1, 0.31)
            fill(PANE, 0, 0.31, 1, 0.78)
            fill(SHEEN, 0, 0.31, 0.25, 0.5)
            fill(MULLION, 0, 0.31, 0.03, 0.78)
            fill(MULLION, 0.5, 0.31, 0.53, 0.78)
            break
        case 'curtain':
            fill(PANE, 0, 0, 1, 0.86)
            fill(SHEEN, 0.04, 0.05, 0.4, 0.4)
            fill(WALL, 0, 0, 0.05, 1)
            fill(SHADOW, 0, 0.86, 1, 0.88)
            break
        case 'plain':
            break
    }

    const texture = new THREE.CanvasTexture(canvas)
    // Masks, not colours: no sRGB decoding.
    texture.colorSpace = THREE.NoColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8

    return texture
}
