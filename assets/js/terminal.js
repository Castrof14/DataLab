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
    // switch: VLANs (Sênior)
    'show-vlan': { cmd: 'show vlan brief', ex: 'show vlan brief', what: 'Lista as VLANs do switch e as portas de acesso de cada uma. A VLAN 10 é a do datacenter (gateway e servidores).', when: 'Para ver em que VLAN cada porta está, ou se uma VLAN existe.' },
    'sw-vlan': { cmd: 'vlan <N>  →  name <NOME>', ex: 'vlan 30\nname CAMERAS', what: 'Cria a VLAN N (no modo config) e entra nela (config-vlan); name dá o nome. exit volta.', when: 'Para separar a rede em pedaços isolados: câmeras, visitantes, gerência…' },
    'sw-access': { cmd: 'switchport access vlan <N>', ex: 'interface gi0/20\nswitchport access vlan 30', what: 'Na porta (config-if), coloca a porta de acesso na VLAN N. O aparelho ligado nela passa a falar só com essa VLAN.', when: 'Ao dedicar portas a uma VLAN, ou para devolver um servidor à VLAN 10.' },
    'sw-mode': { cmd: 'switchport mode access|trunk', ex: 'switchport mode access', what: 'access: a porta leva uma VLAN só (servidores, PCs, câmeras). trunk: leva várias VLANs marcadas (ligação entre switches).', when: 'Servidor ligado em porta trunk perde a rede: porta de servidor é access.' },
    'sw-trunk': { cmd: 'switchport trunk allowed vlan <lista>', ex: 'interface gi0/24\nswitchport mode trunk\nswitchport trunk allowed vlan 10,30', what: 'Na porta trunk, escolhe quais VLANs passam por ela (add <N> acrescenta uma).', when: 'Na ligação entre dois switches, para levar só as VLANs que o outro lado precisa.' },
    'show-trunk': { cmd: 'show interfaces trunk', ex: 'show interfaces trunk', what: 'Mostra as portas em modo trunk e as VLANs que cada uma leva.', when: 'Para conferir uma ligação entre switches.' },
    'show-mac': { cmd: 'show mac address-table', ex: 'show mac address-table', what: 'A tabela de MACs: qual endereço físico (MAC) o switch aprendeu em cada porta. O MAC aparece como 5254.0001.1100.', when: 'Para achar em que porta está um aparelho quando só se sabe o MAC dele (ip link mostra o MAC no servidor).' },
    // Linux: firewall, accounts, files, packages, backup (Sênior)
    'ufw-status': { cmd: 'sudo ufw status', ex: 'sudo ufw status', what: 'Mostra se o firewall está ativo e as regras (o que entra e o que é bloqueado).', when: 'Antes e depois de mexer no firewall.' },
    'ufw-allow': { cmd: 'sudo ufw allow <porta>', ex: 'sudo ufw allow 22\nsudo ufw allow 80', what: 'Libera a entrada numa porta (22 SSH, 80 HTTP, 443 HTTPS; ou os nomes ssh, http, https).', when: 'Antes de ligar o firewall, libere a 22: senão quem está no SSH perde o acesso.' },
    'ufw-enable': { cmd: 'sudo ufw enable', ex: 'sudo ufw enable', what: 'Liga o firewall: tudo que entra é bloqueado, menos o que tiver regra allow.', when: 'Depois de liberar as portas que o servidor precisa.' },
    'ufw-deny': { cmd: 'sudo ufw deny from <ip>', ex: 'sudo ufw deny from 203.0.113.7', what: 'Bloqueia tudo que vem de um IP.', when: 'Para cortar um atacante que você achou nos logs.' },
    'ls-l': { cmd: 'ls -l <pasta ou arquivo>', ex: 'ls -l /etc/app', what: 'Lista com detalhes: permissões (rwx de dono, grupo e outros), dono, grupo e tamanho.', when: 'Para ver quem pode ler ou alterar um arquivo.' },
    chmod: { cmd: 'sudo chmod <modo> <arquivo>', ex: 'sudo chmod 640 /etc/app/config.env', what: 'Troca as permissões. Cada dígito é dono/grupo/outros: 4 ler + 2 escrever + 1 executar. 640 = dono lê e escreve, grupo lê, outros nada.', when: 'Arquivo com senha nunca fica legível para "outros".' },
    chown: { cmd: 'sudo chown <usuário>:<grupo> <arquivo>', ex: 'sudo chown root:app /etc/app/config.env', what: 'Troca o dono e o grupo de um arquivo.', when: 'Para que só o grupo da aplicação leia o arquivo dela.' },
    useradd: { cmd: 'sudo useradd -m -s /bin/bash [-G grupo] <nome>', ex: 'sudo useradd -m -s /bin/bash rafael', what: 'Cria uma conta: -m cria a pasta pessoal, -s escolhe o shell, -G já põe em grupos.', when: 'Quando alguém novo precisa entrar no servidor.' },
    usermod: { cmd: 'sudo usermod -aG <grupo> <usuário>', ex: 'sudo usermod -aG deploy rafael', what: 'Acrescenta a pessoa a um grupo (-a junto com -G: sem o -a, ela sai dos outros grupos).', when: 'Para dar acesso por grupo, nunca arquivo a arquivo.' },
    'passwd-l': { cmd: 'sudo passwd -l <usuário>', ex: 'sudo passwd -l estagio', what: 'Bloqueia a senha da conta (ninguém entra com ela). passwd -S mostra o estado: L = bloqueada.', when: 'Conta vazada ou de quem saiu: bloqueie na hora.' },
    id: { cmd: 'id <usuário>', ex: 'id rafael', what: 'Mostra o número (uid) e os grupos de uma conta.', when: 'Para conferir se a pessoa está nos grupos certos.' },
    'apt-update': { cmd: 'sudo apt update', ex: 'sudo apt update\napt list --upgradable', what: 'Baixa a lista de versões novas dos pacotes. apt list --upgradable mostra o que pode ser atualizado.', when: 'Sempre antes de atualizar ou instalar.' },
    'apt-upgrade': { cmd: 'sudo apt upgrade -y', ex: 'sudo apt upgrade -y', what: 'Instala as versões novas dos pacotes. Serviços atualizados (como o nginx) só usam a versão nova depois de reiniciar.', when: 'Para aplicar correções de segurança.' },
    'apt-install': { cmd: 'sudo apt install -y <pacote>', ex: 'sudo apt install -y fail2ban', what: 'Instala um pacote (e o serviço dele, se tiver).', when: 'Para acrescentar uma ferramenta ao servidor.' },
    tar: { cmd: 'sudo tar czf <arquivo.tar.gz> <pasta>', ex: 'sudo tar czf /backup/etc.tar.gz /etc', what: 'Junta e comprime uma pasta num arquivo só (c criar, z comprimir, f arquivo). tar tzf lista o que tem dentro.', when: 'Para fazer backup de configurações antes de mexer.' },
    rsync: { cmd: 'rsync -a <origem>/ <usuário>@<ip>:<pasta>/', ex: 'rsync -a /var/www/ backup@10.0.1.12:/srv/backup/www/', what: 'Copia uma pasta para outro servidor pela rede, mandando só o que mudou (-a mantém permissões e datas).', when: 'Para manter uma cópia do site ou dos dados em outro servidor.' },
    crontab: { cmd: 'crontab -l  ·  echo "<linha>" | crontab -', ex: 'crontab -l\necho "0 2 * * * /usr/local/bin/backup.sh" | crontab -', what: 'O agendador: cada linha é minuto, hora, dia, mês, dia-da-semana e o comando (* = todos). crontab -l mostra; o echo | crontab - grava.', when: 'Para rodar um backup todo dia sem ninguém lembrar.' },
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
  // someone logged in with a password from outside the company (a leaked account)
  DL.authLeak = function (d, user, ip) {
    ip = ip || '198.51.100.' + rint(10, 250);
    authLog(d).push(stamp(30) + ' ' + d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: Accepted password for ' + user + ' from ' + ip + ' port ' + rint(40000, 60000) + ' ssh2',
      stamp(30) + ' ' + d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user ' + user + '(uid=1003) by (uid=0)');
    d.os.leakIp = ip;
    return ip;
  };

  /* ------------------------------------------------------------------ */
  /* The rest of a Linux server (Sênior problems): firewall, accounts,   */
  /* files with owner and mode, packages, cron. Created on first use and */
  /* not saved — a loaded game brings a clean server back and the open   */
  /* problem sets itself up again.                                       */
  /* ------------------------------------------------------------------ */
  const dirE = (owner, group) => ({ dir: true, mode: '755', owner: owner || 'root', group: group || owner || 'root' });
  function sysOf(d) {
    const os = d.os;
    if (!os.fw) os.fw = { on: false, rules: [] };
    if (!os.users) os.users = { root: { uid: 0, groups: ['root'] }, admin: { uid: 1000, groups: ['admin', 'adm', 'sudo'] } };
    if (!os.groups) os.groups = { root: 0, adm: 4, sudo: 27, 'www-data': 33, admin: 1000, deploy: 1001, app: 1002 };
    if (!os.files) {
      os.files = {
        '/etc': dirE(), '/etc/app': dirE(), '/backup': dirE(), '/usr/local/bin': dirE(), '/var/www': dirE(), '/var/www/html': dirE('www-data'), '/home/admin': dirE('admin'),
        '/etc/hostname': { mode: '644', owner: 'root', group: 'root', size: 12 },
        '/etc/app/config.env': { mode: '640', owner: 'root', group: 'app', size: 182, text: ['DB_HOST=10.0.1.20', 'DB_USER=app', 'DB_PASSWORD=Pr0d#Datalab2026'] },
        '/usr/local/bin/backup.sh': { mode: '755', owner: 'root', group: 'root', size: 412, text: ['#!/bin/bash', '# backup diário do /etc', 'tar czf /backup/etc-$(date +%F).tar.gz /etc'] },
        '/var/www/html/index.html': { mode: '644', owner: 'www-data', group: 'www-data', size: 615 },
        '/home/admin/notas.txt': { mode: '644', owner: 'admin', group: 'admin', size: 64 },
      };
    }
    if (!os.pkgs) os.pkgs = { nginx: '1.24.0-2ubuntu7', 'openssh-server': '1:9.6p1-3ubuntu13', openssl: '3.0.13-0ubuntu3', rsync: '3.2.7-1ubuntu1', tar: '1.35+dfsg-3', ufw: '0.36.2-6', cron: '3.0pl1-184ubuntu2' };
    if (!os.updates) os.updates = [];
    if (!os.cron) os.cron = [];
    return os;
  }
  DL.linuxSys = sysOf;
  // the firewall lets this port in (off = everything passes)
  const fwAllows = (os, port) => !os.fw || !os.fw.on || os.fw.rules.some((r) => r.act === 'allow' && String(r.port) === String(port));
  DL.fwAllows = fwAllows;
  const PORT_NAMES = { ssh: '22', http: '80', https: '443' };
  const parentDir = (p) => p.replace(/\/[^/]+\/?$/, '') || '/';
  const permStr = (f) => (f.dir ? 'd' : '-') + f.mode.split('').map((n) => ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'][+n]).join('');
  // can this user read / write it (root can always)
  const can = (os, f, user, bit) => {
    if (user === 'root') return true;
    const u = os.users[user] || { groups: [] }, m = f.mode.split('').map(Number);
    const who = f.owner === user ? m[0] : u.groups.indexOf(f.group) >= 0 ? m[1] : m[2];
    return (who & bit) === bit;
  };
  // a cron line: five time fields (minute 0-59, hour 0-23, day 1-31, month 1-12, weekday 0-7) and a command
  const CRON_MAX = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  // the first field that is wrong, the way cron names it (null: the line is fine)
  const cronBad = (l) => {
    const f = String(l).trim().split(/\s+/), names = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];
    for (let i = 0; i < 5; i++) {
      const x = f[i] || '';
      if (!/^(\*|\d+(-\d+)?)(\/\d+)?(,\d+)*$/.test(x) || !(x.match(/\d+/g) || []).filter((n, k, all) => !/\//.test(x) || k < all.length - 1).every((n) => +n >= CRON_MAX[i][0] && +n <= CRON_MAX[i][1])) return names[i];
    }
    return f.length >= 6 ? null : 'command';
  };
  const cronOk = (l) => !cronBad(l);

  // what a career problem sets up on a Linux server (problems.js: setup.linux) · ctx.vars: what a save kept
  const LSETUP = {
    // a leaked account logged in from outside
    leak: (d, c) => { const os = sysOf(d); os.users.estagio = { uid: 1003, groups: ['estagio'], locked: false }; DL.authLeak(d, 'estagio', c.vars.leak); },
    // three security updates waiting
    updates: (d) => { const os = sysOf(d); os.aptFresh = false; os.updates = [{ pkg: 'openssl', to: '3.0.13-0ubuntu3.4' }, { pkg: 'nginx', to: '1.24.0-2ubuntu7.1' }, { pkg: 'openssh-server', to: '1:9.6p1-3ubuntu13.5' }]; },
    // the app's password file readable by everyone
    openfile: (d) => { const f = sysOf(d).files['/etc/app/config.env']; Object.assign(f, { mode: '644', owner: 'root', group: 'root' }); },
    // the new developer has no account yet
    nouser: (d) => { delete sysOf(d).users.rafael; },
    nofail2ban: (d) => { delete sysOf(d).pkgs.fail2ban; delete d.os.services.fail2ban; },
    fwoff: (d) => { sysOf(d).fw = { on: false, rules: [] }; },
    // the firewall already on, letting SSH and the site in
    fwweb: (d) => { sysOf(d).fw = { on: true, rules: [{ act: 'allow', port: '22' }, { act: 'allow', port: '80' }] }; },
    nocron: (d) => { sysOf(d).cron = []; },
    // the backup scheduled with the wrong script name: cron runs it and fails every night
    cronbroken: (d) => {
      const os = sysOf(d);
      os.cron = ['0 3 * * * /usr/local/bin/bkp.sh'];
      for (const ago of [1300, 2740]) {
        DL.syslogAdd(d, ago, 'CRON[' + rint(2000, 9000) + ']: (admin) CMD (/usr/local/bin/bkp.sh)');
        DL.syslogAdd(d, ago - 0.1, 'CRON[' + rint(2000, 9000) + ']: (CRON) info (No MTA installed, discarding output: /bin/sh: 1: /usr/local/bin/bkp.sh: not found)');
      }
    },
    // no archive in /backup yet
    nobackup: (d) => { const os = sysOf(d); for (const k of Object.keys(os.files)) if (k.indexOf('/backup/') === 0) delete os.files[k]; },
  };
  DL.linuxSetup = function (d, name, ctx) {
    if (!d.os || (DL.isWin && DL.isWin(d))) return false;
    for (const n of [].concat(name)) if (LSETUP[n]) LSETUP[n](d, ctx || { vars: {} });
    return true;
  };

  const LOGS = { '/var/log/auth.log': authLog, '/var/log/syslog': syslog };
  // the lines of a file (null: no such file)
  const fileLines = (d, f) => (LOGS[f] ? LOGS[f](d) : f === '/etc/hostname' ? [d.os.hostname] : f === 'notas.txt' || f === '/home/admin/notas.txt' ? ['gateway da rede: 10.0.1.1', 'meu IP planejado: ' + d.ip + '/24']
    : d.os.files && d.os.files[f] && !d.os.files[f].dir ? d.os.files[f].text || [] : null);
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
  // "comando | grep texto" · 'echo "linha" | crontab -' (installs that line as the crontab)
  function pipe(d, left, right, ctx) {
    const w = words(right.trim());
    if (w[0] === 'sudo') w.shift();
    if (w[0] === 'crontab' && w[1] === '-') {
      const l = words(left.trim());
      if (l[0] !== 'echo') return { out: ['<span class="m">aqui o crontab - aceita só uma linha vinda do echo: echo "0 2 * * * /usr/local/bin/backup.sh" | crontab -</span>'], ran: ['error'] };
      const line = l.slice(1).join(' ');
      if (!cronOk(line)) return { out: ['"-":1: bad ' + cronBad(line), 'errors in crontab file, can\'t install.', '<span class="m">formato: minuto hora dia mês dia-da-semana comando — ex.: 0 2 * * * /usr/local/bin/backup.sh</span>'], ran: ['error'] };
      sysOf(d).cron = [line];
      return { out: [], ran: ['cron-set'] };
    }
    const r = linux(d, left, ctx);
    if (r.ran.indexOf('error') >= 0 || r.ran.indexOf('unknown') >= 0) return r;
    if (w[0] !== 'grep') return { out: ['<span class="m">aqui o | só funciona com grep depois (comando | grep "texto") ou com crontab - (echo "linha" | crontab -)</span>'], ran: r.ran.concat('error') };
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
          out.push('comandos disponíveis:', '  ip addr | ip link | ip route     ping -c 3 <destino>', '  systemctl status|restart <serviço>   curl localhost', '  df -h   du -sh <pasta>   journalctl --vacuum-size=200M', '  hostname   hostnamectl set-hostname <nome>', '  uptime  whoami  uname -a  date  history  clear  exit', '  lscpu  nproc  free -h   (hardware do servidor)', '  tail -n 20 <arquivo>   grep "<texto>" <arquivo>   cat <arquivo>   (logs em /var/log)', '  ss -tlnp   (portas em escuta)', '  ufw status|enable|allow <porta>|deny from <ip>   (firewall)',
            '  ls -l <pasta>  chmod <modo> <arquivo>  chown <usuário>:<grupo> <arquivo>', '  useradd  usermod -aG  passwd -l  id <usuário>   (contas)',
            '  apt update | apt list --upgradable | apt upgrade | apt install <pacote>', '  tar czf <arquivo> <pasta>  rsync -a <origem> <destino>  crontab -l  echo "linha" | crontab -',
            '  sudo <comando> executa como administrador', 'detalhes: help <comando>  ·  ou o botão Precisa de ajuda?');
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
      case 'ls': {
        // ls [-l] [caminho]: the folders of the model (sysOf) in detail; the logs and the home folder as before
        const fs = sysOf(d).files, long = a.some((x) => /^-\w*l/.test(x)), p = (a.find((x) => !/^-/.test(x)) || '/home/admin').replace(/(.)\/$/, '$1');
        if (p === '/var/log') { out.push('apt  journal  nginx  syslog  auth.log'); ran.push('ls:' + p); break; }
        const f = fs[p];
        if (!f) { out.push("ls: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        const kids = f.dir ? Object.keys(fs).filter((k) => k !== p && parentDir(k) === p).sort() : [p];
        const name = (k) => k.split('/').pop();
        if (!long) out.push(kids.map(name).join('  ') || '');
        else {
          if (f.dir) out.push('total ' + kids.length * 4);
          for (const k of kids) { const x = fs[k]; out.push(permStr(x) + ' 1 ' + x.owner.padEnd(8) + ' ' + x.group.padEnd(8) + ' ' + String(x.dir ? 4096 : x.size || 0).padStart(6) + ' Oct 30 09:12 ' + esc(f.dir ? name(k) : k)); }
        }
        ran.push('ls:' + p);
        if (long) ran.push('ls-l:' + p);
        break;
      }
      case 'cat': {
        const fx = sysOf(d).files[a[0]];
        if (fx && !fx.dir && !can(os, fx, root ? 'root' : 'admin', 4)) { out.push('cat: ' + esc(a[0]) + ': Permission denied', '<span class="m">(ls -l mostra quem pode ler; como administrador, sudo cat lê mesmo assim)</span>'); ran.push('error'); break; }
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
          out.push('● ' + svc + '.service - ' + ({ nginx: 'A high performance web server', ssh: 'OpenBSD Secure Shell server', fail2ban: 'Fail2Ban Service' }[svc] || svc));
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
          // an nginx updated by apt only runs the new version after a restart
          if (svc === 'nginx' && verb !== 'stop') os.nginxStale = false;
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
      case 'echo': out.push(esc(words(line.trim().replace(/^sudo\s+/, '')).slice(1).join(' '))); break;
      case 'chmod': {
        // numeric modes only (640, 755…)
        const fs = sysOf(d).files, m = a.find((x) => /^[0-7]{3}$/.test(x)), p = a[a.length - 1], f = fs[p];
        if (!m || a.length < 2) { out.push('uso: chmod <modo> <arquivo>   (ex.: chmod 640 /etc/app/config.env)'); ran.push('error'); break; }
        if (!f) { out.push("chmod: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        if (!root && f.owner !== 'admin') { deny("chmod: changing permissions of '" + esc(p) + "': Operation not permitted"); break; }
        f.mode = m;
        ran.push('chmod:' + p);
        break;
      }
      case 'chown': {
        const fs = sysOf(d).files, spec = a[0] || '', p = a[1], f = fs[p];
        const [u, g] = spec.split(':');
        if (!spec || !p) { out.push('uso: chown <usuário>[:<grupo>] <arquivo>'); ran.push('error'); break; }
        if (!f) { out.push("chown: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        if (!root) { deny("chown: changing ownership of '" + esc(p) + "': Operation not permitted"); break; }
        if (u && !os.users[u]) { out.push("chown: invalid user: '" + esc(spec) + "'"); ran.push('error'); break; }
        if (g && os.groups[g] == null) { out.push("chown: invalid group: '" + esc(spec) + "'"); ran.push('error'); break; }
        if (u) f.owner = u;
        if (g) f.group = g;
        ran.push('chown:' + p);
        break;
      }
      case 'id': case 'groups': {
        const sys = sysOf(d), u = a[0] || (root ? 'root' : 'admin'), x = sys.users[u];
        if (!x) { out.push(c + ": '" + esc(u) + "': no such user"); ran.push('error'); break; }
        const gid = (g) => (sys.groups[g] != null ? sys.groups[g] : x.uid);
        out.push(c === 'groups' ? u + ' : ' + x.groups.join(' ') : 'uid=' + x.uid + '(' + u + ') gid=' + gid(x.groups[0]) + '(' + x.groups[0] + ') groups=' + x.groups.map((g) => gid(g) + '(' + g + ')').join(','));
        ran.push('id:' + u);
        break;
      }
      case 'useradd': {
        // useradd [-m] [-s shell] [-G g1,g2] <nome>
        const sys = sysOf(d), gi = a.indexOf('-G'), name = a.filter((x, i) => !/^-/.test(x) && !/^-(s|G)$/.test(a[i - 1] || '')).pop();
        if (!name) { out.push('uso: useradd -m -s /bin/bash [-G grupo] <nome>'); ran.push('error'); break; }
        if (!root) { deny('useradd: Permission denied.'); break; }
        if (sys.users[name]) { out.push("useradd: user '" + esc(name) + "' already exists"); ran.push('error'); break; }
        const extra = gi >= 0 && a[gi + 1] ? a[gi + 1].split(',') : [];
        const badG = extra.find((g) => sys.groups[g] == null);
        if (badG) { out.push("useradd: group '" + esc(badG) + "' does not exist"); ran.push('error'); break; }
        // the next free number for both the account and its own group
        const uid = Math.max(1000, ...Object.values(sys.users).map((x) => x.uid), ...Object.values(sys.groups)) + 1;
        sys.groups[name] = uid;
        sys.users[name] = { uid, groups: [name].concat(extra), locked: false };
        if (a.indexOf('-m') >= 0) sys.files['/home/' + name] = dirE(name);
        ran.push('useradd:' + name);
        break;
      }
      case 'usermod': {
        // usermod -aG <grupo> <usuário> · -L / -U (lock / unlock)
        const sys = sysOf(d), u = a[a.length - 1], x = sys.users[u], gi = a.findIndex((v) => /^-a?G$|^-aG$/.test(v));
        if (!x || a.length < 2) { out.push(x ? 'uso: usermod -aG <grupo> <usuário>' : "usermod: user '" + esc(u || '') + "' does not exist"); ran.push('error'); break; }
        if (!root) { deny('usermod: Permission denied.'); break; }
        if (a.indexOf('-L') >= 0) x.locked = true;
        else if (a.indexOf('-U') >= 0) x.locked = false;
        else if (gi >= 0) {
          const append = a[gi] === '-aG' || a.indexOf('-a') >= 0;
          if (!append) out.push('<span class="m">sem -a, o -G troca todos os grupos da pessoa. Use usermod -aG para acrescentar.</span>');
          const g = a[gi + 1];
          if (sys.groups[g] == null) { out.push("usermod: group '" + esc(g || '') + "' does not exist"); ran.push('error'); break; }
          if (!append) x.groups = [x.groups[0], g];
          else if (x.groups.indexOf(g) < 0) x.groups.push(g);
        } else { out.push('uso: usermod -aG <grupo> <usuário>'); ran.push('error'); break; }
        ran.push('usermod:' + u);
        break;
      }
      case 'passwd': {
        const sys = sysOf(d), u = a.filter((x) => !/^-/.test(x)).pop(), x = sys.users[u];
        if (a.indexOf('-S') >= 0 && x) { out.push(u + (x.locked ? ' L' : ' P') + ' 10/30/2026 0 99999 7 -1'); ran.push('passwd-status:' + u); break; }
        if (a.indexOf('-l') < 0 && a.indexOf('-u') < 0) { out.push('<span class="m">no jogo o passwd só bloqueia (-l), desbloqueia (-u) ou mostra o estado (-S) de uma conta.</span>'); ran.push('error'); break; }
        if (!x) { out.push("passwd: user '" + esc(u || '') + "' does not exist"); ran.push('error'); break; }
        if (!root) { deny('passwd: You may not view or modify password information for ' + esc(u) + '.'); break; }
        x.locked = a.indexOf('-l') >= 0;
        out.push('passwd: password changed.');
        ran.push((x.locked ? 'passwd-lock:' : 'passwd-unlock:') + u);
        break;
      }
      case 'apt': case 'apt-get': {
        const sys = sysOf(d), sub = a[0], pkgs = a.slice(1).filter((x) => !/^-/.test(x));
        const need = () => { if (!root) { deny('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)'); return false; } return true; };
        if (sub === 'update') {
          if (!need()) break;
          sys.aptFresh = true;
          out.push('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease', 'Get:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]', 'Reading package lists... Done',
            sys.updates.length ? sys.updates.length + ' packages can be upgraded. Run \'apt list --upgradable\' to see them.' : 'All packages are up to date.');
          ran.push('apt-update');
        } else if (sub === 'list' && a.indexOf('--upgradable') >= 0) {
          if (!sys.aptFresh && sys.updates.length) out.push('<span class="m">(a lista pode estar velha: rode sudo apt update antes)</span>');
          out.push('Listing... Done');
          for (const u of sys.aptFresh ? sys.updates : []) out.push(u.pkg + '/noble-security ' + u.to + ' amd64 [upgradable from: ' + (sys.pkgs[u.pkg] || '?') + ']');
          ran.push('apt-list');
        } else if (sub === 'upgrade' || sub === 'full-upgrade') {
          if (!need()) break;
          if (!sys.aptFresh) { out.push('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.', '<span class="m">nada a atualizar: o apt ainda não sabe das versões novas (sudo apt update primeiro).</span>'); ran.push('apt-upgrade'); break; }
          const n = sys.updates.length;
          for (const u of sys.updates) { sys.pkgs[u.pkg] = u.to; out.push('Setting up ' + u.pkg + ' (' + u.to + ') ...'); }
          if (sys.updates.some((u) => u.pkg === 'nginx')) { os.nginxStale = true; out.push('<span class="m">o nginx foi atualizado: a versão nova só vale depois de reiniciar o serviço.</span>'); }
          sys.updates = [];
          out.push(n + ' upgraded, 0 newly installed, 0 to remove and 0 not upgraded.');
          ran.push('apt-upgrade');
        } else if (sub === 'install') {
          if (!need()) break;
          if (!pkgs.length) { out.push('uso: sudo apt install <pacote>'); ran.push('error'); break; }
          const KNOWN = { fail2ban: '1.0.2-3ubuntu0.1', htop: '3.3.0-4build1', curl: '8.5.0-2ubuntu10.4', rsync: '3.2.7-1ubuntu1', 'postgresql-client': '16+257build1' };
          const bad = pkgs.find((x) => !KNOWN[x] && !sys.pkgs[x]);
          if (bad) { out.push('E: Unable to locate package ' + esc(bad)); ran.push('error'); break; }
          for (const x of pkgs) { sys.pkgs[x] = sys.pkgs[x] || KNOWN[x]; out.push('Setting up ' + x + ' (' + sys.pkgs[x] + ') ...'); if (x === 'fail2ban') os.services.fail2ban = 'active'; ran.push('apt-install:' + x); }
        } else { out.push('uso: sudo apt update · apt list --upgradable · sudo apt upgrade · sudo apt install <pacote>'); ran.push('error'); }
        break;
      }
      case 'ufw': {
        const sys = sysOf(d), fw = sys.fw, sub = a[0];
        if (!root) { deny('ERROR: You need to be root to run this script'); break; }
        const portOf = (x) => PORT_NAMES[x] || String(x || '').replace(/\/(tcp|udp)$/, '');
        const show = (r) => (r.from ? 'Anywhere'.padEnd(27) + (r.act === 'deny' ? 'DENY' : 'ALLOW').padEnd(12) + r.from : (r.port + '/tcp').padEnd(27) + (r.act === 'deny' ? 'DENY' : 'ALLOW').padEnd(12) + 'Anywhere');
        if (sub === 'status') {
          out.push('Status: ' + (fw.on ? 'active' : 'inactive'));
          if (fw.on && fw.rules.length) out.push('', 'To                         Action      From', '--                         ------      ----', ...fw.rules.map(show));
          ran.push('ufw-status');
        } else if (sub === 'enable') {
          if (!fwAllows({ fw: { on: true, rules: fw.rules } }, 22)) {
            out.push('Command may disrupt existing ssh connections. Proceed with operation (y|n)? y');
            out.push('<span class="w">A porta 22 não foi liberada: numa sessão SSH você teria acabado de se trancar para fora do servidor. Aqui você está no console do rack, então ainda dá para corrigir: sudo ufw allow 22.</span>');
            ran.push('ufw-lockout');
          }
          fw.on = true;
          out.push('Firewall is active and enabled on system startup');
          ran.push('ufw-on');
        } else if (sub === 'disable') { fw.on = false; out.push('Firewall stopped and disabled on system startup'); ran.push('ufw-off'); }
        else if (sub === 'allow' || sub === 'deny') {
          // ufw allow 22 · ufw allow http · ufw deny from 203.0.113.7
          const fi = a.indexOf('from'), rule = fi > 0 ? { act: sub, from: a[fi + 1] } : { act: sub, port: portOf(a[1]) };
          if ((fi > 0 && !/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(rule.from || '')) || (fi < 0 && !/^\d+$/.test(rule.port))) { out.push('ERROR: Wrong number of arguments'); out.push('<span class="m">uso: sudo ufw allow 22 · sudo ufw allow http · sudo ufw deny from 203.0.113.7</span>'); ran.push('error'); break; }
          if (!fw.rules.some((r) => r.act === rule.act && r.port === rule.port && r.from === rule.from)) fw.rules.push(rule);
          out.push(fw.on ? 'Rule added' : 'Rules updated');
          ran.push('ufw-rule');
        } else if (sub === 'delete' && (a[1] === 'allow' || a[1] === 'deny')) {
          const fi = a.indexOf('from'), port = portOf(a[2]), n = fw.rules.length;
          fw.rules = fw.rules.filter((r) => !(r.act === a[1] && (fi > 0 ? r.from === a[fi + 1] : r.port === port)));
          out.push(fw.rules.length < n ? 'Rule deleted' : 'Could not delete non-existent rule');
          ran.push('ufw-rule');
        } else { out.push('uso: sudo ufw status · enable · disable · allow <porta> · deny from <ip> · delete allow <porta>'); ran.push('error'); }
        break;
      }
      case 'tar': {
        // tar czf <arquivo> <pasta> · tar tzf <arquivo>
        const sys = sysOf(d), fl = (a[0] || '').replace(/^-/, ''), arch = a[1], src = a[2];
        if (!/[ctx]/.test(fl) || fl.indexOf('f') < 0 || !arch) { out.push('uso: tar czf <arquivo.tar.gz> <pasta>   ·   tar tzf <arquivo.tar.gz>'); ran.push('error'); break; }
        if (fl.indexOf('c') >= 0) {
          if (!src || !sys.files[src.replace(/(.)\/$/, '$1')]) { out.push('tar: ' + esc(src || '') + ': Cannot stat: No such file or directory'); ran.push('error'); break; }
          const dir = sys.files[parentDir(arch)];
          if (!dir || !dir.dir) { out.push('tar (child): ' + esc(arch) + ': Cannot open: No such file or directory'); ran.push('error'); break; }
          if (!root && !can(sys, dir, 'admin', 2)) { deny('tar (child): ' + esc(arch) + ': Cannot open: Permission denied'); break; }
          out.push('tar: Removing leading `/\' from member names');
          sys.files[arch] = { mode: '644', owner: root ? 'root' : 'admin', group: root ? 'root' : 'admin', size: 180000 + rint(0, 90000), from: src.replace(/(.)\/$/, '$1') };
          ran.push('tar:' + sys.files[arch].from);
        } else if (fl.indexOf('t') >= 0) {
          const f = sys.files[arch];
          if (!f || !f.from) { out.push('tar: ' + esc(arch) + ': Cannot open: No such file or directory'); ran.push('error'); break; }
          const base = f.from.replace(/^\//, '');
          out.push(base + '/', base + '/hostname', base + '/app/', base + '/app/config.env', base + '/nginx/nginx.conf');
          ran.push('tar-list:' + arch);
        } else { out.push('<span class="m">extrair (x) fica para mais adiante: aqui use c (criar) ou t (listar).</span>'); ran.push('error'); }
        break;
      }
      case 'rsync': {
        // rsync -a <origem> <destino>   (destino remoto: usuário@ip:/pasta)
        const args = a.filter((x) => !/^-/.test(x)), src = args[0], dest = args[1];
        if (!src || !dest) { out.push('uso: rsync -a <origem>/ <usuário>@<ip>:<pasta>/'); ran.push('error'); break; }
        const m = /^(?:[\w.-]+@)?(\d+\.\d+\.\d+\.\d+):(.+)$/.exec(dest);
        if (!m) { out.push('sending incremental file list', '', 'sent 1,204 bytes  received 35 bytes  2,478.00 bytes/sec'); ran.push('rsync-local'); break; }
        const r = ctx.reach(d, m[1]);
        if (!r.ok) { out.push('ssh: connect to host ' + esc(m[1]) + ' port 22: No route to host', 'rsync: connection unexpectedly closed (0 bytes received so far) [sender]'); ran.push('error'); break; }
        out.push('sending incremental file list', './', 'index.html', 'assets/app.css', '', 'sent 48,210 bytes  received 92 bytes  32,201.33 bytes/sec', 'total size is 47,804  speedup is 0.99');
        ran.push('rsync-ok:' + m[1]);
        break;
      }
      case 'crontab': {
        const sys = sysOf(d);
        if (a[0] === '-l') { if (sys.cron.length) for (const l of sys.cron) out.push(esc(l)); else out.push('no crontab for ' + (root ? 'root' : 'admin')); ran.push('cron-list'); }
        else if (a[0] === '-r') { sys.cron = []; ran.push('cron-set'); }
        else { out.push('<span class="m">no jogo o editor do crontab não abre. Para ver: crontab -l · para gravar uma linha: echo "0 2 * * * /usr/local/bin/backup.sh" | crontab -</span>'); ran.push('error'); }
        break;
      }
      default:
        out.push(esc(c) + ': comando não encontrado');
        ran.push('error', 'unknown');
    }
    return { out, ran };
  }

  // VLANs of a switch (created on first use): names · the access VLAN of each port (10, the datacenter's, by
  // default) · ports in trunk mode and the VLANs they carry. A server's port must be an access port in VLAN 10
  // (where the gateway is) for it to reach the network (ops.js)
  function vlanState(s) {
    if (!s.vlans) s.vlans = { 1: 'default', 10: 'DATACENTER' };
    if (!s.pvlan) s.pvlan = {};
    if (!s.pmode) s.pmode = {};
    if (!s.trunk) s.trunk = {};
    return s;
  }
  DL.swVlans = vlanState;
  const vlanCfg = (s) => JSON.parse(JSON.stringify({ vlans: s.vlans, pvlan: s.pvlan, pmode: s.pmode, trunk: s.trunk }));
  // Cisco writes MACs as 5254.0001.1100
  const ciscoMac = (m) => m.replace(/:/g, '').replace(/(.{4})(?=.)/g, '$1.');

  // The switch configuration as "show running-config" prints it (one description per port with a cable).
  // saved: the startup-config — without the change made after the last save (d.sw.unsaved / unsavedPort, and the
  // VLAN setup as it was at the last copy run start)
  function swConfig(d, ctx, saved) {
    const s = vlanState(d.sw), v = saved ? s.savedCfg || { vlans: { 1: 'default', 10: 'DATACENTER' }, pvlan: {}, pmode: {}, trunk: {} } : s;
    const body = ['!', 'hostname ' + d.name, '!'];
    for (const id of Object.keys(v.vlans).filter((x) => x !== '1')) body.push('vlan ' + id, ' name ' + v.vlans[id], '!');
    for (const p of Object.keys(s.ports)) {
      const peer = ctx.peer(d, p), lines = [];
      if (peer && !(saved && s.unsaved && p === s.unsavedPort)) lines.push(' description ' + peer);
      if (v.pmode[p] === 'trunk') { lines.push(' switchport mode trunk'); if (v.trunk[p]) lines.push(' switchport trunk allowed vlan ' + v.trunk[p].join(',')); }
      else if (v.pvlan[p] && v.pvlan[p] !== 10) lines.push(' switchport access vlan ' + v.pvlan[p]);
      if (lines.length) body.push('interface GigabitEthernet' + p.slice(2), ...lines, '!');
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
    const s = vlanState(d.sw), out = [], ran = [];
    const t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    const bad = (msg) => { out.push('<span class="w">% ' + msg + '</span>'); ran.push('error'); };
    const c = t[0].toLowerCase();
    const cfg = s.mode === 'conf' || s.mode === 'if' || s.mode === 'vlan';
    if (c === 'help' || c === '?') {
      out.push('modo atual: ' + { user: 'usuário (>)', priv: 'privilegiado (#)', conf: 'configuração (config)', if: 'interface (config-if)', vlan: 'VLAN (config-vlan)' }[s.mode]);
      out.push('  enable · show interfaces status · configure terminal', '  interface gi0/N · shutdown · no shutdown · end · exit',
        '  show running-config · show startup-config · copy running-config startup-config (write memory)', '  ping <ip>',
        '  VLANs: show vlan brief · vlan <N> → name <NOME> · switchport access vlan <N> · switchport mode access|trunk',
        '         switchport trunk allowed vlan <lista> · show interfaces trunk · show mac address-table');
      return { out, ran };
    }
    if (c === 'clear') { ctx.clear(); return { out, ran }; }
    if (kw(c, 'enable')) { if (s.mode === 'user') s.mode = 'priv'; ran.push('enable'); return { out, ran }; }
    if (kw(c, 'disable', 3)) { s.mode = 'user'; return { out, ran }; }
    if (kw(c, 'exit', 3)) {
      if (s.mode === 'if' || s.mode === 'vlan') s.mode = 'conf';
      else if (s.mode === 'conf') s.mode = 'priv';
      else ctx.close();
      return { out, ran };
    }
    if (kw(c, 'end', 3)) { if (cfg) s.mode = 'priv'; s.cur = null; ran.push('end'); return { out, ran }; }
    if (kw(c, 'show')) {
      if (cfg) { bad('Comando show não existe neste modo. Use "end" primeiro.'); return { out, ran }; }
      if (s.mode === 'user' && (kw(t[1], 'vlan') || kw(t[1], 'mac-address-table', 3) || (kw(t[1], 'interfaces') && kw(t[2], 'trunk')))) { bad('Use "enable" antes.'); return { out, ran }; }
      // show vlan brief: each VLAN and its access ports
      if (kw(t[1], 'vlan')) {
        out.push('VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------');
        for (const id of Object.keys(s.vlans).map(Number).sort((x, y) => x - y)) {
          const ports = Object.keys(s.ports).filter((p) => s.pmode[p] !== 'trunk' && (s.pvlan[p] || 10) === id).map((p) => p.replace('gi', 'Gi'));
          const rows = []; for (let i = 0; i < ports.length; i += 4) rows.push(ports.slice(i, i + 4).join(', '));
          out.push(String(id).padEnd(5) + esc(s.vlans[id]).padEnd(33) + 'active    ' + (rows[0] || ''));
          for (const r of rows.slice(1)) out.push(' '.repeat(48) + r);
        }
        ran.push('show-vlan');
        return { out, ran };
      }
      // show mac address-table: the MAC each port learned (the servers whose link is up behind it)
      if (kw(t[1], 'mac-address-table', 3) || (kw(t[1], 'mac') && kw(t[2], 'address-table', 3))) {
        const D = window.DataLabDemo, ops = D && D.ops;
        out.push('          Mac Address Table', '-------------------------------------------', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----');
        for (const x of ops ? ops.devices().filter((q) => q.kind === 'server' && q.os && q.os.ifaces.eth0.up) : []) {
          const tr = x.path || ops.trace(x);
          if (tr.ok && tr.sw === d && s.ports[tr.port] === 'connected') out.push(String(s.pvlan[tr.port] || 10).padStart(4) + '    ' + ciscoMac(x.os.ifaces.eth0.mac) + '    DYNAMIC     ' + tr.port.replace('gi', 'Gi'));
        }
        ran.push('show-mac');
        return { out, ran };
      }
      if (kw(t[1], 'interfaces') && kw(t[2], 'trunk')) {
        const tp = Object.keys(s.pmode).filter((p) => s.pmode[p] === 'trunk');
        if (!tp.length) out.push('<span class="m">Nenhuma porta em modo trunk.</span>');
        else { out.push('Port        Mode         Encapsulation  Status        Native vlan'); for (const p of tp) out.push(p.replace('gi', 'Gi').padEnd(12) + 'on           802.1q         trunking      1'); out.push('', 'Port        Vlans allowed on trunk'); for (const p of tp) out.push(p.replace('gi', 'Gi').padEnd(12) + (s.trunk[p] ? s.trunk[p].join(',') : '1-4094')); }
        ran.push('show-trunk');
        return { out, ran };
      }
      if (kw(t[1], 'interfaces') && kw(t[2], 'status')) {
        if (s.mode === 'user') { bad('Comando incompleto ou sem permissão. Use "enable" antes.'); return { out, ran }; }
        out.push('Port      Name               Status         Vlan   Duplex  Speed');
        let idle = 0;
        for (const [p, st] of Object.entries(s.ports)) {
          if (st === 'notconnect') { idle++; continue; }
          const vl = s.pmode[p] === 'trunk' ? 'trunk' : String(s.pvlan[p] || 10);
          out.push((p.replace('gi', 'Gi')).padEnd(10) + (ctx.peer(d, p) || '').padEnd(19) + '<span class="' + (st === 'err-disabled' ? 'w' : st === 'connected' ? 'ok' : 'm') + '">' + st.padEnd(15) + '</span>' + vl.padEnd(7) + 'a-full  a-1000');
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
      if (cfg) { bad('Comando inválido neste modo. Use "end" primeiro.'); return { out, ran }; }
      const copy = kw(c, 'copy', 3);
      if (copy ? !(kw(t[1], 'running-config', 3) && kw(t[2], 'startup-config', 3)) : t[1] && !kw(t[1], 'memory', 3)) { bad(copy ? 'Uso: copy running-config startup-config' : 'Uso: write memory'); return { out, ran }; }
      if (copy) out.push('Destination filename [startup-config]? ');
      out.push('Building configuration...', '<span class="ok">[OK]</span>');
      s.unsaved = false;
      s.savedCfg = vlanCfg(s);
      ran.push('config-saved');
      return { out, ran };
    }
    if (kw(c, 'configure')) {
      if (s.mode === 'user') { bad('Use "enable" antes de configurar.'); return { out, ran }; }
      if (!t[1] || kw(t[1], 'terminal', 1)) { s.mode = 'conf'; out.push('Enter configuration commands, one per line.  End with CNTL/Z.'); ran.push('conf'); }
      else bad('Comando inválido. Use: configure terminal');
      return { out, ran };
    }
    // vlan <N> (creates it and enters config-vlan) · no vlan <N>
    if (c === 'vlan' || (c === 'no' && t[1] === 'vlan')) {
      if (!cfg) { bad('Comando inválido neste modo. Use "configure terminal" antes.'); return { out, ran }; }
      const id = +(c === 'no' ? t[2] : t[1]);
      if (!(id >= 2 && id <= 4094)) { bad('VLAN inválida: use um número de 2 a 4094.'); return { out, ran }; }
      if (c === 'no') {
        if (id === 10) { bad('A VLAN 10 é a do datacenter (gateway e servidores): não dá para apagar.'); return { out, ran }; }
        delete s.vlans[id];
        s.unsaved = true;
        return { out, ran };
      }
      if (!s.vlans[id]) s.vlans[id] = 'VLAN' + String(id).padStart(4, '0');
      s.mode = 'vlan'; s.curVlan = id; s.cur = null; s.unsaved = true;
      ran.push('vlan:' + id);
      return { out, ran };
    }
    if (c === 'name') {
      if (s.mode !== 'vlan') { bad('name vale dentro de uma VLAN: vlan <N> antes.'); return { out, ran }; }
      if (!t[1] || !/^[\w-]{1,32}$/.test(t[1])) { bad('Uso: name <NOME> (sem espaços)'); return { out, ran }; }
      s.vlans[s.curVlan] = t[1];
      s.unsaved = true;
      ran.push('vlan-name:' + s.curVlan);
      return { out, ran };
    }
    // switchport mode access|trunk · switchport access vlan <N> · switchport trunk allowed vlan <lista>
    if (kw(c, 'switchport', 3)) {
      if (s.mode !== 'if') { bad('switchport vale dentro da porta: interface gi0/N antes.'); return { out, ran }; }
      const p = s.cur;
      if (kw(t[1], 'mode') && (t[2] === 'access' || t[2] === 'trunk')) { s.pmode[p] = t[2]; if (t[2] === 'access') delete s.trunk[p]; ran.push('sw-mode:' + t[2]); }
      else if (kw(t[1], 'access') && kw(t[2], 'vlan') && +t[3] >= 1 && +t[3] <= 4094) {
        const id = +t[3];
        if (!s.vlans[id]) { s.vlans[id] = 'VLAN' + String(id).padStart(4, '0'); out.push('% Access VLAN does not exist. Creating vlan ' + id); }
        s.pvlan[p] = id;
        if (s.pmode[p] === 'trunk') out.push('<span class="m">a porta continua em modo trunk: para valer a VLAN de acesso, use switchport mode access.</span>');
        ran.push('sw-access:' + p);
      } else if (kw(t[1], 'trunk') && kw(t[2], 'allowed') && kw(t[3], 'vlan') && t[4]) {
        const add = t[4] === 'add', list = (add ? t[5] : t[4]) || '';
        if (!/^\d+(,\d+)*$/.test(list)) { bad('Uso: switchport trunk allowed vlan 10,30'); return { out, ran }; }
        const ids = list.split(',').map(Number);
        s.trunk[p] = add ? Array.from(new Set((s.trunk[p] || []).concat(ids))).sort((x, y) => x - y) : ids;
        ran.push('sw-trunk:' + p);
      } else { bad('Uso: switchport mode access|trunk · switchport access vlan <N> · switchport trunk allowed vlan <lista>'); return { out, ran }; }
      s.unsaved = true;
      return { out, ran };
    }
    if (kw(c, 'interface', 3)) {
      if (!cfg) { bad('Comando inválido neste modo. Use "configure terminal" antes.'); return { out, ran }; }
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
      if (d.kind === 'switch') return d.name + ({ user: '>', priv: '#', conf: '(config)#', if: '(config-if)#', vlan: '(config-vlan)#' }[d.sw.mode]);
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
    const FIRST = ['ip', 'ping', 'sudo', 'systemctl', 'curl', 'df', 'du', 'journalctl', 'hostnamectl', 'hostname', 'help', 'clear', 'exit', 'enable', 'show', 'configure', 'interface', 'shutdown', 'no', 'end', 'lscpu', 'free', 'uptime', 'whoami', 'uname', 'responder', 'tail', 'grep', 'cat', 'ss', 'netstat', 'copy', 'write',
      'ufw', 'ls', 'chmod', 'chown', 'useradd', 'usermod', 'passwd', 'id', 'groups', 'apt', 'tar', 'rsync', 'crontab', 'echo', 'vlan', 'name', 'switchport'];
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
      const SWITCH_KEYS = ['enable', 'show-int', 'conf-t', 'interface', 'shutdown', 'no-shutdown', 'end', 'show-run', 'show-start', 'copy-run-start', 'sw-ping',
        'show-vlan', 'sw-vlan', 'sw-access', 'sw-mode', 'sw-trunk', 'show-trunk', 'show-mac'];
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

    const COMPLETE = ['ip addr', 'ip link', 'ip route', 'ip link set eth0 up', 'ip addr add ', 'ip addr del ', 'ip route add default via ', 'ip route del default', 'ping -c 3 ', 'systemctl status ', 'systemctl restart ', 'systemctl start ', 'cat notas.txt', 'tail -n 20 /var/log/syslog', 'grep -c ', 'curl localhost', 'df -h', 'du -sh /var/log', 'journalctl --vacuum-size=200M', 'hostnamectl set-hostname ', 'hostname', 'whoami', 'uname -a', 'uptime', 'lscpu', 'free -h', 'responder ', 'tail -n 20 /var/log/auth.log', 'grep "Failed password" /var/log/auth.log', 'ss -tlnp', 'show running-config', 'show startup-config', 'copy running-config startup-config', 'enable', 'show interfaces status', 'configure terminal', 'interface gi0/', 'shutdown', 'no shutdown', 'end',
      'show vlan brief', 'show mac address-table', 'show interfaces trunk', 'switchport access vlan ', 'switchport mode access', 'switchport mode trunk', 'switchport trunk allowed vlan ',
      'ufw status', 'ufw enable', 'ufw allow ', 'ufw deny from ', 'ls -l ', 'chmod ', 'chown ', 'useradd -m -s /bin/bash ', 'usermod -aG ', 'passwd -l ', 'apt update', 'apt list --upgradable', 'apt upgrade -y', 'apt install -y ', 'tar czf ', 'rsync -a ', 'crontab -l'];
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
