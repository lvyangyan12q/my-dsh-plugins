import {roleKey} from './role-client.ts'
import type {RoleBindingKey} from './role-binding-api.ts'
/** Reveal only this page's existing role surface; never create a second native editor. */
export function revealAnnotationComposer(canvas:HTMLElement,key:RoleBindingKey,signal:AbortSignal,missing:string):Promise<void>{
 signal.throwIfAborted()
 const view=canvas.ownerDocument.defaultView
 if(!view)return Promise.reject(Error(missing))
 return new Promise((resolve,reject)=>{
  let frame=0,settled=false,ready:Element|null=null,stable=0,revealed:HTMLElement|null=null
  const finish=(error?:unknown)=>{if(settled)return;settled=true;observer.disconnect();view.cancelAnimationFrame(frame);view.clearTimeout(timer);signal.removeEventListener('abort',aborted);error?reject(error):resolve()}
  const aborted=()=>finish(signal.reason??Error('Annotation cancelled'))
  const inspect=()=>{
   if(settled)return
   if(signal.aborted){aborted();return}
   const role=[...canvas.querySelectorAll<HTMLElement>('[data-pwb-role-key]')].find(node=>node.dataset.pwbRoleKey===roleKey(key))
   if(role){for(let node:HTMLElement|null=role;node&&node!==canvas;node=node.parentElement)if(node.tagName==='DETAILS'){const details=node as HTMLDetailsElement;if(!details.open){details.open=true;details.dispatchEvent(new view.Event('pwb-reveal-role'))}}}
   if(role&&role!==revealed){revealed=role;role.dispatchEvent(new view.Event('pwb-reveal-role'))}
   const editor=role?[...role.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(node=>!node.closest('dialog'))??null:null
   stable=editor&&editor===ready?stable+1:0;ready=editor
   // Let native mount effects hydrate/persist the editor before reading its draft.
   if(editor&&stable>=2){role?.scrollIntoView?.({block:'nearest'});finish();return}
   frame=view.requestAnimationFrame(inspect)
  }
  const observer=new view.MutationObserver(()=>{stable=0})
  observer.observe(canvas,{subtree:true,childList:true,attributes:true,attributeFilter:['contenteditable','data-pwb-role-key']})
  const timer=view.setTimeout(()=>finish(Error(missing)),5000)
  signal.addEventListener('abort',aborted,{once:true});inspect()
 })
}
