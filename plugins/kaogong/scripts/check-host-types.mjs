import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),native=process.env.DSH_SOURCE??process.env.KAOGONG_TEST_RUNTIME
assert(native,'Set DSH_SOURCE to a built, unpatched Harness rc.3 checkout')
const base=ts.readConfigFile(resolve(native,'tsconfig.base.json'),ts.sys.readFile)
if(base.error)throw Error(ts.flattenDiagnosticMessageText(base.error.messageText,'\n'))
const paths={}
for(const [name,targets]of Object.entries(base.config.compilerOptions.paths)){
 const folder=resolve(native,targets[0]).replace(/[/\\]src$/,'')
 const manifest=resolve(folder,'package.json')
 if(!existsSync(manifest))continue
 const pkg=JSON.parse(readFileSync(manifest,'utf8'))
 for(const [key,value] of Object.entries(pkg.exports??{'.':{types:pkg.types}})){
  if(typeof value?.types!=='string')continue
  const file=resolve(folder,value.types)
  assert(existsSync(file),`Build public declarations first: ${file}`)
  paths[name+(key==='.'?'':key.slice(1))]=[file]
 }
}
paths['dsh-worktable/sdk']=[resolve(root,'../worktable/01_content/src/sdk.d.ts')]
const emit=process.argv.includes('--emit')
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,strict:true,allowImportingTsExtensions:true,noEmit:!emit,declaration:emit,emitDeclarationOnly:emit,types:['node'],esModuleInterop:true,paths,rootDir:resolve(root,'src'),outDir:resolve(root,'lib/types')}
const program=ts.createProgram([resolve(root,'src/index.ts')],options)
const diagnostics=ts.getPreEmitDiagnostics(program)
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:name=>name,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1}
else if(emit){const result=program.emit();assert(!result.emitSkipped,'Declaration emit was skipped')}
else console.log('Kaogong Host: actual native public declarations passed')
