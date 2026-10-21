import * as THREE from 'three'
import type { Course } from '../map/format.ts'

/**
 * A course's checkpoints in the scene, as holograms: two glowing posts and
 * a curtain of light across the road, with no direction (a checkpoint is
 * crossed either way). The one to drive through next glows gold, the rest
 * cyan. The start line also gets a chequered banner and a chequered strip
 * across the road.
 */

const POST = { height: 3.4, radius: 0.12 }
const START_POST_HEIGHT = 5.2
const BANNER = { bottom: 4.4, height: 0.8, depth: 0.25 }
const CURTAIN_HEIGHT = 3
const NEXT = { colour: 0xffd22e, opacity: 0.95 }
const OTHER = { colour: 0x3fe0ff, opacity: 0.4 }
const START_LINE_DEPTH = 1.6
const LINE_LIFT = 0.16

export interface CourseView {
    group: THREE.Group
    /** Lights up gate `index`; −1 lights none. */
    setNext(index: number): void
    dispose(): void
}

export function buildCourseView(course: Course, ground: (x: number, z: number) => number): CourseView {
    const group = new THREE.Group()
    const chequer = chequerTexture()
    const curtain = curtainTexture()
    const disposables: { dispose(): void }[] = [chequer, curtain]
    /** Each gate's tinted materials, so the next one can be lit up. */
    const tinted: THREE.MeshBasicMaterial[][] = []
    const hologram = (map: THREE.Texture, own: THREE.MeshBasicMaterial[]) => {
        const material = new THREE.MeshBasicMaterial({
            map,
            color: OTHER.colour,
            transparent: true,
            opacity: OTHER.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
        own.push(material)
        disposables.push(material)

        return material
    }

    course.gates.forEach((gate, index) => {
        const isStart = index === 0
        const gateGroup = new THREE.Group()
        const y = ground(gate.x, gate.z)
        gateGroup.position.set(gate.x, y, gate.z)
        // Local x runs across the gate, local -z through it.
        gateGroup.rotation.y = Math.atan2(-gate.dx, -gate.dz)
        group.add(gateGroup)

        const own: THREE.MeshBasicMaterial[] = []
        tinted.push(own)
        const half = gate.width / 2
        const postHeight = isStart ? START_POST_HEIGHT : POST.height
        const postMaterial = new THREE.MeshBasicMaterial({ color: OTHER.colour })
        own.push(postMaterial)
        disposables.push(postMaterial)
        for (const side of [-half, half]) {
            const across = { x: gate.x - gate.dz * side, z: gate.z + gate.dx * side }
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(POST.radius, POST.radius, postHeight, 8),
                postMaterial
            )
            // Posts stand on the ground at their own spot, not the gate's centre.
            post.position.set(side, ground(across.x, across.z) - y + postHeight / 2, 0)
            gateGroup.add(post)
            disposables.push(post.geometry)
        }

        const curtainMesh = new THREE.Mesh(new THREE.PlaneGeometry(gate.width, CURTAIN_HEIGHT), hologram(curtain, own))
        curtainMesh.position.set(0, CURTAIN_HEIGHT / 2, 0)
        gateGroup.add(curtainMesh)
        disposables.push(curtainMesh.geometry)

        if (isStart) {
            // Squares as tall as half the banner, however wide the road.
            const squares = chequer.clone()
            squares.wrapS = THREE.RepeatWrapping
            squares.repeat.set(gate.width / (BANNER.height * 2), 1)
            squares.needsUpdate = true
            const bannerMaterial = new THREE.MeshBasicMaterial({ map: squares })
            disposables.push(bannerMaterial, squares)
            const banner = new THREE.Mesh(
                new THREE.BoxGeometry(gate.width, BANNER.height, BANNER.depth),
                bannerMaterial
            )
            banner.position.set(0, BANNER.bottom + BANNER.height / 2, 0)
            gateGroup.add(banner)
            disposables.push(banner.geometry)

            const line = startLine(gate, ground, chequer)
            group.add(line)
            const lineMaterial = line.material as THREE.MeshBasicMaterial
            disposables.push(line.geometry, lineMaterial, lineMaterial.map!)
        }
    })

    return {
        group,
        setNext(index) {
            tinted.forEach((own, i) => {
                for (const material of own) {
                    material.color.setHex(i === index ? NEXT.colour : OTHER.colour)
                    if (material.transparent) material.opacity = i === index ? NEXT.opacity : OTHER.opacity
                }
            })
        },
        dispose() {
            group.removeFromParent()
            for (const item of disposables) item.dispose()
        },
    }
}

/** Bright at the ground, fading out upwards, with faint scan lines. */
function curtainTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 64
    const context = canvas.getContext('2d')!
    const fade = context.createLinearGradient(0, 64, 0, 0)
    fade.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
    fade.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = fade
    context.fillRect(0, 0, 4, 64)
    context.fillStyle = 'rgba(0, 0, 0, 0.35)'
    for (let y = 0; y < 64; y += 4) context.fillRect(0, y, 4, 1)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}

/** A chequered strip across the road under the start gate, following the ground. */
function startLine(
    gate: Course['gates'][number],
    ground: (x: number, z: number) => number,
    chequer: THREE.Texture
): THREE.Mesh {
    const positions: number[] = []
    const uvs: number[] = []
    const corner = (across: number, along: number, u: number, v: number) => {
        const x = gate.x - gate.dz * across + gate.dx * along
        const z = gate.z + gate.dx * across + gate.dz * along
        positions.push(x, ground(x, z) + LINE_LIFT, z)
        uvs.push(u, v)
    }
    const half = gate.width / 2
    const repeat = gate.width / START_LINE_DEPTH
    const a = START_LINE_DEPTH / 2
    corner(-half, -a, 0, 0)
    corner(half, -a, repeat, 0)
    corner(half, a, repeat, 1)
    corner(-half, -a, 0, 0)
    corner(half, a, repeat, 1)
    corner(-half, a, 0, 1)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    const texture = chequer.clone()
    texture.wrapS = THREE.RepeatWrapping
    texture.needsUpdate = true

    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
}

/** Black and white squares, two rows. */
function chequerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    const context = canvas.getContext('2d')!
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 2; row++) {
            context.fillStyle = (col + row) % 2 === 0 ? '#111111' : '#f4f4f4'
            context.fillRect(col * 16, row * 16, 16, 16)
        }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.NearestFilter

    return texture
}
