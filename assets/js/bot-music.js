/* DataLab — simulated music for the bots (no Spotify: a made-up catalog, all bands and songs are fictional).
   Each bot gets a taste (genre) from its id, plays that genre's playlist on loop and pauses while it
   talks or is off shift. crew.js shows it on the nametag (♪) and in the bot's card. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  // [title, artist] per genre; durations come from the title hash (2:30 to 4:20)
  const GENRES = [
    { id: 'lofi', name: 'Lo-fi', colors: ['#6b7cff', '#c38bff'], tracks: [
      ['Café & Commits', 'Lofi do Rack'], ['Chuva no Datacenter', 'Lofi do Rack'], ['Ping 12ms', 'Beatriz Beats'],
      ['Madrugada de Deploy', 'Soneca.exe'], ['Ventoinha Suave', 'Soneca.exe']] },
    { id: 'synth', name: 'Synthwave', colors: ['#ff2bd6', '#2bd9ff'], tracks: [
      ['Neon Ethernet', 'Fibra Óptica'], ['Overclock 1987', 'Fibra Óptica'], ['Retrô Kernel', 'VHS Club'],
      ['Sinal Verde', 'VHS Club'], ['Noite em 8 Bits', 'Arcade Sul']] },
    { id: 'rock', name: 'Rock', colors: ['#ff4d3d', '#2a2a2e'], tracks: [
      ['Kernel Panic', 'Os Desfragmentados'], ['Tela Azul', 'Os Desfragmentados'], ['Root sem Senha', 'Banda Larga'],
      ['Firewall de Fogo', 'Banda Larga'], ['Reboot', 'Curto-Circuito']] },
    { id: 'sertanejo', name: 'Sertanejo', colors: ['#f2a24e', '#7a4a1f'], tracks: [
      ['Saudade do Wi-Fi', 'Zé Cabo & Conector'], ['Modem de Pião', 'Zé Cabo & Conector'], ['Coração Sem Sinal', 'Dupla Fibra'],
      ['Boteco do Servidor', 'Dupla Fibra'], ['A Ligação Caiu', 'Dupla Fibra']] },
    { id: 'funk', name: 'Funk', colors: ['#ffd23f', '#ff3d8b'], tracks: [
      ['Baile do Backup', 'MC Byte'], ['Tá Tranquilo, Tá Online', 'MC Byte'], ['Rebola o Rack', 'MC Latência'],
      ['Pancadão do Ping', 'MC Latência'], ['Bota o Cabo', 'DJ Patch']] },
    { id: 'pagode', name: 'Pagode', colors: ['#2fbf71', '#f2c14e'], tracks: [
      ['Samba do Switch', 'Grupo Gigabit'], ['Domingo de Manutenção', 'Grupo Gigabit'], ['Roda de Log', 'Pagode.zip'],
      ['Ninguém Lê o Manual', 'Pagode.zip'], ['Cerveja e Cache', 'Grupo Gigabit']] },
    { id: 'eletronica', name: 'Eletrônica', colors: ['#00e0b0', '#3a2bff'], tracks: [
      ['Packet Loss', 'DJ Router'], ['Bassline de 10 Gbps', 'DJ Router'], ['Latência Zero', 'Nuvem Privada'],
      ['Loop Infinito', 'Nuvem Privada'], ['Handshake', 'Kilobyte']] },
    { id: 'mpb', name: 'MPB', colors: ['#4ec3e0', '#e0c27a'], tracks: [
      ['Garoa no Cabo', 'Lúcia Lan'], ['Mar de Pixels', 'Lúcia Lan'], ['Ainda Compila', 'Tom Terminal'],
      ['Canção do Uptime', 'Tom Terminal'], ['Paleta de Logs', 'Tom Terminal']] },
  ];

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const durOf = (t) => 150 + (hash(t[0]) % 111);

  // per bot: where it is in its playlist (kept off the crew object so it never reaches the save)
  const PLAY = new WeakMap();

  // a bot is listening unless it is talking, leaving or off shift
  function playingNow(c) {
    if (!c || c.off || c.state === 'leaving' || c.state === 'off' || c.state === 'talking') return false;
    return !(c.talkT > 0 && c.talkWith);
  }

  // what this bot is listening to right now: { playing, title, artist, genre, colors, pos, dur }
  function of(a) {
    const c = a && a.crew;
    if (!c) return null;
    let m = PLAY.get(a);
    const now = performance.now();
    if (!m) {
      const h = hash(c.id || c.name);
      const g = GENRES[h % GENRES.length];
      const i = (h >>> 8) % g.tracks.length;
      m = { g, i, pos: ((h >>> 16) % 1000) / 1000 * durOf(g.tracks[i]), t: now };
      PLAY.set(a, m);
    }
    const playing = playingNow(c);
    if (playing) {
      m.pos += Math.min(600, (now - m.t) / 1000);
      while (m.pos >= durOf(m.g.tracks[m.i])) { m.pos -= durOf(m.g.tracks[m.i]); m.i = (m.i + 1) % m.g.tracks.length; }
    }
    m.t = now;
    const tr = m.g.tracks[m.i];
    return { playing, title: tr[0], artist: tr[1], genre: m.g.name, colors: m.g.colors, pos: m.pos, dur: durOf(tr) };
  }

  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  DL.BotMusic = { of, clock };
})();
