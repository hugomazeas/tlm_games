import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { SNACK_KINDS, type SnackKind } from '../drive/snacks.ts'

/**
 * The dépanneur's snacks in 3D, about a metre tall, standing on y = 0: cans
 * and bottles with their labels, bags, bars, a popcorn box, an ice-cream
 * cone, an ice-cream sandwich. Built once per kind; `snackModel` hands out
 * copies sharing the geometry and materials. `snackPictures` renders each
 * one to a picture for the welcome screen.
 */

const cache = new Map<SnackKind, THREE.Group>()

/** A copy of a snack's model, ready to place. */
export function snackModel(kind: SnackKind): THREE.Group {
    let model = cache.get(kind)
    if (!model) {
        model = BUILDERS[kind]()
        cache.set(kind, model)
    }

    return model.clone()
}

/** Each snack as a picture (a data URL), turned a little to show it's 3D. Empty without WebGL. */
export function snackPictures(size = 160): Partial<Record<SnackKind, string>> {
    const pictures: Partial<Record<SnackKind, string>> = {}
    let renderer: THREE.WebGLRenderer
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch {
        return pictures
    }
    renderer.setSize(size, size)
    renderer.setPixelRatio(1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4)
    sun.position.set(2, 3, 4)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    const view = new THREE.Vector3(0.45, 0.4, 1).normalize()
    const box = new THREE.Box3()
    const centre = new THREE.Vector3()
    const sphere = new THREE.Sphere()

    for (const kind of SNACK_KINDS) {
        const model = snackModel(kind)
        model.rotation.y = -0.5
        scene.add(model)
        // Fill the frame with it, whatever its size: a can is tall, a chocolate small and flat.
        box.setFromObject(model).getBoundingSphere(sphere)
        box.getCenter(centre)
        const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05
        camera.position.copy(centre).addScaledVector(view, distance)
        camera.lookAt(centre)
        renderer.render(scene, camera)
        pictures[kind] = renderer.domElement.toDataURL('image/png')
        scene.remove(model)
    }
    renderer.dispose()

    return pictures
}

type Builder = () => THREE.Group

const BUILDERS: Record<SnackKind, Builder> = {
    coke: () => can(label('#e41e2b', 'Coca-Cola', '#ffffff', 'italic 800 64px Georgia, serif', { wave: '#ffffff' })),
    bubly: () =>
        can(label('#7dd3fc', 'bubly', '#0f172a', '800 72px system-ui, sans-serif', { bubbles: '#ffffff' }), {
            top: 0xe0f2fe,
        }),
    montellier: () =>
        bottle(
            { liquid: 0xd9f99d, glass: 0x86efac, cap: 0x166534 },
            label('#f8fafc', 'Montellier', '#166534', '700 56px Georgia, serif')
        ),
    fuze: () =>
        bottle(
            { liquid: 0xb45309, glass: 0xfbbf24, cap: 0x111827 },
            label('#111827', 'FUZE', '#fbbf24', '900 80px system-ui, sans-serif')
        ),
    chips: () =>
        bag(label('#facc15', 'CHIPS', '#b91c1c', '900 76px system-ui, sans-serif', { stripe: '#b91c1c' }), 0xfacc15),
    trailmix: () => {
        const group = bag(label('#15803d', 'TRAIL MIX', '#fef9c3', '900 58px system-ui, sans-serif'), 0x15803d)
        // Nuts and raisins spilling over the top.
        const nut = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.8 })
        const raisin = new THREE.MeshStandardMaterial({ color: 0x3f1d0b, roughness: 0.9 })
        for (let i = 0; i < 9; i++) {
            const piece = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), i % 3 ? nut : raisin)
            piece.position.set(-0.25 + (i % 5) * 0.12, 1.02 + (i % 2) * 0.05, -0.05 + (i % 3) * 0.05)
            piece.scale.set(1.3, 0.8, 1)
            group.add(piece)
        }
        return group
    },
    chocolate: () => {
        const group = new THREE.Group()
        const foil = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.8, roughness: 0.25 })
        const square = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.22, 0.75, 2, 0.06), foil)
        square.position.y = 0.4
        square.rotation.z = 0.25
        const wrapper = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.235, 0.5),
            new THREE.MeshStandardMaterial({ map: label('#7c2d12', 'choco', '#fde68a', '800 64px Georgia, serif') })
        )
        wrapper.position.copy(square.position)
        wrapper.rotation.copy(square.rotation)
        group.add(square, wrapper)
        return group
    },
    kirkland: () =>
        bar(label('#78350f', 'KIRKLAND', '#fef3c7', '800 52px system-ui, sans-serif', { stripe: '#dc2626' })),
    gokrisp: () =>
        bar(label('#111827', 'GO KRISP', '#f97316', '900 54px system-ui, sans-serif', { stripe: '#f97316' })),
    popcorn: () => {
        const group = new THREE.Group()
        const box = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.3, 0.85, 16, 1, true),
            new THREE.MeshStandardMaterial({ map: stripes('#dc2626', '#ffffff'), side: THREE.DoubleSide })
        )
        box.position.y = 0.43
        group.add(box)
        const kernel = new THREE.MeshStandardMaterial({ color: 0xfff7d6, roughness: 0.9 })
        for (let i = 0; i < 16; i++) {
            const angle = i * 2.4
            const r = 0.08 + (i % 4) * 0.08
            const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + (i % 3) * 0.02, 0), kernel)
            puff.position.set(Math.cos(angle) * r, 0.88 + (i % 5) * 0.04, Math.sin(angle) * r)
            group.add(puff)
        }
        return group
    },
    drumsticks: () => {
        const group = new THREE.Group()
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.3, 0.8, 16),
            new THREE.MeshStandardMaterial({ map: waffle(), roughness: 0.8 })
        )
        cone.rotation.x = Math.PI
        cone.position.y = 0.4
        const cream = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.6 })
        )
        cream.position.y = 0.88
        const dip = new THREE.Mesh(
            new THREE.SphereGeometry(0.33, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
            new THREE.MeshStandardMaterial({ color: 0x4a2511, roughness: 0.4 })
        )
        dip.position.y = 0.9
        const peanuts = new THREE.MeshStandardMaterial({ color: 0xd6a35c })
        for (let i = 0; i < 8; i++) {
            const bit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), peanuts)
            const angle = i * 0.8
            bit.position.set(Math.cos(angle) * 0.14, 1.19, Math.sin(angle) * 0.14)
            group.add(bit)
        }
        group.add(cone, cream, dip)
        return group
    },
    chipwich: () => {
        const group = new THREE.Group()
        const cookie = new THREE.MeshStandardMaterial({ map: cookieTexture(), roughness: 0.9 })
        for (const y of [0.3, 0.7]) {
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 24), cookie)
            disc.position.y = y
            group.add(disc)
        }
        const cream = new THREE.Mesh(
            new THREE.CylinderGeometry(0.44, 0.44, 0.28, 24),
            new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.7 })
        )
        cream.position.y = 0.5
        group.add(cream)
        // Chocolate chips round the cream's edge.
        const chip = new THREE.MeshStandardMaterial({ color: 0x3b1a08 })
        for (let i = 0; i < 18; i++) {
            const bit = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 6), chip)
            const angle = (i / 18) * Math.PI * 2
            bit.position.set(Math.cos(angle) * 0.45, 0.42 + (i % 3) * 0.07, Math.sin(angle) * 0.45)
            group.add(bit)
        }
        group.rotation.x = 0.35
        return group
    },
}

/** A drinks can, its label round it. */
function can(texture: THREE.Texture, colours: { top?: number } = {}): THREE.Group {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.95, 24),
        new THREE.MeshStandardMaterial({ map: texture, metalness: 0.35, roughness: 0.35 })
    )
    body.position.y = 0.5
    const metal = new THREE.MeshStandardMaterial({ color: colours.top ?? 0xd1d5db, metalness: 0.9, roughness: 0.25 })
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 24), metal)
    top.position.y = 1.0
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.05, 24), metal)
    bottom.position.y = 0.0
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.16), metal)
    tab.position.set(0, 1.035, 0.06)
    group.add(body, top, bottom, tab)
    return group
}

/** A bottle: glass, liquid inside, a cap and a label. */
function bottle(colours: { liquid: number; glass: number; cap: number }, texture: THREE.Texture): THREE.Group {
    const group = new THREE.Group()
    const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.6, 20),
        new THREE.MeshStandardMaterial({ color: colours.liquid, roughness: 0.2 })
    )
    liquid.position.y = 0.33
    const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.72, 20),
        new THREE.MeshStandardMaterial({ color: colours.glass, transparent: true, opacity: 0.4, roughness: 0.05 })
    )
    glass.position.y = 0.38
    const shoulder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.27, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: colours.glass, transparent: true, opacity: 0.5, roughness: 0.05 })
    )
    shoulder.position.y = 0.85
    const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: colours.cap, roughness: 0.5 })
    )
    cap.position.y = 1.02
    const wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.275, 0.275, 0.3, 20, 1, true),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 })
    )
    wrap.position.y = 0.42
    group.add(liquid, glass, shoulder, cap, wrap)
    return group
}

/** A crinkly snack bag, standing up, label on the front. */
function bag(texture: THREE.Texture, colour: number): THREE.Group {
    const group = new THREE.Group()
    const geometry = new RoundedBoxGeometry(0.75, 0.95, 0.3, 3, 0.12)
    // Pinch the top and bottom flat, the way a sealed bag is.
    const position = geometry.attributes.position!
    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i)
        const squeeze = Math.max(0, Math.abs(y) - 0.3) / 0.18
        position.setZ(i, position.getZ(i) * (1 - Math.min(0.85, squeeze)))
    }
    geometry.computeVertexNormals()
    const plastic = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.4, roughness: 0.35 })
    const body = new THREE.Mesh(geometry, plastic)
    body.position.y = 0.5
    const front = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.55),
        new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.4 })
    )
    front.position.set(0, 0.5, 0.16)
    group.add(body, front)
    return group
}

/** A wrapped bar, lying flat but tilted up so its name shows. */
function bar(texture: THREE.Texture): THREE.Group {
    const group = new THREE.Group()
    const wrapper = new THREE.Mesh(
        new RoundedBoxGeometry(1.0, 0.22, 0.36, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.4 })
    )
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.3),
        new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.4 })
    )
    face.rotation.x = -Math.PI / 2
    face.position.y = 0.112
    const tilted = new THREE.Group()
    tilted.add(wrapper, face)
    tilted.rotation.x = 1.0
    tilted.position.y = 0.45
    group.add(tilted)
    return group
}

/** A label: a background colour and a name across it, plus a wave, a stripe or bubbles. */
function label(
    background: string,
    text: string,
    colour: string,
    font: string,
    extra: { wave?: string; stripe?: string; bubbles?: string } = {}
): THREE.Texture {
    return painted(512, 256, context => {
        context.fillStyle = background
        context.fillRect(0, 0, 512, 256)
        if (extra.stripe) {
            context.fillStyle = extra.stripe
            context.fillRect(0, 196, 512, 26)
        }
        if (extra.wave) {
            context.strokeStyle = extra.wave
            context.lineWidth = 10
            context.beginPath()
            for (let x = 0; x <= 512; x += 8) context.lineTo(x, 190 + Math.sin(x / 40) * 14)
            context.stroke()
        }
        if (extra.bubbles) {
            context.fillStyle = extra.bubbles
            for (let i = 0; i < 26; i++) {
                context.globalAlpha = 0.5
                context.beginPath()
                context.arc((i * 97) % 512, (i * 53) % 256, 4 + (i % 4) * 4, 0, Math.PI * 2)
                context.fill()
            }
            context.globalAlpha = 1
        }
        context.fillStyle = colour
        context.font = font
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(text, 256, 118, 480)
    })
}

function stripes(a: string, b: string): THREE.Texture {
    return painted(256, 64, context => {
        for (let i = 0; i < 8; i++) {
            context.fillStyle = i % 2 ? b : a
            context.fillRect(i * 32, 0, 32, 64)
        }
    })
}

function waffle(): THREE.Texture {
    return painted(128, 128, context => {
        context.fillStyle = '#d4a056'
        context.fillRect(0, 0, 128, 128)
        context.strokeStyle = '#a06a2c'
        context.lineWidth = 5
        for (let i = -128; i < 256; i += 22) {
            context.beginPath()
            context.moveTo(i, 0)
            context.lineTo(i + 128, 128)
            context.moveTo(i + 128, 0)
            context.lineTo(i, 128)
            context.stroke()
        }
    })
}

function cookieTexture(): THREE.Texture {
    return painted(128, 128, context => {
        context.fillStyle = '#7c4a1e'
        context.fillRect(0, 0, 128, 128)
        context.fillStyle = '#3b1a08'
        for (let i = 0; i < 40; i++) context.fillRect((i * 37) % 128, (i * 61) % 128, 6, 5)
    })
}

/** A canvas texture; a plain grey one without a page (tests). */
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
