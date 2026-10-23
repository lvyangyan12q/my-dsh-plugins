import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {MigrationDirectory} from '../01_content/src/framework/migrations.mjs'
import {describeProtocol} from '../01_content/src/sdk.mjs'
test('the independent built owner application performs a genuine synthetic checkpoint failure and verified recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-example-'));let apps,migrations,plugin;
 try{
  const packages={};for(const version of ['1','2']){const out=join(dir,'v'+version);execFileSync(process.execPath,[fileURLToPath(new URL('./fixtures/migration-owner/build.mjs',import.meta.url)),version,out]);packages[version]=await import(pathToFileURL(join(out,'lib/index.js')));const source=await readFile(join(out,'lib/client.js'),'utf8'),require=createRequire(new URL('../01_content/package.json',import.meta.url));let registration;new Function('window',source)({__ModuleLoader__:{load(value){assert.equal(registration,undefined,'exactly one module registration');registration=value}}});assert.equal(registration?.id,'@deepseek-ai/dsh-worktable-migration-example');const client=registration.factory(name=>{assert.equal(name,'react');return require(name)});assert.equal(typeof client.apply,'function');assert.deepEqual(client.inject,[]);let registered=false;client.apply({inject(names,callback){assert.deepEqual(names,['worktableApplicationViews']);callback({effect(factory){return factory()},worktableApplicationViews:{describe:describeProtocol,register(id,views){assert.equal(id,'migration-example');assert.equal(views.page().type,'p');registered=true;return()=>{}}}})}});assert.equal(registered,true);const manifest=JSON.parse(await readFile(join(out,'package.json'),'utf8'));assert.equal(manifest.version,version+'.0.1');assert.equal(registration.id,manifest.name)}
  apps=new ApplicationDirectory(join(dir,'apps.json'));migrations=new MigrationDirectory(join(dir,'migrations.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));
  const boot=async version=>{let iterator;const ctx={profileContext:{dir},worktableApplications:apps,worktableMigrations:migrations,worktableProtocol:{describe:describeProtocol},inject(_names,callback){callback(this)},effect(factory){iterator=factory()}};packages[version].apply(ctx);const step=await iterator.next();return async()=>{await step.value();await iterator.return()}};
  plugin=await boot('1');const instance=await apps.createInstance('migration-example',null),view=await apps.createView(instance.id),initial=await migrations.get(view.id);await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:initial.inspection.dataVersion,dataRevision:initial.inspection.revision,confirmed:true});await plugin();plugin=await boot('2');
  await assert.rejects(apps.createInstance('migration-example',null),{code:'migration-required'});const plan=await migrations.prepare({viewId:view.id});await assert.rejects(migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true,irreversibleConfirmed:true}),{code:'migration-recovery-required'});const failed=await migrations.get(view.id);assert.equal(failed.status,'recovery-required');await migrations.recover({id:failed.plans[0].id,revision:failed.plans[0].revision,dataRevision:failed.inspection.revision,confirmed:true,irreversibleConfirmed:true});assert.equal((await migrations.get(view.id)).status,'migration-required');const retry=await migrations.prepare({viewId:view.id});await migrations.confirm({id:retry.id,revision:retry.revision,confirmed:true,irreversibleConfirmed:true});assert.equal((await migrations.get(view.id)).status,'ready');
  const row=JSON.parse(await readFile(join(dir,'worktable-migration-example-synthetic','synthetic.json')));assert.equal(row.text,'Synthetic migration example only');assert.equal(row.dataVersion,'2');
 }finally{await plugin?.();await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})
