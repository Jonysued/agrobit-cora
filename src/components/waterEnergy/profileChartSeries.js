// ============================================================
// profileChartSeries — serie de datos del gráfico "Suma de perfil".
//
// Un punto por día + un PUNTO INTERMEDIO a las 00:00 del día
// siguiente de cada riego o lluvia. Con la regla X+1 (el agua del día
// X entra al perfil en el día X+1), el punto intermedio sube
// EXACTAMENTE los mm aplicados (riego del programa + lluvia del día)
// y desde ahí baja con la ETc del día. El salto se acota a la
// capacidad útil del perfil (TAW): el agua que no entra drena y no se
// dibuja (la línea de capacidad de campo del gráfico marca el techo).
// ============================================================
const DAY = 86400000;
const dayTs = d => new Date(`${d}T12:00:00`).getTime();
const midTs = iso => dayTs(iso) - DAY / 2; // 00:00 del día

export function buildProfileSeries(detail, L, today) {
  const { state, scenarioNoIrrigation, scenarioWithoutIrrigation, scenarioWithIrrigation, history, recommendation } = detail;
  const hasRec = recommendation != null;
  // Lluvia y riego ejecutado observados por día (mm)
  const rainByDate = new Map((detail.events?.rain || []).map(e => [e.date, e.mm]));
  const executedByDate = new Map((detail.events?.irrigation || []).map(e => [e.date, e.mm]));
  // Escala de almacenamiento: agua útil del balance + agua del punto
  // de marchitez (constante del perfil).
  const wiltingMm = state.wilting_storage_mm ?? 0;
  const tawMm = state.total_available_water_capacity_mm ?? null;
  const capMm = mm => Math.max(0, tawMm != null ? Math.min(mm, tawMm) : mm);
  const storage = mm => wiltingMm + mm;
  const currentMm = state.current_available_water_mm;

  // Lluvia del día "HOY": la serie histórica ya incluye el día de hoy;
  // solo se marca aparte si el ancla es hoy y no hay histórico aún.
  const rainToday = (history || []).some(h => h.date === today) ? null : rainByDate.get(today) ?? null;
  // Riego EJECUTADO del día "HOY" (misma regla que la lluvia)
  const riegoToday = (history || []).some(h => h.date === today) ? null : executedByDate.get(today) ?? null;

  const data = [];
  // ---- Histórico (línea negra): un punto por día + salto ----
  (history || []).forEach((h, i) => {
    if (i > 0) {
      const prev = history[i - 1];
      const jump = (executedByDate.get(prev.date) || 0) + (rainByDate.get(prev.date) || 0);
      if (jump > 0) data.push({ t: midTs(h.date), [L.H]: storage(capMm(prev.mm + jump)) });
    }
    data.push({ t: dayTs(h.date), [L.H]: storage(h.mm), Lluvia: rainByDate.get(h.date) ?? null, Riego: executedByDate.get(h.date) ?? null });
  });
  // ---- HOY: punto de partida de los escenarios ----
  // La línea de RIEGO PROGRAMADO NO arranca hoy: hasta el primer riego
  // programado coincide exactamente con la línea Actual, así que no se
  // dibuja (evita duplicar la curva negra). Nace el día del primer
  // riego del cronograma — ahí se ve la bifurcación.
  // El histórico ya incluye HOY: NO se agrega un segundo punto de hoy
  // (dos puntos casi superpuestos — 12:00 y la hora actual — generan
  // el pequeño doble trazo de la línea Actual en "Hoy"). La línea
  // recomendada arranca del último punto del histórico.
  const lastHist = (history || [])[history.length - 1] || null;
  if (lastHist && lastHist.date === today) {
    if (hasRec) data[data.length - 1][L.R] = storage(currentMm);
  } else {
    data.push({ t: Date.now(), [L.H]: storage(currentMm), Lluvia: rainToday, Riego: riegoToday, ...(hasRec ? { [L.R]: storage(currentMm) } : {}) });
  }
  // Primer día con riego programado del escenario (índice; -1 = no hay)
  const firstSchedIdx = (scenarioWithoutIrrigation || []).findIndex(p => (p.irrigation_mm || 0) > 0);
  // ---- Forecast (30 días): un punto por día + salto por escenario ----
  // El salto de la línea verde incluye además el riego recomendado.
  (scenarioWithoutIrrigation || []).forEach((p, i) => {
    if (i > 0) {
      const mid = { t: midTs(p.date) };
      const prevS = scenarioWithoutIrrigation[i - 1];
      const jumpS = (prevS.irrigation_mm || 0) + (prevS.rainfall_mm || 0);
      if (jumpS > 0) mid[L.S] = storage(capMm(prevS.available_water_mm + jumpS));
      const prevH = scenarioNoIrrigation?.[i - 1];
      if (prevH && (prevH.rainfall_mm || 0) > 0) mid[L.H] = storage(capMm(prevH.available_water_mm + prevH.rainfall_mm));
      const prevR = hasRec ? scenarioWithIrrigation?.[i - 1] : null;
      if (prevR) {
        const jumpR = (prevR.irrigation_mm || 0) + (prevR.rainfall_mm || 0);
        if (jumpR > 0) mid[L.R] = storage(capMm(prevR.available_water_mm + jumpR));
      }
      if (mid[L.S] != null || mid[L.H] != null || mid[L.R] != null) data.push(mid);
    }
    data.push({
      t: dayTs(p.date),
      [L.H]: storage(scenarioNoIrrigation?.[i]?.available_water_mm ?? null),
      // Solo desde el día del primer riego programado en adelante
      ...(i >= firstSchedIdx ? { [L.S]: storage(p.available_water_mm) } : {}),
      Lluvia: (p.rainfall_mm || 0) > 0 ? Math.round(p.rainfall_mm * 10) / 10 : null,
      Programado: (p.irrigation_mm || 0) > 0 ? Math.round(p.irrigation_mm * 10) / 10 : null,
      ...(hasRec ? { [L.R]: storage(scenarioWithIrrigation?.[i]?.available_water_mm ?? p.available_water_mm) } : {}),
    });
  });
  return data;
}