# 08: 布局拖拽与记忆

**What to build:** 目录、笔记、对话三栏都能收起和恢复，栏与栏之间的分隔条可以拖动改变宽度；关掉学习空间再回来，布局和上次一样。窄窗口下不横向滚动，一次显示一个区。

**Blocked by:** 02 目录与讲义阅读、03 笔记编辑与冲突

**Status:** complete

- [x] 目录、笔记、对话各自可收起，收起后出现明确的恢复入口。
- [x] 拖动分隔条改变相邻栏宽度；讲义有最小宽度，不会被挤到不可读。
- [x] 重新打开同一学习空间恢复宽度与可见性；不同空间互不影响。
- [x] 窄屏下改为分区切换而不是横向滚动，默认显示讲义。
- [x] 键盘可以完成收起、恢复和切换分区。
- [x] 收起或调整布局不触发模型请求，也不打断正在进行的会话。

## Evidence

提交 `feat(learning-classroom): ticket 08 resizable collapsible classroom layout`（分支 `ticket/08-layout`，提交前已 `git merge --no-edit feature/learning-classroom` 吸收 05 内嵌会话）。`pnpm test` 97/97 通过，`pnpm run check` 与 `pnpm run build` 通过。

- 布局归一化、越界宽度截断、可见区与相邻分隔条推导、拖动/收起的纯逻辑、按容器宽度判定窄屏并从讲义开始：`tests/layout-unit.test.mjs`
- 插件状态按学习空间保存布局、`layout-schema` 严格字段校验、旧状态缺 `layout` 补默认值且不破坏已有空间、跨重启恢复与空间隔离、非法载荷拒绝：`tests/host-layout.test.mjs`
- jsdom 客户端：三栏收起与带无障碍名称的恢复入口、收起只写一次布局且不重读讲义/笔记、拖动与方向键（Shift 加速）调宽、窄容器一次一区并默认讲义、分区切换不写布局、按空间写入布局载荷：`tests/client-layout.test.mjs`
- 与 05 内嵌会话合并：对话区挂载 `TeacherSessionZone`，收起和窄屏切换只用 CSS 隐藏、不卸载，笔记编辑器和对话节点在收起前后保持同一实例（`tests/client-layout.test.mjs`；`tests/client-session.test.mjs` 仍全绿）。
- 真实浏览器（本地静态 harness，非宿主安装）复核：宽容器为 `200px 6px 688px 6px 220px 6px 240px`，拖动后目录 276px，收起笔记后分隔条变为「课程目录|讲义」「讲义|老师对话」；容器 700px 时单列 666px、无横向溢出、默认显示讲义，切到笔记不写布局；380px 时同样无横向溢出。

未覆盖：宿主真实侧栏里的拖拽手感与像素级窄屏观感（09 真实浏览器验收）；`ResizeObserver` 的宿主侧尺寸变化以注入宽度与 jsdom/静态 harness 模拟覆盖。
