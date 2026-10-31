/* DataLab — the season pass: "PASSE BOOT INICIAL – TEMPORADA 1".
   50 levels earned by playing (pass XP), 60 days long. Everything it gives is EXCLUSIVO T1 (cosmetics.js:
   items with pass: 's1'): never sold in the shop, out of reach once the season ends, kept forever by
   whoever earned it. The levels without an item give Gold.
   Pass XP comes only from what the game already does (the game's own events): fixing equipment ('fixed'),
   solving problems ('problem-done'), the crew's tasks ('job-done'), servers going online, cables,
   datacenters done and the time playing — plus 3 daily and 3 weekly missions over the same actions.
   Same inventory, Gold and save as everything else:
   - without an account: progress in this browser (localStorage, like the inventory) and the rewards go
     straight into the local inventory (DL.Inventory.grant) and wallet;
   - with an account: the server keeps the pass (Edge Function "pass", services/pass-service.js). The game
     sends the XP it saw and the missions it finished; the server caps them by the time that went by,
     counts each mission once, raises the level and puts the rewards in the account's inventory.
   UI: the Passe button / J opens #passOv (level, XP bar, days left, missions, the 50 rewards in a row
   that scrolls sideways); a level-up shows a short animation and the item lands in the inventory. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const DAY = 86400000;

  /* ------------------------------------------------------------------ */
  /* The season (the server's migration has the same numbers)            */
  /* ------------------------------------------------------------------ */
  const SEASON = { id: 's1', name: 'Passe Boot Inicial', tag: 'Temporada 1', from: '2026-10-31', days: 60 };
  const MAX = 50;
  const BIG = { 10: 1, 20: 1, 30: 1, 40: 1, 50: 1 };
  // XP from level L to L + 1, and the total to reach level L (each level asks a little more)
  const need = (L) => 200 + 40 * L;
  const total = (L) => 200 * L + 20 * L * (L - 1);
  const levelAt = (xp) => { let L = 0; while (L < MAX && xp >= total(L + 1)) L++; return L; };
  const REWARD = {
    1: ['bp_frame_t1'], 3: ['bp_hello'], 5: ['bp_trail_binary'], 7: ['bp_rug_mobo'], 10: ['bp_pet_bitzero'], 12: ['bp_led_lamp'], 14: ['bp_trail_sparks'],
    15: ['bp_xp2'], 17: ['bp_coffee8'], 19: ['bp_glasses001'], 20: ['bp_emote_hack'], 22: ['bp_floppy_shelf'], 24: ['bp_trail_cables'], 25: ['bp_xp2'],
    27: ['bp_founder_chair'], 29: ['bp_term_boot'], 30: ['bp_relic'], 32: ['bp_data_vault'], 34: ['bp_trail_ghost'], 35: ['bp_xp2'], 37: ['bp_hacker_desk'],
    39: ['bp_crt_terminal'], 40: ['bp_trail_code'], 42: ['bp_arcade_boot'], 44: ['bp_trail_glitch'], 46: ['bp_neon_boot'], 48: ['bp_skin_founder'],
    50: ['bp_trail_rainbow', 'bp_title_pioneer'],
  };
  const goldAt = (L) => (REWARD[L] ? 0 : L < 20 ? 10 : L < 40 ? 15 : 25);
  const start = new Date(SEASON.from + 'T00:00:00').getTime(), end = start + SEASON.days * DAY;
  const active = (now) => { const t = now || Date.now(); return t >= start && t < end; };
  const daysLeft = (now) => Math.max(0, Math.ceil((end - (now || Date.now())) / DAY));
  const levelOf = (id) => { for (const L of Object.keys(REWARD)) if (REWARD[L].indexOf(id) >= 0) return +L; return 0; };

  // XP for each action, and the missions over the same actions (ev: what is counted)
  const XP = { fix: 40, prob: 60, job: 10, online: 30, cable: 5, dc: 250, minute: 10 };
  const EVENT_CAP = 200; // per real minute, from events (time played and missions don't count here)
  const DAILY = [
    { id: 'fix', ev: 'fix', n: 3, xp: 150, text: 'Conserte {n} falhas em servidores ou switches', unit: 'consertados' },
    { id: 'prob', ev: 'prob', n: 2, xp: 200, text: 'Resolva {n} problemas', unit: 'resolvidos' },
    { id: 'jobs', ev: 'job', n: 8, xp: 150, text: 'Complete {n} tarefas da equipe', unit: 'tarefas' },
    { id: 'online', ev: 'online', n: 2, xp: 150, text: 'Coloque {n} servidores online', unit: 'online' },
    { id: 'cable', ev: 'cable', n: 6, xp: 120, text: 'Conecte {n} cabos', unit: 'cabos' },
    { id: 'play', ev: 'minute', n: 20, xp: 150, text: 'Jogue {n} minutos', unit: 'min' },
  ];
  const WEEKLY = [
    { id: 'wfix', ev: 'fix', n: 15, xp: 800, text: 'Conserte {n} falhas em servidores ou switches', unit: 'consertados' },
    { id: 'wprob', ev: 'prob', n: 10, xp: 900, text: 'Resolva {n} problemas', unit: 'resolvidos' },
    { id: 'wjobs', ev: 'job', n: 50, xp: 700, text: 'Complete {n} tarefas da equipe', unit: 'tarefas' },
    { id: 'wonline', ev: 'online', n: 10, xp: 800, text: 'Coloque {n} servidores online', unit: 'online' },
    { id: 'wcable', ev: 'cable', n: 40, xp: 600, text: 'Conecte {n} cabos', unit: 'cabos' },
    { id: 'wplay', ev: 'minute', n: 150, xp: 900, text: 'Jogue {n} minutos', unit: 'min' },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const monday = (d) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
  const dayNo = (d) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
  // 3 missions of a pool, the same for everyone on that day / week
  function pick(pool, seed) {
    return pool.map((m, i) => [DL.hash(seed * 97 + i * 31), m]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  }
  const untilText = (ms) => { const h = Math.floor(ms / 3600000); return h >= 48 ? Math.floor(h / 24) + ' dias' : h >= 1 ? h + ' h' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };

  DL.PASS = { SEASON, MAX, BIG, REWARD, need, total, levelAt, goldAt, active, daysLeft, levelOf, DAILY, WEEKLY, XP };

  /* ------------------------------------------------------------------ */
  /* The frame (Moldura T1) and the title (Pioneiro): shared helpers     */
  /* ------------------------------------------------------------------ */
  // pixel frame around a w×h box on a canvas: turquoise border, stepped corners, the T1 seal
  DL.drawPassFrame = function (g, x, y, w, h, t) {
    const R = DL.R, glow = 0.5 + 0.5 * Math.sin((t || 0) * 2.4);
    R(g, x - 3, y - 3, w + 6, h + 6, 'rgba(45,226,200,' + (0.12 + 0.12 * glow).toFixed(3) + ')');
    R(g, x - 2, y - 2, w + 4, 2, '#2de2c8'); R(g, x - 2, y + h, w + 4, 2, '#14897a');
    R(g, x - 2, y, 2, h, '#2de2c8'); R(g, x + w, y, 2, h, '#14897a');
    for (const [cx, cy] of [[x - 3, y - 3], [x + w + 1, y - 3], [x - 3, y + h + 1], [x + w + 1, y + h + 1]]) R(g, cx, cy, 2, 2, '#b8f3ff');
    R(g, x + w - 9, y + h - 6, 11, 8, '#060d1c'); R(g, x + w - 9, y + h - 6, 11, 1, '#2de2c8');
    DL.pixText(g, 'T1', x + w - 8, y + h - 4, glow > 0.5 ? '#ffffff' : '#b8f3ff');
  };
  DL.PASS_TITLES = { pioneer: { name: 'Pioneiro' } };
  // the badge shown under a name (nametags, the room's player list, the account)
  DL.passTitleHtml = (v) => (DL.PASS_TITLES[v] ? '<em class="ptitle ptitle--t1">' + DL.PASS_TITLES[v].name + '</em>' : '');
  DL.passFrameClass = (v) => (v === 't1' ? ' pframe pframe--t1' : '');
  // what the inventory has equipped in the pass' slots (and the trail): travels with the look online
  const equippedValue = (slot) => { const id = DL.Skins && DL.Skins.equipped[slot], it = id && DL.cosmetic(id); return it ? it.value : null; };
  DL.lookExtras = () => { const o = {}; for (const s of ['trail', 'frame', 'title']) { const v = equippedValue(s); if (v) o[s] = v; } return o; };

  /* ------------------------------------------------------------------ */
  /* The pass in the game (demo.js creates it)                           */
  /* ------------------------------------------------------------------ */
  DL.createPass = function (game, sys) {
    const inventory = sys.inventory, economy = sys.economy;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('passOv'), root: $('passRoot'), btn: $('passBtn'), lvl: $('passBtnLvl'), up: $('passUp') };
    const KEY = 'datalab.pass.' + SEASON.id;
    const fresh = () => ({ v: 1, season: SEASON.id, xp: 0, got: 0, pend: 0, pendM: [], boost: 0, min: 0, day: '', d: {}, dd: {}, week: '', w: {}, wd: {} });
    let S = fresh(), key = KEY;
    const V = { open: false, busy: false, offline: null, warned: false, evWin: 0, evXp: 0, syncT: 0, lastK: '', queue: [], showing: false, raf: 0, scrolled: false };

    function load(k) {
      key = k;
      S = fresh();
      try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (s && s.season === SEASON.id) Object.assign(S, s); } catch (e) { /* fresh */ }
      S.pendM = Array.isArray(S.pendM) ? S.pendM : [];
      rollMissions();
    }
    const save = () => { try { localStorage.setItem(key, JSON.stringify(S)); } catch (e) { /* private mode */ } };
    // with an account the server delivers (never this browser, even while the server is out of reach);
    // remote: the account's inventory is here, so the pass can talk to the server
    const signed = () => !!(DL.Cloud && DL.Cloud.signedIn);
    const remote = () => signed() && !!(inventory.remote && DL.PassService);
    const level = () => levelAt(S.xp);
    const playing = () => !!(sys.playing && sys.playing());

    /* ---------- missions ---------- */
    function current() {
      const now = new Date();
      return { daily: pick(DAILY, dayNo(now)), weekly: pick(WEEKLY, dayNo(monday(now)) + 7777), day: dayKey(now), week: dayKey(monday(now)) };
    }
    // a new day / week: fresh missions (finished ones stay finished for their own day)
    function rollMissions() {
      const c = current();
      if (S.day !== c.day) { S.day = c.day; S.d = {}; S.dd = {}; }
      if (S.week !== c.week) { S.week = c.week; S.w = {}; S.wd = {}; }
      return c;
    }
    function count(ev, n) {
      if (!active()) return;
      const c = rollMissions();
      for (const [list, prog, done, kind, period] of [[c.daily, S.d, S.dd, 'd', S.day], [c.weekly, S.w, S.wd, 'w', S.week]]) {
        for (const m of list) {
          if (m.ev !== ev || done[m.id]) continue;
          prog[m.id] = Math.min(m.n, (prog[m.id] || 0) + n);
          if (prog[m.id] >= m.n) {
            done[m.id] = true;
            const x = addXp(m.xp, 'mission');
            if (signed()) S.pendM.push({ k: kind + ':' + period + ':' + m.id, xp: m.xp });
            game.toast('ok', (kind === 'd' ? 'Missão diária' : 'Missão semanal') + ' concluída', esc(m.text.replace('{n}', m.n)) + ' · +' + fmt(x) + ' XP do passe');
            game.sfx('levelup');
          }
        }
      }
      save();
      if (V.open) render();
    }

    /* ---------- XP ---------- */
    // returns the XP really added (double while the bonus runs). kind: 'event' (capped per minute), 'time'
    // (a minute played) or 'mission' (its base XP reaches the server with the mission's key, not as XP)
    function addXp(n, kind) {
      if (!active() || !(n > 0)) return 0;
      if (!kind || kind === 'event') {
        const now = Date.now();
        if (now - V.evWin > 60000) { V.evWin = now; V.evXp = 0; }
        n = Math.min(n, EVENT_CAP - V.evXp);
        if (n <= 0) return 0;
        V.evXp += n;
      }
      const got = S.boost > 0 ? n * 2 : n;
      const before = level();
      S.xp += got;
      if (signed()) S.pend += kind === 'mission' ? got - n : got;
      if (level() > before) {
        if (signed()) scheduleSync(800);
        else settleLocal();
      }
      save();
      paintButton();
      return got;
    }
    // without an account: every level reached delivers its reward here, once
    function settleLocal() {
      if (signed()) return;
      const L = level();
      while (S.got < L) {
        S.got++;
        deliver(S.got);
        celebrate(S.got);
      }
      save();
    }
    function deliver(L) {
      for (const id of REWARD[L] || []) {
        const it = DL.cosmetic(id);
        if (it && (it.stack || !inventory.owns(id))) inventory.grant(id, 'passe');
      }
      const g = goldAt(L);
      if (g) economy.earn('gold', g, 'Passe Boot · nível ' + L, { quiet: true });
    }

    /* ---------- the server (with an account) ---------- */
    function scheduleSync(ms) { clearTimeout(V.syncT); V.syncT = setTimeout(sync, ms); }
    // fresh: the answer to a sync this game sent (its new levels are celebrated); otherwise the account's
    // state as it was (levels earned before, maybe on another device, are not)
    function applyServer(p, fresh) {
      if (!p || p.season !== SEASON.id) return;
      const before = S.got;
      // the server's XP + what it hasn't seen yet (XP and the base of finished missions)
      S.xp = Math.max(0, (p.xp | 0) + S.pend + S.pendM.reduce((n, m) => n + m.xp, 0));
      S.got = Math.min(MAX, p.level | 0);
      // missions the account already finished (on any device) stay finished
      for (const k of p.missions || []) {
        const [kind, period, id] = String(k).split(':');
        if (kind === 'd' && period === S.day) { S.dd[id] = true; const m = DAILY.find((x) => x.id === id); if (m) S.d[id] = m.n; }
        if (kind === 'w' && period === S.week) { S.wd[id] = true; const m = WEEKLY.find((x) => x.id === id); if (m) S.w[id] = m.n; }
      }
      for (let L = before + 1; L <= S.got; L++) if (fresh || V.synced) celebrate(L);
      V.synced = true;
      save();
      paintButton();
      if (V.open) render();
    }
    async function sync() {
      clearTimeout(V.syncT);
      if (!remote() || V.busy) return;
      const xp = Math.min(1000000, Math.max(0, Math.round(S.pend))), missions = S.pendM.slice(0, 12);
      V.busy = true;
      const r = await DL.PassService.sync({ season: SEASON.id, xp, missions });
      V.busy = false;
      if (r.ok) {
        V.offline = null;
        S.pend = Math.max(0, S.pend - xp);
        S.pendM = S.pendM.filter((m) => !missions.some((x) => x.k === m.k));
        if (r.data.inventory) DL.InventoryService.applied(r.data.inventory);
        applyServer(r.data.pass, true);
      } else {
        V.offline = r.message || 'Servidor indisponível';
        // the database / function of the pass are not there yet: say it once, keep the XP for later
        if (!V.warned && (r.status === 404 || r.code === 'http_404' || r.code === 'not_found')) {
          V.warned = true;
          console.warn('DataLab: o Passe ainda não está no servidor — publique a migration 20261101000100_battle_pass.sql e a Edge Function "pass".');
          game.toast('warn', 'Passe', 'O servidor ainda não tem o passe: seu XP fica guardado e as recompensas chegam quando ele for atualizado.');
        }
        save();
        if (V.open) render();
      }
    }
    async function pull() {
      if (!remote() || Date.now() - (V.pullAt || 0) < 15000) return;
      V.pullAt = Date.now();
      const r = await DL.PassService.state();
      if (r.ok) { V.offline = null; applyServer(r.data.pass); if (S.pend || S.pendM.length) scheduleSync(1500); }
      else V.offline = r.message;
    }
    // whose pass: this browser's, or the account's (cached here, the server decides)
    function account() {
      const u = DL.Cloud && DL.Cloud.signedIn && DL.Cloud.user;
      const k = u ? KEY + '.' + u.id : KEY;
      if (k !== key) { load(k); V.synced = false; paintButton(); }
      if (u) pull();
      else settleLocal();
      if (V.open) render();
    }

    /* ---------- the game's own actions ---------- */
    const on = (ev, test, kind) => game.on(ev, (info) => { if (!playing() || (test && !test(info || {}))) return; addXp(XP[kind]); count(kind, 1); });
    on('fixed', null, 'fix');
    on('problem-done', (i) => !i.wrong, 'prob');
    on('job-done', (i) => !i.failed, 'job');
    on('server-online', null, 'online');
    on('cabled', null, 'cable');
    on('datacenter-done', null, 'dc');
    game.on('pass-boost', () => { S.boost += 3600; save(); paintButton(); if (V.open) render(); });
    // the inventory changed: the trail / frame / title other players see may have changed too
    game.on('inventory', () => {
      const k = JSON.stringify(DL.lookExtras());
      if (k !== V.lastK) { V.lastK = k; game.emit('look-extras', {}); }
      if (V.open) render();
    });

    // the game loop (demo.js step): time played, the bonus' clock, the periodic sync
    let syncEvery = 0;
    function update(dt) {
      if (!(dt > 0) || !playing() || document.hidden || !active()) return;
      S.min += dt;
      if (S.boost > 0) S.boost = Math.max(0, S.boost - dt);
      if (S.min >= 60) {
        S.min -= 60;
        addXp(XP.minute, 'time');
        count('minute', 1);
      }
      syncEvery += dt;
      if (syncEvery > 40) { syncEvery = 0; if (remote() && (S.pend > 0 || S.pendM.length || !V.synced)) { if (V.synced) sync(); else { V.pullAt = 0; pull(); } } }
    }

    /* ---------- UI: the top bar button ---------- */
    function paintButton() {
      if (el.lvl) el.lvl.textContent = active() ? String(level()) : 'T1';
      if (el.btn) {
        el.btn.classList.toggle('is-boost', S.boost > 0);
        el.btn.title = SEASON.name + ' · ' + SEASON.tag + ' · nível ' + level() + (active() ? ' · faltam ' + daysLeft() + ' dias' : ' · temporada encerrada') + ' (J)';
      }
    }

    /* ---------- UI: the window ---------- */
    function rewardItems(L) { return (REWARD[L] || []).map((id) => DL.cosmetic(id)).filter(Boolean); }
    function stateOf(L) {
      if (L <= S.got) return 'got';
      if (L <= level()) return signed() ? 'sending' : 'got';
      return 'locked';
    }
    function cardHtml(L) {
      const st = stateOf(L), its = rewardItems(L), g = goldAt(L), big = BIG[L];
      const name = its.length ? its.map((it) => it.name).join(' + ') : g + ' Gold';
      const kind = its.length ? its.map((it) => kindName(it)).join(' + ') : 'Moedas';
      return '<li class="bp-card' + (big ? ' is-big' : '') + ' is-' + st + (L === level() + 1 ? ' is-next' : '') + '" data-lv="' + L + '">' +
        '<span class="bp-card__lv">' + (big ? '★ ' : '') + 'NÍVEL ' + L + '</span>' +
        '<span class="bp-card__art">' + (its.length ? its.map((it) => '<canvas data-bp-art="' + it.id + '"' + (big ? ' data-big="1"' : '') + ' aria-hidden="true"></canvas>').join('') : '<canvas data-bp-gold="' + g + '" aria-hidden="true"></canvas>') +
        (st === 'locked' ? '<span class="bp-lock" aria-label="Bloqueado">🔒</span>' : '') + '</span>' +
        '<b class="bp-card__name">' + esc(name) + '</b><span class="bp-card__kind">' + esc(kind) + '</span>' +
        '<span class="bp-card__st">' + (st === 'got' ? 'Coletado' : st === 'sending' ? 'Entregando…' : L === level() + 1 ? 'Próximo' : 'Bloqueado') + '</span></li>';
    }
    function kindName(it) {
      if (it.slot === 'furniture') return 'Móvel';
      if (it.slot === 'trail') return 'Rastro';
      if (it.slot === 'pet') return 'Pet';
      if (it.cat === 'emote') return 'Emote';
      if (it.slot === 'shirt') return 'Skin';
      if (it.slot === 'terminal') return 'Skin de hack';
      if (it.slot === 'rack') return 'Skin de servidor';
      if (it.slot === 'frame') return 'Moldura';
      if (it.slot === 'title') return 'Título';
      if (it.slot === 'use') return 'Bônus de XP';
      return 'Acessório';
    }
    function missionsHtml(list, prog, done, title, until) {
      return '<section class="bp-mis"><header><b>' + title + '</b><span>trocam em ' + until + '</span></header><ul>' + list.map((m) => {
        const p = Math.min(m.n, prog[m.id] || 0), ok = !!done[m.id];
        return '<li class="' + (ok ? 'is-done' : '') + '"><span class="bp-mis__txt">' + (ok ? '✔ ' : '') + esc(m.text.replace('{n}', m.n)) + '</span>' +
          '<span class="bp-mis__bar"><i style="width:' + Math.round((p / m.n) * 100) + '%"></i></span>' +
          '<span class="bp-mis__n">' + p + '/' + m.n + ' ' + esc(m.unit) + '</span><span class="bp-mis__xp">+' + fmt(m.xp) + ' XP</span></li>';
      }).join('') + '</ul></section>';
    }
    function render() {
      if (!el.root) return;
      const L = level(), on = active(), c = rollMissions(), now = new Date();
      const into = L >= MAX ? need(MAX - 1) : S.xp - total(L), span = L >= MAX ? need(MAX - 1) : need(L);
      let h = '<header class="app__bar bp-bar"><span class="bp-logo" aria-hidden="true"></span><span class="bp-title"><b>' + SEASON.name.toUpperCase() + '</b><span>' + SEASON.tag + ' · exclusivo T1</span></span>' +
        '<span class="bp-days' + (on ? '' : ' is-over') + '">' + (on ? 'Faltam <b>' + daysLeft() + '</b> dias' : 'Temporada encerrada') + '</span>' +
        '<button class="cc__x" type="button" data-bp="close" aria-label="Fechar o passe">×</button></header>';
      h += '<div class="bp-body"><section class="bp-hero"><div class="bp-lvl"><span>NÍVEL</span><b>' + L + '</b><small>de ' + MAX + '</small></div>' +
        '<div class="bp-xp"><div class="bp-xp__top"><b>' + (L >= MAX ? 'Passe completo!' : 'Próximo nível: ' + (L + 1)) + '</b><span>' + fmt(into) + ' / ' + fmt(span) + ' XP</span></div>' +
        '<div class="bp-xp__bar"><i style="width:' + Math.min(100, Math.round((into / span) * 100)) + '%"></i></div>' +
        '<p class="bp-xp__how">XP do passe: consertar (+' + XP.fix + '), resolver problemas (+' + XP.prob + '), servidores online (+' + XP.online + '), tarefas da equipe (+' + XP.job + '), cabos (+' + XP.cable + ') e +' + XP.minute + ' por minuto jogando.' +
        (S.boost > 0 ? ' <em class="bp-boost">2× XP · ' + Math.ceil(S.boost / 60) + ' min</em>' : '') + '</p>' +
        (signed() && (V.offline || !remote()) ? '<p class="bp-warn">Servidor: ' + esc(V.offline || 'conectando…') + ' · o XP fica guardado e é enviado depois.</p>' : '') +
        (!DL.Cloud || !DL.Cloud.signedIn ? '<p class="bp-note">Sem conta: o passe fica salvo neste navegador.</p>' : '') + '</div></section>';
      if (on) h += '<div class="bp-missions">' + missionsHtml(c.daily, S.d, S.dd, 'Missões diárias', untilText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now)) +
        missionsHtml(c.weekly, S.w, S.wd, 'Missões semanais', untilText(monday(now).getTime() + 7 * DAY - now)) + '</div>';
      else h += '<p class="bp-over">A Temporada 1 terminou. Os itens que você ganhou são seus para sempre; ninguém mais consegue os que faltaram.</p>';
      h += '<section class="bp-track"><header><b>Recompensas</b><span>Os níveis ★ têm os prêmios grandes · itens exclusivos, nunca vendidos na loja</span>' +
        '<span class="bp-track__nav"><button class="btn btn--sm" type="button" data-bp="left" aria-label="Rolar para a esquerda">‹</button><button class="btn btn--sm" type="button" data-bp="right" aria-label="Rolar para a direita">›</button></span></header>' +
        '<ol class="bp-row" data-bp-row>';
      for (let i = 1; i <= MAX; i++) h += cardHtml(i);
      h += '</ol></section></div>';
      const row = el.root.querySelector('[data-bp-row]'), keep = row ? row.scrollLeft : null;
      el.root.innerHTML = h;
      const nrow = el.root.querySelector('[data-bp-row]');
      if (keep !== null && V.scrolled) nrow.scrollLeft = keep;
      else { const cur = nrow.querySelector('[data-lv="' + Math.max(1, Math.min(MAX, L + 1)) + '"]'); if (cur) nrow.scrollLeft = Math.max(0, cur.offsetLeft - 24); V.scrolled = true; }
      paintArt(performance.now() / 1000);
    }
    function paintGold(cv, n) {
      cv.width = cv.height = 96;
      const g = cv.getContext('2d'), R = DL.R;
      g.imageSmoothingEnabled = false;
      g.setTransform(2, 0, 0, 2, 0, 0);
      R(g, 16, 12, 16, 22, '#b8892f'); R(g, 14, 14, 20, 18, '#b8892f'); R(g, 16, 13, 16, 20, '#f2c14e'); R(g, 15, 15, 18, 16, '#f2c14e');
      R(g, 18, 15, 3, 3, '#fff1b8'); R(g, 22, 18, 4, 10, '#b8892f');
      DL.pixText(g, String(n), 24 - String(n).length * 2, 38, '#fff1b8');
    }
    function paintArt(t) {
      if (!el.root) return;
      el.root.querySelectorAll('canvas[data-bp-art]').forEach((cv) => { const it = DL.cosmetic(cv.dataset.bpArt); if (it && inventory.drawArt) inventory.drawArt(cv, it, t, !!cv.dataset.big); });
      el.root.querySelectorAll('canvas[data-bp-gold]').forEach((cv) => { if (!cv.width || cv.width !== 96) paintGold(cv, cv.dataset.bpGold); });
    }
    let last = 0;
    function animate(now) {
      V.raf = 0;
      if (!V.open) return;
      if (now - last > 120) { last = now; paintArt(now / 1000); }
      V.raf = requestAnimationFrame(animate);
    }
    function open() {
      if (!el.ov) return;
      V.open = true;
      V.scrolled = false;
      if (inventory.close) inventory.close();
      render();
      el.ov.classList.add('is-open');
      if (game.keysReset) game.keysReset();
      if (!V.raf) V.raf = requestAnimationFrame(animate);
      if (remote()) pull();
    }
    function close() {
      V.open = false;
      if (el.ov) el.ov.classList.remove('is-open');
      if (el.ov && el.ov.contains(document.activeElement)) document.activeElement.blur();
    }
    if (el.root) el.root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-bp]');
      if (!b) return;
      const row = el.root.querySelector('[data-bp-row]');
      if (b.dataset.bp === 'close') close();
      else if (b.dataset.bp === 'left' && row) row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' });
      else if (b.dataset.bp === 'right' && row) row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' });
    });
    if (el.ov) el.ov.addEventListener('pointerdown', (ev) => { if (ev.target === el.ov) close(); });
    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); if (V.open) close(); else open(); });

    /* ---------- level up: a short animation, the item goes to the inventory ---------- */
    function celebrate(L) {
      V.queue.push(L);
      if (!V.showing) nextUp();
    }
    // several levels at once (a weekly mission, the server catching up) show as one: the highest level,
    // up to four of the rewards and how many there were
    function nextUp() {
      const Ls = V.queue.splice(0);
      if (!Ls.length || !el.up) { V.showing = false; return; }
      V.showing = true;
      const L = Math.max(...Ls), its = [].concat(...Ls.map(rewardItems)), g = Ls.reduce((n, l) => n + goldAt(l), 0);
      const big = Ls.some((l) => BIG[l]), show = its.slice().sort((a, b) => levelOf(b.id) - levelOf(a.id)).slice(0, 4);
      const name = its.length > 2 ? its.length + ' recompensas' + (g ? ' + ' + g + ' Gold' : '') : its.length ? its.map((it) => it.name).join(' + ') + (g ? ' + ' + g + ' Gold' : '') : '+' + g + ' Gold';
      el.up.innerHTML = '<div class="bp-up' + (big ? ' is-big' : '') + '"><span class="bp-up__rays" aria-hidden="true"></span><span class="bp-up__tag">PASSE BOOT · T1' + (Ls.length > 1 ? ' · +' + Ls.length + ' NÍVEIS' : '') + '</span><b class="bp-up__lv">NÍVEL ' + L + '!</b>' +
        '<span class="bp-up__art' + (show.length > 2 ? ' is-many' : '') + '">' + (show.length ? show.map((it) => '<canvas data-bp-art="' + it.id + '" data-big="1"></canvas>').join('') : '<canvas data-bp-gold="' + g + '"></canvas>') + '</span>' +
        '<span class="bp-up__name">' + esc(name) + '</span><span class="bp-up__go">' + (its.length ? 'Enviado para o inventário (U)' : 'Já está na sua carteira') + '</span></div>';
      el.up.hidden = false;
      const t0 = performance.now();
      const paint = (now) => {
        if (el.up.hidden) return;
        el.up.querySelectorAll('canvas[data-bp-art]').forEach((cv) => { const it = DL.cosmetic(cv.dataset.bpArt); if (it && inventory.drawArt) inventory.drawArt(cv, it, now / 1000, true); });
        el.up.querySelectorAll('canvas[data-bp-gold]').forEach((cv) => { if (cv.width !== 96) paintGold(cv, cv.dataset.bpGold); });
        if (now - t0 < 2900) requestAnimationFrame(paint);
      };
      requestAnimationFrame(paint);
      game.sfx('levelup');
      setTimeout(() => { el.up.hidden = true; el.up.innerHTML = ''; setTimeout(nextUp, 180); }, 2900);
      if (V.open) render();
    }

    load(KEY);
    paintButton();
    // the account arriving (or leaving) switches whose pass this is
    if (DL.Cloud) DL.Cloud.on('auth', () => setTimeout(account, 0));
    // (after the listener that switches the inventory to the account's: cloud-sync.js runs right after this)
    if (DL.InventoryService) DL.InventoryService.onState(() => { if (DL.Cloud.signedIn && !V.synced) setTimeout(account, 0); });
    setTimeout(account, 0);
    addEventListener('pagehide', () => { if (remote() && (S.pend || S.pendM.length)) sync(); });

    const api = {
      open, close, update, sync,
      get isOpen() { return V.open; },
      key(ev) { if (ev.code === 'Escape') { close(); return true; } return false; },
      get level() { return level(); },
      get xp() { return S.xp; },
      get delivered() { return S.got; },
      get boost() { return S.boost; },
      get active() { return active(); },
      levelOf,
      // the XP bonus is used from the inventory: only while the season is on
      canBoost: () => (active() ? null : 'A temporada do passe terminou'),
      myTitle: () => equippedValue('title'),
      // exposed for automated checks
      _: { S: () => S, addXp, count, settleLocal, missions: current, applyServer },
    };
    DL.Pass = api;
    return api;
  };
})();
