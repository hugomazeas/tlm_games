/**
 * The performance overlay (Esc menu → Settings → Performance overlay): what each frame costs and
 * where it goes, measured on this machine. `FrameStats` is pure (tested); `GpuTimer` asks the GPU
 * itself how long it drew (EXT_disjoint_timer_query_webgl2, when the browser has it);
 * `PerfOverlay` writes it all to the screen four times a second.
 */

/** Where a frame's CPU time goes, in order. */
export const SECTIONS = ['sim', 'scene', 'hud', 'render'] as const
export type Section = (typeof SECTIONS)[number]

export const SECTION_NAMES: Record<Section, string> = {
    sim: 'sim', // your steps: input, prediction, sending
    scene: 'scene', // camera, troopers, effects, impacts, pickups
    hud: 'hud', // zone marker, target label, the HUD
    render: 'render', // three.js drawing the world and the gun (driver work included)
}

/** A frame this long or longer (ms) is a hitch: a visible stutter. */
export const HITCH_MS = 50
/** Frames kept for the graph and the percentiles. */
const KEPT = 240
/** Hitches are counted over this long (ms). */
const HITCH_WINDOW_MS = 10_000

interface Frame {
    at: number
    /** Since the frame before (ms). */
    interval: number
    cpu: Record<Section, number>
    /** A shader program was compiled in this frame. */
    compiled: boolean
}

export interface FrameSummary {
    fps: number
    avgMs: number
    p95Ms: number
    worstMs: number
    /** The average rate of the slowest 1% of frames. */
    low1Fps: number
    /** Average CPU ms a frame, per section. */
    cpu: Record<Section, number>
    cpuMs: number
    /** Hitches in the last 10 s, and how many of them came with a shader compile. */
    hitches: number
    compileHitches: number
}

/** Frame intervals and CPU sections, the last few seconds of them. */
export class FrameStats {
    private readonly frames: Frame[] = []
    private last: number | null = null

    /** A frame ended at `now`, having spent this much CPU per section. */
    record(now: number, cpu: Record<Section, number>, compiled: boolean): void {
        if (this.last !== null) {
            this.frames.push({ at: now, interval: now - this.last, cpu: { ...cpu }, compiled })
            if (this.frames.length > KEPT) this.frames.shift()
        }
        this.last = now
    }

    /** The last frames' intervals (ms), oldest first: the graph. */
    intervals(): number[] {
        return this.frames.map(f => f.interval)
    }

    summary(now: number): FrameSummary | null {
        if (this.frames.length === 0) return null
        const recent = this.frames.filter(f => now - f.at <= 1000)
        const window = recent.length > 0 ? recent : this.frames.slice(-1)
        const sorted = this.frames.map(f => f.interval).sort((a, b) => a - b)
        const avgMs = mean(window.map(f => f.interval))
        const slowest = sorted.slice(-Math.max(1, Math.floor(sorted.length / 100)))
        const cpu = Object.fromEntries(SECTIONS.map(s => [s, mean(window.map(f => f.cpu[s]))])) as Record<
            Section,
            number
        >
        const hitched = this.frames.filter(f => now - f.at <= HITCH_WINDOW_MS && f.interval >= HITCH_MS)
        return {
            fps: avgMs > 0 ? 1000 / avgMs : 0,
            avgMs,
            p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!,
            worstMs: sorted.at(-1)!,
            low1Fps: 1000 / mean(slowest),
            cpu,
            cpuMs: SECTIONS.reduce((sum, s) => sum + cpu[s], 0),
            hitches: hitched.length,
            compileHitches: hitched.filter(f => f.compiled).length,
        }
    }
}

/**
 * What holds the frame rate back: the GPU (it takes longer to draw than the CPU to prepare), the
 * CPU, or neither (the display's refresh caps it). Without the GPU's time: a slow frame the CPU
 * spent mostly idle was probably waiting on the GPU; a quick one, the display.
 */
export function bottleneck(
    frameMs: number,
    cpuMs: number,
    gpuMs: number | null
): 'gpu' | 'likely-gpu' | 'cpu' | 'vsync' | null {
    if (gpuMs === null) {
        if (cpuMs > frameMs * 0.8) return 'cpu'
        if (frameMs > 20 && cpuMs < frameMs * 0.5) return 'likely-gpu'
        return frameMs <= 17.5 ? 'vsync' : null
    }
    const busiest = Math.max(cpuMs, gpuMs)
    if (busiest < frameMs * 0.75) return 'vsync'
    return gpuMs >= cpuMs ? 'gpu' : 'cpu'
}

function mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

// --- On the GPU --------------------------------------------------------------------------------

interface TimerQueryExt {
    TIME_ELAPSED_EXT: number
    GPU_DISJOINT_EXT: number
}

/**
 * The GPU's own time for a frame's drawing: a timer query round each frame, read back a few
 * frames later when it's ready. Null when the browser doesn't offer it (Firefox, Safari, some
 * Chrome setups).
 */
export class GpuTimer {
    private readonly ext: TimerQueryExt | null
    private readonly waiting: WebGLQuery[] = []
    private running: WebGLQuery | null = null
    private readonly times: number[] = []

    constructor(private readonly gl: WebGL2RenderingContext) {
        this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null
    }

    get available(): boolean {
        return this.ext !== null
    }

    begin(): void {
        if (!this.ext || this.running || this.waiting.length > 4) return
        const query = this.gl.createQuery()
        if (!query) return
        this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
        this.running = query
    }

    end(): void {
        if (!this.ext || !this.running) return
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
        this.waiting.push(this.running)
        this.running = null
        this.collect()
    }

    /** Average ms a frame over the last ones read back; null until there are some. */
    get ms(): number | null {
        return this.times.length === 0 ? null : mean(this.times)
    }

    private collect(): void {
        const gl = this.gl
        const disjoint = gl.getParameter(this.ext!.GPU_DISJOINT_EXT) as boolean
        while (this.waiting.length > 0) {
            const query = this.waiting[0]!
            if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break
            this.waiting.shift()
            if (!disjoint) {
                this.times.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6)
                if (this.times.length > 30) this.times.shift()
            }
            gl.deleteQuery(query)
        }
    }
}

// --- On the screen -----------------------------------------------------------------------------

/** Everything else the overlay shows, gathered by the game each time it's drawn. */
export interface PerfExtras {
    draw: { calls: number; triangles: number; programs: number; geometries: number; textures: number }
    screen: { width: number; height: number; pixelRatio: number; antialias: boolean }
    gpuName: string
    net: { pingMs: number | null; snapsPerSecond: number; kbInPerSecond: number; framesOutPerSecond: number }
    mouse: { raw: boolean | null; spikes: number; largestSpike: number; biggestMove: number }
}

const CSS = `
#fps-perf { position: fixed; left: 12px; top: 40px; z-index: 15; pointer-events: none; padding: 8px 10px; border-radius: 8px;
  background: rgba(12,14,18,.78); color: rgba(255,255,255,.85); font: 500 11px/1.45 ui-monospace, monospace; white-space: pre; }
#fps-perf b { color: #fff; font-weight: 700; }
#fps-perf .good { color: #7ee787; } #fps-perf .ok { color: #ffd166; } #fps-perf .bad { color: #ff6b6b; }
#fps-perf canvas { display: block; margin-bottom: 6px; }
#fps-perf.hidden { display: none; }
`

const GRAPH = { width: 300, height: 56, maxMs: 66 }

export class PerfOverlay {
    readonly stats = new FrameStats()
    private readonly root: HTMLDivElement
    private readonly graph: HTMLCanvasElement
    private readonly text: HTMLDivElement
    private shownAt = 0
    private on = false

    constructor() {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.append(style)
        this.root = document.createElement('div')
        this.root.id = 'fps-perf'
        this.root.className = 'hidden'
        this.graph = document.createElement('canvas')
        this.graph.width = GRAPH.width
        this.graph.height = GRAPH.height
        this.text = document.createElement('div')
        this.root.append(this.graph, this.text)
        document.body.append(this.root)
    }

    get visible(): boolean {
        return this.on
    }

    set visible(on: boolean) {
        this.on = on
        this.root.classList.toggle('hidden', !on)
    }

    /** Four times a second while shown: the numbers and the graph. */
    show(now: number, gpuMs: number | null, gpuTimer: boolean, extras: () => PerfExtras): void {
        if (!this.on || now - this.shownAt < 250) return
        this.shownAt = now
        const s = this.stats.summary(now)
        if (!s) return
        const x = extras()
        const grade = (ms: number) => (ms <= 17.5 ? 'good' : ms <= 33.5 ? 'ok' : 'bad')
        const ms = (v: number) => v.toFixed(1)
        const limit = bottleneck(s.avgMs, s.cpuMs, gpuMs)
        const verdict =
            limit === 'gpu'
                ? '<span class="bad">GPU-bound</span>: lower Resolution (Esc → Settings)'
                : limit === 'likely-gpu'
                  ? '<span class="bad">likely GPU-bound</span> (CPU idle most of the frame): lower Resolution'
                  : limit === 'cpu'
                    ? '<span class="bad">CPU-bound</span>'
                    : limit === 'vsync'
                      ? '<span class="good">capped by the display</span>'
                      : gpuTimer
                        ? 'measuring…'
                        : 'no GPU timer in this browser: compare CPU with the frame'
        const sections = SECTIONS.map(k => `${SECTION_NAMES[k]} ${ms(s.cpu[k])}`).join(' · ')
        const { width, height, pixelRatio, antialias } = x.screen
        const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n))
        const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } })
            .memory
        const net = x.net
        const mouse = x.mouse
        const lines = [
            `<b>FRAME</b>  <span class="${grade(s.avgMs)}">${s.fps.toFixed(0)} fps</span> · ${ms(s.avgMs)} ms · 95% ${ms(s.p95Ms)} · worst ${ms(s.worstMs)} · 1% low ${s.low1Fps.toFixed(0)} fps`,
            `<b>HITCH</b>  <span class="${s.hitches > 0 ? 'bad' : 'good'}">${s.hitches}</span> over ${HITCH_MS} ms in 10 s${s.compileHitches > 0 ? ` (${s.compileHitches} compiling shaders)` : ''}`,
            `<b>CPU</b>    <span class="${grade(s.cpuMs)}">${ms(s.cpuMs)} ms</span>: ${sections}`,
            `<b>GPU</b>    ${gpuMs === null ? (gpuTimer ? '…' : 'n/a') : `<span class="${grade(gpuMs)}">${ms(gpuMs)} ms</span>`} → ${verdict}`,
            `<b>DRAW</b>   ${x.draw.calls} calls · ${k(x.draw.triangles)} tris · ${x.draw.programs} shaders · ${x.draw.geometries} geometries · ${x.draw.textures} textures`,
            `<b>SCREEN</b> ${Math.round(width * pixelRatio)}×${Math.round(height * pixelRatio)} px (${width}×${height} × ${pixelRatio.toFixed(2)})${antialias ? ' · MSAA' : ''}`,
            `<b>DEVICE</b> ${escapeText(x.gpuName)}`,
            `<b>MEMORY</b> ${heap ? `JS heap ${(heap.usedJSHeapSize / 1e6).toFixed(0)} / ${(heap.jsHeapSizeLimit / 1e6).toFixed(0)} MB` : 'n/a'}`,
            `<b>NET</b>    ping ${net.pingMs === null ? '…' : `${net.pingMs.toFixed(0)} ms`} · ${net.snapsPerSecond.toFixed(0)} snapshots/s · ${net.kbInPerSecond.toFixed(1)} KB/s in · ${net.framesOutPerSecond.toFixed(0)} frames/s out`,
            `<b>MOUSE</b>  raw input ${mouse.raw === null ? '…' : mouse.raw ? 'on' : 'off'} · spikes dropped <span class="${mouse.spikes > 0 ? 'ok' : 'good'}">${mouse.spikes}</span>${mouse.spikes > 0 ? ` (largest ${mouse.largestSpike} px)` : ''} · fastest move ${mouse.biggestMove} px`,
        ]
        this.text.innerHTML = lines.join('\n')
        this.drawGraph()
    }

    /** The last frames, one bar each: green within 60 fps, yellow within 30, red beyond. */
    private drawGraph(): void {
        const g = this.graph.getContext('2d')
        if (!g) return
        const { width, height, maxMs } = GRAPH
        g.clearRect(0, 0, width, height)
        g.fillStyle = 'rgba(255,255,255,.06)'
        g.fillRect(0, 0, width, height)
        const y = (v: number) => height - (Math.min(v, maxMs) / maxMs) * height
        const intervals = this.stats.intervals()
        const bar = width / 240
        intervals.forEach((v, i) => {
            g.fillStyle = v <= 17.5 ? '#7ee787' : v <= 33.5 ? '#ffd166' : '#ff6b6b'
            g.fillRect(width - (intervals.length - i) * bar, y(v), Math.max(1, bar - 0.25), height - y(v))
        })
        g.strokeStyle = 'rgba(255,255,255,.35)'
        g.setLineDash([3, 3])
        for (const line of [16.7, 33.3]) {
            g.beginPath()
            g.moveTo(0, y(line) + 0.5)
            g.lineTo(width, y(line) + 0.5)
            g.stroke()
        }
        g.setLineDash([])
    }
}

function escapeText(text: string): string {
    return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
