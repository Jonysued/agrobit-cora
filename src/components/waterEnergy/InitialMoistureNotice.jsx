import React from 'react';
export default function InitialMoistureNotice() {
  return <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900"><b>El punto inicial necesita una medición en campo.</b> Si todavía no cargaste el relevamiento de cada lote, sus curvas y recomendaciones de riego y energía son provisionales. La sonda vinculada aporta el comportamiento del suelo; no determina la humedad inicial real del lote. Cargá la medición y su fecha en la ficha del lote.</p>;
}
