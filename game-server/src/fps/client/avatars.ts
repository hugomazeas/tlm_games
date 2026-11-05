import {
    BoxGeometry,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    GreaterDepth,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Scene,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { type BuffKind, type Gun, type PlayerInfo, TEAM_COLORS } from '../protocol.ts'
import { powersOf } from '../sim/combat.ts'
import { PLAYER, scaleOf } from '../sim/movement.ts'
import { BUFF_COLORS } from './hud.ts'
import type { Pose } from './timeline.ts'

/**
 * The other minis: little jetpack troopers in their player's colour, drawn inside the 40 cm
 * capsule the server collides and hits (feet at 0, eyes at PLAYER.eye). Legs swing with their
 * speed and dangle in flight, the arms hold their gun (or stapler) that follows their aim, the jetpack's two
 * flames flicker while it burns; a hit flashes them white, a spawn shield wraps them in a bubble.
 */

// Heights (m) inside the 0.4 m capsule.
const HIP = 0.13
const SHOULDER = 0.245
const HEAD = 0.32

const shape = {
    leg: new CapsuleGeometry(0.026, 0.07, 4, 10).translate(0, -0.06, 0),
    boot: new RoundedBoxGeometry(0.06, 0.035, 0.085, 2, 0.012).translate(0, -0.12, -0.012),
    torso: new RoundedBoxGeometry(0.15, 0.13, 0.1, 3, 0.035),
    belt: new BoxGeometry(0.155, 0.022, 0.105),
    buckle: new BoxGeometry(0.03, 0.02, 0.01),
    chest: new RoundedBoxGeometry(0.08, 0.045, 0.012, 2, 0.006),
    arm: new CapsuleGeometry(0.021, 0.06, 4, 8).translate(0, -0.05, 0),
    glove: new SphereGeometry(0.024, 10, 8),
    head: new SphereGeometry(0.072, 22, 16),
    // A band of the helmet facing -Z (phi = -π/2 is the front in three.js's sphere).
    visor: new SphereGeometry(0.074, 22, 12, -Math.PI * 0.92, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.32),
    earCap: new CylinderGeometry(0.022, 0.022, 0.016, 12).rotateZ(Math.PI / 2),
    antenna: new CylinderGeometry(0.003, 0.003, 0.06, 6).translate(0, 0.03, 0),
    antennaTip: new SphereGeometry(0.011, 10, 8),
    pack: new RoundedBoxGeometry(0.12, 0.13, 0.06, 2, 0.018),
    tank: new CylinderGeometry(0.022, 0.022, 0.11, 12),
    nozzle: new CylinderGeometry(0.018, 0.026, 0.03, 12),
    ring: new TorusGeometry(0.024, 0.004, 6, 16).rotateX(Math.PI / 2),
    flame: new ConeGeometry(0.022, 0.12, 10).rotateX(Math.PI).translate(0, -0.06, 0),
    core: new ConeGeometry(0.011, 0.07, 8).rotateX(Math.PI).translate(0, -0.035, 0),
    gun: new RoundedBoxGeometry(0.032, 0.04, 0.13, 2, 0.008),
    staplerBase: new BoxGeometry(0.03, 0.012, 0.11),
    staplerArm: new BoxGeometry(0.026, 0.018, 0.1),
    // Iron sights on top: a notched rear block, a thin front post.
    rearSight: new BoxGeometry(0.018, 0.009, 0.01),
    frontSight: new BoxGeometry(0.004, 0.012, 0.005),
    barrel: new CylinderGeometry(0.009, 0.009, 0.06, 10).rotateX(Math.PI / 2),
    muzzle: new CylinderGeometry(0.012, 0.012, 0.012, 10).rotateX(Math.PI / 2),
    // The other guns, built along -Z like the rifle (cylinders turned to lie along Z).
    stock: new BoxGeometry(0.024, 0.032, 0.05),
    rifleMag: new BoxGeometry(0.018, 0.04, 0.024),
    longBarrel: new CylinderGeometry(0.006, 0.006, 0.13, 8).rotateX(Math.PI / 2),
    scope: new CylinderGeometry(0.011, 0.011, 0.08, 12).rotateX(Math.PI / 2),
    scopeBell: new CylinderGeometry(0.015, 0.011, 0.02, 12).rotateX(Math.PI / 2),
    lens: new CylinderGeometry(0.01, 0.01, 0.003, 12).rotateX(Math.PI / 2),
    shotgunBarrel: new CylinderGeometry(0.012, 0.012, 0.11, 10).rotateX(Math.PI / 2),
    pump: new BoxGeometry(0.034, 0.024, 0.045),
    pistol: new RoundedBoxGeometry(0.026, 0.026, 0.075, 2, 0.006),
    pistolGrip: new BoxGeometry(0.022, 0.045, 0.026),
    launcherTube: new CylinderGeometry(0.03, 0.03, 0.24, 14).rotateX(Math.PI / 2),
    launcherBand: new CylinderGeometry(0.032, 0.032, 0.025, 14).rotateX(Math.PI / 2),
    warhead: new ConeGeometry(0.022, 0.045, 12).rotateX(-Math.PI / 2),
    ringSight: new TorusGeometry(0.012, 0.002, 6, 16),
    shield: new SphereGeometry(0.29, 24, 16),
    firewall: new SphereGeometry(0.27, 6, 4),
    halo: new TorusGeometry(0.07, 0.008, 6, 28),
    // The Org chart's silhouette: the capsule shots take, seen through anything.
    xray: new CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius, 4, 12),
}
const metal = new MeshStandardMaterial({ color: 0x3b4048, roughness: 0.35, metalness: 0.75 })
const dark = new MeshStandardMaterial({ color: 0x1d2026, roughness: 0.55, metalness: 0.2 })
const white = new MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.45 })
const visorMaterial = new MeshStandardMaterial({
    color: 0x0d1a26,
    roughness: 0.05,
    metalness: 0.9,
    envMapIntensity: 1.6,
})
const olive = new MeshStandardMaterial({ color: 0x4d5a36, roughness: 0.6, metalness: 0.25 })
const red = new MeshStandardMaterial({ color: 0xc8372d, roughness: 0.45 })
const flameMaterial = new MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.8, depthWrite: false })
const coreMaterial = new MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, depthWrite: false })
const shieldMaterial = new MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.16, depthWrite: false })
/** The firewall: a faceted cyan cage, wireframe over a faint fill. */
const firewallMaterial = new MeshBasicMaterial({
    color: 0x33e0ff,
    transparent: true,
    opacity: 0.55,
    wireframe: true,
    depthWrite: false,
})
/** The tip of each gun's muzzle in its model (where others' tracers start): the muzzle parts' fronts below. */
const MUZZLES: Record<Gun, Vector3> = {
    rifle: new Vector3(0, 0.006, -0.196),
    sniper: new Vector3(0, 0.004, -0.276),
    shotgun: new Vector3(0, 0.008, -0.171),
    pistol: new Vector3(0, 0.004, -0.046),
    launcher: new Vector3(0, 0, -0.16),
}
/** Halo colours in order of how much they matter to whoever faces them (sizes and the firewall show for themselves). */
const HALO_ORDER: readonly BuffKind[] = ['bonus', 'headshot', 'overtime', 'espresso', 'orgchart', 'jetpack', 'magazine']

interface Avatar {
    root: Group
    /** Leans with their speed. */
    body: Group
    hips: [Group, Group]
    shoulders: [Group, Group]
    /** The gun and the arms holding it: pitched with their aim. */
    aim: Group
    /** One model per gun; the one in their hands shows. */
    guns: Record<Gun, Group>
    stapler: Group
    swingAt: number
    head: Group
    flames: Group[]
    shield: Mesh
    firewall: Mesh
    halo: Mesh
    xray: Mesh
    suit: MeshStandardMaterial
    trim: MeshStandardMaterial
    name: string
    color: string
    /** For the walk: where they were last frame, how fast they go, how far through a stride. */
    last: { x: number; z: number; at: number } | null
    speed: number
    stride: number
    flashUntil: number
}

export class Avatars {
    private readonly avatars = new Map<string, Avatar>()

    constructor(private readonly scene: Scene) {}

    /**
     * Draws everyone in `poses` but `hidden` (you, in first person); forgets who's gone. `now` in ms.
     * `xray` (your Org chart): everyone also shows through walls.
     */
    update(
        poses: Map<string, Pose>,
        roster: Map<string, PlayerInfo>,
        hidden: string | null,
        now: number,
        xray = false
    ): void {
        for (const [id, avatar] of this.avatars) {
            if (!poses.has(id) || id === hidden) this.remove(id, avatar)
        }
        for (const [id, pose] of poses) {
            if (id === hidden) continue
            const info = roster.get(id)
            // In team deathmatch they wear their side's colour.
            const color = pose.state.team ? TEAM_COLORS[pose.state.team] : (info?.color ?? '#cccccc')
            const avatar = this.avatarFor(id, info?.name ?? '?', color)
            avatar.root.visible = pose.state.alive
            if (!pose.state.alive) {
                avatar.last = null
                continue
            }
            this.pose(avatar, pose, now)
            avatar.xray.visible = xray
        }
    }

    /** They were hit: a white flash. */
    /** They swung their stapler. */
    swing(id: string, now: number): void {
        const avatar = this.avatars.get(id)
        if (avatar) avatar.swingAt = now
    }

    flash(id: string, now: number): void {
        const avatar = this.avatars.get(id)
        if (avatar) avatar.flashUntil = now + 90
    }

    /** Where someone is drawn (their middle), while they are. */
    centerOf(id: string): { x: number; y: number; z: number } | null {
        const avatar = this.avatars.get(id)
        if (!avatar?.root.visible) return null
        const { x, y, z } = avatar.root.position
        return { x, y: y + (PLAYER.height / 2) * avatar.root.scale.y, z }
    }

    /** The muzzle of the gun in someone's hands, in the world, while they're drawn holding one. */
    muzzleOf(id: string): Vector3 | null {
        const avatar = this.avatars.get(id)
        if (!avatar?.root.visible) return null
        for (const [gun, model] of Object.entries(avatar.guns) as Array<[Gun, Group]>) {
            if (!model.visible) continue
            model.updateWorldMatrix(true, false)
            return model.localToWorld(MUZZLES[gun].clone())
        }
        return null
    }

    private pose(avatar: Avatar, pose: Pose, now: number): void {
        const { root } = avatar
        root.position.set(pose.x, pose.y, pose.z)
        root.rotation.y = pose.yaw
        // A Promotion or an Intern: drawn at their size (the capsule the server uses grows the same).
        root.scale.setScalar(scaleOf(powersOf(pose.state.buffs)))

        // Speed over the ground, from how far they moved since the last frame (smoothed).
        const dt = avatar.last ? Math.max(1, now - avatar.last.at) / 1000 : 0
        if (avatar.last && dt > 0) {
            const moved = Math.hypot(pose.x - avatar.last.x, pose.z - avatar.last.z) / dt
            avatar.speed += (Math.min(moved, 6) - avatar.speed) * Math.min(1, dt * 10)
        }
        avatar.last = { x: pose.x, z: pose.z, at: now }
        const airborne = pose.y > 0.02 && pose.state.jet
        avatar.stride += avatar.speed * dt * 9

        // Legs: a stride on the ground, dangling back in the air.
        const swing = airborne ? 0 : Math.sin(avatar.stride) * Math.min(1, avatar.speed / 2) * 0.7
        const dangle = airborne ? 0.35 : 0
        avatar.hips[0].rotation.x = swing + dangle
        avatar.hips[1].rotation.x = -swing + dangle * 0.7
        // The body bobs with each step and leans into the run.
        const bob = Math.abs(Math.cos(avatar.stride)) * Math.min(1, avatar.speed / 2) * 0.008
        avatar.body.position.y = airborne ? 0 : bob
        avatar.body.rotation.x = -Math.min(0.18, avatar.speed * 0.04)

        // Arms and blaster follow the aim; the head follows it half way.
        avatar.aim.rotation.x = pose.pitch
        for (const [gun, model] of Object.entries(avatar.guns)) model.visible = gun === pose.state.weapon
        avatar.stapler.visible = pose.state.weapon === 'stapler'
        // A swing: a quick chop down and back.
        const swung = (now - avatar.swingAt) / 300
        avatar.stapler.rotation.x = swung < 1 ? -Math.sin(swung * Math.PI) * 1.1 : 0
        avatar.head.rotation.x = pose.pitch * 0.5

        for (const [i, flame] of avatar.flames.entries()) {
            flame.visible = pose.state.jet
            const flicker = 0.75 + Math.sin(now * 0.05 + i * 2.1) * 0.25 + Math.random() * 0.1
            if (pose.state.jet) flame.scale.set(1, flicker, 1)
        }
        avatar.shield.visible = pose.state.shielded
        // Powers show: a spinning halo over the head, in the colour of the most dangerous one.
        const buff = HALO_ORDER.find(b => pose.state.buffs.includes(b))
        avatar.firewall.visible = pose.state.buffs.includes('firewall')
        if (avatar.firewall.visible) avatar.firewall.rotation.y = -now * 0.0015
        avatar.halo.visible = buff !== undefined
        if (buff) {
            ;(avatar.halo.material as MeshBasicMaterial).color.set(BUFF_COLORS[buff])
            avatar.halo.rotation.z = now * 0.004
            avatar.halo.position.y = PLAYER.height + 0.05 + Math.sin(now * 0.005) * 0.01
        }
        if (pose.state.shielded) avatar.shield.rotation.y = now * 0.002

        const hit = now < avatar.flashUntil
        avatar.suit.emissive.set(hit ? 0xffffff : 0x000000)
        avatar.suit.emissiveIntensity = hit ? 0.9 : 0
    }

    private avatarFor(id: string, name: string, color: string): Avatar {
        const existing = this.avatars.get(id)
        if (existing && existing.name === name && existing.color === color) return existing
        if (existing) this.remove(id, existing)

        const suit = new MeshStandardMaterial({ color: new Color(color), roughness: 0.5, metalness: 0.05 })
        const trim = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.55), roughness: 0.6 })
        const glow = new MeshBasicMaterial({ color: new Color(color).lerp(new Color(0xffffff), 0.35) })
        type Look = MeshStandardMaterial | MeshBasicMaterial
        const part = (geometry: (typeof shape)[keyof typeof shape], material: Look, x = 0, y = 0, z = 0) => {
            const mesh = new Mesh(geometry, material)
            mesh.position.set(x, y, z)
            mesh.castShadow = true
            return mesh
        }

        const root = new Group()
        const body = new Group()
        root.add(body)

        // Legs, pivoting at the hips.
        const hips: [Group, Group] = [new Group(), new Group()]
        for (const [i, side] of [-1, 1].entries()) {
            const hip = hips[i]!
            hip.position.set(side * 0.04, HIP, 0)
            hip.add(part(shape.leg, trim), part(shape.boot, dark))
            body.add(hip)
        }

        // Torso: suit, belt with a buckle, a chest plate.
        body.add(part(shape.torso, suit, 0, 0.19, 0))
        body.add(part(shape.belt, dark, 0, 0.135, 0))
        body.add(part(shape.buckle, metal, 0, 0.135, -0.054))
        body.add(part(shape.chest, white, 0, 0.215, -0.051))

        // Head: helmet, visor facing forward (-Z), ear caps, an antenna with a light in their colour.
        const head = new Group()
        head.position.set(0, HEAD, 0)
        head.add(part(shape.head, white))
        head.add(part(shape.visor, visorMaterial))
        for (const side of [-1, 1]) head.add(part(shape.earCap, suit, side * 0.07, 0, 0))
        const antenna = part(shape.antenna, metal, 0.035, 0.055, 0.02)
        antenna.rotation.z = -0.25
        head.add(antenna, part(shape.antennaTip, glow, 0.05, 0.11, 0.02))
        body.add(head)

        // Arms and blaster, pivoting at the shoulders with the aim.
        const aim = new Group()
        aim.position.set(0, SHOULDER, 0)
        const shoulders: [Group, Group] = [new Group(), new Group()]
        for (const [i, side] of [-1, 1].entries()) {
            const shoulder = shoulders[i]!
            shoulder.position.set(side * 0.09, 0, 0)
            // Both arms reach forward (-Z) and in, to the gun.
            shoulder.rotation.set(1.25, side * 0.35, 0)
            shoulder.add(part(shape.arm, suit), part(shape.glove, dark, 0, -0.1, 0))
            aim.add(shoulder)
        }
        // The guns, held where the hands meet; only the one in hand shows.
        const held = () => {
            const group = new Group()
            group.position.set(0.03, -0.035, -0.11)
            group.visible = false
            return group
        }
        const tilted = (mesh: Mesh, x: number) => {
            mesh.rotation.x = x
            return mesh
        }
        // The assault rifle: body, stock, a curved magazine, a long barrel, iron sights.
        const rifle = held()
        rifle.add(
            part(shape.gun, metal),
            part(shape.stock, dark, 0, -0.006, 0.085),
            tilted(part(shape.rifleMag, suit, 0, -0.038, -0.025), 0.3),
            part(shape.longBarrel, dark, 0, 0.006, -0.12),
            part(shape.muzzle, glow, 0, 0.006, -0.19),
            part(shape.rearSight, dark, 0, 0.024, 0.045),
            part(shape.frontSight, dark, 0, 0.026, -0.05)
        )
        // The sniper: body, stock, a big scope on top, a long barrel, a small magazine.
        const sniper = held()
        sniper.add(
            part(shape.gun, metal),
            part(shape.stock, suit, 0, -0.006, 0.085),
            part(shape.rifleMag, dark, 0, -0.03, -0.015),
            part(shape.longBarrel, dark, 0, 0.004, -0.13),
            part(shape.longBarrel, dark, 0, 0.004, -0.2),
            part(shape.muzzle, glow, 0, 0.004, -0.27),
            part(shape.scope, dark, 0, 0.036, 0),
            part(shape.scopeBell, dark, 0, 0.036, -0.05),
            part(shape.lens, glow, 0, 0.036, 0.041)
        )
        // The shotgun: body, a fat barrel, the pump in their colour under it.
        const shotgun = held()
        shotgun.add(
            part(shape.gun, metal),
            part(shape.stock, dark, 0, -0.006, 0.085),
            part(shape.shotgunBarrel, metal, 0, 0.008, -0.11),
            part(shape.pump, suit, 0, -0.016, -0.1),
            part(shape.muzzle, glow, 0, 0.008, -0.165)
        )
        // The pistol: small, in one hand's reach.
        const pistol = held()
        pistol.add(
            part(shape.pistol, metal),
            tilted(part(shape.pistolGrip, suit, 0, -0.03, 0.02), -0.3),
            part(shape.muzzle, glow, 0, 0.004, -0.04)
        )
        // The launcher: a fat tube on the shoulder, a band in their colour, the rocket's red nose out the front.
        const launcher = held()
        launcher.position.set(0.05, 0.005, -0.06)
        launcher.add(
            part(shape.launcherTube, olive),
            part(shape.launcherBand, suit, 0, 0, 0.02),
            part(shape.launcherBand, dark, 0, 0, 0.11),
            part(shape.warhead, red, 0, 0, -0.14),
            part(shape.ringSight, dark, 0, 0.044, -0.09),
            part(shape.frontSight, dark, 0, 0.034, -0.09),
            part(shape.pistolGrip, dark, 0, -0.045, 0.02)
        )
        const guns: Record<Gun, Group> = { rifle, sniper, shotgun, pistol, launcher }
        // The stapler, held the same way, pivoting at its back for the chop.
        const stapler = new Group()
        stapler.position.set(0.03, -0.03, -0.06)
        stapler.add(part(shape.staplerBase, dark, 0, -0.008, -0.05), part(shape.staplerArm, suit, 0, 0.008, -0.048))
        stapler.visible = false
        aim.add(...Object.values(guns), stapler)
        body.add(aim)

        // Jetpack on the back (+Z): two tanks, nozzles with rings, a flame under each.
        const pack = new Group()
        pack.position.set(0, 0.2, 0.08)
        pack.add(part(shape.pack, metal))
        const flames: Group[] = []
        for (const side of [-1, 1]) {
            pack.add(part(shape.tank, suit, side * 0.035, 0.005, 0.035))
            pack.add(part(shape.nozzle, dark, side * 0.035, -0.07, 0.035))
            pack.add(part(shape.ring, glow, side * 0.035, -0.06, 0.035))
            const flame = new Group()
            flame.position.set(side * 0.035, -0.085, 0.035)
            flame.add(new Mesh(shape.flame, flameMaterial), new Mesh(shape.core, coreMaterial))
            flame.visible = false
            pack.add(flame)
            flames.push(flame)
        }
        body.add(pack)

        const halo = new Mesh(
            shape.halo,
            new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
        )
        halo.rotation.x = Math.PI / 2
        halo.visible = false
        root.add(halo)

        const shield = new Mesh(shape.shield, shieldMaterial)
        shield.position.y = PLAYER.height / 2
        root.add(shield)
        const firewall = new Mesh(shape.firewall, firewallMaterial)
        firewall.position.y = PLAYER.height / 2
        firewall.visible = false
        root.add(firewall)
        // While you hold the Org chart they show through walls: drawn last, and only where something
        // already drawn is in front of them (out in the open you see the mini itself, not this).
        const xray = new Mesh(
            shape.xray,
            new MeshBasicMaterial({
                color: new Color(color),
                transparent: true,
                opacity: 0.55,
                depthFunc: GreaterDepth,
                depthWrite: false,
            })
        )
        xray.position.y = PLAYER.height / 2
        xray.renderOrder = 10
        xray.visible = false
        root.add(xray)

        this.scene.add(root)
        const avatar: Avatar = {
            root,
            body,
            hips,
            shoulders,
            aim,
            head,
            flames,
            shield,
            firewall,
            halo,
            xray,
            suit,
            trim,
            name,
            color,
            last: null,
            speed: 0,
            stride: 0,
            flashUntil: 0,
            guns,
            stapler,
            swingAt: -1e9,
        }
        this.avatars.set(id, avatar)

        return avatar
    }

    private remove(id: string, avatar: Avatar): void {
        this.scene.remove(avatar.root)
        avatar.suit.dispose()
        avatar.trim.dispose()
        ;(avatar.xray.material as MeshBasicMaterial).dispose()
        this.avatars.delete(id)
    }
}
