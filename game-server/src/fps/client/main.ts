import {
    ACESFilmicToneMapping,
    type Material,
    type Object3D,
    PCFShadowMap,
    PerspectiveCamera,
    Scene,
    Texture,
    Vector3,
    WebGLRenderer,
} from 'three'
import { buildOffice } from '../map/office.js'
import {
    BUTTON,
    DEFAULT_LOADOUT,
    encodeFrame,
    type GameEvent,
    type Gun,
    type InputFrame,
    type Loadout,
    parseLoadout,
    type RocketState,
    WEAPON_NAMES,
    weaponIn,
    type MatchView,
    type PlayerInfo,
    type Rules,
    type SelfState,
    type ServerMessage,
    SIEGE,
    type SiegeHold,
    type SiegeView,
    type Team,
    TEAM_COLORS,
    type Weapon,
    type ZoneState,
} from '../protocol.ts'
import {
    aimDirection,
    eyeOf,
    GUNS,
    LAUNCHER,
    maxHealthOf,
    powersOf,
    reloadMsOf,
    spreadDirection,
    spreadOf,
    STAPLER,
    SWITCH_MS,
} from '../sim/combat.ts'
import { jetBurns, MOVE, moveOf, PLAYER, scaleOf, STEP_MS } from '../sim/movement.ts'
import {
    PICKUP_SPOTS,
    type PickupKind,
    PICKUPS,
    PORTAL,
    SIEGE_SPOTS,
    siegeForbidsBuild,
    siegeWinner,
    ZONES,
} from '../sim/places.ts'
import { buildSlot, type BuildSlot } from '../sim/building.ts'
import { BUILD, type Wall } from '../sim/walls.ts'
import { rayDistance, rayHit, worldFrom } from '../sim/world.ts'
import { WallViews } from './building.ts'
import { Impacts } from './impacts.ts'
import { Avatars } from './avatars.ts'
import { announce, taunt } from './callouts.ts'
import { Controls } from './controls.ts'
import { Effects } from './effects.ts'
import { BUFF_LABELS, type DeathCause, escape, Hud } from './hud.ts'
import { GpuTimer, type PerfExtras, PerfOverlay, type Section } from './perf.ts'
import { DomeView, PadViews, PICKUP_COLORS, PickupViews, PortalViews, ZoneView } from './pickups.ts'
import { Prediction } from './prediction.ts'
import { aimFov, loadSettings, saveSettings } from './settings.ts'
import { reloadProgress, Sounds, spatial } from './sounds.ts'
import { targetUnderCrosshair } from './targeting.ts'
import { Interpolator, type Pose, ServerClock } from './timeline.ts'
import { aimFromCamera, thirdPersonCamera } from './view.ts'
import { Viewmodel } from './viewmodel.ts'

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
/** The sniper's shot: a thicker line that lingers. */
const SNIPER_TRACER = { width: 2.5, life: 250 }
/** A correction this big is a teleport (a respawn): jump, don't glide. */
const SNAP_DISTANCE = 1

// --- The scene: the office, as the server has it, dressed for the browser ------------------
let settings = loadSettings()
// Anti-aliasing is fixed when the canvas is made: a change applies on the next load.
const renderer = new WebGLRenderer({ antialias: settings.antialias, powerPreference: 'high-performance' })
/** Pixels per CSS pixel at full resolution; the Resolution setting draws a share of it. */
const FULL_PIXEL_RATIO = Math.min(devicePixelRatio, 1.25)
renderer.setPixelRatio(FULL_PIXEL_RATIO)
renderer.setSize(innerWidth, innerHeight)
// Counted over the whole frame (the world, then the gun), reset at each frame's start.
renderer.info.autoReset = false
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
const pickupViews = new PickupViews(scene)
const padViews = new PadViews(scene, world.pads)
const portalViews = new PortalViews(scene, world.portals)
const zoneView = new ZoneView(scene)
const spotView = new ZoneView(scene, SIEGE_SPOTS)
const domeView = new DomeView(scene)
const wallViews = new WallViews(scene)
addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
})

const perf = new PerfOverlay()
const gpuTimer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext)
const gpuName = gpuNameOf(renderer.getContext())
perf.visible = settings.perfOverlay
applyResolution()
/** The guns picked in this browser (sent with hello, and on every change). */
let picked: Loadout = rememberedLoadout()
const sounds = new Sounds()
const hud = new Hud(config.backUrl, {
    settings,
    onSettings: changed => {
        const resized = changed.resolution !== settings.resolution
        settings = changed
        saveSettings(changed)
        controls.invertY = changed.invertY
        sounds.setVolume(changed.volume)
        perf.visible = changed.perfOverlay
        if (resized) applyResolution()
    },
    onStart: rules => startMatch(rules),
    loadout: picked,
    onLoadout: chosen => {
        picked = chosen
        remember('officeFps.loadout', JSON.stringify(chosen))
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'loadout', loadout: chosen }))
    },
})
const controls = new Controls(renderer.domElement, locked => {
    hud.card(locked ? 'playing' : 'paused')
    // The click that takes the mouse is the one browsers need before any sound.
    if (locked) sounds.unlock()
    else sounds.jetting(false)
})
controls.invertY = settings.invertY
sounds.setVolume(settings.volume)
// Others' reloads are heard where they are (yours already is, from your own state).
const avatars = new Avatars(scene, (id, _gun, msLeft) => {
    const at = id === me ? null : avatars.centerOf(id)
    if (at) sounds.reload(msLeft, spatial(listener(), at))
})
const effects = new Effects(scene)
const impacts = new Impacts(scene)

/**
 * A round judged from `from` stopped at `to`: if that's on the office (not a player, not out of
 * range), its mark and what flies off, by what it hit.
 */
function landed(from: Vector3, to: Vector3, now: number): void {
    const along = to.clone().sub(from)
    const length = along.length()
    if (length < 0.01) return
    along.divideScalar(length)
    const hit = rayHit(world, from, along, length + 0.05)
    // On a built wall: what flies off, but no hole (left hanging in the air once it comes down).
    if (hit && hit.distance > length - 0.05) {
        impacts.hit(hit.point, hit.normal, along, hit.surface, now, !hit.wall && !hit.dome)
    }
}

/** A rocket went off at `at`: scorched on whatever is nearest (the floor, a wall, a desk), if it's close. */
function scorched(at: Vector3, now: number): void {
    let nearest: ReturnType<typeof rayHit> = null
    let direction = DOWN
    for (const toward of BLAST_RAYS) {
        const hit = rayHit(world, at, toward, nearest?.distance ?? 0.6)
        if (hit) [nearest, direction] = [hit, toward]
    }
    if (nearest) {
        impacts.blast(nearest.point, nearest.normal, direction, nearest.surface, now, !nearest.wall && !nearest.dome)
    }
}
const DOWN = new Vector3(0, -1, 0)
const BLAST_RAYS = [
    DOWN,
    new Vector3(0, 1, 0),
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1),
]
let viewmodel: Viewmodel | null = null

// --- What we know ---------------------------------------------------------------------------
let socket: WebSocket | null = null
let me: string | null = null
let roster = new Map<string, PlayerInfo>()
let match: MatchView | null = null
let self: SelfState | null = null
let wasAlive = false
let killer: string | null = null
/** The line under "Fragged by …", picked when you go down. */
let deathTaunt: string | null = null
/** How you went down (the gun, the range, what your killer had left), for the death screen. */
let deathCause: DeathCause | null = null
/** The latest snapshot's pickups (which are there) and zone. */
/** What lies on each pickup spot (null: taken, coming back). */
let pickupsReady: Array<PickupKind | null> = []
let zone: ZoneState | null = null
/** When `zone` came (its `movesInMs` counts from then). */
let zoneAt = 0
/** Siege: the attackers in the spot, and since how long (the latest snapshot's). */
let holds: SiegeHold[] = []
/** Everyone's side, from the latest snapshot (team deathmatch). */
let teams = new Map<string, Team | null>()
let seq = 0
let outbox: InputFrame[] = []
let prediction = new Prediction(world)
let clock = new ServerClock()
let others = new Interpolator()
/** How far the camera still is from the predicted body after a correction; it fades. */
const smoothing = new Vector3()
let nextLocalShot = 0
let nextLocalSwing = 0
let wasFiring = false
/** When your reload ends on this clock (null: not reloading); the ring and the animation run to it. */
let reloadEndsAt: number | null = null
/** Seen alive once already: later spawns get their chime (not the first one, on joining). */
let wasConnectedAlive = false
/** When the last match message came (its remainingMs counts from then), and the last countdown beep. */
let matchAt = 0
let lastBeep = 0
/** The weapon in hand here, and when it can be used (as the server counts it). */
let held: Weapon = DEFAULT_LOADOUT.primary
let readyAt = 0
/** A click a click-a-shot gun hasn't used yet (as the server keeps it). */
let clicked = false
/** Rockets in flight from the last snapshot, and when it came (they fly straight: drawn ahead by their speed). */
let rockets: RocketState[] = []
let rocketsAt = 0
/** The launcher was loaded on the last frame (a click when it's loaded again). */
let launcherLoaded = true
let closedForGood = false
/** Your jetpack burning on your last frame (drawn on your own trooper in third person). */
let jetting = false

/** First or third person (V), remembered in this browser. */
let thirdPerson = remembered('officeFps.view') === 'third'
controls.onToggleView = () => {
    thirdPerson = !thirdPerson
    remember('officeFps.view', thirdPerson ? 'third' : 'first')
}

/**
 * Playing (the mouse captured), closing or reloading the tab asks first: Ctrl+W on the way to
 * Ctrl+S, say, would otherwise quit the game (a page can't stop it outside fullscreen).
 */
addEventListener('beforeunload', e => {
    if (controls.locked) e.preventDefault()
})

/** Build mode's slot this frame (null: not building), worked out where the ghost is drawn. */
let buildAt: BuildSlot | null = null
/**
 * Between two walls, counted from the click (the ring by the crosshair fills meanwhile): the
 * server's pace, a little more so a click as it fills isn't refused for the network's jitter.
 */
const BUILD_COOLDOWN_MS = BUILD.everySteps * STEP_MS + 50
let nextBuildAt = 0
controls.onBuild = () => {
    if (!buildAt || socket?.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    if (now < nextBuildAt) return
    if (buildAt.taken || !buildAt.supported || siegeBlocks(buildAt.wall.x, buildAt.wall.z)) {
        return sounds.buildRefused()
    }
    nextBuildAt = now + BUILD_COOLDOWN_MS
    socket.send(JSON.stringify({ type: 'build', wall: buildAt.wall }))
}
/** Siege refuses a wall here (you attack, or it's by the dome): refused in the browser, as the server would. */
function siegeBlocks(x: number, z: number): boolean {
    const siege = match?.phase === 'playing' ? match.siege : null
    return Boolean(siege && me && siegeForbidsBuild(siege, teams.get(me) ?? null, x, z))
}
/** E in build mode: the wall under the crosshair, if it's yours and in reach, comes down. */
controls.onUnbuild = () => {
    const body = prediction.body
    if (!body || !self?.alive || socket?.readyState !== WebSocket.OPEN) return
    const hit = rayHit(world, eyeOf(body), aimNow(body), BUILD.reach)
    if (hit?.wall && hit.wall.by === me) socket.send(JSON.stringify({ type: 'unbuild', id: hit.wall.id }))
    else sounds.buildRefused()
}

/** Is this wall yours, or your side's (team deathmatch)? */
function ours(wall: Wall): boolean {
    if (!me) return false
    return wall.by === me || (wall.team !== null && wall.team === (teams.get(me) ?? null))
}
/** The built wall under the crosshair within `reach`, if it's yours or your side's (null: none). */
function oursUnderCrosshair(reach: number): Wall | null {
    const body = prediction.body
    if (!body || !self?.alive) return null
    const wall = rayHit(world, eyeOf(body), aimNow(body), reach)?.wall ?? null
    return wall && ours(wall) ? wall : null
}
/**
 * The door of your side's that F works: the one under the crosshair, else the nearest within
 * reach, aimed at or not (an open door leaves little to aim at but its frame).
 */
function doorNear(): Wall | null {
    const body = prediction.body
    if (!body || !self?.alive) return null
    const aimed = oursUnderCrosshair(BUILD.doorReach)
    if (aimed?.kind === 'door') return aimed
    const eye = eyeOf(body)
    let best: Wall | null = null
    let nearest: number = BUILD.doorReach
    for (const wall of world.walls.all) {
        if (wall.kind !== 'door' || !ours(wall)) continue
        const gap = Math.hypot(
            eye.x - Math.max(wall.minX, Math.min(wall.maxX, eye.x)),
            eye.y - Math.max(wall.minY, Math.min(wall.maxY, eye.y)),
            eye.z - Math.max(wall.minZ, Math.min(wall.maxZ, eye.z))
        )
        if (gap < nearest) [best, nearest] = [wall, gap]
    }
    return best
}
/** F: building and aimed at a plain standing wall of yours, it becomes a door; otherwise the door nearby opens or shuts. */
controls.onUse = () => {
    if (socket?.readyState !== WebSocket.OPEN) return
    const wall = controls.building ? oursUnderCrosshair(BUILD.reach) : null
    if (wall?.kind === 'wall' && wall.axis !== 'y') {
        return socket.send(JSON.stringify({ type: 'reshape', id: wall.id, kind: 'door' }))
    }
    const door = doorNear()
    if (door) socket.send(JSON.stringify({ type: 'door', id: door.id }))
    else if (controls.building) sounds.buildRefused()
}
/** G, building: a window cut into a plain standing wall of yours (for good). */
controls.onWindow = () => {
    if (socket?.readyState !== WebSocket.OPEN) return
    const wall = oursUnderCrosshair(BUILD.reach)
    if (wall?.kind === 'wall' && wall.axis !== 'y') {
        socket.send(JSON.stringify({ type: 'reshape', id: wall.id, kind: 'window' }))
    } else sounds.buildRefused()
}

/** Where you aim from your eyes: the crosshair's way (in third person, through the camera's crosshair, as your shots). */
function aimNow(body: NonNullable<typeof prediction.body>): Vector3 {
    const aim = thirdPerson ? aimThirdPerson(eyeOf(body)) : { yaw: controls.yaw, pitch: controls.pitch }
    return aimDirection(aim.yaw, aim.pitch)
}

function remembered(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
function rememberedLoadout(): Loadout {
    try {
        return parseLoadout(JSON.parse(remembered('officeFps.loadout') ?? 'null')) ?? DEFAULT_LOADOUT
    } catch {
        return DEFAULT_LOADOUT
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
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', playerId: config.playerId, loadout: picked }))
    ws.onmessage = event => {
        const text = event.data as string
        net.bytesIn += text.length
        receive(JSON.parse(text) as ServerMessage)
    }
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
            wasConnectedAlive = false
            reloadEndsAt = null
            match = message.match
            matchAt = now
            syncDome(match)
            world.walls.clear()
            for (const wall of message.walls ?? []) world.walls.add(wall)
            wallViews.sync(world.walls, now)
            hud.setMatch(message.match, now)
            hud.card(controls.locked ? 'playing' : 'paused')
            if (!viewmodel) {
                viewmodel = new Viewmodel(roster.get(me)?.color ?? '#ffd166')
                viewmodel.follow(camera)
                void viewmodel.prepare(renderer, camera).catch(() => {})
            }
            updateHost()
            return
        case 'roster':
            roster = new Map(message.players.map(p => [p.id, p]))
            updateHost()
            return
        case 'match': {
            const before = match?.phase
            const pointsBefore = match?.scores.find(s => s.id === me)?.points ?? 0
            const siegeBefore = before === 'playing' ? (match?.siege ?? null) : null
            match = message.match
            matchAt = now
            syncDome(match)
            siegeNews(siegeBefore, match)
            hud.setMatch(message.match, now)
            updateHost()
            if (before === 'countdown' && match.phase === 'playing') sounds.countdown(true)
            if (before === 'playing' && match.phase === 'intermission') sounds.result(iWon(match))
            // A second more in the zone: a soft tick (siege's points have their own event).
            const points = match.scores.find(s => s.id === me)?.points ?? 0
            if (match.phase === 'playing' && match.mode === 'koth' && points > pointsBefore) sounds.zoneTick()
            return
        }
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
            if (message.code === 'NOT_ENOUGH') hud.notice('Needs a second player.')
            if (message.code === 'NOT_HOST') hud.notice('Only the host can start a match.')
            return
    }
}

/** Who hosts (the longest seated), for the menu's Start and the warmup line. */
function updateHost(): void {
    const host = match?.host ?? null
    const seated = [...roster.values()].filter(p => !p.watching).length
    hud.setHost({ isHost: host !== null && host === me, name: host ? (roster.get(host)?.name ?? null) : null, seated })
}

/** Siege's dome from the match: in the world while it stands, so your prediction meets it as the server does. */
function syncDome(view: MatchView): void {
    world.dome = view.phase === 'playing' ? (view.siege?.dome ?? null) : null
}

/** Siege: a half starting (which side you're on, and where), or the dome opening, said on screen. */
function siegeNews(was: SiegeView | null, view: MatchView): void {
    const siege = view.phase === 'playing' ? view.siege : null
    const team = view.scores.find(s => s.id === me)?.team
    if (!siege || !team) return
    const spot = SIEGE_SPOTS[siege.spot]!.name.toUpperCase()
    const attacking = team === siege.attackers
    const color = TEAM_COLORS[team]
    if (!was || was.half !== siege.half) {
        const head = Math.round(SIEGE.headStartMs / 1000)
        const swapped = siege.half === 2 ? 'SIDES SWITCHED · ' : ''
        hud.toast(
            attacking
                ? `${swapped}ATTACK THE ${spot} · OUT IN ${head} s`
                : `${swapped}DEFEND THE ${spot} · ${head} s TO BUILD (B)`,
            color
        )
        sounds.zoneMoved()
    } else if (was.dome && !siege.dome) {
        hud.toast(attacking ? 'GO! TAKE THE SPOT' : 'HERE THEY COME', color)
        sounds.countdown(true)
    }
}

/** Did you (or your side) win the match that just ended? */
function iWon(view: MatchView): boolean {
    const mine = view.scores.find(s => s.id === me)?.team
    if (view.siege) return mine != null && siegeWinner(view.siege.points, view.siege.times) === mine
    if (view.mode === 'tdm' && view.teams) {
        const other = mine === 'red' ? 'blue' : 'red'
        return mine !== undefined && mine !== null && view.teams[mine] > view.teams[other]
    }
    return view.scores[0]?.id === me
}

function startMatch(rules: Rules): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'start', rules }))
}

function snapshot(snap: Extract<ServerMessage, { type: 'snap' }>, now: number): void {
    net.snaps++
    clock.heard(snap.step, now)
    measurePing(snap.ack)
    others.push(snap.step, snap.players)
    const wasReloading = self?.reloading ?? false
    self = snap.you
    hud.setSelf(self)
    if (self) {
        // The reload's end, on this clock (the ring and the animation run to it between snapshots).
        reloadEndsAt = self.reloadLeftMs === null ? null : now + self.reloadLeftMs
        if (self.reloading && !wasReloading && self.reloadLeftMs !== null) sounds.reload(self.reloadLeftMs)
        const spawned = self.alive && !wasAlive
        if (spawned && wasConnectedAlive) sounds.spawn()
        wasConnectedAlive = true
        const correction = prediction.reconcile(snap.ack, self.body, self.alive)
        const off = Math.hypot(correction.x, correction.y, correction.z)
        if (spawned || off > SNAP_DISTANCE) smoothing.set(0, 0, 0)
        else smoothing.add(new Vector3(correction.x, correction.y, correction.z))
        if (spawned) {
            const at = snap.players.find(p => p.id === me)
            if (at) controls.face(at.yaw)
            killer = null
            deathTaunt = null
            deathCause = null
        }
        wasAlive = self.alive
    }
    teams = new Map(snap.players.map(p => [p.id, p.team]))
    pickupsReady = snap.pickups
    rockets = snap.rockets
    rocketsAt = now
    // The launcher in hand loaded again: a click.
    const loaded = self?.weapon === 'launcher' && self.ammo > 0 && !self.reloading
    if (loaded && !launcherLoaded) sounds.rocketReady()
    launcherLoaded = self?.weapon !== 'launcher' || loaded
    // The zone moved on: two beeps and a word.
    if (snap.zone && zone && snap.zone.index !== zone.index) {
        sounds.zoneMoved()
        hud.toast(`ZONE MOVED: ${ZONES[snap.zone.index]!.name.toUpperCase()}`, '#ffffff')
    }
    zone = snap.zone
    zoneAt = now
    holds = snap.holds ?? []
    for (const event of snap.events) onEvent(event, now)
}

/** Someone's colour: their side's in team deathmatch, their own otherwise. */
function colorOf(id: string | null): string {
    if (!id) return '#ffffff'
    const team = teams.get(id)
    return team ? TEAM_COLORS[team] : (roster.get(id)?.color ?? '#ffffff')
}

function onEvent(event: GameEvent, now: number): void {
    const name = (id: string | null) => (id && roster.get(id)?.name) || '?'
    const colored = (id: string | null) => `<span style="color:${colorOf(id)}">${escape(name(id))}</span>`
    if (event.type === 'built') {
        world.walls.add(event.wall)
        wallViews.sync(world.walls, now)
        const { x, z } = event.wall
        sounds.build(event.wall.by === me ? undefined : spatial(listener(), { x, z }))
        return
    }
    if (event.type === 'wallChanged') {
        const before = world.walls.get(event.wall.id)
        world.walls.add(event.wall)
        wallViews.sync(world.walls, now)
        const where = spatial(listener(), event.wall)
        if (before?.kind === 'door' && before.open !== event.wall.open) sounds.door(event.wall.open, where)
        else if (before && before.kind !== event.wall.kind) sounds.build(where)
        // Otherwise its builder left: it stays as it was, nobody's (silently).
        return
    }
    if (event.type === 'wallHit') {
        const wall = world.walls.get(event.id)
        if (wall) wall.health = event.health
        wallViews.sync(world.walls, now)
        return
    }
    if (event.type === 'wallGone') {
        const wall = world.walls.remove(event.id)
        wallViews.sync(world.walls, now)
        if (wall && event.broken) {
            effects.burst(wall, wall.team ? TEAM_COLORS[wall.team] : '#9aa3ad', now)
            sounds.wallBreak(spatial(listener(), wall))
        }
        return
    }
    if (event.type === 'walls') {
        world.walls.clear()
        for (const wall of event.walls) world.walls.add(wall)
        wallViews.sync(world.walls, now)
        return
    }
    if (event.type === 'captured') {
        const spot = match?.siege ? SIEGE_SPOTS[match.siege.spot]!.name : 'the spot'
        hud.killFeed(
            `${colored(event.by)} <span style="opacity:.7">took the</span> <b>${escape(spot)}</b> <b style="color:${TEAM_COLORS[event.team]}">+1</b>`
        )
        if (event.by === me) {
            hud.toast('+1 POINT · BACK TO THE DOME', TEAM_COLORS[event.team])
            sounds.zoneMoved()
        } else sounds.zoneTick()
        return
    }
    if (event.type === 'switched') {
        const role = match?.siege ? (event.team === match.siege.attackers ? 'attack' : 'defend') : null
        hud.killFeed(
            `${colored(event.id)} <span style="opacity:.7">moved to</span> <b style="color:${TEAM_COLORS[event.team]}">${event.team}</b>${role ? ` <span style="opacity:.7">to ${role}</span>` : ''}`
        )
        if (event.id === me) {
            hud.toast(`TEAMS REBALANCED · YOU NOW ${role === 'attack' ? 'ATTACK' : 'DEFEND'}`, TEAM_COLORS[event.team])
            sounds.zoneMoved()
        }
        return
    }
    if (event.type === 'pickup') {
        const spot = PICKUP_SPOTS[event.spot]
        if (!spot) return
        const { kind } = event
        hud.killFeed(
            `${colored(event.by)} <span style="opacity:.7">grabbed</span> <b style="color:${PICKUP_COLORS[kind]}">${PICKUPS[kind].name}</b> <span style="opacity:.6">in ${spot.room}</span>`
        )
        if (event.by === me) {
            hud.toast(PICKUP_TOASTS[kind], PICKUP_COLORS[kind])
            sounds.pickup(kind)
        }
        return
    }
    if (event.type === 'shot') {
        if (event.hit && event.damage > 0) avatars.hit(event.hit, now, event.from, event.headshot)
        // Where each round stopped on the office (yours too: the server's word on where it went).
        const eyes = new Vector3(...event.from)
        for (const to of event.to) landed(eyes, new Vector3(...to), now)
        if (event.by === me) {
            // Drawn already when fired; the server says whether it hit, and for how much.
            if (event.hit) {
                if (event.damage > 0) hud.hitMarker(event.headshot)
                if (event.damage > 0 && event.headshot) {
                    hud.headshot('dealt')
                    sounds.headshot()
                } else if (event.damage > 0) {
                    sounds.hit()
                }
                const struck = avatars.centerOf(event.hit)
                const at = toScreen(struck ? new Vector3(struck.x, struck.y, struck.z) : new Vector3(...event.to[0]!))
                if (at) hud.damageNumber(event.damage, event.headshot, at.x, at.y)
            }
            return
        }
        const color = parseInt((roster.get(event.by)?.color ?? '#ffffff').slice(1), 16)
        const style = event.weapon === 'sniper' ? SNIPER_TRACER : {}
        // Judged from their eyes, drawn from their gun's muzzle (the eyes while they aren't drawn).
        const from = avatars.muzzleOf(event.by) ?? new Vector3(...event.from)
        for (const to of event.to) effects.tracer(from, new Vector3(...to), color, now, event.hit !== null, style)
        avatars.fire(event.by, event.weapon, now)
        sounds.otherShot(event.weapon, spatial(listener(), { x: event.from[0], z: event.from[2] }))
        // Hit: which way it came from, and how hard.
        if (event.hit === me && event.damage > 0) {
            hud.damageFrom(bearingTo(event.from))
            if (event.headshot) {
                hud.headshot('taken')
                sounds.headshotTaken()
            } else {
                sounds.hurt()
            }
        }
    }
    if (event.type === 'launch') {
        // Yours was heard (and kicked) when fired.
        if (event.by !== me) {
            avatars.fire(event.by, 'launcher', now)
            sounds.otherShot('launcher', spatial(listener(), { x: event.from[0], z: event.from[2] }))
        }
        return
    }
    if (event.type === 'explode') {
        const at = { x: event.at[0], y: event.at[1], z: event.at[2] }
        effects.explosion(at, now)
        scorched(new Vector3(at.x, at.y, at.z), now)
        sounds.explosion(spatial(listener(), at))
        for (const hit of event.hits) {
            avatars.hit(hit.id, now, event.at, false, true)
            if (hit.id === me && event.by !== me) {
                hud.damageFrom(bearingTo(event.at))
                sounds.hurt()
            }
            if (event.by === me && hit.id !== me) {
                hud.hitMarker(false)
                sounds.hit()
                const struck = avatars.centerOf(hit.id)
                const on = struck ? toScreen(new Vector3(struck.x, struck.y, struck.z)) : null
                if (on) hud.damageNumber(hit.damage, false, on.x, on.y)
            }
        }
        return
    }
    if (event.type === 'swing') {
        if (event.hit && event.damage > 0) {
            const by = avatars.centerOf(event.by)
            avatars.hit(event.hit, now, by ? [by.x, by.y, by.z] : null)
        }
        if (event.by === me) {
            // The chop was drawn when swung; the server says what it hit.
            const struck = event.hit ? avatars.centerOf(event.hit) : null
            if (event.hit && event.damage > 0) {
                hud.hitMarker(event.backstab)
                sounds.swingHit(event.backstab)
            }
            const at = struck ? toScreen(new Vector3(struck.x, struck.y, struck.z)) : null
            if (event.hit && at) hud.damageNumber(event.damage, event.backstab, at.x, at.y)
            return
        }
        avatars.swing(event.by, now)
        const from = avatars.centerOf(event.by)
        if (from) sounds.swing(spatial(listener(), from))
        if (event.hit === me && event.damage > 0) {
            if (from) hud.damageFrom(bearingTo([from.x, from.y, from.z]))
            sounds.hurt()
        }
    }
    if (event.type === 'kill') {
        const icon =
            event.weapon === 'stapler'
                ? event.backstab
                    ? '📎 from behind'
                    : '📎'
                : `${WEAPON_NAMES[event.weapon]}${event.headshot ? ' ⌖' : ''}`
        const how = `<span style="opacity:.7">[${icon}]</span>`
        hud.killFeed(
            event.killer === null
                ? `${colored(event.victim)} <span style="opacity:.7">blew themselves up</span>`
                : `${colored(event.killer)} ${how} ${colored(event.victim)}`
        )
        // Still drawn where they fell (they disappear on the next frame).
        const fell = avatars.centerOf(event.victim)
        if (fell) effects.burst(fell, colorOf(event.victim), now)
        if (event.victim === me) {
            killer = event.killer ? name(event.killer) : null
            deathTaunt = event.killer && event.killer !== me ? taunt(event, Math.random) : null
            const { weapon, headshot, backstab, recap } = event
            deathCause = { weapon, headshot, backstab, recap }
        }
        if (event.killer === me && event.victim !== me) {
            hud.hitMarker(event.headshot, true)
            hud.eliminated(name(event.victim))
            sounds.kill()
        }
        // Streaks, shutdowns, first blood: lines for everyone, a banner for whoever did it.
        const said = announce(event, me, id => escape(name(id)))
        for (const line of said.feed) hud.killFeed(`<span style="color:#ffd166">${line}</span>`)
        if (said.banner) {
            hud.callout(said.banner.title, said.banner.sub, said.banner.level)
            sounds.callout(said.banner.level)
        }
    }
}

const PICKUP_TOASTS: Record<PickupKind, string> = {
    health: '+50 HEALTH',
    magazine: 'BIG MAGAZINE: 18 ROUNDS FOR 60 s',
    jetpack: 'JETPACK ×4 FOR 60 s',
    headshot: 'ONE-SHOT HEADSHOTS FOR 30 s',
    overtime: 'OVERTIME: 200 HEALTH, NO RELOADS, GROUNDED, 30 s',
    promotion: 'PROMOTION: 3× BIGGER, 500 HEALTH, 20 s',
    firewall: 'FIREWALL: SOAKS 75 DAMAGE',
    espresso: 'ESPRESSO: FASTER, QUICKER DODGE, 20 s',
    intern: 'INTERN: HALF SIZE, 60 HEALTH, 30 s',
    bonus: 'BONUS: DOUBLE DAMAGE FOR 15 s',
    orgchart: 'ORG CHART: SEE EVERYONE THROUGH WALLS, 15 s',
}

/** A point in the world on screen (px), or null when it's behind the camera. */
function toScreen(point: Vector3): { x: number; y: number } | null {
    const p = point.clone().project(camera)
    if (p.z > 1) return null
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }
}

/** Where you hear from: your body (or the camera, watching) and where you look. */
function listener(): { x: number; z: number; yaw: number } {
    const body = prediction.body
    const at = body ?? camera.position
    return { x: at.x, z: at.z, yaw: controls.yaw }
}

/** Which way a point is from where you look: radians, 0 ahead, π/2 to your right. */
function bearingTo([x, , z]: [number, number, number]): number {
    const body = prediction.body
    if (!body) return 0
    const dx = x - body.x
    const dz = z - body.z
    const yaw = controls.yaw
    // Ahead is (-sin yaw, -cos yaw), right is (cos yaw, -sin yaw).
    const ahead = -dx * Math.sin(yaw) - dz * Math.cos(yaw)
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw)
    return Math.atan2(right, ahead)
}

// --- The loop ---------------------------------------------------------------------------------
let last = performance.now()
let pending = 0

/**
 * Compiles every shader the world can need before the first frame, so nothing stalls the first
 * time it shows (on Windows a compile is 50–200 ms): a shot, a kill, a blast and a rocket are set
 * off under the floor (gone in a second), and everything hidden (the stand-in trooper and pickups,
 * flashes, shields, halos) is shown for the compile. Nothing is drawn meanwhile. Shaders stay
 * compiled while a material using them is alive: the stand-ins keep them.
 */
let warming = true
async function warmShaders(): Promise<void> {
    const now = performance.now()
    const below = new Vector3(0, -50, 0)
    effects.tracer(below, new Vector3(0, -50, 1), 0xffffff, now, true)
    effects.tracer(below, new Vector3(0, -50, 1), 0xffffff, now, false, SNIPER_TRACER)
    effects.burst(below, '#ffffff', now)
    effects.explosion(below, now)
    effects.rockets([{ id: -1, by: '', x: 0, y: -50, z: 0, vx: 0, vy: 1, vz: 0 }], now)
    impacts.hit(below, new Vector3(0, 1, 0), new Vector3(0, -1, 0), 'metal', now)
    impacts.hit(below, new Vector3(0, 1, 0), new Vector3(0, -1, 0), 'glass', now)
    impacts.blast(below, new Vector3(0, 1, 0), new Vector3(0, -1, 0), 'desk', now)
    const shown: Object3D[] = []
    scene.traverse(o => {
        if (!o.visible) {
            o.visible = true
            shown.push(o)
        }
    })
    try {
        await renderer.compileAsync(scene, camera)
        // Textures too: each one goes to the GPU the first time it's drawn, otherwise.
        scene.traverse(o => {
            const material = (o as Object3D & { material?: Material | Material[] }).material
            for (const m of [material ?? []].flat()) {
                for (const value of Object.values(m)) if (value instanceof Texture) renderer.initTexture(value)
            }
        })
    } finally {
        for (const o of shown) o.visible = false
        effects.rockets([], now)
        warming = false
    }
}
void warmShaders().catch(() => (warming = false))

function frame(now: number): void {
    if (warming) {
        last = now
        requestAnimationFrame(frame)
        return
    }
    const started = performance.now()
    const programsBefore = renderer.info.programs?.length ?? 0
    renderer.info.reset()
    pending = Math.min(pending + (now - last), STEP_MS * 10)
    last = now
    while (pending >= STEP_MS) {
        pending -= STEP_MS
        step(now)
    }
    cpu.sim = performance.now() - started
    draw(now)
    countFrame(now)
    perf.stats.record(now, cpu, (renderer.info.programs?.length ?? 0) > programsBefore)
    perf.show(now, gpuTimer.ms, gpuTimer.available, perfExtras)
    requestAnimationFrame(frame)
}

/** This frame's CPU time per section (ms), for the overlay. */
const cpu: Record<Section, number> = { sim: 0, scene: 0, hud: 0, render: 0 }

/** The Resolution setting: a share of the full pixel ratio (the canvas stays the window's size). */
function applyResolution(): void {
    renderer.setPixelRatio(FULL_PIXEL_RATIO * settings.resolution)
    renderer.setSize(innerWidth, innerHeight)
}

/** The graphics card the browser draws with (when it says). */
function gpuNameOf(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
    try {
        const info = gl.getExtension('WEBGL_debug_renderer_info')
        return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    } catch {
        return 'unknown'
    }
}

/** What came and went since the overlay last asked. */
const net = { bytesIn: 0, snaps: 0, framesOut: 0, since: performance.now() }

function perfExtras(): PerfExtras {
    const now = performance.now()
    const seconds = Math.max(0.001, (now - net.since) / 1000)
    const extras: PerfExtras = {
        draw: {
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            programs: renderer.info.programs?.length ?? 0,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
        },
        screen: {
            width: innerWidth,
            height: innerHeight,
            pixelRatio: renderer.getPixelRatio(),
            antialias: Boolean(renderer.getContext().getContextAttributes()?.antialias),
        },
        gpuName,
        net: {
            pingMs,
            snapsPerSecond: net.snaps / seconds,
            kbInPerSecond: net.bytesIn / 1024 / seconds,
            framesOutPerSecond: net.framesOut / seconds,
        },
        mouse: {
            raw: controls.rawInput,
            spikes: controls.mouse.spikes,
            largestSpike: controls.mouse.largestSpike,
            biggestMove: controls.mouse.takePeak(),
        },
    }
    Object.assign(net, { bytesIn: 0, snaps: 0, framesOut: 0, since: now })
    return extras
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
        slot: controls.slot,
    }
    // Space burns the jetpack only in the air, past a jump's top (Overtime and prone: never).
    jetting = body ? jetBurns(body, moveOf(input)) : false
    const before = prediction.body
    prediction.apply(input, self.alive)
    outbox.push(input)
    if (outbox.length >= SEND_EVERY) flush()
    // A dodge that went off (the body just started one), and the jetpack's rumble while it burns.
    const after = prediction.body
    if (self.alive && after?.dashLeft === MOVE.dashSteps) sounds.dash()
    // A jump pad threw you (nothing else kicks you up that hard from the floor), or a portal took you.
    if (self.alive && before?.onGround && after && after.vy - before.vy > 4) sounds.pad()
    if (self.alive && after?.portalCooldown === PORTAL.cooldownSteps) sounds.portal()
    // A jump, and going prone or getting up.
    if (self.alive && after?.jumped && !before?.jumped) sounds.jump()
    if (self.alive && after && before && after.prone !== before.prone) sounds.prone(after.prone)
    sounds.jetting(jetting && self.alive && controls.locked)

    // A new weapon in hand: like the server, it can't be used for a moment.
    const wanted = weaponIn(controls.slot, self.loadout)
    if (wanted !== held) {
        held = wanted
        readyAt = now + SWITCH_MS
        viewmodel?.hold(held, now)
    }
    // As the server does: a click waits for the gun until it's used or let go.
    const holding = Boolean(input.buttons & BUTTON.fire) && self.alive
    if (holding && !wasFiring) clicked = true
    if (!holding) clicked = false
    wasFiring = holding
    const ready = self.alive && now >= readyAt
    // Your own shot or swing shows (and sounds) at once: the server's answer only says what it hit.
    // The rounds are the server's: only fire here once it has the same gun in hand.
    if (ready && held !== 'stapler' && self.weapon === held) {
        const auto = held !== 'launcher' && GUNS[held].auto
        const trigger = auto ? holding : clicked
        const canFire = !self.reloading && self.ammo > 0 && now >= nextLocalShot
        if (trigger && canFire) {
            clicked = false
            nextLocalShot = now + (held === 'launcher' ? LAUNCHER.intervalMs : GUNS[held].intervalMs)
            fireLocally(held, input, now)
        } else if (trigger && clicked && (self.reloading || self.ammo === 0)) {
            clicked = false
            sounds.empty()
        }
    }
    if (ready && holding && held === 'stapler' && now >= nextLocalSwing) {
        nextLocalSwing = now + STAPLER.intervalMs
        viewmodel?.swing(now)
        if (me) avatars.swing(me, now)
        sounds.swing()
    }
}

/**
 * Your shot, drawn now: every pellet where the server will put it (the spread is seeded by the
 * frame), from the muzzle. A rocket is the server's to draw; here it only kicks and sounds.
 */
function fireLocally(gun: Gun, input: InputFrame, now: number): void {
    viewmodel?.fire(now)
    // Your trooper too (seen in third person).
    if (me) avatars.fire(me, gun, now)
    sounds.shot(gun)
    if (gun === 'launcher') return
    const spec = GUNS[gun]
    const body = prediction.body!
    const eye = eyeOf(body)
    const aim = aimDirection(input.yaw, input.pitch)
    const cone = spreadOf(spec, Boolean(input.buttons & BUTTON.aim), body)
    // From the gun in your hands; in third person, your trooper's.
    const from = viewmodel && !thirdPerson ? viewmodel.muzzleIn() : ((me ? avatars.muzzleOf(me) : null) ?? eye)
    for (let pellet = 0; pellet < spec.pellets; pellet++) {
        const direction = spreadDirection(aim, cone, input.seq, pellet)
        const end = eye.clone().addScaledVector(direction, rayDistance(world, eye, direction, spec.range))
        effects.tracer(from, end, 0xffd080, now, false, gun === 'sniper' ? SNIPER_TRACER : {})
    }
}

/** In third person the camera isn't at your eyes: aim them at what the crosshair is on. */
function aimThirdPerson(eye: Vector3): { yaw: number; pitch: number } {
    const { yaw, pitch } = controls
    const scale = prediction.body ? scaleOf(prediction.body) : 1
    return aimFromCamera(world, eye, thirdPersonCamera(world, eye, yaw, pitch, scale), yaw, pitch)
}

function flush(): void {
    if (outbox.length === 0 || socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'input', frames: outbox.map(encodeFrame) }))
    net.framesOut += outbox.length
    sentAt.push({ seq: outbox.at(-1)!.seq, at: performance.now() })
    if (sentAt.length > 240) sentAt.shift()
    outbox = []
}

// --- Ping and frame rate (top left) --------------------------------------------------------------
/** Frames sent and when, until a snapshot acknowledges them: the round trip is the ping. */
const sentAt: Array<{ seq: number; at: number }> = []
let pingMs: number | null = null
let framesCounted = 0
let countedSince = performance.now()

/** A snapshot acknowledged frames up to `ack`: the newest of them gives the round trip (smoothed). */
function measurePing(ack: number): void {
    let newest: number | null = null
    while (sentAt.length > 0 && sentAt[0]!.seq <= ack) newest = sentAt.shift()!.at
    if (newest === null) return
    const rtt = performance.now() - newest
    pingMs = pingMs === null ? rtt : pingMs + (rtt - pingMs) * 0.2
}

/** Counts a drawn frame; twice a second, shows the rate and the ping. */
function countFrame(now: number): void {
    framesCounted++
    if (now - countedSince < 500) return
    hud.stats((framesCounted * 1000) / (now - countedSince), pingMs)
    framesCounted = 0
    countedSince = now
}

// A hidden tab sends nothing, and the server would keep you moving on your last keys: stop first.
addEventListener('blur', () => sendIdle())
document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendIdle()
})
function sendIdle(): void {
    if (!me || !self) return
    const { yaw, pitch } = controls
    outbox.push({ seq: ++seq, forward: 0, strafe: 0, yaw, pitch, buttons: 0, view: 0, slot: controls.slot })
    flush()
}

let lastDraw = performance.now()
/** 0 at the hip … 1 aiming, eased. */
let aimBlend = 0
/** Your eyes' height above your feet as drawn: eased to the real one as you go prone or get up. */
let eyeHeight: number | null = null
/** The crosshair's cone on the screen (px from the middle), eased; null: no gun cone. */
let spreadPx: number | null = null

function draw(now: number): void {
    const started = performance.now()
    const dt = Math.min(0.1, (now - lastDraw) / 1000)
    lastDraw = now
    smoothing.multiplyScalar(Math.exp(-12 * dt))

    const body = prediction.body
    office.ceiling.visible = Boolean(self)
    const third = thirdPerson && Boolean(self?.alive)
    if (self && body) {
        // Your eyes at your size (high on a Promotion, low as an Intern, near the floor prone, eased
        // down and up); the third-person camera keeps its distance in proportion.
        const height = eyeOf(body).y - body.y
        eyeHeight = eyeHeight === null ? height : eyeHeight + (height - eyeHeight) * Math.min(1, dt * 12)
        const eye = new Vector3(body.x, body.y + eyeHeight, body.z).add(smoothing)
        const behind = thirdPersonCamera(world, eye, controls.yaw, controls.pitch, scaleOf(body))
        camera.position.copy(third ? behind : eye)
        camera.rotation.set(self.alive ? controls.pitch : -0.5, controls.yaw, 0)
        if (!self.alive) camera.position.y += 0.4
    } else if (me) {
        // Watching: the dollhouse view, turning slowly.
        const a = now * 0.00005
        camera.position.set(Math.sin(a) * 14, 16, Math.cos(a) * 9)
        camera.lookAt(0, 0, 0)
    }
    // Aiming (right mouse, a gun): the view zooms in (as far as the gun's sights go; the sniper's
    // scope much further), the mouse slows to match (times your aiming sensitivity), the gun
    // centres on its sights.
    const aimingNow = controls.aiming && Boolean(self?.alive) && held !== 'stapler'
    aimBlend += ((aimingNow ? 1 : 0) - aimBlend) * Math.min(1, dt * (held === 'sniper' ? 10 : 14))
    const hipFov = settings.fov
    const gunFov = held === 'stapler' ? null : held === 'launcher' ? LAUNCHER.aimFov : GUNS[held].aimFov
    const fov = hipFov + (Math.min(hipFov, gunFov ?? aimFov(hipFov)) - hipFov) * aimBlend
    // The sniper's scope: once it's up, the scope's ring instead of the rifle.
    const scoped = held === 'sniper' && aimBlend > 0.85 && !third
    hud.scope(scoped)
    if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
    }
    const aimedSensitivity = 1 + (settings.aimSensitivity - 1) * aimBlend
    controls.sensitivityScale = settings.sensitivity * (fov / hipFov) * aimedSensitivity
    hud.aiming = aimingNow
    // The crosshair's ticks on the hip-fire cone (wider moving, wider still in the air), eased.
    const cone =
        self?.alive && body && held !== 'stapler' && held !== 'launcher' ? spreadOf(GUNS[held], false, body) : null
    if (cone === null) spreadPx = null
    else {
        const target = (Math.tan(cone) / Math.tan((camera.fov * Math.PI) / 360)) * (innerHeight / 2)
        spreadPx = spreadPx === null ? target : spreadPx + (target - spreadPx) * Math.min(1, dt * 14)
    }
    hud.spread(spreadPx)
    // A reload: the ring by the crosshair and the gun's animation, run to its end between snapshots.
    const reloading = Boolean(
        self?.alive && self.reloading && held !== 'stapler' && self.weapon === held && reloadEndsAt !== null
    )
    const reload =
        reloading && held !== 'stapler' ? reloadProgress(Math.max(0, reloadEndsAt! - now), reloadMsOf(held)) : null
    // Building, the ring is the wall's: filling until the next can go up.
    const building = controls.building && Boolean(self?.alive) && body !== null && match?.phase !== 'intermission'
    const buildRing = building && now < nextBuildAt ? reloadProgress(nextBuildAt - now, BUILD_COOLDOWN_MS) : null
    hud.reload(building ? buildRing : reload)
    // Build mode: the gun put away, the ghost where the next wall goes, its line on the HUD.
    buildAt = building && body ? buildSlot(world, eyeOf(body), aimNow(body), controls.stance) : null
    const refused =
        buildAt !== null && (buildAt.taken || !buildAt.supported || siegeBlocks(buildAt.wall.x, buildAt.wall.z))
    wallViews.showGhost(buildAt?.wall ?? null, refused)
    wallViews.update(now)
    hud.building(building ? controls.stance : null)
    // A door of yours within reach: F, said under the crosshair.
    const door = doorNear()
    hud.prompt(door ? (door.open ? 'Close door' : 'Open door') : null)
    if (viewmodel) {
        viewmodel.visible = Boolean(self?.alive) && !third && !scoped && !building
        viewmodel.loaded = held === 'launcher' && Boolean(self && self.ammo > 0 && !self.reloading)
        const moving = Boolean(body && body.onGround && Math.hypot(body.vx, body.vz) > 0.5)
        viewmodel.update(now, moving, aimBlend, reload)
    }

    // The countdown's last three seconds tick.
    if (match?.phase === 'countdown' && match.remainingMs !== null) {
        const seconds = Math.ceil((match.remainingMs - (now - matchAt)) / 1000)
        if (seconds !== lastBeep && seconds >= 1 && seconds <= 3) sounds.countdown(false)
        lastBeep = seconds
    }

    const at = clock.renderStep(now)
    const poses = at === null ? new Map<string, Pose>() : others.sample(at)
    // In third person you see your own trooper, where you are now (not the server's past).
    if (third && me && self && body) {
        const where = { x: body.x + smoothing.x, y: body.y + smoothing.y, z: body.z + smoothing.z }
        const facing = { yaw: controls.yaw, pitch: controls.pitch }
        const state = {
            id: me,
            ...where,
            ...facing,
            alive: true,
            health: self.health,
            jet: jetting,
            shielded: self.shielded,
            weapon: held,
            aiming: aimingNow,
            prone: body.prone,
            reload,
            team: teams.get(me) ?? null,
            buffs: self.buffs.map(b => b.kind),
        }
        poses.set(me, { ...where, ...facing, state })
    }
    // The Org chart: everyone shows through the walls.
    const xray = Boolean(self?.alive && self.buffs.some(b => b.kind === 'orgchart'))
    avatars.update(poses, roster, third ? null : me, now, xray)
    effects.update(now)
    impacts.update(now, camera)
    // Rockets fly straight: from the last snapshot, ahead by their speed.
    const ahead = (now - rocketsAt) / 1000
    effects.rockets(
        rockets.map(r => ({ ...r, x: r.x + r.vx * ahead, y: r.y + r.vy * ahead, z: r.z + r.vz * ahead })),
        now
    )
    pickupViews.update(pickupsReady, now)
    padViews.update(now)
    portalViews.update(now)
    zoneView.update(zone, colorOf, zone !== null && zone.holder === me, now)
    const siege = match?.phase === 'playing' ? match.siege : null
    // Siege's spot: white, or the attackers' colour while one of them stands in it.
    const holder = holds.some(h => h.id === me) ? me : (holds[0]?.id ?? null)
    spotView.update(
        siege ? { index: siege.spot, holder, contested: false, movesInMs: 0 } : null,
        colorOf,
        holder !== null && holder === me,
        now
    )
    domeView.update(world.dome ?? null, siege ? TEAM_COLORS[siege.attackers] : '#ffffff', now)
    const sceneDone = performance.now()
    cpu.scene = sceneDone - started
    showZone(now)
    showTarget(poses)
    hud.update(now, { me, self, killer, taunt: deathTaunt, cause: deathCause, tab: controls.scoreboardHeld, roster })
    const hudDone = performance.now()
    cpu.hud = hudDone - sceneDone
    if (perf.visible) gpuTimer.begin()
    renderer.render(scene, camera)
    viewmodel?.render(renderer, camera)
    if (perf.visible) gpuTimer.end()
    cpu.render = performance.now() - hudDone
}

/** King of the meeting room: who holds the zone, and a marker pointing at it (kept on screen). Siege: the spot. */
function showZone(now: number): void {
    if (match?.phase === 'playing' && match.siege && self?.alive) return showSpot(match.siege, now)
    if (!zone || match?.phase !== 'playing' || !self?.alive) return hud.zone(null, null)
    const place = ZONES[zone.index]!
    const holder = zone.holder
    const status = zone.contested
        ? { text: 'ZONE CONTESTED', color: '#ff9f1c' }
        : holder === me
          ? { text: 'HOLDING THE ZONE', color: '#3ddc84' }
          : holder
            ? { text: `${roster.get(holder)?.name ?? '?'} HOLDS THE ZONE`, color: colorOf(holder) }
            : { text: 'TAKE THE ZONE', color: '#ffffff' }
    const moves = Math.max(0, Math.ceil((zone.movesInMs - (now - zoneAt)) / 1000))
    pointAt(place, status, `moves in ${moves} s`, zone.contested ? '#ff9f1c' : holder ? colorOf(holder) : '#ffffff')
}

/**
 * Siege: what your side is doing (waiting in the dome, building, taking or holding the spot, how
 * far through your stay you are) and a marker on the spot.
 */
function showSpot(siege: SiegeView, now: number): void {
    const spot = SIEGE_SPOTS[siege.spot]!
    const attacking = teams.get(me ?? '') === siege.attackers
    const left = Math.max(0, Math.ceil(((match?.remainingMs ?? 0) - (now - matchAt)) / 1000))
    const mine = holds.find(h => h.id === me)
    const theirs = holds.length
    const status = siege.dome
        ? attacking
            ? { text: `IN THE DOME · OUT IN ${left} s`, color: '#ffffff' }
            : { text: `BUILD! (B) · THEY'RE OUT IN ${left} s`, color: '#ffd166' }
        : attacking
          ? mine
              ? { text: `HOLD IT · ${Math.min(99, Math.floor((mine.ms / SIEGE.holdMs) * 100))}%`, color: '#3ddc84' }
              : { text: `TAKE THE ${spot.name.toUpperCase()}`, color: '#ffffff' }
          : theirs > 0
            ? { text: `${theirs} IN THE SPOT!`, color: '#ff5d5d' }
            : { text: `DEFEND THE ${spot.name.toUpperCase()}`, color: '#ffffff' }
    pointAt(spot, status, attacking ? 'take it' : 'defend it', TEAM_COLORS[siege.attackers])
}

/** The zone line, and a marker on `place` (kept on screen, flipped when it's behind you) with its name, distance and `note`. */
function pointAt(
    place: { name: string; x: number; z: number },
    status: { text: string; color: string },
    note: string,
    color: string
): void {
    camera.updateMatrixWorld()
    const centre = new Vector3(place.x, 1.0, place.z)
    const p = centre.clone().project(camera)
    // Behind you: flip it so the marker sits on the side you'd turn to.
    const behind = p.z > 1
    let x = behind ? -p.x : p.x
    let y = behind ? -p.y : p.y
    if (behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.85) {
        const scale = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, behind ? 1 : 0)
        x /= scale
        y /= scale
    }
    const body = prediction.body
    const metres = body ? Math.hypot(place.x - body.x, place.z - body.z) : 0
    hud.zone(status, {
        x: (x * 0.5 + 0.5) * innerWidth,
        y: (-y * 0.5 + 0.5) * innerHeight,
        label: `${place.name} · ${metres.toFixed(0)} m · ${note}`,
        color,
    })
}

/** The name and health of whoever the crosshair is on, over their head. */
function showTarget(poses: Map<string, Pose>): void {
    if (!self?.alive) return hud.target(null)
    camera.updateMatrixWorld()
    const look = camera.getWorldDirection(new Vector3())
    const candidates = [...poses.values()]
        .filter(p => p.state.id !== me)
        .map(p => ({ ...p, id: p.state.id, alive: p.state.alive, scale: scaleOf(powersOf(p.state.buffs)) }))
    const id = targetUnderCrosshair(world, camera.position, look, candidates)
    const pose = id ? poses.get(id) : undefined
    const powers = pose ? powersOf(pose.state.buffs) : null
    const top = pose && powers ? pose.y + PLAYER.height * scaleOf(powers) + 0.08 : 0
    const at = pose ? toScreen(new Vector3(pose.x, top, pose.z)) : null
    if (!id || !pose || !powers || !at) return hud.target(null)
    const info = roster.get(id)
    const buffs = pose.state.buffs.map(kind => BUFF_LABELS[kind].icon).join('')
    const label = `${info?.name ?? '?'}${buffs ? ` ${buffs}` : ''}`
    const who = { name: label, color: colorOf(id), health: pose.state.health, maxHealth: maxHealthOf(powers) }
    hud.target(who, at.x, at.y)
}
