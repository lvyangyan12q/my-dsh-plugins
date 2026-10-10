/** Shared plugin controls. Native DSH buttons never carry this marker. */
export const controlStyles = `
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell){--pwb-canvas:#f7f5f0;--pwb-paper:#fdfcf9;--pwb-ink:#2e2b26;--pwb-muted:#736c62;--pwb-line:#d7d0c5;--pwb-accent:#a44c32;--pwb-accent-soft:#f3e5dc}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]{min-height:36px!important;min-width:36px;padding:7px 12px!important;border:1px solid var(--pwb-line)!important;border-radius:7px!important;background:var(--pwb-paper)!important;color:var(--pwb-ink)!important;font:500 13px/1.4 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif!important;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;box-shadow:0 1px 1px #2e2b2606;transition:background .15s,border-color .15s,box-shadow .15s}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]:hover:not(:disabled){background:#efeae2!important;border-color:#b7ac9b!important}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]:active:not(:disabled){background:#e7e0d5!important}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]:focus-visible{outline:2px solid var(--pwb-accent)!important;outline-offset:3px!important;box-shadow:none}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]:disabled{cursor:not-allowed!important;opacity:.48!important;box-shadow:none}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button][data-variant=primary]{background:var(--pwb-accent)!important;border-color:var(--pwb-accent)!important;color:#fffaf6!important}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button][data-variant=primary]:hover:not(:disabled){background:#893c26!important;border-color:#893c26!important}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) :is(.pwb-pages,.pwb-catalog-tabs,.kg-study-pages,nav[aria-label="学习角色"]) [data-pwb-button]{background:transparent!important;border-color:transparent!important;box-shadow:none}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) [data-pwb-button]:is([aria-pressed=true],[aria-selected=true]){background:var(--pwb-accent-soft)!important;color:#803b28!important;border-color:#d2a792!important;box-shadow:none}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) :is(.pwb-open,.pwb-role-row,.pwb-move,.pim-card)[data-pwb-button]{background:transparent!important;border-color:transparent!important;box-shadow:none}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) .pim-card[data-pwb-button][aria-pressed=true]{background:var(--pwb-accent-soft)!important;border-color:#d2a792!important}
:is(.pwb-workspace,.pwb-sidebar-catalog,.kg-study-shell) :is(.pwb-pages,.pwb-catalog-tabs,.kg-study-pages,nav[aria-label="学习角色"]) [data-pwb-button]:is([aria-pressed=true],[aria-selected=true]){background:var(--pwb-accent-soft)!important;border-color:#d2a792!important;color:#803b28!important}
`
