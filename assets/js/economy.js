/* DataLab — economy: two currencies (Créditos earned by playing, DataCoins as the premium balance),
   the company's cash flow (revenue from healthy servers, losses while problems stay open), the
   "datacenter concluído" checklist and progress milestones that hand out rewards.
   Time: one real second is one game minute (the HUD clock), so every "/min" rate below is per
   game minute. All numbers live in DL.ECON so they are easy to tune. */
(function () {
  'use strict';
  const DL = window.DL;

  DL.ECON = {
    startCash: 100000,          // company balance at the start of a session ($)
    revenuePerServer: 18,       // $/min for each online server that answers
    payrollPerMember: 6,        // $/min for each crew member
    // hardware (hardware.js): a server rends revenuePerServer × its model's perf × how well its network
    // keeps up; storage rents its usable capacity; equipment pays for the power it draws
    storagePerTB: 0.35,         // $/min per usable TB (× the array's speed)
    wifiPerAp: 4,               // $/min for each powered access point (guest Wi-Fi)
    cameraCut: 0.06,            // each powered camera cuts incident losses by 6%…
    cameraCutMax: 0.3,          // …up to 30%
    energyPerKw: 1.5,           // $/min per kW drawn by the equipment
    loss: { offline: 120, port: 90, service: 80, disk: 40 }, // $/min while the problem is open
    lossGrowth: 30,             // after this many minutes open the loss has doubled…
    lossMax: 3,                 // …up to this multiple
    credits: {
      taskOrder: 6, taskAuto: 2,          // a crew task finished (ordered by you / routine)
      serverSetup: 50,                    // a server you configured goes online
      incident: 30, incidentFast: 40,     // incident resolved (+ bonus when quick)
      fastWindow: 20, slowWindow: 180,    // minutes: full bonus until fastWindow, none after slowWindow
      crewFix: 0.5,                       // the crew fixed it: share of the reward
      uptimePerServer: 1, uptimeEvery: 60, // every hour, per healthy server
      datacenter: 200,                    // a datacenter completed
    },
    // Progress milestones. `every` repeats (20, 40, 60…); add new counters / rewards here later.
    milestones: [
      { id: 'dc20', counter: 'datacenters', every: 20, title: 'Marco de datacenters', label: (n) => n + ' datacenters concluídos', reward: { datacoins: 100 } },
    ],
    // DataCoin packs (simulation only — no payment is taken)
    store: [
      { sku: 'dc_100', coins: 100, price: 'R$ 4,90' },
      { sku: 'dc_550', coins: 550, price: 'R$ 19,90', tag: '+10%' },
      { sku: 'dc_1200', coins: 1200, price: 'R$ 39,90', tag: '+20%' },
    ],
  };

  /* ------------------------------------------------------------------ */
  /* Payments: a mock provider with the shape a real one will need.      */
  /* A real gateway must confirm the purchase server-side and only then  */
  /* credit the wallet; replace `provider` + `purchase` when that exists. */
  /* ------------------------------------------------------------------ */
  DL.Payments = {
    provider: 'mock',
    live: false,
    purchase(pack) {
      return new Promise((resolve) => setTimeout(() => resolve({ ok: true, simulated: true, sku: pack.sku, coins: pack.coins, receipt: 'sim_' + Date.now().toString(36) }), 650));
    },
  };

  const WALLET_KEY = 'datalab.wallet.v1';
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const money = (n) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  DL.money = money;

  DL.createEconomy = function (game, sys) {
    const E = DL.ECON, scene = game.scene, ops = sys.ops;
    const world = () => scene.world;
    const $ = (id) => document.getElementById(id);
    const el = {
      btn: $('econBtn'), cash: $('econCash'), flow: $('econFlow'), credits: $('econCredits'), coins: $('econCoins'),
      wallet: $('wallet'), walletBody: $('walletBody'), reward: $('reward'), rewardBody: $('rewardBody'), tags: $('lossTags'), float: $('econFloat'),
    };

    /* ---------- wallet (persists in this browser) ---------- */
    const W = { credits: 0, datacoins: 0, counters: { datacenters: 0, incidents: 0 }, ledger: [] };
    try { Object.assign(W, JSON.parse(localStorage.getItem(WALLET_KEY) || '{}')); } catch (e) { /* fresh wallet */ }
    W.counters = Object.assign({ datacenters: 0, incidents: 0 }, W.counters);
    const save = () => { try { localStorage.setItem(WALLET_KEY, JSON.stringify(W)); } catch (e) { /* private mode */ } };

    /* ---------- company ---------- */
    const CO = { cash: E.startCash, revenue: 0, losses: 0, payroll: 0, lost: 0, earned: 0, problems: [], hourAcc: 0, acc: 0, dcChecked: 0,
      servers: 0, storage: 0, wifi: 0, energy: 0, kw: 0, camCut: 0, spent: 0, sold: 0, rateAt: -1, poe: null, slow: [] };
    const queue = []; // reward screens waiting to be shown

    function earn(cur, amount, why, opts) {
      amount = Math.round(amount);
      if (!amount) return;
      W[cur] += amount;
      W.ledger.unshift({ cur, amount, why, t: game.clock() });
      if (W.ledger.length > 30) W.ledger.pop();
      save();
      render();
      if (!(opts && opts.quiet)) floater((amount > 0 ? '+' : '') + fmt(amount) + (cur === 'credits' ? ' créditos' : ' DataCoins'), cur);
    }

    function grant(reward, why) {
      if (reward.credits) earn('credits', reward.credits, why);
      if (reward.datacoins) earn('datacoins', reward.datacoins, why);
    }

    // count progress; milestones with `every` fire on each multiple
    function count(counter, by) {
      W.counters[counter] = (W.counters[counter] || 0) + (by || 1);
      const n = W.counters[counter];
      for (const m of E.milestones) {
        if (m.counter !== counter || !m.every || n % m.every) continue;
        grant(m.reward, m.label(n));
        queue.push({ m, n });
      }
      save();
      if (queue.length && !el.reward.classList.contains('is-open')) showReward();
    }

    /* ---------- problems cost money ---------- */
    const KIND = { link: 'offline', cable: 'offline', port: 'port', service: 'service', disk: 'disk' };
    const LABEL = { offline: 'Servidor offline', port: 'Porta do switch em erro', service: 'Serviço web parado', disk: 'Disco cheio' };

    function problems() {
      const out = [];
      for (const d of ops.devices()) {
        if (d.kind === 'patch') continue;
        let kind = d.fault ? KIND[d.fault.type] : null;
        if (!kind && d.kind === 'server' && d.state === 'online' && !ops.health(d).up) kind = 'offline';
        if (!kind) { d.loss = null; continue; }
        if (!d.loss || d.loss.kind !== kind) d.loss = { kind, since: scene.t, total: 0 };
        const open = scene.t - d.loss.since; // seconds = game minutes
        d.loss.rate = E.loss[kind] * Math.min(E.lossMax, 1 + open / E.lossGrowth);
        d.loss.label = LABEL[kind];
        out.push(d);
      }
      return out;
    }
    const lossOf = (d) => d.loss || null;

    function healthyServers() {
      return ops.devices().filter((d) => d.kind === 'server' && d.state === 'online' && !d.fault && ops.health(d).up).length;
    }

    // What the hardware earns and costs per minute; recomputed a few times a second, not every frame.
    function rates() {
      if (CO.rateAt >= 0 && scene.t - CO.rateAt < 0.5) return;
      CO.rateAt = scene.t;
      let srv = 0;
      const slow = [];
      for (const d of ops.devices()) {
        if (d.kind !== 'server' || d.state !== 'online' || d.fault || !ops.health(d).up) continue;
        const m = DL.hwOf(d), net = ops.netOf(d);
        srv += E.revenuePerServer * m.perf * net.factor;
        if (net.why && net.factor < 0.9) slow.push({ d, why: net.why, pct: Math.round(net.factor * 100) });
      }
      let sto = 0, kw = 0;
      for (const e of world().items) {
        if (e.kind === 'storage') {
          const m = DL.hwModel('storage', e.model);
          sto += m.usable * E.storagePerTB * (0.7 + 0.3 * m.iops);
        }
        if (e.tel && e.tel.power) kw += e.tel.unit === 'W' ? e.tel.power / 1000 : e.tel.power;
      }
      const poe = ops.poeStatus();
      CO.poe = poe;
      CO.servers = srv;
      CO.storage = sto;
      CO.wifi = poe.ap * E.wifiPerAp;
      CO.kw = kw;
      CO.energy = kw * E.energyPerKw;
      CO.camCut = Math.min(E.cameraCutMax, poe.camera * E.cameraCut);
      CO.slow = slow;
    }

    function tick(dt) {
      rates();
      CO.problems = problems();
      CO.losses = CO.problems.reduce((s, d) => s + d.loss.rate, 0) * (1 - CO.camCut);
      CO.revenue = CO.servers + CO.storage + CO.wifi;
      CO.payroll = (sys.crew ? sys.crew.members.length : 0) * E.payrollPerMember;
      const mins = dt; // 1 s = 1 game minute
      for (const d of CO.problems) d.loss.total += d.loss.rate * (1 - CO.camCut) * mins;
      CO.cash += (CO.revenue - CO.payroll - CO.energy - CO.losses) * mins;
      CO.lost += CO.losses * mins;
      CO.earned += CO.revenue * mins;
      // keeping servers running pays credits every game hour
      CO.hourAcc += mins;
      if (CO.hourAcc >= E.credits.uptimeEvery) {
        CO.hourAcc = 0;
        const n = healthyServers();
        if (n) earn('credits', n * E.credits.uptimePerServer, n + ' servidor(es) no ar por 1 h');
      }
    }

    /* ---------- equipment bought and sold in build mode ---------- */
    game.on('purchase', (info) => {
      CO.cash -= info.price;
      CO.spent += info.price;
      CO.rateAt = -1;
      floater('-' + money(info.price) + ' · ' + info.name, 'spend');
      render();
    });
    game.on('refund', (info) => {
      CO.cash += info.amount;
      CO.sold += info.amount;
      CO.rateAt = -1;
      floater('+' + money(info.amount) + ' · revenda', 'cash');
      render();
    });
    game.on('world', () => { CO.rateAt = -1; });

    /* ---------- events that pay ---------- */
    game.on('job-done', (info) => earn('credits', info.auto ? E.credits.taskAuto : E.credits.taskOrder, 'Tarefa: ' + info.name, { quiet: info.auto }));
    game.on('server-online', (info) => earn('credits', E.credits.serverSetup, info.d.name + ' configurado'));
    game.on('fixed', (info) => {
      const open = Math.max(0, scene.t - (info.at || scene.t));
      const C = E.credits;
      const speed = open <= C.fastWindow ? 1 : open >= C.slowWindow ? 0 : 1 - (open - C.fastWindow) / (C.slowWindow - C.fastWindow);
      let amount = C.incident + C.incidentFast * speed;
      if (info.by) amount *= C.crewFix;
      earn('credits', amount, 'Incidente resolvido · ' + info.d.name + ' em ' + Math.round(open) + ' min');
      count('incidents');
      if (info.lost) game.toast('ok', 'Prejuízo estancado', info.d.name + ' custou ' + money(info.lost) + ' enquanto esteve com problema');
    });

    /* ---------- "datacenter concluído" ---------- */
    function checklist() {
      const w = world(), devs = ops.devices();
      const online = devs.filter((d) => d.kind === 'server' && d.state === 'online');
      const mine = online.filter((d) => !d.pre);
      const open = devs.filter((d) => d.fault || (d.kind === 'server' && d.state === 'online' && !ops.health(d).up)).length;
      return [
        { label: '2 servidores online', ok: online.length >= 2 },
        { label: 'Switch instalado', ok: devs.some((d) => d.kind === 'switch') },
        { label: 'Estação de trabalho', ok: w.items.some((e) => e.kind === 'desk' || (e.kind === 'monitor' && e.host)) },
        { label: '2 pessoas na equipe', ok: !!sys.crew && sys.crew.members.length >= 2 },
        { label: '1 servidor configurado por você', ok: mine.length >= 1 },
        { label: 'Nenhum incidente aberto', ok: open === 0 },
      ];
    }

    function checkDatacenter() {
      const w = world();
      if (w.dcDone || game.paused()) return;
      if (!checklist().every((c) => c.ok)) return;
      w.dcDone = true;
      earn('credits', E.credits.datacenter, 'Datacenter concluído');
      game.toast('ok', 'Datacenter concluído', 'Tudo no ar e sem incidentes · +' + E.credits.datacenter + ' créditos');
      game.emit('datacenter-done', { n: W.counters.datacenters + 1 });
      count('datacenters');
    }

    /* ---------- UI ---------- */
    function render() {
      el.credits.textContent = fmt(W.credits);
      el.coins.textContent = fmt(W.datacoins);
      el.cash.textContent = money(CO.cash);
      const flow = CO.revenue - CO.payroll - CO.energy - CO.losses;
      el.flow.textContent = CO.losses > 0 ? 'Prejuízo -$' + fmt(CO.losses) + '/min' : (flow >= 0 ? '+' : '') + money(flow) + '/min';
      el.flow.className = 'econ__flow ' + (CO.losses > 0 ? 'is-loss' : flow >= 0 ? 'is-up' : 'is-down');
      el.btn.classList.toggle('is-loss', CO.losses > 0);
      el.cash.classList.toggle('is-neg', CO.cash < 0);
    }

    function floater(text, cur) {
      if (!el.float) return;
      const s = document.createElement('span');
      s.className = 'econ-float is-' + cur;
      s.textContent = text;
      el.float.appendChild(s);
      setTimeout(() => s.remove(), 1600);
      while (el.float.children.length > 4) el.float.firstChild.remove();
    }

    // in-world tags over the racks that are costing money
    const tagEls = new Map();
    function updateTags() {
      const show = game.mode() !== 'build';
      const seen = new Set();
      for (const d of CO.problems) {
        if (!d.rack || !d.rack.bounds) continue;
        seen.add(d.key);
        let s = tagEls.get(d.key);
        if (!s) {
          s = document.createElement('span');
          s.className = 'loss-tag';
          el.tags.appendChild(s);
          tagEls.set(d.key, s);
        }
        const txt = '<b>' + esc(d.name) + ' · ' + d.loss.label + '</b><em>Prejuízo: -$' + fmt(d.loss.rate) + '/min</em>';
        if (s.dataset.k !== txt) { s.dataset.k = txt; s.innerHTML = txt; }
        // stack tags of the same rack
        const i = CO.problems.filter((x) => x.rack === d.rack).indexOf(d);
        const b = d.rack.bounds, p = scene.worldToScreen(b.x + b.w / 2, b.y - 2);
        s.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - i * 34).toFixed(1) + 'px) translate(-50%,-100%)';
        s.classList.toggle('is-on', show);
      }
      for (const [k, s] of tagEls) if (!seen.has(k)) { s.remove(); tagEls.delete(k); }
      // live loss line in the tasks panel
      document.querySelectorAll('[data-loss]').forEach((n) => {
        const d = ops.get(n.dataset.loss);
        const L = d && d.loss;
        n.textContent = L ? 'Prejuízo: -$' + fmt(L.rate) + '/min · ' + money(L.total) + ' perdidos' : '';
      });
    }

    function walletHtml() {
      const cl = checklist();
      const m = E.milestones[0], n = W.counters[m.counter] || 0, next = (Math.floor(n / m.every) + 1) * m.every;
      const flow = CO.revenue - CO.payroll - CO.energy - CO.losses;
      let h = '<div class="w-grid">';
      h += '<section class="w-card"><span class="eyebrow-sm">Empresa</span><p class="w-big' + (CO.cash < 0 ? ' is-neg' : '') + '">' + money(CO.cash) + '</p>' +
        '<ul class="w-rows"><li><span>Receita dos servidores</span><b class="is-up">+' + money(CO.servers) + '/min</b></li>' +
        (CO.storage ? '<li><span>Storage alugado</span><b class="is-up">+' + money(CO.storage) + '/min</b></li>' : '') +
        (CO.wifi ? '<li><span>Wi-Fi de visitantes (' + CO.poe.ap + ' AP)</span><b class="is-up">+' + money(CO.wifi) + '/min</b></li>' : '') +
        '<li><span>Folha da equipe</span><b>-' + money(CO.payroll) + '/min</b></li>' +
        '<li><span>Energia · ' + (Math.round(CO.kw * 10) / 10).toLocaleString('pt-BR') + ' kW</span><b>-' + money(CO.energy) + '/min</b></li>' +
        '<li><span>Prejuízo com problemas' + (CO.camCut ? ' (câmeras −' + Math.round(CO.camCut * 100) + '%)' : '') + '</span><b class="' + (CO.losses ? 'is-loss' : '') + '">-' + money(CO.losses) + '/min</b></li>' +
        '<li class="w-total"><span>Resultado</span><b class="' + (flow >= 0 ? 'is-up' : 'is-loss') + '">' + (flow >= 0 ? '+' : '') + money(flow) + '/min</b></li></ul>';
      if (CO.problems.length) {
        h += '<span class="eyebrow-sm w-sub">Custando dinheiro agora</span><ul class="w-rows">' + CO.problems.map((d) =>
          '<li><span>' + esc(d.name) + ' · ' + d.loss.label + '</span><b class="is-loss">-$' + fmt(d.loss.rate) + '/min</b></li>').join('') + '</ul>' +
          '<p class="w-note">Quanto mais tempo aberto, maior o prejuízo (até ' + E.lossMax + '×). Resolver rápido também rende mais créditos.</p>';
      } else h += '<p class="w-note">Nenhum problema custando dinheiro. Um servidor intermediário no ar rende ' + money(E.revenuePerServer) + '/min; básico, avançado e high-end rendem conforme o desempenho do modelo.</p>';
      if (CO.slow.length) {
        h += '<span class="eyebrow-sm w-sub">Gargalos de rede</span><ul class="w-rows">' + CO.slow.slice(0, 4).map((x) =>
          '<li><span>' + esc(x.d.name) + ' · ' + esc(x.why) + '</span><b class="is-loss">' + x.pct + '%</b></li>').join('') + '</ul>';
      }
      if (CO.poe && CO.poe.off) h += '<p class="w-note">' + CO.poe.off + ' access point(s)/câmera(s) sem energia: instale um switch PoE na mesma sala.</p>';
      if (CO.spent || CO.sold) h += '<p class="w-note">Investido em equipamentos: ' + money(CO.spent) + (CO.sold ? ' · revendido: ' + money(CO.sold) : '') + '</p>';
      h += '</section>';
      h += '<section class="w-card"><span class="eyebrow-sm">Saldos</span>' +
        '<div class="w-bal"><div><span class="cur cur--cr">◆</span><b>' + fmt(W.credits) + '</b><small>Créditos · ganhos jogando</small></div>' +
        '<div><span class="cur cur--dc">⬢</span><b>' + fmt(W.datacoins) + '</b><small>DataCoins · moeda premium</small></div></div>' +
        '<span class="eyebrow-sm w-sub">Progresso</span><p class="w-prog"><b>' + n + '</b> datacenter(s) concluído(s) · próxima recompensa em <b>' + next + '</b></p>' +
        '<div class="w-bar"><i style="transform:scaleX(' + ((n % m.every) / m.every).toFixed(3) + ')"></i></div>' +
        '<span class="eyebrow-sm w-sub">Este datacenter' + (world().dcDone ? ' · concluído ✓' : '') + '</span><ul class="w-check">' +
        cl.map((c) => '<li class="' + (c.ok ? 'is-ok' : '') + '"><i></i>' + c.label + '</li>').join('') + '</ul></section>';
      h += '<section class="w-card w-card--wide"><span class="eyebrow-sm">Loja de DataCoins · simulação</span><div class="w-store">' + E.store.map((p) =>
        '<button type="button" class="w-pack" data-sku="' + p.sku + '"><span class="cur cur--dc">⬢</span><b>' + fmt(p.coins) + '</b>' + (p.tag ? '<em>' + p.tag + '</em>' : '') + '<small>' + p.price + '</small></button>').join('') +
        '</div><p class="w-note">Modo de teste: nenhuma cobrança é feita e nenhum dado de pagamento é pedido. A compra real virá depois.</p>' +
        '<span class="eyebrow-sm w-sub">Extrato</span><ul class="w-ledger">' + (W.ledger.slice(0, 6).map((l) =>
          '<li><span class="mono">' + l.t + '</span><span>' + esc(l.why) + '</span><b class="' + (l.cur === 'datacoins' ? 'is-dc' : '') + '">' + (l.amount > 0 ? '+' : '') + fmt(l.amount) + (l.cur === 'datacoins' ? ' ⬢' : ' ◆') + '</b></li>').join('') || '<li class="m">Nada ainda. Conclua tarefas e resolva incidentes.</li>') + '</ul></section>';
      return h + '</div>';
    }

    function openWallet() {
      el.walletBody.innerHTML = walletHtml();
      el.wallet.classList.add('is-open');
      game.keysReset && game.keysReset();
    }
    function closeWallet() { el.wallet.classList.remove('is-open'); }

    function showReward() {
      const q = queue.shift();
      if (!q) return;
      const { m, n } = q;
      const parts = [];
      if (m.reward.datacoins) parts.push('<p class="rw-amount"><span class="cur cur--dc">⬢</span>+' + fmt(m.reward.datacoins) + '<small>DataCoins</small></p>');
      if (m.reward.credits) parts.push('<p class="rw-amount"><span class="cur cur--cr">◆</span>+' + fmt(m.reward.credits) + '<small>Créditos</small></p>');
      el.rewardBody.innerHTML = '<p class="eyebrow-sm"><span class="dot dot--live"></span>&nbsp; Recompensa · ' + esc(m.title) + '</p>' +
        '<h2 class="card__title card__title--sm">' + esc(m.label(n)) + '</h2>' + parts.join('') +
        '<div class="rw-prog"><span class="eyebrow-sm">Progresso</span><b>' + n + '</b><div class="w-bar"><i style="transform:scaleX(1)"></i></div><small>Próximo marco: ' + (n + m.every) + '</small></div>';
      el.reward.classList.add('is-open');
      game.sfx('done');
    }
    function closeReward() {
      el.reward.classList.remove('is-open');
      if (queue.length) setTimeout(showReward, 250);
    }

    el.btn.addEventListener('click', () => { el.btn.blur(); openWallet(); });
    $('walletClose').addEventListener('click', closeWallet);
    $('rewardClose').addEventListener('click', closeReward);
    el.wallet.addEventListener('pointerdown', (ev) => { if (ev.target === el.wallet) closeWallet(); });
    el.walletBody.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sku]');
      if (!b || b.disabled) return;
      const pack = E.store.find((p) => p.sku === b.dataset.sku);
      b.disabled = true;
      b.classList.add('is-busy');
      DL.Payments.purchase(pack).then((r) => {
        if (r && r.ok) {
          earn('datacoins', r.coins, 'Compra simulada · ' + fmt(r.coins) + ' DataCoins');
          game.toast('ok', 'Compra simulada', '+' + fmt(r.coins) + ' DataCoins · nenhuma cobrança feita');
        }
        if (el.wallet.classList.contains('is-open')) el.walletBody.innerHTML = walletHtml();
      });
    });

    function update(dt) {
      tick(dt);
      CO.acc += dt;
      if (CO.acc > 0.25) {
        CO.acc = 0;
        render();
        if (el.wallet.classList.contains('is-open') && !el.walletBody.querySelector('.is-busy')) {
          const sc = el.walletBody.scrollTop;
          el.walletBody.innerHTML = walletHtml();
          el.walletBody.scrollTop = sc;
        }
      }
      CO.dcChecked += dt;
      if (CO.dcChecked > 1) { CO.dcChecked = 0; checkDatacenter(); }
    }

    function key(ev) {
      if (ev.code === 'Escape' || ev.code === 'Enter') {
        if (el.reward.classList.contains('is-open')) { closeReward(); return true; }
        if (ev.code === 'Escape') { closeWallet(); return true; }
      }
      return true;
    }

    render();
    return {
      update, updateUi: updateTags, key, earn, grant, count, checklist, lossOf, openWallet, closeWallet,
      get isOpen() { return el.wallet.classList.contains('is-open') || el.reward.classList.contains('is-open'); },
      get wallet() { return W; },
      get company() { return CO; },
      money,
    };
  };
})();
