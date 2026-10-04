import type {RecipeModule} from './recipe-api.ts'
/** Model-facing examples of installed module contracts, never application output. */
export const generationModuleExamples:Pick<RecipeModule,'type'|'config'>[]=[
 {type:'empty',config:{}},
 {type:'website',config:{url:'https://example.com/'}},
 {type:'animation',config:{url:'https://example.com/animation'}},
 {type:'resources',config:{basePath:'relative/directory'}},
 {type:'custom',config:{mode:'url',url:'https://example.com/'}},
 {type:'custom',config:{mode:'file',path:'relative/page.html'}},
 {type:'custom',config:{mode:'generate',requirement:'Describe the page to generate'}},
 {type:'role-chat',config:{}},
 ...['stats','list','detail','filter'].map(type=>({type,config:{}})),
 {type:'chart',config:{valueField:'numericColumn'}},
 {type:'map',config:{latitudeField:'latitudeColumn',longitudeField:'longitudeColumn'}},
]
