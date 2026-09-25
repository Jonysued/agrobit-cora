import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Droplets, Layers3, Sprout, Thermometer, Zap } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import ProbeChartCard from '@/components/waterEnergy/soil/ProbeChartCard';
import { EmptyChart, MoistureLines, PROBE_RANGES, WaterSumChart } from '@/components/waterEnergy/soil/ProbeCharts';
import { soilWaterService, CONFIG_LABELS } from '@/services/waterEnergy';

const SOURCE_LABEL = { LIVE: 'En vivo', CSV: 'Importado CSV', MANUAL: 'Manual', DEMO: 'Demo' };
const CHARTS = [
  { id: 'moisture', title: 'Humedad del suelo', icon: Droplets, subtitle: 'Lecturas por profundidad' },
  { id: 'profile', title: 'Suma del perfil', icon: Droplets, subtitle: 'Agua almacenada en todo el perfil' },
  { id: 'root', title: 'Suma de la zona de la raíz', icon: Sprout, subtitle: 'Agua útil en la zona radicular' },
  { id: 'temperature', title: 'Temperatura', icon: Thermometer, subtitle: 'Temperatura por profundidad' },
  { id: 'conductivity', title: 'Conductividad eléctrica', icon: Zap, subtitle: 'Conductividad por profundidad' },
  { id: 'stacked', title: 'Apilado de humedad del suelo', icon: Layers3, subtitle: 'Respuesta comparada entre profundidades' },
];

function dayChange(history) {
  if (!history?.length) return null;
  const last = history.at(-1);
  const previous = [...history].reverse().find(point => point.t <= last.t - 86400000);
  return previous ? Math.round((last.profile - previous.profile) * 10) / 10 : null;
}

function Summary({ data }) {
  const change = dayChange(data.history);
  return (
    <div className="grid gap-2 rounded-2xl border border-emerald-950/10 bg-white p-3 shadow-sm sm:grid-cols-3 sm:p-4">
      <div className="rounded-xl bg-[#f2f7ef] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado hídrico</p>
        <p className="mt-1 text-lg font-extrabold text-emerald-900">{data.status || (data.configuration_status === 'unlinked' ? 'Solo medición' : 'Sin configurar')}</p>
      </div>
      <div className="rounded-xl bg-[#f2f7ef] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Suma del perfil</p>
        <p className="mt-1 text-lg font-extrabold text-charcoal">{data.total_profile_water_mm ?? '—'} <span className="text-xs text-slate-500">mm</span></p>
      </div>
      <div className="rounded-xl bg-[#f2f7ef] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Variación 24 h</p>
        <p className={`mt-1 text-lg font-extrabold ${change > 0 ? 'text-emerald-700' : change < 0 ? 'text-amber-700' : 'text-charcoal'}`}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change} mm`}</p>
      </div>
    </div>
  );
}

function ChartContent({ id, data, range, compact }) {
  const height = compact ? 230 : 520;
  const measurementChannels = data.measurement_channels || data.channels || [];
  const typed = type => measurementChannels.filter(channel => channel.sensor_type === type);
  if (id === 'moisture') return <MoistureLines readings={data.readings} channels={data.channels} events={data.events} range={range} compact={compact} height={height} />;
  if (id === 'stacked') return <MoistureLines readings={data.readings} channels={data.channels} range={range} compact={compact} stacked height={height} />;
  if (id === 'profile') return <WaterSumChart history={data.history} range={range} compact={compact} height={height} recharge={data.recharge_storage_mm} target={data.target_storage_mm} capacity={data.field_capacity_storage_mm} />;
  if (id === 'root') return <WaterSumChart history={data.history} range={range} compact={compact} height={height} mode="root" recharge={data.recharge_threshold_mm} target={data.target_water_mm} capacity={data.total_available_water_capacity_mm} />;
  if (id === 'temperature') {
    const channels = typed('soil_temperature');
    return channels.length
      ? <MoistureLines readings={data.readings} channels={channels} range={range} compact={compact} height={height} unit={channels[0]?.unit || '°C'} />
      : <EmptyChart message="Temperatura no disponible" />;
  }
  const channels = typed('electrical_conductivity');
  return channels.length
    ? <MoistureLines readings={data.readings} channels={channels} range={range} compact={compact} height={height} unit={channels[0]?.unit || 'VIC'} />
    : <EmptyChart message="Conductividad no disponible" />;
}

function ProbeDashboard({ data, openChart }) {
  return (
    <>
      <Summary data={data} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {CHARTS.filter(chart => data.configuration_status !== 'unlinked' || chart.id !== 'root').map(chart => {
          const allChannels = data.measurement_channels || [];
          const available = chart.id === 'temperature'
            ? allChannels.some(channel => channel.sensor_type === 'soil_temperature')
            : chart.id === 'conductivity'
              ? allChannels.some(channel => channel.sensor_type === 'electrical_conductivity')
              : true;
          return (
            <ProbeChartCard key={chart.id} {...chart} available={available} onOpen={() => openChart(chart.id)}>
              <ChartContent id={chart.id} data={data} range="30d" compact />
            </ProbeChartCard>
          );
        })}
      </div>
    </>
  );
}

function ProbeChartDetail({ data, chartId, setChartId }) {
  const [range, setRange] = useState('30d');
  const selected = CHARTS.find(chart => chart.id === chartId) || CHARTS[0];
  const SelectedIcon = selected.icon;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-[240px]">
            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Medición</label>
            <select value={chartId} onChange={e => setChartId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-charcoal outline-none focus:border-emerald-700 xl:w-72">
              {CHARTS.filter(chart => data.configuration_status !== 'unlinked' || chart.id !== 'root').map(chart => <option key={chart.id} value={chart.id}>{chart.title}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><CalendarDays size={13} /> Rango de fechas</p>
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {PROBE_RANGES.map(([id, , label]) => <button key={id} type="button" onClick={() => setRange(id)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${range === id ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500 hover:text-charcoal'}`}>{label}</button>)}
            </div>
            {data.readings?.length > 0 && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Lecturas guardadas desde {new Date(data.readings[0].timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
            )}
          </div>
        </div>
      </div>
      <section className="rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-3 flex items-start gap-2.5 border-b border-slate-100 pb-4">
          <SelectedIcon size={21} className="mt-0.5 text-emerald-800" />
          <div><h2 className="text-lg font-extrabold text-charcoal">{selected.title}</h2><p className="text-xs text-slate-500">{selected.subtitle}</p></div>
        </div>
        <div className="min-h-[340px] overflow-hidden"><ChartContent id={chartId} data={data} range={range} compact={false} /></div>
      </section>
    </div>
  );
}

export default function WaterEnergySoilPoint() {
  const { probeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const chartId = searchParams.get('grafico');
  useEffect(() => {
    setData(null); setErr(false);
    soilWaterService.getProbeAnalysis(probeId).then(setData).catch(() => setErr(true));
  }, [probeId]);
  const validChart = useMemo(() => CHARTS.some(chart => chart.id === chartId && (data?.configuration_status !== 'unlinked' || chart.id !== 'root')), [chartId, data]);
  if (!data) return err ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la sonda.</div> : <LoadingState />;
  const missingText = (data.missing_configuration || []).map(k => CONFIG_LABELS[k] || k).join(', ');
  const setChart = id => id ? setSearchParams({ grafico: id }) : setSearchParams({});

  return (
    <div className={`mx-auto space-y-5 p-4 md:p-6 ${validChart ? 'max-w-[1600px]' : 'max-w-[1500px]'}`}>
      <ModuleHeader />
      <div>
        <button type="button" onClick={() => validChart ? setChart(null) : navigate('/water-energy/sensores')} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 hover:underline"><ArrowLeft size={13} /> {validChart ? 'Todos los gráficos' : 'Sensores'}</button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-extrabold text-charcoal md:text-2xl">{data.probe?.name}</h1><p className="mt-0.5 text-xs text-slate-500">{data.lot?.name || 'Sin lote vinculado'} · última lectura {data.lastReadingAt ? new Date(data.lastReadingAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p></div>
          <div className="flex items-center gap-2">{data.probe?.connection_status === 'disconnected' && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase text-red-700">Desconectada</span>}<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-800">{SOURCE_LABEL[data.source] || data.source}</span></div>
        </div>
      </div>
      {data.missing ? <div className="rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm"><p className="text-sm font-semibold text-charcoal">{data.missing}</p></div> : (
        <>
          {data.configuration_status === 'incomplete' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">Configuración incompleta: {missingText}. Completala en Water & Energy → Configuración.</div>}
          {validChart ? <ProbeChartDetail data={data} chartId={chartId} setChartId={setChart} /> : <ProbeDashboard data={data} openChart={setChart} />}
          {data.coverage_status === 'partial' && <p className="text-xs font-semibold text-amber-700">Cobertura parcial: la sonda mide hasta {data.measured_profile_depth_cm} cm de los {data.root_zone_depth_cm} cm configurados.</p>}
        </>
      )}
    </div>
  );
}
