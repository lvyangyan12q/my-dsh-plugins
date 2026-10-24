import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {installPublicEnvironment} from '../project-notes/public-producer.mjs'
import {reserveConsumerRelease} from '../project-notes/release-assets.mjs'
const here=dirname(fileURLToPath(import.meta.url)),pkg=JSON.parse(readFileSync(join(here,'package.json'),'utf8')),dist=join(here,'dist','v'+pkg.version),reservation=reserveConsumerRelease(dist,'deepseek-ai-dsh-reading-statistics')
process.on('exit',()=>reservation.releaseUnused())
const source=process.env.DSH_SOURCE,worktable=process.env.WORKTABLE_PACKAGE,npm=process.env.npm_execpath
assert.ok(source&&worktable&&npm,'Use npm run pack with DSH_SOURCE, archived WORKTABLE_PACKAGE (READING_LEGACY_ROOT is only for historical artifact regression)')
function run(args,cwd=here){const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',env:process.env});if(r.error)throw r.error;assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout}
run([join(here,'check-types.mjs')]);run([npm,'run','build'])
const {runSourceTests}=await import('./release-test-runner.mjs');const require=createRequire(join(here,'package.json')),testRun=runSourceTests({cwd:here,tsx:require.resolve('tsx'),files:readdirSync(join(here,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>join(here,'tests',f))});if(testRun.error)throw testRun.error;assert.equal(testRun.status,0,testRun.stdout+'\n'+testRun.stderr);const testOutput=testRun.stdout;process.stdout.write(testOutput)
const work=mkdtempSync(join(tmpdir(),'reading-release-')),pack=JSON.parse(run([npm,'pack','--ignore-scripts','--json','--pack-destination',work]))[0],archive=join(work,pack.filename),expected=pack.files.map(f=>f.path)
assert.equal(expected.length,6);for(const f of ['README.md','cordis.patch.yml','lib/client.js','lib/index.js','package.json'])assert.ok(expected.includes(f));assert.equal(expected.filter(f=>/^lib\/reading-host-[A-Za-z0-9_-]+\.mjs$/.test(f)).length,1)
const consumer=join(work,'consumer'),environment=installPublicEnvironment({folder:consumer,source,worktable,archive,npm})
const installed=dirname(createRequire(join(consumer,'package.json')).resolve(pkg.name+'/package.json')),cryptoHash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
for(const f of expected)assert.equal(cryptoHash(join(installed,f)),cryptoHash(join(here,f)))
run(['--input-type=module','-e',"import{apply,name}from'@deepseek-ai/dsh-reading-statistics';if(typeof apply!=='function'||name!=='reading-statistics')throw Error('Host import failed')"],consumer)
reservation.publish(archive,pkg.version)
const fixed=join(dist,'deepseek-ai-dsh-reading-statistics.tgz')
// Publish the same verified archive twice using package-specific stable and versioned names.
const receipt={version:pkg.version,archiveSha256:cryptoHash(fixed),files:expected,installedFiles:expected.length,installedImport:true,environment,actualHostUi:'pending root official installation; no profile or model action here'}
mkdirSync(join(here,'.checks'),{recursive:true});writeFileSync(join(here,'.checks/release-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2))
