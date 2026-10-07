/**
 * Arena themes are data: a look, the obstacles they're furnished with, and a
 * physics twist. Adding a theme is adding an entry here, not new code.
 */

export const THEME_IDS = ['open_space', 'ice_rink', 'parking_lot', 'cafeteria', 'ping_pong_hall'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export type ObstacleShape =
    | { kind: 'rect'; name: string; w: [number, number]; h: [number, number]; rotatable: boolean; weight: number }
    | { kind: 'circle'; name: string; r: [number, number]; weight: number }

export interface Theme {
    id: ThemeId
    name: string
    emoji: string
    palette: { floor: string; floorLine: string; wall: string; obstacle: string; obstacleEdge: string }
    shapes: ObstacleShape[]
    /** Multiplies the size-based obstacle count. */
    density: number
    physics: {
        /** Velocity damping per second; lower slides further. */
        friction: number
        /** Acceleration multiplier; ice is hard to get going. */
        grip: number
        /** Bounce off obstacles; above 1 gives a kick. */
        restitution: number
    }
    /** One obstacle drifts back and forth. */
    mover: boolean
}

export const THEMES: Record<ThemeId, Theme> = {
    open_space: {
        id: 'open_space',
        name: 'Open space',
        emoji: '🏢',
        palette: {
            floor: '#1e293b',
            floorLine: '#334155',
            wall: '#64748b',
            obstacle: '#a16207',
            obstacleEdge: '#facc15',
        },
        shapes: [
            { kind: 'rect', name: 'desk', w: [4, 7], h: [2, 3], rotatable: true, weight: 3 },
            { kind: 'circle', name: 'plant', r: [1, 1.5], weight: 1 },
        ],
        density: 1,
        physics: { friction: 3.5, grip: 1, restitution: 0.5 },
        mover: false,
    },
    ice_rink: {
        id: 'ice_rink',
        name: 'Ice rink',
        emoji: '❄️',
        palette: {
            floor: '#dbeafe',
            floorLine: '#bfdbfe',
            wall: '#1e3a8a',
            obstacle: '#f8fafc',
            obstacleEdge: '#60a5fa',
        },
        shapes: [
            { kind: 'circle', name: 'snowbank', r: [1.5, 3], weight: 3 },
            { kind: 'rect', name: 'bench', w: [4, 6], h: [1.2, 1.6], rotatable: true, weight: 1 },
        ],
        density: 0.8,
        physics: { friction: 0.6, grip: 0.55, restitution: 0.8 },
        mover: false,
    },
    parking_lot: {
        id: 'parking_lot',
        name: 'Parking lot',
        emoji: '🅿️',
        palette: {
            floor: '#27272a',
            floorLine: '#fafafa',
            wall: '#a1a1aa',
            obstacle: '#dc2626',
            obstacleEdge: '#fecaca',
        },
        shapes: [
            { kind: 'rect', name: 'car', w: [4.5, 4.5], h: [2.2, 2.2], rotatable: true, weight: 1 },
            { kind: 'circle', name: 'cone', r: [0.5, 0.6], weight: 3 },
        ],
        density: 1.6,
        physics: { friction: 3.5, grip: 1, restitution: 0.4 },
        mover: false,
    },
    cafeteria: {
        id: 'cafeteria',
        name: 'Cafeteria',
        emoji: '🍽️',
        palette: {
            floor: '#451a03',
            floorLine: '#78350f',
            wall: '#fbbf24',
            obstacle: '#fde68a',
            obstacleEdge: '#f59e0b',
        },
        shapes: [{ kind: 'circle', name: 'table', r: [1.8, 2.6], weight: 1 }],
        density: 1,
        physics: { friction: 3.5, grip: 1, restitution: 1.3 },
        mover: false,
    },
    ping_pong_hall: {
        id: 'ping_pong_hall',
        name: 'Ping-pong hall',
        emoji: '🏓',
        palette: {
            floor: '#052e16',
            floorLine: '#166534',
            wall: '#86efac',
            obstacle: '#1d4ed8',
            obstacleEdge: '#f8fafc',
        },
        shapes: [{ kind: 'rect', name: 'table', w: [5, 5], h: [2.8, 2.8], rotatable: true, weight: 1 }],
        density: 0.8,
        physics: { friction: 3.5, grip: 1, restitution: 0.6 },
        mover: true,
    },
}

export function isThemeId(value: unknown): value is ThemeId {
    return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}
