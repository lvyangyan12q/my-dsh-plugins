import type {AppRecipe} from './recipe-api.ts'
export interface CanvasAnnotation {id:string;moduleId:string|null;moduleTitle:string;box:{x:number;y:number;width:number;height:number};canvas:{width:number;height:number;scrollX:number;scrollY:number};text:string;limited:boolean;moduleBounds?:{x:number;y:number;width:number;height:number;focused:boolean}}
type Point={x:number;y:number}
/** Capture only the selected rendered area, excluding composers and hidden nodes. */
export function captureAnnotation(canvas:HTMLElement,start:Point,end:Point,page:AppRecipe['pages'][number]):CanvasAnnotation{
 const rect=canvas.getBoundingClientRect(),clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n)),x=clamp(Math.min(start.x,end.x)-rect.left,rect.width),y=clamp(Math.min(start.y,end.y)-rect.top,rect.height)
 const width=clamp(Math.abs(end.x-start.x),rect.width-x),height=clamp(Math.abs(end.y-start.y),rect.height-y),cx=rect.left+x+width/2,cy=rect.top+y+height/2
 const focused=canvas.querySelector<HTMLElement>('[data-module-focused="true"]')
 const modules=focused?[focused]:[...canvas.querySelectorAll<HTMLElement>('[data-module-id]')]
 const top=canvas.ownerDocument.elementsFromPoint?.(cx,cy).map(element=>element.closest<HTMLElement>('[data-module-id]')).find(element=>element&&canvas.contains(element))
 const hit=(top&&modules.includes(top)?top:undefined)??modules.find(element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom}),module=page.modules.find(item=>item.id===hit?.dataset.moduleId)
 const intersects=(element:Element)=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>=rect.left+x&&r.left<=rect.left+x+Math.max(width,2)&&r.bottom>=rect.top+y&&r.top<=rect.top+y+Math.max(height,2)}
 const excluded=(element:Element)=>!!(focused&&element!==focused&&!focused.contains(element)&&!element.contains(focused))||!!element.closest('[data-pwb-annotation-ui],input,textarea,[contenteditable],script,style,[hidden]')
 const lines:string[]=[];let limited=[...canvas.querySelectorAll('iframe')].slice(0,64).some(element=>!excluded(element)&&intersects(element))
 const walker=canvas.ownerDocument.createTreeWalker(canvas,1,{acceptNode:element=>excluded(element as Element)?2:1})
 let visited=0
 for(let node=walker.nextNode();node&&visited<512;node=walker.nextNode(),visited++){
  const element=node as Element
  if(!intersects(element))continue
  if(element.tagName==='IFRAME'){limited=true;continue}
  if(element.children.length)continue
  const text=(element.textContent??'').replace(/\s+/g,' ').trim().slice(0,180)
  if(text&&!lines.includes(text)&&lines.length<8)lines.push(text)
 }
 const scroll=canvas.querySelector('.pwb-recipe-page'),bounds=hit?.getBoundingClientRect()
 return{id:crypto.randomUUID(),moduleId:module?.id??null,moduleTitle:module?.title??page.label,box:{x,y,width,height},canvas:{width:rect.width,height:rect.height,scrollX:scroll?.scrollLeft??0,scrollY:scroll?.scrollTop??0},text:lines.join('\n'),limited,...(bounds?{moduleBounds:{x:bounds.left-rect.left,y:bounds.top-rect.top,width:bounds.width,height:bounds.height,focused:hit===focused}}:{})}
}
export function annotationText(recipe:AppRecipe,instanceId:string,pageId:string,annotation:CanvasAnnotation,requirement:string){
 if(!requirement.trim()||requirement.length>2000)throw Error('Annotation requirement must contain 1–2000 characters')
 return '📌 工作台画布标注\n'+JSON.stringify({appId:recipe.appId,instanceId,recipeVersion:recipe.version,pageId,moduleId:annotation.moduleId,moduleTitle:annotation.moduleTitle,position:annotation.box,canvas:annotation.canvas,visibleText:annotation.text,embeddedContent:annotation.limited?'not readable; coordinates only':'no inaccessible frame in selection',requirement}).replaceAll('/','\\u002f')+'\n请依据标注位置和要求处理；读取受限或信息不足时如实说明，不要编造页面内容。'
}

/** Keep notes in history when their captured geometry no longer matches the visible layout. */
export function annotationPositionMatches(canvas:HTMLElement,mark:CanvasAnnotation):boolean{
 const rect=canvas.getBoundingClientRect(),scroll=canvas.querySelector('.pwb-recipe-page'),near=(a:number,b:number)=>Math.abs(a-b)<1
 if(!near(rect.width,mark.canvas.width)||!near(rect.height,mark.canvas.height)||!near(scroll?.scrollLeft??0,mark.canvas.scrollX)||!near(scroll?.scrollTop??0,mark.canvas.scrollY))return false
 if(!mark.moduleId)return !canvas.querySelector('[data-module-focused="true"]')
 const module=[...canvas.querySelectorAll<HTMLElement>('[data-module-id]')].find(element=>element.dataset.moduleId===mark.moduleId),bounds=module?.getBoundingClientRect(),saved=mark.moduleBounds
 return !!module&&!!bounds&&!!saved&&near(bounds.left-rect.left,saved.x)&&near(bounds.top-rect.top,saved.y)&&near(bounds.width,saved.width)&&near(bounds.height,saved.height)&&(module.dataset.moduleFocused==='true')===saved.focused
}
