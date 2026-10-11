import type {CanvasAnnotation} from './annotation.ts'
export interface AnnotationScope {appId:string;instanceId:string;pageId:string}
export interface AnnotationScreenshot {name:string;type:'image/png'|'image/jpeg'|'image/webp';data:string}
export interface AnnotationRecord extends AnnotationScope {recipeVersion:number;annotation:CanvasAnnotation;requirement:string;roleId:string;createdAt:string;archived:boolean;screenshot?:AnnotationScreenshot}
export type AnnotationRequest = ({action:'list'}&AnnotationScope)|({action:'save';recipeVersion:number;annotation:CanvasAnnotation;requirement:string;roleId:string;screenshot?:AnnotationScreenshot}&AnnotationScope)|({action:'archive';id:string;archived:boolean}&AnnotationScope)|({action:'update';id:string;recipeVersion:number;requirement:string;roleId:string}&AnnotationScope)
export async function annotationRequest(request:AnnotationRequest,signal?:AbortSignal):Promise<{records:AnnotationRecord[]}>{
 const response=await fetch('/api/personal-workbench/annotations',{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json'},body:JSON.stringify(request)}),value=await response.json()
 if(!response.ok)throw new Error(value.error??'Annotation storage unavailable')
 if(!Array.isArray(value.records))throw new Error('Invalid annotation response')
 return value
}
