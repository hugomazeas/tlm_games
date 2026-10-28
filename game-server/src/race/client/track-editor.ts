import { courseProblems } from '../drive/checks.ts'
import { courseFile, gateAcrossRoad, insertionIndex, reversed } from '../drive/editing.ts'
import { courseRoute, orientAlongRoute, type Route } from '../drive/route.ts'
import { buildWorld } from '../drive/world.ts'
import { projectionAt } from '../map/convert.ts'
import { type GateSpec, projectCourse } from '../map/courses.ts'
import type { Course, Gate, RaceMap, RoadKind } from '../map/format.ts'

/**
 * The Hub's track editor: the city from above, to pan and zoom like an
 * online map, and a sidebar. Click a street to add a checkpoint; click on
 * the orange route to put one between two; drag one to move it; right-click
 * (or ✕ in the list) to remove it. Every track is a circuit: the route runs
 * from each checkpoint to the next and from the last back to the start.
 * Checkpoints have no direction: crossing one either way counts, and the
 * route decides the way round. The sidebar checks the track can be raced
 * before it can be saved.
 */

/** What the Hub's editor page tells the editor. */
interface EditorConfig {
    mapUrl: string
    track: { name: string; laps: number; gates: GateSpec[] } | null
    /** Where Save sends the track, and how. */
    saveUrl: string
    method: 'POST' | 'PUT'
    csrf: string
    backUrl: string
}

const MAX_LAPS = 10
const DEFAULT_LAPS = 3
/** Where a new track's view opens: the Parliament. */
const START_VIEW = { lat: 46.80868, lon: -71.2142 }
/** Pixels per metre: the zoom range, and where a new track starts. */
const ZOOM = { min: 0.15, max: 6, start: 1 }
/**
 * Street names: which kinds of road get one from which zoom (pixels a metre),
 * in what lettering. Big streets show from far out; smaller ones as you zoom in.
 */
const LABELS: Partial<Record<RoadKind, { from: number; font: string; size: number; colour: string }>> = {
    major: { from: 0.15, font: '700 13px system-ui, sans-serif', size: 13, colour: '#1f2937' },
    street: { from: 0.45, font: '600 12px system-ui, sans-serif', size: 12, colour: '#374151' },
    service: { from: 1.5, font: 'italic 500 11px system-ui, sans-serif', size: 11, colour: '#4b5563' },
}
const RANK: Record<RoadKind, number> = { major: 0, street: 1, service: 2, path: 3, sidewalk: 4 }
/** A name needs this many spare pixels along its street, and the same name isn't repeated within this many. */
const LABEL_ROOM = 16
const LABEL_REPEAT = 320
/** A name lies along a run of segments that turns no more than this (radians, ~17°). */
const LABEL_BEND = 0.3
/** A click within this many pixels of a checkpoint picks it; of the route, inserts there. */
const PICK_RADIUS = 14
/** A press that moves further than this is a drag, not a click. */
const DRAG_THRESHOLD = 4
const COLOURS = {
    ground: '#e8e3d6',
    park: '#b9d9a3',
    water: '#8fc3e3',
    road: '#ffffff',
    roadEdge: '#cfc8b8',
    building: '#c4b9a7',
    route: '#ff9d1c',
    gate: '#1fb8d6',
    start: '#16a34a',
    hover: '#ffd22e',
}

const CSS = `
    .track-editor { display: flex; height: 100%; min-height: 480px; border-radius: 12px; overflow: hidden; border: 1px solid rgb(255 255 255 / 0.1); }
    .track-editor .map { flex: 1; position: relative; background: ${COLOURS.ground}; }
    .track-editor canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; }
    .track-editor canvas.over-gate { cursor: grab; }
    .track-editor canvas.panning, .track-editor canvas.dragging { cursor: grabbing; }
    .track-editor .loading { position: absolute; inset: 0; display: grid; place-items: center; color: #334155; font-weight: 600; }
    .track-editor .side { width: 320px; display: flex; flex-direction: column; gap: 14px; padding: 16px; background: rgb(255 255 255 / 0.05); overflow-y: auto; }
    .track-editor label { display: grid; gap: 4px; font-size: 13px; color: rgb(255 255 255 / 0.7); }
    .track-editor input, .track-editor select { font: inherit; font-size: 15px; padding: 6px 8px; border-radius: 8px; border: 1px solid rgb(255 255 255 / 0.15); background: rgb(0 0 0 / 0.25); color: #fff; }
    .track-editor .stats { display: flex; gap: 16px; font-size: 13px; color: rgb(255 255 255 / 0.7); }
    .track-editor .stats b { display: block; font-size: 18px; color: #fff; }
    .track-editor ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .track-editor li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgb(255 255 255 / 0.05); font-size: 14px; }
    .track-editor li.hover { background: rgb(255 210 46 / 0.2); }
    .track-editor li .dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; background: ${COLOURS.gate}; flex: none; }
    .track-editor li .dot.start { background: ${COLOURS.start}; }
    .track-editor li span.name { flex: 1; }
    .track-editor li button { border: 0; background: none; color: rgb(255 255 255 / 0.5); cursor: pointer; font-size: 16px; }
    .track-editor li button:hover { color: #f87171; }
    .track-editor .help { font-size: 13px; line-height: 1.5; color: rgb(255 255 255 / 0.65); }
    .track-editor .problems { font-size: 13px; color: #fca5a5; display: grid; gap: 4px; }
    .track-editor .ok { font-size: 13px; color: #86efac; }
    .track-editor .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }
    .track-editor .reverse { font: inherit; font-size: 14px; padding: 8px 12px; border-radius: 8px; border: 1px solid #16a34a; background: rgb(22 163 74 / 0.15); color: #f8fafc; cursor: pointer; }
    .track-editor .actions button, .track-editor .actions a { font: inherit; font-size: 14px; padding: 8px 12px; border-radius: 8px; border: 0; cursor: pointer; text-decoration: none; }
    .track-editor .primary { background: #ea580c; color: #fff; font-weight: 600; }
    .track-editor .secondary { background: rgb(255 255 255 / 0.1); color: #fff; }
    .track-editor button:disabled { opacity: 0.4; cursor: not-allowed; }
`

const config = (window as { trackEditorConfig?: EditorConfig }).trackEditorConfig
const container = document.getElementById('track-editor')
if (!config || !container) throw new Error('The track editor needs #track-editor and window.trackEditorConfig')

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)
container.classList.add('track-editor')
container.innerHTML = `
    <div class="map"><canvas></canvas><div class="loading">Loading the city…</div></div>
    <aside class="side">
        <label>Track name <input name="name" maxlength="60" placeholder="My track"></label>
        <label>Laps <select name="laps"></select></label>
        <div class="stats"><div><b data-stat="length">–</b>lap length</div><div><b data-stat="count">0</b>checkpoints</div></div>
        <ol></ol>
        <button class="secondary reverse" data-action="reverse" title="Race the lap the other way round: the start line stays, the arrow on it flips">⇄ Reverse direction</button>
        <div class="status"></div>
        <p class="help">
            Click a street to add a checkpoint: the first one is the start line.
            Its green arrow shows which way the race goes: "Reverse direction" flips it.
            Click on the orange route to put one between two.
            Drag a checkpoint to move it; right-click it to remove it.
            Scroll to zoom, drag the map to move around. Ctrl+Z undoes.
        </p>
        <div class="actions">
            <button class="primary" data-action="drive">Save &amp; drive</button>
            <button class="secondary" data-action="save">Save</button>
            <button class="secondary" data-action="undo">Undo</button>
            <a class="secondary" href="${config.backUrl}">Cancel</a>
        </div>
    </aside>`

const canvas = container.querySelector('canvas')!
const context = canvas.getContext('2d')!
const nameInput = container.querySelector<HTMLInputElement>('input[name=name]')!
const lapsSelect = container.querySelector<HTMLSelectElement>('select[name=laps]')!
const list = container.querySelector('ol')!
const statusBox = container.querySelector<HTMLElement>('.status')!
const buttons = {
    drive: container.querySelector<HTMLButtonElement>('[data-action=drive]')!,
    save: container.querySelector<HTMLButtonElement>('[data-action=save]')!,
    undo: container.querySelector<HTMLButtonElement>('[data-action=undo]')!,
    reverse: container.querySelector<HTMLButtonElement>('[data-action=reverse]')!,
}
for (let laps = 1; laps <= MAX_LAPS; laps++) {
    lapsSelect.append(new Option(`${laps} lap${laps > 1 ? 's' : ''}`, String(laps)))
}
nameInput.value = config.track?.name ?? ''
lapsSelect.value = String(config.track?.laps ?? DEFAULT_LAPS)

const map = (await (await fetch(config.mapUrl)).json()) as RaceMap
const world = buildWorld(map)
const { project, unproject } = projectionAt(map.origin)
container.querySelector('.loading')!.remove()

/** Bounding boxes, so a frame only draws what's on screen. */
const buildingBoxes = map.buildings.map(building => boxOf(building.outline))
const roadBoxes = map.roads.map(road => boxOf(road.points))

let gates: Gate[] = config.track ? projectCourse('draft', config.track, project).gates : []
let route: Route | null = null
let problems: string[] = []
const history: Gate[][] = []
let hovered = -1
let saving = false
let serverError = ''

// The view: map metres to canvas pixels, `scale` pixels a metre, (cx, cz) in the middle.
const view = { cx: 0, cz: 0, scale: ZOOM.start }
fitView()
update()

function update(): void {
    route = gates.length >= 2 ? courseRoute(draft(), map.roads) : null
    problems = gates.length < 3 ? ['Place at least 3 checkpoints.'] : courseProblems(draft(), world, map.roads)
    renderSidebar()
    draw()
}

function draft(): Course {
    return { slug: 'draft', name: nameInput.value.trim(), laps: Number(lapsSelect.value), gates }
}

/** Changes the checkpoints, remembering the old ones for Undo. */
function edit(next: Gate[]): void {
    history.push(gates)
    gates = next
    serverError = ''
    update()
}

function renderSidebar(): void {
    container!.querySelector('[data-stat=length]')!.textContent = route ? `${(route.length / 1000).toFixed(2)} km` : '–'
    container!.querySelector('[data-stat=count]')!.textContent = String(gates.length)
    list.replaceChildren(
        ...gates.map((_, i) => {
            const item = document.createElement('li')
            item.className = i === hovered ? 'hover' : ''
            item.innerHTML = `<span class="dot${i === 0 ? ' start' : ''}">${i === 0 ? 'S' : i}</span><span class="name">${i === 0 ? 'Start line' : `Checkpoint ${i}`}</span><button title="Remove">✕</button>`
            item.querySelector('button')!.addEventListener('click', () => edit(gates.filter((_, j) => j !== i)))
            item.addEventListener('mouseenter', () => setHovered(i))
            item.addEventListener('mouseleave', () => setHovered(-1))
            return item
        })
    )
    const messages = [...problems, ...(serverError ? [serverError] : [])]
    statusBox.className = messages.length > 0 ? 'problems' : 'ok'
    statusBox.replaceChildren(
        ...(messages.length > 0 ? messages : ['Ready to race.']).map(text =>
            Object.assign(document.createElement('div'), { textContent: text })
        )
    )
    const blocked = saving || problems.length > 0 || nameInput.value.trim() === ''
    buttons.drive.disabled = blocked
    buttons.save.disabled = blocked
    buttons.undo.disabled = history.length === 0
    buttons.reverse.disabled = gates.length < 3
    if (nameInput.value.trim() === '' && gates.length >= 3 && problems.length === 0) {
        statusBox.className = 'problems'
        statusBox.textContent = 'Give the track a name.'
    }
}

function setHovered(index: number): void {
    if (hovered === index) return
    hovered = index
    renderSidebar()
    draw()
}

function draw(): void {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = COLOURS.ground
    context.fillRect(0, 0, width, height)

    const scale = view.scale
    context.setTransform(
        ratio * scale,
        0,
        0,
        ratio * scale,
        ratio * (width / 2 - view.cx * scale),
        ratio * (height / 2 - view.cz * scale)
    )
    const visible = {
        left: view.cx - width / 2 / scale,
        right: view.cx + width / 2 / scale,
        top: view.cz - height / 2 / scale,
        bottom: view.cz + height / 2 / scale,
    }
    const onScreen = (box: Box) =>
        box.right >= visible.left && box.left <= visible.right && box.bottom >= visible.top && box.top <= visible.bottom

    for (const area of map.areas) {
        if (area.kind === 'parking') continue
        context.fillStyle = area.kind === 'water' ? COLOURS.water : COLOURS.park
        tracePolygon(area.outline)
        context.fill()
    }
    context.lineCap = 'round'
    context.lineJoin = 'round'
    // Streets twice: a kerb-coloured edge, then the white road over it.
    for (const pass of ['edge', 'road'] as const) {
        map.roads.forEach((road, i) => {
            if (road.kind === 'path' || road.kind === 'sidewalk' || !onScreen(roadBoxes[i]!)) return
            context.strokeStyle = pass === 'edge' ? COLOURS.roadEdge : COLOURS.road
            context.lineWidth = road.width + (pass === 'edge' ? 2 / scale : 0)
            traceLine(road.points)
            context.stroke()
        })
    }
    context.fillStyle = COLOURS.building
    map.buildings.forEach((building, i) => {
        if (!onScreen(buildingBoxes[i]!)) return
        tracePolygon(building.outline)
        context.fill()
    })

    // Street names over the streets (in screen pixels): the big ones from far out, smaller streets as you zoom in.
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawStreetNames(onScreen)
    context.setTransform(
        ratio * scale,
        0,
        0,
        ratio * scale,
        ratio * (width / 2 - view.cx * scale),
        ratio * (height / 2 - view.cz * scale)
    )

    if (route) {
        context.strokeStyle = COLOURS.route
        context.lineWidth = 5 / scale
        context.setLineDash([])
        traceLine(route.points)
        context.stroke()
    }

    // Checkpoints in screen pixels, so they stay the same size at any zoom: a bar across the road, and its number.
    // A checkpoint is crossed either way; the one arrow, on the start line, shows which way the route
    // (and so the race) leaves it: "Reverse direction" flips it.
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    if (route && gates.length >= 3) drawStartArrow(route)
    // Each bar as the race lays it: square across the route where the route goes through.
    const raced = route ? orientAlongRoute(draft(), route).gates : gates
    raced.forEach((gate, i) => {
        const [x, y] = toScreen(gate.x, gate.z)
        const colour = i === hovered ? COLOURS.hover : i === 0 ? COLOURS.start : COLOURS.gate
        const half = Math.max((gate.width / 2) * scale, 14)
        context.strokeStyle = colour
        context.lineWidth = 4
        context.beginPath()
        context.moveTo(x - gate.dz * half, y + gate.dx * half)
        context.lineTo(x + gate.dz * half, y - gate.dx * half)
        context.stroke()
        context.fillStyle = colour
        context.beginPath()
        context.arc(x, y, 12, 0, Math.PI * 2)
        context.fill()
        context.lineWidth = 2
        context.strokeStyle = '#ffffff'
        context.stroke()
        context.fillStyle = '#ffffff'
        context.font = '700 12px system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(i === 0 ? 'S' : String(i), x, y + 0.5)
    })
}

function traceLine(flat: number[]): void {
    context.beginPath()
    for (let i = 0; i < flat.length; i += 2) {
        if (i === 0) context.moveTo(flat[i]!, flat[i + 1]!)
        else context.lineTo(flat[i]!, flat[i + 1]!)
    }
}

function tracePolygon(flat: number[]): void {
    traceLine(flat)
    context.closePath()
}

/**
 * A big arrow off the start line, the way the race goes: the start gate as the
 * race orients it (`orientAlongRoute`: the grid faces this way too).
 */
function drawStartArrow(route: Route): void {
    const start = orientAlongRoute(draft(), route).gates[0]!
    const [x1, y1] = toScreen(start.x, start.z)
    const [x2, y2] = toScreen(start.x + start.dx * 25, start.z + start.dz * 25)
    const length = Math.hypot(x2 - x1, y2 - y1)
    if (length < 1) return
    const ux = (x2 - x1) / length
    const uy = (y2 - y1) / length
    // From just past the start's circle, 46 px long, with a head.
    const tailX = x1 + ux * 18
    const tailY = y1 + uy * 18
    const tipX = x1 + ux * 64
    const tipY = y1 + uy * 64
    context.strokeStyle = COLOURS.start
    context.fillStyle = COLOURS.start
    context.lineWidth = 6
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(tailX, tailY)
    context.lineTo(tipX - ux * 10, tipY - uy * 10)
    context.stroke()
    context.beginPath()
    context.moveTo(tipX, tipY)
    context.lineTo(tipX - ux * 18 - uy * 11, tipY - uy * 18 + ux * 11)
    context.lineTo(tipX - ux * 18 + uy * 11, tipY - uy * 18 - ux * 11)
    context.closePath()
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = '#ffffff'
    context.stroke()
    context.lineCap = 'butt'
}

/**
 * Street names, each along the longest straight stretch of its street that
 * fits it, kept upright, never over another name, and not again close to
 * where the same name already is. Which streets get one depends on the zoom.
 */
function drawStreetNames(onScreen: (box: Box) => boolean): void {
    const placed: Array<{ left: number; right: number; top: number; bottom: number }> = []
    const lastAt = new Map<string, Array<[number, number]>>()
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    // Big streets first: they win the space.
    const order = [...map.roads.keys()]
        .filter(i => map.roads[i]!.name)
        .sort((a, b) => RANK[map.roads[a]!.kind] - RANK[map.roads[b]!.kind])
    for (const i of order) {
        const road = map.roads[i]!
        const style = LABELS[road.kind]
        if (!style || view.scale < style.from || !onScreen(roadBoxes[i]!)) continue
        context.font = style.font
        const text = road.name!
        const textWidth = context.measureText(text).width
        const best = straightestRun(road.points)
        if (!best || best.length < textWidth + LABEL_ROOM) continue
        const at = best
        if (at.x < 0 || at.y < 0 || at.x > canvas.clientWidth || at.y > canvas.clientHeight) continue
        const same = lastAt.get(text) ?? []
        if (same.some(([x, y]) => Math.hypot(x - at.x, y - at.y) < LABEL_REPEAT)) continue
        // The label's box, turned with it (its corners' extent).
        const halfW = textWidth / 2 + 4
        const halfH = style.size / 2 + 3
        const cos = Math.abs(Math.cos(at.angle))
        const sin = Math.abs(Math.sin(at.angle))
        const box = {
            left: at.x - (halfW * cos + halfH * sin),
            right: at.x + (halfW * cos + halfH * sin),
            top: at.y - (halfW * sin + halfH * cos),
            bottom: at.y + (halfW * sin + halfH * cos),
        }
        if (placed.some(b => b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom))
            continue
        placed.push(box)
        lastAt.set(text, [...same, [at.x, at.y]])
        context.save()
        context.translate(at.x, at.y)
        context.rotate(at.angle)
        context.lineWidth = 3
        context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        context.strokeText(text, 0, 0.5)
        context.fillStyle = style.colour
        context.fillText(text, 0, 0.5)
        context.restore()
    }
}

/**
 * The longest run of a street's segments (on screen) that keeps to one
 * direction, within LABEL_BEND: where its name can lie straight. Its middle,
 * its angle (turned upright) and its length in pixels.
 */
function straightestRun(points: number[]): { x: number; y: number; angle: number; length: number } | null {
    const screen: Array<[number, number]> = []
    for (let p = 0; p + 1 < points.length; p += 2) screen.push(toScreen(points[p]!, points[p + 1]!))
    let best: { from: number; to: number; length: number } | null = null
    for (let i = 0; i + 1 < screen.length; i++) {
        const heading = Math.atan2(screen[i + 1]![1] - screen[i]![1], screen[i + 1]![0] - screen[i]![0])
        let length = 0
        let j = i
        while (j + 1 < screen.length) {
            const [ax, ay] = screen[j]!
            const [bx, by] = screen[j + 1]!
            const turn = Math.atan2(by - ay, bx - ax) - heading
            if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > LABEL_BEND) break
            length += Math.hypot(bx - ax, by - ay)
            j++
        }
        if (j > i && (!best || length > best.length)) best = { from: i, to: j, length }
    }
    if (!best) return null
    const [x1, y1] = screen[best.from]!
    const [x2, y2] = screen[best.to]!
    let angle = Math.atan2(y2 - y1, x2 - x1)
    if (angle > Math.PI / 2) angle -= Math.PI
    if (angle < -Math.PI / 2) angle += Math.PI

    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle, length: best.length }
}

function toScreen(x: number, z: number): [number, number] {
    return [canvas.clientWidth / 2 + (x - view.cx) * view.scale, canvas.clientHeight / 2 + (z - view.cz) * view.scale]
}

function toMap(clientX: number, clientY: number): { x: number; z: number } {
    const bounds = canvas.getBoundingClientRect()
    return {
        x: view.cx + (clientX - bounds.left - bounds.width / 2) / view.scale,
        z: view.cz + (clientY - bounds.top - bounds.height / 2) / view.scale,
    }
}

/** The checkpoint under a point on screen, or −1. */
function gateAt(clientX: number, clientY: number): number {
    const bounds = canvas.getBoundingClientRect()
    let found = -1
    let nearest = PICK_RADIUS
    gates.forEach((gate, i) => {
        const [x, y] = toScreen(gate.x, gate.z)
        const distance = Math.hypot(x - (clientX - bounds.left), y - (clientY - bounds.top))
        if (distance <= nearest) {
            found = i
            nearest = distance
        }
    })

    return found
}

/** Opens on the track, or on the Parliament for a new one. */
function fitView(): void {
    if (gates.length === 0) {
        const [x, z] = project(START_VIEW)
        Object.assign(view, { cx: x, cz: z, scale: ZOOM.start })
        return
    }
    const box = boxOf(gates.flatMap(gate => [gate.x, gate.z]))
    const margin = 120
    view.cx = (box.left + box.right) / 2
    view.cz = (box.top + box.bottom) / 2
    view.scale = clamp(
        Math.min(
            canvas.clientWidth / (box.right - box.left + margin * 2),
            canvas.clientHeight / (box.bottom - box.top + margin * 2)
        ),
        ZOOM.min,
        ZOOM.max
    )
}

// Pointer: a press then release without moving is a click (add a checkpoint); moving drags a checkpoint or pans.
let press: { clientX: number; clientY: number; gate: number; moved: boolean; cx: number; cz: number } | null = null

canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    canvas.setPointerCapture(event.pointerId)
    press = {
        clientX: event.clientX,
        clientY: event.clientY,
        gate: gateAt(event.clientX, event.clientY),
        moved: false,
        cx: view.cx,
        cz: view.cz,
    }
})

canvas.addEventListener('pointermove', event => {
    if (!press) {
        const over = gateAt(event.clientX, event.clientY)
        canvas.classList.toggle('over-gate', over >= 0)
        setHovered(over)
        return
    }
    const dx = event.clientX - press.clientX
    const dy = event.clientY - press.clientY
    if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!press.moved) {
        press.moved = true
        if (press.gate >= 0) history.push(gates)
    }
    if (press.gate >= 0) {
        // Follow the pointer; it snaps onto the street when let go.
        canvas.classList.add('dragging')
        const { x, z } = toMap(event.clientX, event.clientY)
        gates = gates.map((gate, i) => (i === press!.gate ? { ...gate, x, z } : gate))
        draw()
    } else {
        canvas.classList.add('panning')
        view.cx = press.cx - dx / view.scale
        view.cz = press.cz - dy / view.scale
        draw()
    }
})

canvas.addEventListener('pointerup', event => {
    if (!press) return
    const { gate, moved } = press
    press = null
    canvas.classList.remove('dragging', 'panning')
    const { x, z } = toMap(event.clientX, event.clientY)
    if (moved && gate >= 0) {
        const snapped = gateAcrossRoad(world, x, z, Math.atan2(-gates[gate]!.dx, -gates[gate]!.dz))
        gates = snapped ? gates.map((g, i) => (i === gate ? snapped : g)) : history.pop()!
        serverError = ''
        update()
    } else if (!moved && gate < 0) {
        const placed = gateAcrossRoad(world, x, z, 0)
        if (!placed) return
        const index = insertionIndex(route, gates, x, z, PICK_RADIUS / view.scale)
        edit([...gates.slice(0, index), placed, ...gates.slice(index)])
    }
})

canvas.addEventListener('contextmenu', event => {
    event.preventDefault()
    const gate = gateAt(event.clientX, event.clientY)
    if (gate >= 0) edit(gates.filter((_, i) => i !== gate))
})

canvas.addEventListener(
    'wheel',
    event => {
        event.preventDefault()
        // Zoom round the pointer: the spot under it stays put.
        const before = toMap(event.clientX, event.clientY)
        view.scale = clamp(view.scale * Math.exp(-event.deltaY * 0.0015), ZOOM.min, ZOOM.max)
        const after = toMap(event.clientX, event.clientY)
        view.cx += before.x - after.x
        view.cz += before.z - after.z
        draw()
    },
    { passive: false }
)

document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        undo()
    }
})
new ResizeObserver(() => draw()).observe(canvas)
nameInput.addEventListener('input', () => renderSidebar())
lapsSelect.addEventListener('change', () => renderSidebar())
buttons.undo.addEventListener('click', undo)
buttons.reverse.addEventListener('click', () => edit(reversed(gates)))
buttons.save.addEventListener('click', () => void save(false))
buttons.drive.addEventListener('click', () => void save(true))

function undo(): void {
    const previous = history.pop()
    if (!previous) return
    gates = previous
    update()
}

async function save(thenDrive: boolean): Promise<void> {
    if (saving || !route) return
    saving = true
    serverError = ''
    renderSidebar()
    try {
        // Saved as the race lays the checkpoints: their lines square across the route, facing the way round.
        const file = courseFile(orientAlongRoute(draft(), route), unproject)
        const response = await fetch(config!.saveUrl, {
            method: config!.method,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': config!.csrf },
            body: JSON.stringify({ ...file, length: Math.round(route.length) }),
        })
        const result = (await response.json()) as {
            play_url?: string
            index_url?: string
            message?: string
            errors?: Record<string, string[]>
        }
        if (!response.ok) {
            throw new Error(
                result.errors
                    ? Object.values(result.errors).flat().join(' ')
                    : (result.message ?? `The Hub said ${response.status}`)
            )
        }
        location.href = (thenDrive ? result.play_url : result.index_url) ?? config!.backUrl
    } catch (error) {
        serverError = (error as Error).message
    } finally {
        saving = false
        renderSidebar()
    }
}

interface Box {
    left: number
    right: number
    top: number
    bottom: number
}

function boxOf(flat: number[]): Box {
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    for (let i = 0; i < flat.length; i += 2) {
        box.left = Math.min(box.left, flat[i]!)
        box.right = Math.max(box.right, flat[i]!)
        box.top = Math.min(box.top, flat[i + 1]!)
        box.bottom = Math.max(box.bottom, flat[i + 1]!)
    }

    return box
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
