begin;

-- O código original e os dados do cadastro antigo identificam o cliente no
-- relatório importado. Só o administrador altera esses campos.
create or replace function public.protect_legacy_customer_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.legacy_code is not null or new.legacy_details is not null then
      raise exception 'Somente administradores podem informar dados do cadastro antigo.' using errcode = '42501';
    end if;
  elsif new.legacy_code is distinct from old.legacy_code or new.legacy_details is distinct from old.legacy_details then
    raise exception 'Somente administradores podem alterar o código original do cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_legacy_customer_fields() from public, anon, authenticated;

create trigger customers_protect_legacy_fields
  before insert or update on public.customers
  for each row execute function public.protect_legacy_customer_fields();

-- Nenhuma visita usa mais "Assistência técnica": a regra passa a valer para todas.
alter table public.visits validate constraint visits_no_technical_type;

-- ---------- Teste com os usuários reais; desfaz tudo no fim ----------
do $$
declare
  v_seller uuid;
  v_customer uuid;
  v_failed boolean;
begin
  select id into v_seller from public.profiles where role = 'comercial' and active and not must_change_password limit 1;
  select id into v_customer from public.customers where legacy_code is not null and active limit 1;
  if v_seller is null or v_customer is null then return; end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);

    -- Comercial edita o cliente importado normalmente...
    update public.customers set notes = 'teste' where id = v_customer;

    -- ...mas não troca o código original nem os dados do cadastro antigo.
    v_failed := false;
    begin update public.customers set legacy_code = 'X-teste' where id = v_customer;
    exception when insufficient_privilege then v_failed := true; end;
    if not v_failed then raise exception 'comercial alterou o código original'; end if;

    v_failed := false;
    begin update public.customers set legacy_details = '{}' where id = v_customer;
    exception when insufficient_privilege then v_failed := true; end;
    if not v_failed then raise exception 'comercial alterou os dados do cadastro antigo'; end if;

    v_failed := false;
    begin insert into public.customers (legal_name, legacy_details) values ('Teste', '{"x": "y"}');
    exception when insufficient_privilege then v_failed := true; end;
    if not v_failed then raise exception 'comercial inseriu dados do cadastro antigo'; end if;

    raise exception using errcode = 'P0001', message = 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

commit;
