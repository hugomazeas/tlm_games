import type { PlayerState } from '../protocol.ts'
import { STEP_MS } from '../sim/movement.ts'

/**
 * The other players are drawn a little in the past (INTERP_STEPS), between two snapshots, so they
 * move smoothly at 60 fps from 30 Hz updates. Which step that is also travels with every frame
 * you send (`view`): the server judges your shots against the same moment.
 */

/** 67 ms: two snapshots' worth (30 Hz), so there's nearly always one on each side. */
export const INTERP_STEPS = 4

/** The server's step, read off its snapshots and run forward between them on the local clock. */
export class ServerClock {
    /** Server step minus local time (in steps), smoothed. */
    private offset: number | null = null

    /** A snapshot of step `step` arrived at local time `at` (ms). */
    heard(step: number, at: number): void {
        const sample = step - at / STEP_MS
        if (this.offset === null || Math.abs(sample - this.offset) > 30) {
            this.offset = sample
            return
        }
        // Late packets read as an older clock: lean towards the newest without jumping on jitter.
        const rate = sample > this.offset ? 0.5 : 0.05
        this.offset += (sample - this.offset) * rate
    }

    /** The server's step now (fractional), or null before the first snapshot. */
    step(at: number): number | null {
        return this.offset === null ? null : at / STEP_MS + this.offset
    }

    /** The step the others are drawn at. */
    renderStep(at: number): number | null {
        const now = this.step(at)
        return now === null ? null : now - INTERP_STEPS
    }
}

export interface Pose {
    x: number
    y: number
    z: number
    yaw: number
    pitch: number
    state: PlayerState
}

/** The last second of snapshots, to draw everyone between two of them. */
export class Interpolator {
    private snapshots: Array<{ step: number; players: Map<string, PlayerState> }> = []

    push(step: number, players: readonly PlayerState[]): void {
        if (this.snapshots.length > 0 && step <= this.snapshots.at(-1)!.step) return
        this.snapshots.push({ step, players: new Map(players.map(p => [p.id, p])) })
        while (this.snapshots.length > 20) this.snapshots.shift()
    }

    /** Everyone at `step` (fractional): between the snapshots around it, else the nearest one. */
    sample(step: number): Map<string, Pose> {
        const out = new Map<string, Pose>()
        const list = this.snapshots
        if (list.length === 0) return out

        let after = list.findIndex(s => s.step >= step)
        if (after === -1) after = list.length - 1
        const b = list[after]!
        const a = after > 0 ? list[after - 1]! : b
        const t = b.step === a.step ? 1 : Math.max(0, Math.min(1, (step - a.step) / (b.step - a.step)))
        for (const [id, to] of b.players) {
            const from = a.players.get(id)
            // Just appeared, or came back from the dead: no sliding from where they fell.
            if (!from || from.alive !== to.alive || Math.hypot(to.x - from.x, to.z - from.z) > 2) {
                out.set(id, { x: to.x, y: to.y, z: to.z, yaw: to.yaw, pitch: to.pitch, state: to })
                continue
            }
            out.set(id, {
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t,
                z: from.z + (to.z - from.z) * t,
                yaw: from.yaw + shortestTurn(from.yaw, to.yaw) * t,
                pitch: from.pitch + (to.pitch - from.pitch) * t,
                state: t < 0.5 ? from : to,
            })
        }

        return out
    }
}

function shortestTurn(from: number, to: number): number {
    let d = (to - from) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return d
}
