import {
    ACESFilmicToneMapping,
    AmbientLight,
    Box3,
    CanvasTexture,
    CapsuleGeometry,
    DirectionalLight,
    DoubleSide,
    FogExp2,
    Group,
    HemisphereLight,
    MathUtils,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    type Object3D,
    PCFSoftShadowMap,
    PerspectiveCamera,
    Scene,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { bake, crowns, paintMaterials } from '../client/erables.ts'
import { Builder } from './kit.ts'
import { ASSETS } from './library.ts'
import { place } from './place.ts'
import { type Asset, type AssetVersion, CATEGORIES, type Params, type ParamValue } from './types.ts'

/**
 * The asset lab in the browser (`bun run fps:assets`). The state is in the hash, so a reload (or a
 * still made with tools/aerial/shot.mjs) shows the same thing:
 *
 *   #asset=car&show=both&yaw=35&pitch=-12&dist=14&custom=0&kind=pickup
 *
 * `show`: `current` (what the maps use), `draft` (the version being reworked) or `both` side by
 * side; `custom=1` shows one copy with the parameters given (the panel's), else the asset's variants.
 */

interface Review {
    version: number
    verdict: 'approved' | 'changes'
    note: string
    at: string
}

// --- State in the hash --------------------------------------------------------------------------

type Show = 'current' | 'draft' | 'both'
const state = {
    asset: ASSETS[0]!.id,
    show: 'both' as Show,
    yaw: null as number | null,
    pitch: null as number | null,
    dist: null as number | null,
    custom: false,
    params: {} as Params,
}

function readHash(): void {
    const h = new URLSearchParams(location.hash.slice(1))
    state.asset = ASSETS.some(a => a.id === h.get('asset')) ? h.get('asset')! : ASSETS[0]!.id
    const show = h.get('show')
    state.show = show === 'current' || show === 'draft' ? show : 'both'
    const num = (k: string) => (h.has(k) ? Number(h.get(k)) : null)
    state.yaw = num('yaw')
    state.pitch = num('pitch')
    state.dist = num('dist')
    state.custom = h.get('custom') === '1'
    const asset = current()
    state.params = {}
    for (const key of Object.keys(asset.defaults)) {
        if (!h.has(key)) continue
        const raw = h.get(key)!
        const def = asset.defaults[key]
        state.params[key] = typeof def === 'number' ? Number(raw) : typeof def === 'boolean' ? raw === 'true' : raw
    }
}

function writeHash(): void {
    const h = new URLSearchParams()
    h.set('asset', state.asset)
    h.set('show', state.show)
    if (state.yaw !== null) h.set('yaw', state.yaw.toFixed(0))
    if (state.pitch !== null) h.set('pitch', state.pitch.toFixed(0))
    if (state.dist !== null) h.set('dist', state.dist.toFixed(1))
    if (state.custom) h.set('custom', '1')
    for (const [k, v] of Object.entries(state.params)) h.set(k, String(v))
    history.replaceState(null, '', `#${h.toString()}`)
}

const current = (): Asset => ASSETS.find(a => a.id === state.asset)!

// --- The scene --------------------------------------------------------------------------------------

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = PCFSoftShadowMap
renderer.toneMapping = ACESFilmicToneMapping
const scene = new Scene()
scene.fog = new FogExp2(0xb9c8d6, 0.006)
const camera = new PerspectiveCamera(50, 1, 0.05, 2000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.495

// An October afternoon, as on Rue des Érables.
const sunDir = new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(90 - 28), MathUtils.degToRad(35))
const sky = new Sky()
sky.scale.setScalar(1500)
const u = sky.material.uniforms
u.turbidity!.value = 1.0
u.rayleigh!.value = 3.4
u.mieCoefficient!.value = 0.002
u.mieDirectionalG!.value = 0.8
;(u.sunPosition!.value as Vector3).copy(sunDir)
scene.add(sky)
const sun = new DirectionalLight(0xffd9a8, 3.2)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
scene.add(sun, sun.target)
scene.add(new HemisphereLight(0xbfd6ee, 0x6b5a40, 1.35))
scene.add(new AmbientLight(0xfff4e6, 1.1))
const fill = new DirectionalLight(0xa9c4e8, 0.35)
fill.position.copy(sunDir).multiplyScalar(-10).setY(8)
scene.add(fill)

const glass = new MeshPhysicalMaterial({
    color: 0xdff1f8,
    metalness: 0,
    roughness: 0.03,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: DoubleSide,
})
const M = paintMaterials(glass)

// The ground: the map's lawn, with world-aligned UVs like the map's.
const groundBuilder = new Builder(M)
groundBuilder.box('grass', -120, -0.3, -120, 120, 0, 120, { cast: false })
bake(groundBuilder.drawn)
scene.add(groundBuilder.drawn)

/** A plain 1.8 m figure for scale. */
function figure(): Group {
    const g = new Group()
    const skin = new MeshStandardMaterial({ color: 0x8c9aa8, roughness: 0.7 })
    const body = new Mesh(new CapsuleGeometry(0.2, 1.05, 6, 14), skin)
    body.position.y = 0.2 + 0.525 + 0.02
    const head = new Mesh(new SphereGeometry(0.12, 18, 12), skin)
    head.position.y = 1.68
    for (const m of [body, head]) m.castShadow = true
    g.add(body, head)
    return g
}

/** A label floating over a block of the view. */
function label(text: string, color: string): Sprite {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(16,18,22,.78)'
    g.beginPath()
    g.roundRect(4, 4, 504, 88, 18)
    g.fill()
    g.fillStyle = color
    g.font = '600 40px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 256, 50)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    const s = new Sprite(new SpriteMaterial({ map: t, depthTest: false, fog: false }))
    s.renderOrder = 10
    return s
}

let shown: Object3D[] = []

/** Builds the asset's versions and variants into the scene, and frames the camera on them (unless the hash says where). */
function rebuild(): void {
    for (const o of shown) scene.remove(o)
    shown = []
    const asset = current()
    const versions: Array<{ v: AssetVersion<Params>; title: string; color: string }> = []
    if (state.show !== 'draft' || !asset.draft)
        versions.push({ v: asset.current, title: `In the map · v${asset.current.version}`, color: '#9fe3b0' })
    if (state.show !== 'current' && asset.draft)
        versions.push({ v: asset.draft, title: `Draft · v${asset.draft.version}`, color: '#ffd166' })
    const variants: Array<Partial<Params>> = state.custom
        ? [state.params]
        : asset.variants.length
          ? [...asset.variants]
          : [{}]
    const [w, h, d] = asset.size
    const gap = Math.max(1.5, w * 0.25)
    const blockWidth = variants.length * (w + gap) + 1.2
    const all = new Box3()
    versions.forEach(({ v, title, color }, row) => {
        const b = new Builder(M)
        const x0 = (row - (versions.length - 1) / 2) * (blockWidth + 4) - blockWidth / 2
        variants.forEach((variant, i) => place(b, asset, variant, { x: x0 + 1.2 + i * (w + gap) + w / 2 }, v))
        const group = b.drawn
        if (b.trees.length) group.add(crowns(b.trees, 7))
        bake(group)
        const man = figure()
        man.position.set(x0 + 0.4, 0, d / 2 + 0.6)
        const tag = label(title, color)
        tag.position.set(x0 + blockWidth / 2, Math.max(h, 1.8) + 1.0, 0)
        const scale = Math.max(2.2, blockWidth * 0.18)
        tag.scale.set(scale, scale * (96 / 512), 1)
        scene.add(group, man, tag)
        shown.push(group, man, tag)
        all.expandByObject(group)
        all.expandByObject(man)
    })
    const centre = all.getCenter(new Vector3())
    const size = all.getSize(new Vector3())
    controls.target.set(centre.x, Math.min(centre.y, h * 0.45), centre.z)
    const yaw = MathUtils.degToRad(state.yaw ?? 32)
    const pitch = MathUtils.degToRad(state.pitch ?? -14)
    // Far enough that what's shown fills about two thirds of the width.
    const fit =
        Math.max(size.x * 0.62, size.z * 0.5, size.y * 1.1, 2.5) /
        Math.tan(MathUtils.degToRad(camera.fov / 2)) /
        Math.max(1, camera.aspect)
    const dist = state.dist ?? fit
    camera.position.set(
        controls.target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
        controls.target.y - Math.sin(pitch) * dist,
        controls.target.z + Math.cos(yaw) * Math.cos(pitch) * dist
    )
    controls.update()
    // The sun's shadow fitted round what's shown.
    const span = Math.max(size.x, size.z) * 0.6 + 4
    sun.position.copy(centre).addScaledVector(sunDir, span * 2)
    sun.target.position.copy(centre)
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: span * 5 })
    sun.shadow.camera.updateProjectionMatrix()
}

// Orbiting writes the view to the hash (so a reload or a link keeps it).
controls.addEventListener('end', () => {
    const off = camera.position.clone().sub(controls.target)
    state.dist = off.length()
    state.yaw = MathUtils.radToDeg(Math.atan2(off.x, off.z))
    state.pitch = -MathUtils.radToDeg(Math.asin(off.y / state.dist))
    writeHash()
})

// --- The page ----------------------------------------------------------------------------------------

const CSS = `
body { margin: 0; background: #14161a; color: #e8ecf2; font: 14px/1.4 system-ui, sans-serif; overflow: hidden; }
#lab { display: grid; grid-template-columns: 280px 1fr 260px; height: 100vh; }
#list { overflow-y: auto; background: #1b1e24; border-right: 1px solid #2a2f37; padding: 12px 0; }
#list h1 { font-size: 16px; margin: 0 16px 4px; }
#list .summary { margin: 0 16px 12px; color: #9aa3ad; font-size: 12px; }
#list h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8a94a0; margin: 14px 16px 4px; }
#list button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 16px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
#list button:hover { background: #242830; }
#list button.on { background: #2b3340; }
.chip { font-size: 11px; padding: 1px 7px; border-radius: 9px; white-space: nowrap; }
.chip.map { background: #2a3a30; color: #9fe3b0; }
.chip.awaiting { background: #4a3d16; color: #ffd166; }
.chip.changes { background: #4a2420; color: #ff9a8a; }
.chip.approved { background: #1f3d4a; color: #8fd4ff; }
#view { position: relative; }
#view canvas { display: block; width: 100%; height: 100%; }
#head { position: absolute; left: 12px; top: 12px; max-width: 760px; pointer-events: none; background: rgba(16,18,22,.78); border-radius: 10px; padding: 10px 14px; }
#head h2 { margin: 0; font-size: 20px; }
#head .notes { color: #c3cad3; font-size: 13px; max-width: 720px; margin-top: 4px; }
#head .notes b { color: #fff; }
#bar { position: absolute; left: 16px; bottom: 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#bar button, #side button { border: 1px solid #39404b; background: #222731; color: #e8ecf2; border-radius: 8px; padding: 7px 12px; font: inherit; cursor: pointer; }
#bar button.on { background: #3a4656; border-color: #5b6b80; }
#bar button.approve { background: #1f5a33; border-color: #2e7d47; }
#bar button.changes { background: #5a2a23; border-color: #7d3a2e; }
#bar button:disabled { opacity: .4; cursor: default; }
#side { overflow-y: auto; background: #1b1e24; border-left: 1px solid #2a2f37; padding: 14px; }
#side h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8a94a0; margin: 0 0 8px; }
#side label { display: block; margin: 10px 0 4px; color: #c3cad3; font-size: 12px; }
#side select, #side input[type=range] { width: 100%; }
#side .value { float: right; color: #9aa3ad; }
#review { margin-top: 18px; border-top: 1px solid #2a2f37; padding-top: 14px; }
#review textarea { width: 100%; box-sizing: border-box; min-height: 90px; background: #14161a; color: inherit; border: 1px solid #39404b; border-radius: 8px; padding: 8px; font: inherit; }
#review .last { color: #9aa3ad; font-size: 12px; margin-top: 8px; white-space: pre-wrap; }
`

const style = document.createElement('style')
style.textContent = CSS
document.head.append(style)
document.body.innerHTML = `
<div id="lab">
  <nav id="list"></nav>
  <main id="view"><div id="head"></div><div id="bar"></div></main>
  <aside id="side"></aside>
</div>`
const view = document.getElementById('view')!
view.prepend(renderer.domElement)

let reviews: Record<string, Review> = {}

/** Where an asset stands: in the map only, a draft awaiting you, changes asked, a draft approved. */
function statusOf(asset: Asset): { chip: string; cls: string } {
    const r = reviews[asset.id]
    if (!asset.draft) {
        return r?.verdict === 'approved' && r.version === asset.current.version
            ? { chip: `approved v${asset.current.version}`, cls: 'approved' }
            : { chip: `in map v${asset.current.version}`, cls: 'map' }
    }
    if (r && r.version === asset.draft.version) {
        return r.verdict === 'approved'
            ? { chip: `v${asset.draft.version} approved`, cls: 'approved' }
            : { chip: 'changes asked', cls: 'changes' }
    }
    return { chip: `v${asset.draft.version} awaiting you`, cls: 'awaiting' }
}

function renderList(): void {
    const list = document.getElementById('list')!
    const awaiting = ASSETS.filter(a => statusOf(a).cls === 'awaiting').length
    let html = `<h1>Asset library</h1><div class="summary">${ASSETS.length} assets · ${awaiting} awaiting your OK</div>`
    for (const category of CATEGORIES) {
        const items = ASSETS.filter(a => a.category === category)
        if (!items.length) continue
        html += `<h2>${category}</h2>`
        for (const a of items) {
            const s = statusOf(a)
            html += `<button data-id="${a.id}" class="${a.id === state.asset ? 'on' : ''}"><span>${a.name}</span><span class="chip ${s.cls}">${s.chip}</span></button>`
        }
    }
    list.innerHTML = html
    for (const button of list.querySelectorAll('button')) {
        button.addEventListener('click', () => {
            state.asset = button.dataset.id!
            state.params = {}
            state.custom = false
            state.yaw = state.pitch = state.dist = null
            writeHash()
            refresh()
        })
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function renderHead(): void {
    const a = current()
    const lines = [`<b>In the map · v${a.current.version}:</b> ${escapeHtml(a.current.notes)}`]
    if (a.draft) lines.push(`<b>Draft · v${a.draft.version}:</b> ${escapeHtml(a.draft.notes)}`)
    document.getElementById('head')!.innerHTML = `<h2>${a.name}</h2><div class="notes">${lines.join('<br>')}</div>`
}

function renderBar(): void {
    const a = current()
    const bar = document.getElementById('bar')!
    const shows: Array<[Show, string]> = [
        ['current', 'In the map'],
        ['draft', 'Draft'],
        ['both', 'Side by side'],
    ]
    bar.innerHTML = shows
        .map(
            ([s, t]) =>
                `<button data-show="${s}" class="${state.show === s ? 'on' : ''}" ${s !== 'current' && !a.draft ? 'disabled' : ''}>${t}</button>`
        )
        .join('')
    for (const button of bar.querySelectorAll<HTMLButtonElement>('button[data-show]')) {
        button.addEventListener('click', () => {
            state.show = button.dataset.show as Show
            writeHash()
            rebuild()
            renderBar()
        })
    }
}

function renderSide(): void {
    const a = current()
    const side = document.getElementById('side')!
    let html = `<h3>Parameters</h3>
      <label><input type="checkbox" id="custom" ${state.custom ? 'checked' : ''}> Show one with these (else its variants)</label>`
    for (const [key, spec] of Object.entries(a.params)) {
        if (!spec) continue
        const value = state.params[key] ?? a.defaults[key]!
        if (spec.options) {
            html += `<label>${spec.label}</label><select data-key="${key}">${spec.options
                .map(
                    o =>
                        `<option value="${String(o)}" ${String(o) === String(value) ? 'selected' : ''}>${String(o)}</option>`
                )
                .join('')}</select>`
        } else {
            html += `<label>${spec.label} <span class="value">${value}</span></label><input type="range" data-key="${key}" min="${spec.min}" max="${spec.max}" step="${spec.step ?? 0.1}" value="${value}">`
        }
    }
    if (!Object.keys(a.params).length) html += `<div style="color:#9aa3ad;font-size:12px">No parameters.</div>`
    const r = reviews[a.id]
    const target = a.draft ?? a.current
    html += `<div id="review"><h3>Your verdict on v${target.version}</h3>
      ${a.draft ? '' : '<div style="color:#9aa3ad;font-size:12px;margin-bottom:8px">No draft yet: this is the version in the map. You can still approve it as it is, or ask for changes.</div>'}
      <textarea id="note" placeholder="What should change? (for Request changes)"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="approve" id="approve" style="background:#1f5a33;border-color:#2e7d47">Approve v${target.version}</button>
        <button id="changes" style="background:#5a2a23;border-color:#7d3a2e">Request changes</button>
      </div>
      <div id="confirm" hidden style="margin-top:8px;font-size:12px;color:#e8c27a">
        You wrote a note: is it something to change?
        <div style="display:flex;gap:8px;margin-top:6px">
          <button id="as-changes" style="background:#5a2a23;border-color:#7d3a2e">Send as changes</button>
          <button id="approve-anyway" style="background:#1f5a33;border-color:#2e7d47">Approve anyway</button>
        </div>
      </div>
      ${r ? `<div class="last">Last: v${r.version} ${r.verdict === 'approved' ? 'approved' : 'changes asked'} ${new Date(r.at).toLocaleString()}${r.note ? `\n“${escapeHtml(r.note)}”` : ''}</div>` : ''}
    </div>`
    side.innerHTML = html
    side.querySelector<HTMLInputElement>('#custom')!.addEventListener('change', e => {
        state.custom = (e.target as HTMLInputElement).checked
        writeHash()
        rebuild()
    })
    for (const input of side.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]')) {
        input.addEventListener('input', () => {
            const key = input.dataset.key!
            const def = a.defaults[key]
            const raw = input.value
            const value: ParamValue =
                typeof def === 'number' ? Number(raw) : typeof def === 'boolean' ? raw === 'true' : raw
            state.params[key] = value
            state.custom = true
            const shownValue = input.previousElementSibling?.querySelector('.value')
            if (shownValue) shownValue.textContent = String(value)
            side.querySelector<HTMLInputElement>('#custom')!.checked = true
            writeHash()
            rebuild()
        })
    }
    const send = async (verdict: 'approved' | 'changes') => {
        const note = side.querySelector<HTMLTextAreaElement>('#note')!.value.trim()
        if (verdict === 'changes' && !note) return side.querySelector<HTMLTextAreaElement>('#note')!.focus()
        const response = await fetch('/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id, version: target.version, verdict, note }),
        })
        if (response.ok) reviews = (await response.json()) as Record<string, Review>
        renderList()
        renderSide()
    }
    // Approving with a note typed: ask, rather than file a change request as an approval.
    side.querySelector('#approve')!.addEventListener('click', () => {
        if (side.querySelector<HTMLTextAreaElement>('#note')!.value.trim())
            side.querySelector<HTMLElement>('#confirm')!.hidden = false
        else void send('approved')
    })
    side.querySelector('#approve-anyway')!.addEventListener('click', () => void send('approved'))
    side.querySelector('#as-changes')!.addEventListener('click', () => void send('changes'))
    side.querySelector('#changes')!.addEventListener('click', () => void send('changes'))
}

function refresh(): void {
    renderList()
    renderHead()
    renderBar()
    renderSide()
    rebuild()
}

function resize(): void {
    const w = view.clientWidth
    const h = view.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

readHash()
// `ui=0`: the view alone (for stills).
if (new URLSearchParams(location.hash.slice(1)).get('ui') === '0') {
    document.getElementById('lab')!.style.gridTemplateColumns = '1fr'
    for (const id of ['list', 'side', 'head', 'bar']) document.getElementById(id)!.style.display = 'none'
}
resize()
reviews = await fetch('/reviews')
    .then(r => r.json() as Promise<Record<string, Review>>)
    .catch(() => ({}))
refresh()
addEventListener('hashchange', () => {
    readHash()
    refresh()
})

let frames = 0
renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
    // Drawn twice (shadows settled): stills may be taken.
    if (++frames === 2) (window as { labReady?: boolean }).labReady = true
})

// Rebuilt on every save under src/fps: reload, keeping the hash.
let seen: string | null = null
setInterval(async () => {
    const v = await (await fetch('/version', { cache: 'no-store' })).text().catch(() => seen)
    if (seen !== null && v !== seen) location.reload()
    seen = v
}, 700)
