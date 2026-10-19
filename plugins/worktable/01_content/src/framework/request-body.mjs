/** Bound raw bytes before decoding; a UTF-8 code point may cross any network chunk. */
export async function readRequestText(request,limit,tooLarge){
 const chunks=[];let bytes=0;
 for await(const chunk of request){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>limit)throw tooLarge();chunks.push(buffer)}
 return Buffer.concat(chunks).toString('utf8');
}
