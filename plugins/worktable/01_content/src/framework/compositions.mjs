import {CompositionError,normalizeRecipe,compositionDefinition} from './composition-schema.mjs'
const missing=()=>{throw new CompositionError('composition-missing','组合应用不存在。',404)}
const conflict=()=>{throw new CompositionError('revision-conflict','草稿已改变，请刷新后重试。',409)}
const later=(next,previous)=>{const a=next.split('.').map(Number),b=previous.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}return false}
/** Composition authoring owns definitions, never business data, grants or native sessions. */
export class CompositionDirectory {
 constructor(applications,{validateDependencies=async recipe=>{if(recipe.connections.length||recipe.roles.length)throw new CompositionError('dependency-unavailable','当前Host无法验证数据与角色，请移除引用或等待服务恢复。',503)}}={}){this.applications=applications;this.validateDependencies=validateDependencies}
 async list(){await this.applications.pending;return structuredClone((await this.applications.read()).compositions??[])}
 async get(appId){return (await this.list()).find(row=>row.appId===appId)??missing()}
 save({appId,expectedRevision,recipe}){const draft=normalizeRecipe(recipe);return this.applications.change(data=>{
 if(typeof appId!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(appId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new CompositionError('invalid-composition','应用标识或预期版本无效。')
 data.compositions??=[];let row=data.compositions.find(row=>row.appId===appId)
 if(!row){if(expectedRevision!==0)conflict();if(data.applications.some(app=>app.id===appId)||data.deepApplicationIds?.includes(appId)||this.applications.contributions.has(appId))throw new CompositionError('application-conflict','应用标识已属于其他来源。',409);row={appId,owner:'worktable-compositions',revision:0};data.compositions.push(row)}
 if(row.revision!==expectedRevision)conflict();row.draft=draft;row.revision++;data.schema=3;return row
 })}
 preview({appId,expectedRevision}){return this.applications.gate.run(async()=>{const row=await this.get(appId);if(row.revision!==expectedRevision)conflict();await this.validateDependencies(row.draft,appId);return {appId,revision:row.revision,recipe:structuredClone(row.draft),definition:compositionDefinition({...row,running:row.draft})}})}
 activate(input){return this.applications.gate.run(async()=>{const preview=await this.preview(input);return this.applications.change(data=>{const row=data.compositions?.find(row=>row.appId===input.appId)??missing();if(row.revision!==input.expectedRevision)conflict();if(row.running&&!later(preview.recipe.version,row.running.version))throw new CompositionError('version-required','修改运行配方前请递增版本号。',409);if(row.running&&row.running.pages[0].id!==preview.recipe.pages[0].id)throw new CompositionError('page-identity-changed','运行首页身份不可替换，请保留首页并新增页面。',409);row.running=preview.recipe;row.revision++;data.schema=3;return row})})}
}
