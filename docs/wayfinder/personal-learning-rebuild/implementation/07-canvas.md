# 07: 课程脉络

**What to build:** 在学习空间里切到「脉络」，看到 `脉络.canvas` 里的概念节点和它们之间的有向关系；点击某个节点能直接打开对应的讲义或笔记。插件内不编辑画布，需要改结构时给出在 Obsidian 中打开的方式与文件路径。

**Blocked by:** 02 目录与讲义阅读

**Status:** complete

- [x] 渲染 JSON Canvas 的文本、文件、链接与分组节点，以及带标签的有向边。
- [x] 点击文件节点打开对应讲义或笔记；目标不存在时给出明确提示。
- [x] 画布文件缺失或格式非法时显示错误，不渲染半张图。
- [x] 关系类型（先修、组成、应用）在界面上可区分。
- [x] 插件内没有加节点或连线的编辑入口；提供「在 Obsidian 中打开」与文件路径提示。
- [x] 脉络视图与讲义、笔记选择互不覆盖，切换回来后状态保留。

## Evidence

提交 `feat(learning-classroom): ticket 07 read-only knowledge canvas`（分支 `ticket/07-canvas`，并入 `feature/learning-classroom` 的 `fa377f7`，其中包含 03 笔记编辑）。插件目录内 `pnpm test` 88/88 通过，`pnpm run build` 与 `pnpm run check` 通过。

- 纯逻辑解析与校验、关系语义、目标分类、链接协议白名单：`tests/canvas-unit.test.mjs`
  - 合法画布解析文本/文件/链接/分组节点、边标签、包围盒；未知节点类型、缺失必需字段、非有限坐标、非正尺寸、重复 id、悬空边引用、未知箭头/边方向枚举都会让整张画布失败且不产出节点。
  - 关系按边 label 归一为 `prerequisite / composition / application / related`，无法识别的标签不会被猜成先修。
  - 知识关系不是有向无环图：三节点环正常解析；自引用边解析为 `selfLoop`，界面渲染成显式的「自引用」环而不是零长度箭头。
  - 文件节点只接受本空间 `讲义/*.md|html` 与 `笔记/*.md`；`..`、盘符、附件与嵌套路径返回 `null`，交给 Host 说明原因。
- 真实临时目录上的 Host seam：`tests/host-canvas.test.mjs`
  - 读取真实 `脉络.canvas`，四种节点与带标签有向边进入响应；文件节点解析出 `ok` 的讲义/笔记目标（含空间相对路径与知识库相对路径）。
  - 越界路径、绝对路径、缺失文件、非讲义/笔记目标逐节点标记 `outside / missing / unsupported`，不拖垮整张图。
  - 画布缺失（409 `canvas-missing`）、非法 JSON、未知节点类型、缺失字段、悬空边引用、非法尺寸（400 `canvas-invalid`）整体报错，响应没有部分节点；过大文件 413 `canvas-too-large`。
  - 未知字段、未知空间沿用同一 HTTP 边界；画布正文不进入插件状态。
- 客户端 jsdom seam：`tests/client-canvas.test.mjs`
  - 「课堂 / 脉络」切换、四种节点与分组标签、四条边的 `data-relation` 与自引用标记、关系图例。
  - 点击讲义节点调用 `lecture-read` 切回课堂并定位到该节；点击笔记节点切回课堂并在「我的笔记」编辑器里打开对应文件（`note-read` 的是画布指定的那本，不是默认笔记）；目标不可打开时显示 Host 的逐节点提示且不打开任何目标。
  - 缺失/非法画布显示可理解错误、不渲染节点与边、可重新加载；画布视图不出现添加/新建/编辑按钮，始终显示路径与「在 Obsidian 中打开」。
  - 课堂切到脉络再切回，原讲义与选中状态不变，也不重复读取。

跨票 seam：为让脉络打开目标而不复制阅读器，`lecture-zone.tsx` 与 `notes-zone.tsx` 各增加一个可选的 `openRequest` 属性（token 变化时打开指定路径），`classroom-panel.tsx` 只增加视图切换、状态传递与两处挂载；编辑/保存仍完全属于讲义与笔记区。

未覆盖与限制：`脉络.canvas` 的文件节点按 JSON Canvas/Obsidian 约定使用知识库相对路径，同时兼容空间相对写法；渲染时始终显示方向箭头，`fromEnd/toEnd` 只做枚举校验，不额外改变箭头样式。画布布局按文件里的坐标绝对定位，不自动避让重叠节点；缩放/平移是只读浏览，不写回画布。
