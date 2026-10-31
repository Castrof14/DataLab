/* DataLab — account window (Conta), for logged-in players only (login, sign up and recovery live in
   the access gate, auth-gate.js): profile + progress, cloud saves and the staff panel (item grants).
   Talks only to the services in services/*.js. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const when = (t) => (t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const el = { box: $('account'), body: $('accountBody'), btn: $('accountBtn'), dot: $('accountDot') };
  const V = { tab: 'profile', msg: null, tone: 'info', busy: false, profile: null, progress: null, roles: [], titles: [], saves: [], users: [], log: [], pick: null };

  const isOpen = () => el.box.classList.contains('is-open');
  function open(tab) {
    if (!DL.Cloud.signedIn) return;
    if (tab) V.tab = tab;
    V.msg = null;
    el.box.classList.add('is-open');
    D.game.keysReset && D.game.keysReset();
    refresh();
  }
  function close() { el.box.classList.remove('is-open'); if (el.box.contains(document.activeElement)) document.activeElement.blur(); }
  const say = (tone, msg) => { V.tone = tone; V.msg = msg; render(); };

  async function progress() {
    const q = DL.Cloud.from('player_progress');
    if (!q) return null;
    const { data } = await q.select('level, xp, datacenters_completed, total_play_minutes, last_slot, last_played_at').maybeSingle();
    return data || null;
  }
  async function refresh() {
    if (!DL.Cloud.signedIn) return;
    const [p, roles, saves, prog, titles] = await Promise.all([DL.Auth.profile(), DL.Auth.roles(), DL.SaveService.listCloud(), progress(), DL.Auth.titles()]);
    V.profile = p;
    V.roles = roles;
    V.titles = titles;
    V.saves = saves;
    V.progress = prog;
    if (V.tab === 'admin' && !V.roles.length) V.tab = 'profile';
    render();
    status();
  }

  function status() {
    if (!el.dot) return;
    el.dot.className = 'acc-dot is-' + (DL.Cloud.signedIn ? 'online' : 'signed-out');
    el.btn.title = DL.Cloud.signedIn ? 'Sua conta · saves e inventário no servidor' : 'Sessão encerrada';
  }

  /* ---------------- views ---------------- */
  const field = (label, html) => '<label class="acc-field"><span class="eyebrow-sm">' + label + '</span>' + html + '</label>';
  const input = (name, type, ph, val, extra) => '<input class="input" name="' + name + '" type="' + type + '" placeholder="' + esc(ph || '') + '" value="' + esc(val || '') + '" ' + (extra || '') + '>';
  const btn = (act, label, primary) => '<button type="' + (primary ? 'submit' : 'button') + '" class="btn btn--sm' + (primary ? ' btn--primary' : '') + '" data-acc="' + act + '"' + (V.busy ? ' disabled' : '') + '>' + label + '</button>';

  function tabs() {
    const list = [['profile', 'Perfil'], ['saves', 'Saves']].concat(V.roles.length ? [['admin', 'Administração']] : []);
    return '<nav class="mv-tabs acc-tabs" role="tablist">' + list.map(([k, l]) => '<button type="button" role="tab" class="mv-tab' + (V.tab === k ? ' is-on' : '') + '" data-tab="' + k + '">' + l + '</button>').join('') + '</nav>';
  }

  function viewProfile() {
    const p = V.profile || {}, g = V.progress || {}, w = D.economy.wallet;
    const company = (V.saves.find((s) => s.slot === (g.last_slot || 1)) || V.saves[0] || {}).name;
    const hours = Math.floor((g.total_play_minutes || 0) / 60);
    // the season pass' profile frame and title (battlepass.js), when equipped (the golden frame wraps the
    // face: its light runs around it, pass.css)
    const pass = DL.lookExtras ? DL.lookExtras() : {}, passT = pass.title && DL.passTitleHtml ? DL.passTitleHtml(pass.title) : '';
    const face = '<canvas class="acc-face' + (DL.passFrameClass ? DL.passFrameClass(pass.frame) : '') + '" data-face aria-hidden="true"></canvas>';
    return '<div class="acc-profile">' + (pass.frame === 't1' ? '<span class="acc-framed">' + face + '</span>' : face) + '<div><b>@' + esc(p.username) + '</b><span class="acc-small">' + esc(p.email || '') + '</span>' +
      '<span class="acc-small">Conta criada em ' + when(p.created_at) + '</span>' + '<span class="acc-roles">' + (V.titles.length || passT ? V.titles.map(DL.titleBadge).join('') + passT : '<span class="acc-small">Sem título ainda</span>') + '</span>' + '</div>' +
      '<div class="acc-bal"><span class="cur cur--dc"></span><b class="is-gold">' + fmt(w.gold) + '</b><small>Gold</small><span class="cur cur--cr"></span><b>' + fmt(w.credits) + '</b><small>créditos</small></div></div>' +
      '<dl class="acc-stats"><div><dt class="eyebrow-sm">Empresa</dt><dd>' + esc(company || '—') + '</dd></div><div><dt class="eyebrow-sm">Nível</dt><dd>' + (g.level || 1) + '</dd></div>' +
      '<div><dt class="eyebrow-sm">Datacenters concluídos</dt><dd>' + (g.datacenters_completed || 0) + '</dd></div><div><dt class="eyebrow-sm">Tempo de jogo</dt><dd>' + hours + ' h ' + ((g.total_play_minutes || 0) % 60) + ' min</dd></div></dl>' +
      '<form class="acc-form" data-form="profile">' + field('Nome de usuário', input('username', 'text', '', p.username, 'required pattern="[a-z0-9_]{3,20}" maxlength="20"')) +
      field('Nome exibido', input('display_name', 'text', '', p.display_name, 'maxlength="32"')) +
      '<p class="acc-small">A aparência do personagem é editada no jogo (tecla <kbd>P</kbd>) e salva na conta automaticamente.</p>' +
      '<div class="acc-acts">' + btn('profile', 'Salvar perfil', true) + btn('logout', 'Sair da conta') + '</div></form>';
  }
  function viewSaves() {
    const active = DL.SaveService.slot;
    let h = '<p class="acc-small">O servidor confere e precifica tudo a cada salvamento (automático a cada ' + ((window.DATALAB_CONFIG || {}).autosaveSeconds || 30) + ' s e ao sair do jogo). Um <b>Novo jogo</b> ocupa o primeiro espaço livre.</p>' +
      (V.saves.error ? '<p class="acc-msg is-warn" role="status">' + esc(V.saves.error) + '</p>' : '') + '<ul class="acc-slots">';
    for (const n of [1, 2, 3]) {
      const s = V.saves.find((x) => x.slot === n && x.version > 0);
      const st = (s && s.stats) || {};
      h += '<li class="acc-slot' + (active === n ? ' is-active' : '') + '"><span class="acc-slot__n">' + n + '</span>';
      if (s) {
        h += '<div><b>' + esc(s.name) + (active === n ? ' <em>em jogo</em>' : '') + '</b><span class="acc-small">' + when(s.updated_at) + ' · v' + s.version + ' · ' + (st.rooms || 0) + ' salas · ' + (st.servers || 0) + ' servidores · ' + (st.crew || 0) + ' pessoas · $' + fmt(st.cash || 0) + '</span></div>' +
          '<div class="acc-acts">' + (active === n ? btn('save:' + n, 'Salvar agora', true) : btn('load:' + n, 'Carregar')) + btn('del:' + n, 'Excluir') + '</div>';
      } else h += '<div><b>Vazio</b><span class="acc-small">Comece um Novo jogo para usar este espaço.</span></div>';
      h += '</li>';
    }
    return h + '</ul>' + (DL.SaveService.lastSaved ? '<p class="acc-small">Último salvamento: ' + when(DL.SaveService.lastSaved) + '</p>' : '');
  }
  function viewAdmin() {
    const isAdmin = V.roles.indexOf('admin') >= 0, canGrant = isAdmin || V.roles.indexOf('developer') >= 0;
    const titleIds = Object.keys(DL.TITLES).filter((t) => DL.TITLES[t].grant);
    const items = DL.COSMETICS.slice().sort((a, b) => (a.grantOnly === b.grantOnly ? a.name.localeCompare(b.name) : a.grantOnly ? -1 : 1));
    let h = '<div class="acc-admin"><form class="acc-form acc-search" data-form="find">' + field('Buscar jogador (usuário ou id)', input('query', 'search', 'ex.: alex', '', 'minlength="2"')) + '<div class="acc-acts">' + btn('find', 'Buscar', true) + '</div></form>';
    if (V.users.length) h += '<ul class="acc-users">' + V.users.map((u) => '<li><label><input type="radio" name="target" value="' + esc(u.id) + '"' + (V.pick === u.id ? ' checked' : '') + '> <b>@' + esc(u.username) + '</b> <span class="acc-small">' + when(u.created_at) + (u.roles.length ? ' · ' + u.roles.join(', ') : '') + '</span></label>' +
      (isAdmin ? '<span class="acc-acts">' + ['admin', 'developer', 'moderator'].map((r) => '<button type="button" class="chip chip--xs' + (u.roles.indexOf(r) >= 0 ? ' is-on' : '') + '" data-role="' + r + '" data-user="' + esc(u.id) + '">' + r + '</button>').join('') + '</span>' : '') +
      (canGrant ? '<span class="acc-acts"><span class="eyebrow-sm">Títulos</span>' + titleIds.map((t) => '<button type="button" class="chip chip--xs' + ((u.titles || []).indexOf(t) >= 0 ? ' is-on' : '') + '" data-title="' + t + '" data-user="' + esc(u.id) + '">' + esc(DL.TITLES[t].name) + '</button>').join('') + '</span>' : '') + '</li>').join('') + '</ul>';
    if (canGrant) {
      h += '<form class="acc-form acc-grant" data-form="grant"><span class="eyebrow-sm">Conceder ao jogador marcado</span>' +
        field('Item ou moeda', '<select class="input" name="what">' + (isAdmin ? '<option value="cur:gold">Gold (moeda dourada)</option><option value="cur:credits">Créditos</option>' : '') +
          items.map((it) => '<option value="item:' + it.id + '">' + esc(it.name) + ' · ' + esc((DL.RARITY[it.rarity] || {}).name || '') + (it.grantOnly ? ' · ' + (it.grant || '').toUpperCase() : '') + '</option>').join('') + '</select>') +
        '<div class="acc-row">' + field('Quantidade', input('quantity', 'number', '1', '1', 'min="1" max="1000000" required')) +
        field('Tipo', '<select class="input" name="grant_type">' + DL.AdminService.GRANT_TYPES.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select>') + '</div>' +
        field('Motivo (obrigatório, fica registrado)', input('reason', 'text', 'ex.: fundador do servidor beta', '', 'required minlength="3" maxlength="500"')) +
        '<div class="acc-acts">' + btn('grant', 'Conceder', true) + btn('log', 'Atualizar registro') + '</div></form>';
    }
    if (V.log.length) h += '<span class="eyebrow-sm">Registro de concessões</span><ul class="acc-log">' + V.log.map((g) => '<li><span class="mono">' + when(g.created_at) + '</span><span><b>@' + esc(g.by_user || 'sistema') + '</b> → <b>@' + esc(g.to_user) + '</b> · ' + esc(g.item_id || g.currency_id) + ' ×' + g.quantity + ' · ' + esc(g.grant_type) + '</span><em>' + esc(g.reason) + '</em></li>').join('') + '</ul>';
    return h + '</div>';
  }

  function render() {
    let h = '<header class="acc-head-px"><svg class="dl-logo dl-logo--xs" viewBox="0 0 240 44" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DataLab SIMULADOR DE DATACENTER" shape-rendering="crispEdges" image-rendering="pixelated"><g class="dl-logo__rack"><rect x="2" y="8" width="28" height="28" rx="0" fill="#0b1120" stroke="#152033" stroke-width="2"/><rect x="6" y="12" width="20" height="3" rx="0" fill="#0f1626"/><rect x="6" y="17" width="20" height="3" rx="0" fill="#0f1626"/><rect x="6" y="22" width="20" height="3" rx="0" fill="#0f1626"/><rect x="6" y="27" width="20" height="3" rx="0" fill="#0f1626"/><rect class="dl-led dl-led--a" x="22" y="13" width="2" height="2" rx="0"/><rect class="dl-led dl-led--b" x="22" y="18" width="2" height="2" rx="0"/><rect class="dl-led dl-led--c" x="22" y="23" width="2" height="2" rx="0"/><rect class="dl-led dl-led--d" x="22" y="28" width="2" height="2" rx="0"/></g><g class="dl-logo__text"><text x="40" y="24" class="dl-logo__datalab">DATALAB</text><text x="40" y="36" class="dl-logo__sub">SIMULADOR DE DATACENTER</text></g></svg><button class="cc__x" type="button" data-acc="close" aria-label="Fechar">×</button></header>';
    h += tabs();
    if (V.msg) h += '<p class="acc-msg is-' + V.tone + '" role="status">' + esc(V.msg) + '</p>';
    const view = { profile: viewProfile, saves: viewSaves, admin: viewAdmin }[V.tab] || viewProfile;
    el.body.innerHTML = h + view();
    const face = el.body.querySelector('[data-face]');
    if (face) { const sh = D.player.sheet; face.width = face.height = 48; const g = face.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(sh.down.idle, 3, 1, 16, 16, 0, 0, 48, 48); }
  }

  /* ---------------- actions ---------------- */
  async function run(fn) {
    if (V.busy) return;
    V.busy = true;
    render();
    try { await fn(); } catch (e) { console.error(e); say('warn', 'Algo deu errado. Tente de novo.'); } finally { V.busy = false; render(); }
  }

  el.body.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target, data = Object.fromEntries(new FormData(f).entries());
    const kind = f.dataset.form;
    // read the picked player now: the busy re-render rebuilds the list
    const picked = (el.body.querySelector('input[name="target"]:checked') || {}).value || null;
    if (picked) V.pick = picked;
    run(async () => {
      if (kind === 'profile') {
        const r = await DL.Auth.updateProfile({ username: data.username, display_name: data.display_name });
        if (!r.ok) return say('warn', r.message);
        await refresh();
        if (D.menu && D.menu.setAccount) D.menu.setAccount(V.profile);
        say('ok', 'Perfil salvo.');
      } else if (kind === 'find') {
        const r = await DL.AdminService.findUsers(data.query);
        if (!r.ok) return say('warn', r.message);
        V.users = r.data;
        if (!V.users.length) say('info', 'Nenhum jogador encontrado.');
      } else if (kind === 'grant') {
        const target = picked;
        if (!target) return say('warn', 'Marque o jogador que vai receber.');
        const [type, id] = String(data.what).split(':');
        const g = { user_id: target, quantity: Math.floor(+data.quantity || 0), grant_type: data.grant_type, reason: data.reason };
        if (type === 'cur') g.currency = id; else g.item_id = id;
        const r = await DL.AdminService.grant(g);
        if (!r.ok) return say('warn', r.message);
        const lg = await DL.AdminService.log(30);
        if (lg.ok) V.log = lg.data;
        say('ok', 'Concedido: ' + (g.item_id || g.currency) + ' ×' + g.quantity + ' · registrado.');
      }
    });
  });

  el.body.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tab]');
    if (t) { V.tab = t.dataset.tab; V.msg = null; if (V.tab === 'admin') run(async () => { const lg = await DL.AdminService.log(30); if (lg.ok) V.log = lg.data; }); else render(); return; }
    const r = ev.target.closest('[data-role]');
    if (r) {
      const on = !r.classList.contains('is-on');
      run(async () => {
        const x = await DL.AdminService.setRole(r.dataset.user, r.dataset.role, on);
        if (!x.ok) return say('warn', x.message);
        const u = V.users.find((u2) => u2.id === r.dataset.user);
        if (u) u.roles = x.data.roles;
        say('ok', 'Papéis atualizados.');
      });
      return;
    }
    const ti = ev.target.closest('[data-title]');
    if (ti) {
      const on = !ti.classList.contains('is-on');
      run(async () => {
        const x = await DL.AdminService.setTitle(ti.dataset.user, ti.dataset.title, on);
        if (!x.ok) return say('warn', x.message);
        const u = V.users.find((u2) => u2.id === ti.dataset.user);
        if (u) u.titles = x.data.titles;
        if (ti.dataset.user === (DL.Cloud.user || {}).id) { V.titles = await DL.Auth.titles(); if (D.menu && D.menu.setAccount) D.menu.setAccount(V.profile); }
        say('ok', 'Títulos atualizados.');
      });
      return;
    }
    const b = ev.target.closest('[data-acc]');
    if (!b || b.type === 'submit') return;
    const [act, n] = b.dataset.acc.split(':'), slot = +n;
    if (act === 'close') return close();
    // signing out: the access gate takes over (the page reloads to the login)
    if (act === 'logout') return run(async () => { if (DL.SaveService.slot) await DL.SaveService.save({}); await DL.Auth.signOut(); });
    if (act === 'log') return run(async () => { const lg = await DL.AdminService.log(30); if (lg.ok) V.log = lg.data; else say('warn', lg.message); });
    if (act === 'save') return run(async () => { const x = await DL.SaveService.save({}); if (!x.ok) return say('warn', x.message); V.saves = await DL.SaveService.listCloud(); say('ok', 'Salvo · caixa no servidor: $' + fmt(x.data.cash)); });
    if (act === 'load') return run(async () => { const x = await DL.CloudSync.load(slot); if (x.ok) close(); else say('warn', x.message); });
    if (act === 'del') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmar exclusão'; return; }
      return run(async () => { const x = await DL.SaveService.remove(slot); if (!x.ok) return say('warn', x.message); if (DL.SaveService.slot === slot) DL.CloudSync.setSlot(null); V.saves = await DL.SaveService.listCloud(); say('ok', 'Espaço ' + slot + ' liberado.'); });
    }
  });

  el.box.addEventListener('pointerdown', (ev) => { if (ev.target === el.box) close(); });
  el.body.addEventListener('keydown', (ev) => ev.stopPropagation()); // typing doesn't move the player
  addEventListener('keydown', (ev) => { if (isOpen() && ev.code === 'Escape') { close(); ev.preventDefault(); } }, true);
  if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); open(); });
  DL.Cloud.on('auth', () => { status(); if (isOpen()) refresh(); });
  DL.Cloud.on('saved', () => { if (isOpen() && V.tab === 'saves') DL.SaveService.listCloud().then((s) => { V.saves = s; render(); }); });
  status();

  DL.AccountUI = { open, close, get isOpen() { return isOpen(); } };
})();
