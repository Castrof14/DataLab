/* DataLab — monitoring, inspired by Zabbix (hosts, triggers, problems) and Grafana (dashboards).
   Metrics are simulated from the real device state every second of game time: a host that drops off the
   network stops reporting, so its graphs break; triggers open problems, the crew announces them, and they
   turn RESOLVED by themselves once the cause is fixed. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const N = 120; // two minutes of one-second samples
  const SEV = {
    info: { label: 'Informação', color: '#7499ff', rank: 0 },
    warning: { label: 'Atenção', color: '#ffc859', rank: 1 },
    average: { label: 'Média', color: '#ffa059', rank: 2 },
    high: { label: 'Alta', color: '#e45959', rank: 3 },
  };
  const PAL = ['#73bf69', '#5794f2', '#fade2a', '#ff9830', '#b877d9', '#8ab8ff', '#f2495c', '#37872d'];
  const HELP = {
    cpu: 'Uso do processador. Picos curtos são normais; ficar perto de 100% por muito tempo deixa tudo lento.',
    ram: 'Memória em uso. Perto de 100% o sistema começa a usar disco (swap) e fica lento.',
    disk: 'Espaço ocupado no disco /. Acima de 90% serviços começam a falhar ao gravar logs e arquivos.',
    net: 'Tráfego de rede em Mbps (entrada e saída). Cair a zero de repente costuma ser cabo, porta ou interface.',
    temp: 'Temperatura na frente do rack. Acima de 31 °C: falta refrigeração (CRAC) ou o fluxo de ar está bloqueado por cabos.',
    avail: 'Linha do tempo de disponibilidade: verde respondeu ao ping, vermelho não respondeu. Buracos nos outros gráficos coincidem com o vermelho.',
    stat: 'Indicadores rápidos: quantos hosts respondem, a disponibilidade dos últimos 2 minutos e os problemas abertos.',
  };

  DL.createMonitor = function (game, sys) {
    const $ = (id) => document.getElementById(id);
    const el = { root: $('monitor'), body: $('monBody'), tabs: $('monTabs'), close: $('monClose'), btn: $('monBtn'), badge: $('monBadge'), range: $('monRange') };
    const M = { series: new Map(), racks: new Map(), problems: [], seq: 0, acc: 0, poll: 0, tab: 'dash', host: null, open: false, opened: 0, tipsOff: false, hint: {}, key: '' };
    const ops = () => sys.ops;
    const now = () => game.scene.t;

    /* ------------------------------------------------------------------ */
    /* Metrics                                                             */
    /* ------------------------------------------------------------------ */
    const monitored = () => ops().devices().filter((d) => d.kind !== 'patch' && d.state === 'online');

    function seriesOf(key) {
      let s = M.series.get(key);
      if (!s) {
        s = { cpu: [], ram: [], disk: [], netIn: [], netOut: [], temp: [], up: [] };
        for (const k in s) s[k] = new Array(N).fill(undefined);
        M.series.set(key, s);
      }
      return s;
    }
    const push = (arr, v) => { arr.push(v); if (arr.length > N) arr.shift(); };

    function rackTemp(r) {
      const O = ops(), room = O.roomOf(r);
      const n = r.units ? r.units.filter(Boolean).length : 0;
      const crac = game.scene.world.items.some((e) => e.kind === 'crac' && O.roomOf(e) === room);
      return 23.5 + n * 0.75 + (crac ? 0 : 4.2) + (r.tidy === false && r.cableLook ? 1.8 : 0);
    }

    function sample() {
      const t = now(), O = ops();
      const devs = monitored();
      const keep = new Set(devs.map((d) => d.key));
      for (const k of Array.from(M.series.keys())) if (!keep.has(k)) M.series.delete(k);
      let swTraffic = new Map();
      for (const d of devs) {
        const s = seriesOf(d.key);
        if (!d.mb) {
          // bigger servers run the same work with more headroom and move more traffic (hardware.js)
          const m = DL.hwOf ? DL.hwOf(d) : null, perf = m && m.perf ? m.perf : 1, nic = m && m.nic ? m.nic : 1;
          d.mb = { cpu: (12 + rand() * 30) * Math.min(1.7, 1 / Math.sqrt(perf)), ram: Math.min(88, (32 + rand() * 30) * Math.min(1.5, Math.sqrt(64 / (m && m.ram ? m.ram : 64)))), net: (40 + rand() * 260) * Math.min(6, Math.sqrt(nic) * perf), ph: rand() * 10 };
        }
        const b = d.mb, h = O.health(d), j = () => (rand() - 0.5);
        if (d.kind === 'server' && !b.spike && rand() < 0.0012) b.spike = t + 8 + rand() * 6;
        if (b.spike && t > b.spike) b.spike = 0;
        if (!h.up) {
          for (const k of ['cpu', 'ram', 'disk', 'netIn', 'netOut', 'temp']) push(s[k], null);
          push(s.up, 0);
          continue;
        }
        const rt = rackTemp(d.rack);
        if (d.kind === 'switch') {
          push(s.cpu, clamp(9 + 4 * Math.sin(t / 7 + b.ph) + j() * 3, 1, 100));
          push(s.ram, clamp(31 + j() * 2, 1, 100));
          push(s.disk, 18);
          push(s.temp, rt + 9 + j() * 0.4);
          push(s.up, 1);
          push(s.netIn, 0);
          push(s.netOut, 0);
          continue;
        }
        const web = h.http ? 1 : 0.08;
        const cpu = b.spike ? 93 + j() * 8 : web < 1 ? 3 + rand() * 2 : b.cpu + 12 * Math.sin(t / 9 + b.ph) + j() * 7;
        const net = Math.max(0, b.net * web * (0.75 + 0.25 * Math.sin(t / 11 + b.ph)) + j() * 18);
        push(s.cpu, clamp(cpu, 0.5, 100));
        push(s.ram, clamp(b.ram + 6 * Math.sin(t / 23 + b.ph) + j() * 2, 5, 99));
        push(s.disk, d.os.disk);
        push(s.netIn, net);
        push(s.netOut, net * 0.62);
        push(s.temp, rt + j() * 0.35);
        push(s.up, 1);
        const p = d.path;
        if (p && p.ok) swTraffic.set(p.sw.key, (swTraffic.get(p.sw.key) || 0) + net);
      }
      for (const [k, v] of swTraffic) {
        const s = M.series.get(k);
        if (s) { s.netIn[N - 1] = v * 0.62; s.netOut[N - 1] = v; }
      }
    }

    const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== undefined) return arr[i]; return undefined; };

    /* ------------------------------------------------------------------ */
    /* Triggers → problems                                                 */
    /* ------------------------------------------------------------------ */
    function evaluate() {
      const O = ops(), t = now(), active = new Map();
      const open = (key, d, sev, text, rack) => active.set(key, { key, d, sev, text, rack });
      for (const d of monitored()) {
        const h = O.health(d), s = seriesOf(d.key);
        if (d.kind === 'server') {
          if (!h.up) open(d.key + ':ping', d, 'high', d.name + ': host indisponível (ping sem resposta)');
          else if (!h.http) open(d.key + ':http', d, 'high', d.name + ': serviço HTTP (nginx) fora do ar');
          if (h.up && d.os.disk >= 90) open(d.key + ':disk', d, 'average', d.name + ': pouco espaço em disco (/ acima de 90%)');
          if (s && s.cpu.slice(-4).every((v) => v != null && v > 88)) open(d.key + ':cpu', d, 'warning', d.name + ': CPU acima de 88% por mais de 4 s');
          // Windows Server roles (winserver.js): DNS / DHCP / AD services and locked-out accounts
          if (h.up && DL.winTriggers) for (const [k, sev, text] of DL.winTriggers(d)) open(d.key + ':' + k, d, sev, text);
        } else if (d.kind === 'switch' && !h.up) {
          open(d.key + ':hw', d, 'high', d.name + ': switch fora do ar (defeito de hardware)');
        } else if (d.kind === 'switch' && h.errPorts) {
          const p = Object.keys(d.sw.ports).find((k) => d.sw.ports[k] === 'err-disabled');
          open(d.key + ':port', d, 'average', d.name + ': porta ' + p.replace('gi', 'Gi') + ' em err-disabled');
        }
      }
      for (const r of game.scene.world.items) {
        if (r.kind !== 'rack' || !r.units || !r.units.some(Boolean)) continue;
        const d = O.devices().find((x) => x.rack === r && x.kind !== 'patch' && x.state === 'online');
        if (!d) continue;
        const tp = rackTemp(r);
        if (tp > 31) open(r.id + ':temp', d, 'warning', r.id + ': temperatura alta (' + tp.toFixed(1) + ' °C) · falta refrigeração?', r);
        if (r.tidy === false && r.cableLook) open(r.id + ':cables', d, 'info', r.id + ': cabeamento desorganizado (fluxo de ar e manutenção)', r);
      }
      // open new problems, resolve the ones whose trigger went back to OK
      for (const [key, a] of active) {
        if (M.problems.some((p) => p.key === key && !p.end)) continue;
        const p = { id: ++M.seq, key, dev: a.d, rack: a.rack, sev: a.sev, text: a.text, start: t, startClock: game.clock(), end: 0 };
        M.problems.unshift(p);
        // hosts that fell because their switch broke are covered by the switch's own alert
        const viaSwitch = a.d.kind === 'server' && O.health(a.d).why === 'switch';
        if ((SEV[a.sev].rank >= 2 || key.endsWith(':port')) && !viaSwitch) O.announce(a.d, a.text);
      }
      for (const p of M.problems) if (!p.end && !active.has(p.key)) { p.end = t; p.endClock = game.clock(); }
      M.problems = M.problems.filter((p) => !p.end || t - p.end < 90).slice(0, 60);
      renderBadge();
    }

    const activeProblems = () => M.problems.filter((p) => !p.end);
    function renderBadge() {
      const a = activeProblems().filter((p) => p.sev !== 'info');
      el.badge.hidden = !a.length;
      el.badge.textContent = a.length;
      const worst = a.reduce((w, p) => Math.max(w, SEV[p.sev].rank), -1);
      el.btn.classList.toggle('is-alert', worst >= 2);
    }

    /* ------------------------------------------------------------------ */
    /* Charts (canvas)                                                     */
    /* ------------------------------------------------------------------ */
    function fit(cv) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return null;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      return { g, w, h };
    }

    function timeseries(cv, lines, o) {
      const c = fit(cv);
      if (!c) return;
      const { g, w, h } = c, L = 34, R = 8, T = 8, B = 18;
      let lo = o.min != null ? o.min : Infinity, hi = o.max != null ? o.max : -Infinity;
      if (o.min == null || o.max == null) for (const l of lines) for (const v of l.data) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (hi - lo < 1) { hi = lo + 1; }
      const pw = w - L - R, ph = h - T - B;
      const X = (i) => L + (i / (N - 1)) * pw, Y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
      g.font = '10px "Geist Mono", ui-monospace, monospace';
      g.fillStyle = '#8e8e8e';
      g.strokeStyle = 'rgba(204,204,220,0.07)';
      g.lineWidth = 1;
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4, y = Math.round(Y(v)) + 0.5;
        g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
        g.fillText((v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)) + (k === 4 && o.unit ? ' ' + o.unit : ''), 2, y + 3);
      }
      for (const [i, lab] of [[0, '-2m'], [60, '-1m'], [N - 1, 'agora']]) { g.fillText(lab, Math.min(X(i) - (i ? 14 : 0), w - 32), h - 4); }
      if (o.threshold != null && o.threshold < hi) {
        g.strokeStyle = 'rgba(242,73,92,0.6)';
        g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(L, Y(o.threshold)); g.lineTo(w - R, Y(o.threshold)); g.stroke();
        g.setLineDash([]);
      }
      for (const l of lines) {
        g.strokeStyle = l.color;
        g.lineWidth = 1.5;
        g.lineJoin = 'round';
        let seg = [];
        const flush = () => {
          if (seg.length > 1) {
            if (o.area) {
              g.beginPath(); g.moveTo(seg[0][0], T + ph);
              for (const [x, y] of seg) g.lineTo(x, y);
              g.lineTo(seg[seg.length - 1][0], T + ph); g.closePath();
              g.fillStyle = l.color + '22'; g.fill();
            }
            g.beginPath();
            seg.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
          } else if (seg.length === 1) { g.fillStyle = l.color; g.fillRect(seg[0][0] - 1, seg[0][1] - 1, 2, 2); }
          seg = [];
        };
        l.data.forEach((v, i) => {
          if (v == null) {
            // a gap: the agent did not answer — mark it so the break is unmistakable
            if (v === null && l.gapMark) { g.fillStyle = 'rgba(242,73,92,0.08)'; g.fillRect(X(i) - pw / N / 2, T, pw / N + 0.5, ph); }
            flush();
          } else seg.push([X(i), Y(v)]);
        });
        flush();
      }
    }

    function timeline(cv, rows) {
      const c = fit(cv);
      if (!c) return;
      const { g, w, h } = c, L = 64, rh = Math.min(18, (h - 16) / Math.max(1, rows.length));
      g.font = '10px "Geist Mono", ui-monospace, monospace';
      rows.forEach((r, k) => {
        const y = 4 + k * rh;
        g.fillStyle = '#ccccdc';
        g.fillText(r.name, 2, y + rh / 2 + 3);
        const pw = w - L - 6;
        r.data.forEach((v, i) => {
          g.fillStyle = v === 1 ? '#73bf69' : v === 0 ? '#f2495c' : '#22252b';
          g.fillRect(L + (i / N) * pw, y + 2, pw / N + 0.6, rh - 4);
        });
      });
      g.fillStyle = '#8e8e8e';
      g.fillText('-2m', L, h - 2);
      g.fillText('agora', w - 34, h - 2);
    }

    /* ------------------------------------------------------------------ */
    /* Views                                                               */
    /* ------------------------------------------------------------------ */
    const panel = (title, help, body, cls) => '<section class="gp ' + (cls || '') + '"><header class="gp__h"><span>' + title + '</span>' + (help ? '<i class="gp__i" tabindex="0" title="' + esc(help) + '">i</i>' : '') + '</header>' + body + '</section>';
    const chart = (id) => '<canvas class="gp__c" data-chart="' + id + '"></canvas>';
    const color = (v, warn, crit) => (v == null ? '#8e8e8e' : v >= crit ? '#f2495c' : v >= warn ? '#ff9830' : '#73bf69');

    function avail(keys) {
      let up = 0, n = 0;
      for (const k of keys) { const s = M.series.get(k); if (!s) continue; for (const v of s.up) if (v !== undefined) { n++; up += v; } }
      return n ? (up / n) * 100 : null;
    }

    function stat(label, value, col, sub) {
      return '<div class="gstat" style="--c:' + col + '"><span class="gstat__l">' + label + '</span><b class="gstat__v">' + value + '</b>' + (sub ? '<span class="gstat__s">' + sub + '</span>' : '') + '</div>';
    }

    function bars(list) {
      if (!list.length) return '<p class="gp__empty">Sem dados</p>';
      return '<ul class="gbars">' + list.map((r) => '<li><span>' + esc(r.name) + '</span><i><b style="width:' + (r.v == null ? 0 : clamp(r.v, 0, 100)) + '%;background:' + color(r.v, r.warn || 75, r.crit || 90) + '"></b></i><em>' + (r.v == null ? '—' : Math.round(r.v) + '%') + '</em></li>').join('') + '</ul>';
    }

    function tips() {
      if (M.tipsOff) return '';
      return '<div class="mon__tip"><b>Como ler o monitoramento.</b> Cada gráfico mostra os últimos 2 minutos. Uma linha que <em>quebra</em> significa que o host parou de responder. Problemas aparecem em <b>Problemas</b> e somem sozinhos quando a causa é resolvida. Passe o mouse no <i class="gp__i">i</i> de cada painel. <button type="button" class="linkbtn" data-mon="tipsoff">Entendi</button></div>';
    }

    function dashHtml() {
      const devs = monitored(), O = ops();
      if (!devs.length) return tips() + '<div class="mon__empty"><p>Nenhum host monitorado ainda.</p><p class="eyebrow-sm">Instale um servidor, ligue o cabo e configure no terminal — ele aparece aqui automaticamente.</p></div>';
      const up = devs.filter((d) => O.health(d).up).length;
      const act = activeProblems().filter((p) => p.sev !== 'info');
      const worst = act.reduce((w, p) => (SEV[p.sev].rank > SEV[w].rank ? p.sev : w), 'info');
      const temps = devs.filter((d) => d.kind === 'server').map((d) => last(M.series.get(d.key) ? M.series.get(d.key).temp : [])).filter((v) => v != null);
      const tAvg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      const traffic = devs.filter((d) => d.kind === 'server').reduce((a, d) => a + (last(M.series.get(d.key) ? M.series.get(d.key).netIn : []) || 0), 0);
      const av = avail(devs.map((d) => d.key));
      let h = tips();
      h += '<div class="grow4">' + panel('Visão geral', HELP.stat,
        '<div class="gstats">' +
        stat('Hosts respondendo', up + ' / ' + devs.length, up === devs.length ? '#73bf69' : '#f2495c') +
        stat('Disponibilidade', av == null ? '—' : av.toFixed(av > 99.9 ? 0 : 1) + '%', color(100 - (av || 100), 0.5, 5), 'últimos 2 min') +
        stat('Problemas ativos', act.length, act.length ? SEV[worst].color : '#73bf69', act.length ? SEV[worst].label : 'tudo ok') +
        stat('Temperatura média', tAvg == null ? '—' : tAvg.toFixed(1) + ' °C', color(tAvg, 29, 31)) +
        stat('Tráfego total', Math.round(traffic) + ' Mbps', '#5794f2') +
        '</div>', 'gp--wide') + '</div>';
      h += '<div class="grow2">' + panel('CPU por servidor (%)', HELP.cpu, chart('cpu') + legendHtml('cpu')) + panel('Tráfego de rede (Mbps)', HELP.net, chart('net') + '<div class="glegend"><span style="--c:#73bf69">entrada</span><span style="--c:#5794f2">saída</span></div>') + '</div>';
      h += '<div class="grow3">' + panel('Temperatura por rack (°C)', HELP.temp, chart('temp')) + panel('Armazenamento ( / )', HELP.disk, bars(topBy('disk'))) + panel('Memória RAM', HELP.ram, bars(topBy('ram', 80, 92))) + '</div>';
      h += '<div class="grow1">' + panel('Disponibilidade por host', HELP.avail, '<canvas class="gp__c gp__c--tl" data-chart="avail"></canvas>', 'gp--wide') + '</div>';
      return h;
    }

    function topBy(k, warn, crit) {
      return monitored().filter((d) => d.kind === 'server').map((d) => ({ name: d.name, v: last(M.series.get(d.key) ? M.series.get(d.key)[k] : []), warn, crit }))
        .sort((a, b) => (b.v == null ? 999 : b.v) - (a.v == null ? 999 : a.v)).slice(0, 7);
    }

    function cpuHosts() {
      const servers = monitored().filter((d) => d.kind === 'server');
      // the busiest, plus anything that is broken, so problems are always on screen
      return servers.map((d) => ({ d, v: last(seriesOf(d.key).cpu) })).sort((a, b) => (b.v == null ? 999 : b.v) - (a.v == null ? 999 : a.v)).slice(0, 6).map((x) => x.d);
    }
    function legendHtml() {
      return '<div class="glegend">' + cpuHosts().map((d, i) => '<span style="--c:' + PAL[i % PAL.length] + '">' + esc(d.name) + '</span>').join('') + '</div>';
    }

    function hostsHtml() {
      const O = ops(), devs = monitored();
      let h = '<table class="ztable"><thead><tr><th>Host</th><th>IP</th><th>Tipo</th><th>Disponibilidade</th><th>CPU</th><th>RAM</th><th>Disco</th><th>Temp.</th><th>Problemas</th><th></th></tr></thead><tbody>';
      if (!devs.length) h += '<tr><td colspan="10" class="ztable__empty">Nenhum host monitorado. Configure um servidor para ele aparecer aqui.</td></tr>';
      for (const d of devs) {
        const s = M.series.get(d.key) || seriesOf(d.key), up = O.health(d).up;
        const pr = activeProblems().filter((p) => p.dev === d && p.sev !== 'info');
        const v = (k, u, w, c) => { const x = last(s[k]); return '<td style="color:' + color(x, w, c) + '">' + (x == null ? '—' : (k === 'temp' ? x.toFixed(1) : Math.round(x)) + u) + '</td>'; };
        h += '<tr data-host="' + d.key + '"><td><b>' + esc(d.name) + '</b></td><td class="mono">' + esc(d.ip) + '</td><td>' + (d.kind === 'switch' ? 'Switch' : DL.svcLabel ? DL.svcLabel(d) : 'Servidor Linux') + '</td>' +
          '<td><span class="zbx ' + (up ? 'is-up' : 'is-down') + '">ZBX</span> <span class="zbx ' + (up ? 'is-up' : 'is-down') + '">ICMP</span></td>' +
          v('cpu', '%', 75, 90) + v('ram', '%', 80, 92) + v('disk', '%', 80, 90) + v('temp', ' °C', 29, 31) +
          '<td>' + (pr.length ? pr.map((p) => '<span class="zsev" style="--c:' + SEV[p.sev].color + '">' + SEV[p.sev].label + '</span>').join(' ') : '<span class="m">—</span>') + '</td>' +
          '<td><button type="button" class="linkbtn" data-host="' + d.key + '">Gráficos</button></td></tr>';
      }
      return h + '</tbody></table>';
    }

    const dur = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; };
    function problemsHtml() {
      const t = now();
      let h = '<p class="mon__lead">Cada linha nasce de um <b>gatilho</b> (trigger): uma regra sobre as métricas, como “sem resposta ao ping” ou “disco acima de 90%”. Quando a regra volta ao normal, o problema vira <b class="ok">RESOLVIDO</b>.</p>';
      h += '<table class="ztable"><thead><tr><th>Hora</th><th>Severidade</th><th>Status</th><th>Host</th><th>Problema</th><th>Duração</th><th></th></tr></thead><tbody>';
      if (!M.problems.length) h += '<tr><td colspan="7" class="ztable__empty">Nenhum problema. Tudo verde.</td></tr>';
      for (const p of M.problems) {
        h += '<tr class="' + (p.end ? 'is-res' : '') + '"><td class="mono">' + p.startClock + '</td><td><span class="zsev zsev--fill" style="--c:' + SEV[p.sev].color + '">' + SEV[p.sev].label + '</span></td>' +
          '<td class="' + (p.end ? 'ok' : 'w') + '">' + (p.end ? 'RESOLVIDO' : 'PROBLEMA') + '</td><td>' + esc(p.dev.name) + '</td><td>' + esc(p.text) + '</td><td class="mono">' + dur((p.end || t) - p.start) + '</td>' +
          '<td>' + (p.end ? '' : '<button type="button" class="btn btn--sm" data-host="' + p.dev.key + '">Investigar</button>') + '</td></tr>';
      }
      return h + '</tbody></table>';
    }

    // Progressive help: first a direction, then the specific cause — never the fix itself.
    function diagnose(d) {
      const O = ops(), h = O.health(d);
      if (d.kind === 'switch') {
        if (h.broken) return ['O switch inteiro parou de responder: todos os hosts ligados nele caíram juntos. Isso é hardware, não configuração.', 'Defeito físico no ' + d.name + ' (fonte/placa). Quem resolve é o técnico de TI: ele retira o switch, conserta na bancada e reinstala. Veja as ordens de serviço em Tarefas (T).'];
        const p = Object.keys(d.sw.ports).find((k) => d.sw.ports[k] === 'err-disabled');
        if (!p) return null;
        return ['Um switch com porta em erro derruba o host ligado nela. Veja quais hosts ficaram vermelhos na disponibilidade.', 'A porta ' + p + ' está err-disabled. No terminal do switch: enable → conf t → interface ' + p + ' → shutdown / no shutdown.'];
      }
      const wd = DL.winDiagnose ? DL.winDiagnose(d, h) : null;
      if (wd) return wd;
      if (!h.up) {
        const t = d.path || O.trace(d);
        const first = 'O host parou de responder ao ping. Comece pela camada física (cabo e porta) e depois a configuração (interface e IP). No terminal: ip link.';
        if (h.why === 'cable') return [first, 'Sem sinal no cabo: ' + t.reason + '. Abra o cabeamento do ' + d.rack.id + '.'];
        if (h.why === 'iface') return [first, 'O cabo está ok, mas a interface eth0 foi desligada (DOWN). No terminal, ligue a interface.'];
        if (h.why === 'port') return [first, 'O cabo chega ao ' + t.sw.name + ' ' + t.port + ', mas essa porta está err-disabled. O problema está no switch.'];
        if (h.why === 'switch') return [first, 'O cabo está ok, mas o ' + t.sw.name + ' está com defeito de hardware. Quando o técnico reinstalar o switch, o host volta sozinho.'];
        return [first, 'A eth0 está sem o IP ' + d.ip + '/24.'];
      }
      if (!h.http) return ['O ping responde, mas o site não. O problema é de serviço, não de rede.', 'O nginx parou. No terminal: systemctl status nginx.'];
      if (d.os.disk >= 90) return ['O gráfico de disco subiu até perto de 100%. Descubra o que está ocupando espaço.', 'Os logs em /var/log cresceram demais. No terminal: df -h e du -sh /var/log.'];
      return null;
    }

    function hostHtml(d) {
      const O = ops(), h = O.health(d);
      const pr = activeProblems().filter((p) => p.dev === d);
      let s = '<div class="mon__crumb"><button type="button" class="linkbtn" data-mon="hosts">Hosts</button> / <b>' + esc(d.name) + '</b></div>';
      s += '<div class="mon__hosthead"><span class="zbx ' + (h.up ? 'is-up' : 'is-down') + '">' + (h.up ? 'DISPONÍVEL' : 'INDISPONÍVEL') + '</span><span class="mono">' + esc(d.ip) + ' · ' + esc(d.where) + '</span>' +
        '<span class="mon__acts"><button type="button" class="btn btn--sm btn--primary" data-act="term">Abrir terminal</button><button type="button" class="btn btn--sm" data-act="cable">Cabeamento</button><button type="button" class="btn btn--sm" data-act="map">Ver no mapa</button></span></div>';
      const dg = diagnose(d);
      if (dg) {
        const lvl = M.hint[d.key] || 0;
        s += '<div class="mon__diag"><b>Investigação</b>' + (pr.length ? ' · ' + esc(pr[0].text) : '') +
          (lvl >= 1 ? '<p>💡 ' + esc(dg[0]) + '</p>' : '') + (lvl >= 2 ? '<p>🔎 ' + esc(dg[1]) + '</p>' : '') +
          (lvl < 2 ? '<button type="button" class="btn btn--sm" data-mon="hint">' + (lvl ? 'Mais uma dica' : 'Precisa de uma dica?') + '</button>' : '') + '</div>';
      }
      s += '<div class="grow2">' + panel('CPU (%)', HELP.cpu, chart('h-cpu')) + panel('Memória RAM (%)', HELP.ram, chart('h-ram')) + '</div>';
      s += '<div class="grow2">' + panel('Tráfego de rede (Mbps)', HELP.net, chart('h-net') + '<div class="glegend"><span style="--c:#73bf69">entrada</span><span style="--c:#5794f2">saída</span></div>') + panel('Temperatura (°C)', HELP.temp, chart('h-temp')) + '</div>';
      s += '<div class="grow2">' + panel('Disco ( / )', HELP.disk, bars([{ name: '/', v: last((M.series.get(d.key) || seriesOf(d.key)).disk) }])) + panel('Disponibilidade', HELP.avail, '<canvas class="gp__c gp__c--tl1" data-chart="h-avail"></canvas>') + '</div>';
      if (d.kind === 'switch') {
        s += '<div class="grow1">' + panel('Portas do switch', 'Verde: cabo ligado. Cinza: livre. Vermelho: err-disabled.', '<div class="zports">' + Object.keys(d.sw.ports).map((p) => '<span class="zport is-' + d.sw.ports[p] + '" title="' + p + ' · ' + d.sw.ports[p] + '">' + p.split('/')[1] + '</span>').join('') + '</div>', 'gp--wide') + '</div>';
      }
      return s;
    }

    function render(force) {
      if (!M.open) return;
      el.tabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === M.tab || (M.tab === 'host' && b.dataset.tab === 'hosts')));
      const d = M.tab === 'host' ? ops().get(M.host) : null;
      if (M.tab === 'host' && !d) M.tab = 'hosts';
      const key = M.tab + (d ? d.key + ops().health(d).up + (M.hint[d.key] || 0) + activeProblems().filter((p) => p.dev === d).length : '') +
        (M.tab === 'dash' ? monitored().length + ':' + activeProblems().length + ':' + M.tipsOff + ':' + Math.floor(now()) : '') +
        (M.tab === 'problems' || M.tab === 'hosts' ? M.problems.length + ':' + activeProblems().length + ':' + Math.floor(now()) : '');
      if (force || key !== M.key) {
        M.key = key;
        const y = el.body.scrollTop;
        el.body.innerHTML = M.tab === 'dash' ? dashHtml() : M.tab === 'hosts' ? hostsHtml() : M.tab === 'problems' ? problemsHtml() : hostHtml(d);
        el.body.scrollTop = y;
      }
      draw(d);
    }

    function draw(d) {
      const q = (id) => el.body.querySelector('[data-chart="' + id + '"]');
      const sum = (k) => { const out = new Array(N).fill(undefined); for (const x of monitored()) { if (x.kind !== 'server') continue; const s = M.series.get(x.key); if (!s) continue; s[k].forEach((v, i) => { if (v != null) out[i] = (out[i] || 0) + v; }); } return out; };
      if (M.tab === 'dash') {
        if (q('cpu')) timeseries(q('cpu'), cpuHosts().map((x, i) => ({ data: seriesOf(x.key).cpu, color: PAL[i % PAL.length], gapMark: true })), { min: 0, max: 100, unit: '%', threshold: 88 });
        if (q('net')) timeseries(q('net'), [{ data: sum('netIn'), color: '#73bf69' }, { data: sum('netOut'), color: '#5794f2' }], { min: 0, area: true, unit: 'Mbps' });
        if (q('temp')) {
          const racks = [], seen = new Set();
          for (const x of monitored()) if (x.kind === 'server' && !seen.has(x.rack)) { seen.add(x.rack); racks.push(x); }
          timeseries(q('temp'), racks.slice(0, 6).map((x, i) => ({ data: seriesOf(x.key).temp, color: PAL[(i + 2) % PAL.length] })), { min: 20, max: 36, unit: '°C', threshold: 31 });
        }
        if (q('avail')) timeline(q('avail'), monitored().slice(0, 14).map((x) => ({ name: x.name, data: seriesOf(x.key).up })));
      } else if (d) {
        const s = M.series.get(d.key) || seriesOf(d.key);
        if (q('h-cpu')) timeseries(q('h-cpu'), [{ data: s.cpu, color: '#73bf69', gapMark: true }], { min: 0, max: 100, unit: '%', threshold: 88 });
        if (q('h-ram')) timeseries(q('h-ram'), [{ data: s.ram, color: '#b877d9', gapMark: true }], { min: 0, max: 100, unit: '%' });
        if (q('h-net')) timeseries(q('h-net'), [{ data: s.netIn, color: '#73bf69', gapMark: true }, { data: s.netOut, color: '#5794f2' }], { min: 0, area: true, unit: 'Mbps' });
        if (q('h-temp')) timeseries(q('h-temp'), [{ data: s.temp, color: '#ff9830', gapMark: true }], { min: 20, max: 40, unit: '°C', threshold: 31 });
        if (q('h-avail')) timeline(q('h-avail'), [{ name: d.name, data: s.up }]);
      }
    }

    /* ------------------------------------------------------------------ */
    /* Wiring                                                              */
    /* ------------------------------------------------------------------ */
    function open(tab, d) {
      M.tab = tab || (M.tab === 'host' ? 'dash' : M.tab);
      if (d) { M.tab = 'host'; M.host = d.key; }
      M.open = true;
      M.opened++;
      el.root.classList.add('is-open');
      el.btn.classList.add('is-on');
      render(true);
    }
    function close() {
      if (!M.open) return;
      M.open = false;
      el.root.classList.remove('is-open');
      el.btn.classList.remove('is-on');
    }

    el.btn.addEventListener('click', () => { M.open ? close() : open(); el.btn.blur(); });
    el.close.addEventListener('click', close);
    el.root.addEventListener('pointerdown', (ev) => { if (ev.target === el.root) close(); });
    el.tabs.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      M.tab = b.dataset.tab;
      render(true);
    });
    el.body.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-host],[data-mon],[data-act]');
      if (!b) return;
      if (b.dataset.host) { M.tab = 'host'; M.host = b.dataset.host; render(true); return; }
      if (b.dataset.mon === 'tipsoff') { M.tipsOff = true; render(true); return; }
      if (b.dataset.mon === 'hosts') { M.tab = 'hosts'; render(true); return; }
      if (b.dataset.mon === 'hint') { M.hint[M.host] = (M.hint[M.host] || 0) + 1; render(true); return; }
      const d = ops().get(M.host);
      if (!d) return;
      if (b.dataset.act === 'term') { close(); ops().openTerminal(d); }
      else if (b.dataset.act === 'cable') { close(); sys.cabling.open(d.rack, d); }
      else if (b.dataset.act === 'map') { close(); game.focus(d.rack.px + 8, d.rack.py); game.flash(d.rack); }
    });
    addEventListener('resize', () => render(true));

    function update(dt) {
      M.acc += dt;
      M.poll += dt;
      if (M.acc >= 1) {
        M.acc -= 1;
        if (M.acc > 1) M.acc = 0;
        sample();
        render(false);
      }
      if (M.poll >= 2) { M.poll = 0; evaluate(); }
    }

    function key(ev) {
      if (!M.open) return false;
      if (ev.code === 'Escape' || ev.code === 'KeyM') { close(); return true; }
      return true;
    }

    return {
      open, close, update, key,
      get isOpen() { return M.open; },
      get opened() { return M.opened; },
      get problems() { return M.problems; },
      series: (d) => M.series.get(d.key),
      activeProblems,
      evaluate, sample,
    };
  };
})();
