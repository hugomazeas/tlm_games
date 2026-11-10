import type { Body } from './sim/movement.ts'
import type { Dome, PickupKind } from './sim/places.ts'

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

/**
 * Warmup (always in the office), loading (the match's map, in every browser: up to LOADING_MS),
 * the countdown and the match on that map, the scoreboard there, then warmup in the office again.
 */
export type Phase = 'warmup' | 'loading' | 'countdown' | 'playing' | 'intermission'

/** Bits of an input frame's buttons. */
/** Shove adds `grab` (E: grab whoever is in front of you, a click throws them) and `drop` (G: drop a spring trap). */
export const BUTTON = { dash: 1, jet: 2, fire: 4, reload: 8, aim: 16, prone: 32, grab: 64, drop: 128 } as const

/** The guns: three primaries, two secondaries, and the stapler (melee) everyone carries. */
export const PRIMARIES = ['rifle', 'sniper', 'shotgun'] as const
export const SECONDARIES = ['pistol', 'launcher'] as const
export type Primary = (typeof PRIMARIES)[number]
export type Secondary = (typeof SECONDARIES)[number]
export type Gun = Primary | Secondary
/** Shove's kit, instead of the guns: a leaf blower, a fire extinguisher, a bat. */
export const TOOLS = ['blower', 'extinguisher', 'bat'] as const
export type Tool = (typeof TOOLS)[number]
/** Shove's other ways to throw someone: a grab and throw, a bowling ball, a spring trap. */
export type Hazard = 'throw' | 'ball' | 'spring'
export type Weapon = Gun | 'stapler' | Tool | Hazard
export function isHandheld(weapon: Weapon): weapon is Handheld {
    return isGun(weapon) || weapon === 'blower' || weapon === 'extinguisher'
}
export function isGun(weapon: Weapon): weapon is Gun {
    return (PRIMARIES as readonly string[]).includes(weapon) || (SECONDARIES as readonly string[]).includes(weapon)
}
/** What's held in two hands and drawn like a gun (the guns, the blower, the extinguisher). */
export type Handheld = Gun | 'blower' | 'extinguisher'
/** Swung in one hand: the stapler, Shove's bat. */
export type Melee = 'stapler' | 'bat'
export function isMelee(weapon: Weapon): weapon is Melee {
    return weapon === 'stapler' || weapon === 'bat'
}
export function isTool(weapon: Weapon): weapon is Tool {
    return (TOOLS as readonly string[]).includes(weapon)
}
export const WEAPON_NAMES: Record<Weapon, string> = {
    rifle: 'Assault rifle',
    sniper: 'Sniper',
    shotgun: 'Shotgun',
    pistol: 'Pistol',
    launcher: 'Launcher',
    stapler: 'Stapler',
    blower: 'Leaf blower',
    extinguisher: 'Fire extinguisher',
    bat: 'Bat',
    throw: 'Throw',
    ball: 'Bowling ball',
    spring: 'Spring trap',
}
/** Shove's slots: the blower, the extinguisher, the bat (no guns, no loadout). */
export const SHOVE_KIT: Record<Slot, Tool> = { primary: 'blower', secondary: 'extinguisher', melee: 'bat' }

/** What you carry: a primary in slot 1, a secondary in slot 2 (the stapler is slot 3). */
export interface Loadout {
    primary: Primary
    secondary: Secondary
}
export const DEFAULT_LOADOUT: Loadout = { primary: 'rifle', secondary: 'pistol' }

/** The slots, in key order: 1, 2, 3. */
export const SLOTS = ['primary', 'secondary', 'melee'] as const
export type Slot = (typeof SLOTS)[number]

/** The weapon in a slot, with this loadout (Shove's tools when `shove`). */
export function weaponIn(slot: Slot, loadout: Loadout, shove = false): Weapon {
    if (shove) return SHOVE_KIT[slot]
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
 * The modes: free for all, team deathmatch (red against blue), king of the meeting room (hold
 * the active zone alone; the zone moves around the office) and siege (one side defends a spot,
 * the other takes it, then they swap).
 */
export const MODES = ['ffa', 'tdm', 'koth', 'siege', 'shove'] as const
export type Mode = (typeof MODES)[number]
export const MODE_NAMES: Record<Mode, string> = {
    ffa: 'Free for all',
    tdm: 'Team deathmatch',
    koth: 'King of the meeting room',
    siege: 'Siege',
    shove: 'Shove',
}

/**
 * Shove: no guns and no health. Each hit adds to your damage % and the higher it is, the further
 * the next one throws you; off the edge, you lose a life (`fragLimit` lives each). The last one
 * with a life left wins; at the time limit, the most lives (then the most ring-outs).
 */
export const SHOVE_LIVES = [1, 2, 3, 5] as const

/**
 * The maps. Everyone warms up in the office (`LOBBY_MAP`); the host picks the map a match is
 * played on, and the modes it allows (Siege's spots and the meeting rooms are the office's).
 */
export const MAPS = ['office', 'cloud-nine'] as const
export type MapId = (typeof MAPS)[number]
export const LOBBY_MAP: MapId = 'office'
export interface MapInfo {
    name: string
    /** One line on the host's map card. */
    blurb: string
    /** How many it suits, said on the card. */
    players: string
    modes: readonly Mode[]
}
export const MAP_INFO: Record<MapId, MapInfo> = {
    office: {
        name: 'The office',
        blurb: 'The 3rd floor: desks, glass, the kitchen and the meeting rooms.',
        players: '2–12',
        modes: ['ffa', 'tdm', 'koth', 'siege'],
    },
    'cloud-nine': {
        name: 'Cloud Nine',
        blurb: 'A rooftop floating over the city at night. No railings: fall off and you’re out.',
        players: '2–8',
        modes: ['shove', 'ffa'],
    },
}

/** Can this mode be played on this map? */
export function playableOn(map: MapId, mode: Mode): boolean {
    return MAP_INFO[map].modes.includes(mode)
}

/** The longest a match waits for everyone's browser to have its map (then it starts with whoever's ready). */
export const LOADING_MS = 15_000

/** The modes played in two sides, red and blue (no friendly fire). */
export function isTeamMode(mode: Mode): boolean {
    return mode === 'tdm' || mode === 'siege'
}

/**
 * Siege: two halves on one spot (SIEGE_SPOTS, rolled per match). In each, the defenders get a head
 * start to build while the attackers wait in their dome; then an attacker who stays `holdMs` in the
 * spot scores a point for their side and goes back to the dome. A half ends at the limit (`fragLimit`
 * points) or after `halfMs`; then the sides swap, the walls go. Most points wins, the faster on a tie.
 * Only the defenders build, and nobody within `noBuild` of the dome's edge.
 */
export const SIEGE = {
    headStartMs: 45_000,
    halfMs: 5 * 60_000,
    holdMs: 5_000,
    domeRadius: 1.0,
    noBuild: 1.5,
} as const

/** Siege as it stands: the spot (into SIEGE_SPOTS), the half, who attacks, the score. */
export interface SiegeView {
    spot: number
    half: 1 | 2
    attackers: Team
    /** The head start: the attackers' dome stands (null once it's open). */
    dome: Dome | null
    /** Each side's points (who left included). */
    points: Record<Team, number>
    /** When each side scored its last point, into its attack (ms; null before its first): the tie-break. */
    times: Record<Team, number | null>
}

/** An attacker in the spot, and how long they've stayed (ms). */
export interface SiegeHold {
    id: string
    ms: number
}
export const TEAMS = ['red', 'blue'] as const
export type Team = (typeof TEAMS)[number]
export const TEAM_COLORS: Record<Team, string> = { red: '#e4572e', blue: '#29a3e0' }

/**
 * What the host may pick for a match. `fragLimit` is kills in free for all, the team's kills in team
 * deathmatch, in king of the meeting room ten times that in seconds holding the zone, and in siege
 * the points a side needs in its half. Siege's halves have their own length (`SIEGE.halfMs`).
 */
export const FRAG_LIMITS = [5, 10, 15, 20, 25, 30, 50] as const
export const MATCH_MINUTES = [3, 5, 10, 15, 20] as const
export interface Rules {
    map: MapId
    mode: Mode
    fragLimit: number
    minutes: number
}
export const DEFAULT_RULES: Rules = { map: LOBBY_MAP, mode: 'ffa', fragLimit: 15, minutes: 5 }

/** The limits a mode offers: kills (or points, or zone time), or Shove's lives. */
export function limitsOf(mode: Mode): readonly number[] {
    return mode === 'shove' ? SHOVE_LIVES : FRAG_LIMITS
}
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
    | 'anvil'
    | 'bubble'
    | 'magnet'
    | 'spring'

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
    /** Who built it (a connection id); null once they left: it stays up, nobody's (no one takes it back or works its door). */
    by: string | null
    /** Their side in team deathmatch (tints it, and its door opens for them), null otherwise (or once they left). */
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
    /** Lying prone (their trooper lies down; a small, low target). */
    prone: boolean
    /** 0–1 through reloading the gun in hand, null when not: their trooper plays the reload. */
    reload: number | null
    /** Their side in team deathmatch and siege, null otherwise. */
    team: Team | null
    /** The pickups' powers they carry (everyone sees them). */
    buffs: BuffKind[]
    /** Shove: their damage % (null outside Shove). */
    percent: number | null
    /** Shove: their leaf blower is running (everyone sees the air). */
    blowing: boolean
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
    /** Shove: your damage % (null outside Shove). */
    percent: number | null
    /** Shove: how wound up your bat is (0–1), null when not winding up. */
    charge: number | null
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
    /**
     * A stapler swing (or Shove's bat: `damage` is the % it added, `charge` how wound up it was): who
     * it hit (null: air), and whether it was from behind.
     */
    | {
          type: 'swing'
          by: string
          hit: string | null
          damage: number
          backstab: boolean
          weapon?: Melee
          charge?: number
      }
    /** Shove: a fire extinguisher's blast from `from` along `toward`, and the % it added to whom. */
    | {
          type: 'spray'
          by: string
          from: [number, number, number]
          toward: [number, number, number]
          hits: Array<{ id: string; percent: number }>
      }
    /** Shove: a gust is coming (`inMs`), then blows this way (m/s on the floor plan) for `forMs`. */
    | { type: 'gust'; x: number; z: number; inMs: number; forMs: number }
    /** Shove: a spring trap went off under someone. */
    | { type: 'sprung'; id: number; on: string; at: [number, number, number] }
    /** Cloud Nine's security laser caught someone on the deck (knocked flying). */
    | { type: 'zap'; on: string; at: [number, number, number] }
    /** Shove: someone grabbed someone (`target`), or let them go (null: thrown, dropped, broke free). */
    | { type: 'grab'; by: string; target: string | null }
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
          /** Off the map (Cloud Nine's ledges): the killer, if any, was the last to hit them, with `weapon`. */
          fall?: boolean
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
    /** Siege: an attacker held the spot long enough, a point for their side (and back to the dome). */
    | { type: 'captured'; by: string; team: Team }
    /** Siege: someone moved to the other side to keep them even (the attackers take the odd one). */
    | { type: 'switched'; id: string; team: Team }

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
    /** Seconds holding the zone (king of the meeting room), or the spot taken (siege). */
    points: number
    /** Shove: lives left (0: out of the match), null otherwise. */
    lives: number | null
}

export interface MatchView {
    phase: Phase
    /** Until the phase moves on (ms; null in warmup). */
    remainingMs: number | null
    /** The map everyone is on now: the office in warmup, the match's from its countdown to its scoreboard. */
    map: MapId
    /** The match's rules: the one being played, or (in warmup) the last one's. */
    mode: Mode
    fragLimit: number
    minutes: number
    /** What the host has lined up for the next match (warmup; null until they pick): browsers get its map ready. */
    next: Rules | null
    /** While loading: how many seated browsers have the map, of how many. */
    loading: { ready: number; of: number } | null
    /** Who starts the next match and picks its rules (a connection id): the longest seated. */
    host: string | null
    /** Best first. In warmup, nobody's counted. */
    scores: Score[]
    /** Team deathmatch: each side's kills. */
    teams: Record<Team, number> | null
    /** After a match: its standouts. */
    awards: Award[] | null
    /** Siege, while it's played and on its scoreboard after. */
    siege: SiegeView | null
}

export type ErrorCode = 'BAD_MESSAGE' | 'NOT_JOINED' | 'UNKNOWN_PLAYER' | 'UNAVAILABLE' | 'NOT_HOST' | 'NOT_ENOUGH'

/** Shove's things in the world, every snapshot. */
export interface ShoveThings {
    balls: Array<{ id: number; x: number; y: number; z: number; vx: number; vz: number }>
    traps: Array<{ id: number; x: number; y: number; z: number; armed: boolean; by: string }>
    /** Who holds whom: [holder, held]. */
    holds: Array<[string, string]>
}

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
    /** The host lines up the next match (their panel, before Start): everyone sees it, and gets its map ready. */
    | { type: 'plan'; rules: Rules }
    /** This browser has a map built and ready to play on. */
    | { type: 'ready'; map: MapId }
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
          /** Siege's attackers in the spot, while it's played. */
          holds: SiegeHold[] | null
          rockets: RocketState[]
          /** Shove: bowling balls rolling, spring traps lying (armed or not), who holds whom. */
          shove: ShoveThings | null
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
    if (message.type === 'start' || message.type === 'plan') {
        const rules = parseRules(message.rules)

        return rules ? { type: message.type, rules } : null
    }
    if (message.type === 'ready') {
        const map = MAPS.find(m => m === message.map)

        return map ? { type: 'ready', map } : null
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

/** A match's rules from untrusted input (a mode its map allows), or null. */
export function parseRules(value: unknown): Rules | null {
    const rules = value as Record<string, unknown> | null | undefined
    const minutes = MATCH_MINUTES.find(n => n === rules?.minutes)
    // No mode (an older tab): free for all; no map: the office.
    const mode = rules?.mode === undefined ? 'ffa' : MODES.find(m => m === rules.mode)
    const fragLimit = mode && limitsOf(mode).find(n => n === rules?.fragLimit)
    const map = rules?.map === undefined ? LOBBY_MAP : MAPS.find(m => m === rules.map)
    if (fragLimit === undefined || minutes === undefined || mode === undefined || map === undefined) return null
    if (!playableOn(map, mode)) return null

    return { map, mode, fragLimit, minutes }
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
    if (!Number.isInteger(seq) || seq! < 1 || !Number.isInteger(buttons) || buttons! < 0 || buttons! > 255) return null
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
