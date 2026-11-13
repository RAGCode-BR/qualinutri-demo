begin;

-- Separa o cálculo do relatório (interno, sem acesso direto) da verificação de
-- acesso, para que a migration consiga executar o cálculo e validar o SQL.
create or replace function public.sales_report_data(
  p_from date,
  p_to date,
  p_seller_id uuid,
  p_include_sellers boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with sold as (
    select q.id, q.customer_id, q.customer_name_snapshot, q.created_by, q.product_subtotal
    from public.quotes as q
    where q.status = 'approved'
      and (q.approved_at at time zone 'America/Cuiaba')::date between p_from and p_to
      and (p_seller_id is null or q.created_by = p_seller_id)
  ),
  sold_items as (
    select
      i.quote_id,
      i.product_name_snapshot as product_name,
      coalesce(nullif(btrim(i.category_name_snapshot), ''), 'Sem categoria') as category_name,
      i.quantity,
      i.product_subtotal
    from public.quote_items as i
    join sold on sold.id = i.quote_id
  ),
  customers as (
    select
      coalesce(nullif(btrim(customer_name_snapshot), ''), 'Sem cliente vinculado') as name,
      sum(product_subtotal) as revenue,
      count(*) as orders
    from sold
    group by customer_id, 1
    order by revenue desc
    limit 10
  ),
  products as (
    select product_name as name, sum(product_subtotal) as revenue, sum(quantity) as bags, count(distinct quote_id) as orders
    from sold_items
    group by product_name
    order by revenue desc
    limit 10
  ),
  categories as (
    select category_name as name, sum(product_subtotal) as revenue, sum(quantity) as bags, count(distinct quote_id) as orders
    from sold_items
    group by category_name
    order by revenue desc
    limit 10
  ),
  sellers as (
    select
      coalesce(nullif(btrim(p.display_name), ''), p.login, 'Usuário removido') as name,
      sum(sold.product_subtotal) as revenue,
      count(*) as orders
    from sold
    left join public.profiles as p on p.id = sold.created_by
    group by sold.created_by, 1
    order by revenue desc
    limit 10
  )
  select jsonb_build_object(
    'scope', case when p_seller_id is null then 'all' else 'own' end,
    'totals', (
      select jsonb_build_object(
        'revenue', coalesce(sum(product_subtotal), 0),
        'orders', count(*),
        'bags', coalesce((select sum(quantity) from sold_items), 0)
      ) from sold
    ),
    'customers', coalesce((select jsonb_agg(to_jsonb(c) order by c.revenue desc) from customers as c), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.revenue desc) from products as pr), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(ca) order by ca.revenue desc) from categories as ca), '[]'::jsonb),
    'sellers', case when not p_include_sellers then null
      else coalesce((select jsonb_agg(to_jsonb(s) order by s.revenue desc) from sellers as s), '[]'::jsonb) end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.sales_report_data(date, date, uuid, boolean) from public, anon, authenticated;

create or replace function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_profile_role();
begin
  if v_role is null or v_role not in ('administrador', 'comercial') then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Escolha um período de até um ano.' using errcode = '22023';
  end if;

  if v_role = 'comercial' then
    return public.sales_report_data(p_from, p_to, auth.uid(), false);
  end if;
  return public.sales_report_data(p_from, p_to, null, true);
end;
$$;

revoke all on function public.sales_report(date, date) from public, anon, authenticated;
grant execute on function public.sales_report(date, date) to authenticated;

-- Executa o cálculo com dados reais: falha e desfaz a migration se o SQL tiver erro.
do $$
declare
  v_all jsonb := public.sales_report_data(current_date - 365, current_date, null, true);
  v_own jsonb := public.sales_report_data(current_date - 30, current_date, gen_random_uuid(), false);
begin
  if v_all->>'scope' <> 'all' or jsonb_typeof(v_all->'sellers') <> 'array' or v_all->'totals' is null then
    raise exception 'sales_report_data: formato inesperado para administrador: %', v_all;
  end if;
  if v_own->>'scope' <> 'own' or v_own->'sellers' <> 'null'::jsonb or (v_own->'totals'->>'orders')::int <> 0 then
    raise exception 'sales_report_data: formato inesperado para comercial: %', v_own;
  end if;
end;
$$;

commit;
