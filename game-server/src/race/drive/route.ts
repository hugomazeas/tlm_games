import type { Course, Gate, Road, RoadKind } from '../map/format.ts'

/**
 * The way a course actually goes: from each gate to the next along the
 * streets, the shortest way through the road network. Gates only say where
 * to pass; the route is what the minimap draws, where turn signs go, what
 * the HUD arrow follows, and how far each kart is from its next gate.
 */

export interface Route {
    /** The line, as flat [x, z, …], from the start line round to it again. */
    points: number[]
    /** Distance along the route at each point. */
    along: number[]
    length: number
    /** Distance along the route at each gate; gate 0 is at 0. */
    gateAlong: number[]
}

/** A bend in the route: where it's sharpest, which way it goes (1 left, −1 right), and by how much. */
export interface Turn {
    x: number
    z: number
    along: number
    direction: 1 | -1
    /** Radians the route turns through. */
    angle: number
    /** The route's heading at the sharpest point. */
    heading: number
}

/** Kinds a route may follow. */
const ROUTED: readonly RoadKind[] = ['major', 'street', 'service']
/** Turns are found on the route resampled this often, in metres… */
const SAMPLE = 4
/** …comparing its heading this far before and after each point… */
const TURN_REACH = 20
/** …and count when it changes by more than this. */
const TURN_MIN = (40 * Math.PI) / 180

/** The road network as a graph: points where roads meet or bend, joined by the stretches between. */
export class RoadGraph {
    private readonly xs: number[] = []
    private readonly zs: number[] = []
    private readonly keys = new Map<string, number>()
    /** Live edges: each joins two nodes. Splitting one for a gate replaces it. */
    private readonly edges: { a: number; b: number; live: boolean }[] = []
    private readonly adjacent: number[][] = []

    constructor(roads: readonly Road[]) {
        for (const road of roads) {
            if (!ROUTED.includes(road.kind)) continue
            for (let i = 0; i + 3 < road.points.length; i += 2) {
                const a = this.node(road.points[i]!, road.points[i + 1]!)
                const b = this.node(road.points[i + 2]!, road.points[i + 3]!)
                if (a !== b) this.join(a, b)
            }
        }
    }

    /** A node on the network at the gate: on the nearest road, splitting it there. */
    addGate(gate: Pick<Gate, 'x' | 'z'>): number {
        let best = -1
        let bestDistance = Infinity
        let bestT = 0
        this.edges.forEach((edge, index) => {
            if (!edge.live) return
            const [ax, az, bx, bz] = [this.xs[edge.a]!, this.zs[edge.a]!, this.xs[edge.b]!, this.zs[edge.b]!]
            const dx = bx - ax
            const dz = bz - az
            const lengthSquared = dx * dx + dz * dz
            const t = lengthSquared === 0 ? 0 : clamp(((gate.x - ax) * dx + (gate.z - az) * dz) / lengthSquared, 0, 1)
            const distance = Math.hypot(ax + dx * t - gate.x, az + dz * t - gate.z)
            if (distance < bestDistance) {
                best = index
                bestDistance = distance
                bestT = t
            }
        })
        if (best < 0) throw new Error('No road to put a gate on')

        const edge = this.edges[best]!
        if (bestT <= 0) return edge.a
        if (bestT >= 1) return edge.b
        const x = this.xs[edge.a]! + (this.xs[edge.b]! - this.xs[edge.a]!) * bestT
        const z = this.zs[edge.a]! + (this.zs[edge.b]! - this.zs[edge.a]!) * bestT
        const middle = this.node(x, z)
        edge.live = false
        this.adjacent[edge.a] = this.adjacent[edge.a]!.filter(n => n !== edge.b)
        this.adjacent[edge.b] = this.adjacent[edge.b]!.filter(n => n !== edge.a)
        this.join(edge.a, middle)
        this.join(middle, edge.b)

        return middle
    }

    /** The shortest way from one node to another, as the nodes' [x, z] in order; null when they don't connect. */
    path(from: number, to: number): [number, number][] | null {
        const distance = new Map<number, number>([[from, 0]])
        const previous = new Map<number, number>()
        const queue = new MinHeap()
        queue.push(0, from)
        const done = new Set<number>()
        while (queue.size > 0) {
            const [cost, node] = queue.pop()
            if (done.has(node)) continue
            done.add(node)
            if (node === to) break
            for (const next of this.adjacent[node]!) {
                const nextCost = cost + Math.hypot(this.xs[next]! - this.xs[node]!, this.zs[next]! - this.zs[node]!)
                if (nextCost < (distance.get(next) ?? Infinity)) {
                    distance.set(next, nextCost)
                    previous.set(next, node)
                    queue.push(nextCost, next)
                }
            }
        }
        if (from !== to && !previous.has(to)) return null

        const nodes = [to]
        while (nodes[0] !== from) nodes.unshift(previous.get(nodes[0]!)!)

        return nodes.map(node => [this.xs[node]!, this.zs[node]!])
    }

    private node(x: number, z: number): number {
        const key = `${Math.round(x * 100)},${Math.round(z * 100)}`
        let index = this.keys.get(key)
        if (index === undefined) {
            index = this.xs.length
            this.keys.set(key, index)
            this.xs.push(x)
            this.zs.push(z)
            this.adjacent.push([])
        }

        return index
    }

    private join(a: number, b: number): void {
        this.edges.push({ a, b, live: true })
        this.adjacent[a]!.push(b)
        this.adjacent[b]!.push(a)
    }
}

/** The course's route along the streets; null when two gates aren't joined by any road. */
export function courseRoute(course: Course, roads: readonly Road[]): Route | null {
    if (course.gates.length < 2) return null
    const graph = new RoadGraph(roads)
    const nodes = course.gates.map(gate => graph.addGate(gate))

    const points: number[] = []
    const gateAlong: number[] = []
    for (let i = 0; i < nodes.length; i++) {
        const leg = graph.path(nodes[i]!, nodes[(i + 1) % nodes.length]!)
        if (!leg) return null
        // Gate i is where leg i starts: the first point, or the last one of the leg before.
        gateAlong.push(Math.max(0, points.length / 2 - 1))
        for (const [x, z] of points.length > 0 ? leg.slice(1) : leg) points.push(x, z)
    }

    const along = [0]
    for (let i = 2; i < points.length; i += 2) {
        along.push(along.at(-1)! + Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!))
    }

    return {
        points,
        along,
        length: along.at(-1)!,
        // Each gate was recorded by its point's index; turn those into distances.
        gateAlong: gateAlong.map(index => along[index]!),
    }
}

/** The point and heading `distance` metres along the route, wrapping round. */
export function pointAt(route: Route, distance: number): { x: number; z: number; heading: number } {
    const s = ((distance % route.length) + route.length) % route.length
    let i = 1
    while (i < route.along.length - 1 && route.along[i]! < s) i++
    const t = (s - route.along[i - 1]!) / (route.along[i]! - route.along[i - 1]! || 1)
    const [ax, az, bx, bz] = route.points.slice((i - 1) * 2, i * 2 + 2) as [number, number, number, number]

    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(-(bx - ax), -(bz - az)) }
}

/**
 * How far along the route the point closest to x, z is, looking only
 * between `from` and `to` (distances along it; `to` may wrap past the end),
 * so a kart is placed on the stretch it's driving and not on another
 * stretch of the same street driven the other way.
 */
export function locate(route: Route, x: number, z: number, from: number, to: number): number {
    const span = (((to - from) % route.length) + route.length) % route.length || route.length
    let best = from
    let bestDistance = Infinity
    for (let i = 1; i < route.along.length; i++) {
        const [ax, az, bx, bz] = route.points.slice((i - 1) * 2, i * 2 + 2) as [number, number, number, number]
        const dx = bx - ax
        const dz = bz - az
        const lengthSquared = dx * dx + dz * dz
        const t = lengthSquared === 0 ? 0 : clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1)
        const s = route.along[i - 1]! + (route.along[i]! - route.along[i - 1]!) * t
        const offset = (((s - from) % route.length) + route.length) % route.length
        if (offset > span) continue
        const distance = Math.hypot(ax + dx * t - x, az + dz * t - z)
        if (distance < bestDistance) {
            best = s
            bestDistance = distance
        }
    }

    return best
}

/** The route's sharp bends, in order along it. */
export function findTurns(route: Route): Turn[] {
    const count = Math.floor(route.length / SAMPLE)
    const samples = Array.from({ length: count }, (_, i) => pointAt(route, i * SAMPLE))
    const reach = Math.round(TURN_REACH / SAMPLE)
    const change = samples.map((_, i) => {
        const before = samples[(i - reach + count) % count]!
        const after = samples[(i + reach) % count]!

        return wrapAngle(after.heading - before.heading)
    })

    const turns: Turn[] = []
    let i = 0
    // Start counting at a straight bit, so a turn across the start line isn't split in two.
    const start = change.findIndex(c => Math.abs(c) < TURN_MIN)
    if (start < 0) return turns
    while (i < count) {
        const index = (start + i) % count
        if (Math.abs(change[index]!) < TURN_MIN) {
            i++
            continue
        }
        const sign = Math.sign(change[index]!)
        const bend: number[] = []
        while (
            i < count &&
            Math.abs(change[(start + i) % count]!) >= TURN_MIN &&
            Math.sign(change[(start + i) % count]!) === sign
        ) {
            bend.push((start + i) % count)
            i++
        }
        // The sharpest point; on a plateau of equally sharp ones (a square corner), the middle of it.
        const sharpest = Math.max(...bend.map(at => Math.abs(change[at]!)))
        const plateau = bend.filter(at => Math.abs(change[at]!) >= sharpest * 0.95)
        const apex = plateau[Math.floor(plateau.length / 2)]!
        const point = samples[apex]!
        turns.push({
            x: point.x,
            z: point.z,
            along: apex * SAMPLE,
            direction: sign > 0 ? 1 : -1,
            angle: Math.abs(change[apex]!),
            heading: point.heading,
        })
    }

    return turns.sort((a, b) => a.along - b.along)
}

/** An angle brought into (−π, π]. */
function wrapAngle(angle: number): number {
    return angle - Math.ceil((angle - Math.PI) / (2 * Math.PI)) * 2 * Math.PI
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** A binary heap of [cost, node], cheapest first. */
class MinHeap {
    private readonly items: [number, number][] = []

    get size(): number {
        return this.items.length
    }

    push(cost: number, node: number): void {
        const items = this.items
        items.push([cost, node])
        let i = items.length - 1
        while (i > 0) {
            const parent = (i - 1) >> 1
            if (items[parent]![0] <= cost) break
            items[i] = items[parent]!
            i = parent
        }
        items[i] = [cost, node]
    }

    pop(): [number, number] {
        const items = this.items
        const top = items[0]!
        const last = items.pop()!
        if (items.length > 0) {
            let i = 0
            for (;;) {
                const left = i * 2 + 1
                const right = left + 1
                let smallest = i
                const cost = (k: number) => (k === i ? last[0] : items[k]![0])
                if (left < items.length && items[left]![0] < cost(smallest)) smallest = left
                if (right < items.length && items[right]![0] < cost(smallest)) smallest = right
                if (smallest === i) break
                items[i] = items[smallest]!
                i = smallest
            }
            items[i] = last
        }

        return top
    }
}
