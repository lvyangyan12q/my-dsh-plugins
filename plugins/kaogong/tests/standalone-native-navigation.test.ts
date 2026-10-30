import test from 'node:test'
import assert from 'node:assert/strict'
import {openNativeStudySession} from '../src/study-native-navigation.ts'

test('learning opens its right panel only after the exact original Native Session is mounted',async()=>{
  let mounted:string|undefined
  const listeners=new Set<()=>void>(),opened:unknown[]=[]
  const native={uiWorkspace:{openSession:(id:string)=>{opened.push(['session',id])}},sidebarRight:{mounted:{getSnapshot:()=>mounted,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)}},openTab:(kind:string,options:unknown)=>opened.push(['tab',kind,options])}}
  const controller=new AbortController()
  const pending=openNativeStudySession(native,{sessionId:'original-teacher',profileId:'profile-a',viewId:'view-a'},controller.signal)
  assert.deepEqual(opened,[['session','original-teacher']])
  mounted='another-session';for(const listener of listeners)listener()
  assert.equal(opened.length,1)
  mounted='original-teacher';for(const listener of listeners)listener()
  await pending
  assert.deepEqual(opened[1],['tab','kaogong-learning',{params:{sessionId:'original-teacher',profileId:'profile-a',viewId:'view-a'}}])
  assert.equal(listeners.size,0)
})
