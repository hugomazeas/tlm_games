import type { Obstacle } from '../sim/geometry.ts'
import type { Theme, ThemeId } from '../sim/themes.ts'

/**
 * Obstacles drawn as what they are: a desk with its monitor, a car from above, a rack
 * with blinking LEDs. Top-down vector drawings, in the arena's palette, each kept inside
 * its hitbox, so what you see is what you bump into. Collisions never look at this.
 *
 * A drawer gets a local frame: a rect's centre at the origin with its long side along x
 * (`long` × `short`), or a circle's centre with its radius. Drawers are keyed by the
 * obstacle's `look` (its theme's name for it), or `theme/look` where a theme draws a
 * shared name its own way.
 */

type Palette = Theme['palette']

interface RectFrame {
    kind: 'rect'
    long: number
    short: number
}

interface CircleFrame {
    kind: 'circle'
    r: number
}

interface Paint {
    context: CanvasRenderingContext2D
    palette: Palette
    time: number
    /** Stable per obstacle, for variety (a car's colour, which LED blinks). */
    seed: number
    reducedMotion: boolean
}

type Drawer = (paint: Paint, frame: RectFrame | CircleFrame) => void

const SHADOW = 'rgba(0, 0, 0, 0.32)'
const SHADOW_OFFSET = { x: 0.22, y: 0.3 }

const WOOD = '#8b5a2b'
const WOOD_LIGHT = '#a9713b'
const WOOD_DARK = '#5c3a1a'
const METAL = '#9ca3af'
const METAL_DARK = '#4b5563'
const SCREEN = '#0f172a'
const SCREEN_GLOW = '#38bdf8'
const LEAF = ['#15803d', '#16a34a', '#22c55e']
const CAR_COLOURS = ['#dc2626', '#2563eb', '#f8fafc', '#111827', '#ca8a04', '#0d9488', '#9333ea']
const BOOK_COLOURS = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#7c3aed', '#be185d', '#0f766e', '#f5f5f4']

// ── Helpers ──────────────────────────────────────────────────────────

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2))
    context.beginPath()
    context.moveTo(x + radius, y)
    context.arcTo(x + w, y, x + w, y + h, radius)
    context.arcTo(x + w, y + h, x, y + h, radius)
    context.arcTo(x, y + h, x, y, radius)
    context.arcTo(x, y, x + w, y, radius)
    context.closePath()
}

function box(paint: Paint, x: number, y: number, w: number, h: number, fill: string, r = 0.15, stroke?: string) {
    const { context } = paint
    roundRect(context, x, y, w, h, r)
    context.fillStyle = fill
    context.fill()
    if (stroke) {
        context.strokeStyle = stroke
        context.lineWidth = 0.08
        context.stroke()
    }
}

function disc(paint: Paint, x: number, y: number, r: number, fill: string, stroke?: string, width = 0.08) {
    const { context } = paint
    context.beginPath()
    context.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
    context.fillStyle = fill
    context.fill()
    if (stroke) {
        context.strokeStyle = stroke
        context.lineWidth = width
        context.stroke()
    }
}

function line(paint: Paint, x1: number, y1: number, x2: number, y2: number, colour: string, width = 0.08) {
    const { context } = paint
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.strokeStyle = colour
    context.lineWidth = width
    context.stroke()
}

/** A small deterministic pick from the obstacle's seed. */
function pick<T>(items: readonly T[], seed: number, salt = 0): T {
    const index = Math.abs(Math.floor(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453)) % items.length
    return items[index] as T
}

/** Splits a length into n equal slots; calls `each` with each slot's centre and size. */
function slots(length: number, size: number, each: (centre: number, slot: number, index: number) => void) {
    const count = Math.max(1, Math.floor(length / size))
    const slot = length / count
    for (let i = 0; i < count; i++) each(-length / 2 + slot * (i + 0.5), slot, i)
}

function rectOnly(draw: (paint: Paint, long: number, short: number) => void): Drawer {
    return (paint, frame) => {
        if (frame.kind === 'rect') draw(paint, frame.long, frame.short)
        else draw(paint, frame.r * 2, frame.r * 2)
    }
}

function circleOnly(draw: (paint: Paint, r: number) => void): Drawer {
    return (paint, frame) => draw(paint, frame.kind === 'circle' ? frame.r : Math.min(frame.long, frame.short) / 2)
}

// ── Open space ───────────────────────────────────────────────────────

const desk = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, paint.palette.obstacle, 0.2, paint.palette.obstacleEdge)
    // Monitor against the back edge, its screen glowing; keyboard and mug in front.
    const monitor = Math.min(L * 0.38, 2.4)
    box(paint, -monitor / 2, -S / 2 + 0.15, monitor, 0.32, SCREEN, 0.08)
    line(paint, -monitor / 2 + 0.12, -S / 2 + 0.31, monitor / 2 - 0.12, -S / 2 + 0.31, SCREEN_GLOW, 0.06)
    box(paint, -monitor * 0.4, -S / 2 + 0.7, monitor * 0.8, 0.32, '#e5e7eb', 0.06)
    disc(paint, L / 2 - 0.55, S / 2 - 0.55, 0.22, '#f8fafc', METAL_DARK, 0.05)
    box(paint, -L / 2 + 0.3, S / 2 - 0.85, 0.75, 0.55, '#fef3c7', 0.05)
})

const plant: Drawer = circleOnly((paint, r) => {
    disc(paint, 0, 0, r * 0.62, '#9a3412', '#7c2d12')
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + paint.seed
        const { context } = paint
        context.save()
        context.rotate(angle)
        context.beginPath()
        context.ellipse(r * 0.45, 0, r * 0.5, r * 0.2, 0, 0, Math.PI * 2)
        context.fillStyle = pick(LEAF, paint.seed, i)
        context.fill()
        context.restore()
    }
    disc(paint, 0, 0, r * 0.18, '#166534')
})

const officeChair: Drawer = circleOnly((paint, r) => {
    // A star base peeking out, the seat, the backrest.
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2
        line(paint, 0, 0, Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95, METAL_DARK, 0.12)
    }
    disc(paint, 0, 0, r * 0.7, '#1f2937', '#111827')
    paint.context.beginPath()
    paint.context.arc(0, 0, r * 0.82, Math.PI * 1.15, Math.PI * 1.85)
    paint.context.strokeStyle = '#374151'
    paint.context.lineWidth = r * 0.28
    paint.context.stroke()
})

const deskRow = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, paint.palette.obstacle, 0.12, paint.palette.obstacleEdge)
    slots(L, 2.4, (x, slot) => {
        line(paint, x + slot / 2, -S / 2, x + slot / 2, S / 2, paint.palette.obstacleEdge, 0.05)
        box(paint, x - 0.45, -0.12, 0.9, 0.24, SCREEN, 0.05)
        line(paint, x - 0.35, 0, x + 0.35, 0, SCREEN_GLOW, 0.05)
    })
})

// ── Ice rink ─────────────────────────────────────────────────────────

const snowbank: Drawer = circleOnly((paint, r) => {
    disc(paint, 0, 0, r * 0.95, '#e2e8f0')
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + paint.seed
        disc(paint, Math.cos(angle) * r * 0.45, Math.sin(angle) * r * 0.45, r * 0.45, '#f8fafc')
    }
    disc(paint, -r * 0.25, -r * 0.25, r * 0.3, '#ffffff')
    paint.context.strokeStyle = '#93c5fd'
    paint.context.lineWidth = 0.08
    paint.context.beginPath()
    paint.context.arc(0, 0, r * 0.95, 0.2, 1.6)
    paint.context.stroke()
})

const woodenBench = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, WOOD_DARK, 0.1)
    const slats = 3
    for (let i = 0; i < slats; i++) {
        const h = S / slats - 0.08
        box(paint, -L / 2 + 0.05, -S / 2 + 0.04 + i * (S / slats), L - 0.1, h, i % 2 ? WOOD : WOOD_LIGHT, 0.05)
    }
})

const zamboni = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#e2e8f0', 0.35, '#1e3a8a')
    // The blue body stripe, the driver up front, the conditioner at the back.
    box(paint, -L / 2 + 0.2, -S / 2 + 0.25, L - 0.4, 0.3, '#1d4ed8', 0.1)
    disc(paint, L * 0.18, 0.1, S * 0.18, '#1f2937')
    box(paint, -L / 2, -S / 2 + 0.2, 0.35, S - 0.4, '#475569', 0.08)
    box(paint, L / 2 - 0.35, -S / 2 + 0.3, 0.25, S - 0.6, '#facc15', 0.06)
})

const rinkBoards = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#f8fafc', 0.1, '#1e3a8a')
    box(paint, -L / 2 + 0.05, -0.1, L - 0.1, 0.2, '#1d4ed8', 0.05)
    line(paint, -L / 2 + 0.05, S / 2 - 0.1, L / 2 - 0.05, S / 2 - 0.1, '#facc15', 0.12)
})

// ── Parking lot ──────────────────────────────────────────────────────

const car = rectOnly((paint, L, S) => {
    const body = pick(CAR_COLOURS, paint.seed)
    box(paint, -L / 2, -S / 2, L, S, body, 0.55, '#0f172a')
    // Windshield ahead of the roof, rear window behind it; lights at both ends.
    box(paint, -L * 0.18, -S / 2 + 0.25, L * 0.42, S - 0.5, 'rgba(15,23,42,0.85)', 0.3)
    box(paint, -L * 0.12, -S / 2 + 0.35, L * 0.28, S - 0.7, body, 0.2)
    line(paint, -L * 0.12, -S / 2 + 0.35, -L * 0.12, S / 2 - 0.35, 'rgba(255,255,255,0.25)', 0.05)
    disc(paint, L / 2 - 0.25, -S / 2 + 0.35, 0.16, '#fde68a')
    disc(paint, L / 2 - 0.25, S / 2 - 0.35, 0.16, '#fde68a')
    box(paint, -L / 2 + 0.06, -S / 2 + 0.25, 0.14, 0.4, '#ef4444', 0.04)
    box(paint, -L / 2 + 0.06, S / 2 - 0.65, 0.14, 0.4, '#ef4444', 0.04)
})

const cone: Drawer = circleOnly((paint, r) => {
    box(paint, -r, -r, r * 2, r * 2, '#1f2937', 0.12)
    disc(paint, 0, 0, r * 0.85, '#f97316')
    disc(paint, 0, 0, r * 0.55, '#f8fafc')
    disc(paint, 0, 0, r * 0.35, '#f97316')
    disc(paint, 0, 0, r * 0.12, '#7c2d12')
})

const barrier = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#a1a1aa', 0.12, '#52525b')
    box(paint, -L / 2 + 0.1, -S / 2 + 0.12, L - 0.2, S - 0.24, '#d4d4d8', 0.08)
    // Hazard stripes along the top.
    const { context } = paint
    context.save()
    roundRect(context, -L / 2 + 0.1, -S / 2 + 0.12, L - 0.2, S - 0.24, 0.08)
    context.clip()
    for (let x = -L / 2; x < L / 2 + S; x += 0.9) {
        context.beginPath()
        context.moveTo(x, -S / 2)
        context.lineTo(x + 0.45, -S / 2)
        context.lineTo(x + 0.45 - S, S / 2)
        context.lineTo(x - S, S / 2)
        context.closePath()
        context.fillStyle = 'rgba(234, 179, 8, 0.75)'
        context.fill()
    }
    context.restore()
})

// ── Cafeteria ────────────────────────────────────────────────────────

const roundTable: Drawer = circleOnly((paint, r) => {
    disc(paint, 0, 0, r, paint.palette.obstacle, paint.palette.obstacleEdge, 0.12)
    // Trays with a plate and a cup, around the table.
    const trays = r > 2.1 ? 4 : 3
    for (let i = 0; i < trays; i++) {
        const angle = (i / trays) * Math.PI * 2 + paint.seed
        const { context } = paint
        context.save()
        context.rotate(angle)
        context.translate(r * 0.55, 0)
        box(paint, -0.42, -0.32, 0.84, 0.64, '#94a3b8', 0.08)
        disc(paint, -0.08, 0, 0.22, '#f8fafc')
        disc(paint, 0.24, -0.16, 0.09, '#dc2626')
        context.restore()
    }
    disc(paint, 0, 0, r * 0.14, '#78350f')
})

const foodCart: Drawer = circleOnly((paint, r) => {
    const s = r * 1.4
    box(paint, -s / 2, -s / 2, s, s, METAL, 0.12, METAL_DARK)
    for (let i = 0; i < 3; i++)
        box(paint, -s / 2 + 0.15, -s / 2 + 0.15 + i * (s / 3), s - 0.3, s / 3 - 0.25, '#e5e7eb', 0.05)
    disc(paint, -s * 0.15, -s * 0.28, 0.16, '#16a34a')
    disc(paint, s * 0.18, s * 0.05, 0.16, '#f59e0b')
    for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ] as const) {
        disc(paint, (x * s) / 2, (y * s) / 2, 0.14, '#111827')
    }
})

const counter = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, paint.palette.obstacle, 0.1, paint.palette.obstacleEdge)
    // Tiles, then trays of food along it.
    for (let x = -L / 2 + 0.7; x < L / 2; x += 0.7) line(paint, x, -S / 2, x, S / 2, 'rgba(120,53,15,0.25)', 0.04)
    slots(L, 1.8, (x, _, i) => {
        box(paint, x - 0.55, -S / 2 + 0.25, 1.1, S - 0.5, '#d6d3d1', 0.06)
        disc(paint, x - 0.2, 0, 0.18, pick(['#f59e0b', '#16a34a', '#dc2626', '#fde68a'], paint.seed, i))
        disc(paint, x + 0.25, 0, 0.14, pick(['#a16207', '#fca5a5', '#86efac'], paint.seed, i + 3))
    })
})

// ── Ping-pong hall ───────────────────────────────────────────────────

const pingPongTable = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#1d4ed8', 0.08, '#f8fafc')
    paint.context.strokeStyle = '#f8fafc'
    paint.context.lineWidth = 0.1
    paint.context.strokeRect(-L / 2 + 0.12, -S / 2 + 0.12, L - 0.24, S - 0.24)
    line(paint, -L / 2 + 0.12, 0, L / 2 - 0.12, 0, '#f8fafc', 0.05)
    // The net across the middle, posts at both ends.
    line(paint, 0, -S / 2 - 0.05, 0, S / 2 + 0.05, '#111827', 0.16)
    disc(paint, 0, -S / 2, 0.12, '#e5e7eb')
    disc(paint, 0, S / 2, 0.12, '#e5e7eb')
})

const table: Drawer = (paint, frame) => (frame.kind === 'circle' ? roundTable : pingPongTable)(paint, frame)

const hallBarrier = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#1e3a8a', 0.1, '#86efac')
    slots(L, 1.4, x => line(paint, x, -S / 2 + 0.1, x, S / 2 - 0.1, 'rgba(134,239,172,0.4)', 0.05))
})

// ── Boardroom ────────────────────────────────────────────────────────

const boardroomTable = rectOnly((paint, L, S) => {
    // Chairs tucked along both long sides, the polished table over them.
    slots(L - 1, 1.6, x => {
        box(paint, x - 0.45, -S / 2, 0.9, 0.6, '#1f2937', 0.15)
        box(paint, x - 0.45, S / 2 - 0.6, 0.9, 0.6, '#1f2937', 0.15)
    })
    box(paint, -L / 2, -S / 2 + 0.45, L, S - 0.9, paint.palette.obstacle, 0.6, paint.palette.obstacleEdge)
    line(paint, -L / 2 + 0.8, -S / 2 + 0.8, L / 2 - 0.8, -S / 2 + 0.8, 'rgba(255,255,255,0.12)', 0.08)
    slots(L - 1, 1.6, (x, _, i) => {
        if (i % 2 === 0) box(paint, x - 0.35, -S / 2 + 0.75, 0.7, 0.45, '#cbd5e1', 0.05)
        else box(paint, x - 0.3, S / 2 - 1.15, 0.6, 0.4, '#f8fafc', 0.03)
    })
    disc(paint, 0, 0, 0.35, '#0f172a', '#334155')
})

const sideTable = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, WOOD, 0.15, WOOD_DARK)
    disc(paint, L / 2 - S / 2, 0, S * 0.28, '#fef3c7', '#d97706')
    box(paint, -L / 2 + 0.3, -S / 4, L * 0.35, S / 2, '#e5e7eb', 0.04)
})

const credenza = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, WOOD_DARK, 0.1, '#3f2a14')
    slots(L, 1.2, (x, slot) => {
        line(paint, x + slot / 2, -S / 2 + 0.1, x + slot / 2, S / 2 - 0.1, '#3f2a14', 0.06)
        disc(paint, x + slot / 2 - 0.18, 0, 0.06, '#d4a373')
    })
})

// ── Server room ──────────────────────────────────────────────────────

const rack = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#334155', 0.08, paint.palette.obstacleEdge)
    slots(L, 0.9, (x, slot, i) => {
        line(paint, x + slot / 2, -S / 2, x + slot / 2, S / 2, '#1e293b', 0.06)
        // LEDs: most steady green, the odd one blinking amber or blue.
        for (let j = 0; j < 2; j++) {
            const blink =
                paint.reducedMotion || Math.floor(paint.time / (300 + ((i + j) % 4) * 170) + i * 7 + j) % 3 !== 0
            const colour =
                (i + j + Math.floor(paint.seed)) % 5 === 0 ? '#f59e0b' : (i * 3 + j) % 7 === 0 ? '#38bdf8' : '#22c55e'
            if (blink) disc(paint, x - 0.18 + j * 0.3, -S / 2 + 0.35, 0.07, colour)
        }
        line(paint, x - 0.25, S / 2 - 0.3, x + 0.25, S / 2 - 0.3, '#374151', 0.06)
    })
})

const coolingUnit = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#374151', 0.12, '#22d3ee')
    const r = Math.min(L, S) * 0.36
    disc(paint, 0, 0, r, '#1f2937', '#64748b')
    const spin = paint.reducedMotion ? 0 : paint.time / 120
    for (let i = 0; i < 4; i++) {
        const { context } = paint
        context.save()
        context.rotate(spin + (i * Math.PI) / 2)
        context.beginPath()
        context.ellipse(r * 0.45, 0, r * 0.45, r * 0.16, 0.4, 0, Math.PI * 2)
        context.fillStyle = '#94a3b8'
        context.fill()
        context.restore()
    }
    disc(paint, 0, 0, r * 0.15, '#cbd5e1')
})

const serverCart = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, METAL, 0.1, METAL_DARK)
    box(paint, -L / 2 + 0.25, -S / 2 + 0.2, L - 0.5, S - 0.4, '#111827', 0.05)
    disc(paint, -L / 2 + 0.55, 0, 0.06, '#22c55e')
    disc(paint, -L / 2 + 0.8, 0, 0.06, '#22c55e')
})

const rackRow = rectOnly((paint, L, S) => rack(paint, { kind: 'rect', long: L, short: S }))

// ── Library ──────────────────────────────────────────────────────────

const readingTable = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, WOOD, 0.15, WOOD_DARK)
    // Open books, and a green banker's lamp.
    for (const x of [-L * 0.25, L * 0.2]) {
        box(paint, x - 0.45, -0.3, 0.42, 0.6, '#f5f5f4', 0.04)
        box(paint, x + 0.03, -0.3, 0.42, 0.6, '#e7e5e4', 0.04)
        line(paint, x, -0.3, x, 0.3, '#a8a29e', 0.04)
    }
    disc(paint, L / 2 - 0.5, -S / 2 + 0.5, 0.28, '#15803d', '#fbbf24')
})

const armchair: Drawer = circleOnly((paint, r) => {
    box(paint, -r, -r, r * 2, r * 2, '#7f1d1d', r * 0.45, '#450a0a')
    box(paint, -r * 0.6, -r * 0.45, r * 1.2, r * 1.25, '#b91c1c', r * 0.25)
    box(paint, -r * 0.85, -r * 0.95, r * 1.7, r * 0.45, '#991b1b', r * 0.2)
})

const bookCart = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, WOOD_DARK, 0.1)
    slots(L - 0.2, 0.22, (x, slot, i) =>
        box(paint, x - slot / 2 + 0.02, -S / 2 + 0.15, slot - 0.04, S - 0.3, pick(BOOK_COLOURS, paint.seed, i), 0.02)
    )
})

const shelves = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#6b3f22', 0.06, '#c08457')
    // Two rows of spines, back to back.
    for (const [row, top] of [
        [0, -S / 2 + 0.1],
        [1, 0.05],
    ] as const) {
        slots(L - 0.2, 0.24, (x, slot, i) => {
            const h = S / 2 - 0.15 - pick([0, 0.08, 0.15], paint.seed, i + row * 50)
            box(paint, x - slot / 2 + 0.02, top, slot - 0.04, h, pick(BOOK_COLOURS, paint.seed, i + row * 31), 0.02)
        })
    }
})

// ── Gym ──────────────────────────────────────────────────────────────

const paddedBench = rectOnly((paint, L, S) => {
    box(paint, -L / 2 + 0.2, -S / 2, 0.3, S, METAL_DARK, 0.05)
    box(paint, L / 2 - 0.5, -S / 2, 0.3, S, METAL_DARK, 0.05)
    box(paint, -L / 2, -S / 2 + 0.1, L, S - 0.2, '#334155', 0.25, '#a3e635')
    line(paint, -L / 2 + 0.3, 0, L / 2 - 0.3, 0, '#27272a', 0.05)
})

const weightPlate: Drawer = circleOnly((paint, r) => {
    disc(paint, 0, 0, r, '#3f3f46', '#a3e635', 0.12)
    disc(paint, 0, 0, r * 0.7, '#52525b', '#71717a')
    disc(paint, 0, 0, r * 0.22, METAL, METAL_DARK)
    disc(paint, 0, 0, r * 0.1, '#0a0a0a')
})

const weightRack = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#27272a', 0.08, '#a3e635')
    slots(L - 0.2, 0.8, (x, _, i) => {
        line(paint, x - 0.3, 0, x + 0.3, 0, METAL, 0.08)
        const r = 0.12 + (i % 3) * 0.04
        disc(paint, x - 0.3, 0, r, '#18181b', METAL_DARK, 0.04)
        disc(paint, x + 0.3, 0, r, '#18181b', METAL_DARK, 0.04)
    })
})

const exerciseBall: Drawer = circleOnly((paint, r) => {
    disc(paint, 0, 0, r, pick(['#2563eb', '#db2777', '#16a34a', '#9333ea'], paint.seed), 'rgba(0,0,0,0.3)')
    paint.context.beginPath()
    paint.context.arc(0, 0, r * 0.65, -0.3, 2.2)
    paint.context.strokeStyle = 'rgba(255,255,255,0.18)'
    paint.context.lineWidth = 0.08
    paint.context.stroke()
    disc(paint, -r * 0.35, -r * 0.35, r * 0.22, 'rgba(255,255,255,0.45)')
})

const treadmillRow = rectOnly((paint, L, S) => {
    box(paint, -L / 2, -S / 2, L, S, '#52525b', 0.1, '#facc15')
    slots(L, 1.6, (x, slot) => {
        box(paint, x - slot / 2 + 0.15, -S / 2 + 0.15, slot - 0.3, S - 0.6, '#111827', 0.1, '#a1a1aa')
        // The belt's slats crawl along.
        const offset = paint.reducedMotion ? 0 : (paint.time / 400) % 0.3
        for (let y = -S / 2 + 0.25 + offset; y < S / 2 - 0.5; y += 0.3) {
            line(paint, x - slot / 2 + 0.25, y, x + slot / 2 - 0.25, y, '#3f3f46', 0.05)
        }
        box(paint, x - slot / 2 + 0.2, S / 2 - 0.4, slot - 0.4, 0.25, '#3f3f46', 0.05)
        disc(paint, x, S / 2 - 0.28, 0.06, '#ef4444')
    })
})

/** Every look a theme names, drawn; `theme/look` first where a theme draws a shared name its own way. */
export const OBSTACLE_DRAWERS: Record<string, Drawer> = {
    desk,
    plant,
    'office chair': officeChair,
    'desk row': deskRow,
    snowbank,
    bench: woodenBench,
    zamboni,
    'rink boards': rinkBoards,
    car,
    cone,
    barrier,
    'ping_pong_hall/barrier': hallBarrier,
    table,
    'food cart': foodCart,
    counter,
    'boardroom table': boardroomTable,
    'side table': sideTable,
    'rolling chair': officeChair,
    credenza,
    rack,
    'cooling unit': coolingUnit,
    'server cart': serverCart,
    'rack row': rackRow,
    'reading table': readingTable,
    armchair,
    'book cart': bookCart,
    shelves,
    'gym/bench': paddedBench,
    'weight plate': weightPlate,
    'weight rack': weightRack,
    'exercise ball': exerciseBall,
    'treadmill row': treadmillRow,
}

export function drawerFor(theme: ThemeId, look: string | undefined): Drawer | null {
    if (!look) return null
    return OBSTACLE_DRAWERS[`${theme}/${look}`] ?? OBSTACLE_DRAWERS[look] ?? null
}

/**
 * Its shadow, then the obstacle as what it is. False when there's no drawing for it.
 * `resting`: where it was placed (a mover's sweep centre), for a seed that never flickers.
 */
export function drawObstacle(
    context: CanvasRenderingContext2D,
    obstacle: Obstacle,
    resting: Obstacle,
    theme: Theme,
    time: number,
    reducedMotion: boolean
): boolean {
    const drawer = drawerFor(theme.id, obstacle.look)
    if (!drawer) return false

    const frame: RectFrame | CircleFrame =
        obstacle.kind === 'circle'
            ? { kind: 'circle', r: obstacle.r }
            : { kind: 'rect', long: Math.max(obstacle.w, obstacle.h), short: Math.min(obstacle.w, obstacle.h) }

    const seed = Math.round(resting.x * 7 + resting.y * 13)
    context.save()
    context.translate(obstacle.x, obstacle.y)

    context.fillStyle = SHADOW
    if (frame.kind === 'circle') {
        context.beginPath()
        context.arc(SHADOW_OFFSET.x, SHADOW_OFFSET.y, frame.r, 0, Math.PI * 2)
        context.fill()
    } else {
        const w = obstacle.kind === 'rect' ? obstacle.w : 0
        const h = obstacle.kind === 'rect' ? obstacle.h : 0
        roundRect(context, -w / 2 + SHADOW_OFFSET.x, -h / 2 + SHADOW_OFFSET.y, w, h, 0.2)
        context.fill()
    }

    if (obstacle.kind === 'rect' && obstacle.h > obstacle.w) context.rotate(Math.PI / 2)
    drawer({ context, palette: theme.palette, time, seed, reducedMotion }, frame)
    context.restore()

    return true
}
