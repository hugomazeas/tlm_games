import { Glob } from 'bun'

const SOURCES = `${import.meta.dir}/..`
const ENTRY = `${import.meta.dir}/lab-client.ts`

/** The lab's script; a build error becomes a script that shows it (and reloads once it's fixed). */
export async function buildLab(): Promise<string> {
    try {
        const result = await Bun.build({ entrypoints: [ENTRY], target: 'browser', format: 'esm', sourcemap: 'inline' })
        const output = result.outputs[0]
        if (result.success && output) return await output.text()
        return errorScript(result.logs.map(String).join('\n'))
    } catch (error) {
        return errorScript(String(error))
    }
}

/** Changes whenever a source file under src/fps does (reviews.json aside: a verdict needn't reload the page). */
export async function sourcesVersion(): Promise<string> {
    let newest = 0
    let count = 0
    for await (const path of new Glob('**/*.{ts,js}').scan({ cwd: SOURCES, absolute: true })) {
        const stat = await Bun.file(path).stat()
        newest = Math.max(newest, stat.mtimeMs)
        count++
    }
    return `${newest}-${count}`
}

function errorScript(error: string): string {
    return `
        const pre = document.createElement('pre')
        pre.style.cssText = 'margin:16px;padding:16px;border-radius:8px;background:#1d1f23;color:#ff9a8a;white-space:pre-wrap;font:13px/1.45 ui-monospace,monospace'
        pre.textContent = ${JSON.stringify(`The asset lab didn't build:\n\n${error}`)}
        document.body.append(pre)
        let seen = null
        setInterval(async () => {
            const v = await (await fetch('/version', { cache: 'no-store' })).text().catch(() => seen)
            if (seen !== null && v !== seen) location.reload()
            seen = v
        }, 700)
    `
}
