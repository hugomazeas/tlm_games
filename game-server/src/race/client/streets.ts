import * as THREE from 'three'
import type { RaceMap, Road, Sides } from '../map/format.ts'
import {
    addDisc,
    addRect,
    addStrip,
    Builder,
    type Column,
    type HeightAt,
    JunctionIndex,
    resample,
    rightNormals,
    type Sample,
    spans,
} from './strips.ts'

/**
 * The streets as geometry, laid on the terrain: asphalt, lane lines, raised
 * sidewalks with kerbs, bike lanes and zebra crossings. Each kind is one
 * mesh, so the whole street network is a handful of draw calls.
 */

export const ASPHALT = '#4b4e55'
const COLOURS = {
    asphalt: ASPHALT,
    white: '#f1f1ee',
    yellow: '#e8c547',
    bike: '#4f8a5b',
    sidewalk: '#bdb9b0',
}

/** Heights above the ground. Each layer sits clear of the one under it so they never flicker. */
const LIFT = { road: 0.06, bike: 0.09, line: 0.11, crossing: 0.11, kerb: 0.2, buried: -0.3 }
/** Sample spacing along a road: close enough to follow the ground over a crest, and for dashes to land right. */
const STEP = 2
/** Sidewalks have five faces across; half as many samples along keeps them from dominating the triangle count. */
const SIDEWALK_STEP = 4
const LINE_WIDTH = 0.15
const DASH = { on: 4, period: 10 }
const SIDEWALK_WIDTH = 2
const BIKE_LANE_WIDTH = 1.5
/** How deep a stop line is, along the road. */
const STOP_LINE = 0.5
/** Zebra bars: how wide each is, the gap between them, and how long they run along the road. */
const ZEBRA = { bar: 0.5, gap: 0.6, depth: 3 }

export function buildStreets(map: RaceMap, heightAt: HeightAt): THREE.Group {
    const layers = {
        asphalt: new Builder(),
        white: new Builder(),
        yellow: new Builder(),
        bike: new Builder(),
        sidewalk: new Builder(),
    }
    const junctions = new JunctionIndex(map.junctions)
    const clearOfJunctions = (sample: Sample) => !junctions.contains(sample.x, sample.z)

    for (const road of map.roads) {
        if (road.kind === 'path') continue
        const coarse = resample(road.points, SIDEWALK_STEP)
        if (coarse.length < 2) continue
        const coarseNormals = rightNormals(coarse)

        if (road.kind === 'sidewalk') {
            addStrip(layers.sidewalk, coarse, coarseNormals, slab(-road.width / 2, road.width / 2), heightAt)
            continue
        }

        const samples = resample(road.points, STEP)
        const normals = rightNormals(samples)
        const half = road.width / 2
        addStrip(layers.asphalt, samples, normals, flat(-half, half, LIFT.road), heightAt)
        // Round the ends so a road meeting another at an angle leaves no notch.
        for (const end of [samples[0]!, samples.at(-1)!]) {
            addDisc(layers.asphalt, end.x, end.z, half, LIFT.road, heightAt)
        }

        for (const run of spans(coarse, coarseNormals, clearOfJunctions)) {
            for (const side of sidesOf(road.sidewalks)) {
                addStrip(layers.sidewalk, run.samples, run.normals, kerbSide(half, side), heightAt)
            }
        }

        for (const run of spans(samples, normals, clearOfJunctions)) {
            for (const side of sidesOf(road.bikeLanes)) {
                const inner = side * (half - BIKE_LANE_WIDTH)
                addStrip(
                    layers.bike,
                    run.samples,
                    run.normals,
                    flat(Math.min(inner, side * half), Math.max(inner, side * half), LIFT.bike),
                    heightAt
                )
            }
            addMarkings(layers, road, run.samples, run.normals, heightAt)
        }
    }

    addCrossings(layers.white, map.crossings, heightAt)
    addStopLines(layers.white, map.stops, heightAt)

    const group = new THREE.Group()
    for (const [name, builder] of Object.entries(layers)) {
        if (builder.indices.length === 0) continue
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3))
        geometry.setIndex(builder.indices)
        geometry.computeVertexNormals()
        const material = new THREE.MeshLambertMaterial({
            color: COLOURS[name as keyof typeof COLOURS],
            side: THREE.DoubleSide,
            // Paint sits on asphalt: nudge it towards the camera so it always wins.
            polygonOffset: name !== 'asphalt' && name !== 'sidewalk',
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
        })
        group.add(new THREE.Mesh(geometry, material))
    }

    return group
}

/**
 * Lane lines. A two-way street gets a dashed yellow centre line, a bigger
 * road a double solid one plus white edge lines; lanes going the same way
 * are split by dashed white lines.
 */
function addMarkings(
    layers: { white: Builder; yellow: Builder },
    road: Road,
    samples: Sample[],
    normals: [number, number][],
    heightAt: HeightAt
): void {
    if (road.kind === 'service') return

    const lanes = road.lanes ?? 1
    const half = road.width / 2
    const dashed = spans(samples, normals, sample => sample.distance % DASH.period < DASH.on)
    const line = (builder: Builder, offset: number, isDashed: boolean) => {
        for (const run of isDashed ? dashed : [{ samples, normals }]) {
            addStrip(
                builder,
                run.samples,
                run.normals,
                flat(offset - LINE_WIDTH / 2, offset + LINE_WIDTH / 2, LIFT.line),
                heightAt
            )
        }
    }

    if (road.oneway) {
        for (let lane = 1; lane < lanes; lane++) line(layers.white, -half + (road.width * lane) / lanes, true)
    } else {
        if (road.kind === 'major') {
            line(layers.yellow, -0.15, false)
            line(layers.yellow, 0.15, false)
        } else {
            line(layers.yellow, 0, true)
        }
        const perSide = Math.floor(lanes / 2)
        for (let lane = 1; lane < perSide; lane++) {
            const offset = (half * lane) / perSide
            line(layers.white, offset, true)
            line(layers.white, -offset, true)
        }
    }

    if (road.kind === 'major') {
        line(layers.white, half - 0.4, false)
        line(layers.white, -half + 0.4, false)
    }
}

/** Zebra bars: lined up across the road, each one running along it. */
function addCrossings(builder: Builder, crossings: number[], heightAt: HeightAt): void {
    for (let i = 0; i + 4 < crossings.length; i += 5) {
        const x = crossings[i]!
        const z = crossings[i + 1]!
        const dx = crossings[i + 2]!
        const dz = crossings[i + 3]!
        const length = crossings[i + 4]!
        const bars = Math.max(1, Math.floor(length / (ZEBRA.bar + ZEBRA.gap)))
        const spacing = ZEBRA.bar + ZEBRA.gap

        for (let bar = 0; bar < bars; bar++) {
            const along = (bar - (bars - 1) / 2) * spacing
            // Each bar's long side follows the road, a quarter turn from the crossing.
            addRect(builder, x + dx * along, z + dz * along, -dz, dx, ZEBRA.depth, ZEBRA.bar, LIFT.crossing, heightAt)
        }
    }
}

/** A white bar across the incoming half of the road, where traffic stops. */
function addStopLines(builder: Builder, stops: number[], heightAt: HeightAt): void {
    for (let i = 0; i + 4 < stops.length; i += 5) {
        const [x, z, dx, dz, width] = stops.slice(i, i + 5) as [number, number, number, number, number]
        // Centred on the right-hand half, (-dz, dx) being the right of traffic heading along (dx, dz).
        const across = width / 4
        addRect(builder, x - dz * across, z + dx * across, dx, dz, STOP_LINE, width / 2 - 0.3, LIFT.crossing, heightAt)
    }
}

function flat(from: number, to: number, lift: number): Column[] {
    return [
        { offset: from, lift },
        { offset: to, lift },
    ]
}

/**
 * A raised slab with vertical faces. Corner columns are doubled so faces
 * meet at a hard edge instead of being shaded as one rounded surface.
 */
function slab(from: number, to: number): Column[] {
    return [
        { offset: from, lift: LIFT.buried },
        { offset: from, lift: LIFT.kerb },
        { offset: from, lift: LIFT.kerb },
        { offset: to, lift: LIFT.kerb },
        { offset: to, lift: LIFT.kerb },
        { offset: to, lift: LIFT.buried },
    ]
}

/** A sidewalk beside the carriageway: its kerb face rises from the road, the outer edge sinks into the ground. */
function kerbSide(half: number, side: 1 | -1): Column[] {
    const columns = slab(half, half + SIDEWALK_WIDTH).map(column => ({ ...column, offset: column.offset * side }))
    columns[0] = { offset: half * side, lift: LIFT.road }

    return columns
}

/** 1 is the right of the road, -1 the left. */
function sidesOf(sides: Sides | undefined): (1 | -1)[] {
    if (sides === 'both') return [1, -1]
    if (sides === 'right') return [1]
    if (sides === 'left') return [-1]

    return []
}
