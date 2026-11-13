-- "Assistência técnica" deixa de ser um tipo de visita.
-- NOT VALID: visitas antigas com esse tipo continuam como estão (histórico),
-- mas nenhuma visita nova ou editada pode usá-lo.
alter table public.visits
  add constraint visits_no_technical_type
  check (not ('technical' = any(visit_types))) not valid;
