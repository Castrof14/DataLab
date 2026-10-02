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

  // Coil of patch cable, worn on the shoulder by network technicians.
  function coil(g, x, y, c) {
    R(g, x, y, 3, 1, c);
    R(g, x, y + 2, 3, 1, c);
    R(g, x, y + 1, 1, 1, c);
    R(g, x + 2, y + 1, 1, 1, c);
  }

  // Clothing details layered on the base torso (new characters only; legacy looks have no outfit).
  function outfitDetails(g, dir, ty, L, shirt, shirtD, shirtL) {
    const ax = AX, o = L.outfit;
    if (!o || o === 'tee') return;
    const white = '#e9e9e6';
    if (o === 'uniform') {
      // work uniform: collar in the role colour and a reflective stripe
      const rc = L.roleColor || '#dadbdf', strip = '#d9dde3';
      if (dir === 'down') { R(g, ax - 2, ty, 4, 1, rc); R(g, ax - 3, ty, 1, 1, shade(rc, -0.3)); R(g, ax + 2, ty, 1, 1, shade(rc, -0.3)); R(g, ax - 4, ty + 6, 8, 1, strip); R(g, ax - 4, ty + 6, 1, 1, rc); R(g, ax + 3, ty + 6, 1, 1, rc); }
      else if (dir === 'up') { R(g, ax - 3, ty, 6, 1, rc); R(g, ax - 4, ty + 6, 8, 1, strip); R(g, ax - 2, ty + 2, 4, 2, shade(shirt, -0.18)); }
      else { R(g, ax, ty, 3, 1, rc); R(g, ax - 3, ty + 6, 6, 1, strip); }
      return;
    }
    if (dir === 'down') {
      if (o === 'shirt') { R(g, ax - 2, ty, 1, 2, shirtL); R(g, ax + 1, ty, 1, 2, shirtL); }
      if (o === 'hoodie') { R(g, ax - 3, ty, 6, 1, shirtD); R(g, ax - 3, ty + 5, 6, 2, shirtD); R(g, ax - 3, ty + 5, 6, 1, shade(shirt, -0.45)); }
      if (o === 'blazer') { R(g, ax - 1, ty, 2, 7, white); R(g, ax - 2, ty, 1, 4, shirtD); R(g, ax + 1, ty, 1, 4, shirtD); }
    } else if (dir === 'up') {
      if (o === 'hoodie') { R(g, ax - 4, ty, 8, 3, shirtD); R(g, ax - 3, ty, 6, 1, shirtL); }
      if (o === 'shirt') R(g, ax - 3, ty, 6, 1, shirtL);
    } else {
      if (o === 'hoodie') { R(g, ax - 3, ty, 3, 3, shirtD); }
      if (o === 'blazer') R(g, ax + 1, ty, 1, 6, white);
      if (o === 'shirt') R(g, ax + 1, ty, 1, 1, shirtL);
    }
  }

  // Role gear: what makes each job readable at sprite scale.
  function roleGear(g, dir, ty, L, sit) {
    const ax = AX, c = L.roleColor || '#ffffff';
    switch (L.role) {
      case 'redes':
        if (dir === 'down') coil(g, ax + 3, ty, c);
        else if (dir === 'up') coil(g, ax - 6, ty, c);
        else coil(g, ax - 2, ty + 1, c);
        break;
      case 'servidores':
        if (sit) break;
        if (dir === 'right') { R(g, ax - 3, ty + 6, 6, 1, '#6b5233'); R(g, ax - 3, ty + 6, 2, 2, '#8a6a42'); }
        else {
          R(g, ax - 4, ty + 6, 8, 1, '#6b5233');
          if (dir === 'down') { R(g, ax + 1, ty + 6, 2, 2, '#8a6a42'); R(g, ax - 3, ty + 6, 1, 2, '#9aa3b0'); }
        }
        break;
      case 'sysadmin':
        if (sit) break;
        if (dir === 'down') { R(g, ax + 6, ty + 2, 2, 6, '#3a3f49'); R(g, ax + 6, ty + 2, 2, 1, '#7d8187'); R(g, ax + 7, ty + 3, 1, 4, c); }
        else if (dir === 'up') { R(g, ax - 8, ty + 2, 2, 6, '#3a3f49'); R(g, ax - 8, ty + 2, 2, 1, '#7d8187'); }
        else { R(g, ax - 3, ty + 3, 6, 2, '#3a3f49'); R(g, ax - 3, ty + 3, 6, 1, '#7d8187'); }
        break;
      case 'seguranca':
        if (dir === 'right') R(g, ax - 1, ty + 1, 2, 1, c);
        else { R(g, ax - 6, ty + 1, 2, 1, c); R(g, ax + 4, ty + 1, 2, 1, c); }
        if (sit) break;
        if (dir === 'down') { R(g, ax + 2, ty + 5, 2, 3, '#121418'); R(g, ax + 3, ty + 3, 1, 2, '#121418'); R(g, ax + 2, ty + 5, 1, 1, C.warn); }
        else if (dir === 'right') { R(g, ax - 3, ty + 5, 2, 3, '#121418'); R(g, ax - 3, ty + 3, 1, 2, '#121418'); }
        break;
      case 'gerente':
        if (dir === 'down') {
          R(g, ax - 1, ty, 2, 1, shade(c, -0.35));
          R(g, ax - 1, ty + 1, 2, 4, c);
          R(g, ax - 1, ty + 5, 1, 1, c);
          R(g, ax, ty + 1, 1, 4, shade(c, -0.2));
        } else if (dir === 'right') R(g, ax + 2, ty + 1, 1, 3, c);
        break;
    }
  }

  function drawChar(g, dir, pose, L, closed) {
    const ax = AX, ay = AY;
    const side = dir === 'right';
    const sit = pose.indexOf('sit') === 0;
    const bob = pose === 'pass' ? -1 : sit ? 4 : 0;
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

    // legs (hidden by the desk or chair while seated)
    if (sit) {
      // no legs
    } else if (!side) {
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
      if (!sit) {
        arm(ax - 6, sw);
        arm(ax + 4, -sw);
        R(g, ax + 5, ty + 1 - sw, 1, 5, shirtD);
      } else if (dir === 'down') {
        // facing the viewer: upper arms at the sides, hands forward on the keyboard
        const ly = pose === 'sitA' ? -1 : 0, ry = pose === 'sitB' ? -1 : 0;
        R(g, ax - 6, ty + 1, 2, 5, shirt);
        R(g, ax - 6, ty + 1, 2, 1, shirtL);
        R(g, ax + 4, ty + 1, 2, 5, shirt);
        R(g, ax + 4, ty + 1, 2, 1, shirtL);
        R(g, ax + 5, ty + 1, 1, 5, shirtD);
        R(g, ax - 5, ty + 6 + ly, 2, 2, L.skin);
        R(g, ax - 5, ty + 7 + ly, 2, 1, skinD);
        R(g, ax + 3, ty + 6 + ry, 2, 2, L.skin);
        R(g, ax + 3, ty + 7 + ry, 2, 1, skinD);
      } else {
        // seen from behind: elbows out, alternating as the hands type
        const ly = pose === 'sitA' ? -1 : 0, ry = pose === 'sitB' ? -1 : 0;
        R(g, ax - 6, ty + 1 + ly, 2, 4, shirt);
        R(g, ax - 6, ty + 1 + ly, 2, 1, shirtL);
        R(g, ax - 7, ty + 3 + ly, 1, 2, shirtD);
        R(g, ax + 4, ty + 1 + ry, 2, 4, shirt);
        R(g, ax + 4, ty + 1 + ry, 2, 1, shirtL);
        R(g, ax + 6, ty + 3 + ry, 1, 2, shirtD);
      }
      if (dir === 'down') {
        R(g, ax - 2, ty, 4, 1, shirtD);
        outfitDetails(g, dir, ty, L, shirt, shirtD, shirtL);
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
        outfitDetails(g, dir, ty, L, shirt, shirtD, shirtL);
        if (L.vest) R(g, ax - 4, ty + 3, 8, 1, shade(L.vest, 0.35));
      }
      if (L.body === 'f') {
        g.clearRect(ax - 4, ty + 4, 1, 2);
        g.clearRect(ax + 3, ty + 4, 1, 2);
      }
    } else {
      const sw = pose === 'A' ? 1 : pose === 'B' ? -1 : 0;
      R(g, ax - 3, ty, 6, 8, shirt);
      R(g, ax - 3, ty, 1, 8, shirtD);
      R(g, ax + 2, ty, 1, 8, shirtL);
      R(g, ax - 3, ty + 7, 6, 1, shirtD);
      outfitDetails(g, dir, ty, L, shirt, shirtD, shirtL);
      if (L.vest) R(g, ax - 3, ty + 4, 6, 1, shade(L.vest, 0.35));
      if (L.badge) R(g, ax + 2, ty + 3, 1, 2, L.badge);
      R(g, ax - 1 + sw, ty + 1, 2, 5, shirt);
      R(g, ax - 2 + sw, ty + 1, 1, 5, shirtD);
      R(g, ax - 1 + sw, ty + 1, 2, 1, shirtL);
      R(g, ax - 1 + sw, ty + 6, 2, 2, L.skin);
    }
    if (L.role) roleGear(g, dir, ty, L, sit);

    // head (a seated worker glancing at the side monitor shifts it a pixel)
    const hx = ax + (pose === 'sitL' && dir === 'up' ? 1 : 0);
    const hy = ay - 23 + bob;
    const look = pose === 'sitL' && dir === 'down' ? 1 : 0;
    R(g, hx - 4, hy, 8, 10, L.skin);
    R(g, hx - 5, hy + 1, 10, 8, L.skin);
    R(g, hx - 4, hy + 9, 8, 1, skinD);
    if (dir === 'down') {
      R(g, ax + 4, hy + 2, 1, 6, skinD);
      if (closed) {
        R(g, ax - 3, hy + 6, 2, 1, eye);
        R(g, ax + 1, hy + 6, 2, 1, eye);
      } else {
        R(g, ax - 3 + look, hy + 5, 1, 2, eye);
        R(g, ax + 2 + look, hy + 5, 1, 2, eye);
        if (L.body === 'f') {
          R(g, ax - 4 + look, hy + 5, 1, 1, eye);
          R(g, ax + 3 + look, hy + 5, 1, 1, eye);
        }
      }
      R(g, ax - 4, hy + 7, 1, 1, blush);
      R(g, ax + 3, hy + 7, 1, 1, blush);
      R(g, ax - 1, hy + 8, 2, 1, skinD);
    } else if (side) {
      if (closed) R(g, ax + 2, hy + 6, 2, 1, eye);
      else {
        R(g, ax + 2, hy + 5, 1, 2, eye);
        if (L.body === 'f') R(g, ax + 3, hy + 4, 1, 1, eye);
      }
      R(g, ax + 3, hy + 7, 1, 1, blush);
      R(g, ax + 5, hy + 5, 1, 2, L.skin);
      R(g, ax - 1, hy + 5, 1, 2, skinD);
    }
    if (L.beard) {
      if (dir === 'down') {
        R(g, ax - 5, hy + 5, 1, 4, hairD);
        R(g, ax + 4, hy + 5, 1, 4, hairD);
        R(g, ax - 4, hy + 8, 8, 2, hair);
        R(g, ax - 1, hy + 8, 2, 1, hairD);
      } else if (side) {
        R(g, ax, hy + 6, 1, 3, hairD);
        R(g, ax, hy + 8, 5, 2, hair);
      } else {
        R(g, hx - 5, hy + 5, 1, 4, hairD);
        R(g, hx + 4, hy + 5, 1, 4, hairD);
      }
    }
    if (L.body === 'm' && !closed) {
      if (dir === 'down') {
        R(g, ax - 3 + look, hy + 4, 2, 1, hairD);
        R(g, ax + 1 + look, hy + 4, 2, 1, hairD);
      } else if (side) R(g, ax + 2, hy + 4, 2, 1, hairD);
    }

    // hair
    const H = (x, y, w, h, c) => R(g, hx + x, hy + y, w, h, c || hair);
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
    } else if (style === 'buzz') {
      if (dir === 'down') { H(-4, 0, 8, 1); H(-5, 1, 10, 1); H(-5, 2, 1, 2); H(4, 2, 1, 2); H(-2, 0, 3, 1, hairL); }
      else if (dir === 'up') { H(-4, 0, 8, 1); H(-5, 1, 10, 6); H(-4, 7, 8, 1, hairD); H(-2, 0, 3, 1, hairL); }
      else { H(-4, 0, 8, 1); H(-5, 1, 10, 1); H(-5, 2, 4, 4); H(-1, 0, 3, 1, hairL); }
    } else if (style === 'ponytail') {
      if (dir === 'down') {
        H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-5, 3, 1, 2); H(4, 3, 1, 2); H(-4, 3, 2, 1); H(-3, 0, 4, 1, hairL);
      } else if (dir === 'up') {
        H(-4, -1, 8, 1); H(-5, 0, 10, 7); H(-4, 7, 8, 1, hairD); H(-1, 6, 2, 1, L.roleColor || hairL); H(-1, 7, 2, 6); H(-1, 12, 2, 1, hairD); H(-3, 0, 4, 1, hairL);
      } else {
        H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-5, 3, 4, 3); H(-7, 2, 2, 7); H(-7, 8, 2, 1, hairD); H(-5, 3, 1, 1, L.roleColor || hairL); H(-2, 0, 4, 1, hairL);
      }
    } else if (style === 'afro') {
      if (dir === 'down') { H(-5, -3, 10, 2); H(-7, -1, 14, 4); H(-7, 3, 2, 5); H(5, 3, 2, 5); H(-4, 3, 2, 1); H(2, 3, 2, 1); }
      else if (dir === 'up') { H(-5, -3, 10, 2); H(-7, -1, 14, 10); H(-6, 9, 12, 1, hairD); }
      else { H(-5, -3, 10, 2); H(-7, -1, 13, 4); H(-7, 3, 7, 6); H(2, 3, 2, 1); }
      for (let i = 0; i < 5; i++) H(-5 + i * 2 + (i % 2), -2 + (i % 2), 1, 1, hairL);
    } else if (style === 'bob') {
      if (dir === 'down') { H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-6, 2, 2, 7); H(4, 2, 2, 7); H(-4, 3, 3, 1); H(-6, 8, 2, 1, hairD); H(4, 8, 2, 1, hairD); H(-3, 0, 4, 1, hairL); }
      else if (dir === 'up') { H(-4, -1, 8, 1); H(-5, 0, 10, 9); H(-6, 2, 1, 7); H(5, 2, 1, 7); H(-5, 8, 10, 1, hairD); H(-3, 0, 4, 1, hairL); }
      else { H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-6, 2, 6, 7); H(1, 3, 3, 1); H(-6, 8, 6, 1, hairD); H(-2, 0, 4, 1, hairL); }
    }

    // hats sit on top of any hairstyle
    if (L.hat === 'cap') {
      const cap = L.capColor || '#3b4250', capD = shade(cap, -0.3), capL = shade(cap, 0.22);
      if (dir === 'down') { H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-3, 0, 3, 1, capL); H(-5, 3, 10, 1, capD); }
      else if (dir === 'up') { H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-2, 3, 4, 1, capD); }
      else { H(-4, -1, 8, 1, cap); H(-5, 0, 10, 3, cap); H(-2, 0, 3, 1, capL); H(1, 3, 6, 1, capD); }
    } else if (L.hat === 'beanie') {
      const b = L.capColor || '#3b4250', bD = shade(b, -0.3), bL = shade(b, 0.2);
      H(-4, -2, 8, 1, b); H(-5, -1, 10, 3, b); H(-5, 2, 10, 2, bD);
      for (let i = 0; i < 5; i++) H(-4 + i * 2, 2, 1, 2, b);
      H(-3, -1, 3, 1, bL);
    }
    if (L.glasses) {
      const f = '#1c1f26', lens = 'rgba(160,195,236,0.35)';
      if (dir === 'down') {
        R(g, ax - 4, hy + 4, 8, 1, f);
        R(g, ax - 4, hy + 5, 1, 2, f); R(g, ax - 1, hy + 5, 1, 1, f); R(g, ax, hy + 5, 1, 1, f); R(g, ax + 3, hy + 5, 1, 2, f);
        R(g, ax - 4, hy + 7, 3, 1, f); R(g, ax + 1, hy + 7, 3, 1, f);
        R(g, ax - 2, hy + 5, 1, 1, lens); R(g, ax + 1, hy + 5, 1, 1, lens);
      } else if (side) {
        R(g, ax + 1, hy + 4, 4, 1, f); R(g, ax + 1, hy + 7, 3, 1, f); R(g, ax + 4, hy + 5, 1, 2, f);
        R(g, ax - 2, hy + 5, 3, 1, f); R(g, ax + 3, hy + 5, 1, 1, lens);
      } else {
        R(g, hx - 5, hy + 5, 1, 1, f); R(g, hx + 4, hy + 5, 1, 1, f);
      }
    }

    if (L.earrings && !L.headset) {
      const gold = '#f2c14e';
      if (dir === 'down') { R(g, ax - 6, hy + 7, 1, 2, gold); R(g, ax + 5, hy + 7, 1, 2, gold); }
      else if (side) R(g, ax - 1, hy + 7, 1, 2, gold);
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

  // Seated frames for a workstation: A/B = typing hands, R = resting, L = glancing at the side screen.
  DL.makeSitSheet = function (L) {
    const build = (dir, pose, closed) => {
      const c = mk(FW, FH);
      drawChar(c.getContext('2d'), dir, pose, L, closed);
      return outline(c);
    };
    const set = (dir) => ({ A: build(dir, 'sitA'), B: build(dir, 'sitB'), R: build(dir, 'sitR'), L: build(dir, 'sitL'), blink: build(dir, 'sitR', true) });
    return { down: set('down'), up: set('up') };
  };

  // S = device pixels per world pixel; positions snap to device pixels, not world pixels,
  // so characters glide smoothly while every sprite pixel stays crisp.
  DL.drawActor = function (g, a, S) {
    const x = Math.round(a.x * S) / S;
    const y = Math.round(a.y * S) / S;
    const alpha = a.alpha == null ? 1 : a.alpha;
    if (alpha < 1) g.globalAlpha = alpha;
    if (!a.noShadow) {
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(x - 4, y - 2, 8, 1);
      g.fillRect(x - 5, y - 1, 10, 1);
      g.fillRect(x - 4, y, 8, 1);
    }
    g.drawImage(a.frame(), x - AX, y - AY);
    if (alpha < 1) g.globalAlpha = 1;
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

  // What a screen shows while someone works at it — one look per role.
  function workScreen(g, x, y, w, h, t, mode, seed, typing) {
    R(g, x, y, w, h, C.midnight);
    switch (mode) {
      case 'net': {
        R(g, x + 1, y + 1, 3, 1, C.screenInk);
        for (let i = 0; i < w; i++) {
          const v = (Math.sin(i * 0.8 - t * 3 + seed) + 1) / 2;
          R(g, x + i, y + h - 1 - Math.round(v * (h - 3)), 1, 1, C.breeze);
        }
        R(g, x + Math.floor((t * 7 + seed) % w), y + 1, 1, 1, '#ffffff');
        break;
      }
      case 'srv':
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < Math.floor(w / 3); c++) {
            R(g, x + 1 + c * 3, y + 1 + r * 2, 2, 1, '#1d2a3c');
            R(g, x + 1 + c * 3, y + 1 + r * 2, 1, 1, flick(t, seed * 5 + r * 7 + c, 3 + c) ? C.ok : C.okDim);
          }
        }
        R(g, x + 1, y + h - 1, Math.floor(((t * 0.4 + seed) % 1) * (w - 2)) + 1, 1, C.warnSoft);
        break;
      case 'code': {
        const off = Math.floor(t * (typing ? 1.6 : 0.3));
        const rows = Math.floor((h - 1) / 2) + 1;
        for (let j = 0; j < rows; j++) {
          const k = off + j;
          let len = 2 + Math.floor(hash(seed * 31 + k) * (w - 3));
          if (j === rows - 1) len = Math.max(1, Math.min(len, Math.floor(((t * (typing ? 6 : 1)) % 1) * len) + 1));
          R(g, x + 1 + (k % 3 === 0 ? 0 : 1), y + 1 + j * 2, len, 1, k % 4 === 0 ? C.twilight : k % 3 === 0 ? C.ok : '#5a7398');
        }
        if (blink(t, 1.6, 0)) R(g, x + w - 2, y + h - 2, 1, 1, '#ffffff');
        break;
      }
      case 'cam': {
        const cw = Math.floor((w - 1) / 2), chh = Math.floor((h - 1) / 2);
        for (let k = 0; k < 4; k++) {
          const cx = x + (k % 2) * (cw + 1), cy = y + Math.floor(k / 2) * (chh + 1);
          R(g, cx, cy, cw, chh, '#132033');
          const ph = (t * (0.3 + k * 0.07) + k * 0.31 + seed * 0.1) % 1;
          R(g, cx + Math.floor(ph * cw), cy + chh - 2, 1, 1, k === 2 ? C.warnSoft : '#c9d6e8');
        }
        if (blink(t, 1, 0)) R(g, x + w - 1, y, 1, 1, C.warn);
        break;
      }
      case 'doc': {
        R(g, x + 1, y, w - 2, h, '#1c2534');
        const n = Math.floor(t * (typing ? 1.2 : 0.2) + seed) % 4;
        for (let j = 0; j < Math.floor(h / 2); j++) {
          const len = j === n ? Math.floor(((t * 2) % 1) * (w - 4)) + 1 : 3 + Math.floor(hash(seed + j * 13) * (w - 6));
          R(g, x + 2, y + 1 + j * 2, len, 1, '#8ea3c2');
        }
        break;
      }
      case 'kpi': {
        for (let i = 0; i < 4; i++) {
          const v = 0.35 + 0.5 * (Math.sin(t * 0.7 + i * 1.3 + seed) + 1) / 2;
          const hh = Math.max(1, Math.round(v * (h - 2)));
          R(g, x + 1 + i * 2, y + h - hh, 1, hh, i === 3 ? C.ok : C.breeze);
        }
        R(g, x + 1, y + 1, 3, 1, C.screenInk);
        break;
      }
      default:
        screen(g, x, y, w, h, t, seed, false);
    }
  }
  DL.workScreen = workScreen;

  function idleScreen(g, x, y, w, h, t, seed) {
    R(g, x, y, w, h, '#080c14');
    R(g, x + 1, y + 1, 2, 1, '#152238');
    if (blink(t, 0.4, seed * 0.1)) R(g, x + w - 2, y + h - 2, 1, 1, C.breezeDim);
  }

  // optional desk/table top colour (furniture styles); default = the classic grey
  const topCols = (c, base) => (c ? [c, shade(c, 0.16), shade(c, -0.3)] : base);

  // Workstation setups: where the monitors stand (front view, relative to the desk), which one shows
  // the work, and where the computer goes. Every setup has its own PC (tower under or on the desk).
  const SETUPS = {
    mono1: { mons: [[10, -17, 13, 11]], main: 0, tower: 'under' },
    mono2: { mons: [[4, -16, 11, 10], [17, -16, 11, 10]], main: 0, tower: 'under' },
    mono3: { mons: [[0, -15, 10, 9], [11, -16, 10, 10], [22, -15, 10, 9]], main: 1, tower: 'under' },
    mono4: { mons: [[4, -27, 12, 10], [16, -27, 12, 10], [4, -16, 12, 10], [16, -16, 12, 10]], main: 2, tower: 'under', arm: true, tall: true },
    gamer: { mons: [[3, -18, 26, 12]], main: 0, tower: 'rgbUnder', curved: true, rgb: true },
    gamerpc: { mons: [[1, -16, 11, 10], [13, -16, 11, 10]], main: 0, tower: 'rgbTop', rgb: true },
    tech: { mons: [[15, -16, 12, 10]], main: 0, tower: 'under', laptop: 1, tools: true },
    noc: { mons: [[5, -28, 22, 10], [0, -15, 10, 9], [11, -16, 10, 10], [22, -15, 10, 9]], main: 2, tower: 'under', arm: true, tall: true, side: ['kpi', 'net', null, 'cam'] },
    admin: { mons: [[10, -16, 11, 10], [22, -16, 10, 10]], main: 0, tower: 'under', laptop: 0, docs: true },
    support: { mons: [[10, -16, 13, 10]], main: 0, tower: 'under', phone: true },
  };
  DL.DESK_SETUPS = SETUPS;
  const setupOf = (e) => SETUPS[e.setup] || SETUPS.mono2;

  function drawTower(g, e, px, py, kind, t, back) {
    if (kind === 'rgbTop') {
      // glass-side gaming tower standing on the desk
      const x = px + 25, y = py - 18;
      R(g, x, y, 7, 14, '#101216');
      R(g, x, y, 7, 1, '#2a2e36');
      R(g, x + 1, y + 2, 5, 10, '#0a0b10');
      const hue = (t * 60 + (e.seed || 0) * 20) % 360;
      R(g, x + 1, y + 2, 5, 1, 'hsl(' + hue + ',90%,60%)');
      R(g, x + 2, y + 5, 3, 3, 'hsl(' + ((hue + 120) % 360) + ',90%,55%)');
      R(g, x + 1, y + 11, 5, 1, 'hsl(' + ((hue + 240) % 360) + ',90%,60%)');
      return;
    }
    // under the desk, by the right leg (left one when seen from behind)
    const x = back ? px + 5 : px + 21, y = py + 5;
    R(g, x, y, 7, 9, '#14171c');
    R(g, x, y, 7, 1, '#262a31');
    R(g, x + 6, y, 1, 9, '#0d0f13');
    if (kind === 'rgbUnder') {
      const hue = (t * 60 + (e.seed || 0) * 20) % 360;
      R(g, x + 1, y + 2, 4, 6, 'hsla(' + hue + ',90%,55%,0.55)');
      R(g, x - 2, y + 9, 11, 1, 'hsla(' + hue + ',90%,60%,0.35)');
    } else {
      R(g, x + 1, y + 2, 4, 1, '#2c313a');
      R(g, x + 1, y + 4, 4, 1, '#2c313a');
      R(g, x + 4, y + 7, 1, 1, e.work ? C.ok : C.okDim);
    }
  }

  function drawDeskTop(g, e) {
    const px = e.px, py = e.py;
    const [top, topL, topD] = topCols(e.color, ['#2a2e36', '#383d47', '#1d2027']);
    R(g, px + 1, py + 14, 30, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 2, py + 6, 2, 8, '#15181d');
    R(g, px + 28, py + 6, 2, 8, '#15181d');
    R(g, px, py - 4, 32, 9, top);
    R(g, px, py - 4, 32, 1, topL);
    R(g, px, py + 5, 32, 2, topD);
  }

  function drawDeskBack(g, e, t) {
    // rotated: the worker sits on the far side, facing the viewer
    const px = e.px, py = e.py, S = setupOf(e);
    drawDeskTop(g, e);
    if (S.tower !== 'rgbTop') drawTower(g, e, px, py, S.tower, t, true);
    R(g, px + 11, py - 4, 10, 2, '#3c424c');
    R(g, px + 11, py - 4, 10, 1, '#4a515d');
    if (S.arm) R(g, px + 15, py - 28, 2, 24, '#16191f');
    for (const [mx0, my, mw, mh] of S.mons) {
      const mx = px + 32 - mx0 - mw; // mirrored
      R(g, mx + Math.floor(mw / 2) - 1, py - 5, 3, 3, '#16191f');
      R(g, mx, py + my + 2, mw, mh, '#1a1d23');
      R(g, mx, py + my + 2, mw, 1, '#262a31');
      R(g, mx + 1, py + my + 4, mw - 2, 1, '#20242b');
      if (e.work) R(g, mx - 1, py + my + 2, 1, mh - 1, 'rgba(160,195,236,0.28)');
    }
    if (S.tower === 'rgbTop') drawTower(g, e, px - 24, py, 'rgbTop', t, true);
    if (S.laptop != null) { R(g, px + 22, py - 3, 8, 5, '#2b3039'); R(g, px + 22, py - 3, 8, 1, '#3a404b'); }
    if (S.rgb) R(g, px, py + 6, 32, 1, 'hsla(' + ((t * 60) % 360) + ',90%,60%,0.6)');
    if (!S.tools) { R(g, px + 2, py + 1, 3, 3, '#d9d9d6'); R(g, px + 2, py + 1, 3, 1, '#5a3a25'); }
  }

  function drawDesk(g, e, t) {
    if (e.rot === 1) return drawDeskBack(g, e, t);
    const px = e.px, py = e.py, S = setupOf(e);
    drawDeskTop(g, e);
    if (S.tower !== 'rgbTop') drawTower(g, e, px, py, S.tower, t, false);
    if (S.arm) { R(g, px + 15, py - 28, 2, 25, '#16191f'); R(g, px + 13, py - 4, 6, 2, '#16191f'); }
    S.mons.forEach(([mx0, my, mw, mh], m) => {
      const mx = px + mx0, y = py + my;
      if (!S.arm || my > -20) R(g, mx + Math.floor(mw / 2) - 1, py - 6, 3, 3, '#16191f');
      R(g, mx, y, mw, mh, '#0c0e12');
      if (S.curved) { R(g, mx - 1, y + 1, 1, mh - 2, '#0c0e12'); R(g, mx + mw, y + 1, 1, mh - 2, '#0c0e12'); }
      const sx = mx + 1, sy = y + 1, sw = mw - 2, sh = mh - 3;
      const alertOn = e.alert && m === (S.main === 0 ? 1 % S.mons.length : 0);
      if (e.work && m === (e.alert && S.mons.length > 1 ? (S.main + 1) % S.mons.length : S.main)) workScreen(g, sx, sy, sw, sh, t, e.work, e.seed, e.typing);
      else if (e.work && S.side && S.side[m]) workScreen(g, sx, sy, sw, sh, t, S.side[m], e.seed + m, false);
      else screen(g, sx, sy, sw, sh, t, e.seed + m * 3, alertOn);
      R(g, mx, py - 3, mw, 1, 'rgba(160,195,236,0.08)');
      if (S.rgb) R(g, mx, y + mh - 1, mw, 1, 'hsla(' + ((t * 60 + m * 90) % 360) + ',90%,60%,0.7)');
    });
    if (S.tower === 'rgbTop') drawTower(g, e, px, py, 'rgbTop', t, false);
    if (S.laptop != null) {
      // laptop on the desk: open lid with its own little screen
      const lx = S.laptop ? px + 2 : px + 1;
      R(g, lx, py - 10, 9, 7, '#20242b');
      R(g, lx + 1, py - 9, 7, 5, e.work ? '#13233a' : '#0b1220');
      if (e.work) R(g, lx + 2, py - 8, 1 + Math.floor((t * 3) % 5), 1, C.breeze);
      R(g, lx - 1, py - 3, 11, 2, '#3a404b');
    }
    // keyboard + mouse (RGB on gaming setups)
    R(g, px + 10, py - 1, 11, 2, S.rgb ? '#1a1c22' : '#3c424c');
    R(g, px + 10, py - 1, 11, 1, S.rgb ? 'hsla(' + ((t * 80) % 360) + ',90%,60%,0.8)' : '#4a515d');
    R(g, px + 24, py, 2, 2, '#4a515d');
    if (S.phone) {
      // desk phone (left) and a headset on its stand (right); the line light blinks while on a call
      R(g, px + 1, py - 4, 7, 5, '#1d2027');
      R(g, px + 2, py - 5, 5, 2, '#2c313a');
      R(g, px + 6, py - 3, 1, 1, e.work && Math.floor(t * 3) % 2 ? C.ok : '#3a404b');
      R(g, px + 26, py - 10, 1, 8, '#2c313a');
      R(g, px + 24, py - 11, 5, 2, '#14171c');
      R(g, px + 24, py - 9, 2, 3, '#14171c');
      R(g, px + 25, py - 2, 3, 1, '#2c313a');
    } else if (S.tools) {
      // multimeter + cable coil
      R(g, px + 2, py - 3, 4, 5, '#d8b23a');
      R(g, px + 3, py - 2, 2, 1, '#1a1d23');
      R(g, px + 27, py - 2, 4, 3, '#2a5d8a');
      R(g, px + 28, py - 1, 2, 1, '#14171c');
    } else if (S.docs) {
      R(g, px + 26, py - 3, 5, 4, '#e8e8e4');
      R(g, px + 27, py - 2, 3, 1, '#8a8f99');
    } else if (!S.laptop && S.tower !== 'rgbTop') {
      R(g, px + 2, py - 2, 3, 3, '#d9d9d6');
      R(g, px + 2, py - 2, 3, 1, '#5a3a25');
    }
  }

  function drawChair(g, e) {
    const x = e.cx, y = e.cy;
    if (e.variant === 'gamer' || e.variant === 'exec') return drawChairStyled(g, e, x, y);
    if (e.color) {
      // same shape, coloured upholstery
      const c = e.color, d = shade(c, -0.3), l = shade(c, 0.18);
      R(g, x - 4, y - 1, 8, 1, 'rgba(0,0,0,0.3)');
      R(g, x - 1, y - 4, 2, 3, '#121418');
      R(g, x - 4, y - 2, 8, 1, '#15171c');
      if (e.rot === 1) { R(g, x - 6, y - 19, 12, 9, d); R(g, x - 6, y - 19, 12, 1, l); R(g, x - 1, y - 10, 2, 2, '#121418'); R(g, x - 5, y - 8, 10, 4, c); R(g, x - 5, y - 8, 10, 1, l); }
      else { R(g, x - 5, y - 8, 10, 4, c); R(g, x - 5, y - 13, 10, 6, d); R(g, x - 5, y - 13, 10, 1, l); }
      return;
    }
    if (e.rot === 1) {
      // facing the viewer: the backrest rises behind whoever sits here
      R(g, x - 4, y - 1, 8, 1, 'rgba(0,0,0,0.3)');
      R(g, x - 1, y - 4, 2, 3, '#121418');
      R(g, x - 4, y - 2, 8, 1, '#15171c');
      R(g, x - 6, y - 19, 12, 9, '#1d2028');
      R(g, x - 6, y - 19, 12, 1, '#2c313b');
      R(g, x - 5, y - 17, 10, 1, '#242832');
      R(g, x - 1, y - 10, 2, 2, '#121418');
      R(g, x - 5, y - 8, 10, 4, '#262a33');
      R(g, x - 5, y - 8, 10, 1, '#30353f');
      return;
    }
    R(g, x - 4, y - 1, 8, 1, 'rgba(0,0,0,0.3)');
    R(g, x - 1, y - 4, 2, 3, '#121418');
    R(g, x - 4, y - 2, 8, 1, '#15171c');
    R(g, x - 5, y - 8, 10, 4, '#262a33');
    R(g, x - 5, y - 13, 10, 6, '#1d2028');
    R(g, x - 5, y - 13, 10, 1, '#2c313b');
  }

  // gamer (racing seat with colour stripes) and executive (tall leather back) chairs
  function drawChairStyled(g, e, x, y) {
    const gamer = e.variant === 'gamer';
    const c = e.color || (gamer ? '#7c3aed' : '#5a3b2e'), base = gamer ? '#16181d' : shade(c, -0.25), d = shade(base, -0.3), l = shade(c, 0.2);
    R(g, x - 5, y - 1, 10, 1, 'rgba(0,0,0,0.3)');
    R(g, x - 1, y - 4, 2, 3, '#121418');
    R(g, x - 5, y - 2, 10, 1, '#15171c');
    R(g, x - 5, y - 2, 1, 1, '#2a2f38'); R(g, x + 4, y - 2, 1, 1, '#2a2f38');
    if (e.rot === 1) {
      R(g, x - 6, y - 22, 12, 12, base);
      R(g, x - 6, y - 22, 12, 1, shade(base, 0.2));
      if (gamer) { R(g, x - 6, y - 21, 2, 11, c); R(g, x + 4, y - 21, 2, 11, c); R(g, x - 3, y - 21, 6, 2, d); R(g, x - 2, y - 20, 4, 1, c); }
      else { R(g, x - 5, y - 20, 10, 1, shade(base, 0.1)); R(g, x - 5, y - 16, 10, 1, d); }
      R(g, x - 1, y - 10, 2, 2, '#121418');
      R(g, x - 5, y - 8, 10, 4, gamer ? base : c);
      R(g, x - 5, y - 8, 10, 1, gamer ? c : l);
      R(g, x - 7, y - 10, 2, 4, '#121418'); R(g, x + 5, y - 10, 2, 4, '#121418');
      return;
    }
    R(g, x - 5, y - 8, 10, 4, gamer ? base : c);
    R(g, x - 6, y - 17, 12, 10, base);
    R(g, x - 6, y - 17, 12, 1, shade(base, 0.2));
    if (gamer) { R(g, x - 6, y - 16, 2, 9, c); R(g, x + 4, y - 16, 2, 9, c); R(g, x - 2, y - 16, 4, 2, c); }
    else { R(g, x - 5, y - 13, 10, 1, d); R(g, x - 5, y - 10, 10, 1, d); }
    R(g, x - 7, y - 9, 2, 3, '#121418'); R(g, x + 5, y - 9, 2, 3, '#121418');
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
    if (e.variant) return drawPlantVariant(g, e, px, py);
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

  /* ---------- buildable furniture & decoration ---------- */

  // Modular rack: e.units holds what is installed in each of its 9 slots (top to bottom).
  function drawUnitRack(g, e, t) {
    const px = e.px, py = e.py;
    rackBody(g, px, py, e.tag);
    for (let k = 0; k < 9; k++) {
      const uy = py - 15 + k * 3, u = e.units[k];
      if (!u) {
        R(g, px + 3, uy, 10, 2, '#0f1216');
        R(g, px + 3, uy, 1, 2, '#1a1f26');
        R(g, px + 12, uy, 1, 2, '#1a1f26');
      } else if (u === 'patch') {
        R(g, px + 3, uy, 10, 2, '#59606b');
        R(g, px + 3, uy, 10, 1, '#6d7581');
        for (let i = 0; i < 4; i++) R(g, px + 4 + i * 2, uy + 1, 1, 1, '#1a1d22');
      } else if (u === 'switch') {
        // unitState (optional, per slot): 'new' | 'link' | 'fault' — set by the demo's operations layer
        const st = e.unitState && e.unitState[k];
        R(g, px + 3, uy, 10, 2, '#2a313b');
        R(g, px + 3, uy, 10, 1, '#39414d');
        for (let i = 0; i < 4; i++) R(g, px + 4 + i * 2, uy + 1, 1, 1, st === 'fault' && i === 2 ? (blink(t, 2.2, k * 0.3) ? C.warn : '#3a2414') : flick(t, e.seed * 7 + k * 5 + i, 5 + i) ? C.ok : C.okDim);
        R(g, px + 12, uy, 1, 2, flick(t, e.seed + k, 8) ? C.breeze : C.breezeDim);
      } else {
        const st = e.unitState && e.unitState[k];
        R(g, px + 3, uy, 10, 2, '#1c222b');
        R(g, px + 3, uy, 10, 1, '#262d38');
        R(g, px + 4, uy + 1, 5, 1, '#141920');
        if (st === 'new') {
          R(g, px + 10, uy, 1, 1, '#c98a3c');
          R(g, px + 12, uy, 1, 1, '#2a2f37');
        } else if (st === 'link') {
          R(g, px + 10, uy, 1, 1, C.ok);
          R(g, px + 12, uy, 1, 1, blink(t, 1.2, k * 0.2) ? '#c98a3c' : '#2a2f37');
        } else if (st === 'fault') {
          const on = blink(t, 2.2, k * 0.3);
          R(g, px + 10, uy, 1, 1, on ? C.warn : '#3a2414');
          R(g, px + 12, uy, 1, 1, on ? '#3a2414' : C.warn);
        } else {
          const s = ledState(e.state, t, e.seed * 13 + k);
          R(g, px + 10, uy, 1, 1, s.pwr);
          R(g, px + 12, uy, 1, 1, s.act);
        }
      }
    }
    if (e.cableLook === 'tidy') {
      // velcro'd bundle running down the right-hand cable manager
      R(g, px + 13, py - 15, 1, 26, '#4a7fb5');
      for (let y = py - 13; y < py + 10; y += 6) R(g, px + 13, y, 1, 1, '#c8ccd2');
    } else if (e.cableLook === 'messy') {
      const c = ['#4a7fb5', '#c9a13c', '#4a7fb5', '#b0485a'];
      for (let i = 0; i < 4; i++) {
        const x = px + 3 + ((e.seed * 3 + i * 5) % 10), y0 = py - 12 + i * 5;
        R(g, x, y0, 1, 3, c[i]);
        R(g, x + 1, y0 + 3, 2, 1, c[i]);
        R(g, x + 3, y0 + 4, 1, 2, c[i]);
      }
      R(g, px + 1, py + 6, 2, 1, '#c9a13c');
    }
    R(g, px + 13, py - 3, 1, 4, '#3a414c');
  }

  // Single rack units, used for catalog thumbnails.
  function drawUnitThumb(g, e, t) {
    const x = e.px, y = e.py;
    R(g, x, y + 4, 16, 6, '#1c222b');
    R(g, x, y + 4, 16, 1, '#2d3542');
    R(g, x, y + 9, 16, 1, '#11151b');
    if (e.kind === 'unit-patch') {
      R(g, x, y + 4, 16, 6, '#59606b');
      R(g, x, y + 4, 16, 1, '#6d7581');
      for (let i = 0; i < 6; i++) R(g, x + 2 + i * 2, y + 6, 1, 2, '#1a1d22');
      R(g, x + 1, y + 9, 14, 1, '#3d434c');
      return;
    }
    if (e.kind === 'unit-switch') {
      for (let i = 0; i < 6; i++) R(g, x + 2 + i * 2, y + 6, 1, 2, flick(t, i * 3, 5 + i) ? C.ok : C.okDim);
      R(g, x + 14, y + 6, 1, 2, C.breeze);
    } else {
      R(g, x + 2, y + 6, 8, 2, '#141920');
      R(g, x + 12, y + 6, 1, 1, C.ok);
      R(g, x + 14, y + 6, 1, 1, flick(t, 5, 7) ? C.breeze : C.breezeDim);
    }
  }

  function drawPlantVariant(g, e, px, py) {
    R(g, px + 3, py + 13, 11, 2, 'rgba(0,0,0,0.3)');
    const pot = () => { R(g, px + 4, py + 3, 8, 10, '#2d323b'); R(g, px + 4, py + 3, 8, 1, '#3d434d'); };
    if (e.variant === 'cactus') {
      const c = '#3c8059', l = '#58a578';
      R(g, px + 7, py - 12, 3, 15, c); R(g, px + 7, py - 12, 1, 15, l);
      R(g, px + 4, py - 6, 2, 5, c); R(g, px + 4, py - 2, 3, 2, c);
      R(g, px + 11, py - 9, 2, 5, c); R(g, px + 10, py - 5, 3, 2, c);
      R(g, px + 8, py - 13, 1, 1, '#ff7aa8');
      R(g, px + 4, py + 3, 8, 10, '#b8562c'); R(g, px + 4, py + 3, 8, 1, '#d9784a');
      return;
    }
    if (e.variant === 'palm') {
      const L1 = '#2c5f45', L2 = '#3c8059';
      R(g, px + 7, py - 8, 2, 11, '#6b5038');
      R(g, px + 1, py - 13, 7, 2, L2); R(g, px + 8, py - 13, 7, 2, L2);
      R(g, px, py - 11, 3, 3, L1); R(g, px + 13, py - 11, 3, 3, L1);
      R(g, px + 5, py - 16, 6, 3, L2); R(g, px + 3, py - 10, 4, 2, L1); R(g, px + 9, py - 10, 4, 2, L1);
      pot();
      return;
    }
    // flowers
    const L1 = '#2c5f45', L2 = '#3c8059';
    R(g, px + 5, py - 6, 6, 9, L1); R(g, px + 3, py - 3, 10, 5, L2);
    for (const [a, b, c] of [[4, -7, '#ff7aa8'], [10, -8, '#ffd23f'], [7, -10, '#c4b5fd'], [12, -4, '#ff7aa8'], [3, -3, '#ffd23f']]) { R(g, px + a, py + b, 2, 2, c); R(g, px + a, py + b, 1, 1, '#ffffff'); }
    pot();
  }

  function drawTable(g, e) {
    const px = e.px, py = e.py, w = e.tw * T, h = e.th * T;
    const top = h - T + 9;
    R(g, px + 1, py + h - 2, w - 2, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 2, py + h - 10, 2, 8, '#15181d');
    R(g, px + w - 4, py + h - 10, 2, 8, '#15181d');
    const [tc, tl, td] = topCols(e.color, ['#323842', '#434a56', '#22262d']);
    R(g, px, py - 4, w, top, tc);
    R(g, px, py - 4, w, 1, tl);
    R(g, px, py - 4, 1, top, e.color ? shade(e.color, 0.08) : '#3a414c');
    R(g, px, py - 4 + top, w, 2, td);
  }

  function drawMonitor(g, e, t) {
    const px = e.px, py = e.py;
    if (e.rot === 1) {
      R(g, px + 6, py - 5, 4, 3, '#16191f');
      R(g, px + 2, py - 14, 12, 10, '#1a1d23');
      R(g, px + 2, py - 14, 12, 1, '#262a31');
      R(g, px + 4, py - 12, 8, 1, '#20242b');
      if (e.work) R(g, px + 1, py - 14, 1, 9, 'rgba(160,195,236,0.28)');
      return;
    }
    const white = e.variant === 'white', frame = white ? '#d9dde3' : '#0c0e12';
    R(g, px + 6, py - 6, 3, 3, white ? '#b8bec7' : '#16191f');
    R(g, px + 4, py - 4, 7, 1, white ? '#b8bec7' : '#16191f');
    R(g, px + 2, py - 16, 12, 10, frame);
    if (e.variant === 'rgb') {
      g.fillStyle = e.color || '#ff2bd6';
      g.fillRect(px + 1, py - 17, 14, 1); g.fillRect(px + 1, py - 6, 14, 1);
      g.fillRect(px + 1, py - 17, 1, 12); g.fillRect(px + 14, py - 17, 1, 12);
    }
    if (e.work) workScreen(g, px + 3, py - 15, 10, 8, t, e.work, e.seed, e.typing);
    else idleScreen(g, px + 3, py - 15, 10, 8, t, e.seed);
    R(g, px + 2, py - 3, 12, 1, 'rgba(160,195,236,0.08)');
    R(g, px + 3, py - 2, 10, 2, '#3c424c');
    R(g, px + 3, py - 2, 10, 1, '#4a515d');
  }

  function drawSofa(g, e) {
    const px = e.px, py = e.py;
    const base = e.color || '#2f3a4d', d = shade(base, -0.3), l = shade(base, 0.12);
    R(g, px + 1, py + 13, 30, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 10, 30, 9, d);
    R(g, px + 1, py - 10, 30, 1, l);
    R(g, px, py - 4, 4, 15, base);
    R(g, px + 28, py - 4, 4, 15, base);
    R(g, px, py - 4, 4, 1, l);
    R(g, px + 28, py - 4, 4, 1, l);
    R(g, px + 4, py - 2, 12, 7, l);
    R(g, px + 16, py - 2, 12, 7, l);
    R(g, px + 16, py - 2, 1, 7, d);
    R(g, px + 4, py + 5, 24, 6, base);
    R(g, px + 2, py + 11, 2, 2, '#121418');
    R(g, px + 28, py + 11, 2, 2, '#121418');
  }

  function drawShelf(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 15, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 20, 14, 34, '#2a2f38');
    R(g, px + 1, py - 20, 14, 1, '#383e49');
    R(g, px + 3, py - 18, 10, 30, '#14171c');
    const cols = [C.breeze, C.twilight, C.warnSoft, '#5d6878', '#7d8187', C.breezeDim];
    for (let s = 0; s < 3; s++) {
      const sy = py - 18 + s * 10;
      R(g, px + 3, sy + 9, 10, 1, '#2a2f38');
      let x = px + 3;
      for (let k = 0; k < 5 && x < px + 13; k++) {
        const w = 1 + Math.floor(hash(e.seed * 7 + s * 5 + k) * 2), hh = 5 + Math.floor(hash(e.seed + s * 3 + k) * 3);
        R(g, x, sy + 9 - hh, w, hh, cols[(s * 2 + k + e.seed) % cols.length]);
        x += w + 1;
      }
    }
  }

  function drawWater(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 3, py + 12, 10, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 4, py - 4, 8, 16, '#c9ced6');
    R(g, px + 4, py - 4, 8, 1, '#e3e6ea');
    R(g, px + 11, py - 4, 1, 16, '#9aa1ab');
    R(g, px + 6, py, 4, 2, '#2a2f38');
    R(g, px + 7, py + 2, 1, 1, C.breeze);
    R(g, px + 9, py + 2, 1, 1, C.warn);
    R(g, px + 5, py - 15, 6, 11, 'rgba(160,195,236,0.55)');
    R(g, px + 5, py - 15, 6, 1, 'rgba(220,235,255,0.7)');
    R(g, px + 6, py - 16, 4, 1, '#3d5a80');
    const b = Math.floor((t * 0.8 + e.seed) % 3);
    R(g, px + 7, py - 6 - b * 3, 1, 1, 'rgba(255,255,255,0.7)');
  }

  function drawWhiteboard(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 12, 28, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 4, py - 4, 1, 17, '#3a414c');
    R(g, px + 27, py - 4, 1, 17, '#3a414c');
    R(g, px + 2, py + 12, 5, 1, '#3a414c');
    R(g, px + 25, py + 12, 5, 1, '#3a414c');
    R(g, px + 1, py - 21, 30, 18, '#9aa3b0');
    R(g, px + 2, py - 20, 28, 16, '#e4e7eb');
    // a little topology sketch
    R(g, px + 5, py - 17, 5, 3, C.breeze);
    R(g, px + 13, py - 17, 5, 3, C.breeze);
    R(g, px + 21, py - 17, 5, 3, C.dusk);
    R(g, px + 7, py - 14, 1, 4, '#5d6878');
    R(g, px + 7, py - 10, 16, 1, '#5d6878');
    R(g, px + 15, py - 14, 1, 4, '#5d6878');
    R(g, px + 23, py - 14, 1, 4, '#5d6878');
    R(g, px + 5, py - 8, 8, 1, C.warn);
    R(g, px + 5, py - 6, 12, 1, '#7d8187');
    R(g, px + 22, py - 8, 4, 3, C.warnSoft);
    R(g, px + 2, py - 4, 28, 1, '#7d8187');
  }

  function drawRug(g, e) {
    const px = e.px, py = e.py, w = e.tw * T, h = e.th * T;
    const base = e.color || '#1d2433';
    R(g, px + 1, py + 1, w - 2, h - 2, base);
    R(g, px + 2, py + 2, w - 4, 1, shade(base, 0.18));
    R(g, px + 2, py + h - 3, w - 4, 1, shade(base, 0.18));
    R(g, px + 2, py + 2, 1, h - 4, shade(base, 0.18));
    R(g, px + w - 3, py + 2, 1, h - 4, shade(base, 0.18));
    for (let i = 6; i < w - 6; i += 4) R(g, px + i, py + 6, 2, h - 12, shade(base, 0.08));
  }

  function drawLamp(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 4, py + 11, 8, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 5, py + 10, 6, 2, '#20242c');
    R(g, px + 7, py - 13, 2, 23, '#2a2f38');
    const lc = e.color || '#ffc285';
    R(g, px + 3, py - 20, 10, 7, lc);
    R(g, px + 3, py - 20, 10, 1, e.color ? shade(lc, 0.45) : '#ffe2c2');
    R(g, px + 3, py - 14, 10, 1, e.color ? shade(lc, -0.25) : '#c98f57');
    R(g, px + 5, py - 13, 6, 1, e.color ? shade(lc, 0.2) + '59' : 'rgba(255,194,133,0.35)');
  }

  function drawCoffee(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 4, py - 13, 8, 10, '#22262d');
    R(g, px + 4, py - 13, 8, 1, '#353b45');
    R(g, px + 5, py - 11, 6, 2, '#11141a');
    R(g, px + 10, py - 11, 1, 1, C.warn);
    R(g, px + 6, py - 6, 4, 3, '#e8e8e4');
    R(g, px + 6, py - 6, 4, 1, '#5a3a25');
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.7 + k * 0.5) % 1;
      g.fillStyle = 'rgba(255,255,255,' + (0.35 * Math.sin(ph * Math.PI)).toFixed(3) + ')';
      g.fillRect(px + 7 + k, py - 8 - Math.round(ph * 6), 1, 1);
    }
  }

  function drawVase(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 5, py - 6, 6, 5, '#3d434d');
    R(g, px + 5, py - 6, 6, 1, '#4a515c');
    R(g, px + 7, py - 12, 2, 6, '#2c5f45');
    R(g, px + 4, py - 11, 3, 2, '#3c8059');
    R(g, px + 9, py - 13, 3, 2, '#58a578');
    R(g, px + 6, py - 14, 2, 2, '#3c8059');
  }

  function drawBin(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 4, py + 11, 8, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 5, py + 2, 6, 10, '#2a2f38');
    R(g, px + 4, py + 1, 8, 2, '#3a404b');
    R(g, px + 10, py + 3, 1, 9, '#20242c');
  }

  // Glass partition running east–west between two stacked rooms.
  function drawGlassH(g, e) {
    const x = e.px, top = e.py - 6;
    R(g, x, top, 16, 16, 'rgba(160,195,236,0.08)');
    R(g, x, top, 16, 1, '#2a3039');
    R(g, x, top + 16, 16, 1, '#2a3039');
    R(g, x + 3 + (e.tx % 3) * 3, top + 3, 1, 1, 'rgba(220,235,255,0.18)');
    R(g, x + 4 + (e.tx % 3) * 3, top + 2, 1, 1, 'rgba(220,235,255,0.12)');
    if (e.capLeft) R(g, x, top, 1, 17, '#2a3039');
    if (e.capRight) R(g, x + 15, top, 1, 17, '#2a3039');
  }

  DL.drawItem = function (g, e, t) {
    switch (e.kind) {
      case 'rack': if (e.units) { drawUnitRack(g, e, t); break; } // falls through
      case 'switch': case 'router': case 'core': case 'storage': drawRack(g, e, t); break;
      case 'desk': drawDesk(g, e, t); break;
      case 'chair': drawChair(g, e); break;
      case 'crac': drawCrac(g, e, t); break;
      case 'ups': drawUps(g, e, t); break;
      case 'plant': drawPlant(g, e); break;
      case 'glass': drawGlass(g, e); break;
      case 'glassH': drawGlassH(g, e); break;
      case 'table': drawTable(g, e); break;
      case 'monitor': drawMonitor(g, e, t); break;
      case 'sofa': drawSofa(g, e); break;
      case 'shelf': drawShelf(g, e); break;
      case 'water': drawWater(g, e, t); break;
      case 'whiteboard': drawWhiteboard(g, e); break;
      case 'rug': drawRug(g, e); break;
      case 'lamp': drawLamp(g, e); break;
      case 'coffee': drawCoffee(g, e, t); break;
      case 'vase': drawVase(g, e); break;
      case 'bin': drawBin(g, e); break;
      case 'unit-server': case 'unit-switch': case 'unit-patch': drawUnitThumb(g, e, t); break;
    }
  };

  // Sprite bounds (for selection brackets / labels) and the spot the player stands to interact.
  DL.itemGeom = function (e) {
    const px = e.px, py = e.py;
    e.ix = px + e.tw * 8;
    e.iy = py + e.th * T + 7;
    switch (e.kind) {
      case 'desk': e.bounds = SETUPS[e.setup] && SETUPS[e.setup].tall ? { x: px - 1, y: py - 29, w: 34, h: 44 } : { x: px - 1, y: py - 19, w: 34, h: 34 }; break;
      case 'crac': e.bounds = { x: px - 1, y: py - 25, w: 18, h: 41 }; break;
      case 'ups': e.bounds = { x: px - 1, y: py - 21, w: 34, h: 37 }; break;
      case 'plant': e.bounds = { x: px + 1, y: py - 14, w: 14, h: 30 }; break;
      case 'chair': e.bounds = { x: e.cx - 7, y: e.cy - (e.rot === 1 ? 20 : 14), w: 14, h: e.rot === 1 ? 21 : 15 }; break;
      case 'table': e.bounds = { x: px - 1, y: py - 5, w: e.tw * T + 2, h: e.th * T + 5 }; break;
      case 'monitor': e.bounds = { x: px + 1, y: py - 17, w: 14, h: 17 }; break;
      case 'sofa': e.bounds = { x: px - 1, y: py - 11, w: 34, h: 26 }; break;
      case 'shelf': e.bounds = { x: px, y: py - 21, w: 16, h: 36 }; break;
      case 'water': e.bounds = { x: px + 3, y: py - 17, w: 10, h: 31 }; break;
      case 'whiteboard': e.bounds = { x: px, y: py - 22, w: 32, h: 36 }; break;
      case 'rug': e.bounds = { x: px, y: py, w: e.tw * T, h: e.th * T }; break;
      case 'lamp': e.bounds = { x: px + 2, y: py - 21, w: 12, h: 35 }; break;
      case 'coffee': e.bounds = { x: px + 3, y: py - 15, w: 10, h: 13 }; break;
      case 'vase': e.bounds = { x: px + 3, y: py - 15, w: 10, h: 15 }; break;
      case 'bin': e.bounds = { x: px + 3, y: py, w: 10, h: 13 }; break;
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

  DL.floorTile = floorTile;
  DL.carpet = carpet;

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
