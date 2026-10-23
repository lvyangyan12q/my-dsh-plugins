import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
// Public build command seam: invoking the documented build script from another
// directory must replace the package artifacts, never create caller/lib.
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..', '01_content');
const caller=mkdtempSync(join(tmpdir(), 'worktable-build-location-'));
for(const name of ['index.js','client.js'])rmSync(join(root,'lib',name),{force:true});
const run=spawnSync(process.execPath,[join(root,'build.mjs')],{cwd:caller,encoding:'utf8',timeout:120000});
try {
  assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  assert.equal(existsSync(join(caller,'lib')),false,'build must not emit into caller directory');
  for(const name of ['index.js','client.js'])assert.equal(existsSync(join(root,'lib',name)),true,'package artifact must be regenerated: '+name);
  console.log('PASS: build writes package artifacts from an unrelated working directory');
} finally {
  if(!caller.startsWith(join(tmpdir(),'worktable-build-location-')))throw Error('Unexpected cleanup target');
  rmSync(caller,{recursive:true,force:true});
}
