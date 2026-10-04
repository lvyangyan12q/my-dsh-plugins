import assert from 'node:assert/strict'
import {test} from 'node:test'
import {capturePageTemplate,instantiatePageTemplate} from '../src/page-template.ts'
test('page template keeps presentation structure while removing private paths, tasks, data and role identities',()=>{
 const page={id:'private-page',label:'Dashboard',layout:'split',splitPercent:65,modules:[{id:'private-chart',title:'Summary',type:'chart',connectionId:'private-data',roleId:'private-role',config:{valueField:'count',taskPrompt:'private context',records:'private records'}},{id:'private-custom',title:'Custom',type:'custom',roleId:'private-builder',config:{mode:'file',path:'private/secret.html',requirement:'private requirement'}},{id:'private-web',title:'Website',type:'website',config:{url:'http://localhost/private'}}]}
 const template=capturePageTemplate('template-one','Layout',page)
 const text=JSON.stringify(template);for(const secret of ['private-page','private-chart','private-data','private-role','private-builder','secret.html','private context','private records','private requirement','localhost/private'])assert.ok(!text.includes(secret),secret)
 assert.equal(template.page.splitPercent,65);assert.equal(template.page.modules[0].config.valueField,'count');assert.equal(template.page.modules[0].config.requiresConnection,true);assert.equal(template.page.modules[0].config.requiresRole,true)
 const first=instantiatePageTemplate(template),second=instantiatePageTemplate(template);assert.notEqual(first.id,second.id);assert.notEqual(first.modules[0].id,second.modules[0].id);assert.equal(first.modules[0].roleId,undefined);assert.equal(first.modules[0].connectionId,undefined);first.modules[0].config.valueField='changed';assert.equal(template.page.modules[0].config.valueField,'count');assert.equal(second.modules[0].config.valueField,'count')
})
