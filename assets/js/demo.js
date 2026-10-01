/* DataLab — playable demo: input, interaction, equipment panel, incident flow. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const $ = (id) => document.getElementById(id);

  const game = $('game');
  const canvas = $('world');
  const narrow = () => innerWidth < 768;
  const scene = new DL.Scene(canvas, { tilesWide: narrow() ? 10 : 21, minTilesHigh: 11, padTop: narrow() ? 170 : 96 });
  const W = scene.world;
  const player = scene.addPlayer(DL.LOOKS.player, W.spawn.x, W.spawn.y, 'up');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    phase: 'intro',
    time: 0,
    alertAt: 9,
    incidentStart: 0,
    resolvedAt: 0,
    summaryAt: 0,
    inspected: new Set(),
    rebooted: false,
    uplinkChecked: false,
    logsOpen: false,
    busy: null,
    panel: null,
    target: null,
    bubble: null,
    walked: 0,
    liveAcc: 0,
  };

  const OBJ = {
    intro: { step: '', title: '', text: '', target: null, bar: -1 },
    explore: { step: 'Livre', title: 'Explore o datacenter', text: 'Atravesse a porta de vidro e inspecione um equipamento no salão.', target: null, bar: -1 },
    alert: { step: '1 / 3', title: 'Verifique o painel do NOC', text: 'Um alerta crítico disparou. O painel na parede do NOC mostra o que caiu.', target: 'NOC-WALL', bar: 0 },
    locate: { step: '2 / 3', title: 'Encontre o SW-ACC-B', text: 'Switch de acesso no fim da fileira B, no salão de servidores.', target: 'SW-ACC-B', bar: 1 },
    diagnose: { step: '3 / 3', title: 'Restaure o uplink', text: 'Investigue o switch e devolva a fileira B à rede.', target: 'SW-ACC-B', bar: 2 },
    resolved: { step: 'Concluído', title: 'Incidente resolvido', text: 'A fileira B voltou. Explore o datacenter à vontade.', target: null, bar: 3 },
  };
  const inIncident = () => S.phase === 'alert' || S.phase === 'locate' || S.phase === 'diagnose';

  const WHY = {
    rack: 'Racks agrupam servidores. Cada um puxa ar frio pela frente e devolve ar quente por trás — por isso os corredores alternam.',
    switch: 'O switch top-of-rack liga todos os servidores da fileira ao core. Se o uplink cai, eles continuam ligados, mas ficam isolados.',
    router: 'O roteador de borda é a porta do datacenter para a internet. Com duas operadoras, uma pode cair sem derrubar o serviço.',
    core: 'O core agrega todos os switches de acesso. É o centro da topologia: tudo que sai de uma fileira passa por aqui.',
    storage: 'O storage compartilhado guarda os dados que os servidores usam, acessado pela rede como se fosse um disco local.',
    crac: 'A refrigeração de precisão mantém o corredor frio estável. Cada grau a mais custa energia e vida útil do hardware.',
    ups: 'O nobreak segura a carga por alguns minutos quando a energia cai, até o gerador assumir.',
    desk: 'O NOC monitora tudo em tempo real. É aqui que os incidentes aparecem primeiro.',
    videowall: 'O painel consolida a saúde da sala. Um bom técnico olha aqui antes de sair andando pelo salão.',
  };

  /* ---------------- helpers ---------------- */
  const mmss = (s) => {
    s = Math.max(0, Math.floor(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const clockAt = (s) => {
    const m = 120 + Math.floor(s);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fmtPower = (e) => (e.tel.unit === 'W' ? Math.round(e.power) : e.power.toFixed(e.power < 10 ? 2 : 1)) + '<small>' + e.tel.unit + '</small>';
  const isOverlayOpen = () => $('help').classList.contains('is-open') || $('summary').classList.contains('is-open');
  const canMove = () => S.phase !== 'intro' && !S.busy && !isOverlayOpen();

  /* ---------------- toasts ---------------- */
  function toast(tone, label, text) {
    const el = document.createElement('div');
    el.className = 'toast toast--' + tone;
    el.innerHTML = '<span class="dot ' + (tone === 'warn' ? 'dot--warn dot--live' : tone === 'ok' ? '' : 'dot--info') + '"></span><b>' + label + '</b><span>' + text + '</span>';
    if (tone === 'info') el.querySelector('.dot').style.background = 'var(--breeze)';
    $('toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 400);
    }, 4200);
  }

  /* ---------------- objective ---------------- */
  const bars = Array.from(document.querySelectorAll('.objective__progress i'));
  function setPhase(p) {
    S.phase = p;
    const o = OBJ[p];
    const obj = $('objective');
    obj.classList.toggle('is-alert', inIncident());
    obj.classList.toggle('is-done', p === 'resolved');
    $('objStep').textContent = o.step;
    for (const id of ['objTitle', 'objText']) {
      const el = $(id);
      el.textContent = id === 'objTitle' ? o.title : o.text;
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
    bars.forEach((b, i) => (b.className = i < o.bar ? 'is-done' : i === o.bar ? 'is-current' : ''));
    $('objTimer').hidden = !inIncident();
    if (S.panel) renderPanel();
  }

  function triggerAlert() {
    S.incidentStart = S.time;
    scene.setIncident(true);
    setPhase('alert');
    toast('warn', 'Alerta crítico', 'SW-ACC-B parou de responder · fileira B sem rede');
    const edge = $('alertEdge');
    edge.classList.remove('is-on');
    void edge.offsetWidth;
    edge.classList.add('is-on');
    $('clockDot').classList.add('dot--warn');
  }

  function resolve() {
    scene.resolveIncident();
    S.resolvedAt = S.time;
    S.summaryAt = S.time + 2.8;
    setPhase('resolved');
    toast('ok', 'Uplink restaurado', 'Fileira B de volta à rede · 10 Gb/s');
    $('clockDot').classList.remove('dot--warn');
  }

  function showSummary() {
    const dur = S.resolvedAt - S.incidentStart;
    $('summaryStats').innerHTML =
      '<div><span class="eyebrow-sm">Tempo</span><strong>' + mmss(dur) + '</strong></div>' +
      '<div><span class="eyebrow-sm">Inspeções</span><strong>' + S.inspected.size + '</strong></div>' +
      '<div><span class="eyebrow-sm">Tentativas</span><strong>' + (S.rebooted ? 2 : 1) + '</strong></div>';
    $('summary').classList.add('is-open');
    setTimeout(() => $('summary').querySelector('.btn--primary').focus({ preventScroll: true }), 50);
  }

  /* ---------------- equipment panel ---------------- */
  const panel = $('panel');
  const inner = $('panelInner');

  function statusOf(e) {
    if (e.kind === 'switch' && e.state === 'down') return { label: 'Offline · inalcançável', tone: 'warn' };
    if (e.state === 'warn') return { label: 'Degradado · sem rede', tone: 'warn' };
    if (e.kind === 'core' && e.coreLinkDown) return { label: 'Operacional · 1 link caído', tone: 'warn' };
    if (e.kind === 'videowall') return scene.incident.active && !scene.incident.resolved ? { label: '1 alerta crítico', tone: 'warn' } : { label: 'Tudo operacional', tone: 'ok' };
    if (e.kind === 'desk' && e.alert) return { label: 'Operacional · alerta na tela', tone: 'warn' };
    return { label: 'Operacional', tone: 'ok' };
  }

  function subOf(e) {
    switch (e.kind) {
      case 'rack': return e.name + ' · ' + e.servers.length + ' servidores · 42U';
      case 'switch': return e.name + ' · 16 portas + uplink 10G';
      case 'router': return 'Borda com a internet · 2 operadoras';
      case 'core': return 'Agregação dos switches de acesso';
      case 'storage': return 'Armazenamento em bloco · 96 TB';
      case 'crac': return 'Insuflamento pelo piso elevado';
      case 'ups': return 'Nobreak modular · 60 kVA';
      case 'desk': return 'Estação de monitoramento do NOC';
      default: return 'Visão consolidada da sala DC-01';
    }
  }

  function linkOf(e) {
    switch (e.kind) {
      case 'rack': return e.state === 'warn' ? { text: 'Sem rota — uplink do SW-ACC-B caiu', warn: true } : { text: '2×10 Gb/s via SW-ACC-' + e.row };
      case 'switch': return e.state === 'down' ? { text: 'Uplink U1 down · 0 Gb/s', warn: true } : { text: 'Uplink 10 Gb/s → SW-CORE-01' };
      case 'router': return { text: 'WAN 2×10 Gb/s · 2 operadoras' };
      case 'core': return e.coreLinkDown ? { text: '5/6 links · Te1/0/2 down', warn: true } : { text: '6/6 links ativos · 40 Gb/s' };
      case 'storage': return { text: 'iSCSI 2×25 Gb/s via core' };
      case 'crac': return { text: 'BMS · Modbus online' };
      case 'ups': return { text: 'Rede elétrica estável' };
      default: return { text: '1 Gb/s · VLAN 10 (NOC)' };
    }
  }

  function metricsHtml(e) {
    const link = linkOf(e);
    const tLabel = e.kind === 'crac' ? 'Ar insuflado' : e.kind === 'desk' ? 'CPU' : 'Temperatura';
    const pLabel = e.kind === 'ups' ? 'Carga' : 'Energia';
    const down = e.kind === 'switch' && e.state === 'down';
    return (
      '<div class="metrics">' +
      '<div class="metric"><span class="eyebrow-sm">' + tLabel + '</span><p class="metric__val" data-live="temp"></p><canvas data-spark="temp"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">' + pLabel + '</span><p class="metric__val" data-live="power"></p><canvas data-spark="power"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">Conexão</span><p class="metric__val metric__val--sm' + (link.warn ? ' is-warn' : '') + '">' + link.text + '</p></div>' +
      '<div class="metric"><span class="eyebrow-sm">' + (down ? 'Sem resposta há' : 'Uptime') + '</span><p class="metric__val metric__val--sm' + (down ? ' is-warn' : '') + '" data-live="uptime"></p></div>' +
      '</div>'
    );
  }

  function list(rows) {
    return '<ul class="list">' + rows.map((r) =>
      '<li><span class="dot' + (r.warn ? ' dot--warn' : '') + '"></span><span class="mono">' + (r.k || '') + '</span><span class="grow">' + r.v + '</span><span class="tag' + (r.warn ? ' is-warn' : '') + '">' + (r.tag || '') + '</span></li>'
    ).join('') + '</ul>';
  }

  function portsHtml(e) {
    const down = e.state === 'down';
    let h = '<div class="ports" data-ports>';
    for (let i = 0; i < 16; i++) {
      const used = ![6, 7, 14, 15].includes(i);
      h += '<i class="port' + (used ? ' is-up' : '') + '" ' + (used && !down ? 'data-act-port' : '') + ' style="grid-column:' + ((i % 8) + 1) + ';grid-row:' + (Math.floor(i / 8) + 1) + '"></i>';
    }
    h += '<i class="port port--up ' + (down ? 'is-down' : 'is-up') + '" style="grid-column:10;grid-row:1 / span 2"></i></div>';
    h += '<div class="ports__legend"><span class="eyebrow-sm">12 de 16 portas em uso</span><span class="eyebrow-sm">U1 · uplink</span></div>';
    return h;
  }

  function logsHtml() {
    const t0 = S.incidentStart;
    const ts = (d) => clockAt(t0 + d) + ':' + String(12 + Math.round(d * 7) % 47).padStart(2, '0');
    let l = '<span class="w">' + ts(0) + ' %LINK-3-UPDOWN: Interface Te1/1/1, changed state to down</span>\n' +
      '<span class="w">' + ts(0) + ' %LINEPROTO-5-UPDOWN: Line protocol on Te1/1/1, changed state to down</span>\n' +
      '<span class="w">' + ts(0.1) + ' %SFF8472-5-THRESHOLD: Te1/1/1 Rx power low (-40.0 dBm)</span>\n' +
      '<span class="m">' + ts(0.2) + ' %STP-6-PORT_STATE: Gi1/0/1-12 forwarding, no root path</span>';
    if (S.rebooted) l += '\n<span class="m">… %SYS-5-RESTART: System restarted</span>\n<span class="w">… %LINK-3-UPDOWN: Interface Te1/1/1, changed state to down</span>';
    if (scene.incident.resolved) l += '\n<span class="ok">' + clockAt(S.resolvedAt) + ' %LINK-3-UPDOWN: Interface Te1/1/1, changed state to up</span>';
    return '<pre class="logs">' + l + '</pre>';
  }

  function topoHtml() {
    const inc = scene.incident.active && !scene.incident.resolved;
    return '<pre class="topo">RT-EDGE-01\n  └─ SW-CORE-01\n       ├─ SW-ACC-A  <span class="ok">● up</span>\n       └─ SW-ACC-B  ' +
      (inc ? '<span class="w">● down</span>' : '<span class="ok">● up</span>') + '</pre>';
  }

  function diagnosisHtml(e) {
    let h = '<div class="p-sec"><span class="eyebrow-sm">Diagnóstico</span>';
    if (S.busy) {
      h += '<div class="progress"><span class="eyebrow-sm" style="color:var(--ink)">' + S.busy.label + '</span><div class="progress__bar"><i style="animation-duration:' + S.busy.dur + 's"></i></div></div>';
    } else {
      h += '<div class="actions">' +
        '<button class="btn" type="button" data-act="logs">' + (S.logsOpen ? 'Ocultar logs' : 'Ver logs') + '</button>' +
        '<button class="btn" type="button" data-act="reboot"' + (S.rebooted ? ' disabled' : '') + '>Reiniciar switch</button>' +
        '<button class="btn" type="button" data-act="inspect"' + (S.uplinkChecked ? ' disabled' : '') + '>Inspecionar uplink U1</button>' +
        '</div>';
    }
    if (S.rebooted) h += '<p class="callout callout--warn">O switch reiniciou e voltou em 40 s — mas o uplink U1 continua sem sinal. O problema não é software.</p>';
    if (S.uplinkChecked) {
      h += '<p class="callout">O transceiver SFP+ da porta U1 está no lugar, mas o cabo de fibra saiu do conector. Sem luz, sem link.</p>';
      if (!S.busy) h += '<div class="actions" style="margin-top:12px"><button class="btn btn--primary" type="button" data-act="reconnect">Reconectar cabo de fibra <span class="arrow">→</span></button></div>';
    }
    h += '</div>';
    if (S.logsOpen) h += '<div class="p-sec"><span class="eyebrow-sm">Logs · últimos eventos</span>' + logsHtml() + '</div>';
    return h;
  }

  function detailHtml(e) {
    const inc = scene.incident.active && !scene.incident.resolved;
    switch (e.kind) {
      case 'rack':
        return '<div class="p-sec"><span class="eyebrow-sm">Servidores</span>' + list(e.servers.map((s) => ({
          k: s.u, v: s.host, warn: e.state === 'warn', tag: e.state === 'warn' ? 'isolado' : 'online',
        }))) + '</div>';
      case 'storage':
        return '<div class="p-sec"><span class="eyebrow-sm">Volumes</span>' + list([
          { k: 'LUN0', v: 'vol-db · 24 TB', tag: '71% usado' },
          { k: 'LUN1', v: 'vol-app · 16 TB', tag: '48% usado' },
          { k: 'LUN2', v: 'vol-backup · 48 TB', tag: '63% usado' },
        ]) + '</div>';
      case 'switch': {
        let h = '<div class="p-sec"><span class="eyebrow-sm">Portas</span>' + portsHtml(e) + '</div>';
        if (e.id === 'SW-ACC-B' && inc) h += diagnosisHtml(e);
        else if (e.id === 'SW-ACC-B' && scene.incident.resolved) {
          h += '<p class="callout callout--ok">Uplink restaurado · 10 Gb/s full-duplex. Os 6 racks da fileira B voltaram a responder.</p>';
          h += '<div class="p-sec"><span class="eyebrow-sm">Logs · últimos eventos</span>' + logsHtml() + '</div>';
        }
        return h;
      }
      case 'core':
        return '<div class="p-sec"><span class="eyebrow-sm">Interfaces</span>' + list([
          { k: 'Te1/0/1', v: '→ SW-ACC-A', tag: 'up' },
          { k: 'Te1/0/2', v: '→ SW-ACC-B', tag: e.coreLinkDown ? 'down' : 'up', warn: e.coreLinkDown },
          { k: 'Te1/0/3', v: '→ RT-EDGE-01', tag: 'up' },
          { k: 'Te1/0/4', v: '→ cluster de storage', tag: 'up' },
        ]) + '</div>';
      case 'router':
        return '<div class="p-sec"><span class="eyebrow-sm">Interfaces</span>' + list([
          { k: 'WAN1', v: 'Operadora A · 10 Gb/s', tag: 'up' },
          { k: 'WAN2', v: 'Operadora B · 10 Gb/s', tag: 'up' },
          { k: 'Te0/1', v: '→ SW-CORE-01', tag: 'up' },
        ]) + '</div>';
      case 'crac':
        return '<div class="p-sec"><span class="eyebrow-sm">Climatização</span>' + list([
          { k: 'RET', v: 'Ar de retorno', tag: '31,4 °C' },
          { k: 'FAN', v: 'Ventiladores', tag: '62%' },
          { k: 'UR', v: 'Umidade relativa', tag: '45%' },
        ]) + '</div>';
      case 'ups':
        return '<div class="p-sec"><span class="eyebrow-sm">Bateria</span><div class="battery">' + '<i></i>'.repeat(10) + '</div></div>' +
          '<div class="p-sec">' + list([
            { k: 'AUT', v: 'Autonomia estimada', tag: '22 min' },
            { k: 'GER', v: 'Gerador diesel', tag: 'standby' },
            { k: 'ENT', v: 'Entrada da concessionária', tag: '220 V' },
          ]) + '</div>';
      case 'desk':
        return '<div class="p-sec"><span class="eyebrow-sm">Console · últimos eventos</span>' +
          (e.alert ? logsHtml() : '<pre class="logs"><span class="m">' + clockAt(Math.max(0, S.time - 3)) + ' backup-01: job noturno concluído\n' + clockAt(Math.max(0, S.time - 1)) + ' CRAC-02: setpoint 18 °C mantido</span>' + (scene.incident.resolved ? '\n<span class="ok">' + clockAt(S.resolvedAt) + ' INC-0412 resolvido · SW-ACC-B up</span>' : '') + '</pre>') +
          '</div>';
      case 'videowall':
        return '<div class="p-sec"><span class="eyebrow-sm">Alertas ativos</span>' + (inc
          ? list([
            { k: 'P1', v: 'SW-ACC-B · sem resposta (ICMP)', tag: 'crítico', warn: true },
            { k: 'P2', v: 'Fileira B · 6 racks sem rota', tag: 'alto', warn: true },
            { k: 'P3', v: 'SW-CORE-01 · Te1/0/2 down', tag: 'alto', warn: true },
          ])
          : list([{ k: '—', v: scene.incident.resolved ? 'INC-0412 resolvido. Nenhum alerta ativo.' : 'Nenhum alerta ativo. Tudo verde.', tag: 'ok' }])) +
          '</div><div class="p-sec"><span class="eyebrow-sm">Topologia</span>' + topoHtml() + '</div>' +
          (inc ? '<p class="callout callout--warn">Os servidores da fileira B estão ligados, mas ninguém os alcança. O problema está no caminho até eles: o switch SW-ACC-B, no fim da fileira.</p>' : '');
    }
    return '';
  }

  function renderPanel() {
    const e = S.panel;
    if (!e) return;
    const st = statusOf(e);
    inner.innerHTML =
      '<div class="p-head"><div><span class="eyebrow-sm">' + e.category + '</span><h2 class="p-title" id="panelTitle">' + e.id + '</h2><p class="p-sub">' + subOf(e) + '</p></div>' +
      '<button class="btn p-close" type="button" data-act="close" aria-label="Fechar painel">×</button></div>' +
      '<span class="status status--' + st.tone + '"><span class="dot' + (st.tone === 'warn' ? ' dot--warn dot--live' : '') + '"></span>' + st.label + '</span>' +
      (e.tel ? metricsHtml(e) : '') +
      detailHtml(e) +
      '<p class="why"><b>Por que importa.</b> ' + WHY[e.kind] + '</p>';
    updateLive();
  }

  function spark(cv, data, warn) {
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
    const col = warn ? '255,194,133' : '255,255,255';
    g.beginPath();
    data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.strokeStyle = 'rgba(' + col + ',0.75)';
    g.lineWidth = 1.25;
    g.lineJoin = 'round';
    g.stroke();
    g.lineTo(X(data.length - 1), h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = 'rgba(' + col + ',0.06)';
    g.fill();
    const lx = X(data.length - 1), ly = Y(data[data.length - 1]);
    g.fillStyle = 'rgba(' + col + ',1)';
    g.beginPath();
    g.arc(lx, ly, 2, 0, Math.PI * 2);
    g.fill();
  }

  function updateLive() {
    const e = S.panel;
    if (!e) return;
    if (e.tel) {
      const temp = inner.querySelector('[data-live="temp"]');
      if (temp) temp.innerHTML = e.temp.toFixed(1) + '<small>°C</small>';
      const pw = inner.querySelector('[data-live="power"]');
      if (pw) pw.innerHTML = fmtPower(e);
      const up = inner.querySelector('[data-live="uptime"]');
      if (up) up.textContent = e.kind === 'switch' && e.state === 'down' ? mmss(S.time - S.incidentStart) : e.uptime + ' dias';
      const warn = e.state !== 'ok';
      inner.querySelectorAll('[data-spark]').forEach((cv) => spark(cv, e.hist[cv.dataset.spark], warn));
    }
    inner.querySelectorAll('[data-act-port]').forEach((p, i) => p.classList.toggle('is-act', DL.hash(Math.floor(scene.t * 6) * 31 + i) > 0.55));
  }

  function openPanel(e) {
    S.panel = e;
    S.logsOpen = false;
    S.inspected.add(e.id);
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    inner.scrollTop = 0;
    const b = e.bounds;
    player.dir = DL.dirOf(b.x + b.w / 2 - player.x, b.y + b.h - 6 - player.y);
    if (e.id === 'NOC-WALL' && S.phase === 'alert') setPhase('locate');
    if (e.id === 'SW-ACC-B' && (S.phase === 'alert' || S.phase === 'locate')) setPhase('diagnose');
    if (S.phase === 'explore') S.alertAt = Math.min(S.alertAt, S.time + 3.5);
    renderPanel();
  }

  function closePanel() {
    if (S.busy || !S.panel) return;
    S.panel = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (panel.contains(document.activeElement)) document.activeElement.blur();
  }

  function busy(label, dur, done) {
    S.busy = { label, dur, until: S.time + dur, done };
    player.vx = player.vy = 0;
    renderPanel();
  }

  inner.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || S.busy) return;
    switch (b.dataset.act) {
      case 'close': closePanel(); break;
      case 'logs': S.logsOpen = !S.logsOpen; renderPanel(); break;
      case 'reboot':
        busy('Reiniciando SW-ACC-B…', 2.4, () => {
          S.rebooted = true;
          toast('info', 'Reinício concluído', 'Uplink U1 continua down');
        });
        break;
      case 'inspect':
        busy('Inspecionando a porta U1…', 1.4, () => (S.uplinkChecked = true));
        break;
      case 'reconnect':
        busy('Reconectando a fibra na porta U1…', 1.8, resolve);
        break;
    }
  });

  /* ---------------- NPC talk ---------------- */
  const bubble = $('bubble');
  function talk(n) {
    const set = S.phase === 'resolved' ? 'done' : inIncident() ? 'incident' : 'calm';
    const lines = n.def.lines[set];
    $('bubbleWho').textContent = n.def.name + ' · ' + n.def.role;
    $('bubbleText').textContent = lines[n.lineIdx % lines.length];
    n.lineIdx++;
    n.talkT = 4.2;
    S.bubble = { npc: n, until: S.time + 4.4 };
    bubble.classList.add('is-on');
    player.dir = DL.dirOf(n.x - player.x, n.y - player.y);
  }

  function interact() {
    if (S.phase === 'intro' || S.busy || isOverlayOpen()) return;
    const t = S.target;
    if (!t) return;
    if (t instanceof DL.Actor) talk(t);
    else if (S.panel === t) closePanel();
    else openPanel(t);
  }

  /* ---------------- input ---------------- */
  const keys = new Set();
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const touchVec = { x: 0, y: 0 };

  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = KEYMAP[ev.code];
    if (k) {
      keys.add(k);
      ev.preventDefault();
      return;
    }
    if (ev.code === 'Escape') {
      if ($('help').classList.contains('is-open')) $('help').classList.remove('is-open');
      else if ($('summary').classList.contains('is-open')) $('summary').classList.remove('is-open');
      else if (S.panel) closePanel();
      else if (S.bubble) S.bubble.until = 0;
      return;
    }
    if (ev.code === 'Enter' && S.phase === 'intro') {
      ev.preventDefault();
      start();
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
  $('startBtn').addEventListener('click', start);
  $('helpBtn').addEventListener('click', () => $('help').classList.add('is-open'));
  $('helpClose').addEventListener('click', () => $('help').classList.remove('is-open'));
  $('keepPlaying').addEventListener('click', () => $('summary').classList.remove('is-open'));

  // touch joystick
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

  /* ---------------- player ---------------- */
  function updatePlayer(dt) {
    let ix = 0, iy = 0;
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
    player.vx += (ix * SPEED - player.vx) * k;
    player.vy += (iy * SPEED - player.vy) * k;
    if (!len && Math.hypot(player.vx, player.vy) < 2) player.vx = player.vy = 0;

    const x0 = player.x, y0 = player.y;
    scene.moveActor(player, player.vx * dt, player.vy * dt);
    const moved = Math.hypot(player.x - x0, player.y - y0);
    const was = player.moving;
    player.moving = len > 0.1 && moved > 0.05;
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

    // camera: smooth follow with a little look-ahead
    const kc = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
    scene.cam.x += (player.x + player.vx * 0.22 - scene.cam.x) * kc;
    scene.cam.y += (player.y - 12 + player.vy * 0.22 - scene.cam.y) * kc;
  }

  function findTarget() {
    let best = null, bestD = 21;
    const fx = { left: -1, right: 1, up: 0, down: 0 }[player.dir], fy = { up: -1, down: 1, left: 0, right: 0 }[player.dir];
    for (const e of W.interactables) {
      const dx = e.ix - player.x, dy = e.iy - player.y;
      let d = Math.hypot(dx, dy);
      const b = e.bounds;
      if ((b.x + b.w / 2 - player.x) * fx + (b.y + b.h / 2 - player.y) * fy > 0) d -= 3;
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const n of scene.npcs) {
      const d = Math.hypot(n.x - player.x, n.y - player.y) - 2;
      if (d < 20 && d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /* ---------------- world-anchored UI ---------------- */
  const prompt = $('prompt');
  const labelsEl = $('worldLabels');
  const labelEls = W.labels.map((l) => {
    const s = document.createElement('span');
    s.textContent = l.text;
    labelsEl.appendChild(s);
    return s;
  });
  let promptKey = '';

  function updateWorldUi() {
    W.labels.forEach((l, i) => {
      const p = scene.worldToScreen(l.x, l.y);
      labelEls[i].style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)';
    });

    const t = S.target;
    const show = t && canMove() && !(S.panel && S.panel === t) && !(S.bubble && S.bubble.npc === t);
    if (show) {
      const isNpc = t instanceof DL.Actor;
      const ax = isNpc ? t.x : t.bounds.x + t.bounds.w / 2;
      const ay = isNpc ? t.y - 33 : t.bounds.y - 3;
      const p = scene.worldToScreen(ax, ay);
      prompt.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      const key = isNpc ? t.def.id : t.id;
      if (key !== promptKey) {
        promptKey = key;
        $('promptVerb').textContent = isNpc ? 'Conversar' : 'Inspecionar';
        $('promptName').textContent = isNpc ? t.def.name : t.id;
      }
      prompt.classList.toggle('is-target', !isNpc && OBJ[S.phase].target === t.id);
    }
    prompt.classList.toggle('is-on', !!show);

    if (S.bubble) {
      const n = S.bubble.npc;
      if (S.time > S.bubble.until || Math.hypot(n.x - player.x, n.y - player.y) > 56) {
        S.bubble = null;
        bubble.classList.remove('is-on');
      } else {
        const p = scene.worldToScreen(n.x, n.y - 34);
        bubble.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
    }
  }

  /* ---------------- in-world overlay: selection brackets + objective arrow ---------------- */
  function brackets(g, b, a) {
    g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    const x0 = b.x - 1, y0 = b.y - 1, x1 = b.x + b.w, y1 = b.y + b.h, L = 4;
    g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
    g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
    g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
    g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
  }
  function arrow(g, cx, y) {
    g.fillStyle = '#06070a';
    for (let i = 0; i < 5; i++) g.fillRect(cx - 4 + i, y - 4 + i, 9 - 2 * i, 1);
    g.fillRect(cx, y + 1, 1, 1);
    g.fillStyle = '#ff7a17';
    for (let i = 0; i < 4; i++) g.fillRect(cx - 3 + i, y - 3 + i, 7 - 2 * i, 1);
  }
  scene.overlay = (g, sc) => {
    const o = OBJ[S.phase];
    if (o.target) {
      const e = W.byId[o.target];
      if (S.target !== e && S.panel !== e) {
        const b = e.bounds;
        const bob = reduced ? 0 : Math.round(Math.sin(sc.t * 4) * 1.5);
        arrow(g, Math.round(b.x + b.w / 2), b.y - 5 + bob);
      }
    }
    const sel = S.panel || (S.target && !(S.target instanceof DL.Actor) && canMove() ? S.target : null);
    if (sel) brackets(g, sel.bounds, S.panel === sel ? 0.9 : 0.5 + 0.3 * Math.sin(sc.t * 5));
  };

  /* ---------------- minimap ---------------- */
  const mm = $('minimap');
  const MS = 6;
  const mmDpr = Math.min(window.devicePixelRatio || 1, 2);
  mm.width = W.W * MS * mmDpr;
  mm.height = W.H * MS * mmDpr;
  const mg = mm.getContext('2d');
  const mmStatic = DL.mk(W.W * MS, W.H * MS);
  (function () {
    const g = mmStatic.getContext('2d');
    const col = { '#': '#0c0d10', _: '#16181f', g: '#2a3446', d: '#1a1f27', '.': '#1a1f27', ',': '#1c232d' };
    for (let y = 0; y < W.H; y++) for (let x = 0; x < W.W; x++) DL.R(g, x * MS, y * MS, MS, MS, col[W.tiles[y * W.W + x]]);
    for (const e of W.interactables) {
      if (e.kind === 'videowall') { DL.R(g, 2 * MS, 2 * MS - 2, 7 * MS, 2, '#3d5a80'); continue; }
      const c = e.kind === 'rack' || e.kind === 'storage' ? '#3a414c' : e.kind === 'desk' ? '#2c3139' : e.kind === 'crac' || e.kind === 'ups' ? '#4a515c' : '#5d6878';
      DL.R(g, e.tx * MS + 1, e.ty * MS + 1, e.tw * MS - 1, e.th * MS - 1, c);
    }
  })();

  function drawMinimap() {
    const g = mg;
    g.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(mmStatic, 0, 0);
    const k = MS / T;
    const inc = scene.incident.active && !scene.incident.resolved;
    if (inc) {
      const a = 0.45 + 0.35 * Math.sin(scene.t * 4);
      g.fillStyle = 'rgba(255,122,23,' + a.toFixed(3) + ')';
      for (const e of W.rows.B) g.fillRect(e.tx * MS + 1, e.ty * MS + 1, MS - 1, MS - 1);
      const sw = W.byId['SW-ACC-B'];
      g.fillRect(sw.tx * MS + 1, sw.ty * MS + 1, MS - 1, MS - 1);
    }
    const o = OBJ[S.phase];
    if (o.target) {
      const e = W.byId[o.target];
      const cx = e.ix * k, cy = (e.iy - 10) * k;
      const ph = (scene.t * 0.8) % 1;
      g.strokeStyle = 'rgba(255,122,23,' + (1 - ph).toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, 3 + ph * 9, 0, Math.PI * 2);
      g.stroke();
    }
    // camera viewport
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.strokeRect(scene.ox / scene.S * k + 0.5, scene.oy / scene.S * k + 0.5, canvas.width / scene.S * k - 1, canvas.height / scene.S * k - 1);
    g.fillStyle = '#7d8187';
    for (const n of scene.npcs) g.fillRect(Math.round(n.x * k) - 1, Math.round(n.y * k) - 2, 3, 3);
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
    S.target = canMove() ? findTarget() : null;

    if (S.phase === 'explore' && S.time >= S.alertAt) triggerAlert();
    if (S.busy && S.time >= S.busy.until) {
      const done = S.busy.done;
      S.busy = null;
      done();
      renderPanel();
    }
    if (S.summaryAt && S.time >= S.summaryAt) {
      S.summaryAt = 0;
      showSummary();
    }
    if (S.panel && !S.busy && Math.hypot(S.panel.ix - player.x, S.panel.iy - player.y) > 44) closePanel();

    const c = clockAt(S.time);
    if (c !== lastClock) { lastClock = c; $('clock').textContent = c; }
    if (inIncident()) $('objTimer').textContent = 'Incidente aberto · ' + mmss(S.time - S.incidentStart);

    if (S.walked > 90) $('hint').classList.add('is-hidden');

    S.liveAcc += dt;
    if (S.liveAcc > 0.25) { S.liveAcc = 0; updateLive(); }
  }

  function start() {
    if (S.phase !== 'intro') return;
    $('intro').classList.remove('is-open');
    setPhase('explore');
    if (document.activeElement) document.activeElement.blur();
  }

  // render once per frame, then position DOM overlays from the fresh camera
  const render = scene.render.bind(scene);
  scene.render = function () {
    render();
    updateWorldUi();
    drawMinimap();
  };

  addEventListener('resize', () => {
    scene.o.tilesWide = narrow() ? 10 : 21;
    scene.o.padTop = narrow() ? 170 : 96;
    scene.resize();
  });
  scene.start(step);
  requestAnimationFrame(() => requestAnimationFrame(() => game.classList.add('is-ready')));
  $('startBtn').focus({ preventScroll: true });

  // exposed for debugging / automated checks
  window.DataLabDemo = { scene, state: S, player, start, interact, openPanel };
})();
