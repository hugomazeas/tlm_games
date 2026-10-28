/**
 * A city map for the racing game, built once from OpenStreetMap and the
 * federal elevation model by `build.ts`, then committed. The browser draws it
 * and, later, the server will collide against it: neither ever calls OSM.
 *
 * Units are metres around the centre of the area. x points east, z points
 * south and y is up, matching Three.js, so north is towards -z.
 */
export interface RaceMap {
    name: string
    attribution: string
    /** The latitude and longitude at x = 0, z = 0. */
    origin: { lat: number; lon: number }
    width: number
    depth: number
    terrain: Terrain
    buildings: Building[]
    roads: Road[]
    areas: Area[]
    /** Where drivable roads meet, as flat [x, z, radius, …] triples: lane lines and sidewalks stop short of them. */
    junctions: number[]
    /** Zebra crossings, as flat [x, z, dx, dz, length, …]: the centre, the unit direction across the road, and its length. */
    crossings: number[]
    /**
     * Stop signs, as flat [x, z, dx, dz, width, …]: where the stop line
     * crosses the road's centre, the unit direction traffic comes in from
     * towards the junction, and the road's width.
     */
    stops: number[]
    /** Fortifications and other free-standing walls. */
    walls: Wall[]
    props: Props
    /** Fountains, statues, hedges, fences, lamps, flowerbeds and the like (decor.ts). */
    decor: Decor
}

/**
 * A race track (a course): gates to pass in order, `laps` times round.
 * Gate 0 is the start and finish line. Tracks live in the Hub's database and
 * reach the game in latitude/longitude (see courses.ts), never in map.json.
 */
export interface Course {
    /** The course file's name without .json. */
    slug: string
    name: string
    laps: number
    gates: Gate[]
}

/** A line across the road centred at x, z, `width` wide, crossed going along (dx, dz). */
export interface Gate {
    x: number
    z: number
    dx: number
    dz: number
    width: number
}

export interface Wall {
    name?: string
    points: number[]
    height: number
    thickness: number
}

/**
 * Ground height on a regular grid covering the whole map, row by row from
 * the north edge, each row from west to east.
 */
export interface Terrain {
    cols: number
    rows: number
    /** Distance between two samples, in metres. */
    cell: number
    heights: number[]
    /** Anything at or below this height is the river. */
    waterLevel: number
}

/** A footprint extruded from `base` up to `top`. Points are a flat [x, z, x, z, …] list. */
export interface Building {
    /** The OSM id: of a way, or of a relation when `relation` is set (OSM numbers the two separately). */
    id: number
    relation?: true
    name?: string
    base: number
    top: number
    outline: number[]
    holes?: number[][]
    /** Overrides the colour picked from the palette (stone for city gates). */
    colour?: string
    /** A pitched roof (or a coloured flat one): the walls stop `roof.height` below `top`. */
    roof?: Roof
    /** Windows other than the usual ones for its height (false: none), and their glass. */
    windows?: WindowGrid | false
    glass?: string
    material?: WallMaterial
    /** Detail from a landmark file or from OSM's building parts; without it the footprint is drawn as a plain box. */
    detail?: BuildingDetail
    /** Set when the detail comes from a landmark file. */
    landmark?: true
}

export type RoofShape = 'mansard' | 'pyramid' | 'flat' | 'gable' | 'hip'

/**
 * A roof on top of walls. A mansard slopes in by `inset` over `height`, then
 * is flat; a pyramid meets in a point; a hip roof slopes in from every side
 * to a ridge; a gable roof slopes from two sides to a ridge along the
 * footprint's length, its ends walled up; a flat roof just closes the top.
 */
export interface Roof {
    shape: RoofShape
    height: number
    inset?: number
    colour: string
    /** A low wall round the edge of a flat roof, this many metres high. */
    parapet?: number
}

/**
 * How windows look: tall framed ones (punched, the default), small square
 * ones, round-headed ones (arched), continuous bands of glass (ribbon), or a
 * wall of glass between thin mullions (curtain).
 */
export type WindowStyle = 'punched' | 'square' | 'arched' | 'ribbon' | 'curtain'

/** Rows of windows on the walls: one per `spacing` metres along, one per `floor` metres up. */
export interface WindowGrid {
    floor: number
    spacing: number
    style?: WindowStyle
}

/**
 * Balconies or floor slabs standing out of the walls: a slab `height` thick
 * and `depth` deep every `floor` metres, the first at map height `first`.
 */
export interface Bands {
    floor: number
    depth: number
    height: number
    first: number
    colour?: string
}

/**
 * Vertical concrete ribs standing out of the walls, every `spacing` metres,
 * `width` wide and `depth` deep, with the wall between them in `recess`.
 * They take the place of windows.
 */
export interface Fins {
    spacing: number
    width: number
    depth: number
    recess: string
}

/**
 * A ground floor of arched openings: `height` tall (it sets the arches'
 * proportions), ending at `top` (map height, so it follows the ground, not
 * the walls' buried base), `depth` deep, one arch every `spacing` metres.
 * Only on the outline's `edges` (indexes of the edge starting at each
 * point), the ones facing the street.
 */
export interface Arcade {
    height: number
    top: number
    depth: number
    spacing: number
    edges: number[]
}

/**
 * What walls are made of, drawn faintly over their colour up close: brick
 * courses, stone blocks, concrete panels, or wooden siding. Plain by default.
 */
export type WallMaterial = 'plain' | 'brick' | 'stone' | 'concrete' | 'siding'

/** How walls look: their colour and material, and windows (with their glass), fins, balconies or an arcade. */
export interface Look {
    wall: string
    material?: WallMaterial
    windows?: WindowGrid
    /** The windows' glass; a dark blue-grey by default. */
    glass?: string
    fins?: Fins
    arcade?: Arcade
    bands?: Bands
}

export interface BuildingDetail extends Look {
    /** Where the walls of the footprint stop; the roof starts there. */
    wallTop: number
    roof?: Roof
    /** Extra volumes (pavilions, towers) standing on or out of the building. */
    parts: BuildingPart[]
}

export interface BuildingPart {
    /** A flat [x, z, …] ring. */
    outline: number[]
    base: number
    wallTop: number
    roof?: Roof
    /** Its own look; without one it looks like the building. */
    look?: Look
}

/** Drivable kinds first; a `sidewalk` is a footway mapped on its own beside a street. */
export type RoadKind = 'major' | 'street' | 'service' | 'path' | 'sidewalk'

/** Which side of a road, looking along the order of its points. */
export type Sides = 'both' | 'left' | 'right'

export interface Road {
    kind: RoadKind
    /** Width of the carriageway, kerb to kerb. */
    width: number
    points: number[]
    lanes?: number
    oneway?: boolean
    sidewalks?: Sides
    bikeLanes?: Sides
    /** The street's name, from OSM (drivable roads only): the track editor labels the map with it. */
    name?: string
}

/** Street furniture, each kind a flat list. */
export interface Props {
    /** [x, z, height, crown, kind, …]: ground to treetop and crown width in metres, kind an index into TREE_KINDS (trees.ts). */
    trees: number[]
    benches: number[]
    /** [x, z, dx, dz, reach, …]: the pole at the kerb, and its mast arm reaching `reach` metres over the road along (dx, dz). */
    signals: number[]
    /** [x, z, angle, …]: beside the road, the angle being the road's direction there. */
    busStops: number[]
}

/** Things on the ground that aren't buildings, as plain shapes, and the ground painted under them. */
export interface Decor {
    shapes: Shape[]
    /** Lawns, paving, gravel, soil: painted on the ground over the parks, under the roads. */
    paint: Paint[]
}

export type ShapeKind = 'box' | 'cylinder' | 'cone' | 'sphere' | 'pyramid' | 'prism'

/**
 * One block of decor standing at x, z with its base at map height `y`:
 * `width` along its own x, `depth` along its z, turned `turn` radians about
 * the vertical (as Three.js turns things). A prism follows its own outline
 * instead, in map metres, and ignores x, z, width, depth and turn.
 */
export interface Shape {
    shape: ShapeKind
    x: number
    y: number
    z: number
    width: number
    depth: number
    height: number
    turn: number
    colour: string
    /** A cylinder's top as a share of its bottom: 0 a cone, above 1 a bowl. */
    taper?: number
    /** Karts bump into it. */
    solid?: true
    /** See-through: water falling, a jet. */
    water?: true
    outline?: number[]
}

export interface Paint {
    colour: string
    outline: number[]
}

export type AreaKind = 'park' | 'wood' | 'water' | 'parking'

export interface Area {
    kind: AreaKind
    outline: number[]
}
