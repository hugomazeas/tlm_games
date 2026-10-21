/**
 * A trained policy exported by the training tools (`trainer/export.py`, format "hot-potato-policy"):
 * observation normalisation and the actor's dense layers. The decision is
 *
 *   action = argmax( W_n · tanh( … tanh( W_1 · clip((obs − mean) / sqrt(var + eps), ±clip) + b_1 ) … ) + b_n )
 *
 * `weights[i]` is row-major `[out][in]`.
 *
 * A policy with a memory (`gru`) has only hidden layers in `layers` (all tanh): a GRU cell reads their
 * output and updates a state kept from one decision to the next (`createPolicyState`, zero at the
 * start of a game), and `head` maps [their output, the new state] to the logits.
 */
import type { Input } from '../sim/game.ts'
import { OBS_SIZE } from './observation.ts'

export const ACTION_COUNT = 17
/** Observation layout and action table this code implements; a policy for another layout is refused. */
export const OBS_SPEC_VERSION = 6
export const ACTION_SPEC_VERSION = 1

export interface PolicyLayer {
    weights: number[][]
    biases: number[]
}

/** A GRU cell as PyTorch stores it: gates stacked [reset, update, new], each `size` rows. */
export interface PolicyGru {
    size: number
    weight_ih: number[][]
    weight_hh: number[][]
    bias_ih: number[]
    bias_hh: number[]
}

export interface TrainedPolicy {
    format: 'hot-potato-policy'
    version: number
    obs_spec_version: number
    action_spec_version: number
    obs_size: number
    action_count: number
    activation: 'tanh'
    obs_norm: { mean: number[]; var: number[]; eps: number; clip: number }
    layers: PolicyLayer[]
    /** Memory: the GRU after `layers`, and the output layer that reads [layers' output, GRU state]. */
    gru?: PolicyGru
    head?: PolicyLayer
    trained_steps: number
    config: {
        action_repeat?: number
        num_players?: number
        /**
         * Play-time smoothing, not learned: a new action must beat the previous one's logit by this much
         * to replace it (see `stickyAction`). 0 or absent: plain argmax, as in training evaluations.
         */
        stickiness?: number
        [key: string]: unknown
    }
}

/**
 * The compact file format (`version: 2`, `encoding: "f32-base64"`, written by `trainer.export --compact`): the
 * same policy with every vector and matrix stored as base64 of little-endian float32, row-major. About a third
 * of the size of the JSON number arrays, and the same float32 values.
 */
interface CompactMatrix {
    rows: number
    cols: number
    weights: string
    biases: string
}

function decodeF32(text: string): Float32Array {
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0))
    if (bytes.length % 4 !== 0) throw new Error(`${bytes.length} bytes is not a float32 vector`)
    const view = new DataView(bytes.buffer)
    const out = new Float32Array(bytes.length / 4)
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true)
    return out
}

function decodeMatrix({ rows, cols, weights, biases }: CompactMatrix): PolicyLayer {
    const w = decodeF32(weights)
    if (w.length !== rows * cols) throw new Error(`Matrix of ${w.length} values, expected ${rows} x ${cols}`)
    return {
        weights: Array.from({ length: rows }, (_, r) => Array.from(w.subarray(r * cols, (r + 1) * cols))),
        biases: Array.from(decodeF32(biases)),
    }
}

/** A policy file as read from JSON, either format, ready for `setTrainedPolicy` (checked). */
export function decodePolicy(raw: unknown): TrainedPolicy {
    const file = raw as Record<string, unknown> & {
        version: number
        encoding?: string
    }
    if (file.version !== 2) {
        checkPolicy(file as unknown as TrainedPolicy)
        return file as unknown as TrainedPolicy
    }
    if (file.encoding !== 'f32-base64') throw new Error(`Unknown policy encoding ${String(file.encoding)}`)
    const norm = file.obs_norm as {
        mean: string
        var: string
        eps: number
        clip: number
    }
    const gru = file.gru as
        | (Omit<PolicyGru, 'weight_ih' | 'weight_hh' | 'bias_ih' | 'bias_hh'> & {
              inputs: number
              weight_ih: string
              weight_hh: string
              bias_ih: string
              bias_hh: string
          })
        | undefined
    const policy = {
        ...file,
        obs_norm: {
            mean: Array.from(decodeF32(norm.mean)),
            var: Array.from(decodeF32(norm.var)),
            eps: norm.eps,
            clip: norm.clip,
        },
        layers: (file.layers as CompactMatrix[]).map(decodeMatrix),
        ...(gru
            ? {
                  gru: (() => {
                      const ih = decodeMatrix({
                          rows: gru.size * 3,
                          cols: gru.inputs,
                          weights: gru.weight_ih,
                          biases: gru.bias_ih,
                      })
                      const hh = decodeMatrix({
                          rows: gru.size * 3,
                          cols: gru.size,
                          weights: gru.weight_hh,
                          biases: gru.bias_hh,
                      })
                      return {
                          size: gru.size,
                          weight_ih: ih.weights,
                          bias_ih: ih.biases,
                          weight_hh: hh.weights,
                          bias_hh: hh.biases,
                      }
                  })(),
                  head: decodeMatrix(file.head as CompactMatrix),
              }
            : {}),
    } as unknown as TrainedPolicy
    checkPolicy(policy)
    return policy
}

/** Throws when the policy does not fit this observation layout and action table. */
export function checkPolicy(policy: TrainedPolicy): void {
    if (policy.format !== 'hot-potato-policy') throw new Error(`Unknown policy format ${String(policy.format)}`)
    if (
        policy.obs_spec_version !== OBS_SPEC_VERSION ||
        policy.action_spec_version !== ACTION_SPEC_VERSION ||
        policy.obs_size !== OBS_SIZE ||
        policy.action_count !== ACTION_COUNT
    )
        throw new Error(
            `Policy layout v${policy.obs_spec_version}/${policy.obs_size} inputs/${policy.action_count} actions ` +
                `does not match v${OBS_SPEC_VERSION}/${OBS_SIZE}/${ACTION_COUNT}`
        )
    const { mean, var: variance, eps, clip } = policy.obs_norm
    if (mean.length !== OBS_SIZE || variance.length !== OBS_SIZE)
        throw new Error(`Observation normalisation of ${mean.length}/${variance.length} values, expected ${OBS_SIZE}`)
    if (![eps, clip].every(Number.isFinite) || ![...mean, ...variance].every(Number.isFinite))
        throw new Error('Observation normalisation is not finite')
    let width = OBS_SIZE
    const checkLayer = (name: string, layer: PolicyLayer, inputs: number) => {
        if (layer.weights.length !== layer.biases.length)
            throw new Error(`${name}: ${layer.weights.length} rows, ${layer.biases.length} biases`)
        if (layer.weights.some(row => row.length !== inputs))
            throw new Error(`${name}: expected ${inputs} inputs per row`)
        return layer.biases.length
    }
    for (const [i, layer] of policy.layers.entries()) width = checkLayer(`Layer ${i}`, layer, width)
    if (policy.gru || policy.head) {
        const { gru, head } = policy
        if (!gru || !head) throw new Error('A memory needs both gru and head')
        const rows = gru.size * 3
        checkLayer('GRU input', { weights: gru.weight_ih, biases: gru.bias_ih }, width)
        checkLayer('GRU state', { weights: gru.weight_hh, biases: gru.bias_hh }, gru.size)
        if (gru.weight_ih.length !== rows || gru.weight_hh.length !== rows)
            throw new Error(`GRU: expected ${rows} rows`)
        width = checkLayer('Head', head, width + gru.size)
    }
    if (width !== ACTION_COUNT) throw new Error(`Last layer has ${width} outputs, expected ${ACTION_COUNT}`)
}

/** A policy's memory at the start of a game: zeros, or null for a policy without one. */
export function createPolicyState(policy: TrainedPolicy): Float64Array | null {
    return policy.gru ? new Float64Array(policy.gru.size) : null
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/**
 * Action logits for one observation (float64, like the reference forward pass of the training tools).
 * A policy with a memory reads and updates `state` (one per seat and game); without one, it plays
 * from a zero state that is not kept.
 */
export function policyLogits(
    policy: TrainedPolicy,
    obs: readonly number[],
    state: Float64Array | null = null
): number[] {
    const { mean, var: variance, eps, clip } = policy.obs_norm
    let x = obs.map((value, i) =>
        Math.max(-clip, Math.min(clip, (value - (mean[i] as number)) / Math.sqrt((variance[i] as number) + eps)))
    )
    const { gru, head } = policy
    const last = gru ? policy.layers.length : policy.layers.length - 1
    for (const [index, layer] of policy.layers.entries()) {
        const out = dense(layer, x)
        x = index < last ? out.map(Math.tanh) : out
    }
    if (!gru || !head) return x
    const h = state ?? new Float64Array(gru.size)
    const gi = denseFlat(flat(gru.weight_ih, gru.bias_ih), x)
    const gh = denseFlat(flat(gru.weight_hh, gru.bias_hh), h)
    const n = gru.size
    const next = new Float64Array(n)
    for (let k = 0; k < n; k++) {
        const r = sigmoid((gi[k] as number) + (gh[k] as number))
        const z = sigmoid((gi[n + k] as number) + (gh[n + k] as number))
        const c = Math.tanh((gi[2 * n + k] as number) + r * (gh[2 * n + k] as number))
        next[k] = (1 - z) * c + z * (h[k] as number)
    }
    h.set(next)
    return dense(head, [...x, ...next])
}

/**
 * A layer's weights copied once into one flat typed array (a GRU policy's decision runs about a million
 * multiply-adds). Float32 storage is exact: exported weights are float32 values; the sums stay float64.
 */
interface FlatLayer {
    w: Float32Array
    /** The layer's own bias array, read at each call (cheap, and edits to it take effect). */
    b: number[]
    rows: number
    cols: number
}
const flatCache = new WeakMap<number[][], Omit<FlatLayer, 'b'>>()

function flat(weights: number[][], biases: number[]): FlatLayer {
    let w = flatCache.get(weights)
    if (!w) {
        const rows = weights.length
        const cols = (weights[0] as number[]).length
        const values = new Float32Array(rows * cols)
        for (let r = 0; r < rows; r++) values.set(weights[r] as number[], r * cols)
        w = { w: values, rows, cols }
        flatCache.set(weights, w)
    }
    return { ...w, b: biases }
}

/** W · x + b, row-major `[out][in]` weights. */
function dense(layer: PolicyLayer, x: ArrayLike<number>): number[] {
    return denseFlat(flat(layer.weights, layer.biases), x)
}

/** Summed in the same order as the reference forward pass. */
function denseFlat({ w, b, rows, cols }: FlatLayer, x: ArrayLike<number>): number[] {
    const out = new Array<number>(rows)
    for (let o = 0; o < rows; o++) {
        let sum = b[o] as number
        const base = o * cols
        for (let i = 0; i < cols; i++) sum += (w[base + i] as number) * (x[i] as number)
        out[o] = sum
    }
    return out
}

/** The highest logit; the lowest index wins a tie (as numpy's argmax). */
export function bestAction(logits: readonly number[]): number {
    let best = 0
    for (let i = 1; i < logits.length; i++) if ((logits[i] as number) > (logits[best] as number)) best = i
    return best
}

/**
 * The argmax, unless the previous action's logit is within `margin` of it: then the previous action
 * stays. Near-ties between two headings otherwise flip the steering every decision.
 */
export function stickyAction(logits: readonly number[], previous: number | null, margin: number): number {
    const best = bestAction(logits)
    if (previous === null || margin <= 0 || previous === best) return best
    return (logits[previous] as number) >= (logits[best] as number) - margin ? previous : best
}

/** Action 0 stops; actions 1..16 are unit headings, 1 = right, 5 = down, 9 = left, 13 = up. */
export function actionInput(action: number): Input {
    if (action === 0) return { dx: 0, dy: 0 }
    const angle = ((action - 1) / 16) * Math.PI * 2
    return { dx: Math.cos(angle), dy: Math.sin(angle) }
}
