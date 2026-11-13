begin;

-- =====================================================================
-- Montagem de carga (06/11/2026)
-- Veículos, dados de palete e cargas montadas com itens de orçamentos
-- aprovados. Toda gravação passa por funções que conferem saldo a enviar,
-- capacidade do veículo e situação da carga.
-- =====================================================================

-- ---------- Veículos (cadastro do administrador) ----------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Placa sem hífen, padrão antigo (ABC1234) ou Mercosul (ABC1D23).
  plate text check (plate is null or plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  capacity_kg numeric(10,2) not null check (capacity_kg > 0 and capacity_kg <= 100000),
  -- Medidas internas do baú; opcionais, para a visualização da carga.
  body_length_cm integer check (body_length_cm is null or body_length_cm between 50 and 3000),
  body_width_cm integer check (body_width_cm is null or body_width_cm between 50 and 400),
  body_height_cm integer check (body_height_cm is null or body_height_cm between 50 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicles_plate_active_unique on public.vehicles(plate) where plate is not null and active;

create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
create policy vehicles_sales_select on public.vehicles for select to authenticated
  using ((select public.can_manage_sales()));
revoke all on table public.vehicles from anon, authenticated;
grant select on table public.vehicles to authenticated;

-- ---------- Dados de palete (linha única) ----------
-- bags_per_pallet: sacas por palete conforme o peso da saca, ex.: {"25": 56, "40": 35}.
create table public.pallet_settings (
  id boolean primary key default true check (id),
  pallet_weight_kg numeric(8,2) check (pallet_weight_kg is null or pallet_weight_kg between 0 and 200),
  bags_per_pallet jsonb not null default '{}' check (jsonb_typeof(bags_per_pallet) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);

insert into public.pallet_settings (id) values (true);

alter table public.pallet_settings enable row level security;
create policy pallet_settings_sales_select on public.pallet_settings for select to authenticated
  using ((select public.can_manage_sales()));
revoke all on table public.pallet_settings from anon, authenticated;
grant select on table public.pallet_settings to authenticated;

-- ---------- Cargas ----------
create table public.loads (
  id uuid primary key default gen_random_uuid(),
  load_number bigint generated always as identity unique,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  -- Cópia do veículo no momento em que a carga foi salva.
  vehicle_name_snapshot text not null,
  vehicle_plate_snapshot text,
  capacity_kg_snapshot numeric(10,2) not null,
  status text not null default 'planned' check (status in ('planned', 'loaded', 'shipped', 'cancelled')),
  planned_date date,
  notes text check (notes is null or length(notes) <= 500),
  -- Calculados pelo servidor ao salvar: sacas mais paletes vazios.
  total_weight_kg numeric(12,3) not null default 0,
  pallet_count integer not null default 0,
  loaded_at timestamptz,
  shipped_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loads_status_idx on public.loads(status, created_at desc);
create index loads_vehicle_idx on public.loads(vehicle_id);
create index loads_created_by_idx on public.loads(created_by);

create trigger loads_set_updated_at before update on public.loads
  for each row execute function public.set_updated_at();
create trigger loads_set_created_by before insert on public.loads
  for each row execute function public.set_created_by();

create table public.load_items (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  quote_item_id uuid not null references public.quote_items(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  weight_kg_snapshot numeric(12,3) not null check (weight_kg_snapshot > 0),
  packing text not null check (packing in ('pallet', 'loose')),
  -- Ordem de entrega: 1 é a primeira parada (carregada por último).
  stop_order integer not null check (stop_order between 1 and 99),
  unique (load_id, quote_item_id)
);

create index load_items_quote_item_idx on public.load_items(quote_item_id);
create index load_items_quote_idx on public.load_items(quote_id);

alter table public.loads enable row level security;
alter table public.load_items enable row level security;
create policy loads_sales_select on public.loads for select to authenticated
  using ((select public.can_manage_sales()));
create policy load_items_sales_select on public.load_items for select to authenticated
  using ((select public.can_manage_sales()));
revoke all on table public.loads from anon, authenticated;
revoke all on table public.load_items from anon, authenticated;
grant select on table public.loads to authenticated;
grant select on table public.load_items to authenticated;

-- ---------- Situação da carga: datas sempre do servidor ----------
create or replace function public.enforce_load_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    new.loaded_at := old.loaded_at;
    new.shipped_at := old.shipped_at;
    new.cancelled_at := old.cancelled_at;
    return new;
  end if;

  if old.status = 'planned' and new.status = 'loaded' then
    new.loaded_at := now();
  elsif old.status = 'loaded' and new.status = 'planned' then
    new.loaded_at := null;
  elsif old.status = 'loaded' and new.status = 'shipped' then
    new.shipped_at := now();
  elsif old.status in ('planned', 'loaded') and new.status = 'cancelled' then
    new.cancelled_at := now();
  else
    raise exception 'Mudança de situação da carga não permitida.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_load_status_flow() from public, anon, authenticated;

create trigger loads_enforce_status_flow before update on public.loads
  for each row execute function public.enforce_load_status_flow();

-- ---------- Orçamento em carga não pode ser cancelado ----------
create or replace function public.protect_quote_in_load()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and exists (
    select 1
    from public.load_items
    join public.loads on loads.id = load_items.load_id
    where load_items.quote_id = new.id and loads.status <> 'cancelled'
  ) then
    raise exception 'Este orçamento está em uma carga. Retire-o da carga ou cancele a carga antes de cancelar o orçamento.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_quote_in_load() from public, anon, authenticated;

create trigger quotes_protect_in_load before update of status on public.quotes
  for each row execute function public.protect_quote_in_load();

-- ---------- Veículos: criar, editar e desativar ----------
create or replace function public.save_vehicle(p_vehicle_id uuid, p_vehicle jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_vehicle_id;
  v_plate text := nullif(upper(regexp_replace(coalesce(p_vehicle->>'plate', ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem cadastrar veículos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_vehicle) <> 'object' then
    raise exception 'Dados do veículo inválidos.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_vehicle->>'name', ''))) = 0 then
    raise exception 'Informe o nome do veículo.' using errcode = '22023';
  end if;
  if v_plate is not null and v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' using errcode = '22023';
  end if;
  if coalesce((p_vehicle->>'capacity_kg')::numeric, 0) <= 0 then
    raise exception 'Informe a capacidade do veículo em kg.' using errcode = '22023';
  end if;
  if v_plate is not null and exists (
    select 1 from public.vehicles where vehicles.plate = v_plate and vehicles.active and vehicles.id is distinct from v_id
  ) then
    raise exception 'Já existe um veículo ativo com esta placa.' using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.vehicles (name, plate, capacity_kg, body_length_cm, body_width_cm, body_height_cm)
    values (
      btrim(p_vehicle->>'name'), v_plate, (p_vehicle->>'capacity_kg')::numeric,
      nullif(p_vehicle->>'body_length_cm', '')::integer,
      nullif(p_vehicle->>'body_width_cm', '')::integer,
      nullif(p_vehicle->>'body_height_cm', '')::integer
    )
    returning vehicles.id into v_id;
  else
    update public.vehicles set
      name = btrim(p_vehicle->>'name'),
      plate = v_plate,
      capacity_kg = (p_vehicle->>'capacity_kg')::numeric,
      body_length_cm = nullif(p_vehicle->>'body_length_cm', '')::integer,
      body_width_cm = nullif(p_vehicle->>'body_width_cm', '')::integer,
      body_height_cm = nullif(p_vehicle->>'body_height_cm', '')::integer
    where vehicles.id = v_id and vehicles.active;
    if not found then
      raise exception 'Veículo não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_vehicle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_vehicle(uuid, jsonb) to authenticated;

create or replace function public.deactivate_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem excluir veículos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.loads where loads.vehicle_id = p_vehicle_id and loads.status in ('planned', 'loaded')) then
    raise exception 'Este veículo está em uma carga planejada ou carregada. Troque o veículo da carga ou conclua-a antes de excluir.' using errcode = '22023';
  end if;
  update public.vehicles set active = false where vehicles.id = p_vehicle_id;
end;
$$;

revoke all on function public.deactivate_vehicle(uuid) from public, anon, authenticated;
grant execute on function public.deactivate_vehicle(uuid) to authenticated;

-- ---------- Dados de palete ----------
create or replace function public.save_pallet_settings(p_pallet_weight_kg numeric, p_bags_per_pallet jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar os dados de palete.' using errcode = '42501';
  end if;
  if p_pallet_weight_kg is not null and (p_pallet_weight_kg < 0 or p_pallet_weight_kg > 200) then
    raise exception 'O peso do palete vazio deve ficar entre 0 e 200 kg.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_bags_per_pallet) <> 'object' or exists (
    select 1 from jsonb_each(p_bags_per_pallet) entry
    where entry.key !~ '^[0-9]+(\.[0-9]+)?$'
      or jsonb_typeof(entry.value) <> 'number'
      or (entry.value)::text !~ '^[0-9]+$'
      or (entry.value)::text::integer not between 1 and 500
  ) then
    raise exception 'Informe sacas por palete como números inteiros entre 1 e 500.' using errcode = '22023';
  end if;
  update public.pallet_settings
  set pallet_weight_kg = p_pallet_weight_kg, bags_per_pallet = p_bags_per_pallet, updated_at = now(), updated_by = auth.uid()
  where pallet_settings.id;
end;
$$;

revoke all on function public.save_pallet_settings(numeric, jsonb) from public, anon, authenticated;
grant execute on function public.save_pallet_settings(numeric, jsonb) to authenticated;

-- ---------- Itens a enviar ----------
-- Itens de orçamentos aprovados com saldo, ou já presentes na carga p_load_id.
-- allocated: sacas em outras cargas não canceladas; in_this_load: nesta carga.
create or replace function public.load_candidates(p_load_id uuid default null)
returns table (
  quote_id uuid,
  quote_number bigint,
  customer_id uuid,
  customer_name text,
  approved_at timestamptz,
  quote_item_id uuid,
  display_order integer,
  product_name text,
  weight_kg numeric,
  quantity integer,
  allocated integer,
  in_this_load integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;
  return query
  with active_items as (
    select load_items.quote_item_id, load_items.load_id, load_items.quantity
    from public.load_items
    join public.loads on loads.id = load_items.load_id
    where loads.status <> 'cancelled'
  ), usage as (
    select
      active_items.quote_item_id,
      coalesce(sum(active_items.quantity) filter (where active_items.load_id is distinct from p_load_id), 0)::integer as other,
      coalesce(sum(active_items.quantity) filter (where active_items.load_id = p_load_id), 0)::integer as mine
    from active_items
    group by active_items.quote_item_id
  )
  select
    quotes.id,
    quotes.quote_number,
    quotes.customer_id,
    quotes.customer_name_snapshot,
    quotes.approved_at,
    quote_items.id,
    quote_items.display_order,
    quote_items.product_name_snapshot,
    quote_items.weight_kg_snapshot,
    quote_items.quantity,
    coalesce(usage.other, 0),
    coalesce(usage.mine, 0)
  from public.quotes
  join public.quote_items on quote_items.quote_id = quotes.id
  left join usage on usage.quote_item_id = quote_items.id
  where quotes.status = 'approved'
    and (quote_items.quantity > coalesce(usage.other, 0) or coalesce(usage.mine, 0) > 0)
  order by quotes.approved_at nulls last, quotes.quote_number, quote_items.display_order;
end;
$$;

revoke all on function public.load_candidates(uuid) from public, anon, authenticated;
grant execute on function public.load_candidates(uuid) to authenticated;

-- ---------- Salvar carga (criar ou editar uma planejada) ----------
create or replace function public.save_load(p_load_id uuid, p_load jsonb, p_items jsonb)
returns table (id uuid, load_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load_id uuid := p_load_id;
  v_number bigint;
  v_status text;
  v_vehicle public.vehicles%rowtype;
  v_settings public.pallet_settings%rowtype;
  v_bags_weight numeric;
  v_pallets integer;
  v_total numeric;
begin
  if not public.can_manage_sales() then
    raise exception 'Somente usuários comerciais e administradores podem montar cargas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_load) <> 'object' then
    raise exception 'Dados da carga inválidos.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A carga precisa ter pelo menos um item.' using errcode = '22023';
  end if;
  if length(coalesce(p_load->>'notes', '')) > 500 then
    raise exception 'As observações podem ter até 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_vehicle from public.vehicles where vehicles.id = nullif(p_load->>'vehicle_id', '')::uuid;
  if not found or not v_vehicle.active then
    raise exception 'Escolha um veículo ativo.' using errcode = '22023';
  end if;

  if v_load_id is not null then
    select loads.status, loads.load_number into v_status, v_number
    from public.loads where loads.id = v_load_id for update;
    if v_status is null then
      raise exception 'Carga não encontrada.' using errcode = 'P0002';
    end if;
    if v_status <> 'planned' then
      raise exception 'Só cargas planejadas podem ser alteradas.' using errcode = '22023';
    end if;
  end if;

  create temporary table pg_temp.load_input on commit drop as
  select
    (entry->>'quote_item_id')::uuid as quote_item_id,
    (entry->>'quantity')::integer as quantity,
    entry->>'packing' as packing,
    (entry->>'stop_order')::integer as stop_order
  from jsonb_array_elements(p_items) entry;

  if exists (select 1 from pg_temp.load_input group by load_input.quote_item_id having count(*) > 1) then
    raise exception 'Um item aparece mais de uma vez na carga.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_temp.load_input
    where load_input.quote_item_id is null
      or coalesce(load_input.quantity, 0) <= 0
      or load_input.packing is null or load_input.packing not in ('pallet', 'loose')
      or load_input.stop_order is null or load_input.stop_order not between 1 and 99
  ) then
    raise exception 'Confira as quantidades, a ordem de entrega e o tipo de carga dos itens.' using errcode = '22023';
  end if;

  -- Trava os itens dos orçamentos: duas cargas salvas ao mesmo tempo não passam do saldo.
  perform 1 from public.quote_items
  where quote_items.id in (select load_input.quote_item_id from pg_temp.load_input)
  for update;

  if exists (
    select 1
    from pg_temp.load_input
    left join public.quote_items on quote_items.id = load_input.quote_item_id
    left join public.quotes on quotes.id = quote_items.quote_id
    where quote_items.id is null or quotes.status is distinct from 'approved'
  ) then
    raise exception 'Só itens de orçamentos aprovados podem entrar na carga.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.load_input
    join public.quote_items on quote_items.id = load_input.quote_item_id
    group by quote_items.quote_id
    having count(distinct load_input.stop_order) > 1 or count(distinct load_input.packing) > 1
  ) then
    raise exception 'Os itens de um mesmo pedido precisam ter a mesma parada e o mesmo tipo de carga.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.load_input
    join public.quote_items on quote_items.id = load_input.quote_item_id
    where load_input.quantity + coalesce((
      select sum(load_items.quantity)
      from public.load_items
      join public.loads on loads.id = load_items.load_id
      where load_items.quote_item_id = quote_items.id
        and loads.status <> 'cancelled'
        and loads.id is distinct from v_load_id
    ), 0) > quote_items.quantity
  ) then
    raise exception 'A quantidade passa do que falta enviar de um dos pedidos. Atualize a lista e confira.' using errcode = '22023';
  end if;

  -- Peso: sacas mais paletes vazios. Paletes contados por pedido e peso de saca.
  select coalesce(sum(load_input.quantity * quote_items.weight_kg_snapshot), 0)
  into v_bags_weight
  from pg_temp.load_input
  join public.quote_items on quote_items.id = load_input.quote_item_id;

  select * into v_settings from public.pallet_settings where pallet_settings.id;

  select coalesce(sum(ceil(grouped.bags::numeric / (v_settings.bags_per_pallet->>grouped.weight_key)::integer)), 0)::integer
  into v_pallets
  from (
    select quote_items.quote_id, trim_scale(quote_items.weight_kg_snapshot)::text as weight_key, sum(load_input.quantity) as bags
    from pg_temp.load_input
    join public.quote_items on quote_items.id = load_input.quote_item_id
    where load_input.packing = 'pallet'
    group by quote_items.quote_id, trim_scale(quote_items.weight_kg_snapshot)
  ) grouped
  where v_settings.bags_per_pallet ? grouped.weight_key;

  v_total := v_bags_weight + v_pallets * coalesce(v_settings.pallet_weight_kg, 0);
  if v_total > v_vehicle.capacity_kg then
    raise exception 'A carga passa da capacidade do veículo: % kg de % kg.',
      replace(to_char(round(v_total), 'FM999G999G999'), ',', '.'),
      replace(to_char(round(v_vehicle.capacity_kg), 'FM999G999G999'), ',', '.')
      using errcode = '22023';
  end if;

  if v_load_id is null then
    insert into public.loads (vehicle_id, vehicle_name_snapshot, vehicle_plate_snapshot, capacity_kg_snapshot, planned_date, notes, total_weight_kg, pallet_count)
    values (
      v_vehicle.id, v_vehicle.name, v_vehicle.plate, v_vehicle.capacity_kg,
      nullif(p_load->>'planned_date', '')::date,
      nullif(btrim(coalesce(p_load->>'notes', '')), ''),
      v_total, v_pallets
    )
    returning loads.id, loads.load_number into v_load_id, v_number;
  else
    update public.loads set
      vehicle_id = v_vehicle.id,
      vehicle_name_snapshot = v_vehicle.name,
      vehicle_plate_snapshot = v_vehicle.plate,
      capacity_kg_snapshot = v_vehicle.capacity_kg,
      planned_date = nullif(p_load->>'planned_date', '')::date,
      notes = nullif(btrim(coalesce(p_load->>'notes', '')), ''),
      total_weight_kg = v_total,
      pallet_count = v_pallets
    where loads.id = v_load_id;
    delete from public.load_items where load_items.load_id = v_load_id;
  end if;

  insert into public.load_items (load_id, quote_item_id, quote_id, quantity, weight_kg_snapshot, packing, stop_order)
  select v_load_id, quote_items.id, quote_items.quote_id, load_input.quantity, quote_items.weight_kg_snapshot, load_input.packing, load_input.stop_order
  from pg_temp.load_input
  join public.quote_items on quote_items.id = load_input.quote_item_id;

  drop table pg_temp.load_input;
  return query select v_load_id, v_number;
end;
$$;

revoke all on function public.save_load(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_load(uuid, jsonb, jsonb) to authenticated;

create or replace function public.set_load_status(p_load_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;
  if p_status not in ('planned', 'loaded', 'shipped', 'cancelled') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.loads set status = p_status where loads.id = p_load_id;
  if not found then
    raise exception 'Carga não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_load_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_load_status(uuid, text) to authenticated;

-- ---------- Andamento do envio de cada orçamento ----------
create or replace function public.quote_shipping(p_quote_ids uuid[])
returns table (quote_id uuid, total_bags integer, planned_bags integer, shipped_bags integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;
  return query
  select
    quotes.id,
    (select coalesce(sum(quote_items.quantity), 0)::integer from public.quote_items where quote_items.quote_id = quotes.id),
    coalesce(sum(load_items.quantity) filter (where loads.status in ('planned', 'loaded')), 0)::integer,
    coalesce(sum(load_items.quantity) filter (where loads.status = 'shipped'), 0)::integer
  from public.quotes
  left join public.load_items on load_items.quote_id = quotes.id
  left join public.loads on loads.id = load_items.load_id
  where quotes.id = any(p_quote_ids)
  group by quotes.id;
end;
$$;

revoke all on function public.quote_shipping(uuid[]) from public, anon, authenticated;
grant execute on function public.quote_shipping(uuid[]) to authenticated;

-- ---------- Teste com os usuários reais; desfaz tudo no fim ----------
do $$
declare
  v_admin uuid;
  v_seller uuid;
  v_customer uuid;
  v_quote record;
  v_item_40 uuid;
  v_item_30 uuid;
  v_small uuid;
  v_truck uuid;
  v_load record;
  v_load2 record;
  v_failed boolean;
  v_items jsonb := '[
    {"display_order":0,"product_name_snapshot":"Teste 40","weight_kg_snapshot":40,"table_unit_price":10,"quantity":10,"line_discount_percentage":0,"anticipated_discount_percentage":0,"total_discount_percentage":0,"final_unit_price":10,"economy_per_unit":0,"freight_per_unit":0,"handling_per_unit":0,"product_subtotal":100,"freight_subtotal":0,"handling_subtotal":0,"total":100},
    {"display_order":1,"product_name_snapshot":"Teste 30","weight_kg_snapshot":30,"table_unit_price":10,"quantity":20,"line_discount_percentage":0,"anticipated_discount_percentage":0,"total_discount_percentage":0,"final_unit_price":10,"economy_per_unit":0,"freight_per_unit":0,"handling_per_unit":0,"product_subtotal":200,"freight_subtotal":0,"handling_subtotal":0,"total":200}
  ]';
begin
  select id into v_admin from public.profiles where role = 'administrador' and active and not must_change_password limit 1;
  select id into v_seller from public.profiles where role = 'comercial' and active and not must_change_password limit 1;
  if v_admin is null then return; end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    v_small := public.save_vehicle(null, '{"name":"Teste pequeno","plate":"tst-1a23","capacity_kg":600}');
    if (select plate from public.vehicles where id = v_small) <> 'TST1A23' then raise exception 'placa não foi normalizada'; end if;
    v_truck := public.save_vehicle(null, '{"name":"Teste truck","capacity_kg":1000}');
    perform public.save_pallet_settings(20, '{"30": 10}');

    insert into public.customers (legal_name) values ('Cliente teste carga') returning id into v_customer;
    select * into v_quote from public.create_quote(
      jsonb_build_object('customer_id', v_customer, 'customer_name_snapshot', 'Cliente teste carga', 'product_subtotal', 300, 'freight_total', 0, 'handling_total', 0, 'economy_total', 0, 'grand_total', 300),
      v_items);
    select id into v_item_40 from public.quote_items where quote_id = v_quote.id and display_order = 0;
    select id into v_item_30 from public.quote_items where quote_id = v_quote.id and display_order = 1;

    -- Orçamento ainda não aprovado não entra.
    v_failed := false;
    begin perform public.save_load(null, jsonb_build_object('vehicle_id', v_truck), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_40, 'quantity', 1, 'packing', 'loose', 'stop_order', 1)));
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga aceitou orçamento não aprovado'; end if;

    perform public.set_quote_status(v_quote.id, 'issued');
    perform public.set_quote_status(v_quote.id, 'approved');

    -- Envio parcial: 10 sacas de 40 kg = 400 kg.
    select * into v_load from public.save_load(null, jsonb_build_object('vehicle_id', v_truck), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_40, 'quantity', 10, 'packing', 'loose', 'stop_order', 1)));
    if (select total_weight_kg from public.loads where id = v_load.id) <> 400 then raise exception 'peso da carga incorreto'; end if;
    if (select pending from (select quantity - allocated as pending from public.load_candidates() where quote_item_id = v_item_30) x) <> 20 then raise exception 'saldo a enviar incorreto'; end if;
    if exists (select 1 from public.load_candidates() where quote_item_id = v_item_40) then raise exception 'item já carregado continuou a enviar'; end if;

    -- Não passa do vendido.
    v_failed := false;
    begin perform public.save_load(null, jsonb_build_object('vehicle_id', v_truck), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_40, 'quantity', 1, 'packing', 'loose', 'stop_order', 1)));
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga passou do saldo do pedido'; end if;

    -- Paletizado: 20 sacas de 30 kg = 600 kg + 2 paletes de 20 kg; não cabe em 600 kg.
    v_failed := false;
    begin perform public.save_load(null, jsonb_build_object('vehicle_id', v_small), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_30, 'quantity', 20, 'packing', 'pallet', 'stop_order', 1)));
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga passou da capacidade'; end if;
    select * into v_load2 from public.save_load(null, jsonb_build_object('vehicle_id', v_truck), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_30, 'quantity', 20, 'packing', 'pallet', 'stop_order', 1)));
    if (select total_weight_kg <> 640 or pallet_count <> 2 from public.loads where id = v_load2.id) then raise exception 'paletes não contados'; end if;

    -- Orçamento em carga não é cancelado.
    v_failed := false;
    begin perform public.set_quote_status(v_quote.id, 'cancelled');
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'orçamento em carga foi cancelado'; end if;

    -- Andamento: não pula de planejada para enviada; carregada pode voltar.
    v_failed := false;
    begin perform public.set_load_status(v_load.id, 'shipped');
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga pulou para enviada'; end if;
    perform public.set_load_status(v_load.id, 'loaded');
    perform public.set_load_status(v_load.id, 'planned');
    perform public.set_load_status(v_load.id, 'loaded');
    perform public.set_load_status(v_load.id, 'shipped');
    if (select shipped_at is null or loaded_at is null from public.loads where id = v_load.id) then raise exception 'datas da carga não gravadas'; end if;
    v_failed := false;
    begin perform public.save_load(v_load.id, jsonb_build_object('vehicle_id', v_truck), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_40, 'quantity', 5, 'packing', 'loose', 'stop_order', 1)));
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga enviada foi editada'; end if;
    v_failed := false;
    begin perform public.set_load_status(v_load.id, 'cancelled');
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'carga enviada foi cancelada'; end if;

    if (select shipped_bags <> 10 or planned_bags <> 20 or total_bags <> 30 from public.quote_shipping(array[v_quote.id])) then raise exception 'andamento do envio incorreto'; end if;

    -- Cancelar a carga devolve o saldo.
    perform public.set_load_status(v_load2.id, 'cancelled');
    if (select quantity - allocated from public.load_candidates() where quote_item_id = v_item_30) <> 20 then raise exception 'carga cancelada não devolveu o saldo'; end if;

    -- Veículo em carga aberta não é excluído.
    select * into v_load2 from public.save_load(null, jsonb_build_object('vehicle_id', v_small), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_30, 'quantity', 5, 'packing', 'loose', 'stop_order', 1)));
    v_failed := false;
    begin perform public.deactivate_vehicle(v_small);
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'veículo em carga aberta foi excluído'; end if;

    if v_seller is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
      v_failed := false;
      begin perform public.save_vehicle(null, '{"name":"Comercial","capacity_kg":100}');
      exception when insufficient_privilege then v_failed := true; end;
      if not v_failed then raise exception 'comercial cadastrou veículo'; end if;
      -- Comercial monta carga.
      perform public.save_load(v_load2.id, jsonb_build_object('vehicle_id', v_small), jsonb_build_array(jsonb_build_object('quote_item_id', v_item_30, 'quantity', 6, 'packing', 'loose', 'stop_order', 1)));
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    end if;

    -- Usuário logado não grava direto nas tabelas.
    v_failed := false;
    begin
      perform set_config('role', 'authenticated', true);
      update public.loads set total_weight_kg = 1 where id = v_load2.id;
    exception when insufficient_privilege then v_failed := true;
    end;
    perform set_config('role', 'postgres', true);
    if not v_failed then raise exception 'update direto em loads foi aceito'; end if;

    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
