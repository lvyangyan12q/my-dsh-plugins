import React from 'react'
import {sampleLessonHtml} from './sample-lesson.mjs'

// Opaque-origin sandbox: scripts may operate their lesson, never the host.
// No message listener or persistence bridge is installed by this renderer.
export function LessonFrame({html,title='交互课程'}){
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
 const document=`<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${html}`
 return React.createElement('iframe',{title,srcDoc:document,sandbox:'allow-scripts',referrerPolicy:'no-referrer',style:{display:'block',width:'100%',height:'780px',border:'1px solid #ededed',borderRadius:'12px',background:'#fafafa'}})
}
export function SampleLesson(){return React.createElement('section',{'aria-label':'条件概率固定样课'},React.createElement('h2',null,'动手探索 · 条件概率'),React.createElement(LessonFrame,{html:sampleLessonHtml,title:'条件概率固定样课'}))}
