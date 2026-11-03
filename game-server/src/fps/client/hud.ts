import type { MatchView, PlayerInfo, SelfState } from '../protocol.ts'
import { MAX_HEALTH, WEAPON } from '../sim/combat.ts'

/**
 * Everything drawn over the game, in plain DOM: crosshair and hit marker, health, ammo, fuel,
 * the match's timer, the kill feed, the scoreboard (Tab, and between matches), messages in the
 * middle (warmup, countdown, down, watching), and the click-to-play card while the mouse is free.
 */

const CSS = `
#fps-hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px/1.3 system-ui, sans-serif; color: #f4f6f8; z-index: 20; user-select: none; }
#fps-hud .panel { background: rgba(12,14,18,.62); border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(6px); }
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
#fps-hud .from { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: opacity .9s ease-in; }
#fps-hud .from::before { content: ''; position: absolute; left: -70px; top: -190px; width: 140px; height: 34px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: radial-gradient(ellipse at 50% 100%, rgba(255,40,40,.0) 40%, rgba(255,40,40,.85) 72%, rgba(255,40,40,0) 74%); }
#fps-hud .target { position: absolute; transform: translate(-50%,-100%); text-align: center; pointer-events: none; transition: opacity .15s; }
#fps-hud .target .name { font-size: 13px; padding: 2px 8px; border-radius: 6px; background: rgba(12,14,18,.7); white-space: nowrap; }
#fps-hud .target .bar { width: 70px; height: 5px; margin: 4px auto 0; border-radius: 3px; background: rgba(0,0,0,.55); overflow: hidden; }
#fps-hud .target .bar div { height: 100%; transition: width .15s; }
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
#fps-hud .middle { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); text-align: center; font-size: 22px; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
#fps-hud .middle small { display: block; font-size: 14px; opacity: .8; }
#fps-hud .board { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); min-width: 360px; }
#fps-hud .board table { width: 100%; border-collapse: collapse; }
#fps-hud .board td, #fps-hud .board th { padding: 4px 8px; text-align: left; }
#fps-hud .board th { font-size: 11px; opacity: .6; text-transform: uppercase; letter-spacing: .1em; }
#fps-hud .board td.n { text-align: right; font-variant-numeric: tabular-nums; }
#fps-hud .board tr.me td { color: #ffd166; }
#fps-hud .board tr.gone td { opacity: .45; }
#fps-hud .hurt { position: absolute; inset: 0; box-shadow: inset 0 0 120px rgba(220,30,30,.75); opacity: 0; transition: opacity .35s; }
#fps-hud .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); text-align: center; pointer-events: auto; max-width: 420px; padding: 22px 26px; }
#fps-hud .card h1 { font-size: 22px; margin: 0 0 4px; }
#fps-hud .card p { margin: 6px 0; opacity: .85; font-weight: 500; }
#fps-hud .card kbd { background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 6px; font: inherit; font-size: 12px; }
#fps-hud .card a { color: #ffd166; }
#fps-hud .hidden { display: none !important; }
`

export interface HudFrame {
    me: string | null
    self: SelfState | null
    /** Who downed you last. */
    killer: string | null
    tab: boolean
    roster: Map<string, PlayerInfo>
}

export class Hud {
    private readonly root: HTMLDivElement
    private readonly el: Record<string, HTMLElement> = {}
    private match: MatchView | null = null
    private matchAt = 0
    private lastHealth = MAX_HEALTH
    private boardForced = false

    constructor(private readonly backUrl: string) {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.append(style)
        this.root = document.createElement('div')
        this.root.id = 'fps-hud'
        this.root.innerHTML = `
            <div class="hurt" data-el="hurt"></div>
            <div class="cross" data-el="cross"></div><div class="hit" data-el="hit"></div>
            <div class="elim" data-el="elim"></div>
            <div class="target hidden" data-el="target"><div class="name"></div><div class="bar"><div></div></div></div>
            <div class="panel top" data-el="top"></div>
            <div class="feed" data-el="feed"></div>
            <div class="middle" data-el="middle"></div>
            <div class="panel health" data-el="health"></div>
            <div class="panel ammo" data-el="ammo"></div>
            <div class="fuel" data-el="fuelBar"><div data-el="fuel"></div></div>
            <div class="panel board hidden" data-el="board"></div>
            <div class="panel card" data-el="card"></div>`
        for (const node of this.root.querySelectorAll<HTMLElement>('[data-el]')) this.el[node.dataset.el!] = node
        document.body.append(this.root)
        this.card('connecting')
    }

    /** The middle card: while connecting, while the mouse is free, or when the game is closed to you. */
    card(state: 'connecting' | 'paused' | 'playing' | 'replaced' | 'unavailable' | 'unknown'): void {
        const card = this.el.card!
        card.classList.toggle('hidden', state === 'playing')
        const back = `<p><a href="${this.backUrl}">Back to the Hub</a></p>`
        card.innerHTML = {
            connecting: `<h1>Office FPS</h1><p>Connecting…</p>`,
            paused: `<h1>Office FPS</h1><p><b>Click to play</b></p>
                <p><kbd>WASD</kbd> move · <kbd>Shift</kbd> + direction dodge · <kbd>Space</kbd> jetpack<br>
                <kbd>Click</kbd> fire · <kbd>Right-click</kbd> aim · <kbd>R</kbd> reload · <kbd>V</kbd> 1st / 3rd person<br>
                <kbd>Tab</kbd> scores · <kbd>Esc</kbd> free the mouse</p>${back}`,
            playing: '',
            replaced: `<h1>Playing in another tab</h1><p>This one let go.</p>${back}`,
            unavailable: `<h1>The game server is unavailable</h1><p>Retrying…</p>${back}`,
            unknown: `<h1>Unknown player</h1><p>Pick yourself again from the Hub.</p>${back}`,
        }[state]
    }

    setMatch(match: MatchView, at: number): void {
        this.match = match
        this.matchAt = at
        this.boardForced = match.phase === 'intermission'
    }

    /** Your state from the latest snapshot (null: watching). */
    setSelf(self: SelfState | null): void {
        const hide = self === null
        for (const name of ['health', 'ammo', 'fuelBar', 'cross']) this.el[name]!.classList.toggle('hidden', hide)
        if (!self) return
        this.el.health!.innerHTML = `<small>Health</small>${self.alive ? self.health : 0}`
        this.el.ammo!.innerHTML = `<small>Blaster</small>${self.reloading ? '<span style="opacity:.6">reloading</span>' : `${self.ammo}<span style="opacity:.5;font-size:16px"> / ${WEAPON.magazine}</span>`}`
        this.el.fuel!.style.width = `${Math.round(self.body.fuel * 100)}%`
        if (self.alive && self.health < this.lastHealth) this.flashHurt()
        this.lastHealth = self.alive ? self.health : MAX_HEALTH
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
    target(who: { name: string; color: string; health: number } | null, x = 0, y = 0): void {
        const target = this.el.target!
        target.classList.toggle('hidden', who === null)
        if (!who) return
        target.style.left = `${x}px`
        target.style.top = `${y}px`
        const name = target.querySelector<HTMLElement>('.name')!
        if (name.textContent !== who.name) name.textContent = who.name
        name.style.boxShadow = `inset 0 -2px 0 ${who.color}`
        const bar = target.querySelector<HTMLElement>('.bar div')!
        const share = Math.max(0, Math.min(1, who.health / MAX_HEALTH))
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
        const leader = match.scores[0]
        this.el.top!.innerHTML = {
            warmup: `Warmup <small style="opacity:.7">· waiting for a second player</small>`,
            countdown: `Match in <b>${Math.ceil((left ?? 0) / 1000)}</b>`,
            playing: `<b>${clock(left ?? 0)}</b> <small style="opacity:.7">· first to ${match.fragLimit}${leader ? ` · ${escape(leader.name)} ${leader.kills}` : ''}</small>`,
            intermission: `Next match in <b>${Math.ceil((left ?? 0) / 1000)}</b>`,
        }[match.phase]

        let middle = ''
        if (opts.me && !opts.self) middle = `Watching<small>The game is full: you're in at the next free seat.</small>`
        else if (opts.self && !opts.self.alive) {
            const by = opts.killer ? `Fragged by ${escape(opts.killer)}` : 'Down'
            middle = `${by}<small>Back in ${Math.ceil((opts.self.respawnInMs ?? 0) / 1000)}</small>`
        } else if (match.phase === 'countdown') {
            middle = `${Math.ceil((left ?? 0) / 1000)}<small>Warmup kills don't count</small>`
        }
        this.el.middle!.innerHTML = middle

        const board = this.el.board!
        const show = opts.tab || this.boardForced
        board.classList.toggle('hidden', !show)
        if (show) board.innerHTML = this.board(match, opts.me, opts.roster)
    }

    private board(match: MatchView, me: string | null, roster: Map<string, PlayerInfo>): string {
        const winner = match.scores[0] ? `${escape(match.scores[0].name)} wins` : 'Match over'
        const title = match.phase === 'intermission' ? `<h2 style="margin:0 0 8px;font-size:18px">${winner}</h2>` : ''
        const dot = (color: string) => `<span style="color:${color}">●</span>`
        const row = (classes: string, place: string, name: string, kills: string, deaths: string) =>
            `<tr class="${classes}"><td>${place}</td><td>${name}</td><td class="n">${kills}</td><td class="n">${deaths}</td></tr>`
        // In a match, the scores (who left greyed); in warmup, who's here.
        const rows = match.scores.length
            ? match.scores.map((s, i) =>
                  row(
                      `${s.id === me ? 'me' : ''} ${s.id === null ? 'gone' : ''}`,
                      String(i + 1),
                      `${dot(s.color)} ${escape(s.name)}`,
                      String(s.kills),
                      String(s.deaths)
                  )
              )
            : [...roster.values()].map(p => {
                  const watching = p.watching ? ' <small style="opacity:.6">watching</small>' : ''
                  return row(p.id === me ? 'me' : '', '', `${dot(p.color)} ${escape(p.name)}${watching}`, '–', '–')
              })

        const head = '<tr><th></th><th>Player</th><th class="n">Kills</th><th class="n">Deaths</th></tr>'
        return `${title}<table>${head}${rows.join('')}</table>`
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
