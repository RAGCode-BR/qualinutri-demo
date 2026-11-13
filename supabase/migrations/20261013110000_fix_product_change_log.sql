begin;

-- Correção: a versão anterior lia new.product_id também em updates de
-- public.products, que não tem essa coluna, e fazia toda edição de produto falhar.
create or replace function public.log_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
begin
  if to_jsonb(old) is not distinct from v_new then
    return new;
  end if;

  insert into public.product_change_log (table_name, record_id, product_id, previous_values, new_values, changed_by)
  values (
    tg_table_name,
    new.id,
    case when tg_table_name = 'products' then new.id else (v_new->>'product_id')::uuid end,
    to_jsonb(old),
    v_new,
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.log_product_change() from public, anon, authenticated;

-- Edita um produto de verdade como administrador (nome, peso e preços) e
-- confere o histórico; desfaz tudo no fim.
do $$
declare
  v_admin uuid;
  v_product record;
  v_prices jsonb;
  v_logs integer;
begin
  select id into v_admin
  from public.profiles
  where role = 'administrador' and active and not must_change_password
  limit 1;
  if v_admin is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select id, name, package_weight_kg into v_product from public.products where active order by display_order limit 1;
  select jsonb_agg(jsonb_build_object('payment_term_id', pp.payment_term_id, 'unit_price', pp.unit_price + 1)) into v_prices
  from public.product_prices pp
  join public.price_tables t on t.id = pp.price_table_id and t.status = 'active'
  where pp.product_id = v_product.id;

  begin
    perform public.update_product(v_product.id, v_product.name || ' (teste)', v_product.package_weight_kg, v_prices);
    select count(*) into v_logs from public.product_change_log where product_id = v_product.id;
    if v_logs < 2 then
      raise exception 'histórico de produto não registrou a edição (% linhas)', v_logs;
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
