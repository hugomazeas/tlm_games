import { describe, expect, test } from 'bun:test'
import {
    clearance,
    generateArena,
    isReachable,
    MIN_GAP,
    PAD_CLEARANCE,
    PAD_RADIUS,
    PAD_SPACING,
    runwayIsClear,
    SPAWN_CLEARANCE,
    wallBlocks,
} from './arena.ts'
import { distanceToObstacle, gapBetween, obstacleAt } from './geometry.ts'
import { createRng } from './rng.ts'
import { THEME_IDS, THEMES } from './themes.ts'

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

    test('every theme has moving obstacles, more of them in bigger arenas, never more than it allows', () => {
        for (const theme of THEME_IDS) {
            const [min, max] = THEMES[theme].movers.count
            let small = 0
            let large = 0

            for (let seed = 0; seed < 40; seed++) {
                const few = generateArena(seed, theme, 3).obstacles.filter(o => o.mover).length
                const many = generateArena(seed, theme, 12).obstacles.filter(o => o.mover).length
                expect(few).toBeLessThanOrEqual(min)
                expect(many).toBeLessThanOrEqual(max)
                small += few
                large += many
            }

            expect(small).toBeGreaterThan(0)
            expect(large).toBeGreaterThanOrEqual(small)
        }
    })

    test('movers slide on both axes', () => {
        const axes = new Set<string>()
        for (let seed = 0; seed < 40; seed++) {
            for (const o of generateArena(seed, 'ping_pong_hall', 12).obstacles) if (o.mover) axes.add(o.mover.axis)
        }

        expect([...axes].sort()).toEqual(['x', 'y'])
    })

    test('every theme builds walls: L, T or U shapes of touching blocks', () => {
        for (const theme of THEME_IDS) {
            let walls = 0
            for (let seed = 0; seed < 40; seed++) {
                const groups = new Map<number, number>()
                for (const o of generateArena(seed, theme, 8).obstacles) {
                    if (o.group !== undefined) groups.set(o.group, (groups.get(o.group) ?? 0) + 1)
                }
                for (const blocks of groups.values()) expect([2, 3]).toContain(blocks)
                walls += groups.size
            }

            expect(walls).toBeGreaterThan(0)
        }
    })

    test('a U is always wide enough inside to walk into', () => {
        for (let seed = 0; seed < 200; seed++) {
            const [base, left, right] = wallBlocks('U', 1.4, createRng(seed))
            if (!base || !left || !right) throw new Error('a U has three blocks')

            const inside = right.x - right.w / 2 - (left.x + left.w / 2)
            expect(inside).toBeGreaterThanOrEqual(MIN_GAP)
            // The arms stand on the base, touching it but not overlapping.
            expect(left.y + left.h / 2).toBeCloseTo(base.y - base.h / 2, 9)
        }
    })

    test('boost pads sit on open floor, apart, and point down a clear runway', () => {
        for (const theme of THEME_IDS) {
            for (let seed = 0; seed < 40; seed++) {
                const players = 3 + (seed % 10)
                const arena = generateArena(seed, theme, players)
                expect(arena.pads.length).toBeGreaterThan(0)
                expect(arena.pads.length).toBeLessThanOrEqual(4)

                for (const [i, pad] of arena.pads.entries()) {
                    expect(Math.hypot(pad.dx, pad.dy)).toBeCloseTo(1, 9)
                    for (const o of arena.obstacles) {
                        expect(clearance(pad, o)).toBeGreaterThanOrEqual(PAD_CLEARANCE + PAD_RADIUS)
                    }
                    for (const spawn of arena.spawns) {
                        expect(Math.hypot(spawn.x - pad.x, spawn.y - pad.y)).toBeGreaterThanOrEqual(SPAWN_CLEARANCE)
                    }
                    for (const other of arena.pads.slice(i + 1)) {
                        expect(Math.hypot(other.x - pad.x, other.y - pad.y)).toBeGreaterThanOrEqual(PAD_SPACING)
                    }
                    expect(runwayIsClear(pad, pad.dx, pad.dy, arena, arena.obstacles)).toBe(true)
                }
            }
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
                            // Blocks of the same wall touch on purpose.
                            if (a.group !== undefined && a.group === b.group) continue
                            if (gapBetween(a, b) < MIN_GAP - 1e-9) failures.push(`${label}: gap too narrow`)
                        }
                        const box = { w: arena.width, h: arena.height }
                        if (a.x < 0 || a.y < 0 || a.x > box.w || a.y > box.h) failures.push(`${label}: outside`)
                    }

                    if (!isReachable(arena)) failures.push(`${label}: unreachable floor`)
                }
            }
        }

        expect(failures).toEqual([])
    }, 180_000)

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
