import * as THREE from 'three'
import type { Arcade, Building, BuildingDetail, Look, Roof, WindowGrid } from '../map/format.ts'
import { addArcade, addFins, addParapet, Geometry } from './facades.ts'

/**
 * Landmarks with hand-made detail: walls with rows of windows, or concrete
 * fins and a ground floor of arches (facades.ts), and mansard, pyramid or
 * flat roofs on the building and on each of its pavilions and towers. Each
 * landmark is a few meshes; the rest of the city stays boxes.
 */

/** A roof edge may be pushed in at most this many times the inset, so a sharp corner can't shoot a spike. */
const MAX_MITRE = 2

export function buildLandmarks(buildings: Building[]): THREE.Group {
    const group = new THREE.Group()

    for (const building of buildings) {
        if (building.detail) group.add(buildLandmark(building, building.detail))
    }

    return group
}

function buildLandmark(building: Building, detail: BuildingDetail): THREE.Group {
    // Windowed walls, one geometry per texture; everything else, one per colour.
    const windowed = new Map<string, { geometry: Geometry; wall: string; windows?: WindowGrid }>()
    const solids = new Map<string, Geometry>()
    const solid = (colour: string) => {
        const geometry = solids.get(colour) ?? new Geometry()
        solids.set(colour, geometry)
        return geometry
    }

    /** One ring's walls from `base` to `top`, in its look, with a parapet if its roof has one. */
    const addRing = (ring: number[], isHole: boolean, base: number, top: number, look: Look, roof?: Roof) => {
        const arcade = isHole ? undefined : look.arcade
        if (look.fins) {
            addWalls(solid(look.fins.recess), ring, base, top, arcade)
            const parapet = roof?.shape === 'flat' ? (roof.parapet ?? 0) + roof.height : 0
            if (!isHole) addFins(solid(look.wall), ring, base, top + parapet, look.fins, arcade)
        } else {
            const key = `${look.wall}|${look.windows?.floor}|${look.windows?.spacing}`
            const entry = windowed.get(key) ?? { geometry: new Geometry(), wall: look.wall, windows: look.windows }
            windowed.set(key, entry)
            addWalls(entry.geometry, ring, base, top, arcade)
        }
        if (arcade) addArcade(solid(look.wall), solid(look.fins?.recess ?? ARCADE_RECESS), ring, base, arcade)
    }

    const holes = building.holes ?? []
    addRing(building.outline, false, building.base, detail.wallTop, detail, detail.roof)
    for (const hole of holes) addRing(hole, true, building.base, detail.wallTop, detail, detail.roof)
    if (detail.roof) addRoof(solid(detail.roof.colour), building.outline, holes, detail.wallTop, detail.roof)
    addParapetFor(
        solid(detail.wall),
        [{ ring: building.outline, isHole: false }, ...holes.map(ring => ({ ring, isHole: true }))],
        detail.wallTop,
        detail.roof
    )

    for (const part of detail.parts) {
        const look = part.look ?? detail
        addRing(part.outline, false, part.base, part.wallTop, look, part.roof)
        if (part.roof) addRoof(solid(part.roof.colour), part.outline, [], part.wallTop, part.roof)
        addParapetFor(solid(look.wall), [{ ring: part.outline, isHole: false }], part.wallTop, part.roof)
    }

    const group = new THREE.Group()
    for (const { geometry, wall, windows } of windowed.values()) {
        group.add(toMesh(geometry, new THREE.MeshLambertMaterial({ map: windowTexture(wall, windows) })))
    }
    for (const [colour, geometry] of solids) {
        group.add(toMesh(geometry, new THREE.MeshLambertMaterial({ color: colour, flatShading: true })))
    }
    // The viewer's identify tool: every triangle here is this building.
    for (const mesh of group.children) mesh.userData.identify = () => building

    return group
}

/** The back of an arcade's openings when the walls have no recess colour of their own. */
const ARCADE_RECESS = '#2f3438'

function addParapetFor(
    geometry: Geometry,
    rings: { ring: number[]; isHole: boolean }[],
    wallTop: number,
    roof?: Roof
): void {
    if (roof?.shape === 'flat' && roof.parapet) addParapet(geometry, rings, wallTop + roof.height, roof.parapet)
}

function toMesh(geometry: Geometry, material: THREE.Material): THREE.Mesh {
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(geometry.positions, 3))
    buffer.setAttribute('uv', new THREE.Float32BufferAttribute(geometry.uvs, 2))
    buffer.computeVertexNormals()
    material.side = THREE.DoubleSide

    return new THREE.Mesh(buffer, material)
}

/**
 * Vertical walls round a ring, from `base` to `top`; on an arcade's edges
 * they start above it. The texture runs in metres (u along the wall, v up
 * it), so windows keep their size on every wall, whatever its angle.
 */
function addWalls(geometry: Geometry, ring: number[], base: number, top: number, arcade?: Arcade): void {
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
 * roof's height, and the top is flat. A pyramid: every edge slopes to a
 * point over the middle. A flat roof is just the top.
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

    const inset = roof.shape === 'flat' ? 0 : (roof.inset ?? roof.height / 2)
    const rings = [
        { lower: outline, upper: insetRing(outline, inset, false) },
        ...holes.map(hole => ({ lower: hole, upper: insetRing(hole, inset, true) })),
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

    // The flat top, with the courtyards cut out of it.
    const toVectors = (ring: number[]) => {
        const points: THREE.Vector2[] = []
        for (let i = 0; i < ring.length; i += 2) points.push(new THREE.Vector2(ring[i]!, ring[i + 1]!))
        return points
    }
    const contour = toVectors(rings[0]!.upper)
    const cutouts = rings.slice(1).map(ring => toVectors(ring.upper))
    const all = [contour, ...cutouts].flat()
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, cutouts)) {
        geometry.triangle([a!, b!, c!].map(index => [all[index]!.x, top, all[index]!.y] as [number, number, number]))
    }
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

/**
 * One window bay, repeated over the walls: stone, a cornice line at each
 * floor, and a tall window with a pale surround.
 */
function windowTexture(wall: string, grid: WindowGrid | undefined): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 80
    const context = canvas.getContext('2d')!
    context.fillStyle = wall
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (grid) {
        context.fillStyle = 'rgb(0 0 0 / 0.12)'
        context.fillRect(0, 0, canvas.width, 5)
        context.fillStyle = 'rgb(255 255 255 / 0.35)'
        context.fillRect(17, 18, 30, 48)
        context.fillStyle = '#3c4852'
        context.fillRect(20, 21, 24, 42)
        context.fillStyle = 'rgb(255 255 255 / 0.25)'
        context.fillRect(31, 21, 2, 42)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    // Texture coordinates are in metres: one bay per window spacing and floor.
    texture.repeat.set(1 / (grid?.spacing ?? 1), 1 / (grid?.floor ?? 1))
    texture.anisotropy = 8

    return texture
}
