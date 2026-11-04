import {
    type Camera,
    DirectionalLight,
    Group,
    HemisphereLight,
    type Mesh,
    type Object3D,
    PMREMGenerator,
    PointLight,
    Quaternion,
    Scene,
    Vector3,
    type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Gun, Weapon } from '../protocol.ts'
import { reloadMsOf, STAPLER, SWITCH_MS } from '../sim/combat.ts'
import { rocketLook } from './effects.ts'
import {
    buildCase,
    buildFlash,
    buildGuns,
    buildHand,
    buildSleeve,
    buildStapler,
    type Ejection,
    ease,
    type GunModel,
    type Hand,
    kitFor,
    type Pose,
} from './guns.ts'

/**
 * Your gun (or stapler) in your gloved hands at the bottom right of the view: its kick, flash and
 * spent cases, the raise on a switch, the bob, aiming down the sights and the reload. It's its own
 * little scene with its own light, drawn after the world over a cleared depth (`render`), so it
 * never sinks into a wall and its parts sort themselves.
 */

const UP = new Vector3(0, 1, 0)
/** The elbows, off screen (in the gun's frame): the sleeves run from them to the wrists. */
const ELBOWS = { right: new Vector3(0.12, -0.2, 0.03), left: new Vector3(-0.06, -0.21, -0.1) }
/** The gun turns about here (its middle) when it kicks or tips for a reload. */
const PIVOT = new Vector3(0.045, -0.04, -0.15)
/** At the hip the gun sits this much lower, further right and out than at the sights. */
const HIP = new Vector3(0.008, -0.016, -0.06)
/** Reloading, the gun comes up toward the middle of the view, where you can see the hands work. */
const RELOAD_SHIFT = new Vector3(-0.024, 0.036, 0.012)
/** Spent cases drawn at once, and how long one flies (ms). */
const CASES = 6
const CASE_MS = 520

export class Viewmodel {
    /** What `render` draws over the world. */
    readonly scene = new Scene()
    /** Follows the camera (or, in the gun lab, whatever it's told to follow). */
    private readonly holder = new Group()
    /** The weapon, posed in the view: kick, bob, aim, reload tilt (turning about `PIVOT`). */
    private readonly root = new Group()
    /** The gun's own frame, inside `root`: the guns, hands and cases. */
    private readonly inner = new Group()
    private anchor: Object3D | null = null
    private readonly guns: Record<Gun, GunModel>
    private readonly stapler: { group: Group; arm: Group; right: Pose }
    private readonly hands: Record<'left' | 'right', Hand>
    private readonly sleeves: Record<'left' | 'right', Mesh>
    private held: Weapon = 'rifle'
    /** The last gun held: the stapler aims and fires from nothing, so its questions go there. */
    private lastGun: Gun = 'rifle'
    private isLoaded = true
    private switchAt = -1e9
    private swingAt = -1e9
    private kickAt = -1e9
    private readonly flash: ReturnType<typeof buildFlash>
    private readonly light = new PointLight(0xffc070, 0, 1.2)
    /** Recent shots, for their spent cases. */
    private shots: Array<{ at: number; gun: Gun }> = []
    private readonly cases: Record<Ejection['kind'], Group[]>
    private environmentReady = false

    constructor(color: string) {
        const kit = kitFor(color)
        this.guns = buildGuns(kit, rocketLook)
        this.stapler = buildStapler(kit)
        this.hands = { left: buildHand(kit, 'left'), right: buildHand(kit, 'right') }
        this.sleeves = { left: buildSleeve(kit), right: buildSleeve(kit) }
        this.flash = buildFlash()
        this.flash.group.visible = false
        this.cases = {
            case: Array.from({ length: CASES }, () => buildCase(kit, 'case')),
            long: Array.from({ length: CASES }, () => buildCase(kit, 'long')),
            shell: Array.from({ length: CASES }, () => buildCase(kit, 'shell')),
        }
        for (const gun of Object.values(this.guns)) {
            gun.group.visible = false
            this.inner.add(gun.group)
        }
        this.inner.position.copy(PIVOT).negate()
        this.root.add(this.inner)
        this.inner.add(
            this.stapler.group,
            this.flash.group,
            this.light,
            this.hands.left.group,
            this.hands.right.group,
            this.sleeves.left,
            this.sleeves.right,
            ...Object.values(this.cases).flat()
        )
        for (const c of Object.values(this.cases).flat()) c.visible = false

        // Light that keeps the gun readable anywhere: a warm key from above left, a cool fill, the sky.
        const key = new DirectionalLight(0xfff1dc, 2.1)
        key.position.set(-0.5, 1, 0.6)
        const fill = new DirectionalLight(0xcfe0ff, 0.6)
        fill.position.set(0.8, -0.2, 0.3)
        key.target.position.set(0, 0, -0.2)
        fill.target.position.set(0, 0, -0.2)
        this.holder.add(this.root, key, key.target, fill, fill.target, new HemisphereLight(0xe8eef5, 0x5a5048, 0.9))
        this.scene.add(this.holder)
    }

    /** Follow this (the camera): the gun is drawn in its frame. */
    follow(anchor: Object3D): void {
        this.anchor = anchor
    }

    /** The sight's glowing tip (the gun in hand, or the last one): on the crosshair when fully aimed. */
    get sightTip(): Mesh {
        return this.guns[this.lastGun].tip
    }

    fire(now: number): void {
        this.kickAt = now
        this.shots.push({ at: now, gun: this.lastGun })
        if (this.shots.length > CASES) this.shots.shift()
        this.flash.petals.rotation.z = Math.random() * Math.PI
    }

    /** A stapler swing: a chop forward and down. */
    swing(now: number): void {
        this.swingAt = now
    }

    set visible(on: boolean) {
        this.holder.visible = on
    }

    /** Whether the launcher has a rocket in it (its nose shows out of the tube). */
    set loaded(on: boolean) {
        this.isLoaded = on
    }

    /** The weapon in hand: the other one drops away and this one comes up. */
    hold(weapon: Weapon, now: number): void {
        if (weapon === this.held) return
        this.held = weapon
        if (weapon !== 'stapler') this.lastGun = weapon
        this.switchAt = now
    }

    /**
     * `aim` 0–1: how far into aiming down the sights (the gun slides over so its sights sit on the
     * crosshair, and stops bobbing). `reload` 0–1: how far through a reload (null: none).
     */
    update(now: number, moving: boolean, aim = 0, reload: number | null = null): void {
        const holdingGun = this.held !== 'stapler'
        const gun = this.guns[this.lastGun]
        const since = now - this.kickAt
        const k = Math.max(0, 1 - since / gun.kick.ms)
        const kick = holdingGun ? k * k * (1 - aim * 0.6) : 0
        const bob = moving ? Math.sin(now * 0.012) * 0.003 * (1 - aim) : 0
        const sway = moving ? Math.sin(now * 0.006) * 0.002 * (1 - aim) : 0
        // Just switched: the new weapon rises from below.
        const raise = Math.min(1, (now - this.switchAt) / SWITCH_MS)
        const lowered = (1 - ease(raise)) * 0.07
        // A reload: the gun tips over to show its side while the hands work.
        const r = holdingGun ? reload : null
        const tilt = r === null ? 0 : ease(Math.min(1, r / 0.12)) * ease(Math.min(1, (1 - r) / 0.12))
        const pose = gun.reloadPose
        const hands = holdingGun
            ? gun.animate({ reload: r, reloadMs: reloadMsOf(this.lastGun), sinceShot: since, loaded: this.isLoaded })
            : { left: null, right: this.staplerHand() }

        // Aimed, the sight's point runs through the middle of the view: the crosshair sits on it.
        const sight = holdingGun ? gun.sight : this.guns.rifle.sight
        const hip = 1 - aim
        this.root.position.set(
            PIVOT.x + sway - sight.x * aim + HIP.x * hip + tilt * RELOAD_SHIFT.x,
            PIVOT.y + bob - sight.y * aim + HIP.y * hip - lowered + tilt * RELOAD_SHIFT.y,
            PIVOT.z + kick * gun.kick.back - tilt * pose.push + HIP.z * hip + tilt * RELOAD_SHIFT.z
        )
        this.root.rotation.set(kick * gun.kick.rise + tilt * pose.pitch, tilt * pose.yaw, tilt * pose.roll)
        for (const [name, model] of Object.entries(this.guns)) model.group.visible = name === this.held
        this.stapler.group.visible = !holdingGun
        this.placeHand('left', hands.left)
        this.placeHand('right', hands.right)

        const flashing = holdingGun && since < 40 + gun.kick.flash * 12
        this.flash.group.visible = flashing
        if (flashing) {
            const fade = 1 - since / (40 + gun.kick.flash * 12)
            this.flash.group.scale.setScalar(gun.kick.flash * (0.6 + 0.4 * fade))
            this.flash.group.position.copy(gun.muzzle)
            this.light.position.copy(gun.muzzle)
        }
        this.light.intensity = flashing ? 0.6 * Math.min(2, gun.kick.flash) : 0
        this.throwCases(now)

        // The swing: back a little (wind-up), then a fast chop forward and down, then back.
        const t = (now - this.swingAt) / STAPLER.intervalMs
        let chop = 0
        if (t < 0.15) chop = (-t / 0.15) * 0.35
        else if (t < 0.35) chop = -0.35 + ((t - 0.15) / 0.2) * 1.45
        else if (t < 1) chop = 1.1 * (1 - (t - 0.35) / 0.65)
        this.stapler.arm.rotation.x = -chop
        this.stapler.arm.position.z = -0.05 - Math.max(0, chop) * 0.03
        this.sync()
    }

    /** Draws the gun over what's already drawn: call after rendering the world. */
    render(renderer: WebGLRenderer, camera: Camera): void {
        if (!this.holder.visible) return
        if (!this.environmentReady) {
            this.environmentReady = true
            const pmrem = new PMREMGenerator(renderer)
            this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
            this.scene.environmentIntensity = 0.7
            pmrem.dispose()
        }
        this.sync()
        const autoClear = renderer.autoClear
        renderer.autoClear = false
        renderer.clearDepth()
        renderer.render(this.scene, camera)
        renderer.autoClear = autoClear
    }

    /** The muzzle of the gun in hand, in the world. */
    muzzleIn(): Vector3 {
        this.sync()
        // Through the gun's own frame: it slides over while aiming.
        return this.inner.localToWorld(this.guns[this.lastGun].muzzle.clone())
    }

    /** Puts the view's frame where the camera is. */
    private sync(): void {
        if (this.anchor) {
            this.anchor.updateWorldMatrix(true, false)
            this.anchor.matrixWorld.decompose(this.holder.position, this.holder.quaternion, this.holder.scale)
        }
        this.holder.updateMatrixWorld(true)
    }

    /** The right hand round the stapler's base, chopping with it. */
    private staplerHand(): Pose {
        const arm = this.stapler.arm
        arm.updateMatrix()
        const local = this.stapler.right
        const inArm = local.at.clone().sub(arm.position)
        return {
            at: inArm.applyQuaternion(arm.quaternion).add(arm.position),
            q: arm.quaternion.clone().multiply(local.q),
        }
    }

    /** A hand where the gun wants it, its sleeve from the wrist back to the elbow. */
    private placeHand(side: 'left' | 'right', pose: Pose | null): void {
        const hand = this.hands[side]
        const sleeve = this.sleeves[side]
        hand.group.visible = sleeve.visible = pose !== null
        if (!pose) return
        hand.group.position.copy(pose.at)
        hand.group.quaternion.copy(pose.q)
        const wrist = hand.wrist.clone().applyQuaternion(pose.q).add(pose.at)
        const elbow = ELBOWS[side]
        const along = wrist.clone().sub(elbow)
        sleeve.position.copy(elbow)
        sleeve.quaternion.copy(new Quaternion().setFromUnitVectors(UP, along.clone().normalize()))
        sleeve.scale.set(1, along.length(), 1)
    }

    /** Spent cases out of the port, spinning, falling away. */
    private throwCases(now: number): void {
        const used: Record<Ejection['kind'], number> = { case: 0, long: 0, shell: 0 }
        for (const all of Object.values(this.cases)) for (const c of all) c.visible = false
        for (const shot of this.shots) {
            const eject = this.guns[shot.gun].eject
            if (!eject || shot.gun !== this.held) continue
            const s = (now - shot.at - eject.delayMs) / 1000
            if (s < 0 || s * 1000 > CASE_MS) continue
            const piece = this.cases[eject.kind][used[eject.kind]++]
            if (!piece) continue
            const [vx, vy, vz] = eject.toward
            piece.visible = true
            piece.position.set(eject.at[0] + vx * s, eject.at[1] + vy * s - 2.2 * s * s, eject.at[2] + vz * s)
            piece.rotation.set(s * 14, s * 9, s * 22)
        }
    }
}
