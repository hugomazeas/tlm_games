import * as THREE from 'three'
import type { KartState } from '../drive/kart.ts'
import { buildKartModel } from './kart.ts'

/**
 * The Hub's garage: a player's kart turning on a turntable, and two colour
 * pickers, body and accent, with a row of quick swatches each. The kart
 * repaints as you pick; Save keeps the colours on the player, so their kart
 * looks the same on any computer and to everyone racing them. Drag the kart
 * to turn it.
 */

interface GarageConfig {
    name: string
    body: string
    accent: string
    saveUrl: string
    csrf: string
}

const SWATCHES = [
    '#d23c3c',
    '#f97316',
    '#facc15',
    '#22c55e',
    '#14b8a6',
    '#0ea5e9',
    '#2b5fa8',
    '#8b5cf6',
    '#ec4899',
    '#f8fafc',
    '#64748b',
    '#111827',
]
/** Turntable speed, radians a second, when nobody is turning it. */
const SPIN = 0.5

const CSS = `
    .garage { display: flex; flex-wrap: wrap; gap: 16px; }
    .garage .stage { flex: 1 1 420px; height: 420px; border-radius: 12px; overflow: hidden; background: radial-gradient(circle at 50% 40%, #334155, #0f172a); cursor: grab; }
    .garage .stage:active { cursor: grabbing; }
    .garage .stage canvas { display: block; width: 100%; height: 100%; }
    .garage .paint { flex: 0 1 320px; display: flex; flex-direction: column; gap: 18px; padding: 16px; border-radius: 12px; background: rgb(255 255 255 / 0.05); border: 1px solid rgb(255 255 255 / 0.1); }
    .garage h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: rgb(255 255 255 / 0.75); }
    .garage .row { display: flex; align-items: center; gap: 10px; }
    .garage input[type=color] { width: 48px; height: 36px; border: 0; padding: 0; background: none; cursor: pointer; }
    .garage .hex { font-family: ui-monospace, monospace; font-size: 13px; color: rgb(255 255 255 / 0.6); }
    .garage .swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 8px; }
    .garage .swatches button { aspect-ratio: 1; border-radius: 6px; border: 2px solid transparent; cursor: pointer; }
    .garage .swatches button.on { border-color: #fff; }
    .garage .save { font: inherit; font-weight: 600; padding: 10px; border-radius: 8px; border: 0; background: #ea580c; color: #fff; cursor: pointer; margin-top: auto; }
    .garage .save:disabled { opacity: 0.5; cursor: default; }
    .garage .status { font-size: 13px; min-height: 1.2em; }
`

const config = (window as { garageConfig?: GarageConfig }).garageConfig
const container = document.getElementById('garage')
if (!config || !container) throw new Error('The garage needs #garage and window.garageConfig')

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)
container.classList.add('garage')
container.innerHTML = `
    <div class="stage"></div>
    <div class="paint">
        <div data-part="body"><h3>Body</h3></div>
        <div data-part="accent"><h3>Accent (wing and suit)</h3></div>
        <div class="status"></div>
        <button class="save">Save colours</button>
    </div>`

const colours = { body: config.body, accent: config.accent }
let saved = { ...colours }

// The stage: the kart on a turntable, lit like the city.
const stage = container.querySelector<HTMLElement>('.stage')!
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
stage.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4f5a, 1.8))
const sun = new THREE.DirectionalLight(0xfff4e0, 1.6)
sun.position.set(-3, 5, 2)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(4.2, 2.6, 4.2)
camera.lookAt(0, 0.6, 0)
const turntable = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.1, 48),
    new THREE.MeshLambertMaterial({ color: 0x1e293b })
)
turntable.position.y = -0.05
scene.add(turntable)
const kart = buildKartModel({ name: config.name, ...colours }, false)
scene.add(kart.root)
/** Standing still: no drift sparks, no boost flame. */
const parked: KartState = {
    ...{ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, airborne: false },
    ...{ drift: 0, charge: 0, boost: 0, padCooldown: 0, sinking: 0, surface: 'road' },
}

let angle = 0
let dragging: number | null = null
stage.addEventListener('pointerdown', event => {
    dragging = event.clientX
    stage.setPointerCapture(event.pointerId)
})
stage.addEventListener('pointermove', event => {
    if (dragging === null) return
    angle += (event.clientX - dragging) * 0.01
    dragging = event.clientX
})
stage.addEventListener('pointerup', () => (dragging = null))

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1)
    if (dragging === null) angle += SPIN * dt
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
    }
    kart.pose(0, 0, 0, angle, new THREE.Vector3(0, 1, 0), parked, 0, dt)
    renderer.render(scene, camera)
})

// The pickers.
const status = container.querySelector<HTMLElement>('.status')!
const saveButton = container.querySelector<HTMLButtonElement>('.save')!
const pickers: Record<'body' | 'accent', { input: HTMLInputElement; hex: HTMLElement; swatches: HTMLButtonElement[] }> =
    {} as never
for (const part of ['body', 'accent'] as const) {
    const box = container.querySelector(`[data-part=${part}]`)!
    const row = Object.assign(document.createElement('div'), { className: 'row' })
    const input = Object.assign(document.createElement('input'), { type: 'color', value: colours[part] })
    const hex = Object.assign(document.createElement('span'), { className: 'hex' })
    row.append(input, hex)
    const grid = Object.assign(document.createElement('div'), { className: 'swatches' })
    const swatches = SWATCHES.map(colour => {
        const swatch = Object.assign(document.createElement('button'), { type: 'button', title: colour })
        swatch.style.background = colour
        swatch.addEventListener('click', () => pick(part, colour))
        grid.append(swatch)
        return swatch
    })
    box.append(row, grid)
    input.addEventListener('input', () => pick(part, input.value))
    pickers[part] = { input, hex, swatches }
}
refresh()

function pick(part: 'body' | 'accent', colour: string): void {
    colours[part] = colour.toLowerCase()
    kart.paint(colours.body, colours.accent)
    status.textContent = ''
    refresh()
}

function refresh(): void {
    for (const part of ['body', 'accent'] as const) {
        const { input, hex, swatches } = pickers[part]
        input.value = colours[part]
        hex.textContent = colours[part]
        swatches.forEach((swatch, i) => swatch.classList.toggle('on', SWATCHES[i] === colours[part]))
    }
    saveButton.disabled = colours.body === saved.body && colours.accent === saved.accent
}

saveButton.addEventListener('click', async () => {
    saveButton.disabled = true
    status.textContent = 'Saving…'
    status.style.color = ''
    try {
        const response = await fetch(config.saveUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': config.csrf },
            body: JSON.stringify(colours),
        })
        if (!response.ok) throw new Error(`The Hub said ${response.status}`)
        saved = { ...colours }
        status.textContent = 'Saved. Your kart wears these colours on every track.'
        status.style.color = '#86efac'
    } catch (error) {
        status.textContent = (error as Error).message
        status.style.color = '#fca5a5'
    }
    refresh()
})
