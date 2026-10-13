import type { Course } from '../map/format.ts'
import { STEP } from './kart.ts'
import { advance, type Point, type Progress, startProgress } from './laps.ts'

/**
 * A race against the clock, counted in physics steps so it times the same
 * on any machine: a countdown with the kart held on the grid, then laps
 * until the last one is done.
 */

/** Seconds of countdown before the green light. */
export const COUNTDOWN = 3

export interface Trial {
    phase: 'countdown' | 'racing' | 'finished'
    /** Steps since the phase began. */
    steps: number
    progress: Progress
}

export function startTrial(): Trial {
    return { phase: 'countdown', steps: 0, progress: startProgress() }
}

/** The trial one step later, the kart having moved from `before` to `after`. */
export function stepTrial(course: Course, trial: Trial, before: Point, after: Point): Trial {
    if (trial.phase === 'finished') return trial
    if (trial.phase === 'countdown') {
        const steps = trial.steps + 1
        return steps * STEP >= COUNTDOWN - 1e-9 ? { ...trial, phase: 'racing', steps: 0 } : { ...trial, steps }
    }

    const progress = advance(course, trial.progress, before, after, trial.steps * STEP, (trial.steps + 1) * STEP)
    const steps = trial.steps + 1

    return { phase: progress.finishedAt === null ? 'racing' : 'finished', steps, progress }
}

/** Seconds on the race clock: the finishing time once finished, 0 during the countdown. */
export function raceClock(trial: Trial): number {
    if (trial.phase === 'countdown') return 0
    return trial.progress.finishedAt ?? trial.steps * STEP
}

/** Whole seconds left to count down, 0 once racing. */
export function countdownLeft(trial: Trial): number {
    return trial.phase === 'countdown' ? Math.ceil(COUNTDOWN - trial.steps * STEP - 1e-9) : 0
}

/** A time as m:ss.cc. */
export function formatTime(seconds: number): string {
    // Round first, so 59.999 reads 1:00.00 and not 0:60.00.
    const hundredths = Math.round(seconds * 100)
    const minutes = Math.floor(hundredths / 6000)

    return `${minutes}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`
}
