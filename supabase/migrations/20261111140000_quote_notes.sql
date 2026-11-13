begin;

-- Observações do orçamento: texto livre que sai no PDF para o cliente.
alter table public.quotes
  add column notes text check (notes is null or length(notes) <= 1000);

-- create_quote e update_quote passam a gravar as observações (mesma lógica de antes).
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
    expires_at,
    notes
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
    nullif(p_quote->>'expires_at', '')::timestamptz,
    nullif(btrim(coalesce(p_quote->>'notes', '')), '')
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
    price_table_id = nullif(p_quote->>'price_table_id', '')::uuid,
    discount_table_id = nullif(p_quote->>'discount_table_id', '')::uuid,
    freight_table_id = nullif(p_quote->>'freight_table_id', '')::uuid,
    handling_rate_table_id = nullif(p_quote->>'handling_rate_table_id', '')::uuid,
    policy_version_id = nullif(p_quote->>'policy_version_id', '')::uuid,
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
    grand_total = (p_quote->>'grand_total')::numeric,
    notes = nullif(btrim(coalesce(p_quote->>'notes', '')), '')
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

-- ---------- Teste com um administrador real; desfaz tudo no fim ----------
do $$
declare
  v_admin uuid;
  v_quote record;
  v_items jsonb := '[{"display_order":0,"product_name_snapshot":"Produto teste","weight_kg_snapshot":40,"table_unit_price":10,"quantity":1,"line_discount_percentage":0,"anticipated_discount_percentage":0,"total_discount_percentage":0,"final_unit_price":10,"economy_per_unit":0,"freight_per_unit":0,"handling_per_unit":0,"product_subtotal":10,"freight_subtotal":0,"handling_subtotal":0,"total":10}]';
  v_totals jsonb := '{"product_subtotal":10,"freight_total":0,"handling_total":0,"economy_total":0,"grand_total":10}';
begin
  select id into v_admin from public.profiles where role = 'administrador' and active and not must_change_password limit 1;
  if v_admin is null then return; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select * into v_quote from public.create_quote(v_totals || '{"notes":"  Entrega na semana do dia 20.  "}', v_items);
    if (select notes from public.quotes where id = v_quote.id) is distinct from 'Entrega na semana do dia 20.' then raise exception 'observação não gravada'; end if;
    perform public.update_quote(v_quote.id, v_totals || '{"notes":"Nova observação"}', v_items);
    if (select notes from public.quotes where id = v_quote.id) is distinct from 'Nova observação' then raise exception 'observação não atualizada'; end if;
    perform public.update_quote(v_quote.id, v_totals || '{"notes":"   "}', v_items);
    if (select notes from public.quotes where id = v_quote.id) is not null then raise exception 'observação vazia não foi limpa'; end if;
    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
