import React,{useState} from 'react'
import {SampleLesson} from './lesson-frame.mjs'
const h=React.createElement
const concepts=[['events','随机事件'],['joint','联合概率'],['conditional','条件概率'],['independence','独立性'],['bayes','贝叶斯定理']]
const edges=[['events','joint','先修'],['joint','conditional','先修'],['events','joint','组成'],['conditional','independence','应用'],['conditional','bayes','应用']]
const title=id=>concepts.find(row=>row[0]===id)[1]

/** Demo-only navigation: selected concept remains mounted while visiting its lesson. */
export function KnowledgeExplorer(){
 const[page,setPage]=useState('studio'),[selected,setSelected]=useState('conditional')
 return h('section',{'aria-label':'课程与知识地图',className:'pl-explorer'},
  h('style',null,styles),
  h('nav',{'aria-label':'学习视图'},h('button',{type:'button','aria-pressed':page==='studio',onClick:()=>setPage('studio')},'课程工作室'),h('button',{type:'button','aria-pressed':page==='map',onClick:()=>setPage('map')},'知识地图')),
  page==='map'?h('div',null,h('h2',null,'示例知识地图'),h('p',null,'演示关系，不是为你的目标生成的知识图；不表示个人掌握情况。'),
   h('div',{className:'pl-map-grid'},h('div',null,
    h('div',{className:'pl-map-nodes'},...concepts.map(([id,name])=>h('button',{key:id,type:'button','data-concept':id,'aria-pressed':selected===id,onClick:()=>setSelected(id)},name))),
    h('ul',{'aria-label':'有向知识关系'},...edges.map(([from,to,type],i)=>h('li',{key:i},h('span',{className:'pl-relation'},type),' ',title(from),' → ',title(to))))),
    h('article',{'aria-label':'概念详情','aria-live':'polite'},h('h3',null,title(selected)),selected==='conditional'?h(React.Fragment,null,h('p',null,'先修：随机事件、联合概率。通过缩小样本空间理解条件概率。'),h('button',{type:'button',onClick:()=>setPage('lesson')},'打开条件概率样课')):h('p',null,'尚无关联课程。此节点仅用于演示导航关系。')))):
   h('div',null,page==='lesson'&&h('button',{type:'button',onClick:()=>setPage('map')},'返回知识地图'),h(SampleLesson)))
}
const styles=`.pl-explorer nav{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.pl-explorer button[aria-pressed=true]{background:#f2fff2;color:#007106;outline:1px solid #87ea5c}.pl-map-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,.7fr);gap:20px}.pl-map-nodes{display:flex;flex-wrap:wrap;gap:12px;padding:20px;background:radial-gradient(#ddd 1px,transparent 1px) 0 0/16px 16px;border:1px solid #ededed;border-radius:12px}.pl-map-nodes button{border:1px solid #dbdbdb;background:white;color:#202020}.pl-map-grid ul{list-style:none;padding:0;line-height:2.5;overflow-wrap:anywhere}.pl-relation{display:inline-block;padding:0 7px;background:#f5f5f5;border-radius:5px;color:#555;font-size:12px}.pl-explorer article{min-width:0}.pl-explorer :focus-visible{outline:2px solid #007106;outline-offset:3px}@media(max-width:700px){.pl-map-grid{grid-template-columns:1fr}.pl-map-nodes{padding:14px}.pl-map-nodes button{flex:1 1 120px}}`
