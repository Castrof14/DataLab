/* DataLab — scenario data: the terminal lessons and the career problems, written in the same shape the
   database will hold them (one object per row; steps, checks and answers are plain JSON, never code).
   problems.js compiles them. Templates ({{dev.ip}}, {{gw}}, {{port}}) are filled when a lesson opens,
   with the device it opened on, so names and addresses always match the player's own save.

   check — what makes a step done (problems.js PROBES lists every state it can read):
     { ran: 'ping-ok:{{gw}}' }                  an event the terminal reported (see terminal.js ran.push)
     { state: 'eth0.up' }                       a device state is truthy
     { state: 'route', eq: '{{gw}}' }           … equals / ne / lt / gt / in / notIn a value
     { state: 'sw.port', arg: '{{port}}', eq: 'disabled' }   states that need an argument
     { any: [...] } · { all: [...] } · { not: {...} }
   type: 'answer' — the step is a question: the player answers in the side panel (or "responder <valor>")
     answer: { accept: ['{{dev.ip}}'], normalize: 'ip' | 'port' | 'int' | 'text', tol: 1 }
   vars — values read once (a lesson: when it opens · a problem: when it starts), then fixed */
(function () {
  'use strict';
  const DL = window.DL;

  /* ------------------------------------------------------------------ */
  /* Lessons: opened by ops.js for a fault / a new server                */
  /* ------------------------------------------------------------------ */
  const showIfaces = { any: [{ ran: 'ip-show' }, { ran: 'link-show' }] };
  const pingGw = { ran: 'ping-ok:{{gw}}' };

  const lessons = {
    setup: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado. Coloque-o na rede com o IP {{dev.ip}}/24 e teste a conexão com o gateway {{gw}}.',
      steps: [
        { text: 'Veja as interfaces de rede do servidor.', help: ['ip-addr'], check: showIfaces },
        { text: 'A eth0 está DOWN. Ligue a interface.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Atribua o IP {{dev.ip}}/24 à eth0.', help: ['ip-addr-add'], cmd: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add', 'ip-route'], check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a conexão com o gateway.', help: ['ping'], check: pingGw },
      ],
    },
    cable: {
      title: 'Falha de conexão · {{dev.name}}',
      goal: '{{dev.name}} sumiu da rede e o monitor marcou o host como indisponível. Descubra se é configuração ou camada física.',
      steps: [
        { text: 'Veja o estado do link da eth0.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { text: 'NO-CARRIER = sem sinal no cabo. Reconecte o cabo no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste a conexão com o gateway {{gw}}.', help: ['ping'], check: pingGw },
      ],
    },
    link: {
      title: 'Falha de conexão · {{dev.name}}',
      goal: '{{dev.name}} parou de responder na rede. Descubra o motivo, corrija e teste.',
      steps: [
        { text: 'Veja o estado das interfaces.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { text: 'A eth0 caiu (DOWN). Ligue a interface de novo.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Teste a conexão com o gateway {{gw}}.', help: ['ping'], check: pingGw },
      ],
    },
    service: {
      title: 'Serviço parado · {{dev.name}}',
      goal: 'O site hospedado no {{dev.name}} não responde. Verifique o serviço web (nginx).',
      steps: [
        { text: 'Veja o estado do serviço nginx.', help: ['systemctl-status'], check: { ran: 'status:nginx' } },
        { text: 'O nginx está "failed". Reinicie o serviço.', help: ['systemctl-restart', 'sudo'], check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], check: { ran: 'curl-ok' } },
      ],
    },
    disk: {
      title: 'Disco cheio · {{dev.name}}',
      goal: 'O disco do {{dev.name}} está quase lotado. Encontre o culpado e libere espaço.',
      steps: [
        { text: 'Veja o uso dos discos.', help: ['df'], check: { ran: 'df' } },
        { text: 'Descubra quanto ocupa a pasta de logs /var/log.', help: ['du'], check: { ran: 'du:/var/log' } },
        { text: 'Limpe os logs antigos do journal (deixe 200M).', help: ['journalctl-vacuum', 'sudo'], check: { state: 'disk', lt: 80 } },
        { text: 'Confira o disco de novo.', help: ['df'], check: { ran: 'df-ok' } },
      ],
    },
    // the broken port as it was when the task opened: ops clears d.sw.bad / fixed as soon as the fault is resolved
    // (half a second after "no shutdown", console still open), so the steps follow this port instead
    port: {
      vars: { port: 'sw.bad' },
      title: 'Porta em erro · {{dev.name}}',
      goal: 'Uma porta do switch {{dev.name}} entrou em err-disabled e derrubou um servidor. Encontre e reative a porta.',
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ state: 'sw.mode', ne: 'user' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Veja o status das portas.', help: ['show-int'], check: { ran: 'show-int' } },
        { text: 'Entre no modo de configuração.', help: ['conf-t'], check: { any: [{ state: 'sw.mode', in: ['conf', 'if'] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Selecione a porta com problema.', help: ['interface'], cmd: 'interface {{port}}', check: { any: [{ all: [{ state: 'sw.mode', eq: 'if' }, { state: 'sw.cur', eq: '{{port}}' }] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Desligue a porta.', help: ['shutdown'], check: { any: [{ state: 'sw.healed', arg: '{{port}}' }, { state: 'sw.port', arg: '{{port}}', eq: 'disabled' }] } },
        { text: 'Ligue a porta novamente.', help: ['no-shutdown'], check: { state: 'sw.healed', arg: '{{port}}' } },
        // a show taken while this port is connected again (one taken between shutdown and no shutdown doesn't count)
        { text: 'Volte (end) e confira o status das portas.', help: ['end', 'show-int'], check: { ran: 'show-int-ok:{{port}}' } },
      ],
    },
    // the same job as setup, with less and less help as the career goes on (the Júnior problems open them).
    // auto: what the dev auto-play types (steps that show no command of their own)
    setup_jr1: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado. Coloque-o na rede com o IP {{dev.ip}}/24 e a rota pelo gateway {{gw}}. Desta vez o comando do IP e da rota é com você.',
      steps: [
        { text: 'Veja as interfaces de rede do servidor.', help: ['ip-addr'], check: showIfaces },
        { text: 'A eth0 está DOWN. Ligue a interface.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Atribua o IP {{dev.ip}}/24 à eth0.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste o gateway e a internet (8.8.8.8).', help: ['ping'], auto: 'ping -c 3 {{gw}}\nping -c 3 8.8.8.8', check: { all: [pingGw, { ran: 'ping-ok:8.8.8.8' }] } },
      ],
    },
    setup_jr2: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado: IP {{dev.ip}}/24, gateway {{gw}}. Os passos dizem o que fazer, não como.',
      steps: [
        { text: 'Descubra o estado da rede do servidor.', help: ['ip-addr'], cmd: 'ip addr', check: showIfaces },
        { text: 'Deixe a eth0 ativa.', help: ['ip-link-up', 'sudo'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'Endereço do servidor: {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Saída para as outras redes pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Prove que o servidor chega na internet.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    setup_jr3: {
      title: 'Configurar {{dev.name}}',
      goal: 'Coloque o {{dev.name}} em produção: IP {{dev.ip}}/24, gateway {{gw}}, nome {{dev.host}}, e prove que ele chega na internet. Sem roteiro: cada passo diz só o resultado esperado.',
      steps: [
        { text: 'A interface de rede está ativa.', help: ['ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'O servidor responde no IP {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Existe rota padrão pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'O nome da máquina é {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'O ping até a internet (8.8.8.8) volta.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    // a setup ticket with the wrong gateway: the player finds the right one in notas.txt
    setup_ticket: {
      title: 'Chamado de configuração · {{dev.name}}',
      goal: 'O chamado diz: "{{dev.name}} · IP {{dev.ip}}/24 · gateway 10.0.1.254". Configure e teste. Se não funcionar, desconfie do chamado.',
      steps: [
        { text: 'Ligue a eth0 e dê o IP {{dev.ip}}/24.', help: ['ip-link-up', 'ip-addr-add'], auto: 'sudo ip link set eth0 up\nsudo ip addr add {{dev.ip}}/24 dev eth0', check: { all: [{ state: 'eth0.up' }, { state: 'eth0.ip' }] } },
        { text: 'Crie a rota padrão que o chamado pede (10.0.1.254).', help: ['ip-route-add'], auto: 'sudo ip route add default via 10.0.1.254', check: { any: [{ state: 'route', eq: '10.0.1.254' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Teste a internet (8.8.8.8). Não voltou? Algo no chamado está errado.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { any: [{ ran: 'ping-fail' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Ache o gateway certo: o admin deixou anotado no arquivo notas.txt.', help: ['cat'], auto: 'cat notas.txt', check: { any: [{ ran: 'cat:notas.txt' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Troque a rota padrão pelo gateway certo.', help: ['ip-route-del', 'ip-route-add'], auto: 'sudo ip route del default\nsudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a internet de novo.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
  };

  /* ------------------------------------------------------------------ */
  /* Problems: sorted out over time for the player's rank                */
  /*   target   — the equipment it happens on (problems.js matches it)   */
  /*   setup    — what goes wrong when it starts (a fault, a rename…)    */
  /*   complete — lesson (its own steps in the console) · fixed (the     */
  /*              fault is gone) · online (the server got configured) ·  */
  /*              steps (a checklist done outside the console)           */
  /*   trigger  — random (the timer) · auto (as soon as it fits, at its  */
  /*              own rank: the player's own new server)                 */
  /*   when     — an extra rule from problems.js WHEN                    */
  /*   devices  — other equipment it involves ({ sw: 'switch.of' }); a  */
  /*              step on one of them says device: 'sw' (default dev)    */
  /*   bot      — 'fix': the crew member also fixes the setup's fault    */
  /*   roles / bot_minutes — who on the team can take it ("Atribuir a…", */
  /*              the player gets 15% of the XP; roles: [] = only you)   */
  /*   step.device — a role of devices ('any': whichever console)        */
  /*   step.auto — what the dev auto-play types (never shown)            */
  /*   check.at — check another device of the problem (a role / a var)   */
  /* ------------------------------------------------------------------ */
  // the equipment most problems happen on
  const LNX = { kind: 'server', state: 'online', os: 'linux', healthy: true };
  const WIN = { kind: 'server', state: 'online', os: 'windows', win: 'ready', healthy: true };
  const NEW = { kind: 'server', state: 'link', own: true, os: 'linux' };
  const MSW = { kind: 'switch', managed: true, healthy: true };
  const T = (base, more) => Object.assign({}, base, more || {});
  const swEnable = { text: 'Entre no modo privilegiado.', help: ['enable'], cmd: 'enable', check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } };
  const problems = [
    {
      id: 'est_primeiro_acesso', n: 1, rank: 'est', title: 'Primeiro acesso ao {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Antes de mexer em qualquer servidor, reconheça a máquina: quem você é nela, o nome, o sistema e há quanto tempo está ligada.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja com qual usuário você entrou.', help: ['whoami'], check: { ran: 'cmd:whoami' } },
        { text: 'Veja o nome da máquina.', help: ['hostname'], check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { text: 'Veja o sistema e a versão do kernel.', help: ['uname'], cmd: 'uname -a', check: { ran: 'cmd:uname' } },
        { text: 'Veja há quanto tempo o servidor está ligado.', help: ['uptime'], check: { ran: 'cmd:uptime' } },
      ],
    },
    {
      id: 'est_inventario_hardware', n: 2, rank: 'est', title: 'Inventário de hardware do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O supervisor está atualizando a ficha técnica dos servidores e pediu o processador e a memória do {{dev.name}}.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { cores: 'hw.cores' },
      steps: [
        { text: 'Veja o processador do servidor.', help: ['lscpu'], check: { ran: 'cmd:lscpu' } },
        { text: 'Veja a memória.', help: ['free'], cmd: 'free -h', check: { ran: 'cmd:free' } },
        { type: 'answer', text: 'Quantos núcleos (cores) o {{dev.name}} tem?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'est_qual_ip', n: 3, rank: 'est', title: 'Qual é o IP do {{dev.name}}?', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um colega precisa liberar o {{dev.name}} no firewall e pediu o IP dele. Confira no próprio servidor.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja as interfaces e os endereços do servidor.', help: ['ip-addr'], check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual é o IP da eth0 do {{dev.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'est_gateway_internet', n: 4, rank: 'est', title: 'Teste do gateway e da internet · {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Checklist do turno: o servidor tem rota padrão, alcança o gateway e sai para a internet?',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja a tabela de rotas: existe uma rota padrão (default via …)?', help: ['ip-route'], check: { ran: 'route-show' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-ok:{{gw}}' } },
        { text: 'Teste a saída para a internet (8.8.8.8).', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'est_configurar_servidor', n: 5, rank: 'est', title: 'Configurar o servidor novo · {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup',
      summary: 'O {{dev.name}} já tem cabo. Ligue a interface, dê o IP {{dev.ip}}/24, crie a rota e teste com ping.',
      target: { kind: 'server', state: 'link', own: true },
    },
    {
      id: 'est_porta_servidor', n: 6, rank: 'est', title: 'Em que porta do {{dev.name}} está o {{srv.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Documentação do rack: anote em qual porta do switch {{dev.name}} o servidor {{srv.name}} está ligado.',
      target: { kind: 'switch', managed: true, healthy: true, direct: true, prefer: 'SW-01' },
      vars: { srv: 'sw.direct' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja o status das portas: a coluna Name mostra quem está ligado em cada uma.', help: ['show-int'], check: { ran: 'show-int' } },
        { type: 'answer', text: 'Em qual porta está o {{srv.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'est_site_responde', n: 7, rank: 'est', title: 'O site do {{dev.name}} está respondendo?', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'atendente'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente perguntou se o site caiu. Confira o serviço web e faça uma requisição de teste.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, web: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja o estado do serviço nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Faça uma requisição ao site.', help: ['curl'], check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'est_reiniciar_nginx', n: 8, rank: 'est', title: 'Reiniciar o nginx do {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'service',
      summary: 'O site parou. Com o procedimento em mãos: veja o status do nginx, reinicie e confirme com curl.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, web: true, prefer: 'SRV-01' },
      setup: { fault: 'service' },
    },
    {
      id: 'est_interface_desligada', n: 9, rank: 'est', title: 'Interface desligada no {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'link',
      summary: 'O {{dev.name}} sumiu da rede. Veja as interfaces, ligue a eth0 e teste com ping.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'link' },
    },
    {
      id: 'est_cabo_solto', n: 10, rank: 'est', title: 'Cabo solto no {{rack.id}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'cable',
      summary: 'O {{dev.name}} perdeu a conexão. ip link mostra NO-CARRIER? Então é camada física: reconecte o cabo no rack.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'cable' },
    },
    {
      id: 'est_instalar_cabear', n: 11, rank: 'est', title: 'Instalar e cabear o servidor novo', difficulty: 2, xp: 50, credits: 8,
      // roles: [] — only the player: it starts with buying and installing the server
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'steps', when: 'firstServer',
      summary: 'A empresa precisa de um servidor no ar. Instale um servidor e um switch gerenciável e ligue o cabo da eth0 no switch.',
      target: { kind: 'server', state: ['new', 'link'], own: true, lazy: true },
      steps: [
        { text: 'Instale um servidor num rack (Construir → Equipamentos → Servidor).', action: 'build', check: { bound: true } },
        { text: 'Instale um switch gerenciável na mesma sala do servidor.', action: 'build', check: { state: 'switch.near' } },
        { text: 'Ligue o cabo da eth0 numa porta gi0/… do switch.', action: 'cabling', check: { state: 'state', in: ['link', 'online'] } },
      ],
    },
    {
      id: 'est_organizar_cabos', n: 12, rank: 'est', title: 'Organizar os cabos do {{rack.id}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Mexeram no {{rack.id}} e os cabos ficaram bagunçados: atrapalha o fluxo de ar e a manutenção.',
      target: { kind: 'rack', cabled: true },
      setup: { rack: 'messy' },
      steps: [
        { text: 'Abra o cabeamento do {{rack.id}} e use Organizar cabos.', action: 'cabling', check: { state: 'rack.tidy' } },
      ],
    },
    {
      id: 'est_uso_disco', n: 13, rank: 'est', title: 'Uso de disco do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Relatório de capacidade: o gestor quer saber quanto do disco do {{dev.name}} já está ocupado.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { disk: 'disk.pct' },
      steps: [
        { text: 'Veja o uso dos discos.', help: ['df'], check: { ran: 'df' } },
        { text: 'Veja quanto ocupa a pasta de logs /var/log.', help: ['du'], cmd: 'du -sh /var/log', check: { ran: 'du:/var/log' } },
        { type: 'answer', text: 'Quantos % do disco / do {{dev.name}} estão em uso?', help: ['df', 'responder'], answer: { accept: ['{{disk}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'est_limpar_logs', n: 14, rank: 'est', title: 'Limpar logs antigos do {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'disk',
      summary: 'O disco do {{dev.name}} passou de 90%. Ache o culpado (/var/log) e limpe os logs antigos do journal.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'disk' },
    },
    {
      id: 'est_achar_porta_erro', n: 15, rank: 'est', title: 'Achar a porta em erro no {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um servidor caiu e o monitor aponta para o switch {{dev.name}}. Descubra qual porta entrou em err-disabled e passe para quem vai corrigir.',
      handoff: 'a correção da porta fica com a equipe — ou com você, pelo alerta em Tarefas',
      target: { kind: 'switch', managed: true, healthy: true, prefer: 'SW-01' },
      setup: { fault: 'port', quiet: true },
      vars: { port: 'sw.bad' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja o status das portas.', help: ['show-int'], check: { ran: 'show-int' } },
        { type: 'answer', text: 'Qual porta do {{dev.name}} está em err-disabled?', help: ['show-int', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'est_padronizar_hostname', n: 16, rank: 'est', title: 'Padronizar o nome do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} voltou de uma reinstalação com o nome padrão (localhost). O padrão da empresa é o nome do equipamento em minúsculas.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-02' },
      setup: { hostname: 'localhost' },
      steps: [
        { text: 'Veja o nome atual da máquina.', help: ['hostname'], check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { text: 'Mude o nome para {{dev.host}}.', help: ['hostnamectl', 'sudo'], cmd: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'Confira o nome novo.', help: ['hostname'], check: { ran: 'hostname-show:{{dev.host}}' } },
      ],
    },
    {
      id: 'est_tentativas_login', n: 17, rank: 'est', title: 'Quem tentou entrar no {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O monitor acusou muitas tentativas de login por SSH no {{dev.name}}. Descubra de qual IP vêm as senhas erradas para a segurança bloquear.',
      handoff: 'o IP vai para a segurança bloquear no firewall',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { authlog: 'bruteforce' },
      vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'Veja as últimas linhas do log de autenticação (/var/log/auth.log).', help: ['tail'], cmd: 'tail -n 20 /var/log/auth.log', check: { any: [{ ran: 'tail:/var/log/auth.log' }, { ran: 'cat:/var/log/auth.log' }] } },
        { text: 'Filtre só as senhas erradas (Failed password).', help: ['grep'], cmd: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP vem a maioria das tentativas?', help: ['grep', 'responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'est_porta_servico', n: 18, rank: 'est', title: 'Em que porta o {{svc.name}} do {{dev.name}} escuta?', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca', 'redes'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A equipe de firewall vai liberar o {{svc.name}} do {{dev.name}} e precisa da porta exata. Pergunte ao próprio servidor.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { svc: 'svc.listen' },
      steps: [
        { text: 'Liste as portas TCP em escuta com o processo de cada uma (o -p precisa de sudo).', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss-procs' } },
        { type: 'answer', text: 'Em que porta o {{svc.name}} escuta?', help: ['ss', 'responder'], answer: { accept: ['{{svc.port}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'est_salvar_config', n: 19, rank: 'est', title: 'Salvar a configuração do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ontem mudaram a descrição de uma porta do {{dev.name}} e não salvaram: se o switch reiniciar, a mudança se perde. Compare e salve.',
      target: { kind: 'switch', managed: true, healthy: true, linked: true, prefer: 'SW-01' },
      setup: { swconfig: 'unsaved' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja a configuração em uso (running-config).', help: ['show-run'], cmd: 'show running-config', check: { ran: 'show-run' } },
        { text: 'Compare com a configuração salva (startup-config): falta uma descrição de porta.', help: ['show-start'], cmd: 'show startup-config', check: { ran: 'show-start' } },
        { text: 'Salve a configuração em uso como a de inicialização.', help: ['copy-run-start'], cmd: 'copy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    // two consoles: the server (dev) and the switch at the other end of its cable (sw)
    {
      id: 'est_servidor_sem_rede', n: 20, rank: 'est', title: '{{dev.name}} sem rede: investigue dos dois lados', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} parou de responder. Comece pelo servidor; se ele estiver certo, siga o cabo até o {{sw.name}}.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      devices: { sw: 'switch.of' },
      setup: { fault: 'port', on: 'sw', quiet: true },
      vars: { port: 'srv.port' },
      steps: [
        { text: 'No {{dev.name}}, teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-fail' } },
        { text: 'Confira a interface: se a eth0 está UP e com IP, o problema não é no servidor.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { device: 'sw', text: 'Vá ao {{sw.name}}, o switch do outro lado do cabo, e entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Veja o status das portas: qual está em err-disabled?', help: ['show-int'], check: { any: [{ ran: 'show-int' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Entre no modo de configuração.', help: ['conf-t'], check: { any: [{ state: 'sw.mode', in: ['conf', 'if'] }, { ran: 'conf' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Selecione a porta em erro.', help: ['interface'], cmd: 'interface {{port}}', check: { any: [{ all: [{ state: 'sw.mode', eq: 'if' }, { state: 'sw.cur', eq: '{{port}}' }] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Reinicie a porta: shutdown e depois no shutdown.', help: ['shutdown', 'no-shutdown'], check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'Volte ao {{dev.name}} e teste o gateway de novo.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-ok:{{gw}}' } },
      ],
    },

    /* ---------------- Júnior I: mais servidores na mesma sala ---------------- */
    {
      id: 'jr1_configurar_servidor', n: 1, rank: 'jr1', title: 'Configurar o servidor novo sem cola · {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr1',
      summary: 'O {{dev.name}} já tem cabo. O roteiro é o mesmo de antes, mas agora você monta sozinho(a) os comandos do IP e da rota.',
      target: NEW,
    },
    {
      id: 'jr1_disco_mais_cheio', n: 2, rank: 'jr1', title: 'Qual disco está mais cheio: {{dev.name}} ou {{peer.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O gestor vai comprar discos e quer saber qual dos dois servidores está mais perto de lotar.',
      target: T(LNX, { prefer: 'SRV-01' }), devices: { peer: 'server.peer' },
      setup: { diskpct: [66, 78] }, vars: { top: 'max:disk.pct' },
      steps: [
        { text: 'Veja o uso de disco do {{dev.name}}.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { device: 'peer', text: 'Veja o uso de disco do {{peer.name}}.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { device: 'peer', type: 'answer', text: 'Qual dos dois está com o disco mais cheio?', help: ['df', 'responder'], answer: { accept: ['{{top}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr1_ip_trocado', n: 3, rank: 'jr1', title: 'IP trocado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O monitor diz que o {{dev.name}} sumiu do IP {{dev.ip}}. Alguém configurou o endereço errado: troque pelo certo.',
      target: LNX, setup: { fault: 'wrongip' }, vars: { bad: 'os.badIp' },
      steps: [
        { text: 'Veja o IP que está na eth0.', help: ['ip-addr'], cmd: 'ip addr', check: { ran: 'ip-show' } },
        { text: 'Remova o endereço errado ({{bad}}/24).', help: ['ip-addr-del', 'sudo'], cmd: 'sudo ip addr del {{bad}}/24 dev eth0', check: { not: { state: 'eth0.has', arg: '{{bad}}' } } },
        { text: 'Coloque o IP certo, {{dev.ip}}/24.', help: ['ip-addr-add'], cmd: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr1_gateway_errado', n: 4, rank: 'jr1', title: 'Gateway errado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} fala com a rede local, mas não sai para a internet. Suspeita: a rota padrão aponta para o lugar errado.',
      target: LNX, setup: { fault: 'badroute' },
      steps: [
        { text: 'Teste a saída para a internet (8.8.8.8).', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { any: [{ ran: 'ping-fail' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Veja a tabela de rotas: para onde aponta a rota padrão?', help: ['ip-route'], cmd: 'ip route', check: { ran: 'route-show' } },
        { text: 'Apague a rota padrão errada.', help: ['ip-route-del', 'sudo'], cmd: 'sudo ip route del default', check: { state: 'route', ne: '10.0.1.254' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add'], cmd: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a internet de novo.', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'jr1_vizinhos', n: 5, rank: 'jr1', title: 'O {{dev.name}} enxerga o {{peer.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os dois servidores vão trocar dados. Antes, confirme que um alcança o outro pela rede.',
      target: LNX, devices: { peer: 'server.peer' },
      steps: [
        { device: 'peer', text: 'No {{peer.name}}, veja o IP dele.', help: ['ip-addr'], cmd: 'ip addr', check: { ran: 'ip-show' } },
        { device: 'peer', type: 'answer', text: 'Qual é o IP do {{peer.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{peer.ip}}'], normalize: 'ip' } },
        { text: 'No {{dev.name}}, faça ping no {{peer.name}}.', help: ['ping'], cmd: 'ping -c 3 {{peer.ip}}', check: { ran: 'ping-ok:{{peer.ip}}' } },
      ],
    },
    {
      id: 'jr1_ssh_parado', n: 6, rank: 'jr1', title: 'SSH parado no {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Ninguém consegue acessar o {{dev.name}} remotamente. Pelo console do rack, veja o serviço de SSH.',
      target: LNX, setup: { fault: 'sshstop' },
      steps: [
        { text: 'Veja o estado do serviço ssh.', help: ['systemctl-status'], cmd: 'systemctl status ssh', check: { ran: 'status:ssh' } },
        { text: 'Está "inactive (dead)": inicie o serviço.', help: ['systemctl-start', 'sudo'], cmd: 'sudo systemctl start ssh', check: { state: 'service', arg: 'ssh', eq: 'active' } },
        { text: 'Confira que a porta 22 voltou a escutar.', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss' } },
      ],
    },
    {
      id: 'jr1_portas_em_uso', n: 7, rank: 'jr1', title: 'Quantas portas do {{dev.name}} estão em uso?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Planejamento da sala: quantos equipamentos já estão ligados no switch {{dev.name}}?',
      target: T(MSW, { linked: true, prefer: 'SW-01' }), vars: { n: 'sw.count:connected' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas.', help: ['show-int'], cmd: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Quantas portas estão connected?', help: ['show-int', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_parado_ou_travado', n: 8, rank: 'jr1', title: 'Site fora no {{dev.name}}: parado ou travado?', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O site caiu. Desta vez o nginx não travou: alguém parou o serviço. Descubra quem antes de subir de novo.',
      target: T(LNX, { web: true }), setup: { fault: 'nginxstop' }, vars: { who: 'auth.stopper' },
      steps: [
        { text: 'Veja o estado do nginx: "failed" é travado, "inactive (dead)" é parado.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Quem parou usou sudo: procure "nginx" no log de autenticação.', help: ['grep'], cmd: 'grep nginx /var/log/auth.log', check: { ran: 'grep-hit:/var/log/auth.log' } },
        { type: 'answer', text: 'Qual usuário parou o nginx?', help: ['grep', 'responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { text: 'Inicie o nginx de novo.', help: ['systemctl-start', 'sudo'], cmd: 'sudo systemctl start nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], cmd: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr1_reiniciou', n: 9, rank: 'jr1', title: 'O {{dev.name}} reiniciou?', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente reclamou de uma queda de madrugada. Confira há quanto tempo o {{dev.name}} está ligado.',
      target: LNX, setup: { uptime: [140, 560] }, vars: { h: 'uptime.h' },
      steps: [
        { text: 'Veja há quanto tempo o servidor está ligado (H:MM = horas e minutos).', help: ['uptime'], cmd: 'uptime', check: { ran: 'cmd:uptime' } },
        { type: 'answer', text: 'Há quantas horas, mais ou menos, o {{dev.name}} está ligado?', help: ['uptime', 'responder'], answer: { accept: ['{{h}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'jr1_memoria', n: 10, rank: 'jr1', title: 'Quanta memória tem o {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente quer saber se a aplicação dele cabe no {{dev.name}}. Confira a memória RAM.',
      target: T(LNX, { prefer: 'SRV-02' }), vars: { ram: 'hw.ram' },
      steps: [
        { text: 'Veja a memória do servidor.', help: ['free'], cmd: 'free -h', check: { ran: 'cmd:free' } },
        { type: 'answer', text: 'Quantos GB de RAM o {{dev.name}} tem no total? (1 TB = 1024 GB)', help: ['free', 'responder'], answer: { accept: ['{{ram}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_portas_dois', n: 11, rank: 'jr1', title: 'Em que portas do {{dev.name}} estão o {{srv.a.name}} e o {{srv.b.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Documentação do rack: anote as portas do switch {{dev.name}} onde estão os dois servidores.',
      target: T(MSW, { direct2: true, prefer: 'SW-01' }), vars: { srv: 'sw.pair' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: a coluna Name mostra quem está em cada uma.', help: ['show-int'], cmd: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Em qual porta está o {{srv.a.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.a.port}}'], normalize: 'port' } },
        { type: 'answer', text: 'E o {{srv.b.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.b.port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'jr1_duas_falhas', n: 12, rank: 'jr1', title: 'Duas falhas no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'sistemas', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} saiu da rede e, quando voltar, o site não vai subir: o nginx também caiu. Resolva as duas coisas.',
      target: T(LNX, { web: true }), setup: { fault: 'linksvc' },
      steps: [
        { text: 'Veja o estado das interfaces.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { text: 'Ligue a eth0.', help: ['ip-link-up', 'sudo'], cmd: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
        { text: 'Agora o site: veja o estado do nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Reinicie o nginx.', help: ['systemctl-restart', 'sudo'], cmd: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], cmd: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr1_posto_atendimento', n: 13, rank: 'jr1', title: 'Monte o posto de atendimento', difficulty: 2, xp: 50, credits: 8,
      // roles: [] — only the player: it is a purchase
      skill: 'gestao', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os clientes vão ligar para o suporte. Monte uma estação de atendimento para a equipe atender.',
      target: { kind: 'rack' }, vars: { n: 'items:desksupport' },
      steps: [
        { text: 'Instale uma Estação de atendimento (Construir → Equipamentos → Estações).', action: 'build', check: { state: 'items', arg: 'desksupport', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr1_ultimo_login', n: 14, rank: 'jr1', title: 'De onde veio o último login no {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Auditoria de acesso: de qual IP veio o último login aceito no {{dev.name}}?',
      target: LNX, setup: { authlog: 'logins' }, vars: { last: 'auth.last' },
      steps: [
        { text: 'Veja as últimas linhas do log de autenticação.', help: ['tail'], cmd: 'tail -n 20 /var/log/auth.log', check: { any: [{ ran: 'tail:/var/log/auth.log' }, { ran: 'cat:/var/log/auth.log' }] } },
        { text: 'Filtre só os logins aceitos (Accepted).', help: ['grep'], cmd: 'grep Accepted /var/log/auth.log', check: { ran: 'grep-hit:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP veio o login mais recente?', help: ['grep', 'responder'], answer: { accept: ['{{last}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'jr1_nome_duplicado', n: 15, rank: 'jr1', title: 'Nome duplicado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Dois servidores aparecem com o mesmo nome no monitoramento: o {{dev.name}} está usando o nome de outro.',
      target: LNX, setup: { hostname: 'dup' }, vars: { dup: 'hostname.dup' },
      steps: [
        { text: 'Veja o nome atual da máquina.', help: ['hostname'], cmd: 'hostname', check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { type: 'answer', text: 'De qual servidor é esse nome?', help: ['hostname', 'responder'], answer: { accept: ['{{dup}}'], normalize: 'text' } },
        { text: 'Mude o nome para {{dev.host}}.', help: ['hostnamectl', 'sudo'], cmd: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'Confira o nome novo.', help: ['hostname'], cmd: 'hostname', check: { ran: 'hostname-show:{{dev.host}}' } },
      ],
    },
    {
      id: 'jr1_senhas_erradas', n: 16, rank: 'jr1', title: 'Quantas senhas erradas no {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Relatório de segurança: quantas tentativas de login com senha errada o {{dev.name}} recebeu?',
      target: LNX, setup: { authlog: 'bruteforce' }, vars: { attacker: 'auth.attacker', n: 'auth.failed' },
      steps: [
        { text: 'Conte as linhas com "Failed password" no log de autenticação (grep -c conta).', help: ['grep'], cmd: 'grep -c "Failed password" /var/log/auth.log', check: { ran: 'grep:/var/log/auth.log' } },
        { type: 'answer', text: 'Quantas tentativas falharam?', help: ['grep', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_ficha_dois', n: 17, rank: 'jr1', title: 'Ficha técnica: {{dev.name}} e {{peer.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: ['servidores', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O gestor quer saber quantos núcleos de processamento a empresa tem nesses dois servidores.',
      target: LNX, devices: { peer: 'server.peer' }, vars: { cores: 'sum:hw.cores' },
      steps: [
        { text: 'Veja o processador do {{dev.name}}.', help: ['lscpu'], cmd: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { device: 'peer', text: 'Veja o processador do {{peer.name}}.', help: ['lscpu'], cmd: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { device: 'peer', type: 'answer', text: 'Quantos núcleos (cores) os dois têm somados?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_antes_reiniciar', n: 18, rank: 'jr1', title: 'Antes de reiniciar o {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} vai reiniciar na janela de manutenção. Antes, descubra o que mudou sem ser salvo e salve.',
      target: T(MSW, { linked: true, prefer: 'SW-01' }), setup: { swconfig: 'unsaved' }, vars: { port: 'sw.unsavedPort' },
      steps: [
        swEnable,
        { text: 'Veja a configuração em uso (running-config).', help: ['show-run'], cmd: 'show running-config', check: { ran: 'show-run' } },
        { text: 'Veja a configuração salva (startup-config).', help: ['show-start'], cmd: 'show startup-config', check: { ran: 'show-start' } },
        { type: 'answer', text: 'Qual porta tem uma descrição que ainda não foi salva?', help: ['show-run', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
        { text: 'Salve a configuração em uso.', help: ['copy-run-start'], cmd: 'copy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    {
      id: 'jr1_ip_livre', n: 19, rank: 'jr1', title: 'O IP {{cand.ip}} está livre?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Antes de dar o IP {{cand.ip}} a um equipamento novo, confirme que ninguém já usa esse endereço.',
      target: LNX, vars: { cand: 'ip.cand' },
      steps: [
        { text: 'Do {{dev.name}}, faça ping no {{cand.ip}}.', help: ['ping'], cmd: 'ping -c 3 {{cand.ip}}', check: { any: [{ ran: 'ping-ok:{{cand.ip}}' }, { ran: 'ping-fail' }] } },
        { type: 'answer', text: 'O {{cand.ip}} já está em uso? (sim ou nao)', help: ['ping', 'responder'], answer: { accept: ['{{cand.used}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr1_sem_rede_sem_cola', n: 20, rank: 'jr1', title: '{{dev.name}} sem rede: siga o cabo', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} parou de responder. Você já fez isso antes: agora os passos do switch não vêm prontos.',
      target: LNX, devices: { sw: 'switch.of' }, setup: { fault: 'port', on: 'sw', quiet: true }, vars: { port: 'srv.port' },
      steps: [
        { text: 'No {{dev.name}}, teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { any: [{ ran: 'ping-fail' }, { at: 'sw', state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Confira a eth0: se está UP e com IP, o problema não é no servidor.', help: ['ip-addr'], cmd: 'ip addr', check: showIfaces },
        { device: 'sw', text: 'No {{sw.name}}, ache a porta em erro.', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { any: [{ ran: 'show-int' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Reative a porta (desligue e ligue de novo).', help: ['conf-t', 'interface', 'shutdown', 'no-shutdown'], auto: 'configure terminal\ninterface {{port}}\nshutdown\nno shutdown\nend', check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'Volte ao {{dev.name}} e teste o gateway.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },

    /* ---------------- Júnior II: camada física (comando pronto só no 1º passo) ---------------- */
    {
      id: 'jr2_cabear_servidor', n: 1, rank: 'jr2', title: 'Cabear o {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      // roles: [] — only the player: the cable is the mission of this rank
      skill: 'redes', roles: [], bot_minutes: 15, weight: 1, trigger: 'auto', complete: 'steps',
      summary: 'Servidor novo no rack: leve o cabo da eth0 até uma porta gi0/… de um switch, direto ou pelo patch panel.',
      target: { kind: 'server', state: 'new', own: true },
      steps: [
        { text: 'Ligue o cabo da eth0 do {{dev.name}} numa porta de switch.', action: 'cabling', check: { state: 'state', in: ['link', 'online'] } },
      ],
    },
    {
      id: 'jr2_cabo_ou_interface', n: 2, rank: 'jr2', title: 'NO-CARRIER ou DOWN? · {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} caiu. Antes de mexer, diga em que camada está o problema: configuração (interface) ou física (cabo)?',
      target: LNX, setup: { fault: ['link', 'cable'] }, vars: { layer: 'fault.layer', layer2: 'fault.layer2' },
      steps: [
        { text: 'Veja o estado do link da eth0.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { type: 'answer', text: 'O problema é no cabo ou na interface?', help: ['ip-link', 'responder'], answer: { accept: ['{{layer}}', '{{layer2}}'], normalize: 'text' } },
        { text: 'Corrija: ligue a interface ou reconecte o cabo no rack.', help: ['ip-link-up', 'cabling'], action: 'cabling', auto: 'sudo ip link set eth0 up', check: { all: [{ state: 'eth0.up' }, { state: 'cable' }] } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_porta_notconnect', n: 3, rank: 'jr2', title: 'Porta notconnect no {{sw.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} saiu da rede. No servidor está tudo configurado: siga o cabo até o {{sw.name}}.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: 'cable', opts: { far: true } }, vars: { port: 'cable.port' },
      steps: [
        { text: 'No {{dev.name}}, veja o link da eth0.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { device: 'sw', text: 'No {{sw.name}}, veja o status das portas: a do {{dev.name}} sumiu da lista (notconnect).', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { any: [{ ran: 'show-int' }, { at: 'dev', state: 'cable' }] } },
        { text: 'O cabo se soltou do lado do switch: reconecte no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { device: 'sw', text: 'Confira no {{sw.name}}: a {{port}} voltou a connected?', help: ['show-int'], auto: 'enable\nshow interfaces status', check: { ran: 'show-int-ok:{{port}}' } },
      ],
    },
    {
      id: 'jr2_dois_racks', n: 4, rank: 'jr2', title: 'Cabos bagunçados no {{rack.id}} e no {{outro.id}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Depois da instalação dos servidores novos, dois racks ficaram com os cabos embolados. Organize os dois.',
      target: { kind: 'rack', cabled: true }, devices: { outro: 'rack.other' }, setup: { rack: 'messy2' },
      steps: [
        { text: 'Organize os cabos do {{rack.id}}.', action: 'cabling', check: { state: 'rack.tidy' } },
        { device: 'outro', text: 'Organize os cabos do {{outro.id}}.', action: 'cabling', check: { state: 'rack.tidy' } },
      ],
    },
    {
      id: 'jr2_camera', n: 5, rank: 'jr2', title: 'Câmera na sala', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'A segurança pediu uma câmera na sala. A Câmera IP recebe energia pelo cabo de rede (PoE): precisa de um switch PoE na mesma sala.',
      target: { kind: 'rack' }, vars: { n: 'items:camera' },
      steps: [
        { text: 'Instale uma Câmera IP numa parede, numa sala com switch PoE (sem PoE ela fica sem energia).', action: 'build', check: { state: 'items', arg: 'camera', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_wifi', n: 6, rank: 'jr2', title: 'Wi-Fi para os visitantes', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os clientes que visitam o datacenter pedem Wi-Fi. O access point também é alimentado por PoE.',
      target: { kind: 'rack' }, vars: { n: 'items:ap' },
      steps: [
        { text: 'Instale um Access point Wi-Fi numa parede, numa sala com switch PoE.', action: 'build', check: { state: 'items', arg: 'ap', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_duas_portas', n: 7, rank: 'jr2', title: 'Duas portas fora no {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Dois servidores do {{dev.name}} caíram juntos. Uma porta entrou em erro e a outra alguém desligou e esqueceu.',
      target: T(MSW, { linkedMin: 2 }), setup: { fault: 'port2' }, vars: { bad: 'sw.bad', off: 'sw.off' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: uma está err-disabled e outra disabled.', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { text: 'Reative a porta em err-disabled ({{bad}}).', help: ['conf-t', 'interface', 'shutdown', 'no-shutdown'], auto: 'configure terminal\ninterface {{bad}}\nshutdown\nno shutdown', check: { state: 'sw.healed', arg: '{{bad}}' } },
        { text: 'Ligue a porta desligada ({{off}}).', help: ['interface', 'no-shutdown'], auto: 'interface {{off}}\nno shutdown', check: { state: 'sw.port', arg: '{{off}}', ne: 'disabled' } },
        { text: 'Volte (end) e salve a configuração.', help: ['end', 'copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
      ],
    },
    {
      id: 'jr2_quem_na_porta', n: 8, rank: 'jr2', title: 'Quem está na {{srv.port}} do {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A etiqueta da porta {{srv.port}} do {{dev.name}} caiu. Descubra qual servidor está ligado nela.',
      target: T(MSW, { direct: true }), vars: { srv: 'sw.direct' },
      steps: [
        swEnable,
        { text: 'Veja quem está em cada porta.', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Qual servidor está na {{srv.port}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.name}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr2_cabo_porta_errada', n: 9, rank: 'jr2', title: 'Cabo na porta errada · {{dev.name}}', difficulty: 2, xp: 70, credits: 11,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Numa troca de cabo, o {{dev.name}} foi parar na porta de uplink (te1) do switch, que é reservada. No cabeamento o cabo fica vermelho.',
      target: T(LNX, { te1free: true }), setup: { fault: 'cablewrong' },
      steps: [
        { text: 'Veja o link da eth0: sem sinal (NO-CARRIER)?', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { text: 'No cabeamento, passe o cabo da te1 para uma porta gi0/… livre.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_placa_perfurada', n: 10, rank: 'jr2', title: 'O {{rack.id}} está esquentando', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'O ar frio não chega na frente do {{rack.id}}. Uma placa perfurada no piso leva o ar do corredor frio até os servidores.',
      target: { kind: 'rack', cabled: true }, vars: { n: 'items:ventile' },
      steps: [
        { text: 'Instale uma Placa perfurada no piso em frente ao rack (Construir → Racks).', action: 'build', check: { state: 'items', arg: 'ventile', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_link_instavel', n: 11, rank: 'jr2', title: 'Link instável no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} cai e volta há uma hora, e agora caiu de vez. O syslog conta a história: cabo com mau contato.',
      target: LNX, setup: { fault: 'flap' }, vars: { n: 'flap.n' },
      steps: [
        { text: 'Veja as mensagens do sistema sobre a eth0.', help: ['grep'], cmd: 'grep eth0 /var/log/syslog', check: { ran: 'grep-hit:/var/log/syslog' } },
        { type: 'answer', text: 'Quantas vezes o link caiu (Link is Down)?', help: ['grep', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'Cabo com mau contato: reconecte no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_configurar_servidor', n: 12, rank: 'jr2', title: 'Configurar o {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr2',
      summary: 'O {{dev.name}} já tem cabo. Agora os passos dizem só o que fazer: os comandos são com você.',
      target: NEW,
    },
    {
      id: 'jr2_portas_livres', n: 13, rank: 'jr2', title: 'Quantas portas livres no {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Chegam servidores novos. Quantos ainda cabem no {{dev.name}} antes de precisar de outro switch?',
      target: T(MSW, { linked: true }), vars: { free: 'sw.count:notconnect' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: as livres aparecem no fim, como "sem cabo (notconnect)".', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Quantas portas estão livres?', help: ['show-int', 'responder'], answer: { accept: ['{{free}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr2_ip_do_switch', n: 14, rank: 'jr2', title: 'Qual o IP de gerência do {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O switch também tem IP, para ser gerenciado pela rede. Descubra qual é e teste a rede a partir dele.',
      target: T(MSW, { direct: true }), vars: { srv: 'sw.direct' },
      steps: [
        swEnable,
        { text: 'Veja a configuração em uso: o IP fica na interface Vlan.', help: ['show-run'], auto: 'show running-config', check: { ran: 'show-run' } },
        { type: 'answer', text: 'Qual é o IP de gerência do {{dev.name}}?', help: ['show-run', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Do próprio switch, faça ping no {{srv.name}} ({{srv.ip}}).', help: ['sw-ping'], auto: 'ping {{srv.ip}}', check: { ran: 'ping-ok:{{srv.ip}}' } },
      ],
    },
    {
      id: 'jr2_sumiu_do_monitor', n: 15, rank: 'jr2', title: '{{dev.name}} sumiu do monitor', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O monitor marcou o {{dev.name}} como fora. Confirme de outro servidor, conserte e teste de novo de lá.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'link', quiet: true },
      steps: [
        { device: 'peer', text: 'Do {{peer.name}}, faça ping no {{dev.name}} ({{dev.ip}}).', help: ['ping'], cmd: 'ping -c 3 {{dev.ip}}', check: { any: [{ ran: 'cmd:ping' }, { at: 'dev', state: 'eth0.up' }] } },
        { text: 'No {{dev.name}}, veja as interfaces.', help: ['ip-link'], auto: 'ip link', check: showIfaces },
        { text: 'Ligue a interface que caiu.', help: ['ip-link-up', 'sudo'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { device: 'peer', text: 'Do {{peer.name}}, faça o ping de novo.', help: ['ping'], auto: 'ping -c 3 {{dev.ip}}', check: { ran: 'ping-ok:{{dev.ip}}' } },
      ],
    },
    {
      id: 'jr2_porta_desligada', n: 16, rank: 'jr2', title: 'Porta desligada no {{sw.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} caiu sem nenhum erro no servidor. Alguém mexeu no {{sw.name}} e desligou a porta dele.',
      target: LNX, devices: { sw: 'switch.of' }, setup: { fault: 'portoff', on: 'sw' }, vars: { port: 'srv.port' },
      steps: [
        T(swEnable, { device: 'sw', text: 'No {{sw.name}}, entre no modo privilegiado.' }),
        { device: 'sw', text: 'Veja o status das portas: qual está disabled?', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { device: 'sw', text: 'Ligue a porta de novo.', help: ['conf-t', 'interface', 'no-shutdown'], auto: 'configure terminal\ninterface {{port}}\nno shutdown', check: { state: 'sw.port', arg: '{{port}}', ne: 'disabled' } },
        { device: 'sw', text: 'Volte (end) e salve a configuração.', help: ['end', 'copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
        { text: 'No {{dev.name}}, teste o gateway.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_qual_sem_ssh', n: 17, rank: 'jr2', title: 'Acesso remoto falhando: {{dev.name}} ou {{peer.name}}?', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Um dos dois servidores não aceita mais SSH. Descubra qual e suba o serviço.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'sshstop', on: ['dev', 'peer'], pick: true, quiet: true },
      vars: { who: 'faulty:sshstop', role: 'faultyRole:sshstop' },
      steps: [
        { text: 'No {{dev.name}}, veja as portas em escuta.', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss' } },
        { device: 'peer', text: 'No {{peer.name}}, faça o mesmo.', help: ['ss', 'sudo'], auto: 'sudo ss -tlnp', check: { ran: 'ss' } },
        { device: 'peer', type: 'answer', text: 'Qual dos dois não escuta na porta 22?', help: ['ss', 'responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { device: 'any', text: 'Inicie o ssh no servidor que está sem ele.', help: ['systemctl-start', 'sudo'], auto: 'sudo systemctl start ssh', check: { at: '{{role}}', state: 'service', arg: 'ssh', eq: 'active' } },
      ],
    },
    {
      id: 'jr2_ataque_dois', n: 18, rank: 'jr2', title: 'Ataque em dois servidores', difficulty: 3, xp: 90, credits: 14,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O monitor acusou tentativas de login por SSH no {{dev.name}} e no {{peer.name}}. Ache o IP que ataca os dois.',
      handoff: 'o IP vai para a segurança bloquear no firewall',
      target: LNX, devices: { peer: 'server.peer' }, setup: { authlog: 'bruteforce2' }, vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'No {{dev.name}}, filtre as senhas erradas do log de autenticação.', help: ['grep'], cmd: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'peer', text: 'Faça o mesmo no {{peer.name}}.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'peer', type: 'answer', text: 'Qual IP aparece atacando os dois?', help: ['grep', 'responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'jr2_disco_sem_roteiro', n: 19, rank: 'jr2', title: 'Disco cheio no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O disco do {{dev.name}} passou de 90%. Você já sabe o caminho: agora sem o comando pronto.',
      target: LNX, setup: { fault: 'disk' },
      steps: [
        { text: 'Descubra o uso do disco.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { text: 'Ache a pasta culpada (os logs ficam em /var/log).', help: ['du'], auto: 'du -sh /var/log', check: { ran: 'du:/var/log' } },
        { text: 'Libere espaço até o disco ficar abaixo de 80%.', help: ['journalctl-vacuum', 'sudo'], auto: 'sudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { text: 'Prove com o uso de disco atualizado.', help: ['df'], auto: 'df -h', check: { ran: 'df-ok' } },
      ],
    },
    {
      id: 'jr2_site_fora_dois', n: 20, rank: 'jr2', title: 'Site fora no {{dev.name}} e no {{peer.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Uma atualização derrubou o nginx em dois servidores ao mesmo tempo. Suba os dois e confirme.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { fault: 'service', on: ['dev', 'peer'] },
      steps: [
        { text: 'No {{dev.name}}, veja o estado do nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Reinicie o nginx do {{dev.name}}.', help: ['systemctl-restart', 'sudo'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site do {{dev.name}} responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
        { device: 'peer', text: 'Agora o {{peer.name}}: reinicie o nginx.', help: ['systemctl-restart', 'sudo'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { device: 'peer', text: 'Confirme que o site do {{peer.name}} responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },

    /* ---------------- Júnior III: sem comando pronto · primeiro Windows ---------------- */
    {
      id: 'jr3_servidor_sem_roteiro', n: 1, rank: 'jr3', title: 'Servidor novo, sem roteiro · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr3',
      summary: 'Coloque o {{dev.name}} em produção: IP, rota, nome e teste. Cada passo diz só o resultado esperado.',
      target: NEW,
    },
    {
      id: 'jr3_ip_de_outro', n: 2, rank: 'jr3', title: 'O {{dev.name}} pegou o IP de outro servidor', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Conflito de IP: o {{dev.name}} foi configurado com o endereço de outro servidor e sumiu do monitor.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'wrongip', ipOf: 'peer' }, vars: { bad: 'os.badIp' },
      steps: [
        { text: 'Veja o endereço da eth0.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Esse IP é de qual servidor? (o Monitor e o Infra mostram o IP de cada um)', help: ['ip-addr', 'responder'], answer: { accept: ['{{peer.name}}'], normalize: 'text' } },
        { text: 'Tire o IP que não é dele.', help: ['ip-addr-del'], auto: 'sudo ip addr del {{bad}}/24 dev eth0', check: { not: { state: 'eth0.has', arg: '{{bad}}' } } },
        { text: 'O {{dev.name}} responde no IP dele, {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'O gateway responde.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_gateway_do_chamado', n: 3, rank: 'jr3', title: 'O chamado veio errado · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_ticket',
      summary: 'O chamado de configuração do {{dev.name}} traz um gateway errado. Configure, perceba o erro e ache o certo.',
      target: NEW,
    },
    {
      id: 'jr3_instalar_windows', n: 4, rank: 'jr3', title: 'Instalar o Windows Server · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      // roles: [] — the crew doesn't install Windows (ops.configure is Linux only)
      skill: 'sistemas', roles: [], bot_minutes: 25, weight: 1, trigger: 'auto', complete: 'online', lesson: 'winsetup',
      summary: 'Você especializou o {{dev.name}} como Windows Server. Instale pela mídia, defina a senha do Administrador, IP fixo, nome e teste.',
      target: { kind: 'server', state: 'link', own: true, os: 'windows' },
    },
    {
      id: 'jr3_win_nome_padrao', n: 5, rank: 'jr3', title: 'Windows com nome padrão · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} voltou de uma reinstalação com o nome automático (WIN-…). O padrão da empresa é o nome do equipamento.',
      target: T(WIN, { domain: false }), setup: { win: 'host' },
      steps: [
        { text: 'Veja o nome atual do computador.', help: ['win-rename'], auto: 'hostname', check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:$env:computername' }, { ran: 'cmd:sconfig' }] } },
        { text: 'O computador se chama {{dev.name}} (o nome só vale depois de reiniciar).', help: ['win-rename', 'win-restart'], auto: 'Rename-Computer -NewName {{dev.name}} -Restart', check: { state: 'win.named' } },
      ],
    },
    {
      id: 'jr3_win_apipa', n: 6, rank: 'jr3', title: 'Windows sem IP · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} (Windows) perdeu o IP fixo depois de uma atualização e saiu da rede.',
      target: WIN, setup: { fault: 'winnoip' },
      steps: [
        { text: 'Veja a configuração de rede.', help: ['win-ipconfig'], auto: 'ipconfig /all', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Com que endereço o adaptador ficou? (os dois primeiros números)', help: ['win-ipconfig', 'responder'], answer: { accept: ['169.254', 'apipa', '169.254.x.x'], normalize: 'text' } },
        { text: 'O servidor tem o IP fixo {{dev.ip}}/24 e o gateway {{gw}}.', help: ['win-newip'], auto: 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress {{dev.ip}} -PrefixLength 24 -DefaultGateway {{gw}}', check: { all: [{ state: 'eth0.ip' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'O gateway responde.', help: ['win-ping'], auto: 'ping {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_win_adaptador', n: 7, rank: 'jr3', title: 'Adaptador desabilitado · {{dev.name}}', difficulty: 2, xp: 80, credits: 12,
      skill: 'redes', roles: ['sysadmin', 'redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'win-link',
      summary: 'O {{dev.name}} (Windows) sumiu da rede. Alguém desabilitou o adaptador Ethernet.',
      target: WIN, setup: { fault: 'link' },
    },
    {
      id: 'jr3_win_dns_cliente', n: 8, rank: 'jr3', title: 'DNS apontando para fora · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O controlador de domínio {{dev.name}} está consultando um DNS público (8.8.8.8), que não conhece o domínio {{dom}}. Num DC, o DNS é ele mesmo.',
      target: T(WIN, { domain: true }), setup: { win: 'dns' }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'Veja quais servidores DNS o {{dev.name}} consulta.', help: ['win-dnsclient'], auto: 'Get-DnsClientServerAddress', check: { ran: 'dns-client-show' } },
        { text: 'O {{dev.name}} consulta a si mesmo (127.0.0.1).', help: ['win-dnsclient'], auto: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 127.0.0.1', check: { state: 'win.dnsself' } },
        { text: 'O nome do domínio {{dom}} resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName {{dom}}', check: { any: [{ ran: 'win-dns-ok:{{dom}}' }, { ran: 'cmd:resolve-dnsname' }, { ran: 'cmd:nslookup' }] } },
      ],
    },
    {
      id: 'jr3_tres_falhas', n: 9, rank: 'jr3', title: 'Rede desconfigurada no {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} voltou da manutenção com a rede toda desfeita: interface, IP e rota.',
      target: LNX, setup: { fault: 'noip3' },
      steps: [
        { text: 'Descubra o que está errado na rede do servidor.', help: ['ip-addr', 'ip-route'], auto: 'ip addr\nip route', check: { all: [{ ran: 'ip-show' }, { ran: 'route-show' }] } },
        { text: 'A interface está ativa.', help: ['ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'O servidor responde no IP {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Existe rota padrão pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'A internet responde.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'jr3_reinstalacao', n: 10, rank: 'jr3', title: 'O {{dev.name}} voltou da reinstalação', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Reinstalaram o sistema do {{dev.name}}: ele voltou com o nome padrão e sem IP.',
      target: LNX, setup: { fault: 'reinstall' },
      steps: [
        { text: 'Veja o nome e a rede da máquina.', help: ['hostname', 'ip-addr'], auto: 'hostname\nip addr', check: { all: [{ any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] }, { ran: 'ip-show' }] } },
        { text: 'O nome volta a ser {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'O IP volta a ser {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'A rota padrão volta a ser pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'A internet responde.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      // the main device is the one that fails; the steps never name it before the player finds it
      id: 'jr3_teste_malha', n: 11, rank: 'jr3', title: 'Teste de malha a partir do {{peer.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Rotina do turno: do {{peer.name}}, teste {{ips}}. Se algum não responder, descubra qual é e conserte.',
      target: LNX, devices: { peer: 'server.peer', alt: 'server.peer', third: 'server.peer' }, setup: { fault: 'link', quiet: true }, vars: { ips: 'ips:dev,alt,third' },
      steps: [
        { device: 'peer', text: 'Do {{peer.name}}, faça ping em cada um: {{ips}}.', help: ['ping'], auto: 'ping -c 3 {{alt.ip}}\nping -c 3 {{dev.ip}}\nping -c 3 {{third.ip}}', check: { all: [{ ran: 'cmd:ping' }, { ran: 'ping-fail' }] } },
        { device: 'peer', type: 'answer', text: 'Qual IP não respondeu?', help: ['ping', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Abra o console desse servidor e ponha a rede de volta.', help: ['ip-link', 'ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { device: 'peer', text: 'Do {{peer.name}}, confirme que ele responde.', help: ['ping'], auto: 'ping -c 3 {{dev.ip}}', check: { ran: 'ping-ok:{{dev.ip}}' } },
      ],
    },
    {
      id: 'jr3_nas', n: 12, rank: 'jr3', title: 'NAS para os arquivos', difficulty: 2, xp: 80, credits: 12,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os arquivos da equipe estão espalhados pelos servidores. Um NAS de 4 baias guarda tudo num lugar só, com RAID.',
      target: { kind: 'rack' }, vars: { n: 'items:nas_4,nas_8' },
      steps: [
        { text: 'Instale um NAS 4 baias (Construir → Equipamentos → Storage).', action: 'build', check: { state: 'items', arg: 'nas_4,nas_8', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr3_pdu', n: 13, rank: 'jr3', title: 'Quadro de energia dos racks', difficulty: 2, xp: 80, credits: 12,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Com mais servidores, as tomadas da sala não dão conta. Um quadro PDU distribui a energia para os racks.',
      target: { kind: 'rack' }, vars: { n: 'items:pdu' },
      steps: [
        { text: 'Instale um Quadro PDU perto dos racks (Construir → Energia).', action: 'build', check: { state: 'items', arg: 'pdu', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr3_switch_48', n: 14, rank: 'jr3', title: 'Trocar o switch lotado', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os switches de 24 portas estão enchendo. Instale um de 48 portas e comece a passar os servidores para ele.',
      target: { kind: 'rack' }, vars: { sw: 'devs:sw_48', on: 'on.model:sw_48' },
      steps: [
        { text: 'Instale um Switch gerenciável 48p num rack.', action: 'build', check: { state: 'devs', arg: 'sw_48', gt: '{{sw}}' } },
        { text: 'Passe o cabo de pelo menos um servidor para ele (Cabeamento).', action: 'cabling', check: { state: 'on.model', arg: 'sw_48', gt: '{{on}}' } },
      ],
    },
    {
      id: 'jr3_win_iis', n: 15, rank: 'jr3', title: 'O IIS já está instalado? · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente quer hospedar um site .NET no {{dev.name}}. Confira se o servidor web do Windows (IIS) existe e instale.',
      target: T(WIN, { lacks: 'Web-Server' }), vars: { iis: 'win.iis' },
      steps: [
        { text: 'Liste as funções do servidor ([X] = instalada).', help: ['win-features'], auto: 'Get-WindowsFeature', check: { ran: 'win-features' } },
        { type: 'answer', text: 'O Web Server (IIS) já está instalado? (sim ou nao)', help: ['win-features', 'responder'], answer: { accept: ['{{iis}}'], normalize: 'text' } },
        { text: 'O IIS está instalado, com as ferramentas de gerenciamento.', help: ['win-feature'], auto: 'Install-WindowsFeature Web-Server -IncludeManagementTools', check: { state: 'win.has', arg: 'Web-Server' } },
      ],
    },
    {
      id: 'jr3_win_reinicio', n: 16, rank: 'jr3', title: 'Quem reiniciou o {{dev.name}}?', difficulty: 3, xp: 100, credits: 15,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} reiniciou no meio do expediente. O log System do Windows guarda quem pediu (evento 1074).',
      target: WIN, setup: { win: 'reboot' }, vars: { by: 'win.rebootBy' },
      steps: [
        { text: 'Veja os eventos recentes do log System.', help: ['win-event'], auto: 'Get-WinEvent -LogName System -MaxEvents 5', check: { ran: 'win-events:system' } },
        { type: 'answer', text: 'Qual usuário pediu o reinício (evento 1074)?', help: ['win-event', 'responder'], answer: { accept: ['{{by}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr3_win_servico', n: 17, rank: 'jr3', title: 'Serviço parado no {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'winsvc',
      summary: 'Uma função do controlador de domínio {{dev.name}} parou. Ache o serviço, veja no log quando parou e suba de novo.',
      target: T(WIN, { domain: true }), setup: { fault: 'winsvc' },
    },
    {
      id: 'jr3_nginx_disco', n: 18, rank: 'jr3', title: 'O nginx não sobe no {{dev.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O site do {{dev.name}} caiu e o nginx não volta nem com restart. A mensagem de erro diz o motivo.',
      target: T(LNX, { web: true }), setup: { fault: 'disksvc' },
      steps: [
        { text: 'Veja por que o nginx falhou.', help: ['systemctl-status'], auto: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: '"No space left on device": confira o disco.', help: ['df'], auto: 'df -h', check: { ran: 'df' } },
        { text: 'O disco fica abaixo de 80%.', help: ['du', 'journalctl-vacuum'], auto: 'sudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { text: 'O nginx está rodando.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'O site responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr3_ip_a_mais', n: 19, rank: 'jr3', title: 'IP a mais no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Conflito de IP na rede: o {{dev.name}} responde também num endereço que não é dele.',
      target: LNX, setup: { fault: 'extraip' }, vars: { extra: 'os.extraIp' },
      steps: [
        { text: 'Veja os endereços da eth0.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual endereço não devia estar lá?', help: ['ip-addr', 'responder'], answer: { accept: ['{{extra}}'], normalize: 'ip' } },
        { text: 'A eth0 fica só com o IP dela, {{dev.ip}}/24.', help: ['ip-addr-del'], auto: 'sudo ip addr del {{extra}}/24 dev eth0', check: { all: [{ not: { state: 'eth0.has', arg: '{{extra}}' } }, { state: 'eth0.ip' }] } },
        { text: 'O gateway responde.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_documentar', n: 20, rank: 'jr3', title: 'Documente o {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ficha do inventário: o IP do {{dev.name}}, quantos núcleos ele tem e em que porta do switch ele está.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, vars: { port: 'srv.port', cores: 'hw.cores' },
      steps: [
        { text: 'Descubra o IP do servidor.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual é o IP do {{dev.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Descubra o processador.', help: ['lscpu'], auto: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { type: 'answer', text: 'Quantos núcleos (cores) ele tem?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
        { device: 'sw', text: 'No {{sw.name}}, ache a porta do {{dev.name}}.', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { ran: 'show-int' } },
        { device: 'sw', type: 'answer', text: 'Em que porta ele está?', help: ['show-int', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
      ],
    },
  ];

  // what each rank requires besides its mission (the levels with problems of their own)
  const ranks = [
    { id: 'est', level: 1, name: 'Estagiário(a)', xp_to_next: 300, distinct_to_next: 6 },
    { id: 'jr1', level: 2, name: 'Júnior I', xp_to_next: 450, distinct_to_next: 7 },
    { id: 'jr2', level: 3, name: 'Júnior II', xp_to_next: 600, distinct_to_next: 8 },
    { id: 'jr3', level: 4, name: 'Júnior III', xp_to_next: 800, distinct_to_next: 9 },
  ];

  DL.SCENARIO_DATA = { lessons, problems, ranks };
})();
