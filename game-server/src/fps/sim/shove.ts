/**
 * Shove's numbers, pure: no health, a damage % that makes every hit throw you further, and the
 * tools that push (a leaf blower's steady stream, a fire extinguisher's blast that kicks you back
 * too, a bat you wind up). The arena applies them; the tests pin them.
 */

export const SHOVE = {
    /** Each % adds this much to a hit's throw (at 100% a hit throws twice as hard, at 200% three times). */
    growth: 0.01,
    /** The % a mini can reach (the display's limit). */
    maxPercent: 999,
    /** A throw keeps your steering weak for its speed × this many steps, up to `stunMax` (you can still jet and dodge). */
    stunPerSpeed: 6,
    stunMax: 50,
    /** Throws this weak don't stun at all (the blower's nudges). */
    stunFrom: 1.5,
    blower: {
        /** Its stream reaches this far (m) in this cone (half angle, rad). */
        range: 1.6,
        cone: 0.42,
        /** How hard it pushes at 0% (m/s²): a steady walk to the ledge. */
        push: 7,
        /** % a second on whoever is in the stream. */
        percentPerSecond: 4,
        /** Aimed down in the air: it holds you up (m/s², against gravity's 9.8). */
        hover: 7.5,
    },
    extinguisher: {
        range: 1.8,
        cone: 0.5,
        /** Its throw at 0% (m/s), and the % it adds. */
        knock: 3.2,
        percent: 9,
        /** Its kick on you (m/s), against where you aim: the way back to the deck (standing, this share of it). */
        recoil: 4.5,
        groundRecoil: 0.4,
        cooldownMs: 1100,
    },
    bat: {
        reach: 0.55,
        /** Held this long it's fully wound up. */
        chargeMs: 900,
        /** % added and throw (m/s) from no wind-up to a full one. */
        percent: [6, 18] as const,
        knock: [2.4, 6.2] as const,
        /** Between swings. */
        intervalMs: 450,
    },
    /** A little lift on every throw, so it carries over the deck rather than along it. */
    lift: 0.45,
    /** Mid-match gusts on Cloud Nine: every `everyMs`, a warning, then `forMs` of wind at `speed` m/s. */
    gust: { everyMs: 40_000, firstMs: 25_000, warnMs: 3_000, forMs: 4_000, speed: 1.5 },
} as const

/** How hard a hit throws someone at `percent` (m/s), from its throw at 0%, by how heavy they are. */
export function knockOf(base: number, percent: number, weight = 1): number {
    return (base * (1 + percent * SHOVE.growth)) / weight
}

/** Steps a throw this fast keeps your steering weak. */
export function stunOf(speed: number): number {
    if (speed < SHOVE.stunFrom) return 0
    return Math.min(SHOVE.stunMax, Math.round(speed * SHOVE.stunPerSpeed))
}

/** The bat's % and throw for a wind-up of `charge` (0–1). */
export function batHit(charge: number): { percent: number; knock: number } {
    const c = Math.max(0, Math.min(1, charge))
    const [p0, p1] = SHOVE.bat.percent
    const [k0, k1] = SHOVE.bat.knock
    return { percent: Math.round(p0 + (p1 - p0) * c), knock: k0 + (k1 - k0) * c }
}

/** Is a point `dx, dy, dz` from the nozzle, along the unit aim `ax, ay, az`, in a cone of `range` and `half` angle? */
export function inCone(
    dx: number,
    dy: number,
    dz: number,
    ax: number,
    ay: number,
    az: number,
    range: number,
    half: number
): boolean {
    const distance = Math.hypot(dx, dy, dz)
    if (distance > range || distance < 1e-6) return distance < 1e-6
    const along = (dx * ax + dy * ay + dz * az) / distance
    return along >= Math.cos(half)
}
