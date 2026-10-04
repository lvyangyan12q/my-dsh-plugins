import {packContentHtml} from './content-assets.ts'
import {realpath,stat,readFile,readdir} from 'node:fs/promises'
import {resolve,relative,isAbsolute,extname} from 'node:path'
import {relativeContentPath} from './content-catalog.ts'
/** Only read descendants of a Host-owned workspace, including after symlink resolution. */
export async function contentPath(root:string,path:string):Promise<string>{
 if(!relativeContentPath(path))throw new Error('Workspace-relative path required')
 const base=await realpath(root),target=await realpath(resolve(base,path)),rel=relative(base,target)
 if(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel))throw new Error('Path outside workspace')
 return target
}
export async function readContentFile(root:string,path:string){
 const target=await contentPath(root,path),info=await stat(target)
 if(!info.isFile()||info.size>2*1024*1024)throw new Error('File preview is limited to 2 MB')
 const ext=extname(target).toLowerCase(),bytes=await readFile(target)
 if(bytes.length>2*1024*1024)throw new Error('File preview is limited to 2 MB')
 if(['.png','.jpg','.jpeg','.gif','.webp'].includes(ext))return {kind:'image',content:'data:image/'+(ext==='.jpg'||ext==='.jpeg'?'jpeg':ext.slice(1))+';base64,'+bytes.toString('base64')}
 if(!['.html','.htm','.md','.txt','.json','.csv','.ts','.tsx','.js','.css','.yml','.yaml','.log'].includes(ext))throw new Error('This file type cannot be previewed')
 const html=ext==='.html'||ext==='.htm'
 return {kind:html?'html':'text',content:html?await packContentHtml(root,target,bytes.toString('utf8')):bytes.toString('utf8')}
}
export async function listContentDirectory(root:string,path:string){
 const target=await contentPath(root,path),rows=await readdir(target,{withFileTypes:true})
 const entries=rows.filter(row=>!row.isSymbolicLink()).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)).slice(0,500).map(row=>({name:row.name,directory:row.isDirectory(),path:[path,row.name].filter(Boolean).join('/')}))
 return {entries,truncated:rows.length>500}
}
