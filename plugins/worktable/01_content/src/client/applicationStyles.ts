export const applicationCss=`
.dsh-wt_appPanel{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:18px;min-width:0;overflow:auto;color:var(--dsw-alias-label-primary,#d6d9df);background:var(--dsw-alias-bg-base,#181a20);font-size:13px}
.dsh-wt_appPanel button,.dsh-wt_application button{font:inherit;border:1px solid var(--dsw-alias-border-l2,#565c68);border-radius:6px;padding:6px 10px;background:var(--dsw-alias-fill-l1,#272b33);color:inherit;cursor:pointer}
.dsh-wt_appPanel button:disabled,.dsh-wt_application button:disabled{opacity:.5;cursor:default}
.dsh-wt_appPanel .dsh-wt_appPrimary{background:var(--dsw-alias-button-primary-bg,#4566b0);color:#fff;border-color:transparent}
.dsh-wt_appLine{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.dsh-wt_appHint{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#9da5b2);margin:0}
.dsh-wt_appCard{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l2,#414754);border-radius:8px}
.dsh-wt_appCard small{opacity:.7;overflow-wrap:anywhere}
.dsh-wt_appForm{display:flex;flex-direction:column;gap:12px;padding:12px 0}
.dsh-wt_appForm label,.dsh-wt_appDetails label{display:flex;flex-direction:column;gap:6px}
.dsh-wt_appForm input,.dsh-wt_appDetails select{box-sizing:border-box;width:100%;min-width:0;padding:8px 10px;color:inherit;background:var(--dsw-alias-bg-base,#181a20);border:1px solid var(--dsw-alias-border-l2,#565c68);border-radius:6px;font:inherit}
.dsh-wt_appPanel summary,.dsh-wt_appToolbar summary{cursor:pointer;padding:6px 0}
.dsh-wt_appError{color:var(--dsw-alias-label-error,#d97c71);padding:10px;overflow-wrap:anywhere}
.dsh-wt_application{height:100%;display:flex;flex-direction:column;min-height:0;min-width:0;color:var(--dsw-alias-label-primary,#d6d9df);background:var(--dsw-alias-bg-base,#181a20);font-size:12px}
.dsh-wt_application>.dsh-wt_appHint{padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#303640)}
.dsh-wt_application>.dsh-wt_paneFrame{flex:1;min-height:0}
.dsh-wt_appToolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#303640)}
.dsh-wt_appToolbar>span{flex:1;min-width:110px}.dsh-wt_appToolbar a{color:var(--dsw-alias-link,#91b4ff);text-decoration:underline}
.dsh-wt_appDetails{display:flex;flex-direction:column;gap:10px;min-width:180px;max-width:320px;padding:10px;border:1px solid var(--dsw-alias-border-l2,#414754);border-radius:6px}.dsh-wt_appDetails small{overflow-wrap:anywhere}
.dsh-wt_appBackdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:20px;pointer-events:auto}
.dsh-wt_appDialog{width:min(460px,100%);max-height:80vh;overflow:auto;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#565c68);box-shadow:0 16px 60px rgba(0,0,0,.3)}
`
