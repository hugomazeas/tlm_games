import { BUTTON } from '../protocol.ts'

/** Radians per pixel of mouse movement. */
const SENSITIVITY = 0.0022
const MAX_PITCH = 1.5

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

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly onLockChange: (locked: boolean) => void
    ) {
        // Anywhere on the page, the "Click to play" card included (it sits over the canvas); not its links.
        document.addEventListener('click', e => {
            if (!this.locked && !(e.target as Element | null)?.closest('a')) void canvas.requestPointerLock()
        })
        document.addEventListener('pointerlockchange', () => {
            if (!this.locked) this.release()
            onLockChange(this.locked)
        })
        document.addEventListener('mousemove', e => {
            if (!this.locked) return
            this.yaw -= e.movementX * SENSITIVITY
            this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - e.movementY * SENSITIVITY))
        })
        document.addEventListener('mousedown', e => {
            if (this.locked && e.button === 0) this.firing = true
        })
        document.addEventListener('mouseup', e => {
            if (e.button === 0) this.firing = false
        })
        document.addEventListener('keydown', e => {
            if (e.code === 'Tab') e.preventDefault()
            if (!this.locked && e.code !== 'Tab') return
            if (e.code === 'Space') e.preventDefault()
            this.keys.add(e.code)
            if (e.code === 'KeyR') this.reloadAsked = true
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
        if (held('ShiftLeft') || held('ShiftRight')) buttons |= BUTTON.run
        if (held('Space')) buttons |= BUTTON.jet
        if (this.firing) buttons |= BUTTON.fire
        if (this.reloadAsked) buttons |= BUTTON.reload
        this.reloadAsked = false

        return { forward, strafe, buttons }
    }

    get scoreboardHeld(): boolean {
        return this.keys.has('Tab')
    }

    private release(): void {
        this.keys.clear()
        this.firing = false
    }
}
