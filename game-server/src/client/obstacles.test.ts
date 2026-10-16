import { describe, expect, test } from 'bun:test'
import { generateArena } from '../sim/arena.ts'
import { THEME_IDS, THEMES } from '../sim/themes.ts'
import { drawerFor } from './obstacles.ts'

describe('obstacle drawings', () => {
    test('every look a theme names has a drawing', () => {
        for (const id of THEME_IDS) {
            const theme = THEMES[id]
            const looks = [
                ...theme.shapes.map(s => s.name),
                theme.walls.name,
                theme.movers.shape.name,
                ...(theme.centerpiece ? [theme.centerpiece.name] : []),
            ]
            for (const look of looks) expect(drawerFor(id, look), `${id}: ${look}`).not.toBeNull()
        }
    })

    test('every obstacle an arena generates knows what it is', () => {
        for (const id of THEME_IDS) {
            for (const big of [false, true]) {
                const arena = generateArena(3, id, 8, { big })
                for (const obstacle of arena.obstacles) expect(drawerFor(id, obstacle.look)).not.toBeNull()
            }
        }
    })

    test('an obstacle without a look (an old replay) has no drawing: the flat shape stays', () => {
        expect(drawerFor('open_space', undefined)).toBeNull()
        expect(drawerFor('open_space', 'spaceship')).toBeNull()
    })
})
