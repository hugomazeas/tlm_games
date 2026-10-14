import { constants, inflateSync } from 'node:zlib'
import { type ElevationGrid, type LatLon, type OsmElement, projector } from './convert.ts'
import { type LidarGrid, resampleSurvey, type SurveyPatch, toMtm7 } from './lidar.ts'
import type { MapConfig } from './pipeline.ts'
import type { CityTree } from './trees.ts'

/**
 * Downloads a map's raw data: OpenStreetMap through Overpass, elevation from
 * the federal CDEM profile service, the city of Québec's tree inventory from
 * Données Québec, and heights above the ground from Québec's lidar survey.
 * All free and keyless. Only `build.ts --refresh…` calls this; every other
 * build reads the committed snapshot.
 */

const USER_AGENT = 'tlm-games-racing-map/0.1'
/** The main Overpass instance, then a mirror for when it's overloaded. */
const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const PROFILE_URL = 'https://geogratis.gc.ca/services/elevation/cdem/profile'
/** Elevation rows fetched at once: enough to be quick, few enough to be a polite client. */
const PARALLEL_REQUESTS = 3

function box({ bounds }: MapConfig): string {
    return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
}

export async function fetchOsm(config: MapConfig): Promise<OsmElement[]> {
    const area = box(config)
    // The St. Lawrence is one estuary relation hundreds of km long, so water
    // relations are left out: the river comes from its shoreline instead.
    const query = `[out:json][timeout:180];
(
  way[building](${area});
  relation[building][type=multipolygon](${area});
  way[highway](${area});
  way[natural=water](${area});
  way[leisure~"^(park|pitch|garden|golf_course)$"](${area});
  relation[leisure~"^(park|pitch|garden|golf_course)$"](${area});
  way[landuse~"^(grass|forest|recreation_ground|cemetery|meadow)$"](${area});
  relation[landuse~"^(grass|forest|recreation_ground|cemetery|meadow)$"](${area});
  way[natural~"^(wood|scrub|grassland)$"](${area});
  relation[natural~"^(wood|scrub|grassland)$"](${area});
  way[amenity=parking](${area});
  way[barrier=city_wall](${area});
  way["building:part"](${area});
  way[natural=tree_row](${area});
  way[barrier=hedge](${area});
  way[landuse=flowerbed](${area});
  way[amenity=fountain](${area});
);
out geom;`

    console.log('Fetching OpenStreetMap…')
    return overpass(query)
}

/** Street furniture, crossings and stop signs, mapped as single points. */
export async function fetchNodes(config: MapConfig): Promise<OsmElement[]> {
    const area = box(config)
    const query = `[out:json][timeout:90];
(
  node[natural=tree](${area});
  node[highway~"^(crossing|traffic_signals|bus_stop|stop|street_lamp)$"](${area});
  node[amenity~"^(bench|fountain)$"](${area});
  node[historic~"^(memorial|monument)$"](${area});
  node[tourism=artwork](${area});
);
out;`

    console.log('Fetching trees, crossings, lights, stop signs, lamps, benches, fountains and monuments…')
    return overpass(query)
}

/**
 * The city of Québec's inventory of the trees it looks after ("Arbres
 * répertoriés", Données Québec, CC BY 4.0): species, trunk diameter, position.
 * One CSV for the whole city, about 25 MB; only the trees on the map are kept.
 */
const CITY_TREES_URL =
    'https://www.donneesquebec.ca/recherche/dataset/34103a43-3712-4a29-92e1-039e9188e915/resource/13a51853-a5b5-4add-8791-02ccba5c1be7/download/vdq-arbrerepertorie.csv'

export async function fetchCityTrees(config: MapConfig): Promise<CityTree[]> {
    console.log('Fetching the city of Québec’s tree inventory…')
    const response = await fetch(CITY_TREES_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`The tree inventory answered ${response.status}`)

    return cityTreesFromCsv(await response.text(), config.bounds)
}

/** The inventory's rows inside the bounds, sorted by position so a refresh diffs cleanly. */
export function cityTreesFromCsv(csv: string, bounds: MapConfig['bounds']): CityTree[] {
    const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ''))
    const column = (name: string) => {
        const index = header!.indexOf(name)
        if (index < 0) throw new Error(`The tree inventory has no ${name} column`)
        return index
    }
    const [lat, lon, taxon, type, diameter, measure] = [
        'LATITUDE',
        'LONGITUDE',
        'NOM_LATIN',
        'TYPE_ARBRE',
        'DIAMETRE',
        'POSITION_MESURE',
    ].map(column) as [number, number, number, number, number, number]

    const trees: CityTree[] = []
    for (const row of rows) {
        const point = { lat: parseFloat(row[lat] ?? ''), lon: parseFloat(row[lon] ?? '') }
        if (!(point.lat >= bounds.south && point.lat <= bounds.north)) continue
        if (!(point.lon >= bounds.west && point.lon <= bounds.east)) continue
        const size = parseFloat(row[diameter] ?? '')
        trees.push({
            lat: Math.round(point.lat * 1e7) / 1e7,
            lon: Math.round(point.lon * 1e7) / 1e7,
            taxon: (row[taxon] ?? '').trim(),
            ...(row[type] === 'Conifère' ? { conifer: true as const } : {}),
            ...(size > 0 ? { diameter: size } : {}),
            ...(row[measure] === 'DHS' ? { stump: true as const } : {}),
        })
    }

    return trees.sort((a, b) => a.lat - b.lat || a.lon - b.lon)
}

/** Rows of a CSV file, quoted fields (with commas, quotes and line breaks in them) included. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]!
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"'
                i++
            } else if (char === '"') quoted = false
            else field += char
        } else if (char === '"') quoted = true
        else if (char === ',') {
            row.push(field)
            field = ''
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++
            row.push(field)
            rows.push(row)
            row = []
            field = ''
        } else field += char
    }
    if (field !== '' || row.length > 0) {
        row.push(field)
        rows.push(row)
    }

    return rows
}

/** Only the river relation's members that cross the map, not the hundreds of km of the rest. */
export async function fetchShore(config: MapConfig): Promise<LatLon[][]> {
    const query = `[out:json][timeout:60];relation(${config.river.relation});way(r)(${box(config)});out geom;`

    console.log('Fetching the shoreline…')
    return (await overpass(query)).map(way => way.geometry ?? [])
}

/**
 * Asks Overpass, retrying on the main instance while it's busy (429, 504, or
 * a 200 carrying an HTML error page), then falling back on the mirror.
 */
async function overpass(query: string): Promise<OsmElement[]> {
    for (const url of OVERPASS_URLS) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ data: query }),
            })
            const body = await response.text()
            if (response.ok && body.trimStart().startsWith('{')) {
                return (JSON.parse(body) as { elements: OsmElement[] }).elements
            }
            console.log(`${new URL(url).host} is busy (${response.status}), retrying…`)
            await Bun.sleep(5_000 * attempt)
        }
    }

    throw new Error('Every Overpass instance is busy; try again later')
}

/**
 * Samples the elevation on the map grid, one east-west profile per row, the
 * north row first. Takes a few minutes for a few km².
 */
export async function fetchElevation(config: MapConfig): Promise<ElevationGrid> {
    const { south, west, north, east } = config.bounds
    const { project } = projector(config.bounds)
    const [left, top] = project({ lat: north, lon: west })
    const [right, bottom] = project({ lat: south, lon: east })
    const cols = Math.round((right - left) / config.cell) + 1
    const rows = Math.round((bottom - top) / config.cell) + 1

    const grid: ElevationGrid = new Array(rows)
    let next = 0
    let done = 0

    const worker = async () => {
        while (next < rows) {
            const row = next++
            const lat = north - ((north - south) * row) / (rows - 1)
            grid[row] = await fetchProfile(lat, west, east, cols)
            done++
            if (done % 10 === 0 || done === rows) console.log(`Elevation: ${done}/${rows} rows`)
        }
    }

    console.log(`Fetching elevation, ${cols} × ${rows} samples…`)
    await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker))

    return grid
}

/** `count` evenly spaced heights along a line, ends included. The service counts `steps` as points between the ends. */
async function fetchProfile(lat: number, west: number, east: number, count: number): Promise<number[]> {
    const url = new URL(PROFILE_URL)
    url.searchParams.set('path', `LINESTRING(${west} ${lat},${east} ${lat})`)
    url.searchParams.set('steps', String(count - 2))

    // Under load the service sometimes answers with an empty list: worth another try, like an error status.
    for (let attempt = 1; ; attempt++) {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
        const points = response.ok ? ((await response.json()) as { altitude: number | null }[]) : []
        if (points.length === count) return points.map(point => point.altitude ?? 0)
        if (attempt === 4) {
            throw new Error(`Elevation answered ${response.status} with ${points.length}/${count} points`)
        }
        await Bun.sleep(2000 * attempt)
    }
}

/**
 * Heights above the ground from Québec's lidar survey (MRNF, "Produits dérivés
 * du lidar", CC BY 4.0): one 1 m GeoTIFF per 1:20 000 sheet, over a gigabyte
 * each. Their rows are stored one deflated strip apiece, so only the rows
 * crossing the map are fetched, and only the start of each when the map sits
 * at the sheet's west end. The server's firewall turns away requests for more
 * than about five ranges, so they go four at a time.
 */
export async function fetchLidar(config: MapConfig): Promise<LidarGrid> {
    const { project, unproject } = projector(config.bounds)
    const [west, north] = project({ lat: config.bounds.north, lon: config.bounds.west })
    const [east, south] = project({ lat: config.bounds.south, lon: config.bounds.east })
    const width = Math.round((east - west) * 10) / 10
    const depth = Math.round((south - north) * 10) / 10

    const patches: SurveyPatch[] = []
    for (const url of config.lidar ?? []) {
        const patch = await fetchSurveyPatch(url, config)
        if (patch) patches.push(patch)
    }
    console.log('Fitting the survey to the map’s grid…')

    return resampleSurvey(patches, width, depth, unproject)
}

/** A margin round the map so its edge cells find their four pixels. */
const SURVEY_MARGIN = 10
const RANGES_PER_REQUEST = 4
const PARALLEL_SURVEY_REQUESTS = 4

async function fetchSurveyPatch(url: string, config: MapConfig): Promise<SurveyPatch | null> {
    const name = url.split('/').at(-1)
    console.log(`Fetching the lidar survey's ${name}…`)
    const head = Buffer.from(await rangeRequest(url, [[0, 65535]]).then(parts => parts.get(0)!))
    const tags = tiffTags(head)
    const width = tags.number(256)
    const height = tags.number(257)
    if (tags.number(259) !== 8 || tags.number(278) !== 1)
        throw new Error(`${name}: expected one deflated strip per row`)

    const [offsetsAt, bytesAt, scaleAt, tieAt] = [273, 279, 33550, 33922].map(tag => tags.offset(tag))
    const end = Math.max(offsetsAt! + height * 4, bytesAt! + height * 4, scaleAt! + 24, tieAt! + 48)
    const index = Buffer.from((await rangeRequest(url, [[0, end]])).get(0)!)
    const offsets = Array.from({ length: height }, (_, i) => index.readUInt32LE(offsetsAt! + i * 4))
    const counts = Array.from({ length: height }, (_, i) => index.readUInt32LE(bytesAt! + i * 4))
    const pixel = index.readDoubleLE(scaleAt!)
    const x0 = index.readDoubleLE(tieAt! + 24)
    const y0 = index.readDoubleLE(tieAt! + 32)

    const { south, west, north, east } = config.bounds
    const corners = [
        toMtm7({ lat: south, lon: west }),
        toMtm7({ lat: south, lon: east }),
        toMtm7({ lat: north, lon: west }),
        toMtm7({ lat: north, lon: east }),
    ]
    const c0 = Math.max(0, Math.floor((Math.min(...corners.map(c => c[0])) - SURVEY_MARGIN - x0) / pixel))
    const c1 = Math.min(width - 1, Math.ceil((Math.max(...corners.map(c => c[0])) + SURVEY_MARGIN - x0) / pixel))
    const r0 = Math.max(0, Math.floor((y0 - Math.max(...corners.map(c => c[1])) - SURVEY_MARGIN) / pixel))
    const r1 = Math.min(height - 1, Math.ceil((y0 - Math.min(...corners.map(c => c[1])) + SURVEY_MARGIN) / pixel))
    if (c0 > c1 || r0 > r1) return null

    // When the map is at the west end of each row, the start of the strip is enough.
    const share = (c1 + 1) / width
    const prefix = (row: number) =>
        share < 0.6 ? Math.min(counts[row]!, Math.ceil(counts[row]! * share * 1.5) + 8192) : counts[row]!
    const cols = c1 - c0 + 1
    const values = new Float32Array((r1 - r0 + 1) * cols).fill(Number.NaN)
    const store = (row: number, raw: Buffer) => {
        for (let c = 0; c < cols; c++) values[(row - r0) * cols + c] = raw.readFloatLE((c0 + c) * 4)
    }

    const rows = Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i)
    const batches: number[][] = []
    for (let i = 0; i < rows.length; i += RANGES_PER_REQUEST) batches.push(rows.slice(i, i + RANGES_PER_REQUEST))
    let next = 0
    let done = 0
    const worker = async () => {
        while (next < batches.length) {
            const batch = batches[next++]!
            const parts = await rangeRequest(
                url,
                batch.map(row => [offsets[row]!, offsets[row]! + prefix(row) - 1])
            )
            for (const row of batch) {
                let raw = inflateSync(Buffer.from(parts.get(offsets[row]!)!), { finishFlush: constants.Z_SYNC_FLUSH })
                if (raw.length < (c1 + 1) * 4) {
                    const whole = await rangeRequest(url, [[offsets[row]!, offsets[row]! + counts[row]! - 1]])
                    raw = inflateSync(Buffer.from(whole.get(0)!))
                }
                store(row, raw)
            }
            done++
            if (done % 50 === 0 || done === batches.length) console.log(`  ${name}: ${done}/${batches.length} requests`)
        }
    }
    await Promise.all(Array.from({ length: PARALLEL_SURVEY_REQUESTS }, worker))

    return { x0: x0 + c0 * pixel, y0: y0 - r0 * pixel, cols, rows: r1 - r0 + 1, values }
}

/**
 * The bytes of each range, keyed by where it starts (0 for a single range).
 * Retries a busy or refusing server a few times, waiting longer each time.
 */
async function rangeRequest(url: string, ranges: [number, number][]): Promise<Map<number, Uint8Array>> {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Range: `bytes=${ranges.map(([a, b]) => `${a}-${b}`).join(',')}` },
            })
            const type = response.headers.get('content-type') ?? ''
            const body = new Uint8Array(await response.arrayBuffer())
            if (response.status !== 206 || type.includes('html')) throw new Error(`refused (${response.status})`)
            if (!type.includes('multipart/byteranges')) {
                if (ranges.length > 1) throw new Error('expected several parts')
                return new Map([[0, body]])
            }
            return multipartRanges(Buffer.from(body), type.split('boundary=')[1]!.trim().replace(/^"|"$/g, ''))
        } catch (error) {
            if (attempt === 6) throw error
            await Bun.sleep(3000 * attempt)
        }
    }
}

/** The parts of a multipart/byteranges body, keyed by where each range starts in the file. */
export function multipartRanges(body: Buffer, boundary: string): Map<number, Uint8Array> {
    const parts = new Map<number, Uint8Array>()
    const marker = Buffer.from(`--${boundary}`)
    let at = body.indexOf(marker)
    while (at >= 0) {
        const next = body.indexOf(marker, at + marker.length)
        if (next < 0) break
        const part = body.subarray(at + marker.length, next)
        const split = part.indexOf('\r\n\r\n')
        const range = /content-range:\s*bytes\s+(\d+)-/i.exec(part.subarray(0, split).toString('latin1'))
        if (split >= 0 && range) {
            const data = part.subarray(split + 4)
            parts.set(
                Number(range[1]),
                data.subarray(0, data.length - (data.subarray(-2).toString() === '\r\n' ? 2 : 0))
            )
        }
        at = next
    }

    return parts
}

/** The few TIFF tags the survey needs: numbers stored in the tag, or where its values are. */
function tiffTags(head: Buffer): { number: (tag: number) => number; offset: (tag: number) => number } {
    if (head.toString('latin1', 0, 4) !== 'II*\0') throw new Error('expected a little-endian TIFF')
    const ifd = head.readUInt32LE(4)
    const tags = new Map<number, { type: number; count: number; value: number }>()
    for (let i = 0; i < head.readUInt16LE(ifd); i++) {
        const at = ifd + 2 + i * 12
        const type = head.readUInt16LE(at + 2)
        // Short values sit in the first two bytes of the value field.
        const value = type === 3 ? head.readUInt16LE(at + 8) : head.readUInt32LE(at + 8)
        tags.set(head.readUInt16LE(at), { type, count: head.readUInt32LE(at + 4), value })
    }
    const get = (tag: number) => {
        const found = tags.get(tag)
        if (!found) throw new Error(`the TIFF has no tag ${tag}`)
        return found.value
    }

    return { number: get, offset: get }
}
