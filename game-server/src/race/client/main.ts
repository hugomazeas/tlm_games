import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gridSlot } from '../drive/laps.ts'
import { buildWorld } from '../drive/world.ts'
import { heightAt } from '../map/convert.ts'
import { type GateSpec, projectCourse } from '../map/courses.ts'
import type { AreaKind, Building, Course, RaceMap } from '../map/format.ts'
import { createDriver } from './drive.ts'
import type { KartLook } from './kart.ts'
import { createMinimap } from './minimap.ts'
import { createOverlay } from './overlay.ts'
import { createRace } from './race.ts'
import { buildFurniture } from './furniture.ts'
import { identifyByRanges, setupIdentify } from './identify.ts'
import { buildWalls } from './walls.ts'
import { buildLandmarks } from './landmarks.ts'
import { ASPHALT, buildStreets } from './streets.ts'

/**
 * Draws a racing map and lets you drive a kart round it (drive.ts), or fly:
 * F switches. Flying, click to capture the mouse, WASD to move, Space / C to
 * rise and sink, Shift to go faster, the wheel to change speed.
 *
 * Two pages load it. The Hub's play page sets `window.racingConfig` with the
 * map's URL and the track to race (race.ts), and you start on its grid. The
 * standalone viewer (poc-server.ts) sets nothing: free roam, and a link with
 * a view in it (#lat,lon,…) opens flying there, for landmark work.
 */

/** What the Hub's play page tells the game. */
interface RacingConfig {
    mapUrl: string
    track: { id: number; name: string; laps: number; gates: GateSpec[] } | null
    /** Where "← Tracks" goes. */
    backUrl?: string
    /** Who's driving, in their garage colours; a guest when nobody is picked. */
    driver?: KartLook
}

const SKY = 0xbfd9ee
const GROUND = '#d9d4c7'
const AREA_COLOURS: Record<AreaKind, string> = {
    park: '#a7cf8f',
    wood: '#6f9f5c',
    water: '#7fb8dc',
    parking: '#c4c1bb',
}
const PATH_COLOUR = '#e9e2d0'
const WALL_COLOURS = [0xd8cfc0, 0xc9b9a3, 0xb7a58e, 0xa9746a, 0x9b6455, 0xcfc9c2, 0xb9bec4, 0xe2d9c6]
/** The ground texture is at most this many pixels on its long side. */
const MAX_TEXTURE = 4096
/** The camera never goes lower than this above the ground. */
const EYE_HEIGHT = 2
const BASE_SPEED = 40
const LANDMARK = { name: 'Hôtel du Parlement', lat: 46.80868, lon: -71.2142 }

const KMH = 3.6
const HELP = {
    drive: 'W/S gas · brake · A/D steer · Space or Shift drift (let go for a boost) · R reset · F fly · I identify building',
    fly: 'Click to look around · WASD move · Space / C up / down · Shift faster · wheel speed · F drive · I identify building · Esc release mouse',
}

const config = (window as { racingConfig?: RacingConfig }).racingConfig ?? null
const overlay = createOverlay()
const { hud, status, help } = overlay
if (config?.backUrl) {
    overlay.back.href = config.backUrl
    overlay.back.hidden = false
}

const map = (await (await fetch(config?.mapUrl ?? './map.json')).json()) as RaceMap
const ground = (x: number, z: number) => heightAt(map.terrain, map.width, map.depth, x, z)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.domElement.classList.add('race-view')
overlay.root.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(SKY)
scene.fog = new THREE.Fog(SKY, 400, 3000)
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6))
const sun = new THREE.DirectionalLight(0xfff4e0, 1.8)
sun.position.set(-0.6, 1, 0.35)
scene.add(sun)

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 8000)

scene.add(buildTerrain(map))
scene.add(buildWater(map))
const buildings = buildBuildings(map)
const landmarks = buildLandmarks(map.buildings)
scene.add(buildings)
scene.add(landmarks)
scene.add(buildStreets(map, ground))
scene.add(buildFurniture(map, ground))
scene.add(buildWalls(map.walls, ground))

const controls = flyControls(camera, renderer.domElement)
const world = buildWorld(map)
const driver = createDriver(world, scene, camera, config?.driver)
let mode: 'drive' | 'fly' = 'fly'
const course: Course | null = config?.track
    ? projectCourse(`track-${config.track.id}`, config.track, ({ lat, lon }) => {
          const { x, z } = toLocal(lat, lon)
          return [x, z]
      })
    : null
const race = createRace({
    world,
    scene,
    driver,
    course,
    here: () => {
        if (mode === 'drive') return driver.kart
        const angles = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
        return { x: camera.position.x, z: camera.position.z, heading: angles.y }
    },
    startDriving: () => {
        if (mode === 'fly') flyToDrive()
    },
    roads: map.roads,
    minimap: createMinimap(map, overlay.minimap),
    panel: overlay.panel,
    banner: overlay.banner,
    standingsPanel: overlay.standings,
    arrow: overlay.arrow,
    speedometer: overlay.speedometer,
})
setupIdentify(camera, [buildings, landmarks], overlay.identify, renderer.domElement)

// On a track, start on its grid. Otherwise fly to the view in the URL, or drive in front of the Parliament.
if (config || !applyViewFromHash()) {
    if (course) {
        const slot = gridSlot(course, 0)
        driver.place(slot.x, slot.z, slot.heading)
    } else {
        const target = toLocal(LANDMARK.lat, LANDMARK.lon)
        driver.placeAt(target.x - 120, target.z, Math.PI / 2)
    }
    setMode('drive')
} else {
    setMode('fly')
}
document.addEventListener('keydown', event => {
    if (event.code !== 'KeyF' || event.repeat) return
    if (mode === 'fly') {
        flyToDrive()
    } else {
        controls.syncFromCamera()
        setMode('fly')
    }
})
// Read the hash from the event: by the time it runs, the timer below may already have rewritten the URL.
window.addEventListener('hashchange', event => {
    if (!config && applyViewFromHash(new URL(event.newURL).hash)) setMode('fly')
})

// Keep the view in the URL, so a refresh (or a link) lands on the same spot. Latitude/longitude,
// not map metres: a link stays good when the map's area changes. Only in the viewer: a track page has its own URL.
setInterval(() => {
    if (config) return
    if (mode === 'drive') {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search)
        return
    }
    const p = camera.position
    const angles = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    const { lat, lon } = toLatLon(p.x, p.z)
    const hash = [
        lat.toFixed(6),
        lon.toFixed(6),
        (p.y - ground(p.x, p.z)).toFixed(0),
        THREE.MathUtils.radToDeg(angles.y).toFixed(0),
        THREE.MathUtils.radToDeg(angles.x).toFixed(0),
    ].join(',')
    if (location.hash !== `#${hash}`) history.replaceState(null, '', `#${hash}`)
}, 500)

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

status.textContent = `${map.buildings.length} buildings · ${map.roads.length} roads`

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1)
    if (mode === 'drive') {
        driver.update(dt)
        const kart = driver.kart
        const speed = Math.hypot(kart.vx, kart.vz) * KMH
        hud.textContent =
            `${speed.toFixed(0).padStart(3)} km/h  ${kart.surface}` +
            (kart.drift !== 0 ? `  drift ${kart.charge.toFixed(1)} s` : '') +
            (kart.boost > 0 ? '  BOOST' : '') +
            (kart.airborne && kart.y - ground(kart.x, kart.z) > 0.5 ? '  airborne' : '')
    } else {
        controls.update(dt, ground)
        const p = camera.position
        hud.textContent =
            `x ${p.x.toFixed(0)}  z ${p.z.toFixed(0)}  ` +
            `alt ${(p.y - ground(p.x, p.z)).toFixed(0)} m  speed ${controls.speed.toFixed(0)} m/s`
    }
    race.update(mode === 'drive')
    renderer.render(scene, camera)
})

/** Lands on the road under where you're looking from, heading the way the camera faces. */
function flyToDrive(): void {
    const angles = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    driver.placeAt(camera.position.x, camera.position.z, angles.y)
    setMode('drive')
}

function setMode(next: 'drive' | 'fly'): void {
    mode = next
    driver.setActive(next === 'drive')
    controls.setActive(next === 'fly')
    help.textContent = HELP[next]
}

/** Moves the camera to the view in the URL (#lat,lon,altitude,heading,pitch, in degrees). False when there is none. */
function applyViewFromHash(hash = location.hash): boolean {
    const view = hash.slice(1).split(',').map(Number)
    if (view.length !== 5 || !view.every(Number.isFinite)) return false

    const [lat, lon, altitude, heading, pitch] = view as [number, number, number, number, number]
    const { x, z } = toLocal(lat, lon)
    // Old links were in map metres (#1491,-839,…): read as latitude/longitude they land far off the
    // map, leaving nothing but sky. Anything outside the map is ignored.
    if (Math.abs(x) > map.width / 2 || Math.abs(z) > map.depth / 2) return false
    camera.position.set(x, ground(x, z) + altitude, z)
    camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(heading), 0, 'YXZ')
    controls.syncFromCamera()

    return true
}

/** A map position's latitude and longitude, undoing toLocal. */
function toLatLon(x: number, z: number): { lat: number; lon: number } {
    const metresPerDegreeLat = 111_320
    const metresPerDegreeLon = metresPerDegreeLat * Math.cos((map.origin.lat * Math.PI) / 180)

    return { lat: map.origin.lat - z / metresPerDegreeLat, lon: map.origin.lon + x / metresPerDegreeLon }
}

/** Metres around the map's centre for a latitude and longitude, as the build script projects them. */
function toLocal(lat: number, lon: number): { x: number; z: number } {
    const metresPerDegreeLat = 111_320
    const metresPerDegreeLon = metresPerDegreeLat * Math.cos((map.origin.lat * Math.PI) / 180)

    return { x: (lon - map.origin.lon) * metresPerDegreeLon, z: -(lat - map.origin.lat) * metresPerDegreeLat }
}

/**
 * The ground: a mesh lifted from the elevation grid, wearing one big texture
 * with the parks, water and roads painted on, so they follow every slope.
 */
function buildTerrain(map: RaceMap): THREE.Mesh {
    const { cols, rows, cell, heights } = map.terrain
    const sizeX = (cols - 1) * cell
    const sizeZ = (rows - 1) * cell

    const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, cols - 1, rows - 1)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(-map.width / 2 + sizeX / 2, 0, -map.depth / 2 + sizeZ / 2)
    const position = geometry.attributes.position!
    for (let i = 0; i < position.count; i++) position.setY(i, heights[i]!)
    geometry.computeVertexNormals()

    const texture = new THREE.CanvasTexture(paintGround(map, sizeX, sizeZ))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture }))
}

function paintGround(map: RaceMap, sizeX: number, sizeZ: number): HTMLCanvasElement {
    const scale = Math.min(1.5, MAX_TEXTURE / Math.max(sizeX, sizeZ))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sizeX * scale)
    canvas.height = Math.round(sizeZ * scale)
    const context = canvas.getContext('2d')!

    context.fillStyle = GROUND
    context.fillRect(0, 0, canvas.width, canvas.height)
    // Map metres to pixels: the canvas's top-left corner is the map's north-west corner.
    context.setTransform(scale, 0, 0, scale, (map.width / 2) * scale, (map.depth / 2) * scale)

    for (const area of map.areas) {
        context.fillStyle = AREA_COLOURS[area.kind]
        context.beginPath()
        tracePath(context, area.outline)
        context.closePath()
        context.fill()
    }

    // Footpaths only exist here. Streets are geometry, but are painted underneath too, so no ground shows through a seam.
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const road of map.roads) {
        if (road.kind === 'sidewalk') continue
        context.strokeStyle = road.kind === 'path' ? PATH_COLOUR : ASPHALT
        context.lineWidth = road.width
        context.beginPath()
        tracePath(context, road.points)
        context.stroke()
    }

    return canvas
}

function tracePath(context: CanvasRenderingContext2D, flat: number[]): void {
    for (let i = 0; i < flat.length; i += 2) {
        if (i === 0) context.moveTo(flat[i]!, flat[i + 1]!)
        else context.lineTo(flat[i]!, flat[i + 1]!)
    }
}

/** A flat sheet at the water line: wherever the terrain dips under it, that's the river. */
function buildWater(map: RaceMap): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(map.width, map.depth)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, map.terrain.waterLevel, 0)

    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: AREA_COLOURS.water }))
}

/**
 * Every footprint extruded to its height and merged into a single mesh: one
 * draw call for the whole city. Roofs are tinted a little darker than walls.
 */
function buildBuildings(map: RaceMap): THREE.Mesh {
    const geometries: THREE.BufferGeometry[] = []
    const owners: Building[] = []
    const firstVertices: number[] = []
    let vertices = 0
    const wall = new THREE.Color()
    const roof = new THREE.Color()

    for (const building of map.buildings) {
        // Landmarks with hand-made detail are drawn by landmarks.ts.
        if (building.detail) continue
        const shape = new THREE.Shape(toVectors(building.outline))
        for (const hole of building.holes ?? []) shape.holes.push(new THREE.Path(toVectors(hole)))

        const geometry = new THREE.ExtrudeGeometry(shape, { depth: building.top - building.base, bevelEnabled: false })
        // The shape is drawn in (x, -z) and extruded along +z; tip it so the extrusion points up.
        geometry.rotateX(-Math.PI / 2)
        geometry.translate(0, building.base, 0)

        if (building.colour) wall.set(building.colour)
        else wall.setHex(WALL_COLOURS[building.id % WALL_COLOURS.length]!)
        roof.copy(wall).multiplyScalar(0.72)
        const normals = geometry.attributes.normal!
        const colours = new Float32Array(normals.count * 3)
        for (let i = 0; i < normals.count; i++) {
            const colour = normals.getY(i) > 0.5 ? roof : wall
            colours.set([colour.r, colour.g, colour.b], i * 3)
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
        geometries.push(geometry)
        owners.push(building)
        firstVertices.push(vertices)
        vertices += normals.count
    }

    const merged = mergeGeometries(geometries)
    for (const geometry of geometries) geometry.dispose()

    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }))
    mesh.userData.identify = identifyByRanges(owners, firstVertices)

    return mesh
}

function toVectors(flat: number[]): THREE.Vector2[] {
    const points: THREE.Vector2[] = []
    for (let i = 0; i < flat.length; i += 2) points.push(new THREE.Vector2(flat[i]!, -flat[i + 1]!))

    return points
}

/** Mouse-look fly camera with WASD, held above the ground. */
function flyControls(camera: THREE.PerspectiveCamera, element: HTMLElement) {
    const keys = new Set<string>()
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    let speed = BASE_SPEED

    let active = true

    element.addEventListener('click', () => {
        if (active) element.requestPointerLock()
    })
    document.addEventListener('mousemove', event => {
        if (document.pointerLockElement !== element) return
        euler.y -= event.movementX * 0.0022
        euler.x = THREE.MathUtils.clamp(euler.x - event.movementY * 0.0022, -1.5, 1.5)
        camera.quaternion.setFromEuler(euler)
    })
    document.addEventListener('keydown', event => {
        if (active) keys.add(event.code)
    })
    document.addEventListener('keyup', event => keys.delete(event.code))
    window.addEventListener('blur', () => keys.clear())
    element.addEventListener('wheel', event => {
        speed = THREE.MathUtils.clamp(speed * (event.deltaY < 0 ? 1.2 : 1 / 1.2), 5, 400)
    })

    return {
        get speed() {
            return speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1)
        },

        setActive(isActive: boolean) {
            active = isActive
            keys.clear()
            if (!isActive && document.pointerLockElement === element) document.exitPointerLock()
        },

        syncFromCamera() {
            euler.setFromQuaternion(camera.quaternion, 'YXZ')
        },

        update(dt: number, groundAt: (x: number, z: number) => number) {
            // W/S follow where you look, pitch included, so you can dive and climb.
            camera.getWorldDirection(forward)
            right.crossVectors(forward, camera.up).normalize()

            const step = this.speed * dt
            if (keys.has('KeyW')) camera.position.addScaledVector(forward, step)
            if (keys.has('KeyS')) camera.position.addScaledVector(forward, -step)
            if (keys.has('KeyD')) camera.position.addScaledVector(right, step)
            if (keys.has('KeyA')) camera.position.addScaledVector(right, -step)
            if (keys.has('Space')) camera.position.y += step
            if (keys.has('KeyC')) camera.position.y -= step

            const floor = groundAt(camera.position.x, camera.position.z) + EYE_HEIGHT
            if (camera.position.y < floor) camera.position.y = floor
        },
    }
}
