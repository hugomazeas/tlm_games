import { describe, expect, test } from 'bun:test'
import { createRng } from '../sim/rng.ts'
import { OBS_SIZE } from './observation.ts'
import {
    ACTION_COUNT,
    ACTION_SPEC_VERSION,
    createPolicyState,
    decodePolicy,
    OBS_SPEC_VERSION,
    type PolicyLayer,
    policyLogits,
    type TrainedPolicy,
} from './policy.ts'

const rng = createRng(7)
/** float32 values, as every exported policy holds. */
const vector = (n: number) => Array.from({ length: n }, () => Math.fround(rng() * 2 - 1))
const matrix = (rows: number, cols: number) => Array.from({ length: rows }, () => vector(cols))
const layer = (rows: number, cols: number): PolicyLayer => ({
    weights: matrix(rows, cols),
    biases: vector(rows),
})

function b64(values: number[]): string {
    const bytes = new Uint8Array(new Float32Array(values).buffer)
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
}

const compactMatrix = (l: PolicyLayer) => ({
    rows: l.weights.length,
    cols: (l.weights[0] as number[]).length,
    weights: b64(l.weights.flat()),
    biases: b64(l.biases),
})

describe('compact policy files', () => {
    test('a base64 float32 file decodes to the same policy and the same logits along a game', () => {
        const hidden = 6
        const size = 4
        const plain: TrainedPolicy = {
            format: 'hot-potato-policy',
            version: 1,
            obs_spec_version: OBS_SPEC_VERSION,
            action_spec_version: ACTION_SPEC_VERSION,
            obs_size: OBS_SIZE,
            action_count: ACTION_COUNT,
            activation: 'tanh',
            obs_norm: {
                mean: vector(OBS_SIZE),
                var: vector(OBS_SIZE).map(v => Math.fround(v * v + 0.5)),
                eps: 1e-4,
                clip: 10,
            },
            layers: [layer(hidden, OBS_SIZE), layer(hidden, hidden)],
            gru: {
                size,
                weight_ih: matrix(3 * size, hidden),
                weight_hh: matrix(3 * size, size),
                bias_ih: vector(3 * size),
                bias_hh: vector(3 * size),
            },
            head: layer(ACTION_COUNT, hidden + size),
            trained_steps: 1,
            config: { action_repeat: 2 },
        }
        const gru = plain.gru as NonNullable<TrainedPolicy['gru']>
        const compact = {
            ...plain,
            version: 2,
            encoding: 'f32-base64',
            obs_norm: {
                mean: b64(plain.obs_norm.mean),
                var: b64(plain.obs_norm.var),
                eps: 1e-4,
                clip: 10,
            },
            layers: plain.layers.map(compactMatrix),
            gru: {
                size,
                inputs: hidden,
                weight_ih: b64(gru.weight_ih.flat()),
                weight_hh: b64(gru.weight_hh.flat()),
                bias_ih: b64(gru.bias_ih),
                bias_hh: b64(gru.bias_hh),
            },
            head: compactMatrix(plain.head as PolicyLayer),
        }
        const decoded = decodePolicy(JSON.parse(JSON.stringify(compact)))
        expect(decoded.layers).toEqual(plain.layers)
        expect(decoded.gru).toEqual(plain.gru)
        const a = createPolicyState(plain)
        const b = createPolicyState(decoded)
        for (let t = 0; t < 5; t++) {
            const obs = vector(OBS_SIZE)
            expect(policyLogits(decoded, obs, b)).toEqual(policyLogits(plain, obs, a))
        }
    })

    test('a policy whose normalisation does not fit the observation is refused', () => {
        const short = {
            format: 'hot-potato-policy',
            version: 1,
            obs_spec_version: OBS_SPEC_VERSION,
            action_spec_version: ACTION_SPEC_VERSION,
            obs_size: OBS_SIZE,
            action_count: ACTION_COUNT,
            activation: 'tanh',
            obs_norm: { mean: vector(10), var: vector(10), eps: 1e-4, clip: 10 },
            layers: [layer(ACTION_COUNT, OBS_SIZE)],
            trained_steps: 1,
            config: {},
        }
        expect(() => decodePolicy(short)).toThrow()
    })

    test('a version 1 file passes through, and a broken shape is refused', () => {
        expect(() =>
            decodePolicy({
                format: 'hot-potato-policy',
                version: 2,
                encoding: 'f32-base64',
                obs_norm: { mean: b64([0]), var: b64([1]), eps: 1e-4, clip: 10 },
                layers: [{ rows: 2, cols: 3, weights: b64([1, 2]), biases: b64([0]) }],
            })
        ).toThrow()
    })
})
