/**
 * Everything drawn over the 3D view (panels, banners, dials, the minimap),
 * created by the client itself so any page that loads the game (the
 * standalone viewer, the Hub's play page) only needs an empty body.
 */

const CSS = `
    .race-root { position: fixed; inset: 0; z-index: 40; overflow: hidden; background: #bfd9ee; font: 13px system-ui, sans-serif; }
    .race-root canvas.race-view { display: block; }
    .race-root .panel { position: fixed; left: 12px; padding: 6px 10px; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; pointer-events: none; }
    .race-root [hidden] { display: none !important; }
    #race-status { top: 12px; }
    #race-hud { top: 44px; font-variant-numeric: tabular-nums; }
    #race-help { bottom: 12px; max-width: calc(50% - 170px); box-sizing: border-box; }
    #race-credit { position: fixed; right: 8px; bottom: 6px; font-size: 11px; color: #334155; }
    #race-crosshair { position: fixed; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px #0f172a; pointer-events: none; }
    #race-identify { top: 76px; pointer-events: auto; display: grid; gap: 4px; max-width: 340px; }
    #race-identify button { justify-self: start; font: inherit; padding: 2px 8px; border-radius: 4px; border: 0; cursor: pointer; }
    #race-panel { top: 92px; left: auto; right: 12px; white-space: pre; text-align: right; font-size: 15px; font-variant-numeric: tabular-nums; }
    #race-back { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 12px; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; text-decoration: none; }
    #race-banner { position: fixed; top: 22%; left: 0; right: 0; text-align: center; font: 800 64px system-ui, sans-serif; color: #fff; text-shadow: 0 3px 12px rgb(15 23 42 / 0.8); pointer-events: none; }
    #race-corner { position: fixed; top: 12px; right: 12px; display: flex; gap: 6px; }
    #race-corner button { padding: 6px 10px; border: 0; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; font: inherit; cursor: pointer; }
    #race-corner button:hover { background: rgb(15 23 42 / 0.9); }
    #race-guide { font-weight: 800; min-width: 30px; }
    #race-stats { position: fixed; top: 46px; right: 12px; padding: 4px 8px; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; font: 12px ui-monospace, monospace; text-align: right; white-space: pre; pointer-events: none; }
    #race-minimap { position: fixed; right: 12px; bottom: 26px; width: 300px; height: 300px; pointer-events: none; }
    #race-wheel { position: fixed; left: 50%; bottom: 206px; width: 240px; height: 10px; margin-left: -120px; border-radius: 5px; background: linear-gradient(90deg, rgb(34 211 238 / 0.5), rgb(15 23 42 / 0.55) 40%, rgb(15 23 42 / 0.55) 60%, rgb(34 211 238 / 0.5)); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.25); pointer-events: none; }
    #race-wheel::after { content: ''; position: absolute; left: 50%; top: -3px; width: 2px; height: 16px; margin-left: -1px; background: rgb(255 255 255 / 0.4); }
    #race-wheel b { position: absolute; top: -4px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #f8fafc; box-shadow: 0 0 8px #22d3ee; }
    #race-speedometer { position: fixed; left: 50%; bottom: 0; width: 280px; height: 200px; margin-left: -140px; pointer-events: none; filter: drop-shadow(0 -2px 10px rgb(15 23 42 / 0.6)); }
    #race-standings { top: auto; bottom: 340px; left: auto; right: 12px; min-width: 120px; font-size: 14px; }
    #race-standings .position { font: 800 34px system-ui, sans-serif; }
    #race-standings .you { color: #ffd22e; font-weight: 700; }
    #race-lobby { top: 12px; pointer-events: auto; width: 290px; box-sizing: border-box; max-height: calc(100vh - 360px); overflow-y: auto; overflow-x: hidden; display: grid; gap: 6px; font-size: 14px; }
    #race-lobby .time { white-space: nowrap; gap: 6px; }
    #race-lobby .title { font-weight: 700; font-size: 15px; }
    #race-lobby .phase { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    #race-lobby .sky { font-size: 12px; color: #cbd5e1; }
    #race-lobby .receipt { display: grid; gap: 3px; padding: 8px; border-radius: 6px; background: #fefce8; color: #1c1917; font: 12px ui-monospace, monospace; }
    #race-lobby .receipt-title { font-weight: 800; border-bottom: 1px dashed #a8a29e; padding-bottom: 3px; }
    #race-lobby .receipt-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; }
    #race-lobby .receipt-row .total { font-weight: 800; }
    #race-lobby .time input[type=range] { flex: 1; min-width: 0; margin: 0 4px; accent-color: #ea580c; cursor: pointer; }
    #race-lobby .time .density { min-width: 52px; text-align: right; color: #f8fafc; }
    #race-lobby .kinds { display: grid; gap: 4px; padding: 6px; border-radius: 6px; background: rgb(255 255 255 / 0.06); }
    #race-lobby .kinds-head { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    #race-lobby .kinds-head button.mini { margin-left: auto; padding: 1px 8px; font-size: 11px; text-transform: none; letter-spacing: 0; }
    #race-lobby .kinds-head button.mini + button.mini { margin-left: 0; }
    #race-lobby .kinds-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
    #race-lobby .kind { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #e2e8f0; cursor: pointer; white-space: nowrap; }
    #race-lobby .kind input { margin: 0; cursor: pointer; }
    #race-lobby .time { display: flex; align-items: center; justify-content: space-between; color: #cbd5e1; }
    #race-lobby select { font: inherit; padding: 3px 6px; border-radius: 6px; border: 0; background: rgb(255 255 255 / 0.12); color: #f8fafc; cursor: pointer; }
    #race-lobby select option { color: #0f172a; }
    #race-lobby .phase-waiting { color: #6ee7b7; }
    #race-lobby .phase-countdown, #race-lobby .phase-racing { color: #fcd34d; }
    #race-lobby .note { color: #cbd5e1; font-size: 13px; }
    #race-lobby ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
    #race-lobby li { display: flex; align-items: center; gap: 6px; }
    #race-lobby .dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px #fff; flex: none; }
    #race-lobby .tag { font-size: 11px; color: #94a3b8; }
    #race-lobby .you { color: #ffd22e; font-weight: 700; }
    #race-lobby button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 0; cursor: pointer; background: rgb(255 255 255 / 0.12); color: #f8fafc; text-align: left; }
    #race-lobby button:hover { background: rgb(255 255 255 / 0.2); }
    #race-lobby button.primary { background: #ea580c; font-weight: 700; text-align: center; }
    #race-lobby button.primary:hover { background: #f97316; }
    #race-lobby button.danger { color: #fca5a5; }
    #race-lobby a { color: #fdba74; }
    #race-lobby .results, #race-lobby .records { display: grid; gap: 2px; font-variant-numeric: tabular-nums; }
    #race-lobby .results > div, #race-lobby .records > div:not(.note):not(.lap) { display: grid; grid-template-columns: 24px 1fr auto; gap: 6px; }
    #race-lobby .lap { margin-top: 4px; color: #fcd34d; font-size: 13px; }
    #race-arrow { position: fixed; top: 56px; left: 50%; width: 56px; height: 56px; margin-left: -28px; pointer-events: none; filter: drop-shadow(0 2px 4px rgb(15 23 42 / 0.7)); }
`

const HTML = `
    <div id="race-status" class="panel">Loading map…</div>
    <div id="race-hud" class="panel"></div>
    <div id="race-identify" class="panel" hidden></div>
    <div id="race-panel" class="panel"></div>
    <div id="race-lobby" class="panel" hidden></div>
    <a id="race-back" hidden>← Tracks</a>
    <div id="race-corner">
        <button id="race-kart" type="button" title="Change who's driving and your kart's colours" hidden>Driver &amp; kart</button>
        <button id="race-guide" type="button" title="Controls, rules and options" hidden>?</button>
        <button id="race-quality" type="button" title="Low turns off shadows and glow, for slower computers"></button>
    </div>
    <div id="race-stats"></div>
    <div id="race-banner"></div>
    <canvas id="race-minimap" width="300" height="300"></canvas>
    <canvas id="race-speedometer" width="280" height="200" hidden></canvas>
    <div id="race-wheel" hidden><b></b></div>
    <div id="race-standings" class="panel" hidden></div>
    <div id="race-arrow" hidden><svg viewBox="0 0 56 56" width="56" height="56"><path d="M28 4 L50 30 L36 30 L36 52 L20 52 L20 30 L6 30 Z" fill="#ffd22e" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/></svg></div>
    <div id="race-crosshair"></div>
    <div id="race-help" class="panel"></div>
    <div id="race-credit">© OpenStreetMap contributors · elevation © Natural Resources Canada</div>
`

export interface Overlay {
    root: HTMLElement
    status: HTMLElement
    hud: HTMLElement
    identify: HTMLElement
    panel: HTMLElement
    lobby: HTMLElement
    crosshair: HTMLElement
    back: HTMLAnchorElement
    quality: HTMLButtonElement
    /** Reopen the welcome screen: all of it, or only the guide. Racing only. */
    kart: HTMLButtonElement
    guide: HTMLButtonElement
    /** Frame rate and memory, under the Graphics button. */
    stats: HTMLElement
    banner: HTMLElement
    minimap: HTMLCanvasElement
    speedometer: HTMLCanvasElement
    /** Mouse steering's indicator: where the mouse has you steering. */
    wheel: HTMLElement
    standings: HTMLElement
    arrow: HTMLElement
    help: HTMLElement
}

/** Adds the overlay (and its styles) to the page, filling the window. */
export function createOverlay(parent: HTMLElement = document.body): Overlay {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    const root = document.createElement('div')
    root.className = 'race-root'
    root.innerHTML = HTML
    parent.appendChild(root)
    const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#race-${id}`)!

    return {
        root,
        status: find('status'),
        hud: find('hud'),
        identify: find('identify'),
        panel: find('panel'),
        lobby: find('lobby'),
        crosshair: find('crosshair'),
        back: find<HTMLAnchorElement>('back'),
        quality: find<HTMLButtonElement>('quality'),
        kart: find<HTMLButtonElement>('kart'),
        guide: find<HTMLButtonElement>('guide'),
        stats: find('stats'),
        banner: find('banner'),
        minimap: find<HTMLCanvasElement>('minimap'),
        speedometer: find<HTMLCanvasElement>('speedometer'),
        wheel: find('wheel'),
        standings: find('standings'),
        arrow: find('arrow'),
        help: find('help'),
    }
}
