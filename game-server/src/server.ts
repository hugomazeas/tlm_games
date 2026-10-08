import type { ServerWebSocket } from 'bun'
import { LaravelClient } from './laravel.ts'
import { parseClientMessage, type ServerMessage } from './protocol.ts'
import { BUILD_PLACEHOLDER } from './client/build.ts'
import { SessionManager, TICK_MS } from './sessions.ts'

/**
 * The hot potato game server. nginx sends `/games/hot-potato/live/*` here:
 * the WebSocket, and the browser bundle built from `src/client` at startup,
 * so the Hub needs no frontend build step.
 *
 * Run from the repo root, where Bun loads the Hub's `.env` on its own, so
 * HOT_POTATO_INTERNAL_SECRET is set in exactly one place.
 */

const PREFIX = '/games/hot-potato/live'
const hostname = process.env.HOT_POTATO_HOST ?? '127.0.0.1'
const port = Number(process.env.HOT_POTATO_PORT ?? 8090)
const laravelUrl = process.env.HOT_POTATO_LARAVEL_URL ?? 'http://127.0.0.1'
const secret = process.env.HOT_POTATO_INTERNAL_SECRET ?? ''

// Without it Laravel answers 503 and players see "unavailable"; exiting would
// only make the container restart in a loop.
if (!secret) console.warn('HOT_POTATO_INTERNAL_SECRET is not set; the game stays closed.')

const laravel = new LaravelClient(laravelUrl, secret)

const clientBundle = await buildClient()

const manager = new SessionManager({
    build: clientBundle.build,
    now: () => Date.now(),
    rng: Math.random,
    nextSeed: () => Math.floor(Math.random() * 2 ** 31),
    onOpened: (officeId, hostPlayerId) => {
        laravel.sessionOpened(officeId, hostPlayerId).catch(error => console.warn('Invite not sent:', error.message))
    },
    onResults: result => {
        laravel.postResults(result).catch(error => console.error('Results not saved:', error.message))
    },
})

setInterval(() => manager.tick(), TICK_MS)

interface SocketData {
    id: string
    /**
     * Settles once `hello` has been answered: true when the connection is
     * registered. Later messages wait on it, in order, so nothing sent while
     * Laravel looks the player up is lost.
     */
    ready: Promise<boolean> | null
}

let nextId = 0

const server = Bun.serve<SocketData>({
    port,
    hostname,

    fetch(request, server) {
        const { pathname } = new URL(request.url)

        if (pathname === `${PREFIX}/ws`) {
            const upgraded = server.upgrade(request, { data: { id: `ws${++nextId}`, ready: null } })
            return upgraded ? undefined : new Response('Expected a WebSocket', { status: 426 })
        }

        // no-cache: browsers check back on every page load, and get a 304 while nothing changed.
        if (pathname === `${PREFIX}/client.js`) {
            const headers = { 'Cache-Control': 'no-cache', ETag: clientBundle.etag }
            if (request.headers.get('If-None-Match') === clientBundle.etag) {
                return new Response(null, { status: 304, headers })
            }

            return new Response(clientBundle.code, {
                headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' },
            })
        }

        if (pathname === `${PREFIX}/health`) return new Response('ok')

        return new Response('Not found', { status: 404 })
    },

    websocket: {
        maxPayloadLength: 4096,
        idleTimeout: 60,
        sendPings: true,

        async message(ws, raw) {
            const message = parseClientMessage(typeof raw === 'string' ? raw : raw.toString())
            if (!message) return send(ws, { type: 'error', code: 'BAD_MESSAGE' })

            if (message.type !== 'hello') {
                if (!ws.data.ready) return send(ws, { type: 'error', code: 'HELLO_FIRST' })
                if (await ws.data.ready) manager.handle(ws.data.id, message)
                return
            }

            if (ws.data.ready) return send(ws, { type: 'error', code: 'BAD_MESSAGE' })
            ws.data.ready = greet(ws, message.officeId, message.playerId)
        },

        close(ws) {
            manager.disconnect(ws.data.id)
        },
    },
})

console.log(`Hot potato listening on ${server.hostname}:${server.port}${PREFIX}`)

/** Looks the player up, then registers the connection. False when it could not be. */
async function greet(ws: ServerWebSocket<SocketData>, officeId: number, playerId: number | null): Promise<boolean> {
    let player = null
    if (playerId !== null) {
        try {
            player = await laravel.findPlayer(playerId)
        } catch (error) {
            console.error('Player lookup failed:', (error as Error).message)
            send(ws, { type: 'error', code: 'UNAVAILABLE' })
            ws.close(1011, 'Laravel unavailable')
            return false
        }
        if (!player) send(ws, { type: 'error', code: 'UNKNOWN_PLAYER' })
    }

    // The socket may have closed while Laravel answered.
    if (ws.readyState !== 1) return false

    manager.connect({ id: ws.data.id, send: m => send(ws, m) }, officeId, player)
    return true
}

function send(ws: ServerWebSocket<SocketData>, message: ServerMessage) {
    ws.send(JSON.stringify(message))
}

/**
 * Bundles src/client for the browser and stamps it with a build id: a hash of
 * the code, swapped in for BUILD_PLACEHOLDER. The same id goes out in every
 * welcome, so a tab still running an older bundle after a deploy reloads.
 */
async function buildClient(): Promise<{ code: string; etag: string; build: string }> {
    const result = await Bun.build({
        entrypoints: [`${import.meta.dir}/client/main.ts`],
        target: 'browser',
        format: 'iife',
        minify: true,
    })

    const output = result.outputs[0]
    if (!result.success || !output) {
        for (const log of result.logs) console.error(log)
        throw new Error('Could not build the hot potato browser bundle')
    }

    const built = await output.text()
    if (!built.includes(BUILD_PLACEHOLDER)) throw new Error('The browser bundle lost its build placeholder')

    const build = Bun.hash(built).toString(36)
    const code = built.replaceAll(BUILD_PLACEHOLDER, build)

    return { code, etag: `"${build}"`, build }
}
