import type {DisplayRecord} from './display-api.ts'
import type {RecipeModule} from './recipe-api.ts'
type Props={type:'chart'|'map';records:DisplayRecord[];config:RecipeModule['config'];selectedId?:string;select:(id:string)=>void;t:(key:any)=>string}
const numeric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
export function DataVisual({type,records,config,selectedId,select,t}:Props){
 const activate=(id:string)=>({role:'button',tabIndex:0,onClick:()=>select(id),onKeyDown:(event:import('react').KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(id)}}})
 if(type==='chart'){
  const field=String(config.valueField??'')
  if(!field)return <p role="status">{t('displayChooseValue')}</p>
  const values=records.flatMap(record=>numeric(record.fields[field])?[{record,value:record.fields[field] as number}]:[])
  if(!values.length)return <p role="status">{t('displayNoNumeric')}</p>
  const low=Math.min(0,...values.map(row=>row.value)),high=Math.max(0,...values.map(row=>row.value)),span=high-low||1,origin=160+(-low/span)*400,height=values.length*36+40
  return <div style={{maxHeight:440,overflow:'auto'}}><svg role="group" aria-label={t('recipeModulechart')} viewBox={'0 0 600 '+height} style={{width:'100%',minWidth:280}}>
   <line x1={origin} x2={origin} y1={5} y2={height-20} stroke="currentColor" opacity=".3"/>
   {values.map(({record,value},index)=>{const endpoint=160+(value-low)/span*400;return <g key={record.id} {...activate(record.id)} aria-label={record.title+': '+value} aria-pressed={selectedId===record.id} style={{cursor:'pointer'}}><title>{record.title+': '+value}</title><rect x="0" y={index*36} width="600" height="34" fill={selectedId===record.id?'var(--pwb-accent-soft,#f3e5dc)':'transparent'}/><text x="4" y={index*36+22} fontSize="12" fill="currentColor">{record.title.length>20?record.title.slice(0,20)+'…':record.title}</text><rect x={Math.min(origin,endpoint)} y={index*36+7} width={Math.max(2,Math.abs(endpoint-origin))} height="20" rx="3" fill="var(--pwb-accent,#a44c32)"/><text x="566" y={index*36+22} fontSize="12" fill="currentColor">{value}</text></g>})}
  </svg><small>{field} · {values.length}/{records.length}</small></div>
 }
 const lat=String(config.latitudeField??''),lon=String(config.longitudeField??'')
 if(!lat||!lon)return <p role="status">{t('displayChooseCoordinates')}</p>
 const points=records.flatMap(record=>{const latitude=record.fields[lat],longitude=record.fields[lon];return numeric(latitude)&&numeric(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?[{record,latitude,longitude}]:[]})
 if(!points.length)return <p role="status">{t('displayNoCoordinates')}</p>
 return <div><svg role="group" aria-label={t('recipeModulemap')} viewBox="0 0 720 360" style={{width:'100%',background:'var(--pwb-canvas,#f7f5f0)',border:'1px solid var(--pwb-line,#d7d0c5)',borderRadius:6}}>
  {[-180,-120,-60,0,60,120,180].map(degree=><g key={'lon'+degree}><line x1={(degree+180)*2} x2={(degree+180)*2} y1="0" y2="360" stroke="currentColor" opacity=".15"/><text x={Math.min(690,(degree+180)*2+3)} y="354" fontSize="10" fill="currentColor">{degree}°</text></g>)}
  {[-60,-30,0,30,60].map(degree=><g key={'lat'+degree}><line x1="0" x2="720" y1={(90-degree)*2} y2={(90-degree)*2} stroke="currentColor" opacity=".15"/><text x="3" y={(90-degree)*2-3} fontSize="10" fill="currentColor">{degree}°</text></g>)}
  {points.map(({record,latitude,longitude})=><g key={record.id} data-map-record={record.id} {...activate(record.id)} aria-label={record.title+': '+latitude+', '+longitude} aria-pressed={selectedId===record.id} style={{cursor:'pointer'}}><title>{record.title}: {latitude}, {longitude}</title><circle cx={(longitude+180)*2} cy={(90-latitude)*2} r={selectedId===record.id?9:6} fill="var(--pwb-accent,#a44c32)" stroke="white" strokeWidth="2"/></g>)}
 </svg><p>{t('displayCoordinateMap')} · {points.length}/{records.length}</p></div>
}
