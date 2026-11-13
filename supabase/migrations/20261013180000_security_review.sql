begin;

-- =====================================================================
-- Revisão de segurança (13/10/2026)
-- Orçamentos passam a ser gravados só por funções que conferem dono,
-- situação e datas; visitas registradas não voltam a ser agendadas;
-- autoria (created_by) sempre do usuário logado.
-- =====================================================================

-- ---------- Autoria sempre do usuário logado ----------
create or replace function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.set_created_by() from public, anon, authenticated;

create trigger customers_set_created_by before insert on public.customers
  for each row execute function public.set_created_by();
create trigger quotes_set_created_by before insert on public.quotes
  for each row execute function public.set_created_by();
create trigger visits_set_created_by before insert on public.visits
  for each row execute function public.set_created_by();
create trigger customer_properties_set_created_by before insert on public.customer_properties
  for each row execute function public.set_created_by();

-- ---------- Orçamentos: só por funções ----------
revoke insert, update, delete on table public.quotes from authenticated;
revoke insert, update, delete on table public.quote_items from authenticated;

-- Datas de andamento sempre do servidor, nunca do navegador.
create or replace function public.enforce_quote_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    new.issued_at := old.issued_at;
    new.approved_at := old.approved_at;
    new.cancelled_at := old.cancelled_at;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    new.issued_at := now();
  elsif old.status = 'issued' and new.status = 'approved' then
    new.approved_at := now();
  elsif old.status in ('draft', 'issued', 'approved') and new.status = 'cancelled' then
    new.cancelled_at := now();
  else
    raise exception 'Mudança de situação não permitida.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_quote_status_flow() from public, anon, authenticated;

drop trigger if exists quotes_enforce_status_flow on public.quotes;
create trigger quotes_enforce_status_flow
  before update on public.quotes
  for each row execute function public.enforce_quote_status_flow();

create or replace function public.create_quote(
  p_quote jsonb,
  p_items jsonb
)
returns table (id uuid, quote_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_quote_number bigint;
begin
  if not public.can_manage_sales() then
    raise exception 'Somente usuários comerciais e administradores podem salvar orçamentos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_quote) <> 'object' then
    raise exception 'quote payload must be an object';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'quote must contain at least one item';
  end if;

  insert into public.quotes (
    status,
    customer_id,
    customer_name_snapshot,
    customer_document_snapshot,
    price_table_id,
    discount_table_id,
    freight_table_id,
    handling_rate_table_id,
    policy_version_id,
    calculation_version,
    anticipated_payment,
    anticipated_discount_percentage,
    freight_table_name_snapshot,
    freight_zone_snapshot,
    load_type_snapshot,
    handling_rate_per_ton_snapshot,
    product_subtotal,
    freight_total,
    handling_total,
    economy_total,
    grand_total,
    expires_at
  ) values (
    'draft',
    nullif(p_quote->>'customer_id', '')::uuid,
    p_quote->>'customer_name_snapshot',
    p_quote->>'customer_document_snapshot',
    nullif(p_quote->>'price_table_id', '')::uuid,
    nullif(p_quote->>'discount_table_id', '')::uuid,
    nullif(p_quote->>'freight_table_id', '')::uuid,
    nullif(p_quote->>'handling_rate_table_id', '')::uuid,
    nullif(p_quote->>'policy_version_id', '')::uuid,
    coalesce(p_quote->>'calculation_version', 'legacy-html-v1'),
    coalesce((p_quote->>'anticipated_payment')::boolean, false),
    coalesce((p_quote->>'anticipated_discount_percentage')::numeric, 0),
    p_quote->>'freight_table_name_snapshot',
    p_quote->>'freight_zone_snapshot',
    p_quote->>'load_type_snapshot',
    coalesce((p_quote->>'handling_rate_per_ton_snapshot')::numeric, 0),
    (p_quote->>'product_subtotal')::numeric,
    (p_quote->>'freight_total')::numeric,
    (p_quote->>'handling_total')::numeric,
    (p_quote->>'economy_total')::numeric,
    (p_quote->>'grand_total')::numeric,
    nullif(p_quote->>'expires_at', '')::timestamptz
  )
  returning quotes.id, quotes.quote_number into v_quote_id, v_quote_number;

  insert into public.quote_items (
    quote_id,
    display_order,
    product_id,
    payment_term_id,
    discount_rule_id,
    product_name_snapshot,
    category_name_snapshot,
    weight_kg_snapshot,
    payment_term_snapshot,
    table_unit_price,
    quantity,
    line_discount_percentage,
    anticipated_discount_percentage,
    total_discount_percentage,
    final_unit_price,
    economy_per_unit,
    freight_per_unit,
    handling_per_unit,
    product_subtotal,
    freight_subtotal,
    handling_subtotal,
    total
  )
  select
    v_quote_id,
    coalesce((item.value->>'display_order')::integer, item.ordinality::integer - 1),
    nullif(item.value->>'product_id', '')::uuid,
    nullif(item.value->>'payment_term_id', '')::uuid,
    nullif(item.value->>'discount_rule_id', '')::uuid,
    item.value->>'product_name_snapshot',
    item.value->>'category_name_snapshot',
    (item.value->>'weight_kg_snapshot')::numeric,
    item.value->>'payment_term_snapshot',
    (item.value->>'table_unit_price')::numeric,
    (item.value->>'quantity')::integer,
    (item.value->>'line_discount_percentage')::numeric,
    (item.value->>'anticipated_discount_percentage')::numeric,
    (item.value->>'total_discount_percentage')::numeric,
    (item.value->>'final_unit_price')::numeric,
    (item.value->>'economy_per_unit')::numeric,
    (item.value->>'freight_per_unit')::numeric,
    (item.value->>'handling_per_unit')::numeric,
    (item.value->>'product_subtotal')::numeric,
    (item.value->>'freight_subtotal')::numeric,
    (item.value->>'handling_subtotal')::numeric,
    (item.value->>'total')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  return query select v_quote_id, v_quote_number;
end;
$$;

revoke all on function public.create_quote(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_quote(jsonb, jsonb) to authenticated;

create or replace function public.update_quote(
  p_quote_id uuid,
  p_quote jsonb,
  p_items jsonb
)
returns table (id uuid, quote_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_quote_number bigint;
  v_owner uuid;
  v_customer uuid;
begin
  if not public.can_manage_sales() then
    raise exception 'Somente usuários comerciais e administradores podem editar orçamentos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_quote) <> 'object' then
    raise exception 'quote payload must be an object';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O orçamento precisa ter ao menos um item.' using errcode = '22023';
  end if;

  select quotes.status, quotes.quote_number, quotes.created_by, quotes.customer_id
  into v_status, v_quote_number, v_owner, v_customer
  from public.quotes
  where quotes.id = p_quote_id
  for update;

  if v_status is null then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'issued') then
    raise exception 'Só orçamentos em rascunho ou enviados podem ser editados. Para refazer, duplique o orçamento.' using errcode = '22023';
  end if;
  if not public.is_admin() and v_owner is distinct from auth.uid() then
    raise exception 'Você só pode editar os seus orçamentos.' using errcode = '42501';
  end if;
  if nullif(p_quote->>'customer_id', '')::uuid is distinct from v_customer
    and exists (select 1 from public.visits where visits.quote_id = p_quote_id) then
    raise exception 'Este orçamento está vinculado a uma visita: o cliente não pode ser trocado.' using errcode = '22023';
  end if;

  update public.quotes set
    customer_id = nullif(p_quote->>'customer_id', '')::uuid,
    customer_name_snapshot = p_quote->>'customer_name_snapshot',
    customer_document_snapshot = p_quote->>'customer_document_snapshot',
    anticipated_payment = coalesce((p_quote->>'anticipated_payment')::boolean, false),
    anticipated_discount_percentage = coalesce((p_quote->>'anticipated_discount_percentage')::numeric, 0),
    freight_table_name_snapshot = p_quote->>'freight_table_name_snapshot',
    freight_zone_snapshot = p_quote->>'freight_zone_snapshot',
    load_type_snapshot = p_quote->>'load_type_snapshot',
    handling_rate_per_ton_snapshot = coalesce((p_quote->>'handling_rate_per_ton_snapshot')::numeric, 0),
    product_subtotal = (p_quote->>'product_subtotal')::numeric,
    freight_total = (p_quote->>'freight_total')::numeric,
    handling_total = (p_quote->>'handling_total')::numeric,
    economy_total = (p_quote->>'economy_total')::numeric,
    grand_total = (p_quote->>'grand_total')::numeric
  where quotes.id = p_quote_id;

  delete from public.quote_items where quote_items.quote_id = p_quote_id;

  insert into public.quote_items (
    quote_id,
    display_order,
    product_id,
    payment_term_id,
    discount_rule_id,
    product_name_snapshot,
    category_name_snapshot,
    weight_kg_snapshot,
    payment_term_snapshot,
    table_unit_price,
    quantity,
    line_discount_percentage,
    anticipated_discount_percentage,
    total_discount_percentage,
    final_unit_price,
    economy_per_unit,
    freight_per_unit,
    handling_per_unit,
    product_subtotal,
    freight_subtotal,
    handling_subtotal,
    total
  )
  select
    p_quote_id,
    coalesce((item.value->>'display_order')::integer, item.ordinality::integer - 1),
    nullif(item.value->>'product_id', '')::uuid,
    nullif(item.value->>'payment_term_id', '')::uuid,
    nullif(item.value->>'discount_rule_id', '')::uuid,
    item.value->>'product_name_snapshot',
    item.value->>'category_name_snapshot',
    (item.value->>'weight_kg_snapshot')::numeric,
    item.value->>'payment_term_snapshot',
    (item.value->>'table_unit_price')::numeric,
    (item.value->>'quantity')::integer,
    (item.value->>'line_discount_percentage')::numeric,
    (item.value->>'anticipated_discount_percentage')::numeric,
    (item.value->>'total_discount_percentage')::numeric,
    (item.value->>'final_unit_price')::numeric,
    (item.value->>'economy_per_unit')::numeric,
    (item.value->>'freight_per_unit')::numeric,
    (item.value->>'handling_per_unit')::numeric,
    (item.value->>'product_subtotal')::numeric,
    (item.value->>'freight_subtotal')::numeric,
    (item.value->>'handling_subtotal')::numeric,
    (item.value->>'total')::numeric
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  return query select p_quote_id, v_quote_number;
end;
$$;

revoke all on function public.update_quote(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_quote(uuid, jsonb, jsonb) to authenticated;

-- Enviar, aprovar e cancelar: só o dono do orçamento ou o administrador.
create or replace function public.set_quote_status(p_quote_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;
  if p_status not in ('issued', 'approved', 'cancelled') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select created_by into v_owner from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;
  if not public.is_admin() and v_owner is distinct from auth.uid() then
    raise exception 'Só o vendedor que criou o orçamento ou um administrador pode mudar a situação.' using errcode = '42501';
  end if;
  update public.quotes set status = p_status where id = p_quote_id;
end;
$$;

revoke all on function public.set_quote_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_quote_status(uuid, text) to authenticated;

-- ---------- Visitas ----------
-- Visita registrada (realizada ou não) não volta a ser agendada nem muda de lado.
create or replace function public.enforce_visit_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'planned' and new.status is distinct from old.status then
    raise exception 'Visitas já registradas não podem mudar de situação.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_visit_status_flow() from public, anon, authenticated;

create trigger visits_enforce_status_flow before update on public.visits
  for each row execute function public.enforce_visit_status_flow();

-- Validações só quando cliente, propriedade, orçamento ou vendedor mudam.
create or replace function public.validate_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_admin boolean := public.is_admin();
begin
  if not v_is_admin and new.seller_id is distinct from auth.uid() then
    raise exception 'Você só pode registrar visitas para você mesmo.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.seller_id is distinct from old.seller_id then
    if not exists (
      select 1 from public.profiles
      where id = new.seller_id and active and role in ('administrador', 'comercial')
    ) then
      raise exception 'O vendedor escolhido não está ativo.' using errcode = '22023';
    end if;
  end if;

  if new.property_id is not null and (tg_op = 'INSERT' or new.property_id is distinct from old.property_id or new.customer_id is distinct from old.customer_id)
    and not exists (
      select 1 from public.customer_properties
      where id = new.property_id and customer_id = new.customer_id
    ) then
    raise exception 'A propriedade escolhida não pertence a este cliente.' using errcode = '22023';
  end if;

  if new.quote_id is not null and (tg_op = 'INSERT' or new.quote_id is distinct from old.quote_id or new.customer_id is distinct from old.customer_id) then
    if not exists (
      select 1 from public.quotes
      where id = new.quote_id and customer_id = new.customer_id and status <> 'cancelled'
    ) then
      raise exception 'O orçamento escolhido não é deste cliente ou está cancelado.' using errcode = '22023';
    end if;
    if not v_is_admin and not exists (
      select 1 from public.quotes where id = new.quote_id and created_by = new.seller_id
    ) then
      raise exception 'Vincule um orçamento feito por você.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_visit() from public, anon, authenticated;

-- ---------- Propriedades: não mudam de cliente ----------
create or replace function public.protect_property_customer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.customer_id is distinct from old.customer_id then
    raise exception 'Uma propriedade não pode ser movida para outro cliente.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_property_customer() from public, anon, authenticated;

create trigger customer_properties_protect_customer before update on public.customer_properties
  for each row execute function public.protect_property_customer();

-- ---------- Clientes: CPF/CNPJ único entre clientes ativos ----------
create unique index customers_document_active_unique
  on public.customers(document)
  where document is not null and active;

-- ---------- Frete: checagem de administrador também na função interna ----------
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
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar o frete.' using errcode = '42501';
  end if;
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

-- ---------- Relatório de vendas usando o índice de approved_at ----------
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
      and q.approved_at >= (p_from::timestamp at time zone 'America/Cuiaba')
      and q.approved_at < ((p_to + 1)::timestamp at time zone 'America/Cuiaba')
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

-- ---------- Diversos ----------
revoke all on function public.set_updated_at() from public, anon;
create index if not exists quotes_updated_by_idx on public.quotes(updated_by);
create index if not exists customers_updated_by_idx on public.customers(updated_by);
create index if not exists customer_properties_customer_all_idx on public.customer_properties(customer_id);

-- ---------- Teste com os usuários reais; desfaz tudo no fim ----------
do $$
declare
  v_admin uuid;
  v_seller uuid;
  v_customer uuid;
  v_quote record;
  v_visit uuid;
  v_failed boolean;
  v_items jsonb := '[{"display_order":0,"product_name_snapshot":"Produto teste","category_name_snapshot":null,"weight_kg_snapshot":40,"payment_term_snapshot":"à vista","table_unit_price":10,"quantity":1,"line_discount_percentage":0,"anticipated_discount_percentage":0,"total_discount_percentage":0,"final_unit_price":10,"economy_per_unit":0,"freight_per_unit":0,"handling_per_unit":0,"product_subtotal":10,"freight_subtotal":0,"handling_subtotal":0,"total":10}]';
begin
  select id into v_admin from public.profiles where role = 'administrador' and active and not must_change_password limit 1;
  select id into v_seller from public.profiles where role = 'comercial' and active and not must_change_password limit 1;
  if v_admin is null then return; end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    insert into public.customers (legal_name) values ('Cliente teste segurança') returning id into v_customer;

    -- Status enviado pelo navegador é ignorado: nasce rascunho, autor é o usuário.
    select * into v_quote from public.create_quote(
      jsonb_build_object('status', 'approved', 'customer_id', v_customer, 'product_subtotal', 10, 'freight_total', 0, 'handling_total', 0, 'economy_total', 0, 'grand_total', 10),
      v_items);
    if (select status from public.quotes where id = v_quote.id) <> 'draft' then raise exception 'create_quote aceitou status do navegador'; end if;
    if (select created_by from public.quotes where id = v_quote.id) <> v_admin then raise exception 'create_quote não gravou o autor'; end if;

    if v_seller is not null then
      -- Comercial não muda situação nem edita orçamento de outro vendedor.
      perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
      v_failed := false;
      begin perform public.set_quote_status(v_quote.id, 'approved');
      exception when insufficient_privilege then v_failed := true; end;
      if not v_failed then raise exception 'comercial aprovou orçamento de outro vendedor'; end if;
      v_failed := false;
      begin perform public.update_quote(v_quote.id, jsonb_build_object('customer_id', v_customer, 'product_subtotal', 1, 'freight_total', 0, 'handling_total', 0, 'economy_total', 0, 'grand_total', 1), v_items);
      exception when insufficient_privilege then v_failed := true; end;
      if not v_failed then raise exception 'comercial editou orçamento de outro vendedor'; end if;
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    end if;

    -- Fluxo do dono: enviar, aprovar; aprovado não é mais editável.
    perform public.set_quote_status(v_quote.id, 'issued');
    perform public.set_quote_status(v_quote.id, 'approved');
    if (select approved_at is null or issued_at is null from public.quotes where id = v_quote.id) then raise exception 'datas de andamento não gravadas'; end if;
    v_failed := false;
    begin perform public.update_quote(v_quote.id, jsonb_build_object('customer_id', v_customer, 'product_subtotal', 1, 'freight_total', 0, 'handling_total', 0, 'economy_total', 0, 'grand_total', 1), v_items);
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'orçamento aprovado foi editado'; end if;

    -- Visita registrada não volta a ser agendada.
    insert into public.visits (seller_id, customer_id, status, scheduled_date, visited_date, developed, visit_types)
    values (v_admin, v_customer, 'completed', current_date, current_date, 'Teste', array['relationship']) returning id into v_visit;
    v_failed := false;
    begin update public.visits set status = 'planned' where id = v_visit;
    exception when invalid_parameter_value then v_failed := true; end;
    if not v_failed then raise exception 'visita realizada voltou a ser agendada'; end if;

    -- Usuário logado (papel authenticated) não grava direto em quotes.
    v_failed := false;
    begin
      perform set_config('role', 'authenticated', true);
      insert into public.quotes (status, product_subtotal, freight_total, handling_total, economy_total, grand_total)
      values ('approved', 1, 0, 0, 0, 1);
    exception when insufficient_privilege then v_failed := true;
    end;
    perform set_config('role', 'postgres', true);
    if not v_failed then raise exception 'insert direto em quotes foi aceito'; end if;

    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
