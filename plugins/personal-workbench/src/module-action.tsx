import {createPortal} from 'react-dom'
import type {ReactNode} from 'react'

/** Keep renderer-owned actions in the pane toolbar without moving its content. */
export function ModuleAction({target,children}:{target?:HTMLElement|null;children:ReactNode}){
 return target?createPortal(children,target):<>{children}</>
}
