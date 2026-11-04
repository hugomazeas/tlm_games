/**
 * The gun lab: the office FPS's guns in your hands, alone on a page, to work on their models and
 * animations without starting a game.
 *
 *   bun run fps:guns   →   http://localhost:8097   (FPS_LAB_PORT to change it)
 *
 * The page's script is rebuilt whenever a file under src/fps changes, and the open page reloads
 * itself (it asks `/version`), keeping what it showed: save, and look.
 */

import { Glob } from 'bun'

const SOURCES = `${import.meta.dir}`
const ENTRY = `${import.meta.dir}/client/gun-lab.ts`

export type LabBuild = { ok: true; code: string } | { ok: false; error: string }

/** The lab's script; a build error comes back as text to show on the page. */
export async function buildGunLab(): Promise<LabBuild> {
    try {
        const result = await Bun.build({ entrypoints: [ENTRY], target: 'browser', format: 'esm', sourcemap: 'inline' })
        const output = result.outputs[0]
        if (result.success && output) return { ok: true, code: await output.text() }
        return { ok: false, error: result.logs.map(String).join('\n') }
    } catch (error) {
        return { ok: false, error: String(error) }
    }
}

/** Changes whenever a source file does: the newest modification time and how many files there are. */
export async function sourcesVersion(): Promise<string> {
    let newest = 0
    let count = 0
    for await (const path of new Glob('**/*.{ts,js,json}').scan({ cwd: SOURCES, absolute: true })) {
        const stat = await Bun.file(path).stat()
        newest = Math.max(newest, stat.mtimeMs)
        count++
    }

    return `${newest}-${count}`
}

/** A build error, shown in the lab's place (and still watching for the fix). */
function errorScript(error: string): string {
    return `
        const pre = document.createElement('pre')
        pre.style.cssText = 'margin:16px;padding:16px;border-radius:8px;background:#1d1f23;color:#ff9a8a;white-space:pre-wrap;font:13px/1.45 ui-monospace,monospace'
        pre.textContent = ${JSON.stringify(`The gun lab didn't build:\n\n${error}`)}
        document.body.append(pre)
        let seen = null
        setInterval(async () => {
            const v = await (await fetch('/version', { cache: 'no-store' })).text().catch(() => seen)
            if (seen !== null && v !== seen) location.reload()
            seen = v
        }, 700)
    `
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gun lab</title>
</head>
<body>
<script type="module" src="/lab.js"></script>
</body>
</html>`

if (import.meta.main) {
    const port = Number(process.env.FPS_LAB_PORT ?? 8097)
    let built: { version: string; build: LabBuild } | null = null

    const server = Bun.serve({
        port,
        async fetch(request) {
            const { pathname } = new URL(request.url)
            const fresh = { 'Cache-Control': 'no-store' }
            const html = { ...fresh, 'Content-Type': 'text/html; charset=utf-8' }
            if (pathname === '/') return new Response(PAGE, { headers: html })
            if (pathname === '/version') return new Response(await sourcesVersion(), { headers: fresh })
            if (pathname === '/lab.js') {
                const version = await sourcesVersion()
                if (built?.version !== version) {
                    const started = performance.now()
                    built = { version, build: await buildGunLab() }
                    console.log(
                        built.build.ok
                            ? `Built in ${Math.round(performance.now() - started)} ms`
                            : `Build failed:\n${built.build.error}`
                    )
                }
                const code = built.build.ok ? built.build.code : errorScript(built.build.error)
                return new Response(code, { headers: { ...fresh, 'Content-Type': 'text/javascript; charset=utf-8' } })
            }

            return new Response('Not found', { status: 404 })
        },
    })

    console.log(`Gun lab on http://localhost:${server.port}`)
}
