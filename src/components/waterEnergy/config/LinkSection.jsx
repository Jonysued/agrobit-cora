import React from 'react';
import ConfigPanel, { inputCls } from './ConfigPanel';
import { waterForecastService } from '@/services/waterEnergy';

function CalibrationStatus({ model }) {
  if (!model) return null;
  const label = model.calibration_status === 'calibrated' ? 'Calibrado'
    : model.calibration_status === 'partial' ? 'Aprendizaje parcial'
    : model.calibration_status === 'sin_datos' ? 'Sin datos suficientes'
    : 'En observación';
  const last = model.last_calibration_at
    ? `Última calibración: ${new Date(model.last_calibration_at).toLocaleString('es-AR')}`
    : 'Aún sin parámetros aprendidos';
  return <span className="shrink-0 text-xs text-slate-500" title={last}>{label}</span>;
}

// Vinculación de cada lote (vía su perfil de suelo) a su MODELO DE
// SUELO y a su bomba. El modelo de suelo representa el comportamiento
// aprendido de una sonda de referencia: la sonda NO mide la humedad
// del lote — el estado hídrico de cada lote se calcula con sus
// propios riegos, lluvia y demanda del cultivo. La tarifa energética
// es global (igual para todos los lotes).
export default function LinkSection({ lots, profiles, probes, models, pumps, onChange }) {
  const save = async (profile, field, value) => {
    await waterForecastService.saveProfile({ ...profile, [field]: value || null });
    onChange();
  };
  const probeById = new Map((probes || []).map(p => [p.id, p]));
  // Selección actual: modelo explícito, o el derivado del vínculo
  // histórico con la sonda (probe_id → modelo con esa referencia)
  const valueFor = p => p.soil_behavior_model_id
    || (models || []).find(m => m.reference_probe_id === p.probe_id)?.id
    || '';
  return (
    <ConfigPanel title="Vinculación de perfiles" description="Linkeá cada lote (a través de su perfil de suelo) a su MODELO DE SUELO y a su pozo o bomba. El modelo de suelo aprende el comportamiento del terreno a partir de una sonda de referencia — la sonda no mide la humedad del lote: la curva de cada lote se calcula con sus propios riegos, lluvia, clima y cultivo.">
      {!profiles.length ? (
        <p className="text-sm text-slate-400">Configurá primero un perfil de suelo para poder vincularlo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Lote</th>
                <th className="pr-3">Modelo de suelo</th>
                <th className="pr-3">Pozo / bomba</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <select value={valueFor(p)} onChange={e => save(p, 'soil_behavior_model_id', e.target.value)} className={inputCls}>
                        <option value="">Sin modelo de suelo</option>
                        {(models || []).map(m => {
                          const probe = probeById.get(m.reference_probe_id);
                          const eff = m.recharge_efficiency != null ? ` · recarga ${Math.round(m.recharge_efficiency * 100)}%` : '';
                          return <option key={m.id} value={m.id}>{m.name}{probe ? ` · Ref: ${probe.name}` : ''}{eff}</option>;
                        })}
                      </select>
                      <CalibrationStatus model={(models || []).find(m => m.id === valueFor(p))} />
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={p.pump_id || ''} onChange={e => save(p, 'pump_id', e.target.value)} className={inputCls}>
                      <option value="">Automático · por lote / sector</option>
                      {pumps.map(b => <option key={b.id} value={b.id}>{b.name}{b.farm ? ` · ${b.farm}` : ''}{b.irrigation_sector ? ` · ${b.irrigation_sector}` : ''}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Cada sonda aprende de todas las subidas y bajadas de su perfil completo, sin dividirlo en “húmedo” y “seco”. Los riegos, el Kc y la suma de perfil siguen siendo propios de cada lote.</p>
    </ConfigPanel>
  );
}
