/* DataLab — talk: a one-to-one conversation with a crew member, as part of the gameplay.
   Answers come from rules over the real state: the person's role and level (what they know and
   how precisely they explain it), their current task, the problems found, the network, the
   company's money and what is missing to complete the datacenter. They can also act: go fix a
   problem, call a colleague who can, or point at it on the map. Important findings arrive on
   their own as a "wants to talk" notice. No external AI. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm0 = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Informal Portuguese: "vc tbm tá de boa?" → "voce tambem esta de boa?" (also used by staff.js)
  const SLANG = {
    vc: 'voce', vcs: 'voces', ce: 'voce', oce: 'voce', tb: 'tambem', tbm: 'tambem', tl: 'ta ligado', tlgd: 'ta ligado', blz: 'beleza', bele: 'beleza',
    pq: 'porque', q: 'que', n: 'nao', nn: 'nao', naum: 'nao', s: 'sim', ss: 'sim', hj: 'hoje', agr: 'agora', mt: 'muito', mto: 'muito', mta: 'muita',
    td: 'tudo', tds: 'todos', ngm: 'ninguem', obg: 'obrigado', obgd: 'obrigado', vlw: 'valeu', flw: 'falou', tmj: 'tamo junto', pfv: 'por favor',
    pf: 'por favor', pls: 'por favor', plz: 'por favor', cmg: 'comigo', ctg: 'contigo', ctz: 'certeza', kd: 'cade', qnd: 'quando', qdo: 'quando',
    qto: 'quanto', qnt: 'quanto', msm: 'mesmo', dps: 'depois', ent: 'entao', eae: 'e ai', iae: 'e ai', oie: 'oi', sla: 'sei la', fds: 'fim de semana',
    aki: 'aqui', eh: 'e', sv: 'servidor', serv: 'servidor', servs: 'servidores', cfg: 'config', bd: 'bom dia', tdb: 'tudo bem', mds: 'meu deus',
    ta: 'esta', to: 'estou', tao: 'estao', pra: 'para', pro: 'para o', pros: 'para os', p: 'para', tava: 'estava', tamo: 'estamos', cade: 'cade',
  };
  const norm = (s) => norm0(s).replace(/[a-z]+/g, (w) => (SLANG[w] != null ? SLANG[w] : w));
  DL.normSlang = norm;
  const list = (names) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1]);
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

  // precise diagnosis (someone who knows) vs a vague one (someone outside their area / beginner)
  const HINT = {
    link: (d) => 'A eth0 do ' + d.name + ' está DOWN. No terminal: ip link set eth0 up e teste com ping.',
    cable: (d) => 'O ' + d.name + ' está sem sinal no cabo (NO-CARRIER). Tem uma ponta solta: confira o Cabeamento do ' + d.rack.id + '.',
    port: (d) => 'A porta ' + String(d.sw.bad || '').replace('gi', 'Gi') + ' do ' + d.name + ' está err-disabled. No switch: conf t → interface ' + d.sw.bad + ' → shutdown → no shutdown.',
    service: (d) => 'O nginx parou no ' + d.name + '. systemctl status nginx mostra o erro; systemctl restart nginx resolve.',
    disk: (d) => 'O disco do ' + d.name + ' está 96% cheio. du -sh /var/log/* mostra o que ocupa; apague os logs antigos.',
  };
  const VAGUE = {
    link: (d) => 'O ' + d.name + ' perdeu a conexão. Pode ser configuração de rede, não tenho certeza.',
    cable: (d) => 'O ' + d.name + ' perdeu a conexão. Acho que devemos verificar os cabos.',
    port: (d) => 'Encontrei um problema no switch ' + d.name + '. Um dos servidores ligados nele ficou sem rede.',
    service: (d) => 'O site do ' + d.name + ' parou de responder, mas o servidor parece ligado.',
    disk: (d) => 'O ' + d.name + ' está estranho… acho que está sem espaço.',
  };
  const STATE = {
    link: 'ainda apresenta perda de conexão', cable: 'está sem sinal no cabo', port: 'está com uma porta em erro',
    service: 'está com o serviço web parado', disk: 'está com o disco quase cheio',
  };
  const AREA = { redes: ['cable', 'port', 'link'], servidores: ['disk', 'cable', 'link'], sysadmin: ['service', 'disk', 'link'] };

  const QUICK = [
    ['servers', 'Como estão os servidores?'], ['problems', 'Tem algum problema?'], ['doing', 'O que você está fazendo?'],
    ['network', 'Como está a rede?'], ['money', 'Como estão as finanças?'], ['next', 'O que devo fazer agora?'],
    ['smalltalk', 'Tudo bem?'], ['workplace', 'Falta algo no seu posto?'], ['shift', 'Qual é o seu turno?'],
  ];

  const INTENTS = [
    ['bye', /^(tchau|falou|ate mais|ate logo|fui|bom descanso)\b/],
    ['smalltalk', /(tudo bem|tudo certo|tudo tranquilo|como vai|como (voce )?esta|como (e que )?esta voce|de boa|suave|como foi o dia|e voce\b|como (esta|vai) o (dia|trabalho|turno)|ta ligado)/],
    ['greet', /^(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|hey|opa|salve|fala)\b/],
    ['shift', /(turno|escala|plantao|folga|horario|(que horas|quando) (voce )?(sai|entra|chega|vai embora)|hora extra)/],
    ['salary', /(salario|pagamento|aumento|folha|quanto (voce )?(ganha|recebe))/],
    ['workplace', /(mesa|bancada|estrutura|posto de trabalho|seu setor|sua sala|precisa de (algo|alguma coisa)|falta (algo|alguma coisa)|condic)/],
    ['coffee', /(cafe|agua|lanche|almoc|comer|fome|pausa|intervalo|descans)/],
    ['joke', /(piada|engracad|me faz rir|conta uma)/],
    ['confirm', /^(ok|okay|beleza|certo|entendi|fechou|fechado|top|massa|boa|combinado|ta bom)\b/],
    ['orders', /(ordem|ordens|ordem de servico)/],
    ['vms', /(\bvms?\b|virtual|proxmox|hypervisor)/],
    ['thanks', /(valeu|obrigad|brigad|show|perfeito)/],
    ['fix', /(resolv|consert|arrum|corrig|da um jeito|cuida disso)/],
    ['where', /(onde|mostra|me leva|aponta)/],
    ['problems', /(problema|erro|falha|incidente|alerta|errado|quebr|caiu|fora do ar)/],
    ['money', /(dinheiro|financ|prejuiz|custo|lucro|receita|empresa|caixa|saldo|credito|datacoin)/],
    ['next', /(proximo|o que (eu )?(devo|faco|fazer)|dica|ajuda|sugest|prioridade|por onde)/],
    ['network', /(rede|switch|cabo|porta|link|ping|conex|uplink)/],
    ['servers', /(servidor|server|srv|host|maquina)/],
    ['temp', /(temperatura|quente|calor|refrigera|\bar\b|crac)/],
    ['doing', /(fazendo|tarefa|ocupad|trabalhando|faz agora|esta fazendo)/],
    ['progress', /(datacenter|conclu|recompensa|meta|progresso|marco)/],
    ['self', /(nivel|experiencia|habilidade|aprend|quem e voce|estrela|evolu)/],
  ];
  const detect1 = (t) => { for (const [id, re] of INTENTS) if (re.test(t)) return id; return 'unknown'; };
  // "e aí, td certo? qnd vc sai?" → the real question (shift), answered after a quick "tudo certo!"
  const CHIT = /\b(oi|ola|e ai|bom dia|boa tarde|boa noite|opa|salve|fala|tudo bem|tudo certo|tudo tranquilo|como vai|de boa|suave|beleza|ta ligado|voce esta de boa|voce esta bem)\b[\s,!?.]*/g;
  function detectFull(text) {
    const t = norm(text).trim();
    const first = detect1(t);
    if (first !== 'smalltalk' && first !== 'greet') return { intent: first, chit: false };
    const rest = t.replace(CHIT, ' ').replace(/\b(voce|tambem|e|eu)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const q = rest.length > 3 ? detect1(rest) : 'unknown';
    return q !== 'unknown' && q !== 'smalltalk' && q !== 'greet' && q !== 'confirm' ? { intent: q, chit: first } : { intent: first, chit: false };
  }
  const detect = (text) => detectFull(text).intent;
  DL.talkDetect = detectFull;

  DL.createTalk = function (game, sys) {
    const crew = sys.crew, ops = sys.ops, eco = sys.economy;
    const $ = (id) => document.getElementById(id);
    const el = { panel: $('talk'), face: $('talkFace'), name: $('talkName'), meta: $('talkMeta'), status: $('talkStatus'), log: $('talkLog'), chips: $('talkChips'), form: $('talkForm'), input: $('talkIn'), close: $('talkClose'), pings: $('talkPings') };
    const T = { a: null, wait: 0, acc: 0, statusKey: '', pings: new Map() };
    const player = () => (crew.playerProfile ? crew.playerProfile.name : 'chefe');
    const alive = (a) => crew.members.indexOf(a) >= 0;

    /* ---------- what this person knows ---------- */
    function know(a) {
      const c = a.crew, st = c.stats, role = c.profile.role;
      const main = st.skills[DL.ROLE_SKILL[role]] || 0;
      return { role, level: st.level, k: st.level + main / 25, title: DL.ROLES[role].title, name: DL.ROLES[role].name, stars: DL.XP.starsOf(st, role) };
    }
    const expertOn = (a, type) => { const K = know(a), R = DL.ROLES[K.role]; return (AREA[K.role] || (R && R.detects) || []).indexOf(type) >= 0 || K.k >= 7; };
    // how much the crew gives away depends on the learning mode (difficulty.js):
    // Iniciante → exact commands + a step-by-step; Intermediário → exact commands; Experiente → where to look only
    const LOOK = { link: 'Comece olhando o estado das interfaces.', cable: 'Desconfie da camada física.', port: 'O problema está no switch, não no servidor.', service: 'O servidor está de pé; olhe os serviços.', disk: 'Olhe o uso de espaço.' };
    const STEPS = {
      link: '1) ip link para ver a eth0 · 2) sudo ip link set eth0 up · 3) ping -c 3 10.0.1.1 para testar.',
      cable: '1) ip link mostra NO-CARRIER · 2) Cabeamento do rack: o cabo laranja está solto · 3) ping para confirmar.',
      port: '1) enable · 2) sh int status (ache o err-disabled) · 3) conf t → interface da porta → shutdown → no shutdown · 4) end.',
      service: '1) systemctl status nginx · 2) sudo systemctl restart nginx · 3) curl localhost para confirmar.',
      disk: '1) df -h · 2) du -sh /var/log · 3) sudo journalctl --vacuum-size=200M · 4) df -h de novo.',
    };
    function diag(a, d) {
      const L = DL.learn ? DL.learn() : null, ty = d.fault.type;
      if (L && L.crewHints === 'vague') return VAGUE[ty](d) + ' ' + LOOK[ty];
      const base = expertOn(a, ty) ? HINT[ty](d) : VAGUE[ty](d);
      return L && L.id === 'iniciante' ? base + ' Passo a passo: ' + STEPS[ty] : base;
    }
    // never the same line twice in a row for the same person and subject
    function vary(a, key, opts) {
      a.crew.said = a.crew.said || {};
      const last = a.crew.said[key];
      const pool = opts.filter((o) => o !== last);
      const o = pick(pool.length ? pool : opts);
      a.crew.said[key] = o;
      return o;
    }
    const found = () => ops.devices().filter((d) => d.fault && d.fault.found).sort((x, y) => (y.loss ? y.loss.rate : 0) - (x.loss ? x.loss.rate : 0));
    const hidden = () => ops.devices().filter((d) => d.fault && !d.fault.found);
    const servers = () => ops.devices().filter((d) => d.kind === 'server');
    const fixerFor = (d) => crew.members.find((m) => !m.crew.off && crew.api.fixDefFor(m, d));
    const costLine = (d) => (d.loss ? ' Isso está custando $' + fmt(d.loss.rate) + '/min.' : '');
    const racks = () => game.scene.world.items.filter((e) => e.kind === 'rack' && e.units);
    const act = (label, id, ref) => ({ label, id, ref });

    // a chance to spot a problem nobody registered yet (better with level and skill)
    function discover(a) {
      const h = hidden();
      if (!h.length || rand() > 0.3 + know(a).k * 0.06) return null;
      ops.report(h[0], a, 'conversa');
      return h[0];
    }

    function problemActions(a, d) {
      const out = [act('Mostrar no mapa', 'where', d)];
      if (crew.api.fixDefFor(a, d)) out.push(act('Resolva para mim', 'fix', d));
      else if (fixerFor(d)) out.push(act('Chame quem resolve', 'call', d));
      if (d.kind === 'server' || d.kind === 'switch') out.push(act('Abrir terminal', 'term', d));
      return out;
    }

    /* ---------- answers ---------- */
    const A = {
      greet(a) {
        const f = found();
        return { text: vary(a, 'greet', ['Oi, ' + player() + '!', 'Opa, ' + player() + '!', 'Fala, ' + player() + '!', 'E aí, ' + player() + '!']) + ' ' + (f.length ? 'Que bom que veio: temos ' + f.length + ' ocorrência(s) aberta(s).' : vary(a, 'greet2', ['Por aqui está tudo tranquilo. Precisa de algo?', 'No que posso ajudar?', 'Tudo em ordem por aqui. Manda!'])) };
      },
      thanks: (a) => ({ text: vary(a, 'thanks', ['Por nada! Qualquer coisa, me chama.', 'Tamo junto!', 'Disponha. Volto ao trabalho então.', 'Imagina! É pra isso que estou aqui.']) }),
      // "tudo bem?", "de boa?", "como tá o turno?" — answered from how their day really is
      smalltalk(a) {
        const c = a.crew, f = found();
        if (c.missing && c.missing.length) return { text: vary(a, 'small', ['Mais ou menos, ' + player() + '… ', 'Tô levando, mas… ']) + DL.workGripe(c.missing[0].id, c.name, c.missing[0].where), tone: 'warn' };
        if (f.length) return { text: vary(a, 'small', ['Tudo, mas corrido: tem ocorrência aberta no ' + f[0].name + '.', 'De boa não dá pra dizer, o ' + f[0].name + ' está dando trabalho 😅']), tone: 'warn', actions: problemActions(a, f[0]) };
        const j = c.job;
        return { text: vary(a, 'small', ['Tudo ótimo! ' + (j ? 'Tô em "' + j.name.toLowerCase() + '".' : 'Turno tranquilo.') + ' E você?', 'De boa, ' + player() + '. Café em dia e monitor verde 👌', 'Tranquilo! ' + (c.stats.done ? 'Já fiz ' + c.stats.done + ' tarefa(s) hoje.' : 'Começando o dia ainda.'), 'Tudo certo por aqui, tá ligado. Precisa de algo?']) };
      },
      bye: (a) => ({ text: vary(a, 'bye', ['Até mais, ' + player() + '!', 'Falou! Qualquer coisa tô por aqui.', 'Tchau! Bom trabalho.']) }),
      confirm: (a) => ({ text: vary(a, 'confirm', ['Fechado!', 'Beleza, combinado.', 'Show, então é isso.', 'Certo! Volto pro que eu estava fazendo.']) }),
      joke: (a) => ({ text: vary(a, 'joke', ['Por que o servidor foi ao médico? Estava com muito cache 🤒', 'Existem 10 tipos de pessoas: as que entendem binário e as que não.', 'Funciona na minha máquina… então vamos mandar a minha máquina pro cliente 😂', 'É DNS. Nunca é DNS. Foi DNS.']) }),
      coffee(a) {
        const has = (k) => game.scene.world.items.some((e) => e.kind === k);
        if (!has('coffee') && !has('water')) return { text: vary(a, 'coffee', ['Bem que eu queria um café… mas não temos cafeteira nem bebedouro. Dá pra colocar no modo construção (B → Decoração).', 'Sem copa aqui, chefe. Uma cafeteira faria milagres pelo moral do time ☕']) };
        return { text: vary(a, 'coffee', ['Já tomei meu café, valeu! Faço pausas rápidas entre as tarefas.', 'Daqui a pouco passo na copa. Quer que eu traga um?', has('beanbag') ? 'Uma água e cinco minutos no pufe e eu volto novo(a) 😄' : 'Água gelada e volto pro batente!']) };
      },
      shift(a) {
        const c = a.crew, s = c.shift || { id: 'integral', start: 0, end: 24 };
        const lbl = DL.shiftLabel ? DL.shiftLabel(s) : 'integral';
        const oc = c.oncall && c.oncall.length ? ' Também fico de plantão na ' + c.oncall.map((t) => (DL.TURNOS.find((x) => x.id === t) || { label: t }).label).join(' e ') + '.' : '';
        return { text: (s.id === 'integral' ? 'Estou em turno integral, 24 h por aqui.' : 'Meu turno é ' + lbl + '.') + oc + ' Dá pra mudar em Equipe → Escalas.' };
      },
      salary(a) {
        const sal = DL.salaryOf ? DL.salaryOf(a) : 0, eco2 = eco;
        return { text: 'Ganho ' + DL.money(sal) + ' por mês' + (eco2 ? ', e o próximo pagamento sai em ' + eco2.payInText() + '.' : '.') + ' ' + vary(a, 'salary', ['Subindo de nível, o salário acompanha 😉', 'Tá justo pelo que eu faço.', 'Se eu passar de nível, conversamos sobre aumento!']) };
      },
      workplace(a) {
        const c = a.crew, needs = crew.api.needsOf(a), z = crew.api.zoneRoom(a);
        if (!needs.length) return { text: 'Meu trabalho é andando pelo prédio, não preciso de posto fixo.' };
        const miss = needs.filter((n) => !n.ok);
        if (miss.length) return { text: DL.workGripe(miss[0].id, c.name, miss[0].where || (z ? z.name : null)) + ' Preciso de: ' + list(miss.map((n) => n.label.toLowerCase())) + '.', tone: 'warn' };
        return { text: 'Meu posto ' + (z ? 'na ' + z.name + ' ' : '') + 'tem tudo o que preciso: ' + list(needs.map((n) => n.short.toLowerCase())) + '. 👍', tone: 'ok' };
      },
      servers(a) {
        const srv = servers();
        if (!srv.length) return { text: 'Ainda não temos nenhum servidor. Que tal instalar um num rack? (B → Equipamentos → Servidor)' };
        const K = know(a);
        const ok = srv.filter((d) => d.state === 'online' && !d.fault && ops.health(d).up);
        const bad = srv.filter((d) => d.fault && d.fault.found);
        const lost = srv.filter((d) => d.state === 'online' && !ops.health(d).up && !(d.fault && d.fault.found));
        const pend = srv.filter((d) => d.state !== 'online');
        const parts = [];
        if (ok.length) parts.push(ok.length <= 3 ? 'O' + (ok.length > 1 ? 's' : '') + ' ' + list(ok.map((d) => d.name)) + (ok.length > 1 ? ' estão' : ' está') + ' funcionando normalmente.' : ok.length + ' servidores estão funcionando normalmente.');
        for (const d of bad.slice(0, 2)) parts.push('O ' + d.name + ' ' + STATE[d.fault.type] + '.');
        let spotted = null;
        if (lost.length && K.k >= 4) {
          spotted = lost[0];
          if (spotted.fault && !spotted.fault.found) ops.report(spotted, a, 'conversa');
          parts.push('O ' + spotted.name + ' não responde ao ping' + (spotted.fault ? ' — acabei de registrar nas Tarefas.' : '. Vale investigar.'));
        }
        if (pend.length) parts.push(list(pend.slice(0, 3).map((d) => d.name)) + (pend.length > 1 ? ' ainda precisam' : ' ainda precisa') + ' de cabo e configuração.');
        const d = bad[0] || (spotted && spotted.fault ? spotted : null);
        return { text: parts.join(' '), tone: bad.length || spotted ? 'warn' : 'ok', actions: d ? problemActions(a, d) : [] };
      },
      problems(a) {
        const K = know(a);
        const fresh = discover(a);
        const f = found();
        if (fresh) return { text: 'Deixa eu olhar… Achei! ' + diag(a, fresh) + ' Já registrei nas Tarefas.' + costLine(fresh), tone: 'warn', actions: problemActions(a, fresh) };
        if (f.length) {
          const d = f[0];
          let t = diag(a, d) + costLine(d);
          if (f.length > 1) t += ' E tem mais ' + (f.length - 1) + ' ocorrência(s) nas Tarefas (T).';
          if (!expertOn(a, d.fault.type) && fixerFor(d)) t += ' ' + fixerFor(d).crew.name + ' entende mais disso que eu.';
          return { text: t, tone: 'warn', actions: problemActions(a, d) };
        }
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) return { text: 'Nada quebrado, mas os cabos do ' + messy.id + ' estão bagunçados — atrapalha o ar e a manutenção. Dá para organizar no Cabeamento.', actions: [act('Mostrar no mapa', 'where', messy)] };
        const hot = racks().filter((e) => e.temp > 27.5)[0];
        if (hot) return { text: 'Nenhuma falha, mas o ' + hot.id + ' está quente (' + hot.temp.toFixed(1).replace('.', ',') + ' °C). Pode faltar refrigeração na sala.', actions: [act('Mostrar no mapa', 'where', hot)] };
        return { text: K.k >= 4 ? 'Não encontrei nenhum problema. Monitor todo verde 👌' : 'Até onde eu sei, está tudo bem. Mas ainda estou aprendendo a olhar tudo.', tone: 'ok' };
      },
      network(a) {
        const sws = ops.devices().filter((d) => d.kind === 'switch');
        if (!sws.length) return { text: 'Ainda não temos switch. Sem ele, os servidores não entram na rede — instale um no rack.' };
        const K = know(a), parts = [];
        const err = sws.filter((s) => ops.health(s).errPorts);
        const cable = found().filter((d) => d.fault.type === 'cable' || d.fault.type === 'link');
        const ports = sws.reduce((n, s) => n + (s.sw.linked ? s.sw.linked.size : 0), 0);
        parts.push(sws.length + ' switch(es) com ' + ports + ' porta(s) conectada(s).');
        for (const s of err) parts.push(K.role === 'redes' || K.k >= 6 ? HINT.port(s) : 'O ' + s.name + ' está com uma porta em erro.');
        for (const d of cable.slice(0, 2)) parts.push(diag(a, d));
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) parts.push('Os cabos do ' + messy.id + ' precisam de organização.');
        if (!err.length && !cable.length) parts.push(K.role === 'redes' ? 'Uplinks estáveis, sem erros de CRC. Rede saudável.' : 'Pela rede, tudo parece normal.');
        const d = err[0] || cable[0];
        return { text: parts.join(' '), tone: d ? 'warn' : 'ok', actions: d ? problemActions(a, d) : messy ? [act('Mostrar no mapa', 'where', messy)] : [] };
      },
      doing(a) {
        const c = a.crew, j = c.job, st = c.stats;
        let t;
        if (!j) t = 'Estava decidindo o que fazer quando você chamou.';
        else {
          const pct = j.total ? Math.round(Math.max(0, 1 - j.left / j.total) * 100) : 0;
          t = 'Estou em "' + j.name + '"' + (j.label ? ' (' + j.label + ')' : '') + (c.state === 'working' || c.state === 'inspecting' ? ', ' + pct + '% feito.' : ', indo para lá.') + (j.auto ? ' Ninguém pediu: é da minha rotina.' : ' Foi você que pediu!');
        }
        t += ' Hoje já fiz ' + st.done + ' tarefa(s), achei ' + st.found + ' problema(s) e resolvi ' + st.fixed + '.';
        return { text: t };
      },
      money(a) {
        if (!eco) return { text: 'Não tenho os números agora.' };
        const CO = eco.company, K = know(a);
        const flow = CO.revenue - (CO.energy || 0) - CO.losses;
        const worst = CO.problems.slice().sort((x, y) => y.loss.rate - x.loss.rate)[0];
        let t = 'A empresa tem ' + DL.money(CO.cash) + '. ';
        if (K.role === 'gerente' || K.k >= 6) {
          t += 'Entram ' + DL.money(CO.revenue) + '/min dos servidores' + (CO.losses ? ' e os problemas custam ' + DL.money(CO.losses) + '/min' : '') + ': resultado de ' + (flow >= 0 ? '+' : '') + DL.money(flow) + '/min.';
          t += ' A folha é de ' + DL.money(CO.payrollMonth || 0) + '/mês e sai em ' + eco.payInText() + (CO.cash < (CO.payrollMonth || 0) ? ' — o caixa ainda não cobre!' : '.');
        } else t += flow >= 0 ? 'Estamos no azul, ' + (flow >= 0 ? '+' : '') + DL.money(flow) + '/min.' : 'Estamos perdendo ' + DL.money(-flow) + '/min.';
        if (worst) t += ' O maior prejuízo é o ' + worst.name + ' (' + worst.loss.label.toLowerCase() + ', -$' + fmt(worst.loss.rate) + '/min) — e piora quanto mais demora.';
        else if (!CO.revenue) t += ' Cada servidor no ar rende dinheiro: precisamos colocar servidores online.';
        return { text: t, tone: worst ? 'warn' : flow >= 0 ? 'ok' : 'warn', actions: worst && worst.fault ? problemActions(a, worst) : [] };
      },
      next(a) {
        const f = found();
        if (f.length) { const d = f[0]; return { text: 'Resolva o ' + d.name + ' primeiro.' + costLine(d) + ' ' + diag(a, d), tone: 'warn', actions: problemActions(a, d) }; }
        const srv = servers();
        const link = srv.find((d) => d.state === 'link');
        if (link) return { text: 'O ' + link.name + ' já tem cabo, falta configurar no terminal: Tarefas (T) → Abrir terminal. Ele passa a dar receita assim que ficar online.', actions: [act('Abrir terminal', 'term', link)] };
        const fresh = srv.find((d) => d.state === 'new');
        if (fresh) return { text: 'Ligue o cabo do ' + fresh.name + ' a um switch: Tarefas (T) → Ligar cabos.', actions: [act('Ligar cabos', 'cable', fresh)] };
        if (!racks().length) return { text: 'Comece por um rack: B → Equipamentos → Rack, dentro de uma sala.' };
        if (!ops.devices().some((d) => d.kind === 'switch')) return { text: 'Falta um switch no rack. Sem ele, nenhum servidor entra na rede.' };
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) return { text: 'Organize os cabos do ' + messy.id + ' (Cabeamento → Organizar cabos). Ajuda no fluxo de ar.', actions: [act('Mostrar no mapa', 'where', messy)] };
        if (eco) {
          const miss = eco.checklist().find((c) => !c.ok);
          if (miss && !game.scene.world.dcDone) return { text: 'Para concluir este datacenter falta: ' + miss.label.toLowerCase() + '. Cada datacenter concluído conta para a recompensa de DataCoins.' };
        }
        return { text: 'Está tudo em ordem! Que tal dar a cara da equipe para a sala? B → Estilo da sala.', tone: 'ok' };
      },
      temp(a) {
        const rs = racks();
        if (!rs.length) return { text: 'Sem racks, sem calor por enquanto.' };
        const avg = rs.reduce((s, e) => s + e.temp, 0) / rs.length, hot = rs.slice().sort((x, y) => y.temp - x.temp)[0];
        const crac = game.scene.world.items.some((e) => e.kind === 'crac');
        return { text: 'Média dos racks: ' + avg.toFixed(1).replace('.', ',') + ' °C. O mais quente é o ' + hot.id + ' (' + hot.temp.toFixed(1).replace('.', ',') + ' °C).' + (crac ? '' : ' Não temos ar de precisão — vale instalar um.'), tone: hot.temp > 27.5 ? 'warn' : 'ok' };
      },
      progress() {
        if (!eco) return { text: 'Não sei dizer.' };
        const n = eco.wallet.counters.datacenters || 0, m = DL.ECON.milestones[0];
        const miss = eco.checklist().filter((c) => !c.ok).map((c) => c.label.toLowerCase());
        return { text: 'Você já concluiu ' + n + ' datacenter(s); a próxima recompensa vem com ' + (Math.floor(n / m.every) + 1) * m.every + '. ' + (game.scene.world.dcDone ? 'Este aqui já está concluído ✓' : miss.length ? 'Neste aqui falta: ' + list(miss) + '.' : 'Este aqui está quase lá!') };
      },
      self(a) {
        const K = know(a), st = a.crew.stats;
        const sk = DL.SKILLS.find((s) => s[0] === DL.ROLE_SKILL[K.role]);
        const lv = K.level <= 2 ? 'Ainda estou aprendendo; às vezes preciso de ajuda.' : K.level <= 5 ? 'Já resolvo bastante coisa sozinho(a).' : 'Pode confiar: conheço esse datacenter de cor.';
        return { text: 'Sou ' + K.title.toLowerCase() + ', nível ' + K.level + ' ' + '★'.repeat(K.stars) + '. ' + sk[1] + ': ' + Math.round(st.skills[sk[0]]) + '. ' + lv };
      },
      fix(a) {
        const f = found();
        if (!f.length) return { text: 'Não tem nada para resolver agora. 👌' };
        const mine = f.find((d) => crew.api.fixDefFor(a, d));
        if (mine) return doFix(a, mine);
        const d = f[0], other = fixerFor(d);
        return { text: 'O ' + d.name + ' não é da minha área.' + (other ? ' ' + other.crew.name + ' (' + DL.ROLES[other.crew.profile.role].name + ') resolve isso.' : ' Ninguém da equipe sabe resolver — vai precisar ser você, pelo terminal.'), actions: problemActions(a, d) };
      },
      where(a) {
        const d = found()[0];
        if (!d) return { text: 'Nenhum problema para apontar agora.' };
        show(d);
        return { text: 'Ali no ' + d.rack.id + ' — destaquei no mapa.', actions: problemActions(a, d).filter((x) => x.id !== 'where') };
      },
      orders: () => ({ text: game.staff ? game.staff.ordersSummary() : 'Não temos ordens de serviço.' }),
      vms: () => ({ text: DL.infraSummary ? DL.infraSummary() : 'Ainda não temos virtualização.' }),
      unknown: (a) => ({ text: vary(a, 'unknown', ['Hmm, não entendi. Posso falar sobre servidores, rede, problemas, ordens de serviço, VMs, o que estou fazendo, as finanças ou o que fazer agora.', 'Não peguei, ' + player() + ' 😅 Pergunta de outro jeito? Tipo "como tão os servidores?" ou "tem algum problema?"', 'Desculpa, não entendi. Quer saber dos servidores, da rede, do meu turno ou do que falta no meu posto?']) }),
    };

    // the quick answer to a greeting that came with a real question
    const chitLine = (a) => vary(a, 'chit', ['Tudo certo! ', 'De boa! ', 'Tudo tranquilo, ' + player() + '. ', 'Opa, tudo bem! ']);

    function doFix(a, d) {
      const def = crew.api.fixDefFor(a, d);
      if (!def) return { text: 'Isso não é comigo.' };
      const why = crew.api.startJob(a, def, { auto: false, target: d });
      if (why) return { text: 'Queria, mas não dá: ' + why.toLowerCase() + '.' };
      return { text: pick(['Deixa comigo! Indo para o ' + d.rack.id + '.', 'Pode deixar, já vou resolver o ' + d.name + '.']), tone: 'ok' };
    }

    function show(e) {
      const r = e.rack || e;
      game.focus(r.px + 8, r.py);
      game.flash(r);
    }

    /* ---------- UI ---------- */
    function drawFace(a) {
      const cv = el.face, k = 2;
      cv.width = 16 * k;
      cv.height = 16 * k;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(a.sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
    }

    function msgHtml(m, i) {
      let h = '<li class="tk__msg is-' + m.from + (m.tone ? ' is-' + m.tone : '') + '"><p>' + esc(m.text) + '</p>';
      if (m.actions && m.actions.length && !m.used) h += '<div class="tk__acts">' + m.actions.map((x, j) => '<button type="button" class="btn btn--sm" data-tk-act="' + i + ':' + j + '">' + esc(x.label) + '</button>').join('') + '</div>';
      return h + '</li>';
    }

    function renderLog() {
      const a = T.a;
      const msgs = a.crew.talk || [];
      el.log.innerHTML = msgs.map(msgHtml).join('') + (T.wait > 0 ? '<li class="tk__msg is-bot is-typing"><p><i></i><i></i><i></i></p></li>' : '');
      el.log.scrollTop = el.log.scrollHeight;
    }

    function renderChips() {
      const f = found();
      let h = QUICK.map(([id, l]) => '<button type="button" class="chip" data-tk-q="' + id + '">' + l + '</button>').join('');
      if (f.length) h += '<button type="button" class="chip is-warn" data-tk-q="fix">Pode resolver?</button><button type="button" class="chip" data-tk-q="where">Onde é?</button>';
      el.chips.innerHTML = h;
    }

    function renderHead() {
      const a = T.a, K = know(a), c = DL.ROLES[a.crew.profile.role].color;
      el.name.textContent = a.crew.name;
      el.meta.innerHTML = '<span style="color:' + c + '">' + esc(K.title) + '</span> · Nv ' + K.level + ' <span class="stars">' + '★'.repeat(K.stars) + '<i>' + '★'.repeat(5 - K.stars) + '</i></span>';
      drawFace(a);
      liveStatus();
    }

    function liveStatus() {
      if (!T.a) return;
      const s = crew.statusOf(T.a);
      if (s !== T.statusKey) { T.statusKey = s; el.status.textContent = s; }
    }

    function push(a, m) {
      a.crew.talk = a.crew.talk || [];
      // only the newest answer keeps its action buttons
      if (m.from === 'bot') for (const o of a.crew.talk) if (o.actions) o.used = true;
      a.crew.talk.push(m);
      if (a.crew.talk.length > 40) a.crew.talk.shift();
      if (T.a === a) renderLog();
      else if (m.from === 'bot') a.crew.unread = (a.crew.unread || 0) + 1;
    }

    function open(a) {
      if (!a || !alive(a)) return;
      T.a = a;
      a.crew.unread = 0;
      dismissPing(a);
      crew.select(a); // stops and looks at you
      el.panel.hidden = false;
      game.root.classList.add('is-talk');
      renderHead();
      if (!a.crew.talk || !a.crew.talk.length) push(a, Object.assign({ from: 'bot' }, A.greet(a)));
      renderLog();
      renderChips();
      setTimeout(() => el.input.focus({ preventScroll: true }), 50);
    }

    function close() {
      if (!T.a) return;
      const a = T.a;
      T.a = null;
      el.panel.hidden = true;
      game.root.classList.remove('is-talk');
      if (el.panel.contains(document.activeElement)) document.activeElement.blur();
      if (crew.selected === a) crew.select(null);
    }

    function ask(text, intent) {
      const a = T.a;
      if (!a || T.wait > 0) return;
      push(a, { from: 'me', text });
      game.emit('player-talk', text);
      T.wait = 0.5 + rand() * 0.5;
      const full = intent ? { intent, chit: false } : detectFull(text);
      T.pending = full.intent;
      T.chit = full.chit;
      renderLog();
    }

    function answer() {
      const a = T.a;
      if (!a) return;
      let r;
      try { r = (A[T.pending] || A.unknown)(a); } catch (err) { console.warn('talk', err); r = A.unknown(a); }
      if (T.chit && r && r.text) r = Object.assign({}, r, { text: chitLine(a) + r.text });
      push(a, Object.assign({ from: 'bot' }, r));
      renderChips();
    }

    function runAction(a, x) {
      const d = x.ref;
      if (x.id === 'where') { show(d); push(a, { from: 'bot', text: 'Destaquei o ' + (d.rack ? d.rack.id : d.id) + ' no mapa.' }); }
      else if (x.id === 'fix') push(a, Object.assign({ from: 'bot' }, d.fault ? doFix(a, d) : { text: 'Já foi resolvido. 👌' }));
      else if (x.id === 'call') {
        const m = d.fault && fixerFor(d);
        if (!m) { push(a, { from: 'bot', text: 'Ninguém disponível para isso agora.' }); return; }
        const why = crew.api.startJob(m, crew.api.fixDefFor(m, d), { auto: false, target: d });
        push(a, { from: 'bot', text: why ? m.crew.name + ' não consegue agora: ' + why.toLowerCase() + '.' : 'Chamei ' + m.crew.name + '. Já está indo para o ' + d.rack.id + '.' });
        if (!why && crew.chat) crew.chat.post(m, 'Indo resolver o ' + d.name + ' a pedido do ' + a.crew.name + '.');
      } else if (x.id === 'term') { close(); ops.openTerminal(d); }
      else if (x.id === 'cable') { close(); sys.cabling.open(d.rack, d); }
    }

    el.chips.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk-q]');
      if (!b) return;
      const q = b.dataset.tkQ, label = (QUICK.find((x) => x[0] === q) || [0, b.textContent])[1];
      ask(label, q);
      b.blur();
    });
    el.log.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk-act]');
      if (!b || !T.a) return;
      const [i, j] = b.dataset.tkAct.split(':').map(Number);
      const m = T.a.crew.talk[i];
      if (!m || !m.actions) return;
      m.used = true;
      push(T.a, { from: 'me', text: m.actions[j].label });
      runAction(T.a, m.actions[j]);
      renderLog();
    });
    el.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = el.input.value.trim();
      if (!t) return;
      el.input.value = '';
      ask(t.slice(0, 160));
    });
    el.input.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') { ev.preventDefault(); close(); }
      ev.stopPropagation();
    });
    el.close.addEventListener('click', close);
    el.panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- they come to you ---------- */
    function ping(a, text, tone) {
      if (T.a === a) return;
      dismissPing(a);
      const n = document.createElement('div');
      n.className = 'talk-ping' + (tone === 'warn' ? ' is-warn' : '');
      const c = DL.ROLES[a.crew.profile.role].color;
      n.innerHTML = '<div class="talk-ping__head"><span class="cc__dot" style="background:' + c + '"></span><b>' + esc(a.crew.name) + '</b><span class="eyebrow-sm">quer falar com você</span></div><p>' + esc(text) + '</p>' +
        '<div class="talk-ping__acts"><button type="button" class="btn btn--sm btn--primary" data-ping="open">Conversar</button><button type="button" class="btn btn--sm" data-ping="later">Depois</button></div>';
      n.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ping]');
        if (!b) return;
        if (b.dataset.ping === 'open') open(a);
        else dismissPing(a);
      });
      n.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      el.pings.appendChild(n);
      T.pings.set(a, { n, left: 14 });
      while (el.pings.children.length > 2) { const first = el.pings.firstChild; for (const [k, v] of T.pings) if (v.n === first) T.pings.delete(k); first.remove(); }
    }
    function dismissPing(a) {
      const p = T.pings.get(a);
      if (p) { p.n.remove(); T.pings.delete(a); }
    }

    // a crew member found something important: it goes to their conversation and they call you
    game.on('fault', (info) => {
      const a = info.who && alive(info.who) ? info.who : null;
      if (!a || !info.d.fault) return;
      const d = info.d;
      const text = 'Encontrei um problema: ' + diag(a, d) + costLine(d);
      push(a, { from: 'bot', text, tone: 'warn', actions: problemActions(a, d) });
      ping(a, text, 'warn');
    });
    // a problem dragging on gets the manager (or whoever is around) to speak up
    function lossWatch() {
      if (!eco) return;
      for (const d of eco.company.problems) {
        if (!d.loss || d.loss.total < 3000 || d.loss.pinged) continue;
        d.loss.pinged = true;
        const a = crew.members.find((m) => m.crew.profile.role === 'gerente') || crew.members[0];
        if (!a) return;
        const text = 'Já perdemos ' + DL.money(d.loss.total) + ' com o ' + d.name + ' (' + d.loss.label.toLowerCase() + '). Precisamos resolver isso agora.';
        push(a, { from: 'bot', text, tone: 'warn', actions: d.fault ? problemActions(a, d) : [] });
        ping(a, text, 'warn');
      }
    }

    function update(dt) {
      if (T.a && !alive(T.a)) close();
      if (T.wait > 0 && (T.wait -= dt) <= 0) { T.wait = 0; answer(); }
      for (const [a, p] of T.pings) if ((p.left -= dt) <= 0 || !alive(a)) dismissPing(a);
      T.acc += dt;
      if (T.acc > 0.5) {
        T.acc = 0;
        liveStatus();
        lossWatch();
      }
    }

    function key(ev) {
      if (T.a && ev.code === 'Escape') { close(); return true; }
      return false;
    }

    game.on('talk', open);
    return {
      open, close, ask, update, key, detect,
      get active() { return T.a; },
      answer: (a, intent, text) => {
        const r = (A[intent] || A.unknown)(a);
        return text && detectFull(text).chit && r && r.text ? Object.assign({}, r, { text: chitLine(a) + r.text }) : r;
      },
    };
  };
})();
