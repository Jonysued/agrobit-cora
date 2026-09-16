import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import ProfileLayersEditor, { validateLayers } from './ProfileLayersEditor';
import { waterForecastService } from '@/services/waterEnergy';
import { soilBehaviorService } from '@/services/waterEnergy/soilBehaviorService';
import { computeProfileConfig, fullProfileDepthCm, DEFAULT_FULL_PROFILE_DEPTH_CM } from '@/services/waterEnergy/soilWaterService';
import { base44 } from '@/api/base44Client';

const EMPTY = { lot_id: '', name: '', soil_type: 'Franco', root_zone_depth_cm: 60, field_capacity_vwc: 0.28, wilting_point_vwc: 0.12, target_min_vwc: 0.17, target_max_vwc: 0.24, initial_vwc: 0.21, current_kc: '', notes: '' };
const num = v => (v === '' || v == null ? null : Number(v));
const toMm = v => (v == null ? '—' : `${Math.round(v * 10) / 10} mm`);
// Target mín/máx en mm = VWC × profundidad del perfil × 10
const targetMm = (vwc, depth) => (vwc != null && depth ? vwc * depth * 10 : null);

export default function ProfileSection({ lots, profiles, onChange }) {
  const [form, setForm] = useState(null);
  const [mmInputs, setMmInputs] = useState({});
  const [layers, setLayers] = useState([]);
  const [deletedLayerIds, setDeletedLayerIds] = useState([]);
  const [layerCounts, setLayerCounts] = useState({});
  const [mmCfg, setMmCfg] = useState({});
  const [depthCfg, setDepthCfg] = useState({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Capas por perfil (resumen) + valores en mm de agua almacenada,
  // integrados sobre el perfil completo definido por la sonda de
  // referencia (misma escala que el dashboard)
  useEffect(() => {
    Promise.all([
      base44.entities.SoilLayer.list(),
      base44.entities.SoilProbeChannel.list(),
      soilBehaviorService.getModels(),
    ]).then(([allLayers, channels, models]) => {
      const counts = {};
      const layersByProfile = {};
      allLayers.forEach(l => {
        if (!l.soil_profile_id) return;
        counts[l.soil_profile_id] = (counts[l.soil_profile_id] || 0) + 1;
        (layersByProfile[l.soil_profile_id] ||= []).push(l);
      });
      setLayerCounts(counts);
      const cfgs = {};
      const depthsByProfile = {};
      profiles.forEach(p => {
        const model = soilBehaviorService.getModelForProfile(p, models);
        const refProbeId = model?.reference_probe_id || p.probe_id;
        const depths = refProbeId ? channels.filter(c => c.probe_id === refProbeId).map(c => c.depth_cm) : [];
        const layers = (layersByProfile[p.id] || []).sort((a, b) => a.depth_top_cm - b.depth_top_cm);
        // PROFUNDIDAD DEL PERFIL: la define la sonda real vinculada;
        // sin sonda, el estándar 0–120 cm. INDEPENDIENTE de la
        // profundidad radicular (configuración agronómica del lote).
        const depth = fullProfileDepthCm(depths) ?? DEFAULT_FULL_PROFILE_DEPTH_CM;
        depthsByProfile[p.id] = { depth, probe: depths.length > 0 };
        cfgs[p.id] = computeProfileConfig(p, layers, depth);
      });
      setMmCfg(cfgs);
      setDepthCfg(depthsByProfile);
    }).catch(() => {});
  }, [profiles]);

  // VWC ↔ mm de agua almacenada sobre la profundidad del perfil
  const vwcToMmStr = (vwc, depth) => (vwc == null || !depth ? '' : String(Math.round(vwc * depth * 100) / 10));
  const initMmInputs = (p, depth) => setMmInputs({
    field_capacity: vwcToMmStr(p.field_capacity_vwc, depth),
    wilting_point: vwcToMmStr(p.wilting_point_vwc, depth),
    target_min: vwcToMmStr(p.target_min_vwc, depth),
    target_max: vwcToMmStr(p.target_max_vwc, depth),
    initial: vwcToMmStr(p.initial_vwc, depth),
  });

  const openNew = () => { setForm({ ...EMPTY }); initMmInputs(EMPTY, DEFAULT_FULL_PROFILE_DEPTH_CM); setLayers([]); setDeletedLayerIds([]); setSaveError(null); };
  const openEdit = p => {
    setForm({ ...p }); initMmInputs(p, depthCfg[p.id]?.depth ?? DEFAULT_FULL_PROFILE_DEPTH_CM); setDeletedLayerIds([]); setSaveError(null);
    base44.entities.SoilLayer.filter({ soil_profile_id: p.id })
      .then(ls => setLayers(ls.sort((a, b) => a.depth_top_cm - b.depth_top_cm)))
      .catch(() => setLayers([]));
  };

  // ---- Edición de capas (estado local; se persisten al guardar el perfil) ----
  const setLayer = (i, k, v) => setLayers(ls => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLayer = () => setLayers(ls => [...ls, {
    depth_top_cm: ls.length ? ls[ls.length - 1].depth_bottom_cm : 0,
    depth_bottom_cm: '', field_capacity_vwc: '', wilting_point_vwc: '', saturation_vwc: '',
  }]);
  const removeLayer = i => {
    const removed = layers[i];
    if (removed?.id) setDeletedLayerIds(ids => [...ids, removed.id]);
    setLayers(ls => ls.filter((_, idx) => idx !== i));
  };

  const save = async e => {
    e.preventDefault(); setSaveError(null);
    const rootDepth = num(form.root_zone_depth_cm);
    const { errors } = validateLayers(layers, rootDepth);
    if (errors.length) { setSaveError('Corregí los errores de las capas antes de guardar.'); return; }
    setBusy(true);
    // Los parámetros se ingresan en mm: se convierten a VWC con la
    // profundidad del PERFIL (sonda vinculada o estándar 120 cm),
    // nunca con la profundidad radicular — variables independientes
    const mmToVwc = v => (v === '' || v == null ? null : Number(v) / (convDepth * 10));
    // MAD y objetivo de recarga % fueron eliminados: no se guardan
    const payload = { ...form };
    delete payload.management_allowed_depletion_percent;
    delete payload.target_refill_percent;
    const saved = await waterForecastService.saveProfile({
      ...payload,
      root_zone_depth_cm: rootDepth,
      field_capacity_vwc: mmToVwc(mmInputs.field_capacity),
      wilting_point_vwc: mmToVwc(mmInputs.wilting_point),
      target_min_vwc: mmToVwc(mmInputs.target_min),
      target_max_vwc: mmToVwc(mmInputs.target_max),
      initial_vwc: mmToVwc(mmInputs.initial),
      current_kc: num(form.current_kc),
    });
    const profileId = saved?.id || form.id;
    for (const l of layers) {
      const payload = {
        soil_profile_id: profileId,
        depth_top_cm: Number(l.depth_top_cm),
        depth_bottom_cm: Number(l.depth_bottom_cm),
        field_capacity_vwc: Number(l.field_capacity_vwc),
        wilting_point_vwc: Number(l.wilting_point_vwc),
        saturation_vwc: num(l.saturation_vwc),
      };
      if (l.id) await base44.entities.SoilLayer.update(l.id, payload);
      else await base44.entities.SoilLayer.create(payload);
    }
    for (const id of deletedLayerIds) await base44.entities.SoilLayer.delete(id);
    setBusy(false); setForm(null); setLayers([]); setDeletedLayerIds([]); onChange();
  };

  const del = async p => {
    await base44.entities.SoilLayer.deleteMany({ soil_profile_id: p.id });
    await waterForecastService.deleteProfile(p.id);
    onChange();
  };

  // Profundidad del PERFIL usada para mm ↔ VWC: sonda vinculada o
  // estándar 0–120 cm — independiente de la profundidad radicular.
  const convDepth = form?.id ? (depthCfg[form.id]?.depth ?? DEFAULT_FULL_PROFILE_DEPTH_CM) : DEFAULT_FULL_PROFILE_DEPTH_CM;
  const layerChecks = form ? validateLayers(layers, num(form.root_zone_depth_cm)) : { errors: [], warnings: [] };

  return (
    <ConfigPanel title="Perfiles de suelo" description={`Valores en mm de agua almacenada sobre el perfil completo · ${profiles.length} configurado(s)`}>
      {!form && <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nuevo perfil</button>}
      {form && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar perfil' : 'Nuevo perfil'}</b>
            <button type="button" onClick={() => { setForm(null); setLayers([]); setDeletedLayerIds([]); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Lote">
              <select required value={form.lot_id} onChange={e => set('lot_id', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name} ({l.farm})</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Perfil C1" /></Field>
            <Field label="Tipo de suelo"><input value={form.soil_type} onChange={e => set('soil_type', e.target.value)} className={inputCls} placeholder="Franco" /></Field>
            <Field label="Profundidad radicular (cm)"><input required type="number" step="any" min="0" value={form.root_zone_depth_cm ?? ''} onChange={e => set('root_zone_depth_cm', e.target.value)} className={inputCls} /></Field>
            <Field label="Profundidad del perfil (cm)">
              <p className="py-1.5 text-sm font-semibold text-slate-600">{convDepth}</p>
              <p className="text-[10px] leading-tight text-slate-400">{depthCfg[form.id]?.probe ? 'La define la sonda vinculada — solo lectura.' : `Estándar ${DEFAULT_FULL_PROFILE_DEPTH_CM} cm — sin sonda de referencia vinculada.`}</p>
            </Field>
            <Field label="Capacidad de campo (mm)">
              <input required type="number" step="any" min="0" value={mmInputs.field_capacity ?? ''} onChange={e => setMmInputs(m => ({ ...m, field_capacity: e.target.value }))} className={inputCls} />
              <p className="text-[10px] leading-tight text-slate-400">mm de agua almacenada sobre el perfil de cálculo ({convDepth} cm) — independiente de la profundidad radicular.</p>
            </Field>
            <Field label="Punto de marchitez (mm)"><input required type="number" step="any" min="0" value={mmInputs.wilting_point ?? ''} onChange={e => setMmInputs(m => ({ ...m, wilting_point: e.target.value }))} className={inputCls} /></Field>
            <Field label="Target mín. (mm)"><input required type="number" step="any" min="0" value={mmInputs.target_min ?? ''} onChange={e => setMmInputs(m => ({ ...m, target_min: e.target.value }))} className={inputCls} /></Field>
            <Field label="Target máx. (mm)"><input required type="number" step="any" min="0" value={mmInputs.target_max ?? ''} onChange={e => setMmInputs(m => ({ ...m, target_max: e.target.value }))} className={inputCls} /></Field>
            <Field label="Humedad inicial (mm)"><input type="number" step="any" min="0" value={mmInputs.initial ?? ''} onChange={e => setMmInputs(m => ({ ...m, initial: e.target.value }))} className={inputCls} /></Field>
            <Field label="Kc del cultivo">
              <input type="number" step="any" min="0" value={form.current_kc ?? ''} onChange={e => set('current_kc', e.target.value)} className={inputCls} placeholder="0.65" />
              <p className="text-[10px] leading-tight text-slate-400">Coeficiente de cultivo usado por el forecast hídrico (ETc = ET0 × Kc). Sin Kc no se genera recomendación de riego.</p>
            </Field>
            <div className="sm:col-span-2"><Field label="Notas"><input value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} className={inputCls} placeholder="Observaciones…" /></Field></div>
          </div>
          <ProfileLayersEditor
            layers={layers}
            errors={layerChecks.errors}
            warnings={layerChecks.warnings}
            onAdd={addLayer}
            onRemove={removeLayer}
            onChangeLayer={setLayer}
          />
          {saveError && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">{saveError}</p>}
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </form>
      )}
      {profiles.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Lote</th><th className="pr-3">Suelo</th><th className="pr-3">Perfil / Rad. (cm)</th><th className="pr-3">CC / PM (mm)</th><th className="pr-3">Target mín / máx (mm)</th><th className="pr-3">Capas</th><th /></tr></thead>
            <tbody>
              {profiles.map(p => {
                const cfg = mmCfg[p.id];
                return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="pr-3 text-slate-600">{p.soil_type || '—'}</td>
                  <td className="pr-3 text-slate-600">{cfg?.profile_depth_cm ?? DEFAULT_FULL_PROFILE_DEPTH_CM} / {p.root_zone_depth_cm ?? '—'}</td>
                  <td className="pr-3 text-slate-600">{toMm(cfg?.field_capacity_storage_mm)} / {toMm(cfg?.wilting_storage_mm)}</td>
                  <td className="pr-3 text-slate-600">{toMm(targetMm(p.target_min_vwc, cfg?.profile_depth_cm))} / {toMm(targetMm(p.target_max_vwc, cfg?.profile_depth_cm))}</td>
                  <td className="pr-3 text-slate-600">{layerCounts[p.id] || 0}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={() => del(p)} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}
    </ConfigPanel>
  );
}