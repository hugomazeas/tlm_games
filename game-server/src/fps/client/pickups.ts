import {
    AdditiveBlending,
    BoxGeometry,
    CircleGeometry,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    RingGeometry,
    type Scene,
    SphereGeometry,
    TorusGeometry,
} from 'three'
import type { ZoneState } from '../protocol.ts'
import { H } from '../map/office.js'
import {
    type Dome,
    PAD,
    type Pad,
    PICKUP_SPOTS,
    type PickupKind,
    PICKUPS,
    type Portal,
    PORTAL,
    type SiegeSpot,
    SPOT_HEIGHT,
    type Zone,
    ZONES,
} from '../sim/places.ts'

/**
 * The pickups and the zone, in the office. Each pickup is a pad on the floor in its colour (always
 * there) with its item floating, turning and bobbing over it while it's there to take. The zone
 * (king of the meeting room, or siege's spot) is a column of light from floor to ceiling over the
 * active one: white when nobody holds it, the holder's colour, orange and pulsing when contested.
 * Siege's dome is a half sphere of light in the attackers' colour.
 */

/** The pickups' colours (a power's is its buff's in hud.ts too). */
export const PICKUP_COLORS: Record<PickupKind, string> = {
    health: '#5ad16b',
    magazine: '#f2b134',
    jetpack: '#29a3e0',
    headshot: '#ff3b3b',
    overtime: '#ff7a1a',
    promotion: '#b06bff',
    firewall: '#33e0ff',
    espresso: '#c08552',
    intern: '#b4f06b',
    bonus: '#ff4fa3',
    orgchart: '#e8ecf2',
}

/** An empty spot (taken, what comes back is a surprise): a dim neutral ring, no glow. */
const EMPTY_COLOR = '#9aa3ad'

interface SpotView {
    pad: MeshBasicMaterial
    glow: Mesh
    /** The models made so far for this spot, by kind (what lies there is rolled each time). */
    items: Map<PickupKind, Group>
    showing: PickupKind | null | undefined
    x: number
    z: number
}

export class PickupViews {
    private readonly spots: SpotView[] = []

    constructor(private readonly scene: Scene) {
        for (const spot of PICKUP_SPOTS) {
            const padMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.8, side: DoubleSide })
            const pad = new Mesh(new RingGeometry(0.16, 0.24, 32), padMaterial)
            pad.rotation.x = -Math.PI / 2
            pad.position.set(spot.x, 0.006, spot.z)
            const glow = new Mesh(
                new CylinderGeometry(0.22, 0.22, 0.5, 24, 1, true),
                new MeshBasicMaterial({
                    transparent: true,
                    opacity: 0.12,
                    blending: AdditiveBlending,
                    depthWrite: false,
                    side: DoubleSide,
                })
            )
            glow.position.set(spot.x, 0.25, spot.z)
            scene.add(pad, glow)
            this.spots.push({ pad: padMaterial, glow, items: new Map(), showing: undefined, x: spot.x, z: spot.z })
        }
        // One of each kind, hidden for good: their shaders compile at load (the spots' own models
        // come when first rolled).
        const standIns = new Group()
        for (const kind of Object.keys(PICKUPS) as PickupKind[]) standIns.add(model(kind))
        standIns.visible = false
        scene.add(standIns)
    }

    /** `lying`: what's there to take on each spot (null: taken, coming back). */
    update(lying: readonly (PickupKind | null)[], now: number): void {
        this.spots.forEach((spot, i) => {
            const kind = lying[i] ?? null
            if (kind !== spot.showing) this.show(spot, kind)
            const item = kind ? spot.items.get(kind) : undefined
            if (!item) return
            item.rotation.y = now * 0.0015 + i
            item.position.y = 0.22 + Math.sin(now * 0.003 + i) * 0.03
        })
    }

    /** The spot's ring and glow in the colour of what lies there, its model over it. */
    private show(spot: SpotView, kind: PickupKind | null): void {
        spot.showing = kind
        spot.pad.color.set(kind ? PICKUP_COLORS[kind] : EMPTY_COLOR)
        spot.pad.opacity = kind ? 0.8 : 0.35
        spot.glow.visible = kind !== null
        if (kind) (spot.glow.material as MeshBasicMaterial).color.set(PICKUP_COLORS[kind])
        for (const [k, item] of spot.items) item.visible = k === kind
        if (kind && !spot.items.has(kind)) {
            const item = model(kind)
            item.position.set(spot.x, 0.22, spot.z)
            this.scene.add(item)
            spot.items.set(kind, item)
        }
    }
}

/** A small model of each pickup (about 12 cm, to a 40 cm mini). */
function model(kind: PickupKind): Group {
    const group = new Group()
    const material = (color: string | number, emissive = 0.25) =>
        new MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: emissive })
    if (kind === 'health') {
        group.add(new Mesh(new BoxGeometry(0.13, 0.1, 0.09), material(0xf4f4f0, 0.15)))
        const red = material(0xe02424, 0.5)
        for (const [w, h] of [
            [0.07, 0.022],
            [0.022, 0.07],
        ] as const) {
            const cross = new Mesh(new BoxGeometry(w, h, 0.094), red)
            group.add(cross)
        }
    } else if (kind === 'magazine') {
        group.add(new Mesh(new BoxGeometry(0.12, 0.08, 0.07), material(0x6b5a2e, 0.1)))
        const brass = material(0xf2b134, 0.6)
        for (let i = 0; i < 4; i++) {
            const round = new Mesh(new CylinderGeometry(0.009, 0.009, 0.05, 8), brass)
            round.position.set(-0.04 + i * 0.027, 0.06, 0)
            group.add(round)
        }
    } else if (kind === 'jetpack') {
        const blue = material(0x29a3e0, 0.5)
        const tank = new Mesh(new CylinderGeometry(0.035, 0.035, 0.12, 14), blue)
        const cap = new Mesh(new SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), blue)
        cap.position.y = 0.06
        const nozzle = new Mesh(new CylinderGeometry(0.02, 0.03, 0.03, 12), material(0x333a44, 0.1))
        nozzle.position.y = -0.075
        group.add(tank, cap, nozzle)
    } else if (kind === 'headshot') {
        const red = material(0xff3b3b, 0.7)
        group.add(new Mesh(new TorusGeometry(0.06, 0.01, 8, 24), red))
        group.add(new Mesh(new TorusGeometry(0.035, 0.008, 8, 20), red))
        group.add(new Mesh(new SphereGeometry(0.014, 10, 8), red))
    } else if (kind === 'overtime') {
        // A wall clock: an orange rim, a white face, two hands.
        const face = new Mesh(new CylinderGeometry(0.06, 0.06, 0.015, 24), material(0xf4f4f0, 0.2))
        face.rotation.x = Math.PI / 2
        const dark = material(0x222222, 0)
        const long = new Mesh(new BoxGeometry(0.006, 0.045, 0.004), dark)
        long.position.set(0, 0.02, 0.01)
        const short = new Mesh(new BoxGeometry(0.03, 0.006, 0.004), dark)
        short.position.set(0.013, 0, 0.01)
        group.add(face, new Mesh(new TorusGeometry(0.06, 0.009, 8, 28), material(0xff7a1a, 0.6)), long, short)
    } else if (kind === 'promotion') {
        // An arrow up, in purple.
        const purple = material(0xb06bff, 0.6)
        const head = new Mesh(new ConeGeometry(0.05, 0.06, 4), purple)
        head.position.y = 0.04
        const shaft = new Mesh(new BoxGeometry(0.035, 0.07, 0.035), purple)
        shaft.position.y = -0.025
        group.add(head, shaft)
    } else if (kind === 'firewall') {
        // A cyan shield: a flattened, faceted disc with a brick line across.
        const shield = new Mesh(new CylinderGeometry(0.06, 0.045, 0.02, 6), material(0x33e0ff, 0.6))
        shield.rotation.x = Math.PI / 2
        const brick = new Mesh(new BoxGeometry(0.09, 0.008, 0.024), material(0xff7a1a, 0.6))
        group.add(shield, brick)
    } else if (kind === 'espresso') {
        // A little cup on a saucer.
        const white = material(0xf4f4f0, 0.2)
        const cup = new Mesh(new CylinderGeometry(0.035, 0.028, 0.05, 16), white)
        const coffee = new Mesh(new CylinderGeometry(0.031, 0.031, 0.004, 16), material(0x5b3a1e, 0.2))
        coffee.position.y = 0.022
        const handle = new Mesh(new TorusGeometry(0.014, 0.004, 6, 12), white)
        handle.position.x = 0.04
        const saucer = new Mesh(new CylinderGeometry(0.055, 0.05, 0.006, 20), material(0xc08552, 0.4))
        saucer.position.y = -0.028
        group.add(cup, coffee, handle, saucer)
    } else if (kind === 'intern') {
        // A name badge on a lanyard.
        const badge = new Mesh(new BoxGeometry(0.06, 0.08, 0.008), material(0xf4f4f0, 0.2))
        const stripe = new Mesh(new BoxGeometry(0.06, 0.02, 0.01), material(0xb4f06b, 0.6))
        stripe.position.y = 0.03
        const lanyard = new Mesh(new TorusGeometry(0.045, 0.004, 6, 20, Math.PI), material(0xb4f06b, 0.5))
        lanyard.position.y = 0.04
        group.add(badge, stripe, lanyard)
    } else if (kind === 'bonus') {
        // A stack of pink-gold coins.
        const coin = material(0xff4fa3, 0.6)
        for (let i = 0; i < 4; i++) {
            const c = new Mesh(new CylinderGeometry(0.035, 0.035, 0.012, 18), coin)
            c.position.set((i % 2) * 0.006, -0.03 + i * 0.016, 0)
            group.add(c)
        }
    } else {
        // An org chart: a box on top, three under it, joined by lines.
        const white = material(0xe8ecf2, 0.4)
        const top = new Mesh(new BoxGeometry(0.04, 0.025, 0.012), white)
        top.position.y = 0.04
        group.add(top)
        const line = new Mesh(new BoxGeometry(0.004, 0.03, 0.004), white)
        line.position.y = 0.015
        const bar = new Mesh(new BoxGeometry(0.1, 0.004, 0.004), white)
        group.add(line, bar)
        for (const x of [-0.05, 0, 0.05]) {
            const box = new Mesh(new BoxGeometry(0.03, 0.022, 0.012), white)
            box.position.set(x, -0.02, 0)
            group.add(box)
        }
    }

    return group
}

/** The jump pads: a glowing disc with chevrons pointing up, and a ring that keeps rising off it. */
export class PadViews {
    private readonly rings: Array<{ ring: Mesh; material: MeshBasicMaterial }> = []

    constructor(scene: Scene, pads: readonly Pad[]) {
        for (const pad of pads) {
            const base = new Mesh(
                new CylinderGeometry(PAD.radius + 0.04, PAD.radius + 0.06, 0.02, 32),
                new MeshStandardMaterial({ color: 0x2b313a, roughness: 0.5, metalness: 0.6 })
            )
            base.position.set(pad.x, 0.01, pad.z)
            const disc = new Mesh(
                new CircleGeometry(PAD.radius, 32),
                new MeshBasicMaterial({ color: 0x7cf7d4, transparent: true, opacity: 0.85 })
            )
            disc.rotation.x = -Math.PI / 2
            disc.position.set(pad.x, 0.022, pad.z)
            scene.add(base, disc)
            // Three chevrons rising out of it, and a ring that runs up and fades.
            for (let i = 0; i < 3; i++) {
                const chevron = new Mesh(
                    new ConeGeometry(0.06, 0.05, 4, 1, true),
                    new MeshBasicMaterial({ color: 0x7cf7d4, transparent: true, opacity: 0.5, depthWrite: false })
                )
                chevron.position.set(pad.x, 0.08 + i * 0.07, pad.z)
                scene.add(chevron)
            }
            const material = new MeshBasicMaterial({
                color: 0x7cf7d4,
                transparent: true,
                opacity: 0.6,
                blending: AdditiveBlending,
                depthWrite: false,
                side: DoubleSide,
            })
            const ring = new Mesh(new RingGeometry(PAD.radius - 0.02, PAD.radius, 32), material)
            ring.rotation.x = -Math.PI / 2
            ring.position.set(pad.x, 0.03, pad.z)
            scene.add(ring)
            this.rings.push({ ring, material })
        }
    }

    update(now: number): void {
        for (const [i, { ring, material }] of this.rings.entries()) {
            const t = (((now * 0.0008 + i * 0.37) % 1) + 1) % 1
            ring.position.y = 0.03 + t * 0.5
            material.opacity = 0.6 * (1 - t)
        }
    }
}

/**
 * The portals: a standing ring facing its way out, filled with a swirling disc; each pair in its own
 * colour (orange and blue for the first), so you can tell where it leads.
 */
export class PortalViews {
    private readonly swirls: Mesh[] = []

    constructor(scene: Scene, portals: readonly Portal[]) {
        const PAIR_COLORS = [0xff9a3c, 0x3ca8ff]
        for (const [i, portal] of portals.entries()) {
            const color = PAIR_COLORS[Math.floor(i / 2) % PAIR_COLORS.length]!
            const group = new Group()
            group.position.set(portal.x, 0.36, portal.z)
            // The ring stands across its way out: its face looks along `out`.
            group.rotation.y = Math.atan2(portal.out[0], portal.out[1])
            const rim = new Mesh(
                new TorusGeometry(0.34, 0.03, 10, 40),
                new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3 })
            )
            const swirl = new Mesh(
                new CircleGeometry(0.32, 40),
                new MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.45,
                    blending: AdditiveBlending,
                    depthWrite: false,
                    side: DoubleSide,
                })
            )
            const glow = new Mesh(
                new RingGeometry(0.0, PORTAL.radius + 0.12, 32),
                new MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide })
            )
            glow.rotation.x = -Math.PI / 2
            glow.position.set(portal.x, 0.006, portal.z)
            group.add(rim, swirl)
            scene.add(group, glow)
            this.swirls.push(swirl)
        }
    }

    update(now: number): void {
        for (const [i, swirl] of this.swirls.entries()) {
            swirl.rotation.z = now * 0.003 * (i % 2 ? -1 : 1)
            const material = swirl.material as MeshBasicMaterial
            material.opacity = 0.35 + Math.sin(now * 0.004 + i) * 0.12
        }
    }
}

export class ZoneView {
    private readonly columns: Array<{
        column: Mesh
        /** Its outline on the floor (and, a square's, at its top). */
        ring: Group
        columnMaterial: MeshBasicMaterial
        ringMaterial: MeshBasicMaterial
    }>

    /** Round zones (king of the meeting room), or squares squared to the office (siege's spots: `half` a side). */
    constructor(scene: Scene, zones: readonly (Zone | SiegeSpot)[] = ZONES) {
        this.columns = zones.map(place => {
            // A square is a four-sided cylinder through its corners, turned an eighth.
            const square = 'half' in place
            const zone = { ...place, radius: square ? place.half * Math.SQRT2 : place.radius }
            const sides = square ? 4 : 48
            const turn = square ? Math.PI / 4 : 0
            const columnMaterial = new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.12,
                blending: AdditiveBlending,
                depthWrite: false,
                side: DoubleSide,
            })
            // A square (siege's spot) goes two walls up; a zone to the ceiling.
            const height = square ? SPOT_HEIGHT : H
            const column = new Mesh(
                new CylinderGeometry(zone.radius, zone.radius, height, sides, 1, true),
                columnMaterial
            )
            column.position.set(zone.x, height / 2, zone.z)
            column.rotation.y = turn
            const ringMaterial = new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                side: DoubleSide,
            })
            const width = square ? 0.05 * Math.SQRT2 : 0.05
            const outline = new RingGeometry(zone.radius - width, zone.radius, square ? 4 : 64, 1, turn)
            const ring = new Group()
            for (const y of square ? [0.008, height] : [0.008]) {
                const edge = new Mesh(outline, ringMaterial)
                edge.rotation.x = -Math.PI / 2
                edge.position.set(zone.x, y, zone.z)
                ring.add(edge)
            }
            column.visible = ring.visible = false
            scene.add(column, ring)
            return { column, ring, columnMaterial, ringMaterial }
        })
    }

    /** The active zone in its state's colour; the others hidden. `colorOf` gives a holder's colour. */
    update(zone: ZoneState | null, colorOf: (id: string) => string, mine: boolean, now: number): void {
        this.columns.forEach((c, i) => {
            const active = zone !== null && zone.index === i
            c.column.visible = c.ring.visible = active
            if (!active || !zone) return
            const color = zone.contested
                ? '#ff9f43'
                : zone.holder
                  ? mine
                      ? '#5ad16b'
                      : colorOf(zone.holder)
                  : '#ffffff'
            c.columnMaterial.color.set(color)
            c.ringMaterial.color.set(color)
            const pulse = zone.contested ? 0.5 + Math.sin(now * 0.012) * 0.5 : 0.5
            c.columnMaterial.opacity = 0.08 + pulse * 0.1
        })
    }
}

/**
 * Siege's dome while it stands: a force field, a tinted half sphere with a grid over it, in the
 * attackers' colour (plain transparent basic materials, like the zone column's: no new shader).
 */
export class DomeView {
    private readonly shell = new Group()
    private readonly fill: MeshBasicMaterial
    private readonly grid: MeshBasicMaterial

    constructor(scene: Scene) {
        const half = new SphereGeometry(1, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2)
        this.fill = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            side: DoubleSide,
        })
        this.grid = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            wireframe: true,
        })
        this.shell.add(new Mesh(half, this.fill), new Mesh(half, this.grid))
        this.shell.visible = false
        scene.add(this.shell)
    }

    update(dome: Dome | null, color: string, now: number): void {
        this.shell.visible = dome !== null
        if (!dome) return
        this.shell.position.set(dome.x, 0, dome.z)
        this.shell.scale.setScalar(dome.radius)
        this.fill.color.set(color)
        this.grid.color.set(color)
        this.grid.opacity = 0.5 + Math.sin(now * 0.004) * 0.15
    }
}
