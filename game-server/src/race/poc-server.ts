/**
 * Proof-of-concept viewer for a racing map, separate from the hot potato
 * server so it can't disturb it:
 *
 *   bun run race:viewer   →   http://localhost:8091
 *
 * Bundles src/race/client on start and serves it next to the map file.
 * Restart to pick up client changes; a rebuilt map only needs a reload.
 */

const port = Number(process.env.RACE_POC_PORT ?? 8091)
const mapPath = `${import.meta.dir}/../../maps/quebec-plains/map.json`
if (!(await Bun.file(mapPath).exists())) throw new Error('No map yet: run `bun run race:map` first')

const result = await Bun.build({
    entrypoints: [`${import.meta.dir}/client/main.ts`],
    target: 'browser',
    format: 'esm',
    minify: true,
})
const bundle = result.outputs[0]
if (!result.success || !bundle) {
    for (const log of result.logs) console.error(log)
    throw new Error('Could not build the race viewer')
}
const code = await bundle.text()

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Racing map POC</title>
<style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #bfd9ee; font: 13px system-ui, sans-serif; }
    canvas { display: block; }
    .panel { position: fixed; left: 12px; padding: 6px 10px; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; pointer-events: none; }
    #status { top: 12px; }
    #hud { top: 44px; font-variant-numeric: tabular-nums; }
    #help { bottom: 12px; }
    #credit { position: fixed; right: 8px; bottom: 6px; font-size: 11px; color: #334155; }
    #crosshair { position: fixed; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px #0f172a; pointer-events: none; }
    #identify { top: 76px; pointer-events: auto; display: grid; gap: 4px; max-width: 340px; }
    #identify[hidden] { display: none; }
    #identify button { justify-self: start; font: inherit; padding: 2px 8px; border-radius: 4px; border: 0; cursor: pointer; }
</style>
</head>
<body>
<div id="status" class="panel">Loading map…</div>
<div id="hud" class="panel"></div>
<div id="identify" class="panel" hidden></div>
<div id="crosshair"></div>
<div id="help" class="panel">Click to look around · WASD move · Space / C up / down · Shift faster · wheel speed · I identify building · Esc release mouse</div>
<div id="credit">© OpenStreetMap contributors · elevation © Natural Resources Canada</div>
<script type="module" src="/main.js"></script>
</body>
</html>`

const server = Bun.serve({
    port,
    fetch(request) {
        const { pathname } = new URL(request.url)
        if (pathname === '/') return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        if (pathname === '/main.js') return new Response(code, { headers: { 'Content-Type': 'text/javascript' } })
        // Opened per request: a rebuilt map is picked up on reload, at its new size.
        if (pathname === '/map.json') {
            return new Response(Bun.file(mapPath), { headers: { 'Content-Type': 'application/json' } })
        }

        return new Response('Not found', { status: 404 })
    },
})

console.log(`Racing map POC on http://localhost:${server.port}`)
