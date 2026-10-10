/** Display matching only; Host remains the authority for trusted workspace access. */
export function workspaceDisplayMatches(left:string,right:string):boolean {
 if(left===right)return true
 const drive=(path:string)=>/^[a-z]:[\\/]/i.test(path)
 const unc=(path:string)=>/^(?:\\\\|\/\/)[^\\/]+[\\/]/.test(path)
 const windows=drive(left)&&drive(right)||unc(left)&&unc(right)&&(left.startsWith('\\\\')||right.startsWith('\\\\'))
 if(!windows)return false
 const spelling=(path:string)=>path.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase()
 return spelling(left)===spelling(right)
}
