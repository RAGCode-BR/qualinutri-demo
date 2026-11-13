begin;

-- Veículos iniciais pelas cargas fechadas da tabela de frete (10, 18 e 28 t).
-- Sem placa e sem medidas do baú; o administrador ajusta em Cargas › Veículos.
insert into public.vehicles (name, capacity_kg)
select seed.name, seed.capacity_kg
from (values
  ('Caminhão 10 t', 10000),
  ('Caminhão 18 t', 18000),
  ('Caminhão 28 t', 28000)
) as seed(name, capacity_kg)
where not exists (
  select 1 from public.vehicles where vehicles.name = seed.name and vehicles.active
);

commit;
