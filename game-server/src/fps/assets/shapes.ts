import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * A box with rounded vertical edges that tapers: `w0` × `d0` at its foot (y = 0), `w1` × `d1` at
 * its top (y = h), its corners rounded `r` (moulded plastic: a wheeled bin, a composter). Smooth
 * round the sides, flat on its top and bottom (`caps`: which to close).
 */
export function taperedBox(
    w0: number,
    d0: number,
    w1: number,
    d1: number,
    h: number,
    r: number,
    caps: { top?: boolean; bottom?: boolean } = { top: true, bottom: true },
    arc = 5
): BufferGeometry {
    const ring = (w: number, d: number, y: number): number[][] => {
        const points: number[][] = []
        const corners = [
            [w / 2 - r, d / 2 - r, 0],
            [-(w / 2 - r), d / 2 - r, Math.PI / 2],
            [-(w / 2 - r), -(d / 2 - r), Math.PI],
            [w / 2 - r, -(d / 2 - r), (Math.PI * 3) / 2],
        ] as const
        for (const [cx, cz, a0] of corners)
            for (let i = 0; i <= arc; i++) {
                const a = a0 + (i / arc) * (Math.PI / 2)
                points.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r])
            }
        return points
    }
    const bottom = ring(w0, d0, 0)
    const top = ring(w1, d1, h)
    const n = bottom.length
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    // Sides: the two rings, shared vertices (smooth), quads between them (outward: counter-clockwise from outside).
    for (let i = 0; i < n; i++) {
        positions.push(...bottom[i]!, ...top[i]!)
        uvs.push(i / n, 0, i / n, 1)
    }
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const [b0, t0, b1, t1] = [i * 2, i * 2 + 1, j * 2, j * 2 + 1]
        index.push(b0, t1, b1, b0, t0, t1)
    }
    // Caps: their own vertices (flat), fans from the middle.
    const cap = (points: number[][], y: number, up: boolean) => {
        const centre = positions.length / 3
        positions.push(0, y, 0)
        uvs.push(0.5, 0.5)
        for (const p of points) {
            positions.push(...p)
            uvs.push(0.5 + p[0]! / Math.max(w0, w1), 0.5 + p[2]! / Math.max(d0, d1))
        }
        for (let i = 0; i < n; i++) {
            const a = centre + 1 + i
            const b = centre + 1 + ((i + 1) % n)
            if (up) index.push(centre, b, a)
            else index.push(centre, a, b)
        }
    }
    if (caps.top) cap(top, h, true)
    if (caps.bottom) cap(bottom, 0, false)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
}
