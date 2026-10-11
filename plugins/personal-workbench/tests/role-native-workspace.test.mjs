import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Readable} from 'node:stream'
import {installRoles} from '../src/role-host.ts'

test('application role joins its existing native workspace before ready and repairs the same legacy Session',async()=>{
 const rows=new Map(),members=new Set(),created=[],key={appId:'reading',instanceId:'default',roleId:'analyst'},cwd='C:/learning',preset='managed-analyst'
 const workspace={path:cwd,get sessionIds(){return [...members]},attachSession:async id=>members.add(id)}
 const ctx={get:()=>undefined,on:()=>()=>{},storageDomain:{open:async()=>({table:()=>({get:key=>rows.get(key),put:async(key,row)=>rows.set(key,row)}),close:async()=>{}})},agentPresets:{resolve:async id=>({id})},skills:{},workspaceRegistry:{list:()=>[workspace]},sessionController:{create:async row=>{created.push(row);return {sessionId:row.sessionId,agentPreset:row.agentPreset}},projections:async()=>({values:{agentPreset:preset}}),inspect:async()=>({meta:{cwd}})},sessionPersistence:{flush:async()=>{}},connection:{requestRejection:()=>undefined},reflect:{provide:(_name,value)=>{ctx.bindings=value;return()=>{}}}}
 const owner=await installRoles(ctx)
 const read=async()=>{const req=Readable.from([JSON.stringify({action:'read',key})]);req.method='POST';req.headers={'content-type':'application/json'};let status,value;await owner.handle(req,{writeHead:code=>status=code,end:body=>value=JSON.parse(body),setHeader(){}});return {status,value}}
 try{ctx.bindings.registerRole({key,presetId:preset,creation:{cwd}});const first=await ctx.bindings.ensure(key);assert.ok(members.has(first.sessionId),'native blank composer needs native workspace membership before ready');assert.equal(created.length,1)
 members.clear();const response=await read();assert.equal(response.status,200);assert.equal(response.value.binding.sessionId,first.sessionId);assert.ok(members.has(first.sessionId),'reopening repairs old missing membership without replacing Session');assert.equal(created.length,1)
 ctx.workspaceRegistry.list=()=>[];members.clear();const missing=await read();assert.equal(missing.status,409);assert.equal(missing.value.binding.sessionId,first.sessionId);assert.match(missing.value.error,/workspace/i);assert.equal(created.length,1)
 }finally{await owner.dispose()}
})
