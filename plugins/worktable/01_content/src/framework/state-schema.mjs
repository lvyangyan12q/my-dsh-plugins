import {validateGenerated} from './generated-bindings.mjs'
import {validatePresentationStates} from './composition-state.mjs'
import {validateCompositions} from './composition-schema.mjs'
const expect=value=>{if(!value)throw Error('invalid state')}
const text=value=>typeof value==='string'&&value.length>0&&value.length<=4096
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(value)
const revision=value=>Number.isSafeInteger(value)&&value>=1
const unique=(rows,key)=>{expect(Array.isArray(rows));const ids=new Set();for(const row of rows){const value=key(row);expect(text(value)&&!ids.has(value));ids.add(value)}return ids}
export function applicationState(data){
 const policies=data.lifecycle??[];unique(policies,row=>row.appId);for(const row of policies)expect(id(row.appId)&&typeof row.enabled==='boolean'&&revision(row.revision));validateCompositions(data.compositions??[]);expect(data.schema===(data.presentationStates?.length?4:data.compositions?.length?3:policies.some(row=>!row.enabled)?2:1));
 unique(data.applications,row=>row.id);const instances=unique(data.instances,row=>row.id);unique(data.views,row=>row.id);
 validatePresentationStates(data.presentationStates??[],data);validateGenerated(data.generatedBindings??[],data);
 const reserved=data.deepApplicationIds??[];expect(Array.isArray(reserved)&&new Set(reserved).size===reserved.length&&reserved.every(id));
 for(const row of data.applications){expect(id(row.id)&&row.kind==='web'&&row.protocolVersion===1&&text(row.title)&&text(row.version)&&typeof row.url==='string');const url=new URL(row.url);expect(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!reserved.includes(row.id))}
 for(const row of data.compositions??[])expect(!reserved.includes(row.appId)&&!data.applications.some(app=>app.id===row.appId));
 for(const row of data.instances)expect(id(row.appId)&&(row.projectId===null||text(row.projectId))&&revision(row.revision)&&Number.isFinite(row.createdAt)&&Number.isFinite(row.lastOpenedAt));
 for(const row of data.views)expect(instances.has(row.instanceId)&&id(row.type));
}
export function resourceState(data){
 unique(data.connections,row=>row.id);const active=new Set();
 for(const row of data.connections){expect(id(row.ownerAppId)&&id(row.consumerAppId)&&text(row.ownerInstanceId)&&text(row.consumerInstanceId)&&row.ownerInstanceId!==row.consumerInstanceId&&id(row.resourceId)&&revision(row.revision)&&['active','revoked'].includes(row.status)&&Array.isArray(row.allowedActions)&&row.allowedActions.includes('read')&&row.allowedActions.every(id));if(row.status==='active'){const key=JSON.stringify([row.consumerInstanceId,row.resourceId]);expect(!active.has(key));active.add(key)}}
}
export function roleState(data){
 unique(data.bindings,row=>row.key);const sessions=new Set();
 for(const row of data.bindings){expect(text(row.instanceId)&&id(row.appId)&&id(row.roleId)&&row.key===JSON.stringify([row.instanceId,row.roleId])&&text(row.sessionId)&&revision(row.revision)&&['intent','ready'].includes(row.phase)&&(row.creationAttempt===undefined||['not-started','started'].includes(row.creationAttempt))&&Array.isArray(row.previousSessionIds)&&row.previousSessionIds.every(text)&&row.creation&&text(row.creation.cwd)&&text(row.presetId)&&row.agent?.kind==='agent');for(const sessionId of [row.sessionId,...row.previousSessionIds]){expect(!sessions.has(sessionId));sessions.add(sessionId)}}
 const sources=new Set();
 for(const row of data.bindings){
  if(row.adoption!==undefined){const receipt=row.adoption,key=JSON.stringify([row.appId,receipt.sourceKey]);expect(data.schema===3&&text(receipt.sourceKey)&&text(receipt.sourceRevision)&&/^[a-f0-9]{64}$/.test(receipt.sourceFingerprint)&&/^[a-f0-9]{64}$/.test(receipt.fingerprint)&&revision(receipt.bindingRevision)&&receipt.bindingRevision<=row.revision&&!sources.has(key)&&typeof row.selectedPreset==='boolean');sources.add(key)}
  if(row.historicalSessions!==undefined){expect(data.schema===3&&Array.isArray(row.historicalSessions));unique(row.historicalSessions,item=>item.sessionId);for(const item of row.historicalSessions)expect(row.previousSessionIds.includes(item.sessionId)&&text(item.presetId)&&text(item.creation?.cwd))}
 }
 unique(data.capabilities,row=>JSON.stringify([row.kind,row.id]));for(const row of data.capabilities)expect(['agent','skill'].includes(row.kind)&&id(row.id)&&row.source==='managed'&&text(row.title)&&typeof row.content==='string'&&revision(row.revision)&&typeof row.enabled==='boolean'&&typeof row.userInvocable==='boolean'&&typeof row.modelInvocable==='boolean'&&Array.isArray(row.skillIds??[])&&(row.kind==='agent'?text(row.presetId):text(row.provider)));
 if(data.tasks!==undefined){unique(data.tasks,row=>row.id);for(const row of data.tasks){expect(text(row.instanceId)&&text(row.sessionId)&&revision(row.revision)&&text(row.source?.viewId)&&Array.isArray(row.contexts)&&['prepared','discarded','submitting','accepted','unknown','failed'].includes(row.status));if(row.preparation)expect(data.schema===2&&row.preparation.kind==='module-generation'&&text(row.preparation.id));if(['submitting','accepted','unknown','failed'].includes(row.status))expect(text(row.requestId));else expect(typeof row.text==='string'&&id(row.roleId)&&id(row.appId)&&revision(row.bindingRevision)&&revision(row.instanceRevision));for(const context of row.contexts)expect(text(context.id)&&typeof context.text==='string'&&text(context.title)&&typeof context.fingerprint==='string'&&id(context.reference?.resourceId)&&text(context.metadata?.ownerInstanceId))}}
}
