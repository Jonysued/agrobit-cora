import React, { useEffect, useState } from 'react';
import { CloudRain, CloudSun, Droplets, Sun, Thermometer, Wind } from 'lucide-react';
import { weatherService } from '@/services/waterEnergy/weatherService';

const MODE_LABELS = { FORECAST_ONLY: 'Pronóstico meteorológico', WEATHER_STATION: 'Estación meteorológica propia', HYBRID: 'Estación propia + pronóstico' };
const timeOf = ts => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';
const dayLabel = d => new Date(`${d}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
      <Icon size={15} className="mx-auto text-emerald-700" />
      <p className="mt-1 text-base font-bold text-charcoal">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

// Panel meteorológico del dashboard: dato observado de la estación propia
// (si la finca la tiene) + pronóstico a 15 días con su fuente.
export default function WeatherPanel({ farms: farmsProp, farmId: farmIdProp, onFarmChange, compact = false, hideSelector = false }) {
  // Modo controlado: la página pasa la lista y la finca seleccionada
  // (el selector define qué lotes se ven abajo). Sin props, autónomo.
  const [ownFarms, setOwnFarms] = useState([]);
  const [ownFarmId, setOwnFarmId] = useState(null);
  const farms = farmsProp || ownFarms;
  const farmId = farmIdProp ?? ownFarmId;
  const setFarmId = onFarmChange || setOwnFarmId;
  const [combined, setCombined] = useState(undefined);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (farmsProp) return;
    weatherService.getFarms().then(fs => { setOwnFarms(fs); if (fs.length) setOwnFarmId(fs[0].id); }).catch(() => setOwnFarms([]));
  }, []);
  useEffect(() => {
    if (!farmId) return;
    let active = true;
    setCombined(undefined);
    const farm = farms.find(f => f.id === farmId);
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      weatherService.getCombinedWeather(farm)
        .then(result => { if (active) setCombined(result); })
        .catch(() => { if (active) setCombined(previous => previous || { failed: true }); });
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [farmId]);
  if (!farms.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-charcoal"><CloudSun size={18} className="text-emerald-700" /> {compact ? `Clima y pronóstico · ${farms.find(f => f.id === farmId)?.name || ''}` : 'Condiciones meteorológicas'}</h2>
        {!hideSelector && <select aria-label="Finca meteorológica" value={farmId || ''} onChange={e => setFarmId(e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm">
          {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>}
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Condiciones actuales · {MODE_LABELS[combined?.mode] || '—'}</p>
          {combined === undefined ? (
            <p className="mt-2 text-sm text-slate-400">Cargando…</p>
          ) : combined?.current ? (
            <>
              <div className={`mt-2 grid grid-cols-3 gap-2 ${compact ? '' : 'sm:grid-cols-6'}`}>
                <Metric icon={Thermometer} label="Temp" value={`${combined.current.temperature_c == null ? '—' : Math.round(combined.current.temperature_c)}°C`} />
                {!compact && <Metric icon={Droplets} label="Humedad" value={combined.current.relative_humidity_percent != null ? `${Math.round(combined.current.relative_humidity_percent)}%` : '—'} />}
                <Metric icon={Wind} label="Viento" value={combined.current.wind_speed_kmh != null ? `${Math.round(combined.current.wind_speed_kmh)} km/h` : '—'} />
                <Metric icon={CloudRain} label="Lluvia" value={combined.current.rainfall_mm != null ? `${combined.current.rainfall_mm} mm` : '—'} />
                {!compact && <Metric icon={Sun} label="Radiación" value={combined.current.solar_radiation_w_m2 != null ? `${Math.round(combined.current.solar_radiation_w_m2)}` : '—'} />}
                {!compact && <Metric icon={CloudSun} label="ET0" value={(combined.current.et_day_mm ?? combined.current.eto_mm) != null ? `${combined.current.et_day_mm ?? combined.current.eto_mm} mm` : '—'} />}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Fuente (dato observado): <b className="text-slate-700">{combined.station?.name || 'Estación'}</b> · Último dato: <b className="text-slate-700">{timeOf(combined.current.timestamp)}</b>
              </p>
            </>
          ) : (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              Dato observado no disponible — {combined?.failed ? 'no se pudo cargar.' : combined.mode === 'FORECAST_ONLY' ? 'esta finca usa solo pronóstico.' : combined.station ? 'la estación todavía no envió datos.' : 'todavía no tiene estación vinculada.'}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pronóstico {compact && !expanded ? '5' : '15'} días · Fuente: <b className="text-slate-600">{combined?.forecastSource || '—'}</b></p>
          {combined === undefined ? (
            <p className="mt-2 text-sm text-slate-400">Cargando…</p>
          ) : (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {(combined?.forecast || []).slice(0, compact && !expanded ? 5 : 15).map(d => (
                <div key={d.date} className="w-[76px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{dayLabel(d.date)}</p>
                  <p className="mt-1 text-sm font-bold text-charcoal">{Math.round(d.temperature_max_c)}° / {Math.round(d.temperature_min_c)}°</p>
                  <p className="text-[10px] font-semibold text-sky-600">{d.rainfall_mm > 0 ? `${d.rainfall_mm} mm` : 'sin lluvia'}</p>
                  <p className="text-[10px] text-slate-400">ET0 {d.eto_mm ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {compact && (combined?.forecast?.length || 0) > 5 && <button onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-3 min-h-11 text-sm font-bold text-emerald-800 underline">{expanded ? 'Mostrar menos' : 'Ver pronóstico de 15 días'}</button>}
    </section>
  );
}
