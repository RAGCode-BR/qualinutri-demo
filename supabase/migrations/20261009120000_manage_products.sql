begin;

-- Histórico de alterações de produtos e preços. Preços são editados na tabela
-- vigente, então cada mudança fica registrada com valores anteriores e novos.
create table public.product_change_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('products', 'product_prices')),
  record_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_by uuid default auth.uid() references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index product_change_log_product_id_idx on public.product_change_log(product_id, changed_at desc);
create index product_change_log_changed_by_idx on public.product_change_log(changed_by);

alter table public.product_change_log enable row level security;

create policy product_change_log_admin_read on public.product_change_log for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.product_change_log from anon, authenticated;
grant select on table public.product_change_log to authenticated;

create or replace function public.log_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_jsonb(old) is not distinct from to_jsonb(new) then
    return new;
  end if;

  insert into public.product_change_log (table_name, record_id, product_id, previous_values, new_values, changed_by)
  values (
    tg_table_name,
    new.id,
    case when tg_table_name = 'products' then new.id else new.product_id end,
    to_jsonb(old),
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.log_product_change() from public, anon, authenticated;

create trigger products_log_change after update on public.products
  for each row execute function public.log_product_change();
create trigger product_prices_log_change after update on public.product_prices
  for each row execute function public.log_product_change();

-- Edita nome, peso e preços de um produto na tabela de preços vigente, numa
-- única transação. Executa com as permissões de quem chama (RLS de administrador).
create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_package_weight_kg numeric,
  p_prices jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_price_table_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_active_terms integer;
  v_informed_terms integer;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem editar produtos.' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Informe um nome de produto com até 120 caracteres.' using errcode = '22023';
  end if;
  if p_package_weight_kg is null or p_package_weight_kg <= 0 then
    raise exception 'O peso da saca deve ser maior que zero.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_prices) <> 'array' then
    raise exception 'Os preços devem ser enviados em uma lista.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_prices) as price(value)
    where (price.value->>'unit_price') is null
      or (price.value->>'unit_price')::numeric < 0
  ) then
    raise exception 'Os preços não podem ser negativos ou vazios.' using errcode = '22023';
  end if;

  select count(*) into v_active_terms from public.payment_terms where active;
  select count(distinct term.id) into v_informed_terms
  from jsonb_array_elements(p_prices) as price(value)
  join public.payment_terms as term
    on term.id = (price.value->>'payment_term_id')::uuid and term.active;
  if v_informed_terms <> v_active_terms or jsonb_array_length(p_prices) <> v_active_terms then
    raise exception 'Informe um preço para cada prazo de pagamento.' using errcode = '22023';
  end if;

  select id into v_price_table_id from public.price_tables where status = 'active';
  if v_price_table_id is null then
    raise exception 'Não há tabela de preços vigente.' using errcode = 'P0002';
  end if;

  update public.products
  set name = v_name,
      package_weight_kg = p_package_weight_kg
  where id = p_product_id
    and active;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.product_prices (price_table_id, product_id, payment_term_id, unit_price)
  select
    v_price_table_id,
    p_product_id,
    (price.value->>'payment_term_id')::uuid,
    round((price.value->>'unit_price')::numeric, 2)
  from jsonb_array_elements(p_prices) as price(value)
  on conflict (price_table_id, product_id, payment_term_id)
  do update set unit_price = excluded.unit_price
  where public.product_prices.unit_price is distinct from excluded.unit_price;
end;
$$;

-- Exclusão lógica: o produto sai do catálogo, mas orçamentos e histórico
-- continuam apontando para ele.
create or replace function public.deactivate_product(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem excluir produtos.' using errcode = '42501';
  end if;

  update public.products
  set active = false
  where id = p_product_id
    and active;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_product(uuid, text, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.deactivate_product(uuid) from public, anon, authenticated;
grant execute on function public.update_product(uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.deactivate_product(uuid) to authenticated;

comment on function public.update_product(uuid, text, numeric, jsonb) is
  'Atualiza nome, peso e preços de um produto na tabela de preços vigente. Restrito a administradores.';
comment on function public.deactivate_product(uuid) is
  'Remove o produto do catálogo sem apagar o registro. Restrito a administradores.';

commit;
