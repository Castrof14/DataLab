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
  /* ------------------------------------------------------------------ */
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
  ];

  // what each rank requires besides its mission (the levels with problems of their own)
  const ranks = [
    { id: 'est', level: 1, name: 'Estagiário(a)', xp_to_next: 300, distinct_to_next: 6 },
  ];

  DL.SCENARIO_DATA = { lessons, problems, ranks };
})();
