import {
    Box3,
    BoxGeometry,
    type CanvasTexture,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    Ray,
    SphereGeometry,
    Vector3,
} from 'three'
import { CLOUD_NINE, GONDOLA, gondolaAt } from '../map/cloud-nine.ts'

/**
 * What moves and lives on Cloud Nine, in the browser: the window-washer's gondola (its collision
 * is the world's: `GONDOLA`, on the step), with a lost racing helmet in its bucket; the tank's
 * screen (the leader's % live, a hot potato ad when you hit it, LIVE when a drone films you); the
 * paper plane circling with this week's top fragger on its wing (a blower blows it off course);
 * two camera drones (bat one and it follows you, filming, until you go down). The easter eggs are
 * this browser's alone: nobody else sees your drone or your plane's detour.
 */

export interface CloudNineEggs {
    topFragger: string | null
    helmet: { name: string; body: string; accent: string }
}

/** The ad the tank's screen shows for this long when you hit it. */
const AD_MS = 10_000
/** The plane: its circle round the tank, its height, its lap. */
const PLANE = { radius: 5.5, y: 3.6, lapMs: 22_000 } as const
/** The drones: their circles round the deck, their height. */
const DRONES = { radius: 4.2, y: 2.1, lapMs: 16_000 } as const

type Screen =
    | { kind: 'logo' }
    | { kind: 'leader'; name: string; percent: number }
    | { kind: 'potato' }
    | { kind: 'live'; name: string }

export class CloudNineLife {
    private readonly gondola = new Group()
    private readonly plane = new Group()
    /** The plane blown off its circle: an offset that drifts back, and its spin. */
    private readonly planeOff = new Vector3()
    private readonly planeDrift = new Vector3()
    private planeSpin = 0
    private readonly drones: Array<{ group: Group; rotors: Mesh[]; following: boolean; at: Vector3 }> = []
    private screen: Screen = { kind: 'logo' }
    private screenKey = ''
    private adUntil = 0
    private leader: { name: string; percent: number } | null = null
    private filming: string | null = null
    private readonly tankBox = new Box3(new Vector3(-0.82, 1.95, -0.82), new Vector3(0.82, 2.55, 0.82))

    constructor(
        parent: Group,
        private readonly tank: CanvasTexture,
        eggs: CloudNineEggs
    ) {
        this.buildGondola(eggs)
        this.buildPlane(eggs.topFragger)
        for (let i = 0; i < 2; i++) this.drones.push(this.buildDrone())
        parent.add(this.gondola, this.plane, ...this.drones.map(d => d.group))
        this.draw()
    }

    /** Each frame: the gondola where the step puts it, the plane and drones on their way, the screen. */
    update(now: number, step: number, head: Vector3 | null): void {
        this.gondola.position.x = gondolaAt(step).x
        // The plane: round its circle, plus whatever the blower did (drifting back).
        const a = (now / PLANE.lapMs) * Math.PI * 2
        this.planeOff.add(this.planeDrift.clone().multiplyScalar(0.016))
        this.planeDrift.multiplyScalar(0.97)
        this.planeOff.multiplyScalar(0.995)
        this.planeSpin *= 0.97
        this.plane.position.set(
            Math.cos(a) * PLANE.radius + this.planeOff.x,
            PLANE.y + Math.sin(now * 0.0011) * 0.2 + this.planeOff.y,
            Math.sin(a) * PLANE.radius * 0.6 + this.planeOff.z
        )
        this.plane.rotation.set(this.planeSpin, -a, Math.sin(now * 0.0011) * 0.2 + this.planeSpin)
        // The drones: round the deck, or (one you batted) at your shoulder.
        this.drones.forEach((drone, i) => {
            const b = (now / DRONES.lapMs) * Math.PI * 2 * (i ? -1 : 1) + i * Math.PI
            const home = new Vector3(
                Math.cos(b) * DRONES.radius,
                DRONES.y + Math.sin(now * 0.002 + i) * 0.1,
                Math.sin(b) * 1.9
            )
            const target = drone.following && head ? head.clone().add(new Vector3(0.35, 0.25, 0.35)) : home
            if (drone.following && !head) drone.following = false
            drone.at.lerp(target, 0.06)
            drone.group.position.copy(drone.at)
            if (drone.following && head) drone.group.lookAt(head)
            for (const rotor of drone.rotors) rotor.rotation.y += 0.9
        })
        if (!this.drones.some(d => d.following)) this.filming = null
        // The screen: the ad while it runs, else LIVE while you're filmed, else the leader, else the logo.
        const next: Screen =
            now < this.adUntil
                ? { kind: 'potato' }
                : this.filming
                  ? { kind: 'live', name: this.filming }
                  : this.leader
                    ? { kind: 'leader', ...this.leader }
                    : { kind: 'logo' }
        const key = JSON.stringify(next)
        if (key !== this.screenKey) {
            this.screen = next
            this.screenKey = key
            this.draw()
        }
    }

    /** The match's leader and their % (Shove), for the tank's screen; null: the logo. */
    showLeader(name: string | null, percent: number | null): void {
        this.leader = name !== null && percent !== null ? { name, percent } : null
    }

    /** A blast or a swing from `from` along `dir` (within `reach`): if it meets the tank's screen, the hot potato ad. */
    hitScreen(from: Vector3, dir: Vector3, reach: number, now: number): boolean {
        const hit = new Ray(from, dir).intersectBox(this.tankBox, new Vector3())
        if (!hit || hit.distanceTo(from) > reach) return false
        this.adUntil = now + AD_MS
        return true
    }

    /** The blower's stream from `from` along `dir`: if the plane is in it, it's blown off course. True when it was. */
    blowPlane(from: Vector3, dir: Vector3): boolean {
        const to = this.plane.position.clone().sub(from)
        const distance = to.length()
        if (distance > 3 || to.normalize().dot(dir) < Math.cos(0.5)) return false
        this.planeDrift.addScaledVector(dir, 0.6)
        this.planeSpin += 0.3
        return true
    }

    /** A bat swing at `at`: a drone within reach starts following (and filming) `name`. True when one did. */
    batDrone(at: Vector3, name: string): boolean {
        const drone = this.drones.find(d => !d.following && d.at.distanceTo(at) < 1.1)
        if (!drone) return false
        drone.following = true
        this.filming = name
        return true
    }

    // --- Building ---------------------------------------------------------------------------------

    private buildGondola(eggs: CloudNineEggs): void {
        const [hx, hy, hz] = GONDOLA.half
        const yellow = new MeshStandardMaterial({ color: 0xe0b13a, roughness: 0.5, metalness: 0.3 })
        const steel = new MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.35, metalness: 0.8 })
        const lamp = new MeshBasicMaterial({ color: 0xffcf6b, toneMapped: false })
        const g = this.gondola
        const floor = new Mesh(new BoxGeometry(hx * 2, hy * 2, hz * 2), yellow)
        floor.position.set(0, GONDOLA.top - hy, GONDOLA.z)
        g.add(floor)
        // Its rail on the open three sides, low (a mini looks over it), and the lights under the floor.
        for (const [w, d, x, z] of [
            [hx * 2, 0.02, 0, GONDOLA.z + hz],
            [0.02, hz * 2, -hx, GONDOLA.z],
            [0.02, hz * 2, hx, GONDOLA.z],
        ] as const) {
            const rail = new Mesh(new BoxGeometry(w, 0.02, d), steel)
            rail.position.set(x, GONDOLA.top + 0.2, z)
            g.add(rail)
        }
        for (let i = 0; i < 5; i++) {
            const bulb = new Mesh(new BoxGeometry(0.12, 0.02, 0.04), lamp)
            bulb.position.set(-hx + 0.16 + i * 0.32, GONDOLA.top - hy * 2 - 0.01, GONDOLA.z + hz - 0.05)
            g.add(bulb)
        }
        // Two cables up to the track along the deck's front edge.
        for (const x of [-hx + 0.08, hx - 0.08]) {
            const cable = new Mesh(new CylinderGeometry(0.006, 0.006, -GONDOLA.top - 0.1, 6), steel)
            cable.position.set(x, GONDOLA.top / 2 - 0.05, GONDOLA.z - hz + 0.05)
            g.add(cable)
        }
        // The bucket, and the lost helmet in it, in a racing driver's colours.
        const bucket = new Mesh(
            new CylinderGeometry(0.09, 0.07, 0.12, 14, 1, true),
            new MeshStandardMaterial({ color: 0x5a6a86, roughness: 0.6, side: DoubleSide })
        )
        bucket.position.set(0.45, GONDOLA.top + 0.06, GONDOLA.z - 0.1)
        const helmet = new Group()
        helmet.add(
            new Mesh(
                new SphereGeometry(0.07, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
                new MeshStandardMaterial({ color: eggs.helmet.body, roughness: 0.25, metalness: 0.3 })
            )
        )
        const stripe = new Mesh(
            new SphereGeometry(0.0705, 18, 12, -0.25, 0.5, 0, Math.PI * 0.6),
            new MeshStandardMaterial({ color: eggs.helmet.accent, roughness: 0.25 })
        )
        const visor = new Mesh(
            new SphereGeometry(0.071, 18, 8, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.3, Math.PI * 0.2),
            new MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.05, metalness: 0.9 })
        )
        helmet.add(stripe, visor)
        helmet.position.set(0.45, GONDOLA.top + 0.1, GONDOLA.z - 0.1)
        helmet.rotation.set(0.4, 0.8, 0.2)
        g.add(bucket, helmet)
        // The track the cables run on, along the deck's front edge (fixed: not part of the group that moves).
        const track = new Mesh(new BoxGeometry(CLOUD_NINE.halfX * 2, 0.05, 0.04), steel)
        track.position.set(0, -0.12, CLOUD_NINE.halfZ + 0.02)
        this.trackMesh = track
    }

    /** The cables' track (fixed): the scene adds it beside the gondola. */
    trackMesh: Mesh | null = null

    private buildPlane(name: string | null): void {
        const paper = new MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.8, side: DoubleSide })
        // Two wings folded from a sheet: a long dart pointing along +x.
        for (const side of [-1, 1]) {
            const wing = new Mesh(new PlaneGeometry(0.5, 0.18), paper)
            wing.rotation.set(-Math.PI / 2 + side * 0.25, 0, 0)
            wing.position.set(0, 0, side * 0.08)
            this.plane.add(wing)
        }
        const keel = new Mesh(new PlaneGeometry(0.5, 0.06), paper)
        keel.position.y = -0.03
        this.plane.add(keel)
        if (!name) return
        // The name on top of the wings, in marker.
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 64
        const g = canvas.getContext('2d')!
        g.fillStyle = '#1a2a6c'
        g.font = '700 30px system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(`★ ${name.slice(0, 14)}`, 128, 34)
        const texture = new (this.tank.constructor as typeof CanvasTexture)(canvas)
        texture.colorSpace = this.tank.colorSpace
        const label = new Mesh(
            new PlaneGeometry(0.42, 0.1),
            new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide })
        )
        label.rotation.x = -Math.PI / 2
        label.position.y = 0.012
        this.plane.add(label)
    }

    private buildDrone(): { group: Group; rotors: Mesh[]; following: boolean; at: Vector3 } {
        const group = new Group()
        const shell = new MeshStandardMaterial({ color: 0x2a3446, roughness: 0.4, metalness: 0.6 })
        group.add(new Mesh(new BoxGeometry(0.12, 0.04, 0.12), shell))
        const lens = new Mesh(
            new SphereGeometry(0.025, 12, 8),
            new MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.05, metalness: 0.9 })
        )
        lens.position.set(0, -0.02, 0.06)
        const rec = new Mesh(
            new SphereGeometry(0.01, 8, 6),
            new MeshBasicMaterial({ color: 0xff2a3c, toneMapped: false })
        )
        rec.position.set(0.04, 0.025, 0.05)
        group.add(lens, rec)
        const rotors: Mesh[] = []
        const blade = new MeshBasicMaterial({ color: 0x3fd8d0, transparent: true, opacity: 0.5, toneMapped: false })
        for (const [x, z] of [
            [-0.09, -0.09],
            [0.09, -0.09],
            [-0.09, 0.09],
            [0.09, 0.09],
        ] as const) {
            const rotor = new Mesh(new BoxGeometry(0.12, 0.004, 0.015), blade)
            rotor.position.set(x, 0.03, z)
            rotors.push(rotor)
            group.add(rotor)
        }
        return { group, rotors, following: false, at: new Vector3(0, DRONES.y, 0) }
    }

    /** The tank's screen, drawn for what it shows now. */
    private draw(): void {
        const canvas = this.tank.image as HTMLCanvasElement
        const g = canvas.getContext('2d')!
        const w = canvas.width
        const h = canvas.height
        const s = this.screen
        g.shadowBlur = 0
        g.fillStyle = s.kind === 'potato' ? '#2a1606' : '#071c22'
        g.fillRect(0, 0, w, h)
        g.fillStyle = 'rgba(63,216,208,.10)'
        for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1)
        const text = (t: string, x: number, y: number, size: number, color: string) => {
            g.font = `800 ${size}px system-ui, sans-serif`
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.shadowColor = color
            g.shadowBlur = size * 0.45
            g.fillStyle = color
            g.fillText(t, x, y)
            g.shadowBlur = 0
        }
        if (s.kind === 'logo') {
            text('CLOUD NINE', w * 0.31, 52, 44, '#3fd8d0')
            text('▲ 400 m', w * 0.31, 100, 22, '#ff4f9e')
        } else if (s.kind === 'leader') {
            text('LEADER', w * 0.18, 30, 18, '#ff4f9e')
            text(s.name.slice(0, 12).toUpperCase(), w * 0.32, 76, 34, '#3fd8d0')
            const hot = s.percent >= 130 ? '#ff4d4d' : s.percent >= 80 ? '#ff9f1c' : '#ffd166'
            text(`${s.percent}%`, w * 0.78, 64, 56, hot)
        } else if (s.kind === 'potato') {
            text('🥔 HOT POTATO', w * 0.5, 46, 40, '#ffb347')
            text('PASS IT ON · /games/hot-potato', w * 0.5, 96, 20, '#ffd166')
        } else {
            text('● LIVE', w * 0.16, 36, 26, '#ff2a3c')
            text(s.name.slice(0, 14).toUpperCase(), w * 0.55, 72, 36, '#3fd8d0')
        }
        this.tank.needsUpdate = true
    }
}
