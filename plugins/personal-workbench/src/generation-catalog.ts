import type {AppRecipe} from './recipe-api.ts'
/** Generated recipes may use only capabilities offered for this generation. */
export function validateGenerationRoles(recipe:AppRecipe,catalog:{roles:{presetId:string;skillNames:string[]}[]}){
 for(const role of recipe.roles){const allowed=catalog.roles.find(item=>item.presetId===role.presetId)
  if(!allowed||role.skillNames.some(name=>!allowed.skillNames.includes(name)))throw new Error('Role or Skill outside generation catalog: '+role.id)
 }
}

function suppliedPath(path:string,requirement:string){
 // Bare nouns are not bindings; compare complete quoted, labelled or slash-containing paths.
 const quoted=[...requirement.matchAll(/["'`]([^"'`]+)["'`]/g)].map(match=>match[1])
 const labelled=[...requirement.matchAll(/(?:目录|路径|文件|directory|folder|file|path|basePath|HTML)\s*[:：=]?\s*["'`]?([^\s"'`，。；、）)\]}]+)/gi)].map(match=>match[1])
 const tokens=requirement.split(/[\s"'`<>，。；、：:=（）()\[\]{}]+/).filter(token=>token.includes('/'))
 const suffixLabelled=[...requirement.matchAll(/(?:^|[\s"'`，。；、：:=（(\[{])([^\s"'`，。；、）)\]}]+?)\s*(?:目录|路径|文件|directory|folder|file)(?=$|[\s"'`，。；、）)\]}])/gi)].map(match=>match[1])
 const filenames=requirement.split(/[\s"'`<>，。；、：:=（）()\[\]{}]+/).filter(token=>/\.html?$/i.test(token))
 return [...quoted,...labelled,...suffixLabelled,...tokens,...filenames].includes(path)
}
function suppliedUrls(requirement:string){
 const urls=new Set<string>()
 for(const match of requirement.matchAll(/https?:\/\/[^\s<>"'`，。；、）)\]}]+/gi)){
  for(const value of [match[0],match[0].replace(/[.,;!?]+$/,'')])try{urls.add(new URL(value).href)}catch{}
 }
 return urls
}
/** A structural draft must not turn contract examples into claimed user resources. */
export function validateGenerationInputs(recipe:AppRecipe,requirement:string){
 const urls=suppliedUrls(requirement)
 for(const page of recipe.pages)for(const module of page.modules){
  const config=module.config
  if(['website','animation'].includes(module.type)||module.type==='custom'&&config.mode==='url'){
   if(typeof config.url==='string'&&!urls.has(new URL(config.url).href))throw new Error('Website address not supplied in requirements: '+module.id+'; leave an empty slot for configuration')
  }
  const path=module.type==='resources'?config.basePath:module.type==='custom'&&config.mode==='file'?config.path:undefined
  if(typeof path==='string'&&path&&!suppliedPath(path,requirement))throw new Error('Resource path not supplied in requirements: '+module.id+'; leave an empty slot for configuration')
 }
}
