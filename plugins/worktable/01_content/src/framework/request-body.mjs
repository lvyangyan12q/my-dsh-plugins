/** Bound bytes before UTF-8 decoding. Retiring generations abort only unfinished request bodies. */
export async function readRequestText(request,limit,tooLarge,retiring){
 const timeout=AbortSignal.timeout(15000),signal=retiring?AbortSignal.any([timeout,retiring]):timeout;
 const aborted=()=>{const error=new Error(retiring?.aborted?'请求所属服务已关闭，请刷新后重试。':'请求正文读取超时，请重试。');error.code=retiring?.aborted?'generation-changed':'request-timeout';error.status=retiring?.aborted?503:408;return error};
 const chunks=[];let bytes=0,rejectAbort;const interrupted=new Promise((_,reject)=>rejectAbort=reject);
 const stop=()=>{rejectAbort(aborted());request.destroy?.()};signal.addEventListener('abort',stop,{once:true});
 try{if(signal.aborted)throw aborted();const iterator=request[Symbol.asyncIterator]();while(true){const next=await Promise.race([iterator.next(),interrupted]);if(next.done)break;const buffer=Buffer.from(next.value);bytes+=buffer.length;if(bytes>limit)throw tooLarge();chunks.push(buffer)}return Buffer.concat(chunks).toString('utf8')}
 finally{signal.removeEventListener('abort',stop)}
}
