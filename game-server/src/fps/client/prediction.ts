import type { InputFrame } from '../protocol.ts'
import { type Body, moveOf, stepBody } from '../sim/movement.ts'
import type { FpsWorld } from '../sim/world.ts'

/** Closer than this (metres, m/s, fuel), the server's body is the one predicted. */
const AGREE = 1e-6

/**
 * Your own player, ahead of the server. Every 60 Hz step, the frame you send is also applied
 * here at once, with the server's own movement code; when a snapshot says where the server had
 * you after frame `ack`, the frames since are replayed on top of it. Usually that lands where
 * you already were; when it doesn't (a respawn, a wall the server saw), `correction` says by how
 * much, so the camera can glide over small ones and jump on big ones.
 *
 * Each frame keeps the body it predicted, so a snapshot that agrees (nearly all of them: same
 * code, same frames) replays nothing. Replaying every time cost a step per frame in flight, on
 * every snapshot: the further behind the server, the slower the tab, the further behind.
 */
export class Prediction {
    body: Body | null = null
    /** Sent, not yet acknowledged, oldest first, with the body each one left here. */
    private pending: Array<{ frame: InputFrame; body: Body | null }> = []
    /** The last frame acknowledged, and the body it left here. */
    private acked: { seq: number; body: Body | null } | null = null

    constructor(private readonly world: FpsWorld) {}

    /** Steps your body by one frame (alive only) and keeps the frame until the server acknowledges it. */
    apply(frame: InputFrame, alive: boolean): void {
        if (this.body && alive) this.body = stepBody(this.world, this.body, moveOf(frame))
        this.pending.push({ frame, body: this.body })
        if (this.pending.length > 120) this.pending.shift()
    }

    /**
     * The server's word: your body after frame `ack`. Returns how far the replayed result is from
     * where you were drawn (metres, as a vector), zero when nothing changed.
     */
    reconcile(ack: number, server: Body, alive: boolean): { x: number; y: number; z: number } {
        const before = this.body
        while (this.pending.length > 0 && this.pending[0]!.frame.seq <= ack) {
            const { frame, body } = this.pending.shift()!
            this.acked = { seq: frame.seq, body }
        }
        const predicted = this.acked?.seq === ack ? this.acked.body : null
        if (alive && before && predicted && agrees(predicted, server)) return { x: 0, y: 0, z: 0 }

        let body = server
        if (alive) {
            for (const entry of this.pending) {
                body = stepBody(this.world, body, moveOf(entry.frame))
                entry.body = body
            }
        }
        this.acked = { seq: ack, body: server }
        this.body = body
        if (!before) return { x: 0, y: 0, z: 0 }

        return { x: before.x - body.x, y: before.y - body.y, z: before.z - body.z }
    }

    get unacknowledged(): number {
        return this.pending.length
    }
}

function agrees(a: Body, b: Body): boolean {
    return (
        Math.abs(a.x - b.x) < AGREE &&
        Math.abs(a.y - b.y) < AGREE &&
        Math.abs(a.z - b.z) < AGREE &&
        Math.abs(a.vx - b.vx) < AGREE &&
        Math.abs(a.vy - b.vy) < AGREE &&
        Math.abs(a.vz - b.vz) < AGREE &&
        Math.abs(a.fuel - b.fuel) < AGREE &&
        a.onGround === b.onGround &&
        a.dashLeft === b.dashLeft &&
        a.dashCooldown === b.dashCooldown &&
        a.jetBoost === b.jetBoost
    )
}
