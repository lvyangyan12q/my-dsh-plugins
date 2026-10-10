import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
/** Reconstruct reviewed compatibility solely from official base objects and published patches. */
export async function materializeReviewedNativeCombination(fixture,group,gitSource) {
 const dir=resolve(root,'compat',group),manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'))
 for(const row of manifest.files){if(row.before===null)continue;const text=execFileSync('git',['-C',gitSource,'show',manifest.baseCommit+':'+row.path],{encoding:'utf8'});const hash=createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');if(hash!==row.before)throw Error('Official base fixture mismatch');await mkdir(dirname(resolve(fixture,row.path)),{recursive:true});await writeFile(resolve(fixture,row.path),text)}
 execFileSync('git',['-C',fixture,'init'],{stdio:'ignore'})
 for(const name of [group+'.patch','reviewed-normal-hooks.patch']){const input=(await readFile(resolve(dir,name),'utf8')).replaceAll('\r\n','\n');execFileSync('git',['-C',fixture,'apply','--unidiff-zero','--check','-'],{input,stdio:['pipe','ignore','inherit']});execFileSync('git',['-C',fixture,'apply','--unidiff-zero','-'],{input,stdio:['pipe','ignore','inherit']})}
}
