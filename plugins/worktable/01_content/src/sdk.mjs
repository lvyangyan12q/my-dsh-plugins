/** Public, browser-safe v1 compatibility handshake. No native execution or state access. */
export const PROTOCOL_VERSION=1
const features=Object.freeze(['application-registration-v1','instance-view-v1','resource-reference-v1','instance-role-v1','application-private-capability-v1','prepared-task-v1','application-lifecycle-v1','presentation-components-v1','composed-authoring-v1','composition-state-v1','resource-catalog-v1','application-migration-v1','module-generation-v1','module-generation-recovery-v1','controlled-web-bridge-v1','legacy-role-adoption-v1','native-role-context-v1'])
export function describeProtocol(){return {protocolVersion:PROTOCOL_VERSION,features:[...features]}}
export function requireProtocol(descriptor,required=[]){
 if(!descriptor||descriptor.protocolVersion!==PROTOCOL_VERSION||!Array.isArray(descriptor.features)||descriptor.features.some(value=>typeof value!=='string'))throw new Error('工作台接入协议不兼容；请安装支持协议1的工作台，原有数据保留。')
 if(!Array.isArray(required)||required.some(value=>typeof value!=='string'))throw new Error('应用协议能力要求无效。')
 const missing=required.filter(value=>!descriptor.features.includes(value))
 if(missing.length)throw new Error('工作台缺少应用所需能力：'+missing.join(', ')+'；原有数据保留。')
 return {protocolVersion:descriptor.protocolVersion,features:[...descriptor.features]}
}

/** Optional display controls. The caller supplies its own React; importing the server SDK loads none. */
export function createPresentation(React){
 if(!React||typeof React.createElement!=='function')throw new TypeError('展示组件需要应用传入React。')
 const h=React.createElement
 const text=value=>value===null||value===undefined||value===''?'未提供':typeof value==='object'?'不支持的字段':String(value)
 const field=(row,key)=>row&&typeof key==='string'&&Object.hasOwn(row,key)?row[key]:undefined
 const container={minWidth:0,maxWidth:'100%',boxSizing:'border-box',overflowWrap:'anywhere',color:'inherit',font:'inherit'}
 function State({phase='ready',error='',empty=false,emptyText='暂无数据。',onRetry}){
  if(phase==='loading')return h('p',{role:'status'},'正在加载…')
  if(phase==='error')return h('div',{role:'alert'},error||'加载失败。',onRetry&&h('button',{type:'button',onClick:onRetry},'重试'))
  return empty?h('p',{role:'status'},emptyText):null
 }
 function Surface({theme='inherit',children,label}){
  if(!['inherit','light','dark'].includes(theme))throw new TypeError('未知展示主题。')
  return h('section',{'data-worktable-presentation':theme,'aria-label':label,style:{...container,padding:12,borderRadius:8,background:theme==='dark'?'#202020':theme==='light'?'#faf9f6':'transparent',color:theme==='dark'?'#eee':theme==='light'?'#252525':'inherit',colorScheme:theme==='inherit'?undefined:theme}},children)
 }
 function Stats({records=[],metrics=[],phase='ready',error,onRetry}){
  if(phase!=='ready')return h(State,{phase,error,onRetry})
  if(metrics.some(metric=>!metric||typeof metric.id!=='string'||!metric.id||!['count','sum','average'].includes(metric.aggregate)||(metric.aggregate!=='count'&&(typeof metric.field!=='string'||!metric.field)))||new Set(metrics.map(metric=>metric.id)).size!==metrics.length)return h(State,{phase:'error',error:'统计字段映射无效，请检查字段和聚合方式。'})
  return h('dl',{style:{...container,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,120px),1fr))',gap:12,margin:0}},metrics.map(metric=>{
   let value=records.length
   if(metric.aggregate!=='count'){
    const values=records.map(row=>field(row,metric.field)).filter(value=>typeof value==='number'&&Number.isFinite(value))
    value=values.length?values.reduce((sum,n)=>sum+n,0):null
    if(metric.aggregate==='average'&&value!==null)value/=values.length
    if(value!==null&&!Number.isFinite(value))value=null
   }
   return h('div',{key:metric.id,style:{...container,padding:12,border:'1px solid color-mix(in srgb,currentColor 20%,transparent)',borderRadius:8}},h('dt',null,metric.label),h('dd',{'data-stat':metric.id,style:{margin:0,fontSize:'1.4em',fontVariantNumeric:'tabular-nums'}},text(value)))
  }))
 }
 function List({records=[],mapping,selectedId,onSelect,phase='ready',error,onRetry,emptyText}){
  if(phase!=='ready'||!records.length)return h(State,{phase,error,onRetry,empty:!records.length,emptyText})
  if(!mapping||typeof mapping.id!=='string'||typeof mapping.title!=='string')return h(State,{phase:'error',error:'列表字段映射无效。'})
  const ids=records.map(row=>field(row,mapping.id))
  if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return h(State,{phase:'error',error:'列表标识字段缺失或重复，请检查字段映射。'})
  return h('ul',{style:{...container,listStyle:'none',padding:0,margin:0,display:'grid',gap:6}},records.map((row,index)=>h('li',{key:ids[index],style:container},h('button',{type:'button','aria-label':mapping.selectionLabel?mapping.selectionLabel+' '+text(field(row,mapping.title)):undefined,'aria-pressed':selectedId===ids[index],onClick:()=>onSelect?.(ids[index]),style:{...container,width:'100%',textAlign:'start',padding:'8px 10px',borderRadius:6,border:'1px solid color-mix(in srgb,currentColor 28%,transparent)',background:selectedId===ids[index]?'color-mix(in srgb,currentColor 12%,transparent)':'transparent'}},text(field(row,mapping.title))),mapping.description&&h('p',{style:{margin:'4px 10px',whiteSpace:'pre-wrap'}},text(field(row,mapping.description))))))
 }
 function Detail({record,fields=[],phase='ready',error,onRetry,emptyText='请选择一项。'}){
  if(phase!=='ready'||!record)return h(State,{phase,error,onRetry,empty:!record,emptyText})
  return h('dl',{style:container},fields.map(item=>h('div',{key:item.field,style:{marginBottom:8}},h('dt',null,item.label),h('dd',{style:{margin:0,whiteSpace:'pre-wrap'}},text(field(record,item.field))))))
 }
 function Filters({fields=[],values={},onChange}){
  return h('div',{style:{...container,display:'flex',flexWrap:'wrap',gap:10}},fields.map(item=>h('label',{key:item.id,style:{display:'grid',gap:4,minWidth:0,flex:'1 1 140px'}},item.label,item.options?h('select',{'aria-label':item.label,value:values[item.id]??'',onChange:event=>onChange?.({...values,[item.id]:event.target.value}),style:{...container,width:'100%',padding:6,color:'inherit',background:'transparent',border:'1px solid color-mix(in srgb,currentColor 28%,transparent)',borderRadius:6}},item.options.map(option=>h('option',{key:option.value,value:option.value},option.label))):h('input',{'aria-label':item.label,value:values[item.id]??'',maxLength:item.maxLength??200,onChange:event=>onChange?.({...values,[item.id]:event.target.value}),style:{...container,width:'100%',padding:6,color:'inherit',background:'transparent',border:'1px solid color-mix(in srgb,currentColor 28%,transparent)',borderRadius:6}}))))
 }
 return Object.freeze({Surface,State,Stats,List,Detail,Filters})
}

/** Copy a presentation structure, not access, paths, payloads or native runtime identities. */
export function copyCompositionTemplate(recipe){
 if(!recipe||!Array.isArray(recipe.pages))throw new TypeError('模板结构无效。')
 const fields=value=>Array.isArray(value)?value.map(item=>Object.fromEntries(['id','label','field','aggregate','value'].filter(key=>typeof item?.[key]==='string').map(key=>[key,item[key]]))):undefined
 return {title:recipe.title,version:'1.0.0',layout:recipe.layout,pages:recipe.pages.map(page=>({id:page.id,title:page.title,modules:page.modules.map(module=>{
 const config={};for(const key of ['mapping'])if(module.config?.[key]&&typeof module.config[key]==='object'){config[key]=Object.fromEntries(['id','title','description','selectionLabel'].filter(name=>typeof module.config[key][name]==='string').map(name=>[name,module.config[key][name]]))}
 for(const key of ['metrics','fields'])if(Array.isArray(module.config?.[key]))config[key]=fields(module.config[key]);if(['inherit','light','dark'].includes(module.config?.theme))config.theme=module.config.theme
 return {id:module.id,type:module.type,config}
 })})),connections:[],roles:[]}
}
