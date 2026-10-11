import React from 'react';
import { CalendarClock } from 'lucide-react';

const fmtDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });

// Planning affects the future scenario; execution comes from Monitoring.
export default function ScheduledIrrigationPanel({ detail }) {
  const scheduled = detail.events?.scheduledPrograms || [];
  if (!scheduled.length) return null;
  const effNote = e => detail.efficiency != null ? ` · +${e.mm} mm en el perfil (eficiencia de recarga ${Math.round(detail.efficiency * 100)}%)` : '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-charcoal"><CalendarClock size={17} className="text-sky-700" />Riego pendiente por día</h3>
        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">{scheduled.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {scheduled.map(e => (
          <article key={e.date} className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-sm capitalize text-charcoal">{fmtDate(e.date)}</b>
              <span className="text-xs text-slate-500">{e.gross_mm} mm a aplicar{effNote(e)}</span>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Solo se muestra la parte pendiente, incluyendo hoy. Los riegos de varios días se reparten por fecha. El agua efectivamente aplicada se toma de Monitoreo de riegos, según válvula abierta y pozo encendido.</p>
    </section>
  );
}