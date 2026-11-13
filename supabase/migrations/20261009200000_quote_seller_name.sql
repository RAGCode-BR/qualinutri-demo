begin;

-- Nome de quem criou o orçamento, para o PDF. Usuários comerciais não leem
-- perfis de outras pessoas, então a função expõe apenas o nome, e só para
-- quem já tem acesso aos orçamentos.
create or replace function public.quote_seller_name(p_quote_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.can_manage_sales() then
    raise exception 'Acesso não permitido.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), profile.login)
  into v_name
  from public.quotes as quote
  join public.profiles as profile on profile.id = quote.created_by
  where quote.id = p_quote_id;

  return v_name;
end;
$$;

revoke all on function public.quote_seller_name(uuid) from public, anon, authenticated;
grant execute on function public.quote_seller_name(uuid) to authenticated;

commit;
