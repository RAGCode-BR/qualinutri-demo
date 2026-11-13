begin;

-- Regrava cabeçalho e itens de um orçamento existente na mesma transação,
-- mantendo número, situação e datas de andamento. Orçamentos cancelados não
-- podem ser editados. Roda como definer porque usuários não têm permissão de
-- apagar itens diretamente; o acesso é conferido por can_manage_sales().
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

  select quotes.status, quotes.quote_number into v_status, v_quote_number
  from public.quotes
  where quotes.id = p_quote_id
  for update;

  if v_status is null then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Orçamentos cancelados não podem ser editados.' using errcode = '22023';
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

comment on function public.update_quote(uuid, jsonb, jsonb) is
  'Atualiza cabeçalho e itens de um orçamento não cancelado, mantendo número e situação.';

commit;
