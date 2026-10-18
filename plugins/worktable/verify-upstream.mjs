import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Provenance audit, not installed-host acceptance. All imported source bytes
// must match the frozen dirty inventory, except the declared build-path fix.
const root = path.dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(fs.readFileSync(path.join(root,'UPSTREAM-SNAPSHOT.json'),'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(snapshot.files)), snapshot.inventorySha256, 'inventory digest');
let checked = 0;
for (const file of snapshot.files) {
  const selected = (file.path.startsWith('01_content/') && !file.path.startsWith('01_content/lib/')) || /^04_test\/[^/]+\.test\.mjs$/.test(file.path) || ['LICENSE','AGENTS.md'].includes(file.path);
  if (!selected) continue;
  assert.ok(!file.path.split('/').includes('..') && !path.isAbsolute(file.path), 'relative inventory path');
  let bytes = fs.readFileSync(path.join(root,file.path));
  if (file.path === '01_content/build.mjs') {
    const text = bytes.toString('utf8');
    for (const name of ['index.js','client.js']) assert.equal(text.split("outfile: join(here, 'lib/"+name+"'),").length,2,'one package-relative output per bundle');
    bytes = Buffer.from(text.replace("outfile: join(here, 'lib/index.js'),", "outfile: 'lib/index.js',").replace("outfile: join(here, 'lib/client.js'),", "outfile: 'lib/client.js',"));
  }
  assert.equal(bytes.length,file.bytes,file.path+' source length');
  assert.equal(hash(bytes),file.sha256,file.path+' source hash');
  checked++;
}
console.log('PASS: '+checked+' imported original files match the frozen source inventory; only the two declared build output expressions differ');
