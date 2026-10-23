export async function platformRequest(endpoint:string,body?:any,signal?:AbortSignal){
 const response=await fetch('/api/worktable/'+endpoint,body?{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal}:{credentials:'same-origin',cache:'no-store',signal})
 const value=await response.json();if(!response.ok)throw new Error(value.error??'操作失败；原记录保留，请重试。');return value
}
export const compositionRequest=(action:string,input:any={},signal?:AbortSignal)=>platformRequest('compositions',{action,...input},signal)
export const uniqueModuleId=()=> 'module-'+crypto.randomUUID().slice(0,8)
export const newCompositionId=()=> 'composed-'+crypto.randomUUID()
export const moduleNames:Record<string,string>={website:'网站',custom:'自定义页面',conversation:'原生对话',animation:'动画与媒体',resources:'资源管理',statistics:'统计卡片',list:'数据列表',detail:'详情',filter:'筛选'}
export function starterRecipe(kind='blank'){
 const modules=kind==='dashboard'?[{id:uniqueModuleId(),type:'statistics',config:{metrics:[{id:'count',label:'记录数',aggregate:'count'}]}},{id:uniqueModuleId(),type:'filter',config:{fields:[{id:'query',label:'筛选'}]}},{id:uniqueModuleId(),type:'list',config:{mapping:{id:'id',title:'title'}}},{id:uniqueModuleId(),type:'detail',config:{fields:[{field:'title',label:'标题'}]}}]:[]
 return {title:kind==='dashboard'?'数据看板':'我的应用',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'首页',modules}],connections:[],roles:[]}
}
