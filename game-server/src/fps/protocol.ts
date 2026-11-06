import type { Body } from './sim/movement.ts'
import type { PickupKind } from './sim/places.ts'

/**
 * The office FPS's messages, over /games/office-fps/live/ws. There is one game: everyone who
 * connects is in it (up to MAX_PLAYERS seated, the rest watch until a seat frees).
 *
 * Players send their inputs, one frame per 60 Hz step, each as soon as it's made; the server uses
 * every frame that has arrived each step and sends a snapshot 30 times a second with the last frame it used of yours (`ack`),
 * so your browser can replay the ones after it on top of the server's body.
 */

export const MAX_PLAYERS = 12
/** Frames a message may carry (the socket takes 4 KB a message). */
export const MAX_FRAMES = 30

export type Phase = 'warmup' | 'countdown' | 'playing' | 'intermission'

/** Bits of an input frame's buttons. */
export const BUTTON = { dash: 1, jet: 2, fire: 4, reload: 8, aim: 16 } as const

/** The guns: three primaries, two secondaries, and the stapler (melee) everyone carries. */
export const PRIMARIES = ['rifle', 'sniper', 'shotgun'] as const
export const SECONDARIES = ['pistol', 'launcher'] as const
export type Primary = (typeof PRIMARIES)[number]
export type Secondary = (typeof SECONDARIES)[number]
export type Gun = Primary | Secondary
export type Weapon = Gun | 'stapler'
export const WEAPON_NAMES: Record<Weapon, string> = {
    rifle: 'Assault rifle',
    sniper: 'Sniper',
    shotgun: 'Shotgun',
    pistol: 'Pistol',
    launcher: 'Launcher',
    stapler: 'Stapler',
}

/** What you carry: a primary in slot 1, a secondary in slot 2 (the stapler is slot 3). */
export interface Loadout {
    primary: Primary
    secondary: Secondary
}
export const DEFAULT_LOADOUT: Loadout = { primary: 'rifle', secondary: 'pistol' }

/** The slots, in key order: 1, 2, 3. */
export const SLOTS = ['primary', 'secondary', 'melee'] as const
export type Slot = (typeof SLOTS)[number]

/** The weapon in a slot, with this loadout. */
export function weaponIn(slot: Slot, loadout: Loadout): Weapon {
    return slot === 'primary' ? loadout.primary : slot === 'secondary' ? loadout.secondary : 'stapler'
}

/** A loadout from untrusted input, or null. */
export function parseLoadout(value: unknown): Loadout | null {
    if (typeof value !== 'object' || value === null) return null
    const { primary, secondary } = value as Record<string, unknown>
    const p = PRIMARIES.find(g => g === primary)
    const s = SECONDARIES.find(g => g === secondary)

    return p && s ? { primary: p, secondary: s } : null
}

/**
 * The modes: free for all, team deathmatch (red against blue), and king of the meeting room (hold
 * the active zone alone; the zone moves around the office).
 */
export const MODES = ['ffa', 'tdm', 'koth'] as const
export type Mode = (typeof MODES)[number]
export const MODE_NAMES: Record<Mode, string> = {
    ffa: 'Free for all',
    tdm: 'Team deathmatch',
    koth: 'King of the meeting room',
}
export const TEAMS = ['red', 'blue'] as const
export type Team = (typeof TEAMS)[number]
export const TEAM_COLORS: Record<Team, string> = { red: '#e4572e', blue: '#29a3e0' }

/**
 * What the host may pick for a match. `fragLimit` is kills in free for all, the team's kills in team
 * deathmatch, and in king of the meeting room ten times that in seconds holding the zone.
 */
export const FRAG_LIMITS = [5, 10, 15, 20, 25, 30, 50] as const
export const MATCH_MINUTES = [3, 5, 10, 15, 20] as const
export interface Rules {
    mode: Mode
    fragLimit: number
    minutes: number
}
export const DEFAULT_RULES: Rules = { mode: 'ffa', fragLimit: 15, minutes: 5 }
/** King of the meeting room: seconds in the zone to win, per point of the limit. */
export const ZONE_SECONDS_PER_POINT = 10

/** A pickup's power while it lasts (every pickup but the health pack). */
export type BuffKind =
    | 'magazine'
    | 'jetpack'
    | 'headshot'
    | 'overtime'
    | 'promotion'
    | 'firewall'
    | 'espresso'
    | 'intern'
    | 'bonus'
    | 'orgchart'

/** Which way a built wall faces: its normal along x or z (standing), or y (flat: a floor, a roof). */
export const WALL_AXES = ['x', 'y', 'z'] as const
export type WallAxis = (typeof WALL_AXES)[number]

/** Where a wall goes: its axis and its centre. */
export interface WallSpec {
    axis: WallAxis
    x: number
    y: number
    z: number
}

/**
 * What a built wall is: a plain panel, a door (opened and closed by its builder's side), or a
 * window (a slit at eye height to see and shoot through). Only a standing plain wall becomes a door
 * or a window, and neither turns back.
 */
export const WALL_KINDS = ['wall', 'door', 'window'] as const
export type WallKind = (typeof WALL_KINDS)[number]

/** A built wall, as everyone sees it. */
export interface WallState extends WallSpec {
    id: number
    /** Who built it (a connection id). */
    by: string
    /** Their side in team deathmatch (tints it, and its door opens for them), null otherwise. */
    team: Team | null
    health: number
    kind: WallKind
    /** A door standing open. */
    open: boolean
}

/** A standout of the match, on the scoreboard after it. */
export interface Award {
    title: string
    /** What earned it ("62% accuracy"). */
    detail: string
    name: string
    color: string
}

/** The active zone (king of the meeting room): which, who holds it alone (null: nobody), whether it's contested. */
export interface ZoneState {
    index: number
    holder: string | null
    contested: boolean
    /** Until it moves to the next one. */
    movesInMs: number
}

/** One step's input: what the keys and the mouse said, and which server step the shooter was looking at. */
export interface InputFrame {
    /** Counts up from 1, one per step. */
    seq: number
    forward: number
    strafe: number
    yaw: number
    pitch: number
    buttons: number
    /** The server step the other players were drawn at when this frame was taken (for the shot's rewind). */
    view: number
    /** The slot in hand (switching takes a moment); the primary when absent. */
    slot?: Slot
}

export interface PlayerInfo {
    /** The connection's id: the key of everything about this player in the other messages. */
    id: string
    name: string
    color: string
    playerId: number | null
    watching: boolean
}

/** Someone else, as everyone sees them. */
export interface PlayerState {
    id: string
    x: number
    y: number
    z: number
    yaw: number
    pitch: number
    alive: boolean
    /** 0–their full health (maxHealthOf their buffs' powers), shown over them when someone's crosshair is on them. */
    health: number
    jet: boolean
    /** Just spawned: can't be hurt until it runs out or they fire. */
    shielded: boolean
    weapon: Weapon
    /** Aiming down their sights (their gun comes up to the eye). */
    aiming: boolean
    /** 0–1 through reloading the gun in hand, null when not: their trooper plays the reload. */
    reload: number | null
    /** Their side in team deathmatch, null otherwise. */
    team: Team | null
    /** The pickups' powers they carry (everyone sees them). */
    buffs: BuffKind[]
}

/** You, in full: your browser predicts from it. */
export interface SelfState {
    body: Body
    alive: boolean
    health: number
    ammo: number
    reloading: boolean
    /** What's left of the reload (ms), for the ring by the crosshair; null when not reloading. */
    reloadLeftMs: number | null
    shielded: boolean
    /** In hand: the gun's ammo, reload and magazine above are its. */
    weapon: Weapon
    /** What you carry now, and what you'll carry from your next spawn. */
    loadout: Loadout
    nextLoadout: Loadout
    /** Rounds in the other gun (the one not in hand; null holding the stapler). */
    otherAmmo: number | null
    /** Until you're back (ms), while you're down. */
    respawnInMs: number | null
    /** Rounds a full magazine of the gun in hand holds (more with a big magazine). */
    magazine: number
    /** Your powers, with what's left of each (ms; the firewall also its damage left to soak, `points`). */
    buffs: Array<{ kind: BuffKind; leftMs: number; points?: number }>
}

export type GameEvent =
    | {
          type: 'shot'
          by: string
          weapon: Gun
          from: [number, number, number]
          /** Where each round ended (a shotgun's pellets: several). */
          to: Array<[number, number, number]>
          /** Who it hit (a shotgun's pellets may hit several: the one hurt most). */
          hit: string | null
          headshot: boolean
          /** Health it took (0: a miss, or a spawn-shielded target). */
          damage: number
      }
    /** A rocket left the launcher (`id` names it in the snapshots' `rockets`). */
    | { type: 'launch'; by: string; id: number; from: [number, number, number] }
    /** A rocket went off; `hits` is who it hurt and by how much. */
    | {
          type: 'explode'
          by: string
          id: number
          at: [number, number, number]
          hits: Array<{ id: string; damage: number }>
      }
    /** A stapler swing: who it hit (null: air), for how much, and whether it was from behind. */
    | { type: 'swing'; by: string; hit: string | null; damage: number; backstab: boolean }
    | {
          type: 'kill'
          killer: string | null
          victim: string
          headshot: boolean
          weapon: Weapon
          backstab: boolean
          /** The killer's kills this life (with this one), and what the victim's run was. */
          killerStreak: number
          victimStreak: number
          /** The match's first kill. */
          firstBlood?: boolean
          /** How it happened, for the victim's death screen (absent when nobody killed them). */
          recap?: KillRecap
      }
    | { type: 'spawn'; id: string }
    /** Someone took the pickup at `spot` (an index into PICKUP_SPOTS). */
    | { type: 'pickup'; by: string; spot: number; kind: PickupKind }
    /** A wall went up. */
    | { type: 'built'; wall: WallState }
    /** A wall became a door or a window, or a door opened or closed: the wall as it is now. */
    | { type: 'wallChanged'; wall: WallState }
    /** A wall took damage: its health now. */
    | { type: 'wallHit'; id: number; health: number }
    /** A wall came down: shot to pieces (`broken`), or taken back, crowded out or its builder left. */
    | { type: 'wallGone'; id: number; broken: boolean }
    /** Every wall there is now (a new match wipes them: none). */
    | { type: 'walls'; walls: WallState[] }

/** What the victim learns about the one who killed them. */
export interface KillRecap {
    /** Between them when it happened (m, one decimal). */
    distance: number
    /** The killer's health then. */
    killerHealth: number
    /** Rounds left in the killer's gun after the kill, and its magazine (null: the stapler). */
    ammo: number | null
    magazine: number | null
    /** The killer's powers then. */
    buffs: BuffKind[]
    /** The killer's hits on the victim this life, the damage they did, how many were headshots. */
    hits: number
    damage: number
    headshots: number
    /** From the killer's first hit this life to the kill (ms). */
    timeMs: number
    /** Damage the victim took from anyone else this life (a helping hand). */
    othersDamage: number
}

export interface Score {
    /** The connection's id while they're here, null once they left the match. */
    id: string | null
    name: string
    color: string
    kills: number
    deaths: number
    team: Team | null
    /** Seconds holding the zone (king of the meeting room). */
    points: number
}

export interface MatchView {
    phase: Phase
    /** Until the phase moves on (ms; null in warmup). */
    remainingMs: number | null
    /** The match's rules: the one being played, or (in warmup) the last one's. */
    mode: Mode
    fragLimit: number
    minutes: number
    /** Who starts the next match and picks its rules (a connection id): the longest seated. */
    host: string | null
    /** Best first. In warmup, nobody's counted. */
    scores: Score[]
    /** Team deathmatch: each side's kills. */
    teams: Record<Team, number> | null
    /** After a match: its standouts. */
    awards: Award[] | null
}

export type ErrorCode = 'BAD_MESSAGE' | 'NOT_JOINED' | 'UNKNOWN_PLAYER' | 'UNAVAILABLE' | 'NOT_HOST' | 'NOT_ENOUGH'

/** A rocket in flight. */
export interface RocketState {
    id: number
    by: string
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
}

/**
 * `hello` joins the game, as a Hub player or a guest (null), with the loadout this browser
 * remembers; `input` sends frames; `loadout` picks the guns for your next spawn; the host `start`s
 * a match.
 */
export type ClientMessage =
    | { type: 'hello'; playerId: number | null; loadout?: Loadout }
    | { type: 'input'; frames: InputFrame[] }
    | { type: 'loadout'; loadout: Loadout }
    | { type: 'start'; rules: Rules }
    /** Build mode: a wall here (the slot your browser worked out), or take one of yours back. */
    | { type: 'build'; wall: WallSpec }
    | { type: 'unbuild'; id: number }
    /** A wall of your side's into a door or a window (build mode: F, G). */
    | { type: 'reshape'; id: number; kind: Exclude<WallKind, 'wall'> }
    /** Open or close a door of your side's (F). */
    | { type: 'door'; id: number }

export type ServerMessage =
    | {
          type: 'welcome'
          you: string
          step: number
          players: PlayerInfo[]
          match: MatchView
          /** The walls already up. */
          walls: WallState[]
      }
    | { type: 'roster'; players: PlayerInfo[] }
    | { type: 'match'; match: MatchView }
    | {
          type: 'snap'
          step: number
          ack: number
          you: SelfState | null
          players: PlayerState[]
          events: GameEvent[]
          /** What lies on each pickup spot to take (by spot), null where it's been taken. */
          pickups: Array<PickupKind | null>
          /** King of the meeting room, while it's played. */
          zone: ZoneState | null
          rockets: RocketState[]
      }
    /** You joined from another tab; this one is closed. */
    | { type: 'replaced' }
    | { type: 'error'; code: ErrorCode }

/** A client message, or null when it isn't one. */
export function parseClientMessage(raw: string): ClientMessage | null {
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof value !== 'object' || value === null) return null
    const message = value as Record<string, unknown>

    if (message.type === 'hello') {
        const { playerId } = message
        if (playerId !== null && (!Number.isInteger(playerId) || (playerId as number) < 1)) return null
        // A loadout that doesn't parse (an older tab, a gun since removed): the default one.
        const loadout = parseLoadout(message.loadout) ?? undefined

        return { type: 'hello', playerId: playerId as number | null, ...(loadout ? { loadout } : {}) }
    }
    if (message.type === 'loadout') {
        const loadout = parseLoadout(message.loadout)

        return loadout ? { type: 'loadout', loadout } : null
    }
    if (message.type === 'input') {
        const { frames } = message
        if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_FRAMES) return null
        const parsed: InputFrame[] = []
        for (const frame of frames) {
            const one = parseFrame(frame)
            if (!one) return null
            parsed.push(one)
        }

        return { type: 'input', frames: parsed }
    }
    if (message.type === 'start') {
        const rules = message.rules as Record<string, unknown> | null | undefined
        const fragLimit = FRAG_LIMITS.find(n => n === rules?.fragLimit)
        const minutes = MATCH_MINUTES.find(n => n === rules?.minutes)
        // No mode (an older tab): free for all.
        const mode = rules?.mode === undefined ? 'ffa' : MODES.find(m => m === rules.mode)
        if (fragLimit === undefined || minutes === undefined || mode === undefined) return null

        return { type: 'start', rules: { mode, fragLimit, minutes } }
    }
    if (message.type === 'build') {
        const wall = message.wall as Record<string, unknown> | null | undefined
        const axis = WALL_AXES.find(a => a === wall?.axis)
        const { x, y, z } = wall ?? {}
        const coordinate = (n: unknown): n is number =>
            typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000
        if (axis === undefined || !coordinate(x) || !coordinate(y) || !coordinate(z)) return null

        return { type: 'build', wall: { axis, x, y, z } }
    }
    if (message.type === 'unbuild' || message.type === 'door' || message.type === 'reshape') {
        const { id } = message
        if (!Number.isInteger(id) || (id as number) < 1) return null
        if (message.type !== 'reshape') return { type: message.type, id: id as number }
        const kind = (['door', 'window'] as const).find(k => k === message.kind)

        return kind ? { type: 'reshape', id: id as number, kind } : null
    }

    return null
}

/**
 * Frames travel as arrays to stay small: [seq, forward, strafe, yaw, pitch, buttons, view, slot],
 * the slot as its index in SLOTS (a 7-long frame holds the primary).
 */
export function encodeFrame(frame: InputFrame): number[] {
    const { seq, forward, strafe, yaw, pitch, buttons, view } = frame
    return [seq, forward, strafe, yaw, pitch, buttons, view, SLOTS.indexOf(frame.slot ?? 'primary')]
}

function parseFrame(value: unknown): InputFrame | null {
    if (!Array.isArray(value) || (value.length !== 7 && value.length !== 8)) return null
    if (!value.every(n => typeof n === 'number' && Number.isFinite(n))) return null
    const [seq, forward, strafe, yaw, pitch, buttons, view, slot = 0] = value as number[]
    if (!Number.isInteger(seq) || seq! < 1 || !Number.isInteger(buttons) || buttons! < 0 || buttons! > 31) return null
    if (Math.abs(forward!) > 1 || Math.abs(strafe!) > 1 || Math.abs(pitch!) > Math.PI / 2) return null
    if (!Number.isInteger(view) || view! < 0) return null
    const held = SLOTS[slot]
    if (!Number.isInteger(slot) || held === undefined) return null

    return {
        seq: seq!,
        forward: forward!,
        strafe: strafe!,
        yaw: yaw!,
        pitch: pitch!,
        buttons: buttons!,
        view: view!,
        slot: held,
    }
}
