import {useEffect,useState} from 'react'
export function AnnotationImage({file,busy,t,onChange}:{file?:File;busy:boolean;t:(key:any)=>string;onChange:(file?:File)=>void}){
 const [url,setUrl]=useState('')
 useEffect(()=>{if(!file){setUrl('');return}const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value)},[file])
 return <div className="pwb-annotation-image"><label>{t('annotationImage')}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('annotationImage')} disabled={busy} onChange={event=>{onChange(event.target.files?.[0]);event.target.value=''}}/></label><small>{t('annotationImageHelp')}</small>{file&&<><img src={url} alt={t('annotationImagePreview')} style={{maxWidth:'100%',maxHeight:140,objectFit:'contain'}}/><small>{file.name} · {Math.ceil(file.size/1024)} KiB</small><button data-pwb-button type="button" disabled={busy} onClick={()=>onChange()}>{t('annotationImageRemove')}</button></>}</div>
}
