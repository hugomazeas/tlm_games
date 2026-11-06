/**
 * Your settings, kept in this browser: mouse sensitivity (and while aiming), field of view,
 * invert Y, sound volume, resolution, the performance overlay. Read with every value checked and clamped, so an old or hand-edited one can't break
 * the game.
 */

export interface Settings {
    /** Multiplies the mouse's speed (1: the default). */
    sensitivity: number
    /** Multiplies it again while aiming (on top of the zoom's own slowdown). */
    aimSensitivity: number
    /** Vertical field of view from the hip (degrees); aiming zooms to about 58% of it. */
    fov: number
    invertY: boolean
    /** Sound effects, 0 (off) … 1. */
    volume: number
    /** The share of full resolution drawn (0.5 … 1): fewer pixels for a GPU that can't keep up. */
    resolution: number
    /** The performance overlay (frame times, CPU and GPU, draw calls, network, mouse). */
    perfOverlay: boolean
}

export const DEFAULT_SETTINGS: Settings = {
    sensitivity: 1,
    aimSensitivity: 1,
    fov: 78,
    invertY: false,
    volume: 0.6,
    resolution: 1,
    perfOverlay: false,
}

export const LIMITS = {
    sensitivity: { min: 0.1, max: 4, step: 0.05 },
    aimSensitivity: { min: 0.2, max: 2, step: 0.05 },
    fov: { min: 60, max: 110, step: 1 },
    volume: { min: 0, max: 1, step: 0.05 },
    resolution: { min: 0.5, max: 1, step: 0.05 },
} as const

const KEY = 'officeFps.settings'

export function parseSettings(raw: string | null): Settings {
    let value: Record<string, unknown> = {}
    try {
        const parsed = raw === null ? null : JSON.parse(raw)
        if (parsed && typeof parsed === 'object') value = parsed
    } catch {
        // Not JSON: the defaults.
    }
    const number = (key: keyof typeof LIMITS) => {
        const n = value[key]
        const { min, max } = LIMITS[key]
        return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_SETTINGS[key]
    }

    return {
        sensitivity: number('sensitivity'),
        aimSensitivity: number('aimSensitivity'),
        fov: number('fov'),
        volume: number('volume'),
        resolution: number('resolution'),
        invertY: typeof value.invertY === 'boolean' ? value.invertY : DEFAULT_SETTINGS.invertY,
        perfOverlay: typeof value.perfOverlay === 'boolean' ? value.perfOverlay : DEFAULT_SETTINGS.perfOverlay,
    }
}

export function loadSettings(): Settings {
    try {
        return parseSettings(localStorage.getItem(KEY))
    } catch {
        return { ...DEFAULT_SETTINGS }
    }
}

export function saveSettings(settings: Settings): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
        // A private window: the settings last this visit.
    }
}

/** The aimed field of view for a hip one. */
export function aimFov(fov: number): number {
    return Math.round(fov * 0.58)
}
