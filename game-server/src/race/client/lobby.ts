import { forwardSpeed } from '../drive/kart.ts'
import type { Sky } from '../drive/weather.ts'
import type { SnackPlay } from './snacks.ts'
import type { ClientMessage, ErrorCode, LobbyView, ServerMessage } from '../protocol.ts'
import type { Driver } from './drive.ts'
import { createLobbyPanel, type TrackRecords } from './lobby-panel.ts'
import type { Others } from './others.ts'
import type { Race } from './race.ts'

/**
 * The tab's side of a racing lobby: joins it over the game server's socket,
 * reports where the kart is (and every step while racing), and turns what
 * the lobby says into the race: the countdown, the end, everyone else's
 * karts and the standings. Late joiners watch the race in progress, the
 * camera following the leader, and race the next one.
 */

/** Poses go out this often… */
const SEND_MS = 50
/** …with at most this many race steps each (the server takes up to 30). */
const SAMPLES_PER_MESSAGE = 20
/** A dropped socket is reopened this many times, waiting this long more each time. */
const RECONNECT_TRIES = 5
const RECONNECT_MS = 1000
/** Results reach the Hub a moment after the race ends; records are fetched again after this. */
const RECORDS_DELAY_MS = 1500

const ERRORS: Record<ErrorCode, string> = {
    BAD_MESSAGE: 'Something went wrong talking to the lobby.',
    HELLO_FIRST: 'Something went wrong talking to the lobby.',
    NO_TRACK: 'This track no longer exists.',
    UNKNOWN_PLAYER: 'That player no longer exists. Pick yourself again on the track list.',
    LOBBY_FULL: 'This lobby is full.',
    NOT_HOST: 'Only the host can start the race.',
    TOO_LATE: 'The race has already started.',
    REPLACED: 'You joined this lobby from another tab.',
    UNAVAILABLE: 'Racing is unavailable right now. Try again in a moment.',
}

export interface LobbyOptions {
    trackId: number
    laps: number
    lobby: string | null
    playerId: number | null
    recordsUrl: string
    driver: Driver
    race: Race
    others: Others
    panel: HTMLElement
    /** Switches between driving your kart and watching the race. */
    setWatching(watching: boolean): void
    /** The lobby's sky for the next race, or the one under way: on arriving and whenever it changes. */
    setSky(sky: Sky): void
    /** The race's snacks on this tab: told what the lobby says about them. */
    snacks: SnackPlay
}

export interface Lobby {
    /** Whose kart a watcher's camera follows: the leader. */
    readonly leader: string | null
    /** Your id in the lobby ('' until welcomed). */
    readonly you: string
    nameOf(id: string): string
    /** You drove through snack `id`. */
    eat(id: number): void
}

export function joinLobby(options: LobbyOptions): Lobby {
    const { driver, race, others } = options
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    let socket: WebSocket
    let attempts = 0
    const send = (message: ClientMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }
    const panel = createLobbyPanel(
        options.panel,
        options.laps,
        () => send({ type: 'start' }),
        () => send({ type: 'close' }),
        time => send({ type: 'setTime', time }),
        density => send({ type: 'setDensity', density })
    )

    let you = ''
    let current: LobbyView | null = null
    let watching = false
    let leader: string | null = null
    let failed = false
    let samples: number[] = []

    race.onSample = (x, z, t) => {
        samples.push(round(x, 2), round(z, 2), round(t, 4))
    }

    const loadRecords = async () => {
        try {
            const response = await fetch(options.recordsUrl, { headers: { Accept: 'application/json' } })
            if (!response.ok) return
            const records = (await response.json()) as TrackRecords
            panel.setRecords(records)
            const best = records.times[0]
            race.setRecord(best ? { name: best.name, time: best.time_ms / 1000 } : null)
        } catch {
            // The records are a nice-to-have; the race goes on without them.
        }
    }

    const fail = (text: string) => {
        failed = true
        panel.fail(text)
    }

    const onLobby = (lobby: LobbyView) => {
        const before = current
        current = lobby
        const me = lobby.members.find(m => m.id === you)
        const slot = lobby.members.findIndex(m => m.id === you)
        const live = lobby.phase === 'countdown' || lobby.phase === 'racing'
        others.setDrivers(lobby.members.filter(m => m.id !== you))
        panel.show(lobby, you)
        if (!before || before.sky.time !== lobby.sky.time || before.sky.weather !== lobby.sky.weather) {
            options.setSky(lobby.sky)
        }

        if (live && !me?.racing) {
            if (!watching) {
                watching = true
                options.setWatching(true)
            }
        } else if (watching && !live) {
            watching = false
            options.setWatching(false)
            race.placeOnGrid(slot)
        } else if (!before && !live) {
            race.placeOnGrid(slot)
        }

        const wasLive = before?.phase === 'countdown' || before?.phase === 'racing'
        if (wasLive && !live) {
            options.snacks.clear()
            panel.setReceipt(options.snacks.receipt())
            race.end()
            setTimeout(loadRecords, RECORDS_DELAY_MS)
        }
    }

    const connect = () => {
        socket = new WebSocket(`${scheme}://${location.host}/games/racing/live/ws`)

        socket.addEventListener('open', () => {
            // Back into the same lobby after a drop: the one we were in, else the one the page asked for.
            send({
                type: 'hello',
                trackId: options.trackId,
                lobby: current?.id ?? options.lobby,
                playerId: options.playerId,
            })
        })

        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as ServerMessage
            switch (message.type) {
                case 'welcome':
                    attempts = 0
                    you = message.you
                    // Keep the lobby in the URL: a refresh comes back to it, and it can be shared.
                    history.replaceState(null, '', withLobby(message.lobby.id))
                    onLobby(message.lobby)
                    break
                case 'lobby':
                    onLobby(message.lobby)
                    break
                case 'countdown': {
                    options.snacks.setSnacks(message.snacks)
                    panel.setReceipt([])
                    const slot = message.slots[you]
                    if (slot === undefined) break
                    if (watching) {
                        watching = false
                        options.setWatching(false)
                    }
                    samples = []
                    race.countdown(slot)
                    break
                }
                case 'snacks':
                    options.snacks.setSnacks(message.snacks)
                    break
                case 'ate':
                    options.snacks.ate(message.snack, message.kind, message.by)
                    break
                case 'respawn':
                    options.snacks.respawn(message.snack)
                    break
                case 'teleport':
                    options.snacks.teleport(message.x, message.z, message.heading)
                    race.level({ lap: message.lap, next: message.next, lastGate: message.lastGate })
                    break
                case 'karts': {
                    others.receive(message.karts)
                    const names = new Map(current?.members.map(m => [m.id, m.name]))
                    leader = message.standings?.[0]?.id ?? null
                    race.setStandings(
                        message.standings?.map(s => ({ name: names.get(s.id) ?? '?', isYou: s.id === you })) ?? null
                    )
                    break
                }
                case 'closed':
                    fail(message.by ? `${message.by} closed the lobby.` : 'This lobby was closed.')
                    socket.close()
                    break
                case 'error':
                    if (message.code === 'NOT_HOST') break
                    fail(ERRORS[message.code])
                    socket.close()
                    break
            }
        })

        socket.addEventListener('close', event => {
            console.warn('racing: lobby socket closed', event.code, event.reason || '(no reason)')
            if (failed) return
            // Dropped (a long first frame, the Wi-Fi, a server restart): try again a few times.
            if (attempts < RECONNECT_TRIES) {
                attempts += 1
                setTimeout(connect, RECONNECT_MS * attempts)
                return
            }
            fail('Disconnected from the lobby. Reload to join again.')
        })
    }
    connect()

    setInterval(() => {
        if (!current || watching || failed) return
        const kart = driver.kart
        const pose = {
            x: round(kart.x, 2),
            y: round(kart.y, 2),
            z: round(kart.z, 2),
            heading: round(kart.heading, 3),
            speed: round(forwardSpeed(kart), 2),
            drift: kart.drift,
            charge: round(kart.charge, 2),
            // A nitro shows to the others as a boost flame.
            boost: kart.boost > 0 || kart.surge > 0,
            airborne: kart.airborne,
            steer: round(driver.steer, 2),
        }
        // A slow frame can pile up more steps than one message carries: send them in pieces.
        do {
            const chunk = samples.splice(0, SAMPLES_PER_MESSAGE * 3)
            send({ type: 'pose', pose, ...(chunk.length > 0 ? { samples: chunk } : {}) })
        } while (samples.length > 0)
    }, SEND_MS)

    loadRecords()

    return {
        get leader() {
            return leader
        },

        get you() {
            return you
        },

        nameOf(id) {
            return current?.members.find(m => m.id === id)?.name ?? 'Someone'
        },

        eat(id) {
            send({ type: 'eat', snack: id })
        },
    }
}

/** This page's URL with `?lobby=` set, keeping `?player=`. */
function withLobby(id: string): string {
    const url = new URL(location.href)
    url.searchParams.set('lobby', id)

    return url.pathname + url.search
}

function round(value: number, decimals: number): number {
    const scale = 10 ** decimals

    return Math.round(value * scale) / scale
}
