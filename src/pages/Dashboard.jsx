import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useFarm } from '@/lib/FarmContext';
import { useAuth } from '@/lib/AuthContext';
import { lotMetrics } from '@/lib/farmCalculations';
import LoadingState from '@/components/LoadingState';
import WeatherPanel from '@/components/waterEnergy/WeatherPanel';
import { waterForecastService, energyService } from '@/services/waterEnergy';
import { weatherService } from '@/services/waterEnergy/weatherService';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { buildTurnRecommendations } from '@/services/irrigation/turnRecommendations';
const DashboardMap = lazy(() => import('@/components/DashboardMap'));
const number = v => v == null ? 'Sin datos' : v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const dayLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
function Card({ title, to, values, detail }) {
  return <Link to={to} className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition hover:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-700"><h2 className="flex items-center justify-between gap-2 font-bold text-emerald-950">{title}<ArrowUpRight size={17} className="shrink-0 text-emerald-600" /></h2><div className="mt-3 space-y-2 text-sm">{values.map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-slate-500">{label}</span><b>{value}</b></div>)}</div>{detail && <p className="mt-3 text-xs leading-relaxed text-slate-500">{detail}</p>}</Link>;
}
export default function Dashboard() {
  const d = useFarm(), { user } = useAuth();
  const [farm, setFarm] = useState(() => { try { return localStorage.getItem('lucient:dashboard-farm') ?? 'Las 500'; } catch { return 'Las 500'; } });
  const overview = useQuery({ queryKey: ['dashboard-water', user?.id], queryFn: () => waterForecastService.getFarmOverview(), staleTime: 120000, refetchInterval: 120000 });
  const devices = useQuery({ queryKey: ['dashboard-devices', user?.id], queryFn: () => monitoringService.devices(), staleTime: 30000, refetchInterval: 60000 });
  const pumps = useQuery({ queryKey: ['dashboard-pumps', user?.id], queryFn: () => energyService.getPumps(), staleTime: 120000 });
  const weatherFarms = useQuery({ queryKey: ['weather-farms', user?.id], queryFn: () => weatherService.getFarms(), staleTime: 300000 });
  useEffect(() => {
    const refresh = () => { void overview.refetch(); void devices.refetch(); void pumps.refetch(); void d.refetch(); };
    window.addEventListener('lucient:data-mutated', refresh);
    const unsubscribe = monitoringService.subscribe(() => { void devices.refetch(); });
    return () => { window.removeEventListener('lucient:data-mutated', refresh); unsubscribe(); };
  }, []);
  if (d.loading) return <LoadingState />;
  if (d.error) return <div role="alert" className="p-6 text-sm">No se pudo cargar el establecimiento. <button onClick={() => d.refetch()} className="underline">Reintentar</button></div>;
  const names = [...new Set(d.Lot.map(l => l.farm).filter(Boolean))].sort();
  const selected = farm && names.includes(farm) ? farm : '';
  const lots = d.Lot.filter(l => !selected || l.farm === selected);
  const ids = new Set(lots.map(l => l.id));
  const rows = (overview.data?.rows || []).filter(r => ids.has(r.lot.id));
  const usable = rows.filter(r => r.forecast_status === 'ok' && Number.isFinite(r.state?.available_water_percent));
  const average = usable.length ? usable.reduce((s, r) => s + r.state.available_water_percent, 0) / usable.length : null;
  const below = usable.filter(r => r.state.current_available_water_mm <= r.state.recharge_threshold_mm).length;
  const active = (devices.data || []).filter(device => device.kind === 'well' && device.current_active === true && (!selected || device.farm === selected)).length;
  const period = energyService.projectionWindow();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const turns = overview.data && devices.data ? buildTurnRecommendations(devices.data, overview.data.rows, today).filter(g => !selected || g.well.farm === selected) : null;
  const programs = d.IrrigationProgram.filter(p => !selected || (p.lot_ids || []).some(id => ids.has(id)));
  const upcoming = programs.filter(p => ['Programado', 'Activo'].includes(p.status) && p.start_time && Date.parse(p.date + 'T' + p.start_time + '-03:00') >= period.now).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))[0];
  const scheduled = pumps.data && overview.data ? energyService.getScheduledOverview(programs, pumps.data.filter(p => !selected || p.farm === selected), rows, overview.data.tariff, period) : null;
  const recommended = overview.data ? energyService.getRecommendedOverview(rows, period) : null;
  const objectives = lots.map(l => ({ lot: l, ...lotMetrics(l, d.ProductionRecord, d.Objective, d.HealthRecord) })).filter(m => m.objective?.kg_ha > 0);
  const target = objectives.reduce((s, m) => s + m.objective.kg_ha * (Number(m.lot.area_ha) || 0), 0);
  const complete = objectives.length && objectives.every(m => m.objective.estimated_kg_ha != null && Number.isFinite(Number(m.objective.estimated_kg_ha)));
  const estimated = complete ? objectives.reduce((s, m) => s + Number(m.objective.estimated_kg_ha) * (Number(m.lot.area_ha) || 0), 0) : null;
  const wf = weatherFarms.data || [];
  const climateFarm = wf.find(f => f.name === selected) || (!selected ? wf.find(f => f.name === 'Las 500') || wf[0] : null);
  const pending = q => q.isPending ? 'Cargando…' : 'Sin datos';
  const problems = [overview.isError && 'No se pudo actualizar el balance hídrico.', devices.isError && 'No se pudo actualizar el estado de los pozos.', pumps.isError && 'No se pudieron cargar los equipos de energía.'].filter(Boolean);
  const missingTurns = turns?.filter(g => !g.turno).length || 0;
  return <div className="mx-auto max-w-[1500px] space-y-5 p-4 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Panorama del establecimiento</p><h1 className="mt-1 text-3xl font-bold">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Lo más relevante de cada sección.</p></div><label className="w-full text-xs font-bold text-slate-500 sm:w-56">FINCA<select aria-label="Finca del Dashboard" value={selected} onChange={e => { setFarm(e.target.value); try { localStorage.setItem('lucient:dashboard-farm', e.target.value); } catch { /* selección disponible sin persistencia */ } }} className="mt-1 block w-full rounded-xl border bg-white px-3 py-3 text-sm font-normal text-slate-800"><option value="">Todas las fincas</option>{names.map(n => <option key={n}>{n}</option>)}</select></label></div>
    {problems.length > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{problems.join(' ')} <button onClick={() => { void overview.refetch(); void devices.refetch(); void pumps.refetch(); }} className="font-bold underline">Reintentar</button></p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card title="Lotes" to="/lotes" values={[[ 'Lotes', lots.length ], ['Superficie', number(lots.reduce((s, l) => s + (Number(l.area_ha) || 0), 0)) + ' ha']]} />
      <Card title="Riego" to="/riego?tab=recomendaciones" values={[[ 'Turnos recomendados · 15 días', turns ? turns.filter(g => g.recommendation).length : pending(overview.isPending ? overview : devices) ], ['Pozos activos', devices.data ? active : pending(devices)]]} detail={'Próximo: ' + (upcoming ? dayLabel(upcoming.date) + ' · ' + upcoming.start_time.slice(0, 5) + ' · ' + (upcoming.well || 'pozo sin asignar') + ' ' + (upcoming.turno || '') : 'sin riegos futuros programados') + (missingTurns ? ' · ' + missingTurns + ' pozo(s) sin turno configurado' : '')} />
      <Card title="Estado hídrico" to="/water-energy" values={[[ 'Agua útil', average == null ? pending(overview) : number(average) + '%' ], ['Bajo umbral', usable.length ? below : pending(overview)]]} detail={usable.length + ' de ' + lots.length + ' lotes con datos · agua útil promedio'} />
      <Card title="Energía" to="/water-energy/energia" values={[[ 'Programada', scheduled ? number(scheduled.totalKwh) + (scheduled.totalKwh == null ? '' : ' kWh') : pending(pumps.isPending ? pumps : overview) ], ['Recomendada', recommended ? number(recommended.totalKwh) + ' kWh' : pending(overview)]]} detail="Próximos 7 días · estimaciones. La recomendada es adicional y se calcula por lote." />
      <Card title="Objetivos" to="/lotes" values={[[ 'Objetivo', target > 0 ? number(target / 1000) + ' t' : 'Sin objetivos' ], ['Cumplimiento esperado', target > 0 && estimated != null ? number(estimated / target * 100) + '%' : 'Sin estimación']]} detail={'Últimos objetivos registrados · ' + objectives.length + ' de ' + lots.length + ' lotes'} />
    </div>
    <Suspense fallback={<div className="h-[320px] rounded-2xl border bg-white p-5 text-sm text-slate-500">Cargando mapa…</div>}><DashboardMap lots={lots} rows={rows} farm={selected} /></Suspense>
    {climateFarm ? <WeatherPanel farms={wf} farmId={climateFarm.id} compact hideSelector /> : <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold">Clima y pronóstico</h2><p className="mt-2 text-sm text-slate-500">{weatherFarms.isPending ? 'Cargando…' : 'No hay información meteorológica para esta finca.'}</p></section>}
    {overview.dataUpdatedAt > 0 && <p className="text-xs text-slate-400">Balance calculado: {new Date(overview.dataUpdatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}. Los lotes sin datos no se incluyen en el promedio.</p>}
  </div>;
}
