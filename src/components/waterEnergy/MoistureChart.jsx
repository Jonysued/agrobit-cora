import React, { useEffect, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildProfileSeries } from './profileChartSeries';

// SUMA DE PERFIL (mm de agua almacenada en el perfil del suelo) —
// CURVA CALCULADA del lote: reconstrucción diaria desde el estado
// inicial (riegos EJECUTADOS, lluvia observada, ETc) como línea
// negra + HOY + forecast a 30 días con los riegos PROGRAMADOS (línea
// azul) y, si corresponde, el escenario con el riego RECOMENDADO
// (línea verde discontinua).
// Zonas: verde = zona objetivo (Target mín → Target máx), rosa =
// por debajo del umbral de recarga.
const DAY = 86400000;
const dayTs = d => new Date(`${d}T12:00:00`).getTime();
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });
const VIEW_MODES = [['week', 'Semana'], ['month', 'Mes']];

export default function MoistureChart({ detail }) {
  const { state, recommendation } = detail;
  // ---- Controles del encabezado ----
  const [viewMode, setViewMode] = useState('week');
  useEffect(() => { setViewMode('week'); }, [detail.anchor_date]);
  const hasRec = recommendation != null;

  const today = isoDay(new Date());
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
  const data = buildProfileSeries(detail, { H, S, R }, today);
  // Sin riegos programados a futuro no hay línea azul: la leyenda y el
  // gráfico solo muestran "Riego programado" cuando existe.
  const hasScheduled = (detail.scheduled_irrigation || []).length > 0;
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const fcMm = state.field_capacity_storage_mm;
  const hasRefs = rechargeMm != null && fcMm != null;

  // ---- Ventana visible (RANGO DE FECHAS) ----
  const anchorTs = detail.anchor_date ? dayTs(detail.anchor_date) : null;
  const todayTs = dayTs(today);
  // "Semana" conserva siete días observados y siete de previsión;
  // "Mes" amplía a quince días observados y treinta de previsión.
  const pastDays = viewMode === 'week' ? 7 : 15;
  const futureDays = viewMode === 'week' ? 7 : 30;
  const winStart = todayTs - pastDays * DAY;
  const winEnd = todayTs + futureDays * DAY;
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


  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-charcoal">Suma del perfil</h2>
          <p className="text-xs text-slate-400">Actualizado {new Date().toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {VIEW_MODES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setViewMode(id)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${viewMode === id ? 'bg-white text-charcoal shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {fcMm != null && <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-sky-500" /><b className="text-sky-600">Lleno:</b> {fcMm} mm</span>}
        {rechargeMm != null && <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-pink-500" /><b className="text-pink-600">Recargar:</b> {rechargeMm} mm</span>}
        <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-black" /><b>Suma:</b> {state.total_profile_water_mm} mm</span>
      </div>
      <div className="relative mt-5 h-[380px]">
        <span className="absolute left-0 top-0 z-10 text-xs font-bold text-slate-500">mm</span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 14, right: 18, bottom: 4, left: -4 }}>
            <CartesianGrid stroke="#d8dee5" />
            <XAxis dataKey="t" type="number" domain={[winStart, winEnd]} tickFormatter={fmtX} stroke="#666666" tick={{ fontSize: 11 }} tickMargin={8} />
            <YAxis domain={[yMin, yMax]} stroke="#666666" tick={{ fontSize: 11 }} tickMargin={6} />
            <Tooltip
              labelFormatter={fmtTip}
              formatter={(v, name) => [v != null ? `${Math.round(v * 10) / 10} mm` : '—', name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
            {hasRefs && (
              <>
                <ReferenceArea y1={rechargeMm} y2={fcMm} fill="#eaf7f7" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceArea y1={yMin} y2={rechargeMm} fill="#fff0f6" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceLine y={fcMm} stroke="#38a8df" strokeDasharray="5 5" ifOverflow="visible" />
                <ReferenceLine y={rechargeMm} stroke="#ec407a" strokeDasharray="5 5" ifOverflow="visible" />
              </>
            )}
            {/* Línea de HOY: separa el histórico (izquierda) del forecast (derecha) */}
            <ReferenceLine x={todayTs} stroke="#a3a3a3" strokeWidth={3} label={{ value: 'Previsión', fontSize: 13, fontWeight: 700, fill: '#111827', position: 'top' }} ifOverflow="extendDomain" />
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
