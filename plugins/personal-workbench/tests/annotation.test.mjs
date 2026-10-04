import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import {captureAnnotation,annotationText} from '../src/annotation.ts'
import {installAnnotations} from '../src/annotation-client.ts'
const key={appId:'app.test',instanceId:'default',roleId:'maker'}, recipe={appId:key.appId,version:2,pages:[{id:'home',label:'Home',modules:[{id:'web',title:'Website'}]}]}
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height})
test('annotation captures an arbitrary background or selected pane without copying composer or iframe content',()=>{
 const dom=new JSDOM('<div id="canvas"><section data-module-id="web"><span>Visible heading</span><textarea>Private draft</textarea><div contenteditable>Private editor</div><div hidden>Hidden</div><iframe></iframe></section><aside data-pwb-annotation-ui>Annotation controls</aside></div>'),canvas=dom.window.document.getElementById('canvas')
 canvas.getBoundingClientRect=()=>rect(100,50,800,600)
 for(const element of canvas.querySelectorAll('*'))element.getBoundingClientRect=()=>rect(120,100,150,80)
 const hidden=dom.window.document.createElement('div');hidden.hidden=true;hidden.innerHTML='<i></i>'.repeat(600);canvas.prepend(hidden)
 const selected=captureAnnotation(canvas,{x:110,y:95},{x:300,y:220},recipe.pages[0])
 assert.equal(selected.moduleId,'web');assert.deepEqual(selected.box,{x:10,y:45,width:190,height:125});assert.equal(selected.text,'Visible heading');assert.equal(selected.limited,true)
 const background=captureAnnotation(canvas,{x:800,y:500},{x:800,y:500},recipe.pages[0]);assert.equal(background.moduleId,null);assert.equal(background.text,'')
 const text=annotationText(recipe,'default','home',selected,'Change the heading / enlarge text');assert.ok(text.includes('app.test'));assert.ok(text.includes('not readable'));assert.ok(!text.includes('Private draft'));assert.throws(()=>annotationText(recipe,'default','home',selected,''));dom.window.close()
})
function bridge({phase='plain',scopeMissing=false,bailResult=true,opening,unconfirmed=false}={}){
 let service;const calls=[], state={phase,draft:'prefix @report suffix',draftRev:7,occurrences:[{offset:7,length:7}]},input={state:{getSnapshot:()=>({...state})},focus:()=>calls.push(['focus'])}
 const roles={open:async()=>{calls.push(['open']);await opening},view:{getSnapshot:()=>new Map([[JSON.stringify(['app.test','default','maker',null]),{binding:{phase:'ready',sessionId:'owned-session'},window:{phase:'open'}}]])}}
 const scope={bail:(event,payload)=>{calls.push([event,payload]);if(bailResult&&!unconfirmed)Object.assign(state,{draft:state.draft+payload.text,draftRev:state.draftRev+1});return bailResult}}
 const child={personalWorkbenchRoles:roles,sessions:{scope:id=>{calls.push(['scope',id]);return scopeMissing?undefined:scope}},conversation:{input:{for:s=>{assert.equal(s,scope);return input}}},effect:fn=>fn(),reflect:{provide:(_name,value)=>{service=value}}}
 installAnnotations({inject:(_services,fn)=>fn(child)});return {service,calls,state}
}
test('native annotation appends with draft revision and compact file chip span, focusing without submitting or replacing input',async()=>{
 const f=bridge(),original=f.state.draft;assert.equal(await f.service.append(key,'Annotation'),'owned-session')
 const insertion=f.calls.find(call=>call[0]==='slash/input-insert-text');assert.deepEqual(insertion[1],{text:'\n\nAnnotation',span:{start:original.length-6,end:original.length-6,draftRev:7}})
 assert.deepEqual(f.calls.map(call=>call[0]),['open','scope','slash/input-insert-text','focus']);assert.equal(f.state.draft,'prefix @report suffix\n\nAnnotation');assert.deepEqual(f.state.occurrences,[{offset:7,length:7}])
})
test('native annotation refuses unavailable scopes, busy or concurrently changed drafts',async()=>{
 await assert.rejects(bridge({scopeMissing:true}).service.append(key,'Annotation'),/unavailable/)
 const busy=bridge({phase:'submitting'});await assert.rejects(busy.service.append(key,'Annotation'),/busy/);assert.ok(!busy.calls.some(c=>c[0]==='slash/input-insert-text'))
 await assert.rejects(bridge({bailResult:false}).service.append(key,'Annotation'),/changed/)
 await assert.rejects(bridge({unconfirmed:true}).service.append(key,'Annotation'),/not confirmed/)
})
test('switching or closing an application while opening its conversation cancels insertion',async()=>{
 let resolve;const opening=new Promise(done=>resolve=done),f=bridge({opening}),controller=new AbortController(),pending=f.service.append(key,'Annotation',controller.signal);controller.abort();resolve()
 await assert.rejects(pending,{name:'AbortError'});assert.ok(!f.calls.some(c=>c[0]==='scope'||c[0]==='slash/input-insert-text'))
})

test('focused top module owns the annotation and covered module text is excluded',()=>{
 const dom=new JSDOM('<div id="canvas"><section data-module-id="a"><b>Covered A</b><iframe></iframe></section><section data-module-id="z" data-module-focused="true"><b>Visible Z</b></section></div>'),canvas=dom.window.document.getElementById('canvas');canvas.getBoundingClientRect=()=>rect(0,0,800,600);for(const element of canvas.querySelectorAll('*'))element.getBoundingClientRect=()=>rect(0,44,800,556)
 const page={label:'Page',modules:[{id:'a',title:'A'},{id:'z',title:'Z'}]},capture=captureAnnotation(canvas,{x:100,y:100},{x:100,y:100},page);assert.equal(capture.moduleId,'z');assert.equal(capture.text,'Visible Z');assert.equal(capture.limited,false);dom.window.close()
})
