import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'

// Evaluate the real tsdown output, not a substitute esbuild of the source.
test('built browser factory boots without an imaginary SDK ModuleLoader factory',async()=>{
 const require=createRequire(import.meta.url),code=await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),registrations=[],dependencies=[];
 runInNewContext(code,{window:{__ModuleLoader__:{load:entry=>registrations.push(entry)}},console,AbortController,structuredClone});
 assert.equal(registrations.length,1);assert.equal(registrations[0].id,'@deepseek-ai/dsh-reading-statistics');
 const client=registrations[0].factory(name=>{dependencies.push(name);assert.ok(['react','react/jsx-runtime'].includes(name),'Unexpected browser factory dependency: '+name);return require(name)});
 assert.equal(typeof client.apply,'function');
 const views=new Map(),disposers=[],service={register(id,value){views.set(id,value);return()=>views.delete(id)}};
 const ctx={get:name=>name==='worktableApplicationViews'?service:undefined,inject(names,install){if(names.every(name=>ctx.get(name)))install(ctx)},effect(install){const dispose=install();if(typeof dispose==='function')disposers.push(dispose)}};
 client.apply(ctx);assert.deepEqual(Object.keys(views.get('reading-statistics')),['page','stats','list']);
 assert.equal(dependencies.includes('@deepseek-ai/dsh-personal-workbench/client'),false);
 assert.ok(dependencies.includes('react'));assert.ok(dependencies.includes('react/jsx-runtime'));
 for(const dispose of disposers.reverse())dispose();assert.equal(views.size,0);
})
