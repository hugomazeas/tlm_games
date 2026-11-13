/**
 * The asset lab: every asset of the FPS library on a page of its own, in October light next to a
 * 1.8 m figure, its variants side by side, the version in the maps beside the draft being worked
 * on, and Approve / Request changes buttons that write your verdict to reviews.json.
 *
 *   bun run fps:assets   →   http://localhost:8098   (FPS_ASSETS_PORT to change it)
 *
 * The page rebuilds and reloads itself when a file under src/fps changes, keeping what it showed
 * (its state is in the URL's hash), like the gun lab.
 */

import { buildLab, sourcesVersion } from './lab-build.ts'

export const REVIEWS = `${import.meta.dir}/reviews.json`

export type Verdict = 'approved' | 'changes'
export interface Review {
    version: number
    verdict: Verdict
    note: string
    at: string
}

export async function readReviews(): Promise<Record<string, Review>> {
    const file = Bun.file(REVIEWS)
    return (await file.exists()) ? ((await file.json()) as Record<string, Review>) : {}
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asset lab</title>
</head>
<body>
<script type="module" src="/lab.js"></script>
</body>
</html>`

if (import.meta.main) {
    const port = Number(process.env.FPS_ASSETS_PORT ?? 8098)
    let built: { version: string; code: string } | null = null

    const server = Bun.serve({
        port,
        async fetch(request) {
            const { pathname } = new URL(request.url)
            const fresh = { 'Cache-Control': 'no-store' }
            if (pathname === '/')
                return new Response(PAGE, { headers: { ...fresh, 'Content-Type': 'text/html; charset=utf-8' } })
            if (pathname === '/version') return new Response(await sourcesVersion(), { headers: fresh })
            if (pathname === '/lab.js') {
                const version = await sourcesVersion()
                if (built?.version !== version) {
                    const started = performance.now()
                    built = { version, code: await buildLab() }
                    console.log(`Built in ${Math.round(performance.now() - started)} ms`)
                }
                return new Response(built.code, {
                    headers: { ...fresh, 'Content-Type': 'text/javascript; charset=utf-8' },
                })
            }
            if (pathname === '/reviews' && request.method === 'GET')
                return Response.json(await readReviews(), { headers: fresh })
            if (pathname === '/reviews' && request.method === 'POST') {
                const body = (await request.json().catch(() => null)) as {
                    id?: unknown
                    version?: unknown
                    verdict?: unknown
                    note?: unknown
                } | null
                const ok =
                    body &&
                    typeof body.id === 'string' &&
                    /^[a-z0-9-]{1,40}$/.test(body.id) &&
                    typeof body.version === 'number' &&
                    (body.verdict === 'approved' || body.verdict === 'changes') &&
                    (body.note === undefined || typeof body.note === 'string')
                if (!ok) return new Response('Bad review', { status: 400 })
                const reviews = await readReviews()
                reviews[body.id as string] = {
                    version: body.version as number,
                    verdict: body.verdict as Verdict,
                    note: ((body.note as string | undefined) ?? '').slice(0, 2000),
                    at: new Date().toISOString(),
                }
                await Bun.write(REVIEWS, `${JSON.stringify(reviews, null, 4)}\n`)
                console.log(`Review: ${body.id} v${body.version} ${body.verdict}${body.note ? `: ${body.note}` : ''}`)
                return Response.json(reviews, { headers: fresh })
            }

            return new Response('Not found', { status: 404 })
        },
    })

    console.log(`Asset lab on http://localhost:${server.port}`)
}
