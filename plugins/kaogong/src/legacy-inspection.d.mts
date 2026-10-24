import type {LegacyInspectionSnapshot} from './legacy-adoption-plan.ts'
export function inspectLegacy(input:{home:string;provider?:string;io?:unknown}):Promise<{summary:{revision:string;counts:Record<string,number>};snapshot:LegacyInspectionSnapshot}>
export function writeLegacyInspection(input:{home:string;output:string;materialRoots?:string[];io?:unknown}):Promise<{revision:string;counts:Record<string,number>}>
