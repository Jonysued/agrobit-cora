// Kc dinámico por cultivo, edad del monte y fecha fenológica.
// Las curvas representan un monte adulto y se interpolan diariamente
// entre anclas del día 15 para evitar saltos al cambiar de mes.

const ADULT_KC = {
  granadas: [0.74, 0.78, 0.72, 0.52, 0.30, 0.18, 0.15, 0.18, 0.27, 0.42, 0.57, 0.67],
  olivos: [0.62, 0.66, 0.66, 0.60, 0.50, 0.43, 0.40, 0.40, 0.50, 0.60, 0.68, 0.68],
};

const normalize = value => (value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim();
const round3 = value => Math.round(value * 1000) / 1000;
const iso = date => date.toISOString().slice(0, 10);

function cropKey(crop) {
  const value = normalize(crop);
  if (value.includes('gran')) return 'granadas';
  if (value.includes('oli')) return 'olivos';
  return null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftedDate(value, delayDays = 0) {
  const date = parseDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() - Number(delayDays || 0));
  return date;
}

function dateInRange(value, start, end) {
  if (!value) return false;
  return (!start || value >= start) && (!end || value <= end);
}

function activeDelay(profile, date) {
  const delay = Number(profile?.phenology_delay_days || 0);
  if (!delay || !dateInRange(date, profile?.phenology_delay_start_date, profile?.phenology_delay_end_date)) return 0;
  return delay;
}

function plantingYear(lot) {
  const value = lot?.planting_year ?? lot?.year_planted ?? lot?.plantation_year;
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function ageAt(lot, date) {
  const year = plantingYear(lot);
  return year == null || !date ? null : Math.max(0, date.getUTCFullYear() - year);
}

function factorForAge(age) {
  if (age == null) return 1;
  if (age <= 0) return 0.25;
  if (age === 1) return 0.40;
  if (age === 2) return 0.60;
  if (age === 3) return 0.80;
  return 1;
}

function adultKcForDate(key, date) {
  const table = ADULT_KC[key];
  if (!table || !date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const anchor = new Date(Date.UTC(year, month, 15, 12));
  let fromMonth = month;
  let toMonth;
  let from;
  let to;
  if (date >= anchor) {
    toMonth = (month + 1) % 12;
    from = anchor;
    to = new Date(Date.UTC(year, month + 1, 15, 12));
  } else {
    fromMonth = (month + 11) % 12;
    toMonth = month;
    from = new Date(Date.UTC(year, month - 1, 15, 12));
    to = anchor;
  }
  const progress = (date - from) / (to - from);
  return round3(table[fromMonth] + ((table[toMonth] - table[fromMonth]) * progress));
}

function monthDay(date) {
  return (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function stageFor(key, date) {
  const md = monthDay(date);
  if (key === 'granadas') {
    if (md >= 615 && md <= 831) return 'Reposo invernal';
    if (md >= 901 && md <= 1015) return 'Brotación y desarrollo vegetativo';
    if (md >= 1016 && md <= 1130) return 'Floración y cuaje';
    if (md >= 1201 || md <= 215) return 'Crecimiento de fruto';
    if (md <= 331) return 'Maduración';
    if (md <= 430) return 'Cosecha y poscosecha';
    return 'Senescencia y caída de hojas';
  }
  if (key === 'olivos') {
    if (md >= 701 && md <= 831) return 'Reposo';
    if (md >= 901 && md <= 1015) return 'Brotación e inflorescencias';
    if (md >= 1016 && md <= 1130) return 'Floración y cuaje';
    if (md >= 1201 || md <= 228) return 'Crecimiento de fruto';
    if (md <= 430) return 'Maduración y acumulación de aceite';
    return 'Cosecha y poscosecha';
  }
  return null;
}

function manualOverride(profile, date) {
  if (profile?.current_kc == null || !profile.kc_override_start_date || !profile.kc_override_end_date) return null;
  const active = dateInRange(date, profile.kc_override_start_date, profile.kc_override_end_date);
  return active ? Number(profile.current_kc) : null;
}

export const kcService = {
  hasMonthlyKc(crop) { return cropKey(crop) != null; },

  kcForCropMonth(crop, monthIdx) {
    const key = cropKey(crop);
    if (!key || monthIdx == null || monthIdx < 0 || monthIdx > 11) return null;
    return ADULT_KC[key][monthIdx];
  },

  kcForCropDate(crop, isoDate) {
    const key = cropKey(crop);
    return key ? adultKcForDate(key, parseDate(isoDate)) : null;
  },

  detailsForLotDate(lot, isoDate, profile = {}) {
    const key = cropKey(lot?.crop);
    const actualDate = parseDate(isoDate);
    if (!key || !actualDate) return { kc: null, source: null, stage: null };
    const actualIso = iso(actualDate);
    const override = manualOverride(profile, actualIso);
    const delay = activeDelay(profile, actualIso);
    const effectiveDate = shiftedDate(actualIso, delay);
    const age = ageAt(lot, actualDate);
    const ageFactor = factorForAge(age);
    const baseKc = adultKcForDate(key, effectiveDate);
    return {
      kc: override ?? round3(baseKc * ageFactor),
      base_kc: baseKc,
      source: override != null ? 'manual_temporal' : 'cultivo_edad_fenologia',
      stage: stageFor(key, effectiveDate),
      age_years: age,
      age_factor: ageFactor,
      phenology_delay_days: delay,
      effective_date: iso(effectiveDate),
    };
  },

  kcForLotDate(lot, isoDate, profile = {}) {
    return this.detailsForLotDate(lot, isoDate, profile).kc;
  },
};
