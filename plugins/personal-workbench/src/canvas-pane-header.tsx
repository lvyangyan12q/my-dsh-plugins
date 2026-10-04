import {useRef,useState} from 'react'
import type {ReactNode,PointerEvent} from 'react'

/** Reorder within this canvas using pointer capture, including touch and embedded browsers. */
export function CanvasPaneHeader({identity,moduleId,onMove,children}:{identity:string;moduleId:string;onMove:(target:string)=>void;children:ReactNode}){
 const gesture=useRef<{identity:string;pointerId:number;x:number;y:number}>(),[dragging,setDragging]=useState(false)
 const reset=()=>{gesture.current=undefined;setDragging(false)}
 const moved=(event:PointerEvent<HTMLElement>)=>{const start=gesture.current;return !!start&&start.identity===identity&&start.pointerId===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>=6}
 return <header className="pwb-canvas-pane-header" tabIndex={0} data-dragging={dragging||undefined} style={{touchAction:'none',cursor:dragging?'grabbing':'grab',userSelect:'none',outline:dragging?'2px solid var(--pwb-accent)':''}} onDragStart={event=>event.preventDefault()}
  onPointerDown={event=>{if(event.button!==0||(event.target as Element).closest('button,input,select,textarea,a'))return;event.preventDefault();gesture.current={identity,pointerId:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.focus();event.currentTarget.setPointerCapture?.(event.pointerId)}}
  onPointerMove={event=>{if(moved(event))setDragging(true)}}
  onPointerUp={event=>{if(gesture.current?.pointerId!==event.pointerId)return;const shouldMove=moved(event),header=event.currentTarget;reset();if(header.hasPointerCapture?.(event.pointerId))header.releasePointerCapture(event.pointerId);if(!shouldMove)return;const target=header.ownerDocument.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('.pwb-canvas-pane-header'),grid=header.closest('.pwb-canvas-grid');if(!target||target.closest('.pwb-canvas-grid')!==grid||!grid)return;const id=target.closest<HTMLElement>('[data-module-id]')?.dataset.moduleId;if(id&&id!==moduleId)onMove(id)}}
  onPointerCancel={reset} onLostPointerCapture={reset} onKeyDown={event=>{if(event.key==='Escape')reset()}}>{children}</header>
}
