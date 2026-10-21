import * as THREE from 'three'
import { forwardSpeed, type KartState, MINI_TURBO, SUPER_TURBO } from '../drive/kart.ts'

/**
 * A kart from boxes and cylinders, in its driver's colours: the body (chassis
 * and nose) and the accent (rear wing and the driver's suit). Four wheels
 * (the front ones steer), a white helmet, drift sparks, a boost flame, and
 * the driver's name on a tag floating over it.
 */

/** Who's driving, and the colours they picked in the garage. */
export interface KartLook {
    name: string
    body: string
    accent: string
}

/** A kart nobody has painted: what guests drive. */
export const DEFAULT_LOOK: KartLook = { name: 'Guest', body: '#d23c3c', accent: '#2b5fa8' }

const WHEEL_RADIUS = 0.35
const TYRE = 0x22262b
const HELMET = 0xf2f2f2
const SPARK_COLOURS = { charging: 0xfff6d5, mini: 0x4fa8ff, super: 0xff8a1f }
/** The name tag floats this high over the ground under the kart, this wide in metres. */
const TAG = { height: 2.4, width: 2.8 }

export interface KartModel {
    root: THREE.Group
    /** Repaints the kart (the garage does, as you pick). */
    paint(body: string, accent: string): void
    pose(
        x: number,
        y: number,
        z: number,
        heading: number,
        up: THREE.Vector3,
        kart: KartState,
        steer: number,
        dt: number
    ): void
}

/** The kart; with a name tag over it when `withTag` (it needs a page to draw the text on). */
export function buildKartModel(look: KartLook, withTag = true): KartModel {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    const bodyPaint = new THREE.MeshLambertMaterial({ color: look.body })
    const accentPaint = new THREE.MeshLambertMaterial({ color: look.accent })
    const tyre = new THREE.MeshLambertMaterial({ color: TYRE })
    const add = (
        parent: THREE.Object3D,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number
    ) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(x, y, z)
        parent.add(mesh)

        return mesh
    }
    add(body, new THREE.BoxGeometry(1.5, 0.35, 2.4), bodyPaint, 0, 0.45, 0).name = 'chassis'
    add(body, new THREE.BoxGeometry(1.3, 0.3, 0.7), bodyPaint, 0, 0.5, -1.3).name = 'nose'
    add(body, new THREE.BoxGeometry(1.7, 0.12, 0.4), accentPaint, 0, 0.75, 1.25).name = 'wing'
    add(body, new THREE.BoxGeometry(0.7, 0.55, 0.6), accentPaint, 0, 0.9, 0.25).name = 'suit'
    add(
        body,
        new THREE.SphereGeometry(0.28, 12, 8),
        new THREE.MeshLambertMaterial({ color: HELMET }),
        0,
        1.4,
        0.25
    ).name = 'helmet'

    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14)
    wheelGeometry.rotateZ(Math.PI / 2)
    const wheels: THREE.Mesh[] = []
    const steering: THREE.Group[] = []
    for (const [x, z, front] of [
        [-0.85, -0.85, true],
        [0.85, -0.85, true],
        [-0.85, 0.85, false],
        [0.85, 0.85, false],
    ] as const) {
        const pivot = new THREE.Group()
        pivot.position.set(x, WHEEL_RADIUS, z)
        body.add(pivot)
        wheels.push(add(pivot, wheelGeometry, tyre, 0, 0, 0))
        if (front) steering.push(pivot)
    }

    const sparkMaterial = new THREE.MeshBasicMaterial({ color: SPARK_COLOURS.charging })
    const sparks = [-0.85, 0.85].map(x => add(body, new THREE.SphereGeometry(0.18, 8, 6), sparkMaterial, x, 0.15, 1.15))
    for (const spark of sparks) spark.visible = false
    const flame = add(
        body,
        new THREE.ConeGeometry(0.25, 1.2, 10),
        new THREE.MeshBasicMaterial({ color: 0xffb13b }),
        0,
        0.45,
        1.8
    )
    flame.rotation.x = Math.PI / 2
    flame.visible = false
    // A soft dark patch under the kart: the sun's shadow map is drawn once for the buildings, so karts bring their own.
    const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 3.4).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
            map: blobTexture(),
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
        })
    )
    blob.position.y = 0.04
    root.add(blob)

    // On the root, not the body: the tag stays level and doesn't swing out with a drift.
    const tag = withTag ? nameTag(look) : null
    if (tag) root.add(tag)

    let roll = 0
    let driftLean = 0
    const yaw = new THREE.Quaternion()
    const tilt = new THREE.Quaternion()

    return {
        root,

        paint(bodyColour, accentColour) {
            bodyPaint.color.set(bodyColour)
            accentPaint.color.set(accentColour)
        },

        pose(x, y, z, heading, up, kart, steer, dt) {
            root.position.set(x, y, z)
            yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading)
            tilt.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
            root.quaternion.copy(tilt).multiply(yaw)

            // A drift swings the kart's tail out, the way karts slide.
            driftLean = THREE.MathUtils.lerp(driftLean, kart.drift * 0.4, 1 - Math.exp(-8 * dt))
            body.rotation.y = driftLean

            const speed = forwardSpeed(kart)
            roll += (speed / WHEEL_RADIUS) * dt
            for (const wheel of wheels) wheel.rotation.x = -roll
            for (const pivot of steering) pivot.rotation.y = steer * 0.45

            const charged = kart.charge >= SUPER_TURBO ? 'super' : kart.charge >= MINI_TURBO ? 'mini' : 'charging'
            sparkMaterial.color.setHex(SPARK_COLOURS[charged])
            for (const spark of sparks) {
                spark.visible = kart.drift !== 0 && !kart.airborne
                spark.scale.setScalar(0.7 + Math.random() * 0.6)
            }
            flame.visible = kart.boost > 0
            flame.scale.set(1, 0.8 + Math.random() * 0.5, 1)
            // In the air the patch would fly with the kart: let it fade instead.
            blob.visible = !kart.airborne
        },
    }
}

/** A dark oval fading out to its edges. Shared: every kart's shadow looks the same. Null without a page to draw on. */
let blobMap: THREE.Texture | null = null
function blobTexture(): THREE.Texture | null {
    if (blobMap || typeof document === 'undefined') return blobMap
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    blobMap = new THREE.CanvasTexture(canvas)

    return blobMap
}

/** The driver's name on a dark tag with a stripe of their body colour, always facing the camera. */
function nameTag(look: KartLook): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgba(15, 23, 42, 0.78)'
    context.beginPath()
    context.roundRect(2, 6, 252, 52, 14)
    context.fill()
    context.fillStyle = look.body
    context.beginPath()
    context.roundRect(2, 6, 18, 52, [14, 0, 0, 14])
    context.fill()
    context.fillStyle = '#ffffff'
    context.font = '700 30px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(look.name, 138, 33, 220)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }))
    sprite.scale.set(TAG.width, TAG.width / 4, 1)
    sprite.position.y = TAG.height
    sprite.name = 'name tag'

    return sprite
}
