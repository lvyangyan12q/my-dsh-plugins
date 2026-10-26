import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {runInNewContext} from 'node:vm'

const require=createRequire(new URL('../01_content/package.json',import.meta.url))
const React=require('react'),{create,act}=require('react-test-renderer'),{buildSync}=require('esbuild')
const code=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/TerminalStart.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],jsx:'automatic'}).outputFiles[0].text
const module={exports:{}};runInNewContext(code,{module,exports:module.exports,require})
const {TerminalStart}=module.exports

test('a file-restored terminal does not start until its visible start action is clicked',()=>{
  let starts=0,stops=0,renderer
  function Terminal(){React.useEffect(()=>{starts++;return ()=>{stops++}},[]);return React.createElement('div',null,'live terminal')}
  const props={requiresStart:true,label:'启动终端',description:'终端需重新启动'}
  act(()=>{renderer=create(React.createElement(TerminalStart,props,React.createElement(Terminal)))})
  assert.equal(starts,0);assert.match(JSON.stringify(renderer.toJSON()),/启动终端/)
  act(()=>renderer.root.findByType('button').props.onClick())
  assert.equal(starts,1)
  act(()=>renderer.update(React.createElement(TerminalStart,props,React.createElement(Terminal))))
  assert.equal(starts,1);assert.equal(stops,0)
  act(()=>renderer.unmount());assert.equal(stops,1)
})

test('explicitly selecting a fresh terminal retains immediate launch',()=>{
  let starts=0,renderer
  function Terminal(){React.useEffect(()=>{starts++},[]);return React.createElement('div',null,'live terminal')}
  act(()=>{renderer=create(React.createElement(TerminalStart,{requiresStart:false,label:'启动终端'},React.createElement(Terminal)))})
  assert.equal(starts,1);assert.equal(renderer.root.findAllByType('button').length,0)
  act(()=>renderer.update(React.createElement(TerminalStart,{requiresStart:true,label:'启动终端'},React.createElement(Terminal))))
  assert.equal(starts,1)
  act(()=>renderer.unmount())
})
