import type { SnapshotItem, SnapshotPlayer } from '../protocol.ts'
import { type Arena, AVATAR_RADIUS } from '../sim/arena.ts'
import { FREEZE_MS, type GameMode, STEAL_SAFETY_MS } from '../sim/game.ts'
import { obstacleAt } from '../sim/geometry.ts'
import { ITEM_RADIUS, type ItemKind, SHIELD_MS } from '../sim/items.ts'
import { THEMES } from '../sim/themes.ts'

/** Remote avatars are drawn this far in the past, so there are always two snapshots to blend. */
const INTERPOLATION_DELAY_MS = 100
const SPLAT_MS = 1200
/** Items blink for their last few seconds before they vanish. */
const ITEM_BLINK_MS = 3000
const TRAIL_LENGTH = 5
/** Distance between two trail ghosts, in arena units. */
const TRAIL_SPACING = 0.6

export const ITEM_ICONS: Record<ItemKind, string> = { shield: '🛡️', speed: '⚡', banana: '🍌', mystery: '❓' }
const ITEM_GLOW: Record<ItemKind, string> = {
    shield: '#38bdf8',
    speed: '#facc15',
    banana: '#fde047',
    mystery: '#c084fc',
}

interface Snapshot {
    receivedAt: number
    elapsedMs: number
    players: SnapshotPlayer[]
    items: SnapshotItem[]
    holderId: number | null
    shake: number
}

interface Splat {
    x: number
    y: number
    at: number
}

export interface RendererOptions {
    reducedMotion: boolean
    mode: () => GameMode
    myId: () => number | null
    nameOf: (id: number) => string
}

/**
 * Draws the arena on a canvas, independently of Alpine: snapshots arrive 20
 * times a second and must never touch reactive state.
 */
export class Renderer {
    private arena: Arena | null = null
    private spawnOrder: number[] = []
    private snapshots: Snapshot[] = []
    private splats: Splat[] = []
    /** Recent positions of boosted players, for the speed trail. */
    private trails = new Map<number, Array<{ x: number; y: number }>>()
    private own: { x: number; y: number } | null = null
    private frame = 0
    private lastFrameAt = 0

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly options: RendererOptions
    ) {}

    setArena(arena: Arena, playerIds: number[]) {
        this.arena = arena
        this.spawnOrder = playerIds
        this.snapshots = []
        this.splats = []
        this.trails.clear()
        this.own = null
        this.start()
    }

    clear() {
        this.arena = null
        this.snapshots = []
        this.splats = []
        this.stop()
        const context = this.canvas.getContext('2d')
        context?.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }

    pushSnapshot(snapshot: Omit<Snapshot, 'receivedAt'>) {
        this.snapshots.push({ ...snapshot, receivedAt: performance.now() })
        if (this.snapshots.length > 20) this.snapshots.shift()
    }

    /** Remembers where someone blew up, for the pie splat. */
    boom(playerId: number) {
        const latest = this.snapshots.at(-1)
        const p = latest?.players.find(candidate => candidate.id === playerId)
        if (p) this.splats.push({ x: p.x, y: p.y, at: performance.now() })
    }

    private start() {
        if (this.frame) return
        const loop = (time: number) => {
            this.draw(time)
            this.frame = requestAnimationFrame(loop)
        }
        this.frame = requestAnimationFrame(loop)
    }

    private stop() {
        if (this.frame) cancelAnimationFrame(this.frame)
        this.frame = 0
    }

    private draw(time: number) {
        const arena = this.arena
        const context = this.canvas.getContext('2d')
        if (!arena || !context) return

        const dt = this.lastFrameAt ? Math.min(0.1, (time - this.lastFrameAt) / 1000) : 0
        this.lastFrameAt = time
        const scale = this.fit(arena)
        const theme = THEMES[arena.theme]
        const state = this.stateAt(time - INTERPOLATION_DELAY_MS)
        const players = this.withOwnAvatar(state.players, dt)

        context.setTransform(scale * devicePixelRatio, 0, 0, scale * devicePixelRatio, 0, 0)
        context.clearRect(0, 0, arena.width, arena.height)

        // Floor with a faint grid, then the walls.
        context.fillStyle = theme.palette.floor
        context.fillRect(0, 0, arena.width, arena.height)
        context.strokeStyle = theme.palette.floorLine
        context.globalAlpha = 0.35
        context.lineWidth = 0.06
        for (let x = 4; x < arena.width; x += 4) line(context, x, 0, x, arena.height)
        for (let y = 4; y < arena.height; y += 4) line(context, 0, y, arena.width, y)
        context.globalAlpha = 1
        context.strokeStyle = theme.palette.wall
        context.lineWidth = 0.5
        context.strokeRect(0.25, 0.25, arena.width - 0.5, arena.height - 0.5)

        for (const obstacle of arena.obstacles) {
            const o = obstacleAt(obstacle, state.elapsedMs)
            context.fillStyle = theme.palette.obstacle
            context.strokeStyle = theme.palette.obstacleEdge
            context.lineWidth = 0.15
            context.beginPath()
            if (o.kind === 'circle') context.arc(o.x, o.y, o.r, 0, Math.PI * 2)
            else context.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 0.4)
            context.fill()
            context.stroke()
        }

        this.drawSplats(context, time)
        this.drawItems(context, state.items, time)

        // Ghosts underneath, the living on top, the holder last.
        const ordered = [...players].sort((a, b) => rank(a, state.holderId) - rank(b, state.holderId))
        for (const p of ordered) this.drawPlayer(context, p, state, time)
    }

    private drawPlayer(context: CanvasRenderingContext2D, p: SnapshotPlayer, state: Snapshot, time: number) {
        const r = AVATAR_RADIUS
        const isMe = p.id === this.options.myId()
        const isHolder = p.id === state.holderId
        const name = this.options.nameOf(p.id)
        const active = !p.out

        context.save()
        if (p.out) context.globalAlpha = 0.25

        if (active && p.speedMs > 0) this.drawTrail(context, p)
        else this.trails.delete(p.id)

        const king = this.options.mode() === 'king'
        if (isHolder) {
            const pulse = this.options.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time / (120 - 80 * state.shake))
            // A king glows gold and steady; a survival potato burns hotter as the fuse runs down.
            context.shadowColor = king ? '#facc15' : state.shake > 0.5 ? '#ef4444' : '#f97316'
            context.shadowBlur = (10 + 20 * pulse) * devicePixelRatio
        }

        context.fillStyle = colourFor(p.id)
        context.beginPath()
        context.arc(p.x, p.y, r, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0

        if (isMe) {
            context.strokeStyle = '#ffffff'
            context.lineWidth = 0.18
            context.stroke()
        }

        context.fillStyle = '#ffffff'
        context.font = `700 ${0.8}px Outfit, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        if (active && p.slipMs > 0 && !this.options.reducedMotion) {
            // Spinning out on a banana: the initials go round.
            context.save()
            context.translate(p.x, p.y + 0.05)
            context.rotate(time / 70)
            context.fillText(initials(name), 0, 0)
            context.restore()
        } else {
            context.fillText(initials(name), p.x, p.y + 0.05)
        }

        context.font = `600 ${0.65}px Outfit, sans-serif`
        context.fillStyle = 'rgba(255,255,255,0.85)'
        context.fillText(name, p.x, p.y - r - 0.6)

        if (p.frozenMs > 0 && !p.out) {
            context.fillStyle = 'rgba(96,165,250,0.45)'
            context.beginPath()
            context.arc(p.x, p.y, r, 0, Math.PI * 2)
            context.fill()
            context.strokeStyle = '#93c5fd'
            context.lineWidth = 0.15
            context.beginPath()
            context.arc(p.x, p.y, r + 0.3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.frozenMs) / FREEZE_MS)
            context.stroke()
            context.font = `${0.7}px sans-serif`
            context.fillText('❄️', p.x + r, p.y + r)
        }

        if (active && p.shieldMs > 0) {
            context.fillStyle = 'rgba(56,189,248,0.18)'
            context.beginPath()
            context.arc(p.x, p.y, r + 0.45, 0, Math.PI * 2)
            context.fill()
            context.strokeStyle = '#7dd3fc'
            context.lineWidth = 0.12
            context.beginPath()
            context.arc(p.x, p.y, r + 0.45, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.shieldMs) / SHIELD_MS)
            context.stroke()
        }

        // Active effects in a row under the avatar, each on a dark disc so it reads on any floor.
        const badges = [p.shieldMs > 0 && '🛡️', p.speedMs > 0 && '⚡', p.slipMs > 0 && '🍌'].filter(
            (badge): badge is string => active && typeof badge === 'string'
        )
        context.font = `${0.6}px sans-serif`
        badges.forEach((badge, i) => {
            const bx = p.x + (i - (badges.length - 1) / 2) * 0.85
            const by = p.y + r + 0.6
            context.fillStyle = 'rgba(15,23,42,0.85)'
            context.beginPath()
            context.arc(bx, by, 0.4, 0, Math.PI * 2)
            context.fill()
            context.fillText(badge, bx, by + 0.03)
        })

        // A fresh king's head start: nobody can take the crown until the gold ring runs out.
        if (active && p.safeMs > 0) {
            context.strokeStyle = '#facc15'
            context.lineWidth = 0.15
            context.beginPath()
            context.arc(p.x, p.y, r + 0.3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.safeMs) / STEAL_SAFETY_MS)
            context.stroke()
        }

        if (isHolder && king) {
            const bob = this.options.reducedMotion ? 0 : Math.sin(time / 200) * 0.15
            context.font = `${1.2}px sans-serif`
            context.fillText('🥔', p.x, p.y - r - 1.4 + bob)
            context.font = `${1}px sans-serif`
            context.fillText('👑', p.x, p.y - r - 2.6 + bob)
        } else if (isHolder) {
            const jitter = this.options.reducedMotion ? 0 : state.shake * 0.35
            const jx = (Math.random() - 0.5) * jitter
            const jy = (Math.random() - 0.5) * jitter
            const bob = this.options.reducedMotion ? 0 : Math.sin(time / 200) * 0.15
            context.font = `${1.3 + state.shake * 0.4}px sans-serif`
            context.fillText('🥔', p.x + jx, p.y - r - 1.6 + bob + jy)
        }

        context.restore()
    }

    private drawItems(context: CanvasRenderingContext2D, items: SnapshotItem[], time: number) {
        for (const item of items) {
            const blinking = item.expiresInMs < ITEM_BLINK_MS
            if (blinking && !this.options.reducedMotion && Math.floor(time / 150) % 2 === 0) continue

            const bob = this.options.reducedMotion ? 0 : Math.sin(time / 300 + item.id) * 0.12
            context.save()
            context.globalAlpha = blinking && this.options.reducedMotion ? 0.5 : 1
            context.shadowColor = ITEM_GLOW[item.kind]
            context.shadowBlur = 12 * devicePixelRatio
            context.fillStyle = 'rgba(15,23,42,0.75)'
            context.strokeStyle = ITEM_GLOW[item.kind]
            context.lineWidth = 0.12
            context.beginPath()
            context.arc(item.x, item.y + bob, ITEM_RADIUS + 0.15, 0, Math.PI * 2)
            context.fill()
            context.stroke()
            context.shadowBlur = 0
            context.font = `${0.85}px sans-serif`
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(ITEM_ICONS[item.kind], item.x, item.y + bob + 0.05)
            context.restore()
        }
    }

    /** Fading copies of a boosted avatar where it has just been, spaced out so they show behind it. */
    private drawTrail(context: CanvasRenderingContext2D, p: SnapshotPlayer) {
        const trail = this.trails.get(p.id) ?? []
        const newest = trail.at(-1)
        if (!newest || Math.hypot(p.x - newest.x, p.y - newest.y) >= TRAIL_SPACING) {
            trail.push({ x: p.x, y: p.y })
            if (trail.length > TRAIL_LENGTH) trail.shift()
        }
        this.trails.set(p.id, trail)
        if (this.options.reducedMotion) return

        context.save()
        context.fillStyle = colourFor(p.id)
        trail.forEach((point, i) => {
            context.globalAlpha = ((i + 1) / (trail.length + 1)) * 0.35
            context.beginPath()
            context.arc(point.x, point.y, AVATAR_RADIUS * 0.9, 0, Math.PI * 2)
            context.fill()
        })
        context.restore()
    }

    private drawSplats(context: CanvasRenderingContext2D, time: number) {
        this.splats = this.splats.filter(splat => time - splat.at < SPLAT_MS || this.options.reducedMotion)

        for (const splat of this.splats) {
            context.save()
            context.textAlign = 'center'
            context.textBaseline = 'middle'

            if (this.options.reducedMotion) {
                context.font = '1.6px sans-serif'
                context.fillText('🥧', splat.x, splat.y)
            } else {
                const progress = (time - splat.at) / SPLAT_MS
                context.globalAlpha = 1 - progress
                context.fillStyle = '#fef3c7'
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2
                    const distance = 0.5 + progress * 3
                    context.beginPath()
                    context.arc(
                        splat.x + Math.cos(angle) * distance,
                        splat.y + Math.sin(angle) * distance,
                        0.5,
                        0,
                        Math.PI * 2
                    )
                    context.fill()
                }
                context.font = `${1.6 + progress * 1.5}px sans-serif`
                context.fillText('🥧', splat.x, splat.y)
            }

            context.restore()
        }
    }

    /** Blends the two snapshots around `renderAt`; before the first one, everyone stands on a spawn. */
    private stateAt(renderAt: number): Snapshot {
        const snapshots = this.snapshots
        const first = snapshots[0]

        if (!first) {
            return {
                receivedAt: renderAt,
                elapsedMs: 0,
                holderId: null,
                shake: 0,
                items: [],
                players: this.spawnOrder.map((id, i) => {
                    const spawn = this.arena?.spawns[i] ?? { x: 0, y: 0 }
                    return {
                        id,
                        x: spawn.x,
                        y: spawn.y,
                        frozenMs: 0,
                        out: false,
                        shieldMs: 0,
                        speedMs: 0,
                        slipMs: 0,
                        holdMs: 0,
                        safeMs: 0,
                    }
                }),
            }
        }

        let before = first
        let after = first
        for (const snapshot of snapshots) {
            if (snapshot.receivedAt <= renderAt) before = snapshot
            if (snapshot.receivedAt >= renderAt) {
                after = snapshot
                break
            }
            after = snapshot
        }

        const span = after.receivedAt - before.receivedAt
        const t = span > 0 ? Math.min(1, Math.max(0, (renderAt - before.receivedAt) / span)) : 1

        return {
            ...after,
            elapsedMs: before.elapsedMs + (after.elapsedMs - before.elapsedMs) * t,
            players: after.players.map(p => {
                const from = before.players.find(candidate => candidate.id === p.id) ?? p
                return { ...p, x: from.x + (p.x - from.x) * t, y: from.y + (p.y - from.y) * t }
            }),
        }
    }

    /**
     * Your own avatar skips the interpolation delay and eases toward the newest
     * snapshot instead, so your keys feel immediate.
     */
    private withOwnAvatar(players: SnapshotPlayer[], dt: number): SnapshotPlayer[] {
        const myId = this.options.myId()
        const latest = this.snapshots.at(-1)?.players.find(p => p.id === myId)
        if (myId === null || !latest) return players

        if (!this.own) this.own = { x: latest.x, y: latest.y }
        const ease = Math.min(1, dt * 25)
        this.own.x += (latest.x - this.own.x) * ease
        this.own.y += (latest.y - this.own.y) * ease
        const own = this.own

        return players.map(p => (p.id === myId ? { ...p, x: own.x, y: own.y } : p))
    }

    /** Sizes the canvas to its container at the arena's aspect ratio; returns CSS pixels per unit. */
    private fit(arena: Arena): number {
        const width = this.canvas.parentElement?.clientWidth ?? this.canvas.clientWidth
        const height = (width * arena.height) / arena.width
        const pixelWidth = Math.round(width * devicePixelRatio)
        const pixelHeight = Math.round(height * devicePixelRatio)

        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
            this.canvas.width = pixelWidth
            this.canvas.height = pixelHeight
            this.canvas.style.width = `${width}px`
            this.canvas.style.height = `${height}px`
        }

        return width / arena.width
    }
}

function rank(p: SnapshotPlayer, holderId: number | null): number {
    if (p.out) return 0
    return p.id === holderId ? 2 : 1
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
}

export function colourFor(id: number): string {
    return `hsl(${(id * 137.508) % 360} 70% 50%)`
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/)
    const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2)

    return letters.toUpperCase()
}
