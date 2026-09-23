import React from 'react';
import { Maximize2 } from 'lucide-react';

export default function ProbeChartCard({ icon: Icon, title, subtitle, onOpen, children, available = true }) {
  return (
    <article
      className={`group rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm transition md:p-5 ${available ? 'cursor-pointer hover:-translate-y-0.5 hover:border-emerald-700/30 hover:shadow-md' : ''}`}
      onClick={available ? onOpen : undefined}
      onKeyDown={available ? e => { if (e.key === 'Enter' || e.key === ' ') onOpen(); } : undefined}
      role={available ? 'button' : undefined}
      tabIndex={available ? 0 : undefined}
    >
      <div className="mb-3 flex min-h-10 items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 gap-2.5">
          <Icon size={19} className="mt-0.5 shrink-0 text-emerald-800" />
          <div>
            <h2 className="text-sm font-extrabold text-charcoal md:text-base">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[10px] text-slate-500 md:text-xs">{subtitle}</p>}
          </div>
        </div>
        {available && <Maximize2 size={17} className="shrink-0 text-slate-400 transition group-hover:text-emerald-700" />}
      </div>
      <div className="pointer-events-none">{children}</div>
    </article>
  );
}
