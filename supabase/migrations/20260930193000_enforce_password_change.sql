begin;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and active = true
    and must_change_password = false
$$;

revoke all on function public.current_profile_role() from public, anon, authenticated;
grant execute on function public.current_profile_role() to authenticated;

commit;
