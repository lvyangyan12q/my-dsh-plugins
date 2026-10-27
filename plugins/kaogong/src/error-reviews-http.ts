import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {PracticeError} from './practice-rounds.ts'
import type {IncomingMessage,ServerResponse} from 'node:http'
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
export function registerErrorReviews(ctx:BusinessRegistry,state:KaogongInstanceState){
 // All descriptors run behind KaogongHost admission, trusted view ownership and command gate.
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/kaogong/errors',handler:async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(req.method==='GET'){const filters=Object.fromEntries(new URL(req.url??'','http://localhost').searchParams);send(res,200,{...state.errors.list(filters),queue:state.errors.queue()});return}
   if(req.method!=='POST'){send(res,405,{error:'method not allowed'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>20000)throw new PracticeError('请求过大')}
   send(res,200,await state.errors.command(JSON.parse(text)))
  }catch(error){send(res,error instanceof PracticeError?error.status:400,{error:error instanceof Error?error.message:String(error)})}
 }}),'kaogong.errors')
}
