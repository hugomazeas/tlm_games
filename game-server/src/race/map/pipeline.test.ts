import { beforeAll, describe, expect, test } from 'bun:test'
import { courseProblems } from '../drive/checks.ts'
import { buildWorld } from '../drive/world.ts'
import { projector } from './convert.ts'
import { COURSE_KEYS, GATE_KEYS, projectCourse } from './courses.ts'
import { BASIN_KEYS, DECOR_KEYS, type DecorFile, ITEM_KEYS, PIECE_KEYS, PLINTH_KEYS } from './decor.ts'
import { LOOK_KEYS, LOOKS_KEYS, type LooksFile } from './looks.ts'
import {
    ARCADE_KEYS,
    BANDS_KEYS,
    FINS_KEYS,
    LANDMARK_KEYS,
    PART_KEYS,
    ROOF_KEYS,
    ROOF_SHAPES,
    STEPS_KEYS,
    WINDOW_STYLES,
    WINDOWS_KEYS,
} from './landmarks.ts'
import {
    buildMap,
    COURSE_SCHEMA,
    type CourseFile,
    DECOR_SCHEMA,
    LANDMARK_SCHEMA,
    LOOKS_SCHEMA,
    type LandmarkFile,
    MAPS,
    mapFile,
    readCourses,
    readDecor,
    readLandmarks,
    readLooks,
    readSnapshot,
    reviewMap,
    serialise,
    type Snapshot,
    snapshotMatches,
} from './pipeline.ts'

/**
 * Guards the map workflow: what's committed under maps/ must be what the
 * pipeline makes from it. A hand edit to map.json, a landmark file that
 * doesn't parse, or a snapshot for the wrong area all fail here.
 */

for (const config of Object.values(MAPS)) {
    describe(`the ${config.slug} map`, () => {
        let snapshot: Snapshot | null
        let files: LandmarkFile[]
        let decor: DecorFile[]
        let looks: LooksFile
        let courses: CourseFile[]
        beforeAll(async () => {
            snapshot = await readSnapshot(config.slug)
            files = await readLandmarks(config.slug)
            decor = await readDecor(config.slug)
            looks = await readLooks(config.slug)
            courses = await readCourses(config.slug)
        })
        const landmarks = () => files.map(file => file.landmark)

        test('has a snapshot for exactly the area its config asks for', () => {
            expect(snapshot).not.toBeNull()
            expect(snapshotMatches(snapshot!.meta, config)).toBe(true)
        })

        test('its committed map.json is exactly what the snapshot, landmarks, decor and looks build', async () => {
            const built = serialise(buildMap(config, snapshot!, landmarks(), decor, looks))
            const committed = await Bun.file(mapFile(config.slug)).text()
            // Not toBe: a mismatch would print two 2 MB strings. Rebuild with `bun run race:map`.
            expect(built === committed).toBe(true)
        })

        test('every landmark matches its OSM footprint, and has been stamped', () => {
            const map = buildMap(config, snapshot!, landmarks())
            const problems = reviewMap(config, map, landmarks())
                .filter(review => review.status !== 'ok')
                .map(review => `${review.landmark.name}: ${review.status} ${review.reason ?? ''}`)
            expect(problems).toEqual([])
        })

        test('every default track can be raced: on streets, gates clear, room for a full grid', () => {
            const map = buildMap(config, snapshot!, landmarks(), decor, looks)
            const world = buildWorld(map)
            const { project } = projector(config.bounds)
            const problems = courses.flatMap(({ slug, spec }) =>
                courseProblems(projectCourse(slug, spec, project), world, map.roads).map(
                    problem => `${slug}: ${problem}`
                )
            )
            expect(problems).toEqual([])
        })

        test('every landmark file is named after its id', () => {
            for (const { path, landmark } of files) {
                expect(path.split('/').at(-1)!.startsWith(`${landmark.id}-`)).toBe(true)
            }
        })
    })
}

describe("the Hub's racing tracks", () => {
    test('check checkpoints against the same map areas as the game server', async () => {
        const model = await Bun.file(`${import.meta.dir}/../../../../app/Games/Racing/Models/RacingTrack.php`).text()
        for (const [slug, { bounds }] of Object.entries(MAPS)) {
            const line = model.split('\n').find(row => row.includes(`'${slug}' =>`))
            expect(line).toBeDefined()
            const numbers = Object.fromEntries(
                [...line!.matchAll(/'(\w+)' => (-?[\d.]+)/g)].map(([, key, value]) => [key, Number(value)])
            )
            expect(numbers).toEqual({ ...bounds })
        }
    })
})

describe('the course schema', () => {
    test('knows the same keys as the validator', async () => {
        const schema = await Bun.file(COURSE_SCHEMA).json()
        expect(Object.keys(schema.properties).sort()).toEqual([...COURSE_KEYS].sort())
        expect(Object.keys(schema.properties.gates.items.properties).sort()).toEqual([...GATE_KEYS].sort())
    })
})

describe('the looks schema', () => {
    test('knows the same keys as the validator', async () => {
        const schema = await Bun.file(LOOKS_SCHEMA).json()
        expect(Object.keys(schema.properties).sort()).toEqual([...LOOKS_KEYS].sort())
        expect(Object.keys(schema.$defs.look.properties).sort()).toEqual([...LOOK_KEYS].sort())
    })
})

describe('the decor schema', () => {
    test('knows the same keys as the validator', async () => {
        const schema = await Bun.file(DECOR_SCHEMA).json()
        expect(Object.keys(schema.properties).sort()).toEqual([...DECOR_KEYS].sort())
        for (const [kind, keys] of Object.entries(ITEM_KEYS)) {
            expect(Object.keys(schema.$defs[kind].properties).sort()).toEqual([...keys].sort())
        }
        expect(Object.keys(schema.$defs.piece.properties).sort()).toEqual([...PIECE_KEYS].sort())
        expect(Object.keys(schema.$defs.statue.properties.plinth.properties).sort()).toEqual([...PLINTH_KEYS].sort())
        expect(Object.keys(schema.$defs.fountain.properties.basins.items.properties).sort()).toEqual(
            [...BASIN_KEYS].sort()
        )
    })
})

describe('the landmark schema', () => {
    test('knows the same keys as the validator', async () => {
        const schema = await Bun.file(LANDMARK_SCHEMA).json()
        expect(Object.keys(schema.properties).sort()).toEqual([...LANDMARK_KEYS].sort())
        expect(Object.keys(schema.properties.parts.items.properties).sort()).toEqual([...PART_KEYS].sort())
        expect(Object.keys(schema.$defs.roof.properties).sort()).toEqual([...ROOF_KEYS].sort())
        expect(Object.keys(schema.$defs.fins.properties).sort()).toEqual([...FINS_KEYS].sort())
        expect(Object.keys(schema.$defs.arcade.properties).sort()).toEqual([...ARCADE_KEYS].sort())
        expect(Object.keys(schema.$defs.bands.properties).sort()).toEqual([...BANDS_KEYS].sort())
        expect(Object.keys(schema.$defs.windows.properties).sort()).toEqual([...WINDOWS_KEYS].sort())
        expect(schema.$defs.windows.properties.style.enum).toEqual(WINDOW_STYLES)
        expect(schema.$defs.roof.properties.shape.enum).toEqual(ROOF_SHAPES)
        const steps = schema.properties.parts.items.properties.steps
        expect(Object.keys(steps.properties).sort()).toEqual([...STEPS_KEYS].sort())
    })
})
