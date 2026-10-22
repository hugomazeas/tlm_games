import { closestOnSegment, type DriveWorld, type Surface, wrapAngle } from './world.ts'

/**
 * Arcade kart physics, Mario Kart style: grippy, forgiving, a drift that
 * charges a mini-turbo, and a long pull to top speed that only a big
 * straight (or a boost) gets you to. Pure: the same state, input and world
 * always give the same next state, stepped at a fixed rate.
 *
 * Heading follows the viewer's camera: 0 faces north (−z), turning left
 * makes it bigger; forward is (−sin h, −cos h).
 */

export const STEP = 1 / 60

/** What the player is pressing: throttle and steer from −1 to 1 (steer left positive), drift held or not. */
export interface KartInput {
    throttle: number
    steer: number
    drift: boolean
    /** Fire the nitro (E): does nothing until it has charged. */
    nitro?: boolean
}

export interface KartState {
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    heading: number
    /** In the air: the ground fell away faster than gravity could follow. */
    airborne: boolean
    /** Which way a drift is turning (1 left, −1 right), 0 when not drifting. */
    drift: number
    /** Seconds of drift charged so far. */
    charge: number
    /** Seconds of boost left. */
    boost: number
    /** Seconds before a pad can boost again. */
    padCooldown: number
    /** Seconds spent in water; long enough puts you back on a road. */
    sinking: number
    surface: Surface
    /** Seconds of nitro charged, up to NITRO_CHARGE: then it can fire. */
    nitro: number
    /** Seconds left of a fired nitro: until then every speed limit (a boost's too) is NITRO_KICK higher. */
    surge: number
}

/**
 * The nitro charges over this many seconds, then E adds NITRO_KICK (20 km/h)
 * to your speed and lifts the limit by as much for SURGE seconds. It stacks
 * with a drift or pad boost: 170 + 20, about 190 km/h.
 */
export const NITRO_CHARGE = 15
export const NITRO_KICK = 20 / 3.6
const SURGE = 2.5
/** However slow snacks make you, you can still do 11 km/h. */
const MIN_LIMIT = 3
/** A frozen kart (someone's Drumsticks) loses speed this fast, per second. */
const FREEZE_STOP = 6

/** Engine pull from a standstill, m/s²; it falls off as speed rises, never below CRUISE_ACCEL. */
const ACCEL = 9
const ACCEL_FALLOFF = 1.5
const CRUISE_ACCEL = 0.7
/**
 * The map is real size, and a real 150 km/h seen from a chase camera feels
 * slow. So karts cover the ground PACE times faster than their speed says,
 * and turn PACE times faster too (same lines through a bend, taken sooner):
 * speeds, the speedometer and the feel tests stay in "kart" km/h, distances
 * and the server's speed checks are in real metres.
 */
export const PACE = 1.5
/** 150 km/h. */
export const TOP_SPEED = 41.67
/** A boost may take you past top speed, up to 170 km/h. */
export const BOOST_SPEED = 47.2
const BOOST_ACCEL = 14
/** Grass and parks hold you under 65 km/h; water barely lets you move. */
export const OFFROAD_SPEED = 18
const WATER_SPEED = 5
/** How hard you slow down when over the surface's limit. */
const OVER_LIMIT_DECEL = 14
const BRAKE = 22
const REVERSE_ACCEL = 6
const REVERSE_SPEED = 9
const COAST_DECEL = 2.5

/** Turning rate at low speed, rad/s; it eases off as speed builds. */
const TURN_RATE = 2.6
const TURN_FULL_AT = 5
const TURN_FALLOFF = 30
/** How fast sideways sliding dies out, per second. */
const GRIP = 10
const OFFROAD_GRIP = 7
const DRIFT_GRIP = 2.4
/** In the air you keep a little steering. */
const AIR_STEER = 0.3

/** Drifts start above this speed and end below the lower one. */
const DRIFT_START_SPEED = 10
const DRIFT_END_SPEED = 6
/** Steering harder than this picks a drift's direction. */
const DRIFT_STEER = 0.3
/** A drift turns between these fractions of the full turning rate: steering out widens it, in tightens it. */
const DRIFT_TURN_WIDE = 0.45
const DRIFT_TURN_TIGHT = 1.0
/** Seconds of charge for a mini-turbo, and for a super one; and how long each boosts. */
export const MINI_TURBO = 1
export const SUPER_TURBO = 2.2
const MINI_BOOST = 0.7
const SUPER_BOOST = 1.4
const PAD_BOOST = 1.2
const PAD_COOLDOWN = 0.5
const SINK_RESET = 1

/** Gravity, a little stronger than Earth's so jumps land crisply. */
const GRAVITY = 16
/** How much of a slope's pull you feel going up or down hill. */
const SLOPE_PULL = 0.6
/** Within this height of the ground you still drive; tiny hops over the terrain's seams don't cut the engine. */
const CONTACT = 0.3

/** The kart's footprint for collisions. */
export const KART_RADIUS = 1.1
const KART_HEIGHT = 1.5
const RESTITUTION = 0.35
/** On a hard hit, how much of the speed along the wall you keep. */
const SCRAPE = 0.8
/** A hit harder than this, m/s into the wall, loses the drift. */
const HARD_HIT = 6
const COLLISION_PASSES = 3

export function createKart(world: DriveWorld, x: number, z: number, heading: number): KartState {
    return {
        x,
        y: world.ground(x, z),
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        heading: wrapAngle(heading),
        airborne: false,
        drift: 0,
        charge: 0,
        boost: 0,
        padCooldown: 0,
        sinking: 0,
        surface: world.surface(x, z),
        nitro: 0,
        surge: 0,
    }
}

/** Puts the kart back, stopped, on the nearest road, facing along it; where it is if there's none in reach. */
export function resetKart(world: DriveWorld, kart: KartState): KartState {
    const road = world.nearestRoad(kart.x, kart.z, kart.heading)

    return road ? createKart(world, road.x, road.z, road.heading) : createKart(world, kart.x, kart.z, kart.heading)
}

/** Speed along the way the kart faces, m/s; negative when reversing. */
export function forwardSpeed(kart: KartState): number {
    return -Math.sin(kart.heading) * kart.vx - Math.cos(kart.heading) * kart.vz
}

/** What snacks (snacks.ts) do to the physics for a step. All optional: none, no change. */
export interface KartMods {
    /** Added to every speed limit, m/s (negative: slower). */
    limit?: number
    /** Extra pull while under the limit, m/s². */
    accel?: number
    /** Grass and parks count as road (limit and grip). */
    offroadAsRoad?: boolean
    /** How fast the nitro charges, 1 normally. */
    nitroRate?: number
    /** Times the tyres' grip (frost under 1). */
    grip?: number
    /** No control, and the kart grinds to a halt. */
    frozen?: boolean
}

/**
 * The kart one STEP later. `grip` scales the tyres' sideways grip: under 1 on
 * wet or snowy roads; `mods` are the snacks' effects.
 */
export function stepKart(
    world: DriveWorld,
    previous: KartState,
    input: KartInput,
    weatherGrip = 1,
    mods: KartMods = {}
): KartState {
    const kart = { ...previous }
    const dt = STEP
    const frozen = mods.frozen === true
    if (frozen) input = { throttle: 0, steer: 0, drift: false }
    const grip = weatherGrip * (mods.grip ?? 1)
    const throttle = clamp(input.throttle, -1, 1)
    const steer = clamp(input.steer, -1, 1)
    const touching = !kart.airborne || kart.y - world.ground(kart.x, kart.z) < CONTACT
    kart.surface = world.surface(kart.x, kart.z)

    let forwardX = -Math.sin(kart.heading)
    let forwardZ = -Math.cos(kart.heading)
    let speed = kart.vx * forwardX + kart.vz * forwardZ
    let sideways = kart.vx * -forwardZ + kart.vz * forwardX

    // Drifting: held with a direction picked, it charges; let go and the charge becomes a boost.
    if (kart.drift === 0 && input.drift && touching && speed > DRIFT_START_SPEED && Math.abs(steer) > DRIFT_STEER) {
        kart.drift = Math.sign(steer)
        kart.charge = 0
    } else if (kart.drift !== 0 && (!input.drift || speed < DRIFT_END_SPEED)) {
        if (input.drift === false && kart.charge >= SUPER_TURBO) kart.boost = Math.max(kart.boost, SUPER_BOOST)
        else if (input.drift === false && kart.charge >= MINI_TURBO) kart.boost = Math.max(kart.boost, MINI_BOOST)
        kart.drift = 0
        kart.charge = 0
    }

    // Turning: never on the spot, gentler at speed, reversed when backing up.
    const turn = (TURN_RATE * Math.min(1, Math.abs(speed) / TURN_FULL_AT)) / (1 + Math.abs(speed) / TURN_FALLOFF)
    let yaw: number
    if (kart.drift !== 0) {
        const into = clamp(steer * kart.drift, -1, 1)
        yaw = kart.drift * turn * (DRIFT_TURN_WIDE + ((DRIFT_TURN_TIGHT - DRIFT_TURN_WIDE) * (into + 1)) / 2)
        if (touching) kart.charge += dt * (0.6 + 0.6 * Math.max(0, into))
    } else {
        yaw = steer * turn * Math.sign(speed || 1)
    }
    kart.heading = wrapAngle(kart.heading + yaw * dt * PACE * (touching ? 1 : AIR_STEER))
    forwardX = -Math.sin(kart.heading)
    forwardZ = -Math.cos(kart.heading)
    if (grip < 1 && touching) {
        // Slippery: the kart turns, but its momentum only partly follows, so it slides wide.
        const slip = 1 - grip
        speed += (kart.vx * forwardX + kart.vz * forwardZ - speed) * slip
        sideways += (kart.vx * -forwardZ + kart.vz * forwardX - sideways) * slip
    }

    kart.nitro = Math.min(NITRO_CHARGE, kart.nitro + dt * (mods.nitroRate ?? 1))
    kart.surge = Math.max(0, kart.surge - dt)
    // A TrailMix makes the grass as good as road.
    const surface = mods.offroadAsRoad && kart.surface === 'offroad' ? 'road' : kart.surface
    if (touching) {
        const base =
            kart.boost > 0
                ? BOOST_SPEED
                : surface === 'water'
                  ? WATER_SPEED
                  : surface === 'offroad'
                    ? OFFROAD_SPEED
                    : TOP_SPEED
        // Nitro: 20 km/h on top of whatever you're doing, and every limit 20 higher while it lasts, so
        // it stacks with a boost (on the grass too, but only 20 over the grass's limit).
        if (input.nitro && kart.nitro >= NITRO_CHARGE) {
            speed = Math.max(0, speed) + NITRO_KICK
            kart.surge = SURGE
            kart.nitro = 0
        }
        const limit = Math.max(MIN_LIMIT, base + (kart.surge > 0 ? NITRO_KICK : 0) + (mods.limit ?? 0))
        let accel = 0
        if (throttle > 0 && speed > -0.5) {
            const pull = Math.max(ACCEL * Math.pow(Math.max(0, 1 - speed / TOP_SPEED), ACCEL_FALLOFF), CRUISE_ACCEL)
            accel = speed < limit ? pull * throttle : 0
        } else if (throttle > 0) {
            accel = BRAKE * throttle
        } else if (throttle < 0 && speed > 0.5) {
            accel = BRAKE * throttle
        } else if (throttle < 0) {
            accel = speed > -REVERSE_SPEED ? REVERSE_ACCEL * throttle : 0
        } else {
            accel = -Math.sign(speed) * Math.min(COAST_DECEL, Math.abs(speed) / dt)
        }
        if (kart.boost > 0) accel += BOOST_ACCEL
        if (throttle > 0 && speed < limit) accel += mods.accel ?? 0
        if (speed > limit) accel = Math.min(accel, -OVER_LIMIT_DECEL)

        // Downhill speeds you up, uphill slows you down.
        const ahead =
            world.ground(kart.x + forwardX, kart.z + forwardZ) - world.ground(kart.x - forwardX, kart.z - forwardZ)
        accel -= GRAVITY * SLOPE_PULL * Math.sin(Math.atan(ahead / 2))

        // Speeding up stops at the limit (reverse has its own); slowing down from over it stops there too.
        const next = speed + accel * dt
        const floor = throttle < 0 ? Math.min(speed, -REVERSE_SPEED) : -Infinity
        speed = Math.max(floor, speed <= limit ? Math.min(next, Math.max(speed, limit)) : Math.max(next, limit))
        if (frozen) speed *= Math.exp(-FREEZE_STOP * dt)
        const tyres = kart.drift !== 0 ? DRIFT_GRIP : surface === 'road' ? GRIP : OFFROAD_GRIP
        sideways *= Math.exp(-tyres * grip * dt)
    }
    kart.vx = forwardX * speed - forwardZ * sideways
    kart.vz = forwardZ * speed + forwardX * sideways

    kart.x += kart.vx * dt * PACE
    kart.z += kart.vz * dt * PACE
    collide(world, kart)

    // Up and down: follow the ground while it curves less sharply than gravity pulls, else fly.
    const ground = world.ground(kart.x, kart.z)
    if (kart.airborne) {
        kart.vy -= GRAVITY * dt
        kart.y += kart.vy * dt
        if (kart.y <= ground) {
            // Land moving with the ground, or a downhill landing bounces straight back off it.
            kart.y = ground
            kart.vy = (world.ground(kart.x + kart.vx * dt * PACE, kart.z + kart.vz * dt * PACE) - ground) / dt
            kart.airborne = false
        }
    } else {
        const followVy = (ground - kart.y) / dt
        if ((followVy - kart.vy) / dt < -GRAVITY) {
            kart.vy -= GRAVITY * dt
            kart.y += kart.vy * dt
            kart.airborne = kart.y > ground
            if (!kart.airborne) kart.y = ground
        } else {
            kart.vy = followVy
            kart.y = ground
        }
    }

    kart.boost = Math.max(0, kart.boost - dt)
    kart.padCooldown = Math.max(0, kart.padCooldown - dt)
    const onGround = kart.y - ground < CONTACT
    if (onGround && kart.padCooldown === 0 && world.padAt(kart.x, kart.z)) {
        kart.boost = Math.max(kart.boost, PAD_BOOST)
        kart.padCooldown = PAD_COOLDOWN
    }

    kart.sinking = kart.surface === 'water' && onGround ? kart.sinking + dt : 0
    if (kart.sinking >= SINK_RESET) return resetKart(world, kart)

    return kart
}

/**
 * Pushes the kart out of anything solid it overlaps and bounces it off:
 * the speed into the wall comes back weaker, and a hard hit also scrapes off
 * some of the speed along it and loses the drift.
 */
function collide(world: DriveWorld, kart: KartState): void {
    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
        let deepest = 0
        let normalX = 0
        let normalZ = 0
        for (const collider of world.collidersNear(kart.x, kart.z, KART_RADIUS + 2)) {
            if (kart.y + KART_HEIGHT <= collider.bottom || kart.y >= collider.top) continue
            const [px, pz] = closestOnSegment(collider, kart.x, kart.z)
            let dx = kart.x - px
            let dz = kart.z - pz
            let distance = Math.hypot(dx, dz)
            const overlap = KART_RADIUS + collider.radius - distance
            if (overlap <= deepest) continue
            if (distance < 1e-6) {
                // Right on the line: push out sideways from the segment.
                const length = Math.hypot(collider.x2 - collider.x1, collider.z2 - collider.z1) || 1
                dx = -(collider.z2 - collider.z1) / length
                dz = (collider.x2 - collider.x1) / length
                distance = 1
            }
            deepest = overlap
            normalX = dx / distance
            normalZ = dz / distance
        }
        if (deepest <= 0) return

        kart.x += normalX * deepest
        kart.z += normalZ * deepest
        const into = kart.vx * normalX + kart.vz * normalZ
        if (into >= 0) continue
        kart.vx -= (1 + RESTITUTION) * into * normalX
        kart.vz -= (1 + RESTITUTION) * into * normalZ
        if (-into > HARD_HIT) {
            kart.vx *= SCRAPE
            kart.vz *= SCRAPE
            kart.drift = 0
            kart.charge = 0
        }
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
