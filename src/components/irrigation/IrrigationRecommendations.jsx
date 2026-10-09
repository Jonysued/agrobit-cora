import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Droplets } from 'lucide-react';
import LoadingState from '@/components/LoadingState';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { waterForecastService } from '@/services/waterEnergy';
import { buildTurnRecommendations } from '@/services/irrigation/turnRecommendations';

const number = value => value == null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const wellName = well => /^\d+$/.test(well.name) ? `Pozo ${well.name}` : well.name;

export default function IrrigationRecommendations() {
  const [farm, setFarm] = useState(''), [well, setWell] = useState('');
  const query = useQuery({
    queryKey: ['irrigation-turn-recommendations'], staleTime: 60000,
    queryFn: async () => {
      const [devices, overview] = await Promise.all([monitoringService.devices(), waterForecastService.getFarmOverview({ force: true })]);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      return { groups: buildTurnRecommendations(devices, overview.rows, today), updatedAt: new Date() };
    },
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudieron calcular las recomendaciones. <button className="font-bold underline" onClick={() => query.refetch()}>Volver a intentar</button></div>;
  const groups = query.data?.groups || [];
  const farms = [...new Set(groups.map(g => g.well.farm))];
  const wells = [...new Map(groups.filter(g => !farm || g.well.farm === farm).map(g => [g.well.id, g.well])).values()];
  const visible = groups.filter(g => (!farm || g.well.farm === farm) && (!well || g.well.id === well));
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h2 className="text-xl font-bold text-emerald-950">Recomendaciones de riego</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Todos los lotes de un turno riegan juntos. La fecha y duración toman como referencia al lote más seco que necesita agua adicional, comparando su porcentaje de agua útil. Se consideran el clima y los riegos ya programados en los próximos 15 días.</p>
        <p className="mt-1 text-xs text-slate-400">Calculado {query.data?.updatedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <button disabled={query.isFetching} onClick={() => query.refetch()} className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />{query.isFetching ? 'Actualizando…' : 'Actualizar'}</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-500">FINCA<select value={farm} onChange={e => { setFarm(e.target.value); setWell(''); }} className="mt-1 block w-full rounded-xl border bg-white px-3 py-3 text-sm font-normal text-slate-800"><option value="">Todas</option>{farms.map(f => <option key={f}>{f}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-500">POZO<select value={well} onChange={e => setWell(e.target.value)} className="mt-1 block w-full rounded-xl border bg-white px-3 py-3 text-sm font-normal text-slate-800"><option value="">Todos</option>{wells.map(w => <option key={w.id} value={w.id}>{wellName(w)} · {w.farm}</option>)}</select></label>
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {visible.map(group => {
        const rec = group.recommendation;
        const reference = group.reference?.row;
        return <article key={group.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-bold text-emerald-950">{wellName(group.well)} · {group.well.farm} · {group.turno || 'Sin turno'}</h3><p className="mt-1 text-xs text-slate-500">{group.members.length} lotes · riegan juntos</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rec ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{group.status}</span>
          </div>
          {reference && <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>Lote de referencia: {reference.lot.name}</b><p className="mt-1 text-xs text-slate-600">Agua útil actual: {number(reference.state.available_water_percent)}% · suma de perfil {number(reference.state.total_profile_water_mm)} mm</p></div>}
          {rec && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-slate-500">Fecha sugerida</p><p className="mt-1 font-bold">{dateLabel(rec.date)}</p></div>
            <div><p className="text-xs text-slate-500">Duración del turno</p><p className="mt-1 font-bold">{Math.floor(rec.minutes / 60)} h {rec.minutes % 60} min</p></div>
            <div><p className="text-xs text-slate-500">Lote de referencia</p><p className="mt-1 font-bold">{number(rec.appliedMm)} mm</p></div>
          </div>}
          {rec && <p className="text-xs text-slate-500">Riego adicional al cronograma. La misma duración se aplica a todo el turno; los milímetros recibidos dependen del diseño y del sector de cada lote.</p>}
          {!group.turno && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Asigná el turno a sus válvulas desde Monitoreo → ficha de válvula → Editar. No se agrupan automáticamente todos los lotes de este pozo.</p>}
          {group.warnings.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><summary className="cursor-pointer font-bold">{group.warnings.length} observaciones para revisar</summary><ul className="mt-2 list-disc space-y-1 pl-4">{[...new Set(group.warnings)].map(w => <li key={w}>{w}</li>)}</ul></details>}
          <details className="text-sm"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-emerald-800"><Droplets size={16} />Ver lotes del turno</summary><div className="mt-3 space-y-2">{(rec?.impacts || group.members).map(member => <div key={member.lotId} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-100 p-2 text-xs"><span className="min-w-0 break-words font-semibold">{member.row?.lot.name || 'Lote sin datos'}{member.factor < 1 ? ' · medio lote' : ''}</span><span>Agua útil {number(member.row?.state?.available_water_percent)}%{rec ? ` · ${number(member.appliedMm)} mm aplicados` : ''}</span></div>)}</div></details>
        </article>;
      })}
    </div>
    {!visible.length && <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">No hay turnos de riego asignados para esta selección.</p>}
  </section>;
}

