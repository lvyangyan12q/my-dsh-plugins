import {spawnSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,symlinkSync,readdirSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url)
const source=process.env.DSH_SOURCE,worktable=process.env.WORKTABLE_PACKAGE,npm=process.env.npm_execpath
assert.ok(source&&worktable&&npm,'Use npm run pack with DSH_SOURCE and exact WORKTABLE_PACKAGE')
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:here,encoding:'utf8',...options});if(result.error)throw result.error;if(result.status!==0)throw Error([command,...args].join(' ')+'\n'+result.stdout+'\n'+result.stderr);return result.stdout}
const tests=readdirSync(join(here,'tests')).filter(file=>file.endsWith('.test.mjs')).map(file=>join(here,'tests',file))
const testOutput=run(process.execPath,['--import','tsx','--test',...tests]);process.stdout.write(testOutput)
run(process.execPath,[join(here,'check-types.mjs')]);run(process.execPath,[join(here,'build.mjs')])
const work=mkdtempSync(join(tmpdir(),'project-notes-release-')),pack=JSON.parse(run(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',work]))[0],archive=join(work,pack.filename)
const expected=['README.md','cordis.patch.yml','lib/client.js','lib/index.js','package.json'];assert.deepEqual(pack.files.map(file=>file.path).sort(),[...expected].sort())
const consumer=join(work,'consumer');mkdirSync(consumer);writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'notes-independent-consumer',version:'0.0.0',private:true,type:'module'}))
run(process.execPath,[npm,'install',resolve(worktable),archive,'--offline','--ignore-scripts','--omit=optional','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:consumer})
// The consumer is outside the monorepo. Supply actual official public host peer packages,
// not legacy aliases or profile data. Production resolution is verified separately by root.
const peers={'@deepseek-ai/cordis':join(source,'vendor/cordis'),'@deepseek-ai/schemastery':join(source,'vendor/schemastery'),'@deepseek-ai/dsh-storage-domain':join(source,'packages/storage/storage-domain'),'@types/react':dirname(require.resolve('@types/react/package.json')),'@types/node':dirname(require.resolve('@types/node/package.json'))}
for(const [name,target] of Object.entries(peers)){const dest=join(consumer,'node_modules',name);if(!existsSync(dest)){mkdirSync(dirname(dest),{recursive:true});symlinkSync(resolve(target),dest,'junction')}}
const installed=join(consumer,'node_modules/@deepseek-ai/dsh-project-notes')
for(const file of expected)assert.deepEqual(readFileSync(join(installed,file)),readFileSync(join(here,file)),file+' installed bytes')
writeFileSync(join(consumer,'assert.mjs'),`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {createRequire} from 'node:module';
import {requireProtocol,describeProtocol} from 'dsh-worktable/sdk';
import {apply,Config,name} from '@deepseek-ai/dsh-project-notes';
assert.equal(name,'project-notes');assert.equal(typeof apply,'function');assert.equal(new Config({}).managedAgentId,'');requireProtocol(describeProtocol(),['prepared-task-v1']);
const toolRequire=createRequire(${JSON.stringify(join(here,'package.json'))});let factory,registered,removed=0;
runInNewContext(readFileSync(${JSON.stringify(join(installed,'lib/client.js'))},'utf8'),{window:{__ModuleLoader__:{load(value){assert.equal(value.id,'@deepseek-ai/dsh-project-notes');factory=value.factory}}},console});
const client=factory(id=>{if(!['react','react/jsx-runtime'].includes(id))throw Error('Unexpected runtime dependency '+id);return toolRequire(id)});
const cleanups=[];client.apply({inject(keys,fn){assert.deepEqual(Array.from(keys),['worktableApplicationViews']);fn({worktableApplicationViews:{describe:describeProtocol,register(id,views){assert.equal(id,'project-notes');registered=views;return()=>{removed++}}},effect(fn){cleanups.push(fn())}})}});
assert.equal(typeof registered.page,'function');assert.equal(typeof registered.summary,'function');for(const cleanup of cleanups)await cleanup();assert.equal(removed,1);
`)
run(process.execPath,[join(consumer,'assert.mjs')],{cwd:consumer})
copyFileSync(join(here,'tests/sdk-shapes.ts'),join(consumer,'consume.ts'))
run(process.execPath,[require.resolve('typescript/bin/tsc'),join(consumer,'consume.ts'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2024,DOM,ESNext.Disposable'],{cwd:consumer})
const pkg=JSON.parse(readFileSync(join(here,'package.json'),'utf8')),dist=join(here,'dist','v'+pkg.version);mkdirSync(dist,{recursive:true})
const versioned=join(dist,pack.filename),fixed=join(dist,'deepseek-ai-dsh-project-notes.tgz');copyFileSync(archive,versioned);copyFileSync(archive,fixed)
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');assert.equal(hash(versioned),hash(fixed))
const receipt={status:'source-package-only-real-host-pending',testFiles:tests.length,testCases:Number(testOutput.match(/(?:ℹ|#)\s*tests\s+(\d+)/)?.[1])||null,files:expected,archiveSha256:hash(fixed),worktableSha256:hash(worktable),installedBytesMatched:5,installedImport:true,clientFactory:true,publicConsumerTypes:true,nativePeerSource:resolve(source),legacyAlias:false,consumer,formal3080Writes:0,remoteWrites:0}
mkdirSync(join(here,'.checks'),{recursive:true});writeFileSync(join(here,'.checks/release-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2))
