import { fetchElevation, fetchNodes, fetchOsm, fetchShore } from './fetch.ts'
import type { Review } from './landmarks.ts'
import {
    buildMap,
    MAPS,
    mapFile,
    readLandmarks,
    readSnapshot,
    reviewMap,
    serialise,
    type Snapshot,
    snapshotMatches,
    stampLandmark,
    writeSnapshot,
} from './pipeline.ts'

/**
 * Builds a racing map from its committed snapshot and landmark files:
 *
 *   bun run race:map                       rebuild map.json from the snapshot (offline, seconds)
 *   bun run race:map --refresh             download fresh OSM data into the snapshot first
 *   bun run race:map --refresh-elevation   …and fresh elevation too (minutes)
 *   bun run race:map --accept              trust the landmarks as they are now (stamps their fingerprints)
 *
 * After a refresh, landmarks whose OSM footprint vanished or changed are
 * reported and the map isn't written until someone looks: fix or delete an
 * orphaned landmark's file; check a stale one in the viewer, then --accept.
 */

const flags = new Set(process.argv.slice(2).filter(arg => arg.startsWith('--')))
const slug = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'quebec-plains'
const config = MAPS[slug]
if (!config) throw new Error(`No map "${slug}"; known: ${Object.keys(MAPS).join(', ')}`)

let snapshot = await readSnapshot(slug)
const coversArea = snapshot !== null && snapshotMatches(snapshot.meta, config)

if (flags.has('--refresh') || flags.has('--refresh-elevation')) {
    snapshot = await refresh(snapshot, coversArea && !flags.has('--refresh-elevation'))
} else if (!coversArea) {
    console.error(
        snapshot
            ? 'The snapshot covers another area or grid than the config: run with --refresh to download this one.'
            : 'No snapshot yet: run with --refresh to download one (the elevation takes several minutes).'
    )
    process.exit(1)
}

const landmarks = await readLandmarks(slug)
const map = buildMap(
    config,
    snapshot!,
    landmarks.map(file => file.landmark)
)
const reviews = reviewMap(
    config,
    map,
    landmarks.map(file => file.landmark)
)

if (flags.has('--accept')) {
    for (const review of reviews) {
        if ((review.status === 'stale' || review.status === 'unstamped') && review.current) {
            const file = landmarks.find(f => f.landmark === review.landmark)!
            await stampLandmark(file.path, review.current)
            review.status = 'ok'
            review.reason = 'accepted'
        }
    }
}

report(reviews)

const blocking = reviews.filter(review => review.status === 'orphaned' || review.status === 'stale')
if (blocking.length > 0) {
    console.error(
        `\nNot writing ${slug}/map.json: ${blocking.length} landmark(s) need a look. ` +
            'Fix or delete orphaned files; check stale ones in the viewer, then rerun with --accept.'
    )
    process.exit(1)
}

await Bun.write(mapFile(slug), serialise(map))
console.log(
    `\n${slug}: ${map.width} × ${map.depth} m, ${map.buildings.length} buildings ` +
        `(${map.buildings.filter(b => b.detail).length} detailed), ${map.roads.length} roads, ` +
        `${map.walls.length} walls, ${map.props.signals.length / 5} traffic lights, ${map.stops.length / 5} stop signs`
)

/** Downloads fresh OSM data, and elevation unless `keepElevation`, into the snapshot. */
async function refresh(previous: Snapshot | null, keepElevation: boolean): Promise<Snapshot> {
    const now = new Date().toISOString()
    const [osm, nodes, shore] = [await fetchOsm(config!), await fetchNodes(config!), await fetchShore(config!)]
    const elevation = keepElevation ? previous!.elevation : await fetchElevation(config!)

    const next: Snapshot = {
        meta: {
            bounds: config!.bounds,
            cell: config!.cell,
            osmFetchedAt: now,
            elevationFetchedAt: keepElevation ? previous!.meta.elevationFetchedAt : now,
        },
        osm,
        nodes,
        shore,
        elevation,
    }

    await writeSnapshot(slug, next)
    if (previous) {
        console.log(
            `Snapshot refreshed: ${previous.osm.length} → ${osm.length} OSM elements, ` +
                `${previous.nodes.length} → ${nodes.length} points`
        )
    }

    return next
}

function report(reviews: Review[]): void {
    if (reviews.length === 0) return

    const symbol = { ok: '✓', unstamped: '·', stale: '!', orphaned: '✗' }
    console.log('Landmarks:')
    for (const { landmark, status, reason } of reviews) {
        const note = status === 'unstamped' ? 'no fingerprint yet: rerun with --accept once it looks right' : reason
        console.log(
            `  ${symbol[status]} ${landmark.osm}/${landmark.id} ${landmark.name}  ${status}${note ? ` (${note})` : ''}`
        )
    }
}
