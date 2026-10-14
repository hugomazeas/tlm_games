"""Matches aerial screenshots (Google Earth's 3D view and the like) against the racing map, to model a place from them.

Needs python3 with numpy, pillow and scipy. Screenshots go in maps/<map>/aerial/ (ignored by git: the imagery
isn't ours to commit); each gets a camera, fitted once, saved next to it as <image>.camera.json.

    aerial.py fit IMAGE                fit the camera to IMAGE.points.json: pixel ↔ world pairs (see `fit`)
    aerial.py overlay IMAGE OUT        draw the map's roads and buildings over the screenshot through its camera
    aerial.py crop IMAGE OUT BOX       zoom on part of a screenshot with a pixel grid, to read positions
    aerial.py ground IMAGE U,V …       latitude/longitude on the ground under pixels
    aerial.py view IMAGE               the viewer link (#lat,lon,altitude,heading,pitch,fov) that sees what the camera saw
    aerial.py building ID OUT          the best view of a building in the screenshots, its footprint outlined
    aerial.py heights ID               the lidar heights over a building, in metres, north up
    aerial.py facade-heights FROM TO   the lidar heights in a façade's frame (along it, out of it), for landmark parts
    aerial.py looks OUT BOX IMAGE …    sample buildings' roof and wall colours from screenshots
    aerial.py merge-looks SAMPLED      add well-sampled colours to maps/<map>/looks.json (what's there wins)
    aerial.py compare IMAGE RENDER OUT the screenshot over a render of the same view (shot.mjs makes renders)

BOX is lat0,lon0,lat1,lon1 for `looks`, and x0,y0,x1,y1 in pixels for `crop`. --map picks the map (quebec-plains).
"""
import argparse
import colorsys
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

GAME = Path(__file__).resolve().parents[2]
M_LAT = 111_320


class Map:
    """map.json and the snapshot's lidar grid, in map metres: x east, z south, y up."""

    def __init__(self, slug):
        self.dir = GAME / 'maps' / slug
        self.data = json.load(open(self.dir / 'map.json'))
        self.origin = self.data['origin']
        self.m_lon = M_LAT * math.cos(math.radians(self.origin['lat']))
        self.terrain = self.data['terrain']
        self.width, self.depth = self.data['width'], self.data['depth']
        self.buildings = {b['id']: b for b in self.data['buildings']}
        self._lidar = None

    def project(self, lat, lon):
        return ((lon - self.origin['lon']) * self.m_lon, -(lat - self.origin['lat']) * M_LAT)

    def unproject(self, x, z):
        return (self.origin['lat'] - z / M_LAT, self.origin['lon'] + x / self.m_lon)

    def ground(self, x, z):
        """Exactly as convert.ts's heightAt: two triangles a cell, split south-west to north-east."""
        t = self.terrain
        cols, rows, cell, h = t['cols'], t['rows'], t['cell'], t['heights']
        gx = min(max((x + self.width / 2) / cell, 0), cols - 1)
        gz = min(max((z + self.depth / 2) / cell, 0), rows - 1)
        x0 = min(int(math.floor(gx)), cols - 2)
        z0 = min(int(math.floor(gz)), rows - 2)
        tx, tz = gx - x0, gz - z0
        at = lambda c, r: h[r * cols + c]  # noqa: E731
        nw, ne, sw, se = at(x0, z0), at(x0 + 1, z0), at(x0, z0 + 1), at(x0 + 1, z0 + 1)
        if tx + tz <= 1:
            return nw + (ne - nw) * tx + (sw - nw) * tz
        return se + (sw - se) * (1 - tx) + (ne - se) * (1 - tz)

    def lidar(self, x, z):
        """The survey's height above the ground at a map point (lidar.ts's encoding), or None."""
        if self._lidar is None:
            raw = gzip.open(self.dir / 'snapshot' / 'lidar.bin.gz').read()
            cols, rows = np.frombuffer(raw[:8], '<u4')
            cell = float(np.frombuffer(raw[8:12], '<f4')[0])
            self._lidar = (int(cols), int(rows), cell, np.frombuffer(raw[12:], np.uint8).reshape(int(rows), int(cols)))
        cols, rows, cell, grid = self._lidar
        col = int(math.floor((x + self.width / 2) / cell))
        row = int(math.floor((z + self.depth / 2) / cell))
        if not (0 <= col < cols and 0 <= row < rows) or grid[row, col] == 255:
            return None
        v = int(grid[row, col])
        return v / 2 if v <= 200 else 100 + (v - 200)

    def building_key(self, b):
        return f"{'relation' if b.get('relation') else 'way'}/{b['id']}"


def centroid(flat):
    xs, zs = flat[0::2], flat[1::2]
    return sum(xs) / len(xs), sum(zs) / len(zs)


# ── Cameras ────────────────────────────────────────────────────────────────────────────────────


class Camera:
    """A Three.js-style camera: x, y, z, yaw°, pitch°, roll° (Euler YXZ; yaw 0 looks north, 90 west), focal length in pixels."""

    def __init__(self, params, size):
        self.p = np.array(list(params)[:7], dtype=float)
        self.w, self.h = size

    def rotation(self):
        _, _, _, yaw, pitch, roll, _ = self.p
        cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        cr, sr = math.cos(math.radians(roll)), math.sin(math.radians(roll))
        ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
        rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
        return ry @ rx @ rz

    def project(self, points):
        """Pixels (u, v) and depths of world points; the camera looks down its −z."""
        cam = (np.asarray(points, dtype=float) - self.p[:3]) @ self.rotation()
        depth = -cam[:, 2]
        f = self.p[6]
        return np.stack([self.w / 2 + f * cam[:, 0] / depth, self.h / 2 - f * cam[:, 1] / depth], axis=1), depth

    def to_ground(self, the_map, u, v):
        f = self.p[6]
        d = self.rotation() @ np.array([(u - self.w / 2) / f, -(v - self.h / 2) / f, -1.0])
        d /= np.linalg.norm(d)
        lo, hi = 0.0, 20000.0
        for _ in range(80):
            mid = (lo + hi) / 2
            p = self.p[:3] + d * mid
            if p[1] > the_map.ground(p[0], p[2]):
                lo = mid
            else:
                hi = mid
        return self.p[:3] + d * lo


def camera_for(image):
    path = Path(str(image) + '.camera.json')
    if not path.exists():
        sys.exit(f'{image} has no camera yet: write {image}.points.json and run `aerial.py fit {image}`')
    return Camera(json.load(open(path)), Image.open(image).size)


def world_point(the_map, spec):
    """A world point from a points-file entry: {latlon:[lat,lon]} on the ground (+lift), {xyz}, or a building's roof centre."""
    if 'xyz' in spec:
        return np.array(spec['xyz'], dtype=float)
    if 'latlon' in spec:
        x, z = the_map.project(*spec['latlon'])
        return np.array([x, the_map.ground(x, z) + spec.get('lift', 0), z])
    if 'building' in spec:
        b = the_map.buildings[spec['building']]
        x, z = centroid(b['outline'])
        return np.array([x, b['top'], z])
    raise ValueError(spec)


def fit(the_map, image):
    """
    IMAGE.points.json: {"init": [x, y, z, yaw, pitch, roll, f], "points": [{"name", "px": [u, v], …world…, "w"?}, …]}.
    Good points are spread over the picture and over heights: street intersections on the ground
    ({"latlon": […]}), the tops of tall towers ({"building": id}, its roof's centre, or {"xyz": […]}).
    Six or more; a rough "init" (where the camera roughly is, which way it looks) helps.
    """
    from scipy.optimize import least_squares

    spec = json.load(open(str(image) + '.points.json'))
    size = Image.open(image).size
    px = np.array([p['px'] for p in spec['points']], dtype=float)
    xyz = np.array([world_point(the_map, p) for p in spec['points']])
    weights = np.array([p.get('w', 1.0) for p in spec['points']])

    def residuals(v):
        uv, depth = Camera(v, size).project(xyz)
        r = (uv - px) * weights[:, None]
        r[depth <= 0] = 1e4
        return r.ravel()

    result = least_squares(residuals, np.array(spec['init'], dtype=float), loss='soft_l1', f_scale=8, max_nfev=20000)
    cam = Camera(result.x, size)
    uv, _ = cam.project(xyz)
    for p, r in zip(spec['points'], uv - px):
        print(f"  {p.get('name', ''):30s} {p['px']}  off by {r[0]:6.1f} {r[1]:6.1f} px")
    json.dump([float(v) for v in result.x], open(str(image) + '.camera.json', 'w'))
    x, y, z = result.x[:3]
    print('camera', [round(float(v), 2) for v in result.x], 'altitude', round(y - the_map.ground(x, z)),
          'horizontal fov', round(math.degrees(2 * math.atan(size[0] / 2 / result.x[6])), 1))


# ── Pictures ───────────────────────────────────────────────────────────────────────────────────


def grid_crop(img, box, zoom, grid):
    x0, y0, x1, y1 = box
    out = img.crop(box).resize((int((x1 - x0) * zoom), int((y1 - y0) * zoom)), Image.LANCZOS)
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    for gx in range((x0 // grid + 1) * grid, x1, grid):
        d.line([((gx - x0) * zoom, 0), ((gx - x0) * zoom, out.height)], fill=(255, 0, 255))
        d.text(((gx - x0) * zoom + 2, 2), str(gx), fill=(255, 255, 0), font=font)
    for gy in range((y0 // grid + 1) * grid, y1, grid):
        d.line([(0, (gy - y0) * zoom), (out.width, (gy - y0) * zoom)], fill=(255, 0, 255))
        d.text((2, (gy - y0) * zoom + 2), str(gy), fill=(255, 255, 0), font=font)
    return out


def overlay(the_map, image, out, roads=True, roofs=True, ids=False, box=None, zoom=1.0):
    img = Image.open(image).convert('RGB')
    cam = camera_for(image)
    x0, y0, x1, y1 = box or (0, 0, *img.size)
    img = img.crop((x0, y0, x1, y1))
    img = img.resize((int(img.width * zoom), int(img.height * zoom)), Image.LANCZOS)
    img = Image.blend(img, Image.new('RGB', img.size), 0.2)
    d = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    def line(points, colour, width=1, close=True):
        uv, depth = cam.project(points)
        if (depth <= 0).any():
            return
        pts = [((u - x0) * zoom, (v - y0) * zoom) for u, v in uv]
        d.line(pts + pts[:1] if close else pts, fill=colour, width=width)

    if roads:
        colours = {'major': (255, 80, 80), 'street': (255, 160, 60), 'service': (220, 200, 80), 'path': (200, 150, 255), 'sidewalk': (150, 120, 200)}
        for r in the_map.data['roads']:
            f = r['points']
            line([[f[i], the_map.ground(f[i], f[i + 1]) + 0.3, f[i + 1]] for i in range(0, len(f), 2)], colours[r['kind']], close=False)
    for b in the_map.data['buildings']:
        f = b['outline']
        cx, cz = centroid(f)
        uv, depth = cam.project(np.array([[cx, b['top'], cz]]))
        if depth[0] <= 0 or not (x0 - 200 <= uv[0][0] <= x1 + 200 and y0 - 200 <= uv[0][1] <= y1 + 200):
            continue
        if roofs:
            line([[f[i], b['top'], f[i + 1]] for i in range(0, len(f), 2)], (255, 120, 255) if b.get('landmark') else (255, 255, 0))
        if ids:
            d.text(((uv[0][0] - x0) * zoom - 12, (uv[0][1] - y0) * zoom - 5), str(b['id']), fill=(0, 255, 255), font=font)
    img.save(out)


def view_link(the_map, image):
    cam = camera_for(image)
    x, y, z, yaw, pitch, _, f = cam.p
    lat, lon = the_map.unproject(x, z)
    fov = math.degrees(2 * math.atan(cam.h / 2 / f))
    return f'{lat:.6f},{lon:.6f},{y - the_map.ground(x, z):.0f},{yaw:.2f},{pitch:.2f},{fov:.2f}'


def building_view(the_map, images, building_id, out, pad=40):
    b = the_map.buildings[building_id]
    f = b['outline']
    best = None
    for image in images:
        img = Image.open(image).convert('RGB')
        cam = camera_for(image)
        base = np.array([[f[k], the_map.ground(f[k], f[k + 1]), f[k + 1]] for k in range(0, len(f), 2)])
        top = base.copy()
        top[:, 1] = b['top']
        uv_b, d1 = cam.project(base)
        uv_t, _ = cam.project(top)
        if (d1 <= 0).any():
            continue
        (x0, y0), (x1, y1) = np.vstack([uv_b, uv_t]).min(axis=0), np.vstack([uv_b, uv_t]).max(axis=0)
        seen = max(0, min(x1, img.width) - max(x0, 0)) * max(0, min(y1, img.height) - max(y0, 0))
        if seen and (best is None or seen > best[0]):
            best = (seen, img, uv_b, uv_t, (x0, y0, x1, y1))
    if not best:
        sys.exit('not in any screenshot')
    _, img, uv_b, uv_t, (x0, y0, x1, y1) = best
    box = (int(max(0, x0 - pad)), int(max(0, y0 - pad)), int(min(img.width, x1 + pad)), int(min(img.height, y1 + pad)))
    crop = img.crop(box)
    zoom = max(1, min(4, 700 / max(crop.width, crop.height)))
    crop = crop.resize((int(crop.width * zoom), int(crop.height * zoom)), Image.LANCZOS)
    d = ImageDraw.Draw(crop)
    for uv, colour in ((uv_b, (0, 200, 255)), (uv_t, (255, 255, 0))):
        pts = [((u - box[0]) * zoom, (v - box[1]) * zoom) for u, v in uv]
        d.line(pts + pts[:1], fill=colour)
    crop.save(out)


# ── Heights ────────────────────────────────────────────────────────────────────────────────────


def print_heights(rows, label_row, label_col):
    print('      ' + ' '.join('%4d' % c for c in label_col))
    for r, row in zip(label_row, rows):
        print('%5d ' % r + ' '.join('   .' if v is None else '%4d' % round(v) for v in row))


def building_heights(the_map, building_id, step=2.0, pad=6.0):
    b = the_map.buildings[building_id]
    xs, zs = b['outline'][0::2], b['outline'][1::2]
    cols = np.arange(min(xs) - pad, max(xs) + pad, step)
    rows = np.arange(min(zs) - pad, max(zs) + pad, step)
    print(f"{b.get('name') or building_id}: lidar heights above the ground, {step} m cells, north up")
    print_heights([[the_map.lidar(x, z) for x in cols] for z in rows], [round(z) for z in rows], [round(x) for x in cols])


def facade_heights(the_map, a, b, step=3.0, out_range=(-60.0, 4.0)):
    """Heights in a landmark's façade frame: `along` from the façade's middle towards TO, `out` positive in front."""
    ax, az = the_map.project(*a)
    bx, bz = the_map.project(*b)
    length = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / length, (bz - az) / length
    cx, cz = (ax + bx) / 2, (az + bz) / 2
    # Out is whichever side the lidar says is open ground.
    nx, nz = -uz, ux
    ahead = [the_map.lidar(cx + nx * d, cz + nz * d) or 0 for d in (5, 10, 15)]
    behind = [the_map.lidar(cx - nx * d, cz - nz * d) or 0 for d in (5, 10, 15)]
    if sum(ahead) > sum(behind):
        nx, nz = -nx, -nz
    alongs = np.arange(-length / 2 - 10, length / 2 + 10, step)
    outs = np.arange(out_range[1], out_range[0], -step)
    print(f'façade {length:.1f} m; rows: out, columns: along')
    print_heights([[the_map.lidar(cx + ux * a_ + nx * o, cz + uz * a_ + nz * o) for a_ in alongs] for o in outs],
                  [round(o) for o in outs], [round(a_) for a_ in alongs])


# ── Colours ────────────────────────────────────────────────────────────────────────────────────


def is_foliage(rgb):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    return 0.17 < h < 0.45 and s > 0.18 and v > 0.12


def sample_looks(the_map, images, box, out):
    """
    Draws an id buffer per screenshot (every roof and camera-facing wall, far to near) and takes, for each
    building, its roof's and its walls' pixels: the roof's median colour without foliage (unless a taller
    roof is mostly green: a roof garden), the walls' median over their brighter half (windows and shade are
    darker than the wall).
    """
    lat0, lon0, lat1, lon1 = box
    bx0, bz0 = the_map.project(max(lat0, lat1), min(lon0, lon1))
    bx1, bz1 = the_map.project(min(lat0, lat1), max(lon0, lon1))
    buildings = the_map.data['buildings']
    samples = {}
    for image in images:
        img = Image.open(image).convert('RGB')
        pixels = np.asarray(img).reshape(-1, 3)
        cam = camera_for(image)
        eye = cam.p[:3]
        faces = []
        for bi, b in enumerate(buildings):
            f = b['outline']
            cx, cz = centroid(f)
            if math.hypot(cx - eye[0], cz - eye[2]) > 3000:
                continue
            pts = [(f[i], f[i + 1]) for i in range(0, len(f), 2)]
            roof = b.get('roof') or {}
            wall_top = b['top'] - (roof.get('height') or 0)
            polys = [('roof', [(x, b['top'] if roof.get('height') else wall_top, z) for x, z in pts])]
            area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
            side = 1 if area > 0 else -1
            for i in range(len(pts)):
                (ax, az), (qx, qz) = pts[i], pts[(i + 1) % len(pts)]
                length = math.hypot(qx - ax, qz - az)
                if length < 2:
                    continue
                nx, nz = (qz - az) / length * side, -(qx - ax) / length * side
                if (eye[0] - (ax + qx) / 2) * nx + (eye[2] - (az + qz) / 2) * nz <= 0:
                    continue
                g = min(the_map.ground(ax, az), the_map.ground(qx, qz))
                polys.append(('wall', [(ax, g, az), (qx, g, qz), (qx, wall_top, qz), (ax, wall_top, az)]))
            for kind, poly in polys:
                uv, depth = cam.project(np.array(poly))
                if (depth <= 1).any() or uv[:, 0].max() < 0 or uv[:, 0].min() > img.width or uv[:, 1].max() < 0 or uv[:, 1].min() > img.height:
                    continue
                faces.append((float(np.linalg.norm(np.mean(np.array(poly), axis=0) - eye)), bi, kind, [tuple(p) for p in uv]))
        faces.sort(key=lambda face: -face[0])
        ids = Image.new('RGB', img.size, (255, 255, 255))
        draw = ImageDraw.Draw(ids)
        for n, (_, _, _, poly) in enumerate(faces):
            draw.polygon(poly, fill=(n >> 16 & 255, n >> 8 & 255, n & 255))
        idx = np.asarray(ids).astype(np.int64)
        flat_ids = (idx[:, :, 0] << 16) | (idx[:, :, 1] << 8) | idx[:, :, 2]
        edge = np.zeros(flat_ids.shape, bool)
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (2, 0), (0, 2), (-2, 0), (0, -2)):
            edge |= np.roll(np.roll(flat_ids, dy, 0), dx, 1) != flat_ids
        flat_ids[edge] = 0xFFFFFF
        order = np.argsort(flat_ids, axis=None)
        bounds = np.searchsorted(flat_ids.ravel()[order], np.arange(len(faces) + 1))
        for n, (_, bi, kind, _) in enumerate(faces):
            sel = order[bounds[n]:bounds[n + 1]]
            if len(sel) >= 30:
                samples.setdefault(bi, {'roof': [], 'wall': []})[kind].append(pixels[sel])

    hexcolour = lambda rgb: '#%02x%02x%02x' % tuple(int(round(c)) for c in rgb)  # noqa: E731
    looks = {}
    for bi, entry in samples.items():
        b = buildings[bi]
        cx, cz = centroid(b['outline'])
        if not (bx0 <= cx <= bx1 and bz0 <= cz <= bz1) or b.get('landmark'):
            continue
        look = {}
        if entry['roof']:
            rgb = np.concatenate(entry['roof'])
            sub = rgb[:: max(1, len(rgb) // 4000)]
            leafy = np.array([is_foliage(p) for p in sub])
            f = b['outline']
            level = sum(the_map.ground(f[i], f[i + 1]) for i in range(0, len(f), 2)) / (len(f) // 2)
            if len(sub) >= 60:
                if b['top'] - level > 13 and leafy.mean() > 0.5:
                    pick = sub[leafy]
                else:
                    pick = sub[~leafy] if (~leafy).sum() >= len(sub) * 0.35 else sub
                look['roof'], look['roofPixels'] = hexcolour(np.median(pick, axis=0)), int(len(rgb))
        if entry['wall']:
            rgb = np.concatenate(entry['wall'])
            sub = rgb[:: max(1, len(rgb) // 6000)]
            sub = sub[np.array([not is_foliage(p) for p in sub])]
            if len(sub) >= 120:
                lum = sub @ np.array([0.299, 0.587, 0.114])
                look['wall'], look['wallPixels'] = hexcolour(np.median(sub[lum >= np.percentile(lum, 55)], axis=0)), int(len(rgb))
        if look:
            looks[the_map.building_key(b)] = look
    json.dump(looks, open(out, 'w'), indent=1, sort_keys=True)
    print(len(looks), 'buildings sampled ->', out)


def merge_looks(the_map, sampled_path, min_roof=150, min_wall=400):
    """Adds well-sampled colours to looks.json: greys lose the shade's blue cast, too-dark walls (shade) are left out."""

    def hls(hexcolour):
        return colorsys.rgb_to_hls(*(int(hexcolour[i:i + 2], 16) / 255 for i in (1, 3, 5)))

    def tidy(hexcolour, minimum):
        h, l, s = hls(hexcolour)
        if 0.5 <= h <= 0.78 and s < 0.45:
            s *= 0.2
        r, g, b = colorsys.hls_to_rgb(h, max(l, minimum), s)
        return '#%02x%02x%02x' % tuple(round(c * 255) for c in (r, g, b))

    target = the_map.dir / 'looks.json'
    existing = json.load(open(target)) if target.exists() else {'$schema': '../looks.schema.json', 'buildings': {}}
    added = 0
    for key, look in json.load(open(sampled_path)).items():
        entry = {}
        if look.get('roofPixels', 0) >= min_roof and 'roof' in look:
            entry['roof'] = tidy(look['roof'], 0.22)
        if look.get('wallPixels', 0) >= min_wall and 'wall' in look and hls(look['wall'])[1] >= 0.25:
            entry['wall'] = tidy(look['wall'], 0.38)
        if entry:
            existing['buildings'][key] = {**entry, **existing['buildings'].get(key, {})}
            added += 1
    existing['buildings'] = dict(sorted(existing['buildings'].items(), key=lambda kv: (kv[0].split('/')[0], int(kv[0].split('/')[1]))))
    open(target, 'w').write(json.dumps(existing, indent=4, ensure_ascii=False) + '\n')
    print(added, 'looks merged into', target)


def compare(image, render, out):
    ref = Image.open(image).convert('RGB')
    ren = Image.open(render).convert('RGB').resize(ref.size, Image.LANCZOS)
    both = Image.new('RGB', (ref.width, ref.height * 2), 'white')
    both.paste(ref, (0, 0))
    both.paste(ren, (0, ref.height))
    both.save(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--map', default='quebec-plains')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('fit').add_argument('image')
    o = sub.add_parser('overlay')
    o.add_argument('image')
    o.add_argument('out')
    o.add_argument('--box', help='x0,y0,x1,y1 in pixels')
    o.add_argument('--zoom', type=float, default=1)
    o.add_argument('--ids', action='store_true')
    c = sub.add_parser('crop')
    c.add_argument('image')
    c.add_argument('out')
    c.add_argument('box')
    c.add_argument('--zoom', type=float, default=2)
    c.add_argument('--grid', type=int, default=50)
    g = sub.add_parser('ground')
    g.add_argument('image')
    g.add_argument('pixels', nargs='+')
    sub.add_parser('view').add_argument('image')
    b = sub.add_parser('building')
    b.add_argument('id', type=int)
    b.add_argument('out')
    b.add_argument('--images', nargs='+', required=True)
    h = sub.add_parser('heights')
    h.add_argument('id', type=int)
    h.add_argument('--step', type=float, default=2)
    fh = sub.add_parser('facade-heights')
    fh.add_argument('start', help='lat,lon')
    fh.add_argument('end', help='lat,lon')
    fh.add_argument('--step', type=float, default=3)
    fh.add_argument('--depth', type=float, default=60)
    lk = sub.add_parser('looks')
    lk.add_argument('out')
    lk.add_argument('box', help='lat0,lon0,lat1,lon1')
    lk.add_argument('images', nargs='+')
    sub.add_parser('merge-looks').add_argument('sampled')
    cp = sub.add_parser('compare')
    cp.add_argument('image')
    cp.add_argument('render')
    cp.add_argument('out')
    args = parser.parse_args()

    the_map = Map(args.map)
    if args.command == 'fit':
        fit(the_map, args.image)
    elif args.command == 'overlay':
        overlay(the_map, args.image, args.out, ids=args.ids, zoom=args.zoom,
                box=tuple(map(int, args.box.split(','))) if args.box else None)
    elif args.command == 'crop':
        grid_crop(Image.open(args.image).convert('RGB'), tuple(map(int, args.box.split(','))), args.zoom, args.grid).save(args.out)
    elif args.command == 'ground':
        cam = camera_for(args.image)
        for spec in args.pixels:
            u, v = map(float, spec.split(','))
            x, _, z = cam.to_ground(the_map, u, v)
            lat, lon = the_map.unproject(x, z)
            print(f'{spec:>12} -> {{"lat": {lat:.7f}, "lon": {lon:.7f}}}')
    elif args.command == 'view':
        print(view_link(the_map, args.image))
    elif args.command == 'building':
        building_view(the_map, args.images, args.id, args.out)
    elif args.command == 'heights':
        building_heights(the_map, args.id, args.step)
    elif args.command == 'facade-heights':
        facade_heights(the_map, tuple(map(float, args.start.split(','))), tuple(map(float, args.end.split(','))),
                       args.step, (-args.depth, 4.0))
    elif args.command == 'looks':
        sample_looks(the_map, args.images, tuple(map(float, args.box.split(','))), args.out)
    elif args.command == 'merge-looks':
        merge_looks(the_map, args.sampled)
    elif args.command == 'compare':
        compare(args.image, args.render, args.out)


if __name__ == '__main__':
    main()
