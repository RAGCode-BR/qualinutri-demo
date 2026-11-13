begin;

-- Propriedades (fazendas) de um cliente. Clientes são compartilhados entre os
-- comerciais; as propriedades também.
create table public.customer_properties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  city text,
  state char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  notes text,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_properties_customer_idx on public.customer_properties(customer_id) where active;
create index customer_properties_created_by_idx on public.customer_properties(created_by);

create trigger customer_properties_set_updated_at before update on public.customer_properties
  for each row execute function public.set_updated_at();

alter table public.customer_properties enable row level security;

create policy customer_properties_sales_select on public.customer_properties for select to authenticated
  using ((select public.can_manage_sales()));
create policy customer_properties_sales_insert on public.customer_properties for insert to authenticated
  with check ((select public.can_manage_sales()));
create policy customer_properties_sales_update on public.customer_properties for update to authenticated
  using ((select public.can_manage_sales()))
  with check ((select public.can_manage_sales()));

revoke all on table public.customer_properties from anon, authenticated;
grant select, insert, update on table public.customer_properties to authenticated;

-- Visitas: cada linha nasce agendada (planned) ou já realizada (completed),
-- e pode ser marcada como não realizada (not_done).
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  property_id uuid references public.customer_properties(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'completed', 'not_done')),
  scheduled_date date,
  visited_date date,
  developed text,
  visit_types text[] not null default '{}',
  quote_id uuid references public.quotes(id) on delete restrict,
  next_action text,
  not_done_reason text check (not_done_reason is null or not_done_reason in (
    'customer_absent', 'customer_rescheduled', 'customer_emergency', 'seller_emergency', 'other'
  )),
  not_done_note text,
  follow_up_of uuid references public.visits(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visit_types <@ array['relationship', 'prospecting', 'closing', 'technical']::text[]),
  check (status <> 'planned' or scheduled_date is not null),
  check (status <> 'completed' or (
    visited_date is not null
    and length(btrim(coalesce(developed, ''))) > 0
    and cardinality(visit_types) > 0
  )),
  check (status <> 'not_done' or not_done_reason is not null),
  check (not_done_reason is distinct from 'other' or length(btrim(coalesce(not_done_note, ''))) > 0),
  check (quote_id is null or 'closing' = any(visit_types))
);

create index visits_seller_date_idx on public.visits(seller_id, coalesce(visited_date, scheduled_date));
create index visits_customer_idx on public.visits(customer_id, coalesce(visited_date, scheduled_date) desc);
create index visits_property_idx on public.visits(property_id);
create index visits_quote_idx on public.visits(quote_id);
create index visits_follow_up_idx on public.visits(follow_up_of);
create index visits_created_by_idx on public.visits(created_by);
create index visits_updated_by_idx on public.visits(updated_by);

create trigger visits_set_updated_at before update on public.visits
  for each row execute function public.set_updated_at();
create trigger visits_set_updated_by before update on public.visits
  for each row execute function public.set_updated_by();

-- Propriedade e orçamento precisam ser do mesmo cliente da visita; o orçamento
-- não pode estar cancelado. Comercial só agenda para si mesmo.
create or replace function public.validate_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() and new.seller_id is distinct from auth.uid() then
    raise exception 'Você só pode registrar visitas para você mesmo.' using errcode = '42501';
  end if;
  if new.property_id is not null and not exists (
    select 1 from public.customer_properties
    where id = new.property_id and customer_id = new.customer_id
  ) then
    raise exception 'A propriedade escolhida não pertence a este cliente.' using errcode = '22023';
  end if;
  if new.quote_id is not null and not exists (
    select 1 from public.quotes
    where id = new.quote_id and customer_id = new.customer_id and status <> 'cancelled'
  ) then
    raise exception 'O orçamento escolhido não é deste cliente ou está cancelado.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_visit() from public, anon, authenticated;

create trigger visits_validate before insert or update on public.visits
  for each row execute function public.validate_visit();

-- Visitas realizadas ou não realizadas são histórico: não podem ser excluídas.
create or replace function public.protect_visit_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'planned' then
    raise exception 'Visitas já registradas não podem ser excluídas.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.protect_visit_history() from public, anon, authenticated;

create trigger visits_protect_history before delete on public.visits
  for each row execute function public.protect_visit_history();

alter table public.visits enable row level security;

-- Administrador vê e altera tudo; comercial, só as próprias visitas.
create policy visits_select on public.visits for select to authenticated
  using ((select public.is_admin()) or ((select public.can_manage_sales()) and seller_id = (select auth.uid())));
create policy visits_insert on public.visits for insert to authenticated
  with check ((select public.is_admin()) or ((select public.can_manage_sales()) and seller_id = (select auth.uid())));
create policy visits_update on public.visits for update to authenticated
  using ((select public.is_admin()) or ((select public.can_manage_sales()) and seller_id = (select auth.uid())))
  with check ((select public.is_admin()) or ((select public.can_manage_sales()) and seller_id = (select auth.uid())));
-- Só visitas ainda agendadas podem ser excluídas; as realizadas ficam no histórico.
create policy visits_delete on public.visits for delete to authenticated
  using (status = 'planned' and ((select public.is_admin()) or ((select public.can_manage_sales()) and seller_id = (select auth.uid()))));

revoke all on table public.visits from anon, authenticated;
grant select, insert, update, delete on table public.visits to authenticated;

-- Lista de vendedores para o administrador escolher na agenda (só nomes).
create or replace function public.list_sellers()
returns table (id uuid, name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(btrim(p.display_name), ''), p.login), p.role
  from public.profiles p
  where p.active
    and p.role in ('administrador', 'comercial')
    and public.can_manage_sales()
  order by 2
$$;

revoke all on function public.list_sellers() from public, anon, authenticated;
grant execute on function public.list_sellers() to authenticated;

-- Testa as regras como um administrador real e desfaz tudo no fim.
do $$
declare
  v_admin uuid;
  v_customer uuid;
  v_property uuid;
  v_visit uuid;
  v_failed boolean;
begin
  select id into v_admin
  from public.profiles
  where role = 'administrador' and active and not must_change_password
  limit 1;
  if v_admin is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    insert into public.customers (legal_name) values ('Cliente de teste automático') returning id into v_customer;
    insert into public.customer_properties (customer_id, name, city, state)
    values (v_customer, 'Fazenda de teste', 'Juara', 'MT') returning id into v_property;

    insert into public.visits (seller_id, customer_id, property_id, scheduled_date)
    values (v_admin, v_customer, v_property, current_date) returning id into v_visit;

    update public.visits
    set status = 'completed', visited_date = current_date, developed = 'Apresentação da linha mineral',
        visit_types = array['relationship', 'technical'], next_action = 'Retornar com orçamento'
    where id = v_visit;

    -- Realizada sem o que foi feito deve ser recusada.
    v_failed := false;
    begin
      insert into public.visits (seller_id, customer_id, status, visited_date, visit_types)
      values (v_admin, v_customer, 'completed', current_date, array['relationship']);
    exception when check_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'visita realizada sem descrição foi aceita'; end if;

    -- Não realizada com "Outro" e sem descrição deve ser recusada.
    v_failed := false;
    begin
      insert into public.visits (seller_id, customer_id, status, scheduled_date, not_done_reason)
      values (v_admin, v_customer, 'not_done', current_date, 'other');
    exception when check_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'não realizada sem descrição do motivo foi aceita'; end if;

    -- Excluir visita realizada deve ser recusado (só as agendadas podem sair).
    v_failed := false;
    begin
      delete from public.visits where id = v_visit;
    exception when insufficient_privilege then v_failed := true;
    end;
    if not v_failed then raise exception 'visita realizada foi excluída'; end if;

    if not exists (select 1 from public.list_sellers() where id = v_admin) then
      raise exception 'list_sellers não trouxe o administrador';
    end if;

    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
