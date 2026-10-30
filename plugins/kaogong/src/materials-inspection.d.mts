import type {MaterialSnapshot} from './materials-plan.ts'
import type {LegacyInspectionSnapshot} from './legacy-adoption-plan.ts'
export function inspectMaterials(input:{home:string;io?:unknown}):Promise<{snapshot:MaterialSnapshot;summary:{status:string;counts:{bank:number;knowledge:number;notesRetainedAtSource:number};sourceRevision:string}}>
export function materialEvidenceSnapshot(snapshot:MaterialSnapshot):LegacyInspectionSnapshot
