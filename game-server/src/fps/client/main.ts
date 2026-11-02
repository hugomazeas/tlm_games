import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { buildOffice } from '../map/office.js'
import {
    BUTTON,
    encodeFrame,
    type GameEvent,
    type InputFrame,
    type PlayerInfo,
    type SelfState,
    type ServerMessage,
} from '../protocol.ts'
import { aimDirection, eyeOf, WEAPON } from '../sim/combat.ts'
import { PLAYER, STEP_MS } from '../sim/movement.ts'
import { rayDistance, worldFrom } from '../sim/world.ts'
import { Avatars } from './avatars.ts'
import { Controls } from './controls.ts'
import { Effects, Viewmodel } from './effects.ts'
import { escape, Hud } from './hud.ts'
import { Prediction } from './prediction.ts'
import { Interpolator, type Pose, ServerClock } from './timeline.ts'
import { aimFromCamera, thirdPersonCamera } from './view.ts'

/**
 * The office FPS in the browser. The Hub's page sets window.officeFpsConfig and loads this module
 * (from the game server, /games/office-fps/live/play.js).
 *
 * Every 60 Hz step: read the keys and the mouse into a frame, move yourself with it at once
 * (prediction), and send it. Every snapshot: take the server's word for where
 * you are and replay what it hasn't seen yet; draw the others a little in the past, smoothly.
 */

interface Config {
    playerId: number | null
    name: string
    backUrl: string
}
declare global {
    interface Window {
        officeFpsConfig?: Config
    }
}

const config: Config = window.officeFpsConfig ?? { playerId: null, name: 'Guest', backUrl: '/' }
/** Frames per message: each frame goes out as soon as it's made (60 messages a second, ~60 bytes each). */
const SEND_EVERY = 1
/** A correction this big is a teleport (a respawn): jump, don't glide. */
const SNAP_DISTANCE = 1

// --- The scene: the office, as the server has it, dressed for the browser ------------------
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = PCFShadowMap
// The office never moves: its shadows are drawn once (setTime asks for it).
renderer.shadowMap.autoUpdate = false
renderer.toneMapping = ACESFilmicToneMapping
Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '10', cursor: 'crosshair' })
document.body.append(renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(78, innerWidth / innerHeight, 0.01, 900)
camera.rotation.order = 'YXZ'
scene.add(camera)
const office = buildOffice(scene, renderer)
const world = worldFrom(office)
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
})

const hud = new Hud(config.backUrl)
const controls = new Controls(renderer.domElement, locked => hud.card(locked ? 'playing' : 'paused'))
const avatars = new Avatars(scene)
const effects = new Effects(scene)
let viewmodel: Viewmodel | null = null

// --- What we know ---------------------------------------------------------------------------
let socket: WebSocket | null = null
let me: string | null = null
let roster = new Map<string, PlayerInfo>()
let self: SelfState | null = null
let wasAlive = false
let killer: string | null = null
let seq = 0
let outbox: InputFrame[] = []
let prediction = new Prediction(world)
let clock = new ServerClock()
let others = new Interpolator()
/** How far the camera still is from the predicted body after a correction; it fades. */
const smoothing = new Vector3()
let nextLocalShot = 0
let closedForGood = false
/** Your jetpack burning on your last frame (drawn on your own trooper in third person). */
let jetting = false

/** First or third person (V), remembered in this browser. */
let thirdPerson = remembered('officeFps.view') === 'third'
controls.onToggleView = () => {
    thirdPerson = !thirdPerson
    remember('officeFps.view', thirdPerson ? 'third' : 'first')
}
function remembered(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
function remember(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Private window: the choice lasts this visit.
    }
}

connect()

function connect(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/games/office-fps/live/ws`
    const ws = new WebSocket(url)
    socket = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', playerId: config.playerId }))
    ws.onmessage = event => receive(JSON.parse(event.data as string) as ServerMessage)
    ws.onclose = () => {
        if (socket !== ws) return
        socket = null
        me = null
        if (closedForGood) return
        hud.card('unavailable')
        setTimeout(connect, 2000)
    }
}

function receive(message: ServerMessage): void {
    const now = performance.now()
    switch (message.type) {
        case 'welcome':
            me = message.you
            roster = new Map(message.players.map(p => [p.id, p]))
            prediction = new Prediction(world)
            clock = new ServerClock()
            others = new Interpolator()
            outbox = []
            self = null
            wasAlive = false
            hud.setMatch(message.match, now)
            hud.card(controls.locked ? 'playing' : 'paused')
            viewmodel ??= new Viewmodel(camera, roster.get(me)?.color ?? '#ffd166')
            return
        case 'roster':
            roster = new Map(message.players.map(p => [p.id, p]))
            return
        case 'match':
            hud.setMatch(message.match, now)
            return
        case 'snap':
            snapshot(message, now)
            return
        case 'replaced':
            closedForGood = true
            hud.card('replaced')
            document.exitPointerLock()
            return
        case 'error':
            if (message.code === 'UNKNOWN_PLAYER') {
                closedForGood = true
                hud.card('unknown')
            }
            return
    }
}

function snapshot(snap: Extract<ServerMessage, { type: 'snap' }>, now: number): void {
    clock.heard(snap.step, now)
    others.push(snap.step, snap.players)
    self = snap.you
    hud.setSelf(self)
    if (self) {
        const spawned = self.alive && !wasAlive
        const correction = prediction.reconcile(snap.ack, self.body, self.alive)
        const off = Math.hypot(correction.x, correction.y, correction.z)
        if (spawned || off > SNAP_DISTANCE) smoothing.set(0, 0, 0)
        else smoothing.add(new Vector3(correction.x, correction.y, correction.z))
        if (spawned) {
            const at = snap.players.find(p => p.id === me)
            if (at) controls.face(at.yaw)
            killer = null
        }
        wasAlive = self.alive
    }
    for (const event of snap.events) onEvent(event, now)
}

function onEvent(event: GameEvent, now: number): void {
    const name = (id: string | null) => (id && roster.get(id)?.name) || '?'
    const colored = (id: string | null) =>
        `<span style="color:${(id && roster.get(id)?.color) || '#fff'}">${escape(name(id))}</span>`
    if (event.type === 'shot') {
        if (event.hit) avatars.flash(event.hit, now)
        if (event.by === me) {
            // Drawn already when fired; the server says whether it hit.
            if (event.hit) hud.hitMarker(event.headshot)
            return
        }
        const color = parseInt((roster.get(event.by)?.color ?? '#ffffff').slice(1), 16)
        effects.tracer(new Vector3(...event.from), new Vector3(...event.to), color, now, event.hit !== null)
    }
    if (event.type === 'kill') {
        const how = `<span style="opacity:.7">${event.headshot ? '⌖' : '→'}</span>`
        hud.killFeed(`${colored(event.killer)} ${how} ${colored(event.victim)}`)
        // Still drawn where they fell (they disappear on the next frame).
        const fell = avatars.centerOf(event.victim)
        if (fell) effects.burst(fell, roster.get(event.victim)?.color ?? '#ffffff', now)
        if (event.victim === me) killer = event.killer ? name(event.killer) : null
    }
}

// --- The loop ---------------------------------------------------------------------------------
let last = performance.now()
let pending = 0

function frame(now: number): void {
    pending = Math.min(pending + (now - last), STEP_MS * 10)
    last = now
    while (pending >= STEP_MS) {
        pending -= STEP_MS
        step(now)
    }
    draw(now)
    requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

/** One 60 Hz step of yours: a frame, applied here and queued for the server. */
function step(now: number): void {
    if (!socket || socket.readyState !== WebSocket.OPEN || !me || !self) return
    const keys = controls.locked ? controls.read() : { forward: 0, strafe: 0, buttons: 0 }
    const body = prediction.body
    const aim =
        thirdPerson && body && self.alive ? aimThirdPerson(eyeOf(body)) : { yaw: controls.yaw, pitch: controls.pitch }
    const input: InputFrame = {
        seq: ++seq,
        forward: keys.forward,
        strafe: keys.strafe,
        yaw: aim.yaw,
        pitch: aim.pitch,
        buttons: keys.buttons,
        view: Math.max(0, Math.floor(clock.renderStep(now) ?? 0)),
    }
    jetting = Boolean(input.buttons & BUTTON.jet) && (body?.fuel ?? 0) > 0
    prediction.apply(input, self.alive)
    outbox.push(input)
    if (outbox.length >= SEND_EVERY) flush()

    // Your own shot shows at once: the server's answer only says whether it hit.
    if (input.buttons & BUTTON.fire && self.alive && !self.reloading && self.ammo > 0 && now >= nextLocalShot) {
        nextLocalShot = now + WEAPON.intervalMs
        const eye = eyeOf(prediction.body!)
        const direction = aimDirection(input.yaw, input.pitch)
        const end = eye.clone().addScaledVector(direction, rayDistance(world, eye, direction, WEAPON.range))
        viewmodel?.fire(now)
        effects.tracer(viewmodel && !thirdPerson ? viewmodel.muzzleIn(camera) : eye, end, 0xffd080, now, false)
    }
}

/** In third person the camera isn't at your eyes: aim them at what the crosshair is on. */
function aimThirdPerson(eye: Vector3): { yaw: number; pitch: number } {
    const { yaw, pitch } = controls
    return aimFromCamera(world, eye, thirdPersonCamera(world, eye, yaw, pitch), yaw, pitch)
}

function flush(): void {
    if (outbox.length === 0 || socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'input', frames: outbox.map(encodeFrame) }))
    outbox = []
}

// A hidden tab sends nothing, and the server would keep you moving on your last keys: stop first.
addEventListener('blur', () => sendIdle())
document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendIdle()
})
function sendIdle(): void {
    if (!me || !self) return
    outbox.push({ seq: ++seq, forward: 0, strafe: 0, yaw: controls.yaw, pitch: controls.pitch, buttons: 0, view: 0 })
    flush()
}

let lastDraw = performance.now()

function draw(now: number): void {
    const dt = Math.min(0.1, (now - lastDraw) / 1000)
    lastDraw = now
    smoothing.multiplyScalar(Math.exp(-12 * dt))

    const body = prediction.body
    office.ceiling.visible = Boolean(self)
    const third = thirdPerson && Boolean(self?.alive)
    if (self && body) {
        const eye = new Vector3(body.x, body.y + PLAYER.eye, body.z).add(smoothing)
        camera.position.copy(third ? thirdPersonCamera(world, eye, controls.yaw, controls.pitch) : eye)
        camera.rotation.set(self.alive ? controls.pitch : -0.5, controls.yaw, 0)
        if (!self.alive) camera.position.y += 0.4
    } else if (me) {
        // Watching: the dollhouse view, turning slowly.
        const a = now * 0.00005
        camera.position.set(Math.sin(a) * 14, 16, Math.cos(a) * 9)
        camera.lookAt(0, 0, 0)
    }
    if (viewmodel) {
        viewmodel.visible = Boolean(self?.alive) && !third
        const moving = Boolean(body && body.onGround && Math.hypot(body.vx, body.vz) > 0.5)
        viewmodel.update(now, moving)
    }

    const at = clock.renderStep(now)
    const poses = at === null ? new Map<string, Pose>() : others.sample(at)
    // In third person you see your own trooper, where you are now (not the server's past).
    if (third && me && self && body) {
        const where = { x: body.x + smoothing.x, y: body.y + smoothing.y, z: body.z + smoothing.z }
        const facing = { yaw: controls.yaw, pitch: controls.pitch }
        const state = { id: me, ...where, ...facing, alive: true, jet: jetting, shielded: self.shielded }
        poses.set(me, { ...where, ...facing, state })
    }
    avatars.update(poses, roster, third ? null : me, now)
    effects.update(now)
    hud.update(now, { me, self, killer, tab: controls.scoreboardHeld, roster })
    renderer.render(scene, camera)
}
