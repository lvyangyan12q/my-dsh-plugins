---
id: harness-rc3-production-caret
title: 生产画布标注的公开光标插入
parent: harness-rc3-rich-input
status: in-progress
implementation_status: implemented-development-verified
acceptance_status: pending-final-package-attachments-ime
blocked_by: []
target: 0.2.1-rc.3
---

## 已批准的操作

用户于 2026-10-24 选择“光标处插入，可独立撤销”。本票接入生产画布，不合并诊断原型，不修改原生或冻结包，不关闭 HU03。

开始标注时，透明的 `conversation.input.dock` 注册提供当前原生输入的公开 `InputActions`。先固定当前 Session binding、槽挂载身份及 `captureInsertion()` 的 draftRev，把选区折叠到末端，再进入画布定位和要求编辑。确认时固定画布目标照常重验，并且仅在同一 Session、binding、槽与 revision 上调用一次公开 `insertText`。不替换选中文字，不自动发送。成功才清要求并请求原生焦点；过期、拒绝或异常保留要求及目标，提示返回原会话重新开始。公开调用抛错后也不能重试同一捕获。

生产不再调用历史 `appendHostInput`；旧兼容 helper 仍由历史兼容测试保护，它不构成新生产流程的备用通道。生产失败不会改走初始化、私有 actions、DOM 编辑、剪贴板或其他会话。

## 开发验证

测试接缝沿用已批准的原生输入公开面、画布目标与槽生命周期。`annotation-input.test.mjs` 的首个测试先因缺少新接口失败，再实现为绿；它不模拟原生撤销栈。输入/目标与历史输入测试合计 27 项通过。开发 `npm run build` 及两份 bundle 的 `node --check` 通过；没有执行 pack，也没有覆盖冻结的 Worktable.1 包。

真实验证使用未修改的 rc.3 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，仅在已有的独立 3099 home 经官方 CLI 加载本工作树开发 link。核实旧 PID 17840 后，仅重启它为 18204；原 process metadata 和日志另存保留。3097、3098、3080 未操作，模型消息发送为零。

在可丢弃原型的**准备合成混合草稿**按钮生成 command/reference/quote 及原始正文后，实际插入均走生产工作台按钮 → 画布位置 → 要求 → 确认；没有使用原型捕获或插入按钮：

- 生产插入后原文、三种 chip 保留，标注关闭，焦点回到唯一的原生编辑器；一次 Ctrl+Z 恢复逐字相同的 textContent 与 innerHTML。
- 原生编辑器 Ctrl+A 选择原文后走同一流程，插入不替换原文，一次撤销同样恢复文本与标记。
- 捕获后再次用公开准备按钮改变原生草稿 revision，确认被拒绝，标注文本和目标保留，显示过期提示。
- 用公开 sessions.create/openSession 创建并切换另一个空 Session，重新打开同一工作台，旧标注被原槽关闭/重建 guard 拒绝；返回原 Session 再开工作台，要求仍保留且原草稿未插入该要求。此路径也实际经历输入槽卸载/重建。

结果记录：[observations.json](../evidence/annotation-caret/observations.json)。截图：[旧 revision 拒绝后保留要求及错误](../evidence/annotation-caret/stale-draft-preserved.png)。截图采集接口的直接文件保存被其工作区路径规则拒绝，随后将返回的同一 PNG 字节保存至本工作树；没有改变截图内容。

## 尚未验收

同一 Session 强制换代、插件整体卸载后的 token 拒绝只由公开面测试覆盖，本次真实路径覆盖的是跨 Session 的原生槽关闭/重建。文件附件、物理中文 IME、最终归档干净安装、模型执行和完整 HU03 仍待后续。测试夹具与开发 link 验证均不替代最终包验收。

## 本地资源

仅创建本工作树 `plugins/worktable/01_content/node_modules` junction，目标是已验证的 `D:/programming/workspace/my-dsh/plugins/worktable/01_content/node_modules`。结束后若清理，只移除此 junction，保留目标依赖。3099 当前仍运行开发构建以供复核，process.private.json 记录当前 PID；未复制凭据。
