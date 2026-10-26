export type LayoutRow = 'left' | 'top' | 'main'
type PaneRows<T> = {left?: T | null; leftMore?: T[] | null; top?: T[] | null; main?: T[]}

/** Window order is shared by rendering, task ownership and annotation identities. */
export function leftPanesOf<T>(spec: PaneRows<T> | null | undefined): T[] {
  return spec?.left ? [spec.left,...(Array.isArray(spec.leftMore)?spec.leftMore:[])] : []
}

export function layoutPanes<T>(spec: PaneRows<T> | null | undefined): {row:LayoutRow;index:number;pane:T}[] {
  if(!spec)return []
  return (['left','top','main'] as const).flatMap(row=>(row==='left'?leftPanesOf(spec):spec[row]??[]).map((pane,index)=>({row,index,pane})))
}
