import {StandaloneKnowledgeLibrary} from './standalone-knowledge-reader.tsx'
export type Entry={id:string;title:string;subject:string;kind:string;source:string;content:string;tags?:string[]}
/** Plain display projection has no registration side effects or old renderer dependency. */
export function knowledgeDisplayData(entries:Entry[]){
  return {records:entries.map(entry=>({id:entry.id,title:entry.title,subtitle:`${entry.subject} · ${entry.kind}`,fields:{科目:entry.subject,类型:entry.kind,来源:entry.source??'',正文:entry.content??'',标签:entry.tags?.join(' ')??''}})),filters:[{field:'科目',label:'科目'},{field:'类型',label:'资料类型'}],stats:[{id:'materials',label:'条资料',operation:'count'}]}
}
export function KnowledgeLibrary(props:{active?:boolean}){return <StandaloneKnowledgeLibrary {...props}/>}
