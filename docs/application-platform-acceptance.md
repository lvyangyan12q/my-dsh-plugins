# Application platform acceptance evidence

Date: 2026-10-03. Execution environment: Node 25.2.0, pnpm 11.7.0; Node 22 execution was not tested. Scope: application-platform tickets 01–07, independent Reading application and existing Kaogong integration. This evidence does not mark the older ticket11 acceptance complete.

## Reproducible package and runtime checks

With `DSH_SOURCE` pointing to an already-built official DSH `0.2.0-rc.2` checkout:

```powershell
node scripts/build-release.mjs
node scripts/check-platform-tests.mjs
node scripts/check-platform-release.mjs
```

The build passes for Workbench, Kaogong and Reading: clean Host/Client artifacts, Workbench/Kaogong declarations, source checks and public consumer contracts. The full runner passes **211 tests, 0 failures, 0 skipped**. It uses actual shared source implementation for JSX integration; its scratch-only bridge is separate from installed-consumer proof. Native Session Controller/Agent Loop/Skill/preset integration uses the official MockAdapter and synthetic domains. These tests do not contact DeepSeek.

The release runner passes through the **official CLI installing all three exact archives** in an owned synthetic offline profile. Every installed archive file matches the built candidate. All three manifests pass official runtime compatibility with **zero exemptions** and ordinary peer policy. Root and Client declarations compile from installed product packages with no source/path remapping; Reading's installed JS Host and Client exports are consumed separately. Runtime dependency links use existing public built packages, so this is exact product installation proof rather than a fresh registry dependency-resolution test.

Authenticated HTTP checks reject missing credentials and foreign origins. Reading starts without implicitly seeded records, explicitly initializes three public synthetic records (210 minutes), and isolates an empty second instance. Preview cannot initialize data. Saving/previewing a draft leaves it inactive; explicit activation publishes version 1. Unknown-module version 2 fails preview and activation while retaining running version 1. Cold restart retains the invalid draft, prior running version, exact own data and disabled flag. Re-enabling retains data; official Reading removal/reinstallation and another Host startup retain the running version and re-enabled state. Release checks make **zero model calls**. Only temporary owned Hosts are started.

Actual archive checks exclude private material, environment files, caches, source/tests and maps. Public examples and teaching assets remain distributable. Each run leaves an ignored `.scratch/platform-release-*/verdict.json` with archive hashes and an ignored `.scratch/platform-tests-*/tests.log`; synthetic profiles never copy the user's real profile.

## Formal Browser observations

The formal configured instance retains native workspace/conversation navigation, Skill center, plugin management and automation navigation. Existing Kaogong still reports 3,994 bank questions, 72 material entries and 8 historical learning entries. App-center disable/re-enable persists and restores its launcher. User material content and local paths are excluded from this repository evidence.

Ordinary recipe form: save → preview → explicit activate → open → process restart recovers the running version. A later invalid unregistered-module draft refuses preview and leaves the old running version. Reading template: preview shows 3/210/70 count/total/average; Science filter shows 1/60/60; selecting Origin of Species shows matching detail. Explicit activation creates an independently usable running application; disable/re-enable retains selection and data. Independent instance separation is covered by the installed synthetic profile and Client/native tests. Preview and display produce no role/model request.

Reading role handoff: an installed reusable Agent appears by name while the recipe stores its exact native preset ID. Two pages share a stable role. Preparing selected Origin of Species captures actual selected record and scope; editing the public synthetic record chunk and removing scope stays visible across both pages. **One explicit send completed through configured DeepSeek V4.1 Flash**, showing one native user prompt and response (one round/one step, approximately four seconds). Returning to the other page shows the same history and no restored removed scope. A fresh final-process restart restores that same reading prompt, answer and composer on the first open without retry or a substitute Session. This is real provider evidence, separate from MockAdapter tests.

Kaogong shared modules retain subject filtering, search, list/statistics, full selected-document markdown and historical image associations. Teaching preparation captures visible material and goal chunks without creating a teacher Session; editable/removable context remains explicit. Formal Kaogong teaching also completed through DeepSeek V4.1 Flash: the user explicitly removed every learning-material/goal context chunk, entered a synthetic acknowledgment task, and sent to the subject teacher. The native prompt contained its controlled teaching Skill, the synthetic task and an empty context array; its approximately two-second, one-round/one-step response acknowledged the handoff. HMR/reopening retained the same history. Deterministic tests separately cover exact subject-teacher sending, once-only review admission and native failure recovery. The latest formal preservation check passed all five authenticated HTTP routes, retained the 3,994/72/8 counts and old IDs, matched the historical 78,651-byte PNG, and found all four original learning-domain SHA-256 hashes unchanged. Its private local storage paths and backup records are kept outside Git.

## Configured-provider recipe generation

The final formal Browser gate passes on the integrated native parser/hydration fixes. An actual DeepSeek turn generated a validated **version 3 draft at revision 6**, while running version 2 stayed intact. The ordinary description form remained editable; saving it produced revision 7. Preview rendered the generated split layout and four display modules with 3/210/70 count/total/average, Science filtering to 1/60/60 and selected Origin of Species detail. Role-chat preview explicitly created no Session. Explicit activation produced revision 8/running version 3. The live application retained all three owned records and the prior native role history; its unfiltered 3/210/70 state remained independent of preview. Refresh recovered version 3, enabled Kaogong and the disabled test application.

Earlier tool-inventory and native reasoning-block parser failures left draft revision and running version unchanged. The final parser accepts native thinking/reasoning plus completed recipe text while still rejecting executable/tool output and incomplete/invalid JSON. Native MockAdapter tests separately cover failure, cancellation and CAS boundaries. All formal model inputs used public synthetic structures, example reading titles or acknowledgment tasks; no private learning material was sent. Browser screenshots and private storage-verification records stay outside Git.

Implementation acceptance is complete. The parent branch's final code review and PR disposition are handled separately; the parent specification stays open until the PR actually merges.

## Visual scope

The previously listed functional interactions are verified. Creation now has four navigable stages (name/pages, connections, roles/tasks, preview/activation), sharing one editable draft. The current Reading controls and list still use basic browser styling; grid spacing is not fully polished. The final review identified an unbounded role page that clipped the lower native conversation. The follow-up fixes give single-role pages the available width and height, bound the task editor and native chat, and retain scrolling on mixed and narrow pages. Final formal Browser verification passed at 1280 × 720 after a fresh process restart: the retained long reading context, model answer and native composer are simultaneously visible across the available width. Step 1 → 2 → Back retained an unsaved name edit; restoring the original name and proceeding through roles to preview left running version 3 unchanged. The latest authenticated preservation check again matched the four original domain hashes and historical image. No claim is made that the implementation matches prototype pixels or that all screen sizes are visually accepted.

## Limits

This release delivers installed registered modules and scalar recipes; it does not generate arbitrary plugin code, grant arbitrary cross-app data access, or provide maps/credential management. Preview is read-only for application data. Model generation creates editable drafts and never automatically activates them. Existing native history is preserved when a role's Agent changes. Broader historical ticket11 gates for live BetterSidebar visuals, same-session concurrent native turns and full sensitive parser acceptance remain documented partial in `ticket11-release-evidence.md`.

## 2026-10-03：考公独立学习窗口与控件优化

- 统计面板全宽显示，角色对话仅在应用内独立学习窗口显示；学习窗口排除统计卡片和今日计划。手动打开、课堂/讲义/练习/错题切换、关闭返回与再次打开已在正式 3082 浏览器验证。
- 窗口复用同一学习视图与角色挂载；资料搜索和科目/类型筛选、未提交答案及角色草稿保留。教学准备自动进入窗口，仍需显式发送，窗口导航不会调用模型或提交成绩。
- 搜索框、科目、资料类型及教师科目控件在 1280×720 下均为 38px 高度；筛选双列对齐，资料列表独立滚动，原生长会话输入区保持在窗口内。DSH 原生左侧菜单保留。
- 三插件构建、类型及消费检查通过；平台回归测试 212/212，通过无跳过。新增窗口导航/筛选/草稿保留与零隐式提交测试；旧分栏测试调整为显式进入学习窗口后验证角色和宽度保留。
- 页面原有的 active write handle 会话占用提示仍存在；本次仅优化显示与学习窗口，没有宣称修复该连接错误。

## 2026-10-03：按钮层级与暖色界面

自有控件统一采用共享 controlStyles，通过 data-pwb-button 与 primary 语义标记区分按钮层级，不标记原生 DSH 会话控件。新建课堂、刷新课堂补充可见文字；学习窗口、新建/保存、生成草稿、发送任务和启用应用等主要操作采用暖橙实心样式，次要操作明确描边，导航保留选中状态。考公及独立管理界面采用米白画布与深灰文字。

三插件构建、类型和消费检查通过，212/212 平台测试通过。正式 3082 浏览器验证主要/次要按钮均为 36px 高度、1px 边框，主要背景 rgb(164, 76, 50)，次要背景 rgb(253, 252, 249)。统计面板、独立学习窗口、Agent 管理页均已验证。DSH 原生左侧菜单保持原样；未发送模型请求或修改学习数据。

### Prepared teaching task layout (2026-10-03)

- Reproduced in the formal 3082 Browser: default inline labels and narrow textareas squeezed teaching instructions, evidence and the remove button together.
- Prepared tasks now use a scoped vertical form, full-width textareas, separate evidence title/source and a remove button in each evidence header. The Kaogong role label is human-readable.
- The editor is bounded to half the available role pane; its content scrolls independently while send/cancel remain visible. Native menus and native conversation styling are unchanged.
- Browser checked at 1280 × 720: editor width 370 px, textareas 340 px with 82 px minimum height, bottom actions contained within the editor; evidence remove control remains separately accessible. No teaching task was sent during this verification.
- Clean Host/Client builds, declarations and source consumers passed for all three plugins; 212/212 platform tests passed, including edit/remove-before-explicit-send behavior.
- Existing native session active-write-handle error remains a separate issue; this change does not claim to resolve it.

### Application generation and recipe editor layout (2026-10-03)

- Reproduced the unstyled generation demand textarea (small inline native control), plain draft selector and inline recipe labels in Browser on 3082.
- Added scoped generation and recipe editor cards: vertical full-width requirement field, separate action row, consistent draft selectors and recipe inputs, visible current-step treatment, evidence/data connection rows and advanced configuration spacing. Styles do not target native DSH menus or generated preview controls.
- Browser verified the requirement textarea at 867 × 140 px in the 1280 × 720 viewport, draft selection and the existing reading application's data connection step. No model generation, save or activation was performed for visual verification.
- Three clean plugin builds and all 212 platform tests passed, including generation and recipe behavior checks.

### Compact manual recipe workflow (2026-10-03)

- Follow-up Browser reproduction after creating an unsaved draft: expanded AI generation pushed application-name input to 761 px below the initial viewport and made the editor 1359 px tall.
- AI generation now collapses after choosing/creating a draft and can be reopened without generating anything. Name/version and page-name/layout use compact responsive columns; save and step navigation share a sticky bottom bar.
- Formal 1280 x 720 Browser verification: editor height 849 px, application-name input starts at 468 px, bottom action bar remains at 635–696 px. AI panel expanded and collapsed correctly; no generation/save/activation request was performed. No literal svg text was found in the editor.
- All three plugins rebuilt successfully and all 212 tests passed, including generation-to-edit-to-save-to-preview-to-activation and recipe step behavior.

### Worktable-inspired templates (2026-10-03)

- Three illustrated generic layout starters and a separate installed-template catalogue replace the undifferentiated template buttons. The existing recipe workflow remains authoritative.
- Browser confirmed choosing list/detail creates a split draft with filter/list/detail and empty data/role bindings; no draft was saved or activated.
- Builtin display modules share scoped cards, form controls, statistics and detail styles; the existing reading application's record selection still updates the detail module.
- Reference and implementation boundaries: [worktable-template-reference.md](worktable-template-reference.md).
