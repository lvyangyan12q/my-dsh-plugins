# Application templates based on the worktable reference

Reference reviewed on 2026-10-03:
- [Project and layout chooser](https://github.com/Aisland-SJL/dsh-worktable/blob/main/01_content/src/client/index.tsx): layout definitions and small pane thumbnails before creating the project.
- [Shared page skeleton](https://github.com/Aisland-SJL/dsh-worktable/blob/main/01_content/template/dshell.html): reusable headings, cards, statistics, lists, details and primary/secondary actions.

Our implementation borrows those interaction and component principles. It keeps the platform's existing data-only recipes, registered module renderers, owned data connections and independent Agent/Skills management. It does not introduce the upstream's arbitrary HTML generation, file windows, terminals or eight-pane split engine in this iteration.

## Minimal implemented flow

1. Choose an illustrated layout: grid overview, list/detail split, or vertical page.
2. Click Create draft. Grid/vertical start with statistics and a list; split starts with filter, list and detail. The draft has a new app identity and no data connections or roles.
3. Edit names/pages; connect registered owned data; bind optional managed roles and tasks.
4. Save, preview and explicitly activate using the existing validated workflow.

Installed application templates remain a separate catalogue: their existing create callbacks and ownership rules are unchanged. A plugin template may initialize its own example data; generic layout selection does not. The reading template remains accessible when editing via a collapsed catalogue.

All builtin display modules use one scoped skin. In split pages, filtering and statistics span the upper row, leaving list/detail side by side; grid and vertical layouts retain their own structure. Native DSH menus and conversation controls keep their existing styling. Custom plugin modules retain their own card styles.

## Verification

- Actual built recipe editor regression verifies selecting the split thumbnail produces filter/list/detail, an empty connection list and no role, with no generation/save/activation request.
- Formal Browser verified template selection and the created draft on 3082. The installed reading application verified filters, statistics, record selection and detail rendering without calling a model or altering stored records.
- All three plugins' Host/Client builds, declarations and source consumers passed; 212 platform tests passed.
