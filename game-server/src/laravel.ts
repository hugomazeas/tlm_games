import { lookFrom } from './cosmetics.ts'
import type { PlayerInfo } from './protocol.ts'
import type { GateSpec } from './race/map/courses.ts'
import type { RaceResult } from './race/lobbies.ts'
import type { GameResult } from './sessions.ts'

/**
 * The sidecar's only way to the database: Laravel's internal hot potato and
 * racing endpoints, behind a shared secret. The sidecar never opens SQLite itself.
 */
export class LaravelClient {
    constructor(
        private readonly baseUrl: string,
        private readonly secret: string
    ) {}

    /** The player, null when Laravel says it doesn't exist. Throws when Laravel can't be reached. */
    async findPlayer(playerId: number): Promise<PlayerInfo | null> {
        const response = await this.request('GET', `/internal/hot-potato/players/${playerId}`)
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Player lookup failed with ${response.status}`)

        const body = (await response.json()) as {
            id: number
            name: string
            avatar_url?: string | null
            look?: unknown
        }

        return { id: body.id, name: body.name, avatarUrl: body.avatar_url ?? null, look: lookFrom(body.look) }
    }

    async sessionOpened(officeId: number, hostPlayerId: number): Promise<void> {
        const response = await this.request('POST', '/internal/hot-potato/sessions/opened', {
            office_id: officeId,
            host_player_id: hostPlayerId,
        })
        if (!response.ok) throw new Error(`Session announcement failed with ${response.status}`)
    }

    /** Saves a game's results; returns the game's id. */
    async postResults(result: GameResult): Promise<number> {
        const response = await this.request('POST', '/internal/hot-potato/results', {
            mode: result.mode,
            office_id: result.officeId,
            seed: result.seed,
            theme: result.theme,
            duration_seconds: result.durationSeconds,
            started_at: result.startedAt,
            ended_at: result.endedAt,
            players: result.players.map(p => ({
                player_id: p.playerId,
                position: p.position,
                survived: p.survived,
                eliminated_at_ms: p.eliminatedAtMs,
                hold_ms: p.holdMs,
                passes: p.passes,
            })),
        })
        if (!response.ok) throw new Error(`Saving results failed with ${response.status}`)

        return ((await response.json()) as { id: number }).id
    }

    /** Attaches a saved game's replay: the gzipped recording, sent as is. */
    async postReplay(gameId: number, replay: Uint8Array<ArrayBuffer>): Promise<void> {
        const response = await fetch(`${this.baseUrl}/internal/hot-potato/games/${gameId}/replay`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/gzip',
                'X-Internal-Secret': this.secret,
            },
            body: replay,
            signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) throw new Error(`Saving the replay failed with ${response.status}`)
    }

    /** A racing driver's name and garage colours; null when Laravel says the player doesn't exist. */
    async findDriver(playerId: number): Promise<{ name: string; body: string; accent: string } | null> {
        const response = await this.request('GET', `/internal/racing/drivers/${playerId}`)
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Driver lookup failed with ${response.status}`)

        return (await response.json()) as { name: string; body: string; accent: string }
    }

    /** A racing track's checkpoints; null when it doesn't exist (any more). */
    async findTrack(trackId: number): Promise<{ id: number; name: string; laps: number; gates: GateSpec[] } | null> {
        const response = await this.request('GET', `/internal/racing/tracks/${trackId}`)
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Track lookup failed with ${response.status}`)

        return (await response.json()) as { id: number; name: string; laps: number; gates: GateSpec[] }
    }

    async postRaceResults(result: RaceResult): Promise<void> {
        const response = await this.request('POST', '/internal/racing/results', {
            race_id: result.raceId,
            track_id: result.trackId,
            racers: result.racers,
            results: result.rows.map(row => ({
                player_id: row.playerId,
                position: row.position,
                time_ms: row.timeMs,
                best_lap_ms: row.bestLapMs,
            })),
        })
        if (!response.ok) throw new Error(`Saving race results failed with ${response.status}`)
    }

    private request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
        return fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Internal-Secret': this.secret,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        })
    }
}
