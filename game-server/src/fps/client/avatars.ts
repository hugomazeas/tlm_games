import {
    BoxGeometry,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    GreaterDepth,
    Group,
    type Material,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Object3D,
    Quaternion,
    type Scene,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { type BuffKind, type Gun, type PlayerInfo, TEAM_COLORS, type Weapon } from '../protocol.ts'
import { powersOf, reloadMsOf, SWITCH_MS } from '../sim/combat.ts'
import { PLAYER, scaleOf } from '../sim/movement.ts'
import { rocketLook } from './effects.ts'
import { buildCase, buildFlash, buildGuns, type Ejection, ease, type GunModel, type Kit, kitFor } from './guns.ts'
import { BUFF_COLORS } from './hud.ts'
import type { Pose } from './timeline.ts'

/**
 * The other minis: little jetpack troopers in their player's colour, drawn inside the 40 cm
 * capsule the server collides and hits (feet at 0, eyes at PLAYER.eye). Legs swing with their
 * speed and dangle in flight; they carry the same guns you hold (`guns.ts`, scaled to them), the
 * arms reaching where each gun's own animation puts the hands, so a reload is played as in your
 * hands: magazines out and in, pumps, bolts. The gun sits at the chest, comes up to the eye when
 * they aim, dips on a switch and drops to low ready in a dodge; it kicks, flashes and throws its
 * cases when they fire. A hit rocks them away from the shot (the head snaps back on a headshot)
 * and flashes them white; killed, they fall the way the shot pushed them and drop their gun.
 * The jetpack's two flames flicker while it burns; a spawn shield wraps them in a bubble.
 */

// Heights (m) inside the 0.4 m capsule.
const HIP = 0.13
const SHOULDER = 0.245
const HEAD = 0.32

/** Their guns, at this fraction of the size of the ones in your hands. */
const GUN_SCALE = 0.8
/** Where the sight's point sits from the shoulders' middle (x right, y up, -z ahead): at the chest, and aimed (at the cheek, under the eye). */
const HIP_HOLD = new Vector3(0.03, 0.005, -0.05)
const AIM_HOLD = new Vector3(0.03, 0.07, -0.078)
/** The arm, shoulder to glove, at rest; it stretches up to `MAX_REACH` to get a hand where the gun wants it. */
const ARM = 0.11
const MAX_REACH = 0.23
/** Faster over the ground than this (m/s): a dodge, the gun down at low ready. */
const DODGE_SPEED = 3.6
/** A hit's rock: in for `in` ms, back over `out`. */
const HIT = { in: 50, out: 160, tilt: 0.22, blast: 0.4, headshot: 0.75 } as const
/** Killed: they fall over `fallMs`, lie there, sink away from `sinkAt` and are gone at `goneAt`. */
const DEATH = { fallMs: 420, sinkAt: 1900, goneAt: 2600 } as const
/** Spent cases flying from a trooper's gun at once (per kind), and for how long (ms). */
const CASES = 2
const CASE_MS = 520
/** Their muzzle flash, bigger than the one in your hands (it has to read across a room), the biggest capped. */
const FLASH_SCALE = 1.6
const FLASH_MAX = 1.4

const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)

const shape = {
    leg: new CapsuleGeometry(0.026, 0.07, 4, 10).translate(0, -0.06, 0),
    boot: new RoundedBoxGeometry(0.06, 0.035, 0.085, 2, 0.012).translate(0, -0.12, -0.012),
    torso: new RoundedBoxGeometry(0.15, 0.13, 0.1, 3, 0.035),
    belt: new BoxGeometry(0.155, 0.022, 0.105),
    buckle: new BoxGeometry(0.03, 0.02, 0.01),
    chest: new RoundedBoxGeometry(0.08, 0.045, 0.012, 2, 0.006),
    // Shoulder (0) to glove (-ARM): stretched along its length to reach.
    arm: new CapsuleGeometry(0.019, ARM - 0.038, 4, 8).translate(0, -ARM / 2, 0),
    glove: new SphereGeometry(0.022, 10, 8),
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
    staplerBase: new BoxGeometry(0.03, 0.012, 0.11),
    staplerArm: new BoxGeometry(0.026, 0.018, 0.1),
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
/** Halo colours in order of how much they matter to whoever faces them (sizes and the firewall show for themselves). */
const HALO_ORDER: readonly BuffKind[] = ['bonus', 'headshot', 'overtime', 'espresso', 'orgchart', 'jetpack', 'magazine']

// --- Timing (pure: tested in client.test.ts) ---------------------------------------------------

/**
 * When their reload started, on this browser's clock (ms): snapshots say how far through it they
 * are (`reported`, 0–1) thirty times a second, and the trooper plays it smoothly from here. Kept
 * while the reports agree with it (within `slackMs`), restarted when they don't.
 */
export function reloadStart(
    kept: number | null,
    reported: number | null,
    reloadMs: number,
    now: number,
    slackMs = 120
): number | null {
    if (reported === null) return null
    const seen = now - reported * reloadMs
    return kept !== null && Math.abs(kept - seen) <= slackMs ? kept : seen
}

/** A hit's rock, 0 → 1 → 0, `since` ms after it. */
export function hitRock(since: number): number {
    if (since < 0 || since >= HIT.in + HIT.out) return 0
    return since < HIT.in ? ease(since / HIT.in) : 1 - ease((since - HIT.in) / HIT.out)
}

/** How far over they are (rad, π/2 flat) `since` ms after going down: faster as they go, a little bounce at the floor. */
export function fallAngle(since: number): number {
    const flat = Math.PI / 2
    if (since <= 0) return 0
    if (since < DEATH.fallMs) return flat * (since / DEATH.fallMs) ** 2
    const after = (since - DEATH.fallMs) / 1000
    return flat - 0.18 * Math.abs(Math.sin(after * 16)) * Math.exp(-after * 9)
}

// --- The troopers ------------------------------------------------------------------------------

interface Hold {
    /** Turns about the gun's middle (kick, reload tilt, a switch's dip, low ready). */
    group: Group
    /** The gun's own frame (the one your hands use), scaled down: the guns, their flash and cases. */
    inner: Group
    guns: Record<Gun, GunModel>
    flash: ReturnType<typeof buildFlash>
    cases: Record<Ejection['kind'], Group[]>
}

interface Avatar {
    id: string
    root: Group
    /** Leans with their speed, rocks when hit, falls when killed. */
    body: Group
    hips: [Group, Group]
    /** Right, left: each turned toward its glove and stretched to it. */
    shoulders: [Group, Group]
    gloves: [Mesh, Mesh]
    /** The gun and the arms holding it: pitched with their aim. */
    aim: Group
    hold: Hold
    kit: Kit
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
    glow: MeshBasicMaterial
    name: string
    color: string
    /** For the walk: where they were last frame, how fast they go, how far through a stride. */
    last: { x: number; z: number; at: number } | null
    speed: number
    stride: number
    flashUntil: number
    /** The weapon last drawn in their hands, and when it came out. */
    held: Weapon
    switchAt: number
    /** 0 at the chest … 1 at the eye; 0 … 1 into low ready. Eased toward what they do. */
    aimed: number
    lowered: number
    /** When their current reload started (this browser's clock), null when not reloading. */
    reloadFrom: number | null
    /** Their recent shots: the kick, the flash, the cases. */
    shots: Array<{ at: number; gun: Gun }>
    /** The last hit: when, which way it pushed (world, flat, unit), a headshot, a blast. */
    hit: { at: number; push: Vector3; headshot: boolean; blast: boolean } | null
    /** Up or down as last drawn (null: not drawn yet). */
    alive: boolean | null
    /** Down: since when, falling which way (an axis in their own frame), and their gun on its way to the floor. */
    death: { at: number; axis: Vector3; gunVelocity: Vector3; spin: number; lastAt: number } | null
}

export class Avatars {
    private readonly avatars = new Map<string, Avatar>()

    /** `onReload`: someone started a reload (`msLeft` of it to go), to be heard where they are. */
    constructor(
        private readonly scene: Scene,
        private readonly onReload?: (id: string, gun: Gun, msLeft: number) => void
    ) {}

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
            const alive = pose.state.alive
            if (alive && avatar.alive !== true) this.revive(avatar)
            // Seen dead the first time (already down when they came into view): no fall to show.
            if (!alive && avatar.alive === true) this.die(avatar, now)
            avatar.alive = alive
            avatar.xray.visible = alive && xray
            if (alive) this.pose(avatar, pose, now)
            else this.lie(avatar, pose, now)
        }
    }

    /** They swung their stapler. */
    swing(id: string, now: number): void {
        const avatar = this.avatars.get(id)
        if (avatar) avatar.swingAt = now
    }

    /** They fired (a round or a rocket): the gun kicks, flashes and throws a case. */
    fire(id: string, gun: Gun, now: number): void {
        const avatar = this.avatars.get(id)
        if (!avatar) return
        avatar.shots.push({ at: now, gun })
        if (avatar.shots.length > CASES) avatar.shots.shift()
        avatar.hold.flash.petals.rotation.z = Math.random() * Math.PI
    }

    /**
     * They were hit, from `from` (where the shot or blast came from; null: unknown): a white
     * flash, a rock away from it (the head snaps back on a headshot), and if it killed them,
     * the way they fall.
     */
    hit(
        id: string,
        now: number,
        from: readonly [number, number, number] | null,
        headshot = false,
        blast = false
    ): void {
        const avatar = this.avatars.get(id)
        if (!avatar) return
        avatar.flashUntil = now + 90
        const { x, z } = avatar.root.position
        const push = from ? new Vector3(x - from[0], 0, z - from[2]) : new Vector3()
        // Straight down on them (or no idea): pushed back, the way they face.
        if (push.lengthSq() < 1e-6) push.set(Math.sin(avatar.root.rotation.y), 0, Math.cos(avatar.root.rotation.y))
        avatar.hit = { at: now, push: push.normalize(), headshot, blast }
    }

    /** Where someone is drawn (their middle), while they are. */
    centerOf(id: string): { x: number; y: number; z: number } | null {
        const avatar = this.avatars.get(id)
        if (!avatar?.root.visible) return null
        const { x, y, z } = avatar.root.position
        return { x, y: y + (PLAYER.height / 2) * avatar.root.scale.y, z }
    }

    /** The muzzle of the gun in someone's hands, in the world, while they're up and holding one. */
    muzzleOf(id: string): Vector3 | null {
        const avatar = this.avatars.get(id)
        if (!avatar?.root.visible || !avatar.alive || avatar.held === 'stapler') return null
        const { inner, guns } = avatar.hold
        inner.updateWorldMatrix(true, false)
        return inner.localToWorld(guns[avatar.held].muzzle.clone())
    }

    private pose(avatar: Avatar, pose: Pose, now: number): void {
        const { root } = avatar
        const { state } = pose
        root.visible = true
        root.position.set(pose.x, pose.y, pose.z)
        root.rotation.y = pose.yaw
        // A Promotion or an Intern: drawn at their size (the capsule the server uses grows the same).
        root.scale.setScalar(scaleOf(powersOf(state.buffs)))

        // Speed over the ground, from how far they moved since the last frame (smoothed); a jump of
        // a metre or more (a portal) isn't running.
        if (avatar.last && Math.hypot(pose.x - avatar.last.x, pose.z - avatar.last.z) > 1) avatar.last = null
        const dt = avatar.last ? Math.max(1, now - avatar.last.at) / 1000 : 0
        if (avatar.last && dt > 0) {
            const moved = Math.hypot(pose.x - avatar.last.x, pose.z - avatar.last.z) / dt
            avatar.speed += (Math.min(moved, 6) - avatar.speed) * Math.min(1, dt * 10)
        }
        avatar.last = { x: pose.x, z: pose.z, at: now }
        const airborne = pose.y > 0.02 && state.jet
        avatar.stride += avatar.speed * dt * 9

        // Legs: a stride on the ground, dangling back in the air.
        const swing = airborne ? 0 : Math.sin(avatar.stride) * Math.min(1, avatar.speed / 2) * 0.7
        const dangle = airborne ? 0.35 : 0
        avatar.hips[0].rotation.x = swing + dangle
        avatar.hips[1].rotation.x = -swing + dangle * 0.7

        // A hit rocks them away from it: the top of the body goes the way the shot pushed.
        const rock = avatar.hit ? hitRock(now - avatar.hit.at) : 0
        const push = avatar.hit && rock > 0 ? this.local(avatar, avatar.hit.push) : null
        const tilt = push ? rock * (avatar.hit!.blast ? HIT.blast : HIT.tilt) : 0
        // The body bobs with each step and leans into the run.
        const bob = Math.abs(Math.cos(avatar.stride)) * Math.min(1, avatar.speed / 2) * 0.008
        avatar.body.position.y = airborne ? 0 : bob
        avatar.body.rotation.set(
            -Math.min(0.18, avatar.speed * 0.04) + (push ? push.z * tilt : 0),
            0,
            push ? -push.x * tilt : 0
        )
        const snap = avatar.hit?.headshot ? rock * HIT.headshot : 0
        avatar.head.rotation.set(pose.pitch * 0.5 + snap, 0, 0)

        // The gun: up to the eye while aiming, down at low ready in a dodge; a new one comes up from below.
        const ease10 = Math.min(1, dt * 10)
        avatar.aimed += ((state.aiming ? 1 : 0) - avatar.aimed) * ease10
        avatar.lowered += ((avatar.speed > DODGE_SPEED && !state.aiming ? 1 : 0) - avatar.lowered) * ease10
        if (state.weapon !== avatar.held) {
            avatar.held = state.weapon
            avatar.switchAt = now
        }
        avatar.aim.rotation.x = pose.pitch
        if (state.weapon === 'stapler') this.holdStapler(avatar, now)
        else this.holdGun(avatar, state.weapon, state.reload, now)

        for (const [i, flame] of avatar.flames.entries()) {
            flame.visible = state.jet
            const flicker = 0.75 + Math.sin(now * 0.05 + i * 2.1) * 0.25 + Math.random() * 0.1
            if (state.jet) flame.scale.set(1, flicker, 1)
        }
        avatar.shield.visible = state.shielded
        // Powers show: a spinning halo over the head, in the colour of the most dangerous one.
        const buff = HALO_ORDER.find(b => state.buffs.includes(b))
        avatar.firewall.visible = state.buffs.includes('firewall')
        if (avatar.firewall.visible) avatar.firewall.rotation.y = -now * 0.0015
        avatar.halo.visible = buff !== undefined
        if (buff) {
            ;(avatar.halo.material as MeshBasicMaterial).color.set(BUFF_COLORS[buff])
            avatar.halo.rotation.z = now * 0.004
            avatar.halo.position.y = PLAYER.height + 0.05 + Math.sin(now * 0.005) * 0.01
        }
        if (state.shielded) avatar.shield.rotation.y = now * 0.002

        const hit = now < avatar.flashUntil
        avatar.suit.emissive.set(hit ? 0xffffff : 0x000000)
        avatar.suit.emissiveIntensity = hit ? 0.9 : 0
    }

    /** A gun in their hands: posed and animated as in yours, the arms reaching to where it puts the hands. */
    private holdGun(avatar: Avatar, gunName: Gun, reported: number | null, now: number): void {
        const { group, inner, guns, flash } = avatar.hold
        const gun = guns[gunName]
        const reloadMs = reloadMsOf(gunName)
        const started = reloadStart(avatar.reloadFrom, reported, reloadMs, now)
        // Heard from its start (not when someone comes into view half way through one).
        if (avatar.reloadFrom === null && started !== null && reported !== null && reported < 0.25) {
            this.onReload?.(avatar.id, gunName, reloadMs - (now - started))
        }
        avatar.reloadFrom = started
        const reload = avatar.reloadFrom === null ? null : Math.min(1, (now - avatar.reloadFrom) / reloadMs)
        const last = avatar.shots.at(-1)
        const sinceShot = last && last.gun === gunName ? now - last.at : 1e9
        const hands = gun.animate({ reload, reloadMs, sinceShot, loaded: reload === null })

        group.visible = true
        avatar.stapler.visible = false
        for (const [name, model] of Object.entries(guns)) model.group.visible = name === gunName

        // Turned about the gun's middle: `inner` puts that middle at `group`'s origin.
        const middle = new Vector3(gun.sight.x, gun.sight.y - 0.03, -0.15)
        inner.position.copy(middle).multiplyScalar(-GUN_SCALE)
        const at = HIP_HOLD.clone()
            .lerp(AIM_HOLD, avatar.aimed)
            .sub(gun.sight.clone().sub(middle).multiplyScalar(GUN_SCALE))

        const k = Math.max(0, 1 - sinceShot / gun.kick.ms)
        const kick = k * k
        const tip = reload === null ? 0 : ease(Math.min(1, reload / 0.12)) * ease(Math.min(1, (1 - reload) / 0.12))
        const dip = 1 - ease(Math.min(1, (now - avatar.switchAt) / SWITCH_MS))
        const down = Math.max(dip, avatar.lowered * 0.8)
        const turn = gun.reloadPose
        group.position.set(
            at.x - tip * 0.012,
            at.y + tip * 0.02 - down * 0.03,
            at.z + kick * gun.kick.back * GUN_SCALE * 1.5 - tip * turn.push * GUN_SCALE
        )
        group.rotation.set(
            kick * gun.kick.rise * 1.2 + tip * turn.pitch * 0.6 - down * 0.9,
            tip * turn.yaw * 0.6,
            tip * turn.roll * 0.6
        )

        const flashMs = 40 + gun.kick.flash * 12
        flash.group.visible = sinceShot < flashMs
        if (flash.group.visible) {
            flash.group.position.copy(gun.muzzle)
            const size = Math.min(FLASH_MAX, gun.kick.flash) * FLASH_SCALE
            flash.group.scale.setScalar(size * (0.6 + 0.4 * (1 - sinceShot / flashMs)))
        }
        this.throwCases(avatar, gunName, now)

        // The hands where the gun wants them, in the aim's frame; a hand it doesn't want hangs.
        group.updateMatrix()
        inner.updateMatrix()
        const toAim = new Matrix4().multiplyMatrices(group.matrix, inner.matrix)
        this.reach(avatar, 0, hands.right ? hands.right.at.clone().applyMatrix4(toAim) : null)
        this.reach(avatar, 1, hands.left ? hands.left.at.clone().applyMatrix4(toAim) : null)
    }

    /** The stapler in the right hand, chopping when they swing; the left hangs. */
    private holdStapler(avatar: Avatar, now: number): void {
        avatar.hold.group.visible = false
        avatar.reloadFrom = null
        const { stapler } = avatar
        stapler.visible = true
        const swung = (now - avatar.swingAt) / 300
        stapler.rotation.x = swung < 1 ? -Math.sin(swung * Math.PI) * 1.1 : 0
        // Comes up from below after a switch.
        stapler.position.y = -0.03 - (1 - ease(Math.min(1, (now - avatar.switchAt) / SWITCH_MS))) * 0.04
        stapler.updateMatrix()
        this.reach(avatar, 0, new Vector3(0, 0, -0.005).applyMatrix4(stapler.matrix))
        this.reach(avatar, 1, null)
    }

    /** One arm (0 right, 1 left) from its shoulder to `target` (the aim's frame), as far as it reaches; null: hanging. */
    private reach(avatar: Avatar, side: 0 | 1, target: Vector3 | null): void {
        const shoulder = avatar.shoulders[side]
        const glove = avatar.gloves[side]
        // Hanging: straight down in the world, whatever the aim's pitch, a little out and forward.
        const hanging = new Vector3(side === 0 ? 0.02 : -0.02, -ARM, -0.012)
        const to = target
            ? target.clone().sub(shoulder.position)
            : hanging.applyAxisAngle(new Vector3(1, 0, 0), -avatar.aim.rotation.x)
        const length = Math.min(MAX_REACH, Math.max(0.05, to.length()))
        to.setLength(length)
        shoulder.quaternion.setFromUnitVectors(DOWN, to.clone().normalize())
        shoulder.scale.set(1, length / ARM, 1)
        glove.position.copy(shoulder.position).add(to)
    }

    /** Spent cases out of the port, in the gun's frame, spinning, falling away. */
    private throwCases(avatar: Avatar, held: Gun, now: number): void {
        const { cases, guns } = avatar.hold
        const used: Record<Ejection['kind'], number> = { case: 0, long: 0, shell: 0 }
        for (const all of Object.values(cases)) for (const c of all) c.visible = false
        for (const shot of avatar.shots) {
            const eject = guns[shot.gun].eject
            if (!eject || shot.gun !== held) continue
            const s = (now - shot.at - eject.delayMs) / 1000
            if (s < 0 || s * 1000 > CASE_MS) continue
            const piece = cases[eject.kind][used[eject.kind]++]
            if (!piece) continue
            const [vx, vy, vz] = eject.toward
            piece.visible = true
            piece.position.set(eject.at[0] + vx * s, eject.at[1] + vy * s - 2.2 * s * s, eject.at[2] + vz * s)
            piece.rotation.set(s * 14, s * 9, s * 22)
        }
    }

    /** Killed: they'll fall the way the last hit pushed them (backward if none just did), and let go of their gun. */
    private die(avatar: Avatar, now: number): void {
        const recent = avatar.hit && now - avatar.hit.at < 800 ? avatar.hit : null
        const push = recent ? this.local(avatar, recent.push) : new Vector3(0, 0, 1)
        // Turning about up × push tips the top of the body toward `push`.
        const axis = new Vector3().crossVectors(UP, push).normalize()
        // The gun leaves their hands where it is, thrown a little the same way.
        avatar.root.updateWorldMatrix(true, true)
        const { group } = avatar.hold
        const gunVelocity = new Vector3(0, 0.5, 0)
        if (group.visible) {
            avatar.root.attach(group)
            gunVelocity.add(push.clone().multiplyScalar(0.5))
        }
        avatar.death = { at: now, axis, gunVelocity, spin: (Math.random() - 0.5) * 8, lastAt: now }
        avatar.flames.forEach(f => (f.visible = false))
        avatar.shield.visible = avatar.firewall.visible = avatar.halo.visible = false
        avatar.stapler.visible = false
    }

    /** Down: the fall, lying there, sinking away; gone until they're back. */
    private lie(avatar: Avatar, pose: Pose, now: number): void {
        const death = avatar.death
        avatar.last = null
        const since = death ? now - death.at : Infinity
        avatar.root.visible = since < DEATH.goneAt
        if (!death || !avatar.root.visible) return
        avatar.root.position.set(pose.x, pose.y, pose.z)

        const angle = fallAngle(since)
        const over = angle / (Math.PI / 2)
        avatar.body.quaternion.setFromAxisAngle(death.axis, angle)
        // Lying, the back (not the middle of the body) rests on the floor; then they sink through it.
        const sink = Math.max(0, (since - DEATH.sinkAt) / (DEATH.goneAt - DEATH.sinkAt))
        avatar.body.position.set(0, 0.05 * Math.sin(angle) - sink * 0.12, 0)
        avatar.hips[0].rotation.x = 0.5 * over
        avatar.hips[1].rotation.x = 0.2 * over
        avatar.head.rotation.set(0.35 * over, 0, 0)
        avatar.aim.rotation.x = -0.4 * over
        // The arms go limp, out to the sides.
        this.reach(avatar, 0, new Vector3(0.09 + 0.05 * over, -0.07, 0.02 * over))
        this.reach(avatar, 1, new Vector3(-0.09 - 0.05 * over, -0.07, 0.02 * over))
        avatar.suit.emissiveIntensity = 0

        // The gun falls to the floor, tumbling, and lies on its side.
        const { group } = avatar.hold
        if (group.parent === avatar.root) {
            const dt = Math.min(0.05, (now - death.lastAt) / 1000)
            const floor = 0.012 - sink * 0.12
            if (group.position.y > floor) {
                death.gunVelocity.y -= 9.8 * dt
                group.position.addScaledVector(death.gunVelocity, dt)
                group.rotation.z += death.spin * dt
                if (group.position.y <= floor) group.position.y = floor
            } else {
                group.position.y = floor
                const flat = new Quaternion().setFromAxisAngle(UP, group.rotation.y)
                flat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2))
                group.quaternion.slerp(flat, Math.min(1, dt * 12))
            }
        }
        death.lastAt = now
    }

    /** Back up: their gun back in their hands, standing. */
    private revive(avatar: Avatar): void {
        avatar.death = null
        avatar.hit = null
        avatar.aim.add(avatar.hold.group)
        avatar.hold.group.quaternion.identity()
        avatar.body.quaternion.identity()
        avatar.body.position.set(0, 0, 0)
        avatar.reloadFrom = null
        avatar.shots = []
    }

    /** A direction in the world, in their own frame (they face -Z). */
    private local(avatar: Avatar, world: Vector3): Vector3 {
        return world.clone().applyAxisAngle(UP, -avatar.root.rotation.y)
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

        // Arms and gun, pivoting at the shoulders with the aim: right (0), left (1).
        const aim = new Group()
        aim.position.set(0, SHOULDER, 0)
        const shoulders: [Group, Group] = [new Group(), new Group()]
        const gloves: [Mesh, Mesh] = [part(shape.glove, dark), part(shape.glove, dark)]
        for (const [i, side] of [1, -1].entries()) {
            const shoulder = shoulders[i]!
            shoulder.position.set(side * 0.085, 0, 0)
            shoulder.add(part(shape.arm, suit))
            aim.add(shoulder, gloves[i]!)
        }

        // The guns you hold, scaled down to them; only the one in hand shows.
        const kit = kitFor(color)
        const guns = buildGuns(kit, rocketLook)
        const inner = new Group()
        inner.scale.setScalar(GUN_SCALE)
        const flash = buildFlash()
        flash.group.visible = false
        const cases = {
            case: Array.from({ length: CASES }, () => buildCase(kit, 'case')),
            long: Array.from({ length: CASES }, () => buildCase(kit, 'long')),
            shell: Array.from({ length: CASES }, () => buildCase(kit, 'shell')),
        }
        for (const gun of Object.values(guns)) {
            gun.group.visible = false
            // The sight's glowing dot is for your own eye. The gun casts no shadow: a few pixels
            // of it on the floor would cost a draw of each of its parts in the shadow map.
            gun.tip.visible = false
            inner.add(gun.group)
        }
        inner.add(flash.group, ...Object.values(cases).flat())
        const group = new Group()
        group.add(inner)

        // The stapler, held the same way, pivoting at its back for the chop.
        const stapler = new Group()
        stapler.position.set(0.03, -0.03, -0.06)
        stapler.add(part(shape.staplerBase, dark, 0, -0.008, -0.05), part(shape.staplerArm, suit, 0, 0.008, -0.048))
        stapler.visible = false
        aim.add(group, stapler)
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
            id,
            root,
            body,
            hips,
            shoulders,
            gloves,
            aim,
            hold: { group, inner, guns, flash, cases },
            kit,
            stapler,
            swingAt: -1e9,
            head,
            flames,
            shield,
            firewall,
            halo,
            xray,
            suit,
            trim,
            glow,
            name,
            color,
            last: null,
            speed: 0,
            stride: 0,
            flashUntil: 0,
            held: 'rifle',
            switchAt: -1e9,
            aimed: 0,
            lowered: 0,
            reloadFrom: null,
            shots: [],
            hit: null,
            alive: null,
            death: null,
        }
        this.avatars.set(id, avatar)

        return avatar
    }

    private remove(id: string, avatar: Avatar): void {
        this.scene.remove(avatar.root)
        // The guns are theirs alone (geometry and materials): the troopers' shared shapes aren't in there.
        const shared = new Set<Material>(Object.values(rocketLook))
        avatar.hold.group.traverse((o: Object3D) => {
            if (!(o instanceof Mesh)) return
            o.geometry.dispose()
            for (const material of [o.material].flat() as Material[]) {
                if (!shared.has(material)) material.dispose()
            }
        })
        for (const material of [avatar.suit, avatar.trim, avatar.glow, avatar.xray.material as Material]) {
            material.dispose()
        }
        this.avatars.delete(id)
    }
}
