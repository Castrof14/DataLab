/* DataLab — career problems. problems-data.js holds lessons and problems as plain data (the shape the
   database will keep); this file turns them into terminal lessons and runs the problems in the game:
   sorts one out now and then for the player's rank, binds it to a real device (or rack), sets up what
   went wrong, lists it in Tarefas (T), and pays XP (career.js) when the player solves it.
   Checks are JSON read by a fixed list of probes — nothing from the data is ever executed. */
(function () {
  'use strict';
  const DL = window.DL;
  const DATA = DL.SCENARIO_DATA;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const GW = '10.0.1.1';
  let OPS = null; // the running game's ops (switch.near needs it)

  /* ------------------------------------------------------------------ */
  /* Templates: {{dev.ip}} · {{rack.id}} · {{gw}} · lesson vars          */
  /* ------------------------------------------------------------------ */
  const look = (env, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), env);
  const tpl = (s, env) => String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => { const v = look(env, k); return v == null ? '' : String(v); });
  // every string inside a JSON value
  function fill(v, env) {
    if (typeof v === 'string') return tpl(v, env);
    if (Array.isArray(v)) return v.map((x) => fill(x, env));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = fill(v[k], env); return o; }
    return v;
  }
  // what a template knows about a device or a rack
  function envOf(x) {
    const env = { gw: GW };
    if (!x) return env;
    if (x.kind === 'rack') { env.rack = { id: x.id }; return env; }
    env.dev = { name: x.name, ip: x.ip, host: String(x.name).toLowerCase() };
    env.rack = { id: x.rack ? x.rack.id : '' };
    return env;
  }

  /* ------------------------------------------------------------------ */
  /* Checks                                                              */
  /* ------------------------------------------------------------------ */
  // every state a check may read: (device or rack, argument) → value
  const PROBES = {
    'eth0.up': (d) => !!(d.os && d.os.ifaces.eth0.up),
    'eth0.ip': (d) => !!(d.os && d.os.ifaces.eth0.ips.indexOf(d.ip + '/24') >= 0),
    route: (d) => (d.os ? d.os.route : null),
    cable: (d) => !!(d.os && d.os.cable),
    service: (d, name) => (d.os ? d.os.services[name] : null),
    disk: (d) => (d.os ? d.os.disk : null),
    'disk.pct': (d) => (d.os ? Math.round(d.os.disk) : null),
    'hw.cores': (d) => { const m = DL.hwOf ? DL.hwOf(d) : null; return m && m.cores != null ? m.cores : null; },
    hostname: (d) => (d.os ? d.os.hostname : null),
    state: (d) => d.state,
    fault: (d) => (d.fault ? d.fault.type : null),
    'sw.mode': (d) => (d.sw ? d.sw.mode : null),
    'sw.cur': (d) => (d.sw ? d.sw.cur : null),
    'sw.bad': (d) => (d.sw ? d.sw.bad : null),
    'sw.port': (d, port) => (d.sw ? d.sw.ports[port] : null),
    'sw.healed': (d, port) => !!d.sw && (d.sw.fixed || (d.sw.bad !== port && d.sw.ports[port] !== 'err-disabled' && d.sw.ports[port] !== 'disabled')),
    'switch.near': (d) => !!OPS && OPS.switchesNear(d).some((s) => !s.model || s.model.managed !== false),
    // a server plugged straight into this switch (no patch panel: show interfaces status names it) → { name, port }
    'sw.direct': (sw) => {
      if (!OPS || sw.kind !== 'switch') return null;
      const list = OPS.devices().filter((d) => d.kind === 'server').map((d) => [d, d.path || OPS.trace(d)]).filter(([, t]) => t.ok && t.sw === sw && t.links.length === 1);
      if (!list.length) return null;
      const [d, t] = pick(list);
      return { name: d.name, port: t.port };
    },
    'rack.tidy': (e) => e.tidy !== false && e.cableLook === 'tidy',
    'sw.saved': (d) => !!d.sw && !d.sw.unsaved,
    // the switch port at the other end of a server's cable
    'srv.port': (d) => { const t = OPS && d.kind === 'server' ? d.path || OPS.trace(d) : null; return t && t.ok ? t.port : null; },
    // the IP guessing SSH passwords (terminal.js DL.authAttack)
    'auth.attacker': (d) => (d.os && d.os.attacker) || null,
    // one service listening on this server → { name (the process ss shows), port }
    'svc.listen': (d) => {
      if (!d.os) return null;
      const list = [];
      if (d.os.services.nginx === 'active') list.push({ name: 'nginx', port: '80' });
      if (d.os.services.ssh === 'active') list.push({ name: 'sshd', port: '22' });
      return list.length ? pick(list) : null;
    },
  };
  // the other devices a problem may involve (data: devices: { role: resolver }), found from its main one
  const RESOLVE = {
    // the switch at the other end of the server's cable (managed — it has a console — and working)
    'switch.of': (x) => {
      if (!OPS || !x || x.kind !== 'server') return null;
      const t = x.path || OPS.trace(x);
      return t.ok && t.sw && !t.sw.broken && !(t.sw.model && t.sw.model.managed === false) ? t.sw : null;
    },
  };
  // values read once (lesson vars / problem vars)
  function readVars(vars, x) {
    const out = {};
    for (const k of Object.keys(vars || {})) { const p = PROBES[vars[k]]; out[k] = p && x ? p(x) : null; }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Answers: what the player typed against what the step accepts        */
  /* ------------------------------------------------------------------ */
  const NORM = {
    // 10.0.1.12/24 → 10.0.1.12
    ip: (s) => s.replace(/\s+/g, '').replace(/\/\d+$/, '').toLowerCase(),
    // Gi0/3 · gi 0/3 · GigabitEthernet0/3 · g0/3 · 0/3 → gi0/3
    port: (s) => { const t = s.replace(/\s+/g, '').toLowerCase(), m = /^([a-z]*)(\d+\/\d+)$/.exec(t); return m && 'gigabitethernet'.indexOf(m[1]) === 0 ? 'gi' + m[2] : t; },
    // "12 núcleos" · "84%" → 12 · 84
    int: (s) => { const m = /-?\d+(?:[.,]\d+)?/.exec(s); return m ? parseFloat(m[0].replace(',', '.')) : NaN; },
    text: (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '),
  };
  DL.checkAnswer = function (ans, value) {
    const n = NORM[ans.normalize] || NORM.text, got = n(String(value || ''));
    return (ans.accept || []).some((a) => {
      const want = n(String(a));
      if (ans.normalize === 'int') return !isNaN(got) && !isNaN(want) && Math.abs(got - want) <= (ans.tol || 0);
      return want !== '' && got === want;
    });
  };
  const warned = new Set();
  function test(c, x, ran) {
    if (!c) return false;
    if (c.any) return c.any.some((k) => test(k, x, ran));
    if (c.all) return c.all.every((k) => test(k, x, ran));
    if (c.not) return !test(c.not, x, ran);
    if (c.ran != null) return !!ran && ran.has(c.ran);
    if (c.bound != null) return !!x === !!c.bound;
    if (c.state) {
      const p = PROBES[c.state];
      if (!p) { if (!warned.has(c.state)) { warned.add(c.state); console.warn('problems: estado desconhecido', c.state); } return false; }
      if (!x) return false;
      const v = p(x, c.arg);
      if ('eq' in c) return v === c.eq;
      if ('ne' in c) return v !== c.ne;
      if ('lt' in c) return v < c.lt;
      if ('gt' in c) return v > c.gt;
      if (c.in) return c.in.indexOf(v) >= 0;
      if (c.notIn) return c.notIn.indexOf(v) < 0;
      return !!v;
    }
    return false;
  }

  // a lesson definition + the device it opens on → what terminal.js runs ({ title, goal, steps[].done })
  // vars: values already read (a problem reads its own when it starts); the rest are read now
  // an answer step is done once the terminal reports 'answer:<its index>' (terminal.js checks the value)
  // devs: a problem on more than one device ({ dev, sw }) — each step happens on its own (step.device, default
  // dev) and is checked there, with what was typed on that device's console ('on' tells the terminal where)
  function compileLesson(def, x, vars, devs) {
    const main = devs && devs.dev ? devs.dev : x, key = 'p:' + def.id;
    const env = Object.assign(envOf(main), vars || readVars(def.vars, main));
    for (const r of Object.keys(devs || {})) if (r !== 'dev' && devs[r]) env[r] = { name: devs[r].name, ip: devs[r].ip };
    return {
      title: tpl(def.title, env),
      goal: tpl(def.goal || def.summary || '', env),
      steps: (def.steps || []).map((s, k) => {
        const on = devs ? devs[s.device || 'dev'] : undefined;
        const base = { text: tpl(s.text, env), help: s.help || [], cmd: s.cmd ? tpl(s.cmd, env) : undefined, action: s.action, on };
        if (s.type === 'answer') {
          const a = fill(s.answer || {}, env);
          return Object.assign(base, { answer: { accept: (a.accept || []).map(String), normalize: a.normalize || 'text', tol: a.tol || 0 }, done: (d, ran) => !!ran && ran.has('answer:' + k) });
        }
        const check = fill(s.check, env);
        // on another device: its state, and what was typed on its console for this same lesson
        const done = on ? (d, ran) => test(check, on, on === d ? ran : on.lessonKey === key ? on.ran : null) : (d, ran) => test(check, d, ran);
        return Object.assign(base, { done });
      }),
    };
  }
  DL.compileLesson = compileLesson;

  // the vars / devices of the open problem on a device (set by the running game)
  let varsOf = () => null, devsOf = () => null;
  // the lessons ops.js opens for faults / new servers, and one per console problem ('p:<id>')
  function registerLessons() {
    for (const k of Object.keys(DL.LESSONS)) if (k.indexOf('p:') === 0) delete DL.LESSONS[k];
    for (const k of Object.keys(DATA.lessons)) DL.LESSONS[k] = (d) => compileLesson(DATA.lessons[k], d);
    for (const p of DATA.problems) if (p.complete === 'lesson') DL.LESSONS['p:' + p.id] = (d) => compileLesson(p, d, varsOf(p.id, d), devsOf(p.id, d));
  }
  registerLessons();

  /* ------------------------------------------------------------------ */
  /* Data from the database (services/scenario-service.js)              */
  /* The bundled copy above is the default (offline play); online, the  */
  /* tables replace it. Anything that doesn't look right is left out:   */
  /* the bundled lesson / problem / rank stays.                          */
  /* ------------------------------------------------------------------ */
  const KINDS = ['server', 'switch', 'rack'], COMPLETE = ['lesson', 'fixed', 'online', 'steps'], NORMS = ['ip', 'port', 'int', 'text'];
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const okStep = (s) => isObj(s) && typeof s.text === 'string' && (!s.help || (Array.isArray(s.help) && s.help.every((k) => DL.CMD_HELP[k]))) && (!s.device || /^[a-z]{2,8}$/.test(s.device)) &&
    (s.type === 'answer' ? isObj(s.answer) && Array.isArray(s.answer.accept) && s.answer.accept.length && (!s.answer.normalize || NORMS.indexOf(s.answer.normalize) >= 0) : isObj(s.check));
  const okLesson = (l) => isObj(l) && typeof l.title === 'string' && Array.isArray(l.steps) && l.steps.length > 0 && l.steps.every(okStep);
  const okProblem = (p) => isObj(p) && /^[a-z0-9_]{2,40}$/.test(p.id) && typeof p.title === 'string' && typeof p.rank === 'string' && p.xp > 0 &&
    COMPLETE.indexOf(p.complete) >= 0 && isObj(p.target) && KINDS.indexOf(p.target.kind) >= 0 &&
    (!p.devices || (isObj(p.devices) && Object.keys(p.devices).every((r) => /^[a-z]{2,8}$/.test(r) && r !== 'dev' && RESOLVE[p.devices[r]]))) &&
    (p.complete === 'lesson' || p.complete === 'steps' ? Array.isArray(p.steps) && p.steps.length > 0 && p.steps.every(okStep) : true);
  DL.applyScenarioData = function (next, source) {
    if (!isObj(next)) return false;
    let n = 0;
    if (isObj(next.help)) for (const k of Object.keys(next.help)) {
      const h = next.help[k];
      if (isObj(h) && typeof h.cmd === 'string' && typeof h.ex === 'string' && typeof h.what === 'string' && typeof h.when === 'string') { DL.CMD_HELP[k] = { cmd: h.cmd, ex: h.ex, what: h.what, when: h.when }; n++; }
    }
    if (isObj(next.lessons)) for (const k of Object.keys(next.lessons)) if (okLesson(next.lessons[k])) { DATA.lessons[k] = next.lessons[k]; n++; }
    if (Array.isArray(next.ranks) && next.ranks.length && next.ranks.every((r) => isObj(r) && typeof r.id === 'string' && r.level >= 1)) { DATA.ranks = next.ranks; n++; }
    if (Array.isArray(next.problems)) {
      const good = next.problems.filter((p) => okProblem(p) && DATA.ranks.some((r) => r.id === p.rank));
      if (good.length) { DATA.problems = good; n += good.length; }
      if (good.length < next.problems.length) console.warn('problems: ' + (next.problems.length - good.length) + ' problema(s) do banco ignorado(s) (formato inválido)');
    }
    if (!n) return false;
    DATA.source = source || 'db';
    registerLessons();
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* Problems in the game                                                */
  /* ------------------------------------------------------------------ */
  const PACE = {
    first: 40,              // game minutes before the first one (a session that just started)
    gapHome: [80, 140],     // between problems at the player's own rank
    gapUp: [260, 420],      // problems of a lower rank, for someone above it
    maxHome: 2, maxUp: 1,   // open at the same time (the player's own new servers don't count)
    faultHome: 0.02,        // chance per check (every half minute) to take an open incident slot: ~70% of the
    faultUp: 0.004,         // incidents at the player's own rank, few above it
    hold: 240,              // above the problem's rank: the crew leaves it to the player this long
    expire: 900,            // above the problem's rank: a console / checklist problem left untouched goes away
  };
  const DIFF = { 1: 'fácil', 2: 'médio', 3: 'difícil' };
  // the player's share of the XP when a crew member they assigned solves it (the server uses the same: career_settle)
  const CREW_SHARE = 0.15;
  DL.PROBLEM_PACE = PACE;

  DL.createProblems = function (game, sys) {
    const ops = sys.ops, scene = game.scene;
    OPS = ops;
    // looked up each time: the data may come from the database after the game started (scenario-service.js)
    const byId = (id) => DATA.problems.find((p) => p.id === id);
    const levelOf = (def) => { const r = DATA.ranks.find((x) => x.id === def.rank); return r ? r.level : 1; };
    const playerLevel = () => (sys.career ? sys.career.level : 1);
    const rankName = (def) => { const L = sys.career && sys.career.LEVELS[levelOf(def) - 1]; return L ? L.rank.name : def.rank; };
    const now = () => scene.t;
    const P = { open: [], seq: 0, next: PACE.first, acc: 0 };

    // extra rules a problem may name (data: when)
    const WHEN = {
      // no server yet, or one of the player's own still without its cable
      firstServer: () => { const s = ops.devices().filter((d) => d.kind === 'server'); return !s.length || s.some((d) => !d.pre && d.state === 'new'); },
    };

    /* ---------- the equipment a problem happens on ---------- */
    function fits(x, t) {
      if (x.hold) return false;
      if (t.state && [].concat(t.state).indexOf(x.state) < 0) return false;
      if (t.os === 'linux' && DL.isWin && DL.isWin(x)) return false;
      if (t.own && x.pre) return false;
      if (t.healthy && (x.fault || x.broken || x.out || x.state !== 'online' || !ops.health(x).up)) return false;
      if (t.web && !(x.os && x.os.services.nginx === 'active')) return false;
      if (t.managed && x.model && x.model.managed === false) return false;
      if (t.direct && !PROBES['sw.direct'](x)) return false;
      if (t.linked && !(x.sw && Array.from(x.sw.linked || []).some((p) => p !== 'te1'))) return false;
      return true;
    }
    // the other devices of a problem on this one ({ sw }), each free and without a fault of its own — or null
    function extrasFor(def, x) {
      const out = {};
      for (const r of Object.keys(def.devices || {})) {
        const e = RESOLVE[def.devices[r]] && RESOLVE[def.devices[r]](x);
        if (!e || e.hold || e.fault || e.broken || e.out) return null;
        out[r] = e;
      }
      return out;
    }
    function candidates(def) {
      const t = def.target;
      if (t.kind === 'rack') return scene.world.items.filter((e) => e.kind === 'rack' && e.units && !e.hold && (!t.cabled || e.cableLook));
      return ops.devices().filter((d) => d.kind === t.kind && fits(d, t) && (!def.devices || extrasFor(def, d)));
    }
    // the preferred name (SRV-01) half of the time, so the same server doesn't get every problem
    function choose(def, list) {
      const pref = def.target.prefer && list.find((x) => x.name === def.target.prefer);
      return pref && rand() < 0.5 ? pref : pick(list);
    }
    const exists = (x) => (x.kind === 'rack' ? scene.world.items.indexOf(x) >= 0 : ops.devices().indexOf(x) >= 0);
    // every device a problem involves: its main one and the others (devices)
    const devicesOf = (p) => [p.x].concat(Object.values(p.extra || {})).filter(Boolean);

    /* ---------- texts ---------- */
    const envP = (p) => {
      const env = Object.assign(envOf(p.x), p.vars || {});
      for (const r of Object.keys(p.extra || {})) env[r] = { name: p.extra[r].name, ip: p.extra[r].ip };
      return env;
    };
    const titleOf = (p) => tpl(p.def.title, envP(p));
    const summaryOf = (p) => tpl(p.def.summary || '', envP(p));
    const openOn = (id, d) => P.open.find((x) => x.def.id === id && devicesOf(x).indexOf(d) >= 0);
    varsOf = (id, d) => { const p = openOn(id, d); return p ? p.vars : null; };
    devsOf = (id, d) => { const p = openOn(id, d); return p && p.extra ? Object.assign({ dev: p.x }, p.extra) : null; };
    const xpFor = (p) => (sys.career ? sys.career.xpFor(p.def) : p.def.xp);

    /* ---------- start / bind / set up ---------- */
    function bind(p, x) {
      p.x = x;
      if (x && p.def.devices && !p.extra) p.extra = extrasFor(p.def, x) || {};
      // the crew leaves it to the player (above the problem's rank only for a while: see update)
      for (const d of devicesOf(p)) d.hold = p.uid;
    }
    function release(p) { for (const d of devicesOf(p)) if (d.hold === p.uid) delete d.hold; }

    // what went wrong when the problem starts (false: it doesn't fit this device after all)
    function setUp(p, quiet) {
      const s = p.def.setup, x = p.x;
      if (!s || !x) return true;
      if (s.fault) {
        // setup.on: the fault goes on another device of the problem (the switch port at the end of the server's cable)
        const fx = s.on ? p.extra && p.extra[s.on] : x;
        if (quiet || !fx || !ops.injectFault(fx, s.fault, s.on && s.fault === 'port' ? { port: PROBES['srv.port'](x) } : null)) return false;
        // setup.quiet: no alert (it would give away the answer, e.g. the port in err-disabled); the problem tells it
        if (s.quiet) Object.assign(fx.fault, { found: true, foundAt: now(), by: null });
        else ops.report(fx, null, 'chamado');
        if (fx.fault) fx.fault.problem = p.uid;
        return true;
      }
      if (s.hostname && x.os) x.os.hostname = s.hostname;
      if (s.rack === 'messy') { x.tidy = false; x.messyNoted = true; ops.recompute(); }
      // someone guessing SSH passwords (the same IP when a save brings the problem back)
      if (s.authlog === 'bruteforce' && x.os && DL.authAttack) DL.authAttack(x, p.vars && p.vars.attacker);
      // a port description changed after the last save of the switch configuration
      if (s.swconfig === 'unsaved' && x.sw) { x.sw.unsaved = true; x.sw.unsavedPort = pick(Array.from(x.sw.linked || []).filter((q) => q !== 'te1')) || null; }
      return true;
    }

    function start(def, x, opts) {
      opts = opts || {};
      const p = { uid: ++P.seq, def, x: null, at: now() - (opts.age || 0), by: null, wrong: 0, vars: opts.vars || null };
      bind(p, x || null);
      if (!setUp(p, opts.quiet)) { release(p); return null; }
      // what the problem is about stays fixed from now on (the port that broke, the server to find…)
      p.vars = opts.vars || (x ? readVars(def.vars, x) : {});
      // a console problem starts from clean consoles: what was typed for the last one doesn't count again
      if (x && def.complete === 'lesson') for (const d of devicesOf(p)) { d.ran = new Set(); d.lessonKey = null; }
      P.open.push(p);
      if (!opts.quiet) {
        if (def.setup && def.setup.fault && game.director) game.director.started('problem', titleOf(p));
        ops.logEvent('info', '🧩 Problema: ' + titleOf(p) + ' · +' + xpFor(p) + ' XP');
        game.toast('info', 'Problema · +' + xpFor(p) + ' XP', esc(titleOf(p)) + ' · Tarefas (T)');
        game.sfx('ping');
      }
      ops.render(true);
      return p;
    }

    function close(p) {
      P.open = P.open.filter((x) => x !== p);
      release(p);
      p.closed = true;
      // whoever was on their way to it stops (the player or someone else solved it first)
      const a = p.assignee;
      p.assignee = null;
      if (a && sys.crew && a.crew.job && a.crew.job.def.problem === p.uid) sys.crew.api.cancelJob(a, true);
      ops.render(true);
    }

    // by: 'player' or the name of the crew member who did it. Only the player's own work pays the whole XP;
    // the crew member the player assigned it to (p.doneBy) pays CREW_SHARE; anyone else, nothing.
    function finish(p, by) {
      if (p.closed) return;
      close(p);
      const title = titleOf(p), assigned = by !== 'player' && !!p.doneBy && by === p.doneBy;
      let xp = 0;
      if (by === 'player') {
        xp = sys.career ? sys.career.solve(p.def, 1) : 0;
        if (game.economy && p.def.credits) game.economy.earn('credits', p.def.credits, 'Problema: ' + title);
        ops.logEvent('ok', '🧩 Resolvido: ' + title + ' · +' + xp + ' XP' + (p.def.handoff ? ' · ' + p.def.handoff : ''));
        game.toast('ok', 'Problema resolvido · +' + xp + ' XP', esc(title) + (p.def.handoff ? ' · ' + esc(p.def.handoff) : ''));
        game.sfx('done');
      } else if (assigned) {
        xp = sys.career ? sys.career.solve(p.def, CREW_SHARE) : 0;
        ops.logEvent('ok', '🧩 Resolvido por ' + by + ' (atribuído por você): ' + title + ' · +' + xp + ' XP');
        game.toast('ok', 'Resolvido por ' + esc(by) + ' · +' + xp + ' XP', esc(title) + ' · ' + Math.round(CREW_SHARE * 100) + '% do XP por ter atribuído');
        game.sfx('done');
      } else ops.logEvent('ok', '🧩 Resolvido por ' + by + ': ' + title + ' (sem XP para você)');
      // (economy.js reports the ones worth XP in the next cloud save: the server prices them again)
      game.emit('problem-done', { id: p.def.id, by, wrong: p.wrong, xp });
    }
    function cancel(p, why) {
      if (p.closed) return;
      close(p);
      ops.logEvent('info', '🧩 Encerrado: ' + titleOf(p) + (why ? ' · ' + why : ''));
    }

    /* ---------- what moves a problem forward ---------- */
    game.on('fixed', (info) => {
      for (const p of P.open.slice()) if (p.def.complete === 'fixed' && p.x === info.d) finish(p, info.by || 'player');
    });
    game.on('server-online', (info) => {
      for (const p of P.open.slice()) if (p.def.complete === 'online' && p.x === info.d) finish(p, p.doneBy || 'player');
    });
    // checklist problems: whoever did the last thing on their target
    game.on('tidy', (info) => { for (const p of P.open) if (info.racks.indexOf(p.x) >= 0) p.by = info.who || 'player'; });
    game.on('cabled', (info) => { for (const p of P.open) if (p.x === info.d) p.by = info.who || 'player'; });
    // wrong answers in the console (kept for the problem's history)
    game.on('answer', (info) => { if (!info.ok) for (const p of P.open) if (p.x === info.d && p.def.complete === 'lesson') p.wrong++; });

    const stepsDone = (p) => (p.def.steps || []).map((s) => test(fill(s.check, envP(p)), p.x, null));
    const stepOf = (p) => { const k = stepsDone(p).indexOf(false); return k < 0 ? (p.def.steps || []).length : k; };

    /* ---------- the timer ---------- */
    function eligible(level) {
      const open = new Set(P.open.map((p) => p.def.id));
      return DATA.problems.filter((def) => def.trigger !== 'auto' && levelOf(def) <= level && !open.has(def.id) &&
        (!def.when || (WHEN[def.when] && WHEN[def.when]())) &&
        (!def.setup || !def.setup.fault || !game.director || game.director.canStart('fault')) &&
        candidates(def).length);
    }
    // onlyFaults: just the ones that break something (they take an incident slot the director just opened)
    function trySpawn(onlyFaults) {
      const level = playerLevel(), home = DATA.problems.some((d) => levelOf(d) === level);
      const max = home ? PACE.maxHome : PACE.maxUp;
      if (P.open.filter((p) => p.def.trigger !== 'auto').length >= max) return;
      const defs = eligible(level).filter((d) => !onlyFaults || (d.setup && d.setup.fault));
      if (!defs.length) return;
      // never solved: twice as likely
      const w = defs.map((d) => (d.weight || 1) * (sys.career && sys.career.solvedCount(d.id) ? 1 : 2));
      let r = rand() * w.reduce((a, b) => a + b, 0), def = defs[defs.length - 1];
      for (let i = 0; i < defs.length; i++) if ((r -= w[i]) <= 0) { def = defs[i]; break; }
      start(def, choose(def, candidates(def)));
    }

    // problems that start the moment they fit, at their own rank (the player's own new server)
    function autoStart() {
      const level = playerLevel();
      for (const def of DATA.problems) {
        if (def.trigger !== 'auto' || levelOf(def) !== level || P.open.some((p) => p.def.id === def.id)) continue;
        if (def.when && !(WHEN[def.when] && WHEN[def.when]())) continue;
        const list = candidates(def);
        if (list.length) start(def, list[0]);
        else if (def.target.lazy) start(def, null);
      }
    }

    function update(dt) {
      if (game.paused && game.paused()) return;
      P.next -= dt;
      P.acc += dt;
      if (P.acc < 0.5) return;
      P.acc = 0;
      const level = playerLevel(), t = now();
      for (const p of P.open.slice()) {
        const above = level > levelOf(p.def);
        // a checklist problem waiting for its equipment (the server the player is about to install)
        if (!p.x && p.def.target.lazy) { const list = candidates(p.def); if (list.length) bind(p, list[0]); }
        if (devicesOf(p).some((d) => !exists(d))) { cancel(p, 'equipamento removido'); continue; }
        if (p.def.complete === 'fixed' && p.x && !p.x.fault) { cancel(p, 'o problema sumiu'); continue; }
        if (p.def.complete === 'online' && p.x && p.x.state === 'online') { finish(p, p.doneBy || 'player'); continue; }
        // the person it was assigned to stopped (another order, end of the shift, dismissed): it is open again
        if (p.assignee && !onIt(p.assignee, p)) { ops.logEvent('info', '🧩 ' + p.assignee.crew.name + ' parou: ' + titleOf(p) + ' · atribua de novo ou resolva você'); p.assignee = null; ops.render(true); }
        if (p.def.complete === 'steps' && (p.x || !p.def.target.lazy) && stepsDone(p).every(Boolean)) { finish(p, p.by || 'player'); continue; }
        if (above && p.x && p.x.hold === p.uid && t - p.at > PACE.hold) delete p.x.hold;
        if (above && (p.def.complete === 'lesson' || p.def.complete === 'steps') && t - p.at > PACE.expire) cancel(p, 'ninguém pegou');
      }
      autoStart();
      const home = DATA.problems.some((d) => levelOf(d) === level);
      if (P.next <= 0) {
        P.next = between.apply(null, home ? PACE.gapHome : PACE.gapUp);
        trySpawn();
      }
      // an incident slot is open (director.js): a problem that breaks something may take it before a random
      // fault does (ops.js asks every 20–45 min) — at the player's own rank most incidents come as problems
      else if (game.director && rand() < (home ? PACE.faultHome : PACE.faultUp) && game.director.canStart('fault')) trySpawn(true);
    }

    /* ---------- actions (Tarefas panel) ---------- */
    // the console lesson of a problem on this device, if any (ops.openTerminal asks). When the device already has
    // a lesson of its own (a fault), only a problem that caused that fault goes first (identify the broken port).
    const consoleFor = (d, busy) => P.open.find((p) => devicesOf(p).indexOf(d) >= 0 && p.def.complete === 'lesson' && (!busy || (p.def.setup && p.def.setup.fault))) || null;
    // at: the device whose console the player asked for; without it, the device of the step the problem is on
    function openConsole(p, at) {
      let d = at || p.x;
      if (!at && p.extra) {
        const key = 'p:' + p.def.id, L = DL.LESSONS[key](p.x), ran = p.x.lessonKey === key ? p.x.ran : new Set();
        const s = L.steps.find((st) => !st.done(p.x, ran));
        if (s && s.on) d = s.on;
      }
      sys.terminal.open(d, 'p:' + p.def.id, () => finish(p, 'player'));
    }

    /* ---------- assigning a problem to someone on the team ---------- */
    const roleName = (r) => (DL.ROLES[r] ? DL.ROLES[r].name : r);
    const alive = (a) => !!sys.crew && sys.crew.members.indexOf(a) >= 0;
    const onIt = (a, p) => alive(a) && !!a.crew.job && a.crew.job.def.problem === p.uid;
    // who can take it: the roles in the data (roles: [] = only the player), a custom role whose main skill is the
    // problem's, or a legendary bot (they do almost everything); people off shift are left out
    const canTake = (a, def) => {
      const role = a.crew.profile.role, r = DL.ROLES[role];
      return def.roles.indexOf(role) >= 0 || !!a.crew.legend || (!!r && !!r.custom && DL.ROLE_SKILL[role] === def.skill);
    };
    const assignable = (p) => !!p.x && (p.def.roles || []).length > 0;
    function crewFor(p) {
      if (!sys.crew || !assignable(p)) return [];
      const sk = (a) => Math.round(a.crew.stats.skills[p.def.skill] || 0);
      return sys.crew.members.filter((a) => !a.hidden && !a.crew.off && canTake(a, p.def)).sort((x, y) => sk(y) - sk(x))
        .map((a) => ({ a, skill: sk(a), busy: a.crew.job && !a.crew.job.auto ? a.crew.job.name : null }));
    }

    // the order the crew member works on: go to the rack, work for bot_minutes, then botFinish
    function botJob(p) {
      const def = p.def;
      return {
        id: 'problem', problem: p.uid, name: 'Problema: ' + titleOf(p), verb: 'Resolvendo o problema', kind: 'equip', skill: def.skill,
        xp: 12 + 6 * (def.difficulty || 1), dur: [def.bot_minutes * 0.8, def.bot_minutes * 1.2], auto: 0, desc: summaryOf(p),
        place: (x) => (x.kind === 'rack' ? x : x.rack),
        finish: (ctx) => botFinish(p, ctx.a),
      };
    }
    function assign(p, a) {
      if (!assignable(p) || !alive(a) || !canTake(a, p.def)) return 'Não pode resolver este problema';
      const why = sys.crew.api.startJob(a, botJob(p), { auto: false, target: p.x });
      if (why) { game.toast('warn', 'Não deu para atribuir', esc(a.crew.name) + ': ' + esc(why)); return why; }
      p.assignee = a;
      p.picking = false;
      ops.logEvent('info', '🧩 ' + titleOf(p) + ' → ' + a.crew.name + ' (você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP)');
      if (game.chat) game.chat.post(a, pick(['Deixa comigo: ', 'Pode deixar, já vou ver: ', 'Tô indo: ']) + titleOf(p).charAt(0).toLowerCase() + titleOf(p).slice(1) + '.');
      ops.render(true);
      return null;
    }
    function unassign(p) {
      const a = p.assignee;
      p.assignee = null;
      if (a && onIt(a, p)) sys.crew.api.cancelJob(a);
      ops.render(true);
    }

    // what the crew member did, as the player would have (same end state): true when it worked
    function resolveFor(p, a) {
      const x = p.x, def = p.def, name = a.crew.name;
      if (def.complete === 'fixed') return !!x.fault && ops.fix(x, a);
      // bot_action 'fix': a console problem whose fault the crew member also fixes (the port of the server's switch)
      if (def.bot === 'fix' && def.setup && def.setup.fault) {
        const fx = def.setup.on ? p.extra && p.extra[def.setup.on] : x;
        if (fx && fx.fault && !ops.fix(fx, a)) return false;
      }
      if (def.complete === 'online') return ops.configure(x);
      if (def.setup && def.setup.rack === 'messy') ops.tidy([x], name);
      if (def.setup && def.setup.hostname && x.os) x.os.hostname = String(x.name).toLowerCase();
      if (def.setup && def.setup.swconfig && x.sw) x.sw.unsaved = false;
      if (!p.closed) finish(p, name);
      return true;
    }
    // what they tell the team: the answer, when the problem asked something
    function botSay(p) {
      if (p.def.complete !== 'lesson') return 'Resolvido: ' + titleOf(p) + '.';
      const L = compileLesson(p.def, p.x, p.vars), q = L.steps.filter((s) => s.answer).pop();
      return 'Resolvido: ' + titleOf(p) + (q && q.answer.accept[0] ? ' → ' + q.answer.accept[0] : '') + '.';
    }
    function botFinish(p, a) {
      const title = titleOf(p);
      if (p.closed) return { say: 'Cheguei em "' + title + '" e já estava resolvido. Melhor assim!' };
      p.assignee = null;
      // beginners sometimes don't make it (the same odds as fixing a fault, jobs.js)
      const s = a.crew.stats.skills[p.def.skill] || 0;
      if (rand() < Math.max(0, (42 - s) / 70)) {
        ops.logEvent('warn', '🧩 ' + a.crew.name + ' não conseguiu: ' + title);
        ops.render(true);
        return { say: 'Tentei "' + title + '", mas não consegui. ' + playerName() + ', dá uma olhada ou passa para alguém com mais experiência?', tone: 'warn' };
      }
      p.doneBy = a.crew.name;
      if (!resolveFor(p, a)) {
        p.doneBy = null;
        ops.render(true);
        return { say: 'Mexi em "' + title + '", mas ainda não resolveu. ' + playerName() + ', confere comigo?', tone: 'warn' };
      }
      if (!p.closed) finish(p, a.crew.name);
      return { say: botSay(p), tone: 'ok', fixed: p.def.complete === 'fixed' };
    }
    const playerName = () => (sys.crew && sys.crew.playerProfile && sys.crew.playerProfile.name) || 'Chefe';

    function act(uid, what, who) {
      const p = P.open.find((x) => x.uid === uid);
      if (!p) return;
      const x = p.x;
      if (what === 'assign') { p.picking = !p.picking; ops.render(true); return; }
      if (what === 'assign-to') { const a = sys.crew && sys.crew.members.find((m) => String(m.crew.id) === String(who)); if (a) assign(p, a); return; }
      if (what === 'unassign') { unassign(p); return; }
      if (what === 'term' && x) { if (p.extra) openConsole(p); else if (ops.openTerminal) ops.openTerminal(x); return; }
      if (what === 'build') { ops.toggle(false); game.setMode('build'); game.toast('info', 'Construir', 'Equipamentos → Servidor ou Switch, depois clique num rack'); return; }
      if (what === 'cabling' && x) { sys.cabling.open(x.kind === 'rack' ? x : x.rack, x.kind === 'rack' ? null : x); return; }
      if (what === 'show' && x) { const r = x.kind === 'rack' ? x : x.rack; game.focus(r.px + 8, r.py); if (game.flash) game.flash(r); }
    }

    function itemHtml(p) {
      const x = p.x, def = p.def, d = x && x.kind !== 'rack' ? x : null;
      const fault = def.complete === 'fixed';
      const where = !x ? 'Datacenter' : x.kind === 'rack' ? x.id : x.where;
      let h = '<li class="ops-item is-prob' + (fault ? ' is-fault' : '') + '"><div class="ops-item__head"><span class="dot' + (fault ? ' dot--warn dot--live' : ' dot--info') + '"></span><b>' + esc(titleOf(p)) + '</b>' +
        '<span class="ops-xp" title="XP para a sua carreira">+' + xpFor(p) + ' XP</span></div>' +
        '<p class="ops-item__where">' + esc(where) + ' · ' + esc(rankName(def)) + ' · ' + (DIFF[def.difficulty] || '') + '</p>' +
        '<p class="ops-item__why">' + esc(summaryOf(p)) + '</p>';
      if (def.complete === 'steps') {
        const done = stepsDone(p), cur = done.indexOf(false);
        h += '<ol class="prob-steps">' + def.steps.map((s, k) => '<li class="' + (done[k] ? 'is-done' : k === cur ? 'is-current' : '') + '"><span>' + (done[k] ? '✓' : k + 1) + '</span>' + esc(tpl(s.text, envP(p))) + '</li>').join('') + '</ol>';
      }
      const b = (attrs, label, primary) => '<button type="button" class="btn btn--sm' + (primary ? ' btn--primary' : '') + '" ' + attrs + '>' + label + '</button>';
      const pa = (act, extra) => 'data-op="prob" data-prob="' + p.uid + '" data-act="' + act + '"' + (extra || '');
      if (p.assignee) {
        const a = p.assignee, r = DL.ROLES[a.crew.profile.role];
        // (the status without the job's name: "Indo até RACK-N01", "Resolvendo o problema")
        h += '<p class="prob-who"><span class="cc__dot" style="background:' + (r ? r.color : '#fff') + '"></span>Com <b>' + esc(a.crew.name) + '</b> · ' + esc(sys.crew.statusOf ? sys.crew.statusOf(a).split(' · ')[0] : 'a caminho') +
          ' · você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP</p>';
      } else if (p.picking) {
        const list = crewFor(p);
        h += '<div class="prob-pick"><span class="eyebrow-sm">Quem resolve? · você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP (+' + (sys.career ? sys.career.xpFor(def, CREW_SHARE) : '') + ')</span>' +
          (list.length ? '<ul>' + list.map((c) => {
            const r = DL.ROLES[c.a.crew.profile.role];
            return '<li><button type="button" class="prob-pick__who" ' + pa('assign-to', ' data-who="' + c.a.crew.id + '"') + '><span class="cc__dot" style="background:' + (r ? r.color : '#fff') + '"></span><b>' + esc(c.a.crew.name) + '</b>' +
              '<span>' + esc(roleName(c.a.crew.profile.role)) + ' · ' + esc(def.skill) + ' ' + c.skill + (c.busy ? ' · ocupado(a): ' + esc(c.busy) : '') + '</span></button></li>';
          }).join('') + '</ul>'
          : '<p class="ops-item__why">Ninguém no turno pode resolver isto agora. Cargos que resolvem: ' + esc(def.roles.map(roleName).join(', ')) + '.</p>') + '</div>';
      }
      h += '<div class="ops-item__actions">';
      if (def.complete === 'lesson') h += b('data-op="prob" data-prob="' + p.uid + '" data-act="term"', 'Abrir terminal', true);
      else if (def.complete === 'fixed' && d) h += b('data-op="term" data-dev="' + d.key + '"', 'Abrir terminal', true) + b('data-op="cable" data-dev="' + d.key + '"', 'Cabeamento') + b('data-op="mon" data-dev="' + d.key + '"', 'Monitor');
      else if (def.complete === 'online' && d) h += d.state === 'new' ? b('data-op="cable" data-dev="' + d.key + '"', 'Ligar cabos', true) : b('data-op="term" data-dev="' + d.key + '"', 'Abrir terminal', true);
      else if (def.complete === 'steps') {
        const s = def.steps[Math.max(0, stepOf(p))] || def.steps[def.steps.length - 1];
        if (s.action === 'build') h += b('data-op="prob" data-prob="' + p.uid + '" data-act="build"', 'Construir (B)', true);
        if ((s.action === 'cabling' && x) || (x && x.kind === 'rack')) h += b('data-op="prob" data-prob="' + p.uid + '" data-act="cabling"', 'Cabeamento', s.action === 'cabling');
      }
      if (p.assignee) h += b(pa('unassign'), 'Cancelar atribuição');
      else if (assignable(p) && sys.crew) h += b(pa('assign'), p.picking ? 'Fechar' : 'Atribuir a…');
      if (x) h += b(pa('show'), 'Mapa');
      return h + '</div></li>';
    }

    /* ---------- saves: what's open (a fault isn't saved, so problems about one aren't either) ---------- */
    function snapshot() {
      return {
        next: Math.round(P.next),
        open: P.open.filter((p) => p.def.complete !== 'fixed' && !(p.def.setup && p.def.setup.fault)).map((p) => ({
          id: p.def.id, age: Math.round(now() - p.at), vars: p.vars || {},
          dev: p.x && p.x.kind !== 'rack' ? p.x.key : null, rack: p.x && p.x.kind === 'rack' ? p.x.uid || p.x.id : null,
        })),
      };
    }
    function restore(s) {
      reset();
      if (!s || !Array.isArray(s.open)) return;
      if (typeof s.next === 'number') P.next = Math.max(10, s.next);
      for (const o of s.open.slice(0, 8)) {
        const def = byId(o.id);
        if (!def || def.complete === 'fixed') continue;
        let x = null;
        if (o.dev) x = ops.get(o.dev);
        else if (o.rack) x = scene.world.items.find((e) => e.kind === 'rack' && (e.uid === o.rack || e.id === o.rack));
        if (!x && !def.target.lazy) continue;
        if (x && x.hold) continue;
        const vars = o.vars && typeof o.vars === 'object' && !Array.isArray(o.vars) ? o.vars : null;
        const p = start(def, x, { quiet: true, age: o.age | 0, vars });
        // the device came back from the save with its own name: set the rename up again
        if (p && def.setup && def.setup.hostname && x && x.os) x.os.hostname = def.setup.hostname;
      }
    }
    function reset() {
      for (const p of P.open) release(p);
      P.open = [];
      P.next = PACE.first;
    }

    return {
      update, reset, snapshot, restore, act, itemHtml, consoleFor, openConsole, devicesOf,
      list: () => P.open.slice(),
      // a short key of everything the Tarefas panel shows (it redraws when this changes)
      key: () => P.open.map((p) => p.uid + ':' + (p.x ? p.x.key || p.x.id : '-') + ':' + (p.def.complete === 'steps' ? stepOf(p) : '') + ':' + (p.x && p.x.state) + ':' + xpFor(p) +
        ':' + (p.assignee ? p.assignee.crew.id + (sys.crew.statusOf ? sys.crew.statusOf(p.assignee).split(' · ')[0] : '') : p.picking ? 'pick' + crewFor(p).map((c) => c.a.crew.id + (c.busy ? '*' : '')).join(',') : '')).join('|'),
      // exposed for automated checks
      api: { start: (id, x) => start(byId(id), x), finish, trySpawn, candidates: (id) => candidates(byId(id)), byId, PACE, assign, unassign, crewFor, CREW_SHARE,
        get BY_ID() { return Object.fromEntries(DATA.problems.map((p) => [p.id, p])); } },
    };
  };
})();
