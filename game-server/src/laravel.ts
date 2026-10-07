import type { PlayerInfo } from './protocol.ts'
import type { GameResult } from './sessions.ts'

/**
 * The sidecar's only way to the database: Laravel's internal hot potato
 * endpoints, behind a shared secret. The sidecar never opens SQLite itself.
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

        const body = (await response.json()) as { id: number; name: string }

        return { id: body.id, name: body.name }
    }

    async sessionOpened(officeId: number, hostPlayerId: number): Promise<void> {
        const response = await this.request('POST', '/internal/hot-potato/sessions/opened', {
            office_id: officeId,
            host_player_id: hostPlayerId,
        })
        if (!response.ok) throw new Error(`Session announcement failed with ${response.status}`)
    }

    async postResults(result: GameResult): Promise<void> {
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
