import React from 'react';
import { LoaderCircle } from 'lucide-react';
export default function LoadingState(){return <div className="grid min-h-[60vh] place-items-center"><div className="flex items-center gap-3 rounded-2xl border border-emerald-900/10 bg-white/85 px-5 py-3 text-sm font-semibold text-emerald-800 shadow-sm"><LoaderCircle className="animate-spin"/>Cargando información…</div></div>}
