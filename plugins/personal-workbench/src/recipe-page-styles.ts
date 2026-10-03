/** Built-in template modules share one skin; installed custom modules and native chat remain owned by their plugins. */
export const recipePageStyles=`
.pwb-recipe-page{padding:16px;color:var(--pwb-ink,#2e2b26);font:13px/1.5 system-ui,sans-serif}
.pwb-recipe-module:is([data-module-type=stats],[data-module-type=list],[data-module-type=filter],[data-module-type=detail]){padding:16px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:8px;background:var(--pwb-paper,#fdfcf9)}
.pwb-recipe-page[data-layout=split]>.pwb-recipe-module:is([data-module-type=filter],[data-module-type=stats]){grid-column:1/-1}
.pwb-recipe-module>h3{margin:0 0 12px;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.pwb-recipe-module>.pwb-display-filter{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px}
.pwb-recipe-module>.pwb-display-filter label{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px}
.pwb-recipe-module>.pwb-display-filter :is(input,select){box-sizing:border-box;width:100%;min-width:0;min-height:38px;padding:8px 10px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:6px;background:var(--pwb-canvas,#f7f5f0);color:inherit;font:inherit}
.pwb-recipe-module>.pwb-display-stats{margin:0;gap:12px!important}
.pwb-recipe-module>.pwb-display-stats>div{flex:1;min-width:100px;padding:12px;background:var(--pwb-canvas,#f7f5f0);border-radius:6px}
.pwb-recipe-module>.pwb-display-stats dt{font-size:12px;color:var(--pwb-muted,#736c62)}
.pwb-recipe-module>.pwb-display-stats dd{margin:4px 0 0;font-size:24px;font-weight:600}
.pwb-recipe-module>.pwb-display-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.pwb-recipe-module>.pwb-display-list li{display:flex;flex-direction:column;gap:4px;min-width:0;padding-bottom:8px;border-bottom:1px solid var(--pwb-line,#d7d0c5)}
.pwb-recipe-module>.pwb-display-list li>span{font-size:12px;color:var(--pwb-muted,#736c62)}
.pwb-recipe-module>.pwb-display-list button{text-align:left;justify-content:flex-start;white-space:normal;overflow-wrap:anywhere}
.pwb-recipe-module>.pwb-display-list button[aria-pressed=true]{border-color:var(--pwb-accent,#a44c32)!important;background:var(--pwb-accent-soft,#f3e5dc)!important}
.pwb-recipe-module>.pwb-display-detail h4{font-size:14px;margin:0 0 8px}
.pwb-recipe-module>.pwb-display-detail dl{margin:0}
.pwb-recipe-module>.pwb-display-detail dl>div{display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2fr);gap:12px;padding:8px 0;border-bottom:1px solid var(--pwb-line,#d7d0c5)}
.pwb-recipe-module>.pwb-display-detail dt{color:var(--pwb-muted,#736c62);overflow-wrap:anywhere}
.pwb-recipe-module>.pwb-display-detail dd{margin:0;overflow-wrap:anywhere}
`
