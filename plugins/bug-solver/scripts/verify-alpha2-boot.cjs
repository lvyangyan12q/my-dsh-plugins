// Isolated, keyless runtime admission check. Never starts a business task.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const [root, worktablePackage, bridgePackage, evidenceFile] = process.argv.slice(2);
if (!evidenceFile) throw Error('Usage: node verify-alpha2-boot.cjs <DSH source> <worktable.tgz> <bridge.tgz> <evidence.json>');
const home = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dsh-alpha2-verify-'));
const profile = path.join(home, 'profiles', 'web');
fs.mkdirSync(path.join(profile, 'node_modules'), {recursive:true});
for (const [name, archive] of [['dsh-worktable',worktablePackage], ['bug-solver-dispatch',bridgePackage]]) {
  const target = path.join(profile,'node_modules',name);
  fs.mkdirSync(target);
  execFileSync('tar',['-xf',path.resolve(archive),'-C',target,'--strip-components=1']);
}
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'isolated-compat-check',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-worktable','bug-solver-dispatch']}}}));
fs.writeFileSync(path.join(profile,'cordis.yml'),'[]\n');
fs.writeFileSync(path.join(profile,'cordis.patch.yml'),JSON.stringify([{id:'bug-solver-dispatch',config:{projectDir:home,dataDir:path.join(home,'runs'),allowedRoots:[home]}}]));
const proc = spawn(process.execPath,['--import','tsx/esm','apps/cli/src/bin.ts','web','--no-open','--port','0'],{cwd:root,env:{...process.env,DSH_HOME:home},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';
proc.stdout.on('data',b=>output+=b);proc.stderr.on('data',b=>output+=b);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  try {
    let url;
    for(let i=0;i<120;i++) {url=output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0];if(url)break;if(proc.exitCode!==null)break;await delay(500);}
    assert.ok(url,'DSH did not publish a launch URL: '+output.replace(/token=[^\s]+/g,'token=<REDACTED>'));
    assert.doesNotMatch(output,/skipping profile bundle|failed to register|ERR_MODULE_NOT_FOUND/);
    const login=await fetch(url,{redirect:'manual'});
    assert.equal(login.status,303);
    const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const base=new URL(url).origin;
    const health=await fetch(base+'/api/worktable/health',{headers:{cookie}});
    const expectedVersion=JSON.parse(fs.readFileSync(path.join(profile,'node_modules','dsh-worktable','package.json'),'utf8')).version;
    assert.equal(health.status,200);const healthBody=await health.json();assert.equal(healthBody.version,expectedVersion);
    const runs=await fetch(base+'/api/bug-solver/runs',{headers:{cookie}});
    assert.equal(runs.status,200);const runBody=await runs.json();
    const denied=await fetch(base+'/api/bug-solver/runs');assert.equal(denied.status,401);
    const evidence={runtime:'0.2.2-alpha.2',worktable:healthBody,bridge:'0.1.1',checks:{isolatedBoot:true,versionExemptions:false,authenticatedRuns:true,unauthenticatedDenied:true},runs:runBody,limits:'No model prompts, business fixes, SSH or production data used.'};
    fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
  } finally {
    if (proc.exitCode === null) {
      if (process.platform === 'win32') {
        try {execFileSync('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});} catch {proc.kill();}
      } else proc.kill();
    }
    proc.stdout.destroy();proc.stderr.destroy();proc.unref();
  }
})().catch(e=>{console.error(String(e).replace(/token=[^\s]+/g,'token=<REDACTED>'));process.exitCode=1;});
