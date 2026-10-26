const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
function requireValue(condition){if(!condition)throw new Error('布局结构、身份、内容引用或尺寸无效。')}
function text(value,empty=false){requireValue(typeof value==='string'&&value.length<=8192&&(empty||value.trim().length>0)&&!value.includes('\0'));return value}
function number(value){requireValue(typeof value==='number'&&Number.isFinite(value)&&value>=0);return value}
function fields(value,keys){const result={};for(const key of keys)if(value[key]!==undefined)result[key]=value[key];return result}
function content(value){
  requireValue(object(value))
  if(value.kind==='application'){for(const key of ['appId','instanceId','viewId'])text(value[key]);if(value.title!==undefined)text(value.title,true);return fields(value,['kind','appId','instanceId','viewId','title'])}
  if(value.kind==='iframe'){text(value.url);if(value.title!==undefined)text(value.title,true);return fields(value,['kind','url','title'])}
  if(value.kind==='file'){text(value.path);return fields(value,['kind','path'])}
  requireValue(value.kind==='builtin'&&['browser','anim','explorer','scm','tasks','terminal','custom','console'].includes(value.type));if(value.url!==undefined)text(value.url,true);return fields(value,['kind','type','url'])
}
function pane(value,seen){
  requireValue(object(value));text(value.id);text(value.title,true);number(value.min);requireValue(!seen.has(value.id));seen.add(value.id)
  const result={id:value.id,title:value.title,min:value.min}
  if(value.content!==undefined)result.content=value.content===null?null:content(value.content)
  if(value.tabs!==undefined){
    requireValue(Array.isArray(value.tabs)&&value.tabs.length<=200);const tabs=new Set()
    result.tabs=value.tabs.map(tab=>{requireValue(object(tab));text(tab.id);text(tab.title,true);requireValue(!tabs.has(tab.id));tabs.add(tab.id);return {id:tab.id,title:tab.title,content:content(tab.content)}})
  }
  if(value.active!==undefined){requireValue(Number.isSafeInteger(value.active)&&value.active>=0&&(!result.tabs?.length?value.active===0:value.active<result.tabs.length));result.active=value.active}
  if(value.collapsed!==undefined){requireValue(typeof value.collapsed==='boolean');result.collapsed=value.collapsed}
  return result
}
function dimension(value){requireValue(object(value));const result={default:number(value.default),min:number(value.min),max:number(value.max)};requireValue(result.min<=result.max);return result}
export function validateLayout(value){
  requireValue(object(value)&&object(value.project)&&object(value.spec)&&object(value.geometry))
  const project={id:text(value.project.id),name:text(value.project.name,true)},source=value.spec
  requireValue(source.id===project.id);text(source.title,true)
  const seen=new Set(),row=panes=>{requireValue(Array.isArray(panes)&&panes.length<=100);return panes.map(item=>pane(item,seen))}
  const spec={id:project.id,title:source.title,top:source.top==null?null:row(source.top),main:row(source.main),chatWidth:dimension(source.chatWidth)}
  if(source.left!==undefined)spec.left=source.left===null?null:pane(source.left,seen)
  if(source.leftMore!==undefined){spec.leftMore=source.leftMore===null?null:row(source.leftMore);requireValue(!spec.leftMore?.length||!!spec.left)}
  requireValue(seen.size>0)
  for(const key of ['leftWidth','topHeight'])if(source[key]!==undefined)spec[key]=dimension(source[key])
  if(source.chatSide!==undefined){requireValue(['left','right'].includes(source.chatSide));spec.chatSide=source.chatSide}
  if(source.chatFullHeight!==undefined){requireValue(typeof source.chatFullHeight==='boolean');spec.chatFullHeight=source.chatFullHeight}
  if(source.topHeightRatio!==undefined){number(source.topHeightRatio);requireValue(source.topHeightRatio>0&&source.topHeightRatio<1);spec.topHeightRatio=source.topHeightRatio}
  if(source.icon!==undefined)spec.icon=text(source.icon,true)
  const geometry={chatW:number(value.geometry.chatW),topH:number(value.geometry.topH),leftW:number(value.geometry.leftW)}
  const rows={paneWs:spec.main,topWs:spec.top??[],leftWs:spec.left?[spec.left,...(spec.leftMore??[])]:[]}
  for(const [key,panes] of Object.entries(rows)){
    const widths=value.geometry[key];requireValue(object(widths));const ids=new Set(panes.map(p=>p.id));geometry[key]={}
    for(const [id,width] of Object.entries(widths)){requireValue(ids.has(id));Object.defineProperty(geometry[key],id,{value:number(width),enumerable:true,writable:true,configurable:true})}
  }
  return {project,spec,geometry}
}

export function validateDocument(value){
  requireValue(object(value)&&value.version===2&&Number.isSafeInteger(value.revision)&&value.revision>0)
  text(value.savedAt);requireValue(Number.isFinite(Date.parse(value.savedAt)))
  return {version:2,revision:value.revision,savedAt:value.savedAt,...validateLayout(value)}
}
