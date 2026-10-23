export const applicationCss=`
.dsh-wt_taskPanel,.dsh-wt_rolePanel{flex:none;box-sizing:border-box;max-height:48%;overflow:auto;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#ccc)}
.dsh-wt_taskPanel>summary,.dsh-wt_rolePanel>summary{cursor:pointer;font-weight:600;padding:4px 0}
.dsh-wt_taskPanel .dsh-wt_appCard{margin:10px 0}
.dsh-wt_taskPanel textarea{min-height:72px;resize:vertical}

.dsh-wt_appPanel{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:18px;min-width:0;overflow:auto;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-bg-layer-1,#fff);font-size:13px}
.dsh-wt_appPanel button,.dsh-wt_application button{font:inherit;border:1px solid var(--dsw-alias-border-l2,#565c68);border-radius:6px;padding:6px 10px;background:var(--dsw-alias-bg-layer-3,#f2f2f2);color:var(--dsw-alias-label-primary,#222);cursor:pointer}
.dsh-wt_appPanel button:disabled,.dsh-wt_application button:disabled{opacity:.5;cursor:default}
.dsh-wt_appPanel .dsh-wt_appPrimary{background:var(--dsw-alias-button-primary-fill,#4566b0);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:transparent}
.dsh-wt_appPanel button:hover:not(:disabled),.dsh-wt_application button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#e8e8e8)}
.dsh-wt_appPanel .dsh-wt_appPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#34549b)}
.dsh-wt_appPanel :is(button,input,select,textarea):focus-visible,.dsh-wt_application :is(button,input,select,textarea):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4566b0);outline-offset:2px}
.dsh-wt_appLine{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.dsh-wt_appHint{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#9da5b2);margin:0}
.dsh-wt_appCard{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l2,#414754);border-radius:8px}
.dsh-wt_appCard small{opacity:.7;overflow-wrap:anywhere}
.dsh-wt_appForm{display:flex;flex-direction:column;gap:12px;padding:12px 0}
.dsh-wt_appForm label,.dsh-wt_appDetails label{display:flex;flex-direction:column;gap:6px}
.dsh-wt_appPanel input,.dsh-wt_appPanel select,.dsh-wt_appPanel textarea,.dsh-wt_application input,.dsh-wt_application select,.dsh-wt_application textarea{box-sizing:border-box;width:100%;min-width:0;padding:8px 10px;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#565c68);border-radius:6px;font:inherit}
.dsh-wt_appPanel summary,.dsh-wt_appToolbar summary{cursor:pointer;padding:6px 0}
.dsh-wt_appError{color:var(--dsw-alias-label-error,#d97c71);padding:10px;overflow-wrap:anywhere}
.dsh-wt_application{height:100%;display:flex;flex-direction:column;min-height:0;min-width:0;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-bg-layer-1,#fff);font-size:12px}
.dsh-wt_application>.dsh-wt_appHint{padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#303640)}
.dsh-wt_application>.dsh-wt_paneFrame{flex:1;min-height:0}
.dsh-wt_appToolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#303640)}
.dsh-wt_appToolbar>span{flex:1;min-width:110px}.dsh-wt_appToolbar a{color:var(--dsw-alias-link,#91b4ff);text-decoration:underline}
.dsh-wt_appDetails{display:flex;flex-direction:column;gap:10px;min-width:180px;max-width:320px;padding:10px;border:1px solid var(--dsw-alias-border-l2,#414754);border-radius:6px}.dsh-wt_appDetails small{overflow-wrap:anywhere}
.dsh-wt_appBackdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:20px;pointer-events:auto}
.dsh-wt_appDialog{width:min(460px,100%);max-height:80vh;overflow:auto;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#565c68);box-shadow:0 16px 60px rgba(0,0,0,.3)}
`
