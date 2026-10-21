/**
 * The sky a race runs under: a time of day and the weather. A lobby rolls one
 * for its next race, so everyone in it races under the same sky. Rain and snow
 * take grip away (and drifts slide further); night is only a look.
 */

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night'
export type Weather = 'clear' | 'rain' | 'snow'

export interface Sky {
    time: TimeOfDay
    weather: Weather
}

export const CLEAR_NOON: Sky = { time: 'noon', weather: 'clear' }

/** How often each comes up: mostly fine days. */
const TIMES: Array<[TimeOfDay, number]> = [
    ['morning', 0.2],
    ['noon', 0.35],
    ['sunset', 0.25],
    ['night', 0.2],
]
const WEATHERS: Array<[Weather, number]> = [
    ['clear', 0.6],
    ['rain', 0.2],
    ['snow', 0.2],
]

/** What's left of the tyres' sideways grip. */
export const GRIP: Record<Weather, number> = { clear: 1, rain: 0.8, snow: 0.65 }

export const TIMES_OF_DAY: TimeOfDay[] = TIMES.map(([time]) => time)

/** A random sky; at `time` when the host picked one (the weather is still a surprise). */
export function rollSky(random: () => number, time: TimeOfDay | null = null): Sky {
    const rolled = pick(TIMES, random())

    return { time: time ?? rolled, weather: pick(WEATHERS, random()) }
}

/** "Snow at sunset", for the lobby panel. */
export function describeSky(sky: Sky): string {
    const time = { morning: 'in the morning', noon: 'at noon', sunset: 'at sunset', night: 'at night' }[sky.time]
    const weather = { clear: 'Clear', rain: 'Rain', snow: 'Snow' }[sky.weather]

    return `${weather} ${time}`
}

function pick<T>(choices: Array<[T, number]>, roll: number): T {
    let left = roll
    for (const [choice, weight] of choices) {
        if (left < weight) return choice
        left -= weight
    }

    return choices[choices.length - 1]![0]
}
