import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { Sky, TimeOfDay } from '../drive/weather.ts'
import { setKartEnvironment } from './kart.ts'
import { WINDOWS_LIT } from './landmarks.ts'

/**
 * The light and the air a race runs in: a sky dome with the sun (or the
 * moon and stars), the sun's light and its shadows over the whole map, fog the
 * colour of the horizon, rain or snow falling around the camera, lit windows
 * and a lamp on your kart at night. On High quality, also bloom and a colour
 * grade; Low turns the shadows, the bloom and most of the precipitation off,
 * for slow laptops. The choice is remembered in the browser.
 */

export type Quality = 'high' | 'low'

export interface Atmosphere {
    readonly quality: Quality
    setSky(sky: Sky): void
    setQuality(quality: Quality): void
    /** Lets `object`'s meshes cast and/or receive the sun's shadows. */
    shade(object: THREE.Object3D, options: { cast: boolean; receive: boolean }): void
    /** Follows the camera (sky, rain) and what it looks at (`focus`: your kart's lamp at night). */
    update(dt: number, focus: THREE.Vector3): void
    render(): void
    resize(width: number, height: number): void
}

interface Light {
    /** Sun (or moon) height above the horizon and compass bearing, in degrees (0 north, 90 east). */
    elevation: number
    bearing: number
    sun: number
    sunIntensity: number
    skyLight: number
    groundLight: number
    ambient: number
    top: number
    horizon: number
    fog: number
    /** How big the sun's disc and its halo are; 0 hides them (the moon is a small one). */
    disc: number
    halo: number
    stars: number
    exposure: number
}

const TIMES: Record<TimeOfDay, Light> = {
    morning: {
        elevation: 20,
        bearing: 110,
        sun: 0xffe0b5,
        sunIntensity: 2.4,
        skyLight: 0xbfd8f2,
        groundLight: 0x8c7f68,
        ambient: 0.95,
        top: 0x4d8ed8,
        horizon: 0xf1dcc3,
        fog: 0xdfe0dc,
        disc: 1,
        halo: 1,
        stars: 0,
        exposure: 0.95,
    },
    noon: {
        elevation: 58,
        bearing: 200,
        sun: 0xfff5e6,
        sunIntensity: 2.6,
        skyLight: 0xcfe6ff,
        groundLight: 0x8a8170,
        ambient: 0.95,
        top: 0x2a78dc,
        horizon: 0xb9dbf6,
        fog: 0xc2dcf2,
        disc: 1,
        halo: 0.6,
        stars: 0,
        exposure: 0.95,
    },
    sunset: {
        elevation: 6,
        bearing: 255,
        sun: 0xff9a52,
        sunIntensity: 2.6,
        skyLight: 0xe7b5a6,
        groundLight: 0x5a4a52,
        ambient: 0.9,
        top: 0x34508f,
        horizon: 0xff9d68,
        fog: 0xe0a184,
        disc: 1.4,
        halo: 1.6,
        stars: 0,
        exposure: 1.05,
    },
    night: {
        elevation: 38,
        bearing: 150,
        sun: 0x9db3ff,
        sunIntensity: 0.55,
        skyLight: 0x34497c,
        groundLight: 0x12161f,
        ambient: 0.55,
        top: 0x040917,
        horizon: 0x1b2747,
        fog: 0x131b30,
        disc: 0.35,
        halo: 0.4,
        stars: 1,
        exposure: 1.15,
    },
}

/** Overcast: the colours rain and snow wash the sky towards, by day and at night. */
const OVERCAST = {
    rain: { day: 0x8b96a2, night: 0x161b24, sun: 0.3, fogNear: 120, fogFar: 1100 },
    snow: { day: 0xc9d0d8, night: 0x252c3a, sun: 0.4, fogNear: 60, fogFar: 650 },
}
const CLEAR_FOG = { near: 400, far: 3000 }

const SETTINGS: Record<Quality, { shadows: boolean; bloom: boolean; drops: number; pixelRatio: number }> = {
    high: { shadows: true, bloom: true, drops: 9000, pixelRatio: 2 },
    low: { shadows: false, bloom: false, drops: 2500, pixelRatio: 1 },
}
/**
 * One shadow map over the whole map, drawn once per sky (nothing that casts
 * one moves: the karts have their own blob, kart.ts), so it costs nothing a
 * frame and doesn't depend on where you are. About a metre a texel.
 */
const SHADOW_MAP = 4096
/** What casts shadows stands between these heights, in metres. */
const SHADOW_HEIGHTS = [-20, 280]
/** Rain and snow fall in a box this big around the camera. */
const PRECIPITATION_BOX = new THREE.Vector3(90, 40, 90)
const SKY_RADIUS = 5000
const QUALITY_KEY = 'racing.quality'

export function createAtmosphere(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    /** The map's size in metres, centred on 0, 0: what the shadow map covers. */
    extent: { width: number; depth: number }
): Atmosphere {
    let quality: Quality = localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high'
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false

    const hemisphere = new THREE.HemisphereLight()
    const sun = new THREE.DirectionalLight()
    const mapSize = Math.min(SHADOW_MAP, renderer.capabilities.maxTextureSize)
    sun.shadow.mapSize.set(mapSize, mapSize)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 1.2
    sun.shadow.radius = 2
    scene.add(hemisphere, sun, sun.target)
    const toSun = new THREE.Vector3()

    /** Points the sun at the map's centre and fits its shadow camera tightly around the whole map, then redraws it. */
    const fitShadow = () => {
        const shadowCamera = sun.shadow.camera
        sun.target.position.set(0, 0, 0)
        sun.position.copy(toSun).multiplyScalar(4000)
        shadowCamera.position.copy(sun.position)
        shadowCamera.lookAt(sun.target.position)
        shadowCamera.updateMatrixWorld()
        const box = new THREE.Box3()
        for (const x of [-extent.width / 2, extent.width / 2]) {
            for (const z of [-extent.depth / 2, extent.depth / 2]) {
                for (const y of SHADOW_HEIGHTS) {
                    box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(shadowCamera.matrixWorldInverse))
                }
            }
        }
        // The camera looks down its −z: near and far are the box's depths, flipped.
        Object.assign(shadowCamera, {
            left: box.min.x,
            right: box.max.x,
            bottom: box.min.y,
            top: box.max.y,
            near: -box.max.z - 10,
            far: -box.min.z + 10,
        })
        shadowCamera.updateProjectionMatrix()
        renderer.shadowMap.needsUpdate = true
    }

    // A warm lamp over your kart at night, so the road ahead isn't black.
    const lamp = new THREE.PointLight(0xffe2b0, 0, 45, 1.6)
    scene.add(lamp)

    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            top: { value: new THREE.Color() },
            horizon: { value: new THREE.Color() },
            sunDirection: { value: toSun },
            sunColour: { value: new THREE.Color() },
            disc: { value: 1 },
            halo: { value: 1 },
            stars: { value: 0 },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
    })
    // What the karts' paint and chrome reflect: this sky, rendered once into a reflection map whenever it changes.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const reflection = new THREE.Scene()
    reflection.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial))
    let reflected: THREE.WebGLRenderTarget | null = null
    const reflectSky = () => {
        const next = pmrem.fromScene(reflection, 0, 0.1, 200)
        setKartEnvironment(next.texture)
        reflected?.dispose()
        reflected = next
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), skyMaterial)
    dome.frustumCulled = false
    dome.renderOrder = -1
    scene.add(dome)
    scene.background = null
    scene.fog = new THREE.Fog(0xffffff, CLEAR_FOG.near, CLEAR_FOG.far)

    const precipitation = buildPrecipitation()
    scene.add(precipitation.points)

    const size = new THREE.Vector2()
    renderer.getSize(size)
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(size.clone(), 0.35, 0.5, 0.9)
    composer.addPass(bloom)
    const grade = new ShaderPass(GRADE)
    composer.addPass(grade)
    composer.addPass(new OutputPass())

    let night = false
    let weather: Sky['weather'] = 'clear'
    const clock = { t: 0 }

    const applyQuality = () => {
        const settings = SETTINGS[quality]
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio))
        composer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio))
        renderer.getSize(size)
        composer.setSize(size.x, size.y)
        renderer.shadowMap.enabled = settings.shadows
        renderer.shadowMap.needsUpdate = true
        sun.castShadow = settings.shadows
        precipitation.setCount(settings.drops)
        // Shadows on or off change every lit material's shader.
        scene.traverse(object => {
            const material = (object as THREE.Mesh).material
            if (!material) return
            for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true
        })
    }

    const atmosphere: Atmosphere = {
        get quality() {
            return quality
        },

        setSky(sky) {
            const light = TIMES[sky.time]
            night = sky.time === 'night'
            weather = sky.weather
            const overcast = sky.weather === 'clear' ? null : OVERCAST[sky.weather]
            const cloud = new THREE.Color(overcast ? (night ? overcast.night : overcast.day) : 0)
            const wash = (hex: number, amount: number) =>
                overcast ? new THREE.Color(hex).lerp(cloud, amount) : new THREE.Color(hex)

            const elevation = THREE.MathUtils.degToRad(light.elevation)
            const bearing = THREE.MathUtils.degToRad(light.bearing)
            // Map axes: x east, z south.
            toSun.set(
                Math.sin(bearing) * Math.cos(elevation),
                Math.sin(elevation),
                -Math.cos(bearing) * Math.cos(elevation)
            )
            fitShadow()

            sun.color.set(light.sun)
            sun.intensity = light.sunIntensity * (overcast?.sun ?? 1)
            hemisphere.color.copy(wash(light.skyLight, 0.6))
            hemisphere.groundColor.set(light.groundLight)
            hemisphere.intensity = light.ambient * (overcast ? 1.15 : 1)

            const uniforms = skyMaterial.uniforms
            uniforms.top!.value.copy(wash(light.top, 0.85))
            uniforms.horizon!.value.copy(wash(light.horizon, 0.85))
            uniforms.sunColour!.value.set(light.sun)
            uniforms.disc!.value = overcast ? 0 : light.disc
            uniforms.halo!.value = overcast ? light.halo * 0.3 : light.halo
            uniforms.stars!.value = overcast ? 0 : light.stars
            reflectSky()

            const fog = scene.fog as THREE.Fog
            fog.color.copy(wash(light.fog, 0.9))
            fog.near = overcast?.fogNear ?? CLEAR_FOG.near
            fog.far = overcast?.fogFar ?? CLEAR_FOG.far

            renderer.toneMappingExposure = light.exposure
            WINDOWS_LIT.value = night ? 1 : sky.weather === 'clear' ? 0 : 0.25
            lamp.intensity = night ? 40 : 0
            precipitation.setKind(sky.weather)
        },

        setQuality(next) {
            quality = next
            localStorage.setItem(QUALITY_KEY, next)
            applyQuality()
        },

        shade(object, { cast, receive }) {
            object.traverse(child => {
                if (!(child as THREE.Mesh).isMesh) return
                child.castShadow = cast
                child.receiveShadow = receive
            })
        },

        update(dt, focus) {
            clock.t += dt
            dome.position.copy(camera.position)
            lamp.position.set(focus.x, focus.y + 6, focus.z)
            precipitation.update(clock.t, camera.position)
            precipitation.points.visible = weather !== 'clear'
        },

        render() {
            if (SETTINGS[quality].bloom) {
                bloom.strength = night ? 0.7 : 0.3
                composer.render()
            } else {
                renderer.render(scene, camera)
            }
        },

        resize(width, height) {
            renderer.setSize(width, height)
            composer.setSize(width, height)
        },
    }
    applyQuality()

    return atmosphere
}

/** Rain or snow: points falling through a box that travels with the camera, moved in the shader. */
function buildPrecipitation() {
    const MAX = SETTINGS.high.drops
    const seeds = new Float32Array(MAX * 3)
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
    geometry.setDrawRange(0, MAX)

    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            centre: { value: new THREE.Vector3() },
            box: { value: PRECIPITATION_BOX },
            fall: { value: 0 },
            sway: { value: 0 },
            size: { value: 0 },
            snow: { value: 0 },
            colour: { value: new THREE.Color() },
        },
        vertexShader: PRECIPITATION_VERTEX,
        fragmentShader: PRECIPITATION_FRAGMENT,
        transparent: true,
        depthWrite: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    points.visible = false
    const u = material.uniforms

    return {
        points,
        setCount(count: number) {
            geometry.setDrawRange(0, count)
        },
        setKind(kind: Sky['weather']) {
            u.fall!.value = kind === 'rain' ? 22 : 2.2
            u.sway!.value = kind === 'rain' ? 0.2 : 1.2
            u.size!.value = kind === 'rain' ? 8 : 2.2
            u.snow!.value = kind === 'snow' ? 1 : 0
            u.colour!.value.set(kind === 'rain' ? 0xb8c6d6 : 0xffffff)
        },
        update(time: number, centre: THREE.Vector3) {
            u.time!.value = time
            u.centre!.value.copy(centre)
        },
    }
}

const SKY_VERTEX = `
varying vec3 vDirection;
void main() {
    vDirection = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = clip.xyww;
}
`

const SKY_FRAGMENT = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDirection;
uniform vec3 sunColour;
uniform float disc;
uniform float halo;
uniform float stars;
varying vec3 vDirection;

float starHash( vec3 p ) {
    return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
}

void main() {
    vec3 d = normalize( vDirection );
    float up = max( d.y, 0.0 );
    vec3 colour = mix( horizon, top, pow( up, 0.55 ) );
    // Below the horizon (seen past the map's edge), the horizon colour, a little darker.
    colour = d.y < 0.0 ? horizon * 0.85 : colour;

    float towardSun = max( dot( d, normalize( sunDirection ) ), 0.0 );
    colour += sunColour * ( smoothstep( 0.9994, 0.9997, towardSun ) * 12.0 * disc + pow( towardSun, 10.0 ) * 0.45 * halo );
    // The horizon glows on the sun's side.
    colour += sunColour * pow( towardSun, 3.0 ) * pow( 1.0 - up, 6.0 ) * 0.35 * halo;

    if ( stars > 0.0 ) {
        vec3 cell = floor( d * 420.0 );
        float star = step( 0.9975, starHash( cell ) ) * ( 0.5 + 0.5 * starHash( cell + 3.0 ) );
        colour += vec3( star * stars * smoothstep( 0.0, 0.25, up ) * 1.5 );
    }

    gl_FragColor = vec4( colour, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

const PRECIPITATION_VERTEX = `
uniform float time;
uniform vec3 centre;
uniform vec3 box;
uniform float fall;
uniform float sway;
uniform float size;
void main() {
    vec3 p = position * box;
    p.y -= time * fall * ( 0.8 + 0.4 * position.x );
    p.x += sin( time * 0.9 + position.y * 40.0 ) * sway;
    p.z += cos( time * 0.7 + position.z * 40.0 ) * sway;
    // Wrap into the box around the camera, so it always rains where you are.
    vec3 corner = centre - box * 0.5;
    vec3 world = corner + mod( p - corner, box );
    vec4 view = viewMatrix * vec4( world, 1.0 );
    gl_Position = projectionMatrix * view;
    // Not too big right in front of the lens, where a flake would fill half the screen.
    gl_PointSize = min( size * 30.0 / max( -view.z, 1.0 ), size * 4.0 );
}
`

const PRECIPITATION_FRAGMENT = `
uniform float snow;
uniform vec3 colour;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    // Snow: a soft round flake. Rain: a thin streak down the middle of the point.
    float flake = 1.0 - smoothstep( 0.2, 0.5, length( c ) );
    float streak = ( 1.0 - smoothstep( 0.02, 0.07, abs( c.x ) ) ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( c.y ) ) );
    float alpha = mix( streak * 0.55, flake * 0.9, snow );
    if ( alpha < 0.02 ) discard;
    gl_FragColor = vec4( colour, alpha );
}
`

/** A light colour grade: a touch more saturation and contrast, and a soft vignette. Runs before tone mapping. */
const GRADE = {
    uniforms: { tDiffuse: { value: null }, saturation: { value: 1.18 }, vignette: { value: 0.28 } },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float saturation;
        uniform float vignette;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D( tDiffuse, vUv );
            float grey = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
            vec3 colour = max( mix( vec3( grey ), texel.rgb, saturation ), 0.0 );
            float edge = length( vUv - 0.5 ) * 1.4;
            colour *= 1.0 - vignette * smoothstep( 0.4, 1.0, edge );
            gl_FragColor = vec4( colour, texel.a );
        }
    `,
}
