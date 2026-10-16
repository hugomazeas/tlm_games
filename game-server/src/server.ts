import type { ServerWebSocket } from 'bun'
import { checkPolicy, type TrainedPolicy } from './ai/policy.ts'
import { LaravelClient } from './laravel.ts'
import { parseClientMessage, type ServerMessage } from './protocol.ts'
import { BUILD_PLACEHOLDER } from './client/build.ts'
import { createRacingLive } from './race/live.ts'
import { parseClientMessage as parseRaceMessage, type ServerMessage as RaceServerMessage } from './race/protocol.ts'
import { buildRacingAssets, RACING_PREFIX, serveRacing } from './race/serve.ts'
import { type GameResult, SessionManager, TICK_MS } from './sessions.ts'

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
// The replay page's player: same renderer, no socket.
const replayBundle = await buildClient('replay-page.ts')
// The AI seats' policy. A missing or mismatched file only turns AIs off.
const botPolicy = await loadBotPolicy()
const hunterPolicy = await loadBotPolicy('hunter-policy.json')
// The racing game's pages load their bundles and the map from here too (see race/serve.ts).
// A failed build (missing packages, say) closes racing, not the whole server.
const racingAssets = await buildRacingAssets().catch(error => {
    console.error('Racing is unavailable, its bundles did not build:', (error as Error).message)
    return null
})

const manager = new SessionManager({
    build: clientBundle.build,
    now: () => Date.now(),
    rng: Math.random,
    nextSeed: () => Math.floor(Math.random() * 2 ** 31),
    onOpened: (officeId, hostPlayerId) => {
        laravel.sessionOpened(officeId, hostPlayerId).catch(error => console.warn('Invite not sent:', error.message))
    },
    onResults: result => {
        void saveResults(result)
    },
    botPolicy,
    hunterPolicy,
    refreshPlayer: playerId => {
        laravel
            .findPlayer(playerId)
            .then(player => player && manager.updatePlayer(player))
            .catch(error => console.warn('Look not refreshed:', error.message))
    },
})

setInterval(() => manager.tick(), TICK_MS)

/** Results first, then the replay under the game's id; the room hears about the replay once both are in. */
async function saveResults(result: GameResult): Promise<void> {
    let gameId: number
    try {
        gameId = await laravel.postResults(result)
    } catch (error) {
        console.error('Results not saved:', (error as Error).message)
        return
    }
    if (!result.replay) return

    try {
        await laravel.postReplay(gameId, result.replay)
        manager.replayReady(result.officeId, gameId)
    } catch (error) {
        console.error('Replay not saved:', (error as Error).message)
    }
}

// Racing lobbies share the socket server: /games/racing/live/ws, and the lobby list the Hub's racing page polls.
const racing = await createRacingLive(laravel).catch(error => {
    console.error('Racing lobbies are unavailable:', (error as Error).message)
    return null
})
if (racing) setInterval(() => racing.manager.tick(), TICK_MS)

interface SocketData {
    id: string
    game: 'hot-potato' | 'racing'
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
        if (pathname === `${RACING_PREFIX}/ws`) {
            if (!racing) return new Response('Racing is unavailable', { status: 503 })
            const upgraded = server.upgrade(request, { data: { id: `race${++nextId}`, game: 'racing', ready: null } })
            return upgraded ? undefined : new Response('Expected a WebSocket', { status: 426 })
        }
        // Anyone on the Hub can clear a lobby from the list (like deleting a track): POST …/lobbies/{id}/close.
        const closing = pathname.match(new RegExp(`^${RACING_PREFIX}/lobbies/([a-z0-9]{1,16})/close$`))
        if (closing) {
            if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
            return new Response(null, { status: racing?.manager.closeLobby(closing[1]!) ? 204 : 404 })
        }
        if (pathname === `${RACING_PREFIX}/lobbies`) {
            return Response.json(racing?.manager.summaries() ?? [], { headers: { 'Cache-Control': 'no-store' } })
        }
        const racingAsset = serveRacing(racingAssets, request)
        if (racingAsset) return racingAsset

        if (pathname === `${PREFIX}/ws`) {
            const upgraded = server.upgrade(request, { data: { id: `ws${++nextId}`, game: 'hot-potato', ready: null } })
            return upgraded ? undefined : new Response('Expected a WebSocket', { status: 426 })
        }

        // no-cache: browsers check back on every page load, and get a 304 while nothing changed.
        const bundle =
            pathname === `${PREFIX}/client.js` ? clientBundle : pathname === `${PREFIX}/replay.js` ? replayBundle : null
        if (bundle) {
            const headers = { 'Cache-Control': 'no-cache', ETag: bundle.etag }
            if (request.headers.get('If-None-Match') === bundle.etag) {
                return new Response(null, { status: 304, headers })
            }

            return new Response(bundle.code, {
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
            if (ws.data.game === 'racing') return raceMessage(ws, typeof raw === 'string' ? raw : raw.toString())
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
            if (ws.data.game === 'racing') return racing?.manager.leave(ws.data.id)
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

/** A racing tab's message: hello first, then start and pose, in order once hello is answered. */
async function raceMessage(ws: ServerWebSocket<SocketData>, raw: string): Promise<void> {
    if (!racing) return
    const message = parseRaceMessage(raw)
    const reply = (m: RaceServerMessage) => {
        ws.send(JSON.stringify(m))
    }
    if (!message) return reply({ type: 'error', code: 'BAD_MESSAGE' })

    if (message.type === 'hello') {
        if (ws.data.ready) return reply({ type: 'error', code: 'BAD_MESSAGE' })
        ws.data.ready = racing.hello({ id: ws.data.id, send: reply, isOpen: () => ws.readyState === 1 }, message)
        return
    }
    if (!ws.data.ready) return reply({ type: 'error', code: 'HELLO_FIRST' })
    if (!(await ws.data.ready)) return
    if (message.type === 'start') racing.manager.start(ws.data.id)
    else if (message.type === 'close') racing.manager.close(ws.data.id)
    else racing.manager.pose(ws.data.id, message.pose, message.samples)
}

function send(ws: ServerWebSocket<SocketData>, message: ServerMessage) {
    ws.send(JSON.stringify(message))
}

/**
 * Bundles a src/client entry for the browser and stamps it with a build id: a hash of
 * the code, swapped in for BUILD_PLACEHOLDER. The live page's id goes out in every
 * welcome, so a tab still running an older bundle after a deploy reloads.
 */
async function buildClient(entry = 'main.ts'): Promise<{ code: string; etag: string; build: string }> {
    const result = await Bun.build({
        entrypoints: [`${import.meta.dir}/client/${entry}`],
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
    if (entry === 'main.ts' && !built.includes(BUILD_PLACEHOLDER)) {
        throw new Error('The browser bundle lost its build placeholder')
    }

    const build = Bun.hash(built).toString(36)
    const code = built.replaceAll(BUILD_PLACEHOLDER, build)

    return { code, etag: `"${build}"`, build }
}

async function loadBotPolicy(file = 'trained-policy.json'): Promise<TrainedPolicy | null> {
    try {
        const policy = (await Bun.file(new URL(`./ai/${file}`, import.meta.url)).json()) as TrainedPolicy
        checkPolicy(policy)
        return policy
    } catch (error) {
        console.error('AI players are unavailable, the policy did not load:', (error as Error).message)
        return null
    }
}
