import { type ElevationGrid, type LatLon, type OsmElement, projector } from './convert.ts'
import type { MapConfig } from './pipeline.ts'

/**
 * Downloads a map's raw data: OpenStreetMap through Overpass, and elevation
 * from the federal CDEM profile service. Both are free and keyless. Only
 * `build.ts --refresh` calls this; every other build reads the committed
 * snapshot.
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
  node[highway~"^(crossing|traffic_signals|bus_stop|stop)$"](${area});
  node[amenity=bench](${area});
);
out;`

    console.log('Fetching trees, crossings, lights, stop signs and benches…')
    return overpass(query)
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
