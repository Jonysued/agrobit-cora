import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, inputCls } from './ConfigPanel';

// ---- Validación de capas ----
// Superposición → error (bloquea el guardado).
// Huecos entre capas o zona radicular sin cubrir → advertencia.
// No se inventan propiedades para las zonas sin configurar.
export function validateLayers(layers, rootDepth) {
  const errors = [];
  const warnings = [];
  const withDepth = layers.filter(l => l.depth_top_cm !== '' && l.depth_top_cm != null && l.depth_bottom_cm !== '' && l.depth_bottom_cm != null);
  const sorted = [...withDepth].sort((a, b) => Number(a.depth_top_cm) - Number(b.depth_top_cm));
  let prevBottom = 0;
  for (const l of sorted) {
    const top = Number(l.depth_top_cm);
    const bottom = Number(l.depth_bottom_cm);
    if (bottom <= top) {
      errors.push(`Capa ${top}–${bottom} cm: el valor "hasta" debe ser mayor que "desde".`);
      continue;
    }
    if (top < prevBottom) {
      errors.push(`Superposición de capas: el tramo ${top}–${prevBottom} cm está configurado dos veces.`);
    } else if (top > prevBottom) {
      warnings.push(`Falta configurar el perfil entre ${prevBottom} y ${top} cm.`);
    }
    prevBottom = Math.max(prevBottom, bottom);
  }
  if (rootDepth != null && rootDepth > 0 && sorted.length > 0 && prevBottom < rootDepth) {
    warnings.push(`Falta configurar el perfil entre ${prevBottom} y ${rootDepth} cm.`);
  }
  return { errors, warnings };
}

// ---- CAPAS DEL PERFIL: edición inline dentro del formulario del perfil ----
export default function ProfileLayersEditor({ layers, errors, warnings, onAdd, onRemove, onChangeLayer }) {
  const row = (i, key, opts = {}) => (
    <input
      type="number" step="any" min="0" max={opts.max ?? undefined}
      required={opts.required !== false}
      value={layers[i][key] ?? ''}
      onChange={e => onChangeLayer(i, key, e.target.value)}
      className={inputCls}
    />
  );
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Capas del perfil</b>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded-lg bg-emerald-900 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={13} />Agregar capa</button>
      </div>
      {layers.length === 0 && (
        <p className="text-xs text-slate-400">Sin capas configuradas: el cálculo usa los valores generales del perfil (CC / PM) en toda la zona radicular.</p>
      )}
      {layers.length > 0 && (
        <div className="space-y-2">
          {layers.map((l, i) => (
            <div key={l.id || `nueva-${i}`} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Desde (cm)">{row(i, 'depth_top_cm')}</Field>
              <Field label="Hasta (cm)">{row(i, 'depth_bottom_cm')}</Field>
              <Field label="Capacidad de campo (VWC)">{row(i, 'field_capacity_vwc', { max: 1 })}</Field>
              <Field label="Punto de marchitez (VWC)">{row(i, 'wilting_point_vwc', { max: 1 })}</Field>
              <Field label="Saturación (VWC) · opcional">{row(i, 'saturation_vwc', { required: false, max: 1 })}</Field>
              <button type="button" onClick={() => onRemove(i)} className="mb-0.5 justify-self-end rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Eliminar capa"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {layers.length > 0 && <p className="mt-2 text-[10px] text-slate-400">VWC como fracción: 0.29 = 29%.</p>}
      {errors.map((e, i) => <p key={i} className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">{e}</p>)}
      {warnings.map((w, i) => <p key={i} className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">{w}</p>)}
    </div>
  );
}