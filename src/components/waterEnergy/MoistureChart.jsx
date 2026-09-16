import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, PenLine, Ruler, SlidersHorizontal } from 'lucide-react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// SUMA DE PERFIL (mm de agua almacenada en el perfil del suelo) —
// CURVA CALCULADA del lote: reconstrucción diaria desde el estado
// inicial (riegos ejecutados, lluvia observada, ETc) + HOY +
// forecast a 7 días con los riegos programados (línea negra) y, si
// corresponde, el escenario con el riego recomendado (línea verde).
// Zonas: verde = zona objetivo (Target mín → Target máx), rosa =
// por debajo del umbral de recarga.
const DAY = 86400000;
const dayTs = d => new Date(`${d}T12:00:00`).getTime();
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const fmtRange = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });

const RANGES = [[30, '30 días'], [60, '60 días'], [90, '90 días'], [180, '180 días']];
const scrollToId = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
const actionBtn = 'inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-emerald-800 transition hover:text-emerald-950 disabled:opacity-30 disabled:hover:text-emerald-800';

export default function MoistureChart({ detail }) {
  const { state, scenarioWithoutIrrigation, scenarioWithIrrigation, history, recommendation, scheduled_irrigation } = detail;
  // ---- Controles del encabezado ----
  const [rangeDays, setRangeDays] = useState(30);
  const [offset, setOffset] = useState(0); // días que la ventana retrocede respecto del dato más reciente
  const [showGrid, setShowGrid] = useState(true);
  const hasRec = recommendation != null;
  const scheduled = scheduled_irrigation || [];

  // Escala de almacenamiento: agua útil del balance + agua del punto
  // de marchitez (constante del perfil).
  const wiltingMm = state.wilting_storage_mm ?? 0;
  const storage = mm => wiltingMm + mm;
  const currentMm = state.current_available_water_mm;
  const data = [
    ...(history || []).map(h => ({ t: dayTs(h.date), 'Suma del perfil': storage(h.mm) })),
    { t: Date.now(), 'Suma del perfil': storage(currentMm), ...(hasRec ? { 'Con riego recomendado': storage(currentMm) } : {}) },
    ...(scenarioWithoutIrrigation || []).map((p, i) => ({
      t: dayTs(p.date),
      'Suma del perfil': storage(p.available_water_mm),
      ...(hasRec ? { 'Con riego recomendado': storage(scenarioWithIrrigation?.[i]?.available_water_mm ?? p.available_water_mm) } : {}),
    })),
  ];
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const hasRefs = rechargeMm != null && targetMm != null;

  // ---- Ventana visible (RANGO DE FECHAS) ----
  const dataMinTs = Math.min(...data.map(d => d.t));
  const dataMaxTs = Math.max(...data.map(d => d.t));
  const maxOffset = Math.max(0, Math.ceil((dataMaxTs - dataMinTs - rangeDays * DAY) / DAY));
  const effOffset = Math.min(offset, maxOffset);
  const winEnd = dataMaxTs - effOffset * DAY;
  const winStart = winEnd - rangeDays * DAY;
  const filtered = data.filter(d => d.t >= winStart - DAY && d.t <= winEnd + DAY / 2);
  const step = Math.ceil(rangeDays / 2);

  // Escala Y recortada al rango visible (como la referencia), no desde 0
  const curveVals = filtered.map(d => d['Suma del perfil']).filter(v => v != null);
  const maxV = Math.max(...curveVals, targetMm ?? 0);
  const minV = Math.min(...curveVals, rechargeMm ?? Infinity);
  const span = Math.max(maxV - minV, 20);
  const yMin = Math.max(0, Math.floor((minV - span * 0.15) / 10) * 10);
  const yMax = Math.ceil((maxV + span * 0.08) / 10) * 10;

  // Eventos de riego dentro de la ventana: ejecutados (pasado,
  // calculados) y programados (futuro, aún no aplicados)
  const irrEvents = [
    ...(detail.events?.irrigation || []).map(e => ({ ...e, kind: 'ejecutado' })),
    ...scheduled.filter(e => e.mm > 0).map(e => ({ ...e, kind: 'programado' })),
  ].filter(e => { const t = dayTs(e.date); return t >= winStart - DAY && t <= winEnd; });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mediciones</p>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
            Suma del perfil <ChevronDown size={14} className="text-slate-400" />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rango de fechas</p>
          <div className="mt-1 flex items-center gap-1">
            <button onClick={() => setOffset(o => Math.min(maxOffset, o + step))} disabled={effOffset >= maxOffset} aria-label="Retroceder" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={15} /></button>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
              <Calendar size={14} className="text-slate-400" />
              {fmtRange(winStart)} - {fmtRange(winEnd)}
              <select value={rangeDays} onChange={e => setRangeDays(+e.target.value)} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-slate-500 outline-none" aria-label="Duración del rango">
                {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button onClick={() => setOffset(o => Math.max(0, o - step))} disabled={effOffset <= 0} aria-label="Avanzar" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Acciones</p>
          <div className="mt-1 flex flex-col items-end gap-0.5 text-[11px] font-semibold">
            <button disabled={!hasRec} onClick={() => scrollToId('recomendacion')} className={actionBtn}><PenLine size={13} /> Add recomendación</button>
            <button onClick={() => setShowGrid(v => !v)} className={actionBtn}><Ruler size={13} /> Regla</button>
            <button onClick={() => scrollToId('estado-inicial')} className={actionBtn}><SlidersHorizontal size={13} /> Puntos de ajuste</button>
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
            <Tooltip
              labelFormatter={fmtTip}
              formatter={(v, name) => [v != null ? `${Math.round(v * 10) / 10} mm` : '—', name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
            {hasRefs && (
              <>
                <ReferenceArea y1={rechargeMm} y2={targetMm} fill="#eefaf3" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceArea y1={yMin} y2={rechargeMm} fill="#fff0f2" strokeOpacity={0} ifOverflow="visible" />
                <ReferenceLine y={targetMm} stroke="#3498db" strokeDasharray="2 4" label={{ value: 'Objetivo máx', fontSize: 9, fill: '#3498db', position: 'insideTopRight' }} ifOverflow="visible" />
                <ReferenceLine y={rechargeMm} stroke="#a93226" strokeDasharray="2 4" label={{ value: 'Umbral de recarga', fontSize: 9, fill: '#a93226', position: 'insideBottomRight' }} ifOverflow="visible" />
              </>
            )}
            {irrEvents.map((e, i) => (
              <ReferenceLine
                key={`${e.date}-${i}`}
                x={dayTs(e.date)}
                stroke={e.kind === 'ejecutado' ? '#1a7350' : '#0284c7'}
                strokeDasharray={e.kind === 'ejecutado' ? '' : '4 3'}
                label={{ value: `${e.kind === 'ejecutado' ? 'Riego' : 'Prog.'} ${e.mm}mm`, fontSize: 9, fill: e.kind === 'ejecutado' ? '#1a7350' : '#0284c7', position: 'top' }}
                ifOverflow="extendDomain"
              />
            ))}
            <Line dataKey="Suma del perfil" stroke="#000000" strokeWidth={2} dot={false} connectNulls />
            {hasRec && <Line dataKey="Con riego recomendado" stroke="#1a7350" strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Curva calculada (riegos ejecutados, lluvia observada y demanda del cultivo) · zona verde = objetivo · zona rosa = bajo umbral de recarga · modelo EXPERIMENTAL
      </p>
    </section>
  );
}