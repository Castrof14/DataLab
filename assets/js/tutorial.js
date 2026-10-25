/* DataLab — first-run tutorial in three short blocks:
   Construção (expand → room → rack → computer), Equipe (hire → assign), Técnico (install → cable → terminal).
   Never blocks: steps advance by watching what the player did (counted from the start, so presets work too),
   the right control pulses, and the whole thing can be skipped or closed at any time. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;

  DL.createTutorial = function (game, sys) {
    const $ = (id) => document.getElementById(id);
    const el = { card: $('tutorial'), group: $('tutGroup'), step: $('tutStep'), title: $('tutTitle'), text: $('tutText'), act: $('tutDo'), bars: $('tutBars'), skip: $('tutSkip'), close: $('tutClose') };
    const world = () => game.scene.world;
    const B = () => sys.builder.state;
    const start = {};
    const U = { on: false, i: 0, done: false, acc: 0, guide: null, key: '' };

    const inBuild = () => game.mode() === 'build';
    const inCrew = () => game.mode() === 'crew';
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const mine = () => sys.ops.devices().filter((d) => d.kind === 'server' && !d.pre);
    const toBuild = () => ({ act: 'Aperte <kbd>B</kbd> ou clique em <b>Construir</b>', guide: '[data-mode="build"]' });
    const toCrew = () => ({ act: 'Aperte <kbd>C</kbd> ou clique em <b>Equipe</b>', guide: '[data-mode="crew"]' });
    const toOps = () => ({ act: 'Abra o painel <b>Tarefas</b> no topo da tela', guide: '#opsBtn' });

    function pickItem(kind, label, where) {
      if (!inBuild()) return toBuild();
      if (B().tab !== 'equip') return { act: 'Abra a aba <b>Equipamentos</b>', guide: '[data-tab="equip"]' };
      if (!B().def || B().def.id !== kind) return { act: 'Escolha <b>' + label + '</b> no catálogo', guide: '[data-def="' + kind + '"]' };
      return { act: where, guide: null };
    }

    const STEPS = [
      {
        group: 'Construção', title: 'Expanda o terreno',
        text: 'Todo datacenter cresce. Abra espaço no terreno para construir. Cada expansão custa mais que a anterior — a primeira é por conta do kit inicial.',
        done: () => world().lot.w * world().lot.h > start.lot,
        how() {
          if (!inBuild()) return toBuild();
          if (B().tab !== 'room') return { act: 'Abra a aba <b>Espaços</b>', guide: '[data-tab="room"]' };
          if (B().lotAsk) return { act: 'Confira o preço e clique em <b>Confirmar</b>', guide: '[data-room="lot-ok"]' };
          if (B().roomTool !== 'select') return { act: 'Escolha a ferramenta <b>Selecionar</b>', guide: '[data-room-tool="select"]' };
          return { act: 'Clique em <b>+</b> na largura do <b>Terreno</b>', guide: '[data-room="lw+"]' };
        },
      },
      {
        group: 'Construção', title: 'Crie uma sala',
        text: 'Desenhe uma sala no terreno novo. Paredes e porta aparecem sozinhas.',
        done: () => world().rooms.length > start.rooms,
        how() {
          if (!inBuild()) return toBuild();
          if (B().tab !== 'room') return { act: 'Abra a aba <b>Espaços</b>', guide: '[data-tab="room"]' };
          if (B().roomTool !== 'draw') return { act: 'Escolha a ferramenta <b>Nova sala</b>', guide: '[data-room-tool="draw"]' };
          return { act: 'Arraste no terreno vazio (a área verde), encostado numa sala', guide: null, area: true };
        },
      },
      {
        group: 'Construção', title: 'Coloque um rack',
        text: 'Racks guardam servidores e switches — o coração do datacenter. O kit inicial paga o primeiro rack, computador, servidor, switch e contratação: aprender não custa nada.',
        done: () => count('rack') > start.racks,
        how: () => pickItem('rack', 'Rack', 'Clique dentro da sala nova para posicionar'),
      },
      {
        group: 'Construção', title: 'Coloque um computador',
        text: 'É na estação de trabalho que a equipe senta, trabalha e monitora tudo.',
        done: () => count('desk') > start.desks,
        how: () => pickItem('desk', 'Computador', 'Clique para posicionar · <kbd>R</kbd> gira'),
      },
      {
        group: 'Equipe', title: 'Crie um funcionário',
        text: 'Escolha nome, aparência e função. Cada função tem sua rotina no datacenter.',
        done: () => sys.crew.createdCount > 0,
        how() {
          if (sys.crew.creatorOpen) return { act: 'Personalize e clique em <b>Contratar</b>', guide: '#creatorSave' };
          if (!inCrew()) return toCrew();
          return { act: 'Clique em <b>Contratar</b> ou aperte <kbd>N</kbd>', guide: '#hireBtn' };
        },
      },
      {
        group: 'Equipe', title: 'Atribua uma tarefa',
        text: 'Cada função tem tarefas reais (redes verifica switch, servidores instala hardware…). Sem ordens, a equipe trabalha sozinha.',
        done: () => sys.crew.assignedCount > 0,
        how() {
          if (!inCrew() && !sys.crew.selected) return toCrew();
          if (!sys.crew.selected) return { act: 'Clique numa pessoa no mapa ou na lista', guide: '.crew-row' };
          if (sys.crew.menuOpen) return { act: 'Escolha uma das tarefas da função', guide: '.task-opt:not([disabled])' };
          return { act: 'Clique em <b>Atribuir tarefa</b> — ou direto num computador livre', guide: '[data-cc="assign"]' };
        },
      },
      {
        group: 'Técnico', title: 'Instale um servidor',
        text: 'Servidor vai dentro do rack e precisa de um switch por perto. Com o primeiro servidor a empresa começa a operar: cada servidor no ar gera receita. Dinheiro só sai quando você compra algo ou contrata.',
        done: () => mine().some((d) => sys.ops.switchesNear(d).length),
        how() {
          const has = mine().length;
          if (!has) return pickItem('server', 'Servidor intermediário', 'Clique no rack para instalar o servidor');
          return pickItem('switch', 'Switch gerenciável 24p', 'Agora instale um switch no mesmo rack (ou na mesma sala)');
        },
      },
      {
        group: 'Técnico', title: 'Ligue o cabo',
        text: 'O cabo leva a rede do switch até o servidor. Sem cabo certo, sem rede.',
        done: () => mine().some((d) => d.state !== 'new'),
        how() {
          if (sys.cabling.isOpen) return { act: 'Clique na porta <b>eth0</b> do servidor (anel pulsando) e depois numa porta <b>gi0/…</b> do switch', guide: null };
          if (game.opsOpen()) return { act: 'Clique em <b>Ligar cabos</b> no servidor novo', guide: '[data-op="cable"]' };
          return toOps();
        },
      },
      {
        group: 'Técnico', title: 'Configure no terminal',
        text: 'Ligue a interface, dê um IP, crie a rota e teste com ping. Você digita os comandos.',
        done: () => mine().some((d) => d.state === 'online'),
        how() {
          if (sys.cabling.isOpen) return { act: 'Feche o cabeamento (<kbd>Esc</kbd>) e abra o terminal pelo painel Tarefas', guide: '#cabClose' };
          if (sys.terminal.isOpen) return { act: 'Siga os passos à direita do terminal · travou? <b>Precisa de ajuda?</b>', guide: null };
          if (game.opsOpen()) return { act: 'Clique em <b>Abrir terminal</b>', guide: '[data-op="term"]' };
          return toOps();
        },
      },
      {
        group: 'Monitorar', title: 'Veja no monitoramento',
        text: 'Servidor configurado entra no monitor: CPU, memória, disco, rede e disponibilidade em tempo real.',
        done: () => sys.monitor.opened > start.mon && mine().some((d) => d.state === 'online'),
        how() {
          if (sys.terminal.isOpen) return { act: 'Feche o terminal (<kbd>Esc</kbd>)', guide: '#termClose' };
          return { act: 'Aperte <kbd>M</kbd> ou clique em <b>Monitor</b> no topo', guide: '#monBtn' };
        },
      },
    ];

    el.bars.innerHTML = STEPS.map((s, i) => '<i' + (i && STEPS[i - 1].group !== s.group ? ' class="gap"' : '') + '></i>').join('');
    const bars = Array.from(el.bars.children);

    function setGuide(sel) {
      const node = sel ? document.querySelector(sel) : null;
      if (node === U.guide) return;
      if (U.guide) U.guide.classList.remove('is-guide');
      U.guide = node;
      if (node) node.classList.add('is-guide');
    }

    function render(force) {
      const s = STEPS[U.i], h = s.how();
      U.area = !!h.area;
      const key = U.i + '|' + h.act;
      if (force || key !== U.key) {
        U.key = key;
        el.group.textContent = 'Tutorial · ' + s.group;
        el.step.textContent = U.i + 1 + ' / ' + STEPS.length;
        el.title.textContent = s.title;
        el.text.textContent = s.text;
        el.act.innerHTML = h.act;
        if (force) {
          for (const n of [el.title, el.text]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
        }
        bars.forEach((b, i) => { b.classList.toggle('is-done', i < U.i); b.classList.toggle('is-current', i === U.i); });
      }
      setGuide(h.guide);
    }

    function begin() {
      start.lot = world().lot.w * world().lot.h;
      start.rooms = world().rooms.length;
      start.racks = count('rack');
      start.desks = count('desk');
      start.mon = sys.monitor.opened;
      U.on = true;
      U.done = false;
      U.i = 0;
      el.card.hidden = false;
      el.card.classList.remove('is-done');
      el.skip.hidden = false;
      el.close.hidden = true;
      render(true);
    }

    function finish() {
      setGuide(null);
      U.done = true;
      el.card.classList.add('is-done');
      el.group.textContent = 'Tutorial';
      el.step.textContent = 'Concluído';
      el.title.textContent = 'Esse é o seu datacenter.';
      el.text.textContent = 'Agora a empresa está operando: servidores no ar geram receita, e o caixa só diminui quando você compra algo ou contrata. Acompanhe o card de finanças e resolva os problemas rápido — equipamento com problema não gera receita.';
      el.act.innerHTML = '<kbd>B</kbd> construir · <kbd>C</kbd> equipe · <kbd>M</kbd> monitor · <kbd>T</kbd> tarefas';
      bars.forEach((b) => { b.classList.add('is-done'); b.classList.remove('is-current'); });
      el.skip.hidden = true;
      el.close.hidden = false;
      game.toast('ok', 'Tutorial concluído', 'O datacenter é seu');
      setTimeout(() => { if (U.on && U.done) stop(); }, 15000);
    }

    function stop() {
      U.on = false;
      setGuide(null);
      el.card.hidden = true;
    }

    el.skip.addEventListener('click', () => { stop(); el.skip.blur(); });
    el.close.addEventListener('click', () => { stop(); el.close.blur(); });

    function update(dt) {
      if (!U.on || U.done) return;
      U.acc += dt;
      if (U.acc < 0.15) return;
      U.acc = 0;
      let moved = false;
      while (U.i < STEPS.length && STEPS[U.i].done()) { U.i++; moved = true; }
      if (U.i >= STEPS.length) { finish(); return; }
      if (moved) game.sfx('step');
      render(moved);
    }

    // Suggest where the new room goes: the free ground right of every room.
    function overlay(g, sc) {
      if (!U.on || U.done || !U.area) return;
      const w = world(), lot = w.lot;
      let x = 1;
      const areas = w.areas || w.rooms;
      for (const r of areas) x = Math.max(x, r.x + r.w + 1);
      const wd = lot.w - x - 1, y = 2, hh = Math.min(lot.h - 3, areas[0].h);
      if (wd < 3 || hh < 3) return;
      const a = 0.35 + 0.25 * Math.sin(sc.t * 4);
      g.fillStyle = 'rgba(126,224,161,' + (a * 0.25).toFixed(3) + ')';
      g.fillRect(x * T, y * T, wd * T, hh * T);
      g.fillStyle = 'rgba(126,224,161,' + a.toFixed(3) + ')';
      for (let px = x * T; px < (x + wd) * T; px += 4) { g.fillRect(px, y * T, 2, 1); g.fillRect(px, (y + hh) * T - 1, 2, 1); }
      for (let py = y * T; py < (y + hh) * T; py += 4) { g.fillRect(x * T, py, 1, 2); g.fillRect((x + wd) * T - 1, py, 1, 2); }
    }

    return {
      begin, stop, update, overlay,
      get active() { return U.on && !U.done; },
      get step() { return U.i; },
      get total() { return STEPS.length; },
    };
  };
})();
