import { afterEach, describe, expect, test } from 'bun:test'
import { LaravelClient, LOOKUP_TRIES } from './laravel.ts'

/** A stand-in Hub answering each request with the next status (the last one repeats). */
function hub(statuses: number[]) {
    let hits = 0
    const server = Bun.serve({
        port: 0,
        fetch() {
            const status = statuses[Math.min(hits++, statuses.length - 1)]!
            return status === 200 ? Response.json({ id: 7, name: 'Ada' }) : new Response(null, { status })
        },
    })
    return {
        server,
        client: new LaravelClient(`http://127.0.0.1:${server.port}`, 'secret', 1),
        hits: () => hits,
    }
}

let running: ReturnType<typeof hub> | null = null
afterEach(() => {
    running?.server.stop(true)
    running = null
})

describe('looking a joining player up in the Hub', () => {
    test('tries again while the Hub is restarting (a 5xx), and gets them once it answers', async () => {
        running = hub([502, 503, 200])
        expect(await running.client.findPlayer(7)).toMatchObject({ id: 7, name: 'Ada' })
        expect(running.hits()).toBe(3)
    })

    test(`gives up after ${LOOKUP_TRIES} tries`, async () => {
        running = hub([503])
        await expect(running.client.findPlayer(7)).rejects.toThrow('503')
        expect(running.hits()).toBe(LOOKUP_TRIES)
    })

    test('a player who does not exist is an answer: no retry', async () => {
        running = hub([404])
        expect(await running.client.findPlayer(7)).toBeNull()
        expect(running.hits()).toBe(1)
    })

    test('an unreachable Hub is tried again too, then thrown', async () => {
        const client = new LaravelClient('http://127.0.0.1:1', 'secret', 1)
        await expect(client.findPlayer(7)).rejects.toThrow()
    })
})
