import React, { useState } from 'react';
import { Droplets, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { waterForecastService } from '@/services/waterEnergy';

// Inicialización del estado hídrico del lote. El estado de cada lote
// es CALCULADO y evoluciona solo con sus propios eventos (riegos
// ejecutados, lluvia, ETc). Acá se define SOLO el punto de partida:
// un valor manual (mm de suma de perfil, la misma escala del gráfico).
// La sonda de referencia NUNCA define ni iguala el estado del lote:
// solo alimenta el modelo de comportamiento del suelo.
const SOURCE_LABEL = {
  calculated: 'calculado con los eventos del lote',
  initialized: 'inicializado desde la sonda de referencia',
  manual_adjustment: 'inicialización manual',
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function InitialStateConfig({ detail, onSaved }) {
  const { profile, state } = detail;
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed == null || (!isNaN(parsed) && parsed >= 0);

  const run = async (fn) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      setValue('');
      onSaved();
    } catch (e) {
      setError(e?.message || 'No se pudo guardar el estado inicial.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-50 text-cyan-700"><Droplets size={17} /></span>
          <div>
            <h3 className="text-sm font-bold text-charcoal">Estado hídrico del lote (inicialización)</h3>
            <p className="text-xs text-slate-500">
              {state?.total_profile_water_mm != null
                ? `Suma de perfil actual: ${state.total_profile_water_mm} mm (${SOURCE_LABEL[state.state_source] || 'calculado'}) — el estado evoluciona solo con los eventos del lote.`
                : 'Sin estado inicial: la curva del lote necesita un punto de partida.'}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suma de perfil inicial (mm)</label>
            <Input
              type="number" min="0" step="0.1" className="h-9 w-36"
              value={value} placeholder="mm almacenados"
              onChange={e => setValue(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha del estado</label>
            <Input
              type="date" max={todayIso()} className="h-9 w-40"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={saving || !valid || parsed == null || !date} onClick={() => run(() => waterForecastService.initializeManual(profile.lot_id, parsed, date))}>
            <Save size={14} className="mr-1" />Guardar
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      {!valid && <p className="mt-2 text-xs font-semibold text-red-600">Ingresá un valor válido en mm (mayor o igual a 0).</p>}
      {state?.field_capacity_storage_mm != null && (
        <p className="mt-2 text-[11px] text-slate-400">
          Misma escala del gráfico · rango físico: {state.wilting_storage_mm}–{state.field_capacity_storage_mm} mm (marchitez a capacidad de campo) · valores fuera del rango se ajustan al límite más cercano. La curva se reconstruye desde la fecha indicada con los eventos del lote.
        </p>
      )}
    </div>
  );
}