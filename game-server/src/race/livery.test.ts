import { expect, test } from 'bun:test'
import { liveryFrom, PATTERNS, PLAIN, SPONSOR_LENGTH } from './livery.ts'

test("the game's patterns are the Hub's (RacingKart::PATTERNS), in the same order", async () => {
    const model = await Bun.file(`${import.meta.dir}/../../../app/Games/Racing/Models/RacingKart.php`).text()
    const line = model.match(/PATTERNS = \[(.*?)\]/)![1]!
    expect(line.split(',').map(p => p.trim().replace(/'/g, ''))).toEqual([...PATTERNS])
    expect(Number(model.match(/SPONSOR_LENGTH = (\d+)/)![1])).toBe(SPONSOR_LENGTH)
})

test('a livery from the Hub: what it says when it makes sense, plain otherwise', () => {
    expect(liveryFrom({ number: 7, pattern: 'flames', stickers: false, sponsor: ' Poutine ' })).toEqual({
        number: 7,
        pattern: 'flames',
        stickers: false,
        sponsor: 'Poutine',
    })
    // A sponsor is at most 10 characters (accents count as one), empty is none.
    expect(liveryFrom({ sponsor: 'Éclair au chocolat' }).sponsor).toBe('Éclair au')
    expect(liveryFrom({ sponsor: '   ' }).sponsor).toBeNull()
    expect(liveryFrom({ number: 120, pattern: 'polka', stickers: 'yes' })).toEqual(PLAIN)
    expect(liveryFrom(null)).toEqual(PLAIN)
})
