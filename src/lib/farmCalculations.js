export const polygonAreaHa = (pts) => {
  if(!pts||pts.length<3) return 0;
  const R=6378137; let area=0;
  for(let i=0;i<pts.length;i++){const [lat1,lng1]=pts[i];const [lat2,lng2]=pts[(i+1)%pts.length];area+=(lng2-lng1)*Math.PI/180*R*R*( (2+Math.sin(lat1*Math.PI/180)+Math.sin(lat2*Math.PI/180))/4 );}
  return Math.abs(area)/10000;
};
export const ageOf = (lot) => new Date().getFullYear() - lot.planting_year;
export const densityOf = (lot) => Math.round(10000 / (lot.row_spacing * lot.plant_spacing));
export const theoreticalPlants = (lot) => Math.round(densityOf(lot) * lot.area_ha);
export const missingPct = (lot) => lot.current_plants ? Math.max(0, Math.round((1 - lot.current_plants / theoreticalPlants(lot)) * 100)) : null;
export const avg = (values) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
export const lotMetrics = (lot, productions, objectives, health) => {
  const history = productions.filter(p=>p.lot_id===lot.id).sort((a,b)=>a.campaign.localeCompare(b.campaign));
  const actual = history.filter(p=>!p.estimated), last = actual.at(-1), five = actual.slice(-5);
  const objective = objectives.filter(o=>o.lot_id===lot.id).at(-1);
  const best = actual.length ? actual.reduce((a,b)=>a.kg_ha>b.kg_ha?a:b) : null;
  const mean5 = avg(five.map(p=>p.kg_ha));
  const diffs = actual.slice(-3).map((p,i,a)=>i ? p.kg_ha-a[i-1].kg_ha : 0).slice(1);
  const trend = diffs.length && diffs.every(d=>d>0) ? 'Creciente' : diffs.length && diffs.every(d=>d<0) ? 'Decreciente' : diffs.length && diffs[0]*diffs.at(-1)<0 ? 'Alternante' : 'Estable';
  const incidents = health.filter(h=>h.lot_id===lot.id), severe = incidents.filter(h=>h.incidence==='Alta').length;
  return { history, last, objective, best, mean5, trend, healthState: severe?'Atención':incidents.length?'Intermedio':'Bueno', compliance: objective?.kg_ha ? objective.estimated_kg_ha/objective.kg_ha*100 : 0 };
};