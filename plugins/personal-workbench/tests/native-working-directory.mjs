import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
/** Activate actual native dependencies introduced by alpha; rc2 keeps its existing assembly. */
export async function installNativeWorkingDirectory(ctx,source,cwd){
 const entry=resolve(source,'packages/session/working-directory/lib/index.js')
 const load=path=>import(pathToFileURL(resolve(source,path,'lib/index.js')).href)
 if(!ctx.get('fs'))await ctx.plugin((await load('packages/fs/fs-local')).default,{cwd})
 if(!existsSync(entry))return
 if(!ctx.get('sessionProjections'))await ctx.plugin((await load('packages/session/session-projection')).default)
 await ctx.plugin((await import(pathToFileURL(entry).href)).default,{defaultDirectory:cwd})
}
