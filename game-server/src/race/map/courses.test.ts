import { describe, expect, test } from 'bun:test'
import { type CourseSpec, parseCourse, projectCourse } from './courses.ts'

const valid: CourseSpec = {
    name: 'Test loop',
    laps: 3,
    gates: [
        { lat: 46.8, lon: -71.2, heading: 0, width: 12 },
        { lat: 46.801, lon: -71.2, heading: 90, width: 10 },
        { lat: 46.801, lon: -71.201, heading: 180, width: 10 },
    ],
}

describe('parseCourse', () => {
    test('accepts a valid course and drops $schema', () => {
        expect(parseCourse({ $schema: '../../course.schema.json', ...valid }, 'c.json')).toEqual(valid)
    })

    test('names every problem', () => {
        const broken = {
            name: '',
            laps: 0,
            colour: 'red',
            gates: [{ lat: 46.8, lon: -71.2, heading: 0, width: 1, extra: true }],
        }
        expect(() => parseCourse(broken, 'c.json')).toThrow(
            /unknown key "colour"[\s\S]*name: must be a name[\s\S]*laps: must be a whole number[\s\S]*gates: needs at least 3[\s\S]*unknown key "extra"[\s\S]*gates\[0\]\.width: must be between 3 and 60/
        )
    })

    test('laps must be whole', () => {
        expect(() => parseCourse({ ...valid, laps: 2.5 }, 'c.json')).toThrow(/laps/)
    })
})

test('projectCourse turns headings into directions through each gate', () => {
    const course = projectCourse('test', valid, ({ lat, lon }) => [(lon + 71.2) * 1000, -(lat - 46.8) * 1000])
    expect(course).toMatchObject({ slug: 'test', name: 'Test loop', laps: 3 })
    expect(course.gates[0]).toEqual({ x: 0, z: -0, dx: -0, dz: -1, width: 12 })
    expect(course.gates[1]).toMatchObject({ x: 0, z: -1, dx: -1, width: 10 })
    expect(course.gates[2]!.dz).toBe(1)
})
