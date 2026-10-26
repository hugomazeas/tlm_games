import type { Course } from '../map/format.ts'
import { STEP } from './kart.ts'
import { advance, type Point, type Progress, startProgress } from './laps.ts'

/**
 * A race against the clock, counted in physics steps so it times the same
 * on any machine: a countdown with the kart held on the grid, then laps
 * until the last one is done.
 */

/**
 * Before the green light: the drone flies the whole lap (client/cinema.ts),
 * then 3, 2, 1. The flight takes as long as the lap needs at a sightseeing
 * pace (`introFor`); INTRO is a lap without a route's.
 */
export const INTRO = 8
export const FINAL_COUNT = 3
export const COUNTDOWN = INTRO + FINAL_COUNT
/** The drone's pace over a lap, m/s, and how short or long its flight may be, s. */
const FLIGHT = { speed: 140, shortest: 6, longest: 14 }

/** Seconds the drone takes over a lap this long (metres). */
export function introFor(lapLength: number): number {
    return Math.min(FLIGHT.longest, Math.max(FLIGHT.shortest, lapLength / FLIGHT.speed))
}

/** Seconds of the intro still to go (0 once the 3-2-1 starts, or racing). */
export function introLeft(trial: Trial): number {
    return trial.phase === 'countdown' ? Math.max(0, trial.intro - trial.steps * STEP) : 0
}

export interface Trial {
    phase: 'countdown' | 'racing' | 'finished'
    /** Steps since the phase began. */
    steps: number
    progress: Progress
    /** Seconds of drone before the 3-2-1. */
    intro: number
}

export function startTrial(intro = INTRO): Trial {
    return { phase: 'countdown', steps: 0, progress: startProgress(), intro }
}

/** The trial one step later, the kart having moved from `before` to `after`. */
export function stepTrial(course: Course, trial: Trial, before: Point, after: Point): Trial {
    if (trial.phase === 'finished') return trial
    if (trial.phase === 'countdown') {
        const steps = trial.steps + 1
        return steps * STEP >= trial.intro + FINAL_COUNT - 1e-9
            ? { ...trial, phase: 'racing', steps: 0 }
            : { ...trial, steps }
    }

    const progress = advance(course, trial.progress, before, after, trial.steps * STEP, (trial.steps + 1) * STEP)
    const steps = trial.steps + 1

    return { ...trial, phase: progress.finishedAt === null ? 'racing' : 'finished', steps, progress }
}

/** Seconds on the race clock: the finishing time once finished, 0 during the countdown. */
export function raceClock(trial: Trial): number {
    if (trial.phase === 'countdown') return 0
    return trial.progress.finishedAt ?? trial.steps * STEP
}

/** Whole seconds left to count down, 0 once racing. */
export function countdownLeft(trial: Trial): number {
    return trial.phase === 'countdown' ? Math.ceil(trial.intro + FINAL_COUNT - trial.steps * STEP - 1e-9) : 0
}

/** A time as m:ss.cc. */
export function formatTime(seconds: number): string {
    // Round first, so 59.999 reads 1:00.00 and not 0:60.00.
    const hundredths = Math.round(seconds * 100)
    const minutes = Math.floor(hundredths / 6000)

    return `${minutes}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`
}
