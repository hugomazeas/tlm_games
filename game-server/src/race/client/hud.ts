import { MINI_TURBO, SUPER_TURBO } from '../drive/kart.ts'

/**
 * Race dials drawn on the page over the 3D view: the speedometer at the
 * bottom, and the arrow at the top pointing the way the route goes next.
 *
 * The speedometer is a dashboard dial: a dark face, a sweep that runs green
 * to red as you speed up (pink past 150, where only boosts and nitro take
 * you), ticks and numbers, a glowing needle, the speed in big digits, the
 * drift charge on an inner ring and the nitro on an outer one. Drawn at the
 * screen's pixel density so it stays sharp.
 */

/** The dial reads up to this, past top speed so a boost (and a boost with a nitro, ~190) shows. */
const DIAL_MAX = 200
/** Top speed on the gas: past it the dial is the boost zone. */
const RED_LINE = 150
/** The dial's sweep: from lower left, over the top, to lower right. */
const SWEEP_START = Math.PI * 0.75
const SWEEP = Math.PI * 1.5
/** CSS size of the canvas (overlay.ts), and the dial in it. */
const SIZE = { width: 280, height: 200 }
const DIAL = { x: 140, y: 118, radius: 86 }
const COLOURS = {
    face: ['rgba(30, 41, 59, 0.92)', 'rgba(2, 6, 23, 0.9)'],
    track: 'rgba(255, 255, 255, 0.08)',
    tick: 'rgba(255, 255, 255, 0.55)',
    boost: '#ffb13b',
    mini: '#4fa8ff',
    super: '#ff8a1f',
    nitro: '#22d3ee',
    redLine: '#f43f5e',
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
    let ratio = 0
    /** The needle eases to the speed, so it sweeps instead of jumping. */
    let shown = 0

    /** The angle on the dial for a speed. */
    const angleOf = (kmh: number) => SWEEP_START + SWEEP * Math.min(1, Math.max(0, kmh / DIAL_MAX))
    /** Green at a standstill, through yellow and orange to red at 150; pink beyond. */
    const sweepColour = (kmh: number) =>
        kmh > RED_LINE
            ? `hsl(${330 - (kmh - RED_LINE) * 0.4}, 95%, 62%)`
            : `hsl(${130 - (kmh / RED_LINE) * 130}, 90%, 55%)`

    return {
        draw({ kmh, boosting, charge, nitro }) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            if (dpr !== ratio) {
                ratio = dpr
                canvas.width = SIZE.width * dpr
                canvas.height = SIZE.height * dpr
            }
            context.setTransform(dpr, 0, 0, dpr, 0, 0)
            context.clearRect(0, 0, SIZE.width, SIZE.height)
            shown += (kmh - shown) * 0.3
            const { x, y, radius } = DIAL
            const now = performance.now()

            // The face.
            const face = context.createRadialGradient(x, y - 20, 10, x, y, radius + 22)
            face.addColorStop(0, COLOURS.face[0]!)
            face.addColorStop(1, COLOURS.face[1]!)
            context.fillStyle = face
            context.beginPath()
            context.arc(x, y, radius + 22, 0, Math.PI * 2)
            context.fill()
            context.strokeStyle = boosting ? 'rgba(255, 177, 59, 0.8)' : 'rgba(148, 163, 184, 0.35)'
            context.lineWidth = 2
            context.stroke()

            // The track, then the sweep up to the speed, in little steps so its colour runs along it.
            context.lineCap = 'butt'
            context.lineWidth = 12
            context.strokeStyle = COLOURS.track
            context.beginPath()
            context.arc(x, y, radius, SWEEP_START, SWEEP_START + SWEEP)
            context.stroke()
            const steps = Math.ceil(Math.min(DIAL_MAX, shown) / 2)
            for (let i = 0; i < steps; i++) {
                const from = i * 2
                context.strokeStyle = boosting ? COLOURS.boost : sweepColour(from)
                context.beginPath()
                context.arc(x, y, radius, angleOf(from), angleOf(Math.min(shown, from + 2.4)))
                context.stroke()
            }

            // Past 150: the boost zone, marked red along the outside.
            context.lineWidth = 3
            context.strokeStyle = COLOURS.redLine
            context.beginPath()
            context.arc(x, y, radius + 9, angleOf(RED_LINE), angleOf(DIAL_MAX))
            context.stroke()

            // Ticks every 10 km/h, longer every 50, with numbers.
            context.fillStyle = 'rgba(255, 255, 255, 0.75)'
            context.font = '700 11px system-ui, sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            for (let speed = 0; speed <= DIAL_MAX; speed += 10) {
                const angle = angleOf(speed)
                const major = speed % 50 === 0
                const inner = radius - (major ? 17 : 11)
                context.strokeStyle = speed > RED_LINE ? COLOURS.redLine : COLOURS.tick
                context.lineWidth = major ? 2.5 : 1.2
                context.beginPath()
                context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner)
                context.lineTo(x + Math.cos(angle) * (radius - 7), y + Math.sin(angle) * (radius - 7))
                context.stroke()
                // Not at the two ends: the digits sit between them.
                if (major && speed > 0 && speed < DIAL_MAX)
                    context.fillText(
                        String(speed),
                        x + Math.cos(angle) * (radius - 29),
                        y + Math.sin(angle) * (radius - 29)
                    )
            }

            // The drift charge, an inner ring that turns blue then orange as the turbo builds.
            if (charge > 0) {
                context.lineCap = 'round'
                context.lineWidth = 5
                context.strokeStyle =
                    charge >= SUPER_TURBO
                        ? COLOURS.super
                        : charge >= MINI_TURBO
                          ? COLOURS.mini
                          : 'rgba(255, 255, 255, 0.4)'
                context.shadowColor = context.strokeStyle
                context.shadowBlur = charge >= MINI_TURBO ? 10 : 0
                context.beginPath()
                context.arc(x, y, radius - 42, SWEEP_START, SWEEP_START + SWEEP * Math.min(1, charge / SUPER_TURBO))
                context.stroke()
                context.shadowBlur = 0
            }

            // The nitro: an outer ring filling over 15 s; full, it pulses.
            const ready = nitro >= 1
            const pulse = ready ? 0.6 + 0.4 * Math.sin(now / 120) : 1
            context.lineCap = 'round'
            context.lineWidth = 4
            context.strokeStyle = ready ? `rgba(34, 211, 238, ${pulse})` : 'rgba(34, 211, 238, 0.45)'
            context.shadowColor = COLOURS.nitro
            context.shadowBlur = ready ? 14 : 0
            context.beginPath()
            context.arc(x, y, radius + 17, SWEEP_START, SWEEP_START + SWEEP * Math.max(0.001, Math.min(1, nitro)))
            context.stroke()
            context.shadowBlur = 0

            // The needle, glowing the sweep's colour.
            const angle = angleOf(shown)
            const tip = sweepColour(shown)
            context.shadowColor = boosting ? COLOURS.boost : tip
            context.shadowBlur = 12
            context.strokeStyle = '#ffffff'
            context.lineCap = 'round'
            context.lineWidth = 3.5
            context.beginPath()
            context.moveTo(x - Math.cos(angle) * 10, y - Math.sin(angle) * 10)
            context.lineTo(x + Math.cos(angle) * (radius - 8), y + Math.sin(angle) * (radius - 8))
            context.stroke()
            context.shadowBlur = 0
            context.fillStyle = '#0f172a'
            context.strokeStyle = boosting ? COLOURS.boost : tip
            context.lineWidth = 3
            context.beginPath()
            context.arc(x, y, 7, 0, Math.PI * 2)
            context.fill()
            context.stroke()

            // The speed in digits, under the hub.
            context.textBaseline = 'alphabetic'
            context.shadowColor = boosting ? COLOURS.boost : 'rgba(255, 255, 255, 0.6)'
            context.shadowBlur = boosting ? 16 : 6
            context.fillStyle = '#ffffff'
            context.font = '800 38px ui-monospace, "SF Mono", Menlo, monospace'
            context.fillText(String(Math.round(kmh)).padStart(3, ' '), x, y + 46)
            context.shadowBlur = 0
            context.font = '700 11px system-ui, sans-serif'
            context.fillStyle = 'rgba(255, 255, 255, 0.7)'
            context.fillText(boosting ? 'BOOST' : 'km/h', x, y + 62)
            if (ready) {
                context.fillStyle = `rgba(34, 211, 238, ${pulse})`
                context.font = '800 12px system-ui, sans-serif'
                context.fillText('NITRO · E', x, y - 22)
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
