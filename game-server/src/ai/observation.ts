import { radiusOf, type GameState } from '../sim/game.ts'
import { contactWith } from '../sim/geometry.ts'
import { FUSE_MAX_MS, LAUNCH_MS, MAX_SPEED, PORTAL_COOLDOWN_MS, PORTAL_LIFETIME_MS } from '../sim/game.ts'
import { type ItemKind } from '../sim/items.ts'
import { type MotionHistory, NAV_RANGE, nearestPortal, type SeatNav, type VisitMap } from './nav.ts'

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
/** Navigation and motion-memory features appended after the base layout (see `tools/bot-training/README.md`). */
export const NAV_FEATURE_COUNT = 14
/**
 * Then the other players' effects, appended in obs spec 3: for each of the seven players of indices
 * 16–71, in the same order, shield, ghost, tiny, speed, slip and reverse timers; then whether the
 * game is Killer Potato.
 */
export const OTHER_EFFECTS = 6
export const EFFECT_FEATURE_COUNT = OTHER_COUNT * OTHER_EFFECTS + 1
/** Size of the obs spec 2 layout (base + navigation). Checkpoints of that spec have this many inputs. */
export const NAV_OBS_SIZE = BASE_OBS_SIZE + NAV_FEATURE_COUNT
/** Size of the obs spec 3 layout (spec 2 + the other players' effects). */
export const EFFECTS_OBS_SIZE = NAV_OBS_SIZE + EFFECT_FEATURE_COUNT
/**
 * Then short-term memory, appended in obs spec 4: the seat's last three actions (newest first, each
 * as its heading dx, dy; zero for stop or before the first decisions), then, for each of the seven
 * players of indices 16–71 in the same order, where they stood 0.5 s and 1 s ago (dx/width,
 * dy/height from the seat's current position).
 */
export const MEMORY_ACTIONS = 3
export const MEMORY_AGO_TICKS: readonly number[] = [10, 20]
export const MEMORY_FEATURE_COUNT = MEMORY_ACTIONS * 2 + OTHER_COUNT * MEMORY_AGO_TICKS.length * 2
/** Size of the obs spec 4 layout (spec 3 + short-term memory). */
export const MEMORY_OBS_SIZE = EFFECTS_OBS_SIZE + MEMORY_FEATURE_COUNT
/**
 * Then boost pads, appended in obs spec 5: the seat's own launch timer (launchMs / LAUNCH_MS, while a
 * pad carries it and steering is ignored), then the two nearest pads (by distance, ties by arena
 * order), five features each: dx/width, dy/height, the unit direction the pad fires (dx, dy), present.
 */
export const PAD_SLOTS = 2
export const PAD_FEATURE_COUNT = 1 + PAD_SLOTS * 5
/** Size of the obs spec 5 layout (spec 4 + boost pads). */
export const PADS_OBS_SIZE = MEMORY_OBS_SIZE + PAD_FEATURE_COUNT
/**
 * Then obs spec 6, four blocks: the open portal (9), ten seconds of the seat's own motion (9), the
 * 3 × 3 visit-recency patch around it (9), and room to move (4). See `spec6Features`.
 */
export const PORTAL_FEATURE_COUNT = 9
export const LONG_MOTION_FEATURE_COUNT = 9
export const VISIT_FEATURE_COUNT = 9
export const ROOM_FEATURE_COUNT = 4
export const SPEC6_FEATURE_COUNT =
    PORTAL_FEATURE_COUNT + LONG_MOTION_FEATURE_COUNT + VISIT_FEATURE_COUNT + ROOM_FEATURE_COUNT
export const OBS_SIZE = PADS_OBS_SIZE + SPEC6_FEATURE_COUNT
/** Long motion windows (ticks: 3, 6 and 10 s) and their displacement scale (arena units). */
export const LONG_WINDOWS: readonly number[] = [60, 120, 200]
const LONG_SCALE = 20
/** "Still here": within this many units of where the seat stands now. */
export const DWELL_RADIUS = 4
/** An arena corner is within this many units of two borders (as `behavior.ts` in the training tools). */
export const CORNER_ZONE = 6
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
    /** Every player's positions, one per 50 ms tick (spec 4). Missing: players are seen where they are now. */
    trails?: ReadonlyMap<number, MotionHistory>
    /** The seat's actions so far, oldest first (spec 4). */
    actions?: readonly number[]
    /** Ten seconds of the seat's positions, one per 50 ms tick (spec 6, `longHistory`). */
    long?: MotionHistory
    /** When the seat last stood in each coarse square (spec 6). */
    visits?: VisitMap
}

/** Stable egocentric features, the layout the trained policy was trained on, documented with the training tools (`tools/bot-training/README.md`). */
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
    for (let i = 0; i < OTHER_COUNT; i++) {
        const player = others[i]
        features.push(
            ...(player
                ? [
                      clamp(player.shieldMs / 5000),
                      clamp(player.ghostMs / 3000),
                      clamp(player.tinyMs / 5000),
                      clamp(player.speedMs / 4000),
                      clamp(player.slipMs / 1500),
                      clamp(player.reverseMs / 4000),
                  ]
                : new Array<number>(OTHER_EFFECTS).fill(0))
        )
    }
    features.push(Number(game.mode === 'killer'))
    const { trails, actions = [] } = aux
    for (let k = 1; k <= MEMORY_ACTIONS; k++) {
        const action = actions[actions.length - k] ?? 0
        // Action a (1..16) heads at (a - 1) / 16 of a turn, as in `policy.actionInput`.
        const angle = ((action - 1) / 16) * Math.PI * 2
        features.push(action === 0 ? 0 : Math.cos(angle), action === 0 ? 0 : Math.sin(angle))
    }
    for (let i = 0; i < OTHER_COUNT; i++) {
        const player = others[i]
        for (const ticks of MEMORY_AGO_TICKS) {
            if (!player) {
                features.push(0, 0)
                continue
            }
            const moved = trails?.get(player.id)?.displacement(ticks) ?? {
                dx: 0,
                dy: 0,
            }
            features.push(clamp((player.x - moved.dx - me.x) / width), clamp((player.y - moved.dy - me.y) / height))
        }
    }
    features.push(clamp(me.launchMs / LAUNCH_MS))
    const pads = game.arena.pads
        .map((pad, index) => ({
            pad,
            index,
            distance: Math.hypot(pad.x - me.x, pad.y - me.y),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
    for (let i = 0; i < PAD_SLOTS; i++) {
        const near = pads[i]?.pad
        features.push(
            ...(near
                ? [clamp((near.x - me.x) / width), clamp((near.y - me.y) / height), near.dx, near.dy, 1]
                : [0, 0, 0, 0, 0])
        )
    }
    features.push(...spec6Features(game, me, aux))
    if (features.length !== OBS_SIZE) throw new Error('Observation layout mismatch')
    return features
}

/**
 * Obs spec 6 (indices 225–255, documented with the training tools):
 * - portal: nearer end dx/width, dy/height; far end dx/width, dy/height; present; lifetime left
 *   / PORTAL_LIFETIME_MS; own portal cooldown / PORTAL_COOLDOWN_MS; walk to the nearer end / 30 (1
 *   when out of reach); what going through gains / 30 (see `SeatNav.portalGain`).
 * - long motion: displacement over 3, 6 and 10 s (dx, dy / 20 units); over the last 3 s, distance
 *   made good over distance walked (1 when it barely walked); the share of the last 10 s spent within
 *   DWELL_RADIUS of here; how long it has been within DWELL_RADIUS of here / 10 s.
 * - visits: the 3 × 3 recency patch (`VisitMap.patch`).
 * - room: territory against the holder, mobility, in an arena corner (0/1), distance to the nearest
 *   arena corner / 20.
 */
function spec6Features(
    game: GameState,
    me: GameState['players'][number],
    { nav, long, visits }: ObservationAux
): number[] {
    if (me.out) return new Array<number>(SPEC6_FEATURE_COUNT).fill(0)
    const { width, height } = game.arena
    const out: number[] = []
    const portal = nearestPortal(game, me.x, me.y)
    if (portal) {
        const walk = nav?.portalWalk
        out.push(
            clamp((portal.near.x - me.x) / width),
            clamp((portal.near.y - me.y) / height),
            clamp((portal.far.x - me.x) / width),
            clamp((portal.far.y - me.y) / height),
            1,
            clamp((portal.expiresAtMs - game.elapsedMs) / PORTAL_LIFETIME_MS),
            clamp((me.portalCooldownMs ?? 0) / PORTAL_COOLDOWN_MS),
            walk === null || walk === undefined ? 1 : clamp(walk / NAV_RANGE),
            clamp((nav?.portalGain ?? 0) / NAV_RANGE)
        )
    } else out.push(0, 0, 0, 0, 0, 0, clamp((me.portalCooldownMs ?? 0) / PORTAL_COOLDOWN_MS), 0, 0)
    for (const ticks of LONG_WINDOWS) {
        const then = long?.ago(ticks) ?? me
        out.push(clamp((me.x - then.x) / LONG_SCALE), clamp((me.y - then.y) / LONG_SCALE))
    }
    out.push(...dwellFeatures(me, long))
    out.push(...(visits?.patch(me.x, me.y, game.elapsedMs) ?? new Array<number>(9).fill(0)))
    const toX = Math.min(me.x, width - me.x)
    const toY = Math.min(me.y, height - me.y)
    out.push(
        nav?.territory ?? 0,
        nav?.mobility ?? 0,
        Number(toX < CORNER_ZONE && toY < CORNER_ZONE),
        clamp(Math.hypot(toX, toY) / 20)
    )
    return out
}

/** Path efficiency over 3 s, share of 10 s spent near here, time near here. */
function dwellFeatures(me: { x: number; y: number }, long: MotionHistory | undefined): number[] {
    if (!long || long.ticks === 0) return [1, 0, 0]
    const window = LONG_WINDOWS[0] as number
    let path = 0
    let previous = long.ago(0)
    for (let back = 1; back <= Math.min(window, long.ticks); back++) {
        const p = long.ago(back)
        // A portal jump is not walking.
        path += Math.min(1.5, Math.hypot(p.x - previous.x, p.y - previous.y))
        previous = p
    }
    const net = Math.hypot(me.x - long.ago(window).x, me.y - long.ago(window).y)
    const span = LONG_WINDOWS[LONG_WINDOWS.length - 1] as number
    let near = 0
    let since = -1
    for (let back = 1; back <= span; back++) {
        if (back > long.ticks) break
        const p = long.ago(back)
        if (Math.hypot(p.x - me.x, p.y - me.y) < DWELL_RADIUS) near++
        else if (since < 0) since = back - 1
    }
    if (since < 0) since = Math.min(span, long.ticks)
    return [path < 1 ? 1 : Math.min(1, net / path), near / span, since / span]
}

/** The appended block, indices BASE_OBS_SIZE.. (documented in `tools/bot-training/README.md`). `feelers` are the 16 free runs / 8. */
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
