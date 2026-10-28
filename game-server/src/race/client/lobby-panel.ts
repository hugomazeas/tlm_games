import { MAX_DENSITY, SNACK_ICONS, SNACK_KINDS, SNACKS, type SnackKind } from '../drive/snacks.ts'
import { formatTime } from '../drive/trial.ts'
import { describeSky, type TimeOfDay, TIMES_OF_DAY } from '../drive/weather.ts'
import type { LobbyPhase, LobbyView } from '../protocol.ts'
import type { ReceiptLine } from './snacks.ts'

/**
 * The lobby, in a panel over the game: the track, who's in, what's going on,
 * the host's Start button and race settings (time of day, snacks), the last
 * race's results and its dépanneur receipt, and the track's records (each
 * player's best time, and the fastest lap) behind a toggle.
 */

const TIME_LABELS: Record<TimeOfDay, string> = { morning: 'Morning', noon: 'Noon', sunset: 'Sunset', night: 'Night' }

/** The snacks' names, short enough for two to a row in the lobby panel. */
const SHORT_NAMES: Record<SnackKind, string> = {
    coke: 'Coke',
    bubly: 'Bubly',
    chips: 'Chips',
    montellier: 'Montellier',
    fuze: 'Fuze',
    chocolate: 'Chocolat',
    kirkland: 'Kirkland',
    gokrisp: 'Go Krisp',
    trailmix: 'TrailMix',
    popcorn: 'Popcorn',
    drumsticks: 'Drumsticks',
    chipwich: 'Chipwich',
}

/** "3 / 10", "off", "10 / 10 🔥". */
function densityLabel(density: number): string {
    if (density === 0) return 'off'
    return `${density} / ${MAX_DENSITY}${density === MAX_DENSITY ? ' 🔥' : ''}`
}

function densityNote(density: number): string {
    if (density === 0) return 'Clean race: times count for the records.'
    const metres = Math.round(320 / density)
    return `About one every ${metres} m. Just for fun: times don't go in the records.`
}

/** A track's records, as the Hub's /games/racing/tracks/{track}/records gives them. */
export interface TrackRecords {
    times: Array<{ player_id: number; name: string; time_ms: number }>
    lap: { player_id: number; name: string; time_ms: number } | null
}

const PHASES: Record<LobbyPhase, string> = {
    waiting: 'Getting ready',
    countdown: 'Starting…',
    racing: 'Racing',
    finished: 'Race over',
}

export interface LobbyPanel {
    show(lobby: LobbyView, you: string): void
    setRecords(records: TrackRecords | null): void
    /** The last race's snacks: who ate what, and the bill (a joke: nothing is charged). */
    setReceipt(lines: readonly ReceiptLine[]): void
    /** Replaces everything with a message: the lobby is full, the connection dropped… */
    fail(text: string): void
}

export function createLobbyPanel(
    element: HTMLElement,
    laps: number,
    onStart: () => void,
    onClose: () => void,
    onTime: (time: TimeOfDay | null) => void,
    onDensity: (density: number) => void,
    onKinds: (kinds: SnackKind[]) => void
): LobbyPanel {
    let receipt: readonly ReceiptLine[] = []
    let lobby: LobbyView | null = null
    let you = ''
    let records: TrackRecords | null = null
    let showRecords = false
    let failed = false

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') =>
        Object.assign(document.createElement(tag), { className, textContent: text })

    /** The host's pick of time of day: random each race, or one for every race. */
    const timePicker = (time: TimeOfDay | null) => {
        const label = el('label', 'time', 'Time ')
        const select = el('select')
        for (const value of ['random', ...TIMES_OF_DAY]) {
            const option = el('option', '', TIME_LABELS[value as TimeOfDay] ?? 'Random')
            option.value = value
            option.selected = value === (time ?? 'random')
            select.append(option)
        }
        select.addEventListener('change', () => {
            // Off the menu straight away, or the arrow keys would keep changing it instead of steering.
            select.blur()
            onTime(select.value === 'random' ? null : (select.value as TimeOfDay))
        })
        label.append(select)

        return label
    }

    /** The host's snacks slider: 0 a clean race (it counts for the records), up to 10, total mayhem. */
    const densitySlider = (density: number) => {
        const label = el('label', 'time', '🍫 Snacks ')
        const value = el('b', 'density', densityLabel(density))
        const slider = el('input')
        slider.type = 'range'
        slider.min = '0'
        slider.max = String(MAX_DENSITY)
        slider.step = '1'
        slider.value = String(density)
        // Shows the number as you drag; tells the lobby once you let go.
        slider.addEventListener('input', () => {
            value.textContent = densityLabel(Number(slider.value))
        })
        slider.addEventListener('change', () => {
            slider.blur()
            onDensity(Number(slider.value))
        })
        label.append(slider, value)
        const wrap = el('div')
        wrap.append(label, el('div', 'note', densityNote(density)))
        return wrap
    }

    /** The host's pick of the dépanneur's snacks: a checkbox each, with All and None. */
    const snackPicker = (kinds: readonly SnackKind[]) => {
        const box = el('div', 'kinds')
        const head = el('div', 'kinds-head', 'On the track')
        const all = button('All', () => onKinds([...SNACK_KINDS]), 'mini')
        const none = button('None', () => onKinds([]), 'mini')
        head.append(all, none)
        box.append(head)
        const grid = el('div', 'kinds-grid')
        for (const kind of SNACK_KINDS) {
            const label = el('label', 'kind')
            label.title = `${SNACKS[kind].name}: ${SNACKS[kind].effect}`
            const tick = el('input')
            tick.type = 'checkbox'
            tick.checked = kinds.includes(kind)
            tick.addEventListener('change', () => {
                tick.blur()
                onKinds(tick.checked ? [...kinds, kind] : kinds.filter(k => k !== kind))
            })
            label.append(tick, el('span', '', `${SNACK_ICONS[kind]} ${SHORT_NAMES[kind]}`))
            grid.append(label)
        }
        box.append(grid)
        if (kinds.length === 0) box.append(el('div', 'note', 'None ticked: a clean race.'))
        return box
    }

    /** Who ate what from the dépanneur this race, at real prices. */
    const receiptTable = () => {
        const box = el('div', 'receipt')
        box.append(el('div', 'receipt-title', '🧾 Dépanneur bill (not really)'))
        for (const line of receipt) {
            const row = el('div', 'receipt-row')
            const counts = new Map<string, number>()
            for (const kind of line.items) counts.set(SNACK_ICONS[kind], (counts.get(SNACK_ICONS[kind]) ?? 0) + 1)
            row.append(
                el('span', 'name', line.name),
                el('span', 'items', [...counts].map(([icon, n]) => (n > 1 ? `${icon}×${n}` : icon)).join(' ')),
                el('span', 'total', `${(line.total / 100).toFixed(2).replace('.', ',')} $`)
            )
            box.append(row)
        }
        return box
    }

    const button = (text: string, onClick: () => void, className = '') => {
        const b = el('button', className, text)
        b.addEventListener('click', () => {
            // Off the button straight away: Space drifts, it mustn't press it again.
            b.blur()
            onClick()
        })
        return b
    }

    const render = () => {
        if (failed || !lobby) return
        const host = lobby.members.find(m => m.id === lobby!.hostId)
        const live = lobby.phase === 'countdown' || lobby.phase === 'racing'
        const me = lobby.members.find(m => m.id === you)
        const children: HTMLElement[] = [
            el('div', 'title', `${lobby.trackName} · ${laps} ${laps === 1 ? 'lap' : 'laps'}`),
            el('div', `phase phase-${lobby.phase}`, PHASES[lobby.phase]),
            el('div', 'sky', `${live ? '' : 'Next race: '}${describeSky(lobby.sky)}`),
        ]

        if (lobby.phase === 'finished' && lobby.results) {
            const table = el('div', 'results')
            for (const row of lobby.results) {
                const line = el('div', row.id === you ? 'you' : '')
                line.append(
                    el('span', 'pos', `${row.position}.`),
                    el('span', 'name', row.name),
                    el('span', 'time', row.time === null ? 'DNF' : formatTime(row.time))
                )
                table.append(line)
            }
            children.push(table)
            if (receipt.length > 0) children.push(receiptTable())
        }

        if (live && me && !me.racing) children.push(el('div', 'note', 'Watching this race; you race the next one.'))

        const members = el('ul', 'members')
        for (const member of lobby.members) {
            const item = el('li', member.id === you ? 'you' : '')
            const dot = el('span', 'dot')
            dot.style.background = member.body
            item.append(dot, el('span', '', member.name))
            if (member.id === lobby.hostId) item.append(el('span', 'tag', 'host'))
            if (live && !member.racing) item.append(el('span', 'tag', 'watching'))
            members.append(item)
        }
        children.push(members)

        if (!live && lobby.hostId === you) {
            children.push(timePicker(lobby.time), densitySlider(lobby.density))
            if (lobby.density > 0) children.push(snackPicker(lobby.kinds))
        } else if (!live) {
            children.push(el('div', 'sky', `🍫 Snacks: ${densityLabel(lobby.density)}. ${densityNote(lobby.density)}`))
            if (lobby.density > 0 && lobby.kinds.length < SNACK_KINDS.length) {
                children.push(
                    el('div', 'sky', `On the track: ${lobby.kinds.map(kind => SNACK_ICONS[kind]).join(' ') || 'none'}`)
                )
            }
        }

        if (!live) {
            if (lobby.hostId === you) {
                children.push(button(lobby.phase === 'finished' ? 'Race again' : 'Start race', onStart, 'primary'))
            } else {
                children.push(el('div', 'note', `Waiting for ${host?.name ?? 'the host'} to start.`))
            }
        }

        children.push(
            button(showRecords ? '🏆 Records ▴' : '🏆 Records ▾', () => {
                showRecords = !showRecords
                render()
            })
        )
        if (showRecords) children.push(recordsTable())

        if (lobby.hostId === you) {
            children.push(
                button(
                    'Close lobby',
                    () => {
                        if (confirm('Close this lobby for everyone in it?')) onClose()
                    },
                    'danger'
                )
            )
        }

        element.replaceChildren(...children)
        element.hidden = false
    }

    const recordsTable = () => {
        const box = el('div', 'records')
        if (!records) {
            box.append(el('div', 'note', 'Loading…'))
            return box
        }
        if (records.times.length === 0) box.append(el('div', 'note', 'No finished race yet. Be the first!'))
        records.times.forEach((row, i) => {
            const line = el('div')
            line.append(
                el('span', 'pos', `${i + 1}.`),
                el('span', 'name', row.name),
                el('span', 'time', formatTime(row.time_ms / 1000))
            )
            box.append(line)
        })
        if (records.lap) {
            box.append(el('div', 'lap', `Fastest lap: ${records.lap.name}, ${formatTime(records.lap.time_ms / 1000)}`))
        }
        return box
    }

    return {
        show(next, me) {
            lobby = next
            you = me
            render()
        },

        setRecords(next) {
            records = next
            render()
        },

        setReceipt(lines) {
            receipt = lines
            render()
        },

        fail(text) {
            failed = true
            element.replaceChildren(el('div', 'title', text))
            element.hidden = false
        },
    }
}
