import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {installPublicEnvironment,command} from '../project-notes/public-producer.mjs'
const here=dirname(fileURLToPath(import.meta.url)),folder=mkdtempSync(join(tmpdir(),'reading-public-producer-'))
const receipt=installPublicEnvironment({folder,source:process.env.DSH_SOURCE,worktable:process.env.WORKTABLE_PACKAGE})
cpSync(join(here,'src'),join(folder,'src'),{recursive:true})
const config=JSON.parse(readFileSync(join(here,'tsconfig.json'),'utf8'));config.compilerOptions.skipLibCheck=false
const specRoot=join(folder,'node_modules/@standard-schema/spec');config.compilerOptions.paths={'@standard-schema/spec':[join(specRoot,JSON.parse(readFileSync(join(specRoot,'package.json'),'utf8')).types)]}
writeFileSync(join(folder,'tsconfig.json'),JSON.stringify(config))
const require=createRequire(join(folder,'package.json'));command(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit'],folder)
const result={...receipt,status:'reading-public-producer-types-passed',skipLibCheck:false,sourceTypes:true,legacyRuntimeInstalled:false,legacyDeclarationsRequired:false}
if(process.env.READING_TYPES_RECEIPT){mkdirSync(dirname(process.env.READING_TYPES_RECEIPT),{recursive:true});writeFileSync(process.env.READING_TYPES_RECEIPT,JSON.stringify(result,null,2))}
console.log(JSON.stringify(result,null,2))
