import type { ErrorCode } from '../protocol.ts'

/** Every piece of game copy in one place, so a French pass later is one file. */
export const STRINGS = {
    connecting: 'Connecting…',
    offline: 'Lost the connection — reconnecting…',
    youHaveIt: '🥔 YOU HAVE IT',
    boom: (name: string) => `💥 ${name} blew up!`,
    youAreOut: '🥧 You’re out — enjoy the show',
    survivors: (names: string[]) => (names.length === 1 ? `🏆 ${names[0]} wins!` : `🏆 ${names.join(', ')} survived!`),
    nobody: 'Nobody survived 🥧',
    someone: 'Someone',
    errors: {
        BAD_MESSAGE: 'Something went wrong. Reload the page.',
        HELLO_FIRST: 'Something went wrong. Reload the page.',
        UNKNOWN_PLAYER: 'That player no longer exists — pick another.',
        PICK_A_PLAYER: 'Pick your player first.',
        SESSION_EXISTS: 'Someone already opened a game here.',
        NO_SESSION: 'That game is over.',
        NOT_HOST: 'Only the host can do that.',
        NOT_ENOUGH_PLAYERS: 'You need at least 3 players.',
        LOBBY_FULL: 'This game is full (12 players).',
        NOT_IN_LOBBY: 'Wait for the current game to finish.',
        UNAVAILABLE: 'The game server can’t reach the Hub right now.',
    } satisfies Record<ErrorCode, string>,
}
