import { beforeAll, describe, expect, test } from 'bun:test'
import { buildRacingAssets, RACING_PREFIX, type RacingAssets, serveRacing } from './serve.ts'

describe('serveRacing', () => {
    let assets: RacingAssets
    beforeAll(async () => {
        assets = await buildRacingAssets()
    })
    const get = (path: string, headers: Record<string, string> = {}) =>
        serveRacing(assets, new Request(`http://hub${path}`, { headers }))

    test('serves every bundle as JavaScript', async () => {
        for (const name of ['play.js', 'editor.js', 'garage.js']) {
            const response = get(`${RACING_PREFIX}/${name}`)!
            expect(response.status).toBe(200)
            expect(response.headers.get('Content-Type')).toContain('javascript')
            expect((await response.text()).length).toBeGreaterThan(1000)
        }
    })

    test('serves the map gzipped to browsers that take it, plain to the rest', async () => {
        const zipped = get(`${RACING_PREFIX}/map.json`, { 'Accept-Encoding': 'gzip, br' })!
        expect(zipped.headers.get('Content-Encoding')).toBe('gzip')
        const plain = get(`${RACING_PREFIX}/map.json`)!
        expect(plain.headers.get('Content-Encoding')).toBeNull()
        expect((await plain.json()).buildings.length).toBeGreaterThan(1000)
    })

    test('answers 304 while the browser has the same version', () => {
        const etag = get(`${RACING_PREFIX}/play.js`)!.headers.get('ETag')!
        expect(get(`${RACING_PREFIX}/play.js`, { 'If-None-Match': etag })!.status).toBe(304)
    })

    test('answers 503 for racing when the bundles failed to build, and still leaves other paths alone', () => {
        const request = (path: string) => new Request(`http://hub${path}`)
        expect(serveRacing(null, request(`${RACING_PREFIX}/play.js`))!.status).toBe(503)
        expect(serveRacing(null, request('/games/hot-potato/live/client.js'))).toBeNull()
    })

    test('404s unknown files under the prefix, and leaves other paths alone', () => {
        expect(get(`${RACING_PREFIX}/secrets.txt`)!.status).toBe(404)
        expect(get('/games/hot-potato/live/client.js')).toBeNull()
    })
})
