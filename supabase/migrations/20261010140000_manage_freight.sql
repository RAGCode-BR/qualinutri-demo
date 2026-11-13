begin;

-- Histórico de alterações nas faixas, tarifas de frete e valor da chapa.
create table public.freight_change_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('freight_zones', 'freight_rates', 'handling_rate_tables')),
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  previous_values jsonb,
  new_values jsonb,
  changed_by uuid default auth.uid() references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index freight_change_log_record_idx on public.freight_change_log(record_id, changed_at desc);
create index freight_change_log_changed_by_idx on public.freight_change_log(changed_by);

alter table public.freight_change_log enable row level security;

create policy freight_change_log_admin_read on public.freight_change_log for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.freight_change_log from anon, authenticated;
grant select on table public.freight_change_log to authenticated;

create or replace function public.log_freight_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) is not distinct from to_jsonb(new) then
    return new;
  end if;
  insert into public.freight_change_log (table_name, record_id, action, previous_values, new_values, changed_by)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.log_freight_change() from public, anon, authenticated;

create trigger freight_zones_log_change after insert or update on public.freight_zones
  for each row execute function public.log_freight_change();
create trigger freight_rates_log_change after insert or update or delete on public.freight_rates
  for each row execute function public.log_freight_change();
create trigger handling_rate_tables_log_change after update on public.handling_rate_tables
  for each row execute function public.log_freight_change();

-- Grava uma tarifa da faixa: cria, atualiza ou, com valor nulo, remove.
create or replace function public.set_freight_rate(
  p_zone_id uuid,
  p_load_type text,
  p_basis text,
  p_bag_weight numeric,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null then
    delete from public.freight_rates
    where freight_zone_id = p_zone_id
      and load_type = p_load_type
      and rate_basis = p_basis
      and bag_weight_kg is not distinct from p_bag_weight;
    return;
  end if;

  update public.freight_rates
  set amount = round(p_amount, 2)
  where freight_zone_id = p_zone_id
    and load_type = p_load_type
    and rate_basis = p_basis
    and bag_weight_kg is not distinct from p_bag_weight;

  if not found then
    insert into public.freight_rates (freight_zone_id, load_type, rate_basis, bag_weight_kg, amount)
    values (p_zone_id, p_load_type, p_basis, p_bag_weight, round(p_amount, 2));
  end if;
end;
$$;

revoke all on function public.set_freight_rate(uuid, text, text, numeric, numeric) from public, anon, authenticated;

-- Cria (p_zone_id nulo) ou edita uma faixa/cidade da tabela de frete vigente.
-- Juara: bag25, bag30, bag40 e closed_per_ton obrigatórios.
-- Regional: closed_per_ton obrigatório; fractional_per_ton opcional (nulo = só carga fechada).
create or replace function public.save_freight_zone(
  p_table_code text,
  p_zone_id uuid,
  p_label text,
  p_rates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_table_id uuid;
  v_zone_id uuid;
  v_key text;
  v_value numeric;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar o frete.' using errcode = '42501';
  end if;
  if p_table_code not in ('juara', 'regional') then
    raise exception 'Tabela de frete inválida.' using errcode = '22023';
  end if;
  if v_label = '' or length(v_label) > 80 then
    raise exception 'Informe um nome com até 80 caracteres.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rates) <> 'object' then
    raise exception 'Os valores do frete devem ser enviados em um objeto.' using errcode = '22023';
  end if;

  foreach v_key in array case when p_table_code = 'juara'
    then array['bag25', 'bag30', 'bag40', 'closed_per_ton']
    else array['closed_per_ton'] end
  loop
    if jsonb_typeof(p_rates->v_key) is distinct from 'number' then
      raise exception 'Preencha todos os valores obrigatórios do frete.' using errcode = '22023';
    end if;
  end loop;

  for v_key in select jsonb_object_keys(p_rates) loop
    if jsonb_typeof(p_rates->v_key) = 'number' then
      v_value := (p_rates->>v_key)::numeric;
      if v_value < 0 then
        raise exception 'Os valores do frete não podem ser negativos.' using errcode = '22023';
      end if;
    elsif jsonb_typeof(p_rates->v_key) <> 'null' then
      raise exception 'Valor de frete inválido.' using errcode = '22023';
    end if;
  end loop;

  select id into v_table_id from public.freight_tables where code = p_table_code and status = 'active';
  if v_table_id is null then
    raise exception 'Não há tabela de frete vigente.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.freight_zones
    where freight_table_id = v_table_id
      and active
      and lower(label) = lower(v_label)
      and id is distinct from p_zone_id
  ) then
    raise exception 'Já existe uma faixa ou cidade com esse nome.' using errcode = '23505';
  end if;

  if p_zone_id is null then
    insert into public.freight_zones (freight_table_id, code, label, display_order)
    select v_table_id, 'zona-' || replace(gen_random_uuid()::text, '-', ''), v_label,
           coalesce(max(display_order), -1) + 1
    from public.freight_zones
    where freight_table_id = v_table_id
    returning id into v_zone_id;
  else
    update public.freight_zones
    set label = v_label
    where id = p_zone_id
      and freight_table_id = v_table_id
      and active
    returning id into v_zone_id;
    if v_zone_id is null then
      raise exception 'Faixa ou cidade não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  if p_table_code = 'juara' then
    perform public.set_freight_rate(v_zone_id, 'fractional', 'per_bag', 25, (p_rates->>'bag25')::numeric);
    perform public.set_freight_rate(v_zone_id, 'fractional', 'per_bag', 30, (p_rates->>'bag30')::numeric);
    perform public.set_freight_rate(v_zone_id, 'fractional', 'per_bag', 40, (p_rates->>'bag40')::numeric);
    perform public.set_freight_rate(v_zone_id, 'closed', 'per_ton', null, (p_rates->>'closed_per_ton')::numeric);
  else
    perform public.set_freight_rate(v_zone_id, 'fractional', 'per_ton', null, (p_rates->>'fractional_per_ton')::numeric);
    perform public.set_freight_rate(v_zone_id, 'closed', 'per_ton', null, (p_rates->>'closed_per_ton')::numeric);
  end if;

  return v_zone_id;
end;
$$;

-- Exclusão lógica: a faixa sai da tabela e da calculadora; tarifas ficam guardadas.
create or replace function public.deactivate_freight_zone(p_zone_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar o frete.' using errcode = '42501';
  end if;
  update public.freight_zones set active = false where id = p_zone_id and active;
  if not found then
    raise exception 'Faixa ou cidade não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

-- Valor da chapa (carga e descarga) por tonelada, usado como padrão na calculadora.
create or replace function public.save_handling_rate(p_amount_per_ton numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar o frete.' using errcode = '42501';
  end if;
  if p_amount_per_ton is null or p_amount_per_ton < 0 then
    raise exception 'O valor da chapa não pode ser negativo.' using errcode = '22023';
  end if;
  update public.handling_rate_tables
  set amount_per_ton = round(p_amount_per_ton, 2)
  where code = 'handling' and status = 'active';
  if not found then
    raise exception 'Não há valor de chapa vigente.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_freight_zone(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.deactivate_freight_zone(uuid) from public, anon, authenticated;
revoke all on function public.save_handling_rate(numeric) from public, anon, authenticated;
grant execute on function public.save_freight_zone(text, uuid, text, jsonb) to authenticated;
grant execute on function public.deactivate_freight_zone(uuid) to authenticated;
grant execute on function public.save_handling_rate(numeric) to authenticated;

-- Executa criar, editar e excluir como um administrador real e desfaz tudo no
-- fim. Falha a migration se o SQL das funções tiver erro.
do $$
declare
  v_admin uuid;
  v_juara uuid;
  v_regional uuid;
  v_count integer;
begin
  select id into v_admin
  from public.profiles
  where role = 'administrador' and active and not must_change_password
  limit 1;
  if v_admin is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    v_juara := public.save_freight_zone('juara', null, 'Teste automático 999 km',
      '{"bag25": 1.1, "bag30": 1.2, "bag40": 1.3, "closed_per_ton": 10}'::jsonb);
    perform public.save_freight_zone('juara', v_juara, 'Teste automático 999 km (editado)',
      '{"bag25": 2.1, "bag30": 2.2, "bag40": 2.3, "closed_per_ton": 20}'::jsonb);
    select count(*) into v_count from public.freight_rates where freight_zone_id = v_juara;
    if v_count <> 4 then
      raise exception 'faixa Juara deveria ter 4 tarifas, tem %', v_count;
    end if;

    v_regional := public.save_freight_zone('regional', null, 'Cidade de teste automático',
      '{"fractional_per_ton": 100, "closed_per_ton": 90}'::jsonb);
    perform public.save_freight_zone('regional', v_regional, 'Cidade de teste automático',
      '{"fractional_per_ton": null, "closed_per_ton": 95}'::jsonb);
    select count(*) into v_count from public.freight_rates where freight_zone_id = v_regional;
    if v_count <> 1 then
      raise exception 'cidade sem fracionada deveria ter 1 tarifa, tem %', v_count;
    end if;

    perform public.deactivate_freight_zone(v_juara);
    perform public.save_handling_rate(41.5);
    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
