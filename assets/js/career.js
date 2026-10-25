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

  DL.createCareer = function (game, sys) {
    const world = () => game.scene.world;
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const servers = () => sys.ops.devices().filter((d) => d.kind === 'server');
    // the player's own servers (not the ones that came installed with the map / preset)
    const mine = () => servers().filter((d) => !d.pre);
    const online = (list) => list.filter((d) => d.state === 'online').length;
    const lotArea = () => world().lot.w * world().lot.h;

    // one mission per level: progress() → [done so far, goal]
    const LEVELS = [
      { title: 'Estagiário(a)', mission: 'Monte o primeiro posto: um rack e um computador',
        how: 'Construir (B) → Equipamentos → Rack e Computador.',
        progress: () => [(count('rack') > K.base.rack ? 1 : 0) + (count('desk') > K.base.desk ? 1 : 0), 2] },
      { title: 'Técnico(a) Jr', mission: 'Instale um servidor e um switch na mesma sala',
        how: 'Construir (B) → Equipamentos → Servidor e Switch, clicando no rack.',
        progress: () => [mine().some((d) => sys.ops.switchesNear(d).length) ? 1 : 0, 1] },
      { title: 'Técnico(a)', mission: 'Ligue o cabo de rede de um servidor',
        how: 'Tarefas (T) → Ligar cabos: eth0 do servidor até uma porta do switch.',
        progress: () => [mine().some((d) => d.state !== 'new') ? 1 : 0, 1] },
      { title: 'Analista Jr', mission: 'Coloque um servidor online pelo terminal',
        how: 'Tarefas (T) → Abrir terminal: interface, IP, rota e ping.',
        progress: () => [Math.min(1, online(mine())), 1] },
      { title: 'Analista', mission: 'Resolva você mesmo(a) um problema no datacenter',
        how: 'Quando aparecer uma ocorrência em Tarefas (T), investigue e corrija pelo terminal ou cabeamento. A equipe ainda não resolve falhas sozinha.',
        progress: () => [Math.min(1, K.fixed - K.base), 1] },
      { title: 'Analista Sr', mission: 'Tenha 3 servidores seus online ao mesmo tempo',
        how: 'Instale, cabeie e configure mais servidores.',
        progress: () => [Math.min(3, online(mine())), 3] },
      { title: 'Especialista', mission: 'Dê 5 ordens à equipe',
        how: 'Equipe (C) → clique numa pessoa → Atribuir tarefa.',
        progress: () => [Math.min(5, K.orders - K.base), 5] },
      { title: 'Coordenador(a)', mission: 'Expanda o terreno do datacenter',
        how: 'Construir (B) → Espaços → + no Terreno.',
        progress: () => [lotArea() > K.base ? 1 : 0, 1] },
      { title: 'Gerente', mission: 'Feche um mês com o caixa positivo',
        how: 'Mantenha os servidores no ar e os custos sob controle até o fechamento do mês.',
        progress: () => [Math.min(1, K.pays - K.base), 1] },
      { title: 'Diretor(a)', mission: 'Tenha 6 servidores seus online ao mesmo tempo',
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
    const isDone = () => { const [n, goal] = cur().progress(); return n >= goal; };

    // the tasks that the crew starts doing alone at a given level
    function unlocksAt(level) {
      const names = new Map();
      for (const id in DL.JOBS.BY_ROLE) for (const d of DL.JOBS.BY_ROLE[id]) if (tierOf(d) === level - 1) names.set(d.id, d.name);
      return Array.from(names.values());
    }

    function promote(silent) {
      if (K.level >= MAX) { K.done = true; if (!silent) game.toast('ok', 'Carreira completa', 'Você chegou ao topo: ' + LEVELS[MAX - 1].title + '. A equipe faz de tudo sozinha.'); return; }
      K.level++;
      K.base = baseFor(K.level);
      if (silent) return;
      const un = unlocksAt(K.level);
      game.toast('ok', 'Promoção · Nível ' + K.level, cur().title + ' · nova missão: ' + cur().mission + (un.length ? ' · a equipe agora faz sozinha: ' + un.join(', ').toLowerCase() : ''));
      game.sfx('done');
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
    const box = document.createElement('section');
    box.className = 'career';
    box.setAttribute('aria-label', 'Sua carreira');
    list.parentNode.insertBefore(box, list);

    function render(force) {
      const L = cur(), [n, goal] = L.progress();
      const key = K.level + ':' + K.done + ':' + n;
      if (!force && key === K.key) return;
      K.key = key;
      badge.textContent = 'Nv ' + K.level;
      btn.title = 'Tarefas · você é ' + L.title + ' (nível ' + K.level + ')';
      const crewTop = K.done ? K.level : K.level - 1;
      const next = !K.done && unlocksAt(K.level + 1);
      box.innerHTML =
        '<div class="career__head"><span class="eyebrow-sm">Sua carreira · nível ' + K.level + '/' + MAX + '</span><b>' + esc(L.title) + '</b></div>' +
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
      get title() { return cur().title; },
    };
  };
})();
