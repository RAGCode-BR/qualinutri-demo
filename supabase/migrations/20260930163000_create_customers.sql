begin;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) > 0),
  trade_name text,
  document text,
  phone text,
  email text,
  address jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (address is null or jsonb_typeof(address) = 'object')
);

create index customers_legal_name_idx on public.customers(legal_name);
create index customers_active_legal_name_idx on public.customers(active, legal_name);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
revoke all on table public.customers from anon, authenticated;

alter table public.quotes
  add column customer_id uuid references public.customers(id) on delete restrict,
  add column customer_name_snapshot text,
  add column customer_document_snapshot text;

create index quotes_customer_id_idx on public.quotes(customer_id);

create or replace function public.create_quote(
  p_quote jsonb,
  p_items jsonb
)
returns table (id uuid, quote_number bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_quote_number bigint;
begin
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
    coalesce(p_quote->>'status', 'draft'),
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

commit;
