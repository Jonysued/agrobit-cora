import React, { useEffect, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildProfileSeries } from './profileChartSeries';

// SUMA DE PERFIL (mm de agua almacenada en el perfil del suelo) —
// CURVA CALCULADA del lote: reconstrucción diaria desde el estado
// inicial (riegos EJECUTADOS, lluvia observada, ETc) como línea
// negra + HOY + pronóstico a 15 días con los riegos PROGRAMADOS (línea
// azul) y, si corresponde, el escenario con el riego RECOMENDADO
// (línea verde discontinua).
// Zonas: verde = zona objetivo (Target mín → Target máx), rosa =
// por debajo del umbral de recarga.
const DAY = 86400000;
const dayTs = d => new Date(`${d}T12:00:00`).getTime();
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const argentinaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });
const VIEW_MODES = [['week', '7 días'], ['month', '31 días']];
const mm = value => `${Math.round(value * 10) / 10} mm`;

export default function MoistureChart({ detail }) {
  const { state, recommendation } = detail;
  // ---- Controles del encabezado ----
  const [viewMode, setViewMode] = useState('week');
  const [selectedDay, setSelectedDay] = useState(argentinaToday);
  useEffect(() => { setViewMode('week'); setSelectedDay(argentinaToday()); }, [detail.lot?.id]);
  const hasRec = recommendation != null;

  const today = argentinaToday();
  // Tres líneas sobre la MISMA escala de Suma de perfil:
  // · ACTUAL (línea negra): curva actual del lote continuada con la
  //   tendencia SIN ningún riego (lluvia − ETc).
  // · RIEGO PROGRAMADO (línea azul): escenario con los riegos del
  //   cronograma (IrrigationProgram de la pestaña Riego).
  // · CON RIEGO RECOMENDADO (verde discontinua): cronograma + riego
  //   recomendado por el modelo.
  const H = 'Actual (sin riego)';
  const S = 'Riego programado';
  const R = 'Con riego recomendado';
  // Serie del gráfico: un punto por día + punto intermedio a las 00:00
  // del día siguiente de cada riego o lluvia — el salto lee
  // EXACTAMENTE los mm aplicados y desde ahí baja con la ETc del día.
  const forecastEndTs = dayTs(today) + 15 * DAY;
  const data = buildProfileSeries(detail, { H, S, R }, today).filter(d => d.t <= forecastEndTs);
  const forecastDays = (detail.weather || []).filter(d => d.date > today && dayTs(d.date) <= forecastEndTs);
  const simulatedDays = forecastDays.filter(d => d.simulated);
  const observedForecastDays = forecastDays.filter(d => !d.simulated);
  const forecastSource = observedForecastDays.some(d => d.source === 'open-meteo')
    ? 'Open-Meteo' : observedForecastDays.length ? 'pronóstico guardado' : null;
  // Sin riegos programados a futuro no hay línea azul: la leyenda y el
  // gráfico solo muestran "Riego programado" cuando existe.
  const hasScheduled = (detail.scheduled_irrigation || []).some(e => e.date > today && dayTs(e.date) <= forecastEndTs);
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const fcMm = state.field_capacity_storage_mm;
  const hasRefs = rechargeMm != null && fcMm != null;

  // ---- Ventana visible (RANGO DE FECHAS) ----
  const anchorTs = detail.anchor_date ? dayTs(detail.anchor_date) : null;
  const todayTs = dayTs(today);
  // Mantener la ventana dentro de los días con datos. Cerca del comienzo
  // o el final se desplaza, sin desperdiciar medio gráfico en fechas vacías.
  const dailyPoints = data.filter(d => d.t === dayTs(isoDay(new Date(d.t))));
  const firstDay = dailyPoints.length ? isoDay(new Date(dailyPoints[0].t)) : today;
  const lastDay = dailyPoints.length ? isoDay(new Date(dailyPoints[dailyPoints.length - 1].t)) : today;
  const activeDay = selectedDay < firstDay ? firstDay : selectedDay > lastDay ? lastDay : selectedDay;
  const activeTs = dayTs(activeDay);
  const windowDays = viewMode === 'week' ? 7 : 31;
  const firstTs = dayTs(firstDay);
  const lastTs = dayTs(lastDay);
  const maxStart = Math.max(firstTs, lastTs - (windowDays - 1) * DAY);
  const winStart = Math.max(firstTs, Math.min(activeTs - Math.floor(windowDays / 2) * DAY, maxStart));
  const winEnd = Math.min(lastTs, winStart + (windowDays - 1) * DAY);
  const tickStep = (viewMode === 'week' ? 1 : 5) * DAY;
  const axisTicks = [];
  for (let t = winStart; t <= winEnd; t += tickStep) axisTicks.push(t);
  if (axisTicks[axisTicks.length - 1] !== winEnd) axisTicks.push(winEnd);
  const filtered = data
    .filter(d => d.t >= winStart - DAY / 2 && d.t <= winEnd + DAY / 2)
    .map(d => ({
      ...d,
      Histórico: d.t <= todayTs ? d[H] : null,
      'Previsión sin riego': d.t >= todayTs ? d[H] : null,
    }));

  // Escala Y recortada al rango visible (como la referencia), no desde 0
  const curveVals = filtered.flatMap(d => [d[H], d[S], d[R]].filter(v => v != null));
  const maxV = Math.max(...curveVals, targetMm ?? 0, fcMm ?? 0);
  const minV = Math.min(...curveVals, rechargeMm ?? Infinity);
  const span = Math.max(maxV - minV, 20);
  const yMin = Math.max(0, Math.floor((minV - span * 0.15) / 10) * 10);
  const yMax = Math.ceil((maxV + span * 0.08) / 10) * 10;
  const selectedPoint = dailyPoints.find(d => d.t === activeTs);
  const selectedIndex = dailyPoints.indexOf(selectedPoint);
  const previousPoint = dailyPoints[selectedIndex - 1];
  const isFuture = activeDay > today;
  const selectedValue = isFuture ? (selectedPoint?.[S] ?? selectedPoint?.[H]) : activeDay === today ? (selectedPoint?.[H] ?? state.total_profile_water_mm) : selectedPoint?.[H];
  const previousValue = previousPoint && (isFuture && previousPoint.t > todayTs ? (previousPoint[S] ?? previousPoint[H]) : previousPoint[H]);
  const delta = selectedValue != null && previousValue != null ? Math.round((selectedValue - previousValue) * 10) / 10 : null;
  const forecastDay = (detail.scenarioWithoutIrrigation || []).find(p => p.date === activeDay);
  const recommendedIrrigation = (detail.scenarioWithIrrigation || []).find(p => p.date === activeDay)?.irrigation_mm;
  const historicRain = (detail.events?.rain || []).find(e => e.date === activeDay)?.mm;
  const historicIrrigation = (detail.events?.irrigation || []).find(e => e.date === activeDay)?.mm;
  const shiftDay = offset => setSelectedDay(isoDay(new Date(activeTs + offset * DAY)));


  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-charcoal">Suma del perfil</h2>
          <p className="text-xs text-slate-400">Actualizado {new Date().toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Escala temporal">
            {VIEW_MODES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setViewMode(id)} aria-pressed={viewMode === id} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === id ? 'bg-white text-charcoal shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-lg border border-slate-200">
            <button type="button" aria-label="Día anterior" title="Día anterior" disabled={activeDay <= firstDay} onClick={() => shiftDay(-1)} className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <input type="date" aria-label="Día de la curva" min={firstDay} max={lastDay} value={activeDay} onChange={e => setSelectedDay(e.target.value)} className="w-[132px] border-x border-slate-200 bg-white px-1 py-1.5 text-xs font-semibold text-charcoal" />
            <button type="button" aria-label="Día siguiente" title="Día siguiente" disabled={activeDay >= lastDay} onClick={() => shiftDay(1)} className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          {activeDay !== today && <button type="button" onClick={() => setSelectedDay(today)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Ir a hoy</button>}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Pronóstico hasta 15 días · {forecastSource ? `Fuente: ${forecastSource}` : 'Sin pronóstico meteorológico real'}
        {simulatedDays.length > 0 && <span className="ml-2 font-semibold text-amber-700">· {simulatedDays.length} {simulatedDays.length === 1 ? 'día simulado' : 'días simulados'}</span>}
      </p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4" aria-live="polite">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fmtTip(activeTs)} · {isFuture ? (forecastDays.find(d => d.date === activeDay)?.simulated ? 'Simulación' : 'Pronóstico') : activeDay === today ? 'Hoy' : 'Histórico'}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-charcoal">{selectedValue != null ? mm(selectedValue) : 'Sin dato'}</p>
          </div>
          {delta != null && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${delta > 0 ? 'bg-emerald-100 text-emerald-800' : delta < 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{delta > 0 ? '+' : ''}{mm(delta)} vs. día anterior</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {isFuture && selectedPoint?.[H] != null && <span>Sin riego: <b>{mm(selectedPoint[H])}</b></span>}
          {isFuture && selectedPoint?.[S] != null && <span>Programado: <b>{mm(selectedPoint[S])}</b></span>}
          {isFuture && selectedPoint?.[R] != null && <span>Recomendado: <b>{mm(selectedPoint[R])}</b></span>}
          {(forecastDay?.rainfall_mm || historicRain) > 0 && <span>Lluvia: <b>{mm(forecastDay?.rainfall_mm ?? historicRain)}</b></span>}
          {(forecastDay?.irrigation_mm || historicIrrigation) > 0 && <span>Riego: <b>{mm(forecastDay?.irrigation_mm ?? historicIrrigation)}</b></span>}
          {isFuture && recommendedIrrigation > (forecastDay?.irrigation_mm || 0) && <span>Riego recomendado: <b>{mm(recommendedIrrigation - (forecastDay?.irrigation_mm || 0))}</b></span>}
          {forecastDay?.etc_mm != null && <span>ETc: <b>{mm(forecastDay.etc_mm)}</b></span>}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">En la proyección, la lluvia y el riego de este día se reflejan en el valor del día siguiente.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {rechargeMm != null && <span><i className="mr-1.5 inline-block w-4 align-middle" style={{ borderTop: '2px dashed #ec407a' }} />Recarga {mm(rechargeMm)}</span>}
        {fcMm != null && <span><i className="mr-1.5 inline-block w-4 align-middle" style={{ borderTop: '2px dashed #38a8df' }} />Capacidad de campo {mm(fcMm)}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Referencias de la curva">
        <span><i className="mr-1.5 inline-block w-5 align-middle" style={{ borderTop: '3px solid #111827' }} />Histórico</span>
        <span><i className="mr-1.5 inline-block w-5 align-middle" style={{ borderTop: '3px solid #9ca3af' }} />Sin riego futuro</span>
        {hasScheduled && <span><i className="mr-1.5 inline-block w-5 align-middle" style={{ borderTop: '3px solid #2563eb' }} />Programado</span>}
        {hasRec && <span><i className="mr-1.5 inline-block w-5 align-middle" style={{ borderTop: '3px dashed #16a34a' }} />Recomendado</span>}
      </div>
      <div className="relative mt-3 h-[280px] sm:h-[350px]">
        <span className="absolute left-0 top-0 z-10 text-xs font-bold text-slate-500">mm</span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 14, right: 18, bottom: 4, left: -4 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
            <XAxis dataKey="t" type="number" domain={[winStart, winEnd]} ticks={axisTicks} tickFormatter={fmtX} stroke="#94a3b8" tick={{ fontSize: 11, fill: '#475569' }} tickMargin={8} minTickGap={12} />
            <YAxis domain={[yMin, yMax]} stroke="#94a3b8" tick={{ fontSize: 11, fill: '#475569' }} tickMargin={6} />
            <Tooltip
              labelFormatter={fmtTip}
              formatter={(v, name) => [v != null ? mm(v) : '—', name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
            />
            {hasRefs && (
              <>
                <ReferenceArea y1={rechargeMm} y2={fcMm} fill="#eaf7f7" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceArea y1={yMin} y2={rechargeMm} fill="#fff0f6" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceLine y={fcMm} stroke="#38a8df" strokeDasharray="5 5" ifOverflow="visible" />
                <ReferenceLine y={rechargeMm} stroke="#ec407a" strokeDasharray="5 5" ifOverflow="visible" />
              </>
            )}
            {/* Línea de HOY: separa el histórico (izquierda) del forecast (derecha) */}
            {todayTs >= winStart && todayTs <= winEnd && <ReferenceLine x={todayTs} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Hoy', fontSize: 11, fill: '#475569', position: 'top' }} />}
            {activeDay !== today && <ReferenceLine x={activeTs} stroke="#0f766e" strokeWidth={2} />}
            {/* INICIALIZACIÓN del estado hídrico: fecha y mm desde donde
                arranca la curva calculada (si quedó dentro de la ventana) */}
            {anchorTs && anchorTs < dayTs(today) && anchorTs >= winStart - DAY && anchorTs <= winEnd && (
              <ReferenceLine
                x={anchorTs} stroke="#7c3aed" strokeDasharray="1 3"
                ifOverflow="extendDomain"
              />
            )}
            <Line dataKey="Histórico" stroke="#111111" strokeWidth={3} dot={false} activeDot={{ r: 4 }} connectNulls />
            <Line dataKey="Previsión sin riego" stroke="#9ca3af" strokeWidth={3} dot={false} activeDot={{ r: 4 }} connectNulls />
            {hasScheduled && <Line dataKey={S} stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />}
            {hasRec && <Line dataKey={R} stroke="#16a34a" strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
