import type { LatLon } from './convert.ts'
import type { Course } from './format.ts'

/**
 * Race courses, one JSON file each in maps/<map>/courses/, checked against
 * maps/course.schema.json by editors and by `parseCourse` here. Gates are
 * placed in latitude/longitude, like landmarks, so a course survives the
 * map's bounds changing; the build turns them into map metres.
 *
 * A gate's `heading` lays its line square across the road: a direction along
 * the road, in degrees as the viewer counts them (0 north, 90 west). Which
 * way round doesn't matter: a gate is crossed either way, and the route
 * between the gates decides the way round (route.ts orientAlongRoute).
 */

export interface GateSpec {
    lat: number
    lon: number
    heading: number
    width: number
}

export interface CourseSpec {
    name: string
    notes?: string
    laps: number
    gates: GateSpec[]
}

export const COURSE_KEYS = ['$schema', 'name', 'notes', 'laps', 'gates']
export const GATE_KEYS = ['lat', 'lon', 'heading', 'width']

/** A course needs at least this many gates: a start line and two to stop it being cut. */
export const MIN_GATES = 3
export const MAX_LAPS = 10

export function parseCourse(value: unknown, file: string): CourseSpec {
    const problems: string[] = []
    const fail = (path: string, message: string) => problems.push(`${path}: ${message}`)
    const record = (path: string, input: unknown, keys: string[]): Record<string, unknown> | null => {
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            fail(path, 'must be an object')
            return null
        }
        for (const key of Object.keys(input)) {
            if (!keys.includes(key)) fail(path, `unknown key "${key}"`)
        }
        return input as Record<string, unknown>
    }
    const number = (path: string, input: unknown, min: number, max: number) => {
        if (typeof input !== 'number' || !Number.isFinite(input)) fail(path, 'must be a number')
        else if (input < min || input > max) fail(path, `must be between ${min} and ${max}`)
    }

    const course = record(file, value, COURSE_KEYS)
    if (course) {
        if (typeof course.name !== 'string' || course.name === '') fail('name', 'must be a name')
        if (course.notes !== undefined && typeof course.notes !== 'string') fail('notes', 'must be text')
        if (!Number.isInteger(course.laps) || (course.laps as number) < 1 || (course.laps as number) > MAX_LAPS) {
            fail('laps', `must be a whole number from 1 to ${MAX_LAPS}`)
        }
        if (!Array.isArray(course.gates)) fail('gates', 'must be a list')
        else {
            if (course.gates.length < MIN_GATES) fail('gates', `needs at least ${MIN_GATES}`)
            course.gates.forEach((input, i) => {
                const gate = record(`gates[${i}]`, input, GATE_KEYS)
                if (!gate) return
                number(`gates[${i}].lat`, gate.lat, -90, 90)
                number(`gates[${i}].lon`, gate.lon, -180, 180)
                number(`gates[${i}].heading`, gate.heading, -360, 360)
                number(`gates[${i}].width`, gate.width, 3, 60)
            })
        }
    }

    if (problems.length > 0) throw new Error(`${file} is not a valid course:\n  ${problems.join('\n  ')}`)

    const { $schema: _, ...typed } = value as CourseSpec & { $schema?: string }
    return typed
}

/** A course in map metres. */
export function projectCourse(slug: string, spec: CourseSpec, project: (point: LatLon) => [number, number]): Course {
    return {
        slug,
        name: spec.name,
        laps: spec.laps,
        gates: spec.gates.map(gate => {
            const [x, z] = project(gate)
            const heading = (gate.heading * Math.PI) / 180

            return {
                x: round(x),
                z: round(z),
                dx: round(-Math.sin(heading), 4),
                dz: round(-Math.cos(heading), 4),
                width: gate.width,
            }
        }),
    }
}

function round(value: number, decimals = 2): number {
    const scale = 10 ** decimals

    return Math.round(value * scale) / scale
}
