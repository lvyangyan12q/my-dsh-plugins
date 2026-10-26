import {useState,type ReactNode} from 'react'

/** A restored tab describes a terminal, not a running shell. Already mounted shells stay live. */
export function TerminalStart(props:{requiresStart:boolean;label:string;description?:string;children:ReactNode}) {
  const [started,setStarted]=useState(!props.requiresStart)
  if(started)return <>{props.children}</>
  return <div className="dsh-wt_paneWip"><p>{props.description}</p><button type="button" className="dsh-wt_customSend" onClick={()=>setStarted(true)}>{props.label}</button></div>
}
