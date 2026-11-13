begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  code text not null unique,
  name text not null,
  package_weight_kg numeric(12,3) not null check (package_weight_kg > 0),
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products(category_id);

create table public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text not null,
  average_days integer not null check (average_days >= 0),
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  version text not null,
  effective_from date not null,
  effective_until date,
  status text not null check (status in ('draft', 'active', 'expired', 'archived')),
  notes text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  check (effective_until is null or effective_until >= effective_from)
);

create unique index one_active_price_table
  on public.price_tables ((status)) where status = 'active';

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  price_table_id uuid not null references public.price_tables(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  payment_term_id uuid not null references public.payment_terms(id) on delete restrict,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (price_table_id, product_id, payment_term_id)
);

create index product_prices_product_id_idx on public.product_prices(product_id);
create index product_prices_payment_term_id_idx on public.product_prices(payment_term_id);

create table public.discount_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  version text not null,
  effective_from date not null,
  effective_until date,
  status text not null check (status in ('draft', 'active', 'expired', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  check (effective_until is null or effective_until >= effective_from)
);

create unique index one_active_discount_table
  on public.discount_tables ((status)) where status = 'active';

create table public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  discount_table_id uuid not null references public.discount_tables(id) on delete restrict,
  code text not null,
  name text not null,
  percentage numeric(7,4) check (percentage is null or percentage >= 0),
  allows_custom_percentage boolean not null default false,
  rule_kind text not null check (rule_kind in ('line', 'anticipated', 'custom')),
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (discount_table_id, code),
  check (allows_custom_percentage or percentage is not null),
  check ((rule_kind = 'custom') = allows_custom_percentage)
);

create index discount_rules_discount_table_id_idx on public.discount_rules(discount_table_id);

create table public.freight_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  scope_type text not null check (scope_type in ('distance', 'location')),
  version text not null,
  effective_from date not null,
  effective_until date,
  status text not null check (status in ('draft', 'active', 'expired', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  check (effective_until is null or effective_until >= effective_from)
);

create unique index one_active_freight_table_per_code
  on public.freight_tables(code) where status = 'active';

create table public.freight_zones (
  id uuid primary key default gen_random_uuid(),
  freight_table_id uuid not null references public.freight_tables(id) on delete restrict,
  code text not null,
  label text not null,
  minimum_distance_km numeric(10,2) check (minimum_distance_km is null or minimum_distance_km >= 0),
  maximum_distance_km numeric(10,2) check (maximum_distance_km is null or maximum_distance_km >= 0),
  minimum_weight_kg numeric(12,3) check (minimum_weight_kg is null or minimum_weight_kg > 0),
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (freight_table_id, code),
  check (
    minimum_distance_km is null
    or maximum_distance_km is null
    or maximum_distance_km >= minimum_distance_km
  )
);

create index freight_zones_freight_table_id_idx on public.freight_zones(freight_table_id);

create table public.freight_rates (
  id uuid primary key default gen_random_uuid(),
  freight_zone_id uuid not null references public.freight_zones(id) on delete restrict,
  load_type text not null check (load_type in ('fractional', 'closed')),
  rate_basis text not null check (rate_basis in ('per_bag', 'per_ton')),
  bag_weight_kg numeric(12,3),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique nulls not distinct (freight_zone_id, load_type, rate_basis, bag_weight_kg),
  check (
    (rate_basis = 'per_bag' and bag_weight_kg is not null and bag_weight_kg > 0)
    or (rate_basis = 'per_ton' and bag_weight_kg is null)
  )
);

create index freight_rates_freight_zone_id_idx on public.freight_rates(freight_zone_id);

create table public.handling_rate_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  version text not null,
  amount_per_ton numeric(12,2) not null check (amount_per_ton >= 0),
  effective_from date not null,
  effective_until date,
  status text not null check (status in ('draft', 'active', 'expired', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  check (effective_until is null or effective_until >= effective_from)
);

create unique index one_active_handling_table_per_code
  on public.handling_rate_tables(code) where status = 'active';

create table public.commercial_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  effective_from date,
  effective_until date,
  status text not null check (status in ('draft', 'active', 'expired', 'archived')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create unique index one_active_commercial_policy
  on public.commercial_policy_versions ((status)) where status = 'active';

create table public.commercial_policy_sections (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null references public.commercial_policy_versions(id) on delete restrict,
  section_number text not null,
  title text not null,
  content text not null,
  is_pending boolean not null default false,
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  unique (policy_version_id, section_number)
);

create index commercial_policy_sections_policy_version_id_idx
  on public.commercial_policy_sections(policy_version_id);

create trigger product_categories_set_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger payment_terms_set_updated_at before update on public.payment_terms
  for each row execute function public.set_updated_at();
create trigger price_tables_set_updated_at before update on public.price_tables
  for each row execute function public.set_updated_at();
create trigger discount_tables_set_updated_at before update on public.discount_tables
  for each row execute function public.set_updated_at();
create trigger freight_tables_set_updated_at before update on public.freight_tables
  for each row execute function public.set_updated_at();
create trigger handling_rate_tables_set_updated_at before update on public.handling_rate_tables
  for each row execute function public.set_updated_at();
create trigger commercial_policy_versions_set_updated_at before update on public.commercial_policy_versions
  for each row execute function public.set_updated_at();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.payment_terms enable row level security;
alter table public.price_tables enable row level security;
alter table public.product_prices enable row level security;
alter table public.discount_tables enable row level security;
alter table public.discount_rules enable row level security;
alter table public.freight_tables enable row level security;
alter table public.freight_zones enable row level security;
alter table public.freight_rates enable row level security;
alter table public.handling_rate_tables enable row level security;
alter table public.commercial_policy_versions enable row level security;
alter table public.commercial_policy_sections enable row level security;

revoke all on table
  public.product_categories,
  public.products,
  public.payment_terms,
  public.price_tables,
  public.product_prices,
  public.discount_tables,
  public.discount_rules,
  public.freight_tables,
  public.freight_zones,
  public.freight_rates,
  public.handling_rate_tables,
  public.commercial_policy_versions,
  public.commercial_policy_sections
from anon, authenticated;

commit;
