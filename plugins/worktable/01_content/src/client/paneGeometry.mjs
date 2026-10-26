/** Allocate bounded pane extents without changing the persisted manual baseline. */
export function paneExtents(panes, wanted, total, gap = 1, minimum = pane => pane.min) {
  if (!panes.length) return []
  const available = Math.max(0, total - Math.max(0, panes.length - 1) * gap)
  const mins = panes.map(pane => Math.max(0, minimum(pane)))
  const minTotal = mins.reduce((a,b)=>a+b,0)
  if (minTotal > available) return mins.map(value=>value * available / minTotal)
  const weights = panes.map((pane,i)=>Math.max(0,(Number.isFinite(wanted[i])?wanted[i]:mins[i])-mins[i]))
  const weightTotal = weights.reduce((a,b)=>a+b,0), extra = available-minTotal
  return mins.map((value,i)=>value+extra*(weightTotal?weights[i]/weightTotal:1/panes.length))
}

/** A divider changes its two neighbors while leaving every other pane in place. */
export function resizeNeighbors(panes, wanted, total, index, size, gap = 1, minimum = pane => pane.min) {
  const extents = paneExtents(panes,wanted,total,gap,minimum)
  if(index<0 || index>=panes.length-1)return extents
  const pair=extents[index]+extents[index+1]
  const lo=Math.min(minimum(panes[index]),extents[index]), hi=pair-Math.min(minimum(panes[index+1]),extents[index+1])
  extents[index]=Math.min(hi,Math.max(lo,size));extents[index+1]=pair-extents[index]
  return extents
}


/** Keep original indices/identities while giving only expanded panes an extent. */
export function expandedExtents(panes, wanted, total, gap = 1, minimum = pane => pane.min) {
  const visible=panes.map((pane,index)=>({pane,index})).filter(item=>!item.pane.minimized)
  const values=paneExtents(visible.map(item=>item.pane),visible.map(item=>wanted[item.index]),total,gap,minimum)
  const result=panes.map(()=>0)
  visible.forEach((item,i)=>{result[item.index]=values[i]})
  return result
}

/** Hidden panes retain their last manual baseline while visible neighbors resize. */
export function resizeExpandedNeighbors(panes, wanted, total, index, size, gap = 1, minimum = pane => pane.min) {
  const visible=panes.map((pane,index)=>({pane,index})).filter(item=>!item.pane.minimized)
  const selected=visible.findIndex(item=>item.index===index)
  if(selected<0||selected>=visible.length-1)return wanted.slice()
  const resized=resizeNeighbors(visible.map(item=>item.pane),visible.map(item=>wanted[item.index]),total,selected,size,gap,minimum)
  const result=wanted.slice()
  visible.forEach((item,i)=>{result[item.index]=resized[i]})
  return result
}
