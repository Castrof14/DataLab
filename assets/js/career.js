/* DataLab — career: the player's own level. Every level hands the player ONE mission (a real thing
   to do in the datacenter); finishing it is the promotion to the next level. The crew learns from
   the boss: on their own, bots only pick tasks of a level BELOW the player's (what the player has
   already mastered). Orders given by the player ("Atribuir tarefa") are never blocked.
   The tier of each crew task lives here (TASK_TIER), so jobs.js stays a plain catalog. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // tier of every crew task: bots do it alone once the player's level is above it
  // (tier 0 = always: breaks, getting to know the place, reception, the basic chores)
  const TASK_TIER = {
    chat: 0, break: 0, rest: 0, tv: 0, arcade: 0, explore: 0, coffee: 0, frontdesk: 0, visitors: 0, round: 0, support: 0, bench: 0,
    inv: 1, tickets: 1, cams: 1, access: 1, docs: 1, walk: 1, meeting: 1, seals: 1, pcmaint: 1, benchtest: 1, repair: 1, cool: 1,
    hw: 2, switch: 2, install: 2, swmaint: 2, cables: 2,
    ping: 3, topo: 3,
    svc: 4, sys: 4, patch: 4, runbook: 4,
    fixnet: 5, fixhw: 5, fixinc: 5, fixtec: 5, alerts: 5,
    backup: 6, kpi: 6, needs: 6, follow: 6, board: 6,
    capacity: 7,
    expand: 8,
  };
  const tierOf = (def) => (def && TASK_TIER[def.id]) || 0;


  /* ------------------------------------------------------------------ */
  /* Insignia: a pixel-art emblem per rank, drawn on a 32×25 grid of    */
  /* square cells (crisp SVG rects). The shape grows with the band:     */
  /*   Estágio: hexagon + ring · Júnior: hexagon + chevrons ·           */
  /*   Pleno: hexagon + laurel + chevrons · Sênior: shield + star +     */
  /*   laurel · Especialista: winged shield + two stars ·               */
  /*   Tech Lead: winged shield + crown + star.                         */
  /* ------------------------------------------------------------------ */
  const PW = 32, PH = 25, CX = 16, CY = 13.5, INK = '#0b0c10', DARK = '#14161c';
  const SPR = {
    ring: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
    chev: ['..###..', '.##.##.', '##...##'],
    star: ['....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.'],
    starS: ['..#..', '#####', '.###.', '.#.#.'],
    wing: ['......#', '....###', '..#####', '#######', '....###', '..#####', '#######', '....###', '..#####', '....##.'],
    crown: ['#...#...#', '##.###.##', '#########'],
  };
  // blend two #rrggbb colours (t = 0 → a, 1 → b)
  function mix(a, b, t) {
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
  }
  const hexIn = (x, y) => { const dx = Math.abs(x - CX); return dx <= 8.6 && Math.abs(y - CY) <= 10 - dx * 0.577; };
  const shieldIn = (x, y) => {
    const dx = Math.abs(x - CX);
    if (y < 3 + dx * 0.12) return false;
    if (y <= 13) return dx <= 8.6;
    return dx <= 8.6 * Math.sqrt(Math.max(0, 1 - ((y - 13) / 10.5) ** 2));
  };

  DL.rankEmblem = function (rank, size) {
    const c = rank.color, band = rank.band;
    const shield = band === 'sr' || band === 'esp' || band === 'lead';
    const wings = band === 'esp' || band === 'lead';
    const inside = shield ? shieldIn : hexIn;
    const px = new Map();
    const at = (x, y) => (x < PW ? px.get(y * PW + x) : undefined);
    const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < PW && y < PH) px.set(y * PW + x, col); };
    const isIn = (x, y) => inside(x + 0.5, y + 0.5);
    // a sprite in one colour with a dark 1-pixel outline around it
    function stamp(rows, x0, y0, col, flip) {
      const on = [], has = new Set();
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') { const cx = x0 + (flip ? r.length - 1 - x : x); on.push([cx, y0 + y]); has.add(cx + ',' + (y0 + y)); } });
      for (const [x, y] of on) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has.has((x + dx) + ',' + (y + dy))) put(x + dx, y + dy, INK);
      for (const [x, y] of on) put(x, y, col);
    }

    if (wings) { stamp(SPR.wing, 0, 7, mix(c, DARK, 0.25)); stamp(SPR.wing, 25, 7, mix(c, DARK, 0.25), true); }
    if (band === 'pl' || band === 'sr') {
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const ang = Math.PI / 2 - side * (0.75 + i * 0.36);
        const x = Math.round(CX - 0.5 + Math.cos(ang) * 11), y = Math.round(CY - 0.5 + Math.sin(ang) * 11);
        stamp(['#', '#'], x, y - 1, i % 2 ? mix(c, DARK, 0.3) : c);
      }
    }
    if (band === 'lead') { stamp(SPR.crown, 12, 0, c); put(16, 0, '#ffffff'); }
    // body: dark ring outside, band colour on the edge, a gradient from the colour to near-black inside
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (isIn(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isIn(x + dx, y + dy)) near = true;
      if (near && !at(x, y)) put(x, y, INK);
    }
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x + 1, y) || !isIn(x - 1, y) || !isIn(x, y + 1) || !isIn(x, y - 1);
      const lit = !edge && !isIn(x, y - 2);
      put(x, y, edge ? c : lit ? mix(c, '#ffffff', 0.35) : mix(c, DARK, Math.min(0.92, 0.45 + (y / PH) * 0.6)));
    }

    if (band === 'est') stamp(SPR.ring, 13, 10, c);
    else if (band === 'jr' || band === 'pl') {
      const n = rank.step, top = Math.round(CY - (3 + (n - 1) * 4) / 2);
      for (let i = 0; i < n; i++) stamp(SPR.chev, 13, top + i * 4, c);
    } else if (band === 'sr') stamp(SPR.star, 12, 9, c);
    else if (band === 'esp') { stamp(SPR.starS, 9, 9, c); stamp(SPR.starS, 18, 9, c); stamp(['##########'], 11, 16, c); }
    else { stamp(SPR.star, 12, 8, c); stamp(['##########'], 11, 18, c); }

    // one rect per horizontal run of the same colour
    let rects = '';
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW;) {
        const col = at(x, y);
        let w = 1;
        while (col && at(x + w, y) === col) w++;
        if (col) rects += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + col + '"/>';
        x += w;
      }
    }
    return '<svg class="emb emb--' + band + '" viewBox="0 0 ' + PW + ' ' + PH + '" width="' + Math.round(size * 1.28) + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="Patente ' + esc(rank.name) + '">' + rects + '</svg>';
  };

  DL.createCareer = function (game, sys) {
    const world = () => game.scene.world;
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const servers = () => (sys.ops ? sys.ops.devices().filter((d) => d.kind === 'server') : []);
    // the player's own servers (not the ones that came installed with the map / preset)
    const mine = () => servers().filter((d) => !d.pre);
    const online = (list) => list.filter((d) => d.state === 'online').length;
    const lotArea = () => world().lot.w * world().lot.h;

    // Patentes (the player's rank): one per level, grouped in bands with their own colour; the numeral
    // (I, II, III) is the step inside the band and shows as chevrons on the insignia.
    const BANDS = {
      est: { name: 'Estágio', color: '#8a919c' }, jr: { name: 'Júnior', color: '#7ee0a1' }, pl: { name: 'Pleno', color: '#6aa7e8' },
      sr: { name: 'Sênior', color: '#c4b5fd' }, esp: { name: 'Especialista', color: '#ff7a17' }, lead: { name: 'Liderança', color: '#ffd23f' },
    };
    const R = (name, short, band, step) => ({ name, short, band, step, color: BANDS[band].color });

    // everything a mission measures. Missions count only what happens AFTER they start (K.base is a
    // snapshot of these counters), so a level never passes by itself and promotions don't chain.
    const counters = () => ({
      v: 2, rack: count('rack'), desk: count('desk'),
      linked: mine().filter((d) => sys.ops.switchesNear(d).length).length,
      cabled: mine().filter((d) => d.state !== 'new').length,
      online: online(mine()), fixed: K.fixed, orders: K.orders, area: lotArea(), pays: K.pays,
    });
    const since = (k, goal) => Math.max(0, Math.min(goal, counters()[k] - (K.base[k] || 0)));

    // one rank and one mission per level: progress() → [done so far, goal]
    const LEVELS = [
      { rank: R('Estagiário(a)', 'EST', 'est', 0), mission: 'Monte dois postos: dois racks e dois computadores novos',
        how: 'Construir (B) → Equipamentos → Rack e Computador.',
        progress: () => [since('rack', 2) + since('desk', 2), 4] },
      { rank: R('Júnior I', 'JR I', 'jr', 1), mission: 'Instale mais 2 servidores numa sala com switch',
        how: 'Construir (B) → Equipamentos → Servidor e Switch, clicando no rack.',
        progress: () => [since('linked', 2), 2] },
      { rank: R('Júnior II', 'JR II', 'jr', 2), mission: 'Ligue o cabo de rede de mais 3 servidores',
        how: 'Tarefas (T) → Ligar cabos: eth0 do servidor até uma porta do switch.',
        progress: () => [since('cabled', 3), 3] },
      { rank: R('Júnior III', 'JR III', 'jr', 3), mission: 'Coloque mais 3 servidores online pelo terminal',
        how: 'Tarefas (T) → Abrir terminal: interface, IP, rota e ping.',
        progress: () => [since('online', 3), 3] },
      { rank: R('Pleno I', 'PL I', 'pl', 1), mission: 'Resolva você mesmo(a) 3 problemas no datacenter',
        how: 'Quando aparecer uma ocorrência em Tarefas (T), investigue e corrija pelo terminal ou cabeamento. A equipe ainda não resolve falhas sozinha.',
        progress: () => [since('fixed', 3), 3] },
      { rank: R('Pleno II', 'PL II', 'pl', 2), mission: 'Tenha 8 servidores seus online ao mesmo tempo',
        how: 'Instale, cabeie e configure mais servidores.',
        progress: () => [Math.min(8, online(mine())), 8] },
      { rank: R('Pleno III', 'PL III', 'pl', 3), mission: 'Dê 15 ordens à equipe',
        how: 'Equipe (C) → clique numa pessoa → Atribuir tarefa.',
        progress: () => [since('orders', 15), 15] },
      { rank: R('Sênior', 'SR', 'sr', 1), mission: 'Expanda o terreno e resolva mais 5 problemas',
        how: 'Construir (B) → Espaços → + no Terreno. As ocorrências aparecem em Tarefas (T).',
        progress: () => [(lotArea() > (K.base.area || 0) ? 1 : 0) + since('fixed', 5), 6] },
      { rank: R('Especialista', 'ESP', 'esp', 1), mission: 'Feche 3 meses com o caixa positivo',
        how: 'Mantenha os servidores no ar até o fechamento de cada mês (00:00 no relógio).',
        progress: () => [since('pays', 3), 3] },
      { rank: R('Tech Lead', 'LEAD', 'lead', 1), mission: 'Tenha 15 servidores seus online ao mesmo tempo',
        how: 'Cresça a operação: mais racks, mais servidores, tudo no ar.',
        progress: () => [Math.min(15, online(mine())), 15] },
    ];
    const MAX = LEVELS.length;

    // level · mission complete at max · counters that missions measure from a baseline
    const K = { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: {}, seenOrders: 0, acc: 0, key: '' };

    // what the missions measure from, taken when each mission starts
    const baseFor = () => counters();
    const cur = () => LEVELS[K.level - 1];
    // the insignia: band colour, short name and one chevron per step inside the band
    const rankHtml = (L, cls) => '<span class="rank' + (cls ? ' ' + cls : '') + '" style="--c:' + L.rank.color + '" title="Patente: ' + esc(L.rank.name) + '">' +
      '<i class="rank__chev" aria-hidden="true">' + '<b></b>'.repeat(L.rank.step) + '</i>' + esc(L.rank.short) + '</span>';
    const isDone = () => { const [n, goal] = cur().progress(); return n >= goal; };

    // the tasks that the crew starts doing alone at a given level
    function unlocksAt(level) {
      const names = new Map();
      for (const id in DL.JOBS.BY_ROLE) for (const d of DL.JOBS.BY_ROLE[id]) if (tierOf(d) === level - 1) names.set(d.id, d.name);
      return Array.from(names.values());
    }

    function promote(silent) {
      if (K.level >= MAX) { K.done = true; if (!silent) game.toast('ok', 'Carreira completa', 'Você chegou ao topo: ' + LEVELS[MAX - 1].rank.name + '. A equipe faz de tudo sozinha.'); return; }
      K.level++;
      K.base = baseFor(K.level);
      if (silent) return;
      const un = unlocksAt(K.level);
      game.toast('ok', 'Promoção · ' + cur().rank.name, 'Nova patente (nível ' + K.level + ') · nova missão: ' + cur().mission + (un.length ? ' · a equipe agora faz sozinha: ' + un.join(', ').toLowerCase() : ''));
      game.sfx('done');
      showPromo(cur());
      game.emit('career', { level: K.level });
    }

    // levels whose mission is already met (presets, older saves) are passed without fanfare
    function settle(silent) {
      let guard = MAX + 1;
      while (!K.done && isDone() && guard--) promote(silent);
      render(true);
    }

    game.on('fixed', (info) => { if (!info.by) K.fixed++; });
    game.on('payday', (info) => { if (info.cash > 0) K.pays++; });

    /* ---------- UI: badge on the Tarefas button + a card on top of the panel ---------- */
    const btn = document.getElementById('opsBtn'), list = document.getElementById('opsList');
    const badge = document.createElement('span');
    badge.className = 'ops-lvl';
    btn.insertBefore(badge, btn.querySelector('kbd'));
    // the insignia also sits on the player's own button (top left)
    const me = document.getElementById('meBtn');
    const meRank = document.createElement('span');
    meRank.className = 'me-rank';
    if (me) me.insertAdjacentElement('afterend', meRank);
    meRank.setAttribute('role', 'button');
    meRank.tabIndex = 0;
    const openCareer = () => { if (sys.ops) sys.ops.toggle(true); };
    meRank.addEventListener('click', openCareer);
    meRank.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openCareer(); } });
    const box = document.createElement('section');
    box.className = 'career';
    box.setAttribute('aria-label', 'Sua carreira');
    list.parentNode.insertBefore(box, list);

    // the big moment: the new insignia in the middle of the screen for a few seconds
    let promoT = null;
    function showPromo(L) {
      const host = game.root || document.body;
      let el = host.querySelector('.promo');
      if (!el) { el = document.createElement('div'); el.className = 'promo'; el.setAttribute('aria-live', 'polite'); host.appendChild(el); }
      el.style.setProperty('--c', L.rank.color);
      el.innerHTML = '<div class="promo__rays" aria-hidden="true"></div>' + DL.rankEmblem(L.rank, 150) +
        '<p class="eyebrow-sm promo__k">Promoção · nível ' + K.level + '</p><p class="promo__name">' + esc(L.rank.name) + '</p><p class="promo__m">' + esc(L.mission) + '</p>';
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
      clearTimeout(promoT);
      promoT = setTimeout(() => el.classList.remove('is-on'), 3600);
    }

    function render(force) {
      const L = cur(), [n, goal] = L.progress();
      const key = K.level + ':' + K.done + ':' + n;
      if (!force && key === K.key) return;
      K.key = key;
      badge.textContent = L.rank.short;
      badge.style.setProperty('--c', L.rank.color);
      btn.title = 'Tarefas · sua patente: ' + L.rank.name + ' (nível ' + K.level + ')';
      meRank.innerHTML = DL.rankEmblem(L.rank, 34) + '<span class="me-rank__txt" style="--c:' + L.rank.color + '">' + esc(L.rank.short) + '</span>';
      meRank.title = 'Sua patente: ' + L.rank.name + ' (nível ' + K.level + ') · clique para ver a carreira';
      const crewTop = K.done ? K.level : K.level - 1;
      const next = !K.done && unlocksAt(K.level + 1);
      box.innerHTML =
        '<div class="career__head">' + DL.rankEmblem(L.rank, 64) + '<div><span class="eyebrow-sm">Patente · nível ' + K.level + '/' + MAX + '</span>' +
        '<p class="career__name" style="--c:' + L.rank.color + '">' + esc(L.rank.name) + '</p>' +
        '<p class="career__rank">' + (K.level < MAX ? 'Próxima: <b>' + esc(LEVELS[K.level].rank.name) + '</b>' : 'Topo da carreira') + '</p></div></div>' +
        '<ol class="career__ladder" aria-hidden="true">' + LEVELS.map((x, i) => '<li class="' + (i < K.level - 1 ? 'is-done' : i === K.level - 1 ? 'is-cur' : '') + '" style="--c:' + x.rank.color + '" title="' + esc(x.rank.name) + '"></li>').join('') + '</ol>' +
        (K.done
          ? '<p class="career__mission">Carreira completa. Toda a rotina do datacenter está nas mãos da equipe.</p>'
          : '<p class="career__mission"><span class="eyebrow-sm">Missão</span>' + esc(L.mission) + '</p>' +
            '<div class="career__bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + n + '"><i style="transform:scaleX(' + (n / goal).toFixed(3) + ')"></i><span class="mono">' + n + '/' + goal + '</span></div>' +
            '<p class="career__how">' + esc(L.how) + '</p>') +
        '<p class="career__crew">' + (crewTop < 1 ? 'A equipe ainda só faz o básico sozinha (recepção, rondas, café).' : 'A equipe faz sozinha as tarefas até o nível ' + crewTop + '.') +
        (next && next.length ? ' No nível ' + (K.level + 1) + ' ela passa a fazer: ' + esc(next.join(', ').toLowerCase()) + '.' : '') + '</p>';
    }

    function update(dt) {
      // orders given since the last check (the crew counter starts again at 0 on every load)
      const seen = sys.crew.assignedCount || 0;
      if (seen > K.seenOrders) K.orders += seen - K.seenOrders;
      K.seenOrders = seen;
      K.acc += dt;
      if (K.acc < 0.5) return;
      K.acc = 0;
      if (!K.done && isDone()) promote(false);
      render();
    }

    function reset() {
      Object.assign(K, { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: {}, seenOrders: sys.crew.assignedCount || 0, key: '' });
      K.base = baseFor(1);
      render(true);
    }

    reset();
    return {
      update, reset, render, LEVELS, TASK_TIER, tierOf,
      // a new game: presets that already have servers online skip the levels they already meet
      start() { reset(); settle(true); },
      // may a bot pick this task on its own?
      botCan: (def) => K.done || tierOf(def) < K.level,
      // the player level a task needs before bots do it alone
      levelFor: (def) => tierOf(def) + 1,
      snapshot: () => ({ level: K.level, done: K.done, fixed: K.fixed, orders: K.orders, pays: K.pays, base: K.base }),
      restore(s) {
        reset();
        if (s) {
          K.level = Math.max(1, Math.min(MAX, s.level | 0 || 1));
          K.done = !!s.done && K.level === MAX;
          K.fixed = s.fixed | 0; K.orders = s.orders | 0; K.pays = s.pays | 0;
          // older saves kept a single number here: the mission then starts counting from now
          K.base = s.base && s.base.v === 2 ? s.base : baseFor(K.level);
        }
        settle(true);
      },
      get level() { return K.level; },
      get title() { return cur().rank.name; },
      get rank() { return cur().rank; },
    };
  };
})();
