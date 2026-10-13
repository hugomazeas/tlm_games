/**
 * What the game server hands the Hub's racing pages, under
 * /games/racing/live/: the 3D game (play.js), the track editor (editor.js),
 * the garage (garage.js) and the city (map.json, gzipped). Built once at startup, like hot
 * potato's client; restarting the container ships changes. Both bundles
 * are ES modules (they await the map), so pages load them with type="module".
 */

export const RACING_PREFIX = '/games/racing/live'

const MAP_FILE = `${import.meta.dir}/../../maps/quebec-plains/map.json`

interface Asset {
    body: Uint8Array<ArrayBuffer> | string
    type: string
    etag: string
    gzipped?: true
}

export type RacingAssets = Map<string, Asset>

export async function buildRacingAssets(): Promise<RacingAssets> {
    const assets: RacingAssets = new Map()
    for (const [name, entry] of [
        ['play.js', 'client/main.ts'],
        ['editor.js', 'client/track-editor.ts'],
        ['garage.js', 'client/garage.ts'],
    ] as const) {
        const result = await Bun.build({
            entrypoints: [`${import.meta.dir}/${entry}`],
            target: 'browser',
            format: 'esm',
            minify: true,
        })
        const output = result.outputs[0]
        if (!result.success || !output) {
            for (const log of result.logs) console.error(log)
            throw new Error(`Could not build the racing ${name}`)
        }
        const code = await output.text()
        assets.set(name, {
            body: code,
            type: 'text/javascript; charset=utf-8',
            etag: `"${Bun.hash(code).toString(36)}"`,
        })
    }

    const map = new Uint8Array(await Bun.file(MAP_FILE).arrayBuffer())
    assets.set('map.json', {
        body: Bun.gzipSync(map) as Uint8Array<ArrayBuffer>,
        type: 'application/json',
        etag: `"${Bun.hash(map).toString(36)}"`,
        gzipped: true,
    })

    return assets
}

/**
 * The response for a request under the prefix, or null when it isn't one of
 * ours. Without assets (they failed to build) racing answers 503: the game
 * server keeps running hot potato either way.
 */
export function serveRacing(assets: RacingAssets | null, request: Request): Response | null {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith(`${RACING_PREFIX}/`)) return null
    if (!assets) return new Response('Racing is unavailable: its bundles did not build', { status: 503 })
    const asset = assets.get(pathname.slice(RACING_PREFIX.length + 1))
    if (!asset) return new Response('Not found', { status: 404 })

    // no-cache: browsers check back each load, and get a 304 while nothing changed.
    const headers: Record<string, string> = {
        'Cache-Control': 'no-cache',
        ETag: asset.etag,
        'Content-Type': asset.type,
    }
    if (request.headers.get('If-None-Match') === asset.etag) return new Response(null, { status: 304, headers })
    if (asset.gzipped) {
        if (!(request.headers.get('Accept-Encoding') ?? '').includes('gzip')) {
            return new Response(Bun.gunzipSync(asset.body as Uint8Array<ArrayBuffer>) as Uint8Array<ArrayBuffer>, {
                headers,
            })
        }
        headers['Content-Encoding'] = 'gzip'
    }

    return new Response(asset.body, { headers })
}
