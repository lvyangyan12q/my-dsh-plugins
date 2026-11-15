# 学习课堂 0.2.2-rc.3 验收增量（2026-11-14）

本轮在隔离宿主上继续 G01—G14 验收，发现并修复一个阻断性兼容问题。正式 3080 未被读取、安装或重启。

## 环境与身份

- 宿主：`D:/programming/workspace/deepseek-harness`，`pnpm dsh`（dev CLI）版本 `0.2.2-rc.3`，HEAD `39163dd30f`。宿主构建 `pnpm run build` 退出 0（10 个 gate 全过）。
- 插件：`plugins/learning-classroom`，`@deepseek-ai/dsh-learning-classroom@0.1.0`，提交 `fcfadde`。
- 准确包：`.research/lc-b2-01-runtime/archives/learning-classroom-rc3fix-fe754512.tgz`，234560 字节，SHA256 `fe7545129acd193285b87b638b9e72bdee3b34661fb6412f048b80f50e24f4a0`。
- 安装后实测：`lib/client.js` SHA256 `9b2b78512375ea3b1506da78a8e35dad72a981203ea0f3ce1be32ff31bde8b4b`（与旧包相同，客户端未改）；`lib/index.js` SHA256 `f22b0ac894586e70b1a75103249c500603f196957013e5578526f4d678b4dfe6`。
- 隔离环境：`DSH_HOME=.research/lc-b2-01-runtime/home`，profile `lc-b2-01`，`127.0.0.1:3091`；正式 3080 未操作。

## 修复：rc.3 移除 `connection.requestRejection`

现象：课堂面板显示「无法读取学习课堂状态」，`GET /api/learning-classroom` 返回 500。

实测异常（仅诊断期临时注入日志，安装包随后恢复为未修改字节）：

```
TypeError: connection.requestRejection is not a function
```

随后改用 `connection.admit(req)` 又暴露：

```
Error: cannot get property "connection.authentication" without inject
```

- 0.2.2-rc.3 用 `connection.admit()` 取代了 `requestRejection`，并且 admit 通过调用 Context 解析 `connection.authentication`。
- 修复：`src/index.ts` 按宿主暴露的 seam 委派；子 Context 同时注入 `connection.authentication`。
- 依赖：`zod` 4.4.3 → 4.6.6，与宿主 `dsh-storage-domain` 的类型一致（4.4.3 缺 `validate/validateAsync`，`tsc` 失败）。

验证：

- `tsc --noEmit` 退出 0。
- `node --import tsx --test tests/*.test.mjs`：413 项，409 通过、4 跳过（需 `DSH_SOURCE`）；带 `DSH_SOURCE=deepseek-harness` 重跑跳过项，4/4 通过。合计 413/413。
- 修复后同一安装包 `GET /api/learning-classroom` 返回 200，状态为 `vault.status=ready`、两个学习空间；面板恢复完整课堂。

## 本轮实际浏览器验收

窗口：Chrome（DevTools MCP），页面 `http://127.0.0.1:3091/`。无截图：`Page.captureScreenshot` 在含长会话历史的页面超时，改以真实 DOM、网络响应和磁盘文件为证据。

| 门禁 | 实际结果 |
| --- | --- |
| G01 安装身份 | 准确包按唯一文件名安装；client/index 字节与构建一致；插件在 rc.3 激活并打开侧栏入口。正式 3080 未改。 |
| G02 空间与文件 | 「关联已有文件」列出 `学习小结.md`、`资料/同名.md`、`资料/改名资料.md`；关联后登记 `资料/改名资料.md`，点击打开 `改名资料 / 既有文件验收`，路径显示正确。 |
| G03 布局 | 1400px 窗口下课程目录/讲义/笔记/老师并排；收起笔记后仅隐藏笔记并出现「显示我的笔记」，恢复后重新显示；`恢复默认布局` 复位宽度。 |
| G04 阅读实验 | 新建含 `$...$` 与 `$$...$$` 的讲义，渲染出 2 个 KaTeX 节点（1 个 display）与 2 个 MathML；代码块存在。实验 iframe `sandbox=allow-scripts`（无同源）；似然 0.8→0.4 后读数 `0.80→0.67`（公式 `0.4/(0.4+0.2)`），参数与读数一致；「返回讲义」回到 `讲义/第一章/01-条件概率.md`。 |
| G05 笔记保存 | 编辑后状态「有未保存的修改」，保存后磁盘文件逐字一致；外部追加一行后再保存出现「保存冲突」，同时展示「我的编辑（未保存）」与「磁盘上的版本」，提供「重新加载 / 用我的覆盖」；选择覆盖后磁盘为本地内容。 |
| G06 双链批注 | 同名文件两处时提示「文件名「同名」在不同目录同名出现了 2 次；请改用 Vault 相对路径」，不猜测；`第二主题验收/讲义/第一章/01-条件概率.md#条件概率` 解析为「已确认真实文件」，插入后预览点击跳回该讲义；在第二章讲义选中原文追加到笔记，落盘为原文摘录 + `[[第二主题验收/讲义/第二章/03-独立性修订.md#事件独立与条件概率的关系]]`。Obsidian 应用未启动；同文件外部编辑由文件系统与插件重读验证。 |
| G08 真实会话 | 课堂内发送真实请求，出现「停止生成」，点击后回合以「已停止」结束、无跳转；随后真实请求调用提问工具，界面等待作答，选择 `1/13` 并提交后模型给出「你选择了 1/13，正确 ✅」并继续。审批允许/拒绝未取得：宿主沙箱准备阶段报 `SetNamedSecurityInfoW failed (Win32 5)`，命令在审批前被拦下，模型如实报告且未绕过。 |
| G10 Canvas | 既有 `脉络.canvas` 渲染文本/文件节点与「先修/组成/应用」图例；点击讲义节点切回课堂并打开 `01-条件概率`；移除文件后「刷新脉络」给出缺失路径与「重新加载脉络」，恢复文件后节点重新出现。查看过程无模型调用。 |
| G11 冷恢复 | 第二主题收起老师对话、阅读 `03-独立性修订`、笔记含批注；真实停止 3091 进程并重启后：主题、讲义、笔记、收起状态和真实会话历史（用量 10.2K–83.4K tok）全部恢复；切换「原生验收」得到其自己的 `01-样本空间`、不同笔记与未收起的对话，不串内容。 |
| G12 可操作性 | 720px：`scrollWidth=720`，无横向溢出，单区显示（讲义 688px），分区按钮可切换，`ArrowRight` 从笔记切到老师对话；1400px：讲义/笔记/老师并排，分隔条聚焦后 `ArrowRight` 把目录宽 200→216。 |
| G14 学习接续 | 第二主题的小结、我的推导标题与正文、下一步在重启后仍可见；小结文件缺失时给出「编辑并保存会重新创建」的可操作提示。 |

未在本轮重跑：G07 提问上下文的真实发送、G09 生成/跨主题负例、G13 原生打开的实际 POST。原因：这些已有 2026-11-12/13 的实页回执（`.research/learning-classroom-b-v2/`），本轮不重复调用模型；它们的依赖（同一安装包、同一 Session、同一文件路径）未变化。G13 的「用系统默认应用打开画布」按钮仍存在。

## 未通过 / 边界

- 审批允许/拒绝：宿主机 Windows ACL 无法在沙箱准备阶段授予工作区权限（`SetNamedSecurityInfoW Win32 5`），命令未执行，审批 UI 未出现。这是宿主环境问题，不计为插件通过或失败。
- 截图：`Page.captureScreenshot` 超时，本轮无新截图；历史截图仍在。
- 正式 profile 的 rc.1 插件在 rc.3 下被禁用（persona、skill-filesystem、tool-skill、tool-ask-user 行；`dsh-tool-kaogong` bundle 被跳过）。正式实例现在可以启动，但插件功能不完整。2026-11-15 已由考公插件 `0.4.1-rc.3.1` 的可选依赖把上述包升到 rc.3 并重新挂载，启动不再出现这些兼容性跳过；本条保留为当时的现场。
- v2 十张增量工单目录（`.worktrees/learning-classroom/.scratch/learning-classroom-b-v2/`）随工作树清理丢失：`.scratch` 被 gitignore，不在未跟踪备份范围内。规格与回执保留，ticket10 报告需据本文件重建。
