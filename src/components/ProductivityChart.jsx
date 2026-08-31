import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
export default function ProductivityChart({history=[],objective}){
  const data=history.map(x=>({campaña:x.campaign,'kg/ha':Math.round(x.kg_ha),Objetivo:objective?.kg_ha}));
  const n=data.length;
  const height=Math.max(288,n>8?360:288);
  const tickAngle=n>8?-35:0;
  const tickHeight=n>8?60:0;
  return <div className="w-full" style={{height}}><ResponsiveContainer><ComposedChart data={data} margin={{left:4,right:16,bottom:tickHeight}}><CartesianGrid strokeDasharray="3 3" stroke="#dfe7dc"/><XAxis dataKey="campaña" tick={{fontSize:12}} angle={tickAngle} textAnchor={tickAngle?'end':'middle'} height={tickHeight||30} interval={0}/><YAxis tickFormatter={v=>`${v/1000}t`}/><Tooltip formatter={v=>`${Number(v).toLocaleString('es-AR')} kg/ha`}/><Legend/><Bar dataKey="kg/ha" fill="#4A7D4E" radius={[6,6,0,0]} maxBarSize={48}/><Line dataKey="Objetivo" stroke="#d97706" strokeWidth={3} dot={false}/></ComposedChart></ResponsiveContainer></div>;
}