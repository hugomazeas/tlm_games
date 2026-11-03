import { BUTTON, type Weapon } from '../protocol.ts'

/** Radians per pixel of mouse movement. */
const SENSITIVITY = 0.0022
const MAX_PITCH = 1.5
const DIRECTIONS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

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
    /** The weapon in hand: 1 or 2, or the scroll wheel. */
    weapon: Weapon = 'blaster'
    /** V: first / third person. */
    onToggleView: (() => void) | null = null

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly onLockChange: (locked: boolean) => void
    ) {
        // Anywhere on the page, the "Click to play" card included (it sits over the canvas); not
        // its links, buttons and settings.
        document.addEventListener('click', e => {
            const target = e.target as Element | null
            if (!this.locked && !target?.closest('a, button, input, select, label')) void canvas.requestPointerLock()
        })
        document.addEventListener('pointerlockchange', () => {
            if (!this.locked) this.release()
            onLockChange(this.locked)
        })
        document.addEventListener('mousemove', e => {
            if (!this.locked) return
            const speed = SENSITIVITY * this.sensitivityScale
            this.yaw -= e.movementX * speed
            const vertical = e.movementY * speed * (this.invertY ? -1 : 1)
            this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - vertical))
        })
        document.addEventListener(
            'wheel',
            e => {
                if (!this.locked || e.deltaY === 0) return
                e.preventDefault()
                this.weapon = this.weapon === 'blaster' ? 'stapler' : 'blaster'
            },
            { passive: false }
        )
        document.addEventListener('mousedown', e => {
            if (!this.locked) return
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
            if (!this.locked && e.code !== 'Tab') return
            if (e.code === 'Space') e.preventDefault()
            const shift = e.code === 'ShiftLeft' || e.code === 'ShiftRight'
            // A dodge is Shift + a direction, in either order: whichever key completes the pair fires it.
            const pair = shift ? this.directionHeld : DIRECTIONS.has(e.code) && this.shiftHeld
            if (!e.repeat && pair) this.dashAsked = true
            this.keys.add(e.code)
            if (e.code === 'KeyR') this.reloadAsked = true
            if (e.code === 'KeyV' && !e.repeat) this.onToggleView?.()
            if (e.code === 'Digit1') this.weapon = 'blaster'
            if (e.code === 'Digit2') this.weapon = 'stapler'
        })
        document.addEventListener('keyup', e => this.keys.delete(e.code))
        window.addEventListener('blur', () => this.release())
    }

    get locked(): boolean {
        return document.pointerLockElement === this.canvas
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
        if (this.firing) buttons |= BUTTON.fire
        if (this.reloadAsked) buttons |= BUTTON.reload
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
