/**
 * A policy trained by self-play (PPO) on this same simulation, exported to JSON (format "hot-potato-policy"):
 * observation normalisation and the actor's dense layers. The decision is
 *
 *   action = argmax( W_n · tanh( … tanh( W_1 · clip((obs − mean) / sqrt(var + eps), ±clip) + b_1 ) … ) + b_n )
 *
 * `weights[i]` is row-major `[out][in]`.
 */
import type { Input } from '../sim/game.ts'
import { OBS_SIZE } from './observation.ts'

export const ACTION_COUNT = 17
/** Observation layout and action table this code implements; a policy for another layout is refused. */
export const OBS_SPEC_VERSION = 2
export const ACTION_SPEC_VERSION = 1

export interface PolicyLayer {
    weights: number[][]
    biases: number[]
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
    trained_steps: number
    config: {
        action_repeat?: number
        num_players?: number
        [key: string]: unknown
    }
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
    let width = OBS_SIZE
    for (const [i, layer] of policy.layers.entries()) {
        if (layer.weights.length !== layer.biases.length)
            throw new Error(`Layer ${i}: ${layer.weights.length} rows, ${layer.biases.length} biases`)
        if (layer.weights.some(row => row.length !== width))
            throw new Error(`Layer ${i}: expected ${width} inputs per row`)
        width = layer.biases.length
    }
    if (width !== ACTION_COUNT) throw new Error(`Last layer has ${width} outputs, expected ${ACTION_COUNT}`)
}

/** Action logits for one observation (float64, like the reference forward pass of the training tools). */
export function policyLogits(policy: TrainedPolicy, obs: readonly number[]): number[] {
    const { mean, var: variance, eps, clip } = policy.obs_norm
    let x = obs.map((value, i) =>
        Math.max(-clip, Math.min(clip, (value - (mean[i] as number)) / Math.sqrt((variance[i] as number) + eps)))
    )
    const last = policy.layers.length - 1
    for (const [index, layer] of policy.layers.entries()) {
        const next = new Array<number>(layer.biases.length)
        for (let o = 0; o < next.length; o++) {
            const row = layer.weights[o] as number[]
            let sum = layer.biases[o] as number
            for (let i = 0; i < row.length; i++) sum += (row[i] as number) * (x[i] as number)
            next[o] = index < last ? Math.tanh(sum) : sum
        }
        x = next
    }
    return x
}

/** The highest logit; the lowest index wins a tie (as numpy's argmax). */
export function bestAction(logits: readonly number[]): number {
    let best = 0
    for (let i = 1; i < logits.length; i++) if ((logits[i] as number) > (logits[best] as number)) best = i
    return best
}

/** Action 0 stops; actions 1..16 are unit headings, 1 = right, 5 = down, 9 = left, 13 = up. */
export function actionInput(action: number): Input {
    if (action === 0) return { dx: 0, dy: 0 }
    const angle = ((action - 1) / 16) * Math.PI * 2
    return { dx: Math.cos(angle), dy: Math.sin(angle) }
}
