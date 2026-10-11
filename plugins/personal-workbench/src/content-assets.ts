import {readFile,stat,realpath} from 'node:fs/promises'
import {dirname,resolve,relative,isAbsolute,extname} from 'node:path'
import {parse,serialize} from 'parse5'
import type {DefaultTreeAdapterTypes as Html} from 'parse5'
import {build} from 'esbuild'
import type {Plugin} from 'esbuild'

const FILE_LIMIT=2*1024*1024, TOTAL_LIMIT=8*1024*1024, COUNT_LIMIT=64
const mime:Record<string,string>={'.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.avif':'image/avif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm'}
const dataUrl=(type:string,bytes:Uint8Array)=>'data:'+type+';base64,'+Buffer.from(bytes).toString('base64')
const external=(reference:string)=>reference.startsWith('//')||/^(?:https?:|data:|blob:|#)/i.test(reference)
/** Package only static references of one selected document. No source is executed or remotely fetched. */
export async function packContentHtml(root:string,entry:string,html:string):Promise<string>{
 const base=await realpath(root),cache=new Map<string,Promise<Buffer>>();let total=Buffer.byteLength(html),changed=false
 const bounded=async(path:string)=>{const file=await realpath(path),rel=relative(base,file);if(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel))throw Error('HTML asset outside workspace');return file}
 const read=async(path:string)=>{const file=await bounded(path),cached=cache.get(file);if(cached)return cached
  if(!mime[extname(file).toLowerCase()])throw Error('Unsupported HTML asset type')
  if(cache.size>=COUNT_LIMIT)throw Error('HTML asset count limit exceeded')
  const pending=(async()=>{const info=await stat(file);if(!info.isFile()||info.size>FILE_LIMIT)throw Error('HTML asset file size limit exceeded')
  const bytes=await readFile(file);total+=bytes.length;if(bytes.length>FILE_LIMIT||total>TOTAL_LIMIT)throw Error('HTML asset byte limit exceeded');return bytes})();cache.set(file,pending);return pending
 }
 const resolveReference=(reference:string,directory:string)=>{const value=reference.trim();if(!value||external(value))return undefined
  if(/^[a-z][a-z0-9+.-]*:/i.test(value)||value.includes('\\'))throw Error('Unsupported local HTML reference')
  const boundary=value.search(/[?#]/),path=boundary<0?value:value.slice(0,boundary),hash=value.indexOf('#'),suffix=hash<0?'':value.slice(hash),decoded=decodeURIComponent(path)
  if(decoded.includes('\0'))throw Error('Invalid HTML reference')
  return {path:resolve(decoded.startsWith('/')?base:directory,decoded.replace(/^\//,'')),suffix:suffix.startsWith('#')?suffix:''}
 }
 const plugin:Plugin={name:'workbench-owned-html-assets',setup(builder){
  builder.onResolve({filter:/.*/},async args=>{if(external(args.path))return {path:args.path,external:true}
   if(args.kind!=='entry-point'&&!args.path.startsWith('.')&&!args.path.startsWith('/')&&args.kind!=='url-token'&&args.kind!=='import-rule')throw Error('HTML modules must use workspace-relative imports')
   const target=args.kind==='entry-point'?{path:args.path,suffix:''}:resolveReference(args.path,args.resolveDir)
   if(!target)throw Error('Invalid HTML asset reference')
   return {path:await bounded(target.path),namespace:'workbench-assets',suffix:target.suffix}
  })
  builder.onLoad({filter:/.*/,namespace:'workbench-assets'},async args=>{const extension=extname(args.path).toLowerCase();return {contents:await read(args.path),loader:extension==='.css'?'css':extension==='.js'||extension==='.mjs'?'js':extension==='.json'?'json':'dataurl',resolveDir:dirname(args.path)}})
 }}
 const compile=async(path:string,kind:'css'|'js',contents?:string)=>{const result=await build({...(contents===undefined?{entryPoints:[path]}:{stdin:{contents,loader:kind,resolveDir:dirname(path),sourcefile:path}}),bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent',plugins:[plugin],charset:'utf8'});const bytes=result.outputFiles?.[0]?.contents;if(!bytes||bytes.length>TOTAL_LIMIT)throw Error('HTML compiled asset limit exceeded');return bytes}
 const asset=async(reference:string,directory:string,kind?:'css'|'js')=>{const target=resolveReference(reference,directory);if(!target)return reference
  const file=await bounded(target.path),bytes=kind?await compile(file,kind):await read(file);changed=true;return dataUrl(kind==='css'?'text/css':kind==='js'?'application/javascript':mime[extname(file).toLowerCase()],bytes)+target.suffix
 }
 const srcset=async(value:string)=>{const candidates:string[]=[];let position=0
  while(position<value.length){while(/[\s,]/.test(value[position]??'')&&position<value.length)position++;const start=position;while(position<value.length&&!/\s/.test(value[position]))position++;let url=value.slice(start,position),descriptor=''
   if(url.endsWith(','))url=url.replace(/,+$/,'');else{const start=position;let depth=0;while(position<value.length){const c=value[position];if(c===','&&depth===0)break;if(c==='(')depth++;if(c===')')depth--;position++}descriptor=value.slice(start,position).trim()}
   if(url)candidates.push(await asset(url,directory)+(descriptor?' '+descriptor:''));position++
  }return candidates.join(', ')
 }
 const document=parse(html),elements:Html.Element[]=[]
 const walk=(node:Html.Node)=>{if('tagName'in node)elements.push(node);if('content'in node)walk((node as Html.Template).content);if('childNodes'in node)for(const child of node.childNodes)walk(child)};walk(document)
 const attr=(element:Html.Element,name:string)=>element.attrs.find(value=>value.name===name)
 let directory=dirname(entry)
 const baseElement=elements.find(element=>element.tagName==='base'&&attr(element,'href'))
 if(baseElement){const href=attr(baseElement,'href')!;if(external(href.value))return html;const target=resolveReference(href.value,directory);if(target){directory=href.value.endsWith('/')?target.path:dirname(target.path);baseElement.attrs=baseElement.attrs.filter(value=>value!==href);changed=true}}
 for(const element of elements){
  const source=attr(element,'src'),href=attr(element,'href'),module=attr(element,'type')?.value==='module'
  if(element.tagName==='script'){
   if(source)source.value=await asset(source.value,directory,module?'js':undefined)
   else if(module){const contents=element.childNodes.filter((node):node is Html.TextNode=>node.nodeName==='#text').map(node=>node.value).join('');if(contents.trim()){const bytes=await compile(resolve(directory,'inline-module.js'),'js',contents);element.attrs.push({name:'src',value:dataUrl('application/javascript',bytes)});element.childNodes=[];changed=true}}
  }else if(element.tagName==='link'&&href&&/^(stylesheet|icon)$/i.test(attr(element,'rel')?.value??'')){href.value=await asset(href.value,directory,attr(element,'rel')?.value.toLowerCase()==='stylesheet'?'css':undefined)}
  else if(source&&['img','source','audio','video','track','input'].includes(element.tagName))source.value=await asset(source.value,directory)
  const sources=attr(element,'srcset');if(sources&&['img','source'].includes(element.tagName))sources.value=await srcset(sources.value)
  const poster=attr(element,'poster');if(poster)poster.value=await asset(poster.value,directory)
  if(element.tagName==='style'){const contents=element.childNodes.filter((node):node is Html.TextNode=>node.nodeName==='#text').map(node=>node.value).join('');if(/url\s*\(|@import/i.test(contents)){const bytes=await compile(resolve(directory,'inline.css'),'css',contents);element.childNodes=[{nodeName:'#text',value:Buffer.from(bytes).toString(),parentNode:element}];changed=true}}
  const style=attr(element,'style');if(style&&/url\s*\(/i.test(style.value)){const bytes=await compile(resolve(directory,'inline.css'),'css',':root{'+style.value+'}'),css=Buffer.from(bytes).toString();style.value=css.slice(css.indexOf('{')+1,css.lastIndexOf('}')).trim();changed=true}
 }
 const output=changed?serialize(document):html;if(Buffer.byteLength(output)>TOTAL_LIMIT*2)throw Error('HTML packaged document limit exceeded');return output
}
