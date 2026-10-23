import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
/** Executes the same Node/tsx source-test boundary as the normal release entry. */
export function runSourceTests({cwd,files,tsx,env=process.env}){return spawnSync(process.execPath,['--import',pathToFileURL(tsx).href,'--test',...files],{cwd,encoding:'utf8',env})}
