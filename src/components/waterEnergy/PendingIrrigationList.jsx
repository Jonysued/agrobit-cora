import React, { useState } from 'react';
import { CalendarCheck, Check, X } from 'lucide-react';
import { waterForecastService } from '@/services/waterEnergy';

const fmtDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
const round1 = n => Math.round(n * 10) / 10;

// Lista centralizada de riegos A CONFIRMAR (todos los lotes):
// programas de HOY o de fechas PASADAS que todavía no tienen su
// IrrigationLog — la ejecución nunca se confirma por adelantado. Al
// confirmar se guardan los mm REALMENTE aplicados y el programa pasa
// a Finalizado: el riego entra al histórico y la curva de Suma de
// perfil de su lote lo refleja en el estado actual.
export default function PendingIrrigationList({ items, onConfirmed }) {
  const [confirming, setConfirming] = useState(null); // program_id en confirmación
  const [applied, setApplied] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const startConfirm = e => {
    setConfirming(e.program_id);
    setApplied(String(e.gross_mm));
    setError(null);
  };
  const confirm = async e => {
    const mm = round1(Number(applied));
    if (!(mm > 0)) { setError('Ingresá los mm realmente aplicados.'); return; }
    setSaving(true);
    setError(null);
    try {
      await waterForecastService.confirmScheduledIrrigation(e.program_id, mm);
      setConfirming(null);
      onConfirmed?.();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el riego ejecutado.');
    } finally {
      setSaving(false);
    }
  };

  if (!items.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <CalendarCheck size={28} className="mx-auto text-emerald-600" />
        <p className="mt-2 text-sm font-semibold text-charcoal">No hay riegos a confirmar</p>
        <p className="mt-1 text-xs text-slate-400">Todos los riegos de hoy o de fechas pasadas ya tienen su ejecución confirmada.</p>
      </section>
    );
  }

  const effNote = e => e.efficiency != null ? ` · +${e.mm} mm en el perfil (eficiencia de recarga ${Math.round(e.efficiency * 100)}%)` : '';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-charcoal"><CalendarCheck size={17} className="text-amber-600" />Pendientes de confirmación</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{items.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {items.map(e => confirming === e.program_id ? (
          <div key={e.program_id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-sm text-charcoal">{e.lot_name}</b>
              <b className="text-sm capitalize text-charcoal">{fmtDate(e.date)}</b>
              <span className="text-xs text-slate-400">programado: {e.gross_mm} mm</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                mm ejecutados
                <input
                  type="number" step="0.1" min="0" value={applied} autoFocus
                  onChange={ev => setApplied(ev.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <button onClick={() => confirm(e)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                <Check size={12} />{saving ? 'Guardando…' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirming(null)} disabled={saving} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Cancelar">
                <X size={14} />
              </button>
            </div>
            {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
          </div>
        ) : (
          <article key={e.program_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            <div>
              <b className="text-sm text-charcoal">{e.lot_name}</b>
              <span className="ml-1.5 text-[11px] text-slate-400">{e.lot_farm}</span>
            </div>
            <b className="text-sm capitalize text-charcoal">{fmtDate(e.date)}</b>
            <span className="text-xs text-slate-500">{e.gross_mm} mm a aplicar{effNote(e)}</span>
            <button onClick={() => startConfirm(e)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200">
              <Check size={12} />Confirmar ejecución
            </button>
          </article>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">La ejecución se confirma solo el día del riego o después (nunca por adelantado). Al confirmar, el riego pasa de programado a ejecutado con los mm reales: el histórico, la curva de Suma de perfil, el forecast y la recomendación del lote se recalculan.</p>
    </section>
  );
}