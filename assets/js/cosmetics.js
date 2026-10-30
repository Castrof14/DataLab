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
  // datacenter (a rack can override its own skin in build mode). Skins (shirt slot) change the player's
  // profile; accessories (head / face / neck / back / hands) and the pet are kept by the inventory like
  // the infrastructure slots (DL.GEAR_SLOTS).
  // cur: 'gold' (moeda dourada). price 0 + gift = only obtainable (events, rewards).
  const C = [];
  const add = (o) => C.push(Object.assign({ cur: 'gold', stack: false, sell: true }, o));

  // --- Character skins (full-body, worn in the shirt slot): the hacker collection. All original designs,
  // in the game's palette (navy, turquoise, blue, slate). The first one is what replaces a retired skin.
  add({ id: 'hx_hoodie', cat: 'char', slot: 'shirt', value: 'hx_hoodie', name: 'Moletom do Código', theme: 'Hacker', rarity: 'common', price: 45, desc: 'Moletom azul-marinho com capuz e linhas de código turquesa descendo pelo rosto.' });
  add({ id: 'hx_leather', cat: 'char', slot: 'shirt', value: 'hx_leather', name: 'Jaqueta Holo', theme: 'Hacker', rarity: 'rare', price: 95, desc: 'Jaqueta de couro escura, gola alta e um visor holográfico turquesa na frente dos olhos.' });
  add({ id: 'hx_agent', cat: 'char', slot: 'shirt', value: 'hx_agent', name: 'Agente Sem Nome', theme: 'Hacker', rarity: 'rare', price: 120, desc: 'Terno preto, gravata fina, óculos escuros e um fone com fio enrolado atrás da orelha.' });
  add({ id: 'hx_ninja', cat: 'char', slot: 'shirt', value: 'hx_ninja', name: 'Ninja de LED', theme: 'Hacker', rarity: 'epic', price: 170, desc: 'Roupa de infiltração azul-marinho e máscara de LED com olhos turquesa que piscam.' });
  add({ id: 'hx_coat', cat: 'char', slot: 'shirt', value: 'hx_coat', name: 'Sobretudo Neon', theme: 'Hacker', rarity: 'epic', price: 190, desc: 'Sobretudo longo cinza-azulado com as bordas e a barra acesas em turquesa.' });
  add({ id: 'hx_bot', cat: 'char', slot: 'shirt', value: 'hx_bot', name: 'Robô do Terminal', theme: 'Hacker', rarity: 'epic', price: 220, desc: 'Corpo de metal azulado e uma tela no lugar do rosto, com o cursor do terminal piscando.' });
  add({ id: 'hx_ghost', cat: 'char', slot: 'shirt', value: 'hx_ghost', name: 'Fantasma Digital', theme: 'Hacker', rarity: 'legendary', price: 320, desc: 'Meio transparente, feito de luz azul, com falhas de glitch que fazem o corpo tremer.' });
  add({ id: 'hx_master', cat: 'char', slot: 'shirt', value: 'hx_master', name: 'Mestre do Terminal', theme: 'Hacker', rarity: 'legendary', price: 380, desc: 'Capa longa coberta de linhas de código turquesa e capuz de quem já viu todos os logs.' });
  // full-body costumes from the previous collection that stay on sale (recolour legs, hands and boots and
  // cover the head: DL.charCostume + charOutfit + charTop below)
  add({ id: 'costume_astronaut', cat: 'char', slot: 'shirt', value: 'astronaut', name: 'Astronauta', rarity: 'epic', price: 120, desc: 'Traje branco pressurizado com capacete de vidro e painel neon. Pronto para o próximo deploy fora do planeta.' });
  add({ id: 'costume_ninja', cat: 'char', slot: 'shirt', value: 'ninja', name: 'Ninja do Código', rarity: 'epic', price: 100, desc: 'Roupa preta de infiltração com faixa verde neon e máscara. Ninguém vê o código passar.' });
  add({ id: 'costume_robot', cat: 'char', slot: 'shirt', value: 'robot', name: 'Robô', rarity: 'epic', price: 130, desc: 'Corpo de metal com juntas, chassi iluminado e olhos verdes que piscam. Mais máquina que pessoa.' });
  add({ id: 'costume_scientist', cat: 'char', slot: 'shirt', value: 'scientist', name: 'Cientista de Dados', rarity: 'rare', price: 80, desc: 'Jaleco branco, óculos grandes e caneta neon no bolso. Transforma dados em decisões.' });
  add({ id: 'costume_samurai', cat: 'char', slot: 'shirt', value: 'samurai', name: 'Samurai Digital', rarity: 'epic', price: 160, desc: 'Armadura preta com frisos verdes, máscara e katana de luz. Disciplina de outro nível.' });
  add({ id: 'costume_knight', cat: 'char', slot: 'shirt', value: 'knight', name: 'Cavaleiro do Firewall', rarity: 'epic', price: 170, desc: 'Armadura de metal, elmo e escudo com chamas azuis. Protege o firewall corpo a corpo.' });
  add({ id: 'costume_detective', cat: 'char', slot: 'shirt', value: 'detective', name: 'Detetive Cibernético', rarity: 'rare', price: 110, desc: 'Casaco longo, chapéu e lupa brilhante. Investiga cada pacote suspeito.' });
  add({ id: 'costume_pilot', cat: 'char', slot: 'shirt', value: 'pilot', name: 'Piloto Espacial', rarity: 'rare', price: 90, desc: 'Macacão laranja, capacete com visor e painel no peito. Pilota até o rack mais distante.' });
  add({ id: 'costume_backup', cat: 'char', slot: 'shirt', value: 'backup', name: 'Super-Herói do Backup', rarity: 'epic', price: 140, desc: 'Capa vermelha com símbolo de disco no peito. Salva seus dados antes que o pior aconteça.' });
  add({ id: 'costume_cowboy', cat: 'char', slot: 'shirt', value: 'cowboy', name: 'Cowboy do Código', rarity: 'rare', price: 80, desc: 'Chapéu, colete e botas com esporas neon. Domando servidores como um rebanho.' });
  add({ id: 'costume_vampire', cat: 'char', slot: 'shirt', value: 'vampire', name: 'Vampiro da Madrugada', rarity: 'epic', price: 150, desc: 'Capa preta, gola alta e olhos vermelhos. Só trabalha depois da meia-noite.' });

  // --- Accessories: one per body position, drawn over any skin (DL.charGear below). The position is the
  // item's slot, so two pieces never fight for the same spot.
  add({ id: 'gear_antenna', cat: 'char', slot: 'head', value: 'antenna', name: 'Boné com Antena', rarity: 'common', price: 35, desc: 'Boné azul-marinho com uma antena que pisca turquesa. Pega sinal até no subsolo.' });
  add({ id: 'gear_headset', cat: 'char', slot: 'head', value: 'headset', name: 'Fone Gamer LED', rarity: 'rare', price: 60, desc: 'Fone fechado com aro de LED turquesa e microfone de haste.' });
  add({ id: 'gear_nvg', cat: 'char', slot: 'face', value: 'nvg', name: 'Óculos de Visão Noturna', rarity: 'rare', price: 70, desc: 'Dois tubos com lentes que brilham em turquesa. Enxerga o cabo solto no escuro.' });
  add({ id: 'gear_holovisor', cat: 'char', slot: 'face', value: 'holovisor', name: 'Visor Holográfico', rarity: 'epic', price: 110, desc: 'Uma faixa de luz azul na frente dos olhos, com dados correndo de um lado para o outro.' });
  add({ id: 'gear_ledmask', cat: 'char', slot: 'face', value: 'ledmask', name: 'Máscara de LED', rarity: 'epic', price: 120, desc: 'Cobre boca e nariz com uma grade de LEDs que desenha um sorriso turquesa.' });
  add({ id: 'gear_usb', cat: 'char', slot: 'neck', value: 'usb', name: 'Pendrive no Pescoço', rarity: 'common', price: 25, desc: 'Um pendrive azul num cordão. Os arquivos mais importantes sempre por perto.' });
  add({ id: 'gear_laptop', cat: 'char', slot: 'back', value: 'laptop', name: 'Mochila com Notebook', rarity: 'rare', price: 65, desc: 'Mochila cinza-azulada com um notebook aberto aparecendo por cima, tela acesa.' });
  add({ id: 'gear_gloves', cat: 'char', slot: 'hands', value: 'gloves', name: 'Luvas de Circuito', rarity: 'epic', price: 95, desc: 'Luvas escuras com trilhas de circuito que brilham em turquesa nas mãos.' });

  // --- Pets: a companion that follows the player around (one at a time, slot 'pet'; pets.js moves it)
  add({ id: 'pet_bug', cat: 'char', slot: 'pet', value: 'bug', name: 'Bug Brilhante', rarity: 'common', price: 50, desc: 'Um inseto digital de luz turquesa. O único bug que você vai querer por perto.' });
  add({ id: 'pet_drone', cat: 'char', slot: 'pet', value: 'drone', name: 'Drone Turquesa', rarity: 'rare', price: 80, desc: 'Drone pequeno de quatro hélices que flutua atrás de você com uma luz turquesa.' });
  add({ id: 'pet_catbot', cat: 'char', slot: 'pet', value: 'catbot', name: 'Gato Robô', rarity: 'epic', price: 140, desc: 'Gato de metal azulado com olhos de LED e uma antena no lugar do rabo.' });
  add({ id: 'pet_server', cat: 'char', slot: 'pet', value: 'server', name: 'Mini Servidor', rarity: 'epic', price: 160, desc: 'Um servidorzinho com perninhas e LEDs piscando. Corre atrás de você fazendo uptime.' });
  add({ id: 'pet_holodog', cat: 'char', slot: 'pet', value: 'holodog', name: 'Cachorro Holográfico', rarity: 'legendary', price: 260, desc: 'Cachorro feito de luz azul, com linhas de varredura e rabo que não para.' });

  // --- Equipamentos · skins of the hacking tools: the look of the in-game terminal (slot 'terminal',
  // terminal.js + DL.termFx below). Only the appearance: commands work the same.
  add({ id: 'term_retro', cat: 'equip', slot: 'terminal', value: 'retro', name: 'Terminal Retrô', rarity: 'common', price: 40, desc: 'Tela de fósforo verde dos anos 80, com linhas de varredura e o brilho do tubo.' });
  add({ id: 'term_neon', cat: 'equip', slot: 'terminal', value: 'neon', name: 'Terminal Neon Turquesa', rarity: 'rare', price: 70, desc: 'Letras turquesa com brilho de neon e borda acesa em volta do console.' });
  add({ id: 'term_matrix', cat: 'equip', slot: 'terminal', value: 'matrix', name: 'Terminal Matrix', rarity: 'epic', price: 120, desc: 'Colunas de caracteres turquesa caindo no fundo enquanto você digita.' });
  add({ id: 'term_skull', cat: 'equip', slot: 'terminal', value: 'skull', name: 'Terminal Caveira Pixel', rarity: 'epic', price: 140, desc: 'Uma caveira em pixel art no fundo do console, com os olhos piscando em azul.' });
  add({ id: 'term_glitch', cat: 'equip', slot: 'terminal', value: 'glitch', name: 'Terminal Glitch', rarity: 'epic', price: 160, desc: 'O console treme de vez em quando e as cores falham em faixas azuis e turquesa.' });
  add({ id: 'term_holo', cat: 'equip', slot: 'terminal', value: 'holo', name: 'Terminal Holográfico', rarity: 'legendary', price: 240, desc: 'Painel de luz azul meio transparente, com grade e uma linha de varredura subindo.' });

  // --- Equipamentos · skins of the PCs and servers: every rack, the servers in it and every storage of
  // the datacenter change look (slot 'rack'; a rack can still wear its own skin in build mode)
  add({ id: 'm_retro', cat: 'equip', slot: 'rack', value: 'm_retro', name: 'PC Retrô', rarity: 'common', price: 60, desc: 'Gabinete bege dos anos 90, com grade de ventilação, selo azul e luz de força.' });
  add({ id: 'm_led', cat: 'equip', slot: 'rack', value: 'm_led', name: 'Gabinete LED Turquesa', rarity: 'rare', price: 90, desc: 'Azul-marinho com trilhos de LED turquesa que pulsam devagar.' });
  add({ id: 'm_armor', cat: 'equip', slot: 'rack', value: 'm_armor', name: 'Servidor Blindado', rarity: 'rare', price: 130, desc: 'Preto, coberto de placas de metal rebitadas. Aguenta qualquer incidente.' });
  add({ id: 'm_glass', cat: 'equip', slot: 'rack', value: 'm_glass', name: 'PC Gamer de Vidro', rarity: 'epic', price: 180, desc: 'Lateral de vidro e coolers girando em turquesa, azul e cinza-azulado.' });
  add({ id: 'm_cyber', cat: 'equip', slot: 'rack', value: 'm_cyber', name: 'Rack Cyberpunk', rarity: 'epic', price: 220, desc: 'Cabos pendurados pelos trilhos com uma luz correndo por dentro deles.' });
  add({ id: 'm_crystal', cat: 'equip', slot: 'rack', value: 'm_crystal', name: 'Servidor Cristal', rarity: 'legendary', price: 300, desc: 'Transparente como vidro: dá para ver as placas e os LEDs lá dentro.' });

  // --- Cosméticos: furniture and decoration for the datacenter (slot 'furniture'; the value is the build
  // catalog entry, cosm-furniture.js). Bought here, placed in build mode → Cosméticos.
  const FURN = (id, name, rarity, price, desc) => add({ id, cat: 'decor', slot: 'furniture', value: id, name, rarity, price, sell: false, desc });
  FURN('cz_desk3', 'Mesa com 3 Monitores', 'rare', 150, 'Três telas com código rolando e uma faixa turquesa na mesa. Ocupa 2 tiles.');
  FURN('cz_arcade', 'Fliperama', 'epic', 140, 'Gabinete azul-marinho com letreiro turquesa e um jogo da cobrinha na tela.');
  FURN('cz_sign', 'Placa Neon DATALAB', 'epic', 130, 'O nome do jogo em neon turquesa, piscando de leve na parede do fundo.');
  FURN('cz_fridge', 'Geladeira de Energético', 'rare', 100, 'Porta de vidro com três prateleiras de latas e um raio aceso no topo.');
  FURN('cz_sofa', 'Sofá', 'rare', 90, 'Sofá azul-marinho de dois lugares com almofadas turquesa e azul.');
  FURN('cz_chair', 'Cadeira Gamer', 'rare', 80, 'Concha azul-marinho com duas listras turquesa e apoio de cabeça.');
  FURN('cz_lamp', 'Luminária Neon', 'uncommon', 60, 'Um anel de neon turquesa num pedestal. Ilumina o chão em volta.');
  FURN('cz_coffee', 'Máquina de Café', 'uncommon', 55, 'Café na hora, com o visor aceso e vapor saindo da xícara.');
  FURN('cz_codeart', 'Quadro com Código', 'uncommon', 50, 'Uma função emoldurada na parede, com o cursor piscando no fim.');
  FURN('cz_rug', 'Tapete Pixel', 'common', 40, 'Tapete 2 × 2 com borda quadriculada e o prompt >_ no meio.');
  FURN('cz_plant', 'Planta em Vaso', 'common', 25, 'Folhas em tons de turquesa num vaso azul-marinho que balançam de leve.');

  // --- Retired items (no longer sold or kept): their price is given back once, in Gold, to whoever had
  // them (inventory.js; the server does the same for accounts). Gifts were free: nothing to give back.
  DL.RETIRED_COSMETICS = {
    rack_clean: 15, rack_corp: 15, rack_industrial: 30, rack_gamer: 60, rack_cyber: 120, rack_gold: 250, rack_launch: 90,
    srv_clean: 15, srv_carbon: 30, srv_neon: 55, srv_cyber: 110, srv_gold: 230,
    sw_clean: 15, sw_industrial: 30, sw_gamer: 55, sw_cyber: 110,
    sto_clean: 15, sto_industrial: 30, sto_cyber: 110, sto_gold: 230,
    acc_fans: 25, acc_beacon: 25, acc_plate: 45, acc_stickers: 10,
    led_cyan: 12, led_magenta: 22, led_amber: 22, led_rgb: 50, led_gold: 100,
    shirt_polo: 12, shirt_striped: 12, shirt_flannel: 25, shirt_jacket: 45, shirt_jersey: 45, shirt_launch: 40,
    costume_hero: 120, costume_ceo: 70, costume_hacker: 100, costume_tech: 70, costume_mage: 150, costume_chef: 60, costume_king: 300,
    pants_jeans: 12, pants_cargo: 22, pants_baggy: 22, pants_joggers: 40, pants_shorts: 10,
    hair_undercut: 12, hair_spiky: 22, hair_braids: 40, hair_mohawk: 90,
    hat_snapback: 12, hat_backcap: 20, hat_bucket: 40, hat_crown: 250, hat_launch: 0,
    acc_shades: 10, acc_scarf: 10, acc_backpack: 20, acc_chain: 90,
    pal_pastel: 20, pal_neon: 40, pal_gold: 100,
  };
  // the skins (shirt-slot values) among them: whoever wears one gets the first new skin instead
  DL.RETIRED_OUTFITS = ['polo', 'striped', 'flannel', 'jacket', 'jersey', 'launch', 'hero', 'ceo', 'hacker', 'tech', 'mage', 'chef', 'king'];

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

  // accessory positions (where each one sits on the body) + the pet: one item per slot
  DL.GEAR_POS = { head: 'Cabeça', face: 'Rosto', neck: 'Pescoço', back: 'Costas', hands: 'Mãos' };
  DL.GEAR_SLOTS = Object.keys(DL.GEAR_POS).concat('pet');

  // Shop / inventory categories (the inventory groups items by these)
  DL.COSMETIC_GROUPS = [
    { id: 'skins', name: 'Skins', test: (it) => it.slot === 'shirt' },
    { id: 'acc', name: 'Acessórios', test: (it) => !!DL.GEAR_POS[it.slot] || it.slot === 'hat' },
    { id: 'pet', name: 'Pets', test: (it) => it.slot === 'pet' },
    { id: 'emote', name: 'Emotes', test: (it) => it.cat === 'emote' },
    { id: 'hack', name: 'Skins de hacks', test: (it) => it.slot === 'terminal' },
    { id: 'rack', name: 'Skins de PCs e servidores', test: (it) => it.slot === 'rack' },
    { id: 'decor', name: 'Cosméticos', test: (it) => it.slot === 'furniture' },
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
  const turqA = (a) => 'rgba(45,226,200,' + Math.max(0, Math.min(1, a)).toFixed(2) + ')';

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
    // Equipamentos · PCs and servers (the game's palette; the retro one is the beige of the 90s)
    m_retro: { cap: '#cfc2a0', capHi: '#efe6cf', frame: '#d8cba8', hi: '#efe6cf', dk: '#8a7f66', side: '#c9bb97', vent: '#a39677', accent: '#3d7bd9', pattern: 'retro' },
    m_led: { cap: '#0b1730', capHi: '#1a2b4d', frame: '#0b1730', hi: '#1a2b4d', dk: '#060d1c', side: '#0d1a33', vent: '#060d1c', accent: '#2de2c8', accent2: '#a5f7ea', pattern: 'pulse' },
    m_armor: { cap: '#141a24', capHi: '#323d50', frame: '#181f2b', hi: '#56657d', dk: '#05080f', side: '#151b26', vent: '#0b0f17', accent: '#8797b0', pattern: 'plates' },
    m_glass: { cap: '#0d1626', capHi: '#26344d', frame: '#111b2d', hi: '#26344d', dk: '#05080f', side: 'rgba(127,178,240,0.22)', vent: '#0b1220', accent: '#2de2c8', accent2: '#3d7bd9', pattern: 'glass' },
    m_cyber: { cap: '#060d1c', capHi: '#1a2b4d', frame: '#0b1730', hi: '#21477f', dk: '#05080f', side: '#0b1428', vent: '#05080f', accent: '#2de2c8', accent2: '#3d7bd9', pattern: 'cables' },
    m_crystal: { cap: 'rgba(127,178,240,0.55)', capHi: 'rgba(165,247,234,0.9)', frame: 'rgba(127,178,240,0.45)', hi: 'rgba(165,247,234,0.85)', dk: 'rgba(33,71,127,0.7)', side: 'rgba(127,178,240,0.25)', vent: 'rgba(165,247,234,0.35)', accent: '#2de2c8', accent2: '#7fb2f0', pattern: 'crystal' },
  };
  // palette colours the glass PC's coolers cycle through
  const COOLERS = ['#2de2c8', '#3d7bd9', '#8797b0', '#7fb2f0'];
  const cooler = (t, k) => COOLERS[Math.floor(t * 1.5 + k) % COOLERS.length];
  const BEZEL = {
    clean: { hi: '#f4f6f8', body: '#d9dde3', mark: '#9aa3b0' },
    carbon: { hi: '#34343b', body: '#17171b', mark: '#26262c', checker: true },
    neon: { hi: '#00e5ff', body: '#0f1c26', mark: '#00a3b8' },
    cyber: { hi: '#ff2bd6', body: '#1f1235', mark: '#00e5ff' },
    gold: { hi: '#ffe08a', body: '#b8892f', mark: '#fff1b8' },
    m_retro: { hi: '#efe6cf', body: '#d8cba8', mark: '#5a5244', slot: true },
    m_led: { hi: '#2de2c8', body: '#0b1730', mark: '#14897a' },
    m_armor: { hi: '#56657d', body: '#141a24', mark: '#8797b0', rivet: true },
    m_glass: { hi: '#26344d', body: '#0d1626', mark: '#2de2c8', cycle: true },
    m_cyber: { hi: '#3d7bd9', body: '#060d1c', mark: '#2de2c8' },
    m_crystal: { hi: 'rgba(165,247,234,0.8)', body: 'rgba(127,178,240,0.3)', mark: '#2de2c8' },
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
  // the PC / server skins (Equipamentos, values m_*) dress the whole machine: the rack's frame, the
  // server fronts inside it and the storages too
  function machine(e) {
    const it = effective(e, 'rack');
    return it && it.value.indexOf('m_') === 0 ? it : null;
  }
  const serverSkin = (e) => effective(e, 'server') || machine(e);
  const storageSkin = (e) => effective(e, 'storage') || machine(e);
  // part of iso.js' look cache key: a new skin means a new measured look
  DL.skinKey = function (e) {
    if (e.kind === 'rack') return ['rack', 'server', 'switch', 'rackacc', 'led'].map((s) => { const it = s === 'server' ? serverSkin(e) : effective(e, s); return it ? it.id : ''; }).join(',');
    if (e.kind === 'storage') { const it = storageSkin(e); return it ? it.id : ''; }
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
    // Equipamentos · PCs and servers
    const glow = turqA(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + (e.seed || 0))));
    if (P.pattern === 'retro') { R(g, px + 11, py - 22, 3, 2, P.accent); R(g, px + 2, py - 22, 1, 1, Math.sin(t * 2) > -0.6 ? '#2de2c8' : '#14897a'); }
    if (P.pattern === 'pulse') R(g, px, py - 19, 16, 1, glow);
    if (P.pattern === 'plates') { R(g, px + 1, py - 23, 1, 1, P.accent); R(g, px + 14, py - 23, 1, 1, P.accent); R(g, px + 8, py - 24, 1, 6, P.dk); }
    if (P.pattern === 'glass') for (const fx of [px + 2, px + 9]) {
      const a = Math.floor(t * 12) % 2, c = cooler(t, fx);
      R(g, fx, py - 23, 5, 3, '#05080f');
      R(g, fx + (a ? 1 : 2), py - 22, a ? 3 : 1, 1, c);
      R(g, fx + 2, py - 23 + (a ? 1 : 0), 1, a ? 1 : 3, c);
    }
    if (P.pattern === 'cables') { R(g, px + 1, py - 19, 14, 1, P.accent2); R(g, px + 1 + Math.floor((t * 10) % 14), py - 19, 2, 1, P.accent); }
    if (P.pattern === 'crystal') R(g, px + 3, py - 22, 10, 3, 'rgba(45,226,200,0.35)');
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
      if (P.pattern === 'pulse' || P.pattern === 'cables') { R(g, px + 2, py + 10, 12, 1, glow); R(g, px + 2, py - 16, 12, 1, glow); }
      if (P.pattern === 'plates') { R(g, px + 2, py - 2, 12, 1, P.dk); for (const [x, y] of [[3, -15], [12, -15], [3, 9], [12, 9], [3, -4], [12, -4]]) R(g, px + x, py + y, 1, 1, P.accent); }
      if (P.pattern === 'retro') { R(g, px + 4, py + 6, 3, 2, P.accent); R(g, px + 9, py + 7, 3, 1, P.dk); }
      if (P.pattern === 'glass') for (const [y, k] of [[-12, 0], [-1, 2]]) {
        // two coolers seen through the side glass
        R(g, px + 5, py + y, 6, 6, '#05080f');
        const a = Math.floor(t * 12 + k) % 2, c = cooler(t, k);
        R(g, px + 6 + (a ? 0 : 2), py + y + (a ? 2 : 1), a ? 4 : 1, a ? 1 : 4, c);
        R(g, px + 6 + (a ? 2 : 0), py + y + (a ? 1 : 2), a ? 1 : 4, a ? 4 : 1, c);
      }
      if (P.pattern === 'crystal') {
        // the boards and LEDs inside, through the glass
        R(g, px + 4, py - 12, 7, 3, 'rgba(45,226,200,0.45)'); R(g, px + 5, py - 5, 6, 2, 'rgba(61,123,217,0.6)'); R(g, px + 4, py + 2, 8, 3, 'rgba(45,226,200,0.3)');
        for (let i = 0; i < 3; i++) R(g, px + 5 + i * 2, py + 7, 1, 1, Math.sin(t * 5 + i) > 0 ? '#a5f7ea' : '#14897a');
      }
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
    if (P.pattern === 'pulse') { R(g, px + 1, py - 17, 1, 30, glow); R(g, px + 14, py - 17, 1, 30, glow); R(g, px + 2, py + 12, 12, 1, glow); }
    if (P.pattern === 'plates') {
      // metal plates bolted along the rails
      R(g, px, py - 18, 16, 2, P.hi);
      for (let y = py - 15; y < py + 12; y += 6) { R(g, px, y + 3, 2, 1, P.dk); R(g, px + 14, y + 3, 2, 1, P.dk); R(g, px + 1, y + 1, 1, 1, P.accent); R(g, px + 14, y + 1, 1, 1, P.accent); }
    }
    if (P.pattern === 'retro') { R(g, px + 1, py + 12, 14, 1, P.dk); R(g, px + 2, py + 12, 3, 1, P.accent); R(g, px + 12, py + 12, 1, 1, Math.sin(t * 2) > -0.6 ? '#2de2c8' : '#14897a'); }
    if (P.pattern === 'glass') {
      // glass door with a sheen sliding over it, coolers lighting the rails
      R(g, px + 2, py - 16, 12, 28, 'rgba(127,178,240,0.08)');
      const s = Math.floor((t * 8) % 36) - 6;
      if (s >= 0 && s < 12) R(g, px + 2 + s, py - 16, 1, 28, 'rgba(165,247,234,0.18)');
      R(g, px + 1, py - 17, 1, 30, cooler(t, 0)); R(g, px + 14, py - 17, 1, 30, cooler(t, 2));
    }
    if (P.pattern === 'cables') {
      // a cable hanging along each rail, light running down inside it
      const k = Math.floor((t * 14) % 34);
      for (let y = 0; y < 30; y++) {
        const sag = Math.round(Math.sin((y / 29) * Math.PI) * 1.5), lit = Math.abs(y - k) < 3;
        R(g, px + 1 + sag, py - 17 + y, 1, 1, lit ? '#a5f7ea' : P.accent2);
        R(g, px + 14 - sag, py - 17 + y, 1, 1, Math.abs(29 - y - k) < 3 ? '#a5f7ea' : P.accent);
      }
    }
    if (P.pattern === 'crystal') { const y = Math.floor((t * 18) % 30); R(g, px + 1, py - 17 + y, 1, 2, 'rgba(255,255,255,0.75)'); R(g, px + 14, py + 12 - y, 1, 2, 'rgba(255,255,255,0.6)'); }
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
    const sv = serverSkin(e), sw = effective(e, 'switch');
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
        else if (B.slot) R(g, px + 5, uy + 1, 4, 1, B.mark); // a floppy slot
        else if (B.rivet) { R(g, px + 4, uy + 1, 1, 1, B.mark); R(g, px + 9, uy + 1, 1, 1, B.mark); }
        else if (B.cycle) R(g, px + 5, uy + 1, 3, 1, cooler(t, k));
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
    const it = storageSkin(e);
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
  const NEON = { green: '#39ff14', glow: '#b6ff9a', dim: '#1f8f0f', ink: '#0b0d12' };
  const ASTRO = { suit: '#eef1f4', suitD: '#c3ccd4', suitL: '#ffffff', panel: '#1b2230', glass: 'rgba(140,255,170,0.16)' };
  const NINJA = { cloth: '#14161c', clothD: '#0a0b0f', clothL: '#262a33', band: '#39ff14', bandD: '#1f8f0f' };
  const ROBOT = { metal: '#6f7a86', metalD: '#3d4650', metalL: '#aab4bf', joint: '#2b323a' };
  const SCI = { coat: '#eef1f4', coatD: '#c3ccd4', shirt: '#1b2230', frame: '#0b0d12', lens: 'rgba(57,255,20,0.22)' };
  const SAM = { armor: '#1a1f2b', dark: '#0b0e14', light: '#303849', green: NEON.green, glow: NEON.glow };
  const KNIGHT = { metal: '#8b96a6', dark: '#4a5565', light: '#c3ccd9', joint: '#2b323a', flame: '#3aa0ff', flameL: '#8fd3ff' };
  const DET = { coat: '#3b3540', dark: '#221f29', light: '#5a5264', hat: '#2b2630', band: '#39ff14', lens: 'rgba(57,255,20,0.28)', glass: NEON.glow };
  const PILOT = { suit: '#ff7a17', dark: '#b34a0a', light: '#ffb36b', shell: '#eef1f4', shellD: '#c3ccd4', visor: '#1b2230', glass: 'rgba(57,255,20,0.22)', strap: '#2b2f38' };
  const BK = { suit: '#d92b3a', dark: '#8f1622', light: '#ff6b78', cape: '#b01d2b', capeD: '#6e101a', white: '#f1f1ee', ring: NEON.green };
  const COW = { hat: '#7a5230', hatD: '#4a2f1d', hatL: '#a97a4a', shirt: '#d9c7a3', vest: '#3b2b22', vestD: '#241a14', denim: '#2e4a6b', boots: '#4a2f1d', neon: NEON.green };
  const VAMP = { cape: '#141018', capeD: '#08060b', lining: '#7a1220', shirt: '#1b1620', skin: '#e2dcd6', red: '#ff2b3a', redD: '#8f1622' };
  const BARE = { hat: '', glasses: false, headset: false, beard: false, earrings: false, shades: false, visor: false, scarf: false, hairStyle: 'buzz' };
  // role: null drops the job's gear (cable coil, tie, tool belt…), which would sit on top of the costume
  const SUIT = { lanyard: null, badge: null, vest: null, role: null };
  // the hacker skins keep the player's own hair when nothing covers the head
  const OPEN = { hat: '', glasses: false, headset: false, shades: false, visor: false, scarf: false };
  // the game's palette: navy, turquoise, blue and slate (grey-blue)
  const HX = {
    navy: '#0b1730', navyD: '#060d1c', navyL: '#1a2b4d', turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a',
    blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0', slateD: '#323d50', ink: '#05080f',
    leather: '#161c28', leatherL: '#2a3344', metal: '#4a5d7a', metalL: '#8aa0c2', metalD: '#2c3a52', screen: '#06121a', shadow: '#05090f',
  };
  DL.HX = HX;
  DL.charCostume = function (L) {
    switch (L.outfit) {
      case 'hx_hoodie': return Object.assign({}, BARE, SUIT, { shirt: HX.navy, pants: HX.slateD, shoes: HX.ink });
      case 'hx_leather': return Object.assign({}, OPEN, SUIT, { shirt: HX.leather, pants: HX.navyD, shoes: HX.ink });
      case 'hx_agent': return Object.assign({}, OPEN, SUIT, { shirt: '#0c0f16', pants: '#0c0f16', shoes: HX.ink });
      case 'hx_ninja': return Object.assign({}, BARE, SUIT, { shirt: HX.navy, pants: HX.navyD, shoes: HX.navyD, skin: HX.navyL });
      case 'hx_coat': return Object.assign({}, OPEN, SUIT, { shirt: HX.slate, pants: HX.navyD, shoes: HX.ink });
      case 'hx_bot': return Object.assign({}, BARE, SUIT, { shirt: HX.metal, pants: HX.slateD, shoes: '#1c2433', skin: '#7d93b5' });
      case 'hx_ghost': return Object.assign({}, BARE, SUIT, { shirt: '#4f8fe0', pants: HX.blueD, shoes: HX.blueD, skin: HX.blueL, hair: '#5a9ae6' });
      case 'hx_master': return Object.assign({}, BARE, SUIT, { shirt: HX.navyD, pants: HX.navyD, shoes: HX.ink });
      case 'astronaut': return Object.assign({}, BARE, SUIT, { shirt: ASTRO.suit, pants: ASTRO.suit, shoes: ASTRO.suitD, skin: ASTRO.suitD });
      case 'ninja': return Object.assign({}, BARE, SUIT, { shirt: NINJA.cloth, pants: NINJA.clothD, shoes: NINJA.clothD });
      case 'robot': return Object.assign({}, BARE, SUIT, { shirt: ROBOT.metal, pants: ROBOT.metalD, shoes: ROBOT.joint, skin: ROBOT.metal });
      case 'scientist': return Object.assign({}, BARE, SUIT, { shirt: SCI.coat, pants: '#2a3340', shoes: '#1a1f27', hairStyle: 'undercut' });
      case 'samurai': return Object.assign({}, BARE, SUIT, { shirt: SAM.armor, pants: SAM.dark, shoes: SAM.dark, skin: SAM.light });
      case 'knight': return Object.assign({}, BARE, SUIT, { shirt: KNIGHT.metal, pants: KNIGHT.dark, shoes: KNIGHT.joint, skin: KNIGHT.light });
      case 'detective': return Object.assign({}, BARE, SUIT, { shirt: DET.coat, pants: DET.dark, shoes: '#121318', hairStyle: 'short' });
      case 'pilot': return Object.assign({}, BARE, SUIT, { shirt: PILOT.suit, pants: PILOT.suit, shoes: PILOT.strap, skin: PILOT.strap });
      case 'backup': return Object.assign({}, BARE, SUIT, { shirt: BK.suit, pants: BK.suit, shoes: BK.dark });
      case 'cowboy': return Object.assign({}, BARE, SUIT, { shirt: COW.shirt, pants: COW.denim, shoes: COW.boots, hairStyle: 'short' });
      case 'vampire': return Object.assign({}, BARE, SUIT, { shirt: VAMP.shirt, pants: VAMP.cape, shoes: VAMP.capeD, skin: VAMP.skin });
    }
    return null;
  };

  // new shirt models; returns true when it handled the outfit
  DL.charOutfit = function (g, dir, ty, L, shirt, shirtD, shirtL) {
    const ax = AX, o = L.outfit, side = dir !== 'down' && dir !== 'up';
    switch (o) {
      case 'hx_hoodie':
        // drawstrings, two dots of code on the chest and the front pocket
        if (dir === 'down') {
          R(g, ax - 2, ty + 1, 1, 2, HX.turq); R(g, ax + 1, ty + 1, 1, 2, HX.turq);
          R(g, ax - 1, ty + 3, 1, 1, HX.turqD); R(g, ax + 1, ty + 3, 1, 1, HX.turqD);
          R(g, ax - 3, ty + 5, 6, 2, HX.navyL); R(g, ax - 3, ty + 5, 6, 1, HX.navyD);
        } else if (dir === 'up') { R(g, ax - 3, ty, 6, 2, HX.navyL); R(g, ax - 2, ty + 2, 4, 1, HX.navyD); }
        else { R(g, ax + 1, ty + 1, 1, 2, HX.turq); R(g, ax - 1, ty + 5, 4, 2, HX.navyL); }
        return true;
      case 'hx_leather':
        // high collar, a light zipper and zipped pockets
        if (dir === 'down') {
          R(g, ax - 3, ty, 2, 2, HX.leatherL); R(g, ax + 1, ty, 2, 2, HX.leatherL); R(g, ax, ty, 1, 7, HX.slateL);
          R(g, ax - 4, ty, 1, 7, HX.leatherL); R(g, ax - 3, ty + 4, 2, 1, HX.slate); R(g, ax + 1, ty + 4, 2, 1, HX.slate);
        } else if (dir === 'up') { R(g, ax - 3, ty, 6, 1, HX.leatherL); R(g, ax - 4, ty + 3, 8, 1, '#202837'); R(g, ax - 1, ty + 1, 2, 2, HX.turqD); }
        else { R(g, ax, ty, 2, 2, HX.leatherL); R(g, ax + 2, ty, 1, 7, HX.slateL); }
        return true;
      case 'hx_agent':
        // white shirt in the V, dark lapels and a thin blue tie with a turquoise clip
        if (dir === 'down') {
          R(g, ax - 1, ty, 2, 5, WHITE); R(g, ax - 2, ty, 1, 4, '#1d2230'); R(g, ax + 1, ty, 1, 4, '#1d2230');
          R(g, ax - 1, ty + 1, 2, 1, HX.blue); R(g, ax - 1, ty + 2, 2, 3, HX.blueD); R(g, ax - 1, ty + 3, 2, 1, HX.turq);
          R(g, ax - 1, ty + 6, 2, 1, '#1d2230');
        } else if (dir === 'up') { R(g, ax - 3, ty, 6, 1, WHITE); R(g, ax, ty + 1, 1, 6, '#05070b'); }
        else { R(g, ax + 1, ty, 2, 3, WHITE); R(g, ax + 2, ty + 1, 1, 4, HX.blueD); R(g, ax + 1, ty, 1, 4, '#1d2230'); }
        return true;
      case 'hx_ninja':
        // a turquoise wrap across the chest and a blue belt
        if (dir === 'down') {
          R(g, ax - 3, ty + 1, 1, 1, HX.turq); R(g, ax - 2, ty + 2, 1, 1, HX.turq); R(g, ax - 1, ty + 3, 2, 1, HX.turq);
          R(g, ax + 1, ty + 4, 1, 1, HX.turq); R(g, ax + 2, ty + 5, 1, 1, HX.turq);
          R(g, ax - 4, ty + 6, 8, 1, HX.blueD); R(g, ax - 1, ty + 6, 2, 1, HX.turq);
        } else if (dir === 'up') { R(g, ax - 3, ty + 1, 1, 5, HX.turqD); R(g, ax + 2, ty + 1, 1, 5, HX.turqD); R(g, ax - 4, ty + 6, 8, 1, HX.blueD); }
        else { R(g, ax - 2, ty + 1, 1, 4, HX.turqD); R(g, ax - 3, ty + 6, 6, 1, HX.blueD); R(g, ax + 1, ty + 6, 1, 1, HX.turq); }
        return true;
      case 'hx_coat':
        // open long coat: lit turquoise edges and tails down over the legs
        if (dir === 'down') {
          R(g, ax - 1, ty, 2, 8, HX.navyD); R(g, ax - 4, ty, 2, 2, shirtL); R(g, ax + 2, ty, 2, 2, shirtL);
          R(g, ax - 4, ty + 8, 3, 4, shirt); R(g, ax + 1, ty + 8, 3, 4, shirt);
          R(g, ax - 2, ty, 1, 12, HX.turq); R(g, ax + 1, ty, 1, 12, HX.turq);
          R(g, ax - 4, ty + 8, 1, 4, HX.turqD); R(g, ax + 3, ty + 8, 1, 4, HX.turqD);
          R(g, ax - 4, ty + 11, 3, 1, HX.turq); R(g, ax + 1, ty + 11, 3, 1, HX.turq);
        } else if (dir === 'up') {
          R(g, ax - 4, ty + 8, 8, 4, shirt); R(g, ax, ty + 3, 1, 9, shirtD);
          R(g, ax - 4, ty, 1, 12, HX.turqD); R(g, ax + 3, ty, 1, 12, HX.turqD); R(g, ax - 4, ty + 11, 8, 1, HX.turq);
        } else {
          R(g, ax - 3, ty + 8, 5, 4, shirt); R(g, ax + 2, ty, 1, 12, HX.turq);
          R(g, ax - 3, ty + 8, 1, 4, HX.turqD); R(g, ax - 3, ty + 11, 5, 1, HX.turq);
        }
        return true;
      case 'hx_bot':
        // chest plate with bolts, a turquoise power core and vents
        if (dir === 'down') {
          R(g, ax - 3, ty + 1, 6, 5, '#5d7394'); R(g, ax - 3, ty + 1, 6, 1, HX.metalL);
          R(g, ax - 1, ty + 2, 2, 2, HX.turq); R(g, ax - 1, ty + 2, 1, 1, HX.turqL);
          R(g, ax - 3, ty + 5, 6, 1, HX.metalD); R(g, ax - 4, ty + 7, 8, 1, HX.metalD);
          R(g, ax - 4, ty, 1, 1, HX.metalL); R(g, ax + 3, ty, 1, 1, HX.metalL);
        } else if (dir === 'up') {
          R(g, ax - 4, ty, 8, 7, '#3c4d68'); R(g, ax - 3, ty + 2, 6, 1, HX.metalD); R(g, ax - 3, ty + 4, 6, 1, HX.metalD);
          R(g, ax - 1, ty + 1, 2, 1, HX.turq);
        } else { R(g, ax - 1, ty + 1, 3, 5, '#5d7394'); R(g, ax, ty + 2, 1, 2, HX.turq); }
        return true;
      case 'hx_ghost': {
        // scan lines through the light body and a bright core
        const s = 'rgba(165,247,234,0.35)';
        for (const y of [1, 3, 5]) R(g, side ? ax - 3 : ax - 4, ty + y, side ? 6 : 8, 1, s);
        if (dir === 'down') R(g, ax - 1, ty + 2, 2, 2, HX.turqL);
        return true;
      }
      case 'hx_master': {
        // a cape covered in lines of code (dots that read as text at sprite scale)
        const dots = (x0, y0, w, rows) => { for (let r = 0; r < rows; r++) for (let c = 0; c < w; c++) if ((r * 7 + c * 3) % 5 < 2) R(g, x0 + c, y0 + r * 2, 1, 1, (r + c) % 3 ? HX.turqD : HX.turq); };
        if (dir === 'down') {
          R(g, ax - 7, ty + 1, 1, 11, HX.navy); R(g, ax + 6, ty + 1, 1, 11, HX.navy);
          R(g, ax - 7, ty + 3, 1, 1, HX.turqD); R(g, ax + 6, ty + 6, 1, 1, HX.turqD);
          R(g, ax - 1, ty, 2, 8, HX.navy); dots(ax - 3, ty + 2, 6, 3);
          R(g, ax - 4, ty + 8, 8, 3, HX.navyD); R(g, ax - 4, ty + 10, 8, 1, HX.turqD);
        } else if (dir === 'up') {
          R(g, ax - 5, ty, 10, 12, HX.navy); R(g, ax - 5, ty, 10, 1, HX.navyL);
          dots(ax - 4, ty + 2, 8, 5); R(g, ax - 5, ty + 11, 10, 1, HX.turq);
        } else {
          R(g, ax - 5, ty, 3, 12, HX.navy); dots(ax - 5, ty + 2, 3, 5);
          R(g, ax - 3, ty + 8, 6, 3, HX.navyD); R(g, ax - 3, ty + 10, 6, 1, HX.turqD);
        }
        return true;
      }
      case 'dev': {
        // </> on the chest in terminal green
        const k = '#39ff14';
        if (dir === 'down') { R(g, ax - 3, ty + 3, 1, 1, k); R(g, ax - 4, ty + 4, 1, 1, k); R(g, ax - 3, ty + 5, 1, 1, k); R(g, ax, ty + 2, 1, 1, k); R(g, ax - 1, ty + 4, 1, 1, k); R(g, ax - 1, ty + 3, 1, 1, k); R(g, ax - 2, ty + 5, 1, 1, k); R(g, ax + 2, ty + 3, 1, 1, k); R(g, ax + 3, ty + 4, 1, 1, k); R(g, ax + 2, ty + 5, 1, 1, k); }
        else if (dir === 'up') R(g, ax - 3, ty + 2, 6, 1, k);
        else { R(g, ax, ty + 3, 1, 1, k); R(g, ax + 1, ty + 4, 1, 1, k); R(g, ax, ty + 5, 1, 1, k); }
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
    }
    return false;
  };

  // the hacker skins' heads: hood, mask, monitor or holo visor over the head sprites.js drew
  function hxHead(g, dir, L, o) {
    const hx = o.hx, hy = o.hy, side = o.side, eye = o.closed ? HX.turqD : HX.turq;
    switch (L.outfit) {
      case 'hx_hoodie':
        // hood up, the face in shadow with code running down it (cosmetics' charFx animates it)
        R(g, hx - 5, hy - 2, 10, 2, HX.navy); R(g, hx - 6, hy, 12, 10, HX.navy); R(g, hx - 4, hy - 2, 4, 1, HX.navyL);
        if (dir === 'down') {
          R(g, hx - 6, hy, 1, 10, HX.navyL); R(g, hx + 5, hy, 1, 10, HX.navyD);
          R(g, hx - 4, hy + 1, 8, 8, '#08101f');
          R(g, hx - 3, hy + 2, 1, 3, HX.turqD); R(g, hx, hy + 3, 1, 4, HX.turqD); R(g, hx + 2, hy + 1, 1, 2, HX.turqD); R(g, hx + 2, hy + 6, 1, 2, HX.turqD);
          R(g, hx - 2, hy + 5, 1, 1, eye); R(g, hx + 1, hy + 5, 1, 1, eye);
        } else if (side) {
          R(g, hx - 6, hy, 1, 10, HX.navyD); R(g, hx + 1, hy + 1, 4, 8, '#08101f');
          R(g, hx + 2, hy + 2, 1, 4, HX.turqD); R(g, hx + 4, hy + 3, 1, 3, HX.turqD); R(g, hx + 3, hy + 5, 1, 1, eye);
        } else { R(g, hx - 1, hy - 1, 2, 11, HX.navyD); R(g, hx - 6, hy, 1, 10, HX.navyL); }
        return;
      case 'hx_leather':
        // holographic visor band in front of the eyes
        if (dir === 'down') {
          R(g, hx - 5, hy + 4, 10, 2, 'rgba(45,226,200,0.55)'); R(g, hx - 5, hy + 4, 10, 1, HX.turqL);
          R(g, hx - 6, hy + 4, 1, 2, HX.slateD); R(g, hx + 5, hy + 4, 1, 2, HX.slateD); R(g, hx + 4, hy + 3, 2, 1, HX.turq);
        } else if (side) { R(g, hx + 1, hy + 4, 5, 2, 'rgba(45,226,200,0.55)'); R(g, hx + 1, hy + 4, 5, 1, HX.turqL); R(g, hx - 1, hy + 4, 2, 1, HX.slateD); }
        else R(g, hx - 5, hy + 4, 10, 1, HX.slateD);
        return;
      case 'hx_agent':
        // dark glasses with a blue glint and a coiled earpiece
        if (dir === 'down') {
          R(g, hx - 4, hy + 5, 3, 2, HX.ink); R(g, hx + 1, hy + 5, 3, 2, HX.ink); R(g, hx - 1, hy + 5, 2, 1, HX.ink); R(g, hx - 4, hy + 5, 1, 1, HX.blueL);
          R(g, hx + 5, hy + 5, 1, 1, HX.slateL); R(g, hx + 5, hy + 6, 1, 4, 'rgba(135,151,176,0.8)');
        } else if (side) {
          R(g, hx + 1, hy + 5, 4, 2, HX.ink); R(g, hx - 2, hy + 5, 3, 1, HX.ink); R(g, hx + 4, hy + 5, 1, 1, HX.blueL);
          R(g, hx - 1, hy + 5, 1, 2, HX.slateL); R(g, hx - 1, hy + 7, 1, 3, 'rgba(135,151,176,0.8)');
        } else { R(g, hx - 5, hy + 5, 1, 1, HX.ink); R(g, hx + 4, hy + 5, 1, 1, HX.ink); R(g, hx + 4, hy + 6, 1, 4, HX.slateL); }
        return;
      case 'hx_ninja':
        // head wrap and an LED mask: two turquoise eyes and a dotted grid
        R(g, hx - 4, hy - 1, 8, 1, HX.navy); R(g, hx - 5, hy, 10, 9, HX.navy); R(g, hx - 4, hy + 9, 8, 1, HX.navyD); R(g, hx - 3, hy, 4, 1, HX.navyL);
        if (dir === 'down') {
          R(g, hx - 5, hy + 4, 10, 4, HX.ink); R(g, hx - 3, hy + 5, 2, 1, eye); R(g, hx + 1, hy + 5, 2, 1, eye);
          for (let x = -3; x <= 3; x += 2) R(g, hx + x, hy + 7, 1, 1, HX.turqD);
        } else if (side) {
          R(g, hx - 1, hy + 4, 6, 4, HX.ink); R(g, hx + 2, hy + 5, 2, 1, eye); R(g, hx + 1, hy + 7, 1, 1, HX.turqD); R(g, hx + 3, hy + 7, 1, 1, HX.turqD);
          R(g, hx - 6, hy + 4, 1, 4, HX.turqD);
        } else { R(g, hx - 5, hy + 4, 10, 1, HX.ink); R(g, hx - 1, hy + 4, 2, 2, HX.turqD); R(g, hx - 1, hy + 6, 1, 4, HX.turqD); R(g, hx + 1, hy + 6, 1, 3, HX.turqD); }
        return;
      case 'hx_bot':
        // a monitor for a head: the prompt and cursor on the screen, an antenna with a light
        R(g, hx - 6, hy - 1, 12, 11, '#3c4d68'); R(g, hx - 6, hy - 1, 12, 1, HX.metalL); R(g, hx - 6, hy + 9, 12, 1, HX.metalD);
        R(g, hx + 3, hy - 3, 1, 2, HX.metalL); R(g, hx + 3, hy - 4, 1, 1, HX.turq);
        if (dir === 'down') {
          R(g, hx - 5, hy, 10, 8, HX.screen);
          R(g, hx - 4, hy + 2, 1, 1, HX.turq); R(g, hx - 3, hy + 3, 1, 1, HX.turq); R(g, hx - 4, hy + 4, 1, 1, HX.turq);
          R(g, hx - 1, hy + 4, 2, 1, o.closed ? HX.screen : HX.turq); R(g, hx - 5, hy + 6, 10, 1, 'rgba(45,226,200,0.18)');
        } else if (side) {
          R(g, hx + 3, hy, 2, 8, HX.screen); R(g, hx + 4, hy + 3, 1, 1, HX.turq);
          for (const y of [2, 4, 6]) R(g, hx - 4, hy + y, 4, 1, HX.metalD);
        } else for (const y of [2, 4, 6]) R(g, hx - 4, hy + y, 8, 1, HX.metalD);
        return;
      case 'hx_ghost':
        // glowing eyes, no mouth, a wisp of light on top and scan lines through the head
        R(g, hx - 2, hy - 2, 4, 2, 'rgba(127,178,240,0.7)'); R(g, hx - 1, hy - 3, 2, 1, 'rgba(165,247,234,0.6)');
        R(g, hx - 5, hy + 2, 10, 1, 'rgba(165,247,234,0.35)'); R(g, hx - 5, hy + 6, 10, 1, 'rgba(165,247,234,0.35)');
        if (dir === 'down') {
          R(g, hx - 3, hy + 5, 2, 2, HX.turqL); R(g, hx + 1, hy + 5, 2, 2, HX.turqL);
          R(g, hx - 1, hy + 8, 2, 1, HX.blueL); R(g, hx - 4, hy + 7, 1, 1, HX.blueL); R(g, hx + 3, hy + 7, 1, 1, HX.blueL);
        } else if (side) { R(g, hx + 2, hy + 5, 2, 2, HX.turqL); R(g, hx + 4, hy + 8, 1, 1, HX.blueL); R(g, hx + 3, hy + 7, 1, 1, HX.blueL); }
        return;
      case 'hx_master':
        // deep hood, the face lost in shadow except for two turquoise eyes
        R(g, hx - 5, hy - 3, 10, 3, HX.navy); R(g, hx - 1, hy - 4, 2, 1, HX.navy); R(g, hx - 6, hy, 12, 10, HX.navy); R(g, hx - 4, hy - 3, 4, 1, HX.navyL);
        if (dir === 'down') {
          R(g, hx - 6, hy, 1, 10, HX.navyL); R(g, hx + 5, hy, 1, 10, HX.navyD); R(g, hx - 4, hy + 1, 8, 8, '#03060c');
          R(g, hx - 3, hy + 5, 2, 1, eye); R(g, hx + 1, hy + 5, 2, 1, eye);
          R(g, hx - 5, hy + 1, 1, 1, HX.turq); R(g, hx - 5, hy + 4, 1, 1, HX.turqD); R(g, hx + 4, hy + 2, 1, 1, HX.turq); R(g, hx + 4, hy + 6, 1, 1, HX.turqD);
        } else if (side) { R(g, hx - 6, hy, 1, 10, HX.navyD); R(g, hx + 1, hy + 1, 4, 8, '#03060c'); R(g, hx + 3, hy + 5, 2, 1, eye); }
        else { R(g, hx - 1, hy - 3, 2, 13, HX.navyD); R(g, hx - 4, hy + 2, 1, 1, HX.turqD); R(g, hx + 3, hy + 5, 1, 1, HX.turqD); }
        return;
    }
  }

  // Accessories (DL.GEAR_POS): drawn after the skin, so they sit over any of them. Back first, then the
  // neck, the face and the head on top. Gloves recolour the hands in sprites.js (DL.charGlove).
  function gear(g, dir, L, o) {
    const G = L.gear, ax = AX, ty = o.ty, hy = o.hy, hx = o.hx, side = o.side;
    if (G.back === 'laptop' && !o.sit) {
      if (dir === 'up') {
        R(g, ax - 3, ty + 1, 6, 6, HX.slate); R(g, ax - 3, ty + 1, 6, 1, HX.slateL); R(g, ax - 2, ty + 4, 4, 2, HX.slateD);
        R(g, ax - 3, ty - 2, 6, 3, HX.slateD); R(g, ax - 2, ty - 1, 4, 2, HX.turq); R(g, ax - 2, ty - 1, 4, 1, HX.turqL);
      } else if (dir === 'down') {
        R(g, ax - 4, ty, 1, 6, HX.slateD); R(g, ax + 3, ty, 1, 6, HX.slateD);
        R(g, ax + 4, ty - 2, 2, 2, HX.slateD); R(g, ax + 4, ty - 2, 1, 1, HX.turq);
      } else {
        R(g, ax - 6, ty + 1, 3, 6, HX.slate); R(g, ax - 6, ty + 1, 3, 1, HX.slateL); R(g, ax - 2, ty, 1, 4, HX.slateD);
        R(g, ax - 6, ty - 2, 2, 3, HX.slateD); R(g, ax - 5, ty - 2, 1, 3, HX.turq);
      }
    }
    if (G.neck === 'usb' && dir !== 'up') {
      if (dir === 'down') {
        R(g, ax - 2, ty, 1, 2, HX.slateL); R(g, ax + 1, ty, 1, 2, HX.slateL); R(g, ax - 1, ty + 2, 2, 1, HX.slateL);
        R(g, ax - 1, ty + 3, 2, 3, HX.blue); R(g, ax - 1, ty + 3, 2, 1, HX.blueL); R(g, ax, ty + 4, 1, 1, HX.turq);
      } else { R(g, ax + 1, ty, 1, 3, HX.slateL); R(g, ax + 1, ty + 3, 1, 3, HX.blue); R(g, ax + 1, ty + 5, 1, 1, HX.turq); }
    }
    switch (G.face) {
      case 'nvg':
        if (dir === 'down') {
          R(g, hx - 5, hy + 3, 10, 1, HX.slateD); R(g, hx - 4, hy + 4, 3, 3, HX.slateD); R(g, hx + 1, hy + 4, 3, 3, HX.slateD);
          R(g, hx - 1, hy + 5, 2, 1, HX.slateD); R(g, hx - 3, hy + 5, 1, 1, HX.turqL); R(g, hx + 2, hy + 5, 1, 1, HX.turqL);
        } else if (side) { R(g, hx - 5, hy + 3, 7, 1, HX.slateD); R(g, hx + 2, hy + 4, 4, 3, HX.slateD); R(g, hx + 5, hy + 5, 1, 1, HX.turqL); }
        else { R(g, hx - 5, hy + 3, 10, 1, HX.slateD); R(g, hx - 1, hy + 3, 2, 1, HX.slate); }
        break;
      case 'holovisor':
        if (dir === 'down') {
          R(g, hx - 5, hy + 4, 10, 1, 'rgba(61,123,217,0.8)'); R(g, hx - 5, hy + 5, 10, 1, 'rgba(127,178,240,0.55)');
          R(g, hx - 3, hy + 5, 1, 1, HX.turqL); R(g, hx + 1, hy + 4, 2, 1, HX.turqL); R(g, hx - 6, hy + 4, 1, 2, HX.slate); R(g, hx + 5, hy + 4, 1, 2, HX.slate);
        } else if (side) { R(g, hx + 1, hy + 4, 5, 2, 'rgba(61,123,217,0.7)'); R(g, hx + 4, hy + 4, 1, 1, HX.turqL); R(g, hx - 1, hy + 4, 2, 2, HX.slate); }
        else R(g, hx - 5, hy + 4, 10, 1, HX.slate);
        break;
      case 'ledmask':
        if (dir === 'down') {
          R(g, hx - 4, hy + 6, 8, 3, HX.ink); R(g, hx - 4, hy + 6, 8, 1, HX.slateD);
          R(g, hx - 3, hy + 7, 1, 1, HX.turq); R(g, hx - 2, hy + 8, 4, 1, HX.turq); R(g, hx + 2, hy + 7, 1, 1, HX.turq);
          R(g, hx - 5, hy + 6, 1, 1, HX.slateD); R(g, hx + 4, hy + 6, 1, 1, HX.slateD);
        } else if (side) { R(g, hx + 1, hy + 6, 4, 3, HX.ink); R(g, hx + 3, hy + 8, 2, 1, HX.turq); R(g, hx + 4, hy + 7, 1, 1, HX.turq); R(g, hx - 2, hy + 6, 3, 1, HX.slateD); }
        else R(g, hx - 5, hy + 6, 10, 1, HX.slateD);
        break;
    }
    switch (G.head) {
      case 'antenna':
        R(g, hx - 4, hy - 1, 8, 1, HX.navy); R(g, hx - 5, hy, 10, 3, HX.navy); R(g, hx - 3, hy, 3, 1, HX.navyL);
        if (dir === 'down') { R(g, hx - 6, hy + 3, 12, 1, HX.navyD); R(g, hx - 1, hy + 1, 2, 1, HX.turq); }
        else if (side) R(g, hx + 2, hy + 3, 6, 1, HX.navyD);
        else R(g, hx - 2, hy + 3, 4, 1, HX.navyD);
        R(g, hx + 2, hy - 5, 1, 4, HX.slateL); R(g, hx + 2, hy - 6, 1, 1, HX.turqL);
        break;
      case 'headset':
        R(g, hx - 4, hy - 2, 8, 1, HX.slateD); R(g, hx - 5, hy - 1, 1, 2, HX.slateD); R(g, hx + 4, hy - 1, 1, 2, HX.slateD);
        if (dir === 'down') {
          R(g, hx - 7, hy + 3, 2, 4, HX.slateD); R(g, hx + 5, hy + 3, 2, 4, HX.slateD); R(g, hx - 7, hy + 4, 1, 2, HX.turq); R(g, hx + 6, hy + 4, 1, 2, HX.turq);
          R(g, hx + 4, hy + 7, 1, 1, HX.slateD); R(g, hx + 2, hy + 8, 2, 1, HX.slateD); R(g, hx + 1, hy + 8, 1, 1, HX.turq);
        } else if (side) { R(g, hx - 3, hy + 3, 3, 4, HX.slateD); R(g, hx - 3, hy + 4, 1, 2, HX.turq); R(g, hx, hy + 7, 4, 1, HX.slateD); R(g, hx + 4, hy + 7, 1, 1, HX.turq); }
        else { R(g, hx - 7, hy + 3, 2, 4, HX.slateD); R(g, hx + 5, hy + 3, 2, 4, HX.slateD); R(g, hx - 7, hy + 4, 1, 2, HX.turq); R(g, hx + 6, hy + 4, 1, 2, HX.turq); }
        break;
    }
  }
  // circuit gloves: dark hands with a turquoise trace (sprites.js paints every hand with this)
  DL.charGlove = (L) => (L.gear && L.gear.hands === 'gloves' ? { c: '#121a2b', d: '#0a101c', glow: HX.turq } : null);

  // skin heads, then the costumes' head pieces and the legendary visor; accessories last, on top of all
  DL.charTop = function (g, dir, pose, L, o) {
    const ax = AX, ty = o.ty, hy = o.hy, side = o.side;
    const hx = o.hx;
    hxHead(g, dir, L, o);
    if (L.outfit === 'astronaut') {
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
    }
    if (L.visor) {
      if (dir === 'down') { R(g, ax - 5, hy + 4, 10, 2, GOLD); R(g, ax - 4, hy + 5, 8, 1, GOLD_L); }
      else if (side) { R(g, ax, hy + 4, 6, 2, GOLD); R(g, ax + 2, hy + 5, 3, 1, GOLD_L); }
      else R(g, ax - 5, hy + 4, 10, 1, GOLD_D);
    }
    if (L.gear) gear(g, dir, L, o);
  };

  // after a frame is drawn and outlined: the Digital Ghost is half see-through, with faint scan lines
  DL.charPost = function (c, L) {
    if (L.outfit !== 'hx_ghost') return c;
    const o = DL.mk(c.width, c.height), g = o.getContext('2d');
    g.globalAlpha = 0.62;
    g.drawImage(c, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 1; y < c.height; y += 3) g.fillRect(0, y, c.width, 1);
    return o;
  };

  // live effects drawn over a character every frame (sprites.js / iso.js drawActor): the code that
  // runs down the hoodie's face, the ghost's glitches, the robot's blinking cursor
  DL.charFx = function (g, a, X, Y, t) {
    const L = a.look;
    if (!L || !L.outfit || L.outfit.indexOf('hx_') !== 0 || a.seated) return;
    const top = Y - AY + 6; // the head's first row (hy) when standing still
    if (L.outfit === 'hx_hoodie' && a.dir !== 'up') {
      const cols = a.dir === 'down' ? [-3, 0, 2] : a.dir === 'right' ? [2, 4] : [-3, -5];
      cols.forEach((c, i) => {
        const k = 1 + Math.floor((t * 9 + i * 3.7) % 9);
        if (k <= 8) R(g, X + c, top + k, 1, 1, HX.turqL);
        if (k > 1 && k <= 9) R(g, X + c, top + k - 1, 1, 1, HX.turq);
      });
    } else if (L.outfit === 'hx_ghost') {
      const n = Math.floor(t * 10);
      if (DL.hash(n * 31) < 0.35) {
        const y = Y - 4 - Math.floor(DL.hash(n * 17) * 24), off = DL.hash(n * 7) < 0.5 ? -2 : 2;
        R(g, X - 6 + off, y, 12, 1, 'rgba(165,247,234,0.55)');
        R(g, X - 5 - off, y + 1, 10, 1, 'rgba(61,123,217,0.5)');
      }
    } else if (L.outfit === 'hx_bot' && a.dir === 'down' && !a.moving && Math.floor(t * 2.5) % 2) {
      R(g, X - 1, top + 4, 2, 1, HX.screen);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Terminal skins (Equipamentos · skins de hacks): colours + a live     */
  /* pixel effect behind the console (terminal.js) and in the shop        */
  /* ------------------------------------------------------------------ */
  DL.TERM_LOOK = {
    retro: { bg: '#03110a', bar: '#0b2416', text: '#5dff9d', dim: '#2a9c5c' },
    neon: { bg: '#050c18', bar: '#0b1730', text: '#2de2c8', dim: '#14897a' },
    matrix: { bg: '#020a0c', bar: '#06121a', text: '#a5f7ea', dim: '#14897a' },
    skull: { bg: '#060a14', bar: '#0b1730', text: '#7fb2f0', dim: '#3d7bd9' },
    glitch: { bg: '#070b16', bar: '#1a2b4d', text: '#2de2c8', dim: '#3d7bd9' },
    holo: { bg: '#0a1c36', bar: '#21477f', text: '#a5f7ea', dim: '#7fb2f0' },
  };
  // 3×3 glyphs for the falling code
  const GLYPHS = ['111101111', '010111010', '110011110', '101010101', '111010010', '011110011'];
  const SKULL = ['..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XX..XX..XX', 'XX..XX..XX', 'XXXXXXXXXX', '.XXX..XXX.', '..XXXXXX..', '..X.XX.X..', '..XXXXXX..'];
  // draws the effect of a terminal skin over a w×h pixel area (transparent where there is nothing)
  DL.termFx = function (g, kind, w, h, t) {
    const hash = DL.hash;
    switch (kind) {
      case 'matrix':
        for (let c = 0; c * 4 < w; c++) {
          const sp = 7 + hash(c * 13 + 1) * 12, len = 5 + Math.floor(hash(c * 7 + 2) * 8);
          const head = Math.floor((t * sp + hash(c * 31 + 3) * (h + 60)) % (h + len * 4));
          for (let i = 0; i < len; i++) {
            const y = head - i * 4;
            if (y < 0 || y + 3 > h) continue;
            const gl = GLYPHS[Math.floor(hash(c * 101 + Math.floor(y / 4) * 17 + Math.floor(t * 2)) * GLYPHS.length)];
            g.fillStyle = i === 0 ? 'rgba(165,247,234,0.55)' : 'rgba(45,226,200,' + (0.32 * (1 - i / len)).toFixed(3) + ')';
            for (let p = 0; p < 9; p++) if (gl[p] === '1') g.fillRect(c * 4 + (p % 3), y + Math.floor(p / 3), 1, 1);
          }
        }
        return;
      case 'glitch': {
        const n = Math.floor(t * 9);
        if (hash(n * 7) < 0.45) {
          const bands = 1 + Math.floor(hash(n * 11) * 3);
          for (let b = 0; b < bands; b++) {
            const y = Math.floor(hash(n * 13 + b * 5) * h), bh = 1 + Math.floor(hash(n * 17 + b) * 4), off = Math.floor((hash(n * 19 + b) - 0.5) * 24);
            g.fillStyle = b % 2 ? 'rgba(61,123,217,0.28)' : 'rgba(45,226,200,0.22)';
            g.fillRect(Math.max(0, off), y, w, bh);
            g.fillStyle = 'rgba(165,247,234,0.35)';
            g.fillRect(Math.floor(hash(n * 23 + b) * w), y, 2 + Math.floor(hash(n * 29 + b) * 10), 1);
          }
        }
        return;
      }
      case 'holo': {
        g.fillStyle = 'rgba(127,178,240,0.07)';
        for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
        for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
        const y = h - Math.floor((t * 22) % (h + 6));
        g.fillStyle = 'rgba(165,247,234,0.16)';
        g.fillRect(0, y, w, 2);
        g.fillStyle = 'rgba(165,247,234,0.06)';
        g.fillRect(0, y + 2, w, 4);
        return;
      }
      case 'retro': {
        g.fillStyle = 'rgba(0,0,0,0.28)';
        for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
        const y = Math.floor((t * 12) % (h + 10)) - 10;
        g.fillStyle = 'rgba(93,255,157,0.05)';
        g.fillRect(0, y, w, 10);
        return;
      }
      case 'skull': {
        const k = Math.max(2, Math.floor(Math.min(w, h) / 22)), sx = w - 10 * k - k * 2, sy = h - 10 * k - k * 2, on = Math.sin(t * 2.2) > 0.2;
        SKULL.forEach((row, r) => {
          for (let c = 0; c < 10; c++) {
            const eye = (r === 3 || r === 4) && (c === 2 || c === 3 || c === 6 || c === 7);
            if (row[c] === 'X') { g.fillStyle = 'rgba(45,226,200,0.11)'; g.fillRect(sx + c * k, sy + r * k, k, k); }
            else if (eye && on) { g.fillStyle = 'rgba(61,123,217,0.55)'; g.fillRect(sx + c * k, sy + r * k, k, k); }
          }
        });
        return;
      }
      case 'neon': {
        const a = 0.35 + 0.25 * Math.sin(t * 2.4);
        g.fillStyle = 'rgba(45,226,200,' + a.toFixed(3) + ')';
        g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
        g.fillStyle = 'rgba(45,226,200,' + (a * 0.35).toFixed(3) + ')';
        g.fillRect(1, 1, w - 2, 1); g.fillRect(1, h - 2, w - 2, 1); g.fillRect(1, 1, 1, h - 2); g.fillRect(w - 2, 1, 1, h - 2);
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Pets: small companions in profile (facing right; left is mirrored), */
  /* on the same 22×31 frame as a character so drawActor can place them  */
  /* ------------------------------------------------------------------ */
  // f: animation frame (0–3), walk: legs moving. Ground row = 28 (where a character's shoes end).
  function drawPet(g, kind, f, walk) {
    const odd = f % 2 === 1, step = walk ? f % 2 : 0;
    switch (kind) {
      case 'bug': {
        // a glowing beetle: shell, head with antennae, fluttering wings, six legs
        R(g, 7, 24, 7, 3, HX.turqD); R(g, 8, 23, 5, 1, HX.turqD); R(g, 8, 23, 4, 1, HX.turq); R(g, 7, 24, 6, 1, HX.turq);
        R(g, 9, 25, 1, 1, HX.turqL); R(g, 11, 25, 1, 1, HX.turqL);
        R(g, 14, 24, 2, 2, HX.navy); R(g, 15, 24, 1, 1, HX.turqL); R(g, 16, 22, 1, 2, HX.turqD); R(g, 17, 21, 1, 1, HX.turqL);
        if (odd) R(g, 8, 21, 3, 2, 'rgba(165,247,234,0.6)'); else R(g, 9, 22, 4, 1, 'rgba(165,247,234,0.6)');
        for (const [x, s] of [[8, 0], [10, 1], [12, 0]]) R(g, x + (s === step ? 1 : 0), 27, 1, 2, HX.navyL);
        return;
      }
      case 'drone': {
        // hovers at chest height, rotors spinning, a turquoise light underneath
        const y = 15 + (odd ? 1 : 0);
        R(g, 7, y + 2, 8, 3, HX.slate); R(g, 7, y + 2, 8, 1, HX.slateL); R(g, 13, y + 3, 2, 1, HX.turq);
        R(g, 5, y + 1, 12, 1, HX.slateD);
        if (odd) { R(g, 3, y, 5, 1, HX.slateL); R(g, 14, y, 5, 1, HX.slateL); } else { R(g, 5, y, 1, 1, HX.slateL); R(g, 16, y, 1, 1, HX.slateL); R(g, 4, y - 1, 3, 1, 'rgba(135,151,176,0.5)'); R(g, 15, y - 1, 3, 1, 'rgba(135,151,176,0.5)'); }
        R(g, 10, y + 5, 2, 1, HX.turqL); R(g, 9, y + 6, 4, 2, 'rgba(45,226,200,0.25)');
        return;
      }
      case 'catbot': {
        // metal cat: ears, LED eyes, jointed legs and an antenna for a tail
        R(g, 6, 23, 9, 4, HX.slate); R(g, 6, 23, 9, 1, HX.slateL); R(g, 8, 25, 5, 1, HX.slateD);
        R(g, 13, 19, 5, 5, HX.slate); R(g, 13, 19, 5, 1, HX.slateL); R(g, 13, 18, 1, 1, HX.slate); R(g, 17, 18, 1, 1, HX.slate);
        R(g, 16, 21, 1, 1, odd && !walk ? HX.turqD : HX.turq); R(g, 18, 22, 1, 1, HX.slateD);
        R(g, 5, 20, 1, 4, HX.slateL); R(g, 5, 19, 1, 1, odd ? HX.turqL : HX.turq);
        for (const [x, s] of [[7, 0], [9, 1], [12, 0], [14, 1]]) R(g, x + (s === step ? 1 : 0), 27, 1, 2, HX.slateD);
        return;
      }
      case 'server': {
        // a little server box on legs, front LEDs blinking
        R(g, 7, 18, 8, 9, HX.navy); R(g, 7, 18, 8, 1, HX.navyL); R(g, 14, 18, 1, 9, HX.navyD);
        for (const y of [20, 22, 24]) R(g, 8, y, 5, 1, HX.navyD);
        R(g, 12, 19, 1, 1, odd ? HX.turq : HX.turqD); R(g, 12, 21, 1, 1, odd ? HX.blue : HX.blueL); R(g, 12, 23, 1, 1, f % 3 ? HX.turq : HX.turqD);
        R(g, 8 + (step ? 1 : 0), 27, 1, 2, HX.slateD); R(g, 13 - (step ? 1 : 0), 27, 1, 2, HX.slateD);
        return;
      }
      case 'holodog': {
        // a dog of blue light with scan lines and a wagging tail
        const b = 'rgba(127,178,240,0.85)', d = 'rgba(61,123,217,0.85)';
        R(g, 6, 22, 9, 4, b); R(g, 14, 19, 4, 4, b); R(g, 18, 21, 2, 2, b); R(g, 14, 18, 2, 2, d);
        R(g, 16, 20, 1, 1, HX.turqL); R(g, 19, 21, 1, 1, HX.navy);
        R(g, 6, 23, 9, 1, 'rgba(165,247,234,0.6)'); R(g, 14, 21, 4, 1, 'rgba(165,247,234,0.6)');
        if (odd) R(g, 3, 20, 3, 1, b); else R(g, 3, 22, 3, 1, b);
        for (const [x, s] of [[7, 0], [9, 1], [12, 0], [14, 1]]) R(g, x + (s === step ? 1 : 0), 26, 1, 3, d);
      }
    }
  }
  function petOutline(src) {
    const W = src.width, H = src.height;
    const s = DL.mk(W, H), sg = s.getContext('2d');
    sg.drawImage(src, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = DL.C.outline;
    sg.fillRect(0, 0, W, H);
    const o = DL.mk(W, H), og = o.getContext('2d');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) og.drawImage(s, dx, dy);
    og.drawImage(src, 0, 0);
    return o;
  }
  function petMirror(src) {
    const c = DL.mk(src.width, src.height), g = c.getContext('2d');
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }
  // { right: { idle: [2 frames], walk: [4 frames] }, left: mirrored } (cached per kind)
  const petSheets = {};
  DL.petSheet = function (kind) {
    if (petSheets[kind]) return petSheets[kind];
    const build = (f, walk) => { const c = DL.mk(DL.CHAR.FW, DL.CHAR.FH); drawPet(c.getContext('2d'), kind, f, walk); return petOutline(c); };
    const right = { idle: [build(0, false), build(1, false)], walk: [0, 1, 2, 3].map((f) => build(f, true)) };
    const left = { idle: right.idle.map(petMirror), walk: right.walk.map(petMirror) };
    return (petSheets[kind] = { right, left });
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
