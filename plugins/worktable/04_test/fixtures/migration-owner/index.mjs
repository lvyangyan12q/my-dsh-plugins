import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {requireProtocol} from 'dsh-worktable/sdk'
const version=FIXTURE_APPLICATION_VERSION
export const name='worktable-migration-example'
export const inject=[]
export function apply(ctx){
 ctx.inject(['profileContext','worktableApplications','worktableMigrations','worktableProtocol'],child=>child.effect(async function*(){
  requireProtocol(child.worktableProtocol.describe(),['application-migration-v1']);const dir=join(child.profileContext.dir,'worktable-migration-example-synthetic');await mkdir(dir,{recursive:true});const file=join(dir,'synthetic.json');
  let pending=Promise.resolve();const lease=operation=>{const result=pending.then(operation);pending=result.catch(()=>{});return result};
  const read=async()=>JSON.parse(await readFile(file,'utf8'));const write=async row=>{const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(row));await rename(temporary,file)};
  try{await read()}catch(error){if(error.code!=='ENOENT')throw error;await write({dataVersion:'1',revision:randomUUID(),text:'Synthetic migration example only',failureUsed:false})}
  const removeApp=await child.worktableApplications.contribute({id:'migration-example',title:'合成升级验收（单实例）',version,kind:'deep',protocolVersion:1,views:[{id:'page',title:'合成资料'}]});
  let removeOwner;
  try{removeOwner=child.worktableMigrations.contribute('migration-example',{
   applicationVersions:['1','2'],inspect:async()=>{const row=await read();return {dataVersion:row.dataVersion,revision:row.revision}},
   plan:async source=>({...source,toDataVersion:version,impact:'Only this example synthetic record is converted. Version 2 deliberately fails its first conversion after writing a checkpoint.',irreversible:true,recovery:'Explicit owner recovery restores its own saved synthetic checkpoint after checking revision. No automatic rollback is promised.'}),
   execute:plan=>lease(async()=>{const row=await read();if(row.revision!==plan.dataRevision)throw Error('Synthetic revision changed');if(version!=='2')throw Error('Install version 2 to run this example');const checkpoint={dataVersion:row.dataVersion,text:row.text};await write({...row,dataVersion:'2',revision:randomUUID(),checkpoint,failureUsed:true});if(!row.failureUsed)throw Error('Controlled first conversion failure; synthetic checkpoint retained')}),
   recover:plan=>lease(async()=>{const row=await read();if(row.revision!==plan.recoveryDataRevision||!row.checkpoint)throw Error('Synthetic recovery checkpoint unavailable or revision changed');await write({...row,...row.checkpoint,revision:randomUUID(),checkpoint:null});return {applicationVersion:plan.fromApplicationVersion}})
  })}catch(error){await removeApp();throw error}
  yield async()=>{await pending;await removeOwner();await removeApp()}
 },'isolated synthetic migration example'))
}
