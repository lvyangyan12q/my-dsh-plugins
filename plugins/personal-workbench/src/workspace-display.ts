/** Display matching only; Host remains the authority for trusted workspace access. */
export function workspaceDisplayMatches(left:string,right:string):boolean {
 if(left===right)return true
 const windows=(path:string)=>/^[a-z]:[\\/]/i.test(path)||/^(?:\\\\|\/\/)[^\\/]+[\\/]/.test(path)
 if(!windows(left)||!windows(right))return false
 const spelling=(path:string)=>path.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase()
 return spelling(left)===spelling(right)
}
