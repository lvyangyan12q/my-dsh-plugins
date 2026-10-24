import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {npmCli} from '../../../scripts/release-tools.mjs'
test('rc.3 package declares public Worktable view and ships app-owned roles without the legacy runtime',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
 assert.equal(pkg.version,'0.2.0-rc.3.1');assert.equal(pkg.engines.dsh,'0.2.1-rc.3');assert.equal(pkg.peerDependencies['dsh-worktable'],'0.10.0-rc.3.2');assert.deepEqual(pkg.dsh.client.inject,['worktableApplicationViews']);assert.doesNotMatch(JSON.stringify(pkg),/personal-workbench/)
 const bundle=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');assert.doesNotMatch(bundle,/require\(["']@deepseek-ai\/dsh-personal-workbench/)
 const host=readFileSync(new URL('../lib/index.js',import.meta.url),'utf8');assert.doesNotMatch(host,/personalWorkbenchBindings|migrateMaterials|applyVerifiedMaterialImages|\.recover\(\)/)
 const result=spawnSync(process.execPath,[npmCli(),'pack','--dry-run','--json','--ignore-scripts','--offline','--cache=lib/npm-cache'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const [pack]=JSON.parse(result.stdout),files=pack.files.map(row=>row.path)
 for(const file of ['lib/client.js','lib/index.js','lib/types/index.d.ts','roles/personas/老师.md','roles/personas/班主任.md','roles/personas/辅导员.md','roles/skills/kaogong-teach/SKILL.md','cordis.patch.yml'])assert.ok(files.includes(file),file)
 assert.equal(files.some(file=>/^(src|scripts|tests|releases|\.scratch)\//.test(file)||/lib\/(?:typecheck|npm-cache)\//.test(file)||file.endsWith('.map')),false)
})
