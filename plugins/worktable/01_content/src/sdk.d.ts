import type {ComponentType} from 'react'
export const PROTOCOL_VERSION:1
export interface ProtocolDescriptor {protocolVersion:number;features:string[]}
export function describeProtocol():ProtocolDescriptor
export function requireProtocol(value:unknown,required?:readonly string[]):ProtocolDescriptor
export interface ProtocolService {describe():ProtocolDescriptor}
export interface ApplicationDefinition {id:string;title:string;version:string;protocolVersion:1;kind:'deep';views:{id:string;title:string}[]}
export interface Application extends ApplicationDefinition {enabled?:boolean;lifecycleRevision?:number}
export interface ApplicationInstance {id:string;appId:string;projectId:string|null;revision:number}
export interface ApplicationView {id:string;instanceId:string;type:string}
export type Disposer=()=>void|Promise<void>
export interface ApplicationDirectory {
 contribute(definition:ApplicationDefinition):Promise<Disposer>
 snapshot():Promise<{applications:Application[];instances:ApplicationInstance[];views:ApplicationView[]}>
 createInstance(appId:string,projectId:string|null):Promise<ApplicationInstance>
 createView(instanceId:string,viewType?:string):Promise<ApplicationView>
 resolveView(viewId:string):Promise<{application:Application;instance:ApplicationInstance;view:ApplicationView}>
 setEnabled?(appId:string,enabled:boolean,revision:number):Promise<unknown>
}
export type CapabilityRef={kind:'agent'|'skill';id:string}&({source:'managed'}|{source:'application';ownerAppId:string})
export interface PrivateCapability {kind:'agent'|'skill';id:string;title:string;presetId?:string;provider?:string;enabled:boolean;userInvocable:boolean;modelInvocable:boolean}
export interface CapabilityDirectory {contribute(appId:string,definitions:PrivateCapability[]):Disposer;list(appId?:string):Promise<unknown[]>}
export interface RoleDefinition {id:string;title:string;agent:CapabilityRef;creation:{cwd:string};skills?:CapabilityRef[]}
export interface RoleDirectory {contribute(appId:string,definitions:RoleDefinition[]):Disposer}
export interface ResourceValue {revision:string}
export interface ResourceOwner<T extends ResourceValue=ResourceValue> {
 appId:string;resourceId:string;actions:string[]
 read(ownerInstanceId:string,payload?:unknown):T|Promise<T>
 mutate?(ownerInstanceId:string,action:string,payload:unknown,expectedRevision:string,authorize:()=>Promise<void>):Promise<T>
 taskContext?(value:T,selection:unknown):{title:string;text:string}|Promise<{title:string;text:string}>
 withTaskLease?<R>(operation:()=>Promise<R>):Promise<R>
}
export interface ResourceDirectory {register<T extends ResourceValue>(owner:ResourceOwner<T>):Disposer}
export interface TaskContextRef {resourceId:string;selection?:unknown}
export interface TaskFacade {prepare(input:{roleId:string;text:string;contexts?:TaskContextRef[]}):Promise<unknown>}
export interface RoleFacade {read(roleId:string):Promise<unknown>;ensure(roleId:string,agent?:CapabilityRef):Promise<unknown>;retry(roleId:string,sessionId:string,revision:number):Promise<unknown>;replace(roleId:string,sessionId:string,revision:number,agent?:CapabilityRef):Promise<unknown>;open(roleId:string,sessionId:string,revision:number):Promise<void>}
export interface ApplicationViewProps {application:Application;instance:ApplicationInstance;view:ApplicationView;roles?:RoleFacade;tasks?:TaskFacade}
export interface ApplicationViews extends ProtocolService {register(appId:string,views:Record<string,ComponentType<ApplicationViewProps>>):Disposer}
/** Optional Cordis services. Inject before use; absence is not permission to invent a fallback. */
declare module '@deepseek-ai/cordis' {interface Context {
 worktableProtocol:ProtocolService
 worktableApplications:ApplicationDirectory
 worktableApplicationViews:ApplicationViews
 worktableResources:ResourceDirectory
 worktableRoles:RoleDirectory
 worktableCapabilities:CapabilityDirectory
}}
