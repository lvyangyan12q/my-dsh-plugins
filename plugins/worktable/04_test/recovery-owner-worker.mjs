import {FileOwner} from '../01_content/src/framework/persistence.mjs'
let owner;const deadline=setTimeout(()=>process.exit(3),15000);
try{owner=await FileOwner.acquire(process.argv[2]);process.send?.({status:'owned',pid:process.pid});process.on('message',async message=>{if(message==='close'){try{await owner.close();process.send?.({status:'closed'})}finally{clearTimeout(deadline);process.exit(0)}}})}catch(error){process.send?.({status:'rejected',code:error.code});clearTimeout(deadline);process.exit(0)}
