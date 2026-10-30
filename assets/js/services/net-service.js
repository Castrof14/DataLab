/* DataLab — Net service: how the players of a room reach each other. Nothing to install: the host's
   browser IS the room. Everyone connects straight to it (WebRTC data channels — on the same network the
   traffic never leaves it; over the internet it goes peer to peer through STUN). Supabase Realtime, which
   the game already uses, only carries the handshake: a guest knocks on the room's code, the host answers
   with an offer, the guest with an answer. After that Supabase is out of the loop.
   multiplayer.js sees one interface whatever is underneath: hostRoom / joinRoom → { on, send, close }.
   Messages are JSON with a type in "t". The host's side keeps the room: ids, who is in, the password,
   relaying characters and chat between guests, kicking, and telling everyone when it closes. */
(function () {
  'use strict';
  const DL = window.DL;
  const PROTO = 1;
  const MAX_GUESTS = 8;
  // STUN only finds the way through most home routers; a TURN relay (DATALAB_CONFIG.iceServers, e.g. a
  // free Metered or Cloudflare account) is what gets through the ones that block direct connections
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]
    .concat(Array.isArray((window.DATALAB_CONFIG || {}).iceServers) ? window.DATALAB_CONFIG.iceServers : []);
  const KNOCK_EVERY = 2000; // a knock can get lost: knock again until the host answers
  const FIND_MS = 15000;    // nobody answered the knocks in this long: there is no room with that code
  const LINK_MS = 22000;    // the host answered but the two computers never got connected (it gives up at 25 s)
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  const CHUNK = 16000; // data channel messages stay small; a world is sent in pieces
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

  // "k7p-2qx", "K7P2QX" or an invitation link → "K7P2QX" (null when it isn't a room code)
  function parseCode(text) {
    let s = String(text || '').trim();
    const m = /[#?&]sala=([^&#\s]+)/i.exec(s);
    if (m) s = decodeURIComponent(m[1]);
    s = s.toUpperCase().replace(/[\s-]/g, '');
    return new RegExp('^[' + CODE_CHARS + ']{6}$').test(s) ? s : null;
  }
  const showCode = (c) => c.slice(0, 3) + '-' + c.slice(3);
  const inviteLink = (c) => location.origin + location.pathname + '#sala=' + c;

  /* ------------------------------------------------------------------ */
  /* handshake through Supabase Realtime (one channel per room code)     */
  /* ------------------------------------------------------------------ */
  function signal(code, onMsg) {
    const client = DL.Cloud && DL.Cloud.client;
    if (!client || !client.channel) return null;
    const ch = client.channel('datalab-sala-' + code, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'sig' }, (ev) => { try { onMsg(ev.payload || {}); } catch (e) { console.error('net: handshake', e); } });
    const ready = new Promise((res) => {
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') res(true); else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') res(false); });
      setTimeout(() => res(false), 10000);
    });
    return { ready, send: (p) => ch.send({ type: 'broadcast', event: 'sig', payload: p }), close: () => { try { client.removeChannel(ch); } catch (e) { /* gone */ } } };
  }

  // the offer / answer go out once the ICE candidates are in (one message each way, no trickle)
  function gathered(pc, ms) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  /* ------------------------------------------------------------------ */
  /* data channel framing: big messages (a whole world) go in pieces     */
  /* ------------------------------------------------------------------ */
  let pieceSeq = 0;
  function sendText(dc, text) {
    if (!dc || dc.readyState !== 'open') return false;
    try {
      if (text.length <= CHUNK) { dc.send(text); return true; }
      const id = (++pieceSeq).toString(36), n = Math.ceil(text.length / CHUNK);
      for (let i = 0; i < n; i++) dc.send('\u0001' + id + ',' + i + ',' + n + ',' + text.slice(i * CHUNK, (i + 1) * CHUNK));
      return true;
    } catch (e) { return false; }
  }
  function reader(onMessage) {
    const parts = new Map();
    const parse = (text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (m && typeof m.t === 'string') onMessage(m); };
    return (data) => {
      if (typeof data !== 'string') return;
      if (data.charCodeAt(0) !== 1) return parse(data);
      const a = data.indexOf(','), b = data.indexOf(',', a + 1), c = data.indexOf(',', b + 1);
      const id = data.slice(1, a), i = +data.slice(a + 1, b), n = +data.slice(b + 1, c);
      let p = parts.get(id);
      if (!p) { p = { got: 0, list: new Array(n) }; parts.set(id, p); }
      if (p.list[i] === undefined) { p.list[i] = data.slice(c + 1); p.got++; }
      if (p.got === n) { parts.delete(id); parse(p.list.join('')); }
    };
  }

  // the object multiplayer.js talks to (same shape for host and guest)
  function makeConn() {
    const handlers = {};
    const N = { open: false, closed: false, closedBy: null, rtt: 0, backlog: 0 };
    const emit = (t, m) => (handlers[t] || []).forEach((fn) => { try { fn(m); } catch (e) { console.error('net', t, e); } });
    const conn = {
      on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); return conn; },
      send: () => false,
      close() {},
      get open() { return N.open; },
      get rtt() { return N.rtt; },
      // bytes still waiting to leave (the live stream skips a beat instead of piling up)
      get backlog() { return N.backlog; },
    };
    // closing is reported once, after the current message is handled
    const finish = (code, reason) => {
      if (N.closed) return;
      N.closed = true;
      const opened = N.open;
      N.open = false;
      setTimeout(() => emit('close', { code, reason: reason || '', clean: N.closedBy === 'me', opened }), 0);
    };
    return { conn, emit, N, finish };
  }

  /* ------------------------------------------------------------------ */
  /* the host: this browser keeps the room                               */
  /* ------------------------------------------------------------------ */
  function hostRoom(opts, hello) {
    const { conn, emit, N, finish } = makeConn();
    const code = newCode(), hostId = 'h' + rid();
    const room = { name: String(opts.name || 'Sala').slice(0, 40), code, locked: !!opts.pass };
    const pass = String(opts.pass || '');
    let hostLook = hello.look || null;
    const guests = new Map(); // id → { id, name, look, pc, dc, ok, seen }
    const local = (m) => emit(m.t, m);
    const text = (m) => JSON.stringify(m);
    const players = () => [{ id: hostId, name: hello.name, role: 'host', look: hostLook }]
      .concat(Array.from(guests.values()).filter((g) => g.ok).map((g) => ({ id: g.id, name: g.name, role: 'guest', look: g.look })));
    const toGuests = (m, except) => { const s = text(m); for (const g of guests.values()) if (g.ok && g !== except) sendText(g.dc, s); };
    const roster = () => { const m = { t: 'roster', players: players() }; local(m); toGuests(m); };

    function drop(g, why) {
      if (!guests.has(g.id)) return;
      guests.delete(g.id);
      clearTimeout(g.timer);
      setTimeout(() => { try { g.pc.close(); } catch (e) { /* closed */ } }, 300);
      if (!g.ok) return;
      const m = { t: 'leave', id: g.id, name: g.name, why };
      local(m);
      toGuests(m);
      roster();
    }
    function refuse(g, code, reason) { sendText(g.dc, text({ t: 'bye', code, reason })); setTimeout(() => drop(g, reason), 200); }

    function fromGuest(g, m) {
      g.seen = Date.now();
      if (!g.ok) {
        if (m.t !== 'hello') return refuse(g, 4002, 'diga olá primeiro');
        if (m.v !== PROTO) return refuse(g, 4000, 'versão diferente do jogo — atualize a página');
        if (pass && m.pass !== pass) return refuse(g, 4001, 'senha incorreta');
        if (Array.from(guests.values()).filter((x) => x.ok).length >= MAX_GUESTS) return refuse(g, 4008, 'sala cheia (' + MAX_GUESTS + ' convidados)');
        g.ok = true;
        clearTimeout(g.timer);
        g.name = String(m.name || 'Jogador').slice(0, 24);
        g.look = m.look && typeof m.look === 'object' ? m.look : null;
        sendText(g.dc, text({ t: 'welcome', id: g.id, role: 'guest', room, players: players(), hostId }));
        const j = { t: 'join', id: g.id, name: g.name };
        local(j);
        toGuests(j, g);
        roster();
        return;
      }
      if (m.t === 'ping') { sendText(g.dc, text({ t: 'pong', at: m.at })); return; }
      const out = Object.assign({}, m, { from: g.id });
      // characters, looks and chat go to everyone; the rest (changes to the world, requests) to the host
      if (m.t === 'pos' || m.t === 'say' || m.t === 'look') {
        if (m.t === 'look' && m.look) g.look = m.look;
        local(out);
        toGuests(out, g);
      } else local(out);
    }

    async function knock(from) {
      if (guests.has(from)) return;
      if (guests.size >= MAX_GUESTS + 2) { sig.send({ type: 'nope', to: from, code: 4008, reason: 'sala cheia' }); return; }
      const g = { id: from, ok: false, seen: Date.now() };
      guests.set(from, g);
      g.pc = new RTCPeerConnection({ iceServers: ICE });
      g.dc = g.pc.createDataChannel('datalab', { ordered: true });
      const read = reader((m) => fromGuest(g, m));
      g.dc.onmessage = (ev) => read(ev.data);
      g.dc.onclose = () => drop(g, 'saiu');
      g.pc.onconnectionstatechange = () => { if (g.pc.connectionState === 'failed') drop(g, 'conexão perdida'); };
      // a guest that never finishes connecting doesn't hold a place
      g.timer = setTimeout(() => { if (!g.ok) drop(g, 'não conectou'); }, 25000);
      await g.pc.setLocalDescription(await g.pc.createOffer());
      await gathered(g.pc, 3000);
      if (guests.get(from) === g) sig.send({ type: 'offer', to: from, sdp: g.pc.localDescription.toJSON() });
    }

    const sig = signal(code, (p) => {
      if (p.type === 'knock' && typeof p.from === 'string') knock(p.from);
      else if (p.type === 'answer') {
        const g = guests.get(p.from);
        if (g && !g.answered) { g.answered = true; g.pc.setRemoteDescription(p.sdp).catch(() => drop(g, 'falha na conexão')); }
      }
    });
    if (!sig) { finish(4006, 'entre na sua conta para criar uma sala'); return conn; }
    sig.ready.then((ok) => {
      if (N.closed) return;
      if (!ok) { sig.close(); finish(4006, 'o servidor de salas não respondeu — confira a internet'); return; }
      N.open = true;
      local({ t: 'welcome', id: hostId, role: 'host', room, players: players(), hostId });
      local({ t: 'roster', players: players() });
    });
    // guests that stop answering (Wi-Fi gone, laptop asleep) leave after ~15 s
    const watch = setInterval(() => {
      const now = Date.now();
      N.backlog = 0;
      for (const g of guests.values()) {
        if (g.ok && now - g.seen > 15000) drop(g, 'sem resposta');
        else if (g.dc && g.dc.readyState === 'open') N.backlog = Math.max(N.backlog, g.dc.bufferedAmount);
      }
    }, 1000);

    conn.send = (m) => {
      if (!N.open) return false;
      if (typeof m === 'string') m = JSON.parse(m);
      if (m.t === 'ping') return true;
      if (m.t === 'kick') { const g = guests.get(m.id); if (g) refuse(g, 4010, 'removido(a) pelo anfitrião'); return true; }
      if (m.t === 'look') hostLook = m.look;
      const out = Object.assign({}, m, { from: hostId });
      delete out.to;
      if (m.to) { const g = guests.get(m.to); if (g && g.ok) sendText(g.dc, text(out)); }
      else toGuests(out);
      return true;
    };
    conn.close = () => {
      N.closedBy = 'me';
      clearInterval(watch);
      for (const g of Array.from(guests.values())) { sendText(g.dc, text({ t: 'bye', code: 4005, reason: 'o anfitrião encerrou a sala' })); setTimeout(() => { try { g.pc.close(); } catch (e) { /* closed */ } }, 300); }
      guests.clear();
      sig.close();
      finish(1000, '');
    };
    return conn;
  }

  /* ------------------------------------------------------------------ */
  /* a guest: knock on the code, then talk straight to the host          */
  /* ------------------------------------------------------------------ */
  function joinRoom(code, hello) {
    const { conn, emit, N, finish } = makeConn();
    const me = 'g' + rid();
    let pc = null, dc = null, bye = null, seen = Date.now(), ping = 0, watch = 0, knocking = 0;
    const end = (c, reason) => {
      clearTimeout(knockT); clearInterval(knocking); clearInterval(ping); clearInterval(watch);
      if (sig) sig.close();
      if (pc) setTimeout(() => { try { pc.close(); } catch (e) { /* closed */ } }, 100);
      finish(bye ? bye.code : c, bye ? bye.reason : reason);
    };
    const read = reader((m) => {
      seen = Date.now();
      if (m.t === 'bye') { bye = m; return; }
      if (m.t === 'pong') { N.rtt = Math.round(performance.now() - m.at); return; }
      emit(m.t, m);
    });
    const sig = signal(code, async (p) => {
      if (p.to !== me || pc) {
        if (p.to === me && p.type === 'nope') end(p.code, p.reason);
        return;
      }
      if (p.type === 'nope') { end(p.code, p.reason); return; }
      if (p.type !== 'offer') return;
      // the room exists: stop knocking, and give the connection itself time to come up
      clearInterval(knocking);
      clearTimeout(knockT);
      knockT = setTimeout(() => { if (!N.open) end(1006, 'a sala existe, mas não deu para ligar os dois computadores — a rede de um de vocês bloqueia a conexão direta (tente outra rede, ex. o 4G do celular)'); }, LINK_MS);
      pc = new RTCPeerConnection({ iceServers: ICE });
      pc.ondatachannel = (ev) => {
        dc = ev.channel;
        dc.onopen = () => {
          N.open = true;
          clearTimeout(knockT);
          sig.close(); // the handshake is over: Supabase is out of the loop
          sendText(dc, JSON.stringify(Object.assign({ t: 'hello', v: PROTO }, hello)));
          ping = setInterval(() => { sendText(dc, JSON.stringify({ t: 'ping', at: performance.now() })); N.backlog = dc.bufferedAmount; }, 3000);
          // the host went silent (closed the tab, lost the network): give up after ~15 s
          watch = setInterval(() => { if (Date.now() - seen > 15000) end(1006, ''); }, 1000);
        };
        dc.onmessage = (ev) => read(ev.data);
        dc.onclose = () => end(1006, '');
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') end(1006, N.open ? '' : 'não foi possível ligar os dois computadores (rede bloqueando a conexão direta)'); };
      try {
        await pc.setRemoteDescription(p.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc, 3000);
        sig.send({ type: 'answer', from: me, sdp: pc.localDescription.toJSON() });
      } catch (e) { end(1006, 'falha na conexão com o anfitrião'); }
    });
    let knockT = 0;
    if (!sig) { end(4006, 'entre na sua conta para jogar online'); return conn; }
    sig.ready.then((ok) => {
      if (N.closed) return;
      if (!ok) { end(4006, 'o servidor de salas não respondeu — confira a internet'); return; }
      const knock = () => sig.send({ type: 'knock', from: me });
      knock();
      knocking = setInterval(knock, KNOCK_EVERY);
      knockT = setTimeout(() => { if (!pc) end(4004, 'nenhuma sala aberta com esse código — confira o código e se o anfitrião ainda está com a sala aberta'); }, FIND_MS);
    });

    conn.send = (m) => N.open && sendText(dc, typeof m === 'string' ? m : JSON.stringify(m));
    conn.close = () => { N.closedBy = 'me'; end(1000, ''); };
    return conn;
  }

  DL.Net = { PROTO, MAX_GUESTS, parseCode, showCode, inviteLink, hostRoom, joinRoom };
})();
