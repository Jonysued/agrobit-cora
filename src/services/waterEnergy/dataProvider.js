// ============================================================
// Water & Energy — capa de datos (PROVEEDOR SIMULADO)
// Único punto de contacto con fuentes de humedad de suelo y clima.
// Para conectar sensores reales o una API meteorológica más adelante:
//   1. Crear un nuevo proveedor con esta misma interfaz.
//   2. Exportarlo como `dataProvider` aquí.
//   3. Ninguna otra capa del módulo necesita cambios.
// Interfaz:
//   getSoilWaterMm(lot, dateStr, usefulWaterMm) -> agua disponible (mm)
//   getDailyEtcMm(lot, dateStr) -> evapotranspiración del cultivo (mm/día)
// ============================================================

// Número pseudoaleatorio determinista: mismo lote + fecha => mismo valor
const seeded01 = key => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ((h % 997) / 997 + (h % 89) / 89) / 2;
};

const etcBaseFor = lot => {
  const c = (lot.crop || '').toLowerCase();
  if (c.includes('oli')) return 4.2;   // Olivo
  if (c.includes('gran')) return 4.8;  // Granado
  return 4.5;
};

export const simulatedDataProvider = {
  source: 'simulado',

  // Lectura simulada de agua disponible en el suelo (entre 30% y 85% del agua útil)
  getSoilWaterMm(lot, dateStr, usefulWaterMm) {
    const fraction = 0.3 + 0.55 * seeded01(`${lot.id}|${dateStr}`);
    return Math.round(usefulWaterMm * fraction * 10) / 10;
  },

  // ETc diaria simulada (variación ±15% sobre la base del cultivo)
  getDailyEtcMm(lot, dateStr) {
    return Math.round(etcBaseFor(lot) * (0.85 + 0.3 * seeded01(`${lot.crop}|${dateStr}`)) * 10) / 10;
  },
};

// Proveedor activo — cambiar aquí cuando existan sensores/APIs reales
export const dataProvider = simulatedDataProvider;