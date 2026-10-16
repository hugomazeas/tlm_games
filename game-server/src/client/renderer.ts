import { cosmeticValue, type Look } from '../cosmetics.ts'
import type { SnapshotItem, SnapshotPlayer, SnapshotPortal } from '../protocol.ts'
import { type Arena, AVATAR_RADIUS, PAD_RADIUS } from '../sim/arena.ts'
import { FREEZE_MS, type GameMode, INFECTION_BLAST_RADIUS, PORTAL_RADIUS, STEAL_SAFETY_MS } from '../sim/game.ts'
import { obstacleAt } from '../sim/geometry.ts'
import { FREEZE_RADIUS, ITEM_RADIUS, type ItemKind, MAGNET_RADIUS, SHIELD_MS, TINY_RADIUS } from '../sim/items.ts'
import { THEMES } from '../sim/themes.ts'

/**
 * Moving furniture is carried forward from the newest snapshot by at most one
 * server tick, so it glides between snapshots instead of stepping.
 */
const SNAPSHOT_GAP_MS = 50
const SPLAT_MS = 1200
/** Items blink for their last few seconds before they vanish. */
const ITEM_BLINK_MS = 3000
const TRAIL_LENGTH = 5
/** Distance between two trail ghosts, in arena units. */
const TRAIL_SPACING = 0.6

/** An emote floats up from its player for this long. */
const EMOTE_MS = 1800
/** A freeze bomb or swap flashes a ring for this long. */
const BURST_MS = 600
const PAD_COLOUR = '#22d3ee'
const PORTAL_COLOUR = '#c084fc'
/** A portal pair blinks for its last few seconds before it closes. */
const PORTAL_BLINK_MS = 3000
const INFECTED_COLOUR = '#84cc16'
/** Full screen: room kept under the arena for the controls hint. */
const FULLSCREEN_MARGIN_PX = 40

export const ITEM_ICONS: Record<ItemKind, string> = {
    shield: '🛡️',
    speed: '⚡',
    banana: '🍌',
    ghost: '👻',
    swap: '🔀',
    reverse: '🙃',
    freeze: '🧊',
    magnet: '🧲',
    tiny: '🤏',
    mystery: '❓',
}
const ITEM_GLOW: Record<ItemKind, string> = {
    shield: '#38bdf8',
    speed: '#facc15',
    banana: '#fde047',
    ghost: '#e2e8f0',
    swap: '#a78bfa',
    reverse: '#fb7185',
    freeze: '#67e8f9',
    magnet: '#f87171',
    tiny: '#4ade80',
    mystery: '#c084fc',
}

interface Snapshot {
    receivedAt: number
    elapsedMs: number
    players: SnapshotPlayer[]
    items: SnapshotItem[]
    portals: SnapshotPortal[]
    holderId: number | null
    shake: number
}

interface Splat {
    x: number
    y: number
    at: number
    /** The player's boom: 🥧 unless they picked another. */
    emoji: string
}

interface FloatingEmote {
    playerId: number
    emote: string
    at: number
}

interface Burst {
    x: number
    y: number
    radius: number
    colour: string
    at: number
}

export interface RendererOptions {
    reducedMotion: boolean
    mode: () => GameMode
    myId: () => number | null
    nameOf: (id: number) => string
    avatarOf: (id: number) => string | null
    /** Their colour, skin, hat, trail and boom; undefined draws the defaults. */
    lookOf: (id: number) => Look | undefined
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
    private emotes: FloatingEmote[] = []
    private bursts: Burst[] = []
    /** Recent positions of boosted players, for the speed trail. */
    private trails = new Map<number, Array<{ x: number; y: number }>>()
    /** Where each avatar is drawn, easing toward its newest position. */
    private drawn = new Map<number, { x: number; y: number }>()
    /** Profile photos by URL, loaded once and reused every frame. */
    private photos = new Map<string, HTMLImageElement>()
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
        this.emotes = []
        this.bursts = []
        this.trails.clear()
        this.drawn.clear()
        this.start()
    }

    clear() {
        this.arena = null
        this.snapshots = []
        this.splats = []
        this.emotes = []
        this.bursts = []
        this.stop()
        const context = this.canvas.getContext('2d')
        context?.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }

    /** A replay jumped: forget the motion so far and stand everyone where `snapshot` has them. */
    jumpTo(snapshot: Omit<Snapshot, 'receivedAt'> | null) {
        this.snapshots = []
        this.splats = []
        this.emotes = []
        this.bursts = []
        this.trails.clear()
        this.drawn.clear()
        if (snapshot) this.pushSnapshot(snapshot)
    }

    pushSnapshot(snapshot: Omit<Snapshot, 'receivedAt'>) {
        this.snapshots.push({ ...snapshot, receivedAt: performance.now() })
        if (this.snapshots.length > 20) this.snapshots.shift()
    }

    /** Remembers where someone blew up, for the pie splat. */
    boom(playerId: number) {
        const latest = this.snapshots.at(-1)
        const p = latest?.players.find(candidate => candidate.id === playerId)
        if (!p) return
        const emoji = cosmeticValue('boom', this.options.lookOf(playerId)?.boom) ?? '🥧'
        this.splats.push({ x: p.x, y: p.y, at: performance.now(), emoji })
    }

    /** An end-of-game reaction, floating up from its player. */
    emote(playerId: number, emote: string) {
        this.emotes.push({ playerId, emote, at: performance.now() })
        if (this.emotes.length > 40) this.emotes.shift()
    }

    /** Infection: a catch goes off as a shockwave the size of the blast that throws everyone clear. */
    infectionBlast(playerId: number) {
        const p = this.snapshots.at(-1)?.players.find(candidate => candidate.id === playerId)
        if (!p) return

        const at = performance.now()
        this.bursts.push({ x: p.x, y: p.y, radius: INFECTION_BLAST_RADIUS, colour: INFECTED_COLOUR, at })
        this.bursts.push({ x: p.x, y: p.y, radius: INFECTION_BLAST_RADIUS * 0.5, colour: '#d9f99d', at })
    }

    /** Someone went through a portal: both ends flash. */
    portalFlash(portalId: number) {
        const portal = this.snapshots.at(-1)?.portals.find(candidate => candidate.id === portalId)
        if (!portal) return

        const at = performance.now()
        for (const [x, y] of [
            [portal.ax, portal.ay],
            [portal.bx, portal.by],
        ] as const) {
            this.bursts.push({ x, y, radius: 2.2, colour: PORTAL_COLOUR, at })
        }
    }

    /** A freeze bomb going off around a player, or a swap landing. */
    burst(playerId: number, kind: 'freeze' | 'swap') {
        const p = this.snapshots.at(-1)?.players.find(candidate => candidate.id === playerId)
        if (!p) return

        const radius = kind === 'freeze' ? FREEZE_RADIUS : 2.5
        this.bursts.push({ x: p.x, y: p.y, radius, colour: ITEM_GLOW[kind], at: performance.now() })
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
        const state = this.stateAt(time)
        const players = this.eased(state.players, dt)

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

        this.drawMoverTracks(context, arena, theme.palette.floorLine)
        this.drawPads(context, arena, time)
        this.drawObstacles(context, arena, state.elapsedMs, theme.palette.obstacle, theme.palette.obstacleEdge)
        this.drawSplats(context, time)
        this.drawPortals(context, state.portals, time)
        this.drawItems(context, state.items, time)

        // Ghosts underneath, the living on top, the holder last.
        const ordered = [...players].sort((a, b) => rank(a, state.holderId) - rank(b, state.holderId))
        for (const p of ordered) this.drawPlayer(context, p, state, time)

        this.drawBursts(context, time)
        this.drawEmotes(context, players, time)
    }

    /**
     * Edges first, fills on top: a wall's blocks touch, and drawing it this way
     * hides the seams between them so an L reads as one piece.
     */
    private drawObstacles(
        context: CanvasRenderingContext2D,
        arena: Arena,
        elapsedMs: number,
        fill: string,
        edge: string
    ) {
        const shapes = arena.obstacles.map(obstacle => obstacleAt(obstacle, elapsedMs))
        const trace = (o: (typeof shapes)[number]) => {
            context.beginPath()
            if (o.kind === 'circle') context.arc(o.x, o.y, o.r, 0, Math.PI * 2)
            // Square, like the furniture's hitbox: a rounded corner drawn here would bump you before it seems to.
            else context.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h)
        }

        context.strokeStyle = edge
        context.lineWidth = 0.3
        for (const o of shapes) {
            trace(o)
            context.stroke()
        }
        context.fillStyle = fill
        for (const o of shapes) {
            trace(o)
            context.fill()
        }
    }

    /** A faint dashed rail under each mover, so you can see where it's heading. */
    private drawMoverTracks(context: CanvasRenderingContext2D, arena: Arena, colour: string) {
        context.save()
        context.strokeStyle = colour
        context.globalAlpha = 0.6
        context.lineWidth = 0.12
        context.setLineDash([0.4, 0.4])
        for (const o of arena.obstacles) {
            if (!o.mover) continue
            const { axis, amplitude } = o.mover
            if (axis === 'x') line(context, o.x - amplitude, o.y, o.x + amplitude, o.y)
            else line(context, o.x, o.y - amplitude, o.x, o.y + amplitude)
        }
        context.restore()
    }

    /** Boost pads: a glowing disc with chevrons rolling toward where it fires you. */
    private drawPads(context: CanvasRenderingContext2D, arena: Arena, time: number) {
        for (const pad of arena.pads) {
            context.save()
            context.translate(pad.x, pad.y)
            context.rotate(Math.atan2(pad.dy, pad.dx))
            context.shadowColor = PAD_COLOUR
            context.shadowBlur = 10 * devicePixelRatio
            context.fillStyle = 'rgba(8,47,73,0.85)'
            context.strokeStyle = PAD_COLOUR
            context.lineWidth = 0.12
            context.beginPath()
            context.arc(0, 0, PAD_RADIUS + 0.2, 0, Math.PI * 2)
            context.fill()
            context.stroke()
            context.shadowBlur = 0

            const roll = this.options.reducedMotion ? 0 : (time / 400) % 1
            context.lineWidth = 0.18
            context.lineCap = 'round'
            for (let i = 0; i < 3; i++) {
                const x = -0.6 + ((i + roll) % 3) * 0.45
                context.globalAlpha = 0.35 + 0.65 * (((i + roll) % 3) / 3)
                context.beginPath()
                context.moveTo(x - 0.25, -0.45)
                context.lineTo(x + 0.15, 0)
                context.lineTo(x - 0.25, 0.45)
                context.stroke()
            }
            context.restore()
        }
    }

    private drawBursts(context: CanvasRenderingContext2D, time: number) {
        this.bursts = this.bursts.filter(burst => time - burst.at < BURST_MS)

        for (const burst of this.bursts) {
            const progress = this.options.reducedMotion ? 1 : (time - burst.at) / BURST_MS
            context.save()
            context.globalAlpha = 1 - progress * 0.8
            context.strokeStyle = burst.colour
            context.lineWidth = 0.25
            context.beginPath()
            context.arc(burst.x, burst.y, burst.radius * Math.min(1, 0.3 + progress), 0, Math.PI * 2)
            context.stroke()
            context.restore()
        }
    }

    /** Emotes rise from their player and fade; a burst of them stacks side by side. */
    private drawEmotes(context: CanvasRenderingContext2D, players: SnapshotPlayer[], time: number) {
        this.emotes = this.emotes.filter(emote => time - emote.at < EMOTE_MS)

        context.save()
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        for (const emote of this.emotes) {
            const p = players.find(candidate => candidate.id === emote.playerId)
            if (!p) continue

            const progress = (time - emote.at) / EMOTE_MS
            const rise = this.options.reducedMotion ? 1.5 : 1 + progress * 3
            const sway = this.options.reducedMotion ? 0 : Math.sin(progress * Math.PI * 3 + emote.at) * 0.4
            context.globalAlpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
            context.font = `${1.6 + (progress < 0.15 ? progress * 4 : 0.6)}px sans-serif`
            context.fillText(emote.emote, p.x + sway, p.y - AVATAR_RADIUS - rise)
        }
        context.restore()
    }

    /** The photo once it has loaded; null while loading or if it failed, so initials show meanwhile. */
    private photo(url: string): HTMLImageElement | null {
        let image = this.photos.get(url)
        if (!image) {
            image = new Image()
            image.decoding = 'async'
            image.src = url
            this.photos.set(url, image)
        }

        return image.complete && image.naturalWidth > 0 ? image : null
    }

    private drawPlayer(context: CanvasRenderingContext2D, p: SnapshotPlayer, state: Snapshot, time: number) {
        const active = !p.out
        const r = active && p.tinyMs > 0 ? TINY_RADIUS : AVATAR_RADIUS
        const isMe = p.id === this.options.myId()
        const isHolder = p.id === state.holderId
        const name = this.options.nameOf(p.id)
        const look = this.options.lookOf(p.id)
        const hat = active ? cosmeticValue('hat', look?.hat) : null
        const skin = cosmeticValue('skin', look?.skin) ?? '🥔'
        const golden = look?.skin === 'gold'

        // Before the first snapshot (the countdown), your own avatar pulses so you can find yourself.
        if (isMe && this.snapshots.length === 0) {
            const pulse = this.options.reducedMotion ? 0.5 : (time / 900) % 1
            context.save()
            context.strokeStyle = '#ffffff'
            context.globalAlpha = 1 - pulse
            context.lineWidth = 0.2
            context.beginPath()
            context.arc(p.x, p.y, r + 0.4 + pulse * 2.2, 0, Math.PI * 2)
            context.stroke()
            context.globalAlpha = 1
            context.font = `800 ${0.75}px Outfit, sans-serif`
            context.textAlign = 'center'
            context.fillStyle = '#ffffff'
            context.fillText('YOU', p.x, p.y + r + 1.1)
            context.restore()
        }

        // A magnet's reach, faint and breathing.
        if (active && p.magnetMs > 0) {
            const breathe = this.options.reducedMotion ? 0 : Math.sin(time / 180) * 0.3
            context.save()
            context.strokeStyle = ITEM_GLOW.magnet
            context.globalAlpha = 0.35
            context.lineWidth = 0.12
            context.setLineDash([0.5, 0.5])
            context.beginPath()
            context.arc(p.x, p.y, MAGNET_RADIUS + breathe, 0, Math.PI * 2)
            context.stroke()
            context.restore()
        }

        context.save()
        if (p.out) context.globalAlpha = 0.25
        else if (p.ghostMs > 0) context.globalAlpha = 0.45

        if (active && (p.speedMs > 0 || p.launchMs > 0)) this.drawTrail(context, p, r, look)
        else this.trails.delete(p.id)

        const king = this.options.mode() === 'king'
        if (isHolder) {
            const pulse = this.options.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time / (120 - 80 * state.shake))
            // A king glows gold and steady; a survival potato burns hotter as the fuse runs down.
            context.shadowColor = king ? '#facc15' : state.shake > 0.5 ? '#ef4444' : '#f97316'
            context.shadowBlur = (10 + 20 * pulse) * devicePixelRatio
        }

        if (active && p.infected) {
            context.shadowColor = INFECTED_COLOUR
            context.shadowBlur = 16 * devicePixelRatio
        }
        context.fillStyle = playerColour(p.id, look)
        context.beginPath()
        context.arc(p.x, p.y, r, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
        // Infection: a thick pulsing aura, so the clean see from across the arena whom to run from.
        if (active && p.infected) {
            const pulse = this.options.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 160)
            context.save()
            context.strokeStyle = INFECTED_COLOUR
            context.globalAlpha = 0.5 + 0.5 * pulse
            context.lineWidth = 0.3 + 0.2 * pulse
            context.beginPath()
            context.arc(p.x, p.y, r + 0.35 + 0.25 * pulse, 0, Math.PI * 2)
            context.stroke()
            context.restore()
        }

        if (isMe) {
            context.strokeStyle = '#ffffff'
            context.lineWidth = 0.18
            context.stroke()
        }

        const avatarUrl = this.options.avatarOf(p.id)
        const photo = avatarUrl ? this.photo(avatarUrl) : null
        const spinning = active && p.slipMs > 0 && !this.options.reducedMotion

        context.fillStyle = '#ffffff'
        context.font = `700 ${0.8 * (r / AVATAR_RADIUS)}px Outfit, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        if (photo) {
            // The photo sits inside the player's colour, which stays as a ring.
            const inner = r * 0.84
            context.save()
            context.translate(p.x, p.y)
            if (spinning) context.rotate(time / 70)
            context.beginPath()
            context.arc(0, 0, inner, 0, Math.PI * 2)
            context.clip()
            context.drawImage(photo, -inner, -inner, inner * 2, inner * 2)
            context.restore()
        } else if (spinning) {
            // Spinning out on a banana: the initials go round.
            context.save()
            context.translate(p.x, p.y + 0.05)
            context.rotate(time / 70)
            context.fillText(initials(name), 0, 0)
            context.restore()
        } else {
            context.fillText(initials(name), p.x, p.y + 0.05)
        }

        // Infected: a toxic green wash over the face, and two germs circling it.
        if (active && p.infected) {
            context.save()
            context.globalAlpha = 0.55
            context.fillStyle = INFECTED_COLOUR
            context.beginPath()
            context.arc(p.x, p.y, r, 0, Math.PI * 2)
            context.fill()
            context.globalAlpha = 1
            context.font = `${0.75}px sans-serif`
            const orbit = this.options.reducedMotion ? Math.PI / 4 : time / 400
            for (const offset of [0, Math.PI]) {
                const angle = orbit + offset
                context.fillText('🦠', p.x + Math.cos(angle) * (r + 0.7), p.y + Math.sin(angle) * (r + 0.7))
            }
            context.restore()
        }

        if (hat) {
            context.font = `${0.9 * (r / AVATAR_RADIUS)}px sans-serif`
            context.fillText(hat, p.x, p.y - r * 0.95)
        }

        context.font = `600 ${0.65}px Outfit, sans-serif`
        context.fillStyle = 'rgba(255,255,255,0.85)'
        context.fillText(name, p.x, p.y - r - (hat ? 1.1 : 0.6))

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
        const badges = [
            p.shieldMs > 0 && ITEM_ICONS.shield,
            p.speedMs > 0 && ITEM_ICONS.speed,
            p.slipMs > 0 && ITEM_ICONS.banana,
            p.ghostMs > 0 && ITEM_ICONS.ghost,
            p.reverseMs > 0 && ITEM_ICONS.reverse,
            p.magnetMs > 0 && ITEM_ICONS.magnet,
            p.tinyMs > 0 && ITEM_ICONS.tiny,
        ].filter((badge): badge is string => active && typeof badge === 'string')
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

        // A hat pushes the name up, and the potato above it.
        const lift = hat ? 0.5 : 0
        if (isHolder && king) {
            const bob = (this.options.reducedMotion ? 0 : Math.sin(time / 200) * 0.15) - lift
            context.font = `${1.2}px sans-serif`
            this.drawSkin(context, skin, golden, p.x, p.y - r - 1.4 + bob)
            context.font = `${1}px sans-serif`
            context.fillText('👑', p.x, p.y - r - 2.6 + bob)
        } else if (isHolder) {
            const jitter = this.options.reducedMotion ? 0 : state.shake * 0.35
            const jx = (Math.random() - 0.5) * jitter
            const jy = (Math.random() - 0.5) * jitter
            const bob = (this.options.reducedMotion ? 0 : Math.sin(time / 200) * 0.15) - lift
            context.font = `${1.3 + state.shake * 0.4}px sans-serif`
            this.drawSkin(context, skin, golden, p.x + jx, p.y - r - 1.6 + bob + jy)
        }

        context.restore()
    }

    /** Each open pair: two rings in one colour, spinning, blinking before they close. */
    private drawPortals(context: CanvasRenderingContext2D, portals: SnapshotPortal[], time: number) {
        for (const portal of portals) {
            const closing = portal.expiresInMs < PORTAL_BLINK_MS
            if (closing && !this.options.reducedMotion && Math.floor(time / 150) % 2 === 0) continue

            const spin = this.options.reducedMotion ? 0 : time / 300
            for (const [x, y, turn] of [
                [portal.ax, portal.ay, spin],
                [portal.bx, portal.by, -spin],
            ] as const) {
                context.save()
                context.shadowColor = PORTAL_COLOUR
                context.shadowBlur = 14 * devicePixelRatio
                context.fillStyle = 'rgba(88, 28, 135, 0.55)'
                context.beginPath()
                context.arc(x, y, PORTAL_RADIUS, 0, Math.PI * 2)
                context.fill()
                context.strokeStyle = PORTAL_COLOUR
                context.lineWidth = 0.18
                for (let arm = 0; arm < 3; arm++) {
                    const start = turn + (arm * Math.PI * 2) / 3
                    context.beginPath()
                    context.arc(x, y, PORTAL_RADIUS * 0.75, start, start + Math.PI / 2)
                    context.stroke()
                }
                context.restore()
            }
        }
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

    /** The potato as its holder dresses it; the golden one glows. */
    private drawSkin(context: CanvasRenderingContext2D, skin: string, golden: boolean, x: number, y: number) {
        if (golden) {
            context.save()
            context.shadowColor = '#facc15'
            context.shadowBlur = 14 * devicePixelRatio
            context.fillText(skin, x, y)
            context.restore()
        } else {
            context.fillText(skin, x, y)
        }
    }

    /**
     * Where a boosted avatar has just been, spaced out so it shows behind it: fading
     * copies of it, or the emoji trail its player picked.
     */
    private drawTrail(context: CanvasRenderingContext2D, p: SnapshotPlayer, radius: number, look: Look | undefined) {
        const trail = this.trails.get(p.id) ?? []
        const newest = trail.at(-1)
        if (!newest || Math.hypot(p.x - newest.x, p.y - newest.y) >= TRAIL_SPACING) {
            trail.push({ x: p.x, y: p.y })
            if (trail.length > TRAIL_LENGTH) trail.shift()
        }
        this.trails.set(p.id, trail)
        if (this.options.reducedMotion) return

        const emoji = cosmeticValue('trail', look?.trail)
        context.save()
        context.fillStyle = playerColour(p.id, look)
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = `${radius * 1.2}px sans-serif`
        trail.forEach((point, i) => {
            if (emoji) {
                context.globalAlpha = ((i + 1) / (trail.length + 1)) * 0.8
                context.fillText(emoji, point.x, point.y)
                return
            }
            context.globalAlpha = ((i + 1) / (trail.length + 1)) * 0.35
            context.beginPath()
            context.arc(point.x, point.y, radius * 0.9, 0, Math.PI * 2)
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
                context.fillText(splat.emoji, splat.x, splat.y)
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
                context.fillText(splat.emoji, splat.x, splat.y)
            }

            context.restore()
        }
    }

    /** The newest snapshot as of `renderAt`; before the first one, everyone stands on a spawn. */
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
                portals: [],
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
                        ghostMs: 0,
                        reverseMs: 0,
                        magnetMs: 0,
                        tinyMs: 0,
                        launchMs: 0,
                        holdMs: 0,
                        safeMs: 0,
                        infected: false,
                    }
                }),
            }
        }

        // Everyone, you included, is drawn on the newest snapshot: a remote avatar
        // drawn in the past looks out of reach at the very moment it tags you.
        const latest = snapshots.at(-1) ?? first

        return {
            ...latest,
            elapsedMs: latest.elapsedMs + Math.min(SNAPSHOT_GAP_MS, Math.max(0, renderAt - latest.receivedAt)),
        }
    }

    /** Every avatar eases toward its newest position, so 20 snapshots a second still move smoothly. */
    private eased(players: SnapshotPlayer[], dt: number): SnapshotPlayer[] {
        if (this.snapshots.length === 0) return players

        const ease = Math.min(1, dt * 25)

        return players.map(p => {
            const drawn = this.drawn.get(p.id)
            if (!drawn) {
                this.drawn.set(p.id, { x: p.x, y: p.y })
                return p
            }

            drawn.x += (p.x - drawn.x) * ease
            drawn.y += (p.y - drawn.y) * ease

            return { ...p, x: drawn.x, y: drawn.y }
        })
    }

    /**
     * Sizes the canvas to its container at the arena's aspect ratio; returns CSS pixels per unit.
     * Full screen, it also fits the height left below the canvas's top, so nothing scrolls.
     */
    private fit(arena: Arena): number {
        const parent = this.canvas.parentElement
        let width = parent?.clientWidth ?? this.canvas.clientWidth
        if (document.fullscreenElement && parent) {
            const room = window.innerHeight - parent.getBoundingClientRect().top - FULLSCREEN_MARGIN_PX
            width = Math.min(width, Math.max(0, (room * arena.width) / arena.height))
        }
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

/** The colour a player picked, or the one their id gives them. */
export function playerColour(id: number, look: Look | undefined): string {
    return cosmeticValue('colour', look?.colour) ?? colourFor(id)
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/)
    const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2)

    return letters.toUpperCase()
}
