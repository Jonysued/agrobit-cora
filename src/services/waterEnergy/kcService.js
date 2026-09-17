// ============================================================
// kcService — Kc MENSUAL POR CULTIVO.
// Cada cultivo con tabla tiene un Kc distinto en cada mes del año:
// ETc = ET0 × Kc(mes). El valor usado es el punto medio del rango
// orientativo de cada mes. Cultivos sin tabla → el perfil usa su
// Kc manual (current_kc).
//
// Tablas orientativas (hemisferio sur, ciclo juliano):
//  · Granadas: Kc mín. en verano (reposo), máx. en enero–febrero.
//  · Olivos:   Kc mín. en julio–agosto, máx. en noviembre–diciembre.
// ============================================================

// [Ene .. Dic] — rangos orientativos por mes
const MONTHLY_KC_TABLES = {
  granadas: [
    { lo: 0.70, hi: 0.75 }, // Enero
    { lo: 0.75, hi: 0.80 }, // Febrero
    { lo: 0.70, hi: 0.75 }, // Marzo
    { lo: 0.45, hi: 0.60 }, // Abril
    { lo: 0.25, hi: 0.35 }, // Mayo
    { lo: 0.15, hi: 0.20 }, // Junio
    { lo: 0.15, hi: 0.20 }, // Julio
    { lo: 0.15, hi: 0.20 }, // Agosto
    { lo: 0.20, hi: 0.30 }, // Septiembre
    { lo: 0.35, hi: 0.45 }, // Octubre
    { lo: 0.50, hi: 0.60 }, // Noviembre
    { lo: 0.60, hi: 0.70 }, // Diciembre
  ],
  olivos: [
    { lo: 0.55, hi: 0.65 }, // Enero
    { lo: 0.60, hi: 0.70 }, // Febrero
    { lo: 0.60, hi: 0.70 }, // Marzo
    { lo: 0.55, hi: 0.65 }, // Abril
    { lo: 0.40, hi: 0.55 }, // Mayo
    { lo: 0.40, hi: 0.55 }, // Junio
    { lo: 0.35, hi: 0.45 }, // Julio
    { lo: 0.35, hi: 0.45 }, // Agosto
    { lo: 0.45, hi: 0.55 }, // Septiembre
    { lo: 0.55, hi: 0.65 }, // Octubre
    { lo: 0.65, hi: 0.70 }, // Noviembre
    { lo: 0.65, hi: 0.70 }, // Diciembre
  ],
};

const normalize = c => (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const midpoint = ({ lo, hi }) => (lo + hi) / 2;

// Tabla mensual del cultivo (o null si no tiene tabla cargada)
function tableFor(crop) {
  const c = normalize(crop);
  if (c.includes('gran')) return MONTHLY_KC_TABLES.granadas;
  if (c.includes('oli')) return MONTHLY_KC_TABLES.olivos;
  return null;
}

export const kcService = {
  // ¿El cultivo tiene tabla de Kc mensual cargada?
  hasMonthlyKc(crop) { return tableFor(crop) != null; },

  // Kc del cultivo para un mes del año (0 = enero). Null si no hay tabla.
  kcForCropMonth(crop, monthIdx) {
    const table = tableFor(crop);
    if (!table || monthIdx == null) return null;
    return midpoint(table[monthIdx]);
  },

  // Kc del cultivo para una fecha ISO (YYYY-MM-DD). Null si no hay tabla.
  kcForCropDate(crop, isoDate) {
    if (!isoDate) return null;
    const month = new Date(`${isoDate}T12:00:00`).getMonth();
    return this.kcForCropMonth(crop, month);
  },
};