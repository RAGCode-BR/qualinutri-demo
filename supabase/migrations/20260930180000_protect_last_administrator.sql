begin;

create or replace function public.protect_last_active_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'administrador'
    and old.active = true
    and (
      tg_op = 'DELETE'
      or new.role <> 'administrador'
      or new.active = false
    )
    and not exists (
      select 1
      from public.profiles
      where id <> old.id
        and role = 'administrador'
        and active = true
    )
  then
    raise exception 'O sistema deve manter ao menos um administrador ativo.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_active_administrator
  before update of role, active or delete on public.profiles
  for each row execute function public.protect_last_active_administrator();

revoke all on function public.protect_last_active_administrator() from public, anon, authenticated;

commit;
