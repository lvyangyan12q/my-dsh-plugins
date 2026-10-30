import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'

/** Public, already-built declaration exports of the explicit official checkout. */
export function nativeDeclarationPaths(native){
 const base=ts.readConfigFile(resolve(native,'tsconfig.base.json'),ts.sys.readFile)
 if(base.error)throw Error(ts.flattenDiagnosticMessageText(base.error.messageText,'\n'))
 const paths={}
 for(const targets of Object.values(base.config.compilerOptions.paths)){
  const directory=resolve(native,targets[0]).replace(/[/\\]src(?:[/\\].*)?$/,'')
  const manifest=resolve(directory,'package.json');if(!existsSync(manifest))continue
  const pkg=JSON.parse(readFileSync(manifest,'utf8'))
  for(const [key,value]of Object.entries(pkg.exports??{'.':{types:pkg.types}})){
   if(typeof value?.types!=='string')continue
   const file=resolve(directory,value.types);assert(existsSync(file),'Build official public declarations first: '+file)
   paths[pkg.name+(key==='.'?'':key.slice(1))]=[file]
  }
 }
 return paths
}
