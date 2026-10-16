import { type Arena, AVATAR_RADIUS, PAD_RADIUS } from './arena.ts'
import { contactWith } from './geometry.ts'
import {
    type Effect,
    findItemSpot,
    FIRST_ITEM_MS,
    FREEZE_BOMB_MS,
    FREEZE_RADIUS,
    GHOST_MS,
    ITEM_LIFETIME_MS,
    ITEM_RADIUS,
    type Item,
    type ItemKind,
    MAGNET_MS,
    MAGNET_PULL,
    MAGNET_RADIUS,
    MAX_ITEMS,
    nextItemDelay,
    pickKind,
    reveal,
    REVERSE_MS,
    SHIELD_MS,
    SLIP_MS,
    SPEED_BOOST,
    SPEED_MS,
    TINY_MS,
    TINY_RADIUS,
} from './items.ts'
import type { Vec } from './geometry.ts'
import { pickOne, randomBetween, type Rng } from './rng.ts'
import { THEMES, type Theme } from './themes.ts'

export const MAX_SPEED = 11
export const ACCELERATION = 45
/** The potato holder hunts a bit faster than everyone else. */
export const HOLDER_BOOST = 1.1
/** A receiver stands still this long, giving the passer time to escape. */
export const FREEZE_MS = 2000
/** Pause between a boom and the next potato. */
export const RESPAWN_MS = 2000
export const FUSE_MIN_MS = 15_000
export const FUSE_MAX_MS = 30_000
/** The potato starts shaking this long before it blows. */
export const SHAKE_WINDOW_MS = 5000
/** King of the Potato: carrying it slows the king down, so the pack can catch up. */
export const KING_SLOWDOWN = 0.9
/** A new king can't be robbed for this long, so the potato doesn't flip back every frame. */
export const STEAL_SAFETY_MS = 2000
/** Killer Potato: the hunter stands frozen this long at the start, a head start for everyone else. */
export const HUNTER_HEAD_START_MS = 3000
/**
 * Killer Potato: the hunter's fuse. It never burns; it is what an AI hunter's policy
 * reads as "time left", and a short fuse keeps a holder chasing.
 */
export const KILLER_FUSE_MS = 6000
/** Infection: the infected hunt a bit faster than the clean, so a game never stalls. */
export const INFECTED_BOOST = 1.1
/** Infection: someone just infected stands still this long, so it can't spread through a crowd at once. */
export const INFECTED_FREEZE_MS = 1000
/**
 * Infection: each catch goes off like a blast. Everyone within the radius but the one caught
 * (the carrier too) is thrown clear at this speed, with no steering for a moment, so one
 * person gets caught at a time.
 */
export const INFECTION_BLAST_RADIUS = 6
export const INFECTION_BLAST_SPEED = 20
export const INFECTION_BLAST_MS = 300
/** Portals: how close to an end takes you through, and how long they then ignore you. */
export const PORTAL_RADIUS = 1.1
export const PORTAL_COOLDOWN_MS = 1000
export const FIRST_PORTAL_MS = 20_000
export const PORTAL_INTERVAL_MIN_MS = 25_000
export const PORTAL_INTERVAL_MAX_MS = 40_000
export const PORTAL_LIFETIME_MS = 12_000
/** A pair's two ends are at least this share of the arena's width apart. */
export const PORTAL_SPREAD = 0.4
/** Tries at a far enough pair before giving up until the next one is due. */
const PORTAL_ATTEMPTS = 12
/** A boost pad fires you at this speed, past the usual top speed, with no steering for LAUNCH_MS. */
export const LAUNCH_SPEED = 24
export const LAUNCH_MS = 350
/** After a launch, pads ignore you this long, so landing on one doesn't fire you again at once. */
export const PAD_COOLDOWN_MS = 600
/** Physics runs in fixed slices so fast avatars never tunnel through each other. */
const SUBSTEP_MS = 25
/** Avatars bounce off each other like bumper cars, with at least this much kick. */
const BUMP_RESTITUTION = 0.9
const MIN_BUMP_SPEED = 5
/** Touch tolerance on top of two radii. */
const TOUCH_SLACK = 0.05
/** How far, in rings of half a unit, a ghost who ends up inside an obstacle is searched a way out. */
const EJECT_RINGS = 40
const EJECT_ANGLES = 24

/**
 * `survival`: pass the potato before it blows; the last ones standing win.
 * `king`: everyone wants the potato; the longest held wins, nobody blows up.
 */
/**
 * `survival`: pass the potato before it blows. `king`: hold it as long as you can.
 * `killer` (Killer Potato): one AI hunter holds it all game and its touch knocks you out.
 * `infection`: no potato; patient zero's touch infects, and the infected hunt with them.
 */
export type GameMode = 'survival' | 'king' | 'killer' | 'infection'

export interface Input {
    dx: number
    dy: number
}

export interface SimPlayer {
    id: number
    x: number
    y: number
    vx: number
    vy: number
    frozenMs: number
    out: boolean
    eliminatedAtMs: number | null
    holdMs: number
    passes: number
    /** Time left on each item effect; 0 when not active. */
    shieldMs: number
    speedMs: number
    slipMs: number
    ghostMs: number
    reverseMs: number
    magnetMs: number
    tinyMs: number
    /** Flying off a boost pad: no steering until it runs out. */
    launchMs: number
    /** Pads ignore you until this runs out. */
    padCooldownMs: number
    /** King of the Potato: a fresh king can't be robbed until this runs out. */
    safeMs: number
    /** Infection: when they caught it; null while clean. */
    infectedAtMs: number | null
    /** Portals ignore you until this runs out. */
    portalCooldownMs: number
}

/** Two linked ends: step into one, come out of the other. */
export interface Portal {
    id: number
    a: Vec
    b: Vec
    expiresAtMs: number
}

export interface GameState {
    mode: GameMode
    arena: Arena
    durationMs: number
    elapsedMs: number
    players: SimPlayer[]
    holderId: number | null
    /** Remaining fuse on the current potato. Never sent to clients. */
    fuseMs: number
    /** Killer Potato: the seat that holds the potato all game; null in the other modes. */
    hunterId: number | null
    /** Countdown to the next potato after a boom; 0 while a potato is in play. */
    respawnMs: number
    items: Item[]
    /** When the next item drops; never, to play without items. */
    nextItemAtMs: number
    nextItemId: number
    /** At most one pair open at a time. */
    portals: Portal[]
    /** When the next pair opens; never, to play without portals. */
    nextPortalAtMs: number
    nextPortalId: number
    ended: boolean
}

export type GameEvent =
    | { kind: 'pass'; from: number; to: number }
    | { kind: 'boom'; playerId: number }
    | { kind: 'newPotato'; playerId: number }
    /** `targetId`: who a swap traded places with; absent when nobody could be swapped. */
    | { kind: 'pickup'; playerId: number; item: ItemKind; effect: Effect; targetId?: number }
    /** Infection: `by` caught `playerId`. */
    | { kind: 'infected'; playerId: number; by: number }
    /** Infection: the last infected player left, and `playerId` carries it now. */
    | { kind: 'patientZero'; playerId: number }
    | { kind: 'teleport'; playerId: number; portalId: number }
    /** Survivors, or in King of the Potato the longest holders (ties share). */
    | { kind: 'ended'; survivorIds: number[] }

export function createGame(
    arena: Arena,
    playerIds: number[],
    durationMs: number,
    rng: Rng,
    mode: GameMode = 'survival',
    /** Killer Potato only: the hunter's seat, one of `playerIds`. */
    hunterId: number | null = null
): GameState {
    if (mode === 'killer' && (hunterId === null || !playerIds.includes(hunterId)))
        throw new Error('Killer Potato needs a hunter among the players')
    const players = playerIds.map((id, i): SimPlayer => {
        const spawn = arena.spawns[i % arena.spawns.length] ?? { x: arena.width / 2, y: arena.height / 2 }

        return {
            id,
            x: spawn.x,
            y: spawn.y,
            vx: 0,
            vy: 0,
            frozenMs: 0,
            out: false,
            eliminatedAtMs: null,
            holdMs: 0,
            passes: 0,
            shieldMs: 0,
            speedMs: 0,
            slipMs: 0,
            ghostMs: 0,
            reverseMs: 0,
            magnetMs: 0,
            tinyMs: 0,
            launchMs: 0,
            padCooldownMs: 0,
            safeMs: 0,
            infectedAtMs: null,
            portalCooldownMs: 0,
        }
    })
    // Infection has no potato: patient zero carries it instead, after the same head start as a hunter.
    if (mode === 'infection') {
        const patientZero = pickOne(rng, players)
        patientZero.infectedAtMs = 0
        patientZero.frozenMs = HUNTER_HEAD_START_MS
    }
    const holderId = mode === 'killer' ? hunterId : mode === 'infection' ? null : pickOne(rng, playerIds)
    const firstKing = players.find(p => p.id === holderId)
    if (mode === 'king' && firstKing) firstKing.safeMs = STEAL_SAFETY_MS
    if (mode === 'killer' && firstKing) firstKing.frozenMs = HUNTER_HEAD_START_MS

    return {
        mode,
        arena,
        durationMs,
        elapsedMs: 0,
        players,
        holderId,
        fuseMs: mode === 'killer' ? KILLER_FUSE_MS : mode === 'infection' ? 0 : newFuse(rng),
        hunterId: mode === 'killer' ? hunterId : null,
        respawnMs: 0,
        items: [],
        nextItemAtMs: FIRST_ITEM_MS,
        nextItemId: 1,
        portals: [],
        nextPortalAtMs: FIRST_PORTAL_MS,
        nextPortalId: 1,
        ended: false,
    }
}

/**
 * Advances the game by `dtMs`, mutating `game`. Inputs are each player's
 * latest direction; anyone missing coasts. Returns what happened, in order.
 */
export function step(game: GameState, inputs: ReadonlyMap<number, Input>, dtMs: number, rng: Rng): GameEvent[] {
    const events: GameEvent[] = []
    const theme = THEMES[game.arena.theme]
    let remaining = dtMs

    while (remaining > 0 && !game.ended) {
        const slice = Math.min(SUBSTEP_MS, remaining)
        remaining -= slice
        game.elapsedMs += slice

        tickEffects(game, slice)
        spawnItems(game, rng)
        spawnPortals(game, rng)
        launchFromPads(game)
        pullTowardMagnets(game, slice)
        move(game, inputs, slice, theme)
        collide(game, theme)
        travelThroughPortals(game, events)
        pickUpItems(game, rng, events)
        if (game.mode === 'king') {
            stealPotato(game, events)
            countReign(game, slice, rng, events)
        } else if (game.mode === 'killer') {
            catchPrey(game, slice, events)
        } else if (game.mode === 'infection') {
            spread(game, slice, events)
        } else {
            passPotato(game, events)
            burnFuse(game, slice, rng, events)
        }
        checkEnd(game, events)
    }

    return events
}

/** Takes a player out of the game: they left or their connection dropped. */
export function removePlayer(game: GameState, playerId: number, rng: Rng): GameEvent[] {
    const events: GameEvent[] = []
    const leaving = game.players.find(p => p.id === playerId)
    if (game.ended || !leaving || leaving.out) return events

    eliminate(game, leaving)

    // Killer Potato has one hunter: if it goes, nobody else takes the potato and the round ends.
    if (game.holderId === playerId) {
        game.holderId = null
        if (game.mode !== 'killer') handOutPotato(game, rng, events)
    }

    if (game.mode === 'infection') passInfectionOn(game, rng, events)

    checkEnd(game, events)

    return events
}

/** 0 until the last few seconds of the fuse, then rising to 1. The only fuse hint clients get. */
export function shakeLevel(game: GameState): number {
    if (game.mode !== 'survival' || game.holderId === null) return 0

    return Math.min(1, Math.max(0, 1 - game.fuseMs / SHAKE_WINDOW_MS))
}

export function alivePlayers(game: GameState): SimPlayer[] {
    return game.players.filter(p => !p.out)
}

/** A tiny player is smaller for everything: bumping, tagging, items, pads and walls. */
export function radiusOf(p: SimPlayer): number {
    return p.tinyMs > 0 ? TINY_RADIUS : AVATAR_RADIUS
}

/** Rolling over a pad fires you its way, unless you're frozen, slipping, or it just fired you. */
function launchFromPads(game: GameState) {
    for (const p of alivePlayers(game)) {
        if (p.frozenMs > 0 || p.slipMs > 0 || p.padCooldownMs > 0) continue

        const pad = game.arena.pads.find(candidate => Math.hypot(candidate.x - p.x, candidate.y - p.y) <= PAD_RADIUS)
        if (!pad) continue

        p.vx = pad.dx * LAUNCH_SPEED
        p.vy = pad.dy * LAUNCH_SPEED
        p.launchMs = LAUNCH_MS
        p.padCooldownMs = LAUNCH_MS + PAD_COOLDOWN_MS
    }
}

/** A magnet tugs everyone in range toward its owner, harder the closer they are. Shields, ghosts and statues hold. */
function pullTowardMagnets(game: GameState, sliceMs: number) {
    const dt = sliceMs / 1000
    const alive = alivePlayers(game)

    for (const magnet of alive.filter(p => p.magnetMs > 0)) {
        for (const p of alive) {
            if (p.id === magnet.id || p.frozenMs > 0 || p.shieldMs > 0 || p.ghostMs > 0) continue

            const dx = magnet.x - p.x
            const dy = magnet.y - p.y
            const distance = Math.hypot(dx, dy)
            if (distance === 0 || distance >= MAGNET_RADIUS) continue

            const pull = MAGNET_PULL * (1 - distance / MAGNET_RADIUS) * dt
            p.vx += (dx / distance) * pull
            p.vy += (dy / distance) * pull
        }
    }
}

function move(game: GameState, inputs: ReadonlyMap<number, Input>, sliceMs: number, theme: Theme) {
    const dt = sliceMs / 1000
    const damping = Math.exp(-theme.physics.friction * dt)

    for (const p of alivePlayers(game)) {
        if (p.frozenMs > 0) {
            p.frozenMs = Math.max(0, p.frozenMs - sliceMs)
            p.vx = 0
            p.vy = 0
            continue
        }

        // On a banana or off a pad: no steering and no grip, you keep whatever speed you had.
        if (p.slipMs > 0 || p.launchMs > 0) {
            p.x += p.vx * dt
            p.y += p.vy * dt
            continue
        }

        const holding =
            p.id === game.holderId
                ? game.mode === 'king'
                    ? KING_SLOWDOWN
                    : HOLDER_BOOST
                : p.infectedAtMs !== null
                  ? INFECTED_BOOST
                  : 1
        const boost = holding * (p.speedMs > 0 ? SPEED_BOOST : 1)
        const input = normalise(inputs.get(p.id))
        const direction = p.reverseMs > 0 ? -1 : 1
        const accel = ACCELERATION * theme.physics.grip * boost * direction

        p.vx = (p.vx + input.dx * accel * dt) * damping
        p.vy = (p.vy + input.dy * accel * dt) * damping

        const speed = Math.hypot(p.vx, p.vy)
        const max = MAX_SPEED * boost
        if (speed > max) {
            p.vx *= max / speed
            p.vy *= max / speed
        }

        p.x += p.vx * dt
        p.y += p.vy * dt
    }
}

function collide(game: GameState, theme: Theme) {
    const alive = alivePlayers(game)

    // Avatars against each other. A frozen avatar is a statue: it doesn't budge. A ghost touches nobody.
    for (const [i, a] of alive.entries()) {
        for (const b of alive.slice(i + 1)) {
            if (a.ghostMs > 0 || b.ghostMs > 0) continue

            const dx = b.x - a.x
            const dy = b.y - a.y
            const distance = Math.hypot(dx, dy)
            const overlap = radiusOf(a) + radiusOf(b) - distance
            if (overlap <= 0) continue

            const nx = distance === 0 ? 1 : dx / distance
            const ny = distance === 0 ? 0 : dy / distance
            const aFixed = a.frozenMs > 0
            const bFixed = b.frozenMs > 0
            if (aFixed && bFixed) continue

            const aShare = aFixed ? 0 : bFixed ? 1 : 0.5
            const bShare = 1 - aShare
            a.x -= nx * overlap * aShare
            a.y -= ny * overlap * aShare
            b.x += nx * overlap * bShare
            b.y += ny * overlap * bShare

            const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
            if (closing <= 0) continue

            // Equal masses split the kick; against a statue the mover takes all of it.
            const kick = Math.max(closing * (1 + BUMP_RESTITUTION), MIN_BUMP_SPEED)
            a.vx -= nx * kick * aShare
            a.vy -= ny * kick * aShare
            b.vx += nx * kick * bShare
            b.vy += ny * kick * bShare
        }
    }

    // Obstacles and walls last, so nobody is ever left inside one. Ghosts drift through obstacles.
    for (const p of alive) {
        const r = radiusOf(p)

        if (p.ghostMs <= 0) {
            // A ghost that wore off deep inside a wall comes out at the nearest open spot.
            if (game.arena.obstacles.some(o => contactWith(p, o, game.elapsedMs).distance < 0)) {
                const spot = nearestOpenSpot(game, p.x, p.y, r)
                p.x = spot.x
                p.y = spot.y
            }

            for (const obstacle of game.arena.obstacles) {
                const contact = contactWith(p, obstacle, game.elapsedMs)
                const overlap = r - contact.distance
                if (overlap <= 0) continue

                p.x += contact.nx * overlap
                p.y += contact.ny * overlap
                bounce(p, contact.nx, contact.ny, theme.physics.restitution)
            }
        }

        if (p.x < r) {
            p.x = r
            bounce(p, 1, 0, theme.physics.restitution)
        }
        if (p.x > game.arena.width - r) {
            p.x = game.arena.width - r
            bounce(p, -1, 0, theme.physics.restitution)
        }
        if (p.y < r) {
            p.y = r
            bounce(p, 0, 1, theme.physics.restitution)
        }
        if (p.y > game.arena.height - r) {
            p.y = game.arena.height - r
            bounce(p, 0, -1, theme.physics.restitution)
        }
    }
}

/** The closest spot, ring by ring, where an avatar of radius `r` touches no obstacle and no wall. */
function nearestOpenSpot(game: GameState, x: number, y: number, r: number): { x: number; y: number } {
    const { width, height, obstacles } = game.arena
    const open = (point: { x: number; y: number }) =>
        point.x >= r &&
        point.y >= r &&
        point.x <= width - r &&
        point.y <= height - r &&
        obstacles.every(o => contactWith(point, o, game.elapsedMs).distance >= r)

    for (let ring = 1; ring <= EJECT_RINGS; ring++) {
        const distance = ring * 0.5
        for (let i = 0; i < EJECT_ANGLES; i++) {
            const angle = (i / EJECT_ANGLES) * Math.PI * 2
            const point = { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance }
            if (open(point)) return point
        }
    }

    return { x, y }
}

/** Reflects the velocity component heading into a surface. */
function bounce(p: SimPlayer, nx: number, ny: number, restitution: number) {
    const into = p.vx * nx + p.vy * ny
    if (into >= 0) return

    p.vx -= (1 + restitution) * into * nx
    p.vy -= (1 + restitution) * into * ny
}

/** Two avatars in contact. A ghost is untouchable: it can't tag, be tagged, pass or steal. */
function touching(a: SimPlayer, b: SimPlayer): boolean {
    if (a.ghostMs > 0 || b.ghostMs > 0) return false

    return Math.hypot(a.x - b.x, a.y - b.y) <= radiusOf(a) + radiusOf(b) + TOUCH_SLACK
}

function passPotato(game: GameState, events: GameEvent[]) {
    const holder = game.players.find(p => p.id === game.holderId)
    if (!holder || holder.out || holder.frozenMs > 0) return

    const receiver = alivePlayers(game).find(p => p.id !== holder.id && p.shieldMs <= 0 && touching(p, holder))
    if (!receiver) return

    game.holderId = receiver.id
    freeze(receiver)
    holder.passes++
    events.push({ kind: 'pass', from: holder.id, to: receiver.id })
}

function burnFuse(game: GameState, sliceMs: number, rng: Rng, events: GameEvent[]) {
    if (game.holderId === null) {
        game.respawnMs -= sliceMs
        if (game.respawnMs <= 0) handOutPotato(game, rng, events)

        return
    }

    const holder = game.players.find(p => p.id === game.holderId)
    if (holder) holder.holdMs += sliceMs

    game.fuseMs -= sliceMs
    if (game.fuseMs > 0 || !holder) return

    eliminate(game, holder)
    game.holderId = null
    game.respawnMs = RESPAWN_MS
    events.push({ kind: 'boom', playerId: holder.id })
}

function handOutPotato(game: GameState, rng: Rng, events: GameEvent[]) {
    const alive = alivePlayers(game)
    game.respawnMs = 0
    if (alive.length < 2) return

    // A crown lost to a leaver goes straight to someone else, with the usual head start.
    if (game.mode === 'king') {
        const heir = pickOne(rng, alive)
        game.holderId = heir.id
        heir.safeMs = STEAL_SAFETY_MS
        events.push({ kind: 'newPotato', playerId: heir.id })
        return
    }

    // Shields and ghosts hold against a fresh potato too, unless that's everyone left.
    const unshielded = alive.filter(p => p.shieldMs <= 0 && p.ghostMs <= 0)
    const next = pickOne(rng, unshielded.length > 0 ? unshielded : alive)
    game.holderId = next.id
    game.fuseMs = newFuse(rng)
    freeze(next)
    events.push({ kind: 'newPotato', playerId: next.id })
}

function eliminate(game: GameState, p: SimPlayer) {
    p.out = true
    p.eliminatedAtMs = game.elapsedMs
    p.vx = 0
    p.vy = 0
    p.shieldMs = 0
    p.speedMs = 0
    p.slipMs = 0
    p.ghostMs = 0
    p.reverseMs = 0
    p.magnetMs = 0
    p.tinyMs = 0
    p.launchMs = 0
    p.safeMs = 0
}

/** Getting the potato (or caught in a freeze bomb) stops you dead, banana, pad or not. */
function freeze(p: SimPlayer, ms = FREEZE_MS) {
    p.frozenMs = Math.max(p.frozenMs, ms)
    p.slipMs = 0
    p.launchMs = 0
    p.vx = 0
    p.vy = 0
}

function tickEffects(game: GameState, sliceMs: number) {
    const tick = (ms: number) => Math.max(0, ms - sliceMs)

    for (const p of alivePlayers(game)) {
        p.shieldMs = tick(p.shieldMs)
        p.speedMs = tick(p.speedMs)
        p.slipMs = tick(p.slipMs)
        p.ghostMs = tick(p.ghostMs)
        p.reverseMs = tick(p.reverseMs)
        p.magnetMs = tick(p.magnetMs)
        p.tinyMs = tick(p.tinyMs)
        p.launchMs = tick(p.launchMs)
        p.padCooldownMs = tick(p.padCooldownMs)
        p.safeMs = tick(p.safeMs)
        p.portalCooldownMs = tick(p.portalCooldownMs)
    }
}

/** Clears out stale items and drops a new one when it's due. */
function spawnItems(game: GameState, rng: Rng) {
    game.items = game.items.filter(item => item.expiresAtMs > game.elapsedMs)
    if (game.elapsedMs < game.nextItemAtMs) return

    game.nextItemAtMs = game.elapsedMs + nextItemDelay(rng)
    if (game.items.length >= MAX_ITEMS) return

    const spot = findItemSpot(game.arena, alivePlayers(game), game.items, rng)
    if (!spot) return

    game.items.push({
        id: game.nextItemId++,
        kind: pickKind(rng),
        x: spot.x,
        y: spot.y,
        expiresAtMs: game.elapsedMs + ITEM_LIFETIME_MS,
    })
}

/** Closes a pair that ran out, and opens the next one when it's due: two far-apart spots of open floor. */
function spawnPortals(game: GameState, rng: Rng) {
    game.portals = game.portals.filter(portal => portal.expiresAtMs > game.elapsedMs)
    if (game.elapsedMs < game.nextPortalAtMs) return

    game.nextPortalAtMs =
        game.elapsedMs + Math.round(randomBetween(rng, PORTAL_INTERVAL_MIN_MS, PORTAL_INTERVAL_MAX_MS))
    if (game.portals.length > 0) return

    const players = alivePlayers(game)
    for (let attempt = 0; attempt < PORTAL_ATTEMPTS; attempt++) {
        const a = findItemSpot(game.arena, players, game.items, rng)
        const b = a && findItemSpot(game.arena, players, [...game.items, a], rng)
        if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < game.arena.width * PORTAL_SPREAD) continue

        game.portals.push({ id: game.nextPortalId++, a, b, expiresAtMs: game.elapsedMs + PORTAL_LIFETIME_MS })
        return
    }
}

/** Stepping into one end puts you at the other, same speed, potato and all. */
function travelThroughPortals(game: GameState, events: GameEvent[]) {
    for (const portal of game.portals) {
        for (const p of alivePlayers(game)) {
            if (p.frozenMs > 0 || p.portalCooldownMs > 0) continue

            const atA = Math.hypot(p.x - portal.a.x, p.y - portal.a.y) <= PORTAL_RADIUS
            const atB = !atA && Math.hypot(p.x - portal.b.x, p.y - portal.b.y) <= PORTAL_RADIUS
            if (!atA && !atB) continue

            const exit = atA ? portal.b : portal.a
            p.x = exit.x
            p.y = exit.y
            p.portalCooldownMs = PORTAL_COOLDOWN_MS
            events.push({ kind: 'teleport', playerId: p.id, portalId: portal.id })
        }
    }
}

/**
 * Infection: every infected player who can move infects the clean, unshielded players
 * they touch; those stand still a moment. Time spent clean is each player's `holdMs`.
 */
function spread(game: GameState, sliceMs: number, events: GameEvent[]) {
    const alive = alivePlayers(game)
    for (const p of alive) if (p.infectedAtMs === null) p.holdMs += sliceMs

    // Thrown by a blast (or a pad), a carrier can't catch anyone until it lands.
    const carriers = alive.filter(p => p.infectedAtMs !== null && p.frozenMs <= 0 && p.launchMs <= 0)
    for (const carrier of carriers) {
        const prey = alive.find(p => p.infectedAtMs === null && p.shieldMs <= 0 && touching(p, carrier))
        if (!prey) continue

        prey.infectedAtMs = game.elapsedMs
        freeze(prey, INFECTED_FREEZE_MS)
        carrier.passes++
        events.push({ kind: 'infected', playerId: prey.id, by: carrier.id })
        blast(game, prey)
        // One catch at a time: the blast has cleared everyone else away for this step.
        return
    }
}

/** Throws everyone near `centre` (but `centre`) straight away from it, ghosts aside. */
function blast(game: GameState, centre: SimPlayer) {
    for (const p of alivePlayers(game)) {
        if (p.id === centre.id || p.ghostMs > 0) continue

        const dx = p.x - centre.x
        const dy = p.y - centre.y
        const distance = Math.hypot(dx, dy)
        if (distance >= INFECTION_BLAST_RADIUS) continue

        // Right on top of the centre: any way out will do.
        const nx = distance === 0 ? 1 : dx / distance
        const ny = distance === 0 ? 0 : dy / distance
        p.frozenMs = 0
        p.slipMs = 0
        p.vx = nx * INFECTION_BLAST_SPEED
        p.vy = ny * INFECTION_BLAST_SPEED
        p.launchMs = Math.max(p.launchMs, INFECTION_BLAST_MS)
    }
}

/**
 * Infection: the last infected player left. One of the clean becomes patient zero, with the
 * same head start as at the start, while that still leaves two clean to chase (three left);
 * with fewer, nobody takes it and the game ends, the clean winning.
 */
function passInfectionOn(game: GameState, rng: Rng, events: GameEvent[]) {
    const alive = alivePlayers(game)
    if (alive.some(p => p.infectedAtMs !== null)) return
    if (alive.length < 3) return

    const zero = pickOne(rng, alive)
    zero.infectedAtMs = game.elapsedMs
    zero.frozenMs = HUNTER_HEAD_START_MS
    events.push({ kind: 'patientZero', playerId: zero.id })
}

/**
 * Infection ends at the timer, when nobody infected is left (they all left), or when
 * one clean player is left (none, for a game that started with a single clean player).
 */
function infectionOver(game: GameState): boolean {
    if (game.elapsedMs >= game.durationMs) return true
    const alive = alivePlayers(game)
    if (!alive.some(p => p.infectedAtMs !== null)) return true
    const clean = alive.filter(p => p.infectedAtMs === null).length
    const startedClean = game.players.length - 1

    return clean <= (startedClean > 1 ? 1 : 0)
}

/** Whoever touches an item takes it, and its effect starts at once (a repeat restarts the timer). */
function pickUpItems(game: GameState, rng: Rng, events: GameEvent[]) {
    for (const item of [...game.items]) {
        const taker = alivePlayers(game).find(p => Math.hypot(p.x - item.x, p.y - item.y) <= radiusOf(p) + ITEM_RADIUS)
        if (!taker) continue

        game.items = game.items.filter(other => other.id !== item.id)
        const effect = reveal(item.kind, rng)
        const event: GameEvent = { kind: 'pickup', playerId: taker.id, item: item.kind, effect }

        switch (effect) {
            case 'shield':
                taker.shieldMs = SHIELD_MS
                break
            case 'speed':
                taker.speedMs = SPEED_MS
                break
            case 'banana':
                // A frozen player is planted: the banana is spent but they don't slide.
                if (taker.frozenMs <= 0) taker.slipMs = SLIP_MS
                break
            case 'ghost':
                taker.ghostMs = GHOST_MS
                break
            case 'reverse':
                taker.reverseMs = REVERSE_MS
                break
            case 'magnet':
                taker.magnetMs = MAGNET_MS
                break
            case 'tiny':
                taker.tinyMs = TINY_MS
                break
            case 'freeze':
                for (const p of alivePlayers(game)) {
                    if (p.id === taker.id || p.shieldMs > 0 || p.ghostMs > 0) continue
                    if (Math.hypot(p.x - taker.x, p.y - taker.y) <= FREEZE_RADIUS) freeze(p, FREEZE_BOMB_MS)
                }
                break
            case 'swap': {
                const targets = alivePlayers(game).filter(p => p.id !== taker.id && p.shieldMs <= 0 && p.ghostMs <= 0)
                if (targets.length === 0) break

                const target = pickOne(rng, targets)
                ;[taker.x, target.x] = [target.x, taker.x]
                ;[taker.y, target.y] = [target.y, taker.y]
                for (const p of [taker, target]) {
                    p.vx = 0
                    p.vy = 0
                    p.launchMs = 0
                }
                event.targetId = target.id
                break
            }
        }

        events.push(event)
    }
}

function checkEnd(game: GameState, events: GameEvent[]) {
    if (game.ended) return

    const alive = alivePlayers(game)
    if (game.mode === 'killer') {
        if (!killerOver(game)) return
    } else if (game.mode === 'infection') {
        if (!infectionOver(game)) return
    } else if (alive.length > 1 && game.elapsedMs < game.durationMs) return

    game.ended = true
    game.holderId = null
    events.push({ kind: 'ended', survivorIds: winnerIds(game) })
}

/**
 * Killer Potato ends when the hunter is gone, when the timer runs out, or when the
 * hunter has caught everyone but one (everyone, in a game that started with one prey).
 */
function killerOver(game: GameState): boolean {
    const hunter = game.players.find(p => p.id === game.hunterId)
    if (!hunter || hunter.out || game.elapsedMs >= game.durationMs) return true
    const prey = alivePlayers(game).filter(p => p.id !== game.hunterId)
    const startedWith = game.players.length - 1

    return prey.length <= (startedWith > 1 ? 1 : 0)
}

/** Killer Potato: the hunter's touch knocks out every unshielded player it reaches. */
function catchPrey(game: GameState, sliceMs: number, events: GameEvent[]) {
    const hunter = game.players.find(p => p.id === game.hunterId)
    if (!hunter || hunter.out) return
    hunter.holdMs += sliceMs
    if (hunter.frozenMs > 0) return

    for (const prey of alivePlayers(game)) {
        if (prey.id === hunter.id || prey.shieldMs > 0 || !touching(prey, hunter)) continue
        eliminate(game, prey)
        hunter.passes++
        events.push({ kind: 'boom', playerId: prey.id })
    }
}

/**
 * Who won: everyone still standing, in Killer Potato everyone but the hunter, in
 * Infection the clean (or the last caught), or in King of the Potato whoever held it longest.
 */
export function winnerIds(game: GameState): number[] {
    const alive = alivePlayers(game)
    if (game.mode === 'killer') return alive.filter(p => p.id !== game.hunterId).map(p => p.id)
    if (game.mode === 'infection') {
        const clean = alive.filter(p => p.infectedAtMs === null)
        if (clean.length > 0) return clean.map(p => p.id)
        // Everyone caught: the last ones caught held out longest.
        const last = Math.max(...alive.map(p => p.infectedAtMs ?? 0))
        return alive.filter(p => p.infectedAtMs === last && last > 0).map(p => p.id)
    }
    if (game.mode !== 'king') return alive.map(p => p.id)

    const best = Math.max(0, ...alive.map(p => p.holdMs))

    return alive.filter(p => p.holdMs === best && best > 0).map(p => p.id)
}

/**
 * King of the Potato: touching the king takes the crown, unless the king is
 * still in their head start, behind a shield or a ghost. The old king isn't frozen.
 */
function stealPotato(game: GameState, events: GameEvent[]) {
    const king = game.players.find(p => p.id === game.holderId)
    if (!king || king.out || king.safeMs > 0 || king.shieldMs > 0) return

    const thief = alivePlayers(game).find(p => p.id !== king.id && touching(p, king))
    if (!thief) return

    game.holderId = thief.id
    thief.safeMs = STEAL_SAFETY_MS
    thief.passes++
    events.push({ kind: 'pass', from: king.id, to: thief.id })
}

/** King of the Potato has no fuse: holding it is the score. */
function countReign(game: GameState, sliceMs: number, rng: Rng, events: GameEvent[]) {
    const king = game.players.find(p => p.id === game.holderId)
    if (king) {
        king.holdMs += sliceMs
        return
    }

    handOutPotato(game, rng, events)
}

function newFuse(rng: Rng): number {
    return Math.round(randomBetween(rng, FUSE_MIN_MS, FUSE_MAX_MS))
}

function normalise(input: Input | undefined): Input {
    if (!input) return { dx: 0, dy: 0 }

    const length = Math.hypot(input.dx, input.dy)
    if (!Number.isFinite(length) || length === 0) return { dx: 0, dy: 0 }

    return length > 1 ? { dx: input.dx / length, dy: input.dy / length } : input
}
