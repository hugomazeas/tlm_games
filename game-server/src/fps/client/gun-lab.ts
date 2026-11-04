import {
    ACESFilmicToneMapping,
    BoxGeometry,
    Color,
    DirectionalLight,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneGeometry,
    PMREMGenerator,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { type Gun, WEAPON_NAMES, type Weapon } from '../protocol.ts'
import { GUNS, LAUNCHER, magazineOf, reloadMsOf, STAPLER } from '../sim/combat.ts'
import { Effects } from './effects.ts'
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
    history.replaceState(null, '', `#${p}`)
}

let state = readHash()

// --- The room ---------------------------------------------------------------------------------

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = ACESFilmicToneMapping
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
const floor = new Mesh(new PlaneGeometry(40, 40), surface(0x6d7178))
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
    if (gun !== 'launcher' && state.view === 'hands') {
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
        background: rgba(18, 20, 24, 0.86); color: #e8eaed; display: grid; gap: 10px; user-select: none; }
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
    const before = state.color
    state = readHash()
    if (state.color !== before) viewmodel = new Viewmodel(state.color)
    viewmodel.hold(state.weapon, -1e9)
    showPanel()
})

// --- Every frame ------------------------------------------------------------------------------

function frame(): void {
    const real = performance.now()
    clock += (real - lastFrame) * state.speed
    lastFrame = real

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
    if (state.view === 'hands') {
        camera.position.copy(EYE)
        camera.rotation.set(0, 0, 0)
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
