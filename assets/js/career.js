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
  /* Insignia: an SVG emblem per rank. The shape grows with the band:    */
  /*   Estágio: hexagon + ring · Júnior: hexagon + chevrons ·            */
  /*   Pleno: hexagon + laurel + chevrons · Sênior: shield + star +      */
  /*   laurel · Especialista: winged shield + two stars ·                */
  /*   Tech Lead: winged shield + crown + star (and a shine sweep).      */
  /* ------------------------------------------------------------------ */
  let embSeq = 0;
  const HEX = '32,2 58,17 58,47 32,62 6,47 6,17';
  const SHIELD = 'M32 2 L57 10 V30 C57 46 46 56 32 62 C18 56 7 46 7 30 V10 Z';
  function starPath(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * k).toFixed(2) + ' ' + (cy + Math.sin(a) * k).toFixed(2);
    }
    return d + 'Z';
  }
  // a laurel: five leaves up each side of the emblem, following an arc from the bottom
  function laurel(c) {
    let h = '';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const ang = Math.PI / 2 - side * (0.75 + i * 0.36);
        const x = 32 + Math.cos(ang) * 33, y = 33 + Math.sin(ang) * 33;
        const rot = (ang * 180) / Math.PI + side * 22;
        h += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="2.6" ry="5.6" transform="rotate(' + rot.toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="' + c + '" stroke="#0b0c10" stroke-width="0.8"/>';
      }
    }
    return h;
  }
  const WING = 'M7 18 C-2 16 -10 21 -14 30 C-8 28 -3 28 1 29 C-6 32 -10 37 -12 44 C-6 40 -1 38 4 38 C-1 42 -3 46 -3 51 C1 47 5 45 9 44 Z';
  function chevrons(n, c, cy) {
    let h = '';
    const top = cy - ((n - 1) * 8) / 2;
    for (let i = 0; i < n; i++) {
      const y = top + i * 8;
      h += '<path d="M20 ' + (y + 5) + ' L32 ' + (y - 4) + ' L44 ' + (y + 5) + '" fill="none" stroke="#0b0c10" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M20 ' + (y + 5) + ' L32 ' + (y - 4) + ' L44 ' + (y + 5) + '" fill="none" stroke="' + c + '" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return h;
  }
  DL.rankEmblem = function (rank, size) {
    const id = 'emb' + (++embSeq), c = rank.color, band = rank.band;
    const shield = band === 'sr' || band === 'esp' || band === 'lead';
    const wings = band === 'esp' || band === 'lead';
    const shape = shield ? '<path d="' + SHIELD + '"' : '<polygon points="' + HEX + '"';
    let inner = '';
    if (band === 'est') inner = '<circle cx="32" cy="32" r="11" fill="none" stroke="' + c + '" stroke-width="3.5"/><circle cx="32" cy="32" r="4" fill="' + c + '"/>';
    else if (band === 'jr') inner = chevrons(rank.step, c, 33);
    else if (band === 'pl') inner = chevrons(rank.step, c, 33);
    else if (band === 'sr') inner = '<path d="' + starPath(32, 30, 14, 6) + '" fill="' + c + '" stroke="#0b0c10" stroke-width="1.5"/>';
    else if (band === 'esp') inner = '<path d="' + starPath(23, 30, 9.5, 4) + '" fill="' + c + '" stroke="#0b0c10" stroke-width="1.2"/><path d="' + starPath(41, 30, 9.5, 4) + '" fill="' + c + '" stroke="#0b0c10" stroke-width="1.2"/><path d="M18 46 H46" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>';
    else inner = '<path d="' + starPath(32, 33, 15, 6.5) + '" fill="' + c + '" stroke="#0b0c10" stroke-width="1.5"/><path d="M18 50 H46" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>';
    const wing = (flip) => '<g' + (flip ? ' transform="translate(64 0) scale(-1 1)"' : '') + '><path d="' + WING + '" fill="url(#' + id + 'w)" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M1 29 L7 27 M4 38 L8 36 M9 44 L9 44" stroke="#0b0c10" stroke-width="1.2" opacity="0.6"/></g>';
    const crown = band === 'lead' ? '<path d="M19 9 L21 -3 L26.5 3 L32 -6 L37.5 3 L43 -3 L45 9 Z" fill="' + c + '" stroke="#0b0c10" stroke-width="1.4" stroke-linejoin="round"/><circle cx="32" cy="-6" r="2" fill="#fff"/>' : '';
    return '<svg class="emb emb--' + band + '" viewBox="-16 -9 96 74" width="' + Math.round(size * 1.3) + '" height="' + size + '" role="img" aria-label="Patente ' + esc(rank.name) + '">' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity="0.55"/><stop offset="0.55" stop-color="#14161c"/><stop offset="1" stop-color="#08090c"/></linearGradient>' +
      '<linearGradient id="' + id + 'w" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + c + '" stop-opacity="0.25"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="' + id + 'c">' + shape + '/></clipPath></defs>' +
      (wings ? wing(false) + wing(true) : '') +
      (band === 'pl' || band === 'sr' ? laurel(c) : '') +
      shape + ' fill="url(#' + id + 'g)" stroke="' + c + '" stroke-width="3" stroke-linejoin="round"/>' +
      shape + ' fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1" transform="translate(32 32) scale(0.86) translate(-32 -32)"/>' +
      inner +
      (shield ? '<g clip-path="url(#' + id + 'c)"><rect class="emb__shine" x="-40" y="-10" width="22" height="90" fill="url(#' + id + 's)" transform="skewX(-20)"/></g>' : '') +
      crown + '</svg>';
  };

  DL.createCareer = function (game, sys) {
    const world = () => game.scene.world;
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const servers = () => sys.ops.devices().filter((d) => d.kind === 'server');
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

    // one rank and one mission per level: progress() → [done so far, goal]
    const LEVELS = [
      { rank: R('Estagiário(a)', 'EST', 'est', 0), mission: 'Monte o primeiro posto: um rack e um computador',
        how: 'Construir (B) → Equipamentos → Rack e Computador.',
        progress: () => [(count('rack') > K.base.rack ? 1 : 0) + (count('desk') > K.base.desk ? 1 : 0), 2] },
      { rank: R('Júnior I', 'JR I', 'jr', 1), mission: 'Instale um servidor e um switch na mesma sala',
        how: 'Construir (B) → Equipamentos → Servidor e Switch, clicando no rack.',
        progress: () => [mine().some((d) => sys.ops.switchesNear(d).length) ? 1 : 0, 1] },
      { rank: R('Júnior II', 'JR II', 'jr', 2), mission: 'Ligue o cabo de rede de um servidor',
        how: 'Tarefas (T) → Ligar cabos: eth0 do servidor até uma porta do switch.',
        progress: () => [mine().some((d) => d.state !== 'new') ? 1 : 0, 1] },
      { rank: R('Júnior III', 'JR III', 'jr', 3), mission: 'Coloque um servidor online pelo terminal',
        how: 'Tarefas (T) → Abrir terminal: interface, IP, rota e ping.',
        progress: () => [Math.min(1, online(mine())), 1] },
      { rank: R('Pleno I', 'PL I', 'pl', 1), mission: 'Resolva você mesmo(a) um problema no datacenter',
        how: 'Quando aparecer uma ocorrência em Tarefas (T), investigue e corrija pelo terminal ou cabeamento. A equipe ainda não resolve falhas sozinha.',
        progress: () => [Math.min(1, K.fixed - K.base), 1] },
      { rank: R('Pleno II', 'PL II', 'pl', 2), mission: 'Tenha 3 servidores seus online ao mesmo tempo',
        how: 'Instale, cabeie e configure mais servidores.',
        progress: () => [Math.min(3, online(mine())), 3] },
      { rank: R('Pleno III', 'PL III', 'pl', 3), mission: 'Dê 5 ordens à equipe',
        how: 'Equipe (C) → clique numa pessoa → Atribuir tarefa.',
        progress: () => [Math.min(5, K.orders - K.base), 5] },
      { rank: R('Sênior', 'SR', 'sr', 1), mission: 'Expanda o terreno do datacenter',
        how: 'Construir (B) → Espaços → + no Terreno.',
        progress: () => [lotArea() > K.base ? 1 : 0, 1] },
      { rank: R('Especialista', 'ESP', 'esp', 1), mission: 'Feche um mês com o caixa positivo',
        how: 'Mantenha os servidores no ar até o fechamento do mês (00:00 no relógio).',
        progress: () => [Math.min(1, K.pays - K.base), 1] },
      { rank: R('Tech Lead', 'LEAD', 'lead', 1), mission: 'Tenha 6 servidores seus online ao mesmo tempo',
        how: 'Cresça a operação: mais racks, mais servidores, tudo no ar.',
        progress: () => [Math.min(6, online(mine())), 6] },
    ];
    const MAX = LEVELS.length;

    // level · mission complete at max · counters that missions measure from a baseline
    const K = { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: 0, seenOrders: 0, acc: 0, key: '' };

    // what each counter-based mission measures from, taken when the mission starts
    function baseFor(level) {
      if (level === 1) return { rack: count('rack'), desk: count('desk') };
      if (level === 5) return K.fixed;
      if (level === 7) return K.orders;
      if (level === 8) return lotArea();
      if (level === 9) return K.pays;
      return 0;
    }
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
      Object.assign(K, { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: 0, seenOrders: sys.crew.assignedCount || 0, key: '' });
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
          K.base = s.base != null && typeof s.base === typeof baseFor(K.level) ? s.base : baseFor(K.level);
        }
        settle(true);
      },
      get level() { return K.level; },
      get title() { return cur().rank.name; },
      get rank() { return cur().rank; },
    };
  };
})();
