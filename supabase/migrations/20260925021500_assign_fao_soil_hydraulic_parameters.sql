-- Propiedades hidráulicas iniciales por clase textural.
-- Fuente: FAO AquaCrop Reference Manual, tabla 2.13a.
-- Son valores indicativos; las mediciones locales deben reemplazarlos.

alter table public.soil_profiles
  add column if not exists saturation_vwc double precision,
  add column if not exists saturated_hydraulic_conductivity_mm_day double precision,
  add column if not exists hydraulic_parameter_source text,
  add column if not exists hydraulic_reference text;

with soil_defaults(soil_type, sat, fc, wp, ksat) as (
  values
    ('Arenoso',          0.36::double precision, 0.13::double precision, 0.06::double precision, 1500::double precision),
    ('Arenoso franco',   0.38, 0.16, 0.08, 800),
    ('Franco arenoso',   0.41, 0.22, 0.10, 500),
    ('Franco',           0.46, 0.31, 0.15, 250),
    ('Franco arcilloso', 0.50, 0.39, 0.23, 100)
)
update public.soil_profiles p
set
  saturation_vwc = d.sat,
  field_capacity_vwc = d.fc,
  wilting_point_vwc = d.wp,
  saturated_hydraulic_conductivity_mm_day = d.ksat,
  -- Conserva la política relativa vigente: recargar con 65% del
  -- agua útil remanente y reponer hasta 90% de la capacidad útil.
  target_min_vwc = d.wp + 0.65 * (d.fc - d.wp),
  target_max_vwc = d.wp + 0.90 * (d.fc - d.wp),
  hydraulic_parameter_source = 'fao_aquacrop_texture_default',
  hydraulic_reference = 'FAO AquaCrop Reference Manual, Table 2.13a'
from soil_defaults d
where p.soil_type = d.soil_type;

