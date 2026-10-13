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
    #race-help { bottom: 12px; }
    #race-credit { position: fixed; right: 8px; bottom: 6px; font-size: 11px; color: #334155; }
    #race-crosshair { position: fixed; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px #0f172a; pointer-events: none; }
    #race-identify { top: 76px; pointer-events: auto; display: grid; gap: 4px; max-width: 340px; }
    #race-identify button { justify-self: start; font: inherit; padding: 2px 8px; border-radius: 4px; border: 0; cursor: pointer; }
    #race-panel { top: 12px; left: auto; right: 12px; white-space: pre; text-align: right; font-size: 15px; font-variant-numeric: tabular-nums; }
    #race-back { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 12px; border-radius: 6px; background: rgb(15 23 42 / 0.7); color: #f8fafc; text-decoration: none; }
    #race-banner { position: fixed; top: 22%; left: 0; right: 0; text-align: center; font: 800 64px system-ui, sans-serif; color: #fff; text-shadow: 0 3px 12px rgb(15 23 42 / 0.8); pointer-events: none; }
    #race-minimap { position: fixed; right: 12px; bottom: 26px; width: 300px; height: 300px; pointer-events: none; }
    #race-speedometer { position: fixed; left: 50%; bottom: 8px; width: 220px; height: 140px; margin-left: -110px; pointer-events: none; filter: drop-shadow(0 2px 6px rgb(15 23 42 / 0.6)); }
    #race-standings { top: auto; bottom: 340px; left: auto; right: 12px; min-width: 120px; font-size: 14px; }
    #race-standings .position { font: 800 34px system-ui, sans-serif; }
    #race-standings .you { color: #ffd22e; font-weight: 700; }
    #race-lobby { top: 12px; pointer-events: auto; width: 250px; max-height: calc(100vh - 360px); overflow-y: auto; display: grid; gap: 6px; font-size: 14px; }
    #race-lobby .title { font-weight: 700; font-size: 15px; }
    #race-lobby .phase { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
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
    <div id="race-banner"></div>
    <canvas id="race-minimap" width="300" height="300"></canvas>
    <canvas id="race-speedometer" width="220" height="140" hidden></canvas>
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
    banner: HTMLElement
    minimap: HTMLCanvasElement
    speedometer: HTMLCanvasElement
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
        banner: find('banner'),
        minimap: find<HTMLCanvasElement>('minimap'),
        speedometer: find<HTMLCanvasElement>('speedometer'),
        standings: find('standings'),
        arrow: find('arrow'),
        help: find('help'),
    }
}
