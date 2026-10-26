import assert from 'node:assert/strict'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {nativeDeclarationPaths} from './native-declarations.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),native=process.env.DSH_SOURCE??process.env.KAOGONG_TEST_RUNTIME
assert(native,'Set DSH_SOURCE to a built unpatched official rc.3 checkout')
const emit=process.argv.includes('--emit'),paths=nativeDeclarationPaths(native)
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,strict:true,allowImportingTsExtensions:true,noEmit:!emit,declaration:emit,emitDeclarationOnly:emit,types:['node'],esModuleInterop:true,paths,rootDir:resolve(root,'src'),outDir:resolve(root,'lib/types')}
const program=ts.createProgram([resolve(root,'src/index.ts')],options),diagnostics=ts.getPreEmitDiagnostics(program)
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:name=>name,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1}
else if(emit){const result=program.emit();assert(!result.emitSkipped,'Host declaration emit skipped')}
else console.log('Kaogong Host: official public declarations passed')
