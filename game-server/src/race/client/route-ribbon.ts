import * as THREE from 'three'
import { pointAt, type Route } from '../drive/route.ts'

/**
 * The race's way round, painted on the streets: a glowing ribbon along the
 * route (the same one the minimap and the HUD arrow follow), lying on the
 * ground. The stretch from your kart to your next checkpoint is lit up, and
 * soft pulses run along it the way you're going: you can see where the road
 * takes you without any signs.
 */

export interface RouteRibbon {
    mesh: THREE.Mesh
    /** Lights the route from `from` to `to` (distances along it, wrapping); `from === to` lights none. */
    update(time: number, from: number, to: number): void
}

/** A point every this many metres, this wide, this far over the road. */
const STEP = 2
const WIDTH = 2.2
const LIFT = 0.1
/** The pulses: one every this many metres, moving this fast (m/s). */
const PULSE = { spacing: 16, speed: 18 }
const COLOUR = 0x22d3ee
const NEXT_COLOUR = 0xfde047

export function buildRouteRibbon(route: Route, ground: (x: number, z: number) => number): RouteRibbon {
    const count = Math.max(2, Math.ceil(route.length / STEP) + 1)
    const positions = new Float32Array(count * 2 * 3)
    const along = new Float32Array(count * 2)
    const side = new Float32Array(count * 2)
    const index: number[] = []
    for (let i = 0; i < count; i++) {
        const s = Math.min(route.length, i * STEP)
        const { x, z, heading } = pointAt(route, s)
        // To the right of the way round: (cos h, −sin h).
        const rx = Math.cos(heading) * (WIDTH / 2)
        const rz = -Math.sin(heading) * (WIDTH / 2)
        for (const [k, sign] of [
            [0, -1],
            [1, 1],
        ] as const) {
            const px = x + rx * sign
            const pz = z + rz * sign
            positions.set([px, ground(px, pz) + LIFT, pz], (i * 2 + k) * 3)
            along[i * 2 + k] = s
            side[i * 2 + k] = sign
        }
        if (i > 0) {
            const a = (i - 1) * 2
            index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
        }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('along', new THREE.BufferAttribute(along, 1))
    geometry.setAttribute('side', new THREE.BufferAttribute(side, 1))
    geometry.setIndex(index)

    const uniforms = {
        time: { value: 0 },
        from: { value: 0 },
        to: { value: 0 },
        length: { value: route.length },
        colour: { value: new THREE.Color(COLOUR) },
        nextColour: { value: new THREE.Color(NEXT_COLOUR) },
        spacing: { value: PULSE.spacing },
        speed: { value: PULSE.speed },
    }
    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 1

    return {
        mesh,
        update(time, from, to) {
            uniforms.time.value = time
            uniforms.from.value = from
            uniforms.to.value = to
        },
    }
}

const VERTEX = `
attribute float along;
attribute float side;
varying float vAlong;
varying float vSide;
void main() {
    vAlong = along;
    vSide = side;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const FRAGMENT = `
uniform float time;
uniform float from;
uniform float to;
uniform float length;
uniform vec3 colour;
uniform vec3 nextColour;
uniform float spacing;
uniform float speed;
varying float vAlong;
varying float vSide;
void main() {
    // Soft edges across the ribbon.
    float edge = 1.0 - smoothstep( 0.55, 1.0, abs( vSide ) );
    // On the stretch to your next checkpoint (wrapping round the lap)?
    float ahead = mod( vAlong - from, length );
    float stretch = mod( to - from, length );
    float next = stretch > 0.5 && ahead <= stretch ? 1.0 : 0.0;
    // Pulses running forward along the route.
    float wave = fract( ( vAlong - time * speed ) / spacing );
    float pulse = smoothstep( 0.0, 0.15, wave ) * ( 1.0 - smoothstep( 0.15, 0.5, wave ) );
    vec3 tint = mix( colour, nextColour, next );
    float alpha = edge * mix( 0.1 + 0.16 * pulse, 0.28 + 0.4 * pulse, next );
    gl_FragColor = vec4( tint * ( 1.0 + pulse * next * 0.8 ), alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`
