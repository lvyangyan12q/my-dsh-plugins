import type {AnnotationScreenshot} from './annotation-records-api.ts'
/** Selected screenshots belong to plugin records, never to native attachment staging. */
export function validateAnnotationImage(file:File):void {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP screenshot.')
 if(!file.size||file.size>8*1024*1024)throw Error('Screenshot must be nonempty and no larger than 8 MiB.')
}

export async function serializeAnnotationImage(file:File,signal?:AbortSignal):Promise<AnnotationScreenshot>{
 validateAnnotationImage(file);signal?.throwIfAborted();
 const bytes=new Uint8Array(await file.arrayBuffer());signal?.throwIfAborted();
 let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
 return {name:file.name.slice(0,200),type:file.type as AnnotationScreenshot['type'],data:btoa(binary)}
}
