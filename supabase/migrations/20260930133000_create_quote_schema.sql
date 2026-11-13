begin;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint generated always as identity unique,
  status text not null default 'draft' check (status in ('draft', 'issued', 'approved', 'cancelled', 'expired')),
  price_table_id uuid references public.price_tables(id) on delete restrict,
  discount_table_id uuid references public.discount_tables(id) on delete restrict,
  freight_table_id uuid references public.freight_tables(id) on delete restrict,
  handling_rate_table_id uuid references public.handling_rate_tables(id) on delete restrict,
  policy_version_id uuid references public.commercial_policy_versions(id) on delete restrict,
  calculation_version text not null default 'legacy-html-v1',
  anticipated_payment boolean not null default false,
  anticipated_discount_percentage numeric(7,4) not null default 0,
  freight_table_name_snapshot text,
  freight_zone_snapshot text,
  load_type_snapshot text check (load_type_snapshot is null or load_type_snapshot in ('fractional', 'closed')),
  handling_rate_per_ton_snapshot numeric(12,2) not null default 0,
  product_subtotal numeric(16,6) not null,
  freight_total numeric(16,6) not null,
  handling_total numeric(16,6) not null,
  economy_total numeric(16,6) not null,
  grand_total numeric(16,6) not null,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anticipated_discount_percentage >= 0),
  check (handling_rate_per_ton_snapshot >= 0),
  check (status = 'cancelled' or cancelled_at is null)
);

create index quotes_status_created_at_idx on public.quotes(status, created_at desc);
create index quotes_price_table_id_idx on public.quotes(price_table_id);
create index quotes_discount_table_id_idx on public.quotes(discount_table_id);
create index quotes_freight_table_id_idx on public.quotes(freight_table_id);
create index quotes_handling_rate_table_id_idx on public.quotes(handling_rate_table_id);
create index quotes_policy_version_id_idx on public.quotes(policy_version_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  display_order integer not null check (display_order >= 0),
  product_id uuid references public.products(id) on delete restrict,
  payment_term_id uuid references public.payment_terms(id) on delete restrict,
  discount_rule_id uuid references public.discount_rules(id) on delete restrict,
  product_name_snapshot text not null,
  category_name_snapshot text,
  weight_kg_snapshot numeric(12,3) not null check (weight_kg_snapshot > 0),
  payment_term_snapshot text,
  table_unit_price numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  line_discount_percentage numeric(7,4) not null,
  anticipated_discount_percentage numeric(7,4) not null,
  total_discount_percentage numeric(7,4) not null,
  final_unit_price numeric(16,6) not null,
  economy_per_unit numeric(16,6) not null,
  freight_per_unit numeric(16,6) not null,
  handling_per_unit numeric(16,6) not null,
  product_subtotal numeric(16,6) not null,
  freight_subtotal numeric(16,6) not null,
  handling_subtotal numeric(16,6) not null,
  total numeric(16,6) not null,
  created_at timestamptz not null default now(),
  unique (quote_id, display_order),
  check (anticipated_discount_percentage >= 0),
  check (freight_per_unit >= 0),
  check (handling_per_unit >= 0),
  check (freight_subtotal >= 0),
  check (handling_subtotal >= 0)
);

create index quote_items_quote_id_idx on public.quote_items(quote_id);
create index quote_items_product_id_idx on public.quote_items(product_id);
create index quote_items_payment_term_id_idx on public.quote_items(payment_term_id);
create index quote_items_discount_rule_id_idx on public.quote_items(discount_rule_id);

create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

revoke all on table public.quotes, public.quote_items from anon, authenticated;
revoke all on sequence public.quotes_quote_number_seq from anon, authenticated;

commit;
