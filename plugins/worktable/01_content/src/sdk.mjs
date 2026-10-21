/** Public, browser-safe v1 compatibility handshake. No native execution or state access. */
export const PROTOCOL_VERSION=1
const features=Object.freeze(['application-registration-v1','instance-view-v1','resource-reference-v1','instance-role-v1','application-private-capability-v1','prepared-task-v1','application-lifecycle-v1','composed-authoring-v1'])
export function describeProtocol(){return {protocolVersion:PROTOCOL_VERSION,features:[...features]}}
export function requireProtocol(descriptor,required=[]){
 if(!descriptor||descriptor.protocolVersion!==PROTOCOL_VERSION||!Array.isArray(descriptor.features)||descriptor.features.some(value=>typeof value!=='string'))throw new Error('工作台接入协议不兼容；请安装支持协议1的工作台，原有数据保留。')
 if(!Array.isArray(required)||required.some(value=>typeof value!=='string'))throw new Error('应用协议能力要求无效。')
 const missing=required.filter(value=>!descriptor.features.includes(value))
 if(missing.length)throw new Error('工作台缺少应用所需能力：'+missing.join(', ')+'；原有数据保留。')
 return {protocolVersion:descriptor.protocolVersion,features:[...descriptor.features]}
}
