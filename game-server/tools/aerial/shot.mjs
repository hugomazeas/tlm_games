// Renders views of the racing viewer in a private headless Chrome (software WebGL) and saves them,
// without the HUD, to compare with screenshots (`aerial.py compare`). Start the viewer first
// (`RACE_POC_PORT=8095 bun run race:viewer`); a view is a viewer link (`aerial.py view IMAGE` gives
// the one matching a screenshot's camera). CHROME picks the browser (google-chrome by default).
// Usage: node shot.mjs <viewerUrl> <width> <height> <out1.png> <view1> [<out2.png> <view2> …]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const [base, width, height, ...pairs] = process.argv.slice(2)
const port = 9300 + Math.floor(Math.random() * 500)
const profile = `${process.env.TMPDIR ?? '/tmp'}/racing-shot-${port}`
mkdirSync(profile, { recursive: true })
const chrome = spawn(
    process.env.CHROME ?? 'google-chrome',
    [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu-sandbox',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        `--window-size=${width},${height}`,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        'about:blank',
    ],
    { stdio: 'ignore' }
)

const sleep = ms => new Promise(r => setTimeout(r, ms))
let targets
for (let i = 0; i < 50; i++) {
    try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
        if (targets.some(t => t.type === 'page')) break
    } catch {}
    await sleep(200)
}
const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message)
        pending.delete(message.id)
    }
})
const send = (method, params = {}) =>
    new Promise(resolve => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params }))
    })
const evaluate = async (expression, timeout = 600000) => {
    const result = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        sleep(timeout).then(() => ({ timeout: true })),
    ])
    return result
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: false })
const started = Date.now()
for (let i = 0; i < pairs.length; i += 2) {
    const [out, hash] = [pairs[i], pairs[i + 1]]
    if (i === 0) {
        await send('Page.navigate', { url: `${base}/#${hash}` })
        // Wait for the canvas, then for two frames to be drawn.
        await evaluate(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('canvas')) { clearInterval(t); r(1) } }, 500) })`)
        // Only the 3D view: the HUD, minimap and help would hide parts of it.
        await evaluate(`(() => { const canvas = document.querySelector('canvas'); for (const el of canvas.parentElement.children) if (el !== canvas) el.style.display = 'none'; return 1 })()`)
    } else {
        await evaluate(`location.hash = ${JSON.stringify('#' + hash)}; 1`)
    }
    await evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
    console.log(out, `${((Date.now() - started) / 1000).toFixed(0)} s`)
}
ws.close()
chrome.kill('SIGKILL')
process.exit(0)
