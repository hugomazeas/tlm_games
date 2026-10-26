import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { forwardSpeed, type KartState, PACE } from '../drive/kart.ts'
import { DEFAULT_SPONSOR, type Livery, type Pattern, PLAIN } from '../livery.ts'

/**
 * A racing kart in its driver's colours and livery.
 *
 * Bodywork in clear-coated paint that reflects the sky (`setKartEnvironment`):
 * the body colour on the chassis, nose and side pods, the accent on the wings,
 * the suit and the helmet stripe, on a carbon-fibre floor. Front and rear wings
 * with endplates and flaps, side pods with air intakes, an engine with cooling
 * fins, an airbox and two chrome exhausts whose tips glow, a roll hoop.
 *
 * Under it, the mechanics: wheels with tread, five-spoke rims and brake discs
 * that glow red after hard braking (the callipers stay put while the wheel
 * turns), wishbones and coil springs that compress as the body moves.
 *
 * The livery (the garage's): the race number on the pods and the nose, a pattern
 * in the accent colour (stripes, flames, a maple leaf, checks, lightning) and
 * the dépanneur's sponsor stickers.
 *
 * And it's alive: the body rides on springs (squat, dive, roll, a bounce on
 * landing), the tail swings out in a drift, the driver's arms really turn the
 * wheel, their head leans into bends and now and then glances back, and they
 * punch the air when they pass someone or win. Exhausts pop when you lift off.
 * A boost flame, a blob shadow, and the driver's name floating over it.
 * Dust, smoke and sparks are effects.ts's.
 */

/** Who's driving: their name, colours and livery as the garage has them. */
export interface KartLook extends Partial<Livery> {
    name: string
    body: string
    accent: string
}

/** A kart nobody has painted: what guests drive. */
export const DEFAULT_LOOK: KartLook = { name: 'Guest', body: '#d23c3c', accent: '#2b5fa8', ...PLAIN }

export const WHEEL_RADIUS = 0.35
const HELMET = 0xf2f2f2
const DARK = 0x1c1f24
const CHROME = 0xe5e7eb
const CALLIPER = 0xdc2626
/** The name tag floats this high over the ground under the kart, this wide in metres. */
const TAG = { height: 2.6, width: 2.8 }
/** The springs: stiffness and damping per second², how far they let the body move. */
const SPRING = { stiffness: 140, damping: 11, travel: 0.12 }
/** Wheel hubs, as x, z (front ones first). */
const HUBS: ReadonlyArray<readonly [number, number, boolean]> = [
    [-0.86, -0.88, true],
    [0.86, -0.88, true],
    [-0.88, 0.9, false],
    [0.88, 0.9, false],
]

export interface KartModel {
    root: THREE.Group
    /** Repaints the kart (the garage does, as you pick). */
    paint(body: string, accent: string): void
    /** Puts on a livery: number, pattern, stickers. */
    dress(livery: Livery): void
    /** Chips: the bodywork (and the driver) bulge out; false puts them back. */
    setFat(fat: boolean): void
    /** The driver punches the air: after passing someone, or at the finish. */
    celebrate(how: 'overtake' | 'finish'): void
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

/** Every kart's reflective materials, so a new sky reaches them all. */
const reflective = new Set<THREE.MeshStandardMaterial>()
let environment: THREE.Texture | null = null

/** The sky the karts reflect (the atmosphere renders one per race's sky; the garage a studio). */
export function setKartEnvironment(texture: THREE.Texture | null): void {
    environment = texture
    for (const material of reflective) {
        material.envMap = texture
        material.needsUpdate = true
    }
}

/** The kart; with a name tag over it when `withTag` (it needs a page to draw the text on). */
export function buildKartModel(look: KartLook, withTag = true): KartModel {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    const shiny = <T extends THREE.MeshStandardMaterial>(material: T, envMapIntensity = 1): T => {
        material.envMap = environment
        material.envMapIntensity = envMapIntensity
        reflective.add(material)
        return material
    }
    const carPaint = (colour: string) =>
        shiny(
            // The colour stays the colour (not much metal), the clear coat gives the shine and the sky in it.
            new THREE.MeshPhysicalMaterial({
                color: colour,
                metalness: 0,
                roughness: 0.55,
                clearcoat: 0.8,
                clearcoatRoughness: 0.08,
            }),
            0.3
        )
    const bodyPaint = carPaint(look.body)
    const accentPaint = carPaint(look.accent)
    const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.75 })
    const carbon = shiny(new THREE.MeshStandardMaterial({ map: carbonTexture(), roughness: 0.4, metalness: 0.35 }), 0.6)
    const chrome = shiny(new THREE.MeshStandardMaterial({ color: CHROME, metalness: 1, roughness: 0.12 }), 1.4)
    const steel = shiny(new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.35 }))
    // Gunmetal rims: they read as wheels, not as white discs.
    const rim = shiny(new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.85, roughness: 0.3 }), 0.8)
    const rubber = new THREE.MeshStandardMaterial({ map: treadTexture(), color: 0x2a2d33, roughness: 0.92 })
    const visor = shiny(
        new THREE.MeshPhysicalMaterial({ color: 0x0b1220, metalness: 0.9, roughness: 0.05, clearcoat: 1 }),
        1.6
    )
    const helmet = shiny(
        new THREE.MeshPhysicalMaterial({ color: HELMET, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })
    )
    const glove = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })
    const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2cc, emissiveIntensity: 2.2 })
    const brakeLight = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2020, emissiveIntensity: 0.6 })
    const exhaustTip = new THREE.MeshStandardMaterial({ color: 0x3f3f46, emissive: 0xff6a00, emissiveIntensity: 0 })
    const disc = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        metalness: 0.8,
        roughness: 0.4,
        emissive: 0xff3300,
        emissiveIntensity: 0,
    })
    const screen = new THREE.MeshStandardMaterial({ color: 0x052e16, emissive: 0x22c55e, emissiveIntensity: 1.2 })

    // Static parts are gathered here and merged per material at the end: one draw each, however detailed.
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
    const piece = (
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        rotation: [number, number, number] = [0, 0, 0]
    ) => {
        const placed = geometry.clone()
        placed.applyMatrix4(
            new THREE.Matrix4().compose(
                new THREE.Vector3(x, y, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
                new THREE.Vector3(1, 1, 1)
            )
        )
        const list = parts.get(material) ?? []
        list.push(placed)
        parts.set(material, list)
    }
    /** A part that moves, or that tests and the garage look up by name. */
    const part = (
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
    const box = (width: number, height: number, depth: number) => new THREE.BoxGeometry(width, height, depth)
    const cylinder = (top: number, bottom: number, height: number, segments = 14) =>
        new THREE.CylinderGeometry(top, bottom, height, segments)

    // The tub: carbon floor, the painted chassis and nose (named: the garage and tests find them), side pods.
    piece(box(1.5, 0.06, 2.75), carbon, 0, 0.24, 0.02)
    part(body, rounded(1.2, 0.3, 2.3, 0.13), bodyPaint, 0, 0.43, 0.08, 'chassis')
    part(body, rounded(0.92, 0.24, 1.05, 0.11), bodyPaint, 0, 0.42, -1.42, 'nose')
    piece(rounded(0.6, 0.16, 0.5, 0.07), bodyPaint, 0, 0.4, -2.0)
    for (const side of [-1, 1]) {
        piece(rounded(0.36, 0.32, 1.35, 0.12), bodyPaint, side * 0.78, 0.43, 0.22)
        // The pods' air intakes, facing forward.
        piece(box(0.26, 0.2, 0.04), dark, side * 0.78, 0.45, -0.46)
    }

    // Wings. Front: a main plane, a flap above it, endplates. Rear: main plane and flap on struts, endplates.
    part(body, box(1.7, 0.04, 0.34), accentPaint, 0, 0.22, -1.96, 'front wing')
    piece(box(1.6, 0.03, 0.18), accentPaint, 0, 0.29, -1.88, [-0.25, 0, 0])
    for (const side of [-1, 1]) piece(box(0.03, 0.2, 0.42), accentPaint, side * 0.86, 0.27, -1.94)
    part(body, box(1.72, 0.06, 0.42), accentPaint, 0, 1.1, 1.38, 'wing')
    piece(box(1.68, 0.04, 0.22), accentPaint, 0, 1.2, 1.5, [0.35, 0, 0])
    for (const side of [-1, 1]) {
        piece(box(0.04, 0.36, 0.56), accentPaint, side * 0.87, 1.08, 1.4)
        piece(box(0.05, 0.5, 0.08), carbon, side * 0.32, 0.82, 1.3)
    }

    // The engine behind the seat: block, cooling fins, the airbox over the driver's shoulders, a roll hoop.
    piece(box(0.78, 0.32, 0.55), dark, 0, 0.66, 1.05)
    for (let i = 0; i < 6; i++) piece(box(0.82, 0.02, 0.5), steel, 0, 0.56 + i * 0.05, 1.05)
    piece(rounded(0.32, 0.26, 0.55, 0.08), bodyPaint, 0, 0.95, 0.85)
    piece(box(0.18, 0.14, 0.04), dark, 0, 0.98, 0.57)
    piece(new THREE.TorusGeometry(0.3, 0.035, 8, 20, Math.PI), chrome, 0, 0.95, 0.62, [0, 0, 0])
    const pipe = cylinder(0.065, 0.075, 0.48, 12).rotateX(Math.PI / 2)
    const tip = cylinder(0.075, 0.075, 0.05, 12).rotateX(Math.PI / 2)
    const exhausts: THREE.Vector3[] = []
    for (const side of [-1, 1]) {
        piece(pipe, chrome, side * 0.22, 0.62, 1.48)
        part(body, tip, exhaustTip, side * 0.22, 0.62, 1.74)
        exhausts.push(new THREE.Vector3(side * 0.22, 0.62, 1.8))
    }

    // Lights.
    for (const side of [-1, 1]) {
        part(body, box(0.2, 0.08, 0.04), headlight, side * 0.32, 0.47, -1.96, 'headlight')
        part(body, box(0.18, 0.07, 0.04), brakeLight, side * 0.52, 0.47, 1.33, 'brake light')
    }

    // The cockpit: seat, steering column and a wheel with a little display.
    piece(box(0.62, 0.55, 0.1), dark, 0, 0.82, 0.62)
    piece(cylinder(0.025, 0.025, 0.55, 8), steel, 0, 0.78, -0.48, [1.1, 0, 0])
    const steeringWheel = new THREE.Group()
    steeringWheel.position.set(0, 0.95, -0.28)
    steeringWheel.rotation.x = -1.0
    body.add(steeringWheel)
    part(steeringWheel, new THREE.TorusGeometry(0.17, 0.03, 8, 20), dark, 0, 0, 0, 'steering wheel')
    part(steeringWheel, box(0.32, 0.04, 0.03), dark, 0, 0, 0)
    part(steeringWheel, box(0.12, 0.07, 0.02), screen, 0, 0.02, 0.02)
    // Hands on the wheel at ten to two; the arms reach for them every frame.
    const hands = [-1, 1].map(side =>
        part(steeringWheel, new THREE.SphereGeometry(0.06, 10, 8), glove, side * 0.16, 0.06, 0)
    )

    // The driver: suit, shoulders, arms (stretched between shoulder and hand), neck, helmet with visor and stripe.
    part(body, rounded(0.58, 0.5, 0.42, 0.12), accentPaint, 0, 0.86, 0.32, 'suit')
    const shoulders = [-1, 1].map(side => new THREE.Vector3(side * 0.26, 1.03, 0.25))
    const arms = shoulders.map(() => part(body, cylinder(0.06, 0.055, 1, 10), accentPaint, 0, 0, 0, 'arm'))
    piece(cylinder(0.08, 0.09, 0.12, 10), dark, 0, 1.14, 0.3)
    const head = new THREE.Group()
    head.position.set(0, 1.34, 0.3)
    body.add(head)
    part(head, new THREE.SphereGeometry(0.28, 20, 16), helmet, 0, 0, 0, 'helmet')
    part(head, new THREE.SphereGeometry(0.285, 20, 10, -0.9, 1.8, 1.15, 0.6), visor, 0, 0, 0).rotation.y = Math.PI
    part(head, box(0.07, 0.03, 0.52), accentPaint, 0, 0.27, 0, 'stripe')
    part(head, box(0.3, 0.08, 0.12), helmet, 0, -0.2, -0.14)

    // Wheels: the hub and calliper stay with the pivot; tyre, rim and disc turn. Wishbones and springs to the body.
    const tyreGeometry = cylinder(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 24).rotateZ(Math.PI / 2)
    const wallGeometry = new THREE.TorusGeometry(WHEEL_RADIUS - 0.04, 0.045, 8, 24).rotateY(Math.PI / 2)
    const rimGeometry = cylinder(0.21, 0.21, 0.335, 18).rotateZ(Math.PI / 2)
    const spokeGeometry = box(0.34, 0.2, 0.045)
    const discGeometry = cylinder(0.17, 0.17, 0.02, 20).rotateZ(Math.PI / 2)
    const wheels: THREE.Group[] = []
    const steering: THREE.Group[] = []
    const springs: THREE.Mesh[] = []
    const springGeometry = coilGeometry()
    for (const [x, z, front] of HUBS) {
        const side = Math.sign(x)
        const pivot = new THREE.Group()
        pivot.position.set(x, WHEEL_RADIUS, z)
        root.add(pivot)
        const wheel = new THREE.Group()
        pivot.add(wheel)
        part(wheel, tyreGeometry, rubber, 0, 0, 0, 'tyre')
        for (const face of [-1, 1]) part(wheel, wallGeometry, dark, face * 0.16, 0, 0)
        part(wheel, rimGeometry, rim, 0, 0, 0, 'rim')
        for (let i = 0; i < 5; i++) {
            const spoke = part(wheel, spokeGeometry, steel, side * 0.17, 0, 0, 'spoke')
            spoke.rotation.x = (i / 5) * Math.PI * 2
            spoke.scale.set(0.15, 1, 1)
        }
        part(wheel, discGeometry, disc, -side * 0.05, 0, 0, 'disc')
        // The calliper grips the disc's top and doesn't turn.
        part(
            pivot,
            box(0.08, 0.1, 0.16),
            new THREE.MeshStandardMaterial({ color: CALLIPER, roughness: 0.4 }),
            -side * 0.05,
            0.13,
            0,
            'calliper'
        )
        // Two wishbones from the hub in to the chassis.
        for (const height of [0.06, -0.06]) {
            const arm = part(pivot, cylinder(0.022, 0.022, 1, 6), steel, 0, height, 0, 'wishbone')
            stretch(
                arm,
                new THREE.Vector3(0, height, 0),
                new THREE.Vector3(-side * (Math.abs(x) - 0.55), height + 0.08, 0)
            )
        }
        const coil = part(pivot, springGeometry, chrome, -side * 0.28, 0.05, 0, 'spring')
        springs.push(coil)
        wheels.push(wheel)
        if (front) steering.push(pivot)
    }

    // The boost flame, out of the exhausts.
    const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: 0.9 })
    const flames = exhausts.map(at => {
        const flame = part(
            body,
            new THREE.ConeGeometry(0.11, 0.9, 10).rotateX(Math.PI / 2),
            flameMaterial,
            at.x,
            at.y,
            at.z + 0.45
        )
        flame.visible = false
        return flame
    })
    // Pops when you lift off at speed: short bursts of flame at the tips.
    const popMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 })
    const pops = exhausts.map(at => {
        const pop = part(body, new THREE.SphereGeometry(0.09, 8, 6), popMaterial, at.x, at.y, at.z + 0.08)
        pop.visible = false
        return pop
    })

    // Merge the static parts: one mesh per material, on the sprung body.
    for (const [material, geometries] of parts) {
        const merged = mergeGeometries(geometries.map(g => (g.index ? g.toNonIndexed() : g)))
        if (merged) body.add(new THREE.Mesh(merged, material))
    }

    // The livery's decals sit on the bodywork, rebuilt when it changes.
    const decals = new THREE.Group()
    body.add(decals)
    let livery: Livery = { ...PLAIN, ...pickLivery(look) }
    let colours = { body: look.body, accent: look.accent }
    const redecorate = () => {
        for (const child of [...decals.children]) {
            const mesh = child as THREE.Mesh
            ;(mesh.material as THREE.MeshStandardMaterial).map?.dispose()
            ;(mesh.material as THREE.Material).dispose()
            decals.remove(child)
        }
        if (typeof document === 'undefined') return
        addLivery(decals, livery, colours.accent, look.name)
    }
    redecorate()

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
    let heat = 0
    let clock = 0
    let glanceAt = 4 + Math.random() * 6
    let cheerUntil = 0
    let cheerHow: 'overtake' | 'finish' = 'overtake'
    let popUntil = 0
    const spring = { height: 0, speed: 0, pitch: 0, roll: 0 }
    const yaw = new THREE.Quaternion()
    const tilt = new THREE.Quaternion()
    const hand = new THREE.Vector3()
    const raised = new THREE.Vector3()

    return {
        root,

        paint(bodyColour, accentColour) {
            bodyPaint.color.set(bodyColour)
            accentPaint.color.set(accentColour)
            const accentChanged = colours.accent !== accentColour
            colours = { body: bodyColour, accent: accentColour }
            if (accentChanged) redecorate()
        },

        dress(next) {
            livery = { ...next }
            redecorate()
        },

        setFat(fat) {
            body.scale.set(fat ? 1.45 : 1, fat ? 1.15 : 1, fat ? 1.08 : 1)
        },

        celebrate(how) {
            cheerHow = how
            cheerUntil = clock + (how === 'finish' ? 3 : 1.2)
        },

        pose(x, y, z, heading, up, kart, steer, dt) {
            clock += dt
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
            // At idle the engine shakes the whole kart a little.
            const idle = Math.abs(speed) < 2 ? Math.sin(clock * 70) * 0.004 : 0
            body.position.y = spring.height + idle
            body.rotation.x = spring.pitch
            body.rotation.z = spring.roll
            // The coils squeeze as the body comes down (and stretch on a bounce).
            for (const coil of springs) coil.scale.y = 1 + (spring.height + idle) / 0.22

            // The ground goes by PACE times faster than the speed says.
            roll += ((speed * PACE) / WHEEL_RADIUS) * dt
            for (const wheel of wheels) wheel.rotation.x = -roll
            for (const pivot of steering) pivot.rotation.y = steer * 0.45 + driftLean * 0.6
            steeringWheel.rotation.z = steer * 1.2

            // The arms follow the hands on the wheel; one punches the air to celebrate.
            const cheering = clock < cheerUntil
            body.updateMatrixWorld(true)
            arms.forEach((arm, i) => {
                hands[i]!.getWorldPosition(hand)
                body.worldToLocal(hand)
                const shoulder = shoulders[i]!
                const punches = cheering && (cheerHow === 'finish' || i === 1)
                if (punches) {
                    const beat = Math.abs(Math.sin((cheerUntil - clock) * 9))
                    raised.set(shoulder.x * 1.3, shoulder.y + 0.45 + beat * 0.15, shoulder.z - 0.05)
                    stretch(arm, shoulder, raised)
                    hands[i]!.visible = false
                } else {
                    stretch(arm, shoulder, hand)
                    hands[i]!.visible = true
                }
            })

            // The head leans into the bend, looks where it's going, and now and then glances back.
            if (clock > glanceAt + 0.8) glanceAt = clock + 5 + Math.random() * 8
            const glancing = clock > glanceAt && speed > 10 && !cheering
            const lookYaw = glancing ? 1.3 : steer * 0.35 + kart.drift * 0.25
            head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, lookYaw, 1 - Math.exp(-6 * dt))
            head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, steer * grip * 0.18, 1 - Math.exp(-6 * dt))

            // Brakes: the discs heat up under hard braking and cool off; the lights come on.
            const braking = accel < -6 && speed > 4
            heat = THREE.MathUtils.clamp(heat + (braking ? dt * 1.2 : -dt * 0.35), 0, 1)
            disc.emissiveIntensity = heat * heat * 2.5
            brakeLight.emissiveIntensity = accel < -4 || speed < -0.5 ? 3 : 0.6
            // Exhaust tips glow on the gas; lifting off fast makes them pop.
            exhaustTip.emissiveIntensity = THREE.MathUtils.lerp(
                exhaustTip.emissiveIntensity,
                accel > 1 ? 1.4 : 0.15,
                1 - Math.exp(-4 * dt)
            )
            if (accel < -9 && speed > 18 && clock > popUntil + 0.15 && Math.random() < 0.25) popUntil = clock + 0.07
            for (const pop of pops) {
                pop.visible = clock < popUntil
                pop.scale.setScalar(0.7 + Math.random() * 0.8)
            }

            const boosting = kart.boost > 0 || kart.surge > 0
            flameMaterial.color.setHex(kart.boost > 0 ? 0xffb13b : 0x38e1ff)
            for (const flame of flames) {
                flame.visible = boosting
                flame.scale.set(1, 1, 0.8 + Math.random() * 0.6)
            }
            // In the air the patch would fly with the kart: let it fade instead.
            blob.visible = !kart.airborne
        },
    }
}

/** Points a unit-tall cylinder from a to b (both in its parent's space), stretching it to fit. */
function stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const length = a.distanceTo(b)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.scale.set(1, Math.max(0.001, length), 1)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
}

/** A coil spring 0.22 m tall, standing on its base. */
function coilGeometry(): THREE.BufferGeometry {
    const turns = 6
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= turns * 16; i++) {
        const angle = (i / 16) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(angle) * 0.05, (i / (turns * 16)) * 0.22, Math.sin(angle) * 0.05))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), turns * 16, 0.008, 5)
}

/** What of a look is livery (number, pattern, stickers), with the defaults for what's missing. */
function pickLivery(look: KartLook): Livery {
    return {
        number: look.number ?? PLAIN.number,
        pattern: look.pattern ?? PLAIN.pattern,
        stickers: look.stickers ?? PLAIN.stickers,
        sponsor: look.sponsor ?? PLAIN.sponsor,
    }
}

/**
 * The livery as decals on the bodywork: the number in roundels on the pods
 * and on the nose, the driver's name along the chassis, the pattern in the
 * accent colour, the sponsor stickers.
 */
function addLivery(group: THREE.Group, livery: Livery, accent: string, name: string): void {
    const decal = (texture: THREE.Texture, width: number, height: number, at: THREE.Vector3, rotation: THREE.Euler) => {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                roughness: 0.35,
                metalness: 0.1,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                depthWrite: false,
            })
        )
        mesh.position.copy(at)
        mesh.rotation.copy(rotation)
        group.add(mesh)
    }
    const flatTop = (y: number) => new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ')
    const side = (s: number) => new THREE.Euler(0, s * (Math.PI / 2), 0)

    // The pattern, in the accent colour.
    const pattern = patternTexture(livery.pattern, accent)
    if (pattern) {
        if (livery.pattern === 'stripes' || livery.pattern === 'checker') {
            decal(pattern, 0.5, 2.25, new THREE.Vector3(0, 0.584, 0.08), flatTop(0.584))
            decal(pattern, 0.4, 1.0, new THREE.Vector3(0, 0.544, -1.42), flatTop(0.544))
        } else if (livery.pattern === 'maple') {
            decal(pattern, 0.62, 0.62, new THREE.Vector3(0, 0.544, -1.42), flatTop(0.544))
            decal(pattern, 0.5, 0.5, new THREE.Vector3(0, 0.584, 0.15), flatTop(0.584))
        } else {
            for (const s of [-1, 1]) decal(pattern, 1.2, 0.3, new THREE.Vector3(s * 0.963, 0.43, 0.25), side(s))
        }
    }

    // The number: roundels on both pods and on the nose.
    if (livery.number !== null) {
        const roundel = numberTexture(livery.number)
        for (const s of [-1, 1]) decal(roundel, 0.3, 0.3, new THREE.Vector3(s * 0.966, 0.45, -0.05), side(s))
        // Turned round so it reads from in front of the kart.
        decal(roundel, 0.3, 0.3, new THREE.Vector3(0, 0.546, -1.7), new THREE.Euler(-Math.PI / 2, 0, Math.PI))
    }

    // The driver's name along the chassis, both sides.
    const plate = nameplateTexture(name)
    for (const s of [-1, 1]) decal(plate, 0.7, 0.1, new THREE.Vector3(s * 0.605, 0.47, 0.7), side(s))

    // The sponsors: yours on the rear wing (the dépanneur's when you haven't picked one), small ones about.
    if (livery.stickers) {
        const sponsor = livery.sponsor ?? DEFAULT_SPONSOR
        decal(
            stickerTexture(sponsor, '#facc15', '#111827'),
            1.3,
            0.2,
            new THREE.Vector3(0, 1.0, 1.596),
            new THREE.Euler(0, 0, 0)
        )
        decal(
            stickerTexture(sponsor, '#facc15', '#111827'),
            1.3,
            0.2,
            new THREE.Vector3(0, 1.0, 1.594),
            new THREE.Euler(0, Math.PI, 0)
        )
        decal(
            stickerTexture('bubly', '#7dd3fc', '#0f172a'),
            0.5,
            0.14,
            new THREE.Vector3(0, 0.244, -1.96),
            flatTop(0.244)
        )
        for (const s of [-1, 1]) {
            decal(
                stickerTexture('GO KRISP', '#111827', '#f97316'),
                0.44,
                0.13,
                new THREE.Vector3(s * 0.966, 0.33, 0.62),
                side(s)
            )
        }
    }
}

/** A canvas texture; a plain one without a page (tests). */
function painted(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): THREE.Texture {
    if (typeof document === 'undefined') return new THREE.Texture()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    paint(canvas.getContext('2d')!)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

/** The pattern, in the accent colour on a clear ground; null for none. */
function patternTexture(pattern: Pattern, accent: string): THREE.Texture | null {
    switch (pattern) {
        case 'none':
            return null
        case 'stripes':
            return painted(64, 256, c => {
                c.fillStyle = accent
                c.fillRect(6, 0, 18, 256)
                c.fillRect(40, 0, 18, 256)
                c.fillStyle = '#ffffff'
                c.fillRect(24, 0, 3, 256)
                c.fillRect(37, 0, 3, 256)
            })
        case 'checker':
            return painted(64, 256, c => {
                for (let row = 0; row < 32; row++) {
                    for (let col = 0; col < 8; col++) {
                        c.fillStyle = (row + col) % 2 ? accent : '#ffffff'
                        c.fillRect(col * 8, row * 8, 8, 8)
                    }
                }
            })
        case 'maple':
            return painted(256, 256, c => {
                c.fillStyle = accent
                c.translate(128, 140)
                c.scale(1.05, 1.05)
                c.beginPath()
                // An 11-point maple leaf, Canada's flag style.
                const leaf = [
                    [0, -110],
                    [18, -70],
                    [42, -82],
                    [34, -30],
                    [80, -58],
                    [70, -34],
                    [102, -24],
                    [62, 6],
                    [74, 28],
                    [16, 18],
                    [8, 70],
                    [-8, 70],
                    [-16, 18],
                    [-74, 28],
                    [-62, 6],
                    [-102, -24],
                    [-70, -34],
                    [-80, -58],
                    [-34, -30],
                    [-42, -82],
                    [-18, -70],
                ]
                leaf.forEach(([x, y], i) => (i === 0 ? c.moveTo(x!, y!) : c.lineTo(x!, y!)))
                c.closePath()
                c.fill()
            })
        case 'flames':
            return painted(512, 128, c => {
                const gradient = c.createLinearGradient(0, 0, 512, 0)
                gradient.addColorStop(0, accent)
                gradient.addColorStop(1, '#fde047')
                c.fillStyle = gradient
                c.beginPath()
                c.moveTo(0, 20)
                for (let i = 0; i < 6; i++) {
                    const x = 40 + i * 75
                    c.quadraticCurveTo(x, 10 - (i % 2) * 8, x + 40, 64)
                    c.quadraticCurveTo(x + 10, 110, x + 70, 64 + (i % 2) * 10)
                }
                c.lineTo(0, 108)
                c.closePath()
                c.fill()
            })
        case 'lightning':
            return painted(512, 128, c => {
                c.fillStyle = accent
                c.strokeStyle = '#ffffff'
                c.lineWidth = 6
                c.beginPath()
                c.moveTo(10, 50)
                c.lineTo(200, 40)
                c.lineTo(170, 70)
                c.lineTo(380, 55)
                c.lineTo(340, 85)
                c.lineTo(500, 64)
                c.lineTo(330, 110)
                c.lineTo(360, 82)
                c.lineTo(150, 98)
                c.lineTo(185, 72)
                c.lineTo(10, 80)
                c.closePath()
                c.fill()
                c.stroke()
            })
    }
}

function numberTexture(number: number): THREE.Texture {
    return painted(128, 128, c => {
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.arc(64, 64, 60, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#111827'
        c.lineWidth = 6
        c.stroke()
        c.fillStyle = '#111827'
        c.font = '900 72px system-ui, sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(String(number), 64, 70)
    })
}

function nameplateTexture(name: string): THREE.Texture {
    return painted(512, 72, c => {
        c.fillStyle = 'rgba(15, 23, 42, 0.8)'
        c.beginPath()
        c.roundRect(0, 4, 512, 64, 16)
        c.fill()
        c.fillStyle = '#ffffff'
        c.font = 'italic 800 46px system-ui, sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(name.toUpperCase(), 256, 38, 490)
    })
}

function stickerTexture(text: string, background: string, colour: string): THREE.Texture {
    return painted(512, 80, c => {
        c.fillStyle = background
        c.beginPath()
        c.roundRect(0, 0, 512, 80, 18)
        c.fill()
        c.fillStyle = colour
        c.font = '900 52px system-ui, sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(text, 256, 42, 490)
    })
}

/** Carbon-fibre weave. */
function carbonTexture(): THREE.Texture {
    const texture = painted(64, 64, c => {
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const shade = (x + y) % 2 ? 34 : 22
                const g = c.createLinearGradient(x * 8, y * 8, x * 8 + 8, y * 8 + 8)
                g.addColorStop(0, `rgb(${shade}, ${shade}, ${shade + 4})`)
                g.addColorStop(1, `rgb(${shade + 14}, ${shade + 14}, ${shade + 18})`)
                c.fillStyle = g
                c.fillRect(x * 8, y * 8, 8, 8)
            }
        }
    })
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(6, 10)
    return texture
}

/** Tyre tread: dark rubber with grooves across. */
function treadTexture(): THREE.Texture {
    const texture = painted(128, 32, c => {
        c.fillStyle = '#3a3d44'
        c.fillRect(0, 0, 128, 32)
        c.fillStyle = '#16181c'
        for (let x = 0; x < 128; x += 8) c.fillRect(x, 0, 3, 32)
        c.fillRect(0, 14, 128, 4)
    })
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(4, 1)
    return texture
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
    context.fillText(
        look.number !== null && look.number !== undefined ? `#${look.number} ${look.name}` : look.name,
        138,
        33,
        220
    )

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }))
    sprite.scale.set(TAG.width, TAG.width / 4, 1)
    sprite.position.y = TAG.height
    sprite.name = 'name tag'

    return sprite
}
