import { describe, expect, test } from 'bun:test'
import { generateArena, isReachable, MIN_GAP, SPAWN_CLEARANCE } from './arena.ts'
import { distanceToObstacle, gapBetween, obstacleAt } from './geometry.ts'
import { THEME_IDS } from './themes.ts'

describe('generateArena', () => {
    test('the same seed gives the same arena', () => {
        expect(generateArena(1234, 'open_space', 6)).toEqual(generateArena(1234, 'open_space', 6))
    })

    test('different seeds give different arenas', () => {
        expect(generateArena(1, 'open_space', 6)).not.toEqual(generateArena(2, 'open_space', 6))
    })

    test('the field grows with the player count', () => {
        const small = generateArena(7, 'open_space', 3)
        const large = generateArena(7, 'open_space', 12)

        expect(small.width).toBe(40)
        expect(large.width).toBe(64)
        expect(large.width * large.height).toBeGreaterThan(small.width * small.height)
    })

    test('there is one spawn per player', () => {
        expect(generateArena(9, 'cafeteria', 8).spawns).toHaveLength(8)
    })

    test('only the ping-pong hall has a moving obstacle', () => {
        for (const theme of THEME_IDS) {
            const movers = generateArena(5, theme, 6).obstacles.filter(o => o.mover)
            expect(movers.length).toBe(theme === 'ping_pong_hall' ? 1 : 0)
        }
    })

    // The fairness rules, checked over many seeds rather than trusted.
    // 50 seeds × 10 player counts = 500 arenas per theme.
    test('every arena is fair: gaps, clear spawns, everything reachable', () => {
        const failures: string[] = []

        for (const theme of THEME_IDS) {
            for (let players = 3; players <= 12; players++) {
                for (let seed = 0; seed < 50; seed++) {
                    const arena = generateArena(seed * 7919 + players, theme, players)
                    const label = `${theme} seed=${seed * 7919 + players} players=${players}`

                    for (const spawn of arena.spawns) {
                        for (const obstacle of arena.obstacles) {
                            if (distanceToObstacle(spawn, obstacle, 0) < SPAWN_CLEARANCE)
                                failures.push(`${label}: spawn too close`)
                        }
                    }

                    for (const [i, a] of arena.obstacles.entries()) {
                        for (const b of arena.obstacles.slice(i + 1)) {
                            if (gapBetween(a, b) < MIN_GAP - 1e-9) failures.push(`${label}: gap too narrow`)
                        }
                    }

                    if (!isReachable(arena)) failures.push(`${label}: unreachable floor`)
                }
            }
        }

        expect(failures).toEqual([])
    }, 60_000)

    test('obstacleAt follows the mover over time', () => {
        const arena = generateArena(3, 'ping_pong_hall', 6)
        const mover = arena.obstacles.find(o => o.mover)

        expect(mover).toBeDefined()
        if (!mover?.mover) return

        const quarter = mover.mover.periodMs / 4
        const start = obstacleAt(mover, 0)
        const later = obstacleAt(mover, quarter)
        const moved = Math.abs(later.x - start.x) + Math.abs(later.y - start.y)

        expect(moved).toBeCloseTo(mover.mover.amplitude, 5)
    })
})
