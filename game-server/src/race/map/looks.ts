import type { Building, WindowGrid } from './format.ts'
import { WINDOW_STYLES } from './landmarks.ts'

/**
 * How ordinary buildings really look: wall and roof colours (sampled from
 * aerial photos, then checked by eye), and windows or glass where a building
 * isn't the usual. One file per map, maps/<map>/looks.json, keyed by OSM
 * element like landmark files; a building with a landmark file ignores its
 * entry. Only colours and windows: heights come from the survey or OSM.
 */

export interface Look {
    wall?: string
    roof?: string
    windows?: WindowGrid | false
    glass?: string
}

export interface LooksFile {
    notes?: string
    buildings: Record<string, Look>
}

export const LOOKS_KEYS = ['$schema', 'notes', 'buildings']
export const LOOK_KEYS = ['wall', 'roof', 'windows', 'glass']
const COLOUR = /^#[0-9a-fA-F]{6}$/

/** Checks a looks file and returns it typed, or throws listing every problem. */
export function parseLooks(value: unknown, file: string): LooksFile {
    const problems: string[] = []
    const fail = (path: string, message: string) => problems.push(`${path}: ${message}`)
    const isRecord = (input: unknown): input is Record<string, unknown> =>
        typeof input === 'object' && input !== null && !Array.isArray(input)

    if (!isRecord(value)) fail(file, 'must be an object')
    else {
        for (const key of Object.keys(value)) if (!LOOKS_KEYS.includes(key)) fail(file, `unknown key "${key}"`)
        if (value.notes !== undefined && typeof value.notes !== 'string') fail('notes', 'must be text')
        if (!isRecord(value.buildings)) fail('buildings', 'must be an object keyed like "way/123"')
        else
            for (const [key, look] of Object.entries(value.buildings)) {
                if (!/^(way|relation)\/\d+$/.test(key)) fail(key, 'must be like "way/123" or "relation/456"')
                if (!isRecord(look)) {
                    fail(key, 'must be an object')
                    continue
                }
                for (const field of Object.keys(look))
                    if (!LOOK_KEYS.includes(field)) fail(key, `unknown key "${field}"`)
                for (const field of ['wall', 'roof', 'glass']) {
                    if (look[field] !== undefined && (typeof look[field] !== 'string' || !COLOUR.test(look[field]))) {
                        fail(`${key}.${field}`, 'must be a colour like #a1b2c3')
                    }
                }
                const windows = look.windows
                if (windows !== undefined && windows !== false) {
                    if (!isRecord(windows)) fail(`${key}.windows`, 'must be a window grid or false')
                    else {
                        if (typeof windows.floor !== 'number' || windows.floor < 1)
                            fail(`${key}.windows.floor`, 'must be at least 1')
                        if (typeof windows.spacing !== 'number' || windows.spacing < 0.5) {
                            fail(`${key}.windows.spacing`, 'must be at least 0.5')
                        }
                        if (windows.style !== undefined && !WINDOW_STYLES.includes(windows.style as string)) {
                            fail(`${key}.windows.style`, `must be ${WINDOW_STYLES.join(', ')}`)
                        }
                        for (const field of Object.keys(windows)) {
                            if (!['floor', 'spacing', 'style'].includes(field))
                                fail(`${key}.windows`, `unknown key "${field}"`)
                        }
                    }
                }
            }
    }

    if (problems.length > 0) throw new Error(`${file} is not a valid looks file:\n  ${problems.join('\n  ')}`)

    const { $schema: _, ...typed } = value as LooksFile & { $schema?: string }
    return typed
}

/** A building in its looks: its colours, its windows, and a roof of that colour (flat unless the survey found a pitch). */
export function applyLook(building: Building, look: Look | undefined): Building {
    if (!look || building.landmark) return building
    const roof = look.roof
        ? building.roof
            ? { ...building.roof, colour: look.roof }
            : { shape: 'flat' as const, height: 0, colour: look.roof }
        : building.roof

    return {
        ...building,
        ...(look.wall ? { colour: look.wall } : {}),
        ...(roof ? { roof } : {}),
        ...(look.windows !== undefined ? { windows: look.windows } : {}),
        ...(look.glass ? { glass: look.glass } : {}),
    }
}
