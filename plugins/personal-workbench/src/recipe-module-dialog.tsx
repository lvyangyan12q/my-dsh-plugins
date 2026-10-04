import {useEffect,useRef,useState} from 'react'
import {RecipeEditor} from './recipe-editor.tsx'

/** Edits the latest saved draft while keeping the running module mounted underneath. */
export function RuntimeModuleDialog({target,t,refresh,onClose}:{target:{appId:string;pageId:string;moduleId:string;changeContent:boolean};t:(key:any)=>string;refresh:()=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false)
 useEffect(()=>{const node=dialog.current!;if(node.showModal)node.showModal();else node.setAttribute('open','');return()=>{if(node.open)node.close?.()}},[])
 return <dialog ref={dialog} className="pwb-runtime-module-dialog" aria-label={t(target.changeContent?'canvasChangeContent':'canvasConfigure')} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <style>{`.pwb-runtime-module-dialog{box-sizing:border-box;width:min(860px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:16px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:12px;background:var(--pwb-paper,#fdfcf9);color:var(--pwb-ink,#2e2b26);overflow:auto}.pwb-runtime-module-dialog::backdrop{background:rgba(30,27,23,.4)}.pwb-runtime-module-dialog>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.pwb-runtime-module-dialog .pwb-recipe-editor>summary{display:none}`}</style>
  <header><strong>{t(target.changeContent?'canvasChangeContent':'canvasConfigure')}</strong><button data-pwb-button type="button" disabled={busy} onClick={onClose}>{t('canvasRestore')}</button></header>
  <RecipeEditor target={target} t={t} refresh={refresh} onActivated={onClose} onBusy={setBusy}/>
 </dialog>
}
