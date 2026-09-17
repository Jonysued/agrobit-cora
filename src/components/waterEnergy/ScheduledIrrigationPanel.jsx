import React, { useState } from 'react';
import { CalendarClock, Check, X } from 'lucide-react';
import { waterForecastService } from '@/services/waterEnergy';

const fmtDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
const round1 = n => Math.round(n * 10) / 10;

// Panel de riegos PROGRAMADOS del lote (IrrigationProgram). Al
// confirmar la ejecución se guarda el IrrigationLog con los mm
// REALMENTE aplicados y el programa pasa a Finalizado: el evento sale
// del cronograma (curva azul del gráfico) y entra al histórico como
// ejecutado (curva negra), con la curva, el forecast y la
// recomendación recalculados a partir de los mm reales.
export default function ScheduledIrrigationPanel({ detail, onConfirmed }) {
  const scheduled = detail.events?.scheduledPrograms || [];
  const [confirming, setConfirming] = useState(null); // program_id en confirmación
  const [applied, setApplied] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  if (!scheduled.length) return null;

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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-charcoal"><CalendarClock size={17} className="text-sky-700" />Riegos programados del lote</h3>
        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">{scheduled.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {scheduled.map(e => (
          <article key={e.program_id} className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
            {confirming === e.program_id ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
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
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm capitalize text-charcoal">{fmtDate(e.date)}</b>
                <span className="text-xs text-slate-500">
                  {e.gross_mm} mm a aplicar
                  {detail.efficiency != null ? ` · +${e.mm} mm en el perfil (eficiencia de recarga ${Math.round(detail.efficiency * 100)}%)` : ''}
                </span>
                <button onClick={() => startConfirm(e)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200">
                  <Check size={12} />Confirmar ejecución
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Al confirmar, el riego pasa de programado a ejecutado con los mm reales: el histórico, la curva de Suma de perfil, el forecast y la recomendación se recalculan.</p>
    </section>
  );
}