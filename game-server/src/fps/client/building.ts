import {
    BoxGeometry,
    CanvasTexture,
    Color,
    DynamicDrawUsage,
    EdgesGeometry,
    InstancedMesh,
    LineBasicMaterial,
    LineSegments,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Quaternion,
    type Scene,
    SRGBColorSpace,
    Vector3,
} from 'three'
import { TEAM_COLORS, type WallSpec } from '../protocol.ts'
import { BUILD, DOOR, halfExtent, type Wall, type WallPart, type Walls } from '../sim/walls.ts'

/**
 * The walls players build, drawn: cubicle partitions (grey fabric in an aluminium frame), one
 * instanced mesh for all of them, tinted by team in team deathmatch and darker as they're shot.
 * And build mode's ghost: where the next one goes, green, or red where one already is.
 */

/** The partition's fabric, and how dark a wall about to break gets. */
const FABRIC = new Color('#9aa3ad')
/** A door's leaf: office wood. */
const DOOR_WOOD = new Color('#a87a52')
const WORN = 0.45
/** Boxes drawn at most: a door or a window is four. */
const MAX_PARTS = BUILD.max * 4

export class WallViews {
    private readonly mesh: InstancedMesh
    private readonly ghost: Mesh
    private readonly ghostEdges: LineSegments
    private readonly ghostMaterial: MeshBasicMaterial
    private readonly matrix = new Matrix4()
    private readonly color = new Color()
    private readonly turn = new Quaternion()
    /** Each door's leaf: which instance it is, and when it last opened or shut. */
    private doors = new Map<number, Swing>()

    constructor(scene: Scene) {
        const box = new BoxGeometry(1, 1, 1)
        const material = new MeshStandardMaterial({ map: partitionTexture(), roughness: 0.95, metalness: 0 })
        this.mesh = new InstancedMesh(box, material, MAX_PARTS)
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
        // One colour set up front, so the shader is the instanced-colour one from the start (the warm-up compiles it).
        this.mesh.setColorAt(0, FABRIC)
        this.mesh.count = 0
        this.mesh.frustumCulled = false
        // Shaded by the office's shadows, casting none: those are drawn once (the office never moves).
        this.mesh.receiveShadow = true
        scene.add(this.mesh)

        this.ghostMaterial = new MeshBasicMaterial({
            color: 0x5cff8a,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
        })
        this.ghost = new Mesh(box, this.ghostMaterial)
        this.ghost.visible = false
        this.ghost.renderOrder = 2
        this.ghostEdges = new LineSegments(
            new EdgesGeometry(box),
            new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
        )
        this.ghost.add(this.ghostEdges)
        scene.add(this.ghost)
    }

    /**
     * Draws the walls as they are now (after any built, changed, hit or gone): a box per part, a
     * door's leaf on its hinge (swinging, when it just opened or shut).
     */
    sync(walls: Walls, now: number): void {
        let i = 0
        const doors = new Map<number, Swing>()
        for (const wall of walls.all) {
            for (const part of wall.parts) {
                if (i >= MAX_PARTS) break
                if (wall.kind === 'door' && part.look === 'leaf') {
                    const known = this.doors.get(wall.id)
                    // Just opened or shut: it swings from now; new (just made a door), it's simply there.
                    const at = known && known.open !== wall.open ? now : (known?.at ?? -Infinity)
                    const swing = { wall, open: wall.open, at, index: i }
                    doors.set(wall.id, swing)
                    this.mesh.setMatrixAt(i, this.leafMatrix(swing, now))
                    this.mesh.setColorAt(i, this.colorOf(wall, part.look))
                    i++
                    continue
                }
                this.matrix.compose(
                    new Vector3((part.minX + part.maxX) / 2, (part.minY + part.maxY) / 2, (part.minZ + part.maxZ) / 2),
                    IDENTITY,
                    new Vector3(part.maxX - part.minX, part.maxY - part.minY, part.maxZ - part.minZ)
                )
                this.mesh.setMatrixAt(i, this.matrix)
                this.mesh.setColorAt(i, this.colorOf(wall, part.look))
                i++
            }
        }
        this.doors = doors
        this.mesh.count = i
        this.mesh.instanceMatrix.needsUpdate = true
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }

    /** Every frame: the doors still swinging move on. */
    update(now: number): void {
        let moved = false
        for (const swing of this.doors.values()) {
            if (now - swing.at > SWING_MS + 50) continue
            this.mesh.setMatrixAt(swing.index, this.leafMatrix(swing, now))
            moved = true
        }
        if (moved) this.mesh.instanceMatrix.needsUpdate = true
    }

    /**
     * A door's leaf at this moment: on its hinge (the first post), turned from shut (in the doorway)
     * to open (a quarter out, where its collision is), eased.
     */
    private leafMatrix(swing: Swing, now: number): Matrix4 {
        const { wall } = swing
        const t = Math.min(1, Math.max(0, (now - swing.at) / SWING_MS))
        const eased = 1 - (1 - t) ** 3
        const angle = (swing.open ? eased : 1 - eased) * (Math.PI / 2)
        const across = wall.axis === 'z' ? 'x' : 'z'
        const width = BUILD.size - 2 * DOOR.post
        const height = BUILD.size - DOOR.lintel
        const hinge = new Vector3(wall.x, wall.y - BUILD.size / 2 + height / 2, wall.z)
        hinge[across] -= BUILD.size / 2 - DOOR.post
        const toward = new Vector3()
        toward[across] = Math.cos(angle)
        toward[wall.axis as 'x' | 'z'] = Math.sin(angle)
        const centre = hinge.addScaledVector(toward, width / 2)
        // Turned about the vertical so its width runs `toward`.
        this.turn.setFromAxisAngle(UP, Math.atan2(-toward.z, toward.x))

        return this.matrix.compose(centre, this.turn, new Vector3(width, height, DOOR.leaf))
    }

    /** Build mode's ghost at `spec` (null: none), red where it can't go. */
    showGhost(spec: WallSpec | null, blocked: boolean): void {
        this.ghost.visible = spec !== null
        if (!spec) return
        this.ghost.position.set(spec.x, spec.y, spec.z)
        // A hair bigger than the wall it shows, so it doesn't flicker against a built one in the same place.
        this.ghost.scale.set(
            halfExtent(spec.axis, 'x') * 2 + 0.004,
            halfExtent(spec.axis, 'y') * 2 + 0.004,
            halfExtent(spec.axis, 'z') * 2 + 0.004
        )
        this.ghostMaterial.color.set(blocked ? 0xff4d4d : 0x5cff8a)
    }

    private colorOf(wall: Wall, look: WallPart['look']): Color {
        this.color.copy(look === 'leaf' ? DOOR_WOOD : FABRIC)
        if (wall.team) this.color.lerp(new Color(TEAM_COLORS[wall.team]), 0.55)
        // Worn down as it's shot: darker, toward the frame showing through.
        const worn = 1 - wall.health / BUILD.health
        return this.color.multiplyScalar(1 - worn * WORN)
    }
}

const IDENTITY = new Quaternion()
const UP = new Vector3(0, 1, 0)
/** A door's swing, open or shut. */
const SWING_MS = 280

interface Swing {
    wall: Wall
    open: boolean
    /** When it last opened or shut (-Infinity: it's been that way since it became a door). */
    at: number
    /** Its leaf's instance. */
    index: number
}

/** A partition panel: woven grey fabric in an aluminium frame, a little darker toward the frame. */
function partitionTexture(): CanvasTexture {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const g = canvas.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, size, size)
    // The weave: fine light and dark threads.
    for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
            const shade = 225 + ((x * 7 + y * 13) % 17) - ((x + y) % 4 === 0 ? 14 : 0)
            g.fillStyle = `rgb(${shade},${shade},${shade})`
            g.fillRect(x, y, 2, 2)
        }
    }
    // The frame: a bright metal border, its shadow inside.
    g.strokeStyle = 'rgba(0,0,0,.18)'
    g.lineWidth = 6
    g.strokeRect(9, 9, size - 18, size - 18)
    g.strokeStyle = '#f4f6f8'
    g.lineWidth = 8
    g.strokeRect(4, 4, size - 8, size - 8)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4

    return texture
}
