import React, { useState } from 'react';
import { Droplets, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { waterForecastService } from '@/services/waterEnergy';

// Configuración del estado inicial de la proyección hídrica del lote:
// si se define un valor manual (mm de agua útil), la proyección parte
// de ahí; si se limpia, vuelve al valor medido por la sonda.
export default function InitialStateConfig({ detail, onSaved }) {
  const { profile, state } = detail;
  const manual = profile.manual_initial_water_mm;
  const [value, setValue] = useState(manual != null ? String(manual) : '');
  const [saving, setSaving] = useState(false);

  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed == null || (!isNaN(parsed) && parsed >= 0);
  const changed = (parsed == null ? null : parsed) !== (manual != null ? manual : null);

  const save = async (mm) => {
    setSaving(true);
    try {
      await waterForecastService.saveProfile({ id: profile.id, manual_initial_water_mm: mm });
      onSaved();
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
            <h3 className="text-sm font-bold text-charcoal">Estado inicial de la proyección</h3>
            <p className="text-xs text-slate-500">
              {manual != null
                ? `La proyección parte de ${manual} mm (valor manual) · sonda: ${state.current_available_water_mm} mm`
                : `La proyección parte del valor medido por la sonda: ${state.current_available_water_mm} mm`}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inicial manual (mm)</label>
            <Input
              type="number" min="0" step="0.1" className="h-9 w-32"
              value={value} placeholder="Usar sonda"
              onChange={e => setValue(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={saving || !valid || !changed} onClick={() => save(parsed)}>
            <Save size={14} className="mr-1" />Guardar
          </Button>
          {manual != null && (
            <Button size="sm" variant="outline" disabled={saving} onClick={() => { setValue(''); save(null); }}>
              <Undo2 size={14} className="mr-1" />Usar sonda
            </Button>
          )}
        </div>
      </div>
      {!valid && <p className="mt-2 text-xs font-semibold text-red-600">Ingresá un valor válido en mm (mayor o igual a 0).</p>}
    </div>
  );
}