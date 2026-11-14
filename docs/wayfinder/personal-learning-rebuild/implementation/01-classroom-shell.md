# 01: 课堂骨架与知识库

**What to build:** 安装并启用「学习课堂」后，从侧栏打开主面板；第一次使用时选择一个本地目录作为知识文件库，然后创建一个学习空间，磁盘上出现该空间的文件夹和默认笔记；关闭再打开，学习空间还在。主面板此时呈现四区骨架（目录、讲义、笔记、对话），对话区是明确的未连接占位。

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] 启用后侧栏出现「学习课堂」，主面板可打开；未选知识库时显示可操作空状态而不是报错。
- [x] 可以把一个已存在目录设为知识文件库，路径被保存，重启宿主后仍保留。
- [x] 创建学习空间会在知识库根下建立同名文件夹（讲义、笔记、附件），并写入一个默认笔记文件。
- [x] 拒绝不存在、不可写、或越出知识库根的路径，并说明原因。
- [x] 主面板呈现四区骨架；对话区显示未连接占位，不伪造聊天。
- [x] 学习空间列表与当前选择跨重启保留；插件状态是新的存储身份，不读写旧个人学习域。

## Evidence

提交 `c5178c8`。`pnpm test` 25/25 通过，`pnpm run build` 通过，`lib/client.js` 以 `@deepseek-ai/dsh-learning-classroom` 注册到模块加载器。

- 侧栏/主面板注册、bundle 产物：`client-panel.test.mjs`、`client-artifact.test.mjs`
- 知识库选择、跨重启保留、越界拒绝（含 junction）：`host-vault.test.mjs`、`vault-paths.test.mjs`
- 空间落盘、默认笔记、写失败回滚、幂等：`host-space.test.mjs`
- 新存储身份、不碰旧域：`storage-identity.test.mjs`
- HTTP 边界（未知 action/字段、非 JSON、方法、同源）：`host-http.test.mjs`

未覆盖：真实 DSH 宿主安装与浏览器验收（属 09）；真实 ACL 拒绝只由注入 probe 覆盖；知识库选择暂为路径输入，未接原生目录选择器。
