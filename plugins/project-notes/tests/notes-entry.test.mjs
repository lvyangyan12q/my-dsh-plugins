import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Config,notesRole,apply,application} from '../src/index.ts'
import {apply as clientApply} from '../src/client.tsx'
test('default installation selects no public capability and unsupported settings fail before registration',()=>{
 const config=new Config({});assert.equal(config.managedAgentId,'');assert.equal(config.managedSkillId,'');assert.equal(notesRole(config),undefined)
 let mutations=0;assert.throws(()=>apply({inject(){mutations++}}, {...config,settingsVersion:2}),/版本/);assert.equal(mutations,0)
 const role=notesRole({...config,managedAgentId:'operator-chosen-agent',managedSkillId:'operator-chosen-skill',roleWorkspace:process.cwd()});
 assert.deepEqual(role.agent,{kind:'agent',source:'managed',id:'operator-chosen-agent'});assert.deepEqual(role.skills,[{kind:'skill',source:'managed',id:'operator-chosen-skill'},{kind:'skill',source:'application',ownerAppId:'project-notes',id:'project-notes-format'}]);
 assert.equal(application.views[0].id,'page');assert.throws(()=>notesRole({...config,managedAgentId:'operator-chosen-agent',managedSkillId:'operator-chosen-skill',roleWorkspace:'relative-folder'}),/绝对路径/)
})
test('an older client view service without protocol discovery reports compatibility instead of pretending registration succeeded',()=>{
 let registered=0;const service={register(){registered++;return()=>{}}};
 assert.throws(()=>clientApply({inject(_keys,callback){callback({worktableApplicationViews:service,effect:fn=>fn()})}}),/协议/);assert.equal(registered,0)
})
