import type {ComponentType} from 'react'
/** App-owned description of the optional frozen legacy adapter. Not a dependency on its runtime or generated declarations. */
export interface LegacyModule {id:string;type:string;title:string;connectionId?:string;config:Record<string,string|number|boolean|null>}
export interface AppRecipe {schemaVersion:1;appId:string;version:number;name:string;description:string;pages:{id:string;label:string;layout:'stack'|'grid'|'split';modules:LegacyModule[]}[];connections:{id:string;sourceAppId:string;resource:string}[];roles:{id:string;name:string;presetId:string;skillNames:string[]}[]}
export interface DisplayData {records:{id:string;title:string;subtitle?:string;fields:Record<string,string|number|boolean|null>}[];filters:{field:string;label:string}[];stats:{id:string;label:string;operation:'count'|'sum'|'average';field?:string}[]}
export interface LegacyContext {personalWorkbench?:{openApp(appId:string,instanceId:string):void}}
export interface LegacyRecipeService {registerDataSource(value:{appId:string;resource:string}):()=>void;registerModule(value:{id:string;validate(module:unknown,recipe:AppRecipe):string[]}):()=>void}
export interface LegacyClient {
 registerDisplaySource(value:{appId:string;resource:string;label:string;subscribe(scope:{instanceId:string;preview:boolean},notify:()=>void):()=>void;load(scope:{instanceId:string;preview:boolean;signal:AbortSignal}):Promise<DisplayData>}):()=>void
 registerRecipeTemplate(value:{id:string;label:string;create():Promise<AppRecipe>}):()=>void
 registerRecipeModuleRenderer(id:string,view:ComponentType<{appId:string;instanceId:string;preview:boolean;ctx?:LegacyContext}>,descriptor:{title:string;appIds:string[]}):()=>void
}
