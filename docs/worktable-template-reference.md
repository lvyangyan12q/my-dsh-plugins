# Application templates based on the worktable reference

Reference reviewed on 2026-10-03:
- [Project and layout chooser](https://github.com/Aisland-SJL/dsh-worktable/blob/main/01_content/src/client/index.tsx): layout definitions and small pane thumbnails before creating the project.
- [Shared page skeleton](https://github.com/Aisland-SJL/dsh-worktable/blob/main/01_content/template/dshell.html): reusable headings, cards, statistics, lists, details and primary/secondary actions.

Our implementation borrows those interaction and component principles. It keeps the platform's existing data-only recipes, registered module renderers, owned data connections and independent Agent/Skills management. It now supports website, animation, workspace resources and custom HTML content, including native DSH generation. It does not copy the upstream's private split engine or change native DSH navigation.

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

## Independent pane content (2026-10-03)

Reference read from the user's local checkout: \01_content/src/client/split.tsx (PanePicker, BrowserPane, AnimPane, ExplorerPane, CustomPane) and \01_content/src/client/index.tsx (buildWindowTaskText, createCustomSession, sendCustomToSession). Layout and content are separate; each page can mix multiple instances of all builtin types.

- The first recipe step adds, removes and configures individual modules: statistics, lists, detail, filters, websites, custom pages, native DSH conversations, animations and resources. Existing recipes retain their module identities.
- Websites and animations accept HTTP(S) addresses and show an embedded pane plus a separate-open link. Sites may restrict embedding; the module does not proxy or weaken site restrictions.
- Resources browse a Host-owned application-instance workspace, optionally under a configured relative subdirectory. Directory navigation and previews are read-only. HTML, text/code and common images are supported up to 2 MB; directory lists are capped at 500. Paths are checked after realpath resolution, including junction escapes.
- Custom pages support an existing URL, a workspace-relative HTML file, or a described requirement sent to a declared role. Generated/manual HTML uses an opaque-origin sandbox with scripts enabled; it cannot access the parent DSH UI or its storage. Local HTML should be self-contained (inline CSS/JS or absolute external assets); workspace-relative companion assets are not served in this slice.
- Native DSH generation is explicit: prepare the task, review/edit it, and send through the existing task/role bridge. The native conversation, model, tool and approval surfaces remain available. This is separate from the tools-denied JSON application-recipe generator.
- Output goes into \.my-dsh/widgets/<app-instance-module-hash>/<request-UUID>.html under the same trusted workspace used by the role. The durable Host registry only accepts the latest requested file for that module. Old outputs cannot fill other panes, instances, or a changed module. Unrelated recipe edits retain an unchanged module's output. Before sending, an obsolete generation target is rejected. The page automatically refreshes the registered result.
- Preview remains inert: it does not read files, load embedded sites, create sessions or submit model requests.

### Verification

- Clean Host/Client builds, declarations and installed source consumers passed for all three plugins. Full platform suite: 220/220. New tests cover pane/instance isolation, late outputs, recipe changes, real persistence reopen, auth/method rejection, directory traversal, Windows junctions, file limits, inert previews, independent content selection, exact prepared output targets, stale-send rejection and HTML mounting.
- Formal Browser on 3082: created a mixed-content app via the editor, saved/previewed/activated it, then sent a minimal timer task to a new standard DSH role. The model wrote the registered HTML and it appeared automatically; start/pause worked. Restart restored the generated page. Changing other modules retained that output. Existing-file mode loaded the same HTML separately.
- A temporary local fixture on 3085 verified website-button interaction and a running CSS animation; resource navigation used the real trusted workspace. The fixture is stopped after verification and its synthetic app is disabled rather than deleting its session/history or artifacts. Native DSH menus and existing learning records were not edited.
