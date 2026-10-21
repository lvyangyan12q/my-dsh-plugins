/** Browser boundary; no null-origin acceptance, wildcard target or caller-selected destination. */
export function bridgeEnvelope(event,source,origin,cap,type='worktable:request'){
 const value=event.data;const params=value?.params;if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(key=>value.method!=='prepare-task'||key!=='text')||value.method==='prepare-task'&&(typeof params.text!=='string'||!params.text.trim()||params.text.length>4000))return false
 return event.source===source&&event.origin===origin&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['type','protocol','capabilityId','revision','epoch','viewId','moduleId','instanceId','requestId','method','params'].includes(key))&&value.type===type&&value.protocol===1&&value.capabilityId===cap.id&&value.revision===cap.revision&&value.epoch===cap.epoch&&value.viewId===cap.viewId&&value.moduleId===cap.moduleId&&value.instanceId===cap.instanceId&&typeof value.requestId==='string'&&/^[-a-zA-Z0-9_.]{1,80}$/.test(value.requestId)&&cap.methods.includes(value.method)&&value.params&&typeof value.params==='object'&&!Array.isArray(value.params)
}
/** Runtime negative control: a browser must execute the ordinary trusted probe and block its csp-restricted twin. */
export async function verifyEmbeddedCsp(doc=document){
 if(!('csp' in doc.createElement('iframe')))return false
 const probe=(restricted)=>new Promise(resolve=>{
  const frame=doc.createElement('iframe');frame.hidden=true;frame.setAttribute('sandbox','allow-scripts allow-same-origin');if(restricted)frame.setAttribute('csp',"script-src 'none'")
  let finished=false;const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);frame.remove();resolve(value)}
  const timer=setTimeout(()=>finish(null),5000)
  frame.addEventListener('load',()=>{try{if(!frame.contentDocument?.location.pathname.endsWith('/bridge/probe'))return;finish(frame.contentDocument.body?.dataset.worktableCspProbe??null)}catch{finish(null)}})
  frame.src='/api/worktable/bridge/probe';doc.body.append(frame)
 })
 const control=await probe(false);if(control!=='executed')return false
 return await probe(true)==='blocked'
}
