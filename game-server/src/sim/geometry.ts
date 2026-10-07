export interface Vec {
    x: number
    y: number
}

/** A back-and-forth drift along one axis: offset = sin(2πt / period) × amplitude. */
export interface Mover {
    axis: 'x' | 'y'
    amplitude: number
    periodMs: number
}

/** Rectangles are axis-aligned and positioned by their centre. */
export type Obstacle =
    | { kind: 'rect'; x: number; y: number; w: number; h: number; mover?: Mover }
    | { kind: 'circle'; x: number; y: number; r: number; mover?: Mover }

/** Where an obstacle is at a given time; a static obstacle never moves. */
export function obstacleAt(obstacle: Obstacle, timeMs: number): Obstacle {
    const mover = obstacle.mover
    if (!mover) return obstacle

    const offset = Math.sin((2 * Math.PI * timeMs) / mover.periodMs) * mover.amplitude

    return mover.axis === 'x' ? { ...obstacle, x: obstacle.x + offset } : { ...obstacle, y: obstacle.y + offset }
}

export interface Contact {
    /** Unit vector from the obstacle towards the point. */
    nx: number
    ny: number
    /** Distance from the point to the obstacle's surface; negative when inside. */
    distance: number
}

/** Closest-surface contact between a point and an obstacle at a given time. */
export function contactWith(point: Vec, obstacle: Obstacle, timeMs: number): Contact {
    const o = obstacleAt(obstacle, timeMs)

    if (o.kind === 'circle') {
        const dx = point.x - o.x
        const dy = point.y - o.y
        const length = Math.hypot(dx, dy)

        if (length === 0) return { nx: 1, ny: 0, distance: -o.r }

        return { nx: dx / length, ny: dy / length, distance: length - o.r }
    }

    const hw = o.w / 2
    const hh = o.h / 2
    const dx = point.x - o.x
    const dy = point.y - o.y
    const outsideX = Math.abs(dx) - hw
    const outsideY = Math.abs(dy) - hh

    if (outsideX <= 0 && outsideY <= 0) {
        // Inside: push out through the nearest side.
        return outsideX > outsideY
            ? { nx: Math.sign(dx) || 1, ny: 0, distance: outsideX }
            : { nx: 0, ny: Math.sign(dy) || 1, distance: outsideY }
    }

    const cx = Math.max(0, outsideX) * (Math.sign(dx) || 1)
    const cy = Math.max(0, outsideY) * (Math.sign(dy) || 1)
    const length = Math.hypot(cx, cy)

    return { nx: cx / length, ny: cy / length, distance: length }
}

export function distanceToObstacle(point: Vec, obstacle: Obstacle, timeMs: number): number {
    return contactWith(point, obstacle, timeMs).distance
}

/** The box an obstacle can ever occupy, a mover's whole sweep included. */
export function sweptBox(o: Obstacle): { x: number; y: number; hw: number; hh: number } {
    const hw = (o.kind === 'rect' ? o.w / 2 : o.r) + (o.mover?.axis === 'x' ? o.mover.amplitude : 0)
    const hh = (o.kind === 'rect' ? o.h / 2 : o.r) + (o.mover?.axis === 'y' ? o.mover.amplitude : 0)

    return { x: o.x, y: o.y, hw, hh }
}

/** Gap between two obstacles' swept boxes: conservative, never larger than the real gap. */
export function gapBetween(a: Obstacle, b: Obstacle): number {
    const boxA = sweptBox(a)
    const boxB = sweptBox(b)
    const dx = Math.max(0, Math.abs(boxA.x - boxB.x) - (boxA.hw + boxB.hw))
    const dy = Math.max(0, Math.abs(boxA.y - boxB.y) - (boxA.hh + boxB.hh))

    return Math.hypot(dx, dy)
}
