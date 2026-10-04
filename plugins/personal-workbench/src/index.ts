import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {recipeHostDependencies} from './recipe-api.ts'
import {generationHostDependencies} from './generation-api.ts'

export type { RoleDefinition, RoleBindingKey, RoleBinding, PersonalWorkbenchBindings, TeachingEvidence } from './role-binding-api.ts'
export type { ManagementCatalog, ManagedRole, ManagedSkill, SkillAssignment, ManagementRequest } from './management-api.ts'

export type { AppLifecycleState, AppLifecycleCatalog, AppLifecycleRequest, PersonalWorkbenchApps } from './app-lifecycle-api.ts'
export const name = 'personal-workbench'
export const inject = ['webServer']

/** Persisted by the official profile configuration; no transcript is copied. */
export interface Config { teacherSessionId: string }
export const Config: z<Config> = z.object({ teacherSessionId: z.string().default('') })

/** Register read-only association metadata. Installation makes no session or model calls. */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['skills', 'agentPresets'], child => child.effect(async function* () {
    const { installWorkbenchSkills } = await import('./workbench-skills.ts')
    const owner = await installWorkbenchSkills(child)
    yield async () => { await owner.dispose() }
  }, 'workbench packaged Skills and application builder'))
  let annotationHandler:((req:IncomingMessage,res:ServerResponse)=>Promise<void>)|undefined
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/personal-workbench/annotations',handler:(req,res)=>{if(annotationHandler){void annotationHandler(req,res);return}res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Annotation storage unavailable'}))}}),'annotation records route')
  ctx.inject(['storageDomain','connection','personalWorkbenchRecipes','personalWorkbenchApps'],child=>child.effect(async function*(){const {installAnnotationRecords}=await import('./annotation-host.ts');const owner=await installAnnotationRecords(child);annotationHandler=owner.handle;yield async()=>{annotationHandler=undefined;await owner.dispose()}},'durable annotation records'))
  let contentHandler:((req:IncomingMessage,res:ServerResponse)=>Promise<void>)|undefined
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/personal-workbench/content',handler:(req,res)=>{if(contentHandler){void contentHandler(req,res);return}res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Content services unavailable'}))}}),'module content route')
  ctx.inject(['storageDomain','connection','personalWorkbenchRecipes','personalWorkbenchApps','personalWorkbenchRecipeRoles','personalWorkbenchBindings','sessionController'],child=>child.effect(async function*(){const {installContent}=await import('./content-host.ts');const owner=await installContent(child);contentHandler=owner.handle;yield async()=>{contentHandler=undefined;await owner.dispose()}},'module content owner'))
  let generationHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/api/personal-workbench/generation',handler:(req,res)=>{if(generationHandler){void generationHandler(req,res);return};res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Generation services unavailable'}))}}),'native generation route')
  ctx.inject(generationHostDependencies,child=>child.effect(async function*(){const {installGeneration}=await import('./generation-host.ts');const owner=await installGeneration(child);generationHandler=owner.handle;yield async()=>{generationHandler=undefined;await owner.dispose()}},'native application generation'))
  let recipeHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/api/personal-workbench/recipes',handler:(req,res)=>{if(recipeHandler){void recipeHandler(req,res);return};res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Recipe services unavailable'}))}}),'recipe route')
  ctx.inject(recipeHostDependencies,child=>child.effect(async function*(){const {installRecipes}=await import('./recipe-host.ts');const owner=await installRecipes(child);recipeHandler=owner.handle;yield async()=>{recipeHandler=undefined;await owner.dispose()}},'durable recipes'))
  ctx.inject(['storageDomain','personalWorkbenchRecipes','personalWorkbenchBindings','personalWorkbenchApps','agentPresets','skills','workspaceRegistry'],child=>child.effect(async function*(){const {installRecipeRoles}=await import('./recipe-role-host.ts');const owner=await installRecipeRoles(child);yield async()=>{await owner.dispose()}},'durable recipe role instances'))
  let appHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/personal-workbench/apps', handler: (req,res) => {
    if(appHandler) {void appHandler(req,res);return}
    res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Application lifecycle services unavailable'}))
  }}),'personal-workbench: application lifecycle route')
  ctx.inject(['storageDomain','connection'],child=>child.effect(async function*(){
    const {installAppLifecycle}=await import('./app-lifecycle-host.ts');const owner=await installAppLifecycle(child);appHandler=owner.handle
    yield async()=>{appHandler=undefined;await owner.dispose()}
  },'personal-workbench: durable application lifecycle'))
  let managementHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/personal-workbench/management', handler: (req, res) => {
    if (managementHandler) { void managementHandler(req, res); return }
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: 'Agent and Skill management services unavailable' }))
  } }), 'personal-workbench: optional management route')
  ctx.inject(['personalWorkbenchBindings', 'storageDomain', 'sessionController', 'agentPresets', 'skills', 'agents', 'tools', 'connection'], child => {
    child.effect(async function* () {
      const { installManagement } = await import('./management-host.ts')
      const owner = await installManagement(child)
      managementHandler = owner.handle
      yield async () => { managementHandler = undefined; await owner.dispose() }
    }, 'personal-workbench: management owner')
  })
  let roleHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/personal-workbench/roles', handler: (req, res) => {
    if (roleHandler) { void roleHandler(req, res); return }
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: 'Teacher role services unavailable' }))
  } }), 'personal-workbench: optional role route')
  ctx.inject(['storageDomain', 'sessionController', 'sessionPersistence', 'agentPresets', 'skills', 'connection'], child => {
    child.effect(async function* () {
      try {
        const { installRoles } = await import('./role-host.ts')
        const owner = await installRoles(child)
        roleHandler = owner.handle
        yield async () => { roleHandler = undefined; await owner.dispose() }
      } catch (error) {
        child.logger.warn('Teacher role integration unavailable: %s', error instanceof Error ? error.message : 'activation failed')
      }
    }, 'personal-workbench: optional role owner')
  })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/personal-workbench/teacher',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ version: 1, sessionId: config.teacherSessionId }))
    },
  }), 'personal-workbench: teacher association')
}

export type { AppRecipe, RecipeRecord, RecipeModule, PersonalWorkbenchRecipes, RecipeModuleDefinition } from './recipe-api.ts'

export type { CapabilityCatalog } from './capability-catalog.ts'
export { withCapabilityCatalog } from './capability-catalog.ts'
