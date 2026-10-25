/** Lease only the mounted conversation root's overflow, never its private content or scroll offsets. */
export function containNativePane(root){
  const style=root.style,axes=['overflow-x','overflow-y']
  const saved=axes.map(property=>({property,value:style.getPropertyValue(property),priority:style.getPropertyPriority(property)}))
  // A single clip axis computes back to hidden when the other remains hidden/auto.
  // Native inner scroll regions retain their own vertical and code-block scrolling.
  for(const property of axes)style.setProperty(property,'clip','important')
  let released=false
  return()=>{
    if(released)return
    released=true
    for(const {property,value,priority} of saved){
      // Do not overwrite a newer Native owner that deliberately changed this property.
      if(style.getPropertyValue(property)!=='clip'||style.getPropertyPriority(property)!=='important')continue
      if(value)style.setProperty(property,value,priority)
      else style.removeProperty(property)
    }
  }
}
