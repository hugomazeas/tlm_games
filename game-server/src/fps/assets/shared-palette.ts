import { CanvasTexture, DoubleSide, type Material, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Materials both maps have, with the same look in each: what an asset marked `palette: 'shared'`
 * is built with (it may then stand in the office and on Rue des Érables alike). Both palettes list
 * these names (`ERABLES_MATERIALS`, `OFFICE_MATERIALS`) and both maps make them with
 * `makeSharedMaterials` (the servers' plain stand-ins come with their palettes).
 */
export const SHARED_MATERIALS = [
    'pingPongTop',
    'pingPongLines',
    'pingPongMesh',
    'pingPongFrame',
    'pingPongStrut',
    'caster',
    'paddleRubber',
    'paddleHandle',
] as const
export type SharedMaterial = (typeof SHARED_MATERIALS)[number]

/** The shared materials (in the browser: the net is drawn on a canvas). */
export function makeSharedMaterials(): Record<SharedMaterial, Material> {
    const std = (opts: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial(opts)
    // The net: dark blue cord over a see-through fill, a cell every ~1.3 cm on a 1.6 × 0.14 m net.
    // Blended, not cut out: from across the room its cells average to a dark band you can see (a
    // cut-out of cords thinner than a pixel vanished).
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const g = canvas.getContext('2d')!
    g.fillStyle = 'rgba(30, 52, 112, 0.45)'
    g.fillRect(0, 0, 16, 16)
    g.strokeStyle = 'rgba(12, 22, 48, 1)'
    g.lineWidth = 3
    g.strokeRect(0, 0, 16, 16)
    const net = new CanvasTexture(canvas)
    net.colorSpace = SRGBColorSpace
    net.wrapS = net.wrapT = RepeatWrapping
    net.repeat.set(122, 10)
    return {
        // Bright tournament blue, satin.
        pingPongTop: std({ color: 0x2c5fc4, roughness: 0.5 }),
        pingPongLines: std({ color: 0xf4f4f0, roughness: 0.5 }),
        pingPongMesh: std({ map: net, transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.9 }),
        // Black powder-coated steel (the edge, the legs, the net posts) and the silver struts.
        pingPongFrame: std({ color: 0x16181b, roughness: 0.45, metalness: 0.3 }),
        pingPongStrut: std({ color: 0xb8bdc3, roughness: 0.35, metalness: 0.7 }),
        caster: std({ color: 0x1b1c1e, roughness: 0.85 }),
        paddleRubber: std({ color: 0xb3202a, roughness: 0.75 }),
        paddleHandle: std({ color: 0xc89f6c, roughness: 0.6 }),
    }
}
