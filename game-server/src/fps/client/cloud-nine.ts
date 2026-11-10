import {
    AmbientLight,
    BackSide,
    BoxGeometry,
    type BufferGeometry,
    CanvasTexture,
    Color,
    CylinderGeometry,
    DirectionalLight,
    DoubleSide,
    FogExp2,
    Group,
    HemisphereLight,
    type Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Object3D,
    PlaneGeometry,
    RepeatWrapping,
    type Scene,
    SphereGeometry,
    SRGBColorSpace,
    Vector3,
    type WebGLRenderer,
    BufferAttribute,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRng } from '../../sim/rng.ts'
import { CLOUD_NINE, CLOUD_NINE_BLOCKS, type CloudNineLook } from '../map/cloud-nine.ts'
import type { Office } from '../map/office.js'
import { CloudNineLife, type CloudNineEggs } from './cloud-nine-life.ts'
import type { MapId } from '../protocol.ts'
import { cloudNineWorld, type FpsWorld } from '../sim/world.ts'

/**
 * Cloud Nine as the browser draws it: its blocks (the same ones the server collides with) in dark
 * metal, with thin neon (cyan along the deck's edge, magenta on the ledges), screens and signs (the
 * tank's wrap-around screen, the ad drone's, the neon sign, two screens set in the deck), cabinets
 * with their LEDs, and a city at night all round and far below: towers with lit windows, billboards,
 * a gradient sky. The neon stays restrained: lit by colour, not by lights (no new lights: switching
 * maps only retunes the office's, so no shader is compiled again).
 */

export const NEON = { cyan: 0x3fd8d0, magenta: 0xff4f9e, amber: 0xffcf6b } as const

export interface CloudNineScene {
    group: Group
    world: FpsWorld
    /** The gondola, the tank's screen, the plane and the drones. */
    life: CloudNineLife
    /** Blinks (the antenna). */
    update(now: number): void
}

/** A texture drawn on a canvas. */
function painted(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d')!)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

/** Neon text with a soft glow, centred. */
function neonText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
    g.font = `800 ${size}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = color
    g.shadowBlur = size * 0.45
    g.fillStyle = color
    g.fillText(text, x, y)
    g.shadowBlur = 0
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.fillText(text, x, y)
}

const screenMaterial = (texture: CanvasTexture) => new MeshBasicMaterial({ map: texture, toneMapped: false })

/** A screen that reads the right way from both sides: two planes back to back. */
function twoSided(width: number, height: number, material: Material): Group {
    const screen = new Group()
    const back = new Mesh(new PlaneGeometry(width, height), material)
    back.rotation.y = Math.PI
    screen.add(new Mesh(new PlaneGeometry(width, height), material), back)
    return screen
}

export function buildCloudNine(eggs: CloudNineEggs): CloudNineScene {
    const group = new Group()
    group.name = 'cloud-nine'
    const world = cloudNineWorld()

    // --- The blocks, merged per material -------------------------------------------------------
    const metal = new MeshStandardMaterial({ color: 0x5a6a86, roughness: 0.6, metalness: 0.3 })
    const looks: Record<CloudNineLook, Material> = {
        deck: new MeshStandardMaterial({ color: 0x4a5160, roughness: 0.7, metalness: 0.25 }),
        underside: new MeshStandardMaterial({ color: 0x2a3244, roughness: 0.85, metalness: 0.2 }),
        leg: metal,
        tank: new MeshStandardMaterial({ color: 0x4a5e7a, roughness: 0.5, metalness: 0.4 }),
        cabinet: new MeshStandardMaterial({ color: 0x343e52, roughness: 0.5, metalness: 0.4 }),
        drone: metal,
        sign: metal,
    }
    const byMaterial = new Map<Material, BufferGeometry[]>()
    const add = (material: Material, geometry: BufferGeometry) => {
        const list = byMaterial.get(material) ?? []
        list.push(geometry)
        byMaterial.set(material, list)
    }
    const box = (min: readonly number[], max: readonly number[]) => {
        const g = new BoxGeometry(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!)
        g.translate((min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2)
        return g
    }
    for (const block of CLOUD_NINE_BLOCKS) add(looks[block.look], box(block.min, block.max))

    // --- Neon: thin strips, lit by their own colour --------------------------------------------
    const cyan = new MeshBasicMaterial({ color: NEON.cyan, toneMapped: false })
    const magenta = new MeshBasicMaterial({ color: NEON.magenta, toneMapped: false })
    const amber = new MeshBasicMaterial({ color: NEON.amber, toneMapped: false })
    const { halfX: hx, halfZ: hz, lid, platform } = CLOUD_NINE
    // The deck's front and back edges cyan, its two ledges (the ends) magenta.
    add(cyan, box([-hx, 0, -hz], [hx, 0.012, -hz + 0.03]))
    add(cyan, box([-hx, 0, hz - 0.03], [hx, 0.012, hz]))
    add(magenta, box([-hx, -0.3, -hz], [-hx + 0.03, 0.014, hz]))
    add(magenta, box([hx - 0.03, -0.3, -hz], [hx, 0.014, hz]))
    // A line round the deck's underside, and the tank lid's rim.
    add(magenta, box([-6, -2.62, -2.2], [6, -2.58, -2.17]))
    add(magenta, box([-6, -2.62, 2.17], [6, -2.58, 2.2]))
    for (const [a, b] of [
        [
            [-0.8, lid, -0.8],
            [0.8, lid + 0.012, -0.77],
        ],
        [
            [-0.8, lid, 0.77],
            [0.8, lid + 0.012, 0.8],
        ],
        [
            [-0.8, lid, -0.8],
            [-0.77, lid + 0.012, 0.8],
        ],
        [
            [0.77, lid, -0.8],
            [0.8, lid + 0.012, 0.8],
        ],
    ] as const) {
        add(cyan, box(a, b))
    }
    // The platforms' edges: cyan on the drone's, magenta on the sign's.
    add(cyan, box([-4.8, platform - 0.005, -0.8], [-2.2, platform + 0.008, -0.77]))
    add(cyan, box([-4.8, platform - 0.005, 0.77], [-2.2, platform + 0.008, 0.8]))
    add(magenta, box([2.2, platform - 0.005, -0.8], [4.8, platform + 0.008, -0.77]))
    add(magenta, box([2.2, platform - 0.005, 0.77], [4.8, platform + 0.008, 0.8]))
    // The cabinets' status LEDs (a column on each long face), and the gondola-less window lights below.
    for (const [cx, cz] of [
        [2.4, -2.0],
        [-2.4, 1.6],
    ] as const) {
        for (let i = 0; i < 5; i++) {
            const y = 0.15 + i * 0.12
            const led = i % 3 === 0 ? magenta : i % 2 ? amber : cyan
            add(led, box([cx - 0.3, y, cz - 0.405], [cx - 0.26, y + 0.02, cz - 0.4]))
            add(led, box([cx + 0.26, y, cz + 0.4], [cx + 0.3, y + 0.02, cz + 0.405]))
        }
    }
    // The building under the deck: rows of lit windows on its sides.
    const windowRows = createRng(9)
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 18; i++) {
            if (windowRows() < 0.45) continue
            const x = -5.6 + i * 0.66
            const y = -0.8 - row * 0.6
            const lit = windowRows() < 0.25 ? cyan : amber
            add(lit, box([x, y, -2.21], [x + 0.36, y + 0.22, -2.2]))
            add(lit, box([x, y, 2.2], [x + 0.36, y + 0.22, 2.21]))
        }
    }
    // Wind flags at the ends' corners (the gusts' warning, when there are gusts).
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const pole = new CylinderGeometry(0.008, 0.008, 0.5, 6)
            pole.translate(sx * (hx - 0.12), 0.25, sz * (hz - 0.12))
            add(metal, pole)
        }
    }

    for (const [material, geometries] of byMaterial) {
        const mesh = new Mesh(mergeGeometries(geometries), material)
        mesh.receiveShadow = material !== cyan && material !== magenta && material !== amber
        mesh.castShadow = mesh.receiveShadow
        group.add(mesh)
    }

    // Flags: magenta pennants on the poles.
    const flag = new MeshBasicMaterial({ color: NEON.magenta, side: DoubleSide, toneMapped: false })
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const pennant = new Mesh(new PlaneGeometry(0.16, 0.08), flag)
            pennant.position.set(sx * (hx - 0.12) + 0.08, 0.45, sz * (hz - 0.12))
            group.add(pennant)
        }
    }

    // --- Screens and signs ---------------------------------------------------------------------
    // The tank's screen, round all four sides; it scrolls.
    const tankTexture = painted(512, 128, g => {
        g.fillStyle = '#071c22'
        g.fillRect(0, 0, 512, 128)
        g.fillStyle = 'rgba(63,216,208,.10)'
        for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 512, 1)
        neonText(g, 'CLOUD NINE', 160, 52, 44, '#3fd8d0')
        neonText(g, '▲ 400 m', 160, 100, 22, '#ff4f9e')
        for (let i = 0; i < 9; i++) {
            const h = 20 + ((i * 37) % 60)
            g.fillStyle = i % 3 ? 'rgba(63,216,208,.55)' : 'rgba(255,79,158,.6)'
            g.fillRect(330 + i * 18, 110 - h, 11, h)
        }
    })
    tankTexture.wrapS = RepeatWrapping
    // Four planes just off the tank's sides, each facing out (a plane faces +z unturned).
    const tankScreen = screenMaterial(tankTexture)
    for (const [x, z, turn] of [
        [0, 0.805, 0],
        [0.805, 0, Math.PI / 2],
        [0, -0.805, Math.PI],
        [-0.805, 0, -Math.PI / 2],
    ] as const) {
        const plane = new Mesh(new PlaneGeometry(1.5, 0.5), tankScreen)
        plane.position.set(x, 2.25, z)
        plane.rotation.y = turn
        group.add(plane)
    }
    // The ad drone's screen, hanging under its platform (both faces).
    const ramen = painted(512, 96, g => {
        g.fillStyle = '#081a20'
        g.fillRect(0, 0, 512, 96)
        neonText(g, 'RAMEN · 24/7', 256, 44, 46, '#3fd8d0')
        g.fillStyle = '#ff4f9e'
        g.fillRect(150, 78, 140, 6)
        g.fillStyle = '#3fd8d0'
        g.fillRect(300, 78, 60, 6)
    })
    const droneScreen = twoSided(2.3, 0.42, screenMaterial(ramen))
    droneScreen.position.set(-3.5, platform - 0.36, 0)
    group.add(droneScreen)
    // Its rotors, one under each corner.
    const rotor = new MeshStandardMaterial({ color: 0x3a4a60, roughness: 0.4, metalness: 0.6 })
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const r = new Mesh(new CylinderGeometry(0.16, 0.16, 0.02, 16), rotor)
            r.position.set(-3.5 + sx * 1.15, platform - 0.18, sz * 0.62)
            group.add(r)
        }
    }
    // The neon sign under the other platform.
    const open = painted(512, 128, g => {
        g.fillStyle = '#12081a'
        g.fillRect(0, 0, 512, 128)
        g.strokeStyle = '#ff4f9e'
        g.lineWidth = 4
        g.shadowColor = '#ff4f9e'
        g.shadowBlur = 16
        g.strokeRect(10, 10, 492, 108)
        g.shadowBlur = 0
        neonText(g, 'OPEN 24H', 256, 66, 62, '#ff4f9e')
    })
    const sign = twoSided(2.3, 0.56, screenMaterial(open))
    sign.position.set(3.5, platform - 0.42, 0)
    group.add(sign)
    // Two screens set in the deck.
    const floor = painted(256, 128, g => {
        g.fillStyle = '#06161b'
        g.fillRect(0, 0, 256, 128)
        g.strokeStyle = 'rgba(63,216,208,.35)'
        g.lineWidth = 1
        for (let x = 0; x <= 256; x += 16) {
            g.beginPath()
            g.moveTo(x, 0)
            g.lineTo(x, 128)
            g.stroke()
        }
        for (let y = 0; y <= 128; y += 16) {
            g.beginPath()
            g.moveTo(0, y)
            g.lineTo(256, y)
            g.stroke()
        }
        neonText(g, 'NO RAILINGS', 128, 64, 26, '#ff4f9e')
    })
    for (const [x, z, turn] of [
        [-3.2, -1.6, 0],
        [3.2, 1.4, Math.PI],
    ] as const) {
        const screen = new Mesh(new PlaneGeometry(2, 1.2), screenMaterial(floor))
        screen.rotation.set(-Math.PI / 2, 0, turn)
        screen.position.set(x, 0.004, z)
        screen.receiveShadow = false
        group.add(screen)
    }
    // An antenna on the lid's corner, its light blinking red.
    const mast = new Mesh(new CylinderGeometry(0.01, 0.015, 0.7, 6), metal)
    mast.position.set(0.7, lid + 0.35, 0.7)
    group.add(mast)
    const beacon = new MeshBasicMaterial({ color: 0xff2a3c, toneMapped: false })
    const light = new Mesh(new SphereGeometry(0.03, 10, 8), beacon)
    light.position.set(0.7, lid + 0.72, 0.7)
    group.add(light)

    // --- The city: towers with lit windows all round, billboards, a street grid far below --------
    group.add(city())
    group.add(sky())

    // --- What moves and lives: the gondola, the tank's screen, the plane, the drones ----------------
    const life = new CloudNineLife(group, tankTexture, eggs)
    if (life.trackMesh) group.add(life.trackMesh)

    return {
        group,
        world,
        life,
        update(now) {
            light.visible = Math.floor(now / 700) % 2 === 0
        },
    }
}

/** Lit windows on a dark tower: a tile that repeats (some warm, some cyan, most dark). */
function windowsTexture(): CanvasTexture {
    const random = createRng(4)
    const texture = painted(128, 128, g => {
        g.fillStyle = '#0b111c'
        g.fillRect(0, 0, 128, 128)
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const r = random()
                g.fillStyle = r < 0.12 ? '#ffcf6b' : r < 0.2 ? '#3fd8d0' : r < 0.23 ? '#ff4f9e' : '#141c2a'
                g.fillRect(x * 16 + 3, y * 16 + 4, 10, 8)
            }
        }
    })
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    return texture
}

/** Towers round the deck (none closer than 18 m), most of them below it, a few framing it above. */
function city(): Group {
    const group = new Group()
    const random = createRng(21)
    const windows = new MeshBasicMaterial({ map: windowsTexture(), toneMapped: false })
    const towers: BufferGeometry[] = []
    for (let i = 0; i < 90; i++) {
        const angle = random() * Math.PI * 2
        const distance = 20 + random() * 90
        const w = 6 + random() * 12
        const d = 6 + random() * 12
        // The near ones mostly below the deck, so it floats; a few rise past it.
        const top = distance < 40 ? -6 - random() * 30 + (random() < 0.25 ? 26 : 0) : -20 + random() * 50
        const bottom = -140
        const g = new BoxGeometry(w, top - bottom, d)
        // Windows a few metres apart, whatever the tower's size.
        const uv = g.getAttribute('uv') as BufferAttribute
        for (let v = 0; v < uv.count; v++) {
            uv.setXY(v, uv.getX(v) * (Math.max(w, d) / 4), uv.getY(v) * ((top - bottom) / 4))
        }
        g.translate(Math.cos(angle) * distance, (top + bottom) / 2, Math.sin(angle) * distance)
        towers.push(g)
    }
    group.add(new Mesh(mergeGeometries(towers), windows))

    // Billboards on the towers nearest the deck, facing it.
    const ads: Array<[string, string, string, Vector3, number, number]> = [
        ['NOODLE BAR', '#3fd8d0', '#06161b', new Vector3(-24, 3, -14), 9, 4],
        ['HOTEL', '#ff4f9e', '#12081a', new Vector3(26, 6, 9), 3, 10],
        ['ARCADE 24/7', '#ffcf6b', '#1a1206', new Vector3(6, 9, -30), 12, 4],
        ['CLOUD 9', '#3fd8d0', '#06161b', new Vector3(-10, -6, 26), 10, 4],
    ]
    for (const [text, color, back, at, w, h] of ads) {
        const tall = h > w
        const texture = painted(tall ? 128 : 512, tall ? 512 : 128, g => {
            g.fillStyle = back
            g.fillRect(0, 0, tall ? 128 : 512, tall ? 512 : 128)
            if (tall) {
                ;[...text].forEach((ch, i) => neonText(g, ch, 64, 70 + i * 92, 84, color))
            } else {
                neonText(g, text, 256, 64, 64, color)
            }
        })
        const board = new Mesh(new PlaneGeometry(w, h), screenMaterial(texture))
        board.position.copy(at)
        board.lookAt(0, at.y, 0)
        group.add(board)
    }

    // The streets far below: a dim grid of light.
    const streets = painted(256, 256, g => {
        g.fillStyle = '#05070d'
        g.fillRect(0, 0, 256, 256)
        g.fillStyle = 'rgba(255,207,107,.45)'
        g.fillRect(0, 124, 256, 8)
        g.fillRect(124, 0, 8, 256)
    })
    streets.wrapS = RepeatWrapping
    streets.wrapT = RepeatWrapping
    streets.repeat.set(24, 24)
    const ground = new Mesh(new PlaneGeometry(800, 800), new MeshBasicMaterial({ map: streets, toneMapped: false }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -140
    group.add(ground)

    return group
}

/** The night sky: a dome from near black overhead to a magenta haze at the horizon (no fog on it). */
function sky(): Mesh {
    const geometry = new SphereGeometry(500, 32, 16)
    const position = geometry.getAttribute('position') as BufferAttribute
    const colors = new Float32Array(position.count * 3)
    const top = new Color(0x04060c)
    const middle = new Color(0x0a1222)
    const horizon = new Color(0x3a1838)
    const c = new Color()
    for (let i = 0; i < position.count; i++) {
        const up = position.getY(i) / 500
        if (up > 0.25) c.copy(middle).lerp(top, Math.min(1, (up - 0.25) / 0.75))
        else c.copy(horizon).lerp(middle, Math.max(0, (up + 0.2) / 0.45))
        colors.set([c.r, c.g, c.b], i * 3)
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    const dome = new Mesh(
        geometry,
        new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false })
    )
    // Drawn after everything (shaded only where it shows), like the office's sky.
    dome.renderOrder = 1
    return dome
}

/**
 * Switches what's shown between the office and Cloud Nine: the office's rooms, ceiling, street and
 * sky go, Cloud Nine comes; the same lights stay (switching them on and off would compile every
 * material again) but take the night's colours, and the fog darkens. The sun's shadow map is drawn
 * again for what's there.
 */
export function mapLooks(
    scene: Scene,
    office: Office,
    cloudNine: CloudNineScene,
    officeExtras: Object3D,
    renderer: WebGLRenderer
) {
    const found: Object3D[] = []
    office.root.traverse(o => found.push(o))
    const hemi = found.find((o): o is HemisphereLight => o instanceof HemisphereLight) ?? null
    const ambient = found.find((o): o is AmbientLight => o instanceof AmbientLight) ?? null
    const fill = found.find((o): o is DirectionalLight => o instanceof DirectionalLight && o !== office.sun) ?? null
    // The office's sky: the root's one mesh with a shader of its own.
    const sky = office.root.children.find(c => c instanceof Mesh && 'uniforms' in (c.material as object)) ?? null
    const sun = office.sun
    const officeFog =
        scene.fog instanceof FogExp2 ? { color: scene.fog.color.clone(), density: scene.fog.density } : null
    const lights = [sun, hemi, ambient, fill]
        .filter((l): l is DirectionalLight | HemisphereLight | AmbientLight => l !== null)
        .map(light => ({ light, color: light.color.clone(), intensity: light.intensity }))
    const hemiGround = hemi?.groundColor.clone() ?? null
    const fillAt = fill?.position.clone() ?? null
    const sunAt = sun.position.clone()

    return (map: MapId) => {
        const night = map === 'cloud-nine'
        for (const part of [office.interior, office.ceiling, office.outside, officeExtras]) part.visible = !night
        if (sky) sky.visible = !night
        cloudNine.group.visible = night
        if (!night) {
            for (const { light, color, intensity } of lights) {
                light.color.copy(color)
                light.intensity = intensity
            }
            if (hemi && hemiGround) hemi.groundColor.copy(hemiGround)
            if (fill && fillAt) fill.position.copy(fillAt)
            sun.position.copy(sunAt)
            if (officeFog && scene.fog instanceof FogExp2) {
                scene.fog.color.copy(officeFog.color)
                scene.fog.density = officeFog.density
            }
        } else {
            // Moonlight from high and to one side; the city's glow from below (the fill, turned up-side down).
            sun.color.set(0x9fb4ff)
            sun.intensity = 1.3
            sun.position.set(-14, 26, 9)
            if (hemi) {
                hemi.color.set(0x6a7ac0)
                hemi.groundColor.set(0x6a2a60)
                hemi.intensity = 1.4
            }
            if (ambient) {
                ambient.color.set(0x8a9ad0)
                ambient.intensity = 2.4
            }
            if (fill) {
                fill.color.set(NEON.magenta)
                fill.intensity = 0.35
                fill.position.set(6, -10, 4)
            }
            if (scene.fog instanceof FogExp2) {
                scene.fog.color.set(0x0b1020)
                scene.fog.density = 0.011
            }
        }
        sun.target.position.set(0, 0, 0)
        sun.target.updateMatrixWorld()
        renderer.shadowMap.needsUpdate = true
    }
}
