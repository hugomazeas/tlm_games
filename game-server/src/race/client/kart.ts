import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { forwardSpeed, type KartState, PACE } from '../drive/kart.ts'

/**
 * A kart in its driver's colours: the body (chassis, nose, side pods) and the
 * accent (wings, the driver's suit, the helmet stripe). Rounded bodywork on a
 * dark floor, an engine with two exhausts, a rear wing on struts, wheels with
 * rims you can see spin (the front ones steer), headlights and brake lights.
 *
 * It moves like it has weight: the body rides on springs (it squats when you
 * accelerate, dips when you brake, rolls out of a corner, bounces on landing),
 * the tail swings out in a drift, the driver turns their head into the bend
 * and the steering wheel turns. A boost flame, a blob shadow, and the
 * driver's name on a tag floating over it. Dust, smoke and sparks are
 * effects.ts's.
 */

/** Who's driving, and the colours they picked in the garage. */
export interface KartLook {
    name: string
    body: string
    accent: string
}

/** A kart nobody has painted: what guests drive. */
export const DEFAULT_LOOK: KartLook = { name: 'Guest', body: '#d23c3c', accent: '#2b5fa8' }

export const WHEEL_RADIUS = 0.35
const TYRE = 0x22262b
const HELMET = 0xf2f2f2
const DARK = 0x23272d
const METAL = 0xb8c0c8
/** The name tag floats this high over the ground under the kart, this wide in metres. */
const TAG = { height: 2.4, width: 2.8 }
/** The springs: stiffness and damping per second², how far they let the body move. */
const SPRING = { stiffness: 140, damping: 11, travel: 0.12 }

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

    const paint = (colour: string | number) =>
        new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.15 })
    const bodyPaint = paint(look.body)
    const accentPaint = paint(look.accent)
    const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.7 })
    const metal = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.3, metalness: 0.6 })
    const tyre = new THREE.MeshLambertMaterial({ color: TYRE })
    const glass = new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.1, metalness: 0.5 })
    const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2cc, emissiveIntensity: 2 })
    const brakeLight = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2020, emissiveIntensity: 0.6 })

    const add = (
        parent: THREE.Object3D,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        name = ''
    ) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(x, y, z)
        mesh.name = name
        parent.add(mesh)

        return mesh
    }
    const rounded = (width: number, height: number, depth: number, radius: number) =>
        new RoundedBoxGeometry(width, height, depth, 3, radius)

    // Bodywork.
    add(body, new THREE.BoxGeometry(1.55, 0.08, 2.7), dark, 0, 0.26, 0, 'floor')
    add(body, rounded(1.25, 0.32, 2.5, 0.12), bodyPaint, 0, 0.44, 0.05, 'chassis')
    add(body, rounded(1.0, 0.26, 0.95, 0.1), bodyPaint, 0, 0.44, -1.45, 'nose')
    for (const side of [-1, 1]) add(body, rounded(0.34, 0.3, 1.3, 0.1), bodyPaint, side * 0.78, 0.44, 0.2, 'pod')
    add(body, new THREE.BoxGeometry(1.7, 0.13, 0.16), dark, 0, 0.32, -1.98, 'bumper')
    add(body, new THREE.BoxGeometry(1.65, 0.05, 0.32), accentPaint, 0, 0.24, -1.86, 'front wing')
    for (const side of [-1, 1]) {
        add(body, new THREE.BoxGeometry(0.22, 0.09, 0.05), headlight, side * 0.36, 0.48, -1.93, 'headlight')
        add(body, new THREE.BoxGeometry(0.2, 0.08, 0.04), brakeLight, side * 0.55, 0.47, 1.31, 'brake light')
    }

    // The engine and its exhausts, the rear wing on struts.
    add(body, new THREE.BoxGeometry(0.8, 0.34, 0.55), dark, 0, 0.66, 1.05, 'engine')
    const pipe = new THREE.CylinderGeometry(0.07, 0.08, 0.42, 10).rotateX(Math.PI / 2)
    for (const side of [-1, 1]) add(body, pipe, metal, side * 0.22, 0.62, 1.45, 'exhaust')
    add(body, new THREE.BoxGeometry(1.7, 0.08, 0.45), accentPaint, 0, 1.08, 1.35, 'wing')
    for (const side of [-1, 1]) {
        add(body, new THREE.BoxGeometry(0.05, 0.32, 0.52), accentPaint, side * 0.86, 1.0, 1.35, 'endplate')
        add(body, new THREE.BoxGeometry(0.06, 0.5, 0.1), dark, side * 0.35, 0.8, 1.3, 'strut')
    }

    // The driver: seat, suit, arms to the wheel, a helmet with a visor and a stripe.
    add(body, new THREE.BoxGeometry(0.62, 0.55, 0.12), dark, 0, 0.82, 0.62, 'seat')
    add(body, rounded(0.6, 0.52, 0.45, 0.1), accentPaint, 0, 0.86, 0.32, 'suit')
    for (const side of [-1, 1]) {
        const arm = add(body, new THREE.BoxGeometry(0.13, 0.13, 0.5), accentPaint, side * 0.3, 0.9, 0.0, 'arm')
        arm.rotation.x = 0.45
    }
    const steeringWheel = new THREE.Group()
    steeringWheel.position.set(0, 0.95, -0.3)
    steeringWheel.rotation.x = -1.0
    body.add(steeringWheel)
    add(steeringWheel, new THREE.TorusGeometry(0.17, 0.035, 6, 16), dark, 0, 0, 0, 'steering wheel')
    add(steeringWheel, new THREE.BoxGeometry(0.3, 0.04, 0.03), dark, 0, 0, 0, 'spoke')
    const head = new THREE.Group()
    head.position.set(0, 1.34, 0.3)
    body.add(head)
    add(
        head,
        new THREE.SphereGeometry(0.28, 16, 12),
        new THREE.MeshStandardMaterial({ color: HELMET, roughness: 0.25 }),
        0,
        0,
        0,
        'helmet'
    )
    add(head, new THREE.BoxGeometry(0.38, 0.12, 0.12), glass, 0, 0.02, -0.22, 'visor')
    add(head, new THREE.BoxGeometry(0.07, 0.03, 0.5), accentPaint, 0, 0.27, 0, 'stripe')

    // Wheels: a tyre, a rim and a cross of spokes, so you can see them turn.
    const tyreGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 16).rotateZ(Math.PI / 2)
    const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12).rotateZ(Math.PI / 2)
    const spokeGeometry = new THREE.BoxGeometry(0.36, 0.38, 0.06)
    const wheels: THREE.Group[] = []
    const steering: THREE.Group[] = []
    for (const [x, z, front] of [
        [-0.85, -0.85, true],
        [0.85, -0.85, true],
        [-0.85, 0.85, false],
        [0.85, 0.85, false],
    ] as const) {
        const pivot = new THREE.Group()
        pivot.position.set(x, WHEEL_RADIUS, z)
        root.add(pivot)
        const wheel = new THREE.Group()
        pivot.add(wheel)
        add(wheel, tyreGeometry, tyre, 0, 0, 0, 'tyre')
        add(wheel, rimGeometry, metal, 0, 0, 0, 'rim')
        add(wheel, spokeGeometry, dark, 0, 0, 0, 'spokes')
        add(wheel, spokeGeometry, dark, 0, 0, 0, 'spokes').rotation.x = Math.PI / 2
        wheels.push(wheel)
        if (front) steering.push(pivot)
    }

    const flame = add(
        body,
        new THREE.ConeGeometry(0.25, 1.2, 10),
        new THREE.MeshBasicMaterial({ color: 0xffb13b }),
        0,
        0.62,
        1.95
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
    let lastSpeed = 0
    let accel = 0
    let wasAirborne = false
    const spring = { height: 0, speed: 0, pitch: 0, roll: 0 }
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

            const speed = forwardSpeed(kart)
            const step = Math.max(dt, 1e-3)
            // Smoothed: poses from the network come in steps.
            accel = THREE.MathUtils.lerp(accel, (speed - lastSpeed) / step, 1 - Math.exp(-6 * dt))
            lastSpeed = speed

            // A drift swings the kart's tail out, the way karts slide.
            driftLean = THREE.MathUtils.lerp(driftLean, kart.drift * 0.4, 1 - Math.exp(-8 * dt))
            body.rotation.y = driftLean

            // The springs: a landing pushes the body down, then it bounces back.
            if (wasAirborne && !kart.airborne) spring.speed -= Math.min(3, 1 + Math.abs(kart.vy) * 0.3)
            wasAirborne = kart.airborne
            spring.speed += (-SPRING.stiffness * spring.height - SPRING.damping * spring.speed) * dt
            spring.height = THREE.MathUtils.clamp(spring.height + spring.speed * dt, -SPRING.travel, SPRING.travel)
            // Squat on the gas (nose up), dive on the brakes; roll out of the bend, more the faster.
            const pitchTarget = THREE.MathUtils.clamp(accel * 0.006, -0.06, 0.05)
            const grip = Math.min(1, Math.abs(speed) / 25)
            const rollTarget = kart.airborne ? 0 : -(steer + kart.drift * 0.5) * grip * 0.07
            spring.pitch = THREE.MathUtils.lerp(spring.pitch, pitchTarget, 1 - Math.exp(-8 * dt))
            spring.roll = THREE.MathUtils.lerp(spring.roll, rollTarget, 1 - Math.exp(-6 * dt))
            body.position.y = spring.height
            body.rotation.x = spring.pitch
            body.rotation.z = spring.roll

            // The ground goes by PACE times faster than the speed says.
            roll += ((speed * PACE) / WHEEL_RADIUS) * dt
            for (const wheel of wheels) wheel.rotation.x = -roll
            for (const pivot of steering) pivot.rotation.y = steer * 0.45 + driftLean * 0.6
            steeringWheel.rotation.z = steer * 1.2
            head.rotation.y = THREE.MathUtils.lerp(
                head.rotation.y,
                steer * 0.35 + kart.drift * 0.25,
                1 - Math.exp(-5 * dt)
            )

            brakeLight.emissiveIntensity = accel < -4 || speed < -0.5 ? 3 : 0.6
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
