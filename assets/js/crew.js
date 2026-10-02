/* DataLab — crew: character creator (team + the player's own character), pathfinding, workstations,
   the team panel and the crew's autonomous behaviour.
   Every member always has a job (see jobs.js): a real task of their role, picked by the player
   ("Atribuir tarefa") or by themselves. Jobs move them around:
   pc: going → sitting → working → standing · equip/fix: toEquip → inspecting · spot: toSpot → atSpot
   patrol: walks room to room · visit: toVisit → talking. Finishing a job gives experience, trains a
   skill and usually ends with a message in the team chat. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);

  /* ------------------------------------------------------------------ */
  /* Roles + appearance options                                          */
  /* ------------------------------------------------------------------ */
  const ROLES = {
    redes: { name: 'Redes', title: 'Técnico(a) de redes', color: '#a0c3ec', work: 'net', desc: 'Switches, cabos e conectividade.' },
    servidores: { name: 'Servidores', title: 'Técnico(a) de servidores', color: '#ffc285', work: 'srv', desc: 'Instala e mantém o hardware.' },
    sysadmin: { name: 'Sysadmin', title: 'Administrador(a) de sistemas', color: '#c4b5fd', work: 'code', desc: 'Sistemas, alertas e incidentes.' },
    seguranca: { name: 'Segurança', title: 'Segurança', color: '#ff7a17', work: 'cam', desc: 'Rondas, acessos e câmeras.' },
    funcionario: { name: 'Assistente', title: 'Assistente', color: '#dadbdf', work: 'doc', desc: 'Chamados, inventário e documentação.' },
    gerente: { name: 'Gerente', title: 'Gerente', color: '#7ee0a1', work: 'kpi', desc: 'Indicadores, capacidade e equipe.' },
  };
  const ROLE_IDS = Object.keys(ROLES); // the built-in roles (random hires pick from these)
  DL.ROLES = ROLES;
  // every role, including the ones the player created (roles.js adds them to ROLES)
  const allRoleIds = () => Object.keys(ROLES);

  const SKINS = ['#f5d3b8', '#f2c8a0', '#e0ac7e', '#c98e66', '#8d5a3b', '#5e3a26'];
  const HAIRS = ['#0f0b0a', '#2a1c16', '#5a3a25', '#b8562c', '#d9b26a', '#c9c9c9', '#7c3aed', '#3d5a80'];
  const CLOTHES = ['#2f3a4d', '#3b4250', '#232a36', '#7c3aed', '#a0c3ec', '#c4b5fd', '#ffc285', '#e9e9e6', '#1f6f5c', '#8a2d3b'];
  const PANTS = ['#232a36', '#1b1f27', '#2a3140', '#3a3f49', '#4a3a2a', '#1f2d44'];
  const BODIES = [['f', 'Feminina'], ['m', 'Masculina'], ['n', 'Neutra']];
  const STYLES = [['short', 'Curto'], ['buzz', 'Raspado'], ['curly', 'Cacheado'], ['afro', 'Black'], ['bun', 'Coque'], ['ponytail', 'Rabo'], ['long', 'Longo'], ['bob', 'Chanel']];
  const OUTFITS = [['tee', 'Camiseta'], ['shirt', 'Camisa'], ['hoodie', 'Moletom'], ['blazer', 'Blazer'], ['uniform', 'Uniforme']];
  const HATS = [['', 'Nenhum'], ['cap', 'Boné'], ['beanie', 'Gorro']];
  const EXTRAS = [['glasses', 'Óculos'], ['beard', 'Barba'], ['headset', 'Headset'], ['earrings', 'Brincos'], ['vest', 'Colete']];
  const NAMES = {
    f: ['Ana', 'Bruna', 'Camila', 'Larissa', 'Fernanda', 'Patrícia', 'Luana', 'Beatriz', 'Isabela', 'Renata', 'Carla', 'Yasmin', 'Marina'],
    m: ['Pedro', 'Lucas', 'Gabriel', 'Thiago', 'Rodrigo', 'Felipe', 'Diego', 'André', 'Caio', 'Vinícius', 'Mateus', 'Bruno'],
    n: ['Alex', 'Sam', 'Dani', 'Kim', 'Rafa', 'Jô', 'Gabi', 'Nic', 'Cris', 'Val'],
  };
  const MAX_CREW = 12;

  function lookOf(p) {
    const r = ROLES[p.role] || ROLES.funcionario;
    return {
      skin: p.skin, hair: p.hair, hairStyle: p.hairStyle, shirt: p.shirt, pants: p.pants, shoes: p.shoes || '#16181d',
      body: p.body, outfit: p.outfit, vest: p.vest ? '#5a6170' : null, glasses: p.glasses, beard: p.beard, earrings: p.earrings,
      hat: p.hat || null, capColor: r.color, headset: p.headset,
      role: p.role, roleColor: r.color, badge: r.color, lanyard: r.color,
    };
  }
  DL.crewLook = lookOf;

  /* ------------------------------------------------------------------ */
  /* Navigation: A* on the tile grid, diagonals without corner cutting,  */
  /* then string-pulling with the scene's own collision test.            */
  /* ------------------------------------------------------------------ */
  DL.createNav = function (scene) {
    const SQ2 = Math.SQRT2;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
    const w = () => scene.world;
    const center = (tx, ty) => ({ x: tx * T + 8, y: ty * T + 12 });
    const tileOf = (x, y) => [Math.floor(x / T), Math.floor((y - 2) / T)];

    function free(tx, ty) {
      const W = w();
      return tx >= 0 && ty >= 0 && tx < W.W && ty < W.H && W.solid[ty * W.W + tx] === 0;
    }

    function astar(sx, sy, gx, gy) {
      const W = w(), WW = W.W, N = WW * W.H, solid = W.solid;
      const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const heap = [];
      const push = (f, i) => {
        heap.push([f, i]);
        let k = heap.length - 1;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (heap[p][0] <= heap[k][0]) break;
          [heap[p], heap[k]] = [heap[k], heap[p]];
          k = p;
        }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1, r = l + 1;
            let m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]];
            k = m;
          }
        }
        return top;
      };
      const h = (x, y) => {
        const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
      };
      const s = sy * WW + sx, goal = gy * WW + gx;
      g[s] = 0;
      push(h(sx, sy), s);
      while (heap.length) {
        const i = pop()[1];
        if (closed[i]) continue;
        closed[i] = 1;
        if (i === goal) break;
        const x = i % WW, y = (i / WW) | 0;
        for (const [dx, dy, c] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= WW || ny >= W.H) continue;
          const n = ny * WW + nx;
          if (solid[n] || closed[n]) continue;
          if (dx && dy && (solid[y * WW + nx] || solid[ny * WW + x])) continue;
          const ng = g[i] + c;
          if (ng < g[n]) {
            g[n] = ng;
            from[n] = i;
            push(ng + h(nx, ny), n);
          }
        }
      }
      if (!closed[goal]) return null;
      const out = [];
      for (let i = goal; i !== -1; i = from[i]) out.push([i % WW, (i / WW) | 0]);
      return out.reverse();
    }

    function clear(a, b) {
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 2));
      for (let i = 1; i <= n; i++) {
        if (scene.hits(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
      }
      return true;
    }

    function smooth(pts) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !clear(pts[i], pts[j])) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }

    function nearestFree(tx, ty, maxR) {
      if (free(tx, ty)) return [tx, ty];
      const W = w(), seen = new Set([tx + ',' + ty]), q = [[tx, ty, 0]];
      while (q.length) {
        const [x, y, d] = q.shift();
        if (d > (maxR || 8)) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k) || nx < 0 || ny < 0 || nx >= W.W || ny >= W.H) continue;
          seen.add(k);
          if (free(nx, ny)) return [nx, ny];
          q.push([nx, ny, d + 1]);
        }
      }
      return null;
    }

    // Route from a pixel position to a pixel goal; `exact` keeps the goal point instead of the tile centre.
    function route(x, y, gx, gy, exact) {
      let [sx, sy] = tileOf(x, y);
      const W = w();
      sx = Math.max(0, Math.min(W.W - 1, sx));
      sy = Math.max(0, Math.min(W.H - 1, sy));
      const gt = nearestFree.apply(null, tileOf(gx, gy));
      if (!gt) return null;
      const path = astar(sx, sy, gt[0], gt[1]);
      if (!path) return null;
      const pts = path.map(([tx, ty]) => center(tx, ty));
      pts[0] = { x, y };
      if (exact && gt[0] === tileOf(gx, gy)[0] && gt[1] === tileOf(gx, gy)[1]) pts.push({ x: gx, y: gy });
      return smooth(pts).slice(1);
    }

    function length(x, y, r) {
      let d = 0, px = x, py = y;
      for (const p of r) { d += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
      return d;
    }

    // A random walkable spot somewhere in the building (rooms weighted by area).
    function randomSpot() {
      const W = w(), rooms = W.rooms || [{ x: 1, y: 2, w: W.W - 2, h: W.H - 3 }];
      const total = rooms.reduce((s, r) => s + r.w * r.h, 0);
      for (let n = 0; n < 24; n++) {
        let k = rand() * total, r = rooms[0];
        for (const q of rooms) { k -= q.w * q.h; if (k <= 0) { r = q; break; } }
        const tx = r.x + Math.floor(rand() * r.w), ty = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 1));
        if (!free(tx, ty)) continue;
        if (W.keepClear && W.keepClear.has(tx + ',' + ty)) continue;
        return center(tx, ty);
      }
      return null;
    }

    return { route, length, randomSpot, nearestFree, free, center, tileOf, clear };
  };

  // Follow a.route at `speed` px/s. Returns true once the last point is reached.
  function walk(a, dt, speed) {
    const r = a.route;
    if (!r || !r.length) { a.moving = false; return true; }
    let step = speed * dt, moved = 0, dx = 0, dy = 0;
    while (step > 0 && r.length) {
      const p = r[0];
      dx = p.x - a.x;
      dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= step) {
        a.x = p.x;
        a.y = p.y;
        step -= d;
        moved += d;
        r.shift();
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
        moved += step;
        step = 0;
      }
    }
    if (!a.moving) a.dist = 0;
    a.moving = moved > 0.01;
    a.dist += moved;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) a.dir = DL.dirOf(dx, dy);
    return r.length === 0;
  }

  // Someone standing right where the actor is heading?
  function blockedBy(a, p) {
    const r = a.route;
    if (!p || !r || !r.length) return false;
    const dx = r[0].x - a.x, dy = r[0].y - a.y, d = Math.hypot(dx, dy) || 1;
    return Math.hypot(p.x - (a.x + (dx / d) * 12), p.y - (a.y + (dy / d) * 12)) < 11;
  }

  /* ------------------------------------------------------------------ */
  /* Extra wandering NPCs                                                */
  /* ------------------------------------------------------------------ */
  const WANDERERS = [
    {
      id: 'theo', name: 'Theo', role: 'Facilities', look: 'theo', wander: true,
      lines: {
        calm: ['Cada móvel novo muda o fluxo de ar. Planeje antes de encher a sala.', 'Precisa de mais espaço? Com B dá para esticar as paredes.'],
        incident: ['Ouvi o alarme do NOC. Energia está ok — o nobreak nem piscou.', 'Não é refrigeração: os CRACs estão estáveis. Olha a rede.'],
        done: ['Agora a sala é sua. Tecla B e mãos à obra.', 'Mais gente precisa de mais estações. Tecla C para contratar.'],
      },
    },
    {
      id: 'bia', name: 'Bia', role: 'Analista de sistemas', look: 'bia', wander: true,
      lines: {
        calm: ['Estou rodando a checagem de backups da madrugada.', 'Gosto de dar uma volta entre os racks. Ajuda a pensar.'],
        incident: ['Meus servidores da fileira B estão de pé, mas ninguém chega neles.', 'Ping para o db-01 morreu. Fileira B inteira fora.'],
        done: ['db-01 respondendo de novo. Valeu!', 'Se contratar alguém de sysadmin, me apresenta.'],
      },
    },
  ];
  DL.LOOKS.bia = { skin: '#5e3a26', hair: '#0f0b0a', hairStyle: 'afro', shirt: '#1f6f5c', pants: '#1b1f27', shoes: '#eceff3', body: 'f', outfit: 'hoodie', glasses: true, role: 'sysadmin', roleColor: '#c4b5fd', badge: '#c4b5fd', lanyard: '#c4b5fd' };

  /* ------------------------------------------------------------------ */
  /* Crew manager                                                        */
  /* ------------------------------------------------------------------ */
  const XP = DL.XP, JOBS = DL.JOBS, TALK = DL.TALK;
  const FIX_GRACE = 45; // seconds the player gets to fix a found fault before the crew takes it alone
  const PLAYER_KEY = 'datalab.player.v1';
  const DEFAULT_PLAYER = {
    name: 'Alex', body: 'n', skin: '#f2c8a0', hair: '#2a1c16', hairStyle: 'short', outfit: 'tee', shirt: '#7c3aed', pants: '#232a36',
    shoes: '#eceff3', vest: false, glasses: false, beard: false, headset: false, earrings: false, hat: '', role: 'gerente',
  };
  // fallback when nothing in the building needs the role: get to know the place (still a reason to move)
  const EXPLORE = { id: 'explore', name: 'Reconhecer o espaço', verb: 'Conhecendo o espaço', kind: 'patrol', skill: 'gestao', xp: 4, dur: [0, 0], auto: 1, finish: () => null };

  DL.createCrew = function (game) {
    const scene = game.scene;
    const world = () => scene.world;
    const nav = DL.createNav(scene);
    const chat = DL.createTeamChat(game);
    game.chat = chat;
    const $ = (id) => document.getElementById(id);
    const el = {
      panel: $('crewPanel'), list: $('crewList'), count: $('crewCount'), hire: $('hireBtn'),
      card: $('crewCard'), tags: $('nametags'),
      creator: $('creator'), form: $('creatorForm'), canvas: $('creatorCanvas'), poseSeg: $('creatorPose'),
      save: $('creatorSave'), cancel: $('creatorCancel'), random: $('creatorRandom'), title: $('creatorTitle'), sub: $('creatorSub'),
      me: $('meBtn'), meName: $('meName'), meRole: $('meRole'), meFace: $('meFace'),
    };
    const C = { assigned: 0, created: 0, members: [], leaving: [], sel: null, hover: null, mode: 'explore', seq: 0, cardKey: '', uiAcc: 0, down: null, pan: null, recent: [] };

    /* ---------- NPCs: route around furniture instead of walking straight ---------- */
    for (const def of game.wanderers === false ? [] : WANDERERS) {
      const sp = nav.randomSpot() || world().spawn;
      const a = new DL.Actor(DL.LOOKS[def.look], sp.x, sp.y, 'down');
      Object.assign(a, { def, i: 0, wait: between(0.5, 2), talkT: 0, lineIdx: 0 });
      scene.npcs.push(a);
    }
    scene.refreshWorld(false);

    scene.updateNpc = function (n, dt) {
      n.tick(dt);
      const p = this.player;
      if (n.talkT > 0) {
        n.talkT -= dt;
        n.moving = false;
        if (p) n.dir = DL.dirOf(p.x - n.x, p.y - n.y);
        return;
      }
      if (n.wait > 0) {
        n.wait -= dt;
        n.moving = false;
        return;
      }
      if (!n.route) {
        const goal = n.def.wander ? nav.randomSpot() : n.def.path[n.i];
        n.route = goal ? nav.route(n.x, n.y, goal.x, goal.y) : null;
        if (!n.route) {
          if (!n.def.wander) n.i = (n.i + 1) % n.def.path.length;
          n.wait = 0.8;
          return;
        }
        n.blockT = 0;
      }
      if (blockedBy(n, p) && (n.blockT += dt) < 2.5) {
        n.moving = false;
        return;
      }
      if (walk(n, dt, 30)) {
        n.route = null;
        n.moving = false;
        if (n.def.wander) n.wait = between(1.5, 4.5);
        else {
          n.wait = n.def.waits[n.i] || 0;
          n.i = (n.i + 1) % n.def.path.length;
          if (n.wait > 0.8) n.dir = n.y < 9 * T ? 'up' : n.dir;
        }
      }
    };

    /* ---------- the player's own character ---------- */
    const PL = { profile: null };
    function loadPlayer() {
      let p = null;
      try { p = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'); } catch (e) { p = null; }
      PL.profile = Object.assign({}, DEFAULT_PLAYER, p && typeof p === 'object' ? p : {});
      if (!ROLES[PL.profile.role]) PL.profile.role = DEFAULT_PLAYER.role;
    }
    function applyPlayer(save) {
      const pl = game.player;
      const L = lookOf(PL.profile);
      if (pl) { pl.look = L; pl.sheet = DL.makeSheet(L); }
      if (save) { try { localStorage.setItem(PLAYER_KEY, JSON.stringify(PL.profile)); } catch (e) { /* private mode: keep it for this session */ } }
      if (el.meName) {
        const r = ROLES[PL.profile.role];
        el.meName.textContent = PL.profile.name;
        el.meRole.textContent = r.name;
        el.meRole.style.color = r.color;
        drawFace(el.meFace, pl ? pl.sheet : DL.makeSheet(L));
      }
    }
    function drawFace(cv, sheet) {
      if (!cv) return;
      const k = 2;
      cv.width = 16 * k;
      cv.height = 16 * k;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
    }
    loadPlayer();
    applyPlayer(false);
    if (el.me) el.me.addEventListener('click', () => { el.me.blur(); openCreator('player'); });
    const playerName = () => PL.profile.name;

    /* ---------- stations ---------- */
    const itemAt = (tx, ty, pred) => world().items.find((e) => !e.host && pred(e) && tx >= e.tx && tx < e.tx + e.tw && ty >= e.ty && ty < e.ty + e.th);

    function deskStation(d) {
      if (!d.chair || world().items.indexOf(d.chair) < 0) return null;
      const r1 = d.rot === 1, x = d.px + 16;
      return {
        key: d, seat: d.chair, screen: d, label: d.id || 'Computador', dir: r1 ? 'down' : 'up',
        approach: { x, y: d.chair.py + 12 }, sit: { x, y: r1 ? d.py - 2 : d.py + 20 },
        sortKey: r1 ? d.sortY + 0.5 : null, focus: d,
      };
    }

    function chairStation(c) {
      const r1 = c.rot === 1, tx = c.tx, ty = c.ty + (r1 ? 1 : -1);
      const table = itemAt(tx, ty, (e) => e.kind === 'table');
      if (!table) return null;
      const mon = world().items.find((e) => e.kind === 'monitor' && e.host === table && e.tx === tx && e.ty === ty);
      if (!mon) return null;
      return {
        key: c, seat: c, screen: mon, label: 'Mesa com monitor', dir: r1 ? 'down' : 'up',
        approach: { x: c.px + 8, y: c.py + 12 }, sit: { x: c.px + 8, y: r1 ? c.py + 14 : c.py + 4 },
        sortKey: r1 ? table.sortY + 0.3 : null, focus: mon,
      };
    }

    function stationOf(e) {
      if (!e || world().items.indexOf(e) < 0) return null;
      if (e.kind === 'desk') return deskStation(e);
      if (e.kind === 'chair') return e.parent ? deskStation(e.parent) : chairStation(e);
      if (e.kind === 'monitor' && e.host) {
        for (const c of world().items) {
          if (c.kind !== 'chair' || c.parent) continue;
          const s = chairStation(c);
          if (s && s.screen === e) return s;
        }
      }
      if (e.kind === 'table') {
        for (const c of world().items) {
          if (c.kind !== 'chair' || c.parent) continue;
          const s = chairStation(c);
          if (s && s.screen.host === e) return s;
        }
      }
      return null;
    }

    function stations() {
      const out = [];
      for (const e of world().items) {
        const s = e.kind === 'desk' ? deskStation(e) : e.kind === 'chair' && !e.parent ? chairStation(e) : null;
        if (s) out.push(s);
      }
      return out;
    }

    const userOf = (s) => C.members.find((a) => a.crew.station && a.crew.station.key === s.key) || null;

    function nearestStation(a, ok) {
      let best = null, bestD = Infinity, bestR = null;
      for (const s of stations()) {
        if (ok && !ok(s)) continue;
        const u = userOf(s);
        if (u && u !== a) continue;
        const r = nav.route(a.x, a.y, s.approach.x, s.approach.y, true);
        if (!r) continue;
        const d = nav.length(a.x, a.y, r);
        if (d < bestD) { bestD = d; best = s; bestR = r; }
      }
      return best ? { s: best, r: bestR } : null;
    }

    /* ---------- places ---------- */
    function reception() {
      const W = world();
      const r = (W.rooms || []).find((x) => /entrada|recep/i.test(x.name));
      if (r) {
        const t = nav.nearestFree(r.x + Math.floor(r.w / 2), r.y + r.h - 2, 6);
        if (t) return Object.assign(nav.center(t[0], t[1]), { label: r.name });
      }
      return { x: W.spawn.x, y: W.spawn.y, label: 'Recepção' };
    }

    function spotInRoom(r) {
      for (let n = 0; n < 16; n++) {
        const tx = r.x + Math.floor(rand() * r.w), ty = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 1));
        if (nav.free(tx, ty)) return nav.center(tx, ty);
      }
      return null;
    }

    function patrolSpots() {
      const rooms = (world().rooms || []).slice().sort(() => rand() - 0.5);
      const out = [];
      for (const r of rooms) { const p = spotInRoom(r); if (p) out.push(p); if (out.length >= 4) break; }
      while (out.length < 3) { const p = nav.randomSpot(); if (!p) break; out.push(p); }
      return out;
    }

    // where to stand to work on an item (in front of it) — or the point itself
    function standAt(t) {
      if (t.crew) return { x: t.x, y: t.y };
      if (t.ix != null) return { x: t.ix, y: t.iy - 3 };
      return { x: t.x, y: t.y };
    }

    function install(rack) {
      const k = rack.units.indexOf(null);
      if (k < 0 || !game.builder) return null;
      rack.units[k] = 'server';
      DL.syncRack(rack);
      game.builder.api.commit({ installed: rack });
      return game.ops ? game.ops.devices().find((d) => d.rack === rack && d.slot === k) : null;
    }

    const ctxOf = (a) => ({ a, c: a.crew, stats: a.crew.stats, world: world(), ops: game.ops, members: C.members, player: playerName(), reception, install });

    /* ---------- members ---------- */
    function frameOf() {
      const c = this.crew;
      if (c.seated) {
        const set = c.sit[c.sitDir];
        if (c.pose === 'R' && this.blinkT > 0) return set.blink;
        return set[c.pose] || set.R;
      }
      return DL.Actor.prototype.frame.call(this);
    }

    function applyLook(a) {
      const L = lookOf(a.crew.profile);
      a.look = L;
      a.sheet = DL.makeSheet(L);
      a.crew.sit = DL.makeSitSheet(L);
    }

    function spawnPoint() {
      const ref = C.mode === 'explore' && game.player ? game.player : scene.cam;
      const t = nav.nearestFree(Math.floor(ref.x / T), Math.floor((ref.y - 2) / T), 12) || nav.tileOf(world().spawn.x, world().spawn.y);
      return nav.center(t[0], t[1]);
    }

    const roleOf = (a) => ROLES[a.crew.profile.role] || ROLES.funcionario;
    const alive = (a) => C.members.indexOf(a) >= 0;

    function hire(profile, opts) {
      opts = opts || {};
      if (C.members.length >= MAX_CREW) { game.toast('warn', 'Equipe cheia', 'Limite de ' + MAX_CREW + ' pessoas no turno'); return null; }
      const sp = opts.at || spawnPoint();
      const a = new DL.Actor(lookOf(profile), sp.x, sp.y, 'down');
      a.crew = {
        id: ++C.seq, profile, name: profile.name, stats: opts.stats || XP.newStats(profile.role, opts.level),
        state: 'idle', wait: between(0.6, 1.6), pose: 'R', seated: false, sitDir: 'up', station: null, job: null, alertT: 0,
        hold: false, menu: false, talkT: 0, lastSocial: -40,
      };
      a.frame = frameOf;
      applyLook(a);
      const others = C.members.slice();
      C.members.push(a);
      scene.actors.push(a);
      scene.refreshWorld(false);
      if (!opts.silent) {
        game.toast('ok', 'Contratação', profile.name + ' · ' + ROLES[profile.role].title + ' entrou para a equipe');
        chat.post(a, pick(['Oi, pessoal! Sou ' + profile.name + ', ' + ROLES[profile.role].title.toLowerCase() + '. Bora trabalhar!', 'Olá, time! ' + profile.name + ' aqui, cuidando de ' + ROLES[profile.role].desc.toLowerCase().replace(/\.$/, '') + '.']));
        const w = pick(others);
        if (w) chat.later(between(1.6, 2.6), () => { if (alive(w) && alive(a)) chat.post(w, pick(['Boas-vindas, ' + profile.name + '! 👋', 'Seja bem-vindo(a), ' + profile.name + '! Qualquer coisa, chama.'])); });
        select(a);
      }
      renderList();
      return a;
    }

    // Dismissed: sad (crying), walks out to the reception, then fades away.
    function fire(a) {
      const c = a.crew;
      if (c.seated || c.state === 'sitting' || c.state === 'standing') {
        const s = c.station;
        if (s) { a.x = s.approach.x; a.y = s.approach.y; }
      }
      release(a);
      c.job = null;
      c.hold = false;
      c.menu = false;
      c.state = 'leaving';
      c.leave = { phase: 'cry', t: 2.6 };
      a.route = null;
      a.moving = false;
      a.dir = 'down';
      C.members = C.members.filter((m) => m !== a);
      for (const m of C.members) if (m.crew.talkWith === a) { m.crew.talkT = 0; m.crew.talkWith = null; }
      C.leaving.push(a);
      if (C.sel === a) select(null);
      game.toast('info', 'Dispensado', c.name + ' encerrou o turno');
      chat.post(a, pick(['Poxa… foi bom trabalhar com vocês. 😢', 'Vou sentir falta desse barulho de ventoinha… 😢']), { tone: 'sad' });
      a.bubble = { text: '😢', left: 9, tone: 'sad' };
      const w = pick(C.members);
      if (w) chat.later(2.2, () => { if (alive(w)) chat.post(w, pick(['Vamos sentir sua falta, ' + c.name + '.', 'Boa sorte, ' + c.name + '! Mantém contato.'])); });
      renderList();
    }

    function release(a) {
      const c = a.crew, s = c.station;
      if (s) {
        s.screen.work = null;
        s.screen.typing = false;
      }
      c.station = null;
      c.seated = false;
      a.sortKey = null;
      a.noShadow = false;
    }

    function standUp(a) {
      const c = a.crew;
      if (!c.seated && c.state !== 'sitting' && c.state !== 'working') {
        release(a);
        c.state = 'idle';
        c.wait = between(0.4, 1);
        a.route = null;
        return;
      }
      const s = c.station;
      c.glide = { from: { x: a.x, y: a.y }, to: s ? s.approach : { x: a.x, y: a.y }, t: 0, dur: 0.3 };
      if (s) { s.screen.work = null; s.screen.typing = false; }
      c.seated = false;
      a.sortKey = null;
      a.noShadow = false;
      c.state = 'standing';
    }

    /* ---------- jobs ---------- */
    const tasksOf = (a) => JOBS.BY_ROLE[a.crew.profile.role] || [];
    const busyWith = (t, except) => C.members.some((m) => m !== except && m.crew.job && m.crew.job.target === t);

    // What a task can be done on right now: { targets } or { reason }
    function optionsFor(a, def) {
      if (def.kind === 'pc') return stations().some((s) => (!def.stationOk || def.stationOk(s)) && (!userOf(s) || userOf(s) === a)) ? { targets: [null] } : { reason: def.stationOk ? 'Sem estação livre permitida para o cargo' : 'Sem computador livre' };
      if (def.kind === 'patrol') return { targets: [null] };
      const ts = def.targets(ctxOf(a)) || [];
      return ts.length ? { targets: ts } : { reason: def.none || 'Indisponível agora' };
    }

    // weighted choice that prefers what nobody else is doing (and, for orders, what is close)
    function chooseTarget(a, def, ts, nearest) {
      const w = (t) => (def.weight ? def.weight(t) : 1) * (busyWith(t, a) ? 0.12 : 1);
      if (def.kind === 'fix') return ts.slice().sort((x, y) => (x.fault.foundAt || 0) - (y.fault.foundAt || 0))[0];
      if (nearest) {
        let best = null, bestS = -1;
        for (const t of ts) {
          const p = standAt(def.place ? def.place(t) : t);
          const s = w(t) / (1 + Math.hypot(p.x - a.x, p.y - a.y) / 120);
          if (s > bestS) { bestS = s; best = t; }
        }
        return best;
      }
      let total = 0;
      for (const t of ts) total += w(t);
      let k = rand() * total;
      for (const t of ts) { k -= w(t); if (k <= 0) return t; }
      return ts[ts.length - 1];
    }

    // Start a job. Returns null when it started, or the reason it could not.
    function startJob(a, def, opts) {
      opts = opts || {};
      const c = a.crew;
      let target = opts.target || null;
      if (!target && def.kind !== 'pc' && def.kind !== 'patrol') {
        const o = optionsFor(a, def);
        if (!o.targets) return o.reason;
        target = chooseTarget(a, def, o.targets, !opts.auto);
      }
      const speed = XP.speedOf(c.stats, def.skill);
      const dur = between(def.dur[0], def.dur[1]) * speed;
      let route = null, station = null, place = null;
      if (def.kind === 'pc') {
        if (opts.station) {
          const u = userOf(opts.station);
          if (u && u !== a) return opts.station.label + ' já está com ' + u.crew.name;
          station = opts.station;
          route = nav.route(a.x, a.y, station.approach.x, station.approach.y, true);
        } else {
          const n = nearestStation(a, def.stationOk);
          if (!n) return 'Sem computador livre';
          station = n.s;
          route = n.r;
        }
      } else if (def.kind === 'patrol') {
        route = [];
      } else {
        place = def.place ? def.place(target) : target;
        const p = standAt(place);
        route = nav.route(a.x, a.y, p.x, p.y, def.kind !== 'visit');
      }
      if (!route) return 'Sem caminho até ' + (station ? station.label : JOBS.labelOf(place || target));
      if (c.seated || c.state === 'sitting') standUpNow(a);
      release(a);
      c.hold = false;
      c.menu = false;
      c.talkT = 0;
      c.job = { def, target, place, name: def.name, total: dur, left: dur, auto: !!opts.auto, label: station ? station.label : JOBS.labelOf(def.kind === 'fix' ? target : place || target) };
      a.route = route;
      a.blockT = 0;
      c.rerouteT = 1.2;
      if (def.kind === 'pc') { c.station = station; c.state = 'going'; }
      else if (def.kind === 'patrol') { c.spots = patrolSpots(); c.spotsTotal = c.spots.length || 1; c.pauseT = 0; c.state = 'patrol'; a.route = null; }
      else if (def.kind === 'spot') c.state = 'toSpot';
      else if (def.kind === 'visit') c.state = 'toVisit';
      else c.state = 'toEquip';
      if (def.social) c.lastSocial = scene.t;
      if (!opts.auto) {
        C.assigned++;
        game.toast('info', 'Tarefa atribuída', c.name + ' · ' + def.name + (c.job.label ? ' · ' + c.job.label : ''));
      }
      renderCard(true);
      return null;
    }

    // seated people asked to do something else get up first (instantly — the walk covers it)
    function standUpNow(a) {
      const s = a.crew.station;
      if (s) { a.x = s.approach.x; a.y = s.approach.y; }
      release(a);
    }

    function cancelJob(a, quiet) {
      const c = a.crew;
      c.job = null;
      if (c.seated || c.state === 'sitting' || c.state === 'working') standUp(a);
      else { release(a); c.state = 'idle'; c.wait = between(0.5, 1.2); a.route = null; }
      if (!quiet) renderCard(true);
    }

    function finishJob(a) {
      const c = a.crew, job = c.job;
      if (!job) return;
      const def = job.def;
      let res = null;
      try { res = def.finish(ctxOf(a), job.target); } catch (err) { console.warn('job', def.id, err); }
      c.stats.done++;
      XP.train(c.stats, def.skill, 2 + rand() * 1.6);
      if (DL.ROLE_SKILL[c.profile.role] !== def.skill) XP.train(c.stats, DL.ROLE_SKILL[c.profile.role], 0.8);
      let xp = def.xp * (job.auto ? 1 : 1.2);
      if (res && res.fixed) { c.stats.fixed++; xp += 10; }
      if (res && res.failed) xp *= 0.6;
      if (res && res.say) chat.post(a, res.say, { tone: res.tone === 'help' ? 'warn' : res.tone });
      if (res && res.reply) { const [w, line] = res.reply; chat.later(between(1.6, 2.4), () => { if (alive(w)) chat.post(w, line); }); }
      if (res && res.failed && job.target) askHelp(a, job.target, def);
      if (!job.auto) {
        game.toast('ok', 'Tarefa concluída', c.name + ' · ' + def.name);
        game.sfx('done');
      }
      if (!def.social && def.id !== 'explore') game.emit('job-done', { a, name: def.name, auto: job.auto, failed: !!(res && res.failed) });
      c.job = null;
      if (c.seated || c.state === 'working') standUp(a);
      else { c.state = 'idle'; c.wait = between(0.4, 1.1); a.route = null; }
      reward(a, xp);
      renderCard(true);
      renderList();
    }

    function reward(a, xp) {
      const c = a.crew;
      const ups = XP.gainXp(c.stats, c.profile.role, xp);
      if (!ups) return;
      const sk = DL.ROLE_SKILL[c.profile.role];
      const skName = (DL.SKILLS.find((s) => s[0] === sk) || ['', ''])[1];
      game.toast('ok', 'Evolução', c.name + ' subiu para o nível ' + c.stats.level + ' ' + '★'.repeat(XP.starsOf(c.stats, c.profile.role)));
      chat.post(a, pick(['Subi para o nível ' + c.stats.level + '! ' + skName + ' agora em ' + Math.round(c.stats.skills[sk]) + '.', 'Nível ' + c.stats.level + '! Cada tarefa ensina alguma coisa.', 'Nível ' + c.stats.level + ' 🎉 Já faço isso bem mais rápido.']), { tone: 'ok' });
      renderCard(true);
      renderList();
    }

    // can this member fix that fault?
    const fixDefFor = (a, d) => tasksOf(a).find((t) => t.kind === 'fix' && d.fault && t.types.indexOf(d.fault.type) >= 0);

    function askHelp(a, d, def) {
      if (d.fault) d.fault.help = true;
      const helpers = C.members.filter((m) => m !== a && fixDefFor(m, d) && !m.crew.hold).sort((x, y) => (y.crew.stats.skills[def.skill] || 0) - (x.crew.stats.skills[def.skill] || 0));
      const h = helpers[0];
      if (!h) return;
      chat.later(between(1.8, 2.8), () => {
        if (!alive(h) || !d.fault || busyWith(d)) return;
        chat.post(h, pick(['Eu ajudo, ' + a.crew.name + '! Indo aí.', 'Deixa comigo, ' + a.crew.name + '. Te mostro como faz.']));
        if (!h.crew.job || h.crew.job.auto) startJob(h, fixDefFor(h, d), { auto: true, target: d });
      });
    }

    // The autonomous part: always find something useful to do.
    function decide(a) {
      const c = a.crew, defs = tasksOf(a);
      // 1. problems first — after the player had a chance (or when someone asked for help)
      if (game.ops && !game.paused()) {
        for (const d of game.ops.devices()) {
          const f = d.fault;
          if (!f || !f.found || busyWith(d) || (f.botTried && scene.t - f.botTried < 90)) continue;
          const fd = fixDefFor(a, d);
          if (!fd) continue;
          if (!f.help && scene.t - (f.foundAt || scene.t) < FIX_GRACE) continue;
          if (!startJob(a, fd, { auto: true, target: d })) {
            chat.post(a, f.help ? 'Vou dar uma mão no ' + d.name + '.' : 'Ninguém pegou o ' + d.name + ' ainda. Estou indo resolver.');
            return;
          }
        }
      }
      // 2. the role's own work, weighted; now and then a short social moment
      const opts = [];
      for (const def of defs) {
        if (!def.auto) continue;
        const o = optionsFor(a, def);
        if (o.targets) opts.push([def, def.auto]);
      }
      if (scene.t - c.lastSocial > 45) {
        for (const def of JOBS.SOCIAL) {
          const o = optionsFor(a, def);
          if (o.targets) opts.push([def, 0.35]);
        }
      }
      while (opts.length) {
        let total = 0;
        for (const o of opts) total += o[1];
        let k = rand() * total, i = 0;
        for (; i < opts.length - 1; i++) { k -= opts[i][1]; if (k <= 0) break; }
        const def = opts[i][0];
        if (!startJob(a, def, { auto: true })) return;
        opts.splice(i, 1);
      }
      // 3. nothing to work on yet: walk the building
      if (startJob(a, Object.assign({}, EXPLORE, { skill: DL.ROLE_SKILL[c.profile.role] }), { auto: true })) c.wait = 1;
    }

    /* ---------- update ---------- */
    function walkStep(a, dt, sp) {
      if (blockedBy(a, game.player) && (a.blockT += dt) < 1.5) { a.moving = false; return false; }
      return walk(a, dt, sp);
    }
    const faceTo = (a, t) => { a.dir = DL.dirOf(t.x - a.x, t.y - a.y); };
    const speedOf = (a) => 34 + a.crew.stats.level * 0.8;

    function update(dt) {
      chat.update(dt);
      for (const a of C.members.slice()) {
        if (!alive(a)) continue;
        a.tick(dt);
        const c = a.crew;
        if (c.alertT > 0) c.alertT -= dt;
        if (c.hold && c.state !== 'sitting' && c.state !== 'standing') { holdStill(a); continue; }
        if (c.talkT > 0 && !c.seated && c.state !== 'sitting' && c.state !== 'standing' && c.state !== 'talking') {
          c.talkT -= dt;
          a.moving = false;
          if (c.talkWith) faceTo(a, c.talkWith);
          continue;
        }
        step(a, dt);
      }
      for (const a of C.leaving.slice()) stepLeaving(a, dt);
      for (const a of C.members.concat(C.leaving)) if (a.bubble && (a.bubble.left -= dt) <= 0) a.bubble = null;
      ambient(dt);
    }

    // selected: stop and look at the player (seated people just turn their head away from the screen)
    function holdStill(a) {
      const c = a.crew;
      a.moving = false;
      if (c.seated) {
        c.pose = 'L';
        if (c.station) c.station.screen.typing = false;
        return;
      }
      if (game.player) faceTo(a, game.player);
    }

    function step(a, dt) {
      const c = a.crew, job = c.job;
      switch (c.state) {
        case 'idle':
          a.moving = false;
          c.wait -= dt;
          if (c.wait <= 0) { c.wait = 0.8; decide(a); }
          break;
        case 'going':
          if (walkStep(a, dt, speedOf(a) + 6)) {
            const s = c.station;
            a.moving = false;
            a.route = null;
            c.glide = { from: { x: a.x, y: a.y }, to: s.sit, t: 0, dur: 0.3 };
            c.seated = true;
            c.sitDir = s.dir;
            c.pose = 'R';
            a.noShadow = true;
            a.sortKey = s.sortKey;
            c.state = 'sitting';
          }
          break;
        case 'sitting':
        case 'standing': {
          const gl = c.glide;
          gl.t = Math.min(1, gl.t + dt / gl.dur);
          const k = gl.t * gl.t * (3 - 2 * gl.t);
          a.x = gl.from.x + (gl.to.x - gl.from.x) * k;
          a.y = gl.from.y + (gl.to.y - gl.from.y) * k;
          if (c.state === 'standing') a.dir = 'down';
          if (gl.t >= 1) {
            if (c.state === 'sitting') {
              c.state = 'working';
              c.phase = 'type';
              c.phaseT = between(2, 4);
              c.poseT = 0;
            } else {
              release(a);
              c.state = 'idle';
              c.wait = between(0.4, 1.1);
              renderCard(true);
            }
          }
          break;
        }
        case 'working': {
          const s = c.station;
          c.phaseT -= dt;
          if (c.phaseT <= 0) {
            const r = rand();
            c.phase = c.phase !== 'type' ? 'type' : r < 0.6 ? 'rest' : 'look';
            c.phaseT = c.phase === 'type' ? between(2, 5) : c.phase === 'rest' ? between(1, 2.5) : between(0.6, 1.4);
          }
          if (c.phase === 'type') {
            c.poseT -= dt;
            if (c.poseT <= 0) { c.pose = c.pose === 'A' ? 'B' : 'A'; c.poseT = between(0.11, 0.19); }
          } else c.pose = c.phase === 'rest' ? 'R' : 'L';
          s.screen.work = roleOf(a).work;
          s.screen.typing = c.phase === 'type';
          if (!job) { standUp(a); break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        }
        case 'toEquip':
        case 'toSpot':
          if (walkStep(a, dt, speedOf(a) + 4)) {
            a.route = null;
            a.moving = false;
            const p = job.place;
            if (p && p.bounds) faceTo(a, { x: p.bounds.x + p.bounds.w / 2, y: p.bounds.y + p.bounds.h / 2 });
            else a.dir = c.state === 'toEquip' ? 'up' : 'down';
            c.facing = a.dir;
            c.state = c.state === 'toEquip' ? 'inspecting' : 'atSpot';
          }
          break;
        case 'inspecting':
        case 'atSpot':
          a.moving = false;
          a.dir = c.facing || 'up';
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        case 'patrol':
          if (a.route && a.route.length) {
            if (walkStep(a, dt, speedOf(a) - 4)) { a.route = null; a.moving = false; c.pauseT = between(0.8, 1.6); }
          } else if (c.pauseT > 0) {
            a.moving = false;
            c.pauseT -= dt;
            // look around the room
            a.dir = ['down', 'left', 'up', 'right'][Math.floor(Math.max(0, c.pauseT) * 2.2) % 4];
          } else if (c.spots.length) {
            const p = c.spots.shift();
            a.route = nav.route(a.x, a.y, p.x, p.y);
            a.blockT = 0;
            if (!a.route) c.pauseT = 0.3;
          } else finishJob(a);
          break;
        case 'toVisit': {
          const t = job.target;
          if (!alive(t)) { cancelJob(a, true); break; }
          if (Math.hypot(t.x - a.x, t.y - a.y) < 20) {
            a.route = null;
            a.moving = false;
            c.state = 'talking';
            faceTo(a, t);
            const free = !t.crew.seated && !t.crew.hold && t.crew.state !== 'sitting' && t.crew.state !== 'standing';
            if (free) { t.crew.talkWith = a; t.crew.talkT = job.left + 0.4; }
            converse(a, t, job.def);
            break;
          }
          c.rerouteT -= dt;
          if (c.rerouteT <= 0 || !a.route || !a.route.length) {
            c.rerouteT = 1.2;
            a.route = nav.route(a.x, a.y, t.x, t.y);
            if (!a.route) { cancelJob(a, true); break; }
          }
          walkStep(a, dt, speedOf(a));
          break;
        }
        case 'talking':
          a.moving = false;
          if (job && alive(job.target)) faceTo(a, job.target);
          if (!job) { c.state = 'idle'; c.wait = 0.5; break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
      }
    }

    function converse(a, t, def) {
      if (def.id === 'meeting') { chat.post(a, t.crew.name + ', tem um minuto?'); return; }
      const o = rand() < 0.55 ? TALK.observe(ctxOf(a)) : null;
      const [line, reply] = o && o[1] ? o : freshPair();
      chat.post(a, line);
      chat.later(between(1.6, 2.4), () => { if (alive(t)) chat.post(t, reply); });
    }

    function freshPair() {
      const pool = TALK.PAIRS.filter((p) => C.recent.indexOf(p[0]) < 0);
      const p = pick(pool.length ? pool : TALK.PAIRS);
      C.recent.push(p[0]);
      if (C.recent.length > 5) C.recent.shift();
      return p;
    }

    // Ambient talk: someone comments on what is going on (rate-limited by the chat).
    function ambient(dt) {
      if (!chat.ambientReady() || !C.members.length || rand() > dt / 5) return;
      const pool = C.members.filter((m) => !m.crew.hold);
      if (!pool.length) return;
      const sp = pick(pool);
      let pair = TALK.observe(ctxOf(sp));
      if (!pair || C.recent.indexOf(pair[0]) >= 0) pair = pool.length > 1 ? freshPair() : null;
      if (!pair) { chat.ambientUsed(8); return; }
      C.recent.push(pair[0]);
      if (C.recent.length > 5) C.recent.shift();
      chat.post(sp, pair[0]);
      const other = pair[1] && pick(pool.filter((m) => m !== sp));
      if (other) chat.later(between(1.8, 3), () => { if (alive(other)) chat.post(other, pair[1]); });
      chat.ambientUsed(between(18, 32));
    }

    function stepLeaving(a, dt) {
      a.tick(dt);
      const L = a.crew.leave;
      L.t -= dt;
      if (L.phase === 'cry') {
        a.moving = false;
        a.dir = 'down';
        a.blinkT = 0.2; // eyes shut while crying
        if (L.t <= 0) {
          const r = reception();
          a.route = nav.route(a.x, a.y, r.x, r.y);
          a.blockT = 0;
          L.phase = a.route ? 'walk' : 'fade';
          L.t = 0.9;
        }
      } else if (L.phase === 'walk') {
        if (walkStep(a, dt, 22)) { a.route = null; a.moving = false; a.dir = 'down'; L.phase = 'fade'; L.t = 0.9; }
        else if (a.route && a.route.length === 1 && Math.hypot(a.route[0].x - a.x, a.route[0].y - a.y) < 1) L.phase = 'fade';
      } else {
        a.moving = false;
        a.alpha = Math.max(0, L.t / 0.9);
        if (L.t <= 0) {
          C.leaving = C.leaving.filter((m) => m !== a);
          scene.actors = scene.actors.filter((m) => m !== a);
          scene.refreshWorld(false);
        }
      }
    }

    /* ---------- ops events → chat ---------- */
    const fixerName = (d) => {
      const roles = new Set();
      for (const id of allRoleIds()) if ((JOBS.BY_ROLE[id] || []).some((t) => t.kind === 'fix' && d.fault && t.types.indexOf(d.fault.type) >= 0)) roles.add(ROLES[id].name);
      return Array.from(roles).join(' ou ');
    };
    game.on('fault', (info) => {
      const d = info.d, who = info.who && alive(info.who) ? info.who : null;
      if (who) {
        who.crew.stats.found++;
        XP.train(who.crew.stats, DL.ROLE_SKILL[who.crew.profile.role], 1.5);
        reward(who, 15);
        const can = !!fixDefFor(who, d);
        chat.post(who, '⚠️ ' + info.msg + '. ' + (can ? playerName() + ', se você não pegar, eu resolvo daqui a pouco.' : 'Alguém de ' + fixerName(d) + ' pode olhar?'), { tone: 'warn' });
        if (!can) {
          const h = C.members.find((m) => m !== who && fixDefFor(m, d));
          if (h) chat.later(between(2, 3), () => { if (alive(h) && d.fault) chat.post(h, 'Vi aqui. ' + playerName() + ', quer resolver pelo terminal? Se não, eu cuido disso.'); });
        }
      } else chat.post({ name: 'Monitor', color: '#ff7a17', role: 'Sistema' }, '⚠️ ' + info.msg, { tone: 'warn' });
    });
    game.on('fixed', (info) => {
      if (info.by) return; // the crew member already said what they did
      const w = pick(C.members.filter((m) => !m.crew.hold));
      if (w) chat.later(1.2, () => { if (alive(w)) chat.post(w, pick(['Boa, ' + playerName() + '! ' + info.d.name + ' de volta.', info.d.name + ' respondendo de novo. Valeu, ' + playerName() + '!']), { tone: 'ok' }); });
    });
    game.on('observe', (info) => { if (info.who && alive(info.who)) chat.post(info.who, info.text); });
    game.on('announce', (info) => {
      if (info.who && alive(info.who)) chat.post(info.who, '⚠️ ' + info.text, { tone: 'warn' });
      else chat.post({ name: 'Monitor', color: '#ff7a17', role: 'Sistema' }, '⚠️ ' + info.text, { tone: 'warn' });
    });

    // Furniture changed: re-route walkers, stand people up whose station moved or vanished.
    function onWorld() {
      const has = (e) => world().items.indexOf(e) >= 0;
      for (const a of C.members) {
        const c = a.crew, job = c.job;
        if (c.station) {
          const now = stationOf(c.station.key);
          const same = now && now.sit.x === c.station.sit.x && now.sit.y === c.station.sit.y && now.screen === c.station.screen;
          if (!same) {
            if (c.state === 'going') {
              release(a);
              c.job = null;
              c.state = 'idle';
              c.wait = 0.5;
              a.route = null;
              if (job && !job.auto) game.toast('info', 'Estação mudou', c.name + ' vai procurar outra coisa para fazer');
            } else if (c.seated || c.state === 'sitting') { c.job = null; standUp(a); }
          }
        }
        if (job && job.place && !job.place.crew && job.place.kind && !has(job.place)) { cancelJob(a, true); continue; }
        if (job && job.def.kind === 'fix' && game.ops && game.ops.devices().indexOf(job.target) < 0) { cancelJob(a, true); continue; }
        if (a.route && a.route.length && c.state !== 'sitting' && c.state !== 'standing') {
          const last = a.route[a.route.length - 1];
          a.route = nav.route(a.x, a.y, last.x, last.y, c.state === 'going' || c.state === 'toEquip');
          if (!a.route && c.state !== 'patrol' && c.state !== 'toVisit') cancelJob(a, true);
        }
      }
      for (const a of C.leaving) {
        if (a.route && a.route.length) { const last = a.route[a.route.length - 1]; a.route = nav.route(a.x, a.y, last.x, last.y); }
      }
      for (const n of scene.npcs) n.route = null;
      renderCard(true);
      renderList();
    }
    game.on('world', onWorld);

    /* ---------- picking ---------- */
    function pickActor(wx, wy, pool) {
      let best = null, bestD = 1e9;
      for (const a of pool || C.members) {
        if (a.hidden) continue;
        const top = a.crew && a.crew.seated ? a.y - 26 : a.y - 30;
        if (wx >= a.x - 7 && wx <= a.x + 7 && wy >= top && wy <= a.y + 2) {
          const d = Math.abs(a.y - wy);
          if (d < bestD) { bestD = d; best = a; }
        }
      }
      return best;
    }

    function pickStation(wx, wy) {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      const list = world().items.filter((e) => e.bounds && (e.kind === 'desk' || e.kind === 'chair' || e.kind === 'monitor' || e.kind === 'table'));
      list.sort((a, b) => b.sortY - a.sortY);
      for (const e of list) {
        const b = e.bounds;
        if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) { const s = stationOf(e); if (s) return s; }
      }
      const e = itemAt(tx, ty, (x) => x.kind === 'desk' || x.kind === 'chair' || x.kind === 'table');
      return e ? stationOf(e) : null;
    }

    /* ---------- selection + profile card ---------- */
    function select(a) {
      if (C.sel && C.sel !== a && C.sel.crew) { C.sel.crew.hold = false; C.sel.crew.menu = false; C.sel.crew.confirmFire = false; }
      C.sel = a;
      if (a) a.crew.hold = true; // stops and looks at the player
      C.cardKey = '';
      renderCard(true);
      renderList();
    }

    function statusOf(a) {
      const c = a.crew, j = c.job;
      if (c.state === 'leaving') return 'Indo embora';
      if (c.hold && C.sel === a) return 'Parou para falar com você' + (j ? ' · ' + j.name : '');
      if (c.talkT > 0 && c.talkWith && c.state !== 'talking') return 'Conversando com ' + c.talkWith.crew.name;
      if (!j && c.state !== 'sitting' && c.state !== 'standing') return 'Decidindo o próximo passo';
      switch (c.state) {
        case 'idle': return 'Decidindo o próximo passo';
        case 'going': return 'Indo até ' + (c.station ? c.station.label : 'o computador') + (j ? ' · ' + j.name : '');
        case 'sitting': return 'Sentando…';
        case 'standing': return 'Levantando…';
        case 'working': return j ? j.def.verb + (j.auto ? ' · rotina' : ' · ' + Math.ceil(Math.max(0, j.left)) + ' s') : 'No computador';
        case 'toEquip': return 'Indo até ' + j.label + ' · ' + j.name;
        case 'inspecting': return j.def.verb + ' · ' + j.label;
        case 'toSpot': return 'Indo até ' + (j.label || 'lá') + ' · ' + j.name;
        case 'atSpot': return j.def.verb;
        case 'patrol': return j.def.verb;
        case 'toVisit': return 'Indo falar com ' + j.label;
        case 'talking': return j.def.verb + ' com ' + j.label;
      }
      return '';
    }
    const progressOf = (a) => {
      const c = a.crew, j = c.job;
      if (!j) return 0;
      if (c.state === 'patrol') return 1 - (c.spots.length + (a.route && a.route.length ? 1 : 0)) / (c.spotsTotal || 1);
      if (c.state === 'working' || c.state === 'inspecting' || c.state === 'atSpot' || c.state === 'talking') return Math.max(0, Math.min(1, 1 - j.left / j.total));
      return 0;
    };
    const busy = (a) => !!a.crew.job;
    const starsHtml = (n) => '<span class="stars" aria-label="' + n + ' de 5 estrelas">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>';

    function skillsHtml(a) {
      const st = a.crew.stats, main = DL.ROLE_SKILL[a.crew.profile.role];
      return '<div class="cc__skills">' + DL.SKILLS.map(([k, name]) => {
        const v = Math.round(st.skills[k] || 0);
        return '<div class="sk' + (k === main ? ' is-main' : '') + '"><span>' + name + '</span><b data-sk="' + k + '">' + v + '</b><i><em data-skbar="' + k + '" style="transform:scaleX(' + (v / 100).toFixed(2) + ')"></em></i></div>';
      }).join('') + '</div>';
    }

    function menuHtml(a) {
      const r = roleOf(a);
      let h = '<div class="cc__menu"><span class="eyebrow-sm">Tarefas de ' + esc(r.title) + '</span>';
      for (const def of tasksOf(a)) {
        const o = optionsFor(a, def);
        h += '<button type="button" class="task-opt" data-task="' + def.id + '"' + (o.targets ? '' : ' disabled') + '><b>' + def.name + '</b><span>' + esc(o.targets ? def.desc : o.reason) + '</span></button>';
      }
      h += '<button type="button" class="linkbtn cc__back" data-cc="back">Voltar</button></div>';
      return h;
    }

    function renderCard(force) {
      const a = C.sel;
      if (!a || C.mode === 'build') { el.card.classList.remove('is-on'); C.cardKey = ''; return; }
      const c = a.crew, role = roleOf(a), st = c.stats;
      const stars = XP.starsOf(st, c.profile.role);
      const key = [c.id, busy(a), c.name, c.profile.role, !!c.confirmFire, c.menu, st.level, stars, c.unread || 0, c.menu ? world().version + ':' + (game.ops ? game.ops.openFaults : 0) : ''].join(':');
      if (!force && key === C.cardKey) return;
      C.cardKey = key;
      let h = '<div class="cc__head"><span class="cc__dot" style="background:' + role.color + '"></span><b>' + esc(c.name) + '</b><span class="eyebrow-sm" style="color:' + role.color + '">' + role.name + '</span>' +
        '<button type="button" class="cc__x" data-cc="close" aria-label="Fechar">×</button></div>';
      h += '<div class="cc__rank">' + starsHtml(stars) + '<span class="eyebrow-sm">Nível ' + st.level + '</span><span class="cc__xp" title="Experiência"><i data-live="xp"></i></span></div>';
      if (c.menu) {
        h += menuHtml(a);
      } else {
        h += skillsHtml(a);
        h += '<p class="cc__status" data-live="status">' + statusOf(a) + '</p>';
        h += '<div class="cc__bar"><i data-live="bar"></i></div>';
        h += '<div class="cc__actions">';
        h += '<button type="button" class="btn btn--sm btn--primary" data-cc="talk">Conversar' + (c.unread ? ' <span class="cc__unread">' + c.unread + '</span>' : '') + '</button>';
        h += '<button type="button" class="btn btn--sm" data-cc="assign">Atribuir tarefa</button>';
        if (busy(a)) h += '<button type="button" class="btn btn--sm" data-cc="stop">Parar</button>';
        h += '<button type="button" class="btn btn--sm" data-cc="edit">Editar</button>';
        h += '<button type="button" class="btn btn--sm' + (c.confirmFire ? ' is-warn' : '') + '" data-cc="fire">' + (c.confirmFire ? 'Confirmar' : 'Dispensar') + '</button>';
        h += '</div>';
        h += '<p class="cc__note">' + st.done + ' tarefa(s) · ' + st.found + ' problema(s) achado(s) · ' + st.fixed + ' resolvido(s)</p>';
      }
      el.card.innerHTML = h;
      el.card.classList.add('is-on');
      liveCard();
    }

    function liveCard() {
      const a = C.sel;
      if (!a || !el.card.classList.contains('is-on')) return;
      const st = el.card.querySelector('[data-live="status"]');
      const s = statusOf(a);
      if (st && st.textContent !== s) st.textContent = s;
      const bar = el.card.querySelector('[data-live="bar"]');
      if (bar) bar.style.transform = 'scaleX(' + progressOf(a).toFixed(3) + ')';
      const xp = el.card.querySelector('[data-live="xp"]');
      const S = a.crew.stats;
      if (xp) xp.style.transform = 'scaleX(' + (S.level >= XP.MAX_LEVEL ? 1 : S.xp / XP.xpNeed(S.level)).toFixed(3) + ')';
      for (const [k] of DL.SKILLS) {
        const b = el.card.querySelector('[data-sk="' + k + '"]');
        const v = Math.round(S.skills[k] || 0);
        if (b && b.textContent !== String(v)) {
          b.textContent = v;
          el.card.querySelector('[data-skbar="' + k + '"]').style.transform = 'scaleX(' + (v / 100).toFixed(2) + ')';
        }
      }
    }

    el.card.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.card.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-task]');
      const a = C.sel;
      if (t && a) {
        const def = tasksOf(a).find((d) => d.id === t.dataset.task);
        const why = def && startJob(a, def, { auto: false });
        if (why) game.toast('warn', 'Não deu', a.crew.name + ': ' + why);
        renderCard(true);
        return;
      }
      const b = ev.target.closest('[data-cc]');
      if (!b || !a) return;
      const c = a.crew;
      switch (b.dataset.cc) {
        case 'close': select(null); break;
        case 'assign': c.menu = true; renderCard(true); break;
        case 'talk': game.emit('talk', a); break;
        case 'back': c.menu = false; renderCard(true); break;
        case 'stop': cancelJob(a); break;
        case 'edit': openCreator(a); break;
        case 'fire':
          if (c.confirmFire) fire(a);
          else {
            c.confirmFire = true;
            renderCard(true);
            setTimeout(() => { c.confirmFire = false; if (C.sel === a) renderCard(true); }, 2600);
          }
          break;
      }
      if (b.isConnected) b.blur();
    });

    /* ---------- team panel ---------- */
    function renderList() {
      el.count.textContent = C.members.length + ' / ' + MAX_CREW;
      if (!C.members.length) {
        el.list.innerHTML = '<li class="crew-empty"><p>Ninguém contratado ainda.</p><p class="eyebrow-sm">Crie a primeira pessoa da equipe com <kbd>N</kbd></p></li>';
        return;
      }
      el.list.innerHTML = C.members.map((a) => {
        const c = a.crew, r = roleOf(a);
        return '<li><button type="button" class="crew-row' + (C.sel === a ? ' is-on' : '') + '" data-member="' + c.id + '">' +
          '<span class="cc__dot" style="background:' + r.color + '"></span><span class="crew-row__name">' + esc(c.name) + '</span>' +
          '<span class="eyebrow-sm crew-row__role">' + r.name + ' · Nv ' + c.stats.level + ' ' + starsHtml(XP.starsOf(c.stats, c.profile.role)) + '</span>' +
          '<span class="crew-row__status" data-status="' + c.id + '">' + statusOf(a) + '</span>' +
          '<span class="crew-row__bar"><i data-bar="' + c.id + '"></i></span></button></li>';
      }).join('');
      liveList();
    }

    function liveList() {
      if (C.mode !== 'crew') return;
      for (const a of C.members) {
        const id = a.crew.id;
        const s = el.list.querySelector('[data-status="' + id + '"]');
        const t = statusOf(a);
        if (s && s.textContent !== t) s.textContent = t;
        const b = el.list.querySelector('[data-bar="' + id + '"]');
        if (b) b.style.transform = 'scaleX(' + progressOf(a).toFixed(3) + ')';
      }
    }

    el.list.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-member]');
      if (!b) return;
      const a = C.members.find((m) => m.crew.id === +b.dataset.member);
      if (a) { select(a); game.focus(a.x, a.y - 12); }
      b.blur();
    });
    el.hire.addEventListener('click', () => { el.hire.blur(); openCreator(null); });
    el.panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- creator (team members and the player's own character) ---------- */
    const CR = { open: false, profile: null, editing: null, pose: 'stand', t: 0, raf: 0, last: 0, cacheKey: '', sheet: null, sit: null };

    function uniqueName(body) {
      const used = new Set(C.members.map((a) => a.crew.name));
      const pool = NAMES[body].filter((n) => !used.has(n));
      return pick(pool.length ? pool : NAMES[body]);
    }

    function randomProfile(keep) {
      const body = pick(['f', 'm', 'n']);
      const styles = body === 'f' ? ['long', 'bun', 'ponytail', 'bob', 'curly', 'afro', 'short'] : body === 'm' ? ['short', 'buzz', 'curly', 'afro', 'short', 'bun'] : STYLES.map((s) => s[0]);
      const p = {
        name: uniqueName(body), body, skin: pick(SKINS), hair: pick(HAIRS.slice(0, 6).concat(rand() < 0.15 ? HAIRS.slice(6) : [])),
        hairStyle: pick(styles), outfit: pick(OUTFITS)[0], shirt: pick(CLOTHES), pants: pick(PANTS),
        vest: rand() < 0.1, glasses: rand() < 0.3, beard: body !== 'f' && rand() < 0.3, headset: rand() < 0.15, earrings: body !== 'm' && rand() < 0.25,
        hat: rand() < 0.14 ? pick(['cap', 'beanie']) : '', role: pick(ROLE_IDS),
      };
      if (keep) { p.role = keep.role; if (keep.nameTouched) p.name = keep.name; if (keep.shoes) p.shoes = keep.shoes; }
      return p;
    }

    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const chips = (k, opts) => '<div class="chips" role="radiogroup">' + opts.map(([v, l]) => '<button type="button" class="chip" role="radio" data-k="' + k + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
    const swatches = (k, cols, label) => '<div class="swatches" role="radiogroup" aria-label="' + label + '">' + cols.map((c) => '<button type="button" class="swatch" role="radio" data-k="' + k + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>';
    const field = (label, body) => '<div class="cr-field"><span class="eyebrow-sm">' + label + '</span>' + body + '</div>';

    function buildForm() {
      let h = field('Nome', '<input class="input" id="crName" type="text" maxlength="16" autocomplete="off" spellcheck="false">');
      h += field('Aparência', chips('body', BODIES));
      h += field('Pele', swatches('skin', SKINS, 'Tom de pele'));
      h += field('Cabelo', chips('hairStyle', STYLES) + swatches('hair', HAIRS, 'Cor do cabelo'));
      h += field('Roupa / uniforme', chips('outfit', OUTFITS) + swatches('shirt', CLOTHES, 'Cor da roupa'));
      h += field('Calça', swatches('pants', PANTS, 'Cor da calça'));
      h += field('Acessórios', '<div class="chips">' + EXTRAS.map(([k, l]) => '<button type="button" class="chip" data-t="' + k + '" aria-pressed="false">' + l + '</button>').join('') + '</div>' + chips('hat', HATS.map(([v, l]) => [v, v ? l : 'Sem chapéu'])));
      h += field('Função', '<div class="roles" role="radiogroup">' + allRoleIds().map((id) => {
        const r = ROLES[id];
        return '<button type="button" class="role-card' + (r.custom ? ' is-custom' : '') + '" role="radio" data-k="role" data-v="' + id + '" style="--c:' + r.color + '"><span class="cc__dot"></span><b>' + esc(r.name) + (r.custom ? ' <em>criado</em>' : '') + '</b><span>' + esc(r.desc) + '</span></button>';
      }).join('') + '</div>');
      CR.rolesVer = DL.rolesVersion || 0;
      el.form.innerHTML = h;
      el.form.querySelector('#crName').addEventListener('input', (ev) => {
        CR.profile.name = ev.target.value;
        CR.profile.nameTouched = true;
      });
    }

    function syncForm() {
      const p = CR.profile;
      el.form.querySelectorAll('[data-k]').forEach((b) => {
        const on = String(p[b.dataset.k] || '') === b.dataset.v;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      el.form.querySelectorAll('[data-t]').forEach((b) => {
        const on = !!p[b.dataset.t];
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const n = el.form.querySelector('#crName');
      if (n.value !== p.name) n.value = p.name;
      el.poseSeg.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('is-on', b.dataset.pose === CR.pose));
    }

    el.form.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const p = CR.profile;
      if (b.dataset.k) {
        p[b.dataset.k] = b.dataset.v;
        if (b.dataset.k === 'role' && CR.pose === 'stand') CR.pose = 'work';
      } else if (b.dataset.t) p[b.dataset.t] = !p[b.dataset.t];
      syncForm();
    });
    el.poseSeg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pose]');
      if (b) { CR.pose = b.dataset.pose; CR.t = 0; syncForm(); }
    });
    el.random.addEventListener('click', () => {
      CR.profile = randomProfile(CR.editing ? { role: CR.profile.role, name: CR.profile.name, nameTouched: true, shoes: CR.profile.shoes } : null);
      syncForm();
    });
    el.cancel.addEventListener('click', () => closeCreator());
    el.save.addEventListener('click', () => saveCreator());
    el.creator.addEventListener('pointerdown', (ev) => { if (ev.target === el.creator) closeCreator(); });

    // target: a crew actor (edit), 'player' (my character) or null (hire)
    function openCreator(target) {
      if (!target && C.members.length >= MAX_CREW) { game.toast('warn', 'Equipe cheia', 'Dispense alguém para contratar'); return; }
      const me = target === 'player';
      CR.editing = target || null;
      CR.profile = me ? Object.assign({}, PL.profile, { nameTouched: true }) : target ? Object.assign({}, target.crew.profile, { nameTouched: true }) : randomProfile();
      CR.pose = 'stand';
      CR.t = 0;
      if (!el.form.firstChild || CR.rolesVer !== (DL.rolesVersion || 0)) buildForm();
      el.title.textContent = me ? 'Meu personagem' : target ? 'Editar ' + target.crew.name : 'Nova contratação';
      if (el.sub) el.sub.textContent = me ? 'Você · quem comanda o datacenter' : 'Equipe · meu datacenter';
      el.save.firstChild.textContent = target ? 'Salvar ' : 'Contratar ';
      syncForm();
      el.creator.classList.add('is-open');
      el.creator.classList.toggle('is-me', me);
      CR.open = true;
      CR.last = performance.now();
      cancelAnimationFrame(CR.raf);
      CR.raf = requestAnimationFrame(previewLoop);
      game.keysReset && game.keysReset();
      setTimeout(() => { const n = el.form.querySelector('#crName'); n.focus({ preventScroll: true }); n.select(); }, 60);
    }

    function closeCreator() {
      el.creator.classList.remove('is-open');
      CR.open = false;
      cancelAnimationFrame(CR.raf);
      if (el.creator.contains(document.activeElement)) document.activeElement.blur();
    }

    function saveCreator() {
      const p = CR.profile;
      p.name = (p.name || '').trim().slice(0, 16) || (CR.editing === 'player' ? DEFAULT_PLAYER.name : uniqueName(p.body));
      const prof = Object.assign({}, p);
      delete prof.nameTouched;
      if (CR.editing === 'player') {
        PL.profile = prof;
        applyPlayer(true);
        game.toast('ok', 'Meu personagem', prof.name + ' · ' + ROLES[prof.role].title);
        const w = pick(C.members.filter((m) => !m.crew.hold));
        if (w) chat.later(1.2, () => { if (alive(w)) chat.post(w, pick(['Visual novo, ' + prof.name + '? Ficou ótimo!', 'Olha só, ' + prof.name + ' de visual novo 😎'])); });
      } else if (CR.editing) {
        const a = CR.editing, c = a.crew;
        const roleChanged = c.profile.role !== prof.role;
        c.profile = prof;
        c.name = prof.name;
        applyLook(a);
        if (roleChanged) {
          if (c.job) cancelJob(a, true);
          chat.post(a, 'Mudei de função: agora sou ' + ROLES[prof.role].title.toLowerCase() + '. Muita coisa para aprender!');
        }
        game.toast('ok', 'Perfil atualizado', prof.name + ' · ' + ROLES[prof.role].title);
        renderCard(true);
        renderList();
      } else if (hire(prof)) C.created++;
      closeCreator();
    }

    function previewLoop(now) {
      if (!CR.open) return;
      const dt = Math.max(0, Math.min(0.05, (now - CR.last) / 1000));
      CR.last = now;
      CR.t += dt;
      drawPreview();
      CR.raf = requestAnimationFrame(previewLoop);
    }

    function drawPreview() {
      const cv = el.canvas, k = 3, VW = 80, VH = 64;
      if (cv.width !== VW * k) { cv.width = VW * k; cv.height = VH * k; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.setTransform(k, 0, 0, k, 0, 0);
      const L = lookOf(CR.profile);
      const key = JSON.stringify(L);
      if (key !== CR.cacheKey) { CR.cacheKey = key; CR.sheet = DL.makeSheet(L); CR.sit = DL.makeSitSheet(L); }
      // floor
      for (let x = 0; x < VW; x += T) for (let y = 40; y < VH; y += T) DL.floorTile(g, x, y, false);
      DL.R(g, 0, 39, VW, 1, '#20242c');
      const t = CR.t, blink = Math.sin(t * 2.1) > 0.985;
      if (CR.pose === 'work') {
        const r1 = Math.floor(t / 3.2) % 2 === 1, py = 34;
        const desk = { kind: 'desk', px: 24, py, tw: 2, th: 1, rot: r1 ? 1 : 0, seed: 5, work: ROLES[CR.profile.role].work, typing: Math.floor(t / 2.4) % 3 !== 2 };
        const chair = { kind: 'chair', rot: r1 ? 1 : 0, cx: 40, cy: r1 ? py - 5 : py + 27, tw: 2 };
        const set = CR.sit[r1 ? 'down' : 'up'];
        const pose = desk.typing ? (Math.floor(t * 7) % 2 ? 'A' : 'B') : blink ? 'blink' : 'R';
        const who = { x: 40, y: r1 ? py - 2 : py + 20, noShadow: true, frame: () => set[pose] };
        if (r1) { DL.drawItem(g, chair, t); DL.drawItem(g, desk, t); DL.drawActor(g, who, k); }
        else { DL.drawItem(g, desk, t); DL.drawActor(g, who, k); DL.drawItem(g, chair, t); }
        return;
      }
      const dirs = ['down', 'right', 'up', 'left'];
      const walking = CR.pose === 'walk';
      const dir = dirs[Math.floor(t / (walking ? 2 : 1.2)) % 4];
      const f = CR.sheet[dir];
      const img = walking ? f.walk[Math.floor(t * 7) % 4] : blink ? f.blink : f.idle;
      DL.drawActor(g, { x: 40, y: 54, frame: () => img }, k);
    }

    /* ---------- world-anchored UI: name tags, speech bubbles, the card ---------- */
    const tagEls = new Map(), sayEls = new Map();
    let meTag = null;
    function anchor(node, a, lift) {
      const p = scene.worldToScreen(a.x, a.y - lift);
      node.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
    function updateUi(dt) {
      const near = (a) => C.mode === 'crew' || C.sel === a || (game.player && Math.hypot(a.x - game.player.x, a.y - game.player.y) < 64);
      const lift = (a) => (a.crew.seated ? 27 : 31);
      for (const a of C.members) {
        let s = tagEls.get(a);
        if (!s) {
          s = document.createElement('span');
          s.className = 'nametag';
          el.tags.appendChild(s);
          tagEls.set(a, s);
        }
        const r = roleOf(a);
        const alert = a.crew.alertT > 0;
        const txt = a.crew.name;
        const unread = a.crew.unread > 0;
        const k = txt + r.color + alert + a.crew.stats.level + unread;
        if (s.dataset.k !== k) { s.dataset.k = k; s.innerHTML = (alert ? '<b>!</b>' : '<i style="background:' + r.color + '"></i>') + esc(txt) + '<small>' + a.crew.stats.level + '</small>' + (unread ? '<em title="Quer falar com você">💬</em>' : ''); }
        s.classList.toggle('is-alert', alert);
        const show = (near(a) || alert || unread) && C.mode !== 'build' && C.sel !== a && !a.bubble;
        s.classList.toggle('is-on', show);
        if (show) anchor(s, a, lift(a));
      }
      for (const [a, s] of tagEls) if (C.members.indexOf(a) < 0) { s.remove(); tagEls.delete(a); }

      // speech bubbles (members and people on their way out)
      const talkers = C.members.concat(C.leaving);
      for (const a of talkers) {
        let s = sayEls.get(a);
        if (!a.bubble) { if (s) s.classList.remove('is-on'); continue; }
        if (!s) {
          s = document.createElement('span');
          s.className = 'say';
          el.tags.appendChild(s);
          sayEls.set(a, s);
        }
        const b = a.bubble;
        if (s.dataset.k !== b.text) { s.dataset.k = b.text; s.textContent = b.text; s.className = 'say is-' + (b.tone || 'chat'); }
        const show = C.mode !== 'build' && C.sel !== a && !(a.alpha != null && a.alpha < 0.2);
        s.classList.toggle('is-on', show);
        if (show) anchor(s, a, lift(a) + 2);
      }
      for (const [a, s] of sayEls) if (talkers.indexOf(a) < 0) { s.remove(); sayEls.delete(a); }

      // my own tag in team mode
      if (!meTag) { meTag = document.createElement('span'); meTag.className = 'nametag is-me'; el.tags.appendChild(meTag); }
      const pl = game.player, showMe = !!pl && C.mode === 'crew';
      meTag.classList.toggle('is-on', showMe);
      if (showMe) {
        const k = PL.profile.name + PL.profile.role;
        if (meTag.dataset.k !== k) { meTag.dataset.k = k; meTag.innerHTML = '<i style="background:' + ROLES[PL.profile.role].color + '"></i>' + esc(PL.profile.name) + ' <small>você</small>'; }
        anchor(meTag, pl, 31);
      }

      // card above the selected member (kept on screen)
      if (C.sel && el.card.classList.contains('is-on')) {
        const a = C.sel;
        const p = scene.worldToScreen(a.x, a.y - lift(a));
        const h = el.card.offsetHeight, w = el.card.offsetWidth;
        // keep clear of the team panel on the right when it is open
        const right = C.mode === 'crew' && !el.panel.hidden ? el.panel.getBoundingClientRect().left - 12 : innerWidth - 12;
        const x = Math.max(w / 2 + 12, Math.min(right - w / 2, p.x));
        const y = Math.max(h + 64, p.y);
        el.card.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
      C.uiAcc += dt || 0;
      if (C.uiAcc > 0.2) {
        C.uiAcc = 0;
        renderCard(false);
        liveCard();
        liveList();
      }
    }

    function brackets(g, b, col) {
      g.fillStyle = col;
      const x0 = b.x - 1, y0 = b.y - 1, x1 = b.x + b.w, y1 = b.y + b.h, L = 4;
      g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
      g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
      g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
      g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
    }

    // drawn under everything: a role-coloured ring at the selected member's feet
    function underlay(g) {
      const a = C.sel;
      if (!a || C.mode === 'build') return;
      const col = roleOf(a).color;
      const x = Math.round(a.x), y = Math.round(a.y);
      g.globalAlpha = 0.85;
      g.fillStyle = col;
      g.fillRect(x - 4, y - 3, 8, 1);
      g.fillRect(x - 4, y + 2, 8, 1);
      g.fillRect(x - 6, y - 2, 2, 1);
      g.fillRect(x + 4, y - 2, 2, 1);
      g.fillRect(x - 6, y + 1, 2, 1);
      g.fillRect(x + 4, y + 1, 2, 1);
      g.fillRect(x - 7, y - 1, 1, 2);
      g.fillRect(x + 6, y - 1, 1, 2);
      g.globalAlpha = 1;
    }

    // tears: drops fall from the eyes while someone leaves crying
    function tears(g, a, t) {
      const L = a.crew.leave;
      if (!L || L.phase === 'fade' || a.dir === 'up') return;
      const x = Math.round(a.x), y = Math.round(a.y);
      const eyes = a.dir === 'down' ? [x - 3, x + 2] : a.dir === 'right' ? [x + 2] : [x - 3];
      g.fillStyle = '#8cc4ff';
      eyes.forEach((ex, i) => {
        for (let n = 0; n < 2; n++) {
          const k = (t * 1.7 + n * 0.5 + i * 0.27) % 1;
          g.globalAlpha = 0.95 * (1 - k);
          g.fillRect(ex, y - 17 + Math.round(k * 9), 1, k < 0.25 ? 1 : 2);
        }
      });
      g.globalAlpha = 1;
    }

    function overlay(g, sc) {
      for (const a of C.members) {
        const c = a.crew;
        if (c.state !== 'inspecting' || !c.job || !c.job.place || !c.job.place.kind) continue;
        // handheld scanner: a blinking dot in the role colour, and a scan line sweeping the equipment front
        const col = roleOf(a).color;
        const e = c.job.place;
        const b = e.bounds || { x: e.px, y: e.py - 16, w: 16, h: 30 };
        g.fillStyle = col;
        if (Math.sin(sc.t * 9) > 0) g.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 12, 2, 2);
        const k = (sc.t * 0.9) % 1;
        g.globalAlpha = 0.35;
        g.fillRect(b.x + 2, Math.round(b.y + 4 + k * (b.h - 10)), b.w - 4, 1);
        g.globalAlpha = 1;
      }
      for (const a of C.leaving) tears(g, a, sc.t);
      if (C.mode !== 'crew') return;
      const s = C.hover;
      if (s) {
        const u = userOf(s);
        const ok = !u || u === C.sel;
        const al = 0.55 + 0.3 * Math.sin(sc.t * 5);
        brackets(g, s.focus.bounds, ok ? 'rgba(126,224,161,' + al.toFixed(3) + ')' : 'rgba(255,122,23,' + al.toFixed(3) + ')');
      }
    }

    /* ---------- input ---------- */
    function pointerMove(sx, sy) {
      const w = scene.screenToWorld(sx, sy);
      if (C.pan) {
        scene.cam.x = C.pan.cx - ((sx - C.pan.sx) * scene.dpr) / scene.S;
        scene.cam.y = C.pan.cy - ((sy - C.pan.sy) * scene.dpr) / scene.S;
        return;
      }
      if (C.down && Math.hypot(sx - C.down.sx, sy - C.down.sy) > 4 && C.mode === 'crew') {
        C.pan = { sx: C.down.sx, sy: C.down.sy, cx: C.down.cx, cy: C.down.cy };
        C.down = null;
        return;
      }
      if (C.mode !== 'crew') { C.hover = null; game.setCursor(pickActor(w.x, w.y) ? 'pointer' : ''); return; }
      const actor = pickActor(w.x, w.y);
      C.hover = actor ? null : pickStation(w.x, w.y);
      game.setCursor(actor || C.hover ? 'pointer' : '');
    }

    // sending someone to a clicked computer = their role's computer task there
    function sendToStation(a, s) {
      const def = tasksOf(a).find((d) => d.kind === 'pc');
      if (!def) { game.toast('info', a.crew.name, 'A função ' + roleOf(a).name + ' não trabalha no computador'); return; }
      const why = startJob(a, def, { auto: false, station: s });
      if (why) game.toast('warn', 'Não deu', a.crew.name + ': ' + why);
    }

    // returns true when the click hit something the crew cares about
    function pointerDown(sx, sy, button) {
      const w = scene.screenToWorld(sx, sy);
      if (button === 2) { if (C.sel) { select(null); return true; } return false; }
      const a = pickActor(w.x, w.y);
      if (a) { select(a); return true; }
      if (C.mode === 'crew') {
        const s = pickStation(w.x, w.y);
        if (s && C.sel) {
          const u = userOf(s);
          if (u === C.sel) return true;
          if (u) { game.toast('warn', 'Ocupado', s.label + ' já está com ' + u.crew.name); return true; }
          sendToStation(C.sel, s);
          return true;
        }
        if (s && !C.sel) {
          const u = userOf(s);
          if (u) select(u);
          else game.toast('info', 'Estação livre', 'Selecione alguém da equipe e clique aqui');
          return true;
        }
        C.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
      }
      if (C.sel) { select(null); return true; }
      return false;
    }

    function pointerUp() {
      C.down = null;
      C.pan = null;
    }

    function key(ev) {
      if (CR.open) {
        if (ev.code === 'Escape') { closeCreator(); return true; }
        if (ev.code === 'Enter' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { ev.preventDefault(); saveCreator(); return true; }
        return true;
      }
      if (ev.code === 'KeyN' && C.mode !== 'build') { openCreator(null); return true; }
      if (ev.code === 'KeyP' && !ev.repeat) { openCreator('player'); return true; }
      if (ev.code === 'KeyK' && !ev.repeat && C.mode !== 'build') { chat.toggle(); return true; }
      if (ev.code === 'Escape' && C.sel) {
        if (C.sel.crew.menu) { C.sel.crew.menu = false; renderCard(true); return true; }
        select(null);
        return true;
      }
      return false;
    }

    function setMode(m) {
      C.mode = m;
      el.panel.hidden = m !== 'crew';
      if (m === 'build') select(null);
      C.hover = null;
      C.down = null;
      C.pan = null;
      renderCard(true);
      renderList();
    }

    function inspect(a) { select(a); }

    // a preset's team starts the shift together
    function startShift() {
      const m = C.members;
      if (!m.length) return;
      const lead = m.find((a) => a.crew.profile.role === 'gerente') || m[0];
      chat.post(lead, 'Bom dia, time! Turno começando. ' + playerName() + ' está no comando hoje.');
      const w = m.find((a) => a !== lead);
      if (w) chat.later(2, () => { if (alive(w)) chat.post(w, pick(['Bom dia! Já vou dar uma olhada nos racks.', 'Bom dia! Café e depois monitoramento.'])); });
      chat.ambientUsed(14);
    }

    renderList();

    return {
      get members() { return C.members; },
      get leaving() { return C.leaving; },
      get assignedCount() { return C.assigned; },
      get createdCount() { return C.created; },
      get selected() { return C.sel; },
      get creatorOpen() { return CR.open; },
      get menuOpen() { return !!(C.sel && C.sel.crew.menu); },
      get playerProfile() { return PL.profile; },
      chat,
      update, updateUi, underlay, overlay, pointerMove, pointerDown, pointerUp, key, setMode, select, inspect, pickActor,
      openCreator, closeCreator, statusOf, stations, stationOf, userOf, startShift,
      api: {
        hire, fire, startJob, cancelJob, standUp, randomProfile, saveCreator, nav, decide, tasksOf, optionsFor, reception, fixDefFor,
        // open the hiring card with a role already chosen (Cargos → Contratar)
        hireAs(role) { openCreator(); if (CR.open && ROLES[role]) { CR.profile.role = role; syncForm(); } },
      },
    };
  };
})();
