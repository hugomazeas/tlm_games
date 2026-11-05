import { describe, expect, test } from 'bun:test'
import { createRng } from '../../sim/rng.ts'
import { BUTTON, DEFAULT_LOADOUT, type InputFrame, type Loadout, type Slot, type Team } from '../protocol.ts'
import { BONUS, FIREWALL, INTERN, OVERTIME, type PickupSpot, PROMOTION } from './places.ts'
import { Arena, MAX_BURST, RESPAWN_STEPS, SHIELD_STEPS } from './arena.ts'
import { GUNS, LAUNCHER, REGEN, STAPLER } from './combat.ts'

const RIFLE = GUNS.rifle
/** Frames between two rifle shots. */
const RIFLE_EVERY = (RIFLE.intervalMs * 60) / 1000
import { type Body, bodyAt, MOVE, moveOf, stepBody } from './movement.ts'
import { testWorld } from './testing.ts'

const world = testWorld([{ name: 'middle', position: [0, 0, 0], yaw: 0 }])

function arena(): Arena {
    const a = new Arena(world, createRng(3))
    a.add('me')
    return a
}

function frames(from: number, n: number, buttons: number = 0): InputFrame[] {
    return Array.from({ length: n }, (_, i) => ({
        seq: from + i,
        forward: 1,
        strafe: (from + i) % 40 < 20 ? 0.5 : -0.5,
        yaw: (from + i) * 0.01,
        pitch: 0,
        buttons,
        view: 0,
    }))
}

describe('inputs are used as they arrive, never queued', () => {
    test('a late batch is caught up in one step, landing exactly where the browser predicted', () => {
        const a = arena()
        const start = a.self('me')!.body
        for (let i = 0; i < 10; i++) a.advance()

        const late = frames(1, 10)
        a.queue('me', late)
        a.advance()

        expect(a.ack('me')).toBe(10)
        const predicted = late.reduce((b: Body, f) => stepBody(world, b, moveOf(f)), start)
        expect(a.self('me')!.body).toEqual(predicted)
    })

    test('frames arriving one a step are used the step they arrive: nothing waits', () => {
        const a = arena()
        for (let seq = 1; seq <= 120; seq++) {
            a.queue('me', frames(seq, 1))
            a.advance()
            expect(a.ack('me')).toBe(seq)
        }
    })

    test('flooding frames moves nobody faster than real time (plus one burst)', () => {
        const a = arena()
        const start = a.self('me')!.body
        let seq = 1
        const steps = 120
        for (let i = 0; i < steps; i++) {
            a.queue('me', frames(seq, 3))
            seq += 3
            a.advance()
        }
        const end = a.self('me')!.body
        const allowed = (MOVE.walk * (steps + MAX_BURST)) / 60

        expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(allowed + 0.01)
    })

    test('a frozen tab falls instead of hanging in the air', () => {
        const a = arena()
        a.queue('me', frames(1, 40, BUTTON.jet))
        for (let i = 0; i < 40; i++) a.advance()
        const up = a.self('me')!.body.y
        expect(up).toBeGreaterThan(0.3)

        for (let i = 0; i < 20; i++) a.advance()
        expect(a.self('me')!.body.y).toBe(up)
        for (let i = 0; i < 120; i++) a.advance()
        expect(a.self('me')!.body.y).toBeLessThan(0.05)
    })

    test('a shot says what it did: nothing on a spawn shield, then the damage once it is down', () => {
        // Two spawns 4 m apart on the Z axis: whoever is at one can shoot the other.
        const pair = testWorld([
            { name: 'north', position: [0, 0, -2], yaw: Math.PI },
            { name: 'south', position: [0, 0, 2], yaw: 0 },
        ])
        const a = new Arena(pair, createRng(1))
        a.add('a')
        a.add('b')
        const me = a.self('a')!.body
        const them = a.states().find(s => s.id === 'b')!
        const dz = them.z - me.z
        // Aim at their chest.
        const aim = {
            forward: 0,
            strafe: 0,
            yaw: dz < 0 ? 0 : Math.PI,
            pitch: Math.atan2(0.2 - 0.34, Math.abs(dz)),
            buttons: BUTTON.fire | BUTTON.aim,
            view: 0,
        }
        const fire = (seq: number) => {
            a.queue('a', [{ ...aim, seq, view: a.step }])
            return a.advance().find(e => e.type === 'shot')
        }

        expect(fire(1)).toMatchObject({ hit: 'b', damage: 0 })
        let seq = 2
        for (let i = 0; i < SHIELD_STEPS; i++) {
            a.queue('a', [{ ...aim, seq: seq++, buttons: 0 }])
            a.advance()
        }
        expect(fire(seq)).toMatchObject({ hit: 'b', damage: RIFLE.damage })
        expect(a.states().find(s => s.id === 'b')!.health).toBe(100 - RIFLE.damage)
    })

    test("the rifle's cadence follows the player's frames, even caught up in one step", () => {
        const a = arena()
        for (let i = 0; i < 30; i++) a.advance()
        a.queue('me', frames(1, 28, BUTTON.fire))
        const shots = a.advance().filter(e => e.type === 'shot')

        // Frames 1, 7, 13, 19 and 25: one every 100 ms of theirs.
        expect(shots).toHaveLength(5)
        expect(a.self('me')!.ammo).toBe(RIFLE.magazine - 5)
    })
})

describe('reloading', () => {
    test('an empty magazine reloads by itself, counting down what is left, then refills', () => {
        const a = arena()
        for (let i = 0; i < 30; i++) a.advance()
        // A magazine of shots, one every RIFLE_EVERY frames, a frame a step: the last one empties it.
        const last = RIFLE.magazine * RIFLE_EVERY - (RIFLE_EVERY - 1)
        for (let i = 0; i < last; i++) {
            a.queue('me', frames(i + 1, 1, BUTTON.fire))
            a.advance()
        }

        const started = a.self('me')!
        expect(started.ammo).toBe(0)
        expect(started.reloading).toBe(true)
        expect(started.reloadLeftMs).toBeGreaterThan(RIFLE.reloadMs - 200)
        expect(started.reloadLeftMs).toBeLessThanOrEqual(RIFLE.reloadMs)

        // Half way through: about half left.
        let seq = last + 1
        const wait = (steps: number) => {
            for (let i = 0; i < steps; i++) {
                a.queue('me', frames(seq++, 1))
                a.advance()
            }
        }
        const half = (RIFLE.reloadMs * 60) / 2000
        wait(half)
        expect(a.self('me')!.reloadLeftMs).toBeCloseTo(started.reloadLeftMs! - RIFLE.reloadMs / 2, -2)

        wait(half + 4)
        const done = a.self('me')!
        expect([done.reloading, done.reloadLeftMs, done.ammo]).toEqual([false, null, RIFLE.magazine])
    })
})

/**
 * Two minis 4 m apart on the Z axis (`a` at -2 facing +Z, `b` at +2 facing -Z), pickups wherever
 * given, teams as given. `step(frames)` runs one step with each one's frame; `aimAt` fires a's
 * blaster at b's chest or head.
 */
function duel(
    pickups: PickupSpot[] = [],
    teams: [Team | null, Team | null] = [null, null],
    loadout: Loadout = DEFAULT_LOADOUT
) {
    const a = new Arena(
        testWorld(
            [
                { name: 'north', position: [0, 0, -2], yaw: Math.PI },
                { name: 'south', position: [0, 0, 2], yaw: 0 },
            ],
            [],
            pickups
        ),
        createRng(1)
    )
    a.add('a', teams[0], loadout)
    a.add('b', teams[1], loadout)
    // Name them by where they stand, whichever spawn each got.
    const north = a.self('a')!.body.z < 0 ? 'a' : 'b'
    const south = north === 'a' ? 'b' : 'a'
    const seqs: Record<string, number> = { a: 0, b: 0 }
    const frame = (id: string, f: Partial<InputFrame> = {}): InputFrame => ({
        seq: ++seqs[id]!,
        forward: 0,
        strafe: 0,
        yaw: 0,
        pitch: 0,
        buttons: 0,
        view: a.step,
        ...f,
    })
    const step = (frames: Record<string, Partial<InputFrame>> = {}) => {
        for (const id of ['a', 'b']) a.queue(id, [frame(id, frames[id])])
        return a.advance()
    }
    /**
     * North fires at south's chest (or head), aiming down the sights, from a slot. A click-a-shot
     * gun needs the trigger let go between shots: `release` sends a frame without it first.
     */
    const shoot = (head = false, slot: Slot = 'primary', release = false) => {
        const aim = { yaw: Math.PI, pitch: Math.atan2((head ? 0.36 : 0.2) - 0.34, 4), slot }
        if (release) step({ [north]: { ...aim, buttons: BUTTON.aim } })
        return step({ [north]: { ...aim, buttons: BUTTON.fire | BUTTON.aim } })
    }
    const waitShields = () => {
        for (let i = 0; i < SHIELD_STEPS + 1; i++) step()
    }

    return { a, north, south, step, shoot, waitShields }
}

describe('pickups', () => {
    const at = (kind: PickupSpot['kind'], x: number, z: number): PickupSpot => ({ kind, x, z, room: 'here' })

    test('walking onto a big magazine fills half as many rounds again for a minute, then back', () => {
        // Right where north spawns.
        const { a, north, step } = duel([at('magazine', 0, -2)])
        const events = step()
        expect(events).toContainEqual({ type: 'pickup', by: north, spot: 0 })
        expect(a.self(north)).toMatchObject({ ammo: 45, magazine: 45, otherAmmo: 12 })
        expect(a.self(north)!.buffs).toEqual([{ kind: 'magazine', leftMs: expect.any(Number) }])
        expect(a.states().find(s => s.id === north)!.buffs).toEqual(['magazine'])
        // Gone until it comes back.
        expect(a.pickups()).toEqual([false])

        // Off the pad (a metre toward +Z), so it isn't taken again when it comes back; then a minute.
        for (let i = 0; i < 30; i++) step({ [north]: { forward: 1, yaw: Math.PI } })
        for (let i = 0; i < 60 * 60; i++) step()
        expect(a.self(north)).toMatchObject({ magazine: 30, otherAmmo: 8, buffs: [] })
        expect(a.self(north)!.ammo).toBeLessThanOrEqual(30)
        expect(a.pickups()).toEqual([true])
    })

    test('a jetpack extender: four times the flight for a minute, in the body (predicted)', () => {
        const { a, north, step } = duel([at('jetpack', 0, -2)])
        step()
        const body = a.self(north)!.body
        expect(body.jetBoost).toBeGreaterThan(60 * 60 - 5)
        expect(a.self(north)!.buffs.map(b => b.kind)).toEqual(['jetpack'])
    })

    test('a health pack heals 50, but only someone hurt takes it', () => {
        // Half a metre beside south.
        const { a, south, step, shoot, waitShields } = duel([at('health', 0.5, 2)])
        waitShields()
        // Full health: south walks over it (to its right, +X, with yaw 0), it stays.
        for (let i = 0; i < 20; i++) step({ [south]: { strafe: 1 } })
        expect(a.pickups()).toEqual([true])
        for (let i = 0; i < 20; i++) step({ [south]: { strafe: -1 } })

        // Hurt by a few body shots, back over it: 50 more.
        for (let i = 0; i < 30; i++) shoot()
        const hurt = a.self(south)!.health
        expect(hurt).toBeLessThan(100)
        let took = false
        for (let i = 0; i < 40 && !took; i++) took = step({ [south]: { strafe: 1 } }).some(e => e.type === 'pickup')
        expect(took).toBe(true)
        expect(a.self(south)!.health).toBe(Math.min(100, hurt + 50))
    })

    test('headshot rounds: one headshot kills, and every power goes with you when you go down', () => {
        const { a, north, south, step, shoot, waitShields } = duel([at('headshot', 0, -2)])
        step()
        expect(a.self(north)!.buffs.map(b => b.kind)).toEqual(['headshot'])
        waitShields()

        const events = shoot(true)
        expect(events).toContainEqual(
            expect.objectContaining({ type: 'kill', killer: north, victim: south, headshot: true })
        )
        expect(a.states().find(s => s.id === south)!.alive).toBe(false)
    })
})

describe('health comes back', () => {
    const SECOND = 60
    /** North's rifle at south's chest until south is under `below`. */
    const hurtBelow = (d: ReturnType<typeof duel>, below: number) => {
        for (let i = 0; i < 200 && d.a.self(d.south)!.health >= below; i++) d.shoot()
        return d.a.self(d.south)!.health
    }

    test(`after ${REGEN.delayMs / 1000} s untouched, ${REGEN.perSecond} a second, up to ${REGEN.upTo}`, () => {
        const d = duel()
        d.waitShields()
        const hurt = hurtBelow(d, 40)
        expect(hurt).toBeLessThan(40)
        // Just short of the delay: nothing yet.
        for (let i = 0; i < (REGEN.delayMs / 1000) * SECOND - 2; i++) d.step()
        expect(d.a.self(d.south)!.health).toBe(hurt)
        // A second past it: about ten more.
        for (let i = 0; i < SECOND + 2; i++) d.step()
        expect(d.a.self(d.south)!.health).toBeGreaterThanOrEqual(hurt + REGEN.perSecond - 1)
        expect(d.a.self(d.south)!.health).toBeLessThanOrEqual(hurt + REGEN.perSecond + 1)
        // Long after: 80, never full.
        for (let i = 0; i < 10 * SECOND; i++) d.step()
        expect(d.a.self(d.south)!.health).toBe(REGEN.upTo)
        expect(d.a.states().find(s => s.id === d.south)!.health).toBe(REGEN.upTo)
    })

    test('a hit starts the wait again, and health over 80 stays where it is', () => {
        const d = duel()
        d.waitShields()
        // One rifle round: 86, over the line, so it never climbs.
        d.shoot()
        expect(d.a.self(d.south)!.health).toBe(100 - RIFLE.damage)
        for (let i = 0; i < 6 * SECOND; i++) d.step()
        expect(d.a.self(d.south)!.health).toBe(100 - RIFLE.damage)

        const hurt = hurtBelow(d, 50)
        for (let i = 0; i < 2 * SECOND; i++) d.step()
        // Hit again two seconds in: three more seconds from now before anything comes back.
        d.shoot()
        const again = d.a.self(d.south)!.health
        expect(again).toBeLessThan(hurt)
        for (let i = 0; i < (REGEN.delayMs / 1000) * SECOND - 2; i++) d.step()
        expect(d.a.self(d.south)!.health).toBe(again)
    })
})

describe('the office powers', () => {
    const at = (kind: PickupSpot['kind'], x: number, z: number): PickupSpot => ({ kind, x, z, room: 'here' })
    /** North fires (aimed) at this height on south, 4 m away. */
    const aimAt = (height: number) => ({
        yaw: Math.PI,
        pitch: Math.atan2(height - 0.34, 4),
        buttons: BUTTON.fire | BUTTON.aim,
    })
    const shotOf = (events: ReturnType<Arena['advance']>) => events.find(e => e.type === 'shot')

    test('Promotion: three times the size and 500 health, so a shot over a mini’s head finds them', () => {
        const { a, north, south, step, waitShields } = duel([at('promotion', 0, 2)])
        step()
        expect(a.self(south)).toMatchObject({ health: PROMOTION.health })
        expect(a.self(south)!.body.big).toBeGreaterThan(0)
        expect(a.states().find(s => s.id === south)!.buffs).toEqual(['promotion'])
        waitShields()
        expect(shotOf(step({ [north]: aimAt(0.7) }))).toMatchObject({ hit: south })

        // The same shot at a plain mini goes over their head.
        const plain = duel()
        plain.waitShields()
        expect(shotOf(plain.step({ [plain.north]: aimAt(0.7) }))).toMatchObject({ hit: null })
    })

    test('Firewall: the first 75 damage never reaches you, then it breaks', () => {
        const { a, north, south, step, waitShields } = duel([at('firewall', 0, 2)])
        step()
        expect(a.self(south)!.buffs).toEqual([{ kind: 'firewall', leftMs: expect.any(Number), points: FIREWALL }])
        waitShields()
        let raw = 0
        for (let i = 0; i < 60; i++) {
            const shot = shotOf(step({ [north]: aimAt(0.2) }))
            if (shot?.type === 'shot' && shot.hit === south) raw += shot.damage
        }
        expect(raw).toBeGreaterThan(FIREWALL)
        expect(a.self(south)!.health).toBe(100 - (raw - FIREWALL))
        expect(a.self(south)!.buffs).toEqual([])
    })

    test('Bonus: double damage', () => {
        const { north, step, waitShields } = duel([at('bonus', 0, -2)])
        step()
        waitShields()
        expect(shotOf(step({ [north]: aimAt(0.2) }))).toMatchObject({ damage: GUNS.rifle.damage * BONUS })
    })

    test('Overtime: 100 more health, and the magazine never runs down', () => {
        const { a, north, step, waitShields } = duel([at('overtime', 0, -2)])
        step()
        expect(a.self(north)!.health).toBe(100 + OVERTIME.health)
        waitShields()
        let fired = 0
        for (let i = 0; i < 300; i++) if (shotOf(step({ [north]: aimAt(0.2) }))) fired++
        expect(fired).toBeGreaterThan(GUNS.rifle.magazine)
        expect(a.self(north)).toMatchObject({ ammo: GUNS.rifle.magazine, reloading: false })
    })

    test('Intern: 60 health at most, and small enough that a head-height shot misses', () => {
        const { a, north, south, step, waitShields } = duel([at('intern', 0, 2)])
        step()
        expect(a.self(south)!.health).toBe(INTERN.health)
        waitShields()
        expect(shotOf(step({ [north]: aimAt(0.36) }))).toMatchObject({ hit: null })
        // Lower, on their middle, it lands.
        for (let i = 0; i < 10; i++) step()
        expect(shotOf(step({ [north]: aimAt(0.08) }))).toMatchObject({ hit: south })
    })

    test('headshot rounds still fell a Promotion in one, and every power goes with them', () => {
        const { a, north, south, step, waitShields } = duel([at('headshot', 0, -2), at('promotion', 0, 2)])
        step()
        waitShields()
        const events = step({ [north]: aimAt(1.1) })
        expect(events).toContainEqual(
            expect.objectContaining({ type: 'kill', killer: north, victim: south, headshot: true })
        )
        for (let i = 0; i < RESPAWN_STEPS + 1; i++) step()
        expect(a.self(south)).toMatchObject({ alive: true, health: 100, buffs: [] })
        expect(a.self(south)!.body.big).toBe(0)
    })
})

describe('teams and streaks', () => {
    test("teammates' shots go through each other; enemies' don't", () => {
        const same = duel([], ['red', 'red'])
        same.waitShields()
        expect(same.shoot().find(e => e.type === 'shot')).toMatchObject({ hit: null })

        const enemies = duel([], ['red', 'blue'])
        enemies.waitShields()
        expect(enemies.shoot().find(e => e.type === 'shot')).toMatchObject({ hit: enemies.south })
    })

    test('a kill says how many the killer has this life, and how many the victim had', () => {
        const { a, north, south, step, shoot, waitShields } = duel()
        waitShields()
        let kill: ReturnType<typeof step> = []
        for (let i = 0; i < 200 && kill.length === 0; i++) kill = shoot().filter(e => e.type === 'kill')
        expect(kill[0]).toMatchObject({ killer: north, victim: south, killerStreak: 1, victimStreak: 0 })

        // South back (after the respawn and its shield), and down again: north's second in a row.
        for (let i = 0; i < 3 * 60 + SHIELD_STEPS + 2; i++) step()
        kill = []
        for (let i = 0; i < 200 && kill.length === 0; i++) kill = shoot().filter(e => e.type === 'kill')
        expect(kill[0]).toMatchObject({ killerStreak: 2 })
        expect(a.states().find(s => s.id === north)!.alive).toBe(true)
    })
})

describe('the stapler', () => {
    /**
     * Two minis `gap` apart on the Z axis, facing as given (yaw π faces +Z, 0 faces -Z). The one
     * at z = 0 swings at the one further along, aiming +Z at their chest.
     */
    function standOff(nearYaw: number, farYaw: number, gap = 0.5) {
        const a = new Arena(
            testWorld([
                { name: 'near', position: [0, 0, 0], yaw: nearYaw },
                { name: 'far', position: [0, 0, gap], yaw: farYaw },
            ]),
            createRng(2)
        )
        a.add('x')
        a.add('y')
        const near = a.self('x')!.body.z < gap / 2 ? 'x' : 'y'
        const far = near === 'x' ? 'y' : 'x'
        let seq = 0
        const frame = (buttons: number, slot: Slot = 'melee'): InputFrame => ({
            seq: ++seq,
            forward: 0,
            strafe: 0,
            yaw: Math.PI,
            pitch: Math.atan2(0.2 - 0.34, gap),
            buttons,
            view: a.step,
            slot,
        })
        /** One step of the near one's frame; the events it gave. */
        const step = (buttons: number, slot?: Slot) => {
            a.queue(near, [frame(buttons, slot)])
            return a.advance()
        }
        // Stapler out, past the spawn shields.
        for (let i = 0; i < SHIELD_STEPS + 1; i++) step(0)

        return { a, near, far, step }
    }

    test('face to face: half their health a swing, two swings down, and a cooldown in between', () => {
        const { a, near, far, step } = standOff(Math.PI, 0)
        expect(step(BUTTON.fire)).toContainEqual({
            type: 'swing',
            by: near,
            hit: far,
            damage: STAPLER.damage,
            backstab: false,
        })
        expect(a.states().find(s => s.id === far)!.health).toBe(100 - STAPLER.damage)

        // Again at once: still swinging.
        expect(step(BUTTON.fire).filter(e => e.type === 'swing')).toEqual([])
        let events: ReturnType<typeof step> = []
        for (let i = 0; i < 60 && !events.some(e => e.type === 'swing'); i++) events = step(BUTTON.fire)
        expect(events).toContainEqual(
            expect.objectContaining({ type: 'kill', killer: near, victim: far, weapon: 'stapler', backstab: false })
        )
    })

    test('from behind: a backstab, down in one', () => {
        const { near, far, step } = standOff(Math.PI, Math.PI)
        const events = step(BUTTON.fire)

        expect(events).toContainEqual({ type: 'swing', by: near, hit: far, damage: STAPLER.backstab, backstab: true })
        expect(events).toContainEqual(expect.objectContaining({ type: 'kill', weapon: 'stapler', backstab: true }))
    })

    test('out of reach: a swing at the air', () => {
        const { near, step } = standOff(Math.PI, 0, 1.2)
        expect(step(BUTTON.fire)).toContainEqual({ type: 'swing', by: near, hit: null, damage: 0, backstab: false })
    })

    test('switching weapons takes a moment before the new one works', () => {
        const { a, near, step } = standOff(Math.PI, 0)
        // To the rifle and fire at once: nothing yet.
        expect(step(BUTTON.fire, 'primary').filter(e => e.type === 'shot')).toEqual([])
        expect(a.self(near)!.weapon).toBe('rifle')
        let fired = false
        let waited = 0
        for (; waited < 60 && !fired; waited++) fired = step(BUTTON.fire, 'primary').some(e => e.type === 'shot')
        expect(fired).toBe(true)
        expect(waited).toBeGreaterThan(10)
        expect(a.states().find(s => s.id === near)!.weapon).toBe('rifle')
    })
})

describe('the guns', () => {
    test('the pistol fires a shot a click: holding the trigger fires once', () => {
        const { a, north, step, shoot, waitShields } = duel()
        waitShields()
        let shots = 0
        for (let i = 0; i < 60; i++) shots += shoot(false, 'secondary').filter(e => e.type === 'shot').length
        expect(shots).toBe(1)
        // Let go and click again (past the switch and its cadence): another.
        expect(shoot(false, 'secondary', true).filter(e => e.type === 'shot')).toHaveLength(1)
        expect(a.self(north)).toMatchObject({ weapon: 'pistol', ammo: 6, magazine: 8, otherAmmo: 30 })
        void step
    })

    test('each gun keeps its own rounds when you switch', () => {
        const { a, north, shoot, waitShields } = duel()
        waitShields()
        for (let i = 0; i < 30; i++) shoot()
        const rifle = a.self(north)!.ammo
        expect(rifle).toBeLessThan(30)
        for (let i = 0; i < 30; i++) shoot(false, 'secondary', i % 2 === 0)
        expect(a.self(north)!.otherAmmo).toBe(rifle)
    })

    test('the sniper downs anyone with a headshot, and a body shot leaves them standing', () => {
        const { a, south, shoot, waitShields } = duel([], [null, null], { primary: 'sniper', secondary: 'pistol' })
        waitShields()
        let body: ReturnType<typeof shoot> = []
        for (let i = 0; i < 30 && !body.some(e => e.type === 'shot'); i++) body = shoot(false, 'primary', true)
        expect(body.find(e => e.type === 'shot')).toMatchObject({ weapon: 'sniper', damage: GUNS.sniper.damage })
        expect(a.states().find(s => s.id === south)!.alive).toBe(true)

        let head: ReturnType<typeof shoot> = []
        for (let i = 0; i < 120 && !head.some(e => e.type === 'shot'); i++) head = shoot(true, 'primary', true)
        expect(head).toContainEqual(expect.objectContaining({ type: 'kill', weapon: 'sniper', headshot: true }))
    })

    test('the victim learns how they died: the gun, the distance, the killer’s health and rounds, the hits', () => {
        const sniper = { primary: 'sniper', secondary: 'pistol' } as const
        const { a, north, south, shoot, waitShields } = duel([], [null, null], sniper)
        waitShields()
        const apart = () => {
            const [n, s] = [north, south].map(id => a.states().find(p => p.id === id)!)
            return Math.hypot(n!.x - s!.x, n!.y - s!.y, n!.z - s!.z)
        }
        // A body shot, then a headshot.
        let events: ReturnType<typeof shoot> = []
        for (let i = 0; i < 30 && !events.some(e => e.type === 'shot'); i++) events = shoot(false, 'primary', true)
        const distance = apart()
        events = []
        for (let i = 0; i < 120 && !events.some(e => e.type === 'kill'); i++) events = shoot(true, 'primary', true)
        const kill = events.find(e => e.type === 'kill')

        expect(kill).toMatchObject({ killer: north, victim: south, weapon: 'sniper' })
        const recap = (kill as Extract<typeof kill, { type: 'kill' }>).recap!
        expect(recap).toMatchObject({
            killerHealth: 100,
            ammo: GUNS.sniper.magazine - 2,
            magazine: GUNS.sniper.magazine,
            buffs: [],
            hits: 2,
            // The headshot only had 20 health left to take.
            damage: 100,
            headshots: 1,
            othersDamage: 0,
        })
        expect(recap.distance).toBeCloseTo(distance, 0)
        expect(recap.timeMs).toBeGreaterThanOrEqual(GUNS.sniper.intervalMs - 50)
    })

    test("the shotgun's pellets spread, and hurt far less from across the room than up close", () => {
        const pellets = (gap: number) => {
            const a = new Arena(
                testWorld([
                    { name: 'near', position: [0, 0, 0], yaw: Math.PI },
                    { name: 'far', position: [0, 0, gap], yaw: 0 },
                ]),
                createRng(2)
            )
            a.add('x', null, { primary: 'shotgun', secondary: 'pistol' })
            a.add('y', null, { primary: 'shotgun', secondary: 'pistol' })
            const near = a.self('x')!.body.z < gap / 2 ? 'x' : 'y'
            for (let i = 0; i < SHIELD_STEPS + 1; i++) a.advance()
            a.queue(near, [
                {
                    seq: 1,
                    forward: 0,
                    strafe: 0,
                    yaw: Math.PI,
                    pitch: Math.atan2(0.2 - 0.34, gap),
                    buttons: BUTTON.fire,
                    view: a.step,
                },
            ])
            return a.advance().find(e => e.type === 'shot')!
        }
        const close = pellets(1)
        const far = pellets(5)
        expect(close.type === 'shot' && close.to).toHaveLength(GUNS.shotgun.pellets)
        expect(close.type === 'shot' && new Set(close.to.map(t => t.join())).size).toBeGreaterThan(1)
        expect(close.damage).toBeGreaterThan(60)
        expect(far.damage).toBeLessThan(close.damage / 3)
    })

    test('a rocket flies, goes off on its target, and the blast throws them', () => {
        const { a, north, south, shoot, step, waitShields } = duel([], [null, null], {
            primary: 'rifle',
            secondary: 'launcher',
        })
        waitShields()
        const launched = shoot(false, 'secondary', true).concat(shoot(false, 'secondary', true))
        // Past the switch: it fires on a click.
        let events = launched
        for (let i = 0; i < 30 && !events.some(e => e.type === 'launch'); i++) events = shoot(false, 'secondary', true)
        expect(events).toContainEqual(expect.objectContaining({ type: 'launch', by: north }))
        expect(a.rocketStates()).toHaveLength(1)
        expect(a.self(north)!.reloading).toBe(true)

        // 4 m at 9 m/s: under half a second.
        let blast: ReturnType<typeof step> = []
        for (let i = 0; i < 40 && !blast.some(e => e.type === 'explode'); i++) blast = step()
        const boom = blast.find(e => e.type === 'explode')
        expect(boom).toMatchObject({ by: north, hits: [{ id: south, damage: expect.any(Number) }] })
        expect(a.rocketStates()).toHaveLength(0)
        const thrown = a.self(south)!.body
        expect(Math.hypot(thrown.vx, thrown.vy, thrown.vz)).toBeGreaterThan(2)
        expect(a.self(south)!.health).toBeLessThan(100 - LAUNCHER.damage / 2)
    })

    test('your own rocket at your feet hurts you less, throws you up, and counts for nobody', () => {
        const { a, north, step, waitShields } = duel([], [null, null], { primary: 'rifle', secondary: 'launcher' })
        waitShields()
        // Straight down.
        const down = { yaw: 0, pitch: -Math.PI / 2 + 0.01, slot: 'secondary' as const }
        for (let i = 0; i < 20; i++) step({ [north]: { ...down, buttons: 0 } })
        const events = step({ [north]: { ...down, buttons: BUTTON.fire } })
        const all = events.concat(step(), step(), step())
        const boom = all.find(e => e.type === 'explode')
        expect(boom).toMatchObject({ by: north, hits: [{ id: north }] })
        const me = a.self(north)!
        expect(me.health).toBeGreaterThan(100 - LAUNCHER.damage * LAUNCHER.selfFactor - 1)
        expect(me.health).toBeLessThan(100)
        expect(me.body.vy).toBeGreaterThan(1)
    })

    test('a new loadout waits for the next spawn, unless you have only just spawned', () => {
        const { a, north, step } = duel()
        a.setLoadout(north, { primary: 'shotgun', secondary: 'launcher' })
        expect(a.self(north)).toMatchObject({ weapon: 'shotgun', loadout: { primary: 'shotgun' } })

        for (let i = 0; i < SHIELD_STEPS + 1; i++) step()
        a.setLoadout(north, { primary: 'sniper', secondary: 'pistol' })
        expect(a.self(north)).toMatchObject({
            weapon: 'shotgun',
            nextLoadout: { primary: 'sniper', secondary: 'pistol' },
        })
    })
})
