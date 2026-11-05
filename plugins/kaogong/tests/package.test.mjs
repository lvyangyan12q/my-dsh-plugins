import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {npmCli} from '../scripts/npm-cli.mjs'

test('independent alpha.3 package ships native study entries and no Worktable or private material dependency',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
 assert.equal(pkg.version,'0.4.0-alpha.3.2');assert.equal(pkg.engines.dsh,'0.2.2-alpha.3')
 assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'],'4.0.6-alpha.2');assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'],'3.18.6-alpha.2')
 for(const group of ['optionalDependencies','devDependencies','peerDependencies'])for(const [name,version]of Object.entries(pkg[group]??{}))if(name.startsWith('@deepseek-ai/dsh-'))assert.equal(version,'0.2.2-alpha.3',name)
 assert.equal(pkg.peerDependencies['dsh-worktable'],undefined);assert.equal(pkg.devDependencies['dsh-worktable'],undefined)
 assert.deepEqual(pkg.dsh.client.inject,['slots','layout','uiWorkspace','sidebarRight','sidebarRightTabs'])
 const filesUnder=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(row=>row.isDirectory()?filesUnder(join(dir,row.name)):[join(dir,row.name)])
 for(const file of filesUnder(join(root,'lib')).filter(file=>/\.(?:js|mjs|d\.ts|d\.mts)$/.test(file))){const text=readFileSync(file,'utf8');assert.doesNotMatch(text,/dsh-worktable|worktableApplicationViews|worktableApplications|worktableProtocol/,file)}
 const result=spawnSync(process.execPath,[npmCli(),'pack','--dry-run','--json','--ignore-scripts','--offline'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr)
 const [pack]=JSON.parse(result.stdout),files=pack.files.map(row=>row.path)
 for(const file of ['lib/client.js','lib/index.js','lib/types/index.d.ts','lib/types/client.d.ts','roles/personas/老师.md','roles/personas/班主任.md','roles/personas/辅导员.md','roles/skills/kaogong-teach/SKILL.md','cordis.patch.yml'])assert.ok(files.includes(file),file)
 assert.equal(files.some(file=>/^(materials|archive|storage|题目_images|src|scripts|tests|releases|\.scratch)\//.test(file)||/lib\/(?:typecheck|npm-cache)\//.test(file)||file.endsWith('.map')),false)
})
