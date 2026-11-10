import type { LaravelClient } from '../laravel.ts'
import { type Connection, FpsLobby, type Joiner, type MatchResult } from './lobby.ts'
import type { ErrorCode, Loadout } from './protocol.ts'
import { cloudNineWorld, officeWorld } from './sim/world.ts'

/**
 * The office FPS as the game server runs it: the one FpsLobby, fed by the WebSocket at
 * /games/office-fps/live/ws, with players looked up in the Hub.
 */

export interface FpsLive {
    lobby: FpsLobby
    /** Looks the player up, then puts the connection in the game. False when it couldn't be. */
    hello(conn: Connection & { isOpen(): boolean }, playerId: number | null, loadout?: Loadout): Promise<boolean>
}

export function createFpsLive(laravel: LaravelClient, onResults: (result: MatchResult) => void): FpsLive {
    // About a second: the office's exact collision, shared by every match (and Cloud Nine's few blocks).
    const lobby = new FpsLobby(
        officeWorld(),
        { now: () => Date.now(), random: Math.random, onResults },
        { 'cloud-nine': cloudNineWorld() }
    )
    let guests = 0
    const refuse = (conn: Connection, code: ErrorCode) => conn.send({ type: 'error', code })

    return {
        lobby,

        async hello(conn, playerId, loadout) {
            let joiner: Joiner = { playerId: null, name: `Guest ${++guests}`, loadout }
            if (playerId !== null) {
                try {
                    const player = await laravel.findPlayer(playerId)
                    if (!player) {
                        refuse(conn, 'UNKNOWN_PLAYER')
                        return false
                    }
                    joiner = { playerId, name: player.name, loadout }
                } catch (error) {
                    console.error('Office FPS player lookup failed:', (error as Error).message)
                    refuse(conn, 'UNAVAILABLE')
                    return false
                }
            }
            // The socket may have closed while the Hub answered.
            if (!conn.isOpen()) return false

            lobby.join(conn, joiner)
            return true
        },
    }
}
