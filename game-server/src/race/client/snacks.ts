import * as THREE from 'three'
import { type KartMods, type KartState, NITRO_CHARGE } from '../drive/kart.ts'
import {
    BAD,
    CHOCOLATE_NITRO,
    EAT_REACH,
    type Effect,
    lasts,
    modsFor,
    SNACK_ICONS,
    SNACKS,
    type SnackKind,
    type SnackSpot,
    type Underfoot,
} from '../drive/snacks.ts'
import type { DriveWorld } from '../drive/world.ts'
import type { Driver } from './drive.ts'
import type { Effects } from './effects.ts'
import type { Others } from './others.ts'
import type { Race } from './race.ts'
import { snackModel } from './snack-models.ts'

/**
 * Snacks in a race, on this tab: the ones lying on the streets (spinning,
 * bobbing), eating the one you drive through (the server says whether you
 * got it), and what eating does: to you (sugar rush, getting fat, nitro…),
 * to the others (popcorn turns their cameras, a Drumsticks freezes them), and
 * the trails some leave (frost, crumbs, nuts) that whoever follows drives on.
 * Also the banners, the effects bar, and the race's dépanneur receipt.
 */

export interface ReceiptLine {
    name: string
    items: SnackKind[]
    /** Cents. */
    total: number
}

export interface SnackPlay {
    /** The race's snacks (countdown), or those still there (joining mid-race). */
    setSnacks(spots: readonly SnackSpot[]): void
    ate(snack: number, kind: SnackKind, by: string): void
    respawn(snack: number): void
    /** Your Chipwich: the server moved you. */
    teleport(x: number, z: number, heading: number): void
    /** The race is over: snacks, effects and trails go; the receipt stays for the panel. */
    clear(): void
    /** The physics tweaks for your next step. */
    mods(kart: KartState): KartMods
    /** After the karts and the camera have moved this frame. */
    update(dt: number, camera: THREE.PerspectiveCamera, driving: boolean): void
    receipt(): ReceiptLine[]
}

export interface SnackOptions {
    scene: THREE.Scene
    world: DriveWorld
    driver: Driver
    others: Others
    race: Race
    effects: Effects
    overlay: HTMLElement
    /** Tell the lobby you drove through snack `id`. */
    eat(id: number): void
    you(): string
    nameOf(id: string): string
    /** Who leads the race now (null before the standings come). */
    leader(): string | null
}

/** On the track the models are this much bigger than life-size-ish, floating this high, turning this fast. */
const SCALE = 1.8
/** The small, flat ones bigger again, so they read from a kart. */
const SMALL: Partial<Record<SnackKind, number>> = { chocolate: 1.5, kirkland: 1.3, gokrisp: 1.3 }
const FLOAT = 0.6
const SPIN = 1.6
/** Snacks further than this aren't drawn. */
const DRAW_DISTANCE = 260
/** Trails: a point every this many seconds, kept this long, felt this close. */
const TRAIL_EVERY = 0.1
const TRAIL_LIFE: Record<TrailKind, number> = { frost: 12, crumbs: 9, nuts: 9 }
const TRAIL_REACH: Record<TrailKind, number> = { frost: 1.7, crumbs: 1.5, nuts: 1.3 }
const TRAIL_POINTS = 1500
/** On nuts, a hop this often, this strong (m/s up). */
const NUT_HOP = { every: 0.35, speed: 2.4 }
const POPCORN_SECONDS = 2.5

type TrailKind = 'frost' | 'crumbs' | 'nuts'
/** Which snacks leave which trail behind whoever ate them. */
const TRAILS: Partial<Record<SnackKind, TrailKind>> = { fuze: 'frost', chips: 'crumbs', trailmix: 'nuts' }

interface Laid {
    spot: SnackSpot
    model: THREE.Group
    phase: number
    eaten: boolean
}

interface Trail {
    kind: TrailKind
    by: string
    /** Clock time recording stops. */
    until: number
    last: number
}

const CSS = `
    #race-snack-banner { position: fixed; top: 30%; left: 0; right: 0; text-align: center; pointer-events: none; font: 900 40px system-ui, sans-serif; color: #fff; text-shadow: 0 3px 14px rgb(15 23 42 / 0.85); opacity: 0; transition: opacity 0.25s; }
    #race-snack-banner.on { opacity: 1; }
    #race-snack-banner small { display: block; font-size: 18px; font-weight: 700; margin-top: 4px; }
    #race-feed { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); display: grid; gap: 4px; justify-items: center; pointer-events: none; }
    #race-feed div { padding: 4px 10px; border-radius: 999px; background: rgb(15 23 42 / 0.75); color: #f8fafc; font: 600 13px system-ui, sans-serif; transition: opacity 0.5s; }
    #race-effects { position: fixed; left: calc(50% + 120px); bottom: 14px; display: grid; gap: 4px; pointer-events: none; }
    #race-effects div { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; background: rgb(15 23 42 / 0.75); color: #f8fafc; font: 600 12px system-ui, sans-serif; min-width: 130px; }
    #race-effects i { flex: 1; height: 4px; border-radius: 2px; background: rgb(255 255 255 / 0.2); overflow: hidden; }
    #race-effects i b { display: block; height: 100%; background: #22d3ee; }
    #race-effects div.bad i b { background: #f87171; }
    #race-letterbox { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.3s; box-shadow: inset 0 11vh 0 #000, inset 0 -11vh 0 #000; }
    #race-letterbox.on { opacity: 1; }
    #race-letterbox span { position: absolute; bottom: 3vh; left: 0; right: 0; text-align: center; color: #fde68a; font: 800 18px system-ui, sans-serif; }
    #race-frost { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.2s; background: radial-gradient(ellipse at center, transparent 35%, rgb(186 230 253 / 0.55) 75%, rgb(240 249 255 / 0.9)); }
    #race-frost.on { opacity: 1; }
`

export function createSnackPlay(options: SnackOptions): SnackPlay {
    const { scene, world, driver, others, race, effects } = options
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    const element = (id: string, html = '') => {
        const el = document.createElement('div')
        el.id = id
        el.innerHTML = html
        options.overlay.appendChild(el)
        return el
    }
    const banner = element('race-snack-banner')
    const feed = element('race-feed')
    const bar = element('race-effects')
    const letterbox = element('race-letterbox', '<span></span>')
    const frost = element('race-frost')

    const laid = new Map<number, Laid>()
    const pending = new Set<number>()
    let mine: Effect[] = []
    const trails: Trail[] = []
    const points = createTrailPoints(scene, world)
    const fatUntil = new Map<string, number>()
    let tally = new Map<string, SnackKind[]>()
    let lastReceipt: ReceiptLine[] = []
    let clock = 0
    let bannerUntil = 0
    let watching: { id: string; until: number } | null = null
    let lastHop = 0
    let lastPuff = 0

    const shout = (title: string, sub = '') => {
        banner.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`
        banner.classList.add('on')
        bannerUntil = clock + 1.8
    }
    const tell = (text: string) => {
        const line = document.createElement('div')
        line.textContent = text
        feed.prepend(line)
        while (feed.children.length > 4) feed.lastElementChild!.remove()
        setTimeout(() => {
            line.style.opacity = '0'
            setTimeout(() => line.remove(), 600)
        }, 3500)
    }
    const addEffect = (kind: Effect['kind']) => {
        mine = mine.filter(e => e.kind !== kind)
        mine.push({ kind, age: 0 } as Effect)
    }
    const fatten = (id: string, seconds: number) => {
        fatUntil.set(id, clock + seconds)
        if (id === options.you()) driver.setFat(true)
        else others.setFat(id, true)
    }
    const positionOf = (id: string) =>
        id === options.you() ? { x: driver.kart.x, y: driver.kart.y, z: driver.kart.z } : others.positionOf(id)

    const underfoot = (x: number, z: number): Underfoot => {
        const you = options.you()
        return {
            frost: points.near('frost', x, z, TRAIL_REACH.frost, you),
            crumbs: points.near('crumbs', x, z, TRAIL_REACH.crumbs, you),
            nuts: points.near('nuts', x, z, TRAIL_REACH.nuts, you),
        }
    }

    const play: SnackPlay = {
        setSnacks(spots) {
            for (const item of laid.values()) scene.remove(item.model)
            laid.clear()
            pending.clear()
            for (const spot of spots) {
                const model = snackModel(spot.kind)
                model.scale.setScalar(SCALE * (SMALL[spot.kind] ?? 1))
                model.position.set(spot.x, world.ground(spot.x, spot.z) + FLOAT, spot.z)
                scene.add(model)
                laid.set(spot.id, { spot, model, phase: Math.random() * Math.PI * 2, eaten: false })
            }
            tally = new Map()
        },

        ate(id, kind, by) {
            const item = laid.get(id)
            if (item) {
                item.eaten = true
                item.model.visible = false
            }
            pending.delete(id)
            tally.set(by, [...(tally.get(by) ?? []), kind])
            const you = options.you()
            const info = SNACKS[kind]
            const icon = SNACK_ICONS[kind]
            const at = positionOf(by)
            if (at) effects.burst(at.x, at.y + 1, at.z, 'pop')

            const trail = TRAILS[kind]
            if (trail) trails.push({ kind: trail, by, until: clock + info.seconds, last: -1 })
            if (kind === 'chips') fatten(by, info.seconds)

            if (by === you) {
                shout(`${icon} ${info.shout}`, info.name)
                switch (kind) {
                    case 'chocolate':
                        driver.modify(k => ({ ...k, nitro: Math.min(NITRO_CHARGE, k.nitro + CHOCOLATE_NITRO) }))
                        break
                    case 'chipwich':
                        // The server moves you up a place; in the lead there's nobody to pass: a full nitro.
                        if (options.leader() === you || options.leader() === null) {
                            driver.modify(k => ({ ...k, nitro: NITRO_CHARGE }))
                            shout(`${icon} Nobody to pass!`, 'Full nitro instead')
                        }
                        break
                    case 'montellier':
                        mine = mine.filter(e => !BAD.has(e.kind))
                        fatUntil.delete(you)
                        driver.setFat(false)
                        addEffect('montellier')
                        break
                    case 'popcorn':
                    case 'drumsticks':
                        break
                    default:
                        addEffect(kind)
                }
                return
            }

            const name = options.nameOf(by)
            tell(`${icon} ${name} ate ${info.name}`)
            if (!race.racing) return
            if (kind === 'popcorn') {
                watching = { id: by, until: clock + POPCORN_SECONDS }
                letterbox.querySelector('span')!.textContent = `🍿 Now showing: ${name}`
            }
            if (kind === 'drumsticks') {
                addEffect('frozen')
                shout('🥶 BRAIN FREEZE', `${name} ate the Drumsticks`)
            }
        },

        respawn(id) {
            const item = laid.get(id)
            if (!item) return
            item.eaten = false
            item.model.visible = true
            pending.delete(id)
        },

        teleport(x, z, heading) {
            driver.modify(k => {
                const speed = Math.hypot(k.vx, k.vz)
                return {
                    ...k,
                    x,
                    z,
                    y: world.ground(x, z),
                    heading,
                    vx: -Math.sin(heading) * speed,
                    vz: -Math.cos(heading) * speed,
                    airborne: false,
                }
            })
            effects.burst(x, world.ground(x, z) + 1, z, 'pop')
        },

        clear() {
            for (const item of laid.values()) scene.remove(item.model)
            laid.clear()
            pending.clear()
            mine = []
            trails.length = 0
            points.clear()
            watching = null
            for (const id of fatUntil.keys()) {
                if (id === options.you()) driver.setFat(false)
                else others.setFat(id, false)
            }
            fatUntil.clear()
            letterbox.classList.remove('on')
            frost.classList.remove('on')
            bar.replaceChildren()
            if (tally.size > 0) {
                lastReceipt = [...tally.entries()]
                    .map(([id, items]) => ({
                        name: options.nameOf(id),
                        items,
                        total: items.reduce((sum, kind) => sum + SNACKS[kind].price, 0),
                    }))
                    .sort((a, b) => b.total - a.total)
            }
            tally = new Map()
        },

        mods(kart) {
            return modsFor(mine, underfoot(kart.x, kart.z))
        },

        update(dt, camera, driving) {
            clock += dt
            const kart = driver.kart

            // The snacks turn and bob; far ones aren't drawn. Driving through one: claim it (once).
            for (const [id, item] of laid) {
                if (item.eaten) continue
                const dx = item.spot.x - kart.x
                const dz = item.spot.z - kart.z
                const distance = Math.hypot(dx, dz)
                item.model.visible = distance < DRAW_DISTANCE
                if (!item.model.visible) continue
                item.phase += dt
                item.model.rotation.y = item.phase * SPIN
                item.model.position.y =
                    world.ground(item.spot.x, item.spot.z) + FLOAT + Math.sin(item.phase * 2.5) * 0.25
                if (driving && race.racing && distance < EAT_REACH && !pending.has(id)) {
                    pending.add(id)
                    options.eat(id)
                }
            }

            // Your effects age and wear off.
            for (const effect of mine) effect.age += dt
            mine = mine.filter(e => e.age < lasts(e.kind))
            frost.classList.toggle(
                'on',
                mine.some(e => e.kind === 'frozen')
            )
            for (const [id, until] of fatUntil) {
                if (clock < until) continue
                fatUntil.delete(id)
                if (id === options.you()) driver.setFat(false)
                else others.setFat(id, false)
            }

            // What you look like eating them: fizz, bubbles, sparkle.
            if (clock - lastPuff > 0.06) {
                lastPuff = clock
                for (const effect of mine) {
                    const style =
                        effect.kind === 'coke' && effect.age < 3
                            ? 'fizz'
                            : effect.kind === 'bubly'
                              ? 'bubbles'
                              : effect.kind === 'gokrisp' || effect.kind === 'montellier'
                                ? 'sparkle'
                                : null
                    if (style) effects.burst(kart.x, kart.y + 0.8, kart.z, style)
                }
            }

            // Trails: a point behind whoever is laying one, while it lasts.
            for (const trail of trails) {
                if (clock > trail.until || clock - trail.last < TRAIL_EVERY) continue
                const at = positionOf(trail.by)
                if (!at) continue
                trail.last = clock
                points.add(trail.kind, at.x, at.z, trail.by, clock + TRAIL_LIFE[trail.kind])
            }
            for (let i = trails.length - 1; i >= 0; i--) if (clock > trails[i]!.until) trails.splice(i, 1)
            points.update(clock)

            // Nuts underfoot: hop.
            if (driving && !kart.airborne && clock - lastHop > NUT_HOP.every && underfoot(kart.x, kart.z).nuts) {
                lastHop = clock
                driver.modify(k => ({ ...k, airborne: true, vy: NUT_HOP.speed, y: k.y + 0.05 }))
            }

            // Popcorn: your camera turns to watch whoever ate it.
            const subject = watching && clock < watching.until ? positionOf(watching.id) : null
            if (subject && driving) camera.lookAt(subject.x, subject.y + 1, subject.z)
            if (watching && clock >= watching.until) watching = null
            letterbox.classList.toggle('on', subject !== null && driving)

            if (clock > bannerUntil) banner.classList.remove('on')
            renderBar()
        },

        receipt() {
            return lastReceipt
        },
    }

    const renderBar = () => {
        bar.replaceChildren(
            ...mine.map(effect => {
                const row = document.createElement('div')
                if (BAD.has(effect.kind) || (effect.kind === 'coke' && effect.age >= 3)) row.className = 'bad'
                const icon = effect.kind === 'frozen' ? '🥶' : SNACK_ICONS[effect.kind]
                const name =
                    effect.kind === 'coke'
                        ? effect.age < 3
                            ? 'Sugar rush'
                            : 'Sugar crash'
                        : effect.kind === 'frozen'
                          ? 'Brain freeze'
                          : SNACKS[effect.kind].name
                row.textContent = `${icon} ${name}`
                const track = document.createElement('i')
                const fill = document.createElement('b')
                fill.style.width = `${Math.max(0, 100 * (1 - effect.age / lasts(effect.kind)))}%`
                track.append(fill)
                row.append(track)
                return row
            })
        )
    }

    return play
}

/** Trail points on the ground, one instanced mesh per kind, the oldest overwritten first. */
function createTrailPoints(scene: THREE.Scene, world: DriveWorld) {
    const looks: Record<TrailKind, { geometry: THREE.BufferGeometry; material: THREE.Material; lift: number }> = {
        frost: {
            geometry: new THREE.CircleGeometry(1.5, 14).rotateX(-Math.PI / 2),
            material: new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
            }),
            lift: 0.05,
        },
        crumbs: {
            geometry: new THREE.CircleGeometry(1.1, 10).rotateX(-Math.PI / 2),
            material: new THREE.MeshBasicMaterial({ map: crumbTexture(), transparent: true, depthWrite: false }),
            lift: 0.06,
        },
        nuts: {
            geometry: new THREE.SphereGeometry(0.22, 8, 6),
            material: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }),
            lift: 0.15,
        },
    }
    const kinds = Object.keys(looks) as TrailKind[]
    const sets = new Map(
        kinds.map(kind => {
            const mesh = new THREE.InstancedMesh(looks[kind].geometry, looks[kind].material, TRAIL_POINTS)
            mesh.count = 0
            mesh.frustumCulled = false
            scene.add(mesh)
            return [
                kind,
                { mesh, items: [] as Array<{ x: number; z: number; by: string; until: number }>, dirty: false },
            ]
        })
    )
    const matrix = new THREE.Matrix4()

    return {
        add(kind: TrailKind, x: number, z: number, by: string, until: number) {
            const set = sets.get(kind)!
            set.items.push({ x, z, by, until })
            if (set.items.length > TRAIL_POINTS) set.items.shift()
            set.dirty = true
        },
        near(kind: TrailKind, x: number, z: number, reach: number, except: string): boolean {
            return sets.get(kind)!.items.some(p => p.by !== except && Math.hypot(p.x - x, p.z - z) < reach)
        },
        update(clock: number) {
            for (const [kind, set] of sets) {
                const before = set.items.length
                set.items = set.items.filter(p => p.until > clock)
                if (!set.dirty && set.items.length === before) continue
                set.dirty = false
                set.items.forEach((p, i) => {
                    matrix.makeRotationY(i * 1.7)
                    matrix.setPosition(p.x, world.ground(p.x, p.z) + looks[kind].lift, p.z)
                    set.mesh.setMatrixAt(i, matrix)
                })
                set.mesh.count = set.items.length
                set.mesh.instanceMatrix.needsUpdate = true
            }
        },
        clear() {
            for (const set of sets.values()) {
                set.items = []
                set.mesh.count = 0
            }
        },
    }
}

/** Golden crumbs on a clear ground. */
function crumbTexture(): THREE.Texture {
    if (typeof document === 'undefined') return new THREE.Texture()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    for (let i = 0; i < 40; i++) {
        const angle = i * 2.39
        const r = Math.sqrt(i / 40) * 28
        context.fillStyle = i % 3 ? '#eab308' : '#a16207'
        context.fillRect(32 + Math.cos(angle) * r, 32 + Math.sin(angle) * r, 4, 3)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}
