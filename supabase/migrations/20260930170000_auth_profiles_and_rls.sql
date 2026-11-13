begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'consulta' check (role in ('administrador', 'comercial', 'consulta')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_active_idx on public.profiles(role, active);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid()) and active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'administrador', false)
$$;

create or replace function public.can_manage_sales()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() in ('administrador', 'comercial'), false)
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first_profile boolean;
begin
  perform pg_advisory_xact_lock(hashtext('qualinutri-first-profile'));
  select not exists (select 1 from public.profiles) into is_first_profile;

  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    case when is_first_profile then 'administrador' else 'consulta' end,
    is_first_profile
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

with ranked_users as (
  select id, coalesce(email, '') as email,
    nullif(raw_user_meta_data->>'display_name', '') as display_name,
    row_number() over (order by created_at, id) as position
  from auth.users
)
insert into public.profiles (id, email, display_name, role, active)
select id, email, display_name,
  case when position = 1 then 'administrador' else 'consulta' end,
  position = 1
from ranked_users
on conflict (id) do nothing;

alter table public.customers
  add column created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column updated_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.quotes
  add column created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column updated_by uuid default auth.uid() references auth.users(id) on delete set null;

create index customers_created_by_idx on public.customers(created_by);
create index quotes_created_by_idx on public.quotes(created_by);

create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger customers_set_updated_by before update on public.customers
  for each row execute function public.set_updated_by();
create trigger quotes_set_updated_by before update on public.quotes
  for each row execute function public.set_updated_by();

create policy profiles_read_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_admin_read_all
  on public.profiles for select to authenticated
  using ((select public.is_admin()));
create policy profiles_admin_update
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy product_categories_read on public.product_categories for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy products_read on public.products for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy payment_terms_read on public.payment_terms for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy price_tables_read on public.price_tables for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy product_prices_read on public.product_prices for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy discount_tables_read on public.discount_tables for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy discount_rules_read on public.discount_rules for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy freight_tables_read on public.freight_tables for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy freight_zones_read on public.freight_zones for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy freight_rates_read on public.freight_rates for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy handling_rate_tables_read on public.handling_rate_tables for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy commercial_policy_versions_read on public.commercial_policy_versions for select to authenticated
  using ((select public.current_profile_role()) is not null);
create policy commercial_policy_sections_read on public.commercial_policy_sections for select to authenticated
  using ((select public.current_profile_role()) is not null);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'product_categories', 'products', 'payment_terms', 'price_tables', 'product_prices',
    'discount_tables', 'discount_rules', 'freight_tables', 'freight_zones', 'freight_rates',
    'handling_rate_tables', 'commercial_policy_versions', 'commercial_policy_sections'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
      table_name || '_admin_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      table_name || '_admin_update', table_name
    );
  end loop;
end;
$$;

create policy customers_sales_select on public.customers for select to authenticated
  using ((select public.can_manage_sales()));
create policy customers_sales_insert on public.customers for insert to authenticated
  with check ((select public.can_manage_sales()));
create policy customers_sales_update on public.customers for update to authenticated
  using ((select public.can_manage_sales()))
  with check ((select public.can_manage_sales()));

create policy quotes_sales_select on public.quotes for select to authenticated
  using ((select public.can_manage_sales()));
create policy quotes_sales_insert on public.quotes for insert to authenticated
  with check ((select public.can_manage_sales()));
create policy quotes_sales_update on public.quotes for update to authenticated
  using ((select public.can_manage_sales()))
  with check ((select public.can_manage_sales()));
create policy quote_items_sales_select on public.quote_items for select to authenticated
  using ((select public.can_manage_sales()));
create policy quote_items_sales_insert on public.quote_items for insert to authenticated
  with check ((select public.can_manage_sales()));

grant select on table
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
to authenticated;

grant insert, update on table
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
to authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.customers, public.quotes to authenticated;
grant select, insert on table public.quote_items to authenticated;
grant usage, select on sequence public.quotes_quote_number_seq to authenticated;
grant execute on function public.create_quote(jsonb, jsonb) to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_manage_sales() to authenticated;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.set_updated_by() from public, anon, authenticated;

commit;
