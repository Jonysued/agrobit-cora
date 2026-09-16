import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { waterForecastService } from '@/services/waterEnergy';

// Vinculación de cada perfil de suelo con su sonda de humedad
// (punto de monitoreo → sonda del módulo Sensores) y su bomba.
// La tarifa energética es global (igual para todos los lotes).
export default function LinkSection({ lots, profiles, probes, pumps, onChange }) {
  const save = async (profile, field, value) => {
    await waterForecastService.saveProfile({ ...profile, [field]: value || null });
    onChange();
  };
  return (
    <ConfigPanel title="Vinculación de perfiles" description="Linkeá cada perfil de suelo a su sonda de humedad (configurada en Sensores) y a su bomba — las estimaciones y proyecciones se calculan con esa vinculación. La tarifa energética es global para todos los lotes.">
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
                      <option value="">Automático · cualquier sonda del lote</option>
                      {probes.filter(s => s.lot_id === p.lot_id || s.id === p.probe_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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