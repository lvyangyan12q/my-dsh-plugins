import {AsyncLocalStorage} from 'node:async_hooks'
/** One profile's short admission boundary. Async descendants cannot retain an expired lease. */
export class AdmissionGate {
 constructor(){this.tail=Promise.resolve();this.scope=new AsyncLocalStorage()}
 detached(operation){return this.scope.exit(operation)}
 run(operation){
  const inherited=this.scope.getStore();
  if(inherited?.gate===this&&inherited.active)return Promise.resolve().then(operation);
  const token={gate:this,active:true};
  const task=this.tail.catch(()=>{}).then(()=>this.scope.run(token,async()=>{try{return await operation()}finally{token.active=false}}));
  this.tail=task.catch(()=>{});return task;
 }
}
