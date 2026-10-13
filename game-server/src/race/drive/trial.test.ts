import { describe, expect, test } from 'bun:test'
import type { Course } from '../map/format.ts'
import { STEP } from './kart.ts'
import { COUNTDOWN, countdownLeft, formatTime, raceClock, startTrial, stepTrial, type Trial } from './trial.ts'

/** Three gates on a straight east–west line, one lap: start at x 0, then 50 and 100. */
const line: Course = {
    slug: 'line',
    name: 'Line',
    laps: 1,
    gates: [
        { x: 0, z: 0, dx: 1, dz: 0, width: 10 },
        { x: 50, z: 0, dx: 1, dz: 0, width: 10 },
        { x: 100, z: 0, dx: 1, dz: 0, width: 10 },
    ],
}

const still = { x: -5, z: 0 }

/** Runs `steps` steps moving `speed` metres a step east from x. */
function drive(trial: Trial, from: number, speed: number, steps: number): { trial: Trial; x: number } {
    let x = from
    for (let i = 0; i < steps; i++) {
        trial = stepTrial(line, trial, { x, z: 0 }, { x: x + speed, z: 0 })
        x += speed
    }

    return { trial, x }
}

describe('a time trial', () => {
    test('counts down, then starts the clock', () => {
        let trial = startTrial()
        expect(countdownLeft(trial)).toBe(COUNTDOWN)
        expect(raceClock(trial)).toBe(0)
        for (let i = 0; i < COUNTDOWN / STEP - 1; i++) trial = stepTrial(line, trial, still, still)
        expect(trial.phase).toBe('countdown')
        expect(countdownLeft(trial)).toBe(1)
        trial = stepTrial(line, trial, still, still)
        expect(trial.phase).toBe('racing')
        expect(countdownLeft(trial)).toBe(0)
    })

    test('the clock counts steps while racing', () => {
        const racing: Trial = { ...startTrial(), phase: 'racing' }
        const { trial } = drive(racing, -5, 0, 60)
        expect(raceClock(trial)).toBeCloseTo(1)
    })

    test('a lap of the course over, the clock stops at the line', () => {
        // 1 m a step from x = -5: the start line at step 5, the finish (gate 0 again) never on a line…
        const racing: Trial = { ...startTrial(), phase: 'racing' }
        let { trial, x } = drive(racing, -5, 1, 110)
        expect(trial.progress).toMatchObject({ lap: 1, next: 0 })
        // …so come back round to the start line from behind it, as a loop would.
        trial = stepTrial(line, trial, { x: -1, z: 0 }, { x: 1, z: 0 })
        expect(trial.phase).toBe('finished')
        expect(raceClock(trial)).toBeCloseTo(110.5 * STEP)
        expect(stepTrial(line, trial, { x, z: 0 }, { x: x + 1, z: 0 })).toBe(trial)
    })
})

test('formatTime', () => {
    expect(formatTime(0)).toBe('0:00.00')
    expect(formatTime(65.432)).toBe('1:05.43')
    expect(formatTime(9.999)).toBe('0:10.00')
    expect(formatTime(59.999)).toBe('1:00.00')
})
