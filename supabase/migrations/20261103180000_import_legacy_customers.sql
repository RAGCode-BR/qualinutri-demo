begin;

-- Cada código do relatório representa um cadastro próprio, inclusive quando
-- mais de um cadastro usa o mesmo CPF/CNPJ. O PDF original fica fora do Git.
alter table public.customers
  add column legacy_code text unique,
  add column legacy_details jsonb;

alter table public.customers
  add constraint customers_legacy_details_object
  check (legacy_details is null or jsonb_typeof(legacy_details) = 'object');

drop index public.customers_document_active_unique;

-- Cadastros manuais continuam únicos. As duplicidades do legado permanecem
-- identificadas pelo código próprio, sem suprimir clientes do relatório.
create unique index customers_manual_document_active_unique
  on public.customers(document)
  where document is not null and active and legacy_code is null;

create or replace function public.customers_check_document_duplicate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document is null or not new.active then return new; end if;

  if tg_op = 'INSERT' and new.legacy_code is not null then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Somente administradores podem inserir um código legado.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.document is not distinct from old.document
    and new.active is not distinct from old.active then
    return new;
  end if;

  if exists (
    select 1 from public.customers existing
    where existing.id is distinct from new.id
      and existing.active
      and existing.document = new.document
  ) then
    raise exception 'Já existe um cliente ativo com este CPF/CNPJ.' using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.customers_check_document_duplicate() from public, anon, authenticated;

create trigger customers_validate_document_duplicate
  before insert or update of document, active, legacy_code on public.customers
  for each row execute function public.customers_check_document_duplicate();

commit;
