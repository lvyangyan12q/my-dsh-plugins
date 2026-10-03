/** Scoped to the prepared editor; native conversation controls retain their own styling. */
export const taskStyles = `
.pwb-prepared-task{box-sizing:border-box;min-inline-size:0;min-width:0;min-height:0;max-height:100%;width:100%;margin:0;padding:10px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:8px;background:var(--pwb-paper,#fdfcf9);color:var(--pwb-ink,#2e2b26);font:13px/1.5 system-ui,sans-serif}
.pwb-prepared-task legend{padding:0 5px;font-weight:600;font-size:13px}
.pwb-task-body{min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding-right:3px}
.pwb-task-meta{display:grid;gap:4px;color:var(--pwb-muted,#736c62);font-size:12px;overflow-wrap:anywhere}
.pwb-task-meta p{margin:0}
.pwb-task-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-weight:500}
.pwb-prepared-task textarea{box-sizing:border-box;display:block;width:100%;max-width:100%;min-height:82px;margin:0;padding:9px 10px;border:1px solid var(--pwb-line,#d7d0c5);border-radius:6px;background:var(--pwb-canvas,#f7f5f0);color:inherit;font:400 13px/1.6 system-ui,sans-serif;resize:vertical}
.pwb-prepared-task textarea:focus-visible{outline:2px solid var(--pwb-accent,#a44c32);outline-offset:1px}
.pwb-task-context{display:flex;flex-direction:column;gap:7px;padding-top:10px;border-top:1px solid var(--pwb-line,#d7d0c5);min-width:0}
.pwb-task-context-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.pwb-task-context-title{min-width:0;overflow-wrap:anywhere}
.pwb-task-context-title strong{display:block;font-weight:500}
.pwb-task-context-title small{display:block;color:var(--pwb-muted,#736c62);font-size:11px}
.pwb-task-context-header button{flex-shrink:0}
.pwb-task-actions{display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0;padding-top:8px;border-top:1px solid var(--pwb-line,#d7d0c5)}
.pwb-task-error{margin:0;overflow-wrap:anywhere;color:#a13c32}
`
