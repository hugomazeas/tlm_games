import * as THREE from 'three'
import type { KartState } from '../drive/kart.ts'
import { pointAt, type Route } from '../drive/route.ts'
import { INTRO } from '../drive/trial.ts'
import type { DriveWorld } from '../drive/world.ts'
import type { Pose } from '../protocol.ts'
import { groundNormal } from './drive.ts'
import type { Effects } from './effects.ts'
import { buildKartModel, type KartLook, type KartModel } from './kart.ts'

/**
 * The race on TV:
 *
 * - `flyover`: before the green light, a drone flies the whole lap high over
 *   the city, then dives in behind your kart for 3, 2, 1.
 * - The replay: the last few seconds of every kart are kept; when you cross
 *   the line they play again in slow motion, cut between trackside cameras,
 *   with black bars and a REPLAY badge.
 * - The podium: once the race is over, the first three karts on gold, silver
 *   and bronze blocks by the start line, confetti, the camera circling them.
 */

/**
 * The drone flies the whole lap, start line to start line, in the time the
 * lobby gave it (drive/trial.ts introFor): at least this high, higher over a
 * long lap (a metre per this many metres of lap, up to the ceiling) so it
 * still glides; looking this far ahead; the last seconds blend into the chase
 * camera.
 */
const DRONE = { height: 55, metresPerMetre: 25, ceiling: 140, ahead: 120, blend: 1.4 }
/** Kept for the replay: this many seconds of every kart. */
const KEEP = 8
/** The replay: the last this-many seconds before your finish, at this speed, a new camera every so often. */
const REPLAY = { seconds: 6, speed: 0.5, shot: 1.6 }
const PODIUM = { spacing: 3.4, heights: [1.2, 0.8, 0.5], colours: [0xfacc15, 0xcbd5e1, 0xd97706], orbit: 12 }

/** One kart in one frame of the recording. */
export interface Take {
    id: string
    look: KartLook
    pose: Pose
}

interface Frame {
    t: number
    takes: Take[]
}

/**
 * Puts the camera on the drone for progress `p` (0–1 of a `seconds`-long
 * intro), the whole lap round, blending into the chase camera at the end.
 */
export function flyover(
    route: Route,
    world: DriveWorld,
    camera: THREE.PerspectiveCamera,
    p: number,
    seconds = INTRO
): void {
    // A steady glide with soft ends (half straight, half eased), the whole lap.
    const eased = 0.5 * p + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * p))
    const along = (eased * route.length) % route.length
    const here = pointAt(route, along)
    const ahead = pointAt(route, along + DRONE.ahead)
    const height = Math.min(DRONE.ceiling, Math.max(DRONE.height, route.length / DRONE.metresPerMetre))
    const drone = new THREE.Vector3(here.x, world.ground(here.x, here.z) + height, here.z)
    const target = new THREE.Vector3(ahead.x, world.ground(ahead.x, ahead.z), ahead.z)

    // The chase camera has already been placed this frame: the end of the flight comes down into it.
    const chase = camera.position.clone()
    const chaseLook = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(10).add(chase)
    const k = THREE.MathUtils.smoothstep(p, 1 - DRONE.blend / seconds, 1)
    camera.position.lerpVectors(drone, chase, k)
    camera.lookAt(target.lerp(chaseLook, k))
}

export interface Cinema {
    /** Every frame of a race: the karts now (yours first). */
    record(dt: number, takes: Take[]): void
    /** Your finish, in slow motion; `done` when it's over (or skipped). */
    replay(done: () => void): void
    /** The first three on the podium, until `stop`. */
    podium(top: Array<{ id: string; look: KartLook }>, at: { x: number; z: number; across: number }): void
    /** Ends whatever is showing. */
    stop(): void
    readonly showing: 'replay' | 'podium' | null
    /** Moves the camera (and the karts) for what's showing. */
    update(dt: number, camera: THREE.PerspectiveCamera): void
}

export function createCinema(scene: THREE.Scene, world: DriveWorld, effects: Effects, overlay: HTMLElement): Cinema {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    const bars = document.createElement('div')
    bars.id = 'race-cinema'
    bars.innerHTML = '<span class="badge"><i></i>REPLAY</span><span class="caption"></span>'
    overlay.appendChild(bars)
    const caption = bars.querySelector<HTMLElement>('.caption')!

    let frames: Frame[] = []
    let clock = 0
    let showing: Cinema['showing'] = null
    let onDone: (() => void) | null = null
    const actors = new Map<string, KartModel>()
    const stage = new THREE.Group()
    scene.add(stage)

    // Replay state.
    let footage: Frame[] = []
    let playhead = 0
    let shotStart = -Infinity
    const shotCamera = new THREE.Vector3()
    let side = 1
    // Podium state.
    let centre = new THREE.Vector3()
    let orbit = 0
    let nextConfetti = 0
    /** Where each kart stands on the podium. */
    const standing = new Map<string, { x: number; y: number; z: number; heading: number }>()

    const actor = (id: string, look: KartLook) => {
        let model = actors.get(id)
        if (!model) {
            model = buildKartModel(look)
            actors.set(id, model)
            stage.add(model.root)
        }
        model.root.visible = true
        return model
    }
    const clearStage = () => {
        for (const model of actors.values()) stage.remove(model.root)
        actors.clear()
        standing.clear()
        for (const child of [...stage.children]) stage.remove(child)
    }
    const show = (what: Cinema['showing'], text: string) => {
        showing = what
        bars.classList.toggle('on', what !== null)
        bars.classList.toggle('replay', what === 'replay')
        caption.textContent = text
    }

    /** The recording at time t, each kart between the two frames around it. */
    const sample = (t: number): Take[] => {
        let i = footage.findIndex(frame => frame.t >= t)
        if (i <= 0) i = Math.max(1, footage.length - 1)
        const a = footage[i - 1]!
        const b = footage[i]!
        const k = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1)
        return b.takes.map(take => {
            const before = a.takes.find(other => other.id === take.id)?.pose ?? take.pose
            const pose = take.pose
            return {
                ...take,
                pose: {
                    ...pose,
                    x: THREE.MathUtils.lerp(before.x, pose.x, k),
                    y: THREE.MathUtils.lerp(before.y, pose.y, k),
                    z: THREE.MathUtils.lerp(before.z, pose.z, k),
                    heading: before.heading + wrap(pose.heading - before.heading) * k,
                    speed: THREE.MathUtils.lerp(before.speed, pose.speed, k),
                },
            }
        })
    }

    return {
        get showing() {
            return showing
        },

        record(dt, takes) {
            clock += dt
            frames.push({ t: clock, takes })
            while (frames.length > 0 && frames[0]!.t < clock - KEEP) frames.shift()
        },

        replay(done) {
            footage = frames.filter(frame => frame.t >= clock - REPLAY.seconds)
            if (footage.length < 2) return done()
            onDone = done
            playhead = footage[0]!.t
            shotStart = -Infinity
            show('replay', '')
        },

        podium(top, at) {
            this.stop()
            if (top.length === 0) return
            centre = new THREE.Vector3(at.x, world.ground(at.x, at.z), at.z)
            const acrossX = Math.cos(at.across)
            const acrossZ = Math.sin(at.across)
            // Gold in the middle, silver on its left, bronze on its right.
            const places = [0, -1, 1]
            top.slice(0, 3).forEach((driver, i) => {
                const offset = places[i]! * PODIUM.spacing
                const x = at.x + acrossX * offset
                const z = at.z + acrossZ * offset
                const ground = world.ground(x, z)
                const height = PODIUM.heights[i]!
                const block = new THREE.Mesh(
                    new THREE.BoxGeometry(3, height, 3),
                    new THREE.MeshStandardMaterial({
                        color: PODIUM.colours[i],
                        metalness: 0.6,
                        roughness: 0.3,
                        emissive: PODIUM.colours[i],
                        emissiveIntensity: 0.25,
                    })
                )
                block.position.set(x, ground + height / 2, z)
                stage.add(block)
                const label = placeLabel(i + 1)
                label.position.set(x, ground + height + 0.01, z)
                stage.add(label)
                const model = actor(driver.id, driver.look)
                standing.set(driver.id, { x, y: ground + height, z, heading: at.across + Math.PI / 2 })
                model.celebrate('finish')
            })
            orbit = 0
            nextConfetti = 0
            show('podium', `🏆 ${top[0] ? 'Winner' : ''}`)
            caption.textContent = '🏆 Press any key to drive'
        },

        stop() {
            if (showing === null) return
            show(null, '')
            clearStage()
            const done = onDone
            onDone = null
            done?.()
        },

        update(dt, camera) {
            if (showing === 'replay') {
                playhead += dt * REPLAY.speed
                const end = footage[footage.length - 1]!.t
                if (playhead >= end) return this.stop()
                const takes = sample(playhead)
                for (const take of takes) {
                    const model = actor(take.id, take.look)
                    const up = take.pose.airborne
                        ? new THREE.Vector3(0, 1, 0)
                        : groundNormal(world, take.pose.x, take.pose.z)
                    model.pose(
                        take.pose.x,
                        take.pose.y,
                        take.pose.z,
                        take.pose.heading,
                        up,
                        asKart(take.pose),
                        take.pose.steer,
                        dt * REPLAY.speed
                    )
                }
                // Follow your kart (the first take) from a trackside camera, a new one every shot.
                const subject = takes[0]!.pose
                if (playhead - shotStart > REPLAY.shot) {
                    shotStart = playhead
                    side = -side
                    const forwardX = -Math.sin(subject.heading)
                    const forwardZ = -Math.cos(subject.heading)
                    // Ahead of the kart and off to one side: it drives past the camera.
                    const lead = 10 + Math.max(0, subject.speed) * REPLAY.shot * 0.6
                    shotCamera.set(
                        subject.x + forwardX * lead + forwardZ * 7 * side,
                        0,
                        subject.z + forwardZ * lead - forwardX * 7 * side
                    )
                    shotCamera.y = world.ground(shotCamera.x, shotCamera.z) + (side > 0 ? 1.2 : 3.5)
                }
                camera.position.copy(shotCamera)
                camera.lookAt(subject.x, subject.y + 0.8, subject.z)
                camera.fov = THREE.MathUtils.lerp(camera.fov, 40, 1 - Math.exp(-4 * dt))
                camera.updateProjectionMatrix()
                return
            }
            if (showing === 'podium') {
                orbit += dt * 0.25
                camera.position.set(
                    centre.x + Math.sin(orbit) * PODIUM.orbit,
                    centre.y + 4.5,
                    centre.z + Math.cos(orbit) * PODIUM.orbit
                )
                camera.lookAt(centre.x, centre.y + 1.4, centre.z)
                camera.fov = 50
                camera.updateProjectionMatrix()
                for (const [id, model] of actors) {
                    const at = standing.get(id)
                    if (at) model.pose(at.x, at.y, at.z, at.heading, UP, PARKED, 0, dt)
                }
                nextConfetti -= dt
                if (nextConfetti <= 0) {
                    nextConfetti = 1.6
                    effects.confetti(centre.x, centre.y + 2, centre.z)
                }
            }
        },
    }
}

const UP = new THREE.Vector3(0, 1, 0)

/** Standing still, for the podium. */
const PARKED: KartState = {
    ...{ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, airborne: false },
    ...{ drift: 0, charge: 0, boost: 0, padCooldown: 0, sinking: 0, surface: 'road' },
    ...{ nitro: 0, surge: 0 },
}

/** A recorded pose as the kart model wants it. */
function asKart(pose: Pose): KartState {
    return {
        ...PARKED,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        vx: -Math.sin(pose.heading) * pose.speed,
        vz: -Math.cos(pose.heading) * pose.speed,
        heading: pose.heading,
        airborne: pose.airborne,
        drift: pose.drift,
        charge: pose.charge,
        boost: pose.boost ? 1 : 0,
    }
}

function wrap(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** "1", "2", "3" painted on top of a block. */
function placeLabel(place: number): THREE.Mesh {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgba(15, 23, 42, 0.85)'
    context.font = '900 96px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(place), 64, 70)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
    )
    return label
}

const CSS = `
    #race-cinema { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.4s; box-shadow: inset 0 9vh 0 #000, inset 0 -9vh 0 #000; z-index: 45; }
    #race-cinema.on { opacity: 1; }
    #race-cinema .badge { position: absolute; top: calc(9vh + 14px); right: 24px; display: none; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 6px; background: rgb(220 38 38 / 0.9); color: #fff; font: 900 18px system-ui, sans-serif; letter-spacing: 0.1em; }
    #race-cinema.replay .badge { display: flex; }
    #race-cinema .badge i { width: 10px; height: 10px; border-radius: 50%; background: #fff; animation: race-blink 1s steps(2) infinite; }
    #race-cinema .caption { position: absolute; bottom: 3vh; left: 0; right: 0; text-align: center; color: #fde68a; font: 800 20px system-ui, sans-serif; }
    @keyframes race-blink { 50% { opacity: 0; } }
`
