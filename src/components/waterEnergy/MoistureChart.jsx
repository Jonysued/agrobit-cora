import React, { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
const fmtRange = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });

const RANGES = [[45, '45 días'], [60, '60 días'], [90, '90 días'], [180, '180 días']];


export default function MoistureChart({ detail }) {
  const { state, recommendation, scheduled_irrigation } = detail;
  // ---- Controles del encabezado ----
  // Rango null = AUTOMÁTICO (incluye el punto de inicialización).
  const [rangeDays, setRangeDays] = useState(null);
  const [offset, setOffset] = useState(0); // días que la ventana retrocede respecto del dato más reciente
  const showGrid = true;
  // Nueva inicialización del estado: se resetea el selector de rango.
  useEffect(() => { setRangeDays(null); setOffset(0); }, [detail.anchor_date]);
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
  // Escala propia de las barras de lluvia (eje derecho oculto): mm de
  // lluvia, no de perfil — lluvias chicas siguen siendo visibles.
  const rainMax = Math.max(10, ...data.map(d => Math.max(d.Lluvia || 0, d.Riego || 0, d.Programado || 0))) * 2.5;
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const fcMm = state.field_capacity_storage_mm;
  const hasRefs = rechargeMm != null && targetMm != null;

  // ---- Ventana visible (RANGO DE FECHAS) ----
  const dataMinTs = Math.min(...data.map(d => d.t));
  const dataMaxTs = Math.max(...data.map(d => d.t));
  // Ventana IGUAL para todos los lotes: por defecto 45 días (15 hacia
  // atrás desde hoy + 30 de forecast). Un lote inicializado más tarde
  // simplemente muestra su curva arrancando en la fecha de
  // inicialización, sin que el gráfico re-encuadre la ventana.
  const effRange = rangeDays ?? 45;
  const maxOffset = Math.max(0, Math.ceil((dataMaxTs - dataMinTs - effRange * DAY) / DAY));
  const effOffset = Math.min(offset, maxOffset);
  const anchorTs = detail.anchor_date ? dayTs(detail.anchor_date) : null;
  // Ventana FIJA anclada en HOY, igual para todos los lotes: 15 días
  // hacia atrás + 30 de forecast (con el rango por defecto de 45 días).
  // Un lote inicializado más tarde muestra su curva arrancando en la
  // fecha de inicialización, con espacio vacío antes de ese punto.
  const todayTs = dayTs(today);
  const winEnd = todayTs + 30 * DAY - effOffset * DAY;
  const winStart = winEnd - effRange * DAY;
  const filtered = data.filter(d => d.t >= winStart - DAY && d.t <= winEnd + DAY / 2);
  const step = Math.ceil(effRange / 2);

  // Escala Y recortada al rango visible (como la referencia), no desde 0
  const curveVals = filtered.flatMap(d => [d[H], d[S]].filter(v => v != null));
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
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rango de fechas</p>
          <div className="mt-1 flex items-center gap-1">
            <button onClick={() => setOffset(o => Math.min(maxOffset, o + step))} disabled={effOffset >= maxOffset} aria-label="Retroceder" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={15} /></button>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
              <Calendar size={14} className="text-slate-400" />
              {fmtRange(winStart)} - {fmtRange(winEnd)}
              <select value={effRange} onChange={e => setRangeDays(+e.target.value)} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-slate-500 outline-none" aria-label="Duración del rango">
                {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button onClick={() => setOffset(o => Math.max(0, o - step))} disabled={effOffset <= 0} aria-label="Avanzar" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
        </div>

      </div>
      <div className="relative mt-4 h-80">
        <span className="absolute left-0 top-0 z-10 text-[10px] font-bold text-slate-400">mm</span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 14, right: 18, bottom: 4, left: -4 }}>
            <CartesianGrid stroke="#eef2f6" vertical={showGrid} />
            <XAxis dataKey="t" type="number" domain={[winStart, winEnd]} tickFormatter={fmtX} stroke="#666666" tick={{ fontSize: 11 }} tickMargin={8} />
            <YAxis domain={[yMin, yMax]} stroke="#666666" tick={{ fontSize: 11 }} tickMargin={6} />
            <YAxis yAxisId="rain" orientation="right" hide domain={[0, rainMax]} allowDataOverflow />
            <Tooltip
              labelFormatter={fmtTip}
              formatter={(v, name) => [v != null ? `${Math.round(v * 10) / 10} mm` : '—', name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
            {fcMm != null && (
              <ReferenceLine y={fcMm} stroke="#334155" ifOverflow="visible" />
            )}
            {hasRefs && (
              <>
                <ReferenceArea y1={rechargeMm} y2={targetMm} fill="#eefaf3" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceArea y1={yMin} y2={rechargeMm} fill="#fff0f2" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceLine y={targetMm} stroke="#3498db" strokeDasharray="2 4" ifOverflow="visible" />
                <ReferenceLine y={rechargeMm} stroke="#a93226" strokeDasharray="2 4" ifOverflow="visible" />
              </>
            )}
            {/* Lluvia y riego en mm del día (observados y previstos):
                barras sobre su propio eje — verde = riego ejecutado
                (confirmado), violeta = riego programado. Su aporte sube
                la curva recién el día SIGUIENTE. */}
            {/* Línea de HOY: separa el histórico (izquierda) del forecast (derecha) */}
            <ReferenceLine x={dayTs(today)} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Hoy', fontSize: 9, fill: '#64748b', position: 'top' }} ifOverflow="extendDomain" />
            {/* INICIALIZACIÓN del estado hídrico: fecha y mm desde donde
                arranca la curva calculada (si quedó dentro de la ventana) */}
            {anchorTs && anchorTs < dayTs(today) && anchorTs >= winStart - DAY && anchorTs <= winEnd && (
              <ReferenceLine
                x={anchorTs} stroke="#7c3aed" strokeDasharray="1 3"
                label={{ value: `Inicialización · ${detail.anchor_storage_mm} mm`, fontSize: 9, fill: '#7c3aed', position: 'insideTop', offset: 19 }}
                ifOverflow="extendDomain"
              />
            )}
            <Bar dataKey="Lluvia" yAxisId="rain" fill="#93c5fd" stroke="#3b82f6" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={14} label={{ position: 'top', fontSize: 9, fill: '#1d4ed8' }} />
            <Bar dataKey="Riego" name="Riego ejecutado" yAxisId="rain" fill="#a7f3d0" stroke="#10b981" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={14} label={{ position: 'top', fontSize: 9, fill: '#047857' }} />
            <Bar dataKey="Programado" name="Riego programado" yAxisId="rain" fill="#c4b5fd" stroke="#7c3aed" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={14} label={{ position: 'top', fontSize: 9, fill: '#5b21b6' }} />
            <Line dataKey={H} stroke="#000000" strokeWidth={2} dot={{ r: 2, fill: '#000000', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />
            <Line dataKey={S} stroke="#0284c7" strokeWidth={2} dot={{ r: 2, fill: '#0284c7', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />
            {hasRec && <Line dataKey={R} stroke="#1a7350" strokeWidth={1.8} strokeDasharray="5 4" dot={{ r: 2, fill: '#1a7350', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}