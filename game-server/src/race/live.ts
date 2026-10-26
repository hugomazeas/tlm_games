import type { LaravelClient } from '../laravel.ts'
import { courseRoute, orientAlongRoute } from './drive/route.ts'
import { type Livery, PLAIN } from './livery.ts'
import { type Connection, type LoadedTrack, LobbyManager } from './lobbies.ts'
import { projectionAt } from './map/convert.ts'
import { projectCourse } from './map/courses.ts'
import type { RaceMap } from './map/format.ts'
import type { ClientMessage } from './protocol.ts'

/**
 * The racing lobbies as the game server runs them: the LobbyManager, fed by
 * the WebSocket at /games/racing/live/ws, with drivers and tracks looked up
 * in the Hub and results posted back to it.
 */

const MAP_FILE = `${import.meta.dir}/../../maps/quebec-plains/map.json`
/** Tracks can be edited in the Hub: a lobby opened after this long fetches the track again. */
const TRACK_CACHE_MS = 30_000
const GUEST = { name: 'Guest', body: '#d23c3c', accent: '#2b5fa8', ...PLAIN }

export interface RacingLive {
    manager: LobbyManager
    /** Looks the driver and track up, then seats the connection. False when it couldn't be. */
    hello(
        conn: Connection & { isOpen(): boolean },
        message: Extract<ClientMessage, { type: 'hello' }>
    ): Promise<boolean>
}

export async function createRacingLive(laravel: LaravelClient): Promise<RacingLive> {
    const map = (await Bun.file(MAP_FILE).json()) as RaceMap
    const { project } = projectionAt(map.origin)
    const tracks = new Map<number, { track: LoadedTrack; at: number }>()

    const manager = new LobbyManager({
        now: () => Date.now(),
        newId: () => Math.random().toString(36).slice(2, 8).padEnd(6, '0'),
        random: Math.random,
        onResults: result => {
            laravel.postRaceResults(result).catch(error => console.error('Race results not saved:', error.message))
        },
    })

    const loadTrack = async (trackId: number): Promise<LoadedTrack | null> => {
        const cached = tracks.get(trackId)
        if (cached && Date.now() - cached.at < TRACK_CACHE_MS) return cached.track
        const spec = await laravel.findTrack(trackId)
        if (!spec) return null
        const projected = projectCourse(`track-${spec.id}`, spec, project)
        const route = courseRoute(projected, map.roads)
        // Gates are crossed either way; turned the way the route goes, they match the tabs' resets.
        const course = route ? orientAlongRoute(projected, route) : projected
        const track = { id: spec.id, name: spec.name, course, route }
        tracks.set(trackId, { track, at: Date.now() })

        return track
    }

    return {
        manager,

        async hello(conn, { trackId, lobby, playerId }) {
            let track: LoadedTrack | null
            let driver: ({ name: string; body: string; accent: string } & Livery) | null = GUEST
            try {
                track = await loadTrack(trackId)
                if (playerId !== null) driver = await laravel.findDriver(playerId)
            } catch (error) {
                console.error('Racing lookup failed:', (error as Error).message)
                conn.send({ type: 'error', code: 'UNAVAILABLE' })
                return false
            }
            if (!track) {
                conn.send({ type: 'error', code: 'NO_TRACK' })
                return false
            }
            if (!driver) {
                conn.send({ type: 'error', code: 'UNKNOWN_PLAYER' })
                return false
            }
            // The socket may have closed while the Hub answered.
            if (!conn.isOpen()) return false

            manager.join(conn, { playerId, ...driver }, track, lobby)
            return true
        },
    }
}
