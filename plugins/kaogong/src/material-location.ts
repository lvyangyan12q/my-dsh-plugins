import * as fs from 'node:fs/promises'
import {isAbsolute,resolve} from 'node:path'
import {fingerprint} from './legacy-adoption-plan.ts'
import type {LegacyMaterialEvidence} from './legacy-material-evidence.mjs'
import {createMaterialLocationIO,type MaterialLocationMap} from './material-location-map.mjs'

/** Private plan-owned receipt. Original evidence is retained verbatim, never rebased. */
export type MaterialLocation={map:MaterialLocationMap;originalEvidence:LegacyMaterialEvidence}
function fail():never{throw Error('MATERIAL_LOCATION_PROOF_MISMATCH')}
function validate(location:MaterialLocation){
 const {map,originalEvidence:evidence}=location,{evidenceHash,...body}=evidence
 if(evidence.format!=='kaogong-legacy-material-evidence'||evidence.formatVersion!==1||fingerprint(body)!==evidenceHash||map.sourceEvidenceHash!==evidenceHash||map.aliases.length!==evidence.sourceAliases.length)fail()
 const seen=new Set<string>()
 for(const alias of map.aliases){
  const key=resolve(alias.declaredPath).toLowerCase();if(seen.has(key))fail();seen.add(key)
  const original=evidence.sourceAliases.find(row=>resolve(row.declaredPath).toLowerCase()===key)
  const file=evidence.files.find(row=>row.resolvedPath===original?.resolvedPath)
  if(!original||!file||file.relativePath!==alias.relativePath||file.sha256!==alias.sha256)fail()
 }
}
/** Called only by an explicit new preview. Later reads use the receipt, not mutable configuration files. */
export async function captureMaterialLocation(input:{mapFile?:string;evidenceFile?:string;materialRoot?:string}):Promise<MaterialLocation|undefined>{
 if(!input.mapFile&&!input.evidenceFile)return undefined
 if(!input.mapFile||!input.evidenceFile||!input.materialRoot||![input.mapFile,input.evidenceFile,input.materialRoot].every(isAbsolute))fail()
 const map=JSON.parse(await fs.readFile(input.mapFile,'utf8')) as MaterialLocationMap
 const original=JSON.parse(await fs.readFile(input.evidenceFile,'utf8')) as LegacyMaterialEvidence|{evidence:LegacyMaterialEvidence}
 const location={map,originalEvidence:'evidence'in original?original.evidence:original}
 await materialLocationIO(location)
 if(await fs.realpath(input.materialRoot)!==await fs.realpath(map.root))fail()
 return location
}
export async function materialLocationIO(location?:MaterialLocation){
 if(!location)return fs
 validate(location)
 return createMaterialLocationIO(location.map)
}
/** Coverage and byte receipts must agree; path and root identities remain separately recorded. */
export function assertRelocatedEvidence(location:MaterialLocation|undefined,evidence?:LegacyMaterialEvidence){
 if(!location)return
 validate(location)
 if(!evidence||resolve(evidence.requestedMaterialRoot)!==resolve(location.map.root))fail()
 const old=location.originalEvidence
 const semantic=(proof:LegacyMaterialEvidence)=>({entries:proof.entries,privateEntries:proof.privateEntries,manifestRelativePath:proof.manifestRelativePath,manifestSha256:proof.manifestSha256,files:proof.files.map(({relativePath,sha256})=>({relativePath,sha256}))})
 if(fingerprint(semantic(old))!==fingerprint(semantic(evidence)))fail()
}
