/**
 * Arena themes are data: a look, the obstacles they're furnished with, and a
 * physics twist. Adding a theme is adding an entry here, not new code.
 */

export const THEME_IDS = [
    'open_space',
    'ice_rink',
    'parking_lot',
    'cafeteria',
    'ping_pong_hall',
    'boardroom',
    'server_room',
    'library',
    'gym',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export type ObstacleShape =
    | { kind: 'rect'; name: string; w: [number, number]; h: [number, number]; rotatable: boolean; weight: number }
    | { kind: 'circle'; name: string; r: [number, number]; weight: number }

/** Composite walls: an L or T of two blocks, or a U of three with a mouth wide enough to walk into. */
export type WallKind = 'L' | 'T' | 'U'

export interface WallStyle {
    name: string
    kinds: WallKind[]
    /** How many, from the smallest arena to the largest. */
    count: [number, number]
    thickness: number
}

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
    walls: WallStyle
    /** Obstacles drifting back and forth, from the smallest arena to the largest. */
    movers: { shape: ObstacleShape; count: [number, number] }
    /** One piece set down in the middle before anything else (the boardroom's table), when it fits. */
    centerpiece?: ObstacleShape
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
        walls: { name: 'desk row', kinds: ['L', 'T', 'U'], count: [1, 3], thickness: 1.2 },
        movers: { shape: { kind: 'circle', name: 'office chair', r: [0.9, 1.1], weight: 1 }, count: [1, 2] },
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
        walls: { name: 'rink boards', kinds: ['L', 'U'], count: [1, 2], thickness: 0.8 },
        movers: {
            shape: { kind: 'rect', name: 'zamboni', w: [3.5, 3.5], h: [2, 2], rotatable: true, weight: 1 },
            count: [1, 2],
        },
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
        walls: { name: 'barrier', kinds: ['L', 'T'], count: [1, 3], thickness: 1 },
        movers: {
            shape: { kind: 'rect', name: 'car', w: [4.5, 4.5], h: [2.2, 2.2], rotatable: true, weight: 1 },
            count: [1, 2],
        },
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
        walls: { name: 'counter', kinds: ['L', 'U'], count: [1, 2], thickness: 1.4 },
        movers: { shape: { kind: 'circle', name: 'food cart', r: [1.2, 1.2], weight: 1 }, count: [1, 1] },
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
        walls: { name: 'barrier', kinds: ['T', 'L'], count: [1, 2], thickness: 1 },
        movers: {
            shape: { kind: 'rect', name: 'table', w: [5, 5], h: [2.8, 2.8], rotatable: false, weight: 1 },
            count: [1, 3],
        },
    },
    boardroom: {
        id: 'boardroom',
        name: 'Boardroom',
        emoji: '💼',
        palette: {
            floor: '#292524',
            floorLine: '#44403c',
            wall: '#d6d3d1',
            obstacle: '#78350f',
            obstacleEdge: '#d97706',
        },
        centerpiece: { kind: 'rect', name: 'boardroom table', w: [12, 16], h: [4, 5], rotatable: false, weight: 1 },
        shapes: [
            { kind: 'rect', name: 'side table', w: [3, 4], h: [1.6, 2], rotatable: true, weight: 2 },
            { kind: 'circle', name: 'plant', r: [0.9, 1.3], weight: 1 },
        ],
        density: 0.6,
        physics: { friction: 3.5, grip: 1, restitution: 0.5 },
        walls: { name: 'credenza', kinds: ['L'], count: [0, 2], thickness: 1 },
        movers: { shape: { kind: 'circle', name: 'rolling chair', r: [0.9, 1.1], weight: 1 }, count: [2, 4] },
    },
    server_room: {
        id: 'server_room',
        name: 'Server room',
        emoji: '🖥️',
        palette: {
            floor: '#0b1120',
            floorLine: '#1e3a5f',
            wall: '#38bdf8',
            obstacle: '#1f2937',
            obstacleEdge: '#22d3ee',
        },
        shapes: [
            { kind: 'rect', name: 'rack', w: [6, 9], h: [1.4, 1.6], rotatable: true, weight: 3 },
            { kind: 'rect', name: 'cooling unit', w: [2, 2.5], h: [2, 2.5], rotatable: false, weight: 1 },
        ],
        density: 1.1,
        physics: { friction: 3.5, grip: 1, restitution: 0.4 },
        walls: { name: 'rack row', kinds: ['L', 'T'], count: [2, 4], thickness: 1.4 },
        movers: {
            shape: { kind: 'rect', name: 'server cart', w: [2, 2], h: [1.4, 1.4], rotatable: true, weight: 1 },
            count: [1, 2],
        },
    },
    library: {
        id: 'library',
        name: 'Library',
        emoji: '📚',
        palette: {
            floor: '#3f2a1d',
            floorLine: '#5c4033',
            wall: '#c08457',
            obstacle: '#7c2d12',
            obstacleEdge: '#fbbf24',
        },
        shapes: [
            { kind: 'rect', name: 'reading table', w: [4, 5], h: [2.2, 2.6], rotatable: true, weight: 2 },
            { kind: 'circle', name: 'armchair', r: [1, 1.3], weight: 1 },
        ],
        density: 0.9,
        physics: { friction: 4, grip: 1, restitution: 0.3 },
        walls: { name: 'shelves', kinds: ['L', 'T'], count: [2, 3], thickness: 1.2 },
        movers: {
            shape: { kind: 'rect', name: 'book cart', w: [2.2, 2.2], h: [1.2, 1.2], rotatable: true, weight: 1 },
            count: [1, 2],
        },
    },
    gym: {
        id: 'gym',
        name: 'Gym',
        emoji: '🏋️',
        palette: {
            floor: '#18181b',
            floorLine: '#3f3f46',
            wall: '#facc15',
            obstacle: '#27272a',
            obstacleEdge: '#a3e635',
        },
        shapes: [
            { kind: 'rect', name: 'bench', w: [3.5, 4.5], h: [1, 1.2], rotatable: true, weight: 2 },
            { kind: 'circle', name: 'weight plate', r: [0.7, 1], weight: 2 },
            { kind: 'rect', name: 'weight rack', w: [4, 5], h: [1.4, 1.6], rotatable: true, weight: 1 },
        ],
        density: 0.8,
        // Rubber floor: a little extra grip, and you bounce off the gear.
        physics: { friction: 4, grip: 1.1, restitution: 0.9 },
        walls: { name: 'treadmill row', kinds: ['L', 'U'], count: [1, 2], thickness: 1.6 },
        movers: { shape: { kind: 'circle', name: 'exercise ball', r: [1, 1.2], weight: 1 }, count: [1, 3] },
    },
}

export function isThemeId(value: unknown): value is ThemeId {
    return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}
