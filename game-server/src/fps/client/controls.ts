import { BUTTON, type Slot, SLOTS } from '../protocol.ts'

/** Radians per pixel of mouse movement. */
const SENSITIVITY = 0.0022
const MAX_PITCH = 1.5
const DIRECTIONS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Chrome under pointer lock (Windows especially) now and then reports one mousemove hundreds or
 * thousands of px long that the mouse never made: a sudden half turn. A movement is a spike when
 * it's at least `minPx` and `ratio` times the biggest of the last few, or big just after the lock
 * (`settleMs`). A suspect is held, not dropped: a flick from a still aim starts just as suddenly
 * (Chrome sends one movement a frame, so at 40 fps a quarter turn can come in one), but it goes on:
 * when the next movement carries on the same way at a comparable size (`carryShare` of the held
 * one), both are applied; otherwise the held one was a spike and is thrown away.
 */
export const SPIKE = { minPx: 250, ratio: 6, carryShare: 0.25, settleMs: 100, settlePx: 60 } as const

export interface Movement {
    dx: number
    dy: number
}

export class MouseFilter {
    /** Movements thrown away as spikes, and the largest (px). */
    spikes = 0
    largestSpike = 0
    private recent: number[] = []
    private held: Movement | null = null
    private lockedAt = -Infinity
    /** The fastest movement lately (px in one event), easing back. */
    private peak = 0

    /** The pointer was just locked: its first movements are suspect. */
    locked(now: number): void {
        this.lockedAt = now
        this.held = null
        this.recent = []
    }

    /** What to turn by for this movement (null: nothing yet, or nothing at all). */
    accept(dx: number, dy: number, now: number): Movement | null {
        const size = Math.max(Math.abs(dx), Math.abs(dy))
        const held = this.held
        this.held = null
        if (held) {
            const heldSize = Math.max(Math.abs(held.dx), Math.abs(held.dy))
            const sameWay =
                Math.abs(held.dx) >= Math.abs(held.dy)
                    ? Math.sign(dx) === Math.sign(held.dx)
                    : Math.sign(dy) === Math.sign(held.dy)
            if (sameWay && size >= heldSize * SPIKE.carryShare) {
                this.remember(heldSize)
                this.remember(size)
                return { dx: held.dx + dx, dy: held.dy + dy }
            }
            this.spiked(heldSize)
        }
        if (now - this.lockedAt < SPIKE.settleMs && size > SPIKE.settlePx) {
            this.spiked(size)
            return null
        }
        if (size >= SPIKE.minPx && size > Math.max(0, ...this.recent) * SPIKE.ratio) {
            this.held = { dx, dy }
            return null
        }
        this.remember(size)
        return { dx, dy }
    }

    private spiked(size: number): void {
        this.spikes++
        this.largestSpike = Math.max(this.largestSpike, Math.round(size))
    }

    /** The fastest movement lately (px), for the overlay; eases back each time it's read. */
    takePeak(): number {
        const peak = Math.round(this.peak)
        this.peak *= 0.5
        return peak
    }

    private remember(size: number): void {
        this.recent.push(size)
        if (this.recent.length > 4) this.recent.shift()
        this.peak = Math.max(this.peak, size)
    }
}

/**
 * Chrome and Edge, in the page's fullscreen: the browser's shortcuts on W, S and D (close the tab,
 * save, bookmark) come to the page instead (Keyboard Lock). Elsewhere it does nothing.
 */
function guardShortcuts(on: boolean): void {
    const keyboard = (navigator as Navigator & { keyboard?: { lock(codes: string[]): Promise<void>; unlock(): void } })
        .keyboard
    if (!keyboard) return
    if (on) void keyboard.lock(['KeyW', 'KeyS', 'KeyD']).catch(() => {})
    else keyboard.unlock()
}

/**
 * Keyboard and mouse, read once a step. The mouse is captured (pointer lock) by a click on the
 * game; Esc lets it go, and while it's free nothing is pressed.
 */
export class Controls {
    yaw = 0
    pitch = 0
    private readonly keys = new Set<string>()
    private firing = false
    private reloadAsked = false
    private dashAsked = false
    /** Right mouse button held: aiming (zoomed in). */
    aiming = false
    /** Mouse speed multiplier: your setting, lowered while zoomed so the aim moves the same on screen. */
    sensitivityScale = 1
    invertY = false
    /** The slot in hand: 1, 2 or 3, the scroll wheel, or Q for the last one. */
    slot: Slot = 'primary'
    private lastSlot: Slot = 'secondary'
    /** V: first / third person. */
    onToggleView: (() => void) | null = null
    /**
     * Build mode (B): the gun put away, a click puts a wall up, R turns it a quarter, the wheel
     * lays it flat or stands it up, E takes back one of yours; 1, 2, 3 or Q back to the guns.
     */
    building = false
    readonly stance = { flat: false, turned: false }
    onBuild: (() => void) | null = null
    onUnbuild: (() => void) | null = null
    /** F: open or shut a door of your side's (any time); in build mode, on a plain wall, make it a door. */
    onUse: (() => void) | null = null
    /** G in build mode: cut a window into a wall of your side's. */
    onWindow: (() => void) | null = null
    readonly mouse = new MouseFilter()
    /** Raw mouse input (no OS acceleration): asked for on every lock; null until the first. */
    rawInput: boolean | null = null

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly onLockChange: (locked: boolean) => void
    ) {
        // Anywhere on the page, the "Click to play" card included (it sits over the canvas); not
        // its links, buttons and settings.
        document.addEventListener('click', e => {
            const target = e.target as Element | null
            if (!this.locked && !target?.closest('a, button, input, select, label')) this.lock()
        })
        document.addEventListener('pointerlockchange', () => {
            if (!this.locked) this.release()
            else this.mouse.locked(performance.now())
            onLockChange(this.locked)
        })
        document.addEventListener('mousemove', e => {
            if (!this.locked) return
            const move = this.mouse.accept(e.movementX, e.movementY, performance.now())
            if (!move) return
            const speed = SENSITIVITY * this.sensitivityScale
            this.yaw -= move.dx * speed
            const vertical = move.dy * speed * (this.invertY ? -1 : 1)
            this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - vertical))
        })
        document.addEventListener(
            'wheel',
            e => {
                if (!this.locked || e.deltaY === 0) return
                e.preventDefault()
                if (this.building) {
                    this.stance.flat = !this.stance.flat
                    return
                }
                const next = SLOTS.indexOf(this.slot) + (e.deltaY > 0 ? 1 : -1)
                this.select(SLOTS[(next + SLOTS.length) % SLOTS.length]!)
            },
            { passive: false }
        )
        document.addEventListener('mousedown', e => {
            if (!this.locked) return
            if (this.building) {
                if (e.button === 0) this.onBuild?.()
                return
            }
            if (e.button === 0) this.firing = true
            if (e.button === 2) this.aiming = true
        })
        document.addEventListener('mouseup', e => {
            if (e.button === 0) this.firing = false
            if (e.button === 2) this.aiming = false
        })
        document.addEventListener('contextmenu', e => e.preventDefault())
        document.addEventListener('keydown', e => {
            if (e.code === 'Tab') e.preventDefault()
            // Ctrl+W (and the like) while playing: not the browser's. It only reaches the page with W
            // locked (fullscreen, `guardShortcuts`); otherwise the tab asks before closing (main.ts).
            if (this.locked && e.ctrlKey && (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyD')) {
                e.preventDefault()
            }
            if (!this.locked && e.code !== 'Tab') return
            if (e.code === 'Space') e.preventDefault()
            const shift = e.code === 'ShiftLeft' || e.code === 'ShiftRight'
            // A dodge is Shift + a direction, in either order: whichever key completes the pair fires it.
            const pair = shift ? this.directionHeld : DIRECTIONS.has(e.code) && this.shiftHeld
            if (!e.repeat && pair) this.dashAsked = true
            this.keys.add(e.code)
            if (e.code === 'KeyB' && !e.repeat) this.toggleBuilding()
            if (this.building) {
                if (e.code === 'KeyR' && !e.repeat) this.stance.turned = !this.stance.turned
                if (e.code === 'KeyE' && !e.repeat) this.onUnbuild?.()
                if (e.code === 'KeyG' && !e.repeat) this.onWindow?.()
            } else if (e.code === 'KeyR') {
                this.reloadAsked = true
            }
            if (e.code === 'KeyF' && !e.repeat) this.onUse?.()
            if (e.code === 'KeyV' && !e.repeat) this.onToggleView?.()
            if (e.code === 'Digit1') this.select('primary')
            if (e.code === 'Digit2') this.select('secondary')
            if (e.code === 'Digit3') this.select('melee')
            if (e.code === 'KeyQ' && !e.repeat) this.select(this.building ? this.slot : this.lastSlot)
        })
        document.addEventListener('keyup', e => this.keys.delete(e.code))
        // Fullscreen (F11 doesn't count: the page's own): W locked, so Ctrl+W comes to the game.
        document.addEventListener('fullscreenchange', () => guardShortcuts(Boolean(document.fullscreenElement)))
        window.addEventListener('blur', () => this.release())
    }

    get locked(): boolean {
        return document.pointerLockElement === this.canvas
    }

    /**
     * Takes the mouse, raw (unadjustedMovement: the movement the mouse made, no OS acceleration,
     * and not Chrome's path that throws spikes) where the browser can, plainly where it can't.
     */
    private lock(): void {
        const plain = () => {
            this.rawInput = false
            void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {})
        }
        try {
            const asked = this.canvas.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined
            if (!asked) return plain()
            asked.then(
                () => (this.rawInput = true),
                (error: unknown) => {
                    // Not offered here (NotSupportedError); anything else (too soon after Esc) is the browser's no.
                    if (error instanceof DOMException && error.name === 'NotSupportedError') plain()
                }
            )
        } catch {
            plain()
        }
    }

    /** A weapon key: out of build mode, with that weapon. */
    select(slot: Slot): void {
        this.building = false
        if (slot === this.slot) return
        this.lastSlot = this.slot
        this.slot = slot
    }

    toggleBuilding(): void {
        this.building = !this.building
        this.firing = false
        this.aiming = false
    }

    /** Facing a spawn's way (the server sets it on every spawn). */
    face(yaw: number): void {
        this.yaw = yaw
        this.pitch = 0
    }

    /** This step's keys and buttons. */
    read(): { forward: number; strafe: number; buttons: number } {
        const held = (code: string) => this.keys.has(code)
        const forward = (held('KeyW') || held('ArrowUp') ? 1 : 0) - (held('KeyS') || held('ArrowDown') ? 1 : 0)
        const strafe = (held('KeyD') || held('ArrowRight') ? 1 : 0) - (held('KeyA') || held('ArrowLeft') ? 1 : 0)
        let buttons = 0
        if (this.dashAsked) buttons |= BUTTON.dash
        if (held('Space')) buttons |= BUTTON.jet
        // C held: prone.
        if (held('KeyC')) buttons |= BUTTON.prone
        // Building: the gun's away (it neither fires, reloads nor aims).
        if (this.firing && !this.building) buttons |= BUTTON.fire
        if (this.reloadAsked && !this.building) buttons |= BUTTON.reload
        if (this.aiming && !this.building) buttons |= BUTTON.aim
        this.reloadAsked = false
        this.dashAsked = false

        return { forward, strafe, buttons }
    }

    get scoreboardHeld(): boolean {
        return this.keys.has('Tab')
    }

    private get directionHeld(): boolean {
        return [...DIRECTIONS].some(code => this.keys.has(code))
    }

    private get shiftHeld(): boolean {
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    }

    private release(): void {
        this.keys.clear()
        this.firing = false
        this.aiming = false
    }
}
