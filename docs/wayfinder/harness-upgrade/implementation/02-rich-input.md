---
id: harness-rc3-rich-input
title: rc.3 原生富文本草稿追加适配
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: null
blocked_by: []
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

## Scope

实现 [框架规格 HU03](../../worktable-platform/framework-spec.md#host-upgrade-requirements) 的输入桥接切片，不关闭 HU03 整体验收。代码基线 `a81ac773fd2599744085ffd098cc32d3f4418e2c`；宿主只读固定提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。

公开接缝沿用已确认的原生输入适配边界：`appendHostInput` → `conversation.input.requestDraftInitialization` 与当前 retained Session binding。rc.3 的 InputState 只提供 reference occurrences，不能从它推算包含 command/quote 的完整检测坐标。改为交由原生公开的 `whenDraftExists: 'append'` 保留原文档结构、附件归属和原生历史语义。

只向当前主会话的相同 ID binding 发一次请求。缺 binding、错 ID、宿主拒绝/保留/未知结果或异常均返回失败，不再走旧 span 路径或任意 textarea，不发送消息。只有成功追加才请求原生焦点；焦点失败不重试追加。没有该公开初始化入口的旧宿主保留原兼容分支，不据此声明新包支持旧版本。

## Evidence · 2026-10-24

- Red：新增混合 command/reference/quote 用例，原代码实际调用 span 插入，期望公开 append 请求，用例失败（旧 15 项通过，新 1 项失败）。
- Green：宿主公开 face 适配后，同一测试通过；补充 blocked/preserved/unknown/throw、缺失及异会话 binding、焦点失败、空草稿和提交锁定场景。
- `node --test plugins/worktable/04_test/host-input.test.mjs plugins/worktable/04_test/annotation-target.test.mjs`：22/22 通过；`git diff --check` 通过。测试评估真实编译后的插件输入函数，对宿主公开服务使用边界替身；没有把替身行为当作原生编辑器通过。
- 测试依赖来自现有产品 Worktable `01_content/node_modules`，仅通过临时实施检出目录内的 junction 只读复用。未安装或修改宿主依赖、正式 profile 或材料。

## Remaining acceptance

- [ ] 最终包在隔离 rc.3 实例中验证真实 plain/reference/command/quote 及混合草稿、附件、焦点、撤销、切换实例和失效绑定。
- [ ] rc.3 的 `appendDraft` 明确使用 `HISTORY_MERGE_TAG`，保留宿主历史合并语义；不能宣称“一次撤销仅移除标注”。真实撤销行为须单独记录，若要求独立 undo 边界，需要公开接口支持或用户明确确定边界，禁止私改 Lexical。
- [ ] 新宿主中文输入法物理输入验收。旧版本人工 IME 结果不能替代本次验收。
- [ ] 完整原生对话、轨迹、问题/审批和 Stop 的 HU03 联合验收，由后续安装闭环完成。

本票保持 open，直到实际安装原生验证完成；源码及单元回归通过不构成完整 HU03 完成。


## 3097 开发检出点测

2026-10-24：在官方 rc.3 的独立 home 中通过 CLI 注册集成开发检出，实际创建项目并连续两次标注。两条标注均进入同一原生草稿，首条保留、焦点正确、没有发送。一次 Ctrl+Z 没有可见变化，撤销仍为未通过。此次不是最终包验收，混合 chip、附件、跨实例、物理 IME 及完整原生执行仍待验。组合回归 304 项中 302 通过、2 个旧 rc.2 环境检查跳过。
