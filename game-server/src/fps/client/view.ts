import { Vector3 } from 'three'
import { aimDirection } from '../sim/combat.ts'

/** How far the crosshair's point is looked for: past the office's length. */
const LOOK_RANGE = 40
import { type FpsWorld, rayDistance } from '../sim/world.ts'

/**
 * The third-person camera: over your right shoulder, pulled in when a wall is behind you. Your
 * shots still leave from your eyes (the server knows nothing of cameras), so in this view they're
 * aimed from the eyes at whatever is under the crosshair.
 */

export const THIRD_PERSON = {
    /** Behind the shoulder (m): about two minis. */
    back: 0.8,
    up: 0.1,
    shoulder: 0.14,
    /** Kept off walls. */
    margin: 0.05,
}

/** Where the camera sits for eyes at `eye` looking along yaw/pitch. */
export function thirdPersonCamera(world: FpsWorld, eye: Vector3, yaw: number, pitch: number): Vector3 {
    const look = aimDirection(yaw, pitch)
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const offset = right.multiplyScalar(THIRD_PERSON.shoulder).add(new Vector3(0, THIRD_PERSON.up, 0))
    const pivot = eye.clone().add(along(world, eye, offset))

    return pivot.add(along(world, pivot, look.multiplyScalar(-THIRD_PERSON.back)))
}

/** The yaw and pitch that send a shot from `eye` to what the camera's centre sees. */
export function aimFromCamera(
    world: FpsWorld,
    eye: Vector3,
    camera: Vector3,
    yaw: number,
    pitch: number
): { yaw: number; pitch: number } {
    const look = aimDirection(yaw, pitch)
    const target = camera.clone().addScaledVector(look, rayDistance(world, camera, look, LOOK_RANGE))
    const to = target.sub(eye)
    // Something right in front of the lens (a wall you hug): just shoot straight.
    if (to.length() < 0.2) return { yaw, pitch }

    return { yaw: Math.atan2(-to.x, -to.z), pitch: Math.atan2(to.y, Math.hypot(to.x, to.z)) }
}

/** `offset` from `from`, cut short before any wall in the way. */
function along(world: FpsWorld, from: Vector3, offset: Vector3): Vector3 {
    const length = offset.length()
    if (length < 1e-6) return offset
    const direction = offset.clone().divideScalar(length)
    const free = Math.max(0, rayDistance(world, from, direction, length + THIRD_PERSON.margin) - THIRD_PERSON.margin)

    return direction.multiplyScalar(Math.min(length, free))
}
