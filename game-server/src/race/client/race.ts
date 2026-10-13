import type * as THREE from 'three'
import { forwardSpeed } from '../drive/kart.ts'
import { bestLap, gridSlot, isWrongWay, respawnPoint } from '../drive/laps.ts'
import { courseRoute, findTurns, locate, pointAt, type Route } from '../drive/route.ts'
import { ordinal, standings } from '../drive/standings.ts'
import { countdownLeft, formatTime, raceClock, startTrial, stepTrial, type Trial } from '../drive/trial.ts'
import type { DriveWorld } from '../drive/world.ts'
import type { Course, Road } from '../map/format.ts'
import { buildCourseView, type CourseView } from './course.ts'
import type { Driver } from './drive.ts'
import { buildGuides } from './guides.ts'
import { createSpeedometer, pointArrow } from './hud.ts'
import type { Minimap } from './minimap.ts'

/**
 * Racing a track, alone against the clock for now: T starts a time trial
 * on the grid (again to restart), X stops it, R puts you back on your last
 * checkpoint. Tracks are laid out in the Hub's track editor (track-editor.ts).
 *
 * While driving: a speedometer, a minimap, and during a race the standings
 * and an arrow pointing the way the route goes next; chevrons and road
 * arrows mark each bend of the course.
 */

/** Below this speed you aren't really going the wrong way, just turning round. */
const WRONG_WAY_SPEED = 3
/** How long "GO!" stays up after the countdown. */
const GO_SECONDS = 1
/** The HUD arrow points at the route this far ahead of the kart. */
const ARROW_AHEAD = 30
const KMH = 3.6

export interface RaceOptions {
    world: DriveWorld
    scene: THREE.Scene
    driver: Driver
    /** The track to race; null for free roam. */
    course: Course | null
    /** Where the player is now, on the ground, and which way they face. */
    here: () => { x: number; z: number; heading: number }
    /** Switches to driving, for a trial started while flying. */
    startDriving: () => void
    roads: readonly Road[]
    minimap: Minimap
    panel: HTMLElement
    banner: HTMLElement
    standingsPanel: HTMLElement
    arrow: HTMLElement
    speedometer: HTMLCanvasElement
}

export function createRace(options: RaceOptions): { update(driving: boolean): void } {
    const { world, scene, driver, course, panel, banner, standingsPanel, arrow, minimap } = options
    const speedometer = createSpeedometer(options.speedometer)
    let route: Route | null = null
    let guides: THREE.Group | null = null
    let view: CourseView | null = null
    let trial: Trial | null = null

    if (course) {
        view = buildCourseView(course, world.ground)
        scene.add(view.group)
        view.setNext(0)
        route = courseRoute(course, options.roads)
        if (route) scene.add(buildGuides(route, findTurns(route), world))
    }
    minimap.setCourse(course, route)

    const stopTrial = () => {
        trial = null
        driver.frozen = false
        driver.onStep = null
        driver.onReset = null
        view?.setNext(0)
    }

    const startTrialOnGrid = (course: Course) => {
        options.startDriving()
        const slot = gridSlot(course, 0)
        driver.place(slot.x, slot.z, slot.heading)
        trial = startTrial()
        driver.frozen = true
        driver.onStep = (before, after) => {
            if (!trial) return
            const wasFinished = trial.phase === 'finished'
            trial = stepTrial(course, trial, before, after)
            driver.frozen = trial.phase === 'countdown'
            view?.setNext(trial.phase === 'finished' ? -1 : trial.progress.next)
            if (!wasFinished && trial.phase === 'finished') savePersonalBest(course.slug, trial)
        }
        driver.onReset = () => {
            if (!trial) return
            const point = respawnPoint(course, trial.progress)
            driver.place(point.x, point.z, point.heading)
        }
        view?.setNext(0)
    }

    document.addEventListener('keydown', event => {
        if (event.repeat || !course) return
        if (event.code === 'KeyT') startTrialOnGrid(course)
        else if (event.code === 'KeyX') stopTrial()
    })

    return {
        update(driving) {
            const here = options.here()
            const kart = driver.kart
            minimap.draw(
                here,
                driving ? [{ x: kart.x, z: kart.z, heading: kart.heading, isYou: true }] : [],
                trial && trial.phase !== 'finished' ? trial.progress.next : 0
            )
            options.speedometer.hidden = !driving
            if (driving) {
                speedometer.draw({
                    kmh: Math.max(0, forwardSpeed(kart)) * KMH,
                    boosting: kart.boost > 0,
                    charge: kart.drift !== 0 ? kart.charge : 0,
                })
            }

            banner.textContent = ''
            arrow.hidden = true
            standingsPanel.hidden = true
            if (!trial || !course) {
                panel.textContent = course ? `${course.name} · ${course.laps} laps\nT start a time trial` : 'Free roam'
                return
            }

            const { progress } = trial
            const best = bestLap(progress)
            const record = personalBest(course.slug)
            const lines = [
                `${course.name}`,
                `Lap ${Math.max(1, Math.min(progress.lap, course.laps))}/${course.laps}   ${formatTime(raceClock(trial))}`,
                progress.lapTimes.length > 0 ? `Last ${formatTime(progress.lapTimes.at(-1)!)}` : '',
                best !== null ? `Best ${formatTime(best)}` : '',
                record ? `Record ${formatTime(record.total)} (lap ${formatTime(record.lap)})` : '',
                trial.phase === 'finished' ? 'T race again · X done' : 'R back to last gate · X stop',
            ]
            panel.textContent = lines.filter(Boolean).join('\n')

            // Where you are on the route: on the stretch between the last gate and the next.
            const gateCount = course.gates.length
            let toNextGate = Math.hypot(
                course.gates[progress.next]!.x - kart.x,
                course.gates[progress.next]!.z - kart.z
            )
            if (route && trial.phase !== 'finished') {
                const from = route.gateAlong[(progress.next - 1 + gateCount) % gateCount]!
                const to = route.gateAlong[progress.next]!
                const along = locate(route, kart.x, kart.z, from, to)
                toNextGate = (((to - along) % route.length) + route.length) % route.length
                const ahead = pointAt(route, along + ARROW_AHEAD)
                arrow.hidden = trial.phase !== 'racing'
                pointArrow(arrow, Math.atan2(-(ahead.x - kart.x), -(ahead.z - kart.z)), kart.heading)
            }
            const order = standings([{ id: 'you', name: 'You', progress, toNextGate }], gateCount)
            const position = order.findIndex(racer => racer.id === 'you') + 1
            standingsPanel.hidden = false
            standingsPanel.replaceChildren(
                Object.assign(document.createElement('div'), { className: 'position', textContent: ordinal(position) }),
                ...order.map((racer, i) =>
                    Object.assign(document.createElement('div'), {
                        className: racer.id === 'you' ? 'you' : '',
                        textContent: `${i + 1}. ${racer.name}`,
                    })
                )
            )

            if (trial.phase === 'countdown') banner.textContent = String(countdownLeft(trial))
            else if (trial.phase === 'finished') banner.textContent = `Finished ${formatTime(raceClock(trial))}`
            else if (raceClock(trial) < GO_SECONDS) banner.textContent = 'GO!'
            else if (forwardSpeed(kart) > WRONG_WAY_SPEED && isWrongWay(course, progress, kart, kart.heading)) {
                banner.textContent = 'WRONG WAY'
            }
        },
    }
}

interface Record {
    total: number
    lap: number
}

/** The best finishing time and best lap on a course, kept in this browser. */
function personalBest(slug: string): Record | null {
    try {
        return JSON.parse(localStorage.getItem(`race:record:${slug}`) ?? 'null') as Record | null
    } catch {
        return null
    }
}

function savePersonalBest(slug: string, trial: Trial): void {
    const previous = personalBest(slug)
    const total = raceClock(trial)
    const lap = bestLap(trial.progress) ?? total
    localStorage.setItem(
        `race:record:${slug}`,
        JSON.stringify({
            total: Math.min(total, previous?.total ?? Infinity),
            lap: Math.min(lap, previous?.lap ?? Infinity),
        })
    )
}
