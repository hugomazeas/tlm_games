import { describe, expect, test } from 'bun:test'
import { cityTreesFromCsv, parseCsv } from './fetch.ts'
import type { Area } from './format.ts'
import {
    blockedGround,
    cityTree,
    fillWoods,
    flattenTrees,
    mergeTrees,
    osmTree,
    type Tree,
    TREE_KINDS,
    treeKind,
    treeSize,
} from './trees.ts'

describe('treeKind', () => {
    test('reads the shape from the species and cultivar', () => {
        expect(treeKind('Picea pungens', false)).toBe('conifer')
        expect(treeKind('Larix decidua', false)).toBe('conifer')
        expect(treeKind("Quercus robur 'Fastigiata'", false)).toBe('columnar')
        expect(treeKind("Acer rubrum 'Armstrong'", false)).toBe('columnar')
        expect(treeKind('Thuja occidentalis', true)).toBe('columnar')
        expect(treeKind("Acer platanoides 'Crimson King'", false)).toBe('purple')
        expect(treeKind("Syringa reticulata 'Ivory Silk'", false)).toBe('ornamental')
        expect(treeKind('Malus x', false)).toBe('ornamental')
        expect(treeKind('Ulmus americana', false)).toBe('broadleaf')
    })

    test('trusts the inventory saying conifer for a genus it doesn’t know', () => {
        expect(treeKind('Metasequoia glyptostroboides', true)).toBe('conifer')
    })
})

describe('treeSize', () => {
    test('a sapling is small, a century-old elm towers and spreads', () => {
        const sapling = treeSize('broadleaf', 5)
        expect(sapling.height).toBeGreaterThan(4)
        expect(sapling.height).toBeLessThan(7)
        expect(sapling.crown).toBeLessThan(3)

        const elm = treeSize('broadleaf', 90, 'Ulmus americana')
        expect(elm.height).toBeGreaterThan(22)
        expect(elm.crown).toBeGreaterThan(18)
    })

    test('grows with the trunk', () => {
        let previous = treeSize('broadleaf', 5)
        for (const diameter of [15, 30, 60, 100]) {
            const next = treeSize('broadleaf', diameter)
            expect(next.height).toBeGreaterThan(previous.height)
            expect(next.crown).toBeGreaterThanOrEqual(previous.crown)
            previous = next
        }
    })

    test('flowering trees stay small, columns stay narrow, conifers are cones', () => {
        expect(treeSize('ornamental', 60).height).toBeLessThan(9.5)
        const column = treeSize('columnar', 40)
        expect(column.crown).toBeLessThan(column.height / 3)
        const spruce = treeSize('conifer', 40)
        expect(spruce.crown).toBeLessThan(spruce.height / 2)
    })

    test('a tree with no diameter gets a typical one', () => {
        expect(treeSize('broadleaf', undefined)).toEqual(treeSize('broadleaf', 20))
    })
})

describe('cityTree', () => {
    test('a stump diameter counts for less than one at breast height', () => {
        const atStump = cityTree({ lat: 0, lon: 0, taxon: 'Acer saccharinum', diameter: 50, stump: true }, 1, 2)
        expect(atStump).toEqual({ x: 1, z: 2, kind: 'broadleaf', ...treeSize('broadleaf', 40) })
    })
})

describe('osmTree', () => {
    test('uses the tagged height and crown', () => {
        expect(osmTree({ natural: 'tree', height: '15', diameter_crown: '20' }, 0, 0)).toMatchObject({
            height: 15,
            crown: 20,
            kind: 'broadleaf',
        })
    })

    test('an untagged tree is a mature park tree, and needle leaves make a conifer', () => {
        const tree = osmTree({ natural: 'tree' }, 10, 20)
        expect(tree.height).toBeGreaterThan(14)
        expect(tree.crown).toBeGreaterThan(10)
        expect(osmTree({ natural: 'tree', leaf_type: 'needleleaved' }, 10, 20).kind).toBe('conifer')
    })

    test('is the same tree every build', () => {
        expect(osmTree({}, 123.4, -56.7)).toEqual(osmTree({}, 123.4, -56.7))
    })
})

describe('mergeTrees', () => {
    const tree = (x: number, z: number, kind: Tree['kind'] = 'broadleaf'): Tree => ({
        x,
        z,
        kind,
        height: 10,
        crown: 6,
    })

    test('drops an OSM tree that is a city tree mapped twice, keeps the others', () => {
        const merged = mergeTrees([tree(0, 0)], [tree(2, 2, 'conifer'), tree(30, 0, 'conifer')])
        expect(merged).toEqual([tree(0, 0), tree(30, 0, 'conifer')])
    })
})

describe('fillWoods', () => {
    const square = (kind: Area['kind'], size: number): Area => ({ kind, outline: [0, 0, size, 0, size, size, 0, size] })
    const open = () => false

    test('fills a wood with trees about 7 m apart', () => {
        const trees = fillWoods([square('wood', 70)], open, [])
        // 100 cells; a few lose their tree to a close neighbour.
        expect(trees.length).toBeGreaterThan(80)
        expect(trees.length).toBeLessThanOrEqual(100)
        for (const tree of trees) {
            expect(tree.x).toBeGreaterThanOrEqual(0)
            expect(tree.x).toBeLessThanOrEqual(70)
            expect(['broadleaf', 'conifer']).toContain(tree.kind)
            expect(tree.height).toBeGreaterThan(10)
        }
    })

    test('makes the same wood every time', () => {
        expect(fillWoods([square('wood', 50)], open, [])).toEqual(fillWoods([square('wood', 50)], open, []))
    })

    test('leaves parks, blocked ground and the space round standing trees alone', () => {
        expect(fillWoods([square('park', 70)], open, [])).toEqual([])
        expect(fillWoods([square('wood', 70)], (x: number) => x < 35, []).every(tree => tree.x >= 35)).toBe(true)
        const standing: Tree = { x: 35, z: 35, height: 20, crown: 12, kind: 'broadleaf' }
        for (const tree of fillWoods([square('wood', 70)], open, [standing])) {
            expect(Math.hypot(tree.x - 35, tree.z - 35)).toBeGreaterThanOrEqual(3.5)
        }
    })
})

describe('blockedGround', () => {
    const blocked = blockedGround(
        200,
        200,
        [{ width: 10, points: [-100, 0, 100, 0] }],
        [[20, 20, 40, 20, 40, 40, 20, 40]],
        x => x > 90
    )

    test('roads and a margin either side, buildings and water are blocked; open ground is free', () => {
        expect(blocked(0, 0)).toBe(true)
        expect(blocked(0, 5)).toBe(true)
        expect(blocked(0, 10)).toBe(false)
        expect(blocked(30, 30)).toBe(true)
        expect(blocked(50, 50)).toBe(false)
        expect(blocked(95, 50)).toBe(true)
    })

    test('off the map is blocked', () => {
        expect(blocked(150, 50)).toBe(true)
    })
})

describe('flattenTrees', () => {
    test('writes x, z, height, crown and the kind’s index', () => {
        expect(flattenTrees([{ x: 1.04, z: -2, height: 12.5, crown: 8, kind: 'conifer' }])).toEqual([
            1,
            -2,
            12.5,
            8,
            TREE_KINDS.indexOf('conifer'),
        ])
    })
})

describe('the city’s inventory', () => {
    const csv = [
        '﻿ID,TYPE_LIEU,NOM_LATIN,NOM_FRANCAIS,TYPE_ARBRE,DIAMETRE,POSITION_MESURE,LATITUDE,LONGITUDE,NOM_TOPOGRAPHIE',
        '1,Lieu public,Picea pungens,épinette du Colorado,Conifère,30,DHP,46.80,-71.22,"Parc, du Bois"',
        '2,tronçon,"Acer saccharinum",érable argenté,Feuillu,12,DHS,46.79,-71.21,Rue X',
        '3,tronçon,Ulmus americana,orme,Feuillu,,DHP,47.5,-71.22,Ailleurs',
    ].join('\r\n')

    test('keeps the trees on the map, sorted, with their species, kind and diameter', () => {
        const trees = cityTreesFromCsv(csv, { south: 46.7, west: -71.3, north: 46.9, east: -71.1 })
        expect(trees).toEqual([
            { lat: 46.79, lon: -71.21, taxon: 'Acer saccharinum', diameter: 12, stump: true },
            { lat: 46.8, lon: -71.22, taxon: 'Picea pungens', conifer: true, diameter: 30 },
        ])
    })

    test('reads quoted fields with commas and quotes in them', () => {
        expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([
            ['a', 'b, c', 'd "e"'],
            ['1', '2', '3'],
        ])
    })
})
