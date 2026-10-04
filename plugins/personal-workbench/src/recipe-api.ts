import type {PageTemplate} from './page-template.ts'
import type {} from '@deepseek-ai/cordis'
export interface RecipeModule { id: string; type: string; title: string; connectionId?: string; roleId?: string; config: Record<string, string | number | boolean | null> }
export interface AppRecipe { schemaVersion: 1; workspace?: string; appId: string; version: number; name: string; description: string; pages: { id: string; label: string; layout: 'stack' | 'grid' | 'split'; splitPercent?: number; modules: RecipeModule[] }[]; connections: { id: string; sourceAppId: string; resource: string }[]; roles: { id: string; name: string; presetId: string; skillNames: string[] }[] }
export interface RecipeRecord { appId: string; revision: number; draft: AppRecipe; running?: AppRecipe }
export type RecipeRequest = {action:'templates'} | {action:'save-template';label:string;page:AppRecipe['pages'][number]} | { action: 'catalog' } | { action: 'workspaces' } | { action: 'save'; expectedRevision: number; recipe: AppRecipe } | { action: 'preview' | 'activate'; appId: string; expectedRevision: number }
export interface RecipeModuleDefinition { id: string; validate?: (module: RecipeModule, recipe: AppRecipe) => string[] }
export interface GenerationCatalog { moduleExamples: Pick<RecipeModule,'type'|'config'>[]; workspaces: string[]; layouts: string[]; modules: string[]; connections: {appId:string;resource:string}[]; roles: {presetId:string;skillNames:string[]}[] }
export interface PersonalWorkbenchRecipes { listTemplates?():PageTemplate[]; saveTemplate?(label:string,page:AppRecipe['pages'][number]):Promise<PageTemplate>; generationCatalog(): Promise<GenerationCatalog>; saveGenerated(recipe: AppRecipe, expectedRevision: number, signal?: AbortSignal): Promise<RecipeRecord>; list(): RecipeRecord[]; save(recipe: AppRecipe, expectedRevision: number): Promise<RecipeRecord>; preview(appId: string, expectedRevision: number): Promise<AppRecipe>; activate(appId: string, expectedRevision: number): Promise<RecipeRecord>; reserveAppId(appId: string): () => void; registerModule(definition: RecipeModuleDefinition): () => void; registerDataSource(source: { appId: string; resource: string }): () => void }
declare module '@deepseek-ai/cordis' { interface Context { personalWorkbenchRecipes: PersonalWorkbenchRecipes } }

/** Includes catalogue readers captured by the recipe service closures. */
export const recipeHostDependencies=['storageDomain','connection','agentPresets','skills','workspaceRegistry']
