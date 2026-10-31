/* DataLab — trails (Rastros): an effect left on the floor while a character walks, gone after a second or
   two. One trail equipped at a time (inventory slot 'trail'); other players in an online room see it too
   (multiplayer.js sends the trail with the look). The shop sells six simple ones (cosmetics.js, tab
   Rastros); the season pass (battlepass.js) gives seven fancier ones with more motion, glow and colour.
   Particles are born from the distance walked (never from the frame rate) and are capped on screen, so a
   room full of players never slows the game down. A particle is plain numbers: where and when it was
   born and how it moves — its state at any age is computed, so the shop preview draws the same effect
   without simulating anything. Drawn in the scene's underlay (demo.js), under people and furniture. */
(function () {
  'use strict';
  const DL = window.DL;
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const MAX = 220; // particles on screen, all trails together
  const PAL = { turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a', blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0', navy: '#0b1730', navyL: '#1a2b4d', ice: '#b8f3ff', white: '#ffffff' };
  const RAINBOW = ['#ff5a5a', '#ffa23a', '#ffe15a', '#5aff8c', '#4dc3ff', '#9b7bff'];
  const CODE = 'DATALB01<>_';
  const rgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const glyph = (g, ch, x, y, c) => { if (DL.pixText) DL.pixText(g, ch, x, y, c); };

  // p: { x, y, h, vx, vy, vh, gh, life, s (seed 0..1), n (step), flat, f (draw) }
  // pos(p, age) → world x, y and the height above the floor
  function pos(p, age) {
    let h = (p.h || 0) + (p.vh || 0) * age + 0.5 * (p.gh || 0) * age * age;
    if (h < 0) h = 0;
    return [p.x + (p.vx || 0) * age, p.y + (p.vy || 0) * age, h];
  }

  /* ------------------------------------------------------------------ */
  /* The effects. every: world px walked between births; spawn(add,…)    */
  /* adds particles at the feet (x, y) walking along (dx, dy); i counts   */
  /* the steps, r(k) is a seeded random number for that step.            */
  /* ------------------------------------------------------------------ */
  const FX = {
    // ---------- shop: simple ----------
    steps: { every: 7, spawn(add, x, y, dx, dy, i) {
      const side = i % 2 ? 1.6 : -1.6;
      add({ x: x - dy * side, y: y + dx * side, life: 1.5, flat: true, f(g, X, Y, h, k) { R(g, X - 1, Y - 1, 2, 2, rgba(PAL.turq, 0.75 * (1 - k))); R(g, X, Y - 2, 1, 1, rgba(PAL.turqL, 0.6 * (1 - k))); } });
    } },
    dust: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      for (let j = 0; j < 2; j++) add({ x: x + (r(j) - 0.5) * 4, y, h: r(j + 2), vx: (r(j + 4) - 0.5) * 8 - dx * 4, vh: 6 + r(j + 6) * 5, life: 0.9, s: r(j + 8),
        f(g, X, Y, h, k, p) { R(g, X, Y - h, 1, 1, rgba(p.s > 0.5 ? PAL.slateL : '#aab4bf', 0.8 * (1 - k))); } });
    } },
    stars: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x + (r(0) - 0.5) * 8, y: y + (r(1) - 0.5) * 3, h: 1 + r(2) * 4, life: 1.3, s: r(3), f(g, X, Y, h, k, p, t) {
        const a = 1 - k, tw = Math.sin(t * 12 + p.s * 9) > 0.2, c = p.s > 0.5 ? PAL.ice : PAL.blueL;
        R(g, X, Y - h, 1, 1, rgba(c, a));
        if (tw) { R(g, X - 1, Y - h, 3, 1, rgba(c, a * 0.6)); R(g, X, Y - h - 1, 1, 3, rgba(c, a * 0.6)); }
      } });
    } },
    bubbles: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x + (r(0) - 0.5) * 6, y, h: 2, vh: 8 + r(1) * 4, vx: (r(2) - 0.5) * 4, life: 1.4, s: r(3), f(g, X, Y, h, k) {
        const y0 = Y - h;
        if (k > 0.86) { const d = 1 + (k - 0.86) * 20; for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) R(g, X + ox * d, y0 + oy * d, 1, 1, rgba(PAL.ice, 1 - k)); return; }
        R(g, X - 1, y0 - 2, 2, 1, rgba(PAL.blueL, 0.85)); R(g, X - 1, y0 + 1, 2, 1, rgba(PAL.blueL, 0.85));
        R(g, X - 2, y0 - 1, 1, 2, rgba(PAL.blueL, 0.85)); R(g, X + 1, y0 - 1, 1, 2, rgba(PAL.blueL, 0.85));
        R(g, X - 1, y0 - 1, 1, 1, rgba(PAL.white, 0.7));
      } });
    } },
    smoke: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x - dx * 2, y: y - dy * 2, h: 3, vh: 3 + r(0) * 2, vx: -dx * 5 + (r(1) - 0.5) * 3, vy: -dy * 3, life: 1.6, f(g, X, Y, h, k) {
        const s = 2 + Math.round(k * 3);
        R(g, X - s / 2, Y - h - s / 2, s, s - 1, rgba(PAL.slateL, 0.42 * (1 - k)));
        R(g, X - s / 2 + 1, Y - h - s / 2 - 1, s - 1, 1, rgba('#c3ccd9', 0.3 * (1 - k)));
      } });
    } },
    lights: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x + (r(0) - 0.5) * 8, y: y + (r(1) - 0.5) * 2, h: 4 + r(2) * 9, vh: 1.5, life: 2.2, f(g, X, Y, h, k) {
        const a = 1 - k * k;
        R(g, X - 1, Y - h - 1, 3, 3, rgba(PAL.blue, 0.18 * a));
        R(g, X, Y - h, 1, 1, rgba(PAL.blueL, a));
      } });
    } },

    // ---------- season pass: more motion, glow and colour ----------
    binary: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      // a 0 or 1 falls from the air, lands where the foot was and glows there
      add({ x: x + (r(0) - 0.5) * 6, y, h: 14 + r(1) * 5, vh: -26, life: 1.6, s: r(2), f(g, X, Y, h, k, p) {
        const ch = p.s > 0.5 ? '1' : '0', landed = h <= 0, a = landed ? 1 - k : 1;
        if (landed) { R(g, X - 2, Y - 6, 5, 7, rgba(PAL.turq, 0.16 * a)); R(g, X - 2, Y, 5, 1, rgba(PAL.turq, 0.5 * a)); }
        else R(g, X - 1, Y - h - 6, 3, 1, rgba(PAL.turq, 0.25));
        glyph(g, ch, X - 1, Y - h - 5, rgba(landed ? PAL.turqL : PAL.ice, a));
      } });
    } },
    sparks: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      // three hot sparks jump and fall; every few steps a small lightning bolt flickers
      for (let j = 0; j < 3; j++) add({ x, y, h: 1, vx: (r(j) - 0.5) * 50, vy: (r(j + 3) - 0.5) * 16, vh: 24 + r(j + 6) * 20, gh: -140, life: 0.55, s: r(j + 9), f(g, X, Y, h, k, p) {
        const c = p.s > 0.66 ? PAL.white : p.s > 0.33 ? PAL.ice : PAL.turq;
        R(g, X, Y - h, 1, 1, rgba(c, 1 - k * 0.6));
        R(g, X - Math.sign(p.vx), Y - h + 1, 1, 1, rgba(PAL.blueL, 0.5 * (1 - k)));
      } });
      if (i % 3 === 0) add({ x, y, life: 0.22, s: r(12), f(g, X, Y, h, k, p) {
        let px = X;
        for (let s = 0; s < 5; s++) { R(g, px, Y - 2 - s * 2, 1, 2, rgba(s % 2 ? PAL.ice : PAL.white, 0.9)); px += (DL.hash(p.s * 97 + s) > 0.5 ? 1 : -1); }
        R(g, X - 2, Y - 1, 5, 1, rgba(PAL.turq, 0.5));
      } });
    } },
    cables: { every: 9, spawn(add, x, y, dx, dy, i, r) {
      // a coloured wire snakes along the floor behind the feet, then pulls back
      const cols = [PAL.turq, PAL.blue, PAL.blueL, PAL.slateL, PAL.ice];
      add({ x, y, life: 1.8, flat: true, s: r(0), dx, dy, c: cols[Math.floor(r(1) * cols.length)], f(g, X, Y, h, k, p) {
        const grow = Math.min(1, k * 5), shrink = k > 0.7 ? (1 - k) / 0.3 : 1, len = Math.round(10 * grow * shrink);
        for (let s = 0; s < len; s++) {
          const w = Math.round(Math.sin(s * 0.9 + p.s * 6) * 1.6);
          R(g, Math.round(X - p.dx * s - p.dy * w), Math.round(Y - p.dy * s + p.dx * w), 1, 1, p.c);
        }
        if (len > 2) R(g, Math.round(X - 1), Math.round(Y - 1), 2, 2, PAL.slate);
      } });
    } },
    ghost: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      // see-through blue footprints, and a wisp of light rising off each one
      const side = i % 2 ? 1.8 : -1.8, fx = x - dy * side, fy = y + dx * side;
      add({ x: fx, y: fy, life: 2, flat: true, f(g, X, Y, h, k) {
        const a = 1 - k;
        R(g, X - 2, Y - 2, 5, 4, rgba(PAL.blue, 0.14 * a));
        R(g, X - 1, Y - 1, 3, 2, rgba(PAL.blueL, 0.5 * a)); R(g, X, Y - 2, 1, 1, rgba(PAL.ice, 0.6 * a));
      } });
      add({ x: fx, y: fy, h: 1, vh: 7, vx: (r(0) - 0.5) * 3, life: 1.2, f(g, X, Y, h, k) { R(g, X, Y - h, 1, 2, rgba(PAL.turqL, 0.45 * (1 - k))); } });
    } },
    code: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      // turquoise letters rise from the floor like code scrolling up a screen
      add({ x: x + (r(0) - 0.5) * 8, y, h: 1, vh: 11 + r(1) * 4, vx: (r(2) - 0.5) * 3, life: 1.5, s: r(3), f(g, X, Y, h, k, p) {
        const ch = CODE[Math.floor(p.s * CODE.length)], c = k < 0.2 ? PAL.ice : k < 0.6 ? PAL.turq : PAL.turqD;
        R(g, X - 2, Y - h - 6, 5, 7, rgba(PAL.turq, 0.1 * (1 - k)));
        glyph(g, ch, X - 1, Y - h - 5, rgba(c, 1 - k * k));
      } });
    } },
    glitch: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      // the floor "fails": bands of colour jump sideways and flicker where the feet were
      for (let j = 0; j < 2; j++) add({ x: x + (r(j) - 0.5) * 6, y: y + (r(j + 2) - 0.5) * 4, life: 0.85, flat: true, s: r(j + 4), f(g, X, Y, h, k, p, t) {
        const n = Math.floor(t * 22 + p.s * 50);
        if (DL.hash(n * 7) > 0.78) return; // flicker
        const off = Math.round((DL.hash(n * 13) - 0.5) * 5), w = 4 + Math.round(p.s * 8), a = 1 - k;
        R(g, X - w / 2 + off, Y, w, 1, rgba(p.s > 0.5 ? PAL.turq : PAL.blue, 0.8 * a));
        R(g, X - w / 2 - off, Y + 1, Math.max(2, w - 3), 1, rgba(PAL.navyL, 0.9 * a));
        if (DL.hash(n * 31) > 0.6) R(g, X + off + 2, Y - 1, 2, 1, rgba(PAL.white, 0.7 * a));
      } });
    } },
    rainbow: { every: 2, spawn(add, x, y, dx, dy, i, r) {
      // a pixel rainbow ribbon that waves a little, with sparkles now and then
      add({ x, y, life: 1.4, s: i, f(g, X, Y, h, k, p, t) {
        const a = 1 - k, lift = 3 + Math.round(Math.sin(t * 5 + p.s * 0.6));
        for (let c = 0; c < 6; c++) R(g, X, Y - lift - c, 2, 1, rgba(RAINBOW[5 - c], 0.9 * a));
      } });
      if (i % 6 === 0) add({ x: x + (r(0) - 0.5) * 6, y, h: 4 + r(1) * 8, vh: 4, life: 0.9, s: r(2), f(g, X, Y, h, k, p, t) {
        const a = 1 - k;
        R(g, X, Y - h, 1, 1, rgba(PAL.white, a));
        if (Math.sin(t * 16 + p.s * 9) > 0) { R(g, X - 1, Y - h, 3, 1, rgba(PAL.ice, a * 0.7)); R(g, X, Y - h - 1, 1, 3, rgba(PAL.ice, a * 0.7)); }
      } });
    } },
  };
  DL.TRAIL_FX = FX;

  // draws one particle: flat ones in the floor's space (base), the others standing up at their spot
  function drawP(g, sc, base, p, now) {
    const age = now - p.born, k = age / p.life;
    if (k < 0 || k >= 1) return;
    const [x, y, h] = pos(p, age);
    if (p.flat) { if (base) g.setTransform(base); }
    else if (sc && sc.iso) sc.actorSpace(g, { x, y, z: 0 });
    p.f(g, Math.round(x), Math.round(y), Math.round(h), k, p, now);
  }

  /* ------------------------------------------------------------------ */
  /* The live system (demo.js creates it)                               */
  /* ------------------------------------------------------------------ */
  DL.createTrails = function (game) {
    const scene = game.scene, player = game.player;
    const list = [];
    const track = new WeakMap(); // actor → { x, y, d (distance since the last birth), i (steps) }
    let clock = 0;
    // whose trail: mine (the inventory) or another player's (their look, multiplayer.js)
    function trailOf(a) {
      if (a === player) { const id = DL.Skins && DL.Skins.equipped.trail, it = id && DL.cosmetic(id); return it ? it.value : null; }
      const look = a.remotePlayer && a.remotePlayer.look;
      return look && FX[look.trail] ? look.trail : null;
    }
    function feed(a, kind, dt) {
      let s = track.get(a);
      if (!s) { s = { x: a.x, y: a.y, d: 0, i: 0 }; track.set(a, s); }
      const mx = a.x - s.x, my = a.y - s.y, d = Math.hypot(mx, my);
      s.x = a.x; s.y = a.y;
      // only walking leaves a trail (not a teleport, a seat or standing still)
      if (!kind || !a.moving || a.hidden || a.seated || d > 30 || !(dt > 0)) { s.d = 0; return; }
      const fx = FX[kind];
      s.d += d;
      const dx = d ? mx / d : 0, dy = d ? my / d : 0;
      while (s.d >= fx.every) {
        s.d -= fx.every;
        s.i++;
        const seed = (s.i * 131 + (a === player ? 7 : 3)) % 9973;
        fx.spawn((p) => {
          p.born = clock;
          if (list.length >= MAX) list.shift(); // the oldest goes first: never more than MAX
          list.push(p);
        }, a.x, a.y, dx, dy, s.i, (k) => DL.hash(seed + k * 17.3));
      }
    }
    function update(dt) {
      if (dt > 0) clock += dt;
      // me (not in scene.actors) and the other players in an online room
      if (player) feed(player, trailOf(player), dt);
      for (const a of scene.actors) if (a.remotePlayer) feed(a, trailOf(a), dt);
      // drop the ones that are over (they are ordered by birth, almost: trim from the front)
      while (list.length && clock - list[0].born > list[0].life) list.shift();
      for (let i = list.length - 1; i >= 0; i--) if (clock - list[i].born > list[i].life) list.splice(i, 1);
    }
    // the scene's underlay (iso: g is in the floor's space)
    function draw(g, sc) {
      if (!list.length) return;
      const base = g.getTransform();
      for (const p of list) drawP(g, sc, base, p, clock);
      g.setTransform(base);
    }
    return { update, draw, get count() { return list.length; }, MAX };
  };

  /* ------------------------------------------------------------------ */
  /* Shop / inventory preview: the player walks across the card leaving  */
  /* the trail, on a loop (nothing is simulated: births are computed)    */
  /* ------------------------------------------------------------------ */
  const LOOP = 2.6, X0 = 4, X1 = 44, GY = 40;
  DL.drawTrailPreview = function (g, kind, t, sheet) {
    const fx = FX[kind];
    if (!fx) return;
    const speed = (X1 - X0) / LOOP, cyc = Math.floor(t / LOOP), now = t - cyc * LOOP;
    const at = (tau) => X0 + speed * tau;
    // floor line
    R(g, 2, GY + 1, 44, 1, 'rgba(127,178,240,0.12)');
    // births of this pass and of the previous one (still fading)
    for (const back of [1, 0]) {
      const n = Math.floor((X1 - X0) / fx.every);
      for (let i = 1; i <= n; i++) {
        const tau = (i * fx.every) / speed, born = tau - back * LOOP;
        if (born > now) break;
        const seed = (i * 131 + (cyc - back) * 17) % 9973;
        fx.spawn((p) => { p.born = born; if (now - born < p.life) drawP(g, null, null, p, now); }, at(tau), GY, 1, 0, i, (k) => DL.hash(seed + k * 17.3));
      }
    }
    // the walker on top
    if (sheet && sheet.right && sheet.right.walk) {
      const C = DL.CHAR, f = sheet.right.walk[Math.floor(now * 8) % sheet.right.walk.length];
      g.drawImage(f, Math.round(at(now)) - C.AX, GY - C.AY);
    }
  };
})();
