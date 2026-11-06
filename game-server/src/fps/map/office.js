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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

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

  // Carpet tiles, 50 cm, quarter-turned stripes like the scan's office carpet.
  const carpetT = (() => {
    const n1 = noise(1, 64), n2 = noise(2, 8), tone = rng(3);
    const tones = Array.from({ length: 4 }, () => (tone() - .5) * 10);
    return paint(512, 1, (u, v, o) => {
      const tx = u < .5 ? 0 : 1, ty = v < .5 ? 0 : 1, lu = (u * 2) % 1, lv = (v * 2) % 1;
      const s = (tx + ty) % 2 === 0 ? lu : lv;
      const stripe = Math.sin((s * 40 + n2(u, v) * 2) * Math.PI * 2) * .5 + .5;
      const fine = n1(u, v);
      const seam = (lu < .008 || lv < .008) ? -18 : 0;
      const base = 58 + tones[tx + ty * 2] + stripe * 9 + fine * 14 + seam;
      o[0] = clamp255(base + 4); o[1] = clamp255(base + 2); o[2] = clamp255(base + 2);
      o[3] = stripe * .5 + fine * .4 + (seam ? -.4 : 0);
    }, 3);
  })();
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
      const k = grout ? 150 : 214 + n(u, v) * 14 - m(u, v) * 10;
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
  const M = {
    wall: std({ color: 0xe2ded6, ...plasterT, roughness: .92, normalScale: new THREE.Vector2(.3, .3) }),
    baseboard: std({ color: 0x2b2d31, roughness: .55 }),
    frame: std({ color: 0x24272c, metalness: .75, roughness: .32 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdff1f8, metalness: 0, roughness: .03, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }),
    carpet: std({ ...carpetT, roughness: 1, normalScale: new THREE.Vector2(.6, .6) }),
    tile: std({ ...tileT, roughness: .22, normalScale: new THREE.Vector2(.6, .6) }),
    closetTile: std({ ...tileT, color: 0xdde8e4, roughness: .3 }),
    ceiling: std({ ...ceilT, roughness: .95, normalScale: new THREE.Vector2(.5, .5), shadowSide: THREE.DoubleSide }),
    roof: std({ color: 0x3a3c40, roughness: .9 }),
    deskTop: std({ color: 0xd9d6cf, roughness: .5 }),
    deskWhite: std({ color: 0xe3e1dc, roughness: .55 }),
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
    counter: std({ color: 0xeeece8, roughness: .16 }),
    cabinet: std({ color: 0x2f4a43, roughness: .5 }),
    cabinetWhite: std({ color: 0xf1f0ec, roughness: .45 }),
    subway: std({ ...subwayT, roughness: .12, normalScale: new THREE.Vector2(.5, .5) }),
    leaf: std({ color: 0x3e7a3a, roughness: .55, side: THREE.DoubleSide }),
    leafDark: std({ color: 0x2c5e2e, roughness: .6, side: THREE.DoubleSide }),
    pot: std({ color: 0xcfc9bf, roughness: .85 }),
    potDark: std({ color: 0x2e2f31, roughness: .7 }),
    soil: std({ color: 0x3a2a1f, roughness: 1 }),
    whiteboard: std({ map: whiteboardTexture(), roughness: .12 }),
    panel: std({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 2.4, roughness: .5 }),
    bulb: std({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 9 }),
    concrete: std({ ...concreteT, roughness: .92 }),
    grass: std({ ...grassT, roughness: 1 }),
    bark: std({ color: 0x4b3a2c, roughness: 1 }),
    door: std({ map: woodT.map, color: 0xd8c3a5, roughness: .55 }),
    blind: std({ color: 0xd8dadb, roughness: .7, side: THREE.DoubleSide }),
    heater: std({ color: 0xf0efeb, roughness: .5 }),
    bamboo: std({ color: 0xd8bf96, roughness: .42 }),
    greenBin: std({ color: 0x1f8a4c, roughness: .5 }),
    bin: std({ color: 0x3a3c3f, roughness: .6, metalness: .4, transparent: true, opacity: .85 }),
    pillar: std({ color: 0xeceae5, ...plasterT, roughness: .9, normalScale: new THREE.Vector2(.3, .3) }),
  };
  const screenMats = screens.map((t) => std({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1, roughness: .15 }));
  const artMats = [1, 2, 3, 4, 5].map((s) => std({ map: artTexture(s), roughness: .7 }));

  return { M, screenMats, artMats, texture: canvasTexture };
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
  const { M, screenMats, artMats, texture: canvasTexture } = opts.materials ?? plainOfficeMaterials();
  const std = (o) => new THREE.MeshStandardMaterial(o);
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
  function box(w, h, d, mat, x, y, z, parent = world, rotY = 0) {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); m.position.set(x, y, z); m.rotation.y = rotY; return m;
  }
  function rbox(w, h, d, r, mat, x, y, z, parent = world) {
    const m = mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, parent); m.position.set(x, y, z); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent = world, seg = 24) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, parent); m.position.set(x, y, z); return m;
  }
  function group(x, z, rotY = 0, parent = world, tag) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; if (tag) g.userData.tag = tag; parent.add(g); return g;
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
  // Plants (needed by the window dressing below)
  // kind 0/1: leafy floor plant (light/dark pot), 2: tall bushy, 3: small desk plant, 4: trailing pothos.
  // -------------------------------------------------------------------------
  function makePlant(s = 1, kind = 0, seed = 1) {
    const g = tagged(new THREE.Group(), 'plant');
    const potM = kind % 2 ? M.potDark : M.pot;
    cyl(.2 * s, .15 * s, .42 * s, potM, 0, .21 * s, 0, g);
    cyl(.19 * s, .19 * s, .01, M.soil, 0, .4 * s, 0, g);
    const leafShape = new THREE.Shape();
    if (kind === 4) { leafShape.moveTo(0, 0); leafShape.bezierCurveTo(.1, .04, .08, .16, 0, .2); leafShape.bezierCurveTo(-.08, .16, -.1, .04, 0, 0); }
    else { leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.09, .14, 0, .34); leafShape.quadraticCurveTo(-.09, .14, 0, 0); }
    const base = new THREE.ShapeGeometry(leafShape, 6);
    const geos = [], r = rng(seed);
    const count = { 2: 60, 3: 22, 4: 70 }[kind] ?? 34;
    for (let i = 0; i < count; i++) {
      const gq = base.clone(), m4 = new THREE.Matrix4();
      let h = (.45 + r() * (kind === 2 ? 1.2 : .7)) * s, a = r() * Math.PI * 2, tilt = .5 + r() * .7, sc = (.8 + r() * .7) * s;
      let rad = .05;
      if (kind === 3) { h = (.42 + r() * .25) * s; tilt = .3 + r() * .9; }
      if (kind === 4) { const k = r(); h = (.42 - k * 1.1) * s; rad = (.15 + k * .1) * s; tilt = 1.2 + r() * 1.2; sc = (.7 + r() * .4) * s; }
      m4.compose(new THREE.Vector3(Math.cos(a) * rad, h, Math.sin(a) * rad), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, 0, 'YXZ')), new THREE.Vector3(sc, sc, sc));
      gq.applyMatrix4(m4); geos.push(gq);
      if (i % 3 === 0 && kind !== 4) {
        const st = new THREE.CylinderGeometry(.006, .008, h - .38 * s, 5); st.translate(0, .4 * s + (h - .38 * s) / 2, 0); geos.push(st);
      }
    }
    const leaves = geos.map((q) => q.index ? q.toNonIndexed() : q);
    leaves.forEach((q) => { q.deleteAttribute('uv'); if (!q.attributes.normal) q.computeVertexNormals(); });
    // leaves are pass-through for collisions (hundreds of tiny triangles would snag a small player)
    mesh(mergeGeometries(leaves), kind === 1 ? M.leafDark : M.leaf, g).userData.noCollide = true;
    return g;
  }
  function plant(px, py, s = 1, kind = 0) {
    const g = makePlant(s, kind, px * 13 + py); g.position.set(X(px), 0, Z(py)); g.rotation.y = R() * 6.28; world.add(g); return g;
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
      const pm = mesh(worldUV(new THREE.BoxGeometry(w, h, t), w, h, t), mat, g); pm.position.set((s + e) / 2, (y0 + y1) / 2, 0);
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
        const ht = mesh(new THREE.BoxGeometry(Math.min(o.e - o.s, 2.4) - .1, .19, .07), M.heater, g); ht.position.set((o.s + o.e) / 2, .2, inner + sg * .035);
        const bh = head - sill + .12, slats = [], nb = Math.min(14, Math.round((o.e - o.s) * 4));
        for (const end of o.e - o.s > 3 ? [o.s, o.e] : [o.e]) {
          const towardMid = end === o.s ? 1 : -1;
          for (let k = 0; k < nb; k++) {
            const sl = new THREE.BoxGeometry(.089, bh, .003); sl.rotateY(1.35 + (k % 2) * .08);
            sl.translate(end + towardMid * (.07 + k * .014), sill + bh / 2 - .04, inner + sg * .07); slats.push(sl);
          }
        }
        mesh(mergeGeometries(slats), M.blind, g).userData.noCollide = true;
        const rail = mesh(new THREE.BoxGeometry(o.e - o.s, .04, .05), M.heater, g); rail.position.set((o.s + o.e) / 2, head + .07, inner + sg * .07);
        if (R() < .55) {
          const p = makePlant(.22, 3, Math.floor(o.s * 100)), at = o.s + (o.e - o.s) * (.2 + R() * .6);
          p.position.set(at, sill + .03, inner + sg * .02); g.add(p);
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
  function makeChair() {
    const g = tagged(new THREE.Group(), 'chair');
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const leg = mesh(new THREE.BoxGeometry(.3, .03, .045), M.metalBlack, g); leg.position.set(Math.sin(a) * .15, .075, Math.cos(a) * .15); leg.rotation.y = a - Math.PI / 2;
      const w = mesh(new THREE.SphereGeometry(.028, 12, 8), M.plastic, g); w.position.set(Math.sin(a) * .29, .03, Math.cos(a) * .29);
    }
    cyl(.025, .025, .34, M.chrome, 0, .26, 0, g);
    cyl(.06, .06, .05, M.metalBlack, 0, .42, 0, g);
    rbox(.5, .08, .48, .035, M.chairFabric, 0, .47, .01, g);
    const back = rbox(.46, .54, .06, .03, M.chairFabric, 0, .82, -.25, g); back.rotation.x = -.12;
    box(.05, .32, .02, M.metalBlack, 0, .62, -.27, g);
    for (const s of [-1, 1]) {
      box(.025, .2, .035, M.metalBlack, s * .25, .58, -.03, g);
      rbox(.06, .03, .26, .012, M.plastic, s * .25, .69, -.03, g);
    }
    return g;
  }
  const chairProto = makeChair();
  function chair(x, z, rot) { const c = chairProto.clone(); c.position.set(x, 0, z); c.rotation.y = rot; world.add(c); return c; }

  function makeMonitor(parent, x, z, rot, kind, keys = true) {
    const g = group(x, z, rot, parent); g.position.y = .755; g.userData.col = false;
    box(.24, .012, .18, M.metalBlack, 0, .006, -.02, g);
    box(.04, .34, .025, M.metalBlack, 0, .18, -.07, g);
    rbox(.64, .38, .028, .008, M.plastic, 0, .36, -.05, g);
    const scr = mesh(new THREE.PlaneGeometry(.61, .35), screenMats[kind], g, false, false); scr.position.set(0, .36, -.035);
    if (keys) {
      box(.44, .015, .14, M.plastic, 0, .008, .26, g);
      rbox(.06, .02, .1, .009, M.plastic, .3, .01, .26, g);
    }
    return g;
  }
  function makeLaptop(parent, x, z, rot) {
    const g = group(x, z, rot, parent); g.position.y = .755; g.userData.col = false;
    box(.32, .015, .22, M.steel, 0, .008, 0, g);
    const lid = new THREE.Group(); lid.position.set(0, .015, -.11); lid.rotation.x = -.3; g.add(lid);
    box(.32, .21, .008, M.steel, 0, .105, -.005, lid);
    const s = mesh(new THREE.PlaneGeometry(.29, .18), screenMats[R() * 3 | 0], lid, false, false); s.position.set(0, .105, 0);
    return g;
  }
  function makeMug(parent, x, z) {
    const m = cyl(.04, .036, .095, [M.plasticWhite, M.leather, M.cabinet][R() * 3 | 0], x, .755 + .048, z, parent, 16);
    m.userData.col = false; return m;
  }

  const tables = {};
  function rectTable(id, cx, cz, w, d, rot, opts = {}) {
    const g = group(cx, cz, rot, world, opts.kind === 'cabinet' ? 'furniture' : 'desk');
    const top = opts.top ?? M.deskTop, hh = opts.h ?? .74;
    box(w, .03, d, top, 0, hh, 0, g);
    if (opts.kind === 'cabinet') {
      box(w - .02, hh - .02, d - .02, M.cabinetWhite, 0, hh / 2, 0, g);
      box(w - .03, .004, .01, M.plastic, 0, hh * .5, d / 2 - .005, g);
    } else {
      // Sled frames at both ends of the long axis, joined by a beam under the top.
      const alongX = w >= d, L = alongX ? w : d, Wd = alongX ? d : w;
      const put = (a, c, sx, sy, sz, y) => alongX ? box(sx, sy, sz, M.metalBlack, a, y, c, g) : box(sz, sy, sx, M.metalBlack, c, y, a, g);
      for (const e of [-1, 1]) {
        const a = e * (L / 2 - .07);
        for (const s of [-1, 1]) put(a, s * (Wd / 2 - .07), .04, hh - .03, .04, (hh - .03) / 2);
        put(a, 0, .05, .025, Wd - .08, .0125);
        put(a, 0, .05, .03, Wd - .1, hh - .03);
      }
      put(0, -Wd / 2 + .15, L - .2, .05, .03, hh - .045);
    }
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
  function roundTable(id, px, py, rx, rz, rot = 0, top = M.oak) {
    const cx = X(px), cz = Z(py), g = group(cx, cz, rot, world, 'table');
    const t = mesh(new THREE.CylinderGeometry(1, 1, .04, 64), top, g); t.scale.set(rx, 1, rz); t.position.y = .74;
    const e = mesh(new THREE.CylinderGeometry(1, 1, .01, 64), M.metalBlack, g); e.scale.set(rx + .004, 1, rz + .004); e.position.y = .718;
    if (rx > .9) { for (const s of [-1, 1]) { cyl(.05, .05, .7, M.metalBlack, s * rx * .5, .36, 0, g); cyl(.22, .24, .02, M.metalBlack, s * rx * .5, .01, 0, g); } }
    else { cyl(.05, .05, .7, M.metalBlack, 0, .36, 0, g); cyl(.3, .32, .02, M.metalBlack, 0, .01, 0, g); }
    tables[id] = { g, cx, cz, w: rx * 2, d: rz * 2, rot, kind: 'table', shape: 'round' };
  }
  function sofa(cx, cz, rot, L = 2.2, D = .9, mat = M.sofa, cushion = M.sofaCushion, pillows = mat === M.sofa) {
    const g = group(cx, cz, rot, world, 'sofa');
    rbox(L, .22, D, .04, mat, 0, .2, 0, g);
    for (let i = 0; i < 4; i++) { const f = mesh(new THREE.CylinderGeometry(.02, .015, .09, 8), M.oak, g); f.position.set((i % 2 ? 1 : -1) * (L / 2 - .08), .045, (i < 2 ? 1 : -1) * (D / 2 - .08)); }
    const n = L > 1.2 ? 3 : 1, cw = (L - .36) / n;
    for (let i = 0; i < n; i++) {
      rbox(cw - .02, .14, D - .26, .06, cushion, -L / 2 + .18 + cw * (i + .5), .37, .07, g);
      const b = rbox(cw - .02, .42, .2, .08, cushion, -L / 2 + .18 + cw * (i + .5), .6, -D / 2 + .16, g); b.rotation.x = -.15;
    }
    for (const s of [-1, 1]) rbox(.18, .38, D, .06, mat, s * (L / 2 - .09), .4, 0, g);
    rbox(.24, .66, .16, .04, mat, 0, .52, -D / 2 + .08, g).scale.set(L / .24 - .1, 1, 1);
    if (L > 1.2 && pillows) {
      const p1 = rbox(.42, .42, .12, .06, M.pillowA, -L / 2 + .45, .62, -D / 2 + .32, g); p1.rotation.set(-.25, .2, .1);
      const p2 = rbox(.4, .4, .12, .06, M.pillowB, L / 2 - .45, .62, -D / 2 + .32, g); p2.rotation.set(-.25, -.15, -.08);
    }
    return g;
  }
  function armchair(cx, cz, rot) {
    const g = group(cx, cz, rot, world, 'sofa');
    rbox(.78, .2, .78, .05, M.leather, 0, .26, .02, g);
    const b = rbox(.78, .5, .14, .06, M.leather, 0, .58, -.34, g); b.rotation.x = -.12;
    for (const s of [-1, 1]) rbox(.12, .3, .7, .05, M.leather, s * .39, .45, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = cyl(.018, .012, .18, M.oak, sx * .33, .08, sz * .3, g, 8); l.rotation.z = sx * .12; }
    return g;
  }
  function art(px, py, rot, w = .7, h = .9, i = 0, y = 1.55) {
    const g = group(X(px), Z(py), rot);
    box(w + .05, h + .05, .03, M.metalBlack, 0, y, 0, g);
    const p = mesh(new THREE.PlaneGeometry(w, h), artMats[i % artMats.length], g, false); p.position.set(0, y, .017);
  }
  function pendant(px, py, drop = 1.1) {
    const g = group(X(px), Z(py));
    const y = H - drop;
    cyl(.004, .004, drop, M.metalBlack, 0, H - drop / 2, 0, g, 6);
    const shade = mesh(new THREE.CylinderGeometry(.05, .22, .22, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: .4, metalness: .5, side: THREE.DoubleSide }), g);
    shade.position.y = y;
    const bulb = mesh(new THREE.SphereGeometry(.045, 16, 12), M.bulb, g, false); bulb.position.y = y - .08;
  }
  function floorLamp(px, py) {
    const g = group(X(px), Z(py), 0, world, 'prop');
    cyl(.15, .15, .02, M.plasticWhite, 0, .01, 0, g, 24);
    cyl(.012, .012, 1.75, M.plasticWhite, 0, .89, 0, g, 8);
    const bowl = mesh(new THREE.CylinderGeometry(.2, .05, .12, 32, 1, true), std({ color: 0xf6f3ec, emissive: 0xffd9a8, emissiveIntensity: .35, side: THREE.DoubleSide }), g); bowl.position.y = 1.8;
    const glow = mesh(new THREE.CircleGeometry(.18, 24), M.bulb, g, false); glow.rotation.x = -Math.PI / 2; glow.position.y = 1.83;
  }

  // --- Kitchen ("Other") -----------------------------------------------------
  {
    // Plan: base run with sink from the west wall to x=191, then a tall unit up to x=220.
    const z0 = Z(167) + .13, x0 = X(30) + .13, runEnd = X(191), tallEnd = X(220);
    const run = runEnd - x0;
    const g = group(0, 0, 0, world, 'counter');
    const n = 6, cw = run / n;
    box(run, .1, .55, M.baseboard, x0 + run / 2, .05, z0 + .3, g);
    for (let i = 0; i < n; i++) {
      const cx = x0 + cw * (i + .5);
      box(cw - .006, .76, .6, M.cabinet, cx, .48, z0 + .3, g);
      box(.012, .14, .02, M.chrome, cx + cw / 2 - .06, .78, z0 + .61, g);
    }
    box(run + .02, .04, .64, M.counter, x0 + run / 2, .88, z0 + .32, g);
    const sx = X(113);
    box(.56, .005, .42, M.steel, sx, .903, z0 + .33, g);
    box(.5, .006, .36, M.plastic, sx, .905, z0 + .33, g);
    cyl(.014, .018, .32, M.chrome, sx, 1.06, z0 + .1, g, 12);
    const spout = mesh(new THREE.TorusGeometry(.09, .012, 8, 20, Math.PI), M.chrome, g); spout.position.set(sx, 1.22, z0 + .19); spout.rotation.y = Math.PI / 2;
    const bs = mesh(new THREE.PlaneGeometry(run, .56), M.subway, g); bs.position.set(x0 + run / 2, 1.18, z0 + .005);
    for (let i = 0; i < n; i++) { const cx = x0 + cw * (i + .5); box(cw - .006, .72, .34, M.cabinetWhite, cx, 1.86, z0 + .17, g); box(cw - .1, .012, .02, M.chrome, cx, 1.53, z0 + .345, g); }
    const strip = mesh(new THREE.BoxGeometry(run - .1, .01, .03), M.panel, g, false); strip.position.set(x0 + run / 2, 1.49, z0 + .3);
    const fw = tallEnd - runEnd, fx = (runEnd + tallEnd) / 2;
    rbox(fw - .01, 1.9, .66, .02, M.steel, fx, .95, z0 + .34, g);
    box(.02, .6, .03, M.chrome, fx - fw / 2 + .08, 1.25, z0 + .68, g); box(.02, .4, .03, M.chrome, fx - fw / 2 + .08, .55, z0 + .68, g);
    box(fw - .03, .005, .01, M.plastic, fx, 1.0, z0 + .675, g);
    rbox(.24, .36, .34, .02, M.plastic, x0 + .4, 1.08, z0 + .25, g);
    cyl(.07, .08, .2, M.steel, x0 + .85, 1.0, z0 + .25, g, 20);
    const bowl = mesh(new THREE.SphereGeometry(.13, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.plasticWhite, g); bowl.position.set(X(160), 1.0, z0 + .35);
    for (let i = 0; i < 5; i++) { const f = mesh(new THREE.SphereGeometry(.04, 12, 8), std({ color: [0xe0a020, 0xc0392b, 0x7fb03a][i % 3], roughness: .5 }), g); f.position.set(X(160) + (R() - .5) * .12, .94, z0 + .35 + (R() - .5) * .12); }
  }
  // small square island, turned 45 degrees (plan 212-272 x 202-262), towel bar on its south-west face
  {
    const g = group(X(242), Z(232), -Math.PI / 4, world, 'counter');
    box(.72, .86, .72, M.cabinetWhite, 0, .43, 0, g);
    box(.78, .04, .78, M.counter, 0, .88, 0, g);
    box(.6, .02, .02, M.chrome, 0, .75, .4, g);
  }

  // --- Open area west / bar room --------------------------------------------------
  // Single desk turned 45 degrees with one chair on its south-west side (plan 305-395 x 150-237).
  {
    const t = rectTable('sq', X(350), Z(194), 1.23, .96, -Math.PI / 4, { top: M.deskWhite });
    makeMonitor(t.g, 0, -.22, 0, 0);
    const c = chairProto.clone(); c.position.set(.05, 0, .85); c.rotation.y = Math.PI + .2; t.g.add(c);
  }
  // Counter-height bar along the north wall of the bump (plan 237-335 x 113-130; scan: ~0.9 m high).
  {
    const x0 = X(237), x1 = X(335), zb = Z(110) + .13, d = .32, g = group(0, 0, 0, world, 'counter');
    box(x1 - x0, .86, d - .02, M.cabinetWhite, (x0 + x1) / 2, .43, zb + d / 2, g);
    box(x1 - x0 + .04, .04, d + .04, M.counter, (x0 + x1) / 2, .88, zb + d / 2 + .01, g);
    for (let i = 1; i < 4; i++) box(.006, .8, .01, M.plastic, x0 + (x1 - x0) * i / 4, .43, zb + d, g);
    rbox(.24, .36, .3, .02, M.plastic, x0 + .35, 1.08, zb + .16, g);
  }
  art(262, 119, 0, .55, .7, 0, 1.6); art(308, 119, 0, .55, .7, 1, 1.6);
  // Oval meeting table (plan: ~2.3 x 1.3 m, long axis ~40 degrees) with its five chairs and pendants.
  roundTable('oval', 204, 373, 1.15, .65, -.7, M.oak);
  for (const [x, y] of [[165, 332], [197, 320], [225, 350], [255, 380], [180, 395]]) seat('oval', x, y);
  pendant(173, 347); pendant(204, 373); pendant(235, 399);
  for (const [x, y, tx, ty] of [[315, 422, 204, 373], [272, 462, 204, 373], [480, 465, 560, 420]]) { const p = V(x, y), q = V(tx, ty); chair(p.x, p.y, Math.atan2(q.x - p.x, q.y - p.y)); }
  // small cabinet with a printer, against the bar room's outer wall
  {
    const g = group(X(418), Z(338), Math.PI / 2, world, 'furniture');
    box(.37, .72, .58, M.cabinetWhite, 0, .36, 0, g);
    rbox(.34, .22, .4, .02, std({ color: 0x9a9da1, roughness: .5 }), 0, .83, 0, g);
  }
  plant(55, 300, 1.0, 1);
  plant(378, 124, 1.2, 2);

  // --- Closed office (Living Room 1) ------------------------------------------------
  {
    const along = (a, b) => b.clone().sub(a).normalize();
    // two-person desk against the window wall, users facing the window
    const wa = V(257, 537), wb = V(362, 650), wd = along(wa, wb), wn = new THREE.Vector2(wd.y, -wd.x);
    const dc = wa.clone().addScaledVector(wd, 1.31).addScaledVector(wn, .13 + .02 + .325);
    const t = rectTable('lr1', dc.x, dc.y, 2.0, .65, Math.atan2(wn.x, wn.y), { top: M.deskWhite });
    for (const s of [-1, 1]) {
      makeLaptop(t.g, s * .5, -.05, 0);
      const c = chairProto.clone(); c.position.set(s * .5, 0, .72); c.rotation.y = Math.PI + s * .15; t.g.add(c);
    }
    // narrow console along the inner (north-west) wall, art above it
    const na = V(400, 404), nb = V(257, 537), nd = along(na, nb), nn = new THREE.Vector2(nd.y, -nd.x);
    const cc = na.clone().addScaledVector(nd, 1.5).addScaledVector(nn, .06 + .18);
    const con = rectTable('con', cc.x, cc.y, 1.2, .36, Math.atan2(nn.x, nn.y), { kind: 'cabinet', top: M.oak, h: .75 });
    const p = makePlant(.3, 3, 77); p.position.set(.4, .765, 0); con.g.add(p);
    const ap = na.clone().addScaledVector(nd, 1.5).addScaledVector(nn, .07);
    art(OX + ap.x / SX, OY + ap.y / SZ, Math.atan2(nn.x, nn.y), .9, .7, 1, 1.6);
    armchair(X(458), Z(505), -.81);
    plant(380, 636, 1.1, 1);
  }

  // --- Desk clusters, traced from the scan (metres) ----------------------------------
  // Each side of a cluster is two L desks whose short returns meet in the middle (a T);
  // two-sided clusters share a grey fabric privacy screen down the spine.
  const deskH = .74;
  const top = (x0, x1, z0, z1) => tagged(box(x1 - x0, .03, z1 - z0, M.deskWhite, (x0 + x1) / 2, deskH, (z0 + z1) / 2), 'desk', 'floor');
  const panelLeg = (x0, x1, z0, z1) => { box(x1 - x0, deskH - .015, z1 - z0, M.deskWhite, (x0 + x1) / 2, (deskH - .015) / 2, (z0 + z1) / 2).userData.col = false; };
  function pedestal(x, z, face) {
    const g = group(x, z, face); g.userData.col = false;
    box(.42, deskH - .03, .55, M.pedestal, 0, (deskH - .03) / 2, 0, g);
    for (const y of [.2, .48]) box(.26, .012, .015, M.chrome, 0, y, .283, g);
    box(.4, .006, .012, M.plastic, 0, .34, .278, g);
  }
  function privacyScreen(x0, x1, z0, z1, planter = false) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(x1 - x0, .035), d = Math.max(z1 - z0, .035);
    tagged(box(w, .36, d, M.screenFabric, cx, deskH + .195, cz), 'desk', 'floor');
    box(w + .01, .012, d + .01, M.steel, cx, deskH + .38, cz).userData.col = false;
    if (!planter) return;
    const alongZ = d > w, len = (alongZ ? d : w) * .55, y = deskH + .386;
    box(alongZ ? .16 : len, .1, alongZ ? len : .16, M.potDark, cx, y + .05, cz).userData.col = false;
    for (let t = -len / 2 + .2; t < len / 2 - .1; t += .4) {
      const p = makePlant(.34, 4, (t * 977 + cx * 31) | 0); p.position.set(alongZ ? cx : cx + t, y + .02, alongZ ? cz + t : cz); world.add(p);
    }
  }
  // A seat: monitor(s) on the desk at (x, z) facing `face` (radians, 0 = +Z), chair 0.85 m in front.
  function station(x, z, face, o = {}) {
    const fx = Math.sin(face), fz = Math.cos(face), px = fz, pz = -fx, side = o.side ?? 1;
    makeMonitor(world, x, z, face, R() * 3 | 0);
    if (o.dual ?? R() < .55) makeMonitor(world, x + px * .6 * side, z + pz * .6 * side, face - .45 * side, R() * 3 | 0, false);
    else if (R() < .5) makeLaptop(world, x + px * .55 * side, z + pz * .55 * side, face - .4 * side);
    if (o.chair !== false) chair(x + fx * (.85 + R() * .12), z + fz * (.85 + R() * .12), face + Math.PI + (R() - .5) * .5);
    if (R() < .6) makeMug(world, x - px * .45 * side + fx * .2, z - pz * .45 * side + fz * .2);
    if (o.plant ?? R() < .5) { const p = makePlant(.26, 3, (x * 100 + z * 7) | 0); p.position.set(x - px * .7 * side - fx * .1, deskH + .015, z - pz * .7 * side - fz * .1); world.add(p); }
    tagged(cyl(.13, .11, .3, M.bin, x - px * .3 * side + fx * .25, .15, z - pz * .3 * side + fz * .25, world, 16), 'prop');
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
    for (const s of [-1, 1]) box(.3, .42, .02, M.deskWhite, 10.56, deskH + .225, 4.6 + s * .38);
    box(.3, .02, .78, M.deskWhite, 10.56, deskH + .44, 4.6);
    for (let i = 0; i < 5; i++) cyl(.025, .025, .09, std({ color: [0x2b2b2b, 0xd9c19b, 0x6b3b2a, 0x334455, 0xeeeeee][i], roughness: .6 }), 10.56, deskH + .5, 4.32 + i * .13, world, 10);
    const sd = group(9.17, 4.72, Math.PI, world, 'desk');
    box(1.3, .03, .62, M.deskWhite, 0, .75, 0, sd);
    for (const s of [-1, 1]) { box(.07, .72, .07, M.metalBlack, s * .55, .36, 0, sd); box(.07, .03, .58, M.metalBlack, s * .55, .015, 0, sd); }
    makeLaptop(sd, 0, -.05, 0);
    const beanBag = (x, z, color, s) => {
      const geo = new THREE.SphereGeometry(.5, 24, 16), p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const sag = v.y > 0 ? 1 - .35 * Math.sin(Math.atan2(v.z, v.x) * 3 + 1) * v.y : 1;
        p.setXYZ(i, v.x * (1 + .08 * Math.sin(v.y * 9)), v.y * .6 * sag, v.z * (1 + .06 * Math.cos(v.x * 7)));
      }
      geo.computeVertexNormals();
      const m = tagged(mesh(geo, std({ color, roughness: .35 }), world), 'prop'); m.position.set(x, .27 * s, z); m.scale.setScalar(s); m.rotation.y = R() * 6;
    };
    beanBag(10.1, 1.8, 0x4b2a8a, 1.0); beanBag(9.0, 1.78, 0x5a5e63, 1.1);
    box(1.56, .006, .58, std({ color: 0x24305a, roughness: .9 }), 7.28, .006, 4.55);
    for (const [x, z] of [[8.1, 4.25], [8.25, 4.45], [8.0, 4.85]]) {
      const d = group(x, z, R() * 3, world, 'prop');
      for (const s of [-1, 1]) { const hx = mesh(new THREE.CylinderGeometry(.06, .06, .07, 6), M.plastic, d); hx.rotation.z = Math.PI / 2; hx.position.set(s * .1, .06, 0); }
      const bar = cyl(.014, .014, .14, M.chrome, 0, .06, 0, d, 8); bar.rotation.z = Math.PI / 2;
    }
  }

  // --- Office 1 ---------------------------------------------------------------
  roundTable('rt', 538, 628, .5, .5);
  seat('rt', 560, 655); seat('rt', 572, 612);
  // TV on a black-legged standing desk under the window, ottoman in front
  {
    const g = group(2.8, 4.72, Math.PI, world, 'furniture');
    box(1.6, .03, .7, M.deskWhite, 0, .76, 0, g);
    for (const s of [-1, 1]) { box(.07, .74, .07, M.metalBlack, s * .68, .37, 0, g); box(.07, .03, .64, M.metalBlack, s * .68, .015, 0, g); }
    for (const s of [-1, 1]) box(.04, .1, .25, M.plastic, s * .5, .82, 0, g);
    rbox(1.45, .84, .05, .01, M.plastic, 0, 1.31, 0, g);
    const s = mesh(new THREE.PlaneGeometry(1.41, .8), screenMats[1], g, false); s.position.set(0, 1.31, .027);
    const o = group(2.75, 2.9, 0, world, 'furniture');
    rbox(.8, .36, .78, .06, M.ottoman, 0, .26, 0, o);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(.025, .02, .08, M.plastic, sx * .33, .04, sz * .32, o, 8);
    box(.16, .015, .04, M.plastic, .1, .45, -.1, o);
  }
  floorLamp(752, 400);
  { // green recycling bin by the office 2 door
    const g = group(X(565), Z(306), 0, world, 'prop');
    box(.46, .95, .46, M.greenBin, 0, .475, 0, g);
    box(.3, .3, .005, M.plasticWhite, 0, .62, .233, g);
  }
  plant(520, 655, 1.0, 0); plant(600, 646, 1.1, 2); plant(1000, 646, 1.0, 0); plant(1115, 640, 1.2, 1); plant(690, 646, .9, 1);
  art(1250 - 7.5, 520, -Math.PI / 2, .9, 1.1, 2);

  // --- Office 2 + games lounge ------------------------------------------------------
  sofa(4.09, -2.155, Math.PI / 2, 2.59, .88, M.sofaGrey, M.sofaGreyCushion);
  // structural pillar behind the sofa (scan: 0.44 x 0.31 m) and a thin column
  tagged(box(.44, H, .31, M.pillar, 3.27, H / 2, -1.49), 'pillar');
  box(.46, .09, .33, M.baseboard, 3.27, .045, -1.49).userData.col = false;
  tagged(cyl(.06, .06, H, M.pillar, 3.35, H / 2, -2.75, world, 16), 'pillar');
  // ping-pong table: two bamboo tables pushed together with a clamp-on net (scan: 1.27 x 2.78 m)
  {
    const g = group(6.135, -1.9, 0, world, 'table');
    for (const s of [-1, 1]) {
      rbox(1.27, .025, 1.37, .01, M.bamboo, 0, .76, s * .695, g);
      for (const lx of [-.56, .56]) for (const lz of [.08, 1.3]) cyl(.022, .02, .75, M.steel, lx, .375, s * lz, g, 10);
    }
    for (const s of [-1, 1]) box(.03, .17, .05, M.plasticWhite, s * .65, .85, 0, g);
    const net = mesh(new THREE.PlaneGeometry(1.3, .13), std({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide, roughness: .9 }), g, false);
    net.position.set(0, .84, 0);
    box(1.3, .012, .012, M.plasticWhite, 0, .91, 0, g);
    for (const [x, z, r] of [[.3, .7, .4], [-.35, -.8, 2.5]]) {
      const pd = group(x, z, r, g);
      cyl(.075, .075, .012, std({ color: 0xc8202a, roughness: .6 }), 0, .78, 0, pd, 24);
      box(.03, .012, .1, M.oak, 0, .78, .11, pd);
    }
    const ball = mesh(new THREE.SphereGeometry(.02, 12, 8), M.plasticWhite, g); ball.position.set(-.2, .79, .3);
  }
  { // zig-zag LED strip on the ceiling over the table
    const pts = [[905, 222], [955, 268], [1010, 238], [1060, 290], [1105, 262]].map(([x, y]) => V(x, y));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a);
      const s = mesh(new THREE.BoxGeometry(d.length(), .008, .014), M.panel, ceilingGroup, false, false);
      s.position.set((a.x + b.x) / 2, H - .006, (a.y + b.y) / 2); s.rotation.y = -Math.atan2(d.y, d.x);
    }
  }
  // east wall: grey loveseat, office chair, archery target leaning on the wall
  sofa(8.15, -1.6, -Math.PI / 2, 1.15, .8, M.sofaGrey, M.sofaGreyCushion);
  chair(8.3, -.5, -Math.PI / 2 - .4);
  {
    const g = group(X(1132) - .2, .35, -Math.PI / 2, world, 'prop');
    const tgt = new THREE.Group(); tgt.rotation.x = -.18; tgt.position.y = .55; g.add(tgt);
    box(.75, 1.05, .14, std({ color: 0x1c1c1c, roughness: .8 }), 0, 0, 0, tgt);
    const face = canvasTexture(256, 256, (c, w) => {
      c.fillStyle = '#d32020'; c.fillRect(0, 0, w, w);
      [['#ffffff', 112], ['#111111', 92], ['#2a6fd6', 72], ['#d32020', 52], ['#f5d000', 30]].forEach(([col, r]) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2 + 16, r, 0, 7); c.fill(); });
    });
    const f = mesh(new THREE.PlaneGeometry(.66, .66), std({ map: face, roughness: .7 }), tgt, false); f.position.set(0, -.1, .071);
  }
  plant(1238, 100, 1.3, 2); plant(830, 112, 1.1, 1); plant(1110, 165, 1.0, 0); plant(622, 108, 1.1, 1);
  { // whiteboard on the partition, facing west
    const g = group(X(640) - .07, Z(190), -Math.PI / 2);
    box(1.9, 1.1, .02, M.steel, 0, 1.45, 0, g);
    const p = mesh(new THREE.PlaneGeometry(1.85, 1.05), M.whiteboard, g, false); p.position.set(0, 1.45, .012);
    box(1.6, .03, .06, M.steel, 0, .9, .03, g);
  }
  for (const x of [1012, 1034]) { const p = mesh(new THREE.PlaneGeometry(.22, .28), M.plasticWhite, world, false); p.position.set(X(x), 1.65, Z(88) + .135); }

  // --- Closet shelving -------------------------------------------------------------
  {
    const g = group(X(1192), Z(450) - .28, 0, world, 'furniture');
    for (let k = 0; k < 4; k++) box((1245 - 1140) * S, .025, .4, M.cabinetWhite, 0, .4 + k * .45, 0, g);
    for (const s of [-1, 1]) box(.03, 1.8, .4, M.cabinetWhite, s * (1245 - 1140) * S / 2, .9, 0, g);
    for (let k = 0; k < 6; k++) box(.3, .25, .3, std({ color: [0xb08a5b, 0xa77e4f, 0xc2a070][k % 3], roughness: .9 }), X(1160 + k * 14) - X(1192), .4 + (k % 3) * .45 + .14, 0, g);
  }

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
  for (const c of panels) {
    const p = mesh(new THREE.BoxGeometry(.58, .02, 1.18), M.panel, ceilingGroup, false, false); p.position.set(c.x, H - .01, c.y);
    const fr = mesh(new THREE.BoxGeometry(.62, .015, 1.22), M.plasticWhite, ceilingGroup, false, false); fr.position.set(c.x, H - .004, c.y);
  }
  {
    const diffTex = canvasTexture(128, 128, (g, w) => {
      g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#9a9c9e'; g.lineWidth = 3;
      for (let i = 1; i < 5; i++) g.strokeRect(i * 12, i * 12, w - i * 24, w - i * 24);
      g.fillStyle = '#4a4c4e'; g.fillRect(w / 2 - 7, w / 2 - 7, 14, 14);
    });
    const diffM = std({ map: diffTex, roughness: .6 });
    for (const c of panels) {
      const p = new THREE.Vector2(c.x + 1.2, c.y + .3);
      if (!inside(p) || INTERIOR.some(([a, b]) => segDist(p, a, b) < .5)) continue;
      const d = mesh(new THREE.BoxGeometry(.58, .015, .58), diffM, ceilingGroup, false, false); d.position.set(p.x, H - .008, p.y);
    }
    const head = new THREE.Group();
    cyl(.02, .02, .03, M.chrome, 0, H - .015, 0, head, 10);
    cyl(.035, .035, .006, M.chrome, 0, H - .036, 0, head, 12);
    for (let x = -10; x < 11; x += 3) for (let z = -4.5; z < 5; z += 3) {
      const p = new THREE.Vector2(x + .3, z + .6);
      if (!inside(p)) continue;
      const s = head.clone(); s.position.set(p.x, 0, p.y); ceilingGroup.add(s);
    }
  }
  {
    const g = group(X(1132) - .16, Z(219), -Math.PI / 2);
    const t = canvasTexture(128, 48, (c, w, h) => { c.fillStyle = '#0f8a3c'; c.fillRect(0, 0, w, h); c.fillStyle = '#eaffef'; c.font = 'bold 28px sans-serif'; c.textAlign = 'center'; c.fillText('EXIT', w / 2, 34); });
    box(.34, .14, .04, M.plasticWhite, 0, 2.3, 0, g);
    const f = mesh(new THREE.PlaneGeometry(.3, .11), std({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 2.2 }), g, false); f.position.set(0, 2.3, .021);
  }

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
    // Lumpy canopy: subdivided sphere pushed around by layered sines, with per-vertex tint.
    const canopy = (r, seed) => {
      const geo = new THREE.IcosahedronGeometry(r, 2), p = geo.attributes.position, col = [], v = new THREE.Vector3();
      const k = rng(seed), a = k() * 10, b = k() * 10;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        const d = 1 + .16 * Math.sin(v.x * 5 + a) * Math.sin(v.y * 6 + b) + .08 * Math.sin(v.z * 13 + v.x * 9) + .05 * Math.sin(v.y * 21 + a);
        p.setXYZ(i, v.x * r * d, v.y * r * d * .85, v.z * r * d);
        const shade = .55 + .45 * (v.y * .5 + .5) * (d - .8);
        col.push(.27 * shade, .45 * shade, .17 * shade);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
    };
    const leafMat = std({ vertexColors: true, roughness: .8 });
    for (const [x, z] of spots) {
      const g = group(x, z, 0, outside), h = 3.5 + tr() * 2.5;
      g.position.y = GROUND;
      cyl(.12, .18, h + .6, M.bark, 0, (h + .6) / 2, 0, g, 10);
      for (let k = 0; k < 3; k++) {
        const f = mesh(canopy(1.6 + tr() * .9, x * 7 + z * 3 + k), leafMat, g);
        f.position.set((tr() - .5) * 1.6, h + .8 + k * .7 + tr() * .5, (tr() - .5) * 1.6);
      }
    }

    // Neighbourhood across the streets: red-brick apartment blocks with balconies, beige low-rises and
    // glass office buildings with green awnings. One texture tile = 3 m bay x 3 m floor.
    const facade = (draw) => tiled(canvasTexture(128, 128, (c, w, h) => { c.scale(.5, .5); draw(c, 256, 256); }), 1 / 3);
    function window_(c, x, y, w, h) {
      c.fillStyle = '#f2efe8'; c.fillRect(x - 7, y - 7, w + 14, h + 14);
      const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#9fb4c2'); g.addColorStop(.5, '#4b6170'); g.addColorStop(1, '#2a3640');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = '#f2efe8'; c.fillRect(x + w / 2 - 3, y, 6, h); c.fillRect(x, y + h * .35, w, 5);
    }
    const brick = (base) => (c, w, h) => {
      const r = rng(base.length);
      c.fillStyle = '#b8a99b'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) for (let x = -(y / 8 % 2) * 12; x < w; x += 24) {
        const k = (r() - .5) * 30; c.fillStyle = `rgb(${base[0] + k},${base[1] + k * .6},${base[2] + k * .5})`; c.fillRect(x + 1, y + 1, 22, 6);
      }
      window_(c, 52, 48, 152, 150);
    };
    const STYLES = {
      brick: { mat: std({ map: facade(brick([128, 62, 44])), roughness: .9 }), balconies: true },
      brick2: { mat: std({ map: facade(brick([150, 82, 58])), roughness: .9 }), balconies: true },
      beige: { mat: std({ map: facade((c, w, h) => { c.fillStyle = '#d9ccb4'; c.fillRect(0, 0, w, h); const r = rng(5); for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(90,70,40,${r() * .06})`; c.fillRect(r() * w, r() * h, 3, 3); } window_(c, 40, 60, 176, 130); }), roughness: .95 }) },
      office: { mat: std({ map: facade((c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#8fa3ae'); g.addColorStop(1, '#3b4a53');
        c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#5f676c'; c.fillRect(0, 0, w, 56);
        c.fillStyle = '#2b3034'; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 6, h);
      }), roughness: .35, metalness: .3 }), awnings: true },
    };
    const roofMat = std({ color: 0x55585c, roughness: .9 }), railMat = std({ color: 0x2c2f33, roughness: .5, metalness: .5 });
    const slabMat = std({ color: 0xcfcac2, roughness: .9 }), awningMat = std({ color: 0x2f6b47, roughness: .7 });
    // front: direction the street-facing side looks at ('n','s','e','w')
    function building(x0, x1, z0, z1, floors, style, front) {
      const s = STYLES[style], w = x1 - x0, d = z1 - z0, h = floors * 3, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const body = mesh(worldUV(new THREE.BoxGeometry(w, h, d), w, h, d), s.mat, outside, false, true); body.position.set(cx, GROUND + h / 2, cz);
      box(w + .3, .4, d + .3, roofMat, cx, GROUND + h + .2, cz, outside);
      box(w * .2, 1.2, d * .2, roofMat, cx + w * .15, GROUND + h + .9, cz - d * .1, outside);
      const along = front === 'n' || front === 's' ? w : d, n = Math.floor(along / 3);
      const out = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[front];
      const faceX = cx + out[0] * w / 2, faceZ = cz + out[1] * d / 2;
      for (let i = 0; i < n; i++) {
        const t = -along / 2 + (i + .5) * (along / n);
        const px = out[0] ? faceX : cx + t, pz = out[0] ? cz + t : faceZ;
        if (s.awnings) { const a = box(out[0] ? .9 : 2.6, .08, out[0] ? 2.6 : .9, awningMat, px + out[0] * .45, GROUND + 3.1, pz + out[1] * .45, outside); a.rotation[out[0] ? 'z' : 'x'] = (out[0] || out[1]) * -.25; }
        if (!s.balconies || i % 2) continue;
        for (let f = 1; f < floors; f++) {
          const y = GROUND + f * 3;
          box(out[0] ? .9 : 2.2, .12, out[0] ? 2.2 : .9, slabMat, px + out[0] * .45, y, pz + out[1] * .45, outside);
          box(out[0] ? .04 : 2.2, .9, out[0] ? 2.2 : .04, railMat, px + out[0] * .88, y + .5, pz + out[1] * .88, outside);
        }
      }
    }
    [[-62, -42, 14, 5, 'brick'], [-38, -26, 15, 6, 'brick2'], [-14, 6, 14, 5, 'brick'], [10, 16, 12, 3, 'beige'],
     [27, 46, 14, 4, 'office'], [50, 70, 13, 6, 'brick2']].forEach(([a, b, d, f, st]) => building(a, b, 22.4, 22.4 + d, f, st, 'n'));
    [[-44, -24, 14, 4, 'beige'], [-20, -3, 16, 5, 'office'], [1, 11, 12, 3, 'brick']].forEach(([a, b, d, f, st]) => building(-29.4 - d, -29.4, a, b, f, st, 'e'));
    [[-30, -12, 14, 4, 'brick'], [-8, 10, 14, 5, 'beige']].forEach(([a, b, d, f, st]) => building(26.4, 26.4 + d, a, b, f, st, 'w'));
    [[-17, -1, 12, 4, 'office'], [3, 17, 12, 3, 'brick2']].forEach(([a, b, d, f, st]) => building(a, b, -16 - d, -16, f, st, 's'));
    // distant skyline
    const sr = rng(91);
    const windowsTexture = (seed) => canvasTexture(128, 256, (g, w, h) => {
      const r = rng(seed);
      g.fillStyle = '#9aa1a8'; g.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 13) for (let x = 4; x < w; x += 11) {
        const lit = r() < .25;
        g.fillStyle = lit ? `rgb(${200 + r() * 40},${170 + r() * 40},${120 + r() * 30})` : `rgb(${40 + r() * 20},${55 + r() * 20},${70 + r() * 20})`;
        g.fillRect(x, y, 7, 9);
      }
    });
    const winTex = [1, 2, 3].map(windowsTexture);
    for (let i = 0; i < 30; i++) {
      const a = sr() * Math.PI * 2, r = 110 + sr() * 120, w = 10 + sr() * 18, d = 10 + sr() * 18, h = 8 + sr() * 45;
      const t = tiled(winTex[i % 3]?.clone() ?? null, w / 12, h / 22); if (t) t.needsUpdate = true;
      const m = mesh(new THREE.BoxGeometry(w, h, d), std({ map: t, roughness: .6, metalness: .2 }), outside, false, false);
      m.position.set(Math.cos(a) * r, GROUND + h / 2, Math.sin(a) * r); m.rotation.y = sr() * Math.PI;
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
  const sky = new Sky(); sky.scale.setScalar(800); root.add(sky);
  const sun = new THREE.DirectionalLight(0xffe8c8, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 90 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .03;
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xf2f4f7, 0x8b8378, 1); root.add(hemi);
  // Cheap stand-in for the ceiling panels: soft top-down light, no shadows.
  const ceilingFill = new THREE.DirectionalLight(0xfff4e8, .9); ceilingFill.position.set(.5, 10, .8); root.add(ceilingFill);
  function setTime(i) {
    const t = TIMES[i];
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - t.elev), THREE.MathUtils.degToRad(t.azim));
    const u = sky.material.uniforms;
    u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = .005; u.mieDirectionalG.value = .82; u.sunPosition.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(40); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld();
    sun.color.set(t.color); sun.intensity = t.sun; hemi.intensity = t.hemi;
    renderer.shadowMap.needsUpdate = true;
  }

  // What the reflections lit, as one flat light: the same average brightness from the spawns.
  root.add(new THREE.AmbientLight(0xffffff, AMBIENT_FOR_REFLECTIONS));
  M.glass.envMap = reflections;
  M.glass.envMapIntensity = 1.6;

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
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast, recv: o.receiveShadow, order: o.renderOrder, geos: [] });
      buckets.get(key).geos.push(g);
    });
    for (const c of [...group.children]) group.remove(c);
    for (const b of buckets.values()) {
      const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
      m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order; group.add(m);
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
