import {
    ACESFilmicToneMapping,
    BoxGeometry,
    BufferGeometry,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    DirectionalLight,
    DoubleSide,
    GridHelper,
    Group,
    HemisphereLight,
    LineBasicMaterial,
    LineLoop,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    PerspectiveCamera,
    Plane,
    PlaneGeometry,
    PMREMGenerator,
    Scene,
    SphereGeometry,
    Vector3,
    WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { type Gun, WEAPON_NAMES, type Weapon } from '../protocol.ts'
import {
    damageAt,
    GUNS,
    HEAD_FROM,
    HIT_RADIUS,
    LAUNCHER,
    MAX_HEALTH,
    magazineOf,
    reloadMsOf,
    STAPLER,
} from '../sim/combat.ts'
import { PLAYER } from '../sim/movement.ts'
import { Effects } from './effects.ts'
import {
    aimHeight,
    aimPitch,
    coneOf,
    falloffCurve,
    gunMetrics,
    type Metric,
    meleeMetrics,
    roundsOf,
    type Situation,
} from './gun-debug.ts'
import { Sounds } from './sounds.ts'
import { Viewmodel } from './viewmodel.ts'

/**
 * The gun lab (`bun run fps:guns`): your gun in your hands, alone, to work on its model and its
 * animations without a game. Fire, reload, aim, scrub a reload frame by frame, slow time down,
 * or turn the gun round in your hands. Everything you set is kept in the URL's hash, so the page
 * reloading itself on every saved change (the server says when) puts you back where you were.
 */

const WEAPONS: Weapon[] = ['rifle', 'sniper', 'shotgun', 'pistol', 'launcher', 'stapler']
const EYE = new Vector3(0, 0.34, 0)

interface LabState {
    weapon: Weapon
    view: 'hands' | 'inspect'
    /** A reload held at this point (0–1), or null: running. */
    t: number | null
    aim: number
    speed: number
    loop: boolean
    moving: boolean
    color: string
    fov: number
    /** Inspecting: round the gun (radians), and how far (m). */
    yaw: number
    pitch: number
    distance: number
    /** The debug overlay: the cone, a target mini, where rounds land, the numbers. */
    debug: boolean
    /** Debugging: firing in the air, at a mini this far ahead (m), on their head or body. */
    air: boolean
    range: number
    at: 'head' | 'body'
}

const DEFAULTS: LabState = {
    weapon: 'rifle',
    view: 'hands',
    t: null,
    aim: 0,
    speed: 1,
    loop: false,
    moving: false,
    color: '#e4572e',
    fov: 78,
    yaw: 0.9,
    pitch: 0.25,
    distance: 0.55,
    debug: false,
    air: false,
    range: 6,
    at: 'body',
}

function readHash(): LabState {
    const p = new URLSearchParams(location.hash.slice(1))
    const num = (key: string, fallback: number) => {
        const v = Number(p.get(key))
        return p.has(key) && Number.isFinite(v) ? v : fallback
    }
    const weapon = p.get('gun') as Weapon
    return {
        weapon: WEAPONS.includes(weapon) ? weapon : DEFAULTS.weapon,
        view: p.get('view') === 'inspect' ? 'inspect' : 'hands',
        t: p.has('t') ? Math.max(0, Math.min(1, num('t', 0))) : null,
        aim: Math.max(0, Math.min(1, num('aim', DEFAULTS.aim))),
        speed: num('speed', DEFAULTS.speed),
        loop: p.get('loop') === '1',
        moving: p.get('moving') === '1',
        color: /^#[0-9a-f]{6}$/i.test(p.get('color') ?? '') ? p.get('color')! : DEFAULTS.color,
        fov: num('fov', DEFAULTS.fov),
        yaw: num('yaw', DEFAULTS.yaw),
        pitch: num('pitch', DEFAULTS.pitch),
        distance: num('distance', DEFAULTS.distance),
        debug: p.get('debug') === '1',
        air: p.get('air') === '1',
        range: Math.max(0.5, Math.min(40, num('range', DEFAULTS.range))),
        at: p.get('at') === 'head' ? 'head' : 'body',
    }
}

function writeHash(state: LabState): void {
    const p = new URLSearchParams()
    p.set('gun', state.weapon)
    p.set('view', state.view)
    if (state.t !== null) p.set('t', state.t.toFixed(3))
    if (state.aim) p.set('aim', state.aim.toFixed(2))
    if (state.speed !== 1) p.set('speed', String(state.speed))
    if (state.loop) p.set('loop', '1')
    if (state.moving) p.set('moving', '1')
    if (state.color !== DEFAULTS.color) p.set('color', state.color)
    if (state.fov !== DEFAULTS.fov) p.set('fov', String(state.fov))
    if (state.view === 'inspect') {
        p.set('yaw', state.yaw.toFixed(2))
        p.set('pitch', state.pitch.toFixed(2))
        p.set('distance', state.distance.toFixed(2))
    }
    if (state.debug) p.set('debug', '1')
    if (state.air) p.set('air', '1')
    if (state.range !== DEFAULTS.range) p.set('range', String(state.range))
    if (state.at !== DEFAULTS.at) p.set('at', state.at)
    history.replaceState(null, '', `#${p}`)
}

let state = readHash()

// --- The room ---------------------------------------------------------------------------------

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = ACESFilmicToneMapping
// Reset once a frame (frame()), so the stats count the world and the gun's own pass.
renderer.info.autoReset = false
document.body.append(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0xb9c2cc)
const pmrem = new PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.add(new HemisphereLight(0xf2f4f7, 0x8b8378, 1))
const sun = new DirectionalLight(0xffe8c8, 2.5)
sun.position.set(-3, 6, 2)
scene.add(sun)
const surface = (color: number) => new MeshStandardMaterial({ color, roughness: 0.85 })
const floor = new Mesh(new PlaneGeometry(40, 100), surface(0x6d7178))
floor.rotation.x = -Math.PI / 2
scene.add(floor)
const wall = new Mesh(new PlaneGeometry(40, 6), surface(0xd9d4ca))
wall.position.set(0, 3, -6)
scene.add(wall)
// Office bits at mini scale, to judge the gun against: desks, a chair's worth of blocks, a target.
for (const [w, h, d, x, z, color] of [
    [1.6, 0.75, 0.8, -1.2, -3.5, 0x9b7b5a],
    [1.6, 0.75, 0.8, 1.6, -4.2, 0x9b7b5a],
    [0.5, 0.45, 0.5, 0.4, -2.2, 0x3a4a6b],
    [0.12, 0.4, 0.12, -0.25, -1.6, 0xe4572e],
] as const) {
    const block = new Mesh(new BoxGeometry(w, h, d), surface(color))
    block.position.set(x, h / 2, z)
    scene.add(block)
}

const camera = new PerspectiveCamera(state.fov, innerWidth / innerHeight, 0.005, 200)
camera.rotation.order = 'YXZ'
scene.add(camera)
/** Inspecting, the gun sits here (where your eyes would be) and the camera circles it. */
const stand = new Object3D()
stand.position.copy(EYE)
scene.add(stand)

let viewmodel = new Viewmodel(state.color)
const effects = new Effects(scene)
const sounds = new Sounds()

// --- Debug: a target mini, a board behind it, where rounds land, the cone ------------------------

renderer.localClippingEnabled = true
const debugGroup = new Group()
scene.add(debugGroup)
/** The target: its hit capsule (what shots take) split at the head line, the mini's own body inside. */
const target = new Group()
debugGroup.add(target)
const headY = PLAYER.height * HEAD_FROM
const hitShape = new CapsuleGeometry(HIT_RADIUS, PLAYER.height - 2 * HIT_RADIUS, 8, 24)
const see = (color: number, clip: Plane) =>
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, clippingPlanes: [clip] })
for (const [color, clip] of [
    [0x4aa3ff, new Plane(new Vector3(0, -1, 0), headY)],
    [0xffc940, new Plane(new Vector3(0, 1, 0), -headY)],
] as const) {
    const part = new Mesh(hitShape, see(color, clip))
    part.position.y = PLAYER.height / 2
    target.add(part)
}
const core = new Mesh(new CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius, 8, 24), surface(0x2f3640))
core.position.y = PLAYER.height / 2
target.add(core)
/** A 2 m board of 10 cm squares across the target's middle, centred on the crosshair. */
const board = new GridHelper(2, 20, 0xffffff, 0xffffff)
board.rotation.x = Math.PI / 2
const boardMaterial = board.material as LineBasicMaterial
boardMaterial.transparent = true
boardMaterial.opacity = 0.3
debugGroup.add(board)
/** The cone shots land in, from the eyes (inspecting: from the eyes the camera is at in the hands). */
const cone = new Group()
const coneShape = new ConeGeometry(1, 1, 48, 1, true)
coneShape.translate(0, -0.5, 0)
coneShape.rotateX(Math.PI / 2)
cone.add(
    new Mesh(
        coneShape,
        new MeshBasicMaterial({
            color: 0xff4d6d,
            transparent: true,
            opacity: 0.12,
            side: DoubleSide,
            depthWrite: false,
        })
    )
)
const around = (i: number) => (i / 64) * Math.PI * 2
const rim = new BufferGeometry().setFromPoints(
    Array.from({ length: 64 }, (_, i) => new Vector3(Math.cos(around(i)), Math.sin(around(i)), -1))
)
cone.add(new LineLoop(rim, new LineBasicMaterial({ color: 0xff4d6d })))
cone.position.copy(EYE)
debugGroup.add(cone)
/** Where each round stopped: gold on the head, white on the body, red a miss. */
const impactShape = new SphereGeometry(0.006, 8, 6)
const impactLooks = {
    head: new MeshBasicMaterial({ color: 0xffc940 }),
    body: new MeshBasicMaterial({ color: 0xffffff }),
    miss: new MeshBasicMaterial({ color: 0xff3b3b }),
}
const impacts: Mesh[] = []
/** What the debug shots did since the last clear. */
let tally = { pulls: 0, rounds: 0, head: 0, body: 0, miss: 0, damage: 0, downAt: null as number | null }
/** The frame number each debug pull is seeded with (the game's input seq). */
let shotSeq = 0

function situation(): Situation {
    // The game's aim button is on or off: the slider counts as aimed from halfway.
    return { aiming: state.aim >= 0.5, moving: state.moving, air: state.air, distance: state.range, aimAt: state.at }
}

function clearShots(): void {
    for (const impact of impacts) debugGroup.remove(impact)
    impacts.length = 0
    tally = { pulls: 0, rounds: 0, head: 0, body: 0, miss: 0, damage: 0, downAt: null }
}

/** A pull in debug: every round where the server would send it, its tracer, where it stopped, the tally. */
function debugShot(gun: Gun): void {
    const rounds = roundsOf(gun, situation(), ++shotSeq)
    const from = state.view === 'hands' ? viewmodel.muzzleIn() : EYE.clone()
    const now = performance.now()
    tally.pulls++
    for (const round of rounds) {
        const end = EYE.clone().addScaledVector(round.direction, round.distance)
        const color = round.hit === 'head' ? 0xffc940 : round.hit ? 0xffffff : 0xff6a5a
        effects.tracer(from, end, color, now, round.hit !== null, { width: gun === 'sniper' ? 2 : 1 })
        const impact = new Mesh(impactShape, impactLooks[round.hit ?? 'miss'])
        impact.position.copy(end)
        debugGroup.add(impact)
        impacts.push(impact)
        if (impacts.length > 600) debugGroup.remove(impacts.shift()!)
        tally.rounds++
        tally[round.hit ?? 'miss']++
        if (round.hit) {
            const spec = gun === 'launcher' ? null : GUNS[gun]
            tally.damage += spec
                ? damageAt(spec, round.distance) * (round.hit === 'head' ? spec.headshot : 1)
                : LAUNCHER.damage
        }
    }
    if (tally.downAt === null && tally.damage >= MAX_HEALTH) tally.downAt = tally.pulls
}

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
})

// --- The gun ----------------------------------------------------------------------------------

/** Lab time (ms): slowed, or stopped, by the speed. */
let clock = 0
let ammo = magazineOf('rifle')
let reloadAt: number | null = null
let nextShot = 0
let triggerDown = false
let clicked = false
let lastFrame = performance.now()

function gunOf(weapon: Weapon): Gun | null {
    return weapon === 'stapler' ? null : weapon
}

function select(weapon: Weapon): void {
    if (weapon !== state.weapon) clearShots()
    state.weapon = weapon
    const gun = gunOf(weapon)
    if (gun) ammo = magazineOf(gun)
    reloadAt = null
    viewmodel.hold(weapon, clock)
    save()
}

function startReload(): void {
    const gun = gunOf(state.weapon)
    if (!gun || reloadAt !== null) return
    state.t = null
    reloadAt = clock
    sounds.reload(reloadMsOf(gun) / Math.max(0.05, state.speed))
    save()
}

function pull(): void {
    const gun = gunOf(state.weapon)
    if (!gun) {
        if (clock < nextShot) return
        nextShot = clock + STAPLER.intervalMs
        viewmodel.swing(clock)
        sounds.swing()
        return
    }
    if (reloadAt !== null || state.t !== null || clock < nextShot) return
    if (ammo <= 0) {
        sounds.empty()
        startReload()
        return
    }
    ammo--
    nextShot = clock + (gun === 'launcher' ? LAUNCHER.intervalMs : GUNS[gun].intervalMs)
    viewmodel.fire(clock)
    sounds.shot(gun)
    if (state.debug) debugShot(gun)
    else if (gun !== 'launcher' && state.view === 'hands') {
        const from = viewmodel.muzzleIn()
        const to = camera.getWorldDirection(new Vector3()).multiplyScalar(6).add(camera.position)
        effects.tracer(from, to, gun === 'sniper' ? 0xfff2c0 : 0xffd27a, performance.now(), false, {
            width: gun === 'sniper' ? 2.5 : 1,
        })
    }
}

// --- The panel --------------------------------------------------------------------------------

const style = document.createElement('style')
style.textContent = `
    body { margin: 0; overflow: hidden; background: #b9c2cc; font: 13px/1.4 system-ui, sans-serif; }
    canvas { display: block; }
    .lab { position: fixed; top: 12px; left: 12px; width: 268px; padding: 12px; border-radius: 10px;
        background: rgba(18, 20, 24, 0.86); color: #e8eaed; display: grid; gap: 10px; user-select: none;
        max-height: calc(100vh - 48px); overflow-y: auto; }
    .lab .debug { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid #3a3f47; }
    .lab .debug[hidden], .lab canvas[hidden] { display: none; }
    .lab .metrics { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; font-size: 12px;
        font-variant-numeric: tabular-nums; }
    .lab .metrics b { grid-column: 1 / -1; margin-top: 4px; color: #ff8a65; font-weight: 600; }
    .lab .metrics .k { color: #a9afb8; }
    .lab .metrics .k.sub { padding-left: 10px; }
    .lab .metrics .v { text-align: right; }
    .lab canvas { width: 244px; height: 72px; }
    .cone { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%;
        border: 1.5px solid rgba(255, 77, 109, 0.95); pointer-events: none; box-sizing: border-box; }
    .cone.melee { border-style: dashed; border-color: rgba(120, 220, 255, 0.9); }
    .cone span { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); white-space: nowrap;
        font: 11px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; }
    .dot { position: fixed; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%;
        background: #fff; box-shadow: 0 0 2px #000; pointer-events: none; }
    .lab h1 { margin: 0; font-size: 14px; font-weight: 650; }
    .lab .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .lab button { font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid #3a3f47;
        background: #262a31; color: inherit; cursor: pointer; }
    .lab button.on { background: #e4572e; border-color: #e4572e; color: #fff; }
    .lab label { display: flex; gap: 6px; align-items: center; }
    .lab input[type=range] { flex: 1; }
    .lab .stats { color: #a9afb8; font-variant-numeric: tabular-nums; }
    .lab kbd { padding: 0 4px; border: 1px solid #4a505a; border-radius: 4px; font-size: 11px; }
    .lab .help { color: #8a919b; font-size: 12px; }
    .lab .error { white-space: pre-wrap; color: #ff9a8a; }
`
document.head.append(style)
const panel = document.createElement('div')
panel.className = 'lab'
document.body.append(panel)
panel.innerHTML = `
    <h1>Gun lab</h1>
    <div class="row" data-weapons></div>
    <div class="row">
        <button data-act="fire">Fire</button>
        <button data-act="reload">Reload</button>
        <button data-act="view"></button>
    </div>
    <label>Reload <input type="range" min="0" max="1" step="0.001" data-scrub><span data-t></span></label>
    <div class="row"><button data-act="play">▶ Run</button><span class="help">drag to hold a frame</span></div>
    <label>Aim <input type="range" min="0" max="1" step="0.01" data-aim></label>
    <label>Speed <select data-speed>
        <option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option>
        <option value="0.1">⅒×</option><option value="0">paused</option>
    </select></label>
    <label>Field of view <input type="range" min="50" max="110" step="1" data-fov></label>
    <div class="row">
        <label><input type="checkbox" data-loop> Loop reloads</label>
        <label><input type="checkbox" data-moving> Walking</label>
    </div>
    <label>Colour <input type="color" data-color></label>
    <div class="stats" data-stats></div>
    <label><input type="checkbox" data-debug> <b>Debug mode</b></label>
    <div class="debug" data-debug-panel>
        <div class="row">
            <label><input type="checkbox" data-air> In the air</label>
            <label>Aim at <select data-at><option value="body">body</option><option value="head">head</option></select></label>
        </div>
        <label>Target <input type="range" min="0.5" max="40" step="0.5" data-range><span data-range-value></span></label>
        <div class="row"><button data-act="clear">Clear shots</button><span class="help">rounds leave from the eyes</span></div>
        <canvas width="488" height="144" data-falloff></canvas>
        <div class="metrics" data-metrics></div>
        <div class="metrics" data-live></div>
        <div class="metrics" data-tally></div>
    </div>
    <div class="help">
        <kbd>1</kbd>–<kbd>6</kbd> weapon · click or <kbd>Space</kbd> fire · <kbd>R</kbd> reload ·
        right-click aim · <kbd>V</kbd> inspect · <kbd>P</kbd> pause · <kbd>,</kbd> <kbd>.</kbd> step a held frame.
        Inspecting: drag to turn, wheel to zoom. Saving a file reloads the page.
    </div>
    <div class="error" data-error></div>
`
const $ = <T extends HTMLElement>(selector: string) => panel.querySelector(selector) as T
const weaponsRow = $('[data-weapons]')
for (const [i, weapon] of WEAPONS.entries()) {
    const button = document.createElement('button')
    button.textContent = `${i + 1} ${WEAPON_NAMES[weapon]}`
    button.dataset.weapon = weapon
    button.addEventListener('click', () => select(weapon))
    weaponsRow.append(button)
}
const scrub = $<HTMLInputElement>('[data-scrub]')
const aimInput = $<HTMLInputElement>('[data-aim]')
const speedInput = $<HTMLSelectElement>('[data-speed]')
const fovInput = $<HTMLInputElement>('[data-fov]')
const loopInput = $<HTMLInputElement>('[data-loop]')
const movingInput = $<HTMLInputElement>('[data-moving]')
const colorInput = $<HTMLInputElement>('[data-color]')
const debugInput = $<HTMLInputElement>('[data-debug]')
const debugPanel = $('[data-debug-panel]')
const airInput = $<HTMLInputElement>('[data-air]')
const atInput = $<HTMLSelectElement>('[data-at]')
const rangeInput = $<HTMLInputElement>('[data-range]')
const falloffCanvas = $<HTMLCanvasElement>('[data-falloff]')
/** The cone on the screen (hands view): a circle round the crosshair, and its dot. */
const coneRing = document.createElement('div')
coneRing.className = 'cone'
coneRing.append(document.createElement('span'))
const coneDot = document.createElement('div')
coneDot.className = 'dot'
document.body.append(coneRing, coneDot)

debugInput.addEventListener('change', () => ((state.debug = debugInput.checked), save()))
airInput.addEventListener('change', () => ((state.air = airInput.checked), save()))
atInput.addEventListener('change', () => ((state.at = atInput.value === 'head' ? 'head' : 'body'), save()))
rangeInput.addEventListener('input', () => ((state.range = Number(rangeInput.value)), save()))

scrub.addEventListener('input', () => {
    state.t = Number(scrub.value)
    reloadAt = null
    save()
})
aimInput.addEventListener('input', () => ((state.aim = Number(aimInput.value)), save()))
speedInput.addEventListener('change', () => ((state.speed = Number(speedInput.value)), save()))
fovInput.addEventListener('input', () => ((state.fov = Number(fovInput.value)), save()))
loopInput.addEventListener('change', () => ((state.loop = loopInput.checked), save()))
movingInput.addEventListener('change', () => ((state.moving = movingInput.checked), save()))
colorInput.addEventListener('change', () => {
    state.color = colorInput.value
    viewmodel = new Viewmodel(state.color)
    viewmodel.hold(state.weapon, -1e9)
    save()
})
panel.addEventListener('click', event => {
    const act = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    sounds.unlock()
    if (act === 'fire') pull()
    if (act === 'reload') startReload()
    if (act === 'view') toggleView()
    if (act === 'clear') clearShots()
    if (act === 'play') {
        state.t = null
        startReload()
    }
})

function toggleView(): void {
    state.view = state.view === 'hands' ? 'inspect' : 'hands'
    save()
}

function save(): void {
    writeHash(state)
    showPanel()
}

function showPanel(): void {
    for (const button of weaponsRow.querySelectorAll<HTMLElement>('button')) {
        button.classList.toggle('on', button.dataset.weapon === state.weapon)
    }
    $('[data-act="view"]').textContent = state.view === 'hands' ? 'Inspect (V)' : 'In hands (V)'
    aimInput.value = String(state.aim)
    speedInput.value = String(state.speed)
    fovInput.value = String(state.fov)
    loopInput.checked = state.loop
    movingInput.checked = state.moving
    colorInput.value = state.color
    debugInput.checked = state.debug
    debugPanel.hidden = !state.debug
    airInput.checked = state.air
    atInput.value = state.at
    rangeInput.value = String(state.range)
    $('[data-range-value]').textContent = `${state.range} m`
}

function showStats(progress: number | null): void {
    const gun = gunOf(state.weapon)
    scrub.value = String(progress ?? 0)
    $('[data-t]').textContent = progress === null ? '—' : progress.toFixed(3)
    if (!gun) {
        const damage = `${STAPLER.damage} damage (${STAPLER.backstab} from behind)`
        $('[data-stats]').textContent = `Stapler · ${damage} · a swing every ${STAPLER.intervalMs} ms`
        return
    }
    const spec = gun === 'launcher' ? null : GUNS[gun]
    const lines = spec
        ? `${spec.damage}${spec.pellets > 1 ? ` × ${spec.pellets}` : ''} damage · ${spec.intervalMs} ms a shot`
        : `${LAUNCHER.damage} blast damage · ${LAUNCHER.intervalMs} ms a shot`
    $('[data-stats]').textContent = `${ammo} / ${magazineOf(gun)} rounds · ${lines} · reload ${reloadMsOf(gun)} ms`
}

// --- Input ------------------------------------------------------------------------------------

const canvas = renderer.domElement
let dragging: { x: number; y: number } | null = null
canvas.addEventListener('contextmenu', event => event.preventDefault())
canvas.addEventListener('pointerdown', event => {
    sounds.unlock()
    if (event.button === 2) {
        state.aim = 1
        save()
        return
    }
    if (state.view === 'inspect') {
        dragging = { x: event.clientX, y: event.clientY }
        return
    }
    triggerDown = true
    clicked = true
})
document.addEventListener('pointerup', event => {
    if (event.button === 2) {
        state.aim = 0
        save()
    }
    dragging = null
    triggerDown = false
})
document.addEventListener('pointermove', event => {
    if (!dragging) return
    state.yaw -= (event.clientX - dragging.x) * 0.008
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + (event.clientY - dragging.y) * 0.008))
    dragging = { x: event.clientX, y: event.clientY }
    writeHash(state)
})
canvas.addEventListener(
    'wheel',
    event => {
        if (state.view !== 'inspect') return
        event.preventDefault()
        state.distance = Math.max(0.12, Math.min(2, state.distance * Math.exp(event.deltaY * 0.001)))
        writeHash(state)
    },
    { passive: false }
)
document.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).tagName === 'INPUT' && (event.target as HTMLInputElement).type !== 'range') return
    const n = Number(event.key)
    if (n >= 1 && n <= WEAPONS.length) select(WEAPONS[n - 1]!)
    else if (event.key === ' ') {
        event.preventDefault()
        sounds.unlock()
        if (!event.repeat) clicked = true
        triggerDown = true
    } else if (event.key === 'r' || event.key === 'R') startReload()
    else if (event.key === 'v' || event.key === 'V') toggleView()
    else if (event.key === 'p' || event.key === 'P') {
        state.speed = state.speed === 0 ? 1 : 0
        save()
    } else if ((event.key === ',' || event.key === '.') && state.t !== null) {
        state.t = Math.max(0, Math.min(1, state.t + (event.key === '.' ? 0.005 : -0.005)))
        save()
    }
})
document.addEventListener('keyup', event => {
    if (event.key === ' ') triggerDown = false
})
addEventListener('hashchange', () => {
    const before = state
    state = readHash()
    if (state.color !== before.color) viewmodel = new Viewmodel(state.color)
    if (state.weapon !== before.weapon) {
        // Another gun from the address: its own magazine and a clean tally, as from the buttons.
        clearShots()
        const gun = gunOf(state.weapon)
        if (gun) ammo = magazineOf(gun)
        reloadAt = null
    }
    viewmodel.hold(state.weapon, -1e9)
    showPanel()
})

// --- Debug, every frame -------------------------------------------------------------------------

function metricsHtml(rows: Metric[]): string {
    return rows
        .map(row => {
            if (row.group) return `<b>${row.label}</b>`
            const sub = row.label.startsWith('  ')
            return `<span class="k${sub ? ' sub' : ''}">${row.label.trim()}</span><span class="v">${row.value}</span>`
        })
        .join('')
}

let debugKey = ''
let liveAt = 0
let fps = 60
let draws = { calls: 0, triangles: 0 }

/** The gun's numbers and the falloff graph: only when what they depend on changes. */
function showGunNumbers(gun: Gun | null): void {
    const s = situation()
    const key = `${state.weapon}|${s.aiming}|${s.moving}|${s.air}|${s.distance}|${s.aimAt}`
    if (key === debugKey) return
    debugKey = key
    $('[data-metrics]').innerHTML = metricsHtml(gun ? gunMetrics(gun, s) : meleeMetrics(s.distance))
    drawFalloff(gun)
}

function drawFalloff(gun: Gun | null): void {
    const curve = gun ? falloffCurve(gun) : []
    const context = falloffCanvas.getContext('2d')!
    const { width: w, height: h } = falloffCanvas
    context.clearRect(0, 0, w, h)
    falloffCanvas.hidden = curve.length === 0
    if (!curve.length) return
    const pad = 20
    const furthest = curve.at(-1)![0]
    const most = curve[0]![1]
    const x = (d: number) => pad + (d / furthest) * (w - 2 * pad)
    const y = (damage: number) => h - pad - (damage / most) * (h - 2 * pad)
    context.strokeStyle = '#3a3f47'
    context.lineWidth = 2
    context.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad)
    context.strokeStyle = '#ff8a65'
    context.lineWidth = 3
    context.beginPath()
    for (const [i, [d, damage]] of curve.entries()) {
        if (i === 0) context.moveTo(x(d), y(damage))
        else context.lineTo(x(d), y(damage))
    }
    context.stroke()
    if (state.range <= furthest) {
        context.strokeStyle = '#4aa3ff'
        context.beginPath()
        context.moveTo(x(state.range), pad)
        context.lineTo(x(state.range), h - pad)
        context.stroke()
    }
    context.fillStyle = '#a9afb8'
    context.font = '20px system-ui, sans-serif'
    // Top right: the curve is at its lowest there.
    context.fillText(`${Math.round(most)} dmg a pull`, w - pad - 150, pad + 22)
    context.fillText(`0 – ${furthest} m`, w - pad - 110, h - 2)
}

/** Places the debug scene and the on-screen cone; writes the live numbers ten times a second. */
function showDebug(gun: Gun | null, progress: number | null, real: number, dt: number): void {
    debugGroup.visible = state.debug
    wall.position.z = state.debug ? -Math.max(6, state.range + 2) : -6
    const hands = state.view === 'hands'
    if (!state.debug) {
        coneRing.hidden = coneDot.hidden = true
        return
    }
    const s = situation()
    const half = gun ? coneOf(gun, s).total : STAPLER.arc
    target.position.set(0, 0, -state.range)
    board.position.set(0, aimHeight(state.at), -state.range)
    // The 3D cone only shows from outside it: inspecting.
    const length = state.range
    cone.visible = !hands && gun !== null && half > 0
    cone.scale.set(Math.tan(half) * length, Math.tan(half) * length, length)
    cone.rotation.set(aimPitch(s), 0, 0)

    // On the screen: radius = tan(cone) / tan(half the view) × half the screen's height.
    const radius = (Math.tan(half) / Math.tan(((camera.fov / 2) * Math.PI) / 180)) * (innerHeight / 2)
    coneRing.hidden = coneDot.hidden = !hands
    coneRing.classList.toggle('melee', gun === null)
    const size = Math.max(6, radius * 2)
    coneRing.style.width = coneRing.style.height = `${size}px`
    coneRing.firstElementChild!.textContent = gun
        ? `${((half * 180) / Math.PI).toFixed(2)}° · ${(2 * state.range * Math.tan(half) * 100).toFixed(1)} cm at ${state.range} m`
        : `stapler arc ${((half * 180) / Math.PI).toFixed(0)}° · reach ${STAPLER.reach * 100} cm`

    showGunNumbers(gun)
    fps += (1000 / Math.max(1, dt) - fps) * 0.05
    if (real - liveAt < 100) return
    liveAt = real
    const interval = gun ? (gun === 'launcher' ? LAUNCHER.intervalMs : GUNS[gun].intervalMs) : STAPLER.intervalMs
    const reloadLeft = gun && progress !== null && reloadAt !== null ? (1 - progress) * reloadMsOf(gun) : null
    const weaponState =
        progress !== null
            ? `reloading ${Math.round(progress * 100)}%${reloadLeft !== null ? ` (${Math.round(reloadLeft)} ms left)` : ' (held)'}`
            : clock < nextShot
              ? `next shot in ${Math.round(nextShot - clock)} ms`
              : gun && ammo === 0
                ? 'empty'
                : 'ready'
    $('[data-live]').innerHTML = metricsHtml([
        { label: 'Live', value: '', group: true },
        { label: 'Weapon', value: weaponState },
        { label: 'Rounds', value: gun ? `${ammo} / ${magazineOf(gun)}` : '—' },
        { label: 'Interval', value: `${interval} ms` },
        {
            label: 'Firing as',
            value: `${s.aiming ? 'aimed' : 'hip'}${s.moving ? ', walking' : ''}${s.air ? ', in the air' : ''}`,
        },
        { label: 'Aim pitch', value: `${((aimPitch(s) * 180) / Math.PI).toFixed(2)}°` },
        { label: 'Camera FOV', value: `${camera.fov.toFixed(1)}°` },
        { label: 'Cone on screen', value: hands ? `${radius.toFixed(1)} px radius` : 'inspecting: 3D cone' },
        { label: 'Lab clock', value: `${(clock / 1000).toFixed(2)} s at ${state.speed}×` },
        { label: 'Frame', value: `${fps.toFixed(0)} fps · ${dt.toFixed(1)} ms` },
        { label: 'Draws', value: `${draws.calls} calls · ${draws.triangles.toLocaleString()} tris` },
    ])
    const share = (n: number) => (tally.rounds ? ` (${Math.round((n / tally.rounds) * 100)}%)` : '')
    $('[data-tally]').innerHTML = metricsHtml([
        { label: 'Shots fired', value: '', group: true },
        { label: 'Pulls · rounds', value: `${tally.pulls} · ${tally.rounds}` },
        { label: 'Head', value: `${tally.head}${share(tally.head)}` },
        { label: 'Body', value: `${tally.body}${share(tally.body)}` },
        { label: 'Missed', value: `${tally.miss}${share(tally.miss)}` },
        { label: 'Damage', value: tally.damage.toFixed(0) },
        {
            label: 'Target',
            value:
                tally.downAt !== null
                    ? `down on pull ${tally.downAt}`
                    : `${Math.max(0, MAX_HEALTH - tally.damage).toFixed(0)} health left`,
        },
    ])
}

// --- Every frame ------------------------------------------------------------------------------

function frame(): void {
    const real = performance.now()
    const dt = real - lastFrame
    clock += dt * state.speed
    lastFrame = real
    // Last frame's draws (both passes), before counting this one's.
    draws = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
    renderer.info.reset()

    // Firing: held for automatics, a click a shot for the rest.
    const gun = gunOf(state.weapon)
    const auto = gun !== null && gun !== 'launcher' && GUNS[gun].auto
    if ((auto && triggerDown) || clicked) {
        if (!auto && clock >= nextShot) clicked = false
        pull()
        if (auto) clicked = false
    }

    // The reload: run on the lab's clock, or held where the slider says.
    let progress: number | null = state.t
    if (gun && reloadAt !== null) {
        progress = (clock - reloadAt) / reloadMsOf(gun)
        if (progress >= 1) {
            progress = null
            reloadAt = state.loop ? clock + 600 : null
            ammo = magazineOf(gun)
        } else if (progress < 0) progress = null
    }
    if (!gun) progress = null

    camera.fov = state.view === 'hands' ? state.fov - state.aim * state.fov * 0.42 : 40
    camera.updateProjectionMatrix()
    // Debugging, the crosshair goes on the target (its head or its body).
    const pitch = state.debug ? aimPitch(situation()) : 0
    stand.rotation.set(pitch, 0, 0)
    if (state.view === 'hands') {
        camera.position.copy(EYE)
        camera.rotation.set(pitch, 0, 0)
        viewmodel.follow(camera)
    } else {
        // Round the gun's middle, which sits a little ahead of and below the eyes.
        const centre = EYE.clone().add(new Vector3(0.05, -0.03, -0.16))
        camera.position.set(
            centre.x + Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance,
            centre.y + Math.sin(state.pitch) * state.distance,
            centre.z + Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance
        )
        camera.lookAt(centre)
        viewmodel.follow(stand)
    }
    viewmodel.loaded = state.weapon === 'launcher' && ammo > 0 && progress === null
    viewmodel.update(clock, state.moving, state.aim, progress)
    effects.update(real)
    showStats(progress)
    showDebug(gun, progress, real, dt)

    renderer.render(scene, camera)
    viewmodel.render(renderer, camera)
    requestAnimationFrame(frame)
}

// --- Saving a file reloads the page -----------------------------------------------------------

async function watchForChanges(): Promise<void> {
    let seen: string | null = null
    for (;;) {
        try {
            const version = await (await fetch('/version', { cache: 'no-store' })).text()
            if (seen !== null && version !== seen) location.reload()
            seen = version
        } catch {
            // The lab's server restarting: keep asking.
        }
        await new Promise(r => setTimeout(r, 700))
    }
}

viewmodel.hold(state.weapon, -1e9)
select(state.weapon)
save()
requestAnimationFrame(frame)
void watchForChanges()
