/** Platform navigation styles and the explicitly requested upstream Worktable labels. */
export const sidebarCoexistenceStyles=`
.pwb-sidebar-navigation{flex-shrink:0;box-sizing:border-box}
.pwb-sidebar-origin{margin-left:8px;font-size:10px;font-weight:400;color:var(--dsw-alias-label-tertiary,#777);white-space:nowrap}
.dsh-wt_section{min-width:0;max-width:100%;flex:1 1 0%;box-sizing:border-box}
.dsh-wt_section .dsh-wt_title{white-space:nowrap}
.dsh-wt_section .dsh-wt_title::after{content:' · Worktable';font-size:10px;font-weight:400;letter-spacing:0}
`
