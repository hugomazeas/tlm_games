import type * as THREE from 'three'
import { forwardSpeed, NITRO_CHARGE, STEP } from '../drive/kart.ts'
import { bestLap, gridSlot, isWrongWay, respawnPoint } from '../drive/laps.ts'
import { courseRoute, locate, orientAlongRoute, pointAt, type Route } from '../drive/route.ts'
import { ordinal } from '../drive/standings.ts'
import { countdownLeft, formatTime, raceClock, startTrial, stepTrial, type Trial } from '../drive/trial.ts'
import type { DriveWorld } from '../drive/world.ts'
import type { Course, Road } from '../map/format.ts'
import { buildCourseView, type CourseView } from './course.ts'
import type { Driver } from './drive.ts'
import { createSpeedometer, pointArrow } from './hud.ts'
import type { Minimap, MinimapKart } from './minimap.ts'

/**
 * Racing a track. The lobby (main.ts) says when: `countdown` puts the kart
 * on its grid slot and holds it there until the green light, `end` lets it
 * go once the race is over. In between, laps and the clock are counted
 * here, step by step, exactly as the server counts them from the steps
 * reported through `onSample`. R puts you back on your last checkpoint.
 *
 * While driving: a speedometer, a minimap, and during a race the standings
 * (the server's) and an arrow pointing the way the route goes next.
 *
 * Checkpoints have no direction: the course is turned to face the way its
 * route goes through each one, for the grid, resets and the wrong-way warning.
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
    roads: readonly Road[]
    minimap: Minimap
    panel: HTMLElement
    banner: HTMLElement
    standingsPanel: HTMLElement
    arrow: HTMLElement
    speedometer: HTMLCanvasElement
    /** You crossed the finish line, here: confetti. */
    onFinish?: (x: number, y: number, z: number) => void
}

/** A line of the standings, leader first, as the lobby ranks the racers. */
export interface StandingLine {
    name: string
    isYou: boolean
}

export interface Race {
    update(driving: boolean, others: readonly MinimapKart[]): void
    /** Puts the kart on grid slot `slot`, stopped. */
    placeOnGrid(slot: number): void
    /** The race is on: on grid slot `slot`, held there through the countdown. */
    countdown(slot: number): void
    /** The race is over: free driving again. */
    end(): void
    /** Each step of the race, where the kart got to and the race clock then (seconds). */
    onSample: ((x: number, z: number, t: number) => void) | null
    setStandings(lines: readonly StandingLine[] | null): void
    setRecord(record: { name: string; time: number } | null): void
    /** A Chipwich jumped you ahead: your race is now level with the kart you passed. */
    level(progress: { lap: number; next: number; lastGate: number }): void
    /** Racing now (green light given, not finished): when snacks can be eaten. */
    readonly racing: boolean
}

export function createRace(options: RaceOptions): Race {
    const { world, scene, driver, panel, banner, standingsPanel, arrow, minimap } = options
    const speedometer = createSpeedometer(options.speedometer)
    const route: Route | null = options.course ? courseRoute(options.course, options.roads) : null
    const course = options.course && route ? orientAlongRoute(options.course, route) : options.course
    let view: CourseView | null = null
    let trial: Trial | null = null
    let lines: readonly StandingLine[] | null = null
    let record: { name: string; time: number } | null = null

    if (course) {
        view = buildCourseView(course, world.ground)
        scene.add(view.group)
        view.setNext(0)
    }
    minimap.setCourse(course, route)

    const race: Race = {
        onSample: null,

        placeOnGrid(slot) {
            if (!course) return
            const at = gridSlot(course, slot)
            driver.place(at.x, at.z, at.heading)
        },

        countdown(slot) {
            if (!course) return
            race.placeOnGrid(slot)
            trial = startTrial()
            lines = null
            driver.frozen = true
            driver.onStep = (before, after) => {
                if (!trial) return
                const wasRacing = trial.phase === 'racing'
                trial = stepTrial(course, trial, before, after)
                driver.frozen = trial.phase === 'countdown'
                view?.setNext(trial.phase === 'finished' ? -1 : trial.progress.next)
                // Every racing step, and the one that crosses the finish line.
                if (trial.phase === 'racing' || (wasRacing && trial.phase === 'finished')) {
                    race.onSample?.(after.x, after.z, trial.steps * STEP)
                }
                if (wasRacing && trial.phase === 'finished') options.onFinish?.(after.x, after.y, after.z)
            }
            driver.onReset = () => {
                if (!trial) return
                const point = respawnPoint(course, trial.progress)
                driver.place(point.x, point.z, point.heading)
            }
            view?.setNext(0)
        },

        level(progress) {
            if (!trial) return
            trial = { ...trial, progress: { ...trial.progress, ...progress } }
            view?.setNext(progress.next)
        },

        get racing() {
            return trial?.phase === 'racing'
        },

        end() {
            trial = null
            lines = null
            driver.frozen = false
            driver.onStep = null
            driver.onReset = null
            view?.setNext(0)
        },

        setStandings(next) {
            lines = next
        },

        setRecord(next) {
            record = next
        },

        update(driving, others) {
            const here = options.here()
            const kart = driver.kart
            minimap.draw(
                here,
                [...others, ...(driving ? [{ x: kart.x, z: kart.z, heading: kart.heading, isYou: true }] : [])],
                trial && trial.phase !== 'finished' ? trial.progress.next : 0
            )
            options.speedometer.hidden = !driving
            if (driving) {
                speedometer.draw({
                    kmh: Math.max(0, forwardSpeed(kart)) * KMH,
                    boosting: kart.boost > 0,
                    charge: kart.drift !== 0 ? kart.charge : 0,
                    nitro: kart.nitro / NITRO_CHARGE,
                })
            }

            banner.textContent = ''
            arrow.hidden = true
            standingsPanel.hidden = true
            const recordLine = record ? `Record ${formatTime(record.time)} · ${record.name}` : ''
            if (!trial || !course) {
                panel.textContent = course
                    ? [`${course.name} · ${course.laps} ${course.laps === 1 ? 'lap' : 'laps'}`, recordLine]
                          .filter(Boolean)
                          .join('\n')
                    : 'Free roam'
                return
            }

            const { progress } = trial
            const best = bestLap(progress)
            panel.textContent = [
                `${course.name}`,
                `Lap ${Math.max(1, Math.min(progress.lap, course.laps))}/${course.laps}   ${formatTime(raceClock(trial))}`,
                progress.lapTimes.length > 0 ? `Last ${formatTime(progress.lapTimes.at(-1)!)}` : '',
                best !== null ? `Best ${formatTime(best)}` : '',
                recordLine,
            ]
                .filter(Boolean)
                .join('\n')

            if (route && trial.phase !== 'finished') {
                const gateCount = course.gates.length
                const along = locate(
                    route,
                    kart.x,
                    kart.z,
                    route.gateAlong[(progress.next - 1 + gateCount) % gateCount]!,
                    route.gateAlong[progress.next]!
                )
                const ahead = pointAt(route, along + ARROW_AHEAD)
                arrow.hidden = trial.phase !== 'racing'
                pointArrow(arrow, Math.atan2(-(ahead.x - kart.x), -(ahead.z - kart.z)), kart.heading)
            }

            const order = lines ?? [{ name: 'You', isYou: true }]
            const position = order.findIndex(line => line.isYou) + 1
            standingsPanel.hidden = false
            standingsPanel.replaceChildren(
                ...(position > 0
                    ? [
                          Object.assign(document.createElement('div'), {
                              className: 'position',
                              textContent: ordinal(position),
                          }),
                      ]
                    : []),
                ...order.map((line, i) =>
                    Object.assign(document.createElement('div'), {
                        className: line.isYou ? 'you' : '',
                        textContent: `${i + 1}. ${line.isYou ? 'You' : line.name}`,
                    })
                )
            )

            if (trial.phase === 'countdown') banner.textContent = String(countdownLeft(trial))
            else if (trial.phase === 'finished') {
                const place = position > 0 && lines ? ` · ${ordinal(position)}` : ''
                banner.textContent = `Finished ${formatTime(raceClock(trial))}${place}`
            } else if (raceClock(trial) < GO_SECONDS) banner.textContent = 'GO!'
            else if (forwardSpeed(kart) > WRONG_WAY_SPEED && isWrongWay(course, progress, kart, kart.heading)) {
                banner.textContent = 'WRONG WAY'
            }
        },
    }

    return race
}
