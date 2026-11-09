import {
    type BuffKind,
    FRAG_LIMITS,
    type KillRecap,
    type Loadout,
    PRIMARIES,
    SECONDARIES,
    WEAPON_NAMES,
    weaponIn,
    MATCH_MINUTES,
    type MatchView,
    type Mode,
    MODE_NAMES,
    MODES,
    type PlayerInfo,
    type Rules,
    type Score,
    type SelfState,
    SIEGE,
    type Team,
    TEAM_COLORS,
    TEAMS,
    type Weapon,
    ZONE_SECONDS_PER_POINT,
} from '../protocol.ts'
import { magazineOf, MAX_HEALTH, maxHealthOf, powersOf } from '../sim/combat.ts'
import { SIEGE_SPOTS, siegeWinner } from '../sim/places.ts'
import { DEFAULT_SETTINGS, LIMITS, type Settings } from './settings.ts'

/**
 * Everything drawn over the game, in plain DOM: crosshair and hit marker, health, ammo, fuel,
 * the match's timer, the kill feed, the scoreboard (Tab, and between matches), messages in the
 * middle (warmup, countdown, down, watching), and the click-to-play card while the mouse is free.
 */

const CSS = `
#fps-hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px/1.3 system-ui, sans-serif; color: #f4f6f8; z-index: 20; user-select: none; }
#fps-hud .panel { background: rgba(12,14,18,.72); border-radius: 10px; padding: 8px 12px; }
#fps-hud .cross { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px; border-radius: 50%; background: rgba(255,255,255,.9); box-shadow: 0 0 0 1px rgba(0,0,0,.55); }
#fps-hud .hit { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px; opacity: 0; }
#fps-hud .hit::before, #fps-hud .hit::after { content: ''; position: absolute; left: 13px; top: 0; width: 4px; height: 30px; border-radius: 2px; background: #fff; box-shadow: 0 0 3px rgba(0,0,0,.7); transform: rotate(45deg); clip-path: polygon(0 0,100% 0,100% 36%,0 36%,0 64%,100% 64%,100% 100%,0 100%); }
#fps-hud .hit::after { transform: rotate(-45deg); }
#fps-hud .hit.head::before, #fps-hud .hit.head::after { background: #ffb020; }
#fps-hud .hit.kill { width: 44px; height: 44px; margin: -22px; }
#fps-hud .hit.kill::before, #fps-hud .hit.kill::after { left: 19px; height: 44px; width: 6px; background: #ff3b3b; }
#fps-hud .pop { position: absolute; transform: translate(-50%,-50%); font: 800 18px system-ui, sans-serif; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.8); pointer-events: none; transition: transform .7s ease-out, opacity .7s ease-in; }
#fps-hud .pop.head { color: #ffb020; font-size: 22px; }
#fps-hud .pop.none { color: rgba(255,255,255,.55); font-size: 14px; }
#fps-hud .elim { position: absolute; left: 50%; top: calc(50% + 46px); transform: translateX(-50%); font-size: 15px; letter-spacing: .14em; text-transform: uppercase; color: #ff6b6b; text-shadow: 0 2px 4px rgba(0,0,0,.8); opacity: 0; transition: opacity .4s; }
#fps-hud .elim b { color: #fff; }
#fps-hud .callout { position: absolute; left: 50%; top: 13%; transform: translateX(-50%); text-align: center; font-weight: 900; letter-spacing: .12em; color: #ffd166; text-shadow: 0 0 14px rgba(255,140,0,.75), 0 3px 4px rgba(0,0,0,.9); opacity: 0; white-space: nowrap; }
#fps-hud .callout small { display: block; font-size: 14px; letter-spacing: .06em; color: #fff; font-weight: 600; }
#fps-hud .toast { position: absolute; left: 50%; top: calc(50% + 70px); transform: translateX(-50%); font-weight: 800; font-size: 16px; letter-spacing: .08em; text-shadow: 0 2px 4px rgba(0,0,0,.85); opacity: 0; white-space: nowrap; }
#fps-hud .buffs { position: absolute; left: 20px; bottom: 96px; display: flex; flex-direction: column; gap: 4px; }
#fps-hud .buffs div { background: rgba(12,14,18,.62); border-radius: 6px; padding: 3px 8px; font-size: 13px; }
#fps-hud .buffs b { font-variant-numeric: tabular-nums; margin-left: 4px; }
#fps-hud .zone-status { position: absolute; left: 50%; top: calc(50% + 96px); transform: translateX(-50%); font-weight: 800; font-size: 14px; letter-spacing: .14em; text-shadow: 0 2px 4px rgba(0,0,0,.85); white-space: nowrap; }
#fps-hud .build { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); padding: 6px 14px; background: rgba(12,14,18,.62); border-radius: 8px; font-size: 13px; white-space: nowrap; text-align: center; }
#fps-hud .build b { color: #5cff8a; letter-spacing: .14em; margin-right: 10px; }
#fps-hud .prompt { position: absolute; left: 50%; top: calc(50% + 40px); transform: translateX(-50%); padding: 3px 10px; background: rgba(12,14,18,.62); border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; }
#fps-hud .prompt kbd { font: inherit; font-weight: 800; padding: 0 5px; margin-right: 6px; border: 1px solid rgba(255,255,255,.5); border-radius: 4px; }
#fps-hud .build kbd { font: inherit; font-weight: 700; padding: 0 5px; border: 1px solid rgba(255,255,255,.35); border-radius: 4px; }
#fps-hud .zone-marker { position: absolute; width: 18px; height: 18px; margin: -9px; border: 3px solid; transform: rotate(45deg); box-shadow: 0 0 6px rgba(0,0,0,.6); }
#fps-hud .zone-marker span { position: absolute; left: 50%; top: 24px; transform: rotate(-45deg) translateX(-50%); transform-origin: 0 0; white-space: nowrap; font-size: 12px; text-shadow: 0 1px 3px #000; }
#fps-hud .middle .taunt { font-style: italic; color: #ffd166; opacity: 1; }
#fps-hud .recap { margin: 12px auto 10px; padding: 10px 14px; width: max-content; max-width: 90vw; background: rgba(12,14,18,.7); border-radius: 10px; font-size: 14px; text-shadow: none; }
#fps-hud .recap-head { font-weight: 700; margin-bottom: 6px; }
#fps-hud .recap-head .hs { color: #ffb020; }
#fps-hud .recap-rows { display: grid; grid-template-columns: auto auto; gap: 3px 18px; text-align: left; }
#fps-hud .recap-rows span { opacity: .65; }
#fps-hud .recap-rows b { font-variant-numeric: tabular-nums; font-weight: 600; }
#fps-hud .board h3 { margin: 10px 0 2px; font-size: 13px; letter-spacing: .12em; }
#fps-hud .awards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; margin-bottom: 10px; }
#fps-hud .awards div { background: rgba(255,255,255,.06); border-radius: 8px; padding: 6px 8px; }
#fps-hud .awards small { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; opacity: .6; }
#fps-hud .awards b { display: block; font-size: 15px; }
#fps-hud .awards span { font-size: 12px; opacity: .75; }
#fps-hud .from { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: opacity .9s ease-in; }
#fps-hud .from::before { content: ''; position: absolute; left: -70px; top: -190px; width: 140px; height: 34px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: radial-gradient(ellipse at 50% 100%, rgba(255,40,40,.0) 40%, rgba(255,40,40,.85) 72%, rgba(255,40,40,0) 74%); }
#fps-hud .target { position: absolute; transform: translate(-50%,-100%); text-align: center; pointer-events: none; transition: opacity .15s; }
#fps-hud .target .name { font-size: 13px; padding: 2px 8px; border-radius: 6px; background: rgba(12,14,18,.7); white-space: nowrap; }
#fps-hud .target .bar { width: 70px; height: 5px; margin: 4px auto 0; border-radius: 3px; background: rgba(0,0,0,.55); overflow: hidden; }
#fps-hud .target .bar div { height: 100%; transition: width .15s; }
#fps-hud .reload { position: absolute; left: calc(50% + 18px); top: calc(50% + 18px); width: 30px; height: 30px; }
#fps-hud .reload circle { fill: none; stroke-width: 3.5; }
#fps-hud .reload .track { stroke: rgba(0,0,0,.45); }
#fps-hud .reload .fill { stroke: #ffd166; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; filter: drop-shadow(0 0 2px rgba(0,0,0,.7)); }
#fps-hud .hs-dealt { position: absolute; left: 50%; top: calc(50% - 56px); transform: translateX(-50%); font: 900 16px system-ui, sans-serif; letter-spacing: .2em; color: #ffd166; text-shadow: 0 0 8px rgba(255,180,0,.8), 0 2px 3px rgba(0,0,0,.8); opacity: 0; }
#fps-hud .hs-taken { position: absolute; left: 50%; top: 20%; transform: translateX(-50%); font: 900 28px system-ui, sans-serif; letter-spacing: .25em; color: #ff3b3b; text-shadow: 0 0 12px rgba(255,0,0,.7), 0 2px 4px rgba(0,0,0,.9); opacity: 0; }
#fps-hud .hs-flash { position: absolute; inset: 0; box-shadow: inset 0 0 0 6px rgba(255,40,40,.85), inset 0 0 160px rgba(255,0,0,.55); opacity: 0; will-change: opacity; }
#fps-hud.aiming .cross { width: 3px; height: 3px; margin: -1.5px; }
#fps-hud .health { position: absolute; left: 20px; bottom: 20px; font-size: 30px; min-width: 120px; }
#fps-hud .health small, #fps-hud .ammo small { display: block; font-size: 11px; opacity: .65; letter-spacing: .12em; text-transform: uppercase; }
#fps-hud .ammo { position: absolute; right: 20px; bottom: 20px; font-size: 30px; text-align: right; min-width: 120px; }
#fps-hud .fuel { position: absolute; left: 50%; bottom: 26px; width: 240px; margin-left: -120px; height: 8px; background: rgba(0,0,0,.45); border-radius: 4px; overflow: hidden; }
#fps-hud .fuel div { height: 100%; background: linear-gradient(90deg,#ff9f43,#ffd166); }
#fps-hud .top { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); text-align: center; }
#fps-hud .top b { font-size: 22px; font-variant-numeric: tabular-nums; }
#fps-hud .feed { position: absolute; right: 16px; top: 14px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
#fps-hud .feed div { background: rgba(12,14,18,.62); border-radius: 8px; padding: 4px 10px; transition: opacity .4s; }
#fps-hud .stats { position: absolute; left: 12px; top: 10px; padding: 3px 8px; border-radius: 6px; background: rgba(12,14,18,.5); font: 600 12px ui-monospace, monospace; color: rgba(255,255,255,.75); }
#fps-hud .stats .good { color: #7ee787; }
#fps-hud .stats .ok { color: #ffd166; }
#fps-hud .stats .bad { color: #ff6b6b; }
#fps-hud .middle { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); text-align: center; font-size: 22px; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
#fps-hud .middle small { display: block; font-size: 14px; opacity: .8; }
#fps-hud .board { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); min-width: 360px; }
#fps-hud .board table { width: 100%; border-collapse: collapse; }
#fps-hud .board td, #fps-hud .board th { padding: 4px 8px; text-align: left; }
#fps-hud .board th { font-size: 11px; opacity: .6; text-transform: uppercase; letter-spacing: .1em; }
#fps-hud .board td.n { text-align: right; font-variant-numeric: tabular-nums; }
#fps-hud .board tr.me td { color: #ffd166; }
#fps-hud .board tr.gone td { opacity: .45; }
#fps-hud .hurt { position: absolute; inset: 0; box-shadow: inset 0 0 120px rgba(220,30,30,.75); opacity: 0; transition: opacity .35s; will-change: opacity; }
#fps-hud .blood { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0; transition: opacity .3s; will-change: opacity; }
#fps-hud .blood.on { opacity: 1; }
#fps-hud .blood-beat { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0; will-change: opacity; }
#fps-hud .blood-beat.beat { animation: fps-heartbeat 1.1s steps(1, end) infinite; }
@keyframes fps-heartbeat { 0% { opacity: 0; } 10% { opacity: 1; } 22% { opacity: .3; } 32% { opacity: .8; } 44% { opacity: 0; } 100% { opacity: 0; } }
#fps-hud .health.low { color: #ff6b6b; }
#fps-hud .health::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: rgba(110,12,12,.6); opacity: 0; will-change: opacity; pointer-events: none; }
#fps-hud .health.low::before { animation: fps-low-health 1.1s steps(1, end) infinite; }
@keyframes fps-low-health { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
#fps-hud .spread { position: absolute; left: 50%; top: 50%; width: 0; height: 0; --r: 8px; }
#fps-hud .spread i { position: absolute; background: rgba(255,255,255,.85); box-shadow: 0 0 0 1px rgba(0,0,0,.45); }
#fps-hud .spread i:nth-child(1) { left: -1px; top: calc(-1 * var(--r) - 7px); width: 2px; height: 7px; }
#fps-hud .spread i:nth-child(2) { left: -1px; top: var(--r); width: 2px; height: 7px; }
#fps-hud .spread i:nth-child(3) { top: -1px; left: calc(-1 * var(--r) - 7px); width: 7px; height: 2px; }
#fps-hud .spread i:nth-child(4) { top: -1px; left: var(--r); width: 7px; height: 2px; }
#fps-hud.aiming .spread { display: none; }
#fps-hud .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); text-align: center; pointer-events: auto; max-width: 420px; padding: 22px 26px; }
#fps-hud .card h1 { font-size: 22px; margin: 0 0 4px; }
#fps-hud .card p { margin: 6px 0; opacity: .85; font-weight: 500; }
#fps-hud kbd { background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 6px; font: inherit; font-size: 12px; }
#fps-hud .card a { color: #ffd166; }
#fps-hud .card { max-height: calc(100vh - 40px); overflow-y: auto; }
#fps-hud .card .section { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.12); text-align: left; }
#fps-hud .card h2 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; opacity: .6; margin: 0 0 8px; }
#fps-hud .card .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
#fps-hud .card select, #fps-hud .card button { font: inherit; font-size: 13px; color: #f4f6f8; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); border-radius: 7px; padding: 4px 8px; }
#fps-hud .card button { cursor: pointer; padding: 6px 14px; }
#fps-hud .card button[data-start] { background: #e4572e; border-color: #e4572e; font-weight: 700; }
#fps-hud .card button:disabled { opacity: .45; cursor: default; }
#fps-hud .card .hint { font-size: 12px; opacity: .7; min-height: 1em; }
#fps-hud .card .slider { display: block; font-size: 13px; margin-bottom: 8px; }
#fps-hud .card .slider output { float: right; opacity: .8; font-variant-numeric: tabular-nums; }
#fps-hud .card .slider input { display: block; width: 100%; accent-color: #ffd166; }
#fps-hud .card .check { display: block; font-size: 13px; margin: 4px 0 10px; }
#fps-hud .slots b { display: inline-block; min-width: 14px; margin-left: 4px; padding: 0 3px; border-radius: 3px; text-align: center; background: rgba(255,255,255,.12); font-size: 10px; }
#fps-hud .slots b.on { background: #ffd166; color: #1a1206; }
#fps-hud .guns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
#fps-hud .card .guns button { text-align: left; padding: 6px 8px; line-height: 1.25; }
#fps-hud .card .guns button.on { background: rgba(255,209,102,.18); border-color: #ffd166; }
#fps-hud .guns button small { display: block; font-size: 11px; font-weight: 500; opacity: .7; }
#fps-hud .scope { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, transparent 0, transparent 32vmin, rgba(0,0,0,.9) 32.4vmin, #000 34vmin); }
#fps-hud .scope::before, #fps-hud .scope::after { content: ''; position: absolute; left: 50%; top: 50%; background: rgba(0,0,0,.85); }
#fps-hud .scope::before { width: 64vmin; height: 1.5px; margin: -0.75px 0 0 -32vmin; }
#fps-hud .scope::after { width: 1.5px; height: 64vmin; margin: -32vmin 0 0 -0.75px; }
#fps-hud.scoped .cross { background: #ff3b3b; }
#fps-hud .hidden { display: none !important; }
`

export interface HudFrame {
    me: string | null
    self: SelfState | null
    /** Who downed you last. */
    killer: string | null
    /** The line under "Fragged by …". */
    taunt: string | null
    /** How they did it (null: no kill to tell). */
    cause: DeathCause | null
    tab: boolean
    roster: Map<string, PlayerInfo>
}

export class Hud {
    private readonly root: HTMLDivElement
    private readonly el: Record<string, HTMLElement> = {}
    private match: MatchView | null = null
    private matchAt = 0
    private lastHealth = MAX_HEALTH
    private lastFull = MAX_HEALTH
    private boardForced = false

    private cardState = 'connecting'
    private host: { isHost: boolean; name: string | null; seated: number } = { isHost: false, name: null, seated: 0 }
    private hostNotice: string | null = null

    constructor(
        private readonly backUrl: string,
        private readonly hooks: {
            settings: Settings
            onSettings(settings: Settings): void
            onStart(rules: Rules): void
            /** The guns this browser picked last. */
            loadout: Loadout
            onLoadout(loadout: Loadout): void
        }
    ) {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.append(style)
        this.root = document.createElement('div')
        this.root.id = 'fps-hud'
        this.root.innerHTML = `
            <div class="scope hidden" data-el="scope"></div>
            <canvas class="blood" data-el="blood" width="1" height="1"></canvas>
            <canvas class="blood-beat" data-el="bloodBeat" width="1" height="1"></canvas>
            <div class="hurt" data-el="hurt"></div>
            <div class="cross" data-el="cross"></div>
            <div class="spread hidden" data-el="spread"><i></i><i></i><i></i><i></i></div><div class="hit" data-el="hit"></div>
            <div class="elim" data-el="elim"></div>
            <div class="callout" data-el="callout"></div>
            <div class="toast" data-el="toast"></div>
            <div class="buffs" data-el="buffs"></div>
            <div class="zone-status hidden" data-el="zoneStatus"></div>
            <div class="build hidden" data-el="build"></div>
            <div class="prompt hidden" data-el="prompt"></div>
            <div class="zone-marker hidden" data-el="zoneMarker"><span></span></div>
            <div class="hs-flash" data-el="hsFlash"></div>
            <div class="hs-dealt" data-el="hsDealt">HEADSHOT</div>
            <div class="hs-taken" data-el="hsTaken">HEADSHOT</div>
            <svg class="reload hidden" data-el="reload" viewBox="0 0 30 30" aria-hidden="true">
                <circle class="track" cx="15" cy="15" r="11"></circle>
                <circle class="fill" cx="15" cy="15" r="11" data-el="reloadFill" stroke-dasharray="${RING} ${RING}" stroke-dashoffset="${RING}"></circle>
            </svg>
            <div class="target hidden" data-el="target"><div class="name"></div><div class="bar"><div></div></div></div>
            <div class="panel top" data-el="top"></div>
            <div class="feed" data-el="feed"></div>
            <div class="stats" data-el="stats"></div>
            <div class="middle" data-el="middle"></div>
            <div class="panel health" data-el="health"></div>
            <div class="panel ammo" data-el="ammo"></div>
            <div class="fuel" data-el="fuelBar"><div data-el="fuel"></div></div>
            <div class="panel board hidden" data-el="board"></div>
            <div class="panel card" data-el="card">
                <div data-el="cardMain"></div>
                <div class="section hidden" data-el="loadout"></div>
                <div class="section hidden" data-el="host"></div>
                <div class="section hidden" data-el="settings"></div>
            </div>`
        for (const node of this.root.querySelectorAll<HTMLElement>('[data-el]')) this.el[node.dataset.el!] = node
        document.body.append(this.root)
        this.buildSettings()
        this.picked = hooks.loadout
        this.renderLoadout()
        this.card('connecting')
    }

    private picked: Loadout
    /** What you carry now (from the server): a different pick says it waits for your next spawn. */
    private carried: Loadout | null = null

    /** Sniper scoped in: the black scope ring over everything, and the viewmodel's job is done. */
    scope(on: boolean): void {
        this.el.scope!.classList.toggle('hidden', !on)
        this.root.classList.toggle('scoped', on)
    }

    /** The loadout picker on the menu: a primary and a secondary, kept in this browser. */
    private renderLoadout(): void {
        const panel = this.el.loadout!
        const pick = this.picked
        const button = (gun: keyof typeof GUN_BLURBS, on: boolean) =>
            `<button type="button" data-gun="${gun}" class="${on ? 'on' : ''}">${WEAPON_NAMES[gun]}<small>${GUN_BLURBS[gun]}</small></button>`
        const waiting =
            this.carried && (this.carried.primary !== pick.primary || this.carried.secondary !== pick.secondary)
        panel.innerHTML = `<h2>Loadout</h2>
            <div class="guns">${PRIMARIES.map(g => button(g, g === pick.primary)).join('')}</div>
            <div class="guns">${SECONDARIES.map(g => button(g, g === pick.secondary)).join('')}</div>
            <p class="hint">${waiting ? 'From your next spawn.' : '<kbd>1</kbd> primary · <kbd>2</kbd> secondary · <kbd>3</kbd> stapler'}</p>`
        for (const node of panel.querySelectorAll<HTMLButtonElement>('[data-gun]')) {
            node.addEventListener('click', () => {
                const gun = node.dataset.gun!
                const primary = PRIMARIES.find(g => g === gun)
                const secondary = SECONDARIES.find(g => g === gun)
                this.picked = { primary: primary ?? pick.primary, secondary: secondary ?? pick.secondary }
                this.hooks.onLoadout(this.picked)
                this.renderLoadout()
            })
        }
    }

    /** The middle card: while connecting, while the mouse is free (with the host's controls and the settings), or when the game is closed to you. */
    card(state: 'connecting' | 'paused' | 'playing' | 'replaced' | 'unavailable' | 'unknown'): void {
        this.cardState = state
        this.el.card!.classList.toggle('hidden', state === 'playing')
        this.el.settings!.classList.toggle('hidden', state !== 'paused')
        this.el.loadout!.classList.toggle('hidden', state !== 'paused')
        this.renderHost()
        const back = `<p><a href="${this.backUrl}">Back to the Hub</a></p>`
        this.el.cardMain!.innerHTML = {
            connecting: `<h1>Office FPS</h1><p>Connecting…</p>`,
            paused: `<h1>Office FPS</h1><p><b>Click to play</b></p>
                <p><kbd>WASD</kbd> move · <kbd>Shift</kbd> + direction dodge · <kbd>Space</kbd> jump (hold, or in the air: jetpack) · <kbd>C</kbd> (hold) prone<br>
                <kbd>Click</kbd> fire · <kbd>Right-click</kbd> aim · <kbd>R</kbd> reload<br>
                <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> weapons (or the wheel, <kbd>Q</kbd> the last) · <kbd>V</kbd> 1st / 3rd person<br>
                <kbd>B</kbd> build walls (click to place, <kbd>R</kbd> turn, wheel flat / standing, <kbd>F</kbd> door, <kbd>G</kbd> window, <kbd>E</kbd> take back)<br>
                <kbd>F</kbd> open / shut your side's doors<br>
                <kbd>Tab</kbd> scores · <kbd>Esc</kbd> this menu</p>${back}`,
            playing: '',
            replaced: `<h1>Playing in another tab</h1><p>This one let go.</p>${back}`,
            unavailable: `<h1>The game server is unavailable</h1><p>Retrying…</p>${back}`,
            unknown: `<h1>Unknown player</h1><p>Pick yourself again from the Hub.</p>${back}`,
        }[state]
    }

    /** Who hosts, and whether it's you: the host's controls show on your menu in warmup. */
    setHost(host: { isHost: boolean; name: string | null; seated: number }): void {
        this.host = host
        this.renderHost()
    }

    /** A refusal from the server, shown on the menu (the host's start, mostly). */
    notice(text: string): void {
        this.hostNotice = text
        this.renderHost()
    }

    /** The host's controls (warmup, your menu): the rules and Start. Others see who they wait for. */
    private renderHost(): void {
        const panel = this.el.host!
        const match = this.match
        const show = this.cardState === 'paused' && match?.phase === 'warmup'
        panel.classList.toggle('hidden', !show)
        if (!show || !match) return
        if (!this.host.isHost) {
            panel.innerHTML = `<p>Waiting for <b>${escape(this.host.name ?? 'the host')}</b> to start the next match.</p>`
            return
        }
        const enough = this.host.seated >= 2
        const modes = MODES.map(
            m => `<option value="${m}"${m === match.mode ? ' selected' : ''}>${MODE_NAMES[m]}</option>`
        ).join('')
        const minutes = MATCH_MINUTES.map(
            v => `<option value="${v}"${v === match.minutes ? ' selected' : ''}>${v} min</option>`
        ).join('')
        panel.innerHTML = `
            <h2>You're the host</h2>
            <div class="row"><label>Mode <select data-rule="mode">${modes}</select></label></div>
            <div class="row">
                <label>First to <select data-rule="fragLimit"></select></label>
                <label>or <select data-rule="minutes">${minutes}</select></label>
            </div>
            <p class="hint" data-explain></p>
            <button type="button" data-start ${enough ? '' : 'disabled'}>Start match</button>
            <p class="hint">${enough ? (this.hostNotice ?? '') : 'Needs a second player.'}</p>`
        const select = (rule: string) => panel.querySelector<HTMLSelectElement>(`[data-rule="${rule}"]`)!
        // The limit reads as kills, team kills or seconds in the zone, depending on the mode.
        const describe = () => {
            const mode = select('mode').value as Mode
            const chosen = Number(select('fragLimit').value) || match.fragLimit
            select('fragLimit').innerHTML = FRAG_LIMITS.map(v => {
                const label =
                    mode === 'koth'
                        ? `${v * ZONE_SECONDS_PER_POINT} s in the zone`
                        : mode === 'tdm'
                          ? `${v} team kills`
                          : mode === 'siege'
                            ? `${v} points a half`
                            : `${v} kills`
                return `<option value="${v}"${v === chosen ? ' selected' : ''}>${label}</option>`
            }).join('')
            panel.querySelector('[data-explain]')!.textContent = MODE_HINTS[mode]
            // Siege's halves have their own length.
            select('minutes').disabled = mode === 'siege'
        }
        describe()
        select('mode').addEventListener('change', describe)
        panel.querySelector('[data-start]')!.addEventListener('click', () => {
            this.hostNotice = null
            this.hooks.onStart({
                mode: select('mode').value as Mode,
                fragLimit: Number(select('fragLimit').value),
                minutes: Number(select('minutes').value),
            })
        })
    }

    /** The settings: built once (the sliders keep their place), saved on every change. */
    private buildSettings(): void {
        const panel = this.el.settings!
        const s = this.hooks.settings
        const slider = (key: keyof typeof LIMITS, label: string, format: (v: number) => string) => {
            const { min, max, step } = LIMITS[key]
            return `<label class="slider">${label} <output data-out="${key}">${format(s[key])}</output>
                <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"></label>`
        }
        const times = (v: number) => `${v.toFixed(2)}×`
        const percent = (v: number) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)
        const resolution = (v: number) => `${Math.round(v * 100)}%`
        panel.innerHTML = `
            <h2>Settings</h2>
            ${slider('sensitivity', 'Mouse sensitivity', times)}
            ${slider('aimSensitivity', 'While aiming', times)}
            ${slider('fov', 'Field of view', v => `${v}°`)}
            ${slider('volume', 'Sound', percent)}
            ${slider('resolution', 'Resolution', resolution)}
            <label class="check"><input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''}> Invert mouse Y</label>
            <label class="check"><input type="checkbox" data-setting="antialias" ${s.antialias ? 'checked' : ''}> Anti-aliasing <small data-out="antialias"></small></label>
            <label class="check"><input type="checkbox" data-setting="perfOverlay" ${s.perfOverlay ? 'checked' : ''}> Performance overlay</label>
            <button type="button" data-reset>Defaults</button>`
        const show = (key: keyof typeof LIMITS, text: string) => {
            panel.querySelector(`[data-out="${key}"]`)!.textContent = text
        }
        const read = (): Settings => {
            const value = (key: string) =>
                Number(panel.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!.value)
            return {
                sensitivity: value('sensitivity'),
                aimSensitivity: value('aimSensitivity'),
                fov: value('fov'),
                volume: value('volume'),
                resolution: value('resolution'),
                invertY: panel.querySelector<HTMLInputElement>('[data-setting="invertY"]')!.checked,
                perfOverlay: panel.querySelector<HTMLInputElement>('[data-setting="perfOverlay"]')!.checked,
                antialias: panel.querySelector<HTMLInputElement>('[data-setting="antialias"]')!.checked,
            }
        }
        // The canvas keeps the anti-aliasing it was made with: say when a change waits for a reload.
        const loadedWith = s.antialias
        panel.addEventListener('input', () => {
            const settings = read()
            show('sensitivity', times(settings.sensitivity))
            show('aimSensitivity', times(settings.aimSensitivity))
            show('fov', `${settings.fov}°`)
            show('volume', percent(settings.volume))
            show('resolution', resolution(settings.resolution))
            panel.querySelector('[data-out="antialias"]')!.textContent =
                settings.antialias === loadedWith ? '' : '(reload the page to apply)'
            this.hooks.onSettings(settings)
        })
        panel.querySelector('[data-reset]')!.addEventListener('click', () => {
            for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
                const input = panel.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!
                if (typeof value === 'boolean') input.checked = value
                else input.value = String(value)
            }
            panel.dispatchEvent(new Event('input'))
        })
    }

    setMatch(match: MatchView, at: number): void {
        this.match = match
        this.matchAt = at
        this.boardForced = match.phase === 'intermission'
        this.renderHost()
    }

    /** Your state from the latest snapshot (null: watching). */
    setSelf(self: SelfState | null): void {
        const hide = self === null
        for (const name of ['health', 'ammo', 'fuelBar', 'cross']) this.el[name]!.classList.toggle('hidden', hide)
        this.lowHealth(self && self.alive ? self.health : null)
        if (!self) return
        // Out of the usual (a Promotion, Overtime, an Intern): what full is now. The firewall: on top, in its colour.
        const full = maxHealthOf(powersOf(self.buffs.map(b => b.kind)))
        const outOf = full !== MAX_HEALTH ? `<span style="opacity:.5;font-size:16px"> / ${full}</span>` : ''
        const wall = self.buffs.find(b => b.kind === 'firewall')?.points
        const shield = wall ? `<span style="color:${BUFF_COLORS.firewall};font-size:18px"> +${wall}</span>` : ''
        write(this.el.health!, `<small>Health</small>${self.alive ? self.health : 0}${outOf}${shield}`)
        const slot = (n: number, slotName: 'primary' | 'secondary' | 'melee') =>
            `<b class="${weaponIn(slotName, self.loadout) === self.weapon ? 'on' : ''}">${n}</b>`
        const slots = `<span class="slots">${slot(1, 'primary')}${slot(2, 'secondary')}${slot(3, 'melee')}</span>`
        const name = WEAPON_NAMES[self.weapon]
        if (self.weapon === 'stapler') {
            write(this.el.ammo!, `<small>${name} ${slots}</small><span style="font-size:22px">📎 swing</span>`)
        } else {
            const big = self.magazine > magazineOf(self.weapon) ? ' style="color:#f2b134"' : ''
            const endless = self.buffs.some(b => b.kind === 'overtime')
            const rounds = endless
                ? `<span style="color:${BUFF_COLORS.overtime}">∞</span>`
                : self.reloading
                  ? '<span style="opacity:.6">reloading</span>'
                  : `<span${big}>${self.ammo}</span><span style="opacity:.5;font-size:16px"> / ${self.magazine}</span>`
            write(this.el.ammo!, `<small>${name} ${slots}</small>${rounds}`)
        }
        // A new loadout in hand (a spawn): the picker stops saying it waits.
        if (
            !this.carried ||
            this.carried.primary !== self.loadout.primary ||
            this.carried.secondary !== self.loadout.secondary
        ) {
            this.carried = self.loadout
            this.renderLoadout()
        }
        this.el.fuel!.style.width = `${Math.round(self.body.fuel * 100)}%`
        this.el.fuel!.style.background = self.body.jetBoost > 0 ? 'linear-gradient(90deg,#29a3e0,#7fd1ff)' : ''
        // Hurt, not a power ending (a Promotion's 500 back down to 100) or an Intern's lower ceiling.
        if (self.alive && self.health < this.lastHealth && full >= this.lastFull) this.flashHurt()
        this.lastHealth = self.alive ? self.health : MAX_HEALTH
        this.lastFull = full
        // Your powers, each with its time left.
        const buffs = self.buffs
            .map(b => {
                const { icon, label } = BUFF_LABELS[b.kind]
                const left = b.points !== undefined ? `${b.points} · ` : ''
                return `<div>${icon} ${label} <b style="color:${BUFF_COLORS[b.kind]}">${left}${Math.ceil(b.leftMs / 1000)} s</b></div>`
            })
            .join('')
        write(this.el.buffs!, buffs)
    }

    /** A big banner across the top: a streak, a shutdown, first blood (`level` 1 … 4 grows it). */
    callout(title: string, sub: string, level: number): void {
        const el = this.el.callout!
        el.innerHTML = `${escape(title)}<small>${escape(sub)}</small>`
        el.style.fontSize = `${26 + level * 6}px`
        el.style.transition = 'none'
        el.style.opacity = '1'
        el.style.transform = 'translateX(-50%) scale(1.25)'
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 2.2s ease-in 0.8s, transform .25s ease-out'
                el.style.transform = 'translateX(-50%) scale(1)'
                el.style.opacity = '0'
            })
        )
    }

    /** A short note by the crosshair (what you just picked up). */
    toast(text: string, color: string): void {
        const el = this.el.toast!
        el.textContent = text
        el.style.color = color
        fadeOut(el, 1400)
    }

    /**
     * King of the meeting room: the line under the crosshair (holding, contested, go get it) and
     * the marker over the zone (screen px; clamped to the edge when it's off screen). Null hides both.
     */
    /** Build mode's line (null: not building): standing or flat, and its keys. Redrawn only on a change. */
    building(stance: { flat: boolean } | null): void {
        const key = stance === null ? '' : stance.flat ? 'flat' : 'standing'
        if (key === this.buildShown) return
        this.buildShown = key
        const line = this.el.build!
        line.classList.toggle('hidden', stance === null)
        if (stance) {
            line.innerHTML = `<b>BUILD</b>${stance.flat ? 'Flat' : 'Standing'} · <kbd>Click</kbd> place · <kbd>R</kbd> turn · <kbd>Wheel</kbd> ${stance.flat ? 'standing' : 'flat'} · <kbd>F</kbd> door · <kbd>G</kbd> window · <kbd>E</kbd> take back · <kbd>B</kbd> guns`
        }
    }
    private buildShown = ''

    /** What F does here (a door to open or shut), under the crosshair; null hides it. Redrawn only on a change. */
    prompt(action: string | null): void {
        if (action === this.promptShown) return
        this.promptShown = action
        const line = this.el.prompt!
        line.classList.toggle('hidden', action === null)
        if (action) line.innerHTML = `<kbd>F</kbd>${escape(action)}`
    }
    private promptShown: string | null = null

    zone(
        status: { text: string; color: string } | null,
        marker: { x: number; y: number; label: string; color: string } | null
    ): void {
        const line = this.el.zoneStatus!
        line.classList.toggle('hidden', status === null)
        if (status) {
            line.textContent = status.text
            line.style.color = status.color
        }
        const pin = this.el.zoneMarker!
        pin.classList.toggle('hidden', marker === null)
        if (marker) {
            pin.style.left = `${marker.x}px`
            pin.style.top = `${marker.y}px`
            pin.style.borderColor = marker.color
            pin.querySelector('span')!.textContent = marker.label
        }
    }

    /** Your shot landed: a marker on the crosshair (gold for a headshot, big and red for a kill). */
    hitMarker(headshot: boolean, kill = false): void {
        const hit = this.el.hit!
        hit.classList.toggle('head', headshot && !kill)
        hit.classList.toggle('kill', kill)
        fadeOut(hit, kill ? 600 : 260)
    }

    /** The damage you did, popping up where it landed (screen px), rising as it fades. */
    damageNumber(amount: number, headshot: boolean, x: number, y: number): void {
        const pop = document.createElement('div')
        pop.className = `pop${headshot ? ' head' : ''}${amount === 0 ? ' none' : ''}`
        pop.textContent = amount === 0 ? 'shielded' : String(amount)
        pop.style.left = `${x + (Math.random() - 0.5) * 24}px`
        pop.style.top = `${y}px`
        this.root.append(pop)
        requestAnimationFrame(() => {
            pop.style.transform = 'translate(-50%,-50%) translateY(-46px)'
            pop.style.opacity = '0'
        })
        setTimeout(() => pop.remove(), 750)
    }

    /** The ring by the crosshair, filling as a reload goes (0 … 1), or hidden (null). */
    reload(progress: number | null): void {
        this.el.reload!.classList.toggle('hidden', progress === null)
        if (progress !== null) this.el.reloadFill!.setAttribute('stroke-dashoffset', String(RING * (1 - progress)))
    }

    /**
     * The hip-fire cone round the crosshair: four ticks this many px from the middle (what the
     * rounds may stray to), or none (null: the stapler, the launcher, down).
     */
    spread(radius: number | null): void {
        const el = this.el.spread!
        el.classList.toggle('hidden', radius === null)
        if (radius !== null) el.style.setProperty('--r', `${Math.max(4, radius).toFixed(1)}px`)
    }

    /** Top left: frames a second, and the round trip to the server (ms; null until measured). Green, yellow or red. */
    stats(fps: number, pingMs: number | null): void {
        const fpsGrade = fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad'
        let html = `<span class="${fpsGrade}">${Math.round(fps)}</span> fps`
        if (pingMs !== null) {
            const pingGrade = pingMs <= 60 ? 'good' : pingMs <= 120 ? 'ok' : 'bad'
            html += ` <span class="${pingGrade}">${Math.round(pingMs)}</span> ms`
        }
        write(this.el.stats!, html)
    }

    /**
     * Low on health (null: not playing): blood round the screen, thicker the lower you are, a
     * heartbeat in it and the health blinking from LOW_HEALTH.blink down.
     */
    private lowHealth(health: number | null): void {
        const { from, blink } = LOW_HEALTH
        const strength = health === null ? 0 : Math.max(0, Math.min(1, (from - health) / (from - 10)))
        // Blocks creep in a step at a time; the little grid is drawn again only then (or on a resize).
        const step = Math.ceil(strength * BLOOD.steps)
        const rows = Math.max(1, Math.round((BLOOD.cols * innerHeight) / Math.max(1, innerWidth)))
        if (step !== this.bloodDrawn.step || rows !== this.bloodDrawn.rows) {
            this.bloodDrawn = { step, rows }
            this.drawBlood(step / BLOOD.steps, rows)
        }
        this.el.blood!.classList.toggle('on', step > 0)
        const low = health !== null && health <= blink
        this.el.bloodBeat!.classList.toggle('beat', low)
        this.el.health!.classList.toggle('low', low)
    }

    private bloodDrawn = { step: -1, rows: 0 }

    /** The blood's blocks, and the heartbeat's (the same cells, bright), one pixel a cell. */
    private drawBlood(strength: number, rows: number): void {
        const cells = bloodCells(strength, BLOOD.cols, rows)
        const paint = (canvas: HTMLCanvasElement, color: (shade: number) => string) => {
            canvas.width = BLOOD.cols
            canvas.height = rows
            const g = canvas.getContext('2d')
            if (!g) return
            g.clearRect(0, 0, BLOOD.cols, rows)
            for (let i = 0; i < cells.length; i++) {
                if (cells[i] === 0) continue
                g.fillStyle = color(cells[i]!)
                g.fillRect(i % BLOOD.cols, Math.floor(i / BLOOD.cols), 1, 1)
            }
        }
        paint(this.el.blood as HTMLCanvasElement, shade => BLOOD.colors[shade]!)
        paint(this.el.bloodBeat as HTMLCanvasElement, () => BLOOD.pulse)
    }

    /** A headshot: one you landed (gold, by the crosshair), or one you took (red, with a flash round the screen). */
    headshot(who: 'dealt' | 'taken'): void {
        if (who === 'dealt') return fadeOut(this.el.hsDealt!, 700)
        fadeOut(this.el.hsTaken!, 1100)
        fadeOut(this.el.hsFlash!, 600)
    }

    /** You took someone down. */
    eliminated(name: string): void {
        const elim = this.el.elim!
        elim.innerHTML = `Eliminated <b>${escape(name)}</b>`
        fadeOut(elim, 1600)
    }

    /**
     * You were hit from this direction: radians from where you look (0 ahead, π/2 to your right).
     * A red arc on that side of the crosshair.
     */
    damageFrom(angle: number): void {
        const arc = document.createElement('div')
        arc.className = 'from'
        arc.style.transform = `rotate(${angle}rad)`
        this.root.append(arc)
        requestAnimationFrame(() => requestAnimationFrame(() => (arc.style.opacity = '0')))
        setTimeout(() => arc.remove(), 1000)
    }

    /** Over the player your crosshair is on (screen px of the top of their head), or hidden. */
    target(who: { name: string; color: string; health: number; maxHealth: number } | null, x = 0, y = 0): void {
        const target = this.el.target!
        target.classList.toggle('hidden', who === null)
        if (!who) return
        target.style.left = `${x}px`
        target.style.top = `${y}px`
        const name = target.querySelector<HTMLElement>('.name')!
        if (name.textContent !== who.name) name.textContent = who.name
        name.style.boxShadow = `inset 0 -2px 0 ${who.color}`
        const bar = target.querySelector<HTMLElement>('.bar div')!
        const share = Math.max(0, Math.min(1, who.health / who.maxHealth))
        bar.style.width = `${share * 100}%`
        bar.style.background = share > 0.6 ? '#5ad16b' : share > 0.3 ? '#f2b134' : '#ff4d4d'
    }

    set aiming(on: boolean) {
        this.root.classList.toggle('aiming', on)
    }

    killFeed(html: string): void {
        const line = document.createElement('div')
        line.innerHTML = html
        this.el.feed!.prepend(line)
        while (this.el.feed!.children.length > 5) this.el.feed!.lastElementChild!.remove()
        setTimeout(() => (line.style.opacity = '0'), 5000)
        setTimeout(() => line.remove(), 5500)
    }

    /** Once a frame: the timer, the middle message and the scoreboard. */
    update(now: number, opts: HudFrame): void {
        const match = this.match
        if (!match) return
        const left = match.remainingMs === null ? null : Math.max(0, match.remainingMs - (now - this.matchAt))
        const top = {
            warmup: `Warmup <small style="opacity:.7">· ${
                this.host.isHost
                    ? this.host.seated >= 2
                        ? "you're the host: Esc to start a match"
                        : 'waiting for a second player'
                    : `${escape(this.host.name ?? 'the host')} starts the next match`
            }</small>`,
            countdown: `${MODE_NAMES[match.mode]} in <b>${Math.ceil((left ?? 0) / 1000)}</b>`,
            playing: `<b>${clock(left ?? 0)}</b> <small style="opacity:.7">· ${this.standing(match, opts.me)}</small>`,
            intermission: `Match over <small style="opacity:.7">· back to warmup in ${Math.ceil((left ?? 0) / 1000)}</small>`,
        }[match.phase]
        write(this.el.top!, top)

        let middle = ''
        if (opts.me && !opts.self) middle = `Watching<small>The game is full: you're in at the next free seat.</small>`
        else if (opts.self && !opts.self.alive) {
            const by = opts.killer ? `Fragged by ${escape(opts.killer)}` : 'Down'
            const taunt = opts.taunt ? `<small class="taunt">${escape(opts.taunt)}</small>` : ''
            const next = opts.self.nextLoadout
            const guns = `${WEAPON_NAMES[next.primary]} + ${WEAPON_NAMES[next.secondary]}`
            const recap = opts.cause ? deathRecap(opts.cause) : ''
            middle = `${by}${taunt}${recap}<small>Back in ${Math.ceil((opts.self.respawnInMs ?? 0) / 1000)} with ${escape(guns)} · <kbd>Esc</kbd> to change</small>`
        } else if (match.phase === 'countdown') {
            middle = `${Math.ceil((left ?? 0) / 1000)}<small>Warmup kills don't count</small>`
        }
        write(this.el.middle!, middle)

        const board = this.el.board!
        const show = opts.tab || this.boardForced
        board.classList.toggle('hidden', !show)
        if (show) write(board, this.board(match, opts.me, opts.roster))
    }

    /** The match's score in a line: the sides (team deathmatch, siege), the zone time, or the leader's kills. */
    private standing(match: MatchView, me: string | null): string {
        if (match.siege) {
            const { siege } = match
            const mine = match.scores.find(s => s.id === me)?.team
            const side = (team: Team) =>
                `<b style="color:${TEAM_COLORS[team]}${mine === team ? ';text-decoration:underline' : ''}">${team.toUpperCase()} ${siege.points[team]}</b>`
            const spot = SIEGE_SPOTS[siege.spot]!.name
            return `${side('red')} – ${side('blue')} · half ${siege.half} · ${siege.attackers} attack the ${escape(spot)} · first to ${match.fragLimit}`
        }
        if (match.mode === 'tdm' && match.teams) {
            const mine = match.scores.find(s => s.id === me)?.team
            const side = (team: Team) =>
                `<b style="color:${TEAM_COLORS[team]}${mine === team ? ';text-decoration:underline' : ''}">${team.toUpperCase()} ${match.teams![team]}</b>`
            return `${side('red')} – ${side('blue')} · first to ${match.fragLimit}`
        }
        const leader = match.scores[0]
        if (match.mode === 'koth') {
            const goal = match.fragLimit * ZONE_SECONDS_PER_POINT
            const you = match.scores.find(s => s.id === me)
            return `${you ? `you ${you.points} s · ` : ''}${leader ? `${escape(leader.name)} ${leader.points} s · ` : ''}first to ${goal} s`
        }
        return `first to ${match.fragLimit}${leader ? ` · ${escape(leader.name)} ${leader.kills}` : ''}`
    }

    private board(match: MatchView, me: string | null, roster: Map<string, PlayerInfo>): string {
        const dot = (color: string) => `<span style="color:${color}">●</span>`
        const koth = match.mode === 'koth'
        const siege = match.siege
        const row = (classes: string, place: string, name: string, cells: string[]) =>
            `<tr class="${classes}"><td>${place}</td><td>${name}</td>${cells.map(c => `<td class="n">${c}</td>`).join('')}</tr>`
        const cellsOf = (s: Score) => [
            ...(koth ? [`${s.points} s`] : siege ? [String(s.points)] : []),
            String(s.kills),
            String(s.deaths),
        ]
        const scoreRow = (s: Score, i: number) =>
            row(
                `${s.id === me ? 'me' : ''} ${s.id === null ? 'gone' : ''}`,
                String(i + 1),
                `${dot(s.color)} ${escape(s.name)}`,
                cellsOf(s)
            )
        const extra = koth ? '<th class="n">Zone</th>' : siege ? '<th class="n">Points</th>' : ''
        const head = `<tr><th></th><th>Player</th>${extra}<th class="n">Kills</th><th class="n">Deaths</th></tr>`

        let title = ''
        if (match.phase === 'intermission' && siege) {
            const won = siegeWinner(siege.points, siege.times)
            const tie = won && siege.points.red === siege.points.blue ? ' (faster)' : ''
            title = `<h2 style="margin:0 0 8px;font-size:18px">${won ? `${won === 'red' ? 'Red' : 'Blue'} team wins${tie}` : "It's a draw"}</h2>`
        } else if (match.phase === 'intermission') {
            const winner =
                match.mode === 'tdm' && match.teams
                    ? match.teams.red === match.teams.blue
                        ? "It's a draw"
                        : `${match.teams.red > match.teams.blue ? 'Red' : 'Blue'} team wins`
                    : match.scores[0]
                      ? `${escape(match.scores[0].name)} wins`
                      : 'Match over'
            title = `<h2 style="margin:0 0 8px;font-size:18px">${winner}</h2>`
        }
        const awards = match.awards?.length
            ? `<div class="awards">${match.awards
                  .map(
                      a =>
                          `<div><small>${escape(a.title)}</small><b style="color:${a.color}">${escape(a.name)}</b><span>${escape(a.detail)}</span></div>`
                  )
                  .join('')}</div>`
            : ''

        // Team deathmatch and siege: one table per side, with its total (kills, or points).
        if ((match.mode === 'tdm' || siege) && match.scores.length) {
            const tables = TEAMS.map(team => {
                const rows = match.scores.filter(s => s.team === team).map(scoreRow)
                const total = siege ? `${siege.points[team]} points` : (match.teams?.[team] ?? 0)
                const role = siege ? ` · ${team === siege.attackers ? 'attacking' : 'defending'}` : ''
                return `<h3 style="color:${TEAM_COLORS[team]}">${team.toUpperCase()} · ${total}${role}</h3><table>${head}${rows.join('')}</table>`
            })
            return `${title}${awards}${tables.join('')}`
        }
        // In a match, the scores (who left greyed); in warmup, who's here.
        const rows = match.scores.length
            ? match.scores.map(scoreRow)
            : [...roster.values()].map(p => {
                  const watching = p.watching ? ' <small style="opacity:.6">watching</small>' : ''
                  return row(p.id === me ? 'me' : '', '', `${dot(p.color)} ${escape(p.name)}${watching}`, ['–', '–'])
              })

        return `${title}${awards}<table>${head}${rows.join('')}</table>`
    }

    private flashHurt(): void {
        const hurt = this.el.hurt!
        hurt.style.transition = 'none'
        hurt.style.opacity = '1'
        requestAnimationFrame(() => {
            hurt.style.transition = 'opacity .5s'
            hurt.style.opacity = '0'
        })
    }
}

function clock(ms: number): string {
    const s = Math.ceil(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const MODE_HINTS: Record<Mode, string> = {
    ffa: 'Everyone for themselves: most kills wins.',
    tdm: 'Red against blue, sides balanced. No friendly fire.',
    koth: 'Hold the zone alone to score a second a second. It moves every minute.',
    siege: `Red against blue on one spot, two halves of ${SIEGE.halfMs / 60_000} min. Defenders get ${SIEGE.headStartMs / 1000} s to build while the attackers wait in their dome; an attacker ${SIEGE.holdMs / 1000} s in the spot scores a point. Then swap. Most points wins, the faster on a tie.`,
}

export const BUFF_LABELS: Record<BuffKind, { icon: string; label: string }> = {
    magazine: { icon: '📦', label: 'Big magazine' },
    jetpack: { icon: '🚀', label: 'Jetpack ×4' },
    headshot: { icon: '🎯', label: 'One-shot headshots' },
    overtime: { icon: '⏰', label: 'Overtime' },
    promotion: { icon: '📈', label: 'Promotion' },
    firewall: { icon: '🛡️', label: 'Firewall' },
    espresso: { icon: '☕', label: 'Espresso' },
    intern: { icon: '🧑‍🎓', label: 'Intern' },
    bonus: { icon: '💰', label: 'Bonus ×2' },
    orgchart: { icon: '🗂️', label: 'Org chart' },
}
export const BUFF_COLORS: Record<BuffKind, string> = {
    magazine: '#f2b134',
    jetpack: '#29a3e0',
    headshot: '#ff3b3b',
    overtime: '#ff7a1a',
    promotion: '#b06bff',
    firewall: '#33e0ff',
    espresso: '#c08552',
    intern: '#b4f06b',
    bonus: '#ff4fa3',
    orgchart: '#e8ecf2',
}

/** How you went down, as the kill event told it. */
export interface DeathCause {
    weapon: Weapon
    headshot: boolean
    backstab: boolean
    recap?: KillRecap
}

/**
 * The death screen's recap (HTML): the gun and the range, then what the killer had left and what
 * it took them.
 */
export function deathRecap(cause: DeathCause): string {
    const r = cause.recap
    const head = [
        WEAPON_NAMES[cause.weapon],
        ...(cause.headshot ? ['<b class="hs">headshot</b>'] : []),
        ...(cause.backstab ? ['<b class="hs">from behind</b>'] : []),
        ...(r ? [`${r.distance.toFixed(1)} m away`] : []),
    ].join(' · ')
    if (!r) return `<div class="recap"><div class="recap-head">${head}</div></div>`

    const rows: Array<[string, string]> = [['Their health', `${r.killerHealth} / ${maxHealthOf(powersOf(r.buffs))}`]]
    if (r.ammo !== null && r.magazine !== null) {
        rows.push(['Their magazine', r.ammo === 0 ? 'empty' : `${r.ammo} / ${r.magazine}`])
    }
    const headshots = r.headshots > 0 ? ` (${r.headshots} to the head)` : ''
    rows.push(['Their hits on you', `${r.hits} for ${r.damage} damage${headshots}`])
    rows.push(['Time to kill', r.hits <= 1 ? 'one shot' : `${(r.timeMs / 1000).toFixed(1)} s`])
    if (r.othersDamage > 0) rows.push(['From others', `${r.othersDamage} damage`])
    if (r.buffs.length > 0) {
        rows.push(['Their powers', r.buffs.map(b => `${BUFF_LABELS[b].icon} ${BUFF_LABELS[b].label}`).join(', ')])
    }
    const cells = rows.map(([label, value]) => `<span>${label}</span><b>${value}</b>`).join('')

    return `<div class="recap"><div class="recap-head">${head}</div><div class="recap-rows">${cells}</div></div>`
}

/** The reload ring's circumference (r = 11 in its 30 × 30 box). */
const RING = 2 * Math.PI * 11

/** Blood starts showing under `from` health (full by 10); under `blink` it beats and the health blinks. */
const LOW_HEALTH = { from: 50, blink: 30 } as const

/**
 * The blood is blocks: a little grid (`cols` across, square cells), stretched over the screen with
 * hard edges. Drawn again only when it creeps a step (`steps` from none to full), so the browser
 * never repaints gradients or blurs over the whole screen.
 */
export const BLOOD = {
    cols: 64,
    steps: 12,
    /** How far in it reaches at full strength, as a share of the rows. */
    reach: 0.2,
    /** Darkest at the edge … brightest at the rim. */
    colors: ['', 'rgba(70,0,0,.78)', 'rgba(115,6,6,.7)', 'rgba(165,18,14,.62)'],
    pulse: 'rgba(235,30,24,.4)',
} as const

/** A cell's own random number, 0 … 1: the same every time. */
function cellNoise(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - Math.floor(n)
}

/**
 * Which cells bleed at this strength (0 … 1), row by row: 0 none, 1 dark (at the edge) … 3 bright
 * (the rim creeping in). Thicker in the corners, ragged, with drips down from the top; a cell that
 * shows at one strength shows at every stronger one.
 */
export function bloodCells(strength: number, cols: number, rows: number): Uint8Array {
    const cells = new Uint8Array(cols * rows)
    const reach = Math.max(0, Math.min(1, strength)) * rows * BLOOD.reach
    if (reach <= 0) return cells
    const cornerSpan = rows * 0.5
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            // Cells from the nearest edge, less in the corners, ragged by the cell's noise.
            let depth = Math.min(x, cols - 1 - x, y, rows - 1 - y)
            const corner = Math.min(
                Math.hypot(x, y),
                Math.hypot(cols - 1 - x, y),
                Math.hypot(x, rows - 1 - y),
                Math.hypot(cols - 1 - x, rows - 1 - y)
            )
            depth -= Math.max(0, 1 - corner / cornerSpan) * rows * 0.08
            depth += (cellNoise(x, y) - 0.5) * 1.6
            // Drips: some columns run further down from the top edge, longer as it gets worse.
            const drip = cellNoise(x, 999)
            if (drip > 0.75) depth = Math.min(depth, y - (drip - 0.75) * 4 * reach)
            if (depth >= reach) continue
            cells[y * cols + x] = depth < reach - 2.5 ? 1 : depth < reach - 1 ? 2 : 3
        }
    }
    return cells
}

/** One line on each gun, for the loadout picker. */
const GUN_BLURBS = {
    rifle: 'Automatic, 30 rounds',
    sniper: 'Scope, one-shot headshots',
    shotgun: 'Devastating up close',
    pistol: 'Quick, 8 rounds',
    launcher: 'Rockets, splash · 7 s reload',
} as const

/** What each element was last given: the HUD redraws every frame, and an unchanged write would still cost a layout. */
const written = new WeakMap<HTMLElement, string>()

function write(element: HTMLElement, html: string): void {
    if (written.get(element) === html) return
    written.set(element, html)
    element.innerHTML = html
}

/** Shows an element at once, then fades it out over `ms`. */
function fadeOut(element: HTMLElement, ms: number): void {
    element.style.transition = 'none'
    element.style.opacity = '1'
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            element.style.transition = `opacity ${ms}ms ease-in`
            element.style.opacity = '0'
        })
    )
}

export function escape(text: string): string {
    return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}
