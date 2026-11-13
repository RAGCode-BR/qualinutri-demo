begin;

-- A calculadora permite preço manual. O banco valida a aritmética recebida,
-- inclusive quando a RPC é chamada diretamente fora da interface.
create or replace function public.validate_quote_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_item public.quote_items%rowtype;
  v_quote_id uuid;
  v_count integer := 0;
  v_quantity integer := 0;
  v_products numeric := 0;
  v_freight numeric := 0;
  v_handling numeric := 0;
  v_economy numeric := 0;
  v_expected numeric;
  v_tolerance numeric;
begin
  if tg_table_name = 'quotes' then
    v_quote_id := new.id;
    if tg_op = 'UPDATE' then
      if new.product_subtotal is not distinct from old.product_subtotal
        and new.freight_total is not distinct from old.freight_total
        and new.handling_total is not distinct from old.handling_total
        and new.economy_total is not distinct from old.economy_total
        and new.grand_total is not distinct from old.grand_total then
        return new;
      end if;
    end if;
  else
    if tg_op = 'DELETE' then
      v_quote_id := old.quote_id;
    else
      v_quote_id := new.quote_id;
    end if;
  end if;

  select * into v_quote from public.quotes where id = v_quote_id;
  if not found then return null; end if;

  for v_item in select * from public.quote_items where quote_id = v_quote_id loop
    v_count := v_count + 1;
    v_quantity := v_quantity + v_item.quantity;
    v_tolerance := 0.000002 * (v_item.quantity + 1);
    if v_item.table_unit_price < 0
      or v_item.line_discount_percentage < 0
      or v_item.total_discount_percentage > 100
      or v_item.anticipated_discount_percentage <> (case when v_quote.anticipated_payment then 1.5 else 0 end)
      or abs(v_item.total_discount_percentage - v_item.line_discount_percentage - v_item.anticipated_discount_percentage) > 0.000001
      or v_item.freight_per_unit < 0 or v_item.handling_per_unit < 0 then
      raise exception 'Valores ou descontos inválidos no orçamento.' using errcode = '22023';
    end if;
    v_expected := v_item.table_unit_price * (1 - v_item.total_discount_percentage / 100);
    if abs(v_item.final_unit_price - v_expected) > 0.000002
      or abs(v_item.economy_per_unit - (v_item.table_unit_price - v_expected)) > 0.000002
      or abs(v_item.product_subtotal - v_expected * v_item.quantity) > v_tolerance
      or abs(v_item.freight_subtotal - v_item.freight_per_unit * v_item.quantity) > v_tolerance
      or abs(v_item.handling_subtotal - v_item.handling_per_unit * v_item.quantity) > v_tolerance
      or abs(v_item.total - v_item.product_subtotal - v_item.freight_subtotal - v_item.handling_subtotal) > 0.000005 then
      raise exception 'Os valores dos itens não conferem com o cálculo do orçamento.' using errcode = '22023';
    end if;
    v_products := v_products + v_item.product_subtotal;
    v_freight := v_freight + v_item.freight_subtotal;
    v_handling := v_handling + v_item.handling_subtotal;
    v_economy := v_economy + v_item.economy_per_unit * v_item.quantity;
  end loop;

  if v_count = 0 then
    raise exception 'O orçamento precisa ter pelo menos um item.' using errcode = '22023';
  end if;
  v_tolerance := 0.000002 * (v_quantity + v_count + 1);
  if abs(v_quote.product_subtotal - v_products) > v_tolerance
    or abs(v_quote.freight_total - v_freight) > v_tolerance
    or abs(v_quote.handling_total - v_handling) > v_tolerance
    or abs(v_quote.economy_total - v_economy) > v_tolerance
    or abs(v_quote.grand_total - v_products - v_freight - v_handling) > v_tolerance then
    raise exception 'O total do orçamento não confere com seus itens.' using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke all on function public.validate_quote_amounts() from public, anon, authenticated;

create constraint trigger quotes_validate_amounts
  after insert or update on public.quotes
  deferrable initially deferred
  for each row execute function public.validate_quote_amounts();

create constraint trigger quote_items_validate_amounts
  after insert or update or delete on public.quote_items
  deferrable initially deferred
  for each row execute function public.validate_quote_amounts();

-- A edição também atualiza as referências às tabelas usadas no novo cálculo.
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

commit;
