-- Motor hídrico V2: normaliza la bajada observada por la sonda contra
-- la ETc del mismo período. Es una migración aditiva y conserva todos
-- los modelos/calibraciones existentes.
alter table public.soil_behavior_models
  add column if not exists etc_correction_factor double precision,
  add column if not exists recharge_sample_count integer,
  add column if not exists depletion_sample_count integer;

comment on column public.soil_behavior_models.etc_correction_factor is
  'Mediana acotada de agotamiento observado / ETc para días sin entradas de agua.';
