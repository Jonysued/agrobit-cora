import React from 'react';
import { base44 } from '@/api/base44Client';
import { Pencil, Trash2, Pause, Play, Droplets } from 'lucide-react';

const fmtDate=s=>s?new Date(`${s}T00:00:00`).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}):'—';
const fmtRange=p=>{if(!p.start_time)return '—';if(!p.duration_min)return p.start_time;const [h,m]=p.start_time.split(':').map(Number);const e=(h*60+m+p.duration_min)%1440;return `${p.start_time} – ${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};

export default function ProgramList({programs,lots,onEdit,onChange}){
  const lotNames=p=>(p.lot_ids||[]).map(id=>lots.find(l=>l.id===id)?.name).filter(Boolean).join(', ')||'—';
  const toggleStatus=async p=>{await base44.entities.IrrigationProgram.update(p.id,{status:p.status==='Pausado'?'Activo':'Pausado'});onChange();};
  const del=async p=>{await base44.entities.IrrigationProgram.delete(p.id);await base44.entities.IrrigationLog.deleteMany({program_id:p.id});onChange();};
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold"><Droplets size={17} className="text-emerald-700"/>Programas configurados</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{programs.length}</span>
      </div>
      {programs.length===0?(
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Sin programas de riego. Creá el primero desde el panel izquierdo.</p>
      ):(
        <div className="space-y-3">
          {programs.map(p=>(
            <article key={p.id} className="grid items-center gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[130px_1fr_auto_auto]">
              <b className="text-emerald-800">{fmtDate(p.date)}</b>
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-700">{fmtRange(p)}</p>
                <p className="text-xs text-slate-400">{[p.duration_min?`${p.duration_min} min`:'',lotNames(p)!=='—'?lotNames(p):'',p.turno?`Turno ${p.turno}`:'',p.notes].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-bold text-slate-600">{p.well||'—'}</span>
              <div className="flex items-center gap-1.5">
                {p.status==='Activo'||p.status==='Pausado'?
                  <button onClick={()=>toggleStatus(p)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${p.status==='Pausado'?'bg-slate-200 text-slate-600':'bg-emerald-100 text-emerald-800'}`}>{p.status==='Pausado'?<Play size={12}/>:<Pause size={12}/>}{p.status==='Pausado'?'Reanudar':'Pausar'}</button>
                :<span className={`rounded-full px-3 py-1.5 text-xs font-bold ${p.status==='Programado'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-500'}`}>{p.status}</span>}
                <button onClick={()=>onEdit(p)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={13}/>Editar</button>
                <button onClick={()=>del(p)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={15}/></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}