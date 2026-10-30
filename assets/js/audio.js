/* DataLab — sound: chiptune-style effects synthesized with WebAudio (no audio files, nothing to download),
   footsteps, a soft server-room hum that grows with the number of machines online, and the fans of the
   racks around the player: louder up close, fading as they walk away, coming from the rack's side.
   DL.audio.play(name) is what game.sfx(name) calls; the volumes come from Configurações (demo.js). */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const AC = window.AudioContext || window.webkitAudioContext;

  let ctx = null, fx = null, amb = null, near = null, nearPan = null, noiseBuf = null, dest = null;
  let fxVol = 0.6, ambVol = 0.3, humLevel = 0, nearLevel = 0;
  const last = {};
  let lastHard = 0;

  // the browser only lets audio start after a click / key press: the context is created on the first one
  function unlock() {
    if (!AC) return;
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    fx = ctx.createGain();
    fx.gain.value = curve(fxVol);
    fx.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startHum(comp);
    startNear(comp);
  }
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  // silent while the tab is in the background
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  const curve = (v) => v * v;

  /* ---------------- building blocks ---------------- */
  // one note: square / triangle / sine, optional pitch slide, short attack and exponential decay
  function tone(t, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const v = (o.vol || 0.2) * (osc.type === 'square' ? 0.5 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || fx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  // a burst of filtered noise: thuds, clicks, footsteps
  function noise(t, dur, o) {
    o = o || {};
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    f.type = o.filter || 'lowpass';
    f.frequency.value = o.freq || 1200;
    g.gain.setValueAtTime(o.vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || fx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
  const notes = (t, list, step, dur, o) => list.forEach((f, i) => tone(t + i * step, f, dur, o));
  // a steady sound for a while (motors, the microwave): fades in, holds, fades out
  function drone(t, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.06, t + 0.06);
    g.gain.setValueAtTime(o.vol || 0.06, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || fx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  // liquid running into a cup: noise through a narrow band that climbs as the cup fills
  function stream(t, dur, from, to, vol, q) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    src.loop = true;
    f.type = 'bandpass';
    f.Q.value = q || 4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur - 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || fx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
  // little bubbles popping at random: sine blips that jump up in pitch
  function bubbles(t, dur, n, lo, hi, vol) {
    for (let i = 0; i < n; i++) {
      const f = lo + Math.random() * (hi - lo);
      tone(t + Math.random() * dur, f, 0.03 + Math.random() * 0.03, { type: 'sine', to: f * 1.7, vol });
    }
  }
  // one swallow: a low "glug" that bends up, a little different every time
  function gulp(t, vol) {
    const k = 0.85 + Math.random() * 0.3;
    noise(t, 0.09, { filter: 'bandpass', freq: 2200 * k, vol: 0.05 }); // the slurp at the rim
    tone(t + 0.12, 210 * k, 0.09, { type: 'sine', to: 420 * k, vol });
  }

  /* ---------------- the sound bank ---------------- */
  const BANK = {
    // UI
    click: (t) => tone(t, 1800, 0.025, { vol: 0.08 }),
    tick: (t) => tone(t, 1400, 0.04, { type: 'sine', vol: 0.06 }),
    ok: (t) => notes(t, [988, 1319], 0.05, 0.08, { type: 'triangle', vol: 0.09 }),
    warn: (t) => notes(t, [523, 392], 0.08, 0.1, { vol: 0.12 }),
    modeIn: (t) => tone(t, 440, 0.09, { type: 'triangle', to: 660, vol: 0.12 }),
    modeOut: (t) => tone(t, 660, 0.09, { type: 'triangle', to: 440, vol: 0.12 }),
    // building
    place: (t) => { tone(t, 180, 0.09, { type: 'triangle', to: 90, vol: 0.3 }); noise(t, 0.05, { freq: 1400, vol: 0.12 }); },
    remove: (t) => { tone(t, 320, 0.13, { to: 110, vol: 0.18 }); noise(t + 0.02, 0.08, { freq: 900, vol: 0.08 }); },
    nope: (t) => notes(t, [196, 147], 0.09, 0.09, { vol: 0.16 }),
    // progress
    done: (t) => notes(t, [659, 880, 1319], 0.07, 0.12, { type: 'triangle', vol: 0.16 }),
    step: (t) => notes(t, [880, 1319], 0.08, 0.14, { type: 'triangle', vol: 0.14 }),
    coin: (t) => { tone(t, 988, 0.06, { vol: 0.12 }); tone(t + 0.06, 1319, 0.22, { vol: 0.12 }); },
    buy: (t) => { noise(t, 0.06, { filter: 'highpass', freq: 3000, vol: 0.06 }); notes(t + 0.03, [784, 1047], 0.06, 0.1, { type: 'triangle', vol: 0.14 }); },
    levelup: (t) => { notes(t, [523, 659, 784], 0.08, 0.1, { vol: 0.14 }); tone(t + 0.24, 1047, 0.4, { vol: 0.14 }); },
    fanfare: (t) => {
      notes(t, [523, 523, 523, 659], 0.11, 0.1, { vol: 0.14 });
      [784, 1047, 1319].forEach((f) => tone(t + 0.48, f, 0.7, { type: 'triangle', vol: 0.12 }));
    },
    // incidents and tickets
    alert: (t) => notes(t, [880, 660, 880, 660], 0.11, 0.1, { vol: 0.16 }),
    ping: (t) => tone(t, 1319, 0.3, { type: 'sine', vol: 0.16 }),
    // footsteps: a low heel thump and a short scuff on the floor, a little different every time
    foot: (t) => {
      const k = 0.9 + Math.random() * 0.2;
      tone(t, 110 * k, 0.06, { type: 'sine', to: 55, vol: 0.22 });
      noise(t + 0.005, 0.045, { filter: 'bandpass', freq: 1800 * k, rate: 0.8, vol: 0.09 });
    },
    // the break room: filling a cup at each machine…
    pour: (t) => { // water cooler: the tap clicks, water runs, the jug burps big bubbles
      tone(t, 1500, 0.02, { vol: 0.06 });
      stream(t + 0.03, 1.3, 520, 1700, 0.14);
      bubbles(t + 0.1, 1.1, 9, 650, 1300, 0.05);
      [0.35, 0.8].forEach((d) => tone(t + d, 150 + Math.random() * 40, 0.12, { type: 'sine', to: 320, vol: 0.16 }));
    },
    brew: (t) => { // coffee machine: button, pump buzz, steam, then the coffee dripping into the cup
      tone(t, 1200, 0.03, { vol: 0.06 });
      drone(t + 0.05, 65, 0.75, { type: 'square', vol: 0.05 });
      noise(t + 0.15, 0.6, { filter: 'highpass', freq: 3500, vol: 0.05 });
      stream(t + 0.7, 0.65, 700, 1300, 0.09, 6);
      bubbles(t + 0.7, 0.6, 5, 500, 900, 0.04);
    },
    kettle: (t) => { // tea: the kettle hisses up, then hot water into the mug
      noise(t, 0.6, { filter: 'bandpass', freq: 3000, vol: 0.06 });
      tone(t + 0.1, 1800, 0.5, { type: 'sine', to: 2400, vol: 0.03 });
      stream(t + 0.6, 0.75, 600, 1500, 0.12);
    },
    fridge: (t) => { // soda: the door thunks, a can clinks, "pssht" and fizz
      tone(t, 95, 0.12, { type: 'sine', to: 55, vol: 0.2 });
      noise(t, 0.08, { freq: 600, vol: 0.1 });
      tone(t + 0.35, 2600, 0.08, { type: 'sine', vol: 0.05 });
      noise(t + 0.75, 0.3, { filter: 'highpass', freq: 4000, vol: 0.16 });
      bubbles(t + 0.8, 0.5, 14, 3000, 5000, 0.015);
    },
    vend: (t) => { // vending machine: beep, the spiral motor turns, the can drops
      notes(t, [1319, 1568], 0.06, 0.05, { type: 'triangle', vol: 0.06 });
      drone(t + 0.15, 110, 0.6, { type: 'sawtooth', vol: 0.025 });
      tone(t + 0.8, 140, 0.12, { type: 'sine', to: 60, vol: 0.22 });
      noise(t + 0.8, 0.07, { freq: 900, vol: 0.12 });
    },
    micro: (t) => { // microwave: door, the hum while it spins, then the ding
      tone(t, 110, 0.08, { type: 'sine', to: 70, vol: 0.14 });
      drone(t + 0.1, 120, 2.1, { vol: 0.05 });
      drone(t + 0.1, 60, 2.1, { type: 'sine', vol: 0.07 });
      tone(t + 2.25, 1760, 0.7, { type: 'sine', vol: 0.12 });
      tone(t + 2.25, 2637, 0.5, { type: 'sine', vol: 0.04 });
    },
    rustle: (t) => { // a snack bag crinkling open
      for (let i = 0; i < 6; i++) noise(t + i * 0.07 + Math.random() * 0.04, 0.04, { filter: 'highpass', freq: 2500 + Math.random() * 2500, vol: 0.07 });
    },
    // …and drinking / eating it
    sip: (t) => { gulp(t, 0.16); if (Math.random() < 0.4) gulp(t + 0.28, 0.12); },
    sipHot: (t) => { noise(t, 0.18, { filter: 'bandpass', freq: 3200, vol: 0.06 }); gulp(t + 0.1, 0.13); }, // blows, then a careful sip
    sipFizz: (t) => { gulp(t, 0.15); bubbles(t + 0.05, 0.35, 8, 3000, 5000, 0.012); },
    munch: (t) => {
      for (let i = 0; i < 3; i++) noise(t + i * 0.16 + Math.random() * 0.03, 0.06, { filter: 'bandpass', freq: 1800 + Math.random() * 1200, vol: 0.11 });
    },
  };
  // which sound each machine makes while filling, and each cup while drinking it
  const FILL = { water: 'pour', coffee: 'brew', espresso: 'brew', coffeebar: 'brew', kettle: 'kettle', fridge: 'fridge', vending: 'vend', microwave: 'micro', snacks: 'rustle' };
  const SIP = { water: 'sip', coffee: 'sipHot', tea: 'sipHot', soda: 'sipFizz', snack: 'munch', food: 'munch' };
  // soft sounds (toasts, coins) step aside when a main sound plays at the same moment: an alert already
  // says "warning", the toast that comes with it stays quiet. light ones (click, steps) never collide.
  const SOFT = { tick: 1, ok: 1, warn: 1, coin: 1 };
  const LIGHT = { click: 1, foot: 1 };
  for (const k of Object.values(FILL).concat(Object.values(SIP))) LIGHT[k] = 1;

  // o (optional): { vol: 0…1, pan: -1 left … 1 right, key } — a sound placed in the room, like a
  // coworker's footsteps. key keeps the 60 ms repeat guard per source instead of per sound.
  function play(name, o) {
    const fn = BANK[name];
    if (!ctx || !fn || fxVol <= 0 || ctx.state !== 'running') return;
    const now = performance.now(), id = name + (o && o.key ? o.key : '');
    if (now - (last[id] || 0) < 60) return;
    last[id] = now;
    if (o) {
      const g = ctx.createGain(), p = ctx.createStereoPanner();
      g.gain.value = o.vol == null ? 1 : o.vol;
      p.pan.value = o.pan || 0;
      g.connect(p).connect(fx);
      dest = g;
      fn(ctx.currentTime);
      dest = null;
      setTimeout(() => g.disconnect(), 1500);
      return;
    }
    if (SOFT[name]) {
      if (now - lastHard < 200) return;
      setTimeout(() => { if (performance.now() - lastHard >= 200) fn(ctx.currentTime); }, 70);
      return;
    }
    if (!LIGHT[name]) lastHard = now;
    fn(ctx.currentTime);
  }

  /* ---------------- server-room hum ---------------- */
  // fans: band-passed noise; mains hum: a low sine. Both loop forever under one gain.
  function startHum(out) {
    amb = ctx.createGain();
    amb.gain.value = 0;
    amb.connect(out);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const fan = ctx.createGain();
    fan.gain.value = 0.5;
    src.connect(bp).connect(lp).connect(fan).connect(amb);
    src.start();
    const hum = ctx.createOscillator(), hg = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.value = 120;
    hg.gain.value = 0.05;
    hum.connect(hg).connect(amb);
    hum.start();
    applyHum();
  }
  function applyHum() {
    if (amb) amb.gain.setTargetAtTime(curve(ambVol) * 0.4 * humLevel, ctx.currentTime, 0.8);
    if (near) near.gain.setTargetAtTime(ambVol * 0.45 * nearLevel, ctx.currentTime, 0.25);
  }

  /* ---------------- racks near the player ---------------- */
  // a brighter fan whoosh with a faint whine on top, panned toward the racks
  function startNear(out) {
    near = ctx.createGain();
    near.gain.value = 0;
    nearPan = ctx.createStereoPanner();
    near.connect(nearPan).connect(out);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.93;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    src.connect(bp).connect(near);
    src.start();
    // the fans breathe a little: a slow wobble on the whoosh
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.35;
    lg.gain.value = 120;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
    const whine = ctx.createOscillator(), wg = ctx.createGain();
    whine.type = 'triangle';
    whine.frequency.value = 2400;
    wg.gain.value = 0.012;
    whine.connect(wg).connect(near);
    whine.start();
  }

  DL.audio = {
    play,
    // filling at a machine (by the object's kind) / one sip of a cup (by what is in it); o as in play
    fill: (kind, o) => FILL[kind] && play(FILL[kind], o),
    sip: (cup, o) => SIP[cup] && play(SIP[cup], o),
    // 0…1 each
    setVolume(effects, ambient) {
      fxVol = effects;
      ambVol = ambient;
      if (fx) fx.gain.setTargetAtTime(curve(fxVol), ctx.currentTime, 0.02);
      applyHum();
    },
    // how busy the room sounds: 0 = empty lot, 1 = full datacenter
    hum(level) {
      level = Math.max(0, Math.min(1, level));
      if (Math.abs(level - humLevel) < 0.01) return;
      humLevel = level;
      applyHum();
    },
    // the racks around the listener: 0 = none in earshot, 1 = right next to a busy one; pan -1…1
    near(level, pan) {
      level = Math.max(0, Math.min(1, level));
      if (nearPan) nearPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan || 0)), ctx.currentTime, 0.2);
      if (Math.abs(level - nearLevel) < 0.005) return;
      nearLevel = level;
      applyHum();
    },
  };
})();
