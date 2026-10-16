import type { Emote, PlayerInfo, Results, ServerMessage, SessionView } from '../protocol.ts'
import { EMOTES, GAME_MODES, MAX_PLAYERS, MIN_PLAYERS } from '../protocol.ts'
import type { GameMode } from '../sim/game.ts'
import type { ItemKind } from '../sim/items.ts'
import { THEMES, THEME_IDS, type ThemeId } from '../sim/themes.ts'
import { BUILD } from './build.ts'
import { freshness, reloadedFor, reloadFresh } from './freshness.ts'
import type { ChatLine } from '../chat.ts'
import { CHAT_KEEP, CHAT_MAX_BODY } from '../chat.ts'
import { chatText, describeResults, type ResultsView } from './describe.ts'
import { cosmeticValue } from '../cosmetics.ts'
import { ITEM_ICONS, playerColour, Renderer } from './renderer.ts'
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
    players: Array<{ id: number; name: string; office_id: number | null; avatar_url: string | null }>
    csrf: string
    urls: { pushConfig: string; pushSubscribe: string; pushUnsubscribe: string; recentGames: string }
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
    /** Infection: who patient zero is gets said once, on the game's first snapshot. */
    let patientZeroTold = false
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
        /** The countdown's first half announces what's coming: the mode, its rule and the arena. */
        intro: null as { mode: string; hint: string; arena: string } | null,
        remainingMs: 0,
        aliveCount: 0,
        results: null as ResultsView | null,
        /** The game on the results screen was saved with its replay: its page. */
        replayUrl: null as string | null,
        /** Who's on this office's page without a seat. */
        watchers: { named: [] as PlayerInfo[], guests: 0 },
        chatLines: [] as ChatLine[],
        chatDraft: '',
        chatMaxLength: CHAT_MAX_BODY,
        chatStrings: STRINGS.chat,
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
        /** The server runs a newer bundle than this tab: reload as soon as it won't interrupt a game. */
        stale: false,
        /** The server's build, once `welcome` says it. */
        serverBuild: '',
        /** Reloaded once for this build and still old: a cache holds the old bundle. Ask for a hard refresh. */
        staleStuck: false,
        /** The lobby and arena fill the screen (F, or the ⛶ button). */
        fullscreen: false,
        emotes: EMOTES,
        /** Each player's latest emote on this results screen, shown beside their row. */
        lastEmotes: {} as Record<number, Emote>,
        itemLegend: (Object.keys(STRINGS.items) as ItemKind[]).map(kind => ({
            kind,
            icon: ITEM_ICONS[kind],
            label: STRINGS.items[kind],
        })),
        padLegend: STRINGS.pads,

        init() {
            const alpine = this as unknown as Alpine
            alpine.$watch('officeId', () => this.reconnect())
            alpine.$watch('playerId', () => this.reconnect())
            for (const pick of ['mode', 'duration', 'theme']) alpine.$watch(pick, () => this.shareSettings())
            window.addEventListener('keydown', event => this.onKey(event, true))
            window.addEventListener('keyup', event => this.onKey(event, false))
            document.addEventListener('fullscreenchange', () => {
                this.fullscreen = document.fullscreenElement !== null
            })
            // Back from the locker in another tab: the lobby picks up your new look.
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.isMember && this.phase === 'lobby') this.send({ type: 'refreshLook' })
            })
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
        /** In this game, from its countdown to the end of its results screen. */
        get inGame() {
            const phase = this.phase
            return (
                this.me !== null &&
                this.gamePlayerIds.includes(this.me.id) &&
                (phase === 'countdown' || phase === 'playing' || phase === 'results')
            )
        },
        /**
         * Switching office or player reconnects as someone else, which drops your seat:
         * the pickers stay put from a game's countdown to the end of its results.
         */
        get pickersLocked() {
            return this.inGame
        },
        get canEmote() {
            return this.me !== null && this.gamePlayerIds.includes(this.me.id) && this.phase === 'results'
        },
        /** The first half of the countdown is the reveal card; then the big 3, 2, 1. */
        get showIntro() {
            return this.phase === 'countdown' && this.intro !== null && this.countdownLeft > 3
        },
        get hostName() {
            return this.session ? this.nameOf(this.session.hostId) : ''
        },
        get presentCount() {
            return this.session?.players.filter(p => !p.away).length ?? 0
        },
        get canStart() {
            if (!this.isHost || this.phase !== 'lobby') return false
            // Infection is people only: three of them; AIs sit out.
            if (this.mode === 'infection') {
                return (this.session?.players.filter(p => !p.away && !p.bot).length ?? 0) >= MIN_PLAYERS
            }
            return this.presentCount >= MIN_PLAYERS
        },
        get canAddBot() {
            return this.isHost && this.phase === 'lobby' && (this.session?.players.length ?? 0) < MAX_PLAYERS
        },
        /** The mode of the game on screen, or the one the host has picked. */
        get gameMode(): GameMode {
            return this.session?.settings.mode ?? this.mode
        },
        get modeHint() {
            return STRINGS.modes[this.gameMode].hint
        },
        get watcherCount() {
            return this.watchers.named.length + this.watchers.guests
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
            this.chatLines = []
            this.watchers = { named: [], guests: 0 }
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
        /** The host changed a pick: tell the lobby. */
        shareSettings() {
            if (!this.isHost || this.phase !== 'lobby') return
            this.send({ type: 'settings', durationMin: Number(this.duration), theme: this.theme, mode: this.mode })
        },
        addBot() {
            if (this.canAddBot) this.send({ type: 'addBot' })
        },
        removeBot(playerId: number) {
            if (this.isHost) this.send({ type: 'removeBot', playerId })
        },
        emote(emote: Emote) {
            if (this.canEmote) this.send({ type: 'emote', emote })
        },
        backToLobby() {
            if (this.isHost && this.phase === 'results') this.send({ type: 'backToLobby' })
        },
        toggleFullscreen() {
            if (document.fullscreenElement) {
                void document.exitFullscreen()
                return
            }
            const stage = (this as unknown as Alpine).$refs.stage
            stage?.requestFullscreen().catch(() => {
                // Refused (an iframe, or no user gesture): the page just stays as it is.
            })
        },

        /** Picks up a newer bundle, but never in the middle of a game you're playing. */
        reloadIfStale() {
            if (this.stale && !this.staleStuck && !this.inGame) {
                this.stale = false
                void reloadFresh('/games/hot-potato/live/client.js', this.serverBuild)
            }
        },

        // ── Messages ─────────────────────────────────────────────────────

        onMessage(message: ServerMessage) {
            switch (message.type) {
                case 'welcome':
                    this.me = message.player
                    this.serverBuild = message.build
                    {
                        const state = freshness(message.build, BUILD, reloadedFor())
                        this.stale = state !== 'fresh'
                        this.staleStuck = state === 'stuck'
                    }
                    this.reloadIfStale()
                    return
                case 'office': {
                    const wasCountingDown = this.session?.phase === 'countdown'
                    this.session = message.session
                    if (wasCountingDown && message.session?.phase === 'playing') {
                        this.intro = null
                        this.showBanner(STRINGS.intro.go, true)
                    }
                    if (!message.session || message.session.phase === 'lobby') {
                        this.gamePlayerIds = []
                        this.results = null
                        renderer?.clear()
                    }
                    // The host's own picks are the truth in the lobby (an echo could undo a newer click);
                    // everyone else follows them.
                    if (message.session && !(this.isHost && message.session.phase === 'lobby')) {
                        this.duration = message.session.settings.durationMin
                        this.mode = message.session.settings.mode
                        this.theme = message.session.settings.theme
                    }
                    this.reloadIfStale()
                    return
                }
                case 'countdown': {
                    const theme = THEMES[message.arena.theme]
                    const mode = this.session?.settings.mode ?? this.mode
                    this.intro = {
                        mode: STRINGS.modes[mode].label,
                        hint: STRINGS.modes[mode].hint,
                        arena: STRINGS.intro.arena(theme.emoji, theme.name),
                    }
                    this.lastEmotes = {}
                    this.results = null
                    this.replayUrl = null
                    this.gamePlayerIds = message.playerIds
                    this.remainingMs = message.durationMs
                    this.aliveCount = message.playerIds.length
                    this.kingBoard = []
                    patientZeroTold = false
                    ;(this as unknown as Alpine).$nextTick(() =>
                        this.ensureRenderer()?.setArena(message.arena, message.playerIds)
                    )
                    this.startCountdown(message.startsInMs)
                    return
                }
                case 'snapshot': {
                    renderer?.pushSnapshot(message)
                    if (this.gameMode === 'infection' && !patientZeroTold) {
                        patientZeroTold = true
                        const zero = message.players.find(p => p.infected)
                        if (zero?.id === this.me?.id) this.showBanner(STRINGS.patientZero, true)
                        else if (zero) this.showBanner(STRINGS.isPatientZero(this.nameOf(zero.id)), false)
                    }
                    // Killer Potato: who hunts (they hold the potato) gets said once too.
                    if (this.gameMode === 'killer' && !patientZeroTold && message.holderId !== null) {
                        patientZeroTold = true
                        if (message.holderId === this.me?.id) this.showBanner(STRINGS.youAreKiller, true)
                        else this.showBanner(STRINGS.isKiller(this.nameOf(message.holderId)), false)
                    }
                    const now = performance.now()
                    if (now - lastHudAt > 250) {
                        lastHudAt = now
                        this.remainingMs = Math.max(0, this.durationOf() - message.elapsedMs)
                        // Infection counts the clean: those are the ones still in it.
                        this.aliveCount = message.players.filter(
                            p => !p.out && !(this.gameMode === 'infection' && p.infected)
                        ).length
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
                case 'infected':
                    renderer?.infectionBlast(message.playerId)
                    if (message.playerId === this.me?.id) this.showBanner(STRINGS.youAreInfected, true)
                    else this.showBanner(STRINGS.gotInfected(this.nameOf(message.playerId)), false)
                    return
                case 'newHunter':
                    if (message.playerId === this.me?.id) this.showBanner(STRINGS.youAreNewKiller, true)
                    else this.showBanner(STRINGS.newKiller(this.nameOf(message.playerId)), false)
                    return
                case 'patientZero':
                    if (message.playerId === this.me?.id) this.showBanner(STRINGS.youAreNewPatientZero, true)
                    else this.showBanner(STRINGS.newPatientZero(this.nameOf(message.playerId)), false)
                    return
                case 'teleport':
                    renderer?.portalFlash(message.portalId)
                    return
                case 'newPotato':
                    if (message.playerId === this.me?.id) this.showBanner(this.gotItText(), true)
                    return
                case 'boom':
                    renderer?.boom(message.playerId)
                    this.showBanner(
                        this.gameMode === 'killer'
                            ? message.playerId === this.me?.id
                                ? STRINGS.youWereCaught
                                : STRINGS.caught(this.nameOf(message.playerId))
                            : message.playerId === this.me?.id
                              ? STRINGS.youAreOut
                              : STRINGS.boom(this.nameOf(message.playerId)),
                        false
                    )
                    return
                case 'pickup': {
                    const mine = message.playerId === this.me?.id
                    const hitMe = message.targetId !== undefined && message.targetId === this.me?.id
                    const target =
                        message.targetId === undefined ? undefined : hitMe ? null : this.nameOf(message.targetId)
                    const text = STRINGS.pickup(
                        mine ? null : this.nameOf(message.playerId),
                        message.item,
                        message.effect,
                        target
                    )
                    if (message.effect === 'freeze') renderer?.burst(message.playerId, 'freeze')
                    if (message.effect === 'swap' && message.targetId !== undefined) {
                        renderer?.burst(message.playerId, 'swap')
                        renderer?.burst(message.targetId, 'swap')
                    }
                    // Someone else's pickup never hides a banner that matters more, like "you have it".
                    if (mine || hitMe || !this.banner) this.showBanner(text, hitMe)
                    return
                }
                case 'emote':
                    renderer?.emote(message.playerId, message.emote)
                    this.lastEmotes = { ...this.lastEmotes, [message.playerId]: message.emote }
                    return
                case 'results':
                    this.remainingMs = 0
                    this.results = describeResults(message.results, this)
                    this.startCountdown(message.endsInMs)
                    return
                case 'watchers':
                    this.watchers = { named: message.named, guests: message.guests }
                    return
                case 'chatHistory':
                    this.chatLines = message.lines
                    this.scrollChat()
                    return
                case 'chat':
                    this.chatLines = [...this.chatLines, message.line].slice(-CHAT_KEEP)
                    this.scrollChat()
                    return
                // Saving can outlast the results screen: the link only matters while it shows.
                case 'replayReady':
                    if (this.phase === 'results') this.replayUrl = `/games/hot-potato/replays/${message.gameId}`
                    void this.refreshRecentGames()
                    return
                case 'error':
                    this.error = STRINGS.errors[message.code]
                    setTimeout(() => {
                        if (this.error === STRINGS.errors[message.code]) this.error = ''
                    }, 4000)
                    return
            }
        },

        /** The game is saved by now: swap in the office's list from the Hub. A failure keeps the old one. */
        async refreshRecentGames(): Promise<void> {
            const office = this.officeId
            const section = document.querySelector<HTMLElement>(`[data-recent-games-office="${office}"]`)
            const list = section?.querySelector<HTMLElement>('[data-recent-games-list]')
            if (!section || !list) return
            try {
                const response = await fetch(`${config.urls.recentGames}/${office}`, {
                    headers: { Accept: 'text/html' },
                })
                if (response.status !== 200) return
                list.innerHTML = await response.text()
                section.hidden = false
            } catch {
                // The list stays as it was.
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
                    avatarOf: id => this.avatarOf(id),
                    lookOf: id => this.session?.players.find(p => p.id === id)?.look,
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

        nameOf(id: number): string {
            return (
                this.session?.players.find(p => p.id === id)?.name ??
                this.allPlayers.find(p => p.id === id)?.name ??
                STRINGS.someone
            )
        },

        sendChat() {
            const body = this.chatDraft.trim()
            if (!this.me || body === '') return
            this.send({ type: 'chat', body })
            this.chatDraft = ''
        },

        chatText(line: ChatLine): string {
            return line.event ? chatText(line.event) : (line.body ?? '')
        },

        chatTime(line: ChatLine): string {
            return new Date(line.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },

        replayLink(line: ChatLine): string | null {
            return line.event?.type === 'replay' ? `/games/hot-potato/replays/${line.event.gameId}` : null
        },

        /** Newest at the bottom: follow it, unless you scrolled up to read. */
        scrollChat() {
            const box = (this as unknown as Alpine).$refs.chat
            const following = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 60
            ;(this as unknown as Alpine).$nextTick(() => {
                if (box && following) box.scrollTop = box.scrollHeight
            })
        },

        colourOf(player: PlayerInfo): string {
            return playerColour(player.id, player.look)
        },

        hatOf(player: PlayerInfo): string | null {
            return cosmeticValue('hat', player.look?.hat)
        },

        avatarOf(id: number): string | null {
            const seated = this.session?.players.find(p => p.id === id)
            if (seated) return seated.avatarUrl

            return this.allPlayers.find(p => p.id === id)?.avatar_url ?? null
        },

        // ── Keyboard ─────────────────────────────────────────────────────

        onKey(event: KeyboardEvent, down: boolean) {
            if (down) this.canPlay = true
            const target = event.target as HTMLElement | null
            const typing = target !== null && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)

            const plain = !event.ctrlKey && !event.metaKey && !event.altKey
            if (down && event.code === 'KeyF' && plain && !event.repeat && !typing && this.session) {
                this.toggleFullscreen()
                return
            }

            const move = MOVE_KEYS[event.code]
            if (!move || typing) return
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
