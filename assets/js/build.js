/* DataLab — build mode: floor areas, free walls, doors, grid placement and the furniture catalog.
   Areas are rectangles of floor (the building's footprint). Walls are free segments on the tile
   grid (`world.wallSet`), doors are independent items sitting on a wall, and rooms are whatever
   connected floor regions the walls and doors enclose. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;

  const LIM = { mapW: 64, mapH: 48, minW: 3, minH: 3, maxW: 30, maxH: 24 };
  const FLOOR = { '.': 1, ',': 1, '_': 1 };
  const SKIP = { glass: 1, glassH: 1, videowall: 1, wallseg: 1 };
  const tkey = (x, y) => x + ',' + y;

  /* ------------------------------------------------------------------ */
  /* Areas → tiles                                                       */
  /* ------------------------------------------------------------------ */

  // Two areas separated by exactly one tile share a partition (walled + a door when it first appears).
  function sharedWall(a, b) {
    let l = null, r = null;
    if (b.x === a.x + a.w + 1) { l = a; r = b; } else if (a.x === b.x + b.w + 1) { l = b; r = a; }
    if (l) {
      const from = Math.max(l.y, r.y), to = Math.min(l.y + l.h, r.y + r.h);
      if (to > from) return { axis: 'v', at: l.x + l.w, from, to };
    }
    let t = null, u = null;
    if (b.y === a.y + a.h + 1) { t = a; u = b; } else if (a.y === b.y + b.h + 1) { t = b; u = a; }
    if (t) {
      const from = Math.max(t.x, u.x), to = Math.min(t.x + t.w, u.x + u.w);
      if (to > from) return { axis: 'h', at: t.y + t.h, from, to };
    }
    return null;
  }

  // Areas need at least one wall tile between them.
  const tooClose = (a, b) => !(a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y);

  function connected(areas) {
    const seen = new Set([0]), q = [0];
    while (q.length) {
      const i = q.pop();
      areas.forEach((r, j) => {
        if (!seen.has(j) && sharedWall(areas[i], r)) { seen.add(j); q.push(j); }
      });
    }
    return seen.size === areas.length;
  }

  /* ---------- doors: items of their own, sitting on a wall ---------- */
  // axis 'h' = door in a horizontal (east–west) wall, people pass north–south; 'v' = the opposite.
  // rot: bit 0 = hinge on the other side, bit 1 = swings the other way.
  function makeDoor(tx, ty, axis, len, rot) {
    len = len || 1;
    const e = { kind: 'door', tx, ty, axis, len, tw: axis === 'h' ? len : 1, th: axis === 'h' ? 1 : len, rot: rot || 0, solid: false, built: true, seed: 0, state: 'ok', open: 0 };
    e.px = tx * T;
    e.py = ty * T;
    DL.itemGeom(e);
    return e;
  }
  DL.makeDoor = makeDoor;
  const doorCells = (e) => Array.from({ length: e.len || 1 }, (_, n) => (e.axis === 'h' ? [e.tx + n, e.ty] : [e.tx, e.ty + n]));

  // Centred door on a brand-new partition, as close to the middle as the furniture allows.
  function centredDoor(s, occ) {
    const len = s.to - s.from, dl = Math.min(2, len), mid = s.from + (len - dl) / 2;
    const ks = [];
    for (let k = s.from; k <= s.to - dl; k++) ks.push(k);
    ks.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const side = (k, d) => (s.axis === 'v' ? tkey(s.at + d, k) : tkey(k, s.at + d));
    for (const k of ks) {
      let ok = true;
      for (let q = k; q < k + dl && ok; q++) if (occ && (occ.has(side(q, -1)) || occ.has(side(q, 1)))) ok = false;
      if (ok) return s.axis === 'v' ? makeDoor(s.at, k, 'v', dl) : makeDoor(k, s.at, 'h', dl);
    }
    return null;
  }

  let roomSeq = 1;
  const newRoomId = () => 'r' + Date.now().toString(36) + (roomSeq++);
  const lookOf = (r) => {
    const o = {};
    for (const k of ['floor', 'theme', 'type']) if (r[k] != null) o[k] = r[k];
    if (r.style) o.style = JSON.parse(JSON.stringify(r.style));
    return o;
  };

  // Floor regions → rooms. A region keeps the identity (name, type, look) of the room it overlaps
  // most; a piece split off copies the look under a new name; a region on new floor takes its area's.
  function matchRooms(w, regions, W, areaAt) {
    const prev = w.rooms || [], pAt = w.roomAt, pW = w.W || 0, pH = w.H || 0;
    const cand = [];
    regions.forEach((cells, i) => {
      const cnt = new Map();
      if (pAt && prev.length) {
        for (const idx of cells) {
          const x = idx % W, y = (idx - x) / W;
          if (x >= pW || y >= pH) continue;
          const p = pAt[y * pW + x];
          if (p >= 0 && prev[p]) cnt.set(p, (cnt.get(p) || 0) + 1);
        }
      }
      for (const [p, n] of cnt) cand.push([n, i, p]);
    });
    cand.sort((a, b) => b[0] - a[0]);
    const out = new Array(regions.length).fill(null), usedPrev = new Set();
    for (const [, i, p] of cand) {
      if (out[i] || usedPrev.has(p)) continue;
      out[i] = Object.assign({}, prev[p]);
      usedPrev.add(p);
    }
    const ids = new Set(out.filter(Boolean).map((r) => r.id)), names = new Set(out.filter(Boolean).map((r) => r.name));
    const geo = regions.map((cells) => {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (const idx of cells) { const x = idx % W, y = (idx - x) / W; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n: cells.length };
    });
    regions.forEach((cells, i) => {
      if (out[i]) return;
      const best = cand.find((c) => c[1] === i);
      let base = best ? prev[best[2]] : null, fromArea = false;
      if (!base && w.areas) {
        const cnt = new Map();
        for (const idx of cells) { const a = areaAt[idx]; if (a >= 0) cnt.set(a, (cnt.get(a) || 0) + 1); }
        let bestA = -1, bn = 0;
        for (const [a, n] of cnt) if (n > bn) { bn = n; bestA = a; }
        if (bestA >= 0) { base = w.areas[bestA]; fromArea = true; }
      }
      const r = base ? lookOf(base) : {};
      if (!r.floor) r.floor = 'tile';
      r.id = fromArea && base.id && !ids.has(base.id) ? base.id : newRoomId();
      const g = geo[i], corridor = Math.min(g.w, g.h) <= 2 && g.n >= 3;
      if (fromArea && base.name && !names.has(base.name)) r.name = base.name;
      else {
        const stem = corridor ? 'Corredor' : 'Sala';
        for (let n = 1; ; n++) if (!names.has(stem + ' ' + n)) { r.name = stem + ' ' + n; break; }
      }
      ids.add(r.id);
      names.add(r.name);
      out[i] = r;
    });
    out.forEach((r, i) => {
      const g = geo[i];
      Object.assign(r, { x: g.x, y: g.y, w: g.w, h: g.h, n: g.n, doors: 0 });
      // label: bottom-centre for a plain rectangle, otherwise the floor tile nearest the middle
      if (g.n === g.w * g.h) { r.lx = (g.x + g.w / 2) * T; r.ly = (g.y + g.h - 0.6) * T; }
      else {
        let cx = 0, cy = 0;
        for (const idx of regions[i]) { cx += idx % W; cy += Math.floor(idx / W); }
        cx /= g.n; cy /= g.n;
        let bd = Infinity, bx = g.x, by = g.y;
        for (const idx of regions[i]) { const x = idx % W, y = (idx - x) / W, d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; bx = x; by = y; } }
        r.lx = (bx + 0.5) * T; r.ly = (by + 0.6) * T;
      }
    });
    return out;
  }

  // How a wall tile links to its neighbours. Two parallel walls side by side (or a wall running
  // along the outer wall) stay separate instead of being stitched together tile by tile.
  // Each wall tile remembers which way it was drawn ('h', 'v', both at corners); links follow that.
  const wallVal = (mat, ax) => (mat || 'solid') + ':' + (ax || '');
  const wallMat = (v) => String(v || 'solid').split(':')[0];
  const wallAx = (v) => String(v || '').split(':')[1] || '';
  function wallJoins(at, axAt) {
    const isW = (t) => t === 'w' || t === 'd' || t === 'D';
    const ax = (x, y) => { const t = at(x, y); return t === 'D' ? 'h' : t === 'd' ? 'v' : t === 'w' ? axAt(x, y) : ''; };
    return {
      h(x, y, nx) {
        const t = at(nx, y), a = ax(x, y);
        if (t === '#') return a.indexOf('h') >= 0;
        return isW(t) && (a.indexOf('h') >= 0 || ax(nx, y).indexOf('h') >= 0);
      },
      v(x, y, ny) {
        const t = at(x, ny), a = ax(x, y);
        if (t === '#') return a.indexOf('v') >= 0;
        return isW(t) && (a.indexOf('v') >= 0 || ax(x, ny).indexOf('v') >= 0);
      },
    };
  }

  function layout(w) {
    const areas = w.areas;
    let W = w.lot ? w.lot.w : 0, H = w.lot ? w.lot.h : 0;
    for (const r of areas) { W = Math.max(W, r.x + r.w + 1); H = Math.max(H, r.y + r.h + 1); }
    const N = W * H;
    const base = new Uint8Array(N); // 0 ground / outer wall · 1 area floor · 2 partition between areas
    const areaAt = new Int16Array(N).fill(-1);
    areas.forEach((r, i) => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { base[y * W + x] = 1; areaAt[y * W + x] = i; }
    });
    const runs = [];
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const s = sharedWall(areas[i], areas[j]);
        if (!s) continue;
        s.a = areas[i].id;
        s.b = areas[j].id;
        for (let k = s.from; k < s.to; k++) base[s.axis === 'v' ? k * W + s.at : s.at * W + k] = 2;
        runs.push(s);
      }
    }

    // walls: only on floor or partition tiles; partitions that just appeared start walled
    const ws = w.wallSet || (w.wallSet = new Map());
    for (const k of Array.from(ws.keys())) {
      const [x, y] = k.split(',').map(Number);
      if (!(x >= 0 && y >= 0 && x < W && y < H && base[y * W + x])) ws.delete(k);
    }
    const seen = w.gapsSeen, gaps = new Set(), fresh = [];
    for (const s of runs) {
      let isNew = true;
      for (let k = s.from; k < s.to; k++) {
        const kk = s.axis === 'v' ? tkey(s.at, k) : tkey(k, s.at);
        gaps.add(kk);
        if (seen && seen.has(kk)) isNew = false;
        else ws.set(kk, ws.get(kk) || wallVal('glass', s.axis));
      }
      if (isNew) fresh.push(s);
    }
    w.gapsSeen = gaps;
    w.freshRuns = fresh;

    // doors that no longer sit on a wall are dropped
    const doorAt = new Map(), items = [];
    for (const e of w.items) {
      if (SKIP[e.kind] && e.kind !== 'videowall') continue;
      if (e.kind === 'door') {
        const cs = doorCells(e);
        if (!cs.every(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && ws.has(tkey(x, y))) || cs.some(([x, y]) => doorAt.has(tkey(x, y)))) continue;
        for (const [x, y] of cs) doorAt.set(tkey(x, y), e);
      }
      items.push(e);
    }

    const tiles = new Array(N).fill('#');
    for (let i = 0; i < N; i++) if (base[i]) tiles[i] = '.';
    for (const k of ws.keys()) { const [x, y] = k.split(',').map(Number); tiles[y * W + x] = 'w'; }
    for (const [k, e] of doorAt) { const [x, y] = k.split(',').map(Number); tiles[y * W + x] = e.axis === 'h' ? 'D' : 'd'; }

    // rooms: connected floor regions (walls and doors separate them)
    const roomAt = new Int16Array(N).fill(-1), regions = [];
    for (let i = 0; i < N; i++) {
      if (tiles[i] !== '.' || roomAt[i] >= 0) continue;
      const id = regions.length, cells = [i], q = [i];
      roomAt[i] = id;
      while (q.length) {
        const c = q.pop(), x = c % W;
        const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W];
        for (const n of nb) {
          if (n < 0 || n >= N || tiles[n] !== '.' || roomAt[n] >= 0) continue;
          roomAt[n] = id;
          cells.push(n);
          q.push(n);
        }
      }
      regions.push(cells);
    }
    const rooms = matchRooms(w, regions, W, areaAt);
    rooms.forEach((r, i) => {
      for (const idx of regions[i]) {
        const x = idx % W, y = (idx - x) / W;
        tiles[idx] = r.floor === 'carpet' ? '_' : w.perf.has(tkey(x, y)) ? ',' : '.';
      }
    });

    // tiles right in front of a door stay walkable
    const clear = new Set(), doorsOf = rooms.map(() => new Set());
    for (const [k, e] of doorAt) {
      const [x, y] = k.split(',').map(Number);
      const sides = e.axis === 'h' ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
      for (const [sx, sy] of sides) {
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        clear.add(tkey(sx, sy));
        const ri = roomAt[sy * W + sx];
        if (ri >= 0) doorsOf[ri].add(e);
      }
    }
    rooms.forEach((r, i) => { r.doors = doorsOf[i].size; });

    // wall pieces are items, so they depth-sort with people and furniture
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : tiles[y * W + x]);
    const J = wallJoins(at, (x, y) => wallAx(ws.get(tkey(x, y))));
    for (const [k, v] of ws) {
      if (doorAt.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      const e = { kind: 'wallseg', tx: x, ty: y, tw: 1, th: 1, solid: false, mat: wallMat(v), built: true,
        l: J.h(x, y, x - 1), r: J.h(x, y, x + 1), u: J.v(x, y, y - 1), d: J.v(x, y, y + 1) };
      e.px = x * T; e.py = y * T;
      DL.itemGeom(e);
      items.push(e);
    }
    Object.assign(w, { W, H, tiles, roomAt, areaAt, rooms, walls: runs, keepClear: clear, items });
  }

  function rebuildSolid(w) {
    const W = w.W, H = w.H, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = w.tiles[i];
      if (t === '#' || t === 'w' || t === 'g' || t === 'G') solid[i] = 1;
    }
    for (const e of w.items) {
      if (!e.solid || e.host || SKIP[e.kind]) continue;
      const hole = DL.itemHole ? DL.itemHole(e) : null;
      for (let j = 0; j < e.th; j++) {
        for (let i = 0; i < e.tw; i++) {
          if (hole && hole[0] === i && hole[1] === j) continue;
          const x = e.tx + i, y = e.ty + j;
          if (x >= 0 && y >= 0 && x < W && y < H) solid[y * W + x] = 1;
        }
      }
    }
    w.solid = solid;
  }

  function refreshIndex(w) {
    w.byId = {};
    for (const e of w.items) if (e.id) w.byId[e.id] = e;
    w.interactables = w.items.filter((e) => e.id);
  }

  /* ---------- wall + door sprites ---------- */
  // Walls stand on the tile's lower part: cap from py-6, face down to py+10, so a person north of
  // a wall is partly hidden by it and one south of it is drawn in front.
  const WALL = {
    solid: { cap: '#454d5b', capHi: '#596273', face: '#222833', faceHi: '#2b323e', base: '#11141a' },
    glass: { cap: '#2a3039', capHi: '#3a4250', face: 'rgba(160,195,236,0.09)', faceHi: 'rgba(220,235,255,0.16)', base: '#2a3039' },
  };
  function drawWallSeg(g, e) {
    const c = WALL[e.mat] || WALL.solid, px = e.px, py = e.py;
    if (e.l || e.r || !e.d) {
      const x0 = e.l ? px : px + 6, x1 = e.r ? px + 16 : px + 10;
      R(g, x0, py + 10, x1 - x0, 2, 'rgba(0,0,0,0.22)');
      R(g, x0, py - 3, x1 - x0, 13, c.face);
      if (e.mat === 'glass') {
        R(g, x0 + ((e.tx * 5) % 7) + 1, py, 1, 1, c.faceHi);
        R(g, x0 + ((e.tx * 5) % 7) + 2, py - 1, 1, 1, c.faceHi);
      } else {
        R(g, x0, py - 3, x1 - x0, 1, c.faceHi);
        if (!e.l) R(g, x0, py - 3, 1, 13, '#151920');
        if (!e.r) R(g, x1 - 1, py - 3, 1, 13, '#151920');
      }
      R(g, x0, py + 9, x1 - x0, 1, c.base);
      R(g, x0, py - 6, x1 - x0, 3, c.cap);
      R(g, x0, py - 6, x1 - x0, 1, c.capHi);
    }
    if (e.d) {
      R(g, px + 6, py - 6, 4, 16, c.cap);
      R(g, px + 7, py - 6, 2, 16, c.capHi);
      if (e.mat === 'glass') R(g, px + 7, py - 6, 2, 16, 'rgba(160,195,236,0.22)');
    }
  }

  function drawDoor(g, e) {
    const px = e.px, py = e.py, o = Math.max(0, Math.min(1, e.open || 0));
    const flip = e.rot & 1, back = e.rot & 2, len = e.len || 1;
    const leaf = '#5a4a3c', leafHi = '#6e5b4a', leafLo = '#3f342b', frame = '#2a3039', cap = '#3b424e';
    if (e.axis === 'h') {
      const W = len * T;
      R(g, px, py + 10, W, 2, 'rgba(0,0,0,0.2)');
      // leaves: one per side for a double door, otherwise a single one hinged left (or right)
      const leaves = len > 1 ? [[px + 2, (W - 4) / 2, 0], [px + W / 2, (W - 4) / 2, 1]] : [[px + 2, W - 4, flip]];
      for (const [lx, lw, hingeR] of leaves) {
        const vis = Math.max(1, Math.round(lw * (1 - 0.88 * o)));
        const x = hingeR ? lx + lw - vis : lx;
        R(g, x, py - 3, vis, 13, leaf);
        R(g, x, py - 3, vis, 1, leafHi);
        R(g, x, py + 9, vis, 1, leafLo);
        if (vis > 5) R(g, hingeR ? x + 1 : x + vis - 3, py + 3, 2, 1, '#c9b48a');
        // the swung leaf, seen edge-on, sticks out to the swing side
        if (o > 0.05) {
          const hx = hingeR ? lx + lw - 2 : lx, sw = Math.round(o * 11);
          if (back) R(g, hx, py - 3 - sw, 2, sw + 2, leafHi);
          else R(g, hx, py + 9, 2, sw + 1, leafLo);
        }
      }
      R(g, px, py - 6, W, 3, cap);
      R(g, px, py - 6, W, 1, '#4b5361');
      R(g, px, py - 6, 2, 16, frame);
      R(g, px + W - 2, py - 6, 2, 16, frame);
    } else {
      const H = len * T;
      const leaves = len > 1 ? [[py - 6, H / 2, 0], [py - 6 + H / 2, H / 2, 1]] : [[py - 6, H, flip]];
      for (const [ly, lh, hingeB] of leaves) {
        const vis = Math.max(1, Math.round(lh * (1 - 0.88 * o)));
        const y = hingeB ? ly + lh - vis : ly;
        R(g, px + 6, y, 4, vis, leaf);
        R(g, px + 7, y, 2, vis, leafHi);
        if (o > 0.05) {
          const hy = hingeB ? ly + lh - 2 : ly, sw = Math.round(o * 10);
          if (back) R(g, px + 6 - sw, hy, sw, 2, leafLo);
          else R(g, px + 10, hy, sw, 2, leafLo);
        }
      }
      R(g, px + 5, py - 7, 6, 2, frame);
      R(g, px + 5, py - 7 + H, 6, 2, frame);
    }
  }

  const draw0 = DL.drawItem;
  DL.drawItem = function (g, e, t) {
    if (e.kind === 'wallseg') return drawWallSeg(g, e);
    if (e.kind === 'door') return drawDoor(g, e);
    return draw0(g, e, t);
  };
  const geom0 = DL.itemGeom;
  DL.itemGeom = function (e) {
    if (e.kind === 'wallseg') { e.sortY = e.py + 10; e.ix = e.px + 8; e.iy = e.py + 23; e.bounds = null; return; }
    if (e.kind === 'door') {
      const w = e.tw * T, h = e.th * T;
      e.sortY = e.axis === 'h' ? e.py + 10 : e.py + h - 6;
      e.bounds = e.axis === 'h' ? { x: e.px, y: e.py - 7, w, h: 19 } : { x: e.px + 2, y: e.py - 8, w: 12, h: h + 4 };
      e.ix = e.px + w / 2;
      e.iy = e.py + h + 7;
      return;
    }
    geom0(e);
  };

  /* ---------- floor + walls, generalised from DL.renderStatic ---------- */
  DL.renderRooms = function (w) {
    const W = w.W, H = w.H;
    const c = DL.mk(W * T, H * T), g = c.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : w.tiles[y * W + x]);
    const open = (t) => t !== '#';
    // rooms can carry their own look (decor.js); without one, the classic floor
    const D = DL.decorRender;
    const styleAt = (x, y) => {
      if (!D || x < 0 || y < 0 || x >= W || y >= H || !w.roomAt) return null;
      const i = w.roomAt[y * W + x];
      const s = i >= 0 ? D.styleOf(w.rooms[i]) : null;
      return s && !s.classic ? s : null;
    };
    const floor = (t, px, py, x, y, sx, sy) => {
      const st = styleAt(sx == null ? x : sx, sy == null ? y : sy);
      if (st) D.floorTile(g, st, px, py, x, y, t === ',');
      else if (t === '_') DL.carpet(g, px, py, x, y);
      else DL.floorTile(g, px, py, t === ',');
    };
    const isFloor = (t) => t === '.' || t === ',' || t === '_';
    const floorKind = (t) => (t === '_' || t === ',' ? t : '.');
    // a wall or door tile shows the floor of the rooms on each side of it
    const splitFloor = (x, y, px, py) => {
      const L = at(x - 1, y), Rt = at(x + 1, y), U = at(x, y - 1), Dn = at(x, y + 1);
      if (isFloor(L) || isFloor(Rt)) {
        const a = isFloor(L) ? [L, x - 1] : [Rt, x + 1], b = isFloor(Rt) ? [Rt, x + 1] : a;
        floor(floorKind(a[0]), px, py, x, y, a[1], y);
        floor(floorKind(b[0]), px + 8, py, x, y, b[1], y);
      } else if (isFloor(U) || isFloor(Dn)) {
        const a = isFloor(U) ? [U, y - 1] : [Dn, y + 1], b = isFloor(Dn) ? [Dn, y + 1] : a;
        floor(floorKind(a[0]), px, py, x, y, x, a[1]);
        floor(floorKind(b[0]), px, py + 8, x, y, x, b[1]);
      } else R(g, px, py, T, T, '#0b0c10');
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y), px = x * T, py = y * T;
        if (t === '#') {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (open(at(x + dx, y + dy))) { near = true; break; }
          if (near) R(g, px, py, T, T, '#0b0c10');
          else if (w.lot && x < w.lot.w && y < w.lot.h) {
            // empty lot: buildable ground, waiting for a room
            R(g, px, py, T, T, '#0c0e12');
            R(g, px, py, 1, 1, '#1a1d24');
            if ((x + y) % 5 === 0) R(g, px + 9, py + 6, 1, 1, '#14171c');
          }
        } else if (t === 'g') {
          floor(floorKind(at(x - 1, y)), px, py, x, y, x - 1, y);
          floor(floorKind(at(x + 1, y)), px + 8, py, x, y, x + 1, y);
          R(g, px + 7, py, 3, 16, '#1c2129');
        } else if (t === 'G') {
          floor(floorKind(at(x, y - 1)), px, py, x, y, x, y - 1);
          floor(floorKind(at(x, y + 1)), px, py + 8, x, y, x, y + 1);
          R(g, px, py + 7, 16, 3, '#1c2129');
        } else if (t === 'w' || t === 'd' || t === 'D') {
          splitFloor(x, y, px, py);
          if (t !== 'w') R(g, px + (t === 'd' ? 6 : 0), py + (t === 'D' ? 6 : 0), t === 'd' ? 4 : 16, t === 'D' ? 4 : 16, 'rgba(10,12,16,0.35)');
        } else floor(t, px, py, x, y);
      }
    }
    // wall faces: any wall with open floor right below it
    const faceTop = (x, y) => ((y >= 1 && at(x, y - 1) === '#') ? (y + 1) * T - 26 : (y + 1) * T - 12);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#' || !open(at(x, y + 1))) continue;
        const px = x * T, B = (y + 1) * T, ft = faceTop(x, y);
        const tall = ft === B - 26, ct = tall ? (y - 1) * T : y * T;
        const noc = at(x, y + 1) === '_';
        R(g, px, ct, 16, ft - 1 - ct, '#0b0c10');
        const ws = styleAt(x, y + 1);
        if (ws) { D.wallFace(g, ws, px, ft, B, ws.rgb && ws.rgb.on ? ws.rgb.color : null); continue; }
        R(g, px, ft - 1, 16, 1, '#242832');
        R(g, px, ft, 16, B - ft, noc ? '#14161d' : '#171b22');
        R(g, px, ft, 1, B - ft, noc ? '#121419' : '#14171d');
        R(g, px, B - 4, 16, 1, '#1d2028');
        R(g, px, B - 3, 16, 3, '#101217');
        R(g, px, B, 16, 2, 'rgba(0,0,0,0.25)');
      }
    }
    // partition headers where an inner wall meets a wall face
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y);
        if ((t !== 'g' && t !== 'w' && t !== 'd') || at(x, y - 1) !== '#') continue;
        if (t === 'w' && !(at(x, y + 1) === 'w' || at(x, y + 1) === 'd' || isFloor(at(x - 1, y)) || isFloor(at(x + 1, y)))) continue;
        const ft = faceTop(x, y - 1);
        R(g, x * T + 6, ft, 5, y * T - ft, '#1d222a');
      }
    }
    // inner wall edges
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#') continue;
        const px = x * T, py = y * T;
        if (open(at(x + 1, y))) R(g, px + 15, py, 1, 16, '#20242c');
        if (open(at(x - 1, y))) R(g, px, py, 1, 16, '#20242c');
        if (open(at(x, y - 1))) R(g, px, py, 16, 1, '#20242c');
      }
    }
    // cable trays + lamps on the tall north wall of technical rooms
    const lampsOf = (r) => {
      const xs = [];
      for (let lx = r.x + 2; lx <= r.x + r.w - 3; lx += 4) xs.push(lx);
      return xs;
    };
    for (const r of w.rooms) {
      const rs = D && D.styleOf(r);
      const lit = rs && !rs.classic && rs.light && rs.light !== 'auto' ? rs.light !== 'dim' : r.floor === 'tile';
      if (!lit || at(r.x, r.y - 1) !== '#' || at(r.x, r.y - 2) !== '#') continue;
      const ft = r.y * T - 26;
      // only along the stretch of north wall this room actually touches
      let x0 = r.x;
      while (x0 < r.x + r.w) {
        while (x0 < r.x + r.w && !(isFloor(at(x0, r.y)) && at(x0, r.y - 1) === '#')) x0++;
        let x1 = x0;
        while (x1 < r.x + r.w && isFloor(at(x1, r.y)) && at(x1, r.y - 1) === '#') x1++;
        if (x1 > x0) {
          R(g, x0 * T, ft + 2, (x1 - x0) * T, 1, '#2f4566');
          R(g, x0 * T, ft + 3, (x1 - x0) * T, 2, '#262b34');
          R(g, x0 * T, ft + 5, (x1 - x0) * T, 1, '#111318');
          for (const lx of lampsOf({ x: x0, w: x1 - x0 })) {
            R(g, lx * T + 4, ft + 11, 8, 2, '#dfe7f2');
            R(g, lx * T + 4, ft + 13, 8, 1, '#7f8a9c');
          }
        }
        x0 = x1;
      }
    }
    if (w.lot) {
      g.fillStyle = '#1d2129';
      g.fillRect(0, w.lot.h * T - 1, w.lot.w * T, 1);
      g.fillRect(w.lot.w * T - 1, 0, 1, w.lot.h * T);
    }
    // baked light pools (inside each room's own floor only)
    g.globalCompositeOperation = 'lighter';
    const inRoom = (r, i, lx, ly) => w.roomAt && w.roomAt[Math.floor(ly) * W + Math.floor(lx)] === i;
    w.rooms.forEach((r, i) => {
      const rs = D && D.styleOf(r);
      if (rs && !rs.classic && D.bakeLight(g, r, rs)) return;
      if (r.floor === 'tile') {
        for (const lx of lampsOf(r)) for (let ly = r.y + 1.4; ly < r.y + r.h; ly += 5) if (inRoom(r, i, lx, ly)) DL.pool(g, lx * T + 8, ly * T, 54, 'rgba(160,195,236,0.045)');
      } else if (r.id === 'noc') {
        for (const [lx, ly] of [[4, 8], [7, 13], [5, 16]]) DL.pool(g, lx * T, ly * T, 72, 'rgba(255,194,133,0.03)');
      } else {
        for (let ly = r.y + 2; ly < r.y + r.h; ly += 5) for (let lx = r.x + 2; lx < r.x + r.w; lx += 5) if (inRoom(r, i, lx, ly)) DL.pool(g, lx * T, ly * T, 64, 'rgba(255,194,133,0.03)');
      }
    });
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  // Walls on fresh partitions get a centred door (new worlds, presets, a room drawn next to another).
  function doorsForFresh(w, occ) {
    const add = [];
    // (auto: the free door a new partition gets — saves tell it apart from bought doors)
    for (const s of w.freshRuns || []) { const d = centredDoor(s, occ); if (d) { d.auto = true; add.push(d); } }
    if (add.length) { w.items = w.items.concat(add); layout(w); }
    return add;
  }

  // Convert the hand-made DC-01 map into the area model.
  DL.initRooms = function (w) {
    w.areas = [
      { id: 'noc', name: 'NOC', x: 1, y: 2, w: 9, h: 17, floor: 'carpet', fixed: true },
      { id: 'hall', name: 'Salão de servidores', x: 11, y: 2, w: 18, h: 17, floor: 'tile' },
    ];
    w.perf = new Set();
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.tiles[y * w.W + x] === ',') w.perf.add(x + ',' + y);
    for (const d of w.items) {
      if (d.kind !== 'desk') continue;
      const c = w.items.find((x) => x.kind === 'chair' && x.tx === d.tx && x.ty === d.ty + 1);
      if (!c) continue;
      d.rot = 0;
      d.chair = c;
      Object.assign(c, { parent: d, tw: 2, rot: 0 });
    }
    for (const e of w.items) if (!e.bounds && !SKIP[e.kind]) DL.itemGeom(e);
    w.rooms = null;
    layout(w);
    doorsForFresh(w, null);
    rebuildSolid(w);
    refreshIndex(w);
    w.version = 1;
  };

  // A world built from scratch: a small lot with one entrance room (or a preset's rooms).
  // Furniture for presets is placed afterwards through the builder, with the player's own rules.
  DL.newWorld = function (def) {
    const w = {
      items: [], npcs: [], rows: { A: [], B: [] }, labels: [], perf: new Set(), wallSet: new Map(),
      lot: def ? Object.assign({}, def.lot) : { w: 10, h: 9 }, hasVideoWall: false,
      areas: def ? def.rooms.map((r, i) => Object.assign({ id: 'r' + (i + 1), floor: 'tile' }, r)) : [{ id: 'r1', name: 'Entrada', x: 1, y: 2, w: 7, h: 5, floor: 'carpet' }],
    };
    for (const [kind, tx, ty] of def ? [] : [['plant', 1, 2], ['water', 7, 2]]) {
      const e = { kind, tx, ty, tw: 1, th: 1, solid: true, seed: w.items.length * 7 + 3, state: 'ok', built: true };
      e.px = tx * T;
      e.py = ty * T;
      e.sortY = e.py + T;
      DL.itemGeom(e);
      w.items.push(e);
    }
    layout(w);
    doorsForFresh(w, null);
    rebuildSolid(w);
    refreshIndex(w);
    const r0 = w.areas[0];
    w.spawn = def && def.spawn ? { x: def.spawn[0] * T + 8, y: def.spawn[1] * T + 10 } : { x: Math.floor(r0.x + r0.w / 2) * T + 8, y: (r0.y + r0.h - 2) * T + 10 };
    w.version = 1;
    return w;
  };

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  // price: what placing it costs the company ($); group: the filter chip inside the tab.
  const CATALOG = [
    { id: 'desk', cat: 'equip', group: 'Estações', name: 'Computador', w: 2, h: 1, price: 2200, desc: 'Estação com dois monitores, PC e cadeira. A equipe trabalha aqui.' },
    // workstation setups: all are desks (kind 'desk') with their own PC, so the crew uses any of them
    { id: 'desk1', kind: 'desk', setup: 'mono1', cat: 'equip', group: 'Estações', name: 'Mesa · 1 monitor', w: 2, h: 1, price: 1500, desc: 'Um monitor e o PC embaixo da mesa.' },
    { id: 'desk3', kind: 'desk', setup: 'mono3', cat: 'equip', group: 'Estações', name: 'Mesa · 3 monitores', w: 2, h: 1, price: 2900, desc: 'Três monitores lado a lado e PC embaixo.' },
    { id: 'desk4', kind: 'desk', setup: 'mono4', cat: 'equip', group: 'Estações', name: 'Mesa · 4 monitores', w: 2, h: 1, price: 3600, desc: 'Quatro monitores num braço articulado.' },
    { id: 'deskgamer', kind: 'desk', setup: 'gamer', chair: 'gamer', cat: 'equip', group: 'Estações', name: 'Setup gamer', w: 2, h: 1, price: 4200, desc: 'Monitor ultrawide curvo, teclado RGB e PC com luz.' },
    { id: 'deskgamerpc', kind: 'desk', setup: 'gamerpc', chair: 'gamer', cat: 'equip', group: 'Estações', name: 'Setup com PC gamer', w: 2, h: 1, price: 5200, desc: 'Dois monitores e um gabinete RGB de vidro sobre a mesa.' },
    { id: 'desktech', kind: 'desk', setup: 'tech', cat: 'equip', group: 'Estações', name: 'Estação técnica', w: 2, h: 1, price: 2600, desc: 'Monitor, notebook de campo, multímetro e cabos.' },
    { id: 'desknoc', kind: 'desk', setup: 'noc', cat: 'equip', group: 'Estações', name: 'Estação de NOC', w: 2, h: 1, price: 4800, desc: 'Painel superior com indicadores e três monitores de operação.' },
    { id: 'desksupport', kind: 'desk', setup: 'support', cat: 'equip', group: 'Estações', name: 'Estação de atendimento', w: 2, h: 1, price: 1800, desc: 'Monitor, telefone e headset: a equipe atende os clientes daqui primeiro.' },
    { id: 'deskadmin', kind: 'desk', setup: 'admin', chair: 'exec', cat: 'equip', group: 'Estações', name: 'Estação de administrador', w: 2, h: 1, price: 3200, desc: 'Dois monitores, notebook, documentos e cadeira executiva.' },
    { id: 'rack', cat: 'equip', group: 'Racks', name: 'Rack', price: 1800, desc: 'Rack 42U vazio. Instale servidores e switches nele.' },
    { id: 'server', cat: 'equip', group: 'Servidores', name: 'Servidor intermediário', mount: 'rack', thumb: 'unit-server', price: 6000, desc: 'O servidor padrão: 12 núcleos, 64 GB, SSD e 1 Gb/s. Clique em um rack com espaço livre.' },
    { id: 'switch', cat: 'equip', group: 'Rede', name: 'Switch gerenciável 24p', mount: 'rack', thumb: 'unit-switch', price: 1500, desc: '24 portas de 1 Gb/s com console e uplink de 10 Gb/s. Clique em um rack com espaço livre.' },
    { id: 'patch', cat: 'equip', group: 'Rede', name: 'Patch panel', mount: 'rack', thumb: 'unit-patch', price: 300, desc: 'Painel de passagem: organiza os cabos entre servidores e switch.' },
    { id: 'monitor', cat: 'equip', group: 'Estações', name: 'Monitor', mount: 'surface', price: 350, desc: 'Coloque sobre uma mesa. Com uma cadeira em frente vira estação.' },
    { id: 'storage', cat: 'equip', group: 'Storage', name: 'Storage SAN', price: 26000, desc: '96 TB úteis em iSCSI 2× 25 Gb/s. Gaveta de discos para os dados da sala.' },
    { id: 'crac', cat: 'equip', group: 'Racks', name: 'Ar de precisão', price: 9000, desc: 'Refrigeração para o corredor frio.' },
    { id: 'table', cat: 'furn', group: 'Mesas', name: 'Mesa', w: 2, h: 1, price: 400, desc: 'Superfície para monitores, café e vasos.' },
    { id: 'chair', cat: 'furn', group: 'Cadeiras', name: 'Cadeira', solid: false, price: 250, desc: 'Em frente a uma mesa com monitor, vira estação.' },
    { id: 'sofa', cat: 'furn', group: 'Sofás', name: 'Sofá', w: 2, h: 1, price: 1200, desc: 'Canto de descanso da equipe.' },
    { id: 'shelf', cat: 'furn', group: 'Estantes', name: 'Estante', price: 450, desc: 'Manuais, pastas e caixas de cabos.' },
    { id: 'whiteboard', cat: 'furn', group: 'Escritório', name: 'Quadro branco', w: 2, h: 1, price: 300, desc: 'Para desenhar topologias.' },
    { id: 'plant', cat: 'deco', group: 'Plantas', name: 'Planta', price: 80, desc: 'Um pouco de verde na sala.' },
    { id: 'vase', cat: 'deco', group: 'Plantas', name: 'Vaso', mount: 'surface', price: 40, desc: 'Vai em cima de uma mesa.' },
    { id: 'coffee', cat: 'deco', group: 'Escritório', name: 'Cafeteira', mount: 'surface', price: 150, desc: 'Vai em cima de uma mesa.' },
    { id: 'water', cat: 'deco', group: 'Escritório', name: 'Bebedouro', price: 220, desc: 'Água gelada para o turno.' },
    { id: 'lamp', cat: 'deco', group: 'Luminárias', name: 'Luminária', price: 120, desc: 'Luz quente de piso.' },
    { id: 'rug', cat: 'deco', group: 'Tapetes', name: 'Tapete', w: 2, h: 2, solid: false, price: 200, desc: 'Fica por baixo dos móveis.' },
    { id: 'bin', cat: 'deco', group: 'Escritório', name: 'Lixeira', price: 30, desc: 'Organização também é infraestrutura.' },
    // doors live in the Espaços tab (they go on a wall, not on the floor)
    { id: 'door', cat: 'wall', name: 'Porta', mount: 'wallslot', len: 1, price: 600, desc: 'Vai sobre uma parede interna e abre passagem.' },
    { id: 'door2', cat: 'wall', name: 'Porta dupla', mount: 'wallslot', len: 2, price: 900, desc: 'Porta de duas folhas, ocupa 2 tiles de parede.' },
  ];
  // more models and furniture (hardware.js, furniture.js), then the themed objects (decor.js)
  for (const d of (DL.HW_CATALOG || []).concat(DL.FURN_CATALOG || [], DL.DECO_CATALOG || [], DL.PROPS_CATALOG || [])) CATALOG.push(d);
  const THEME_PRICE = { rug_robot: 300, rug_claude: 300, rug_gpt: 300, rug_rgb: 450, poster: 60, neon: 250, clock: 70, arcade: 2500, beanbag: 180, ledtube: 160, pcgamer: 3800, hologram: 1900, toolcart: 650, bonsai: 90, banner: 220 };
  for (const d of DL.DECOR_CATALOG || []) CATALOG.push(Object.assign({ price: THEME_PRICE[d.id] || 100 }, d));
  // everything turns (rack units live inside a rack, so they don't)
  for (const d of CATALOG) if (d.rot == null) d.rot = d.mount !== 'rack';
  const DEF = {};
  for (const d of CATALOG) DEF[d.id] = d;
  DL.CATALOG = CATALOG;
  DL.CATALOG_DEF = DEF;

  const NAMES = {
    rack: 'Rack', switch: 'Switch', router: 'Roteador', core: 'Switch core', storage: 'Storage', crac: 'Ar de precisão', ups: 'Nobreak',
    desk: 'Computador', chair: 'Cadeira', plant: 'Planta', table: 'Mesa', monitor: 'Monitor', sofa: 'Sofá', shelf: 'Estante',
    water: 'Bebedouro', whiteboard: 'Quadro branco', rug: 'Tapete', lamp: 'Luminária', coffee: 'Cafeteira', vase: 'Vaso', bin: 'Lixeira',
    door: 'Porta', wallseg: 'Parede',
  };
  Object.assign(NAMES, DL.DECOR_NAMES || {}, DL.HW_NAMES || {});
  const SETUP_NAMES = Object.assign({ mono1: 'Mesa · 1 monitor', mono3: 'Mesa · 3 monitores', mono4: 'Mesa · 4 monitores', gamer: 'Setup gamer', gamerpc: 'Setup com PC gamer', tech: 'Estação técnica', noc: 'Estação de NOC', admin: 'Estação de administrador', support: 'Estação de atendimento' }, DL.PROPS_SETUP_NAMES || {});
  DL.SETUP_NAMES = SETUP_NAMES;
  DL.itemName = (e) => {
    if (e.kind === 'door' && e.len > 1) return 'Porta dupla';
    if (e.kind === 'desk' && SETUP_NAMES[e.setup]) return SETUP_NAMES[e.setup];
    if (e.kind === 'storage' && e.model && DL.hwModel) return DL.hwModel('storage', e.model).name;
    const d = e.defId && DEF[e.defId];
    return d && d.kind ? d.name : NAMES[e.kind] || (d && d.name) || e.kind;
  };
  // the inspector can swap a desk's setup in place (same footprint, same station)
  if (DL.ITEM_STYLES && DL.ITEM_STYLES.desk && !DL.ITEM_STYLES.desk.some((o) => o.key === 'setup')) {
    DL.ITEM_STYLES.desk.unshift({ key: 'setup', label: 'Setup', options: [['', '2 mon.'], ['mono1', '1 mon.'], ['mono3', '3 mon.'], ['mono4', '4 mon.'], ['gamer', 'Gamer'], ['gamerpc', 'PC gamer'], ['tech', 'Técnica'], ['noc', 'NOC'], ['admin', 'Admin'], ['support', 'Atendimento']] });
  }
  // the bigger catalog's inspector options (props.js)
  if (DL.applyPropsStyles) DL.applyPropsStyles();
  // rugs lie under everything; wall pieces hang on the north wall (neither blocks the floor)
  const isRug = (e) => e.kind === 'rug' || !!e.rug;

  function initTel(e, temp, power, unit, jitter) {
    e.tel = { temp, power, unit, jitter };
    e.temp = temp;
    e.power = power;
    e.hist = { temp: [], power: [] };
    for (let i = 0; i < 40; i++) {
      e.hist.temp.push(temp + (DL.hash(e.seed * 3 + i) - 0.5) * jitter * 3);
      e.hist.power.push(power * (1 + (DL.hash(e.seed * 5 + i) - 0.5) * 0.04));
    }
    e.uptime = 1;
  }

  function syncRack(e) {
    const n = e.units.filter(Boolean).length;
    e.servers = [];
    e.units.forEach((u, k) => {
      if (u) e.servers.push({ u: 'U' + String(40 - k * 4).padStart(2, '0'), host: (u === 'switch' ? 'sw-' : u === 'patch' ? 'pp-' : 'srv-') + e.id.slice(-2).toLowerCase() + '-' + (k + 1) });
    });
    // the rack's draw is what is installed in it (hardware.js models); heat follows the load
    let kw = 0.3;
    e.units.forEach((u, k) => {
      if (!u) return;
      const m = DL.hwModel ? DL.hwModel(u, e.unitModel && e.unitModel[k]) : null;
      kw += m && m.power != null ? m.power : 0.42;
    });
    e.tel.power = Math.round(kw * 100) / 100;
    e.tel.temp = Math.round((24 + (kw - 0.3) * 1.6 + n * 0.25) * 10) / 10;
  }
  DL.syncRack = syncRack;

  DL.createBuilder = function (game) {
    const scene = game.scene, world = scene.world;
    const $ = (id) => document.getElementById(id);
    const el = { dock: $('build'), items: $('buildItems'), room: $('buildRoom'), style: $('buildStyle'), hint: $('buildHint'), insp: $('inspector'), tip: $('ghostTip') };
    const B = {
      active: false, tab: 'room', tool: 'select', def: null, rot: 0,
      roomTool: 'select', wallMat: 'solid', wd: null, shift: false, draw: null, resize: null, roomHover: null, roomReason: null, previewKey: '',
      ghost: null, move: null, sel: null, hover: null, roomIdx: 1,
      mouse: null, down: null, pan: null,
    };
    let seedN = 400;
    // Shift while dragging a wall erases instead of building
    addEventListener('keydown', (ev) => { if (ev.key === 'Shift') B.shift = true; });
    addEventListener('keyup', (ev) => { if (ev.key === 'Shift') B.shift = false; });
    addEventListener('blur', () => { B.shift = false; });

    /* ---------- items ---------- */
    function nextId(prefix, start) {
      for (let n = start || 1; ; n++) {
        const id = prefix + String(n).padStart(2, '0');
        if (!world.byId[id]) return id;
      }
    }

    function newItem(def, tx, ty, rot, preview) {
      const k = def.kind || def.id;
      const e = { kind: k, defId: def.id, tx, ty, tw: def.w || 1, th: def.h || 1, rot: def.rot ? rot || 0 : 0, solid: def.solid !== false, seed: preview ? 77 : seedN++ * 7 + 3, state: 'ok', built: true };
      if (def.set) Object.assign(e, JSON.parse(JSON.stringify(def.set)));
      if (def.mount === 'surface') e.solid = false;
      if (def.mount === 'wall') { e.wall = true; e.solid = false; }
      if (def.rug) e.rug = true;
      // turned to the east / west, a non-square floor footprint runs the other way
      if (DL.rotSide(e.rot) && !e.wall) { const w = e.tw; e.tw = e.th; e.th = w; }
      if (k === 'desk') e.chair = { kind: 'chair', tw: 2, th: 1, rot: e.rot, solid: false, parent: e, seed: e.seed + 1, built: true };
      if (k === 'desk' && def.setup) e.setup = def.setup;
      if (k === 'desk' && def.chair) e.chair.variant = def.chair;
      if (k === 'rack') { e.units = new Array(9).fill(null); e.unitModel = new Array(9).fill(null); }
      if (!preview) {
        if (k === 'rack') {
          e.id = nextId('RACK-N');
          Object.assign(e, { name: 'Rack ' + e.id.slice(5), short: e.id.slice(5), category: 'Rack de servidores' });
          initTel(e, 24, 0.3, 'kW', 0.2);
          syncRack(e);
        } else if (k === 'desk') {
          e.id = nextId('PC-');
          Object.assign(e, { name: 'Estação de trabalho', category: 'Computador' });
          initTel(e, 44, 120, 'W', 0.8);
        } else if (k === 'storage') {
          e.id = nextId('ST-', 5);
          const m = DL.hwModel('storage', e.model);
          Object.assign(e, { name: m.name + ' ' + e.id, category: 'Storage' });
          initTel(e, m.power < 0.2 ? 34 : 29, m.power, 'kW', 0.2);
        } else if (k === 'crac') {
          e.id = nextId('CRAC-', 4);
          Object.assign(e, { name: 'Ar-condicionado de precisão', category: 'Refrigeração' });
          initTel(e, 18.2, 6.2, 'kW', 0.15);
        }
      }
      return e;
    }

    function pos(e) {
      e.px = e.tx * T;
      e.py = e.ty * T;
      e.sortY = e.py + e.th * T;
      if (e.kind === 'chair') {
        e.cx = e.px + e.tw * 8;
        e.cy = e.py + (e.th - 1) * 8 + 11;
        e.sortY = e.cy;
      }
      if (isRug(e)) e.sortY = -100000 + e.py;
      if (e.wall) e.sortY = e.py - 6;
      if (e.host) e.sortY = e.host.sortY + (e.kind === 'monitor' && e.rot === 1 ? 0.6 : 0.01);
      DL.itemGeom(e);
      if (e.chair) {
        // the chair sits on the desk's front side: south (0), north (1), east (2) or west (3)
        const c = e.chair, r = e.rot | 0, side = DL.rotSide(r);
        c.rot = r;
        c.tw = side ? 1 : 2;
        c.th = side ? 2 : 1;
        c.tx = r === 2 ? e.tx + e.tw : r === 3 ? e.tx - 1 : e.tx;
        c.ty = r === 1 ? e.ty - 1 : r === 0 ? e.ty + e.th : e.ty;
        pos(c);
      }
      for (const s of surfaceOf(e)) {
        s.tx = e.tx + s.dx;
        s.ty = e.ty + s.dy;
        pos(s);
      }
    }

    const surfaceOf = (e) => (e.kind === 'table' ? world.items.filter((s) => s.host === e) : []);
    const groupOf = (e) => [e].concat(e.chair ? [e.chair] : [], surfaceOf(e));
    function cells(e) {
      const out = [];
      if (e.host) return out;
      // an L table leaves its inner corner free (for the chair)
      const hole = DL.itemHole ? DL.itemHole(e) : null;
      for (let j = 0; j < e.th; j++) for (let i = 0; i < e.tw; i++) if (!hole || hole[0] !== i || hole[1] !== j) out.push([e.tx + i, e.ty + j]);
      return out;
    }

    function lockReason(e) {
      if (!e || SKIP[e.kind]) return 'Este elemento faz parte da sala';
      return game.lockReason ? game.lockReason(e) : null;
    }

    function actorCells(skip) {
      const set = new Set();
      for (const a of game.actors()) {
        if (a.hidden || (skip && skip(a))) continue;
        for (const [ox, oy] of [[-5, -4], [5, -4], [-5, -1], [5, -1]]) set.add(Math.floor((a.x + ox) / T) + ',' + Math.floor((a.y + oy) / T));
      }
      return set;
    }

    // Returns null when the group can sit where it is, or a short reason why not.
    function check(group, exclude, skipActor) {
      if (group.length === 1 && group[0].kind === 'door') return doorCheck(group[0]);
      const occ = new Map(), rug = new Map(), wall = new Map();
      for (const e of world.items) {
        if (exclude.has(e) || e.host || SKIP[e.kind]) continue;
        const m = isRug(e) ? rug : e.wall ? wall : occ;
        for (const [x, y] of cells(e)) m.set(x + ',' + y, e);
      }
      const people = actorCells(skipActor);
      const tileAt = (x, y) => (x < 0 || y < 0 || x >= world.W || y >= world.H ? '#' : world.tiles[y * world.W + x]);
      for (const e of group) {
        const layer = isRug(e) ? rug : e.wall ? wall : occ;
        for (const [x, y] of cells(e)) {
          if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 'Fora da sala';
          const k = x + ',' + y, t = world.tiles[y * world.W + x];
          if (e.wall) {
            if (!FLOOR[t]) return 'Fora da sala';
            if (tileAt(x, y - 1) !== '#' || tileAt(x, y - 2) !== '#') return 'Encoste na parede do fundo da sala';
            if (layer.has(k)) return 'Já tem algo nesta parede';
            continue;
          }
          if (t === 'd' || t === 'D' || world.keepClear.has(k)) return 'Deixe a passagem da porta livre';
          if (t === 'w') return 'Tem uma parede aqui';
          if (!FLOOR[t]) return 'Fora da sala';
          if (layer.has(k)) return 'Espaço ocupado';
          if (!isRug(e) && people.has(k)) return 'Tem alguém neste lugar';
        }
      }
      return null;
    }

    function itemOnTile(tx, ty, pred) {
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || (pred && !pred(e))) continue;
        const hole = DL.itemHole ? DL.itemHole(e) : null;
        if (hole && tx === e.tx + hole[0] && ty === e.ty + hole[1]) continue;
        if (tx >= e.tx && tx < e.tx + e.tw && ty >= e.ty && ty < e.ty + e.th) return e;
      }
      return null;
    }

    // isometric: what is drawn under the cursor (tall things cover the floor behind them);
    // undefined when the point did not come from the mouse (automated placement)
    const underMouse = (wx, wy, pred) => {
      const m = B.mouse;
      if (!scene.iso || !m || m.wx !== wx || m.wy !== wy) return undefined;
      return scene.pickAt(m.sx, m.sy, pred);
    };

    function pick(wx, wy) {
      const hit = underMouse(wx, wy, (e) => !SKIP[e.kind] && !!e.bounds && world.items.indexOf(e) >= 0);
      if (hit !== undefined) return hit ? hit.parent || hit : null;
      const list = world.items.filter((e) => !SKIP[e.kind] && e.bounds).sort((a, b) => b.sortY - a.sortY);
      for (const e of list) {
        const b = e.bounds;
        if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) return e.parent || e;
      }
      const e = itemOnTile(Math.floor(wx / T), Math.floor(wy / T));
      return e ? e.parent || e : null;
    }

    /* ---------- commit ---------- */
    function commit(info) {
      info = info || {};
      const door = (l) => l && l.some((x) => x.kind === 'door');
      if (info.layout || door(info.added) || door(info.removed)) { info.layout = true; layout(world); }
      rebuildSolid(world);
      refreshIndex(world);
      world.version = (world.version || 0) + 1;
      scene.refreshWorld(!!info.layout);
      game.emit('world', info);
    }

    /* ---------- actions ---------- */
    function ghostAt(wx, wy) {
      const def = B.def;
      const m = B.mouse, live = scene.iso && m && m.wx === wx && m.wy === wy;
      if (live && def.mount === 'wall') {
        // aim at the back wall itself, not at the floor behind it
        const p = scene.wallPointAt(m.sx, m.sy);
        if (p) { wx = p.x; wy = p.y; }
      }
      let tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (live && (def.mount === 'rack' || def.mount === 'surface')) {
        const host = scene.pickAt(m.sx, m.sy, (e) => (def.mount === 'rack' ? e.kind === 'rack' && !!e.units : e.kind === 'table'));
        if (host && def.mount === 'rack') { tx = host.tx; ty = host.ty; }
        if (host && def.mount === 'surface') {
          // the tile of the table top under the cursor
          const p = scene.screenToWorld(m.sx, m.sy, DL.isoSurfaceTop ? DL.isoSurfaceTop(host) : 12);
          tx = Math.max(host.tx, Math.min(host.tx + host.tw - 1, Math.floor(p.x / T)));
          ty = Math.max(host.ty, Math.min(host.ty + host.th - 1, Math.floor(p.y / T)));
        }
      }
      if (def.mount === 'wallslot') {
        const d = doorGhost(tx, ty, def.len, B.rot);
        return { e: d.e, group: [d.e], tx: d.e.tx, ty: d.e.ty, reason: d.reason };
      }
      if (def.mount === 'rack') {
        const r = itemOnTile(tx, ty, (e) => e.kind === 'rack' && !!e.units);
        let reason = null;
        if (!r) reason = 'Clique em um rack modular';
        else if (lockReason(r)) reason = lockReason(r);
        else if (r.units.indexOf(null) < 0) reason = 'Rack cheio';
        return { mount: r, tx, ty, reason };
      }
      if (def.mount === 'surface') {
        const table = itemOnTile(tx, ty, (e) => e.kind === 'table');
        const e = newItem(def, tx, ty, B.rot, true);
        let reason = null;
        if (!table) reason = 'Coloque sobre uma mesa';
        else if (world.items.some((s) => s.host && s.tx === tx && s.ty === ty)) reason = 'Já tem algo aqui';
        if (table) { e.host = table; e.dx = tx - table.tx; e.dy = ty - table.ty; }
        pos(e);
        return { e, group: [e], table, tx, ty, reason };
      }
      const e = newItem(def, 0, 0, B.rot, true);
      e.tx = Math.round(wx / T - e.tw / 2);
      e.ty = Math.round(wy / T - e.th / 2);
      pos(e);
      const group = [e].concat(e.chair ? [e.chair] : []);
      return { e, group, tx: e.tx, ty: e.ty, reason: check(group, new Set()) };
    }

    /* ---------- money: placing buys, removing sells back at half price ---------- */
    const RESALE = 0.5;
    const company = () => (game.economy && game.economy.company) || null;
    // the player's own placements are paid; presets and theme decoration (api.place) come free
    // the economy may discount it (economy.js: the starter kit pays the first rack, server, switch…)
    const priceOf = (def) => (game.economy && game.economy.priceOf ? game.economy.priceOf(def) : def.price || 0);
    function pay(def) {
      const price = priceOf(def);
      if (B.free || !def.price) return 0;
      if (!price) { game.emit('purchase', { price: 0, name: def.name, def }); renderCatalogSoon(); return 0; }
      const co = company();
      if (co && co.cash < price) { nope('Saldo insuficiente · custa ' + DL.money(price)); return -1; }
      game.emit('purchase', { price, name: def.name, def });
      return price;
    }
    const renderCatalogSoon = () => setTimeout(() => { if (B.active && B.tab !== 'room' && B.tab !== 'style') renderCatalog(); }, 0);
    function refund(amount, name) {
      if (amount > 0 && !B.free) game.emit('refund', { amount: Math.round(amount * RESALE), name });
    }
    const unitValue = (r, k) => (r.unitCost && r.unitCost[k]) || 0;

    function place() {
      const gh = B.ghost;
      if (!gh) return;
      if (gh.reason) { nope(gh.reason); return; }
      const def = B.def;
      const cost = pay(def);
      if (cost < 0) return;
      if (def.mount === 'wallslot') {
        const d = makeDoor(gh.e.tx, gh.e.ty, gh.e.axis, gh.e.len, B.rot);
        d.cost = cost;
        world.items.push(d);
        commit({ added: [d] });
        game.sfx('place');
        return;
      }
      if (def.mount === 'rack') {
        const r = gh.mount, k = r.units.indexOf(null);
        r.units[k] = def.unit || def.id;
        r.unitModel = r.unitModel || new Array(9).fill(null);
        r.unitModel[k] = def.unit ? def.id : null;
        r.unitCost = r.unitCost || new Array(9).fill(0);
        r.unitCost[k] = cost;
        syncRack(r);
        commit({ installed: r });
        game.sfx('place');
        return;
      }
      const e = newItem(def, gh.tx, gh.ty, B.rot);
      e.cost = cost;
      if (def.mount === 'surface') { e.host = gh.table; e.dx = gh.tx - gh.table.tx; e.dy = gh.ty - gh.table.ty; }
      else { e.tx = gh.e.tx; e.ty = gh.e.ty; }
      pos(e);
      world.items.push(e);
      if (e.chair) world.items.push(e.chair);
      commit({ added: groupOf(e) });
      game.sfx('place');
    }

    function removeItem(e) {
      if (!e) return;
      e = e.parent || e;
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const group = groupOf(e);
      let back = 0;
      for (const x of group) {
        back += x.cost || 0;
        if (x.units) x.units.forEach((u, k) => { if (u) back += unitValue(x, k); });
      }
      world.items = world.items.filter((x) => group.indexOf(x) < 0);
      if (B.sel === e) select(null);
      commit({ removed: group });
      refund(back, DL.itemName(e));
      game.sfx('remove');
    }

    function removeUnit(r) {
      const k = r.units.map(Boolean).lastIndexOf(true);
      if (k < 0) return;
      const back = unitValue(r, k), name = DL.hwModel ? DL.hwModel(r.units[k], r.unitModel && r.unitModel[k]).name : r.units[k];
      r.units[k] = null;
      if (r.unitModel) r.unitModel[k] = null;
      if (r.unitCost) r.unitCost[k] = 0;
      syncRack(r);
      commit({ installed: r });
      refund(back, name);
    }

    function startMove(e, drag) {
      e = e.parent || e;
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const group = groupOf(e);
      B.move = {
        e, group, drag,
        orig: group.map((x) => ({ x, tx: x.tx, ty: x.ty, rot: x.rot, tw: x.tw, th: x.th, host: x.host, dx: x.dx, dy: x.dy, axis: x.axis })),
        offX: 0, offY: 0, reason: null,
      };
      if (B.mouse && !e.host && e.kind !== 'door') {
        B.move.offX = e.tx - Math.floor(B.mouse.wx / T);
        B.move.offY = e.ty - Math.floor(B.mouse.wy / T);
      }
      world.items = world.items.filter((x) => group.indexOf(x) < 0);
      select(null);
      B.tool = 'select';
      commit({ removed: group, moving: true });
      updateMove();
      syncUi();
    }

    function updateMove() {
      const m = B.move;
      if (!m || !B.mouse) return;
      const e = m.e, tx = Math.floor(B.mouse.wx / T), ty = Math.floor(B.mouse.wy / T);
      if (e.kind === 'door') {
        const d = doorGhost(tx, ty, e.len, e.rot);
        Object.assign(e, { tx: d.e.tx, ty: d.e.ty, axis: d.e.axis, tw: d.e.tw, th: d.e.th });
        pos(e);
        m.reason = d.reason;
        return;
      }
      if (e.host || (DEF[e.kind] && DEF[e.kind].mount === 'surface')) {
        const table = itemOnTile(tx, ty, (x) => x.kind === 'table');
        e.tx = tx; e.ty = ty;
        m.reason = !table ? 'Coloque sobre uma mesa' : world.items.some((s) => s.host && s.tx === tx && s.ty === ty) ? 'Já tem algo aqui' : null;
        if (table) { e.host = table; e.dx = tx - table.tx; e.dy = ty - table.ty; }
        pos(e);
        return;
      }
      e.tx = tx + m.offX;
      e.ty = ty + m.offY;
      pos(e);
      m.reason = check(m.group.filter((x) => !x.host), new Set(m.group));
    }

    function dropMove() {
      const m = B.move;
      if (!m) return;
      if (m.reason) {
        if (m.drag) cancelMove();
        else nope(m.reason);
        return;
      }
      B.move = null;
      world.items.push.apply(world.items, m.group);
      commit({ added: m.group, moved: true });
      select(m.e);
      game.sfx('place');
    }

    function cancelMove() {
      const m = B.move;
      if (!m) return;
      for (const o of m.orig) Object.assign(o.x, { tx: o.tx, ty: o.ty, rot: o.rot, tw: o.tw, th: o.th, host: o.host, dx: o.dx, dy: o.dy, axis: o.axis });
      B.move = null;
      world.items.push.apply(world.items, m.group);
      pos(m.e);
      commit({ added: m.group, moved: true });
    }

    // Everything on the floor or on a wall turns (doors have their own four states); rack units turn
    // with their rack, the room's own pieces (walls, glass) don't.
    function canTurn(e) {
      if (!e || SKIP[e.kind] || e.kind === 'wallseg') return false;
      const def = (e.defId && DEF[e.defId]) || DEF[e.kind];
      return !(def && def.rot === false);
    }

    // Next orientation, clockwise seen from above (S → W → N → E). East / west swap the footprint of
    // non-square floor objects; whatever stands on a table keeps its place on the turned top.
    function turn(e) {
      const was = e.rot | 0, next = DL.ROT_NEXT[was];
      e.rot = next;
      if (!e.wall && DL.rotSide(was) !== DL.rotSide(next)) {
        const w = e.tw;
        e.tw = e.th;
        e.th = w;
        for (const s of surfaceOf(e)) { const d = s.dx; s.dx = s.dy; s.dy = d; }
      }
    }

    function rotate(e) {
      e = e.parent || e;
      if (!canTurn(e)) { nope('Este elemento faz parte da sala'); return; }
      const why = lockReason(e);
      if (why) { nope(why); return; }
      if (e.kind === 'door') {
        // 4 orientations: hinge left/right × swings to one side or the other
        e.rot = (e.rot + 1) % 4;
        e.open = 1;
        commit({ rotated: e });
        game.sfx('place');
        return;
      }
      const before = { rot: e.rot, tw: e.tw, th: e.th, s: surfaceOf(e).map((s) => [s, s.dx, s.dy]) };
      turn(e);
      pos(e);
      const group = groupOf(e);
      // whoever is seated at this very station doesn't block it: they get up once it turns
      const seatedHere = (a) => !!(a.crew && a.crew.station && group.indexOf(a.crew.station.key) >= 0);
      const why2 = e.host ? null : check(group.filter((x) => !x.host), new Set(group), seatedHere);
      if (why2) {
        Object.assign(e, { rot: before.rot, tw: before.tw, th: before.th });
        for (const [s, dx, dy] of before.s) { s.dx = dx; s.dy = dy; }
        pos(e);
        nope('Sem espaço para girar · ' + why2.toLowerCase());
        return;
      }
      commit({ rotated: e, moved: true, added: group, removed: group });
      game.sfx('place');
      B.tipUntil = performance.now() + 900;
      B.tipText = 'Girado · ' + DL.ROT_LABEL[e.rot | 0];
    }

    function nope(msg) {
      B.tipUntil = performance.now() + 1400;
      B.tipText = msg;
      game.sfx('nope');
    }

    /* ---------- areas (floor) + rooms (what the walls enclose) ---------- */
    const cloneAreas = () => world.areas.map((r) => Object.assign({}, r));
    function roomName() {
      const used = new Set(world.rooms.map((r) => r.name).concat(world.areas.map((a) => a.name)));
      for (let n = world.rooms.length + 1; ; n++) if (!used.has('Sala ' + n)) return 'Sala ' + n;
    }
    const tileAt = (x, y) => (x < 0 || y < 0 || x >= world.W || y >= world.H ? '#' : world.tiles[y * world.W + x]);
    const roomIndexAt = (tx, ty) => (tx >= 0 && ty >= 0 && tx < world.W && ty < world.H ? world.roomAt[ty * world.W + tx] : -1);

    // The floor area a room mostly sits on (the one the size controls and edge handles act on).
    function areaOfRoom(i) {
      const r = world.rooms[i];
      if (!r) return -1;
      const cnt = new Map();
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (world.roomAt[y * world.W + x] !== i) continue;
          const a = world.areaAt[y * world.W + x];
          if (a >= 0) cnt.set(a, (cnt.get(a) || 0) + 1);
        }
      }
      let best = -1, bn = 0;
      for (const [a, n] of cnt) if (n > bn) { bn = n; best = a; }
      return best;
    }

    function occupied(opts) {
      const occ = new Set();
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        if (opts && opts.solidOnly && (isRug(e) || e.wall)) continue;
        for (const [x, y] of cells(e)) occ.add(tkey(x, y));
      }
      return occ;
    }

    // Dry run of a new area set (and lot). Returns { reason } or { tmp, lot } ready to apply.
    function planRooms(next, opts) {
      opts = opts || {};
      const lot = opts.lot || world.lot;
      for (const r of next) {
        if (r.w < LIM.minW || r.h < LIM.minH) return { reason: 'Tamanho mínimo: ' + LIM.minW + ' × ' + LIM.minH };
        if (r.w > LIM.maxW || r.h > LIM.maxH) return { reason: 'Tamanho máximo: ' + LIM.maxW + ' × ' + LIM.maxH };
        if (lot) {
          if (r.x < 1 || r.y < 2 || r.x + r.w + 1 > lot.w || r.y + r.h + 1 > lot.h) return { reason: 'Fora do terreno · expanda o terreno primeiro' };
        } else if (r.x + r.w + 1 > LIM.mapW || r.y + r.h + 1 > LIM.mapH) return { reason: 'Limite do terreno' };
      }
      for (let i = 0; i < next.length; i++) {
        for (let j = i + 1; j < next.length; j++) {
          if (tooClose(next[i], next[j])) return { reason: opts.overlap || 'Encostaria em outro espaço' };
        }
      }
      if (!connected(next)) return { reason: 'Encoste a área em outra, com uma parede entre elas' };
      const tmp = {
        areas: next, perf: world.perf, items: world.items, lot, wallSet: new Map(world.wallSet), gapsSeen: world.gapsSeen,
        rooms: world.rooms, roomAt: world.roomAt, W: world.W, H: world.H,
      };
      layout(tmp);
      doorsForFresh(tmp, occupied());
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        for (const [x, y] of cells(e)) {
          const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
          if (!FLOOR[t] || tmp.keepClear.has(tkey(x, y))) return { reason: opts.msg || 'Há objetos no caminho. Mova-os antes.' };
        }
      }
      for (const a of game.actors()) {
        const x = Math.floor(a.x / T), y = Math.floor((a.y - 2) / T);
        const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
        if (t === '#' || t === 'w') return { reason: 'Tem alguém nessa área' };
      }
      return { tmp, lot };
    }

    function applyPlan(next, plan) {
      world.areas = next;
      world.wallSet = plan.tmp.wallSet;
      world.gapsSeen = plan.tmp.gapsSeen;
      world.items = plan.tmp.items.filter((e) => e.kind !== 'wallseg');
      if (plan.lot) world.lot = plan.lot;
      commit({ layout: true });
    }

    function tryRooms(next, msg, opts) {
      const plan = planRooms(next, Object.assign({ msg }, opts));
      if (plan.reason) return nope(plan.reason), false;
      applyPlan(next, plan);
      game.sfx('place');
      return true;
    }

    const selArea = () => areaOfRoom(B.roomIdx);
    function selectRoomById(id) {
      const i = world.rooms.findIndex((r) => r.id === id);
      if (i >= 0) B.roomIdx = i;
    }

    function resizeRoom(i, dw, dh) {
      const ai = areaOfRoom(i), a = world.areas[ai];
      if (!a) return;
      if (a.fixed) { nope('O NOC tem tamanho fixo'); return; }
      const id = world.rooms[i].id;
      const next = cloneAreas();
      next[ai].w += dw;
      next[ai].h += dh;
      if (tryRooms(next, dw < 0 || dh < 0 ? 'Há objetos junto à parede. Mova-os antes de reduzir.' : null)) selectRoomById(id);
      renderRoom();
    }

    function setRoomRect(ai, rect) {
      const next = cloneAreas();
      Object.assign(next[ai], rect);
      const id = world.rooms[B.roomIdx] && world.rooms[B.roomIdx].id;
      const ok = tryRooms(next, 'Há objetos junto à parede. Mova-os antes de reduzir.');
      if (ok && id) selectRoomById(id);
      renderRoom();
      return ok;
    }

    function addRoom(i, side) {
      const r = world.areas[Math.max(0, areaOfRoom(i))];
      const nr = side === 'e'
        ? { x: r.x + r.w + 1, y: r.y, w: 9, h: Math.min(r.h, 10) }
        : { x: r.x, y: r.y + r.h + 1, w: Math.min(r.w, 12), h: 7 };
      Object.assign(nr, { id: newRoomId(), name: roomName(), floor: 'tile' });
      const next = cloneAreas();
      next.push(nr);
      if (tryRooms(next)) {
        selectRoomById(nr.id);
        game.toast('ok', 'Nova sala', nr.name + ' · ' + nr.w + ' × ' + nr.h);
        game.focus((nr.x + nr.w / 2) * T, (nr.y + nr.h / 2) * T);
      }
      renderRoom();
    }

    // A drawn rectangle touching another area edge-to-edge gives up one tile for the wall.
    function snapRect(rc) {
      const r = Object.assign({}, rc);
      for (const o of world.areas) {
        const ys = r.y < o.y + o.h && o.y < r.y + r.h, xs = r.x < o.x + o.w && o.x < r.x + r.w;
        if (ys && r.x === o.x + o.w) { r.x += 1; r.w -= 1; }
        if (ys && r.x + r.w === o.x) r.w -= 1;
        if (xs && r.y === o.y + o.h) { r.y += 1; r.h -= 1; }
        if (xs && r.y + r.h === o.y) r.h -= 1;
      }
      return r;
    }

    function drawRect() {
      const d = B.draw;
      return snapRect({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0) + 1, h: Math.abs(d.y1 - d.y0) + 1 });
    }

    function planNewRoom(rc) {
      const nr = Object.assign({ id: 'new', name: roomName(), floor: 'tile' }, rc);
      return { nr, plan: planRooms(cloneAreas().concat(nr), { overlap: 'Sobrepõe outro espaço · deixe 1 tile de parede' }) };
    }

    function createRoom(rc) {
      const { nr, plan } = planNewRoom(rc);
      if (plan.reason) { nope(plan.reason); return false; }
      nr.id = newRoomId();
      const next = cloneAreas().concat(nr);
      if (!tryRooms(next)) return false;
      selectRoomById(nr.id);
      game.toast('ok', 'Nova sala', nr.name + ' · ' + nr.w + ' × ' + nr.h + ' · porta criada na divisória');
      renderRoom();
      return true;
    }

    function removeRoom(i) {
      const ai = areaOfRoom(i), r = world.areas[ai];
      if (!r || r.fixed || r.id === 'hall') { nope('Este espaço não pode ser removido'); return; }
      if (world.areas.length < 2) { nope('Mantenha pelo menos uma área'); return; }
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        if (cells(e).some(([x, y]) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) { nope('Esvazie a área antes de removê-la'); return; }
      }
      const next = cloneAreas();
      next.splice(ai, 1);
      if (tryRooms(next)) B.roomIdx = Math.min(B.roomIdx, world.rooms.length - 1);
      renderRoom();
    }

    function toggleFloor(i) {
      const r = world.rooms[i];
      if (!r) return;
      r.floor = r.floor === 'carpet' ? 'tile' : 'carpet';
      commit({ layout: true });
      game.sfx('place');
      renderRoom();
    }

    // Land costs company money (economy.js): the starting lot is free, each expansion is paid per new m²
    // and gets dearer with the lot's size and the floor already built. `paid` = the player's buttons
    // (presets and automated checks call it free, like api.place).
    const builtArea = () => world.areas.reduce((s, a) => s + a.w * a.h, 0);
    function lotQuote(dw, dh) {
      if (!world.lot || (dw <= 0 && dh <= 0)) return 0;
      const eco = game.economy;
      if (eco && eco.lotCost) return eco.lotCost(world.lot, dw, dh, builtArea());
      return DL.lotPrice ? DL.lotPrice(world.lot, dw, dh, builtArea()) : 0;
    }
    function resizeLot(dw, dh, paid) {
      if (!world.lot) { nope('Este mapa não tem terreno livre'); return false; }
      const lot = { w: world.lot.w + dw, h: world.lot.h + dh };
      if (lot.w > LIM.mapW || lot.h > LIM.mapH) { nope('Limite do terreno: ' + LIM.mapW + ' × ' + LIM.mapH); return false; }
      if (lot.w < 6 || lot.h < 6) { nope('Terreno mínimo: 6 × 6'); return false; }
      const next = cloneAreas(), plan = planRooms(next, { lot });
      if (plan.reason) { nope(plan.reason); renderRoom(); return false; }
      const grow = dw > 0 || dh > 0;
      if (paid && grow && game.economy && game.economy.lotCharge) {
        const why = game.economy.lotCharge(world.lot, dw, dh, builtArea());
        if (why) { nope(why); game.toast('warn', 'Expansão recusada', why); renderRoom(); return false; }
      }
      applyPlan(next, plan);
      game.sfx('place');
      if (grow) game.focus(dw > 0 ? (lot.w - 3) * T : scene.cam.x, dh > 0 ? (lot.h - 3) * T : scene.cam.y);
      game.emit('lot', { lot: world.lot, dw, dh, paid: !!paid });
      renderRoom();
      return true;
    }

    /* ---------- room types (names + a matching look) ---------- */
    const ROOM_TYPES = [
      { id: 'noc', label: 'NOC', name: 'NOC', theme: 'noc', floor: 'carpet' },
      { id: 'servers', label: 'Servidores', name: 'Sala de servidores', theme: 'servers', floor: 'tile' },
      { id: 'office', label: 'Escritório', name: 'Escritório', theme: 'corporate', floor: 'carpet' },
      { id: 'reception', label: 'Recepção', name: 'Recepção', theme: 'minimal', floor: 'carpet' },
      { id: 'power', label: 'Sala elétrica', name: 'Sala elétrica', theme: 'industrial', floor: 'tile' },
      { id: 'support', label: 'Atendimento', name: 'Central de atendimento', theme: 'corporate', floor: 'carpet' },
      { id: 'custom', label: 'Personalizada', name: null, theme: null, floor: null },
    ];
    DL.ROOM_TYPES = ROOM_TYPES;
    const isDefaultName = (r) => /^(Sala|Corredor) \d+$/.test(r.name) || ROOM_TYPES.some((t) => t.name && (r.name === t.name || r.name.indexOf(t.name + ' ') === 0));

    function setRoomType(i, id) {
      const r = world.rooms[i], ty = ROOM_TYPES.find((t) => t.id === id);
      if (!r || !ty) return;
      r.type = id;
      if (ty.name && isDefaultName(r)) {
        const used = new Set(world.rooms.filter((x) => x !== r).map((x) => x.name));
        let n = ty.name;
        for (let k = 2; used.has(n); k++) n = ty.name + ' ' + k;
        r.name = n;
      }
      if (ty.theme && (!r.style || r.style.fromTheme)) { r.theme = ty.theme; delete r.style; }
      if (ty.floor) r.floor = ty.floor;
      commit({ layout: true, restyle: true });
      game.emit('style-room', B.roomIdx);
      game.sfx('place');
      renderRoom();
      if (id === 'custom') {
        const inp = el.room.querySelector('[data-room-name]');
        if (inp) { inp.focus(); inp.select(); }
      }
    }

    function renameRoom(i, name) {
      const r = world.rooms[i];
      name = String(name || '').trim().slice(0, 24);
      if (!r || !name || name === r.name) return;
      r.name = name;
      commit({ renamed: r });
      renderRoom();
    }

    /* ---------- free walls: drag a straight line (or a box) on the grid ---------- */
    function linePath(x0, y0, x1, y1) {
      const pts = [];
      if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) { const s = Math.sign(x1 - x0) || 1; for (let x = x0; ; x += s) { pts.push([x, y0]); if (x === x1) break; } }
      else { const s = Math.sign(y1 - y0) || 1; for (let y = y0; ; y += s) { pts.push([x0, y]); if (y === y1) break; } }
      return pts;
    }
    function boxPath(x0, y0, x1, y1) {
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
      if (ax === bx || ay === by) return linePath(ax, ay, bx, by);
      const pts = [];
      for (let x = ax; x <= bx; x++) { pts.push([x, ay]); pts.push([x, by]); }
      for (let y = ay + 1; y < by; y++) { pts.push([ax, y]); pts.push([bx, y]); }
      return pts;
    }

    // Plan for the wall currently being dragged: each tile is new / skip / bad / del.
    function wallPlan(wd) {
      const erase = wd.erase;
      const pts = wd.box ? boxPath(wd.x0, wd.y0, wd.x1, wd.y1) : linePath(wd.x0, wd.y0, wd.x1, wd.y1);
      const axisOf = (x, y) => {
        if (wd.box) {
          const ax = Math.min(wd.x0, wd.x1), bx = Math.max(wd.x0, wd.x1), ay = Math.min(wd.y0, wd.y1), by = Math.max(wd.y0, wd.y1);
          return (y === ay || y === by ? 'h' : '') + (x === ax || x === bx ? 'v' : '');
        }
        return pts.length < 2 ? '' : pts[0][1] === pts[1][1] ? 'h' : 'v';
      };
      const occ = erase ? null : occupied(), people = erase ? null : actorCells();
      const tiles = [];
      let reason = null, n = 0;
      for (const [x, y] of pts) {
        const t = tileAt(x, y), k = tkey(x, y);
        let st = 'skip', why = null;
        if (erase) {
          if (t === 'w' || t === 'd' || t === 'D') st = 'del';
        } else if (t === '#' || t === 'w' || t === 'd' || t === 'D') st = 'skip';
        else if (occ.has(k)) { st = 'bad'; why = 'Tem um objeto no caminho da parede'; }
        else if (world.keepClear.has(k)) { st = 'bad'; why = 'Deixe a passagem da porta livre'; }
        else if (people.has(k)) { st = 'bad'; why = 'Tem alguém no caminho'; }
        else st = 'new';
        if (why && !reason) reason = why;
        if (st === 'new' || st === 'del') n++;
        tiles.push({ x, y, st, ax: axisOf(x, y), wall: t === 'w' });
      }
      if (!reason && !n) reason = erase ? 'Nenhuma parede aqui' : pts.every(([x, y]) => tileAt(x, y) === '#') ? 'Desenhe sobre o piso da construção' : 'Já tem parede aqui';
      const len = wd.box ? (Math.abs(wd.x1 - wd.x0) + 1) + ' × ' + (Math.abs(wd.y1 - wd.y0) + 1) : pts.length + (pts.length === 1 ? ' tile' : ' tiles');
      return { tiles, reason, n, info: (erase ? 'Apagar · ' : wd.box ? 'Cômodo · ' : 'Parede · ') + len };
    }

    function applyWall(wd) {
      const p = wallPlan(wd);
      if (p.reason) { nope(p.reason); return false; }
      const before = new Set(world.rooms.map((r) => r.id));
      if (wd.erase) {
        const gone = new Set(p.tiles.filter((t) => t.st === 'del').map((t) => tkey(t.x, t.y)));
        for (const k of gone) world.wallSet.delete(k);
        world.items = world.items.filter((e) => e.kind !== 'door' || !doorCells(e).some(([x, y]) => gone.has(tkey(x, y))));
        if (B.sel && B.sel.kind === 'door' && world.items.indexOf(B.sel) < 0) select(null);
        commit({ layout: true, walls: true });
        game.sfx('remove');
        return true;
      }
      for (const t of p.tiles) {
        const k = tkey(t.x, t.y);
        if (t.st === 'new') world.wallSet.set(k, wallVal(B.wallMat, t.ax));
        else if (t.wall && t.ax) {
          // crossing or continuing an existing wall turns that tile into a junction
          const v = world.wallSet.get(k), ax = wallAx(v);
          if (ax.indexOf(t.ax) < 0) world.wallSet.set(k, wallVal(wallMat(v), (ax + t.ax).split('').sort().join('')));
        }
      }
      commit({ layout: true, walls: true });
      game.sfx('place');
      const born = world.rooms.filter((r) => !before.has(r.id));
      if (born.length) {
        const shut = born.find((r) => !r.doors);
        game.toast('ok', 'Sala formada', born.map((r) => r.name).join(', ') + (shut ? ' · coloque uma porta para entrar' : ''));
      }
      return true;
    }

    /* ---------- doors ---------- */
    // Which way the wall runs at a tile: floor above + below → horizontal wall.
    function wallAxisAt(x, y) {
      const fl = (a, b) => !!FLOOR[tileAt(a, b)];
      if (fl(x, y - 1) && fl(x, y + 1)) return 'h';
      if (fl(x - 1, y) && fl(x + 1, y)) return 'v';
      const wl = (a, b) => { const t = tileAt(a, b); return t === 'w' || t === 'd' || t === 'D'; };
      return wl(x - 1, y) || wl(x + 1, y) ? 'h' : 'v';
    }

    function doorCheck(e) {
      const occ = occupied({ solidOnly: true }), people = actorCells();
      for (const [x, y] of cells(e)) {
        const t = tileAt(x, y);
        if (t === 'd' || t === 'D') return 'Já tem uma porta aqui';
        if (t === '#') return 'Portas vão nas paredes internas';
        if (t !== 'w') return 'Coloque a porta sobre uma parede';
        const sides = e.axis === 'h' ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
        for (const [sx, sy] of sides) {
          if (!FLOOR[tileAt(sx, sy)]) return 'A porta precisa de piso dos dois lados';
          if (occ.has(tkey(sx, sy))) return 'Tem um objeto na frente da porta';
        }
      }
      for (const [x, y] of cells(e)) if (people.has(tkey(x, y))) return 'Tem alguém aqui';
      return null;
    }

    function doorGhost(tx, ty, len, rot) {
      const axis = wallAxisAt(tx, ty);
      let e = makeDoor(tx, ty, axis, len, rot), reason = doorCheck(e);
      if (reason && len > 1) {
        const e2 = makeDoor(axis === 'h' ? tx - 1 : tx, axis === 'h' ? ty : ty - 1, axis, len, rot), r2 = doorCheck(e2);
        if (!r2) { e = e2; reason = null; }
      }
      return { e, reason };
    }

    // Doors swing open when someone comes close (or stay open when held) and close behind them.
    let doorClock = 0;
    function tickDoors() {
      const now = performance.now(), dt = doorClock ? Math.min(0.1, (now - doorClock) / 1000) : 0;
      doorClock = now;
      const doors = world.items.filter((e) => e.kind === 'door');
      if (!doors.length) return;
      const people = game.actors().filter((a) => !a.hidden);
      for (const d of doors) {
        const cx = d.px + d.tw * 8, cy = d.py + d.th * 8 + 2;
        let near = d.hold;
        for (const a of people) if (Math.abs(a.x - cx) < d.tw * 8 + 12 && Math.abs(a.y - cy) < d.th * 8 + 14) { near = true; break; }
        const target = near ? 1 : 0;
        d.open = (d.open || 0) + (target - (d.open || 0)) * Math.min(1, dt * (near ? 9 : 4));
      }
    }

    // Grab handles on the selected room's floor area edges (world px).
    function edgeAt(wx, wy) {
      const r = world.areas[selArea()];
      if (!r || r.fixed) return null;
      const L = r.x * T, Rr = (r.x + r.w) * T, Tp = r.y * T, Bt = (r.y + r.h) * T, m = 6;
      const inY = wy > Tp - m && wy < Bt + m, inX = wx > L - m && wx < Rr + m;
      let e = '';
      if (inY && Math.abs(wy - Tp) < m) e += 't';
      else if (inY && Math.abs(wy - Bt) < m) e += 'b';
      if (inX && Math.abs(wx - L) < m) e += 'l';
      else if (inX && Math.abs(wx - Rr) < m) e += 'r';
      return e || null;
    }

    function resizeRect() {
      const z = B.resize, r = world.areas[z.i], tx = Math.round(B.mouse.wx / T), ty = Math.round(B.mouse.wy / T);
      let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (z.edge.indexOf('l') >= 0) x0 = Math.min(tx, x1 - LIM.minW);
      if (z.edge.indexOf('r') >= 0) x1 = Math.max(tx, x0 + LIM.minW);
      if (z.edge.indexOf('t') >= 0) y0 = Math.min(ty, y1 - LIM.minH);
      if (z.edge.indexOf('b') >= 0) y1 = Math.max(ty, y0 + LIM.minH);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    function roomPreview() {
      const key = JSON.stringify([B.draw, B.resize && B.resize.rect, B.wd, B.wallMat, world.version]);
      if (key === B.previewKey) return;
      B.previewKey = key;
      if (B.draw) {
        const rc = drawRect();
        B.draw.rect = rc;
        B.roomReason = planNewRoom(rc).plan.reason || null;
      } else if (B.resize) {
        const next = cloneAreas();
        Object.assign(next[B.resize.i], B.resize.rect);
        B.roomReason = planRooms(next, { msg: 'Há objetos junto à parede' }).reason || null;
      } else if (B.wd) {
        B.wd.plan = wallPlan(B.wd);
        B.roomReason = B.wd.plan.reason;
      }
    }

    /* ---------- selection ---------- */
    function select(e) {
      B.sel = e ? e.parent || e : null;
      renderInspector();
    }

    /* ---------- UI ---------- */
    function thumb(def) {
      const c = document.createElement('canvas');
      const SZ = 48, k = 2;
      c.width = SZ * k;
      c.height = SZ * k;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.setTransform(k, 0, 0, k, 0, 0);
      let e;
      if (def.thumb) e = { kind: def.thumb, px: 8, py: 16, tw: 1, th: 1, seed: 3, model: def.unit ? def.id : null };
      else {
        e = newItem(def, 0, 0, 0, true);
        const w = e.tw * T, h = e.th * T;
        e.tx = 0; e.ty = 0;
        pos(e);
        const ox = Math.round((SZ - w) / 2), oy = SZ - 4 - h;
        g.translate(ox, def.mount === 'surface' ? 32 : oy);
        if (def.id === 'desk') g.translate(0, -2);
        if (def.id === 'rug') g.translate(0, 0);
      }
      DL.drawItem(g, e, 0.6);
      if (e.chair) DL.drawItem(g, e.chair, 0.6);
      return c;
    }

    // group chips above the items (a bigger catalog stays easy to browse)
    el.groups = document.createElement('div');
    el.groups.className = 'cat-groups';
    el.items.parentNode.insertBefore(el.groups, el.items);
    el.groups.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-group]');
      if (!b) return;
      B.group = b.dataset.group || null;
      renderCatalog();
      b.blur();
    });
    const thumbs = new Map();
    function renderCatalog() {
      const defs = CATALOG.filter((d) => d.cat === B.tab);
      const groups = [];
      for (const d of defs) if (d.group && groups.indexOf(d.group) < 0) groups.push(d.group);
      if (B.group && groups.indexOf(B.group) < 0) B.group = null;
      el.groups.hidden = groups.length < 2;
      el.groups.innerHTML = groups.length < 2 ? '' : ['<button type="button" class="chip chip--xs' + (!B.group ? ' is-on' : '') + '" data-group="">Todos <span class="mono">' + defs.length + '</span></button>']
        .concat(groups.map((gname) => '<button type="button" class="chip chip--xs' + (B.group === gname ? ' is-on' : '') + '" data-group="' + gname + '">' + gname + '</button>')).join('');
      el.items.innerHTML = '';
      for (const def of defs) {
        if (B.group && def.group !== B.group) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cat-item' + (B.def === def ? ' is-on' : '');
        b.dataset.def = def.id;
        const price = def.price ? priceOf(def) : 0;
        b.title = def.desc + (def.price ? ' · ' + (price ? DL.money(price) : 'grátis (kit inicial)') : '');
        if (!thumbs.has(def.id)) thumbs.set(def.id, thumb(def));
        const c = thumbs.get(def.id), cv = document.createElement('canvas');
        cv.width = c.width; cv.height = c.height;
        cv.getContext('2d').drawImage(c, 0, 0);
        b.appendChild(cv);
        const s = document.createElement('span');
        s.textContent = def.name;
        b.appendChild(s);
        if (def.price) {
          const p = document.createElement('em');
          p.className = 'cat-item__price' + (price ? '' : ' is-free');
          p.textContent = price ? DL.money(price) : 'Kit · grátis';
          b.appendChild(p);
        }
        el.items.appendChild(b);
      }
    }

    const ROOM_TOOLS = [['select', 'Selecionar'], ['draw', 'Nova sala'], ['wall', 'Parede'], ['box', 'Cômodo'], ['erase', 'Apagar parede'], ['door', 'Porta'], ['door2', 'Porta dupla']];
    const WALL_MATS = [['solid', 'Alvenaria'], ['glass', 'Vidro']];
    const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    // Espaços: the tool row always; below it only what the chosen tool needs. With "Selecionar":
    // the rooms, the selected room's settings and the land. Wall tools: the material. Others: nothing.
    function renderRoom() {
      if (B.tab !== 'room') return;
      const rooms = world.rooms;
      B.roomIdx = Math.max(0, Math.min(B.roomIdx, rooms.length - 1));
      const r = rooms[B.roomIdx], ai = areaOfRoom(B.roomIdx), a = world.areas[ai];
      const step = (label, key, val, off) =>
        '<div class="stepper"><span class="eyebrow-sm">' + label + '</span><button type="button" class="btn btn--sm" data-room="' + key + '-"' + (off ? ' disabled' : '') + ' aria-label="Diminuir ' + label + '">−</button><b>' + val + '</b><button type="button" class="btn btn--sm" data-room="' + key + '+"' + (off ? ' disabled' : '') + ' aria-label="Aumentar ' + label + '">+</button></div>';
      let h = '<div class="room-tools seg" role="toolbar" aria-label="Ferramentas de espaço">';
      for (const [id, label] of ROOM_TOOLS) h += '<button type="button" class="seg__b' + (B.roomTool === id ? ' is-on' : '') + '" data-room-tool="' + id + '">' + label + '</button>';
      h += '</div>';
      if (B.roomTool === 'wall' || B.roomTool === 'box') {
        h += '<div class="room-sec room-mats"><span class="eyebrow-sm">Material <kbd>R</kbd></span>' + WALL_MATS.map(([id, l]) => '<button type="button" class="chip chip--xs' + (B.wallMat === id ? ' is-on' : '') + '" data-wall-mat="' + id + '">' + l + '</button>').join('') + '</div>';
      }
      const ask = B.lotAsk;
      if (B.roomTool === 'select') {
        // rooms
        h += '<div class="room-sec"><span class="eyebrow-sm room-sec__k">Salas</span><div class="room-list">';
        rooms.forEach((x, k) => {
          h += '<button type="button" class="chip chip--xs' + (k === B.roomIdx ? ' is-on' : '') + (x.doors ? '' : ' is-warn') + '" data-room-pick="' + k + '"' + (x.doors ? '' : ' title="Sala sem porta"') + '>' + esc(x.name) + ' <span class="mono">' + (x.n === x.w * x.h ? x.w + '×' + x.h : x.n + ' m²') + '</span>' + (x.doors || rooms.length < 2 ? '' : ' <span class="room-nodoor">sem porta</span>') + '</button>';
        });
        h += '</div></div>';
        // the selected room: name, type, size, floor (the rarer actions behind "Mais")
        if (r) {
          h += '<div class="room-sec room-edit"><input class="input input--sm" data-room-name type="text" maxlength="24" value="' + esc(r.name) + '" spellcheck="false" autocomplete="off" aria-label="Nome da sala">' +
            '<label class="room-type"><span class="eyebrow-sm">Tipo</span><select class="input input--sm" data-room-type-sel aria-label="Tipo da sala">' +
            (r.type ? '' : '<option value="" selected>—</option>') + ROOM_TYPES.map((t) => '<option value="' + t.id + '"' + (r.type === t.id ? ' selected' : '') + '>' + t.label + '</option>').join('') + '</select></label>';
          if (a) h += step('L', 'w', a.w, a.fixed) + step('A', 'h', a.h, a.fixed);
          h += '<button type="button" class="btn btn--sm room-more' + (B.roomMore ? ' is-on' : '') + '" data-room-more="1" aria-expanded="' + (B.roomMore ? 'true' : 'false') + '">Mais ' + (B.roomMore ? '▴' : '▾') + '</button></div>';
          if (B.roomMore) {
            h += '<div class="room-sec room-extra"><button type="button" class="btn btn--sm" data-room="floor">Piso · ' + (r.floor === 'carpet' ? 'carpete' : 'técnico') + '</button>';
            if (!world.lot) h += '<button type="button" class="btn btn--sm" data-room="add-e">+ Espaço a leste</button><button type="button" class="btn btn--sm" data-room="add-s">+ Espaço ao sul</button>';
            if (a && !a.fixed && a.id !== 'hall' && world.areas.length > 1) h += '<button type="button" class="btn btn--sm btn--danger" data-room="del">Remover área</button>';
            h += '</div>';
          }
        }
        // the land
        if (world.lot) {
          const pw = lotQuote(4, 0), ph = lotQuote(0, 4), lbl = (p) => (p ? DL.money(p) : 'grátis');
          h += '<div class="room-sec room-lot"><span class="eyebrow-sm room-sec__k">Terreno</span>' +
            step('Larg.', 'lw', world.lot.w, false) + step('Alt.', 'lh', world.lot.h, false) +
            '<span class="lot-prices" title="O preço sobe com o tamanho do terreno e com a área construída">+4 larg. <b>' + lbl(pw) + '</b> · +4 alt. <b>' + lbl(ph) + '</b></span></div>';
        }
      }
      if (B.lotBusy) h += '<div class="lot-ask" role="status"><span>Confirmando a compra do terreno com o servidor…</span></div>';
      if (ask && world.lot) {
        const price = lotQuote(ask.dw, ask.dh), co = company(), after = co ? co.cash - price : 0;
        const nw = world.lot.w + ask.dw, nh = world.lot.h + ask.dh, add = nw * nh - world.lot.w * world.lot.h;
        h += '<div class="lot-ask" role="alertdialog" aria-label="Confirmar expansão do terreno"><span>Expandir o terreno para <b>' + nw + ' × ' + nh + '</b> (+' + add + ' m²) ' + (price ? 'por ' : '— ') + '<b class="lot-ask__price">' + (price ? DL.money(price) : 'grátis · kit inicial') + '</b>' +
          (co && price ? ' · caixa depois: <b class="' + (after < 0 ? 'is-neg' : '') + '">' + DL.money(after) + '</b>' : '') + '</span>' +
          '<button type="button" class="btn btn--sm btn--primary" data-room="lot-ok"' + (co && after < 0 ? ' disabled' : '') + '>Confirmar</button><button type="button" class="btn btn--sm" data-room="lot-no">Cancelar</button></div>';
      }
      el.room.innerHTML = h;
    }

    const isWallTool = () => B.roomTool === 'wall' || B.roomTool === 'box' || B.roomTool === 'erase';
    function setRoomTool(t) {
      if (B.move) cancelMove();
      B.roomTool = t;
      B.draw = null;
      B.resize = null;
      B.wd = null;
      B.roomReason = null;
      B.roomHover = null;
      const def = t === 'door' || t === 'door2' ? DEF[t] : null;
      B.def = def;
      B.rot = 0;
      B.ghost = def && B.mouse ? ghostAt(B.mouse.wx, B.mouse.wy) : null;
      if (def) select(null);
      renderRoom();
      syncUi();
    }

    function renderInspector() {
      const e = B.sel;
      if (!e || !B.active) { el.insp.classList.remove('is-on'); return; }
      const why = lockReason(e);
      let h = '<div class="insp__head"><span class="eyebrow-sm">' + DL.itemName(e) + '</span>' + (e.id ? '<b>' + e.id + '</b>' : '') + '</div>';
      if (why) h += '<p class="insp__note">' + why + '</p>';
      else {
        h += '<div class="insp__actions">';
        h += '<button type="button" class="btn btn--sm" data-ins="move">Mover <kbd>M</kbd></button>';
        if (canTurn(e)) h += '<button type="button" class="btn btn--sm" data-ins="rotate" title="' + (e.kind === 'door' ? 'Troca o lado da dobradiça e da abertura' : DL.ROT_LABEL[e.rot | 0]) + '">Girar <kbd>R</kbd></button>';
        h += '<button type="button" class="btn btn--sm" data-ins="remove">Remover <kbd>Del</kbd></button></div>';
        if (e.kind === 'door') {
          h += '<p class="insp__note">' + (e.axis === 'h' ? 'Parede horizontal' : 'Parede vertical') + ' · abre sozinha quando alguém chega · <button type="button" class="linkbtn" data-ins="hold">' + (e.hold ? 'deixar fechar' : 'manter aberta') + '</button></p>';
        }
        const opts = DL.ITEM_STYLES && DL.ITEM_STYLES[e.kind];
        if (opts) {
          h += '<div class="insp__style">';
          for (const o of opts) {
            const cur = DL.itemStyleGet(e, o.key) || '';
            h += '<div class="insp__srow"><span class="eyebrow-sm">' + o.label + '</span>';
            if (o.options) h += o.options.map(([v, l]) => '<button type="button" class="chip chip--xs' + (cur === v ? ' is-on' : '') + '" data-sty="' + o.key + '" data-v="' + v + '">' + l + '</button>').join('');
            else h += o.colors.map((c) => '<button type="button" class="swatch swatch--xs' + (cur === c ? ' is-on' : '') + '" data-sty="' + o.key + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('');
            h += '</div>';
          }
          h += '</div>';
        }
        // skins from the inventory: this rack / storage can wear its own (inventory.js)
        if (DL.inspectorSkin) h += DL.inspectorSkin(e);
        if (e.units) {
          const n = e.units.filter(Boolean).length;
          h += '<p class="insp__note">' + n + ' / 9 unidades · ' + DL.hwFmt.kw(e.tel ? e.tel.power : 0) + (n ? ' · <button type="button" class="linkbtn" data-ins="unit">tirar a última</button>' : ' · use Servidor ou Switch do catálogo') + '</p>';
          if (n) {
            h += '<ul class="insp__units">';
            e.units.forEach((u, k) => {
              if (!u) return;
              const m = DL.hwModel(u, e.unitModel && e.unitModel[k]);
              h += '<li><span class="mono">U' + String(40 - k * 4).padStart(2, '0') + '</span>' + m.name + '<em>' + (u === 'server' ? m.cores + ' núcl. · ' + DL.hwFmt.ram(m.ram) + ' · ' + DL.hwFmt.gb(m.nic) : u === 'switch' ? m.ports + 'p · ' + DL.hwFmt.gb(m.port) + (m.poe ? ' · PoE' : '') : m.ports + ' passagens') + '</em></li>';
            });
            h += '</ul>';
          }
        }
        const spec = e.kind === 'storage' ? DL.hwSpecs('storage', DL.hwModel('storage', e.model)) : e.kind === 'ap' || e.kind === 'camera' ? DL.hwSpecs(e.kind, DL.HW.poe[e.kind]) : null;
        if (spec && spec.length) {
          h += '<dl class="insp__spec">' + spec.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
          if (e.kind === 'ap' || e.kind === 'camera') h += '<p class="insp__note">' + (e.powered === false ? 'Sem energia: falta um switch PoE com potência livre' : 'Alimentado por PoE') + '</p>';
        }
        if (e.cost) h += '<p class="insp__note">Comprado por ' + DL.money(e.cost) + ' · revenda ' + DL.money(Math.round(e.cost * 0.5)) + '</p>';
      }
      el.insp.innerHTML = h;
      el.insp.classList.add('is-on');
    }

    const HINTS = {
      select: 'Clique para selecionar · arraste para mover · <kbd>R</kbd> gira 90° (4 direções) · <kbd>Del</kbd> remove · <kbd>WASD</kbd> câmera · roda do mouse: zoom',
      place: 'Clique para posicionar · <kbd>R</kbd> gira 90° · botão direito ou <kbd>Esc</kbd> cancela',
      mount: 'Clique no objeto de destino · botão direito ou <kbd>Esc</kbd> cancela',
      remove: 'Clique em um objeto para removê-lo · <kbd>Esc</kbd> volta para seleção',
      move: 'Clique para soltar · <kbd>R</kbd> gira · <kbd>Esc</kbd> cancela',
      style: 'Clique numa sala para personalizá-la · aplique um tema e misture piso, paredes, luz e RGB · objetos especiais na aba Temas',
      room: 'Clique numa sala para selecioná-la · dê nome e tipo · arraste as bordas da área para redimensionar · arraste uma porta para movê-la',
      draw: 'Arraste no terreno vazio para criar piso novo · encostado numa sala existente ganha divisória e porta',
      wall: 'Clique e arraste na grade para desenhar a parede · comece numa parede para continuar · <kbd>Shift</kbd>+arrastar apaga · <kbd>R</kbd> alvenaria/vidro',
      box: 'Arraste um retângulo: as 4 paredes do cômodo são criadas de uma vez · depois coloque uma porta',
      erase: 'Clique ou arraste sobre uma parede para remover só esse trecho (portas no trecho saem junto)',
      door: 'Clique numa parede interna para colocar a porta · <kbd>R</kbd> gira (dobradiça / lado que abre) · arraste uma porta existente para movê-la · <kbd>Esc</kbd> sai',
    };

    function syncUi() {
      // Decoração groups three tabs (items, themed items, room style) under one main tab + sub-tabs
      const fam = B.tab === 'theme' || B.tab === 'style' ? 'deco' : B.tab;
      el.dock.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.dataset.family ? b.dataset.family === fam : b.dataset.tab === B.tab;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const sub = document.getElementById('buildSub');
      if (sub) sub.hidden = fam !== 'deco';
      el.dock.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('is-on', B.tool === b.dataset.tool && !B.def));
      el.items.hidden = B.tab === 'room' || B.tab === 'style';
      if (el.groups) el.groups.hidden = el.items.hidden || !el.groups.innerHTML;
      el.room.hidden = B.tab !== 'room';
      if (el.style) el.style.hidden = B.tab !== 'style';
      el.items.querySelectorAll('.cat-item').forEach((b) => b.classList.toggle('is-on', !!B.def && b.dataset.def === B.def.id));
      const mode = B.move ? 'move' : B.def ? (B.def.mount === 'wallslot' ? 'door' : B.def.mount === 'rack' ? 'mount' : 'place') : B.tab === 'room' ? (B.roomTool === 'select' ? 'room' : B.roomTool) : B.tab === 'style' ? 'style' : B.tool;
      el.hint.innerHTML = HINTS[mode] + (B.def && B.def.price && !B.move ? ' · <b>' + B.def.name + '</b> ' + (priceOf(B.def) ? 'custa ' + DL.money(priceOf(B.def)) : 'sai grátis (kit inicial)') : '');
      el.dock.querySelector('.tools').hidden = B.tab === 'room' || B.tab === 'style';
      game.setCursor(B.move || B.def || (B.tab === 'room' && B.roomTool !== 'select') ? 'crosshair' : B.tool === 'remove' ? 'not-allowed' : '');
    }

    function setTab(t) {
      cancelPlace();
      if (B.roomTool === 'door' || B.roomTool === 'door2') B.roomTool = 'select';
      B.wd = null;
      if (B.tab !== t) B.group = null;
      B.tab = t;
      if (t === 'deco' || t === 'theme' || t === 'style') B.decoTab = t;
      if (t === 'room') { B.roomIdx = Math.max(0, Math.min(B.roomIdx, world.rooms.length - 1)); renderRoom(); select(null); }
      else if (t === 'style') { B.roomIdx = Math.max(0, Math.min(B.roomIdx, world.rooms.length - 1)); select(null); }
      else renderCatalog();
      syncUi();
      if (t === 'style') game.emit('style-room', B.roomIdx);
    }

    function chooseDef(id) {
      if (B.move) cancelMove();
      const def = DEF[id];
      B.def = B.def === def ? null : def;
      B.rot = 0;
      B.ghost = null;
      select(null);
      syncUi();
    }

    function cancelPlace() {
      B.def = null;
      B.ghost = null;
      syncUi();
    }

    el.dock.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.family) setTab(B.tab === 'deco' || B.tab === 'theme' || B.tab === 'style' ? B.tab : B.decoTab || 'deco');
      else if (b.dataset.tab) setTab(b.dataset.tab);
      else if (b.dataset.tool) { cancelPlace(); B.tool = b.dataset.tool; select(null); syncUi(); }
      else if (b.dataset.def) chooseDef(b.dataset.def);
      else if (b.dataset.roomPick) {
        B.roomIdx = +b.dataset.roomPick;
        const r = world.rooms[B.roomIdx];
        game.focus((r.x + r.w / 2) * T, (r.y + r.h / 2) * T);
        renderRoom();
      } else if (b.dataset.roomTool) setRoomTool(b.dataset.roomTool);
      else if (b.dataset.wallMat) { B.wallMat = b.dataset.wallMat; renderRoom(); }
      else if (b.dataset.roomType) setRoomType(B.roomIdx, b.dataset.roomType);
      else if (b.dataset.roomMore) { B.roomMore = !B.roomMore; renderRoom(); }
      else if (b.dataset.room) {
        const a = b.dataset.room, i = B.roomIdx;
        if (a === 'w-') resizeRoom(i, -1, 0);
        else if (a === 'w+') resizeRoom(i, 1, 0);
        else if (a === 'h-') resizeRoom(i, 0, -1);
        else if (a === 'h+') resizeRoom(i, 0, 1);
        else if (a === 'floor') toggleFloor(i);
        else if (a === 'add-e') addRoom(i, 'e');
        else if (a === 'add-s') addRoom(i, 's');
        // growing the land asks first (with the price); shrinking is free but gives nothing back
        else if (a === 'lw+') { B.lotAsk = { dw: 4, dh: 0 }; renderRoom(); }
        else if (a === 'lh+') { B.lotAsk = { dw: 0, dh: 4 }; renderRoom(); }
        else if (a === 'lot-ok') {
          const q = B.lotAsk;
          B.lotAsk = null;
          if (!q) renderRoom();
          else if (game.cloudLot) {
            // cloud save: the server charges the land first; the lot grows only when it says yes
            B.lotBusy = true;
            renderRoom();
            game.cloudLot(q.dw, q.dh, builtArea()).then((r) => {
              B.lotBusy = false;
              if (r && r.ok) resizeLot(q.dw, q.dh, false);
              else { nope((r && r.message) || 'Servidor indisponível'); game.toast('warn', 'Expansão recusada', (r && r.message) || 'Servidor indisponível'); renderRoom(); }
            });
          } else resizeLot(q.dw, q.dh, true);
        }
        else if (a === 'lot-no') { B.lotAsk = null; renderRoom(); }
        else if (a === 'lw-') { B.lotAsk = null; resizeLot(-2, 0, true); }
        else if (a === 'lh-') { B.lotAsk = null; resizeLot(0, -2, true); }
        else if (a === 'del') removeRoom(i);
      }
      b.blur();
    });
    el.room.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-room-name]')) renameRoom(B.roomIdx, ev.target.value);
      else if (ev.target.matches('[data-room-type-sel]')) setRoomType(B.roomIdx, ev.target.value);
    });
    el.room.addEventListener('keydown', (ev) => {
      if (!ev.target.matches('[data-room-name]')) return;
      ev.stopPropagation();
      if (ev.key === 'Enter') ev.target.blur();
      if (ev.key === 'Escape') { ev.target.value = world.rooms[B.roomIdx] ? world.rooms[B.roomIdx].name : ''; ev.target.blur(); }
    });

    el.insp.addEventListener('click', (ev) => {
      const st = ev.target.closest('[data-sty]');
      if (st && B.sel) { DL.itemStyleSet(B.sel, st.dataset.sty, st.dataset.v); pos(B.sel); renderInspector(); return; }
      const sk = ev.target.closest('[data-item-skin]');
      if (sk && B.sel && DL.applyItemSkin) { DL.applyItemSkin(B.sel, sk.dataset.itemSkin); renderInspector(); return; }
      const b = ev.target.closest('[data-ins]');
      if (!b || !B.sel) return;
      const e = B.sel;
      if (b.dataset.ins === 'move') startMove(e, false);
      else if (b.dataset.ins === 'rotate') { rotate(e); renderInspector(); }
      else if (b.dataset.ins === 'remove') removeItem(e);
      else if (b.dataset.ins === 'unit') { removeUnit(e); renderInspector(); }
      else if (b.dataset.ins === 'hold') { e.hold = !e.hold; renderInspector(); }
    });
    el.insp.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- input ---------- */
    function pointerMove(sx, sy) {
      const w = scene.screenToWorld(sx, sy);
      B.mouse = { sx, sy, wx: w.x, wy: w.y };
      if (B.tab === 'room' && !B.pan) {
        const tx = Math.floor(w.x / T), ty = Math.floor(w.y / T);
        if (B.draw) { B.draw.x1 = tx; B.draw.y1 = ty; roomPreview(); return; }
        if (B.resize) { B.resize.rect = resizeRect(); roomPreview(); return; }
        if (B.wd) { B.wd.x1 = tx; B.wd.y1 = ty; B.wd.erase = B.wd.erase0 || B.shift; roomPreview(); return; }
        B.roomHover = { tx, ty };
        if (isWallTool()) B.roomHover.plan = wallPlan({ x0: tx, y0: ty, x1: tx, y1: ty, erase: B.roomTool === 'erase' || B.shift });
        else if (B.roomTool === 'select' && !B.down) {
          const e = edgeAt(w.x, w.y);
          game.setCursor(!e ? '' : e === 'l' || e === 'r' ? 'ew-resize' : e === 't' || e === 'b' ? 'ns-resize' : e === 'tl' || e === 'br' ? 'nwse-resize' : 'nesw-resize');
        }
      }
      if (B.pan) {
        const d = scene.screenDelta(sx - B.pan.sx, sy - B.pan.sy);
        scene.cam.x = B.pan.cx - d.x;
        scene.cam.y = B.pan.cy - d.y;
        return;
      }
      if (B.down && !B.move && B.down.item && Math.hypot(sx - B.down.sx, sy - B.down.sy) > 5) {
        const it = B.down.item;
        B.down = null;
        startMove(it, true);
        return;
      }
      if (B.down && !B.down.item && Math.hypot(sx - B.down.sx, sy - B.down.sy) > 4) {
        B.pan = { sx: B.down.sx, sy: B.down.sy, cx: B.down.cx, cy: B.down.cy };
        B.down = null;
        return;
      }
      if (B.move) updateMove();
      else if (B.def) B.ghost = ghostAt(w.x, w.y);
      else if (B.tab !== 'room' && B.tab !== 'style') B.hover = pick(w.x, w.y);
    }

    function pointerDown(sx, sy, button) {
      if (button === 2) { rightClick(); return; }
      pointerMove(sx, sy);
      const m = B.mouse;
      if (B.move) { dropMove(); return; }
      if (B.def) { place(); B.ghost = ghostAt(m.wx, m.wy); return; }
      if (B.tab === 'room') {
        const tx = Math.floor(m.wx / T), ty = Math.floor(m.wy / T);
        if (B.roomTool === 'draw') { B.draw = { x0: tx, y0: ty, x1: tx, y1: ty }; B.previewKey = ''; roomPreview(); return; }
        if (isWallTool()) {
          const er = B.roomTool === 'erase' || B.shift;
          B.wd = { x0: tx, y0: ty, x1: tx, y1: ty, box: B.roomTool === 'box', erase: er, erase0: B.roomTool === 'erase' };
          B.previewKey = '';
          roomPreview();
          return;
        }
        // doors are picked and dragged right here, like furniture
        const door = pick(m.wx, m.wy);
        if (door && door.kind === 'door') {
          select(door);
          B.down = { sx, sy, item: door, cx: scene.cam.x, cy: scene.cam.y };
          return;
        }
        if (B.sel) select(null);
        const edge = edgeAt(m.wx, m.wy);
        if (edge) { const ai = selArea(); B.resize = { i: ai, edge, rect: Object.assign({}, world.areas[ai]) }; B.previewKey = ''; return; }
        const i = roomIndexAt(tx, ty);
        if (i >= 0) { B.roomIdx = i; renderRoom(); }
        B.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
        return;
      }
      if (B.tab === 'style') {
        const tx = Math.floor(m.wx / T), ty = Math.floor(m.wy / T);
        const i = tx >= 0 && ty >= 0 && tx < world.W && ty < world.H ? world.roomAt[ty * world.W + tx] : -1;
        if (i >= 0 && i !== B.roomIdx) { B.roomIdx = i; game.emit('style-room', i); }
        B.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
        return;
      }
      if (B.tool === 'remove') { removeItem(pick(m.wx, m.wy)); B.hover = pick(m.wx, m.wy); return; }
      const it = pick(m.wx, m.wy);
      select(it);
      B.down = { sx, sy, item: it && !lockReason(it) ? it : null, cx: scene.cam.x, cy: scene.cam.y };
    }

    function pointerUp() {
      if (B.draw) {
        const rc = drawRect();
        B.draw = null;
        B.roomReason = null;
        if (rc.w > 1 || rc.h > 1) createRoom(rc);
        else nope('Arraste para desenhar a sala');
      }
      if (B.resize) {
        const z = B.resize;
        B.resize = null;
        B.roomReason = null;
        const r = world.areas[z.i];
        if (r && (z.rect.x !== r.x || z.rect.y !== r.y || z.rect.w !== r.w || z.rect.h !== r.h)) setRoomRect(z.i, { x: z.rect.x, y: z.rect.y, w: z.rect.w, h: z.rect.h });
      }
      if (B.wd) {
        const wd = B.wd;
        B.wd = null;
        B.roomReason = null;
        wd.erase = wd.erase0 || wd.erase;
        applyWall(wd);
        if (B.mouse) { const tx = Math.floor(B.mouse.wx / T), ty = Math.floor(B.mouse.wy / T); B.roomHover = { tx, ty, plan: wallPlan({ x0: tx, y0: ty, x1: tx, y1: ty, erase: B.roomTool === 'erase' || B.shift }) }; }
        renderRoom();
      }
      if (B.move && B.move.drag) dropMove();
      B.down = null;
      B.pan = null;
    }

    function rightClick() {
      if (B.draw || B.resize || B.wd) { B.draw = null; B.resize = null; B.wd = null; B.roomReason = null; return; }
      if (B.tab === 'room' && B.roomTool !== 'select') { setRoomTool('select'); return; }
      if (B.move) cancelMove();
      else if (B.def) cancelPlace();
      else if (B.tool === 'remove') { B.tool = 'select'; syncUi(); }
      else select(null);
      syncUi();
    }

    function key(ev) {
      const c = ev.code;
      if (B.tab === 'room') {
        if (c === 'Escape' && (B.draw || B.resize || B.wd)) { B.draw = null; B.resize = null; B.wd = null; B.roomReason = null; return true; }
        if (c === 'Escape' && B.move) { cancelMove(); syncUi(); return true; }
        if (c === 'Escape' && B.roomTool !== 'select') { setRoomTool('select'); return true; }
        if (c === 'KeyR' && (B.roomTool === 'wall' || B.roomTool === 'box')) {
          B.wallMat = B.wallMat === 'solid' ? 'glass' : 'solid';
          renderRoom();
          return true;
        }
        // doors (placing, moving or selected) use the regular item keys below
        const doorish = B.def || B.move || (B.sel && B.sel.kind === 'door');
        if (!doorish && (c === 'KeyR' || c === 'Delete' || c === 'Backspace' || c === 'KeyM' || c === 'KeyX')) return true;
        if (c === 'KeyX' || c === 'KeyV') return true;
      }
      if (c === 'Escape') {
        if (B.move) cancelMove();
        else if (B.def) cancelPlace();
        else if (B.tool === 'remove') B.tool = 'select';
        else if (B.sel) select(null);
        else { game.setMode('explore'); return true; }
        syncUi();
        return true;
      }
      if (c === 'KeyR') {
        if (B.move) {
          const e = B.move.e;
          if (e.kind === 'door') { e.rot = (e.rot + 1) % 4; updateMove(); }
          else if (canTurn(e)) { turn(e); pos(e); updateMove(); }
        } else if (B.def) {
          if (B.def.rot) { B.rot = B.def.mount === 'wallslot' ? (B.rot + 1) % 4 : DL.ROT_NEXT[B.rot | 0]; if (B.mouse) B.ghost = ghostAt(B.mouse.wx, B.mouse.wy); }
        } else if (B.sel) { rotate(B.sel); renderInspector(); }
        return true;
      }
      if (c === 'Delete' || c === 'Backspace') { if (B.sel) removeItem(B.sel); return true; }
      if (c === 'KeyX') { cancelPlace(); B.tool = B.tool === 'remove' ? 'select' : 'remove'; select(null); syncUi(); return true; }
      if (c === 'KeyV') { cancelPlace(); B.tool = 'select'; syncUi(); return true; }
      if (c === 'KeyM') { if (B.sel) startMove(B.sel, false); return true; }
      return false;
    }

    /* ---------- drawing ---------- */
    function dev(g, wx, wy, ww, wh, fill, stroke) {
      const S = scene.S;
      if (scene.iso) {
        // isometric: the same rectangle laid on the floor
        g.save();
        scene.groundTransform(g);
        if (fill) { g.fillStyle = fill; g.fillRect(wx, wy, ww, wh); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2 / S; g.strokeRect(wx, wy, ww, wh); }
        g.restore();
        return;
      }
      const x = Math.round(wx * S - scene.ox), y = Math.round(wy * S - scene.oy);
      const w = Math.round((wx + ww) * S - scene.ox) - x, h = Math.round((wy + wh) * S - scene.oy) - y;
      if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }

    function footprint(g, list, ok) {
      const fill = ok ? 'rgba(126,224,161,0.16)' : 'rgba(255,122,23,0.2)';
      const line = ok ? 'rgba(126,224,161,0.7)' : 'rgba(255,122,23,0.8)';
      for (const e of list) for (const [x, y] of cells(e)) dev(g, x * T, y * T, T, T, fill, line);
    }

    function underlay(g) {
      if (!B.active) return;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      const S = scene.S, W = world.W, H = world.H;
      const { x0, y0, x1, y1 } = scene.tileRange();
      // tile grid: one device pixel lines (on the floor plane in the isometric view)
      if (scene.iso) scene.groundTransform(g);
      const gridCell = (x, y) => {
        if (scene.iso) { g.fillRect(x * T, y * T, T, 1 / S); g.fillRect(x * T, y * T, 1 / S, T); return; }
        const px = Math.round(x * T * S - scene.ox), py = Math.round(y * T * S - scene.oy);
        g.fillRect(px, py, Math.round(T * S), 1);
        g.fillRect(px, py, 1, Math.round(T * S));
      };
      g.fillStyle = 'rgba(255,255,255,0.055)';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = world.tiles[y * W + x];
          if (t === '#' || t === 'g' || t === 'G' || t === 'w') continue;
          gridCell(x, y);
        }
      }
      if (B.tab === 'style') {
        world.rooms.forEach((r, i) => {
          const on = i === B.roomIdx;
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, null, on ? 'rgba(196,181,253,0.85)' : 'rgba(255,255,255,0.1)');
        });
      }
      if (B.tab === 'room') {
        if (world.lot) {
          // the whole lot gets a faint grid so empty ground reads as buildable
          g.fillStyle = 'rgba(255,255,255,0.035)';
          for (let y = y0; y <= Math.min(y1, world.lot.h - 1); y++) {
            for (let x = x0; x <= Math.min(x1, world.lot.w - 1); x++) {
              if (world.tiles[y * W + x] !== '#') continue;
              gridCell(x, y);
            }
          }
          dev(g, 0, 0, world.lot.w * T, world.lot.h * T, null, 'rgba(255,255,255,0.12)');
        }
        // selected room: its own floor tiles; handles on the floor area it sits on
        if (B.roomTool === 'select') {
          const sel = B.roomIdx;
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (world.roomAt[y * W + x] === sel) dev(g, x * T, y * T, T, T, 'rgba(160,195,236,0.07)', null);
        }
        if (isWallTool() || B.roomTool === 'door' || B.roomTool === 'door2') {
          // walls stand out while editing them
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const t = world.tiles[y * W + x];
              if (t === 'w') dev(g, x * T + 1, y * T + 1, T - 2, T - 2, 'rgba(160,195,236,0.10)', 'rgba(160,195,236,0.35)');
              else if (t === 'd' || t === 'D') dev(g, x * T + 1, y * T + 1, T - 2, T - 2, 'rgba(255,194,133,0.12)', 'rgba(255,194,133,0.45)');
            }
          }
        }
        world.areas.forEach((r, i) => {
          const on = i === selArea() && B.roomTool === 'select';
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, null, on ? 'rgba(160,195,236,0.7)' : 'rgba(255,255,255,0.14)');
          if (on && !r.fixed && !B.resize) {
            const hs = 6 / S;
            for (const [hx, hy] of [[r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2], [r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
              dev(g, hx * T - hs / 2, hy * T - hs / 2, hs, hs, '#a0c3ec', null);
            }
          }
        });
        const ok = !B.roomReason;
        const fill = ok ? 'rgba(126,224,161,0.14)' : 'rgba(255,122,23,0.16)', line = ok ? 'rgba(126,224,161,0.85)' : 'rgba(255,122,23,0.85)';
        if (B.draw && B.draw.rect) {
          const r = B.draw.rect;
          dev(g, (r.x - 1) * T, (r.y - 1) * T, (r.w + 2) * T, (r.h + 2) * T, ok ? 'rgba(126,224,161,0.06)' : 'rgba(255,122,23,0.06)', null);
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, fill, line);
        }
        if (B.resize && B.resize.rect) {
          const r = B.resize.rect;
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, fill, line);
        }
        // wall being dragged (or the tile under the cursor): green = new, orange = blocked, red = erase
        const wp = B.wd ? B.wd.plan : B.roomHover && !B.draw && !B.resize && isWallTool() ? B.roomHover.plan : null;
        if (wp) {
          const col = { new: 'rgba(126,224,161,', bad: 'rgba(255,122,23,', del: 'rgba(242,73,92,', skip: 'rgba(255,255,255,' };
          for (const t of wp.tiles) {
            const c = col[t.st];
            dev(g, t.x * T, t.y * T, T, T, c + (t.st === 'skip' ? '0.04)' : '0.24)'), c + (t.st === 'skip' ? '0.25)' : '0.85)'));
          }
          if (B.wd) {
            const a = B.wd, s = 3 / S;
            dev(g, a.x0 * T + T / 2 - s, a.y0 * T + T / 2 - s, s * 2, s * 2, '#ffffff', null);
          }
        }
      }
      if (B.tab !== 'room' && (B.def || B.move) && world.items.some((e) => e.kind === 'door')) {
        // keep door passages visible while furnishing
        for (const k of world.keepClear) { const [x, y] = k.split(',').map(Number); dev(g, x * T, y * T, T, T, 'rgba(255,194,133,0.06)', null); }
      }
      if (B.move) footprint(g, B.move.group, !B.move.reason);
      else if (B.ghost && B.ghost.group) footprint(g, B.ghost.group.filter((x) => !x.host), !B.ghost.reason);
      if (B.ghost && B.def && B.def.mount === 'rack' && B.ghost.mount) footprint(g, [B.ghost.mount], !B.ghost.reason);
      if (B.ghost && B.ghost.table) {
        const ok = !B.ghost.reason;
        dev(g, B.ghost.tx * T, B.ghost.ty * T, T, T, ok ? 'rgba(126,224,161,0.16)' : 'rgba(255,122,23,0.2)', ok ? 'rgba(126,224,161,0.7)' : 'rgba(255,122,23,0.8)');
      }
      if (B.sel && !B.move) {
        for (const e of groupOf(B.sel)) for (const [x, y] of cells(e)) dev(g, x * T, y * T, T, T, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.45)');
      }
      if (!B.def && !B.move && B.hover && B.hover !== B.sel && B.tab !== 'room') {
        const rm = B.tool === 'remove';
        for (const [x, y] of cells(B.hover)) dev(g, x * T, y * T, T, T, rm ? 'rgba(255,122,23,0.16)' : null, rm ? 'rgba(255,122,23,0.7)' : 'rgba(255,255,255,0.25)');
      }
      g.restore();
    }

    function overlay(g, sc) {
      if (!B.active) return;
      // ghosts are drawn like the real thing: projected in the isometric view
      const drawGhost = scene.iso ? (e, t) => scene.drawItemIso(g, e, t) : (e, t) => DL.drawItem(g, e, t);
      if (B.wd && B.wd.plan && !B.wd.erase) {
        // translucent wall pieces where the new wall will stand, joined like the real thing
        const fresh = new Set(B.wd.plan.tiles.filter((t) => t.st === 'new').map((t) => tkey(t.x, t.y)));
        const axs = new Map(B.wd.plan.tiles.map((t) => [tkey(t.x, t.y), t.ax]));
        const J = wallJoins((x, y) => (fresh.has(tkey(x, y)) ? 'w' : tileAt(x, y)), (x, y) => (fresh.has(tkey(x, y)) ? axs.get(tkey(x, y)) : wallAx(world.wallSet.get(tkey(x, y)))) + (axs.has(tkey(x, y)) ? axs.get(tkey(x, y)) : ''));
        g.globalAlpha = B.wd.plan.reason ? 0.35 : 0.7;
        for (const t of B.wd.plan.tiles.filter((t) => t.st === 'new').sort((a, b) => a.y - b.y || a.x - b.x)) {
          drawGhost({ kind: 'wallseg', px: t.x * T, py: t.y * T, tx: t.x, ty: t.y, tw: 1, th: 1, mat: B.wallMat, l: J.h(t.x, t.y, t.x - 1), r: J.h(t.x, t.y, t.x + 1), u: J.v(t.x, t.y, t.y - 1), d: J.v(t.x, t.y, t.y + 1) }, sc.t);
        }
        g.globalAlpha = 1;
      }
      const ghost = B.move ? B.move.group : B.ghost && B.ghost.group;
      if (ghost) {
        g.globalAlpha = 0.78;
        const depth = scene.iso ? (e) => e.px + e.py + (e.tw || 1) * 8 + (e.th || 1) * 8 + (e.host ? 0.5 : 0) : (e) => e.sortY;
        for (const e of ghost.slice().sort((a, b) => depth(a) - depth(b))) drawGhost(e, sc.t);
        g.globalAlpha = 1;
      }
      if (B.ghost && B.def && B.def.mount === 'rack' && B.ghost.mount && !B.ghost.reason) {
        const r = B.ghost.mount, k = r.units.indexOf(null);
        const a = 0.5 + 0.35 * Math.sin(sc.t * 6);
        g.save();
        // the free slot on the rack's front (its own sprite coordinates)
        if (scene.iso) scene.spriteSpace(g, r);
        g.fillStyle = 'rgba(126,224,161,' + a.toFixed(3) + ')';
        g.fillRect(r.px + 3, r.py - 15 + k * 3, 10, 2);
        g.restore();
      }
    }

    // DOM bits anchored to the world: inspector card + reason tooltip
    function updateUi() {
      tickDoors();
      if (!B.active) return;
      if (B.sel && el.insp.classList.contains('is-on')) {
        const b = B.sel.bounds || { x: B.sel.px, y: B.sel.py, w: 16, h: 16 };
        const p = scene.iso ? scene.itemTop(B.sel, 4) : scene.worldToScreen(b.x + b.w / 2, b.y - 4);
        el.insp.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
      const hp = null; // wall tools colour the tiles under the cursor instead
      const reason = B.move ? B.move.reason : B.draw || B.resize || B.wd ? B.roomReason : B.def ? B.ghost && B.ghost.reason : B.tab === 'room' ? hp : B.ghost && B.ghost.reason;
      const now = performance.now();
      const warn = B.tipUntil > now ? B.tipText : reason;
      // while dragging a wall the tip also shows its length
      const info = B.wd && B.wd.plan ? B.wd.plan.info : null;
      const text = warn && info ? info + ' · ' + warn : warn || info;
      if (text && B.mouse) {
        if (el.tip.textContent !== text) el.tip.textContent = text;
        el.tip.style.transform = 'translate(' + (B.mouse.sx + 14) + 'px,' + (B.mouse.sy + 16) + 'px)';
        el.tip.classList.add('is-on');
        el.tip.classList.toggle('is-warn', !!warn);
      } else el.tip.classList.remove('is-on');
    }

    function enter() {
      B.active = true;
      el.dock.hidden = false;
      requestAnimationFrame(() => el.dock.classList.add('is-on'));
      if (B.tab === 'room') renderRoom();
      else renderCatalog();
      syncUi();
    }

    function exit() {
      if (B.move) cancelMove();
      B.draw = null;
      B.resize = null;
      B.wd = null;
      B.roomHover = null;
      B.roomReason = null;
      B.def = null;
      B.ghost = null;
      B.hover = null;
      B.pan = null;
      B.down = null;
      select(null);
      B.active = false;
      el.dock.classList.remove('is-on');
      el.dock.hidden = true;
      el.tip.classList.remove('is-on');
      game.setCursor('');
    }

    game.on('world', () => {
      if (B.sel && world.items.indexOf(B.sel) < 0) select(null);
      else if (B.sel) renderInspector();
      if (B.tab === 'room' && B.active) renderRoom();
    });

    return {
      get active() { return B.active; },
      get state() { return B; },
      enter, exit, pointerMove, pointerDown, pointerUp, key, underlay, overlay, updateUi,
      // the tutorial opens the catalog straight on the item it asks for, scrolled into view
      choose(id) {
        const def = DEF[id];
        if (!def || !B.active) return;
        if (B.tab !== def.cat) setTab(def.cat);
        if (B.group && def.group !== B.group) { B.group = null; renderCatalog(); }
        if (B.def !== def) chooseDef(id);
        const b = el.items.querySelector('[data-def="' + id + '"]');
        if (b) el.items.scrollLeft += b.getBoundingClientRect().left - el.items.getBoundingClientRect().left - 4;
      },
      // exposed for automated checks
      api: { roomIndex: () => B.roomIdx, setRoomIndex: (i) => { B.roomIdx = Math.max(0, Math.min(i, world.rooms.length - 1)); }, place: (id, tx, ty, rot) => {
        B.def = DEF[id]; B.rot = rot || 0;
        const side = DL.rotSide(B.rot) && B.def.mount !== 'wall', w = side ? B.def.h || 1 : B.def.w || 1, h = side ? B.def.w || 1 : B.def.h || 1;
        B.ghost = ghostAt(tx * T + w * 8, ty * T + h * 8);
        const r = B.ghost.reason;
        B.free = true;
        try { place(); } finally { B.free = false; }
        B.def = null; B.ghost = null;
        return r;
      }, removeItem, rotate, startMove, dropMove, resizeRoom, addRoom, removeRoom, select, commit, check, createRoom, resizeLot, setRoomRect,
        lotQuote, buyLot: (dw, dh) => resizeLot(dw, dh, true), builtArea,
        // loading a save: put each rack unit back in its exact slot (catalog ids, null = empty)
        restoreUnits(e, list, costs) {
          if (!e || !e.units) return;
          e.units = new Array(9).fill(null);
          e.unitModel = new Array(9).fill(null);
          (list || []).slice(0, 9).forEach((id, k) => {
            const def = id && DEF[id];
            if (!def || def.mount !== 'rack') return;
            e.units[k] = def.unit || def.id;
            e.unitModel[k] = def.unit ? def.id : null;
          });
          e.unitCost = Array.isArray(costs) ? costs.slice(0, 9).map((c) => +c || 0) : new Array(9).fill(0);
          syncRack(e);
        }, setTab, setRoomTool, chooseDef, planRooms,
        // free walls + doors
        buildWall: (x0, y0, x1, y1, mat, box) => { const keep = B.wallMat; B.wallMat = mat || 'solid'; const wd = { x0, y0, x1, y1, box: !!box }; const r = wallPlan(wd).reason; applyWall(wd); B.wallMat = keep; return r; },
        eraseWall: (x0, y0, x1, y1) => { const wd = { x0, y0, x1, y1, erase: true }; const r = wallPlan(wd).reason; applyWall(wd); return r; },
        placeDoor: (tx, ty, len, rot) => { const d = doorGhost(tx, ty, len || 1, rot || 0); if (d.reason) return d.reason; world.items.push(d.e); commit({ added: [d.e] }); return null; },
        setRoomType, renameRoom, areaOfRoom, roomIndexAt, wallAxisAt, doorCheck },
    };
  };
})();
