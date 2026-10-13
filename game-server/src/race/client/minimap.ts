import type { Route } from '../drive/route.ts'
import type { Course, RaceMap } from '../map/format.ts'

/**
 * A round map in the corner, turning with the kart so ahead is always up:
 * streets and buildings (drawn once onto a big canvas, then copied each
 * frame), the course's route, the next gate, and every kart.
 */

/** Pixels per metre on the pre-drawn city. */
const CITY_SCALE = 0.5
/** Metres from the kart to the minimap's edge. */
const RANGE = 300
const COLOURS = {
    ground: '#e8e3d6',
    park: '#b9d9a3',
    water: '#8fc3e3',
    road: '#ffffff',
    building: '#b8ad9c',
    route: '#ff9d1c',
    gate: '#ffd22e',
    checkpoint: '#1fb8d6',
    you: '#d23c3c',
    other: '#2b5fa8',
}

export interface MinimapKart {
    x: number
    z: number
    heading: number
    isYou: boolean
}

export interface Minimap {
    setCourse(course: Course | null, route: Route | null): void
    draw(centre: { x: number; z: number; heading: number }, karts: readonly MinimapKart[], nextGate: number): void
}

export function createMinimap(map: RaceMap, canvas: HTMLCanvasElement): Minimap {
    const city = drawCity(map)
    const context = canvas.getContext('2d')!
    let course: Course | null = null
    let route: Route | null = null

    return {
        setCourse(nextCourse, nextRoute) {
            course = nextCourse
            route = nextRoute
        },

        draw(centre, karts, nextGate) {
            const size = canvas.width
            const half = size / 2
            const scale = half / RANGE
            context.save()
            context.clearRect(0, 0, size, size)
            context.beginPath()
            context.arc(half, half, half - 1, 0, Math.PI * 2)
            context.clip()
            context.fillStyle = COLOURS.ground
            context.fillRect(0, 0, size, size)

            // Map metres to the minimap: the kart in the middle, its heading up.
            context.translate(half, half)
            context.rotate(centre.heading)
            context.scale(scale, scale)
            context.translate(-centre.x, -centre.z)

            context.imageSmoothingEnabled = true
            context.drawImage(city, -map.width / 2, -map.depth / 2, map.width, map.depth)

            if (route) {
                context.strokeStyle = COLOURS.route
                context.lineWidth = 4 / scale
                context.lineJoin = 'round'
                context.beginPath()
                for (let i = 0; i < route.points.length; i += 2) {
                    if (i === 0) context.moveTo(route.points[i]!, route.points[i + 1]!)
                    else context.lineTo(route.points[i]!, route.points[i + 1]!)
                }
                context.stroke()
            }
            // Every checkpoint across its road, the next one in gold and on top.
            const gates = course?.gates ?? []
            const order = gates.map((_, i) => i).sort((a, b) => Number(a === nextGate) - Number(b === nextGate))
            for (const i of order) {
                const gate = gates[i]!
                const half = Math.max(gate.width / 2, 8 / scale)
                context.strokeStyle = i === nextGate ? COLOURS.gate : COLOURS.checkpoint
                context.lineWidth = (i === nextGate ? 5 : 3) / scale
                context.beginPath()
                context.moveTo(gate.x - gate.dz * half, gate.z + gate.dx * half)
                context.lineTo(gate.x + gate.dz * half, gate.z - gate.dx * half)
                context.stroke()
            }

            // Others first, so you're always on top.
            for (const kart of [...karts].sort((a, b) => Number(a.isYou) - Number(b.isYou))) {
                context.save()
                context.translate(kart.x, kart.z)
                context.rotate(-kart.heading)
                context.scale(1 / scale, 1 / scale)
                context.fillStyle = kart.isYou ? COLOURS.you : COLOURS.other
                context.strokeStyle = '#ffffff'
                context.lineWidth = 1.5
                context.beginPath()
                context.moveTo(0, -8)
                context.lineTo(6, 6)
                context.lineTo(0, 3)
                context.lineTo(-6, 6)
                context.closePath()
                context.fill()
                context.stroke()
                context.restore()
            }
            context.restore()

            context.strokeStyle = 'rgba(15, 23, 42, 0.7)'
            context.lineWidth = 3
            context.beginPath()
            context.arc(half, half, half - 1.5, 0, Math.PI * 2)
            context.stroke()
        },
    }
}

/** The whole city, flat, north up: parks, water, streets and buildings. */
function drawCity(map: RaceMap): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(map.width * CITY_SCALE)
    canvas.height = Math.ceil(map.depth * CITY_SCALE)
    const context = canvas.getContext('2d')!
    context.fillStyle = COLOURS.ground
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.setTransform(CITY_SCALE, 0, 0, CITY_SCALE, (map.width / 2) * CITY_SCALE, (map.depth / 2) * CITY_SCALE)

    const polygon = (flat: number[]) => {
        context.beginPath()
        for (let i = 0; i < flat.length; i += 2) {
            if (i === 0) context.moveTo(flat[i]!, flat[i + 1]!)
            else context.lineTo(flat[i]!, flat[i + 1]!)
        }
        context.closePath()
    }

    for (const area of map.areas) {
        if (area.kind !== 'park' && area.kind !== 'wood' && area.kind !== 'water') continue
        context.fillStyle = area.kind === 'water' ? COLOURS.water : COLOURS.park
        polygon(area.outline)
        context.fill()
    }
    context.strokeStyle = COLOURS.road
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const road of map.roads) {
        if (road.kind === 'path' || road.kind === 'sidewalk') continue
        context.lineWidth = road.width
        context.beginPath()
        for (let i = 0; i < road.points.length; i += 2) {
            if (i === 0) context.moveTo(road.points[i]!, road.points[i + 1]!)
            else context.lineTo(road.points[i]!, road.points[i + 1]!)
        }
        context.stroke()
    }
    context.fillStyle = COLOURS.building
    for (const building of map.buildings) {
        polygon(building.outline)
        context.fill()
    }

    return canvas
}
