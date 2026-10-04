import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {JSDOM} from 'jsdom'
import {readContentFile} from '../src/content-files.ts'
const decode=url=>Buffer.from(url.slice(url.indexOf(',')+1).split('#')[0],'base64').toString()
test('local HTML packs sibling image, stylesheet imports, CSS images and classic/module scripts without changing source files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pwb-assets-'));try{await mkdir(join(root,'pages'));await mkdir(join(root,'images'));await writeFile(join(root,'images/pixel.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');await writeFile(join(root,'pages/colors.css'),'.title { color: rgb(12, 34, 56); }');await writeFile(join(root,'pages/theme.css'),'@import "./colors.css"; .hero { background: url(../images/pixel.svg); }');await writeFile(join(root,'pages/classic.js'),'function greet(){return "hello"}; window.greet=greet;');await writeFile(join(root,'pages/value.js'),'export const value=42;');await writeFile(join(root,'pages/main.js'),'import {value} from "./value.js"; document.body.dataset.answer=String(value);');await writeFile(join(root,'pages/index.html'),'<link rel="stylesheet" href="theme.css"><img src="../images/pixel.svg"><script src="classic.js"></script><script type="module" src="main.js"></script>')
 const original=await readFile(join(root,'pages/index.html'),'utf8');const file=await readContentFile(root,'pages/index.html');assert.equal(await readFile(join(root,'pages/index.html'),'utf8'),original);const dom=new JSDOM(file.content),document=dom.window.document
 assert.match(document.querySelector('img').src,/^data:image\/svg\+xml;base64,/);const css=decode(document.querySelector('link').href);assert.match(css,/12, 34, 56/);assert.match(css,/data:image\/svg\+xml/)
 assert.match(decode(document.querySelector('script:not([type])').src),/function greet/);const module=decode(document.querySelector('script[type=module]').src);assert.match(module,/42/);assert.ok(!module.includes('"./value.js"'));dom.window.close()
 }finally{await rm(root,{recursive:true,force:true})}
})
test('HTML asset traversal, directory junction escape, unsupported file kinds and oversized graphs fail closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pwb-assets-bound-')),outside=await mkdtemp(join(tmpdir(),'pwb-assets-out-'));try{await mkdir(join(root,'pages'));await symlink(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');await writeFile(join(outside,'private.svg'),'<svg/>')
 for(const source of ['../../outside.svg','../escape/private.svg','secret.env']){await writeFile(join(root,'pages/index.html'),'<img src="'+source+'">');await assert.rejects(readContentFile(root,'pages/index.html'))}
 await writeFile(join(root,'pages/large.svg'),'x'.repeat(2*1024*1024+1));await writeFile(join(root,'pages/index.html'),'<img src="large.svg">');await assert.rejects(readContentFile(root,'pages/index.html'),/limit/)
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})

test('inline styles and srcset use the original directory while remote URLs stay external',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pwb-assets-inline-'));try{await mkdir(join(root,'sub'));await writeFile(join(root,'sub/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');await writeFile(join(root,'index.html'),'<base href="sub/"><style>.hero{background:url(icon.svg)}</style><div style="background:url(icon.svg)"></div><img srcset="icon.svg 1x, https://example.com/icon.svg 2x"><script type="module">document.body.dataset.ready="yes";</script>')
 const file=await readContentFile(root,'index.html'),dom=new JSDOM(file.content),document=dom.window.document;assert.match(document.querySelector('style').textContent,/data:image/);assert.match(document.querySelector('div').getAttribute('style'),/data:image/);assert.match(document.querySelector('img').getAttribute('srcset'),/^data:image/);assert.match(document.querySelector('img').getAttribute('srcset'),/https:\/\/example.com/);assert.equal(document.querySelector('base').hasAttribute('href'),false);assert.match(decode(document.querySelector('script').src),/ready/);dom.window.close()
 }finally{await rm(root,{recursive:true,force:true})}
})

test('HTML static resource count, total bytes and query plus SVG fragment are bounded independently',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pwb-assets-budget-'));try{
  for(let index=0;index<65;index++)await writeFile(join(root,index+'.svg'),'<svg/>')
  await writeFile(join(root,'index.html'),Array.from({length:65},(_,index)=>'<img src="'+index+'.svg">').join(''));await assert.rejects(readContentFile(root,'index.html'),/count limit/)
  for(let index=0;index<5;index++)await writeFile(join(root,index+'.svg'),'x'.repeat(2*1024*1024))
  await writeFile(join(root,'index.html'),Array.from({length:5},(_,index)=>'<img src="'+index+'.svg">').join(''));await assert.rejects(readContentFile(root,'index.html'),/byte limit/)
  await writeFile(join(root,'icon.svg'),'<svg/>');await writeFile(join(root,'index.html'),'<img src="icon.svg?v=1#check">');assert.match((await readContentFile(root,'index.html')).content,/#check/)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('template fragments retain packaged resources after being cloned into the visible page',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pwb-assets-template-'));try{
  await writeFile(join(root,'icon.svg'),'<svg/>');await writeFile(join(root,'index.html'),'<template id="card"><img src="icon.svg"><style>.card{background:url(icon.svg)}</style></template>')
  const dom=new JSDOM((await readContentFile(root,'index.html')).content),document=dom.window.document;document.body.append(document.querySelector('template').content.cloneNode(true));assert.match(document.body.querySelector('img').src,/^data:image/);assert.match(document.body.querySelector('style').textContent,/data:image/);dom.window.close()
 }finally{await rm(root,{recursive:true,force:true})}
})
