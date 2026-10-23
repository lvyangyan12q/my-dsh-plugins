import assert from 'node:assert/strict'
import {test} from 'node:test'
import {installReading} from '../src/reading-host.ts'
test('reading drains and closes both public domain handles even when the business close fails; repeated cleanup does not close a new owner',async()=>{
 const closed=[];let opened=0;
 const storageDomain={open:async()=>{const number=++opened;return {table:()=>({get:()=>undefined}),close:async()=>{closed.push(number);if(number===1)throw Error('business close failed')}}}};
 const owner=await installReading({storageDomain,connection:{requestRejection:()=>undefined}});
 await assert.rejects(owner.dispose());assert.deepEqual(closed,[1,2]);await assert.rejects(owner.dispose());assert.deepEqual(closed,[1,2]);
})
