/* DataLab — emotes: three free animations every player has from the start (no purchase, nothing saved).
   1 = dance, 2 = wave, 3 = anger. One at a time; walking stops it. The frames come from
   sprites.js (DL.makeEmoteSheet), so the skin, the accessories and the pet stay on during the emote.
   The emoji shows over the head in the speech bubble (crew.js draws the player's bubble).
   4 = Invasão, a reward of the season pass (battlepass.js): only for whoever owns its item. */
(function () {
  'use strict';
  const DL = window.DL;

  DL.EMOTES = [
    { id: 'dance', key: '1', emoji: '🕺', name: 'Dança', dur: 3, desc: 'Balança o corpo de um lado para o outro e mexe os braços no ritmo.' },
    { id: 'wave', key: '2', emoji: '👋', name: 'Acenando', dur: 2, desc: 'Levanta o braço e balança a mão para cumprimentar alguém.' },
    { id: 'angry', key: '3', emoji: '😡', name: 'Raiva', dur: 2.6, desc: 'A cabeça fica vermelha e sai fumaça. Para quando o servidor cai de novo.' },
    { id: 'hack', key: '4', emoji: '⌨️', name: 'Invasão', dur: 3.4, item: 'bp_emote_hack', desc: 'Digita rápido num teclado no ar e aparece "ACESSO LIBERADO" em cima do personagem.' },
  ];
  // the emotes this player may use: the free ones + the ones whose item is in the inventory
  DL.emoteOwned = (e) => !e.item || !!(DL.Inventory && DL.Inventory.owns(e.item));
  const HACK_DONE = 1.3; // the last seconds of Invasão: "ACESSO LIBERADO"
  const BY_ID = {};
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
    return null;
  };

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
      if (!DL.emoteOwned(em)) { game.toast('info', 'Emote ' + em.name, 'Recompensa do Passe Boot Inicial (nível 20)'); return false; }
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
      if (E.cur.id === 'hack' && E.t > E.cur.dur - HACK_DONE && player.bubble && player.bubble.text !== 'ACESSO LIBERADO') {
        player.bubble = { text: 'ACESSO LIBERADO', left: HACK_DONE, tone: 'emote' };
        game.sfx('ok');
      }
    }
    player.fx = function (g, X, Y, t) {
      if (E.cur && E.cur.id === 'angry') smoke(g, X, Y, E.t);
      if (E.cur && E.cur.id === 'hack') hack(g, X, Y, E.t, E.cur.dur);
    };
    return {
      play, stop, update,
      get active() { return E.cur ? E.cur.id : null; },
      // the emote's frame for the player right now (null when no emote is running)
      frame() { return E.cur ? DL.emoteFrame(sheet(), E.cur.id, E.t, E.cur.dur) : null; },
      // keyboard: 1 / 2 / 3, and 4 for Invasão (top row or numpad)
      key(ev) {
        const m = /^(?:Digit|Numpad)([1234])$/.exec(ev.code);
        if (!m || ev.repeat) return false;
        play(DL.EMOTES[+m[1] - 1].id);
        return true;
      },
    };
  };
})();
