import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
const html=new URL('./worktable-canvas-prototype.html',import.meta.url)
createServer(async(_request,response)=>{response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile(html))}).listen(3086,'127.0.0.1',()=>console.log('Prototype: http://127.0.0.1:3086/?variant=A'))
