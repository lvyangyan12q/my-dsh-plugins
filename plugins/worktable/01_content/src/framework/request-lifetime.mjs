import {PersistenceError} from './persistence.mjs'
/** A route captures this generation once. Teardown aborts bodies, drains work, then releases its owner. */
export class RequestLifetime{
 constructor(){this.requests=new Set();this.controller=new AbortController();this.retiring=false;this.closePromise=null}
 check(){if(this.retiring)throw new PersistenceError('generation-changed','请求所属服务已关闭，请刷新后重试。')}
 run(operation){const task=Promise.resolve().then(()=>{this.check();return operation()});this.requests.add(task);void task.finally(()=>this.requests.delete(task)).catch(()=>{});return task}
 close(dispose){if(!this.closePromise){this.retiring=true;this.controller.abort();this.closePromise=(async()=>{await Promise.allSettled([...this.requests]);await dispose()})()}return this.closePromise}
}
