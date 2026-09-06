import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { Droplets, Plus, Pencil, X } from 'lucide-react';

const DAYS=[[1,'L'],[2,'M'],[3,'X'],[4,'J'],[5,'V'],[6,'S'],[0,'D']];
const blank=()=>({lot_id:'',sector:'',valve_code:'',water_source:'',days:[],start_time:'06:00',duration_min:'',status:'Activo',notes:''});

export default function ProgramForm({lots,designs,edit,onSaved,onCancel}){
  const [form,setForm]=useState(edit?{
    lot_id:edit.lot_id,sector:edit.sector||'',valve_code:edit.valve_code||'',water_source:edit.water_source||'',
    days:edit.days||[],start_time:edit.start_time||'06:00',duration_min:edit.duration_min??'',status:edit.status||'Activo',notes:edit.notes||''
  }:blank());
  const [busy,setBusy]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const pickLot=id=>{const dg=designs.find(x=>x.lot_id===id);setForm(f=>({...f,lot_id:id,
    sector:dg?.irrigation_sector||f.sector,valve_code:dg?.valve_code||f.valve_code,water_source:dg?.water_source||f.water_source}));};
  const toggleDay=n=>setForm(f=>({...f,days:f.days.includes(n)?f.days.filter(x=>x!==n):[...f.days,n]}));
  const submit=async e=>{
    e.preventDefault();setBusy(true);
    const payload={...form,duration_min:form.duration_min?Number(form.duration_min):undefined};
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
            <p className="text-xs text-slate-500">Configurá sector, frecuencia y horario</p>
          </div>
        </div>
        {edit&&<button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>}
      </div>
      <div className="mt-5 space-y-4">
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lote</label>
          <select value={form.lot_id} onChange={e=>pickLot(e.target.value)} required className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
            <option value="">Seleccionar lote…</option>
            {lots.map(l=><option key={l.id} value={l.id}>{l.name} · {l.crop}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">{field('sector','Sector')}{field('valve_code','Válvula','text',true)}</div>
        {field('water_source','Fuente de agua','text',true)}
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Días de riego</label>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(([n,label])=><button type="button" key={n} onClick={()=>toggleDay(n)} className={`rounded-lg border py-2 text-xs font-bold transition ${form.days.includes(n)?'border-emerald-700 bg-emerald-900 text-white':'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-400'}`}>{label}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">{field('start_time','Hora inicio','time')}{field('duration_min','Duración (min)','number',true)}</div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado</label>
          <select value={form.status} onChange={e=>set('status',e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">
            <option>Activo</option><option>Pausado</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notas</label>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows="2" placeholder="Observaciones del programa…" className="resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"/>
        </div>
      </div>
      <button disabled={busy||!form.days.length||!form.lot_id} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':edit?<><Pencil size={16}/>Guardar cambios</>:<><Plus size={16}/>Crear programa</>}</button>
    </form>
  );
}