import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {studyDate} from '../src/study-date.ts'

type Call={path:string;body:any}

function environment(){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  return {dom,restore(){for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}}
}

function fakeServer(options:{recall?:unknown[];errors?:unknown[];modules?:unknown[]}={}){
  const calls:Call[]=[]
  const plan={revision:0,goal:null,tasks:[],drafts:[],history:[],externalMocks:[],completionProposals:[]}
  const dashboard={today:studyDate(),examDate:null,daysToExam:null,totalDays:0,pastDays:0,pastDone:0,pastDonePct:0,totalQuestions:0,totalCorrect:0,totalWrong:0,accuracyRate:0,bankTotal:0,knowledgeTotal:0,todayPlan:{phase:'foundation',items:[]},modules:options.modules??[],weakPoints:[],recentKnowledge:[]}
  const points=[{id:'p1',subject:'行测-资料分析',chapter:'资料分析',knowledgePoint:'增长率',status:'learning',materials:[]}]
  let round:any=null
  const fetch=async(input:string|URL|Request,init?:RequestInit)=>{
    const path=String(input),body=typeof init?.body==='string'?JSON.parse(init.body):undefined
    calls.push({path,body})
    if(path==='/api/kaogong/plan')return Response.json(plan)
    if(path==='/api/kaogong/dashboard')return Response.json(dashboard)
    if(path==='/api/kaogong/recall')return Response.json({items:options.recall??[]})
    if(path==='/api/kaogong/errors'||path.startsWith('/api/kaogong/errors?'))return Response.json({occurrences:options.errors??[]})
    if(path==='/api/kaogong/route')return Response.json({points,coverage:{learned:0,total:points.length}})
    if(path==='/api/kaogong/material-points')return Response.json({materials:[],points:[],mappings:[]})
    if(path==='/api/kaogong/study')return Response.json({libraries:[],connections:[]})
    if(path.includes('/lesson/list'))return Response.json([])
    if(path.includes('/lesson/current'))return Response.json(null)
    if(path.endsWith('/practice/start')){
      round={roundId:'20000000-0000-4000-8000-000000000001',context:{subject:body.subject,title:body.title,limit:body.limit,...(body.knowledgePoint?{knowledgePoint:body.knowledgePoint}:{}),...(body.taskId?{taskId:body.taskId}:{})},questions:[{id:'q1',subject:body.subject,knowledgePoint:'增长率',stem:'第一项是多少',options:['A. 1','B. 2'],source:'合成题',difficulty:'easy'}],returned:1,totalAvailable:1,result:null,reflections:[],reason:'合成边界',cycled:false,seenIds:[]}
      return Response.json(round)
    }
    if(path.endsWith('/practice/read'))return Response.json(round)
    return Response.json(null)
  }
  return {fetch,calls}
}

let sequence=0
async function mount(options:{panel?:boolean;recall?:unknown[];errors?:unknown[];modules?:unknown[]}={}){
  const {dom,restore}=environment(),original=globalThis.fetch,server=fakeServer(options)
  globalThis.fetch=server.fetch as typeof fetch
  const profile='flat-nav-'+(++sequence),root=createRoot(document.getElementById('root')!),roleCalls:unknown[]=[]
  const {SdkClassroom}=await import('../src/sdk-classroom.tsx')
  const {KaogongStateContext,KaogongPresentationContext,KaogongViewStatePool}=await import('../src/view-state.tsx')
  const pool=new KaogongViewStatePool()
  const roles={ensure:async(id:string)=>{roleCalls.push(['ensure',id]);return {phase:'ready',sessionId:'session-'+id,revision:1}},open:async(...args:unknown[])=>{roleCalls.push(['open',...args])}}
  await act(async()=>root.render(
    <KaogongStateContext.Provider value={pool.forInstance(profile)}>
      <KaogongPresentationContext.Provider value={pool.forView(profile,'view:'+profile)}>
        <SdkClassroom {...{profile:{id:profile,title:'备考'},view:{id:'view:'+profile},panel:options.panel,roles,tasks:null} as never}/>
      </KaogongPresentationContext.Provider>
    </KaogongStateContext.Provider>,
  ))
  const settle=async(action?:()=>void,wait=0)=>act(async()=>{action?.();await new Promise(resolve=>setTimeout(resolve,wait))})
  const navButtons=()=>[...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="学习页面"] button')]
  const findButton=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes(text))
  const waitFor=async(predicate:()=>boolean)=>{for(let i=0;i<80&&!predicate();i++)await settle(undefined,10);assert.ok(predicate())}
  return {
    dom,server,profile,roleCalls,
    navLabels:()=>navButtons().map(button=>button.textContent),
    settle,waitFor,findButton,
    async clickNav(title:string){await settle(()=>{const button=navButtons().find(node=>node.textContent===title);assert.ok(button,'找不到导航：'+title);button!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))})},
    async clickButton(text:string){await settle(()=>{const button=findButton(text);assert.ok(button,'找不到按钮：'+text);button!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}))})},
    async unmount(){await act(async()=>root.unmount());pool.dispose();globalThis.fetch=original;dom.window.close();restore()},
  }
}

test('资料库与自由练习与学习页同级可见，右侧面板复用同一套页面名称',async()=>{
  const ui=await mount()
  try{
    const {learningPages,learningNavigation}=await import('../src/sdk-classroom.tsx')
    assert.deepEqual(learningPages.map(page=>page.id),['overview','classroom','plan','errors','progress','materials','practice'])
    assert.deepEqual(ui.navLabels(),learningPages.map(page=>page.title))
    assert.equal([...document.querySelectorAll('summary')].some(node=>node.textContent==='资料与工具'),false,'资料库和自由练习不应再折叠')
    const buttons=ui.dom.window.document.querySelectorAll<HTMLButtonElement>('nav[aria-label="学习页面"] button')
    assert.equal(buttons.length,learningPages.length)
    for(const button of buttons){
      assert.equal(button.tagName,'BUTTON')
      assert.equal(button.disabled,false)
      assert.equal(button.closest('details'),null,'导航入口不应藏在折叠项里')
      button.focus()
      assert.equal(document.activeElement,button,'键盘应可直接到达该入口')
    }
    await ui.clickNav('资料库')
    await ui.waitFor(()=>!!document.querySelector('[aria-label="资料来源与授权"]'))
    await ui.clickNav('自由练习')
    await ui.waitFor(()=>document.body.textContent?.includes('模块练习')??false)
    assert.equal(ui.navLabels().includes('自由练习'),true)
    assert.deepEqual(learningNavigation(false).map(page=>page.title),learningPages.map(page=>page.title))
  }finally{await ui.unmount()}

  const panel=await mount({panel:true})
  try{
    const {learningPages,learningNavigation}=await import('../src/sdk-classroom.tsx')
    assert.deepEqual(panel.navLabels(),['课堂','复习中心','资料库','自由练习'])
    assert.deepEqual(panel.navLabels(),learningNavigation(true).map(page=>page.title))
    assert.equal(learningNavigation(true).every(item=>learningPages.some(page=>page.id===item.id&&page.title===item.title)),true)
    assert.doesNotMatch(document.body.textContent??'',/学习目标|练习训练/,'面板不能给同一页面另起名字')
    for(const button of panel.dom.window.document.querySelectorAll<HTMLButtonElement>('nav[aria-label="学习页面"] button')){button.focus();assert.equal(document.activeElement,button)}
  }finally{await panel.unmount()}
})

test('今日到期项直接开始，不新建课堂也不要求选择角色',async()=>{
  const ui=await mount({recall:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01T00:00:00.000Z',history:[]}]})
  try{
    await ui.waitFor(()=>!!ui.findButton('增长率'))
    const start=ui.findButton('增长率')!
    assert.match(start.textContent??'',/回忆|开始/)
    await ui.settle(()=>start.dispatchEvent(new ui.dom.window.MouseEvent('click',{bubbles:true})))
    await ui.waitFor(()=>!!document.querySelector('textarea'))
    assert.ok(document.querySelector('textarea'),'到期回忆应直接进入回忆表单')
    assert.doesNotMatch(document.body.textContent??'',/新建课堂/)
    assert.deepEqual(ui.roleCalls,[],'复习直达不应创建角色或打开原生角色会话')
    assert.equal(ui.server.calls.some(call=>call.path.endsWith('/plan/start')),false,'复习直达不应重新创建课堂')
    await ui.clickButton('返回复习队列')
    await ui.waitFor(()=>!!ui.findButton('开始回忆'))
    await ui.clickButton('开始回忆')
    await ui.waitFor(()=>!!document.querySelector('textarea'))
    assert.ok(document.querySelector('textarea'),'复习中心点开队列项也应直接开始')
    assert.deepEqual(ui.roleCalls,[])
  }finally{await ui.unmount()}
})

test('自由练习不带任务身份，切页后未保存作答与草稿仍在',async()=>{
  const ui=await mount({modules:[{subject:'行测-资料分析',availableCount:10,practicedCount:0,wrongCount:0,accuracyRate:0}]})
  try{
    await ui.clickNav('自由练习')
    await ui.waitFor(()=>!!ui.findButton('开始 10 题练习'))
    await ui.clickButton('开始 10 题练习')
    await ui.waitFor(()=>document.querySelectorAll('input[type=radio]').length>0)
    const start=ui.server.calls.find(call=>call.path.endsWith('/practice/start'))
    assert.ok(start,'应发起自主练习')
    assert.equal(start!.body.taskId,undefined,'自由练习不得挂到任务')
    assert.equal(start!.body.planRevision,undefined,'自由练习不得携带任务计划版本')
    assert.equal(start!.body.planIndex,undefined,'自由练习不得携带今日任务序号')
    assert.equal(start!.body.title,'模块练习')
    assert.equal(ui.server.calls.some(call=>call.path.endsWith('/plan/start')),false)
    assert.equal(ui.dom.window.localStorage.getItem('kaogong/recent-task/'+encodeURIComponent(ui.profile)),null,'自由练习不应改写最近任务')

    const answers=[...document.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    await ui.settle(()=>answers[1].click())
    assert.equal(answers[1].checked,true)
    await ui.clickNav('资料库')
    await ui.waitFor(()=>!!document.querySelector('[aria-label="资料来源与授权"]'))
    await ui.clickNav('自由练习')
    await ui.waitFor(()=>document.querySelectorAll('input[type=radio]').length>0)
    const restored=[...document.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    assert.equal(restored[1].checked,true,'切页后未保存的作答仍在')
    let draftKey:string|undefined
    for(let index=0;index<ui.dom.window.localStorage.length;index++){const key=ui.dom.window.localStorage.key(index);if(key?.endsWith('/practice-draft/v1'))draftKey=key}
    assert.ok(draftKey,'应保存练习草稿')
    const draft=JSON.parse(ui.dom.window.localStorage.getItem(draftKey!)??'{}')
    assert.equal(draft.answers?.q1,'B','切页后练习草稿仍在')
  }finally{await ui.unmount()}
})
