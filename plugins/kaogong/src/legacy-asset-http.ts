import type {IncomingMessage,ServerResponse} from 'node:http'
import type {StudySources as ResourceDirectory} from './study-sources.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {readAdoptedAsset,type ProvenAssetPlan} from './adopted-assets.ts'
export const legacyAssetPaths=['/api/kaogong/legacy-image','/api/kaogong/legacy-question-image'] as const
const imageType=(body:Buffer)=>body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':body[0]===255&&body[1]===216?'image/jpeg':body.toString('ascii',0,3)==='GIF'?'image/gif':body.toString('ascii',0,2)==='BM'?'image/bmp':body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP'?'image/webp':undefined
/** Mounted behind KaogongHost's authenticated owned-view boundary and command lifetime. */
export function legacyAssetRoutes(input:{instanceId:string;viewId:string;state:KaogongInstanceState;resources:Pick<ResourceDirectory,'call'>;plans():ProvenAssetPlan[];newImage?(id:string,reference:string):Promise<Buffer|undefined>}){
 return legacyAssetPaths.map(path=>({kind:'exact' as const,path,handler:async(req:IncomingMessage,res:ServerResponse)=>{
  if(!['GET','HEAD'].includes(req.method??'')){res.writeHead(405);res.end();return}
  const query=new URL(req.url??'','http://localhost').searchParams,kind=path.endsWith('legacy-question-image')?'bank':'knowledge',key=kind==='bank'?'questionId':'entryId'
  try{
   if([...query.keys()].some(value=>!['viewId',key,'reference'].includes(value))||query.getAll(key).length!==1||query.getAll('reference').length!==1)throw Error('Invalid image selector')
   const id=query.get(key)!,reference=query.get('reference')!,ownRecord=kind==='bank'?input.state.bankQuestions.get(id):input.state.knowledgeEntries.get(id)
   const current=kind==='knowledge'?await input.newImage?.(id,reference):undefined
   const bytes=current??await readAdoptedAsset({kind,id,reference,instanceId:input.instanceId,viewId:input.viewId,ownRecord,plans:input.plans(),resources:input.resources})
   const type=imageType(bytes);if(!type)throw Error('Unsupported image bytes')
   res.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'private, no-store','x-content-type-options':'nosniff'})
   res.end(req.method==='HEAD'?undefined:bytes)
  }catch{res.writeHead(404,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:'图片来源或授权不可用；原记录保留。'}))}
 }}))
}
