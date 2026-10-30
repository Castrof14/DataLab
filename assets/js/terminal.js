/* DataLab — simulated terminal: a tiny Linux shell and a Cisco-style switch CLI over each device's state,
   a command reference ("Precisa de ajuda?") and guided lessons whose steps advance on real effects
   (the interface is up, the IP is set, the ping answered), never on typing one exact string. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ------------------------------------------------------------------ */
  /* Command reference                                                   */
  /* ------------------------------------------------------------------ */
  const HELP = {
    'ip-addr': { cmd: 'ip addr', ex: 'ip addr', what: 'Mostra as interfaces de rede e os endereços IP de cada uma.', when: 'Primeiro passo para entender a rede de um servidor: a interface está UP? Tem IP?' },
    'ip-link': { cmd: 'ip link', ex: 'ip link', what: 'Lista as interfaces e o estado do link (UP ou DOWN), sem os IPs.', when: 'Para checar rapidamente se uma interface está ativa.' },
    'ip-link-up': { cmd: 'sudo ip link set <interface> up', ex: 'sudo ip link set eth0 up', what: 'Liga (ativa) a interface de rede. Com "down" no lugar de "up", desliga.', when: 'Quando ip addr ou ip link mostram a interface como DOWN.' },
    'ip-addr-add': { cmd: 'sudo ip addr add <ip>/<máscara> dev <interface>', ex: 'sudo ip addr add 10.0.1.12/24 dev eth0', what: 'Atribui um endereço IP à interface. /24 significa máscara 255.255.255.0 (256 endereços na rede).', when: 'Ao configurar um servidor novo com IP fixo. Errou? sudo ip addr del <ip>/24 dev eth0.' },
    'ip-route': { cmd: 'ip route', ex: 'ip route', what: 'Mostra a tabela de rotas: por onde o servidor envia cada pacote.', when: 'Para conferir se existe uma rota padrão (default via ...).' },
    'ip-route-add': { cmd: 'sudo ip route add default via <gateway>', ex: 'sudo ip route add default via 10.0.1.1', what: 'Define a rota padrão: o gateway que recebe tudo o que não é da rede local.', when: 'Depois de dar IP, para o servidor falar com outras redes e com a internet.' },
    ping: { cmd: 'ping -c <quantidade> <destino>', ex: 'ping -c 3 10.0.1.1', what: 'Envia pacotes ICMP e mostra se o destino responde e em quanto tempo.', when: 'Para testar a conectividade depois de configurar ou consertar a rede.' },
    sudo: { cmd: 'sudo <comando>', ex: 'sudo ip link set eth0 up', what: 'Executa o comando como administrador (root).', when: 'Sempre que o comando altera o sistema: rede, serviços, logs. Sem sudo aparece "Operation not permitted".' },
    'systemctl-status': { cmd: 'systemctl status <serviço>', ex: 'systemctl status nginx', what: 'Mostra se um serviço está rodando (active) ou falhou (failed), com as últimas mensagens.', when: 'Quando um site ou aplicação para de responder.' },
    'systemctl-restart': { cmd: 'sudo systemctl restart <serviço>', ex: 'sudo systemctl restart nginx', what: 'Para e inicia o serviço de novo.', when: 'Depois de confirmar que o serviço caiu ou travou.' },
    curl: { cmd: 'curl <endereço>', ex: 'curl localhost', what: 'Faz uma requisição HTTP e mostra a resposta.', when: 'Para testar se um serviço web está respondendo.' },
    df: { cmd: 'df -h', ex: 'df -h', what: 'Mostra o uso de espaço de cada disco, em unidades legíveis (G, M).', when: 'Quando há suspeita de disco cheio — aplicações começam a falhar sem espaço.' },
    du: { cmd: 'du -sh <pasta>', ex: 'du -sh /var/log', what: 'Mostra quanto espaço uma pasta ocupa no total.', when: 'Para descobrir o que está enchendo o disco.' },
    'journalctl-vacuum': { cmd: 'sudo journalctl --vacuum-size=<tamanho>', ex: 'sudo journalctl --vacuum-size=200M', what: 'Apaga os logs antigos do systemd até sobrar o tamanho indicado.', when: 'Quando os logs estão lotando o disco.' },
    hostnamectl: { cmd: 'sudo hostnamectl set-hostname <nome>', ex: 'sudo hostnamectl set-hostname srv-01', what: 'Define o nome da máquina.', when: 'Na configuração inicial, para identificar o servidor na rede.' },
    hostname: { cmd: 'hostname', ex: 'hostname', what: 'Mostra o nome da máquina.', when: 'Para confirmar em qual servidor você está antes de mexer em algo.' },
    whoami: { cmd: 'whoami', ex: 'whoami', what: 'Mostra com qual usuário você está logado (com sudo, root).', when: 'Ao entrar num servidor, para saber que permissões você tem.' },
    uname: { cmd: 'uname -a', ex: 'uname -a', what: 'Mostra o sistema operacional, o nome da máquina e a versão do kernel.', when: 'Para documentar o servidor ou conferir a versão antes de uma atualização.' },
    uptime: { cmd: 'uptime', ex: 'uptime', what: 'Mostra há quanto tempo o servidor está ligado e a carga média (load average).', when: 'Para saber se o servidor reiniciou ou está sobrecarregado.' },
    enable: { cmd: 'enable', ex: 'enable', what: 'No switch, entra no modo privilegiado (o prompt muda de > para #).', when: 'Antes de qualquer comando de diagnóstico ou configuração no switch.' },
    'show-int': { cmd: 'show interfaces status', ex: 'show interfaces status', what: 'Lista as portas do switch e o estado de cada uma (connected, notconnect, err-disabled). Abreviação: sh int status.', when: 'Para achar a porta com problema.' },
    'conf-t': { cmd: 'configure terminal', ex: 'conf t', what: 'Entra no modo de configuração global do switch.', when: 'Antes de mudar qualquer configuração.' },
    interface: { cmd: 'interface <porta>', ex: 'interface gi0/3', what: 'Seleciona uma porta para configurar (prompt vira config-if).', when: 'Depois do conf t, para mexer em uma porta específica.' },
    shutdown: { cmd: 'shutdown', ex: 'shutdown', what: 'Desativa administrativamente a porta selecionada (o status vira disabled). Numa porta err-disabled, é o primeiro passo para "zerar" o estado de erro.', when: 'Em config-if da porta com problema (interface <porta>), quando ela está err-disabled e a causa já foi resolvida.' },
    'no-shutdown': { cmd: 'no shutdown', ex: 'no shutdown', what: 'Reativa a porta. Depois do shutdown, tira a porta do err-disabled e ela volta a conectar (status connected).', when: 'Logo depois do shutdown, ainda em config-if da mesma porta.' },
    lscpu: { cmd: 'lscpu', ex: 'lscpu', what: 'Mostra o processador: modelo, quantos soquetes, núcleos (cores) e threads.', when: 'Para documentar o hardware ou saber se o servidor aguenta mais carga.' },
    free: { cmd: 'free -h', ex: 'free -h', what: 'Mostra a memória RAM: total, usada e livre, em unidades legíveis (GB).', when: 'Para documentar o servidor ou quando ele está lento.' },
    tail: { cmd: 'tail -n <linhas> <arquivo>', ex: 'tail -n 20 /var/log/auth.log', what: 'Mostra as últimas linhas de um arquivo (10, se você não disser quantas). Os logs ficam em /var/log.', when: 'Para ver o que aconteceu por último num log: logins, erros, reinícios.' },
    grep: { cmd: 'grep "<texto>" <arquivo>', ex: 'grep "Failed password" /var/log/auth.log', what: 'Mostra só as linhas que contêm o texto. -i ignora maiúsculas, -c conta as linhas. Também filtra a saída de outro comando: tail /var/log/auth.log | grep Failed.', when: 'Para achar o que interessa num log grande.' },
    ss: { cmd: 'sudo ss -tlnp', ex: 'sudo ss -tlnp', what: 'Lista as portas TCP em escuta: -t TCP, -l escutando, -n em números, -p o processo de cada porta (precisa de sudo). netstat -tlnp mostra o mesmo.', when: 'Para saber em que porta um serviço atende, ou se ele está mesmo escutando.' },
    'show-run': { cmd: 'show running-config', ex: 'show running-config', what: 'Mostra a configuração em uso agora, na memória do switch (abreviação: sh run). Ela se perde se o switch reiniciar sem salvar.', when: 'Antes e depois de mudar qualquer coisa no switch.' },
    'show-start': { cmd: 'show startup-config', ex: 'show startup-config', what: 'Mostra a configuração salva: a que o switch carrega quando liga (abreviação: sh start).', when: 'Para conferir se o que está em uso já foi salvo.' },
    'copy-run-start': { cmd: 'copy running-config startup-config', ex: 'copy running-config startup-config', what: 'Salva a configuração em uso como a de inicialização (abreviação: copy run start; write memory faz o mesmo).', when: 'Sempre que terminar uma mudança no switch: sem isso, um reinício desfaz tudo.' },
    'ip-addr-del': { cmd: 'sudo ip addr del <ip>/<máscara> dev <interface>', ex: 'sudo ip addr del 10.0.1.150/24 dev eth0', what: 'Remove um endereço IP da interface (o contrário de ip addr add).', when: 'Quando a interface ficou com um IP errado ou sobrando: veja com ip addr e remova o que não devia estar lá.' },
    'ip-route-del': { cmd: 'sudo ip route del default', ex: 'sudo ip route del default', what: 'Apaga a rota padrão (default via …). Só existe uma: para trocar o gateway, apague e crie de novo.', when: 'Quando ip route mostra a rota padrão apontando para o gateway errado.' },
    'systemctl-start': { cmd: 'sudo systemctl start <serviço>', ex: 'sudo systemctl start ssh', what: 'Inicia um serviço que está parado (inactive). restart também serve: para e inicia.', when: 'Quando o status mostra "inactive (dead)": alguém ou algo parou o serviço.' },
    cat: { cmd: 'cat <arquivo>', ex: 'cat notas.txt', what: 'Mostra o conteúdo inteiro de um arquivo.', when: 'Para ler arquivos curtos: anotações, configurações, o /etc/hostname.' },
    'sw-ping': { cmd: 'ping <ip>', ex: 'ping 10.0.1.11', what: 'No switch, testa se um endereço responde (!!!!! = respondeu, ..... = não).', when: 'Para testar a rede a partir do próprio switch, sem depender de um servidor.' },
    responder: { cmd: 'responder <valor>', ex: 'responder 10.0.1.25', what: 'Responde a pergunta do passo atual (um IP, uma porta, um número). O campo no painel ao lado faz o mesmo.', when: 'Quando o passo é uma pergunta: rode o comando que mostra a informação, leia a saída e responda.' },
    cabling: { cmd: 'Cabeamento do rack', ex: 'Tarefas → Cabeamento  (ou o botão abaixo)', what: 'Mostra os cabos do rack: azul = ligado e correto, amarelo = incompleto, vermelho = conexão errada, laranja = cabo solto.', when: 'Quando ip link mostra NO-CARRIER: não é configuração, é a camada física (cabo).' },
    end: { cmd: 'end', ex: 'end', what: 'Sai do modo de configuração e volta ao modo privilegiado (#).', when: 'Ao terminar de configurar, para voltar a usar comandos show.' },
  };
  DL.CMD_HELP = HELP;

  /* ------------------------------------------------------------------ */
  /* Lessons: steps are checked against device state + what was run      */
  /* (built from problems-data.js by problems.js; winserver.js adds the  */
  /* Windows ones). Each entry: (device) → { title, goal, steps }.       */
  /* ------------------------------------------------------------------ */
  const LESSONS = {};
  DL.LESSONS = LESSONS;

  /* ------------------------------------------------------------------ */
  /* Device OS                                                           */
  /* ------------------------------------------------------------------ */
  DL.newOS = function (d, configured) {
    d.os = {
      hostname: configured ? d.name.toLowerCase() : 'localhost',
      ifaces: {
        lo: { up: true, ips: ['127.0.0.1/8'], mac: '00:00:00:00:00:00' },
        eth0: { up: !!configured, ips: configured ? [d.ip + '/24'] : [], mac: '52:54:00:' + [d.n >> 8, d.n & 255, 17].map((v) => v.toString(16).padStart(2, '0')).join(':') },
      },
      route: configured ? '10.0.1.1' : null,
      cable: !!configured,
      services: { nginx: 'active', ssh: 'active' },
      disk: 38 + (d.n * 7) % 20,
      boot: Date.now(),
    };
    if (d.kind === 'switch') {
      d.sw = { mode: 'user', cur: null, bad: null, fixed: false, ports: {} };
      const n = d.ports ? d.ports.length - 1 : 24; // access ports of this switch model
      for (let i = 1; i <= n; i++) d.sw.ports['gi0/' + i] = 'notconnect';
      d.sw.linked = new Set();
    }
  };

  const ipOnly = (cidr) => cidr.split('/')[0];
  const sameNet = (a, b) => a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');

  /* ------------------------------------------------------------------ */
  /* Logs (/var/log/auth.log, /var/log/syslog)                           */
  /* ------------------------------------------------------------------ */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // a syslog timestamp `ago` minutes before now
  const stamp = (ago) => { const t = new Date(Date.now() - ago * 60000); return MON[t.getMonth()] + ' ' + String(t.getDate()).padStart(2, ' ') + ' ' + t.toTimeString().slice(0, 8); };
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const sshd = (d, ago, text) => ({ ago, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: ' + text });
  const accepted = (d, ago) => [sshd(d, ago, 'Accepted publickey for admin from 10.0.1.' + rint(50, 60) + ' port ' + rint(40000, 60000) + ' ssh2: ED25519 SHA256:q3Vx' + rint(1000, 9999)),
    { ago, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user admin(uid=1000) by (uid=0)' }];
  const toLines = (list) => list.sort((x, y) => y.ago - x.ago).map((e) => stamp(e.ago) + ' ' + e.text);
  // the routine lines of any auth.log: the hourly cron and the admin using sudo
  const routine = (d) => [
    { ago: 360, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)' },
    { ago: 300, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session closed for user root' },
    { ago: 185, text: d.os.hostname + ' sudo:    admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/apt update' },
    { ago: 66, text: d.os.hostname + ' sudo:    admin : TTY=pts/1 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/systemctl status nginx' },
    { ago: 60, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)' },
  ];
  // a quiet day: the team logging in from the office network
  function authLog(d) {
    if (!d.os.authlog) d.os.authlog = toLines([].concat(routine(d), accepted(d, 320), accepted(d, 190), accepted(d, 70), accepted(d, 12)));
    return d.os.authlog;
  }
  // someone guessing passwords over SSH from `ip` (most of the failures), plus a couple of stray scanners
  DL.authAttack = function (d, ip) {
    ip = ip || '203.0.113.' + rint(10, 250);
    const users = ['root', 'admin', 'ubuntu', 'test', 'oracle', 'postgres', 'git', 'user', 'deploy'];
    const list = [].concat(routine(d), accepted(d, 240), accepted(d, 95));
    for (let i = 0; i < 9; i++) {
      const u = users[i % users.length], invalid = u !== 'root' && u !== 'admin';
      list.push(sshd(d, 40 - i * 4, 'Failed password for ' + (invalid ? 'invalid user ' : '') + u + ' from ' + ip + ' port ' + rint(30000, 65000) + ' ssh2'));
    }
    list.push(sshd(d, 150, 'Failed password for root from 198.51.100.' + rint(10, 250) + ' port ' + rint(30000, 65000) + ' ssh2'));
    list.push(sshd(d, 27, 'Failed password for invalid user pi from 192.0.2.' + rint(10, 250) + ' port ' + rint(30000, 65000) + ' ssh2'));
    list.push(sshd(d, 6, 'Connection closed by authenticating user root ' + ip + ' port ' + rint(30000, 65000) + ' [preauth]'));
    d.os.authlog = toLines(list);
    d.os.attacker = ip;
    return ip;
  };
  // the routine lines, plus what happened to this server (d.os.sysextra: { at, text }, added by problems)
  function syslog(d) {
    const h = d.os.hostname;
    const extra = (d.os.sysextra || []).map((e) => ({ ago: (Date.now() - e.at) / 60000, text: h + ' ' + e.text }));
    return toLines([{ ago: 400, text: h + ' systemd[1]: Started nginx.service - A high performance web server.' }, { ago: 300, text: h + ' CRON[2210]: (root) CMD (run-parts /etc/cron.hourly)' },
      { ago: 120, text: h + ' systemd[1]: Starting apt-daily.service - Daily apt download activities...' }, { ago: 20, text: h + ' systemd-resolved[511]: Clock change detected. Flushing caches.' }].concat(extra));
  }
  DL.syslogAdd = function (d, ago, text) { (d.os.sysextra = d.os.sysextra || []).push({ at: Date.now() - ago * 60000, text }); };
  // a quiet day with a known last login: the IP the admin came from most recently
  DL.authLogins = function (d, ip) {
    ip = ip || '10.0.1.' + rint(50, 60);
    const last = [sshd(d, 9, 'Accepted publickey for admin from ' + ip + ' port ' + rint(40000, 60000) + ' ssh2: ED25519 SHA256:q3Vx' + rint(1000, 9999)),
      { ago: 9, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user admin(uid=1000) by (uid=0)' }];
    d.os.authlog = toLines([].concat(routine(d), accepted(d, 320), accepted(d, 190), accepted(d, 70), last));
    d.os.lastLogin = ip;
    return ip;
  };
  // someone stopped a service with sudo a few minutes ago (auth.log tells who)
  DL.authStop = function (d, user, svc) {
    authLog(d).push(stamp(8) + ' ' + d.os.hostname + ' sudo:   ' + user + ' : TTY=pts/2 ; PWD=/home/' + user + ' ; USER=root ; COMMAND=/usr/bin/systemctl stop ' + svc);
    d.os.stopper = user;
  };
  const LOGS = { '/var/log/auth.log': authLog, '/var/log/syslog': syslog };
  // the lines of a file (null: no such file)
  const fileLines = (d, f) => (LOGS[f] ? LOGS[f](d) : f === '/etc/hostname' ? [d.os.hostname] : f === 'notas.txt' ? ['gateway da rede: 10.0.1.1', 'meu IP planejado: ' + d.ip + '/24'] : null);
  // words, keeping "quoted text" together
  const words = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^(["'])(.*)\1$/, '$2'));
  const unesc = (s) => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // grep over lines: -i ignores case, -c counts; events grep:<src>, grep-hit:<src>, grep-failed:<src> (a "fail" search with results)
  function grepIn(lines, args, src, out, ran) {
    const flags = args.filter((x) => /^-\w+$/.test(x)).join(''), rest = args.filter((x) => !/^-\w+$/.test(x));
    const pat = rest[0];
    if (pat == null || pat === '') { out.push('uso: grep "<texto>" <arquivo>   (ou: comando | grep "<texto>")'); ran.push('error'); return; }
    const ci = flags.indexOf('i') >= 0, want = ci ? pat.toLowerCase() : pat;
    const hits = lines.filter((l) => (ci ? l.toLowerCase() : l).indexOf(want) >= 0);
    if (flags.indexOf('c') >= 0) out.push(String(hits.length));
    else for (const h of hits) out.push(esc(h));
    ran.push('grep:' + src);
    if (hits.length) { ran.push('grep-hit:' + src); if (/fail/i.test(pat)) ran.push('grep-failed:' + src); }
  }
  // "comando | grep texto": only grep reads from a pipe here
  function pipe(d, left, right, ctx) {
    const r = linux(d, left, ctx);
    if (r.ran.indexOf('error') >= 0 || r.ran.indexOf('unknown') >= 0) return r;
    const w = words(right.trim());
    if (w[0] === 'sudo') w.shift();
    if (w[0] !== 'grep') return { out: ['<span class="m">aqui o | só funciona com grep depois: comando | grep "texto"</span>'], ran: r.ran.concat('error') };
    const src = (r.ran.find((e) => /^(tail|cat):/.test(e)) || 'pipe:' + left.trim().split(/\s+/)[0]).replace(/^(tail|cat):/, '');
    const out = [], ran = r.ran.slice();
    grepIn(r.out.map(unesc), w.slice(1), src, out, ran);
    return { out, ran };
  }

  // Linux shell. Returns { out: [lines], ran: [events] }.
  function linux(d, line, ctx) {
    const bar = line.indexOf('|');
    if (bar >= 0) return pipe(d, line.slice(0, bar), line.slice(bar + 1), ctx);
    const os = d.os, out = [], ran = [];
    let t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    let root = false;
    if (t[0] === 'sudo') { root = true; t = t.slice(1); if (!t.length) return { out: ['uso: sudo <comando>'], ran }; }
    const deny = (msg) => { out.push(msg); out.push('<span class="m">dica: comandos que alteram o sistema precisam de sudo na frente.</span>'); ran.push('error'); };
    const c = t[0], a = t.slice(1);
    const e0 = os.ifaces.eth0;
    switch (c) {
      case 'help':
        if (a[0]) {
          const k = Object.keys(HELP).find((x) => HELP[x].cmd.split(' ')[0] === a[0] || HELP[x].cmd.indexOf(a.join(' ')) === 0 || HELP[x].cmd.indexOf('sudo ' + a.join(' ')) === 0);
          if (k) { const h = HELP[k]; out.push('<b>' + esc(h.cmd) + '</b>', h.what, 'exemplo: ' + esc(h.ex)); }
          else out.push('sem ajuda para "' + esc(a[0]) + '". Use o botão Precisa de ajuda?');
        } else {
          out.push('comandos disponíveis:', '  ip addr | ip link | ip route     ping -c 3 <destino>', '  systemctl status|restart <serviço>   curl localhost', '  df -h   du -sh <pasta>   journalctl --vacuum-size=200M', '  hostname   hostnamectl set-hostname <nome>', '  uptime  whoami  uname -a  date  history  clear  exit', '  lscpu  nproc  free -h   (hardware do servidor)', '  tail -n 20 <arquivo>   grep "<texto>" <arquivo>   cat <arquivo>   (logs em /var/log)', '  ss -tlnp   (portas em escuta)', '  sudo <comando> executa como administrador', 'detalhes: help <comando>  ·  ou o botão Precisa de ajuda?');
        }
        break;
      case 'clear': ctx.clear(); break;
      case 'exit': case 'logout': ctx.close(); break;
      case 'history': ctx.history.forEach((h, i) => out.push(String(i + 1).padStart(4) + '  ' + esc(h))); break;
      case 'whoami': out.push(root ? 'root' : 'admin'); break;
      case 'hostname': out.push(os.hostname); ran.push('hostname-show:' + os.hostname); break;
      case 'hostnamectl':
        if (a[0] === 'set-hostname' && a[1]) {
          if (!root) { deny('Could not set hostname: Access denied'); break; }
          os.hostname = a[1];
          ran.push('hostname');
        } else { out.push('   Static hostname: ' + os.hostname, '  Operating System: Ubuntu 24.04 LTS', '            Kernel: Linux 6.8.0-45-generic'); ran.push('hostname-show:' + os.hostname); }
        break;
      case 'lscpu': case 'nproc': case 'free': {
        // the hardware of this server's model (hardware.js)
        const m = DL.hwOf ? DL.hwOf(d) : null;
        if (!m || m.cores == null) { out.push(c + ': informação indisponível'); break; }
        if (c === 'nproc') out.push(String(m.threads));
        else if (c === 'free') {
          const used = Math.max(1, Math.round(m.ram * 0.31));
          out.push('               total        used        free', 'Mem:     ' + String(DL.hwFmt.ram(m.ram)).padStart(10) + String(used + ' GB').padStart(12) + String(DL.hwFmt.ram(m.ram - used)).padStart(12));
        } else out.push('Model name:        ' + esc(m.cpu), 'Socket(s):         ' + m.sockets, 'Core(s) total:     ' + m.cores, 'Thread(s):         ' + m.threads, 'CPU max MHz:       ' + Math.round(m.ghz * 1000), 'Mem:               ' + DL.hwFmt.ram(m.ram), 'Disk:              ' + esc(m.disk), 'NIC eth0:          ' + DL.hwFmt.gb(m.nic));
        break;
      }
      case 'uname': out.push(a[0] === '-a' ? 'Linux ' + os.hostname + ' 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux' : 'Linux'); break;
      case 'date': out.push(new Date().toString().split(' (')[0]); break;
      case 'uptime': {
        // like the real one: "up 42 min", "up 3:25", "up 2 days, 3:25"
        const m = Math.max(1, Math.round((Date.now() - os.boot) / 60000)), days = Math.floor(m / 1440), hm = Math.floor((m % 1440) / 60) + ':' + String(m % 60).padStart(2, '0');
        const up = m < 60 ? m + ' min' : (days ? days + (days > 1 ? ' days, ' : ' day, ') : '') + (m % 1440 < 60 ? (m % 60) + ' min' : hm);
        out.push(' ' + new Date().toTimeString().slice(0, 8) + ' up ' + up + ',  1 user,  load average: 0.08, 0.12, 0.10');
        break;
      }
      case 'pwd': out.push('/home/admin'); break;
      case 'ls': out.push(a[0] === '/var/log' ? 'apt  journal  nginx  syslog  auth.log' : 'notas.txt  scripts'); break;
      case 'cat': {
        const lines = a[0] ? fileLines(d, a[0]) : null;
        if (!lines) { out.push('cat: ' + esc(a[0] || '') + ': Arquivo ou diretório inexistente'); ran.push('error'); break; }
        for (const l of lines) out.push(esc(l));
        ran.push('cat:' + a[0]);
        break;
      }
      case 'tail': {
        // tail [-n N | -N] <arquivo>
        const f = a.filter((x, i) => !/^-/.test(x) && a[i - 1] !== '-n').pop();
        const ni = a.indexOf('-n'), short = a.find((x) => /^-\d+$/.test(x));
        const n = Math.max(1, Math.min(200, ni >= 0 ? parseInt(a[ni + 1], 10) || 10 : short ? parseInt(short.slice(1), 10) : 10));
        if (a.indexOf('-f') >= 0) out.push('<span class="m">(-f fica seguindo o arquivo sem parar; aqui ele mostra só o fim)</span>');
        const lines = f ? fileLines(d, f) : null;
        if (!lines) { out.push(f ? "tail: cannot open '" + esc(f) + "' for reading: No such file or directory" : 'uso: tail -n 20 <arquivo>'); ran.push('error'); break; }
        for (const l of lines.slice(-n)) out.push(esc(l));
        ran.push('tail:' + f);
        break;
      }
      case 'grep': {
        // grep [-i] [-c] "<texto>" <arquivo> (the text may have spaces when quoted)
        const w = words(line.trim().replace(/^sudo\s+/, '')).slice(1);
        const f = w.filter((x) => !/^-\w+$/.test(x))[1];
        const lines = f ? fileLines(d, f) : null;
        if (!f) { out.push('uso: grep "<texto>" <arquivo>   (ou: comando | grep "<texto>")'); ran.push('error'); break; }
        if (!lines) { out.push('grep: ' + esc(f) + ': Arquivo ou diretório inexistente'); ran.push('error'); break; }
        grepIn(lines, w.filter((x) => x !== f), f, out, ran);
        break;
      }
      case 'ss': case 'netstat': {
        // ss -tlnp: TCP ports listening (-t TCP · -l listening · -n numbers · -p process, which needs root)
        const flags = a.filter((x) => /^-/.test(x)).join('').replace(/-/g, '');
        if (flags.indexOf('l') < 0) {
          out.push('<span class="m">sem -l aparecem só as conexões abertas; para as portas em escuta: ss -tlnp</span>');
          out.push('ESTAB  0  0  ' + ipOnly(e0.ips[0] || '10.0.1.10/24') + ':22  10.0.1.' + rint(50, 60) + ':' + rint(40000, 60000));
          ran.push('ss-conn');
          break;
        }
        const procs = flags.indexOf('p') >= 0 && root;
        const rows = [];
        if (os.services.ssh === 'active') rows.push(['0.0.0.0:22', 'sshd', 640, 3, 128]);
        if (os.services.nginx === 'active') rows.push(['0.0.0.0:80', 'nginx', 812, 6, 511]);
        rows.push(['127.0.0.53%lo:53', 'systemd-resolve', 511, 14, 4096]);
        if (c === 'ss') {
          out.push('State   Recv-Q  Send-Q  Local Address:Port      Peer Address:Port  Process');
          for (const [addr, name, pid, fd, q] of rows) out.push('LISTEN  0       ' + String(q).padEnd(8) + addr.padEnd(24) + '0.0.0.0:*          ' + (procs ? esc('users:(("' + name + '",pid=' + pid + ',fd=' + fd + '))') : ''));
        } else {
          out.push('Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name');
          for (const [addr, name, pid] of rows) out.push('tcp        0      0 ' + addr.replace('%lo', '').padEnd(24) + '0.0.0.0:*               LISTEN      ' + (procs ? pid + '/' + name : '-'));
        }
        if (flags.indexOf('p') >= 0 && !root) out.push('<span class="m">(sem sudo, o ' + c + ' não mostra o processo de cada porta: sudo ' + esc(line.trim()) + ')</span>');
        ran.push('ss');
        if (procs) ran.push('ss-procs');
        break;
      }
      case 'ip': {
        const sub = a[0] || '';
        const isAddr = /^a(d(d(r(e(s(s)?)?)?)?)?)?$/.test(sub), isLink = /^l(i(n(k)?)?)?$/.test(sub), isRoute = /^r(o(u(t(e)?)?)?)?$/.test(sub);
        if (isAddr && (a[1] === 'add' || a[1] === 'del')) {
          const cidr = a[2], dev = a[a.indexOf('dev') + 1];
          if (!cidr || a.indexOf('dev') < 0 || !dev) { out.push('uso: ip addr ' + a[1] + ' <ip>/<máscara> dev <interface>'); ran.push('error'); break; }
          if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr)) { out.push('Error: any valid prefix is expected rather than "' + esc(cidr) + '".'); ran.push('error'); break; }
          if (!os.ifaces[dev]) { out.push('Cannot find device "' + esc(dev) + '"'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          const ips = os.ifaces[dev].ips;
          if (a[1] === 'add') { if (ips.indexOf(cidr) >= 0) { out.push('RTNETLINK answers: File exists'); break; } ips.push(cidr); }
          else { const i = ips.indexOf(cidr); if (i < 0) { out.push('RTNETLINK answers: Cannot assign requested address'); break; } ips.splice(i, 1); }
          ran.push('ip-set');
        } else if (isAddr || sub === '' || sub === '-br') {
          let n = 1;
          for (const [name, f] of Object.entries(os.ifaces)) {
            const st = f.up ? (name === 'lo' ? 'UNKNOWN' : os.cable ? 'UP' : 'DOWN') : 'DOWN';
            const flags = name === 'lo' ? ['LOOPBACK'] : (f.up && !os.cable ? ['NO-CARRIER'] : []).concat(['BROADCAST', 'MULTICAST']);
            if (f.up) flags.push('UP');
            if (f.up && (os.cable || name === 'lo')) flags.push('LOWER_UP');
            out.push(n++ + ': ' + name + ': &lt;' + flags.join(',') + '&gt; mtu ' + (name === 'lo' ? 65536 : 1500) + ' state <span class="' + (st === 'DOWN' ? 'w' : 'ok') + '">' + st + '</span>');
            out.push('    link/' + (name === 'lo' ? 'loopback' : 'ether') + ' ' + f.mac);
            for (const ip of f.ips) out.push('    inet ' + ip + ' scope ' + (name === 'lo' ? 'host' : 'global') + ' ' + name);
          }
          ran.push('ip-show');
        } else if (isLink && a[1] === 'set') {
          const dev = a[2], st = a[3];
          if (!os.ifaces[dev] || (st !== 'up' && st !== 'down')) { out.push('uso: ip link set <interface> up|down'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          os.ifaces[dev].up = st === 'up';
          ran.push('link-set');
          if (st === 'up' && dev === 'eth0' && !os.cable) out.push('<span class="m">(a interface subiu, mas não há cabo: o link continua DOWN)</span>');
        } else if (isLink) {
          let n = 1;
          for (const [name, f] of Object.entries(os.ifaces)) {
            const st = f.up ? (name === 'lo' ? 'UNKNOWN' : os.cable ? 'UP' : 'DOWN') : 'DOWN';
            const nc = name === 'eth0' && f.up && !os.cable ? ' <span class="w">NO-CARRIER</span>' : '';
            out.push(n++ + ': ' + name + ':' + nc + ' mtu ' + (name === 'lo' ? 65536 : 1500) + ' state <span class="' + (st === 'DOWN' ? 'w' : 'ok') + '">' + st + '</span>');
          }
          ran.push('link-show');
        } else if (isRoute && a[1] === 'add') {
          const via = a[a.indexOf('via') + 1];
          if (a[2] !== 'default' || a.indexOf('via') < 0 || !via) { out.push('uso: ip route add default via <gateway>'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          if (!e0.ips.some((ip) => sameNet(ipOnly(ip), via))) { out.push('Error: Nexthop has invalid gateway.'); out.push('<span class="m">(o gateway precisa estar na mesma rede de um IP da interface)</span>'); ran.push('error'); break; }
          if (os.route) { out.push('RTNETLINK answers: File exists'); break; }
          os.route = via;
          ran.push('route-set');
        } else if (isRoute && a[1] === 'del') {
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          os.route = null;
        } else if (isRoute) {
          if (os.route) out.push('default via ' + os.route + ' dev eth0');
          for (const ip of e0.ips) out.push(ipOnly(ip).split('.').slice(0, 3).join('.') + '.0/24 dev eth0 proto kernel scope link src ' + ipOnly(ip));
          if (!os.route && !e0.ips.length) out.push('<span class="m">(tabela vazia)</span>');
          ran.push('route-show');
        } else { out.push('Object "' + esc(sub) + '" is unknown, try "ip help".'); ran.push('error'); }
        break;
      }
      case 'ping': {
        const host = a.filter((x) => !/^-/.test(x) && !/^\d+$/.test(x) || /\./.test(x)).pop();
        const ci = a.indexOf('-c'), n = ci >= 0 ? Math.min(6, parseInt(a[ci + 1], 10) || 3) : 4;
        if (!host) { out.push('ping: uso: ping -c 3 <destino>'); ran.push('error'); break; }
        const reach = ctx.reach(d, host);
        out.push('PING ' + esc(host) + ' 56(84) bytes of data.');
        if (reach.ok) {
          for (let i = 1; i <= n; i++) out.push('64 bytes from ' + esc(host) + ': icmp_seq=' + i + ' ttl=64 time=' + (0.3 + Math.random() * 0.6).toFixed(2) + ' ms');
          out.push('', '--- ' + esc(host) + ' ping statistics ---', '<span class="ok">' + n + ' packets transmitted, ' + n + ' received, 0% packet loss</span>');
          ran.push('ping-ok:' + host);
        } else {
          out.push(reach.msg ? '<span class="w">' + reach.msg + '</span>' : '', '--- ' + esc(host) + ' ping statistics ---', '<span class="w">' + n + ' packets transmitted, 0 received, 100% packet loss</span>');
          if (reach.hint) out.push('<span class="m">' + reach.hint + '</span>');
          ran.push('ping-fail');
        }
        break;
      }
      case 'systemctl': {
        const verb = a[0], svc = (a[1] || '').replace(/\.service$/, '');
        if (!verb || (verb !== 'list-units' && !svc)) { out.push('uso: systemctl status|start|stop|restart <serviço>'); ran.push('error'); break; }
        if (verb === 'list-units') { for (const [k, v] of Object.entries(os.services)) out.push(k + '.service  loaded ' + v); break; }
        if (!(svc in os.services)) { out.push('Unit ' + esc(svc) + '.service could not be found.'); ran.push('error'); break; }
        if (verb === 'status') {
          const st = os.services[svc];
          out.push('● ' + svc + '.service - ' + (svc === 'nginx' ? 'A high performance web server' : 'OpenBSD Secure Shell server'));
          out.push('     Loaded: loaded (/lib/systemd/system/' + svc + '.service; enabled)');
          out.push('     Active: <span class="' + (st === 'active' ? 'ok' : 'w') + '">' + (st === 'active' ? 'active (running)' : st === 'failed' ? 'failed (Result: exit-code)' : 'inactive (dead)') + '</span>');
          if (st === 'failed') out.push('<span class="m">     ' + svc + '[812]: ' + (svc === 'nginx' && os.disk >= 95 ? '[emerg] write() to "/var/log/nginx/access.log" failed (28: No space left on device)' : 'worker process exited on signal 9') + '</span>');
          ran.push('status:' + svc);
        } else if (verb === 'restart' || verb === 'start' || verb === 'stop') {
          if (!root) { deny('Failed to ' + verb + ' ' + svc + '.service: Access denied'); break; }
          // nginx can't open its logs on a full disk: it only comes back after space is freed
          if (verb !== 'stop' && svc === 'nginx' && os.disk >= 95) {
            os.services.nginx = 'failed';
            out.push('<span class="w">Job for nginx.service failed because the control process exited with error code.</span>', '<span class="m">See "systemctl status nginx.service" and "df -h" for details.</span>');
            ran.push('error');
            break;
          }
          os.services[svc] = verb === 'stop' ? 'inactive' : 'active';
          ran.push('svc-' + verb + ':' + svc);
        } else { out.push('Unknown command verb ' + esc(verb) + '.'); ran.push('error'); }
        break;
      }
      case 'curl': {
        const url = a.find((x) => !/^-/.test(x)) || '';
        if (!url) { out.push('curl: try "curl localhost"'); ran.push('error'); break; }
        if (/localhost|127\.0\.0\.1/.test(url)) {
          if (os.services.nginx === 'active') { out.push('&lt;!doctype html&gt;&lt;title&gt;' + esc(d.name) + '&lt;/title&gt;&lt;h1&gt;ok&lt;/h1&gt;'); ran.push('curl-ok'); }
          else { out.push('<span class="w">curl: (7) Failed to connect to localhost port 80: Connection refused</span>'); ran.push('curl-fail'); }
        } else out.push('<span class="w">curl: (6) Could not resolve host: ' + esc(url) + '</span>');
        break;
      }
      case 'df': {
        const used = Math.round(os.disk), sz = 100;
        out.push('Filesystem      Size  Used Avail Use% Mounted on', '/dev/sda1        ' + sz + 'G   ' + String(used).padStart(2) + 'G   ' + String(sz - used).padStart(2) + 'G  <span class="' + (used >= 90 ? 'w' : 'ok') + '">' + used + '%</span> /', 'tmpfs           3.9G     0  3.9G   0% /dev/shm');
        ran.push('df');
        if (used < 80) ran.push('df-ok');
        break;
      }
      case 'du': {
        const p = a.find((x) => !/^-/.test(x)) || '.';
        const big = os.disk >= 80;
        if (/^\/var\/log\/?$/.test(p)) { out.push((big ? '58G' : '1.2G') + '\t/var/log'); ran.push('du:/var/log'); }
        else if (/^\/var\/log\/journal\/?$/.test(p)) out.push((big ? '57G' : '0.2G') + '\t/var/log/journal');
        else out.push('12K\t' + esc(p));
        break;
      }
      case 'journalctl': {
        const v = a.find((x) => x.indexOf('--vacuum-size=') === 0);
        if (!v) { out.push('-- Logs begin at ' + new Date().toDateString() + ' --', '... (use --vacuum-size=200M para limpar logs antigos)'); break; }
        if (!root) { deny('Failed to open journal directory: Permission denied'); break; }
        const freed = Math.max(0, os.disk - 42);
        os.disk = Math.min(os.disk, 42);
        out.push('Vacuuming done, freed ' + Math.round(freed) + '.0G of archived journals from /var/log/journal.');
        ran.push('vacuum');
        break;
      }
      default:
        out.push(esc(c) + ': comando não encontrado');
        ran.push('error', 'unknown');
    }
    return { out, ran };
  }

  // The switch configuration as "show running-config" prints it (one description per port with a cable).
  // saved: the startup-config — without the change made after the last save (d.sw.unsaved / unsavedPort)
  function swConfig(d, ctx, saved) {
    const s = d.sw, body = ['!', 'hostname ' + d.name, '!'];
    for (const p of Object.keys(s.ports)) {
      const peer = ctx.peer(d, p);
      if (peer && !(saved && s.unsaved && p === s.unsavedPort)) body.push('interface GigabitEthernet' + p.slice(2), ' description ' + peer, '!');
    }
    body.push('interface Vlan10', ' ip address ' + d.ip + ' 255.255.255.0', '!', 'end');
    const size = body.join('\n').length + 600;
    return (saved ? ['Using ' + size + ' out of 65536 bytes'] : ['Building configuration...', '', 'Current configuration : ' + size + ' bytes']).concat(body);
  }

  // Switch CLI with abbreviations (sh int status, conf t, int gi0/3, no shut).
  const kw = (tok, word, min) => !!tok && tok.length >= (min || 2) && word.indexOf(tok.toLowerCase()) === 0;
  // gi0/13, Gi0/13, GigabitEthernet0/13, gig0/13, g0/13 and "gi 0/13" all name the same port
  const swPort = (s) => { const m = /^([a-z]+)(\d+\/\d+)$/.exec(String(s).toLowerCase()); return m && 'gigabitethernet'.indexOf(m[1]) === 0 ? 'gi' + m[2] : null; };
  function swcli(d, line, ctx) {
    const s = d.sw, out = [], ran = [];
    const t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    const bad = (msg) => { out.push('<span class="w">% ' + msg + '</span>'); ran.push('error'); };
    const c = t[0].toLowerCase();
    if (c === 'help' || c === '?') {
      out.push('modo atual: ' + { user: 'usuário (>)', priv: 'privilegiado (#)', conf: 'configuração (config)', if: 'interface (config-if)' }[s.mode]);
      out.push('  enable · show interfaces status · configure terminal', '  interface gi0/N · shutdown · no shutdown · end · exit',
        '  show running-config · show startup-config · copy running-config startup-config (write memory)', '  ping <ip>');
      return { out, ran };
    }
    if (c === 'clear') { ctx.clear(); return { out, ran }; }
    if (kw(c, 'enable')) { if (s.mode === 'user') s.mode = 'priv'; ran.push('enable'); return { out, ran }; }
    if (kw(c, 'disable', 3)) { s.mode = 'user'; return { out, ran }; }
    if (kw(c, 'exit', 3)) {
      if (s.mode === 'if') s.mode = 'conf';
      else if (s.mode === 'conf') s.mode = 'priv';
      else ctx.close();
      return { out, ran };
    }
    if (kw(c, 'end', 3)) { if (s.mode === 'conf' || s.mode === 'if') s.mode = 'priv'; s.cur = null; ran.push('end'); return { out, ran }; }
    if (kw(c, 'show')) {
      if (s.mode === 'conf' || s.mode === 'if') { bad('Comando show não existe neste modo. Use "end" primeiro.'); return { out, ran }; }
      if (kw(t[1], 'interfaces') && kw(t[2], 'status')) {
        if (s.mode === 'user') { bad('Comando incompleto ou sem permissão. Use "enable" antes.'); return { out, ran }; }
        out.push('Port      Name               Status         Vlan   Duplex  Speed');
        let idle = 0;
        for (const [p, st] of Object.entries(s.ports)) {
          if (st === 'notconnect') { idle++; continue; }
          out.push((p.replace('gi', 'Gi')).padEnd(10) + (ctx.peer(d, p) || '').padEnd(19) + '<span class="' + (st === 'err-disabled' ? 'w' : st === 'connected' ? 'ok' : 'm') + '">' + st.padEnd(15) + '</span>' + (st === 'notconnect' ? '1      auto    auto' : '10     a-full  a-1000'));
        }
        if (idle) out.push('<span class="m">… mais ' + idle + ' portas sem cabo (notconnect)</span>');
        ran.push('show-int');
        // which ports this show saw connected (the "Porta em erro" task checks its own port)
        for (const [p, st] of Object.entries(s.ports)) if (st === 'connected') ran.push('show-int-ok:' + p);
        return { out, ran };
      }
      if (kw(t[1], 'running-config') || kw(t[1], 'startup-config', 3)) {
        if (s.mode === 'user') { bad('Use "enable" antes.'); return { out, ran }; }
        const start = kw(t[1], 'startup-config', 3);
        out.push.apply(out, swConfig(d, ctx, start).map(esc));
        ran.push(start ? 'show-start' : 'show-run');
        return { out, ran };
      }
      bad('Comando incompleto. Tente: show interfaces status');
      return { out, ran };
    }
    // copy running-config startup-config · write memory: what is in use becomes what the switch loads when it boots
    if (kw(c, 'copy', 3) || kw(c, 'write', 2)) {
      if (s.mode === 'user') { bad('Use "enable" antes.'); return { out, ran }; }
      if (s.mode === 'conf' || s.mode === 'if') { bad('Comando inválido neste modo. Use "end" primeiro.'); return { out, ran }; }
      const copy = kw(c, 'copy', 3);
      if (copy ? !(kw(t[1], 'running-config', 3) && kw(t[2], 'startup-config', 3)) : t[1] && !kw(t[1], 'memory', 3)) { bad(copy ? 'Uso: copy running-config startup-config' : 'Uso: write memory'); return { out, ran }; }
      if (copy) out.push('Destination filename [startup-config]? ');
      out.push('Building configuration...', '<span class="ok">[OK]</span>');
      s.unsaved = false;
      ran.push('config-saved');
      return { out, ran };
    }
    if (kw(c, 'configure')) {
      if (s.mode === 'user') { bad('Use "enable" antes de configurar.'); return { out, ran }; }
      if (!t[1] || kw(t[1], 'terminal', 1)) { s.mode = 'conf'; out.push('Enter configuration commands, one per line.  End with CNTL/Z.'); ran.push('conf'); }
      else bad('Comando inválido. Use: configure terminal');
      return { out, ran };
    }
    if (kw(c, 'interface', 3)) {
      if (s.mode !== 'conf' && s.mode !== 'if') { bad('Comando inválido neste modo. Use "configure terminal" antes.'); return { out, ran }; }
      const p = swPort(t.slice(1).join(''));
      if (!p || !s.ports[p]) { bad('Porta inválida. Portas: gi0/1 a gi0/' + Object.keys(s.ports).length); return { out, ran }; }
      s.mode = 'if';
      s.cur = p;
      ran.push('if:' + p);
      // like a real switch the port is selected anyway, but the player learns it isn't the broken one
      // (a port shut down by hand isn't OK either: it just isn't the err-disabled one)
      if (s.bad && !s.fixed && p !== s.bad && s.ports[p] !== 'disabled') out.push('<span class="m">Essa porta está OK. Veja no show interfaces status qual está err-disabled.</span>');
      return { out, ran };
    }
    if (kw(c, 'shutdown', 4) || (c === 'no' && kw(t[1], 'shutdown', 4))) {
      // interface commands: say what is missing to get into the port's config-if
      const broken = s.bad && !s.fixed;
      if (s.mode === 'user' || s.mode === 'priv') { bad('Esse comando vale dentro da porta: configure terminal → interface ' + (broken ? '&lt;porta com problema&gt;' : 'gi0/N') + '.'); return { out, ran }; }
      if (s.mode !== 'if') { bad('Selecione a porta antes: interface gi0/N.'); return { out, ran }; }
      const no = c === 'no', p = s.cur, full = 'GigabitEthernet' + p.slice(2), wasOff = s.ports[p] === 'disabled';
      // the err-disabled port only recovers with shutdown first
      if (no && p === s.bad && !s.fixed && s.ports[p] !== 'disabled') { out.push('<span class="w">Primeiro desligue a porta com shutdown.</span>'); ran.push('error'); return { out, ran }; }
      if (!no) { s.ports[p] = 'disabled'; s.shut = p; out.push('%LINK-5-CHANGED: Interface ' + full + ', changed state to administratively down'); }
      else {
        s.ports[p] = s.linked && s.linked.has(p) ? 'connected' : 'notconnect';
        if (s.shut === p) s.shut = null;
        out.push('%LINK-3-UPDOWN: Interface ' + full + ', changed state to up');
        if (p === s.bad) s.fixed = true;
      }
      // like a real switch it ran, but this is not the port the task is about
      if (broken && p !== s.bad && !(no && wasOff)) out.push('<span class="m">Você está na ' + p + ', que está OK. A porta com problema está err-disabled no show interfaces status.</span>');
      ran.push(no ? 'noshut' : 'shut');
      return { out, ran };
    }
    if (kw(c, 'ping')) {
      if (!t[1]) { bad('Uso: ping <ip>'); return { out, ran }; }
      const ok = ctx.reach(d, t[1]).ok;
      out.push('Sending 5, 100-byte ICMP Echos to ' + esc(t[1]) + ', timeout is 2 seconds:', ok ? '!!!!!' : '.....', 'Success rate is ' + (ok ? '100 percent (5/5)' : '0 percent (0/5)'));
      ran.push(ok ? 'ping-ok:' + t[1] : 'ping-fail');
      return { out, ran };
    }
    bad('Comando desconhecido: "' + c + '". Digite help ou use Precisa de ajuda?');
    ran.push('unknown');
    return { out, ran };
  }

  // the two shells, for automated checks of the scenarios (no UI)
  DL.termShells = { linux, swcli };

  /* ------------------------------------------------------------------ */
  /* Terminal UI                                                         */
  /* ------------------------------------------------------------------ */
  DL.createTerminal = function (game) {
    const $ = (id) => document.getElementById(id);
    const el = {
      root: $('terminal'), out: $('termOut'), input: $('termIn'), prompt: $('termPrompt'), title: $('termTitle'), where: $('termWhere'),
      close: $('termClose'), task: $('termTask'), goal: $('termGoal'), steps: $('termSteps'), helpBtn: $('termHelpBtn'), help: $('termHelp'), side: $('termSide'),
      mode: $('termMode'),
    };
    const X = { open: false, dev: null, lesson: null, ran: new Set(), history: [], hi: -1, misses: 0, step: 0, onDone: null, helpOpen: false };

    // which interpreter runs on this device: switch CLI, Windows Server (winserver.js) or Linux
    const isWin = (d) => !!(DL.isWin && DL.isWin(d));
    const shellOf = (d) => (d.kind === 'switch' ? swcli : isWin(d) ? DL.winShell : linux);
    const promptOf = (d) => {
      if (d.kind === 'switch') return d.name + ({ user: '>', priv: '#', conf: '(config)#', if: '(config-if)#' }[d.sw.mode]);
      if (isWin(d)) return DL.winPrompt(d);
      return 'admin@' + d.os.hostname + ':~$';
    };

    // Output: follows the newest line unless the player scrolled up to read (then it stays put);
    // a command typed by the player always brings the view back down. Old lines are trimmed.
    const MAX_LINES = 600;
    function print(lines, cls, force) {
      const o = el.out, stick = force || o.scrollHeight - o.scrollTop - o.clientHeight < 48;
      const frag = document.createDocumentFragment();
      for (const l of lines) {
        const div = document.createElement('div');
        if (cls) div.className = cls;
        div.innerHTML = l === '' ? '&nbsp;' : l;
        frag.appendChild(div);
      }
      o.appendChild(frag);
      let cut = o.children.length - MAX_LINES;
      while (cut-- > 0) o.firstChild.remove();
      if (stick) o.scrollTop = o.scrollHeight;
    }

    // keep the current step in view inside the side panel (never scrolls the page itself)
    function revealStep() {
      const cur = el.steps.querySelector('.is-current');
      if (!cur) return;
      const side = el.side, top = cur.offsetTop - side.offsetTop, bottom = top + cur.offsetHeight;
      if (top < side.scrollTop + 8) side.scrollTop = Math.max(0, top - 8);
      else if (bottom > side.scrollTop + side.clientHeight - 8) side.scrollTop = bottom - side.clientHeight + 8;
    }

    /* ---------- learning mode (difficulty.js) ---------- */
    const L = () => (DL.learn ? DL.learn() : { id: 'intermediario', name: 'Intermediário', stepText: 'full', helpDepth: 'example', helpAfter: 3, autoHelp: false, explainErrors: false, color: '#a0c3ec' });
    function renderMode() {
      if (!el.mode) return;
      const m = L();
      el.mode.textContent = 'Modo ' + m.name;
      el.mode.style.setProperty('--c', m.color);
      el.mode.title = m.desc || '';
    }
    // the command a step expects, as a hint (Iniciante shows it right in the step)
    // (a step may carry its exact command — with this server's IP / name — instead of the generic example)
    // (a question never shows its answer: the hint is how to reply)
    const stepCmd = (s) => (s.answer ? 'responder <sua resposta>' : s.cmd || (s.help && HELP[s.help[0]] ? HELP[s.help[0]].ex.split('\n')[0] : ''));
    // the text of a step in Experiente (hidden until done) — a question is always shown: it is what is asked
    const stepText = (s, hidden) => (hidden && !s.answer ? 'Descubra o próximo passo.' : s.text);
    // why a command failed, in plain words (Iniciante)
    const FIRST = ['ip', 'ping', 'sudo', 'systemctl', 'curl', 'df', 'du', 'journalctl', 'hostnamectl', 'hostname', 'help', 'clear', 'exit', 'enable', 'show', 'configure', 'interface', 'shutdown', 'no', 'end', 'lscpu', 'free', 'uptime', 'whoami', 'uname', 'responder', 'tail', 'grep', 'cat', 'ss', 'netstat', 'copy', 'write'];
    function closest(w) {
      let best = null, bd = 3;
      for (const c of X.dev && isWin(X.dev) && DL.WIN_FIRST ? DL.WIN_FIRST : FIRST) {
        const d = lev(w, c);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    function lev(a, b) {
      const m = [];
      for (let i = 0; i <= a.length; i++) { m[i] = [i]; for (let j = 1; j <= b.length; j++) m[i][j] = i ? Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) : j; }
      return m[a.length][b.length];
    }
    function explain(line, r) {
      const txt = r.out.join(' ');
      const w = line.trim().split(/\s+/)[0].toLowerCase();
      // the Windows shell explains its own teaching errors
      if (r.why) return r.why;
      if (X.dev && isWin(X.dev)) {
        if (r.ran.indexOf('unknown') >= 0) { const c = closest(w); return 'O Windows não conhece "' + esc(w) + '".' + (c ? ' Você quis dizer <code>' + esc(c) + '</code>?' : '') + ' Digite <code>help</code> para ver os comandos por área.'; }
        if (r.ran.indexOf('ping-fail') >= 0) return 'O ping não voltou. Leia a dica em cinza: ela diz se é o cabo, o adaptador, o IP ou o gateway.';
        if (r.ran.indexOf('error') >= 0) return 'O comando deu erro. A mensagem em laranja diz o motivo e a linha cinza sugere o formato certo.';
        return null;
      }
      if (/Operation not permitted|Access denied|Permission denied/.test(txt)) return 'Esse comando altera o sistema, então precisa de permissão de administrador. Coloque <b>sudo</b> na frente: <code>sudo ' + esc(line.trim()) + '</code>';
      if (r.ran.indexOf('unknown') >= 0) { const c = closest(w); return 'O sistema não conhece "' + esc(w) + '".' + (c ? ' Você quis dizer <code>' + c + '</code>?' : '') + ' Digite <code>help</code> para ver a lista.'; }
      if (/Cannot find device/.test(txt)) return 'Essa interface não existe. As interfaces deste servidor são <b>lo</b> e <b>eth0</b> — veja com <code>ip addr</code>.';
      if (/any valid prefix/.test(txt)) return 'O endereço precisa estar no formato IP/máscara, por exemplo <code>10.0.1.12/24</code>.';
      if (/invalid gateway/.test(txt)) return 'O gateway precisa estar na mesma rede do IP da interface. Dê o IP primeiro (ip addr add), depois crie a rota.';
      if (/^uso:|usage|Comando incompleto|incompleto/.test(txt)) return 'Faltou parte do comando. Veja o formato acima ou clique em <b>Precisa de ajuda?</b>.';
      if (/Use "enable"/.test(txt)) return 'No switch você começa no modo usuário (&gt;). Digite <code>enable</code> para o modo privilegiado (#).';
      if (/Use "end" primeiro|neste modo/.test(txt)) return 'Esse comando não vale no modo atual do switch. Repare no prompt: (config) e (config-if) são modos de configuração; <code>end</code> volta.';
      if (r.ran.indexOf('ping-fail') >= 0) return 'O ping não voltou. Leia a dica em cinza acima: ela diz em que camada está o problema (interface, cabo, IP ou rota).';
      if (r.ran.indexOf('error') >= 0) return 'O comando deu erro. Leia a mensagem acima com calma: ela costuma dizer exatamente o que faltou.';
      return null;
    }

    function curStep() {
      if (!X.lesson) return -1;
      const s = X.lesson.steps;
      for (let i = 0; i < s.length; i++) if (!s[i].done(X.dev, X.ran)) return i;
      return s.length;
    }

    function renderSide() {
      if (!X.lesson) {
        const ms = isWin(X.dev) && DL.winMissions ? DL.winMissions(X.dev) : [];
        el.helpBtn.hidden = false;
        if (ms.length) {
          // Windows Server: optional missions (each teaches one part of the server and pays once)
          el.task.textContent = 'Windows Server · Missões';
          el.goal.textContent = 'Nenhuma tarefa urgente. Escolha uma missão para praticar — ou explore à vontade (help conceitos).';
          const html = ms.map((m, k) => '<li class="' + (m.done ? 'is-done' : '') + '"><span class="term__chk">' + (m.done ? '✓' : k + 1) + '</span><span><b class="term__mtitle">' + esc(m.title) + '</b> <em class="term__mreward">+' + m.reward + ' créditos</em><small class="term__mdesc">' + esc(m.desc) + '</small>' +
            (m.done ? '' : m.lock ? '<small class="term__mlock">🔒 ' + esc(m.lock) + '</small>' : '<button type="button" class="btn btn--sm btn--primary term__act" data-term-mission="' + m.id + '">Iniciar missão</button>') + '</span></li>').join('');
          if (el.steps.dataset.k !== html) { el.steps.dataset.k = html; el.steps.innerHTML = html; }
          return;
        }
        el.task.textContent = 'Console livre';
        el.goal.textContent = 'Nenhuma tarefa aberta neste equipamento. Explore à vontade — digite help.';
        el.steps.innerHTML = '';
        el.steps.dataset.k = '';
        return;
      }
      const i = curStep(), m = L();
      el.task.textContent = X.lesson.title;
      el.goal.textContent = X.lesson.goal;
      // Experiente: only the goal; each step is revealed once it is done
      const hidden = m.stepText === 'hidden';
      const html = X.lesson.steps.map((s, k) => {
        const txt = hidden && k >= i ? (k === i ? stepText(s, true) : '?') : s.text;
        const hint = m.id === 'iniciante' && k === i && stepCmd(s) ? '<code class="term__try">' + esc(stepCmd(s)) + '</code>' : '';
        // a lesson on two devices (problems.js: step.on): which console each step happens on — shown from the
        // current step on only, so a later step never gives away which server the problem is about
        const on = s.on && k <= i ? '<em class="term__on' + (s.on === X.dev ? ' is-here' : '') + '">' + esc(s.on.name) + '</em> ' : '';
        const away = k === i && s.on && s.on !== X.dev;
        return '<li class="' + (k < i ? 'is-done' : k === i ? 'is-current' : '') + (s.answer ? ' is-question' : '') + '"><span class="term__chk">' + (k < i ? '✓' : k === i && s.answer ? '?' : k + 1) + '</span><span>' + on + esc(txt) + (away ? '' : hint) +
          (away ? '<small class="term__away">Este passo é no ' + esc(s.on.name) + '.</small><button type="button" class="btn btn--sm btn--primary term__act" data-term-act="hop">Abrir o console do ' + esc(s.on.name) + '</button>' : '') +
          (k === i && s.action === 'cabling' ? '<button type="button" class="btn btn--sm btn--primary term__act" data-term-act="cabling">Abrir cabeamento do rack</button>' : '') +
          // a question: the answer goes here (or "responder <valor>" in the console)
          (k === i && s.answer ? '<form class="term__answer" data-term-answer autocomplete="off"><input class="input" name="a" maxlength="60" placeholder="Sua resposta" aria-label="Resposta: ' + esc(s.text) + '"><button type="submit" class="btn btn--sm btn--primary">Responder</button></form>' : '') + '</span></li>';
      }).join('');
      // rebuild only when something changed, so the side panel never jumps while the player scrolls it
      if (el.steps.dataset.k !== html) { el.steps.dataset.k = html; el.steps.innerHTML = html; revealStep(); }
      el.helpBtn.classList.toggle('is-guide', m.helpAfter > 0 && X.misses >= m.helpAfter && !X.helpOpen);
    }

    // how deep the help goes depends on the learning mode: syntax only (Experiente), + example
    // (Intermediário), or everything with when to use it (Iniciante). Asking is always allowed.
    // `ex` replaces the generic example of one command (the step's own, with this device's port / IP / name)
    function helpCard(keys, depth, ex) {
      depth = depth || 'full';
      return keys.map((k) => {
        const h = HELP[k], e = ex && ex[k] ? ex[k] : h.ex;
        return '<div class="hcard"><code class="hcard__cmd">' + esc(h.cmd) + '</code>' +
          '<dl>' + (depth !== 'syntax' ? '<dt>Exemplo</dt><dd><code>' + esc(e).replace(/\n/g, '<br>') + '</code></dd>' : '') +
          '<dt>O que faz</dt><dd>' + esc(h.what) + '</dd>' + (depth === 'full' ? '<dt>Quando usar</dt><dd>' + esc(h.when) + '</dd>' : '') + '</dl></div>';
      }).join('');
    }

    function renderHelp() {
      const i = curStep(), m = L();
      const win = isWin(X.dev);
      const step = X.lesson && i < X.lesson.steps.length ? X.lesson.steps[i] : null;
      const keys = step ? step.help : X.dev.kind === 'switch' ? ['enable', 'show-int', 'conf-t'] : win ? ['win-ipconfig', 'win-features', 'win-service'] : ['ip-addr', 'ping', 'sudo'];
      const stepLabel = step ? (m.stepText === 'hidden' && !step.answer ? 'o próximo passo' : step.text) : '';
      // the step's exact command (same source as the hint in the terminal) is the example of its first card
      const ex = step && step.cmd ? { [step.help[0]]: step.cmd } : null;
      let h = '<p class="term__hint">' + (stepLabel ? 'Para ' + (m.stepText === 'hidden' ? '' : 'este passo: ') + '<b>' + esc(stepLabel) + '</b>' : 'Comandos mais usados aqui:') +
        ' <span class="term__depth">Ajuda do modo ' + esc(m.name) + '</span></p>' + helpCard(m.helpDepth === 'syntax' ? keys.slice(0, 1) : keys, m.helpDepth, ex);
      const SWITCH_KEYS = ['enable', 'show-int', 'conf-t', 'interface', 'shutdown', 'no-shutdown', 'end', 'show-run', 'show-start', 'copy-run-start', 'sw-ping'];
      const forDev = (k) => (X.dev.kind === 'switch' ? SWITCH_KEYS.includes(k) || k === 'responder' : win ? HELP[k].os === 'win' || k === 'cabling' : !HELP[k].os && !SWITCH_KEYS.includes(k));
      h += '<details class="term__all"><summary>Todos os comandos</summary>' + Object.keys(HELP).filter(forDev)
        .map((k) => '<button type="button" class="chip" data-help="' + k + '">' + esc(HELP[k].cmd.split(' <')[0]) + '</button>').join('') + '<div data-help-out></div></details>';
      el.help.innerHTML = h;
    }

    function toggleHelp(force) {
      X.helpOpen = force != null ? force : !X.helpOpen;
      el.help.hidden = !X.helpOpen;
      el.helpBtn.textContent = X.helpOpen ? 'Esconder ajuda' : 'Precisa de ajuda?';
      if (X.helpOpen) { X.misses = 0; renderHelp(); }
      renderSide();
    }

    const ctx = {
      clear: () => (el.out.innerHTML = ''),
      close: () => close(),
      reach: (d, host) => game.reach(d, host),
      peer: (d, port) => (game.peer ? game.peer(d, port) : ''),
      get history() { return X.history; },
    };

    function run(line) {
      const d = X.dev, m = L();
      print(['<span class="term__p">' + esc(promptOf(d)) + '</span> ' + esc(line)], null, true);
      if (line.trim()) X.history.push(line);
      if (X.history.length > 100) X.history.shift();
      const before = curStep();
      // "responder <valor>": the answer to the question of the current step (not a shell command)
      const said = X.lesson && /^\s*respo(?:nder|sta)\b\s*(.*)$/i.exec(line);
      if (said) {
        const s = X.lesson.steps[before];
        if (s && s.answer) answer(said[1]);
        else { print(['<span class="m">Nenhuma pergunta agora: este passo pede um comando. Veja o passo atual ao lado.</span>'], null, true); renderSide(); }
        return;
      }
      const r = shellOf(d)(d, line, ctx);
      // every command that ran without an error also reports its own name (cmd:whoami), so a step can ask for any command
      if (line.trim() && r.ran.indexOf('error') < 0 && r.ran.indexOf('unknown') < 0) {
        const w = line.trim().split(/\s+/).find((x) => x !== 'sudo');
        if (w) r.ran.push('cmd:' + w.toLowerCase());
      }
      if (r.out.length) print(r.out, null, true);
      for (const e of r.ran) X.ran.add(e);
      game.onCommand && game.onCommand(d, r.ran);
      // Iniciante: every error comes with a plain explanation
      if (m.explainErrors && line.trim()) { const why = explain(line, r); if (why) print(['<span class="term__why">💡 ' + why + '</span>'], null, true); }
      if (X.lesson) progress(before, !!line.trim());
      el.prompt.textContent = promptOf(d);
      renderSide();
    }

    // after a command or an answer: the next step (or the end), or one more miss towards "Precisa de ajuda?"
    function progress(before, tried) {
      const m = L(), after = curStep();
      if (after > before) {
        X.misses = 0;
        if (X.helpOpen) renderHelp();
        if (after >= X.lesson.steps.length) finish();
        else {
          const next = X.lesson.steps[after];
          // the next step on another device's console: say so (the side panel has the button)
          if (next.on && next.on !== X.dev) print(['<span class="ok">✓ passo concluído.</span> <span class="m">O próximo passo é no <b>' + esc(next.on.name) + '</b>: use o botão ao lado (Abrir o console do ' + esc(next.on.name) + ').</span>'], null, true);
          else {
            const tell = m.stepText === 'hidden' ? esc(stepText(next, true)) : esc(next.text) + (m.id === 'iniciante' && stepCmd(next) ? ' · experimente <code>' + esc(stepCmd(next)) + '</code>' : '');
            print(['<span class="ok">✓ passo concluído.</span> <span class="m">Próximo: ' + tell + '</span>'], null, true);
          }
        }
      } else if (tried) {
        X.misses++;
        if (m.helpAfter && X.misses === m.helpAfter && !X.helpOpen) {
          if (m.autoHelp) toggleHelp(true);
          else print(['<span class="m">Travou? Clique em <b>Precisa de ajuda?</b> para ver o comando' + (m.helpDepth === 'syntax' ? '' : ', um exemplo') + ' e o que ele faz.</span>'], null, true);
        }
      }
    }

    // The answer to the question of the current step (typed "responder <valor>" or sent from the side panel).
    // Right: the step is done. Wrong: one more miss, and the player reads the output again.
    function answer(value, fromPanel) {
      const i = curStep(), s = X.lesson && X.lesson.steps[i];
      if (!s || !s.answer) return false;
      const v = String(value == null ? '' : value).trim().slice(0, 60);
      if (fromPanel) print(['<span class="term__p">resposta:</span> ' + esc(v)], null, true);
      if (!v) { print(['<span class="m">Escreva a resposta depois do comando: responder &lt;valor&gt;</span>'], null, true); renderSide(); return false; }
      const ok = !!(DL.checkAnswer && DL.checkAnswer(s.answer, v));
      game.emit && game.emit('answer', { d: X.dev, ok, value: v });
      if (ok) {
        X.ran.add('answer:' + i);
        print(['<span class="ok">✓ Resposta certa: ' + esc(v) + '</span>'], null, true);
      } else print(['<span class="w">✗ "' + esc(v) + '" não confere.</span> <span class="m">Leia de novo a saída do comando e tente outra vez.</span>'], null, true);
      progress(i, true);
      renderSide();
      return ok;
    }

    function finish() {
      const done = X.onDone, l = X.lesson;
      X.lesson = null;
      print(['', '<span class="ok">✓ ' + esc(l.title) + ' — concluído.</span>', '<span class="m">Pode fechar o terminal (Esc) ou continuar explorando.</span>']);
      if (done) done();
    }

    function open(dev, lessonType, onDone) {
      // a Windows mission left half-way comes back when the console is reopened with nothing urgent
      if (!lessonType && isWin(dev) && /^mis-/.test(dev.lessonKey || '') && LESSONS[dev.lessonKey] && dev.os.win.done.indexOf(dev.lessonKey) < 0) {
        const id = dev.lessonKey;
        lessonType = id;
        onDone = () => DL.winMissionDone(dev, id, game);
      }
      X.dev = dev;
      X.lesson = lessonType && LESSONS[lessonType] ? LESSONS[lessonType](dev) : null;
      X.lessonType = X.lesson ? lessonType : null;
      X.onDone = onDone || null;
      // progress lives on the device, so closing the console to fix a cable doesn't lose it
      if (!dev.ran || dev.lessonKey !== lessonType) { dev.ran = new Set(); dev.lessonKey = lessonType; }
      X.ran = dev.ran;
      X.misses = 0;
      X.hi = -1;
      el.out.innerHTML = '';
      el.title.textContent = 'Console · ' + dev.name;
      el.where.textContent = dev.where;
      print(dev.kind === 'switch'
        ? ['<span class="m">Conectado pela porta de console de ' + esc(dev.name) + '.</span>', '<span class="m">Digite help para ver os comandos.</span>', '']
        : isWin(dev) ? DL.winBanner(dev)
        : ['<span class="m">Ubuntu 24.04 LTS · ' + esc(dev.name) + ' · conectado pelo console do rack</span>', '<span class="m">Digite help para ver os comandos. ↑ repete comandos anteriores.</span>', '']);
      const m = L();
      if (X.lesson) {
        // (a lesson already under way — reopened, or continued on another device — starts from its current step)
        const k = Math.min(curStep(), X.lesson.steps.length - 1), first = X.lesson.steps[k];
        print(['<span class="ok">Tarefa:</span> ' + esc(X.lesson.goal),
          '<span class="m">' + (m.stepText === 'hidden' ? 'Modo Experiente: descubra os passos. A ajuda mostra só a sintaxe.' : (k ? 'Passo atual: ' : 'Primeiro passo: ') + esc(first.text) + (m.id === 'iniciante' && stepCmd(first) && (!first.on || first.on === dev) ? ' · experimente <code>' + esc(stepCmd(first)) + '</code>' : '')) + '</span>', '']);
      }
      el.prompt.textContent = promptOf(dev);
      el.steps.dataset.k = '';
      el.side.scrollTop = 0;
      // Iniciante: the help card is open from the start
      toggleHelp(!!(m.autoHelp && X.lesson));
      renderMode();
      el.root.classList.add('is-open');
      X.open = true;
      renderSide();
      setTimeout(() => el.input.focus({ preventScroll: true }), 40);
    }

    function close() {
      if (!X.open) return;
      X.open = false;
      el.root.classList.remove('is-open');
      el.input.blur();
      if (X.dev && X.dev.kind === 'switch') { X.dev.sw.mode = 'user'; X.dev.sw.cur = null; }
      game.onTerminalClose && game.onTerminalClose();
    }

    const COMPLETE = ['ip addr', 'ip link', 'ip route', 'ip link set eth0 up', 'ip addr add ', 'ip addr del ', 'ip route add default via ', 'ip route del default', 'ping -c 3 ', 'systemctl status ', 'systemctl restart ', 'systemctl start ', 'cat notas.txt', 'tail -n 20 /var/log/syslog', 'grep -c ', 'curl localhost', 'df -h', 'du -sh /var/log', 'journalctl --vacuum-size=200M', 'hostnamectl set-hostname ', 'hostname', 'whoami', 'uname -a', 'uptime', 'lscpu', 'free -h', 'responder ', 'tail -n 20 /var/log/auth.log', 'grep "Failed password" /var/log/auth.log', 'ss -tlnp', 'show running-config', 'show startup-config', 'copy running-config startup-config', 'enable', 'show interfaces status', 'configure terminal', 'interface gi0/', 'shutdown', 'no shutdown', 'end'];
    el.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const v = el.input.value;
        el.input.value = '';
        X.hi = -1;
        run(v);
      } else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (!X.history.length) return;
        if (ev.key === 'ArrowUp') X.hi = X.hi < 0 ? X.history.length - 1 : Math.max(0, X.hi - 1);
        else X.hi = X.hi < 0 ? -1 : X.hi + 1 >= X.history.length ? -1 : X.hi + 1;
        el.input.value = X.hi < 0 ? '' : X.history[X.hi];
      } else if (ev.key === 'Tab') {
        ev.preventDefault();
        const v = el.input.value, pre = v.indexOf('sudo ') === 0 ? 'sudo ' : '', body = v.slice(pre.length);
        // PowerShell completes regardless of case
        const m = X.dev && isWin(X.dev) && DL.WIN_COMPLETE
          ? DL.WIN_COMPLETE.filter((c) => c.toLowerCase().indexOf(body.toLowerCase()) === 0 && c.toLowerCase() !== body.toLowerCase())
          : COMPLETE.filter((c) => c.indexOf(body) === 0 && c !== body);
        if (m.length === 1) el.input.value = pre + m[0];
        else if (m.length > 1) print(['<span class="m">' + m.map(esc).join('   ') + '</span>']);
      } else if (ev.key === 'l' && ev.ctrlKey) { ev.preventDefault(); ctx.clear(); }
      ev.stopPropagation();
    });
    el.close.addEventListener('click', close);
    // a Windows Server mission chosen in the side panel becomes the console's lesson
    function startMission(id) {
      const d = X.dev;
      if (!d || !LESSONS[id]) return;
      if (DL.winMissionStart) DL.winMissionStart(d, id);
      X.lesson = LESSONS[id](d);
      X.onDone = () => DL.winMissionDone(d, id, game);
      d.ran = new Set();
      d.lessonKey = id;
      X.ran = d.ran;
      X.misses = 0;
      el.steps.dataset.k = '';
      const m = L(), first = X.lesson.steps[0];
      print(['', '<span class="ok">Missão:</span> ' + esc(X.lesson.goal), '<span class="m">' + (m.stepText === 'hidden' ? 'Modo Experiente: descubra os passos.' : 'Primeiro passo: ' + esc(first.text) + (m.id === 'iniciante' && stepCmd(first) ? ' · experimente <code>' + esc(stepCmd(first)) + '</code>' : '')) + '</span>', ''], null, true);
      if (X.helpOpen) renderHelp();
      renderSide();
      // a step may already be true (e.g. the role was installed earlier)
      if (curStep() >= X.lesson.steps.length) finish();
      el.input.focus({ preventScroll: true });
    }
    // the answer field of a question step
    el.steps.addEventListener('submit', (ev) => {
      const f = ev.target.closest('[data-term-answer]');
      if (!f) return;
      ev.preventDefault();
      const v = f.elements.a.value;
      if (!answer(v, true)) { const inp = el.steps.querySelector('[data-term-answer] input'); if (inp) { inp.value = v; inp.select(); inp.focus({ preventScroll: true }); } }
      else el.input.focus({ preventScroll: true });
    });
    // keys typed in the answer field stay there (no game hotkeys); Esc closes the console as usual
    el.steps.addEventListener('keydown', (ev) => {
      if (!ev.target.closest('[data-term-answer]')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      ev.stopPropagation();
    });
    // a lesson on two devices: leave this console and open the other one, on the same lesson (its progress stays)
    function hop(dev) {
      const s = X.lesson && X.lesson.steps[curStep()];
      dev = dev || (s && s.on);
      if (!dev || dev === X.dev || !X.lessonType) return false;
      const type = X.lessonType, done = X.onDone;
      close();
      open(dev, type, done);
      return true;
    }
    el.steps.addEventListener('click', (ev) => {
      const ms = ev.target.closest('[data-term-mission]');
      if (ms) { startMission(ms.dataset.termMission); return; }
      if (ev.target.closest('[data-term-act="hop"]')) { hop(); return; }
      if (!ev.target.closest('[data-term-act="cabling"]')) return;
      const d = X.dev;
      close();
      game.openCabling(d);
    });
    el.helpBtn.addEventListener('click', () => { toggleHelp(); el.input.focus({ preventScroll: true }); });
    el.help.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-help]');
      if (!b) return;
      el.help.querySelector('[data-help-out]').innerHTML = helpCard([b.dataset.help], L().helpDepth);
    });
    // clicking the output gives the focus back to the prompt — but not while the player selects text to copy
    el.out.addEventListener('click', () => { const s = window.getSelection && window.getSelection(); if (!s || s.isCollapsed) el.input.focus({ preventScroll: true }); });
    if (DL.onLearnChange) DL.onLearnChange(() => { renderMode(); if (X.open) { renderSide(); if (X.helpOpen) renderHelp(); } });
    el.root.addEventListener('pointerdown', (ev) => { if (ev.target === el.root) close(); });

    return {
      open, close,
      get isOpen() { return X.open; },
      get device() { return X.dev; },
      get lesson() { return X.lesson; },
      get step() { return curStep(); },
      refresh() { if (X.open) { renderSide(); if (X.lesson && curStep() >= X.lesson.steps.length) finish(); } },
      run, startMission, answer, hop,
    };
  };
})();
