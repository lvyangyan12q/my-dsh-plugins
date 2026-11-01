export function createContinuation(storage){return {async request(body){
 const s=await storage.read();if(!s.instances.some(i=>i.id===body.instanceId))throw Error('学习位置归属不符');s.continuations??=[];
 const graph=s.maps?.find(m=>m.instanceId===body.instanceId),courses=(s.courses??[]).filter(c=>c.instanceId===body.instanceId);
 if(body.action==='continuation-save'){
  const old=s.continuations.find(p=>p.instanceId===body.instanceId)??{instanceId:body.instanceId,courseId:null,conceptId:null,view:'course',parameters:{}};
  const next={...old};for(const k of ['courseId','conceptId','view','parameters'])if(Object.hasOwn(body,k))next[k]=body[k];
  if(next.courseId&&!courses.some(c=>c.id===next.courseId))throw Error('课程归属不符');if(next.conceptId&&!graph?.nodes.some(n=>n.id===next.conceptId))throw Error('概念归属不符');
  if(!['course','map'].includes(next.view)||!next.parameters||Array.isArray(next.parameters)||typeof next.parameters!=='object'||JSON.stringify(next.parameters).length>8000)throw Error('学习位置无效');
  if(next.courseId!==old.courseId&&!Object.hasOwn(body,'parameters'))next.parameters={};
  s.continuations=s.continuations.filter(p=>p.instanceId!==body.instanceId);s.continuations.push(next);await storage.write(s);return structuredClone(next);
 }
 if(body.action!=='continuation-read')throw Error('未知学习位置操作');
 const evidence=(s.evidence??[]).filter(e=>e.instanceId===body.instanceId);
 const attempted=id=>{const n=graph?.nodes.find(n=>n.id===id);return courses.some(c=>c.concepts.includes(n?.title)&&evidence.some(e=>e.courseId===c.id&&e.version===c.version))};
 const recommendations=(graph?.nodes??[]).map(n=>{const course=courses.find(c=>c.concepts.includes(n.title)),missing=graph.edges.filter(e=>e.type==='prerequisite'&&e.to===n.id&&!attempted(e.from));const seen=attempted(n.id);return {conceptId:n.id,title:n.title,courseId:course?.id??null,reason:missing.length?'建议先练习先修概念：'+missing.map(e=>graph.nodes.find(n=>n.id===e.from).title).join('、'):seen?'已有练习记录，建议复习或尝试变式；不代表长期掌握':'尚无练习证据，建议从这里开始',priority:missing.length?2:seen?1:0}}).sort((a,b)=>a.priority-b.priority);
 return {position:structuredClone(s.continuations.find(p=>p.instanceId===body.instanceId)??null),recommendations};
}}}
