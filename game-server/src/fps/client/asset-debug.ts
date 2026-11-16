import {
    BufferAttribute,
    type BufferGeometry,
    Color,
    DoubleSide,
    FrontSide,
    type Camera,
    type Material,
    type Mesh,
    type MeshStandardMaterial,
    type Object3D,
    Ray,
    Matrix4,
    ShaderMaterial,
    type Side,
    type Texture,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { assetOf, type SourceRun, sourceAt } from '../assets/sources.ts'

/** What's drawn by a map itself, not an asset: one red for all of it. */
export const MAP_COLOR = new Color('#d23a3a')

/** An asset's colour: its own hue from its id, kept away from the map's red. */
export function assetColor(id: string): Color {
    let h = 2166136261
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    h >>>= 0
    const hue = 80 + (h % 230) // 80°…310°: yellows-greens through blues to purples
    const light = 0.45 + ((h >>> 9) % 3) * 0.08
    return new Color().setHSL(hue / 360, 0.7, light)
}

const VERTEX = /* glsl */ `
attribute vec3 assetColor;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
    vColor = assetColor;
    vUv = uv;
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        n = mat3(instanceMatrix) * n;
    #endif
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * modelViewMatrix * p;
}`

const FRAGMENT = /* glsl */ `
uniform sampler2D cutout;
uniform float alphaTest;
uniform float opacity;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
    #ifdef USE_CUTOUT
        if (texture2D(cutout, vUv).a < alphaTest) discard;
    #endif
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float light = 0.5 + 0.5 * max(dot(n, normalize(vec3(0.4, 1.0, 0.3))), 0.0);
    gl_FragColor = vec4(vColor * light, opacity);
    #include <colorspace_fragment>
}`

/** The asset view's names for what's under the crosshair: an asset ("office-chair") or the map. */
export interface Identified {
    asset: string | null
    /** For the map's own: the file that drew it (and what, when it says). */
    drawnBy: string
}

/**
 * The asset view (Esc → Settings → Show assets): every asset in the maps painted a flat colour of
 * its own, everything the maps draw themselves red, and the name of what's under the crosshair.
 * Built on first use (a colour per vertex, a BVH per mesh for the crosshair), undone by turning it
 * off: the maps' own materials come back.
 */
export class AssetDebug {
    private on = false
    private readonly swapped = new Map<Mesh, Material | Material[]>()
    private readonly materials = new Map<string, ShaderMaterial>()
    private readonly label: HTMLDivElement
    private lastPick = 0
    private readonly ray = new Ray()
    private readonly inverse = new Matrix4()

    constructor(private readonly roots: readonly Object3D[]) {
        this.label = document.createElement('div')
        Object.assign(this.label.style, {
            position: 'fixed',
            left: '50%',
            top: 'calc(50% + 46px)',
            transform: 'translateX(-50%)',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(10, 12, 16, 0.75)',
            color: '#f4f6f8',
            font: '600 13px/1.35 system-ui, sans-serif',
            textAlign: 'center',
            pointerEvents: 'none',
            // Over the canvas, under the HUD's menus.
            zIndex: '15',
            display: 'none',
            whiteSpace: 'nowrap',
        })
        document.body.append(this.label)
    }

    get enabled(): boolean {
        return this.on
    }

    set enabled(on: boolean) {
        if (on === this.on) return
        this.on = on
        this.label.style.display = on ? '' : 'none'
        if (on) {
            for (const root of this.roots) root.traverse(o => this.paint(o as Mesh, root))
        } else {
            for (const [mesh, material] of this.swapped) mesh.material = material
            this.swapped.clear()
        }
    }

    /** Names what's under the middle of the screen (a few times a second). */
    update(camera: Camera, now: number): void {
        if (!this.on || now - this.lastPick < 100) return
        this.lastPick = now
        const hit = this.pick(camera)
        if (!hit) {
            this.label.textContent = 'Asset view · nothing under the crosshair'
            return
        }
        const swatch = (hit.asset ? assetColor(hit.asset.split(' › ').pop()!) : MAP_COLOR).getStyle()
        const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${swatch}"></span>`
        this.label.innerHTML = hit.asset ? `${dot}asset · ${escape(hit.asset)}` : `${dot}map · ${escape(hit.drawnBy)}`
    }

    /** The nearest opaque thing under the screen's middle, among the visible maps. */
    pick(camera: Camera): Identified | null {
        this.ray.origin.setFromMatrixPosition(camera.matrixWorld)
        this.ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld)
        let best: { distance: number; found: Identified } | null = null
        const local = new Ray()
        for (const [mesh] of this.swapped) {
            if (!visible(mesh) || (mesh as { isInstancedMesh?: boolean }).isInstancedMesh) continue
            const original = this.swapped.get(mesh)!
            if (!Array.isArray(original) && original.transparent) continue
            const geometry = mesh.geometry as BufferGeometry & { assetBvh?: MeshBVH }
            geometry.assetBvh ??= new MeshBVH(geometry, { indirect: true })
            this.inverse.copy(mesh.matrixWorld).invert()
            local.copy(this.ray).applyMatrix4(this.inverse)
            const side: Side = Array.isArray(original) ? FrontSide : original.side
            const hit = geometry.assetBvh.raycastFirst(local, side === DoubleSide ? DoubleSide : side)
            if (!hit || !hit.face) continue
            const distance = hit.point.applyMatrix4(mesh.matrixWorld).distanceTo(this.ray.origin)
            if (best && distance >= best.distance) continue
            best = { distance, found: this.identify(mesh, hit.face.a) }
        }
        return best?.found ?? null
    }

    private identify(mesh: Mesh, vertex: number): Identified {
        const runs = mesh.userData.sources as SourceRun[] | undefined
        const asset = runs ? (sourceAt(runs, vertex)?.asset ?? null) : (mesh.userData.assetChain ?? null)
        return { asset, drawnBy: (mesh.userData.drawnBy as string | undefined) ?? 'the map' }
    }

    private paint(mesh: Mesh, root: Object3D): void {
        if (!mesh.isMesh) return
        const original = mesh.material
        // The sky and the like draw themselves.
        if (!Array.isArray(original) && (original as ShaderMaterial).isShaderMaterial) return
        const geometry = mesh.geometry
        if (!geometry.attributes.assetColor) {
            const runs = mesh.userData.sources as SourceRun[] | undefined
            if (!runs) mesh.userData.assetChain = assetOf(mesh, root)
            const count = geometry.attributes.position!.count
            const colors = new Float32Array(count * 3)
            const fill = (from: number, n: number, asset: string | null) => {
                const c = asset ? assetColor(asset.split(' › ').pop()!) : MAP_COLOR
                for (let i = from; i < from + n && i < count; i++) {
                    colors[i * 3] = c.r
                    colors[i * 3 + 1] = c.g
                    colors[i * 3 + 2] = c.b
                }
            }
            if (runs) for (const run of runs) fill(run.start, run.count, run.asset)
            else fill(0, count, mesh.userData.assetChain as string | null)
            geometry.setAttribute('assetColor', new BufferAttribute(colors, 3))
        }
        this.swapped.set(mesh, original)
        mesh.material = this.materialLike(Array.isArray(original) ? original[0]! : original)
    }

    /** One debug material per kind of original: cut-out leaves keep their shape, glass stays see-through. */
    private materialLike(original: Material): ShaderMaterial {
        const standard = original as MeshStandardMaterial
        const cutout = standard.alphaTest > 0 ? (standard.alphaMap ?? standard.map ?? null) : null
        const key = `${cutout?.uuid ?? ''}|${original.transparent}|${original.side}|${original.alphaTest}`
        let material = this.materials.get(key)
        if (!material) {
            material = new ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                uniforms: {
                    cutout: { value: cutout as Texture | null },
                    alphaTest: { value: original.alphaTest },
                    opacity: { value: original.transparent ? 0.35 : 1 },
                },
                defines: cutout ? { USE_CUTOUT: '' } : {},
                transparent: original.transparent,
                depthWrite: !original.transparent,
                side: original.side,
            })
            this.materials.set(key, material)
        }
        return material
    }
}

function visible(o: Object3D): boolean {
    for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
    return true
}

function escape(text: string): string {
    return text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
}
