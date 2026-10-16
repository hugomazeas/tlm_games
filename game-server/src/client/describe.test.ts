import { describe, expect, test } from 'bun:test'
import { chatText } from './describe.ts'

describe('chatText', () => {
    test('words every kind of event line', () => {
        expect(chatText({ type: 'joined', name: 'Marie' })).toBe('👋 Marie joined')
        expect(chatText({ type: 'started', mode: 'king', theme: 'ice_rink', players: 6 })).toBe(
            '▶️ 👑 King of the Potato · ❄️ Ice rink · 6 players'
        )
        expect(chatText({ type: 'boom', mode: 'survival', name: 'Hugo' })).toBe('💥 Hugo blew up!')
        expect(chatText({ type: 'boom', mode: 'killer', name: 'Hugo' })).toBe('🔪 Hugo got caught!')
        expect(chatText({ type: 'steal', from: 'Hugo', to: 'Marie' })).toBe('👑 Marie stole the crown from Hugo')
        expect(chatText({ type: 'pickup', name: 'Hugo', item: 'mystery', effect: 'freeze' })).toBe(
            '❓→🧊 Hugo set off a freeze bomb'
        )
        expect(chatText({ type: 'results', mode: 'survival', winners: ['Hugo'] })).toBe('🏆 Hugo wins!')
        expect(chatText({ type: 'results', mode: 'killer', winners: [] })).toBe('🔪 The Killer Potato caught everyone')
        expect(chatText({ type: 'results', mode: 'king', winners: ['Ana'] })).toBe('👑 Ana kept the crown longest')
        expect(chatText({ type: 'replay', gameId: 3 })).toBe('🎬 The replay is ready')
    })
})
