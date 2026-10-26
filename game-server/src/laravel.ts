import type { ChatEvent, ChatLine, UnsavedLine } from './chat.ts'
import { lookFrom } from './cosmetics.ts'
import type { PlayerInfo } from './protocol.ts'
import type { GateSpec } from './race/map/courses.ts'
import type { RaceResult } from './race/lobbies.ts'
import { type Livery, liveryFrom } from './race/livery.ts'
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

    /** An office's saved chat, oldest first, as lines without this server's ids. */
    async loadChat(officeId: number): Promise<Array<Omit<ChatLine, 'id'>>> {
        const response = await this.request('GET', `/internal/hot-potato/offices/${officeId}/chat`)
        if (!response.ok) throw new Error(`Loading the chat failed with ${response.status}`)

        const rows = (await response.json()) as Array<{
            kind: ChatLine['kind']
            at: string
            body: string | null
            event: ChatEvent | null
            author: { id: number; name: string; avatar_url: string | null; look?: unknown } | null
        }>

        return rows.map(row => ({
            at: Date.parse(row.at),
            kind: row.kind,
            ...(row.body === null ? {} : { body: row.body }),
            ...(row.event === null ? {} : { event: row.event }),
            ...(row.author
                ? {
                      author: {
                          id: row.author.id,
                          name: row.author.name,
                          avatarUrl: row.author.avatar_url,
                          look: lookFrom(row.author.look),
                      },
                  }
                : {}),
        }))
    }

    async postChat(lines: UnsavedLine[]): Promise<void> {
        const response = await this.request('POST', '/internal/hot-potato/chat', {
            lines: lines.map(line => ({
                office_id: line.officeId,
                player_id: line.playerId,
                kind: line.kind,
                body: line.body,
                event: line.event,
                at: new Date(line.at).toISOString(),
            })),
        })
        if (!response.ok) throw new Error(`Saving the chat failed with ${response.status}`)
    }

    /** A racing driver's name, garage colours and livery; null when Laravel says the player doesn't exist. */
    async findDriver(playerId: number): Promise<({ name: string; body: string; accent: string } & Livery) | null> {
        const response = await this.request('GET', `/internal/racing/drivers/${playerId}`)
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Driver lookup failed with ${response.status}`)
        const found = (await response.json()) as { name: string; body: string; accent: string } & Partial<Livery>

        return { name: found.name, body: found.body, accent: found.accent, ...liveryFrom(found) }
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
