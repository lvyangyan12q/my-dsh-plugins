import {mountKaogong} from '../src/production-host.ts'
import {createAdoptionOwner} from '../src/legacy-adoption-owner.ts'
import {mountAdoptionHttp} from '../src/adoption-http.ts'
import {adoptionDomain,adoptionPlansDomain} from '../src/legacy-adoption-state.ts'
import {KaogongInstancePool} from '../src/instance-state.ts'
// Historical regression fixture only. Fresh production never mounts old learner/Session adoption.
export async function mountHistoricalFixture(ctx,config){
 const domains=new Map(),storageDomain={open:async spec=>{if(spec.name.startsWith('kaogong_i_'))return ctx.storageDomain.open(spec);if(!domains.has(spec.name)){const domain=await ctx.storageDomain.open(spec);domains.set(spec.name,{domain,handle:new Proxy(domain,{get(target,key){if(key==='close')return async()=>{};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})})}return domains.get(spec.name).handle}},historical={...ctx,storageDomain}
 const stop=await mountKaogong(historical,config),state=await storageDomain.open(adoptionDomain),plans=await storageDomain.open(adoptionPlansDomain),pool=new KaogongInstancePool(storageDomain)
 const owner=createAdoptionOwner(historical,{importState:async(id,operation)=>{const lease=await pool.acquire(id);try{return await operation(lease.state)}finally{await lease.release()}}},state,plans,config),remove=mountAdoptionHttp(historical,owner)
 return async()=>{await owner.close();await remove();await pool.close();await stop();for(const {domain}of domains.values())await domain.close()}
}
