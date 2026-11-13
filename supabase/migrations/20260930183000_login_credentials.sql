begin;

alter table public.profiles add column login text;

update public.profiles as profile
set login = lower(coalesce(
  nullif(trim(auth_user.raw_user_meta_data->>'login'), ''),
  split_part(profile.email, '@', 1)
))
from auth.users as auth_user
where auth_user.id = profile.id;

alter table public.profiles
  alter column login set not null,
  add constraint profiles_login_format_check
    check (login ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

create unique index profiles_login_key on public.profiles(login);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first_profile boolean;
  requested_login text;
begin
  requested_login := lower(nullif(trim(new.raw_user_meta_data->>'login'), ''));

  if requested_login is null
    or requested_login !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
    or lower(coalesce(new.email, '')) <> requested_login || '@login.qualinutri.invalid'
  then
    raise exception 'Login inválido.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('qualinutri-first-profile'));
  select not exists (select 1 from public.profiles) into is_first_profile;

  insert into public.profiles (id, email, login, display_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    requested_login,
    nullif(new.raw_user_meta_data->>'display_name', ''),
    case when is_first_profile then 'administrador' else 'consulta' end,
    is_first_profile
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

commit;
