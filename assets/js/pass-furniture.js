/* DataLab — the season pass' furniture (Passe Boot Inicial · Temporada 1, battlepass.js). Rewards only:
   never sold in the shop. Exactly like the shop's cosmetic furniture (cosm-furniture.js): each piece is a
   build-mode catalog entry (cat 'cosm') with the same id as its inventory item; once earned it is placed
   for free from the build mode's Cosméticos tab, turned, moved and put back in the inventory. One of each
   in the map. Pixel art in the game's palette (navy, turquoise, blue, slate). Loaded after
   cosm-furniture.js and before furniture.js (its generic turn handles the rotation). */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;
  const P = {
    navy: '#0b1730', navyD: '#060d1c', navyL: '#1a2b4d', turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a',
    blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0', slateD: '#323d50',
    ink: '#05080f', screen: '#06121a', black: '#11141b', blackL: '#232a38', ice: '#b8f3ff', green: '#6dff8f', greenD: '#1f6b3a',
    beige: '#bdb8a9', beigeD: '#8f8c80', beigeL: '#d6d1c2',
  };
  const SHADOW = 'rgba(0,0,0,0.35)';
  const blink = (t, hz, off) => Math.sin(t * hz + (off || 0)) > 0;
  const text = (g, s, x, y, c) => { if (DL.pixText) DL.pixText(g, s, x, y, c); };

  function codeRows(g, x, y, w, h, t, seed, cols) {
    const k = Math.floor(t * 4);
    for (let r = 0; r < h; r += 2) {
      const n = (r * 5 + k * 3 + seed * 7) % 13, len = 2 + (n % Math.max(2, w - 3));
      R(g, x + (n % 4 === 0 ? 2 : n % 3 === 0 ? 1 : 0), y + r, Math.min(len, w - 1), 1, cols[n % cols.length]);
    }
  }

  // nível 3 · Quadro "Hello World" (wall, 2 tiles)
  function hello(g, e, t) {
    const W = e.tw * T, x = e.px + 2, y = e.py - 25, w = W - 4, h = 17;
    R(g, x - 1, y - 1, w + 2, h + 2, P.turqD); R(g, x, y, w, h, P.navyD);
    R(g, x + 1, y + 1, w - 2, h - 2, P.screen);
    text(g, 'HELLO', x + 3, y + 2, P.turqL);
    text(g, 'WORLD', x + 3, y + 9, P.turq);
    if (blink(t, 4)) R(g, x + 24, y + 13, 2, 1, P.ice);
    R(g, x - 1, y - 1, 2, 2, P.ice); R(g, x + w - 1, y + h - 1, 2, 2, P.ice);
  }
  // nível 7 · Tapete Placa-Mãe (rug 2×2)
  function mobo(g, e, t) {
    const px = e.px, py = e.py, W = e.tw * T, H = e.th * T;
    R(g, px + 1, py + 1, W - 2, H - 2, P.navyD);
    R(g, px + 2, py + 2, W - 4, H - 4, '#0c2a2a');
    // traces
    for (const [x, y, w, h] of [[4, 6, 12, 1], [16, 6, 1, 9], [6, 14, 10, 1], [20, 4, 1, 8], [20, 12, 8, 1], [4, 22, 9, 1], [13, 18, 1, 5], [22, 20, 6, 1], [27, 20, 1, 8], [8, 26, 14, 1]]) R(g, px + x, py + y, w, h, P.turqD);
    // CPU, RAM slots, chips and the little lights
    R(g, px + 9, py + 9, 8, 8, P.slate); R(g, px + 10, py + 10, 6, 6, P.slateD); R(g, px + 11, py + 11, 4, 4, P.ice);
    for (let i = 0; i < 3; i++) R(g, px + 21 + i * 3, py + 4, 1, 12, P.blueD);
    R(g, px + 4, py + 18, 5, 3, P.slateD); R(g, px + 23, py + 23, 4, 4, P.slateD); R(g, px + 15, py + 22, 5, 3, P.black);
    R(g, px + 5, py + 27, 1, 1, blink(t, 3) ? P.turqL : P.turqD); R(g, px + 26, py + 14, 1, 1, blink(t, 2, 1) ? P.blueL : P.blueD);
    // a moving pulse along one trace
    const k = Math.floor((t * 8) % 12);
    R(g, px + 4 + k, py + 6, 1, 1, P.ice);
    for (let i = 1; i < W - 2; i += 3) { R(g, px + i, py + 1, 1, 1, P.turq); R(g, px + i, py + H - 2, 1, 1, P.turq); }
  }
  // nível 12 · Luminária de LED Piscando: lights up from the bottom, slowly, like a server booting
  function ledLamp(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 4, py + 12, 8, 2, SHADOW);
    R(g, px + 5, py + 9, 6, 4, P.slateD); R(g, px + 5, py + 9, 6, 1, P.slate);
    R(g, px + 6, py - 20, 4, 30, P.navy); R(g, px + 6, py - 20, 1, 30, P.navyL); R(g, px + 9, py - 20, 1, 30, P.navyD);
    const cyc = (t % 5) / 5, lit = cyc < 0.75 ? Math.floor((cyc / 0.75) * 7) : 7, on = cyc < 0.75 || blink(t, 6);
    for (let i = 0; i < 7; i++) {
      const y = py + 6 - i * 4, l = i < lit && on;
      R(g, px + 7, y, 2, 2, l ? (i === lit - 1 ? P.ice : P.turq) : P.turqD);
    }
  }
  // nível 17 · Máquina de Café 8-bit: chunky, with pixel steam puffs
  function coffee8(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 2, py - 14, 12, 26, P.navy); R(g, px + 2, py - 14, 12, 2, P.turqD); R(g, px + 12, py - 12, 2, 24, P.navyD);
    R(g, px + 4, py - 10, 8, 4, P.screen); text(g, '8', px + 5, py - 10, P.turqL);
    R(g, px + 9, py - 9, 2, 2, blink(t, 2) ? P.turq : P.turqD);
    R(g, px + 6, py - 4, 4, 2, P.ink);
    R(g, px + 4, py + 2, 8, 6, P.navyD);
    R(g, px + 6, py + 3, 4, 4, P.ice); R(g, px + 6, py + 3, 4, 1, '#ffffff'); R(g, px + 10, py + 4, 1, 2, P.ice);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i / 3) % 1, s = ph < 0.5 ? 2 : 1;
      R(g, px + 7 + (i % 2 ? 1 : -1) * Math.round(ph * 2), Math.round(py + 1 - ph * 12), s, s, 'rgba(165,247,234,' + (0.7 * (1 - ph)).toFixed(2) + ')');
    }
  }
  // nível 22 · Estante de Disquetes
  function floppyShelf(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 1, py - 20, 14, 33, P.slateD); R(g, px + 1, py - 20, 14, 1, P.slate); R(g, px + 2, py - 19, 12, 31, P.navyD);
    const cols = [P.turq, P.blue, P.blueL, P.slateL, P.ice, '#f2c14e', P.turqD];
    for (let r = 0; r < 4; r++) {
      const y = py - 18 + r * 8;
      for (let c = 0; c < 3; c++) {
        const col = cols[(r * 3 + c * 2) % cols.length], x = px + 3 + c * 4;
        R(g, x, y, 3, 6, col); R(g, x + 1, y, 1, 2, '#c9d6e6'); R(g, x, y + 5, 3, 1, 'rgba(0,0,0,0.3)');
      }
      R(g, px + 2, y + 6, 12, 1, P.slate);
    }
  }
  // nível 27 · Cadeira do Fundador: black gamer chair, turquoise trim, 001 on the backrest
  function founderChair(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 4, py + 12, 8, 1, P.slateD);
    R(g, px + 3, py + 13, 2, 1, P.ink); R(g, px + 7, py + 13, 2, 1, P.ink); R(g, px + 11, py + 13, 2, 1, P.ink);
    R(g, px + 7, py + 8, 2, 4, P.slateD);
    R(g, px + 4, py - 13, 8, 18, P.black);
    R(g, px + 3, py - 11, 1, 14, P.turq); R(g, px + 12, py - 11, 1, 14, P.turqD);
    R(g, px + 5, py - 12, 6, 2, P.blackL); R(g, px + 5, py - 12, 6, 1, P.turq);
    // "001" in tiny lit dots
    const c = blink(t, 1.5) ? P.ice : P.turqL;
    R(g, px + 5, py - 6, 1, 3, c); R(g, px + 7, py - 6, 1, 3, c); R(g, px + 10, py - 6, 1, 3, c); R(g, px + 5, py - 6, 2, 1, c); R(g, px + 5, py - 4, 2, 1, c); R(g, px + 6, py - 5, 1, 1, P.black);
    R(g, px + 3, py + 4, 10, 4, P.black); R(g, px + 3, py + 4, 10, 1, P.blackL); R(g, px + 3, py + 7, 10, 1, P.turqD);
    R(g, px + 1, py + 1, 2, 1, P.slateD); R(g, px + 13, py + 1, 2, 1, P.slateD);
    R(g, px + 2, py + 2, 1, 3, P.slateD); R(g, px + 13, py + 2, 1, 3, P.slateD);
  }
  // nível 32 · Cofre de Dados: steel safe with a blinking digital lock
  function vault(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 1, py - 10, 14, 23, P.slate); R(g, px + 1, py - 10, 14, 1, P.slateL); R(g, px + 14, py - 9, 1, 22, P.slateD);
    R(g, px + 2, py - 8, 11, 19, P.slateD); R(g, px + 3, py - 7, 9, 17, P.slate);
    // the lock panel: a padlock icon and a code that scrolls, red/turquoise light
    R(g, px + 4, py - 5, 7, 6, P.screen);
    const locked = (t % 6) < 4.5, c = locked ? (blink(t, 4) ? P.turq : P.turqD) : P.green;
    R(g, px + 6, py - 4, 3, 1, c); R(g, px + 6, py - 3, 1, 1, c); R(g, px + 8, py - 3, 1, 1, c); R(g, px + 5, py - 2, 5, 3, c); R(g, px + 7, py - 1, 1, 1, P.screen);
    // dial and handle
    R(g, px + 6, py + 3, 3, 3, P.slateL); R(g, px + 7, py + 4, 1, 1, P.ink);
    R(g, px + 10, py + 2, 1, 5, P.slateL);
    R(g, px + 2, py + 11, 2, 2, P.ink); R(g, px + 12, py + 11, 2, 2, P.ink);
  }
  // nível 37 · Mesa Hacker: black desk, three monitors full of code, a lit keyboard (2 tiles)
  function hackerDesk(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 30, 2, SHADOW);
    for (const [x, w, s] of [[1, 9, 1], [11, 10, 2], [22, 9, 3]]) {
      R(g, px + x, py - 14, w, 10, P.black); R(g, px + x, py - 14, w, 1, P.turqD);
      R(g, px + x + 1, py - 13, w - 2, 8, P.screen);
      codeRows(g, px + x + 2, py - 12, w - 3, 7, t, s, [P.green, P.turq, P.turqL, P.blueL]);
      R(g, px + x + Math.floor(w / 2) - 1, py - 4, 2, 3, P.ink);
    }
    R(g, px, py + 1, 32, 3, P.black); R(g, px, py + 1, 32, 1, P.blackL);
    // keyboard with a turquoise glow wave and a mug
    for (let i = 0; i < 12; i++) R(g, px + 10 + i, py + 1, 1, 1, Math.floor(t * 10 - i) % 12 === 0 ? P.ice : i % 2 ? P.turqD : P.turq);
    R(g, px + 25, py - 1, 3, 3, P.slateL); R(g, px + 28, py, 1, 1, P.slateL);
    R(g, px + 1, py + 4, 30, 8, P.navyD); R(g, px + 1, py + 4, 30, 1, P.turq);
    R(g, px + 1, py + 4, 2, 10, P.ink); R(g, px + 29, py + 4, 2, 10, P.ink);
  }
  // nível 39 · Terminal de Tubo: an old beige computer with a green CRT and a blinking prompt
  function crt(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 2, py + 1, 12, 12, P.slateD); R(g, px + 2, py + 1, 12, 1, P.slate);
    R(g, px + 2, py - 14, 12, 14, P.beige); R(g, px + 2, py - 14, 12, 1, P.beigeL); R(g, px + 13, py - 13, 1, 13, P.beigeD);
    R(g, px + 3, py - 12, 9, 8, '#03140a'); R(g, px + 3, py - 12, 9, 1, 'rgba(109,255,143,0.2)');
    R(g, px + 4, py - 11, 4, 1, P.green); R(g, px + 4, py - 9, 6, 1, P.greenD); R(g, px + 4, py - 7, 1, 1, P.green);
    if (blink(t, 3)) R(g, px + 6, py - 7, 2, 1, P.green);
    R(g, px + 4, py - 3, 3, 1, P.beigeD); R(g, px + 10, py - 3, 1, 1, blink(t, 0.8) ? '#ffb347' : '#6b4a1e');
    R(g, px + 3, py + 2, 10, 2, P.beigeD); R(g, px + 4, py + 2, 8, 1, P.beige);
  }
  // nível 42 · Fliperama Boot: the DataLab logo on the marquee and a boot game on the screen
  function arcadeBoot(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 15, 2, SHADOW);
    R(g, px + 2, py - 22, 12, 35, P.black); R(g, px + 2, py - 22, 1, 35, P.turqD); R(g, px + 13, py - 22, 1, 35, P.ink);
    R(g, px + 2, py - 22, 12, 6, P.navyD); text(g, 'DL', px + 4, py - 21, blink(t, 3) ? P.ice : P.turq);
    R(g, px + 3, py - 15, 10, 9, P.screen);
    const pct = ((t * 0.5) % 1.2);
    R(g, px + 4, py - 10, 8, 2, P.navyL); R(g, px + 4, py - 10, Math.round(Math.min(1, pct) * 8), 2, pct > 1 ? P.green : P.turq);
    R(g, px + 5, py - 13, 1, 1, P.turqL); R(g, px + 7, py - 13, 1, 1, P.turqL); R(g, px + 9, py - 13, 1, 1, P.turqL);
    R(g, px + 2, py - 5, 12, 3, P.slateD);
    R(g, px + 5, py - 7, 1, 2, P.ink); R(g, px + 4, py - 8, 3, 1, P.turq);
    R(g, px + 9, py - 5, 1, 1, P.ice); R(g, px + 11, py - 5, 1, 1, P.turq);
    R(g, px + 3, py - 1, 10, 13, P.navyD);
    R(g, px + 6, py + 3, 4, 2, P.ink); R(g, px + 7, py + 3, 2, 1, P.turq);
  }
  // nível 46 · Placa Neon "BOOT 001" (wall, 2 tiles)
  function neonBoot(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 23, w = W - 2;
    R(g, x, y, w, 10, P.navyD); R(g, x, y, w, 1, P.navyL);
    const n = Math.floor(t * 12), off = DL.hash(n * 17 + (e.seed || 0)) < 0.05;
    const c = off ? P.turqD : P.turqL, c2 = off ? P.blueD : P.ice;
    text(g, 'BOOT', x + 1, y + 2, c);
    text(g, '001', x + 18, y + 2, c2);
    R(g, x + 1, y + 8, w - 2, 1, off ? P.navyL : 'rgba(45,226,200,0.35)');
  }

  const DRAW = {
    bp_hello: hello, rug_mobo: mobo, bp_led_lamp: ledLamp, bp_coffee8: coffee8, bp_floppy_shelf: floppyShelf, bp_founder_chair: founderChair,
    bp_data_vault: vault, bp_hacker_desk: hackerDesk, bp_crt_terminal: crt, bp_arcade_boot: arcadeBoot, bp_neon_boot: neonBoot,
  };
  const BOUNDS = {
    bp_hello: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 21 }),
    bp_led_lamp: (e) => ({ x: e.px + 4, y: e.py - 21, w: 8, h: 35 }),
    bp_coffee8: (e) => ({ x: e.px + 1, y: e.py - 15, w: 14, h: 30 }),
    bp_floppy_shelf: (e) => ({ x: e.px + 1, y: e.py - 21, w: 14, h: 36 }),
    bp_founder_chair: (e) => ({ x: e.px + 1, y: e.py - 14, w: 14, h: 29 }),
    bp_data_vault: (e) => ({ x: e.px + 1, y: e.py - 11, w: 14, h: 26 }),
    bp_hacker_desk: (e) => ({ x: e.px, y: e.py - 15, w: e.tw * T, h: e.th * T + 15 }),
    bp_crt_terminal: (e) => ({ x: e.px + 1, y: e.py - 15, w: 14, h: 30 }),
    bp_arcade_boot: (e) => ({ x: e.px + 1, y: e.py - 23, w: 14, h: 37 }),
    bp_neon_boot: (e) => ({ x: e.px, y: e.py - 24, w: e.tw * T, h: 12 }),
  };

  const baseDraw = DL.drawItem, baseGeom = DL.itemGeom;
  DL.drawItem = function (g, e, t) {
    const f = DRAW[e.kind];
    if (f) f(g, e, t || 0);
    else baseDraw(g, e, t);
  };
  DL.itemGeom = function (e) {
    baseGeom(e);
    const b = BOUNDS[e.kind];
    if (b) e.bounds = b(e);
    if (e.wall && DRAW[e.kind]) { e.ix = e.px + e.tw * 8; e.iy = e.py + 10; }
  };

  if (DL.DECOR_GLOW) Object.assign(DL.DECOR_GLOW, {
    bp_led_lamp: (e) => [e.px + 8, e.py - 8, 20, P.turq, 0.12],
    bp_neon_boot: (e) => [e.px + e.tw * 8, e.py - 18, 24, P.turq, 0.12],
    bp_arcade_boot: (e) => [e.px + 8, e.py - 12, 16, P.turq, 0.1],
    bp_crt_terminal: (e) => [e.px + 8, e.py - 8, 12, P.green, 0.07],
    bp_hacker_desk: (e) => [e.px + 16, e.py - 8, 22, P.turq, 0.08],
  });

  // build mode → Cosméticos: placed for free once the pass gave the piece (pass: the reward level)
  const it = (id, level, name, desc, o) => Object.assign({ id, cat: 'cosm', group: 'Cosméticos', name, price: 0, cosm: true, pass: level, desc }, o || {});
  for (const d of [
    it('bp_hello', 3, 'Quadro "Hello World"', 'Na parede do fundo: o primeiro programa de todo mundo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
    it('bp_rug_mobo', 7, 'Tapete Placa-Mãe', 'Tapete 2 × 2 com trilhas, chips e slots de uma placa-mãe. Fica por baixo dos móveis.', { kind: 'rug_mobo', w: 2, h: 2, solid: false, rug: true }),
    it('bp_led_lamp', 12, 'Luminária de LED', 'Coluna de LEDs que acende devagar, como um servidor ligando.'),
    it('bp_coffee8', 17, 'Máquina de café 8-bit', 'Quadradona, com fumacinha em pixel.'),
    it('bp_floppy_shelf', 22, 'Estante de disquetes', 'Prateleira com disquetes coloridos.'),
    it('bp_founder_chair', 27, 'Cadeira do Fundador', 'Cadeira gamer preta com detalhes turquesa.'),
    it('bp_data_vault', 32, 'Cofre de dados', 'Cofre de aço com cadeado digital piscando.'),
    it('bp_hacker_desk', 37, 'Mesa hacker', 'Três monitores com código e teclado aceso, 2 tiles.', { w: 2, h: 1 }),
    it('bp_crt_terminal', 39, 'Terminal de tubo', 'Computador antigo de tela verde.'),
    it('bp_arcade_boot', 42, 'Fliperama Boot', 'Com o logo do DataLab no letreiro.'),
    it('bp_neon_boot', 46, 'Placa neon BOOT 001', 'Letreiro neon na parede do fundo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
  ]) {
    (DL.COSM_CATALOG = DL.COSM_CATALOG || []).push(d);
    if (DL.DECOR_NAMES) DL.DECOR_NAMES[d.kind || d.id] = d.name;
  }
})();
