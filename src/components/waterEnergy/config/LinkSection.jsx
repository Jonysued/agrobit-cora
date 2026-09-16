import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { sensorService, waterForecastService } from '@/services/waterEnergy';

// Vinculación de cada lote (vía su perfil de suelo) a su sonda de humedad
// y a su bomba. Al vincular una sonda, se le asigna el lote: aparece en el
// módulo Sensores y alimenta los pronósticos con sus datos reales.
// La tarifa energética es global (igual para todos los lotes).
export default function LinkSection({ lots, profiles, probes, pumps, onChange }) {
  const save = async (profile, field, value) => {
    if (field === 'probe_id' && value) await sensorService.attachProbeToLot(value, profile.lot_id);
    await waterForecastService.saveProfile({ ...profile, [field]: value || null });
    onChange();
  };
  return (
    <ConfigPanel title="Vinculación de perfiles" description="Linkeá cada lote (a través de su perfil de suelo) a su sonda de humedad y a su bomba — la sonda vinculada aparece en el módulo Sensores y los pronósticos se calculan con sus datos reales. La tarifa energética es global para todos los lotes.">
      {!profiles.length ? (
        <p className="text-sm text-slate-400">Configurá primero un perfil de suelo para poder vincularlo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Lote</th>
                <th className="pr-3">Sonda de humedad</th>
                <th className="pr-3">Bomba</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="py-2 pr-3">
                    <select value={p.probe_id || ''} onChange={e => save(p, 'probe_id', e.target.value)} className={inputCls}>
                      <option value="">Sin sonda vinculada</option>
                      {probes.map(s => <option key={s.id} value={s.id}>{s.name}{s.provider ? ` · ${s.provider}` : ''}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={p.pump_id || ''} onChange={e => save(p, 'pump_id', e.target.value)} className={inputCls}>
                      <option value="">Automático · por lote / sector</option>
                      {pumps.map(b => <option key={b.id} value={b.id}>{b.name}{b.irrigation_sector ? ` · ${b.irrigation_sector}` : ''}</option>)}
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