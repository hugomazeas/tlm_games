import {
    AdditiveBlending,
    BoxGeometry,
    Color,
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
import { PICKUP_SPOTS, type PickupKind, ZONES } from '../sim/places.ts'

/**
 * The pickups and the zone, in the office. Each pickup is a pad on the floor in its colour (always
 * there) with its item floating, turning and bobbing over it while it's there to take. The zone
 * (king of the meeting room) is a column of light from floor to ceiling over the active one:
 * white when nobody holds it, the holder's colour, orange and pulsing when contested.
 */

export const PICKUP_COLORS: Record<PickupKind, string> = {
    health: '#5ad16b',
    magazine: '#f2b134',
    jetpack: '#29a3e0',
    headshot: '#ff3b3b',
}

export class PickupViews {
    private readonly items: Group[] = []

    constructor(scene: Scene) {
        for (const spot of PICKUP_SPOTS) {
            const color = new Color(PICKUP_COLORS[spot.kind])
            const pad = new Mesh(
                new RingGeometry(0.16, 0.24, 32),
                new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: DoubleSide })
            )
            pad.rotation.x = -Math.PI / 2
            pad.position.set(spot.x, 0.006, spot.z)
            const glow = new Mesh(
                new CylinderGeometry(0.22, 0.22, 0.5, 24, 1, true),
                new MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.12,
                    blending: AdditiveBlending,
                    depthWrite: false,
                    side: DoubleSide,
                })
            )
            glow.position.set(spot.x, 0.25, spot.z)
            const item = model(spot.kind)
            item.position.set(spot.x, 0.22, spot.z)
            scene.add(pad, glow, item)
            this.items.push(item)
        }
    }

    /** `ready`: which are there to take (by spot). */
    update(ready: readonly boolean[], now: number): void {
        this.items.forEach((item, i) => {
            item.visible = ready[i] ?? true
            item.rotation.y = now * 0.0015 + i
            item.position.y = 0.22 + Math.sin(now * 0.003 + i) * 0.03
        })
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
    } else {
        const red = material(0xff3b3b, 0.7)
        group.add(new Mesh(new TorusGeometry(0.06, 0.01, 8, 24), red))
        group.add(new Mesh(new TorusGeometry(0.035, 0.008, 8, 20), red))
        group.add(new Mesh(new SphereGeometry(0.014, 10, 8), red))
    }

    return group
}

export class ZoneView {
    private readonly columns: Array<{
        column: Mesh
        ring: Mesh
        columnMaterial: MeshBasicMaterial
        ringMaterial: MeshBasicMaterial
    }>

    constructor(scene: Scene) {
        this.columns = ZONES.map(zone => {
            const columnMaterial = new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.12,
                blending: AdditiveBlending,
                depthWrite: false,
                side: DoubleSide,
            })
            const column = new Mesh(new CylinderGeometry(zone.radius, zone.radius, H, 48, 1, true), columnMaterial)
            column.position.set(zone.x, H / 2, zone.z)
            const ringMaterial = new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                side: DoubleSide,
            })
            const ring = new Mesh(new RingGeometry(zone.radius - 0.05, zone.radius, 64), ringMaterial)
            ring.rotation.x = -Math.PI / 2
            ring.position.set(zone.x, 0.008, zone.z)
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
