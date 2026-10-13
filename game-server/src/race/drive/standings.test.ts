import { expect, test } from 'bun:test'
import { type Progress, startProgress } from './laps.ts'
import { gatesPassed, ordinal, type Racer, standings } from './standings.ts'

const GATES = 4

function racer(id: string, progress: Partial<Progress>, toNextGate = 50): Racer {
    return { id, name: id, progress: { ...startProgress(), ...progress }, toNextGate }
}

test('gatesPassed counts across laps', () => {
    expect(gatesPassed(startProgress(), GATES)).toBe(0)
    expect(gatesPassed({ ...startProgress(), lap: 1, next: 1 }, GATES)).toBe(1)
    expect(gatesPassed({ ...startProgress(), lap: 1, next: 0 }, GATES)).toBe(4)
    expect(gatesPassed({ ...startProgress(), lap: 2, next: 1 }, GATES)).toBe(5)
})

test('more gates passed is ahead; on the same gate, closer to the next one is', () => {
    const order = standings(
        [
            racer('behind', { lap: 1, next: 2 }, 10),
            racer('ahead', { lap: 2, next: 1 }, 90),
            racer('close', { lap: 1, next: 3 }, 20),
            racer('far', { lap: 1, next: 3 }, 80),
        ],
        GATES
    )
    expect(order.map(r => r.id)).toEqual(['ahead', 'close', 'far', 'behind'])
})

test('the finished come first, by time, whatever the others have done', () => {
    const order = standings(
        [
            racer('racing', { lap: 3, next: 0 }, 1),
            racer('second', { lap: 2, lapTimes: [60, 60], finishedAt: 125 }),
            racer('first', { lap: 2, lapTimes: [60, 60], finishedAt: 120 }),
        ],
        GATES
    )
    expect(order.map(r => r.id)).toEqual(['first', 'second', 'racing'])
})

test('ties are broken by id, so everyone sees the same order', () => {
    expect(standings([racer('b', {}), racer('a', {})], GATES).map(r => r.id)).toEqual(['a', 'b'])
})

test('ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
        '1st',
        '2nd',
        '3rd',
        '4th',
        '11th',
        '12th',
        '13th',
        '21st',
        '22nd',
        '101st',
    ])
})
