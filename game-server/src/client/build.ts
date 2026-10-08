/**
 * Which bundle this browser is running. The server swaps the placeholder for
 * a hash of the bundle when it builds it, and sends the same hash in every
 * `welcome`: a tab whose build no longer matches was loaded before a deploy.
 */
export const BUILD_PLACEHOLDER = '__HOT_POTATO_BUILD__'

export const BUILD: string = BUILD_PLACEHOLDER
