import {createRequire} from 'node:module'
import {mkdir,writeFile,copyFile} from 'node:fs/promises'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(new URL('../../../01_content/package.json',import.meta.url)),{build}=require('esbuild');
const [version,destination]=process.argv.slice(2);if(!['1','2'].includes(version)||!destination)throw Error('Usage: node build.mjs 1|2 <new independent destination>');const out=resolve(destination);await mkdir(join(out,'lib'),{recursive:true});
await build({entryPoints:[join(here,'index.mjs')],bundle:true,platform:'node',format:'esm',outfile:join(out,'lib/index.js'),define:{FIXTURE_APPLICATION_VERSION:JSON.stringify(version)},alias:{'dsh-worktable/sdk':resolve(here,'../../../01_content/src/sdk.mjs')}});
await build({entryPoints:[join(here,'client.mjs')],bundle:true,platform:'browser',format:'cjs',outfile:join(out,'lib/client.js'),external:['react'],alias:{'dsh-worktable/sdk':resolve(here,'../../../01_content/src/sdk.mjs')}});
await writeFile(join(out,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-worktable-migration-example',version:version+'.0.0',type:'module',main:'lib/index.js',exports:{'.':'./lib/index.js','./client':'./lib/client.js','./package.json':'./package.json'},files:['lib','cordis.patch.yml'],dsh:{bundle:{patch:'./cordis.patch.yml'},client:{platform:'web',inject:[]}}},null,2));await copyFile(join(here,'cordis.patch.yml'),join(out,'cordis.patch.yml'));
