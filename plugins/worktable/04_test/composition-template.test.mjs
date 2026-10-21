import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as sdk from '../01_content/src/sdk.mjs'
test('copying a template retains only structure and display mapping, never source permissions or paths',()=>{
 const template=sdk.copyCompositionTemplate({title:'My board',version:'5.0.0',layout:'grid',sessionId:'private-session',pages:[{id:'home',title:'Home',modules:[{id:'records',type:'list',connectionId:'secret-source',roleId:'teacher',config:{mapping:{id:'id',title:'title'},path:'D:/private',url:'https://private/?token=secret',html:'private',instanceId:'old-instance'}}]}],roles:[{id:'teacher'}],connections:[{id:'secret-source',viewId:'old-view'}]})
 assert.equal(template.version,'1.0.0');assert.deepEqual(template.connections,[]);assert.deepEqual(template.roles,[])
 assert.deepEqual(template.pages[0].modules[0],{id:'records',type:'list',config:{mapping:{id:'id',title:'title'}}})
 assert.equal(JSON.stringify(template).includes('private'),false)
 assert.ok(sdk.requireProtocol(sdk.describeProtocol(),['composition-state-v1']).features.includes('composition-state-v1'))
})
