alter table public.soil_profiles
  drop constraint if exists soil_profiles_kc_override_dates_check;

alter table public.soil_profiles
  add constraint soil_profiles_kc_override_dates_check
  check (
    current_kc is null
    or (
      kc_override_start_date is not null
      and kc_override_end_date is not null
      and kc_override_start_date <= kc_override_end_date
    )
  );
