import { describe, expect, test } from 'bun:test'
import { buildGunLab, sourcesVersion } from './gun-lab.ts'

describe('the gun lab', () => {
    test('builds: a broken import in the guns fails here, not on the page', async () => {
        const build = await buildGunLab()
        if (!build.ok) throw new Error(build.error)
        expect(build.code.length).toBeGreaterThan(10_000)
    })

    test('has a version for the page to watch, the same while nothing changes', async () => {
        const version = await sourcesVersion()
        expect(version).toMatch(/^\d+(\.\d+)?-\d+$/)
        expect(await sourcesVersion()).toBe(version)
    })
})
