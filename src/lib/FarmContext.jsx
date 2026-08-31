import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
const FarmContext = createContext(null);
const names=['Lot','Campaign','ProductionRecord','Objective','HealthRecord','IrrigationDesign','LotDocument','Observation','PruningRecord'];
export function FarmProvider({children}){
  const query=useQuery({queryKey:['farm-data'],queryFn:async()=>{const values=await Promise.all(names.map(n=>base44.entities[n].list()));return Object.fromEntries(names.map((n,i)=>[n,values[i]]));}});
  return <FarmContext.Provider value={{...query.data,loading:query.isLoading,refetch:query.refetch}}>{children}</FarmContext.Provider>;
}
export const useFarm=()=>useContext(FarmContext);