import type { Group, Object3D } from 'three'
import type { ShoveThings } from '../protocol.ts'
import { bowlingBall, springTrap } from './pickups.ts'

/**
 * Shove's things in the world, from the snapshots: bowling balls rolling (ahead of the last snapshot
 * by their speed, spinning as they go) and spring traps lying (their light red once armed).
 */
export class ShoveViews {
    private readonly balls = new Map<number, Group>()
    private readonly traps = new Map<number, { model: Group; armed: boolean }>()
    private last: ShoveThings | null = null
    private lastAt = 0

    constructor(private readonly parent: Object3D) {
        // One of each, hidden for good: their shaders compile at load.
        const standIns = [bowlingBall(), springTrap(true), springTrap(false)]
        for (const s of standIns) {
            s.visible = false
            parent.add(s)
        }
    }

    /** The latest snapshot's (null outside Shove: nothing shows). */
    set(things: ShoveThings | null, now: number): void {
        this.last = things
        this.lastAt = now
        const balls = new Set(things?.balls.map(b => b.id) ?? [])
        for (const [id, model] of this.balls) {
            if (balls.has(id)) continue
            this.parent.remove(model)
            this.balls.delete(id)
        }
        for (const ball of things?.balls ?? []) {
            if (this.balls.has(ball.id)) continue
            const model = bowlingBall()
            this.parent.add(model)
            this.balls.set(ball.id, model)
        }
        const traps = new Set(things?.traps.map(t => t.id) ?? [])
        for (const [id, trap] of this.traps) {
            if (traps.has(id)) continue
            this.parent.remove(trap.model)
            this.traps.delete(id)
        }
        for (const trap of things?.traps ?? []) {
            const shown = this.traps.get(trap.id)
            if (shown && shown.armed === trap.armed) continue
            if (shown) this.parent.remove(shown.model)
            const model = springTrap(trap.armed)
            model.position.set(trap.x, trap.y, trap.z)
            this.parent.add(model)
            this.traps.set(trap.id, { model, armed: trap.armed })
        }
    }

    /** Each frame: the balls rolled on from where the snapshot had them. */
    update(now: number): void {
        const ahead = Math.min(0.1, (now - this.lastAt) / 1000)
        for (const ball of this.last?.balls ?? []) {
            const model = this.balls.get(ball.id)
            if (!model) continue
            model.position.set(ball.x + ball.vx * ahead, ball.y, ball.z + ball.vz * ahead)
            // Rolling: turned about the axis across its way, as far as it went.
            model.rotation.x += (ball.vz / 0.09) * 0.016
            model.rotation.z -= (ball.vx / 0.09) * 0.016
        }
    }
}
