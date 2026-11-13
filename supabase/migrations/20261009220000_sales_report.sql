begin;

create index if not exists quotes_approved_at_idx
  on public.quotes(approved_at)
  where status = 'approved';

-- Relatório de vendas: orçamentos aprovados no período, pela data de aprovação
-- no fuso de Mato Grosso. Valores são o subtotal dos produtos (sem frete e chapa).
-- Administrador vê tudo, inclusive o ranking de vendedores; comercial vê só os
-- orçamentos que criou e não recebe o ranking de vendedores.
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_profile_role();
  v_own_only boolean;
  v_result jsonb;
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

  v_own_only := v_role = 'comercial';

  with sold as (
    select q.id, q.customer_id, q.customer_name_snapshot, q.created_by, q.product_subtotal
    from public.quotes as q
    where q.status = 'approved'
      and (q.approved_at at time zone 'America/Cuiaba')::date between p_from and p_to
      and (not v_own_only or q.created_by = auth.uid())
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
    group by customer_id, 2
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
    'scope', case when v_own_only then 'own' else 'all' end,
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
    'sellers', case when v_own_only then null
      else coalesce((select jsonb_agg(to_jsonb(s) order by s.revenue desc) from sellers as s), '[]'::jsonb) end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.sales_report(date, date) from public, anon, authenticated;
grant execute on function public.sales_report(date, date) to authenticated;

comment on function public.sales_report(date, date) is
  'Rankings de vendas (orçamentos aprovados) no período. Comercial vê só os próprios orçamentos.';

commit;
