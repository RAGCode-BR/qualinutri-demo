begin;

-- Registro de cada atualização feita a partir de um PDF.
create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  summary jsonb not null,
  applied_by uuid default auth.uid() references auth.users(id) on delete set null,
  applied_at timestamptz not null default now()
);

create index catalog_imports_applied_at_idx on public.catalog_imports(applied_at desc);
create index catalog_imports_applied_by_idx on public.catalog_imports(applied_by);

alter table public.catalog_imports enable row level security;

create policy catalog_imports_admin_read on public.catalog_imports for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.catalog_imports from anon, authenticated;
grant select on table public.catalog_imports to authenticated;

-- Aplica, numa única transação, o que o administrador confirmou na tela de
-- atualização: preços e pesos de produtos, produtos novos, percentuais de
-- desconto e valores de frete. Usa as mesmas funções da edição manual.
--
-- p_payload:
--   file_name    text
--   products     [{ id, weight, prices: [{ payment_term_id, unit_price }] }]
--   new_products [{ name, category, weight, prices: [{ payment_term_id, unit_price }] }]
--   discounts    [{ id, percentage }]
--   freight      [{ table, id, rates: { bag25, bag30, bag40, closed_per_ton } | { fractional_per_ton, closed_per_ton } }]
create or replace function public.apply_catalog_update(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_name text;
  v_category_id uuid;
  v_product_id uuid;
  v_price_table_id uuid;
  v_active_terms integer;
  v_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem atualizar o catálogo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Dados da atualização inválidos.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'products', '[]'::jsonb)) loop
    select name into v_name from public.products where id = (v_item->>'id')::uuid and active;
    if v_name is null then
      raise exception 'Um dos produtos a atualizar não existe mais. Leia o PDF de novo.' using errcode = '22023';
    end if;
    perform public.update_product((v_item->>'id')::uuid, v_name, (v_item->>'weight')::numeric, v_item->'prices');
  end loop;

  select id into v_price_table_id from public.price_tables where status = 'active';
  select count(*) into v_active_terms from public.payment_terms where active;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'new_products', '[]'::jsonb)) loop
    v_name := btrim(coalesce(v_item->>'name', ''));
    if v_name = '' or length(v_name) > 120 then
      raise exception 'Produto novo com nome inválido.' using errcode = '22023';
    end if;
    if exists (select 1 from public.products where active and lower(name) = lower(v_name)) then
      raise exception 'O produto % já existe.', v_name using errcode = '23505';
    end if;
    if coalesce((v_item->>'weight')::numeric, 0) <= 0 then
      raise exception 'Informe o peso da saca de %.', v_name using errcode = '22023';
    end if;
    select id into v_category_id from public.product_categories
    where active and lower(name) = lower(btrim(coalesce(v_item->>'category', '')));
    if v_category_id is null then
      raise exception 'Escolha uma categoria válida para %.', v_name using errcode = '22023';
    end if;
    if jsonb_typeof(v_item->'prices') <> 'array' or jsonb_array_length(v_item->'prices') <> v_active_terms then
      raise exception 'Informe um preço para cada prazo de %.', v_name using errcode = '22023';
    end if;

    insert into public.products (category_id, code, name, package_weight_kg, display_order)
    select v_category_id, 'produto-' || replace(gen_random_uuid()::text, '-', ''), v_name,
           (v_item->>'weight')::numeric, coalesce(max(display_order), -1) + 1
    from public.products
    where category_id = v_category_id
    returning id into v_product_id;

    insert into public.product_prices (price_table_id, product_id, payment_term_id, unit_price)
    select v_price_table_id, v_product_id, (price.value->>'payment_term_id')::uuid, round((price.value->>'unit_price')::numeric, 2)
    from jsonb_array_elements(v_item->'prices') as price(value)
    join public.payment_terms as term on term.id = (price.value->>'payment_term_id')::uuid and term.active;

    if (select count(*) from public.product_prices where product_id = v_product_id) <> v_active_terms then
      raise exception 'Preços de % não correspondem aos prazos vigentes.', v_name using errcode = '22023';
    end if;
    if exists (select 1 from public.product_prices where product_id = v_product_id and unit_price < 0) then
      raise exception 'Os preços de % não podem ser negativos.', v_name using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'discounts', '[]'::jsonb)) loop
    select name into v_name from public.discount_rules where id = (v_item->>'id')::uuid and active and rule_kind = 'line';
    if v_name is null then
      raise exception 'Uma das linhas de desconto não existe mais. Leia o PDF de novo.' using errcode = '22023';
    end if;
    perform public.save_discount_rule((v_item->>'id')::uuid, v_name, (v_item->>'percentage')::numeric);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'freight', '[]'::jsonb)) loop
    select label into v_name from public.freight_zones where id = (v_item->>'id')::uuid and active;
    if v_name is null then
      raise exception 'Uma das faixas de frete não existe mais. Leia o PDF de novo.' using errcode = '22023';
    end if;
    perform public.save_freight_zone(v_item->>'table', (v_item->>'id')::uuid, v_name, v_item->'rates');
  end loop;

  v_counts := jsonb_build_object(
    'products', jsonb_array_length(coalesce(p_payload->'products', '[]'::jsonb)),
    'new_products', jsonb_array_length(coalesce(p_payload->'new_products', '[]'::jsonb)),
    'discounts', jsonb_array_length(coalesce(p_payload->'discounts', '[]'::jsonb)),
    'freight', jsonb_array_length(coalesce(p_payload->'freight', '[]'::jsonb))
  );

  insert into public.catalog_imports (file_name, summary)
  values (left(coalesce(nullif(btrim(p_payload->>'file_name'), ''), 'arquivo.pdf'), 200), v_counts || jsonb_build_object('payload', p_payload));

  return v_counts;
end;
$$;

revoke all on function public.apply_catalog_update(jsonb) from public, anon, authenticated;
grant execute on function public.apply_catalog_update(jsonb) to authenticated;

-- Aplica uma atualização de verdade como administrador (preço igual ao atual,
-- produto novo, desconto e frete com os mesmos valores) e desfaz tudo no fim.
do $$
declare
  v_admin uuid;
  v_product record;
  v_prices jsonb;
  v_discount record;
  v_zone record;
  v_result jsonb;
begin
  select id into v_admin
  from public.profiles
  where role = 'administrador' and active and not must_change_password
  limit 1;
  if v_admin is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select p.id, p.package_weight_kg, c.name as category into v_product
  from public.products p join public.product_categories c on c.id = p.category_id
  where p.active order by p.display_order limit 1;
  select jsonb_agg(jsonb_build_object('payment_term_id', pp.payment_term_id, 'unit_price', pp.unit_price)) into v_prices
  from public.product_prices pp
  join public.price_tables t on t.id = pp.price_table_id and t.status = 'active'
  where pp.product_id = v_product.id;
  select id, percentage into v_discount from public.discount_rules where active and rule_kind = 'line' limit 1;
  select z.id into v_zone from public.freight_zones z
  join public.freight_tables t on t.id = z.freight_table_id and t.code = 'juara' and t.status = 'active'
  where z.active limit 1;

  begin
    v_result := public.apply_catalog_update(jsonb_build_object(
      'file_name', 'teste-automatico.pdf',
      'products', jsonb_build_array(jsonb_build_object('id', v_product.id, 'weight', v_product.package_weight_kg, 'prices', v_prices)),
      'new_products', jsonb_build_array(jsonb_build_object('name', 'Produto de teste automático', 'category', v_product.category, 'weight', 30, 'prices', v_prices)),
      'discounts', jsonb_build_array(jsonb_build_object('id', v_discount.id, 'percentage', v_discount.percentage)),
      'freight', jsonb_build_array(jsonb_build_object('table', 'juara', 'id', v_zone.id,
        'rates', '{"bag25": 1.6, "bag30": 1.9, "bag40": 2.5, "closed_per_ton": 25}'::jsonb))
    ));
    if (v_result->>'new_products')::int <> 1
      or not exists (select 1 from public.products where name = 'Produto de teste automático')
      or not exists (select 1 from public.catalog_imports where file_name = 'teste-automatico.pdf') then
      raise exception 'apply_catalog_update não gravou o esperado: %', v_result;
    end if;
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
