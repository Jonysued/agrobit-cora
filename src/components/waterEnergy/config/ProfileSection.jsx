import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import ProfileLayersEditor, { validateLayers } from './ProfileLayersEditor';
import { waterForecastService } from '@/services/waterEnergy';
import { soilBehaviorService } from '@/services/waterEnergy/soilBehaviorService';
import { computeProfileConfig, fullProfileDepthCm } from '@/services/waterEnergy/soilWaterService';
import { base44 } from '@/api/base44Client';

const EMPTY = { lot_id: '', name: '', soil_type: 'Franco', root_zone_depth_cm: 60, field_capacity_vwc: 0.28, wilting_point_vwc: 0.12, target_min_vwc: 0.17, target_max_vwc: 0.24, initial_vwc: 0.21, management_allowed_depletion_percent: '', target_refill_percent: '', current_kc: '', notes: '' };
const num = v => (v === '' || v == null ? null : Number(v));
const toMm = v => (v == null ? '—' : `${Math.round(v * 10) / 10} mm`);
// Agotamiento permitido en mm = TAW × MAD%
const madMm = (cfg, madPct) => (cfg?.total_available_water_capacity_mm != null && madPct != null
  ? cfg.total_available_water_capacity_mm * madPct / 100 : null);
// Target mín/máx en mm = VWC × profundidad del perfil × 10
const targetMm = (vwc, depth) => (vwc != null && depth ? vwc * depth * 10 : null);

export default function ProfileSection({ lots, profiles, onChange }) {
  const [form, setForm] = useState(null);
  const [layers, setLayers] = useState([]);
  const [deletedLayerIds, setDeletedLayerIds] = useState([]);
  const [layerCounts, setLayerCounts] = useState({});
  const [mmCfg, setMmCfg] = useState({});
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
      profiles.forEach(p => {
        const model = soilBehaviorService.getModelForProfile(p, models);
        const refProbeId = model?.reference_probe_id || p.probe_id;
        const depths = refProbeId ? channels.filter(c => c.probe_id === refProbeId).map(c => c.depth_cm) : [];
        const layers = (layersByProfile[p.id] || []).sort((a, b) => a.depth_top_cm - b.depth_top_cm);
        cfgs[p.id] = computeProfileConfig(p, layers, fullProfileDepthCm(depths));
      });
      setMmCfg(cfgs);
    }).catch(() => {});
  }, [profiles]);

  const openNew = () => { setForm({ ...EMPTY }); setLayers([]); setDeletedLayerIds([]); setSaveError(null); };
  const openEdit = p => {
    setForm({ ...p }); setDeletedLayerIds([]); setSaveError(null);
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
    const saved = await waterForecastService.saveProfile({
      ...form,
      root_zone_depth_cm: rootDepth,
      field_capacity_vwc: num(form.field_capacity_vwc),
      wilting_point_vwc: num(form.wilting_point_vwc),
      target_min_vwc: num(form.target_min_vwc),
      target_max_vwc: num(form.target_max_vwc),
      initial_vwc: num(form.initial_vwc),
      management_allowed_depletion_percent: num(form.management_allowed_depletion_percent),
      target_refill_percent: num(form.target_refill_percent),
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
            <Field label="Capacidad de campo (VWC)"><input required type="number" step="any" min="0" max="1" value={form.field_capacity_vwc ?? ''} onChange={e => set('field_capacity_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Punto de marchitez (VWC)"><input required type="number" step="any" min="0" max="1" value={form.wilting_point_vwc ?? ''} onChange={e => set('wilting_point_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Target mín. (VWC)"><input required type="number" step="any" min="0" max="1" value={form.target_min_vwc ?? ''} onChange={e => set('target_min_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Target máx. (VWC)"><input required type="number" step="any" min="0" max="1" value={form.target_max_vwc ?? ''} onChange={e => set('target_max_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Humedad inicial (VWC)"><input type="number" step="any" min="0" max="1" value={form.initial_vwc ?? ''} onChange={e => set('initial_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Agotamiento permitido (MAD) %">
              <input type="number" step="any" min="0" max="100" value={form.management_allowed_depletion_percent ?? ''} onChange={e => set('management_allowed_depletion_percent', e.target.value)} className={inputCls} placeholder="40" />
              <p className="text-[10px] leading-tight text-slate-400">Porcentaje del agua útil que se permite consumir antes de alcanzar el umbral de recarga.</p>
            </Field>
            <Field label="Objetivo de recarga %">
              <input type="number" step="any" min="0" max="100" value={form.target_refill_percent ?? ''} onChange={e => set('target_refill_percent', e.target.value)} className={inputCls} placeholder="90" />
              <p className="text-[10px] leading-tight text-slate-400">Porcentaje de la capacidad útil al que se quiere recuperar el perfil después de regar.</p>
            </Field>
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
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Lote</th><th className="pr-3">Suelo</th><th className="pr-3">Prof. (cm)</th><th className="pr-3">CC / PM (mm)</th><th className="pr-3">Target mín / máx (mm)</th><th className="pr-3">MAD (mm)</th><th className="pr-3">Objetivo recarga (mm)</th><th className="pr-3">Capas</th><th /></tr></thead>
            <tbody>
              {profiles.map(p => {
                const cfg = mmCfg[p.id];
                return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="pr-3 text-slate-600">{p.soil_type || '—'}</td>
                  <td className="pr-3 text-slate-600">{cfg?.profile_depth_cm ?? p.root_zone_depth_cm ?? '—'}</td>
                  <td className="pr-3 text-slate-600">{toMm(cfg?.field_capacity_storage_mm)} / {toMm(cfg?.wilting_storage_mm)}</td>
                  <td className="pr-3 text-slate-600">{toMm(targetMm(p.target_min_vwc, cfg?.profile_depth_cm))} / {toMm(targetMm(p.target_max_vwc, cfg?.profile_depth_cm))}</td>
                  <td className="pr-3 text-slate-600">{toMm(madMm(cfg, p.management_allowed_depletion_percent))}</td>
                  <td className="pr-3 text-slate-600">{toMm(cfg?.target_water_mm)}</td>
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