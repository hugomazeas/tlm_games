/**
 * Surface finishes for small hand-held things (the guns, the gloves, the troopers): detail made
 * in the shader from the part's own coordinates (no textures to load or upload), on top of a
 * standard material. Brushed metal, a parkerized mottle, stippled polymer, fabric, chipped paint;
 * and worn edges, read off each face's UVs (the outer pixels of a face catch light where the
 * finish has rubbed through). Detail finer than a pixel fades out instead of sparkling.
 *
 * Costs a few noise lookups a pixel on the parts that use it (the gun is a small share of the
 * screen); nothing per frame on the CPU.
 */

import type { Material, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'

export type Finish =
    /** Bare machined metal: fine streaks along the gun's length, bright edges. */
    | 'metal'
    /** Black phosphate / anodized: a matte mottle, edges worn to grey metal. */
    | 'parkerized'
    /** Moulded plastic: a fine stipple, edges a little lighter and shinier. */
    | 'polymer'
    /** Grips, pads, boots: a coarse stipple, no wear. */
    | 'rubber'
    /** Gloves, sleeves, suits: a woven mottle. */
    | 'cloth'
    /** Painted parts: smooth, chipped to dark metal at the edges. */
    | 'paint'
    /** Polished (chrome, brass): only smudges in the gloss. */
    | 'polished'

/** Every material has `defines` at run time; the types only give it to shader materials. */
type Defined = Material & { defines?: Record<string, unknown> }

const KIND: Record<Finish, number> = { metal: 0, parkerized: 1, polymer: 2, rubber: 3, cloth: 4, paint: 5, polished: 6 }

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vFinishPos;
varying vec2 vFinishUv;
`

const VERTEX_SET = /* glsl */ `
vFinishPos = position * FINISH_SCALE;
vFinishUv = uv;
`

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec3 vFinishPos;
varying vec2 vFinishUv;

float finishHash( vec3 p ) {
    p = fract( p * 0.3183099 + 0.1 );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float finishNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
        mix( mix( finishHash( i ), finishHash( i + vec3( 1, 0, 0 ) ), f.x ),
             mix( finishHash( i + vec3( 0, 1, 0 ) ), finishHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
        mix( mix( finishHash( i + vec3( 0, 0, 1 ) ), finishHash( i + vec3( 1, 0, 1 ) ), f.x ),
             mix( finishHash( i + vec3( 0, 1, 1 ) ), finishHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
        f.z );
}
/** 1 where noise at this frequency is still bigger than a pixel, fading to 0 as it gets finer. */
float finishVisible( vec3 q ) {
    return 1.0 - smoothstep( 0.35, 0.9, length( fwidth( q ) ) );
}
/** 1 on a face's outermost pixels (its UV edges), 0 inside. */
float finishEdge() {
    vec2 d = min( vFinishUv, 1.0 - vFinishUv ) / max( fwidth( vFinishUv ), vec2( 1e-5 ) );
    // Rubbed through in places, not all along (an even line would read as an outline).
    float rubbed = smoothstep( 0.2, 0.45, finishNoise( vFinishPos * 160.0 + 3.0 ) );
    return ( 1.0 - smoothstep( 0.6, 2.2, min( d.x, d.y ) ) ) * rubbed;
}
/** three's bump: the normal tilted by the height's change (m) across the pixel. */
vec3 finishBump( vec3 surfPos, vec3 n, vec2 dHdxy, float faceDir ) {
    vec3 vSigmaX = dFdx( surfPos );
    vec3 vSigmaY = dFdy( surfPos );
    vec3 R1 = cross( vSigmaY, n );
    vec3 R2 = cross( n, vSigmaX );
    float fDet = dot( vSigmaX, R1 ) * faceDir;
    vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
    return normalize( abs( fDet ) * n - vGrad );
}
`

/** After the colour: the finish's tone, and its worn edges. Sets finishWear, finishFine, finishBroad. */
const FRAGMENT_COLOR = /* glsl */ `
vec3 finishP = vFinishPos;
float finishBroad = finishNoise( finishP * 18.0 );
float finishFine = 0.5;
float finishWear = 0.0;
float finishBumpH = 0.0;
float finishBumpK = 0.0;
#if FINISH_KIND == 0
    vec3 q = finishP * vec3( 900.0, 900.0, 25.0 );
    finishFine = mix( 0.5, finishNoise( q ), finishVisible( q ) );
    finishWear = finishEdge();
    diffuseColor.rgb *= 0.9 + 0.2 * finishFine + 0.08 * finishBroad;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55, 0.57, 0.6 ), finishWear * 0.4 );
#elif FINISH_KIND == 1
    vec3 q = finishP * 520.0;
    finishFine = mix( 0.5, finishNoise( q ), finishVisible( q ) );
    float chips = step( 0.42, finishNoise( finishP * 260.0 ) );
    finishWear = finishEdge() * chips;
    diffuseColor.rgb *= 0.85 + 0.25 * finishFine + 0.15 * finishBroad;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.33, 0.35 ), finishWear * 0.6 );
#elif FINISH_KIND == 2 || FINISH_KIND == 3
    vec3 q = finishP * ( FINISH_KIND == 2 ? 1300.0 : 800.0 );
    float seen = finishVisible( q );
    finishFine = mix( 0.5, finishNoise( q ), seen );
    finishBumpH = finishFine;
    finishBumpK = seen * ( FINISH_KIND == 2 ? 0.00012 : 0.00025 ) / FINISH_SCALE;
    #if FINISH_KIND == 2
        finishWear = finishEdge();
        diffuseColor.rgb *= 1.0 + finishWear * 0.45;
    #endif
    diffuseColor.rgb *= 0.92 + 0.12 * finishBroad;
#elif FINISH_KIND == 4
    vec3 q = finishP * vec3( 700.0, 1100.0, 700.0 );
    float seen = finishVisible( q );
    finishFine = mix( 0.5, finishNoise( q ), seen );
    finishBumpH = finishFine;
    finishBumpK = seen * 0.0002 / FINISH_SCALE;
    diffuseColor.rgb *= 0.88 + 0.16 * finishFine + 0.12 * finishBroad;
#elif FINISH_KIND == 5
    float chips = step( 0.5, finishNoise( finishP * 220.0 ) );
    finishWear = finishEdge() * chips;
    diffuseColor.rgb *= 0.95 + 0.1 * finishBroad;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.18, 0.19, 0.2 ), finishWear * 0.85 );
#else
    diffuseColor.rgb *= 0.97 + 0.06 * finishBroad;
#endif
`

/** After the roughness: streaks, mottles and smudges in the gloss; worn edges polished. */
const FRAGMENT_ROUGHNESS = /* glsl */ `
float finishSmudge = smoothstep( 0.35, 0.75, finishNoise( vFinishPos * 45.0 + 7.0 ) );
roughnessFactor *= 0.8 + 0.4 * finishFine + 0.25 * ( finishSmudge - 0.5 );
#if FINISH_KIND == 0 || FINISH_KIND == 1
    roughnessFactor = mix( roughnessFactor, 0.28, finishWear );
#elif FINISH_KIND == 2
    roughnessFactor *= 1.0 - finishWear * 0.3;
#elif FINISH_KIND == 5
    roughnessFactor = mix( roughnessFactor, 0.4, finishWear );
#endif
roughnessFactor = clamp( roughnessFactor, 0.04, 1.0 );
`

/** After the metalness: what the paint or the phosphate wore off is bare metal. */
const FRAGMENT_METALNESS = /* glsl */ `
#if FINISH_KIND == 1 || FINISH_KIND == 5
    metalnessFactor = mix( metalnessFactor, 0.9, finishWear );
#endif
`

/** After the normal: the stipple or the weave, as a bump. */
const FRAGMENT_NORMAL = /* glsl */ `
if ( finishBumpK > 0.0 ) {
    vec2 finishD = vec2( dFdx( finishBumpH ), dFdy( finishBumpH ) ) * finishBumpK;
    normal = finishBump( - vViewPosition, normal, finishD, faceDirection );
}
`

/**
 * Gives `material` a finish. `scale`: how the part's coordinates relate to metres (1 for the
 * guns, which are modelled at full size). Once per material.
 */
export function applyFinish(material: MeshStandardMaterial, finish: Finish, scale = 1): void {
    const before = material.onBeforeCompile.bind(material)
    const key = material.customProgramCacheKey.bind(material)
    const defined = material as Defined
    defined.defines = { ...defined.defines, FINISH_KIND: KIND[finish], FINISH_SCALE: scale.toFixed(4) }
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
        before(shader, renderer)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_SET}`)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
            .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGHNESS}`)
            .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FRAGMENT_METALNESS}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`)
    }
    material.customProgramCacheKey = () => `${key()}|finish${KIND[finish]}`
    material.needsUpdate = true
}

/** The finish a material was given (for tests), or null. */
export function finishOf(material: Material): Finish | null {
    const kind = (material as Defined).defines?.FINISH_KIND
    return (Object.keys(KIND) as Finish[]).find(name => KIND[name] === kind) ?? null
}
