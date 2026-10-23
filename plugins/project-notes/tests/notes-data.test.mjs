import {test} from 'node:test'
import assert from 'node:assert/strict'
import {requestNotes} from '../src/notes-data-client.ts'
test('data adapter refuses unsupported business schema versions and foreign shapes instead of treating them as notes',async()=>{
 const previous=globalThis.fetch;
 try{
  let value={schemaVersion:2,instanceId:'A',notes:[],revision:'a'};globalThis.fetch=async()=>({ok:true,json:async()=>({value,connection:null})});
  await assert.rejects(requestNotes('view-A','A','read'),/schema/)
  value={schemaVersion:1,instanceId:'A',records:[],revision:'a'};await assert.rejects(requestNotes('view-A','A','read'),/schema/)
  value={schemaVersion:1,instanceId:'foreign',notes:[],revision:'a'};await assert.rejects(requestNotes('view-A','A','read'),/不匹配/)
 }finally{globalThis.fetch=previous}
})
