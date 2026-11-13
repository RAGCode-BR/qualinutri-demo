begin;

-- Valida CPF (11 dígitos) ou CNPJ (14 caracteres, alfanumérico desde 07/2026) e
-- devolve o documento no formato padrão. Mesma regra de
-- src/domain/documents/brazilianDocument.ts.
create or replace function public.normalize_customer_document(p_document text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := regexp_replace(upper(coalesce(p_document, '')), '[^0-9A-Z]', '', 'g');
  v_length integer := length(v_value);
  v_sum integer;
  v_remainder integer;
  v_first integer;
  v_second integer;
  v_cpf_weights integer[] := array[11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  v_cnpj_weights integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  i integer;
begin
  if v_length = 0 then
    return null;
  end if;

  if v_value ~ '^(.)\1*$' then
    raise exception 'Documento inválido. Confira os caracteres digitados.' using errcode = '22023';
  end if;

  if v_length = 11 then
    if v_value !~ '^[0-9]{11}$' then
      raise exception 'CPF inválido. Confira os números digitados.' using errcode = '22023';
    end if;

    v_sum := 0;
    for i in 1..9 loop
      v_sum := v_sum + (ascii(substr(v_value, i, 1)) - 48) * v_cpf_weights[i + 1];
    end loop;
    v_remainder := v_sum % 11;
    v_first := case when v_remainder < 2 then 0 else 11 - v_remainder end;

    v_sum := 0;
    for i in 1..10 loop
      v_sum := v_sum + (ascii(substr(v_value, i, 1)) - 48) * v_cpf_weights[i];
    end loop;
    v_remainder := v_sum % 11;
    v_second := case when v_remainder < 2 then 0 else 11 - v_remainder end;

    if right(v_value, 2) <> v_first::text || v_second::text then
      raise exception 'CPF inválido. Confira os números digitados.' using errcode = '22023';
    end if;

    return substr(v_value, 1, 3) || '.' || substr(v_value, 4, 3) || '.' || substr(v_value, 7, 3) || '-' || substr(v_value, 10, 2);
  end if;

  if v_length = 14 then
    if v_value !~ '^[0-9A-Z]{12}[0-9]{2}$' then
      raise exception 'CNPJ inválido. Confira os caracteres digitados.' using errcode = '22023';
    end if;

    v_sum := 0;
    for i in 1..12 loop
      v_sum := v_sum + (ascii(substr(v_value, i, 1)) - 48) * v_cnpj_weights[i + 1];
    end loop;
    v_remainder := v_sum % 11;
    v_first := case when v_remainder < 2 then 0 else 11 - v_remainder end;

    v_sum := 0;
    for i in 1..13 loop
      v_sum := v_sum + (ascii(substr(v_value, i, 1)) - 48) * v_cnpj_weights[i];
    end loop;
    v_remainder := v_sum % 11;
    v_second := case when v_remainder < 2 then 0 else 11 - v_remainder end;

    if right(v_value, 2) <> v_first::text || v_second::text then
      raise exception 'CNPJ inválido. Confira os caracteres digitados.' using errcode = '22023';
    end if;

    return substr(v_value, 1, 2) || '.' || substr(v_value, 3, 3) || '.' || substr(v_value, 6, 3) || '/' || substr(v_value, 9, 4) || '-' || substr(v_value, 13, 2);
  end if;

  raise exception 'Informe um CPF com 11 dígitos ou um CNPJ com 14 caracteres.' using errcode = '22023';
end;
$$;

-- Só valida quando o cliente é criado ou quando o documento muda. Cadastros
-- antigos fora do padrão continuam editáveis nos demais campos.
create or replace function public.customers_normalize_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.document is not distinct from old.document then
    return new;
  end if;
  new.document := public.normalize_customer_document(new.document);
  return new;
end;
$$;

create trigger customers_normalize_document
  before insert or update of document on public.customers
  for each row execute function public.customers_normalize_document();

revoke all on function public.normalize_customer_document(text) from public, anon;
grant execute on function public.normalize_customer_document(text) to authenticated;
revoke all on function public.customers_normalize_document() from public, anon, authenticated;

-- Conferência da regra no momento da migration: falha e desfaz tudo se o
-- algoritmo divergir dos exemplos conhecidos.
do $$
begin
  if public.normalize_customer_document('52998224725') <> '529.982.247-25'
    or public.normalize_customer_document('11222333000181') <> '11.222.333/0001-81'
    or public.normalize_customer_document('12abc34501de35') <> '12.ABC.345/01DE-35'
    or public.normalize_customer_document('  ') is not null
  then
    raise exception 'normalize_customer_document não confere com os exemplos de referência';
  end if;
end;
$$;

comment on function public.normalize_customer_document(text) is
  'Valida CPF ou CNPJ (inclusive alfanumérico) e devolve o documento formatado; vazio vira null.';

commit;
