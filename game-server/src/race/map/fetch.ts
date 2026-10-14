import { type ElevationGrid, type LatLon, type OsmElement, projector } from './convert.ts'
import type { MapConfig } from './pipeline.ts'
import type { CityTree } from './trees.ts'

/**
 * Downloads a map's raw data: OpenStreetMap through Overpass, elevation from
 * the federal CDEM profile service, and the city of Québec's tree inventory
 * from Données Québec. All free and keyless. Only `build.ts --refresh…` calls
 * this; every other build reads the committed snapshot.
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
