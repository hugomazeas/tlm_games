import {
    type BuffKind,
    FRAG_LIMITS,
    type KillRecap,
    type Loadout,
    LOBBY_MAP,
    MAP_INFO,
    type MapId,
    MAPS,
    playableOn,
    PRIMARIES,
    SECONDARIES,
    WEAPON_NAMES,
    weaponIn,
    MATCH_MINUTES,
    type MatchView,
    type Mode,
    MODE_NAMES,
    MODES,
    type Phase,
    type PlayerInfo,
    type Rules,
    type Score,
    type SelfState,
    SIEGE,
    sameTuning,
    type Team,
    TEAM_COLORS,
    TEAMS,
    type Tuning,
    TUNING_CHOICES,
    type TuningKey,
    type Weapon,
    ZONE_SECONDS_PER_POINT,
} from '../protocol.ts'
import { GUNS, LAUNCHER, magazineOf, MAX_HEALTH, maxHealthOf, powersOf } from '../sim/combat.ts'
import { siegeWinner } from '../sim/places.ts'
import { resolveTuning } from '../sim/tuning.ts'
import { placesOf } from '../sim/world.ts'
import { DEFAULT_SETTINGS, LIMITS, type Settings } from './settings.ts'

/**
 * Everything drawn over the game, in plain DOM: crosshair and hit marker, health, ammo, fuel,
 * the match's timer, the kill feed, the scoreboard (Tab, and between matches), messages in the
 * middle (warmup, countdown, down, watching), and the click-to-play card while the mouse is free.
 */

/**
 * The Esc menu: the game dimmed behind (no blur: it would re-blur the canvas every frame), a panel
 * with a sidebar (Resume, the pages, back to the Hub) and the page beside it.
 */
const MENU_CSS = `
#fps-hud .menu { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; pointer-events: auto; background: rgba(6,8,12,.74); --ink: #eef1f4; --soft: rgba(238,241,244,.64); --line: rgba(255,255,255,.07); --gold: #ffd166; }
#fps-hud .menu ::selection { background: rgba(255,209,102,.35); }
#fps-hud .menu :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
#fps-hud .menu .icon { width: 18px; height: 18px; flex: none; }
#fps-hud .menu kbd { display: inline-block; min-width: 22px; text-align: center; padding: 3px 7px; border-radius: 5px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.13); border-bottom-width: 2px; font: 600 12px/1 system-ui, sans-serif; color: var(--ink); }
#fps-hud .menu-shell, #fps-hud .menu-message { cursor: default; color: var(--ink); background: #12151b; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35); animation: menu-in .24s cubic-bezier(.16,1,.3,1); font-weight: 500; }
@keyframes menu-in { from { opacity: .35; transform: translateY(10px) scale(.985); } }
#fps-hud .menu-shell { width: min(980px, 100%); height: min(620px, calc(100vh - 32px)); display: grid; grid-template-columns: 236px minmax(0, 1fr); overflow: hidden; }
#fps-hud .menu-nav { display: flex; flex-direction: column; gap: 2px; padding: 24px 14px 14px; background: #0d1015; border-right: 1px solid var(--line); min-height: 0; overflow-y: auto; }
#fps-hud .menu-title b { display: block; padding: 0 10px; font-size: 19px; font-weight: 800; letter-spacing: -.01em; }
#fps-hud .menu-title span { display: flex; align-items: center; gap: 7px; padding: 5px 10px 0; font-size: 12.5px; color: var(--soft); }
#fps-hud .menu .phase { width: 7px; height: 7px; border-radius: 50%; background: #60a5fa; flex: none; }
#fps-hud .menu .phase.loading, #fps-hud .menu .phase.countdown { background: var(--gold); }
#fps-hud .menu .phase.playing { background: #4ade80; }
#fps-hud .menu .phase.intermission { background: #c084fc; }
#fps-hud .menu .resume { margin: 20px 0 0; display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border: 0; border-radius: 10px; background: var(--gold); color: #1a1206; font: 800 15px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,.35); transition: background .12s, transform .12s; }
#fps-hud .menu .resume:hover { background: #ffdd88; }
#fps-hud .menu .resume:active { transform: translateY(1px); }
#fps-hud .menu .resume-hint { margin: 7px 0 16px; text-align: center; font-size: 11.5px; color: var(--soft); }
#fps-hud .menu .tabs { display: flex; flex-direction: column; gap: 2px; }
#fps-hud .menu .tabs button { display: flex; align-items: center; gap: 11px; height: 40px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--soft); font: 600 14px system-ui, sans-serif; text-align: left; cursor: pointer; transition: background .12s, color .12s; }
#fps-hud .menu .tabs button:hover { background: rgba(255,255,255,.05); color: var(--ink); }
#fps-hud .menu .tabs button[aria-selected="true"] { background: rgba(255,255,255,.08); color: #fff; }
#fps-hud .menu .tabs button[aria-selected="true"] .icon { color: var(--gold); }
#fps-hud .menu .tabs .dot { margin-left: auto; width: 7px; height: 7px; border-radius: 50%; background: var(--gold); }
#fps-hud .menu .leave { margin-top: auto; display: flex; align-items: center; gap: 11px; height: 40px; padding: 0 10px; border-radius: 8px; color: var(--soft); font-size: 13.5px; font-weight: 600; text-decoration: none; transition: background .12s, color .12s; }
#fps-hud .menu .leave:hover { color: #ffab99; background: rgba(255,120,100,.08); }
#fps-hud .menu-pages { min-height: 0; overflow-y: auto; padding: 30px 36px 32px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
#fps-hud .menu .page-head h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
#fps-hud .menu .page-head p { margin: 5px 0 0; font-size: 13.5px; color: var(--soft); }
#fps-hud .menu .pending { color: var(--gold); font-weight: 600; }
#fps-hud .menu .group { margin-top: 28px; }
#fps-hud .menu .group h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--soft); }
#fps-hud .menu .group h2 kbd { letter-spacing: 0; }
#fps-hud .menu .group p { margin: 0 0 10px; font-size: 14px; line-height: 1.45; }
#fps-hud .menu .group .lead { font-size: 16px; font-weight: 650; color: #fff; }
#fps-hud .menu .group .muted { color: var(--soft); }
#fps-hud .menu .group .notice { color: #ffab99; }
#fps-hud .menu .page-foot { margin: 28px 0 0; font-size: 12.5px; color: var(--soft); }
#fps-hud .menu button.primary { display: inline-flex; align-items: center; gap: 10px; height: 40px; margin-top: 4px; padding: 0 16px; border: 0; border-radius: 9px; background: #e4572e; color: #fff; font: 700 14px system-ui, sans-serif; cursor: pointer; transition: background .12s; }
#fps-hud .menu button.primary:hover { background: #ef6a42; }
#fps-hud .menu button.primary kbd { background: rgba(0,0,0,.18); border-color: rgba(0,0,0,.2); }
#fps-hud .menu .guns { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
#fps-hud .menu .gun { display: flex; flex-direction: column; gap: 4px; padding: 13px 14px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.035); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color .12s, background .12s; }
#fps-hud .menu .gun:hover { border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.06); }
#fps-hud .menu .gun.on { border-color: var(--gold); background: rgba(255,209,102,.09); }
#fps-hud .menu .gun-name { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 700; }
#fps-hud .menu .gun-name .icon { width: 16px; height: 16px; color: var(--gold); }
#fps-hud .menu .gun-blurb { font-size: 12.5px; color: var(--soft); }
#fps-hud .menu .gun-specs { display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 7px; font-size: 11.5px; color: var(--soft); font-variant-numeric: tabular-nums; }
#fps-hud .menu .gun-specs b { color: var(--ink); font-weight: 700; }
#fps-hud .menu .set-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 300px); align-items: center; gap: 24px; padding: 12px 0; border-top: 1px solid var(--line); }
#fps-hud .menu .group h2 + .set-row { border-top: 0; padding-top: 4px; }
#fps-hud .menu .set-label { font-size: 14px; font-weight: 600; }
#fps-hud .menu .set-label small { display: block; margin-top: 3px; font-size: 12px; font-weight: 500; color: var(--soft); }
#fps-hud .menu .set-control { display: flex; align-items: center; gap: 12px; }
#fps-hud .menu .set-control input { flex: 1; min-width: 0; margin: 0; accent-color: var(--gold); cursor: pointer; }
#fps-hud .menu .set-control output { min-width: 50px; text-align: right; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
#fps-hud .menu .seg { display: inline-flex; justify-self: end; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); }
#fps-hud .menu .seg button { min-width: 74px; height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: transparent; color: var(--soft); font: 600 13px system-ui, sans-serif; cursor: pointer; transition: background .12s, color .12s; }
#fps-hud .menu .seg button:hover { color: #fff; }
#fps-hud .menu .seg button[aria-pressed="true"] { background: var(--ink); color: #12151b; }
#fps-hud .menu .page-actions { display: flex; justify-content: flex-end; margin-top: 24px; }
#fps-hud .menu .page-actions button { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: transparent; color: var(--ink); font: 600 13px system-ui, sans-serif; cursor: pointer; transition: border-color .12s; }
#fps-hud .menu .page-actions button:hover { border-color: rgba(255,255,255,.32); }
#fps-hud .menu .keys { margin: 0; }
#fps-hud .menu .keys div { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0; border-top: 1px solid var(--line); }
#fps-hud .menu .keys div:first-child { border-top: 0; }
#fps-hud .menu .keys dt { font-size: 14px; }
#fps-hud .menu .keys dd { display: flex; align-items: center; gap: 4px; margin: 0; flex: none; }
#fps-hud .menu .keys em { padding: 0 2px; font-style: normal; font-size: 12px; color: var(--soft); }
#fps-hud .menu-message { width: min(440px, 100%); padding: 26px 28px 20px; }
#fps-hud .menu-message h1 { margin: 0 0 6px; font-size: 20px; font-weight: 800; }
#fps-hud .menu-message p { margin: 0 0 14px; color: var(--soft); line-height: 1.45; }
#fps-hud .menu-message .leave { margin: 0 -10px; color: var(--gold); }
#fps-hud .menu .menu-action { display: flex; flex-direction: column; align-items: stretch; }
#fps-hud .menu .host-badge { margin: 20px 10px -12px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); }
#fps-hud .menu .resume:disabled { background: rgba(255,209,102,.28); color: rgba(26,18,6,.7); cursor: default; box-shadow: none; }
#fps-hud .menu .resume-link { display: block; width: 100%; margin: -8px 0 12px; padding: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--soft); font: 600 13px system-ui, sans-serif; cursor: pointer; }
#fps-hud .menu .resume-link:hover { color: var(--ink); background: rgba(255,255,255,.05); }
#fps-hud .menu .choice { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.035); color: var(--ink); font: 600 13.5px system-ui, sans-serif; border-radius: 9px; cursor: pointer; transition: border-color .12s, background .12s; }
#fps-hud .menu .choice:hover { border-color: rgba(255,255,255,.24); background: rgba(255,255,255,.06); }
#fps-hud .menu .choice.on { border-color: var(--gold); background: rgba(255,209,102,.09); }
#fps-hud .menu .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
#fps-hud .menu .maps .choice { padding: 0; text-align: left; overflow: hidden; }
#fps-hud .menu .maps .art { display: block; height: 84px; }
#fps-hud .menu .maps b { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 0; font-size: 15px; }
#fps-hud .menu .maps b .icon { width: 16px; height: 16px; color: var(--gold); }
#fps-hud .menu .maps small { display: block; padding: 3px 12px 12px; font-size: 12px; font-weight: 500; color: var(--soft); }
#fps-hud .menu .modes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
#fps-hud .menu .modes .choice { height: 36px; padding: 0 14px; }
#fps-hud .menu .rules { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; font-size: 14px; }
#fps-hud .menu .rules label { display: flex; align-items: center; gap: 10px; }
#fps-hud .menu select { height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: #1b1f27; color: var(--ink); font: 600 13px system-ui, sans-serif; cursor: pointer; }
#fps-hud .menu select:disabled { opacity: .45; cursor: default; }
#fps-hud .menu details.tuning { margin-top: 28px; }
#fps-hud .menu details.tuning summary { cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--soft); }
#fps-hud .menu details.tuning summary:hover { color: var(--ink); }
#fps-hud .menu .tuning-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px 22px; margin-top: 10px; }
#fps-hud .menu .tuning-grid h3 { grid-column: 1 / -1; margin: 10px 0 0; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--soft); }
#fps-hud .menu .tuning-grid label { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13.5px; }
#fps-hud .menu .tuning-grid label.changed { color: var(--gold); }
#fps-hud .menu .tuning .muted { margin: 12px 0 0; font-size: 12.5px; color: var(--soft); }
#fps-hud .menu .tuning .muted button { margin-left: 8px; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid rgba(255,255,255,.14); background: transparent; color: var(--ink); font: 600 12px system-ui, sans-serif; cursor: pointer; }
#fps-hud .menu-main { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
#fps-hud .menu-main .menu-pages { flex: 1; }
#fps-hud .menu .menu-foot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 36px; background: #12151b; border-top: 1px solid var(--line); }
#fps-hud .menu .menu-foot.hidden { display: none; }
#fps-hud .menu .menu-foot p { margin: 0; font-size: 13px; color: var(--soft); }
#fps-hud .menu .menu-foot p b { color: var(--ink); }
#fps-hud .menu .menu-foot .notice { color: #ffab99; }
#fps-hud .menu .menu-foot button.primary { margin: 0; height: 44px; padding: 0 22px; font-size: 15px; flex: none; }
#fps-hud .menu button.primary:disabled { background: rgba(228,87,46,.35); color: rgba(255,255,255,.6); cursor: default; }
@media (max-width: 720px) {
    #fps-hud .menu .menu-foot { padding: 12px 18px; }
    #fps-hud .menu .host-badge { margin: 12px 0 -6px; }
    #fps-hud .menu-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); height: calc(100vh - 32px); }
    #fps-hud .menu-nav { padding: 14px; border-right: 0; border-bottom: 1px solid var(--line); }
    #fps-hud .menu .resume { margin-top: 12px; }
    #fps-hud .menu .resume-hint { display: none; }
    #fps-hud .menu .tabs { flex-direction: row; margin-top: 10px; overflow-x: auto; }
    #fps-hud .menu .leave { margin-top: 4px; }
    #fps-hud .menu-pages { padding: 20px 18px 24px; }
    #fps-hud .menu .set-row { grid-template-columns: 1fr; gap: 10px; }
    #fps-hud .menu .seg { justify-self: start; }
}
`

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
#fps-hud kbd { background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 6px; font: inherit; font-size: 12px; }
${MENU_CSS}
#fps-hud .slots b { display: inline-block; min-width: 14px; margin-left: 4px; padding: 0 3px; border-radius: 3px; text-align: center; background: rgba(255,255,255,.12); font-size: 10px; }
#fps-hud .slots b.on { background: #ffd166; color: #1a1206; }
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
    /** The map you're on has a jetpack (its fuel gauge shows). */
    jetpack = true

    private cardState = 'connecting'
    private host: { isHost: boolean; name: string | null; seated: number } = { isHost: false, name: null, seated: 0 }
    private hostNotice: string | null = null

    constructor(
        private readonly backUrl: string,
        private readonly hooks: {
            settings: Settings
            onSettings(settings: Settings): void
            onStart(rules: Rules): void
            /** The host changed what's lined up on their Next match panel. */
            onPlan(rules: Rules): void
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
            <div class="menu" data-el="card">
                <div class="menu-message hidden" data-el="cardMain" data-menu-panel></div>
                <div class="menu-shell hidden" data-el="menuShell" data-menu-panel role="dialog" aria-modal="true" aria-label="Menu">
                    <nav class="menu-nav">
                        <div class="menu-title"><b>Office FPS</b><span data-el="menuStatus"></span></div>
                        <div class="menu-action" data-el="menuAction"></div>
                        <div class="tabs" role="tablist">
                            ${PAGES.map(p => `<button type="button" role="tab" data-page="${p.id}">${ICONS[p.id]}<span>${p.label}</span><i class="dot hidden" data-dot="${p.id}"></i></button>`).join('')}
                        </div>
                        <a class="leave" href="${escape(backUrl)}">${ICONS.leave}<span>Back to the Hub</span></a>
                    </nav>
                    <div class="menu-main">
                        <div class="menu-pages">
                            <section class="page" data-el="loadout" data-for="loadout" role="tabpanel"></section>
                            <section class="page" data-el="host" data-for="match" role="tabpanel"></section>
                            <section class="page" data-el="settings" data-for="settings" role="tabpanel"></section>
                            <section class="page" data-el="controls" data-for="controls" role="tabpanel">${controlsPage()}</section>
                        </div>
                        <div class="menu-foot hidden" data-el="menuFoot"></div>
                    </div>
                </div>
            </div>`
        for (const node of this.root.querySelectorAll<HTMLElement>('[data-el]')) this.el[node.dataset.el!] = node
        document.body.append(this.root)
        this.el.menuShell!.addEventListener('click', e => {
            const target = e.target as Element
            const tab = target.closest<HTMLElement>('[data-page]')
            if (tab) this.showPage(tab.dataset.page as PageId)
            if (target.closest('[data-start]')) this.startNext()
        })
        this.listenToSetup()
        this.showPage('loadout')
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
            `<button type="button" class="gun${on ? ' on' : ''}" data-gun="${gun}" aria-pressed="${on}">
                <span class="gun-name">${WEAPON_NAMES[gun]}${on ? ICONS.check : ''}</span>
                <span class="gun-blurb">${GUN_BLURBS[gun]}</span>
                <span class="gun-specs">${gunSpecs(gun)}</span></button>`
        const waiting =
            this.carried && (this.carried.primary !== pick.primary || this.carried.secondary !== pick.secondary)
        panel.innerHTML = `<header class="page-head"><h1>Loadout</h1>
                <p>${waiting ? '<b class="pending">Picked: you carry it from your next spawn.</b>' : 'Two guns and the stapler. A change applies from your next spawn.'}</p></header>
            <div class="group"><h2>Primary <kbd>1</kbd></h2>
                <div class="guns">${PRIMARIES.map(g => button(g, g === pick.primary)).join('')}</div></div>
            <div class="group"><h2>Secondary <kbd>2</kbd></h2>
                <div class="guns">${SECONDARIES.map(g => button(g, g === pick.secondary)).join('')}</div></div>
            <p class="page-foot">Stapler <kbd>3</kbd> · the mouse wheel cycles · <kbd>Q</kbd> back to the last</p>`
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

    /**
     * The middle card: while connecting, the menu while the mouse is free, or a message when the game
     * is closed to you. The host's menu opens on the Match page in warmup: starting is theirs to do.
     */
    card(state: CardState): void {
        const was = this.cardState
        this.cardState = state
        if (state === 'playing') this.started = true
        this.el.card!.classList.toggle('hidden', state === 'playing')
        const menu = state === 'paused'
        this.el.menuShell!.classList.toggle('hidden', !menu)
        this.el.cardMain!.classList.toggle('hidden', menu)
        if (menu && was !== 'paused' && this.canSetUp) this.showPage('match')
        this.renderHost()
        if (menu) return
        const back = `<a class="leave" href="${escape(this.backUrl)}">${ICONS.leave}<span>Back to the Hub</span></a>`
        this.el.cardMain!.innerHTML = {
            connecting: `<h1>Office FPS</h1><p>Connecting to the game…</p>`,
            paused: '',
            playing: '',
            replaced: `<h1>Playing in another tab</h1><p>This tab let go of the game. Close it, or reload it to play here.</p>${back}`,
            unavailable: `<h1>The game server is unavailable</h1><p>Trying again on its own…</p>${back}`,
            unknown: `<h1>Unknown player</h1><p>Pick yourself again from the Hub.</p>${back}`,
        }[state]
    }

    /** You've played since the page opened: the menu's button says Resume, not Play. */
    private started = false
    private page: PageId = 'loadout'

    /** The menu's page: its tab marked, the others hidden. */
    showPage(page: PageId): void {
        this.page = page
        for (const tab of this.el.menuShell!.querySelectorAll<HTMLElement>('[data-page]'))
            tab.setAttribute('aria-selected', String(tab.dataset.page === page))
        for (const section of this.el.menuShell!.querySelectorAll<HTMLElement>('[data-for]'))
            section.classList.toggle('hidden', section.dataset.for !== page)
        this.syncFoot()
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

    /**
     * The menu's sidebar button and Match page. The host in warmup gets Start as the big button and
     * the Next match setup as the page; everyone else gets Resume, and what's on and what's coming.
     * Drawn through `write`, so an unchanged page keeps an open select.
     */
    private renderHost(): void {
        const match = this.match
        const hosting = this.canSetUp
        // Becoming the host (it's known only after the menu is up, at join) brings the setup forward.
        if (hosting && !this.wasHosting && this.cardState === 'paused') this.showPage('match')
        this.wasHosting = hosting
        const draft = hosting ? this.currentDraft() : null
        const action = primaryAction({
            hosting,
            seated: this.host.seated,
            rematch: draft !== null && this.isRematch(draft),
            started: this.started,
        })
        write(
            this.el.menuAction!,
            action.kind === 'start'
                ? `<p class="host-badge">You're the host</p>
                    <button type="button" class="resume" data-start data-resume ${action.ready ? '' : 'disabled'}>${ICONS.play}<span>${action.label}</span></button>
                    <p class="resume-hint">${action.ready ? escape(describeRules(draft!)) : 'Needs a second player'}</p>
                    <button type="button" class="resume-link" data-resume>Back to warmup</button>`
                : `<button type="button" class="resume" data-resume>${ICONS.play}<span>${action.label}</span></button>
                    <p class="resume-hint">or click outside this panel</p>`
        )
        this.el.menuShell!.querySelector('[data-dot="match"]')!.classList.toggle('hidden', !hosting)
        this.syncFoot()
        if (draft) {
            write(this.el.host!, this.setupPage(draft))
            write(this.el.menuFoot!, this.setupFoot(action))
            this.writeStatus()
            return
        }
        if (!match) {
            write(this.el.menuStatus!, 'Connecting…')
            write(this.el.host!, `<header class="page-head"><h1>Match</h1><p>Connecting to the game…</p></header>`)
            return
        }
        const map = MAP_INFO[match.map].name
        this.writeStatus()
        const warmup = match.phase === 'warmup'
        const now = warmup
            ? `<p class="lead">Warmup in ${escape(map.replace(/^The /, 'the '))}: nothing counts until the host starts a match.</p>`
            : `<p class="lead">${escape(describeRules({ map: match.map, mode: match.mode, fragLimit: match.fragLimit, minutes: match.minutes }))}</p>`
        const hostName = `<b>${escape(this.host.name ?? 'The host')}</b>`
        const next = match.next
            ? `<p class="lead">${escape(describeRules(match.next))}</p>`
            : `<p class="muted">Nothing lined up yet.</p>`
        const whoStarts = this.host.isHost
            ? `<p>You're the host: you set up the next match once this one is over.</p>`
            : warmup
              ? `<p>Waiting for ${hostName} to start the next match.</p>`
              : `<p>${hostName} sets up the next match once this one is over.</p>`
        const notice = this.hostNotice ? `<p class="notice">${escape(this.hostNotice)}</p>` : ''
        write(
            this.el.host!,
            `<header class="page-head"><h1>Match</h1><p>${PHASE_NAMES[match.phase]} · ${this.host.seated} in the game</p></header>
            <div class="group"><h2>${warmup ? 'Now' : match.phase === 'intermission' ? 'Just played' : 'Playing now'}</h2>${now}</div>
            <div class="group"><h2>Next</h2>${next}${whoStarts}${notice}</div>
            <p class="page-foot"><kbd>Tab</kbd> shows the scores</p>`
        )
    }

    /** What the host is lining up on their panel (starts from what's lined up, else the last match's rules). */
    private draft: Rules | null = null
    /** The panel's Options are unfolded (kept as it's drawn again on each change). */
    private tuningOpen = false

    /** Is the Next match panel for you now (you host, it's warmup)? */
    get canSetUp(): boolean {
        return this.host.isHost && this.match?.phase === 'warmup'
    }

    /** You were the host in warmup at the last render (a change to it opens the setup). */
    private wasHosting = false

    /** What the host is lining up, from what's lined up, else the last match's rules (warmup only). */
    private currentDraft(): Rules | null {
        const match = this.match
        if (!match) return null
        return (this.draft ??= match.next ?? {
            map: LOBBY_MAP,
            mode: match.mode,
            fragLimit: match.fragLimit,
            minutes: match.minutes,
            tuning: {},
        })
    }

    /** The same rules as the match just played: a rematch. */
    private isRematch(draft: Rules): boolean {
        const match = this.match
        return (
            this.played &&
            match !== null &&
            match.next !== null &&
            draft.map === match.next.map &&
            draft.mode === match.mode &&
            draft.fragLimit === match.fragLimit &&
            draft.minutes === match.minutes &&
            sameTuning(draft.tuning, match.next.tuning)
        )
    }

    /** The sidebar's line under the title: the phase and the map. */
    private writeStatus(): void {
        const match = this.match
        if (!match) return
        write(
            this.el.menuStatus!,
            `<i class="phase ${match.phase}"></i>${PHASE_NAMES[match.phase]} · ${escape(MAP_INFO[match.map].name)}`
        )
    }

    /**
     * The host's Match page in warmup: a map, a mode it allows, the limit and the length, the
     * options, and Start in a bar that stays in view. Every change is sent (`onPlan`), so everyone
     * sees what's coming and gets its map ready.
     */
    private setupPage(draft: Rules): string {
        const maps = MAPS.map(id => {
            const on = id === draft.map
            return `<button type="button" class="choice${on ? ' on' : ''}" data-map="${id}" aria-pressed="${on}">
                    <span class="art" style="background:${MAP_ART[id]}"></span>
                    <b>${escape(MAP_INFO[id].name)}${on ? ICONS.check : ''}</b><small>${escape(MAP_INFO[id].blurb)} · ${MAP_INFO[id].players} players</small>
                </button>`
        }).join('')
        const modes = MODES.filter(m => playableOn(draft.map, m))
            .map(m => {
                const on = m === draft.mode
                return `<button type="button" class="choice${on ? ' on' : ''}" data-mode="${m}" aria-pressed="${on}">${MODE_NAMES[m]}</button>`
            })
            .join('')
        const limits = FRAG_LIMITS.map(
            v => `<option value="${v}"${v === draft.fragLimit ? ' selected' : ''}>${limitLabel(draft.mode, v)}</option>`
        ).join('')
        const minutes = MATCH_MINUTES.map(
            v => `<option value="${v}"${v === draft.minutes ? ' selected' : ''}>${v} min</option>`
        ).join('')
        // Each option: the map's own unless picked (a jetpack second long on Rue des Érables, three in the office).
        const chosen = draft.tuning ?? {}
        const own = resolveTuning(placesOf(draft.map).move)
        let group = ''
        const options = TUNING_ROWS.map(row => {
            const heading = row.group === group ? '' : `<h3>${row.group}</h3>`
            group = row.group
            const value = chosen[row.key]
            const choices = (TUNING_CHOICES[row.key] as readonly (number | boolean)[])
                .map(
                    c =>
                        `<option value="${String(c)}"${c === value ? ' selected' : ''}>${tuningLabel(row.key, c)}</option>`
                )
                .join('')
            return `${heading}<label class="${value === undefined ? '' : 'changed'}">${row.label}
                <select data-tuning="${row.key}"><option value="">Default · ${tuningLabel(row.key, own[row.key])}</option>${choices}</select></label>`
        }).join('')
        const changed = Object.keys(chosen).length
        return `<header class="page-head"><h1>Next match</h1><p>You're the host: pick the map and the mode, then start the match for everyone.</p></header>
            <div class="group"><h2>Map</h2><div class="maps">${maps}</div></div>
            <div class="group"><h2>Mode</h2><div class="modes">${modes}</div><p class="muted">${MODE_HINTS[draft.mode]}</p></div>
            <div class="group"><h2>Length</h2><div class="rules">
                <label>First to <select data-rule="fragLimit">${limits}</select></label>
                <label>or <select data-rule="minutes" ${draft.mode === 'siege' ? 'disabled' : ''}>${minutes}</select></label>
            </div></div>
            <details class="tuning"${this.tuningOpen ? ' open' : ''}>
                <summary>Options${changed ? ` · ${changed} changed` : ''}</summary>
                <div class="tuning-grid">${options}</div>
                <p class="muted">Speeds, heights and gravity are of the map's own; hit boxes against the body as drawn.
                ${changed ? '<button type="button" data-tuning-reset>Reset to defaults</button>' : ''}</p>
            </details>`
    }

    /** The setup's footer, under the scrolling page: who's in, and Start. */
    private setupFoot(action: PrimaryAction): string {
        const status = this.hostNotice
            ? `<p class="notice">${escape(this.hostNotice)}</p>`
            : action.ready
              ? `<p><b>${this.host.seated} in the game.</b> Everyone warms up in the office until you start.</p>`
              : `<p><b>You're alone.</b> A match needs a second player.</p>`
        return `${status}<button type="button" class="primary" data-start data-resume ${action.ready ? '' : 'disabled'}>${action.label}</button>`
    }

    /** The footer shows on the host's Match page only. */
    private syncFoot(): void {
        this.el.menuFoot!.classList.toggle('hidden', !(this.canSetUp && this.page === 'match'))
    }

    /** The setup's choices, listened to once on the Match page (it's drawn again on each change). */
    private listenToSetup(): void {
        const page = this.el.host!
        page.addEventListener('click', e => {
            const target = e.target as Element
            const map = target.closest<HTMLElement>('[data-map]')
            if (map) this.changeDraft({ map: map.dataset.map as MapId })
            const mode = target.closest<HTMLElement>('[data-mode]')
            if (mode) this.changeDraft({ mode: mode.dataset.mode as Mode })
            if (target.closest('[data-tuning-reset]')) this.changeDraft({ tuning: {} })
        })
        page.addEventListener('change', e => {
            const select = e.target as HTMLSelectElement
            const rule = select.dataset.rule
            if (rule === 'fragLimit') this.changeDraft({ fragLimit: Number(select.value) })
            if (rule === 'minutes') this.changeDraft({ minutes: Number(select.value) })
            const key = select.dataset.tuning as TuningKey | undefined
            if (!key) return
            const tuning: Partial<Record<TuningKey, number | boolean>> = { ...this.currentDraft()?.tuning }
            // The first entry: back to the map's own.
            if (select.value === '') delete tuning[key]
            else tuning[key] = select.value === 'true' ? true : select.value === 'false' ? false : Number(select.value)
            this.changeDraft({ tuning: tuning as Partial<Tuning> })
        })
        // `toggle` doesn't bubble: caught on the way down.
        page.addEventListener(
            'toggle',
            e => {
                const details = e.target as HTMLElement
                if (details.matches('details.tuning')) this.tuningOpen = (details as HTMLDetailsElement).open
            },
            true
        )
    }

    private changeDraft(to: Partial<Rules>): void {
        const draft = this.currentDraft()
        if (!draft || !this.canSetUp) return
        const next = { ...draft, ...to }
        // A map that doesn't have the mode: its first one.
        if (!playableOn(next.map, next.mode)) next.mode = MAP_INFO[next.map].modes[0]!
        this.draft = next
        this.hooks.onPlan(next)
        this.renderHost()
    }

    /** The host's Start (the sidebar's button or the page's): the button also takes the mouse. */
    private startNext(): void {
        const draft = this.currentDraft()
        if (!draft || !this.canSetUp) return
        this.hostNotice = null
        this.hooks.onStart(draft)
    }

    /** The settings: built once (the sliders keep their place), saved on every change. */
    private buildSettings(): void {
        const panel = this.el.settings!
        let s: Settings = { ...this.hooks.settings }
        const times = (v: number) => `${v.toFixed(2)}×`
        const percent = (v: number) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)
        const formats: Record<SliderKey, (v: number) => string> = {
            sensitivity: times,
            aimSensitivity: times,
            fov: v => `${v}°`,
            volume: percent,
            resolution: v => `${Math.round(v * 100)}%`,
        }
        const label = (key: string, text: string, note: string) =>
            `<span class="set-label" id="set-${key}-label">${text}${note ? `<small>${note}</small>` : ''}</span>`
        const slider = (key: SliderKey, text: string, note = '') => {
            const { min, max, step } = LIMITS[key]
            return `<div class="set-row">${label(key, text, note)}<div class="set-control">
                <input type="range" data-setting="${key}" aria-labelledby="set-${key}-label" min="${min}" max="${max}" step="${step}" value="${s[key]}">
                <output data-out="${key}">${formats[key](s[key])}</output></div></div>`
        }
        const toggle = (key: ToggleKey, text: string, note: string, choices: ReadonlyArray<[string, string]>) =>
            `<div class="set-row">${label(key, text, note)}<div class="seg" role="group" aria-labelledby="set-${key}-label">${choices
                .map(
                    ([value, name]) => `<button type="button" data-seg="${key}" data-value="${value}">${name}</button>`
                )
                .join('')}</div></div>`
        const onOff: ReadonlyArray<[string, string]> = [
            ['false', 'Off'],
            ['true', 'On'],
        ]
        panel.innerHTML = `<header class="page-head"><h1>Settings</h1><p>Kept in this browser, applied as you change them.</p></header>
            <div class="group"><h2>Mouse</h2>
                ${slider('sensitivity', 'Sensitivity')}
                ${slider('aimSensitivity', 'While aiming', 'On top of the zoom’s own slowdown')}
                ${toggle('invertY', 'Invert Y', '', onOff)}</div>
            <div class="group"><h2>Display</h2>
                ${toggle('graphics', 'Graphics', 'Optimized: lighter leaves on Rue des Érables, at most 1× pixels', [
                    ['optimized', 'Optimized'],
                    ['full', 'Full'],
                ])}
                ${slider('fov', 'Field of view')}
                ${slider('resolution', 'Resolution', 'Fewer pixels for a graphics card that can’t keep up')}
                ${toggle('antialias', 'Anti-aliasing', '<span data-out="antialias">Smoother edges, about a third of the GPU’s work</span>', onOff)}</div>
            <div class="group"><h2>Audio</h2>
                ${slider('volume', 'Sound effects')}</div>
            <div class="group"><h2>Advanced</h2>
                ${toggle('perfOverlay', 'Performance overlay', 'Frame times, CPU and GPU, network, under the fps', onOff)}
                ${toggle('assetView', 'Show assets', 'Debug: library assets in colour, what the maps draw red', onOff)}</div>
            <div class="page-actions"><button type="button" data-reset>Restore defaults</button></div>`
        // The canvas keeps the anti-aliasing it was made with: say when a change waits for a reload.
        const loadedWith = s.antialias
        const sync = () => {
            for (const key of SLIDER_KEYS) {
                panel.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)!.value = String(s[key])
                panel.querySelector(`[data-out="${key}"]`)!.textContent = formats[key](s[key])
            }
            for (const button of panel.querySelectorAll<HTMLElement>('[data-seg]'))
                button.setAttribute(
                    'aria-pressed',
                    String(String(s[button.dataset.seg as ToggleKey]) === button.dataset.value)
                )
            panel.querySelector('[data-out="antialias"]')!.textContent =
                s.antialias === loadedWith
                    ? 'Smoother edges, about a third of the GPU’s work'
                    : 'Reload the page to apply this'
            panel.querySelector('[data-out="antialias"]')!.classList.toggle('pending', s.antialias !== loadedWith)
        }
        const commit = () => {
            sync()
            this.hooks.onSettings({ ...s })
        }
        sync()
        panel.addEventListener('input', e => {
            const key = (e.target as HTMLElement).dataset.setting as SliderKey | undefined
            if (!key) return
            s = { ...s, [key]: Number((e.target as HTMLInputElement).value) }
            commit()
        })
        panel.addEventListener('click', e => {
            const target = e.target as Element
            const seg = target.closest<HTMLElement>('[data-seg]')
            if (seg) {
                const key = seg.dataset.seg as ToggleKey
                const value = seg.dataset.value!
                s =
                    key === 'graphics'
                        ? { ...s, graphics: value === 'full' ? 'full' : 'optimized' }
                        : { ...s, [key]: value === 'true' }
                commit()
            }
            if (target.closest('[data-reset]')) {
                s = { ...DEFAULT_SETTINGS }
                commit()
            }
        })
    }

    setMatch(match: MatchView, at: number): void {
        this.match = match
        this.matchAt = at
        this.boardForced = match.phase === 'intermission'
        if (match.phase === 'intermission') this.played = true
        // Past warmup, the next panel starts again from what was played.
        if (match.phase !== 'warmup') this.draft = null
        this.renderHost()
    }

    /** A match has been played here (the panel offers a rematch). */
    private played = false

    /** Your state from the latest snapshot (null: watching). */
    setSelf(self: SelfState | null): void {
        const hide = self === null
        for (const name of ['health', 'ammo', 'cross']) this.el[name]!.classList.toggle('hidden', hide)
        this.el.fuelBar!.classList.toggle('hidden', hide || !this.jetpack)
        this.lowHealth(self && self.alive ? self.health : null)
        if (!self) return
        // Out of the usual (a Promotion, Overtime, an Intern): what full is now. The firewall: on top, in its colour.
        const full = maxHealthOf(powersOf(self.buffs.map(b => b.kind)), (this.match?.tuning.health ?? 100) / 100)
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
        const lined = match.next ? ` · next: ${escape(describeRules(match.next))}` : ''
        const loading = match.loading ? ` · ${match.loading.ready}/${match.loading.of} ready` : ''
        const top = {
            warmup: `Warmup <small style="opacity:.7">· ${
                this.host.isHost
                    ? this.host.seated >= 2
                        ? "you're the host: N to set up the next match"
                        : 'waiting for a second player'
                    : `${escape(this.host.name ?? 'the host')} starts the next match`
            }${lined}</small>`,
            loading: `Loading ${escape(MAP_INFO[match.next?.map ?? match.map].name.toLowerCase())}<small style="opacity:.7">${loading}</small>`,
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
            const spot = placesOf(match.map).siegeSpots[siege.spot]?.name ?? 'spot'
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

type CardState = 'connecting' | 'paused' | 'playing' | 'replaced' | 'unavailable' | 'unknown'

type PrimaryAction = { kind: 'start' | 'resume'; label: string; ready: boolean }

/**
 * The menu's big button: the host's Start in warmup (they're who everyone waits for; Rematch on
 * the last match's rules, not ready alone), else Resume (Play before you've played).
 */
export function primaryAction(o: {
    hosting: boolean
    seated: number
    rematch: boolean
    started: boolean
}): PrimaryAction {
    if (o.hosting) return { kind: 'start', label: o.rematch ? 'Rematch' : 'Start match', ready: o.seated >= 2 }
    return { kind: 'resume', label: o.started ? 'Resume' : 'Play', ready: true }
}

/** Each map's picture on its card (CSS, no image to load). */
const MAP_ART: Record<MapId, string> = {
    office: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.35)), repeating-linear-gradient(90deg, #c9a26b 0 34px, #b48c57 34px 36px), linear-gradient(#9fc4d8, #9fc4d8)',
    // An October sky, a maple's reds over a lawn, the street.
    erables:
        'radial-gradient(circle at 28% 42%, #c8452a 0 18%, rgba(0,0,0,0) 19%), radial-gradient(circle at 74% 38%, #e08a2c 0 15%, rgba(0,0,0,0) 16%), linear-gradient(180deg, #9cc3e0 0 48%, #6f8f4a 48% 70%, #4a4d52 70% 100%)',
}

/** What the limit counts in a mode: kills, team kills, seconds in the zone, points a half. */
export function limitLabel(mode: Mode, value: number): string {
    if (mode === 'koth') return `${value * ZONE_SECONDS_PER_POINT} s in the zone`
    if (mode === 'tdm') return `${value} team kills`
    if (mode === 'siege') return `${value} points a half`
    return `${value} kills`
}

/** A match's rules in a line: "Siege on the office, 5 points a half". */
export function describeRules(rules: Rules): string {
    const length = rules.mode === 'siege' ? '' : `, ${rules.minutes} min`
    const options = describeTuning(rules.tuning)
    return `${MODE_NAMES[rules.mode]} on ${MAP_INFO[rules.map].name.replace(/^The /, 'the ')}, ${limitLabel(rules.mode, rules.fragLimit)}${length}${options ? `; ${options}` : ''}`
}

/** The Next match panel's options, in its order and groups. */
export const TUNING_ROWS: ReadonlyArray<{ group: string; key: TuningKey; label: string }> = [
    { group: 'Movement', key: 'walk', label: 'Walk speed' },
    { group: 'Movement', key: 'jump', label: 'Jump height' },
    { group: 'Movement', key: 'gravity', label: 'Gravity' },
    { group: 'Movement', key: 'dash', label: 'Dodge (Shift)' },
    { group: 'Movement', key: 'prone', label: 'Prone (C)' },
    { group: 'Jetpack', key: 'jetpack', label: 'Fuel' },
    { group: 'Jetpack', key: 'thrust', label: 'Climb' },
    { group: 'Combat', key: 'hitbox', label: 'Hit boxes' },
    { group: 'Combat', key: 'damage', label: 'Damage' },
    { group: 'Combat', key: 'headshot', label: 'Headshot bonus' },
    { group: 'Combat', key: 'health', label: 'Health' },
    { group: 'Combat', key: 'regen', label: 'Health regen' },
    { group: 'Combat', key: 'respawn', label: 'Respawn' },
    { group: 'Map', key: 'pickups', label: 'Pickups' },
    { group: 'Map', key: 'building', label: 'Building (B)' },
]

/** An option's value as the panel shows it. */
export function tuningLabel(key: TuningKey, value: number | boolean): string {
    if (typeof value === 'boolean') return value ? 'On' : 'Off'
    if (key === 'jetpack') return value === 0 ? 'Off' : `${Number(value.toFixed(1))} s`
    if (key === 'respawn') return `${value} s`
    if (key === 'headshot' && value === 0) return 'None'
    return `${value}%`
}

/** The options the host changed, in a line ("walk speed 125%, pickups off"); empty when none. */
export function describeTuning(tuning: Partial<Tuning> = {}): string {
    return TUNING_ROWS.filter(row => tuning[row.key] !== undefined)
        .map(row => {
            const name = row.group === 'Jetpack' ? `jetpack ${row.label.toLowerCase()}` : row.label.toLowerCase()
            return `${name.replace(/ \(.*\)$/, '')} ${tuningLabel(row.key, tuning[row.key]!).toLowerCase()}`
        })
        .join(', ')
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
    /** Real metres per metre of the map it happened on (Rue des Érables is built for people, shrunk). */
    unit?: number
    /** The match's health option (%; 100 when absent): what full health was. */
    health?: number
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
        ...(r ? [`${(r.distance * (cause.unit ?? 1)).toFixed(1)} m away`] : []),
    ].join(' · ')
    if (!r) return `<div class="recap"><div class="recap-head">${head}</div></div>`

    const full = maxHealthOf(powersOf(r.buffs), (cause.health ?? 100) / 100)
    const rows: Array<[string, string]> = [['Their health', `${r.killerHealth} / ${full}`]]
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

/** A gun's numbers on its loadout card: damage, rate, magazine, reload. */
function gunSpecs(gun: keyof typeof GUN_BLURBS): string {
    const cell = (value: string, unit: string) => `<span><b>${value}</b> ${unit}</span>`
    if (gun === 'launcher')
        return [
            cell(String(LAUNCHER.damage), 'splash'),
            cell('1', 'rocket'),
            cell(`${LAUNCHER.reloadMs / 1000}`, 's reload'),
        ].join('')
    const spec = GUNS[gun]
    return [
        cell(spec.pellets > 1 ? `${spec.damage}×${spec.pellets}` : String(spec.damage), 'dmg'),
        cell(String(Math.round(60000 / spec.intervalMs)), 'rpm'),
        cell(String(spec.magazine), 'rounds'),
        cell((spec.reloadMs / 1000).toFixed(1), 's reload'),
    ].join('')
}

/** The menu's pages, in the sidebar's order. */
const PAGES = [
    { id: 'loadout', label: 'Loadout' },
    { id: 'match', label: 'Match' },
    { id: 'settings', label: 'Settings' },
    { id: 'controls', label: 'Controls' },
] as const
type PageId = (typeof PAGES)[number]['id']

const SLIDER_KEYS = ['sensitivity', 'aimSensitivity', 'fov', 'volume', 'resolution'] as const
type SliderKey = (typeof SLIDER_KEYS)[number]
type ToggleKey = 'invertY' | 'graphics' | 'antialias' | 'perfOverlay' | 'assetView'

const PHASE_NAMES: Record<Phase, string> = {
    warmup: 'Warmup',
    loading: 'Loading the map',
    countdown: 'Starting',
    playing: 'Match on',
    intermission: 'Scoreboard',
}

/** The menu's icons: one stroke, drawn on a 24 grid. */
const icon = (paths: string) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const ICONS = {
    play: icon('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    loadout: icon('<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>'),
    match: icon('<path d="M5 21V4M5 4h11l-2.5 4L16 12H5"/>'),
    settings: icon(
        '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'
    ),
    controls: icon(
        '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8"/>'
    ),
    leave: icon('<path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10"/>'),
    check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
}

/** The keys, grouped: the Controls page (built once). */
function controlsPage(): string {
    const keys = (...names: string[]) =>
        names.map(n => (n === '+' || n === '/' ? `<em>${n}</em>` : `<kbd>${n}</kbd>`)).join('')
    const groups: ReadonlyArray<[string, ReadonlyArray<[string, string]>]> = [
        [
            'Move',
            [
                ['Walk', keys('W', 'A', 'S', 'D')],
                ['Jump', keys('Space')],
                ['Jetpack: hold Space, or press it in the air', keys('Space')],
                ['Dodge', keys('Shift', '+', 'direction')],
                ['Lie prone (hold)', keys('C')],
            ],
        ],
        [
            'Fight',
            [
                ['Fire', keys('Click')],
                ['Aim', keys('Right-click')],
                ['Reload', keys('R')],
                ['Primary · secondary · stapler', keys('1', '2', '3')],
                ['Next weapon · the last', keys('Wheel', '/', 'Q')],
                ['First / third person', keys('V')],
            ],
        ],
        [
            'Build',
            [
                ['Build mode', keys('B')],
                ['Put up a wall', keys('Click')],
                ['Turn it a quarter', keys('R')],
                ['Lay it flat / stand it up', keys('Wheel')],
                ['Make it a door · a window', keys('F', '/', 'G')],
                ['Take one of yours back', keys('E')],
                ['Open or shut a door (any time)', keys('F')],
            ],
        ],
        [
            'Game',
            [
                ['Scores', keys('Tab')],
                ['This menu', keys('Esc')],
                ['Set up the next match (the host)', keys('N')],
            ],
        ],
    ]
    return `<header class="page-head"><h1>Controls</h1><p>Every key in the game.</p></header>
        ${groups
            .map(
                ([title, rows]) =>
                    `<div class="group"><h2>${title}</h2><dl class="keys">${rows.map(([what, how]) => `<div><dt>${what}</dt><dd>${how}</dd></div>`).join('')}</dl></div>`
            )
            .join('')}`
}

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
