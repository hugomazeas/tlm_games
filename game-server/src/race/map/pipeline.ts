import { readdir } from 'node:fs/promises'
import { type Bounds, convertMap, type ElevationGrid, type LatLon, type OsmElement, projector } from './convert.ts'
import type { RaceMap } from './format.ts'
import {
    type Fingerprint,
    type Landmark,
    landmarkKey,
    parseLandmark,
    type Review,
    reviewLandmarks,
} from './landmarks.ts'

/**
 * How a map is made, as three layers:
 *
 *   maps/<slug>/snapshot/    raw OSM and elevation, gzipped, committed; only `--refresh` rewrites it
 *   maps/<slug>/landmarks/   hand-made detail, one JSON file per landmark
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
}

export const MAPS: Record<string, MapConfig> = {
    'quebec-plains': {
        slug: 'quebec-plains',
        name: 'Québec — Plaines d’Abraham et Vieux-Québec',
        bounds: { south: 46.792, west: -71.253, north: 46.8175, east: -71.199 },
        cell: 16,
        // The St. Lawrence: its surface reads 4 m, like the shore road.
        river: { relation: 2426031, sample: { lat: 46.7922, lon: -71.214 } },
    },
}

export interface SnapshotMeta {
    bounds: Bounds
    cell: number
    /** ISO dates of the downloads. */
    osmFetchedAt: string
    elevationFetchedAt: string
}

export interface Snapshot {
    meta: SnapshotMeta
    osm: OsmElement[]
    nodes: OsmElement[]
    shore: LatLon[][]
    elevation: ElevationGrid
}

const MAPS_DIR = `${import.meta.dir}/../../../maps`
const SNAPSHOT_PARTS = ['osm', 'nodes', 'shore', 'elevation'] as const

/** The JSON schema landmark files point their editors at. */
export const LANDMARK_SCHEMA = `${MAPS_DIR}/landmark.schema.json`

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
            const zipped = await Bun.file(`${dir}/${part}.json.gz`).arrayBuffer()
            return JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(zipped))))
        })
    )
    const [osm, nodes, shore, elevation] = parts as [OsmElement[], OsmElement[], LatLon[][], ElevationGrid]

    return { meta: (await metaFile.json()) as SnapshotMeta, osm, nodes, shore, elevation }
}

export async function writeSnapshot(slug: string, snapshot: Snapshot): Promise<void> {
    const dir = `${mapDir(slug)}/snapshot`
    for (const part of SNAPSHOT_PARTS) {
        await Bun.write(
            `${dir}/${part}.json.gz`,
            Bun.gzipSync(new TextEncoder().encode(JSON.stringify(snapshot[part])))
        )
    }
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

/** Writes a landmark's new fingerprint into its file, leaving the rest as it was. */
export async function stampLandmark(path: string, fingerprint: Fingerprint): Promise<void> {
    const contents = (await Bun.file(path).json()) as Record<string, unknown>
    await Bun.write(path, `${JSON.stringify({ ...contents, fingerprint }, null, 4)}\n`)
}

export function buildMap(config: MapConfig, snapshot: Snapshot, landmarks: Landmark[]): RaceMap {
    return convertMap(config.name, config.bounds, snapshot.osm, snapshot.elevation, config.cell, {
        river: { shore: snapshot.shore, sample: config.river.sample },
        nodes: snapshot.nodes,
        landmarks,
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
