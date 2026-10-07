import type { PlayerInfo, Results, ServerMessage, SessionView } from '../protocol.ts'
import { GAME_MODES, MIN_PLAYERS } from '../protocol.ts'
import type { GameMode } from '../sim/game.ts'
import { THEMES, THEME_IDS, type ThemeId } from '../sim/themes.ts'
import { colourFor, Renderer } from './renderer.ts'
import { STRINGS } from './strings.ts'

/**
 * The hot potato page as an Alpine component, built by the game server and
 * loaded as a classic script before Alpine starts:
 *
 *   <div x-data="hotPotatoApp(config)">…</div>
 *
 * The socket and the renderer live outside Alpine's reactive proxy; only the
 * slow-changing bits (lobby, phase, HUD numbers) are reactive.
 */

interface Config {
    offices: Array<{ id: number; name: string }>
    players: Array<{ id: number; name: string; office_id: number | null }>
    csrf: string
    urls: { pushConfig: string; pushSubscribe: string; pushUnsubscribe: string }
}

interface ResultsView {
    mode: GameMode
    headline: string
    rows: Array<{ id: number; name: string; place: string; survived: boolean; holdSeconds: number; passes: number }>
}

type Alpine = {
    $refs: Record<string, HTMLElement>
    $watch: (property: string, callback: (value: unknown) => void) => void
    $nextTick: (callback: () => void) => void
}

const MOVE_KEYS: Record<string, [number, number]> = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    KeyW: [0, -1],
    KeyS: [0, 1],
    KeyA: [-1, 0],
    KeyD: [1, 0],
}

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches

function hotPotatoApp(config: Config) {
    let socket: WebSocket | null = null
    let renderer: Renderer | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let bannerTimer: ReturnType<typeof setTimeout> | null = null
    let countdownTimer: ReturnType<typeof setInterval> | null = null
    let lastHudAt = 0
    let lastSent = { dx: 0, dy: 0 }
    const pressed = new Set<string>()

    return {
        offices: config.offices,
        allPlayers: config.players,
        officeId: readStored('hot_potato_office'),
        playerId: readStored('hot_potato_player'),
        status: 'idle' as 'idle' | 'connecting' | 'online' | 'offline',
        me: null as PlayerInfo | null,
        session: null as SessionView | null,
        gamePlayerIds: [] as number[],
        countdownLeft: 0,
        remainingMs: 0,
        aliveCount: 0,
        results: null as ResultsView | null,
        banner: '',
        bannerFlash: false,
        error: '',
        duration: 2,
        theme: 'random' as ThemeId | 'random',
        mode: 'survival' as GameMode,
        modes: GAME_MODES.map(id => ({ id, ...STRINGS.modes[id] })),
        /** King of the Potato's live top three. */
        kingBoard: [] as Array<{ id: number; name: string; seconds: number }>,
        themes: THEME_IDS.map(id => ({ id, label: `${THEMES[id].emoji} ${THEMES[id].name}` })),
        canPlay: !matchMedia('(pointer: coarse)').matches,
        reducedMotion: REDUCED_MOTION,
        alerts: { available: false, on: false, busy: false, message: '' },
        /** The page's fallback stub sets this when the sidecar's script didn't load. */
        unavailable: false,
        colourFor,

        init() {
            const alpine = this as unknown as Alpine
            alpine.$watch('officeId', () => this.reconnect())
            alpine.$watch('playerId', () => this.reconnect())
            window.addEventListener('keydown', event => this.onKey(event, true))
            window.addEventListener('keyup', event => this.onKey(event, false))
            window.addEventListener('blur', () => {
                pressed.clear()
                this.sendDirection()
            })

            if (this.officeId) this.connect()
            this.initAlerts()
        },

        // ── Derived state ────────────────────────────────────────────────

        get officePlayers() {
            const office = Number(this.officeId)
            const own = this.allPlayers.filter(p => p.office_id === office)
            return own.length > 0 ? own : this.allPlayers
        },
        get phase() {
            return this.session?.phase ?? null
        },
        get isHost() {
            return this.me !== null && this.session?.hostId === this.me.id
        },
        get isMember() {
            return this.me !== null && Boolean(this.session?.players.some(p => p.id === this.me?.id))
        },
        get isPlaying() {
            return this.me !== null && this.gamePlayerIds.includes(this.me.id) && this.phase === 'playing'
        },
        get hostName() {
            return this.session ? this.nameOf(this.session.hostId) : ''
        },
        get presentCount() {
            return this.session?.players.filter(p => !p.away).length ?? 0
        },
        get canStart() {
            return this.isHost && this.phase === 'lobby' && this.presentCount >= MIN_PLAYERS
        },
        /** The mode of the game on screen, or the one the host has picked. */
        get gameMode(): GameMode {
            return this.session?.settings.mode ?? this.mode
        },
        get modeHint() {
            return STRINGS.modes[this.gameMode].hint
        },
        get timerText() {
            const seconds = Math.ceil(this.remainingMs / 1000)
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
        },

        // ── Connection ───────────────────────────────────────────────────

        connect() {
            if (!this.officeId) return
            this.status = 'connecting'
            const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/games/hot-potato/live/ws`
            const ws = new WebSocket(url)
            socket = ws

            ws.onopen = () => {
                this.status = 'online'
                ws.send(
                    JSON.stringify({
                        type: 'hello',
                        officeId: Number(this.officeId),
                        playerId: this.playerId ? Number(this.playerId) : null,
                    })
                )
            }
            ws.onmessage = event => this.onMessage(JSON.parse(event.data) as ServerMessage)
            ws.onclose = () => {
                if (socket !== ws) return
                socket = null
                this.status = 'offline'
                reconnectTimer = setTimeout(() => this.connect(), 1500)
            }
        },

        reconnect() {
            writeStored('hot_potato_office', this.officeId)
            writeStored('hot_potato_player', this.playerId)
            if (reconnectTimer) clearTimeout(reconnectTimer)
            const old = socket
            socket = null
            old?.close()
            this.me = null
            this.session = null
            this.results = null
            renderer?.clear()
            this.connect()
        },

        send(message: object) {
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
        },

        open() {
            this.send({ type: 'open' })
        },
        join() {
            this.send({ type: 'join' })
        },
        leave() {
            this.send({ type: 'leave' })
        },
        start() {
            this.send({ type: 'start', durationMin: Number(this.duration), theme: this.theme, mode: this.mode })
        },
        close() {
            this.send({ type: 'close' })
        },

        // ── Messages ─────────────────────────────────────────────────────

        onMessage(message: ServerMessage) {
            switch (message.type) {
                case 'welcome':
                    this.me = message.player
                    return
                case 'office':
                    this.session = message.session
                    if (!message.session || message.session.phase === 'lobby') {
                        this.gamePlayerIds = []
                        this.results = null
                        renderer?.clear()
                    }
                    if (message.session) {
                        this.duration = message.session.settings.durationMin
                        this.mode = message.session.settings.mode
                    }
                    return
                case 'countdown':
                    this.results = null
                    this.gamePlayerIds = message.playerIds
                    this.remainingMs = message.durationMs
                    this.aliveCount = message.playerIds.length
                    this.kingBoard = []
                    ;(this as unknown as Alpine).$nextTick(() =>
                        this.ensureRenderer()?.setArena(message.arena, message.playerIds)
                    )
                    this.startCountdown(message.startsInMs)
                    return
                case 'snapshot': {
                    renderer?.pushSnapshot(message)
                    const now = performance.now()
                    if (now - lastHudAt > 250) {
                        lastHudAt = now
                        this.remainingMs = Math.max(0, this.durationOf() - message.elapsedMs)
                        this.aliveCount = message.players.filter(p => !p.out).length
                        if (this.gameMode === 'king') {
                            this.kingBoard = [...message.players]
                                .filter(p => p.holdMs > 0)
                                .sort((a, b) => b.holdMs - a.holdMs)
                                .slice(0, 3)
                                .map(p => ({ id: p.id, name: this.nameOf(p.id), seconds: Math.floor(p.holdMs / 1000) }))
                        }
                    }
                    return
                }
                case 'pass':
                    if (message.to === this.me?.id) this.showBanner(this.gotItText(), true)
                    else if (this.gameMode === 'king' && message.from === this.me?.id) {
                        this.showBanner(STRINGS.crownStolen(this.nameOf(message.to)), false)
                    }
                    return
                case 'newPotato':
                    if (message.playerId === this.me?.id) this.showBanner(this.gotItText(), true)
                    return
                case 'boom':
                    renderer?.boom(message.playerId)
                    this.showBanner(
                        message.playerId === this.me?.id
                            ? STRINGS.youAreOut
                            : STRINGS.boom(this.nameOf(message.playerId)),
                        false
                    )
                    return
                case 'pickup': {
                    const mine = message.playerId === this.me?.id
                    const text = STRINGS.pickup(
                        mine ? null : this.nameOf(message.playerId),
                        message.item,
                        message.effect
                    )
                    // Someone else's pickup never hides a banner that matters more, like "you have it".
                    if (mine || !this.banner) this.showBanner(text, false)
                    return
                }
                case 'results':
                    this.remainingMs = 0
                    this.results = this.describeResults(message.results)
                    return
                case 'error':
                    this.error = STRINGS.errors[message.code]
                    setTimeout(() => {
                        if (this.error === STRINGS.errors[message.code]) this.error = ''
                    }, 4000)
                    return
            }
        },

        /** The canvas only exists once Alpine has rendered the page's templates. */
        ensureRenderer(): Renderer | null {
            const canvas = (this as unknown as Alpine).$refs.canvas
            if (!renderer && canvas instanceof HTMLCanvasElement) {
                renderer = new Renderer(canvas, {
                    reducedMotion: REDUCED_MOTION,
                    mode: () => this.gameMode,
                    myId: () => this.me?.id ?? null,
                    nameOf: id => this.nameOf(id),
                })
            }
            return renderer
        },

        durationOf(): number {
            return (this.session?.settings.durationMin ?? Number(this.duration)) * 60_000
        },

        startCountdown(ms: number) {
            if (countdownTimer) clearInterval(countdownTimer)
            const endsAt = performance.now() + ms
            const update = () => {
                this.countdownLeft = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000))
                if (this.countdownLeft === 0 && countdownTimer) clearInterval(countdownTimer)
            }
            update()
            countdownTimer = setInterval(update, 100)
        },

        showBanner(text: string, flash: boolean) {
            this.banner = text
            this.bannerFlash = flash && !REDUCED_MOTION
            if (bannerTimer) clearTimeout(bannerTimer)
            bannerTimer = setTimeout(() => {
                this.banner = ''
                this.bannerFlash = false
            }, 1800)
        },

        gotItText(): string {
            return this.gameMode === 'king' ? STRINGS.youAreKing : STRINGS.youHaveIt
        },

        describeResults(results: Results): ResultsView {
            if (results.mode === 'king') return this.describeReign(results)

            const survivors = results.survivorIds.map(id => this.nameOf(id))
            const stats = new Map(results.stats.map(s => [s.id, s]))
            const ordered = [
                ...results.survivorIds.map(id => ({ id, survived: true })),
                ...results.eliminated.map(e => ({ id: e.id, survived: false })),
            ]

            return {
                mode: results.mode,
                headline: survivors.length > 0 ? STRINGS.survivors(survivors) : STRINGS.nobody,
                rows: ordered.map((row, index) => ({
                    id: row.id,
                    name: this.nameOf(row.id),
                    place: row.survived ? '🏆' : `#${index + 1}`,
                    survived: row.survived,
                    holdSeconds: Math.round((stats.get(row.id)?.holdMs ?? 0) / 1000),
                    passes: stats.get(row.id)?.passes ?? 0,
                })),
            }
        },

        /** King of the Potato: longest reign first, ties sharing a place. */
        describeReign(results: Results): ResultsView {
            const kings = new Set(results.survivorIds)
            const ranked = [...results.stats].sort((a, b) => b.holdMs - a.holdMs)
            const seconds = (ms: number) => Math.round(ms / 1000)
            const best = seconds(ranked[0]?.holdMs ?? 0)

            return {
                mode: results.mode,
                headline:
                    kings.size > 0
                        ? STRINGS.kings(
                              [...kings].map(id => this.nameOf(id)),
                              best
                          )
                        : STRINGS.noKing,
                rows: ranked.map(row => ({
                    id: row.id,
                    name: this.nameOf(row.id),
                    place: kings.has(row.id)
                        ? '👑'
                        : `#${ranked.filter(other => other.holdMs > row.holdMs).length + 1}`,
                    survived: kings.has(row.id),
                    holdSeconds: seconds(row.holdMs),
                    passes: row.passes,
                })),
            }
        },

        nameOf(id: number): string {
            return (
                this.session?.players.find(p => p.id === id)?.name ??
                this.allPlayers.find(p => p.id === id)?.name ??
                STRINGS.someone
            )
        },

        // ── Keyboard ─────────────────────────────────────────────────────

        onKey(event: KeyboardEvent, down: boolean) {
            if (down) this.canPlay = true
            const move = MOVE_KEYS[event.code]
            if (!move) return

            const target = event.target as HTMLElement | null
            if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
            if (this.isPlaying) event.preventDefault()

            if (down) pressed.add(event.code)
            else pressed.delete(event.code)
            this.sendDirection()
        },

        sendDirection() {
            let dx = 0
            let dy = 0
            for (const code of pressed) {
                const move = MOVE_KEYS[code]
                if (move) {
                    dx += move[0]
                    dy += move[1]
                }
            }
            const length = Math.hypot(dx, dy)
            if (length > 0) {
                dx /= length
                dy /= length
            }
            if (dx === lastSent.dx && dy === lastSent.dy) return
            lastSent = { dx, dy }
            if (this.isPlaying) this.send({ type: 'input', dx, dy })
        },

        // ── "Notify me when a game opens" ────────────────────────────────

        async initAlerts() {
            if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
            if (Notification.permission === 'denied') return

            try {
                const response = await fetch(config.urls.pushConfig, { headers: { Accept: 'application/json' } })
                if (!response.ok) return
                const push = (await response.json()) as { configured: boolean; public_key: string | null }
                if (!push.configured || !push.public_key) return
                vapidKey = push.public_key

                const registration = await navigator.serviceWorker.ready
                const existing = await registration.pushManager.getSubscription()
                this.alerts.on = Boolean(existing) && readStored('hot_potato_alerts') === '1'
                this.alerts.available = true
            } catch (error) {
                console.warn('Hot potato alerts unavailable:', error)
            }
        },

        async toggleAlerts() {
            if (this.alerts.busy || !this.playerId) return
            this.alerts.busy = true
            this.alerts.message = ''

            try {
                const registration = await navigator.serviceWorker.ready

                if (this.alerts.on) {
                    const subscription = await registration.pushManager.getSubscription()
                    if (subscription)
                        await this.postJson(config.urls.pushUnsubscribe, { endpoint: subscription.endpoint })
                    writeStored('hot_potato_alerts', '')
                    this.alerts.on = false
                    return
                }

                const permission = await Notification.requestPermission()
                if (permission !== 'granted') throw new Error('Notifications were not allowed.')

                const subscription =
                    (await registration.pushManager.getSubscription()) ??
                    (await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: keyToBytes(vapidKey ?? ''),
                    }))
                const json = subscription.toJSON()
                await this.postJson(config.urls.pushSubscribe, {
                    player_id: Number(this.playerId),
                    endpoint: json.endpoint,
                    keys: json.keys,
                })
                writeStored('hot_potato_alerts', '1')
                this.alerts.on = true
            } catch (error) {
                this.alerts.message = (error as Error).message || 'Could not change notifications.'
            } finally {
                this.alerts.busy = false
            }
        },

        async postJson(url: string, body: object) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': config.csrf,
                },
                body: JSON.stringify(body),
            })
            if (!response.ok) throw new Error(`The server rejected that (${response.status}).`)
            return response.json()
        },
    }
}

let vapidKey: string | null = null

/** PushManager wants the URL-safe base64 VAPID key as raw bytes. */
function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(raw, char => char.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}

function readStored(key: string): string {
    try {
        return localStorage.getItem(key) ?? ''
    } catch {
        return ''
    }
}

function writeStored(key: string, value: string) {
    try {
        if (value) localStorage.setItem(key, value)
        else localStorage.removeItem(key)
    } catch {
        // Private mode: the picker just won't be remembered.
    }
}

;(window as unknown as { hotPotatoApp: typeof hotPotatoApp }).hotPotatoApp = hotPotatoApp
