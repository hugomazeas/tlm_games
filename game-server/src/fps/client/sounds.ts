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

    /** Your blaster: a zap falling in pitch, with a crack of noise on top. */
    shot(): void {
        this.tone('square', 1300, 160, 0.13, 0.22)
        this.tone('sawtooth', 2600, 600, 0.06, 0.08)
        this.burst(0.05, 'bandpass', 3200, 1800, 0.18)
    }

    /** Someone else's blaster, quieter and placed where they are. */
    otherShot(where: { gain: number; pan: number }): void {
        const out = this.place(where, 0.6)
        this.tone('square', 1100, 150, 0.12, 0.2, 0, out)
        this.burst(0.05, 'bandpass', 2600, 1500, 0.15, 0, out)
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

    // --- The makings ------------------------------------------------------------------------

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
