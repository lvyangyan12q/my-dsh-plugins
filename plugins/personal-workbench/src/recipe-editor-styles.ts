/** Editor-only form styles, independent from generated application previews. */
export const recipeEditorStyles = `
.pwb-recipe-editor{min-width:0;margin:14px 0 20px;padding:16px 20px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:10px;background:var(--pwb-paper,#fdfcf9)}
.pwb-recipe-editor>summary{font-size:15px;font-weight:600;cursor:pointer;padding:2px 0}
.pwb-recipe-editor p{overflow-wrap:anywhere}
.pwb-recipe-help,.pwb-generation-editor>p{margin:10px 0 16px;color:var(--pwb-muted,#736c62);font-size:13px;line-height:1.6}
.pwb-recipe-toolbar,.pwb-generation-actions,.pwb-recipe-steps,.pwb-recipe-navigation{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.pwb-recipe-toolbar{margin:12px 0 18px}
.pwb-recipe-toolbar select{flex:1;min-width:180px;max-width:360px}
.pwb-generation-editor{min-width:0;margin:16px 0;padding:18px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:8px;background:var(--pwb-canvas,#f7f5f0)}
.pwb-generation-editor h3{margin:0;font-size:15px;font-weight:600}
.pwb-generation-field,.pwb-recipe-editor>fieldset label,.pwb-recipe-advanced label{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px;font-weight:500;margin:10px 0}
.pwb-generation-editor textarea,.pwb-recipe-editor>fieldset input:not([type=checkbox]),.pwb-recipe-editor>fieldset select,.pwb-recipe-toolbar select,.pwb-recipe-advanced textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--pwb-line,#d7d0c5);border-radius:6px;background:var(--pwb-paper,#fdfcf9);color:var(--pwb-ink,#2e2b26);padding:9px 11px;font:400 13px/1.6 system-ui,sans-serif}
.pwb-recipe-editor>fieldset input:not([type=checkbox]),.pwb-recipe-editor>fieldset select,.pwb-recipe-toolbar select{min-height:40px}
.pwb-generation-editor textarea{display:block;min-height:140px;resize:vertical}
.pwb-generation-actions{margin-top:12px}
.pwb-recipe-editor>fieldset{min-inline-size:0;min-width:0;margin:16px 0;padding:16px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:8px}
.pwb-recipe-editor>fieldset fieldset{min-inline-size:0;margin:14px 0;padding:14px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:7px;background:var(--pwb-canvas,#f7f5f0)}
.pwb-recipe-connection-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:10px 0;border-bottom:1px solid var(--pwb-line,#d7d0c5)}
.pwb-recipe-connection-row span{min-width:0;overflow-wrap:anywhere}
.pwb-recipe-editor>fieldset:not(:has(>legend)){border:0;padding:0}
.pwb-recipe-editor>fieldset legend{padding:0 6px;font-size:13px;font-weight:600;overflow-wrap:anywhere}
.pwb-recipe-editor>fieldset label:has(>input[type=checkbox]){display:inline-flex;flex-direction:row;align-items:center;gap:6px;margin:8px 18px 8px 0}
.pwb-recipe-editor input[type=checkbox]{accent-color:var(--pwb-accent,#a44c32)}
.pwb-recipe-steps{padding:12px 0;border-bottom:1px solid var(--pwb-line,#d7d0c5)}
.pwb-recipe-steps button[aria-current=step]{background:var(--pwb-accent-soft,#f3e5dc)!important;border-color:var(--pwb-accent,#a44c32)!important;color:var(--pwb-accent,#a44c32)!important}
.pwb-recipe-advanced{margin:16px 0;padding:12px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:7px}
.pwb-recipe-advanced summary{cursor:pointer;font-size:13px}
.pwb-recipe-advanced textarea{font-family:ui-monospace,Consolas,monospace;resize:vertical}
.pwb-recipe-editor>button{margin:4px 8px 4px 0}
.pwb-recipe-navigation{margin-top:16px;padding-top:14px;border-top:1px solid var(--pwb-line,#d7d0c5)}
.pwb-recipe-navigation span{flex:1;text-align:center;font-size:12px;color:var(--pwb-muted,#736c62)}
.pwb-recipe-editor [role=alert]{padding:10px 12px;border:1px solid #d5a99c;border-radius:6px;background:#fbefea;color:#923c2c;font-size:13px}
.pwb-recipe-editor :is(textarea,input,select):focus-visible{outline:2px solid var(--pwb-accent,#a44c32);outline-offset:1px}
.pwb-generation-disclosure{margin:12px 0;padding:10px 12px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:7px}
.pwb-generation-disclosure>summary{cursor:pointer;font-size:13px;font-weight:500}
.pwb-generation-disclosure .pwb-generation-editor{border:0;margin:0;padding:12px 0 0;background:transparent}
.pwb-generation-disclosure .pwb-generation-editor h3{display:none}
.pwb-recipe-editor>fieldset.pwb-recipe-basics{display:grid;grid-template-columns:minmax(0,1fr) 140px;column-gap:16px;row-gap:4px;padding:12px 16px}
.pwb-recipe-basics>.pwb-recipe-description{grid-column:1/-1;grid-row:2}
.pwb-recipe-basics>fieldset,.pwb-recipe-basics>button{grid-column:1/-1}
.pwb-recipe-basics>label{margin:4px 0!important}
.pwb-recipe-basics>button{justify-self:start}
.pwb-recipe-editor>fieldset .pwb-recipe-page-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(140px,220px);column-gap:16px;margin:10px 0;padding:10px 14px}
.pwb-recipe-page-form>label{margin:4px 0!important}
.pwb-recipe-navigation{position:sticky;bottom:0;z-index:1;margin:12px -20px -16px;padding:12px 20px;background:var(--pwb-paper,#fdfcf9);border-radius:0 0 10px 10px;box-shadow:0 -4px 10px #00000008}
@media(max-width:700px){.pwb-recipe-editor>fieldset.pwb-recipe-basics,.pwb-recipe-editor>fieldset .pwb-recipe-page-form{grid-template-columns:minmax(0,1fr)}.pwb-recipe-basics>.pwb-recipe-description{grid-row:auto}.pwb-recipe-navigation{margin-left:-12px;margin-right:-12px;margin-bottom:-12px;padding:10px 12px}.pwb-recipe-navigation span{flex-basis:100%;order:4}}
.pwb-starter-picker,.pwb-plugin-templates{margin:16px 0}
.pwb-starter-picker h3,.pwb-plugin-templates h3{font-size:13px;font-weight:600;margin:0 0 6px}
.pwb-starter-picker>p{font-size:12px;color:var(--pwb-muted);margin:0 0 12px}
.pwb-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}
.pwb-template-grid button[data-pwb-button]{display:flex;flex-direction:column;align-items:stretch;text-align:left;padding:12px!important;white-space:normal;min-width:0}
.pwb-template-grid button[aria-pressed=true]{border-color:var(--pwb-accent)!important;background:var(--pwb-accent-soft)!important}
.pwb-template-grid strong{font-size:13px;font-weight:600}
.pwb-template-grid small{font-size:12px;line-height:1.5;color:var(--pwb-muted);font-weight:400}
.pwb-layout-thumbnail{display:grid;gap:4px;height:64px;padding:6px;border:1px solid var(--pwb-line);border-radius:5px;background:var(--pwb-canvas)}
.pwb-layout-thumbnail>span{min-width:0;border:1px solid var(--pwb-line);border-radius:3px;background:var(--pwb-paper)}
.pwb-layout-thumbnail[data-layout=grid]{grid-template-columns:1fr 1fr}
.pwb-layout-thumbnail[data-layout=split]{grid-template-columns:1fr 1.5fr}
.pwb-layout-thumbnail[data-layout=stack]{grid-template-rows:repeat(3,1fr)}
.pwb-template-switch{margin:10px 0;font-size:12px;color:var(--pwb-muted)}
.pwb-template-switch summary{cursor:pointer;margin-bottom:8px}
@media(max-width:700px){.pwb-recipe-editor{padding:12px}.pwb-generation-editor{padding:12px}.pwb-recipe-toolbar select{max-width:none;flex-basis:100%}}

.pwb-recipe-editor .pwb-module-editor{grid-column:1/-1;min-width:0}.pwb-recipe-editor .pwb-module-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px}.pwb-recipe-editor .pwb-module-card label{min-width:0}.pwb-recipe-editor .pwb-module-card textarea{width:100%;min-height:90px}.pwb-recipe-editor .pwb-module-card small{font-size:12px;color:#776d63}@media(max-width:650px){.pwb-recipe-editor .pwb-module-card{grid-template-columns:1fr}}
`