begin;

alter table public.quotes
  add column issued_at timestamptz,
  add column approved_at timestamptz;

-- Andamento do orçamento: rascunho -> enviado (issued) -> aprovado.
-- Qualquer situação ativa pode ser cancelada; cancelado é definitivo.
create or replace function public.enforce_quote_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    new.issued_at := coalesce(new.issued_at, now());
  elsif old.status = 'issued' and new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
  elsif old.status in ('draft', 'issued', 'approved') and new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    raise exception 'Mudança de situação não permitida: % para %.', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_quote_status_flow() from public, anon, authenticated;

create trigger quotes_enforce_status_flow
  before update of status on public.quotes
  for each row execute function public.enforce_quote_status_flow();

commit;
