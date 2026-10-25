-- DataLab · SQL completo (gerado por supabase/scripts/build-full.mjs: migrations em ordem + seed + seed dos cenários).
-- Cole no SQL Editor do Supabase e execute uma vez. Fonte da verdade: supabase/migrations/*.sql, seed.sql e seed_scenarios.sql
-- (este arquivo é só a concatenação).

-- ===================================================================
-- 20261005000100_core.sql
-- ===================================================================
-- DataLab · 001 · core: schemas, enums, helpers, profiles, roles, wallets, inventories
-- Run order: 0100 core → 0200 catalog → 0300 inventory → 0400 game → 0500 security → 0600 functions → seed.sql
--
-- Design:
-- * public: tables the browser may READ under RLS (each player only their own rows) + the catalog.
--   The browser never writes money, items, saves or roles: there are no INSERT/UPDATE/DELETE grants
--   for anon/authenticated on those tables (only profiles: username, display_name, avatar).
-- * private: business logic (purchases, saves, economy, grants). Not exposed by the Data API; only the
--   Edge Functions reach it, through a direct database connection (SUPABASE_DB_URL), after
--   validating the user's JWT and role.

create schema if not exists private;
revoke all on schema private from public;
-- anon / authenticated exist in every Supabase project
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema private from authenticated'; end if;
end $$;

-- functions created in public are NOT executable by everyone unless granted explicitly
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'developer', 'moderator');
exception when duplicate_object then null; end $$;

do $$ begin
  -- where an item (or currency) came from
  create type public.grant_type as enum ('shop', 'event', 'founder', 'developer', 'beta', 'compensation', 'special', 'achievement', 'reward', 'starter', 'migration');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one per auth user (created by the signup trigger in 0600)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  -- the player's character (same fields as the in-game editor). Shop cosmetics inside it are
  -- checked against the inventory by a trigger (0500).
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 32),
  constraint profiles_avatar_object check (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 4096)
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();

-- staff roles (admin, developer, moderator). Never writable from the browser.
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function private.has_role(p_uid uuid, p_roles public.app_role[])
returns boolean language sql stable as $$
  select exists (select 1 from public.user_roles where user_id = p_uid and role = any (p_roles));
$$;

-- the player's own balances (separate from any company's cash)
create table if not exists public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gold bigint not null default 0 check (gold >= 0),
  credits bigint not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

-- one inventory per player (the items live in inventory_items, 0300)
create table if not exists public.inventories (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  capacity integer not null default 1000 check (capacity between 1 and 100000),
  created_at timestamptz not null default now()
);

-- is a username free? (callable before signup; reveals only availability)
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

-- ===================================================================
-- 20261005000200_catalog.sql
-- ===================================================================
-- DataLab · 002 · catalog (read-only for players; filled by seed.sql)

create table if not exists public.rarities (
  id text primary key,
  name text not null,
  rank smallint not null unique,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.currencies (
  id text primary key,                 -- cash ($, company), gold (premium), credits (earned playing)
  name text not null,
  scope text not null check (scope in ('company', 'player')),
  premium boolean not null default false
);

create table if not exists public.shop_categories (
  id text primary key,
  name text not null,
  sort smallint not null default 0
);

create table if not exists public.events (
  id text primary key,
  name text not null,
  description text,
  color text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint events_window check (ends_at > starts_at)
);

-- everything the shop sells or the admin can grant (ids match assets/js/cosmetics.js)
create table if not exists public.items (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  category_id text not null references public.shop_categories (id),
  slot text,                           -- rack | server | switch | storage | rackacc | led | shirt | pants | hair | hat | shades | scarf | backpack | chain | palette | use | bot | null
  value jsonb,                         -- style key / colours, as in the client catalog
  name text not null,
  description text,
  rarity_id text not null references public.rarities (id),
  currency_id text not null default 'gold' references public.currencies (id),
  price integer not null default 0 check (price >= 0),
  stackable boolean not null default false,
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  sellable boolean not null default true,
  purchasable boolean not null default true,
  gift boolean not null default false, -- free to claim during its event
  grant_type public.grant_type not null default 'shop',
  event_id text references public.events (id),
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint items_price_if_sold check (not purchasable or price > 0 or gift)
);
create index if not exists items_category_idx on public.items (category_id);
create index if not exists items_event_idx on public.items (event_id) where event_id is not null;

-- cosmetic skins (1:1 with an item): what they dress
create table if not exists public.skins (
  item_id text primary key references public.items (id) on delete cascade,
  target text not null check (target in ('rack', 'server', 'switch', 'storage', 'rackacc', 'led', 'character')),
  theme text
);

create table if not exists public.event_items (
  event_id text not null references public.events (id) on delete cascade,
  item_id text not null references public.items (id) on delete cascade,
  kind text not null default 'shop' check (kind in ('shop', 'gift')),
  primary key (event_id, item_id)
);

-- legendary bot templates (the shop item → the crew member it becomes)
create table if not exists public.legendary_bot_templates (
  item_id text primary key references public.items (id) on delete cascade,
  name text not null,
  role text not null,
  level smallint not null default 8 check (level between 1 and 10),
  profile jsonb not null default '{}'::jsonb
);

-- hardware models: servers, switches, patch panels, storage (prices in company $)
create table if not exists public.server_types (
  id text primary key,
  kind text not null check (kind in ('server', 'switch', 'patch', 'storage')),
  name text not null,
  price integer not null check (price >= 0),
  perf numeric(5, 2),
  specs jsonb not null default '{}'::jsonb
);

-- everything placeable in build mode, with its price (company $). The save function charges by this.
create table if not exists public.equipment_prices (
  id text primary key,
  kind text not null,
  unit_kind text check (unit_kind in ('server', 'switch', 'patch')), -- rack units
  category text,
  name text not null,
  price integer not null check (price >= 0)
);

create table if not exists public.achievements (
  id text primary key,
  name text not null,
  description text,
  reward jsonb not null default '{}'::jsonb  -- e.g. {"gold": 5}
);

-- tunables the server uses (prices, caps, salaries). Readable by everyone, writable by nobody.
create table if not exists public.game_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===================================================================
-- 20261005000300_inventory.sql
-- ===================================================================
-- DataLab · 003 · inventory, equipped items, legendary bots, grants, achievements, rate limits

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.inventories (user_id) on delete cascade,
  item_id text not null references public.items (id),
  quantity integer not null check (quantity > 0 and quantity <= 100000),
  source public.grant_type not null default 'shop',
  event_id text references public.events (id),
  first_acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_unique unique (user_id, item_id)
);
create index if not exists inventory_items_user_idx on public.inventory_items (user_id);

-- one equipped item per slot; the FK to the owned row removes the equip when the item leaves
create table if not exists public.equipped_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot text not null,
  item_id text not null references public.items (id),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create index if not exists equipped_items_inv_idx on public.equipped_items (inventory_item_id);

-- every legendary bot the player owns, one row per bot (the inventory keeps the count)
create table if not exists public.legendary_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.items (id),
  name text not null check (char_length(name) between 1 and 32),
  level smallint not null default 8 check (level between 1 and 10),
  xp integer not null default 0 check (xp >= 0),
  skills jsonb not null default '{}'::jsonb,
  status text not null default 'stored' check (status in ('stored', 'active')),
  employee_id uuid,                          -- FK added in 0400 (employees)
  source public.grant_type not null default 'shop',
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists legendary_bots_user_idx on public.legendary_bots (user_id);

-- audit of everything granted by staff or by the system (who, to whom, what, how many, why, when)
create table if not exists public.item_grants (
  id bigint generated always as identity primary key,
  granted_by uuid references public.profiles (id) on delete set null, -- null = the system (event gift…)
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text references public.items (id),
  currency_id text references public.currencies (id),
  quantity integer not null check (quantity > 0),
  grant_type public.grant_type not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  constraint item_grants_one_target check ((item_id is null) <> (currency_id is null))
);
create index if not exists item_grants_user_idx on public.item_grants (user_id, created_at desc);
create index if not exists item_grants_by_idx on public.item_grants (granted_by, created_at desc);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- per-user request throttling for the Edge Functions (private: never exposed)
create table if not exists private.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket)
);

-- ===================================================================
-- 20261005000400_game.sql
-- ===================================================================
-- DataLab · 004 · game state: companies, datacenters, saves, terrain, rooms, furniture, crew,
-- servers, VMs, incidents, finances and the transaction ledger.
-- game_saves.data keeps the full snapshot the client restores; the other tables are the
-- server-side projection of it (validated and priced by private.save_game).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Meu datacenter' check (char_length(name) between 1 and 40),
  cash bigint not null default 0,
  phase text not null default 'setup' check (phase in ('setup', 'live')),
  month integer not null default 1 check (month >= 1),
  starter_kit jsonb not null default '{}'::jsonb,
  first_contract boolean not null default false,
  dc_rewarded boolean not null default false,
  last_settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_cash_floor check (cash > -10000000)
);
create index if not exists companies_user_idx on public.companies (user_id);

create table if not exists public.datacenters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null unique references public.companies (id) on delete cascade,
  name text not null default 'DC-01' check (char_length(name) between 1 and 40),
  preset text not null default 'zero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists datacenters_user_idx on public.datacenters (user_id);

create table if not exists public.game_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null default 'Meu datacenter' check (char_length(name) between 1 and 40),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  datacenter_id uuid not null unique references public.datacenters (id) on delete cascade,
  version integer not null default 0,
  data jsonb,                                    -- the snapshot (sanitized by the server)
  baseline jsonb not null default '{}'::jsonb,   -- what the preset brings for free (first save only)
  stats jsonb not null default '{}'::jsonb,
  play_minutes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_saves_slot unique (user_id, slot),
  constraint game_saves_size check (data is null or pg_column_size(data) < 3000000)
);

create table if not exists public.terrain (
  datacenter_id uuid primary key references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  width smallint not null check (width between 6 and 64),
  height smallint not null check (height between 6 and 48),
  expansions integer not null default 0 check (expansions >= 0),
  land_paid bigint not null default 0 check (land_paid >= 0),
  updated_at timestamptz not null default now()
);

-- floor areas (the "buildings" drawn with Nova sala / the lot's rectangles)
create table if not exists public.buildings (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  area_key text not null,
  name text,
  x smallint not null, y smallint not null, w smallint not null check (w between 1 and 64), h smallint not null check (h between 1 and 48),
  floor text,
  unique (datacenter_id, area_key)
);

create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text,
  theme text,
  style jsonb,
  x smallint, y smallint, w smallint, h smallint,
  tiles integer
);
create index if not exists rooms_dc_idx on public.rooms (datacenter_id);

create table if not exists public.furniture (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null,
  def_id text not null references public.equipment_prices (id),
  kind text not null,
  tx smallint not null, ty smallint not null, rot smallint not null default 0 check (rot between 0 and 3),
  skin_item_id text references public.items (id),
  paid integer not null default 0 check (paid >= 0),
  data jsonb not null default '{}'::jsonb,
  unique (datacenter_id, item_key)
);
create index if not exists furniture_def_idx on public.furniture (datacenter_id, def_id);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emp_key integer not null,
  name text not null check (char_length(name) between 1 and 32),
  role text not null check (char_length(role) between 1 and 40),
  is_legendary boolean not null default false,
  legendary_bot_id uuid unique references public.legendary_bots (id) on delete set null,
  level smallint not null default 1 check (level between 1 and 10),
  xp integer not null default 0 check (xp >= 0),
  pay_factor numeric(4, 2) not null default 1 check (pay_factor between 0.92 and 1.08),
  profile jsonb not null default '{}'::jsonb,
  hired_at timestamptz not null default now(),
  unique (datacenter_id, emp_key)
);
create index if not exists employees_user_idx on public.employees (user_id);
do $$ begin
  alter table public.legendary_bots add constraint legendary_bots_employee_fk foreign key (employee_id) references public.employees (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.bot_skills (
  employee_id uuid not null references public.employees (id) on delete cascade,
  skill text not null check (skill in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao')),
  value numeric(4, 1) not null check (value between 0 and 99),
  primary key (employee_id, skill)
);

create table if not exists public.bot_schedules (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  shift_id text not null default 'integral',
  start_hour smallint not null default 0 check (start_hour between 0 and 24),
  end_hour smallint not null default 24 check (end_hour between 0 and 24),
  oncall text[] not null default '{}'
);

-- salary history: the server computes it (role base × level × negotiated factor)
create table if not exists public.salaries (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  monthly integer not null check (monthly >= 0),
  reason text not null default 'hire',
  created_at timestamptz not null default now()
);
create index if not exists salaries_employee_idx on public.salaries (employee_id, created_at desc);

-- rack units (servers, switches, patch panels) and their state
create table if not exists public.servers (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text not null,
  rack_key text not null,
  slot smallint not null check (slot between 0 and 8),
  kind text not null check (kind in ('server', 'switch', 'patch')),
  server_type_id text not null references public.equipment_prices (id),
  name text,
  ip text,
  state text not null default 'new' check (state in ('new', 'link', 'online')),
  specialization text,
  paid integer not null default 0 check (paid >= 0),
  installed_at timestamptz not null default now(),
  unique (datacenter_id, device_key)
);

create table if not exists public.virtual_machines (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vm_key integer not null,
  node_key text not null,
  name text not null check (name ~ '^[a-z0-9.-]{1,24}$'),
  os text,
  specialization text,
  vcpu smallint not null check (vcpu between 1 and 256),
  ram_gb integer not null check (ram_gb between 1 and 4096),
  disk_gb integer not null check (disk_gb between 8 and 100000),
  status text not null check (status in ('running', 'stopped')),
  unique (datacenter_id, vm_key)
);

create table if not exists public.incidents (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text,
  type text not null check (char_length(type) <= 24),
  opened_minutes integer,
  resolved_at timestamptz not null default now(),
  resolved_by text check (resolved_by in ('player', 'crew')),
  loss integer not null default 0 check (loss >= 0)
);
create index if not exists incidents_dc_idx on public.incidents (datacenter_id, resolved_at desc);

-- the company's books per month (accumulated by every settle)
create table if not exists public.finances (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month integer not null,
  income bigint not null default 0,
  costs bigint not null default 0,
  purchases bigint not null default 0,
  hires bigint not null default 0,
  land bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, month)
);

-- append-only ledger of everything that moves money, credits, gold or items
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  currency_id text references public.currencies (id),
  item_id text references public.items (id),
  amount bigint not null,                        -- signed: + gained, − spent (items: quantity)
  balance_after bigint,
  kind text not null check (kind in ('welcome', 'new_game', 'purchase', 'sell', 'exchange', 'consume', 'claim', 'grant',
    'revenue', 'opex', 'equipment', 'refund', 'hire', 'land', 'reward', 'achievement', 'adjust')),
  description text,
  ref jsonb,
  request_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transactions_target check (currency_id is not null or item_id is not null)
);
create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);
-- the same request (client-generated id) is processed only once
create unique index if not exists transactions_request_key on public.transactions (user_id, request_id) where request_id is not null;

-- timestamps
do $$ declare t text; begin
  foreach t in array array['companies', 'datacenters', 'game_saves', 'terrain', 'inventory_items', 'legendary_bots', 'finances', 'wallets'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;

-- ===================================================================
-- 20261005000500_security.sql
-- ===================================================================
-- DataLab · 005 · security: RLS on every table, least-privilege grants
--
-- Rules:
-- 1. RLS is ON for every table in public (catalog included).
-- 2. Players SELECT only their own rows (user_id = auth.uid()); the catalog is public read-only.
-- 3. No INSERT/UPDATE/DELETE grants for anon/authenticated anywhere, except profiles
--    (username, display_name, avatar of the player's own row). Money, items, saves, roles and grants
--    only change through private.* functions, which the Edge Functions call after validating the user.

do $$
declare
  t text;
  catalog text[] := array['rarities', 'currencies', 'shop_categories', 'events', 'items', 'skins', 'event_items',
                          'legendary_bot_templates', 'server_types', 'equipment_prices', 'achievements', 'game_config'];
  own text[] := array['wallets', 'inventories', 'inventory_items', 'equipped_items', 'legendary_bots', 'item_grants',
                      'user_achievements', 'user_roles', 'companies', 'datacenters', 'game_saves', 'terrain', 'buildings',
                      'rooms', 'furniture', 'employees', 'salaries', 'servers', 'virtual_machines', 'incidents', 'finances',
                      'transactions'];
  has_roles boolean := exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon');
begin
  -- every table: RLS on (forced for the owner too, except the service role bypass that Supabase keeps)
  foreach t in array catalog || own || array['profiles', 'bot_skills', 'bot_schedules'] loop
    execute format('alter table public.%I enable row level security', t);
    if has_roles then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;

  foreach t in array catalog loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    if has_roles then execute format('grant select on public.%I to anon, authenticated', t); end if;
  end loop;

  foreach t in array own loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_own', t);
    if has_roles then execute format('grant select on public.%I to authenticated', t); end if;
  end loop;
end $$;

-- employees' children: visible through the parent employee
drop policy if exists bot_skills_own on public.bot_skills;
create policy bot_skills_own on public.bot_skills for select to authenticated
  using (exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid())));
drop policy if exists bot_schedules_own on public.bot_schedules;
create policy bot_schedules_own on public.bot_schedules for select to authenticated
  using (exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid())));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.bot_skills, public.bot_schedules to authenticated;
  end if;
end $$;

-- profiles: read and edit only your own; only these columns can be changed by the player
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.profiles to authenticated;
    grant update (username, display_name, avatar) on public.profiles to authenticated;
    grant execute on function public.username_available(text) to anon, authenticated;
  end if;
end $$;

-- The avatar may only wear shop cosmetics the player owns: anything else is reset to the free default.
create or replace function private.sanitize_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := coalesce(new.avatar, '{}'::jsonb);
  k text;
  slot_of jsonb := '{"outfit":"shirt","pantsStyle":"pants","hairStyle":"hair","hat":"hat"}';
  dflt jsonb := '{"outfit":"tee","pantsStyle":"","hairStyle":"short","hat":""}';
  owned boolean;
begin
  if jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;
  -- valued slots (shirt model, pants, hair, hat)
  for k in select jsonb_object_keys(slot_of) loop
    if a ? k and exists (select 1 from public.items i where i.slot = slot_of ->> k and i.value = a -> k) then
      select exists (
        select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id
        where i.slot = slot_of ->> k and i.value = a -> k and (k <> 'hat' or coalesce(i.color, '') = coalesce(a ->> 'hatColor', ''))
      ) into owned;
      if not owned then a := a || jsonb_build_object(k, dflt -> k); if k = 'hat' then a := a - 'hatColor'; end if; end if;
    end if;
  end loop;
  -- hat colours only come with an owned coloured hat
  if a ? 'hatColor' and not exists (
    select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id
    where i.slot = 'hat' and i.color = a ->> 'hatColor') then a := a - 'hatColor'; end if;
  -- flag accessories
  foreach k in array array['shades', 'scarf', 'backpack', 'chain'] loop
    if coalesce((a ->> k)::boolean, false) and not exists (
      select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id where i.slot = k) then
      a := a || jsonb_build_object(k, false);
    end if;
  end loop;
  -- legendary-only look pieces never belong to a player avatar
  a := a - 'visor' - 'legend';
  new.avatar := a;
  return new;
end $$;
drop trigger if exists profiles_sanitize_avatar on public.profiles;
create trigger profiles_sanitize_avatar before insert or update of avatar on public.profiles
  for each row execute function private.sanitize_avatar();

-- staff can never be created or changed through the API: user_roles has no write grants (above).
-- Changing roles: SQL editor (first admin) or the admin Edge Function (private.set_role, admins only).

-- ===================================================================
-- 20261005000600_functions.sql
-- ===================================================================
-- DataLab · 006 · server-side game logic (schema private, never exposed to the Data API)
-- Called only by the Edge Functions (direct DB connection), always with the user id taken from a
-- verified JWT. Every function that touches balances first locks the player's wallet row: that
-- serialises a player's requests, so double clicks / parallel requests cannot spend twice or
-- duplicate items. Errors are raised as  P0001 / message = machine code / hint = text for players.

alter table private.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- small helpers
-- ---------------------------------------------------------------------------
create or replace function private.cfg(p_key text) returns jsonb
language sql stable as $$ select value from public.game_config where key = p_key $$;

create or replace function private.econ(p_path text[]) returns jsonb
language sql stable as $$ select (select value from public.game_config where key = 'economy') #> p_path $$;

create or replace function private.fail(p_code text, p_hint text) returns void
language plpgsql as $$ begin raise exception using errcode = 'P0001', message = p_code, hint = p_hint; end $$;

create or replace function private.round50(p numeric) returns bigint
language sql immutable as $$ select (round(p / 50) * 50)::bigint $$;

create or replace function private.event_active(p_event text) returns boolean
language sql stable as $$ select exists (select 1 from public.events where id = p_event and now() between starts_at and ends_at) $$;

-- lock the player (wallet row) for the rest of the transaction
create or replace function private.lock_player(p_uid uuid) returns public.wallets
language plpgsql as $$
declare w public.wallets;
begin
  select * into w from public.wallets where user_id = p_uid for update;
  if not found then perform private.fail('no_account', 'Conta sem carteira: faça login novamente.'); end if;
  return w;
end $$;

-- a request id may be used once
create or replace function private.check_request(p_uid uuid, p_request uuid) returns void
language plpgsql as $$
begin
  if p_request is not null and exists (select 1 from public.transactions where user_id = p_uid and request_id = p_request) then
    perform private.fail('duplicate_request', 'Esta operação já foi processada.');
  end if;
end $$;

-- fixed-window throttling per user and bucket
create or replace function private.hit_rate(p_uid uuid, p_bucket text, p_max integer, p_window_s integer) returns void
language plpgsql as $$
declare r private.rate_limits;
begin
  insert into private.rate_limits as rl (user_id, bucket, window_start, hits) values (p_uid, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_s) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_s) then now() else rl.window_start end
  returning * into r;
  if r.hits > p_max then perform private.fail('rate_limited', 'Muitas requisições: espere alguns segundos.'); end if;
end $$;

create or replace function private.ledger(p_uid uuid, p_company uuid, p_currency text, p_item text, p_amount bigint, p_balance bigint,
  p_kind text, p_desc text, p_ref jsonb default null, p_request uuid default null, p_by uuid default null) returns void
language sql as $$
  insert into public.transactions (user_id, company_id, currency_id, item_id, amount, balance_after, kind, description, ref, request_id, created_by)
  values (p_uid, p_company, p_currency, p_item, p_amount, p_balance, p_kind, left(p_desc, 300), p_ref, p_request, p_by);
$$;

-- ---------------------------------------------------------------------------
-- signup: profile (unique username), wallet with the welcome Gold, inventory
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'jogador'), '[^a-zA-Z0-9_]', '', 'g'));
  name text;
  n integer := 0;
  welcome bigint := coalesce((select (value ->> 'welcome_gold')::bigint from public.game_config where key = 'economy'), 100);
begin
  base := left(base, 16);
  if char_length(base) < 3 then base := 'jogador'; end if;
  name := base;
  while exists (select 1 from public.profiles where lower(username) = name) loop
    n := n + 1;
    name := left(base, 15) || n::text;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, name, left(coalesce(new.raw_user_meta_data ->> 'display_name', name), 32));
  insert into public.wallets (user_id, gold) values (new.id, welcome);
  insert into public.inventories (user_id) values (new.id);
  insert into public.transactions (user_id, currency_id, amount, balance_after, kind, description) values (new.id, 'gold', welcome, welcome, 'welcome', 'Boas-vindas · moeda dourada');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
create or replace function private.inventory_state(p_uid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'wallet', (select jsonb_build_object('gold', gold, 'credits', credits) from public.wallets where user_id = p_uid),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity, 'source', source, 'event_id', event_id,
              'first_acquired_at', first_acquired_at, 'updated_at', updated_at) order by first_acquired_at) from public.inventory_items where user_id = p_uid), '[]'),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from public.equipped_items where user_id = p_uid), '{}'),
    'legendary', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item_id', item_id, 'name', name, 'level', level, 'status', status, 'employee_id', employee_id) order by acquired_at)
              from public.legendary_bots where user_id = p_uid), '[]'),
    'avatar', (select avatar from public.profiles where id = p_uid)
  );
$$;

-- add items (and one legendary bot row per unit for bot items)
create or replace function private.add_item(p_uid uuid, p_item text, p_qty integer, p_source public.grant_type) returns void
language plpgsql as $$
declare it public.items; tpl public.legendary_bot_templates; i integer;
begin
  select * into it from public.items where id = p_item;
  if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
  if p_qty < 1 or p_qty > 1000 then perform private.fail('bad_quantity', 'Quantidade inválida.'); end if;
  insert into public.inventory_items as v (user_id, item_id, quantity, source, event_id)
  values (p_uid, p_item, p_qty, p_source, it.event_id)
  on conflict (user_id, item_id) do update set quantity = v.quantity + excluded.quantity, updated_at = now();
  if it.category_id = 'legend' then
    select * into tpl from public.legendary_bot_templates where item_id = p_item;
    for i in 1 .. p_qty loop
      insert into public.legendary_bots (user_id, item_id, name, level, skills, source)
      values (p_uid, p_item, coalesce(tpl.name, it.name), coalesce(tpl.level, 8),
              '{"redes":86,"servidores":86,"sistemas":86,"seguranca":86,"gestao":86}'::jsonb, p_source);
    end loop;
  end if;
end $$;

create or replace function private.shop_purchase(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; q integer;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item and active;
  if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
  if it.gift then perform private.fail('use_claim', 'Este item é um presente: resgate em vez de comprar.'); end if;
  if not it.purchasable or it.price <= 0 then perform private.fail('not_for_sale', 'Este item não está à venda.'); end if;
  if it.event_id is not null and not private.event_active(it.event_id) then perform private.fail('event_over', 'O evento deste item terminou.'); end if;
  select quantity into q from public.inventory_items where user_id = p_uid and item_id = p_item;
  q := coalesce(q, 0);
  if not it.stackable and q > 0 then perform private.fail('already_owned', 'Este item já está no seu inventário.'); end if;
  if it.max_quantity is not null and q >= it.max_quantity then perform private.fail('max_quantity', 'Você já tem o máximo deste item.'); end if;
  if it.currency_id = 'gold' then
    if w.gold < it.price then perform private.fail('insufficient_gold', 'Gold insuficiente.'); end if;
    update public.wallets set gold = gold - it.price where user_id = p_uid returning * into w;
    perform private.ledger(p_uid, null, 'gold', null, -it.price, w.gold, 'purchase', 'Loja: ' || it.name, jsonb_build_object('item', it.id), p_request);
  else
    if w.credits < it.price then perform private.fail('insufficient_credits', 'Créditos insuficientes.'); end if;
    update public.wallets set credits = credits - it.price where user_id = p_uid returning * into w;
    perform private.ledger(p_uid, null, 'credits', null, -it.price, w.credits, 'purchase', 'Loja: ' || it.name, jsonb_build_object('item', it.id), p_request);
  end if;
  perform private.add_item(p_uid, p_item, 1, case when it.event_id is not null then 'event' else 'shop' end::public.grant_type);
  perform private.ledger(p_uid, null, null, p_item, 1, null, 'purchase', 'Item: ' || it.name);
  return private.inventory_state(p_uid);
end $$;

create or replace function private.shop_claim_gift(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item and active;
  if not found or not it.gift then perform private.fail('not_a_gift', 'Este item não é um presente.'); end if;
  if it.event_id is null or not private.event_active(it.event_id) then perform private.fail('event_over', 'O evento deste presente terminou.'); end if;
  if exists (select 1 from public.item_grants where user_id = p_uid and item_id = p_item and grant_type = 'event' and granted_by is null)
     or exists (select 1 from public.inventory_items where user_id = p_uid and item_id = p_item) then
    perform private.fail('already_claimed', 'Você já resgatou este presente.');
  end if;
  perform private.add_item(p_uid, p_item, 1, 'event');
  insert into public.item_grants (granted_by, user_id, item_id, quantity, grant_type, reason) values (null, p_uid, p_item, 1, 'event', 'Presente do evento ' || it.event_id);
  perform private.ledger(p_uid, null, null, p_item, 1, null, 'claim', 'Presente: ' || it.name);
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_sell(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; v public.inventory_items; refund bigint; bot uuid;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item for update;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if not it.sellable or it.price <= 0 or it.gift or it.event_id is not null or it.grant_type <> 'shop' then
    perform private.fail('not_sellable', 'Este item não pode ser vendido.');
  end if;
  if it.category_id = 'legend' then
    select id into bot from public.legendary_bots where user_id = p_uid and item_id = p_item and status = 'stored' order by acquired_at desc limit 1 for update;
    if bot is null then perform private.fail('bot_active', 'Guarde o bot (dispense-o no jogo e salve) antes de vender.'); end if;
    delete from public.legendary_bots where id = bot;
  end if;
  refund := floor(it.price / 2.0);
  if v.quantity > 1 then update public.inventory_items set quantity = quantity - 1 where id = v.id;
  else delete from public.inventory_items where id = v.id; end if;   -- equipped_items cascades
  update public.wallets set gold = gold + refund where user_id = p_uid returning * into w;
  perform private.ledger(p_uid, null, 'gold', null, refund, w.gold, 'sell', 'Venda: ' || it.name, jsonb_build_object('item', it.id), p_request);
  perform private.ledger(p_uid, null, null, p_item, -1, null, 'sell', 'Item vendido: ' || it.name);
  -- a sold cosmetic leaves the avatar too
  update public.profiles set avatar = avatar where id = p_uid;
  return private.inventory_state(p_uid);
end $$;

-- avatar fields for character slots
create or replace function private.avatar_patch(p_item public.items, p_on boolean) returns jsonb
language sql immutable as $$
  select case p_item.slot
    when 'shirt' then jsonb_build_object('outfit', case when p_on then p_item.value else '"tee"'::jsonb end)
    when 'pants' then jsonb_build_object('pantsStyle', case when p_on then p_item.value else '""'::jsonb end)
    when 'hair' then jsonb_build_object('hairStyle', case when p_on then p_item.value else '"short"'::jsonb end)
    when 'hat' then jsonb_build_object('hat', case when p_on then p_item.value else '""'::jsonb end, 'hatColor', case when p_on and p_item.color is not null then to_jsonb(p_item.color) else 'null'::jsonb end)
    when 'shades' then jsonb_build_object('shades', p_on)
    when 'scarf' then jsonb_build_object('scarf', p_on)
    when 'backpack' then jsonb_build_object('backpack', p_on)
    when 'chain' then jsonb_build_object('chain', p_on)
    else '{}'::jsonb end;
$$;

create or replace function private.inventory_equip(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is null or it.slot in ('palette', 'use', 'bot') then perform private.fail('not_equippable', 'Este item não é equipável.'); end if;
  insert into public.equipped_items (user_id, slot, item_id, inventory_item_id) values (p_uid, it.slot, it.id, v.id)
  on conflict (user_id, slot) do update set item_id = excluded.item_id, inventory_item_id = excluded.inventory_item_id, equipped_at = now();
  if it.category_id = 'char' then
    update public.profiles set avatar = (case when jsonb_typeof(avatar) = 'object' then avatar else '{}'::jsonb end) || private.avatar_patch(it, true) where id = p_uid;
  end if;
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_unequip(p_uid uuid, p_slot text) returns jsonb
language plpgsql as $$
declare it public.items;
begin
  perform private.lock_player(p_uid);
  select i.* into it from public.equipped_items e join public.items i on i.id = e.item_id where e.user_id = p_uid and e.slot = p_slot;
  if it.id is null then perform private.fail('not_equipped', 'Nada equipado neste espaço.'); end if;
  delete from public.equipped_items where user_id = p_uid and slot = p_slot;
  if it.category_id = 'char' then update public.profiles set avatar = avatar || private.avatar_patch(it, false) where id = p_uid; end if;
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_consume(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item for update;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is distinct from 'use' then perform private.fail('not_consumable', 'Este item não é consumível.'); end if;
  if v.quantity > 1 then update public.inventory_items set quantity = quantity - 1 where id = v.id;
  else delete from public.inventory_items where id = v.id; end if;
  perform private.ledger(p_uid, null, null, p_item, -1, null, 'consume', 'Usado: ' || it.name, jsonb_build_object('effect', it.value), p_request);
  return private.inventory_state(p_uid) || jsonb_build_object('effect', it.value);
end $$;

create or replace function private.wallet_exchange(p_uid uuid, p_credits integer, p_request uuid) returns jsonb
language plpgsql as $$
declare w public.wallets; rate integer := coalesce((private.econ('{gold_rate}'))::integer, 10); g bigint; cost bigint;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  if p_credits is null or p_credits < rate or p_credits > 1000000 then perform private.fail('bad_amount', 'Mínimo de ' || rate || ' créditos.'); end if;
  g := p_credits / rate;
  cost := g * rate;
  if w.credits < cost then perform private.fail('insufficient_credits', 'Créditos insuficientes.'); end if;
  update public.wallets set credits = credits - cost, gold = gold + g where user_id = p_uid returning * into w;
  perform private.ledger(p_uid, null, 'credits', null, -cost, w.credits, 'exchange', 'Câmbio → ' || g || ' Gold', null, p_request);
  perform private.ledger(p_uid, null, 'gold', null, g, w.gold, 'exchange', 'Câmbio de ' || cost || ' créditos');
  return private.inventory_state(p_uid);
end $$;

-- ---------------------------------------------------------------------------
-- staff: grants and roles (the Edge Function checks the role; checked again here)
-- ---------------------------------------------------------------------------
create or replace function private.admin_grant(p_actor uuid, p_target uuid, p_item text, p_currency text, p_qty integer,
  p_type public.grant_type, p_reason text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; gid bigint; q integer;
begin
  if not private.has_role(p_actor, array['admin', 'developer']::public.app_role[]) then
    perform private.fail('forbidden', 'Sem permissão para conceder itens.');
  end if;
  if p_type not in ('developer', 'founder', 'beta', 'event', 'compensation', 'special') then perform private.fail('bad_grant_type', 'Tipo de concessão inválido.'); end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then perform private.fail('reason_required', 'Informe o motivo (mínimo 3 caracteres).'); end if;
  if (p_item is null) = (p_currency is null) then perform private.fail('bad_target', 'Escolha um item OU uma moeda.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  -- developer grants are for the dev team: only admins hand out currency or developer items to others
  if p_currency is not null and not private.has_role(p_actor, array['admin']::public.app_role[]) then
    perform private.fail('forbidden', 'Só administradores concedem moedas.');
  end if;
  w := private.lock_player(p_target);
  perform private.check_request(p_target, p_request);
  if p_item is not null then
    select * into it from public.items where id = p_item;
    if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
    if p_qty is null or p_qty < 1 or p_qty > 100 then perform private.fail('bad_quantity', 'Quantidade de 1 a 100.'); end if;
    select quantity into q from public.inventory_items where user_id = p_target and item_id = p_item;
    if not it.stackable and (coalesce(q, 0) > 0 or p_qty > 1) then perform private.fail('already_owned', 'O jogador já tem este item (não acumulável).'); end if;
    perform private.add_item(p_target, p_item, p_qty, p_type);
    insert into public.item_grants (granted_by, user_id, item_id, quantity, grant_type, reason) values (p_actor, p_target, p_item, p_qty, p_type, trim(p_reason)) returning id into gid;
    perform private.ledger(p_target, null, null, p_item, p_qty, null, 'grant', 'Concedido: ' || it.name || ' · ' || trim(p_reason), jsonb_build_object('grant', gid), p_request, p_actor);
  else
    if p_currency not in ('gold', 'credits') then perform private.fail('bad_currency', 'Moeda inválida.'); end if;
    if p_qty is null or p_qty < 1 or p_qty > 1000000 then perform private.fail('bad_quantity', 'Valor de 1 a 1.000.000.'); end if;
    if p_currency = 'gold' then update public.wallets set gold = gold + p_qty where user_id = p_target returning * into w;
    else update public.wallets set credits = credits + p_qty where user_id = p_target returning * into w; end if;
    insert into public.item_grants (granted_by, user_id, currency_id, quantity, grant_type, reason) values (p_actor, p_target, p_currency, p_qty, p_type, trim(p_reason)) returning id into gid;
    perform private.ledger(p_target, null, p_currency, null, p_qty, case when p_currency = 'gold' then w.gold else w.credits end, 'grant', 'Concessão · ' || trim(p_reason), jsonb_build_object('grant', gid), p_request, p_actor);
  end if;
  return (select to_jsonb(g) from public.item_grants g where id = gid);
end $$;

create or replace function private.admin_set_role(p_actor uuid, p_target uuid, p_role public.app_role, p_on boolean) returns jsonb
language plpgsql as $$
begin
  if not private.has_role(p_actor, array['admin']::public.app_role[]) then perform private.fail('forbidden', 'Só administradores mudam papéis.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  if p_on then
    insert into public.user_roles (user_id, role, granted_by) values (p_target, p_role, p_actor) on conflict do nothing;
  else
    if p_role = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 and exists (select 1 from public.user_roles where user_id = p_target and role = 'admin') then
      perform private.fail('last_admin', 'Não é possível remover o último administrador.');
    end if;
    delete from public.user_roles where user_id = p_target and role = p_role;
  end if;
  return coalesce((select jsonb_agg(role) from public.user_roles where user_id = p_target), '[]');
end $$;

create or replace function private.admin_find_users(p_actor uuid, p_query text) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'created_at', p.created_at,
      'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]')) order by p.username)
    from (select * from public.profiles where p_query is null or char_length(p_query) < 2 or username ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%' or id::text = p_query limit 25) p), '[]');
end $$;

create or replace function private.admin_grants_log(p_actor uuid, p_limit integer) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select g.id, g.created_at, g.item_id, g.currency_id, g.quantity, g.grant_type, g.reason,
           (select username from public.profiles where id = g.user_id) as to_user, (select username from public.profiles where id = g.granted_by) as by_user
    from public.item_grants g order by g.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- game: new game, land, saves (with the server-side economy)
-- ---------------------------------------------------------------------------
create or replace function private.game_new(p_uid uuid, p_slot integer, p_name text, p_preset text) returns jsonb
language plpgsql as $$
declare
  pre jsonb := private.econ(array['presets', p_preset]);
  co public.companies; dc public.datacenters; sv public.game_saves;
  live boolean;
begin
  perform private.lock_player(p_uid);
  if p_slot not between 1 and 3 then perform private.fail('bad_slot', 'Espaço de save inválido (1 a 3).'); end if;
  if pre is null then perform private.fail('bad_preset', 'Ponto de partida desconhecido.'); end if;
  live := coalesce((pre ->> 'live')::boolean, false);
  -- a new game in a used slot replaces it (cascades company, datacenter, projection)
  delete from public.companies where id in (select company_id from public.game_saves where user_id = p_uid and slot = p_slot);
  insert into public.companies (user_id, name, cash, phase, starter_kit, first_contract)
  values (p_uid, left(coalesce(nullif(trim(p_name), ''), 'Meu datacenter'), 40), (pre ->> 'cash')::bigint, case when live then 'live' else 'setup' end,
          coalesce(private.econ('{starter_kit}'), '{}'), live)
  returning * into co;
  insert into public.datacenters (user_id, company_id, name, preset) values (p_uid, co.id, co.name, p_preset) returning * into dc;
  insert into public.terrain (datacenter_id, user_id, width, height) values (dc.id, p_uid, (pre -> 'lot' ->> 'w')::smallint, (pre -> 'lot' ->> 'h')::smallint);
  insert into public.game_saves (user_id, slot, name, company_id, datacenter_id, baseline)
  values (p_uid, p_slot, co.name, co.id, dc.id, jsonb_build_object('items', coalesce(pre -> 'items', '{}'), 'crew', coalesce((pre ->> 'crew')::int, 0)))
  returning * into sv;
  perform private.ledger(p_uid, co.id, 'cash', null, co.cash, co.cash, 'new_game', 'Nova empresa · ' || p_preset);
  return jsonb_build_object('save_id', sv.id, 'slot', sv.slot, 'cash', co.cash, 'phase', co.phase, 'kit', co.starter_kit,
    'terrain', jsonb_build_object('w', (pre -> 'lot' ->> 'w')::int, 'h', (pre -> 'lot' ->> 'h')::int), 'version', 0);
end $$;

create or replace function private.lot_price(p_w integer, p_h integer, p_dw integer, p_dh integer, p_built integer) returns bigint
language sql stable as $$
  with l as (select private.econ('{lot}') as v)
  select case when ((p_w + greatest(p_dw, 0)) * (p_h + greatest(p_dh, 0)) - p_w * p_h) <= 0 then 0 else
    private.round50(((p_w + greatest(p_dw, 0)) * (p_h + greatest(p_dh, 0)) - p_w * p_h)
      * ((v ->> 'base')::numeric * power(greatest(1, (p_w * p_h)::numeric / (v ->> 'freeArea')::numeric), (v ->> 'growth')::numeric)
      * (1 + coalesce(p_built, 0)::numeric / (v ->> 'builtK')::numeric))) end
  from l;
$$;

create or replace function private.game_expand_lot(p_uid uuid, p_slot integer, p_dw integer, p_dh integer, p_request uuid, p_built integer default 0) returns jsonb
language plpgsql as $$
declare sv public.game_saves; co public.companies; tr public.terrain; built integer; price bigint; kit integer;
begin
  perform private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  if not ((p_dw = 4 and p_dh = 0) or (p_dw = 0 and p_dh = 4)) then perform private.fail('bad_expansion', 'Expansão inválida.'); end if;
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot;
  if not found then perform private.fail('save_not_found', 'Save não encontrado.'); end if;
  select * into co from public.companies where id = sv.company_id for update;
  select * into tr from public.terrain where datacenter_id = sv.datacenter_id for update;
  if tr.width + p_dw > 64 or tr.height + p_dh > 48 then perform private.fail('lot_limit', 'Limite do terreno: 64 × 48.'); end if;
  select coalesce(sum(w * h), 0) into built from public.buildings where datacenter_id = sv.datacenter_id;
  -- the client's floor area counts only when larger (it can only make the land dearer, never cheaper)
  built := greatest(built, least(coalesce(p_built, 0), 64 * 48));
  kit := coalesce((co.starter_kit ->> 'lot')::int, 0);
  price := case when kit > 0 then 0 else private.lot_price(tr.width, tr.height, p_dw, p_dh, built) end;
  if co.cash < price then perform private.fail('insufficient_cash', 'Caixa insuficiente para expandir o terreno.'); end if;
  update public.companies set cash = cash - price,
    starter_kit = case when kit > 0 then jsonb_set(starter_kit, '{lot}', to_jsonb(kit - 1)) else starter_kit end
  where id = co.id returning * into co;
  update public.terrain set width = width + p_dw, height = height + p_dh, expansions = expansions + 1, land_paid = land_paid + price
  where datacenter_id = sv.datacenter_id returning * into tr;
  insert into public.finances as f (company_id, user_id, month, land) values (co.id, p_uid, co.month, price)
  on conflict (company_id, month) do update set land = f.land + excluded.land;
  perform private.ledger(p_uid, co.id, 'cash', null, -price, co.cash, 'land', 'Terreno → ' || tr.width || '×' || tr.height, jsonb_build_object('dw', p_dw, 'dh', p_dh), p_request);
  return jsonb_build_object('cash', co.cash, 'price', price, 'kit', co.starter_kit, 'terrain', jsonb_build_object('w', tr.width, 'h', tr.height, 'expansions', tr.expansions));
end $$;

-- Save = validate the snapshot, price what changed since the last save (the server's prices, the
-- starter kit and the preset's free baseline), cap revenue and credits by what the datacenter can
-- really earn in the elapsed time, enforce minimum operating costs, check legendary bots and skins
-- belong to the player, rewrite the projection tables and the books. All in one transaction.
create or replace function private.game_save(p_uid uuid, p_slot integer, p_data jsonb, p_claim jsonb, p_request uuid) returns jsonb
language plpgsql as $$
declare
  cfgv jsonb := private.cfg('economy');
  sv public.game_saves; co public.companies; tr public.terrain; w public.wallets;
  lot_w integer; lot_h integer;
  real_min numeric; claim_min numeric; mins numeric;
  kit jsonb; base jsonb; base_crew integer;
  r record; price integer; kk text; auto_doors integer;
  purchases bigint := 0; refunds bigint := 0; hires bigint := 0; revenue bigint := 0; opex bigint := 0; opex_min numeric := 0;
  online integer := 0; new_online integer := 0; storages integer := 0; aps integer := 0;
  cap numeric; claim_rev numeric; first_contract_now boolean := false;
  credits_allowed numeric; credits_award bigint := 0; gold_award bigint := 0;
  payroll numeric := 0; sal numeric; lvl integer; fee bigint;
  changes jsonb := '[]'; new_items jsonb; new_crew jsonb; dc_ok boolean; month_new integer;
  emp_id uuid; bot uuid;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot for update;
  if not found then perform private.fail('save_not_found', 'Crie um jogo neste espaço primeiro.'); end if;
  select * into co from public.companies where id = sv.company_id for update;
  select * into tr from public.terrain where datacenter_id = sv.datacenter_id for update;

  -- ---------- shape ----------
  if jsonb_typeof(p_data) <> 'object' or coalesce((p_data ->> 'v')::int, 0) <> 1 then perform private.fail('bad_save', 'Formato de save inválido.'); end if;
  if jsonb_typeof(p_data -> 'items') <> 'array' or jsonb_typeof(p_data -> 'areas') <> 'array' then perform private.fail('bad_save', 'Save sem itens/áreas.'); end if;
  if jsonb_array_length(p_data -> 'items') > 4000 or jsonb_array_length(p_data -> 'areas') > 60
     or jsonb_array_length(coalesce(p_data -> 'crew', '[]')) > 12 or jsonb_array_length(coalesce(p_data -> 'vms', '[]')) > 200
     or jsonb_array_length(coalesce(p_data -> 'links', '[]')) > 2000 or jsonb_array_length(coalesce(p_data -> 'walls', '[]')) > 8000 then
    perform private.fail('save_too_big', 'Save grande demais.');
  end if;
  lot_w := (p_data -> 'lot' ->> 'w')::int;
  lot_h := (p_data -> 'lot' ->> 'h')::int;
  if lot_w is null or lot_h is null or lot_w < 6 or lot_h < 6 then perform private.fail('bad_lot', 'Terreno inválido.'); end if;
  -- the land must have been paid for (expand_lot); shrinking is allowed and gives nothing back
  if lot_w > tr.width or lot_h > tr.height then perform private.fail('lot_not_paid', 'O terreno do save é maior que o comprado.'); end if;
  if exists (select 1 from jsonb_array_elements(p_data -> 'areas') a
             where (a ->> 'x')::int < 0 or (a ->> 'y')::int < 0 or (a ->> 'w')::int < 1 or (a ->> 'h')::int < 1
                or (a ->> 'x')::int + (a ->> 'w')::int > lot_w or (a ->> 'y')::int + (a ->> 'h')::int > lot_h) then
    perform private.fail('bad_areas', 'Área fora do terreno.');
  end if;

  -- ---------- elapsed time (1 real second = 1 game minute) ----------
  real_min := extract(epoch from (now() - co.last_settled_at));
  claim_min := greatest(0, least(coalesce((p_claim ->> 'elapsed_min')::numeric, 0), 7200));
  mins := least(claim_min, real_min * 1.1 + 10);

  -- ---------- items in the snapshot ----------
  create temp table _it on commit drop as
    select coalesce(e ->> 'uid', '') as k, e ->> 'def' as def, coalesce((e ->> 'tx')::int, 0) as tx, coalesce((e ->> 'ty')::int, 0) as ty,
           coalesce((e ->> 'rot')::int, 0) as rot, e ->> 'skin' as skin, e ->> 'id' as rid, e -> 'units' as units, ord::int as ord, 0 as paid, e as raw
    from jsonb_array_elements(p_data -> 'items') with ordinality as t(e, ord);
  if exists (select 1 from _it where k !~ '^[A-Za-z0-9:_-]{1,40}$') then perform private.fail('bad_item', 'Item sem identificador.'); end if;
  if exists (select k from _it group by k having count(*) > 1) then perform private.fail('bad_item', 'Itens duplicados no save.'); end if;
  select def into kk from _it where def is null or def not in (select id from public.equipment_prices) limit 1;
  if found then perform private.fail('unknown_item', 'Item desconhecido no save: ' || coalesce(kk, '?')); end if;
  if exists (select 1 from _it where tx < 0 or ty < 0 or tx >= lot_w or ty >= lot_h or rot not between 0 and 3) then perform private.fail('bad_item', 'Item fora do terreno.'); end if;

  create temp table _un on commit drop as
    select i.rid || ':' || (u.ord - 1) as device_key, i.rid as rack_key, (u.ord - 1)::int as slot, u.v #>> '{}' as def, p.unit_kind as kind, 0 as paid,
           coalesce(d.d ->> 'state', 'new') as state, d.d ->> 'name' as name, d.d ->> 'ip' as ip, d.d ->> 'svc' as svc
    from _it i
    cross join lateral jsonb_array_elements(case when jsonb_typeof(i.units) = 'array' then i.units else '[]' end) with ordinality as u(v, ord)
    left join public.equipment_prices p on p.id = u.v #>> '{}'
    left join lateral (select x as d from jsonb_array_elements(coalesce(p_data -> 'devices', '[]')) x where x ->> 'key' = i.rid || ':' || (u.ord - 1) limit 1) d on true
    where jsonb_typeof(u.v) = 'string';
  if exists (select 1 from _it where jsonb_typeof(units) = 'array' and (jsonb_array_length(units) > 9 or coalesce(rid, '') !~ '^[A-Za-z0-9-]{1,20}$')) then
    perform private.fail('bad_rack', 'Rack inválido no save.');
  end if;
  if exists (select 1 from _un where kind is null) then perform private.fail('unknown_item', 'Equipamento de rack desconhecido.'); end if;
  if exists (select device_key from _un group by device_key having count(*) > 1) then perform private.fail('bad_rack', 'Racks com o mesmo identificador.'); end if;
  update _un set state = 'new' where state not in ('new', 'link', 'online') or kind <> 'server' and state <> 'online';

  -- ---------- skins on objects: only the player's own ----------
  for r in select k, skin from _it where skin is not null and skin <> 'none'
             and not exists (select 1 from public.inventory_items v join public.items i on i.id = v.item_id
                             where v.user_id = p_uid and v.item_id = _it.skin and i.slot in ('rack', 'storage')) loop
    update _it set skin = null where k = r.k;
    changes := changes || jsonb_build_object('type', 'skin_removed', 'uid', r.k);
  end loop;

  -- ---------- price what is new: preset baseline (first save) → starter kit → server price ----------
  kit := coalesce(co.starter_kit, '{}');
  base := case when sv.version = 0 then coalesce(sv.baseline -> 'items', '{}') else '{}' end;
  base_crew := case when sv.version = 0 then coalesce((sv.baseline ->> 'crew')::int, 0) else 0 end;
  -- doors created automatically between two new areas are free: at most 2 per floor area
  auto_doors := 2 * jsonb_array_length(p_data -> 'areas');
  for r in select n.k, n.def, p.price, p.kind, coalesce((n.raw ->> 'auto')::boolean, false) as auto from _it n join public.equipment_prices p on p.id = n.def
           where not exists (select 1 from public.furniture f where f.datacenter_id = sv.datacenter_id and f.item_key = n.k and f.def_id = n.def)
           order by n.ord loop
    kk := case when r.kind = 'desk' then 'desk' when r.def = 'rack' then 'rack' else null end;
    if r.auto and r.def in ('door', 'door2') and auto_doors > 0 then auto_doors := auto_doors - 1; price := 0;
    elsif coalesce((base ->> r.def)::int, 0) > 0 then base := jsonb_set(base, array[r.def], to_jsonb((base ->> r.def)::int - 1)); price := 0;
    elsif kk is not null and coalesce((kit ->> kk)::int, 0) > 0 then kit := jsonb_set(kit, array[kk], to_jsonb((kit ->> kk)::int - 1)); price := 0;
    else price := r.price; end if;
    purchases := purchases + price;
    update _it set paid = price where _it.k = r.k;
  end loop;
  update _it n set paid = f.paid from public.furniture f where f.datacenter_id = sv.datacenter_id and f.item_key = n.k and f.def_id = n.def;
  select coalesce(sum(floor(f.paid * 0.5)), 0) into refunds from public.furniture f
   where f.datacenter_id = sv.datacenter_id and not exists (select 1 from _it n where n.k = f.item_key and n.def = f.def_id);

  for r in select u.device_key, u.def, u.kind, p.price from _un u join public.equipment_prices p on p.id = u.def
           where not exists (select 1 from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.server_type_id = u.def) loop
    kk := r.kind; -- server | switch | patch
    if coalesce((base ->> r.def)::int, 0) > 0 then base := jsonb_set(base, array[r.def], to_jsonb((base ->> r.def)::int - 1)); price := 0;
    elsif coalesce((base ->> kk)::int, 0) > 0 then base := jsonb_set(base, array[kk], to_jsonb((base ->> kk)::int - 1)); price := 0;
    elsif coalesce((kit ->> kk)::int, 0) > 0 then kit := jsonb_set(kit, array[kk], to_jsonb((kit ->> kk)::int - 1)); price := 0;
    else price := r.price; end if;
    purchases := purchases + price;
    update _un set paid = price where _un.device_key = r.device_key;
  end loop;
  update _un u set paid = s.paid from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.server_type_id = u.def;
  select refunds + coalesce(sum(floor(s.paid * 0.5)), 0) into refunds from public.servers s
   where s.datacenter_id = sv.datacenter_id and not exists (select 1 from _un u where u.device_key = s.device_key and u.def = s.server_type_id);

  -- ---------- what the datacenter can earn ----------
  select count(*) filter (where kind = 'server' and state = 'online') into online from _un;
  select count(*) into new_online from _un u where u.kind = 'server' and u.state = 'online'
    and not exists (select 1 from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.state = 'online');
  select count(*) filter (where p.kind = 'storage'), count(*) filter (where p.kind = 'ap') into storages, aps from _it n join public.equipment_prices p on p.id = n.def;

  -- ---------- crew ----------
  create temp table _cr on commit drop as
    select (c ->> 'key')::int as emp_key, left(coalesce(c ->> 'name', 'Bot'), 32) as name, left(coalesce(c ->> 'role', 'funcionario'), 40) as role,
           least(10, greatest(1, coalesce((c ->> 'level')::int, 1))) as level, greatest(0, least(100000, coalesce((c ->> 'xp')::int, 0))) as xp,
           least(1.08, greatest(0.92, coalesce((c ->> 'pay')::numeric, 1))) as pay, nullif(c ->> 'legend', '') as legend, c as raw, ord::int as ord
    from jsonb_array_elements(coalesce(p_data -> 'crew', '[]')) with ordinality as t(c, ord);
  if exists (select 1 from _cr where emp_key is null) or exists (select emp_key from _cr group by emp_key having count(*) > 1) then
    perform private.fail('bad_crew', 'Equipe inválida no save.');
  end if;
  -- legendary bots: must be the player's, one employee each
  for r in select emp_key, legend from _cr where legend is not null loop
    bot := null;
    begin bot := r.legend::uuid; exception when others then bot := null; end;
    if bot is null or not exists (select 1 from public.legendary_bots b where b.id = bot and b.user_id = p_uid)
       or (select count(*) from _cr where legend = r.legend) > 1 then
      update _cr set legend = null where emp_key = r.emp_key;
      changes := changes || jsonb_build_object('type', 'legend_removed', 'key', r.emp_key);
    end if;
  end loop;
  -- level can't jump: new hires start at most at level 3 (legendary: 8), others gain at most 2 per save
  update _cr c set level = least(c.level, case when c.legend is not null then 10 else coalesce(e.level + 2, 3) end)
    from (select _cr.emp_key, e.level from _cr left join public.employees e on e.datacenter_id = sv.datacenter_id and e.emp_key = _cr.emp_key) e
   where e.emp_key = c.emp_key;
  for r in select c.*, (select e.id from public.employees e where e.datacenter_id = sv.datacenter_id and e.emp_key = c.emp_key) as eid from _cr c order by ord loop
    sal := private.round50(coalesce((cfgv -> 'salary' ->> r.role)::numeric, (cfgv ->> 'salary_custom')::numeric)
             * (1 + (cfgv ->> 'salary_per_level')::numeric * (r.level - 1)) * r.pay);
    payroll := payroll + sal;
    if r.eid is null and r.legend is null then
      if base_crew > 0 then base_crew := base_crew - 1;
      elsif coalesce((kit ->> 'hire')::int, 0) > 0 then kit := jsonb_set(kit, '{hire}', to_jsonb((kit ->> 'hire')::int - 1));
      else fee := private.round50(sal * (cfgv ->> 'hire_fee')::numeric); hires := hires + fee; end if;
    end if;
  end loop;

  -- ---------- money ----------
  cap := online * (cfgv ->> 'max_rev_per_server')::numeric + storages * (cfgv ->> 'max_rev_per_storage')::numeric
       + aps * (cfgv ->> 'max_rev_per_ap')::numeric + (cfgv ->> 'max_sales_per_min')::numeric;
  claim_rev := greatest(0, coalesce((p_claim ->> 'revenue')::numeric, 0));
  if not co.first_contract and online > 0 then first_contract_now := true; end if;
  revenue := least(claim_rev, cap * mins + case when first_contract_now then (cfgv ->> 'first_contract')::numeric else 0 end)::bigint;
  -- operating costs: what the client reports, never less than the salaries (after the tutorial window)
  if co.phase = 'live' and sv.play_minutes + mins > (cfgv ->> 'grace_minutes')::numeric then
    opex_min := payroll / (cfgv ->> 'month_minutes')::numeric * (cfgv ->> 'opex_floor')::numeric * mins;
  end if;
  opex := greatest(coalesce((p_claim ->> 'opex')::numeric, 0), opex_min)::bigint;

  co.cash := co.cash + revenue - opex - purchases - hires + refunds;
  if co.cash < (cfgv ->> 'min_cash')::bigint then perform private.fail('cash_invalid', 'Saldo da empresa inconsistente: recarregue o último save.'); end if;

  -- credits: capped per minute + 50 per server newly online + incidents; Gold for a completed datacenter
  -- (anti-farming: servers that come with the preset don't count, and per save at most one newly-online
  -- server per 5 real minutes and one incident per 10 — configuring and fixing take real time)
  if sv.version = 0 then new_online := 0; end if;
  credits_allowed := mins * ((cfgv ->> 'credits_per_min')::numeric + online * (cfgv ->> 'credits_per_online_min')::numeric)
                   + least(new_online, floor(mins / 5) + 1) * (cfgv ->> 'credits_per_server_online')::numeric
                   + least(jsonb_array_length(coalesce(p_claim -> 'incidents', '[]')), floor(mins / 10) + 1, 20) * (cfgv ->> 'credits_per_incident')::numeric;
  -- (anti-farming: the save must have been played for a while, and at most 3 such rewards a day per player)
  dc_ok := coalesce((p_claim ->> 'dc_done')::boolean, false) and not co.dc_rewarded and online >= 2
           and sv.play_minutes + mins >= coalesce((cfgv ->> 'dc_min_minutes')::numeric, 60)
           and (select count(*) from public.transactions t where t.user_id = p_uid and t.kind = 'reward' and t.currency_id = 'gold'
                and t.description = 'Datacenter concluído' and t.created_at > now() - interval '1 day') < coalesce((cfgv ->> 'dc_rewards_per_day')::int, 3)
           and exists (select 1 from _un where kind = 'switch') and exists (select 1 from _it n join public.equipment_prices p on p.id = n.def where p.kind = 'desk')
           and (select count(*) from _cr) >= 2;
  if dc_ok then credits_allowed := credits_allowed + (cfgv ->> 'credits_dc')::numeric; gold_award := (cfgv ->> 'gold_dc')::bigint; co.dc_rewarded := true; end if;
  credits_award := least(greatest(coalesce((p_claim ->> 'credits')::numeric, 0), 0), credits_allowed)::bigint;

  -- ---------- projection ----------
  delete from public.buildings where datacenter_id = sv.datacenter_id;
  insert into public.buildings (datacenter_id, user_id, area_key, name, x, y, w, h, floor)
  select sv.datacenter_id, p_uid, left(coalesce(a ->> 'id', 'a' || ord), 20), left(a ->> 'name', 40), (a ->> 'x')::int, (a ->> 'y')::int, (a ->> 'w')::int, (a ->> 'h')::int, left(a ->> 'floor', 20)
  from jsonb_array_elements(p_data -> 'areas') with ordinality as t(a, ord)
  on conflict (datacenter_id, area_key) do nothing;

  delete from public.rooms where datacenter_id = sv.datacenter_id;
  insert into public.rooms (datacenter_id, user_id, name, type, theme, style, x, y, w, h, tiles)
  select sv.datacenter_id, p_uid, left(coalesce(nullif(r2 ->> 'name', ''), 'Sala'), 40), left(r2 ->> 'type', 20), left(r2 ->> 'theme', 20),
         case when jsonb_typeof(r2 -> 'style') = 'object' and pg_column_size(r2 -> 'style') < 2000 then r2 -> 'style' end,
         (r2 ->> 'x')::int, (r2 ->> 'y')::int, (r2 ->> 'w')::int, (r2 ->> 'h')::int, (r2 ->> 'n')::int
  from jsonb_array_elements(coalesce(p_data -> 'rooms', '[]')) r2 limit 60;

  delete from public.furniture where datacenter_id = sv.datacenter_id;
  insert into public.furniture (datacenter_id, user_id, item_key, def_id, kind, tx, ty, rot, skin_item_id, paid, data)
  select sv.datacenter_id, p_uid, n.k, n.def, p.kind, n.tx, n.ty, n.rot, case when n.skin in (select id from public.items) then n.skin end, n.paid,
         (n.raw - 'units' - 'uid' - 'def' - 'tx' - 'ty' - 'rot' - 'skin')
  from _it n join public.equipment_prices p on p.id = n.def;

  delete from public.servers where datacenter_id = sv.datacenter_id;
  insert into public.servers (datacenter_id, user_id, device_key, rack_key, slot, kind, server_type_id, name, ip, state, specialization, paid)
  select sv.datacenter_id, p_uid, device_key, rack_key, slot, kind, def, left(name, 24), left(ip, 40), state, left(svc, 16), paid from _un;

  delete from public.virtual_machines where datacenter_id = sv.datacenter_id;
  insert into public.virtual_machines (datacenter_id, user_id, vm_key, node_key, name, os, specialization, vcpu, ram_gb, disk_gb, status)
  select sv.datacenter_id, p_uid, (v ->> 'id')::int, v ->> 'node', lower(left(regexp_replace(coalesce(v ->> 'name', 'vm'), '[^a-zA-Z0-9.-]', '-', 'g'), 24)),
         left(v ->> 'os', 30), left(v ->> 'svc', 16), least(256, greatest(1, (v ->> 'cores')::int)), least(4096, greatest(1, (v ->> 'ram')::int)),
         least(100000, greatest(8, (v ->> 'disk')::int)), case when v ->> 'status' = 'running' then 'running' else 'stopped' end
  from jsonb_array_elements(coalesce(p_data -> 'vms', '[]')) v
  where (v ->> 'id') ~ '^[0-9]{1,9}$' and exists (select 1 from _un u where u.device_key = v ->> 'node' and u.kind = 'server')
  on conflict (datacenter_id, vm_key) do nothing;

  -- crew: upsert, drop the ones gone, refresh skills / schedules, salary history when it changes
  update public.legendary_bots set status = 'stored', employee_id = null where user_id = p_uid
    and employee_id in (select id from public.employees where datacenter_id = sv.datacenter_id);
  delete from public.employees where datacenter_id = sv.datacenter_id and emp_key not in (select emp_key from _cr);
  update public.employees set legendary_bot_id = null, is_legendary = false where datacenter_id = sv.datacenter_id;
  for r in select c.*, not exists (select 1 from public.employees x where x.datacenter_id = sv.datacenter_id and x.emp_key = c.emp_key) as fresh from _cr c order by ord loop
    insert into public.employees as e (datacenter_id, user_id, emp_key, name, role, is_legendary, legendary_bot_id, level, xp, pay_factor, profile)
    values (sv.datacenter_id, p_uid, r.emp_key, r.name, r.role, r.legend is not null, r.legend::uuid, r.level, r.xp, r.pay,
            case when jsonb_typeof(r.raw -> 'profile') = 'object' and pg_column_size(r.raw -> 'profile') < 3000 then r.raw -> 'profile' else '{}' end)
    on conflict (datacenter_id, emp_key) do update set name = excluded.name, role = excluded.role, is_legendary = excluded.is_legendary,
      legendary_bot_id = excluded.legendary_bot_id, level = excluded.level, xp = excluded.xp, pay_factor = excluded.pay_factor, profile = excluded.profile
    returning id into emp_id;
    if r.legend is not null then update public.legendary_bots set status = 'active', employee_id = emp_id, level = r.level where id = r.legend::uuid; end if;
    delete from public.bot_skills where employee_id = emp_id;
    insert into public.bot_skills (employee_id, skill, value)
    select emp_id, s.key, least(99, greatest(0, (s.value #>> '{}')::numeric))
    from jsonb_each(case when jsonb_typeof(r.raw -> 'skills') = 'object' then r.raw -> 'skills' else '{}' end) s
    where s.key in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao') and jsonb_typeof(s.value) = 'number';
    insert into public.bot_schedules as b (employee_id, shift_id, start_hour, end_hour, oncall)
    values (emp_id, left(coalesce(r.raw -> 'shift' ->> 'id', 'integral'), 20), least(24, greatest(0, coalesce((r.raw -> 'shift' ->> 'start')::int, 0))),
            least(24, greatest(0, coalesce((r.raw -> 'shift' ->> 'end')::int, 24))),
            coalesce(array(select left(x, 12) from jsonb_array_elements_text(case when jsonb_typeof(r.raw -> 'oncall') = 'array' then r.raw -> 'oncall' else '[]' end) x limit 3), '{}'))
    on conflict (employee_id) do update set shift_id = excluded.shift_id, start_hour = excluded.start_hour, end_hour = excluded.end_hour, oncall = excluded.oncall;
    sal := private.round50(coalesce((cfgv -> 'salary' ->> r.role)::numeric, (cfgv ->> 'salary_custom')::numeric) * (1 + (cfgv ->> 'salary_per_level')::numeric * (r.level - 1)) * r.pay);
    if coalesce((select monthly from public.salaries where employee_id = emp_id order by created_at desc, id desc limit 1), -1) <> sal then
      insert into public.salaries (employee_id, user_id, monthly, reason) values (emp_id, p_uid, sal::int, case when r.fresh then 'hire' else 'level' end);
    end if;
  end loop;

  -- incidents the client resolved (bounded)
  insert into public.incidents (datacenter_id, user_id, device_key, type, opened_minutes, resolved_by, loss)
  select sv.datacenter_id, p_uid, left(i ->> 'device', 40), left(coalesce(i ->> 'type', 'fault'), 24), least(100000, greatest(0, coalesce((i ->> 'open')::int, 0))),
         case when i ->> 'by' = 'crew' then 'crew' else 'player' end, least(10000000, greatest(0, coalesce((i ->> 'loss')::int, 0)))
  from (select i from jsonb_array_elements(coalesce(p_claim -> 'incidents', '[]')) i limit 20) x;

  -- ---------- sanitized snapshot back into the save ----------
  select coalesce(jsonb_agg(case when n.skin is null then n.raw - 'skin' else n.raw || jsonb_build_object('skin', n.skin) end order by n.ord), '[]') into new_items from _it n;
  select coalesce(jsonb_agg(case when c.legend is null then c.raw - 'legend' else c.raw end || jsonb_build_object('level', c.level, 'pay', c.pay) order by c.ord), '[]') into new_crew from _cr c;
  month_new := least(greatest(co.month, coalesce((p_data -> 'econ' ->> 'month')::int, co.month)), co.month + floor(mins / (cfgv ->> 'month_minutes')::numeric)::int + 1);

  update public.terrain set width = lot_w, height = lot_h where datacenter_id = sv.datacenter_id;
  update public.companies set cash = co.cash, phase = case when co.phase = 'live' or exists (select 1 from _un where kind = 'server') then 'live' else 'setup' end,
    starter_kit = kit, first_contract = co.first_contract or first_contract_now, dc_rewarded = co.dc_rewarded, month = month_new, last_settled_at = now()
  where id = co.id returning * into co;
  update public.game_saves set data = p_data || jsonb_build_object('items', new_items, 'crew', new_crew), version = version + 1,
    name = left(coalesce(nullif(trim(p_data ->> 'name'), ''), name), 40), play_minutes = play_minutes + mins::bigint,
    stats = jsonb_build_object('rooms', jsonb_array_length(coalesce(p_data -> 'rooms', '[]')), 'racks', (select count(*) from _it where def = 'rack'),
                               'servers', (select count(*) from _un where kind = 'server'), 'online', online, 'crew', (select count(*) from _cr), 'cash', co.cash)
  where id = sv.id returning * into sv;
  update public.wallets set credits = credits + credits_award, gold = gold + gold_award where user_id = p_uid returning * into w;

  insert into public.finances as f (company_id, user_id, month, income, costs, purchases, hires)
  values (co.id, p_uid, co.month, revenue + refunds, opex, purchases, hires)
  on conflict (company_id, month) do update set income = f.income + excluded.income, costs = f.costs + excluded.costs,
    purchases = f.purchases + excluded.purchases, hires = f.hires + excluded.hires;

  -- the ledger: one summary row carries the request id, the rest detail it
  perform private.ledger(p_uid, co.id, 'cash', null, revenue + refunds - opex - purchases - hires, co.cash, 'adjust', 'Fechamento do save',
    jsonb_build_object('minutes', round(mins), 'revenue', revenue, 'claimed_revenue', round(claim_rev), 'opex', opex, 'purchases', purchases, 'refunds', refunds, 'hires', hires), p_request);
  if revenue > 0 then perform private.ledger(p_uid, co.id, 'cash', null, revenue, null, 'revenue', 'Receitas · ' || round(mins) || ' min'); end if;
  if opex > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -opex, null, 'opex', 'Despesas (salários, energia, aluguel…)'); end if;
  if purchases > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -purchases, null, 'equipment', 'Equipamentos instalados'); end if;
  if refunds > 0 then perform private.ledger(p_uid, co.id, 'cash', null, refunds, null, 'refund', 'Revenda de equipamentos'); end if;
  if hires > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -hires, null, 'hire', 'Contratações'); end if;
  if credits_award > 0 then perform private.ledger(p_uid, co.id, 'credits', null, credits_award, w.credits, 'reward', 'Créditos do jogo'); end if;
  if gold_award > 0 then perform private.ledger(p_uid, co.id, 'gold', null, gold_award, w.gold, 'reward', 'Datacenter concluído'); end if;
  if online > 0 then insert into public.user_achievements (user_id, achievement_id) values (p_uid, 'first_online') on conflict do nothing; end if;
  if dc_ok then insert into public.user_achievements (user_id, achievement_id) values (p_uid, 'first_datacenter') on conflict do nothing; end if;

  return jsonb_build_object('version', sv.version, 'cash', co.cash, 'phase', co.phase, 'kit', co.starter_kit, 'month', co.month,
    'gold', w.gold, 'credits', w.credits, 'credits_awarded', credits_award, 'gold_awarded', gold_award,
    'charged', jsonb_build_object('purchases', purchases, 'refunds', refunds, 'hires', hires, 'revenue', revenue, 'opex', opex, 'minutes', round(mins)),
    'changes', changes, 'terrain', jsonb_build_object('w', tr.width, 'h', tr.height));
end $$;

-- everything the client needs to continue a save (snapshot + the server's authoritative numbers)
create or replace function private.game_load(p_uid uuid, p_slot integer) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'save', jsonb_build_object('slot', s.slot, 'name', s.name, 'version', s.version, 'data', s.data, 'updated_at', s.updated_at, 'play_minutes', s.play_minutes),
    'preset', d.preset,
    'company', jsonb_build_object('cash', c.cash, 'phase', c.phase, 'kit', c.starter_kit, 'month', c.month, 'first_contract', c.first_contract, 'dc_rewarded', c.dc_rewarded),
    'terrain', jsonb_build_object('w', t.width, 'h', t.height, 'expansions', t.expansions),
    'legendary', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id, 'name', b.name, 'status', b.status)) from public.legendary_bots b where b.user_id = p_uid), '[]'))
  from public.game_saves s join public.companies c on c.id = s.company_id join public.datacenters d on d.id = s.datacenter_id
  join public.terrain t on t.datacenter_id = s.datacenter_id
  where s.user_id = p_uid and s.slot = p_slot;
$$;

create or replace function private.game_delete(p_uid uuid, p_slot integer) returns jsonb
language plpgsql as $$
begin
  perform private.lock_player(p_uid);
  update public.legendary_bots set status = 'stored', employee_id = null where user_id = p_uid and employee_id in (
    select e.id from public.employees e join public.game_saves s on s.datacenter_id = e.datacenter_id where s.user_id = p_uid and s.slot = p_slot);
  delete from public.companies where id in (select company_id from public.game_saves where user_id = p_uid and slot = p_slot);
  return jsonb_build_object('deleted', p_slot);
end $$;

-- nobody but the database owner (the Edge Functions' connection) runs these
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon, authenticated', f.sig); end if;
  end loop;
end $$;

-- ===================================================================
-- 20261005000700_signup_bootstrap.sql
-- ===================================================================
-- DataLab · 007 · account bootstrap: everything a new player needs is created by the server at signup
--   profile + wallet (welcome Gold) + inventory  (0600)
--   + player_progress (the account's progress)
--   + a company with its datacenter, terrain and save slot 1 (empty: the first "Novo jogo" fills it)

create table if not exists public.player_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  level integer not null default 1 check (level between 1 and 100),
  xp bigint not null default 0 check (xp >= 0),
  datacenters_completed integer not null default 0 check (datacenters_completed >= 0),
  total_play_minutes bigint not null default 0 check (total_play_minutes >= 0),
  tutorial_done boolean not null default false,
  last_slot smallint check (last_slot between 1 and 3),
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_progress enable row level security;
drop policy if exists player_progress_own on public.player_progress;
create policy player_progress_own on public.player_progress for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_progress from anon, authenticated;
    grant select on public.player_progress to authenticated;
  end if;
end $$;
drop trigger if exists player_progress_touch on public.player_progress;
create trigger player_progress_touch before update on public.player_progress for each row execute function private.touch_updated_at();

-- signup: profile, wallet, inventory, progress and the first company (all or nothing)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'jogador'), '[^a-zA-Z0-9_]', '', 'g'));
  uname text;
  n integer := 0;
  welcome bigint := coalesce((select (value ->> 'welcome_gold')::bigint from public.game_config where key = 'economy'), 100);
  company text := left(trim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'company_name', ''), '[[:cntrl:]<>]', '', 'g')), 40);
begin
  base := left(base, 16);
  if char_length(base) < 3 then base := 'jogador'; end if;
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = uname) loop
    n := n + 1;
    uname := left(base, 15) || n::text;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, uname, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname), 32));
  insert into public.wallets (user_id, gold) values (new.id, welcome);
  insert into public.inventories (user_id) values (new.id);
  insert into public.player_progress (user_id) values (new.id);
  insert into public.transactions (user_id, currency_id, amount, balance_after, kind, description) values (new.id, 'gold', welcome, welcome, 'welcome', 'Boas-vindas · moeda dourada');
  perform private.game_new(new.id, 1, coalesce(nullif(company, ''), 'Minha empresa'), 'zero');
  return new;
end $$;

-- progress follows the saves and the achievements
create or replace function private.progress_from_save() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.version > coalesce(old.version, 0) then
    update public.player_progress set last_slot = new.slot, last_played_at = now(),
      total_play_minutes = total_play_minutes + greatest(0, new.play_minutes - coalesce(old.play_minutes, 0))
    where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists game_saves_progress on public.game_saves;
create trigger game_saves_progress after update on public.game_saves for each row execute function private.progress_from_save();

create or replace function private.progress_from_achievement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.achievement_id = 'first_datacenter' then
    update public.player_progress set datacenters_completed = datacenters_completed + 1 where user_id = new.user_id;
  end if;
  update public.player_progress set xp = xp + 50, level = least(100, 1 + (xp + 50) / 500) where user_id = new.user_id;
  return new;
end $$;
drop trigger if exists user_achievements_progress on public.user_achievements;
create trigger user_achievements_progress after insert on public.user_achievements for each row execute function private.progress_from_achievement();

-- accounts created before this migration get the same starting state
insert into public.player_progress (user_id) select id from public.profiles on conflict do nothing;
do $$ declare p record; begin
  for p in select id from public.profiles pr where not exists (select 1 from public.game_saves s where s.user_id = pr.id) loop
    perform private.game_new(p.id, 1, 'Minha empresa', 'zero');
  end loop;
end $$;

-- the new functions are for the database only
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon, authenticated', f.sig); end if;
  end loop;
end $$;

-- ===================================================================
-- 20261005000800_payments.sql
-- ===================================================================
-- DataLab · 008 · real Gold purchases (AbacatePay)
-- Flow: the player asks for a pack → the Edge Function "payments" opens an order here and a checkout
-- at AbacatePay (externalId = order id) → the player pays on AbacatePay's page → the webhook (or the
-- game polling "status") asks AbacatePay for that checkout and, only when it says PAID for at least
-- the pack's price, private.payment_settle credits the Gold. Settling is idempotent: an order pays once.

-- packs on sale: price and coins live here (the server's truth), not in the browser
create table if not exists public.gold_packs (
  sku text primary key check (sku ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  coins integer not null check (coins > 0),
  price_cents integer not null check (price_cents > 0),
  tag text,
  sort smallint not null default 0,
  active boolean not null default true,
  -- AbacatePay product (prod_…); empty = found / created by externalId = sku on the first checkout
  provider_product_id text
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sku text not null references public.gold_packs (sku),
  coins integer not null check (coins > 0),
  price_cents integer not null check (price_cents > 0),
  provider text not null default 'abacatepay',
  checkout_id text unique,
  checkout_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded', 'failed')),
  paid_amount integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

drop trigger if exists payment_orders_touch on public.payment_orders;
create trigger payment_orders_touch before update on public.payment_orders for each row execute function private.touch_updated_at();

-- the ledger gets a kind for real-money purchases (and their refunds)
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('welcome', 'new_game', 'purchase', 'sell', 'exchange', 'consume', 'claim', 'grant',
  'revenue', 'opex', 'equipment', 'refund', 'hire', 'land', 'reward', 'achievement', 'adjust', 'payment'));

-- RLS: packs are public catalog; orders are read-only for their owner (writes only through private.*)
alter table public.gold_packs enable row level security;
alter table public.payment_orders enable row level security;
drop policy if exists gold_packs_read on public.gold_packs;
create policy gold_packs_read on public.gold_packs for select to anon, authenticated using (active);
drop policy if exists payment_orders_own on public.payment_orders;
create policy payment_orders_own on public.payment_orders for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.gold_packs, public.payment_orders from anon, authenticated;
    grant select on public.gold_packs to anon, authenticated;
    grant select on public.payment_orders to authenticated;
  end if;
end $$;

-- 100 Gold for R$ 4,00 (AbacatePay product "100 moedas")
insert into public.gold_packs (sku, name, coins, price_cents, sort) values ('gold_100', '100 Gold', 100, 400, 1)
on conflict (sku) do update set name = excluded.name, coins = excluded.coins, price_cents = excluded.price_cents;

-- ---------------------------------------------------------------------------
-- a new order (the checkout is attached right after, by the Edge Function)
-- ---------------------------------------------------------------------------
create or replace function private.payment_order_new(p_uid uuid, p_sku text) returns jsonb
language plpgsql as $$
declare pk public.gold_packs; o public.payment_orders;
begin
  perform private.lock_player(p_uid);
  select * into pk from public.gold_packs where sku = p_sku and active;
  if not found then perform private.fail('pack_not_found', 'Pacote indisponível.'); end if;
  if (select count(*) from public.payment_orders where user_id = p_uid and status = 'pending' and created_at > now() - interval '1 hour') >= 10 then
    perform private.fail('rate_limited', 'Muitos pedidos abertos: conclua ou espere um pouco.');
  end if;
  insert into public.payment_orders (user_id, sku, coins, price_cents) values (p_uid, pk.sku, pk.coins, pk.price_cents) returning * into o;
  return jsonb_build_object('order_id', o.id, 'sku', pk.sku, 'name', pk.name, 'coins', pk.coins, 'price_cents', pk.price_cents, 'product_id', pk.provider_product_id);
end $$;

create or replace function private.payment_order_attach(p_order uuid, p_checkout text, p_url text) returns void
language sql as $$
  update public.payment_orders set checkout_id = p_checkout, checkout_url = p_url where id = p_order and checkout_id is null;
$$;

create or replace function private.payment_order_fail(p_order uuid) returns void
language sql as $$
  update public.payment_orders set status = 'failed' where id = p_order and status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- settle an order with what AbacatePay says about its checkout
-- p_status: PENDING | PAID | EXPIRED | CANCELLED | REFUNDED · p_amount: cents paid (or charged)
-- ---------------------------------------------------------------------------
create or replace function private.payment_settle(p_order uuid, p_status text, p_amount integer) returns jsonb
language plpgsql as $$
declare o public.payment_orders; w public.wallets; back bigint;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then perform private.fail('order_not_found', 'Pedido inexistente.'); end if;
  w := private.lock_player(o.user_id);

  if p_status = 'PAID' and o.status = 'pending' then
    if coalesce(p_amount, 0) < o.price_cents then
      -- never credit less than the pack's price (a changed product / partial amount)
      update public.payment_orders set status = 'failed', paid_amount = p_amount where id = o.id returning * into o;
      raise warning 'payment % paid % < price %', o.id, p_amount, o.price_cents;
    else
      update public.wallets set gold = gold + o.coins where user_id = o.user_id returning * into w;
      perform private.ledger(o.user_id, null, 'gold', null, o.coins, w.gold, 'payment', 'Compra · ' || o.coins || ' Gold (AbacatePay)',
        jsonb_build_object('order', o.id, 'checkout', o.checkout_id, 'amount', p_amount));
      update public.payment_orders set status = 'paid', paid_amount = p_amount, paid_at = now() where id = o.id returning * into o;
    end if;
  elsif p_status = 'REFUNDED' and o.status = 'paid' then
    -- take back what is still there (Gold already spent stays spent; the ledger keeps the trail)
    back := least(w.gold, o.coins);
    update public.wallets set gold = gold - back where user_id = o.user_id returning * into w;
    perform private.ledger(o.user_id, null, 'gold', null, -back, w.gold, 'payment', 'Estorno · ' || o.coins || ' Gold (AbacatePay)',
      jsonb_build_object('order', o.id, 'checkout', o.checkout_id, 'missing', o.coins - back));
    update public.payment_orders set status = 'refunded' where id = o.id returning * into o;
  elsif p_status in ('EXPIRED', 'CANCELLED') and o.status = 'pending' then
    update public.payment_orders set status = lower(p_status) where id = o.id returning * into o;
  end if;

  return jsonb_build_object('order_id', o.id, 'status', o.status, 'coins', o.coins, 'state', private.inventory_state(o.user_id));
end $$;

-- ===================================================================
-- 20261025000100_no_running_costs.sql
-- ===================================================================
-- DataLab · 009 · no running costs
-- The company only loses money when the player buys something (equipment, land, a hire). The game no
-- longer charges salaries or infrastructure, so the save must not charge a payroll floor either:
-- opex_floor = 0 turns off the minimum operating cost in private.game_save (purchases and hires are
-- still priced by the server as before).
update public.game_config
   set value = jsonb_set(value, '{opex_floor}', '0'::jsonb), updated_at = now()
 where key = 'economy';

-- ===================================================================
-- 20261025000200_titles.sql
-- ===================================================================
-- DataLab · 010 · player titles
-- Titles are badges shown next to the player's name (menu, account, in-game nametag). Staff roles give
-- theirs automatically in the client (admin → Admin, developer → Dev, moderator → Moderador); the titles
-- below are granted by staff and carry no permission at all (unlike user_roles).
-- Never writable from the browser: only private.admin_set_title, through the "admin" Edge Function.

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (title in ('founder', 'beta', 'creator', 'supporter', 'vip')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, title)
);

-- read only your own (same rule as user_roles in 0500)
alter table public.user_titles enable row level security;
drop policy if exists user_titles_own on public.user_titles;
create policy user_titles_own on public.user_titles for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.user_titles from anon, authenticated;
    grant select on public.user_titles to authenticated;
  end if;
end $$;

-- admins and developers hand out titles
create or replace function private.admin_set_title(p_actor uuid, p_target uuid, p_title text, p_on boolean) returns jsonb
language plpgsql as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão para mudar títulos.'); end if;
  if p_title not in ('founder', 'beta', 'creator', 'supporter', 'vip') then perform private.fail('bad_title', 'Título inválido.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  if p_on then
    insert into public.user_titles (user_id, title, granted_by) values (p_target, p_title, p_actor) on conflict do nothing;
  else
    delete from public.user_titles where user_id = p_target and title = p_title;
  end if;
  return coalesce((select jsonb_agg(title) from public.user_titles where user_id = p_target), '[]');
end $$;

-- player search now also returns the titles
create or replace function private.admin_find_users(p_actor uuid, p_query text) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'created_at', p.created_at,
      'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]'),
      'titles', coalesce((select jsonb_agg(title) from public.user_titles t where t.user_id = p.id), '[]')) order by p.username)
    from (select * from public.profiles where p_query is null or char_length(p_query) < 2 or username ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%' or id::text = p_query limit 25) p), '[]');
end $$;

do $$ begin
  revoke all on function private.admin_set_title(uuid, uuid, text, boolean) from public;
  revoke all on function private.admin_find_users(uuid, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.admin_set_title(uuid, uuid, text, boolean) from anon, authenticated;
    revoke all on function private.admin_find_users(uuid, text) from anon, authenticated;
  end if;
end $$;

-- ===================================================================
-- 20261025000600_problems.sql
-- ===================================================================
-- DataLab · 014 · career problems
-- Catalog (read-only for everyone, filled by seed_scenarios.sql — generated from assets/js/problems-data.js):
--   career_ranks · command_help · scenario_lessons · problems · scenario_steps · scenario_step_help
-- Per save: problem_runs (what was solved, by whom, for how much XP) and the career XP / level the server
-- allows (game_saves.career_xp / career_level). Steps keep their checks as JSON (check_rule / answer):
-- the game reads them with a fixed list of probes, nothing in them is ever executed.

-- ---------------------------------------------------------------------------
-- catalog
-- ---------------------------------------------------------------------------
create table if not exists public.career_ranks (
  id text primary key check (id ~ '^[a-z0-9_]{2,16}$'),
  level smallint not null unique check (level between 1 and 20),
  name text not null,
  xp_to_next integer check (xp_to_next is null or xp_to_next > 0),      -- XP the rank asks for besides its mission
  distinct_to_next smallint not null default 0 check (distinct_to_next >= 0)
);

-- the cards of "Precisa de ajuda?" (os: null = Linux / switch, 'win' = Windows Server)
create table if not exists public.command_help (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  cmd text not null,
  example text not null,
  what text not null,
  when_to_use text not null,
  os text check (os in ('win')),
  sort smallint not null default 0
);

-- lessons the game opens for a fault or a new server (setup, link, cable, service, disk, port)
create table if not exists public.scenario_lessons (
  id text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  title text not null,
  goal text not null,
  vars jsonb not null default '{}'::jsonb
);

create table if not exists public.problems (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  n smallint not null,                                            -- the number in the list of the rank
  rank_id text not null references public.career_ranks (id),
  title text not null,
  summary text not null,
  handoff text,                                                   -- who continues after the player answers
  difficulty smallint not null check (difficulty between 1 and 3),
  xp integer not null check (xp between 1 and 1000),
  credits integer not null default 0 check (credits between 0 and 100),
  skill text not null check (skill in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao')),
  roles text[] not null default '{}',                             -- crew roles that can take it
  bot_minutes smallint not null default 10 check (bot_minutes between 1 and 240),
  weight numeric(4, 2) not null default 1 check (weight > 0),
  trigger_kind text not null default 'random' check (trigger_kind in ('random', 'auto')),
  complete text not null check (complete in ('lesson', 'fixed', 'online', 'steps')),
  lesson_id text references public.scenario_lessons (id),         -- fixed / online: the lesson of that fault / new server
  when_rule text check (when_rule ~ '^[a-zA-Z]{2,32}$'),
  target jsonb not null,                                          -- the equipment it happens on (selector)
  setup jsonb,                                                    -- what goes wrong when it starts
  vars jsonb not null default '{}'::jsonb,                        -- values read when it starts
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint problems_lesson check ((complete in ('fixed', 'online')) = (lesson_id is not null)),
  constraint problems_target check (jsonb_typeof(target) = 'object' and target ? 'kind')
);
create index if not exists problems_rank_idx on public.problems (rank_id);

-- steps of a lesson or of a problem: a command (check_rule says when it is done) or a question (answer)
create table if not exists public.scenario_steps (
  id bigint generated always as identity primary key,
  lesson_id text references public.scenario_lessons (id) on delete cascade,
  problem_id text references public.problems (id) on delete cascade,
  ord smallint not null check (ord between 0 and 30),
  step_type text not null default 'command' check (step_type in ('command', 'answer')),
  text text not null,
  expected_cmd text,                                              -- the hint ("experimente …")
  action text check (action in ('cabling', 'build')),
  check_rule jsonb,
  answer jsonb,
  constraint scenario_steps_owner check ((lesson_id is null) <> (problem_id is null)),
  constraint scenario_steps_kind check (case when step_type = 'answer' then answer is not null and jsonb_typeof(answer -> 'accept') = 'array' else check_rule is not null end),
  unique (lesson_id, ord),
  unique (problem_id, ord)
);

-- the help cards of each step (in order)
create table if not exists public.scenario_step_help (
  step_id bigint not null references public.scenario_steps (id) on delete cascade,
  help_key text not null references public.command_help (key),
  sort smallint not null default 0,
  primary key (step_id, help_key)
);

-- ---------------------------------------------------------------------------
-- per save
-- ---------------------------------------------------------------------------
create table if not exists public.problem_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  problem_id text not null references public.problems (id),
  resolved_by text not null check (resolved_by in ('player', 'crew')),
  xp integer not null default 0 check (xp >= 0),
  wrong_answers smallint not null default 0 check (wrong_answers >= 0),
  created_at timestamptz not null default now()
);
create index if not exists problem_runs_dc_idx on public.problem_runs (datacenter_id, problem_id);
create index if not exists problem_runs_user_idx on public.problem_runs (user_id, created_at desc);

alter table public.game_saves add column if not exists career_xp bigint not null default 0 check (career_xp >= 0);
alter table public.game_saves add column if not exists career_level smallint not null default 1 check (career_level between 1 and 20);
-- saves from before this migration keep the level they had (the XP gate only applies to promotions from now on)
update public.game_saves set career_level = least(20, greatest(1, coalesce((data -> 'career' ->> 'level')::int, 1)))
 where data is not null and jsonb_typeof(data -> 'career') = 'object' and career_level = 1;

-- ---------------------------------------------------------------------------
-- security: the catalog is public read-only, runs are the player's own (same rules as 005)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  has_roles boolean := exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon');
begin
  foreach t in array array['career_ranks', 'command_help', 'scenario_lessons', 'problems', 'scenario_steps', 'scenario_step_help', 'problem_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    if has_roles then execute format('revoke all on public.%I from anon, authenticated', t); end if;
  end loop;
  foreach t in array array['career_ranks', 'command_help', 'scenario_lessons', 'problems', 'scenario_steps', 'scenario_step_help'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    if has_roles then execute format('grant select on public.%I to anon, authenticated', t); end if;
  end loop;
  drop policy if exists problem_runs_own on public.problem_runs;
  create policy problem_runs_own on public.problem_runs for select to authenticated using (user_id = (select auth.uid()));
  if has_roles then grant select on public.problem_runs to authenticated; end if;
end $$;

-- ---------------------------------------------------------------------------
-- career on save: price the solved problems with the server's catalog, cap the XP, gate promotions
-- ---------------------------------------------------------------------------
-- p_career: the save's career snapshot · p_runs: [{ id, by: 'player' | 'crew', wrong }] solved since the last save
-- p_mins: game minutes this save covers, already bounded by real time in game_save
create or replace function private.career_settle(p_uid uuid, p_slot integer, p_career jsonb, p_runs jsonb, p_mins numeric) returns jsonb
language plpgsql as $$
declare
  sv public.game_saves; run jsonb; pb public.problems; rk public.career_ranks;
  prior integer; share numeric; xp integer; gained bigint := 0; counted integer := 0;
  -- solving takes real time: one problem per 20 game minutes (+1) at most
  max_runs integer := least(20, floor(greatest(coalesce(p_mins, 0), 0) / 20)::int + 1);
  claimed_xp bigint; new_xp bigint; claimed_level integer; new_level integer; distinct_n integer;
  clamped boolean := false; car jsonb;
begin
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot for update;
  if not found then return null; end if;

  -- what was solved, priced by the catalog: repeats in this save are worth half, then a quarter;
  -- the crew solving for the player (an order) gives 15%
  for run in select r from jsonb_array_elements(case when jsonb_typeof(p_runs) = 'array' then p_runs else '[]'::jsonb end) r limit 30 loop
    exit when counted >= max_runs;
    select * into pb from public.problems where id = run ->> 'id' and active;
    continue when not found;
    share := case when run ->> 'by' = 'player' then 1 else 0.15 end;
    select count(*) into prior from public.problem_runs where datacenter_id = sv.datacenter_id and problem_id = pb.id;
    xp := greatest(1, round(pb.xp * (case when prior = 0 then 1 when prior = 1 then 0.5 else 0.25 end) * share))::int;
    insert into public.problem_runs (user_id, datacenter_id, problem_id, resolved_by, xp, wrong_answers)
    values (p_uid, sv.datacenter_id, pb.id, case when share = 1 then 'player' else 'crew' end, xp,
            least(999, greatest(0, coalesce((run ->> 'wrong')::int, 0))));
    gained := gained + xp;
    counted := counted + 1;
  end loop;

  if p_career is null or jsonb_typeof(p_career) <> 'object' then
    update public.game_saves set career_xp = career_xp + gained where id = sv.id;
    return jsonb_build_object('xp', sv.career_xp + gained, 'level', sv.career_level, 'gained', gained, 'runs', counted, 'clamped', false);
  end if;

  -- XP: never more than the server has seen solved
  claimed_xp := greatest(0, coalesce((p_career ->> 'xp')::bigint, sv.career_xp));
  new_xp := least(claimed_xp, sv.career_xp + gained);
  -- level: a promotion past a rank that asks for XP needs that XP and that many different problems
  claimed_level := least(20, greatest(1, coalesce((p_career ->> 'level')::int, 1)));
  new_level := claimed_level;
  if claimed_level > sv.career_level then
    select count(distinct problem_id) into distinct_n from public.problem_runs where datacenter_id = sv.datacenter_id and resolved_by = 'player';
    for rk in select * from public.career_ranks where xp_to_next is not null and level >= sv.career_level and level < claimed_level order by level loop
      if new_xp < rk.xp_to_next or distinct_n < rk.distinct_to_next then new_level := rk.level; clamped := true; exit; end if;
    end loop;
  end if;

  car := p_career || jsonb_build_object('xp', new_xp, 'level', new_level,
           'lvlXp', least(greatest(0, coalesce((p_career ->> 'lvlXp')::bigint, 0)), new_xp));
  if clamped then car := car || jsonb_build_object('done', false); end if;
  update public.game_saves set career_xp = new_xp, career_level = new_level,
    data = case when data is null then data else jsonb_set(data, '{career}', car) end
  where id = sv.id;
  return jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', gained, 'runs', counted, 'clamped', clamped or new_xp < claimed_xp);
end $$;

-- the save the Edge Function "game" calls: economy (game_save) + career, in one transaction
create or replace function private.game_save_career(p_uid uuid, p_slot integer, p_data jsonb, p_claim jsonb, p_request uuid) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := private.game_save(p_uid, p_slot, p_data, p_claim, p_request);
  return r || jsonb_build_object('career', private.career_settle(p_uid, p_slot, p_data -> 'career', p_claim -> 'problems',
    coalesce((r -> 'charged' ->> 'minutes')::numeric, 0)));
end $$;

-- nobody but the database owner (the Edge Functions' connection) runs these
do $$ begin
  revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from public;
  revoke all on function private.game_save_career(uuid, integer, jsonb, jsonb, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from anon, authenticated;
    revoke all on function private.game_save_career(uuid, integer, jsonb, jsonb, uuid) from anon, authenticated;
  end if;
end $$;

-- ===================================================================
-- 20261025000700_problem_devices.sql
-- ===================================================================
-- DataLab · 015 · career problems on more than one device
-- A problem may involve other equipment besides its main one (devices: { "sw": "switch.of" } — the switch at
-- the other end of the server's cable); each step says on which one it happens (device_role, null = the main
-- one). bot_action 'fix': when a crew member takes the problem, they also fix the fault the setup created.

alter table public.problems add column if not exists devices jsonb not null default '{}'::jsonb;
alter table public.problems add column if not exists bot_action text;
alter table public.scenario_steps add column if not exists device_role text;

do $$ begin
  alter table public.problems add constraint problems_devices check (jsonb_typeof(devices) = 'object');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.problems add constraint problems_bot_action check (bot_action is null or bot_action in ('fix'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.scenario_steps add constraint scenario_steps_device check (device_role is null or device_role ~ '^[a-z]{2,8}$');
exception when duplicate_object then null; end $$;

-- ===================================================================
-- seed.sql
-- ===================================================================
-- DataLab · seed (generated by supabase/scripts/build-seed.mjs from the game catalog — do not edit by hand)
-- Safe to run again: every insert updates the existing row.
begin;

-- rarities
insert into public.rarities (id, name, rank, color) values ('common', 'Comum', 0, '#9aa3b0') on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;
insert into public.rarities (id, name, rank, color) values ('uncommon', 'Incomum', 1, '#7ee0a1') on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;
insert into public.rarities (id, name, rank, color) values ('rare', 'Raro', 2, '#6aa7e8') on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;
insert into public.rarities (id, name, rank, color) values ('epic', 'Épico', 3, '#c084fc') on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;
insert into public.rarities (id, name, rank, color) values ('legendary', 'Lendário', 4, '#f2c14e') on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;

-- currencies
insert into public.currencies (id, name, scope, premium) values ('cash', 'Dinheiro da empresa', 'company', false) on conflict (id) do update set name = excluded.name, scope = excluded.scope, premium = excluded.premium;
insert into public.currencies (id, name, scope, premium) values ('credits', 'Créditos', 'player', false) on conflict (id) do update set name = excluded.name, scope = excluded.scope, premium = excluded.premium;
insert into public.currencies (id, name, scope, premium) values ('gold', 'Gold (moeda dourada)', 'player', true) on conflict (id) do update set name = excluded.name, scope = excluded.scope, premium = excluded.premium;

-- shop categories
insert into public.shop_categories (id, name, sort) values ('infra', 'Infraestrutura', 1) on conflict (id) do update set name = excluded.name, sort = excluded.sort;
insert into public.shop_categories (id, name, sort) values ('char', 'Personagem', 2) on conflict (id) do update set name = excluded.name, sort = excluded.sort;
insert into public.shop_categories (id, name, sort) values ('legend', 'Bots lendários', 3) on conflict (id) do update set name = excluded.name, sort = excluded.sort;
insert into public.shop_categories (id, name, sort) values ('special', 'Itens especiais', 4) on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- events
insert into public.events (id, name, description, color, starts_at, ends_at) values ('beta', 'Pré-alpha fechado', 'Quem jogou as primeiras versões do DataLab.', '#a0c3ec', '2026-09-01 00:00:00-03', '2026-09-30 23:59:59-03') on conflict (id) do update set name = excluded.name, description = excluded.description, color = excluded.color, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
insert into public.events (id, name, description, color, starts_at, ends_at) values ('lancamento', 'Semana de Lançamento', 'O DataLab chegou: itens laranja por tempo limitado.', '#ff7a17', '2026-10-01 00:00:00-03', '2026-10-31 23:59:59-03') on conflict (id) do update set name = excluded.name, description = excluded.description, color = excluded.color, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

-- items (shop, events, Founder, Developer, Beta, Special, legendary bots)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_clean', 'infra', 'rack', '"clean"'::jsonb, 'Rack Clean', 'Gabinete branco fosco, cantos claros. Combina com salas minimalistas.', 'common', 'gold', 15, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_clean', 'rack', 'Clean') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_corp', 'infra', 'rack', '"corp"'::jsonb, 'Rack Corporativo', 'Grafite com faixa azul e plaqueta da empresa no topo.', 'common', 'gold', 15, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_corp', 'rack', 'Corporativo') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_industrial', 'infra', 'rack', '"industrial"'::jsonb, 'Rack Industrial', 'Aço escovado e faixas de sinalização amarelas e pretas.', 'uncommon', 'gold', 30, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_industrial', 'rack', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_gamer', 'infra', 'rack', '"gamer"'::jsonb, 'Rack Gamer RGB', 'Moldura preta com contorno RGB que percorre todo o espectro.', 'rare', 'gold', 60, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_gamer', 'rack', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_cyber', 'infra', 'rack', '"cyber"'::jsonb, 'Rack Cyberpunk', 'Roxo profundo com neon magenta e ciano nos trilhos.', 'epic', 'gold', 120, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_cyber', 'rack', 'Cyberpunk') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_gold', 'infra', 'rack', '"gold"'::jsonb, 'Rack Dourado', 'Moldura banhada a ouro com brilho que corre pela borda.', 'legendary', 'gold', 250, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_gold', 'rack', 'Lendário') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('rack_launch', 'infra', 'rack', '"launch"'::jsonb, 'Rack Lançamento', 'Preto com a faixa laranja do DataLab. Só durante a Semana de Lançamento.', 'epic', 'gold', 90, false, null, false, true, false, 'event', 'lancamento', null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('rack_launch', 'rack', 'Evento') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.event_items (event_id, item_id, kind) values ('lancamento', 'rack_launch', 'shop') on conflict (event_id, item_id) do update set kind = excluded.kind;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('srv_clean', 'infra', 'server', '"clean"'::jsonb, 'Servidor Clean', 'Frontal branco nos servidores.', 'common', 'gold', 15, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('srv_clean', 'server', 'Clean') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('srv_carbon', 'infra', 'server', '"carbon"'::jsonb, 'Servidor Carbono', 'Frontal em fibra de carbono.', 'uncommon', 'gold', 30, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('srv_carbon', 'server', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('srv_neon', 'infra', 'server', '"neon"'::jsonb, 'Servidor Neon', 'Frisos ciano iluminados em cada unidade.', 'rare', 'gold', 55, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('srv_neon', 'server', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('srv_cyber', 'infra', 'server', '"cyber"'::jsonb, 'Servidor Cyberpunk', 'Frontal roxo com detalhe magenta e ciano.', 'epic', 'gold', 110, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('srv_cyber', 'server', 'Cyberpunk') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('srv_gold', 'infra', 'server', '"gold"'::jsonb, 'Servidor Dourado', 'Frontal dourado polido.', 'legendary', 'gold', 230, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('srv_gold', 'server', 'Lendário') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sw_clean', 'infra', 'switch', '"clean"'::jsonb, 'Switch Clean', 'Carcaça clara nos switches.', 'common', 'gold', 15, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sw_clean', 'switch', 'Clean') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sw_industrial', 'infra', 'switch', '"industrial"'::jsonb, 'Switch Industrial', 'Carcaça amarela de alta visibilidade.', 'uncommon', 'gold', 30, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sw_industrial', 'switch', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sw_gamer', 'infra', 'switch', '"gamer"'::jsonb, 'Switch RGB', 'LEDs das portas em arco-íris (falhas continuam piscando em laranja).', 'rare', 'gold', 55, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sw_gamer', 'switch', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sw_cyber', 'infra', 'switch', '"cyber"'::jsonb, 'Switch Cyberpunk', 'Carcaça roxa com contorno neon.', 'epic', 'gold', 110, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sw_cyber', 'switch', 'Cyberpunk') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sto_clean', 'infra', 'storage', '"clean"'::jsonb, 'Storage Clean', 'Gabinete claro para storages e NAS.', 'common', 'gold', 15, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sto_clean', 'storage', 'Clean') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sto_industrial', 'infra', 'storage', '"industrial"'::jsonb, 'Storage Industrial', 'Faixas de sinalização no storage.', 'uncommon', 'gold', 30, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sto_industrial', 'storage', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sto_cyber', 'infra', 'storage', '"cyber"'::jsonb, 'Storage Cyberpunk', 'Neon magenta e ciano no storage.', 'epic', 'gold', 110, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sto_cyber', 'storage', 'Cyberpunk') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('sto_gold', 'infra', 'storage', '"gold"'::jsonb, 'Storage Dourado', 'Storage banhado a ouro.', 'legendary', 'gold', 230, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('sto_gold', 'storage', 'Lendário') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_fans', 'infra', 'rackacc', '"fans"'::jsonb, 'Ventoinhas no topo', 'Duas ventoinhas girando no teto de cada rack.', 'uncommon', 'gold', 25, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_fans', 'rackacc', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_beacon', 'infra', 'rackacc', '"beacon"'::jsonb, 'Giroflex de status', 'Luz de sinalização no topo do rack.', 'uncommon', 'gold', 25, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_beacon', 'rackacc', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_plate', 'infra', 'rackacc', '"plate"'::jsonb, 'Plaqueta iluminada', 'Plaqueta com brilho suave na frente do topo.', 'rare', 'gold', 45, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_plate', 'rackacc', 'Corporativo') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_stickers', 'infra', 'rackacc', '"stickers"'::jsonb, 'Adesivos', 'Adesivos coloridos colados na moldura.', 'common', 'gold', 10, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_stickers', 'rackacc', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('led_cyan', 'infra', 'led', '"#00e5ff"'::jsonb, 'Fita de LED Ciano', 'Fita de LED vertical na frente dos racks.', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('led_cyan', 'led', 'Clean') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('led_magenta', 'infra', 'led', '"#ff2bd6"'::jsonb, 'Fita de LED Magenta', 'Fita magenta pulsando devagar.', 'uncommon', 'gold', 22, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('led_magenta', 'led', 'Cyberpunk') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('led_amber', 'infra', 'led', '"#ffb020"'::jsonb, 'Fita de LED Âmbar', 'Luz quente de oficina.', 'uncommon', 'gold', 22, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('led_amber', 'led', 'Industrial') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('led_rgb', 'infra', 'led', '"rgb"'::jsonb, 'Fita RGB Arco-íris', 'Gradiente RGB que corre de cima para baixo.', 'rare', 'gold', 50, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('led_rgb', 'led', 'Gamer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('led_gold', 'infra', 'led', '"#f2c14e"'::jsonb, 'Fita de LED Dourada', 'Brilho dourado respirando.', 'epic', 'gold', 100, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('led_gold', 'led', 'Lendário') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_polo', 'char', 'shirt', '"polo"'::jsonb, 'Camisa Polo', 'Gola polo com botões. A cor é a que você escolher no personagem.', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_polo', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_striped', 'char', 'shirt', '"striped"'::jsonb, 'Camiseta Listrada', 'Listras horizontais claras.', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_striped', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_flannel', 'char', 'shirt', '"flannel"'::jsonb, 'Camisa Xadrez', 'Flanela xadrez de quem passa o dia no datacenter.', 'uncommon', 'gold', 25, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_flannel', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_jacket', 'char', 'shirt', '"jacket"'::jsonb, 'Jaqueta Aberta', 'Jaqueta por cima de uma camiseta branca.', 'rare', 'gold', 45, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_jacket', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_jersey', 'char', 'shirt', '"jersey"'::jsonb, 'Camisa de Time', 'Camisa de time com número 7 e faixas nos ombros.', 'rare', 'gold', 45, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_jersey', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('shirt_launch', 'char', 'shirt', '"launch"'::jsonb, 'Camiseta do Lançamento', 'Com a marca do DataLab no peito. Edição limitada.', 'rare', 'gold', 40, false, null, false, true, false, 'event', 'lancamento', null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('shirt_launch', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.event_items (event_id, item_id, kind) values ('lancamento', 'shirt_launch', 'shop') on conflict (event_id, item_id) do update set kind = excluded.kind;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pants_jeans', 'char', 'pants', '"jeans"'::jsonb, 'Calça Jeans', 'Costura clara e barra dobrada.', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('pants_jeans', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pants_cargo', 'char', 'pants', '"cargo"'::jsonb, 'Calça Cargo', 'Bolsos laterais para levar o alicate de crimpar.', 'uncommon', 'gold', 22, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('pants_cargo', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pants_baggy', 'char', 'pants', '"baggy"'::jsonb, 'Calça Baggy', 'Larga, cobrindo o tênis.', 'uncommon', 'gold', 22, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('pants_baggy', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pants_joggers', 'char', 'pants', '"joggers"'::jsonb, 'Calça Jogger', 'Punho na barra e faixa lateral branca.', 'rare', 'gold', 40, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('pants_joggers', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pants_shorts', 'char', 'pants', '"shorts"'::jsonb, 'Bermuda', 'Para o corredor quente.', 'common', 'gold', 10, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('pants_shorts', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hair_undercut', 'char', 'hair', '"undercut"'::jsonb, 'Undercut', 'Laterais raspadas e topo penteado.', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hair_undercut', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hair_spiky', 'char', 'hair', '"spiky"'::jsonb, 'Espetado', 'Pontas para cima.', 'uncommon', 'gold', 22, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hair_spiky', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hair_braids', 'char', 'hair', '"braids"'::jsonb, 'Tranças', 'Tranças com contas douradas nas pontas.', 'rare', 'gold', 40, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hair_braids', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hair_mohawk', 'char', 'hair', '"mohawk"'::jsonb, 'Moicano', 'Crista alta no meio da cabeça.', 'epic', 'gold', 90, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hair_mohawk', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hat_snapback', 'char', 'hat', '"snapback"'::jsonb, 'Boné Aba Reta', 'Aba reta com logo branco (cor do seu cargo).', 'common', 'gold', 12, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hat_snapback', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hat_backcap', 'char', 'hat', '"backcap"'::jsonb, 'Boné para Trás', 'Aba virada para trás.', 'uncommon', 'gold', 20, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hat_backcap', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hat_bucket', 'char', 'hat', '"bucket"'::jsonb, 'Chapéu Bucket', 'Chapéu de pescador.', 'rare', 'gold', 40, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hat_bucket', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hat_crown', 'char', 'hat', '"crown"'::jsonb, 'Coroa Dourada', 'Para quem manda no datacenter.', 'legendary', 'gold', 250, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hat_crown', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('hat_launch', 'char', 'hat', '"snapback"'::jsonb, 'Boné do Lançamento', 'Presente da Semana de Lançamento: resgate grátis na loja.', 'rare', 'gold', 0, false, null, false, false, true, 'event', 'lancamento', '#ff7a17') on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('hat_launch', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.event_items (event_id, item_id, kind) values ('lancamento', 'hat_launch', 'gift') on conflict (event_id, item_id) do update set kind = excluded.kind;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_shades', 'char', 'shades', 'true'::jsonb, 'Óculos Escuros', 'Lentes pretas.', 'common', 'gold', 10, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_shades', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_scarf', 'char', 'scarf', 'true'::jsonb, 'Cachecol', 'Para a sala fria.', 'common', 'gold', 10, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_scarf', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_backpack', 'char', 'backpack', 'true'::jsonb, 'Mochila', 'Mochila de notebook nas costas.', 'uncommon', 'gold', 20, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_backpack', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('acc_chain', 'char', 'chain', 'true'::jsonb, 'Corrente Dourada', 'Corrente com pingente brilhando.', 'epic', 'gold', 90, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('acc_chain', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pal_pastel', 'char', 'palette', '["#f9c0d0","#b8e0d2","#d6c1f0","#fde2a7"]'::jsonb, 'Paleta Pastel', 'Libera 4 cores pastel para roupas e calças.', 'uncommon', 'gold', 20, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pal_neon', 'char', 'palette', '["#39ff14","#ff2bd6","#00e5ff","#ffe600"]'::jsonb, 'Paleta Neon', 'Libera 4 cores neon para roupas e calças.', 'rare', 'gold', 40, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('pal_gold', 'char', 'palette', '["#f2c14e","#b8892f","#fff1b8"]'::jsonb, 'Paleta Dourada', 'Libera tons de ouro para roupas e calças.', 'epic', 'gold', 100, false, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('xp_boost', 'special', 'use', '"xp"'::jsonb, 'Treinamento Intensivo', 'Consumível: a equipe ganha XP em dobro por 2 h de jogo.', 'rare', 'gold', 20, true, null, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('badge_beta', 'special', null, null, 'Crachá Fundador', 'Colecionável de quem jogou o pré-alpha do DataLab.', 'epic', 'gold', 0, false, null, false, false, true, 'beta', 'beta', null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.event_items (event_id, item_id, kind) values ('beta', 'badge_beta', 'gift') on conflict (event_id, item_id) do update set kind = excluded.kind;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('founder_rack', 'infra', 'rack', '"founder"'::jsonb, 'Rack Fundador', 'Branco perolado com friso turquesa e dourado. Só para os fundadores do DataLab.', 'legendary', 'gold', 0, false, null, false, false, false, 'founder', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('founder_rack', 'rack', 'Founder') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('founder_hat', 'char', 'hat', '"snapback"'::jsonb, 'Boné Fundador', 'Turquesa, com o logo dos fundadores.', 'epic', 'gold', 0, false, null, false, false, false, 'founder', null, '#5eead4') on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('founder_hat', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('dev_rack', 'infra', 'rack', '"dev"'::jsonb, 'Rack do Desenvolvedor', 'Preto com código verde correndo pela moldura. Da equipe que faz o jogo.', 'legendary', 'gold', 0, false, null, false, false, false, 'developer', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('dev_rack', 'rack', 'Developer') on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('dev_shirt', 'char', 'shirt', '"dev"'::jsonb, 'Camiseta Dev', 'Com o </> no peito. Equipe de desenvolvimento.', 'epic', 'gold', 0, false, null, false, false, false, 'developer', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.skins (item_id, target, theme) values ('dev_shirt', 'character', null) on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('dev_badge', 'special', null, null, 'Crachá Developer', 'Colecionável da equipe de desenvolvimento do DataLab.', 'legendary', 'gold', 0, false, null, false, false, false, 'developer', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('special_trophy', 'special', null, null, 'Troféu Especial', 'Entregue pela equipe em ocasiões especiais (campeonatos, ajuda à comunidade).', 'epic', 'gold', 0, false, null, false, false, false, 'special', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('legend_aurea', 'legend', 'bot', null, 'ÁUREA', 'Bot lendário generalista: sistemas, redes, servidores, segurança e documentação.', 'legendary', 'gold', 750, true, 3, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.legendary_bot_templates (item_id, name, role, level, profile) values ('legend_aurea', 'Áurea', 'sysadmin', 8, '{"name":"Áurea","role":"sysadmin","skin":"#e0ac7e","hair":"#fff1b8","hairStyle":"undercut","shirt":"#2a2112","pants":"#1b1f27","body":"n","outfit":"legend","visor":true,"shoes":"#f2c14e","pantsStyle":"joggers"}'::jsonb) on conflict (item_id) do update set name = excluded.name, role = excluded.role, profile = excluded.profile;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('legend_tita', 'legend', 'bot', null, 'TITÃ', 'Bot lendário de infraestrutura: instala, conserta e mantém tudo de pé.', 'legendary', 'gold', 750, true, 3, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.legendary_bot_templates (item_id, name, role, level, profile) values ('legend_tita', 'Titã', 'servidores', 8, '{"name":"Titã","role":"servidores","skin":"#8d5a3b","hair":"#0f0b0a","hairStyle":"mohawk","shirt":"#1d1a12","pants":"#232a36","body":"n","outfit":"legend","visor":true,"shoes":"#f2c14e","pantsStyle":"joggers"}'::jsonb) on conflict (item_id) do update set name = excluded.name, role = excluded.role, profile = excluded.profile;
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values ('legend_nexus', 'legend', 'bot', null, 'NEXUS', 'Bot lendário de redes: cabos, switches e conectividade, sem perder o resto.', 'legendary', 'gold', 750, true, 3, true, true, false, 'shop', null, null) on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color;
insert into public.legendary_bot_templates (item_id, name, role, level, profile) values ('legend_nexus', 'Nexus', 'redes', 8, '{"name":"Nexus","role":"redes","skin":"#f2c8a0","hair":"#c9c9c9","hairStyle":"spiky","shirt":"#12161d","pants":"#1f2d44","body":"n","outfit":"legend","visor":true,"shoes":"#f2c14e","pantsStyle":"joggers"}'::jsonb) on conflict (item_id) do update set name = excluded.name, role = excluded.role, profile = excluded.profile;

-- server types (hardware models)
insert into public.server_types (id, kind, name, price, perf, specs) values ('srv_basic', 'server', 'Servidor básico', 2500, 0.55, '{"name":"Servidor básico","tier":"Básico","u":"1U","cpu":"Xeon E-2314","sockets":1,"cores":4,"threads":4,"ghz":2.8,"ram":16,"disk":"2× 1 TB HDD (RAID 1)","diskTB":1,"nic":1,"perf":0.55,"power":0.16,"price":2500,"fault":1.35,"accent":"#8a919c","desc":"Entrada: sites pequenos, arquivos e serviços leves."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('server', 'server', 'Servidor intermediário', 6000, 1, '{"name":"Servidor intermediário","tier":"Intermediário","u":"1U","cpu":"Xeon Silver 4310","sockets":1,"cores":12,"threads":24,"ghz":2.1,"ram":64,"disk":"2× 960 GB SSD","diskTB":0.96,"nic":1,"perf":1,"power":0.32,"price":6000,"fault":1,"accent":null,"desc":"O servidor padrão do datacenter: web, APIs e bancos médios."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('srv_adv', 'server', 'Servidor avançado', 15000, 2.1, '{"name":"Servidor avançado","tier":"Avançado","u":"2U","cpu":"2× Xeon Gold 6338","sockets":2,"cores":64,"threads":128,"ghz":2,"ram":256,"disk":"4× 3,84 TB NVMe","diskTB":15.4,"nic":10,"perf":2.1,"power":0.62,"price":15000,"fault":0.8,"accent":"#6aa7e8","desc":"Virtualização e bancos grandes. Pede porta de 10 Gb/s para render tudo."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('srv_hi', 'server', 'Servidor high-end', 36000, 4.4, '{"name":"Servidor high-end","tier":"High-end","u":"2U","cpu":"2× EPYC 9654","sockets":2,"cores":192,"threads":384,"ghz":2.4,"ram":1536,"disk":"8× 7,68 TB NVMe","diskTB":61,"nic":25,"perf":4.4,"power":1.15,"price":36000,"fault":0.6,"accent":"#ff7a17","desc":"Nuvem privada e análise em tempo real. Só rende com switch de 25 Gb/s."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('srv_gpu', 'server', 'Servidor GPU (IA)', 78000, 7.5, '{"name":"Servidor GPU (IA)","tier":"High-end GPU","u":"4U","cpu":"2× EPYC 9354 + 4× GPU","sockets":2,"cores":64,"threads":128,"ghz":3.25,"ram":1024,"disk":"4× 3,84 TB NVMe","diskTB":15.4,"nic":25,"perf":7.5,"power":2.9,"price":78000,"fault":0.75,"accent":"#7ee0a1","desc":"Treino e inferência de IA. Muito caro e quente: precisa de refrigeração."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_8', 'switch', 'Switch 8 portas', 180, null, '{"name":"Switch 8 portas","tier":"Não gerenciável","ports":8,"port":1,"uplink":1,"managed":false,"poe":0,"power":0.012,"price":180,"fault":0.6,"accent":"#8a919c","desc":"8 portas de 1 Gb/s, sem console. Sem err-disabled, sem configuração."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_16', 'switch', 'Switch 16 portas', 340, null, '{"name":"Switch 16 portas","tier":"Não gerenciável","ports":16,"port":1,"uplink":1,"managed":false,"poe":0,"power":0.02,"price":340,"fault":0.6,"accent":"#8a919c","desc":"16 portas de 1 Gb/s, sem console e com uplink de só 1 Gb/s."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('switch', 'switch', 'Switch gerenciável 24p', 1500, null, '{"name":"Switch gerenciável 24p","tier":"Gerenciável","ports":24,"port":1,"uplink":10,"managed":true,"poe":0,"power":0.045,"price":1500,"fault":1,"accent":null,"desc":"24 portas de 1 Gb/s com console (CLI) e uplink de 10 Gb/s."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_24poe', 'switch', 'Switch PoE 24p', 2700, null, '{"name":"Switch PoE 24p","tier":"Gerenciável · PoE","ports":24,"port":1,"uplink":10,"managed":true,"poe":370,"power":0.06,"price":2700,"fault":1,"accent":"#ffd23f","desc":"24 portas de 1 Gb/s que também alimentam access points e câmeras (370 W PoE)."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_48', 'switch', 'Switch gerenciável 48p', 3300, null, '{"name":"Switch gerenciável 48p","tier":"Gerenciável","ports":48,"port":1,"uplink":20,"managed":true,"poe":0,"power":0.07,"price":3300,"fault":1,"accent":"#c4b5fd","desc":"48 portas de 1 Gb/s e uplink de 2× 10 Gb/s."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_48poe', 'switch', 'Switch PoE+ 48p', 5600, null, '{"name":"Switch PoE+ 48p","tier":"Gerenciável · PoE+","ports":48,"port":1,"uplink":40,"managed":true,"poe":740,"power":0.11,"price":5600,"fault":1,"accent":"#ffd23f","desc":"48 portas PoE+ (740 W) e uplink de 40 Gb/s."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_10g', 'switch', 'Switch 10G 24p', 9800, null, '{"name":"Switch 10G 24p","tier":"Agregação 10G","ports":24,"port":10,"uplink":100,"managed":true,"poe":0,"power":0.16,"price":9800,"fault":0.8,"accent":"#6aa7e8","desc":"24 portas de 10 Gb/s e uplink de 100 Gb/s: para servidores avançados."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('sw_25g', 'switch', 'Switch 25G 48p', 21000, null, '{"name":"Switch 25G 48p","tier":"Datacenter 25G","ports":48,"port":25,"uplink":400,"managed":true,"poe":0,"power":0.35,"price":21000,"fault":0.7,"accent":"#ff7a17","desc":"48 portas de 25 Gb/s e 4× 100 Gb/s de uplink: high-end e GPU sem gargalo."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('patch', 'patch', 'Patch panel', 300, null, '{"name":"Patch panel","tier":"Passivo","ports":12,"power":0,"price":300,"fault":0,"accent":null,"desc":"Painel de passagem: organiza os cabos entre servidores e switch."}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('nas_2', 'storage', 'NAS 2 baias', 1100, null, '{"name":"NAS 2 baias","tier":"NAS doméstico","bays":2,"raw":16,"usable":8,"raid":"RAID 1","net":1,"iops":0.3,"power":0.03,"price":1100,"desc":"2× 8 TB espelhados. Backup da equipe, lento.","look":"nas2"}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('nas_4', 'storage', 'NAS 4 baias', 3200, null, '{"name":"NAS 4 baias","tier":"NAS escritório","bays":4,"raw":48,"usable":36,"raid":"RAID 5","net":2,"iops":0.5,"power":0.06,"price":3200,"desc":"4× 12 TB em RAID 5 e 2× 1 Gb/s.","look":"nas4"}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('nas_8', 'storage', 'NAS 8 baias 10G', 9500, null, '{"name":"NAS 8 baias 10G","tier":"NAS empresarial","bays":8,"raw":128,"usable":96,"raid":"RAID 6","net":10,"iops":0.8,"power":0.15,"price":9500,"desc":"8× 16 TB em RAID 6 com 10 Gb/s.","look":"nas8"}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('storage', 'storage', 'Storage SAN', 26000, null, '{"name":"Storage SAN","tier":"Storage em bloco","bays":24,"raw":192,"usable":96,"raid":"RAID 10","net":50,"iops":1,"power":2.3,"price":26000,"desc":"24 discos, iSCSI 2× 25 Gb/s. O storage clássico do datacenter.","look":"san"}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;
insert into public.server_types (id, kind, name, price, perf, specs) values ('st_flash', 'storage', 'Storage all-flash', 72000, null, '{"name":"Storage all-flash","tier":"All-flash NVMe","bays":24,"raw":368,"usable":276,"raid":"RAID 6","net":400,"iops":3,"power":1.6,"price":72000,"desc":"24× 15,36 TB NVMe, 4× 100 Gb/s. Muito rápido e mais frio que disco.","look":"flash"}'::jsonb) on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, perf = excluded.perf, specs = excluded.specs;

-- build catalog prices (company $)
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desk', 'desk', null, 'equip', 'Computador', 2200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desk1', 'desk', null, 'equip', 'Mesa · 1 monitor', 1500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desk3', 'desk', null, 'equip', 'Mesa · 3 monitores', 2900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desk4', 'desk', null, 'equip', 'Mesa · 4 monitores', 3600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskgamer', 'desk', null, 'equip', 'Setup gamer', 4200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskgamerpc', 'desk', null, 'equip', 'Setup com PC gamer', 5200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desktech', 'desk', null, 'equip', 'Estação técnica', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desknoc', 'desk', null, 'equip', 'Estação de NOC', 4800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desksupport', 'desk', null, 'equip', 'Estação de atendimento', 1800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskadmin', 'desk', null, 'equip', 'Estação de administrador', 3200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rack', 'rack', null, 'equip', 'Rack', 1800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('server', 'server', 'server', 'equip', 'Servidor intermediário', 6000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('switch', 'switch', 'switch', 'equip', 'Switch gerenciável 24p', 1500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('patch', 'patch', 'patch', 'equip', 'Patch panel', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('monitor', 'monitor', null, 'equip', 'Monitor', 350) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('storage', 'storage', null, 'equip', 'Storage SAN', 26000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('crac', 'crac', null, 'equip', 'Ar de precisão', 9000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table', 'table', null, 'furn', 'Mesa', 400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair', 'chair', null, 'furn', 'Cadeira', 250) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa', 'sofa', null, 'furn', 'Sofá', 1200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf', 'shelf', null, 'furn', 'Estante', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('whiteboard', 'whiteboard', null, 'furn', 'Quadro branco', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant', 'plant', null, 'deco', 'Planta', 80) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('vase', 'vase', null, 'deco', 'Vaso', 40) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('coffee', 'coffee', null, 'deco', 'Cafeteira', 150) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('water', 'water', null, 'deco', 'Bebedouro', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('lamp', 'lamp', null, 'deco', 'Luminária', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug', 'rug', null, 'deco', 'Tapete', 200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('bin', 'bin', null, 'deco', 'Lixeira', 30) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('door', 'door', null, 'wall', 'Porta', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('door2', 'door2', null, 'wall', 'Porta dupla', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('srv_basic', 'srv_basic', 'server', 'equip', 'Servidor básico', 2500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('srv_adv', 'srv_adv', 'server', 'equip', 'Servidor avançado', 15000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('srv_hi', 'srv_hi', 'server', 'equip', 'Servidor high-end', 36000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('srv_gpu', 'srv_gpu', 'server', 'equip', 'Servidor GPU (IA)', 78000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_8', 'sw_8', 'switch', 'equip', 'Switch 8 portas', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_16', 'sw_16', 'switch', 'equip', 'Switch 16 portas', 340) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_24poe', 'sw_24poe', 'switch', 'equip', 'Switch PoE 24p', 2700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_48', 'sw_48', 'switch', 'equip', 'Switch gerenciável 48p', 3300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_48poe', 'sw_48poe', 'switch', 'equip', 'Switch PoE+ 48p', 5600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_10g', 'sw_10g', 'switch', 'equip', 'Switch 10G 24p', 9800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sw_25g', 'sw_25g', 'switch', 'equip', 'Switch 25G 48p', 21000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('nas_2', 'storage', null, 'equip', 'NAS 2 baias', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('nas_4', 'storage', null, 'equip', 'NAS 4 baias', 3200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('nas_8', 'storage', null, 'equip', 'NAS 8 baias 10G', 9500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('st_flash', 'storage', null, 'equip', 'Storage all-flash', 72000) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ap', 'ap', null, 'equip', 'Access point Wi-Fi', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('camera', 'camera', null, 'equip', 'Câmera IP', 380) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_wood', 'table', null, 'furn', 'Mesa de madeira', 650) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_glass', 'table', null, 'furn', 'Mesa de vidro', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_small', 'table', null, 'furn', 'Mesa lateral', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_stand', 'table', null, 'furn', 'Mesa regulável', 1400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_meet', 'table', null, 'furn', 'Mesa de reunião', 2200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('bench', 'table', null, 'furn', 'Bancada técnica', 1200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('bench_lab', 'table', null, 'furn', 'Bancada de laboratório', 1900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('reception', 'table', null, 'furn', 'Balcão de recepção', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('reception2', 'table', null, 'furn', 'Balcão compacto', 1600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_mesh', 'chair', null, 'furn', 'Cadeira ergonômica', 650) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_exec', 'chair', null, 'furn', 'Cadeira executiva', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_visit', 'chair', null, 'furn', 'Cadeira de visitante', 280) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_stool', 'chair', null, 'furn', 'Banqueta', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_gamer', 'chair', null, 'furn', 'Cadeira gamer', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_gamer_red', 'chair', null, 'furn', 'Cadeira gamer vermelha', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_gamer_cyan', 'chair', null, 'furn', 'Cadeira gamer ciano', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_rgb', 'chair', null, 'furn', 'Cadeira gamer RGB', 1600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa3', 'sofa', null, 'furn', 'Sofá 3 lugares', 1800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('armchair', 'sofa', null, 'furn', 'Poltrona', 700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa_leather', 'sofa', null, 'furn', 'Sofá de couro', 2400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa_gamer', 'sofa', null, 'furn', 'Sofá gamer RGB', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('cabinet', 'cabinet', null, 'furn', 'Armário alto', 750) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('cabinet_wide', 'cabinet', null, 'furn', 'Armário duplo', 1300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('locker', 'cabinet', null, 'furn', 'Armário de aço', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('drawers', 'drawers', null, 'furn', 'Arquivo de aço', 520) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('drawers_low', 'drawers', null, 'furn', 'Gaveteiro volante', 320) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('drawers_wood', 'drawers', null, 'furn', 'Cômoda de madeira', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf_wide', 'shelf', null, 'furn', 'Estante larga', 800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf_boxes', 'shelf', null, 'furn', 'Estante de arquivos', 500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf_parts', 'shelf', null, 'furn', 'Estante de peças de TI', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf_glass', 'shelf', null, 'furn', 'Vitrine', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallshelf', 'wallshelf', null, 'furn', 'Prateleira de parede', 140) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallshelf_books', 'wallshelf', null, 'furn', 'Prateleira de livros', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallshelf_plants', 'wallshelf', null, 'furn', 'Prateleira com plantas', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('steelrack', 'steelrack', null, 'furn', 'Rack de aço', 700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('steelrack_cable', 'steelrack', null, 'furn', 'Rack de cabos', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvrack', 'tvrack', null, 'furn', 'Rack com TV', 1900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('audiorack', 'tvrack', null, 'furn', 'Rack de som', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_cactus', 'plant', null, 'deco', 'Cacto', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_palm', 'plant', null, 'deco', 'Palmeira', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_flower', 'plant', null, 'deco', 'Vaso de flores', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_monstera', 'plant', null, 'deco', 'Costela-de-adão', 140) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_snake', 'plant', null, 'deco', 'Espada-de-são-jorge', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_ficus', 'plant', null, 'deco', 'Ficus', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallplant', 'wallplant', null, 'deco', 'Vaso suspenso', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_osi', 'poster', null, 'deco', 'Pôster camadas OSI', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_penguin', 'poster', null, 'deco', 'Pôster pinguim', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_motivation', 'poster', null, 'deco', 'Pôster motivacional', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_game', 'poster', null, 'deco', 'Pôster gamer', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('painting', 'painting', null, 'deco', 'Quadro abstrato', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('painting_land', 'painting', null, 'deco', 'Quadro paisagem', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('painting_wide', 'painting', null, 'deco', 'Quadro panorâmico', 380) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('dclock', 'dclock', null, 'deco', 'Relógio digital', 140) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wclock', 'wclock', null, 'deco', 'Relógios de fuso', 320) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('lamparc', 'lamparc', null, 'deco', 'Luminária de arco', 320) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('desklamp', 'desklamp', null, 'deco', 'Luminária de mesa', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rgblamp', 'rgblamp', null, 'deco', 'Luminária RGB', 240) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('toolboard', 'toolboard', null, 'deco', 'Painel de ferramentas', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('toolbox', 'toolbox', null, 'deco', 'Caixa de ferramentas', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ladder', 'ladder', null, 'deco', 'Escada', 200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('spool', 'spool', null, 'deco', 'Bobina de cabo', 150) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('fireext', 'fireext', null, 'deco', 'Extintor', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('printer', 'printer', null, 'deco', 'Impressora multifuncional', 1200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('mug', 'mug', null, 'deco', 'Caneca', 15) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('papers', 'papers', null, 'deco', 'Pilha de documentos', 10) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('books', 'books', null, 'deco', 'Livros', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('globe', 'globe', null, 'deco', 'Globo', 80) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('trophy', 'trophy', null, 'deco', 'Troféu', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sign_exit', 'sign', null, 'deco', 'Placa de saída', 50) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sign_volt', 'sign', null, 'deco', 'Placa alta tensão', 50) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sign_server', 'sign', null, 'deco', 'Placa sala de servidores', 80) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sign_nofood', 'sign', null, 'deco', 'Placa proibido comer', 40) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('console', 'console', null, 'deco', 'Console de videogame', 2400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('figure', 'figure', null, 'deco', 'Action figure', 150) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('barrel', 'barrel', null, 'deco', 'Tambor industrial', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pallet', 'pallet', null, 'deco', 'Palete com caixas', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pipes', 'pipes', null, 'deco', 'Tubulação aparente', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('gear', 'gear', null, 'deco', 'Engrenagem', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('robot', 'robot', null, 'deco', 'Robô decorativo', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('oldserver', 'oldserver', null, 'deco', 'Servidor vintage', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallscreen', 'wallscreen', null, 'deco', 'TV de status', 1800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rgbstrip', 'rgbstrip', null, 'deco', 'Fita LED de parede', 200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('hexpanel', 'hexpanel', null, 'deco', 'Painéis hexagonais', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rgbsign', 'rgbsign', null, 'deco', 'Letreiro DATA', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rgbbar', 'rgbbar', null, 'deco', 'Barra RGB de canto', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskwork', 'desk', null, 'equip', 'Workstation', 4600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskoffice', 'desk', null, 'equip', 'Estação de escritório', 1700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('deskstream', 'desk', null, 'equip', 'Setup de streaming', 5600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvstand', 'tvstand', null, 'equip', 'TV 32" com pedestal', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvstand_big', 'tvstand', null, 'equip', 'TV 55" com pedestal', 1800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvwall', 'tvwall', null, 'equip', 'TV de parede 32"', 800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvwall_big', 'tvwall', null, 'equip', 'TV de parede 55"', 1500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tvwall_cinema', 'tvwall', null, 'equip', 'Telão 75"', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('mon_curved', 'monitor', null, 'equip', 'Monitor curvo', 700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('mon_vertical', 'monitor', null, 'equip', 'Monitor vertical', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('mon_crt', 'monitor', null, 'equip', 'Monitor CRT', 250) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('laptop', 'laptop', null, 'equip', 'Notebook', 1600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('laptop_silver', 'laptop', null, 'equip', 'Notebook alumínio', 2400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('laptop_gamer', 'laptop', null, 'equip', 'Notebook gamer', 3200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ups', 'ups', null, 'equip', 'Nobreak modular', 7800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pdu', 'pdu', null, 'equip', 'Quadro PDU', 2400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('netcab', 'netcab', null, 'equip', 'Rack de parede', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tapelib', 'tapelib', null, 'equip', 'Biblioteca de fitas', 9500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('fm200', 'fm200', null, 'equip', 'Cilindros FM-200', 3200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('kvm', 'kvm', null, 'equip', 'Carrinho KVM', 900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('serverlift', 'serverlift', null, 'equip', 'Elevador de servidor', 1300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ventile', 'ventile', null, 'equip', 'Placa perfurada', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_gamer', 'table', null, 'furn', 'Mesa gamer', 1300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_office', 'table', null, 'furn', 'Mesa de escritório', 700) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_big', 'table', null, 'furn', 'Mesa grande', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_L', 'table', null, 'furn', 'Mesa em L', 1600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_round', 'table', null, 'furn', 'Mesa redonda', 1500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('table_tech', 'table', null, 'furn', 'Mesa técnica', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('workbench', 'table', null, 'furn', 'Bancada de reparo', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_red', 'chair', null, 'furn', 'Cadeira vermelha', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_white', 'chair', null, 'furn', 'Cadeira branca', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_gamer_green', 'chair', null, 'furn', 'Cadeira gamer verde', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('chair_gamer_pink', 'chair', null, 'furn', 'Cadeira gamer rosa', 1100) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa_blue', 'sofa', null, 'furn', 'Sofá azul', 1200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa_green', 'sofa', null, 'furn', 'Sofá verde', 1200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sofa_big', 'sofa', null, 'furn', 'Sofá 4 lugares', 2400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('armchair_gray', 'sofa', null, 'furn', 'Poltrona cinza', 650) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('armchair_red', 'sofa', null, 'furn', 'Poltrona vermelha', 650) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pouf', 'pouf', null, 'furn', 'Puff redondo', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pouf_teal', 'pouf', null, 'furn', 'Puff turquesa', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('beanbag_pink', 'beanbag', null, 'furn', 'Pufe rosa', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('beanbag_gray', 'beanbag', null, 'furn', 'Pufe cinza', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('shelf_cubes', 'shelf', null, 'furn', 'Nicho organizador', 550) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wallcab', 'wallcab', null, 'furn', 'Armário de parede', 400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('fridge', 'fridge', null, 'furn', 'Geladeira', 2600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('vending', 'vending', null, 'furn', 'Máquina de lanches', 3200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('espresso', 'espresso', null, 'furn', 'Máquina de espresso', 2200) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('coffeebar', 'coffeebar', null, 'furn', 'Cantinho do café', 2900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sink', 'sink', null, 'furn', 'Pia da copa', 1400) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('microwave', 'microwave', null, 'furn', 'Micro-ondas', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('kettle', 'kettle', null, 'furn', 'Chaleira elétrica', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('snacks', 'snacks', null, 'furn', 'Pote de biscoitos', 40) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('water_blue', 'water', null, 'furn', 'Bebedouro galão', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('water_slim', 'water', null, 'furn', 'Purificador de água', 380) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('partsbin', 'partsbin', null, 'furn', 'Gaveteiro de peças', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_net', 'poster', null, 'deco', 'Pôster topologia', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_cloud', 'poster', null, 'deco', 'Pôster nuvem', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_invader', 'poster', null, 'deco', 'Pôster invasor', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_gamepad', 'poster', null, 'deco', 'Pôster controle', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_fine', 'poster', null, 'deco', 'Pôster "tudo bem"', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_brew', 'poster', null, 'deco', 'Pôster café → código', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_prompt', 'poster', null, 'deco', 'Pôster terminal', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster_404', 'poster', null, 'deco', 'Pôster 404', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('painting_circuit', 'painting', null, 'deco', 'Quadro placa-mãe', 280) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('painting_synth', 'painting', null, 'deco', 'Quadro synthwave', 280) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('kanban', 'kanban', null, 'deco', 'Quadro kanban', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('wboard', 'wboard', null, 'deco', 'Quadro branco de parede', 240) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('glassboard', 'glassboard', null, 'deco', 'Painel de vidro', 600) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_bamboo', 'plant', null, 'deco', 'Bambu da sorte', 110) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_fern', 'plant', null, 'deco', 'Samambaia', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_olive', 'plant', null, 'deco', 'Oliveira', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('plant_lavender', 'plant', null, 'deco', 'Lavanda', 80) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('succulent', 'succulent', null, 'deco', 'Suculenta', 30) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('neonclock', 'neonclock', null, 'deco', 'Relógio neon', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('flipclock', 'flipclock', null, 'deco', 'Relógio flip', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('tripod', 'tripod', null, 'deco', 'Luminária tripé', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('lavalamp', 'lavalamp', null, 'deco', 'Lâmpada de lava', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('sconce', 'sconce', null, 'deco', 'Arandela', 140) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ledpanel', 'ledpanel', null, 'deco', 'Painel de LED', 380) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_round', 'rug', null, 'deco', 'Tapete redondo', 260) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_stripe', 'rug', null, 'deco', 'Tapete listrado', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_circuit', 'rug', null, 'deco', 'Tapete circuito', 320) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_runner', 'rug', null, 'deco', 'Passadeira', 240) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('recycle', 'recycle', null, 'deco', 'Lixeira de recicláveis', 120) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('duck', 'duck', null, 'deco', 'Pato de borracha', 15) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('headset', 'headset', null, 'deco', 'Headset no suporte', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('mechkb', 'mechkb', null, 'deco', 'Teclado mecânico', 350) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('photo', 'photo', null, 'deco', 'Porta-retrato', 25) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rpi', 'rpi', null, 'deco', 'Raspberry Pi', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('speaker', 'speaker', null, 'deco', 'Caixa de som', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pizza', 'pizza', null, 'deco', 'Caixa de pizza', 20) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('cans', 'cans', null, 'deco', 'Latas de energético', 15) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_robot', 'rug_robot', null, 'theme', 'Tapete robô', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_claude', 'rug_claude', null, 'theme', 'Tapete Claude', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_gpt', 'rug_gpt', null, 'theme', 'Tapete ChatGPT', 300) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('rug_rgb', 'rug_rgb', null, 'theme', 'Tapete gamer', 450) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('poster', 'poster', null, 'theme', 'Quadro / pôster', 60) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('neon', 'neon', null, 'theme', 'Letreiro neon', 250) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('clock', 'clock', null, 'theme', 'Relógio', 70) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('arcade', 'arcade', null, 'theme', 'Fliperama', 2500) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('beanbag', 'beanbag', null, 'theme', 'Pufe', 180) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('ledtube', 'ledtube', null, 'theme', 'Tubo de LED', 160) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('pcgamer', 'pcgamer', null, 'theme', 'PC gamer', 3800) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('hologram', 'hologram', null, 'theme', 'Holograma', 1900) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('toolcart', 'toolcart', null, 'theme', 'Carrinho de ferramentas', 650) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('bonsai', 'bonsai', null, 'theme', 'Bonsai', 90) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values ('banner', 'banner', null, 'theme', 'Banner da empresa', 220) on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;

-- achievements
insert into public.achievements (id, name, description, reward) values ('first_online', 'Primeiro servidor no ar', 'Configure um servidor até ele ficar online.', '{}'::jsonb) on conflict (id) do update set name = excluded.name, description = excluded.description, reward = excluded.reward;
insert into public.achievements (id, name, description, reward) values ('first_datacenter', 'Datacenter concluído', 'Conclua o checklist de um datacenter.', '{"gold":20}'::jsonb) on conflict (id) do update set name = excluded.name, description = excluded.description, reward = excluded.reward;
insert into public.achievements (id, name, description, reward) values ('land_owner', 'Terreno próprio', 'Expanda o terreno pela primeira vez.', '{}'::jsonb) on conflict (id) do update set name = excluded.name, description = excluded.description, reward = excluded.reward;
insert into public.achievements (id, name, description, reward) values ('legend_owner', 'Lenda na equipe', 'Tenha um bot lendário.', '{}'::jsonb) on conflict (id) do update set name = excluded.name, description = excluded.description, reward = excluded.reward;

-- economy config
insert into public.game_config (key, value) values ('economy', '{"start_cash":15000,"presets":{"zero":{"name":"Do zero","lot":{"w":10,"h":9},"items":{"plant":1,"water":1},"crew":0,"cash":15000,"live":false},"office":{"name":"Escritório pequeno","lot":{"w":20,"h":11},"items":{"plant":3,"water":1,"table":1,"coffee":1,"vase":1,"sofa":1,"lamp":1,"bin":1,"desk1":2,"desk":2,"deskadmin":1,"desk3":1,"rack":1,"switch":1,"server":2,"shelf":1,"whiteboard":1},"crew":4,"cash":45000,"live":true},"noc":{"name":"NOC","lot":{"w":24,"h":14},"items":{"plant":4,"water":2,"desknoc":4,"desk3":2,"desk4":1,"deskadmin":1,"whiteboard":1,"table":1,"coffee":1,"lamp":1,"rack":4,"switch":1,"server":11,"storage":1,"crac":1},"crew":4,"cash":70000,"live":true},"dcs":{"name":"Datacenter pequeno","lot":{"w":24,"h":13},"items":{"desktech":1,"desk3":1,"sofa":1,"plant":1,"water":1,"rack":12,"patch":4,"switch":4,"server":24,"storage":2,"crac":2,"bin":1},"crew":4,"cash":110000,"live":true},"dcm":{"name":"Datacenter médio","lot":{"w":34,"h":24},"items":{"desknoc":3,"desk4":1,"desktech":1,"deskadmin":1,"desk":1,"deskgamerpc":1,"sofa":2,"whiteboard":1,"plant":4,"water":2,"rack":30,"patch":3,"switch":10,"server":73,"storage":4,"crac":3,"bin":1,"desksupport":1,"lamp":1,"beanbag":1,"table":1,"coffee":1},"crew":8,"cash":180000,"live":true}},"starter_kit":{"rack":1,"desk":1,"server":1,"switch":1,"patch":1,"hire":1,"config":1,"lot":1},"lot":{"base":18,"freeArea":90,"growth":1.05,"builtK":600},"salary":{"funcionario":4000,"atendente":3600,"seguranca":4400,"tecnico":5200,"redes":6000,"servidores":6000,"sysadmin":6800,"gerente":8800},"salary_custom":4800,"salary_per_level":0.06,"hire_fee":0.5,"month_minutes":1440,"opex_floor":0,"max_rev_per_server":2333,"max_rev_per_storage":261,"max_rev_per_ap":11,"max_sales_per_min":600,"first_contract":4051,"grace_minutes":180,"min_cash":-500000,"credits_per_min":4,"credits_per_online_min":0.06,"credits_per_server_online":68,"credits_per_incident":95,"credits_dc":270,"gold_dc":20,"dc_min_minutes":60,"dc_rewards_per_day":3,"gold_rate":10,"welcome_gold":100}'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();
insert into public.game_config (key, value) values ('server_specializations', '{"web":{"name":"Web / API","short":"WEB","color":"#a0c3ec"},"db":{"name":"Banco de dados","short":"DB","color":"#ffc285"},"game":{"name":"Jogos","short":"GAME","color":"#f472b6"},"ai":{"name":"IA","short":"IA","color":"#7ee0a1"},"storage":{"name":"Arquivos / Storage","short":"FILES","color":"#c4b5fd"},"virt":{"name":"Virtualização","short":"PVE","color":"#ff7a17"},"dns":{"name":"DNS","short":"DNS","color":"#5eead4"},"mail":{"name":"E-mail","short":"MAIL","color":"#f2c14e"},"corp":{"name":"Aplicações corporativas","short":"ERP","color":"#fca5a5"},"net":{"name":"Servidor de rede","short":"NET","color":"#9aa3b0"}}'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();

commit;

-- ===================================================================
-- seed_scenarios.sql
-- ===================================================================
-- DataLab · seed dos cenários (gerado por supabase/scripts/build-scenarios.mjs a partir de assets/js/problems-data.js e
-- assets/js/terminal.js — não edite à mão). Pode rodar de novo: atualiza as linhas e reescreve os passos.
begin;

-- career ranks (only the ones with problems of their own)
insert into public.career_ranks (id, level, name, xp_to_next, distinct_to_next) values ('est', 1, 'Estagiário(a)', 300, 6) on conflict (id) do update set level = excluded.level, name = excluded.name, xp_to_next = excluded.xp_to_next, distinct_to_next = excluded.distinct_to_next;

-- command help (Linux / switch; the Windows Server cards stay in winserver.js)
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-addr', 'ip addr', 'ip addr', 'Mostra as interfaces de rede e os endereços IP de cada uma.', 'Primeiro passo para entender a rede de um servidor: a interface está UP? Tem IP?', null, 0) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-link', 'ip link', 'ip link', 'Lista as interfaces e o estado do link (UP ou DOWN), sem os IPs.', 'Para checar rapidamente se uma interface está ativa.', null, 1) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-link-up', 'sudo ip link set <interface> up', 'sudo ip link set eth0 up', 'Liga (ativa) a interface de rede. Com "down" no lugar de "up", desliga.', 'Quando ip addr ou ip link mostram a interface como DOWN.', null, 2) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-addr-add', 'sudo ip addr add <ip>/<máscara> dev <interface>', 'sudo ip addr add 10.0.1.12/24 dev eth0', 'Atribui um endereço IP à interface. /24 significa máscara 255.255.255.0 (256 endereços na rede).', 'Ao configurar um servidor novo com IP fixo. Errou? sudo ip addr del <ip>/24 dev eth0.', null, 3) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-route', 'ip route', 'ip route', 'Mostra a tabela de rotas: por onde o servidor envia cada pacote.', 'Para conferir se existe uma rota padrão (default via ...).', null, 4) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ip-route-add', 'sudo ip route add default via <gateway>', 'sudo ip route add default via 10.0.1.1', 'Define a rota padrão: o gateway que recebe tudo o que não é da rede local.', 'Depois de dar IP, para o servidor falar com outras redes e com a internet.', null, 5) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ping', 'ping -c <quantidade> <destino>', 'ping -c 3 10.0.1.1', 'Envia pacotes ICMP e mostra se o destino responde e em quanto tempo.', 'Para testar a conectividade depois de configurar ou consertar a rede.', null, 6) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('sudo', 'sudo <comando>', 'sudo ip link set eth0 up', 'Executa o comando como administrador (root).', 'Sempre que o comando altera o sistema: rede, serviços, logs. Sem sudo aparece "Operation not permitted".', null, 7) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('systemctl-status', 'systemctl status <serviço>', 'systemctl status nginx', 'Mostra se um serviço está rodando (active) ou falhou (failed), com as últimas mensagens.', 'Quando um site ou aplicação para de responder.', null, 8) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('systemctl-restart', 'sudo systemctl restart <serviço>', 'sudo systemctl restart nginx', 'Para e inicia o serviço de novo.', 'Depois de confirmar que o serviço caiu ou travou.', null, 9) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('curl', 'curl <endereço>', 'curl localhost', 'Faz uma requisição HTTP e mostra a resposta.', 'Para testar se um serviço web está respondendo.', null, 10) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('df', 'df -h', 'df -h', 'Mostra o uso de espaço de cada disco, em unidades legíveis (G, M).', 'Quando há suspeita de disco cheio — aplicações começam a falhar sem espaço.', null, 11) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('du', 'du -sh <pasta>', 'du -sh /var/log', 'Mostra quanto espaço uma pasta ocupa no total.', 'Para descobrir o que está enchendo o disco.', null, 12) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('journalctl-vacuum', 'sudo journalctl --vacuum-size=<tamanho>', 'sudo journalctl --vacuum-size=200M', 'Apaga os logs antigos do systemd até sobrar o tamanho indicado.', 'Quando os logs estão lotando o disco.', null, 13) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('hostnamectl', 'sudo hostnamectl set-hostname <nome>', 'sudo hostnamectl set-hostname srv-01', 'Define o nome da máquina.', 'Na configuração inicial, para identificar o servidor na rede.', null, 14) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('hostname', 'hostname', 'hostname', 'Mostra o nome da máquina.', 'Para confirmar em qual servidor você está antes de mexer em algo.', null, 15) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('whoami', 'whoami', 'whoami', 'Mostra com qual usuário você está logado (com sudo, root).', 'Ao entrar num servidor, para saber que permissões você tem.', null, 16) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('uname', 'uname -a', 'uname -a', 'Mostra o sistema operacional, o nome da máquina e a versão do kernel.', 'Para documentar o servidor ou conferir a versão antes de uma atualização.', null, 17) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('uptime', 'uptime', 'uptime', 'Mostra há quanto tempo o servidor está ligado e a carga média (load average).', 'Para saber se o servidor reiniciou ou está sobrecarregado.', null, 18) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('enable', 'enable', 'enable', 'No switch, entra no modo privilegiado (o prompt muda de > para #).', 'Antes de qualquer comando de diagnóstico ou configuração no switch.', null, 19) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('show-int', 'show interfaces status', 'show interfaces status', 'Lista as portas do switch e o estado de cada uma (connected, notconnect, err-disabled). Abreviação: sh int status.', 'Para achar a porta com problema.', null, 20) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('conf-t', 'configure terminal', 'conf t', 'Entra no modo de configuração global do switch.', 'Antes de mudar qualquer configuração.', null, 21) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('interface', 'interface <porta>', 'interface gi0/3', 'Seleciona uma porta para configurar (prompt vira config-if).', 'Depois do conf t, para mexer em uma porta específica.', null, 22) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('shutdown', 'shutdown', 'shutdown', 'Desativa administrativamente a porta selecionada (o status vira disabled). Numa porta err-disabled, é o primeiro passo para "zerar" o estado de erro.', 'Em config-if da porta com problema (interface <porta>), quando ela está err-disabled e a causa já foi resolvida.', null, 23) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('no-shutdown', 'no shutdown', 'no shutdown', 'Reativa a porta. Depois do shutdown, tira a porta do err-disabled e ela volta a conectar (status connected).', 'Logo depois do shutdown, ainda em config-if da mesma porta.', null, 24) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('lscpu', 'lscpu', 'lscpu', 'Mostra o processador: modelo, quantos soquetes, núcleos (cores) e threads.', 'Para documentar o hardware ou saber se o servidor aguenta mais carga.', null, 25) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('free', 'free -h', 'free -h', 'Mostra a memória RAM: total, usada e livre, em unidades legíveis (GB).', 'Para documentar o servidor ou quando ele está lento.', null, 26) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('tail', 'tail -n <linhas> <arquivo>', 'tail -n 20 /var/log/auth.log', 'Mostra as últimas linhas de um arquivo (10, se você não disser quantas). Os logs ficam em /var/log.', 'Para ver o que aconteceu por último num log: logins, erros, reinícios.', null, 27) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('grep', 'grep "<texto>" <arquivo>', 'grep "Failed password" /var/log/auth.log', 'Mostra só as linhas que contêm o texto. -i ignora maiúsculas, -c conta as linhas. Também filtra a saída de outro comando: tail /var/log/auth.log | grep Failed.', 'Para achar o que interessa num log grande.', null, 28) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('ss', 'sudo ss -tlnp', 'sudo ss -tlnp', 'Lista as portas TCP em escuta: -t TCP, -l escutando, -n em números, -p o processo de cada porta (precisa de sudo). netstat -tlnp mostra o mesmo.', 'Para saber em que porta um serviço atende, ou se ele está mesmo escutando.', null, 29) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('show-run', 'show running-config', 'show running-config', 'Mostra a configuração em uso agora, na memória do switch (abreviação: sh run). Ela se perde se o switch reiniciar sem salvar.', 'Antes e depois de mudar qualquer coisa no switch.', null, 30) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('show-start', 'show startup-config', 'show startup-config', 'Mostra a configuração salva: a que o switch carrega quando liga (abreviação: sh start).', 'Para conferir se o que está em uso já foi salvo.', null, 31) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('copy-run-start', 'copy running-config startup-config', 'copy running-config startup-config', 'Salva a configuração em uso como a de inicialização (abreviação: copy run start; write memory faz o mesmo).', 'Sempre que terminar uma mudança no switch: sem isso, um reinício desfaz tudo.', null, 32) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('responder', 'responder <valor>', 'responder 10.0.1.25', 'Responde a pergunta do passo atual (um IP, uma porta, um número). O campo no painel ao lado faz o mesmo.', 'Quando o passo é uma pergunta: rode o comando que mostra a informação, leia a saída e responda.', null, 33) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('cabling', 'Cabeamento do rack', 'Tarefas → Cabeamento  (ou o botão abaixo)', 'Mostra os cabos do rack: azul = ligado e correto, amarelo = incompleto, vermelho = conexão errada, laranja = cabo solto.', 'Quando ip link mostra NO-CARRIER: não é configuração, é a camada física (cabo).', null, 34) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;
insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values ('end', 'end', 'end', 'Sai do modo de configuração e volta ao modo privilegiado (#).', 'Ao terminar de configurar, para voltar a usar comandos show.', null, 35) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;

-- lessons
insert into public.scenario_lessons (id, title, goal, vars) values ('setup', 'Configurar {{dev.name}}', 'Servidor novo, cabo conectado. Coloque-o na rede com o IP {{dev.ip}}/24 e teste a conexão com o gateway {{gw}}.', '{}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;
insert into public.scenario_lessons (id, title, goal, vars) values ('cable', 'Falha de conexão · {{dev.name}}', '{{dev.name}} sumiu da rede e o monitor marcou o host como indisponível. Descubra se é configuração ou camada física.', '{}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;
insert into public.scenario_lessons (id, title, goal, vars) values ('link', 'Falha de conexão · {{dev.name}}', '{{dev.name}} parou de responder na rede. Descubra o motivo, corrija e teste.', '{}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;
insert into public.scenario_lessons (id, title, goal, vars) values ('service', 'Serviço parado · {{dev.name}}', 'O site hospedado no {{dev.name}} não responde. Verifique o serviço web (nginx).', '{}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;
insert into public.scenario_lessons (id, title, goal, vars) values ('disk', 'Disco cheio · {{dev.name}}', 'O disco do {{dev.name}} está quase lotado. Encontre o culpado e libere espaço.', '{}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;
insert into public.scenario_lessons (id, title, goal, vars) values ('port', 'Porta em erro · {{dev.name}}', 'Uma porta do switch {{dev.name}} entrou em err-disabled e derrubou um servidor. Encontre e reative a porta.', '{"port":"sw.bad"}'::jsonb) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;

-- problems
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_primeiro_acesso', 1, 'est', 'Primeiro acesso ao {{dev.name}}', 'Antes de mexer em qualquer servidor, reconheça a máquina: quem você é nela, o nome, o sistema e há quanto tempo está ligada.', null, 1, 30, 5, 'sistemas', array['sysadmin', 'tecnico']::text[], 10, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_inventario_hardware', 2, 'est', 'Inventário de hardware do {{dev.name}}', 'O supervisor está atualizando a ficha técnica dos servidores e pediu o processador e a memória do {{dev.name}}.', null, 1, 30, 5, 'servidores', array['servidores', 'tecnico', 'sysadmin']::text[], 10, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{"cores":"hw.cores"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_qual_ip', 3, 'est', 'Qual é o IP do {{dev.name}}?', 'Um colega precisa liberar o {{dev.name}} no firewall e pediu o IP dele. Confira no próprio servidor.', null, 1, 30, 5, 'redes', array['redes', 'sysadmin', 'tecnico']::text[], 8, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_gateway_internet', 4, 'est', 'Teste do gateway e da internet · {{dev.name}}', 'Checklist do turno: o servidor tem rota padrão, alcança o gateway e sai para a internet?', null, 1, 30, 5, 'redes', array['redes', 'sysadmin', 'tecnico']::text[], 10, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_configurar_servidor', 5, 'est', 'Configurar o servidor novo · {{dev.name}}', 'O {{dev.name}} já tem cabo. Ligue a interface, dê o IP {{dev.ip}}/24, crie a rota e teste com ping.', null, 2, 50, 8, 'sistemas', array['sysadmin', 'servidores']::text[], 20, 1, 'auto', 'online', 'setup', null, '{"kind":"server","state":"link","own":true}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_porta_servidor', 6, 'est', 'Em que porta do {{dev.name}} está o {{srv.name}}?', 'Documentação do rack: anote em qual porta do switch {{dev.name}} o servidor {{srv.name}} está ligado.', null, 2, 50, 8, 'redes', array['redes', 'tecnico']::text[], 12, 1, 'random', 'lesson', null, null, '{"kind":"switch","managed":true,"healthy":true,"direct":true,"prefer":"SW-01"}'::jsonb, null, '{"srv":"sw.direct"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_site_responde', 7, 'est', 'O site do {{dev.name}} está respondendo?', 'Um cliente perguntou se o site caiu. Confira o serviço web e faça uma requisição de teste.', null, 1, 30, 5, 'sistemas', array['sysadmin', 'atendente']::text[], 10, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"web":true,"prefer":"SRV-01"}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_reiniciar_nginx', 8, 'est', 'Reiniciar o nginx do {{dev.name}}', 'O site parou. Com o procedimento em mãos: veja o status do nginx, reinicie e confirme com curl.', null, 2, 50, 8, 'sistemas', array['sysadmin']::text[], 15, 1, 'random', 'fixed', 'service', null, '{"kind":"server","state":"online","os":"linux","healthy":true,"web":true,"prefer":"SRV-01"}'::jsonb, '{"fault":"service"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_interface_desligada', 9, 'est', 'Interface desligada no {{dev.name}}', 'O {{dev.name}} sumiu da rede. Veja as interfaces, ligue a eth0 e teste com ping.', null, 2, 50, 8, 'redes', array['redes', 'sysadmin', 'tecnico']::text[], 15, 1, 'random', 'fixed', 'link', null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, '{"fault":"link"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_cabo_solto', 10, 'est', 'Cabo solto no {{rack.id}}', 'O {{dev.name}} perdeu a conexão. ip link mostra NO-CARRIER? Então é camada física: reconecte o cabo no rack.', null, 2, 50, 8, 'redes', array['redes', 'tecnico', 'servidores']::text[], 15, 1, 'random', 'fixed', 'cable', null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, '{"fault":"cable"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_instalar_cabear', 11, 'est', 'Instalar e cabear o servidor novo', 'A empresa precisa de um servidor no ar. Instale um servidor e um switch gerenciável e ligue o cabo da eth0 no switch.', null, 2, 50, 8, 'servidores', array[]::text[], 20, 1, 'auto', 'steps', null, 'firstServer', '{"kind":"server","state":["new","link"],"own":true,"lazy":true}'::jsonb, null, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_organizar_cabos', 12, 'est', 'Organizar os cabos do {{rack.id}}', 'Mexeram no {{rack.id}} e os cabos ficaram bagunçados: atrapalha o fluxo de ar e a manutenção.', null, 1, 30, 5, 'redes', array['redes', 'tecnico']::text[], 12, 1, 'random', 'steps', null, null, '{"kind":"rack","cabled":true}'::jsonb, '{"rack":"messy"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_uso_disco', 13, 'est', 'Uso de disco do {{dev.name}}', 'Relatório de capacidade: o gestor quer saber quanto do disco do {{dev.name}} já está ocupado.', null, 1, 30, 5, 'servidores', array['servidores', 'sysadmin']::text[], 8, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{"disk":"disk.pct"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_limpar_logs', 14, 'est', 'Limpar logs antigos do {{dev.name}}', 'O disco do {{dev.name}} passou de 90%. Ache o culpado (/var/log) e limpe os logs antigos do journal.', null, 2, 50, 8, 'servidores', array['sysadmin', 'servidores']::text[], 15, 1, 'random', 'fixed', 'disk', null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, '{"fault":"disk"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_achar_porta_erro', 15, 'est', 'Achar a porta em erro no {{dev.name}}', 'Um servidor caiu e o monitor aponta para o switch {{dev.name}}. Descubra qual porta entrou em err-disabled e passe para quem vai corrigir.', 'a correção da porta fica com a equipe — ou com você, pelo alerta em Tarefas', 2, 50, 8, 'redes', array['redes', 'tecnico']::text[], 12, 1, 'random', 'lesson', null, null, '{"kind":"switch","managed":true,"healthy":true,"prefer":"SW-01"}'::jsonb, '{"fault":"port","quiet":true}'::jsonb, '{"port":"sw.bad"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_padronizar_hostname', 16, 'est', 'Padronizar o nome do {{dev.name}}', 'O {{dev.name}} voltou de uma reinstalação com o nome padrão (localhost). O padrão da empresa é o nome do equipamento em minúsculas.', null, 1, 30, 5, 'sistemas', array['sysadmin', 'tecnico']::text[], 10, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-02"}'::jsonb, '{"hostname":"localhost"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_tentativas_login', 17, 'est', 'Quem tentou entrar no {{dev.name}}?', 'O monitor acusou muitas tentativas de login por SSH no {{dev.name}}. Descubra de qual IP vêm as senhas erradas para a segurança bloquear.', 'o IP vai para a segurança bloquear no firewall', 2, 50, 8, 'seguranca', array['seguranca', 'sysadmin']::text[], 12, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, '{"authlog":"bruteforce"}'::jsonb, '{"attacker":"auth.attacker"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_porta_servico', 18, 'est', 'Em que porta o {{svc.name}} do {{dev.name}} escuta?', 'A equipe de firewall vai liberar o {{svc.name}} do {{dev.name}} e precisa da porta exata. Pergunte ao próprio servidor.', null, 1, 30, 5, 'sistemas', array['sysadmin', 'seguranca', 'redes']::text[], 8, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, null, '{"svc":"svc.listen"}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_salvar_config', 19, 'est', 'Salvar a configuração do {{dev.name}}', 'Ontem mudaram a descrição de uma porta do {{dev.name}} e não salvaram: se o switch reiniciar, a mudança se perde. Compare e salve.', null, 1, 30, 5, 'redes', array['redes', 'tecnico']::text[], 8, 1, 'random', 'lesson', null, null, '{"kind":"switch","managed":true,"healthy":true,"linked":true,"prefer":"SW-01"}'::jsonb, '{"swconfig":"unsaved"}'::jsonb, '{}'::jsonb, '{}'::jsonb, null, true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values ('est_servidor_sem_rede', 20, 'est', '{{dev.name}} sem rede: investigue dos dois lados', 'O {{dev.name}} parou de responder. Comece pelo servidor; se ele estiver certo, siga o cabo até o {{sw.name}}.', null, 3, 80, 12, 'redes', array['redes', 'tecnico']::text[], 20, 1, 'random', 'lesson', null, null, '{"kind":"server","state":"online","os":"linux","healthy":true,"prefer":"SRV-01"}'::jsonb, '{"fault":"port","on":"sw","quiet":true}'::jsonb, '{"port":"srv.port"}'::jsonb, '{"sw":"switch.of"}'::jsonb, 'fix', true, now()) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();
update public.problems set active = false, updated_at = now() where active and id <> all (array['est_primeiro_acesso', 'est_inventario_hardware', 'est_qual_ip', 'est_gateway_internet', 'est_configurar_servidor', 'est_porta_servidor', 'est_site_responde', 'est_reiniciar_nginx', 'est_interface_desligada', 'est_cabo_solto', 'est_instalar_cabear', 'est_organizar_cabos', 'est_uso_disco', 'est_limpar_logs', 'est_achar_porta_erro', 'est_padronizar_hostname', 'est_tentativas_login', 'est_porta_servico', 'est_salvar_config', 'est_servidor_sem_rede']::text[]);

-- steps (rewritten) + their help cards
delete from public.scenario_steps where lesson_id = any (array['setup', 'cable', 'link', 'service', 'disk', 'port']::text[]) or problem_id = any (array['est_primeiro_acesso', 'est_inventario_hardware', 'est_qual_ip', 'est_gateway_internet', 'est_configurar_servidor', 'est_porta_servidor', 'est_site_responde', 'est_reiniciar_nginx', 'est_interface_desligada', 'est_cabo_solto', 'est_instalar_cabear', 'est_organizar_cabos', 'est_uso_disco', 'est_limpar_logs', 'est_achar_porta_erro', 'est_padronizar_hostname', 'est_tentativas_login', 'est_porta_servico', 'est_salvar_config', 'est_servidor_sem_rede']::text[]);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('setup', null, 0, 'command', 'Veja as interfaces de rede do servidor.', null, null, '{"any":[{"ran":"ip-show"},{"ran":"link-show"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-addr']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('setup', null, 1, 'command', 'A eth0 está DOWN. Ligue a interface.', null, null, '{"state":"eth0.up"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-link-up', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('setup', null, 2, 'command', 'Atribua o IP {{dev.ip}}/24 à eth0.', 'sudo ip addr add {{dev.ip}}/24 dev eth0', null, '{"state":"eth0.ip"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-addr-add']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('setup', null, 3, 'command', 'Crie a rota padrão pelo gateway {{gw}}.', null, null, '{"state":"route","eq":"{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-route-add', 'ip-route']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('setup', null, 4, 'command', 'Teste a conexão com o gateway.', null, null, '{"ran":"ping-ok:{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('cable', null, 0, 'command', 'Veja o estado do link da eth0.', null, null, '{"any":[{"ran":"ip-show"},{"ran":"link-show"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-link', 'ip-addr']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('cable', null, 1, 'command', 'NO-CARRIER = sem sinal no cabo. Reconecte o cabo no rack.', null, 'cabling', '{"state":"cable"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['cabling']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('cable', null, 2, 'command', 'Teste a conexão com o gateway {{gw}}.', null, null, '{"ran":"ping-ok:{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('link', null, 0, 'command', 'Veja o estado das interfaces.', null, null, '{"any":[{"ran":"ip-show"},{"ran":"link-show"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-link', 'ip-addr']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('link', null, 1, 'command', 'A eth0 caiu (DOWN). Ligue a interface de novo.', null, null, '{"state":"eth0.up"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-link-up', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('link', null, 2, 'command', 'Teste a conexão com o gateway {{gw}}.', null, null, '{"ran":"ping-ok:{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('service', null, 0, 'command', 'Veja o estado do serviço nginx.', null, null, '{"ran":"status:nginx"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['systemctl-status']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('service', null, 1, 'command', 'O nginx está "failed". Reinicie o serviço.', null, null, '{"state":"service","arg":"nginx","eq":"active"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['systemctl-restart', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('service', null, 2, 'command', 'Confirme que o site responde.', null, null, '{"ran":"curl-ok"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['curl']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('disk', null, 0, 'command', 'Veja o uso dos discos.', null, null, '{"ran":"df"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['df']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('disk', null, 1, 'command', 'Descubra quanto ocupa a pasta de logs /var/log.', null, null, '{"ran":"du:/var/log"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['du']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('disk', null, 2, 'command', 'Limpe os logs antigos do journal (deixe 200M).', null, null, '{"state":"disk","lt":80}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['journalctl-vacuum', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('disk', null, 3, 'command', 'Confira o disco de novo.', null, null, '{"ran":"df-ok"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['df']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 0, 'command', 'Entre no modo privilegiado.', null, null, '{"any":[{"state":"sw.mode","ne":"user"},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['enable']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 1, 'command', 'Veja o status das portas.', null, null, '{"ran":"show-int"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 2, 'command', 'Entre no modo de configuração.', null, null, '{"any":[{"state":"sw.mode","in":["conf","if"]},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['conf-t']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 3, 'command', 'Selecione a porta com problema.', 'interface {{port}}', null, '{"any":[{"all":[{"state":"sw.mode","eq":"if"},{"state":"sw.cur","eq":"{{port}}"}]},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['interface']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 4, 'command', 'Desligue a porta.', null, null, '{"any":[{"state":"sw.healed","arg":"{{port}}"},{"state":"sw.port","arg":"{{port}}","eq":"disabled"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['shutdown']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 5, 'command', 'Ligue a porta novamente.', null, null, '{"state":"sw.healed","arg":"{{port}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['no-shutdown']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values ('port', null, 6, 'command', 'Volte (end) e confira o status das portas.', null, null, '{"ran":"show-int-ok:{{port}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['end', 'show-int']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_primeiro_acesso', 0, 'command', 'Veja com qual usuário você entrou.', null, null, '{"ran":"cmd:whoami"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['whoami']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_primeiro_acesso', 1, 'command', 'Veja o nome da máquina.', null, null, '{"any":[{"ran":"cmd:hostname"},{"ran":"cmd:hostnamectl"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['hostname']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_primeiro_acesso', 2, 'command', 'Veja o sistema e a versão do kernel.', 'uname -a', null, '{"ran":"cmd:uname"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['uname']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_primeiro_acesso', 3, 'command', 'Veja há quanto tempo o servidor está ligado.', null, null, '{"ran":"cmd:uptime"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['uptime']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_inventario_hardware', 0, 'command', 'Veja o processador do servidor.', null, null, '{"ran":"cmd:lscpu"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['lscpu']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_inventario_hardware', 1, 'command', 'Veja a memória.', 'free -h', null, '{"ran":"cmd:free"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['free']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_inventario_hardware', 2, 'answer', 'Quantos núcleos (cores) o {{dev.name}} tem?', null, null, null, '{"accept":["{{cores}}"],"normalize":"int"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['lscpu', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_qual_ip', 0, 'command', 'Veja as interfaces e os endereços do servidor.', null, null, '{"ran":"ip-show"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-addr']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_qual_ip', 1, 'answer', 'Qual é o IP da eth0 do {{dev.name}}?', null, null, null, '{"accept":["{{dev.ip}}"],"normalize":"ip"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-addr', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_gateway_internet', 0, 'command', 'Veja a tabela de rotas: existe uma rota padrão (default via …)?', null, null, '{"ran":"route-show"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-route']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_gateway_internet', 1, 'command', 'Teste o gateway {{gw}}.', 'ping -c 3 {{gw}}', null, '{"ran":"ping-ok:{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_gateway_internet', 2, 'command', 'Teste a saída para a internet (8.8.8.8).', 'ping -c 3 8.8.8.8', null, '{"ran":"ping-ok:8.8.8.8"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_porta_servidor', 0, 'command', 'Entre no modo privilegiado.', null, null, '{"any":[{"ran":"enable"},{"state":"sw.mode","ne":"user"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['enable']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_porta_servidor', 1, 'command', 'Veja o status das portas: a coluna Name mostra quem está ligado em cada uma.', null, null, '{"ran":"show-int"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_porta_servidor', 2, 'answer', 'Em qual porta está o {{srv.name}}?', null, null, null, '{"accept":["{{srv.port}}"],"normalize":"port"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_site_responde', 0, 'command', 'Veja o estado do serviço nginx.', 'systemctl status nginx', null, '{"ran":"status:nginx"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['systemctl-status']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_site_responde', 1, 'command', 'Faça uma requisição ao site.', null, null, '{"ran":"curl-ok"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['curl']::text[]) with ordinality as h(key, n);
insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_instalar_cabear', 0, 'command', 'Instale um servidor num rack (Construir → Equipamentos → Servidor).', null, 'build', '{"bound":true}'::jsonb, null, null);
insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_instalar_cabear', 1, 'command', 'Instale um switch gerenciável na mesma sala do servidor.', null, 'build', '{"state":"switch.near"}'::jsonb, null, null);
insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_instalar_cabear', 2, 'command', 'Ligue o cabo da eth0 numa porta gi0/… do switch.', null, 'cabling', '{"state":"state","in":["link","online"]}'::jsonb, null, null);
insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_organizar_cabos', 0, 'command', 'Abra o cabeamento do {{rack.id}} e use Organizar cabos.', null, 'cabling', '{"state":"rack.tidy"}'::jsonb, null, null);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_uso_disco', 0, 'command', 'Veja o uso dos discos.', null, null, '{"ran":"df"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['df']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_uso_disco', 1, 'command', 'Veja quanto ocupa a pasta de logs /var/log.', 'du -sh /var/log', null, '{"ran":"du:/var/log"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['du']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_uso_disco', 2, 'answer', 'Quantos % do disco / do {{dev.name}} estão em uso?', null, null, null, '{"accept":["{{disk}}"],"normalize":"int","tol":1}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['df', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_achar_porta_erro', 0, 'command', 'Entre no modo privilegiado.', null, null, '{"any":[{"ran":"enable"},{"state":"sw.mode","ne":"user"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['enable']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_achar_porta_erro', 1, 'command', 'Veja o status das portas.', null, null, '{"ran":"show-int"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_achar_porta_erro', 2, 'answer', 'Qual porta do {{dev.name}} está em err-disabled?', null, null, null, '{"accept":["{{port}}"],"normalize":"port"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_padronizar_hostname', 0, 'command', 'Veja o nome atual da máquina.', null, null, '{"any":[{"ran":"cmd:hostname"},{"ran":"cmd:hostnamectl"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['hostname']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_padronizar_hostname', 1, 'command', 'Mude o nome para {{dev.host}}.', 'sudo hostnamectl set-hostname {{dev.host}}', null, '{"state":"hostname","eq":"{{dev.host}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['hostnamectl', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_padronizar_hostname', 2, 'command', 'Confira o nome novo.', null, null, '{"ran":"hostname-show:{{dev.host}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['hostname']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_tentativas_login', 0, 'command', 'Veja as últimas linhas do log de autenticação (/var/log/auth.log).', 'tail -n 20 /var/log/auth.log', null, '{"any":[{"ran":"tail:/var/log/auth.log"},{"ran":"cat:/var/log/auth.log"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['tail']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_tentativas_login', 1, 'command', 'Filtre só as senhas erradas (Failed password).', 'grep "Failed password" /var/log/auth.log', null, '{"ran":"grep-failed:/var/log/auth.log"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['grep']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_tentativas_login', 2, 'answer', 'De qual IP vem a maioria das tentativas?', null, null, null, '{"accept":["{{attacker}}"],"normalize":"ip"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['grep', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_porta_servico', 0, 'command', 'Liste as portas TCP em escuta com o processo de cada uma (o -p precisa de sudo).', 'sudo ss -tlnp', null, '{"ran":"ss-procs"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ss', 'sudo']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_porta_servico', 1, 'answer', 'Em que porta o {{svc.name}} escuta?', null, null, null, '{"accept":["{{svc.port}}"],"normalize":"int"}'::jsonb, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ss', 'responder']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_salvar_config', 0, 'command', 'Entre no modo privilegiado.', null, null, '{"any":[{"ran":"enable"},{"state":"sw.mode","ne":"user"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['enable']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_salvar_config', 1, 'command', 'Veja a configuração em uso (running-config).', 'show running-config', null, '{"ran":"show-run"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-run']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_salvar_config', 2, 'command', 'Compare com a configuração salva (startup-config): falta uma descrição de porta.', 'show startup-config', null, '{"ran":"show-start"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-start']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_salvar_config', 3, 'command', 'Salve a configuração em uso como a de inicialização.', 'copy running-config startup-config', null, '{"state":"sw.saved"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['copy-run-start']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 0, 'command', 'No {{dev.name}}, teste o gateway {{gw}}.', 'ping -c 3 {{gw}}', null, '{"ran":"ping-fail"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 1, 'command', 'Confira a interface: se a eth0 está UP e com IP, o problema não é no servidor.', null, null, '{"any":[{"ran":"ip-show"},{"ran":"link-show"}]}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ip-link', 'ip-addr']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 2, 'command', 'Vá ao {{sw.name}}, o switch do outro lado do cabo, e entre no modo privilegiado.', null, null, '{"any":[{"ran":"enable"},{"state":"sw.mode","ne":"user"},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, 'sw') returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['enable']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 3, 'command', 'Veja o status das portas: qual está em err-disabled?', null, null, '{"any":[{"ran":"show-int"},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, 'sw') returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['show-int']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 4, 'command', 'Entre no modo de configuração.', null, null, '{"any":[{"state":"sw.mode","in":["conf","if"]},{"ran":"conf"},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, 'sw') returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['conf-t']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 5, 'command', 'Selecione a porta em erro.', 'interface {{port}}', null, '{"any":[{"all":[{"state":"sw.mode","eq":"if"},{"state":"sw.cur","eq":"{{port}}"}]},{"state":"sw.healed","arg":"{{port}}"}]}'::jsonb, null, 'sw') returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['interface']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 6, 'command', 'Reinicie a porta: shutdown e depois no shutdown.', null, null, '{"state":"sw.healed","arg":"{{port}}"}'::jsonb, null, 'sw') returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['shutdown', 'no-shutdown']::text[]) with ordinality as h(key, n);
with s as (insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role) values (null, 'est_servidor_sem_rede', 7, 'command', 'Volte ao {{dev.name}} e teste o gateway de novo.', 'ping -c 3 {{gw}}', null, '{"ran":"ping-ok:{{gw}}"}'::jsonb, null, null) returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(array['ping']::text[]) with ordinality as h(key, n);

commit;
