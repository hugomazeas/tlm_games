import { describe, expect, test } from 'bun:test'
import type { LaravelClient } from '../laravel.ts'
import { createFpsLive } from './live.ts'
import type { ServerMessage } from './protocol.ts'

describe('joining the office FPS', () => {
    test("when the Hub can't answer, the socket is closed so the browser reconnects", async () => {
        const laravel = {
            findPlayer: () => Promise.reject(new Error('Player lookup failed with 503')),
        } as unknown as LaravelClient
        const live = createFpsLive(laravel, () => {})
        const sent: ServerMessage[] = []
        let closed = false
        const conn = {
            id: 'c1',
            send: (m: ServerMessage) => sent.push(m),
            close: () => (closed = true),
            isOpen: () => !closed,
        }

        expect(await live.hello(conn, 7)).toBe(false)
        expect(sent).toEqual([{ type: 'error', code: 'UNAVAILABLE' }])
        expect(closed).toBe(true)
    })
})
