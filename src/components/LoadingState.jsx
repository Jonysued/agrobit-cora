import React from 'react';
import { LoaderCircle } from 'lucide-react';
export default function LoadingState(){return <div className="grid min-h-[60vh] place-items-center"><div className="flex items-center gap-3 text-sm font-medium text-slate-500"><LoaderCircle className="animate-spin"/>Cargando información histórica…</div></div>}