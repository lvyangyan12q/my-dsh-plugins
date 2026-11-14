# 02: 目录与讲义阅读

**What to build:** 打开学习空间后，左侧目录列出该空间 `讲义` 文件夹里的课程文件；点击一个 Markdown 讲义，右侧以排好版的阅读视图呈现标题、列表、表格、代码和引用。关掉再回来，仍停在上一节讲义。

**Blocked by:** 01 课堂骨架与知识库

**Status:** complete

- [x] 目录由 `讲义` 目录下的文件推导，按文件名排序；文件头 `order` 与 `title` 可覆盖顺序和显示名。
- [x] 点击讲义渲染为可读排版；无法识别的结构降级为纯文本而不是空白。
- [x] 当前讲义选择被保存，重新打开学习空间回到该讲义。
- [x] 讲义被外部删除或改名时提示，并回到可操作状态。
- [x] 空间里还没有讲义时显示空状态和下一步提示。
- [x] 讲义切换不丢失笔记区与对话区的状态。

## Evidence

提交 `feat(learning-classroom): ticket 02 lecture directory and reading`（分支 `ticket/02-lecture-reading`，已并入 `feature/learning-classroom` 的 `607cfb4`）。`pnpm test` 48/48 通过，`pnpm run check` 与 `pnpm run build` 通过。

- 目录推导、排序、`order`/`title` 覆盖、不落清单文件、HTML 只登记目录：`tests/host-lectures.test.mjs`、`tests/lectures-unit.test.mjs`
- 讲义正文读取、选择写入插件状态、跨重启恢复、外部删除后清空选择并给出缺失提示：`tests/host-lectures.test.mjs`
- 客户端目录渲染、选中讲义、空状态、恢复上次讲义、删除提示与「重新加载目录」、HTML 占位、原始 HTML 不进入 DOM、切换讲义不重挂笔记区/对话区：`tests/client-lectures.test.mjs`
- Markdown 块解析（标题、列表、表格、代码、引用）与未知结构降级、行内链接安全：`tests/markdown-unit.test.mjs`

未覆盖：HTML 动态实验的隔离渲染（06）；双链点击与选段批注（04）；真实浏览器验收（09）。状态中新增的 `lecturePath` 为向后兼容的可选字段，仍属 `learning_classroom` v1。
