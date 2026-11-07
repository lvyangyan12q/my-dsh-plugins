import {spawn,spawnSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const plugin=resolve(dirname(fileURLToPath(import.meta.url)),'..'),native=process.env.DSH_SOURCE
assert(native,'DSH_SOURCE required');const root=await mkdtemp(join(tmpdir(),'personal-learning-installed-')),home=join(root,'home'),cli=join(native,'apps/cli/lib/bin.js'),env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'}
for(const key of ['NODE_PATH','NODE_OPTIONS','OPENAI_API_KEY','DEEPSEEK_API_KEY','ANTHROPIC_API_KEY','DSH_TOKEN'])delete env[key]
const npm=process.env.npm_execpath?.endsWith('npm-cli.js')?process.env.npm_execpath:join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
function run(args,cwd){const r=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',windowsHide:true,timeout:180000});assert.equal(r.status,0,'Gate subprocess failed (output withheld to protect credentials)');return r.stdout}
run([join(plugin,'scripts/build.mjs')],plugin)
const [pack]=JSON.parse(run([npm,'pack','--ignore-scripts','--json','--pack-destination',root],plugin)),archive=join(root,pack.filename)
run([cli,'plugin','--profile','web','add',archive,'--offline','--ignore-scripts'],root)
let server
async function stop(){if(!server)return;server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);server=null}
async function start(){let output='';server=spawn(process.execPath,[cli,'web','--no-open','--host','127.0.0.1','--port','4383'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);let match;for(let i=0;i<120;i++){match=output.match(/dsh web: (http:\/\/[^\s]+)/);if(match)break;if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,500))}assert(match,'Host did not start');assert(!/personal-learning[^\n]*failed/.test(output),'Learning plugin activation failed');const login=await fetch(match[1],{redirect:'manual'}),cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie,'No bootstrap cookie');return {cookie,warnings:[...output.matchAll(/^([^\n]+): failed to import/gm)].map(m=>m[1])}}
async function request(cookie,body){const r=await fetch('http://127.0.0.1:4383/api/personal-learning',{method:body?'POST':'GET',headers:{cookie,origin:'http://127.0.0.1:4383',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200,'Learning API failed');return r.json()}
try{const first=await start();const created=await request(first.cookie,{action:'create',title:'安装验收',goal:'理解条件概率',priorKnowledge:'分数'});await stop();const second=await start();const restored=await request(second.cookie);assert(restored.instances.some(i=>i.id===created.id&&i.goal==='理解条件概率'),'Restart lost goal');const receipt={archive,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),officialInstall:true,hostActivation:true,persistenceRestart:true,warnings:second.warnings,modelInvocation:false,browserUI:false,root};await writeFile(join(root,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt))}finally{await stop()}
