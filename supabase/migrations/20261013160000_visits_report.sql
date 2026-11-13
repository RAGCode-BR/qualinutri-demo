begin;

-- Cálculo do relatório de visitação (interno). A data da visita é a data em que
-- foi realizada ou, se ainda não foi, a data agendada. p_seller_id nulo = todos.
create or replace function public.visits_report_data(
  p_from date,
  p_to date,
  p_seller_id uuid,
  p_include_sellers boolean,
  p_stale_days integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
begin
  with period as (
    select v.*
    from public.visits v
    where coalesce(v.visited_date, v.scheduled_date) between p_from and p_to
      and (p_seller_id is null or v.seller_id = p_seller_id)
  ),
  totals as (
    select
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'not_done') as not_done,
      count(*) filter (where status = 'planned') as planned,
      count(*) filter (where status = 'planned' and scheduled_date < v_today) as overdue,
      count(distinct customer_id) filter (where status = 'completed') as customers_visited
    from period
  ),
  sellers as (
    select
      coalesce(nullif(btrim(p.display_name), ''), p.login, 'Usuário removido') as name,
      count(*) filter (where period.status = 'completed') as completed,
      count(*) filter (where period.status = 'not_done') as not_done,
      count(*) filter (where period.status = 'planned') as planned
    from period
    left join public.profiles p on p.id = period.seller_id
    group by period.seller_id, 1
    order by 2 desc, 1
  ),
  types as (
    select type, count(*) as total
    from period, unnest(period.visit_types) as type
    where period.status = 'completed'
    group by type
    order by 2 desc
  ),
  reasons as (
    select not_done_reason as reason, count(*) as total
    from period
    where status = 'not_done'
    group by not_done_reason
    order by 2 desc
  ),
  closings as (
    select
      count(*) as closing_visits,
      count(period.quote_id) as with_quote,
      count(q.id) filter (where q.status = 'approved') as approved,
      coalesce(sum(q.product_subtotal) filter (where q.status = 'approved'), 0) as approved_value
    from period
    left join public.quotes q on q.id = period.quote_id
    where period.status = 'completed' and 'closing' = any(period.visit_types)
  ),
  last_visits as (
    select c.id, c.legal_name as name, max(v.visited_date) as last_visit
    from public.customers c
    left join public.visits v
      on v.customer_id = c.id
     and v.status = 'completed'
     and (p_seller_id is null or v.seller_id = p_seller_id)
    where c.active
    group by c.id, c.legal_name
  ),
  stale as (
    select name, last_visit, case when last_visit is null then null else v_today - last_visit end as days
    from last_visits
    where last_visit is null or v_today - last_visit > p_stale_days
    order by last_visit nulls first, name
    limit 15
  )
  select jsonb_build_object(
    'scope', case when p_seller_id is null then 'all' else 'own' end,
    'totals', (select to_jsonb(t) from totals t),
    'sellers', case when p_include_sellers then coalesce((select jsonb_agg(to_jsonb(s)) from sellers s), '[]'::jsonb) else null end,
    'types', coalesce((select jsonb_agg(to_jsonb(t)) from types t), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(to_jsonb(r)) from reasons r), '[]'::jsonb),
    'closings', (select to_jsonb(c) from closings c),
    'stale_customers', coalesce((select jsonb_agg(to_jsonb(s)) from stale s), '[]'::jsonb),
    'stale_total', (select count(*) from last_visits where last_visit is null or v_today - last_visit > p_stale_days),
    'stale_days', p_stale_days
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.visits_report_data(date, date, uuid, boolean, integer) from public, anon, authenticated;

-- Administrador vê tudo; comercial vê só as próprias visitas e não recebe o
-- comparativo por vendedor.
create or replace function public.visits_report(p_from date, p_to date, p_stale_days integer default 30)
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
  if coalesce(p_stale_days, 0) < 1 or p_stale_days > 365 then
    raise exception 'O prazo de clientes sem visita deve ficar entre 1 e 365 dias.' using errcode = '22023';
  end if;

  if v_role = 'comercial' then
    return public.visits_report_data(p_from, p_to, auth.uid(), false, p_stale_days);
  end if;
  return public.visits_report_data(p_from, p_to, null, true, p_stale_days);
end;
$$;

revoke all on function public.visits_report(date, date, integer) from public, anon, authenticated;
grant execute on function public.visits_report(date, date, integer) to authenticated;

-- Executa o cálculo com dados reais: falha a migration se o SQL tiver erro.
do $$
declare
  v_all jsonb := public.visits_report_data(current_date - 365, current_date, null, true, 30);
  v_own jsonb := public.visits_report_data(current_date - 30, current_date, gen_random_uuid(), false, 30);
begin
  if v_all->>'scope' <> 'all' or jsonb_typeof(v_all->'sellers') <> 'array' or v_all->'totals' is null or v_all->'closings' is null then
    raise exception 'visits_report_data: formato inesperado para administrador: %', v_all;
  end if;
  if v_own->>'scope' <> 'own' or v_own->'sellers' <> 'null'::jsonb or (v_own->'totals'->>'completed')::int <> 0 then
    raise exception 'visits_report_data: formato inesperado para comercial: %', v_own;
  end if;
end;
$$;

commit;
