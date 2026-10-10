/* DataLab — playable demo: the player starts from an empty lot and builds their own datacenter.
   Wires the scene, build mode, crew and tutorial together; handles input, panels and the HUD. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const $ = (id) => document.getElementById(id);

  const game = $('game');
  const canvas = $('world');
  const narrow = () => innerWidth < 768;
  const world = DL.newWorld();
  // iso: the isometric 2.5D camera (iso.js); the simulation underneath stays on the tile grid
  const scene = new DL.Scene(canvas, { world, renderFloor: DL.renderRooms, tilesWide: narrow() ? 10 : 21, minTilesHigh: 11, padTop: narrow() ? 120 : 96, iso: true });
  const W = scene.world;
  const player = scene.addPlayer(DL.LOOKS.player, W.spawn.x, W.spawn.y, 'down');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    phase: 'intro',
    mode: 'explore',
    time: 0,
    panel: null,
    target: null,
    walked: 0,
    liveAcc: 0,
  };

  const WHY = {
    rack: 'Racks agrupam servidores e switches. Cada um puxa ar frio pela frente e devolve ar quente por trás.',
    storage: 'O storage guarda os dados que os servidores usam, acessado pela rede como se fosse um disco local.',
    crac: 'A refrigeração de precisão mantém a sala estável. Cada grau a mais custa energia e vida útil do hardware.',
    desk: 'A estação de trabalho é onde a equipe opera o datacenter.',
  };

  /* ---------------- helpers ---------------- */
  const clockAt = (s) => {
    const m = 8 * 60 + Math.floor(s);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fmtPower = (e) => (e.tel.unit === 'W' ? Math.round(e.power) : e.power.toFixed(e.power < 10 ? 2 : 1)) + '<small>' + e.tel.unit + '</small>';
  const isOverlayOpen = () => ['intro', 'help', 'creator', 'terminal', 'cabling', 'monitor', 'wallet', 'reward', 'roles', 'helpdesk', 'netlab', 'infra', 'shifts', 'store', 'inventory', 'account'].some((id) => $(id).classList.contains('is-open'));
  const canMove = () => S.phase !== 'intro' && !isOverlayOpen() && S.mode === 'explore';

  /* ---------------- toasts ---------------- */
  function toast(tone, label, text) {
    const el = document.createElement('div');
    el.className = 'toast toast--' + tone;
    el.innerHTML = '<span class="dot ' + (tone === 'warn' ? 'dot--warn dot--live' : tone === 'ok' ? '' : 'dot--info') + '"></span><b>' + label + '</b><span>' + text + '</span>';
    if (tone === 'info') el.querySelector('.dot').style.background = 'var(--breeze)';
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 400);
    }, 4200);
  }

  /* ---------------- build + crew + tutorial wiring ---------------- */
  const handlers = {};
  const G = {
    scene, player, toast, root: game,
    wanderers: false,
    sfx() {},
    lockReason: () => null,
    actors: () => [player].concat(scene.npcs, crew ? crew.members : []),
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, info) { (handlers[ev] || []).forEach((fn) => fn(info)); },
    mode: () => S.mode,
    setMode: (m) => setMode(m),
    setCursor: (c) => setCursor(c),
    focus(x, y) { scene.cam.x = x; scene.cam.y = y; },
    keysReset: () => keys.clear(),
    clock: () => clockAt(S.time),
    // game minutes since the session started (the clock starts at 08:00 = 480)
    time: () => S.time,
    clockStart: 8 * 60,
    paused: () => S.phase === 'intro' || (tutorial && tutorial.active && tutorial.step < tutorial.total - 1),
    opsOpen: () => !$('opsPanel').hidden,
    reach: (d, host) => ops.reach(d, host),
    flash(e) { S.flash = { e, until: S.time + 2.5 }; },
    onTerminalClose() { canvas.focus && canvas.blur(); },
    peer(d, port) {
      const l = ops.linkAt(d.key, port);
      if (!l) return '';
      const o = l.a.dev === d.key && l.a.port === port ? l.b : l.a;
      const od = ops.get(o.dev);
      return od ? od.name.toLowerCase() + (od.kind === 'patch' ? '-' + o.port : '') : '';
    },
    openCabling(d) { cabling.open(d.rack, d, { back: d }); },
    // the player's name / colour in the team chat
    playerInfo() { const p = crew.playerProfile, r = DL.ROLES[p.role] || {}; return { name: p.name, color: r.color || '#ffffff' }; },
    playerSeat: null,
  };
  let crew = null, tutorial = null;
  const builder = DL.createBuilder(G);
  G.builder = builder;
  const decor = DL.createDecor(G, builder);
  crew = DL.createCrew(G);
  const terminal = DL.createTerminal(G);
  const opsSys = { terminal, crew };
  const ops = DL.createOps(G, opsSys);
  G.ops = ops;
  const cabling = DL.createCabling(G, { ops });
  const monitor = DL.createMonitor(G, { ops, cabling });
  opsSys.cabling = cabling;
  opsSys.monitor = monitor;
  tutorial = DL.createTutorial(G, { builder, crew, ops, terminal, cabling, monitor });
  const economy = DL.createEconomy(G, { ops, crew });
  G.economy = economy;
  // the incident director paces faults and broken hardware: one problem at a time (director.js)
  const director = DL.createDirector(G, { ops });
  G.director = director;
  const talk = DL.createTalk(G, { crew, ops, economy, cabling });
  const roles = DL.createRoles(G, { crew });
  // H / L open the apps only when nothing else is on screen
  G.canHotkey = () => S.phase !== 'intro' && !isOverlayOpen() && !crew.creatorOpen;
  const helpdesk = DL.createHelpdesk(G, { crew });
  G.helpdesk = helpdesk;
  const netlab = DL.createNetLab(G);
  // the company layer: maintenance, work orders, reception visitors, talking in the team chat
  const staff = DL.createStaff(G, { crew, ops, talk });
  G.staff = staff;
  // working hours, custom schedules and on-call cover (shifts.js)
  const shifts = DL.createShifts(G, { crew });
  $('shiftsBtn').addEventListener('click', () => { $('shiftsBtn').blur(); shifts.open(); });
  G.on('payday', () => updateMeta());
  // server specialisations + virtualization (Infra, I)
  const infra = DL.createInfra(G, { ops });
  // inventory + shop: skins, clothes, special items, legendary bots — paid in Gold (inventory.js)
  const inventory = DL.createInventory(G, { crew, economy, playing: () => S.phase === 'play' });
  G.store = { open: (tab) => inventory.openShop(tab), inventory: (id) => inventory.openInventory(id) };
  $('storeBtn').addEventListener('click', () => { $('storeBtn').blur(); inventory.openShop(); });
  $('invBtn').addEventListener('click', () => { $('invBtn').blur(); inventory.openInventory(); });
  G.on('world', () => {
    if (S.panel && W.items.indexOf(S.panel) < 0) closePanel();
    buildLabels();
    buildMinimap();
    updateMeta();
  });

  function updateMeta() {
    const n = W.rooms.length, racks = W.items.filter((e) => e.kind === 'rack').length;
    $('hudMeta').textContent = 'Meu datacenter · mês ' + economy.company.month + ' · ' + n + (n === 1 ? ' sala' : ' salas') + ' · ' + racks + (racks === 1 ? ' rack' : ' racks');
  }

  /* ---------------- equipment panel ---------------- */
  const panel = $('panel');
  const inner = $('panelInner');

  function subOf(e) {
    switch (e.kind) {
      case 'rack': return e.name + ' · ' + e.servers.length + (e.servers.length === 1 ? ' unidade' : ' unidades') + ' · 42U';
      case 'storage': { const m = DL.hwModel('storage', e.model); return m.tier + ' · ' + m.usable + ' TB úteis · ' + m.raid; }
      case 'crac': return 'Insuflamento pelo piso elevado';
      case 'desk': return 'Estação de trabalho da equipe';
      default: return '';
    }
  }

  function linkOf(e) {
    switch (e.kind) {
      case 'rack': {
        const devs = ops.devices().filter((d) => d.rack === e);
        if (!devs.length) return { text: 'Sem equipamentos' };
        const sw = devs.find((d) => d.kind === 'switch');
        return sw ? { text: 'Switch ' + sw.name + ' · uplink ' + DL.hwFmt.gb(DL.hwOf(sw).uplink) } : { text: 'Sem switch neste rack' };
      }
      case 'storage': return { text: DL.hwFmt.gb(DL.hwModel('storage', e.model).net) };
      case 'crac': return { text: 'BMS · Modbus online' };
      default: return { text: '1 Gb/s · VLAN da equipe' };
    }
  }

  function metricsHtml(e) {
    const link = linkOf(e);
    const tLabel = e.kind === 'crac' ? 'Ar insuflado' : e.kind === 'desk' ? 'CPU' : 'Temperatura';
    return (
      '<div class="metrics">' +
      '<div class="metric"><span class="eyebrow-sm">' + tLabel + '</span><p class="metric__val" data-live="temp"></p><canvas data-spark="temp"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">Energia</span><p class="metric__val" data-live="power"></p><canvas data-spark="power"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">Conexão</span><p class="metric__val metric__val--sm">' + link.text + '</p></div>' +
      '<div class="metric"><span class="eyebrow-sm">Uptime</span><p class="metric__val metric__val--sm" data-live="uptime"></p></div>' +
      '</div>'
    );
  }

  function list(rows) {
    return '<ul class="list">' + rows.map((r) =>
      '<li><span class="dot"></span><span class="mono">' + (r.k || '') + '</span><span class="grow">' + r.v + '</span><span class="tag">' + (r.tag || '') + '</span></li>'
    ).join('') + '</ul>';
  }

  function detailHtml(e) {
    switch (e.kind) {
      case 'rack': {
        const devs = ops.devices().filter((d) => d.rack === e).sort((a, b) => a.slot - b.slot);
        if (!devs.length) return '<p class="callout">Rack vazio. No modo construção (<kbd>B</kbd>), escolha Servidor ou Switch e clique neste rack.</p>';
        return '<div class="p-sec"><span class="eyebrow-sm">Unidades</span><ul class="list units">' + devs.map((d) => {
          const bad = (d.fault && d.fault.found) || (d.state === 'online' && !ops.health(d).up) || d.broken;
          const st = d.kind === 'patch' ? 'Passagem' : d.out ? 'Na bancada' : d.broken ? 'Defeito de hardware' : bad ? 'Com falha' : ops.STATE_LABEL[d.state];
          const act = d.kind === 'patch' ? '' : d.broken ? (staff.claimed(staff.broken().find((r) => r.dev === d)) || (staff.broken().find((r) => r.dev === d) || {}).taken ? '' : '<button class="btn btn--sm btn--primary" type="button" data-act="repairdev" data-dev="' + d.key + '">Chamar técnico</button>')
            : d.state === 'new' ? '<button class="btn btn--sm" type="button" data-act="connect" data-dev="' + d.key + '">Ligar cabo</button>'
            : '<button class="btn btn--sm' + (bad || d.state === 'link' ? ' btn--primary' : '') + '" type="button" data-act="term" data-dev="' + d.key + '">Terminal</button>';
          const svc = d.kind === 'server' && DL.SVC ? ' · <b class="svc" style="color:' + DL.SVC[d.svc || 'web'].color + '">' + (d.svc ? DL.SVC[d.svc].short : 'GENÉRICO') + '</b>' : '';
          return '<li><span class="dot' + (bad ? ' dot--warn dot--live' : d.state === 'online' ? '' : ' dot--info') + '"' + (d.state !== 'online' && !bad ? ' style="background:var(--breeze)"' : '') + '></span>' +
            '<span class="mono">U' + String(40 - d.slot * 4).padStart(2, '0') + '</span><span class="grow">' + d.name + ' <small class="m">' + DL.hwOf(d).name + (d.ip ? ' · ' + d.ip : '') + svc + '</small></span>' +
            '<span class="tag' + (bad ? ' is-warn' : '') + '">' + st + '</span>' + act + '</li>';
        }).join('') + '</ul><div class="actions" style="margin-top:12px"><button class="btn btn--sm" type="button" data-act="cabling">Cabeamento do rack</button><button class="btn btn--sm" type="button" data-act="monitor">Monitor</button><button class="btn btn--sm" type="button" data-act="infra">Infra / VMs</button></div></div>';
      }
      case 'storage': {
        // volumes split the model's usable capacity; the spec sheet comes from hardware.js
        const m = DL.hwModel('storage', e.model), a = Math.round(m.usable * 0.6), b = m.usable - a;
        return '<div class="p-sec"><span class="eyebrow-sm">Volumes</span>' + list([
          { k: 'LUN0', v: 'vol-db · ' + a + ' TB', tag: '12% usado' },
          { k: 'LUN1', v: 'vol-app · ' + b + ' TB', tag: '8% usado' },
        ]) + '</div><div class="p-sec"><span class="eyebrow-sm">Especificação</span><dl class="p-spec">' +
          DL.hwSpecs('storage', m).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl></div>';
      }
      case 'crac':
        return '<div class="p-sec"><span class="eyebrow-sm">Climatização</span>' + list([
          { k: 'RET', v: 'Ar de retorno', tag: '27,8 °C' },
          { k: 'FAN', v: 'Ventiladores', tag: '48%' },
        ]) + '</div>';
      case 'desk': {
        const st = crew.stationOf(e), u = st && crew.userOf(st), owner = st && crew.api.ownerOf(st);
        const rec = staff.broken().find((r) => r.item === e);
        let h = '';
        if (rec) h += '<p class="callout callout--warn">' + (rec.out ? 'O PC está na bancada com ' + (rec.taken ? rec.taken.crew.name : 'o técnico') + '.' : 'Este computador está com defeito de hardware.') + '</p>' + (!rec.taken && !staff.claimed(rec) ? '<div class="actions"><button class="btn btn--sm btn--primary" type="button" data-act="repair">Chamar técnico</button></div>' : '');
        if (u) {
          const r = DL.ROLES[u.crew.profile.role];
          h += '<div class="p-sec"><span class="eyebrow-sm">Em uso</span>' + list([{ k: r.name, v: u.crew.name, tag: crew.statusOf(u).split(' · ')[0] }]) + '</div>';
        } else if (!rec) h += '<p class="callout">' + (P.seat && P.seat.key === e ? 'Você está trabalhando aqui.' : 'Livre. Sente e trabalhe (<kbd>F</kbd>) ou, no modo equipe (<kbd>C</kbd>), mande alguém para cá.') + '</p>';
        if (st) {
          h += '<div class="p-sec"><label class="p-own"><span class="eyebrow-sm">Estação de</span><select data-act-sel="owner" aria-label="Dono da estação"><option value="">Ninguém (qualquer um usa)</option>' +
            crew.members.map((m) => '<option value="' + m.crew.id + '"' + (owner === m ? ' selected' : '') + '>' + m.crew.name + ' · ' + DL.ROLES[m.crew.profile.role].name + '</option>').join('') + '</select></label></div>';
          if (!u && !rec) h += '<div class="actions"><button class="btn btn--sm btn--primary" type="button" data-act="sit">' + (P.seat && P.seat.key === e ? 'Levantar' : 'Sentar e trabalhar') + ' <kbd>F</kbd></button></div>';
        }
        return h;
      }
    }
    return '';
  }

  function rackAlert(e) {
    if (e.kind !== 'rack') return null;
    const devs = ops.devices().filter((d) => d.rack === e);
    const bad = devs.filter((d) => d.fault || d.broken).length, pend = devs.filter((d) => d.state !== 'online').length;
    return bad ? bad + (bad === 1 ? ' equipamento com falha' : ' equipamentos com falha') : pend ? pend + ' aguardando configuração' : null;
  }

  function renderPanel() {
    const e = S.panel;
    if (!e) return;
    inner.innerHTML =
      '<div class="p-head"><div><span class="eyebrow-sm">' + e.category + '</span><h2 class="p-title" id="panelTitle">' + e.id + '</h2><p class="p-sub">' + subOf(e) + '</p></div>' +
      '<button class="btn p-close" type="button" data-act="close" aria-label="Fechar painel">×</button></div>' +
      (rackAlert(e) ? '<span class="status status--warn"><span class="dot dot--warn dot--live"></span>' + rackAlert(e) + '</span>' : '<span class="status status--ok"><span class="dot"></span>Operacional</span>') +
      (e.tel ? metricsHtml(e) : '') +
      detailHtml(e) +
      (WHY[e.kind] ? '<p class="why"><b>Por que importa.</b> ' + WHY[e.kind] + '</p>' : '');
    updateLive();
  }

  function spark(cv, data) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    let lo = Math.min.apply(null, data), hi = Math.max.apply(null, data);
    const pad = (hi - lo) * 0.2 || 0.5;
    lo -= pad;
    hi += pad;
    const X = (i) => (i / (data.length - 1)) * (w - 3);
    const Y = (v) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
    g.beginPath();
    data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.25;
    g.lineJoin = 'round';
    g.stroke();
    g.lineTo(X(data.length - 1), h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(X(data.length - 1), Y(data[data.length - 1]), 2, 0, Math.PI * 2);
    g.fill();
  }

  function updateLive() {
    const e = S.panel;
    if (!e || !e.tel) return;
    const temp = inner.querySelector('[data-live="temp"]');
    if (temp) temp.innerHTML = e.temp.toFixed(1) + '<small>°C</small>';
    const pw = inner.querySelector('[data-live="power"]');
    if (pw) pw.innerHTML = fmtPower(e);
    const up = inner.querySelector('[data-live="uptime"]');
    if (up) up.textContent = Math.max(1, Math.floor(S.time / 60)) + ' min';
    inner.querySelectorAll('[data-spark]').forEach((cv) => spark(cv, e.hist[cv.dataset.spark]));
  }

  function openPanel(e) {
    S.panel = e;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    inner.scrollTop = 0;
    const b = e.bounds;
    player.dir = DL.dirOf(b.x + b.w / 2 - player.x, b.y + b.h - 6 - player.y);
    renderPanel();
  }

  function closePanel() {
    if (!S.panel) return;
    S.panel = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (panel.contains(document.activeElement)) document.activeElement.blur();
  }

  inner.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') closePanel();
    if (b.dataset.act === 'cabling' && S.panel) { cabling.open(S.panel, null); return; }
    if (b.dataset.act === 'monitor') { monitor.open('dash'); return; }
    if (b.dataset.act === 'infra') { closePanel(); infra.open('servers'); return; }
    if (b.dataset.act === 'sit' && S.panel) { const s = crew.stationOf(S.panel); if (P.seat && s && P.seat.key === s.key) seatStand(); else seatDown(s); return; }
    if (b.dataset.act === 'repair' && S.panel) {
      const rec = staff.broken().find((r) => r.item === S.panel);
      if (rec) callTech(rec);
      renderPanel();
      return;
    }
    const d = ops.devices().find((x) => x.key === b.dataset.dev);
    if (!d) return;
    if (b.dataset.act === 'connect') cabling.open(d.rack, d);
    else if (b.dataset.act === 'term') ops.openTerminal(d);
    else if (b.dataset.act === 'repairdev') { const rec = staff.broken().find((r) => r.dev === d); if (rec) callTech(rec); renderPanel(); }
  });
  inner.addEventListener('change', (ev) => {
    const s = ev.target.closest('[data-act-sel="owner"]');
    if (!s || !S.panel) return;
    const st = crew.stationOf(S.panel);
    const m = crew.members.find((x) => x.crew.id === +s.value);
    if (st) {
      if (m) { crew.api.setHome(m, st.key); toast('ok', 'Estação', crew.api.stationName(st) + ' agora é de ' + m.crew.name); }
      else { const o = crew.api.ownerOf(st); if (o) crew.api.setHome(o, null); toast('info', 'Estação', crew.api.stationName(st) + ' liberada para qualquer um'); }
    }
    s.blur();
    renderPanel();
  });
  inner.addEventListener('keydown', (ev) => { if (ev.target.tagName === 'SELECT') ev.stopPropagation(); });

  // the player asks for a repair: it becomes a work order (the manager's queue, or straight to a technician)
  function callTech(rec) {
    const o = staff.createOrder('repair', rec, { byName: crew.playerProfile.name });
    if (o) toast('info', 'Ordem #' + o.id, o.title + (o.assignee ? ' · ' + o.assignee.crew.name + ' a caminho' : ' · aguardando um técnico'));
    else toast('info', 'Manutenção', 'Já existe uma ordem para o ' + rec.label);
  }

  function interact() {
    if (!canMove()) return;
    const t = S.target;
    if (!t) return;
    if (t.crew) { crew.inspect(t); gesture('wave', 0.9); player.dir = DL.dirOf(t.x - player.x, t.y - player.y); }
    else if (usable(t)) useObject(t);
    else if (S.panel === t) closePanel();
    else { openPanel(t); gesture('reach', 0.6); }
  }

  /* ---------------- my character: sit, work, talk, interact ---------------- */
  // rest: on a sofa / pouf / loose chair · use: an object being used (TV, board, coffee machine…) · held: a cup / can / snack
  const P = { seat: null, glide: null, pose: 'R', poseT: 0, phase: 'type', phaseT: 2, act: null, actT: 0, talkT: 0, rest: null, use: null, held: null };

  // objects the player can use directly (interact.js); equipment with a panel keeps its panel
  const usable = (e) => !!(e && !e.crew && !e.id && DL.Interact && DL.Interact.of(e));
  function useObject(e) {
    const af = DL.Interact.of(e);
    closePanel();
    if (af.type === 'rest') {
      const s = DL.Interact.freeSeat(e, W, player, player);
      if (!s) { toast('info', DL.itemName(e), 'Todos os lugares estão ocupados'); return; }
      DL.Interact.claim(e, s.k, player);
      P.rest = s;
      P.glide = { from: { x: player.x, y: player.y }, to: s.sit, t: 0, dur: 0.3, sit: true };
      player.vx = player.vy = 0;
      player.moving = false;
      player.seated = true;
      player.noShadow = true;
      player.sortKey = s.sortKey;
      return;
    }
    if (af.type !== 'drink' && !DL.Interact.freeUse(e, player)) { toast('info', DL.itemName(e), 'Alguém já está usando'); return; }
    const sp = DL.Interact.standPoint(e, W);
    const ex = (e.host || e).px + (e.tw || 1) * 8, ey = (e.host || e).py + (e.th || 1) * 8;
    player.dir = sp && Math.hypot(sp.x - player.x, sp.y - player.y) < 14 ? sp.dir : DL.dirOf(ex - player.x, ey - player.y);
    const dur = af.type === 'drink' ? af.fill || 1.4 : af.dur[0] + Math.random() * (af.dur[1] - af.dur[0]);
    if (af.type !== 'drink') DL.Interact.claim(e, 'use', player);
    P.use = { e, af, left: dur, total: dur };
    if (af.type === 'drink') e.busy = true;
    if (af.anim === 'reach' || af.type === 'drink') gesture('reach', dur);
    player.bubble = { text: af.type === 'watch' ? '📺' : af.type === 'drink' ? '…' : '✍️', left: Math.min(2.5, dur), tone: 'chat' };
  }
  function stopUse(done) {
    const u = P.use;
    if (!u) return;
    P.use = null;
    u.e.busy = false;
    P.actT = 0;
    if (u.af.type !== 'drink') DL.Interact.release(player);
    if (done && u.af.type === 'drink') {
      // something to drink / eat for a while: sips now and then, gone after a few
      const what = DL.Interact.cupOf(u.af);
      P.held = { what, left: what === 'food' || what === 'snack' ? 8 : 16, sipT: 1.2 };
      player.bubble = { text: { coffee: '☕', tea: '🍵', water: '💧', soda: '🥤', snack: '🍪', food: '🍱' }[what] || '☕', left: 1.6, tone: 'chat' };
    }
    if (done && u.af.type !== 'drink' && Math.random() < 0.5) { const line = DL.Interact.sayFor(u.af); if (line) player.bubble = { text: line, left: 3, tone: 'chat' }; }
  }
  function restStand() {
    const s = P.rest;
    if (!s || (P.glide && !P.glide.sit)) return;
    P.glide = { from: { x: player.x, y: player.y }, to: s.onTile ? s.sit : s.fromPt, t: 0, dur: 0.25, sit: false };
    player.seated = false;
    player.noShadow = false;
    player.sortKey = null;
    player.dir = 'down';
  }
  function updateUse(dt, moving) {
    if (P.held) {
      P.held.left -= dt;
      P.held.sipT -= dt;
      if (P.held.sipT <= -0.9) P.held.sipT = 1.6 + Math.random();
      if (P.held.left <= 0) P.held = null;
    }
    if (!P.use) return;
    // walking away ends it; a drink in progress still lands in the hand
    if (moving || W.items.indexOf(P.use.e) < 0) { stopUse(P.use.af.type === 'drink' && P.use.left < P.use.total * 0.4); return; }
    P.use.left -= dt;
    if (P.use.left <= 0) stopUse(true);
  }
  function gesture(kind, t) { P.act = kind; P.actT = t; }
  G.on('team-say', () => { P.talkT = 1.6; });
  G.on('player-talk', () => { P.talkT = 1.4; });

  function nearestSeat() {
    let best = null, bestD = 34;
    for (const s of crew.stations()) {
      if (crew.userOf(s) || crew.api.brokenSt(s)) continue;
      const d = Math.hypot(s.approach.x - player.x, s.approach.y - player.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function seatDown(s) {
    if (!s) { toast('info', 'Sentar', 'Chegue perto de um computador livre e aperte F'); return; }
    if (crew.userOf(s)) { toast('warn', 'Ocupado', crew.api.stationName(s) + ' está com ' + crew.userOf(s).crew.name); return; }
    if (crew.api.brokenSt(s)) { toast('warn', 'Estação quebrada', 'Chame o técnico de TI'); return; }
    closePanel();
    P.seat = s;
    G.playerSeat = s;
    P.glide = { from: { x: player.x, y: player.y }, to: s.sit, t: 0, dur: 0.3, sit: true };
    player.vx = player.vy = 0;
    player.moving = false;
    player.seated = true;
    player.noShadow = true;
    player.sortKey = s.sortKey;
    P.phase = 'type'; P.phaseT = 2; P.pose = 'R';
  }
  function seatStand() {
    const s = P.seat;
    if (!s || (P.glide && !P.glide.sit)) return;
    s.screen.work = null;
    s.screen.typing = false;
    let to = s.approach;
    const tx = Math.floor(to.x / T), ty = Math.floor((to.y - 2) / T);
    if (W.solid[ty * W.W + tx]) { const f = crew.api.nav.nearestFree(tx, ty, 6); if (f) to = crew.api.nav.center(f[0], f[1]); }
    P.glide = { from: { x: player.x, y: player.y }, to, t: 0, dur: 0.25, sit: false };
    player.seated = false;
    player.noShadow = false;
    player.sortKey = null;
    player.dir = 'down';
  }
  // seated: typing / resting / glancing like the crew; the screen shows the player's role
  function updateSeat(dt, wantsMove) {
    if (P.glide) {
      const gl = P.glide;
      gl.t = Math.min(1, gl.t + dt / gl.dur);
      const k = gl.t * gl.t * (3 - 2 * gl.t);
      player.x = gl.from.x + (gl.to.x - gl.from.x) * k;
      player.y = gl.from.y + (gl.to.y - gl.from.y) * k;
      if (gl.t >= 1) {
        P.glide = null;
        if (!gl.sit) { P.seat = null; G.playerSeat = null; if (P.rest) { DL.Interact.release(player); P.rest = null; } }
      }
      return true;
    }
    // resting on a sofa / pouf / chair: any move gets up (and the seat must still be there)
    if (P.rest) {
      if (wantsMove || W.items.indexOf(P.rest.item) < 0) restStand();
      return true;
    }
    if (!P.seat) return false;
    const s = P.seat, now = crew.stationOf(s.key);
    if (!now || now.sit.x !== s.sit.x || now.sit.y !== s.sit.y || crew.api.brokenSt(s) || wantsMove) {
      if (crew.api.brokenSt(s)) toast('warn', 'Seu PC apagou', 'Defeito de hardware · chame o técnico');
      seatStand();
      return true;
    }
    P.phaseT -= dt;
    if (P.phaseT <= 0) {
      P.phase = P.phase !== 'type' ? 'type' : Math.random() < 0.6 ? 'rest' : 'look';
      P.phaseT = P.phase === 'type' ? 2 + Math.random() * 3 : P.phase === 'rest' ? 1 + Math.random() * 1.5 : 0.6 + Math.random() * 0.8;
    }
    if (P.phase === 'type') { P.poseT -= dt; if (P.poseT <= 0) { P.pose = P.pose === 'A' ? 'B' : 'A'; P.poseT = 0.11 + Math.random() * 0.08; } }
    else P.pose = P.phase === 'rest' ? 'R' : 'L';
    s.screen.work = (DL.ROLES[crew.playerProfile.role] || DL.ROLES.gerente).work;
    s.screen.typing = P.phase === 'type';
    return true;
  }
  player.frame = function () {
    if (this.seated && this.sitSheet) {
      const set = this.sitSheet[P.seat ? P.seat.dir : P.rest ? P.rest.dir : 'up'] || this.sitSheet.up;
      const pose = P.rest ? 'R' : P.pose;
      if (pose === 'R' && this.blinkT > 0) return set.blink;
      return set[pose] || set.R;
    }
    if (!this.moving && this.actSheet) {
      const s = this.actSheet[this.dir] || this.actSheet.down, t = scene.t;
      if ((P.talkT > 0 || (this.bubble && this.bubble.left > 0.5)) && Math.floor(t * 7) % 2) return s.talk;
      if (P.actT > 0) return P.act === 'wave' ? s.wave : s.reach;
      // hands on the equipment while its panel is open
      if (S.panel && S.panel.kind !== 'desk' && Math.floor(t * 2.4) % 3) return s.reach;
    }
    return DL.Actor.prototype.frame.call(this);
  };

  /* ---------------- input ---------------- */
  const keys = new Set();
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const touchVec = { x: 0, y: 0 };

  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (crew.creatorOpen) { crew.key(ev); return; }
    if (cabling.isOpen) { if (cabling.key(ev)) ev.preventDefault(); return; }
    if (monitor.isOpen) { if (monitor.key(ev)) ev.preventDefault(); return; }
    if (economy.isOpen) { if (economy.key(ev)) ev.preventDefault(); return; }
    if (shifts.isOpen) { if (ev.code === 'Escape') { shifts.close(); ev.preventDefault(); } return; }
    if (infra.isOpen) { if (infra.key(ev)) ev.preventDefault(); return; }
    if (inventory.isOpen) { if (inventory.key(ev)) ev.preventDefault(); return; }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (S.phase === 'intro') {
      if (ev.code === 'Enter') { ev.preventDefault(); begin(true); }
      return;
    }
    const free = !isOverlayOpen();
    if (free && !ev.repeat && (ev.code === 'KeyB' || ev.code === 'KeyC')) {
      const m = ev.code === 'KeyB' ? 'build' : 'crew';
      setMode(S.mode === m ? 'explore' : m);
      ev.preventDefault();
      return;
    }
    if (free && ev.code === 'KeyT' && !ev.repeat) { ops.toggle(); ev.preventDefault(); return; }
    if (free && (ev.code === 'KeyO' || ev.code === 'KeyU') && !ev.repeat) { if (ev.code === 'KeyO') inventory.openShop(); else inventory.openInventory(); ev.preventDefault(); return; }
    if (free && ev.code === 'KeyM' && S.mode !== 'build' && !ev.repeat) { monitor.open(); ev.preventDefault(); return; }
    if (free && S.mode !== 'build' && infra.key(ev)) { ev.preventDefault(); return; }
    // F: sit at the closest free workstation / stand up
    if (free && S.mode === 'explore' && ev.code === 'KeyF' && !ev.repeat) { if (P.rest) restStand(); else if (P.seat) seatStand(); else { stopUse(false); seatDown(nearestSeat()); } ev.preventDefault(); return; }
    // Enter: write in the team chat
    if (free && S.mode !== 'build' && ev.code === 'Enter' && !ev.repeat && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { crew.chat.focusInput(); ev.preventDefault(); return; }
    if (free && S.mode === 'build' && builder.key(ev)) { ev.preventDefault(); return; }
    if (free && talk.key(ev)) { ev.preventDefault(); return; }
    if (free && crew.key(ev)) { ev.preventDefault(); return; }
    if (free && S.mode === 'crew' && ev.code === 'Escape') { setMode('explore'); return; }
    const k = KEYMAP[ev.code];
    if (k) {
      keys.add(k);
      ev.preventDefault();
      return;
    }
    if (ev.code === 'Escape') {
      if ($('help').classList.contains('is-open')) $('help').classList.remove('is-open');
      else if (S.panel) closePanel();
      else if (G.opsOpen()) ops.toggle(false);
      return;
    }
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (ev.code === 'KeyE' || (ev.code === 'Space' && !onButton)) {
      ev.preventDefault();
      if (!ev.repeat) interact();
    }
  });
  addEventListener('keyup', (ev) => {
    const k = KEYMAP[ev.code];
    if (k) keys.delete(k);
  });
  addEventListener('blur', () => keys.clear());

  $('prompt').addEventListener('click', interact);
  $('tutStart').addEventListener('click', () => begin(true));
  $('tutSkipIntro').addEventListener('click', () => begin(false));

  // New games always start from scratch; other presets only serve as the title-screen backdrop.
  let preset = 'zero';
  function choosePreset(id) {
    preset = id;
    infra.reset();
    if (P.seat || P.glide || P.rest) { P.seat = null; P.glide = null; P.rest = null; G.playerSeat = null; player.seated = false; player.noShadow = false; player.sortKey = null; }
    P.use = null;
    P.held = null;
    if (DL.Interact) DL.Interact.release(player);
    const refused = DL.applyPreset(id, { scene, player, builder, ops });
    if (refused.length) console.warn('preset ' + id + ': itens recusados', refused);
    S.refused = refused;
  }

  // Learning mode (difficulty.js): chosen on the start card, shown on the HUD and in the terminal
  const modeChoices = $('modeChoices');
  function renderModes() {
    const cur = DL.learn();
    modeChoices.innerHTML = DL.MODE_ORDER.map((id) => {
      const m = DL.MODES[id], on = id === cur.id;
      return '<button type="button" class="start-opt start-opt--mode' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-learn="' + id + '" style="--c:' + m.color + '"><b>' + m.name + '</b><span>' + m.desc + '</span><em class="eyebrow-sm">' + m.tag + '</em></button>';
    }).join('');
    const hm = $('hudMode');
    if (hm) { hm.innerHTML = 'Modo <b>' + cur.name + '</b>'; hm.style.setProperty('--c', cur.color); }
  }
  modeChoices.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-learn]');
    if (!b || S.phase !== 'intro') return;
    DL.setLearn(b.dataset.learn);
  });
  DL.onLearnChange(renderModes);
  renderModes();
  $('helpBtn').addEventListener('click', () => $('help').classList.add('is-open'));
  $('helpClose').addEventListener('click', () => $('help').classList.remove('is-open'));

  /* ---------------- modes: explore / build / crew ---------------- */
  const modeBtns = Array.from(document.querySelectorAll('[data-mode]'));
  function setMode(m) {
    if (m === S.mode) return;
    if (S.mode === 'build') builder.exit();
    S.mode = m;
    if (m !== 'explore') {
      closePanel();
      scene.cam.x = Math.max(0, Math.min(scene.mapW, scene.cam.x));
      scene.cam.y = Math.max(0, Math.min(scene.mapH, scene.cam.y));
    }
    if (m === 'build') builder.enter();
    // building: inner walls come down (cutaway) so the floor plan stays visible
    scene.wallCut = m === 'build';
    fitDock();
    crew.setMode(m);
    game.classList.toggle('is-build', m === 'build');
    game.classList.toggle('is-crew', m === 'crew');
    modeBtns.forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    setCursor('');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (S.phase === 'intro') return;
    setMode(b.dataset.mode === S.mode ? 'explore' : b.dataset.mode);
  }));

  function setCursor(c) { canvas.style.cursor = c || ''; }

  // keep the bottom of the map reachable above the build dock
  function fitDock() {
    const dock = $('build');
    scene.o.padBottom = S.mode === 'build' && !dock.hidden ? dock.offsetHeight + 24 : 0;
  }

  /* ---------------- mouse on the world ---------------- */
  const local = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };
  // Camera drag: build and crew modes pan when the press lands on empty floor (builder.js / crew.js);
  // exploring, a drag on empty space looks around freely until the player walks again. Letting go
  // keeps a little momentum (step → camGlide).
  canvas.addEventListener('pointerdown', (ev) => {
    if (S.phase === 'intro' || isOverlayOpen() || (ev.pointerType === 'touch' && S.mode === 'explore')) return;
    const [x, y] = local(ev);
    if (ev.button === 0) canvas.setPointerCapture(ev.pointerId);
    S.ptrDown = ev.button === 0;
    S.camVel = null;
    if (S.mode === 'build') builder.pointerDown(x, y, ev.button);
    else {
      const used = crew.pointerDown(x, y, ev.button);
      if (!used && S.mode === 'explore' && ev.button === 0) S.drag = { sx: x, sy: y, cx: scene.cam.x, cy: scene.cam.y, on: false };
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const [x, y] = local(ev);
    if (S.drag) {
      if (!S.drag.on && Math.hypot(x - S.drag.sx, y - S.drag.sy) > 4) { S.drag.on = true; S.freeCam = true; setCursor('grabbing'); }
      if (S.drag.on) {
        const d = scene.screenDelta(x - S.drag.sx, y - S.drag.sy);
        scene.cam.x = Math.max(0, Math.min(scene.mapW, S.drag.cx - d.x));
        scene.cam.y = Math.max(0, Math.min(scene.mapH, S.drag.cy - d.y));
        return;
      }
    }
    if (S.mode === 'build') builder.pointerMove(x, y);
    else crew.pointerMove(x, y);
  });
  const up = () => {
    if (S.drag && S.drag.on) setCursor('');
    S.drag = null;
    S.ptrDown = false;
    if (S.mode === 'build') builder.pointerUp();
    else crew.pointerUp();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (S.phase === 'intro') return;
    const z = (scene.o.zoom || 0) + (ev.deltaY < 0 ? 1 : -1);
    scene.o.zoom = Math.max(2 - scene.autoS, Math.min(3, z));
    scene.resize();
  }, { passive: false });

  // touch joystick (explore mode)
  if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
    $('touch').hidden = false;
    game.classList.add('is-touch');
    const stick = $('stick'), knob = $('knob');
    let pid = null;
    const setVec = (ev) => {
      const r = stick.getBoundingClientRect();
      let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), max = 44;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const m = Math.min(1, d / max);
      touchVec.x = m > 0.18 ? dx / max : 0;
      touchVec.y = m > 0.18 ? dy / max : 0;
    };
    stick.addEventListener('pointerdown', (ev) => { pid = ev.pointerId; stick.setPointerCapture(pid); setVec(ev); });
    stick.addEventListener('pointermove', (ev) => { if (ev.pointerId === pid) setVec(ev); });
    const end = () => { pid = null; touchVec.x = touchVec.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    $('touchAction').addEventListener('click', interact);
  }

  /* ---------------- player / camera ---------------- */
  function updatePlayer(dt) {
    let ix = 0, iy = 0;
    if (P.actT > 0) P.actT -= dt;
    if (P.talkT > 0) P.talkT -= dt;
    // talking with someone in the conversation panel: look at them
    if (talk.active && !P.seat && !player.moving) player.dir = DL.dirOf(talk.active.x - player.x, talk.active.y - player.y);
    if (P.seat || P.glide || P.rest) {
      const wants = S.mode === 'explore' && canMove() && (keys.has('left') || keys.has('right') || keys.has('up') || keys.has('down') || Math.hypot(touchVec.x, touchVec.y) > 0.2);
      updateSeat(dt, wants);
      updateUse(dt, false);
      if (wants) S.freeCam = false;
      player.vx = player.vy = 0;
      player.moving = false;
      if (S.mode === 'explore') {
        if (S.freeCam) return;
        const kc = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
        scene.cam.x += (player.x - scene.cam.x) * kc;
        scene.cam.y += (player.y - 12 - scene.cam.y) * kc;
        return;
      }
    }
    if (S.mode !== 'explore') {
      // build + crew: WASD pans the camera, the player waits
      if (S.phase !== 'intro' && !isOverlayOpen()) {
        let cx = 0, cy = 0;
        if (keys.has('left')) cx -= 1;
        if (keys.has('right')) cx += 1;
        if (keys.has('up')) cy -= 1;
        if (keys.has('down')) cy += 1;
        const sp = 300 / Math.max(1, scene.S / 3);
        // keys pan along the screen (in the isometric view that is diagonal on the grid)
        const m = scene.screenDir(cx, cy), k = scene.iso && (cx || cy) ? 1.15 : 1;
        scene.cam.x = Math.max(0, Math.min(scene.mapW, scene.cam.x + m.x * k * sp * dt));
        scene.cam.y = Math.max(0, Math.min(scene.mapH, scene.cam.y + m.y * k * sp * dt));
      }
      player.vx = player.vy = 0;
      player.moving = false;
      return;
    }
    if (canMove()) {
      if (keys.has('left')) ix -= 1;
      if (keys.has('right')) ix += 1;
      if (keys.has('up')) iy -= 1;
      if (keys.has('down')) iy += 1;
      ix += touchVec.x;
      iy += touchVec.y;
    }
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const SPEED = 74;
    const k = 1 - Math.exp(-dt * (len > 0 ? 14 : 22));
    // W/A/S/D follow the screen: up on screen is diagonal on the grid in the isometric view
    const wd = scene.screenDir(ix, iy);
    player.vx += (wd.x * SPEED - player.vx) * k;
    player.vy += (wd.y * SPEED - player.vy) * k;
    if (!len && Math.hypot(player.vx, player.vy) < 2) player.vx = player.vy = 0;

    const x0 = player.x, y0 = player.y;
    scene.moveActor(player, player.vx * dt, player.vy * dt);
    const moved = Math.hypot(player.x - x0, player.y - y0);
    const was = player.moving;
    player.moving = len > 0.1 && moved > 0.05;
    updateUse(dt, len > 0.1);
    if (player.moving && !was) player.dist = 0;
    player.dist += moved;
    S.walked += moved;

    if (len > 0.1) {
      const ax = Math.abs(ix), ay = Math.abs(iy);
      const horiz = ix < 0 ? 'left' : 'right', vert = iy < 0 ? 'up' : 'down';
      if (ax > 0.01 && ay > 0.01 && Math.abs(ax - ay) < 0.2 && (player.dir === horiz || player.dir === vert)) {
        // diagonal: keep the current facing to avoid flicker
      } else player.dir = ax > ay ? horiz : vert;
    }

    // looking around after a drag: walking brings the camera back to the player (smoothly)
    if (len > 0.1) S.freeCam = false;
    if (S.freeCam) return;
    const kc = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
    // aim a little above the feet (straight up on screen in both views)
    const up = scene.iso ? 7 : 0;
    scene.cam.x += (player.x - up + player.vx * 0.22 - scene.cam.x) * kc;
    scene.cam.y += (player.y - 12 + up * 0.7 + player.vy * 0.22 - scene.cam.y) * kc;
  }

  // Momentum after a drag: while the button is held the camera's speed is measured; released, it
  // glides on and slows down. Only where the camera is free (build, crew, or looking around).
  function camGlide(dt) {
    const c = scene.cam, last = S.lastCam || { x: c.x, y: c.y };
    const free = S.mode !== 'explore' || S.freeCam;
    if (S.ptrDown && dt > 0) {
      const vx = (c.x - last.x) / dt, vy = (c.y - last.y) / dt;
      S.camVel = S.camVel ? { x: S.camVel.x * 0.6 + vx * 0.4, y: S.camVel.y * 0.6 + vy * 0.4 } : { x: vx, y: vy };
    } else if (S.camVel && free && !reduced) {
      c.x = Math.max(0, Math.min(scene.mapW, c.x + S.camVel.x * dt));
      c.y = Math.max(0, Math.min(scene.mapH, c.y + S.camVel.y * dt));
      const k = Math.exp(-dt * 5);
      S.camVel.x *= k;
      S.camVel.y *= k;
      if (Math.hypot(S.camVel.x, S.camVel.y) < 4) S.camVel = null;
    } else if (!S.ptrDown) S.camVel = null;
    S.lastCam = { x: c.x, y: c.y };
  }

  function findTarget() {
    let best = null, bestD = 21;
    const fx = { left: -1, right: 1, up: 0, down: 0 }[player.dir], fy = { up: -1, down: 1, left: 0, right: 0 }[player.dir];
    for (const e of W.interactables) {
      if (!e.bounds) continue;
      const dx = e.ix - player.x, dy = e.iy - player.y;
      let d = Math.hypot(dx, dy);
      const b = e.bounds;
      if ((b.x + b.w / 2 - player.x) * fx + (b.y + b.h / 2 - player.y) * fy > 0) d -= 3;
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const n of crew.members) {
      if (n.hidden) continue; // off duty
      const d = Math.hypot(n.x - player.x, n.y - player.y) - 2;
      if (d < 20 && d < bestD) { bestD = d; best = n; }
    }
    // things to use: coffee machines, sofas, TVs, boards… (interact.js) — the closest footprint
    if (DL.Interact && !P.rest) {
      for (const e of W.items) {
        if (!usable(e) || (P.use && P.use.e === e)) continue;
        const h = e.host || e, x0 = h.px, y0 = h.py, x1 = x0 + (h.tw || 1) * T, y1 = y0 + (h.th || 1) * T;
        const dx = Math.max(x0 - player.x, 0, player.x - x1), dy = Math.max(y0 - player.y, 0, player.y - y1);
        // on a table, aim at the object itself; on the wall, at the tile below it
        const d = Math.hypot(dx, dy) + (e.host ? Math.hypot(e.px + 8 - player.x, e.py + 8 - player.y) * 0.25 : 0) - 4;
        if (d < 12 && d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  /* ---------------- world-anchored UI ---------------- */
  const prompt = $('prompt');
  const labelsEl = $('worldLabels');
  let labels = [], labelEls = [];
  function buildLabels() {
    labels = W.rooms.map((r) => ({ text: r.name, x: r.lx != null ? r.lx : (r.x + r.w / 2) * T, y: r.ly != null ? r.ly : (r.y + r.h - 0.6) * T }));
    labelsEl.innerHTML = '';
    labelEls = labels.map((l) => {
      const s = document.createElement('span');
      s.textContent = l.text;
      labelsEl.appendChild(s);
      return s;
    });
  }
  buildLabels();
  let promptKey = '';

  function updateWorldUi() {
    labels.forEach((l, i) => {
      const p = scene.worldToScreen(l.x, l.y);
      labelEls[i].style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)';
    });
    const t = S.target;
    const show = t && canMove() && !(S.panel && S.panel === t) && !(t.crew && crew.selected === t);
    if (show) {
      const isActor = !!t.crew;
      const p = isActor ? scene.worldToScreen(t.x, t.y, 33) : scene.iso ? scene.itemTop(t, 3) : scene.worldToScreen(t.bounds.x + t.bounds.w / 2, t.bounds.y - 3);
      prompt.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      const use = !isActor && usable(t) ? DL.Interact.of(t) : null;
      const key = isActor ? 'crew-' + t.crew.id + t.crew.name : use ? 'use-' + t.kind + t.tx + ',' + t.ty : t.id;
      if (key !== promptKey) {
        promptKey = key;
        $('promptVerb').textContent = isActor ? 'Gerenciar' : use ? use.verb : 'Inspecionar';
        $('promptName').textContent = isActor ? t.crew.name : use ? DL.itemName(t) : t.id;
      }
    }
    prompt.classList.toggle('is-on', !!show && !(P.use && P.use.e === t));
  }

  /* ---------------- in-world overlay ---------------- */
  function brackets(g, b, a) {
    g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    const x0 = b.x - 1, y0 = b.y - 1, x1 = b.x + b.w, y1 = b.y + b.h, L = 4;
    g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
    g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
    g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
    g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
  }
  scene.underlay = (g, sc) => {
    builder.underlay(g, sc);
    crew.underlay(g, sc);
  };
  // warm light under floor lamps, cool spill from busy screens
  scene.lights = (g) => {
    for (const e of W.items) {
      if (e.kind === 'lamp') DL.pool(g, e.px + 8, e.py - 6, 40, e.color ? DL.rgba(e.color, 0.07) : 'rgba(255,194,133,0.07)');
      else if (e.work && (e.kind === 'desk' || e.kind === 'monitor')) DL.pool(g, e.px + e.tw * 8, e.py - 8, 26, 'rgba(160,195,236,0.05)');
      if (e.kind === 'monitor' && e.variant === 'rgb') DL.pool(g, e.px + 8, e.py - 10, 16, DL.rgba(e.color || '#ff2bd6', 0.1));
    }
    // each room's own RGB + glowing decor (decor.js)
    DL.drawRoomLights(g, W, scene.t);
  };
  scene.overlay = (g, sc) => {
    builder.overlay(g, sc);
    staff.overlay(g, sc);
    crew.overlay(g, sc);
    tutorial.overlay(g, sc);
    // the cup / can / snack in my hand
    if (P.held && !player.seated) {
      g.save();
      if (scene.iso) scene.actorSpace(g, player);
      DL.drawHeld(g, player, P.held.what, P.held.sipT < 0, sc.t, 7);
      g.restore();
    }
    // isometric: brackets around the object as drawn; top-down: around its sprite bounds
    const mark = (e, a) => (scene.iso ? scene.markItem(g, e, 'rgba(255,255,255,' + a.toFixed(3) + ')') : brackets(g, e.bounds, a));
    if (S.flash && S.time < S.flash.until && S.flash.e.bounds) mark(S.flash.e, 0.6 + 0.4 * Math.sin(sc.t * 10));
    if (S.mode !== 'explore') return;
    const sel = S.panel || (S.target && !S.target.crew && canMove() ? S.target : null);
    if (sel && sel.bounds) mark(sel, S.panel === sel ? 0.9 : 0.5 + 0.3 * Math.sin(sc.t * 5));
  };

  /* ---------------- minimap ---------------- */
  const mm = $('minimap');
  const MS = 6;
  const mmDpr = Math.min(window.devicePixelRatio || 1, 2);
  const mg = mm.getContext('2d');
  let mmStatic = null;
  function buildMinimap() {
    mm.width = W.W * MS * mmDpr;
    mm.height = W.H * MS * mmDpr;
    const k = Math.min(200 / (W.W * MS), 128 / (W.H * MS));
    mm.style.width = Math.round(W.W * MS * k) + 'px';
    mm.style.height = Math.round(W.H * MS * k) + 'px';
    mmStatic = DL.mk(W.W * MS, W.H * MS);
    const g = mmStatic.getContext('2d');
    const col = { _: '#16181f', g: '#2a3446', G: '#2a3446', w: '#3a4456', d: '#5a4a3c', D: '#5a4a3c', '.': '#1a1f27', ',': '#1c232d' };
    for (let y = 0; y < W.H; y++) {
      for (let x = 0; x < W.W; x++) {
        const t = W.tiles[y * W.W + x];
        DL.R(g, x * MS, y * MS, MS, MS, col[t] || (W.lot && x < W.lot.w && y < W.lot.h ? '#0f1115' : '#0a0b0d'));
      }
    }
    for (const e of W.items) {
      if (e.host || e.kind === 'glass' || e.kind === 'glassH' || e.kind === 'wallseg' || e.kind === 'door' || e.kind === 'rug' || e.rug || e.wall || e.kind === 'chair') continue;
      const c = e.kind === 'rack' || e.kind === 'storage' ? '#3a414c' : e.kind === 'desk' ? '#2c3139' : e.kind === 'crac' ? '#4a515c' : '#262a31';
      DL.R(g, e.tx * MS + 1, e.ty * MS + 1, e.tw * MS - 1, e.th * MS - 1, c);
    }
  }
  buildMinimap();

  function drawMinimap() {
    const g = mg, k = MS / T;
    g.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W.W * MS, W.H * MS);
    g.drawImage(mmStatic, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    if (scene.iso) {
      // the isometric view covers a diamond of the map
      const cw = canvas.width / scene.dpr, ch = canvas.height / scene.dpr;
      g.beginPath();
      [[0, 0], [cw, 0], [cw, ch], [0, ch]].forEach(([x, y], i) => { const p = scene.screenToWorld(x, y); g[i ? 'lineTo' : 'moveTo'](p.x * k, p.y * k); });
      g.closePath();
      g.stroke();
    } else g.strokeRect(scene.ox / scene.S * k + 0.5, scene.oy / scene.S * k + 0.5, canvas.width / scene.S * k - 1, canvas.height / scene.S * k - 1);
    for (const a of crew.members) {
      if (a.hidden) continue;
      g.fillStyle = DL.ROLES[a.crew.profile.role].color;
      g.fillRect(Math.round(a.x * k) - 1, Math.round(a.y * k) - 2, 3, 3);
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(player.x * k, player.y * k - 1, 2.4, 0, Math.PI * 2);
    g.fill();
  }

  /* ---------------- loop ---------------- */
  let lastClock = '';
  function step(dt) {
    if (S.phase !== 'intro') S.time += dt;
    updatePlayer(dt);
    camGlide(dt);
    S.target = canMove() ? findTarget() : null;
    crew.update(dt);
    if (S.phase !== 'intro') director.update(dt);
    ops.update(dt);
    if (S.phase !== 'intro') economy.update(dt);
    if (S.phase !== 'intro') helpdesk.update(dt);
    talk.update(dt);
    staff.update(dt);
    if (S.phase !== 'intro') shifts.update(dt);
    infra.update(dt);
    monitor.update(dt);
    tutorial.update(dt);
    if (S.panel && Math.hypot(S.panel.ix - player.x, S.panel.iy - player.y) > 44) closePanel();
    const c = clockAt(S.time);
    if (c !== lastClock) { lastClock = c; $('clock').textContent = c; }
    if (S.walked > 160) $('hint').classList.add('is-hidden');
    S.liveAcc += dt;
    if (S.liveAcc > 0.25) {
      S.liveAcc = 0;
      if (S.panel) {
        const e = S.panel;
        let k = '';
        if (e.kind === 'rack') k = ops.devices().filter((d) => d.rack === e).map((d) => d.state + (d.fault ? d.fault.found : '') + ops.health(d).up + !!d.broken + !!d.out + (d.svc || '')).join();
        else if (e.kind === 'desk') {
          const st = crew.stationOf(e), u = st && crew.userOf(st), o = st && crew.api.ownerOf(st), rec = staff.broken().find((r) => r.item === e);
          k = (u ? u.crew.id + crew.statusOf(u).split(' · ')[0] : '-') + (o ? o.crew.id : '-') + (rec ? 'b' + rec.out + !!rec.taken + staff.claimed(rec) : '') + (P.seat ? P.seat.key.id : '') + crew.members.length;
        }
        // never rebuild under an open dropdown
        const busySel = inner.contains(document.activeElement) && document.activeElement.tagName === 'SELECT';
        if (k !== S.panelKey && !busySel) { S.panelKey = k; renderPanel(); }
        else updateLive();
      }
    }
  }

  // Intro choice: continue with the tutorial (it starts in explore mode) or skip straight into build mode.
  function begin(withTutorial) {
    if (S.phase !== 'intro') return;
    S.phase = 'play';
    $('intro').classList.remove('is-open');
    // from scratch: a small budget and the starter kit; ready-made environments are already operating
    economy.start(preset);
    // presets come with a team already on its routine
    for (const role of DL.PRESETS[preset].crew || []) {
      const p = crew.api.randomProfile();
      p.role = role;
      // the preset's team is already employed: no hiring cost (salaries run from now on)
      crew.api.hire(p, { silent: true, free: true, at: crew.api.nav.randomSpot(), level: 1 + Math.floor(Math.random() * 3) });
    }
    crew.startShift();
    toast('info', 'Modo ' + DL.learn().name, DL.learn().desc + ' · ' + DL.learn().tag.toLowerCase());
    // presets come with specialised servers (web, banco, DNS…) and a virtualization node with VMs
    if (preset !== 'zero') infra.seed(preset);
    if (preset !== 'zero') toast('ok', DL.PRESETS[preset].name, 'Ambiente pronto · personalize à vontade com B');
    if (document.activeElement) document.activeElement.blur();
    if (withTutorial) tutorial.begin();
    else setMode('build');
    S.preset = preset;
    // (cloud-sync.js: with an account, the new game gets a cloud save slot)
    G.emit('game-begin', { preset });
  }

  let lastFrame = performance.now();
  const render = scene.render.bind(scene);
  scene.render = function () {
    const now = performance.now();
    render();
    updateWorldUi();
    builder.updateUi();
    if (S.mode === 'build') fitDock();
    crew.updateUi(Math.max(0, (now - lastFrame) / 1000));
    economy.updateUi();
    lastFrame = now;
    drawMinimap();
  };

  addEventListener('resize', () => {
    scene.o.tilesWide = narrow() ? 10 : 21;
    scene.o.padTop = narrow() ? 120 : 96;
    scene.resize();
  });
  choosePreset('zero');
  updateMeta();
  scene.start(step);
  requestAnimationFrame(() => requestAnimationFrame(() => game.classList.add('is-ready')));
  $('tutStart').focus({ preventScroll: true });

  // exposed for debugging / automated checks
  window.DataLabDemo = { scene, state: S, player, builder, decor, economy, talk, crew, roles, helpdesk, netlab, tutorial, ops, terminal, cabling, monitor, staff, infra, director, shifts, inventory, seat: { down: seatDown, stand: seatStand, nearest: nearestSeat, get state() { return P; } }, setMode, begin, game: G, openPanel, choosePreset,
    // fast-forward the simulation (game minutes) without drawing — for automated checks
    step,
    advance(sec, dt) { dt = dt || 0.1; for (let t = 0; t < sec; t += dt) { step(dt); scene.update(dt); } },
  };
})();
