// THROWAWAY: static UI prototype only. Run: node docs/wayfinder/personal-learning/prototype/serve.mjs
import http from 'node:http';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url));
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html)}).listen(4381,'127.0.0.1',()=>console.log('Learning prototype: http://127.0.0.1:4381/?variant=A'));
