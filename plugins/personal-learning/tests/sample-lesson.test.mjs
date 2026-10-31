import {test} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {sampleLessonHtml} from '../src/sample-lesson.mjs'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {LessonFrame} from '../src/lesson-frame.mjs'

test('rendered lesson is opaque-origin and cannot request host resources',()=>{
 const dom=new JSDOM(renderToStaticMarkup(React.createElement(LessonFrame,{html:sampleLessonHtml,title:'样课'})))
 const frame=dom.window.document.querySelector('iframe')
 assert.equal(frame.getAttribute('sandbox'),'allow-scripts')
 assert.equal(frame.getAttribute('title'),'样课')
 const content=new JSDOM(frame.getAttribute('srcdoc'))
 assert.match(content.window.document.querySelector('meta[http-equiv]').content,/connect-src 'none'/)
 assert.match(content.window.document.body.textContent,/固定样课/)
 content.window.close();dom.window.close()
})

test('learner changes intersection, filters the sample space and resets',()=>{
 const dom=new JSDOM(sampleLessonHtml,{runScripts:'dangerously'}),d=dom.window.document
 try{
  const slider=d.querySelector('input[type=range]');slider.value='30';slider.dispatchEvent(new dom.window.Event('input'))
  assert.equal(d.querySelector('[role=status]').textContent,'P(A ∩ B) = 30 / 100 = 30%')
  d.querySelector('#filter').click()
  assert.equal(d.querySelector('[role=status]').textContent,'P(A | B) = 30 / 40 = 75%')
  slider.value='0';slider.dispatchEvent(new dom.window.Event('input'));assert.match(d.querySelector('[role=status]').textContent,/= 0%$/)
  slider.value='40';slider.dispatchEvent(new dom.window.Event('input'));assert.match(d.querySelector('[role=status]').textContent,/= 100%$/)
  d.querySelector('#reset').click();assert.equal(slider.value,'20');assert.equal(d.querySelector('[role=status]').textContent,'P(A ∩ B) = 20 / 100 = 20%')
 }finally{dom.window.close()}
})
