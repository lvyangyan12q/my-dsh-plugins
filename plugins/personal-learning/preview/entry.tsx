import React from 'react'
import {createRoot} from 'react-dom/client'
import {LearningStudio} from '../src/client.tsx'

const courseHtml = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:13px/1.7 system-ui;background:#fff;color:#1f1f1d}
.wrap{padding:18px}
h1{font-size:17px;margin:0 0 6px}
p{margin:0 0 6px;color:#6f6f68}
.grid{display:flex;flex-wrap:wrap;gap:5px;margin:12px 0}
.dot{width:10px;height:10px;border-radius:50%;background:#e3e3de}
.dot.b{background:#cfcfc8}
.dot.ab{background:#0f6b3f}
.read{display:flex;gap:10px;margin-top:10px}
.read div{flex:1;border:1px solid #e6e6e2;border-radius:8px;padding:8px 10px}
small{color:#8a8a84}
b{font-variant-numeric:tabular-nums}
</style><div class="wrap"><h1>把范围缩小到 B</h1>
<p>同一个 30 个球，放在 100 个里是 30%，放在 40 个里是 75%。</p>
<div class="grid" id="g"></div>
<div class="read"><div><small>P(A∩B)</small><br><b id="j">30%</b></div><div><small>P(A|B)</small><br><b id="c">75%</b></div></div>
</div>
<script>
function render(p){p=p||{};var N=+p.N||100,B=+p.B||40,AB=+p.AB||30;var g=document.getElementById('g');g.innerHTML='';
for(var i=0;i<N;i++){var d=document.createElement('span');d.className='dot'+((i<N-B)?'':(i<N-B+AB?' ab':' b'));g.appendChild(d)}
document.getElementById('j').textContent=Math.round(AB/N*1000)/10+'%';
document.getElementById('c').textContent=B?Math.round(AB/B*1000)/10+'%':'未定义'}
render(window.personalLearning&&window.personalLearning.parameters);
window.addEventListener('personal-learning:parameters',function(e){render(e.detail)});
</script>`

const instance = {id:'i1',title:'条件概率',goal:'能向别人解释条件概率，并判断日常说的“概率”是哪种',priorKnowledge:'会算古典概型，没学过条件概率',createdAt:new Date().toISOString()}
const course = {
  id:'c1',instanceId:'i1',version:1,title:'条件概率：把范围缩小到 B',html:courseHtml,concepts:['条件概率'],sources:[],createdAt:new Date().toISOString(),
  lab:{
    version:1,
    parameters:[
      {id:'N',label:'样本 N',min:20,max:200,step:10,initial:100},
      {id:'B',label:'B 的数量',min:1,max:100,step:1,initial:40},
      {id:'AB',label:'A∩B',min:0,max:40,step:1,initial:30},
    ],
    readouts:[
      {id:'joint',label:'P(A∩B)',numerator:'AB',denominator:'N'},
      {id:'cond',label:'P(A|B)',numerator:'AB',denominator:'B'},
    ],
    prediction:{question:'把范围缩到 B 之后，A 占的比例会——',options:[{id:'up',label:'变大',feedback:'对：分母从 100 缩到 40，比例被抬高。'},{id:'same',label:'不变'}],correct:'up'},
    restate:{prompt:'用自己的话说明为什么分母变成 40',checks:[{id:'den',label:'提到分母',keywords:['分母']},{id:'narrow',label:'提到缩小',keywords:['缩小','范围']},{id:'num',label:'提到 40',keywords:['40']}]},
  },
}

let state = {instances:[instance],lastInstanceId:'i1',bindings:[],requests:[],courses:[course],maps:[],mapDrafts:[],evidence:[],continuations:[{instanceId:'i1',courseId:'c1',conceptId:null,view:'course',parameters:{N:100,B:40,AB:30}}]}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

window.fetch = async (_url, options) => {
  await sleep(10)
  const body = options?.body ? JSON.parse(options.body) : undefined
  if (!body) return {ok:true, json:async()=>structuredClone(state)}
  switch (body.action) {
    case 'open': state.lastInstanceId = body.instanceId; return {ok:true, json:async()=>({ok:true})}
    case 'continuation-read': return {ok:true, json:async()=>({position:state.continuations[0], recommendations:[]})}
    case 'continuation-save': Object.assign(state.continuations[0], body); return {ok:true, json:async()=>({})}
    case 'course-list': return {ok:true, json:async()=>state.courses}
    case 'request-list': return {ok:true, json:async()=>[]}
    case 'teaching-workspaces': return {ok:true, json:async()=>[{id:'w1',path:'~/workspaces/learning'}]}
    case 'teaching-open': return {ok:true, json:async()=>({sessionId:'s1'})}
    case 'map-read': return {ok:true, json:async()=>({})}
    case 'evidence-save': return {ok:true, json:async()=>({correct:true, feedbackText:'对：分母从 100 缩到 40。', checks:[{id:'den',label:'提到分母',passed:true},{id:'narrow',label:'提到缩小',passed:true},{id:'num',label:'提到 40',passed:true}], passed:true})}
    case 'lab-complete': return {ok:true, json:async()=>({ok:true})}
    default: return {ok:true, json:async()=>({})}
  }
}

createRoot(document.getElementById('root')).render(React.createElement(LearningStudio, {openSession:()=>{}}))



if(location.search.includes('unlocked')){setTimeout(()=>{document.querySelector('.pl-opt')?.click()},700)}
