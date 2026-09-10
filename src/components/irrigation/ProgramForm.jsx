import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { Droplets, Plus, Pencil, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { WELL_TURNOS } from '@/lib/irrigationTurnos';
import { es } from 'date-fns/locale';

const STATUSES=['Programado','Activo','Pausado','Finalizado'];
const WELLS=['Pozo 1','Pozo 2','Pozo 3','Pozo 4','Pozo 5','Pozo 6','Pozo 7','Glonet 1','Glonet 2'];
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const toDate=s=>s?new Date(`${s}T00:00:00`):null;
const blank=()=>({lot_ids:[],date:null,start_time:'06:00',end_time:'',well:'',turno:'',status:'Programado',notes:''});
const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const endDefault=d=>{if(!d?.start_time||d?.duration_min==null)return '';const e=(toMin(d.start_time)+Number(d.duration_min))%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};

export default function ProgramForm({lots,programs=[],edit,onSaved,onCancel}){
  const [form,setForm]=useState(edit?{
    lot_ids:edit.lot_ids||[],date:toDate(edit.date),start_time:edit.start_time||'06:00',end_time:endDefault(edit),well:edit.well||'',turno:edit.turno||'',status:edit.status||'Programado',notes:edit.notes||''
  }:blank());
  const [busy,setBusy]=useState(false);
  const [crop,setCrop]=useState(''),[variety,setVariety]=useState('');
  const crops=[...new Set(lots.map(l=>l.crop).filter(Boolean))].sort();
  const varieties=[...new Set(lots.filter(l=>!crop||l.crop===crop).map(l=>l.variety).filter(Boolean))].sort();
  const shownLots=lots.filter(l=>(!crop||l.crop===crop)&&(!variety||l.variety===variety));
  const busyOverlap=p=>{
    if(p.id===edit?.id||!(p.status==='Programado'||p.status==='Activo')||!p.start_time||!p.duration_min||!p.date)return false;
    if(!form.end_time||!form.date)return false;
    const s=toMin(form.start_time),dur=((toMin(form.end_time)-s)%1440+1440)%1440;
    const pd=Number(p.duration_min);
    if(dur<=0||!(pd>0))return false;
    return p.date===isoDate(form.date)&&toMin(p.start_time)<s+dur&&s<toMin(p.start_time)+pd;
  };
  const busyWell=w=>w&&(programs||[]).find(p=>p.well===w&&busyOverlap(p));
  const busyLot=id=>(programs||[]).find(p=>(p.lot_ids||[]).includes(id)&&busyOverlap(p));
  const wellConflict=w=>!!busyWell(w);
  const lotConflict=id=>!!busyLot(id);
  const endTime=p=>{const [h,m]=p.start_time.split(':').map(Number);const e=(h*60+m+Number(p.duration_min))%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};
  const conflict=wellConflict(form.well)||form.lot_ids.some(lotConflict);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggleLot=id=>setForm(f=>({...f,lot_ids:f.lot_ids.includes(id)?f.lot_ids.filter(x=>x!==id):[...f.lot_ids,id]}));
  const submit=async e=>{
    e.preventDefault();setBusy(true);
    const mins=form.end_time?((toMin(form.end_time)-toMin(form.start_time))%1440+1440)%1440:undefined;
    const payload={lot_ids:form.lot_ids,date:isoDate(form.date),start_time:form.start_time,duration_min:mins,well:form.well||undefined,turno:form.turno||undefined,status:form.status,notes:form.notes};
    if(edit) await base44.entities.IrrigationProgram.update(edit.id,payload);
    else await base44.entities.IrrigationProgram.create(payload);
    setBusy(false);onSaved();
  };
  const field=(k,label,type='text',opt=false)=>(
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}{opt&&<span className="ml-1 font-normal normal-case text-slate-400">· opcional</span>}</label>
      <input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} required={!opt} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
    </div>
  );
  return (
    <form onSubmit={submit} className="h-fit self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Droplets size={18}/></span>
          <div>
            <h2 className="text-base font-bold text-charcoal">{edit?'Editar programa':'Programar riego'}</h2>
            <p className="text-xs text-slate-500">Configurá fecha, lotes y horario</p>
          </div>
        </div>
        {edit&&<button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>}
      </div>
      <div className="mt-5 space-y-4">
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lotes</label>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select value={crop} onChange={e=>{setCrop(e.target.value);setVariety('');}} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500">
              <option value="">Cultivo: todos</option>
              {crops.map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={variety} onChange={e=>setVariety(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500">
              <option value="">Variedad: todas</option>
              {varieties.map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            {shownLots.length===0&&<p className="px-2 py-1.5 text-xs text-slate-400">No hay lotes con ese filtro.</p>}
            {shownLots.map(l=>{const b=busyLot(l.id),checked=form.lot_ids.includes(l.id);return (
              <label key={l.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 ${b&&!checked?'cursor-not-allowed opacity-50':'cursor-pointer hover:bg-slate-100'}`}>
                <input type="checkbox" checked={checked} disabled={!!b&&!checked} onChange={()=>toggleLot(l.id)} className="h-4 w-4 accent-emerald-700"/>
                <span className="font-semibold">{l.name}</span><span className="text-xs text-slate-400">{[l.crop,l.variety].filter(Boolean).join(' · ')}</span>
                {b&&<span className="ml-auto text-[11px] font-bold text-red-600">ocupado {b.start_time}–{endTime(b)}</span>}
              </label>
            );})}
          </div>
          {form.lot_ids.some(lotConflict)&&<p className="text-xs font-semibold text-red-600">Hay lotes seleccionados ya asignados a otro programa en esa fecha y horario.</p>}
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fecha de riego</label>
          <Calendar mode="single" selected={form.date} onSelect={d=>set('date',d)} locale={es} className="justify-self-start rounded-lg border border-slate-200 p-2 text-xs"/>
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pozo</label>
          <select value={form.well} onChange={e=>{set('well',e.target.value);set('turno','');}} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
            <option value="">Seleccionar…</option>
            {WELLS.map(w=>{const b=busyWell(w);return <option key={w} disabled={!!b} className="text-slate-800">{b?`${w} · ocupado ${b.start_time}–${endTime(b)}`:w}</option>;})}
          </select>
          {conflict&&<p className="text-xs font-semibold text-red-600">{busyWell(form.well)?`${form.well} ya está asignado a otro programa (${busyWell(form.well).start_time}–${endTime(busyWell(form.well))}) en esa fecha y horario.`:'Hay lotes seleccionados ya asignados a otro programa en esa fecha y horario.'}</p>}
        </div>
        {(WELL_TURNOS[form.well]||[]).length>0&&(
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Turno</label>
            <select value={form.turno} onChange={e=>set('turno',e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
              <option value="">Seleccionar turno…</option>
              {WELL_TURNOS[form.well].map(t=><option key={t.value} value={t.value}>{t.value} — {t.detail}</option>)}
            </select>
            {form.turno&&<p className="text-[11px] text-slate-400">{WELL_TURNOS[form.well].find(t=>t.value===form.turno)?.detail}</p>}
          </div>
        )}
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
      <button disabled={busy||conflict||!form.date||!form.lot_ids.length||((WELL_TURNOS[form.well]||[]).length>0&&!form.turno)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':edit?<><Pencil size={16}/>Guardar cambios</>:<><Plus size={16}/>Crear programa</>}</button>
    </form>
  );
}