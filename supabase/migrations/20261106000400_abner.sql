-- Coleção Fundadores: a skin Abner (épica, selo MEMBRO FUNDADOR na loja; senta relaxado nos sofás e
-- encostado nos racks) (cosmetics.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('abner', 'char', 'shirt', '"abner"'::jsonb, 'Abner', 'Cargo camuflada larga, cano alto azul royal e cachos no topo: streetwear de fundador direto do corredor dos racks.', 'epic', 'gold', 180, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values ('abner', 'character', 'Fundador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
