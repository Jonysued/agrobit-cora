import React,{useState} from 'react';
import { Pencil,Trash2,X } from 'lucide-react';
import { backend } from '@/api/backendClient';
const blank=dataCampaign=>({campaign:dataCampaign,date:new Date().toISOString().slice(0,10),type:'',intensity:'Media',objective:'',notes:''});
export default function PruningTab({lot,data}){
  const curCamp=data.Campaign.find(c=>c.is_current)?.name||'';
  const [form,setForm]=useState(blank(curCamp)),[busy,setBusy]=useState(false),[editId,setEditId]=useState(null);
  const rows=[...(data.PruningRecord||[])].filter(x=>x.lot_id===lot.id).sort((a,b)=>b.campaign.localeCompare(a.campaign));
  const types=rows.map(r=>r.type);const rec=types.reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{});
  const startEdit=r=>{setEditId(r.id);setForm({campaign:r.campaign,date:r.date,type:r.type,intensity:r.intensity,objective:r.objective||'',notes:r.notes||''});};
  const cancelEdit=()=>{setEditId(null);setForm(blank(curCamp));};
  const submit=async e=>{e.preventDefault();setBusy(true);
    if(editId) await backend.entities.PruningRecord.update(editId,form);
    else await backend.entities.PruningRecord.create({...form,lot_id:lot.id});
    await data.refetch();setBusy(false);
    if(editId)cancelEdit();else setForm({...blank(curCamp),campaign:form.campaign});
  };
  const del=async r=>{await backend.entities.PruningRecord.delete(r.id);await data.refetch();if(editId===r.id)cancelEdit();};
  const set=(k,v)=>setForm({...form,[k]:v});
  return <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
    <form onSubmit={submit} className="h-fit rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{editId?'Editar poda':'Registrar poda'}</h2>
        {editId&&<button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>}
      </div>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Campaña<select value={form.campaign} onChange={e=>set('campaign',e.target.value)} className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800">{data.Campaign.map(c=><option key={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Fecha<input type="date" value={form.date} onChange={e=>set('date',e.target.value)} required className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Tipo de poda<input value={form.type} onChange={e=>set('type',e.target.value)} placeholder="Formación, fructificación, renovación…" required className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Intensidad<select value={form.intensity} onChange={e=>set('intensity',e.target.value)} className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"><option>Leve</option><option>Media</option><option>Fuerte</option></select></label>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Objetivo<input value={form.objective} onChange={e=>set('objective',e.target.value)} className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Observaciones<textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows="3" className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>
      </div>
      <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2 font-bold text-white">{busy?'Guardando…':editId?'Guardar cambios':'Registrar poda'}</button>
    </form>
    <div>
      {Object.keys(rec).length>0 && <section className="mb-4 rounded-2xl bg-emerald-950 p-6 text-white"><h2 className="text-lg font-bold">Resumen de podas</h2>{Object.entries(rec).sort((a,b)=>b[1]-a[1]).map(([t,n])=><p key={t} className="mt-3 rounded-xl bg-white/10 p-3 text-sm">Este lote recibió <b>{t}</b> en {n} {n===1?'campaña':'campañas'}.</p>)}</section>}
      <div className="space-y-3">
        {rows.map(r=><article key={r.id} className={`rounded-2xl border bg-white p-5 ${editId===r.id?'ring-2 ring-emerald-700':''}`}><div className="flex justify-between gap-2"><div className="min-w-0"><b>{r.type}</b><p className="text-xs text-slate-500">{r.campaign} · {r.date}</p></div><div className="flex shrink-0 items-center gap-3"><span className="text-sm font-bold text-emerald-700">{r.intensity}</span><button onClick={()=>startEdit(r)} className="text-slate-400 hover:text-emerald-700"><Pencil size={16}/></button><button onClick={()=>del(r)} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button></div></div>{r.objective&&<p className="mt-2 text-sm text-slate-600">Objetivo: {r.objective}</p>}{r.notes&&<p className="mt-1 text-sm text-slate-500">{r.notes}</p>}</article>)}
        {!rows.length&&<p className="text-slate-500">Aún no hay podas registradas para este lote.</p>}
      </div>
    </div>
  </div>;
}