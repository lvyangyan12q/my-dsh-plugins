import type {AppRecipe} from './recipe-api.ts'
/** Generated recipes may use only capabilities offered for this generation. */
export function validateGenerationRoles(recipe:AppRecipe,catalog:{roles:{presetId:string;skillNames:string[]}[]}){
 for(const role of recipe.roles){const allowed=catalog.roles.find(item=>item.presetId===role.presetId)
  if(!allowed||role.skillNames.some(name=>!allowed.skillNames.includes(name)))throw new Error('Role or Skill outside generation catalog: '+role.id)
 }
}
