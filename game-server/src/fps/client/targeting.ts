import { Vector3 } from 'three'
import { PLAYER } from '../sim/movement.ts'

/** Furthest a name shows (the office is about 22 m end to end). */
const TARGET_RANGE = 30
import { type FpsWorld, rayDistance } from '../sim/world.ts'

/**
 * Who your crosshair is on, for the name and health shown over them: the player nearest the
 * centre of the view (within about a body's width either side of it), in range, with no wall
 * in between. Not who a shot would hit: the label shows up a little before you're dead on.
 */

/** How far either side of the centre line still counts (m, at the target). */
const LEEWAY = 0.25

export interface Candidate {
    id: string
    x: number
    y: number
    z: number
    alive: boolean
    /** Their size (1 when absent). */
    scale?: number
}

export function targetUnderCrosshair(
    world: FpsWorld,
    origin: Vector3,
    direction: Vector3,
    others: Iterable<Candidate>
): string | null {
    let best: string | null = null
    let bestAngle = Infinity
    const to = new Vector3()
    for (const other of others) {
        if (!other.alive) continue
        const scale = other.scale ?? 1
        to.set(other.x, other.y + (PLAYER.height / 2) * scale, other.z).sub(origin)
        const distance = to.length()
        if (distance < 0.05 || distance > TARGET_RANGE) continue
        to.divideScalar(distance)
        const angle = Math.acos(Math.max(-1, Math.min(1, to.dot(direction))))
        if (angle > Math.atan2(LEEWAY * scale, distance) || angle >= bestAngle) continue
        // A wall, glass or a desk in between: you can't see who it is.
        if (rayDistance(world, origin, to, distance) < distance - PLAYER.radius * scale) continue
        best = other.id
        bestAngle = angle
    }

    return best
}
