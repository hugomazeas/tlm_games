import type { PlayerInfo } from '../protocol.ts'
import { REPLAY_VERSION, type Replay, type ReplayMessage, type ReplayMeta } from '../replay.ts'
import { THEMES } from '../sim/themes.ts'
import { describeResults, type ResultsView } from './describe.ts'
import { playerColour, Renderer } from './renderer.ts'
import { ReplayPlayer, type SeekState, type Speed, SPEEDS } from './replay-player.ts'
import { STRINGS } from './strings.ts'

/**
 * The replay page as an Alpine component, built by the game server like the
 * live page's and loaded the same way, before Alpine starts:
 *
 *   <div x-data="hotPotatoReplay({ dataUrl })">…</div>
 *
 * The recording, the player and the renderer live outside Alpine's reactive
 * proxy; only the clock, the HUD and the controls are reactive.
 */

interface Config {
    dataUrl: string
}

type Alpine = {
    $refs: Record<string, HTMLElement>
    $nextTick: (callback: () => void) => void
}

/** "▶ 3 s before" a boom starts this far ahead of it. */
const BEFORE_BOOM_MS = 3000
const SKIP_MS = 5000
/** The reactive clock and HUD catch up this often; the canvas runs every frame regardless. */
const HUD_EVERY_MS = 100
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches

function hotPotatoReplay(config: Config) {
    let player: ReplayPlayer | null = null
    let renderer: Renderer | null = null
    let roster = new Map<number, PlayerInfo>()
    let lastFrameAt = 0
    let lastHudAt = 0
    let bannerTimer: ReturnType<typeof setTimeout> | null = null

    return {
        status: 'loading' as 'loading' | 'ready' | 'missing',
        meta: null as ReplayMeta | null,
        players: [] as PlayerInfo[],
        playing: false,
        speed: 1 as Speed,
        speeds: SPEEDS,
        currentMs: 0,
        startMs: 0,
        endMs: 0,
        playStartMs: 0,
        booms: [] as Array<{ atMs: number; playerId: number; label: string; clock: string }>,
        followId: null as number | null,
        results: null as ResultsView | null,
        banner: '',
        remainingMs: 0,
        aliveCount: 0,

        async init() {
            try {
                const response = await fetch(config.dataUrl, { headers: { Accept: 'application/json' } })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const replay = (await response.json()) as Replay
                if (replay.version !== REPLAY_VERSION) throw new Error(`Replay version ${replay.version}`)
                this.load(replay)
            } catch (error) {
                console.warn('Replay unavailable:', error)
                this.status = 'missing'
                return
            }

            window.addEventListener('keydown', event => this.onKey(event))
            ;(this as unknown as Alpine).$nextTick(() => {
                const countdown = player?.countdown
                const canvas = (this as unknown as Alpine).$refs.canvas
                if (!player || !countdown || !(canvas instanceof HTMLCanvasElement)) return

                renderer = new Renderer(canvas, {
                    reducedMotion: REDUCED_MOTION,
                    mode: () => this.meta?.mode ?? 'survival',
                    myId: () => this.followId,
                    nameOf: id => this.nameOf(id),
                    avatarOf: id => roster.get(id)?.avatarUrl ?? null,
                    lookOf: id => roster.get(id)?.look,
                })
                renderer.setArena(countdown.arena, countdown.playerIds)
                this.seek(player.startMs)
                this.play()
                requestAnimationFrame(time => this.frame(time))
            })
        },

        load(replay: Replay) {
            player = new ReplayPlayer(replay)
            roster = new Map(replay.meta.roster.map(p => [p.id, p]))
            this.meta = replay.meta
            this.players = replay.meta.roster
            this.startMs = player.startMs
            this.endMs = player.endMs
            this.playStartMs = player.playStartMs
            this.booms = player.booms.map(boom => ({
                ...boom,
                label: this.nameOf(boom.playerId),
                clock: this.clockAt(boom.atMs),
            }))
            this.status = 'ready'
        },

        // ── Derived state ────────────────────────────────────────────────

        get modeLabel() {
            return this.meta ? STRINGS.modes[this.meta.mode].label : ''
        },
        get arenaLabel() {
            const theme = this.meta ? THEMES[this.meta.theme] : null
            return theme ? STRINGS.intro.arena(theme.emoji, theme.name) : ''
        },
        /** 3 · 2 · 1 over the lead-in, as the room saw it. */
        get countdownLeft() {
            return this.currentMs < this.playStartMs ? Math.ceil((this.playStartMs - this.currentMs) / 1000) : 0
        },
        get timerText() {
            return formatClock(this.remainingMs)
        },
        get progress() {
            const span = this.endMs - this.startMs
            return span > 0 ? (this.currentMs - this.startMs) / span : 0
        },

        // ── Playback ─────────────────────────────────────────────────────

        frame(time: number) {
            const dt = lastFrameAt ? Math.min(250, time - lastFrameAt) : 0
            lastFrameAt = time
            if (player) {
                for (const message of player.advance(dt)) this.apply(message)
                if (!player.playing) this.playing = false
                if (time - lastHudAt > HUD_EVERY_MS || !player.playing) {
                    lastHudAt = time
                    this.currentMs = player.currentMs
                }
            }
            requestAnimationFrame(next => this.frame(next))
        },

        apply(message: ReplayMessage) {
            switch (message.type) {
                case 'snapshot':
                    renderer?.pushSnapshot(message)
                    this.remainingMs = Math.max(0, (this.meta?.durationMs ?? 0) - message.elapsedMs)
                    this.aliveCount = message.players.filter(p => !p.out && !p.infected).length
                    return
                case 'boom':
                    renderer?.boom(message.playerId)
                    this.showBanner(
                        this.meta?.mode === 'killer'
                            ? STRINGS.caught(this.nameOf(message.playerId))
                            : STRINGS.boom(this.nameOf(message.playerId))
                    )
                    return
                case 'pickup': {
                    const target = message.targetId === undefined ? undefined : this.nameOf(message.targetId)
                    if (message.effect === 'freeze') renderer?.burst(message.playerId, 'freeze')
                    if (message.effect === 'swap' && message.targetId !== undefined) {
                        renderer?.burst(message.playerId, 'swap')
                        renderer?.burst(message.targetId, 'swap')
                    }
                    if (!this.banner) {
                        this.showBanner(
                            STRINGS.pickup(this.nameOf(message.playerId), message.item, message.effect, target)
                        )
                    }
                    return
                }
                case 'results':
                    this.results = describeResults(message.results, this)
                    return
                case 'infected':
                    renderer?.infectionBlast(message.playerId)
                    this.showBanner(STRINGS.gotInfected(this.nameOf(message.playerId)))
                    return
                case 'patientZero':
                    this.showBanner(STRINGS.newPatientZero(this.nameOf(message.playerId)))
                    return
                case 'teleport':
                    renderer?.portalFlash(message.portalId)
                    return
                // The countdown set the arena up front; passes show on the canvas.
                case 'countdown':
                case 'pass':
                case 'newPotato':
                    return
            }
        },

        play() {
            if (!player) return
            if (player.ended) this.seek(player.startMs)
            player.play()
            this.playing = true
        },
        pause() {
            player?.pause()
            this.playing = false
        },
        togglePlay() {
            if (this.playing) this.pause()
            else this.play()
        },
        setSpeed(speed: Speed) {
            this.speed = speed
            if (player) player.speed = speed
        },

        seek(ms: number) {
            if (!player) return
            this.show(player.seek(ms))
            this.currentMs = player.currentMs
        },
        skip(deltaMs: number) {
            this.seek(this.currentMs + deltaMs)
        },
        beforeBoom(atMs: number) {
            this.seek(atMs - BEFORE_BOOM_MS)
            this.play()
        },

        /** Draws the state a seek landed on; nothing on the way fires. */
        show(state: SeekState) {
            renderer?.jumpTo(state.snapshot)
            this.banner = ''
            this.results = state.results ? describeResults(state.results.results, this) : null
            this.remainingMs = Math.max(0, (this.meta?.durationMs ?? 0) - (state.snapshot?.elapsedMs ?? 0))
            this.aliveCount = state.snapshot
                ? state.snapshot.players.filter(p => !p.out && !p.infected).length
                : (player?.countdown?.playerIds.length ?? 0)
        },

        /** Rings a player as if you were them; again to stop. */
        follow(id: number) {
            this.followId = this.followId === id ? null : id
        },

        showBanner(text: string) {
            this.banner = text
            if (bannerTimer) clearTimeout(bannerTimer)
            bannerTimer = setTimeout(
                () => {
                    this.banner = ''
                },
                1800 / (player?.speed ?? 1)
            )
        },

        // ── Who's who ────────────────────────────────────────────────────

        nameOf(id: number): string {
            return roster.get(id)?.name ?? STRINGS.someone
        },
        isHunter(id: number): boolean {
            return Boolean(roster.get(id)?.hunter)
        },
        colourOf(player: PlayerInfo): string {
            return playerColour(player.id, player.look)
        },
        avatarOf(id: number): string | null {
            return roster.get(id)?.avatarUrl ?? null
        },

        /** The game clock (time left) at a point of the recording. */
        clockAt(atMs: number): string {
            const intoGame = Math.max(0, atMs - this.playStartMs)
            return formatClock(Math.max(0, (this.meta?.durationMs ?? 0) - intoGame))
        },

        onKey(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null
            if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) && event.code === 'Space')
                return
            if (event.ctrlKey || event.metaKey || event.altKey) return

            if (event.code === 'Space') {
                event.preventDefault()
                this.togglePlay()
            } else if (event.code === 'ArrowLeft') {
                event.preventDefault()
                this.skip(-SKIP_MS)
            } else if (event.code === 'ArrowRight') {
                event.preventDefault()
                this.skip(SKIP_MS)
            }
        },
    }
}

function formatClock(ms: number): string {
    const seconds = Math.ceil(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

;(window as unknown as { hotPotatoReplay: typeof hotPotatoReplay }).hotPotatoReplay = hotPotatoReplay
