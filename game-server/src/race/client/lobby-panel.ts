import { formatTime } from '../drive/trial.ts'
import { describeSky, type TimeOfDay, TIMES_OF_DAY } from '../drive/weather.ts'

const TIME_LABELS: Record<TimeOfDay, string> = { morning: 'Morning', noon: 'Noon', sunset: 'Sunset', night: 'Night' }
import type { LobbyPhase, LobbyView } from '../protocol.ts'

/**
 * The lobby, in a panel over the game: the track, who's in, what's going on,
 * the host's Start button, the last race's results, and the track's records
 * (each player's best time, and the fastest lap) behind a toggle.
 */

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
    /** Replaces everything with a message: the lobby is full, the connection dropped… */
    fail(text: string): void
}

export function createLobbyPanel(
    element: HTMLElement,
    laps: number,
    onStart: () => void,
    onClose: () => void,
    onTime: (time: TimeOfDay | null) => void
): LobbyPanel {
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

        if (!live && lobby.hostId === you) children.push(timePicker(lobby.time))

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

        fail(text) {
            failed = true
            element.replaceChildren(el('div', 'title', text))
            element.hidden = false
        },
    }
}
