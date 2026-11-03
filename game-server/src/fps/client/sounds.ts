import type { Gun } from '../protocol.ts'

/**
 * Every sound in the game, made on the spot with Web Audio: oscillators with pitch sweeps and
 * envelopes, and filtered white noise. Nothing to download. Other players' sounds are placed
 * left or right of you and fade with distance (`spatial`).
 *
 * Browsers only start audio after a click, so `unlock()` is called on the click that takes the
 * mouse; until then everything is silently skipped.
 */

/** Where a sound at (x, z) sits for a listener at (x, z) looking along `yaw`: how loud, and how far right (−1 … 1). */
export function spatial(
    listener: { x: number; z: number; yaw: number },
    source: { x: number; z: number }
): { gain: number; pan: number } {
    const dx = source.x - listener.x
    const dz = source.z - listener.z
    const distance = Math.hypot(dx, dz)
    // The office is ~20 m across: a shot across it is faint, one next to you full.
    const gain = Math.max(0.06, Math.min(1, 1 / (1 + distance * 0.35)))
    if (distance < 0.05) return { gain, pan: 0 }
    // Right of you is (cos yaw, -sin yaw) in three.js's frame.
    const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance

    return { gain, pan: Math.max(-1, Math.min(1, right)) }
}

/** How far through a reload (0 … 1) with `leftMs` of `totalMs` left. */
export function reloadProgress(leftMs: number | null, totalMs: number): number | null {
    if (leftMs === null) return null
    return Math.max(0, Math.min(1, 1 - leftMs / totalMs))
}

type Wave = OscillatorType

export class Sounds {
    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private noise: AudioBuffer | null = null
    private jet: { gain: GainNode; source: AudioBufferSourceNode } | null = null
    private volume = 0.6

    /** On a click: browsers let audio start only after one. */
    unlock(): void {
        if (!this.ctx) {
            if (typeof AudioContext === 'undefined') return
            this.ctx = new AudioContext()
            this.master = this.ctx.createGain()
            this.master.gain.value = this.volume
            this.master.connect(this.ctx.destination)
            // One second of white noise, reused by every noisy sound.
            this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
            const data = this.noise.getChannelData(0)
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume()
    }

    /** 0 … 1 (0 mutes). */
    setVolume(volume: number): void {
        this.volume = volume
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02)
    }

    // --- Yours ------------------------------------------------------------------------------

    /** Your gun going off. */
    shot(weapon: Gun): void {
        this.gun(weapon, 1)
    }

    /** Someone else's gun, quieter and placed where they are. */
    otherShot(weapon: Gun, where: { gain: number; pan: number }): void {
        this.gun(weapon, 0.75, this.place(where, 0.8))
    }

    /** A rocket went off (near you, or placed where it was): a deep boom, a roar of noise rumbling off. */
    explosion(where?: { gain: number; pan: number }): void {
        const out = where ? this.place(where, 1) : undefined
        this.tone('sine', 85, 24, 0.9, 0.7, 0, out)
        this.tone('triangle', 160, 40, 0.35, 0.3, 0, out)
        this.burst(0.08, 'highpass', 5000, 2000, 0.3, 0, out)
        this.burst(1.2, 'lowpass', 1800, 80, 0.55, 0, out)
        this.burst(0.5, 'bandpass', 600, 150, 0.25, 0.05, out)
    }

    /** The launcher is loaded: the rocket clacks home and the sight pings. */
    rocketReady(): void {
        this.burst(0.03, 'bandpass', 2600, 2200, 0.3)
        this.tone('square', 400, 300, 0.03, 0.12)
        this.burst(0.03, 'bandpass', 3400, 3000, 0.3, 0.08)
        this.tone('triangle', 1250, 1250, 0.12, 0.1, 0.12)
    }

    /** Your shot landed: a short tick. */
    hit(): void {
        this.tone('triangle', 1900, 1700, 0.05, 0.35)
    }

    /** A headshot you landed: a bright two-note ding. */
    headshot(): void {
        this.tone('sine', 1568, 1568, 0.22, 0.32)
        this.tone('sine', 2349, 2349, 0.3, 0.22, 0.05)
        this.tone('triangle', 3136, 3136, 0.12, 0.1, 0.05)
    }

    /** You took someone down: a rising three-note chime. */
    kill(): void {
        this.tone('sine', 660, 660, 0.14, 0.3)
        this.tone('sine', 880, 880, 0.14, 0.3, 0.08)
        this.tone('sine', 1320, 1320, 0.3, 0.3, 0.16)
    }

    /** You're hit: a low thump. */
    hurt(): void {
        this.tone('sine', 160, 55, 0.2, 0.55)
        this.burst(0.12, 'lowpass', 900, 200, 0.25)
    }

    /** Headshot taken: a heavy crunch and a ring in the ears. */
    headshotTaken(): void {
        this.tone('square', 110, 38, 0.28, 0.4)
        this.burst(0.16, 'highpass', 1800, 900, 0.35)
        this.tone('sine', 3800, 3700, 0.6, 0.05, 0.05)
    }

    /** Fired with an empty magazine: a dry click. */
    empty(): void {
        this.tone('square', 900, 700, 0.025, 0.15)
    }

    /** A reload: the magazine out (a clack and a slide), and in again `ms` later (two clicks). */
    reload(ms: number): void {
        const s = ms / 1000
        this.burst(0.04, 'bandpass', 2400, 2000, 0.3)
        this.tone('square', 320, 260, 0.04, 0.12)
        this.burst(0.18, 'bandpass', 900, 1600, 0.08, 0.12)
        this.burst(0.03, 'bandpass', 3000, 2600, 0.3, s * 0.72)
        this.tone('square', 520, 480, 0.03, 0.12, s * 0.72)
        this.burst(0.03, 'bandpass', 3600, 3200, 0.32, s * 0.9)
    }

    /** A stapler swing (yours, or theirs placed): a whoosh. */
    swing(where?: { gain: number; pan: number }): void {
        this.burst(0.18, 'bandpass', 500, 2600, 0.3, 0, where ? this.place(where, 0.7) : undefined)
    }

    /** The stapler connects: a thunk and a staple's snap. */
    swingHit(backstab: boolean): void {
        this.tone('triangle', 240, 90, 0.1, 0.5)
        this.burst(0.04, 'highpass', 4000, 3000, 0.3, 0.02)
        if (backstab) this.tone('square', 180, 60, 0.18, 0.25, 0.03)
    }

    /** A dodge: a short roar of the jetpack. */
    dash(): void {
        this.burst(0.28, 'lowpass', 400, 2200, 0.35)
        this.tone('sawtooth', 90, 160, 0.2, 0.08)
    }

    /** The jetpack's burn: a filtered rumble while it's on. */
    jetting(on: boolean): void {
        if (!this.ctx || !this.master || !this.noise) return
        if (on && !this.jet) {
            const source = this.ctx.createBufferSource()
            source.buffer = this.noise
            source.loop = true
            const filter = this.ctx.createBiquadFilter()
            filter.type = 'lowpass'
            filter.frequency.value = 700
            const gain = this.ctx.createGain()
            gain.gain.value = 0
            source.connect(filter).connect(gain).connect(this.master)
            source.start()
            this.jet = { gain, source }
        }
        if (this.jet) this.jet.gain.gain.setTargetAtTime(on ? 0.18 : 0, this.ctx.currentTime, on ? 0.04 : 0.08)
    }

    /** Back in after being down. */
    spawn(): void {
        for (const [i, f] of [523, 659, 784].entries()) this.tone('sine', f, f, 0.18, 0.18, i * 0.07)
    }

    /** A countdown's tick, and the higher one as the match starts. */
    countdown(last: boolean): void {
        this.tone('sine', last ? 1320 : 880, last ? 1320 : 880, last ? 0.4 : 0.12, 0.3)
    }

    /** The match is over: a falling three-note phrase. */
    matchOver(): void {
        for (const [i, f] of [784, 659, 523].entries()) this.tone('triangle', f, f, 0.3, 0.25, i * 0.16)
    }

    /** Your side or you won: a bright rising fanfare. Lost: a sad trombone of a slide. */
    result(won: boolean): void {
        if (won) {
            for (const [i, f] of [523, 659, 784, 1047].entries()) this.tone('square', f, f, 0.22, 0.12, i * 0.11)
            this.tone('sawtooth', 1047, 1047, 0.6, 0.08, 0.44)
        } else {
            for (const [i, f] of [392, 370, 349].entries()) this.tone('sawtooth', f, f * 0.98, 0.3, 0.12, i * 0.3)
            this.tone('sawtooth', 330, 220, 0.8, 0.12, 0.9)
        }
    }

    /** A pickup, its own chime: health a warm rise, ammo a metal clack, jetpack a whoosh up, headshot rounds an ominous ring. */
    pickup(kind: 'health' | 'magazine' | 'jetpack' | 'headshot'): void {
        if (kind === 'health') {
            this.tone('sine', 440, 880, 0.25, 0.3)
            this.tone('sine', 660, 1320, 0.25, 0.15, 0.05)
        } else if (kind === 'magazine') {
            this.burst(0.04, 'bandpass', 3000, 2500, 0.35)
            this.burst(0.04, 'bandpass', 3400, 3000, 0.35, 0.09)
            this.tone('triangle', 880, 1320, 0.15, 0.2, 0.1)
        } else if (kind === 'jetpack') {
            this.burst(0.35, 'lowpass', 300, 3000, 0.3)
            this.tone('sine', 300, 900, 0.35, 0.2)
        } else {
            this.tone('square', 220, 220, 0.5, 0.15)
            this.tone('sine', 1760, 1700, 0.6, 0.12, 0.05)
            this.tone('sine', 1320, 1300, 0.6, 0.1, 0.1)
        }
    }

    /** The announcer's stinger for a callout, bigger with its level (1 … 4). */
    callout(level: number): void {
        const notes = [523, 659, 784, 1047, 1319].slice(0, level + 1)
        notes.forEach((f, i) => this.tone('sawtooth', f, f, 0.18, 0.1 + level * 0.02, i * 0.07))
        this.burst(0.15, 'lowpass', 200, 120, 0.4 + level * 0.1)
        if (level >= 3) this.tone('square', 98, 98, 0.5, 0.18)
    }

    /** The zone moved: two beeps. */
    zoneMoved(): void {
        this.tone('square', 1200, 1200, 0.08, 0.15)
        this.tone('square', 1600, 1600, 0.12, 0.15, 0.12)
    }

    /** A second held in the zone: a soft tick. */
    zoneTick(): void {
        this.tone('sine', 1500, 1500, 0.05, 0.12)
    }

    // --- The makings ------------------------------------------------------------------------

    /**
     * One gun's report, at `v` times its volume, into `out` (the master when absent). The rifle a
     * sharp short crack, the sniper a big boom with a long tail, the shotgun a heavy wide blast
     * (and its pump), the pistol a light pop, the launcher a thump and a whoosh.
     */
    private gun(weapon: Gun, v: number, out?: AudioNode): void {
        switch (weapon) {
            case 'rifle':
                this.burst(0.06, 'bandpass', 4200, 1500, 0.28 * v, 0, out)
                this.tone('square', 900, 120, 0.06, 0.12 * v, 0, out)
                this.tone('sine', 190, 60, 0.08, 0.22 * v, 0, out)
                break
            case 'sniper':
                this.burst(0.05, 'highpass', 6000, 3000, 0.35 * v, 0, out)
                this.tone('sine', 120, 32, 0.5, 0.55 * v, 0, out)
                this.burst(0.9, 'lowpass', 3000, 140, 0.42 * v, 0, out)
                // Its echo off the far walls.
                this.burst(0.6, 'lowpass', 1200, 180, 0.12 * v, 0.25, out)
                // The bolt worked.
                this.burst(0.04, 'bandpass', 2000, 1600, 0.16 * v, 0.4, out)
                this.burst(0.04, 'bandpass', 2600, 2200, 0.16 * v, 0.72, out)
                break
            case 'shotgun':
                this.tone('sine', 95, 30, 0.35, 0.55 * v, 0, out)
                this.burst(0.4, 'lowpass', 5000, 200, 0.5 * v, 0, out)
                this.burst(0.15, 'bandpass', 1200, 400, 0.3 * v, 0, out)
                // Cha-chk.
                this.burst(0.05, 'bandpass', 1800, 1400, 0.18 * v, 0.2, out)
                this.burst(0.04, 'bandpass', 2400, 2000, 0.2 * v, 0.34, out)
                break
            case 'pistol':
                this.burst(0.05, 'bandpass', 2600, 1200, 0.26 * v, 0, out)
                this.tone('square', 700, 200, 0.05, 0.1 * v, 0, out)
                this.tone('sine', 230, 90, 0.06, 0.18 * v, 0, out)
                break
            case 'launcher':
                this.tone('sine', 75, 40, 0.25, 0.45 * v, 0, out)
                this.burst(0.15, 'lowpass', 2000, 300, 0.3 * v, 0, out)
                this.burst(0.6, 'bandpass', 400, 2400, 0.28 * v, 0.03, out)
                break
        }
    }

    /** A gain and stereo pan for a placed sound, into the master. */
    private place(where: { gain: number; pan: number }, scale: number): AudioNode | undefined {
        if (!this.ctx || !this.master) return undefined
        const gain = this.ctx.createGain()
        gain.gain.value = where.gain * scale
        const pan = this.ctx.createStereoPanner()
        pan.pan.value = where.pan
        gain.connect(pan).connect(this.master)
        return gain
    }

    /** An oscillator sweeping `from` → `to` Hz over `seconds`, with a fast attack and an exponential fade. */
    private tone(
        wave: Wave,
        from: number,
        to: number,
        seconds: number,
        volume: number,
        delay = 0,
        out?: AudioNode
    ): void {
        if (!this.ctx || !this.master) return
        const at = this.ctx.currentTime + delay
        const osc = this.ctx.createOscillator()
        osc.type = wave
        osc.frequency.setValueAtTime(from, at)
        if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds)
        const gain = this.envelope(at, seconds, volume)
        osc.connect(gain).connect(out ?? this.master)
        osc.start(at)
        osc.stop(at + seconds + 0.02)
    }

    /** White noise through a filter whose frequency sweeps `from` → `to` Hz. */
    private burst(
        seconds: number,
        filterType: BiquadFilterType,
        from: number,
        to: number,
        volume: number,
        delay = 0,
        out?: AudioNode
    ): void {
        if (!this.ctx || !this.master || !this.noise) return
        const at = this.ctx.currentTime + delay
        const source = this.ctx.createBufferSource()
        source.buffer = this.noise
        const filter = this.ctx.createBiquadFilter()
        filter.type = filterType
        filter.Q.value = filterType === 'bandpass' ? 2 : 0.7
        filter.frequency.setValueAtTime(from, at)
        filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds)
        const gain = this.envelope(at, seconds, volume)
        const output = out ?? this.master
        source.connect(filter).connect(gain).connect(output)
        source.start(at, Math.random() * 0.5)
        source.stop(at + seconds + 0.02)
    }

    private envelope(at: number, seconds: number, volume: number): GainNode {
        const gain = this.ctx!.createGain()
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.005)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
        return gain
    }
}
