import assert from 'node:assert/strict'
import {test} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {DisplayModule} from '../src/display-view.tsx'
import {DisplayStore} from '../src/display-store.ts'
import {displayModuleContext} from '../src/display-context.ts'

test('representable averages stay finite and identical in visible cards and role evidence, including after filtering',async()=>{
 for(const[values,expected]of [[[Number.MAX_VALUE,Number.MAX_VALUE],Number.MAX_VALUE],[[Number.MAX_VALUE],Number.MAX_VALUE],[[Number.MAX_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,-Number.MAX_VALUE],0],[[10,20,30],20],[[1,2],1.5]]){
  const source={appId:'numbers',resource:'values',label:'Numbers',load:async()=>({records:values.map((value,i)=>({id:String(i),title:'Row '+i,fields:{value}})),filters:[],stats:[{id:'average',label:'Average',operation:'average',field:'value'}]})}
  const store=new DisplayStore(source,{appId:'numbers',instanceId:'one',preview:false})
  try{await store.reload()
   const verify=value=>{const html=renderToStaticMarkup(React.createElement(DisplayModule,{type:'stats',store,t:k=>k}));assert.ok(html.includes('data-stat="average">'+String(value)+'</dd>'),html)
    const result=displayModuleContext({appId:'numbers',instanceId:'one',module:{id:'stats',type:'stats',connectionId:'values'},t:k=>k},store,source)
    assert.equal(result.phase,'ready');assert.equal(JSON.parse(result.context.find(c=>c.id==='stats.statistics').text).statistics[0].value,value)}
   verify(expected);store.setSearch('Row 0');verify(values[0])
  }finally{store.dispose()}
 }
})
