import assert from 'node:assert/strict'
import {test} from 'node:test'
import {apply} from '../src/client.tsx'
test('an older public view registry is refused with a compatibility message before any registration',()=>{
 let registrations=0
 const registry={register(){registrations++;return()=>{}}}
 const ctx={get:()=>registry,inject(names,install){if(names.includes('worktableApplicationViews'))install(ctx)},effect:install=>install()}
 assert.throws(()=>apply(ctx),/协议/)
 assert.equal(registrations,0)
})
