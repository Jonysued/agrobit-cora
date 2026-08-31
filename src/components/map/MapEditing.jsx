import React from 'react';
import { useMapEvents, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';
const vertexIcon = L.divIcon({className:'',html:'<div style="width:14px;height:14px;border-radius:50%;background:#d97706;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',iconSize:[14,14],iconAnchor:[7,7]});
const drawVertexIcon = L.divIcon({className:'',html:'<div style="width:12px;height:12px;border-radius:50%;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',iconSize:[12,12],iconAnchor:[6,6]});

export function DrawLayer({points,setPoints,onFinish}){
  useMapEvents({
    click(e){ setPoints(prev=>[...prev,[e.latlng.lat,e.latlng.lng]]); },
    dblclick(){ if(points.length>=3) onFinish(); }
  });
  return <>
    {points.length>=2 && <Polygon positions={points} pathOptions={{color:'#16a34a',weight:2,dashArray:'6 6',fillColor:'#16a34a',fillOpacity:.2}}/>}
    {points.map((p,i)=><Marker key={i} position={p} icon={drawVertexIcon} interactive={false}/>)}
  </>;
}

export function EditLayer({points,setPoints}){
  const update=(i,latlng)=>{const next=[...points];next[i]=latlng;setPoints(next);};
  const remove=(i)=>{ if(points.length>3) setPoints(points.filter((_,j)=>j!==i)); };
  return points.map((p,i)=><Marker key={i} position={p} icon={vertexIcon} draggable eventHandlers={{dragend:(e)=>{const ll=e.target.getLatLng();update(i,[ll.lat,ll.lng]);},click:()=>remove(i)}}/>);
}