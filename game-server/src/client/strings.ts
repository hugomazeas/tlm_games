import type { ErrorCode } from '../protocol.ts'
import type { GameMode } from '../sim/game.ts'
import type { Effect, ItemKind } from '../sim/items.ts'

/** Every piece of game copy in one place, so a French pass later is one file. */
export const STRINGS = {
    connecting: 'Connecting…',
    offline: 'Lost the connection — reconnecting…',
    youHaveIt: '🥔 YOU HAVE IT',
    boom: (name: string) => `💥 ${name} blew up!`,
    youAreOut: '🥧 You’re out — enjoy the show',
    survivors: (names: string[]) => (names.length === 1 ? `🏆 ${names[0]} wins!` : `🏆 ${names.join(', ')} survived!`),
    nobody: 'Nobody survived 🥧',
    modes: {
        survival: { label: '🥔 Hot potato', hint: 'Pass it before it blows. Last ones standing win.' },
        king: { label: '👑 King of the Potato', hint: 'Grab the potato and keep it. Longest reign wins.' },
    } satisfies Record<GameMode, { label: string; hint: string }>,
    youAreKing: '👑 YOU’RE THE KING',
    crownStolen: (name: string) => `😤 ${name} stole your crown`,
    kings: (names: string[], seconds: number) =>
        names.length === 1
            ? `👑 ${names[0]} is King — ${seconds} s`
            : `👑 ${names.join(', ')} share the crown — ${seconds} s`,
    noKing: 'Nobody kept the crown 🤷',
    /**
     * Who took what; `name` is null when it's you. A mystery box shows what it
     * turned into. `target` is who a swap hit: null when it's you, undefined when nobody.
     */
    pickup: (name: string | null, item: ItemKind, effect: Effect, target?: string | null) => {
        const prefix = item === 'mystery' ? '❓→' : ''
        const swap =
            target === undefined
                ? ['🔀 Nobody to swap with', `🔀 ${name} found nobody to swap with`]
                : [
                      `🔀 You swapped with ${target}!`,
                      target === null ? `🔀 ${name} swapped with you!` : `🔀 ${name} swapped with ${target}`,
                  ]
        const lines: Record<Effect, [string, string]> = {
            shield: ['🛡️ Shield up!', `🛡️ ${name} is shielded`],
            speed: ['⚡ Speed boost!', `⚡ ${name} got a speed boost`],
            banana: ['🍌 You slipped!', `🍌 ${name} slipped!`],
            ghost: ['👻 Ghost mode: walk through walls!', `👻 ${name} is a ghost`],
            swap: [swap[0] ?? '', swap[1] ?? ''],
            reverse: ['🙃 Your controls are reversed!', `🙃 ${name}’s controls are reversed`],
            freeze: ['🧊 Freeze bomb!', `🧊 ${name} set off a freeze bomb`],
            magnet: ['🧲 Magnet: everyone comes to you', `🧲 ${name} is a magnet`],
            tiny: ['🤏 You shrank!', `🤏 ${name} shrank`],
        }

        return prefix + lines[effect][name === null ? 0 : 1]
    },
    /** The legend under the arena: what each item does. */
    items: {
        shield: 'Shield: can’t be tagged',
        speed: 'Speed boost',
        banana: 'Banana: you slip',
        ghost: 'Ghost: through walls',
        swap: 'Swap places with someone',
        reverse: 'Reversed controls',
        freeze: 'Freeze bomb: freezes those near you',
        magnet: 'Magnet: pulls everyone in',
        tiny: 'Tiny: harder to tag',
        mystery: 'Mystery: any of these',
    } satisfies Record<ItemKind, string>,
    pads: 'Boost pad: launches you its way',
    intro: {
        arena: (emoji: string, name: string) => `${emoji} ${name}`,
        go: 'GO!',
    },
    emoteHint: 'React!',
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
