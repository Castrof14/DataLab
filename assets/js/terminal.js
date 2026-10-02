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
    enable: { cmd: 'enable', ex: 'enable', what: 'No switch, entra no modo privilegiado (o prompt muda de > para #).', when: 'Antes de qualquer comando de diagnóstico ou configuração no switch.' },
    'show-int': { cmd: 'show interfaces status', ex: 'show interfaces status', what: 'Lista as portas do switch e o estado de cada uma (connected, notconnect, err-disabled). Abreviação: sh int status.', when: 'Para achar a porta com problema.' },
    'conf-t': { cmd: 'configure terminal', ex: 'conf t', what: 'Entra no modo de configuração global do switch.', when: 'Antes de mudar qualquer configuração.' },
    interface: { cmd: 'interface <porta>', ex: 'interface gi0/3', what: 'Seleciona uma porta para configurar (prompt vira config-if).', when: 'Depois do conf t, para mexer em uma porta específica.' },
    shutdown: { cmd: 'shutdown  /  no shutdown', ex: 'shutdown\nno shutdown', what: '"shutdown" desliga a porta; "no shutdown" liga de novo. Juntos, reiniciam a porta e tiram o estado err-disabled.', when: 'Quando uma porta está em err-disabled e a causa já foi resolvida.' },
    cabling: { cmd: 'Cabeamento do rack', ex: 'Tarefas → Cabeamento  (ou o botão abaixo)', what: 'Mostra os cabos do rack: azul = ligado e correto, amarelo = incompleto, vermelho = conexão errada, laranja = cabo solto.', when: 'Quando ip link mostra NO-CARRIER: não é configuração, é a camada física (cabo).' },
    end: { cmd: 'end', ex: 'end', what: 'Sai do modo de configuração e volta ao modo privilegiado (#).', when: 'Ao terminar de configurar, para voltar a usar comandos show.' },
  };
  DL.CMD_HELP = HELP;

  /* ------------------------------------------------------------------ */
  /* Lessons: steps are checked against device state + what was run      */
  /* ------------------------------------------------------------------ */
  const eth = (d) => d.os.ifaces.eth0;
  const LESSONS = {
    setup: (d) => ({
      title: 'Configurar ' + d.name,
      goal: 'Servidor novo, cabo conectado. Coloque-o na rede com o IP ' + d.ip + '/24 e teste a conexão com o gateway 10.0.1.1.',
      steps: [
        { text: 'Veja as interfaces de rede do servidor.', help: ['ip-addr'], done: (d, ran) => ran.has('ip-show') || ran.has('link-show') },
        { text: 'A eth0 está DOWN. Ligue a interface.', help: ['ip-link-up', 'sudo'], done: (d) => eth(d).up },
        { text: 'Atribua o IP ' + d.ip + '/24 à eth0.', help: ['ip-addr-add'], done: (d) => eth(d).ips.indexOf(d.ip + '/24') >= 0 },
        { text: 'Crie a rota padrão pelo gateway 10.0.1.1.', help: ['ip-route-add', 'ip-route'], done: (d) => d.os.route === '10.0.1.1' },
        { text: 'Teste a conexão com o gateway.', help: ['ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
      ],
    }),
    cable: (d) => ({
      title: 'Falha de conexão · ' + d.name,
      goal: d.name + ' sumiu da rede e o monitor marcou o host como indisponível. Descubra se é configuração ou camada física.',
      steps: [
        { text: 'Veja o estado do link da eth0.', help: ['ip-link', 'ip-addr'], done: (d, ran) => ran.has('ip-show') || ran.has('link-show') },
        { text: 'NO-CARRIER = sem sinal no cabo. Reconecte o cabo no rack.', help: ['cabling'], action: 'cabling', done: (d) => d.os.cable },
        { text: 'Teste a conexão com o gateway 10.0.1.1.', help: ['ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
      ],
    }),
    link: (d) => ({
      title: 'Falha de conexão · ' + d.name,
      goal: d.name + ' parou de responder na rede. Descubra o motivo, corrija e teste.',
      steps: [
        { text: 'Veja o estado das interfaces.', help: ['ip-link', 'ip-addr'], done: (d, ran) => ran.has('ip-show') || ran.has('link-show') },
        { text: 'A eth0 caiu (DOWN). Ligue a interface de novo.', help: ['ip-link-up', 'sudo'], done: (d) => eth(d).up },
        { text: 'Teste a conexão com o gateway 10.0.1.1.', help: ['ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
      ],
    }),
    service: (d) => ({
      title: 'Serviço parado · ' + d.name,
      goal: 'O site hospedado no ' + d.name + ' não responde. Verifique o serviço web (nginx).',
      steps: [
        { text: 'Veja o estado do serviço nginx.', help: ['systemctl-status'], done: (d, ran) => ran.has('status:nginx') },
        { text: 'O nginx está "failed". Reinicie o serviço.', help: ['systemctl-restart', 'sudo'], done: (d) => d.os.services.nginx === 'active' },
        { text: 'Confirme que o site responde.', help: ['curl'], done: (d, ran) => ran.has('curl-ok') },
      ],
    }),
    disk: (d) => ({
      title: 'Disco cheio · ' + d.name,
      goal: 'O disco do ' + d.name + ' está quase lotado. Encontre o culpado e libere espaço.',
      steps: [
        { text: 'Veja o uso dos discos.', help: ['df'], done: (d, ran) => ran.has('df') },
        { text: 'Descubra quanto ocupa a pasta de logs /var/log.', help: ['du'], done: (d, ran) => ran.has('du:/var/log') },
        { text: 'Limpe os logs antigos do journal (deixe 200M).', help: ['journalctl-vacuum', 'sudo'], done: (d) => d.os.disk < 80 },
        { text: 'Confira o disco de novo.', help: ['df'], done: (d, ran) => ran.has('df-ok') },
      ],
    }),
    port: (d) => ({
      title: 'Porta em erro · ' + d.name,
      goal: 'Uma porta do switch ' + d.name + ' entrou em err-disabled e derrubou um servidor. Encontre e reative a porta.',
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], done: (d) => d.sw.mode !== 'user' || d.sw.fixed },
        { text: 'Veja o status das portas.', help: ['show-int'], done: (d, ran) => ran.has('show-int') },
        { text: 'Entre no modo de configuração.', help: ['conf-t'], done: (d) => d.sw.mode === 'conf' || d.sw.mode === 'if' || d.sw.fixed },
        { text: 'Selecione a porta com problema.', help: ['interface'], done: (d) => (d.sw.mode === 'if' && d.sw.cur === d.sw.bad) || d.sw.fixed },
        { text: 'Reinicie a porta: shutdown e depois no shutdown.', help: ['shutdown'], done: (d) => d.sw.fixed },
        { text: 'Volte (end) e confira o status das portas.', help: ['end', 'show-int'], done: (d, ran) => ran.has('show-int-ok') },
      ],
    }),
  };
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
      for (let i = 1; i <= 24; i++) d.sw.ports['gi0/' + i] = 'notconnect';
      d.sw.linked = new Set();
    }
  };

  const ipOnly = (cidr) => cidr.split('/')[0];
  const sameNet = (a, b) => a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');

  // Linux shell. Returns { out: [lines], ran: [events] }.
  function linux(d, line, ctx) {
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
          out.push('comandos disponíveis:', '  ip addr | ip link | ip route     ping -c 3 <destino>', '  systemctl status|restart <serviço>   curl localhost', '  df -h   du -sh <pasta>   journalctl --vacuum-size=200M', '  hostname   hostnamectl set-hostname <nome>', '  uptime  whoami  uname -a  date  history  clear  exit', '  sudo <comando> executa como administrador', 'detalhes: help <comando>  ·  ou o botão Precisa de ajuda?');
        }
        break;
      case 'clear': ctx.clear(); break;
      case 'exit': case 'logout': ctx.close(); break;
      case 'history': ctx.history.forEach((h, i) => out.push(String(i + 1).padStart(4) + '  ' + esc(h))); break;
      case 'whoami': out.push(root ? 'root' : 'admin'); break;
      case 'hostname': out.push(os.hostname); break;
      case 'hostnamectl':
        if (a[0] === 'set-hostname' && a[1]) {
          if (!root) { deny('Could not set hostname: Access denied'); break; }
          os.hostname = a[1];
          ran.push('hostname');
        } else out.push('   Static hostname: ' + os.hostname, '  Operating System: Ubuntu 24.04 LTS', '            Kernel: Linux 6.8.0-45-generic');
        break;
      case 'uname': out.push(a[0] === '-a' ? 'Linux ' + os.hostname + ' 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux' : 'Linux'); break;
      case 'date': out.push(new Date().toString().split(' (')[0]); break;
      case 'uptime': out.push(' ' + new Date().toTimeString().slice(0, 8) + ' up ' + Math.max(1, Math.round((Date.now() - os.boot) / 60000)) + ' min,  1 user,  load average: 0.08, 0.12, 0.10'); break;
      case 'pwd': out.push('/home/admin'); break;
      case 'ls': out.push(a[0] === '/var/log' ? 'apt  journal  nginx  syslog  auth.log' : 'notas.txt  scripts'); break;
      case 'cat':
        if (a[0] === '/etc/hostname') out.push(os.hostname);
        else if (a[0] === 'notas.txt') out.push('gateway da rede: 10.0.1.1', 'meu IP planejado: ' + d.ip + '/24');
        else out.push('cat: ' + esc(a[0] || '') + ': Arquivo ou diretório inexistente');
        break;
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
          if (st === 'failed') out.push('<span class="m">     ' + svc + '[812]: worker process exited on signal 9</span>');
          ran.push('status:' + svc);
        } else if (verb === 'restart' || verb === 'start' || verb === 'stop') {
          if (!root) { deny('Failed to ' + verb + ' ' + svc + '.service: Access denied'); break; }
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

  // Switch CLI with abbreviations (sh int status, conf t, int gi0/3, no shut).
  const kw = (tok, word, min) => !!tok && tok.length >= (min || 2) && word.indexOf(tok.toLowerCase()) === 0;
  function swcli(d, line, ctx) {
    const s = d.sw, out = [], ran = [];
    const t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    const bad = (msg) => { out.push('<span class="w">% ' + msg + '</span>'); ran.push('error'); };
    const c = t[0].toLowerCase();
    if (c === 'help' || c === '?') {
      out.push('modo atual: ' + { user: 'usuário (>)', priv: 'privilegiado (#)', conf: 'configuração (config)', if: 'interface (config-if)' }[s.mode]);
      out.push('  enable · show interfaces status · configure terminal', '  interface gi0/N · shutdown · no shutdown · end · exit');
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
        if (s.fixed) ran.push('show-int-ok');
        return { out, ran };
      }
      if (kw(t[1], 'running-config')) {
        if (s.mode === 'user') { bad('Use "enable" antes.'); return { out, ran }; }
        out.push('hostname ' + d.name, '!', 'interface vlan10', ' ip address ' + d.ip + ' 255.255.255.0', '!', 'end');
        return { out, ran };
      }
      bad('Comando incompleto. Tente: show interfaces status');
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
      const p = (t.slice(1).join('') || '').toLowerCase().replace('gigabitethernet', 'gi');
      if (!s.ports[p]) { bad('Porta inválida. Portas: gi0/1 a gi0/24'); return { out, ran }; }
      s.mode = 'if';
      s.cur = p;
      ran.push('if:' + p);
      return { out, ran };
    }
    if (kw(c, 'shutdown', 4) || (c === 'no' && kw(t[1], 'shutdown', 4))) {
      if (s.mode !== 'if') { bad('Selecione uma porta antes (interface gi0/N).'); return { out, ran }; }
      const no = c === 'no', p = s.cur;
      if (!no) { s.ports[p] = 'disabled'; s.shut = p; out.push('%LINK-5-CHANGED: Interface ' + p.replace('gi', 'Gi') + ', changed state to administratively down'); }
      else {
        const wasShut = s.ports[p] === 'disabled';
        if (p === s.bad && !wasShut) { out.push('<span class="m">(a porta continua err-disabled: primeiro "shutdown", depois "no shutdown")</span>'); return { out, ran }; }
        s.ports[p] = s.linked && s.linked.has(p) ? 'connected' : 'notconnect';
        out.push('%LINK-3-UPDOWN: Interface ' + p.replace('gi', 'Gi') + ', changed state to up');
        if (p === s.bad) s.fixed = true;
      }
      ran.push(no ? 'noshut' : 'shut');
      return { out, ran };
    }
    if (kw(c, 'ping')) {
      out.push(ctx.reach(d, t[1] || '').ok ? '!!!!!\nSuccess rate is 100 percent (5/5)' : '.....\nSuccess rate is 0 percent (0/5)');
      return { out, ran };
    }
    bad('Comando desconhecido: "' + c + '". Digite help ou use Precisa de ajuda?');
    ran.push('unknown');
    return { out, ran };
  }

  /* ------------------------------------------------------------------ */
  /* Terminal UI                                                         */
  /* ------------------------------------------------------------------ */
  DL.createTerminal = function (game) {
    const $ = (id) => document.getElementById(id);
    const el = {
      root: $('terminal'), out: $('termOut'), input: $('termIn'), prompt: $('termPrompt'), title: $('termTitle'), where: $('termWhere'),
      close: $('termClose'), task: $('termTask'), goal: $('termGoal'), steps: $('termSteps'), helpBtn: $('termHelpBtn'), help: $('termHelp'), side: $('termSide'),
    };
    const X = { open: false, dev: null, lesson: null, ran: new Set(), history: [], hi: -1, misses: 0, step: 0, onDone: null, helpOpen: false };

    const promptOf = (d) => {
      if (d.kind === 'switch') return d.name + ({ user: '>', priv: '#', conf: '(config)#', if: '(config-if)#' }[d.sw.mode]);
      return 'admin@' + d.os.hostname + ':~$';
    };

    function print(lines, cls) {
      const frag = document.createDocumentFragment();
      for (const l of lines) {
        const div = document.createElement('div');
        if (cls) div.className = cls;
        div.innerHTML = l === '' ? '&nbsp;' : l;
        frag.appendChild(div);
      }
      el.out.appendChild(frag);
      el.out.scrollTop = el.out.scrollHeight;
    }

    function curStep() {
      if (!X.lesson) return -1;
      const s = X.lesson.steps;
      for (let i = 0; i < s.length; i++) if (!s[i].done(X.dev, X.ran)) return i;
      return s.length;
    }

    function renderSide() {
      if (!X.lesson) {
        el.task.textContent = 'Console livre';
        el.goal.textContent = 'Nenhuma tarefa aberta neste equipamento. Explore à vontade — digite help.';
        el.steps.innerHTML = '';
        el.helpBtn.hidden = false;
        return;
      }
      const i = curStep();
      el.task.textContent = X.lesson.title;
      el.goal.textContent = X.lesson.goal;
      el.steps.innerHTML = X.lesson.steps.map((s, k) =>
        '<li class="' + (k < i ? 'is-done' : k === i ? 'is-current' : '') + '"><span class="term__chk">' + (k < i ? '✓' : k + 1) + '</span><span>' + esc(s.text) +
        (k === i && s.action === 'cabling' ? '<button type="button" class="btn btn--sm btn--primary term__act" data-term-act="cabling">Abrir cabeamento do rack</button>' : '') + '</span></li>').join('');
      el.helpBtn.classList.toggle('is-guide', X.misses >= 2 && !X.helpOpen);
    }

    function helpCard(keys) {
      return keys.map((k) => {
        const h = HELP[k];
        return '<div class="hcard"><code class="hcard__cmd">' + esc(h.cmd) + '</code>' +
          '<dl><dt>Exemplo</dt><dd><code>' + esc(h.ex).replace(/\n/g, '<br>') + '</code></dd>' +
          '<dt>O que faz</dt><dd>' + esc(h.what) + '</dd><dt>Quando usar</dt><dd>' + esc(h.when) + '</dd></dl></div>';
      }).join('');
    }

    function renderHelp() {
      const i = curStep();
      const keys = X.lesson && i < X.lesson.steps.length ? X.lesson.steps[i].help : X.dev.kind === 'switch' ? ['enable', 'show-int', 'conf-t'] : ['ip-addr', 'ping', 'sudo'];
      let h = '<p class="term__hint">' + (X.lesson && i < X.lesson.steps.length ? 'Para este passo: <b>' + esc(X.lesson.steps[i].text) + '</b>' : 'Comandos mais usados aqui:') + '</p>' + helpCard(keys);
      h += '<details class="term__all"><summary>Todos os comandos</summary>' + Object.keys(HELP).filter((k) => (X.dev.kind === 'switch') === ['enable', 'show-int', 'conf-t', 'interface', 'shutdown', 'end'].includes(k))
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
      const d = X.dev;
      print(['<span class="term__p">' + esc(promptOf(d)) + '</span> ' + esc(line)]);
      if (line.trim()) X.history.push(line);
      const before = curStep();
      const r = (d.kind === 'switch' ? swcli : linux)(d, line, ctx);
      if (r.out.length) print(r.out);
      for (const e of r.ran) X.ran.add(e);
      game.onCommand && game.onCommand(d, r.ran);
      if (X.lesson) {
        const after = curStep();
        if (after > before) {
          X.misses = 0;
          if (X.helpOpen) renderHelp();
          if (after >= X.lesson.steps.length) finish();
          else print(['<span class="ok">✓ passo concluído.</span> <span class="m">Próximo: ' + esc(X.lesson.steps[after].text) + '</span>']);
        } else if (line.trim()) {
          X.misses++;
          if (X.misses === 2 && !X.helpOpen) print(['<span class="m">Travou? Clique em <b>Precisa de ajuda?</b> para ver o comando, um exemplo e quando usar.</span>']);
        }
      }
      el.prompt.textContent = promptOf(d);
      renderSide();
    }

    function finish() {
      const done = X.onDone, l = X.lesson;
      X.lesson = null;
      print(['', '<span class="ok">✓ ' + esc(l.title) + ' — concluído.</span>', '<span class="m">Pode fechar o terminal (Esc) ou continuar explorando.</span>']);
      if (done) done();
    }

    function open(dev, lessonType, onDone) {
      X.dev = dev;
      X.lesson = lessonType && LESSONS[lessonType] ? LESSONS[lessonType](dev) : null;
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
        : ['<span class="m">Ubuntu 24.04 LTS · ' + esc(dev.name) + ' · conectado pelo console do rack</span>', '<span class="m">Digite help para ver os comandos. ↑ repete comandos anteriores.</span>', '']);
      if (X.lesson) print(['<span class="ok">Tarefa:</span> ' + esc(X.lesson.goal), '<span class="m">Primeiro passo: ' + esc(X.lesson.steps[0].text) + '</span>', '']);
      el.prompt.textContent = promptOf(dev);
      toggleHelp(false);
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

    const COMPLETE = ['ip addr', 'ip link', 'ip route', 'ip link set eth0 up', 'ip addr add ', 'ip route add default via ', 'ping -c 3 ', 'systemctl status ', 'systemctl restart ', 'curl localhost', 'df -h', 'du -sh /var/log', 'journalctl --vacuum-size=200M', 'hostnamectl set-hostname ', 'enable', 'show interfaces status', 'configure terminal', 'interface gi0/', 'shutdown', 'no shutdown', 'end'];
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
        const m = COMPLETE.filter((c) => c.indexOf(body) === 0 && c !== body);
        if (m.length === 1) el.input.value = pre + m[0];
        else if (m.length > 1) print(['<span class="m">' + m.map(esc).join('   ') + '</span>']);
      } else if (ev.key === 'l' && ev.ctrlKey) { ev.preventDefault(); ctx.clear(); }
      ev.stopPropagation();
    });
    el.close.addEventListener('click', close);
    el.steps.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-term-act="cabling"]')) return;
      const d = X.dev;
      close();
      game.openCabling(d);
    });
    el.helpBtn.addEventListener('click', () => { toggleHelp(); el.input.focus({ preventScroll: true }); });
    el.help.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-help]');
      if (!b) return;
      el.help.querySelector('[data-help-out]').innerHTML = helpCard([b.dataset.help]);
    });
    el.out.addEventListener('click', () => el.input.focus({ preventScroll: true }));
    el.root.addEventListener('pointerdown', (ev) => { if (ev.target === el.root) close(); });

    return {
      open, close,
      get isOpen() { return X.open; },
      get device() { return X.dev; },
      get lesson() { return X.lesson; },
      get step() { return curStep(); },
      refresh() { if (X.open) { renderSide(); if (X.lesson && curStep() >= X.lesson.steps.length) finish(); } },
      run,
    };
  };
})();
