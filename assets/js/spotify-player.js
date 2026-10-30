/* DataLab — compact Spotify player in the game HUD: connect the account, show cover / track / artist
   and play-pause / next for whatever is playing on the player's own Spotify device.
   Talks only to services/spotify-service.js. Hidden when no spotifyClientId is configured. */
(function () {
  'use strict';
  const DL = window.DL, SP = DL.Spotify;
  const box = document.getElementById('spot');
  if (!box || !SP || !SP.enabled || DL.HERO) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && host.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
  const POLL_PLAYING = 5000, POLL_IDLE = 12000, PENDING_MS = 10 * 60 * 1000;
  const V = { track: undefined, msg: '', busy: false, timer: 0, pendingSince: 0, key: '' };

  const LOGO = '<svg class="spot__logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.2 9.3c3.9-1.2 8.4-.8 11.8 1.2M7 12.6c3.1-.9 6.6-.6 9.4 1M7.8 15.7c2.4-.6 5-.4 7.1.8" fill="none" stroke="#0a0a0a" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3 L13 8 L4.5 13 Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L10 8 L3 13 Z" fill="currentColor"/><rect x="11" y="3" width="2" height="10" fill="currentColor"/></svg>',
  };

  /* ---------------- views ---------------- */
  const head = (extra) => '<div class="spot__head">' + LOGO + '<span class="eyebrow-sm">Spotify</span>' + (extra || '') + '</div>';
  const msg = () => (V.msg ? '<p class="spot__msg" role="status">' + esc(V.msg) + '</p>' : '');

  function viewConnect() {
    return head() + '<p class="spot__note">Ouça a sua música enquanto cuida do datacenter.</p>' +
      '<button class="btn btn--sm spot__connect" type="button" data-sp="connect">Conectar Spotify</button>' + msg();
  }
  function viewPending() {
    return head() + '<p class="spot__note">Aguardando o login na janela do Spotify…</p>' +
      '<button class="btn btn--sm" type="button" data-sp="cancel">Cancelar</button>' + msg();
  }
  function viewPlayer() {
    const t = V.track;
    const x = '<button class="spot__x" type="button" data-sp="disconnect" title="Desconectar Spotify" aria-label="Desconectar Spotify">×</button>';
    if (!t || t.idle) {
      return head((t && t.device ? '<span class="spot__dev">' + esc(t.device) + '</span>' : '') + x) +
        '<p class="spot__note">Nada tocando. Dê play no app do Spotify (celular, PC ou web) e a música aparece aqui.</p>' + msg();
    }
    const img = safeUrl(t.image, /(^|\.)(scdn\.co|spotifycdn\.com)$/);
    const link = safeUrl(t.url, /^open\.spotify\.com$/);
    const title = link ? '<a class="spot__title" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="Abrir no Spotify">' + esc(t.title) + '</a>' : '<span class="spot__title">' + esc(t.title) + '</span>';
    return head((t.device ? '<span class="spot__dev" title="Tocando em ' + esc(t.device) + '">' + esc(t.device) + '</span>' : '') + x) +
      '<div class="spot__now">' +
        '<span class="spot__art">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(t.album ? 'Capa de ' + t.album : 'Capa') + '" referrerpolicy="no-referrer" loading="lazy">' : '') + '</span>' +
        '<span class="spot__meta">' + title + '<span class="spot__artist" title="' + esc(t.artist) + '">' + esc(t.artist) + '</span></span>' +
        '<span class="spot__ctl">' +
          '<button class="spot__b" type="button" data-sp="toggle" aria-label="' + (t.playing ? 'Pausar' : 'Tocar') + '" title="' + (t.playing ? 'Pausar' : 'Tocar') + '"' + (t.canToggle && !V.busy ? '' : ' disabled') + '>' + (t.playing ? ICON.pause : ICON.play) + '</button>' +
          '<button class="spot__b" type="button" data-sp="next" aria-label="Próxima faixa" title="Próxima faixa"' + (t.canNext && !V.busy ? '' : ' disabled') + '>' + ICON.next + '</button>' +
        '</span>' +
      '</div>' + msg();
  }

  function render() {
    const html = SP.connected ? viewPlayer() : V.pendingSince ? viewPending() : viewConnect();
    // the poll re-renders every few seconds: skip the DOM work (and the cover reload) when nothing changed
    if (html === V.key) return;
    V.key = html;
    box.innerHTML = html;
    box.classList.toggle('is-on', SP.connected);
    box.classList.toggle('is-playing', !!(V.track && V.track.playing));
  }

  /* ---------------- polling ---------------- */
  function schedule(ms) {
    clearTimeout(V.timer);
    V.timer = 0;
    if (!SP.connected || document.hidden) return;
    V.timer = setTimeout(poll, ms);
  }
  async function poll() {
    clearTimeout(V.timer);
    if (!SP.connected || document.hidden) return;
    const r = await SP.nowPlaying();
    if (r.ok) {
      V.track = r.data;
      if (V.msg === SP.MESSAGES.limit || V.msg === SP.MESSAGES.network || V.msg === SP.MESSAGES.device) V.msg = '';
      render();
      schedule(V.track && V.track.playing ? POLL_PLAYING : POLL_IDLE);
      return;
    }
    if (r.code === 'expired') return;   // the service already emitted 'change' (back to "Conectar")
    V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
    render();
    schedule(r.code === 'limit' ? r.retryAfter * 1000 : POLL_IDLE);
  }

  async function control(act) {
    const t = V.track;
    if (!t || V.busy) return;
    V.busy = true;
    const want = act === 'toggle' ? !t.playing : t.playing;
    if (act === 'toggle') t.playing = want;   // optimistic: the button flips right away
    V.msg = '';
    render();
    const r = await (act === 'next' ? SP.next() : want ? SP.play() : SP.pause());
    V.busy = false;
    if (!r.ok) {
      if (act === 'toggle') t.playing = !want;
      if (r.code !== 'expired') V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
    }
    render();
    // Spotify takes a moment to switch tracks / report the new state
    schedule(r.ok ? 700 : POLL_IDLE);
  }

  /* ---------------- wiring ---------------- */
  box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sp]');
    if (!b || b.disabled) return;
    b.blur();   // keep Space / Enter for the game, not for the last clicked button
    const act = b.dataset.sp;
    if (act === 'connect') {
      V.msg = '';
      const r = await SP.connect();
      if (r.ok) V.pendingSince = Date.now();
      else V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
      render();
    } else if (act === 'cancel') {
      V.pendingSince = 0;
      render();
    } else if (act === 'disconnect') {
      SP.disconnect();
    } else {
      control(act);
    }
  });

  SP.on('change', (info) => {
    V.pendingSince = 0;
    V.track = undefined;
    V.msg = info && info.reason === 'expired' ? SP.MESSAGES.expired : '';
    render();
    if (SP.connected) poll();
    else clearTimeout(V.timer);
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  // a login window left behind (closed without finishing) stops "Aguardando" after a while
  setInterval(() => { if (V.pendingSince && Date.now() - V.pendingSince > PENDING_MS) { V.pendingSince = 0; render(); } }, 30000);

  // sit right next to the finances card, whatever its height (it changes with the screen and its lines)
  const econ = document.getElementById('econBtn');
  if (econ && window.ResizeObserver) new ResizeObserver(() => box.style.setProperty('--econ-h', econ.offsetHeight + 6 + 'px')).observe(econ);

  box.hidden = false;
  render();
  if (SP.connected) poll();
})();
