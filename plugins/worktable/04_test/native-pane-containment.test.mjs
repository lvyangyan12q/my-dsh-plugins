import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {containNativePane} from '../01_content/src/client/nativePaneContainment.mjs'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{JSDOM}=require('jsdom')

test('a native root leases both clip axes and restores original inline values and priorities exactly',()=>{
 const dom=new JSDOM('<main style="overflow-x:hidden!important;overflow-y:auto;color:red"><textarea>Retained native draft</textarea><pre style="overflow:auto">Code</pre></main>'),root=dom.window.document.querySelector('main'),input=root.querySelector('textarea'),code=root.querySelector('pre')
 input.focus();input.setSelectionRange(4,8);code.scrollLeft=43;code.scrollTop=29
 const release=containNativePane(root)
 for(const axis of ['overflow-x','overflow-y']){assert.equal(root.style.getPropertyValue(axis),'clip');assert.equal(root.style.getPropertyPriority(axis),'important')}
 assert.equal(dom.window.document.activeElement,input);assert.equal(input.value,'Retained native draft');assert.equal(input.selectionStart,4);assert.equal(code.scrollLeft,43);assert.equal(code.scrollTop,29)
 release();assert.equal(root.style.getPropertyValue('overflow-x'),'hidden');assert.equal(root.style.getPropertyPriority('overflow-x'),'important');assert.equal(root.style.getPropertyValue('overflow-y'),'auto');assert.equal(root.style.getPropertyPriority('overflow-y'),'');assert.equal(root.style.color,'red');assert.equal(code.scrollLeft,43)
 root.style.overflowX='scroll';release();assert.equal(root.style.overflowX,'scroll','released lease cannot overwrite a later Native setting')
})

test('a stylesheet-owned root is restored by removing only the leased inline declarations',()=>{
 const dom=new JSDOM('<main style="color:blue"></main>'),root=dom.window.document.querySelector('main'),release=containNativePane(root)
 release();assert.equal(root.style.getPropertyValue('overflow-x'),'');assert.equal(root.style.getPropertyValue('overflow-y'),'');assert.equal(root.style.color,'blue')
})

test('a later Native change to one owned property survives release while the other axis is restored',()=>{
 const dom=new JSDOM('<main style="overflow-x:hidden;overflow-y:hidden"></main>'),root=dom.window.document.querySelector('main'),release=containNativePane(root)
 root.style.setProperty('overflow-x','scroll','important');release();assert.equal(root.style.overflowX,'scroll');assert.equal(root.style.getPropertyPriority('overflow-x'),'important');assert.equal(root.style.overflowY,'hidden')
})

test('an existing overflow shorthand and important priority survive the complete lease',()=>{
 const dom=new JSDOM('<main style="overflow:hidden!important;color:teal"></main>'),root=dom.window.document.querySelector('main'),before=root.style.cssText,release=containNativePane(root)
 release();assert.equal(root.style.cssText,before)
})