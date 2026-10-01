/* DataLab — landing page: live hero scene, sprite showcases, reveals. */
(function () {
  'use strict';
  const DL = window.DL;
  const R = DL.R;
  document.documentElement.classList.remove('no-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* reveal on scroll */
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* nav hairline once scrolled */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* run a render loop only while its element is on screen */
  function whenVisible(el, start, stop) {
    new IntersectionObserver((entries) => {
      for (const en of entries) (en.isIntersecting ? start : stop)();
    }, { threshold: 0.01 }).observe(el);
  }

  /* ---------- hero: the real DC-01 scene in attract mode ---------- */
  const heroCanvas = document.getElementById('heroCanvas');
  const narrow = () => innerWidth < 768;
  const hero = new DL.Scene(heroCanvas, { tilesWide: narrow() ? 11 : 25, minTilesHigh: narrow() ? 13 : 10, attract: true });
  hero.setIncident(true);
  hero.t = 40;
  const clockEl = document.getElementById('heroClock');
  let clockAcc = 0, minutes = 134;
  const heroStep = (dt) => {
    clockAcc += dt;
    if (clockAcc > 4) {
      clockAcc = 0;
      minutes++;
      clockEl.textContent = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    }
  };
  if (reduced) {
    hero.update(0.016);
    hero.render();
  } else {
    whenVisible(heroCanvas, () => hero.start(heroStep), () => hero.stop());
  }
  addEventListener('resize', () => {
    hero.o.tilesWide = narrow() ? 11 : 25;
    hero.o.minTilesHigh = narrow() ? 13 : 10;
    hero.resize();
    if (!hero.running) hero.render();
  });

  /* ---------- integer-scaled pixel stage for small showcases ---------- */
  function pixelStage(canvas, bw, bh, draw) {
    const g = canvas.getContext('2d');
    let raf = 0, running = false, t = 0, last = 0;
    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      const S = Math.max(1, Math.floor(Math.min(canvas.width / bw, canvas.height / bh)));
      const ox = Math.round((canvas.width - bw * S) / 2), oy = Math.round((canvas.height - bh * S) / 2);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(S, 0, 0, S, ox, oy);
      g.imageSmoothingEnabled = false;
      draw(g, t, S);
      if (running) raf = requestAnimationFrame(frame);
    }
    size();
    addEventListener('resize', () => { size(); if (!running) requestAnimationFrame(frame); });
    if (reduced) { t = 3; requestAnimationFrame(frame); return; }
    whenVisible(canvas, () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }, () => {
      running = false;
      cancelAnimationFrame(raf);
    });
  }

  function floorStrip(g, w, y) {
    for (let x = 0; x < w; x += 16) {
      R(g, x, y, 16, 16, '#10151c');
      R(g, x + 1, y + 1, 15, 15, '#151a22');
      R(g, x + 1, y + 1, 15, 1, '#1a202a');
    }
  }

  /* equipment lineup */
  const lineup = ['rack', 'switch', 'router', 'storage', 'crac'].map((kind, i) => {
    const e = { kind, px: 8 + i * 32, py: 34, tw: 1, th: 1, seed: 11 + i * 7, state: 'ok' };
    return e;
  });
  pixelStage(document.getElementById('lineupCanvas'), 160, 64, (g, t) => {
    R(g, 0, 0, 160, 64, '#0b0d11');
    floorStrip(g, 160, 34);
    R(g, 0, 50, 160, 14, '#0b0d11');
    for (const e of lineup) DL.drawItem(g, e, t);
  });

  /* technicians */
  const looks = ['player', 'marina', 'rafael', 'julia', 'theo'];
  const crew = looks.map((k, i) => ({ sheet: DL.makeSheet(DL.LOOKS[k]), x: 16 + i * 32, y: 44, i }));
  const DIRS = ['down', 'right', 'up', 'left'];
  pixelStage(document.getElementById('avatarCanvas'), 160, 60, (g, t, S) => {
    R(g, 0, 0, 160, 60, '#0b0d11');
    for (let x = 0; x < 160; x += 16) R(g, x, 44, 1, 16, '#12161c');
    R(g, 0, 44, 160, 1, '#161b23');
    for (const c of crew) {
      const phase = t * 0.42 + c.i * 0.18;
      const dir = DIRS[Math.floor(phase) % 4];
      const walking = phase % 1 < 0.72;
      const blinkOn = (t + c.i * 0.9) % 3.4 < 0.14;
      const f = c.sheet[dir];
      const img = walking ? f.walk[Math.floor(t * 9 + c.i) % 4] : blinkOn ? f.blink : f.idle;
      DL.drawActor(g, { x: c.x, y: c.y, frame: () => img }, S);
    }
  });

  /* telemetry card */
  const telTemp = document.getElementById('telTemp');
  const telPower = document.getElementById('telPower');
  const sparkT = document.getElementById('telSpark');
  const sparkP = document.getElementById('telSpark2');
  const dataT = [], dataP = [];
  let vT = 28.4, vP = 4.12;
  for (let i = 0; i < 32; i++) {
    vT += (28.4 - vT) * 0.2 + (Math.random() - 0.5) * 0.5;
    vP += (4.12 - vP) * 0.2 + (Math.random() - 0.5) * 0.1;
    dataT.push(vT);
    dataP.push(vP);
  }
  function spark(cv, data) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    g.beginPath();
    g.arc(X(data.length - 1), Y(data[data.length - 1]), 2, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
  }
  function telTick() {
    vT += (28.4 - vT) * 0.2 + (Math.random() - 0.5) * 0.5;
    vP += (4.12 - vP) * 0.2 + (Math.random() - 0.5) * 0.1;
    dataT.push(vT);
    dataP.push(vP);
    dataT.shift();
    dataP.shift();
    telTemp.textContent = vT.toFixed(1);
    telPower.textContent = vP.toFixed(2);
    spark(sparkT, dataT);
    spark(sparkP, dataP);
  }
  telTick();
  if (!reduced) {
    let timer = 0;
    whenVisible(sparkT, () => { if (!timer) timer = setInterval(telTick, 700); }, () => { clearInterval(timer); timer = 0; });
  }
  addEventListener('resize', () => { spark(sparkT, dataT); spark(sparkP, dataP); });

  /* floor plan */
  const fp = document.getElementById('floorplan');
  const rackRows = [1, 3, 5], aisleRows = [2, 6];
  let n = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 12; x++) {
      const i = document.createElement('i');
      if (rackRows.includes(y) && x >= 2 && x <= 9) {
        i.className = 'rack' + (y === 3 && x === 9 ? ' sel' : '');
        i.style.animationDelay = (n++ * 0.09).toFixed(2) + 's';
      } else if (aisleRows.includes(y) && x >= 2 && x <= 9) i.className = 'aisle';
      fp.appendChild(i);
    }
  }
})();
