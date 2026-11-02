import { BUTTON, type InputFrame } from '../protocol.ts'
import { type Body, type MoveInput, stepBody } from '../sim/movement.ts'
import type { FpsWorld } from '../sim/world.ts'

/**
 * Your own player, ahead of the server. Every 60 Hz step, the frame you send is also applied
 * here at once, with the server's own movement code; when a snapshot says where the server had
 * you after frame `ack`, the frames since are replayed on top of it. Usually that lands where
 * you already were; when it doesn't (a respawn, a wall the server saw), `correction` says by how
 * much, so the camera can glide over small ones and jump on big ones.
 */
export class Prediction {
    body: Body | null = null
    /** Sent, not yet acknowledged, oldest first. */
    private pending: InputFrame[] = []

    constructor(private readonly world: FpsWorld) {}

    /** Steps your body by one frame (alive only) and keeps the frame until the server acknowledges it. */
    apply(frame: InputFrame, alive: boolean): void {
        this.pending.push(frame)
        if (this.pending.length > 120) this.pending.shift()
        if (this.body && alive) this.body = stepBody(this.world, this.body, moveOf(frame))
    }

    /**
     * The server's word: your body after frame `ack`. Returns how far the replayed result is from
     * where you were drawn (metres, as a vector), zero when nothing changed.
     */
    reconcile(ack: number, server: Body, alive: boolean): { x: number; y: number; z: number } {
        const before = this.body
        this.pending = this.pending.filter(f => f.seq > ack)
        let body = server
        if (alive) for (const frame of this.pending) body = stepBody(this.world, body, moveOf(frame))
        this.body = body
        if (!before) return { x: 0, y: 0, z: 0 }

        return { x: before.x - body.x, y: before.y - body.y, z: before.z - body.z }
    }

    get unacknowledged(): number {
        return this.pending.length
    }
}

export function moveOf(frame: InputFrame): MoveInput {
    return {
        forward: frame.forward,
        strafe: frame.strafe,
        yaw: frame.yaw,
        run: (frame.buttons & BUTTON.run) !== 0,
        jet: (frame.buttons & BUTTON.jet) !== 0,
    }
}
