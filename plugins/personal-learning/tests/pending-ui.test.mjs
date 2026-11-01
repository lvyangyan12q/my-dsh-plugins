import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
test('map preparation can be reviewed and explicitly sent from the teaching panel',async()=>{
 const base=new URL('../',import.meta.url)
 await build({stdin:{contents:"export {RequestPanel} from './src/request-panel.tsx';export {PersonalMap} from './src/personal-map.tsx'",resolveDir:fileURLToPath(base),loader:'tsx'},outfile:fileURLToPath(new URL('.checks/pending.mjs',base)),bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'})
 const {RequestPanel,PersonalMap}=await import('../.checks/pending.mjs')
 const dom=new JSDOM('<div id="root"></div>');const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
 let draft,sends=0,opened;const request=async b=>{if(b.action==='map-read'||b.action==='continuation-read')return {};if(b.action==='course-list')return [];if(b.action==='request-prepare')return draft={...b,id:'map-draft',revision:1,status:'prepared'};if(b.action==='request-list')return[draft];if(b.action==='request-edit')return draft={...draft,...b,revision:2};if(b.action==='request-send'){sends++;return{...draft,status:'accepted',sessionId:'native'}};throw Error(b.action)}
 const root=createRoot(document.getElementById('root'));const props={instanceId:'i',request,openSession:id=>{opened=id}}
 const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click())
 try{await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(PersonalMap,props),React.createElement(RequestPanel,props))));await click('准备地图生成请求');assert.equal(sends,0);await click('刷新待发送请求');await act(async()=>{const select=document.querySelector('[aria-label="选择待发送请求"]');select.value='map-draft';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.match(document.querySelector('pre').textContent,/personal_learning_submit_map/);assert.equal(sends,0);await click('显式发送到原生教学');assert.equal(sends,1);assert.equal(opened,'native')}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous)}
})
