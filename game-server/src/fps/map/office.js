// Office map — procedural three.js rebuild of the office (3rd floor), traced from the floorplan
// and the LiDAR scan. Units are metres: floor at y = 0, ceiling at y = H (2.7), street at y = -7.
//
// Brought over from ~/office-map/office.js (2026-11-02) and split in two so the game server can
// build the same office without a browser; this copy is now the source.
//
//   buildOfficeGeometry()          anywhere (Bun included): the shapes, colliders, spawn points and
//                                  the exact collision meshes. No DOM, no renderer.
//   buildOffice(scene, renderer)   the browser: textured materials, sky, sun, ambient, baking,
//                                  on top of the same geometry.
//
//   office.collision  -> { solid, glass }: triangle meshes of the real geometry with a BVH
//                        (geometry.boundsTree) for exact capsule / ray collisions
//   office.colliders  -> [{ center: [x,y,z], half: [hx,hy,hz], rotY, tag }]  (coarse boxes, for AI)
//   office.spawnPoints, office.doors, office.ceiling, office.setTime(i)
//
// Both builds place every object from the same seeded random numbers, so the server's collision
// is the triangles the browser draws. Types: office.d.ts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { Builder } from '../assets/kit.ts';
import { place } from '../assets/place.ts';
import { addSource, assetOf } from '../assets/sources.ts';
import { OFFICE_MATERIALS } from '../assets/office-palette.ts';
import { makeSharedMaterials } from '../assets/shared-palette.ts';
import {
  AIR_DIFFUSER, ARCHERY_TARGET, BAR_COUNTER, BASEBOARD_HEATER, BEAN_BAG, BOWL_LAMP, CEILING_PANEL, CITY_BUILDING,
  CLOSET_SHELVES, CLUB_ARMCHAIR, DESK_END_PANEL, DESK_HUTCH, DESK_SLAB, DUMBBELL, EXIT_SIGN, FRAMED_ART, FRUIT,
  KITCHENETTE, LAPTOP, LED_STRIP, LOUNGE_SOFA, MONITOR, MUG, NOTICE, OFFICE_CHAIR, OFFICE_DESK, OTTOMAN, PEDESTAL,
  PENDANT_LIGHT, PILLAR, POTTED_PLANT, PRINTER_CABINET, PRIVACY_SCREEN, RECYCLING_BIN, ROUND_TABLE,
  SKYLINE_TOWER, SPRINKLER, SQUARE_ISLAND, STANDING_DESK, STREET_TREE, TROUGH_PLANTER, TV_DESK, VERTICAL_BLINDS,
  WASTE_BIN, WHITEBOARD, YOGA_MAT,
} from '../assets/catalog/office.ts';
import { PING_PONG_TABLE } from '../assets/catalog/interior.ts';

export const H = 2.7;          // ceiling height
export const GROUND = -7.0;    // street level (the office is on the 3rd floor)

// Floorplan pixels -> metres, fitted to the scan's walls (scene metres == scan metres).
const SX = 0.017514, SZ = 0.017113, OX = 638.7, OY = 370.8, S = SX;
const X = (px) => (px - OX) * SX;
const Z = (py) => (py - OY) * SZ;
const V = (px, py) => new THREE.Vector2(X(px), Z(py));
export const fromPlan = (px, py) => ({ x: X(px), z: Z(py) });

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Times of day for setTime(). Azimuth: 0 = +Z (south on the plan), 270 = -X (west).
export const TIMES = [
  { name: 'Afternoon', elev: 26, azim: 332, sun: 3.5, color: 0xffe6c4, turb: 3, ray: 1.2, hemi: 1.0 },
  { name: 'Golden hour', elev: 9, azim: 300, sun: 3.2, color: 0xffa860, turb: 6, ray: 2.5, hemi: .75 },
];

// Spawn points: one per room, eye height is up to the player controller (y = floor).
// yaw: radians around +Y, 0 looks toward -Z (three.js camera default).
export const SPAWN_POINTS = [
  { name: 'open office', position: [2.8, 0, 1.0], yaw: Math.PI / 2 },
  { name: 'office 1 east', position: [7.9, 0, 1.0], yaw: Math.PI / 2 },
  { name: 'lounge', position: [5.0, 0, -.2], yaw: 0 },
  { name: 'office 2', position: [2.5, 0, -3.9], yaw: -Math.PI / 2 },
  { name: 'middle room', position: [-2.0, 0, -3.4], yaw: Math.PI / 2 },
  { name: 'bar room', position: [-6.3, 0, -3.5], yaw: -Math.PI / 4 },
  { name: 'kitchen', position: [-8.4, 0, -2.2], yaw: Math.PI },
  { name: 'meeting area', position: [-5.6, 0, -.4], yaw: Math.PI / 2 },
  { name: 'closed office', position: [-3.4, 0, 3.6], yaw: Math.PI * .75 },
];

/**
 * The browser's materials: procedural canvas textures (needs a DOM) on standard materials.
 * `texture(w, h, draw)` paints one more canvas texture for the props that carry their own.
 */
export function createOfficeMaterials(renderer) {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // -------------------------------------------------------------------------
  // Procedural textures
  // -------------------------------------------------------------------------
  function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, metres = 1, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / metres, 1 / metres);
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // Tileable value noise on a unit square.
  function noise(seed, period) {
    const r = rng(seed), g = Float32Array.from({ length: period * period }, r);
    const at = (i, j) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
    return (u, v) => {
      const x = u * period, y = v * period, xi = Math.floor(x), yi = Math.floor(y);
      let xf = x - xi, yf = y - yi;
      xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
      const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf;
      const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
      return a + (b - a) * yf;
    };
  }
  // Paint colour + height per pixel; returns { map, normalMap, roughnessMap? }.
  function paint(n, metres, fn, normalStrength = 2, roughFn = null) {
    const c = canvas(n), h = canvas(n), r = roughFn ? canvas(n) : null;
    const ci = c.getContext('2d').createImageData(n, n), hd = new Float32Array(n * n);
    const ri = r ? r.getContext('2d').createImageData(n, n) : null;
    const out = [0, 0, 0, 0];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      fn(x / n, y / n, out);
      const i = y * n + x;
      ci.data[i * 4] = out[0]; ci.data[i * 4 + 1] = out[1]; ci.data[i * 4 + 2] = out[2]; ci.data[i * 4 + 3] = 255;
      hd[i] = out[3];
      if (ri) { const v = roughFn(x / n, y / n) * 255; ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = v; ri.data[i * 4 + 3] = 255; }
    }
    c.getContext('2d').putImageData(ci, 0, 0);
    if (ri) r.getContext('2d').putImageData(ri, 0, 0);
    const ni = h.getContext('2d').createImageData(n, n);
    const hh = (x, y) => hd[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (hh(x + 1, y) - hh(x - 1, y)) * normalStrength, dy = (hh(x, y + 1) - hh(x, y - 1)) * normalStrength;
      const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      ni.data[i] = (-dx / l * .5 + .5) * 255; ni.data[i + 1] = (dy / l * .5 + .5) * 255; ni.data[i + 2] = (1 / l * .5 + .5) * 255; ni.data[i + 3] = 255;
    }
    h.getContext('2d').putImageData(ni, 0, 0);
    const res = { map: tex(c, metres), normalMap: tex(h, metres, false) };
    if (r) res.roughnessMap = tex(r, metres, false);
    return res;
  }
  const clamp255 = (v) => Math.max(0, Math.min(255, v));

  // Carpet tiles, 50 cm, quarter-turned stripes like the scan's office carpet: 2 m a repeat, each of
  // its 16 tiles its own dye lot and pile direction, a broad wear (paths darker, corners fresher).
  const carpetT = (() => {
    const n1 = noise(1, 256), n2 = noise(2, 32), wear = noise(4, 3), pile = noise(5, 512), tone = rng(3);
    const tones = Array.from({ length: 16 }, () => (tone() - .5) * 14);
    return paint(1024, 2, (u, v, o) => {
      const tx = Math.floor(u * 4), ty = Math.floor(v * 4), lu = (u * 4) % 1, lv = (v * 4) % 1;
      const s = (tx + ty) % 2 === 0 ? lu : lv;
      const stripe = Math.sin((s * 40 + n2(u, v) * 2) * Math.PI * 2) * .5 + .5;
      const fine = n1(u, v);
      const seam = (lu < .008 || lv < .008) ? -18 : 0;
      const worn = (wear(u, v) - .5) * 12;
      // The stripe faint (strong, it shimmered at a distance), the loop pile doing the work.
      const loops = pile(u, v);
      const base = 58 + tones[tx + ty * 4] + stripe * 4 + fine * 10 + loops * 8 + seam + worn;
      o[0] = clamp255(base + 4); o[1] = clamp255(base + 2); o[2] = clamp255(base + 2);
      o[3] = stripe * .15 + loops * .45 + fine * .2 + (seam ? -.4 : 0);
    }, 2);
  })();
  // Wear on painted and laminate tops: a faint mottle in the colour, and smudges where hands rest
  // (the gloss comes and goes) in the roughness. Stretched over each face (desks have no world UVs).
  const wornT = (() => {
    const n = noise(91, 32), m = noise(92, 6), smudge = noise(93, 12);
    return paint(512, 1, (u, v, o) => {
      const k = 246 + (n(u, v) - .5) * 6 + (m(u, v) - .5) * 8;
      o[0] = clamp255(k); o[1] = clamp255(k); o[2] = clamp255(k - 1); o[3] = 0;
    }, 0, (u, v) => .62 + Math.min(1, Math.max(0, (smudge(u, v) - .35) * 1.6)) * .38);
  })();
  // Leaves: lighter toward the tip, a pale midrib, side veins, darker edges (UVs across the leaf).
  const leafT = canvasTexture(128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#9aa596'); grad.addColorStop(.6, '#e6ece2'); grad.addColorStop(1, '#f4f7ef');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(40,60,30,.45)'); edge.addColorStop(.3, 'rgba(40,60,30,0)');
    edge.addColorStop(.7, 'rgba(40,60,30,0)'); edge.addColorStop(1, 'rgba(40,60,30,.45)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,235,.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 4); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,255,230,.4)';
    for (let y = h - 20; y > 20; y -= 18) {
      for (const side of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + side * 22, y - 10, w / 2 + side * 50, y - 30); g.stroke(); }
    }
  });
  // Oak planks, 2 m x 2 m.
  const woodT = (() => {
    const g = noise(11, 128), w = noise(12, 16), r = rng(13), rn = noise(14, 32);
    const cols = 10, rows = Array.from({ length: cols }, () => ({ off: r(), len: .45 + r() * .35, tone: (r() - .5) * 26 }));
    return paint(512, 2, (u, v, o) => {
      const ci = Math.floor(u * cols), lu = u * cols - ci, col = rows[ci];
      const vv = (v + col.off) / col.len, pi = Math.floor(vv), lv = vv - pi;
      const tone = col.tone + (rng(ci * 31 + pi)() - .5) * 22;
      const grain = Math.sin((lu * 9 + w(u, v) * 4 + g(u * .5, v) * 1.5) * Math.PI * 2) * .5 + .5;
      const gap = (lu < .02 || lv < .006) ? 1 : 0;
      const k = 168 + tone + grain * 20 - g(u, v) * 18 - gap * 70;
      o[0] = clamp255(k); o[1] = clamp255(k * .76); o[2] = clamp255(k * .52);
      o[3] = grain * .3 - gap * .8;
    }, 2.5, (u, v) => .38 + rn(u, v) * .18);
  })();
  // 60 cm porcelain tiles, 1.2 m.
  const tileT = (() => {
    const n = noise(21, 64), m = noise(22, 8);
    return paint(512, 1.2, (u, v, o) => {
      const lu = (u * 2) % 1, lv = (v * 2) % 1, grout = (lu < .008 || lv < .008);
      // Porcelain is near-even: a faint cloud, no speckle (it shows now that whites don't clip).
      const k = grout ? 150 : 216 + n(u, v) * 4 - m(u, v) * 7;
      o[0] = clamp255(k); o[1] = clamp255(k - 2); o[2] = clamp255(k - 6);
      o[3] = grout ? -1 : n(u, v) * .1;
    }, 3);
  })();
  // Acoustic ceiling tiles with T-bar grid, 1.2 m.
  const ceilT = (() => {
    const n = noise(31, 128), r = rng(32), dots = new Uint8Array(512 * 512);
    for (let i = 0; i < 9000; i++) dots[(r() * 512 | 0) * 512 + (r() * 512 | 0)] = 1;
    return paint(512, 1.2, (u, v, o) => {
      const lu = (u * 2) % 1, lv = (v * 2) % 1, bar = (lu < .012 || lv < .012 || lu > .988 || lv > .988);
      const dot = dots[(v * 512 | 0) * 512 + (u * 512 | 0)];
      const k = bar ? 246 : 232 - n(u, v) * 10 - dot * 40;
      o[0] = clamp255(k); o[1] = clamp255(k); o[2] = clamp255(k + 1);
      o[3] = bar ? .8 : -dot * .5;
    }, 2);
  })();
  // Painted plaster, 2 m.
  const plasterT = (() => {
    const n = noise(41, 64), m = noise(42, 6);
    return paint(256, 2, (u, v, o) => {
      const k = 236 + (n(u, v) - .5) * 6 + (m(u, v) - .5) * 8;
      o[0] = clamp255(k); o[1] = clamp255(k - 1); o[2] = clamp255(k - 4); o[3] = n(u, v) * .25;
    }, 1);
  })();
  // Door veneer: one sheet, the grain running up it in long waves (a door's UVs cover its face once).
  const veneerT = (() => {
    const w = noise(15, 8), g = noise(16, 64), fleck = noise(17, 256);
    return paint(512, 1, (u, v, o) => {
      const flow = u * 26 + w(u, v * .25) * 3 + g(u, v) * .4;
      const grain = Math.sin(flow * Math.PI * 2) * .5 + .5;
      const k = 172 + grain * 22 - fleck(u, v) * 10 + (w(u * 2, v) - .5) * 14;
      o[0] = clamp255(k); o[1] = clamp255(k * .74); o[2] = clamp255(k * .5); o[3] = grain * .4;
    }, 1.5, (u, v) => .5 + g(u, v) * .15);
  })();
  // The foot of a wall (pieces standing on the floor), 2 m x 3 m from the floor up: the plaster's
  // mottle, grime fading up from the floor, soft shoe scuffs.
  const wallBaseT = (() => {
    const t = canvasTexture(256, 384, (g, w, h) => {
      const r = rng(47), n = noise(43, 32);
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = 236 + (n(x / w, (y % 256) / 256) - .5) * 8, i = (y * w + x) * 4;
        img.data[i] = k; img.data[i + 1] = k - 1; img.data[i + 2] = k - 4; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const grime = g.createLinearGradient(0, h - 34, 0, h);
      grime.addColorStop(0, 'rgba(90,80,70,0)'); grime.addColorStop(1, 'rgba(90,80,70,.14)');
      g.fillStyle = grime; g.fillRect(0, h - 34, w, 34);
      // Shoe scuffs: soft, short, low (sharp lines read as dashes drawn on the wall).
      g.filter = 'blur(1.5px)';
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `rgba(45,40,36,${.05 + r() * .09})`;
        g.beginPath(); g.ellipse(r() * w, h - 4 - r() * 14, 3 + r() * 7, 1 + r() * 1.5, (r() - .5) * .4, 0, Math.PI * 2); g.fill();
      }
      g.filter = 'none';
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2, 1 / 3);
    return t;
  })();
  // Woven fabric detail (tinted by material colour), 0.15 m.
  // Upholstery: a soft mottle, no weave (a weave fine enough to be fabric only shimmered), 0.5 m.
  const fabricT = (() => {
    const n = noise(51, 12), m = noise(52, 4);
    return paint(128, .5, (u, v, o) => {
      const k = 228 + (n(u, v) - .5) * 16 + (m(u, v) - .5) * 10;
      o[0] = o[1] = o[2] = clamp255(k); o[3] = n(u, v) * .35;
    }, 1);
  })();
  // Concrete / pavement, 4 m.
  const concreteT = (() => {
    const n = noise(61, 64), m = noise(62, 8);
    return paint(256, 4, (u, v, o) => {
      const lu = (u * 2) % 1, lv = (v * 2) % 1, joint = (lu < .006 || lv < .006);
      const k = 170 + (n(u, v) - .5) * 26 + (m(u, v) - .5) * 20 - (joint ? 50 : 0);
      o[0] = clamp255(k); o[1] = clamp255(k - 3); o[2] = clamp255(k - 8); o[3] = n(u, v) * .3 - (joint ? 1 : 0);
    }, 2);
  })();
  const grassT = (() => {
    const n = noise(71, 128), m = noise(72, 8);
    return paint(256, 6, (u, v, o) => {
      const k = n(u, v), l = m(u, v);
      o[0] = clamp255(52 + k * 30 + l * 20); o[1] = clamp255(78 + k * 40 + l * 18); o[2] = clamp255(36 + k * 14); o[3] = k;
    }, 2);
  })();
  // Subway tile backsplash, 0.6 m.
  const subwayT = (() => {
    const n = noise(81, 32);
    return paint(256, .6, (u, v, o) => {
      const row = Math.floor(v * 8), lu = (u * 4 + (row % 2) * .5) % 1, lv = (v * 8) % 1;
      const grout = lu < .025 || lv < .05;
      const bevel = Math.min(lu, 1 - lu, lv * .5, (1 - lv) * .5);
      const k = grout ? 185 : 238 + n(u, v) * 8;
      o[0] = clamp255(k); o[1] = clamp255(k); o[2] = clamp255(k - 2);
      o[3] = grout ? -1 : Math.min(bevel * 12, 1) * .6;
    }, 3);
  })();

  function canvasTexture(w, h, draw, srgb = true) {
    const c = canvas(w, h); draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = maxAniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function screenTexture(kind) {
    return canvasTexture(512, 320, (g, w, h) => {
      const r = rng(kind * 97 + 5);
      g.fillStyle = kind === 2 ? '#f2f4f7' : '#11161d'; g.fillRect(0, 0, w, h);
      g.fillStyle = kind === 2 ? '#dfe3e9' : '#1a212b'; g.fillRect(0, 0, w, 22); g.fillRect(0, 22, 90, h);
      if (kind === 0) {
        const cols = ['#7fd1ff', '#c792ea', '#ffcb6b', '#89ddff', '#c3e88d', '#f78c6c', '#8a93a3'];
        for (let y = 34; y < h - 8; y += 11) {
          let x = 104 + Math.floor(r() * 4) * 14;
          for (let k = 0; k < 1 + r() * 5; k++) { const len = 12 + r() * 70; g.fillStyle = cols[r() * cols.length | 0]; g.fillRect(x, y, len, 5); x += len + 6; if (x > w - 20) break; }
        }
      } else {
        g.fillStyle = kind === 2 ? '#ffffff' : '#18202a';
        for (let i = 0; i < 4; i++) g.fillRect(104 + i * 100, 34, 90, 54);
        for (let i = 0; i < 4; i++) { g.fillStyle = ['#4cc9f0', '#f72585', '#ffb703', '#2ec4b6'][i]; g.font = 'bold 22px sans-serif'; g.fillText((r() * 900 | 0) + '', 114 + i * 100, 72); }
        g.strokeStyle = '#4cc9f0'; g.lineWidth = 3; g.beginPath();
        for (let x = 104; x < w - 12; x += 8) g.lineTo(x, 230 - Math.sin(x * .03) * 40 - r() * 30);
        g.stroke();
        for (let i = 0; i < 16; i++) { g.fillStyle = '#ffb703'; const bh = 20 + r() * 50; g.fillRect(110 + i * 24, h - 14 - bh, 14, bh); }
      }
    });
  }
  const screens = [screenTexture(0), screenTexture(1), screenTexture(2)];
  function artTexture(seed) {
    return canvasTexture(256, 320, (g, w, h) => {
      const r = rng(seed);
      const pal = [['#e9e4d8', '#d1603d', '#2f4858', '#e3b04b', '#86a397'], ['#f1ede4', '#22333b', '#c6ac8f', '#5e503f', '#eae0d5'], ['#efe9e1', '#264653', '#2a9d8f', '#e9c46a', '#e76f51']][seed % 3];
      g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
      g.scale(.5, .5);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = pal[1 + (r() * 4 | 0)]; g.globalAlpha = .9;
        if (r() < .5) { g.beginPath(); g.arc(r() * 512, r() * 640, 40 + r() * 140, 0, Math.PI * 2); g.fill(); }
        else g.fillRect(r() * 512 * .7, r() * 640 * .7, 60 + r() * 220, 30 + r() * 200);
      }
      g.globalAlpha = 1;
    });
  }
  function whiteboardTexture() {
    return canvasTexture(512, 280, (g) => {
      g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, 512, 280);
      g.scale(.5, .5);
      g.lineWidth = 4; g.lineCap = 'round';
      g.font = '42px "Comic Sans MS", cursive'; g.fillStyle = '#1f4fbf'; g.fillText('Sprint 42 — goals', 60, 90);
      g.strokeStyle = '#222'; g.strokeRect(80, 150, 180, 90); g.strokeRect(420, 150, 180, 90); g.strokeRect(760, 150, 180, 90);
      g.beginPath(); g.moveTo(260, 195); g.lineTo(420, 195); g.moveTo(600, 195); g.lineTo(760, 195); g.stroke();
      g.strokeStyle = '#c62828'; g.beginPath(); g.ellipse(510, 400, 200, 70, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2e7d32'; g.font = '34px "Comic Sans MS", cursive'; g.fillText('ship it ✓', 420, 410);
    });
  }

  // -------------------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------------------
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const fab = (color) => std({ color, map: fabricT.map, normalMap: fabricT.normalMap, roughness: .95 });
  // The tile floor's gloss varies too (its UVs are in metres: a smudge every metre and a half).
  const floorSmudge = wornT.roughnessMap.clone();
  floorSmudge.repeat.set(1 / 1.5, 1 / 1.5); floorSmudge.needsUpdate = true;
  const M = {
    // Painted walls reflect ~70% (a pure white would clip under the lights).
    wall: std({ color: 0xd3cfc8, ...plasterT, roughness: .92, normalScale: new THREE.Vector2(.3, .3) }),
    wallBase: std({ color: 0xd3cfc8, map: wallBaseT, normalMap: plasterT.normalMap, roughness: .92, normalScale: new THREE.Vector2(.3, .3) }),
    baseboard: std({ color: 0x2b2d31, roughness: .55 }),
    frame: std({ color: 0x24272c, metalness: .75, roughness: .32 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdff1f8, metalness: 0, roughness: .03, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }),
    carpet: std({ ...carpetT, roughness: 1, normalScale: new THREE.Vector2(.6, .6) }),
    tile: std({ ...tileT, roughnessMap: floorSmudge, roughness: .32, normalScale: new THREE.Vector2(.6, .6) }),
    closetTile: std({ ...tileT, color: 0xdde8e4, roughness: .3 }),
    ceiling: std({ ...ceilT, roughness: .95, normalScale: new THREE.Vector2(.5, .5), shadowSide: THREE.DoubleSide }),
    roof: std({ color: 0x3a3c40, roughness: .9 }),
    deskTop: std({ color: 0xd2cfc8, map: wornT.map, roughnessMap: wornT.roughnessMap, roughness: .62 }),
    deskWhite: std({ color: 0xdcdad5, map: wornT.map, roughnessMap: wornT.roughnessMap, roughness: .66 }),
    pedestal: std({ color: 0x3b2a20, roughness: .5 }),
    oak: std({ map: woodT.map, roughnessMap: woodT.roughnessMap, roughness: 1, color: 0xffffff }),
    metalBlack: std({ color: 0x1b1d20, metalness: .7, roughness: .38 }),
    chrome: std({ color: 0xd9dcdf, metalness: 1, roughness: .16 }),
    steel: std({ color: 0xbfc3c7, metalness: 1, roughness: .32 }),
    plastic: std({ color: 0x18191c, roughness: .45 }),
    plasticWhite: std({ color: 0xeceae6, roughness: .4 }),
    chairFabric: std({ color: 0x2c3036, map: fabricT.map, normalMap: fabricT.normalMap, roughness: .95 }),
    sofa: fab(0x7d8d84), sofaCushion: fab(0x899a90),
    sofaGrey: fab(0x55595e), sofaGreyCushion: fab(0x5f6368), ottoman: fab(0x6a6d71), screenFabric: fab(0x8e9195),
    leather: std({ color: 0x8a4f2a, roughness: .42 }),
    pillowA: fab(0xd9a441), pillowB: fab(0xe9e4da),
    counter: std({ color: 0xe6e4e0, map: wornT.map, roughnessMap: wornT.roughnessMap, roughness: .24 }),
    cabinet: std({ color: 0x2f4a43, roughness: .5 }),
    cabinetWhite: std({ color: 0xe8e7e3, map: wornT.map, roughness: .45 }),
    subway: std({ ...subwayT, roughness: .12, normalScale: new THREE.Vector2(.5, .5) }),
    leaf: std({ color: 0x4a8a44, map: leafT, roughness: .5, side: THREE.DoubleSide }),
    leafDark: std({ color: 0x346a35, map: leafT, roughness: .55, side: THREE.DoubleSide }),
    pot: std({ color: 0xcfc9bf, roughness: .85 }),
    potDark: std({ color: 0x2e2f31, roughness: .7 }),
    soil: std({ color: 0x3a2a1f, roughness: 1 }),
    whiteboard: std({ map: whiteboardTexture(), roughness: .12 }),
    panel: std({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 2.4, roughness: .5 }),
    bulb: std({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 9 }),
    concrete: std({ ...concreteT, roughness: .92 }),
    grass: std({ ...grassT, roughness: 1 }),
    bark: std({ color: 0x4b3a2c, roughness: 1 }),
    door: std({ map: veneerT.map, roughnessMap: veneerT.roughnessMap, normalMap: veneerT.normalMap, normalScale: new THREE.Vector2(.25, .25), roughness: 1 }),
    blind: std({ color: 0xd8dadb, roughness: .7, side: THREE.DoubleSide }),
    heater: std({ color: 0xf0efeb, roughness: .5 }),
    bamboo: std({ color: 0xd8bf96, roughness: .42 }),
    greenBin: std({ color: 0x1f8a4c, roughness: .5 }),
    bin: std({ color: 0x3a3c3f, roughness: .6, metalness: .4, transparent: true, opacity: .85 }),
    pillar: std({ color: 0xdcd9d3, ...plasterT, roughness: .9, normalScale: new THREE.Vector2(.3, .3) }),
  };
  const screenMats = screens.map((t) => std({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1, roughness: .15 }));
  const artMats = [1, 2, 3, 4, 5].map((s) => std({ map: artTexture(s), roughness: .7 }));

  // The office assets' own materials (assets/catalog/office.ts): one each, so each is one draw.
  const tiled = (t, w, h = w) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w, h); return t; };
  const targetFace = canvasTexture(256, 256, (c, w) => {
    c.fillStyle = '#d32020'; c.fillRect(0, 0, w, w);
    [['#ffffff', 112], ['#111111', 92], ['#2a6fd6', 72], ['#d32020', 52], ['#f5d000', 30]].forEach(([col, r]) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2 + 16, r, 0, 7); c.fill(); });
  });
  const diffuser = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#9a9c9e'; g.lineWidth = 3;
    for (let i = 1; i < 5; i++) g.strokeRect(i * 12, i * 12, w - i * 24, w - i * 24);
    g.fillStyle = '#4a4c4e'; g.fillRect(w / 2 - 7, w / 2 - 7, 14, 14);
  });
  const exitSign = canvasTexture(128, 48, (c, w, h) => { c.fillStyle = '#0f8a3c'; c.fillRect(0, 0, w, h); c.fillStyle = '#eaffef'; c.font = 'bold 28px sans-serif'; c.textAlign = 'center'; c.fillText('EXIT', w / 2, 34); });
  // Neighbourhood facades. One texture tile = 2 bays x 2 floors (6 m x 6 m), each 256 px bay its own
  // window (blinds, curtains, a lit room), so the street doesn't read as wallpaper. Drawn with their
  // own random numbers (never R(): the geometry's must not shift).
  const facade = (wall, bay) => tiled(canvasTexture(512, 512, (c, w, h) => {
    wall(c, w, h);
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      c.save(); c.translate(bx * 256, by * 256); bay(c, rng(bx * 7 + by * 13 + 3)); c.restore();
    }
  }), 1 / 6);
  function window_(c, x, y, w, h, r) {
    // The opening's reveal: a frame, the inner edge shadowed.
    c.fillStyle = '#ebe7df'; c.fillRect(x - 8, y - 8, w + 16, h + 16);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x - 2, y - 2, w + 4, 6); c.fillRect(x - 2, y - 2, 6, h + 4);
    // The room behind: dark, sometimes a lit ceiling, a wall, curtains.
    const lit = r() < .35;
    c.fillStyle = lit ? '#5d5446' : '#262b30'; c.fillRect(x, y, w, h);
    if (lit) { c.fillStyle = 'rgba(255,236,190,.55)'; c.fillRect(x + w * .2, y + 6, w * .6, 8); c.fillStyle = 'rgba(255,230,180,.18)'; c.fillRect(x, y, w, h * .6); }
    if (r() < .4) { const k = r() < .5 ? '#a6463c' : '#cfc3a6'; c.fillStyle = k; c.fillRect(x, y, w * .18, h); c.fillRect(x + w * .82, y, w * .18, h); }
    // Blinds down to somewhere.
    const blinds = r() < .55 ? h * (.15 + r() * .7) : 0;
    for (let s = 0; s < blinds; s += 5) { c.fillStyle = s % 10 ? '#d9d4c8' : '#bdb7aa'; c.fillRect(x, y + s, w, 4); }
    // The sky in the glass, brighter up top.
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(200,220,235,.55)'); g.addColorStop(.6, 'rgba(150,175,195,.18)'); g.addColorStop(1, 'rgba(120,140,160,.08)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(x + w * .55, y); c.lineTo(x + w * .8, y); c.lineTo(x + w * .35, y + h); c.lineTo(x + w * .1, y + h); c.fill();
    // Mullion, transom, the sill and its drip shadow.
    c.fillStyle = '#ebe7df'; c.fillRect(x + w / 2 - 3, y, 6, h); c.fillRect(x, y + h * .35, w, 5);
    c.fillStyle = '#d8d3ca'; c.fillRect(x - 12, y + h + 8, w + 24, 8);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 12, y + h + 16, w + 24, 5);
  }
  const brick = (base) => (c, w, h) => {
    const r = rng(base.length);
    c.fillStyle = '#b8a99b'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = -(y / 8 % 2) * 12; x < w; x += 24) {
      const k = (r() - .5) * 30; c.fillStyle = `rgb(${base[0] + k},${base[1] + k * .6},${base[2] + k * .5})`; c.fillRect(x + 1, y + 1, 22, 6);
    }
    // Weathering: darker under each sill, a lighter band at the floor slabs.
    for (let by = 0; by < 2; by++) { c.fillStyle = 'rgba(40,30,25,.12)'; c.fillRect(0, by * 256 + 220, w, 36); }
  };
  const brickWindow = (c, r) => window_(c, 52, 48, 152, 150, r);
  const beigeWall = (c, w, h) => { c.fillStyle = '#d9ccb4'; c.fillRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 3600; i++) { c.fillStyle = `rgba(90,70,40,${r() * .06})`; c.fillRect(r() * w, r() * h, 3, 3); } };
  // Distant towers' windows, a tile every 12 x 22 m (the skyline asset scales its UVs to that).
  const windowsTexture = (seed) => tiled(canvasTexture(128, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#9aa1a8'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 13) for (let x = 4; x < w; x += 11) {
      const lit = r() < .25;
      g.fillStyle = lit ? `rgb(${200 + r() * 40},${170 + r() * 40},${120 + r() * 30})` : `rgb(${40 + r() * 20},${55 + r() * 20},${70 + r() * 20})`;
      g.fillRect(x, y, 7, 9);
    }
  }), 1);
  Object.assign(M, {
    fruitOrange: std({ color: 0xe0a020, roughness: .5 }), fruitRed: std({ color: 0xc0392b, roughness: .5 }), fruitGreen: std({ color: 0x7fb03a, roughness: .5 }),
    printer: std({ color: 0x9a9da1, roughness: .5 }),
    pendantShade: std({ color: 0x1b1c1e, roughness: .4, metalness: .5, side: THREE.DoubleSide }),
    lampBowl: std({ color: 0xf6f3ec, emissive: 0xffd9a8, emissiveIntensity: .35, side: THREE.DoubleSide }),
    ...Object.fromEntries([0x2b2b2b, 0xd9c19b, 0x6b3b2a, 0x334455, 0xeeeeee].map((color, i) => [`book${i}`, std({ color, roughness: .6 })])),
    beanPurple: std({ color: 0x4b2a8a, roughness: .35 }), beanGrey: std({ color: 0x5a5e63, roughness: .35 }),
    yogaMat: std({ color: 0x24305a, roughness: .9 }),
    pingPongNet: std({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide, roughness: .9 }),
    paddle: std({ color: 0xc8202a, roughness: .6 }),
    targetBoard: std({ color: 0x1c1c1c, roughness: .8 }), targetFace: std({ map: targetFace, roughness: .7 }),
    ...Object.fromEntries([0xb08a5b, 0xa77e4f, 0xc2a070].map((color, i) => [`cardboard${i}`, std({ color, roughness: .9 })])),
    diffuser: std({ map: diffuser, roughness: .6 }),
    exitSign: std({ color: 0x000000, emissive: 0xffffff, emissiveMap: exitSign, emissiveIntensity: 2.2 }),
    canopy: std({ vertexColors: true, roughness: .8 }),
    facadeBrick: std({ map: facade(brick([128, 62, 44]), brickWindow), roughness: .9 }),
    facadeBrick2: std({ map: facade(brick([150, 82, 58]), brickWindow), roughness: .9 }),
    facadeBeige: std({ map: facade(beigeWall, (c, r) => window_(c, 40, 60, 176, 130, r)), roughness: .95 }),
    facadeOffice: std({ map: facade((c, w, h) => { c.fillStyle = '#3b4a53'; c.fillRect(0, 0, w, h); }, (c, r) => {
      // Curtain wall: sky in the glass, a room behind some panes, the floor's spandrel, mullions.
      const g = c.createLinearGradient(0, 56, 0, 256); g.addColorStop(0, '#9db1bc'); g.addColorStop(1, '#3f4f58');
      c.fillStyle = g; c.fillRect(0, 56, 256, 200);
      for (let x = 0; x < 256; x += 64) if (r() < .4) { c.fillStyle = r() < .5 ? 'rgba(255,240,205,.25)' : 'rgba(20,25,30,.35)'; c.fillRect(x, 56, 64, 200); }
      c.fillStyle = '#5f676c'; c.fillRect(0, 0, 256, 56); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 52, 256, 4);
      c.fillStyle = '#2b3034'; for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 6, 256);
    }), roughness: .35, metalness: .3 }),
    cityRoof: std({ color: 0x55585c, roughness: .9 }), balconyRail: std({ color: 0x2c2f33, roughness: .5, metalness: .5 }),
    balconySlab: std({ color: 0xcfcac2, roughness: .9 }), awning: std({ color: 0x2f6b47, roughness: .7 }),
    ...Object.fromEntries([1, 2, 3].map((seed, i) => [`skyline${i}`, std({ map: windowsTexture(seed), roughness: .6, metalness: .2 })])),
    // What the shared assets are made of (the ping-pong table), the same as on Rue des Érables.
    ...makeSharedMaterials(),
  });

  return { M, screenMats, artMats, texture: canvasTexture };
}

/**
 * The office assets' palette (assets/office-palette.ts) from the office's materials, browser or
 * plain: every name, the screens and prints included.
 */
export function officePalette({ M, screenMats, artMats }) {
  return Object.fromEntries(OFFICE_MATERIALS.map((name) => {
    const screen = /^screen(\d)$/.exec(name), art = /^art(\d)$/.exec(name);
    const material = screen ? screenMats[+screen[1]] : art ? artMats[+art[1] % artMats.length] : M[name];
    if (!material) throw new Error(`The office has no material "${name}"`);
    return [name, material];
  }));
}

/**
 * Untextured stand-ins, one per material name, for a build that only needs the shapes (the game
 * server). Every name gets its own material so the build can still tell glass from the rest.
 */
export function plainOfficeMaterials() {
  const M = new Proxy({}, { get: (made, name) => (made[name] ??= new THREE.MeshBasicMaterial({ name: String(name) })) });
  const flat = new THREE.MeshBasicMaterial();
  return { M, screenMats: [flat, flat, flat], artMats: [flat], texture: () => null };
}

/** What a surface is made of, for bullet impacts: `collision.solid.userData.surfaces` indexes this. */
export const SURFACES = ['plaster', 'wood', 'desk', 'metal', 'fabric', 'plastic', 'tile', 'screen', 'plant'];

/** Each material's surface, by its name in M (anything unnamed: plaster). */
const SURFACE_OF = {
  wall: 'plaster', ceiling: 'plaster', roof: 'plaster', concrete: 'plaster', pillar: 'plaster',
  oak: 'wood', door: 'wood', bamboo: 'wood', pedestal: 'wood',
  deskTop: 'desk', deskWhite: 'desk',
  frame: 'metal', metalBlack: 'metal', chrome: 'metal', steel: 'metal', cabinet: 'metal', cabinetWhite: 'metal',
  heater: 'metal', bin: 'metal',
  carpet: 'fabric', chairFabric: 'fabric', sofa: 'fabric', sofaCushion: 'fabric', sofaGrey: 'fabric',
  sofaGreyCushion: 'fabric', ottoman: 'fabric', screenFabric: 'fabric', leather: 'fabric', pillowA: 'fabric',
  pillowB: 'fabric',
  baseboard: 'plastic', plastic: 'plastic', plasticWhite: 'plastic', whiteboard: 'plastic', panel: 'plastic',
  greenBin: 'plastic', potDark: 'plastic',
  pingPongTop: 'wood', pingPongLines: 'wood', pingPongFrame: 'metal', pingPongStrut: 'metal', pingPongMesh: 'fabric', caster: 'plastic',
  paddleRubber: 'plastic', paddleHandle: 'wood',
  tile: 'tile', closetTile: 'tile', subway: 'tile', counter: 'tile', pot: 'tile',
  bulb: 'screen',
  leaf: 'plant', leafDark: 'plant', soil: 'plant', grass: 'plant', bark: 'plant',
};

/** material → SURFACES index: by its name in M; the screens are screens, the art is paint on a wall. */
function surfaceLookup(M, screenMats, artMats) {
  const byMaterial = new Map();
  for (const [name, material] of Object.entries(M)) byMaterial.set(material, SURFACES.indexOf(SURFACE_OF[name] ?? 'plaster'));
  for (const material of artMats) byMaterial.set(material, SURFACES.indexOf('plaster'));
  for (const material of screenMats) byMaterial.set(material, SURFACES.indexOf('screen'));
  return (material) => byMaterial.get(material) ?? 0;
}

/** A triangle's corners (vertex indices, in any order) as one number. */
function cornersKey(vertices, a, b, c) {
  const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
  return (lo * vertices + mid) * vertices + hi;
}

/** Each triangle's kind (`kinds`, in the geometry's triangle order), by its corners. */
function kindsByCorners(g, kinds) {
  const index = g.index.array, vertices = g.attributes.position.count, byCorners = new Map();
  for (let t = 0; t < index.length / 3; t++) byCorners.set(cornersKey(vertices, index[3 * t], index[3 * t + 1], index[3 * t + 2]), kinds[t]);
  return byCorners;
}

/** The kinds again, in the triangles' order now (as raycasts' faceIndex counts them). */
function surfacesInOrder(g, byCorners) {
  const index = g.index.array, vertices = g.attributes.position.count;
  const surfaces = new Uint8Array(index.length / 3);
  for (let t = 0; t < surfaces.length; t++) surfaces[t] = byCorners.get(cornersKey(vertices, index[3 * t], index[3 * t + 1], index[3 * t + 2])) ?? 0;
  return surfaces;
}

/**
 * Builds the office's geometry (no DOM, no renderer: it runs on the game server as well) and
 * returns it with its gameplay data. The groups are not added to any scene.
 *
 * Options: `materials` (createOfficeMaterials(renderer) in the browser, plain stand-ins otherwise),
 * `outside: false` skips the street and the neighbourhood, `collision: false` the collision meshes,
 * `surfaces: true` notes what each solid triangle is made of (collision.solid.userData.surfaces).
 */
export function buildOfficeGeometry(opts = {}) {
  const materials = opts.materials ?? plainOfficeMaterials();
  const { M, screenMats, artMats, texture: canvasTexture } = materials;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // Every thing in the office is an asset from the library (assets/catalog/office.ts), put down here.
  const kit = new Builder(officePalette(materials), 'office');
  const put = (parent, asset, params, at) => kit.into(parent, () => place(kit, asset, params, at));
  // A canvas texture tiled every `w` x `h` metres; null where there are no textures.
  const tiled = (t, w, h = w) => { if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w, h); } return t; };
  const R = rng(42);

  const root = new THREE.Group(); root.name = 'office';
  const world = new THREE.Group(); world.name = 'interior'; root.add(world);
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = 'ceiling'; root.add(ceilingGroup);
  const outside = new THREE.Group(); outside.name = 'outside'; root.add(outside);

  // Gameplay data
  const colliders = [];   // oriented boxes
  const doors = [];
  const addBox = (cx, cy, cz, hx, hy, hz, rotY, tag) => colliders.push({ center: [cx, cy, cz], half: [hx, hy, hz], rotY, tag });

  // -------------------------------------------------------------------------
  // Helpers. userData.tag marks a collider unit (chair, plant, ...); userData.col = false excludes an
  // object from auto colliders; userData.col = 'floor' extends its collider down to the floor.
  // -------------------------------------------------------------------------
  function mesh(geo, mat, parent = world, cast = true, receive = true) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  }
  function group(x, z, rotY = 0, parent = world) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; parent.add(g); return g;
  }
  const tagged = (o, tag, col) => { o.userData.tag = tag; if (col !== undefined) o.userData.col = col; return o; };
  // Box UVs scaled to metres so tiling textures keep their real size on walls.
  function worldUV(geo, w, h, d) {
    const uv = geo.attributes.uv, n = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const su = nx > .5 ? d : w, sv = ny > .5 ? d : h;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    return geo;
  }

  // -------------------------------------------------------------------------
  // Floors, ceiling, roof
  // -------------------------------------------------------------------------
  const OUTLINE = [[30,167],[224,167],[224,110],[400,110],[400,88],[1250,88],[1250,184],[1132,184],[1132,358],[1250,358],[1250,670],[400,670],[400,650],[362,650],[37,317],[37,275],[30,267]];
  const outline = OUTLINE.map(([x, y]) => V(x, y));
  function slab(pts, mat, y, up = true, parent = world) {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, up ? -p.y : p.y)));
    const m = mesh(new THREE.ShapeGeometry(shape), mat, parent, !up, true);
    m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.y = y; return m;
  }
  const zone = (arr) => arr.map(([x, y]) => V(x, y));
  slab(outline, M.carpet, 0);
  slab(zone([[30,169],[222,169],[350,315],[37,315],[37,275],[30,267]]), M.tile, .003);
  slab(zone([[1132,358],[1250,358],[1250,450],[1132,450]]), M.closetTile, .003);
  slab(outline, M.ceiling, H, false, ceilingGroup);
  {
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
    const roof = mesh(new THREE.ExtrudeGeometry(shape, { depth: .35, bevelEnabled: false }), M.roof, ceilingGroup);
    roof.rotation.x = -Math.PI / 2; roof.position.y = H + .01;
  }
  function inside(p, poly = outline) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  // floor and ceiling colliders spanning the footprint
  {
    const xs = outline.map((p) => p.x), zs = outline.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    addBox((x0 + x1) / 2, -.1, (z0 + z1) / 2, (x1 - x0) / 2, .1, (z1 - z0) / 2, 0, 'floor');
    addBox((x0 + x1) / 2, H + .1, (z0 + z1) / 2, (x1 - x0) / 2, .1, (z1 - z0) / 2, 0, 'ceiling');
  }

  // -------------------------------------------------------------------------
  // Plants (needed by the window dressing below): POTTED_PLANT's kinds, 0/1 leafy floor plant
  // (light/dark pot), 2 tall bushy, 3 small desk plant, 4 trailing pothos.
  // -------------------------------------------------------------------------
  const pottedPlant = (parent, s, kind, seed, at) => tagged(put(parent, POTTED_PLANT, { scale: s, kind, seed }, at), 'plant');
  function plant(px, py, s = 1, kind = 0) {
    return pottedPlant(world, s, kind, px * 13 + py, { x: X(px), z: Z(py), ry: R() * 6.28 });
  }

  // -------------------------------------------------------------------------
  // Walls with windows, doors and glass partitions (each piece becomes a collider)
  // -------------------------------------------------------------------------
  const proj = (a, b, p) => { const d = b.clone().sub(a); return p.clone().sub(a).dot(d) / d.length(); };
  function wall(ax, ay, bx, by, opts = {}) {
    const a = V(ax, ay), b = V(bx, by), d = b.clone().sub(a), L = d.length(), dir = d.clone().normalize();
    const t = opts.t ?? .14, rot = -Math.atan2(d.y, d.x), mat = opts.mat ?? M.wall;
    const g = group(a.x, a.y, rot); g.userData.col = false;
    const ops = (opts.open ?? []).map((o) => ({ ...o, s: proj(a, b, V(...o.p[0])), e: proj(a, b, V(...o.p[1])) }))
      .map((o) => ({ ...o, s: Math.min(o.s, o.e), e: Math.max(o.s, o.e) })).sort((p, q) => p.s - q.s);
    const col = (s, e, y0, y1, tag) => {
      if (e - s < .005 || y1 - y0 < .005) return;
      addBox(a.x + dir.x * (s + e) / 2, (y0 + y1) / 2, a.y + dir.y * (s + e) / 2, (e - s) / 2, (y1 - y0) / 2, t / 2, rot, tag);
    };
    const piece = (s, e, y0, y1, base = false) => {
      if (e - s < .005 || y1 - y0 < .005) return;
      const w = e - s, h = y1 - y0;
      // On the floor, plain walls wear at the foot (wallBase).
      const pm = mesh(worldUV(new THREE.BoxGeometry(w, h, t), w, h, t), base && y0 < .01 && mat === M.wall ? M.wallBase : mat, g); pm.position.set((s + e) / 2, (y0 + y1) / 2, 0);
      if (base) { const bb = mesh(new THREE.BoxGeometry(w, .09, t + .025), M.baseboard, g); bb.position.set((s + e) / 2, .045, 0); }
      col(s, e, y0, y1, 'wall');
    };
    const frameBox = (w, h, dd, x, y) => { const f = mesh(new THREE.BoxGeometry(w, h, dd), M.frame, g); f.position.set(x, y, 0); };
    const glazing = (s, e, y0, y1, depth, spacing) => {
      const p = mesh(new THREE.PlaneGeometry(e - s, y1 - y0), M.glass, g, false, false); p.position.set((s + e) / 2, (y0 + y1) / 2, 0); p.renderOrder = 2;
      const fw = .05;
      frameBox(e - s, fw, depth, (s + e) / 2, y0 + fw / 2); frameBox(e - s, fw, depth, (s + e) / 2, y1 - fw / 2);
      const n = Math.max(1, Math.round((e - s) / spacing));
      for (let i = 0; i <= n; i++) frameBox(fw, y1 - y0, depth, s + (e - s) * i / n, (y0 + y1) / 2);
      col(s, e, y0, y1, 'glass');
    };
    let cur = 0;
    for (const o of ops) {
      piece(cur, o.s, 0, H, true);
      if (o.kind === 'window') {
        const sill = o.sill ?? .75, head = o.head ?? 2.35;
        piece(o.s, o.e, 0, sill, true); piece(o.s, o.e, head, H);
        glazing(o.s, o.e, sill, head, t * .5, 1.4);
        const ledge = mesh(new THREE.BoxGeometry(o.e - o.s + .06, .03, t + .1), M.counter, g); ledge.position.set((o.s + o.e) / 2, sill + .015, 0);
        // Interior dressing seen in the photos: baseboard heater, vertical blinds stacked to one side, a pot on the sill.
        let n = new THREE.Vector2(-dir.y, dir.x);
        const mid = a.clone().addScaledVector(dir, (o.s + o.e) / 2);
        if (!inside(mid.clone().addScaledVector(n, .5))) n.negate();
        const sg = Math.sign(Math.sin(rot) * n.x + Math.cos(rot) * n.y), inner = sg * (t / 2);
        put(g, BASEBOARD_HEATER, { length: Math.min(o.e - o.s, 2.4) - .1 }, { x: (o.s + o.e) / 2, z: inner + sg * .035 });
        const blinds = { width: o.e - o.s, height: head - sill + .12, slats: Math.min(14, Math.round((o.e - o.s) * 4)), both: o.e - o.s > 3 };
        put(g, VERTICAL_BLINDS, blinds, { x: o.s, y: sill, z: inner + sg * .07 });
        if (R() < .55) {
          const at = o.s + (o.e - o.s) * (.2 + R() * .6);
          pottedPlant(g, .22, 3, Math.floor(o.s * 100), { x: at, y: sill + .03, z: inner + sg * .02 });
        }
      } else if (o.kind === 'glass') {
        glazing(o.s, o.e, 0, H, .06, 1.2);
      } else if (o.kind === 'door') {
        piece(o.s, o.e, 2.1, H);
        frameBox(.04, 2.1, t + .02, o.s + .02, 1.05); frameBox(.04, 2.1, t + .02, o.e - .02, 1.05); frameBox(o.e - o.s, .04, t + .02, (o.s + o.e) / 2, 2.08);
        const c = a.clone().addScaledVector(dir, (o.s + o.e) / 2);
        const door = { center: [c.x, 1.05, c.y], width: o.e - o.s, height: 2.1, rotY: rot, open: !!o.swing, name: o.name ?? null, leaf: null };
        if (o.leaf !== false) {
          const w = o.e - o.s - .06, hinge = new THREE.Group(); hinge.position.set(o.s + .03, 0, 0); hinge.rotation.y = o.swing ?? 0; g.add(hinge);
          const leaf = mesh(new THREE.BoxGeometry(w, 2.05, .04), o.glassLeaf ? M.glass : M.door, hinge); leaf.position.set(w / 2, 1.03, 0);
          const handle = mesh(new THREE.BoxGeometry(.14, .02, .02), M.chrome, hinge); handle.position.set(w - .1, 1.0, .04);
          if (!o.swing) col(o.s, o.e, 0, 2.1, 'door');
        }
        doors.push(door);
      }
      cur = o.e;
    }
    piece(cur, L, 0, H, true);
    return g;
  }

  // Exterior
  const EXT = { t: .26 };
  wall(30, 167, 224, 167, EXT);
  wall(224, 167, 224, 110, EXT);
  wall(224, 110, 400, 110, EXT);
  wall(400, 110, 400, 88, EXT);
  wall(400, 88, 1128, 88, EXT);
  wall(1128, 88, 1250, 88, { ...EXT, open: [{ p: [[1134, 88], [1244, 88]], kind: 'window' }] });
  wall(1250, 88, 1250, 184, EXT);
  wall(1250, 184, 1132, 184, EXT);
  wall(1132, 184, 1132, 358, { ...EXT, open: [{ p: [[1132, 194], [1132, 244]], kind: 'door', name: 'exit' }] });
  wall(1132, 358, 1250, 358, EXT);
  wall(1250, 358, 1250, 670, EXT);
  wall(505, 670, 1250, 670, { ...EXT, open: [[576, 648], [720, 808], [856, 952], [1016, 1088], [1144, 1224]].map(([s, e]) => ({ p: [[s, 670], [e, 670]], kind: 'window', sill: .55 })) });
  wall(400, 670, 505, 670, { ...EXT, open: [{ p: [[425, 670], [500, 670]], kind: 'window', sill: .55 }] });
  wall(400, 670, 400, 650, EXT);
  wall(400, 650, 362, 650, EXT);
  // long glazed south-west facade, split by the closed office's corner wall
  wall(362, 650, 37, 317, { ...EXT, open: [{ p: [[356, 644], [264, 545]], kind: 'window', sill: .45, head: 2.45 }, { p: [[251, 531], [43, 323]], kind: 'window', sill: .45, head: 2.45 }] });
  wall(37, 317, 37, 275, EXT);
  wall(37, 275, 30, 267, EXT);
  wall(30, 267, 30, 167, { ...EXT, open: [{ p: [[30, 210], [30, 262]], kind: 'window', sill: 1.0 }] });

  // Interior
  wall(222, 169, 342, 300, { t: .12 });                 // kitchen diagonal wall
  wall(342, 300, 386, 356, { t: .12 });                 // ... continued down to the bar/desk room
  wall(400, 110, 398, 238, { t: .12 });                 // bar/desk room | middle room
  wall(398, 238, 386, 356, { t: .12, open: [{ p: [[396.8, 250], [391.5, 302]], kind: 'door', swing: -1.3, name: 'bar room' }] });
  wall(398, 238, 510, 290, { t: .12 });
  wall(386, 356, 400, 404, { t: .12, open: [{ p: [[386.7, 359], [399.3, 401]], kind: 'door', swing: -1.3, name: 'kitchen' }] });
  wall(640, 92, 640, 290, { t: .12 });
  wall(510, 290, 640, 290, { t: .12, open: [{ p: [[578, 290], [628, 290]], kind: 'door', swing: -1.4, name: 'middle room' }] });
  // closed office (Living Room 1): solid wall to the north-west, door + glass to the north-east
  wall(400, 404, 257, 537, { t: .12 });
  wall(400, 404, 502, 512, { t: .1, open: [{ p: [[403, 407], [434, 440]], kind: 'door', swing: -1.25, glassLeaf: true, name: 'closed office' }, { p: [[437, 443], [499, 509]], kind: 'glass' }] });
  wall(503, 512, 503, 670, { t: .12 });
  wall(1132, 358, 1132, 450, { t: .12, open: [{ p: [[1132, 372], [1132, 428]], kind: 'door', name: 'closet' }] });
  wall(1132, 450, 1250, 450, { t: .12 });

  // -------------------------------------------------------------------------
  // Furniture
  // -------------------------------------------------------------------------
  function chair(x, z, rot, parent = world) { return tagged(put(parent, OFFICE_CHAIR, {}, { x, z, ry: rot }), 'chair'); }

  // Things on a desk stand on its top (.755) and are left out of the coarse colliders.
  const loose = (o) => { o.userData.col = false; return o; };
  function makeMonitor(parent, x, z, rot, kind, keys = true) {
    return loose(put(parent, MONITOR, { screen: kind, keyboard: keys }, { x, y: .755, z, ry: rot }));
  }
  function makeLaptop(parent, x, z, rot) {
    return loose(put(parent, LAPTOP, { screen: R() * 3 | 0 }, { x, y: .755, z, ry: rot }));
  }
  function makeMug(parent, x, z) {
    return loose(put(parent, MUG, { colour: ['plasticWhite', 'leather', 'cabinet'][R() * 3 | 0] }, { x, y: .755, z }));
  }

  const tables = {};
  function rectTable(id, cx, cz, w, d, rot, opts = {}) {
    const params = { width: w, depth: d, height: opts.h ?? .74, top: opts.top ?? 'deskTop', base: opts.kind === 'cabinet' ? 'cabinet' : 'sled' };
    const g = tagged(put(world, OFFICE_DESK, params, { x: cx, z: cz, ry: rot }), opts.kind === 'cabinet' ? 'furniture' : 'desk');
    tables[id] = { g, cx, cz, w, d, rot, kind: opts.kind ?? 'desk', shape: 'rect' };
    return tables[id];
  }
  // Chair pulled up to a table edge.
  function seat(id, px, py) {
    const t = tables[id], p = V(px, py);
    let lx = (p.x - t.cx) * Math.cos(t.rot) - (p.y - t.cz) * Math.sin(t.rot);
    let lz = (p.x - t.cx) * Math.sin(t.rot) + (p.y - t.cz) * Math.cos(t.rot);
    let fx, fz;
    if (t.shape === 'round') {
      const a = Math.atan2(lz / t.d, lx / t.w);
      lx = Math.cos(a) * (t.w / 2 + .32); lz = Math.sin(a) * (t.d / 2 + .32); fx = -Math.cos(a); fz = -Math.sin(a);
    } else {
      const hw = t.w / 2, hd = t.d / 2;
      if (Math.abs(lx) - hw > Math.abs(lz) - hd) { const s = Math.sign(lx); lx = s * (hw + .34); lz = THREE.MathUtils.clamp(lz, -hd + .3, hd - .3); fx = -s; fz = 0; }
      else { const s = Math.sign(lz); lz = s * (hd + .34); lx = THREE.MathUtils.clamp(lx, -hw + .3, hw - .3); fx = 0; fz = -s; }
    }
    const wx = t.cx + lx * Math.cos(t.rot) + lz * Math.sin(t.rot);
    const wz = t.cz - lx * Math.sin(t.rot) + lz * Math.cos(t.rot);
    chair(wx, wz, Math.atan2(fx, fz) + t.rot + (R() - .5) * .35);
  }
  function roundTable(id, px, py, rx, rz, rot = 0, top = 'oak') {
    const cx = X(px), cz = Z(py), g = tagged(put(world, ROUND_TABLE, { radiusX: rx, radiusZ: rz, top }, { x: cx, z: cz, ry: rot }), 'table');
    tables[id] = { g, cx, cz, w: rx * 2, d: rz * 2, rot, kind: 'table', shape: 'round' };
  }
  function sofa(cx, cz, rot, L, D) {
    return tagged(put(world, LOUNGE_SOFA, { length: L, depth: D, fabric: 'sofaGrey' }, { x: cx, z: cz, ry: rot }), 'sofa');
  }
  function armchair(cx, cz, rot) { return tagged(put(world, CLUB_ARMCHAIR, {}, { x: cx, z: cz, ry: rot }), 'sofa'); }
  function art(px, py, rot, w = .7, h = .9, i = 0, y = 1.55) {
    put(world, FRAMED_ART, { width: w, height: h, art: i, hang: y }, { x: X(px), z: Z(py), ry: rot });
  }
  function pendant(px, py, drop = 1.1) { put(world, PENDANT_LIGHT, { drop, ceiling: H }, { x: X(px), z: Z(py) }); }
  function floorLamp(px, py) { tagged(put(world, BOWL_LAMP, {}, { x: X(px), z: Z(py) }), 'prop'); }

  // --- Kitchen ("Other") -----------------------------------------------------
  {
    // Plan: base run with sink from the west wall to x=191, then a tall unit up to x=220.
    const z0 = Z(167) + .13, x0 = X(30) + .13, runEnd = X(191), tallEnd = X(220);
    const params = { length: runEnd - x0, units: 6, sink: X(113) - x0, fridge: tallEnd - runEnd, bowl: X(160) - x0 };
    const g = tagged(put(world, KITCHENETTE, params, { x: x0, z: z0 }), 'counter');
    for (let i = 0; i < 5; i++) {
      const kind = ['fruitOrange', 'fruitRed', 'fruitGreen'][i % 3];
      put(g, FRUIT, { kind }, { x: params.bowl + (R() - .5) * .12, y: .94, z: .35 + (R() - .5) * .12 });
    }
  }
  // small square island, turned 45 degrees (plan 212-272 x 202-262), towel bar on its south-west face
  tagged(put(world, SQUARE_ISLAND, {}, { x: X(242), z: Z(232), ry: -Math.PI / 4 }), 'counter');

  // --- Open area west / bar room --------------------------------------------------
  // Single desk turned 45 degrees with one chair on its south-west side (plan 305-395 x 150-237).
  {
    const t = rectTable('sq', X(350), Z(194), 1.23, .96, -Math.PI / 4, { top: 'deskWhite' });
    makeMonitor(t.g, 0, -.22, 0, 0);
    chair(.05, .85, Math.PI + .2, t.g);
  }
  // Counter-height bar along the north wall of the bump (plan 237-335 x 113-130; scan: ~0.9 m high).
  tagged(put(world, BAR_COUNTER, { length: X(335) - X(237), depth: .32 }, { x: X(237), z: Z(110) + .13 }), 'counter');
  art(262, 119, 0, .55, .7, 0, 1.6); art(308, 119, 0, .55, .7, 1, 1.6);
  // Oval meeting table (plan: ~2.3 x 1.3 m, long axis ~40 degrees) with its five chairs and pendants.
  roundTable('oval', 204, 373, 1.15, .65, -.7, 'oak');
  for (const [x, y] of [[165, 332], [197, 320], [225, 350], [255, 380], [180, 395]]) seat('oval', x, y);
  pendant(173, 347); pendant(204, 373); pendant(235, 399);
  for (const [x, y, tx, ty] of [[315, 422, 204, 373], [272, 462, 204, 373], [480, 465, 560, 420]]) { const p = V(x, y), q = V(tx, ty); chair(p.x, p.y, Math.atan2(q.x - p.x, q.y - p.y)); }
  // small cabinet with a printer, against the bar room's outer wall
  tagged(put(world, PRINTER_CABINET, {}, { x: X(418), z: Z(338), ry: Math.PI / 2 }), 'furniture');
  plant(55, 300, 1.0, 1);
  plant(378, 124, 1.2, 2);

  // --- Closed office (Living Room 1) ------------------------------------------------
  {
    const along = (a, b) => b.clone().sub(a).normalize();
    // two-person desk against the window wall, users facing the window
    const wa = V(257, 537), wb = V(362, 650), wd = along(wa, wb), wn = new THREE.Vector2(wd.y, -wd.x);
    const dc = wa.clone().addScaledVector(wd, 1.31).addScaledVector(wn, .13 + .02 + .325);
    const t = rectTable('lr1', dc.x, dc.y, 2.0, .65, Math.atan2(wn.x, wn.y), { top: 'deskWhite' });
    for (const s of [-1, 1]) {
      makeLaptop(t.g, s * .5, -.05, 0);
      chair(s * .5, .72, Math.PI + s * .15, t.g);
    }
    // narrow console along the inner (north-west) wall, art above it
    const na = V(400, 404), nb = V(257, 537), nd = along(na, nb), nn = new THREE.Vector2(nd.y, -nd.x);
    const cc = na.clone().addScaledVector(nd, 1.5).addScaledVector(nn, .06 + .18);
    const con = rectTable('con', cc.x, cc.y, 1.2, .36, Math.atan2(nn.x, nn.y), { kind: 'cabinet', top: 'oak', h: .75 });
    pottedPlant(con.g, .3, 3, 77, { x: .4, y: .765 });
    const ap = na.clone().addScaledVector(nd, 1.5).addScaledVector(nn, .07);
    art(OX + ap.x / SX, OY + ap.y / SZ, Math.atan2(nn.x, nn.y), .9, .7, 1, 1.6);
    armchair(X(458), Z(505), -.81);
    plant(380, 636, 1.1, 1);
  }

  // --- Desk clusters, traced from the scan (metres) ----------------------------------
  // Each side of a cluster is two L desks whose short returns meet in the middle (a T);
  // two-sided clusters share a grey fabric privacy screen down the spine.
  const deskH = .74;
  const top = (x0, x1, z0, z1) =>
    tagged(put(world, DESK_SLAB, { width: x1 - x0, depth: z1 - z0, height: deskH }, { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }), 'desk', 'floor');
  const panelLeg = (x0, x1, z0, z1) =>
    loose(put(world, DESK_END_PANEL, { width: x1 - x0, depth: z1 - z0, height: deskH }, { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }));
  const pedestal = (x, z, face) => loose(put(world, PEDESTAL, { height: deskH }, { x, z, ry: face }));
  function privacyScreen(x0, x1, z0, z1, planter = false) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(x1 - x0, .035), d = Math.max(z1 - z0, .035), alongZ = d > w;
    const run = { length: alongZ ? d : w, axis: alongZ ? 'z' : 'x' };
    tagged(put(world, PRIVACY_SCREEN, { ...run, desk: deskH }, { x: cx, z: cz }), 'desk', 'floor');
    if (planter) put(world, TROUGH_PLANTER, { length: run.length * .55, axis: run.axis, seed: cx * 31 }, { x: cx, y: deskH + .386, z: cz });
  }
  // A seat: monitor(s) on the desk at (x, z) facing `face` (radians, 0 = +Z), chair 0.85 m in front.
  function station(x, z, face, o = {}) {
    const fx = Math.sin(face), fz = Math.cos(face), px = fz, pz = -fx, side = o.side ?? 1;
    makeMonitor(world, x, z, face, R() * 3 | 0);
    if (o.dual ?? R() < .55) makeMonitor(world, x + px * .6 * side, z + pz * .6 * side, face - .45 * side, R() * 3 | 0, false);
    else if (R() < .5) makeLaptop(world, x + px * .55 * side, z + pz * .55 * side, face - .4 * side);
    if (o.chair !== false) chair(x + fx * (.85 + R() * .12), z + fz * (.85 + R() * .12), face + Math.PI + (R() - .5) * .5);
    if (R() < .6) makeMug(world, x - px * .45 * side + fx * .2, z - pz * .45 * side + fz * .2);
    if (o.plant ?? R() < .5) pottedPlant(world, .26, 3, (x * 100 + z * 7) | 0, { x: x - px * .7 * side - fx * .1, y: deskH + .015, z: z - pz * .7 * side - fz * .1 });
    tagged(put(world, WASTE_BIN, {}, { x: x - px * .3 * side + fx * .25, z: z - pz * .3 * side + fz * .25 }), 'prop');
  }
  // Two-sided T cluster running along Z: spine at x = sp, arms (returns) sticking out on both sides mid-run.
  function tCluster(xw, sp, xe, z0, z1, armW, armE) {
    top(xw, sp, z0, z1); top(sp, xe, z0, z1);
    top(armW[0], xw, armW[1], armW[2]); top(xe, armE[0], armE[1], armE[2]);
    panelLeg(armW[0], armW[0] + .03, armW[1] + .02, armW[2] - .02); panelLeg(armE[0] - .03, armE[0], armE[1] + .02, armE[2] - .02);
    privacyScreen(sp - .0175, sp + .0175, z0, z1, true);
    const zs = [z0 + .3, z1 - .3], seatsZ = [(z0 + armW[1]) / 2, (armW[2] + z1) / 2];
    for (const z of zs) { pedestal((xw + sp) / 2, z, -Math.PI / 2); pedestal((sp + xe) / 2, z, Math.PI / 2); }
    seatsZ.forEach((z, i) => { station(sp - .28, z, -Math.PI / 2, { side: i ? 1 : -1 }); station(sp + .28, z, Math.PI / 2, { side: i ? -1 : 1 }); });
  }

  // Office 1, west cluster and east cluster
  tCluster(-.47, .27, 1.0, .84, 4.4, [-1.19, 2.21, 2.99], [1.84, 2.24, 2.9]);
  tCluster(5.03, 5.84, 6.65, .96, 4.45, [4.3, 2.34, 3.0], [7.36, 2.39, 3.14]);
  // Office 2: one-sided cluster, users on the north side next to the joined returns
  top(.06, 3.34, -2.42, -1.7); top(1.46, 2.15, -3.17, -2.42);
  privacyScreen(.06, 3.34, -1.7175, -1.6825, true);
  pedestal(.35, -2.06, Math.PI); pedestal(3.05, -2.06, Math.PI);
  panelLeg(1.48, 2.13, -3.17, -3.14);
  station(.75, -1.98, Math.PI, { side: -1 }); station(2.75, -1.98, Math.PI, { side: 1 });
  // Office 2 corner L desk against the north wall
  top(.1, 1.4, -4.78, -4.08); top(.95, 1.4, -4.08, -3.55);
  pedestal(1.17, -3.82, -Math.PI / 2); panelLeg(.1, .13, -4.76, -4.1);
  station(.55, -4.5, 0, { side: 1 });
  // Office 1 south-east corner: L desk on the east wall, standing desk under the window, bean bags, mat, dumbbells.
  top(9.99, 10.72, 2.49, 5.0); top(9.17, 9.99, 2.49, 3.2);
  pedestal(9.42, 2.85, Math.PI / 2); panelLeg(9.99, 10.7, 4.97, 5.0);
  station(10.42, 3.95, -Math.PI / 2, { dual: true, side: -1 });
  {
    put(world, DESK_HUTCH, {}, { x: 10.56, y: deskH, z: 4.6 });
    const sd = tagged(put(world, STANDING_DESK, {}, { x: 9.17, z: 4.72, ry: Math.PI }), 'desk');
    makeLaptop(sd, 0, -.05, 0);
    const beanBag = (x, z, colour, size) => tagged(put(world, BEAN_BAG, { colour, size }, { x, z, ry: R() * 6 }), 'prop');
    beanBag(10.1, 1.8, 'beanPurple', 1.0); beanBag(9.0, 1.78, 'beanGrey', 1.1);
    put(world, YOGA_MAT, {}, { x: 7.28, z: 4.55 });
    for (const [x, z] of [[8.1, 4.25], [8.25, 4.45], [8.0, 4.85]]) tagged(put(world, DUMBBELL, {}, { x, z, ry: R() * 3 }), 'prop');
  }

  // --- Office 1 ---------------------------------------------------------------
  roundTable('rt', 538, 628, .5, .5);
  seat('rt', 560, 655); seat('rt', 572, 612);
  // TV on a black-legged standing desk under the window, ottoman in front
  tagged(put(world, TV_DESK, {}, { x: 2.8, z: 4.72, ry: Math.PI }), 'furniture');
  tagged(put(world, OTTOMAN, {}, { x: 2.75, z: 2.9 }), 'furniture');
  floorLamp(752, 400);
  // green recycling bin by the office 2 door
  tagged(put(world, RECYCLING_BIN, {}, { x: X(565), z: Z(306) }), 'prop');
  plant(520, 655, 1.0, 0); plant(600, 646, 1.1, 2); plant(1000, 646, 1.0, 0); plant(1115, 640, 1.2, 1); plant(690, 646, .9, 1);
  art(1250 - 7.5, 520, -Math.PI / 2, .9, 1.1, 2);

  // --- Office 2 + games lounge ------------------------------------------------------
  sofa(4.09, -2.155, Math.PI / 2, 2.59, .88);
  // structural pillar behind the sofa (scan: 0.44 x 0.31 m) and a thin column
  tagged(put(world, PILLAR, { width: .44, depth: .31, height: H }, { x: 3.27, z: -1.49 }), 'pillar');
  tagged(put(world, PILLAR, { shape: 'round', width: .12, height: H }, { x: 3.35, z: -2.75 }), 'pillar');
  // The ping-pong table (the library's, shared with Rue des Érables), its length along z where the
  // scan's two bamboo tables stood (1.27 x 2.78 m).
  tagged(put(world, PING_PONG_TABLE, {}, { x: 6.135, z: -1.9, ry: Math.PI / 2 }), 'table');
  { // zig-zag LED strip on the ceiling over the table
    const pts = [[905, 222], [955, 268], [1010, 238], [1060, 290], [1105, 262]].map(([x, y]) => V(x, y));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a);
      put(ceilingGroup, LED_STRIP, { length: d.length(), ceiling: H }, { x: (a.x + b.x) / 2, z: (a.y + b.y) / 2, ry: -Math.atan2(d.y, d.x) });
    }
  }
  // east wall: grey loveseat, office chair, archery target leaning on the wall
  sofa(8.15, -1.6, -Math.PI / 2, 1.15, .8);
  chair(8.3, -.5, -Math.PI / 2 - .4);
  tagged(put(world, ARCHERY_TARGET, {}, { x: X(1132) - .2, z: .35, ry: -Math.PI / 2 }), 'prop');
  plant(1238, 100, 1.3, 2); plant(830, 112, 1.1, 1); plant(1110, 165, 1.0, 0); plant(622, 108, 1.1, 1);
  // whiteboard on the partition, facing west; notices on the north wall
  put(world, WHITEBOARD, {}, { x: X(640) - .07, z: Z(190), ry: -Math.PI / 2 });
  for (const x of [1012, 1034]) put(world, NOTICE, {}, { x: X(x), z: Z(88) + .135 });

  // --- Closet shelving -------------------------------------------------------------
  tagged(put(world, CLOSET_SHELVES, { width: (1245 - 1140) * S }, { x: X(1192), z: Z(450) - .28 }), 'furniture');

  // -------------------------------------------------------------------------
  // Ceiling lights on the tile grid, diffusers, sprinklers, exit sign
  // -------------------------------------------------------------------------
  const INTERIOR = [[222, 169, 342, 300], [386, 356, 400, 404], [342, 300, 386, 356], [400, 110, 398, 238], [398, 238, 386, 356], [398, 238, 510, 290], [640, 92, 640, 290], [510, 290, 640, 290], [400, 404, 257, 537], [400, 404, 502, 512], [503, 512, 503, 670], [1132, 358, 1132, 450], [1132, 450, 1250, 450]]
    .map(([a, b, c, d]) => [V(a, b), V(c, d)]);
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  const panels = [];
  {
    const xs = outline.map((p) => p.x), zs = outline.map((p) => p.y);
    for (let x = Math.min(...xs) + 1.2; x < Math.max(...xs); x += 2.4) for (let z = Math.min(...zs) + 1.2; z < Math.max(...zs); z += 2.4) {
      const px = Math.round((x - .3) / .6) * .6 + .3, pz = Math.round(z / .6) * .6;
      const c = new THREE.Vector2(px, pz);
      const ok = [[-.9, -1.2], [.9, -1.2], [-.9, 1.2], [.9, 1.2]].every(([dx, dz]) => inside(new THREE.Vector2(px + dx, pz + dz)))
        && INTERIOR.every(([a, b]) => segDist(c, a, b) > .8) && !inside(c, zone([[1132, 358], [1250, 358], [1250, 450], [1132, 450]]));
      if (ok) panels.push(c);
    }
  }
  for (const c of panels) put(ceilingGroup, CEILING_PANEL, { ceiling: H }, { x: c.x, z: c.y });
  for (const c of panels) {
    const p = new THREE.Vector2(c.x + 1.2, c.y + .3);
    if (!inside(p) || INTERIOR.some(([a, b]) => segDist(p, a, b) < .5)) continue;
    put(ceilingGroup, AIR_DIFFUSER, { ceiling: H }, { x: p.x, z: p.y });
  }
  for (let x = -10; x < 11; x += 3) for (let z = -4.5; z < 5; z += 3) {
    const p = new THREE.Vector2(x + .3, z + .6);
    if (inside(p)) put(ceilingGroup, SPRINKLER, { ceiling: H }, { x: p.x, z: p.y });
  }
  put(world, EXIT_SIGN, {}, { x: X(1132) - .16, z: Z(219), ry: -Math.PI / 2 });

  // -------------------------------------------------------------------------
  // Furniture colliders: one oriented box per collider unit (top-level object or anything with
  // userData.tag), in the unit's own yaw frame. Small things sitting on desks are skipped.
  // -------------------------------------------------------------------------
  {
    world.updateMatrixWorld(true);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const F = new THREE.Matrix4(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), bb = new THREE.Box3();
    const unit = (obj) => {
      obj.getWorldPosition(pos); obj.getWorldQuaternion(q); e.setFromQuaternion(q, 'YXZ');
      if (Math.abs(e.x) > .01 || Math.abs(e.z) > .01) return; // floor slabs and flat decals
      F.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, e.y), one); inv.copy(F).invert();
      const box3 = new THREE.Box3();
      const collect = (o) => {
        if (o !== obj && (o.userData.col === false || o.userData.tag)) return;
        if (o.isMesh) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          rel.multiplyMatrices(inv, o.matrixWorld); box3.union(bb.copy(o.geometry.boundingBox).applyMatrix4(rel));
        }
        for (const c of o.children) collect(c);
      };
      collect(obj);
      if (box3.isEmpty()) return;
      let y0 = pos.y + box3.min.y; const y1 = pos.y + box3.max.y;
      if (y1 - y0 < .05 || y0 < -1) return;      // flat mats, papers; trees outside
      if (obj.userData.col === 'floor') y0 = 0; else if (y0 > .5) return;
      const c = new THREE.Vector3((box3.min.x + box3.max.x) / 2, 0, (box3.min.z + box3.max.z) / 2).applyMatrix4(F);
      addBox(c.x, (y0 + y1) / 2, c.z, (box3.max.x - box3.min.x) / 2, (y1 - y0) / 2, (box3.max.z - box3.min.z) / 2, e.y, obj.userData.tag ?? 'furniture');
    };
    const visit = (o, isTop) => {
      if (o.userData.col === false) return;
      if (isTop || o.userData.tag) unit(o);
      for (const c of o.children) visit(c, false);
    };
    for (const c of world.children) visit(c, true);
  }

  // -------------------------------------------------------------------------
  // Outside: street level two storeys below, streets, trees, neighbourhood. Only looks: nothing
  // out there collides, and the glass keeps players in.
  // -------------------------------------------------------------------------
  if (opts.outside !== false) {
    const flat = (w, d, mat, x, z, y = GROUND) => { const m = mesh(new THREE.PlaneGeometry(w, d), mat, outside, false, true); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return m; };
    flat(800, 800, M.grass, 0, 0, GROUND - .03);
    M.grass.map?.repeat.set(800 / 6, 800 / 6); M.grass.normalMap?.repeat.set(800 / 6, 800 / 6);
    flat(34, 24, M.concrete, 0, -1, GROUND - .02);
    M.concrete.map?.repeat.set(34 / 4, 24 / 4); M.concrete.normalMap?.repeat.set(34 / 4, 24 / 4);
    const asphalt = std({ color: 0x2c2e31, roughness: .85 }), paintM = std({ color: 0xd8d4c8, roughness: .7 }), walkway = std({ color: 0xa9a59c, roughness: .9 });
    flat(30, 7, asphalt, 0, -9.5, GROUND - .015);
    for (let x = -14; x <= 14; x += 2.6) flat(.1, 4.6, paintM, x, -10.6, GROUND - .01);
    flat(400, 8, asphalt, 0, 15, GROUND - .01);
    flat(7, 400, asphalt, -22.5, 0, GROUND - .012);
    flat(6, 400, asphalt, 20, 0, GROUND - .012);
    for (let x = -200; x < 200; x += 6) if (Math.abs(x + 22.5) > 5 && Math.abs(x - 20) > 5) flat(3, .15, paintM, x, 15, GROUND - .005);
    for (let z = -200; z < 200; z += 6) if (Math.abs(z - 15) > 6) flat(.15, 3, paintM, -22.5, z, GROUND - .005);
    for (let k = -3; k <= 3; k++) { flat(.5, 3, paintM, -16 + k * .9, 13.5, GROUND - .004); flat(3, .5, paintM, -22.5, 8.6 + k * .9, GROUND - .004); }
    flat(400, 3.2, walkway, 0, 20.6, GROUND - .008);
    flat(3.2, 400, walkway, -27.6, 0, GROUND - .009);
    flat(3.2, 400, walkway, 24.6, 0, GROUND - .009);

    // Our building below the office: two storeys with ribbon windows, same footprint.
    const ribbon = tiled(canvasTexture(128, 150, (c, w, h) => {
      c.fillStyle = '#ddd6c8'; c.fillRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, 45, 0, 105); gr.addColorStop(0, '#6f8796'); gr.addColorStop(1, '#2d3b45');
      c.fillStyle = gr; c.fillRect(0, 48, w, 57);
      c.fillStyle = '#3a3d42'; for (let x = 0; x < w; x += 32) c.fillRect(x, 48, 3, 57);
      c.fillStyle = '#c9c1b2'; c.fillRect(0, 105, w, 3);
    }), 1 / 3, 1 / 3.5);
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
    const podium = mesh(new THREE.ExtrudeGeometry(shape, { depth: -GROUND - .02, bevelEnabled: false }), std({ map: ribbon, roughness: .8 }), outside, false, true);
    podium.rotation.x = -Math.PI / 2; podium.position.y = GROUND;

    // Street trees on the sidewalks
    const tr = rng(77), spots = [];
    for (let x = -14; x <= 14; x += 5) spots.push([x + tr(), 10.3]);
    for (let z = -11; z <= 8; z += 5) spots.push([-18.6, z + tr()]);
    for (let x = -70; x <= 75; x += 9) if (Math.abs(x + 22.5) > 6 && Math.abs(x - 20) > 6) spots.push([x + tr() * 2, 19.6]);
    for (const [x, z] of spots) put(outside, STREET_TREE, { height: 3.5 + tr() * 2.5 }, { x, y: GROUND, z });

    // Neighbourhood across the streets: red-brick apartment blocks with balconies, beige low-rises and
    // glass office buildings with green awnings. front: the way its street side looks ('n','s','e','w').
    function building(x0, x1, z0, z1, floors, style, front) {
      put(outside, CITY_BUILDING, { width: x1 - x0, depth: z1 - z0, floors, style, front }, { x: (x0 + x1) / 2, y: GROUND, z: (z0 + z1) / 2 });
    }
    [[-62, -42, 14, 5, 'brick'], [-38, -26, 15, 6, 'brick2'], [-14, 6, 14, 5, 'brick'], [10, 16, 12, 3, 'beige'],
     [27, 46, 14, 4, 'office'], [50, 70, 13, 6, 'brick2']].forEach(([a, b, d, f, st]) => building(a, b, 22.4, 22.4 + d, f, st, 'n'));
    [[-44, -24, 14, 4, 'beige'], [-20, -3, 16, 5, 'office'], [1, 11, 12, 3, 'brick']].forEach(([a, b, d, f, st]) => building(-29.4 - d, -29.4, a, b, f, st, 'e'));
    [[-30, -12, 14, 4, 'brick'], [-8, 10, 14, 5, 'beige']].forEach(([a, b, d, f, st]) => building(26.4, 26.4 + d, a, b, f, st, 'w'));
    [[-17, -1, 12, 4, 'office'], [3, 17, 12, 3, 'brick2']].forEach(([a, b, d, f, st]) => building(a, b, -16 - d, -16, f, st, 's'));
    // distant skyline
    const sr = rng(91);
    for (let i = 0; i < 30; i++) {
      const a = sr() * Math.PI * 2, r = 110 + sr() * 120, w = 10 + sr() * 18, d = 10 + sr() * 18, h = 8 + sr() * 45;
      put(outside, SKYLINE_TOWER, { width: w, height: h, depth: d, windows: i % 3 }, { x: Math.cos(a) * r, y: GROUND, z: Math.sin(a) * r, ry: sr() * Math.PI });
    }
  }

  // -------------------------------------------------------------------------
  // Exact collision: every interior triangle (furniture, walls, floor, ceiling, doors), merged into
  // two meshes with a BVH: `solid` and `glass` (windows, glass partitions, the glass door).
  // Leaves and blind slats are left out. The meshes are not added to the scene.
  // -------------------------------------------------------------------------
  let collision = null;
  if (opts.collision !== false) {
    const solid = [], glass = [];
    // With `surfaces` (the browser's build, for bullet impacts): what each solid triangle is made of,
    // an index into SURFACES. Only read alongside: the collision geometry is the same either way.
    const kinds = opts.surfaces ? [] : null;
    const surfaceOf = opts.surfaces ? surfaceLookup(M, screenMats, artMats) : null;
    const skipped = (o) => { for (let p = o; p; p = p.parent) if (p.userData.noCollide) return true; return false; };
    for (const group of [world, ceilingGroup]) {
      group.updateMatrixWorld(true);
      group.traverse((o) => {
        if (!o.isMesh || skipped(o)) return;
        const g = new THREE.BufferGeometry();
        const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
        g.setAttribute('position', src.attributes.position.clone());
        g.applyMatrix4(o.matrixWorld);
        if (o.material === M.glass) { glass.push(g); return; }
        solid.push(g);
        if (kinds) {
          const kind = surfaceOf(Array.isArray(o.material) ? o.material[0] : o.material);
          for (let t = 0; t < g.attributes.position.count / 3; t++) kinds.push(kind);
        }
      });
    }
    const build = (list, name, triangleKinds) => {
      const g = mergeVertices(mergeGeometries(list), 1e-4);
      // Merging keeps the triangles in order; the BVH then reorders them: find each one again by its corners.
      const byCorners = triangleKinds ? kindsByCorners(g, triangleKinds) : null;
      g.boundsTree = new MeshBVH(g);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, color: name === 'glass' ? 0x40c0ff : 0x40ff80 }));
      m.name = `collision-${name}`;
      if (byCorners) m.userData.surfaces = surfacesInOrder(g, byCorners);
      return m;
    };
    collision = { solid: build(solid, 'solid', kinds), glass: build(glass, 'glass', null) };
  }

  return {
    root, interior: world, ceiling: ceilingGroup, outside,
    collision, colliders, doors,
    spawnPoints: SPAWN_POINTS.map((s) => ({ ...s, position: [...s.position] })),
    bounds: { floorY: 0, ceilingY: H, groundY: GROUND },
    materials: M,
  };
}

/**
 * Builds the office into `scene` and returns its gameplay data: the browser's build, textured,
 * lit and baked. Sets scene.fog (no scene.environment: see below). Shadows: enable renderer.shadowMap
 * yourself; the sun casts.
 */
/** The ambient light standing in for the room reflections (they used to light the office at 0.45). */
const AMBIENT_FOR_REFLECTIONS = 4.5;
/** With the baked light: the ambient and sky lights on the spawns' open floor (the bake's 1). */
const BAKED = { ambient: 3.9, hemi: 1.8 };

export function buildOffice(scene, renderer, opts = {}) {
  // No scene.environment: reflections sampled on every pixel of every frame were about half of the
  // GPU's work, for a room that never changes. An ambient light gives the same brightness (tuned to
  // match it); only the glass keeps a reflection map of its own, where it shows.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const materials = createOfficeMaterials(renderer);
  const office = buildOfficeGeometry({ surfaces: true, ...opts, materials });
  const { root, interior, ceiling, outside } = office, M = materials.M;
  scene.add(root);
  if (opts.outside !== false) scene.fog = new THREE.FogExp2(0xc9d3dc, .0055);

  // -------------------------------------------------------------------------
  // Sky, sun, ambient
  // -------------------------------------------------------------------------
  // Drawn after the office (renderOrder): its shader then runs only where the sky shows through the
  // windows, not under every wall first.
  const sky = new Sky(); sky.scale.setScalar(800); sky.renderOrder = 1; root.add(sky);
  const sun = new THREE.DirectionalLight(0xffe8c8, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 90 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .03;
  root.add(sun, sun.target);
  // With the baked light (`opts.lighting`, map/light.ts) the ambient and sky lights are scaled, per
  // pixel, by how much light really gets there: panels, windows, corners, under the desks.
  const lighting = opts.lighting ?? null;
  const hemiScale = lighting ? BAKED.hemi : 1;
  // The bake already knows what's below (grey carpet, white tile): a neutral ground, not brown.
  const hemi = new THREE.HemisphereLight(0xf2f4f7, lighting ? 0xa8a8a6 : 0x8b8378, hemiScale); root.add(hemi);
  // Without the bake, a cheap stand-in for the ceiling panels: soft top-down light, no shadows.
  if (!lighting) {
    const ceilingFill = new THREE.DirectionalLight(0xfff4e8, .9); ceilingFill.position.set(.5, 10, .8); root.add(ceilingFill);
  }
  function setTime(i) {
    const t = TIMES[i];
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - t.elev), THREE.MathUtils.degToRad(t.azim));
    const u = sky.material.uniforms;
    u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = .005; u.mieDirectionalG.value = .82; u.sunPosition.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(40); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld();
    sun.color.set(t.color); sun.intensity = t.sun; hemi.intensity = t.hemi * hemiScale;
    renderer.shadowMap.needsUpdate = true;
  }

  // What the reflections lit, as one flat light: the same average brightness from the spawns.
  root.add(lighting ? new THREE.AmbientLight(0xffffff, BAKED.ambient) : new THREE.AmbientLight(0xffffff, AMBIENT_FOR_REFLECTIONS));
  M.glass.envMap = reflections;
  M.glass.envMapIntensity = lighting ? 2.2 : 1.6;
  if (lighting) lighting.patchAll(root);

  // -------------------------------------------------------------------------
  // Static geometry is merged per material (thousands of draw calls -> a few dozen); only large
  // objects cast sun shadows.
  // -------------------------------------------------------------------------
  function bake(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map(), sph = new THREE.Sphere();
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      const cast = o.castShadow && sph.radius > .55;
      const key = `${o.material.uuid}|${cast}|${o.receiveShadow}`;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const keepAttrs = o.material.vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
      for (const name of Object.keys(g.attributes)) if (!keepAttrs.includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {}; g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast, recv: o.receiveShadow, order: o.renderOrder, geos: [], sources: [] });
      const bucket = buckets.get(key);
      bucket.geos.push(g);
      addSource(bucket.sources, g.attributes.position.count, assetOf(o, group));
    });
    for (const c of [...group.children]) group.remove(c);
    for (const b of buckets.values()) {
      const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order; group.add(m);
      m.userData.sources = b.sources; m.userData.drawnBy = 'office.js';
    }
    group.updateMatrixWorld(true);
    group.traverse((o) => { o.matrixAutoUpdate = false; });
  }
  if (opts.bake !== false) { bake(interior); bake(ceiling); bake(outside); }

  setTime(0);

  return { ...office, sun, setTime, times: TIMES.map((t) => t.name) };
}

// Wireframe boxes for every collider, coloured by tag. Add it to the scene to check collisions.
export function makeColliderHelper(colliders) {
  const colors = { wall: 0xff4040, glass: 0x40c0ff, door: 0xffa000, floor: 0x606060, ceiling: 0x606060, desk: 0x40ff60, chair: 0xffff40, plant: 0x30a030, prop: 0xff40ff, pillar: 0xff8080 };
  const pos = [], col = [], c = new THREE.Color(), v = new THREE.Vector3();
  const edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const b of colliders) {
    if (b.tag === 'floor' || b.tag === 'ceiling') continue;
    c.set(colors[b.tag] ?? 0xffffff);
    const cs = Math.cos(b.rotY), sn = Math.sin(b.rotY);
    const corners = [];
    for (let i = 0; i < 8; i++) {
      const lx = (i & 1 ? 1 : -1) * b.half[0], ly = (i & 2 ? 1 : -1) * b.half[1], lz = (i & 4 ? 1 : -1) * b.half[2];
      corners.push(v.set(b.center[0] + lx * cs + lz * sn, b.center[1] + ly, b.center[2] - lx * sn + lz * cs).toArray());
    }
    for (const [i, j] of edges) { pos.push(...corners[i], ...corners[j]); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: .8 }));
}
