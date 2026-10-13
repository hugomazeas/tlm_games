import { radiusOf, type GameState } from '../sim/game.ts'
import { contactWith } from '../sim/geometry.ts'
import { FUSE_MAX_MS, MAX_SPEED } from '../sim/game.ts'
import { type ItemKind } from '../sim/items.ts'
import { type MotionHistory, NAV_RANGE, type SeatNav } from './nav.ts'

export const OTHER_COUNT = 7
export const ITEM_KINDS: readonly ItemKind[] = [
    'shield',
    'speed',
    'banana',
    'ghost',
    'swap',
    'reverse',
    'freeze',
    'magnet',
    'tiny',
    'mystery',
]
export const FEELER_COUNT = 16
export const FEELER_RANGE = 8
/** Size of the first, purely euclidean layout. Old checkpoints have this many inputs. */
export const BASE_OBS_SIZE = 123
/** Navigation and motion-memory features appended after the base layout. */
export const NAV_FEATURE_COUNT = 14
export const OBS_SIZE = BASE_OBS_SIZE + NAV_FEATURE_COUNT
const WINDOW_SHORT_TICKS = 10
const WINDOW_LONG_TICKS = 30
/** One simulation tick (the same 50 ms as `bots/harness` and the server; not imported to keep `bots/brain` free of a cycle). */
const TICK_MS = 50
const MAX_VELOCITY = MAX_SPEED * 2.5
const clamp = (value: number) => Math.max(-1, Math.min(1, value))

/** Per-seat state the environment keeps for the appended features. Missing: those features are zero. */
export interface ObservationAux {
    nav?: SeatNav
    motion?: MotionHistory
}

/** Stable egocentric features, the layout the trained policy was trained on; it must not change unless the policy is retrained. */
export function observe(game: GameState, seat: number, aux: ObservationAux = {}): number[] {
    const me = game.players.find(player => player.id === seat)
    if (!me) throw new Error(`Unknown seat ${seat}`)
    const { width, height } = game.arena
    const holder = game.players.find(player => player.id === game.holderId)
    const dx = holder && holder.id !== seat ? holder.x - me.x : 0
    const dy = holder && holder.id !== seat ? holder.y - me.y : 0
    const features = [
        clamp(me.vx / MAX_VELOCITY),
        clamp(me.vy / MAX_VELOCITY),
        Number(game.holderId === seat),
        clamp(dx / width),
        clamp(dy / height),
        clamp(Math.hypot(dx, dy) / Math.hypot(width, height)),
        game.mode === 'king' || !holder ? 0 : clamp(game.fuseMs / FUSE_MAX_MS),
        clamp(me.frozenMs / 2000),
        clamp(me.shieldMs / 5000),
        clamp(me.speedMs / 4000),
        clamp(me.slipMs / 1500),
        clamp(me.ghostMs / 3000),
        clamp(me.reverseMs / 4000),
        clamp(me.magnetMs / 4000),
        clamp(me.tinyMs / 5000),
        clamp(me.safeMs / 2000),
    ]
    const others = game.players
        .filter(player => player.id !== seat)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y) || a.id - b.id)
    for (let i = 0; i < OTHER_COUNT; i++) {
        const player = others[i]
        features.push(
            ...(player
                ? [
                      clamp((player.x - me.x) / width),
                      clamp((player.y - me.y) / height),
                      clamp(player.vx / MAX_VELOCITY),
                      clamp(player.vy / MAX_VELOCITY),
                      Number(player.id === game.holderId),
                      Number(player.frozenMs > 0),
                      Number(player.out),
                      1,
                  ]
                : [0, 0, 0, 0, 0, 0, 0, 0])
        )
    }
    for (const kind of ITEM_KINDS) {
        const nearest = game.items
            .filter(item => item.kind === kind)
            .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y) || a.id - b.id)[0]
        features.push(
            ...(nearest ? [clamp((nearest.x - me.x) / width), clamp((nearest.y - me.y) / height), 1] : [0, 0, 0])
        )
    }
    for (let i = 0; i < FEELER_COUNT; i++) {
        const angle = (i / FEELER_COUNT) * Math.PI * 2
        const ux = Math.cos(angle)
        const uy = Math.sin(angle)
        let free = 0
        for (let distance = 0.5; distance <= FEELER_RANGE; distance += 0.5) {
            const point = { x: me.x + ux * distance, y: me.y + uy * distance }
            const radius = radiusOf(me)
            if (
                point.x < radius ||
                point.y < radius ||
                point.x > width - radius ||
                point.y > height - radius ||
                (me.ghostMs <= 0 &&
                    game.arena.obstacles.some(
                        obstacle => contactWith(point, obstacle, game.elapsedMs).distance < radius
                    ))
            )
                break
            free = distance
        }
        features.push(free / FEELER_RANGE)
    }
    features.push(
        clamp(width / 64),
        clamp(height / 40),
        clamp((game.durationMs - game.elapsedMs) / game.durationMs),
        Number(game.mode === 'king'),
        Number(me.out)
    )
    features.push(...navFeatures(me.out, features.slice(102, 118), aux))
    if (features.length !== OBS_SIZE) throw new Error('Observation layout mismatch')
    return features
}

/** The appended block, indices BASE_OBS_SIZE... `feelers` are the 16 free runs / 8. */
function navFeatures(out: boolean, feelers: number[], { nav, motion }: ObservationAux): number[] {
    if (out) return new Array<number>(NAV_FEATURE_COUNT).fill(0)
    const target = nav?.targetDistance
    const geodesic = target === undefined || target === null ? 0 : Math.min(target, NAV_RANGE) / NAV_RANGE
    const detour =
        target === undefined || target === null
            ? 0
            : clamp(((Number.isFinite(target) ? target : NAV_RANGE) - (nav?.targetEuclid ?? 0)) / 15)
    const short = motion?.displacement(WINDOW_SHORT_TICKS) ?? { dx: 0, dy: 0 }
    const long = motion?.displacement(WINDOW_LONG_TICKS) ?? { dx: 0, dy: 0 }
    const shortScale = MAX_SPEED * ((WINDOW_SHORT_TICKS * TICK_MS) / 1000)
    const longScale = MAX_SPEED * ((WINDOW_LONG_TICKS * TICK_MS) / 1000)
    return [
        geodesic,
        Math.max(0, detour),
        nav?.pathDx ?? 0,
        nav?.pathDy ?? 0,
        nav?.fleeDx ?? 0,
        nav?.fleeDy ?? 0,
        clamp((nav?.pocketDepth ?? 0) / 8),
        nav?.exitDx ?? 0,
        nav?.exitDy ?? 0,
        // Share of the 16 feelers with at least 4 units of free run: how open the spot is.
        feelers.filter(free => free >= 0.5).length / FEELER_COUNT,
        clamp(short.dx / shortScale),
        clamp(short.dy / shortScale),
        clamp(long.dx / longScale),
        clamp(long.dy / longScale),
    ]
}
