import * as THREE from 'three'
import type { RaceMap } from '../map/format.ts'
import type { HeightAt } from './strips.ts'

/**
 * Trees, traffic lights, stop signs, benches and bus shelters. Each part is
 * one instanced mesh: thousands of trees cost two draw calls.
 */

interface Placement {
    x: number
    z: number
    /** Height above the ground. */
    y?: number
    /** Turn about the vertical axis, in radians. */
    turn: number
    scale: number | [number, number, number]
}

const ARM_HEIGHT = 5.8
const HEAD_HEIGHT = 5.1
const LAMPS = [
    { colour: 0xff3b30, drop: 0.4 },
    { colour: 0xffb020, drop: 0 },
    { colour: 0x34c759, drop: -0.4 },
]
const SIGN_HEIGHT = 2.3
/** A stop sign stands this far beyond the kerb. */
const SIGN_SETBACK = 0.8

export function buildFurniture(map: RaceMap, heightAt: HeightAt): THREE.Group {
    const { props } = map
    const group = new THREE.Group()
    const flat = (colour: number) => new THREE.MeshLambertMaterial({ color: colour, flatShading: true })
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, placements: Placement[]) => {
        group.add(instanced(geometry, material, placements, heightAt))
    }

    // Trees vary in size and turn by their place in the list, so the same map always looks the same.
    const trees = pairs(props.trees).map(([x, z], i) => ({ x, z, turn: i * 2.39, scale: 0.75 + ((i * 37) % 10) / 15 }))
    add(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 6).translate(0, 1.3, 0), flat(0x6b4f3a), trees)
    add(new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.2, 0), flat(0x4f8f46), trees)

    addTrafficLights(add, flat, groups(props.signals, 5))
    addStopSigns(add, flat, groups(map.stops, 5))

    const benches = pairs(props.benches).map(([x, z], i) => ({ x, z, turn: i * 1.7, scale: 1 }))
    add(new THREE.BoxGeometry(1.8, 0.45, 0.6).translate(0, 0.45, 0), flat(0x7a5a3c), benches)

    const shelters = groups(props.busStops, 3).map(([x, z, angle]) => ({ x: x!, z: z!, turn: -angle!, scale: 1 }))
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.55 })
    add(new THREE.BoxGeometry(3.5, 2.4, 1.3).translate(0, 1.2, 0), glass, shelters)

    return group
}

type Add = (geometry: THREE.BufferGeometry, material: THREE.Material, placements: Placement[]) => void

/**
 * A pole at the kerb with a mast arm over the road, the signal head hanging
 * from its end, lit red, amber and green on both faces for traffic coming
 * either way.
 */
function addTrafficLights(add: Add, flat: (colour: number) => THREE.Material, signals: number[][]): void {
    const poles: Placement[] = []
    const arms: Placement[] = []
    const heads: Placement[] = []
    const lamps = LAMPS.map(() => [] as Placement[])

    for (const [x, z, dx, dz, reach] of signals) {
        // Turning local +x onto (dx, dz).
        const turn = Math.atan2(-dz!, dx!)
        const endX = x! + dx! * reach!
        const endZ = z! + dz! * reach!
        poles.push({ x: x!, z: z!, turn: 0, scale: 1 })
        arms.push({ x: x!, z: z!, turn, scale: [reach!, 1, 1] })
        heads.push({ x: endX, z: endZ, y: HEAD_HEIGHT, turn, scale: 1 })
        // The faces look along the road: square to the arm.
        for (const face of [1, -1]) {
            LAMPS.forEach((lamp, i) => {
                lamps[i]!.push({
                    x: endX - dz! * 0.24 * face,
                    z: endZ + dx! * 0.24 * face,
                    y: HEAD_HEIGHT + lamp.drop,
                    turn: 0,
                    scale: 1,
                })
            })
        }
    }

    add(new THREE.CylinderGeometry(0.12, 0.14, 6, 6).translate(0, 3, 0), flat(0x3a3d42), poles)
    add(new THREE.BoxGeometry(1, 0.16, 0.16).translate(0.5, ARM_HEIGHT, 0), flat(0x3a3d42), arms)
    add(new THREE.BoxGeometry(0.42, 1.25, 0.42), flat(0x1f2124), heads)
    LAMPS.forEach((lamp, i) => {
        add(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: lamp.colour }), lamps[i]!)
    })
}

/** A red octagon on a post, at the right-hand kerb, facing the traffic coming in towards the junction. */
function addStopSigns(add: Add, flat: (colour: number) => THREE.Material, stops: number[][]): void {
    const signs: Placement[] = []

    for (const [x, z, dx, dz, width] of stops) {
        // (-dz, dx) is the right of traffic heading along (dx, dz).
        const offset = width! / 2 + SIGN_SETBACK
        // Turning the sign's face (local +z) to look back down the road at the traffic.
        signs.push({ x: x! - dz! * offset, z: z! + dx! * offset, turn: Math.atan2(-dx!, -dz!), scale: 1 })
    }

    const octagon = (radius: number, depth: number, back: number) =>
        new THREE.CylinderGeometry(radius, radius, depth, 8)
            .rotateY(Math.PI / 8)
            .rotateX(Math.PI / 2)
            .translate(0, SIGN_HEIGHT, back)
    add(
        new THREE.CylinderGeometry(0.05, 0.05, SIGN_HEIGHT, 6).translate(0, SIGN_HEIGHT / 2, -0.05),
        flat(0x9aa0a6),
        signs
    )
    add(octagon(0.42, 0.03, -0.02), flat(0xffffff), signs)
    add(octagon(0.37, 0.04, 0), flat(0xc8102e), signs)
}

function instanced(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    placements: Placement[],
    heightAt: HeightAt
): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length)
    const dummy = new THREE.Object3D()

    placements.forEach((placement, i) => {
        dummy.position.set(placement.x, heightAt(placement.x, placement.z) + (placement.y ?? 0), placement.z)
        dummy.rotation.set(0, placement.turn, 0)
        if (typeof placement.scale === 'number') dummy.scale.setScalar(placement.scale)
        else dummy.scale.set(...placement.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true

    return mesh
}

function pairs(flat: number[]): [number, number][] {
    return groups(flat, 2) as [number, number][]
}

/** A flat list cut into runs of `size`. */
function groups(flat: number[], size: number): number[][] {
    const out: number[][] = []
    for (let i = 0; i + size - 1 < flat.length; i += size) out.push(flat.slice(i, i + size))

    return out
}
