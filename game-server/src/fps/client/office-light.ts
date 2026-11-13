/**
 * The office's baked light (`map/light.ts`) in the browser: one 3D texture, and a patch for the
 * lit materials that multiplies their ambient light by it, where they are and the way they face.
 * One texture read a pixel; nothing else changes per frame.
 */

import {
    Data3DTexture,
    LinearFilter,
    type Material,
    type Object3D,
    RGBAFormat,
    UnsignedByteType,
    Vector3,
    type WebGLProgramParametersWithUniforms,
} from 'three'
import { decodeLight, irradianceAt, type OfficeLight } from '../map/light.ts'
import packed from '../map/office-light.b64' with { type: 'text' }

/** The committed bake, unpacked (base64, then gunzip). */
export async function loadOfficeLight(): Promise<OfficeLight> {
    const bytes = Uint8Array.from(atob(packed.trim()), c => c.charCodeAt(0))
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return decodeLight(new Uint8Array(await new Response(stream).arrayBuffer()))
}

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vOfficeWorld;
`

const VERTEX_POSITION = /* glsl */ `
{
    vec4 officeWorld = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
        officeWorld = instanceMatrix * officeWorld;
    #endif
    vOfficeWorld = ( modelMatrix * officeWorld ).xyz;
}
`

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform highp sampler3D officeLightMap;
uniform vec3 officeLightOrigin;
uniform vec3 officeLightSize;
uniform vec3 officeLightCell;
uniform float officeLightMax;
varying vec3 vOfficeWorld;

/** The baked light on a surface at p facing n (world space): a + b·n, read half a cell out. */
float officeIrradiance( vec3 p, vec3 n ) {
    vec3 uvw = ( p + n * officeLightCell * 0.5 - officeLightOrigin ) / officeLightSize;
    vec3 edge = min( uvw, 1.0 - uvw );
    float inside = step( 0.0, min( edge.x, min( edge.y, edge.z ) ) );
    vec4 t = texture( officeLightMap, uvw );
    float a = t.r * t.r * officeLightMax;
    vec3 b = ( t.gba * 2.0 - 1.0 ) * 2.0 * a;
    return mix( 1.0, max( a + dot( b, n ), a * 0.15 ), inside );
}
`

const FRAGMENT_APPLY = /* glsl */ `
irradiance *= officeIrradiance( vOfficeWorld, inverseTransformDirection( normal, viewMatrix ) );
`

export class OfficeLighting {
    readonly texture: Data3DTexture
    private readonly uniforms
    private readonly patched = new WeakSet<Material>()

    constructor(readonly light: OfficeLight) {
        const [nx, ny, nz] = light.size
        this.texture = new Data3DTexture(light.data, nx, ny, nz)
        this.texture.format = RGBAFormat
        this.texture.type = UnsignedByteType
        this.texture.minFilter = this.texture.magFilter = LinearFilter
        this.texture.unpackAlignment = 1
        this.texture.needsUpdate = true
        this.uniforms = {
            officeLightMap: { value: this.texture },
            officeLightOrigin: { value: new Vector3(...light.origin) },
            officeLightSize: { value: new Vector3(nx * light.cell[0], ny * light.cell[1], nz * light.cell[2]) },
            officeLightCell: { value: new Vector3(...light.cell) },
            officeLightMax: { value: light.max },
        }
    }

    /** Lights `material` by the bake (lit materials only; once each). */
    patch(material: Material): void {
        const lit = material as Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean }
        if (!(lit.isMeshStandardMaterial || lit.isMeshLambertMaterial) || this.patched.has(material)) return
        this.patched.add(material)
        const before = material.onBeforeCompile.bind(material)
        const key = material.customProgramCacheKey.bind(material)
        material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
            before(shader, renderer)
            Object.assign(shader.uniforms, this.uniforms)
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
                .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_POSITION}`)
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
                .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${FRAGMENT_APPLY}`)
        }
        material.customProgramCacheKey = () => `${key()}|officeLight`
        material.needsUpdate = true
    }

    /** Every lit material under `root`. */
    patchAll(root: Object3D): void {
        root.traverse(o => {
            const material = (o as Object3D & { material?: Material | Material[] }).material
            for (const m of [material ?? []].flat()) this.patch(m)
        })
    }

    /** The light at a point (facing up by default), as the shader reads it: 1 is a lit open floor. */
    at(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0): number {
        return irradianceAt(this.light, x, y, z, nx, ny, nz)
    }
}
