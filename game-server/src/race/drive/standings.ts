import type { Progress } from './laps.ts'

/**
 * Who's ahead: the finished by their time, then whoever has passed the
 * most gates, then whoever is closer to their next one along the route.
 * Pure, so the server ranks the same way the HUD does.
 */

export interface Racer {
    id: string
    name: string
    progress: Progress
    /** Metres along the route to the next gate. */
    toNextGate: number
}

/** Gates passed since the start: lap 1 begins at the first crossing of the line. */
export function gatesPassed(progress: Progress, gateCount: number): number {
    if (progress.lap === 0) return 0
    if (progress.finishedAt !== null) return progress.lapTimes.length * gateCount + 1

    return (progress.lap - 1) * gateCount + (progress.next === 0 ? gateCount : progress.next)
}

export function standings(racers: readonly Racer[], gateCount: number): Racer[] {
    return [...racers].sort((a, b) => {
        const aDone = a.progress.finishedAt
        const bDone = b.progress.finishedAt
        if (aDone !== null || bDone !== null) {
            if (aDone === null) return 1
            if (bDone === null) return -1
            if (aDone !== bDone) return aDone - bDone
        }
        const passed = gatesPassed(b.progress, gateCount) - gatesPassed(a.progress, gateCount)
        if (passed !== 0) return passed
        if (a.toNextGate !== b.toNextGate) return a.toNextGate - b.toNextGate

        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(position: number): string {
    const tens = position % 100
    const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][position % 10] ?? 'th')

    return `${position}${suffix}`
}
