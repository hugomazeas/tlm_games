import type { Quality } from './atmosphere.ts'

/**
 * The welcome screen over a race, for colleagues opening a shared link: pick
 * yourself from the Hub's players (or add yourself, or race as a guest), paint
 * your kart while the camera circles it on the start line, and read the
 * controls, the rules and the graphics option before joining the lobby.
 *
 * Shown on a browser's first race; after that it remembers who you are, and
 * the "?" button (help only) and "Driver & kart" (everything) open it again.
 */

/** A Hub player and their kart, as the play page lists them. */
export interface DriverOption {
    id: number
    name: string
    body: string
    accent: string
}

/** Who you race as: a Hub player, or a guest (id null) in the default kart. */
export interface DriverChoice {
    playerId: number | null
    name: string
    body: string
    accent: string
}

export interface WelcomeOptions {
    trackName: string
    laps: number
    drivers: DriverOption[]
    /** POST { name } → a new player and their look. */
    newDriverUrl: string
    /** PUT {garageUrl}/{id} { body, accent } saves a kart. */
    garageUrl: string
    csrf: string
    guest: { body: string; accent: string }
    quality(): Quality
    setQuality(quality: Quality): void
    /** Live, as you pick colours or a driver. */
    onPaint(body: string, accent: string): void
    /** Ready: saved, remembered, off you go. */
    onReady(choice: DriverChoice): void
    /** The help-only view was closed. */
    onClose(): void
}

export interface Welcome {
    /** `full`: driver, kart and the guide. `help`: only the guide (controls, rules, options). */
    open(mode: 'full' | 'help', current: DriverChoice | null): void
    readonly isOpen: boolean
}

/** What this browser remembers: the Hub player (empty for a guest), and that it's been welcomed. */
export const REMEMBER = { player: 'racing_player', welcomed: 'racing_welcomed' }

/** Kart colours to start from: body, accent. */
const PRESETS: Array<[string, string]> = [
    ['#d23c3c', '#2b5fa8'],
    ['#f59e0b', '#111827'],
    ['#22c55e', '#f8fafc'],
    ['#3b82f6', '#facc15'],
    ['#a855f7', '#22d3ee'],
    ['#ec4899', '#1e293b'],
    ['#0f172a', '#f97316'],
    ['#f8fafc', '#dc2626'],
]

const CSS = `
    #race-welcome { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); z-index: 60; display: flex; flex-direction: column; gap: 14px; padding: 20px 20px 16px; overflow-y: auto; background: linear-gradient(90deg, rgb(15 23 42 / 0.72), rgb(15 23 42 / 0.92) 30%); color: #f8fafc; font: 14px system-ui, sans-serif; backdrop-filter: blur(4px); }
    #race-welcome h1 { margin: 0; font-size: 24px; font-weight: 800; }
    #race-welcome h2 { margin: 0 0 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
    #race-welcome .sub { color: #cbd5e1; margin-top: 2px; }
    #race-welcome input[type=text] { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid rgb(255 255 255 / 0.15); background: rgb(255 255 255 / 0.08); color: #f8fafc; font: inherit; }
    #race-welcome .drivers { display: flex; flex-wrap: wrap; gap: 6px; max-height: 168px; overflow-y: auto; margin-top: 8px; }
    #race-welcome .driver { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; border: 1px solid rgb(255 255 255 / 0.15); background: rgb(255 255 255 / 0.06); color: inherit; font: inherit; cursor: pointer; }
    #race-welcome .driver.picked { background: #ea580c; border-color: #fb923c; font-weight: 700; }
    #race-welcome .dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px #fff; }
    #race-welcome .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
    #race-welcome button.small, #race-welcome .link { padding: 7px 12px; border-radius: 8px; border: 0; background: rgb(255 255 255 / 0.14); color: #f8fafc; font: inherit; cursor: pointer; white-space: nowrap; }
    #race-welcome .link { background: none; padding: 0; color: #93c5fd; text-decoration: underline; }
    #race-welcome .error { color: #fca5a5; font-size: 13px; margin-top: 6px; }
    #race-welcome .colours { display: flex; gap: 14px; align-items: center; }
    #race-welcome .colours label { display: flex; align-items: center; gap: 6px; color: #cbd5e1; }
    #race-welcome input[type=color] { width: 40px; height: 30px; padding: 0; border: 0; border-radius: 6px; background: none; cursor: pointer; }
    #race-welcome .presets { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    #race-welcome .preset { width: 30px; height: 30px; border-radius: 8px; border: 2px solid rgb(255 255 255 / 0.3); cursor: pointer; }
    #race-welcome .note { color: #94a3b8; font-size: 12px; margin-top: 6px; }
    #race-welcome .tabs { display: flex; gap: 4px; }
    #race-welcome .tab { flex: 1; padding: 7px; border-radius: 8px 8px 0 0; border: 0; background: rgb(255 255 255 / 0.06); color: #cbd5e1; font: inherit; cursor: pointer; }
    #race-welcome .tab.on { background: rgb(255 255 255 / 0.16); color: #f8fafc; font-weight: 700; }
    #race-welcome .guide { padding: 12px; border-radius: 0 0 8px 8px; background: rgb(255 255 255 / 0.08); line-height: 1.5; }
    #race-welcome .guide ul { margin: 0; padding-left: 18px; }
    #race-welcome kbd { display: inline-block; min-width: 16px; padding: 1px 6px; border-radius: 4px; background: #f8fafc; color: #0f172a; font: 700 12px ui-monospace, monospace; text-align: center; box-shadow: 0 2px 0 #94a3b8; }
    #race-welcome .keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; }
    #race-welcome .go { position: sticky; bottom: 0; flex: none; margin-top: auto; box-shadow: 0 -10px 18px rgb(15 23 42 / 0.9); padding: 12px; border-radius: 10px; border: 0; background: #ea580c; color: #fff; font: 800 17px system-ui, sans-serif; cursor: pointer; }
    #race-welcome .go:disabled { background: #475569; cursor: not-allowed; }
    #race-welcome .quality { display: flex; gap: 6px; }
    #race-welcome .quality button { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgb(255 255 255 / 0.15); background: rgb(255 255 255 / 0.06); color: inherit; font: inherit; cursor: pointer; }
    #race-welcome .quality button.on { background: #2563eb; border-color: #60a5fa; font-weight: 700; }
`

const CONTROLS = `
    <div class="keys">
        <span><kbd>W</kbd> <kbd>↑</kbd></span><span>Gas</span>
        <span><kbd>S</kbd> <kbd>↓</kbd></span><span>Brake, then reverse</span>
        <span><kbd>A</kbd> <kbd>D</kbd></span><span>Steer</span>
        <span><kbd>Space</kbd> <kbd>Shift</kbd></span><span>Drift: hold it while turning, let go for a boost. Sparks go white, then <b style="color:#4fa8ff">blue</b> (mini-turbo), then <b style="color:#ff8a1f">orange</b> (super)</span>
        <span><kbd>E</kbd></span><span>Nitro: +20 km/h on the spot. It charges over 15 seconds (the blue ring round the speedometer) and says <b style="color:#22d3ee">NITRO · E</b> when it's ready</span>
        <span><kbd>R</kbd></span><span>Stuck? Back to your last checkpoint (the nitro starts charging again)</span>
    </div>
    <p class="note">Yellow pads on long straights boost you too.</p>
`

const RULES = `
    <ul>
        <li>Up to 8 karts. The host starts the race from the lobby panel (top left); if you join mid-race you watch, and race the next one.</li>
        <li>Drive through every checkpoint in order, then the start line, for each lap. The yellow arrow at the top points to the next one; the minimap shows the route.</li>
        <li>Drive anywhere: grass slows you down, water puts you back on a road, walls bounce you off. Karts go through each other.</li>
        <li>Every race has its own time of day and weather. Rain and snow make the road slippery: brake earlier, drifts slide wider.</li>
        <li>Once the winner finishes, the others have 30 seconds.</li>
        <li>Your best time and fastest lap go in the track's 🏆 Records, if you race under your name (guests aren't recorded).</li>
    </ul>
`

export function createWelcome(parent: HTMLElement, options: WelcomeOptions): Welcome {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    const root = document.createElement('div')
    root.id = 'race-welcome'
    root.hidden = true
    parent.appendChild(root)

    const drivers = [...options.drivers]
    let mode: 'full' | 'help' = 'full'
    let picked: DriverOption | 'guest' | null = null
    let colours = { ...options.guest }
    let tab: 'controls' | 'rules' | 'options' = 'controls'
    let filter = ''
    let error = ''
    let busy = false
    let open = false

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') =>
        Object.assign(document.createElement(tag), { className, textContent: text })
    const button = (text: string, className: string, onClick: () => void) => {
        const b = el('button', className, text)
        b.type = 'button'
        b.addEventListener('click', () => {
            b.blur()
            onClick()
        })
        return b
    }

    const pick = (choice: DriverOption | 'guest') => {
        picked = choice
        colours = choice === 'guest' ? { ...options.guest } : { body: choice.body, accent: choice.accent }
        error = ''
        options.onPaint(colours.body, colours.accent)
        render()
    }

    const addYourself = async (name: string) => {
        if (!name.trim() || busy) return
        busy = true
        error = ''
        try {
            const response = await fetch(options.newDriverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': options.csrf,
                },
                body: JSON.stringify({ name: name.trim() }),
            })
            const data = (await response.json()) as DriverOption & { errors?: Record<string, string[]> }
            if (!response.ok) {
                error = data.errors?.name?.[0] ?? 'Could not add you. Try again.'
            } else {
                drivers.push(data)
                drivers.sort((a, b) => a.name.localeCompare(b.name))
                filter = ''
                pick(data)
            }
        } catch {
            error = 'Could not reach the Hub. Try again.'
        }
        busy = false
        render()
    }

    const ready = async () => {
        if (!picked || busy) return
        busy = true
        if (picked !== 'guest' && (colours.body !== picked.body || colours.accent !== picked.accent)) {
            try {
                const response = await fetch(`${options.garageUrl}/${picked.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': options.csrf,
                    },
                    body: JSON.stringify(colours),
                })
                if (!response.ok) throw new Error(String(response.status))
                picked.body = colours.body
                picked.accent = colours.accent
            } catch {
                busy = false
                error = 'Your colours could not be saved. Try again.'
                return render()
            }
        }
        busy = false
        localStorage.setItem(REMEMBER.player, picked === 'guest' ? '' : String(picked.id))
        localStorage.setItem(REMEMBER.welcomed, '1')
        close()
        options.onReady(
            picked === 'guest'
                ? { playerId: null, name: 'Guest', ...options.guest }
                : { playerId: picked.id, name: picked.name, ...colours }
        )
    }

    const close = () => {
        open = false
        root.hidden = true
    }

    const driverSection = () => {
        const section = el('section')
        section.append(el('h2', '', "Who's driving?"))
        const search = el('input')
        search.type = 'text'
        search.placeholder = drivers.length ? 'Find your name, or type it to add yourself' : 'Type your name'
        search.value = filter
        search.addEventListener('input', () => {
            filter = search.value
            renderList()
        })
        search.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                const exact = drivers.find(d => d.name.toLowerCase() === filter.trim().toLowerCase())
                if (exact) pick(exact)
                else void addYourself(filter)
            }
        })
        section.append(search)
        const list = el('div', 'drivers')
        const extra = el('div')
        section.append(list, extra)

        const renderList = () => {
            const needle = filter.trim().toLowerCase()
            const shown = drivers.filter(d => d.name.toLowerCase().includes(needle))
            list.replaceChildren(
                ...shown.map(d => {
                    const b = button('', `driver${picked !== 'guest' && picked?.id === d.id ? ' picked' : ''}`, () =>
                        pick(d)
                    )
                    const dot = el('span', 'dot')
                    dot.style.background = d.body
                    b.append(dot, d.name)
                    return b
                })
            )
            const row = el('div', 'row')
            const exact = drivers.some(d => d.name.toLowerCase() === needle)
            if (needle && !exact) {
                row.append(
                    button(
                        busy ? 'Adding…' : `I'm new: add "${filter.trim()}"`,
                        'small',
                        () => void addYourself(filter)
                    )
                )
            }
            row.append(button('Race as a guest', `link${picked === 'guest' ? ' picked' : ''}`, () => pick('guest')))
            extra.replaceChildren(row, ...(error ? [el('div', 'error', error)] : []))
        }
        renderList()
        // Straight into the search box on a first visit.
        queueMicrotask(() => {
            if (!picked) search.focus()
        })

        return section
    }

    const kartSection = () => {
        const section = el('section')
        section.append(el('h2', '', 'Your kart'))
        const guest = picked === 'guest'
        const colourInput = (label: string, key: 'body' | 'accent') => {
            const wrap = el('label', '', label)
            const input = el('input')
            input.type = 'color'
            input.value = colours[key]
            input.disabled = guest || !picked
            input.addEventListener('input', () => {
                colours[key] = input.value
                options.onPaint(colours.body, colours.accent)
            })
            wrap.append(input)
            return wrap
        }
        const row = el('div', 'colours')
        row.append(colourInput('Body', 'body'), colourInput('Accent', 'accent'))
        section.append(row)
        if (!guest && picked) {
            const presets = el('div', 'presets')
            for (const [body, accent] of PRESETS) {
                const swatch = button('', 'preset', () => {
                    colours = { body, accent }
                    options.onPaint(body, accent)
                    render()
                })
                swatch.style.background = `linear-gradient(135deg, ${body} 55%, ${accent} 55%)`
                presets.append(swatch)
            }
            section.append(presets)
        }
        section.append(
            el(
                'div',
                'note',
                !picked
                    ? 'Pick who you are first.'
                    : guest
                      ? 'Guests drive the default kart. Add yourself to paint it.'
                      : 'Saved on your player: it looks like this on every track.'
            )
        )
        return section
    }

    const guideSection = () => {
        const section = el('section')
        const tabs = el('div', 'tabs')
        for (const [key, label] of [
            ['controls', 'Controls'],
            ['rules', 'Rules'],
            ['options', 'Options'],
        ] as const) {
            tabs.append(
                button(label, `tab${tab === key ? ' on' : ''}`, () => {
                    tab = key
                    render()
                })
            )
        }
        const guide = el('div', 'guide')
        if (tab === 'controls') guide.innerHTML = CONTROLS
        else if (tab === 'rules') guide.innerHTML = RULES
        else {
            guide.append(el('h2', '', 'Graphics'))
            const choice = el('div', 'quality')
            for (const [quality, label] of [
                ['high', 'High: shadows, glow'],
                ['low', 'Low: for slower laptops'],
            ] as const) {
                choice.append(
                    button(label, options.quality() === quality ? 'on' : '', () => {
                        options.setQuality(quality)
                        render()
                    })
                )
            }
            guide.append(
                choice,
                el(
                    'p',
                    'note',
                    'The counter at the top right shows frames per second: under 30 (red), try Low. Also there: the Graphics button, and ? to open this guide again.'
                )
            )
        }
        section.append(tabs, guide)
        return section
    }

    const render = () => {
        if (!open) return
        const header = el('header')
        header.append(
            el('h1', '', mode === 'full' ? 'Welcome to the race' : 'How to play'),
            el(
                'div',
                'sub',
                `${options.trackName} · ${options.laps} ${options.laps === 1 ? 'lap' : 'laps'}, through the streets of Québec`
            )
        )
        const children: HTMLElement[] = [header]
        if (mode === 'full') children.push(driverSection(), kartSection())
        children.push(guideSection())
        if (mode === 'full') {
            const go = button(
                busy ? 'Saving…' : picked ? "Let's race" : 'Pick your name to race',
                'go',
                () => void ready()
            )
            go.disabled = !picked || busy
            children.push(go)
        } else {
            children.push(
                button('Back to the race', 'go', () => {
                    close()
                    options.onClose()
                })
            )
        }
        root.replaceChildren(...children)
    }

    return {
        get isOpen() {
            return open
        },

        open(next, current) {
            mode = next
            open = true
            root.hidden = false
            if (next === 'full') {
                const known = current?.playerId != null ? drivers.find(d => d.id === current.playerId) : undefined
                picked = known ?? (current && current.playerId === null ? 'guest' : null)
                colours = known
                    ? { body: known.body, accent: known.accent }
                    : { body: current?.body ?? options.guest.body, accent: current?.accent ?? options.guest.accent }
                filter = ''
                error = ''
            }
            render()
        },
    }
}
