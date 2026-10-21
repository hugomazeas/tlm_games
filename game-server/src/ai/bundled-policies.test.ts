import { describe, expect, test } from 'bun:test'
import { bestAction, checkPolicy, createPolicyState, decodePolicy, policyLogits } from './policy.ts'

interface Reference {
    obs: number[][]
    logits: number[][]
    actions: number[]
    /** Each game's first decision: the policy's memory starts from zero there. */
    starts?: boolean[]
}

const read = async <T>(path: string): Promise<T> => Bun.file(new URL(path, import.meta.url)).json()

// Every policy file the server ships, with its decision cadence and a note on its architecture.
const bundled = [
    { name: 'easy', actionRepeat: 4, memory: false },
    { name: 'hard', actionRepeat: 2, memory: true },
    { name: 'hard-king', actionRepeat: 2, memory: true },
    { name: 'hunter', actionRepeat: 4, memory: false },
]

describe.each(bundled)('bundled $name policy', ({ name, actionRepeat, memory }) => {
    test('decodes, fits the observation layout and action table, and decides on its cadence', async () => {
        const policy = decodePolicy(await read(`./${name}-policy.json`))
        expect(() => checkPolicy(policy)).not.toThrow()
        expect(policy.config.action_repeat).toBe(actionRepeat)
        expect(policy.gru !== undefined).toBe(memory)
    })

    // Logits from the training tools' reference forward pass (float64) on recorded observations, the
    // memory carried along each game and zeroed at its start.
    test("reproduces the training tools' logits and actions", async () => {
        const policy = decodePolicy(await read(`./${name}-policy.json`))
        const reference = await read<Reference>(`./fixtures/${name}-policy-logits.json`)
        expect(reference.obs.length).toBeGreaterThan(0)
        let state = createPolicyState(policy)
        reference.obs.forEach((row, i) => {
            if (reference.starts?.[i]) state = createPolicyState(policy)
            const out = policyLogits(policy, row, state)
            const expected = reference.logits[i] as number[]
            expect(out).toHaveLength(expected.length)
            out.forEach((value, j) => expect(Math.abs(value - (expected[j] as number))).toBeLessThan(1e-6))
            expect(bestAction(out)).toBe(reference.actions[i] as number)
        })
    })
})
