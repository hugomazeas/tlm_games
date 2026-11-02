import {
    BoxGeometry,
    CanvasTexture,
    CapsuleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Group,
    type Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    type Scene,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
} from 'three'
import type { PlayerInfo } from '../protocol.ts'
import { PLAYER } from '../sim/movement.ts'
import type { Pose } from './timeline.ts'

/**
 * The other minis: a capsule in their colour with a visor, a jetpack (flame while it burns), a
 * blaster that follows their aim, a bubble while spawn-shielded and their name above.
 */

const shared = {
    body: new CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius, 4, 14),
    visor: new BoxGeometry(0.15, 0.05, 0.05),
    pack: new BoxGeometry(0.13, 0.15, 0.07),
    nozzle: new CylinderGeometry(0.018, 0.024, 0.04, 8),
    flame: new ConeGeometry(0.03, 0.14, 10),
    gun: new BoxGeometry(0.035, 0.04, 0.16),
    barrel: new CylinderGeometry(0.008, 0.008, 0.06, 8),
    shield: new SphereGeometry(0.3, 20, 14),
}
const visorMaterial = new MeshStandardMaterial({ color: 0x111820, roughness: 0.15, metalness: 0.6 })
const packMaterial = new MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.5 })
const gunMaterial = new MeshStandardMaterial({ color: 0x23262b, roughness: 0.35, metalness: 0.7 })
const flameMaterial = new MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 })
const shieldMaterial = new MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.18, depthWrite: false })

interface Avatar {
    root: Group
    aim: Group
    flame: Mesh
    shield: Mesh
    tag: Sprite
    body: MeshStandardMaterial
    name: string
    color: string
}

export class Avatars {
    private readonly avatars = new Map<string, Avatar>()

    constructor(private readonly scene: Scene) {}

    /** Draws everyone in `poses` but `me`; forgets who's gone. */
    update(poses: Map<string, Pose>, roster: Map<string, PlayerInfo>, me: string | null, time: number): void {
        for (const [id, avatar] of this.avatars) {
            if (!poses.has(id) || id === me) this.remove(id, avatar)
        }
        for (const [id, pose] of poses) {
            if (id === me) continue
            const info = roster.get(id)
            const avatar = this.avatarFor(id, info?.name ?? '?', info?.color ?? '#cccccc')
            const visible = pose.state.alive
            avatar.root.visible = visible
            if (!visible) continue
            avatar.root.position.set(pose.x, pose.y, pose.z)
            avatar.root.rotation.y = pose.yaw
            avatar.aim.rotation.x = pose.pitch
            avatar.flame.visible = pose.state.jet
            if (pose.state.jet) avatar.flame.scale.y = 0.8 + Math.sin(time * 0.05 + pose.x * 10) * 0.25
            avatar.shield.visible = pose.state.shielded
        }
    }

    /** Is someone drawn right now (here and alive)? */
    has(id: string): boolean {
        return this.avatars.get(id)?.root.visible ?? false
    }

    private avatarFor(id: string, name: string, color: string): Avatar {
        const existing = this.avatars.get(id)
        if (existing && existing.name === name && existing.color === color) return existing
        if (existing) this.remove(id, existing)

        const root = new Group()
        const body = new MeshStandardMaterial({ color: new Color(color), roughness: 0.45, metalness: 0.1 })
        const torso = new Mesh(shared.body, body)
        torso.position.y = PLAYER.height / 2
        torso.castShadow = true
        root.add(torso)
        const visor = new Mesh(shared.visor, visorMaterial)
        visor.position.set(0, PLAYER.eye, -PLAYER.radius + 0.01)
        root.add(visor)

        const pack = new Mesh(shared.pack, packMaterial)
        pack.position.set(0, 0.2, PLAYER.radius + 0.03)
        root.add(pack)
        for (const side of [-1, 1]) {
            const nozzle = new Mesh(shared.nozzle, packMaterial)
            nozzle.position.set(side * 0.04, 0.11, PLAYER.radius + 0.04)
            root.add(nozzle)
        }
        const flame = new Mesh(shared.flame, flameMaterial)
        flame.rotation.x = Math.PI
        flame.position.set(0, 0.03, PLAYER.radius + 0.04)
        root.add(flame)

        // The blaster pivots at the shoulder with the aim's pitch.
        const aim = new Group()
        aim.position.set(0.1, 0.24, -0.04)
        const gun = new Mesh(shared.gun, gunMaterial)
        gun.position.z = -0.06
        const barrel = new Mesh(shared.barrel, gunMaterial)
        barrel.rotation.x = Math.PI / 2
        barrel.position.z = -0.16
        aim.add(gun, barrel)
        root.add(aim)

        const shield = new Mesh(shared.shield, shieldMaterial)
        shield.position.y = PLAYER.height / 2
        root.add(shield)

        const tag = nameTag(name, color)
        tag.position.y = PLAYER.height + 0.1
        root.add(tag)

        this.scene.add(root)
        const avatar = { root, aim, flame, shield, tag, body, name, color }
        this.avatars.set(id, avatar)

        return avatar
    }

    private remove(id: string, avatar: Avatar): void {
        this.scene.remove(avatar.root)
        avatar.body.dispose()
        const tagMaterial = avatar.tag.material as SpriteMaterial
        tagMaterial.map?.dispose()
        ;(tagMaterial as Material).dispose()
        this.avatars.delete(id)
    }
}

function nameTag(name: string, color: string): Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const g = canvas.getContext('2d')!
    g.font = 'bold 30px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const width = Math.min(250, g.measureText(name).width + 28)
    g.fillStyle = 'rgba(12,14,18,0.72)'
    g.beginPath()
    g.roundRect((256 - width) / 2, 10, width, 44, 12)
    g.fill()
    g.fillStyle = color
    g.fillRect((256 - width) / 2 + 10, 50, width - 20, 3)
    g.fillStyle = '#ffffff'
    g.fillText(name, 128, 33)
    const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthWrite: false }))
    sprite.scale.set(0.32, 0.08, 1)

    return sprite
}
