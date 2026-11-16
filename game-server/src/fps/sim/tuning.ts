import type { Tuning } from '../protocol.ts'
import type { Movement } from './movement.ts'

/** Hit boxes a little larger than the body as drawn (%): a 24 cm mini was too hard to hit. */
export const DEFAULT_HITBOX = 115

/**
 * A match's options in full: the host's over the usual, the map's own where the map has one (its
 * jetpack, whether it dodges and goes prone). Shared by the server and the browser.
 */
export function resolveTuning(move: Movement, chosen: Partial<Tuning> = {}): Tuning {
    return {
        hitbox: DEFAULT_HITBOX,
        walk: 100,
        jump: 100,
        gravity: 100,
        dash: move.dodge,
        prone: move.prone,
        jetpack: move.fuelSeconds,
        thrust: 100,
        health: 100,
        regen: true,
        damage: 100,
        headshot: 100,
        respawn: 3,
        pickups: true,
        building: true,
        ...chosen,
    }
}
