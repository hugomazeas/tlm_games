import * as THREE from 'three'
import { MINI_TURBO, SUPER_TURBO } from '../drive/kart.ts'
import type { Weather } from '../drive/weather.ts'
import type { DriveWorld, Surface } from '../drive/world.ts'

/**
 * What karts throw about: dust off the grass (powder on snow, spray in the
 * rain), drift smoke and sparks the colour of the charge, black skid marks,
 * water splashes, sparks off a wall, a puff of dust on landing, a burst and a
 * trail of fire when a boost kicks in, exhaust puffs pulling away; speed lines
 * at the edge of the screen near top speed, and confetti when you finish.
 *
 * Particles live in two fixed pools (soft smoke, glowing sparks) moved on the
 * CPU and drawn as points: one draw call each, however many karts. Low quality
 * keeps fewer alive at once.
 */

/** What a kart's effects need to know about it, this frame. */
export interface KartMotion {
    x: number
    y: number
    z: number
    heading: number
    /** Forward speed, m/s (negative backing up). */
    speed: number
    vy: number
    drift: number
    charge: number
    boosting: boolean
    /** A nitro just fired and still holding the speed (your own kart only: the lobby doesn't send it). */
    surging?: boolean
    airborne: boolean
}

export interface KartEffects {
    update(motion: KartMotion, dt: number): void
}

export interface Effects {
    /** One per kart on the map: it remembers what the kart was doing a frame ago. */
    forKart(): KartEffects
    setWeather(weather: Weather): void
    setQuality(quality: 'high' | 'low'): void
    /** Speed lines for your own kart, 0 to none. */
    speedLines(speed: number, boosting: boolean): void
    confetti(x: number, y: number, z: number): void
    /** Snacks: a pop when one is eaten, a Coke's fizz, Bubly's bubbles, a sparkle (a few particles each call). */
    burst(x: number, y: number, z: number, style: 'pop' | 'fizz' | 'bubbles' | 'sparkle'): void
    update(dt: number, camera: THREE.PerspectiveCamera): void
}

export const SPARK_COLOURS = { charging: 0xfff6d5, mini: 0x4fa8ff, super: 0xff8a1f }
const POOL = 3000
const ALIVE_CAP = { high: 3000, low: 800 }
const SKID_QUADS = 2400
const SKID_WIDTH = 0.28
/** A wall stops you this much in one frame, m/s: sparks. */
const KNOCK = 4
/** Speed lines start here (about 125 km/h) and are full by top speed. */
const LINES_FROM = 34.5
const LINES_FULL = 41.5
const DUST = { grass: 0x9c8f66, snow: 0xf4f7fb }
const CONFETTI = [0xff4d4d, 0xffd22e, 0x3ddc84, 0x4fa8ff, 0xc77dff, 0xff8a1f]

interface Spawn {
    x: number
    y: number
    z: number
    vx?: number
    vy?: number
    vz?: number
    life: number
    size: number
    /** Size at the end of its life (smoke grows, sparks shrink). */
    grow?: number
    colour: number
    alpha: number
    gravity?: number
    drag?: number
    square?: boolean
}

export function createEffects(
    scene: THREE.Scene,
    world: DriveWorld,
    renderer: THREE.WebGLRenderer,
    overlay: HTMLElement
): Effects {
    const smoke = createPool(THREE.NormalBlending)
    const glow = createPool(THREE.AdditiveBlending)
    scene.add(smoke.points, glow.points)
    const skids = createSkids(world)
    scene.add(skids.mesh)
    const lines = createSpeedLines(overlay)
    let weather: Weather = 'clear'
    let cap = ALIVE_CAP.high
    const size = new THREE.Vector2()

    const puff = (spawn: Spawn) => smoke.spawn(spawn, cap)
    const spark = (spawn: Spawn) => glow.spawn(spawn, cap)
    const jitter = (amount: number) => (Math.random() - 0.5) * 2 * amount

    return {
        forKart() {
            let lastSpeed = 0
            let lastX = 0
            let lastZ = 0
            let wasAirborne = false
            let wasBoosting = false
            let wasWet = false
            const owed = new Map<string, number>()
            const trails: Array<THREE.Vector3 | null> = [null, null]

            /** How many to emit this frame at `rate` a second, carrying the fractions over. */
            const due = (key: string, rate: number, dt: number) => {
                const total = (owed.get(key) ?? 0) + rate * dt
                const whole = Math.floor(total)
                owed.set(key, total - whole)
                return whole
            }

            return {
                update(m, dt) {
                    const fx = -Math.sin(m.heading)
                    const fz = -Math.cos(m.heading)
                    const rx = Math.cos(m.heading)
                    const rz = -Math.sin(m.heading)
                    const fast = Math.min(1, Math.abs(m.speed) / 30)
                    const surface: Surface = world.surface(m.x, m.z)
                    const touching = !m.airborne
                    const rear = [-1, 1].map(side => ({
                        x: m.x - fx * 0.85 + rx * side * 0.85,
                        y: m.y + 0.12,
                        z: m.z - fz * 0.85 + rz * side * 0.85,
                    }))
                    const atRear = (i: number) => rear[i % 2]!
                    // Thrown back from the wheels, a little up and sideways.
                    const kick = (back: number, up: number) => ({
                        vx: -fx * back + jitter(1.2),
                        vy: up * (0.5 + Math.random()),
                        vz: -fz * back + jitter(1.2),
                    })

                    if (touching && surface === 'offroad' && Math.abs(m.speed) > 4) {
                        const colour = weather === 'snow' ? DUST.snow : DUST.grass
                        for (let i = 0, n = due('dust', 45 * fast, dt); i < n; i++) {
                            puff({
                                ...atRear(i),
                                ...kick(m.speed * 0.15, 1.6),
                                life: 0.9,
                                size: 0.6,
                                grow: 2.4,
                                colour,
                                alpha: 0.5,
                                drag: 2,
                            })
                        }
                    }
                    if (touching && surface === 'road' && weather !== 'clear' && Math.abs(m.speed) > 12) {
                        const colour = weather === 'snow' ? DUST.snow : 0xcfd8e2
                        for (let i = 0, n = due('spray', 40 * fast, dt); i < n; i++) {
                            puff({
                                ...atRear(i),
                                ...kick(m.speed * 0.25, 1),
                                life: 0.6,
                                size: 0.4,
                                grow: 2.2,
                                colour,
                                alpha: 0.28,
                                drag: 2.5,
                            })
                        }
                    }

                    if (touching && m.drift !== 0) {
                        for (let i = 0, n = due('smoke', 30, dt); i < n; i++) {
                            puff({
                                ...atRear(i),
                                ...kick(2, 0.8),
                                life: 1,
                                size: 0.4,
                                grow: 1.8,
                                colour: 0xe9e9e9,
                                alpha: 0.32,
                                drag: 1.6,
                                gravity: -0.6,
                            })
                        }
                        const charged = m.charge >= SUPER_TURBO ? 'super' : m.charge >= MINI_TURBO ? 'mini' : 'charging'
                        for (let i = 0, n = due('sparks', 70, dt); i < n; i++) {
                            spark({
                                ...atRear(i),
                                ...kick(3, 2.5),
                                life: 0.28,
                                size: 0.22,
                                grow: 0.05,
                                colour: SPARK_COLOURS[charged],
                                alpha: 1,
                                gravity: 9,
                            })
                        }
                        rear.forEach((wheel, i) => {
                            const at = new THREE.Vector3(wheel.x, 0, wheel.z)
                            if (trails[i]) skids.add(trails[i]!, at)
                            trails[i] = at
                        })
                    } else {
                        trails[0] = trails[1] = null
                    }

                    const wet = touching && surface === 'water'
                    if (wet && Math.abs(m.speed) > 1.5) {
                        const burst = wasWet ? 0 : 30
                        for (let i = 0, n = due('splash', 70 * Math.max(0.3, fast), dt) + burst; i < n; i++) {
                            spark({
                                ...atRear(i),
                                vx: jitter(2.5),
                                vy: 3 + Math.random() * 3,
                                vz: jitter(2.5),
                                life: 0.7,
                                size: 0.22,
                                colour: 0xa9cfe8,
                                alpha: 0.5,
                                gravity: 9.8,
                            })
                            if (i % 3 === 0)
                                puff({
                                    ...atRear(i),
                                    ...kick(1, 1),
                                    life: 0.8,
                                    size: 0.5,
                                    grow: 2,
                                    colour: 0xeef6ff,
                                    alpha: 0.4,
                                    drag: 2,
                                })
                        }
                    }
                    wasWet = wet

                    // A landing raises dust all round.
                    if (wasAirborne && touching && Math.abs(m.speed) > 6) {
                        for (let i = 0; i < 24; i++) {
                            const angle = (i / 24) * Math.PI * 2
                            puff({
                                x: m.x,
                                y: m.y + 0.1,
                                z: m.z,
                                vx: Math.cos(angle) * 4,
                                vy: 0.6,
                                vz: Math.sin(angle) * 4,
                                life: 0.9,
                                size: 0.6,
                                grow: 2.2,
                                colour: weather === 'snow' ? DUST.snow : 0xc9bda3,
                                alpha: 0.45,
                                drag: 3,
                            })
                        }
                    }
                    wasAirborne = m.airborne

                    const exhaust = { x: m.x - fx * 1.55, y: m.y + 0.62, z: m.z - fz * 1.55 }
                    // A drift or pad boost burns orange; the nitro burns blue.
                    const fired = m.boosting || m.surging === true
                    const blue = m.surging === true && !m.boosting
                    if (fired) {
                        const burst = wasBoosting ? 0 : 36
                        for (let i = 0; i < burst; i++) {
                            const angle = (i / burst) * Math.PI * 2
                            spark({
                                ...exhaust,
                                vx: Math.cos(angle) * 6 - fx * 3,
                                vy: Math.sin(angle) * 3,
                                vz: Math.sin(angle) * 6 - fz * 3,
                                life: 0.35,
                                size: 0.4,
                                grow: 0.1,
                                colour: blue ? 0x67e8f9 : 0xffc04d,
                                alpha: 1,
                                drag: 3,
                            })
                        }
                        for (let i = 0, n = due('fire', 90, dt); i < n; i++) {
                            spark({
                                ...exhaust,
                                vx: -fx * 8 + jitter(0.8),
                                vy: jitter(0.6),
                                vz: -fz * 8 + jitter(0.8),
                                life: 0.22,
                                size: 0.55,
                                grow: 0.1,
                                colour: blue ? (i % 3 ? 0x22d3ee : 0xe0f2fe) : i % 3 ? 0xff8a1f : 0xffe08a,
                                alpha: 0.9,
                                drag: 4,
                            })
                        }
                    } else if (touching && m.speed > 0.5 && m.speed < 15 && m.speed > lastSpeed) {
                        for (let i = 0, n = due('exhaust', 8, dt); i < n; i++) {
                            puff({
                                ...exhaust,
                                vx: -fx * 1.5,
                                vy: 0.6,
                                vz: -fz * 1.5,
                                life: 0.8,
                                size: 0.2,
                                grow: 0.9,
                                colour: 0x9aa0a6,
                                alpha: 0.3,
                                drag: 1.5,
                                gravity: -0.4,
                            })
                        }
                    }
                    wasBoosting = fired

                    // Off a wall: speed gone in a frame that no brake can take (and not R putting you back).
                    const jumped = Math.hypot(m.x - lastX, m.z - lastZ) > 5
                    if (touching && !jumped && lastSpeed - Math.abs(m.speed) > KNOCK) {
                        const front = { x: m.x + fx * 1.9, y: m.y + 0.4, z: m.z + fz * 1.9 }
                        for (let i = 0; i < 26; i++) {
                            spark({
                                ...front,
                                vx: jitter(6),
                                vy: 1 + Math.random() * 4,
                                vz: jitter(6),
                                life: 0.4,
                                size: 0.18,
                                grow: 0.04,
                                colour: 0xffd36b,
                                alpha: 1,
                                gravity: 9,
                            })
                        }
                    }
                    lastSpeed = Math.abs(m.speed)
                    lastX = m.x
                    lastZ = m.z
                },
            }
        },

        setWeather(next) {
            weather = next
            skids.setColour(next === 'snow' ? 0x56606c : 0x15171a)
        },

        setQuality(quality) {
            cap = ALIVE_CAP[quality]
        },

        speedLines(speed, boosting) {
            const strength = THREE.MathUtils.clamp((speed - LINES_FROM) / (LINES_FULL - LINES_FROM), 0, 1)
            lines.draw(Math.min(1, strength + (boosting ? 0.6 : 0)))
        },

        burst(x, y, z, style) {
            const around = () => ({ x: x + jitter(0.8), y: y + jitter(0.4), z: z + jitter(0.8) })
            if (style === 'pop') {
                for (let i = 0; i < 24; i++) {
                    const angle = (i / 24) * Math.PI * 2
                    spark({
                        x,
                        y,
                        z,
                        vx: Math.cos(angle) * 5,
                        vy: 2 + Math.random() * 3,
                        vz: Math.sin(angle) * 5,
                        life: 0.5,
                        size: 0.3,
                        grow: 0.05,
                        colour: CONFETTI[i % CONFETTI.length]!,
                        alpha: 1,
                        gravity: 6,
                        drag: 2,
                    })
                }
            } else if (style === 'fizz') {
                for (let i = 0; i < 3; i++)
                    puff({
                        ...around(),
                        vx: jitter(1),
                        vy: 2 + Math.random() * 2,
                        vz: jitter(1),
                        life: 0.7,
                        size: 0.2,
                        grow: 0.5,
                        colour: 0x7c4a1e,
                        alpha: 0.6,
                        gravity: 3,
                    })
            } else if (style === 'bubbles') {
                for (let i = 0; i < 2; i++)
                    puff({
                        ...around(),
                        vx: jitter(0.4),
                        vy: 1 + Math.random(),
                        vz: jitter(0.4),
                        life: 1.4,
                        size: 0.25,
                        grow: 0.45,
                        colour: 0xbae6fd,
                        alpha: 0.5,
                        gravity: -0.5,
                        drag: 1,
                    })
            } else {
                for (let i = 0; i < 2; i++)
                    spark({
                        ...around(),
                        vy: 1.5,
                        life: 0.5,
                        size: 0.2,
                        grow: 0.02,
                        colour: 0xfef08a,
                        alpha: 1,
                        drag: 2,
                    })
            }
        },

        confetti(x, y, z) {
            for (let i = 0; i < 260; i++) {
                const angle = Math.random() * Math.PI * 2
                const out = 1 + Math.random() * 5
                smoke.spawn(
                    {
                        x,
                        y: y + 2,
                        z,
                        vx: Math.cos(angle) * out,
                        vy: 6 + Math.random() * 6,
                        vz: Math.sin(angle) * out,
                        life: 2.5 + Math.random() * 1.5,
                        size: 0.22,
                        colour: CONFETTI[i % CONFETTI.length]!,
                        alpha: 1,
                        gravity: 4,
                        drag: 1.2,
                        square: true,
                    },
                    POOL
                )
            }
        },

        update(dt, camera) {
            renderer.getDrawingBufferSize(size)
            // Pixels a metre-wide particle covers one metre from the lens.
            const pixels = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
            smoke.update(dt, pixels)
            glow.update(dt, pixels)
        },
    }
}

/** A fixed pool of particles moved on the CPU, drawn as one set of points; dead ones are size 0. */
function createPool(blending: THREE.Blending) {
    const position = new Float32Array(POOL * 3)
    const velocity = new Float32Array(POOL * 3)
    const tint = new Float32Array(POOL * 4)
    const sizes = new Float32Array(POOL)
    const shape = new Float32Array(POOL)
    const life = new Float32Array(POOL)
    const lifetime = new Float32Array(POOL)
    const from = new Float32Array(POOL)
    const to = new Float32Array(POOL)
    const alpha = new Float32Array(POOL)
    const gravity = new Float32Array(POOL)
    const drag = new Float32Array(POOL)
    let next = 0
    let alive = 0

    const geometry = new THREE.BufferGeometry()
    const positionAttribute = new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage)
    const tintAttribute = new THREE.BufferAttribute(tint, 4).setUsage(THREE.DynamicDrawUsage)
    const sizeAttribute = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage)
    const shapeAttribute = new THREE.BufferAttribute(shape, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttribute)
    geometry.setAttribute('tint', tintAttribute)
    geometry.setAttribute('size', sizeAttribute)
    geometry.setAttribute('shape', shapeAttribute)
    const material = new THREE.ShaderMaterial({
        uniforms: { pixels: { value: 500 } },
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    const colour = new THREE.Color()

    return {
        points,

        spawn(s: Spawn, cap: number) {
            if (alive >= cap) return
            const i = next
            next = (next + 1) % POOL
            if (life[i]! <= 0) alive += 1
            position.set([s.x, s.y, s.z], i * 3)
            velocity.set([s.vx ?? 0, s.vy ?? 0, s.vz ?? 0], i * 3)
            colour.setHex(s.colour)
            tint.set([colour.r, colour.g, colour.b, s.alpha], i * 4)
            life[i] = lifetime[i] = s.life
            from[i] = s.size
            to[i] = s.grow ?? s.size
            alpha[i] = s.alpha
            gravity[i] = s.gravity ?? 0
            drag[i] = s.drag ?? 0
            shape[i] = s.square ? 1 : 0
        },

        update(dt: number, pixels: number) {
            material.uniforms.pixels!.value = pixels
            if (alive === 0) return
            alive = 0
            for (let i = 0; i < POOL; i++) {
                if (life[i]! <= 0) {
                    sizes[i] = 0
                    continue
                }
                life[i]! -= dt
                if (life[i]! <= 0) {
                    sizes[i] = 0
                    continue
                }
                alive += 1
                const keep = Math.exp(-drag[i]! * dt)
                const v = i * 3
                velocity[v]! *= keep
                velocity[v + 1] = velocity[v + 1]! * keep - gravity[i]! * dt
                velocity[v + 2]! *= keep
                position[v]! += velocity[v]! * dt
                position[v + 1]! += velocity[v + 1]! * dt
                position[v + 2]! += velocity[v + 2]! * dt
                const age = 1 - life[i]! / lifetime[i]!
                sizes[i] = from[i]! + (to[i]! - from[i]!) * age
                // Fade out over the last two thirds.
                tint[i * 4 + 3] = alpha[i]! * Math.min(1, (1 - age) * 1.5)
            }
            positionAttribute.needsUpdate = true
            tintAttribute.needsUpdate = true
            sizeAttribute.needsUpdate = true
            shapeAttribute.needsUpdate = true
        },
    }
}

/** Black tyre marks: a ring of quads on the ground, the oldest overwritten first. */
function createSkids(world: DriveWorld) {
    const position = new Float32Array(SKID_QUADS * 4 * 3)
    const index: number[] = []
    for (let q = 0; q < SKID_QUADS; q++) {
        const v = q * 4
        index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3)
    }
    const geometry = new THREE.BufferGeometry()
    const attribute = new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', attribute)
    geometry.setIndex(index)
    const material = new THREE.MeshBasicMaterial({
        color: 0x15171a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    let next = 0

    return {
        mesh,
        add(a: THREE.Vector3, b: THREE.Vector3) {
            const dx = b.x - a.x
            const dz = b.z - a.z
            const length = Math.hypot(dx, dz)
            // Longer than a slow frame at boost speed is a jump or a reset, not a skid.
            if (length < 0.05 || length > 10) return
            const sx = (-dz / length) * (SKID_WIDTH / 2)
            const sz = (dx / length) * (SKID_WIDTH / 2)
            const corners = [
                [a.x + sx, a.z + sz],
                [a.x - sx, a.z - sz],
                [b.x + sx, b.z + sz],
                [b.x - sx, b.z - sz],
            ]
            corners.forEach(([x, z], k) => position.set([x!, world.ground(x!, z!) + 0.03, z!], (next * 4 + k) * 3))
            next = (next + 1) % SKID_QUADS
            attribute.needsUpdate = true
        },
        setColour(colour: number) {
            material.color.setHex(colour)
        },
    }
}

/** White streaks rushing out from the middle of the screen, drawn on a canvas over the 3D view. */
function createSpeedLines(overlay: HTMLElement) {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none;'
    overlay.querySelector('canvas.race-view')?.after(canvas)
    const context = canvas.getContext('2d')!
    let drawn = false

    return {
        draw(strength: number) {
            if (strength <= 0.02) {
                if (drawn) context.clearRect(0, 0, canvas.width, canvas.height)
                drawn = false
                return
            }
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth
                canvas.height = window.innerHeight
            }
            const { width, height } = canvas
            const reach = Math.hypot(width, height) / 2
            context.clearRect(0, 0, width, height)
            context.strokeStyle = `rgba(255, 255, 255, ${0.35 * strength})`
            context.lineCap = 'round'
            for (let i = 0; i < 28 + strength * 30; i++) {
                const angle = Math.random() * Math.PI * 2
                const start = reach * (0.55 + Math.random() * 0.3)
                const length = reach * (0.08 + Math.random() * 0.2) * strength
                context.lineWidth = 1 + Math.random() * 2
                context.beginPath()
                context.moveTo(width / 2 + Math.cos(angle) * start, height / 2 + Math.sin(angle) * start)
                context.lineTo(
                    width / 2 + Math.cos(angle) * (start + length),
                    height / 2 + Math.sin(angle) * (start + length)
                )
                context.stroke()
            }
            drawn = true
        },
    }
}

const PARTICLE_VERTEX = `
attribute vec4 tint;
attribute float size;
attribute float shape;
uniform float pixels;
varying vec4 vTint;
varying float vShape;
void main() {
    vTint = tint;
    vShape = shape;
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * view;
    gl_PointSize = size * pixels / max( -view.z, 0.5 );
}
`

const PARTICLE_FRAGMENT = `
varying vec4 vTint;
varying float vShape;
void main() {
    float d = length( gl_PointCoord - 0.5 );
    // Soft round puffs; confetti is a flat square.
    float alpha = vShape > 0.5 ? 1.0 : 1.0 - smoothstep( 0.15, 0.5, d );
    if ( vTint.a * alpha < 0.01 ) discard;
    gl_FragColor = vec4( vTint.rgb, vTint.a * alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`
