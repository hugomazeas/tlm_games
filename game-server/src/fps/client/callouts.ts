import type { GameEvent } from '../protocol.ts'

/**
 * What the announcer says about a kill: streak callouts, shutdowns, first blood, and the line you
 * get when you're the one going down. Cheeky office humour, not too hardcore. Pure: the game turns
 * these into banners, kill-feed lines and sounds.
 */

type Kill = Extract<GameEvent, { type: 'kill' }>

/** Kills in one life → the callout (and how loud it is: 1 … 4). */
const STREAKS: Array<{ at: number; title: string; feed: string; level: number }> = [
    { at: 2, title: 'DOUBLE KILL', feed: 'double kill', level: 1 },
    { at: 3, title: 'TRIPLE KILL', feed: 'triple kill', level: 2 },
    { at: 5, title: 'RAMPAGE', feed: 'is on a rampage', level: 3 },
    { at: 7, title: 'UNSTOPPABLE', feed: 'is unstoppable', level: 3 },
    { at: 10, title: 'OFFICE TYRANT', feed: 'is the office tyrant', level: 4 },
    { at: 15, title: 'EXCEEDS EXPECTATIONS', feed: 'exceeds expectations. Someone stop them', level: 4 },
]

/** A streak worth calling out at exactly `kills` in a life, or null. */
export function streakCallout(kills: number): { at: number; title: string; feed: string; level: number } | null {
    return STREAKS.find(s => s.at === kills) ?? null
}

/** A streak that ended this big is a shutdown. */
export const SHUTDOWN_AT = 3

const TAUNTS = [
    'That one is going in your performance review.',
    'HR would like a word.',
    'Back to onboarding.',
    'Your desk has been reassigned.',
    'Out of office: permanently.',
    'Per my last email: you are dead.',
    "Let's circle back after you respawn.",
    'Have you tried turning yourself off and on again?',
    "Should've worked from home.",
    'Taking this offline.',
    'Your manager has been cc’d.',
    'Please update your status to "away".',
]
const HEADSHOT_TAUNTS = ['Right in the quarterly goals.', 'Head count: reduced by one.', 'That was a no-brainer.']
const STAPLER_TAUNTS = ['Stapled to the org chart.', 'Filed, in triplicate.', 'Bound for the archives.']
const BACKSTAB_TAUNTS = ['Stabbed in the back. Classic office politics.', 'Never turn your back on a coworker.']

/** The line under "Fragged by …" when you go down. */
export function taunt(kill: Kill, random: () => number): string {
    const pool = kill.backstab
        ? BACKSTAB_TAUNTS
        : kill.weapon === 'stapler'
          ? STAPLER_TAUNTS
          : kill.headshot
            ? HEADSHOT_TAUNTS
            : TAUNTS
    return pool[Math.floor(random() * pool.length) % pool.length]!
}

export interface Announcement {
    /** A big banner on your screen: yours (your streak, your shutdown, your first blood). */
    banner: { title: string; sub: string; level: number } | null
    /** Lines for everyone's kill feed. */
    feed: string[]
}

/** What a kill means to you (`me`), with names looked up by connection id. */
export function announce(kill: Kill, me: string | null, name: (id: string | null) => string): Announcement {
    const feed: string[] = []
    let banner: Announcement['banner'] = null
    const mine = kill.killer !== null && kill.killer === me
    const killer = name(kill.killer)
    const victim = name(kill.victim)

    if (kill.firstBlood) {
        feed.push(`🩸 First blood: ${killer}`)
        if (mine) banner = { title: 'FIRST BLOOD', sub: `on ${victim}`, level: 2 }
    }
    if (kill.victimStreak >= SHUTDOWN_AT && kill.killer !== null) {
        feed.push(`🛑 ${killer} ended ${victim}'s ${kill.victimStreak}-kill streak`)
        if (mine) banner = { title: 'SHUTDOWN', sub: `${victim} had ${kill.victimStreak} in a row`, level: 3 }
    }
    const streak = kill.killer !== null ? streakCallout(kill.killerStreak) : null
    if (streak) {
        feed.push(`🔥 ${killer} ${streak.at === 2 || streak.at === 3 ? `got a ${streak.feed}` : streak.feed}`)
        // Your own streak outranks a first blood or a shutdown on the same kill.
        if (mine)
            banner = { title: streak.title, sub: `${kill.killerStreak} kills without going down`, level: streak.level }
    }

    return { banner, feed }
}
