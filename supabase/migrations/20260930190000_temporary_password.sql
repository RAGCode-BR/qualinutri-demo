begin;

alter table public.profiles
  add column must_change_password boolean not null default true;

update public.profiles
set must_change_password = false;

comment on column public.profiles.must_change_password is
  'Bloqueia o acesso à aplicação até a troca da senha temporária.';

commit;
