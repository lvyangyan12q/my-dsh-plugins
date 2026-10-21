import {MigrationError} from './migrations.mjs'
import {readRequestText} from './request-body.mjs'
/** Shares the canonical application generation lifetime; no duplicate auth or file owner. */
export function mountMigrationRoutes(ctx,current){
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/worktable/migrations',handler:async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))},runtime=current();
  try{
   if(!runtime?.connection?.admit||!runtime.migrations)return send(503,{code:'unavailable',error:'迁移服务暂不可用；原记录保留。'});
   const admission=runtime.connection.admit(req);if('rejection' in admission)return send(admission.rejection,{code:'unauthorized',error:'请登录当前DSH。'});
   const value=await runtime.lifetime.run(async()=>{
    if(req.method!=='POST')throw new MigrationError('method-not-allowed','迁移入口仅支持POST。',405);
    if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new MigrationError('json-required','需要JSON请求。',415);
    const text=await readRequestText(req,16384,()=>new MigrationError('request-too-large','迁移请求过大。',413),runtime.lifetime.controller.signal);let input;try{input=JSON.parse(text)}catch{throw new MigrationError('invalid-request','JSON格式无效。',400)};
    if(!input||typeof input!=='object'||Array.isArray(input))throw new MigrationError('invalid-request','迁移请求无效。',400);runtime.lifetime.check();
    switch(input.action){case 'get':return runtime.migrations.get(input.viewId);case 'adopt':return runtime.migrations.adopt(input);case 'prepare':return runtime.migrations.prepare(input);case 'confirm':return runtime.migrations.confirm(input);case 'discard':return runtime.migrations.discard(input);case 'recover':return runtime.migrations.recover(input);default:throw new MigrationError('unknown-action','不支持此迁移动作。',400)}
   });send(200,value)
  }catch(error){send(error.status??500,{code:error.code??'migration-failed',error:error.status?error.message:'迁移操作不可用；原记录保留，请检查所属应用。'})}
 }}),'worktable authenticated migration API')
}
