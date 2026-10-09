/* DataLab — game entry: title screen (DATALAB + INICIAR) and the main menu (Novo Jogo, Carregar,
   Online, Loja, Marketplace, Tabela Global, Amigos, Salas da Semana). Sits on top of the demo that
   demo.js already built: the live scene runs behind it as the backdrop, and "Novo Jogo" hands over
   to the existing start card (#intro → preset → tutorial). Online features use local mocks only. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || DL.HERO) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const store = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const game = $('game'), root = $('title'), stage = $('titleStage');
  const view = $('menuView'), viewBody = $('menuViewBody');
  const BACKDROP = 'dcm';
  const M = { screen: 'title', sub: null };

  // Saves live in the player's account (services/save-service.js → Edge Function "game").

  /* ---------------- player identity (from the character editor) ---------------- */
  const playerProfile = () => D.crew.playerProfile || store.get('datalab.player.v1', null);
  const playerName = () => (playerProfile() && playerProfile().name) || 'Você';
  const sheetOf = (profile) => DL.makeSheet(profile ? DL.crewLook(profile) : DL.LOOKS.player);
  function drawFace(cv, sheet) {
    const k = 2;
    cv.width = cv.height = 16 * k;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
  }
  function friendCode() {
    let c = store.get('datalab.friendcode.v1', null);
    if (!c) {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      c = 'DL-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('') + '-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
      store.set('datalab.friendcode.v1', c);
    }
    return c;
  }

  /* ---------------- mocks (stand-ins until the online services exist) ---------------- */
  // Stats are seeded so the tables stay stable; looks come from the crew's own character generator.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const randomLook = () => D.crew.api.randomProfile();
  const HANDLES = ['nullroute', 'k8s_karen', 'pingdom', 'raidzero', 'byteBia', 'sudo_su', 'latencia0', 'rackstar', 'mtu9000', 'bgp_ana', 'cron_job', 'tux_lucas', 'packetloss', 'hotaisle'];
  const COUNTRIES = ['BR', 'PT', 'BR', 'AR', 'BR', 'MX', 'BR', 'CL', 'BR', 'US', 'BR', 'ES', 'BR', 'BR'];
  const PLAYERS = HANDLES.map((h, i) => {
    const p = randomLook();
    p.name = h;
    const lvl = 48 - i * 3 - Math.floor(rnd() * 3);
    return {
      name: h, profile: p, country: COUNTRIES[i], level: lvl,
      dcs: Math.round(lvl * 1.6 + rnd() * 6), uptime: 99.99 - i * 0.07 - rnd() * 0.05,
      incidents: Math.round(900 - i * 52 - rnd() * 30), score: Math.round(98400 - i * 5600 - rnd() * 2400),
      weekly: Math.round(5200 - i * 260 + (rnd() - 0.5) * 1600), trend: Math.round((rnd() - 0.4) * 6),
    };
  });
  const FRIENDS = [
    { who: 1, status: 'online', doing: 'No NOC · resolvendo incidente' },
    { who: 4, status: 'game', doing: 'Construindo · Datacenter médio' },
    { who: 7, status: 'online', doing: 'No menu principal' },
    { who: 10, status: 'away', doing: 'Ausente há 12 min' },
    { who: 12, status: 'offline', doing: 'Visto há 2 dias' },
  ];
  const REQUESTS = [{ who: 9, when: 'há 3 h' }];
  const STATUS = { online: 'Online', game: 'Em jogo', away: 'Ausente', offline: 'Offline' };

  const WEEKLY = [
    { title: 'Torre Aurora', by: 5, base: 'dcm', theme: 'servers', likes: 2841, visits: '18,2 mil', tag: 'Destaque da semana', blurb: 'Três fileiras com corredor frio confinado e cabeamento impecável.' },
    { title: 'NOC Meia-Noite', by: 2, base: 'noc', theme: 'noc', likes: 1975, visits: '11,4 mil', tag: 'Melhor NOC', blurb: 'Oito estações viradas para o painel, luz baixa e café sempre perto.' },
    { title: 'Neon Vault', by: 8, base: 'dcs', theme: 'gamer', likes: 1620, visits: '9,8 mil', tag: 'Mais criativo', blurb: 'RGB nas bordas, racks em U e um fliperama escondido na entrada.' },
    { title: 'Startup no Térreo', by: 3, base: 'office', theme: 'corporate', likes: 1288, visits: '7,1 mil', tag: 'Pequeno e eficiente', blurb: 'Escritório, recepção e um único rack que segura a empresa inteira.' },
    { title: 'Bunker Industrial', by: 11, base: 'dcs', theme: 'industrial', likes: 964, visits: '5,3 mil', tag: 'Escolha da equipe', blurb: 'Concreto, tubos de LED e refrigeração de precisão em linha.' },
    { title: 'Campus Verde', by: 0, base: 'dcm', theme: 'minimal', likes: 812, visits: '4,6 mil', tag: 'Eficiência energética', blurb: 'PUE de 1,18 com plantas por todo o NOC e salão silencioso.' },
  ];

  const MARKET = [
    { name: 'Layout “Corredor Frio”', kind: 'Layout de sala', seller: 6, price: 340, art: 'servers' },
    { name: 'Kit Recepção Moderna', kind: 'Móveis', seller: 2, price: 120, art: 'corporate' },
    { name: 'Tema Synthwave', kind: 'Tema de sala', seller: 8, price: 210, art: 'gamer' },
    { name: 'NOC Compacto 6 PCs', kind: 'Layout de sala', seller: 1, price: 280, art: 'noc' },
    { name: 'Pôster “Ping 1 ms”', kind: 'Decoração', seller: 13, price: 45, art: 'industrial' },
    { name: 'Rack Cabeado 42U', kind: 'Equipamento', seller: 4, price: 160, art: 'minimal' },
  ];

  /* ---------------- room thumbnails drawn from the preset layouts ---------------- */
  const THEME = {
    servers: { floor: '#1a2029', accent: '#a0c3ec' }, noc: { floor: '#141c2b', accent: '#7ee0a1' },
    gamer: { floor: '#1b1330', accent: '#c084fc' }, corporate: { floor: '#262220', accent: '#ffc285' },
    industrial: { floor: '#202224', accent: '#ff7a17' }, minimal: { floor: '#1d2120', accent: '#7ee0a1' },
  };
  const ITEM_COL = { rack: '#2b313b', desk: '#6b5a48', crac: '#a0c3ec', storage: '#c4b5fd', plant: '#7ee0a1', sofa: '#5a6170', table: '#6b5a48', whiteboard: '#e9e9e6' };
  function drawRoom(cv, presetId, theme, t) {
    const p = DL.PRESETS[presetId], def = p && p.def;
    const w = cv.clientWidth || 320, h = cv.clientHeight || 180, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = h * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = THEME[theme] || THEME.servers;
    g.fillStyle = '#08090b';
    g.fillRect(0, 0, w, h);
    // blueprint grid
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < w; x += 12) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
    for (let y = 0; y < h; y += 12) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    if (!def) return;
    const minX = Math.min(...def.rooms.map((r) => r.x)), minY = Math.min(...def.rooms.map((r) => r.y));
    const maxX = Math.max(...def.rooms.map((r) => r.x + r.w)), maxY = Math.max(...def.rooms.map((r) => r.y + r.h));
    const s = Math.min((w - 28) / (maxX - minX), (h - 28) / (maxY - minY));
    const ox = (w - (maxX - minX) * s) / 2 - minX * s, oy = (h - (maxY - minY) * s) / 2 - minY * s;
    for (const r of def.rooms) {
      g.fillStyle = r.floor === 'carpet' ? '#1e1c22' : th.floor;
      g.fillRect(ox + r.x * s, oy + r.y * s, r.w * s, r.h * s);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 1.5;
      g.strokeRect(ox + r.x * s + 0.5, oy + r.y * s + 0.5, r.w * s - 1, r.h * s - 1);
    }
    for (const [kind, tx, ty] of p.items || []) {
      const c = ITEM_COL[kind];
      if (!c) continue;
      g.fillStyle = c;
      const pad = kind === 'rack' ? 0.12 : 0.22;
      g.fillRect(ox + (tx + pad) * s, oy + (ty + pad) * s, s * (1 - pad * 2), s * (1 - pad * 2));
      if (kind === 'rack') {
        const on = Math.sin((t || 0) * 3 + tx * 1.7 + ty) > -0.2;
        g.fillStyle = on ? th.accent : 'rgba(255,255,255,0.15)';
        g.fillRect(ox + (tx + 0.3) * s, oy + (ty + 0.45) * s, Math.max(1, s * 0.4), Math.max(1, s * 0.12));
      }
    }
    // soft accent light along the room edges (the theme's RGB)
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, th.accent + '22');
    grd.addColorStop(1, 'transparent');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  /* ------------------------------------------------------------------ */
  /* Screens                                                            */
  /* ------------------------------------------------------------------ */
  const wallet = () => D.economy.wallet;
  const balanceHtml = () =>
    '<span class="mm-bal"><span class="cur cur--cr" aria-hidden="true">◆</span><b>' + fmt(wallet().credits) + '</b><span class="eyebrow-sm">créditos</span></span>' +
    '<span class="mm-bal"><span class="cur cur--dc" aria-hidden="true">⬢</span><b>' + fmt(wallet().gold || 0) + '</b><span class="eyebrow-sm">Gold</span></span>';
  const head = (eyebrow, title, extra) =>
    '<header class="mv__head"><button class="mv__back" type="button" data-go="menu" aria-label="Voltar ao menu"><span aria-hidden="true">←</span> Menu</button>' +
    '<div class="mv__titles"><p class="eyebrow-sm">' + eyebrow + '</p><h2 class="mv__title" id="menuViewTitle">' + title + '</h2></div>' + (extra || '') + '</header>';
  const soon = (text) => '<p class="mv__soon"><span class="dot dot--info" style="background:var(--breeze)"></span>' + text + '</p>';

  const SCREENS = {
    // the account's cloud saves (filled by hydrateSaves: they come from the server)
    load() {
      return head('Seus datacenters · salvos na sua conta', 'Carregar jogo') + '<div data-cloud-saves><p class="mv-note">Carregando seus saves…</p></div>';
    },
    online() {
      return head('Multijogador', 'Jogar online') +
        '<div class="mv-online"><div class="mv-online__orb" aria-hidden="true"><i></i><i></i><i></i><span></span></div>' +
        '<p class="eyebrow-sm"><span class="dot dot--warn dot--live"></span>&nbsp; Em breve — estamos desenvolvendo</p>' +
        '<h3 class="mv-online__title">O modo online está em desenvolvimento.</h3>' +
        '<p class="mv-online__text">Datacenters compartilhados, plantões em equipe e incidentes resolvidos juntos em tempo real. Enquanto isso, monte o seu e treine a equipe no modo solo.</p>' +
        '<ul class="mv-online__list"><li><b>Co-op</b>Opere o mesmo datacenter com amigos</li><li><b>Visitas</b>Entre nos datacenters da comunidade</li><li><b>Desafios</b>Incidentes semanais com ranking</li></ul>' +
        '<div class="mv-empty__actions"><button class="btn btn--primary" type="button" data-act="new">Jogar solo <span class="arrow">→</span></button><button class="btn" type="button" data-go="menu">Voltar</button></div></div>';
    },

    // the game's real shop and inventory (inventory.js), mounted here; purchases persist
    shop() {
      return head('Skins, roupas, eventos e bots lendários · em Gold', 'Loja') + '<p class="mv-note">Simulação de pagamento — nenhuma cobrança real. Os itens vão para o seu inventário e já valem no jogo.</p><div class="st st--menu" data-store-mount="shop"></div>';
    },
    inventory() {
      return head('Seus itens · equipar, vender, raridades', 'Inventário') + '<div class="st st--menu" data-store-mount="inv"></div>';
    },

    market() {
      let h = head('Comunidade', 'Marketplace', '<span class="tag mv__badge">Em breve</span>');
      h += '<div class="mv-banner"><div><p class="eyebrow-sm">Negocie com outros jogadores</p><b>Compre e venda layouts, temas e decorações criados pela comunidade.</b>' +
        '<p>O marketplace chega junto com o modo online. Esta é uma prévia de como vai funcionar.</p></div>' +
        '<div class="mv-search"><input class="input" type="search" placeholder="Buscar layouts, temas, móveis…" aria-label="Buscar no marketplace" disabled></div></div>';
      h += '<div class="mv-grid mv-grid--market">' + MARKET.map((m) => {
        const s = PLAYERS[m.seller];
        return '<article class="mv-item is-locked"><div class="mv-item__art" style="background:linear-gradient(135deg,#0b0c0e,' + THEME[m.art].floor + ' 50%,' + THEME[m.art].accent + '66)"><span class="eyebrow-sm">' + m.kind + '</span></div>' +
          '<div class="mv-item__body"><b>' + m.name + '</b><p>por @' + s.name + '</p></div>' +
          '<div class="mv-item__foot"><span class="mv-price"><span class="cur cur--dc">⬢</span>' + m.price + '</span><button class="btn btn--sm" type="button" data-act="soon" data-what="O marketplace">Em breve</button></div></article>';
      }).join('') + '</div>';
      return h;
    },

    ranking() {
      const me = { name: playerName(), me: true, level: 1 + Math.floor((wallet().credits || 0) / 150), dcs: wallet().counters.datacenters || 0, uptime: 99.5, incidents: wallet().counters.incidents || 0, score: Math.round(wallet().credits * 10), weekly: Math.round(wallet().credits * 2), trend: 0 };
      let h = head('Temporada 1 · semana 40', 'Tabela global', '<div class="mv-tabs" role="tablist">' +
        [['score', 'Geral'], ['weekly', 'Semanal'], ['friends', 'Amigos']].map(([k, l], i) => '<button type="button" role="tab" class="mv-tab' + (i === 0 ? ' is-on' : '') + '" data-rank="' + k + '">' + l + '</button>').join('') + '</div>');
      h += '<div class="mv-podium" id="rankPodium"></div><div class="mv-table-wrap"><table class="mv-table"><thead><tr><th>#</th><th>Jogador</th><th class="n">Nível</th><th class="n hide-sm">Datacenters</th><th class="n hide-sm">Uptime</th><th class="n hide-sm">Incidentes</th><th class="n">Pontos</th></tr></thead><tbody id="rankBody"></tbody></table></div>';
      h += soon('Dados simulados — o ranking real chega com o modo online.');
      M.rankMe = me;
      return h;
    },

    friends() {
      const prof = playerProfile();
      let h = head('Social', 'Amigos', '<span class="tag mv__badge">' + FRIENDS.filter((f) => f.status !== 'offline').length + ' online</span>');
      h += '<div class="mv-me"><canvas class="mv-face mv-face--lg" data-face="me"></canvas><div><b>' + esc(playerName()) + '</b><span class="eyebrow-sm">' + (prof && DL.ROLES[prof.role] ? DL.ROLES[prof.role].name : 'Operador(a)') + '</span></div>' +
        '<div class="mv-code"><span class="eyebrow-sm">Seu código</span><b>' + friendCode() + '</b><button class="btn btn--sm" type="button" data-act="copy-code">Copiar</button></div></div>';
      h += '<form class="mv-add" data-form="add-friend"><input class="input" type="text" placeholder="Adicionar por código ou @nome" aria-label="Código ou nome do amigo" maxlength="24"><button class="btn btn--sm" type="submit">Enviar convite</button></form>';
      h += '<span class="eyebrow-sm mv-sub">Pedidos de amizade · ' + REQUESTS.length + '</span><ul class="mv-friends">' + REQUESTS.map((r) => {
        const p = PLAYERS[r.who];
        return '<li class="mv-friend"><canvas class="mv-face" data-face="' + r.who + '"></canvas><div class="mv-friend__who"><b>@' + p.name + '</b><span>Nível ' + p.level + ' · ' + r.when + '</span></div>' +
          '<div class="mv-friend__acts"><button class="btn btn--sm btn--primary" type="button" data-act="soon" data-what="Aceitar amizades">Aceitar</button><button class="btn btn--sm" type="button" data-act="soon" data-what="Recusar amizades">Recusar</button></div></li>';
      }).join('') + '</ul>';
      h += '<span class="eyebrow-sm mv-sub">Amigos · ' + FRIENDS.length + '</span><ul class="mv-friends">' + FRIENDS.map((f) => {
        const p = PLAYERS[f.who];
        return '<li class="mv-friend is-' + f.status + '"><span class="mv-face-wrap"><canvas class="mv-face" data-face="' + f.who + '"></canvas><i class="mv-st" title="' + STATUS[f.status] + '"></i></span>' +
          '<div class="mv-friend__who"><b>@' + p.name + '</b><span>' + STATUS[f.status] + ' · ' + f.doing + '</span></div>' +
          '<div class="mv-friend__acts"><button class="btn btn--sm" type="button" data-act="soon" data-what="Visitar datacenters"' + (f.status === 'offline' ? ' disabled' : '') + '>Visitar</button><button class="btn btn--sm" type="button" data-act="soon" data-what="Convidar para jogar">Convidar</button></div></li>';
      }).join('') + '</ul>';
      h += soon('Amigos fictícios para pré-visualização — convites e visitas chegam com o modo online.');
      return h;
    },

    weekly() {
      let h = head('Inspiração da comunidade', 'Salas da semana', '<span class="tag mv__badge">Semana 40</span>');
      const [top, ...rest] = WEEKLY;
      const card = (r, i, big) => {
        const p = PLAYERS[r.by];
        return '<article class="mv-room' + (big ? ' mv-room--top' : '') + '" style="--d:' + (i * 60) + 'ms"><div class="mv-room__art"><canvas data-room="' + r.base + '" data-theme="' + r.theme + '"></canvas><span class="mv-room__tag">' + r.tag + '</span></div>' +
          '<div class="mv-room__body"><b>' + r.title + '</b><span class="mv-room__by"><canvas class="mv-face mv-face--sm" data-face="' + r.by + '"></canvas>@' + p.name + '</span>' + (big ? '<p>' + r.blurb + '</p>' : '') +
          '<span class="mv-room__stats"><span>♥ ' + fmt(r.likes) + '</span><span>◎ ' + r.visits + ' visitas</span></span></div>' +
          '<div class="mv-room__acts"><button class="btn btn--sm' + (big ? ' btn--primary' : '') + '" type="button" data-act="use-room" data-base="' + r.base + '">Começar com esta base</button>' +
          (big ? '<button class="btn btn--sm" type="button" data-act="soon" data-what="Visitar salas da comunidade">Visitar</button>' : '') + '</div></article>';
      };
      h += card(top, 0, true) + '<div class="mv-rooms">' + rest.map((r, i) => card(r, i + 1, false)).join('') + '</div>';
      h += soon('Salas de exemplo — a votação semanal da comunidade chega com o modo online.');
      return h;
    },
  };

  /* ---------------- post-render hydration (canvases, tables) ---------------- */
  function hydrate() {
    viewBody.querySelectorAll('canvas[data-face]').forEach((cv) => {
      const k = cv.dataset.face;
      drawFace(cv, k === 'me' ? sheetOf(playerProfile()) : (PLAYERS[k].sheet = PLAYERS[k].sheet || sheetOf(PLAYERS[k].profile)));
    });
    drawRooms(0);
    if (M.sub === 'ranking') renderRanking('score');
    if (viewBody.querySelector('[data-cloud-saves]')) hydrateSaves();
    const mount = viewBody.querySelector('[data-store-mount]');
    if (mount && D.inventory) {
      const opts = { go: (id) => openSub(id === 'inv' ? 'inventory' : id) };
      if (mount.dataset.storeMount === 'shop') D.inventory.mountShop(mount, opts);
      else D.inventory.mountInventory(mount, opts);
    }
  }
  // the 3 save slots of the account (slots created at signup but never played show as empty)
  async function hydrateSaves() {
    const box = viewBody.querySelector('[data-cloud-saves]');
    if (!box || !DL.SaveService) return;
    const list = await DL.SaveService.listCloud();
    if (!viewBody.contains(box)) return;
    const played = list.filter((s) => s.version > 0);
    let h = '';
    if (!played.length) {
      h += '<div class="mv-empty"><div class="mv-empty__art" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<b>Nenhum jogo salvo ainda</b><p>Seu primeiro datacenter é salvo na sua conta automaticamente: comece um Novo jogo.</p>' +
        '<div class="mv-empty__actions"><button class="btn btn--primary" type="button" data-act="new">Começar um novo jogo <span class="arrow">→</span></button></div></div>';
    } else {
      h += '<ul class="mv-saves">' + played.map((s) => {
        const st = s.stats || {}, d = new Date(s.updated_at);
        return '<li class="mv-save"><canvas class="mv-save__map" data-room="zero" data-theme="servers"></canvas>' +
          '<div class="mv-save__info"><b>' + esc(s.name || 'Meu datacenter') + '</b><span class="eyebrow-sm">Espaço ' + s.slot + ' · ' + d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
          '<span class="mv-save__stats">' + (st.rooms || 0) + ' salas · ' + (st.racks || 0) + ' racks · ' + (st.servers || 0) + ' servidores · ' + (st.crew || 0) + ' pessoas · $' + fmt(st.cash || 0) + '</span></div>' +
          '<div class="mv-save__acts"><button class="btn btn--sm btn--primary" type="button" data-act="load" data-id="' + s.slot + '">Continuar</button>' +
          '<button class="btn btn--sm" type="button" data-act="del-save" data-id="' + s.slot + '">Excluir</button></div></li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = h;
    drawRooms(0);
  }

  function drawRooms(t) {
    viewBody.querySelectorAll('canvas[data-room]').forEach((cv) => drawRoom(cv, cv.dataset.room, cv.dataset.theme, t));
  }

  function renderRanking(kind) {
    const list = kind === 'friends' ? FRIENDS.map((f) => PLAYERS[f.who]).concat([M.rankMe]) : PLAYERS.concat([M.rankMe]);
    const key = kind === 'weekly' ? 'weekly' : 'score';
    const rows = list.slice().sort((a, b) => b[key] - a[key]);
    const podium = rows.slice(0, 3);
    $('rankPodium').innerHTML = [1, 0, 2].map((i) => {
      const p = podium[i];
      if (!p) return '';
      return '<div class="mv-pod mv-pod--' + (i + 1) + '"><canvas class="mv-face mv-face--lg" data-rf="' + (p.me ? 'me' : PLAYERS.indexOf(p)) + '"></canvas><b>' + esc(p.me ? p.name : '@' + p.name) + '</b>' +
        '<span class="mv-pod__pts">' + fmt(p[key]) + ' pts</span><span class="mv-pod__step">' + (i + 1) + '</span></div>';
    }).join('');
    $('rankBody').innerHTML = rows.map((p, i) =>
      '<tr class="' + (p.me ? 'is-me' : '') + '" style="--d:' + Math.min(i, 14) * 30 + 'ms"><td class="rk">' + (i + 1) + '</td><td><span class="mv-player"><canvas class="mv-face mv-face--sm" data-rf="' + (p.me ? 'me' : PLAYERS.indexOf(p)) + '"></canvas>' +
      '<b>' + esc(p.me ? p.name + ' (você)' : '@' + p.name) + '</b>' + (p.country ? '<span class="mv-cc">' + p.country + '</span>' : '') + '</span></td>' +
      '<td class="n">' + p.level + '</td><td class="n hide-sm">' + p.dcs + '</td><td class="n hide-sm">' + p.uptime.toFixed(2).replace('.', ',') + '%</td><td class="n hide-sm">' + fmt(p.incidents) + '</td>' +
      '<td class="n"><b>' + fmt(p[key]) + '</b>' + (p.trend ? '<span class="mv-trend ' + (p.trend > 0 ? 'up' : 'down') + '">' + (p.trend > 0 ? '▲' : '▼') + Math.abs(p.trend) + '</span>' : '') + '</td></tr>'
    ).join('');
    viewBody.querySelectorAll('canvas[data-rf]').forEach((cv) => {
      const k = cv.dataset.rf;
      drawFace(cv, k === 'me' ? sheetOf(playerProfile()) : (PLAYERS[k].sheet = PLAYERS[k].sheet || sheetOf(PLAYERS[k].profile)));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */
  function setScreen(s) {
    M.screen = s;
    root.dataset.screen = s;
    if (s === 'title') setTimeout(() => $('titleStart').focus({ preventScroll: true }), 50);
    if (s === 'menu') {
      closeSub(true);
      refreshMenuMeta();
      setTimeout(() => { const b = root.querySelector('.mm-item[data-go="' + (M.last || 'new') + '"]') || root.querySelector('.mm-item'); if (b) b.focus({ preventScroll: true }); }, 60);
    }
  }

  function openSub(id) {
    if (!SCREENS[id]) return;
    M.sub = id;
    M.last = id;
    root.querySelectorAll('.mm-item').forEach((b) => b.classList.toggle('is-on', b.dataset.go === id));
    viewBody.innerHTML = SCREENS[id]();
    viewBody.scrollTop = 0;
    view.hidden = false;
    view.classList.remove('is-in');
    void view.offsetWidth; // restart the entry animation
    view.classList.add('is-in');
    root.classList.add('has-sub');
    hydrate();
    const back = viewBody.querySelector('.mv__back');
    if (back) back.focus({ preventScroll: true });
  }

  function closeSub(silent) {
    if (!M.sub) return;
    const was = M.sub;
    M.sub = null;
    root.classList.remove('has-sub');
    view.classList.remove('is-in');
    view.hidden = true;
    viewBody.innerHTML = '';
    root.querySelectorAll('.mm-item').forEach((b) => b.classList.remove('is-on'));
    if (!silent) { const b = root.querySelector('.mm-item[data-go="' + was + '"]'); if (b) b.focus({ preventScroll: true }); }
  }

  function refreshMenuMeta() {
    $('mmName').textContent = playerName();
    const prof = playerProfile();
    $('mmRole').textContent = (M.account ? '@' + M.account.username + ' · ' : '') + (prof && DL.ROLES[prof.role] ? DL.ROLES[prof.role].name : 'Operador(a)');
    if (M.account && $('titleUser')) $('titleUser').textContent = 'Conectado como @' + M.account.username;
    drawFace($('mmFace'), sheetOf(playerProfile()));
    $('mmBal').innerHTML = balanceHtml();
    if (DL.SaveService && DL.Cloud && DL.Cloud.signedIn) DL.SaveService.listCloud().then((list) => {
      const n = list.filter((x) => x.version > 0).length;
      $('mmSaves').textContent = n ? n + (n === 1 ? ' jogo salvo na conta' : ' jogos salvos na conta') : 'Nenhum jogo salvo ainda';
    });
  }

  // Leave the menu and hand over to the existing start card (tutorial). Every new game starts from scratch.
  function newGame() {
    closeSub(true);
    root.classList.add('is-leaving');
    setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving');
      game.classList.remove('is-title');
      D.scene.o.attract = false;
      D.choosePreset('zero');
      $('intro').classList.add('is-open');
      $('tutStart').focus({ preventScroll: true });
    }, 520);
  }

  // Back from the start card to the main menu (before the game has begun).
  function backToMenu() {
    if (D.state.phase !== 'intro') return;
    $('intro').classList.remove('is-open');
    showBackdrop();
    root.hidden = false;
    setScreen('menu');
  }

  function showBackdrop() {
    game.classList.add('is-title');
    D.choosePreset(BACKDROP);
    D.scene.o.attract = true;
  }

  // Continue a cloud save: leave the menu, the game restores the world from the server (cloud-sync.js)
  async function loadSave(slot) {
    closeSub(true);
    root.hidden = true;
    game.classList.remove('is-title');
    D.scene.o.attract = false;
    const r = await DL.CloudSync.load(+slot);
    if (!r.ok) { game.classList.add('is-title'); root.hidden = false; setScreen('menu'); flash(r.message || 'Não foi possível carregar.', 'warn'); }
  }
  async function deleteSave(btn) {
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Confirmar exclusão'; return; }
    btn.disabled = true;
    const r = await DL.SaveService.remove(+btn.dataset.id);
    flash(r.ok ? 'Save excluído.' : r.message, r.ok ? 'ok' : 'warn');
    refreshMenuMeta();
    openSub('load');
  }
  function soonToast(what) {
    flash((what || 'Este recurso') + ' chega com o modo online — estamos desenvolvendo.');
  }
  let flashT = 0;
  function flash(text, tone) {
    const el = $('menuFlash');
    el.textContent = text;
    el.className = 'mm-flash is-on' + (tone ? ' mm-flash--' + tone : '');
    clearTimeout(flashT);
    flashT = setTimeout(() => el.classList.remove('is-on'), 2800);
  }

  /* ---------------- actions ---------------- */
  root.addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-go]');
    if (go) {
      const id = go.dataset.go;
      if (id === 'menu') return closeSub();
      if (id === 'new') return newGame('zero');
      if (id === 'account') return DL.AccountUI && DL.AccountUI.open();
      return openSub(id);
    }
    const tab = ev.target.closest('[data-rank]');
    if (tab) {
      tab.parentElement.querySelectorAll('.mv-tab').forEach((t) => t.classList.toggle('is-on', t === tab));
      renderRanking(tab.dataset.rank);
      return;
    }
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'new': return newGame('zero');
      case 'use-room': return newGame(a.dataset.base);
      case 'load': return loadSave(a.dataset.id);
      case 'del-save': return deleteSave(a);
      case 'soon': return soonToast(a.dataset.what);
      case 'copy-code': {
        const c = friendCode();
        if (navigator.clipboard) navigator.clipboard.writeText(c).catch(() => {});
        return flash('Código ' + c + ' copiado.', 'ok');
      }
    }
  });
  // balances in the menu footer follow every purchase / sale / exchange
  D.game.on('wallet', () => { if (!root.hidden) $('mmBal').innerHTML = balanceHtml(); });
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = ev.target.querySelector('input');
    const v = inp && inp.value.trim();
    flash(v ? 'Convite para ' + v + ' guardado — será enviado quando o modo online chegar.' : 'Digite um código (DL-XXXX-XXXX) ou @nome.', v ? 'ok' : 'warn');
    if (inp) inp.value = '';
  });

  $('titleStart').addEventListener('click', () => setScreen('menu'));
  stage.addEventListener('click', (ev) => { if (M.screen === 'title' && !ev.target.closest('a,button')) setScreen('menu'); });
  $('introMenu').addEventListener('click', backToMenu);

  // Keys: the menu owns the keyboard while it is up (runs before demo.js' own handler).
  addEventListener('keydown', (ev) => {
    if (root.hidden) return;
    if (DL.AccountUI && DL.AccountUI.isOpen) { if (ev.code === 'Escape') { DL.AccountUI.close(); ev.preventDefault(); } ev.stopImmediatePropagation(); return; }
    ev.stopImmediatePropagation();
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (ev.code === 'Escape') {
      ev.preventDefault();
      if (M.sub) closeSub();
      else if (M.screen === 'menu') setScreen('title');
      return;
    }
    if (typing) return;
    if (M.screen === 'title' && (ev.code === 'Enter' || ev.code === 'Space')) { ev.preventDefault(); setScreen('menu'); return; }
    if (M.screen === 'menu' && !M.sub && (ev.code === 'ArrowDown' || ev.code === 'ArrowUp')) {
      ev.preventDefault();
      const items = Array.from(root.querySelectorAll('.mm-item'));
      const i = items.indexOf(document.activeElement);
      items[(i + (ev.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }, true);

  // animated thumbnails while a screen with rooms is open
  (function tick(now) {
    if (!root.hidden && (M.sub === 'weekly' || M.sub === 'load')) drawRooms(now / 1000);
    requestAnimationFrame(tick);
  })(0);
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (M.sub) drawRooms(0); }, 120); });

  /* ---------------- boot: title screen over the live datacenter ---------------- */
  $('intro').classList.remove('is-open');
  showBackdrop();
  root.hidden = false;
  refreshMenuMeta();
  setScreen('title');
  requestAnimationFrame(() => root.classList.add('is-ready'));

  // leave the account (auth-gate.js brings the login back when the session ends)
  const logoutBtn = $('mmLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Saindo…';
    await DL.Auth.signOut();
  });
  // in game: "Menu" saves to the cloud and goes back to the Main Menu
  const menuBtn = $('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', async () => {
    menuBtn.disabled = true;
    menuBtn.textContent = 'Salvando…';
    if (DL.SaveService && DL.SaveService.slot) {
      const r = await DL.SaveService.save({});
      if (!r.ok && r.code !== 'idle') { D.game.toast('warn', 'Não foi possível salvar', r.message + ' · tente de novo'); menuBtn.disabled = false; menuBtn.textContent = 'Menu'; return; }
    }
    location.replace(location.pathname); // the session stays: straight back to the Main Menu
  });

  // in game: "Salvar" (or Ctrl/Cmd+S) saves to the cloud slot without leaving
  const saveBtn = $('saveBtn');
  async function saveNow() {
    if (!saveBtn || saveBtn.disabled) return;
    if (!DL.SaveService || !DL.SaveService.slot || !DL.Cloud || !DL.Cloud.signedIn) { D.game.toast('warn', 'Não foi possível salvar', 'Entre na sua conta e escolha um espaço de save para salvar o jogo.'); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';
    const r = await DL.SaveService.save({});
    saveBtn.disabled = false;
    if (r.ok) {
      saveBtn.textContent = 'Salvo ✓';
      D.game.toast('ok', 'Jogo salvo', 'Seu progresso foi salvo na sua conta.');
      setTimeout(() => { saveBtn.textContent = 'Salvar'; }, 2000);
    } else {
      saveBtn.textContent = 'Salvar';
      D.game.toast('warn', 'Não foi possível salvar', r.message + ' · tente de novo');
    }
  }
  if (saveBtn) saveBtn.addEventListener('click', saveNow);
  addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyS' && D.state && D.state.phase === 'play') { ev.preventDefault(); saveNow(); }
  });

  D.menu = { open: (id) => (id ? openSub(id) : setScreen('menu')), close: closeSub, newGame, backToMenu, get screen() { return M.screen; }, get sub() { return M.sub; },
    // the logged-in account (auth-gate.js): shown in the menu footer and on the title screen
    setAccount(p) { M.account = p; refreshMenuMeta(); },
    refresh: refreshMenuMeta };
})();
