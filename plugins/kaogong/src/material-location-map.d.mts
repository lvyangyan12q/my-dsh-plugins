import type * as fs from 'node:fs/promises'
export interface MaterialLocationMap {
 readonly format:'kaogong-material-location-map';readonly version:1;readonly root:string;readonly sourceEvidenceHash:string
 readonly aliases:readonly {readonly declaredPath:string;readonly relativePath:string;readonly sha256:string}[]
}
export function createMaterialLocationIO(map:MaterialLocationMap,io?:typeof fs):Promise<typeof fs>
