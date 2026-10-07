import { type Arena, AVATAR_RADIUS } from './arena.ts'
import { contactWith } from './geometry.ts'
import {
    type Effect,
    findItemSpot,
    FIRST_ITEM_MS,
    ITEM_LIFETIME_MS,
    ITEM_RADIUS,
    type Item,
    type ItemKind,
    MAX_ITEMS,
    nextItemDelay,
    pickKind,
    reveal,
    SHIELD_MS,
    SLIP_MS,
    SPEED_BOOST,
    SPEED_MS,
} from './items.ts'
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
/** Physics runs in fixed slices so fast avatars never tunnel through each other. */
const SUBSTEP_MS = 25
/** Avatars bounce off each other like bumper cars, with at least this much kick. */
const BUMP_RESTITUTION = 0.9
const MIN_BUMP_SPEED = 5
/** Touch tolerance on top of two radii. */
const TOUCH_SLACK = 0.05

/**
 * `survival`: pass the potato before it blows; the last ones standing win.
 * `king`: everyone wants the potato; the longest held wins, nobody blows up.
 */
export type GameMode = 'survival' | 'king'

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
    /** King of the Potato: a fresh king can't be robbed until this runs out. */
    safeMs: number
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
    /** Countdown to the next potato after a boom; 0 while a potato is in play. */
    respawnMs: number
    items: Item[]
    /** When the next item drops; never, to play without items. */
    nextItemAtMs: number
    nextItemId: number
    ended: boolean
}

export type GameEvent =
    | { kind: 'pass'; from: number; to: number }
    | { kind: 'boom'; playerId: number }
    | { kind: 'newPotato'; playerId: number }
    | { kind: 'pickup'; playerId: number; item: ItemKind; effect: Effect }
    /** Survivors, or in King of the Potato the longest holders (ties share). */
    | { kind: 'ended'; survivorIds: number[] }

export function createGame(
    arena: Arena,
    playerIds: number[],
    durationMs: number,
    rng: Rng,
    mode: GameMode = 'survival'
): GameState {
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
            safeMs: 0,
        }
    })
    const holderId = pickOne(rng, playerIds)
    const firstKing = players.find(p => p.id === holderId)
    if (mode === 'king' && firstKing) firstKing.safeMs = STEAL_SAFETY_MS

    return {
        mode,
        arena,
        durationMs,
        elapsedMs: 0,
        players,
        holderId,
        fuseMs: newFuse(rng),
        respawnMs: 0,
        items: [],
        nextItemAtMs: FIRST_ITEM_MS,
        nextItemId: 1,
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
        move(game, inputs, slice, theme)
        collide(game, theme)
        pickUpItems(game, rng, events)
        if (game.mode === 'king') {
            stealPotato(game, events)
            countReign(game, slice, rng, events)
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

    if (game.holderId === playerId) {
        game.holderId = null
        handOutPotato(game, rng, events)
    }

    checkEnd(game, events)

    return events
}

/** 0 until the last few seconds of the fuse, then rising to 1. The only fuse hint clients get. */
export function shakeLevel(game: GameState): number {
    if (game.mode === 'king' || game.holderId === null) return 0

    return Math.min(1, Math.max(0, 1 - game.fuseMs / SHAKE_WINDOW_MS))
}

export function alivePlayers(game: GameState): SimPlayer[] {
    return game.players.filter(p => !p.out)
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

        // On a banana: no steering and no grip, you keep whatever speed you had.
        if (p.slipMs > 0) {
            p.x += p.vx * dt
            p.y += p.vy * dt
            continue
        }

        const holding = p.id === game.holderId ? (game.mode === 'king' ? KING_SLOWDOWN : HOLDER_BOOST) : 1
        const boost = holding * (p.speedMs > 0 ? SPEED_BOOST : 1)
        const input = normalise(inputs.get(p.id))
        const accel = ACCELERATION * theme.physics.grip * boost

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
    const r = AVATAR_RADIUS
    const alive = alivePlayers(game)

    // Avatars against each other. A frozen avatar is a statue: it doesn't budge.
    for (const [i, a] of alive.entries()) {
        for (const b of alive.slice(i + 1)) {
            const dx = b.x - a.x
            const dy = b.y - a.y
            const distance = Math.hypot(dx, dy)
            const overlap = 2 * r - distance
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

    // Obstacles and walls last, so nobody is ever left inside one.
    for (const p of alive) {
        for (const obstacle of game.arena.obstacles) {
            const contact = contactWith(p, obstacle, game.elapsedMs)
            const overlap = r - contact.distance
            if (overlap <= 0) continue

            p.x += contact.nx * overlap
            p.y += contact.ny * overlap
            bounce(p, contact.nx, contact.ny, theme.physics.restitution)
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

/** Reflects the velocity component heading into a surface. */
function bounce(p: SimPlayer, nx: number, ny: number, restitution: number) {
    const into = p.vx * nx + p.vy * ny
    if (into >= 0) return

    p.vx -= (1 + restitution) * into * nx
    p.vy -= (1 + restitution) * into * ny
}

function passPotato(game: GameState, events: GameEvent[]) {
    const holder = game.players.find(p => p.id === game.holderId)
    if (!holder || holder.out || holder.frozenMs > 0) return

    const reach = 2 * AVATAR_RADIUS + TOUCH_SLACK
    const receiver = alivePlayers(game).find(
        p => p.id !== holder.id && p.shieldMs <= 0 && Math.hypot(p.x - holder.x, p.y - holder.y) <= reach
    )
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

    // Shields hold against a fresh potato too, unless everyone left is behind one.
    const unshielded = alive.filter(p => p.shieldMs <= 0)
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
    p.safeMs = 0
}

/** Getting the potato stops you dead, banana or not. */
function freeze(p: SimPlayer) {
    p.frozenMs = FREEZE_MS
    p.slipMs = 0
    p.vx = 0
    p.vy = 0
}

function tickEffects(game: GameState, sliceMs: number) {
    for (const p of alivePlayers(game)) {
        p.shieldMs = Math.max(0, p.shieldMs - sliceMs)
        p.speedMs = Math.max(0, p.speedMs - sliceMs)
        p.slipMs = Math.max(0, p.slipMs - sliceMs)
        p.safeMs = Math.max(0, p.safeMs - sliceMs)
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

/** Whoever touches an item takes it, and its effect starts at once (a repeat restarts the timer). */
function pickUpItems(game: GameState, rng: Rng, events: GameEvent[]) {
    const reach = AVATAR_RADIUS + ITEM_RADIUS

    for (const item of [...game.items]) {
        const taker = alivePlayers(game).find(p => Math.hypot(p.x - item.x, p.y - item.y) <= reach)
        if (!taker) continue

        game.items = game.items.filter(other => other.id !== item.id)
        const effect = reveal(item.kind, rng)
        if (effect === 'shield') taker.shieldMs = SHIELD_MS
        if (effect === 'speed') taker.speedMs = SPEED_MS
        // A frozen player is planted: the banana is spent but they don't slide.
        if (effect === 'banana' && taker.frozenMs <= 0) taker.slipMs = SLIP_MS
        events.push({ kind: 'pickup', playerId: taker.id, item: item.kind, effect })
    }
}

function checkEnd(game: GameState, events: GameEvent[]) {
    if (game.ended) return

    const alive = alivePlayers(game)
    if (alive.length > 1 && game.elapsedMs < game.durationMs) return

    game.ended = true
    game.holderId = null
    events.push({ kind: 'ended', survivorIds: winnerIds(game) })
}

/** Who won: everyone still standing, or in King of the Potato whoever held it longest. */
export function winnerIds(game: GameState): number[] {
    const alive = alivePlayers(game)
    if (game.mode !== 'king') return alive.map(p => p.id)

    const best = Math.max(0, ...alive.map(p => p.holdMs))

    return alive.filter(p => p.holdMs === best && best > 0).map(p => p.id)
}

/**
 * King of the Potato: touching the king takes the crown, unless the king is
 * still in their head start or behind a shield. The old king isn't frozen.
 */
function stealPotato(game: GameState, events: GameEvent[]) {
    const king = game.players.find(p => p.id === game.holderId)
    if (!king || king.out || king.safeMs > 0 || king.shieldMs > 0) return

    const reach = 2 * AVATAR_RADIUS + TOUCH_SLACK
    const thief = alivePlayers(game).find(p => p.id !== king.id && Math.hypot(p.x - king.x, p.y - king.y) <= reach)
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
