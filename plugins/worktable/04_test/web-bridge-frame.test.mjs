import {test} from 'node:test'
import assert from 'node:assert/strict'
import {renderBridgeFrame,bridgeEnvelope} from '../01_content/src/framework/web-bridge-frame.mjs'
const cap={id:'cap',revision:1,epoch:'epoch',origin:'http://localhost:18192',url:'http://localhost:18192/app',viewId:'view',moduleId:'site',instanceId:'instance',methods:['read-resource']}
test('browser relay checks exact origin, WindowProxy, capability, instance and epoch before forwarding',()=>{
 const source={},other={},message={type:'worktable:request',protocol:1,capabilityId:'cap',revision:1,epoch:'epoch',viewId:'view',moduleId:'site',instanceId:'instance',requestId:'read-1',method:'read-resource',params:{}}
 assert.equal(bridgeEnvelope({origin:cap.origin,source,data:message},source,cap.origin,cap),true)
 for(const event of [{origin:'null',source,data:message},{origin:cap.origin,source:other,data:message},{origin:'http://127.0.0.1:18193',source,data:message},{origin:cap.origin,source,data:{...message,epoch:'old'}},{origin:cap.origin,source,data:{...message,instanceId:'other'}},{origin:cap.origin,source,data:{...message,sessionId:'stolen'}},{origin:cap.origin,source,data:{...message,params:{sessionId:'stolen'}}}])assert.equal(bridgeEnvelope(event,source,cap.origin,cap),false)
})
test('trusted wrapper restricts children with response CSP and embeds no untrusted markup',()=>{
 const result=renderBridgeFrame(cap,'http://127.0.0.1:18191');assert.match(result.headers['content-security-policy'],/frame-src http:\/\/localhost:18192;/);assert.match(result.headers['content-security-policy'],/default-src 'none'/);assert.match(result.body,/sandbox="allow-scripts allow-same-origin"/);assert.equal(result.headers['referrer-policy'],'no-referrer')
 assert.throws(()=>renderBridgeFrame({...cap,origin:'http://127.0.0.1:18191',url:'http://127.0.0.1:18191/probe'},'http://127.0.0.1:18191'))
})
