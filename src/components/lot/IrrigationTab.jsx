import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { densityOf } from '@/lib/farmCalculations';
import { Droplets, Plus, Save, Pencil } from 'lucide-react';

const EMPTY={
  well:'',
  irrigation_type:'',sector_area_ha:'',drip_lines_per_row:'',lateral_diameter_mm:'',
  average_lateral_length_m:'',emitter_spacing_m:'',emitter_flow_lh:'',emitters_per_plant:'',
  design_pressure_bar:'',installation_year:'',notes:''
};

export default function IrrigationTab({lot,data}){
  const existing=data.IrrigationDesign.find(x=>x.lot_id===lot.id);
  const [editing,setEditing]=useState(!existing);
  const [form,setForm]=useState({...EMPTY,...(existing||{})});
  const [busy,setBusy]=useState(false);
  const set=(k,v)=>setForm({...form,[k]:v});

  const save=async e=>{
    e.preventDefault();setBusy(true);
    const num=k=>form[k]===''||form[k]==null?undefined:Number(form[k]);
    const payload={
      lot_id:lot.id,
      well:form.well||undefined,
      irrigation_type:form.irrigation_type||undefined,sector_area_ha:num('sector_area_ha'),drip_lines_per_row:num('drip_lines_per_row'),
      lateral_diameter_mm:num('lateral_diameter_mm'),average_lateral_length_m:num('average_lateral_length_m'),
      emitter_spacing_m:num('emitter_spacing_m'),emitter_flow_lh:num('emitter_flow_lh'),
      emitters_per_plant:form.emitters_per_plant!==''&&form.emitters_per_plant!=null?num('emitters_per_plant'):(autoEmitters!=null?autoEmitters:undefined),
      design_pressure_bar:num('design_pressure_bar'),installation_year:num('installation_year'),
      notes:form.notes||undefined,
    };
    if(existing) await base44.entities.IrrigationDesign.update(existing.id,payload);
    else await base44.entities.IrrigationDesign.create(payload);
    await data.refetch();setEditing(false);setBusy(false);
  };

  const f=(k,label,type='text',opt=false)=>(
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}{opt&&<span className="ml-1 font-normal normal-case text-slate-400">· opcional</span>}</label>
      <input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} required={!opt} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
    </div>
  );

  // Caudales calculados (vista)
  const lph=(form.emitter_flow_lh||0)*(form.emitters_per_plant||0);
  const lha=lph*densityOf(lot);
  const ltotal=lha*(form.sector_area_ha||lot.area_ha);
  const lamina=lha?Math.round(lha/10000*10)/10:0;
  const autoEmitters=(form.drip_lines_per_row&&form.emitter_spacing_m&&lot.plant_spacing)?Math.round((lot.plant_spacing/form.emitter_spacing_m)*form.drip_lines_per_row*10)/10:null;

  if(!editing && existing){
    const fields=[
      ['Pozo',existing.well],
      ['Tipo de riego',existing.irrigation_type],
      ['Superficie sector',existing.sector_area_ha!=null?`${existing.sector_area_ha} ha`:'-'],
      ['Líneas por fila',existing.drip_lines_per_row],['Diámetro lateral',existing.lateral_diameter_mm!=null?`${existing.lateral_diameter_mm} mm`:'-'],
      ['Longitud lateral prom.',existing.average_lateral_length_m!=null?`${existing.average_lateral_length_m} m`:'-'],
      ['Separación goteros',existing.emitter_spacing_m!=null?`${existing.emitter_spacing_m} m`:'-'],
      ['Caudal gotero',existing.emitter_flow_lh!=null?`${existing.emitter_flow_lh} l/h`:'-'],['Goteros por planta',existing.emitters_per_plant],
      ['Presión de diseño',existing.design_pressure_bar!=null?`${existing.design_pressure_bar} bar`:'-'],
      ['Año de instalación (mangueras)',existing.installation_year],
    ];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Diseño de riego registrado para este lote.</p>
          <button onClick={()=>setEditing(true)} className="flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"><Pencil size={15}/>Editar diseño</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Litros/planta/hora',lph?lph.toFixed(2):lph],['Caudal teórico/ha',`${Math.round(lha).toLocaleString()} l/h`],['Caudal total sector',`${Math.round(ltotal).toLocaleString()} l/h`],['Lámina aplicada',`${lamina} mm/h`]].map(([a,b])=>(
            <div className="rounded-2xl bg-emerald-950 p-5 text-white" key={a}><p className="text-xs text-white/60">{a}</p><b className="text-2xl">{b||'-'}</b></div>
          ))}
        </div>
        <div className="grid gap-x-6 gap-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([a,b])=><div key={a}><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{a}</p><p className="mt-1 font-semibold text-charcoal">{b||'-'}</p></div>)}
        </div>
        {existing.notes&&<p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{existing.notes}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Droplets size={18}/></span>
        <div>
          <h2 className="text-base font-bold text-charcoal">{existing?'Editar diseño de riego':'Nuevo diseño de riego'}</h2>
          <p className="text-xs text-slate-500">Especificaciones técnicas del sistema de riego del lote</p>
        </div>
      </div>

      <fieldset className="rounded-xl border border-emerald-200 p-4">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Tipo de riego y sector</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tipo de riego</label>
            <select value={form.irrigation_type} onChange={e=>set('irrigation_type',e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200">
              <option value="">Seleccionar…</option>
              <option>Goteo</option><option>Microaspersión</option><option>Aspersión</option><option>Surco</option><option>Gravedad</option>
            </select>
          </div>
          {f('sector_area_ha','Superficie sector (ha)','number',true)}
          {f('well','Pozo',undefined,true)}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-sand p-4">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-wide text-charcoal">Diseño de laterales y goteros</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {f('drip_lines_per_row','Líneas por fila','number')}
          {f('lateral_diameter_mm','Diámetro lateral (mm)','number')}
          {f('average_lateral_length_m','Longitud lateral (m)','number',true)}
          {f('emitter_spacing_m','Separación goteros (m)','number')}
          {f('emitter_flow_lh','Caudal gotero (l/h)','number')}
          {f('emitters_per_plant','Goteros por planta','number',true)}
        </div>
        {autoEmitters!=null&&<p className="mt-2 text-xs font-semibold text-emerald-700">Sugerido según líneas y separación: {autoEmitters} goteros por planta</p>}
      </fieldset>

      <fieldset className="rounded-xl border border-sand p-4">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-wide text-charcoal">Presión, modelo e instalación</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {f('design_pressure_bar','Presión diseño (bar)','number',true)}
          {f('installation_year','Año mangueras','number')}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Observaciones</label>
        <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows="2" className="resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
      </div>

      <div className="flex gap-3">
        <button disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':existing?<><Save size={16}/>Guardar cambios</>:<><Plus size={16}/>Crear diseño de riego</>}</button>
        {existing&&<button type="button" onClick={()=>{setForm({...EMPTY,...existing});setEditing(false)}} className="rounded-xl border border-slate-300 px-5 py-2.5 font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button>}
      </div>
    </form>
  );
}