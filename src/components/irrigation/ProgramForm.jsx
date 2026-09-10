import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { Droplets, Plus, Pencil, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { WELL_TURNOS, PORTION_LABELS, factorOf } from '@/lib/irrigationTurnos';
import { es } from 'date-fns/locale';

const STATUSES=['Programado','Activo','Pausado','Finalizado'];
const WELLS=['Pozo 1','Pozo 2','Pozo 3','Pozo 4','Pozo 5','Pozo 6','Pozo 7','Glonet 1','Glonet 2'];
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const toDate=s=>s?new Date(`${s}T00:00:00`):null;
const blank=()=>({date:null,start_time:'06:00',end_time:'',well:'',turno:'',mm:'',status:'Programado',notes:''});
const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const endDefault=d=>{if(!d?.start_time||d?.duration_min==null)return '';const e=(toMin(d.start_time)+Number(d.duration_min))%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};

export default function ProgramForm({lots,programs=[],edit,onSaved,onCancel}){
  const [form,setForm]=useState(edit?{
    date:toDate(edit.date),start_time:edit.start_time||'06:00',end_time:endDefault(edit),well:edit.well||'',turno:edit.turno||'',mm:edit.mm??'',status:edit.status||'Programado',notes:edit.notes||''
  }:blank());
  const [busy,setBusy]=useState(false);
  const turnos=WELL_TURNOS[form.well]||[];
  const selectedTurno=turnos.find(t=>t.value===form.turno);
  const resolveLot=code=>{
    const k=code.toLowerCase().trim();
    return lots.find(l=>(l.name||'').toLowerCase().trim()===k)||lots.find(l=>{
      const n=(l.name||'').toLowerCase().trim();
      return n.startsWith(k+' ')||n.startsWith(k+'-');
    });
  };
  const items=selectedTurno?selectedTurno.lots.map(({lot,portion})=>({code:lot,portion,lotRec:resolveLot(lot)})):[];
  const mmNum=Number(form.mm)||0;
  const busyOverlap=p=>{
    if(p.id===edit?.id||!(p.status==='Programado'||p.status==='Activo')||!p.start_time||!p.duration_min||!p.date)return false;
    if(!form.end_time||!form.date||p.well!==form.well)return false;
    const s=toMin(form.start_time),dur=((toMin(form.end_time)-s)%1440+1440)%1440;
    const pd=Number(p.duration_min);
    if(dur<=0||!(pd>0))return false;
    return p.date===isoDate(form.date)&&toMin(p.start_time)<s+dur&&s<toMin(p.start_time)+pd;
  };
  const busyWell=(programs||[]).find(p=>p.well===form.well&&busyOverlap(p));
  const conflict=!!busyWell;
  const endTime=p=>{const [h,m]=p.start_time.split(':').map(Number);const e=(h*60+m+Number(p.duration_min))%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const submit=async e=>{
    e.preventDefault();setBusy(true);
    const mins=form.end_time?((toMin(form.end_time)-toMin(form.start_time))%1440+1440)%1440:undefined;
    const itemsOut=selectedTurno?items.map(({code,portion,lotRec})=>({lot_id:lotRec?.id||null,lot_name:code,portion:PORTION_LABELS[portion],factor:factorOf(portion)})):(edit?.items||[]);
    const lotIds=selectedTurno?[...new Set(itemsOut.map(i=>i.lot_id).filter(Boolean))]:[...(edit?.lot_ids||[])];
    const payload={lot_ids:lotIds,items:itemsOut,mm:mmNum||undefined,date:isoDate(form.date),start_time:form.start_time,duration_min:mins,well:form.well,turno:form.turno||undefined,status:form.status,notes:form.notes};
    if(edit) await base44.entities.IrrigationProgram.update(edit.id,payload);
    else await base44.entities.IrrigationProgram.create(payload);
    setBusy(false);onSaved();
  };
  const field=(k,label,type='text')=>(
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
      <input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} required className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
    </div>
  );
  return (
    <form onSubmit={submit} className="h-fit self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Droplets size={18}/></span>
          <div>
            <h2 className="text-base font-bold text-charcoal">{edit?'Editar programa':'Programar riego'}</h2>
            <p className="text-xs text-slate-500">Elegí pozo y turno; cargá mm, fecha y horario</p>
          </div>
        </div>
        {edit&&<button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>}
      </div>
      <div className="mt-5 space-y-4">
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pozo</label>
          <select value={form.well} onChange={e=>{set('well',e.target.value);set('turno','');}} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
            <option value="">Seleccionar pozo…</option>
            {WELLS.map(w=>{const b=w===form.well?busyWell:(programs||[]).find(p=>p.well===w&&busyOverlap(p));return <option key={w} disabled={!!b} className="text-slate-800">{b?`${w} · ocupado ${b.start_time}–${endTime(b)}`:w}</option>;})}
          </select>
          {conflict&&<p className="text-xs font-semibold text-red-600">{form.well} ya está asignado a otro programa ({busyWell.start_time}–{endTime(busyWell)}) en esa fecha y horario.</p>}
        </div>
        {turnos.length>0&&(
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Turno</label>
            <select value={form.turno} onChange={e=>set('turno',e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
              <option value="">Seleccionar turno…</option>
              {turnos.map(t=><option key={t.value} value={t.value}>{t.value} — {t.lots.map(({lot,portion})=>lot+(portion?` ${portion}`:'')).join(' · ')}</option>)}
            </select>
          </div>
        )}
        {selectedTurno&&(
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lotes del turno</p>
            <ul className="mt-2 space-y-1.5">
              {items.map((it,i)=>(
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className={it.lotRec?'text-slate-700':'text-slate-400'}>{it.code}{!it.lotRec&&' · sin lote registrado'}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{PORTION_LABELS[it.portion]}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lámina del programa (mm)</label>
              <input type="number" step="0.1" min="0" value={form.mm} onChange={e=>set('mm',e.target.value)} placeholder="20" className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
            </div>
            {mmNum>0&&(
              <div className="mt-2 space-y-1 rounded-lg border border-emerald-100 bg-emerald-50 p-2.5">
                {items.map((it,i)=>{const f=factorOf(it.portion);return(
                  <p key={i} className="text-xs text-emerald-900">Se regará {it.code}{it.portion?` ${PORTION_LABELS[it.portion]}`:''}. Al lote {it.code} se le cargarán {(mmNum*f).toFixed(1)} mm ({Math.round(f*100)}% de {mmNum} mm).</p>
                );})}
              </div>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fecha de riego</label>
          <Calendar mode="single" selected={form.date} onSelect={d=>set('date',d)} locale={es} className="justify-self-start rounded-lg border border-slate-200 p-2 text-xs"/>
        </div>
        <div className="grid grid-cols-2 gap-3">{field('start_time','Hora inicio','time')}{field('end_time','Hora fin','time')}</div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado</label>
          <select value={form.status} onChange={e=>set('status',e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notas</label>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows="2" placeholder="Observaciones del programa…" className="resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"/>
        </div>
      </div>
      <button disabled={busy||conflict||!form.date||!form.well||(turnos.length>0&&!form.turno)||(selectedTurno&&!(mmNum>0))} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':edit?<><Pencil size={16}/>Guardar cambios</>:<><Plus size={16}/>Crear programa</>}</button>
    </form>
  );
}