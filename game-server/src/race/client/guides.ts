import * as THREE from 'three'
import { pointAt, type Route, type Turn } from '../drive/route.ts'
import type { DriveWorld } from '../drive/world.ts'

/**
 * Showing the way round a course: red and white chevron boards on the
 * outside of each bend, and a big arrow painted on the road before it,
 * curving the way to go.
 */

/** Bends at least this sharp get three boards; gentler ones get one. */
const SHARP = (65 * Math.PI) / 180
const BOARD = { width: 2.4, height: 1.2, raise: 0.9, spacing: 7, past: 1.5 }
/** The road arrow lies this far before the bend… */
const ARROW_LEAD = 35
/** …unless the last bend is closer than this, when one arrow does for both. */
const ARROW_GAP = 50
const ARROW = { width: 3.2, length: 7, lift: 0.15 }

export function buildGuides(route: Route, turns: readonly Turn[], world: DriveWorld): THREE.Group {
    const group = new THREE.Group()
    const boardMaterials = {
        left: new THREE.MeshBasicMaterial({ map: chevronTexture(1), side: THREE.DoubleSide }),
        right: new THREE.MeshBasicMaterial({ map: chevronTexture(-1), side: THREE.DoubleSide }),
    }
    const boardGeometry = new THREE.PlaneGeometry(BOARD.width, BOARD.height)
    const postGeometry = new THREE.CylinderGeometry(0.06, 0.06, BOARD.raise, 6)
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8a8f96 })

    const arrows = { positions: [] as number[], uvs: [] as number[] }

    turns.forEach((turn, index) => {
        // Boards stand on the outside of the bend, facing the karts coming into it.
        const offsets = turn.angle >= SHARP ? [-BOARD.spacing, 0, BOARD.spacing] : [0]
        for (const offset of offsets) {
            const point = pointAt(route, turn.along + offset)
            const road = world.nearestRoad(point.x, point.z, point.heading)
            const reach = (road?.width ?? 8) / 2 + BOARD.past
            // Right of the way you face is (cos h, −sin h); a left bend's outside is on the right.
            const outside = -turn.direction
            const x = point.x + Math.cos(point.heading) * reach * outside
            const z = point.z - Math.sin(point.heading) * reach * outside
            const y = world.ground(x, z)

            const board = new THREE.Mesh(boardGeometry, turn.direction > 0 ? boardMaterials.left : boardMaterials.right)
            board.position.set(x, y + BOARD.raise + BOARD.height / 2, z)
            // A plane faces +z; turned to the kart's heading it faces back down the road, at the kart.
            board.rotation.y = point.heading
            group.add(board)
            const post = new THREE.Mesh(postGeometry, postMaterial)
            post.position.set(x, y + BOARD.raise / 2, z)
            group.add(post)
        }

        const previous = turns[(index - 1 + turns.length) % turns.length]!
        const sincePrevious = (((turn.along - previous.along) % route.length) + route.length) % route.length
        if (turns.length > 1 && sincePrevious < ARROW_GAP) return
        addRoadArrow(
            arrows,
            pointAt(route, turn.along - Math.min(ARROW_LEAD, sincePrevious / 2)),
            turn.direction,
            world
        )
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrows.positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrows.uvs, 2))
    group.add(
        new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ map: roadArrowTexture(), transparent: true, side: THREE.DoubleSide })
        )
    )

    return group
}

/** An arrow laid on the road at a point of the route, pointing along it and curving left (1) or right (−1). */
function addRoadArrow(
    arrows: { positions: number[]; uvs: number[] },
    point: { x: number; z: number; heading: number },
    direction: 1 | -1,
    world: DriveWorld
): void {
    const forward = { x: -Math.sin(point.heading), z: -Math.cos(point.heading) }
    const right = { x: Math.cos(point.heading), z: -Math.sin(point.heading) }
    const corner = (across: number, along: number, u: number, v: number) => {
        const x = point.x + right.x * across + forward.x * along
        const z = point.z + right.z * across + forward.z * along
        arrows.positions.push(x, world.ground(x, z) + ARROW.lift, z)
        // The texture curves left; a right turn reads it mirrored.
        arrows.uvs.push(direction > 0 ? u : 1 - u, v)
    }
    const w = ARROW.width / 2
    const l = ARROW.length / 2
    corner(-w, -l, 0, 0)
    corner(w, -l, 1, 0)
    corner(w, l, 1, 1)
    corner(-w, -l, 0, 0)
    corner(w, l, 1, 1)
    corner(-w, l, 0, 1)
}

/** White chevrons on red, pointing left (1) or right (−1). */
function chevronTexture(direction: 1 | -1): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = '#d9262c'
    context.fillRect(0, 0, 128, 64)
    context.fillStyle = '#ffffff'
    for (const centre of [36, 92]) {
        const tip = centre - 22 * direction
        const back = centre + 14 * direction
        context.beginPath()
        context.moveTo(tip, 32)
        context.lineTo(back, 6)
        context.lineTo(back + 14 * direction, 6)
        context.lineTo(tip + 14 * direction, 32)
        context.lineTo(back + 14 * direction, 58)
        context.lineTo(back, 58)
        context.closePath()
        context.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}

/** A white arrow going up the texture, then bending left. */
function roadArrowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    context.fillStyle = 'rgba(255, 255, 255, 0.92)'
    context.lineWidth = 12
    context.lineCap = 'butt'
    // Canvas y runs down, the texture's v up: the arrow starts at the bottom (the near end).
    context.beginPath()
    context.moveTo(40, 124)
    context.lineTo(40, 60)
    context.quadraticCurveTo(40, 40, 22, 40)
    context.stroke()
    context.beginPath()
    context.moveTo(2, 40)
    context.lineTo(24, 20)
    context.lineTo(24, 60)
    context.closePath()
    context.fill()
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}
