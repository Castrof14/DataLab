/* DataLab — emotes: three free animations every player has from the start (no purchase, nothing saved).
   1 = dance, 2 = wave, 3 = anger. One at a time; walking stops it. The frames come from
   sprites.js (DL.makeEmoteSheet), so the skin, the accessories and the pet stay on during the emote.
   The emoji shows over the head in the speech bubble (crew.js draws the player's bubble).
   4 = Invasão and 5 = Reboot, rewards of the season pass (battlepass.js): only for whoever owns their item.
   6 = Selfie comes with the Dev Pierre skin. */
(function () {
  'use strict';
  const DL = window.DL;

  DL.EMOTES = [
    { id: 'dance', key: '1', emoji: '🕺', name: 'Dança', dur: 3, desc: 'Balança o corpo de um lado para o outro e mexe os braços no ritmo.' },
    { id: 'wave', key: '2', emoji: '👋', name: 'Acenando', dur: 2, desc: 'Levanta o braço e balança a mão para cumprimentar alguém.' },
    { id: 'angry', key: '3', emoji: '😡', name: 'Raiva', dur: 2.6, desc: 'A cabeça fica vermelha e sai fumaça. Para quando o servidor cai de novo.' },
    { id: 'hack', key: '4', emoji: '⌨️', name: 'Invasão', dur: 3.4, item: 'bp_emote_hack', desc: 'Digita rápido num teclado no ar e aparece "ACESSO LIBERADO" em cima do personagem.' },
    { id: 'reboot', key: '5', emoji: '🔌', name: 'Reboot', dur: 3.6, item: 'bp_emote_reboot', desc: 'Desliga, fica com a tela azul no rosto e liga de novo, com barra de carregamento.' },
    // 6 = Selfie: comes with the Dev Pierre skin (cosmetics.js)
    { id: 'selfie', key: '6', emoji: '🤳', name: 'Selfie', dur: 3.2, item: 'dev_pierre', desc: 'Mão no bolso, celular erguido na frente do rosto e o flash disparando: selfie no espelho.' },
  ];
  // Selfie: when the flash goes off (s)
  const SELFIE_FLASH = [1.1, 2.3];
  // Reboot: the moments of the emote (s)
  const RB = { off: 0.45, boot: 2.2 };
  // the emotes this player may use: the free ones + the ones whose item is in the inventory
  DL.emoteOwned = (e) => !e.item || !!(DL.Inventory && DL.Inventory.owns(e.item));
  const HACK_DONE = 1.3; // the last seconds of Invasão: "ACESSO LIBERADO"
  const BY_ID = Object.create(null); // ids also arrive from other players (multiplayer.js)
  for (const e of DL.EMOTES) BY_ID[e.id] = e;
  DL.emote = (id) => BY_ID[id] || null;

  // the frame an emote shows at time t (s) on an emote sheet; null = the normal frame
  DL.emoteFrame = function (sheet, id, t, dur) {
    if (id === 'dance') return Math.floor(t / 0.25) % 2 ? sheet.danceB : sheet.danceA;
    if (id === 'wave') return Math.floor(t / 0.18) % 2 ? sheet.waveB : sheet.waveA;
    if (id === 'angry') {
      // flushes red, holds it, then calms down for the last half second
      if (t < 0.35 || t > dur - 0.5) return sheet.angry1;
      return Math.floor(t / 0.4) % 3 ? sheet.angry2 : sheet.angry1;
    }
    // types very fast, then stands still while access is granted
    if (id === 'hack') return t > dur - HACK_DONE ? sheet.hackB : Math.floor(t / 0.09) % 2 ? sheet.hackB : sheet.hackA;
    // standing still while it shuts down and boots again (the effect is drawn over the frame)
    if (id === 'reboot') return sheet.hackB;
    // holds the phone up, bobbing a pixel while framing the shot
    if (id === 'selfie') return Math.floor(t / 0.5) % 2 ? sheet.selfieB : sheet.selfieA;
    return null;
  };

  // Reboot: the body goes dark (a tint over the frame's own pixels), the face shows a pixel blue screen,
  // then a loading bar fills over the head and the light comes back with a flash
  const tints = new WeakMap();
  function darkOf(img) {
    let c = tints.get(img);
    if (!c) {
      c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#05070d';
      g.fillRect(0, 0, c.width, c.height);
      tints.set(img, c);
    }
    return c;
  }
  function reboot(g, X, Y, t, dur, frame) {
    const R = DL.R, C = DL.CHAR, top = Y - C.AY + 6, ga = g.globalAlpha;
    const dark = t < RB.off ? t / RB.off : t < RB.boot ? 1 : Math.max(0, 1 - (t - RB.boot) / 0.7);
    if (frame && dark > 0) { g.globalAlpha = ga * 0.62 * dark; g.drawImage(darkOf(frame), X - C.AX, Y - C.AY); g.globalAlpha = ga; }
    if (t < RB.off) {
      // the picture collapses into a bright line across the face
      const k = t / RB.off, h = Math.max(1, Math.round(8 * (1 - k)));
      R(g, X - 4, top + 5 - Math.floor(h / 2), 9, h, 'rgba(232,244,255,' + (0.35 + 0.5 * k).toFixed(2) + ')');
    } else if (t < RB.boot) {
      // the blue screen on the face: a sad face and two lines of text
      R(g, X - 5, top + 1, 11, 8, '#1d4fd8');
      R(g, X - 3, top + 2, 1, 1, '#fff'); R(g, X - 3, top + 4, 1, 1, '#fff'); R(g, X - 1, top + 2, 1, 3, '#fff'); R(g, X, top + 1, 1, 1, '#fff'); R(g, X, top + 5, 1, 1, '#fff');
      R(g, X - 3, top + 6, 7, 1, '#9cc6ff'); R(g, X - 3, top + 7, Math.floor((t * 6) % 6) + 1, 1, '#9cc6ff');
      R(g, X - 5, top + 1, 11, 1, 'rgba(255,255,255,0.25)');
    } else {
      // booting: the bar over the head fills, then a golden flash
      const k = Math.min(1, (t - RB.boot) / (dur - RB.boot - 0.35));
      R(g, X - 7, top - 9, 15, 4, '#0b0b10'); R(g, X - 6, top - 8, 13, 2, '#232333'); R(g, X - 6, top - 8, Math.round(13 * k), 2, k >= 1 ? '#ffe680' : '#f2b51e');
      if (k >= 1) { g.globalAlpha = ga * Math.max(0, 1 - (t - (dur - 0.35)) / 0.35) * 0.5; R(g, X - 8, Y - 30, 17, 30, '#fff1b8'); g.globalAlpha = ga; }
    }
  }
  // an emote's live effect (the inventory's preview draws it too): hack and reboot
  DL.emoteFx = function (g, id, X, Y, t, dur, frame) {
    if (id === 'hack') hack(g, X, Y, t, dur);
    else if (id === 'reboot') reboot(g, X, Y, t, dur, frame);
    else if (id === 'selfie') selfie(g, X, Y, t);
  };

  // Selfie: the flash goes off twice from the phone's camera (a burst of light, then a fading glow)
  function selfie(g, X, Y, t) {
    const R = DL.R, C = DL.CHAR, dy = Math.floor(t / 0.5) % 2 ? 1 : 0;
    const cx = X + 2, cy = Y - C.AY + 9 + dy, ga = g.globalAlpha; // the phone's camera (cosmetics.js selfieArms)
    for (const at of SELFIE_FLASH) {
      const k = (t - at) / 0.32;
      if (k < 0 || k > 1) continue;
      g.globalAlpha = ga * (1 - k);
      R(g, cx - 1, cy - 1, 3, 3, '#ffffff');
      const r = 2 + Math.round(k * 5);
      R(g, cx - r, cy, r * 2 + 1, 1, '#fff6d8'); R(g, cx, cy - r, 1, r * 2 + 1, '#fff6d8');
      R(g, cx - r + 1, cy - r + 1, 1, 1, '#ffe7a8'); R(g, cx + r - 1, cy - r + 1, 1, 1, '#ffe7a8');
      R(g, cx - r + 1, cy + r - 1, 1, 1, '#ffe7a8'); R(g, cx + r - 1, cy + r - 1, 1, 1, '#ffe7a8');
      if (k < 0.25) { g.globalAlpha = ga * 0.22; R(g, X - 10, Y - 34, 21, 35, '#ffffff'); }
    }
    g.globalAlpha = ga;
  }

  // Invasão: a holographic keyboard in front of the player, code flying up from it, then a green flash
  function hack(g, X, Y, t, dur) {
    const R = DL.R, done = t > dur - HACK_DONE;
    const a = Math.min(1, t * 4) * (done ? Math.max(0, (dur - t) / HACK_DONE) : 1);
    g.globalAlpha = a;
    R(g, X - 7, Y - 12, 14, 1, 'rgba(45,226,200,0.85)');
    R(g, X - 6, Y - 11, 12, 3, 'rgba(45,226,200,0.22)');
    for (let i = 0; i < 6; i++) if (!done && DL.hash(Math.floor(t * 14) * 7 + i) < 0.4) R(g, X - 6 + i * 2, Y - 11 + (i % 2), 1, 1, '#a5f7ea');
    if (!done) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * 1.6 + i / 4) % 1;
        g.globalAlpha = a * (1 - ph);
        DL.R(g, Math.round(X - 6 + ((i * 5) % 12)), Math.round(Y - 14 - ph * 16), 2, 1, i % 2 ? '#2de2c8' : '#7fb2f0');
      }
    } else {
      const k = (t - (dur - HACK_DONE)) / HACK_DONE;
      g.globalAlpha = Math.max(0, 0.5 - k * 0.5);
      R(g, X - 9, Y - 34, 18, 34, '#6dff8f');
    }
    g.globalAlpha = 1;
  }

  // grey pixel clouds rising from the head (world px around the feet point X, Y)
  function smoke(g, X, Y, t) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.9 + i / 4) % 1;
      const x = Math.round(X + (i % 2 ? 3 : -4) + Math.sin(t * 3 + i * 1.7) * 1.5), y = Math.round(Y - 31 - ph * 12);
      g.globalAlpha = Math.max(0, 1 - ph) * 0.85;
      DL.R(g, x, y, 3, 2, i % 2 ? '#8797b0' : '#aab4bf');
      DL.R(g, x + 1, y - 1, 1, 1, '#c3ccd9');
      if (ph < 0.6) DL.R(g, x - 1, y + 1, 1, 1, '#56657d');
    }
    g.globalAlpha = 1;
  }
  // the download page (baixar.js) plays the emotes outside the game and draws the same smoke
  DL.emoteSmoke = smoke;

  // the bubble's next line, when the emote has reached it: returns the sound of that moment (or null)
  function advanceBubble(actor, em, t) {
    if (!actor.bubble) return null;
    if (em.id === 'hack' && t > em.dur - HACK_DONE && actor.bubble.text !== 'ACESSO LIBERADO') {
      actor.bubble = { text: 'ACESSO LIBERADO', left: HACK_DONE, tone: 'emote' };
      return 'ok';
    }
    if (em.id === 'reboot' && t > RB.boot && actor.bubble.text === em.emoji) {
      actor.bubble = { text: 'LIGANDO…', left: em.dur - t, tone: 'emote' };
      return 'tick';
    }
    return null;
  }
  // the effects drawn over a character during an emote
  function drawFx(g, actor, em, t, X, Y) {
    if (em.id === 'angry') smoke(g, X, Y, t);
    if (em.id === 'hack' || em.id === 'reboot' || em.id === 'selfie') DL.emoteFx(g, em.id, X, Y, t, em.dur, actor.frame());
  }

  // another player's emote, on their character here (multiplayer.js). Same frames, effects and bubbles as
  // the player's own; whether they own it was already checked in their game. id null = it ended over there.
  DL.remoteEmote = function (a, id) {
    const em = id ? BY_ID[id] : null;
    if (a.emote && a.bubble && a.bubble.tone === 'emote') a.bubble = null;
    a.emote = em ? { em, t: 0 } : null;
    if (!em) return;
    a.bubble = { text: em.emoji, left: em.dur, tone: 'emote' };
    a.fx = function (g, X, Y) { if (this.emote) drawFx(g, this, this.emote.em, this.emote.t, X, Y); };
  };
  // the emote ends by itself too, in case the message saying so never comes (the other player dropped)
  DL.remoteEmoteUpdate = function (a, dt) {
    const e = a.emote;
    if (!e) return;
    e.t += dt;
    if (e.t >= e.em.dur) { DL.remoteEmote(a, null); return; }
    advanceBubble(a, e.em, e.t);
  };
  DL.remoteEmoteFrame = function (a) {
    const e = a.emote;
    if (!e) return null;
    if (!a.emoteSheet || a.emoteLook !== a.look) { a.emoteLook = a.look; a.emoteSheet = DL.makeEmoteSheet(a.look); }
    return DL.emoteFrame(a.emoteSheet, e.em.id, e.t, e.em.dur);
  };

  // game: the game API (toast, sfx); player: the player's Actor; opts.can() says if an emote may start
  DL.createEmotes = function (game, player, opts) {
    const E = { cur: null, t: 0, sheet: null, look: null };
    const can = (opts && opts.can) || (() => true);

    function sheet() {
      if (!E.sheet || E.look !== player.look) { E.look = player.look; E.sheet = DL.makeEmoteSheet(player.look); }
      return E.sheet;
    }
    function play(id) {
      const em = BY_ID[id];
      if (!em) return false;
      if (!DL.emoteOwned(em)) {
        const lvl = DL.Pass && DL.Pass.levelOf(em.item), it = !lvl && (DL.COSMETICS || []).find((c) => c.id === em.item);
        game.toast('info', 'Emote ' + em.name, it ? 'Vem com a skin ' + it.name + ', na loja' : 'Recompensa do Passe Boot Inicial' + (lvl ? ' (nível ' + lvl + ')' : ''));
        return false;
      }
      if (E.cur) return false; // one at a time
      const why = can();
      if (why) { if (typeof why === 'string') game.toast('info', 'Emote', why); return false; }
      E.cur = em;
      E.t = 0;
      sheet();
      player.dir = 'down';
      player.bubble = { text: em.emoji, left: em.dur, tone: 'emote' };
      game.sfx('tick');
      if (opts && opts.onChange) opts.onChange(em);
      return true;
    }
    function stop() {
      if (!E.cur) return;
      if (player.bubble && player.bubble.tone === 'emote') player.bubble = null;
      E.cur = null;
      if (opts && opts.onChange) opts.onChange(null);
    }
    // moving: the player is walking (any movement ends the emote)
    function update(dt, moving) {
      if (!E.cur) return;
      if (dt > 0) E.t += dt;
      if (moving || E.t >= E.cur.dur) { stop(); return; }
      const sound = advanceBubble(player, E.cur, E.t);
      if (sound) game.sfx(sound);
    }
    player.fx = function (g, X, Y) { if (E.cur) drawFx(g, player, E.cur, E.t, X, Y); };
    return {
      play, stop, update,
      get active() { return E.cur ? E.cur.id : null; },
      // the emote's frame for the player right now (null when no emote is running)
      frame() { return E.cur ? DL.emoteFrame(sheet(), E.cur.id, E.t, E.cur.dur) : null; },
      // keyboard: 1 / 2 / 3, 4 for Invasão, 5 for Reboot and 6 for Selfie (top row or numpad)
      key(ev) {
        const m = /^(?:Digit|Numpad)([1-6])$/.exec(ev.code);
        if (!m || ev.repeat) return false;
        play(DL.EMOTES[+m[1] - 1].id);
        return true;
      },
    };
  };
})();
