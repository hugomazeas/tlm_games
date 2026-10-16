/**
 * Picking up a deploy without reloading forever. A tab whose bundle is older than the
 * server's reloads once for that build; if it still runs the old bundle after that (a
 * cache in the way: Cloudflare hands `.js` a 4-hour browser TTL whatever the server says),
 * it stops and asks for a hard refresh instead of looping.
 */

/** sessionStorage: the server build this tab last reloaded for. Survives the reload, not the tab. */
export const RELOADED_FOR_KEY = 'hot_potato_reloaded_for'

export type Freshness = 'fresh' | 'reload' | 'stuck'

export function freshness(serverBuild: string, tabBuild: string, reloadedFor: string | null): Freshness {
    if (serverBuild === tabBuild) return 'fresh'
    return reloadedFor === serverBuild ? 'stuck' : 'reload'
}

/**
 * Fetches the bundle past every cache (it replaces the stale copy in the browser's), then
 * reloads. A failed fetch still reloads: the guard above keeps that to once.
 */
export async function reloadFresh(bundleUrl: string, serverBuild: string): Promise<void> {
    try {
        sessionStorage.setItem(RELOADED_FOR_KEY, serverBuild)
    } catch {
        // Storage refused: the reload still happens, just without the guard.
    }
    try {
        await fetch(bundleUrl, { cache: 'reload' })
    } catch {
        // Offline for a moment: the reload below tries anyway.
    }
    location.reload()
}

export function reloadedFor(): string | null {
    try {
        return sessionStorage.getItem(RELOADED_FOR_KEY)
    } catch {
        return null
    }
}
