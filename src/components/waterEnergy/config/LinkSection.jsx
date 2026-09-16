import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { waterForecastService } from '@/services/waterEnergy';

// Vinculación de cada perfil de suelo con su sensor, bomba y tarifa.
// Las estimaciones y proyecciones del módulo se basan en esta vinculación;
// la opción "Automático" mantiene el comportamiento por defecto.
export default function LinkSection({ lots, profiles, sensors, pumps, tariffs, onChange }) {
  const save = async (profile, field, value) => {
    await waterForecastService.saveProfile({ ...profile, [field]: value || null });
    onChange();
  };
  return (
    <ConfigPanel title="Vinculación de perfiles" description="Linkeá cada perfil de suelo a su sensor de humedad, bomba y tarifa energética — las estimaciones y proyecciones se calculan con esta vinculación.">
      {!profiles.length ? (
        <p className="text-sm text-slate-400">Configurá primero un perfil de suelo para poder vincularlo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Lote</th>
                <th className="pr-3">Sensor de humedad</th>
                <th className="pr-3">Bomba</th>
                <th className="pr-3">Tarifa energética</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="py-2 pr-3">
                    <select value={p.sensor_id || ''} onChange={e => save(p, 'sensor_id', e.target.value)} className={inputCls}>
                      <option value="">Automático · cualquier sensor del lote</option>
                      {sensors.filter(s => s.lot_id === p.lot_id || s.id === p.sensor_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={p.pump_id || ''} onChange={e => save(p, 'pump_id', e.target.value)} className={inputCls}>
                      <option value="">Automático · por lote / sector</option>
                      {pumps.map(b => <option key={b.id} value={b.id}>{b.name}{b.irrigation_sector ? ` · ${b.irrigation_sector}` : ''}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={p.tariff_id || ''} onChange={e => save(p, 'tariff_id', e.target.value)} className={inputCls}>
                      <option value="">Automático · primera tarifa</option>
                      {tariffs.map(t => <option key={t.id} value={t.id}>{t.name} · $ {t.price_per_kwh}/kWh</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConfigPanel>
  );
}