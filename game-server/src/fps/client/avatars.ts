import {
    BoxGeometry,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    DataTexture,
    GreaterDepth,
    Group,
    type Material,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Object3D,
    PlaneGeometry,
    Quaternion,
    type Scene,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three'
import { type BuffKind, type Gun, type PlayerInfo, TEAM_COLORS, type Weapon } from '../protocol.ts'
import { powersOf, reloadMsOf, SWITCH_MS } from '../sim/combat.ts'
import { PLAYER, scaleOf } from '../sim/movement.ts'
import { rocketLook } from './effects.ts'
import { applyFinish } from './finish.ts'
import {
    ARM_REACH,
    BODY,
    buildFigure,
    type Figure,
    lookFor,
    orient,
    SHARED_MATERIALS,
    SHOULDERS,
    twoBone,
} from './figure.ts'
import {
    buildCase,
    buildFlash,
    buildGuns,
    buildHand,
    type Ejection,
    ease,
    type GunModel,
    type Hand,
    type Kit,
    kitFor,
} from './guns.ts'
import { BUFF_COLORS } from './hud.ts'
import type { Pose } from './timeline.ts'

/**
 * Everyone else, drawn as a little office worker (`figure.ts`: an adult's proportions, 40 cm,
 * filling the capsule the server collides and hits: feet at 0, the crown at PLAYER.height) with
 * elbows, knees and hands. The legs walk and run with their speed, the feet planted and stepping
 * the way they move (strafing and backing up too), tucked in the air, dragging along prone. They
 * carry the same guns you hold (`guns.ts`, at their true size), bladed behind them like a
 * shooter, each hand where the gun's own animation puts yours, the arms bending to reach it: a
 * reload plays as in your hands. The gun sits at the chest, comes up to the eye when they aim,
 * dips on a switch and drops to low ready in a dodge; it kicks, flashes and throws its cases when
 * they fire. A hit rocks them away from the shot (the head snaps back on a headshot) and flashes
 * their clothes white; killed, their knees go, they fall the way the shot pushed them and drop
 * their gun. The jetpack, worn as a backpack, flames while it burns; a spawn shield wraps them
 * in a bubble.
 */

/** Their guns, at this fraction of the size of the ones in your hands: a rifle about half their height. */
const GUN_SCALE = 0.6
/** Their hands, at the same (the fist you see round your own grip). */
const HAND_SCALE = GUN_SCALE
/**
 * Where the sight's point sits from the shoulders' middle (x right, y up, -z ahead): the guns are
 * modelled from the sight forward (in your hands the camera is the stock), so it's the gun's back
 * end, in the shoulder's pocket at the chest, and aimed, up at the cheek under the eye.
 */
const HIP_HOLD = new Vector3(0.02, -0.02, -0.012)
const AIM_HOLD = new Vector3(0.008, 0.05, -0.028)
/** Holding a gun the chest turns this far (rad), the support shoulder forward; the head turns back. */
const BLADE = 0.45
/** An arm stretches this much (×) rather than leave a hand off its grip. */
const MAX_STRETCH = 1.1
/** Faster over the ground than this (m/s): a dodge, the gun down at low ready. */
const DODGE_SPEED = 3.6
/** A hit's rock: in for `in` ms, back over `out`. */
const HIT = { in: 50, out: 160, tilt: 0.22, blast: 0.4, headshot: 0.75 } as const
/** Prone: the body lifted off the floor by this (its depth face down), the head raised by this to look ahead. */
const PRONE_LIFT = 0.026
const PRONE_LOOK = 1.2
/** Stepping: half a stride (m) at most, how high a foot lifts, the hips' dip. */
const STEP = { half: 0.085, lift: 0.032, dip: 0.007 } as const
/** Off the ground by more than this (m), or on the jetpack: in the air (legs tucked). */
const AIRBORNE = 0.04

/** Killed: they fall over `fallMs`, lie there, sink away from `sinkAt` and are gone at `goneAt`. */
const DEATH = { fallMs: 420, sinkAt: 1900, goneAt: 2600 } as const
/** Spent cases flying from a trooper's gun at once (per kind), and for how long (ms). */
const CASES = 2
const CASE_MS = 520
/** Their muzzle flash, bigger than the gun would have it (it has to read across a room), the biggest capped. */
const FLASH_SCALE = 2
const FLASH_MAX = 1.4

const UP = new Vector3(0, 1, 0)
const SIDE = [1, -1] as const

const shape = {
    flame: new ConeGeometry(0.011, 0.07, 10).rotateX(Math.PI).translate(0, -0.035, 0),
    core: new ConeGeometry(0.0055, 0.04, 8).rotateX(Math.PI).translate(0, -0.02, 0),
    staplerBase: new BoxGeometry(0.02, 0.008, 0.07),
    staplerArm: new BoxGeometry(0.017, 0.012, 0.064),
    shield: new SphereGeometry(0.29, 24, 16),
    firewall: new SphereGeometry(0.27, 6, 4),
    halo: new TorusGeometry(0.05, 0.007, 6, 28),
    // The Org chart's silhouette: the capsule shots take, seen through anything.
    xray: new CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius, 4, 12),
}
const dark = new MeshStandardMaterial({ color: 0x1d2026, roughness: 0.55, metalness: 0.2 })
applyFinish(dark, 'rubber')
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

/**
 * Where a foot goes (its ankle, in their own frame: they face -Z), stepping: `phase` through the
 * stride (rad), `along` the way they move (unit, flat, their frame), `amount` 0 standing … 1 at
 * full stride. The foot swings forward lifted, and is planted moving back.
 */
export function stepAnkle(
    side: 0 | 1,
    phase: number,
    along: { x: number; z: number },
    amount: number,
    out: Vector3
): Vector3 {
    const ph = phase + side * Math.PI
    const swing = Math.sin(ph) * STEP.half * amount
    const lift = Math.max(0, Math.cos(ph)) * STEP.lift * amount
    return out.set(SIDE[side] * BODY.hipX * 1.1 + along.x * swing, BODY.ankle + lift, -0.004 + along.z * swing)
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

/** Where a hand goes: a pose in some frame (`at` and, gripping, the hand's turn `q`); null hangs. */
interface Grip {
    frame: Object3D
    at: Vector3
    q: Quaternion | null
}

interface Avatar {
    id: string
    root: Group
    /** Leans with their speed, rocks when hit, falls when killed. The figure's frame. */
    body: Group
    figure: Figure
    /** Right, left: the fist round each grip. */
    hands: [Hand, Hand]
    /** The gun and the stapler: at the shoulders, pitched with their aim (not turned with the chest). */
    aim: Group
    hold: Hold
    kit: Kit
    stapler: Group
    swingAt: number
    flames: Group[]
    shield: Mesh
    firewall: Mesh
    halo: Mesh
    xray: Mesh
    name: string
    color: string
    /** For the walk: where they were last frame, how they move in their own frame (m/s), how far through a stride. */
    last: { x: number; z: number; at: number } | null
    velocity: { x: number; z: number }
    speed: number
    stride: number
    /** 0 on their feet … 1 in the air, eased. */
    air: number
    flashUntil: number
    /** The weapon last drawn in their hands, and when it came out. */
    held: Weapon
    switchAt: number
    /** 0 at the chest … 1 at the eye; 0 … 1 into low ready. Eased toward what they do. */
    aimed: number
    lowered: number
    /** 0 standing … 1 lying prone, eased. */
    down: number
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
    /** The soft dark patch on whatever is under them (in the scene, not on them: it stays down when they jump). */
    blob: Mesh<PlaneGeometry, MeshBasicMaterial>
}

export interface AvatarsOptions {
    /** The height of whatever is under (x, y, z) within reach (null: nothing): their contact shadow goes there, and their feet know they're off it. */
    groundBelow?: (x: number, y: number, z: number) => number | null
    /** Called with each new trooper (to light it like the office). */
    dress?: (root: Object3D) => void
}

/** The contact shadow: its width at their feet (m), how dark, and how high above the ground it's gone. */
const BLOB = { size: 0.3, opacity: 0.75, fadeHeight: 1.4 } as const
const blobPlane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
let blobTexture: DataTexture | null = null

/** Dark in the middle, fading to nothing at the edge (made in code: tests run without a DOM). */
function blobMap(): DataTexture {
    if (blobTexture) return blobTexture
    const n = 64
    const data = new Uint8Array(n * n * 4)
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2
            const falloff = Math.max(0, 1 - r * r)
            // An alphaMap is read from green: grey all through.
            data.fill(Math.round(falloff * falloff * 255), (y * n + x) * 4, (y * n + x) * 4 + 4)
        }
    }
    blobTexture = new DataTexture(data, n, n)
    blobTexture.needsUpdate = true
    return blobTexture
}

/**
 * A trooper nobody sees, there for good: the shaders compile with it at load (main.ts warms
 * every hidden thing up), and stay while real troopers come and go (three deletes a shader with
 * the last material using it, and a trooper's are disposed when they leave).
 */
const STAND_IN = '\u0000stand-in'

// Scratch, reused every frame.
const toBody = new Matrix4()
const frameQ = new Quaternion()
const frameS = new Vector3()
const shoulder = new Vector3()
const hipJoint = new Vector3()
const target = new Vector3()
const mid = new Vector3()
const end = new Vector3()
const wrist = new Vector3()
const pole = new Vector3()
const hang = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

export class Avatars {
    private readonly avatars = new Map<string, Avatar>()

    /** `onReload`: someone started a reload (`msLeft` of it to go), to be heard where they are. */
    constructor(
        private readonly scene: Scene,
        private readonly onReload?: (id: string, gun: Gun, msLeft: number) => void,
        private readonly options: AvatarsOptions = {}
    ) {
        this.avatarFor(STAND_IN, '', '#cccccc').root.visible = false
    }

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
            if (id !== STAND_IN && (!poses.has(id) || id === hidden)) this.remove(id, avatar)
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
            const ground = this.options.groundBelow?.(pose.x, pose.y + 0.05, pose.z) ?? pose.y
            if (alive) this.pose(avatar, pose, ground, now)
            else this.lie(avatar, pose, now)
            this.shadow(avatar, ground, now)
        }
    }

    /** Their contact shadow on what's under them: smaller and fainter the higher they are, gone as they sink away. */
    private shadow(avatar: Avatar, ground: number, now: number): void {
        const { blob, root } = avatar
        if (!root.visible) {
            blob.visible = false
            return
        }
        const { x, y, z } = root.position
        const height = Math.max(0, y - ground)
        const sinking = avatar.death
            ? Math.max(0, (now - avatar.death.at - DEATH.sinkAt) / (DEATH.goneAt - DEATH.sinkAt))
            : 0
        const fade = (1 - height / BLOB.fadeHeight) * (1 - sinking)
        blob.visible = fade > 0.02
        if (!blob.visible) return
        // Lying down they cover more floor.
        const size = BLOB.size * root.scale.x * (1 + height * 0.4) * (avatar.death ? 1.6 : 1 + avatar.down * 0.6)
        blob.position.set(x, ground + 0.004, z)
        blob.scale.set(size, 1, size)
        blob.material.opacity = BLOB.opacity * fade
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

    private pose(avatar: Avatar, pose: Pose, ground: number, now: number): void {
        const { root, figure } = avatar
        const { state } = pose
        root.visible = true
        root.position.set(pose.x, pose.y, pose.z)
        root.rotation.y = pose.yaw
        // A Promotion or an Intern: drawn at their size (the capsule the server uses grows the same).
        root.scale.setScalar(scaleOf(powersOf(state.buffs)))

        // How they move over the ground, in their own frame (smoothed); a jump of a metre or more (a
        // portal) isn't running.
        if (avatar.last && Math.hypot(pose.x - avatar.last.x, pose.z - avatar.last.z) > 1) avatar.last = null
        const dt = avatar.last ? Math.max(1, now - avatar.last.at) / 1000 : 0
        if (avatar.last && dt > 0) {
            const moved = new Vector3(pose.x - avatar.last.x, 0, pose.z - avatar.last.z)
                .divideScalar(dt)
                .applyAxisAngle(UP, -pose.yaw)
            const k = Math.min(1, dt * 10)
            const capped = Math.min(1, 6 / Math.max(6, moved.length()))
            avatar.velocity.x += (moved.x * capped - avatar.velocity.x) * k
            avatar.velocity.z += (moved.z * capped - avatar.velocity.z) * k
            avatar.speed = Math.hypot(avatar.velocity.x, avatar.velocity.z)
        }
        avatar.last = { x: pose.x, z: pose.z, at: now }
        const ease10 = Math.min(1, dt * 10)
        avatar.air += ((state.jet || pose.y - ground > AIRBORNE ? 1 : 0) - avatar.air) * Math.min(1, dt * 8)
        avatar.down += ((state.prone ? 1 : 0) - avatar.down) * ease10
        const down = avatar.down
        const stand = 1 - down
        const air = avatar.air * stand

        // A stride: one cycle is two steps, each half a stride's length.
        const half = Math.min(STEP.half, 0.025 + avatar.speed * 0.03)
        if (avatar.speed > 0.05) avatar.stride += (avatar.speed * dt * Math.PI) / (2 * half)
        const moving = Math.min(1, avatar.speed / 0.6) * (1 - avatar.air)

        // A hit rocks them away from it: the top of the body goes the way the shot pushed.
        const rock = avatar.hit ? hitRock(now - avatar.hit.at) : 0
        const push = avatar.hit && rock > 0 ? this.local(avatar, avatar.hit.push) : null
        const tilt = push ? rock * (avatar.hit!.blast ? HIT.blast : HIT.tilt) : 0
        // Lying: turned face down about the feet, slid back half a body so it lies over where they
        // are (the server's prone hit capsule), raised by the chest's depth. Running leans them in.
        const lean = Math.min(0.15, Math.max(-0.1, -avatar.velocity.z * 0.035))
        avatar.body.position.set(0, PRONE_LIFT * down, (PLAYER.height / 2) * down)
        avatar.body.rotation.set(
            (lean + (push ? push.z * tilt : 0)) * stand - (Math.PI / 2) * down,
            0,
            push ? -push.x * tilt : 0
        )
        // The hips dip as the legs pass, and sink a little with knees bent in the air.
        const dip = Math.abs(Math.sin(avatar.stride)) * STEP.dip * moving
        figure.torso.position.y = BODY.hipY - dip - air * 0.02

        // Holding a gun: bladed, the head turned back to look ahead, nodding with their aim.
        const holding = state.weapon !== 'stapler' ? 1 : 0.3
        figure.chest.rotation.set(0, -BLADE * holding * stand, 0)
        const snap = avatar.hit?.headshot ? rock * HIT.headshot : 0
        figure.head.rotation.set(pose.pitch * 0.5 + snap + PRONE_LOOK * down, BLADE * holding * stand, 0)

        // The gun: up to the eye while aiming, down at low ready in a dodge; a new one comes up from below.
        avatar.aimed += ((state.aiming ? 1 : 0) - avatar.aimed) * ease10
        avatar.lowered += ((avatar.speed > DODGE_SPEED && !state.aiming ? 1 : 0) - avatar.lowered) * ease10
        if (state.weapon !== avatar.held) {
            avatar.held = state.weapon
            avatar.switchAt = now
        }
        avatar.aim.position.set(0, BODY.shoulderY - dip - air * 0.02, 0)
        avatar.aim.rotation.x = pose.pitch + (Math.PI / 2) * down
        const grips =
            state.weapon === 'stapler'
                ? this.holdStapler(avatar, now)
                : this.holdGun(avatar, state.weapon, state.reload, now)

        root.updateMatrixWorld(true)
        this.arm(avatar, 0, grips[0])
        this.arm(avatar, 1, grips[1])

        // Legs: stepping on the ground (crawling, prone), tucked in the air.
        for (const side of [0, 1] as const) {
            const sx = SIDE[side]
            const along =
                avatar.speed > 0.05
                    ? { x: avatar.velocity.x / avatar.speed, z: avatar.velocity.z / avatar.speed }
                    : { x: 0, z: -1 }
            stepAnkle(side, avatar.stride, along, moving * stand, target)
            // In the air: knees up, one higher, the feet back under them.
            target.x += (sx * BODY.hipX * 1.1 - target.x) * air
            target.y += ((side === 0 ? 0.075 : 0.045) - target.y) * air
            target.z += ((side === 0 ? -0.01 : 0.03) - target.z) * air
            // Prone: the legs out straight, a knee drawn up and out in turn as they crawl.
            const crawl = Math.max(0, Math.sin(avatar.stride + side * Math.PI)) * Math.min(1, avatar.speed / 0.3) * down
            target.x += sx * crawl * 0.03
            target.y += crawl * 0.05
            pole.set(sx * (0.15 + crawl * 2), 0, -1)
            this.leg(avatar, side, target, pole, (1 - air) * stand)
        }

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
            avatar.halo.position.y = PLAYER.height + 0.04 + Math.sin(now * 0.005) * 0.01
        }
        if (state.shielded) avatar.shield.rotation.y = now * 0.002

        this.flash(avatar, now < avatar.flashUntil)
    }

    /** Hit: their clothes flash white. */
    private flash(avatar: Avatar, on: boolean): void {
        for (const cloth of avatar.figure.cloth) {
            cloth.emissive.set(on ? 0xffffff : 0x000000)
            cloth.emissiveIntensity = on ? 0.9 : 0
        }
    }

    /** A gun in their hands: posed and animated as in yours; the hands go where it puts yours. */
    private holdGun(avatar: Avatar, gunName: Gun, reported: number | null, now: number): [Grip | null, Grip | null] {
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
            at.x - tip * 0.008,
            at.y + tip * 0.014 - down * 0.022,
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

        // The hands where the gun wants them, in its own frame; a hand it doesn't want hangs.
        return [
            hands.right ? { frame: inner, at: hands.right.at, q: hands.right.q } : null,
            hands.left ? { frame: inner, at: hands.left.at, q: hands.left.q } : null,
        ]
    }

    /** The stapler in the right hand, chopping when they swing; the left hangs. */
    private holdStapler(avatar: Avatar, now: number): [Grip | null, Grip | null] {
        avatar.hold.group.visible = false
        avatar.reloadFrom = null
        const { stapler } = avatar
        stapler.visible = true
        const swung = (now - avatar.swingAt) / 300
        stapler.rotation.x = swung < 1 ? -Math.sin(swung * Math.PI) * 1.1 : 0
        // Comes up from below after a switch.
        stapler.position.y = -0.03 - (1 - ease(Math.min(1, (now - avatar.switchAt) / SWITCH_MS))) * 0.03
        // The fist round its back end.
        return [{ frame: stapler, at: new Vector3(0, 0.004, -0.012), q: new Quaternion() }, null]
    }

    /**
     * One arm (0 right, 1 left): its hand on `grip` (as the gun or stapler has it, the wrist where
     * the fist's is), the arm bending at the elbow from the shoulder to reach it, stretching a
     * little at most; null: hanging at their side. Needs the world matrices up to date.
     */
    private arm(avatar: Avatar, side: 0 | 1, grip: Grip | null): void {
        const { body, figure } = avatar
        const hand = avatar.hands[side]
        const limb = figure.arms[side]
        // The shoulder, on the chest, in the body's frame.
        toBody.copy(body.matrixWorld).invert()
        shoulder.copy(SHOULDERS[side]).applyMatrix4(figure.chest.matrixWorld).applyMatrix4(toBody)
        // Elbows down, out and back.
        pole.set(SIDE[side] * 0.7, -1, 0.5)

        if (grip) {
            // The fist where the grip has it, in the body's frame; the wrist follows from it.
            toBody.multiply(grip.frame.matrixWorld)
            toBody.decompose(target, frameQ, frameS)
            hand.group.position.copy(grip.at).applyMatrix4(toBody)
            hand.group.quaternion.copy(frameQ).multiply(grip.q ?? hang)
            wrist
                .copy(hand.wrist)
                .multiplyScalar(HAND_SCALE)
                .applyQuaternion(hand.group.quaternion)
                .add(hand.group.position)
            const stretch = Math.min(MAX_STRETCH, Math.max(1, wrist.distanceTo(shoulder) / ARM_REACH))
            twoBone(shoulder, wrist, BODY.upperArm * stretch, BODY.forearm * stretch, pole, mid, end)
            orient(limb.upper, shoulder, mid, pole)
            orient(limb.lower, mid, end, pole)
            limb.upper.scale.set(1, stretch, 1)
            limb.lower.scale.set(1, stretch, 1)
            // Still short of it (a reload's reach): the fist stays on the gun.
            return
        }
        // Hanging: straight down at their side, a little forward, the fist following the forearm.
        target.copy(shoulder).add(wrist.set(SIDE[side] * 0.012, -ARM_REACH * 0.97, -0.008))
        twoBone(shoulder, target, BODY.upperArm, BODY.forearm, pole.set(SIDE[side] * 0.3, 0, 1), mid, end)
        orient(limb.upper, shoulder, mid, pole)
        orient(limb.lower, mid, end, pole)
        limb.upper.scale.set(1, 1, 1)
        limb.lower.scale.set(1, 1, 1)
        hand.group.quaternion.copy(limb.lower.quaternion).multiply(hang)
        hand.group.position.copy(hand.wrist).multiplyScalar(-HAND_SCALE).applyQuaternion(hand.group.quaternion).add(end)
    }

    /** One leg (0 right, 1 left) from its hip to its ankle at `ankle` (the body's frame), the knee toward `kneeToward`. */
    private leg(avatar: Avatar, side: 0 | 1, ankle: Vector3, kneeToward: Vector3, planted: number): void {
        const { figure } = avatar
        const limb = figure.legs[side]
        hipJoint.set(SIDE[side] * BODY.hipX, figure.torso.position.y, 0)
        twoBone(hipJoint, ankle, BODY.thigh, BODY.shin, kneeToward, mid, end)
        orient(limb.upper, hipJoint, mid, kneeToward)
        orient(limb.lower, mid, end, kneeToward)
        // The foot: flat when planted, toes up as it swings through, pointed in the air.
        const foot = figure.feet[side]
        foot.position.copy(end)
        const lifted = (end.y - BODY.ankle) / STEP.lift
        foot.rotation.set(Math.min(0.4, lifted * 0.3) * planted - (1 - planted) * 0.5, 0, 0)
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

    /** Down: the knees go, the fall, lying there, sinking away; gone until they're back. */
    private lie(avatar: Avatar, pose: Pose, now: number): void {
        const death = avatar.death
        avatar.last = null
        const since = death ? now - death.at : Infinity
        avatar.root.visible = since < DEATH.goneAt
        if (!death || !avatar.root.visible) return
        avatar.root.position.set(pose.x, pose.y, pose.z)
        const { figure, body } = avatar

        const angle = fallAngle(since)
        const over = angle / (Math.PI / 2)
        body.quaternion.setFromAxisAngle(death.axis, angle)
        // Lying, the back (not the middle of the body) rests on the floor; then they sink through it.
        const sink = Math.max(0, (since - DEATH.sinkAt) / (DEATH.goneAt - DEATH.sinkAt))
        // The knees buckle first: the hips drop as they go over.
        const buckle = Math.min(1, since / 250)
        body.position.set(0, 0.026 * Math.sin(angle) - sink * 0.12, 0)
        figure.torso.position.y = BODY.hipY - buckle * 0.05 * (1 - over * 0.6)
        figure.chest.rotation.set(-0.15 * over, 0, 0)
        figure.head.rotation.set(0.35 * over, 0, 0)
        avatar.aim.position.set(0, figure.torso.position.y + BODY.shoulderY - BODY.hipY, 0)
        avatar.aim.rotation.x = -0.4 * over
        body.updateMatrixWorld(true)
        avatar.root.updateMatrixWorld(true)
        // The arms go limp, out to the sides.
        for (const side of [0, 1] as const) {
            this.arm(avatar, side, {
                frame: avatar.aim,
                at: new Vector3(SIDE[side] * (0.08 + 0.04 * over), -0.11, 0.02 * over),
                q: null,
            })
            // The knees buckle, then the legs go slack and straight as they hit the floor.
            const bent = buckle * (1 - over)
            target.set(SIDE[side] * BODY.hipX * (1.2 + over * 0.6), BODY.ankle + bent * 0.03, 0.01 + bent * 0.02)
            this.leg(avatar, side, target, pole.set(SIDE[side] * 0.4, 0, -1), 1)
        }
        this.flash(avatar, false)

        // The gun falls to the floor, tumbling, and lies on its side.
        const { group } = avatar.hold
        if (group.parent === avatar.root) {
            const dt = Math.min(0.05, (now - death.lastAt) / 1000)
            const floor = 0.008 - sink * 0.12
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

        const figure = buildFigure(lookFor(id, color))
        const root = new Group()
        const body = new Group()
        root.add(body)
        body.add(figure.torso)
        for (const limb of [...figure.arms, ...figure.legs]) body.add(limb.upper, limb.lower)
        body.add(...figure.feet)

        // Their fists: yours, in their skin, at their size.
        const kit = kitFor(color)
        const bare = { ...kit, glove: figure.skin, dark: figure.skin }
        const hands: [Hand, Hand] = [buildHand(bare, 'right'), buildHand(bare, 'left')]
        for (const hand of hands) {
            hand.group.scale.setScalar(HAND_SCALE)
            body.add(hand.group)
        }

        // The gun and the stapler, pivoting at the shoulders' height with the aim.
        const aim = new Group()
        aim.position.set(0, BODY.shoulderY, 0)
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
            // The sight's glowing dot is for your own eye.
            gun.tip.visible = false
            inner.add(gun.group)
        }
        inner.add(flash.group, ...Object.values(cases).flat())
        const group = new Group()
        group.add(inner)

        // The stapler, held the same way, pivoting at its back for the chop.
        const stapler = new Group()
        stapler.position.set(0.02, -0.03, -0.045)
        const base = new Mesh(shape.staplerBase, dark)
        base.position.set(0, -0.005, -0.033)
        const top = new Mesh(shape.staplerArm, figure.accent)
        top.position.set(0, 0.005, -0.032)
        stapler.add(base, top)
        stapler.visible = false
        aim.add(group, stapler)
        body.add(aim)

        // The jetpack's flames, under its two nozzles.
        const flames: Group[] = []
        for (const side of [-1, 1]) {
            const flame = new Group()
            flame.position.set(side * 0.018, -0.05, 0.002)
            flame.add(new Mesh(shape.flame, flameMaterial), new Mesh(shape.core, coreMaterial))
            flame.visible = false
            figure.pack.add(flame)
            flames.push(flame)
        }

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
        const blob = new Mesh(
            blobPlane,
            new MeshBasicMaterial({
                color: 0x000000,
                alphaMap: blobMap(),
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2,
            })
        )
        blob.visible = false
        this.scene.add(blob)
        this.options.dress?.(root)
        const avatar: Avatar = {
            blob,
            id,
            root,
            body,
            figure,
            hands,
            aim,
            hold: { group, inner, guns, flash, cases },
            kit,
            stapler,
            swingAt: -1e9,
            flames,
            shield,
            firewall,
            halo,
            xray,
            name,
            color,
            last: null,
            velocity: { x: 0, z: 0 },
            speed: 0,
            stride: 0,
            air: 0,
            flashUntil: 0,
            held: 'rifle',
            switchAt: -1e9,
            aimed: 0,
            lowered: 0,
            down: 0,
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
        this.scene.remove(avatar.root, avatar.blob)
        avatar.blob.material.dispose()
        // Their body, hands and guns are theirs alone (geometry and materials); the shapes and
        // materials every trooper shares (flames, shields, the rockets' look, the stapler's) aren't.
        const shared = new Set<Material>([
            ...Object.values(rocketLook),
            dark,
            flameMaterial,
            coreMaterial,
            shieldMaterial,
            firewallMaterial,
            ...SHARED_MATERIALS,
        ])
        const sharedShapes = new Set<unknown>([...Object.values(shape), blobPlane])
        avatar.root.traverse((o: Object3D) => {
            if (!(o instanceof Mesh)) return
            if (!sharedShapes.has(o.geometry)) o.geometry.dispose()
            for (const material of [o.material].flat() as Material[]) {
                if (!shared.has(material)) material.dispose()
            }
        })
        this.avatars.delete(id)
    }
}
