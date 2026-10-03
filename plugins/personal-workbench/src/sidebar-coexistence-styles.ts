/** The native footer is an action row. A full-width application menu owns a
 * column there, including other installed occupants, without replacing the slot.
 * Target the stable CSS-module local name rather than one build's hash. */
export const sidebarCoexistenceStyles=`
[class*="_footerActions"]:has(.pwb-sidebar-navigation){flex-direction:column;align-items:stretch;gap:8px}
.pwb-sidebar-navigation{flex-shrink:0;box-sizing:border-box}
.pwb-sidebar-origin{margin-left:8px;font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary,#777);white-space:nowrap}
[class*="_footerActions"]:has(.pwb-sidebar-navigation) .dsh-wt_section{min-width:0;flex-shrink:0}
[class*="_footerActions"]:has(.pwb-sidebar-navigation) .dsh-wt_title{white-space:nowrap}
[class*="_footerActions"]:has(.pwb-sidebar-navigation) .dsh-wt_title::after{content:' · Worktable';font-size:10px;font-weight:400;letter-spacing:0}
`
