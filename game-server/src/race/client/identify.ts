import * as THREE from 'three'
import type { Building } from '../map/format.ts'

/**
 * Press I to identify the building under the crosshair: its name, OSM
 * element and whether it has a landmark file, with buttons to copy a
 * reference (element and camera link, ready to paste into a request for
 * detail) or open it on openstreetmap.org.
 *
 * Meshes answer for themselves: a mesh's `userData.identify(faceIndex)`
 * returns the building that triangle belongs to.
 */

export type Identify = (faceIndex: number) => Building | undefined

export function setupIdentify(
    camera: THREE.Camera,
    targets: THREE.Object3D[],
    panel: HTMLElement,
    canvas: HTMLElement
) {
    const raycaster = new THREE.Raycaster()
    const centre = new THREE.Vector2(0, 0)

    document.addEventListener('keydown', event => {
        if (event.code !== 'KeyI') return
        if (!panel.hidden) {
            panel.hidden = true
            return
        }

        raycaster.setFromCamera(centre, camera)
        const building = raycaster
            .intersectObjects(targets, true)
            .map(hit => (hit.object.userData.identify as Identify | undefined)?.(hit.faceIndex ?? 0))
            .find(found => found !== undefined)

        show(panel, building)
        document.exitPointerLock()
    })

    // Going back to flying closes the panel.
    canvas.addEventListener('click', () => {
        panel.hidden = true
    })
}

function show(panel: HTMLElement, building: Building | undefined): void {
    panel.replaceChildren()
    panel.hidden = false

    if (!building) {
        panel.append(line('Nothing under the crosshair.'))
        return
    }

    const type = building.relation ? 'relation' : 'way'
    const name = building.name ?? 'Unnamed building'
    const reference = `OSM ${type} ${building.id} (${name}), view: ${location.href}`

    const title = document.createElement('strong')
    title.textContent = name
    panel.append(
        title,
        line(`OSM ${type} ${building.id}`),
        line(
            building.landmark
                ? 'Has a landmark file.'
                : building.detail
                  ? 'Detail from OSM building parts; no landmark file yet.'
                  : 'Plain OSM footprint; no landmark file yet.'
        ),
        button('Copy reference', async target => {
            await navigator.clipboard.writeText(reference)
            target.textContent = 'Copied'
        }),
        button('Open in OSM', () => window.open(`https://www.openstreetmap.org/${type}/${building.id}`, '_blank'))
    )
}

function line(text: string): HTMLElement {
    const element = document.createElement('div')
    element.textContent = text

    return element
}

function button(label: string, onClick: (target: HTMLButtonElement) => void): HTMLButtonElement {
    const element = document.createElement('button')
    element.textContent = label
    element.addEventListener('click', event => {
        event.stopPropagation()
        onClick(element)
    })

    return element
}

/**
 * For a mesh merged from many buildings: which building a triangle belongs
 * to, from the first vertex of each building's geometry (non-indexed, three
 * vertices a triangle).
 */
export function identifyByRanges(buildings: Building[], firstVertices: number[]): Identify {
    return faceIndex => {
        const vertex = faceIndex * 3
        let low = 0
        let high = firstVertices.length - 1
        while (low < high) {
            const middle = (low + high + 1) >> 1
            if (firstVertices[middle]! <= vertex) low = middle
            else high = middle - 1
        }

        return buildings[low]
    }
}
