import { readdir } from 'node:fs/promises'
import { type CourseSpec, parseCourse } from './courses.ts'
import { type Bounds, convertMap, type ElevationGrid, type LatLon, type OsmElement, projector } from './convert.ts'
import { type DecorFile, parseDecor } from './decor.ts'
import type { RaceMap } from './format.ts'
import {
    type Fingerprint,
    type Landmark,
    landmarkKey,
    parseLandmark,
    type Review,
    reviewLandmarks,
} from './landmarks.ts'
import type { LidarGrid } from './lidar.ts'
import { type LooksFile, parseLooks } from './looks.ts'
import type { CityTree } from './trees.ts'

/**
 * How a map is made, as three layers:
 *
 *   maps/<slug>/snapshot/    raw OSM, elevation and the city's trees, gzipped, committed; only `--refresh…` rewrites it
 *   maps/<slug>/landmarks/   hand-made detail, one JSON file per landmark
 *   maps/<slug>/decor/       hand-made fountains, statues, gardens…, one JSON file per place
 *   maps/<slug>/looks.json   ordinary buildings' real colours and windows, by OSM element
 *   maps/<slug>/courses/     default race tracks the Hub seeds its database with (not part of map.json)
 *   maps/<slug>/map.json     what the game loads, always generated from the two above
 *
 * The same snapshot and landmarks always build the same map.json byte for
 * byte; a test holds the committed map.json to that, so nobody edits it by hand.
 */

export interface MapConfig {
    slug: string
    name: string
    bounds: Bounds
    /** Elevation sample spacing in metres; the model itself is about 20 m. */
    cell: number
    /**
     * A river the elevation model can't tell from its shore: the OSM
     * relation whose shoreline bounds it, and a point known to be water.
     */
    river: { relation: number; sample: LatLon }
    /** The lidar survey's sheets covering the map: GeoTIFFs of heights above the ground (fetch.ts). */
    lidar?: string[]
}

/** Where the MRNF publishes the lidar survey's products, one folder per 1:20 000 sheet. */
const LIDAR = 'https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/IMAGERIE/Produits_derives_LiDAR'

export const MAPS: Record<string, MapConfig> = {
    'quebec-plains': {
        slug: 'quebec-plains',
        name: 'Québec — Plaines d’Abraham et Vieux-Québec',
        bounds: { south: 46.792, west: -71.253, north: 46.8175, east: -71.199 },
        cell: 16,
        // The St. Lawrence: its surface reads 4 m, like the shore road.
        river: { relation: 2426031, sample: { lat: 46.7922, lon: -71.214 } },
        // 21L14SE covers all but the westmost 180 m (in 21L14SO, left out: a whole gigabyte for a sliver).
        lidar: [`${LIDAR}/21L/21L14SE/MHC_21L14SE.tif`],
    },
}

export interface SnapshotMeta {
    bounds: Bounds
    cell: number
    /** ISO dates of the downloads. */
    osmFetchedAt: string
    elevationFetchedAt: string
    treesFetchedAt: string
    lidarFetchedAt?: string
}

export interface Snapshot {
    meta: SnapshotMeta
    osm: OsmElement[]
    nodes: OsmElement[]
    shore: LatLon[][]
    elevation: ElevationGrid
    /** The city of Québec's inventory of the trees on the map. */
    trees: CityTree[]
    /** Heights above the ground from the lidar survey, on the map's grid; null before `--refresh-lidar`. */
    lidar: LidarGrid | null
}

const MAPS_DIR = `${import.meta.dir}/../../../maps`
const SNAPSHOT_PARTS = ['osm', 'nodes', 'shore', 'elevation', 'trees'] as const

/** The JSON schemas landmark, decor and course files point their editors at. */
export const LANDMARK_SCHEMA = `${MAPS_DIR}/landmark.schema.json`
export const DECOR_SCHEMA = `${MAPS_DIR}/decor.schema.json`
export const LOOKS_SCHEMA = `${MAPS_DIR}/looks.schema.json`
export const COURSE_SCHEMA = `${MAPS_DIR}/course.schema.json`

export function mapDir(slug: string): string {
    return `${MAPS_DIR}/${slug}`
}

export function mapFile(slug: string): string {
    return `${mapDir(slug)}/map.json`
}

export async function readSnapshot(slug: string): Promise<Snapshot | null> {
    const dir = `${mapDir(slug)}/snapshot`
    const metaFile = Bun.file(`${dir}/meta.json`)
    if (!(await metaFile.exists())) return null

    const parts = await Promise.all(
        SNAPSHOT_PARTS.map(async part => {
            const file = Bun.file(`${dir}/${part}.json.gz`)
            // Snapshots from before the city's trees were added have none until `--refresh-trees`.
            if (part === 'trees' && !(await file.exists())) return []
            const zipped = await file.arrayBuffer()
            return JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(zipped))))
        })
    )
    const [osm, nodes, shore, elevation, trees] = parts as [
        OsmElement[],
        OsmElement[],
        LatLon[][],
        ElevationGrid,
        CityTree[],
    ]

    return {
        meta: (await metaFile.json()) as SnapshotMeta,
        osm,
        nodes,
        shore,
        elevation,
        trees,
        lidar: await readLidar(dir),
    }
}

/** The lidar heights: a little header (columns, rows, cell size) and a byte a cell, gzipped. */
async function readLidar(dir: string): Promise<LidarGrid | null> {
    const file = Bun.file(`${dir}/lidar.bin.gz`)
    if (!(await file.exists())) return null
    const bytes = Bun.gunzipSync(new Uint8Array(await file.arrayBuffer()))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    return {
        cols: view.getUint32(0, true),
        rows: view.getUint32(4, true),
        cell: view.getFloat32(8, true),
        heights: bytes.slice(12),
    }
}

export async function writeLidar(slug: string, grid: LidarGrid): Promise<void> {
    const bytes = new Uint8Array(12 + grid.heights.length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, grid.cols, true)
    view.setUint32(4, grid.rows, true)
    view.setFloat32(8, grid.cell, true)
    bytes.set(grid.heights, 12)
    await Bun.write(`${mapDir(slug)}/snapshot/lidar.bin.gz`, Bun.gzipSync(bytes, { level: 9 }))
}

export async function writeSnapshot(slug: string, snapshot: Snapshot): Promise<void> {
    const dir = `${mapDir(slug)}/snapshot`
    for (const part of SNAPSHOT_PARTS) {
        await Bun.write(
            `${dir}/${part}.json.gz`,
            Bun.gzipSync(new TextEncoder().encode(JSON.stringify(snapshot[part])))
        )
    }
    if (snapshot.lidar) await writeLidar(slug, snapshot.lidar)
    await Bun.write(`${dir}/meta.json`, `${JSON.stringify(snapshot.meta, null, 4)}\n`)
}

/** Whether the snapshot covers exactly what the config asks for; a changed area or grid needs a refresh. */
export function snapshotMatches(meta: SnapshotMeta, config: MapConfig): boolean {
    const { bounds } = meta
    return (
        meta.cell === config.cell &&
        bounds.south === config.bounds.south &&
        bounds.west === config.bounds.west &&
        bounds.north === config.bounds.north &&
        bounds.east === config.bounds.east
    )
}

export interface LandmarkFile {
    path: string
    landmark: Landmark
}

/** Every landmark file of a map, checked; throws on the first invalid one, naming its problems. */
export async function readLandmarks(slug: string): Promise<LandmarkFile[]> {
    const dir = `${mapDir(slug)}/landmarks`
    const names = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith('.json')).sort()

    const files: LandmarkFile[] = []
    for (const name of names) {
        const path = `${dir}/${name}`
        files.push({ path, landmark: parseLandmark(await Bun.file(path).json(), `landmarks/${name}`) })
    }

    const seen = new Set<string>()
    for (const { path, landmark } of files) {
        const key = landmarkKey(landmark.osm, landmark.id)
        if (seen.has(key)) throw new Error(`${path}: ${key} already has a landmark file`)
        seen.add(key)
    }

    return files
}

/** Every decor file of a map, checked; throws on the first invalid one, naming its problems. */
export async function readDecor(slug: string): Promise<DecorFile[]> {
    const dir = `${mapDir(slug)}/decor`
    const names = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith('.json')).sort()

    const files: DecorFile[] = []
    for (const name of names) files.push(parseDecor(await Bun.file(`${dir}/${name}`).json(), `decor/${name}`))

    return files
}

/** A map's looks file, checked; none yet is no looks. */
export async function readLooks(slug: string): Promise<LooksFile> {
    const file = Bun.file(`${mapDir(slug)}/looks.json`)
    if (!(await file.exists())) return { buildings: {} }

    return parseLooks(await file.json(), 'looks.json')
}

export interface CourseFile {
    path: string
    slug: string
    spec: CourseSpec
}

/** A map's default tracks, checked; throws on the first invalid one, naming its problems. */
export async function readCourses(slug: string): Promise<CourseFile[]> {
    const dir = `${mapDir(slug)}/courses`
    const names = (await readdir(dir).catch(() => [] as string[])).filter(name => name.endsWith('.json')).sort()

    const files: CourseFile[] = []
    for (const name of names) {
        const path = `${dir}/${name}`
        files.push({ path, slug: name.slice(0, -5), spec: parseCourse(await Bun.file(path).json(), `courses/${name}`) })
    }

    return files
}

/** Writes a landmark's new fingerprint into its file, leaving the rest as it was. */
export async function stampLandmark(path: string, fingerprint: Fingerprint): Promise<void> {
    const contents = (await Bun.file(path).json()) as Record<string, unknown>
    await Bun.write(path, `${JSON.stringify({ ...contents, fingerprint }, null, 4)}\n`)
}

export function buildMap(
    config: MapConfig,
    snapshot: Snapshot,
    landmarks: Landmark[],
    decor: DecorFile[] = [],
    looks: LooksFile = { buildings: {} }
): RaceMap {
    return convertMap(config.name, config.bounds, snapshot.osm, snapshot.elevation, config.cell, {
        river: { shore: snapshot.shore, sample: config.river.sample },
        nodes: snapshot.nodes,
        cityTrees: snapshot.trees,
        lidar: snapshot.lidar,
        landmarks,
        decor,
        looks: looks.buildings,
    })
}

/** Checks each landmark against the footprint its OSM element has in the built map. */
export function reviewMap(config: MapConfig, map: RaceMap, landmarks: Landmark[]): Review[] {
    const footprints = new Map<string, number[]>()
    for (const building of map.buildings) {
        const key = landmarkKey(building.relation ? 'relation' : 'way', building.id)
        if (!footprints.has(key)) footprints.set(key, building.outline)
    }

    return reviewLandmarks(landmarks, footprints, projector(config.bounds).unproject)
}

/** The map as written to map.json. */
export function serialise(map: RaceMap): string {
    return JSON.stringify(map)
}
