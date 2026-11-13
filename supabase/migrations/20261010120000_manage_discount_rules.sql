begin;

-- Histórico de criação, edição e exclusão de linhas de desconto.
create table public.discount_change_log (
  id uuid primary key default gen_random_uuid(),
  discount_rule_id uuid not null references public.discount_rules(id) on delete restrict,
  action text not null check (action in ('insert', 'update')),
  previous_values jsonb,
  new_values jsonb not null,
  changed_by uuid default auth.uid() references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index discount_change_log_rule_idx on public.discount_change_log(discount_rule_id, changed_at desc);
create index discount_change_log_changed_by_idx on public.discount_change_log(changed_by);

alter table public.discount_change_log enable row level security;

create policy discount_change_log_admin_read on public.discount_change_log for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.discount_change_log from anon, authenticated;
grant select on table public.discount_change_log to authenticated;

create or replace function public.log_discount_rule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) is not distinct from to_jsonb(new) then
    return new;
  end if;
  insert into public.discount_change_log (discount_rule_id, action, previous_values, new_values, changed_by)
  values (
    new.id,
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.log_discount_rule_change() from public, anon, authenticated;

create trigger discount_rules_log_change after insert or update on public.discount_rules
  for each row execute function public.log_discount_rule_change();

-- Cria (p_rule_id nulo) ou edita uma linha de desconto da tabela vigente.
-- Linhas novas entram depois das existentes e antes de "personalizado".
create or replace function public.save_discount_rule(
  p_rule_id uuid,
  p_name text,
  p_percentage numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_table_id uuid;
  v_rule_id uuid;
  v_order integer;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar descontos.' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Informe uma descrição com até 120 caracteres.' using errcode = '22023';
  end if;
  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then
    raise exception 'O desconto deve estar entre 0%% e 100%%.' using errcode = '22023';
  end if;

  select id into v_table_id from public.discount_tables where status = 'active';
  if v_table_id is null then
    raise exception 'Não há tabela de descontos vigente.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.discount_rules
    where discount_table_id = v_table_id
      and active
      and rule_kind in ('line', 'custom')
      and lower(name) = lower(v_name)
      and id is distinct from p_rule_id
  ) then
    raise exception 'Já existe uma linha de desconto com essa descrição.' using errcode = '23505';
  end if;

  if p_rule_id is null then
    select coalesce(max(display_order), -1) + 1 into v_order
    from public.discount_rules
    where discount_table_id = v_table_id and rule_kind = 'line';

    update public.discount_rules
    set display_order = display_order + 1
    where discount_table_id = v_table_id
      and rule_kind <> 'line'
      and display_order >= v_order;

    insert into public.discount_rules (
      discount_table_id, code, name, percentage, allows_custom_percentage, rule_kind, display_order
    ) values (
      v_table_id,
      'linha-' || replace(gen_random_uuid()::text, '-', ''),
      v_name,
      round(p_percentage, 4),
      false,
      'line',
      v_order
    )
    returning id into v_rule_id;
    return v_rule_id;
  end if;

  update public.discount_rules
  set name = v_name,
      percentage = round(p_percentage, 4)
  where id = p_rule_id
    and discount_table_id = v_table_id
    and rule_kind = 'line'
    and active
  returning id into v_rule_id;

  if v_rule_id is null then
    raise exception 'Linha de desconto não encontrada.' using errcode = 'P0002';
  end if;
  return v_rule_id;
end;
$$;

-- Exclusão lógica: a linha some da tabela e da calculadora, mas o registro fica.
create or replace function public.deactivate_discount_rule(p_rule_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem alterar descontos.' using errcode = '42501';
  end if;

  update public.discount_rules
  set active = false
  where id = p_rule_id
    and rule_kind = 'line'
    and active;
  if not found then
    raise exception 'Linha de desconto não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_discount_rule(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.deactivate_discount_rule(uuid) from public, anon, authenticated;
grant execute on function public.save_discount_rule(uuid, text, numeric) to authenticated;
grant execute on function public.deactivate_discount_rule(uuid) to authenticated;

-- Executa criar, editar e excluir como um administrador real e desfaz tudo no
-- fim. Falha a migration se o SQL das funções tiver erro.
do $$
declare
  v_admin uuid;
  v_rule uuid;
  v_custom_last boolean;
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
    v_rule := public.save_discount_rule(null, 'Teste automático da migration', 5);
    perform public.save_discount_rule(v_rule, 'Teste automático da migration (editado)', 6.5);

    select bool_and(custom.display_order > line.display_order) into v_custom_last
    from public.discount_rules as line
    cross join public.discount_rules as custom
    where line.discount_table_id = custom.discount_table_id
      and line.rule_kind = 'line'
      and custom.rule_kind = 'custom'
      and line.active and custom.active;
    if not v_custom_last then
      raise exception 'linha personalizada deixou de ser a última';
    end if;

    perform public.deactivate_discount_rule(v_rule);
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
