import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { backend, supabase } from '@/api/backendClient';
const FarmContext = createContext(null);
const names=['Lot','Campaign','ProductionRecord','Objective','HealthRecord','IrrigationDesign','IrrigationProgram','IrrigationLog','LotDocument','Observation','PruningRecord'];
export function FarmProvider({children}){
  const {user}=useAuth();
  const regador=user?.role==='regador';
  const query=useQuery({queryKey:['farm-data',user?.id,user?.role],queryFn:async()=>{if(regador){const {data,error}=await supabase.rpc('irrigation_map_lots');if(error)throw error;return {Lot:data||[]};}const values=await Promise.all(names.map(n=>backend.entities[n].list()));return Object.fromEntries(names.map((n,i)=>[n,values[i]]));}});
  // Si la consulta falla o aún no hay datos, cada entidad se recibe como
  // lista vacía para que las páginas muestren sus estados vacíos en vez
  // de romperse (el error queda disponible para mostrar un aviso).
  const data=names.reduce((acc,n)=>(acc[n]=query.data?.[n]??[],acc),{});
  return <FarmContext.Provider value={{...data,loading:query.isLoading,error:query.error,refetch:query.refetch}}>{children}</FarmContext.Provider>;
}
export const useFarm=()=>useContext(FarmContext);