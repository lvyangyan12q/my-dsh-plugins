import type {ComponentType,ReactNode,createElement} from 'react'
export const PROTOCOL_VERSION:1
export interface ProtocolDescriptor {protocolVersion:number;features:string[]}
export function describeProtocol():ProtocolDescriptor
export function requireProtocol(value:unknown,required?:readonly string[]):ProtocolDescriptor
export interface ProtocolService {describe():ProtocolDescriptor}
export interface ApplicationDefinition {id:string;title:string;version:string;protocolVersion:1;kind:'deep';views:{id:string;title:string}[]}
export interface DeepApplication extends ApplicationDefinition {composition?:boolean;enabled?:boolean;lifecycleRevision?:number}
export interface WebApplication {id:string;title:string;version:string;protocolVersion:1;kind:'web';url:string;enabled?:boolean;lifecycleRevision?:number}
export type Application=DeepApplication|WebApplication
export interface ApplicationInstance {id:string;appId:string;projectId:string|null;revision:number}
export interface ApplicationView {id:string;instanceId:string;type:string}
export type Disposer=()=>void|Promise<void>
export interface ApplicationDirectory {
 contribute(definition:ApplicationDefinition):Promise<Disposer>
 snapshot():Promise<{applications:Application[];instances:ApplicationInstance[];views:ApplicationView[]}>
 createInstance(appId:string,projectId:string|null):Promise<ApplicationInstance>
 createView(instanceId:string,viewType?:string):Promise<ApplicationView>
 resolveView(viewId:string):Promise<{application:Application;instance:ApplicationInstance;view:ApplicationView}>
 setEnabled?(appId:string,enabled:boolean,revision:number):Promise<{appId:string;enabled:boolean;revision:number}>
}
/** Opt-in, owner-executed migration. inspect must be read-only and safe under a resource authorization callback (no recursive business-lease acquisition). */
export interface MigrationInspection {dataVersion:string;revision:string}
export interface MigrationSource {appId:string;instanceId:string;fromApplicationVersion:string;toApplicationVersion:string;fromDataVersion:string;dataRevision:string}
export interface MigrationProposal extends MigrationSource {toDataVersion:string;impact:string;irreversible:boolean;recovery:string}
export interface MigrationPlan extends MigrationProposal {id:string;viewId:string;revision:number;status:'prepared'|'executing'|'unknown'|'applied'|'failed'|'recovering'|'recovered'|'discarded';notice?:string}
export interface MigrationOwner {
 applicationVersions:string[]
 inspect(instanceId:string):MigrationInspection|Promise<MigrationInspection>
 plan(source:MigrationSource):MigrationProposal|Promise<MigrationProposal>
 /** Must atomically validate expected dataRevision under its business lease before writes. */
 execute(plan:MigrationPlan):Promise<void>
 /** Explicit recovery must validate recoveryDataRevision and prove an old or target version endpoint. */
 recover?(plan:MigrationPlan&{recoveryDataRevision:string}):Promise<{applicationVersion:string}>
}
export interface MigrationDirectory {contribute(appId:string,owner:MigrationOwner):Disposer}
/** Optional Host-owned generation; user interfaces prepare native tasks and explicitly preview/apply draft only. No direct model-send authority. */
export interface GenerationTarget {projectId:string|null;appId:string;instanceId:string;viewId:string;pageId:string;moduleId:string;recipeVersion:string;recipeRevision:number;runningVersion:string;moduleFingerprint:string}
export interface GenerationDescriptor {id:string;target:GenerationTarget;taskId?:string;sessionId:string;root:string;manifestPath:string;status:'preparing'|'prepared'|'preview'|'applying'|'applied'|'revoked'}
export interface GenerationDirectory {list(viewId:string):Promise<GenerationDescriptor[]>}
export type CapabilityRef={kind:'agent'|'skill';id:string}&({source:'managed'}|{source:'application';ownerAppId:string})
export type PrivateCapability={id:string;title:string;enabled:boolean;userInvocable:boolean;modelInvocable:boolean}&({kind:'agent';presetId:string}|{kind:'skill';provider:string})
export interface CapabilityDirectory {contribute(appId:string,definitions:PrivateCapability[]):Disposer;list(appId?:string):Promise<unknown[]>}
export interface RoleDefinition {id:string;title:string;agent:CapabilityRef&{kind:'agent'};creation:{cwd:string};skills?:(CapabilityRef&{kind:'skill'})[]}
export interface RoleDirectory {contribute(appId:string,definitions:RoleDefinition[]):Disposer}
export interface ResourceValue {revision:string}
export interface ResourceDescriptor {title:string;recordsField?:string}
export interface ResourceOwner<T extends ResourceValue=ResourceValue> {
 descriptor?:ResourceDescriptor
 appId:string;resourceId:string;actions:string[]
 read(ownerInstanceId:string,payload?:unknown):T|Promise<T>
 mutate?(ownerInstanceId:string,action:string,payload:unknown,expectedRevision:string,authorize:()=>Promise<void>):Promise<T>
 taskContext?(value:T,selection:unknown):{title:string;text:string}|Promise<{title:string;text:string}>
 withTaskLease?<R>(operation:()=>Promise<R>):Promise<R>
}
export interface ResourceDirectory {register<T extends ResourceValue>(owner:ResourceOwner<T>):Disposer;catalog?():Promise<{appId:string;appTitle:string;instanceId:string;projectId:string|null;viewId:string;resourceId:string;descriptor?:ResourceDescriptor}[]>}
export interface TaskContextRef {resourceId:string;selection?:unknown}
export interface TaskFacade {prepare(input:{roleId:string;text:string;contexts?:TaskContextRef[]}):Promise<unknown>}
export interface RoleFacade {read(roleId:string):Promise<unknown>;ensure(roleId:string,agent?:CapabilityRef&{kind:'agent'}):Promise<unknown>;retry(roleId:string,sessionId:string,revision:number):Promise<unknown>;replace(roleId:string,sessionId:string,revision:number,agent?:CapabilityRef&{kind:'agent'}):Promise<unknown>;open(roleId:string,sessionId:string,revision:number):Promise<void>}
export interface ApplicationViewProps {application:DeepApplication;instance:ApplicationInstance;view:ApplicationView;roles?:RoleFacade;tasks?:TaskFacade}
export interface ApplicationViews extends ProtocolService {register(appId:string,views:Record<string,ComponentType<ApplicationViewProps>>):Disposer}
/** Optional Cordis services. Inject before use; absence is not permission to invent a fallback. */
declare module '@deepseek-ai/cordis' {interface Context {
 worktableProtocol:ProtocolService
 worktableApplications:ApplicationDirectory
 worktableMigrations:MigrationDirectory
 worktableGenerations:GenerationDirectory
 worktableApplicationViews:ApplicationViews
 worktableResources:ResourceDirectory
 worktableRoles:RoleDirectory
 worktableCapabilities:CapabilityDirectory
}}

/** Optional, local-only presentation. Inject the same React used by your application. */
export type PresentationRecord=object
export type PresentationPhase='loading'|'ready'|'error'
export interface PresentationStatus {phase?:PresentationPhase;error?:string;onRetry?:()=>void}
export interface PresentationMetric {id:string;label:string;aggregate:'count'|'sum'|'average';field?:string}
export interface PresentationMapping {id:string;title:string;description?:string;selectionLabel?:string}
export interface PresentationFilter {id:string;label:string;maxLength?:number;options?:{value:string;label:string}[]}
export interface PresentationComponents {
 Surface:ComponentType<{theme?:'inherit'|'light'|'dark';children?:ReactNode;label?:string}>
 State:ComponentType<PresentationStatus&{empty?:boolean;emptyText?:string}>
 Stats:ComponentType<PresentationStatus&{records?:PresentationRecord[];metrics?:PresentationMetric[]}>
 List:ComponentType<PresentationStatus&{records?:PresentationRecord[];mapping:PresentationMapping;selectedId?:string;onSelect?:(id:string)=>void;emptyText?:string}>
 Detail:ComponentType<PresentationStatus&{record?:PresentationRecord;fields?:{label:string;field:string}[];emptyText?:string}>
 Filters:ComponentType<{fields?:PresentationFilter[];values?:Record<string,string>;onChange?:(values:Record<string,string>)=>void}>
}
export function createPresentation(react:{createElement:typeof createElement}):Readonly<PresentationComponents>

/** Optional composition authoring. References describe dependencies, never grant resource access. */
export type CompositionModuleType='website'|'custom'|'conversation'|'animation'|'resources'|'statistics'|'list'|'detail'|'filter'
export interface CompositionRecipe {title:string;version:string;layout:'vertical'|'grid'|'split';pages:{id:string;title:string;modules:{id:string;type:CompositionModuleType;config?:Record<string,unknown>;connectionId?:string;roleId?:string}[]}[];connections?:{id:string;viewId:string;resourceId:string}[];roles?:RoleDefinition[]}
export interface CompositionRecord {appId:string;owner:'worktable-compositions';revision:number;draft:CompositionRecipe;running?:CompositionRecipe}
export interface CompositionRevision {appId:string;expectedRevision:number}
export interface CompositionPresentationState {instanceId:string;revision:number;scopes:Record<string,{filters:Record<string,string>;selectedId:string|null}>}
export function copyCompositionTemplate(recipe:CompositionRecipe):CompositionRecipe
export interface CompositionDirectory {
 readState(viewId:string):Promise<CompositionPresentationState>
 updateState(input:{viewId:string;expectedRevision:number;scopeId:string;filters:Record<string,string>;selectedId:string|null}):Promise<CompositionPresentationState>
 list():Promise<CompositionRecord[]>
 get(appId:string):Promise<CompositionRecord>
 save(input:CompositionRevision&{recipe:CompositionRecipe}):Promise<CompositionRecord>
 preview(input:CompositionRevision):Promise<{appId:string;revision:number;recipe:CompositionRecipe;definition:ApplicationDefinition}>
 activate(input:CompositionRevision):Promise<CompositionRecord>
}
declare module '@deepseek-ai/cordis' {interface Context {worktableCompositions:CompositionDirectory}}
