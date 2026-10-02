/* DataLab — jobs: the real tasks of each role, skills / experience / levels, and what the crew says.
   Rules only (no AI): each task knows where it happens, what it changes in the datacenter when it ends
   and how the person reports it in the team chat. crew.js runs them; teamchat.js shows the talk. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const num = (v, d) => v.toFixed(d == null ? 1 : d).replace('.', ',');

  /* ------------------------------------------------------------------ */
  /* Skills, experience, levels, stars                                   */
  /* ------------------------------------------------------------------ */
  const SKILLS = [['redes', 'Redes'], ['servidores', 'Servidores'], ['sistemas', 'Sistemas'], ['seguranca', 'Segurança'], ['gestao', 'Gestão']];
  const ROLE_SKILL = { redes: 'redes', servidores: 'servidores', sysadmin: 'sistemas', seguranca: 'seguranca', funcionario: 'gestao', gerente: 'gestao' };
  const SECOND_SKILL = { redes: 'servidores', servidores: 'redes', sysadmin: 'servidores', seguranca: 'redes', funcionario: 'sistemas', gerente: 'sistemas' };
  const MAX_LEVEL = 10;
  DL.SKILLS = SKILLS;
  DL.ROLE_SKILL = ROLE_SKILL;

  const xpNeed = (level) => 60 + level * 50;

  function newStats(role, level) {
    const s = {};
    for (const [k] of SKILLS) s[k] = Math.round(6 + rand() * 18);
    s[ROLE_SKILL[role]] = Math.round(38 + rand() * 14);
    s[SECOND_SKILL[role]] = Math.round(20 + rand() * 12);
    const st = { level: 1, xp: 0, skills: s, done: 0, found: 0, fixed: 0 };
    // presets bring a team that already has some time on the job
    for (let l = 1; l < (level || 1); l++) {
      st.level++;
      s[ROLE_SKILL[role]] = Math.min(99, s[ROLE_SKILL[role]] + 6);
      s[SECOND_SKILL[role]] = Math.min(99, s[SECOND_SKILL[role]] + 3);
    }
    return st;
  }

  function starsOf(st, role) {
    const main = st.skills[ROLE_SKILL[role]] || 0;
    return Math.max(1, Math.min(5, Math.round((st.level * 10 + main) / 30)));
  }

  // Practice makes better: big gains while a skill is low, small near the top.
  function train(st, skill, amount) {
    const v = st.skills[skill] || 0;
    st.skills[skill] = Math.min(99, Math.round((v + amount * (1 - v / 110)) * 10) / 10);
  }

  // Returns the number of levels gained (0 most of the time).
  function gainXp(st, role, xp) {
    if (st.level >= MAX_LEVEL) return 0;
    st.xp += xp;
    let up = 0;
    while (st.level < MAX_LEVEL && st.xp >= xpNeed(st.level)) {
      st.xp -= xpNeed(st.level);
      st.level++;
      up++;
      train(st, ROLE_SKILL[role], 4);
      train(st, SECOND_SKILL[role], 2);
    }
    if (st.level >= MAX_LEVEL) st.xp = 0;
    return up;
  }

  // Skilled people are quicker (×1.25 at skill 0 … ×0.76 at 99).
  const speedOf = (st, skill) => 1.25 - (st.skills[skill] || 0) / 200;

  DL.XP = { newStats, starsOf, train, gainXp, xpNeed, speedOf, MAX_LEVEL };

  /* ------------------------------------------------------------------ */
  /* Where things are                                                    */
  /* ------------------------------------------------------------------ */
  const items = (ctx, kind) => ctx.world.items.filter((e) => e.kind === kind);
  const devsOf = (ctx, rack) => (ctx.ops ? ctx.ops.devices().filter((d) => d.rack === rack) : []);
  const racks = (ctx, pred) => items(ctx, 'rack').filter((e) => e.units && (!pred || pred(e, devsOf(ctx, e))));
  const tempOf = (e) => (e.temp != null ? e.temp : e.tel ? e.tel.temp : 24);
  const faults = (ctx, types) => (ctx.ops ? ctx.ops.devices().filter((d) => d.fault && d.fault.found && types.indexOf(d.fault.type) >= 0) : []);
  const servers = (ctx) => (ctx.ops ? ctx.ops.devices().filter((d) => d.kind === 'server') : []);
  const online = (ctx) => servers(ctx).filter((d) => d.state === 'online');
  const up = (ctx, d) => ctx.ops.health(d).up && !d.fault;

  const labelOf = (t) => (!t ? '' : t.crew ? t.crew.name : t.rack && t.name ? t.name : t.label || t.id || (t.kind ? DL.itemName(t) : ''));

  /* ------------------------------------------------------------------ */
  /* Fault repair (what each fix is, told the way a tech would)          */
  /* ------------------------------------------------------------------ */
  const FIX_SAY = {
    link: (d) => 'Subi a eth0 do ' + d.name + ' (ip link set eth0 up). Link de volta.',
    cable: (d) => 'Recoloquei o cabo solto do ' + d.name + ' e testei com ping: ok.',
    port: (d) => 'Reativei a porta ' + String(d.sw.bad || '').replace('gi', 'Gi') + ' do ' + d.name + ' com shutdown / no shutdown.',
    service: (d) => 'Reiniciei o nginx do ' + d.name + '. Já responde 200.',
    disk: (d) => 'Limpei logs antigos do ' + d.name + '. Disco caiu para 61%.',
  };
  const FIX_NAME = { link: 'interface', cable: 'cabo', port: 'porta do switch', service: 'serviço', disk: 'disco' };

  function fixTask(id, name, types, skill, desc) {
    return {
      id, name, kind: 'fix', skill, xp: 30, dur: [12, 20], auto: 0, desc,
      verb: 'Resolvendo',
      none: 'Nenhum problema desse tipo em aberto',
      types,
      targets: (ctx) => faults(ctx, types),
      place: (d) => d.rack,
      finish(ctx, d) {
        if (!d.fault || types.indexOf(d.fault.type) < 0) return { say: 'Cheguei no ' + d.name + ' e já estava resolvido. Melhor assim!' };
        const s = ctx.stats.skills[skill] || 0;
        // beginners sometimes don't make it — and learn from it anyway
        if (rand() < Math.max(0, (42 - s) / 70)) {
          return { say: 'Tentei resolver o ' + FIX_NAME[d.fault.type] + ' do ' + d.name + ', mas não consegui ainda. Alguém com mais experiência pode ajudar?', tone: 'help', failed: true };
        }
        const say = FIX_SAY[d.fault.type](d);
        if (!ctx.ops.fix(d, ctx.a)) return { say: 'Mexi no ' + d.name + ', mas ainda não voltou. ' + ctx.player + ', confere o cabeamento comigo?', tone: 'warn' };
        return { say, tone: 'ok', fixed: true };
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Task catalog per role                                               */
  /*   kind: pc (sits at a workstation) · equip (works at a rack/unit)   */
  /*         patrol (walks through the rooms) · spot (goes somewhere)    */
  /*         visit (talks to a coworker) · fix (repairs a found fault)   */
  /*   auto: weight when the person picks the task alone (0 = only on order) */
  /* ------------------------------------------------------------------ */
  const T = {
    redes: [
      {
        id: 'switch', name: 'Verificar switch', verb: 'Verificando', kind: 'equip', skill: 'redes', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Portas, LEDs e erros do switch do rack.', none: 'Nenhum switch instalado',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'switch')),
        finish(ctx, rack) {
          if (ctx.ops.inspect(ctx.a, rack)) return null;
          const sw = devsOf(ctx, rack).filter((d) => d.kind === 'switch')[0];
          if (!sw) return { say: 'O switch do ' + rack.id + ' foi removido.' };
          const h = ctx.ops.health(sw), n = sw.sw.linked ? sw.sw.linked.size : 0;
          if (h.errPorts) return { say: sw.name + ' com ' + h.errPorts + ' porta(s) em err-disabled. Já está nas Tarefas.', tone: 'warn' };
          return { say: pick([sw.name + ' ok: ' + n + ' porta(s) conectada(s), nenhuma em erro.', 'Conferi o ' + sw.name + '. Links estáveis, LEDs verdes.', sw.name + ' sem erros de CRC nas portas. Tudo certo.']) };
        },
      },
      {
        id: 'cables', name: 'Organizar cabos', verb: 'Organizando cabos', kind: 'equip', skill: 'redes', xp: 16, dur: [10, 16], auto: 2,
        desc: 'Passa os cabos pelos organizadores e bandejas.', none: 'Nenhum rack com cabos',
        targets: (ctx) => racks(ctx, (e) => !!e.cableLook),
        weight: (e) => (e.cableLook === 'messy' ? 10 : 1),
        finish(ctx, rack) {
          if (rack.cableLook === 'messy') {
            ctx.ops.tidy([rack]);
            return { say: 'Organizei os cabos do ' + rack.id + '. Bem melhor para o fluxo de ar.', tone: 'ok' };
          }
          return { say: pick(['Revisei as etiquetas dos cabos do ' + rack.id + '. Tudo nos conformes.', 'Cabos do ' + rack.id + ' arrumados, só apertei umas abraçadeiras.']) };
        },
      },
      {
        id: 'ping', name: 'Testar conexão', verb: 'Testando conexão', kind: 'equip', skill: 'redes', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Ping e traceroute nos servidores do rack.', none: 'Nenhum servidor instalado',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server')),
        finish(ctx, rack) {
          if (ctx.ops.inspect(ctx.a, rack)) return null;
          const srv = devsOf(ctx, rack).filter((d) => d.kind === 'server' && d.state === 'online');
          if (!srv.length) return { say: 'Nenhum servidor do ' + rack.id + ' está configurado ainda. Sem o que pingar.' };
          const down = srv.filter((d) => !up(ctx, d));
          if (down.length) return { say: 'Ping ok em ' + (srv.length - down.length) + '/' + srv.length + ' no ' + rack.id + '. ' + down.map((d) => d.name).join(', ') + ' sem resposta.', tone: 'warn' };
          return { say: 'Ping ok em ' + srv.length + '/' + srv.length + ' servidores do ' + rack.id + '. Latência abaixo de 1 ms.' };
        },
      },
      fixTask('fixnet', 'Resolver falha de rede', ['cable', 'port', 'link'], 'redes', 'Cabo solto, porta em erro ou interface desligada.'),
      {
        id: 'topo', name: 'Documentar topologia', verb: 'Documentando a topologia', kind: 'pc', skill: 'redes', xp: 10, dur: [14, 22], auto: 1,
        desc: 'Atualiza o diagrama da rede no computador.',
        finish(ctx) {
          const sw = ctx.ops ? ctx.ops.devices().filter((d) => d.kind === 'switch').length : 0;
          return { say: sw ? 'Diagrama da rede atualizado: ' + sw + ' switch(es) e ' + servers(ctx).length + ' servidor(es).' : 'Desenhei a rede planejada. Falta instalar o primeiro switch.' };
        },
      },
    ],
    servidores: [
      {
        id: 'install', name: 'Instalar servidor', verb: 'Instalando servidor', kind: 'equip', skill: 'servidores', xp: 22, dur: [10, 14], auto: 0,
        desc: 'Monta um servidor novo num rack com espaço.', none: 'Nenhum rack com espaço livre',
        targets: (ctx) => racks(ctx, (e) => e.units.indexOf(null) >= 0),
        finish(ctx, rack) {
          const d = ctx.install && ctx.install(rack);
          if (!d) return { say: 'O ' + rack.id + ' ficou sem espaço antes de eu terminar.' };
          return { say: 'Instalei o ' + d.name + ' no ' + rack.id + '. Falta ligar o cabo e configurar.', tone: 'ok' };
        },
      },
      {
        id: 'hw', name: 'Verificar hardware', verb: 'Verificando hardware', kind: 'equip', skill: 'servidores', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Fontes, discos, ventoinhas e temperatura.', none: 'Nenhum servidor ou storage',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server')).concat(items(ctx, 'storage')),
        finish(ctx, e) {
          if (e.units && ctx.ops.inspect(ctx.a, e)) return null;
          const t = tempOf(e);
          if (t > 27.5) return { say: e.id + ' esquentando (' + num(t) + ' °C). Vale olhar a refrigeração.', tone: 'warn' };
          return { say: pick([e.id + ' a ' + num(t) + ' °C, ventoinhas normais.', 'Fontes redundantes do ' + e.id + ' ok, discos sem alerta SMART.', e.id + ' revisado: nada fora do lugar.']) };
        },
      },
      {
        id: 'svc', name: 'Configurar serviço', verb: 'Configurando serviço', kind: 'pc', skill: 'servidores', xp: 12, dur: [14, 22], auto: 2,
        desc: 'Ajusta serviços e imagens dos servidores.',
        finish(ctx) {
          const s = online(ctx);
          return { say: s.length ? 'Deixei o nginx do ' + pick(s).name + ' com reinício automático.' : 'Preparei a imagem padrão para os próximos servidores.' };
        },
      },
      fixTask('fixhw', 'Resolver falha de hardware', ['disk', 'cable', 'link'], 'servidores', 'Disco cheio, cabo solto ou interface desligada.'),
      {
        id: 'cool', name: 'Checar refrigeração', verb: 'Checando a refrigeração', kind: 'equip', skill: 'servidores', xp: 10, dur: [6, 9], auto: 1,
        desc: 'Temperatura de insuflamento e filtros.', none: 'Nenhum ar de precisão instalado',
        targets: (ctx) => items(ctx, 'crac'),
        finish: (ctx, e) => ({ say: (e.id || 'Ar de precisão') + ' insuflando a ' + num(tempOf(e)) + ' °C. Filtros limpos.' }),
      },
    ],
    sysadmin: [
      {
        id: 'sys', name: 'Configurar sistema', verb: 'Configurando o sistema', kind: 'pc', skill: 'sistemas', xp: 12, dur: [14, 22], auto: 2,
        desc: 'NTP, syslog, usuários e automação.',
        finish(ctx) {
          const n = online(ctx).length;
          return { say: n ? pick(['Configurei NTP e syslog central em ' + n + ' servidor(es).', 'Automatizei o deploy dos ' + n + ' servidor(es) online.']) : 'Deixei os playbooks prontos para quando os servidores subirem.' };
        },
      },
      {
        id: 'alerts', name: 'Analisar alertas', verb: 'Analisando alertas', kind: 'pc', skill: 'sistemas', xp: 14, dur: [10, 16], auto: 3,
        desc: 'Revisa o monitoramento e acha o que ninguém viu.',
        finish(ctx) {
          const hidden = ctx.ops ? ctx.ops.devices().filter((d) => d.fault && !d.fault.found) : [];
          if (hidden.length) { ctx.ops.report(hidden[0], ctx.a, 'análise de alertas'); return null; }
          return { say: pick(['Analisei os alertas: nada crítico, só ruído.', 'Fila de alertas zerada. Ajustei dois limiares que davam falso positivo.']) };
        },
      },
      fixTask('fixinc', 'Resolver incidente', ['service', 'disk', 'link'], 'sistemas', 'Serviço parado, disco cheio ou interface.'),
      {
        id: 'backup', name: 'Revisar backups', verb: 'Revisando backups', kind: 'pc', skill: 'sistemas', xp: 10, dur: [12, 18], auto: 1,
        desc: 'Confere a rotina de backup da madrugada.',
        finish: (ctx) => ({ say: online(ctx).length ? 'Backup da madrugada ok: ' + online(ctx).length + ' servidor(es), nenhum erro.' : 'Agendei o backup para os servidores novos.' }),
      },
      {
        id: 'patch', name: 'Aplicar atualizações', verb: 'Aplicando atualizações', kind: 'equip', skill: 'sistemas', xp: 12, dur: [8, 12], auto: 1,
        desc: 'Atualiza os servidores do rack, um por vez.', none: 'Nenhum servidor online',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server' && d.state === 'online')),
        finish: (ctx, rack) => ({ say: 'Patches de segurança aplicados no ' + rack.id + ', sem reboot surpresa.' }),
      },
    ],
    seguranca: [
      {
        id: 'round', name: 'Fazer ronda', verb: 'Fazendo ronda', kind: 'patrol', skill: 'seguranca', xp: 12, dur: [0, 0], auto: 3,
        desc: 'Percorre as salas conferindo portas e acessos.',
        finish: (ctx) => ({ say: 'Ronda concluída: ' + ctx.world.rooms.length + ' sala(s), portas ok.' }),
      },
      {
        id: 'cams', name: 'Monitorar câmeras', verb: 'Monitorando câmeras', kind: 'pc', skill: 'seguranca', xp: 10, dur: [14, 22], auto: 2,
        desc: 'Acompanha as câmeras do prédio.',
        finish: () => ({ say: pick(['Câmeras sem movimento estranho. Só o pessoal de sempre.', 'Gravações da noite conferidas. Nada fora do normal.']) }),
      },
      {
        id: 'access', name: 'Verificar acessos', verb: 'Verificando acessos', kind: 'spot', skill: 'seguranca', xp: 10, dur: [5, 8], auto: 1,
        desc: 'Confere o controle de acesso da entrada.',
        targets: (ctx) => [ctx.reception()],
        finish: () => ({ say: 'Conferi o controle de acesso da entrada. Crachás em dia.' }),
      },
      {
        id: 'seals', name: 'Conferir lacres dos racks', verb: 'Conferindo lacres', kind: 'equip', skill: 'seguranca', xp: 10, dur: [5, 8], auto: 2,
        desc: 'Portas e lacres dos racks fechados.', none: 'Nenhum rack instalado',
        targets: (ctx) => racks(ctx),
        finish: (ctx, rack) => ({ say: 'Lacres do ' + rack.id + ' intactos.' }),
      },
    ],
    funcionario: [
      {
        id: 'tickets', name: 'Organizar chamados', verb: 'Organizando chamados', kind: 'pc', skill: 'gestao', xp: 10, dur: [14, 22], auto: 3,
        desc: 'Prioriza e responde os chamados abertos.',
        finish(ctx) {
          const open = ctx.ops ? ctx.ops.tasks().length : 0;
          return { say: open ? 'Chamados organizados: ' + open + ' em aberto, priorizei os incidentes.' : 'Fila de chamados zerada por hoje.' };
        },
      },
      {
        id: 'inv', name: 'Atualizar inventário', verb: 'Atualizando inventário', kind: 'equip', skill: 'gestao', xp: 10, dur: [6, 9], auto: 2,
        desc: 'Confere etiquetas e números de série.', none: 'Nada para inventariar',
        targets: (ctx) => racks(ctx).concat(items(ctx, 'storage')),
        finish: (ctx, e) => ({ say: 'Inventário do ' + e.id + ' atualizado: ' + (e.units ? e.units.filter(Boolean).length : 1) + ' equipamento(s).' }),
      },
      {
        id: 'coffee', name: 'Repor café e água', verb: 'Repondo café e água', kind: 'spot', skill: 'gestao', xp: 6, dur: [5, 7], auto: 1,
        desc: 'Mantém a copa abastecida.', none: 'Sem cafeteira ou bebedouro',
        targets: (ctx) => items(ctx, 'coffee').concat(items(ctx, 'water')),
        finish: () => ({ say: pick(['Café passado ☕ quem quiser, está na copa.', 'Bebedouro abastecido. Hidratem-se, pessoal!']) }),
      },
      {
        id: 'docs', name: 'Atualizar documentação', verb: 'Atualizando a documentação', kind: 'pc', skill: 'sistemas', xp: 8, dur: [12, 18], auto: 2,
        desc: 'Procedimentos e manuais na wiki.',
        finish: () => ({ say: 'Atualizei o procedimento de troca de cabos na wiki.' }),
      },
    ],
    gerente: [
      {
        id: 'kpi', name: 'Revisar indicadores', verb: 'Revisando indicadores', kind: 'pc', skill: 'gestao', xp: 10, dur: [14, 22], auto: 3,
        desc: 'Disponibilidade, chamados e consumo.',
        finish(ctx) {
          const s = online(ctx);
          if (!s.length) return { say: 'Sem servidores online ainda. Meta da semana: o primeiro no ar!' };
          const pct = (s.filter((d) => up(ctx, d)).length / s.length) * 100;
          return { say: 'Disponibilidade agora: ' + num(pct) + '%. ' + (pct >= 99 ? 'Bom trabalho, time!' : 'Vamos atacar os incidentes abertos.'), tone: pct >= 99 ? 'ok' : 'warn' };
        },
      },
      {
        id: 'capacity', name: 'Planejar capacidade', verb: 'Planejando capacidade', kind: 'pc', skill: 'gestao', xp: 12, dur: [14, 20], auto: 2,
        desc: 'Espaço em rack, energia e crescimento.',
        finish(ctx) {
          const rs = racks(ctx), free = rs.reduce((n, e) => n + e.units.filter((u) => !u).length, 0);
          return { say: rs.length ? 'Temos ' + free + ' posição(ões) livre(s) em ' + rs.length + ' rack(s). ' + (free < 3 ? 'Hora de comprar outro rack.' : 'Dá para crescer.') : 'Precisamos do primeiro rack. Vou pedir orçamento.' };
        },
      },
      {
        id: 'meeting', name: 'Reunião rápida', verb: 'Em reunião rápida', kind: 'visit', skill: 'gestao', xp: 10, dur: [4, 6], auto: 1,
        desc: 'Alinha prioridades com alguém da equipe.', none: 'Ninguém mais na equipe',
        targets: (ctx) => ctx.members.filter((m) => m !== ctx.a),
        finish: (ctx, m) => ({ say: m.crew.name + ', alinhado: prioridade para os incidentes, depois instalação.', reply: [m, pick(['Combinado!', 'Fechado, vou nessa.', 'Pode deixar comigo.'])] }),
      },
      {
        id: 'walk', name: 'Vistoria do datacenter', verb: 'Fazendo vistoria', kind: 'patrol', skill: 'gestao', xp: 10, dur: [0, 0], auto: 1,
        desc: 'Passa por todas as salas e conversa com o time.',
        finish: (ctx) => ({ say: 'Vistoria feita. ' + (items(ctx, 'rack').length ? items(ctx, 'rack').length + ' rack(s) em operação.' : 'Ainda temos muito para montar!') }),
      },
    ],
  };
  // shared social moments (autonomous only): they still have a reason
  const SOCIAL = [
    {
      id: 'chat', name: 'Conversar', verb: 'Conversando', kind: 'visit', skill: 'gestao', xp: 4, dur: [4, 6], auto: 1, social: true,
      targets: (ctx) => ctx.members.filter((m) => m !== ctx.a && !m.crew.seated),
      finish: () => null,
    },
    {
      id: 'break', name: 'Pausa para o café', verb: 'Pausa rápida para o café', kind: 'spot', skill: 'gestao', xp: 2, dur: [5, 8], auto: 1, social: true,
      targets: (ctx) => items(ctx, 'coffee').concat(items(ctx, 'water')),
      finish: () => (rand() < 0.4 ? { say: pick(['Café recarregado. Voltando!', 'Água gelada salva o turno.']) } : null),
    },
  ];

  DL.JOBS = { BY_ROLE: T, SOCIAL, labelOf, FIX_NAME, devsOf };

  /* ------------------------------------------------------------------ */
  /* Talk: small conversations and observations about the datacenter     */
  /* ------------------------------------------------------------------ */
  const PAIRS = [
    ['Bom dia! Muita coisa hoje?', 'Sempre tem. Mas está sob controle.'],
    ['Aprendi um comando novo: ss -tulpn.', 'Esse é ótimo para ver as portas abertas!'],
    ['Bora documentar isso antes que a gente esqueça?', 'Boa ideia, coloco na wiki depois.'],
    ['Quem está de plantão hoje à noite?', 'Acho que sou eu… de novo 😅'],
    ['Você viu como ficou o cabeamento novo?', 'Vi! Com patch panel fica outra coisa.'],
    ['Me lembra de trocar a senha do switch depois?', 'Anotado. E coloca no cofre de senhas.'],
    ['Esse barulho de ventoinha é normal?', 'É sim, o servidor está sob carga. Se mudar o tom, avisa.'],
    ['Alguém viu meu alicate de crimpar?', 'Está na estante, perto das caixas de cabo.'],
  ];

  // One line about something real right now (or null). Used for ambient chatter.
  function observe(ctx) {
    const out = [];
    const ops = ctx.ops;
    if (ops) {
      const srv = servers(ctx), on = online(ctx), pend = srv.filter((d) => d.state !== 'online');
      const open = ops.devices().filter((d) => d.fault && d.fault.found);
      if (on.length && !open.length) out.push(['Monitor todo verde por aqui 👌', null], [on.length + ' servidor(es) online e respondendo. Turno tranquilo.', null]);
      if (pend.length) out.push([pend.length + ' servidor(es) esperando cabo e configuração. ' + ctx.player + ', quer ajuda com isso?', 'Se precisar, eu ligo os cabos enquanto você configura.']);
      if (open.length) out.push(['Ainda temos ' + open.length + ' ocorrência(s) aberta(s). Bora fechar isso?', 'Estou de olho no ' + open[0].name + '.']);
    }
    const rs = items(ctx, 'rack');
    if (rs.length) {
      const hot = rs.slice().sort((a, b) => tempOf(b) - tempOf(a))[0];
      out.push(['Temperatura média dos racks: ' + num(rs.reduce((s, e) => s + tempOf(e), 0) / rs.length) + ' °C.', null]);
      if (tempOf(hot) > 27) out.push([hot.id + ' é o mais quente agora (' + num(tempOf(hot)) + ' °C).', 'Vou checar se tem placa cega faltando.']);
      const messy = rs.find((e) => e.cableLook === 'messy');
      if (messy) out.push(['Os cabos do ' + messy.id + ' estão uma bagunça…', 'Quando der eu organizo.']);
      const full = rs.find((e) => e.units && e.units.every(Boolean));
      if (full) out.push([full.id + ' está cheio. Próximo servidor vai em outro rack.', null]);
    } else out.push(['Ainda não temos nenhum rack. ' + ctx.player + ', quer começar pela sala de servidores?', null]);
    if (items(ctx, 'coffee').length) out.push(['Café fresquinho na copa ☕', 'Já estou indo!']);
    if (!out.length) return null;
    return pick(out);
  }

  DL.TALK = { PAIRS, observe, pick };
})();
