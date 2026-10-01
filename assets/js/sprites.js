/* DataLab — pixel sprites drawn procedurally (no external assets).
   Every coordinate here is in world pixels; the scene scales them up. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const T = (DL.T = 16);

  const C = (DL.C = {
    outline: '#06070a',
    ok: '#7ee0a1',
    okDim: '#1f4a35',
    warn: '#ff7a17',
    warnDim: '#4a210a',
    warnSoft: '#ffc285',
    breeze: '#a0c3ec',
    breezeDim: '#24384f',
    twilight: '#c4b5fd',
    dusk: '#7c3aed',
    midnight: '#0d1726',
    port: '#10141a',
    screenInk: '#3d5a80',
  });

  function R(g, x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  }
  DL.R = R;

  function hash(n) {
    n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  DL.hash = hash;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const ch = (v) => Math.round((t - v) * p + v);
    const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  DL.shade = shade;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  DL.mk = mk;

  const blink = (t, hz, phase) => Math.sin((t * hz + phase) * Math.PI * 2) > 0;
  const flick = (t, seed, rate) => hash(Math.floor(t * rate) * 7919 + seed) > 0.42;
  DL.blink = blink;

  /* ------------------------------------------------------------------ */
  /* Characters — chunky head, short body: original "lobby + RPG" mix.   */
  /* ------------------------------------------------------------------ */
  const FW = 22, FH = 31, AX = 11, AY = 29;
  DL.CHAR = { FW, FH, AX, AY };

  function drawChar(g, dir, pose, L, closed) {
    const ax = AX, ay = AY;
    const side = dir === 'right';
    const bob = pose === 'pass' ? -1 : 0;
    const skinD = shade(L.skin, -0.16);
    const shirt = L.shirt, shirtD = shade(shirt, -0.3), shirtL = shade(shirt, 0.14);
    const pantsD = shade(L.pants, -0.35);
    const shoeD = shade(L.shoes, -0.4);
    const hair = L.hair, hairD = shade(hair, -0.35), hairL = shade(hair, 0.22);
    const eye = '#121218';
    const blush = 'rgba(224,110,100,0.45)';

    const leg = (x, dy, col) => {
      R(g, x, ay - 6 + dy, 3, 4, col);
      R(g, x, ay - 2 + dy, 3, 1, L.shoes);
      R(g, x, ay - 1 + dy, 3, 1, shoeD);
    };

    // legs
    if (!side) {
      const lDy = pose === 'B' ? -1 : 0;
      const rDy = pose === 'A' ? -1 : 0;
      leg(ax - 3, lDy, L.pants);
      leg(ax, rDy, L.pants);
      R(g, ax - 1, ay - 6 + lDy, 1, 4, pantsD);
    } else {
      let back = ax - 2, front = ax - 1;
      if (pose === 'A') { back = ax - 4; front = ax + 1; }
      if (pose === 'B') { back = ax + 1; front = ax - 4; }
      leg(back, 0, pantsD);
      leg(front, 0, L.pants);
      R(g, front + 3, ay - 2, 1, 1, L.shoes);
      R(g, front + 3, ay - 1, 1, 1, shoeD);
    }

    // torso + arms
    const ty = ay - 13 + bob;
    if (!side) {
      const sw = pose === 'A' ? -1 : pose === 'B' ? 1 : 0;
      R(g, ax - 4, ty, 8, 8, shirt);
      R(g, ax - 4, ty, 1, 8, shirtL);
      R(g, ax + 3, ty, 1, 8, shirtD);
      R(g, ax - 4, ty + 7, 8, 1, shirtD);
      const arm = (x, dy) => {
        R(g, x, ty + 1 + dy, 2, 5, shirt);
        R(g, x, ty + 1 + dy, 2, 1, shirtL);
        R(g, x, ty + 6 + dy, 2, 2, L.skin);
        R(g, x, ty + 7 + dy, 2, 1, skinD);
      };
      arm(ax - 6, sw);
      arm(ax + 4, -sw);
      R(g, ax + 5, ty + 1 - sw, 1, 5, shirtD);
      if (dir === 'down') {
        R(g, ax - 2, ty, 4, 1, shirtD);
        if (L.vest) {
          R(g, ax - 4, ty + 1, 2, 6, L.vest);
          R(g, ax + 2, ty + 1, 2, 6, L.vest);
          R(g, ax - 4, ty + 4, 8, 1, shade(L.vest, 0.35));
        }
        if (L.lanyard) {
          R(g, ax - 2, ty + 1, 1, 2, L.lanyard);
          R(g, ax + 1, ty + 1, 1, 2, L.lanyard);
        }
        if (L.badge) {
          R(g, ax - 2, ty + 3, 4, 3, '#f1f1ee');
          R(g, ax - 2, ty + 3, 4, 1, L.badge);
        }
      } else {
        R(g, ax - 3, ty, 6, 2, shirtD);
        if (L.vest) R(g, ax - 4, ty + 3, 8, 1, shade(L.vest, 0.35));
      }
    } else {
      const sw = pose === 'A' ? 1 : pose === 'B' ? -1 : 0;
      R(g, ax - 3, ty, 6, 8, shirt);
      R(g, ax - 3, ty, 1, 8, shirtD);
      R(g, ax + 2, ty, 1, 8, shirtL);
      R(g, ax - 3, ty + 7, 6, 1, shirtD);
      if (L.vest) R(g, ax - 3, ty + 4, 6, 1, shade(L.vest, 0.35));
      if (L.badge) R(g, ax + 2, ty + 3, 1, 2, L.badge);
      R(g, ax - 1 + sw, ty + 1, 2, 5, shirt);
      R(g, ax - 2 + sw, ty + 1, 1, 5, shirtD);
      R(g, ax - 1 + sw, ty + 1, 2, 1, shirtL);
      R(g, ax - 1 + sw, ty + 6, 2, 2, L.skin);
    }

    // head
    const hy = ay - 23 + bob;
    R(g, ax - 4, hy, 8, 10, L.skin);
    R(g, ax - 5, hy + 1, 10, 8, L.skin);
    R(g, ax - 4, hy + 9, 8, 1, skinD);
    if (dir === 'down') {
      R(g, ax + 4, hy + 2, 1, 6, skinD);
      if (closed) {
        R(g, ax - 3, hy + 6, 2, 1, eye);
        R(g, ax + 1, hy + 6, 2, 1, eye);
      } else {
        R(g, ax - 3, hy + 5, 1, 2, eye);
        R(g, ax + 2, hy + 5, 1, 2, eye);
      }
      R(g, ax - 4, hy + 7, 1, 1, blush);
      R(g, ax + 3, hy + 7, 1, 1, blush);
      R(g, ax - 1, hy + 8, 2, 1, skinD);
    } else if (side) {
      if (closed) R(g, ax + 2, hy + 6, 2, 1, eye);
      else R(g, ax + 2, hy + 5, 1, 2, eye);
      R(g, ax + 3, hy + 7, 1, 1, blush);
      R(g, ax + 5, hy + 5, 1, 2, L.skin);
      R(g, ax - 1, hy + 5, 1, 2, skinD);
    }

    // hair
    const H = (x, y, w, h, c) => R(g, ax + x, hy + y, w, h, c || hair);
    const style = L.hairStyle;
    if (style === 'short' || style === 'bun' || style === 'long') {
      if (dir === 'down') {
        H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-5, 3, 1, 3); H(4, 3, 1, 3);
        H(-4, 3, 3, 1); H(1, 3, 2, 1); H(-3, 0, 4, 1, hairL);
      } else if (dir === 'up') {
        H(-4, -1, 8, 1); H(-5, 0, 10, 8); H(-4, 8, 8, 1, hairD); H(-3, 0, 4, 1, hairL);
      } else {
        H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-5, 3, 5, 4); H(-4, 7, 3, 1, hairD);
        H(1, 3, 3, 1); H(-2, 0, 4, 1, hairL);
      }
      if (style === 'bun') {
        if (side) { H(-7, 0, 3, 3); H(-7, 0, 2, 1, hairL); }
        else { H(-2, -4, 4, 3); H(-1, -4, 2, 1, hairL); }
      }
      if (style === 'long') {
        if (dir === 'down') { H(-6, 2, 2, 10); H(4, 2, 2, 10); }
        else if (dir === 'up') { H(-5, 8, 10, 4); H(-6, 2, 1, 9); H(5, 2, 1, 9); }
        else { H(-6, 2, 4, 10); H(-6, 11, 4, 1, hairD); }
      }
    } else if (style === 'cap') {
      const cap = L.cap, capD = shade(cap, -0.3), capL = shade(cap, 0.22);
      if (dir === 'down') {
        H(-5, 3, 1, 3); H(4, 3, 1, 3);
        H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-3, 0, 3, 1, capL); H(-5, 3, 10, 1, capD);
      } else if (dir === 'up') {
        H(-5, 3, 10, 5); H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-2, 3, 4, 1, capD);
      } else {
        H(-5, 3, 4, 4); H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-2, 0, 3, 1, capL); H(1, 3, 6, 1, capD);
      }
    } else if (style === 'curly') {
      const dots = () => { for (let i = 0; i < 6; i++) H(-5 + i * 2, -1 + (i % 2), 1, 1, hairL); };
      if (dir === 'down') {
        H(-5, -2, 10, 2); H(-6, -1, 12, 4); H(-6, 3, 2, 4); H(4, 3, 2, 4); H(-4, 3, 2, 1); H(2, 3, 2, 1);
      } else if (dir === 'up') {
        H(-5, -2, 10, 2); H(-6, -1, 12, 9);
      } else {
        H(-5, -2, 10, 2); H(-6, -1, 12, 4); H(-6, 3, 6, 5); H(2, 3, 2, 1);
      }
      dots();
    }

    if (L.headset) {
      const hs = '#2b2f38';
      H(-4, -2, 8, 1, hs);
      if (dir === 'down') { H(-6, 4, 2, 3, hs); H(4, 4, 2, 3, hs); H(-5, 7, 1, 1, hs); H(-4, 8, 2, 1, C.twilight); }
      else if (dir === 'up') { H(-6, 4, 2, 3, hs); H(4, 4, 2, 3, hs); }
      else { H(-2, 4, 2, 3, hs); H(0, 7, 3, 1, hs); H(3, 7, 1, 1, C.twilight); }
    }
  }

  function outline(src) {
    const s = mk(FW, FH), sg = s.getContext('2d');
    sg.drawImage(src, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = C.outline;
    sg.fillRect(0, 0, FW, FH);
    const o = mk(FW, FH), og = o.getContext('2d');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) og.drawImage(s, dx, dy);
    og.drawImage(src, 0, 0);
    return o;
  }

  function mirror(src) {
    const c = mk(FW, FH), g = c.getContext('2d');
    g.translate(FW, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  const POSES = ['A', 'pass', 'B', 'pass'];

  DL.makeSheet = function (L) {
    const build = (dir, pose, closed) => {
      const c = mk(FW, FH);
      drawChar(c.getContext('2d'), dir, pose, L, closed);
      return outline(c);
    };
    const sheet = {};
    for (const d of ['down', 'up', 'right']) {
      const pass = build(d, 'pass', false);
      sheet[d] = {
        idle: build(d, 'idle', false),
        blink: build(d, 'idle', true),
        walk: POSES.map((p) => (p === 'pass' ? pass : build(d, p, false))),
      };
    }
    sheet.left = {
      idle: mirror(sheet.right.idle),
      blink: mirror(sheet.right.blink),
      walk: sheet.right.walk.map(mirror),
    };
    return sheet;
  };

  // S = device pixels per world pixel; positions snap to device pixels, not world pixels,
  // so characters glide smoothly while every sprite pixel stays crisp.
  DL.drawActor = function (g, a, S) {
    const x = Math.round(a.x * S) / S;
    const y = Math.round(a.y * S) / S;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(x - 4, y - 2, 8, 1);
    g.fillRect(x - 5, y - 1, 10, 1);
    g.fillRect(x - 4, y, 8, 1);
    g.drawImage(a.frame(), x - AX, y - AY);
  };

  /* ------------------------------------------------------------------ */
  /* Equipment                                                          */
  /* ------------------------------------------------------------------ */
  function ledState(state, t, k) {
    if (state === 'warn') return { pwr: C.ok, act: blink(t, 1.4, k * 0.13) ? C.warn : C.warnDim };
    if (state === 'off') return { pwr: '#1b2027', act: '#1b2027' };
    return { pwr: C.ok, act: flick(t, k, 7 + (k % 5)) ? C.breeze : C.breezeDim };
  }

  function rackBody(g, px, py, tag) {
    R(g, px + 1, py + 14, 15, 2, 'rgba(0,0,0,0.35)');
    R(g, px, py - 24, 16, 6, '#272c35');
    R(g, px, py - 24, 16, 1, '#343b46');
    R(g, px + 3, py - 22, 10, 1, '#1d2129');
    R(g, px + 3, py - 20, 10, 1, '#1d2129');
    if (tag) R(g, px + 12, py - 23, 3, 2, tag);
    R(g, px, py - 18, 16, 32, '#181c22');
    R(g, px, py - 18, 1, 32, '#252b34');
    R(g, px + 15, py - 18, 1, 32, '#0b0d11');
    R(g, px + 2, py - 16, 12, 28, '#0c0f13');
    R(g, px + 1, py + 13, 14, 1, '#0b0d11');
  }

  function servers(g, px, py, e, t, start, count, state) {
    for (let i = 0; i < count; i++) {
      const k = start + i, uy = py - 15 + k * 3;
      if (hash(e.seed * 97 + k) < 0.14) {
        R(g, px + 3, uy, 10, 2, '#101318');
        continue;
      }
      R(g, px + 3, uy, 10, 2, '#1c222b');
      R(g, px + 3, uy, 10, 1, '#262d38');
      R(g, px + 4, uy + 1, 5, 1, '#141920');
      const s = ledState(state, t, e.seed * 13 + k);
      R(g, px + 10, uy, 1, 1, s.pwr);
      R(g, px + 12, uy, 1, 1, s.act);
    }
  }

  function switchUnit(g, x, y, e, t, down) {
    R(g, x, y, 12, 5, '#2a313b');
    R(g, x, y, 12, 1, '#39414d');
    R(g, x, y + 4, 12, 1, '#1e242c');
    for (let i = 0; i < 8; i++) {
      for (let r = 0; r < 2; r++) {
        const on = flick(t, e.seed * 13 + i * 3 + r, 5 + (i % 4));
        R(g, x + 1 + i, y + 1 + r * 2, 1, 1, down ? C.port : on ? C.ok : C.okDim);
      }
    }
    const up = down ? blink(t, 1.2, 0) : flick(t, e.seed + 99, 9);
    R(g, x + 10, y + 1, 1, 3, down ? (up ? C.warn : C.warnDim) : up ? C.breeze : C.breezeDim);
  }

  const CABLES = [C.breeze, C.twilight, '#6b8fc7', C.breeze, '#8b7fd6', C.twilight, '#6b8fc7', C.breeze];

  function drawRack(g, e, t) {
    const px = e.px, py = e.py;
    rackBody(g, px, py, e.tag);
    switch (e.kind) {
      case 'rack':
        servers(g, px, py, e, t, 0, 9, e.state);
        break;
      case 'storage':
        for (let k = 0; k < 9; k++) {
          const uy = py - 15 + k * 3;
          R(g, px + 3, uy, 10, 2, '#1a2029');
          for (let j = 0; j < 5; j++) {
            R(g, px + 3 + j * 2, uy, 1, 2, '#262d38');
            if (flick(t, e.seed * 31 + k * 5 + j, 4 + j)) R(g, px + 4 + j * 2, uy, 1, 1, C.breeze);
          }
        }
        break;
      case 'switch': {
        const down = e.state === 'down';
        const sy = py - 15;
        switchUnit(g, px + 2, sy, e, t, down);
        for (let i = 0; i < 8; i++) {
          const len = 2 + ((i * 5) % 4);
          R(g, px + 3 + i, sy + 5, 1, len, down ? shade(CABLES[i], -0.45) : CABLES[i]);
        }
        // uplink fibre: plugged in it runs up out of the rack, unplugged it hangs loose
        if (down) {
          R(g, px + 12, sy + 5, 1, 3, C.warnSoft);
          R(g, px + 13, sy + 8, 1, 3, C.warnSoft);
          R(g, px + 13, sy + 11, 1, 1, C.warn);
        } else {
          R(g, px + 12, sy - 3, 1, 4, C.warnSoft);
        }
        R(g, px + 3, py - 5, 10, 3, '#1f252e');
        for (let i = 0; i < 5; i++) R(g, px + 4 + i * 2, py - 4, 1, 1, '#0b0e12');
        servers(g, px, py, e, t, 6, 3, down ? 'warn' : 'ok');
        break;
      }
      case 'router': {
        for (let u = 0; u < 2; u++) {
          const y = py - 14 + u * 6;
          R(g, px + 3, y, 10, 4, '#232932');
          R(g, px + 3, y, 10, 1, '#2f3641');
          R(g, px + 4, y + 1, 2, 2, C.warnSoft);
          for (let j = 0; j < 4; j++) R(g, px + 8 + j, y + 2, 1, 1, flick(t, e.seed + u * 9 + j, 6) ? C.ok : C.okDim);
        }
        for (let k = 0; k < 4; k++) {
          R(g, px + 3, py - 1 + k * 3, 10, 2, '#12161b');
          R(g, px + 4, py + k * 3, 8, 1, '#0d1014');
        }
        break;
      }
      case 'core': {
        for (let c = 0; c < 2; c++) {
          const y = py - 15 + c * 13;
          R(g, px + 3, y, 10, 11, '#20262e');
          R(g, px + 3, y, 10, 1, '#2d343e');
          for (let r = 0; r < 4; r++) {
            const ry = y + 2 + r * 2;
            R(g, px + 4, ry, 8, 1, '#141920');
            for (let j = 0; j < 4; j++) {
              const isB = e.coreLinkDown && c === 0 && r === 1 && j === 1;
              const on = flick(t, e.seed * 7 + c * 50 + r * 8 + j, 6 + r);
              R(g, px + 4 + j * 2, ry, 1, 1, isB ? (blink(t, 1.2, 0.2) ? C.warn : C.warnDim) : on ? C.ok : C.okDim);
            }
          }
        }
        break;
      }
    }
    R(g, px + 13, py - 3, 1, 4, '#3a414c');
  }

  function screen(g, x, y, w, h, t, seed, alert) {
    R(g, x, y, w, h, C.midnight);
    R(g, x + 1, y + 1, 4, 1, C.screenInk);
    if (alert && blink(t, 1, 0)) R(g, x, y, w, 1, C.warn);
    for (let i = 0; i < w; i++) {
      const v = (Math.sin(i * 0.9 + t * 2 + seed) + 1) / 2;
      R(g, x + i, y + h - 1 - Math.round(v * (h - 3)), 1, 1, alert && i > w - 4 ? C.warn : C.breeze);
    }
  }

  function drawDesk(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 14, 30, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 2, py + 6, 2, 8, '#15181d');
    R(g, px + 28, py + 6, 2, 8, '#15181d');
    R(g, px, py - 4, 32, 9, '#2a2e36');
    R(g, px, py - 4, 32, 1, '#383d47');
    R(g, px, py + 5, 32, 2, '#1d2027');
    for (let m = 0; m < 2; m++) {
      const mx = px + 4 + m * 13;
      R(g, mx + 4, py - 6, 3, 3, '#16191f');
      R(g, mx, py - 16, 11, 10, '#0c0e12');
      screen(g, mx + 1, py - 15, 9, 7, t, e.seed + m * 3, e.alert && m === 0);
      R(g, mx, py - 3, 11, 1, 'rgba(160,195,236,0.08)');
    }
    R(g, px + 10, py - 1, 11, 2, '#3c424c');
    R(g, px + 10, py - 1, 11, 1, '#4a515d');
    R(g, px + 24, py, 2, 2, '#4a515d');
    R(g, px + 2, py - 2, 3, 3, '#d9d9d6');
    R(g, px + 2, py - 2, 3, 1, '#5a3a25');
  }

  function drawChair(g, e) {
    const x = e.cx, y = e.cy;
    R(g, x - 4, y - 1, 8, 1, 'rgba(0,0,0,0.3)');
    R(g, x - 1, y - 4, 2, 3, '#121418');
    R(g, x - 4, y - 2, 8, 1, '#15171c');
    R(g, x - 5, y - 8, 10, 4, '#262a33');
    R(g, x - 5, y - 13, 10, 6, '#1d2028');
    R(g, x - 5, y - 13, 10, 1, '#2c313b');
  }

  function drawCrac(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 14, 15, 2, 'rgba(0,0,0,0.35)');
    R(g, px, py - 24, 16, 6, '#4a515c');
    R(g, px, py - 24, 16, 1, '#5a626e');
    R(g, px, py - 18, 16, 32, '#363c46');
    R(g, px, py - 18, 1, 32, '#424955');
    R(g, px + 15, py - 18, 1, 32, '#262a31');
    R(g, px + 3, py - 16, 10, 5, C.midnight);
    R(g, px + 4, py - 14, 2, 2, C.breeze);
    R(g, px + 7, py - 15, 5, 1, C.screenInk);
    R(g, px + 7, py - 13, 4, 1, C.screenInk);
    for (let i = 0; i < 10; i++) R(g, px + 2, py - 9 + i * 2, 12, 1, '#272c34');
    R(g, px + 12, py - 16, 1, 1, C.ok);
    // cold air drifting into the aisle
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.55 + k * 0.27 + e.seed * 0.1) % 1;
      const a = 0.4 * Math.sin(ph * Math.PI);
      g.fillStyle = 'rgba(160,195,236,' + a.toFixed(3) + ')';
      g.fillRect(Math.round(px - 2 - ph * 22), py - 6 + k * 4, 3, 1);
    }
  }

  function drawUps(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 14, 31, 2, 'rgba(0,0,0,0.35)');
    R(g, px, py - 20, 32, 6, '#2a2f38');
    R(g, px, py - 20, 32, 1, '#363c46');
    R(g, px, py - 14, 32, 28, '#1a1e25');
    R(g, px, py - 14, 1, 28, '#262c35');
    R(g, px + 31, py - 14, 1, 28, '#0c0e12');
    R(g, px + 15, py - 14, 1, 28, '#0f1216');
    R(g, px + 3, py - 11, 10, 6, C.midnight);
    const wave = Math.floor((t * 2) % 5);
    for (let i = 0; i < 4; i++) R(g, px + 4 + i * 2, py - 9, 1, 3, i === wave ? '#c9f5da' : C.ok);
    for (let i = 0; i < 6; i++) R(g, px + 18, py - 10 + i * 3, 11, 1, '#121519');
    R(g, px + 3, py - 2, 1, 1, C.ok);
    R(g, px + 5, py - 2, 1, 1, flick(t, 77, 3) ? C.breeze : C.breezeDim);
    for (let i = 0; i < 3; i++) R(g, px + 3, py + 1 + i * 4, 10, 3, '#22272f');
  }

  function drawPlant(g, e) {
    const px = e.px, py = e.py;
    const L1 = '#2c5f45', L2 = '#3c8059', L3 = '#58a578';
    R(g, px + 3, py + 13, 11, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 7, py - 10, 2, 13, L1);
    R(g, px + 2, py - 6, 5, 3, L2); R(g, px + 9, py - 8, 5, 3, L2);
    R(g, px + 3, py - 1, 4, 3, L1); R(g, px + 10, py - 2, 4, 3, L1);
    R(g, px + 5, py - 12, 3, 3, L2); R(g, px + 8, py - 13, 3, 3, L3);
    R(g, px + 6, py - 4, 4, 3, L2);
    R(g, px + 3, py - 6, 2, 1, L3); R(g, px + 11, py - 8, 2, 1, L3);
    R(g, px + 4, py + 3, 8, 10, '#2d323b');
    R(g, px + 4, py + 3, 8, 1, '#3d434d');
    R(g, px + 5, py + 4, 6, 1, '#1a1d22');
    R(g, px + 11, py + 4, 1, 9, '#24282f');
  }

  function drawGlass(g, e) {
    const x = e.px + 7, top = e.py - 12;
    R(g, x, top, 3, 16, 'rgba(160,195,236,0.10)');
    R(g, x, top, 1, 16, 'rgba(220,235,255,0.16)');
    if (e.capTop) R(g, x - 1, top - 1, 5, 1, '#2a3039');
    if (e.capBottom) R(g, x - 1, top + 16, 5, 1, '#2a3039');
  }

  DL.drawItem = function (g, e, t) {
    switch (e.kind) {
      case 'rack': case 'switch': case 'router': case 'core': case 'storage': drawRack(g, e, t); break;
      case 'desk': drawDesk(g, e, t); break;
      case 'chair': drawChair(g, e); break;
      case 'crac': drawCrac(g, e, t); break;
      case 'ups': drawUps(g, e, t); break;
      case 'plant': drawPlant(g, e); break;
      case 'glass': drawGlass(g, e); break;
    }
  };

  // Sprite bounds (for selection brackets / labels) and the spot the player stands to interact.
  DL.itemGeom = function (e) {
    const px = e.px, py = e.py;
    e.ix = px + e.tw * 8;
    e.iy = py + e.th * T + 7;
    switch (e.kind) {
      case 'desk': e.bounds = { x: px - 1, y: py - 17, w: 34, h: 32 }; break;
      case 'crac': e.bounds = { x: px - 1, y: py - 25, w: 18, h: 41 }; break;
      case 'ups': e.bounds = { x: px - 1, y: py - 21, w: 34, h: 37 }; break;
      case 'plant': e.bounds = { x: px + 1, y: py - 14, w: 14, h: 30 }; break;
      case 'videowall':
        e.bounds = { x: 31, y: 5, w: 116, h: 26 };
        e.ix = 88; e.iy = 40;
        break;
      default: e.bounds = { x: px - 1, y: py - 25, w: 18, h: 41 };
    }
  };

  /* ------------------------------------------------------------------ */
  /* Static floor + walls, rendered once                                */
  /* ------------------------------------------------------------------ */
  function pool(g, x, y, r, col) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  DL.pool = pool;

  function floorTile(g, px, py, perf) {
    R(g, px, py, 16, 16, '#10151c');
    R(g, px + 1, py + 1, 15, 15, perf ? '#17202a' : '#151a22');
    R(g, px + 1, py + 1, 15, 1, perf ? '#1c2633' : '#1a202a');
    if (perf) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) R(g, px + 3 + i * 3, py + 3 + j * 3, 1, 1, '#0c1118');
    } else {
      for (const [a, b] of [[2, 2], [13, 2], [2, 13], [13, 13]]) R(g, px + a, py + b, 1, 1, '#1f2632');
    }
  }

  function carpet(g, px, py, x, y) {
    R(g, px, py, 16, 16, '#101219');
    R(g, px, py + 15, 16, 1, '#0d0f15');
    for (let i = 0; i < 7; i++) {
      const h1 = hash(x * 131 + y * 71 + i * 17), h2 = hash(x * 37 + y * 113 + i * 29);
      R(g, px + Math.floor(h1 * 16), py + Math.floor(h2 * 15), 1, 1, '#151824');
    }
  }

  DL.renderStatic = function (w) {
    const c = mk(w.W * T, w.H * T), g = c.getContext('2d');
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        const t = w.tiles[y * w.W + x], px = x * T, py = y * T;
        if (t === '#') continue;
        if (t === '_') carpet(g, px, py, x, y);
        else if (t === 'g') {
          carpet(g, px, py, x, y);
          floorTile(g, px + 8, py, false);
          R(g, px + 7, py, 3, 16, '#1c2129');
        } else if (t === 'd') {
          floorTile(g, px, py, false);
          R(g, px, py, 8, 16, '#11141b');
        } else floorTile(g, px, py, t === ',');
      }
    }
    // door posts
    R(g, 10 * T + 6, 9 * T - 1, 5, 2, '#2a3039');
    R(g, 10 * T + 6, 11 * T - 1, 5, 2, '#2a3039');

    // north wall: cap + face
    for (let x = 0; x < w.W; x++) {
      const px = x * T, noc = x < 10;
      R(g, px, 0, 16, 5, '#0b0c10');
      R(g, px, 5, 16, 1, '#242832');
      R(g, px, 6, 16, 26, noc ? '#14161d' : '#171b22');
      R(g, px, 6, 1, 26, noc ? '#121419' : '#14171d');
      R(g, px, 28, 16, 1, '#1d2028');
      R(g, px, 29, 16, 3, '#101217');
      R(g, px, 32, 16, 2, 'rgba(0,0,0,0.25)');
    }
    // partition header on the wall
    R(g, 10 * T + 6, 6, 5, 26, '#1d222a');
    // cable tray + lamps on hall wall
    R(g, 11 * T, 8, 18 * T, 1, '#2f4566');
    R(g, 11 * T, 9, 18 * T, 2, '#262b34');
    R(g, 11 * T, 11, 18 * T, 1, '#111318');
    for (const lx of [13, 17, 21, 25]) {
      R(g, lx * T + 4, 17, 8, 2, '#dfe7f2');
      R(g, lx * T + 4, 19, 8, 1, '#7f8a9c');
    }
    // side + south walls
    R(g, 0, 0, 16, w.H * T, '#0b0c10');
    R(g, 15, 6, 1, (w.H - 1) * T - 6, '#20242c');
    R(g, (w.W - 1) * T, 0, 16, w.H * T, '#0b0c10');
    R(g, (w.W - 1) * T, 6, 1, (w.H - 1) * T - 6, '#20242c');
    R(g, 0, (w.H - 1) * T, w.W * T, 16, '#0b0c10');
    R(g, 16, (w.H - 1) * T, (w.W - 2) * T, 1, '#20242c');

    // baked light pools
    g.globalCompositeOperation = 'lighter';
    for (const lx of [13, 17, 21, 25]) for (const ly of [3.4, 8.5, 13.4, 17.4]) pool(g, lx * T + 8, ly * T, 54, 'rgba(160,195,236,0.045)');
    for (const [lx, ly] of [[4, 8], [7, 13], [5, 16]]) pool(g, lx * T, ly * T, 72, 'rgba(255,194,133,0.03)');
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  /* NOC video wall (lives on the north wall, animated) */
  DL.drawVideoWall = function (g, t, inc) {
    const x0 = 34, y0 = 9;
    R(g, x0 - 2, y0 - 2, 112, 22, '#07080a');
    const link = C.screenInk;
    for (let p = 0; p < 3; p++) {
      const x = x0 + p * 36, y = y0, w = 34, h = 18;
      R(g, x, y, w, h, '#0b1422');
      R(g, x + 2, y + 2, 10, 1, link);
      if (p === 0) {
        const bCol = inc ? (blink(t, 1.2, 0) ? C.warn : C.warnDim) : C.ok;
        R(g, x + 17, y + 6, 1, 3, link);
        R(g, x + 17, y + 11, 1, 1, link);
        R(g, x + 9, y + 12, 9, 1, link);
        R(g, x + 18, y + 12, 7, 1, inc ? C.warnDim : link);
        R(g, x + 9, y + 13, 1, 1, link);
        R(g, x + 25, y + 13, 1, 1, inc ? C.warnDim : link);
        R(g, x + 16, y + 4, 3, 2, C.ok);
        R(g, x + 16, y + 9, 3, 2, C.ok);
        R(g, x + 8, y + 14, 3, 2, C.ok);
        R(g, x + 24, y + 14, 3, 2, bCol);
        R(g, x + 17, y + 6 + Math.floor((t * 5) % 3), 1, 1, '#ffffff');
        const pk = Math.floor((t * 7) % 9);
        R(g, x + 9 + pk, y + 12, 1, 1, '#ffffff');
      } else if (p === 1) {
        R(g, x + 26, y + 2, 6, 1, inc ? C.warn : link);
        for (let i = 0; i < 30; i++) {
          const ph = i * 0.55 - t * 1.6;
          let v = 0.5 + 0.3 * Math.sin(ph) + 0.15 * Math.sin(ph * 2.7 + 1);
          const cut = inc && i >= 20;
          if (cut) v *= 0.3;
          const hh = 1 + Math.round(v * 10);
          R(g, x + 2 + i, y + 16 - hh, 1, hh, cut ? 'rgba(255,122,23,0.18)' : 'rgba(160,195,236,0.14)');
          R(g, x + 2 + i, y + 16 - hh, 1, 1, cut ? C.warn : C.breeze);
        }
      } else {
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 4; c++) {
            const cx = x + 2 + c * 8, cy = y + 5 + r * 4;
            const bad = inc && r === 1;
            R(g, cx, cy, 6, 3, bad ? (blink(t, 1.2, c * 0.1) ? '#5a2a0c' : '#2e1608') : '#1d3b2d');
            R(g, cx, cy, 2, 1, bad ? C.warn : flick(t, r * 4 + c, 2) ? C.ok : '#2c5a44');
          }
        }
      }
    }
    R(g, x0 - 2, y0 + 20, 112, 1, '#1b1f27');
  };
})();
