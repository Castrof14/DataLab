/* DataLab — build mode: rooms, grid placement and the furniture catalog.
   Rooms are rectangles of floor; walls, glass partitions and doors are derived from them. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;

  const LIM = { mapW: 56, mapH: 40, minW: 5, minH: 5, maxW: 30, maxH: 24 };
  const FLOOR = { '.': 1, ',': 1, '_': 1 };
  const SKIP = { glass: 1, glassH: 1, videowall: 1 };

  /* ------------------------------------------------------------------ */
  /* Rooms → tiles                                                       */
  /* ------------------------------------------------------------------ */

  // Two rooms separated by exactly one wall tile share a partition (with a door in the middle).
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

  // Rooms need at least one wall tile between them.
  const tooClose = (a, b) => !(a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y);

  function connected(rooms) {
    const seen = new Set([0]), q = [0];
    while (q.length) {
      const i = q.pop();
      rooms.forEach((r, j) => {
        if (!seen.has(j) && sharedWall(rooms[i], r)) { seen.add(j); q.push(j); }
      });
    }
    return seen.size === rooms.length;
  }

  function layout(w) {
    const rooms = w.rooms;
    let W = 0, H = 0;
    for (const r of rooms) { W = Math.max(W, r.x + r.w + 1); H = Math.max(H, r.y + r.h + 1); }
    const tiles = new Array(W * H).fill('#');
    const roomAt = new Int16Array(W * H).fill(-1);
    rooms.forEach((r, i) => {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          tiles[y * W + x] = r.floor === 'carpet' ? '_' : w.perf.has(x + ',' + y) ? ',' : '.';
          roomAt[y * W + x] = i;
        }
      }
    });
    const walls = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const s = sharedWall(rooms[i], rooms[j]);
        if (!s) continue;
        const len = s.to - s.from;
        s.dl = Math.min(2, len);
        s.d0 = s.from + Math.floor((len - s.dl) / 2);
        for (let k = s.from; k < s.to; k++) {
          const door = k >= s.d0 && k < s.d0 + s.dl;
          if (s.axis === 'v') tiles[k * W + s.at] = door ? 'd' : 'g';
          else tiles[s.at * W + k] = door ? 'D' : 'G';
        }
        walls.push(s);
      }
    }
    // tiles right in front of a door stay walkable
    const clear = new Set();
    for (const s of walls) {
      for (let k = s.d0; k < s.d0 + s.dl; k++) {
        if (s.axis === 'v') { clear.add(s.at - 1 + ',' + k); clear.add(s.at + 1 + ',' + k); }
        else { clear.add(k + ',' + (s.at - 1)); clear.add(k + ',' + (s.at + 1)); }
      }
    }
    // glass panes are items, so they depth-sort with people and furniture
    const items = w.items.filter((e) => e.kind !== 'glass' && e.kind !== 'glassH');
    for (const s of walls) {
      for (let k = s.from; k < s.to; k++) {
        if (k >= s.d0 && k < s.d0 + s.dl) continue;
        const first = k === s.from || k === s.d0 + s.dl, last = k === s.to - 1 || k === s.d0 - 1;
        const e = s.axis === 'v'
          ? { kind: 'glass', tx: s.at, ty: k, capTop: first, capBottom: last }
          : { kind: 'glassH', tx: k, ty: s.at, capLeft: first, capRight: last };
        e.tw = 1; e.th = 1; e.solid = false; e.px = e.tx * T; e.py = e.ty * T; e.sortY = e.py + T;
        items.push(e);
      }
    }
    Object.assign(w, { W, H, tiles, roomAt, walls, keepClear: clear, items });
  }

  function rebuildSolid(w) {
    const W = w.W, H = w.H, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = w.tiles[i];
      if (t === '#' || t === 'g' || t === 'G') solid[i] = 1;
    }
    for (const e of w.items) {
      if (!e.solid || e.host || SKIP[e.kind]) continue;
      for (let j = 0; j < e.th; j++) {
        for (let i = 0; i < e.tw; i++) {
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

  /* ---------- floor + walls, generalised from DL.renderStatic ---------- */
  DL.renderRooms = function (w) {
    const W = w.W, H = w.H;
    const c = DL.mk(W * T, H * T), g = c.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : w.tiles[y * W + x]);
    const open = (t) => t !== '#';
    const floor = (t, px, py, x, y) => {
      if (t === '_') DL.carpet(g, px, py, x, y);
      else DL.floorTile(g, px, py, t === ',');
    };
    const floorKind = (t) => (t === '_' || t === ',' ? t : '.');

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y), px = x * T, py = y * T;
        if (t === '#') {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (open(at(x + dx, y + dy))) { near = true; break; }
          if (near) R(g, px, py, T, T, '#0b0c10');
        } else if (t === 'g') {
          floor(floorKind(at(x - 1, y)), px, py, x, y);
          floor(floorKind(at(x + 1, y)), px + 8, py, x, y);
          R(g, px + 7, py, 3, 16, '#1c2129');
        } else if (t === 'G') {
          floor(floorKind(at(x, y - 1)), px, py, x, y);
          floor(floorKind(at(x, y + 1)), px, py + 8, x, y);
          R(g, px, py + 7, 16, 3, '#1c2129');
        } else if (t === 'd') {
          DL.floorTile(g, px, py, false);
          R(g, px, py, 8, 16, '#11141b');
        } else if (t === 'D') {
          DL.floorTile(g, px, py, false);
          R(g, px, py, 16, 8, '#11141b');
        } else floor(t, px, py, x, y);
      }
    }
    // door posts
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y), px = x * T, py = y * T;
        if (t === 'd') {
          if (at(x, y - 1) === 'g') R(g, px + 6, py - 1, 5, 2, '#2a3039');
          if (at(x, y + 1) === 'g') R(g, px + 6, py + T - 1, 5, 2, '#2a3039');
        } else if (t === 'D') {
          if (at(x - 1, y) === 'G') R(g, px - 1, py + 6, 2, 5, '#2a3039');
          if (at(x + 1, y) === 'G') R(g, px + T - 1, py + 6, 2, 5, '#2a3039');
        }
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
        R(g, px, ft - 1, 16, 1, '#242832');
        R(g, px, ft, 16, B - ft, noc ? '#14161d' : '#171b22');
        R(g, px, ft, 1, B - ft, noc ? '#121419' : '#14171d');
        R(g, px, B - 4, 16, 1, '#1d2028');
        R(g, px, B - 3, 16, 3, '#101217');
        R(g, px, B, 16, 2, 'rgba(0,0,0,0.25)');
      }
    }
    // partition headers where a glass wall meets a wall face
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== 'g' || at(x, y - 1) !== '#') continue;
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
      if (r.floor !== 'tile' || at(r.x, r.y - 1) !== '#' || at(r.x, r.y - 2) !== '#') continue;
      const ft = r.y * T - 26;
      R(g, r.x * T, ft + 2, r.w * T, 1, '#2f4566');
      R(g, r.x * T, ft + 3, r.w * T, 2, '#262b34');
      R(g, r.x * T, ft + 5, r.w * T, 1, '#111318');
      for (const lx of lampsOf(r)) {
        R(g, lx * T + 4, ft + 11, 8, 2, '#dfe7f2');
        R(g, lx * T + 4, ft + 13, 8, 1, '#7f8a9c');
      }
    }
    // baked light pools
    g.globalCompositeOperation = 'lighter';
    for (const r of w.rooms) {
      if (r.floor === 'tile') {
        for (const lx of lampsOf(r)) for (let ly = r.y + 1.4; ly < r.y + r.h; ly += 5) DL.pool(g, lx * T + 8, ly * T, 54, 'rgba(160,195,236,0.045)');
      } else if (r.id === 'noc') {
        for (const [lx, ly] of [[4, 8], [7, 13], [5, 16]]) DL.pool(g, lx * T, ly * T, 72, 'rgba(255,194,133,0.03)');
      } else {
        for (let ly = r.y + 2; ly < r.y + r.h; ly += 5) for (let lx = r.x + 2; lx < r.x + r.w; lx += 5) DL.pool(g, lx * T, ly * T, 64, 'rgba(255,194,133,0.03)');
      }
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  // Convert the hand-made DC-01 map into the room model, keeping every tile identical.
  DL.initRooms = function (w) {
    w.rooms = [
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
    layout(w);
    rebuildSolid(w);
    refreshIndex(w);
    w.version = 1;
  };

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  const CATALOG = [
    { id: 'desk', cat: 'equip', name: 'Computador', w: 2, h: 1, rot: true, desc: 'Estação com dois monitores e cadeira. A equipe trabalha aqui.' },
    { id: 'rack', cat: 'equip', name: 'Rack', desc: 'Rack 42U vazio. Instale servidores e switches nele.' },
    { id: 'server', cat: 'equip', name: 'Servidor', mount: 'rack', thumb: 'unit-server', desc: 'Clique em um rack com espaço livre.' },
    { id: 'switch', cat: 'equip', name: 'Switch', mount: 'rack', thumb: 'unit-switch', desc: 'Clique em um rack com espaço livre.' },
    { id: 'monitor', cat: 'equip', name: 'Monitor', mount: 'surface', rot: true, desc: 'Coloque sobre uma mesa. Com uma cadeira em frente vira estação.' },
    { id: 'storage', cat: 'equip', name: 'Storage', desc: 'Gaveta de discos para os dados da sala.' },
    { id: 'crac', cat: 'equip', name: 'Ar de precisão', desc: 'Refrigeração para o corredor frio.' },
    { id: 'table', cat: 'furn', name: 'Mesa', w: 2, h: 1, rot: true, desc: 'Superfície para monitores, café e vasos.' },
    { id: 'chair', cat: 'furn', name: 'Cadeira', rot: true, solid: false, desc: 'Em frente a uma mesa com monitor, vira estação.' },
    { id: 'sofa', cat: 'furn', name: 'Sofá', w: 2, h: 1, desc: 'Canto de descanso da equipe.' },
    { id: 'shelf', cat: 'furn', name: 'Estante', desc: 'Manuais, pastas e caixas de cabos.' },
    { id: 'whiteboard', cat: 'furn', name: 'Quadro branco', w: 2, h: 1, desc: 'Para desenhar topologias.' },
    { id: 'plant', cat: 'deco', name: 'Planta', desc: 'Um pouco de verde na sala.' },
    { id: 'vase', cat: 'deco', name: 'Vaso', mount: 'surface', desc: 'Vai em cima de uma mesa.' },
    { id: 'coffee', cat: 'deco', name: 'Cafeteira', mount: 'surface', desc: 'Vai em cima de uma mesa.' },
    { id: 'water', cat: 'deco', name: 'Bebedouro', desc: 'Água gelada para o turno.' },
    { id: 'lamp', cat: 'deco', name: 'Luminária', desc: 'Luz quente de piso.' },
    { id: 'rug', cat: 'deco', name: 'Tapete', w: 2, h: 2, solid: false, desc: 'Fica por baixo dos móveis.' },
    { id: 'bin', cat: 'deco', name: 'Lixeira', desc: 'Organização também é infraestrutura.' },
  ];
  const DEF = {};
  for (const d of CATALOG) DEF[d.id] = d;
  DL.CATALOG = CATALOG;

  const NAMES = {
    rack: 'Rack', switch: 'Switch', router: 'Roteador', core: 'Switch core', storage: 'Storage', crac: 'Ar de precisão', ups: 'Nobreak',
    desk: 'Computador', chair: 'Cadeira', plant: 'Planta', table: 'Mesa', monitor: 'Monitor', sofa: 'Sofá', shelf: 'Estante',
    water: 'Bebedouro', whiteboard: 'Quadro branco', rug: 'Tapete', lamp: 'Luminária', coffee: 'Cafeteira', vase: 'Vaso', bin: 'Lixeira',
  };
  DL.itemName = (e) => NAMES[e.kind] || e.kind;

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
      if (u) e.servers.push({ u: 'U' + String(40 - k * 4).padStart(2, '0'), host: (u === 'switch' ? 'sw-' : 'srv-') + e.id.slice(-2).toLowerCase() + '-' + (k + 1) });
    });
    e.tel.power = 0.3 + n * 0.42;
    e.tel.temp = 24 + n * 0.6;
  }
  DL.syncRack = syncRack;

  DL.createBuilder = function (game) {
    const scene = game.scene, world = scene.world;
    const $ = (id) => document.getElementById(id);
    const el = { dock: $('build'), items: $('buildItems'), room: $('buildRoom'), hint: $('buildHint'), insp: $('inspector'), tip: $('ghostTip') };
    const B = {
      active: false, tab: 'equip', tool: 'select', def: null, rot: 0,
      ghost: null, move: null, sel: null, hover: null, roomIdx: 1,
      mouse: null, down: null, pan: null,
    };
    let seedN = 400;

    /* ---------- items ---------- */
    function nextId(prefix, start) {
      for (let n = start || 1; ; n++) {
        const id = prefix + String(n).padStart(2, '0');
        if (!world.byId[id]) return id;
      }
    }

    function newItem(def, tx, ty, rot, preview) {
      const k = def.id;
      const e = { kind: k, tx, ty, tw: def.w || 1, th: def.h || 1, rot: def.rot ? rot || 0 : 0, solid: def.solid !== false, seed: preview ? 77 : seedN++ * 7 + 3, state: 'ok', built: true };
      if (k === 'table' && e.rot === 1) { e.tw = 1; e.th = 2; }
      if (def.mount === 'surface') e.solid = false;
      if (k === 'desk') e.chair = { kind: 'chair', tw: 2, th: 1, rot: e.rot, solid: false, parent: e, seed: e.seed + 1, built: true };
      if (k === 'rack') e.units = new Array(9).fill(null);
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
          Object.assign(e, { name: 'Storage ' + e.id, category: 'Storage' });
          initTel(e, 29, 2.3, 'kW', 0.2);
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
        e.cy = e.py + 11;
        e.sortY = e.cy;
      }
      if (e.kind === 'rug') e.sortY = -100000 + e.py;
      if (e.host) e.sortY = e.host.sortY + (e.kind === 'monitor' && e.rot === 1 ? 0.6 : 0.01);
      DL.itemGeom(e);
      if (e.chair) {
        const c = e.chair;
        c.tx = e.tx;
        c.ty = e.rot === 1 ? e.ty - 1 : e.ty + 1;
        c.rot = e.rot;
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
      for (let j = 0; j < e.th; j++) for (let i = 0; i < e.tw; i++) out.push([e.tx + i, e.ty + j]);
      return out;
    }

    function lockReason(e) {
      if (!e || SKIP[e.kind]) return 'Este elemento faz parte da sala';
      return game.lockReason ? game.lockReason(e) : null;
    }

    function actorCells() {
      const set = new Set();
      for (const a of game.actors()) {
        if (a.hidden) continue;
        for (const [ox, oy] of [[-5, -4], [5, -4], [-5, -1], [5, -1]]) set.add(Math.floor((a.x + ox) / T) + ',' + Math.floor((a.y + oy) / T));
      }
      return set;
    }

    // Returns null when the group can sit where it is, or a short reason why not.
    function check(group, exclude) {
      const occ = new Map(), rug = new Map();
      for (const e of world.items) {
        if (exclude.has(e) || e.host || SKIP[e.kind]) continue;
        const m = e.kind === 'rug' ? rug : occ;
        for (const [x, y] of cells(e)) m.set(x + ',' + y, e);
      }
      const people = actorCells();
      for (const e of group) {
        const layer = e.kind === 'rug' ? rug : occ;
        for (const [x, y] of cells(e)) {
          if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 'Fora da sala';
          const k = x + ',' + y, t = world.tiles[y * world.W + x];
          if (t === 'd' || t === 'D' || world.keepClear.has(k)) return 'Deixe a passagem da porta livre';
          if (!FLOOR[t]) return 'Fora da sala';
          if (layer.has(k)) return 'Espaço ocupado';
          if (e.kind !== 'rug' && people.has(k)) return 'Tem alguém neste lugar';
        }
      }
      return null;
    }

    function itemOnTile(tx, ty, pred) {
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || (pred && !pred(e))) continue;
        if (tx >= e.tx && tx < e.tx + e.tw && ty >= e.ty && ty < e.ty + e.th) return e;
      }
      return null;
    }

    function pick(wx, wy) {
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
      if (info.layout) layout(world);
      rebuildSolid(world);
      refreshIndex(world);
      world.version = (world.version || 0) + 1;
      scene.refreshWorld(!!info.layout);
      game.emit('world', info);
    }

    /* ---------- actions ---------- */
    function ghostAt(wx, wy) {
      const def = B.def;
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
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

    function place() {
      const gh = B.ghost;
      if (!gh) return;
      if (gh.reason) { nope(gh.reason); return; }
      const def = B.def;
      if (def.mount === 'rack') {
        const r = gh.mount, k = r.units.indexOf(null);
        r.units[k] = def.id === 'switch' ? 'switch' : 'server';
        syncRack(r);
        commit({ installed: r });
        game.sfx('place');
        return;
      }
      const e = newItem(def, gh.tx, gh.ty, B.rot);
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
      world.items = world.items.filter((x) => group.indexOf(x) < 0);
      if (B.sel === e) select(null);
      commit({ removed: group });
      game.sfx('remove');
    }

    function removeUnit(r) {
      const k = r.units.map(Boolean).lastIndexOf(true);
      if (k < 0) return;
      r.units[k] = null;
      syncRack(r);
      commit({ installed: r });
    }

    function startMove(e, drag) {
      e = e.parent || e;
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const group = groupOf(e);
      B.move = {
        e, group, drag,
        orig: group.map((x) => ({ x, tx: x.tx, ty: x.ty, rot: x.rot, tw: x.tw, th: x.th, host: x.host, dx: x.dx, dy: x.dy })),
        offX: 0, offY: 0, reason: null,
      };
      if (B.mouse && !e.host) {
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
      for (const o of m.orig) Object.assign(o.x, { tx: o.tx, ty: o.ty, rot: o.rot, tw: o.tw, th: o.th, host: o.host, dx: o.dx, dy: o.dy });
      B.move = null;
      world.items.push.apply(world.items, m.group);
      pos(m.e);
      commit({ added: m.group, moved: true });
    }

    function reshape(e) {
      if (e.kind === 'table') {
        e.tw = e.rot === 1 ? 1 : 2;
        e.th = e.rot === 1 ? 2 : 1;
        for (const s of surfaceOf(e)) { const d = s.dx; s.dx = s.dy; s.dy = d; }
      }
    }

    function rotate(e) {
      e = e.parent || e;
      const def = DEF[e.kind];
      if (!def || !def.rot) { nope('Este objeto não gira'); return; }
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const before = { rot: e.rot, tw: e.tw, th: e.th, s: surfaceOf(e).map((s) => [s, s.dx, s.dy]) };
      e.rot = (e.rot + 1) % 2;
      reshape(e);
      pos(e);
      const group = groupOf(e);
      const why2 = e.host ? null : check(group.filter((x) => !x.host), new Set(group));
      if (why2) {
        Object.assign(e, { rot: before.rot, tw: before.tw, th: before.th });
        for (const [s, dx, dy] of before.s) { s.dx = dx; s.dy = dy; }
        pos(e);
        nope('Sem espaço para girar');
        return;
      }
      commit({ rotated: e, moved: true, added: group, removed: group });
      game.sfx('place');
    }

    function nope(msg) {
      B.tipUntil = performance.now() + 1400;
      B.tipText = msg;
      game.sfx('nope');
    }

    /* ---------- rooms ---------- */
    function tryRooms(next, msg) {
      for (const r of next) {
        if (r.w < LIM.minW || r.h < LIM.minH) return nope('Tamanho mínimo: ' + LIM.minW + ' × ' + LIM.minH), false;
        if (r.w > LIM.maxW || r.h > LIM.maxH) return nope('Tamanho máximo: ' + LIM.maxW + ' × ' + LIM.maxH), false;
        if (r.x + r.w + 1 > LIM.mapW || r.y + r.h + 1 > LIM.mapH) return nope('Limite do terreno'), false;
      }
      for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) if (tooClose(next[i], next[j])) return nope('Encostaria em outro espaço'), false;
      if (!connected(next)) return nope('Os espaços precisam continuar ligados por uma porta'), false;
      const tmp = { rooms: next, perf: world.perf, items: world.items };
      layout(tmp);
      for (const e of world.items) {
        if (e.host || SKIP[e.kind]) continue;
        for (const [x, y] of cells(e)) {
          const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
          if (!FLOOR[t] || tmp.keepClear.has(x + ',' + y)) return nope(msg || 'Há objetos no caminho. Mova-os antes.'), false;
        }
      }
      for (const a of game.actors()) {
        const x = Math.floor(a.x / T), y = Math.floor((a.y - 2) / T);
        const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
        if (t === '#' || t === 'g' || t === 'G') return nope('Tem alguém nessa área'), false;
      }
      world.rooms = next;
      commit({ layout: true });
      game.sfx('place');
      return true;
    }

    const cloneRooms = () => world.rooms.map((r) => Object.assign({}, r));

    function resizeRoom(i, dw, dh) {
      const r = world.rooms[i];
      if (!r) return;
      if (r.fixed) { nope('O NOC tem tamanho fixo'); return; }
      const next = cloneRooms();
      next[i].w += dw;
      next[i].h += dh;
      tryRooms(next, dw < 0 || dh < 0 ? 'Há objetos junto à parede. Mova-os antes de reduzir.' : null);
      renderRoom();
    }

    function addRoom(i, side) {
      const r = world.rooms[i];
      const n = world.rooms.length + 1;
      const nr = side === 'e'
        ? { x: r.x + r.w + 1, y: r.y, w: 9, h: Math.min(r.h, 10) }
        : { x: r.x, y: r.y + r.h + 1, w: Math.min(r.w, 12), h: 7 };
      Object.assign(nr, { id: 'r' + Date.now().toString(36), name: 'Espaço ' + n, floor: 'tile' });
      const next = cloneRooms();
      next.push(nr);
      if (tryRooms(next)) {
        B.roomIdx = next.length - 1;
        game.toast('ok', 'Novo espaço', nr.name + ' · ' + nr.w + ' × ' + nr.h);
        const c = { x: (nr.x + nr.w / 2) * T, y: (nr.y + nr.h / 2) * T };
        game.focus(c.x, c.y);
      }
      renderRoom();
    }

    function removeRoom(i) {
      const r = world.rooms[i];
      if (!r || r.fixed || r.id === 'hall') { nope('Este espaço não pode ser removido'); return; }
      for (const e of world.items) {
        if (e.host || SKIP[e.kind]) continue;
        if (cells(e).some(([x, y]) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) { nope('Esvazie o espaço antes de removê-lo'); return; }
      }
      const next = cloneRooms();
      next.splice(i, 1);
      if (tryRooms(next)) B.roomIdx = Math.min(B.roomIdx, next.length - 1);
      renderRoom();
    }

    function toggleFloor(i) {
      const next = cloneRooms();
      if (next[i].fixed) { nope('O NOC mantém o carpete'); return; }
      next[i].floor = next[i].floor === 'carpet' ? 'tile' : 'carpet';
      tryRooms(next);
      renderRoom();
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
      if (def.thumb) e = { kind: def.thumb, px: 8, py: 16, tw: 1, th: 1, seed: 3 };
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

    function renderCatalog() {
      el.items.innerHTML = '';
      for (const def of CATALOG) {
        if (def.cat !== B.tab) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cat-item' + (B.def === def ? ' is-on' : '');
        b.dataset.def = def.id;
        b.title = def.desc;
        b.appendChild(thumb(def));
        const s = document.createElement('span');
        s.textContent = def.name;
        b.appendChild(s);
        el.items.appendChild(b);
      }
    }

    function renderRoom() {
      if (B.tab !== 'room') return;
      const rooms = world.rooms;
      B.roomIdx = Math.max(0, Math.min(B.roomIdx, rooms.length - 1));
      const r = rooms[B.roomIdx];
      let h = '<div class="room-list">';
      rooms.forEach((x, i) => {
        h += '<button type="button" class="chip' + (i === B.roomIdx ? ' is-on' : '') + '" data-room-pick="' + i + '">' + x.name + ' <span class="mono">' + x.w + '×' + x.h + '</span></button>';
      });
      h += '</div><div class="room-ctl">';
      const step = (label, key, val) =>
        '<div class="stepper"><span class="eyebrow-sm">' + label + '</span><button type="button" class="btn btn--sm" data-room="' + key + '-"' + (r.fixed ? ' disabled' : '') + ' aria-label="Diminuir ' + label + '">−</button><b>' + val + '</b><button type="button" class="btn btn--sm" data-room="' + key + '+"' + (r.fixed ? ' disabled' : '') + ' aria-label="Aumentar ' + label + '">+</button></div>';
      h += step('Largura', 'w', r.w) + step('Altura', 'h', r.h);
      h += '<button type="button" class="btn btn--sm" data-room="floor"' + (r.fixed ? ' disabled' : '') + '>Piso · ' + (r.floor === 'carpet' ? 'carpete' : 'técnico') + '</button>';
      h += '<button type="button" class="btn btn--sm" data-room="add-e">+ Espaço a leste</button>';
      h += '<button type="button" class="btn btn--sm" data-room="add-s">+ Espaço ao sul</button>';
      if (!r.fixed && r.id !== 'hall') h += '<button type="button" class="btn btn--sm" data-room="del">Remover espaço</button>';
      h += '</div>';
      el.room.innerHTML = h;
    }

    function renderInspector() {
      const e = B.sel;
      if (!e || !B.active) { el.insp.classList.remove('is-on'); return; }
      const why = lockReason(e);
      const def = DEF[e.kind];
      let h = '<div class="insp__head"><span class="eyebrow-sm">' + DL.itemName(e) + '</span>' + (e.id ? '<b>' + e.id + '</b>' : '') + '</div>';
      if (why) h += '<p class="insp__note">' + why + '</p>';
      else {
        h += '<div class="insp__actions">';
        h += '<button type="button" class="btn btn--sm" data-ins="move">Mover <kbd>M</kbd></button>';
        if (def && def.rot) h += '<button type="button" class="btn btn--sm" data-ins="rotate">Girar <kbd>R</kbd></button>';
        h += '<button type="button" class="btn btn--sm" data-ins="remove">Remover <kbd>Del</kbd></button></div>';
        if (e.units) {
          const n = e.units.filter(Boolean).length;
          h += '<p class="insp__note">' + n + ' / 9 unidades' + (n ? ' · <button type="button" class="linkbtn" data-ins="unit">tirar a última</button>' : ' · use Servidor ou Switch do catálogo') + '</p>';
        }
      }
      el.insp.innerHTML = h;
      el.insp.classList.add('is-on');
    }

    const HINTS = {
      select: 'Clique para selecionar · arraste para mover · <kbd>R</kbd> gira · <kbd>Del</kbd> remove · <kbd>WASD</kbd> câmera · roda do mouse: zoom',
      place: 'Clique para posicionar · <kbd>R</kbd> gira · botão direito ou <kbd>Esc</kbd> cancela',
      mount: 'Clique no objeto de destino · botão direito ou <kbd>Esc</kbd> cancela',
      remove: 'Clique em um objeto para removê-lo · <kbd>Esc</kbd> volta para seleção',
      move: 'Clique para soltar · <kbd>R</kbd> gira · <kbd>Esc</kbd> cancela',
      room: 'Clique em um espaço para selecioná-lo · ajuste o tamanho ou adicione novos espaços',
    };

    function syncUi() {
      el.dock.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.dataset.tab === B.tab;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      el.dock.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('is-on', B.tool === b.dataset.tool && !B.def));
      el.items.hidden = B.tab === 'room';
      el.room.hidden = B.tab !== 'room';
      el.items.querySelectorAll('.cat-item').forEach((b) => b.classList.toggle('is-on', !!B.def && b.dataset.def === B.def.id));
      const mode = B.move ? 'move' : B.def ? (B.def.mount ? 'mount' : 'place') : B.tab === 'room' ? 'room' : B.tool;
      el.hint.innerHTML = HINTS[mode];
      game.setCursor(B.move || B.def ? 'crosshair' : B.tool === 'remove' ? 'not-allowed' : '');
    }

    function setTab(t) {
      cancelPlace();
      B.tab = t;
      if (t === 'room') { B.roomIdx = Math.max(0, Math.min(B.roomIdx, world.rooms.length - 1)); renderRoom(); select(null); }
      else renderCatalog();
      syncUi();
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
      if (b.dataset.tab) setTab(b.dataset.tab);
      else if (b.dataset.tool) { cancelPlace(); B.tool = b.dataset.tool; select(null); syncUi(); }
      else if (b.dataset.def) chooseDef(b.dataset.def);
      else if (b.dataset.roomPick) { B.roomIdx = +b.dataset.roomPick; renderRoom(); }
      else if (b.dataset.room) {
        const a = b.dataset.room, i = B.roomIdx;
        if (a === 'w-') resizeRoom(i, -1, 0);
        else if (a === 'w+') resizeRoom(i, 1, 0);
        else if (a === 'h-') resizeRoom(i, 0, -1);
        else if (a === 'h+') resizeRoom(i, 0, 1);
        else if (a === 'floor') toggleFloor(i);
        else if (a === 'add-e') addRoom(i, 'e');
        else if (a === 'add-s') addRoom(i, 's');
        else if (a === 'del') removeRoom(i);
      }
      b.blur();
    });

    el.insp.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ins]');
      if (!b || !B.sel) return;
      const e = B.sel;
      if (b.dataset.ins === 'move') startMove(e, false);
      else if (b.dataset.ins === 'rotate') { rotate(e); renderInspector(); }
      else if (b.dataset.ins === 'remove') removeItem(e);
      else if (b.dataset.ins === 'unit') { removeUnit(e); renderInspector(); }
    });
    el.insp.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- input ---------- */
    function pointerMove(sx, sy) {
      const w = scene.screenToWorld(sx, sy);
      B.mouse = { sx, sy, wx: w.x, wy: w.y };
      if (B.pan) {
        scene.cam.x = B.pan.cx - (sx - B.pan.sx) * scene.dpr / scene.S;
        scene.cam.y = B.pan.cy - (sy - B.pan.sy) * scene.dpr / scene.S;
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
      else if (B.tab !== 'room') B.hover = pick(w.x, w.y);
    }

    function pointerDown(sx, sy, button) {
      if (button === 2) { rightClick(); return; }
      pointerMove(sx, sy);
      const m = B.mouse;
      if (B.move) { dropMove(); return; }
      if (B.def) { place(); B.ghost = ghostAt(m.wx, m.wy); return; }
      if (B.tab === 'room') {
        const tx = Math.floor(m.wx / T), ty = Math.floor(m.wy / T);
        const i = tx >= 0 && ty >= 0 && tx < world.W && ty < world.H ? world.roomAt[ty * world.W + tx] : -1;
        if (i >= 0) { B.roomIdx = i; renderRoom(); }
        B.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
        return;
      }
      if (B.tool === 'remove') { removeItem(pick(m.wx, m.wy)); B.hover = pick(m.wx, m.wy); return; }
      const it = pick(m.wx, m.wy);
      select(it);
      B.down = { sx, sy, item: it && !lockReason(it) ? it : null, cx: scene.cam.x, cy: scene.cam.y };
    }

    function pointerUp() {
      if (B.move && B.move.drag) dropMove();
      B.down = null;
      B.pan = null;
    }

    function rightClick() {
      if (B.move) cancelMove();
      else if (B.def) cancelPlace();
      else if (B.tool === 'remove') { B.tool = 'select'; syncUi(); }
      else select(null);
      syncUi();
    }

    function key(ev) {
      const c = ev.code;
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
          const e = B.move.e, def = DEF[e.kind];
          if (def && def.rot) { e.rot = (e.rot + 1) % 2; reshape(e); pos(e); updateMove(); }
        } else if (B.def) {
          if (B.def.rot) { B.rot = (B.rot + 1) % 2; if (B.mouse) B.ghost = ghostAt(B.mouse.wx, B.mouse.wy); }
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
      const x0 = Math.max(0, Math.floor(scene.ox / S / T)), y0 = Math.max(0, Math.floor(scene.oy / S / T));
      const x1 = Math.min(W - 1, Math.ceil((scene.ox + scene.canvas.width) / S / T)), y1 = Math.min(H - 1, Math.ceil((scene.oy + scene.canvas.height) / S / T));
      g.fillStyle = 'rgba(255,255,255,0.055)';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = world.tiles[y * W + x];
          if (t === '#' || t === 'g' || t === 'G') continue;
          const px = Math.round(x * T * S - scene.ox), py = Math.round(y * T * S - scene.oy);
          g.fillRect(px, py, Math.round(T * S), 1);
          g.fillRect(px, py, 1, Math.round(T * S));
        }
      }
      if (B.tab === 'room') {
        world.rooms.forEach((r, i) => {
          const on = i === B.roomIdx;
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, on ? 'rgba(160,195,236,0.06)' : null, on ? 'rgba(160,195,236,0.7)' : 'rgba(255,255,255,0.14)');
        });
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
      const ghost = B.move ? B.move.group : B.ghost && B.ghost.group;
      if (ghost) {
        g.globalAlpha = 0.78;
        for (const e of ghost.slice().sort((a, b) => a.sortY - b.sortY)) DL.drawItem(g, e, sc.t);
        g.globalAlpha = 1;
      }
      if (B.ghost && B.def && B.def.mount === 'rack' && B.ghost.mount && !B.ghost.reason) {
        const r = B.ghost.mount, k = r.units.indexOf(null);
        const a = 0.5 + 0.35 * Math.sin(sc.t * 6);
        g.fillStyle = 'rgba(126,224,161,' + a.toFixed(3) + ')';
        g.fillRect(r.px + 3, r.py - 15 + k * 3, 10, 2);
      }
    }

    // DOM bits anchored to the world: inspector card + reason tooltip
    function updateUi() {
      if (!B.active) return;
      if (B.sel && el.insp.classList.contains('is-on')) {
        const b = B.sel.bounds || { x: B.sel.px, y: B.sel.py, w: 16, h: 16 };
        const p = scene.worldToScreen(b.x + b.w / 2, b.y - 4);
        el.insp.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
      const reason = B.move ? B.move.reason : B.ghost && B.ghost.reason;
      const now = performance.now();
      const text = B.tipUntil > now ? B.tipText : reason;
      if (text && B.mouse) {
        if (el.tip.textContent !== text) el.tip.textContent = text;
        el.tip.style.transform = 'translate(' + (B.mouse.sx + 14) + 'px,' + (B.mouse.sy + 16) + 'px)';
        el.tip.classList.add('is-on');
        el.tip.classList.toggle('is-warn', true);
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
      // exposed for automated checks
      api: { place: (id, tx, ty, rot) => { B.def = DEF[id]; B.rot = rot || 0; B.ghost = ghostAt(tx * T + (B.def.w || 1) * 8, ty * T + (B.def.h || 1) * 8); const r = B.ghost.reason; place(); B.def = null; B.ghost = null; return r; }, removeItem, rotate, startMove, dropMove, resizeRoom, addRoom, removeRoom, select, commit, check },
    };
  };
})();
