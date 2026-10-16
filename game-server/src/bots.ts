import type { Rng } from './sim/rng.ts'

/** What AI seats are called: one the lobby isn't already using, picked at random. */
export const BOT_NAMES = [
    'Ginette',
    'Poutine',
    'Buck',
    'Réjean',
    'Huguette',
    'Ti-Guy',
    'Gaétan',
    'Jacynthe',
    'Normand',
    'Gisèle',
    'Ti-Coune',
    'Pierrette',
    'Rosaire',
    'Lucienne',
    'Jean-Guy',
    'Raymonde',
    'Fernand',
    'Cretons',
    'Tourtière',
    'Caribou',
    'Pâté Chinois',
    'Bine',
    'Ti-Mé',
    'Thérèse',
    'Gilles',
    'Monique',
    'Denis',
    'Francine',
    'Rhéal',
    'Lise',
] as const

/** Never runs out: past the list (more AIs than names), numbered fallbacks. */
export function pickBotName(rng: Rng, taken: ReadonlySet<string>): string {
    const free = BOT_NAMES.filter(name => !taken.has(name))
    if (free.length > 0) return free[Math.floor(rng() * free.length)]!

    let n = 1
    while (taken.has(`Robot ${n}`)) n++
    return `Robot ${n}`
}

/** Each name has its own background, spread round the colour wheel. */
export function botBackground(name: string): string {
    const index = (BOT_NAMES as readonly string[]).indexOf(name)
    const hue = index >= 0 ? Math.round((index * 137.508) % 360) : hashHue(name)

    return `hsl(${hue} 60% 45%)`
}

/** A robot head on the bot's own colour, as an SVG data URL usable wherever a photo is. */
export function botAvatarUrl(name: string, background = botBackground(name)): string {
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<rect width="64" height="64" fill="${background}"/>` +
        `<line x1="32" y1="9" x2="32" y2="17" stroke="#e2e8f0" stroke-width="3"/>` +
        `<circle cx="32" cy="8" r="4" fill="#facc15"/>` +
        `<rect x="9" y="27" width="5" height="12" rx="2" fill="#94a3b8"/>` +
        `<rect x="50" y="27" width="5" height="12" rx="2" fill="#94a3b8"/>` +
        `<rect x="13" y="17" width="38" height="32" rx="8" fill="#e2e8f0"/>` +
        `<circle cx="24" cy="30" r="5.5" fill="#0f172a"/>` +
        `<circle cx="40" cy="30" r="5.5" fill="#0f172a"/>` +
        `<circle cx="25.5" cy="28.5" r="1.8" fill="#38bdf8"/>` +
        `<circle cx="41.5" cy="28.5" r="1.8" fill="#38bdf8"/>` +
        `<rect x="22" y="40" width="20" height="4" rx="2" fill="#64748b"/>` +
        `<line x1="27" y1="40" x2="27" y2="44" stroke="#e2e8f0" stroke-width="1.2"/>` +
        `<line x1="32" y1="40" x2="32" y2="44" stroke="#e2e8f0" stroke-width="1.2"/>` +
        `<line x1="37" y1="40" x2="37" y2="44" stroke="#e2e8f0" stroke-width="1.2"/>` +
        `</svg>`

    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function hashHue(text: string): number {
    let hash = 0
    for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
    return hash % 360
}
