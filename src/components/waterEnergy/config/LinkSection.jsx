import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { waterForecastService } from '@/services/waterEnergy';

// Vinculación de cada perfil de suelo con su sensor de humedad.
// La tarifa energética y la bomba son globales (iguales para todos los lotes).
export default function LinkSection({ lots, profiles, sensors, onChange }) {
  const save = async (profile, field, value) => {
    await waterForecastService.saveProfile({ ...profile, [field]: value || null });
    onChange();
  };
  return (
    <ConfigPanel title="Vinculación de perfiles" description="Linkeá cada perfil de suelo a su sensor de humedad — la humedad actual y las proyecciones se calculan con esa vinculación. La bomba y la tarifa energética son globales para todos los lotes.">
      {!profiles.length ? (
        <p className="text-sm text-slate-400">Configurá primero un perfil de suelo para poder vincularlo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Lote</th>
                <th className="pr-3">Sensor de humedad</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConfigPanel>
  );
}