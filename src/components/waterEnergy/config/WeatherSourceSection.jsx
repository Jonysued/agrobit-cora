import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { weatherService } from '@/services/waterEnergy/weatherService';

const SOURCES = [
  ['FORECAST_ONLY', 'Pronóstico meteorológico'],
  ['WEATHER_STATION', 'Estación meteorológica propia'],
  ['HYBRID', 'Estación propia + pronóstico'],
];

// Fuente meteorológica de cada finca: solo pronóstico, solo estación,
// o híbrido (recomendado): estación para pasado/presente + forecast a 7 días.
export default function WeatherSourceSection({ lots, farms, onChange }) {
  const names = [...new Set([...(lots || []).map(l => l.farm).filter(Boolean), ...(farms || []).map(f => f.name)])];
  const save = async (name, value) => {
    const farm = (farms || []).find(f => f.name === name);
    if (farm) await weatherService.saveFarmSource(farm.id, value);
    else await weatherService.createFarmSource(name, value);
    onChange();
  };
  return (
    <ConfigPanel title="Fuente meteorológica" description="Elegí cómo obtiene cada finca sus datos de clima. Modo híbrido (recomendado): estación propia para el pasado y presente, pronóstico para los próximos 7 días.">
      {!names.length ? (
        <p className="text-sm text-slate-400">Todavía no hay fincas cargadas en los lotes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Finca</th>
                <th className="pr-3">Fuente meteorológica</th>
              </tr>
            </thead>
            <tbody>
              {names.map(n => {
                const farm = (farms || []).find(f => f.name === n);
                return (
                  <tr key={n} className="border-b border-slate-100">
                    <td className="py-2 pr-3"><b className="text-slate-700">{n}</b></td>
                    <td className="py-2 pr-3">
                      <select value={farm?.weather_source || 'FORECAST_ONLY'} onChange={e => save(n, e.target.value)} className={inputCls}>
                        {SOURCES.map(([value, label]) => (
                          <option key={value} value={value}>{label}{value === 'HYBRID' ? ' ⭐ recomendado' : ''}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ConfigPanel>
  );
}