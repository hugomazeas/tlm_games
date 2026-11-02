/**
 * What the game server hands the Hub's office FPS page, under /games/office-fps/live/: the game
 * (play.js, an ES module built from client/main.ts at startup; restarting ships changes).
 */

export const FPS_PREFIX = '/games/office-fps/live'

export interface FpsBundle {
    code: string
    etag: string
}

export async function buildFpsBundle(): Promise<FpsBundle> {
    const result = await Bun.build({
        entrypoints: [`${import.meta.dir}/client/main.ts`],
        target: 'browser',
        format: 'esm',
        minify: true,
    })
    const output = result.outputs[0]
    if (!result.success || !output) {
        for (const log of result.logs) console.error(log)
        throw new Error('Could not build the office FPS bundle')
    }
    const code = await output.text()

    return { code, etag: `"${Bun.hash(code).toString(36)}"` }
}

/** The bundle's response (304 while unchanged), or null when the path isn't it. */
export function serveFpsBundle(bundle: FpsBundle | null, request: Request): Response | null {
    if (new URL(request.url).pathname !== `${FPS_PREFIX}/play.js`) return null
    if (!bundle) return new Response('The office FPS is unavailable: its bundle did not build', { status: 503 })

    const headers = { 'Cache-Control': 'no-cache', ETag: bundle.etag }
    if (request.headers.get('If-None-Match') === bundle.etag) return new Response(null, { status: 304, headers })

    return new Response(bundle.code, { headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' } })
}
