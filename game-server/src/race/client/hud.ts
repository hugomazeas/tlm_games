import { MINI_TURBO, SUPER_TURBO } from '../drive/kart.ts'

/**
 * Race dials drawn on the page over the 3D view: the speedometer at the
 * bottom, and the arrow at the top pointing the way the route goes next.
 */

/** The dial reads up to this, past top speed so a boost (and a boost with a nitro, ~190) shows. */
const DIAL_MAX = 200
/** The dial's sweep: from lower left, over the top, to lower right. */
const SWEEP_START = Math.PI * 0.8
const SWEEP = Math.PI * 1.4
const DIAL_COLOURS = {
    track: 'rgba(255, 255, 255, 0.18)',
    speed: '#ffffff',
    boost: '#ffb13b',
    mini: '#4fa8ff',
    super: '#ff8a1f',
    nitro: 'rgba(34, 211, 238, 0.45)',
}

export interface SpeedometerReading {
    kmh: number
    boosting: boolean
    /** Seconds of drift charged, 0 when not drifting. */
    charge: number
    /** The nitro's charge, 0 to 1: full means E fires it. */
    nitro: number
}

export function createSpeedometer(canvas: HTMLCanvasElement): { draw(reading: SpeedometerReading): void } {
    const context = canvas.getContext('2d')!

    return {
        draw({ kmh, boosting, charge, nitro }) {
            const { width, height } = canvas
            const cx = width / 2
            const cy = height * 0.62
            const radius = Math.min(width / 2, height * 0.6) - 10
            context.clearRect(0, 0, width, height)

            context.lineCap = 'round'
            context.lineWidth = 12
            context.strokeStyle = DIAL_COLOURS.track
            context.beginPath()
            context.arc(cx, cy, radius, SWEEP_START, SWEEP_START + SWEEP)
            context.stroke()

            const fraction = Math.min(1, Math.max(0, kmh / DIAL_MAX))
            context.strokeStyle = boosting ? DIAL_COLOURS.boost : DIAL_COLOURS.speed
            context.beginPath()
            context.arc(cx, cy, radius, SWEEP_START, SWEEP_START + SWEEP * Math.max(fraction, 0.001))
            context.stroke()

            // The drift charge, as an inner ring that turns blue then orange as the turbo builds.
            if (charge > 0) {
                const full = Math.min(1, charge / SUPER_TURBO)
                context.lineWidth = 5
                context.strokeStyle =
                    charge >= SUPER_TURBO
                        ? DIAL_COLOURS.super
                        : charge >= MINI_TURBO
                          ? DIAL_COLOURS.mini
                          : DIAL_COLOURS.track
                context.beginPath()
                context.arc(cx, cy, radius - 14, SWEEP_START, SWEEP_START + SWEEP * full)
                context.stroke()
            }

            // The nitro, as a thin outer ring filling over 15 s; full, it pulses and says which key.
            const ready = nitro >= 1
            const pulse = ready ? 0.65 + 0.35 * Math.sin(performance.now() / 120) : 1
            context.lineWidth = 4
            context.strokeStyle = ready ? `rgba(34, 211, 238, ${pulse})` : DIAL_COLOURS.nitro
            context.beginPath()
            context.arc(cx, cy, radius + 11, SWEEP_START, SWEEP_START + SWEEP * Math.max(0.001, Math.min(1, nitro)))
            context.stroke()

            context.fillStyle = '#ffffff'
            context.textAlign = 'center'
            context.textBaseline = 'alphabetic'
            context.font = '800 44px system-ui, sans-serif'
            context.fillText(Math.round(kmh).toString(), cx, cy + 10)
            context.font = '600 13px system-ui, sans-serif'
            context.fillText('km/h', cx, cy + 30)
            if (ready) {
                context.fillStyle = `rgba(34, 211, 238, ${pulse})`
                context.font = '800 13px system-ui, sans-serif'
                context.fillText('NITRO · E', cx, cy + 50)
            }
        },
    }
}

/**
 * Points an arrow element the way to go: `bearing` is the heading from the
 * kart to where the route goes next, `heading` the kart's; both as the
 * physics counts them (bigger is further left).
 */
export function pointArrow(arrow: HTMLElement, bearing: number, heading: number): void {
    const relative = Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading))
    // CSS turns clockwise; a target to the left (positive) turns the arrow anticlockwise.
    arrow.style.transform = `rotate(${(-relative * 180) / Math.PI}deg)`
}
