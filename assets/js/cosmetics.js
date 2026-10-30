/* DataLab — cosmetics: the catalog of everything the shop sells and the inventory holds (skins of
   racks / servers / switches / storage, rack accessories and LEDs, clothes, hair, hats, accessories,
   colour palettes, special items, event items and the legendary bots), the rarity scale, the events
   calendar, and how each cosmetic is drawn. Purely visual: nothing here changes how equipment or
   people perform (the legendary bots' abilities live in crew.js).

   Drawing hooks (all optional, looked up at draw time):
   - DL.drawItem is wrapped: racks and storage get the equipped skin / accessory / LED strip painted
     over their pixel art (iso.js maps that art onto the 2.5D boxes, keyed by DL.skinKey).
   - sprites.js calls DL.charOutfit / charLegs / charHair / charHat / charTop for the new clothes.
   - DL.drawAura paints the golden aura of a legendary bot (iso.js and DL.drawActor). */
(function () {
  'use strict';
  const DL = window.DL;
  const R = DL.R, shade = DL.shade;

  /* ------------------------------------------------------------------ */
  /* Rarity                                                              */
  /* ------------------------------------------------------------------ */
  DL.RARITY = {
    common: { name: 'Comum', color: '#9aa3b0', rank: 0 },
    uncommon: { name: 'Incomum', color: '#7ee0a1', rank: 1 },
    rare: { name: 'Raro', color: '#6aa7e8', rank: 2 },
    epic: { name: 'Épico', color: '#c084fc', rank: 3 },
    legendary: { name: 'Lendário', color: '#f2c14e', rank: 4 },
  };
  DL.RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  /* ------------------------------------------------------------------ */
  /* Events: shop items are on sale only inside the window; once owned    */
  /* they stay in the inventory forever, marked EVENTO.                  */
  /* ------------------------------------------------------------------ */
  DL.EVENTS = {
    beta: { id: 'beta', name: 'Pré-alpha fechado', from: '2026-09-01', until: '2026-09-30', color: '#a0c3ec', desc: 'Quem jogou as primeiras versões do DataLab.' },
    lancamento: { id: 'lancamento', name: 'Semana de Lançamento', from: '2026-10-01', until: '2026-10-31', color: '#ff7a17', desc: 'O DataLab chegou: itens laranja por tempo limitado.' },
  };
  const day = (s, end) => new Date(s + (end ? 'T23:59:59' : 'T00:00:00')).getTime();
  DL.eventActive = function (id, now) {
    const ev = DL.EVENTS[id];
    if (!ev) return false;
    const t = now || Date.now();
    return t >= day(ev.from) && t <= day(ev.until, true);
  };
  DL.eventEnds = function (id) {
    const ev = DL.EVENTS[id];
    return ev ? new Date(day(ev.until, true)).toLocaleDateString('pt-BR') : '';
  };

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  // slot: where it is equipped. Infrastructure skins apply to every rack / unit / storage of the
  // datacenter (a rack can override its own skin in build mode). Character slots change the player's
  // profile (outfit, hairStyle, hat, pantsStyle, accessory flags). Palettes unlock colours (passive).
  // cur: 'gold' (moeda dourada). price 0 + gift = only obtainable (events, rewards).
  const C = [];
  const add = (o) => C.push(Object.assign({ cur: 'gold', stack: false, sell: true }, o));

  // --- Infrastructure: racks
  add({ id: 'rack_clean', cat: 'infra', slot: 'rack', value: 'clean', name: 'Rack Clean', theme: 'Clean', rarity: 'common', price: 15, desc: 'Gabinete branco fosco, cantos claros. Combina com salas minimalistas.' });
  add({ id: 'rack_corp', cat: 'infra', slot: 'rack', value: 'corp', name: 'Rack Corporativo', theme: 'Corporativo', rarity: 'common', price: 15, desc: 'Grafite com faixa azul e plaqueta da empresa no topo.' });
  add({ id: 'rack_industrial', cat: 'infra', slot: 'rack', value: 'industrial', name: 'Rack Industrial', theme: 'Industrial', rarity: 'uncommon', price: 30, desc: 'Aço escovado e faixas de sinalização amarelas e pretas.' });
  add({ id: 'rack_gamer', cat: 'infra', slot: 'rack', value: 'gamer', name: 'Rack Gamer RGB', theme: 'Gamer', rarity: 'rare', price: 60, desc: 'Moldura preta com contorno RGB que percorre todo o espectro.' });
  add({ id: 'rack_cyber', cat: 'infra', slot: 'rack', value: 'cyber', name: 'Rack Cyberpunk', theme: 'Cyberpunk', rarity: 'epic', price: 120, desc: 'Roxo profundo com neon magenta e ciano nos trilhos.' });
  add({ id: 'rack_gold', cat: 'infra', slot: 'rack', value: 'gold', name: 'Rack Dourado', theme: 'Lendário', rarity: 'legendary', price: 250, desc: 'Moldura banhada a ouro com brilho que corre pela borda.' });
  add({ id: 'rack_launch', cat: 'infra', slot: 'rack', value: 'launch', name: 'Rack Lançamento', theme: 'Evento', rarity: 'epic', price: 90, event: 'lancamento', desc: 'Preto com a faixa laranja do DataLab. Só durante a Semana de Lançamento.' });
  // --- servers (bezels of every server unit)
  add({ id: 'srv_clean', cat: 'infra', slot: 'server', value: 'clean', name: 'Servidor Clean', theme: 'Clean', rarity: 'common', price: 15, desc: 'Frontal branco nos servidores.' });
  add({ id: 'srv_carbon', cat: 'infra', slot: 'server', value: 'carbon', name: 'Servidor Carbono', theme: 'Industrial', rarity: 'uncommon', price: 30, desc: 'Frontal em fibra de carbono.' });
  add({ id: 'srv_neon', cat: 'infra', slot: 'server', value: 'neon', name: 'Servidor Neon', theme: 'Gamer', rarity: 'rare', price: 55, desc: 'Frisos ciano iluminados em cada unidade.' });
  add({ id: 'srv_cyber', cat: 'infra', slot: 'server', value: 'cyber', name: 'Servidor Cyberpunk', theme: 'Cyberpunk', rarity: 'epic', price: 110, desc: 'Frontal roxo com detalhe magenta e ciano.' });
  add({ id: 'srv_gold', cat: 'infra', slot: 'server', value: 'gold', name: 'Servidor Dourado', theme: 'Lendário', rarity: 'legendary', price: 230, desc: 'Frontal dourado polido.' });
  // --- switches
  add({ id: 'sw_clean', cat: 'infra', slot: 'switch', value: 'clean', name: 'Switch Clean', theme: 'Clean', rarity: 'common', price: 15, desc: 'Carcaça clara nos switches.' });
  add({ id: 'sw_industrial', cat: 'infra', slot: 'switch', value: 'industrial', name: 'Switch Industrial', theme: 'Industrial', rarity: 'uncommon', price: 30, desc: 'Carcaça amarela de alta visibilidade.' });
  add({ id: 'sw_gamer', cat: 'infra', slot: 'switch', value: 'gamer', name: 'Switch RGB', theme: 'Gamer', rarity: 'rare', price: 55, desc: 'LEDs das portas em arco-íris (falhas continuam piscando em laranja).' });
  add({ id: 'sw_cyber', cat: 'infra', slot: 'switch', value: 'cyber', name: 'Switch Cyberpunk', theme: 'Cyberpunk', rarity: 'epic', price: 110, desc: 'Carcaça roxa com contorno neon.' });
  // --- storage / NAS
  add({ id: 'sto_clean', cat: 'infra', slot: 'storage', value: 'clean', name: 'Storage Clean', theme: 'Clean', rarity: 'common', price: 15, desc: 'Gabinete claro para storages e NAS.' });
  add({ id: 'sto_industrial', cat: 'infra', slot: 'storage', value: 'industrial', name: 'Storage Industrial', theme: 'Industrial', rarity: 'uncommon', price: 30, desc: 'Faixas de sinalização no storage.' });
  add({ id: 'sto_cyber', cat: 'infra', slot: 'storage', value: 'cyber', name: 'Storage Cyberpunk', theme: 'Cyberpunk', rarity: 'epic', price: 110, desc: 'Neon magenta e ciano no storage.' });
  add({ id: 'sto_gold', cat: 'infra', slot: 'storage', value: 'gold', name: 'Storage Dourado', theme: 'Lendário', rarity: 'legendary', price: 230, desc: 'Storage banhado a ouro.' });
  // --- rack accessories
  add({ id: 'acc_fans', cat: 'infra', slot: 'rackacc', value: 'fans', name: 'Ventoinhas no topo', theme: 'Gamer', rarity: 'uncommon', price: 25, desc: 'Duas ventoinhas girando no teto de cada rack.' });
  add({ id: 'acc_beacon', cat: 'infra', slot: 'rackacc', value: 'beacon', name: 'Giroflex de status', theme: 'Industrial', rarity: 'uncommon', price: 25, desc: 'Luz de sinalização no topo do rack.' });
  add({ id: 'acc_plate', cat: 'infra', slot: 'rackacc', value: 'plate', name: 'Plaqueta iluminada', theme: 'Corporativo', rarity: 'rare', price: 45, desc: 'Plaqueta com brilho suave na frente do topo.' });
  add({ id: 'acc_stickers', cat: 'infra', slot: 'rackacc', value: 'stickers', name: 'Adesivos', theme: 'Gamer', rarity: 'common', price: 10, desc: 'Adesivos coloridos colados na moldura.' });
  // --- LEDs / RGB
  add({ id: 'led_cyan', cat: 'infra', slot: 'led', value: '#00e5ff', name: 'Fita de LED Ciano', theme: 'Clean', rarity: 'common', price: 12, desc: 'Fita de LED vertical na frente dos racks.' });
  add({ id: 'led_magenta', cat: 'infra', slot: 'led', value: '#ff2bd6', name: 'Fita de LED Magenta', theme: 'Cyberpunk', rarity: 'uncommon', price: 22, desc: 'Fita magenta pulsando devagar.' });
  add({ id: 'led_amber', cat: 'infra', slot: 'led', value: '#ffb020', name: 'Fita de LED Âmbar', theme: 'Industrial', rarity: 'uncommon', price: 22, desc: 'Luz quente de oficina.' });
  add({ id: 'led_rgb', cat: 'infra', slot: 'led', value: 'rgb', name: 'Fita RGB Arco-íris', theme: 'Gamer', rarity: 'rare', price: 50, desc: 'Gradiente RGB que corre de cima para baixo.' });
  add({ id: 'led_gold', cat: 'infra', slot: 'led', value: '#f2c14e', name: 'Fita de LED Dourada', theme: 'Lendário', rarity: 'epic', price: 100, desc: 'Brilho dourado respirando.' });

  // --- Character: shirts (profile.outfit)
  add({ id: 'shirt_polo', cat: 'char', slot: 'shirt', value: 'polo', name: 'Camisa Polo', rarity: 'common', price: 12, desc: 'Gola polo com botões. A cor é a que você escolher no personagem.' });
  add({ id: 'shirt_striped', cat: 'char', slot: 'shirt', value: 'striped', name: 'Camiseta Listrada', rarity: 'common', price: 12, desc: 'Listras horizontais claras.' });
  add({ id: 'shirt_flannel', cat: 'char', slot: 'shirt', value: 'flannel', name: 'Camisa Xadrez', rarity: 'uncommon', price: 25, desc: 'Flanela xadrez de quem passa o dia no datacenter.' });
  add({ id: 'shirt_jacket', cat: 'char', slot: 'shirt', value: 'jacket', name: 'Jaqueta Aberta', rarity: 'rare', price: 45, desc: 'Jaqueta por cima de uma camiseta branca.' });
  add({ id: 'shirt_jersey', cat: 'char', slot: 'shirt', value: 'jersey', name: 'Camisa de Time', rarity: 'rare', price: 45, desc: 'Camisa de time com número 7 e faixas nos ombros.' });
  add({ id: 'shirt_launch', cat: 'char', slot: 'shirt', value: 'launch', name: 'Camiseta do Lançamento', rarity: 'rare', price: 40, event: 'lancamento', desc: 'Com a marca do DataLab no peito. Edição limitada.' });
  // full-body costumes: worn in the shirt slot, they also recolour the legs, hands and boots and cover the
  // head (DL.charCostume + charOutfit + charTop below). All of them are original designs.
  add({ id: 'costume_hero', cat: 'char', slot: 'shirt', value: 'hero', name: 'Capitão Debug', rarity: 'epic', price: 120, desc: 'Traje de super-herói do DataLab: máscara com visor, um bug dourado no peito, luvas e botas amarelas.' });
  add({ id: 'costume_ceo', cat: 'char', slot: 'shirt', value: 'ceo', name: 'Terno de Magnata', rarity: 'rare', price: 70, desc: 'Terno azul-marinho, camisa branca e gravata dourada. Para quem é dono do datacenter.' });
  add({ id: 'costume_hacker', cat: 'char', slot: 'shirt', value: 'hacker', name: 'Hacker Anônimo', rarity: 'epic', price: 100, desc: 'Moletom preto com capuz e máscara branca. Ninguém sabe quem está no terminal.' });
  add({ id: 'costume_tech', cat: 'char', slot: 'shirt', value: 'tech', name: 'Técnico de TI', rarity: 'rare', price: 70, desc: 'Colete laranja refletivo, crachá e fone com microfone. O técnico que mantém tudo funcionando no corredor quente.' });
  add({ id: 'costume_astronaut', cat: 'char', slot: 'shirt', value: 'astronaut', name: 'Astronauta', rarity: 'epic', price: 120, desc: 'Traje branco pressurizado com capacete de vidro e painel neon. Pronto para o próximo deploy fora do planeta.' });
  add({ id: 'costume_ninja', cat: 'char', slot: 'shirt', value: 'ninja', name: 'Ninja do Código', rarity: 'epic', price: 100, desc: 'Roupa preta de infiltração com faixa verde neon e máscara. Ninguém vê o código passar.' });
  add({ id: 'costume_robot', cat: 'char', slot: 'shirt', value: 'robot', name: 'Robô', rarity: 'epic', price: 130, desc: 'Corpo de metal com juntas, chassi iluminado e olhos verdes que piscam. Mais máquina que pessoa.' });
  add({ id: 'costume_scientist', cat: 'char', slot: 'shirt', value: 'scientist', name: 'Cientista de Dados', rarity: 'rare', price: 80, desc: 'Jaleco branco, óculos grandes e caneta neon no bolso. Transforma dados em decisões.' });
  add({ id: 'costume_samurai', cat: 'char', slot: 'shirt', value: 'samurai', name: 'Samurai Digital', rarity: 'epic', price: 160, desc: 'Armadura preta com frisos verdes, máscara e katana de luz. Disciplina de outro nível.' });
  add({ id: 'costume_mage', cat: 'char', slot: 'shirt', value: 'mage', name: 'Mago dos Servidores', rarity: 'epic', price: 150, desc: 'Capa roxa, chapéu pontudo e cajado com cristal. Mantém os servidores no ar com magia.' });
  add({ id: 'costume_knight', cat: 'char', slot: 'shirt', value: 'knight', name: 'Cavaleiro do Firewall', rarity: 'epic', price: 170, desc: 'Armadura de metal, elmo e escudo com chamas azuis. Protege o firewall corpo a corpo.' });
  add({ id: 'costume_detective', cat: 'char', slot: 'shirt', value: 'detective', name: 'Detetive Cibernético', rarity: 'rare', price: 110, desc: 'Casaco longo, chapéu e lupa brilhante. Investiga cada pacote suspeito.' });
  add({ id: 'costume_pilot', cat: 'char', slot: 'shirt', value: 'pilot', name: 'Piloto Espacial', rarity: 'rare', price: 90, desc: 'Macacão laranja, capacete com visor e painel no peito. Pilota até o rack mais distante.' });
  add({ id: 'costume_backup', cat: 'char', slot: 'shirt', value: 'backup', name: 'Super-Herói do Backup', rarity: 'epic', price: 140, desc: 'Capa vermelha com símbolo de disco no peito. Salva seus dados antes que o pior aconteça.' });
  add({ id: 'costume_cowboy', cat: 'char', slot: 'shirt', value: 'cowboy', name: 'Cowboy do Código', rarity: 'rare', price: 80, desc: 'Chapéu, colete e botas com esporas neon. Domando servidores como um rebanho.' });
  add({ id: 'costume_vampire', cat: 'char', slot: 'shirt', value: 'vampire', name: 'Vampiro da Madrugada', rarity: 'epic', price: 150, desc: 'Capa preta, gola alta e olhos vermelhos. Só trabalha depois da meia-noite.' });
  add({ id: 'costume_chef', cat: 'char', slot: 'shirt', value: 'chef', name: 'Chef do Datacenter', rarity: 'uncommon', price: 60, desc: 'Chapéu de cozinheiro e avental. Prepara cada deploy com receita própria.' });
  add({ id: 'costume_king', cat: 'char', slot: 'shirt', value: 'king', name: 'Rei do Datacenter', rarity: 'legendary', price: 300, desc: 'Coroa dourada, manto de arminho e joias. O trono do datacenter é seu.' });
  // pants (profile.pantsStyle)
  add({ id: 'pants_jeans', cat: 'char', slot: 'pants', value: 'jeans', name: 'Calça Jeans', rarity: 'common', price: 12, desc: 'Costura clara e barra dobrada.' });
  add({ id: 'pants_cargo', cat: 'char', slot: 'pants', value: 'cargo', name: 'Calça Cargo', rarity: 'uncommon', price: 22, desc: 'Bolsos laterais para levar o alicate de crimpar.' });
  add({ id: 'pants_baggy', cat: 'char', slot: 'pants', value: 'baggy', name: 'Calça Baggy', rarity: 'uncommon', price: 22, desc: 'Larga, cobrindo o tênis.' });
  add({ id: 'pants_joggers', cat: 'char', slot: 'pants', value: 'joggers', name: 'Calça Jogger', rarity: 'rare', price: 40, desc: 'Punho na barra e faixa lateral branca.' });
  add({ id: 'pants_shorts', cat: 'char', slot: 'pants', value: 'shorts', name: 'Bermuda', rarity: 'common', price: 10, desc: 'Para o corredor quente.' });
  // hair (profile.hairStyle)
  add({ id: 'hair_undercut', cat: 'char', slot: 'hair', value: 'undercut', name: 'Undercut', rarity: 'common', price: 12, desc: 'Laterais raspadas e topo penteado.' });
  add({ id: 'hair_spiky', cat: 'char', slot: 'hair', value: 'spiky', name: 'Espetado', rarity: 'uncommon', price: 22, desc: 'Pontas para cima.' });
  add({ id: 'hair_braids', cat: 'char', slot: 'hair', value: 'braids', name: 'Tranças', rarity: 'rare', price: 40, desc: 'Tranças com contas douradas nas pontas.' });
  add({ id: 'hair_mohawk', cat: 'char', slot: 'hair', value: 'mohawk', name: 'Moicano', rarity: 'epic', price: 90, desc: 'Crista alta no meio da cabeça.' });
  // hats (profile.hat)
  add({ id: 'hat_snapback', cat: 'char', slot: 'hat', value: 'snapback', name: 'Boné Aba Reta', rarity: 'common', price: 12, desc: 'Aba reta com logo branco (cor do seu cargo).' });
  add({ id: 'hat_backcap', cat: 'char', slot: 'hat', value: 'backcap', name: 'Boné para Trás', rarity: 'uncommon', price: 20, desc: 'Aba virada para trás.' });
  add({ id: 'hat_bucket', cat: 'char', slot: 'hat', value: 'bucket', name: 'Chapéu Bucket', rarity: 'rare', price: 40, desc: 'Chapéu de pescador.' });
  add({ id: 'hat_crown', cat: 'char', slot: 'hat', value: 'crown', name: 'Coroa Dourada', rarity: 'legendary', price: 250, desc: 'Para quem manda no datacenter.' });
  add({ id: 'hat_launch', cat: 'char', slot: 'hat', value: 'snapback', color: '#ff7a17', name: 'Boné do Lançamento', rarity: 'rare', price: 0, gift: true, event: 'lancamento', desc: 'Presente da Semana de Lançamento: resgate grátis na loja.' });
  // accessories (profile flags)
  add({ id: 'acc_shades', cat: 'char', slot: 'shades', value: true, name: 'Óculos Escuros', rarity: 'common', price: 10, desc: 'Lentes pretas.' });
  add({ id: 'acc_scarf', cat: 'char', slot: 'scarf', value: true, name: 'Cachecol', rarity: 'common', price: 10, desc: 'Para a sala fria.' });
  add({ id: 'acc_backpack', cat: 'char', slot: 'backpack', value: true, name: 'Mochila', rarity: 'uncommon', price: 20, desc: 'Mochila de notebook nas costas.' });
  add({ id: 'acc_chain', cat: 'char', slot: 'chain', value: true, name: 'Corrente Dourada', rarity: 'epic', price: 90, desc: 'Corrente com pingente brilhando.' });
  // colour palettes (unlock extra swatches for clothes)
  add({ id: 'pal_pastel', cat: 'char', slot: 'palette', value: ['#f9c0d0', '#b8e0d2', '#d6c1f0', '#fde2a7'], name: 'Paleta Pastel', rarity: 'uncommon', price: 20, desc: 'Libera 4 cores pastel para roupas e calças.' });
  add({ id: 'pal_neon', cat: 'char', slot: 'palette', value: ['#39ff14', '#ff2bd6', '#00e5ff', '#ffe600'], name: 'Paleta Neon', rarity: 'rare', price: 40, desc: 'Libera 4 cores neon para roupas e calças.' });
  add({ id: 'pal_gold', cat: 'char', slot: 'palette', value: ['#f2c14e', '#b8892f', '#fff1b8'], name: 'Paleta Dourada', rarity: 'epic', price: 100, desc: 'Libera tons de ouro para roupas e calças.' });

  // --- Special items
  add({ id: 'xp_boost', cat: 'special', slot: 'use', value: 'xp', name: 'Treinamento Intensivo', rarity: 'rare', price: 20, stack: true, desc: 'Consumível: a equipe ganha XP em dobro por 2 h de jogo.' });
  add({ id: 'badge_beta', cat: 'special', slot: null, name: 'Crachá Fundador', rarity: 'epic', price: 0, gift: true, event: 'beta', sell: false, desc: 'Colecionável de quem jogou o pré-alpha do DataLab.' });

  // --- Granted only (never sold): Founder, Developer, Beta Tester, Special — the admin grants them
  // (backend: item_grants). grant = the kind of grant; sell: false keeps them on the account.
  const GRANT = { price: 0, sell: false, grantOnly: true };
  add(Object.assign({ id: 'founder_rack', cat: 'infra', slot: 'rack', value: 'founder', name: 'Rack Fundador', theme: 'Founder', rarity: 'legendary', grant: 'founder', desc: 'Branco perolado com friso turquesa e dourado. Só para os fundadores do DataLab.' }, GRANT));
  add(Object.assign({ id: 'founder_hat', cat: 'char', slot: 'hat', value: 'snapback', color: '#5eead4', name: 'Boné Fundador', rarity: 'epic', grant: 'founder', desc: 'Turquesa, com o logo dos fundadores.' }, GRANT));
  add(Object.assign({ id: 'dev_rack', cat: 'infra', slot: 'rack', value: 'dev', name: 'Rack do Desenvolvedor', theme: 'Developer', rarity: 'legendary', grant: 'developer', desc: 'Preto com código verde correndo pela moldura. Da equipe que faz o jogo.' }, GRANT));
  add(Object.assign({ id: 'dev_shirt', cat: 'char', slot: 'shirt', value: 'dev', name: 'Camiseta Dev', rarity: 'epic', grant: 'developer', desc: 'Com o </> no peito. Equipe de desenvolvimento.' }, GRANT));
  add(Object.assign({ id: 'dev_badge', cat: 'special', slot: null, name: 'Crachá Developer', rarity: 'legendary', grant: 'developer', desc: 'Colecionável da equipe de desenvolvimento do DataLab.' }, GRANT));
  add(Object.assign({ id: 'special_trophy', cat: 'special', slot: null, name: 'Troféu Especial', rarity: 'epic', grant: 'special', desc: 'Entregue pela equipe em ocasiões especiais (campeonatos, ajuda à comunidade).' }, GRANT));
  C.find((it) => it.id === 'badge_beta').grant = 'beta';

  // --- Legendary bots: a whole crew member, bought with Gold, activated from the inventory
  const LEGEND_LOOK = { body: 'n', outfit: 'legend', visor: true, shoes: '#f2c14e', pantsStyle: 'joggers' };
  add({ id: 'legend_aurea', cat: 'legend', slot: 'bot', name: 'ÁUREA', rarity: 'legendary', price: 750, stack: true, max: 3, desc: 'Bot lendário generalista: sistemas, redes, servidores, segurança e documentação.',
    bot: Object.assign({ name: 'Áurea', role: 'sysadmin', skin: '#e0ac7e', hair: '#fff1b8', hairStyle: 'undercut', shirt: '#2a2112', pants: '#1b1f27' }, LEGEND_LOOK) });
  add({ id: 'legend_tita', cat: 'legend', slot: 'bot', name: 'TITÃ', rarity: 'legendary', price: 750, stack: true, max: 3, desc: 'Bot lendário de infraestrutura: instala, conserta e mantém tudo de pé.',
    bot: Object.assign({ name: 'Titã', role: 'servidores', skin: '#8d5a3b', hair: '#0f0b0a', hairStyle: 'mohawk', shirt: '#1d1a12', pants: '#232a36' }, LEGEND_LOOK) });
  add({ id: 'legend_nexus', cat: 'legend', slot: 'bot', name: 'NEXUS', rarity: 'legendary', price: 750, stack: true, max: 3, desc: 'Bot lendário de redes: cabos, switches e conectividade, sem perder o resto.',
    bot: Object.assign({ name: 'Nexus', role: 'redes', skin: '#f2c8a0', hair: '#c9c9c9', hairStyle: 'spiky', shirt: '#12161d', pants: '#1f2d44' }, LEGEND_LOOK) });

  DL.COSMETICS = C;
  const BY_ID = {};
  for (const it of C) BY_ID[it.id] = it;
  DL.cosmetic = (id) => BY_ID[id] || null;

  // Shop / inventory categories (the inventory groups items by these)
  DL.COSMETIC_GROUPS = [
    { id: 'rack', name: 'Skins de racks', test: (it) => it.slot === 'rack' },
    { id: 'server', name: 'Skins de servidores', test: (it) => it.slot === 'server' },
    { id: 'switch', name: 'Skins de switches', test: (it) => it.slot === 'switch' },
    { id: 'storage', name: 'Skins de storage', test: (it) => it.slot === 'storage' },
    { id: 'rackacc', name: 'Acessórios de rack', test: (it) => it.slot === 'rackacc' },
    { id: 'led', name: 'LEDs / RGB', test: (it) => it.slot === 'led' },
    { id: 'clothes', name: 'Roupas', test: (it) => it.slot === 'shirt' || it.slot === 'pants' },
    { id: 'hair', name: 'Cabelos', test: (it) => it.slot === 'hair' },
    { id: 'acc', name: 'Acessórios', test: (it) => it.slot === 'hat' || it.slot === 'shades' || it.slot === 'scarf' || it.slot === 'backpack' || it.slot === 'chain' },
    { id: 'palette', name: 'Paletas de cor', test: (it) => it.slot === 'palette' },
    { id: 'special', name: 'Itens especiais', test: (it) => it.cat === 'special' },
    { id: 'legend', name: 'Bots lendários', test: (it) => it.cat === 'legend' },
  ];
  DL.groupOf = (it) => (DL.COSMETIC_GROUPS.find((g) => g.test(it)) || { id: 'special' }).id;

  /* ------------------------------------------------------------------ */
  /* Infrastructure skins                                                */
  /* ------------------------------------------------------------------ */
  // which catalog item is equipped per slot (inventory.js keeps it); `ver` bumps on every change
  DL.Skins = { equipped: {}, ver: 0 };
  const hue = (t, off, l) => 'hsl(' + ((((t * 80 + off) % 360) + 360) % 360).toFixed(0) + ',95%,' + (l || 60) + '%)';

  const FRAME = {
    clean: { cap: '#d9dde3', capHi: '#f4f6f8', frame: '#c9ced6', hi: '#eef0f3', dk: '#8d96a3', side: '#cfd4db', vent: '#aab2bd', accent: '#a0c3ec' },
    corp: { cap: '#2f3542', capHi: '#4a5262', frame: '#2a2f3a', hi: '#3d4554', dk: '#15181d', side: '#262b34', vent: '#1b1f27', accent: '#3d7bd9', pattern: 'logo' },
    industrial: { cap: '#3a3a36', capHi: '#5e5e57', frame: '#46463f', hi: '#66665d', dk: '#1a1a18', side: '#3d3d38', vent: '#2a2a27', accent: '#f2c14e', pattern: 'hazard' },
    gamer: { cap: '#121216', capHi: '#26262e', frame: '#16161c', hi: '#26262e', dk: '#08080a', side: '#141418', vent: '#0b0b0e', accent: 'rgb', pattern: 'rgb' },
    cyber: { cap: '#1a0f2e', capHi: '#3a1f5c', frame: '#1f1235', hi: '#3a1f5c', dk: '#0c0618', side: '#1a0f2b', vent: '#120a20', accent: '#ff2bd6', accent2: '#00e5ff', pattern: 'neon' },
    gold: { cap: '#9a7630', capHi: '#ffe08a', frame: '#b8892f', hi: '#f6d27a', dk: '#6b4f1c', side: '#a07a2c', vent: '#7a5a20', accent: '#fff1b8', pattern: 'shine' },
    launch: { cap: '#141414', capHi: '#2c2c2c', frame: '#1a1a1a', hi: '#2c2c2c', dk: '#0a0a0a', side: '#161616', vent: '#0d0d0d', accent: '#ff7a17', pattern: 'stripe' },
    founder: { cap: '#e8ecef', capHi: '#ffffff', frame: '#dfe4e8', hi: '#ffffff', dk: '#9aa7b0', side: '#d6dde2', vent: '#b8c2c9', accent: '#5eead4', accent2: '#f2c14e', pattern: 'neon' },
    dev: { cap: '#0b0f0b', capHi: '#1d2a1d', frame: '#0e140e', hi: '#1f2f1f', dk: '#050705', side: '#0c110c', vent: '#081008', accent: '#39ff14', pattern: 'code' },
  };
  const BEZEL = {
    clean: { hi: '#f4f6f8', body: '#d9dde3', mark: '#9aa3b0' },
    carbon: { hi: '#34343b', body: '#17171b', mark: '#26262c', checker: true },
    neon: { hi: '#00e5ff', body: '#0f1c26', mark: '#00a3b8' },
    cyber: { hi: '#ff2bd6', body: '#1f1235', mark: '#00e5ff' },
    gold: { hi: '#ffe08a', body: '#b8892f', mark: '#fff1b8' },
  };
  const SWITCH = {
    clean: { hi: '#f4f6f8', body: '#cfd4db' },
    industrial: { hi: '#ffd76a', body: '#d9a520' },
    gamer: { hi: '#26262e', body: '#121216', rgb: true },
    cyber: { hi: '#ff2bd6', body: '#1f1235' },
  };

  // the catalog item a slot shows on this object (per-object override first, then the equipped one)
  function effective(e, slot) {
    if (e.skinOver && Object.prototype.hasOwnProperty.call(e.skinOver, slot)) return e.skinOver[slot] ? BY_ID[e.skinOver[slot]] : null;
    if ((slot === 'rack' || slot === 'storage') && e.skin) return e.skin === 'none' ? null : BY_ID[e.skin] || null;
    const id = DL.Skins.equipped[slot];
    return id ? BY_ID[id] || null : null;
  }
  DL.skinOf = effective;
  // part of iso.js' look cache key: a new skin means a new measured look
  DL.skinKey = function (e) {
    if (e.kind === 'rack') return ['rack', 'server', 'switch', 'rackacc', 'led'].map((s) => { const it = effective(e, s); return it ? it.id : ''; }).join(',');
    if (e.kind === 'storage') { const it = effective(e, 'storage'); return it ? it.id : ''; }
    return '';
  };

  function paintFrame(g, e, P, t) {
    const px = e.px, py = e.py, rot = e.rot | 0;
    // top cap
    R(g, px, py - 24, 16, 6, P.cap);
    R(g, px, py - 24, 16, 1, P.capHi);
    R(g, px + 3, py - 22, 10, 1, P.vent);
    R(g, px + 3, py - 20, 10, 1, P.vent);
    if (P.pattern === 'hazard') for (let i = 0; i < 8; i++) R(g, px + i * 2, py - 19, 1, 1, P.accent);
    if (P.pattern === 'logo') { R(g, px + 2, py - 22, 3, 3, P.accent); R(g, px + 3, py - 21, 1, 1, '#e9e9e6'); }
    if (P.pattern === 'stripe') R(g, px, py - 19, 16, 1, P.accent);
    if (P.pattern === 'neon') { R(g, px, py - 19, 16, 1, P.accent2); R(g, px + 1, py - 24, 14, 1, P.accent); }
    if (P.pattern === 'rgb') for (let i = 0; i < 16; i++) R(g, px + i, py - 19, 1, 1, hue(t, i * 14));
    if (e.tag) R(g, rot === 2 ? px + 12 : rot === 3 ? px + 1 : px + 12, py - 23, 3, 2, e.tag);
    if (rot === 1) return; // the rear door keeps its mesh; the cap already says which skin it is
    if (rot === 2 || rot === 3) {
      // side panel in the skin colour, vents, the front edge untouched (its LEDs tell the state)
      R(g, px + 2, py - 16, 12, 28, P.side);
      for (let i = 0; i < 6; i++) R(g, px + 4, py - 13 + i * 4, 8, 1, P.vent);
      if (P.pattern === 'hazard') for (let i = 0; i < 6; i++) R(g, px + 2 + i * 2, py + 10, 1, 1, P.accent);
      if (P.pattern === 'neon') R(g, px + 2, py + 10, 12, 1, P.accent);
      if (P.pattern === 'rgb') for (let i = 0; i < 12; i++) R(g, px + 2 + i, py + 10, 1, 1, hue(t, i * 20));
      if (P.pattern === 'shine') { const s = Math.floor((t * 9) % 40) - 6; if (s >= 0 && s < 12) R(g, px + 2 + s, py - 16, 1, 28, 'rgba(255,241,184,0.35)'); }
      return;
    }
    // front: the frame around the unit opening
    R(g, px, py - 18, 2, 32, P.frame);
    R(g, px + 14, py - 18, 2, 32, P.frame);
    R(g, px, py - 18, 16, 2, P.frame);
    R(g, px, py + 12, 16, 2, P.frame);
    R(g, px, py - 18, 1, 32, P.hi);
    R(g, px + 15, py - 18, 1, 32, P.dk);
    R(g, px + 1, py + 13, 14, 1, P.dk);
    if (P.pattern === 'hazard') for (let y = py - 18; y < py + 14; y += 3) { R(g, px + 1, y, 1, 1, P.accent); R(g, px + 14, y + 1, 1, 1, P.accent); }
    if (P.pattern === 'neon') { R(g, px + 1, py - 17, 1, 30, P.accent); R(g, px + 14, py - 17, 1, 30, P.accent2); }
    if (P.pattern === 'rgb') for (let y = 0; y < 30; y++) { R(g, px + 1, py - 17 + y, 1, 1, hue(t, y * 9)); R(g, px + 14, py - 17 + y, 1, 1, hue(t, 180 + y * 9)); }
    if (P.pattern === 'stripe') { R(g, px + 1, py - 17, 1, 30, P.accent); R(g, px + 2, py + 12, 12, 1, P.accent); }
    if (P.pattern === 'logo') R(g, px + 14, py - 17, 1, 30, P.accent);
    if (P.pattern === 'code') {
      // green "code" falling down both rails
      for (let y = 0; y < 30; y++) {
        const on = Math.sin(y * 1.7 + Math.floor(t * 8) * 0.9) > 0.2, on2 = Math.sin(y * 2.3 - Math.floor(t * 7) * 1.1) > 0.3;
        if (on) R(g, px + 1, py - 17 + y, 1, 1, P.accent);
        if (on2) R(g, px + 14, py - 17 + y, 1, 1, '#1f8f0f');
      }
      R(g, px + 3, py - 22, 3, 1, P.accent);
      R(g, px + 7, py - 22, 1, 1, P.accent);
    }
    if (P.pattern === 'shine') {
      // a glint that runs around the gold frame
      const n = 92, k = Math.floor((t * 22) % n);
      for (let d = 0; d < 4; d++) {
        const q = (k + d) % n;
        const p = q < 32 ? [px, py - 18 + q] : q < 46 ? [px + 1 + (q - 32), py + 13] : q < 78 ? [px + 15, py + 13 - (q - 46)] : [px + 14 - (q - 78), py - 18];
        R(g, p[0], p[1], 1, 1, d ? 'rgba(255,241,184,0.7)' : '#ffffff');
      }
    }
  }

  // server bezels / switch bodies inside a modular rack (front view only)
  function paintUnits(g, e, t) {
    if ((e.rot | 0) !== 0) return;
    const sv = effective(e, 'server'), sw = effective(e, 'switch');
    if (!sv && !sw) return;
    const px = e.px, py = e.py;
    for (let k = 0; k < 9; k++) {
      const u = e.units ? e.units[k] : DL.hash(e.seed * 97 + k) < 0.14 ? null : 'server';
      if (!u) continue;
      const uy = py - 15 + k * 3;
      if (u === 'server' && sv) {
        const B = BEZEL[sv.value];
        if (!B) continue;
        // x+3 keeps the hardware model's colour mark; LEDs at x+10 / x+12 stay as they are
        R(g, px + 4, uy, 6, 1, B.hi);
        R(g, px + 4, uy + 1, 6, 1, B.body);
        if (B.checker) for (let i = 0; i < 6; i += 2) R(g, px + 4 + i, uy + 1, 1, 1, B.mark);
        else R(g, px + 5, uy + 1, 3, 1, B.mark);
        R(g, px + 11, uy, 1, 2, B.body);
      } else if (u === 'switch' && sw) {
        const S = SWITCH[sw.value];
        if (!S) continue;
        const fault = e.unitState && e.unitState[k] === 'fault';
        R(g, px + 3, uy, 9, 1, S.hi);
        for (let i = 0; i < 5; i++) R(g, px + 3 + i * 2, uy + 1, 1, 1, S.body);
        if (S.rgb && !fault) for (let i = 0; i < 4; i++) if (Math.sin(t * 6 + i * 1.3 + k) > -0.3) R(g, px + 4 + i * 2, uy + 1, 1, 1, hue(t, i * 60 + k * 30));
      }
    }
  }

  function paintAccessory(g, e, t) {
    const it = effective(e, 'rackacc');
    if (!it) return;
    const px = e.px, py = e.py, rot = e.rot | 0;
    switch (it.value) {
      case 'fans':
        for (const fx of [px + 2, px + 9]) {
          R(g, fx, py - 23, 5, 3, '#0b0d11');
          const a = Math.floor(t * 12) % 2;
          R(g, fx + (a ? 1 : 2), py - 22, a ? 3 : 1, 1, '#4a515c');
          R(g, fx + 2, py - 23 + (a ? 1 : 0), 1, a ? 1 : 3, '#4a515c');
        }
        break;
      case 'beacon': {
        const on = Math.sin(t * 5) > 0;
        R(g, px + 6, py - 26, 4, 2, on ? '#ffb020' : '#7a4a0a');
        R(g, px + 7, py - 27, 2, 1, on ? '#ffe08a' : '#5a3a10');
        R(g, px + 5, py - 24, 6, 1, '#2a2f38');
        break;
      }
      case 'plate':
        if (rot === 1) break;
        R(g, px + 4, py - 22, 8, 3, '#e9e9e6');
        R(g, px + 4, py - 22, 8, 1, '#ffffff');
        R(g, px + 5, py - 21, 6, 1, 'rgba(160,195,236,' + (0.55 + 0.35 * Math.sin(t * 2)).toFixed(2) + ')');
        break;
      case 'stickers':
        R(g, px + 1, py - 23, 2, 2, '#ff7a17');
        R(g, px + 11, py - 21, 2, 2, '#7ee0a1');
        if (rot === 0) { R(g, px, py - 6, 2, 2, '#c4b5fd'); R(g, px + 14, py + 4, 2, 2, '#a0c3ec'); }
        else { R(g, px + 4, py - 6, 3, 2, '#c4b5fd'); R(g, px + 8, py + 4, 2, 2, '#a0c3ec'); }
        break;
    }
  }

  function paintLed(g, e, t) {
    const it = effective(e, 'led');
    if (!it || (e.rot | 0) === 1) return;
    const px = e.px, py = e.py, rot = e.rot | 0;
    const x = rot === 2 ? px + 13 : rot === 3 ? px + 2 : px + 2;
    if (it.value === 'rgb') {
      for (let y = 0; y < 28; y++) R(g, x, py - 16 + y, 1, 1, hue(t * 1.6, -y * 12));
      if (rot === 0) for (let y = 0; y < 28; y += 2) R(g, px + 13, py - 16 + y, 1, 1, hue(t * 1.6, 180 - y * 12, 50));
      return;
    }
    const a = 0.55 + 0.45 * Math.sin(t * 2.2 + (e.seed || 0));
    g.globalAlpha = a;
    R(g, x, py - 16, 1, 28, it.value);
    if (rot === 0) R(g, px + 13, py - 16, 1, 28, it.value);
    g.globalAlpha = 1;
  }

  function paintStorage(g, e, t) {
    const it = effective(e, 'storage');
    if (!it) return;
    const P = FRAME[it.value];
    if (!P) return;
    const m = DL.hwModel ? DL.hwModel('storage', e.model) : null;
    if (m && (m.look === 'nas2' || m.look === 'nas4')) {
      // NAS on its stand: the stand + the box's top edge in the skin colours
      const px = e.px, py = e.py, rot = e.rot | 0, side = rot >= 2, big = m.look === 'nas4';
      const h = big ? 14 : 11, w = side ? 8 : big ? 12 : 9, x = px + 8 - Math.floor(w / 2), top = py + 12 - h - 8;
      R(g, px + 2, py + 4, 12, 8, P.frame);
      R(g, px + 2, py + 4, 12, 1, P.hi);
      R(g, x, top, w, 1, P.pattern === 'rgb' ? hue(t, 0) : P.accent === 'rgb' ? '#ffffff' : P.accent);
      if (P.pattern === 'hazard') for (let i = 0; i < 6; i++) R(g, px + 2 + i * 2, py + 10, 1, 1, P.accent);
      if (P.pattern === 'neon') R(g, px + 2, py + 11, 12, 1, P.accent2);
      return;
    }
    paintFrame(g, e, P, t);
  }

  const baseDraw = DL.drawItem;
  DL.drawItem = function (g, e, t) {
    baseDraw(g, e, t);
    if (e.kind === 'rack') {
      t = t || 0;
      const sk = effective(e, 'rack');
      if (sk && FRAME[sk.value]) paintFrame(g, e, FRAME[sk.value], t);
      paintUnits(g, e, t);
      paintLed(g, e, t);
      paintAccessory(g, e, t);
    } else if (e.kind === 'storage') paintStorage(g, e, t || 0);
  };

  /* ------------------------------------------------------------------ */
  /* Character cosmetics (called from sprites.js' drawChar)              */
  /* ------------------------------------------------------------------ */
  const WHITE = '#f1f1ee', GOLD = '#f2c14e', GOLD_L = '#fff1b8', GOLD_D = '#b8892f';
  const AX = DL.CHAR.AX, AY = DL.CHAR.AY;

  // Costumes (shirt slot, see the catalog): before drawChar paints anything, the look is patched — suit
  // colour on torso and legs, boots, gloves (the skin colour: only the hands show, the head is covered),
  // and nothing on the head that the mask or hood would cut through.
  const HERO = { suit: '#5b2bd1', dark: '#3a1a8c', light: '#7d55e8', gold: '#ffd23f', band: '#14102e' };
  const HOOD = { cloth: '#1b1d24', dark: '#0e0f14', light: '#2b2f3a', mask: '#e9e9e6', maskD: '#b9bcc4', ink: '#0b0d12', code: '#39ff14' };
  const CEO = { suit: '#1b2236', tie: '#c9a227', tieL: '#f2c14e' };
  const NEON = { green: '#39ff14', glow: '#b6ff9a', dim: '#1f8f0f', ink: '#0b0d12' };
  const TECH = { vest: '#ff7a17', vestD: '#b34a0a', vestL: '#ffb36b', shirt: '#242832', pants: '#1b2028', badge: '#f1f1ee' };
  const ASTRO = { suit: '#eef1f4', suitD: '#c3ccd4', suitL: '#ffffff', panel: '#1b2230', glass: 'rgba(140,255,170,0.16)' };
  const NINJA = { cloth: '#14161c', clothD: '#0a0b0f', clothL: '#262a33', band: '#39ff14', bandD: '#1f8f0f' };
  const ROBOT = { metal: '#6f7a86', metalD: '#3d4650', metalL: '#aab4bf', joint: '#2b323a' };
  const SCI = { coat: '#eef1f4', coatD: '#c3ccd4', shirt: '#1b2230', frame: '#0b0d12', lens: 'rgba(57,255,20,0.22)' };
  const SAM = { armor: '#1a1f2b', dark: '#0b0e14', light: '#303849', green: NEON.green, glow: NEON.glow };
  const MAGE = { robe: '#5b2bd1', dark: '#35167e', light: '#8f6bff', trim: '#b6ff9a', staff: '#6b4a2f', gem: NEON.green };
  const KNIGHT = { metal: '#8b96a6', dark: '#4a5565', light: '#c3ccd9', joint: '#2b323a', flame: '#3aa0ff', flameL: '#8fd3ff' };
  const DET = { coat: '#3b3540', dark: '#221f29', light: '#5a5264', hat: '#2b2630', band: '#39ff14', lens: 'rgba(57,255,20,0.28)', glass: NEON.glow };
  const PILOT = { suit: '#ff7a17', dark: '#b34a0a', light: '#ffb36b', shell: '#eef1f4', shellD: '#c3ccd4', visor: '#1b2230', glass: 'rgba(57,255,20,0.22)', strap: '#2b2f38' };
  const BK = { suit: '#d92b3a', dark: '#8f1622', light: '#ff6b78', cape: '#b01d2b', capeD: '#6e101a', white: '#f1f1ee', ring: NEON.green };
  const COW = { hat: '#7a5230', hatD: '#4a2f1d', hatL: '#a97a4a', shirt: '#d9c7a3', vest: '#3b2b22', vestD: '#241a14', denim: '#2e4a6b', boots: '#4a2f1d', neon: NEON.green };
  const VAMP = { cape: '#141018', capeD: '#08060b', lining: '#7a1220', shirt: '#1b1620', skin: '#e2dcd6', red: '#ff2b3a', redD: '#8f1622' };
  const CHEF = { white: '#eef1f4', whiteD: '#c3ccd4', whiteL: '#ffffff', apron: '#d8dde4', apronD: '#aab3bd', neck: '#39ff14', pants: '#2b313b' };
  const KING = { robe: '#4a1050', robeD: '#2b082f', robeL: '#7a1a82', gold: '#f2c14e', goldD: '#b8892f', goldL: '#fff1b8', fur: '#f1f1ee', furD: '#c3ccd4', jewel: '#ff2bd6' };
  const BARE = { hat: '', glasses: false, headset: false, beard: false, earrings: false, shades: false, visor: false, scarf: false, hairStyle: 'buzz' };
  // role: null drops the job's gear (cable coil, tie, tool belt…), which would sit on top of the costume
  const SUIT = { lanyard: null, badge: null, vest: null, role: null };
  DL.charCostume = function (L) {
    switch (L.outfit) {
      case 'hero': return Object.assign({}, BARE, SUIT, { shirt: HERO.suit, pants: HERO.suit, shoes: HERO.gold, skin: HERO.gold });
      case 'hacker': return Object.assign({}, BARE, SUIT, { shirt: HOOD.cloth, pants: '#22252d', shoes: '#e9e9e6', skin: HOOD.light });
      case 'ceo': return Object.assign({}, SUIT, { shirt: CEO.suit, pants: CEO.suit, shoes: '#0b0d12' });
      case 'tech': return Object.assign({}, BARE, SUIT, { shirt: TECH.shirt, pants: TECH.pants, shoes: '#0b0d12', hairStyle: 'short' });
      case 'astronaut': return Object.assign({}, BARE, SUIT, { shirt: ASTRO.suit, pants: ASTRO.suit, shoes: ASTRO.suitD, skin: ASTRO.suitD });
      case 'ninja': return Object.assign({}, BARE, SUIT, { shirt: NINJA.cloth, pants: NINJA.clothD, shoes: NINJA.clothD });
      case 'robot': return Object.assign({}, BARE, SUIT, { shirt: ROBOT.metal, pants: ROBOT.metalD, shoes: ROBOT.joint, skin: ROBOT.metal });
      case 'scientist': return Object.assign({}, BARE, SUIT, { shirt: SCI.coat, pants: '#2a3340', shoes: '#1a1f27', hairStyle: 'undercut' });
      case 'samurai': return Object.assign({}, BARE, SUIT, { shirt: SAM.armor, pants: SAM.dark, shoes: SAM.dark, skin: SAM.light });
      case 'mage': return Object.assign({}, BARE, SUIT, { shirt: MAGE.robe, pants: MAGE.dark, shoes: MAGE.dark });
      case 'knight': return Object.assign({}, BARE, SUIT, { shirt: KNIGHT.metal, pants: KNIGHT.dark, shoes: KNIGHT.joint, skin: KNIGHT.light });
      case 'detective': return Object.assign({}, BARE, SUIT, { shirt: DET.coat, pants: DET.dark, shoes: '#121318', hairStyle: 'short' });
      case 'pilot': return Object.assign({}, BARE, SUIT, { shirt: PILOT.suit, pants: PILOT.suit, shoes: PILOT.strap, skin: PILOT.strap });
      case 'backup': return Object.assign({}, BARE, SUIT, { shirt: BK.suit, pants: BK.suit, shoes: BK.dark });
      case 'cowboy': return Object.assign({}, BARE, SUIT, { shirt: COW.shirt, pants: COW.denim, shoes: COW.boots, hairStyle: 'short' });
      case 'vampire': return Object.assign({}, BARE, SUIT, { shirt: VAMP.shirt, pants: VAMP.cape, shoes: VAMP.capeD, skin: VAMP.skin });
      case 'chef': return Object.assign({}, BARE, SUIT, { shirt: CHEF.white, pants: CHEF.pants, shoes: '#121318', hairStyle: 'short' });
      case 'king': return Object.assign({}, BARE, SUIT, { shirt: KING.robe, pants: KING.robeD, shoes: KING.goldD });
    }
    return null;
  };

  // new shirt models; returns true when it handled the outfit
  DL.charOutfit = function (g, dir, ty, L, shirt, shirtD, shirtL) {
    const ax = AX, o = L.outfit, side = dir !== 'down' && dir !== 'up';
    switch (o) {
      case 'polo':
        if (dir === 'down') { R(g, ax - 3, ty, 2, 1, shirtL); R(g, ax + 1, ty, 2, 1, shirtL); R(g, ax, ty + 1, 1, 2, shirtD); R(g, ax, ty + 1, 1, 1, WHITE); }
        else if (dir === 'up') R(g, ax - 3, ty, 6, 1, shirtL);
        else R(g, ax, ty, 3, 1, shirtL);
        return true;
      case 'striped': {
        const s = 'rgba(255,255,255,0.32)';
        for (const y of [1, 3, 5]) R(g, side ? ax - 3 : ax - 4, ty + y, side ? 6 : 8, 1, s);
        return true;
      }
      case 'flannel': {
        const d = 'rgba(0,0,0,0.3)';
        if (side) { R(g, ax - 1, ty, 1, 7, d); R(g, ax - 3, ty + 2, 6, 1, d); R(g, ax - 3, ty + 5, 6, 1, d); }
        else { R(g, ax - 2, ty, 1, 7, d); R(g, ax + 1, ty, 1, 7, d); R(g, ax - 4, ty + 2, 8, 1, d); R(g, ax - 4, ty + 5, 8, 1, d); }
        if (dir === 'down') R(g, ax - 1, ty, 2, 1, shirtL);
        return true;
      }
      case 'jacket':
        if (dir === 'down') { R(g, ax - 1, ty, 2, 7, WHITE); R(g, ax - 2, ty, 1, 3, shirtL); R(g, ax + 1, ty, 1, 3, shirtL); R(g, ax - 2, ty + 3, 1, 4, shirtD); R(g, ax + 1, ty + 3, 1, 4, shirtD); }
        else if (dir === 'up') { R(g, ax - 3, ty, 6, 1, shirtL); R(g, ax, ty + 1, 1, 6, shirtD); }
        else { R(g, ax + 2, ty, 1, 7, WHITE); R(g, ax + 1, ty, 1, 2, shirtL); }
        return true;
      case 'jersey':
        if (dir === 'down') { R(g, ax - 4, ty, 2, 1, WHITE); R(g, ax + 2, ty, 2, 1, WHITE); R(g, ax - 1, ty + 2, 3, 1, WHITE); R(g, ax + 1, ty + 3, 1, 3, WHITE); }
        else if (dir === 'up') { R(g, ax - 4, ty, 2, 1, WHITE); R(g, ax + 2, ty, 2, 1, WHITE); R(g, ax - 2, ty + 2, 4, 1, WHITE); R(g, ax + 1, ty + 3, 1, 3, WHITE); }
        else { R(g, ax - 1, ty, 3, 1, WHITE); R(g, ax, ty + 3, 2, 1, WHITE); }
        return true;
      case 'launch':
        if (dir === 'down') { R(g, ax - 2, ty + 2, 4, 4, WHITE); R(g, ax - 1, ty + 3, 2, 2, shirt); R(g, ax - 1, ty + 4, 2, 1, '#ff7a17'); }
        else if (dir === 'up') R(g, ax - 4, ty + 2, 8, 1, '#ff7a17');
        else { R(g, ax, ty + 2, 2, 3, WHITE); R(g, ax, ty + 4, 2, 1, '#ff7a17'); }
        return true;
      case 'dev': {
        // </> on the chest in terminal green
        const k = '#39ff14';
        if (dir === 'down') { R(g, ax - 3, ty + 3, 1, 1, k); R(g, ax - 4, ty + 4, 1, 1, k); R(g, ax - 3, ty + 5, 1, 1, k); R(g, ax, ty + 2, 1, 1, k); R(g, ax - 1, ty + 4, 1, 1, k); R(g, ax - 1, ty + 3, 1, 1, k); R(g, ax - 2, ty + 5, 1, 1, k); R(g, ax + 2, ty + 3, 1, 1, k); R(g, ax + 3, ty + 4, 1, 1, k); R(g, ax + 2, ty + 5, 1, 1, k); }
        else if (dir === 'up') R(g, ax - 3, ty + 2, 6, 1, k);
        else { R(g, ax, ty + 3, 1, 1, k); R(g, ax + 1, ty + 4, 1, 1, k); R(g, ax, ty + 5, 1, 1, k); }
        return true;
      }
      case 'hero': {
        // a gold bug on the chest (body + six legs) and a gold belt
        const y = HERO.gold;
        if (dir === 'down') {
          R(g, ax - 1, ty + 2, 2, 3, y); R(g, ax - 2, ty + 2, 1, 1, y); R(g, ax + 1, ty + 2, 1, 1, y); R(g, ax - 2, ty + 4, 1, 1, y); R(g, ax + 1, ty + 4, 1, 1, y);
          R(g, ax - 1, ty + 1, 1, 1, y); R(g, ax, ty + 1, 1, 1, y); R(g, ax - 4, ty + 6, 8, 1, y);
        } else if (dir === 'up') { R(g, ax - 4, ty + 6, 8, 1, y); R(g, ax - 1, ty, 2, 6, HERO.dark); }
        else { R(g, ax, ty + 2, 2, 3, y); R(g, ax + 2, ty + 3, 1, 1, y); R(g, ax - 3, ty + 6, 6, 1, y); }
        return true;
      }
      case 'hacker':
        // hoodie: drawstrings, a line of green code and the front pocket
        if (dir === 'down') {
          R(g, ax - 2, ty + 1, 1, 2, HOOD.mask); R(g, ax + 1, ty + 1, 1, 2, HOOD.mask);
          R(g, ax - 3, ty + 3, 1, 1, HOOD.code); R(g, ax - 1, ty + 3, 2, 1, HOOD.code); R(g, ax + 2, ty + 3, 1, 1, HOOD.code);
          R(g, ax - 3, ty + 5, 6, 2, HOOD.light); R(g, ax - 3, ty + 5, 6, 1, HOOD.dark);
        } else if (dir === 'up') { R(g, ax - 3, ty, 6, 3, HOOD.light); R(g, ax - 2, ty + 3, 4, 1, HOOD.dark); }
        else { R(g, ax, ty + 3, 2, 1, HOOD.code); R(g, ax - 1, ty + 5, 4, 2, HOOD.light); }
        return true;
      case 'tech': {
        // orange high-visibility vest over a dark shirt, reflective neon stripe and a chest badge
        const v = TECH;
        if (dir === 'down') {
          R(g, ax - 4, ty, 2, 7, v.vest); R(g, ax + 2, ty, 2, 7, v.vest);
          R(g, ax - 4, ty, 2, 1, v.vestL); R(g, ax + 2, ty, 2, 1, v.vestL);
          R(g, ax - 2, ty, 1, 7, v.vestD); R(g, ax + 1, ty, 1, 7, v.vestD);
          R(g, ax - 4, ty + 4, 2, 1, NEON.green); R(g, ax + 2, ty + 4, 2, 1, NEON.green);
          R(g, ax - 3, ty + 2, 2, 2, v.badge); R(g, ax - 3, ty + 2, 2, 1, NEON.green); R(g, ax - 3, ty + 3, 1, 1, '#7d8187');
          R(g, ax - 3, ty, 1, 2, NEON.green);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 5, v.vest); R(g, ax - 4, ty, 8, 1, v.vestL);
          R(g, ax - 1, ty, 1, 5, v.vestD); R(g, ax - 4, ty + 4, 8, 1, NEON.green);
          R(g, ax - 3, ty + 2, 6, 1, v.vestD);
        } else {
          R(g, ax - 3, ty, 2, 7, v.vest); R(g, ax + 1, ty, 2, 7, v.vest);
          R(g, ax - 3, ty, 2, 1, v.vestL); R(g, ax + 1, ty, 2, 1, v.vestL);
          R(g, ax - 1, ty, 1, 7, v.vestD);
          R(g, ax - 3, ty + 4, 2, 1, NEON.green); R(g, ax + 1, ty + 4, 2, 1, NEON.green);
          R(g, ax + 1, ty + 2, 1, 2, v.badge);
        }
        return true;
      }
      case 'astronaut': {
        // white pressure suit, grey joints and a neon life-support panel on the chest
        const a = ASTRO;
        if (dir === 'down') {
          R(g, ax - 2, ty + 1, 4, 4, a.panel); R(g, ax - 2, ty + 1, 4, 1, NEON.green);
          R(g, ax - 1, ty + 2, 1, 1, NEON.glow); R(g, ax, ty + 3, 1, 1, a.suitD);
          R(g, ax - 4, ty + 6, 8, 1, a.suitD); R(g, ax - 1, ty + 6, 2, 1, '#9aa3b0'); R(g, ax, ty + 6, 1, 1, NEON.green);
          R(g, ax - 4, ty, 1, 7, a.suitL); R(g, ax + 3, ty, 1, 7, a.suitD);
          R(g, ax - 4, ty + 4, 1, 2, NEON.dim); R(g, ax + 3, ty + 4, 1, 2, NEON.dim);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 6, a.suitD); R(g, ax - 3, ty + 1, 6, 4, '#9aa3b0');
          R(g, ax - 2, ty + 2, 4, 2, a.panel); R(g, ax - 1, ty + 2, 2, 1, NEON.green);
          R(g, ax - 4, ty + 6, 8, 1, '#9aa3b0'); R(g, ax, ty + 6, 1, 1, NEON.green);
        } else {
          R(g, ax + 1, ty + 1, 2, 4, a.panel); R(g, ax + 1, ty + 1, 2, 1, NEON.green);
          R(g, ax + 2, ty + 2, 1, 1, NEON.glow);
          R(g, ax - 3, ty + 6, 6, 1, a.suitD); R(g, ax + 1, ty + 6, 1, 1, NEON.green);
          R(g, ax - 3, ty, 1, 7, a.suitL); R(g, ax + 2, ty, 1, 7, a.suitD);
        }
        return true;
      }
      case 'ninja': {
        // black infiltration garb with a neon green chest seam and belt
        const n = NINJA;
        if (dir === 'down') {
          R(g, ax - 2, ty, 4, 1, n.clothD);
          R(g, ax - 3, ty + 1, 1, 1, NEON.green); R(g, ax - 2, ty + 2, 1, 1, NEON.green);
          R(g, ax - 1, ty + 3, 2, 1, NEON.green); R(g, ax + 1, ty + 4, 1, 1, NEON.green);
          R(g, ax - 4, ty + 6, 8, 1, n.bandD); R(g, ax - 3, ty + 6, 6, 1, n.band);
          R(g, ax + 3, ty + 7, 2, 1, n.band); R(g, ax + 4, ty + 6, 1, 1, NEON.glow);
        } else if (dir === 'up') {
          R(g, ax - 4, ty + 1, 8, 1, n.clothD);
          R(g, ax - 3, ty + 2, 1, 4, NEON.dim); R(g, ax + 2, ty + 2, 1, 4, NEON.dim);
          R(g, ax - 4, ty + 6, 8, 1, n.bandD); R(g, ax - 3, ty + 6, 6, 1, n.band);
          R(g, ax - 1, ty, 2, 6, n.clothD);
        } else {
          R(g, ax - 2, ty, 1, 4, NEON.dim);
          R(g, ax - 3, ty + 6, 6, 1, n.bandD); R(g, ax - 2, ty + 6, 5, 1, n.band);
          R(g, ax + 2, ty + 2, 1, 4, n.clothD);
        }
        return true;
      }
      case 'robot': {
        // metal chest plate, rivets and a glowing green power core
        const r = ROBOT;
        if (dir === 'down') {
          R(g, ax - 3, ty + 1, 6, 5, r.metalL); R(g, ax - 3, ty + 1, 6, 1, '#c7d0d9');
          R(g, ax - 2, ty + 2, 4, 3, r.joint); R(g, ax - 1, ty + 3, 2, 1, NEON.green); R(g, ax - 1, ty + 2, 2, 1, NEON.dim);
          R(g, ax - 3, ty + 5, 1, 1, NEON.green); R(g, ax + 2, ty + 5, 1, 1, NEON.dim);
          R(g, ax - 4, ty + 6, 8, 1, r.metalD); R(g, ax - 1, ty + 6, 2, 1, r.metalL);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 6, r.metalD); R(g, ax - 3, ty + 1, 6, 4, r.metal);
          R(g, ax - 2, ty + 2, 4, 1, r.joint); R(g, ax - 1, ty + 2, 2, 1, NEON.green);
          R(g, ax - 4, ty + 6, 8, 1, r.metalD);
          R(g, ax - 2, ty + 4, 1, 1, NEON.dim); R(g, ax + 1, ty + 4, 1, 1, NEON.dim);
        } else {
          R(g, ax - 1, ty + 1, 3, 5, r.metalL); R(g, ax, ty + 2, 2, 3, r.joint);
          R(g, ax + 1, ty + 3, 1, 1, NEON.green);
          R(g, ax - 3, ty + 6, 6, 1, r.metalD);
        }
        return true;
      }
      case 'scientist': {
        // open white lab coat, dark shirt, lapels and a neon pen in the pocket
        const s = SCI;
        if (dir === 'down') {
          R(g, ax - 2, ty, 4, 2, s.shirt); R(g, ax - 1, ty + 2, 2, 5, s.shirt);
          R(g, ax - 3, ty, 1, 5, s.coatD); R(g, ax + 2, ty, 1, 5, s.coatD);
          R(g, ax - 3, ty, 1, 1, s.coat); R(g, ax + 2, ty, 1, 1, s.coat);
          R(g, ax + 1, ty + 3, 2, 3, s.coatD); R(g, ax + 1, ty + 3, 1, 1, NEON.green); R(g, ax + 2, ty + 4, 1, 2, NEON.dim);
          R(g, ax - 1, ty + 6, 2, 1, s.coatD);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, s.coatD); R(g, ax, ty + 1, 1, 6, s.coatD);
          R(g, ax - 4, ty + 6, 8, 1, s.coatD); R(g, ax - 3, ty + 2, 1, 3, '#9aa3b0');
        } else {
          R(g, ax + 1, ty, 2, 4, s.shirt); R(g, ax + 1, ty, 1, 4, s.coatD); R(g, ax + 2, ty + 2, 1, 2, s.coat);
          R(g, ax - 1, ty + 2, 1, 2, NEON.green);
          R(g, ax - 3, ty + 6, 6, 1, s.coatD);
        }
        return true;
      }
      case 'samurai': {
        if (dir === 'down') {
          R(g, ax - 6, ty, 2, 2, SAM.light); R(g, ax + 4, ty, 2, 2, SAM.light);
          R(g, ax - 6, ty + 1, 2, 1, SAM.dark); R(g, ax + 4, ty + 1, 2, 1, SAM.dark);
          R(g, ax - 4, ty + 1, 8, 1, SAM.light); R(g, ax - 4, ty + 2, 8, 1, SAM.dark); R(g, ax - 4, ty + 4, 8, 1, SAM.dark);
          R(g, ax - 4, ty + 1, 1, 1, SAM.green); R(g, ax + 3, ty + 1, 1, 1, SAM.green);
          R(g, ax - 1, ty + 2, 2, 3, SAM.light); R(g, ax - 1, ty + 3, 2, 1, SAM.dark);
          R(g, ax - 4, ty + 6, 8, 1, NEON.dim); R(g, ax - 1, ty + 6, 2, 1, SAM.green);
        } else if (dir === 'up') {
          R(g, ax - 6, ty, 2, 2, SAM.light); R(g, ax + 4, ty, 2, 2, SAM.light);
          R(g, ax - 4, ty + 1, 8, 5, SAM.light); R(g, ax, ty + 1, 1, 5, SAM.green);
          R(g, ax - 4, ty + 5, 8, 1, SAM.dark); R(g, ax - 4, ty + 6, 8, 1, NEON.dim); R(g, ax - 1, ty + 6, 2, 1, SAM.green);
        } else {
          R(g, ax - 3, ty, 2, 2, SAM.light); R(g, ax + 2, ty, 1, 2, SAM.dark);
          R(g, ax - 1, ty + 1, 3, 4, SAM.light); R(g, ax + 1, ty + 2, 1, 3, SAM.dark);
          R(g, ax, ty + 3, 1, 1, SAM.green);
          R(g, ax - 3, ty + 6, 6, 1, NEON.dim); R(g, ax + 1, ty + 6, 2, 1, SAM.green);
        }
        return true;
      }
      case 'mage': {
        if (dir === 'down') {
          R(g, ax - 5, ty + 1, 1, 7, MAGE.dark); R(g, ax + 4, ty + 1, 1, 7, MAGE.dark);
          R(g, ax - 1, ty, 1, 7, MAGE.trim); R(g, ax - 2, ty, 1, 2, MAGE.light); R(g, ax + 1, ty, 1, 2, MAGE.light);
          R(g, ax - 3, ty + 2, 1, 1, MAGE.trim); R(g, ax + 2, ty + 4, 1, 1, MAGE.trim);
          R(g, ax - 4, ty + 6, 8, 1, MAGE.dark); R(g, ax - 1, ty + 6, 2, 1, MAGE.gem);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, MAGE.light); R(g, ax - 1, ty + 1, 2, 6, MAGE.dark);
          R(g, ax - 2, ty + 2, 4, 1, MAGE.trim); R(g, ax - 4, ty + 6, 8, 1, MAGE.dark); R(g, ax - 1, ty + 6, 2, 1, MAGE.gem);
        } else {
          R(g, ax - 5, ty, 2, 7, MAGE.dark); R(g, ax - 1, ty, 1, 7, MAGE.trim); R(g, ax + 2, ty + 2, 1, 2, MAGE.light);
          R(g, ax - 3, ty + 6, 6, 1, MAGE.dark); R(g, ax, ty + 6, 2, 1, MAGE.gem);
        }
        return true;
      }
      case 'knight': {
        if (dir === 'down') {
          R(g, ax - 6, ty, 2, 2, KNIGHT.light); R(g, ax + 4, ty, 2, 2, KNIGHT.light);
          R(g, ax - 6, ty + 1, 2, 1, KNIGHT.dark); R(g, ax + 4, ty + 1, 2, 1, KNIGHT.dark);
          R(g, ax - 4, ty + 1, 8, 4, KNIGHT.metal); R(g, ax - 4, ty + 1, 8, 1, KNIGHT.light); R(g, ax - 4, ty + 5, 8, 1, KNIGHT.dark);
          R(g, ax, ty + 1, 1, 4, KNIGHT.dark); R(g, ax - 2, ty + 2, 4, 2, KNIGHT.joint);
          R(g, ax - 1, ty + 2, 2, 1, KNIGHT.flame); R(g, ax, ty + 3, 1, 1, KNIGHT.flameL);
          R(g, ax - 4, ty + 6, 8, 1, KNIGHT.dark); R(g, ax - 1, ty + 6, 2, 1, KNIGHT.light);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 6, KNIGHT.dark); R(g, ax - 3, ty + 1, 6, 4, KNIGHT.metal);
          R(g, ax, ty + 1, 1, 5, KNIGHT.joint); R(g, ax - 2, ty + 2, 4, 1, KNIGHT.flame);
          R(g, ax - 4, ty + 6, 8, 1, KNIGHT.dark); R(g, ax - 1, ty + 6, 2, 1, KNIGHT.light);
        } else {
          R(g, ax - 3, ty, 2, 2, KNIGHT.light); R(g, ax + 2, ty, 1, 2, KNIGHT.dark);
          R(g, ax - 1, ty + 1, 3, 5, KNIGHT.metal); R(g, ax + 1, ty + 2, 1, 3, KNIGHT.joint);
          R(g, ax, ty + 3, 1, 1, KNIGHT.flame);
          R(g, ax - 3, ty + 6, 6, 1, KNIGHT.dark); R(g, ax - 1, ty + 6, 2, 1, KNIGHT.light);
        }
        return true;
      }
      case 'detective': {
        if (dir === 'down') {
          R(g, ax - 5, ty + 3, 1, 6, DET.dark); R(g, ax + 4, ty + 3, 1, 6, DET.dark);
          R(g, ax - 2, ty, 4, 2, WHITE); R(g, ax - 1, ty + 2, 1, 4, DET.band); R(g, ax, ty + 2, 1, 4, DET.dark);
          R(g, ax - 3, ty, 1, 5, DET.light); R(g, ax + 2, ty, 1, 5, DET.light);
          R(g, ax + 1, ty + 2, 1, 1, DET.band); R(g, ax + 1, ty + 4, 1, 1, DET.band);
          R(g, ax - 4, ty + 6, 8, 1, DET.dark); R(g, ax - 1, ty + 6, 2, 1, DET.light);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, DET.light); R(g, ax, ty + 1, 1, 6, DET.dark);
          R(g, ax - 5, ty + 4, 1, 4, DET.dark); R(g, ax + 4, ty + 4, 1, 4, DET.dark);
          R(g, ax - 4, ty + 6, 8, 1, DET.dark); R(g, ax - 1, ty + 6, 2, 1, DET.light);
        } else {
          R(g, ax - 3, ty, 2, 1, DET.light); R(g, ax - 5, ty + 3, 2, 6, DET.dark);
          R(g, ax + 2, ty, 1, 5, DET.light); R(g, ax + 1, ty + 2, 1, 1, DET.band);
          R(g, ax - 3, ty + 6, 6, 1, DET.dark); R(g, ax, ty + 6, 2, 1, DET.light);
        }
        return true;
      }
      case 'pilot': {
        if (dir === 'down') {
          R(g, ax - 4, ty + 1, 1, 6, PILOT.strap); R(g, ax + 3, ty + 1, 1, 6, PILOT.strap); R(g, ax - 4, ty + 3, 8, 1, PILOT.strap);
          R(g, ax - 2, ty + 1, 4, 4, PILOT.dark); R(g, ax - 1, ty + 2, 2, 1, NEON.green); R(g, ax - 2, ty + 3, 1, 1, NEON.glow);
          R(g, ax - 4, ty, 8, 1, PILOT.light); R(g, ax - 4, ty + 6, 8, 1, PILOT.strap); R(g, ax - 1, ty + 6, 2, 1, PILOT.light);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, PILOT.light); R(g, ax - 3, ty + 1, 2, 5, PILOT.strap); R(g, ax + 1, ty + 1, 2, 5, PILOT.strap);
          R(g, ax - 1, ty + 1, 2, 4, PILOT.dark); R(g, ax, ty + 2, 1, 1, NEON.green);
          R(g, ax - 4, ty + 6, 8, 1, PILOT.strap); R(g, ax - 1, ty + 6, 2, 1, PILOT.light);
        } else {
          R(g, ax - 3, ty, 1, 6, PILOT.strap); R(g, ax + 1, ty, 2, 2, PILOT.dark); R(g, ax + 1, ty + 2, 1, 1, NEON.green);
          R(g, ax - 3, ty + 6, 6, 1, PILOT.strap); R(g, ax + 1, ty + 6, 2, 1, PILOT.light);
        }
        return true;
      }
      case 'backup': {
        if (dir === 'down') {
          R(g, ax - 5, ty, 1, 8, BK.capeD); R(g, ax + 4, ty, 1, 8, BK.capeD);
          R(g, ax - 2, ty + 2, 4, 1, BK.white); R(g, ax - 2, ty + 5, 4, 1, BK.white);
          R(g, ax - 2, ty + 2, 1, 4, BK.white); R(g, ax + 1, ty + 2, 1, 4, BK.white);
          R(g, ax - 1, ty + 3, 2, 2, BK.ring); R(g, ax, ty + 3, 1, 1, BK.suit);
          R(g, ax - 4, ty + 6, 8, 1, BK.dark); R(g, ax - 1, ty + 6, 2, 1, BK.white);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 8, BK.cape); R(g, ax - 4, ty, 8, 1, BK.capeD); R(g, ax - 4, ty + 7, 8, 1, BK.capeD);
          R(g, ax - 2, ty, 4, 1, BK.white); R(g, ax - 1, ty + 1, 2, 1, BK.ring);
        } else {
          R(g, ax - 5, ty, 2, 8, BK.cape); R(g, ax - 5, ty, 2, 1, BK.capeD); R(g, ax - 5, ty + 7, 2, 1, BK.capeD);
          R(g, ax + 1, ty + 2, 2, 1, BK.white); R(g, ax + 1, ty + 2, 1, 3, BK.white); R(g, ax + 1, ty + 3, 1, 1, BK.ring);
          R(g, ax - 3, ty + 6, 6, 1, BK.dark);
        }
        return true;
      }
      case 'cowboy': {
        if (dir === 'down') {
          R(g, ax - 4, ty, 2, 6, COW.vest); R(g, ax + 2, ty, 2, 6, COW.vest);
          R(g, ax - 3, ty, 1, 6, COW.vestD); R(g, ax + 3, ty, 1, 6, COW.vestD);
          R(g, ax - 1, ty, 2, 1, COW.neon); R(g, ax - 1, ty + 1, 2, 1, COW.hatD);
          R(g, ax + 2, ty + 2, 1, 1, COW.neon); R(g, ax - 3, ty + 2, 1, 1, COW.neon);
          R(g, ax - 4, ty + 6, 8, 1, COW.hatD); R(g, ax - 1, ty + 6, 2, 1, GOLD);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 6, COW.vest); R(g, ax - 4, ty, 8, 1, COW.hatL); R(g, ax, ty, 1, 6, COW.vestD);
          R(g, ax - 4, ty + 6, 8, 1, COW.hatD); R(g, ax - 2, ty + 6, 4, 1, COW.neon);
        } else {
          R(g, ax - 3, ty, 2, 6, COW.vest); R(g, ax - 3, ty, 1, 6, COW.vestD); R(g, ax + 2, ty, 1, 6, COW.vestD);
          R(g, ax + 1, ty, 1, 1, COW.neon); R(g, ax - 3, ty + 6, 6, 1, COW.hatD); R(g, ax, ty + 6, 2, 1, COW.neon);
        }
        return true;
      }
      case 'vampire': {
        if (dir === 'down') {
          R(g, ax - 4, ty, 8, 1, VAMP.capeD); R(g, ax - 4, ty + 1, 2, 6, VAMP.cape); R(g, ax + 2, ty + 1, 2, 6, VAMP.cape);
          R(g, ax - 1, ty + 1, 2, 5, VAMP.lining); R(g, ax, ty + 2, 1, 1, VAMP.red);
          R(g, ax - 4, ty + 6, 8, 1, VAMP.capeD); R(g, ax - 1, ty + 6, 2, 1, VAMP.redD);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 8, VAMP.cape); R(g, ax - 4, ty, 8, 1, VAMP.capeD); R(g, ax - 4, ty + 7, 8, 1, VAMP.lining);
          R(g, ax - 1, ty + 1, 2, 1, VAMP.red);
        } else {
          R(g, ax - 5, ty, 2, 8, VAMP.cape); R(g, ax - 5, ty + 7, 2, 1, VAMP.lining);
          R(g, ax + 2, ty + 1, 1, 5, VAMP.lining); R(g, ax + 1, ty + 2, 1, 1, VAMP.red);
          R(g, ax - 3, ty + 6, 6, 1, VAMP.capeD);
        }
        return true;
      }
      case 'chef': {
        if (dir === 'down') {
          R(g, ax - 4, ty, 1, 7, CHEF.whiteD); R(g, ax + 3, ty, 1, 7, CHEF.whiteD);
          R(g, ax - 3, ty, 6, 1, CHEF.apron); R(g, ax - 3, ty, 1, 3, CHEF.apronD); R(g, ax + 2, ty, 1, 3, CHEF.apronD);
          R(g, ax - 2, ty, 4, 1, CHEF.neck); R(g, ax - 1, ty + 1, 2, 1, NEON.dim);
          R(g, ax - 1, ty + 2, 1, 1, CHEF.whiteD); R(g, ax + 1, ty + 3, 1, 1, CHEF.whiteD);
          R(g, ax - 2, ty + 4, 4, 3, CHEF.apron); R(g, ax - 2, ty + 4, 4, 1, CHEF.whiteL);
          R(g, ax - 4, ty + 6, 8, 1, CHEF.apronD);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, CHEF.whiteD); R(g, ax, ty + 1, 1, 6, CHEF.whiteD); R(g, ax - 2, ty + 3, 4, 1, CHEF.apron);
          R(g, ax - 4, ty + 6, 8, 1, CHEF.apronD); R(g, ax - 1, ty + 6, 2, 1, CHEF.whiteL);
        } else {
          R(g, ax - 3, ty, 2, 1, CHEF.neck); R(g, ax - 3, ty + 1, 6, 1, CHEF.apron); R(g, ax - 1, ty + 2, 4, 3, CHEF.apron);
          R(g, ax - 3, ty, 1, 6, CHEF.whiteD); R(g, ax - 3, ty + 6, 6, 1, CHEF.apronD); R(g, ax - 1, ty + 6, 2, 1, CHEF.whiteL);
        }
        return true;
      }
      case 'king': {
        if (dir === 'down') {
          R(g, ax - 4, ty, 8, 1, KING.fur); R(g, ax - 4, ty + 1, 8, 1, KING.furD);
          R(g, ax - 5, ty + 2, 1, 6, KING.robeL); R(g, ax + 4, ty + 2, 1, 6, KING.robeL);
          R(g, ax - 4, ty + 1, 1, 6, KING.gold); R(g, ax + 3, ty + 1, 1, 6, KING.gold);
          R(g, ax - 4, ty + 1, 1, 1, KING.goldL); R(g, ax + 3, ty + 1, 1, 1, KING.goldL);
          R(g, ax - 1, ty + 1, 2, 5, KING.robeD); R(g, ax - 1, ty + 1, 2, 1, KING.jewel); R(g, ax, ty + 2, 1, 1, KING.goldL);
          R(g, ax - 4, ty + 6, 8, 1, KING.goldD); R(g, ax - 1, ty + 6, 2, 1, KING.goldL);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 1, KING.fur); R(g, ax - 4, ty + 1, 8, 7, KING.robe);
          R(g, ax - 4, ty + 1, 1, 6, KING.gold); R(g, ax + 3, ty + 1, 1, 6, KING.gold); R(g, ax, ty + 1, 1, 6, KING.robeD);
          R(g, ax - 4, ty + 7, 8, 1, KING.goldD); R(g, ax - 1, ty, 2, 1, KING.jewel);
        } else {
          R(g, ax - 3, ty, 6, 1, KING.fur); R(g, ax - 3, ty + 1, 6, 6, KING.robe);
          R(g, ax - 3, ty + 1, 1, 6, KING.gold); R(g, ax + 2, ty + 1, 1, 6, KING.gold);
          R(g, ax - 1, ty + 2, 2, 2, KING.robeD); R(g, ax, ty + 3, 1, 1, KING.jewel);
          R(g, ax - 3, ty + 6, 6, 1, KING.goldD); R(g, ax, ty + 6, 2, 1, KING.goldL);
        }
        return true;
      }
      case 'ceo':
        // white shirt in the V, lapels, a gold tie and a pocket square
        if (dir === 'down') {
          R(g, ax - 1, ty, 2, 5, WHITE); R(g, ax - 2, ty, 1, 4, shirtL); R(g, ax + 1, ty, 1, 4, shirtL);
          R(g, ax - 1, ty + 1, 2, 1, CEO.tieL); R(g, ax - 1, ty + 2, 2, 3, CEO.tie); R(g, ax - 1, ty + 5, 2, 1, shade(CEO.tie, -0.3));
          R(g, ax + 2, ty + 2, 1, 1, WHITE); R(g, ax - 3, ty + 5, 1, 1, CEO.tieL);
        } else if (dir === 'up') { R(g, ax - 3, ty, 6, 1, WHITE); R(g, ax, ty + 1, 1, 6, shirtD); }
        else { R(g, ax + 1, ty, 2, 3, WHITE); R(g, ax + 2, ty + 1, 1, 4, CEO.tie); R(g, ax + 1, ty, 1, 4, shirtL); }
        return true;
      case 'legend':
        // the legendary bots' suit: gold collar, seam and belt with a light on the chest
        if (dir === 'down') { R(g, ax - 3, ty, 6, 1, GOLD); R(g, ax, ty + 1, 1, 5, GOLD_D); R(g, ax - 2, ty + 2, 1, 1, GOLD_L); R(g, ax - 4, ty + 6, 8, 1, GOLD_D); R(g, ax - 4, ty, 1, 1, GOLD_L); R(g, ax + 3, ty, 1, 1, GOLD_L); }
        else if (dir === 'up') { R(g, ax - 4, ty, 8, 1, GOLD); R(g, ax - 1, ty + 1, 2, 5, GOLD_D); R(g, ax - 4, ty + 6, 8, 1, GOLD_D); }
        else { R(g, ax - 3, ty, 6, 1, GOLD); R(g, ax + 1, ty + 1, 1, 5, GOLD_D); R(g, ax - 3, ty + 6, 6, 1, GOLD_D); }
        return true;
    }
    return false;
  };

  // pants styles over the legs already drawn
  DL.charLegs = function (g, dir, pose, L, sit, side) {
    const st = L.pantsStyle;
    if (!st || sit) return;
    const ay = AY, ax = AX, p = L.pants;
    const legs = side
      ? (() => { let back = ax - 2, front = ax - 1; if (pose === 'A') { back = ax - 4; front = ax + 1; } if (pose === 'B') { back = ax + 1; front = ax - 4; } return [[back, 0, back], [front, 0, front + 2]]; })()
      : [[ax - 3, pose === 'B' ? -1 : 0, ax - 3], [ax, pose === 'A' ? -1 : 0, ax + 2]];
    for (const [x, dy, outer] of legs) {
      const top = ay - 6 + dy;
      switch (st) {
        case 'jeans': R(g, outer, top, 1, 4, shade(p, 0.2)); R(g, x, top + 3, 3, 1, shade(p, 0.28)); break;
        case 'cargo': { const px = outer === x ? x : x + 1; R(g, px, top + 1, 2, 2, shade(p, -0.25)); R(g, px, top + 1, 2, 1, shade(p, 0.12)); break; }
        case 'baggy': R(g, outer === x ? x - 1 : x + 3, top, 1, 5, shade(p, -0.12)); R(g, x, top + 4, 3, 1, p); break;
        case 'shorts': R(g, x, top + 2, 3, 2, L.skin || '#f2c8a0'); R(g, x, top + 1, 3, 1, shade(p, -0.2)); break;
        case 'joggers': R(g, x, top + 3, 3, 1, shade(p, -0.4)); R(g, outer, top, 1, 3, 'rgba(255,255,255,0.6)'); break;
      }
    }
  };

  // new hairstyles (H draws relative to the head)
  DL.charHair = function (g, dir, L, H, hair, hairD, hairL) {
    const side = dir !== 'down' && dir !== 'up';
    switch (L.hairStyle) {
      case 'undercut':
        if (dir === 'down') { H(-5, -2, 10, 2); H(-3, -3, 7, 1); H(-5, 0, 10, 1); H(-5, 1, 1, 3, hairD); H(4, 1, 1, 3, hairD); H(0, -2, 4, 1, hairL); }
        else if (dir === 'up') { H(-5, -2, 10, 3); H(-5, 1, 10, 6, hairD); }
        else { H(-5, -2, 10, 3); H(-3, -3, 7, 1); H(-5, 1, 4, 4, hairD); H(-2, -2, 4, 1, hairL); }
        return true;
      case 'spiky':
        if (dir === 'down') { H(-5, 0, 10, 3); H(-5, 3, 1, 2); H(4, 3, 1, 2); H(-3, 0, 4, 1, hairL); }
        else if (dir === 'up') { H(-5, 0, 10, 7); H(-4, 7, 8, 1, hairD); }
        else { H(-5, 0, 10, 3); H(-5, 3, 5, 3); H(-7, 0, 2, 1); }
        for (let i = 0; i < 5; i++) H(-5 + i * 2 + (i % 2), -2 - (i % 2), 1, 2 + (i % 2), i % 2 ? hairL : hair);
        return true;
      case 'braids': {
        const bead = (x, y) => H(x, y, 1, 1, GOLD);
        if (dir === 'down') {
          H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-4, 3, 3, 1); H(1, 3, 2, 1);
          for (const x of [-6, 5]) { H(x, 2, 1, 10); for (let y = 3; y < 12; y += 2) H(x, y, 1, 1, hairL); bead(x, 12); }
        } else if (dir === 'up') {
          H(-4, -1, 8, 1); H(-5, 0, 10, 8);
          for (const x of [-4, -2, 1, 3]) { H(x, 8, 1, 5); H(x, 9, 1, 1, hairL); bead(x, 13); }
        } else {
          H(-4, -1, 8, 1); H(-5, 0, 10, 3); H(-5, 3, 5, 3);
          for (const x of [-6, -4]) { H(x, 3, 1, 9); H(x, 5, 1, 1, hairL); bead(x, 12); }
        }
        return true;
      }
      case 'mohawk':
        if (dir === 'down') { H(-5, 1, 10, 2, hairD); H(-1, -4, 2, 5); H(-1, -4, 2, 1, hairL); }
        else if (dir === 'up') { H(-5, 1, 10, 6, hairD); H(-1, -4, 2, 11); }
        else { H(-5, 1, 10, 2, hairD); H(-5, 3, 4, 3, hairD); H(-4, -3, 8, 4); H(-3, -3, 5, 1, hairL); }
        return true;
    }
    return false;
  };

  DL.charHat = function (g, dir, L, H) {
    const cc = L.hatColor || L.capColor || '#3b4250', dk = shade(cc, -0.4), side = dir !== 'down' && dir !== 'up';
    switch (L.hat) {
      case 'snapback':
        H(-4, -1, 8, 1, cc); H(-5, 0, 10, 3, cc);
        if (dir === 'down') { H(-6, 3, 12, 1, dk); H(-1, 0, 2, 2, WHITE); }
        else if (dir === 'up') H(-2, 3, 4, 1, WHITE);
        else { H(2, 3, 6, 1, dk); H(1, 0, 2, 2, WHITE); }
        return true;
      case 'backcap':
        H(-4, -1, 8, 1, cc); H(-5, 0, 10, 3, cc);
        if (dir === 'down') H(-1, 1, 2, 1, WHITE);
        else if (dir === 'up') H(-4, 3, 8, 2, dk);
        else H(-8, 3, 4, 1, dk);
        return true;
      case 'bucket':
        H(-4, -2, 8, 2, cc); H(-5, 0, 10, 2, cc); H(-5, 1, 10, 1, dk);
        H(side ? -7 : -7, 2, 14, side ? 1 : 2, shade(cc, -0.18));
        return true;
      case 'crown':
        H(-4, -3, 8, 2, GOLD); H(-4, -5, 1, 2, GOLD); H(-1, -5, 2, 2, GOLD); H(3, -5, 1, 2, GOLD);
        H(-4, -3, 8, 1, GOLD_L); H(-1, -2, 2, 1, '#ff2bd6');
        return true;
    }
    return false;
  };

  // accessories on top of everything (glasses, visor, chain, scarf, backpack)
  DL.charTop = function (g, dir, pose, L, o) {
    const ax = AX, ty = o.ty, hy = o.hy, side = o.side;
    const hx = o.hx;
    if (L.outfit === 'hero') {
      // full mask in the suit colour with a dark visor band and glowing gold eyes
      R(g, hx - 4, hy - 1, 8, 1, HERO.suit); R(g, hx - 5, hy, 10, 9, HERO.suit); R(g, hx - 4, hy + 9, 8, 1, HERO.dark);
      if (dir === 'down') {
        R(g, hx + 4, hy + 1, 1, 8, HERO.dark); R(g, hx - 3, hy, 4, 1, HERO.light);
        R(g, hx - 5, hy + 4, 10, 3, HERO.band); R(g, hx - 3, hy + 5, 2, 1, HERO.gold); R(g, hx + 1, hy + 5, 2, 1, HERO.gold);
      } else if (side) {
        R(g, hx + 5, hy + 5, 1, 2, HERO.suit); R(g, hx - 5, hy + 1, 1, 8, HERO.dark); R(g, hx - 2, hy, 4, 1, HERO.light);
        R(g, hx - 1, hy + 4, 7, 3, HERO.band); R(g, hx + 2, hy + 5, 3, 1, HERO.gold);
      } else {
        R(g, hx - 3, hy, 4, 1, HERO.light); R(g, hx - 5, hy + 4, 10, 2, HERO.band); R(g, hx - 1, hy + 6, 2, 3, HERO.dark);
      }
    } else if (L.outfit === 'hacker') {
      // hood up over the head; from the front and the side, a plain white mask with a thin smile
      R(g, hx - 5, hy - 2, 10, 2, HOOD.cloth); R(g, hx - 6, hy, 12, 10, HOOD.cloth); R(g, hx - 4, hy - 2, 4, 1, HOOD.light);
      if (dir === 'down') {
        R(g, hx - 6, hy, 1, 10, HOOD.light); R(g, hx + 5, hy, 1, 10, HOOD.dark);
        R(g, hx - 4, hy + 1, 8, 8, HOOD.mask); R(g, hx + 3, hy + 2, 1, 6, HOOD.maskD); R(g, hx - 4, hy + 1, 8, 1, HOOD.maskD);
        R(g, hx - 3, hy + 4, 2, 1, HOOD.ink); R(g, hx + 1, hy + 4, 2, 1, HOOD.ink);
        R(g, hx - 3, hy + 6, 1, 1, HOOD.ink); R(g, hx - 2, hy + 7, 4, 1, HOOD.ink); R(g, hx + 2, hy + 6, 1, 1, HOOD.ink);
      } else if (side) {
        R(g, hx - 6, hy, 1, 10, HOOD.dark);
        R(g, hx + 1, hy + 1, 5, 8, HOOD.mask); R(g, hx + 1, hy + 1, 1, 8, HOOD.maskD);
        R(g, hx + 3, hy + 4, 2, 1, HOOD.ink); R(g, hx + 3, hy + 7, 2, 1, HOOD.ink); R(g, hx + 5, hy + 6, 1, 1, HOOD.ink);
      } else {
        R(g, hx - 1, hy - 1, 2, 11, HOOD.dark); R(g, hx - 6, hy, 1, 10, HOOD.light);
      }
    } else if (L.outfit === 'tech') {
      // headset over the hair, with a neon status light and a boom microphone
      const hs = '#2b2f38';
      if (dir === 'down') {
        R(g, hx - 5, hy - 1, 10, 1, hs);
        R(g, hx - 6, hy + 3, 2, 4, hs); R(g, hx + 4, hy + 3, 2, 4, hs);
        R(g, hx - 5, hy + 4, 1, 2, NEON.green); R(g, hx + 4, hy + 4, 2, 2, NEON.green);
        R(g, hx + 2, hy + 7, 3, 1, hs); R(g, hx + 1, hy + 7, 1, 1, NEON.green);
      } else if (side) {
        R(g, hx - 5, hy - 1, 8, 1, hs); R(g, hx - 4, hy + 3, 2, 4, hs); R(g, hx - 4, hy + 4, 1, 2, NEON.green);
        R(g, hx - 1, hy + 7, 4, 1, hs); R(g, hx + 2, hy + 7, 1, 1, NEON.green);
      } else {
        R(g, hx - 5, hy - 1, 10, 1, hs);
        R(g, hx - 6, hy + 3, 2, 4, hs); R(g, hx + 4, hy + 3, 2, 4, hs);
        R(g, hx - 2, hy + 5, 4, 1, '#1b1f27');
      }
    } else if (L.outfit === 'astronaut') {
      // glass dome helmet: a white shell, a green-tinted visor and a neon rim
      const shell = '#dfe7ed', shellD = '#b6c1ca', shellL = '#ffffff';
      if (dir === 'down') {
        R(g, hx - 4, hy - 3, 8, 1, shellL); R(g, hx - 5, hy - 2, 10, 1, shell);
        R(g, hx - 6, hy, 1, 9, shellD); R(g, hx + 5, hy, 1, 9, shellD);
        R(g, hx - 5, hy + 9, 10, 2, shell); R(g, hx - 5, hy + 9, 10, 1, shellL);
        R(g, hx - 4, hy, 8, 8, ASTRO.glass);
        R(g, hx - 5, hy + 1, 1, 6, NEON.green); R(g, hx + 4, hy + 1, 1, 6, NEON.green);
        R(g, hx - 3, hy + 1, 1, 2, 'rgba(255,255,255,0.55)'); R(g, hx - 2, hy + 1, 1, 1, 'rgba(255,255,255,0.35)');
        R(g, hx - 1, hy + 10, 2, 1, NEON.green);
      } else if (side) {
        R(g, hx - 4, hy - 3, 9, 1, shellL); R(g, hx - 5, hy - 2, 10, 1, shell);
        R(g, hx - 5, hy, 1, 9, shellD); R(g, hx + 4, hy, 1, 9, shellD);
        R(g, hx - 4, hy + 9, 9, 2, shell); R(g, hx - 4, hy + 9, 9, 1, shellL);
        R(g, hx - 3, hy, 7, 8, ASTRO.glass); R(g, hx + 3, hy + 1, 1, 6, NEON.green);
        R(g, hx - 2, hy + 1, 1, 2, 'rgba(255,255,255,0.55)');
        R(g, hx, hy + 10, 2, 1, NEON.green);
      } else {
        R(g, hx - 4, hy - 3, 8, 1, shellL); R(g, hx - 5, hy - 2, 10, 10, shell);
        R(g, hx - 5, hy + 8, 10, 1, shellD); R(g, hx - 3, hy + 2, 6, 5, shellD);
        R(g, hx - 2, hy + 3, 4, 1, NEON.dim); R(g, hx - 2, hy + 5, 4, 1, NEON.dim);
        R(g, hx - 1, hy + 3, 2, 1, NEON.green);
        R(g, hx - 5, hy + 9, 10, 2, shell); R(g, hx - 1, hy + 10, 2, 1, NEON.green);
      }
    } else if (L.outfit === 'ninja') {
      // black hood and mask leaving an eye slit, with a long neon headband
      if (dir === 'down') {
        R(g, hx - 5, hy - 2, 10, 2, NINJA.cloth); R(g, hx - 6, hy, 12, 9, NINJA.cloth);
        R(g, hx - 5, hy - 2, 5, 1, NINJA.clothL); R(g, hx - 6, hy, 1, 9, NINJA.clothL); R(g, hx + 5, hy, 1, 9, NINJA.clothD);
        R(g, hx - 4, hy + 4, 8, 3, L.skin);
        R(g, hx - 3, hy + 5, 2, 1, NEON.ink); R(g, hx + 1, hy + 5, 2, 1, NEON.ink);
        R(g, hx - 1, hy + 5, 1, 1, NEON.green); R(g, hx + 2, hy + 5, 1, 1, NEON.green);
        R(g, hx - 4, hy + 7, 8, 2, NINJA.clothD);
        R(g, hx - 6, hy + 1, 12, 2, NINJA.band); R(g, hx - 6, hy + 2, 12, 1, NINJA.bandD);
        R(g, hx - 8, hy + 2, 2, 1, NINJA.band); R(g, hx - 9, hy + 3, 1, 3, NINJA.band); R(g, hx - 8, hy + 5, 1, 2, NINJA.bandD);
      } else if (side) {
        R(g, hx - 5, hy - 2, 9, 2, NINJA.cloth); R(g, hx - 6, hy, 11, 9, NINJA.cloth);
        R(g, hx - 5, hy - 2, 4, 1, NINJA.clothL); R(g, hx - 6, hy, 1, 9, NINJA.clothL);
        R(g, hx + 1, hy + 4, 4, 3, L.skin);
        R(g, hx + 3, hy + 4, 1, 1, NEON.ink); R(g, hx + 4, hy + 4, 1, 1, NEON.green);
        R(g, hx + 1, hy + 7, 4, 2, NINJA.clothD);
        R(g, hx - 6, hy + 1, 11, 2, NINJA.band); R(g, hx - 6, hy + 2, 11, 1, NINJA.bandD);
        R(g, hx - 8, hy + 2, 2, 1, NINJA.band); R(g, hx - 9, hy + 3, 1, 4, NINJA.bandD);
      } else {
        R(g, hx - 5, hy - 2, 10, 2, NINJA.cloth); R(g, hx - 6, hy, 12, 10, NINJA.cloth);
        R(g, hx - 5, hy - 2, 5, 1, NINJA.clothL); R(g, hx - 6, hy, 1, 10, NINJA.clothL); R(g, hx + 5, hy, 1, 10, NINJA.clothD);
        R(g, hx - 6, hy + 2, 12, 2, NINJA.band); R(g, hx - 6, hy + 3, 12, 1, NINJA.bandD);
        R(g, hx - 1, hy + 4, 2, 5, NINJA.clothD);
        R(g, hx - 8, hy + 2, 2, 1, NINJA.band); R(g, hx - 9, hy + 3, 1, 3, NINJA.band);
      }
    } else if (L.outfit === 'robot') {
      // metal head, blinking neon eyes (the blink frame comes from sprites.js) and an antenna
      const r = ROBOT, eyeOn = !o.closed;
      if (dir === 'down') {
        R(g, hx - 5, hy - 1, 10, 10, r.metal); R(g, hx - 5, hy - 1, 10, 1, r.metalL);
        R(g, hx - 5, hy, 1, 9, r.metalD); R(g, hx + 4, hy, 1, 9, r.metalD);
        R(g, hx - 1, hy - 4, 2, 3, r.metalD); R(g, hx, hy - 5, 1, 1, NEON.green);
        R(g, hx - 4, hy + 2, 8, 6, r.joint); R(g, hx - 4, hy + 4, 8, 2, '#0a1410');
        if (eyeOn) {
          R(g, hx - 3, hy + 4, 2, 2, NEON.green); R(g, hx + 1, hy + 4, 2, 2, NEON.green);
          R(g, hx - 3, hy + 4, 1, 1, NEON.glow); R(g, hx + 1, hy + 4, 1, 1, NEON.glow);
        } else {
          R(g, hx - 3, hy + 5, 2, 1, NEON.dim); R(g, hx + 1, hy + 5, 2, 1, NEON.dim);
        }
        R(g, hx - 3, hy + 7, 6, 1, r.metalD);
        R(g, hx - 6, hy + 3, 1, 3, r.metalL); R(g, hx + 5, hy + 3, 1, 3, r.metalL);
        R(g, hx + 4, hy + 1, 1, 1, NEON.green);
      } else if (side) {
        R(g, hx - 5, hy - 1, 10, 10, r.metal); R(g, hx - 5, hy - 1, 10, 1, r.metalL);
        R(g, hx - 5, hy, 1, 9, r.metalD); R(g, hx + 4, hy, 1, 9, r.metalD);
        R(g, hx, hy - 4, 2, 3, r.metalD); R(g, hx + 1, hy - 5, 1, 1, NEON.green);
        R(g, hx + 1, hy + 2, 4, 6, r.joint); R(g, hx + 2, hy + 4, 3, 2, '#0a1410');
        if (eyeOn) { R(g, hx + 3, hy + 4, 2, 2, NEON.green); R(g, hx + 3, hy + 4, 1, 1, NEON.glow); }
        else R(g, hx + 2, hy + 5, 3, 1, NEON.dim);
        R(g, hx + 2, hy + 7, 3, 1, r.metalD);
        R(g, hx - 5, hy + 3, 1, 3, r.metalL);
      } else {
        R(g, hx - 5, hy - 1, 10, 10, r.metalD); R(g, hx - 4, hy, 8, 8, r.metal);
        R(g, hx - 4, hy, 8, 1, r.metalL);
        R(g, hx - 1, hy - 4, 2, 3, r.metalD); R(g, hx, hy - 5, 1, 1, NEON.green);
        for (let i = 0; i < 3; i++) R(g, hx - 3, hy + 2 + i * 2, 6, 1, r.joint);
        R(g, hx - 2, hy + 3, 4, 1, NEON.dim); R(g, hx - 2, hy + 6, 4, 1, NEON.green);
        R(g, hx - 6, hy + 3, 1, 3, r.metalL); R(g, hx + 5, hy + 3, 1, 3, r.metalL);
      }
    } else if (L.outfit === 'scientist') {
      // oversized lab glasses with neon-tinted lenses
      const f = SCI.frame, l = SCI.lens;
      if (dir === 'down') {
        R(g, hx - 5, hy + 3, 4, 1, f); R(g, hx - 5, hy + 6, 4, 1, f);
        R(g, hx - 5, hy + 4, 1, 2, f); R(g, hx - 2, hy + 4, 1, 2, f);
        R(g, hx + 1, hy + 3, 4, 1, f); R(g, hx + 1, hy + 6, 4, 1, f);
        R(g, hx + 1, hy + 4, 1, 2, f); R(g, hx + 4, hy + 4, 1, 2, f);
        R(g, hx - 1, hy + 4, 2, 1, f);
        R(g, hx - 4, hy + 4, 2, 2, l); R(g, hx + 2, hy + 4, 2, 2, l);
        R(g, hx - 4, hy + 4, 1, 1, NEON.glow); R(g, hx + 2, hy + 4, 1, 1, NEON.glow);
        R(g, hx - 6, hy + 4, 1, 1, f); R(g, hx + 5, hy + 4, 1, 1, f);
      } else if (side) {
        R(g, hx + 1, hy + 3, 4, 1, f); R(g, hx + 1, hy + 6, 4, 1, f);
        R(g, hx + 1, hy + 4, 1, 2, f); R(g, hx + 4, hy + 4, 1, 2, f);
        R(g, hx + 2, hy + 4, 2, 2, l); R(g, hx + 2, hy + 4, 1, 1, NEON.glow);
        R(g, hx - 3, hy + 4, 4, 1, f);
      } else {
        R(g, hx - 5, hy + 4, 10, 1, f); R(g, hx - 1, hy + 4, 2, 1, SCI.coatD);
      }
    } else if (L.outfit === 'samurai') {
      if (dir === 'down') {
        R(g, hx - 5, hy - 2, 10, 2, SAM.dark); R(g, hx - 6, hy, 12, 2, SAM.armor); R(g, hx - 6, hy, 12, 1, SAM.light);
        R(g, hx - 6, hy + 2, 2, 5, SAM.dark); R(g, hx + 4, hy + 2, 2, 5, SAM.dark);
        R(g, hx - 6, hy + 2, 1, 5, SAM.light); R(g, hx + 5, hy + 2, 1, 5, SAM.light);
        R(g, hx - 4, hy + 2, 8, 7, SAM.dark); R(g, hx - 4, hy + 4, 8, 4, SAM.armor);
        R(g, hx - 3, hy + 5, 6, 1, NEON.ink); R(g, hx - 2, hy + 5, 1, 1, SAM.green); R(g, hx + 1, hy + 5, 1, 1, SAM.green);
        R(g, hx - 1, hy + 8, 2, 1, SAM.light);
        R(g, hx - 4, hy - 5, 1, 3, SAM.green); R(g, hx + 3, hy - 5, 1, 3, SAM.green);
        R(g, hx - 5, hy - 4, 1, 1, SAM.glow); R(g, hx + 4, hy - 4, 1, 1, SAM.glow);
      } else if (side) {
        R(g, hx - 5, hy - 2, 10, 2, SAM.dark); R(g, hx - 6, hy, 12, 2, SAM.armor); R(g, hx - 6, hy, 12, 1, SAM.light);
        R(g, hx - 6, hy + 2, 2, 5, SAM.dark); R(g, hx + 4, hy + 2, 2, 5, SAM.dark);
        R(g, hx - 4, hy + 2, 8, 7, SAM.dark); R(g, hx - 4, hy + 4, 8, 4, SAM.armor);
        R(g, hx + 2, hy + 5, 3, 1, NEON.ink); R(g, hx + 3, hy + 5, 1, 1, SAM.green);
        R(g, hx - 4, hy - 5, 1, 3, SAM.green); R(g, hx + 3, hy - 5, 1, 3, SAM.green);
      } else {
        R(g, hx - 5, hy - 2, 10, 2, SAM.dark); R(g, hx - 6, hy, 12, 2, SAM.armor); R(g, hx - 6, hy, 12, 1, SAM.light);
        R(g, hx - 5, hy + 2, 10, 7, SAM.armor); R(g, hx - 5, hy + 2, 10, 1, SAM.dark); R(g, hx - 1, hy + 3, 2, 5, SAM.green);
        R(g, hx - 4, hy + 6, 8, 1, SAM.dark); R(g, hx - 4, hy - 5, 1, 3, SAM.green); R(g, hx + 3, hy - 5, 1, 3, SAM.green);
      }
      const kx = hx + 6;
      R(g, kx, hy + 3, 1, 11, NEON.green); R(g, kx + 1, hy + 4, 1, 9, NEON.dim);
      R(g, kx - 1, hy + 2, 3, 2, SAM.dark); R(g, kx - 1, hy + 2, 1, 2, SAM.light);
    } else if (L.outfit === 'mage') {
      if (dir === 'down') {
        R(g, hx - 6, hy - 1, 12, 2, MAGE.dark); R(g, hx - 6, hy - 1, 12, 1, MAGE.light);
        R(g, hx - 4, hy - 4, 8, 3, MAGE.robe); R(g, hx - 3, hy - 5, 6, 1, MAGE.robe); R(g, hx - 2, hy - 6, 4, 1, MAGE.light);
        R(g, hx - 4, hy - 2, 8, 1, MAGE.trim); R(g, hx - 2, hy - 3, 3, 1, MAGE.trim); R(g, hx + 1, hy - 4, 1, 1, MAGE.gem);
      } else if (side) {
        R(g, hx - 6, hy - 1, 12, 2, MAGE.dark); R(g, hx - 6, hy - 1, 12, 1, MAGE.light);
        R(g, hx - 3, hy - 4, 8, 3, MAGE.robe); R(g, hx - 2, hy - 5, 5, 1, MAGE.robe); R(g, hx - 1, hy - 6, 3, 1, MAGE.light);
        R(g, hx - 3, hy - 2, 8, 1, MAGE.trim); R(g, hx + 1, hy - 3, 2, 1, MAGE.trim);
      } else {
        R(g, hx - 6, hy - 1, 12, 2, MAGE.dark); R(g, hx - 6, hy - 1, 12, 1, MAGE.light);
        R(g, hx - 4, hy - 4, 8, 3, MAGE.dark); R(g, hx - 3, hy - 5, 6, 1, MAGE.robe); R(g, hx - 2, hy - 6, 4, 1, MAGE.light);
        R(g, hx - 4, hy - 2, 8, 1, MAGE.trim); R(g, hx - 1, hy - 3, 3, 1, MAGE.trim);
      }
      const sx = hx + 6;
      R(g, sx, hy + 4, 1, 13, MAGE.staff); R(g, sx + 1, hy + 5, 1, 10, MAGE.dark);
      R(g, sx - 1, hy + 1, 3, 3, MAGE.gem); R(g, sx, hy + 2, 1, 1, NEON.glow); R(g, sx - 1, hy + 1, 1, 1, '#ffffff');
    } else if (L.outfit === 'knight') {
      if (dir === 'down') {
        R(g, hx - 5, hy - 1, 10, 9, KNIGHT.metal); R(g, hx - 5, hy - 1, 10, 1, KNIGHT.light);
        R(g, hx - 5, hy, 1, 8, KNIGHT.dark); R(g, hx + 4, hy, 1, 8, KNIGHT.dark);
        R(g, hx - 4, hy + 4, 8, 2, KNIGHT.joint); R(g, hx - 3, hy + 5, 6, 1, KNIGHT.flameL);
        R(g, hx - 1, hy - 5, 2, 4, KNIGHT.flame); R(g, hx - 2, hy - 3, 1, 2, KNIGHT.flameL); R(g, hx + 1, hy - 3, 1, 2, KNIGHT.flameL);
        R(g, hx - 5, hy + 7, 10, 1, KNIGHT.dark);
      } else if (side) {
        R(g, hx - 5, hy - 1, 10, 9, KNIGHT.metal); R(g, hx - 5, hy - 1, 10, 1, KNIGHT.light);
        R(g, hx - 5, hy, 1, 8, KNIGHT.dark); R(g, hx + 4, hy, 1, 8, KNIGHT.dark);
        R(g, hx + 1, hy + 4, 4, 2, KNIGHT.joint); R(g, hx + 3, hy + 5, 2, 1, KNIGHT.flameL);
        R(g, hx + 1, hy - 5, 2, 4, KNIGHT.flame); R(g, hx + 2, hy - 3, 1, 2, KNIGHT.flameL);
        R(g, hx - 5, hy + 7, 10, 1, KNIGHT.dark);
      } else {
        R(g, hx - 5, hy - 1, 10, 9, KNIGHT.dark); R(g, hx - 4, hy, 8, 8, KNIGHT.metal);
        R(g, hx - 4, hy, 8, 1, KNIGHT.light); R(g, hx, hy + 1, 1, 7, KNIGHT.joint);
        R(g, hx - 1, hy - 5, 2, 4, KNIGHT.flame); R(g, hx - 5, hy + 7, 10, 1, KNIGHT.dark);
      }
      const shx = side ? ax + 2 : dir === 'up' ? ax - 4 : ax - 8;
      R(g, shx, ty + 1, 4, 5, KNIGHT.metal); R(g, shx + 1, ty + 6, 2, 1, KNIGHT.metal);
      R(g, shx, ty + 1, 4, 1, KNIGHT.light); R(g, shx, ty + 1, 1, 5, KNIGHT.dark); R(g, shx + 3, ty + 1, 1, 5, KNIGHT.dark);
      R(g, shx + 1, ty + 2, 2, 1, KNIGHT.flame); R(g, shx + 1, ty + 3, 1, 2, KNIGHT.flameL); R(g, shx + 2, ty + 4, 1, 1, KNIGHT.flame);
    } else if (L.outfit === 'detective') {
      if (dir === 'down') {
        R(g, hx - 6, hy - 1, 12, 2, DET.hat); R(g, hx - 6, hy, 12, 1, DET.dark);
        R(g, hx - 4, hy - 5, 8, 4, DET.hat); R(g, hx - 3, hy - 5, 4, 1, DET.light);
        R(g, hx - 4, hy - 2, 8, 1, DET.band); R(g, hx - 1, hy - 5, 2, 1, DET.dark);
      } else if (side) {
        R(g, hx - 6, hy - 1, 12, 2, DET.hat); R(g, hx - 6, hy, 12, 1, DET.dark);
        R(g, hx - 3, hy - 5, 8, 4, DET.hat); R(g, hx - 2, hy - 5, 4, 1, DET.light);
        R(g, hx - 3, hy - 2, 8, 1, DET.band); R(g, hx, hy - 5, 2, 1, DET.dark);
      } else {
        R(g, hx - 6, hy - 1, 12, 2, DET.hat); R(g, hx - 6, hy, 12, 1, DET.dark);
        R(g, hx - 4, hy - 5, 8, 4, DET.hat); R(g, hx - 3, hy - 5, 4, 1, DET.light);
        R(g, hx - 4, hy - 2, 8, 1, DET.band);
      }
      if (dir !== 'up') {
        const mx = side ? ax + 3 : ax + 5, my = ty + 4;
        R(g, mx, my, 4, 1, DET.band); R(g, mx, my + 3, 4, 1, DET.band);
        R(g, mx, my + 1, 1, 2, DET.band); R(g, mx + 3, my + 1, 1, 2, DET.band);
        R(g, mx + 1, my + 1, 2, 2, DET.lens); R(g, mx + 1, my + 1, 1, 1, DET.glass);
        R(g, mx + 3, my + 4, 1, 3, DET.hat); R(g, mx + 4, my + 5, 1, 2, DET.hat);
      }
    } else if (L.outfit === 'pilot') {
      if (dir === 'down') {
        R(g, hx - 5, hy - 2, 10, 2, PILOT.shell); R(g, hx - 5, hy, 10, 10, PILOT.shell); R(g, hx - 5, hy - 2, 10, 1, '#ffffff');
        R(g, hx - 5, hy, 1, 9, PILOT.shellD); R(g, hx + 4, hy, 1, 9, PILOT.shellD);
        R(g, hx - 4, hy + 2, 8, 5, PILOT.visor); R(g, hx - 3, hy + 3, 3, 1, PILOT.glass);
        R(g, hx - 4, hy + 2, 1, 5, NEON.green); R(g, hx + 3, hy + 2, 1, 5, NEON.dim);
        R(g, hx - 5, hy + 8, 10, 2, PILOT.suit); R(g, hx - 5, hy + 8, 10, 1, PILOT.light); R(g, hx - 1, hy + 9, 2, 1, NEON.green);
        R(g, hx - 6, hy + 3, 1, 3, PILOT.strap); R(g, hx + 5, hy + 3, 1, 3, PILOT.strap);
        R(g, hx + 1, hy - 4, 1, 2, PILOT.strap); R(g, hx + 1, hy - 5, 1, 1, NEON.green);
      } else if (side) {
        R(g, hx - 5, hy - 2, 10, 2, PILOT.shell); R(g, hx - 5, hy, 10, 10, PILOT.shell); R(g, hx - 5, hy - 2, 10, 1, '#ffffff');
        R(g, hx - 5, hy, 1, 9, PILOT.shellD); R(g, hx + 4, hy, 1, 9, PILOT.shellD);
        R(g, hx - 2, hy + 2, 7, 5, PILOT.visor); R(g, hx - 1, hy + 3, 3, 1, PILOT.glass);
        R(g, hx + 2, hy + 2, 1, 5, NEON.green);
        R(g, hx - 5, hy + 8, 10, 2, PILOT.suit); R(g, hx - 5, hy + 8, 10, 1, PILOT.light);
        R(g, hx - 5, hy + 3, 2, 3, PILOT.strap); R(g, hx + 1, hy - 4, 1, 2, PILOT.strap);
      } else {
        R(g, hx - 5, hy - 2, 10, 10, PILOT.shell); R(g, hx - 5, hy - 2, 10, 1, '#ffffff');
        R(g, hx - 4, hy, 8, 7, PILOT.shellD); R(g, hx - 4, hy + 1, 8, 1, PILOT.dark); R(g, hx - 4, hy + 6, 8, 1, PILOT.dark);
        R(g, hx - 2, hy + 2, 4, 1, NEON.dim); R(g, hx - 1, hy + 3, 2, 1, NEON.green); R(g, hx - 2, hy + 4, 4, 1, NEON.dim);
        R(g, hx - 5, hy + 8, 10, 2, PILOT.suit); R(g, hx - 5, hy + 8, 10, 1, PILOT.light); R(g, hx - 1, hy + 9, 2, 1, NEON.green);
      }
    } else if (L.outfit === 'backup') {
      if (dir === 'down') {
        R(g, hx - 4, hy + 4, 8, 2, BK.dark); R(g, hx - 3, hy + 5, 2, 1, NEON.glow); R(g, hx + 1, hy + 5, 2, 1, NEON.glow);
      } else if (side) {
        R(g, hx + 1, hy + 4, 5, 2, BK.dark); R(g, hx + 3, hy + 5, 2, 1, NEON.glow);
      } else {
        R(g, hx - 5, hy + 5, 10, 1, BK.dark); R(g, hx - 3, hy + 6, 6, 1, BK.cape);
      }
    } else if (L.outfit === 'cowboy') {
      if (dir === 'down') {
        R(g, hx - 7, hy - 1, 14, 2, COW.hat); R(g, hx - 6, hy, 12, 1, COW.hatD);
        R(g, hx - 4, hy - 5, 8, 4, COW.hat); R(g, hx - 3, hy - 5, 3, 1, COW.hatL);
        R(g, hx - 4, hy - 2, 8, 1, COW.neon); R(g, hx - 1, hy - 5, 2, 1, COW.hatD);
      } else if (side) {
        R(g, hx - 7, hy - 1, 14, 2, COW.hat); R(g, hx - 6, hy, 12, 1, COW.hatD);
        R(g, hx - 4, hy - 5, 9, 4, COW.hat); R(g, hx - 3, hy - 5, 3, 1, COW.hatL);
        R(g, hx - 4, hy - 2, 9, 1, COW.neon);
      } else {
        R(g, hx - 7, hy - 1, 14, 2, COW.hat); R(g, hx - 6, hy, 12, 1, COW.hatD);
        R(g, hx - 4, hy - 5, 8, 4, COW.hat); R(g, hx - 3, hy - 5, 3, 1, COW.hatL); R(g, hx - 4, hy - 2, 8, 1, COW.neon);
      }
      R(g, ax - 5, AY - 2, 1, 1, COW.hatL); R(g, ax + 4, AY - 2, 1, 1, COW.hatL);
      R(g, ax - 4, AY - 1, 1, 1, COW.neon); R(g, ax + 3, AY - 1, 1, 1, COW.neon);
    } else if (L.outfit === 'vampire') {
      if (dir === 'down') {
        R(g, hx - 6, hy + 5, 2, 6, VAMP.cape); R(g, hx + 4, hy + 5, 2, 6, VAMP.cape);
        R(g, hx - 5, hy + 6, 1, 4, VAMP.lining); R(g, hx + 4, hy + 6, 1, 4, VAMP.lining);
        R(g, hx - 5, hy - 2, 10, 2, VAMP.cape); R(g, hx - 5, hy, 10, 2, VAMP.cape); R(g, hx - 1, hy + 1, 2, 1, VAMP.cape);
        R(g, hx - 5, hy - 2, 4, 1, '#2a2530');
        R(g, hx - 3, hy + 5, 2, 1, VAMP.red); R(g, hx + 1, hy + 5, 2, 1, VAMP.red); R(g, hx - 1, hy + 8, 2, 1, WHITE);
      } else if (side) {
        R(g, hx - 6, hy + 5, 2, 6, VAMP.cape); R(g, hx + 4, hy + 5, 1, 6, VAMP.lining);
        R(g, hx - 5, hy - 2, 10, 2, VAMP.cape); R(g, hx - 5, hy, 10, 2, VAMP.cape); R(g, hx + 2, hy + 1, 2, 1, VAMP.cape);
        R(g, hx + 2, hy + 5, 2, 1, VAMP.red);
      } else {
        R(g, hx - 5, hy - 2, 10, 3, VAMP.cape); R(g, hx - 5, hy + 1, 10, 8, VAMP.cape);
        R(g, hx - 5, hy + 6, 10, 3, VAMP.capeD); R(g, hx - 1, hy + 8, 2, 1, VAMP.red);
      }
    } else if (L.outfit === 'chef') {
      if (dir === 'down') {
        R(g, hx - 5, hy - 2, 10, 2, CHEF.white); R(g, hx - 4, hy - 5, 8, 3, CHEF.white);
        R(g, hx - 6, hy - 4, 2, 2, CHEF.white); R(g, hx + 4, hy - 4, 2, 2, CHEF.white);
        R(g, hx - 5, hy - 1, 10, 1, CHEF.neck); R(g, hx - 4, hy - 5, 4, 1, CHEF.whiteL);
        R(g, hx - 5, hy - 3, 1, 1, CHEF.whiteD); R(g, hx + 4, hy - 3, 1, 1, CHEF.whiteD);
      } else if (side) {
        R(g, hx - 5, hy - 2, 10, 2, CHEF.white); R(g, hx - 3, hy - 5, 8, 3, CHEF.white);
        R(g, hx - 5, hy - 4, 2, 2, CHEF.white); R(g, hx + 4, hy - 4, 2, 2, CHEF.white);
        R(g, hx - 5, hy - 1, 10, 1, CHEF.neck); R(g, hx - 2, hy - 5, 4, 1, CHEF.whiteL);
      } else {
        R(g, hx - 5, hy - 2, 10, 2, CHEF.white); R(g, hx - 4, hy - 5, 8, 3, CHEF.white);
        R(g, hx - 6, hy - 4, 2, 2, CHEF.whiteD); R(g, hx + 4, hy - 4, 2, 2, CHEF.whiteD);
        R(g, hx - 5, hy - 1, 10, 1, CHEF.neck); R(g, hx - 4, hy - 5, 4, 1, CHEF.whiteL);
      }
    } else if (L.outfit === 'king') {
      if (dir === 'down') {
        R(g, hx - 4, hy - 3, 8, 2, KING.gold); R(g, hx - 4, hy - 5, 1, 2, KING.gold); R(g, hx - 1, hy - 5, 2, 2, KING.gold); R(g, hx + 3, hy - 5, 1, 2, KING.gold);
        R(g, hx - 4, hy - 3, 8, 1, KING.goldL); R(g, hx - 1, hy - 2, 2, 1, KING.jewel); R(g, hx - 3, hy - 2, 1, 1, NEON.green); R(g, hx + 2, hy - 2, 1, 1, NEON.green);
        R(g, hx - 6, hy + 7, 12, 3, KING.fur); R(g, hx - 6, hy + 9, 12, 1, KING.furD);
        R(g, hx - 5, hy + 7, 2, 1, KING.furD); R(g, hx + 3, hy + 7, 2, 1, KING.furD);
      } else if (side) {
        R(g, hx - 3, hy - 3, 8, 2, KING.gold); R(g, hx - 3, hy - 5, 1, 2, KING.gold); R(g, hx, hy - 5, 2, 2, KING.gold); R(g, hx + 4, hy - 5, 1, 2, KING.gold);
        R(g, hx - 3, hy - 3, 8, 1, KING.goldL); R(g, hx, hy - 2, 2, 1, KING.jewel);
        R(g, hx - 6, hy + 7, 12, 3, KING.fur); R(g, hx - 6, hy + 9, 12, 1, KING.furD);
      } else {
        R(g, hx - 4, hy - 3, 8, 2, KING.gold); R(g, hx - 4, hy - 5, 1, 2, KING.gold); R(g, hx - 1, hy - 5, 2, 2, KING.gold); R(g, hx + 3, hy - 5, 1, 2, KING.gold);
        R(g, hx - 4, hy - 3, 8, 1, KING.goldL); R(g, hx - 1, hy - 2, 2, 1, KING.jewel);
        R(g, hx - 6, hy + 7, 12, 3, KING.furD); R(g, hx - 6, hy + 9, 12, 1, KING.fur);
      }
    }
    if (L.visor) {
      if (dir === 'down') { R(g, ax - 5, hy + 4, 10, 2, GOLD); R(g, ax - 4, hy + 5, 8, 1, GOLD_L); }
      else if (side) { R(g, ax, hy + 4, 6, 2, GOLD); R(g, ax + 2, hy + 5, 3, 1, GOLD_L); }
      else R(g, ax - 5, hy + 4, 10, 1, GOLD_D);
    } else if (L.shades) {
      const k = '#0b0d12';
      if (dir === 'down') { R(g, ax - 4, hy + 5, 3, 2, k); R(g, ax + 1, hy + 5, 3, 2, k); R(g, ax - 1, hy + 5, 2, 1, k); R(g, ax - 4, hy + 5, 1, 1, 'rgba(160,195,236,0.7)'); }
      else if (side) { R(g, ax + 1, hy + 5, 4, 2, k); R(g, ax - 2, hy + 5, 3, 1, k); }
    }
    if (L.scarf) {
      const c = '#8a2d3b';
      if (dir === 'down') { R(g, ax - 4, ty, 8, 2, c); R(g, ax - 4, ty + 1, 8, 1, shade(c, -0.25)); R(g, ax + 1, ty + 2, 2, 3, c); R(g, ax + 1, ty + 4, 2, 1, shade(c, -0.3)); }
      else if (dir === 'up') R(g, ax - 4, ty, 8, 2, c);
      else { R(g, ax - 3, ty, 6, 2, c); R(g, ax - 4, ty + 2, 2, 3, c); }
    }
    if (L.chain && dir !== 'up') {
      if (dir === 'down') { R(g, ax - 2, ty, 1, 2, GOLD); R(g, ax - 1, ty + 2, 2, 1, GOLD); R(g, ax + 1, ty, 1, 2, GOLD); R(g, ax - 1, ty + 3, 2, 1, GOLD_L); }
      else R(g, ax + 1, ty + 1, 1, 2, GOLD);
    }
    if (L.backpack && !o.sit) {
      const bp = '#3b4250';
      if (dir === 'up') { R(g, ax - 3, ty + 1, 6, 6, bp); R(g, ax - 3, ty + 1, 6, 1, shade(bp, 0.22)); R(g, ax - 2, ty + 4, 4, 2, shade(bp, -0.22)); R(g, ax - 2, ty + 4, 4, 1, '#9aa3b0'); }
      else if (dir === 'down') { R(g, ax - 4, ty, 1, 6, shade(bp, -0.1)); R(g, ax + 3, ty, 1, 6, shade(bp, -0.1)); }
      else { R(g, ax - 5, ty + 1, 2, 6, bp); R(g, ax - 5, ty + 1, 2, 1, shade(bp, 0.22)); R(g, ax - 2, ty, 1, 4, shade(bp, -0.1)); }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Legendary aura: a soft golden glow at the feet and rising sparkles  */
  /* ------------------------------------------------------------------ */
  DL.drawAura = function (g, x, y, t, layer) {
    const ga = g.globalAlpha;
    if (layer === 'back') {
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
      const gr = g.createRadialGradient(x, y - 12, 2, x, y - 12, 18);
      gr.addColorStop(0, 'rgba(255,214,102,' + (0.22 * pulse).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,214,102,0)');
      g.fillStyle = gr;
      g.fillRect(x - 18, y - 32, 36, 36);
      g.globalAlpha = ga * (0.5 + 0.2 * pulse);
      g.strokeStyle = '#f2c14e';
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(x, y + 0.5, 7.5, 3.6, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = ga;
      return;
    }
    // sparkles drifting up around the body
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.45 + i * 0.25) % 1;
      const sx = x + Math.sin(i * 2.1 + t * 0.8) * 7, sy = y - 4 - ph * 26;
      g.globalAlpha = ga * Math.sin(ph * Math.PI) * 0.85;
      g.fillStyle = i % 2 ? '#fff1b8' : '#f2c14e';
      g.fillRect(sx, sy, 1, 1);
      if (i === 0) { g.fillRect(sx - 1, sy, 0.5, 0.5); g.fillRect(sx + 1, sy, 0.5, 0.5); }
    }
    g.globalAlpha = ga;
  };
})();
